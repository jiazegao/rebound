/**
 * Parser for the U.S. Department of Energy's National Science Bowl high school sample
 * question PDFs (https://science.osti.gov/wdts/nsb, "High School Sample Questions").
 *
 * Pure: no Node or DOM APIs. It takes the text lines of one round PDF (from pdfText.ts, or any
 * extractor that gives text plus page numbers) and returns a `Round` of toss-up/bonus pairs plus
 * warnings. The small helpers (`parseAnswerLine`, `mapCategory`, ...) are exported for tests.
 *
 * Formats handled (2007-2022):
 *   TOSS-UP | TOSS UP | BONUS                        question kind markers
 *   1) BIOLOGY Short Answer What is ...              Sets 1-9 (also "1. BIOLOGY ...")
 *   1) Earth and Space – Multiple Choice Which ...   en dash, 2015-2021
 *   1) Biology — Short Answer ...                    em dash, 2022
 *   W) ... X) ... Y) ... Z) ...                      multiple choice options (may wrap)
 *   ANSWER: W) BASIC   /   Answer: ... (ACCEPT: ...) (DO NOT ACCEPT: ...)
 */
import type { AnswerFormat, Letter, Question, QuestionKind, QuestionPair, Round, Subject } from '../schema';
import { normalizeMathText } from './pdfText';

export const DOE_CREDIT = 'U.S. Department of Energy, National Science Bowl sample questions (science.osti.gov/wdts/nsb)';
export const DOE_LICENSE = 'Public domain (U.S. Government work); DOE Office of Science asks to be credited and linked.';
export const DOE_HS_SAMPLE_PAGE = 'https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/HS-Sample-Questions';

const pad2 = (n: number) => String(n).padStart(2, '0');
export const doeSetId = (setNumber: number) => `doe-hs-${pad2(setNumber)}`;
export const doeRoundId = (setId: string, order: number) => `${setId}-r${pad2(order)}`;
export const doeQuestionId = (roundId: string, kind: QuestionKind, number: number) =>
  `${roundId}-${kind === 'tossup' ? 't' : 'b'}${pad2(number)}`;

/** One line of extracted text. `hints` come from pdfText.ts ('image', 'math', 'orphan-script'). */
export interface SourceLine {
  text: string;
  /** 1-based page number. */
  page: number;
  hints?: readonly string[];
}

export interface DoeRoundMeta {
  setId: string;
  roundId: string;
  /** e.g. "Round 1" (link text on the official page). */
  label: string;
  /** Position of the round within its set (1-based). */
  order: number;
  sourceUrl?: string;
  credit?: string;
}

export interface ParseWarning {
  code: string;
  message: string;
  questionId?: string;
  page?: number;
}

export interface DoeRoundResult {
  round: Round;
  warnings: ParseWarning[];
  /** Round name printed at the top of the PDF, e.g. "ROUND 17A" or "Double Elimination ~ Round 4". */
  printedLabel?: string;
  /** Lines that were not noise and not part of any question (e.g. a title). */
  strayLines: { page: number; text: string }[];
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** Normalises spacing and invisible characters of one line. */
export function cleanText(s: string): string {
  return normalizeMathText(s)
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000\t]/g, ' ')
    .replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Joins wrapped lines. A line ending in a hyphenated word continues without a space. */
export function joinLines(parts: readonly string[]): string {
  let out = '';
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    if (!out) out = t;
    else if (/\p{L}-$/u.test(out) && /^\p{L}/u.test(t)) out += t;
    else out += ' ' + t;
  }
  return out;
}

/** Older sets write pronunciations as "(read as: SU-doe-POH-dee-ah)"; newer ones as "[...]". */
export function normalizePronunciation(s: string): string {
  return s.replace(/\(\s*read\s+as\s*:\s*((?:[^()]|\([^()]*\))*)\)/gi, (_m, inner: string) => `[${inner.trim()}]`);
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

const CATEGORY_TABLE: [string, Subject][] = [
  ['BIOLOGY', 'biology'],
  ['LIFE SCIENCE', 'biology'],
  ['LIFE SCIENCES', 'biology'],
  ['CHEMISTRY', 'chemistry'],
  ['PHYSICS', 'physics'],
  ['MATH', 'math'],
  ['MATHEMATICS', 'math'],
  ['ENERGY', 'energy'],
  ['EARTH AND SPACE', 'earth_space'],
  ['EARTH AND SPACE SCIENCE', 'earth_space'],
  ['EARTH AND SPACE SCIENCES', 'earth_space'],
  ['EARTH SCIENCE', 'earth_space'],
  ['ASTRONOMY', 'earth_space'],
  ['GENERAL SCIENCE', 'general_science'],
  ['COMPUTER SCIENCE', 'computer_science'],
  ['PHYSICAL SCIENCE', 'physical_science'],
];
const CATEGORY_MAP = new Map(CATEGORY_TABLE);

const categoryKey = (printed: string) =>
  printed
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z]+/g, ' ')
    .trim();

/**
 * Maps a printed category ("EARTH SCIENCE", "Earth & Space", "Biology") to a subject.
 * Case- and whitespace-insensitive. A misspelt "EARTH ANDE SPACE" still maps to earth_space.
 */
export function mapCategory(printed: string): Subject | undefined {
  const key = categoryKey(printed);
  const exact = CATEGORY_MAP.get(key);
  if (exact) return exact;
  if (/^EARTH\b.*\bSPACE\b/.test(key)) return 'earth_space';
  return undefined;
}

