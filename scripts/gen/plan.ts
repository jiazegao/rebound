/**
 * The round plan (plan step 1): the slots a round's questions are written to fill. Plain code with a seed, so
 * the same plan can be made again.
 *
 * A round follows DOE's shape: the six categories in the order of its 2021–22 sets (Biology, Chemistry, Earth
 * and Space, Energy, Math, Physics), each toss-up with a bonus in its category. An in-person round has 23
 * pairs, four for each category and three for Energy; its first 18 pairs are a complete virtual-format round.
 * What each slot asks for is drawn from the style profile, so a round has DOE's mix of question forms.
 *
 *   npx tsx scripts/gen/plan.ts [--level hs|ms] [--tier early|late] [--pairs 23|18] [--seed 1]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LETTERS, type CoreSubject, type Letter, type Level, type QuestionKind } from '../../src/core/schema';
import { topicName, topicsForSubject } from '../../src/core/taxonomy';
import { LIBRARY_DIR, loadCatalog } from './library';
import { loadProfile, type StyleProfile } from './profile';
import type { Form, Skill, Slot, Tier } from './types';

/** DOE's category order in its 2021–22 sets. */
export const CYCLE: CoreSubject[] = ['biology', 'chemistry', 'earth_space', 'energy', 'math', 'physics'];

/** A topic may fill this many of a round's slots at most. */
export const TOPIC_LIMIT = 2;

/** Of the slots that are not calculations: the share that ask a player to apply a fact, not just recall it. */
export const APPLICATION_SHARE: Record<Tier, number> = { early: 0.3, late: 0.5 };

export interface RoundPlan {
  level: Level;
  tier: Tier;
  pairs: number;
  seed: number;
  slots: Slot[];
}

