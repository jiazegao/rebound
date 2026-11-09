/**
 * Letter-by-letter reading for solo practice.
 *
 * The speed setting stays in words per minute (what moderators and coaches talk about) and is
 * converted to characters using the average word length of the DOE library: 4.99 letters plus a
 * space ≈ 6 characters per word (measured over 349,392 words of stems and choices, Nov 2026).
 * Long words therefore take longer to read, as they do out loud. Pronunciation guides such as
 * "[ves-TIB-u-lar]" appear at once (a moderator does not read them aloud), and there is a short
 * pause before each answer choice.
 */
import { PRONUNCIATION } from '../core/judge/normalize';
import { LETTERS, type Question } from '../core/schema';

/** Average characters per word in the DOE library, including the space after the word. */
export const CHARS_PER_WORD = 6;
/** Pause before each answer choice, measured in characters of reading time. */
export const CHOICE_PAUSE_CHARS = 6;

export interface Reading {
  /** Stem, then one line per choice ("W) ..."), separated by "\n". */
  text: string;
  /** cumulative[i] = reading time (in characters) needed before character i is shown. */
  cumulative: number[];
  /** Reading time of the whole text, in characters. */
  totalUnits: number;
}

export function buildReading(q: Pick<Question, 'stem' | 'choices'>): Reading {
  const lines = [q.stem.trim(), ...(q.choices ? LETTERS.map((L) => `${L}) ${q.choices![L]}`) : [])];
  const text = lines.join('\n');
  const inGuide = new Array<boolean>(text.length).fill(false);
  for (const m of text.matchAll(new RegExp(PRONUNCIATION.source, 'gu'))) {
    for (let i = m.index; i < m.index + m[0].length; i++) inGuide[i] = true;
  }
  const cumulative: number[] = [];
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    units += text[i] === '\n' ? CHOICE_PAUSE_CHARS : inGuide[i] ? 0 : 1;
    cumulative.push(units);
  }
  return { text, cumulative, totalUnits: units };
}

/** Milliseconds per character at a given reading speed in words per minute. */
export function msPerChar(wpm: number): number {
  return 60_000 / (wpm * CHARS_PER_WORD);
}

/** Letters per minute shown next to the words-per-minute setting. */
export function lettersPerMinute(wpm: number): number {
  return wpm * CHARS_PER_WORD;
}

export function readingDurationMs(reading: Reading, wpm: number): number {
  return reading.totalUnits * msPerChar(wpm);
}

/** The reading speed that takes `durationMs` over the whole reading (a recording's length, for the text beside it). */
export function wpmFor(reading: Reading, durationMs: number): number {
  return reading.totalUnits > 0 && durationMs > 0 ? (60_000 * reading.totalUnits) / (durationMs * CHARS_PER_WORD) : 200;
}

/** How many characters are visible `elapsedMs` after the reading started. */
export function revealedCount(reading: Reading, elapsedMs: number, wpm: number): number {
  const units = Math.max(0, elapsedMs) / msPerChar(wpm);
  // Largest n such that the first n characters fit in the time read so far.
  let lo = 0;
  let hi = reading.cumulative.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (reading.cumulative[mid - 1] <= units) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Split the visible text into the finished part (shown at full strength) and the word that is
 * still appearing (shown fainter).
 */
export function splitRevealed(reading: Reading, count: number): { done: string; current: string } {
  const shown = reading.text.slice(0, count);
  if (count >= reading.text.length || /\s/.test(reading.text[count])) return { done: shown, current: '' };
  const partial = /\S+$/.exec(shown);
  if (!partial) return { done: shown, current: '' };
  return { done: shown.slice(0, partial.index), current: partial[0] };
}
