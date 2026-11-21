/**
 * How a question is put in front of a model: as a moderator reads it, with or without its answer line.
 */
import { answerLine } from '../../../src/core/studio';
import { LETTERS, SUBJECT_LABELS, type Level, type Question } from '../../../src/core/schema';
import type { QuestionText } from '../types';

export const LEVEL_NAME: Record<Level, string> = { HS: 'high school', MS: 'middle school' };

type Shown = Pick<Question, 'kind' | 'subject' | 'format' | 'stem' | 'answer' | 'accept' | 'reject'> & Partial<Pick<Question, 'choices' | 'answerLetter'>>;

/** "TOSS-UP · PHYSICS · Short Answer", then the stem, then the choices: what a player hears, and nothing else. */
export function asRead(q: Shown | QuestionText): string {
  const head = `${q.kind === 'tossup' ? 'TOSS-UP' : 'BONUS'} · ${SUBJECT_LABELS[q.subject].toUpperCase()} · ${q.format === 'multiple_choice' ? 'Multiple Choice' : 'Short Answer'}`;
  const choices = q.format === 'multiple_choice' && q.choices ? LETTERS.map((l) => `${l}) ${q.choices![l] ?? ''}`) : [];
  return [head, q.stem.trim(), ...choices].join('\n');
}

/** The same, with the answer line a moderator sees. */
export function asReadWithAnswer(q: Shown | QuestionText): string {
  return `${asRead(q)}\nANSWER: ${answerLine(q)}`;
}

/** One library question on a line, for lists a judge reads: "[id] stem  W) … X) …  ANSWER: …". */
export function onOneLine(id: string, q: Pick<Question, 'stem' | 'answer'> & Partial<Pick<Question, 'choices' | 'answerLetter'>>): string {
  const choices = q.choices ? `  ${LETTERS.map((l) => `${l}) ${q.choices![l] ?? ''}`).join('  ')}` : '';
  const answer = q.choices && q.answerLetter ? `${q.answerLetter}) ${q.answer}` : q.answer;
  return `[${id}] ${q.stem.replace(/\s+/g, ' ').trim()}${choices}  ANSWER: ${answer}`;
}

/** A short stable name for a prompt's wording, recorded with every check so a change of prompt is visible. */
export function promptVersion(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
