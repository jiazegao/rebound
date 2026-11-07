import { describe, expect, it } from 'vitest';
import { pickDrill, pickMixed, partnerId, setIdOf } from './drill';
import { chance, estimateRating, firstAnswers, playerModel, questionDifficulty, ratingFor, type Observation } from './mastery';
import { buildPlan, resizePlan, seededRandom, type PlanInput } from './plan';
import type { CatalogRow, CoreSubject } from './schema';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 7, 16).getTime();

function obs(fields: Partial<Observation>): Observation {
  return {
    playerId: 'p1',
    questionId: 'q',
    subject: 'biology',
    topic: 'biology.genetics',
    kind: 'tossup',
    round: 3,
    correct: true,
    interrupt: false,
    latencyMs: 1500,
    t: NOW - DAY,
    ...fields,
  };
}

describe('mastery', () => {
  it('uses a difficulty prior that rises after round 10 and for bonuses', () => {
    expect(questionDifficulty('tossup', 1)).toBe(questionDifficulty('tossup', 10));
    expect(questionDifficulty('tossup', 15)).toBeGreaterThan(questionDifficulty('tossup', 10));
    expect(questionDifficulty('bonus', 1)).toBeGreaterThan(questionDifficulty('tossup', 1));
    expect(chance(1500, 1500)).toBeCloseTo(0.5);
    expect(chance(1900, 1500)).toBeCloseTo(10 / 11, 3);
  });

  it('estimates higher ratings for more correct answers, and stays near the prior with little data', () => {
    const answers = (right: number, total: number) =>
      Array.from({ length: total }, (_, i) => ({ difficulty: 1500, correct: i < right, weight: 1 }));
    const strong = estimateRating(answers(16, 20), 1500, 200);
    const weak = estimateRating(answers(4, 20), 1500, 200);
    const tiny = estimateRating(answers(1, 1), 1500, 200);
    expect(strong).toBeGreaterThan(1600);
    expect(weak).toBeLessThan(1400);
    expect(tiny).toBeGreaterThan(1500);
    expect(tiny).toBeLessThan(1600);
  });

  it('counts only the first answer to each question', () => {
    const list = [obs({ questionId: 'a', correct: false, t: 1 }), obs({ questionId: 'a', correct: true, t: 2 }), obs({ questionId: 'b', t: 3 })];
    expect(firstAnswers(list).map((o) => [o.questionId, o.correct])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('builds subject and topic lines; topics lean on the subject until they have data', () => {
    const list: Observation[] = [];
    for (let i = 0; i < 12; i++) list.push(obs({ questionId: `g${i}`, correct: i < 10 }));
    for (let i = 0; i < 2; i++) list.push(obs({ questionId: `e${i}`, topic: 'biology.ecology', correct: false, interrupt: true, latencyMs: null }));
    const model = playerModel(list, NOW);
    const bio = model.subjects.biology!;
    expect(bio.n).toBe(14);
    expect(bio.correct).toBe(10);
    expect(bio.interrupts).toBe(2);
    expect(bio.medianBuzzMs).toBe(1500);
    expect(model.topics['biology.genetics'].p).toBeGreaterThan(model.topics['biology.ecology'].p);
    // Two misses pull ecology down, but the prior keeps it near the player's (good) biology level.
    expect(model.topics['biology.ecology'].rating).toBeGreaterThan(bio.rating - 200);
    expect(ratingFor(model, 'biology', 'biology.cells-membranes')).toBe(bio.rating);
    expect(ratingFor(model, 'chemistry')).toBe(1500);
  });
});

/** A fake catalog: `perSet` toss-up/bonus pairs per subject in each of `sets` sets. */
function catalog(sets: number, perSet: number): CatalogRow[] {
  const subjects: CoreSubject[] = ['biology', 'chemistry', 'earth_space', 'energy', 'math', 'physics'];
  const rows: CatalogRow[] = [];
  for (let s = 1; s <= sets; s++) {
    let n = 0;
    for (const subject of subjects) {
      for (let i = 0; i < perSet; i++) {
        n += 1;
        const round = 1 + (n % 17);
        const topic = `${subject}.${i % 2 ? 'odd' : 'even'}`;
        const id = `doe-hs-${String(s).padStart(2, '0')}-r${String(round).padStart(2, '0')}`;
        const cross = subject === 'energy' ? (i % 3 === 0 ? 'chemistry' : 'physics') : '';
        rows.push([`${id}-t${String(n).padStart(2, '0')}`, subject, topic, 't', round, cross]);
        // Bonuses of "odd" toss-ups are tagged "even", so some bonuses match a topic their toss-up does not.
        rows.push([`${id}-b${String(n).padStart(2, '0')}`, subject, i % 2 ? `${subject}.even` : topic, 'b', round, cross]);
      }
    }
  }
  return rows;
}

describe('drills', () => {
  const rows = catalog(10, 8);

  it('parses set ids and partners from question ids', () => {
    expect(setIdOf('doe-hs-17-r01-t05')).toBe('doe-hs-17');
    expect(setIdOf('doe-hs-17-r01a-b05')).toBe('doe-hs-17');
    expect(partnerId('doe-hs-17-r01-t05')).toBe('doe-hs-17-r01-b05');
    expect(partnerId('doe-hs-17-r01-b05')).toBe('doe-hs-17-r01-t05');
  });

  it('serves fresh questions of the topic from a few sets', () => {
    const seen: Record<string, number> = {};
    for (const r of rows) if (r[0].startsWith('doe-hs-01')) seen[r[0]] = 1;
    const picks = pickDrill(rows, { subject: 'biology', topic: 'biology.even', count: 9, allowBonusOnly: true, seen, random: seededRandom('x') });
    expect(picks).toHaveLength(9);
    const byId = new Map(rows.map((r) => [r[0], r]));
    for (const p of picks) {
      expect(byId.get(p.questionId)![2]).toBe('biology.even');
      expect(p.setId).not.toBe('doe-hs-01');
    }
    expect(new Set(picks.map((p) => p.setId)).size).toBeLessThanOrEqual(4);
    // Bonuses on their own: only those whose toss-up is in another topic, and at most a third.
    const solo = picks.filter((p) => p.bonusOnly);
    expect(solo.length).toBeLessThanOrEqual(3);
    for (const p of solo) expect(byId.get(partnerId(p.questionId))![2]).not.toBe('biology.even');
  });

  it('falls back to heard questions when nothing fresh is left', () => {
    const seen = Object.fromEntries(rows.map((r) => [r[0], 1]));
    expect(pickDrill(rows, { subject: 'math', count: 5, seen })).toHaveLength(5);
  });

  it('adds Energy questions that test the subject when asked', () => {
    const picks = pickDrill(rows, { subject: 'chemistry', includeEnergyCross: true, count: 200, maxSets: 20 });
    const subjects = new Set(picks.map((p) => rows.find((r) => r[0] === p.questionId)![1]));
    expect(subjects).toEqual(new Set(['chemistry', 'energy']));
  });

  it('prefers questions near the target difficulty', () => {
    // A weak player gets early-round toss-ups; a strong one gets later rounds.
    const pick = (rating: number) => pickDrill(rows, { subject: 'physics', count: 6, rating: () => rating, random: seededRandom('y'), maxSets: 10 });
    const roundOf = (id: string) => rows.find((r) => r[0] === id)![4];
    const avg = (list: { questionId: string }[]) => list.reduce((s, p) => s + roundOf(p.questionId), 0) / list.length;
    expect(avg(pick(1900))).toBeGreaterThan(avg(pick(1300)));
  });

  it('balances a mixed round across the six subjects', () => {
    const picks = pickMixed(rows, { count: 12, random: seededRandom('z') });
    expect(picks).toHaveLength(12);
    const counts = new Map<string, number>();
    for (const p of picks) {
      const s = rows.find((r) => r[0] === p.questionId)![1];
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual([2, 2, 2, 2, 2, 2]);
    expect(new Set(picks.map((p) => p.setId)).size).toBeLessThanOrEqual(2);
  });
});

describe('daily plan', () => {
  const topicCounts = { 'biology.genetics': 300, 'biology.ecology': 200, 'biology.cells-membranes': 250, 'chemistry.stoichiometry': 120, 'chemistry.organic': 150 };
  const base: PlanInput = {
    player: { id: 'p1', primarySubject: 'biology', secondarySubject: 'chemistry' },
    now: NOW,
    minutes: 30,
    dueCount: 6,
    topicCounts,
  };

  it('orders reviews, primary drill, secondary drill, mixed round, within the time budget', () => {
    const plan = buildPlan(base);
    expect(plan.items.map((i) => i.id)).toEqual(['review', 'drill-primary', 'drill-secondary', 'mixed']);
    const total = plan.items.reduce((s, i) => s + i.minutes, 0);
    expect(total).toBeGreaterThanOrEqual(27);
    expect(total).toBeLessThanOrEqual(33);
    expect(plan.items[0].cards).toBe(6);
    expect(plan.items[1].subject).toBe('biology');
    expect(plan.items[1].topic).toMatch(/^biology\./);
    expect(plan.items[2].subject).toBe('chemistry');
    for (const item of plan.items) expect(item.why.length).toBeGreaterThan(10);
  });

  it('caps reviews at a third of the time', () => {
    const plan = buildPlan({ ...base, minutes: 15, dueCount: 80 });
    expect(plan.items[0].cards).toBe(10);
    expect(plan.items[0].why).toContain('80 waiting');
  });

  it('keeps a review item even when nothing is due', () => {
    const plan = buildPlan({ ...base, dueCount: 0 });
    expect(plan.items[0]).toMatchObject({ kind: 'review', cards: 0 });
  });

  it('shifts toward mixed rounds in the last weeks before a competition', () => {
    const season = buildPlan(base);
    const close = buildPlan({ ...base, nextEvent: { name: 'Regional', date: '2026-11-20' } });
    const mixed = (p: typeof season) => p.items.find((i) => i.kind === 'mixed')!.minutes;
    expect(close.phase).toBe('final_weeks');
    expect(mixed(close)).toBeGreaterThan(mixed(season));
    expect(close.items.find((i) => i.kind === 'mixed')!.why).toContain('Regional is in 13 days');
  });

  it('targets weak, frequent topics', () => {
    const strongGenetics = {
      subjects: { biology: { rating: 1600, p: 0.64, n: 40, correct: 26, interrupts: 0, interruptsCorrect: 0, medianBuzzMs: null, last: 0 } },
      topics: {
        'biology.genetics': { rating: 1900, p: 0.91, n: 20, correct: 19, interrupts: 0, interruptsCorrect: 0, medianBuzzMs: null, last: 0 },
        'biology.ecology': { rating: 1350, p: 0.3, n: 10, correct: 3, interrupts: 0, interruptsCorrect: 0, medianBuzzMs: null, last: 0 },
        'biology.cells-membranes': { rating: 1800, p: 0.85, n: 10, correct: 9, interrupts: 0, interruptsCorrect: 0, medianBuzzMs: null, last: 0 },
      },
      observations: [],
    };
    const topics = Array.from({ length: 20 }, (_, d) => {
      const plan = buildPlan({ ...base, now: NOW + d * DAY, player: { id: 'p1', primarySubject: 'biology' }, model: strongGenetics });
      return plan.items.find((i) => i.id === 'drill-primary')!;
    });
    expect(topics.filter((d) => d.topic === 'biology.ecology').length).toBeGreaterThanOrEqual(17);
    expect(topics.find((d) => d.topic === 'biology.ecology')!.why).toContain("haven't mastered");
  });

  it('gives a player without subjects a focus drill, and is the same all day', () => {
    const p = { ...base, player: { id: 'p9' } };
    const a = buildPlan(p);
    const b = buildPlan({ ...p, now: NOW + 3 * 60 * 60 * 1000 });
    expect(a.items.map((i) => i.id)).toEqual(['review', 'drill-focus', 'mixed']);
    expect(b.items).toEqual(a.items);
  });

  it('keeps finished items when the plan is resized', () => {
    const plan = buildPlan(base);
    plan.items[0].done = true;
    const bigger = resizePlan(plan, { ...base, minutes: 45 });
    expect(bigger.minutes).toBe(45);
    expect(bigger.items[0].done).toBe(true);
  });
});
