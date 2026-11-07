import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { addMember, call, createTeam, join, sync } from './helpers';

const teamStub = (teamId: string) => env.TEAM.get(env.TEAM.idFromName(teamId));

/** Runs SQL inside a team's Durable Object (to look at storage or move its clock-based fields). */
function teamSql(teamId: string, query: string, ...bindings: unknown[]) {
  return runInDurableObject(teamStub(teamId), (_instance, state) => state.storage.sql.exec(query, ...bindings).toArray());
}

describe('creating a team', () => {
  it('returns a join code, a session and the captain', async () => {
    const team = await createTeam({ memberName: '  Cora   Captain ' });
    expect(team.teamId).toMatch(/^[a-z2-7]{16}$/);
    expect(team.joinCode).toMatch(new RegExp(`^${team.teamId}\\.[a-z2-7]{12}$`));
    expect(team.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(team.member).toEqual({ id: expect.stringMatching(/^[a-z2-7]{16}$/), name: 'Cora Captain', role: 'captain', playerId: 'p-cora' });

    const me = await call(`/api/teams/${team.teamId}/me`, { token: team.token });
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ member: team.member, teamName: 'Ridgeview Science Bowl' });
  });

  it('stores only hashes of the PIN, the join secret and the session token', async () => {
    const team = await createTeam({ pin: '24680' });
    const [member] = await teamSql(team.teamId, 'SELECT pin_hash, pin_salt FROM members');
    expect(member!.pin_hash).toMatch(/^20000\$[0-9a-f]{64}$/);
    expect(member!.pin_salt).toMatch(/^[0-9a-f]{32}$/);
    const dump = JSON.stringify([
      await teamSql(team.teamId, 'SELECT * FROM meta'),
      await teamSql(team.teamId, 'SELECT * FROM members'),
      await teamSql(team.teamId, 'SELECT * FROM sessions'),
    ]);
    for (const secret of ['24680', team.secret, team.token]) expect(dump).not.toContain(secret);
  });

  it('refuses bad input with plain-language messages', async () => {
    const base = { teamName: 'T', level: 'HS', memberName: 'Ann', pin: '1234' };
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ pin: '12a4' }, /PIN must be 4 to 8 digits/],
      [{ pin: 1234 }, /PIN must be 4 to 8 digits/],
      [{ pin: '123' }, /PIN must be 4 to 8 digits/],
      [{ pin: '123456789' }, /PIN must be 4 to 8 digits/],
      [{ memberName: 'x'.repeat(41) }, /name of 1 to 40 characters/],
      [{ memberName: '   ' }, /name of 1 to 40 characters/],
      [{ memberName: 'bad\u0000name' }, /name of 1 to 40 characters/],
      [{ level: 'College' }, /level/],
      [{ teamName: '' }, /team name/],
      [{ playerId: 'p'.repeat(201) }, /roster player id/],
    ];
    for (const [change, message] of cases) {
      const res = await call('/api/teams', { body: { ...base, ...change } });
      expect(res.status, JSON.stringify(change)).toBe(400);
      expect(res.body.error).toMatch(message);
    }
    expect((await call('/api/teams', { body: [] })).status).toBe(400);
    const notJson = await call('/api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(notJson.status).toBe(400);
  });

  it('answers 404 for team ids that are malformed or unknown', async () => {
    expect((await call('/api/teams/NOT-A-TEAM/me')).status).toBe(404);
    const unknown = await call('/api/teams/aaaaaaaaaaaaaaaa/join', { body: { secret: 'x', memberName: 'A', pin: '1234' } });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toMatch(/couldn't find that team/);
  });
});

