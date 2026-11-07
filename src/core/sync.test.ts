import { describe, expect, it } from 'vitest';
import { canWrite, fingerprint, isSyncCollection, mergeCard, mergeRecord, mergeSeen, type MemberInfo } from './sync';

const captain: MemberInfo = { id: 'm1', role: 'captain', playerId: 'p1' };
const member: MemberInfo = { id: 'm2', role: 'member', playerId: 'p2' };
const coach: MemberInfo = { id: 'm3', role: 'coach', playerId: null };

describe('who may write what', () => {
  it('lets leaders write anything', () => {
    expect(canWrite(captain, 'team', 'team', { name: 'X' }, null)).toBe(true);
    expect(canWrite(coach, 'assignments', 'a1', {}, null)).toBe(true);
    expect(canWrite(coach, 'attempts', 'x', { playerId: 'p9' }, null)).toBe(true);
  });

  it('keeps team settings, lineups and assignments with the leaders', () => {
    expect(canWrite(member, 'team', 'team', { name: 'X' }, null)).toBe(false);
    expect(canWrite(member, 'lineups', 'l1', {}, null)).toBe(false);
    expect(canWrite(member, 'assignments', 'a1', null, {})).toBe(false);
  });

  it('lets members edit their own roster entry but not their role', () => {
    expect(canWrite(member, 'players', 'p2', { role: 'member', primarySubject: 'math' }, { role: 'member' })).toBe(true);
    expect(canWrite(member, 'players', 'p2', { role: 'captain' }, { role: 'member' })).toBe(false);
    expect(canWrite(member, 'players', 'p1', { role: 'captain' }, { role: 'captain' })).toBe(false);
    expect(canWrite(member, 'players', 'p2', null, { role: 'member' })).toBe(false);
  });

  it('keeps personal records personal', () => {
    expect(canWrite(member, 'attempts', 'a', { playerId: 'p2' }, null)).toBe(true);
    expect(canWrite(member, 'attempts', 'a', { playerId: 'p1' }, null)).toBe(false);
    expect(canWrite(member, 'cards', 'p1:q', null, { playerId: 'p1' })).toBe(false);
    expect(canWrite(member, 'plans', 'p2', {}, null)).toBe(true);
    expect(canWrite(member, 'plans', 'p1', {}, null)).toBe(false);
    expect(canWrite(member, 'completions', 'a1:p2', { playerId: 'p2' }, null)).toBe(true);
    // A coach with no player cannot be tricked into matching playerId null.
    expect(canWrite({ id: 'm4', role: 'member', playerId: null }, 'attempts', 'a', { playerId: null }, null)).toBe(false);
  });

  it('shares games, seen ledgers, packets, concept cards and reports', () => {
    for (const c of ['games', 'seen', 'packets', 'conceptCards', 'reports'] as const) expect(canWrite(member, c, 'x', {}, null)).toBe(true);
  });
});

describe('merging concurrent edits', () => {
  it('unions seen ledgers at the earlier time', () => {
    expect(mergeSeen({ a: 5, b: 9 }, { b: 3, c: 7 })).toEqual({ a: 5, b: 3, c: 7 });
    expect(mergeRecord('seen', { a: 1 }, { b: 2 }, true)).toEqual({ a: 1, b: 2 });
    // Not concurrent: the device saw the stored version, so its version wins as is.
    expect(mergeRecord('seen', { a: 1 }, { b: 2 }, false)).toEqual({ b: 2 });
  });

  it('keeps the review card that has seen more, with all sources', () => {
    const a = { id: 'c', log: [{ t: 1, via: 'practice' }], sources: ['s1'] };
    const b = { id: 'c', log: [{ t: 1, via: 'practice' }, { t: 5, via: 'review' }], sources: ['s2'] };
    expect(mergeCard(a, b)).toEqual({ ...b, sources: ['s1', 's2'] });
    expect(mergeCard(b, a)).toEqual({ ...b, sources: ['s2', 's1'] });
    const c = { id: 'c', log: [{ t: 1, via: 'practice' }, { t: 9, via: 'game' }], sources: [] };
    expect((mergeCard(b, c) as { log: unknown[] }).log).toEqual(c.log);
  });

  it('never changes a stored answer, and lets deletes through', () => {
    expect(mergeRecord('attempts', { correct: true }, { correct: false }, true)).toEqual({ correct: true });
    expect(mergeRecord('games', { a: 1 }, null, true)).toBeNull();
    expect(mergeRecord('games', { a: 1 }, { a: 2 }, true)).toEqual({ a: 2 });
    expect(mergeRecord('games', null, { a: 2 }, true)).toEqual({ a: 2 });
  });
});

describe('fingerprints', () => {
  it('changes when the body changes and is stable otherwise', () => {
    expect(fingerprint({ a: 1, b: [1, 2] })).toBe(fingerprint({ a: 1, b: [1, 2] }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
    expect(fingerprint(null)).not.toBe(fingerprint({}));
  });

  it('knows the collections', () => {
    expect(isSyncCollection('cards')).toBe(true);
    expect(isSyncCollection('settings')).toBe(false);
  });
});
