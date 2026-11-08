/** Teams: making and joining, one team at a time, leaders, records, teammates' visible records, and game answers. */
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { JOIN_CODE_PATTERN } from '../../src/core/accounts';
import { Outbox } from '../src/outbox';
import { allMyRecords, call, eventually, getRecords, join, makeTeam, putRecords, signUp, teamWith, type Json, type TestTeam, type TestUser } from './helpers';

const teamStub = (teamId: string) => env.TEAM.get(env.TEAM.idFromName(teamId));

const teamPath = (team: TestTeam) => `/api/teams/${team.teamId}`;
const getTeam = (team: TestTeam, user: TestUser) => call(teamPath(team), { token: user.token });
const me = async (user: TestUser) => (await call('/api/me', { token: user.token })).body;
const names = (res: { body: Json }) => res.body.members.map((m: Json) => m.name);

const LAST_LEADER = 'A team needs at least one coach or captain. Make someone else a coach or captain first.';

describe('making and joining a team', () => {
  it('makes the creator captain and gives a join code', async () => {
    const cora = await signUp('Cora');
    const res = await call('/api/teams', { token: cora.token, body: { name: '  Ridgeview   HS ', level: 'MS' } });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ team: { id: expect.any(String), name: 'Ridgeview HS', level: 'MS', createdAt: expect.any(Number) }, joinCode: expect.stringMatching(JOIN_CODE_PATTERN) });
    expect(res.body.joinCode.startsWith(`${res.body.team.id}.`)).toBe(true);
    expect((await me(cora)).team).toEqual({ id: res.body.team.id, name: 'Ridgeview HS', level: 'MS', role: 'captain' });

    expect((await call('/api/teams', { token: cora.token, body: { name: '', level: 'HS' } })).status).toBe(400);
    expect((await call('/api/teams', { token: cora.token, body: { name: 'X', level: 'college' } })).status).toBe(400);
    expect((await call('/api/teams', { body: { name: 'X', level: 'HS' } })).status).toBe(401);
  });

  it('lets anyone with the join code join, and shows the code to leaders only', async () => {
    const team = await makeTeam(await signUp('Cora'), {}, undefined);
    const ana = await signUp('Ana');
    expect((await getTeam(team, ana)).status).toBe(403);

    const wrong = await join(team, ana, { secret: 'aaaaaaaaaaaa' });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toBe('This join link no longer works. Ask your captain for the current one.');
    expect((await join(team, ana, { secret: 'not a secret' })).status).toBe(403);
    expect((await join(team, ana, { secret: '' })).status).toBe(400);
    expect((await call('/api/teams/abcdefghijklmnop/join', { token: ana.token, body: { secret: team.secret } })).status).toBe(404);

    const joined = await join(team, ana, { secret: team.secret.toUpperCase() });
    expect(joined.status).toBe(200);
    expect(joined.body.team).toMatchObject({ id: team.teamId, name: 'Ridgeview Science Bowl', level: 'HS' });
    expect((await me(ana)).team).toEqual({ id: team.teamId, name: 'Ridgeview Science Bowl', level: 'HS', role: 'member' });
    // Joining again is harmless, whatever link is used.
    expect((await join(team, ana, { secret: 'aaaaaaaaaaaa' })).status).toBe(200);

    const asMember = await getTeam(team, ana);
    expect(asMember.body).toEqual({
      team: { id: team.teamId, name: 'Ridgeview Science Bowl', level: 'HS', createdAt: expect.any(Number) },
      members: [
        { userId: ana.id, name: 'Ana', role: 'member', joinedAt: expect.any(Number), lastSeen: expect.any(Number) },
        { userId: team.captain.id, name: 'Cora', role: 'captain', joinedAt: expect.any(Number), lastSeen: expect.any(Number) },
      ],
      you: { role: 'member' },
    });
    expect((await getTeam(team, team.captain)).body.joinCode).toBe(team.joinCode);
  });

  it('keeps each person on one team at a time', async () => {
    const { team: first, members: [ben] } = await teamWith('Cora', 'Ben');
    const second = await makeTeam(await signUp('Dee'));

    const refused = await join(second, ben!);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ error: "You're already on a team. You can be on one team at a time.", inTeam: true });
    const making = await call('/api/teams', { token: ben!.token, body: { name: 'Ben Team', level: 'HS' } });
    expect(making.status).toBe(409);
    expect(making.body.inTeam).toBe(true);

    // With leaveCurrent the old team is left once the new one has them.
    expect((await join(second, ben!, { leaveCurrent: true })).status).toBe(200);
    expect((await me(ben!)).team.id).toBe(second.teamId);
    expect(names(await getTeam(first, first.captain))).toEqual(['Cora']);
    expect(names(await getTeam(second, ben!))).toEqual(['Ben', 'Dee']);

    // A refused join (a wrong code) costs nothing.
    expect((await join(first, ben!, { secret: 'aaaaaaaaaaaa', leaveCurrent: true })).status).toBe(403);
    expect((await me(ben!)).team.id).toBe(second.teamId);

    // Making a team with leaveCurrent: captain of the new one, gone from the old one.
    const made = await call('/api/teams', { token: ben!.token, body: { name: 'Ben Team', level: 'HS', leaveCurrent: true } });
    expect(made.status).toBe(201);
    expect((await me(ben!)).team).toMatchObject({ id: made.body.team.id, role: 'captain' });
    expect(names(await getTeam(second, second.captain))).toEqual(['Dee']);
  });
});