const CATEGORY_START = new RegExp(
  '^(' +
    [...CATEGORY_MAP.keys()]
      .sort((a, b) => b.length - a.length)
      .map((k) => k.replace(/ AND /g, '\\s*(?:AND|&)\\s*').replace(/ /g, '\\s+'))
      .join('|') +
    ')\\b',
  'i',
);

/* ------------------------------------------------------------------ */
/* Line classification                                                 */
/* ------------------------------------------------------------------ */

const NOISE_PATTERNS: RegExp[] = [
  // separators: ~~~~, ____, *****, -----
  /^[~_*=\-–—•·.\s]{3,}$/,
  /^page\s*\d+(\s*of\s*\d+)?$/i,
  // ROUND 1 | High School Round 1 Page 2 | HIGH SCHOOL - ROUND 17A | Round Robin ~ Round 1 Page 1 | ROUND 15 Page 1
  /^(?:high\s+school\s*[-–—:]?\s*)?(?:(?:round\s+robin|double\s+elimination)\s*[~–—-]\s*)?round\s*\d+\s*[-–]?\s*[a-z]?\s*(?:page\s*\d+)?$/i,
  // 2007 Regional Science Bowl – Page 1 | 2019 Regional Science Bowl – Round 17A Page 1
  /^\d{4}\s+regional\s+science\s+bowl\s*[-–—]?\s*(?:round\s*\d+\s*[a-z]?\s*)?(?:page\s*\d+)?$/i,
  // 2016 NSB® Regional High School Questions Page 1 | 2017 Regional High School NSB® PAGE 1
  /^(?:\d{4}\s+)?(?:nsb®?\s*)?regional\s+high\s+school\s*(?:questions|nsb®?)?\s*(?:page\s*\d+)?$/i,
  /^\d{4}\s+nsb®?$/i,
  // High School / Set 2 (2021 sets)
  /^high\s+school(?:\s+set\s*\d+)?$/i,
  /^set\s*\d+$/i,
];

export function isNoiseLine(text: string): boolean {
  const t = cleanText(text);
  return !t || NOISE_PATTERNS.some((re) => re.test(t));
}

const KIND_RE = /^(TOSS[\s-]*UP|(?:VISUAL\s+)?BONUS)\s*[:.]?\s*(.*)$/;
const TYPE_RE = /(short[\s-]*answer|multiple[\s-]*choice)\b\s*[.:;,]?\s*/i;
const LOOSE_TYPE_RE = /\b(short|mul\w{0,6}[\s-]*cho\w{0,4}|multiple)\b\s*[.:;,]?\s*/i;
const CHOICE_RE = /^([WXYZ])\s*\)\s*(.*)$/;

export interface QuestionHeader {
  number: number;
  /** Category as printed (trimmed), or '' when missing. */
  category: string;
  /** 'short_answer' | 'multiple_choice', or undefined when the type is not printed. */
  format?: AnswerFormat;
  /** Printed type text, e.g. "Short Answer". */
  type?: string;
  /** Text after the header: the start of the stem. */
  rest: string;
}

/**
 * Parses "N) CATEGORY <sep> TYPE stem..." (separator: space, "–", "—", "-" or ":").
 * With `requireType`, lines without "Short Answer"/"Multiple Choice" are rejected, which keeps
 * numbered list items inside a stem ("1) rocking, 2) ...") from being read as questions.
 */
export function parseQuestionHeader(line: string, requireType = true): QuestionHeader | undefined {
  const m = /^(\d{1,2})\s*[).:]\s*(.*)$/.exec(cleanText(line));
  if (!m) return undefined;
  const number = Number(m[1]);
  const rest = m[2].replace(/^[\s).:–—-]+/, '');
  let t = TYPE_RE.exec(rest);
  // Misspelt types ("Short", "Muliple Choice", "Multiple Choic") count only after a known category.
  if (!t) {
    const loose = LOOSE_TYPE_RE.exec(rest);
    if (loose && mapCategory(rest.slice(0, loose.index).replace(/[\s–—\-:~|.,]+$/, ''))) t = loose;
  }
  if (t && t.index <= 50) {
    const category = rest
      .slice(0, t.index)
      .replace(/[\s–—\-:~|.,]+$/, '')
      .trim();
    if (category && !/^[\p{L}][\p{L}&/ ]*$/u.test(category)) return undefined;
    if (category.split(/\s+/).length > 5) return undefined;
    const type = t[1].replace(/\s+/g, ' ');
    const format: AnswerFormat = /^short/i.test(type) ? 'short_answer' : 'multiple_choice';
    return { number, category, format, type, rest: rest.slice(t.index + t[0].length).trim() };
  }
  if (requireType) return undefined;
  const c = CATEGORY_START.exec(rest);
  if (!c) return undefined;
  return { number, category: c[1], rest: rest.slice(c[0].length).replace(/^[\s–—\-:~|.,]+/, '').trim() };
}

