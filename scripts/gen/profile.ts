/**
 * The style profile: what DOE's most recent sample sets (2019–22) look like in numbers, by level, category
 * and toss-up or bonus. The round plan draws its mix of question forms from it, and the house-style checks
 * take their length limits from it.
 *
 *   npx tsx scripts/gen/profile.ts        (npm run gen:profile)
 *
 * writes scripts/gen/data/style-profile.json. The file has no timestamp, so re-running on the same library
 * changes nothing, and a test (profile.test.ts) fails when the file is out of date. Run it after the
 * library changes (a new DOE set, or a correction to a 2019–22 question).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_SUBJECTS, LETTERS, type CoreSubject, type Letter, type Level, type QuestionKind } from '../../src/core/schema';
import { loadLabs, namesLabOrDoe, type LabTable } from './labs';
import { DATA_DIR, loadLibrary, recentQuestions, type LibraryQuestion } from './library';
import { hasCapitalNot, hasLabLeadIn, isIdentifyAll, isNumber, isNumericAnswer, isRank, median, percentile, withoutGuides, wordCount } from './text';

export const PROFILE_FILE = path.join(DATA_DIR, 'style-profile.json');
/** The first season counted as DOE's current style. */
export const PROFILE_FROM_YEAR = 2019;

/** A typical value and the value nine in ten fall at or below. */
export interface Spread {
  median: number;
  p90: number;
}

/** How a measure varies from one DOE round to the next: the 5th percentile, the median and the 95th percentile. */
export interface Band {
  low: number;
  mid: number;
  high: number;
}

/** One group of questions. Shares are fractions of the group (0–1) unless a field says otherwise. */
export interface CellProfile {
  questions: number;
  multipleChoice: number;
  /** A numeric short answer, or four numeric choices. */
  numeric: number;
  /** "Identify all of the following three…" */
  identifyAll: number;
  /** "Rank the following three…" (also Order, Place, Arrange). */
  rank: number;
  /** Of the short-answer questions: those with an ACCEPT entry. */
  accept: number;
  /** Of the short-answer questions: those with a DO NOT ACCEPT entry. */
  doNotAccept: number;
  /** A pronunciation guide in the stem or a choice. */
  guide: number;
  /** Opens with "Scientists at…" or "Researchers at…". */
  labLeadIn: number;
  /** Names a national lab or the Department of Energy anywhere in the stem. */
  namesLab: number;
  /** Words in the stem, guides not counted. */
  stemWords: Spread;
}

export interface LevelProfile {
  questions: number;
  rounds: number;
  /** By category, then toss-up or bonus. */
  cells: Record<CoreSubject, Record<QuestionKind, CellProfile>>;
  /** The six categories together. */
  all: Record<QuestionKind, CellProfile>;
  choices: {
    /** Words in one choice, over every multiple-choice question. */
    words: Spread;
    /** The mean words per choice of a question whose choices are not numbers. */
    meanWords: Spread & { p95: number };
    /** The share of keys on each letter. */
    letters: Record<Letter, number>;
    /** Of the questions whose choices are not numbers: those whose right choice is the longest. */
    rightIsLongest: number;
    /** Multiple-choice stems that end with a question mark. */
    endsWithQuestionMark: number;
  };
  /** Questions with NOT in capitals. */
  capitalNot: number;
  /** How DOE's own rounds differ from each other, for judging a whole round. */
  perRound: {
    tossupStemMedian: Band;
    bonusStemMedian: Band;
    multipleChoice: Band;
    /** Mean words per choice, over the round's choices that are not numbers. */
    choiceMeanWords: Band;
    /** Share of the round's non-numeric multiple-choice questions whose right choice is the longest. */
    rightIsLongest: Band;
  };
}

export interface StyleProfile {
  about: string;
  fromYear: number;
  sets: string[];
  levels: Record<Level, LevelProfile>;
}

