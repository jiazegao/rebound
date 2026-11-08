import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  addMember,
  call,
  connect,
  createRoom,
  createTeam,
  type Json,
  RoomClient,
  SITE,
  sleep,
  type TestMember,
  type TestTeam,
  wsRequest,
} from './helpers';

const teamStub = (teamId: string) => env.TEAM.get(env.TEAM.idFromName(teamId));

interface Room {
  team: TestTeam;
  roomId: string;
  ana: TestMember;
  ben: TestMember;
  cal: TestMember;
}

/** A team whose captain (Cora) hosts a room, with three players. */
async function setup(): Promise<Room> {
  const team = await createTeam();
  const ana = await addMember(team, 'Ana', 'p-ana');
  const ben = await addMember(team, 'Ben', 'p-ben');
  const cal = await addMember(team, 'Cal', 'p-cal');
  const roomId = await createRoom(team, team.token);
  return { team, roomId, ana, ben, cal };
}

const memberIn = (message: Json, memberId: string) => message.members.find((m: Json) => m.memberId === memberId);

/** Picks a side and waits until the room's member list shows it. */
async function takeSide(client: RoomClient, side: 'A' | 'B' | null): Promise<void> {
  const me = client.welcome.you.memberId;
  client.send({ type: 'side', side });
  await client.next('members', (m) => memberIn(m, me)?.side === side);
}

async function waitUntil(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting');
    await sleep(10);
  }
}

/** Opens buzzers (as the reader) and waits until each client has heard. */
async function openBuzzers(reader: RoomClient, sides: { A: boolean; B: boolean }, ...players: RoomClient[]): Promise<void> {
  reader.send({ type: 'open', sides });
  for (const client of [reader, ...players]) await client.next('buzz', (m) => m.buzz.open && m.buzz.winner === null);
}

const winnerMessage = (client: RoomClient) => client.next('buzz', (m) => m.buzz.winner !== null);

describe('room list', () => {
  it('creates and lists rooms with their host and connected players', async () => {
    const { team, roomId, ana } = await setup();
    expect((await call(`/api/teams/${team.teamId}/rooms`, { token: ana.token, body: { name: '' } })).status).toBe(400);
    expect((await call(`/api/teams/${team.teamId}/rooms`)).status).toBe(401);

    const before = await call(`/api/teams/${team.teamId}/rooms`, { token: ana.token });
    expect(before.body.rooms).toEqual([
      { roomId, name: 'Tuesday scrimmage', host: { memberId: team.member.id, name: 'Cora Captain' }, players: 0, createdAt: expect.any(Number), kind: 'reader' },
    ]);
    const reader = await connect(team, roomId, team.token);
    const player = await connect(team, roomId, ana.token);
    const during = await call(`/api/teams/${team.teamId}/rooms`, { token: ana.token });
    expect(during.body.rooms[0].players).toBe(1);
    reader.close();
    player.close();
  });

  it('closes rooms after 6 hours with nobody connected', async () => {
    const { team, roomId } = await setup();
    await runInDurableObject(teamStub(team.teamId), (_i, state) => {
      state.storage.sql.exec('UPDATE rooms SET last_active = ?', Date.now() - 6 * 60 * 60 * 1000 - 1000);
    });
    expect((await call(`/api/teams/${team.teamId}/rooms`, { token: team.token })).body.rooms).toEqual([]);
    const res = await wsRequest(team, roomId, team.token);
    expect(res.status).toBe(404);
  });
});

