import { describe, expect, it } from 'vitest';
import { MAX_RECORD_BYTES, SYNC_COLLECTIONS, SYNC_PAGE_SIZE, type PushChange } from '../../src/core/sync';
import { addMember, call, createTeam, join, sync } from './helpers';

const put = (c: PushChange['c'], id: string, body: unknown, baseRev: number | null = null): PushChange => ({ c, id, body, baseRev });

describe('sync', () => {
  it('pushes records from one device and pulls them on another', async () => {
    const team = await createTeam();
    const pushed = await sync(team, team.token, 0, [
      put('players', 'p-cora', { name: 'Cora', role: 'captain' }),
      put('games', 'g1', { score: [10, 4] }),
    ]);
    expect(pushed.rejected).toEqual([]);
    expect(pushed.more).toBe(false);
    // What the device pushed comes back with its new revisions.
    expect(pushed.changes).toEqual([
      { c: 'players', id: 'p-cora', body: { name: 'Cora', role: 'captain' }, rev: 1, by: team.member.id },
      { c: 'games', id: 'g1', body: { score: [10, 4] }, rev: 2, by: team.member.id },
    ]);
    expect(pushed.cursor).toBe(2);

    // Another device (a teammate's phone) starts from scratch.
    const max = await addMember(team, 'Max', 'p-max');
    const pulled = await sync(team, max.token, 0);
    expect(pulled.changes.map((r) => [r.c, r.id, r.rev])).toEqual([
      ['players', 'p-cora', 1],
      ['games', 'g1', 2],
    ]);
    expect(pulled.cursor).toBe(2);
    // Nothing new since: same cursor back, no changes.
    expect(await sync(team, max.token, 2)).toEqual({ cursor: 2, changes: [], rejected: [], more: false });
  });

  it('pages with a cursor and `more`', async () => {
    const team = await createTeam();
    const total = SYNC_PAGE_SIZE + 20;
    const ids = Array.from({ length: total }, (_, i) => `g${String(i).padStart(4, '0')}`);
    await sync(team, team.token, 0, ids.slice(0, SYNC_PAGE_SIZE).map((id) => put('games', id, { n: id })));
    const last = await sync(team, team.token, total, ids.slice(SYNC_PAGE_SIZE).map((id) => put('games', id, { n: id })));
    expect(last.cursor).toBe(total);

    const first = await sync(team, team.token, 0);
    expect(first.changes).toHaveLength(SYNC_PAGE_SIZE);
    expect(first.more).toBe(true);
    expect(first.cursor).toBe(SYNC_PAGE_SIZE);
    expect(first.changes.map((r) => r.rev)).toEqual(Array.from({ length: SYNC_PAGE_SIZE }, (_, i) => i + 1));

    const second = await sync(team, team.token, first.cursor);
    expect(second.changes.map((r) => r.id)).toEqual(ids.slice(SYNC_PAGE_SIZE));
    expect(second.more).toBe(false);
    expect(second.cursor).toBe(total);
  });

  it('ends a page early when its records get large, and refuses records over the size limit', async () => {
    const team = await createTeam();
    const big = (i: number) => ({ text: String(i).repeat(800_000) });
    // Two 800 KB packets per request keeps each request under the 2 MB limit.
    for (let i = 0; i < 6; i += 2) await sync(team, team.token, 1_000, [put('packets', `k${i}`, big(i)), put('packets', `k${i + 1}`, big(i + 1))]);

    const first = await sync(team, team.token, 0);
    expect(first.more).toBe(true);
    expect(first.changes.length).toBe(5);
    const second = await sync(team, team.token, first.cursor);
    expect(second.changes.map((r) => r.id)).toEqual(['k5']);
    expect(second.more).toBe(false);

    const tooBig = await sync(team, team.token, 6, [put('packets', 'huge', { text: 'x'.repeat(MAX_RECORD_BYTES) })]);
    expect(tooBig.rejected).toEqual([{ c: 'packets', id: 'huge', reason: expect.stringMatching(/too large/) }]);
    expect(tooBig.changes).toEqual([]);
  });

  it('refuses changes the member may not make, and stores the rest', async () => {
    const team = await createTeam();
    const max = await addMember(team, 'Max', 'p-max');
    const result = await sync(team, max.token, 0, [
      put('team', 'team', { name: 'Hacked' }),
      put('attempts', 'a-cora', { playerId: 'p-cora', correct: true }),
      put('lineups', 'l1', { players: ['p-max'] }),
      put('plans', 'p-cora', { days: [] }),
      put('conceptReads', 'p-cora', { c1: 1 }),
      put('attempts', 'a-max', { playerId: 'p-max', correct: false }),
      put('conceptReads', 'p-max', { c1: 5 }),
      put('games', 'g1', { score: [1, 0] }),
      { c: 'settings' as PushChange['c'], id: 'x', body: {}, baseRev: null },
      put('games', 'x'.repeat(201), {}),
    ]);
    expect(result.rejected).toEqual([
      { c: 'team', id: 'team', reason: expect.stringMatching(/permission/) },
      { c: 'attempts', id: 'a-cora', reason: expect.stringMatching(/permission/) },
      { c: 'lineups', id: 'l1', reason: expect.stringMatching(/permission/) },
      { c: 'plans', id: 'p-cora', reason: expect.stringMatching(/permission/) },
      { c: 'conceptReads', id: 'p-cora', reason: expect.stringMatching(/permission/) },
      { c: 'settings', id: 'x', reason: expect.stringMatching(/can't be synced/) },
      { c: 'games', id: 'x'.repeat(201), reason: expect.stringMatching(/1 to 200 characters/) },
    ]);
    expect(result.changes.map((r) => `${r.c}/${r.id}`)).toEqual(['attempts/a-max', 'conceptReads/p-max', 'games/g1']);

    // Leaders may write leader-only collections.
    const lead = await sync(team, team.token, result.cursor, [put('team', 'team', { name: 'Ridgeview' }), put('lineups', 'l1', { players: [] })]);
    expect(lead.rejected).toEqual([]);
    expect(lead.changes).toHaveLength(2);
  });

  it('knows every collection in the shared contract', async () => {
    const team = await createTeam({ playerId: 'p-cora' });
    const changes = SYNC_COLLECTIONS.map((c) => put(c, c === 'plans' || c === 'conceptReads' || c === 'players' ? 'p-cora' : `${c}-1`, { playerId: 'p-cora' }));
    const result = await sync(team, team.token, 0, changes);
    expect(result.rejected).toEqual([]);
    expect(result.changes.map((r) => r.c)).toEqual([...SYNC_COLLECTIONS]);
  });

  it('turns deletes into tombstones that other devices receive', async () => {
    const team = await createTeam();
    const max = await addMember(team, 'Max', 'p-max');
    const created = await sync(team, team.token, 0, [put('games', 'g1', { score: [3, 2] })]);
    const rev = created.changes[0]!.rev;
    const maxView = await sync(team, max.token, 0);
    expect(maxView.changes.map((r) => r.id)).toEqual(['g1']);

    const deleted = await sync(team, team.token, created.cursor, [put('games', 'g1', null, rev)]);
    expect(deleted.changes).toEqual([{ c: 'games', id: 'g1', body: null, rev: rev + 1, by: team.member.id }]);

    const later = await sync(team, max.token, maxView.cursor);
    expect(later.changes).toEqual([{ c: 'games', id: 'g1', body: null, rev: rev + 1, by: team.member.id }]);
    // A fresh device sees the tombstone too, so it never resurrects the record.
    expect((await sync(team, max.token, 0)).changes).toEqual(later.changes);

    // Deleting again, or deleting something that never existed, changes nothing.
    const again = await sync(team, team.token, deleted.cursor, [put('games', 'g1', null, null), put('games', 'never', null)]);
    expect(again).toEqual({ cursor: deleted.cursor, changes: [], rejected: [], more: false });
  });

  it('merges concurrent seen edits and replaces non-concurrent ones', async () => {
    const team = await createTeam();
    const laptop = team.token;
    const phone = (await join(team.teamId, { secret: team.secret, memberName: 'Cora Captain', pin: '2468' })).body.token;

    const a = await sync(team, laptop, 0, [put('seen', 'p-cora', { q1: 100, q2: 50 })]);
    const rev1 = a.changes[0]!.rev;
    // The phone never saw rev1 (baseRev null): the edits are concurrent, so the ledgers union at the earlier time.
    const b = await sync(team, phone, 0, [put('seen', 'p-cora', { q2: 20, q3: 300 }, null)]);
    const merged = b.changes.find((r) => r.c === 'seen')!;
    expect(merged.body).toEqual({ q1: 100, q2: 20, q3: 300 });
    expect(merged.rev).toBe(rev1 + 1);

    // An edit made after seeing the latest version replaces it.
    const c = await sync(team, laptop, merged.rev, [put('seen', 'p-cora', { q9: 1 }, merged.rev)]);
    expect(c.changes).toEqual([{ c: 'seen', id: 'p-cora', body: { q9: 1 }, rev: merged.rev + 1, by: team.member.id }]);

    // A stale baseRev counts as concurrent too.
    const d = await sync(team, phone, c.cursor, [put('seen', 'p-cora', { q10: 2 }, rev1)]);
    expect(d.changes[0]!.body).toEqual({ q9: 1, q10: 2 });
  });

  it('merges concurrent conceptReads like seen ledgers', async () => {
    const team = await createTeam();
    const max = await addMember(team, 'Max', 'p-max');
    await sync(team, max.token, 0, [put('conceptReads', 'p-max', { c1: 10 })]);
    const second = await sync(team, max.token, 0, [put('conceptReads', 'p-max', { c2: 20 }, null)]);
    expect(second.changes.at(-1)!.body).toEqual({ c1: 10, c2: 20 });
  });

  it('never changes a stored attempt through a concurrent push', async () => {
    const team = await createTeam();
    const max = await addMember(team, 'Max', 'p-max');
    const first = await sync(team, max.token, 0, [put('attempts', 'a1', { playerId: 'p-max', correct: true, at: 1 })]);
    const rev = first.changes[0]!.rev;

    for (const baseRev of [null, rev - 1]) {
      const again = await sync(team, max.token, first.cursor, [put('attempts', 'a1', { playerId: 'p-max', correct: false, at: 1 }, baseRev)]);
      expect(again).toEqual({ cursor: first.cursor, changes: [], rejected: [], more: false });
    }
    const stored = (await sync(team, team.token, 0)).changes.find((r) => r.id === 'a1')!;
    expect(stored).toEqual({ c: 'attempts', id: 'a1', body: { playerId: 'p-max', correct: true, at: 1 }, rev, by: max.member.id });
  });

  it('makes one revision per real change', async () => {
    const team = await createTeam();
    const first = await sync(team, team.token, 0, [put('games', 'g1', { a: 1, b: { c: [1, 2] } })]);
    const rev = first.changes[0]!.rev;
    // Identical body (even with keys in another order, and pushed as concurrent): no new revision.
    for (const baseRev of [rev, null]) {
      const same = await sync(team, team.token, first.cursor, [put('games', 'g1', { b: { c: [1, 2] }, a: 1 }, baseRev)]);
      expect(same).toEqual({ cursor: first.cursor, changes: [], rejected: [], more: false });
    }
    // The same record twice in one push: two real changes, two revisions.
    const twice = await sync(team, team.token, first.cursor, [put('games', 'g1', { a: 2 }, rev), put('games', 'g1', { a: 3 }, rev + 1)]);
    expect(twice.changes).toEqual([{ c: 'games', id: 'g1', body: { a: 3 }, rev: rev + 2, by: team.member.id }]);
    expect(twice.cursor).toBe(rev + 2);
  });

  it('refuses malformed requests as a whole', async () => {
    const team = await createTeam();
    const path = `/api/teams/${team.teamId}/sync`;
    const bad: unknown[] = [
      { cursor: -1, changes: [] },
      { cursor: 1.5, changes: [] },
      { cursor: 0, changes: {} },
      { cursor: 0, changes: [{ c: 'games', id: 'g1' }] },
      { cursor: 0, changes: [{ c: 'games', id: 7, body: {} }] },
      { cursor: 0, changes: [{ c: 'games', id: 'g', body: {}, baseRev: 'x' }] },
      [],
    ];
    for (const body of bad) expect((await call(path, { token: team.token, body })).status, JSON.stringify(body)).toBe(400);
    const tooMany = Array.from({ length: SYNC_PAGE_SIZE + 1 }, (_, i) => put('games', `g${i}`, {}));
    expect((await call(path, { token: team.token, body: { cursor: 0, changes: tooMany } })).status).toBe(413);
    // A pull with no changes at all is fine.
    expect((await call(path, { token: team.token, body: { cursor: 0 } })).status).toBe(200);
  });
});
