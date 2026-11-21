/**
 * Recomputing (plan step 7): every question with a numeric answer is worked again, blind, by a model that
 * must do its arithmetic in code. The result is held against the answer line by Rebound's answer checker.
 * It also says whether the values given can all be true together: one of DOE's own questions gave a gas a
 * density it could not have.
 *
 * A reply that uses the code tool cannot also be held to a JSON shape, so the model is told to end with a
 * JSON object, and that is read from the end of its text.
 */
import { parseNumber, sameValue } from '../../../src/core/judge/numbers';
import { LETTERS, type Letter, type Level, type Question } from '../../../src/core/schema';
import { lastJsonObject, type ModelReply, type ModelRequest } from '../llm';
import type { QuestionText } from '../types';
import { asRead, LEVEL_NAME, promptVersion } from './show';
import { compare } from './solve';

type Asked = Pick<Question, 'kind' | 'subject' | 'format' | 'stem' | 'answer' | 'accept' | 'reject'> & Partial<Pick<Question, 'choices' | 'answerLetter'>>;

export interface Computation {
  /** The answer in the competition's form; for multiple choice, the choice's text. */
  answer: string;
  letter: Letter | '';
  /** The answer as a decimal, when it is a single number. */
  value: number | null;
  /** Whether the values the question gives are possible, and possible together. */
  consistent: boolean;
  problems: string[];
  /** Seconds a strong player needs by hand. */
  seconds: number;
}

export const computeSystem = (level: Level) => `You check calculation questions written for the National Science Bowl, a buzzer competition in science and mathematics for ${LEVEL_NAME[level]} teams. You are given one question exactly as a moderator would read it, without its answer line. Work out the answer, doing the arithmetic in code, and say whether the question's numbers make sense.

<how_to_work>
- Set the problem up yourself from the wording. Then use the code execution tool for every calculation: do not rely on arithmetic done in your head. Where the answer should be exact, compute it exactly (Python's fractions module, or sympy for radicals, pi and algebra), and print what you find.
- Unless the question gives other values: g is 9.8 meters per second squared, the speed of light is 3 × 10^8 meters per second, the speed of sound is 340 meters per second, absolute zero is −273 degrees Celsius, friction and air resistance are ignored, angles are in radians, and numbers given in the question are exact.
- For a multiple-choice question, calculate first and then find the choice that matches. If no choice matches, or two do, say so.
- Check what the question gives. Are the values physically possible, and possible together (a density no gas has, a triangle that cannot exist, a probability above 1, a speed above that of light)? Is anything a player needs left out? Can the wording be read two ways that lead to different answers? Does the question say how to round, if the exact answer is not a tidy number?
- Estimate how many seconds a strong player needs to do this by hand on scratch paper, with no calculator, after the reading ends. A toss-up allows 5 seconds and a bonus 20.
</how_to_work>

<answer_form>
The competition wants numerical answers exact and in simplest form: whole numbers as whole numbers, fractions in lowest terms, radicals simplified and denominators rationalized, multiples of pi left as pi, no scientific notation unless the question asks for it, rounded only as the question says, and no unit unless the question asks for one.
</answer_form>

<reply>
Say briefly how you set the problem up. Then end your reply with one JSON object and nothing after it:
{"answer": "the answer in the competition's form (for multiple choice, the text of the choice)", "letter": "W, X, Y or Z for multiple choice, otherwise an empty string", "value": the answer as a decimal number, or null if it is not a single number, "consistent": true or false, "problems": ["one short sentence for each thing wrong with the question; empty if nothing is"], "seconds": a number}
</reply>`;

export const COMPUTE_PROMPT = promptVersion(computeSystem('HS'));

/** The request holds the question as it is read and nothing else. */
export function computeRequest(id: string, question: Asked | QuestionText, level: Level, model: string): ModelRequest {
  return { id, step: 'compute', model, effort: 'medium', system: computeSystem(level), user: asRead(question), code: true, maxTokens: 8000 };
}

export function readComputation(reply: ModelReply): Computation | null {
  if (reply.outcome !== 'ok') return null;
  const c = lastJsonObject(reply.text) as Record<string, unknown> | undefined;
  if (!c || typeof c.answer !== 'string' || !c.answer.trim()) return null;
  const letter = (LETTERS as readonly string[]).includes(String(c.letter)) ? (c.letter as Letter) : '';
  return {
    answer: c.answer.trim(),
    letter,
    value: typeof c.value === 'number' && Number.isFinite(c.value) ? c.value : null,
    consistent: c.consistent !== false,
    problems: Array.isArray(c.problems) ? c.problems.filter((p): p is string => typeof p === 'string' && p.trim() !== '').map((p) => p.trim()) : [],
    seconds: typeof c.seconds === 'number' && c.seconds >= 0 ? c.seconds : 0,
  };
}

/**
 * How the recomputed answer stands against the answer line: "agrees", "disagrees", or "close" when the
 * values are equal and only the form differs (the key says 1/2 and the computation 0.5), which a person settles.
 */
export function computationAgrees(question: Asked | QuestionText, c: Computation): 'agrees' | 'close' | 'disagrees' {
  const verdict = compare(question, { answer: c.answer, letter: c.letter, confidence: 5, otherAnswers: [], problems: [], seconds: c.seconds, difficulty: 3 });
  if (verdict !== 'disagrees' || question.format === 'multiple_choice') return verdict;
  const key = parseNumber(question.answer);
  const mine = c.value ?? parseNumber(c.answer)?.value ?? null;
  return key && mine !== null && sameValue(key.value, mine) ? 'close' : 'disagrees';
}
