import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '../core/rules/engine';
import { bonusLines, gameLines, gameState, median, playerLines } from './stats';
import { emptyData, type GameRecord } from './store';

function game(events: MatchEvent[]): GameRecord {
  return {
    id: 'g1',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
    presetId: 'doe-regional-2027',
    packet: { setId: 'doe-hs-17', setTitle: 'DOE High School Sample Set 17', roundId: 'doe-hs-17-r01', roundLabel: 'Round 1' },
    pairs: [
      { tossupId: 't1', bonusId: 'b1', subject: 'biology' },
      { tossupId: 't2', bonusId: 'b2', subject: 'math' },
      { tossupId: 't3', bonusId: 'b3', subject: 'physics' },
    ],
    teams: [
      { name: 'A', playerIds: ['ann', 'abe'] },
      { name: 'B', playerIds: ['bea'] },
    ],
    events,
    status: 'in_progress',
  };
}

const events: MatchEvent[] = [
  { type: 'start', t: 0 },
  // Toss-up 1: Ann answers 1.5 s after the reading, correct; bonus correct.
  { type: 'tossup_read', t: 10_000 },
  { type: 'buzz', team: 0, playerId: 'ann', t: 11_500 },
  { type: 'tossup_judged', result: 'correct', t: 12_000 },
  { type: 'bonus_read', t: 20_000 },
  { type: 'bonus_judged', result: 'correct', t: 30_000 },
  { type: 'next', t: 31_000 },
  // Toss-up 2: Bea interrupts wrong (+4 to A); Abe answers the re-read correctly; bonus missed.
  { type: 'buzz', team: 1, playerId: 'bea', t: 33_000 },
  { type: 'tossup_judged', result: 'incorrect', t: 34_000 },
  { type: 'tossup_read', t: 40_000 },
  { type: 'buzz', team: 0, playerId: 'abe', t: 42_000 },
  { type: 'tossup_judged', result: 'correct', t: 43_000 },
  { type: 'bonus_read', t: 45_000 },
  { type: 'bonus_judged', result: 'incorrect', t: 60_000 },
];

describe('stats', () => {
  it('derives per-player lines from a game', () => {
    const g = game(events);
    const state = gameState(g)!;
    expect(state.scores).toEqual([22, 0]);
    const lines = gameLines(g, state);
    const ann = lines.find((l) => l.playerId === 'ann')!;
    const bea = lines.find((l) => l.playerId === 'bea')!;
    const abe = lines.find((l) => l.playerId === 'abe')!;
    expect(ann).toMatchObject({ tossupAttempts: 1, tossupCorrect: 1, correctLatencies: [1_500], bonusesHeard: 2, bonusesCorrect: 1 });
    expect(ann.bySubject.biology).toEqual({ attempts: 1, correct: 1 });
    expect(bea).toMatchObject({ tossupAttempts: 1, tossupCorrect: 0, interrupts: 1, penaltyPoints: 4 });
    expect(bea.faults.incorrect).toBe(1);
    expect(abe.bySubject.math).toEqual({ attempts: 1, correct: 1 });
    expect(bonusLines(state)).toEqual([
      { heard: 2, correct: 1 },
      { heard: 0, correct: 0 },
    ]);
  });

  it('aggregates across games and solo practice', () => {
    const data = emptyData();
    data.players = [
      { id: 'ann', name: 'Ann', role: 'member', active: true },
      { id: 'abe', name: 'Abe', role: 'member', active: true },
      { id: 'bea', name: 'Bea', role: 'member', active: true },
    ];
    data.games = [game(events), { ...game(events), id: 'g2' }];
    data.attempts = [{ id: 'x', playerId: 'ann', questionId: 't9', subject: 'chemistry', kind: 'tossup', correct: true, interrupt: false, latencyMs: 900, overridden: false, t: 1 }];
    const ann = playerLines(data).find((l) => l.playerId === 'ann')!;
    expect(ann.games).toBe(2);
    expect(ann.tossupCorrect).toBe(2);
    expect(ann.soloCorrect).toBe(1);
  });

  it('computes medians', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
