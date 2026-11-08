import { describe, expect, it } from 'vitest';
import { catalogRound, libraryLevels, NOMINAL_ROUND, roundLevel, rowLevel } from './levels';
import type { CatalogRow } from './schema';

const row = (id: string, round: number): CatalogRow => [id, 'biology', 'biology.genetics', 't', round, ''];

describe('the difficulty ladder', () => {
  it('ranks DOE rounds by position, and national sample rounds as nationals-level', () => {
    expect(roundLevel(1)).toBe('early');
    expect(roundLevel(10)).toBe('early');
    expect(roundLevel(11)).toBe('late');
    expect(roundLevel(18)).toBe('late');
    expect(catalogRound('doe-hs-17', 4)).toBe(4);
    expect(catalogRound('doe-ms-finals', 2)).toBe(NOMINAL_ROUND.nationals);
    expect(roundLevel(catalogRound('doe-ms-finals', 2))).toBe('nationals');
  });

  it('prefers the level a team gave its uploads', () => {
    expect(rowLevel(row('team-pk1-r01-t01', NOMINAL_ROUND.invitational), new Map([['team-pk1', 'invitational']]))).toBe('invitational');
    expect(rowLevel(row('doe-ms-finals-r01-t01', NOMINAL_ROUND.nationals))).toBe('nationals');
  });

  it('lists the levels a catalog offers', () => {
    expect([...libraryLevels([row('doe-hs-01-r01-t01', 1), row('doe-hs-01-r12-t01', 12)])].sort()).toEqual(['early', 'late']);
    expect(libraryLevels([row('doe-ms-finals-r01-t01', NOMINAL_ROUND.nationals)]).has('nationals')).toBe(true);
  });
});