describe('leaving', () => {
  it('keeps the last coach or captain until they hand over, and the last member leaving deletes the team', async () => {
    const { team, members: [ana] } = await teamWith('Cora', 'Ana');
    const cora = team.captain;
    const leave = (user: TestUser) => call(`${teamPath(team)}/leave`, { method: 'POST', token: user.token });

    const refused = await leave(cora);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe(LAST_LEADER);
    const other = await makeTeam(await signUp('Eve'));
    const moving = await join(other, cora, { leaveCurrent: true });
    expect(moving.status).toBe(409);
    expect(moving.body.error).toBe(LAST_LEADER);
    expect((await me(cora)).team.id).toBe(team.teamId);
    expect(names(await getTeam(other, other.captain))).toEqual(['Eve']);

    // Hand over, then leave.
    expect((await call(`${teamPath(team)}/members/${ana!.id}`, { method: 'PATCH', token: cora.token, body: { role: 'coach' } })).status).toBe(200);
    expect((await leave(cora)).body).toEqual({ ok: true });
    expect((await me(cora)).team).toBeNull();
    expect((await getTeam(team, cora)).status).toBe(403);
    expect((await leave(cora)).status).toBe(403);

    // The last member leaving deletes the team.
    expect((await leave(ana!)).body).toEqual({ ok: true });
    expect((await me(ana!)).team).toBeNull();
    expect((await join(team, cora)).status).toBe(404);
  });
});

