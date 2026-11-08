/**
 * Online matches end to end in the Workers runtime: a match room the server runs itself (no reader), players on
 * their own WebSockets, real timers, and the finished game reaching every device through sync.
 */
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { addMember, call, connect, createTeam, sync, type Json, type RoomClient, type TestTeam } from './helpers';

const teamStub = (teamId: string) => env.TEAM.get(env.TEAM.idFromName(teamId));

const question = (id: string, kind: 'tossup' | 'bonus', stem: string, answer: string, accept: string[] = []) => ({
  id,
  kind,
  subject: 'biology',
  format: 'short_answer',
  stem,
  answer,
  accept,
  reject: [],
  answerRaw: answer,
});

const PAIRS = [
  { tossup: question('t1', 'tossup', 'What organelle makes ATP?', 'MITOCHONDRION'), bonus: question('b1', 'bonus', 'Name the gas plants take in.', 'CARBON DIOXIDE', ['CO2']) },
  { tossup: question('t2', 'tossup', 'What carries amino acids?', 'TRANSFER RNA', ['TRNA']), bonus: question('b2', 'bonus', 'What makes proteins?', 'RIBOSOME') },
];

const PACKET = { setId: 'doe-hs-17', setTitle: 'DOE Set 17', roundId: 'doe-hs-17-r01', roundLabel: 'Round 1' };

async function matchRoom(team: TestTeam, token: string, match: Record<string, unknown>): Promise<string> {
  const res = await call(`/api/teams/${team.teamId}/rooms`, {
    token,
    body: { name: 'Lunch match', match: { wpm: 600, packet: PACKET, pairs: PAIRS, ...match } },
  });
  expect(res.status).toBe(201);
  return res.body.roomId;
}

const memberIn = (message: Json, memberId: string) => message.members.find((m: Json) => m.memberId === memberId);

async function takeSide(client: RoomClient, side: 'A' | 'B' | null): Promise<void> {
  const me = client.welcome.you.memberId;
  client.send({ type: 'side', side });
  await client.next('members', (m) => memberIn(m, me)?.side === side);
}

/** The next published view matching `match`. */
const view = (client: RoomClient, match: (v: Json) => boolean, timeoutMs = 6000) => client.next('state', (m) => match(m.state), timeoutMs).then((m) => m.state);

