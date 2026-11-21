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

/** One library question the judge looked at closely. */
export interface Compared {
  id: string;
  /** What that library question tests, in the judge's words. */
  tests: string;
  /** What it shares with the draft and how the two differ: written before the relation, so the relation follows from it. */
  compare: string;
  relation: Exclude<Relation, 'new'>;
}

export interface Judgment {
  /** The closest relation the judge found. */
  relation: Relation;
  /** The library question the relation is with ("" for "new", or when the judge named one that is not on the list). */
  match: string;
  /** The judge's comparison with that question. */
  reason: string;
  /** What the draft tests, in the judge's words. */
  tests: string;
  /** The library questions the judge compared it with, three at most: the reviewer is shown these. */
  closest: Compared[];
}

/** Whether a draft with this relation to a library question is thrown away. */
export function isRepeat(relation: Relation): boolean {
  return relation === 'same' || relation === 'reversed';
}

export const JUDGE_SYSTEM = `You check draft questions for the National Science Bowl, a buzzer competition in science and math, against a library of questions that already exist. Teams practice on the library, so a team that hears a draft may already have heard every library question. A draft is worth keeping only if it tests those players on something the library has not already asked them in the same way.

You are given one draft and a list of library questions that a search found for it, likeliest first. Most of the list will have nothing to do with the draft: the search works on shared words.

How to work:
1. Say what the draft tests: the fact a player must know, and the cue, which is the description or setting that points the player to the answer.
2. Pick the library questions that come closest to it, three at most. Take them one at a time: say what the library question tests, then compare it with the draft (what the two share, and how they differ), and only then name the relation. The relation must follow from your comparison.

The relations, from closest to furthest:

same: The draft asks for the same answer from the same cue as the library question. Different wording, a different format (multiple choice instead of short answer), an added scene or a laboratory named in front do not make the cue different. For a calculation, "same" means the same method with the same numbers; a step added before or after it, or a new setting for it, does not change that.
Example: the draft "In what unit is the frequency of a wave measured?" and the library question "What is the SI unit of frequency?" both point to the hertz by its being the unit of frequency.

reversed: The same single fact asked from the other end. What one question gives, the other asks for. A player who learned the fact from the library question can answer the draft from that fact alone. This includes a fact that the library question's stem states outright on its way to asking something else.
Example: the library asks "What is the name of the process by which a solid changes directly into a gas?" (sublimation), and the draft asks "In sublimation, a solid changes directly into what state of matter?" (gas).
"Reversed" needs the same two things paired. Two questions of the same form about different things are not reversed: "What is the chemical symbol for sodium?" and "What element has the symbol K?" are a template pair.

template: A question of the same kind and structure about different numbers or different things, so that the working is the same and the answer is not.
Example: the library asks for the area of a triangle with base 6 and height 4, and the draft asks for the area of a triangle with base 10 and height 7.

related: The same answer or the same topic, but a different fact or a different cue, so that having heard the library question does not give the draft away.
Example: the library asks "What vitamin does human skin make when it is exposed to sunlight?" and the draft asks "A lack of what vitamin causes rickets in children?" Both answers are vitamin D, from different facts.

A library question that is none of these to the draft has nothing to do with it: leave it out.

How to decide:
- Judge by what a player must know to answer, not by how the question is worded.
- A draft that is "same" as or "reversed" from a library question is thrown away, so these two matter most. When the draft and a library question turn on one and the same fact, choose "same" or "reversed", however differently the draft is dressed. When they share a topic or an answer but turn on different facts, choose "related".
- Sharing an answer is not enough for "same": two questions can reach one answer from quite different facts.
- The setting is part of the cue. A draft that puts the same answer in the same setting as a library question, such as the same laboratory's research on the same thing, repeats it, even if its last clause is worded around a different detail.

Reply with what the draft tests, and then the closest library questions, three at most and none if nothing is close. For each give its id exactly as it appears in the brackets, what it tests, your comparison in one or two sentences, and last the relation.`;

export const JUDGE_PROMPT = promptVersion(JUDGE_SYSTEM);

const COMPARED = RELATIONS.filter((r) => r !== 'new');

export const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tests', 'closest'],
  properties: {
    tests: { type: 'string' },
    closest: {
      type: 'array',
      // The order matters: a model writes these in turn, and the relation has to come after the comparison.
      items: { type: 'object', additionalProperties: false, required: ['id', 'tests', 'compare', 'relation'], properties: { id: { type: 'string' }, tests: { type: 'string' }, compare: { type: 'string' }, relation: { type: 'string', enum: [...COMPARED] } } },
    },
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
  return { id, step, model, effort: 'medium', system: JUDGE_SYSTEM, user: userText(draftText(draft), library), schema: JUDGE_SCHEMA, maxTokens: 4000 };
}

/**
 * The judgment in a reply, or null when the reply is not one. The verdict is the closest relation among the
 * library questions the judge compared: it is worked out here, so it cannot contradict the comparisons. A
 * question the judge names that is not on the list keeps its relation and loses its id.
 */
export function readJudgment(reply: ModelReply, library: readonly Listed[]): Judgment | null {
  if (reply.outcome !== 'ok') return null;
  const j = reply.json as { tests?: unknown; closest?: unknown } | undefined;
  if (!j || !Array.isArray(j.closest)) return null;
  const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const closest: Compared[] = [];
  for (const raw of j.closest as Array<Record<string, unknown>>) {
    if (!raw || !(COMPARED as readonly string[]).includes(String(raw.relation))) return null;
    const named = text(raw.id).replace(/^\[|\]$/g, '').trim();
    closest.push({ id: library.some((l) => l.id === named) ? named : '', tests: text(raw.tests), compare: text(raw.compare), relation: raw.relation as Compared['relation'] });
  }
  // The closest relation wins; among equals, the first the judge listed.
  const best = [...closest].sort((a, b) => RELATIONS.indexOf(a.relation) - RELATIONS.indexOf(b.relation))[0];
  return { relation: best?.relation ?? 'new', match: best?.id ?? '', reason: best?.compare ?? 'Nothing the search found is close.', tests: text(j.tests), closest };
}