describe('leaders', () => {
  it("changes the team's name, level and next competition", async () => {
    const { team, members: [ana] } = await teamWith('Cora', 'Ana');
    const patch = (user: TestUser, body: unknown) => call(teamPath(team), { method: 'PATCH', token: user.token, body });
    expect((await patch(ana!, { name: 'Mine now' })).status).toBe(403);

    const event = { name: 'Regional', date: '2027-02-20', lineupId: 'l1', finals: false };
    const res = await patch(team.captain, { name: 'Ridgeview Varsity', level: 'MS', nextEvent: event });
    expect(res.status).toBe(200);
    expect(res.body.team).toEqual({ id: team.teamId, name: 'Ridgeview Varsity', level: 'MS', nextEvent: { name: 'Regional', date: '2027-02-20', lineupId: 'l1' }, createdAt: expect.any(Number) });
    expect((await me(ana!)).team).toMatchObject({ name: 'Ridgeview Varsity', level: 'MS', role: 'member' });

    for (const nextEvent of [{ name: 'X', date: '2027-02-30' }, { name: '', date: '2027-02-20' }, { name: 'X', date: 'soon' }, { name: 'X', date: '2027-02-20', finals: 'yes' }]) {
      expect((await patch(team.captain, { name: 'Unchanged', nextEvent })).status).toBe(400);
    }
    expect((await patch(team.captain, { nextEvent: null })).body.team.nextEvent).toBeUndefined();
    expect((await getTeam(team, ana!)).body.team.name).toBe('Ridgeview Varsity');
  });

  it("changes roles and squads; members change their own subjects, which their account keeps", async () => {
    const { team, members: [ana, ben] } = await teamWith('Cora', 'Ana', 'Ben');
    const patch = (user: TestUser, target: TestUser, body: unknown) => call(`${teamPath(team)}/members/${target.id}`, { method: 'PATCH', token: user.token, body });

    const promoted = await patch(team.captain, ana!, { role: 'captain', squad: 'A' });
    expect(promoted.body.member).toMatchObject({ userId: ana!.id, name: 'Ana', role: 'captain', squad: 'A' });
    expect((await patch(ben!, ana!, { role: 'member' })).status).toBe(403);
    expect((await patch(ben!, ben!, { role: 'captain' })).status).toBe(403);
    expect((await patch(ben!, ana!, { primarySubject: 'physics' })).status).toBe(403);
    expect((await patch(team.captain, ana!, {})).status).toBe(400);
    expect((await patch(team.captain, ana!, { role: 'boss' })).status).toBe(400);
    expect((await call(`${teamPath(team)}/members/abcdefghijklmnop`, { method: 'PATCH', token: team.captain.token, body: { squad: 'B' } })).status).toBe(404);

    // A member's own subjects: the account changes, and the team's copy with it.
    const own = await patch(ben!, ben!, { primarySubject: 'physics', gradYear: 2029 });
    expect(own.body.member).toMatchObject({ primarySubject: 'physics', gradYear: 2029 });
    expect((await me(ben!)).user).toMatchObject({ primarySubject: 'physics', gradYear: 2029 });
    // A leader may set anyone's.
    await patch(team.captain, ben!, { secondarySubject: 'math', primarySubject: null });
    expect((await me(ben!)).user.primarySubject).toBeUndefined();
    expect((await me(ben!)).user.secondarySubject).toBe('math');

    // Demoting: fine while another leader remains, never the last one.
    expect((await patch(ana!, team.captain, { role: 'member', squad: null })).body.member).toEqual(expect.objectContaining({ role: 'member' }));
    const last = await patch(ana!, ana!, { role: 'member' });
    expect(last.status).toBe(409);
    expect(last.body.error).toBe(LAST_LEADER);
  });

  it("copies a member's new name and subjects from their account to the team", async () => {
    const { team, members: [ana] } = await teamWith('Cora', 'Ana');
    await call('/api/me', { method: 'PATCH', token: ana!.token, body: { name: 'Ana Lopez', primarySubject: 'energy' } });
    const member = (await getTeam(team, team.captain)).body.members.find((m: Json) => m.userId === ana!.id);
    expect(member).toMatchObject({ name: 'Ana Lopez', primarySubject: 'energy' });
  });

  it('lets a member remove themselves, which is leaving', async () => {
    const { team, members: [ana] } = await teamWith('Cora', 'Ana');
    expect((await call(`${teamPath(team)}/members/${ana!.id}`, { method: 'DELETE', token: ana!.token })).body).toEqual({ ok: true });
    expect((await me(ana!)).team).toBeNull();
    const last = await call(`${teamPath(team)}/members/${team.captain.id}`, { method: 'DELETE', token: team.captain.token });
    expect(last.body).toEqual({ ok: true });
    expect((await me(team.captain)).team).toBeNull();
    expect((await join(team, ana!)).status).toBe(404);
  });

  it('removes members, replaces the join code, and deletes the team', async () => {
    const { team, members: [ana, ben] } = await teamWith('Cora', 'Ana', 'Ben');
    const remove = (user: TestUser, target: TestUser) => call(`${teamPath(team)}/members/${target.id}`, { method: 'DELETE', token: user.token });
    expect((await remove(ana!, ben!)).status).toBe(403);
    expect((await remove(team.captain, ben!)).body).toEqual({ ok: true });
    expect((await me(ben!)).team).toBeNull();
    expect((await getTeam(team, ben!)).status).toBe(403);
    expect((await remove(team.captain, ben!)).status).toBe(404);

    expect((await call(`${teamPath(team)}/join-code`, { method: 'POST', token: ana!.token })).status).toBe(403);
    const rotated = await call(`${teamPath(team)}/join-code`, { method: 'POST', token: team.captain.token });
    expect(rotated.body.joinCode).toMatch(JOIN_CODE_PATTERN);
    expect(rotated.body.joinCode).not.toBe(team.joinCode);
    expect((await join(team, ben!)).status).toBe(403);
    expect((await join(team, ben!, { secret: rotated.body.joinCode.split('.')[1] })).status).toBe(200);
    expect((await getTeam(team, team.captain)).body.joinCode).toBe(rotated.body.joinCode);

    expect((await call(teamPath(team), { method: 'DELETE', token: ana!.token })).status).toBe(403);
    expect((await call(teamPath(team), { method: 'DELETE', token: team.captain.token })).body).toEqual({ ok: true });
    for (const user of [team.captain, ana!, ben!]) expect((await me(user)).team).toBeNull();
    expect((await getTeam(team, team.captain)).status).toBe(404);
  });
});