const share = (part: number, whole: number) => (whole ? Math.round((1000 * part) / whole) / 1000 : 0);
const tenth = (x: number) => Math.round(10 * x) / 10;
const spread = (values: number[]): Spread => ({ median: tenth(median(values)), p90: tenth(percentile(values, 0.9)) });
const band = (values: number[], round: (x: number) => number): Band => ({ low: round(percentile(values, 0.05)), mid: round(median(values)), high: round(percentile(values, 0.95)) });
const thousandth = (x: number) => Math.round(1000 * x) / 1000;

/** The choices of a multiple-choice question, in letter order. */
export function choiceTexts(q: { choices?: Partial<Record<Letter, string>> }): string[] {
  return q.choices ? LETTERS.map((l) => q.choices![l] ?? '') : [];
}

/** A multiple-choice question whose choices are words, not numbers: the kind a long right choice gives away. */
export function hasWordChoices(q: { format: string; choices?: Partial<Record<Letter, string>> }): boolean {
  return q.format === 'multiple_choice' && !!q.choices && !choiceTexts(q).every(isNumber);
}

const length = (text: string) => withoutGuides(text).length;

/** Whether the right choice is longer than every other choice. */
export function rightIsLongest(q: { choices?: Partial<Record<Letter, string>>; answerLetter?: Letter }): boolean {
  if (!q.choices || !q.answerLetter) return false;
  const right = length(q.choices[q.answerLetter] ?? '');
  return LETTERS.every((l) => l === q.answerLetter || length(q.choices![l] ?? '') < right);
}

function cell(group: readonly LibraryQuestion[], labs: LabTable): CellProfile {
  const qs = group.map((x) => x.question);
  const short = qs.filter((q) => q.format === 'short_answer');
  const count = (test: (q: LibraryQuestion['question']) => boolean) => share(qs.filter(test).length, qs.length);
  return {
    questions: qs.length,
    multipleChoice: count((q) => q.format === 'multiple_choice'),
    numeric: count(isNumericAnswer),
    identifyAll: count((q) => isIdentifyAll(q.stem)),
    rank: count((q) => isRank(q.stem)),
    accept: share(short.filter((q) => q.accept.length > 0).length, short.length),
    doNotAccept: share(short.filter((q) => q.reject.length > 0).length, short.length),
    guide: count((q) => /\[[^\]]+\]/.test([q.stem, ...choiceTexts(q)].join(' '))),
    labLeadIn: count((q) => hasLabLeadIn(q.stem)),
    namesLab: count((q) => namesLabOrDoe(q.stem, labs)),
    stemWords: spread(qs.map((q) => wordCount(q.stem))),
  };
}

