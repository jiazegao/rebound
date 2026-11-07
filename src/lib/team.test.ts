import { describe, expect, it } from 'vitest';
import type { PlayerModel, SkillLine } from '../core/mastery';
import type { Player } from '../core/schema';
import { graduatingClass, profileFor, succession, topicCoverage } from './team';

function line(p: number, n: number): SkillLine {
  return { rating: 1500 + 400 * Math.log10(p / (1 - p)), p, n, correct: Math.round(p * n), interrupts: 0, interruptsCorrect: 0, medianBuzzMs: 1500, last: 0 };
}

function model(subjects: Record<string, [number, number]>, topics: Record<string, [number, number]> = {}): PlayerModel {
  return {
    subjects: Object.fromEntries(Object.entries(subjects).map(([s, [p, n]]) => [s, line(p, n)])),
    topics: Object.fromEntries(Object.entries(topics).map(([t, [p, n]]) => [t, line(p, n)])),
    observations: [],
  };
}

const NOV_2026 = new Date(2026, 10, 7).getTime();
const player = (id: string, fields: Partial<Player> = {}): Player => ({ id, name: id, role: 'member', active: true, ...fields });

describe('team views', () => {
  it('knows which class graduates this season', () => {
    expect(graduatingClass(NOV_2026)).toBe(2027);
    expect(graduatingClass(new Date(2027, 3, 1).getTime())).toBe(2027);
    expect(graduatingClass(new Date(2027, 8, 1).getTime())).toBe(2028);
  });

  it('builds cautious lineup profiles', () => {
    const p = profileFor(player('a', { primarySubject: 'biology' }), model({ biology: [0.8, 100] }));
    expect(p.tossup.biology).toBeGreaterThan(0.7);
    expect(p.bonus.biology).toBeLessThan(p.tossup.biology);
    expect(p.tossup.physics).toBe(0.15);
    expect(p.answers.biology).toBe(100);
    expect(p.buzzMs).toBeNull();
  });

  it("finds the team's best player in each topic and counts the gaps", () => {
    const models = new Map([
      ['a', model({}, { 'biology.genetics': [0.7, 10], 'physics.optics': [0.4, 2] })],
      ['b', model({}, { 'biology.genetics': [0.8, 5] })],
    ]);
    const cov = topicCoverage(models);
    const genetics = cov.find((c) => c.topicId === 'biology.genetics')!;
    expect(genetics.best!.playerId).toBe('b');
    expect(genetics.players).toBe(2);
    // Two answers are not enough to count.
    expect(cov.find((c) => c.topicId === 'physics.optics')!.best).toBeNull();
  });

  it('names who takes over a subject when its owner graduates', () => {
    const players = [
      player('senior', { primarySubject: 'physics', gradYear: 2027 }),
      player('junior', { gradYear: 2028 }),
      player('soph', { gradYear: 2029 }),
      player('bio', { primarySubject: 'biology', gradYear: 2028 }),
    ];
    const models = new Map([
      ['junior', model({ physics: [0.6, 40] })],
      ['soph', model({ physics: [0.4, 40] })],
    ]);
    const plan = succession(players, models, NOV_2026);
    const physics = plan.find((s) => s.subject === 'physics')!;
    expect(physics.leaving.map((p) => p.id)).toEqual(['senior']);
    expect(physics.successor!.player.id).toBe('junior');
    // Biology's owner stays: no successor needed.
    expect(plan.find((s) => s.subject === 'biology')!.successor).toBeNull();
    // Nobody owns math: the best staying player is suggested.
    expect(plan.find((s) => s.subject === 'math')!.successor).not.toBeNull();
  });
});
