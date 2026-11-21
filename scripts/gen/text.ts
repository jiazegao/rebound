/**
 * Word tools shared by the style profile, the house-style checks and library search: counting words the
 * way DOE's packets are measured, picking out the words that carry meaning, and recognising the fixed
 * question forms ("Identify all of the following three…", "Rank the following three…").
 */
import { normalizeForFingerprint } from '../../src/core/fingerprint';
import { parseNumber } from '../../src/core/judge/numbers';
import { LETTERS, type Question } from '../../src/core/schema';

/** Pronunciation and reading guides, which a moderator sees but does not read: "[ves-TIB-u-lar]". */
const GUIDE = /\[[^\]]*\]/g;

/** The text as it is heard: guides removed, spaces collapsed. */
export function withoutGuides(text: string): string {
  return text.replace(GUIDE, ' ').replace(/\s+/g, ' ').trim();
}

/** Words in a stem or a choice, not counting pronunciation guides. */
export function wordCount(text: string): number {
  const heard = withoutGuides(text);
  return heard ? heard.split(' ').length : 0;
}

/** Lower case, guides and punctuation removed: the form two texts are compared in. */
export const plain = normalizeForFingerprint;

/** Common words that say nothing about what a question is on. */
const FILLER = new Set(
  'a an the of in on at to for from by with and or is are was were be been which what that this these those following it its as into than then would will can could should does do did has have had not no one two three'.split(
    ' ',
  ),
);

/** The words that carry a text's meaning, in order (repeats kept): what library search compares. */
export function contentWords(text: string): string[] {
  return plain(text)
    .split(' ')
    .filter((w) => w.length > 1 && !FILLER.has(w));
}

/**
 * "Identify all of the following three … that …: 1) …; 2) …; 3) …." The sentence may follow a lead-in
 * ("Scientists at … are studying …. Identify all of the following three …").
 */
export function isIdentifyAll(stem: string): boolean {
  return /(?:^|[.?!]["”’)]*\s+)identify all\b/i.test(stem.trim());
}

/** "Rank the following three … in order of increasing …: 1) …; 2) …; 3) …." (also Order, Place and Arrange). */
export function isRank(stem: string): boolean {
  return /(?:^|[.?!]["”’)]*\s+)(rank|order|place|arrange) the following\b/i.test(stem.trim());
}

/** The numbered items of a list question, by their numbers: "1) Saturn; 2) Uranus; 3) Neptune." → 3 items. */
export function listItems(stem: string): number[] {
  // An item's number follows the colon or the item before it, never a comma: "(5, 1, 8)" is a point, not item 8.
  return [...stem.matchAll(/(?:^|[:;.])\s*(\d)\)\s*\S/g)].map((m) => Number(m[1]));
}

/** An Energy-style opening: "Scientists at Oak Ridge National Laboratory are studying…". */
export function hasLabLeadIn(stem: string): boolean {
  return /^\s*(scientists|researchers|engineers|physicists|chemists|biologists|a team|teams)\b[^.?]{0,40}?\b(at|from|with)\b/i.test(stem);
}

/** A stem that asks for the exception, with NOT in capitals as DOE prints it. */
export function hasCapitalNot(stem: string): boolean {
  return /\bNOT\b/.test(withoutGuides(stem));
}

type Answered = Pick<Question, 'format' | 'stem' | 'answer'> & Partial<Pick<Question, 'choices'>>;

/** Whether a text reads as a number (with or without a unit). */
export function isNumber(text: string): boolean {
  return parseNumber(withoutGuides(text)) !== null;
}

/** A question whose answer is a number: a numeric short answer, or four numeric choices. List questions are not. */
export function isNumericAnswer(q: Answered): boolean {
  if (isIdentifyAll(q.stem) || isRank(q.stem)) return false;
  if (q.format === 'multiple_choice') return !!q.choices && LETTERS.every((l) => isNumber(q.choices![l] ?? ''));
  return isNumber(q.answer);
}

/** The middle value of a list (the mean of the middle two when the count is even); 0 for an empty list. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The value that `p` of the list (0–1) is at or below, by nearest rank; 0 for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]!;
}
