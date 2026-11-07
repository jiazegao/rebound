import { LETTERS, type Letter } from '../schema';
import type { Rng } from './rng';

/**
 * Four multiple-choice options: the correct answer and three distractors, shuffled into W–Z.
 * Distractors equal to the answer or to each other are dropped; at least three different ones are needed.
 */
export function multipleChoice(correct: string, distractors: readonly string[], rng: Rng): { choices: Record<Letter, string>; answerLetter: Letter } {
  const key = (s: string) => s.trim().toLowerCase();
  const seen = new Set([key(correct)]);
  const others: string[] = [];
  for (const d of distractors) {
    if (seen.has(key(d))) continue;
    seen.add(key(d));
    others.push(d);
  }
  if (others.length < 3) throw new Error(`multipleChoice: need 3 different distractors for "${correct}", got ${others.length}`);
  const options = rng.shuffle([correct, ...rng.sample(others, 3)]);
  const choices = Object.fromEntries(LETTERS.map((l, i) => [l, options[i]!])) as Record<Letter, string>;
  const answerLetter = LETTERS[options.indexOf(correct)]!;
  return { choices, answerLetter };
}

/**
 * Four options in a fixed order (for numbers, ascending reads naturally): the answer and three
 * distractors, sorted by `order`.
 */
export function orderedChoices(
  correct: string,
  distractors: readonly string[],
  rng: Rng,
  order: (a: string, b: string) => number,
): { choices: Record<Letter, string>; answerLetter: Letter } {
  const { choices } = multipleChoice(correct, distractors, rng);
  const sorted = Object.values(choices).sort(order);
  const out = Object.fromEntries(LETTERS.map((l, i) => [l, sorted[i]!])) as Record<Letter, string>;
  return { choices: out, answerLetter: LETTERS[sorted.indexOf(correct)]! };
}