describe('joining and signing in', () => {
  it('lets a new member join with the secret, then sign in on another device with name and PIN', async () => {
    const team = await createTeam();
    const first = await join(team.teamId, { secret: team.secret, memberName: 'Max Member', pin: '1357', playerId: 'p-max' });
    expect(first.status).toBe(200);
    expect(first.body.member).toEqual({ id: expect.any(String), name: 'Max Member', role: 'member', playerId: 'p-max' });
    expect(first.body.teamName).toBe('Ridgeview Science Bowl');

    // Another device: same name in another case, the PIN, and the join code (secret in upper case too).
    const second = await join(team.teamId, { secret: team.secret.toUpperCase(), memberName: 'max member', pin: '1357' });
    expect(second.status).toBe(200);
    expect(second.body.member.id).toBe(first.body.member.id);
    expect(second.body.token).not.toBe(first.body.token);

    for (const token of [first.body.token, second.body.token]) {
      const me = await call(`/api/teams/${team.teamId}/me`, { token });
      expect(me.status).toBe(200);
      expect(me.body.member.name).toBe('Max Member');
    }
  });

  it('refuses a wrong secret', async () => {
    const team = await createTeam();
    const wrong = await join(team.teamId, { secret: 'aaaaaaaaaaaa', memberName: 'Eve', pin: '1111' });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toMatch(/join link no longer works/);
    const garbage = await join(team.teamId, { secret: 'not even close', memberName: 'Eve', pin: '1111' });
    expect(garbage.status).toBe(403);
    const missing = await join(team.teamId, { memberName: 'Eve', pin: '1111' });
    expect(missing.status).toBe(400);
  });

  it('locks a member for 15 minutes after five wrong PINs', async () => {
    const team = await createTeam();
    await addMember(team, 'Lee', 'p-lee', '9999');
    for (let i = 1; i <= 5; i++) {
      const res = await join(team.teamId, { secret: team.secret, memberName: 'Lee', pin: '0000' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(i < 5 ? new RegExp(`${5 - i} tr(y|ies) left`) : /try again in 15 minutes/);
    }
    // Locked: even the right PIN is refused.
    const locked = await join(team.teamId, { secret: team.secret, memberName: 'Lee', pin: '9999' });
    expect(locked.status).toBe(429);
    expect(locked.body.error).toMatch(/Too many wrong PINs/);
    expect(Number(locked.headers.get('Retry-After'))).toBeGreaterThan(14 * 60);

    // Fifteen minutes later (moved in storage rather than waited for), the right PIN works and resets the count.
    await teamSql(team.teamId, "UPDATE members SET locked_until = ? WHERE name = 'Lee'", Date.now() - 1);
    const after = await join(team.teamId, { secret: team.secret, memberName: 'Lee', pin: '9999' });
    expect(after.status).toBe(200);
    const [row] = await teamSql(team.teamId, "SELECT failed, locked_until FROM members WHERE name = 'Lee'");
    expect(row).toEqual({ failed: 0, locked_until: 0 });
  });

  it('forgives earlier wrong PINs once the right one is used', async () => {
    const team = await createTeam();
    await addMember(team, 'Kim', 'p-kim', '4321');
    for (let i = 0; i < 4; i++) expect((await join(team.teamId, { secret: team.secret, memberName: 'Kim', pin: '1111' })).status).toBe(403);
    expect((await join(team.teamId, { secret: team.secret, memberName: 'Kim', pin: '4321' })).status).toBe(200);
    expect((await join(team.teamId, { secret: team.secret, memberName: 'Kim', pin: '1111' })).body.error).toMatch(/4 tries left/);
  });

  it('allows 30 failed joins per address per hour; successful joins do not count', async () => {
    const team = await createTeam();
    const ip = '192.0.2.44';
    for (let i = 0; i < 3; i++) await join(team.teamId, { secret: team.secret, memberName: `Player ${i}`, pin: '1234' }, ip);
    for (let i = 0; i < 30; i++) {
      const res = await join(team.teamId, { secret: 'bbbbbbbbbbbb', memberName: 'Guesser', pin: '1234' }, ip);
      expect(res.status).toBe(403);
    }
    const blocked = await join(team.teamId, { secret: team.secret, memberName: 'Player 0', pin: '1234' }, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Too many failed sign-ins from this network/);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(50 * 60);
    // Another network is not affected.
    expect((await join(team.teamId, { secret: team.secret, memberName: 'Player 0', pin: '1234' }, '192.0.2.45')).status).toBe(200);
    // Addresses are stored only as salted hashes.
    const rows = await teamSql(team.teamId, 'SELECT * FROM join_failures');
    expect(JSON.stringify(rows)).not.toContain('192.0.2');
  });

  it('keeps names unique regardless of case, and one member per roster player', async () => {
    const team = await createTeam();
    // "CORA CAPTAIN" is the captain's name, so this is a sign-in with a wrong PIN, not a new member.
    const sameName = await join(team.teamId, { secret: team.secret, memberName: 'CORA CAPTAIN', pin: '1111' });
    expect(sameName.status).toBe(403);
    const takenPlayer = await join(team.teamId, { secret: team.secret, memberName: 'Someone Else', pin: '1111', playerId: 'p-cora' });
    expect(takenPlayer.status).toBe(409);
    expect(takenPlayer.body.error).toMatch(/Cora Captain is already linked/);
  });

  it('links a member without a roster player when they sign in and choose one, but never moves an existing link', async () => {
    const team = await createTeam();
    const first = await join(team.teamId, { secret: team.secret, memberName: 'Nia', pin: '2468' });
    expect(first.body.member.playerId).toBeNull();
    // "Which player are you?": the same name and PIN, now with a roster player.
    const linked = await join(team.teamId, { secret: team.secret, memberName: 'Nia', pin: '2468', playerId: 'p-nia' });
    expect(linked.status).toBe(200);
    expect(linked.body.member.playerId).toBe('p-nia');
    // Once linked, signing in with another player changes nothing (leaders change links).
    const again = await join(team.teamId, { secret: team.secret, memberName: 'Nia', pin: '2468', playerId: 'p-other' });
    expect(again.body.member.playerId).toBe('p-nia');
    // A roster player someone else has is refused.
    await join(team.teamId, { secret: team.secret, memberName: 'Oz', pin: '1357' });
    const taken = await join(team.teamId, { secret: team.secret, memberName: 'Oz', pin: '1357', playerId: 'p-nia' });
    expect(taken.status).toBe(409);
  });

  it("links a new member to the roster player with the same name when there is exactly one free", async () => {
    const team = await createTeam();
    const players = [
      { id: 'p-ben', name: 'Ben', role: 'member', active: true },
      { id: 'p-ann1', name: 'Ann', role: 'member', active: true },
      { id: 'p-ann2', name: 'ann', role: 'member', active: true },
      { id: 'p-old', name: 'Gil', role: 'member', active: false },
    ];
    await sync(team, team.token, 0, players.map((body) => ({ c: 'players', id: body.id, body, baseRev: null })));
    expect((await addMember(team, 'BEN', null)).member.playerId).toBe('p-ben');
    // Two players called Ann: no guess. An inactive player is never matched.
    expect((await addMember(team, 'Ann', null)).member.playerId).toBeNull();
    expect((await addMember(team, 'Gil', null)).member.playerId).toBeNull();
    // An explicit choice still wins over the name.
    expect((await addMember(team, 'Ben Two', 'p-ann1')).member.playerId).toBe('p-ann1');
  });

  it('changes a PIN only with the current one', async () => {
    const team = await createTeam();
    const max = await addMember(team, 'Max', 'p-max', '1357');
    const pinPath = `/api/teams/${team.teamId}/pin`;
    const wrong = await call(pinPath, { token: max.token, body: { pin: '0000', newPin: '8642' } });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toMatch(/current PIN isn't right/);
    expect((await call(pinPath, { token: max.token, body: { pin: '1357', newPin: '86' } })).status).toBe(400);
    expect((await call(pinPath, { token: max.token, body: { pin: '1357', newPin: '8642' } })).body).toEqual({ ok: true });
    expect((await join(team.teamId, { secret: team.secret, memberName: 'Max', pin: '1357' })).status).toBe(403);
    expect((await join(team.teamId, { secret: team.secret, memberName: 'Max', pin: '8642' })).status).toBe(200);
  });
});

describe('sessions', () => {
  it('needs a valid bearer token', async () => {
    const team = await createTeam();
    const me = `/api/teams/${team.teamId}/me`;
    expect((await call(me)).status).toBe(401);
    expect((await call(me, { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await call(me, { token: 'A'.repeat(43) })).status).toBe(401);
    // The query-string token is for the room WebSocket only.
    expect((await call(`${me}?token=${team.token}`)).status).toBe(401);
  });

  it('signing out ends only that session', async () => {
    const team = await createTeam();
    const other = await join(team.teamId, { secret: team.secret, memberName: 'Cora Captain', pin: '2468' });
    expect((await call(`/api/teams/${team.teamId}/signout`, { method: 'POST', token: team.token })).body).toEqual({ ok: true });
    expect((await call(`/api/teams/${team.teamId}/me`, { token: team.token })).status).toBe(401);
    expect((await call(`/api/teams/${team.teamId}/me`, { token: other.body.token })).status).toBe(200);
  });

  it('expires sessions unused for 180 days', async () => {
    const team = await createTeam();
    await teamSql(team.teamId, 'UPDATE sessions SET last_used = ?', Date.now() - 181 * 24 * 60 * 60 * 1000);
    const res = await call(`/api/teams/${team.teamId}/me`, { token: team.token });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/180 days/);
    expect(await teamSql(team.teamId, 'SELECT * FROM sessions')).toEqual([]);
  });
});

describe('leaders', () => {
  it('rotating the join code makes the old one stop working', async () => {
    const team = await createTeam();
    const max = await addMember(team, 'Max', 'p-max');
    expect((await call(`/api/teams/${team.teamId}/join-code`, { method: 'POST', token: max.token })).status).toBe(403);

    const rotated = await call(`/api/teams/${team.teamId}/join-code`, { method: 'POST', token: team.token });
    expect(rotated.status).toBe(200);
    expect(rotated.body.joinCode).toMatch(new RegExp(`^${team.teamId}\\.[a-z2-7]{12}$`));
    expect(rotated.body.joinCode).not.toBe(team.joinCode);
    const newSecret = rotated.body.joinCode.split('.')[1];

    expect((await join(team.teamId, { secret: team.secret, memberName: 'Nia', pin: '1234' })).status).toBe(403);
    expect((await join(team.teamId, { secret: team.secret, memberName: 'Max', pin: '1357' })).status).toBe(403);
    expect((await join(team.teamId, { secret: newSecret, memberName: 'Nia', pin: '1234' })).status).toBe(200);
    // Existing sessions are unaffected.
    expect((await call(`/api/teams/${team.teamId}/me`, { token: max.token })).status).toBe(200);
  });

  it("removing a member ends their sessions", async () => {
    const team = await createTeam();
    const max = await addMember(team, 'Max', 'p-max');
    const maxPhone = await join(team.teamId, { secret: team.secret, memberName: 'Max', pin: '1357' });
    expect((await call(`/api/teams/${team.teamId}/members/${max.member.id}`, { method: 'DELETE', token: max.token })).status).toBe(403);

    const removed = await call(`/api/teams/${team.teamId}/members/${max.member.id}`, { method: 'DELETE', token: team.token });
    expect(removed.body).toEqual({ ok: true });
    for (const token of [max.token, maxPhone.body.token]) {
      expect((await call(`/api/teams/${team.teamId}/me`, { token })).status).toBe(401);
      expect((await call(`/api/teams/${team.teamId}/sync`, { token, body: { cursor: 0, changes: [] } })).status).toBe(401);
    }
    expect((await call(`/api/teams/${team.teamId}/members/${max.member.id}`, { method: 'DELETE', token: team.token })).status).toBe(404);
  });

  it('lists members with last seen times, for leaders only', async () => {
    const team = await createTeam();
    const max = await addMember(team, 'Max', 'p-max');
    expect((await call(`/api/teams/${team.teamId}/members`, { token: max.token })).status).toBe(403);
    const list = await call(`/api/teams/${team.teamId}/members`, { token: team.token });
    expect(list.status).toBe(200);
    expect(list.body.members).toEqual([
      { id: team.member.id, name: 'Cora Captain', role: 'captain', playerId: 'p-cora', lastSeen: expect.any(Number) },
      { id: max.member.id, name: 'Max', role: 'member', playerId: 'p-max', lastSeen: expect.any(Number) },
    ]);
  });

  it('changes roles and roster links, and keeps at least one leader', async () => {
    const team = await createTeam();
    const max = await addMember(team, 'Max', 'p-max');
    const path = `/api/teams/${team.teamId}/members`;

    expect((await call(`${path}/${team.member.id}`, { method: 'PATCH', token: team.token, body: { role: 'member' } })).status).toBe(409);
    expect((await call(`${path}/${team.member.id}`, { method: 'DELETE', token: team.token })).status).toBe(409);
    expect((await call(`${path}/${max.member.id}`, { method: 'PATCH', token: max.token, body: { role: 'coach' } })).status).toBe(403);
    expect((await call(`${path}/${max.member.id}`, { method: 'PATCH', token: team.token, body: { role: 'king' } })).status).toBe(400);
    expect((await call(`${path}/${max.member.id}`, { method: 'PATCH', token: team.token, body: { playerId: 'p-cora' } })).status).toBe(409);
    expect((await call(`${path}/nobody`, { method: 'PATCH', token: team.token, body: { role: 'coach' } })).status).toBe(404);

    const promoted = await call(`${path}/${max.member.id}`, { method: 'PATCH', token: team.token, body: { role: 'coach', playerId: null } });
    expect(promoted.body.member).toEqual({ id: max.member.id, name: 'Max', role: 'coach', playerId: null });
    // Max is now a leader and can do leader things; with two leaders, Cora may step down.
    expect((await call(`${path}/${team.member.id}`, { method: 'PATCH', token: max.token, body: { role: 'member' } })).status).toBe(200);
    expect((await call(`/api/teams/${team.teamId}/members`, { token: team.token })).status).toBe(403);
  });

  it('deletes the whole team (coach or captain only)', async () => {
    const team = await createTeam();
    const max = await addMember(team, 'Max', 'p-max');
    expect((await call(`/api/teams/${team.teamId}`, { method: 'DELETE', token: max.token })).status).toBe(403);
    expect((await call(`/api/teams/${team.teamId}`, { method: 'DELETE', token: team.token })).body).toEqual({ ok: true });

    expect((await call(`/api/teams/${team.teamId}/me`, { token: team.token })).status).toBe(404);
    expect((await join(team.teamId, { secret: team.secret, memberName: 'Max', pin: '1357' })).status).toBe(404);
    expect(await teamSql(team.teamId, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'")).toEqual([]);
  });
});
