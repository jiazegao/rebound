/**
 * The blind solver (plan step 7): a model that is given a question as a player hears it, and nothing else,
 * and answers it. Its answer is then held against the answer line by Rebound's answer checker. A solver
 * that disagrees with the key has found a wrong key, a second right answer, or its own mistake; which one
 * is for the second look to settle.
 *
 * It also says what else could be defended as an answer, what is wrong with the question itself, how long it
 * would take, and how hard it is: the things a solver is placed to notice.
 */
import { judgeAnswer } from '../../../src/core/judge/judge';
import { LETTERS, type Letter, type Level, type Question } from '../../../src/core/schema';
import type { ModelReply, ModelRequest } from '../llm';
import type { QuestionText } from '../types';
import { asRead, LEVEL_NAME, promptVersion } from './show';

export const PROBLEMS = ['ambiguous', 'no-answer', 'factual', 'giveaway', 'too-slow', 'unclear-aloud', 'inconsistent'] as const;
export type ProblemKind = (typeof PROBLEMS)[number];

export interface Solution {
  /** The answer as a player would say it; for multiple choice, the choice's text. */
  answer: string;
  /** Multiple choice: the letter chosen. */
  letter: Letter | '';
  /** 1 (a guess) to 5 (certain). */
  confidence: number;
  /** Other answers a knowledgeable player could defend. */
  otherAnswers: string[];
  problems: Array<{ kind: ProblemKind; note: string }>;
  /** Seconds a strong player needs after the reading ends. */
  seconds: number;
  /** 1 (most teams answer it) to 5 (only the strongest players would). */
  difficulty: number;
}

export const solveSystem = (level: Level) => `You are helping check practice questions written for the National Science Bowl, a buzzer competition in science and math for ${LEVEL_NAME[level]} teams. You are given one question exactly as a moderator would read it, without its answer line. Answer it as a strong, careful player would, and report what you notice about the question itself.

About the competition, so that your answer is in the form its judges expect:
- A toss-up must be answered within 5 seconds of the end of the reading and a bonus within 20 seconds. Players have scratch paper and no calculator.
- A multiple-choice question has four choices, W, X, Y and Z, and exactly one should be right.
- A short answer is as brief as it can be. Numbers are exact and in simplest form: fractions reduced, radicals simplified, multiples of pi left as they are, no units unless the question asks for them, no scientific notation unless it asks.
- When a question begins "Identify all of the following three…", the answer is the numbers of the items that qualify ("1, 3"), or ALL, or NONE. When it begins "Rank the following three…", the answer is all the numbers in the order asked ("2, 1, 3").
- Unless a question says otherwise, g is 9.8 meters per second squared, the speed of sound is 340 meters per second, the speed of light is 3 × 10^8 meters per second, and angles are in radians.

What to return:
- answer: your answer as a player would say it. For multiple choice, give the text of the choice here and its letter in "letter".
- letter: W, X, Y or Z for a multiple-choice question; an empty string otherwise.
- confidence: 1 (a guess) to 5 (certain).
- otherAnswers: every other answer that a knowledgeable player could defend as correct, given how the question is worded. Leave it empty when there is none. Do not list answers that are simply wrong, or other ways of writing your own answer.
- problems: anything wrong with the question itself, each with one short note. The kinds are: "ambiguous" (the wording allows more than one reading or more than one answer), "no-answer" (it cannot be answered as asked, or no choice is right), "factual" (it states something false or out of date), "giveaway" (the wording or the shape of the choices gives the answer away), "too-slow" (the working cannot be done in the time allowed without a calculator), "unclear-aloud" (hard to follow when heard once), "inconsistent" (the values given cannot all be true together). Most questions are sound: leave the list empty unless you would say so to the question's writer.
- seconds: your estimate of the time a strong player needs after the reading ends.
- difficulty: how hard the question is for a ${LEVEL_NAME[level]} regional competition, from 1 (most teams would answer it) to 5 (only the strongest players would).

Work the question out before you answer, and check a calculation a second way. If you do not know, give your best answer with a low confidence.`;

export const SOLVE_PROMPT = promptVersion(solveSystem('HS'));

export const SOLVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'letter', 'confidence', 'otherAnswers', 'problems', 'seconds', 'difficulty'],
  properties: {
    answer: { type: 'string' },
    letter: { type: 'string', enum: ['W', 'X', 'Y', 'Z', ''] },
    confidence: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    otherAnswers: { type: 'array', items: { type: 'string' } },
    problems: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['kind', 'note'], properties: { kind: { type: 'string', enum: [...PROBLEMS] }, note: { type: 'string' } } },
    },
    seconds: { type: 'number' },
    difficulty: { type: 'integer', enum: [1, 2, 3, 4, 5] },
  },
};

type Asked = Pick<Question, 'kind' | 'subject' | 'format' | 'stem' | 'answer' | 'accept' | 'reject'> & Partial<Pick<Question, 'choices' | 'answerLetter'>>;

/** The request holds the question as it is read and nothing else: no answer line, no id that hints at its source. */
export function solveRequest(id: string, question: Asked | QuestionText, level: Level, model: string): ModelRequest {
  return { id, step: 'solve', model, effort: 'medium', system: solveSystem(level), user: asRead(question), schema: SOLVE_SCHEMA, maxTokens: 6000 };
}

const whole = (n: unknown, low: number, high: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(high, Math.max(low, Math.round(n))) : low);

export function readSolution(reply: ModelReply): Solution | null {
  if (reply.outcome !== 'ok') return null;
  const s = reply.json as Partial<Solution> | undefined;
  if (!s || typeof s.answer !== 'string') return null;
  const letter = (LETTERS as readonly string[]).includes(String(s.letter)) ? (s.letter as Letter) : '';
  const problems = Array.isArray(s.problems) ? s.problems.filter((p) => p && (PROBLEMS as readonly string[]).includes(p.kind)).map((p) => ({ kind: p.kind, note: String(p.note ?? '').trim() })) : [];
  return {
    answer: s.answer.trim(),
    letter,
    confidence: whole(s.confidence, 1, 5),
    otherAnswers: Array.isArray(s.otherAnswers) ? s.otherAnswers.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => a.trim()) : [],
    problems,
    seconds: typeof s.seconds === 'number' && s.seconds >= 0 ? s.seconds : 0,
    difficulty: whole(s.difficulty, 1, 5),
  };
}

/**
 * How a solver's answer stands against the answer line, by Rebound's answer checker: "agrees", "disagrees",
 * or "close" (the checker would ask a person: a near spelling, or an equal value in another form).
 */
export function compare(question: Asked | QuestionText, solution: Solution): 'agrees' | 'close' | 'disagrees' {
  const said = question.format === 'multiple_choice' ? solution.letter || solution.answer : solution.answer;
  if (!said) return 'disagrees';
  const verdict = judgeAnswer({ format: question.format, stem: question.stem, answer: question.answer, accept: question.accept, reject: question.reject, choices: question.choices, answerLetter: question.answerLetter }, said).verdict;
  return verdict === 'correct' ? 'agrees' : verdict === 'review' ? 'close' : 'disagrees';
}

/** An answer the solver calls defensible that the answer line would mark wrong: a possible second right answer. */
export function unacceptedAnswers(question: Asked | QuestionText, solution: Solution): string[] {
  if (question.format === 'multiple_choice') return solution.otherAnswers;
  return solution.otherAnswers.filter((a) => judgeAnswer({ format: question.format, stem: question.stem, answer: question.answer, accept: question.accept, reject: question.reject }, a).verdict === 'incorrect');
}