/** Returns the text after "ANSWER:" when the line is an answer line. */
export function matchAnswerLine(line: string): string | undefined {
  const t = cleanText(line);
  const m = /^(?:ANSWER|Answer)\s*[:;.]\s*(.*)$/.exec(t) ?? /^ANSWER\s+(?=[A-Z0-9(\[–-])(.*)$/.exec(t);
  return m ? m[1] : undefined;
}

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

export interface ParsedAnswer {
  answer: string;
  answerLetter?: Letter;
  accept: string[];
  reject: string[];
  notes: string[];
  answerRaw: string;
}

/** Splits "ACCEPT: X; DO NOT ACCEPT: Y" (also with "," or "." before the second keyword). */
const SEGMENT_SPLIT = /\s*[;,.]\s*(?=(?:ALSO\s+)?ACCEPT\b|(?:DO|SO)\s+NOT\s+ACCEPT\b|DON'?T\s+ACCEPT\b)/i;

const NOTE_START =
  /^(?:solution|soln|note|notes|hint|must|prompt|do not prompt|in any order|in either order|any order|either order|order (?:does not|doesn't) matter|or equivalent|equivalent|answers? (?:may|must|can|should)|reader|moderator|read|e\.g\.|i\.e\.|see |since |because |per |units?\b|exact)/i;

/**
 * Splits "TEPHRA, PYROCLASTIC DEBRIS" / "POLARIS or ALPHA URSA MINORIS" into alternatives.
 * Commas and semicolons separate alternatives only when the main answer is not itself a list
 * ("2, 3 (ACCEPT: DENSITY DEPENDENT MORTALITY, LARGE BODY SIZE)" is one alternative).
 * "OR" in "LESS THAN OR EQUAL TO" and "MORE OR LESS" does not separate alternatives.
 */
function splitAlternatives(text: string, mainIsList: boolean): string[] {
  // Strip separators, but keep a leading minus sign ("DO NOT ACCEPT: -4.5").
  const trimmed = text.replace(/^(?:[\s:,;]+|-\s+)+|[\s.,;]+$/g, '');
  if (!trimmed) return [];
  const parts = splitTopLevel(trimmed, /(?<!\bTHAN|\bMORE)\s+OR\s+(?!EQUAL\b)/i).map((p) => p.replace(/^[\s,;]+|[\s,;]+$/g, ''));
  const out: string[] = [];
  for (const part of parts) {
    const pieces = splitTopLevel(part, /\s*[,;]\s+/).map((p) => p.replace(/^(?:AND|OR)\s+/i, ''));
    const isList = mainIsList || pieces.length < 2 || pieces.every((p) => /^[\p{N}\p{L}]{1,3}$/u.test(p));
    if (isList) out.push(part);
    else out.push(...pieces);
  }
  return out.map((p) => p.trim()).filter(Boolean);
}

interface Group {
  open: number;
  close: number;
  inner: string;
  bracket: '(' | '[';
}

/** Index of the bracket closing the one at `open` (any of ()[] count), or -1. */
function closingBracket(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(' || s[i] === '[') depth++;
    else if (s[i] === ')' || s[i] === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Top-level (...) and [...] groups of a string; an unclosed group runs to the end.
 * Script markup such as "_(aq)" or "^(b+1)" and interval notation such as "(-2, 2]" are not
 * separate groups from the text around them (an interval is a group of its own, kept as text).
 */
function topLevelGroups(s: string): Group[] {
  const groups: Group[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '(' && c !== '[') continue;
    const close = closingBracket(s, i);
    if (i > 0 && (s[i - 1] === '^' || s[i - 1] === '_')) {
      if (close < 0) break;
      i = close;
      continue;
    }
    const end = close < 0 ? s.length - 1 : close;
    groups.push({ open: i, close: end, inner: s.slice(i + 1, close < 0 ? s.length : close), bracket: c });
    i = end;
  }
  return groups;
}

/** Splits at a separator that is outside any brackets. */
function splitTopLevel(s: string, separator: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let last = 0;
  const re = new RegExp(separator.source, separator.flags.includes('g') ? separator.flags : separator.flags + 'g');
  const cuts: [number, number][] = [];
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    cuts.push([m.index, m.index + m[0].length]);
  }
  let cut = 0;
  for (let i = 0; i < s.length && cut < cuts.length; i++) {
    if (i === cuts[cut][0] && depth === 0) {
      out.push(s.slice(last, i));
      last = cuts[cut][1];
    }
    if (i >= cuts[cut][0]) cut++;
    const c = s[i];
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
  }
  out.push(s.slice(last));
  return out;
}

const isMostlyLowercase = (s: string) => {
  const letters = s.replace(/[^A-Za-z]/g, '');
  return letters.length >= 6 && [...letters].filter((c) => c >= 'a' && c <= 'z').length / letters.length > 0.6;
};

/**
 * Parses the text after "ANSWER:".
 * - For multiple choice ("W) BASIC") the letter goes to `answerLetter` and the text after it to `answer`.
 * - "(ACCEPT: ...)", "(ALSO ACCEPT ...)" (alternatives split on OR, or on commas when the main
 *   answer is not itself a list) go to `accept`; "(DO NOT ACCEPT: ...)" to `reject`.
 * - Notes such as "(Solution: ...)", "(in any order)" or "[must give both answers]" go to `notes`.
 * - "(read as: ...)" pronunciations become "[...]"; other parentheses ("(CHARLES) DARWIN") stay.
 */
export function parseAnswerLine(text: string, format?: AnswerFormat): ParsedAnswer {
  const answerRaw = cleanText(text).replace(/^(?:ANSWER|Answer)\s*[:;.]?\s*/, '');
  let s = answerRaw;
  let answerLetter: Letter | undefined;
  if (format !== 'short_answer') {
    const m = /^([WXYZ])(?:\s*\)|\s*[.:](?=\s)|\s+[-–—]\s+|\s*$)\s*/.exec(s);
    if (m && (format === 'multiple_choice' || s[1] === ')')) {
      answerLetter = m[1] as Letter;
      s = s.slice(m[0].length);
    }
  }
  const accept: string[] = [];
  const reject: string[] = [];
  const notes: string[] = [];

  // Answers that continue with "ACCEPT:" outside parentheses.
  const loose = /(?:^|[\s;,.])((?:ALSO\s+)?ACCEPT|(?:DO|SO)\s+NOT\s+ACCEPT)\s*:/.exec(s);
  let tail = '';
  if (loose && loose.index > 0 && !topLevelGroups(s).some((g) => g.open < loose.index && g.close > loose.index)) {
    tail = s.slice(loose.index).replace(/^[\s;,]+/, '');
    s = s.slice(0, loose.index);
  }

  let mainText = s;
  for (const g of topLevelGroups(s).reverse()) mainText = mainText.slice(0, g.open) + ' ' + mainText.slice(g.close + 1);
  const mainIsList = /,\s|;/.test(mainText) || /\bAND\b/.test(mainText);

  const handleSegment = (seg: string): boolean => {
    const t = seg.trim();
    const acc = /^(?:(ALSO)\s+)?(ACCEPT(?:ABLE)?|Accept|accept)\b\s*(:)?\s*([\s\S]*)$/.exec(t);
    if (acc) {
      // "accept in either order", "ACCEPT: ANY ANSWER BETWEEN ..." are instructions, not answers.
      const instruction =
        (acc[2] === 'accept' && !acc[3]) ||
        /^(?:any\b(?!\s+of\s+the\s+following)|in\b|either\b|equivalent|reasonable|answers?\b|similar\b)/i.test(acc[4]);
      if (instruction) notes.push(t);
      else accept.push(...splitAlternatives(acc[4].replace(/^ANY\s+OF\s+THE\s+FOLLOWING\s*:?/i, ''), mainIsList));
      return true;
    }
    const rej = /^(?:DO|SO)\s+NOT\s+ACCEPT\b\s*:?\s*([\s\S]*)$/i.exec(t) ?? /^DON'?T\s+ACCEPT\b\s*:?\s*([\s\S]*)$/i.exec(t);
    if (rej) {
      reject.push(...splitAlternatives(rej[1], mainIsList));
      return true;
    }
    return false;
  };

  const handleGroup = (g: Group): string | null => {
    const inner = g.inner.trim();
    if (g.bracket === '(' && /^read\s+as\s*:/i.test(inner)) return `[${inner.replace(/^read\s+as\s*:\s*/i, '')}]`;
    const segments = inner.split(SEGMENT_SPLIT);
    if (/^(?:(?:ALSO\s+)?ACCEPT|(?:DO|SO)\s+NOT\s+ACCEPT|DON'?T\s+ACCEPT)\b/i.test(segments[0])) {
      for (const seg of segments) if (!handleSegment(seg)) notes.push(seg.trim());
      return '';
    }
    // Bracketed pronunciations ("[uh-see-tul-koe-leen]") stay in the answer as printed.
    if (g.bracket === '[' && /\p{L}-\p{L}/u.test(inner) && !NOTE_START.test(inner) && !/\b(?:must|accept|give|order)\b/i.test(inner)) return null;
    if (NOTE_START.test(inner) || isMostlyLowercase(inner)) {
      notes.push(inner);
      return '';
    }
    return null; // keep as printed (optional words, oxidation states, intervals, formulas)
  };

  let rebuilt = '';
  let pos = 0;
  for (const g of topLevelGroups(s)) {
    const replacement = handleGroup(g);
    rebuilt += s.slice(pos, g.open) + (replacement === null ? s.slice(g.open, g.close + 1) : replacement);
    pos = g.close + 1;
  }
  rebuilt += s.slice(pos);

  if (tail) {
    for (const seg of tail.split(SEGMENT_SPLIT)) {
      if (!handleSegment(seg.replace(/^[(\s]+|[)\s]+$/g, ''))) notes.push(seg.trim());
    }
  }

  const answer = rebuilt
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.])/g, '$1')
    .replace(/^[\s,;:]+|[\s,;:]+$/g, '')
    .trim();
  return { answer, ...(answerLetter ? { answerLetter } : {}), accept, reject, notes, answerRaw };
}

/* ------------------------------------------------------------------ */
/* Visual questions                                                    */
/* ------------------------------------------------------------------ */

const FIGURE = '(?:figure|diagram|graph|picture|image|illustration|drawing|photo(?:graph)?|chart|map|sketch)s?';
const VISUAL_PATTERNS: RegExp[] = [
  /\bvisual\s+(?:bonus|toss[\s-]*up|question)\b/i,
  // "the diagram shown", "the graph provided on your answer sheet"
  new RegExp(`\\b${FIGURE}\\s+(?:that\\s+(?:is|are)\\s+)?(?:shown|provided|displayed|depicted|pictured|presented|attached|on (?:your|the) (?:screen|slide|handout|answer sheet))\\b`, 'i'),
  // "shown in the figure", "displayed on the image"
  new RegExp(`\\b(?:shown|provided|depicted|displayed|pictured|presented|illustrated)\\s+(?:in|on|by)\\s+(?:the|this|your)\\s+${FIGURE}\\b`, 'i'),
  // "refer to the figure", "look at the picture"
  /\b(?:refer(?:ring)?\s+to|look(?:ing)?\s+at)\s+the\s+(?:figure|diagram|picture|image|illustration|drawing|photo(?:graph)?)s?\b/i,
];

/** True when a question clearly depends on a figure that is shown or provided. */
export function detectVisual(text: string): boolean {
  return VISUAL_PATTERNS.some((re) => re.test(text));
}

/* ------------------------------------------------------------------ */
/* Round parser                                                        */
/* ------------------------------------------------------------------ */

interface Draft {
  kind?: QuestionKind;
  kindInferred: boolean;
  visualMarker: boolean;
  printedNumber: number;
  header: QuestionHeader;
  page: number;
  stem: string[];
  /** Options in printed order, with the letter as printed. */
  choices: { letter: Letter; lines: string[] }[];
  answer?: string[];
  hints: Set<string>;
}

const LETTER_INDEX: Record<Letter, number> = { W: 0, X: 1, Y: 2, Z: 3 };

/** Splits "W) 3 X) 6 Y) 9 Z) 15" (choices printed on one line) into separate choices. */
function splitInlineChoices(letter: Letter, text: string): [Letter, string][] {
  const out: [Letter, string][] = [[letter, text]];
  let next = LETTER_INDEX[letter] + 1;
  for (;;) {
    const want = (['W', 'X', 'Y', 'Z'] as Letter[])[next];
    if (!want) break;
    const last = out[out.length - 1];
    const m = new RegExp(`\\s${want}\\)\\s+`).exec(last[1]);
    if (!m || m.index === 0) break;
    out.push([want, last[1].slice(m.index + m[0].length)]);
    last[1] = last[1].slice(0, m.index);
    next++;
  }
  return out;
}

/** A sentence in ordinary mixed case, unlike answer lines (capitals, formulas, "(ACCEPT: ...)"). */
function isProse(text: string): boolean {
  if (!/^[A-Z][a-z’']+\b/.test(text) || /\b(?:ACCEPT|ANSWER|Solution)\b/.test(text)) return false;
  const words = text.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const letters = text.replace(/[^A-Za-z]/g, '');
  return words.length >= 5 && [...letters].filter((c) => c >= 'a' && c <= 'z').length / letters.length > 0.7;
}

const bracketsBalanced = (s: string) => (s.match(/[([]/g) ?? []).length <= (s.match(/[)\]]/g) ?? []).length;

/** Repeated header/footer lines: same text (digits ignored) on many pages. */
function repeatedLines(lines: { text: string; page: number }[]): Set<string> {
  const pages = new Set(lines.map((l) => l.page));
  const seen = new Map<string, Set<number>>();
  for (const l of lines) {
    const key = l.text.replace(/\d+/g, '#');
    if ((key.match(/\p{L}/gu) ?? []).length < 3) continue;
    if (KIND_RE.test(l.text) || matchAnswerLine(l.text) !== undefined || CHOICE_RE.test(l.text) || /^\d{1,2}\s*[).]/.test(l.text)) continue;
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key)!.add(l.page);
  }
  const min = Math.max(3, Math.ceil(pages.size * 0.4));
  return new Set([...seen.entries()].filter(([, p]) => p.size >= min).map(([k]) => k));
}

const PRINTED_LABEL_RE =
  /^(?:high\s+school\s*[-–—]?\s*)?((?:round\s+robin|double\s+elimination)\s*[~–—-]\s*)?round\s*(\d+\s*[a-z]?)$|^(?:high\s+school\s+)?(set\s*\d+)$/i;

/**
 * Parses one round PDF.
 * Questions are paired in order: each toss-up starts a pair and the next bonus joins it.
 */
export function parseDoeRound(input: readonly SourceLine[], meta: DoeRoundMeta): DoeRoundResult {
  const credit = meta.credit ?? DOE_CREDIT;
  const warnings: ParseWarning[] = [];
  const strayLines: { page: number; text: string }[] = [];

  // 1. Clean lines, find the printed round label, drop headers/footers/separators.
  const cleaned = input.map((l) => ({ text: cleanText(l.text), page: l.page, hints: l.hints ?? [] }));
  let printedLabel: string | undefined;
  for (const l of cleaned.slice(0, 8)) {
    const m = PRINTED_LABEL_RE.exec(l.text);
    if (m && !/page/i.test(l.text)) {
      printedLabel = l.text.replace(/\s+/g, ' ');
      break;
    }
  }
  const repeated = repeatedLines(cleaned);
  const lines = cleaned.filter((l) => {
    if (!l.text) return l.hints.includes('image');
    return !isNoiseLine(l.text) && !repeated.has(l.text.replace(/\d+/g, '#'));
  });

  // Re-join a question header whose type wrapped ("3) Earth and Space – Multiple" / "Choice ...").
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\d{1,2}\s*[).]/.test(lines[i].text) && /\b(?:Multiple|Short)$/i.test(lines[i].text) && /^(?:Choice|Answer)\b/i.test(lines[i + 1].text)) {
      lines[i] = { ...lines[i], text: `${lines[i].text} ${lines[i + 1].text}` };
      lines.splice(i + 1, 1);
    }
  }

  // 2. Walk the lines and collect question drafts.
  const drafts: Draft[] = [];
  let draft: Draft | undefined;
  let state: 'idle' | 'stem' | 'choice' | 'answer' = 'idle';
  let pending: { kind: QuestionKind; visual: boolean; page: number } | undefined;
  let pendingFragments: string[] = [];

  const finish = () => {
    if (draft) drafts.push(draft);
    draft = undefined;
    state = 'idle';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;
    if (!text) {
      if (draft && state !== 'idle') line.hints.forEach((h) => draft!.hints.add(h));
      continue;
    }

    const kind = KIND_RE.exec(text);
    if (kind && (!kind[2] || parseQuestionHeader(kind[2], false))) {
      finish();
      pending = { kind: /BONUS/.test(kind[1]) ? 'bonus' : 'tossup', visual: /VISUAL/.test(kind[1]), page: line.page };
      pendingFragments = [];
      if (!kind[2]) continue;
    }
    const headerText = kind && kind[2] ? kind[2] : text;
    // A full header ("N) CAT TYPE") can start a question anywhere except inside a stem that is
    // still waiting for its answer; right after a marker the type may be missing.
    const header = parseQuestionHeader(headerText, !pending);
    if (header && (pending || state === 'idle' || state === 'answer')) {
      finish();
      const fragments = pendingFragments;
      pendingFragments = [];
      draft = {
        kind: pending?.kind,
        kindInferred: !pending,
        visualMarker: pending?.visual ?? false,
        printedNumber: header.number,
        header,
        page: line.page,
        stem: header.rest ? [header.rest] : [],
        choices: [],
        hints: new Set(line.hints),
      };
      // Pieces of an equation printed above the question's first line belong to this question.
      if (fragments.length) draft.hints.add('orphan-script');
      pending = undefined;
      state = 'stem';
      // Type printed at the start of the next line ("3. MATH" / "Short Answer ...").
      if (!header.format) {
        const next = lines[i + 1]?.text ?? '';
        const t = /^(short[\s-]*answer|multiple[\s-]*choice)\b\s*[.:;,–—-]?\s*(.*)$/i.exec(next);
        if (t) {
          header.type = t[1].replace(/\s+/g, ' ');
          header.format = /short/i.test(t[1]) ? 'short_answer' : 'multiple_choice';
          if (t[2]) draft.stem.push(t[2]);
          i++;
        }
      }
      continue;
    }

    if (!draft) {
      strayLines.push({ page: line.page, text });
      if (pending) pendingFragments.push(text);
      continue;
    }
    line.hints.forEach((h) => draft!.hints.add(h));

    // Moderator script after the last answer ("Before we leave, let’s confirm the team’s score...").
    if (state === 'answer' && isProse(text) && bracketsBalanced(draft.answer!.join(' '))) {
      finish();
      strayLines.push({ page: line.page, text });
      continue;
    }

    const answer = matchAnswerLine(text);
    if (answer !== undefined && state !== 'idle') {
      if (state === 'answer') draft.answer!.push(text);
      else draft.answer = [answer];
      state = 'answer';
      continue;
    }

    const choice = CHOICE_RE.exec(text);
    if (choice && (state === 'stem' || state === 'choice') && draft.choices.length < 4) {
      const letter = choice[1] as Letter;
      // In a stem, only a "W)" (or a question printed as multiple choice) starts the options.
      if (state === 'choice' || letter === 'W' || draft.header.format === 'multiple_choice') {
        for (const [l, t] of splitInlineChoices(letter, choice[2])) draft.choices.push({ letter: l, lines: [t] });
        state = 'choice';
        continue;
      }
    }

    if (state === 'stem') draft.stem.push(text);
    else if (state === 'choice') draft.choices[draft.choices.length - 1].lines.push(text);
    else if (state === 'answer') draft.answer!.push(text);
  }
  finish();
  if (pending) warnings.push({ code: 'marker-without-question', message: `${pending.kind} marker with no question after it`, page: pending.page });

  // 3. Turn drafts into questions and pair them.
  const pairs: QuestionPair[] = [];
  let lastNumber = 0;
  let previous: Question | undefined;
  for (const d of drafts) {
    let kind = d.kind;
    if (!kind) {
      kind = previous?.kind === 'tossup' && previous.number === d.printedNumber && !pairs[pairs.length - 1]?.bonus ? 'bonus' : 'tossup';
    }
    let number: number;
    if (kind === 'tossup') {
      number = d.printedNumber > lastNumber ? d.printedNumber : lastNumber + 1;
      lastNumber = number;
    } else {
      number = pairs.length ? pairs[pairs.length - 1].number : d.printedNumber;
    }
    const q = buildQuestion(d, kind, number, meta, credit);
    if (d.kindInferred) addFlag(q, 'kind-inferred');
    if (number !== d.printedNumber) addFlag(q, 'number-mismatch');

    if (kind === 'tossup') {
      pairs.push({ number, tossup: q });
    } else {
      const last = pairs[pairs.length - 1];
      if (!last || last.bonus) {
        warnings.push({
          code: 'orphan-bonus',
          message: `bonus ${d.printedNumber} has no toss-up before it; dropped`,
          questionId: q.id,
          page: d.page,
        });
        previous = q;
        continue;
      }
      last.bonus = q;
    }
    previous = q;
  }

  for (const p of pairs) {
    for (const q of [p.tossup, p.bonus]) {
      if (!q) continue;
      for (const flag of q.flags ?? []) {
        warnings.push({ code: flag, message: describeFlag(flag, q), questionId: q.id, page: q.source.page });
      }
    }
    if (!p.bonus) warnings.push({ code: 'bonus-missing', message: `toss-up ${p.number} has no bonus`, questionId: p.tossup.id, page: p.tossup.source.page });
  }

  for (const l of strayLines) {
    warnings.push({ code: 'stray-line', message: `text outside any question: "${l.text.slice(0, 100)}"`, page: l.page });
  }

  const round: Round = { id: meta.roundId, label: meta.label, order: meta.order, ...(meta.sourceUrl ? { sourceUrl: meta.sourceUrl } : {}), pairs };
  return { round, warnings, ...(printedLabel ? { printedLabel } : {}), strayLines };
}

function addFlag(q: Question, flag: string) {
  q.flags = [...new Set([...(q.flags ?? []), flag])];
}

function describeFlag(flag: string, q: Question): string {
  const what = `${q.kind === 'tossup' ? 'toss-up' : 'bonus'} ${q.number}`;
  switch (flag) {
    case 'category-unknown':
      return `${what}: category "${q.sourceCategory}" is missing or unknown`;
    case 'type-unknown':
      return `${what}: question type not printed; guessed ${q.format}`;
    case 'answer-missing':
      return `${what}: no answer found`;
    case 'choices-missing':
      return `${what}: multiple choice without all four options (W-Z)`;
    case 'mc-answer-mismatch':
      return `${what}: answer "${q.answerRaw}" does not match option ${q.answerLetter}`;
    case 'possible-lost-formatting':
      return `${what}: equation or symbol layout may not have survived text extraction`;
    case 'image-not-extracted':
      return `${what}: the PDF draws an image here that is not in the text`;
    case 'kind-inferred':
      return `${what}: TOSS-UP/BONUS marker missing; kind inferred`;
    case 'number-mismatch':
      return `${what}: printed number differs from its position`;
    case 'choice-letters-fixed':
      return `${what}: option letters misprinted in the PDF; read as W, X, Y, Z in order`;
    case 'choices-reordered':
      return `${what}: options printed out of letter order; listed W, X, Y, Z with DOE's letters`;
    case 'erratum':
      return `${what}: reviewed correction applied (see notes)`;
    case 'answer-letter-corrected':
      return `${what}: answer "${q.answerRaw}" names option ${q.answerLetter}; letter corrected to match the text`;
    case 'type-mismatch':
      return `${what}: printed as ${q.format === 'multiple_choice' ? 'short answer' : 'multiple choice'} but laid out otherwise`;
    default:
      return `${what}: ${flag}`;
  }
}

const normalizeForCompare = (s: string) =>
  s
    .toUpperCase()
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Dice coefficient of character bigrams (1 = identical), tolerant of typos in long options. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let common = 0;
  for (const [g, n] of ga) common += Math.min(n, gb.get(g) ?? 0);
  return (2 * common) / (a.length - 1 + b.length - 1);
}

