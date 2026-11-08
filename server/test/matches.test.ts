/**
 * Online matches end to end in the Workers runtime: a match room the server runs itself (no reader), players on
 * their own WebSockets, real timers, and the results reaching each player's account (and the team's games).
 */
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { allMyRecords, call, connect, createRoom, eventually, getRecords, makeTeam, signUp, teamWith, type Json, type RoomClient, type TestUser } from './helpers';

const roomStub = (roomId: string) => env.ROOM.get(env.ROOM.idFromName(roomId));

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

const matchRoom = (token: string, match: Record<string, unknown>) => createRoom(token, 'Lunch match', { wpm: 600, packet: PACKET, pairs: PAIRS, ...match });

const memberIn = (message: Json, memberId: string) => message.members.find((m: Json) => m.memberId === memberId);

async function takeSide(client: RoomClient, side: 'A' | 'B' | null): Promise<void> {
  const me = client.welcome.you.memberId;
  client.send({ type: 'side', side });
  await client.next('members', (m) => memberIn(m, me)?.side === side);
}

/** The next published view matching `match`. */
const view = (client: RoomClient, match: (v: Json) => boolean, timeoutMs = 6000) => client.next('state', (m) => match(m.state), timeoutMs).then((m) => m.state);

const answersOf = async (user: TestUser) => (await allMyRecords(user.token)).filter((r) => r.c === 'answers');

