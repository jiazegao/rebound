/**
 * Answer checker v1: decides whether a typed answer matches a question's answer line,
 * following the NSB answer conventions (2027 rules 3-7 and Appendix A-2).
 *
 * It never guesses on near-misses: a close spelling or an equal value written in a
 * different form comes back as "review", and the player decides with one key.
 */
import { LETTERS, type Letter, type Question } from '../schema';
import { editDistance, normalizeText, samePhrase, stripPronunciation, toPlain } from './normalize';
import { parseIntegerList, parseNumber, sameValue } from './numbers';

export type Verdict = 'correct' | 'incorrect' | 'review';

export interface JudgeResult {
  verdict: Verdict;
  /** Short explanation shown to the player. */
  reason: string;
  /** The accepted answer that matched or nearly matched, if any. */
  matched?: string;
}

export type JudgeInput = Pick<Question, 'format' | 'stem' | 'answer' | 'accept' | 'reject'> &
  Partial<Pick<Question, 'answerLetter' | 'choices' | 'answerRaw' | 'notes'>>;

/** Pairs of real terms that differ by only a letter or two; never treat one as a misspelling of the other. */
const CONFUSABLE_PARTS: Array<[string, string]> = [
  ['hyper', 'hypo'], ['endo', 'exo'], ['homo', 'hetero'], ['intra', 'inter'], ['sub', 'super'], ['pre', 'post'],
  ['ana', 'cata'], ['mono', 'poly'], ['afferent', 'efferent'], ['absorption', 'adsorption'], ['ileum', 'ilium'],
  ['proton', 'photon'], ['anion', 'cation'], ['anode', 'cathode'], ['mitosis', 'meiosis'], ['fission', 'fusion'],
  ['isotope', 'isotone'], ['isotope', 'isobar'], ['haploid', 'diploid'], ['aphelion', 'perihelion'],
  ['apogee', 'perigee'], ['diastole', 'systole'], ['left', 'right'], ['north', 'south'], ['east', 'west'],
];
/** Chemistry endings where one letter changes the substance: alkane/alkene/alkyne, sulfate/sulfite, ferric/ferrous. */
const SUFFIX_FAMILIES: string[][] = [['ane', 'ene', 'yne'], ['ate', 'ite', 'ide'], ['ic', 'ous'], ['ol', 'al', 'one'], ['ose', 'ase']];

/** Molecular formulas that may stand in for a name (Rule A-2 c allows formulas when there are no isomers). */
const FORMULA_NAMES: Record<string, string[]> = {
  h2o: ['water'],
  co2: ['carbon dioxide'],
  co: ['carbon monoxide'],
  o2: ['oxygen', 'oxygen gas', 'dioxygen'],
  o3: ['ozone'],
  n2: ['nitrogen', 'nitrogen gas', 'dinitrogen'],
  h2: ['hydrogen', 'hydrogen gas', 'dihydrogen'],
  nacl: ['sodium chloride'],
  kcl: ['potassium chloride'],
  nh3: ['ammonia'],
  ch4: ['methane'],
  h2so4: ['sulfuric acid'],
  hno3: ['nitric acid'],
  naoh: ['sodium hydroxide'],
  koh: ['potassium hydroxide'],
  caco3: ['calcium carbonate'],
  no2: ['nitrogen dioxide'],
  so2: ['sulfur dioxide'],
  h2o2: ['hydrogen peroxide'],
  sio2: ['silicon dioxide', 'silica'],
};

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18',
  nineteen: '19', twenty: '20',
};

const PERSON_STEM =
  /\b(?:who|whom|whose)\b|\bwhat (?:\w+ )?(?:scientist|chemist|physicist|biologist|mathematician|astronomer|geologist|naturalist|inventor|engineer|physician|person|explorer|philosopher|physiologist|geneticist|botanist|zoologist)\b/i;