describe('connecting', () => {
  it('checks the session and the room before accepting the WebSocket', async () => {
    const { team, roomId } = await setup();
    expect((await wsRequest(team, roomId, '')).status).toBe(401);
    expect((await wsRequest(team, roomId, 'x'.repeat(43))).status).toBe(401);
    expect((await wsRequest(team, 'nosuchroom12', team.token)).status).toBe(404);
    expect((await wsRequest(team, roomId, team.token, { Origin: 'https://evil.example' })).status).toBe(403);
    const plain = await call(`/api/teams/${team.teamId}/rooms/${roomId}/ws?token=${team.token}`);
    expect(plain.status).toBe(426);

    const fromSite = await wsRequest(team, roomId, team.token, { Origin: SITE });
    expect(fromSite.status).toBe(101);
    fromSite.webSocket!.accept();
    fromSite.webSocket!.close();
  });

  it('welcomes each connection and tells the room who joins and leaves', async () => {
    const { team, roomId, ana } = await setup();
    const reader = await connect(team, roomId, team.token);
    expect(reader.welcome).toEqual({
      type: 'welcome',
      you: { memberId: team.member.id, name: 'Cora Captain', playerId: 'p-cora' },
      room: {
        roomId,
        name: 'Tuesday scrimmage',
        kind: 'reader',
        hostId: team.member.id,
        members: [{ memberId: team.member.id, name: 'Cora Captain', playerId: 'p-cora', side: null, captain: false, connected: true }],
        state: null,
        seq: 0,
        buzz: { open: false, sides: { A: false, B: false }, winner: null },
      },
      serverTime: expect.any(Number),
    });
    expect(Math.abs(reader.welcome.serverTime - Date.now())).toBeLessThan(5000);

    const player = await connect(team, roomId, ana.token);
    expect(player.welcome.room.members.map((m: Json) => [m.name, m.connected])).toEqual([
      ['Cora Captain', true],
      ['Ana', true],
    ]);
    const joined = await reader.next('members', (m) => memberIn(m, ana.member.id)?.connected === true);
    expect(joined.hostId).toBe(team.member.id);

    player.close();
    const left = await reader.next('members', (m) => memberIn(m, ana.member.id)?.connected === false);
    expect(memberIn(left, ana.member.id)).toEqual({ memberId: ana.member.id, name: 'Ana', playerId: 'p-ana', side: null, captain: false, connected: false });
    reader.close();
  });

  it('answers pings with the server time', async () => {
    const { team, roomId } = await setup();
    const reader = await connect(team, roomId, team.token);
    reader.send({ type: 'ping', t: 12345 });
    const pong = await reader.next('pong');
    expect(pong).toEqual({ type: 'pong', t: 12345, serverTime: expect.any(Number) });
    reader.send({ type: 'ping' });
    expect((await reader.next('error')).message).toMatch(/ping needs/);
    reader.close();
  });

  it('refuses malformed messages without dropping the connection', async () => {
    const { team, roomId } = await setup();
    const reader = await connect(team, roomId, team.token);
    reader.ws.send(new Uint8Array([1, 2, 3]));
    expect((await reader.next('error')).message).toMatch(/JSON text/);
    reader.ws.send('{oops');
    expect((await reader.next('error')).message).toMatch(/valid JSON/);
    reader.send({ type: 'dance' });
    expect((await reader.next('error')).message).toMatch(/Unknown message type/);
    reader.ws.send(JSON.stringify({ type: 'publish', state: 'x'.repeat(80_000) }));
    expect((await reader.next('error')).message).toMatch(/too large/);
    await reader.roundTrip();
    expect(reader.closed).toBeNull();
    reader.close();
  });
});

