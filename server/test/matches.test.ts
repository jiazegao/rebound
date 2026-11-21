/**
 * Online matches end to end in the Workers runtime: a match room the server runs itself (no reader), players on
 * their own WebSockets, real timers, and the results reaching each player's account (and the team's games).
 */
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { audioKey, RECORDED_VOICE, spokenFor } from '../../src/core/speech';
import { allMyRecords, call, closedOnArrival, connect, createRoom, eventually, getRecords, makeTeam, signUp, teamWith, type Json, type RoomClient, type TestUser } from './helpers';

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

  it('reads aloud: the list and the view say so, and the room shows who reads the text instead', async () => {
    const { team, members: [ana] } = await teamWith('Cora Captain', 'Ana');
    const cora = team.captain;
    const roomId = await matchRoom(cora.token, { format: 'ffa', mode: 'speech', wpm: 200 });
    const listed = await call('/api/rooms', { token: ana!.token });
    expect(listed.body.rooms[0]).toMatchObject({ roomId, match: { format: 'ffa', mode: 'speech', status: 'lobby' } });

    const host = await connect(roomId, cora.token);
    const a = await connect(roomId, ana!.token);
    expect(host.welcome.room.state.match.mode).toBe('speech');
    await takeSide(a, 'A');
    // Ana's device has no voice: everyone sees that she reads the text.
    a.send({ type: 'voice', ok: false });
    const said = await host.next('members', (m) => memberIn(m, ana!.id)?.readsText === true);
    expect(memberIn(said, cora.id).readsText).toBeUndefined();
    // A second device of hers that can read aloud is enough to listen on.
    const a2 = await connect(roomId, ana!.token);
    a2.send({ type: 'voice', ok: true });
    await host.next('members', (m) => memberIn(m, ana!.id) && memberIn(m, ana!.id).readsText === undefined);
    a2.close();
    await host.next('members', (m) => memberIn(m, ana!.id)?.readsText === true);
    a.send({ type: 'voice', ok: 'maybe' });
    expect((await a.next('error')).message).toBe('Say whether this device can read aloud (ok: true or false).');
  });

  it('lets the host cancel a match before it starts: everyone in it is told, and it leaves the list and its link', async () => {
    const { team, members: [ana] } = await teamWith('Cora Captain', 'Ana');
    const cora = team.captain;
    const roomId = await matchRoom(cora.token, { format: 'teams', presetId: 'doe-regional-2027' });
    const host = await connect(roomId, cora.token);
    const a = await connect(roomId, ana!.token);
    await takeSide(a, 'B');
    expect((await call('/api/rooms', { token: ana!.token })).body.rooms.map((r: Json) => r.roomId)).toEqual([roomId]);

    const refused = await call(`/api/rooms/${roomId}`, { method: 'DELETE', token: ana!.token });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('Only the host can cancel this match.');
    expect(a.closed).toBeNull();

    expect((await call(`/api/rooms/${roomId}`, { method: 'DELETE', token: cora.token })).body).toEqual({ ok: true });
    await a.waitClosed();
    expect(a.closed).toEqual({ code: 4005, reason: 'The host cancelled this match.' });
    await host.waitClosed();
    expect(host.closed!.code).toBe(4005);
    expect((await call('/api/rooms', { token: ana!.token })).body.rooms).toEqual([]);
    const tables = await runInDurableObject(roomStub(roomId), (_i, state) => state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table'").toArray());
    expect(tables.filter((t) => !String(t.name).startsWith('_cf'))).toEqual([]);

    // Its link now says it has closed.
    expect(await closedOnArrival(roomId, ana!.token)).toEqual({ code: 4004, reason: 'This room has closed. Ask the host for a new link.' });
    // Cancelling it again changes nothing.
    expect((await call(`/api/rooms/${roomId}`, { method: 'DELETE', token: cora.token })).body).toEqual({ ok: true });
  });

  it('does not cancel a match that has started, or a reader room', async () => {
    const cora = await signUp('Cora');
    const roomId = await matchRoom(cora.token, { format: 'ffa' });
    const host = await connect(roomId, cora.token);
    await takeSide(host, 'A');
    host.send({ type: 'start' });
    await view(host, (v) => v.match.status === 'playing');
    const started = await call(`/api/rooms/${roomId}`, { method: 'DELETE', token: cora.token });
    expect(started.status).toBe(409);
    expect(started.body.error).toBe('This match has started: end it from its page instead (the scores so far stand).');
    expect(host.closed).toBeNull();

    const readerRoom = await createRoom(cora.token, 'Reader practice');
    const reader = await call(`/api/rooms/${readerRoom}`, { method: 'DELETE', token: cora.token });
    expect(reader.status).toBe(409);
    expect(reader.body.error).toBe('Only a match waiting to start can be cancelled.');
    expect((await call('/api/rooms/not-a-room!', { method: 'DELETE', token: cora.token })).status).toBe(404);
    expect((await call(`/api/rooms/${roomId}`, { method: 'DELETE' })).status).toBe(401);
    expect((await call(`/api/rooms/${roomId}`, { method: 'PATCH', token: cora.token, body: {} })).status).toBe(405);
    host.close();
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

  it('writes nothing for the pings every device sends, in the lobby or while a question is read', async () => {
    const changes = () => runInDurableObject(roomStub(roomId), (_i, state) => state.storage.sql.exec<{ n: number }>('SELECT total_changes() AS n').one().n);
    const cora = await signUp('Cora');
    const ana = await signUp('Ana');
    const roomId = await matchRoom(cora.token, { format: 'ffa', wpm: 60 });
    const host = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    await takeSide(host, 'A');
    await takeSide(a, 'A');
    await host.roundTrip();

    let before = await changes();
    for (let i = 0; i < 4; i++) await Promise.all([host.roundTrip(), a.roundTrip()]);
    expect(await changes()).toBe(before);

    host.send({ type: 'start' });
    await view(a, (v) => v.label === 'Toss-up 1 of 2' && !!v.text);
    await host.roundTrip();
    before = await changes();
    for (let i = 0; i < 4; i++) await Promise.all([host.roundTrip(), a.roundTrip()]);
    // Still the same reading: the pings ran no step of the match and stored nothing.
    expect(await changes()).toBe(before);
    for (const c of [host, a]) c.close();
  });
});

describe('Rebound’s recorded voice', () => {
  /** A question's recording as the host's device finds it in the site's index: named by the question's own words. */
  const recordingOf = async (q: { stem: string; choices?: Record<'W' | 'X' | 'Y' | 'Z', string> }, ms: number, v = 'a1b2c3d4') => ({
    key: await audioKey(RECORDED_VOICE, spokenFor(q)),
    ms,
    v,
  });
  const matchData = (roomId: string) =>
    runInDurableObject(roomStub(roomId), (_i, state) => JSON.parse(state.storage.sql.exec<{ data: string }>('SELECT data FROM match').one().data));

  it('plays each question’s recording from the match setup on every device, and times the reading by it', async () => {
    const { team, members: [ana] } = await teamWith('Cora Captain', 'Ana');
    const cora = team.captain;
    const audio = await recordingOf(PAIRS[0]!.tossup, 1750);
    // The second toss-up has no recording (a team's own packet, say): it is shown as text.
    const pairs = [{ tossup: { ...PAIRS[0]!.tossup, audio } }, { tossup: PAIRS[1]!.tossup }];
    const roomId = await matchRoom(cora.token, { format: 'ffa', mode: 'speech', wpm: 150, tossupCount: 2, pairs });
    const host = await connect(roomId, cora.token);
    // Nothing to wait for in the lobby: the room lists the recordings to fetch ahead at once.
    expect(host.welcome.room.state.match.voice).toEqual({ rate: 1, recorded: 1, total: 2, recordings: [{ key: audio.key, v: 'a1b2c3d4' }] });

    const a = await connect(roomId, ana!.token);
    await takeSide(a, 'A');
    host.send({ type: 'start' });
    const reading = await view(a, (v) => !!v.reading?.audio, 8000);
    expect(reading.reading.audio).toEqual({ key: audio.key, v: 'a1b2c3d4', rate: 1 });
    expect((await matchData(roomId)).q.reading.durationMs).toBe(1750);
    // The text beside it (for a device that cannot play it) runs at the recording's pace.
    expect(reading.reading.wpm).toBeGreaterThan(0);
    for (const c of [host, a]) c.close();
  });

  it('plays the recordings at the host’s reading speed against the voice’s own pace', async () => {
    const cora = await signUp('Cora');
    const pairs = [{ tossup: { ...PAIRS[0]!.tossup, audio: await recordingOf(PAIRS[0]!.tossup, 3000) } }];
    const roomId = await matchRoom(cora.token, { format: 'ffa', mode: 'speech', wpm: 225, tossupCount: 1, pairs });
    const host = await connect(roomId, cora.token);
    expect(host.welcome.room.state.match.voice.rate).toBe(1.5);
    await takeSide(host, 'A');
    host.send({ type: 'start' });
    await view(host, (v) => !!v.reading?.audio, 8000);
    expect((await matchData(roomId)).q.reading.durationMs).toBe(2000);
    host.close();
  });

  it('keeps only recordings of the question’s own words, and well-formed ones', async () => {
    const cora = await signUp('Cora');
    const other = await recordingOf({ stem: 'Some other question?' }, 1500);
    const pairs = [
      { tossup: { ...PAIRS[0]!.tossup, audio: other } },
      { tossup: { ...PAIRS[1]!.tossup, audio: { ...(await recordingOf(PAIRS[1]!.tossup, 1500)), ms: -5 } } },
    ];
    const roomId = await matchRoom(cora.token, { format: 'ffa', mode: 'speech', wpm: 150, tossupCount: 2, pairs });
    const host = await connect(roomId, cora.token);
    expect(host.welcome.room.state.match.voice).toEqual({ rate: 1, recorded: 0, total: 2, recordings: [] });
    const data = await matchData(roomId);
    expect(data.voice.items).toEqual({ t1: null, t2: null });
    expect(data.setup.pairs[1].tossup.audio).toBeUndefined();
    host.close();
  });

  it('is not part of a match shown as text', async () => {
    const cora = await signUp('Cora');
    const pairs = [{ tossup: { ...PAIRS[0]!.tossup, audio: await recordingOf(PAIRS[0]!.tossup, 1500) } }];
    const roomId = await matchRoom(cora.token, { format: 'ffa', mode: 'text', wpm: 300, tossupCount: 1, pairs });
    const host = await connect(roomId, cora.token);
    expect(host.welcome.room.state.match.voice).toBeUndefined();
    const data = await matchData(roomId);
    expect(data.voice).toBeUndefined();
    expect(data.setup.pairs[0].tossup.audio).toBeUndefined();
    host.close();
  });

  it('serves no recordings itself: they come from the voice Workers', async () => {
    const cora = await signUp('Cora');
    expect((await call('/api/speech', { token: cora.token })).status).toBe(404);
    expect((await call(`/api/speech/${'0'.repeat(40)}`, { token: cora.token })).status).toBe(404);
  });
});
