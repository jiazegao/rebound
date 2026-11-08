import { describe, expect, it } from 'vitest';
import {
  ID_PATTERN,
  JOIN_CODE_PATTERN,
  LEADER_ONLY,
  SERVER_WRITTEN,
  SESSION_TOKEN_PATTERN,
  TEAM_COLLECTIONS,
  TEAM_VISIBLE,
  USER_COLLECTIONS,
  canWriteTeam,
  isLeader,
  isTeamCollection,
  isUserCollection,
  mergeUserRecord,
} from './accounts';

describe('the account contract', () => {
  it('keeps review cards and daily plans private, and everything else of a player visible to teammates', () => {
    expect(TEAM_VISIBLE.has('cards')).toBe(false);
    expect(TEAM_VISIBLE.has('plans')).toBe(false);
    for (const c of USER_COLLECTIONS) if (c !== 'cards' && c !== 'plans') expect(TEAM_VISIBLE.has(c)).toBe(true);
  });

  it("lets only the server write a player's game and match answers", () => {
    expect([...SERVER_WRITTEN]).toEqual(['answers']);
  });

  it('lets leaders write every team collection and members all but lineups and assignments', () => {
    expect(isLeader('coach')).toBe(true);
    expect(isLeader('captain')).toBe(true);
    expect(isLeader('member')).toBe(false);
    expect(isLeader(null)).toBe(false);
    for (const c of TEAM_COLLECTIONS) {
      expect(canWriteTeam('captain', c)).toBe(true);
      expect(canWriteTeam('coach', c)).toBe(true);
      expect(canWriteTeam('member', c)).toBe(!LEADER_ONLY.has(c));
    }
    expect(canWriteTeam('member', 'lineups')).toBe(false);
    expect(canWriteTeam('member', 'assignments')).toBe(false);
    expect(canWriteTeam('member', 'games')).toBe(true);
  });

  it('tells user collections from team collections', () => {
    expect(isUserCollection('cards')).toBe(true);
    expect(isUserCollection('games')).toBe(false);
    expect(isTeamCollection('games')).toBe(true);
    expect(isTeamCollection('cards')).toBe(false);
    expect(isUserCollection('players')).toBe(false);
    expect(isTeamCollection('players')).toBe(false);
  });

  it('checks the shape of ids, session tokens and join codes', () => {
    expect(ID_PATTERN.test('abcdefgh234567ab')).toBe(true);
    expect(ID_PATTERN.test('ABCDEFGH234567AB')).toBe(false);
    expect(ID_PATTERN.test('abcdefgh234567a1')).toBe(false);
    expect(SESSION_TOKEN_PATTERN.test(`abcdefgh234567ab.${'A'.repeat(43)}`)).toBe(true);
    expect(SESSION_TOKEN_PATTERN.test(`abcdefgh234567ab.${'A'.repeat(42)}`)).toBe(false);
    expect(JOIN_CODE_PATTERN.test('abcdefgh234567ab.abcdefgh2345')).toBe(true);
    expect(JOIN_CODE_PATTERN.test('abcdefgh234567ab.abcdefgh234')).toBe(false);
  });
});

describe('merging two writes of one player record', () => {
  it('unions seen and read ledgers', () => {
    expect(mergeUserRecord('seen', { a: 5, b: 9 }, { b: 3, c: 7 })).toEqual({ a: 5, b: 3, c: 7 });
    expect(mergeUserRecord('conceptReads', { a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('merges review card histories', () => {
    const a = { id: 'c', log: [{ t: 1, via: 'practice' }], sources: ['s1'] };
    const b = { id: 'c', log: [{ t: 1, via: 'practice' }, { t: 5, via: 'review' }], sources: ['s2'] };
    expect(mergeUserRecord('cards', a, b)).toEqual({ ...b, sources: ['s1', 's2'] });
  });

  it('never changes a stored answer', () => {
    expect(mergeUserRecord('attempts', { correct: true }, { correct: false })).toEqual({ correct: true });
    expect(mergeUserRecord('answers', { correct: true }, { correct: false })).toEqual({ correct: true });
  });

  it('lets deletes and first writes through, and the last write win elsewhere', () => {
    expect(mergeUserRecord('attempts', { correct: true }, null)).toBeNull();
    expect(mergeUserRecord('seen', null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeUserRecord('plans', undefined, { items: [] })).toEqual({ items: [] });
    expect(mergeUserRecord('plans', { items: [1] }, { items: [2] })).toEqual({ items: [2] });
    expect(mergeUserRecord('completions', { at: 1 }, { at: 2 })).toEqual({ at: 2 });
  });
});
