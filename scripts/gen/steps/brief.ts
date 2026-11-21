/**
 * What the writer is told about a slot before it proposes ideas or writes (plan steps 2 and 4): how hard the
 * round is meant to be, a few of DOE's questions that show that level, the answers the library has already
 * used in the topic, and how long DOE's questions of the kind run.
 *
 * The level descriptions start from DOE's own guide for coaches (science.osti.gov/wdts/nsb, "Tips and
 * Resources"), which names the textbooks each event's questions are drawn from, and from its statement that
 * the later rounds of a regional event are harder than the first ten.
 */
import { SUBJECT_LABELS, type Level, type Question } from '../../../src/core/schema';
import { topicName } from '../../../src/core/taxonomy';
import { eligible, tierOf, type LibraryQuestion } from '../library';
import type { StyleProfile } from '../profile';
import { isIdentifyAll, isNumericAnswer, isRank, plain, withoutGuides, wordCount } from '../text';
import type { Form, Skill, Slot, Tier } from '../types';

/** DOE's own words for where each event's questions come from. */
const DOE_SOURCES: Record<Level, { regional: string; finals: string; math: string }> = {
  HS: { regional: 'AP-level high school science textbooks', finals: 'introductory college-level science textbooks', math: 'Math runs from pre-calculus through single-variable calculus, with probability, statistics, vectors, matrices and complex numbers.' },
  MS: { regional: '6th through 8th grade science textbooks and Algebra II textbooks', finals: 'honors-level high school science textbooks', math: 'Math stays within arithmetic, algebra through Algebra II, and geometry: no calculus.' },
};

/** How hard a round of this level and tier is meant to be, in the writer's terms. */
export function tierBrief(level: Level, tier: Tier): string {
  const d = DOE_SOURCES[level];
  const who = level === 'HS' ? 'high school' : 'middle school';
  const base = `The Department of Energy says the questions of a ${who} regional event are drawn from ${d.regional}, and those of the national finals from ${d.finals}. ${d.math}`;
  if (tier === 'early') {
    return `${base}\nThis round is like rounds 1 to 10 of a regional event, which are about equally hard. A question here tests the main body of those textbooks: something a student who has studied the subject well knows, or can work out in the time. It is not a giveaway: a team that has not studied should miss it.`;
  }
  return `${base}\nThis round is like rounds 11 to 17 of a regional event, which the Department of Energy makes harder than the first ten. A question here still starts from the regional textbooks, and reaches toward the finals' level: a less travelled chapter, a second step of reasoning, an exception to a rule, a quantity that takes two steps to find. Only the stronger teams should answer most of this round. What makes it hard is what a player must know or work out, never length, obscure trivia or wording meant to trip.`;
}

const FORM_NAME: Record<Form, string> = { multiple_choice: 'multiple choice', short_answer: 'short answer', identify_all: '"Identify all" (short answer)', rank: '"Rank" (short answer)' };

/** What each skill asks of a player: the writer is told which one a slot wants. */
export const SKILL_MEANING: Record<Skill, string> = {
  recall: 'the player must know a fact, a term or a relationship',
  application: 'the player must use a fact or principle on a case the textbook does not state: predict what happens, compare, pick the explanation, classify something unfamiliar',
  computation: 'the player must calculate the answer, by hand, in the time',
};

/** A slot as the writer is told it: "t07: Biology toss-up; multiple choice; application; topic: Genetics". */
export function slotLine(slot: Slot): string {
  return `${slot.id}: ${SUBJECT_LABELS[slot.subject]} ${slot.kind === 'tossup' ? 'toss-up' : 'bonus'}; ${FORM_NAME[slot.form]}; ${slot.skill}; topic: ${topicName(slot.topic)}`;
}

/** A repeatable source of random numbers (mulberry32) from a text. */
function seededBy(text: string): () => number {
  let a = 20261121;
  for (let i = 0; i < text.length; i++) a = (Math.imul(a ^ text.charCodeAt(i), 0x01000193) + 0x9e3779b1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A few of DOE's questions of a slot's level, tier, category and kind, to show the writer the level. The same
 * slot of the same round always gets the same ones. `exclude` keeps out questions that are being used as a
 * test (a writer shown a test question could repeat it).
 */
export function levelExamples(library: readonly LibraryQuestion[], slot: Pick<Slot, 'id' | 'level' | 'tier' | 'subject' | 'kind'>, count = 4, salt = '', exclude: ReadonlySet<string> = new Set()): Question[] {
  const pool = eligible(library).filter((x) => x.level === slot.level && x.question.subject === slot.subject && x.question.kind === slot.kind && tierOf(x.round) === slot.tier && !exclude.has(x.question.id));
  const random = seededBy(`${salt}/${slot.level}/${slot.tier}/${slot.subject}/${slot.kind}/${slot.id}`);
  const order = pool.map((x) => ({ x, r: random() })).sort((a, b) => a.r - b.r || a.x.question.id.localeCompare(b.x.question.id));
  return order.slice(0, count).map((o) => o.x.question);
}

/** The most answers of a topic the writer is shown. */
export const TAKEN_LIMIT = 250;

/**
 * The answers the library already uses in a topic at a level, most used first: what a new idea should steer
 * away from. Only answers a new question could collide with are listed: words and names of up to four words,
 * not numbers, not the item numbers of a list question, not a whole sentence that was a multiple-choice choice.
 */
export function takenAnswers(library: readonly LibraryQuestion[], topicOf: ReadonlyMap<string, string>, level: Level, topic: string, limit = TAKEN_LIMIT): string[] {
  const seen = new Map<string, { text: string; count: number }>();
  for (const x of library) {
    if (x.level !== level || topicOf.get(x.question.id) !== topic) continue;
    const q = x.question;
    if (isIdentifyAll(q.stem) || isRank(q.stem) || isNumericAnswer(q)) continue;
    const text = withoutGuides(q.answer).replace(/\s+/g, ' ').trim().toLowerCase();
    const key = plain(text);
    if (!key || wordCount(text) > 4 || !/[a-z]{3}/.test(key)) continue;
    const entry = seen.get(key);
    if (entry) entry.count += 1;
    else seen.set(key, { text, count: 1 });
  }
  return [...seen.values()]
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, limit)
    .map((e) => e.text);
}

/** How long DOE's stems of a slot's kind run, in words: the usual length, and the length nine in ten stay within. */
export function stemLengths(profile: StyleProfile, slot: Pick<Slot, 'level' | 'subject' | 'kind'>): { usual: number; most: number } {
  const words = profile.levels[slot.level].cells[slot.subject][slot.kind].stemWords;
  return { usual: words.median, most: words.p90 };
}
