/**
 * Proposing ideas (plan step 2). Before anything is written, the writer says in a few lines what each
 * question would test and how it would point at its answer. An idea costs little, and the screen at step 3
 * can hold it against the library: the November 2026 pilot wrote its questions first and then found that
 * nearly half repeated a library question.
 *
 * One request covers the slots of a round that share a topic (two at most), so their ideas do not collide,
 * and asks for three ideas a slot. An Energy slot is asked for alone, with the lab news item it is written from.
 */
import type { Level, Question } from '../../../src/core/schema';
import { topicName } from '../../../src/core/taxonomy';
import type { ModelReply, ModelRequest } from '../llm';
import type { Idea, NewsItem, Slot } from '../types';
import { SKILL_MEANING, slotLine, tierBrief } from './brief';
import { asReadWithAnswer, LEVEL_NAME, promptVersion } from './show';

/** How many ideas the writer gives for each slot. */
export const IDEAS_PER_SLOT = 3;

type Shown = Pick<Question, 'kind' | 'subject' | 'format' | 'stem' | 'answer' | 'accept' | 'reject'> & Partial<Pick<Question, 'choices' | 'answerLetter'>>;

export interface IdeaContext {
  /** A few of DOE's questions at the slots' level, tier and category (brief.ts, levelExamples). */
  examples: Shown[];
  /** The answers the library already uses in the topic (brief.ts, takenAnswers). */
  taken: string[];
  /** An Energy slot: the lab news item the question will open with. */
  news?: NewsItem;
}

export const ideasSystem = (level: Level) => `You help write practice questions for the National Science Bowl, a buzzer competition in science and mathematics that the U.S. Department of Energy runs for ${LEVEL_NAME[level]} teams. Your part is the first one: proposing ideas. An idea is not a question. It is a few short lines saying what a question would test and how it would point to its answer, so that the idea can be checked against the questions that already exist before anyone writes it out.

<why_this_step_exists>
Teams practice on a library of about 24,000 questions from past official events, and strong players have heard most of them. A new question is worth writing only if it tests science those players cannot answer from memory of the library. That is the hard part. In an earlier trial, nearly half of the questions a model drafted asked for an answer the library already asks for, from the same fact. The first fact that comes to mind about a topic is the one that has already been asked, usually many times.
</why_this_step_exists>

<what_you_are_given>
- The level: how hard this round is meant to be.
- One or two slots of the round. Each has an id, a category, toss-up or bonus, a form, a skill and a topic.
- A few official questions of this level and category. They show how hard and how specialised the round is. They are not models to imitate: do not reuse their answers or their facts.
- The answers the library already uses in the topic, most used first.
- For an Energy slot, a news item from a national laboratory.
</what_you_are_given>

<how_to_propose>
Give ${IDEAS_PER_SLOT} ideas for each slot. Make them differ from one another in answer and in subject matter within the topic, so that if one turns out to be taken the others are not.

Originality
- Go past the first fact that comes to mind. The headline fact of a textbook section has been asked. What follows from it often has not: a consequence, a mechanism, an exception, a comparison of two cases, a quantity that takes a step to find, the principle at work in an unfamiliar case.
- Prefer an answer that is not on the list of answers already used. An answer on the list may be used again only when the question reaches it from a clearly different fact; then say in the cue what is different.
- Do not turn a well-known fact around, asking for X given Y where questions usually ask for Y given X. A player who knows one knows the other.

Level
- Match the level described and shown. An idea every team would get is as useless as one no team would.
- Stay inside what the level's textbooks teach. Hard means a deeper or less travelled part of the subject, or one more step of reasoning. It never means trivia, a record that may be broken, a date, or a fact only a specialist meets.

Soundness
- The fact must be settled science as textbooks at this level state it, and you must be sure of it. Leave out anything you would want to look up, anything that depends on the date, and anything on which sources differ.
- The question must have exactly one answer that can be defended. If a knowledgeable player could give a different answer, or the same answer at another level of detail, tighten the cue or drop the idea.
- A short answer is one or two words, or a number.

The skill a slot asks for
- recall: ${SKILL_MEANING.recall}.
- application: ${SKILL_MEANING.application}. Say in the cue what the case is.
- computation: ${SKILL_MEANING.computation}, which is 5 seconds after the reading ends for a toss-up and 20 seconds for a bonus, on scratch paper with no calculator. Choose numbers that come out exactly. Give the method and every number, and work the answer out.

The form a slot asks for
- multiple choice or short answer: an idea is an answer, the fact tested and the cue.
- "Identify all": the question will list three items and ask which of them have a property. Give the property as the fact and, under "answer", the three items, each marked yes or no. Each item must be clearly one or the other.
- "Rank": the question will list three items and ask for them in order of a quantity. Give the quantity as the fact and, under "answer", the three items in increasing order, with the values that settle the order. The values must be clearly apart.

Energy slots
The Department of Energy's own Energy questions open with a sentence about research at one of its national laboratories and then ask an ordinary science question about the science behind it. Build each idea on the news item given. The question must turn on science a student could know without having read the news, from any of biology, chemistry, physics, earth science or mathematics. It must never ask what the laboratory did, found or announced.
</how_to_propose>

<reply>
For each idea give:
- slot: the slot's id.
- answer: the answer, as short as it can be (or the marked items of a list question).
- fact: one sentence stating the fact, relationship or method the question tests.
- cue: one sentence saying what the question will tell the player to point at the answer. Describe the question; do not write it.
- method: for a computation, the method with its numbers and the worked result. Otherwise an empty string.
</reply>`;

