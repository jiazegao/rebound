/**
 * The duplicate judge (plan steps 3 and 6): given a draft and the library questions that search found, says
 * how the draft relates to the closest of them. Search finds candidates; this decides.
 *
 * Step 3 runs it on a one-line idea with a small model, to stop a doomed question before it is written.
 * Step 6 runs it on the finished text with a stronger one.
 */
import type { ModelReply, ModelRequest } from '../llm';
import type { Idea, QuestionText } from '../types';
import { asReadWithAnswer, promptVersion } from './show';

/** How a draft relates to a library question, closest first. The first two throw the draft away. */
export const RELATIONS = ['same', 'reversed', 'template', 'related', 'new'] as const;
export type Relation = (typeof RELATIONS)[number];

export interface Judgment {
  relation: Relation;
  /** The library question the relation is with ("" for "new", or when the model named none on the list). */
  match: string;
  reason: string;
}

/** Whether a draft with this relation to a library question is thrown away. */
export function isRepeat(relation: Relation): boolean {
  return relation === 'same' || relation === 'reversed';
}

export const JUDGE_SYSTEM = `You check draft questions for the National Science Bowl, a buzzer competition in science and math, against a library of questions that already exist. Teams practice on the library, so a team that hears a draft may already have heard every library question. A draft is worth keeping only if it tests those players on something the library has not already asked them in the same way.

You are given one draft and a list of library questions that a search found for it, likeliest first. Most of the list will have nothing to do with the draft: the search works on shared words. Compare the draft with each library question and report the closest relation you find.

The five relations, from closest to furthest:

same: The draft asks for the same answer from the same cue as a library question. The cue is the fact or description that points a player to the answer. Different wording, a different format (multiple choice instead of short answer), an added scene or a laboratory named in front do not make the cue different. For a calculation, "same" means the same method with the same numbers.
Example: the draft "In what unit is the frequency of a wave measured?" and the library question "What is the SI unit of frequency?" both point to the hertz by its being the unit of frequency.

reversed: The same single fact asked from the other end. What one question gives, the other asks for. A player who learned the fact from the library question can answer the draft from that fact alone.
Example: the library asks "What is the name of the process by which a solid changes directly into a gas?" (sublimation), and the draft asks "In sublimation, a solid changes directly into what state of matter?" (gas).

template: A calculation or procedure of the same kind and structure, with different numbers or objects, so the working is the same and the answer is not.
Example: the library asks for the area of a triangle with base 6 and height 4, and the draft asks for the area of a triangle with base 10 and height 7.

related: The same answer or the same topic, but a different fact or a different cue, so that having heard the library question does not give the draft away.
Example: the library asks "What vitamin does human skin make when it is exposed to sunlight?" and the draft asks "A lack of what vitamin causes rickets in children?" Both answers are vitamin D, from different facts.

new: Nothing on the list is close.

How to decide:
- Judge by what a player must know to answer, not by how the question is worded.
- A draft that is "same" or "reversed" is thrown away, so these two matter most. When the draft and a library question turn on one and the same fact, choose "same" or "reversed", however differently the draft is dressed. When they share a topic or an answer but turn on different facts, choose "related".
- Sharing an answer is not enough for "same": two questions can reach one answer from quite different facts.
- If several library questions are close, report the closest relation, and the id of the library question it is with.

Reply with the relation, the id of that library question exactly as it appears in the brackets (an empty string for "new"), and one sentence naming the fact or cue the two share, or how they differ.`;

export const JUDGE_PROMPT = promptVersion(JUDGE_SYSTEM);

export const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['relation', 'match', 'reason'],
  properties: {
    relation: { type: 'string', enum: [...RELATIONS] },
    match: { type: 'string' },
    reason: { type: 'string' },
  },
};

/** A library question as the judge sees it: one line, with its id. */
export interface Listed {
  id: string;
  line: string;
}

function userText(draft: string, library: readonly Listed[]): string {
  return `<draft>\n${draft}\n</draft>\n\n<library>\n${library.length ? library.map((l) => l.line).join('\n') : '(the search found nothing)'}\n</library>`;
}

/** The draft as the judge sees it: a finished question with its answer line, or an idea's three lines. */
export function draftText(draft: QuestionText | Idea | string): string {
  if (typeof draft === 'string') return draft;
  if ('stem' in draft) return asReadWithAnswer(draft);
  return [`Answer: ${draft.answer}`, `Fact tested: ${draft.fact}`, `How the question will point to it: ${draft.cue}`, ...(draft.method ? [`Method and numbers: ${draft.method}`] : [])].join('\n');
}

/** `draft` may also be text already laid out, for a draft that is known only by its stem and answer. */
export function judgeRequest(id: string, draft: QuestionText | Idea | string, library: readonly Listed[], model: string): ModelRequest {
  const step = typeof draft !== 'string' && !('stem' in draft) ? 'judge-idea' : 'judge-text';
  return { id, step, model, effort: 'medium', system: JUDGE_SYSTEM, user: userText(draftText(draft), library), schema: JUDGE_SCHEMA, maxTokens: 3000 };
}

/** The judgment in a reply, or null when the reply is not one. A match that is not on the list is dropped. */
export function readJudgment(reply: ModelReply, library: readonly Listed[]): Judgment | null {
  if (reply.outcome !== 'ok') return null;
  const j = reply.json as Partial<Judgment> | undefined;
  if (!j || typeof j.relation !== 'string' || !(RELATIONS as readonly string[]).includes(j.relation)) return null;
  const named = typeof j.match === 'string' ? j.match.replace(/^\[|\]$/g, '').trim() : '';
  const match = j.relation !== 'new' && library.some((l) => l.id === named) ? named : '';
  return { relation: j.relation as Relation, match, reason: typeof j.reason === 'string' ? j.reason.trim() : '' };
}
