/**
 * `GET /api/sync`: the profile, the team and both sets of records in one request, from cursors; and that a page
 * left open (which asks again and again) writes nothing to the user's or the team's storage when nothing changed.
 */
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { call, join, makeTeam, putRecords, signUp, teamWith, type Json } from './helpers';

const changesIn = (stub: DurableObjectStub) => runInDurableObject(stub, (_i, state) => state.storage.sql.exec<{ n: number }>('SELECT total_changes() AS n').one().n);
const userStub = (id: string) => env.USER.get(env.USER.idFromName(id));
const teamStub = (id: string) => env.TEAMS.get(env.TEAMS.idFromName(id));

async function sync(token: string, query = ''): Promise<Json> {
  const res = await call(`/api/sync${query}`, { token });
  expect(res.status).toBe(200);
  return res.body;
}

describe('sync', () => {
  it('answers a player with no team: profile, no team, their records from the cursor', async () => {
    const user = await signUp('Noor');
    await putRecords('/api/me/records', user.token, [
      { c: 'attempts', id: 'a1', body: { playerId: user.id, questionId: 'q1', t: 1 } },
      { c: 'attempts', id: 'a2', body: { playerId: user.id, questionId: 'q2', t: 2 } },
    ]);
    const all = await sync(user.token);
    expect(all.user).toMatchObject({ id: user.id, name: 'Noor' });
    expect(all.team).toBeNull();
    expect(all.teamData).toBeNull();
    expect(all.mine).toMatchObject({ cursor: 2, more: false, head: 2 });
    expect(all.mine.records.map((r: Json) => r.id)).toEqual(['a1', 'a2']);
    const later = await sync(user.token, '?u=1');
    expect(later.mine.records.map((r: Json) => r.id)).toEqual(['a2']);
    expect((await sync(user.token, '?u=2')).mine).toEqual({ cursor: 2, records: [], more: false, head: 2 });
  });

  it("answers a team's member with the team, its members and its records, as the team's own routes do", async () => {
    const { team, members: [ana] } = await teamWith('Cora Captain', 'Ana');
    await putRecords(`/api/teams/${team.teamId}/records`, team.captain.token, [{ c: 'lineups', id: 'l1', body: { id: 'l1', name: 'Regional', starters: [], alternates: [] } }]);
    const mine = await sync(ana!.token);
    expect(mine.team).toEqual({ id: team.teamId, name: 'Ridgeview Science Bowl', level: 'HS', role: 'member' });
    const direct = (await call(`/api/teams/${team.teamId}`, { token: ana!.token })).body;
    expect(mine.teamData.team).toEqual(direct.team);
    expect(mine.teamData.members.map((m: Json) => m.name).sort()).toEqual(['Ana', 'Cora Captain']);
    expect(mine.teamData.you).toEqual({ role: 'member' });
    // Only coaches and captains get the invite code.
    expect(mine.teamData.joinCode).toBeUndefined();
    expect((await sync(team.captain.token)).teamData.joinCode).toBe(team.joinCode);
    expect(mine.teamData.records).toMatchObject({ cursor: 1, more: false, head: 1 });
    expect(mine.teamData.records.records).toEqual([{ c: 'lineups', id: 'l1', body: expect.objectContaining({ name: 'Regional' }), rev: 1, by: team.captain.id }]);

    // The team cursor counts only for the team it came from: with another team's (or none), everything comes.
    expect((await sync(ana!.token, `?t=1&team=${team.teamId}`)).teamData.records.records).toEqual([]);
    expect((await sync(ana!.token, '?t=1&team=aaaaaaaaaaaaaaaa')).teamData.records.records).toHaveLength(1);
    expect((await sync(ana!.token, '?t=1')).teamData.records.records).toHaveLength(1);
  });

  it("carries the player's latest name to the team, and the team's latest name to the player", async () => {
    const { team, members: [ana] } = await teamWith('Cora Captain', 'Ana');
    await call('/api/me', { method: 'PATCH', token: ana!.token, body: { name: 'Ana Maria', primarySubject: 'physics' } });
    await call(`/api/teams/${team.teamId}`, { method: 'PATCH', token: team.captain.token, body: { name: 'Ridgeview A' } });
    const seen = await sync(team.captain.token);
    expect(seen.team.name).toBe('Ridgeview A');
    expect(seen.teamData.members.find((m: Json) => m.userId === ana!.id)).toMatchObject({ name: 'Ana Maria', primarySubject: 'physics' });
    // The account's own summary of its team follows (it names the level questions are written for).
    expect((await sync(ana!.token)).team.name).toBe('Ridgeview A');
    expect((await call('/api/me', { token: ana!.token })).body.team.name).toBe('Ridgeview A');
  });

  it('shows a removed member that they are on no team, and their account stops pointing at it', async () => {
    const { team, members: [ana] } = await teamWith('Cora Captain', 'Ana');
    expect((await call(`/api/teams/${team.teamId}/members/${ana!.id}`, { method: 'DELETE', token: team.captain.token })).status).toBe(200);
    const after = await sync(ana!.token);
    expect(after.team).toBeNull();
    expect(after.teamData).toBeNull();
    // They can join another team at once.
    const other = await makeTeam(await signUp('Dev'));
    expect((await join(other, ana!)).status).toBe(200);
    expect((await sync(ana!.token)).team.id).toBe(other.teamId);
  });

  it('needs a session, and checks the cursors', async () => {
    const user = await signUp('Pia');
    expect((await call('/api/sync')).status).toBe(401);
    expect((await call('/api/sync', { token: `${user.id}.${'x'.repeat(43)}` })).status).toBe(401);
    expect((await call('/api/sync?u=-1', { token: user.token })).status).toBe(400);
    expect((await call('/api/sync?t=abc', { token: user.token })).status).toBe(400);
    expect((await call('/api/sync', { method: 'POST', token: user.token, body: {} })).status).toBe(405);
  });

  it('writes nothing when nothing changed, however often a page asks', async () => {
    const { team, members: [ana] } = await teamWith('Cora Captain', 'Ana');
    await sync(ana!.token);
    const user = await changesIn(userStub(ana!.id));
    const teamChanges = await changesIn(teamStub(team.teamId));
    for (let i = 0; i < 5; i++) await sync(ana!.token, `?u=0&t=0&team=${team.teamId}`);
    expect(await changesIn(userStub(ana!.id))).toBe(user);
    expect(await changesIn(teamStub(team.teamId))).toBe(teamChanges);
    // The older route for the profile checks the team too, and is as quiet.
    for (let i = 0; i < 3; i++) expect((await call('/api/me', { token: ana!.token })).status).toBe(200);
    expect(await changesIn(userStub(ana!.id))).toBe(user);
    expect(await changesIn(teamStub(team.teamId))).toBe(teamChanges);
  });
});