/** Parenthesised notes that are not part of the answer: "(in any order)", "(Solution: …)". */
const NOTE_PAREN = /\(\s*(?:solution|in any order|any order|either order|must|note|hint)[^)]*\)/gi;
const ORDERED_STEM = /\b(order|rank|arrange|sequence|respectively)\b/i;
const IDENTIFY_ALL_STEM = /\b(identify all|all of the following|which of the following)\b/i;

const correct = (reason = 'Correct', matched?: string): JudgeResult => ({ verdict: 'correct', reason, matched });
const incorrect = (reason: string, matched?: string): JudgeResult => ({ verdict: 'incorrect', reason, matched });
const review = (reason: string, matched?: string): JudgeResult => ({ verdict: 'review', reason, matched });

/* ---------------- answer-line handling ---------------- */

/** Alternatives are separated by an upper-case OR ("MITOCHONDRION OR MITOCHONDRIA"). Semicolons separate the parts of one answer. */
function splitAlternatives(text: string): string[] {
  return text
    .split(/\s+OR\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** The parts of a multi-part answer: "CYTOSINE; THYMINE", or "RUBIDIUM AND LITHIUM". */
function splitParts(text: string): string[] {
  let parts = text.split(/\s*;\s*/).filter(Boolean);
  if (parts.length === 1 && /\s+AND\s+/.test(text)) parts = text.split(/\s+AND\s+/).filter(Boolean);
  return parts;
}

interface Candidate {
  text: string;
  parts: string[];
}

/** Pull "(ACCEPT: …)" / "(DO NOT ACCEPT: …)" clauses out of an answer, in case the importer left any in. */
function splitAnswerText(raw: string): { main: string; accept: string[]; reject: string[] } {
  const accept: string[] = [];
  const reject: string[] = [];
  let main = raw.replace(/^\s*answer:\s*/i, '');
  main = main.replace(/\(\s*(?:do not|don['’]t)\s+accept:?\s*([^)]*)\)/gi, (_m, x: string) => {
    reject.push(...splitAlternatives(x));
    return ' ';
  });
  main = main.replace(/\(\s*(?:also\s+)?accept:?\s*([^)]*)\)/gi, (_m, x: string) => {
    accept.push(...splitAlternatives(x));
    return ' ';
  });
  return { main: main.trim(), accept, reject };
}

/** "(CHARLES) DARWIN" → ["CHARLES DARWIN", "DARWIN"]: parenthesised words are optional. */
function expandOptional(text: string): string[] {
  const groups = text.match(/\([^()]*\)/g) ?? [];
  if (groups.length === 0) return [text];
  if (groups.length > 3) return [text.replace(/[()]/g, ' ')];
  const variants = new Set<string>();
  for (let mask = 0; mask < 1 << groups.length; mask++) {
    let i = 0;
    variants.add(text.replace(/\(([^()]*)\)/g, (_m, inner: string) => ((mask >> i++) & 1 ? ` ${inner} ` : ' ')).replace(/\s+/g, ' ').trim());
  }
  return [...variants].filter(Boolean);
}

function answerCandidates(q: JudgeInput): { candidates: Candidate[]; rejects: string[]; anyOrder: boolean } {
  const anyOrder = /\b(?:any|either) order\b/i.test(`${q.answerRaw ?? ''} ${q.answer} ${(q.notes ?? []).join(' ')}`);
  const { main, accept, reject } = splitAnswerText(q.answer);
  const strip = (s: string) => s.replace(NOTE_PAREN, ' ').trim();
  const sources = [strip(main), ...q.accept.map(strip), ...accept.map(strip)];
  // Keep each full answer as well as its OR-alternatives: "4 OR −2" may be read either way.
  const raw = sources.flatMap((s) => [s, ...splitAlternatives(s)]);
  const texts = [...new Set(raw.flatMap(expandOptional).map((s) => stripPronunciation(s).replace(/\s+/g, ' ').trim()).filter(Boolean))];
  const rejects = [...q.reject.flatMap(splitAlternatives), ...reject];
  return { candidates: texts.map((text) => ({ text, parts: splitParts(text) })), rejects, anyOrder };
}

/* ---------------- matching helpers ---------------- */

function wordsToDigits(s: string): string {
  return NUMBER_WORDS[s] ?? s;
}

/** Exact match after normalising, allowing plural/singular differences and formula ↔ name. */
function textMatches(response: string, candidate: string): boolean {
  const r = wordsToDigits(normalizeText(response));
  const c = wordsToDigits(normalizeText(candidate));
  if (!r || !c) return false;
  if (samePhrase(r, c)) return true;
  const rf = r.replace(/\s+/g, '');
  const cf = c.replace(/\s+/g, '');
  return Boolean(FORMULA_NAMES[rf]?.includes(c) || FORMULA_NAMES[cf]?.includes(r));
}

/** Strict match used for DO NOT ACCEPT lists, which often exclude a plural or singular on purpose. */
function strictMatch(response: string, candidate: string): boolean {
  const r = normalizeText(response);
  const c = normalizeText(candidate);
  return Boolean(r && c && (r === c || r.replace(/\s+/g, '') === c.replace(/\s+/g, '')));
}

/** One part of a multi-part answer; the key part may be labelled ("LARGEST = Rb⁺") or have lower-case "or" alternatives. */
function partMatches(response: string, keyPart: string): boolean {
  const responseValue = response.includes('=') ? response.split('=').pop()!.trim() : response;
  return keyPart.split(/\s+or\s+/i).some((alt) => {
    const value = alt.includes('=') ? alt.split('=').pop()!.trim() : alt;
    if (textMatches(response, alt) || textMatches(response, value) || textMatches(responseValue, value)) return true;
    const r = parseNumber(responseValue);
    const k = parseNumber(value);
    return Boolean(r && k && !r.unsimplified && sameValue(r.value, k.value) && (!r.unit || !k.unit || r.unit === k.unit));
  });
}

function splitResponseParts(response: string): string[] {
  return response
    .split(/\s*(?:;|,(?!\d{3}\b)|\band\b|&)\s*/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

function multiPartMatches(response: string, candidate: Candidate, anyOrder: boolean): boolean {
  const given = splitResponseParts(response);
  if (given.length !== candidate.parts.length) return false;
  if (!anyOrder) return given.every((g, i) => partMatches(g, candidate.parts[i]));
  const used = new Set<number>();
  return given.every((g) => {
    const i = candidate.parts.findIndex((p, j) => !used.has(j) && partMatches(g, p));
    if (i < 0) return false;
    used.add(i);
    return true;
  });
}

function confusable(a: string, b: string): boolean {
  for (const [x, y] of CONFUSABLE_PARTS) {
    if ((a.includes(x) && a.replace(x, y) === b) || (a.includes(y) && a.replace(y, x) === b)) return true;
  }
  const ta = a.split(' ');
  const tb = b.split(' ');
  if (ta.length !== tb.length) return false;
  return ta.some((wa, i) => {
    const wb = tb[i];
    if (wa === wb) return false;
    return SUFFIX_FAMILIES.some((family) =>
      family.some((s1) => family.some((s2) => s1 !== s2 && wa.endsWith(s1) && wb.endsWith(s2) && wa.slice(0, -s1.length) === wb.slice(0, -s2.length))),
    );
  });
}

/** A near-miss: same answer apart from a small spelling slip, and not a different real term. */
function nearMiss(response: string, candidate: string): 'close' | 'confusable' | null {
  const r = normalizeText(response);
  const c = normalizeText(candidate);
  if (!r || !c || r === c) return null;
  if (confusable(r, c)) return 'confusable';
  const compactR = r.replace(/\s+/g, '');
  const compactC = c.replace(/\s+/g, '');
  if (compactC.length < 5 || /\d/.test(compactC)) return null;
  // Slips rarely change the first letter; different terms often do (genotype/phenotype).
  if (compactR[0] !== compactC[0]) return null;
  const allowed = compactC.length >= 12 ? 2 : 1;
  return editDistance(compactR, compactC, allowed) <= allowed ? 'close' : null;
}

function looksLikePerson(candidate: string, stem: string): boolean {
  const words = normalizeText(candidate).split(' ');
  return PERSON_STEM.test(stem) && words.length >= 2 && words.length <= 4 && words.every((w) => /^\p{L}[\p{L}.'-]*$/u.test(w));
}

/* ---------------- question types ---------------- */

function judgeNumeric(response: string, candidates: string[]): JudgeResult | null {
  const r = parseNumber(NUMBER_WORDS[normalizeText(response)] ?? response);
  if (!r) return null;
  let anyNumericKey = false;
  let differentForm: string | null = null;
  let wrongUnits: string | null = null;
  let unknownUnits: string | null = null;
  for (const c of candidates) {
    const k = parseNumber(c);
    if (!k) continue;
    anyNumericKey = true;
    if (!sameValue(r.value, k.value)) continue;
    if (r.unit && k.unit && r.unit !== k.unit) {
      if (r.unitKnown && k.unitKnown) wrongUnits = c;
      else unknownUnits = c;
      continue;
    }
    if (r.unsimplified) return incorrect('Right value, but not in simplest form. NSB answers must be exact and fully simplified.', c);
    const fractionLike = (kind: string) => kind === 'fraction' || kind === 'mixed';
    if (r.kind === k.kind || (fractionLike(r.kind) && fractionLike(k.kind))) return correct('Correct', c);
    differentForm = c;
  }
  if (!anyNumericKey) return null;
  if (wrongUnits) return incorrect('Right number, wrong units. Units are optional, but if you say them they must be correct.', wrongUnits);
  if (unknownUnits) return review('Right number; check that your units match the question.', unknownUnits);
  if (differentForm) {
    return review('Same value written in a different form. NSB requires the exact, simplest form the question asks for, so a judge may not accept this.', differentForm);
  }
  return null;
}

function judgeList(response: string, candidates: string[], stem: string, anyOrder: boolean): JudgeResult | null {
  const given = parseIntegerList(response);
  if (!given) return null;
  const unordered = anyOrder || (IDENTIFY_ALL_STEM.test(stem) && /\b1\)/.test(stem) && !ORDERED_STEM.test(stem));
  let anyListKey = false;
  for (const c of candidates) {
    const key = parseIntegerList(c);
    if (!key) continue;
    anyListKey = true;
    const same = unordered
      ? key.length === given.length && [...key].sort().join(',') === [...given].sort().join(',')
      : key.join(',') === given.join(',');
    if (same) return correct('Correct', c);
  }
  if (!anyListKey) return null;
  return incorrect(unordered ? 'Not the right set of choices.' : 'Not the right list. Order matters: give the answers in the order the question asks for them.');
}

function judgeMultipleChoice(q: JudgeInput, response: string): JudgeResult {
  const letter = q.answerLetter;
  const choices = q.choices;
  const plain = toPlain(response).trim();

  // The whole response is the text of a choice: exact characters first, then normalised.
  const raw = (x: string) => toPlain(x).toLowerCase().replace(/\s+/g, ' ').trim();
  if (choices) {
    for (const L of LETTERS) {
      if (raw(plain) === raw(choices[L]) || raw(plain) === raw(stripPronunciation(choices[L]))) {
        return L === letter ? correct() : incorrect(`That is choice ${L}. The answer is ${letter}) ${choices[letter!]}.`);
      }
    }
    for (const L of LETTERS) {
      if (textMatches(plain, choices[L])) {
        return L === letter ? correct() : incorrect(`That is choice ${L}. The answer is ${letter}) ${choices[letter!]}.`);
      }
    }
  } else if (!letter) {
    return textMatches(plain, q.answer) ? correct() : incorrect('Not the answer.');
  }

  // A letter, optionally followed by the choice text.
  const m = /^\(?([wxyz])\)?(?:\s*[).:,-]\s*|\s+|$)(.*)$/i.exec(plain);
  if (m && letter) {
    const given = m[1].toUpperCase() as Letter;
    const rest = m[2].trim();
    if (!rest) return given === letter ? correct() : incorrect(`The answer is ${letter}${choices ? `) ${choices[letter]}` : ''}.`);
    const textOk = choices ? textMatches(rest, choices[letter]) : textMatches(rest, q.answer);
    if (given === letter && textOk) return correct();
    if (given === letter) {
      return incorrect('The letter is right, but the words do not match it. If you give both, both must be right (Rule 3-7).');
    }
    return incorrect(`The answer is ${letter}${choices ? `) ${choices[letter]}` : ''}.`);
  }

  if (choices && letter) {
    const near = nearMiss(plain, choices[letter]);
    if (near === 'close') return review(`Close to ${letter}) ${choices[letter]}. Check your spelling.`, choices[letter]);
  }
  return incorrect('Give the letter (W, X, Y or Z) or the exact text of a choice.');
}

/** A DNA or RNA base sequence, e.g. "AUGGCU" or "5′-ATG GCA-3′" (at least four bases). */
export function isBaseSequence(text: string): boolean {
  const core = text.toUpperCase().replace(/[53]\s*[′']/g, '').replace(/[\s-]/g, '');
  return core.length >= 4 && /^[ACGTU]+$/.test(core);
}

function judgeShortAnswer(q: JudgeInput, response: string): JudgeResult {
  const { candidates, rejects, anyOrder } = answerCandidates(q);
  const texts = candidates.filter((c) => c.parts.length === 1).map((c) => c.text);
  const multi = candidates.filter((c) => c.parts.length > 1);

  for (const r of rejects) {
    // Ignore a reject entry that contradicts an accepted answer (an error in the source).
    if (strictMatch(response, r) && !candidates.some((c) => strictMatch(r, c.text))) return incorrect('That answer is specifically not accepted.', r);
  }
  for (const c of candidates) {
    if (textMatches(response, c.text)) return correct(c === candidates[0] ? 'Correct' : `Correct (accepted: ${c.text})`, c.text);
  }
  const list = judgeList(response, candidates.map((c) => c.text), q.stem, anyOrder);
  if (list) return list;
  for (const c of multi) {
    if (multiPartMatches(response, c, anyOrder)) return correct('Correct', c.text);
  }

  const numeric = judgeNumeric(response, texts);
  if (numeric) return numeric;

  // People: the last name alone is enough, but a first name, if given, must be right (Rule A-2 i).
  const r = normalizeText(response);
  for (const c of texts) {
    if (!looksLikePerson(c, q.stem)) continue;
    const words = normalizeText(c).split(' ');
    const last = words[words.length - 1];
    const given = r.split(' ');
    if (given.length === 1 && samePhrase(given[0], last)) return correct('Correct (last name is enough)', c);
    if (given.length > 1 && samePhrase(given[given.length - 1], last)) return incorrect('The last name is right, but the first name does not match.', c);
  }

  for (const c of texts) {
    const near = nearMiss(response, c);
    if (near === 'confusable') return incorrect(`Close, but that is a different term from "${c}".`, c);
    // A base sequence is not a word: one different base is a different answer, not a spelling slip.
    if (near === 'close' && isBaseSequence(c)) return incorrect('Every base in a sequence must be right.', c);
    if (near === 'close') return review(`Close to "${c}". Check your spelling.`, c);
  }
  if (multi.length > 0 && texts.length === 0) {
    const n = multi[0].parts.length;
    const given = splitResponseParts(response).length;
    if (given !== n) return incorrect(`This answer has ${n} parts${anyOrder ? ' (any order)' : ', given in the order the question asks'}.`);
    return incorrect('Not all parts are right.');
  }
  return incorrect('Not the answer.');
}

/** Check a typed answer against a question. */
export function judgeAnswer(q: JudgeInput, response: string): JudgeResult {
  if (!response.trim()) return incorrect('No answer given.');
  if (q.format === 'multiple_choice') return judgeMultipleChoice(q, response);
  return judgeShortAnswer(q, response);
}

/** All accepted answers in display form, for showing after a question. */
export function acceptedAnswers(q: JudgeInput): string[] {
  return answerCandidates(q).candidates.map((c) => c.text);
}