describe('reader controls', () => {
  it("relays the reader's published state, and a late joiner gets the latest", async () => {
    const { team, roomId, ana, ben } = await setup();
    const reader = await connect(team, roomId, team.token);
    const player = await connect(team, roomId, ana.token);

    reader.send({ type: 'publish', state: { phase: 'reading', question: 1, startedAt: 1000, speed: 3 } });
    expect(await player.next('state')).toEqual({ type: 'state', state: { phase: 'reading', question: 1, startedAt: 1000, speed: 3 }, seq: 1 });
    expect((await reader.next('state')).seq).toBe(1);
    reader.send({ type: 'publish', state: { phase: 'bonus', question: 1 } });
    expect((await player.next('state')).seq).toBe(2);

    const late = await connect(team, roomId, ben.token);
    expect(late.welcome.room.state).toEqual({ phase: 'bonus', question: 1 });
    expect(late.welcome.room.seq).toBe(2);

    reader.send({ type: 'publish', state: { big: 'x'.repeat(64 * 1024) } });
    expect((await reader.next('error')).message).toMatch(/64 KB/);
    reader.send({ type: 'publish' });
    expect((await reader.next('error')).message).toMatch(/needs a state/);
    for (const c of [reader, player, late]) c.close();
  });

  it('lets only the reader publish, open, close, assign or hand over', async () => {
    const { team, roomId, ana } = await setup();
    const reader = await connect(team, roomId, team.token);
    const player = await connect(team, roomId, ana.token);
    const attempts = [
      { type: 'publish', state: { hacked: true } },
      { type: 'open', sides: { A: true, B: true } },
      { type: 'close' },
      { type: 'assign', memberId: ana.member.id, side: 'A', captain: true },
      { type: 'handover', memberId: ana.member.id },
    ];
    for (const attempt of attempts) {
      player.send(attempt);
      expect((await player.next('error')).message).toBe('Only the reader can do that.');
    }
    await player.nothing('state', 100);
    await player.nothing('buzz', 0);
    reader.close();
    player.close();
  });

  it('hands the reader role over to a connected member', async () => {
    const { team, roomId, ana, ben } = await setup();
    const reader = await connect(team, roomId, team.token);
    const player = await connect(team, roomId, ana.token);
    await takeSide(player, 'A');

    reader.send({ type: 'handover', memberId: ben.member.id });
    expect((await reader.next('error')).message).toMatch(/hasn't joined/);
    reader.send({ type: 'handover', memberId: ana.member.id });
    const changed = await player.next('members', (m) => m.hostId === ana.member.id);
    // The new reader leaves their side.
    expect(memberIn(changed, ana.member.id).side).toBeNull();

    player.send({ type: 'publish', state: { by: 'Ana' } });
    expect((await reader.next('state')).state).toEqual({ by: 'Ana' });
    reader.send({ type: 'publish', state: { by: 'Cora' } });
    expect((await reader.next('error')).message).toBe('Only the reader can do that.');
    reader.close();
    player.close();
  });

  it('assigns sides and one captain per side', async () => {
    const { team, roomId, ana, ben } = await setup();
    const reader = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    const b = await connect(team, roomId, ben.token);
    await takeSide(a, 'A');

    reader.send({ type: 'assign', memberId: ana.member.id, side: 'A', captain: true });
    await reader.next('members', (m) => memberIn(m, ana.member.id)?.captain === true);
    reader.send({ type: 'assign', memberId: ben.member.id, side: 'A', captain: true });
    const both = await reader.next('members', (m) => memberIn(m, ben.member.id)?.captain === true);
    expect(memberIn(both, ana.member.id)).toMatchObject({ side: 'A', captain: false });
    expect(memberIn(both, ben.member.id)).toMatchObject({ side: 'A', captain: true });

    // Choosing another side gives up the captaincy.
    await takeSide(b, 'B');
    const moved = await reader.next('members', (m) => memberIn(m, ben.member.id)?.side === 'B');
    expect(memberIn(moved, ben.member.id).captain).toBe(false);

    reader.send({ type: 'assign', memberId: team.member.id, side: 'A' });
    expect((await reader.next('error')).message).toMatch(/reader doesn't play/);
    reader.send({ type: 'assign', memberId: ana.member.id, side: null, captain: true });
    expect((await reader.next('error')).message).toMatch(/captain needs a side/);
    reader.send({ type: 'side', side: 'A' });
    expect((await reader.next('error')).message).toMatch(/reader doesn't play/);
    for (const c of [reader, a, b]) c.close();
  });
});

describe('fair buzzing', () => {
  it('gives the buzz to the second arrival when its connection is much slower', async () => {
    const { team, roomId, ana, ben } = await setup();
    const reader = await connect(team, roomId, team.token);
    const fast = await connect(team, roomId, ana.token);
    // Ben's device answers the server's pings 400 ms late: a slow connection.
    const slow = await connect(team, roomId, ben.token, { pongDelay: 400 });
    await takeSide(fast, 'A');
    await takeSide(slow, 'B');
    // Both connections have a round-trip sample once their pongs are in (a round trip flushes them).
    await waitUntil(() => slow.pongsSent >= 1 && fast.pongsSent >= 1);
    await slow.roundTrip();
    await fast.roundTrip();
    const rtts = await runInDurableObject(teamStub(team.teamId), (_i, state) =>
      Object.fromEntries(state.getWebSockets().map((ws) => [ws.deserializeAttachment().memberId, ws.deserializeAttachment().rtt])),
    );
    expect(rtts[ben.member.id]).toBeGreaterThanOrEqual(380);
    expect(rtts[ana.member.id]).toBeLessThan(100);

    await openBuzzers(reader, { A: true, B: true }, fast, slow);
    fast.send({ type: 'buzz' });
    await sleep(30);
    slow.send({ type: 'buzz' });

    const decided = await Promise.all([winnerMessage(reader), winnerMessage(fast), winnerMessage(slow)]);
    for (const message of decided) {
      expect(message.buzz).toEqual({
        open: false,
        sides: { A: false, B: false },
        winner: { memberId: ben.member.id, playerId: 'p-ben', side: 'B', pressedAt: expect.any(Number) },
      });
    }
    // Ben's press is stamped about half his round trip before his buzz arrived, earlier than Ana's.
    expect(decided[0].buzz.winner.pressedAt).toBeLessThan(Date.now() - 150);
    for (const c of [reader, fast, slow]) c.close();
  });

  it('gives the buzz to the first arrival when connections are equally fast', async () => {
    const { team, roomId, ana, ben } = await setup();
    const reader = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    const b = await connect(team, roomId, ben.token);
    await takeSide(a, 'A');
    await takeSide(b, 'B');
    await openBuzzers(reader, { A: true, B: true }, a, b);
    b.send({ type: 'buzz' });
    await sleep(30);
    a.send({ type: 'buzz' });
    expect((await winnerMessage(a)).buzz.winner.memberId).toBe(ben.member.id);
    for (const c of [reader, a, b]) c.close();
  });

  it('ignores buzzes while buzzers are closed or a side is not open', async () => {
    const { team, roomId, ana, ben } = await setup();
    const reader = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    const b = await connect(team, roomId, ben.token);
    const nobody = await connect(team, roomId, (await addMember(team, 'Dee', 'p-dee')).token);
    await takeSide(a, 'A');
    await takeSide(b, 'B');

    a.send({ type: 'buzz' });
    expect((await a.next('error')).message).toBe('Buzzers are closed.');
    reader.send({ type: 'buzz' });
    expect((await reader.next('error')).message).toBe("The reader can't buzz.");

    // A rebound: only side B is open.
    await openBuzzers(reader, { A: false, B: true }, a, b);
    a.send({ type: 'buzz' });
    expect((await a.next('error')).message).toBe('Buzzers are closed for your side.');
    nobody.send({ type: 'buzz' });
    expect((await nobody.next('error')).message).toBe('Pick a side before buzzing.');
    await a.nothing('buzz', 250);

    b.send({ type: 'buzz' });
    expect((await winnerMessage(a)).buzz.winner.memberId).toBe(ben.member.id);
    // Buzzers closed with the winner: a late buzz is refused.
    b.send({ type: 'buzz' });
    expect((await b.next('error')).message).toBe('Buzzers are closed.');
    for (const c of [reader, a, b, nobody]) c.close();
  });

  it('allows one buzz per player in a window, and a fresh one after reopening', async () => {
    const { team, roomId, ana, ben } = await setup();
    const reader = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    const b = await connect(team, roomId, ben.token);
    await takeSide(a, 'A');
    await takeSide(b, 'B');
    await openBuzzers(reader, { A: true, B: true }, a, b);

    a.send({ type: 'buzz' });
    a.send({ type: 'buzz' });
    expect((await a.next('error')).message).toBe('You already buzzed.');
    const first = await winnerMessage(reader);
    expect(first.buzz.winner.memberId).toBe(ana.member.id);

    await openBuzzers(reader, { A: true, B: true }, a, b);
    a.send({ type: 'buzz' });
    expect((await winnerMessage(reader)).buzz.winner.memberId).toBe(ana.member.id);
    for (const c of [reader, a, b]) c.close();
  });

  it('drops buzzes still being collected when the reader closes the buzzers', async () => {
    const { team, roomId, ana } = await setup();
    const reader = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    await takeSide(a, 'A');
    await openBuzzers(reader, { A: true, B: true }, a);
    a.send({ type: 'buzz' });
    reader.send({ type: 'close' });
    const closed = await a.next('buzz', (m) => !m.buzz.open);
    expect(closed.buzz).toEqual({ open: false, sides: { A: false, B: false }, winner: null });
    await a.nothing('buzz', 300);
    for (const c of [reader, a]) c.close();
  });

  it('measures a connection whose round trip is longer than its ping interval', async () => {
    const { team, roomId, ana } = await setup();
    const player = await connect(team, roomId, ana.token, { pongDelay: 1500 });
    // The client keeps pinging every 200 ms (past the server's 1 s ping gap) while the answer to the server's
    // first ping is still on its way; that answer must still count.
    while (player.pongsSent < 1) {
      await player.roundTrip();
      await sleep(200);
    }
    await player.roundTrip();
    const rtt = await runInDurableObject(teamStub(team.teamId), (_i, state) => state.getWebSockets()[0]!.deserializeAttachment().rtt);
    expect(rtt).toBeGreaterThanOrEqual(1450);
    expect(rtt).toBeLessThan(3000);
    player.close();
  });

  it('only counts pongs that answer the latest server ping', async () => {
    const { team, roomId, ana } = await setup();
    const player = await connect(team, roomId, ana.token, { pongDelay: 50 });
    await waitUntil(() => player.pongsSent >= 1);
    await player.roundTrip();
    const rtt = () =>
      runInDurableObject(teamStub(team.teamId), (_i, state) => state.getWebSockets()[0]!.deserializeAttachment().rtt as number);
    const measured = await rtt();
    expect(measured).toBeGreaterThanOrEqual(40);
    // A made-up pong (claiming a 2.5 s round trip) is ignored.
    player.send({ type: 'pong', t: Date.now() - 2500 });
    await player.roundTrip();
    expect(await rtt()).toBe(measured);
    player.close();
  });
});

describe('team channel', () => {
  it('delivers chat only to the same side', async () => {
    const { team, roomId, ana, ben, cal } = await setup();
    const reader = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    const b = await connect(team, roomId, ben.token);
    const c = await connect(team, roomId, cal.token);
    await takeSide(a, 'A');
    await takeSide(c, 'A');
    await takeSide(b, 'B');

    a.send({ type: 'chat', text: '  I think it is  mitochondria\n\nC? ' });
    for (const client of [a, c]) {
      expect(await client.next('chat')).toEqual({
        type: 'chat',
        from: { memberId: ana.member.id, name: 'Ana' },
        side: 'A',
        text: 'I think it is mitochondria\n\nC?',
        at: expect.any(Number),
      });
    }
    await b.nothing('chat', 200);
    await reader.nothing('chat', 0);

    reader.send({ type: 'chat', text: 'hi' });
    expect((await reader.next('error')).message).toMatch(/Join a side/);
    a.send({ type: 'chat', text: 'x'.repeat(501) });
    expect((await a.next('error')).message).toMatch(/1 to 500 characters/);

    // At most 5 messages a second.
    for (let i = 0; i < 6; i++) a.send({ type: 'chat', text: `msg ${i}` });
    expect((await a.next('error')).message).toMatch(/too fast/);
    for (const client of [reader, a, b, c]) client.close();
  });

  it("delivers a captain's answer to the reader and that side only", async () => {
    const { team, roomId, ana, ben, cal } = await setup();
    const reader = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    const b = await connect(team, roomId, ben.token);
    const c = await connect(team, roomId, cal.token);
    await takeSide(a, 'A');
    await takeSide(c, 'A');
    await takeSide(b, 'B');

    c.send({ type: 'answer', text: 'W' });
    expect((await c.next('error')).message).toMatch(/captain/);

    reader.send({ type: 'assign', memberId: ana.member.id, side: 'A', captain: true });
    await a.next('members', (m) => memberIn(m, ana.member.id)?.captain === true);
    a.send({ type: 'answer', text: '  W)  2 ' });
    for (const client of [reader, a, c]) {
      expect(await client.next('answer')).toEqual({
        type: 'answer',
        from: { memberId: ana.member.id, name: 'Ana' },
        side: 'A',
        text: 'W) 2',
        at: expect.any(Number),
      });
    }
    await b.nothing('answer', 200);
    a.send({ type: 'answer', text: 'y'.repeat(201) });
    expect((await a.next('error')).message).toMatch(/1 to 200 characters/);
    for (const client of [reader, a, b, c]) client.close();
  });
});

describe('surviving eviction', () => {
  it('keeps the host, sides, captains and latest state when the object is evicted', async () => {
    const { team, roomId, ana, ben, cal } = await setup();
    const reader = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    await takeSide(a, 'B');
    reader.send({ type: 'assign', memberId: ana.member.id, side: 'B', captain: true });
    await a.next('members', (m) => memberIn(m, ana.member.id)?.captain === true);
    reader.send({ type: 'publish', state: { question: 7 } });
    await a.next('state');

    await evictDurableObject(teamStub(team.teamId));

    const late = await connect(team, roomId, ben.token);
    expect(late.welcome.room.hostId).toBe(team.member.id);
    expect(late.welcome.room.state).toEqual({ question: 7 });
    expect(late.welcome.room.seq).toBe(1);
    // The hibernated sockets are still connected.
    expect(memberIn(late.welcome.room, ana.member.id)).toMatchObject({ side: 'B', captain: true, connected: true });
    expect(memberIn(late.welcome.room, team.member.id)).toMatchObject({ connected: true });

    // And they still work: the captain's answer reaches the reader through the woken object.
    a.send({ type: 'answer', text: 'Z' });
    expect((await reader.next('answer')).text).toBe('Z');
    const another = await connect(team, roomId, cal.token);
    for (const c of [reader, a, late, another]) c.close();
  });

  it('decides a buzz window that was being collected when the object was evicted', async () => {
    const { team, roomId, ana } = await setup();
    const reader = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    await takeSide(a, 'A');
    await openBuzzers(reader, { A: true, B: true }, a);

    a.send({ type: 'buzz' });
    // Simulate the instance dying mid-window: drop its in-memory collection timer, then evict it. (Eviction in
    // tests waits for pending timers, so without this the old timer would simply decide the window first.)
    const pending = await runInDurableObject(teamStub(team.teamId), (instance, state) => {
      const timers = (instance as unknown as { rooms: { timers: Map<string, ReturnType<typeof setTimeout>> } }).rooms.timers;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      const row = state.storage.sql.exec<{ buzz: string }>('SELECT buzz FROM rooms').one();
      return JSON.parse(row.buzz).window !== null;
    });
    expect(pending).toBe(true);
    await evictDurableObject(teamStub(team.teamId));
    await a.nothing('buzz', 100);

    // Nobody sends anything: the backup alarm wakes a new instance, which decides the window from SQLite.
    const decided = await winnerMessage(reader);
    expect(decided.buzz.winner).toMatchObject({ memberId: ana.member.id, side: 'A' });
    for (const c of [reader, a]) c.close();
  });

  it('decides a window left over from an evicted instance when the next message arrives', async () => {
    const { team, roomId, ana, ben } = await setup();
    const reader = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    const b = await connect(team, roomId, ben.token);
    await takeSide(a, 'A');
    await takeSide(b, 'B');
    await openBuzzers(reader, { A: true, B: true }, a, b);

    a.send({ type: 'buzz' });
    await runInDurableObject(teamStub(team.teamId), async (instance, state) => {
      const timers = (instance as unknown as { rooms: { timers: Map<string, ReturnType<typeof setTimeout>> } }).rooms.timers;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      await state.storage.deleteAlarm();
    });
    await evictDurableObject(teamStub(team.teamId));
    await sleep(200);

    // The window ended while the object was gone; Ben's late buzz wakes it, the window is decided first, and his
    // buzz is refused because the buzzers closed with Ana's win.
    b.send({ type: 'buzz' });
    expect((await winnerMessage(b)).buzz.winner.memberId).toBe(ana.member.id);
    expect((await b.next('error')).message).toBe('Buzzers are closed.');
    for (const c of [reader, a, b]) c.close();
  });
});

describe('membership changes', () => {
  it('closes the connections of a removed member and of a signed-out session', async () => {
    const { team, roomId, ana, ben } = await setup();
    const reader = await connect(team, roomId, team.token);
    const a = await connect(team, roomId, ana.token);
    const b = await connect(team, roomId, ben.token);

    await call(`/api/teams/${team.teamId}/members/${ana.member.id}`, { method: 'DELETE', token: team.token });
    await a.waitClosed();
    expect(a.closed!.code).toBe(4003);
    const update = await reader.next('members', (m) => !memberIn(m, ana.member.id));
    expect(update.members.map((m: Json) => m.name)).toEqual(['Cora Captain', 'Ben']);

    await call(`/api/teams/${team.teamId}/signout`, { method: 'POST', token: ben.token });
    await b.waitClosed();
    expect(b.closed!.code).toBe(4001);
    expect((await wsRequest(team, roomId, ben.token)).status).toBe(401);
    reader.close();
  });

  it('closes every connection when the team is deleted', async () => {
    const { team, roomId, ana } = await setup();
    const a = await connect(team, roomId, ana.token);
    await call(`/api/teams/${team.teamId}`, { method: 'DELETE', token: team.token });
    await a.waitClosed();
    expect(a.closed!.code).toBe(4004);
  });
});
