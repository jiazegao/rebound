/**
 * The difficulty rater (plan step 8): scores a question from 1 to 5 for its level, with DOE questions of
 * known tier beside it. DOE's only statement of difficulty is a round's place in its set: rounds 1–10 are
 * about equal, and rounds 11–17 get harder. So the anchors are a few of DOE's early-round and late-round
 * questions in the same category.
 *
 * Models judge difficulty poorly, most of all for hard questions, so this check is trusted only as far as it
 * can tell DOE's own early rounds from its late ones (trials/doe.ts measures that).
 */
import { SUBJECT_LABELS, type Level, type Question } from '../../../src/core/schema';
import type { ModelReply, ModelRequest } from '../llm';
import type { QuestionText } from '../types';
import { asReadWithAnswer, LEVEL_NAME, promptVersion } from './show';

type Shown = Pick<Question, 'kind' | 'subject' | 'format' | 'stem' | 'answer' | 'accept' | 'reject'> & Partial<Pick<Question, 'choices' | 'answerLetter'>>;

export interface Anchors {
  /** From DOE's rounds 1–10. */
  early: Shown[];
  /** From DOE's rounds 11–17. */
  late: Shown[];
}

export function rateSystem(level: Level, subject: Question['subject'], anchors: Anchors): string {
  const list = (qs: Shown[]) => qs.map((q, i) => `(${i + 1})\n${asReadWithAnswer(q)}`).join('\n\n');
  return `You rate how hard a question is for the National Science Bowl, a buzzer competition in science and math, at a ${LEVEL_NAME[level]} regional event. You are given a ${SUBJECT_LABELS[subject]} question with its answer line.

The competition's organizer, the U.S. Department of Energy, says only this about difficulty: the questions of a regional event's rounds 1 to 10 are about equally hard, and they get harder from round 11 to round 17. Below are real questions from each. They show the range, and they vary within each group.

<early_rounds>
${list(anchors.early)}
</early_rounds>

<late_rounds>
${list(anchors.late)}
</late_rounds>

Rate the question on this scale:
1: easier than the early-round examples; nearly every team would answer it.
2: like a typical early-round question.
3: between the two groups.
4: like a typical late-round question.
5: harder than the late-round examples; only the strongest players would answer it.

What makes a question hard here is what a player must know and do within the time: how advanced or uncommon the knowledge is for ${LEVEL_NAME[level]} students, how many steps of reasoning or arithmetic it takes without a calculator (5 seconds for a toss-up, 20 for a bonus), and how close the wrong choices are. Length and unfamiliar wording alone do not make it hard.

Reply with one sentence saying what a player must know and do to answer the question, and then the score.`;
}

export const RATE_PROMPT = promptVersion(rateSystem('HS', 'biology', { early: [], late: [] }));

export const RATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  // The sentence comes first, so the score follows from it.
  required: ['reason', 'score'],
  properties: { reason: { type: 'string' }, score: { type: 'integer', enum: [1, 2, 3, 4, 5] } },
};

export function rateRequest(id: string, question: Shown | QuestionText, level: Level, anchors: Anchors, model: string): ModelRequest {
  return { id, step: 'rate', model, effort: 'low', system: rateSystem(level, question.subject, anchors), user: asReadWithAnswer(question), schema: RATE_SCHEMA, maxTokens: 2000 };
}

export function readRating(reply: ModelReply): { score: number; reason: string } | null {
  if (reply.outcome !== 'ok') return null;
  const r = reply.json as { score?: unknown; reason?: unknown } | undefined;
  if (!r || typeof r.score !== 'number' || r.score < 1 || r.score > 5) return null;
  return { score: Math.round(r.score), reason: typeof r.reason === 'string' ? r.reason.trim() : '' };
}