describe('online matches', () => {
  it('runs a team match with no reader: buzzes, typed answers, the captain’s bonus, and a game record', async () => {
    const team = await createTeam();
    const ana = await addMember(team, 'Ana', 'p-ana');
    const roomId = await matchRoom(team, team.token, { format: 'teams', presetId: 'doe-regional-2027', teamNames: ['Red', 'Blue'] });

    const listed = await call(`/api/teams/${team.teamId}/rooms`, { token: ana.token });
    expect(listed.body.rooms[0]).toMatchObject({ roomId, kind: 'match', match: { format: 'teams', status: 'lobby' } });

    const host = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    expect(host.welcome.room.kind).toBe('match');
    expect(host.welcome.room.state).toMatchObject({ label: 'Waiting for the host to start the match', teams: ['Red', 'Blue'], match: { format: 'teams', status: 'lobby' } });
    // In a match room the host plays too.
    await takeSide(host, 'A');
    await takeSide(a, 'B');

    a.send({ type: 'start' });
    expect((await a.next('error')).message).toBe('Only the host can do that.');
    host.send({ type: 'publish', state: {} });
    expect((await host.next('error')).message).toBe('This room runs itself: there is no reader.');

    host.send({ type: 'start' });
    const first = await view(a, (v) => v.label === 'Toss-up 1' && !!v.text);
    expect(first.text).toBe('What organelle makes ATP?');
    expect(first.answer).toBeUndefined();
    await a.next('buzz', (m) => m.buzz.open && m.buzz.sides.B);
    // Sides are fixed once the match starts.
    a.send({ type: 'side', side: 'A' });
    expect((await a.next('error')).message).toBe('Sides are set once the match starts.');

    // Buzz once the reading is over (the answer window shows), so it is not an interrupt.
    await view(a, (v) => v.phase === 'tossup_open' && !!v.window);
    a.send({ type: 'buzz' });
    await view(a, (v) => v.match.answering?.memberId === ana.member.id);
    a.send({ type: 'answer', text: 'mitochondrion' });
    const bonus = await view(host, (v) => v.label === 'Bonus 1');
    expect(bonus.scores).toEqual([0, 4]);
    expect(bonus.bonusTeam).toBe(1);

    // Ana is Blue's only player, so its captain: she answers once the bonus has been read.
    await view(a, (v) => v.phase === 'bonus_open');
    a.send({ type: 'answer', text: 'co2' });
    const over = await view(host, (v) => v.phase === 'question_over');
    expect(over.scores).toEqual([0, 14]);
    expect(over.answer).toBe('CARBON DIOXIDE');

    host.send({ type: 'end' });
    const done = await a.next('match_over');
    expect(done.format).toBe('teams');
    expect(done.game).toMatchObject({
      id: `g-online-${roomId}`,
      presetId: 'doe-regional-2027',
      finalScores: [0, 14],
      online: true,
      teams: [
        { name: 'Red', playerIds: ['p-cora'] },
        { name: 'Blue', playerIds: ['p-ana'] },
      ],
    });
    expect(done.heard).toEqual(['t1', 'b1']);
    expect((await view(a, (v) => v.label === 'Final')).match.gameId).toBe(`g-online-${roomId}`);

    // Every device gets the finished game with its next sync, like a Reader console game.
    const pulled = await sync(team, team.token, 0);
    const record = pulled.changes.find((r) => r.c === 'games');
    expect(record).toMatchObject({ id: `g-online-${roomId}`, by: team.member.id });
    expect((record!.body as Json).events.map((e: Json) => e.type)).toEqual(['start', 'tossup_read', 'buzz', 'tossup_judged', 'bonus_read', 'bonus_judged', 'end_game']);
    for (const c of [host, a]) c.close();
  });

  it('sends close calls to the other side, and a rejected one ends the toss-up', async () => {
    const team = await createTeam();
    const ana = await addMember(team, 'Ana', 'p-ana');
    const roomId = await matchRoom(team, team.token, { format: 'teams', presetId: 'doe-regional-2027' });
    const host = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    await takeSide(host, 'A');
    await takeSide(a, 'B');
    host.send({ type: 'start' });
    await view(host, (v) => v.phase === 'tossup_open' && !!v.window);
    host.send({ type: 'buzz' });
    await view(host, (v) => v.match.answering?.memberId === team.member.id);
    host.send({ type: 'answer', text: 'mitocondrion' });
    const review = await view(a, (v) => !!v.match.review);
    expect(review.match.review).toMatchObject({ memberId: team.member.id, response: 'mitocondrion', deciders: 'B' });
    host.send({ type: 'ruling', accept: true });
    expect((await host.next('error')).message).toBe('The other side decides this close call.');
    a.send({ type: 'ruling', accept: false });
    const after = await view(host, (v) => v.phase === 'question_over');
    expect(after.scores).toEqual([0, 0]);
    expect(after.status).toContain('Nobody else may answer this one.');
    for (const c of [host, a]) c.close();
  });

  it('runs a free-for-all: one buzz each, and every answer goes out for the player’s own device to record', async () => {
    const team = await createTeam();
    const ana = await addMember(team, 'Ana', 'p-ana');
    const ben = await addMember(team, 'Ben', 'p-ben');
    const roomId = await matchRoom(team, team.token, { format: 'ffa', tossupCount: 1 });
    const host = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    const watcher = await connect(team, roomId, ben.token);
    // Joining the game is taking a side; Ben only watches.
    await takeSide(host, 'A');
    await takeSide(a, 'A');
    host.send({ type: 'start' });
    // Wait for the reading to finish (the answer window shows), then Ana answers wrong.
    await view(a, (v) => !!v.window);
    a.send({ type: 'buzz' });
    await view(a, (v) => v.match.answering?.memberId === ana.member.id);
    a.send({ type: 'answer', text: 'ribosome' });
    const wrong = await a.next('result');
    expect(wrong.result).toMatchObject({ memberId: ana.member.id, playerId: 'p-ana', questionId: 't1', correct: false, interrupt: false });
    // Ana may not buzz again; Cora still may.
    a.send({ type: 'buzz' });
    expect((await a.next('error')).message).toBe('You already buzzed.');
    host.send({ type: 'buzz' });
    await view(host, (v) => v.match.answering?.memberId === team.member.id);
    host.send({ type: 'answer', text: 'Mitochondrion' });
    expect((await watcher.next('result', (m) => m.result.memberId === team.member.id)).result.correct).toBe(true);
    const over = await view(watcher, (v) => v.answer === 'MITOCHONDRION');
    expect(over.match.standings.map((s: Json) => [s.name, s.score])).toEqual([
      ['Cora Captain', 4],
      ['Ana', 0],
    ]);
    // One toss-up was asked for: the game ends after the answer has been up a few seconds.
    const done = await a.next('match_over', () => true, 8000);
    expect(done).toMatchObject({ format: 'ffa', game: null, heard: ['t1'] });
    for (const c of [host, a, watcher]) c.close();
  });

  it('will not start with a player who has no roster player', async () => {
    const team = await createTeam();
    const ned = await addMember(team, 'Ned', null);
    const roomId = await matchRoom(team, team.token, { format: 'ffa' });
    const host = await connect(team, roomId, team.token);
    const n = await connect(team, roomId, ned.token);
    await takeSide(host, 'A');
    await takeSide(n, 'A');
    host.send({ type: 'start' });
    expect((await host.next('error')).message).toMatch(/^Ned isn't linked to a player on the team's roster yet/);
    for (const c of [host, n]) c.close();
  });

  it('keeps a match going when the object is evicted between steps', async () => {
    const team = await createTeam();
    const ana = await addMember(team, 'Ana', 'p-ana');
    const roomId = await matchRoom(team, team.token, { format: 'ffa' });
    const host = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    await takeSide(host, 'A');
    await takeSide(a, 'A');
    host.send({ type: 'start' });
    await view(a, (v) => v.label === 'Toss-up 1 of 2' && !v.text);
    // The instance dies during the lead-in: its in-memory timer is lost (eviction in tests waits for timers).
    await runInDurableObject(teamStub(team.teamId), (instance) => {
      const timers = (instance as unknown as { rooms: { matchTimers: Map<string, ReturnType<typeof setTimeout>> } }).rooms.matchTimers;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    });
    await evictDurableObject(teamStub(team.teamId));
    // The backup alarm wakes a new instance, which starts the reading from SQLite.
    const reading = await view(a, (v) => !!v.text, 8000);
    expect(reading.text).toBe('What organelle makes ATP?');
    for (const c of [host, a]) c.close();
  });
});
