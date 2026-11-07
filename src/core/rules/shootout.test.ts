import { describe, expect, it } from 'vitest';
import { shootoutOutcome, shootoutScore, shootoutTiers } from './shootout';

describe('round robin shootout (Rule 9-1 iii)', () => {
  it('scores +1, −1 and 0', () => {
    expect(shootoutScore(['correct', 'incorrect', 'none', 'correct', 'correct'])).toBe(2);
    expect(shootoutScore(['incorrect', 'incorrect', 'none', 'none', 'none'])).toBe(-2);
  });

  it('groups equal scores into tiers, best first', () => {
    expect(shootoutTiers([{ id: 'a', score: 1 }, { id: 'b', score: 3 }, { id: 'c', score: 1 }])).toEqual([
      { score: 3, ids: ['b'] },
      { score: 1, ids: ['a', 'c'] },
    ]);
  });

  it('settles places and names how a remaining tie is broken', () => {
    const scores = [
      { id: 'A', score: 3 },
      { id: 'B', score: 1 },
      { id: 'C', score: 1 },
      { id: 'D', score: -1 },
    ];
    // Two places: A takes one; B and C are tied for the other and play a 5 toss-up tiebreaker.
    expect(shootoutOutcome(scores, 2)).toEqual({ advance: ['A'], out: ['D'], stillTied: ['B', 'C'], placesLeft: 1, next: 'tiebreaker' });
    // Three places: A, B and C all go through.
    expect(shootoutOutcome(scores, 3)).toEqual({ advance: ['A', 'B', 'C'], out: ['D'], stillTied: [], placesLeft: 0, next: 'none' });
  });

  it('three or more still tied play another shootout', () => {
    const scores = ['A', 'B', 'C', 'D'].map((id) => ({ id, score: id === 'D' ? 0 : 2 }));
    expect(shootoutOutcome(scores, 2)).toEqual({ advance: [], out: ['D'], stillTied: ['A', 'B', 'C'], placesLeft: 2, next: 'shootout' });
  });
});
