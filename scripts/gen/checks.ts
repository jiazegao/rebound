/**
 * House-style checks (plan step 5): what plain code can fix or refuse in a drafted question before any paid
 * check runs. They reuse the Write studio's checks and the answer checker, and add rules taken from DOE's
 * measured style (data/style-profile.json) and the lab table.
 *
 *  - `tidy` makes the fixes that need no judgment: spacing, apostrophes and minus signs as the library
 *    prints them, numeric choices in order, and the key moved to the letter the round plan asked for.
 *  - `checkQuestion` lists what is wrong with one question. An error fails it; a warning is for the reviewer.
 *  - `checkRound` lists what is wrong with a set of questions taken together (keys bunched on one letter…).
 *
 * The thresholds are tuned on DOE's own questions: checks.test.ts requires that at least 95% of DOE's
 * 2019–22 questions pass with no error, and that the faults found in the November 2026 pilot are caught.
 *
 *   npx tsx scripts/gen/check.ts <file.nsb.json>      (npm run gen:check -- <file>)
 */
import { judgeAnswer } from '../../src/core/judge/judge';
import { parseNumber } from '../../src/core/judge/numbers';
import { CORE_SUBJECTS, LETTERS, SUBJECT_LABELS, type CoreSubject, type Letter, type Question } from '../../src/core/schema';
import { checkWritten } from '../../src/core/studio';
import { formerLabNames, labMentions, type LabTable } from './labs';
import { choiceTexts, hasWordChoices, rightIsLongest, type StyleProfile } from './profile';
import { contentWords, hasCapitalNot, isIdentifyAll, isNumber, isNumericAnswer, isRank, listItems, median, plain, withoutGuides, wordCount } from './text';
import type { Draft, QuestionText } from './types';

export interface Finding {
  level: 'error' | 'warning';
  /** A short stable name for the rule, e.g. "right-choice-long". */
  code: string;
  message: string;
}

export interface CheckContext {
  profile: StyleProfile;
  labs: LabTable;
}

export interface CheckOptions {
  /**
   * Also check that nothing is out of date: former lab names, wording tied to a date with no date recorded,
   * and an Energy question that names a lab without a dated source. On by default; off when measuring DOE's
   * old questions, which were current when they were written.
   */
  freshness?: boolean;
}

/** The right choice fails when it is at least this many characters… */
export const LONG_CHOICE_CHARS = 50;
/** …and this many times as long as the next longest choice. */
export const LONG_CHOICE_RATIO = 1.25;
/** A stem fails when it is this many times the length nine in ten of DOE's stems stay within. */
export const STEM_LIMIT = 1.25;
/** Key letters: each of W to Z should hold between these shares of a round's multiple-choice keys. */
export const LETTER_SHARE = { low: 0.15, high: 0.35 };

const error = (code: string, message: string): Finding => ({ level: 'error', code, message });
const warning = (code: string, message: string): Finding => ({ level: 'warning', code, message });

/** The question as the studio's checks and the answer checker take it. */
function asQuestion(q: QuestionText): Question {
  return { id: 'draft', number: 1, sourceCategory: '', answerRaw: '', source: { provider: 'rebound', setId: 'draft', roundId: 'draft', credit: '' }, ...q };
}

/* ------------------------------------------------------------------ */
/* Automatic fixes                                                     */
/* ------------------------------------------------------------------ */