export const IDEAS_PROMPT = promptVersion(ideasSystem('HS'));

export const IDEAS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ideas'],
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slot', 'answer', 'fact', 'cue', 'method'],
        properties: { slot: { type: 'string' }, answer: { type: 'string' }, fact: { type: 'string' }, cue: { type: 'string' }, method: { type: 'string' } },
      },
    },
  },
};

/** A news item as a model is shown it. */
export function newsText(news: NewsItem): string {
  return `Laboratory: ${news.lab}\nPublished: ${news.date}\nTitle: ${news.title}\nSummary: ${news.summary}`;
}

export function examplesText(examples: readonly Shown[]): string {
  return examples.length ? examples.map((q, i) => `(${i + 1})\n${asReadWithAnswer(q)}`).join('\n\n') : '(none)';
}

/** The slots must share a level, a tier, a category and a topic: `context` describes all of them. */
export function ideasRequest(id: string, slots: readonly Slot[], context: IdeaContext, model: string): ModelRequest {
  const first = slots[0];
  if (!first) throw new Error('An ideas request needs at least one slot.');
  if (slots.some((s) => s.level !== first.level || s.tier !== first.tier || s.subject !== first.subject || s.topic !== first.topic)) throw new Error('The slots of one ideas request share a level, a tier, a category and a topic.');
  if (first.subject === 'energy' && slots.length > 1) throw new Error('An Energy slot is asked for alone: each has its own news item.');
  const parts = [
    `<level>\n${tierBrief(first.level, first.tier)}\n</level>`,
    `<slots>\n${slots.map(slotLine).join('\n')}\n</slots>`,
    `<official_questions_at_this_level>\n${examplesText(context.examples)}\n</official_questions_at_this_level>`,
    `<answers_already_used topic="${topicName(first.topic)}">\n${context.taken.length ? context.taken.join('; ') : '(none recorded)'}\n</answers_already_used>`,
    ...(context.news ? [`<news_item>\n${newsText(context.news)}\n</news_item>`] : []),
  ];
  return { id, step: 'ideas', model, effort: 'medium', system: ideasSystem(first.level), user: parts.join('\n\n'), schema: IDEAS_SCHEMA, maxTokens: 8000 };
}

/** The ideas in a reply, by slot id, or null when the reply is not one. Ideas for a slot that was not asked about are dropped. */
export function readIdeas(reply: ModelReply, slots: readonly Slot[]): Map<string, Idea[]> | null {
  if (reply.outcome !== 'ok') return null;
  const list = (reply.json as { ideas?: unknown } | undefined)?.ideas;
  if (!Array.isArray(list)) return null;
  const out = new Map<string, Idea[]>(slots.map((s) => [s.id, []]));
  const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  for (const raw of list as Array<Record<string, unknown>>) {
    const mine = out.get(text(raw?.slot).replace(/:$/, ''));
    const idea: Idea = { answer: text(raw?.answer), fact: text(raw?.fact), cue: text(raw?.cue), ...(text(raw?.method) ? { method: text(raw?.method) } : {}) };
    if (mine && idea.answer && idea.fact) mine.push(idea);
  }
  return out;
}

/** An idea as search takes it (search.ts): its three lines stand in for a stem. */
export function ideaQuery(idea: Idea): { stem: string; answer: string } {
  return { stem: [idea.fact, idea.cue, idea.method ?? ''].filter(Boolean).join(' '), answer: idea.answer };
}