function levelProfile(group: readonly LibraryQuestion[], labs: LabTable): LevelProfile {
  const core = group.filter((x) => (CORE_SUBJECTS as string[]).includes(x.question.subject));
  const of = (kind: QuestionKind, subject?: CoreSubject) => core.filter((x) => x.question.kind === kind && (!subject || x.question.subject === subject));
  const cells = Object.fromEntries(CORE_SUBJECTS.map((s) => [s, { tossup: cell(of('tossup', s), labs), bonus: cell(of('bonus', s), labs) }])) as LevelProfile['cells'];

  const mc = core.map((x) => x.question).filter((q) => q.format === 'multiple_choice' && q.choices && q.answerLetter);
  const wordy = mc.filter(hasWordChoices);
  const meanWords = (q: (typeof mc)[number]) => choiceTexts(q).reduce((a, c) => a + wordCount(c), 0) / 4;
  const means = wordy.map(meanWords);

  const byRound = new Map<string, LibraryQuestion[]>();
  for (const x of core) byRound.set(x.roundId, [...(byRound.get(x.roundId) ?? []), x]);
  const rounds = [...byRound.values()];
  const perRound = <T,>(f: (qs: LibraryQuestion['question'][]) => T | null) => rounds.map((r) => f(r.map((x) => x.question))).filter((v): v is T => v !== null);
  const wordyOf = (qs: LibraryQuestion['question'][]) => qs.filter((q) => hasWordChoices(q) && q.answerLetter);

  return {
    questions: core.length,
    rounds: rounds.length,
    cells,
    all: { tossup: cell(of('tossup'), labs), bonus: cell(of('bonus'), labs) },
    choices: {
      words: spread(mc.flatMap((q) => choiceTexts(q).map(wordCount))),
      meanWords: { median: tenth(median(means)), p90: tenth(percentile(means, 0.9)), p95: tenth(percentile(means, 0.95)) },
      letters: Object.fromEntries(LETTERS.map((l) => [l, share(mc.filter((q) => q.answerLetter === l).length, mc.length)])) as Record<Letter, number>,
      rightIsLongest: share(wordy.filter(rightIsLongest).length, wordy.length),
      endsWithQuestionMark: share(mc.filter((q) => /\?["”’')]*$/.test(q.stem.trim())).length, mc.length),
    },
    capitalNot: share(core.filter((x) => hasCapitalNot(x.question.stem)).length, core.length),
    perRound: {
      tossupStemMedian: band(perRound((qs) => median(qs.filter((q) => q.kind === 'tossup').map((q) => wordCount(q.stem)))), tenth),
      bonusStemMedian: band(perRound((qs) => median(qs.filter((q) => q.kind === 'bonus').map((q) => wordCount(q.stem)))), tenth),
      multipleChoice: band(perRound((qs) => qs.filter((q) => q.format === 'multiple_choice').length / qs.length), thousandth),
      // Rounds with fewer than four such questions say little, so they are left out.
      choiceMeanWords: band(perRound((qs) => (wordyOf(qs).length >= 4 ? wordyOf(qs).reduce((a, q) => a + meanWords(q), 0) / wordyOf(qs).length : null)), tenth),
      rightIsLongest: band(perRound((qs) => (wordyOf(qs).length >= 4 ? wordyOf(qs).filter(rightIsLongest).length / wordyOf(qs).length : null)), thousandth),
    },
  };
}

/** Measure the profile from the library's questions (all of them; the recent complete ones are picked here). */
export function measureProfile(library: readonly LibraryQuestion[], labs: LabTable = loadLabs(), fromYear = PROFILE_FROM_YEAR): StyleProfile {
  const recent = recentQuestions(library, fromYear);
  return {
    about:
      `Measured from DOE's National Science Bowl sample sets of ${fromYear} and later in Rebound's library, by scripts/gen/profile.ts. ` +
      'Shares are fractions (0–1) of the group they sit in; word counts leave out pronunciation guides. Do not edit by hand: run npm run gen:profile.',
    fromYear,
    sets: [...new Set(recent.map((x) => x.setId))],
    levels: { HS: levelProfile(recent.filter((x) => x.level === 'HS'), labs), MS: levelProfile(recent.filter((x) => x.level === 'MS'), labs) },
  };
}

/** The profile file's text for a library. */
export function profileText(library: readonly LibraryQuestion[]): string {
  return `${JSON.stringify(measureProfile(library), null, 1)}\n`;
}

/** The committed profile. */
export function loadProfile(file = PROFILE_FILE): StyleProfile {
  return JSON.parse(readFileSync(file, 'utf8')) as StyleProfile;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = profileText(loadLibrary());
  writeFileSync(PROFILE_FILE, text);
  const p = JSON.parse(text) as StyleProfile;
  for (const level of ['HS', 'MS'] as const) {
    const l = p.levels[level];
    console.log(`${level}: ${l.questions} questions in ${l.rounds} rounds; toss-ups ${Math.round(100 * l.all.tossup.multipleChoice)}% multiple choice, median ${l.all.tossup.stemWords.median} words; bonuses ${Math.round(100 * l.all.bonus.multipleChoice)}%, ${l.all.bonus.stemWords.median} words`);
  }
  console.log(`Wrote ${path.relative(process.cwd(), PROFILE_FILE)} from ${p.sets.length} sets (${p.sets[0]} … ${p.sets[p.sets.length - 1]})`);
}
