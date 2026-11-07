import { describe, expect, it } from 'vitest';
import { fingerprint, recordKey, type PushChange, type SyncRecord } from '../core/sync';
import { emptyData } from './store';
import { applyRecords, DELETED, localChanges, pushBatch, rememberRecords, toRecords } from './syncRecords';

function sample() {
  const d = emptyData();
  d.team = { id: 't', name: 'Test', level: 'HS', createdAt: '2026-11-07' };
  d.players = [
    { id: 'p1', name: 'Ann', role: 'captain', active: true },
    { id: 'p2', name: 'Ben', role: 'member', active: true },
  ];
  d.seen = { p1: { q1: 5 } };
  d.attempts = [{ id: 'a1', playerId: 'p1', questionId: 'q1', subject: 'biology', kind: 'tossup', correct: true, interrupt: false, latencyMs: 1000, overridden: false, t: 1 }];
  d.settings.soloPlayerId = 'p1';
  return d;
}

describe('sync records', () => {
  it('turns saved data into records, leaving device settings out', () => {
    const r = toRecords(sample());
    expect([...r.keys()].sort()).toEqual(['attempts/a1', 'players/p1', 'players/p2', 'seen/p1', 'team/team']);
  });

  it('pushes new and changed records and deletions, team first', () => {
    const d = sample();
    let known = {};
    const first = localChanges(toRecords(d), known);
    expect(first.map((c) => recordKey(c.c, c.id))).toEqual(['team/team', 'players/p1', 'players/p2', 'attempts/a1', 'seen/p1']);
    expect(first.every((c) => c.baseRev === null)).toBe(true);
    // The server stored them all.
    known = rememberRecords(known, first.map((c, i) => ({ c: c.c, id: c.id, body: c.body, rev: i + 1, by: 'm' })));
    expect(localChanges(toRecords(d), known)).toEqual([]);
    // Ben renamed, an attempt deleted.
    d.players[1] = { ...d.players[1], name: 'Benjamin' };
    d.attempts = [];
    const next = localChanges(toRecords(d), known);
    expect(next.map((c) => [recordKey(c.c, c.id), c.body === null, c.baseRev])).toEqual([
      ['players/p2', false, 3],
      ['attempts/a1', true, 4],
    ]);
  });

  it('applies records from the server and remembers them', () => {
    const d = sample();
    const incoming: SyncRecord[] = [
      { c: 'players', id: 'p3', body: { id: 'p3', name: 'Cy', role: 'member', active: true }, rev: 7, by: 'm2' },
      { c: 'players', id: 'p2', body: null, rev: 8, by: 'm2' },
      { c: 'seen', id: 'p1', body: { q1: 5, q2: 9 }, rev: 9, by: 'm2' },
      { c: 'completions', id: 'x:p1', body: { id: 'x:p1', assignmentId: 'x', playerId: 'p1', at: '' }, rev: 10, by: 'm2' },
    ];
    applyRecords(d, incoming);
    expect(d.players.map((p) => p.name)).toEqual(['Ann', 'Cy']);
    expect(d.seen.p1).toEqual({ q1: 5, q2: 9 });
    expect(d.completions['x:p1']).toBeTruthy();
    const known = rememberRecords({}, incoming);
    expect(known['players/p2']).toEqual({ fp: DELETED, rev: 8 });
    expect(known['seen/p1'].fp).toBe(fingerprint({ q1: 5, q2: 9 }));
    // A record deleted on the server is not pushed back as a deletion.
    expect(localChanges(toRecords(d), known).some((c) => c.id === 'p2')).toBe(false);
  });
});

describe('push batches', () => {
  const change = (id: string, size: number): PushChange => ({ c: 'visuals', id, body: { pad: 'x'.repeat(size) }, baseRev: null });

  it('stops at the count or the byte budget, but always sends at least one change', () => {
    const changes = [change('a', 100), change('b', 100), change('c', 100)];
    expect(pushBatch(changes, 2, 1_000_000).map((c) => c.id)).toEqual(['a', 'b']);
    // Each change is about 160 bytes of JSON (100 of padding plus the rest), so two fit in 400.
    expect(pushBatch(changes, 10, 400).map((c) => c.id)).toEqual(['a', 'b']);
    expect(pushBatch([change('big', 5_000)], 10, 300).map((c) => c.id)).toEqual(['big']);
    expect(pushBatch([], 10, 300)).toEqual([]);
  });
});
