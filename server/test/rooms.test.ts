import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { ROOMS_PER_DAY } from '../src/user';
import { MAX_ROOMS } from '../src/team';
import { call, connect, createRoom, join, makeTeam, type Json, RoomClient, SITE, signUp, sleep, teamWith, type TestTeam, type TestUser, wsRequest } from './helpers';

const roomStub = (roomId: string) => env.ROOM.get(env.ROOM.idFromName(roomId));

interface Room {
  team: TestTeam;
  roomId: string;
  cora: TestUser;
  ana: TestUser;
  ben: TestUser;
  cal: TestUser;
}

/** A team whose captain (Cora) hosts a room, with three players. */
async function setup(): Promise<Room> {
  const { team, members } = await teamWith('Cora Captain', 'Ana', 'Ben', 'Cal');
  const roomId = await createRoom(team.captain.token);
  return { team, roomId, cora: team.captain, ana: members[0]!, ben: members[1]!, cal: members[2]! };
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
  it("lists the rooms opened by the caller's team, with their host and connected players", async () => {
    const { team, roomId, cora, ana } = await setup();
    expect((await call('/api/rooms', { token: ana.token, body: { name: '' } })).status).toBe(400);
    expect((await call('/api/rooms')).status).toBe(401);
    expect((await call('/api/rooms', { method: 'DELETE', token: ana.token })).status).toBe(405);

    const before = await call('/api/rooms?team=1', { token: ana.token });
    expect(before.body.rooms).toEqual([{ roomId, name: 'Tuesday scrimmage', host: { userId: cora.id, name: 'Cora Captain' }, players: 0, createdAt: expect.any(Number), kind: 'reader' }]);
    const reader = await connect(roomId, cora.token);
    const player = await connect(roomId, ana.token);
    const during = await call('/api/rooms', { token: ana.token });
    expect(during.body.rooms[0].players).toBe(1);

    // Someone on another team (or none) does not see it, but can still join with the link.
    const outsider = await signUp('Out');
    expect((await call('/api/rooms', { token: outsider.token })).body).toEqual({ rooms: [] });
    const visitor = await connect(roomId, outsider.token);
    expect(visitor.welcome.room.roomId).toBe(roomId);

    // A room opened by someone who has since left the team leaves the list.
    const newer = await createRoom(ana.token, 'Ana practice');
    expect((await call('/api/rooms', { token: cora.token })).body.rooms.map((r: Json) => r.roomId)).toEqual([newer, roomId]);
    await call(`/api/teams/${team.teamId}/leave`, { method: 'POST', token: ana.token });
    expect((await call('/api/rooms', { token: cora.token })).body.rooms.map((r: Json) => r.roomId)).toEqual([roomId]);
    for (const c of [reader, player, visitor]) c.close();
  });

  it('closes rooms after 6 hours with nobody connected, deleting them', async () => {
    const { roomId, cora } = await setup();
    await runInDurableObject(roomStub(roomId), (_i, state) => {
      state.storage.sql.exec('UPDATE room SET last_active = ?', Date.now() - 6 * 60 * 60 * 1000 - 1000);
    });
    expect((await call('/api/rooms', { token: cora.token })).body.rooms).toEqual([]);
    const res = await wsRequest(roomId, cora.token);
    expect(res.status).toBe(404);
    expect(((await res.json()) as Json).error).toBe('This room has closed. Ask the host for a new link.');
    const tables = await runInDurableObject(roomStub(roomId), (_i, state) => state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table'").toArray());
    expect(tables.filter((t) => !String(t.name).startsWith('_cf'))).toEqual([]);
  });

  it('closes an idle room from its alarm, with nobody asking', async () => {
    const user = await signUp('Solo');
    const roomId = await createRoom(user.token);
    const client = await connect(roomId, user.token);
    client.close();
    await client.waitClosed();
    await sleep(50);
    await runInDurableObject(roomStub(roomId), async (_i, state) => {
      state.storage.sql.exec('UPDATE room SET last_active = ?', Date.now() - 6 * 60 * 60 * 1000 - 1000);
      await state.storage.setAlarm(Date.now() + 10);
    });
    await sleep(200);
    const left = await runInDurableObject(roomStub(roomId), (_i, state) => state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'room'").toArray().length);
    expect(left).toBe(0);
  });

  it(`caps open rooms per team (${MAX_ROOMS}) and new rooms per person per day (${ROOMS_PER_DAY})`, async () => {
    const cora = await signUp('Cora');
    await makeTeam(cora);
    for (let i = 0; i < MAX_ROOMS; i++) await createRoom(cora.token, `Room ${i}`);
    const full = await call('/api/rooms', { token: cora.token, body: { name: 'One more' } });
    expect(full.status).toBe(429);
    expect(full.body.error).toBe(`Your team already has ${MAX_ROOMS} open rooms. Rooms close 6 hours after everyone leaves.`);

    const solo = await signUp('Solo');
    await runInDurableObject(env.USER.get(env.USER.idFromName(solo.id)), (_i, state) => {
      state.storage.sql.exec('INSERT INTO rooms_made (day, count) VALUES (?, ?)', new Date().toISOString().slice(0, 10), ROOMS_PER_DAY);
    });
    const capped = await call('/api/rooms', { token: solo.token, body: { name: 'Again' } });
    expect(capped.status).toBe(429);
    expect(capped.body.error).toBe(`You have opened ${ROOMS_PER_DAY} rooms today. You can open more tomorrow.`);
  });
});

describe('connecting', () => {
  it('checks the session and the room before accepting the WebSocket', async () => {
    const { roomId, cora } = await setup();
    expect((await wsRequest(roomId, '')).status).toBe(401);
    expect((await wsRequest(roomId, `${cora.id}.${'x'.repeat(43)}`)).status).toBe(401);
    expect((await wsRequest('nosuchroom12', cora.token)).status).toBe(404);
    expect((await wsRequest('abcdefghijklmnop', cora.token)).status).toBe(404);
    expect((await wsRequest(roomId, cora.token, { Origin: 'https://evil.example' })).status).toBe(403);
    const plain = await call(`/api/rooms/${roomId}/ws?token=${cora.token}`);
    expect(plain.status).toBe(426);
    // The token in the query string is only for the WebSocket.
    expect((await call(`/api/me?token=${cora.token}`)).status).toBe(401);

    const fromSite = await wsRequest(roomId, cora.token, { Origin: SITE });
    expect(fromSite.status).toBe(101);
    fromSite.webSocket!.accept();
    fromSite.webSocket!.close();
  });

  it('welcomes each connection and tells the room who joins and leaves', async () => {
    const { roomId, cora, ana } = await setup();
    const reader = await connect(roomId, cora.token);
    expect(reader.welcome).toEqual({
      type: 'welcome',
      you: { memberId: cora.id, name: 'Cora Captain', playerId: cora.id },
      room: {
        roomId,
        name: 'Tuesday scrimmage',
        kind: 'reader',
        hostId: cora.id,
        members: [{ memberId: cora.id, name: 'Cora Captain', playerId: cora.id, side: null, captain: false, connected: true }],
        state: null,
        seq: 0,
        buzz: { open: false, sides: { A: false, B: false }, winner: null },
      },
      serverTime: expect.any(Number),
    });
    expect(Math.abs(reader.welcome.serverTime - Date.now())).toBeLessThan(5000);

    const player = await connect(roomId, ana.token);
    expect(player.welcome.room.members.map((m: Json) => [m.name, m.connected])).toEqual([
      ['Cora Captain', true],
      ['Ana', true],
    ]);
    const joined = await reader.next('members', (m) => memberIn(m, ana.id)?.connected === true);
    expect(joined.hostId).toBe(cora.id);

    player.close();
    const left = await reader.next('members', (m) => memberIn(m, ana.id)?.connected === false);
    expect(memberIn(left, ana.id)).toEqual({ memberId: ana.id, name: 'Ana', playerId: ana.id, side: null, captain: false, connected: false });
    reader.close();
  });

  it('answers pings with the server time', async () => {
    const { roomId, cora } = await setup();
    const reader = await connect(roomId, cora.token);
    reader.send({ type: 'ping', t: 12345 });
    const pong = await reader.next('pong');
    expect(pong).toEqual({ type: 'pong', t: 12345, serverTime: expect.any(Number) });
    reader.send({ type: 'ping' });
    expect((await reader.next('error')).message).toMatch(/ping needs/);
    reader.close();
  });

  it('refuses malformed messages without dropping the connection', async () => {
    const { roomId, cora } = await setup();
    const reader = await connect(roomId, cora.token);
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
    const { roomId, cora, ana, ben } = await setup();
    const reader = await connect(roomId, cora.token);
    const player = await connect(roomId, ana.token);

    reader.send({ type: 'publish', state: { phase: 'reading', question: 1, startedAt: 1000, speed: 3 } });
    expect(await player.next('state')).toEqual({ type: 'state', state: { phase: 'reading', question: 1, startedAt: 1000, speed: 3 }, seq: 1 });
    expect((await reader.next('state')).seq).toBe(1);
    reader.send({ type: 'publish', state: { phase: 'bonus', question: 1 } });
    expect((await player.next('state')).seq).toBe(2);

    const late = await connect(roomId, ben.token);
    expect(late.welcome.room.state).toEqual({ phase: 'bonus', question: 1 });
    expect(late.welcome.room.seq).toBe(2);

    reader.send({ type: 'publish', state: { big: 'x'.repeat(64 * 1024) } });
    expect((await reader.next('error')).message).toMatch(/64 KB/);
    reader.send({ type: 'publish' });
    expect((await reader.next('error')).message).toMatch(/needs a state/);
    for (const c of [reader, player, late]) c.close();
  });

  it('lets only the reader publish, open, close, assign or hand over', async () => {
    const { roomId, cora, ana } = await setup();
    const reader = await connect(roomId, cora.token);
    const player = await connect(roomId, ana.token);
    const attempts = [
      { type: 'publish', state: { hacked: true } },
      { type: 'open', sides: { A: true, B: true } },
      { type: 'close' },
      { type: 'assign', memberId: ana.id, side: 'A', captain: true },
      { type: 'handover', memberId: ana.id },
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
    const { roomId, cora, ana, ben } = await setup();
    const reader = await connect(roomId, cora.token);
    const player = await connect(roomId, ana.token);
    await takeSide(player, 'A');

    reader.send({ type: 'handover', memberId: ben.id });
    expect((await reader.next('error')).message).toMatch(/hasn't joined/);
    reader.send({ type: 'handover', memberId: ana.id });
    const changed = await player.next('members', (m) => m.hostId === ana.id);
    // The new reader leaves their side.
    expect(memberIn(changed, ana.id).side).toBeNull();

    player.send({ type: 'publish', state: { by: 'Ana' } });
    expect((await reader.next('state')).state).toEqual({ by: 'Ana' });
    reader.send({ type: 'publish', state: { by: 'Cora' } });
    expect((await reader.next('error')).message).toBe('Only the reader can do that.');
    reader.close();
    player.close();
  });

  it('assigns sides and one captain per side', async () => {
    const { roomId, cora, ana, ben } = await setup();
    const reader = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    const b = await connect(roomId, ben.token);
    await takeSide(a, 'A');

    reader.send({ type: 'assign', memberId: ana.id, side: 'A', captain: true });
    await reader.next('members', (m) => memberIn(m, ana.id)?.captain === true);
    reader.send({ type: 'assign', memberId: ben.id, side: 'A', captain: true });
    const both = await reader.next('members', (m) => memberIn(m, ben.id)?.captain === true);
    expect(memberIn(both, ana.id)).toMatchObject({ side: 'A', captain: false });
    expect(memberIn(both, ben.id)).toMatchObject({ side: 'A', captain: true });

    // Choosing another side gives up the captaincy.
    await takeSide(b, 'B');
    const moved = await reader.next('members', (m) => memberIn(m, ben.id)?.side === 'B');
    expect(memberIn(moved, ben.id).captain).toBe(false);

    reader.send({ type: 'assign', memberId: cora.id, side: 'A' });
    expect((await reader.next('error')).message).toMatch(/reader doesn't play/);
    reader.send({ type: 'assign', memberId: ana.id, side: null, captain: true });
    expect((await reader.next('error')).message).toMatch(/captain needs a side/);
    reader.send({ type: 'side', side: 'A' });
    expect((await reader.next('error')).message).toMatch(/reader doesn't play/);
    for (const c of [reader, a, b]) c.close();
  });
});

describe('fair buzzing', () => {
  it('gives the buzz to the second arrival when its connection is much slower', async () => {
    const { roomId, cora, ana, ben } = await setup();
    const reader = await connect(roomId, cora.token);
    const fast = await connect(roomId, ana.token);
    // Ben's device answers the server's pings 400 ms late: a slow connection.
    const slow = await connect(roomId, ben.token, { pongDelay: 400 });
    await takeSide(fast, 'A');
    await takeSide(slow, 'B');
    // Both connections have a round-trip sample once their pongs are in (a round trip flushes them).
    await waitUntil(() => slow.pongsSent >= 1 && fast.pongsSent >= 1);
    await slow.roundTrip();
    await fast.roundTrip();
    const rtts = await runInDurableObject(roomStub(roomId), (_i, state) =>
      Object.fromEntries(state.getWebSockets().map((ws) => [ws.deserializeAttachment().userId, ws.deserializeAttachment().rtt])),
    );
    expect(rtts[ben.id]).toBeGreaterThanOrEqual(380);
    expect(rtts[ana.id]).toBeLessThan(100);

    await openBuzzers(reader, { A: true, B: true }, fast, slow);
    fast.send({ type: 'buzz' });
    await sleep(30);
    slow.send({ type: 'buzz' });

    const decided = await Promise.all([winnerMessage(reader), winnerMessage(fast), winnerMessage(slow)]);
    for (const message of decided) {
      expect(message.buzz).toEqual({
        open: false,
        sides: { A: false, B: false },
        winner: { memberId: ben.id, playerId: ben.id, side: 'B', pressedAt: expect.any(Number) },
      });
    }
    // Ben's press is stamped about half his round trip before his buzz arrived, earlier than Ana's.
    expect(decided[0].buzz.winner.pressedAt).toBeLessThan(Date.now() - 150);
    for (const c of [reader, fast, slow]) c.close();
  });

  it('gives the buzz to the first arrival when connections are equally fast', async () => {
    const { roomId, cora, ana, ben } = await setup();
    const reader = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    const b = await connect(roomId, ben.token);
    await takeSide(a, 'A');
    await takeSide(b, 'B');
    await openBuzzers(reader, { A: true, B: true }, a, b);
    b.send({ type: 'buzz' });
    await sleep(30);
    a.send({ type: 'buzz' });
    expect((await winnerMessage(a)).buzz.winner.memberId).toBe(ben.id);
    for (const c of [reader, a, b]) c.close();
  });

  it('ignores buzzes while buzzers are closed or a side is not open', async () => {
    const { roomId, cora, ana, ben, cal } = await setup();
    const reader = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    const b = await connect(roomId, ben.token);
    const nobody = await connect(roomId, cal.token);
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
    expect((await winnerMessage(a)).buzz.winner.memberId).toBe(ben.id);
    // Buzzers closed with the winner: a late buzz is refused.
    b.send({ type: 'buzz' });
    expect((await b.next('error')).message).toBe('Buzzers are closed.');
    for (const c of [reader, a, b, nobody]) c.close();
  });

  it('allows one buzz per player in a window, and a fresh one after reopening', async () => {
    const { roomId, cora, ana, ben } = await setup();
    const reader = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    const b = await connect(roomId, ben.token);
    await takeSide(a, 'A');
    await takeSide(b, 'B');
    await openBuzzers(reader, { A: true, B: true }, a, b);

    a.send({ type: 'buzz' });
    a.send({ type: 'buzz' });
    expect((await a.next('error')).message).toBe('You already buzzed.');
    const first = await winnerMessage(reader);
    expect(first.buzz.winner.memberId).toBe(ana.id);

    await openBuzzers(reader, { A: true, B: true }, a, b);
    a.send({ type: 'buzz' });
    expect((await winnerMessage(reader)).buzz.winner.memberId).toBe(ana.id);
    for (const c of [reader, a, b]) c.close();
  });

  it('drops buzzes still being collected when the reader closes the buzzers', async () => {
    const { roomId, cora, ana } = await setup();
    const reader = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
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
    const { roomId, ana } = await setup();
    const player = await connect(roomId, ana.token, { pongDelay: 1500 });
    // The client keeps pinging every 200 ms (past the server's 1 s ping gap) while the answer to the server's
    // first ping is still on its way; that answer must still count.
    while (player.pongsSent < 1) {
      await player.roundTrip();
      await sleep(200);
    }
    await player.roundTrip();
    const rtt = await runInDurableObject(roomStub(roomId), (_i, state) => state.getWebSockets()[0]!.deserializeAttachment().rtt);
    expect(rtt).toBeGreaterThanOrEqual(1450);
    expect(rtt).toBeLessThan(3000);
    player.close();
  });

  it('only counts pongs that answer the latest server ping', async () => {
    const { roomId, ana } = await setup();
    const player = await connect(roomId, ana.token, { pongDelay: 50 });
    await waitUntil(() => player.pongsSent >= 1);
    await player.roundTrip();
    const rtt = () => runInDurableObject(roomStub(roomId), (_i, state) => state.getWebSockets()[0]!.deserializeAttachment().rtt as number);
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
    const { roomId, cora, ana, ben, cal } = await setup();
    const reader = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    const b = await connect(roomId, ben.token);
    const c = await connect(roomId, cal.token);
    await takeSide(a, 'A');
    await takeSide(c, 'A');
    await takeSide(b, 'B');

    a.send({ type: 'chat', text: '  I think it is  mitochondria\n\nC? ' });
    for (const client of [a, c]) {
      expect(await client.next('chat')).toEqual({
        type: 'chat',
        from: { memberId: ana.id, name: 'Ana' },
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
    const { roomId, cora, ana, ben, cal } = await setup();
    const reader = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    const b = await connect(roomId, ben.token);
    const c = await connect(roomId, cal.token);
    await takeSide(a, 'A');
    await takeSide(c, 'A');
    await takeSide(b, 'B');

    c.send({ type: 'answer', text: 'W' });
    expect((await c.next('error')).message).toMatch(/captain/);

    reader.send({ type: 'assign', memberId: ana.id, side: 'A', captain: true });
    await a.next('members', (m) => memberIn(m, ana.id)?.captain === true);
    a.send({ type: 'answer', text: '  W)  2 ' });
    for (const client of [reader, a, c]) {
      expect(await client.next('answer')).toEqual({
        type: 'answer',
        from: { memberId: ana.id, name: 'Ana' },
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
    const { roomId, cora, ana, ben, cal } = await setup();
    const reader = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    await takeSide(a, 'B');
    reader.send({ type: 'assign', memberId: ana.id, side: 'B', captain: true });
    await a.next('members', (m) => memberIn(m, ana.id)?.captain === true);
    reader.send({ type: 'publish', state: { question: 7 } });
    await a.next('state');

    await evictDurableObject(roomStub(roomId));

    const late = await connect(roomId, ben.token);
    expect(late.welcome.room.hostId).toBe(cora.id);
    expect(late.welcome.room.state).toEqual({ question: 7 });
    expect(late.welcome.room.seq).toBe(1);
    // The hibernated sockets are still connected.
    expect(memberIn(late.welcome.room, ana.id)).toMatchObject({ side: 'B', captain: true, connected: true });
    expect(memberIn(late.welcome.room, cora.id)).toMatchObject({ connected: true });

    // And they still work: the captain's answer reaches the reader through the woken object.
    a.send({ type: 'answer', text: 'Z' });
    expect((await reader.next('answer')).text).toBe('Z');
    const another = await connect(roomId, cal.token);
    for (const c of [reader, a, late, another]) c.close();
  });

  it('decides a buzz window that was being collected when the object was evicted', async () => {
    const { roomId, cora, ana } = await setup();
    const reader = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    await takeSide(a, 'A');
    await openBuzzers(reader, { A: true, B: true }, a);

    // Simulate the instance dying mid-window: its in-memory collection timer is lost (eviction in tests waits for
    // pending timers, so the timer is stopped from firing first), then the instance is evicted.
    await runInDurableObject(roomStub(roomId), (instance) => {
      const room = instance as unknown as { schedule: (delay: number) => void };
      room.schedule = () => {};
    });
    a.send({ type: 'buzz' });
    await a.roundTrip();
    const pending = await runInDurableObject(roomStub(roomId), (_i, state) => JSON.parse(state.storage.sql.exec<{ buzz: string }>('SELECT buzz FROM room').one().buzz).window !== null);
    expect(pending).toBe(true);
    await evictDurableObject(roomStub(roomId));
    await a.nothing('buzz', 100);

    // Nobody sends anything: the backup alarm wakes a new instance, which decides the window from SQLite.
    const decided = await winnerMessage(reader);
    expect(decided.buzz.winner).toMatchObject({ memberId: ana.id, side: 'A' });
    for (const c of [reader, a]) c.close();
  });

  it('decides a window left over from an evicted instance when the next message arrives', async () => {
    const { roomId, cora, ana, ben } = await setup();
    const reader = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    const b = await connect(roomId, ben.token);
    await takeSide(a, 'A');
    await takeSide(b, 'B');
    await openBuzzers(reader, { A: true, B: true }, a, b);

    await runInDurableObject(roomStub(roomId), (instance) => {
      const room = instance as unknown as { schedule: (delay: number) => void; rescheduleAlarm: () => void };
      room.schedule = () => {};
      room.rescheduleAlarm = () => {};
    });
    a.send({ type: 'buzz' });
    await a.roundTrip();
    await runInDurableObject(roomStub(roomId), async (_i, state) => {
      await state.storage.deleteAlarm();
    });
    await evictDurableObject(roomStub(roomId));
    await sleep(200);

    // The window ended while the object was gone; Ben's late buzz wakes it, the window is decided first, and his
    // buzz is refused because the buzzers closed with Ana's win.
    b.send({ type: 'buzz' });
    expect((await winnerMessage(b)).buzz.winner.memberId).toBe(ana.id);
    expect((await b.next('error')).message).toBe('Buzzers are closed.');
    for (const c of [reader, a, b]) c.close();
  });
});

describe('ending sessions', () => {
  it('closes the connections of a signed-out session, and of a deleted account', async () => {
    const { roomId, cora, ana, ben } = await setup();
    const reader = await connect(roomId, cora.token);
    const a = await connect(roomId, ana.token);
    const b = await connect(roomId, ben.token);

    await call('/api/auth/signout', { method: 'POST', token: ben.token });
    await b.waitClosed();
    expect(b.closed!.code).toBe(4001);
    expect((await wsRequest(roomId, ben.token)).status).toBe(401);

    await call('/api/me', { method: 'DELETE', token: ana.token });
    await a.waitClosed();
    expect(a.closed!.code).toBe(4001);
    expect(reader.closed).toBeNull();
    reader.close();
  });

  it('lets a member who changed teams keep playing in a room they joined', async () => {
    const { roomId, cora, ana } = await setup();
    const other = await makeTeam(await signUp('Eve'));
    const a = await connect(roomId, ana.token);
    expect((await join(other, ana, { leaveCurrent: true })).status).toBe(200);
    const again = await connect(roomId, ana.token);
    expect(again.welcome.you.memberId).toBe(ana.id);
    const reader = await connect(roomId, cora.token);
    for (const c of [a, again, reader]) c.close();
  });
});
