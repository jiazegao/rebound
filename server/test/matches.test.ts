/**
 * Online matches end to end in the Workers runtime: a match room the server runs itself (no reader), players on
 * their own WebSockets, real timers, and the results reaching each player's account (and the team's games).
 */
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { BASE, SITE } from './helpers';
import { setTtsTestOverrides, silentMp3 } from '../src/tts';
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

describe('Rebound’s recorded voice', () => {
  afterEach(() => setTtsTestOverrides({}));

  /** A stand-in for Google: each recording lasts 70 ms a character (a slow, easy-to-measure voice). */
  function fakeGoogle(options: { status?: number; hold?: Promise<void> } = {}) {
    const calls: string[] = [];
    const fetcher = (async (_url: string, init: RequestInit) => {
      const text = (JSON.parse(String(init.body)) as { input: { text: string } }).input.text;
      calls.push(text);
      await options.hold;
      if (options.status) return new Response('refused', { status: options.status });
      let binary = '';
      for (const byte of silentMp3(text.length * 70)) binary += String.fromCharCode(byte);
      return Response.json({ audioContent: btoa(binary) });
    }) as unknown as typeof fetch;
    return { fetcher, calls };
  }
  /** The match's voice as the client last heard of it (from its welcome, or a later view), once `ready` if asked. */
  const voiceOf = async (client: RoomClient, ready = true) => {
    const wanted = (v: Json) => v?.match?.voice && (!ready || v.match.voice.state === 'ready');
    const welcome = client.welcome.room.state;
    return (wanted(welcome) ? welcome : await view(client, wanted, 10_000)).match.voice;
  };
  /** A request to the Worker itself (as the helpers' `call` does), for a raw response. */
  const workerFetch = (path: string, init: RequestInit = {}) => exports.default.fetch(`${BASE}${path}`, init);

  it('records each question once in the lobby, serves the recordings to players, and times the reading by them', async () => {
    const google = fakeGoogle();
    setTtsTestOverrides({ apiKey: 'test-key', fetch: google.fetcher });
    const { team, members: [ana] } = await teamWith('Cora Captain', 'Ana');
    const cora = team.captain;
    const roomId = await matchRoom(cora.token, { format: 'ffa', mode: 'speech', wpm: 160, tossupCount: 2 });
    const host = await connect(roomId, cora.token);
    const voice = await voiceOf(host);
    // Two toss-ups, and the lobby's sample line.
    expect(voice).toMatchObject({ state: 'ready', done: 2, total: 2, rate: 1 });
    expect(voice.keys).toHaveLength(2);
    expect(google.calls).toHaveLength(3);
    expect(google.calls[0]).toBe('What organelle makes ATP?');

    // Signed-in players fetch the recordings (MP3), which browsers may keep.
    const res = await workerFetch(`/api/speech/${voice.keys[0]}`, { headers: { Authorization: `Bearer ${ana!.token}`, Origin: SITE } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(res.headers.get('Cache-Control')).toContain('immutable');
    expect(new Uint8Array(await res.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([0xff, 0xfb]));
    expect((await workerFetch(`/api/speech/${voice.keys[0]}`, { headers: { Origin: SITE } })).status).toBe(401);
    expect((await workerFetch(`/api/speech/${'0'.repeat(40)}`, { headers: { Authorization: `Bearer ${ana!.token}`, Origin: SITE } })).status).toBe(404);

    // The reading lasts as long as its recording (at the match's playback speed), and carries it.
    const a = await connect(roomId, ana!.token);
    await takeSide(a, 'A');
    host.send({ type: 'start' });
    const reading = await view(a, (v) => !!v.reading?.audio, 8000);
    expect(reading.reading.audio).toEqual({ key: voice.keys[0], rate: 1 });
    const ms = 'What organelle makes ATP?'.length * 70;
    const roomData = await runInDurableObject(roomStub(roomId), (_i, state) => JSON.parse(state.storage.sql.exec<{ data: string }>('SELECT data FROM match').one().data));
    expect(Math.abs(roomData.q.reading.durationMs - ms)).toBeLessThan(40);

    // A second match with the same questions finds them recorded: Google is not asked again.
    const again = await matchRoom(cora.token, { format: 'ffa', mode: 'speech', wpm: 200, tossupCount: 2 });
    const host2 = await connect(again, cora.token);
    expect((await voiceOf(host2)).rate).toBe(1.25);
    expect(google.calls).toHaveLength(3);
  });

  it('holds the start until the questions are recorded', async () => {
    let release = () => {};
    const google = fakeGoogle({ hold: new Promise<void>((r) => (release = r)) });
    setTtsTestOverrides({ apiKey: 'test-key', fetch: google.fetcher });
    const cora = await signUp('Cora');
    const roomId = await matchRoom(cora.token, { format: 'ffa', mode: 'speech', wpm: 160, tossupCount: 1, pairs: [{ tossup: { ...PAIRS[1]!.tossup, stem: 'A question only this test asks?' } }] });
    const host = await connect(roomId, cora.token);
    await takeSide(host, 'A');
    expect((await voiceOf(host, false)).state).toBe('preparing');
    host.send({ type: 'start' });
    expect((await host.next('error')).message).toBe('The voice is still recording the questions (0 of 1). It takes a moment the first time a round is read.');
    release();
    await voiceOf(host);
    host.send({ type: 'start' });
    await view(host, (v) => v.label.startsWith('Toss-up 1'));
  });

  it('keeps within the monthly allowance, and gives back what a failed recording did not use', async () => {
    const cora = await signUp('Cora');
    const month = new Date().toISOString().slice(0, 7);
    const registry = env.REGISTRY.get(env.REGISTRY.idFromName('global'));
    const used = async (): Promise<number> => Number(await registry.ttsCharsUsed(month));
    const start = await used();
    // Over the allowance: nothing is sent; devices read with their own voices.
    const thrifty = fakeGoogle();
    setTtsTestOverrides({ apiKey: 'test-key', fetch: thrifty.fetcher, monthlyChars: start + 5 });
    const roomId = await matchRoom(cora.token, { format: 'ffa', mode: 'speech', wpm: 160, tossupCount: 1, pairs: [{ tossup: { ...PAIRS[0]!.tossup, stem: 'Over the allowance?' } }] });
    const host = await connect(roomId, cora.token);
    expect(await voiceOf(host)).toMatchObject({ state: 'ready', done: 1, keys: [] });
    expect(thrifty.calls).toEqual([]);
    // Google fails: the characters are given back.
    const failing = fakeGoogle({ status: 500 });
    setTtsTestOverrides({ apiKey: 'test-key', fetch: failing.fetcher, monthlyChars: 1_000_000 });
    const room2 = await matchRoom(cora.token, { format: 'ffa', mode: 'speech', wpm: 160, tossupCount: 1, pairs: [{ tossup: { ...PAIRS[0]!.tossup, stem: 'Google is down?' } }] });
    const host2 = await connect(room2, cora.token);
    expect(await voiceOf(host2)).toMatchObject({ state: 'ready', keys: [] });
    expect(failing.calls.length).toBeGreaterThan(0);
    expect(await used()).toBe(start);
  });

  it('is not used without a key: a match read aloud then has each device read with its own voice', async () => {
    const cora = await signUp('Cora');
    const roomId = await matchRoom(cora.token, { format: 'ffa', mode: 'speech', wpm: 160, tossupCount: 1 });
    const host = await connect(roomId, cora.token);
    expect(host.welcome.room.state.match.voice).toBeUndefined();
  });
});