/** Spacing, apostrophes and minus signs as the library prints them: "don’t", "–3". */
export function typeset(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(?<=[A-Za-z0-9])'/g, '’')
    .replace(/(?<![A-Za-z0-9)\]’'.])-(?=\d)/g, '–');
}

const sameUnitNumbers = (texts: string[]) => {
  const parsed = texts.map((t) => parseNumber(withoutGuides(t)));
  return parsed.every((p) => p !== null) && new Set(parsed.map((p) => p!.unit)).size === 1 ? parsed.map((p) => p!.value) : null;
};

const ordered = (values: number[]) => values.every((v, i) => i === 0 || v > values[i - 1]!) || values.every((v, i) => i === 0 || v < values[i - 1]!);

/**
 * The fixes that need no judgment. Returns the tidied draft and, in plain words, what changed.
 * Numeric choices in one unit are put in rising order; other choices are moved so the key lands on the
 * letter the round plan asked for (unless their order means something).
 */
export function tidy(draft: Draft): { draft: Draft; changes: string[] } {
  const changes: string[] = [];
  const before = draft.question;
  const q: QuestionText = { ...before, stem: typeset(before.stem), answer: typeset(before.answer), accept: before.accept.map(typeset).filter(Boolean), reject: before.reject.map(typeset).filter(Boolean) };
  if (q.format === 'multiple_choice' && q.choices) {
    q.choices = Object.fromEntries(LETTERS.map((l) => [l, typeset(before.choices?.[l] ?? '')])) as Record<Letter, string>;
  } else {
    delete q.choices;
    delete q.answerLetter;
  }
  const texts = (x: QuestionText) => [x.stem, x.answer, ...x.accept, ...x.reject, ...(x.choices ? LETTERS.map((l) => x.choices![l]) : [])].join('\n');
  if (texts(q) !== texts({ ...before, accept: before.accept.filter((a) => a.trim()), reject: before.reject.filter((a) => a.trim()) })) changes.push('Spacing, apostrophes and minus signs made consistent.');

  if (q.format === 'multiple_choice' && q.choices && q.answerLetter && LETTERS.every((l) => q.choices![l])) {
    const list = LETTERS.map((l) => q.choices![l]);
    const right = q.choices[q.answerLetter];
    const place = (next: string[], why: string) => {
      const letter = LETTERS[next.indexOf(right)]!;
      if (next.every((c, i) => c === list[i])) return;
      q.choices = Object.fromEntries(LETTERS.map((l, i) => [l, next[i]!])) as Record<Letter, string>;
      changes.push(`${why} The key moved from ${q.answerLetter} to ${letter}.`.replace(/ The key moved from (\w) to \1\./, ''));
      q.answerLetter = letter;
    };
    const values = sameUnitNumbers(list);
    if (!draft.keepChoiceOrder && new Set(list.map((c) => c.toLowerCase())).size === 4) {
      if (values && new Set(values).size === 4) {
        if (!ordered(values)) place([...list].sort((a, b) => values[list.indexOf(a)]! - values[list.indexOf(b)]!), 'Numeric choices put in rising order.');
      } else if (!list.every(isNumber) && draft.letter && draft.letter !== q.answerLetter) {
        const others = list.filter((c) => c !== right);
        let k = 0;
        place(LETTERS.map((l) => (l === draft.letter ? right : others[k++]!)), 'Choices reordered for the round’s spread of keys.');
      }
    }
    if (!q.answer) q.answer = withoutGuides(q.choices[q.answerLetter]);
    if (q.accept.length) {
      q.accept = [];
      changes.push('ACCEPT entries removed: a multiple-choice answer is its letter or its exact text.');
    }
  }
  return { draft: { ...draft, question: q }, changes };
}

/* ------------------------------------------------------------------ */
/* One question                                                        */
/* ------------------------------------------------------------------ */

/** Studio findings the pipeline does not pass on: sources are checked at step 7, and the other two have rules of their own here. */
const STUDIO_SKIPPED = new Set(['source', 'voice', 'aota']);

/** A choice that points at other choices instead of being an answer: "All of the above", "Both W and X". */
const REFERS_TO_CHOICES = /\b(all|none|both|neither|any|either) of (the above|these|them|the (other )?(choices|options|answers))\b|^(all|none|both|neither)$|^((both|neither|either)\s+)?[WXYZ]\s+(and|or|nor)\s+[WXYZ](\s+only)?$/i;

/** Wording whose truth depends on when it is read. */
const TIME_TIED = /\b(currently|recently|as of|today|today’s|latest|newest|most recent|this year|to date|so far|is now|are now|planned|upcoming|scheduled|not yet)\b|\b(in|since|by|during|from|until|before|after) 20(1[5-9]|[2-9]\d)\b/i;

/** Words in labs' names that say nothing about one lab: an answer may share them. */
const LAB_NAME_FILLER = new Set(['national', 'laboratory', 'laboratories', 'energy', 'technology', 'facility']);

const NUMBER_WORDS: Record<string, number> = { three: 3, four: 4, five: 5, six: 6 };

/** The answer of a list question as numbers: "1, 3" → [1, 3]; "ALL" and "NONE" are whole-list answers. */
function listAnswer(answer: string): { all?: true; none?: true; numbers?: number[] } | null {
  const a = withoutGuides(answer).toUpperCase().replace(/\s+/g, ' ').trim();
  if (/^ALL( OF THEM| THREE| FOUR)?$/.test(a)) return { all: true };
  if (/^NONE( OF THEM)?$/.test(a)) return { none: true };
  const m = /^(\d)( ONLY)?$|^(\d(?:\s*,\s*\d)*(?:,?\s*AND\s*\d)?)$/.exec(a);
  if (!m) return null;
  return { numbers: [...a.matchAll(/\d/g)].map((d) => Number(d[0])) };
}

function listFindings(q: QuestionText, kind: 'identify' | 'rank'): Finding[] {
  const out: Finding[] = [];
  const name = kind === 'identify' ? '"Identify all"' : '"Rank"';
  if (q.format !== 'short_answer') return [error('list-form', `${name} questions are short answer: the list is in the question, and the answer is its numbers.`)];
  const heard = withoutGuides(q.stem);
  const opening = kind === 'identify' ? /identify all of the following (three|four|five|six|\d) [^:]+:/i : /(rank|order|place|arrange) the following (three|four|five|six|\d) [^:]+:/i;
  const m = opening.exec(heard);
  const items = listItems(heard);
  const numbered = items.length >= 3 && items.every((n, i) => n === i + 1);
  if (!m) {
    out.push(error('list-form', kind === 'identify' ? 'Word it as DOE does: "Identify all of the following three … that …: 1) …; 2) …; 3) …."' : 'Word it as DOE does: "Rank the following three … in order of increasing …: 1) …; 2) …; 3) …."'));
  } else {
    const said = NUMBER_WORDS[m[kind === 'identify' ? 1 : 2]!.toLowerCase()] ?? Number(m[kind === 'identify' ? 1 : 2]);
    if (numbered && said !== items.length) out.push(error('list-form', `The question says ${said} items but lists ${items.length}.`));
  }
  if (!numbered) out.push(error('list-form', 'Number the items 1), 2), 3), in order.'));
  else if (!/\d\)[^;]*;/.test(heard) || !/[.?]["”’)]*$/.test(heard)) out.push(warning('list-punctuation', 'DOE separates the items with semicolons and ends the list with a period.'));
  if (!numbered) return out;

  const answer = listAnswer(q.answer);
  const n = items.length;
  if (kind === 'identify') {
    const ok = answer && (answer.all || answer.none || (answer.numbers!.every((x, i) => x >= 1 && x <= n && (i === 0 || x > answer.numbers![i - 1]!)) && answer.numbers!.length < n));
    if (!ok) out.push(error('list-answer', `Give the answer as the items' numbers in rising order ("1, 3"), or ALL, or NONE${answer?.numbers?.length === n ? ' (every item is right: say ALL)' : ''}.`));
  } else {
    const ok = answer?.numbers && answer.numbers.length === n && new Set(answer.numbers).size === n && answer.numbers.every((x) => x >= 1 && x <= n);
    if (!ok) out.push(error('list-answer', `Give the answer as all ${n} numbers in order ("2, 1, 3").`));
  }
  return out;
}

/** The profile's numbers for a question's level, category and kind (all categories together for an old category). */
function cellFor(q: QuestionText, level: Draft['level'], profile: StyleProfile) {
  const l = profile.levels[level];
  return (CORE_SUBJECTS as string[]).includes(q.subject) ? l.cells[q.subject as CoreSubject][q.kind] : l.all[q.kind];
}

const NUMBER_WORD = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|double|twice)$/;

/**
 * A short answer that is said, whole, in its own question, where the question does not offer it as a choice.
 * Often harmless ("oxygen-18-labeled water … what product?" OXYGEN), so the reviewer decides.
 */
function answerInStem(q: QuestionText): boolean {
  if (q.format !== 'short_answer' || isNumericAnswer(q) || isIdentifyAll(q.stem) || isRank(q.stem)) return false;
  const answer = plain(q.answer);
  if (!answer || NUMBER_WORD.test(answer) || !/[a-z]{4}/.test(answer)) return false;
  const heard = withoutGuides(q.stem);
  // "Is it an acid or a base?" names its answer on purpose.
  if (/\bor\b/i.test(heard)) return false;
  return ` ${plain(heard)} `.includes(` ${answer} `);
}

/** Everything wrong with one question. An error fails it; a warning is for the reviewer to weigh. */
export function checkQuestion(draft: Draft, ctx: CheckContext, options: CheckOptions = {}): Finding[] {
  const q = draft.question;
  const freshness = options.freshness ?? true;
  const out: Finding[] = [];
  const heard = withoutGuides(q.stem);

  // The Write studio's checks: four distinct choices, one right, simplest form, matched brackets, units…
  for (const c of checkWritten({ question: asQuestion(q), sources: [{ title: 'checked at step 7' }] })) {
    if (!STUDIO_SKIPPED.has(c.code)) out.push({ level: c.level, code: c.code, message: c.message });
  }

  // The answer checker must agree with the answer line: a player who gives the key must be marked right.
  const judged = (response: string) => judgeAnswer(asQuestion(q), response).verdict;
  if (q.format === 'multiple_choice') {
    const right = q.answerLetter ? q.choices?.[q.answerLetter] : undefined;
    if (q.answerLetter && right) {
      if (judged(q.answerLetter) !== 'correct' || judged(withoutGuides(right)) !== 'correct') out.push(error('key-not-accepted', 'The answer checker does not accept this question’s own key.'));
      if (q.answer.trim() && plain(q.answer) !== plain(right)) {
        out.push(error('letter-text-mismatch', `The answer line says "${q.answer}", but choice ${q.answerLetter} is "${withoutGuides(right)}".`));
      }
    }
  } else if (q.answer.trim()) {
    if (judged(q.answer) !== 'correct') out.push(error('key-not-accepted', 'The answer checker does not accept this question’s own answer.'));
    for (const a of q.accept) if (judged(a) !== 'correct') out.push(error('accept-not-accepted', `The answer checker does not accept the ACCEPT entry "${a}".`));
    // Would the entry be right if it were not on the DO NOT ACCEPT list? Then the answer line contradicts itself.
    const unlisted = asQuestion({ ...q, reject: [] });
    for (const r of q.reject) if (judgeAnswer(unlisted, r).verdict === 'correct') out.push(error('reject-accepted', `The answer line rejects "${r}", which is the answer or one of its accepted forms.`));
  }

  if (q.format === 'multiple_choice' && q.choices) {
    const choices = choiceTexts(q).map(withoutGuides);
    if (heard && !/\?["”’')]*$/.test(heard)) out.push(error('mc-ending', 'A multiple-choice question ends with a question mark (DOE’s do, 99.9% of the time), not a colon or an unfinished sentence.'));
    if (choices.some((c) => REFERS_TO_CHOICES.test(c))) out.push(error('refers-to-choices', 'No "all of the above", "none of the above" or "both W and X": DOE’s recent sets never use them. Give four answers.'));
    if (choices.some((c) => /\bbecause\b/i.test(c))) out.push(error('because-clause', 'A choice carries a "because" clause. DOE’s choices are short and parallel; ask for the reason in the question instead.'));
    if (q.answerLetter && hasWordChoices(q)) {
      const right = choices[LETTERS.indexOf(q.answerLetter)]!.length;
      const next = Math.max(...choices.filter((_, i) => i !== LETTERS.indexOf(q.answerLetter!)).map((c) => c.length));
      if (right >= LONG_CHOICE_CHARS && right >= LONG_CHOICE_RATIO * next) {
        out.push(error('right-choice-long', 'The right choice is much the longest, which gives it away. Shorten it or lengthen the others to match.'));
      }
      const mean = choices.reduce((a, c) => a + wordCount(c), 0) / 4;
      const usual = ctx.profile.levels[draft.level].choices.meanWords.p95;
      if (mean > usual) out.push(warning('choices-long', `The choices average ${mean.toFixed(1)} words; 95% of DOE’s stay within ${usual}.`));
    }
  }

  if (draft.form === 'identify_all' || isIdentifyAll(q.stem)) out.push(...listFindings(q, 'identify'));
  else if (draft.form === 'rank' || isRank(q.stem)) out.push(...listFindings(q, 'rank'));

  if (answerInStem(q)) out.push(warning('answer-in-stem', 'The answer is said in the question. Check that it does not give itself away.'));
  const keyWords = new Set(contentWords(q.format === 'multiple_choice' && q.answerLetter ? (q.choices?.[q.answerLetter] ?? '') : q.answer).filter((w) => w.length >= 4 && !LAB_NAME_FILLER.has(w)));
  const mentions = labMentions(heard, ctx.labs);
  for (const m of mentions) {
    if (!isNumericAnswer(q) && contentWords(m.text).some((w) => keyWords.has(w))) out.push(error('answer-in-lab-name', `The lab’s name ("${m.text}") contains the answer.`));
  }

  const cell = cellFor(q, draft.level, ctx.profile);
  const words = wordCount(q.stem);
  const what = `${SUBJECT_LABELS[q.subject]} ${q.kind === 'tossup' ? 'toss-ups' : 'bonuses'}`;
  if (words > STEM_LIMIT * cell.stemWords.p90) out.push(error('stem-long', `${words} words: nine in ten of DOE’s ${what} at this level are ${cell.stemWords.p90} words or fewer.`));
  else if (words > cell.stemWords.p90) out.push(warning('stem-longish', `${words} words: longer than nine in ten of DOE’s ${what} (${cell.stemWords.p90} words).`));

  if (q.format === 'short_answer' && !isNumericAnswer(q)) {
    const lower = withoutGuides(q.answer).split(/[^A-Za-z]+/).filter((w) => w.length >= 4 && w !== w.toUpperCase());
    if (lower.length) out.push(warning('answer-capitals', 'DOE prints answers in capitals.'));
  }
  if (/\b([Ww]e|[Mm]y|[Ll]et[’']s)\b/.test(heard)) out.push(warning('first-person', 'NSB questions are impersonal: no "we" or "my".'));
  if (/\b(is|are|was|were|does|do|did|would|will|can|could|has|have) not\b/.test(heard) && /\bwhich of the following\b/i.test(heard)) {
    out.push(warning('not-capitals', 'DOE prints NOT in capitals when a question asks for the exception.'));
  }

  if (freshness) {
    for (const f of formerLabNames(heard, ctx.labs)) out.push(error('former-lab-name', `"${f.found}" has been ${f.now} since ${f.until}.`));
    if (TIME_TIED.test(heard) && !draft.asOf) out.push(error('time-tied', 'The wording is tied to a date ("currently", "the newest", a recent year). Record the date it was true, or reword it.'));
    if (q.subject === 'energy' && mentions.length > 0 && !draft.sources?.some((s) => s.published)) {
      out.push(error('energy-source', 'An Energy question that names a lab needs the dated lab news item it was written from.'));
    }
  }
  return out;
}

export function hasErrors(findings: readonly Finding[]): boolean {
  return findings.some((f) => f.level === 'error');
}

/* ------------------------------------------------------------------ */
/* A round                                                             */
/* ------------------------------------------------------------------ */

/**
 * What is wrong with a set of questions taken together. Errors are things a generated round can avoid at no
 * cost (keys bunched on one letter, the right choice usually the longest, more than one NOT question);
 * warnings say where the round sits outside the range of DOE's own rounds.
 *
 * The key-letter rule is stricter than DOE's own practice: DOE's keys are even over a whole set (a quarter
 * on each letter), not within each round, and about a third of its 2019–22 rounds would fail it. A generated
 * round meets it for free, because `tidy` puts each key on the letter the round plan chose.
 */
export function checkRound(drafts: readonly Draft[], ctx: CheckContext): Finding[] {
  const out: Finding[] = [];
  if (drafts.length === 0) return out;
  const level = drafts[0]!.level;
  const band = ctx.profile.levels[level].perRound;
  const qs = drafts.map((d) => d.question);

  const keyed = qs.filter((q) => q.format === 'multiple_choice' && q.answerLetter);
  if (keyed.length >= 8) {
    for (const l of LETTERS) {
      const n = keyed.filter((q) => q.answerLetter === l).length;
      if (n > Math.ceil(LETTER_SHARE.high * keyed.length) || n < Math.floor(LETTER_SHARE.low * keyed.length)) {
        out.push(error('key-letters', `${n} of the ${keyed.length} multiple-choice keys are ${l}. Each letter should hold about a quarter.`));
      }
    }
  }
  const wordy = keyed.filter(hasWordChoices);
  if (wordy.length >= 6) {
    const longest = wordy.filter(rightIsLongest).length;
    if (longest / wordy.length > band.rightIsLongest.high) {
      out.push(error('right-longest-share', `The right choice is the longest in ${longest} of ${wordy.length} questions. In 95% of DOE’s rounds it is at most ${Math.round(100 * band.rightIsLongest.high)}%.`));
    }
    const mean = wordy.reduce((a, q) => a + choiceTexts(q).reduce((b, c) => b + wordCount(c), 0) / 4, 0) / wordy.length;
    if (mean > band.choiceMeanWords.high) out.push(warning('round-choices-long', `Choices average ${mean.toFixed(1)} words; 95% of DOE’s rounds stay within ${band.choiceMeanWords.high}.`));
  }
  const nots = qs.filter((q) => hasCapitalNot(q.stem)).length;
  if (nots > 1) out.push(error('not-count', `${nots} questions ask for the exception (NOT). DOE’s recent sets average fewer than one a round.`));

  for (const [kind, range, name] of [
    ['tossup', band.tossupStemMedian, 'toss-ups'],
    ['bonus', band.bonusStemMedian, 'bonuses'],
  ] as const) {
    const lengths = qs.filter((q) => q.kind === kind).map((q) => wordCount(q.stem));
    if (lengths.length < 6) continue;
    const mid = median(lengths);
    if (mid < range.low || mid > range.high) out.push(warning('round-stem-length', `The ${name} have a median of ${mid} words; DOE’s rounds run from ${range.low} to ${range.high}.`));
  }
  const share = keyed.length / qs.length;
  if (qs.length >= 20 && (share < band.multipleChoice.low || share > band.multipleChoice.high)) {
    out.push(warning('round-multiple-choice', `${Math.round(100 * share)}% of the round is multiple choice; DOE’s rounds run from ${Math.round(100 * band.multipleChoice.low)}% to ${Math.round(100 * band.multipleChoice.high)}%.`));
  }
  return out;
}