/** The categories of a round's pairs, in order: the six-category cycle, with Energy left out of a 23-pair round's last pass. */
export function pairSubjects(pairs: number): CoreSubject[] {
  if (pairs !== 23 && pairs !== 18) throw new Error('A round has 23 pairs (in person) or 18 (virtual).');
  const all = Array.from({ length: 24 }, (_, i) => CYCLE[i % 6]!);
  return pairs === 18 ? all.slice(0, 18) : all.filter((s, i) => !(s === 'energy' && i >= 18));
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How likely each topic of a category is to be drawn: in proportion to how often DOE asks it at this level,
 * and half as much again for topics DOE asks only 30 to 99 times, where the library is thinnest. A topic with
 * fewer than 30 questions at a level is mostly above that level (calculus at middle school), so it gets no boost.
 */
export function topicWeights(subject: CoreSubject, topicCounts: Readonly<Record<string, number>>): Array<{ topic: string; weight: number }> {
  return topicsForSubject(subject)
    .map((t) => {
      const count = topicCounts[t.id] ?? 0;
      return { topic: t.id, weight: count * (count >= 30 && count < 100 ? 1.5 : 1) };
    })
    .filter((t) => t.weight > 0);
}

function draw<T>(items: ReadonlyArray<{ weight: number } & T>, random: () => number): T {
  const total = items.reduce((a, t) => a + t.weight, 0);
  let x = random() * total;
  for (const item of items) {
    x -= item.weight;
    if (x <= 0) return item;
  }
  return items[items.length - 1]!;
}

export interface PlanOptions {
  level: Level;
  tier: Tier;
  pairs?: 23 | 18;
  seed: number;
  profile: StyleProfile;
  /** How many library questions each topic has at this level (the catalog's topicCounts). */
  topicCounts: Readonly<Record<string, number>>;
}

/** A round's slots. The same options always give the same plan. */
export function planRound(options: PlanOptions): RoundPlan {
  const { level, tier, seed, profile } = options;
  const pairs = options.pairs ?? 23;
  const subjects = pairSubjects(pairs);
  const band = profile.levels[level].perRound.multipleChoice;
  // The mix is drawn slot by slot, so now and then a draw gives a round with far too few or too many
  // multiple-choice questions: such a draw is thrown back, and the next one taken.
  for (let attempt = 0; attempt < 50; attempt++) {
    const random = seeded(seed * 7919 + attempt);
    const used = new Map<string, number>();
    const slots: Slot[] = [];
    subjects.forEach((subject, i) => {
      for (const kind of ['tossup', 'bonus'] as QuestionKind[]) {
        const cell = profile.levels[level].cells[subject][kind];
        const r = random();
        const form: Form = r < cell.identifyAll ? 'identify_all' : r < cell.identifyAll + cell.rank ? 'rank' : r < cell.identifyAll + cell.rank + cell.multipleChoice ? 'multiple_choice' : 'short_answer';
        // "Identify all" and "Rank" questions are judgments about a list. Math is worked out even when its answer is not a plain number.
        const computed = form === 'identify_all' || form === 'rank' ? false : subject === 'math' || random() < cell.numeric / Math.max(0.01, 1 - cell.identifyAll - cell.rank);
        const skill: Skill = computed ? 'computation' : random() < APPLICATION_SHARE[tier] ? 'application' : 'recall';
        const open = topicWeights(subject, options.topicCounts).filter((t) => (used.get(t.topic) ?? 0) < TOPIC_LIMIT);
        const topic = draw(open, random).topic;
        used.set(topic, (used.get(topic) ?? 0) + 1);
        slots.push({ id: `${kind === 'tossup' ? 't' : 'b'}${String(i + 1).padStart(2, '0')}`, level, tier, kind, subject, form, skill, topic });
      }
    });
    const choice = slots.filter((s) => s.form === 'multiple_choice');
    const share = choice.length / slots.length;
    if (share < band.low || share > band.high) continue;
    // Keys spread evenly over W to Z: the letters in turn, in a shuffled order.
    const order = [...LETTERS];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const start = Math.floor(random() * 4);
    choice.forEach((slot, n) => {
      slot.letter = order[(start + n) % 4] as Letter;
    });
    return { level, tier, pairs, seed, slots };
  }
  throw new Error('No draw gave a round with a share of multiple choice in DOE’s range; the style profile may be damaged.');
}

/** The catalog's topic counts for a level. */
export function loadTopicCounts(level: Level, dir = LIBRARY_DIR): Record<string, number> {
  return loadCatalog(level, dir).topicCounts;
}

/** One slot in words: "t07 Biology toss-up, multiple choice (key on X), recall: Genetics". */
export function describeSlot(slot: Slot): string {
  const form = { multiple_choice: `multiple choice${slot.letter ? ` (key on ${slot.letter})` : ''}`, short_answer: 'short answer', identify_all: '"Identify all"', rank: '"Rank"' }[slot.form];
  return `${slot.id} ${slot.subject} ${slot.kind === 'tossup' ? 'toss-up' : 'bonus'}, ${form}, ${slot.skill}: ${topicName(slot.topic)}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name: string, fallback: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
  };
  const level: Level = arg('level', 'hs').toLowerCase() === 'ms' ? 'MS' : 'HS';
  const plan = planRound({ level, tier: arg('tier', 'early') === 'late' ? 'late' : 'early', pairs: arg('pairs', '23') === '18' ? 18 : 23, seed: Number(arg('seed', '1')), profile: loadProfile(), topicCounts: loadTopicCounts(level) });
  console.log(`${plan.level} ${plan.tier} round, ${plan.pairs} pairs, seed ${plan.seed}`);
  for (const slot of plan.slots) console.log(`  ${describeSlot(slot)}`);
  const n = (f: Form) => plan.slots.filter((s) => s.form === f).length;
  console.log(`${n('multiple_choice')} multiple choice, ${n('short_answer')} short answer, ${n('identify_all')} "Identify all", ${n('rank')} "Rank"; ${plan.slots.filter((s) => s.skill === 'computation').length} calculations.`);
}