/** Whether an answer text names the given option (tolerating typos and truncation). */
function sameOption(answer: string, option: string): boolean {
  const a = normalizeForCompare(answer);
  const c = normalizeForCompare(option);
  if (!a || !c) return true;
  return a.startsWith(c) || c.startsWith(a) || similarity(a, c) >= 0.8;
}

const LETTERS_IN_ORDER: Letter[] = ['W', 'X', 'Y', 'Z'];

/** Characters from scripts that never appear in these questions: a sign of a broken font mapping. */
const GARBLED = /[\u0400-\u052f\u0590-\u08ff\u0900-\u0dff\u0e00-\u0fff\u1000-\u109f\u3040-\u9fff\uac00-\ud7af\ufffd\ue000-\uf8ff]/;

function buildQuestion(d: Draft, kind: QuestionKind, number: number, meta: DoeRoundMeta, credit: string): Question {
  const flags: string[] = [];
  const sourceCategory = d.header.category.replace(/\s+/g, ' ').trim();
  let subject = sourceCategory ? mapCategory(sourceCategory) : undefined;
  if (!subject) {
    flags.push('category-unknown');
    subject = 'general_science';
  }

  // When the four printed letters are W, X, Y and Z once each, keep DOE's letters even if they are
  // printed out of order ("W) Granite / Y) Sandstone / X) Basalt / Z) Schist"), so the printed answer
  // key still matches. When a letter is duplicated or missing ("W) Dinosaur / X) Whale / W) Fish /
  // Z) Trilobite"), the options are W, X, Y, Z by position.
  const choiceTexts: Partial<Record<Letter, string>> = {};
  const printedLetters = d.choices.map((c) => c.letter);
  const permutation = d.choices.length === 4 && new Set(printedLetters).size === 4 && printedLetters.every((l) => LETTERS_IN_ORDER.includes(l));
  const positional = d.choices.length === 4 && !permutation;
  d.choices.forEach((c, i) => {
    const letter = positional ? LETTERS_IN_ORDER[i] : c.letter;
    const text = normalizePronunciation(joinLines(c.lines));
    choiceTexts[letter] = choiceTexts[letter] ? `${choiceTexts[letter]} ${text}` : text;
  });
  if (positional && d.choices.some((c, i) => c.letter !== LETTERS_IN_ORDER[i])) flags.push('choice-letters-fixed');
  if (permutation && printedLetters.some((l, i) => l !== LETTERS_IN_ORDER[i])) flags.push('choices-reordered');
  let stem = normalizePronunciation(joinLines(d.stem));

  // Options printed inside the stem ("... is: W) a X) b Y) c Z) d").
  if (!d.choices.length && d.header.format !== 'short_answer') {
    const m = /\s+W\)\s*(.+?)\s+X\)\s*(.+?)\s+Y\)\s*(.+?)\s+Z\)\s*(.+)$/.exec(stem);
    if (m) {
      stem = stem.slice(0, m.index).trim();
      (['W', 'X', 'Y', 'Z'] as Letter[]).forEach((l, i) => (choiceTexts[l] = m[i + 1].trim()));
    }
  }
  const hasAllChoices = (['W', 'X', 'Y', 'Z'] as Letter[]).every((l) => choiceTexts[l]);
  const anyChoice = Object.keys(choiceTexts).length > 0;

  const answerText = d.answer ? joinLines(d.answer) : '';
  let format: AnswerFormat;
  if (d.header.format) {
    format = d.header.format;
    const looksMc = hasAllChoices && /^[WXYZ]\s*\)/.test(answerText);
    if (format === 'short_answer' && looksMc) {
      format = 'multiple_choice';
      flags.push('type-mismatch');
    } else if (format === 'multiple_choice' && !anyChoice && answerText && !/^[WXYZ]\b/.test(answerText)) {
      format = 'short_answer';
      flags.push('type-mismatch');
    }
  } else {
    flags.push('type-unknown');
    format = anyChoice || /^[WXYZ]\s*\)/.test(answerText) ? 'multiple_choice' : 'short_answer';
  }

  const parsed = parseAnswerLine(answerText, format);
  let answer = normalizePronunciation(parsed.answer);
  let answerLetter = parsed.answerLetter;
  if (!answerText.trim()) flags.push('answer-missing');
  if (format === 'multiple_choice') {
    if (!hasAllChoices) flags.push('choices-missing');
    if (!answerLetter) {
      if (answerText.trim()) flags.push('mc-answer-mismatch');
    } else {
      const choice = choiceTexts[answerLetter];
      if (!answer && choice) answer = choice;
      else if (choice && answer && !sameOption(answer, choice)) {
        // The printed letter names another option than the printed text: trust the text when it
        // matches exactly one option ("W) MERCURY-OXIDE CELLS" with X) mercury-oxide cells).
        const matches = LETTERS_IN_ORDER.filter((l) => choiceTexts[l] && sameOption(answer, choiceTexts[l]!));
        const readable = (answer.match(/\p{L}/gu) ?? []).length >= 3 && !GARBLED.test(answer) && !/[\^_]\(/.test(answer);
        if (matches.length === 1 && readable) {
          answerLetter = matches[0];
          flags.push('answer-letter-corrected');
        } else flags.push('mc-answer-mismatch');
      }
    }
  }

  const allText = [stem, ...Object.values(choiceTexts), answerText].join(' ');
  if (d.hints.has('orphan-script') || d.hints.has('math') || GARBLED.test(allText)) flags.push('possible-lost-formatting');
  if (d.hints.has('image')) {
    flags.push('image-not-extracted');
    if (!flags.includes('possible-lost-formatting')) flags.push('possible-lost-formatting');
  }
  const visual = d.visualMarker || detectVisual(`${stem} ${Object.values(choiceTexts).join(' ')}`);

  const question: Question = {
    id: doeQuestionId(meta.roundId, kind, number),
    kind,
    number,
    subject,
    sourceCategory,
    format,
    stem,
    ...(format === 'multiple_choice' && anyChoice ? { choices: { W: '', X: '', Y: '', Z: '', ...choiceTexts } as Record<Letter, string> } : {}),
    answer,
    ...(format === 'multiple_choice' && answerLetter ? { answerLetter } : {}),
    accept: parsed.accept.map(normalizePronunciation),
    reject: parsed.reject.map(normalizePronunciation),
    answerRaw: parsed.answerRaw,
    ...(parsed.notes.length ? { notes: parsed.notes } : {}),
    ...(visual ? { visual: true } : {}),
    source: {
      provider: 'doe',
      setId: meta.setId,
      roundId: meta.roundId,
      ...(meta.sourceUrl ? { url: meta.sourceUrl } : {}),
      page: d.page,
      credit,
    },
    ...(flags.length ? { flags: [...new Set(flags)] } : {}),
  };
  return question;
}

/**
 * Turns plain text (e.g. `pdftotext` output or a test fixture) into source lines.
 * Pages are separated by form feeds (\f), as pdftotext writes them.
 */
export function linesFromPlainText(text: string): SourceLine[] {
  const out: SourceLine[] = [];
  text.split('\f').forEach((pageText, i) => {
    for (const line of pageText.split(/\r?\n/)) out.push({ text: line, page: i + 1 });
  });
  return out;
}

/** Expected number of toss-ups per round for a regional year (25 through 2013, 23 for 2014-2020, 18 after). */
export function expectedPairsForYear(year: number | undefined): number | undefined {
  if (!year) return undefined;
  if (year <= 2013) return 25;
  if (year <= 2020) return 23;
  return 18;
}
