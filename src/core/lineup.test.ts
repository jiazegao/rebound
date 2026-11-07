import { describe, expect, it } from 'vitest';
import { bestAlternate, cautiousChance, estimateLineup, OPPONENTS, ROUND_TOSSUPS, suggestLineups, type PlayerProfile } from './lineup';
import { CORE_SUBJECTS, type CoreSubject } from './schema';

/** A player who knows `strong` of their subject's toss-ups and `weak` of the rest. */
function specialist(id: string, subject: CoreSubject | null, strong = 0.7, weak = 0.2, buzzMs: number | null = 1800): PlayerProfile {
  const tossup = Object.fromEntries(CORE_SUBJECTS.map((s) => [s, s === subject ? strong : weak])) as Record<CoreSubject, number>;
  const bonus = Object.fromEntries(CORE_SUBJECTS.map((s) => [s, tossup[s] * 0.8])) as Record<CoreSubject, number>;
  const answers = Object.fromEntries(CORE_SUBJECTS.map((s) => [s, 30])) as Record<CoreSubject, number>;
  return { playerId: id, tossup, bonus, buzzMs, answers };
}

describe('lineup estimates', () => {
  it('reads about 20 toss-ups a round', () => {
    const total = Object.values(ROUND_TOSSUPS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(20, 0);
  });

  it('rewards covering more subjects', () => {
    const covered = estimateLineup([specialist('b', 'biology'), specialist('c', 'chemistry'), specialist('p', 'physics'), specialist('m', 'math')]);
    const doubled = estimateLineup([specialist('b1', 'biology'), specialist('b2', 'biology'), specialist('p', 'physics'), specialist('m', 'math')]);
    expect(covered.points).toBeGreaterThan(doubled.points);
    expect(covered.subjects.find((s) => s.subject === 'chemistry')!.coveredBy).toBe('c');
    expect(['earth_space', 'energy']).toContain(covered.weakest);
  });

  it('gives faster buzzers more toss-ups, and a stronger opponent fewer', () => {
    const slow = estimateLineup([specialist('a', 'biology', 0.7, 0.2, 3000)]);
    const fast = estimateLineup([specialist('a', 'biology', 0.7, 0.2, 900)]);
    expect(fast.points).toBeGreaterThan(slow.points);
    const vsStrong = estimateLineup([specialist('a', 'biology')], OPPONENTS.strong);
    expect(vsStrong.points).toBeLessThan(estimateLineup([specialist('a', 'biology')]).points);
  });

  it('splits points into toss-ups and bonuses', () => {
    const e = estimateLineup([specialist('a', 'math', 0.9, 0.5)]);
    expect(e.tossupPoints + e.bonusPoints).toBeCloseTo(e.points);
    expect(e.bonusPoints).toBeGreaterThan(0);
    // Every subject is in the breakdown.
    expect(e.subjects.map((s) => s.subject)).toEqual(CORE_SUBJECTS);
  });

  it('marks subjects resting on few answers as uncertain', () => {
    const p = specialist('a', 'math');
    p.answers.math = 3;
    expect(estimateLineup([p]).subjects.find((s) => s.subject === 'math')!.uncertain).toBe(true);
  });
});

describe('calibration', () => {
  it('puts a new team of four specialists, with no data yet, at a typical regional score', () => {
    const fresh = (id: string, subject: CoreSubject) => specialist(id, subject, cautiousChance(undefined, 0, 'primary'), cautiousChance(undefined, 0, null), null);
    const e = estimateLineup([fresh('b', 'biology'), fresh('c', 'chemistry'), fresh('m', 'math'), fresh('p', 'physics')]);
    expect(e.points).toBeGreaterThan(40);
    expect(e.points).toBeLessThan(75);
  });

  it('keeps an excellent team below a perfect round', () => {
    const star = (id: string, subject: CoreSubject) => specialist(id, subject, 0.9, 0.5, 900);
    const e = estimateLineup([star('b', 'biology'), star('c', 'chemistry'), star('m', 'math'), star('p', 'physics')]);
    expect(e.points).toBeGreaterThan(100);
    expect(e.points).toBeLessThan(20 * 14);
  });
});

describe('suggestions', () => {
  const pool = [
    specialist('bio', 'biology'),
    specialist('chem', 'chemistry'),
    specialist('phys', 'physics'),
    specialist('math', 'math'),
    specialist('earth', 'earth_space'),
    specialist('bio2', 'biology', 0.6),
  ];

  it('tries every foursome and puts the best first', () => {
    const top = suggestLineups(pool, OPPONENTS.average, 4, 3);
    expect(top).toHaveLength(3);
    expect(top[0].points).toBeGreaterThanOrEqual(top[1].points);
    // Two biologists never beat a lineup that covers another subject.
    expect(top[0].playerIds).not.toEqual(expect.arrayContaining(['bio', 'bio2']));
  });

  it('suggests the bench player who keeps the most points as alternate', () => {
    const starters = pool.slice(0, 4);
    const alt = bestAlternate(starters, [specialist('weak', null, 0.2, 0.2), pool[4]])!;
    expect(alt.playerId).toBe('earth');
  });

  it('returns the only lineup when the roster is small', () => {
    expect(suggestLineups(pool.slice(0, 3))[0].playerIds).toHaveLength(3);
  });
});

describe('cautious estimates', () => {
  it('starts from a prior and moves toward the data', () => {
    expect(cautiousChance(undefined, 0, 'primary')).toBe(0.4);
    expect(cautiousChance(undefined, 0, null)).toBe(0.15);
    const few = cautiousChance(0.9, 2, null);
    const many = cautiousChance(0.9, 200, null);
    expect(few).toBeLessThan(many);
    expect(many).toBeGreaterThan(0.85);
  });
});