describe('team records', () => {
  it('lets members write shared collections and leaders the leader-only ones', async () => {
    const { team, members: [ana] } = await teamWith('Cora', 'Ana');
    const path = `${teamPath(team)}/records`;
    const result = await putRecords(path, ana!.token, [
      { c: 'lineups', id: 'l1', body: { players: [] } },
      { c: 'assignments', id: 'as1', body: {} },
      { c: 'packets', id: 'p1', body: { title: 'Ours' } },
      { c: 'attempts', id: 'a1', body: {} },
    ]);
    expect(result).toEqual({
      cursor: 1,
      rejected: [
        { c: 'lineups', id: 'l1', reason: 'Only coaches and captains can change this.' },
        { c: 'assignments', id: 'as1', reason: 'Only coaches and captains can change this.' },
        { c: 'attempts', id: 'a1', reason: "This kind of data isn't kept for teams." },
      ],
    });
    expect((await putRecords(path, team.captain.token, [{ c: 'lineups', id: 'l1', body: { players: [ana!.id] } }])).rejected).toEqual([]);
    const page = await getRecords(path, ana!.token);
    expect(page.records).toEqual([
      { c: 'packets', id: 'p1', body: { title: 'Ours' }, rev: 1, by: ana!.id },
      { c: 'lineups', id: 'l1', body: { players: [ana!.id] }, rev: 2, by: team.captain.id },
    ]);
    const outsider = await signUp('Out');
    expect((await call(path, { token: outsider.token })).status).toBe(403);
  });

  it("shows teammates' visible collections, never their review cards or plans", async () => {
    const { team, members: [ana] } = await teamWith('Cora', 'Ana');
    await putRecords('/api/me/records', ana!.token, [
      { c: 'attempts', id: 'a1', body: { playerId: ana!.id, correct: true } },
      { c: 'cards', id: 'q1', body: { playerId: ana!.id, log: [] } },
      { c: 'plans', id: 'today', body: { playerId: ana!.id, items: [] } },
      { c: 'seen', id: 'ledger', body: { q1: 5 } },
      { c: 'completions', id: 'as1', body: { playerId: ana!.id } },
    ]);
    const path = `${teamPath(team)}/members/${ana!.id}/records`;
    const page = await getRecords(path, team.captain.token);
    expect(page.records.map((r: Json) => [r.c, r.id, r.rev])).toEqual([
      ['attempts', 'a1', 1],
      ['seen', 'ledger', 4],
      ['completions', 'as1', 5],
    ]);
    expect(page.cursor).toBe(5);
    expect((await getRecords(path, team.captain.token, 4)).records.map((r: Json) => r.c)).toEqual(['completions']);
    const outsider = await signUp('Out');
    expect((await call(path, { token: outsider.token })).status).toBe(403);
    expect((await call(`${teamPath(team)}/members/${outsider.id}/records`, { token: team.captain.token })).status).toBe(404);
  });

  it("turns a finished game into each member's answers", async () => {
    const { team, members: [ana] } = await teamWith('Cora', 'Ana');
    const cora = team.captain;
    const outsider = await signUp('Out');
    for (const user of [cora, ana!]) await call('/api/me', { method: 'PATCH', token: user.token, body: { primarySubject: 'biology' } });

    const game = {
      id: 'g1',
      createdAt: '2026-11-08T10:00:00.000Z',
      updatedAt: '2026-11-08T10:30:00.000Z',
      presetId: 'doe-regional-2027',
      packet: { setId: 'doe-hs-17', setTitle: 'DOE Set 17', roundId: 'doe-hs-17-r01', roundLabel: 'Round 1' },
      pairs: [
        { tossupId: 't1', bonusId: 'b1', subject: 'biology' },
        { tossupId: 't2', bonusId: 'b2', subject: 'biology' },
      ],
      teams: [
        { name: 'Red', playerIds: [cora.id, outsider.id] },
        { name: 'Blue', playerIds: [ana!.id] },
      ],
      events: [
        { type: 'start', t: 1000 },
        { type: 'tossup_read', t: 5000 },
        { type: 'buzz', t: 6000, team: 1, playerId: ana!.id },
        { type: 'tossup_judged', t: 7000, result: 'correct' },
        { type: 'bonus_read', t: 9000 },
        { type: 'bonus_judged', t: 15000, result: 'correct' },
        { type: 'next', t: 20000 },
        { type: 'tossup_read', t: 25000 },
        { type: 'buzz', t: 26000, team: 0, playerId: outsider.id },
        { type: 'tossup_judged', t: 27000, result: 'incorrect' },
        { type: 'tossup_dead', t: 33000 },
        { type: 'end_game', t: 35000 },
      ],
      status: 'in_progress',
      finalScores: [0, 14],
    };
    const path = `${teamPath(team)}/records`;
    const answers = async (user: TestUser) => (await allMyRecords(user.token)).filter((r) => r.c === 'answers');

    // Not until it is finished.
    await putRecords(path, cora.token, [{ c: 'games', id: 'g1', body: game }]);
    expect(await answers(ana!)).toEqual([]);

    await putRecords(path, cora.token, [{ c: 'games', id: 'g1', body: { ...game, status: 'finished' } }]);
    const anas = await answers(ana!);
    expect(anas.map((r) => [r.body.questionId, r.body.kind, r.body.correct, r.body.reason ?? null])).toEqual([
      ['t1', 'tossup', true, null],
      ['b1', 'bonus', true, null],
      ['t2', 'tossup', false, 'dead'],
    ]);
    for (const r of anas) {
      expect(r.id).toBe(r.body.key);
      expect(r.id).toMatch(/^game:g1:/);
      expect(r.body).toMatchObject({ playerId: ana!.id, via: 'game', subject: 'biology' });
    }
    expect((await answers(cora)).map((r) => [r.body.questionId, r.body.reason])).toEqual([['t2', 'dead']]);
    // Only members get answers: a game cannot write into someone else's account.
    expect(await answers(outsider)).toEqual([]);

    // Saving the game again gives the same answers, without new revisions.
    const before = await getRecords('/api/me/records', ana!.token);
    await putRecords(path, cora.token, [{ c: 'games', id: 'g1', body: { ...game, status: 'finished', updatedAt: '2026-11-08T11:00:00.000Z' } }]);
    expect((await getRecords('/api/me/records', ana!.token)).cursor).toBe(before.cursor);

    // An online match's record is left alone: its room already wrote the answers.
    await putRecords(path, cora.token, [{ c: 'games', id: 'g2', body: { ...game, id: 'g2', status: 'finished', online: true } }]);
    expect((await answers(ana!)).some((r) => r.id.startsWith('game:g2:'))).toBe(false);
    // A game the rules cannot replay simply gives no answers.
    expect((await putRecords(path, cora.token, [{ c: 'games', id: 'g3', body: { id: 'g3', status: 'finished', teams: 'none' } }])).rejected).toEqual([]);
  });

  it('retries answers that could not be delivered, from its alarm', async () => {
    const { team, members: [ana] } = await teamWith('Cora', 'Ana');
    const outcome = { key: 'game:g9:0:t:5', playerId: ana!.id, questionId: 't9', subject: 'physics', kind: 'tossup', correct: true, interrupt: false, latencyMs: 800, t: 5, via: 'game' };
    // A delivery that failed once and is due again.
    await runInDurableObject(teamStub(team.teamId), async (_i, state) => {
      state.storage.sql.exec("INSERT INTO outbox (kind, target, payload, tries, next_at) VALUES ('answers', ?, ?, 1, ?)", ana!.id, JSON.stringify([outcome]), Date.now() - 1);
      await state.storage.setAlarm(Date.now() + 10);
    });
    const delivered = await eventually(async () => {
      const found = (await allMyRecords(ana!.token)).filter((r) => r.c === 'answers');
      return found.length > 0 ? found : null;
    });
    expect(delivered.map((r) => r.body)).toEqual([outcome]);
    const left = await runInDurableObject(teamStub(team.teamId), (_i, state) => state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM outbox').one().n);
    expect(left).toBe(0);
  });

  it('waits longer after each failed delivery, and drops one that keeps failing', async () => {
    const { team } = await teamWith('Cora');
    await runInDurableObject(teamStub(team.teamId), async (_i, state) => {
      const box = new Outbox(state.storage.sql);
      const start = Date.now();
      box.add('answers', 'someone', [{ key: 'k' }], start);
      const sent: string[] = [];
      const failing = async () => {
        throw new Error('unreachable');
      };
      await box.flush(failing, start, true);
      const row = () => state.storage.sql.exec<{ tries: number; next_at: number }>('SELECT tries, next_at FROM outbox').toArray()[0];
      expect(row()!.tries).toBe(1);
      expect(row()!.next_at).toBeGreaterThanOrEqual(start + 2 * 60_000);
      // Not due yet: nothing is sent.
      await box.flush(async (d) => void sent.push(d.payload), start + 1000);
      expect(sent).toEqual([]);
      for (let i = 0; i < 5; i++) await box.flush(failing, Date.now() + 365 * 24 * 60 * 60 * 1000);
      expect(row()).toBeUndefined();
      expect(box.nextAt()).toBeNull();
    });
  });
});