describe('online matches', () => {
  it('runs a team match with no reader, then writes the answers and the game', async () => {
    const { team, members: [ana] } = await teamWith('Cora Captain', 'Ana');
    const cora = team.captain;
    const roomId = await matchRoom(cora.token, { format: 'teams', presetId: 'doe-regional-2027', teamNames: ['Red', 'Blue'] });

    const listed = await call('/api/rooms', { token: ana!.token });
    expect(listed.body.rooms[0]).toMatchObject({ roomId, kind: 'match', match: { format: 'teams', status: 'lobby' } });

    const host = await connect(roomId, cora.token);
    const a = await connect(roomId, ana!.token);
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
    await view(a, (v) => v.match.answering?.memberId === ana!.id);
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
        { name: 'Red', playerIds: [cora.id] },
        { name: 'Blue', playerIds: [ana!.id] },
      ],
    });
    expect(done.heard).toEqual(['t1', 'b1']);
    expect((await view(a, (v) => v.label === 'Final')).match.gameId).toBe(`g-online-${roomId}`);

    // Each player's answers go to their account, as for a Reader console game, before the match is announced over.
    const anas = await answersOf(ana!);
    expect(anas.map((r) => [r.body.questionId, r.body.kind, r.body.correct, r.body.via])).toEqual([
      ['t1', 'tossup', true, 'game'],
      ['b1', 'bonus', true, 'game'],
    ]);
    for (const r of anas) expect(r.id).toMatch(new RegExp(`^game:g-online-${roomId}:`));
    // Everyone was on Cora's team, so the team keeps the game.
    const games = (await getRecords(`/api/teams/${team.teamId}/records`, ana!.token)).records;
    expect(games).toEqual([{ c: 'games', id: `g-online-${roomId}`, body: done.game, rev: 1, by: cora.id }]);
    expect((games[0].body.events as Json[]).map((e) => e.type)).toEqual(['start', 'tossup_read', 'buzz', 'tossup_judged', 'bonus_read', 'bonus_judged', 'end_game']);
    for (const c of [host, a]) c.close();
  });

  it('plays a team match with someone from another team: answers for all, no team game', async () => {
    const { team, members: [ana] } = await teamWith('Cora Captain', 'Ana');
    const visitor = await signUp('Vic');
    await makeTeam(visitor, { name: 'Lakeside' });
    const roomId = await matchRoom(team.captain.token, { format: 'teams', presetId: 'doe-regional-2027' });
    const host = await connect(roomId, team.captain.token);
    const a = await connect(roomId, ana!.token);
    const v = await connect(roomId, visitor.token);
    await takeSide(a, 'A');
    await takeSide(v, 'B');
    host.send({ type: 'start' });
    await view(v, (s) => s.phase === 'tossup_open' && !!s.window);
    v.send({ type: 'buzz' });
    await view(v, (s) => s.match.answering?.memberId === visitor.id);
    v.send({ type: 'answer', text: 'ribosome' });
    await view(host, (s) => typeof s.status === 'string' && s.status.includes('“ribosome”'));
    host.send({ type: 'end' });
    await v.next('match_over');

    const visitorAnswers = await eventually(async () => {
      const found = await answersOf(visitor);
      return found.length > 0 ? found : null;
    });
    expect(visitorAnswers.map((r) => [r.body.questionId, r.body.correct])).toEqual([['t1', false]]);
    // Give the deliveries a moment, then check the team got no game.
    await new Promise((r) => setTimeout(r, 300));
    expect((await getRecords(`/api/teams/${team.teamId}/records`, ana!.token)).records).toEqual([]);
    for (const c of [host, a, v]) c.close();
  });

  it('sends close calls to the other side, and a rejected one ends the toss-up', async () => {
    const cora = await signUp('Cora');
    const ana = await signUp('Ana');
    const roomId = await matchRoom(cora.token, { format: 'teams', presetId: 'doe-regional-2027' });
    const host = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    await takeSide(host, 'A');
    await takeSide(a, 'B');
    host.send({ type: 'start' });
    await view(host, (v) => v.phase === 'tossup_open' && !!v.window);
    host.send({ type: 'buzz' });
    await view(host, (v) => v.match.answering?.memberId === cora.id);
    host.send({ type: 'answer', text: 'mitocondrion' });
    const review = await view(a, (v) => !!v.match.review);
    expect(review.match.review).toMatchObject({ memberId: cora.id, response: 'mitocondrion', deciders: 'B' });
    host.send({ type: 'ruling', accept: true });
    expect((await host.next('error')).message).toBe('The other side decides this close call.');
    a.send({ type: 'ruling', accept: false });
    const after = await view(host, (v) => v.phase === 'question_over');
    expect(after.scores).toEqual([0, 0]);
    expect(after.status).toContain('Nobody else may answer this one.');
    for (const c of [host, a]) c.close();
  });

  it('runs a free-for-all: one buzz each, and every judged answer goes to the player’s account', async () => {
    const cora = await signUp('Cora Captain');
    const ana = await signUp('Ana');
    const ben = await signUp('Ben');
    const roomId = await matchRoom(cora.token, { format: 'ffa', tossupCount: 1 });
    const host = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    const watcher = await connect(roomId, ben.token);
    // Joining the game is taking a side; Ben only watches.
    await takeSide(host, 'A');
    await takeSide(a, 'A');
    host.send({ type: 'start' });
    // Wait for the reading to finish (the answer window shows), then Ana answers wrong.
    await view(a, (v) => !!v.window);
    a.send({ type: 'buzz' });
    await view(a, (v) => v.match.answering?.memberId === ana.id);
    a.send({ type: 'answer', text: 'ribosome' });
    const wrong = await a.next('result');
    expect(wrong.result).toMatchObject({ memberId: ana.id, playerId: ana.id, questionId: 't1', correct: false, interrupt: false });
    // Ana may not buzz again; Cora still may.
    a.send({ type: 'buzz' });
    expect((await a.next('error')).message).toBe('You already buzzed.');
    host.send({ type: 'buzz' });
    await view(host, (v) => v.match.answering?.memberId === cora.id);
    host.send({ type: 'answer', text: 'Mitochondrion' });
    expect((await watcher.next('result', (m) => m.result.memberId === cora.id)).result.correct).toBe(true);
    const over = await view(watcher, (v) => v.answer === 'MITOCHONDRION');
    expect(over.match.standings.map((s: Json) => [s.name, s.score])).toEqual([
      ['Cora Captain', 4],
      ['Ana', 0],
    ]);
    // One toss-up was asked for: the game ends after the answer has been up a few seconds.
    const done = await a.next('match_over', () => true, 8000);
    expect(done).toMatchObject({ format: 'ffa', game: null, heard: ['t1'] });

    const anas = await answersOf(ana);
    expect(anas).toEqual([
      {
        c: 'answers',
        id: `match:${roomId}:t1`,
        rev: expect.any(Number),
        body: { key: `match:${roomId}:t1`, playerId: ana.id, questionId: 't1', subject: 'biology', kind: 'tossup', correct: false, interrupt: false, latencyMs: expect.any(Number), t: expect.any(Number), via: 'game' },
      },
    ]);
    const coras = await answersOf(cora);
    expect(coras.map((r) => [r.id, r.body.correct])).toEqual([[`match:${roomId}:t1`, true]]);
    expect(await answersOf(ben)).toEqual([]);
    for (const c of [host, a, watcher]) c.close();
  });

  it('keeps a match going when the object is evicted between steps', async () => {
    const cora = await signUp('Cora');
    const ana = await signUp('Ana');
    const roomId = await matchRoom(cora.token, { format: 'ffa' });
    const host = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    await takeSide(host, 'A');
    await takeSide(a, 'A');
    host.send({ type: 'start' });
    await view(a, (v) => v.label === 'Toss-up 1 of 2' && !v.text);
    // The instance dies during the lead-in: its in-memory timer is lost (eviction in tests waits for timers).
    await runInDurableObject(roomStub(roomId), (instance) => {
      const room = instance as unknown as { matchTimer: ReturnType<typeof setTimeout> | null };
      if (room.matchTimer !== null) clearTimeout(room.matchTimer);
      room.matchTimer = null;
    });
    await evictDurableObject(roomStub(roomId));
    // The backup alarm wakes a new instance, which starts the reading from SQLite.
    const reading = await view(a, (v) => !!v.text, 8000);
    expect(reading.text).toBe('What organelle makes ATP?');
    for (const c of [host, a]) c.close();
  });
});
