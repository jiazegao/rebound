import { describe, expect, it } from 'vitest';
import { fingerprint, mergeCard, mergeSeen } from './merge';

describe('merging two versions of a record', () => {
  it('unions seen ledgers at the earlier time', () => {
    expect(mergeSeen({ a: 5, b: 9 }, { b: 3, c: 7 })).toEqual({ a: 5, b: 3, c: 7 });
    expect(mergeSeen({ a: 5 }, { b: 'later' })).toEqual({ a: 5 });
  });

  it('keeps the review card that has seen more, with all sources', () => {
    const a = { id: 'c', log: [{ t: 1, via: 'practice' }], sources: ['s1'] };
    const b = { id: 'c', log: [{ t: 1, via: 'practice' }, { t: 5, via: 'review' }], sources: ['s2'] };
    expect(mergeCard(a, b)).toEqual({ ...b, sources: ['s1', 's2'] });
    expect(mergeCard(b, a)).toEqual({ ...b, sources: ['s2', 's1'] });
    const c = { id: 'c', log: [{ t: 1, via: 'practice' }, { t: 9, via: 'game' }], sources: [] };
    expect((mergeCard(b, c) as { log: unknown[] }).log).toEqual(c.log);
  });
});

describe('fingerprints', () => {
  it('changes when the body changes and is stable otherwise', () => {
    expect(fingerprint({ a: 1, b: [1, 2] })).toBe(fingerprint({ a: 1, b: [1, 2] }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
    expect(fingerprint(null)).not.toBe(fingerprint({}));
  });
});
