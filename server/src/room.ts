/**
 * RoomServer: one Durable Object per live room (named by the room id), open to any signed-in user with its link
 * (docs/SERVER.md, "Rooms"). In a reader room the reader's browser runs the game; the server relays the reader's
 * view, decides who buzzed first and carries each side's private channel. In a match room there is no reader: the
 * server runs the game itself (match.ts). Room members are users: a member's `memberId` and `playerId` are both
 * their user id. When a match ends, every player's answers go to their account, and a team match whose players are
 * all on the host's team also goes to that team's games (through the outbox, so a busy account loses nothing).
 *
 * Sockets use the WebSocket Hibernation API: between messages the object may sleep or be evicted, so nothing lives
 * only in memory. Room state (host, sides and captains, the latest published state and its seq, the buzz window, the
 * match) is in SQLite; each socket's own state (its round-trip time, rate limits) is in its attachment. The only
 * in-memory state is the timers (the 150 ms collection window, the match's next step), which `resume` re-creates
 * from SQLite after a wake-up; one alarm backs them up in case the object is evicted with nothing else to wake it.
 * The same alarm closes the room 6 hours after everyone left, deleting its storage.
 */

import { DurableObject } from 'cloudflare:workers';
import { gameOutcomes } from '../../src/core/games';
import type { Outcome } from '../../src/core/review';
import type { CoreSubject, Player } from '../../src/core/schema';
import { HttpError, identityOf, refusing, toErrorResponse, type Identity, type Result } from './http';
import {
  matchQuestions,
  MatchDirector,
  newMatchData,
  playbackRate,
  type AnswerResult,
  type MatchData,
  type MatchPlayer,
  type MatchSetup,
  type MatchVoice,
  type OnlineGameRecord,
  type ReadingMode,
  type Recording,
} from './match';
import { hasTable, teamObject, userObject, voiceObject } from './objects';
import { audioKey, SAMPLE_TEXT, spokenFor, ttsSettings } from './tts';
import { Outbox, OUTBOX_SCHEMA, type Delivery } from './outbox';
import { MAX_JSON_DEPTH, nestsDeeperThan, utf8Bytes } from './validate';

/** Buzzes are collected for this long after the first one before a winner is decided. */
export const BUZZ_WINDOW_MS = 150;
/** Round-trip samples above this are ignored (a stalled connection should not earn a huge head start). */
export const MAX_RTT_SAMPLE_MS = 3000;
/** Weight of each new round-trip sample in the moving average. */
export const RTT_WEIGHT = 0.25;
/** A room closes after this long with nobody connected. */
export const ROOM_IDLE_MS = 6 * 60 * 60 * 1000;
export const MAX_STATE_BYTES = 64 * 1024;
const MAX_SOCKETS = 64;
const MAX_MESSAGE_CHARS = 70_000;
const MAX_CHAT_CHARS = 500;
const MAX_ANSWER_CHARS = 200;
const CHATS_PER_SECOND = 5;
/** Not in the spec: a safety limit so a runaway reader page cannot flood everyone. */
const PUBLISHES_PER_SECOND = 10;
/** The server pings a socket at most this often (it pings after each client ping). */
const SERVER_PING_GAP_MS = 1000;
/** The backup alarm fires this long after a collection window or a match step should have happened. */
const ALARM_SLACK_MS = 500;
/** Questions recorded at once for a match read aloud. */
const VOICE_BATCH = 4;
/** While a match's questions are being recorded, the alarm checks this often that the work is still going. */
const VOICE_WATCHDOG_MS = 20_000;
/** The room's last-active time is refreshed at most this often while messages arrive. */
const TOUCH_EVERY_MS = 60 * 1000;

const ROOM_CLOSED = 'This room has closed. Ask the host for a new link.';
const SIGNED_OUT = 'Signed out.';
const MATCH_CANCELLED = 'The host cancelled this match.';

/** Close codes the site treats as final (src/lib/room.ts): it stops reconnecting and says why. */
const CLOSE_SIGNED_OUT = 4001;
const CLOSE_ROOM_CLOSED = 4004;
const CLOSE_CANCELLED = 4005;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS room (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL,
  state TEXT,
  seq INTEGER NOT NULL DEFAULT 0,
  buzz TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  team_id TEXT,
  primary_subject TEXT,
  secondary_subject TEXT,
  side TEXT,
  captain INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS match (one INTEGER PRIMARY KEY CHECK (one = 1), data TEXT NOT NULL, due_at INTEGER);
CREATE TABLE IF NOT EXISTS results (n INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, result TEXT NOT NULL);
${OUTBOX_SCHEMA}
`;

export type Side = 'A' | 'B';

/** One room in a team's room list (`GET /api/rooms`). */
export interface RoomSummary {
  roomId: string;
  name: string;
  host: { userId: string; name: string };
  /** Connected now, not counting a reader (in a match room the host plays too). */
  players: number;
  createdAt: number;
  kind: 'reader' | 'match';
  match?: { format: MatchSetup['format']; mode: ReadingMode; status: MatchData['status'] };
}

interface Winner {
  memberId: string;
  playerId: string;
  side: Side;
  pressedAt: number;
}

interface BuzzEntry extends Winner {
  receivedAt: number;
}

interface BuzzState {
  open: boolean;
  sides: { A: boolean; B: boolean };
  winner: Winner | null;
  /** Members who have buzzed since the buzzers last opened: one buzz each. */
  buzzed: string[];
  /** The collection period started by the first buzz, until its winner is decided. */
  window: { endsAt: number; entries: BuzzEntry[] } | null;
}

const IDLE_BUZZ: BuzzState = { open: false, sides: { A: false, B: false }, winner: null, buzzed: [], window: null };

type RoomRow = { id: string; name: string; host_id: string; created_at: number; last_active: number; state: string | null; seq: number; buzz: string };

type MemberRow = {
  user_id: string;
  name: string;
  team_id: string | null;
  primary_subject: CoreSubject | null;
  secondary_subject: CoreSubject | null;
  side: Side | null;
  captain: number;
  joined_at: number;
};

/** What each socket remembers about itself; survives hibernation (and must stay under 2 KB). */
interface Attachment {
  userId: string;
  /** Short id of the session that opened the socket, so signing out can close it. */
  sid: string;
  /** Smoothed round-trip time in ms, or null before the first sample. */
  rtt: number | null;
  /** Server time of the ping awaiting this socket's pong, if any. */
  pingAt: number | null;
  /** When the server last pinged this socket. */
  lastPing: number;
  /** Times of recent chat messages and publishes, for the rate limits. */
  chats: number[];
  publishes: number[];
  /** Whether this device can read questions aloud (matches read aloud), once it has said. */
  voice?: boolean;
}

/** Messages only the room's reader (host) may send. */
const READER_ONLY = new Set(['publish', 'open', 'close', 'assign', 'handover']);
/** In a match room the server itself publishes and runs the buzzers. */
const MATCH_SERVER_ONLY = new Set(['publish', 'open', 'close']);
/** Match rooms: the host's controls. */
const MATCH_HOST_ONLY = new Set(['start', 'pause', 'resume', 'end']);

const userTag = (userId: string) => `user:${userId}`;
const sessionTag = (sid: string) => `sid:${sid}`;

function attachmentOf(ws: WebSocket): Attachment | null {
  try {
    return (ws.deserializeAttachment() as Attachment | null) ?? null;
  } catch {
    return null;
  }
}

function send(ws: WebSocket, message: object | string): void {
  try {
    ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  } catch {
    // The socket is closing; its close handler tidies up.
  }
}

function closeQuietly(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}

/**
 * A connection to a room that has closed (or never was): accepted only to close at once, saying why. A browser cannot
 * read why an upgrade was refused, so it would keep trying.
 */
export function closedSocket(): Response {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
  server.accept();
  server.close(CLOSE_ROOM_CLOSED, ROOM_CLOSED);
  return new Response(null, { status: 101, webSocket: client });
}

const isLive = (ws: WebSocket) => ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING;

/** Keeps the times of recent events within the last second; false if `perSecond` were already used. */
function allowRate(times: number[], now: number, perSecond: number): boolean {
  const recent = times.filter((t) => now - t < 1000);
  times.splice(0, times.length, ...recent);
  if (recent.length >= perSecond) return false;
  times.push(now);
  return true;
}

function parseSide(value: unknown): Side | null | undefined {
  return value === 'A' || value === 'B' || value === null ? value : undefined;
}

export class RoomServer extends DurableObject<Env> {
  private readonly outbox: Outbox;
  /** Whether this object holds an open room: false for a fresh object, and again once the room has closed. */
  private ready: boolean;
  /** The collection timer. Lost on eviction; `resume` and the alarm recover it from SQLite. */
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The match's timer (the next reading end, deadline...), recovered the same way. */
  private matchTimer: ReturnType<typeof setTimeout> | null = null;
  /** The alarm last set, so an unchanged one is not set again. */
  private alarmAt: number | null = null;
  /** The questions of a match read aloud being recorded (one run at a time). */
  private preparing: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.outbox = new Outbox(ctx.storage.sql);
    this.ready = hasTable(ctx.storage.sql, 'room') && this.room() !== null;
    // Waking up (after hibernation or eviction): re-create timers for a buzz window still being collected.
    if (this.ready) this.resume(Date.now());
  }

  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }

  /* ---------------- RPC (from the Worker and the team) ---------------- */

  /** Opens the room: a reader room, or with `setup` a match room the server runs itself. False if the id is taken. */
  async create(input: { roomId: string; name: string; host: { userId: string; name: string; teamId: string | null }; setup: MatchSetup | null; now: number }): Promise<boolean> {
    if (this.ready || hasTable(this.sql, 'room')) return false;
    const { roomId, name, host, setup, now } = input;
    const data = setup ? newMatchData(setup) : null;
    // A match read aloud with Rebound's voice: its questions are recorded while the players gather.
    if (data && setup!.mode === 'speech' && ttsSettings(this.env)) data.voice = { state: 'preparing', items: {}, sample: null, rate: playbackRate(setup!.wpm) };
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(SCHEMA);
      this.sql.exec(
        'INSERT INTO room (id, name, host_id, created_at, last_active, state, seq, buzz) VALUES (?, ?, ?, ?, ?, NULL, 0, ?)',
        roomId,
        name,
        host.userId,
        now,
        now,
        JSON.stringify(IDLE_BUZZ),
      );
      // The host is listed from the start, so the room can show who runs it before they connect.
      this.sql.exec('INSERT INTO members (user_id, name, team_id, side, captain, joined_at) VALUES (?, ?, ?, NULL, 0, ?)', host.userId, host.name, host.teamId, now);
      if (data) this.sql.exec('INSERT INTO match (one, data, due_at) VALUES (1, ?, NULL)', JSON.stringify(data));
    });
    this.ready = true;
    if (data) this.publishView(new MatchDirector(data).view());
    // Not awaited: the room answers at once, and its alarm goes on with the work if the object is evicted meanwhile.
    if (data?.voice) void this.prepareVoice();
    this.rescheduleAlarm();
    return true;
  }

  /** The room as its team's room list shows it, or null once it has closed. */
  async summary(now: number): Promise<RoomSummary | null> {
    if (await this.closeIfIdle(now)) return null;
    const room = this.room()!;
    const connected = this.connectedIds();
    const director = this.director();
    return {
      roomId: room.id,
      name: room.name,
      host: { userId: room.host_id, name: this.member(room.host_id)?.name ?? 'Someone' },
      // Players connected right now, not counting a reader (in a match room the host plays too).
      players: director ? connected.size : [...connected].filter((id) => id !== room.host_id).length,
      createdAt: room.created_at,
      kind: director ? 'match' : 'reader',
      ...(director ? { match: { format: director.data.setup.format, mode: director.data.setup.mode ?? 'text', status: director.data.status } } : {}),
    };
  }

  /** A session signed out: close its connections. */
  async closeSession(sid: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets(sessionTag(sid))) closeQuietly(ws, CLOSE_SIGNED_OUT, SIGNED_OUT);
  }

  /** An account was deleted: close its connections. */
  async closeUser(userId: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets(userTag(userId))) closeQuietly(ws, CLOSE_SIGNED_OUT, SIGNED_OUT);
  }

  /**
   * The host cancels a match that has not started: everyone in it is told, and the room closes for good (its team's
   * list drops it, and its link no longer opens it). A room that has already closed is cancelled already.
   */
  async cancel(userId: string, now: number): Promise<Result> {
    return refusing(async () => {
      if (await this.closeIfIdle(now)) return {};
      const director = this.director();
      if (!director) throw new HttpError(409, 'Only a match waiting to start can be cancelled.');
      if (this.room()!.host_id !== userId) throw new HttpError(403, 'Only the host can cancel this match.');
      if (director.data.status !== 'lobby') throw new HttpError(409, 'This match has started: end it from its page instead (the scores so far stand).');
      for (const ws of this.liveSockets()) closeQuietly(ws, CLOSE_CANCELLED, MATCH_CANCELLED);
      await this.closeForGood(now);
      return {};
    });
  }

  /* ---------------- HTTP: the WebSocket connection, forwarded with the user's identity ---------------- */

  async fetch(request: Request): Promise<Response> {
    try {
      const identity = identityOf(request);
      if (new URL(request.url).pathname !== '/connect') throw new HttpError(404, 'Not found.');
      return await this.openSocket(request, identity, Date.now());
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  // (Not named `connect`: DurableObject reserves that for TCP sockets.)
  private async openSocket(request: Request, identity: Identity, now: number): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      throw new HttpError(426, 'This address is for live room connections (WebSocket).');
    }
    if (await this.closeIfIdle(now)) return closedSocket();
    if (this.liveSockets().length >= MAX_SOCKETS) throw new HttpError(429, 'This room is full.');
    const room = this.room()!;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [userTag(identity.userId), sessionTag(identity.sid)]);
    const att: Attachment = { userId: identity.userId, sid: identity.sid, rtt: null, pingAt: null, lastPing: 0, chats: [], publishes: [] };
    server.serializeAttachment(att);

    // Names, subjects and teams come from the account at each connection (a match's end uses them).
    this.sql.exec(
      `INSERT INTO members (user_id, name, team_id, primary_subject, secondary_subject, side, captain, joined_at) VALUES (?, ?, ?, ?, ?, NULL, 0, ?)
       ON CONFLICT (user_id) DO UPDATE SET name = excluded.name, team_id = excluded.team_id,
         primary_subject = excluded.primary_subject, secondary_subject = excluded.secondary_subject`,
      identity.userId,
      identity.name,
      identity.teamId,
      identity.primarySubject ?? null,
      identity.secondarySubject ?? null,
      now,
    );
    this.sql.exec('UPDATE room SET last_active = ?', now);

    const connected = this.connectedIds();
    connected.add(identity.userId);
    send(server, {
      type: 'welcome',
      you: { memberId: identity.userId, name: identity.name, playerId: identity.userId },
      room: {
        roomId: room.id,
        name: room.name,
        kind: this.isMatch() ? 'match' : 'reader',
        hostId: room.host_id,
        members: this.memberList(connected),
        state: room.state === null ? null : JSON.parse(room.state),
        seq: room.seq,
        buzz: publicBuzz(parseBuzz(room.buzz)),
      },
      serverTime: now,
    });
    // Start measuring this connection's round-trip time right away.
    this.ping(server, att, now);
    this.broadcastMembers({ skip: server });
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ---------------- socket events ---------------- */

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (!this.ready) return closeQuietly(ws, CLOSE_ROOM_CLOSED, ROOM_CLOSED);
    try {
      this.message(ws, message, Date.now());
    } catch (error) {
      console.error('Room message failed:', error instanceof Error ? (error.stack ?? error.message) : String(error));
      send(ws, { type: 'error', message: 'Something went wrong on the Rebound server.' });
    }
  }

  webSocketClose(ws: WebSocket): void {
    if (this.ready) this.closed(ws, Date.now());
    // Completes the closing handshake on runtimes that do not reply to a close by themselves.
    closeQuietly(ws, 1000, 'Closed');
  }

  webSocketError(ws: WebSocket): void {
    if (this.ready) this.closed(ws, Date.now());
  }

  /** The backup for every timer, the retries of deliveries, and closing the room once it has been idle long enough. */
  async alarm(): Promise<void> {
    const now = Date.now();
    this.alarmAt = null;
    if (!this.ready) return;
    const window = parseBuzz(this.room()!.buzz).window;
    if (window && now >= window.endsAt) this.settle(now, false);
    const due = this.sql.exec<{ due_at: number | null }>('SELECT due_at FROM match').toArray()[0]?.due_at ?? null;
    if (due !== null && due <= now) this.runMatch(now);
    // Recording a match's questions goes on if the object was evicted while it ran.
    if (this.voicePreparing()) await this.prepareVoice();
    await this.flushOutbox();
    if (await this.closeIfIdle(Date.now())) return;
    this.rescheduleAlarm();
  }

  private message(ws: WebSocket, raw: string | ArrayBuffer, now: number): void {
    const att = attachmentOf(ws);
    if (!att) return closeQuietly(ws, 1011, 'Lost track of this connection. Please reconnect.');
    const member = this.member(att.userId);
    if (!member) return closeQuietly(ws, CLOSE_SIGNED_OUT, SIGNED_OUT);

    // A collection window may have ended while the object was asleep or evicted; decide it first.
    this.settle(now, true);
    const isMatch = this.isMatch();
    // Likewise anything a match had due (a reading that ended, a deadline that passed).
    if (isMatch) this.runMatch(now);

    if (typeof raw !== 'string') return refuse(ws, 'Send messages as JSON text.');
    if (raw.length > MAX_MESSAGE_CHARS) return refuse(ws, 'That message is too large.');
    let msg: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      msg = parsed as Record<string, unknown>;
    } catch {
      return refuse(ws, "That message isn't valid JSON.");
    }
    const room = this.room()!;
    // Keep a busy room's clock fresh (at most once a minute), so a long game is never mistaken for an idle room
    // if every connection drops at once, as on a server restart.
    if (now - room.last_active >= TOUCH_EVERY_MS) this.sql.exec('UPDATE room SET last_active = ?', now);
    const type = String(msg.type);
    const isHost = room.host_id === att.userId;
    if (isMatch && MATCH_SERVER_ONLY.has(type)) return refuse(ws, 'This room runs itself: there is no reader.');
    if (isMatch && MATCH_HOST_ONLY.has(type) && !isHost) return refuse(ws, 'Only the host can do that.');
    if (READER_ONLY.has(type) && !isHost) return refuse(ws, isMatch ? 'Only the host can do that.' : 'Only the reader can do that.');

    switch (msg.type) {
      case 'ping':
        return this.onPing(ws, att, msg, now);
      case 'pong':
        return this.onPong(ws, att, msg, now);
      case 'side':
        return this.onSide(ws, att, room, msg);
      case 'voice':
        return this.onVoice(ws, att, msg);
      case 'buzz':
        return this.onBuzz(ws, att, room, now);
      case 'chat':
        return this.onChat(ws, att, member, msg, now);
      case 'answer':
        return isMatch ? this.onMatchAnswer(ws, att, msg, now) : this.onAnswer(ws, att, member, room, msg, now);
      case 'ruling':
        if (!isMatch) break;
        return this.onRuling(ws, att, msg, now);
      case 'start':
      case 'pause':
      case 'resume':
      case 'end':
        if (!isMatch) break;
        return this.onMatchControl(ws, type, now);
      case 'publish':
        return this.onPublish(ws, att, room, msg, now);
      case 'open':
        return this.onOpen(ws, msg);
      case 'close':
        return this.onClose(room);
      case 'assign':
        return this.onAssign(ws, room, msg);
      case 'handover':
        return this.onHandover(ws, att, msg);
    }
    return refuse(ws, `Unknown message type: ${type.slice(0, 40)}.`);
  }

  /** A socket closed or failed: tell the room if its member has no other connection left. */
  private closed(ws: WebSocket, now: number): void {
    const att = attachmentOf(ws);
    if (!att || !this.room()) return;
    this.sql.exec('UPDATE room SET last_active = ?', now);
    const stillHere = this.liveSockets().some((s) => s !== ws && attachmentOf(s)?.userId === att.userId);
    if (!stillHere) this.broadcastMembers({ gone: ws });
    // A match pauses when its last player leaves, and a close call with nobody left to rule counts.
    if (this.isMatch()) this.runMatch(now, ws);
    // With everyone gone, the alarm will close the room after 6 hours.
    this.rescheduleAlarm(ws);
  }

  /* ---------------- client messages ---------------- */

  /** Answers the client's ping (for its clock offset), then pings back to measure the round trip ourselves. */
  private onPing(ws: WebSocket, att: Attachment, msg: Record<string, unknown>, now: number): void {
    if (typeof msg.t !== 'number' || !Number.isFinite(msg.t)) return refuse(ws, 'A ping needs the client time (t).');
    send(ws, { type: 'pong', t: msg.t, serverTime: now });
    // An unanswered ping stays valid for as long as its sample could count, so a connection slower than its own
    // ping interval still gets measured.
    const waiting = att.pingAt !== null && now - att.pingAt <= MAX_RTT_SAMPLE_MS;
    if (!waiting && now - att.lastPing >= SERVER_PING_GAP_MS) this.ping(ws, att, now);
  }

  private ping(ws: WebSocket, att: Attachment, now: number): void {
    att.pingAt = now;
    att.lastPing = now;
    ws.serializeAttachment(att);
    send(ws, { type: 'ping', t: now });
  }

  /**
   * A pong answering our latest ping gives one round-trip sample. The smoothed value starts from the first sample
   * and moves a quarter of the way toward each later one; samples above 3 seconds are ignored.
   */
  private onPong(ws: WebSocket, att: Attachment, msg: Record<string, unknown>, now: number): void {
    if (att.pingAt === null || msg.t !== att.pingAt) return; // stale or made up: ignore quietly
    const sample = now - att.pingAt;
    att.pingAt = null;
    if (sample >= 0 && sample <= MAX_RTT_SAMPLE_MS) att.rtt = att.rtt === null ? sample : att.rtt + RTT_WEIGHT * (sample - att.rtt);
    ws.serializeAttachment(att);
  }

  private onSide(ws: WebSocket, att: Attachment, room: RoomRow, msg: Record<string, unknown>): void {
    const side = parseSide(msg.side);
    if (side === undefined) return refuse(ws, 'Choose side A, side B, or no side.');
    if (this.isMatch()) {
      if (this.director()?.data.status !== 'lobby') return refuse(ws, 'Sides are set once the match starts.');
    } else if (room.host_id === att.userId) return refuse(ws, "The reader doesn't play on a side.");
    const current = this.member(att.userId);
    if (current?.side === side) return;
    // Changing sides gives up the captaincy of the old side.
    this.sql.exec('UPDATE members SET side = ?, captain = 0 WHERE user_id = ?', side, att.userId);
    this.broadcastMembers();
  }

  /**
   * A device says whether it can read questions aloud. In a match read aloud, a player whose device cannot sees the
   * text instead, and the others see that in the member list.
   */
  private onVoice(ws: WebSocket, att: Attachment, msg: Record<string, unknown>): void {
    if (typeof msg.ok !== 'boolean') return refuse(ws, 'Say whether this device can read aloud (ok: true or false).');
    if (att.voice === msg.ok) return;
    att.voice = msg.ok;
    ws.serializeAttachment(att);
    this.broadcastMembers();
  }

  private onBuzz(ws: WebSocket, att: Attachment, room: RoomRow, now: number): void {
    if (room.host_id === att.userId && !this.isMatch()) return refuse(ws, "The reader can't buzz.");
    const side = this.member(att.userId)?.side ?? null;
    if (side === null) return refuse(ws, 'Pick a side before buzzing.');
    const buzz = parseBuzz(room.buzz);
    if (!buzz.open) return refuse(ws, 'Buzzers are closed.');
    if (!buzz.sides[side]) return refuse(ws, 'Buzzers are closed for your side.');
    if (buzz.buzzed.includes(att.userId)) return refuse(ws, 'You already buzzed.');

    // Latency correction: the press happened about half a round trip before the message arrived.
    const entry: BuzzEntry = { memberId: att.userId, playerId: att.userId, side, pressedAt: now - (att.rtt ?? 0) / 2, receivedAt: now };
    buzz.buzzed.push(att.userId);
    if (buzz.window) {
      buzz.window.entries.push(entry);
    } else {
      buzz.window = { endsAt: now + BUZZ_WINDOW_MS, entries: [entry] };
      this.schedule(BUZZ_WINDOW_MS);
    }
    this.saveBuzz(buzz);
    if (buzz.window.entries.length === 1) this.rescheduleAlarm();
  }

  private onChat(ws: WebSocket, att: Attachment, member: MemberRow, msg: Record<string, unknown>, now: number): void {
    const text = cleanMessage(msg.text, MAX_CHAT_CHARS, true);
    if (text === null) return refuse(ws, `Chat messages are 1 to ${MAX_CHAT_CHARS} characters.`);
    const side = member.side;
    if (side === null) return refuse(ws, 'Join a side to use its team channel.');
    if (!allowRate(att.chats, now, CHATS_PER_SECOND)) return refuse(ws, "You're sending messages too fast.");
    ws.serializeAttachment(att);
    const out = JSON.stringify({ type: 'chat', from: { memberId: member.user_id, name: member.name }, side, text, at: now });
    // The team channel is private to the side: not the other side, not the reader.
    const sides = this.sidesByMember();
    for (const s of this.liveSockets()) {
      const other = attachmentOf(s);
      if (other && sides.get(other.userId) === side) send(s, out);
    }
  }

  private onAnswer(ws: WebSocket, att: Attachment, member: MemberRow, room: RoomRow, msg: Record<string, unknown>, now: number): void {
    if (!member.side || member.captain !== 1) return refuse(ws, "Only a side's captain can submit an answer.");
    const text = cleanMessage(msg.text, MAX_ANSWER_CHARS, false);
    if (text === null) return refuse(ws, `Answers are 1 to ${MAX_ANSWER_CHARS} characters.`);
    const out = JSON.stringify({ type: 'answer', from: { memberId: att.userId, name: member.name }, side: member.side, text, at: now });
    const sides = this.sidesByMember();
    for (const s of this.liveSockets()) {
      const other = attachmentOf(s);
      if (other && (other.userId === room.host_id || sides.get(other.userId) === member.side)) send(s, out);
    }
  }

  private onPublish(ws: WebSocket, att: Attachment, room: RoomRow, msg: Record<string, unknown>, now: number): void {
    if (!('state' in msg) || msg.state === undefined) return refuse(ws, 'Publish needs a state.');
    if (!allowRate(att.publishes, now, PUBLISHES_PER_SECOND)) return refuse(ws, 'Publishing too fast.');
    ws.serializeAttachment(att);
    if (nestsDeeperThan(msg.state, MAX_JSON_DEPTH)) return refuse(ws, 'That state is nested too deeply.');
    const text = JSON.stringify(msg.state);
    if (utf8Bytes(text) > MAX_STATE_BYTES) return refuse(ws, 'That state is too large (the limit is 64 KB).');
    const seq = room.seq + 1;
    this.sql.exec('UPDATE room SET state = ?, seq = ?', text, seq);
    this.broadcast(`{"type":"state","state":${text},"seq":${seq}}`);
  }

  private onOpen(ws: WebSocket, msg: Record<string, unknown>): void {
    const sides = msg.sides;
    if (!sides || typeof sides !== 'object' || Array.isArray(sides)) return refuse(ws, 'Say which sides to open: { A, B }.');
    const A = (sides as Record<string, unknown>).A === true;
    const B = (sides as Record<string, unknown>).B === true;
    // Opening starts fresh: no winner, nobody has buzzed, any pending window is dropped.
    this.cancelTimer();
    this.setBuzz({ open: A || B, sides: { A, B }, winner: null, buzzed: [], window: null });
  }

  private onClose(room: RoomRow): void {
    // Closing drops buzzes still being collected; a winner already announced stays until the next open.
    const buzz = parseBuzz(room.buzz);
    this.cancelTimer();
    this.setBuzz({ ...buzz, open: false, sides: { A: false, B: false }, window: null });
  }

  private onAssign(ws: WebSocket, room: RoomRow, msg: Record<string, unknown>): void {
    const userId = typeof msg.memberId === 'string' ? msg.memberId : '';
    const side = parseSide(msg.side);
    if (side === undefined) return refuse(ws, 'Choose side A, side B, or no side.');
    if (msg.captain !== undefined && typeof msg.captain !== 'boolean') return refuse(ws, 'captain must be true or false.');
    const target = this.member(userId);
    if (!target) return refuse(ws, "That member hasn't joined this room.");
    const isMatch = this.isMatch();
    if (isMatch && this.director()?.data.status !== 'lobby') return refuse(ws, 'Sides are set once the match starts.');
    if (!isMatch && userId === room.host_id) return refuse(ws, "The reader doesn't play on a side.");
    if (msg.captain === true && side === null) return refuse(ws, 'A captain needs a side.');
    // Without `captain`, a member keeps their captaincy only if they stay on the same side.
    const captain = side !== null && (msg.captain === undefined ? target.side === side && target.captain === 1 : msg.captain === true);
    if (captain) this.sql.exec('UPDATE members SET captain = 0 WHERE side = ?', side);
    this.sql.exec('UPDATE members SET side = ?, captain = ? WHERE user_id = ?', side, captain ? 1 : 0, userId);
    this.broadcastMembers();
  }

  private onHandover(ws: WebSocket, att: Attachment, msg: Record<string, unknown>): void {
    const userId = typeof msg.memberId === 'string' ? msg.memberId : '';
    if (userId === att.userId) return;
    if (!this.member(userId)) return refuse(ws, "That member hasn't joined this room.");
    if (!this.connectedIds().has(userId)) return refuse(ws, "That member isn't connected right now.");
    this.sql.exec('UPDATE room SET host_id = ?', userId);
    // The new reader leaves their side (in a match room the host plays like anyone else).
    if (!this.isMatch()) this.sql.exec('UPDATE members SET side = NULL, captain = 0 WHERE user_id = ?', userId);
    this.broadcastMembers();
  }

  /* ---------------- the buzz window ---------------- */

  private schedule(delay: number): void {
    this.cancelTimer();
    this.timer = setTimeout(
      () => {
        this.timer = null;
        try {
          if (this.ready) this.settle(Date.now(), false);
        } catch (e) {
          console.error('Deciding a buzz failed:', e instanceof Error ? e.message : String(e));
        }
      },
      Math.max(0, delay),
    );
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * Decides the window if it has ended: the earliest `pressedAt` wins, and on a tie the earlier arrival (entries
   * are in arrival order). The server then closes the buzzers and tells everyone. `strict` (used when a message
   * arrives) leaves a window that ends exactly now open, so a buzz received at the 150 ms mark still counts.
   */
  private settle(now: number, strict: boolean): void {
    const room = this.room();
    if (!room) return;
    const buzz = parseBuzz(room.buzz);
    if (!buzz.window) return;
    const due = strict ? now > buzz.window.endsAt : now >= buzz.window.endsAt;
    if (!due) {
      if (this.timer === null) this.schedule(buzz.window.endsAt - now);
      return;
    }
    let best = buzz.window.entries[0]!;
    for (const entry of buzz.window.entries) if (entry.pressedAt < best.pressedAt) best = entry;
    this.cancelTimer();
    this.setBuzz({
      open: false,
      sides: { A: false, B: false },
      winner: { memberId: best.memberId, playerId: best.playerId, side: best.side, pressedAt: best.pressedAt },
      buzzed: buzz.buzzed,
      window: null,
    });
    if (this.isMatch()) this.matchBuzz(best.memberId, best.pressedAt, now);
  }

  /** After the object wakes up: re-create the timers of a window still being collected and of a running match. */
  private resume(now: number): void {
    const window = parseBuzz(this.room()!.buzz).window;
    if (window) this.schedule(window.endsAt - now);
    const due = this.sql.exec<{ due_at: number | null }>('SELECT due_at FROM match').toArray()[0]?.due_at ?? null;
    if (due !== null) this.scheduleMatchTimer(due, now);
  }

  /**
   * One alarm backs up every timer: the buzz window or match deadline still ahead, the next delivery retry, and,
   * with nobody connected (`gone` is a socket that is closing), closing the room 6 hours after it was last active.
   */
  private rescheduleAlarm(gone?: WebSocket): void {
    if (!this.ready) return;
    const room = this.room();
    if (!room) return;
    const times: number[] = [];
    const window = parseBuzz(room.buzz).window;
    if (window) times.push(window.endsAt + ALARM_SLACK_MS);
    const due = this.sql.exec<{ due_at: number | null }>('SELECT due_at FROM match').toArray()[0]?.due_at ?? null;
    if (due !== null) times.push(due + ALARM_SLACK_MS);
    const retry = this.outbox.nextAt();
    if (retry !== null) times.push(retry);
    if (this.voicePreparing()) times.push(Date.now() + VOICE_WATCHDOG_MS);
    if (!this.liveSockets().some((ws) => ws !== gone)) times.push(room.last_active + ROOM_IDLE_MS);
    if (times.length === 0) return;
    const at = Math.min(...times);
    if (this.alarmAt === at) return;
    this.alarmAt = at;
    this.ctx.storage.setAlarm(at).catch((e: unknown) => console.error('setAlarm failed:', e));
  }

  /** Closes the room for good once nobody has been connected for 6 hours. True if it is closed. */
  private async closeIfIdle(now: number): Promise<boolean> {
    if (!this.ready) return true;
    const room = this.room();
    if (!room) return true;
    if (now - room.last_active < ROOM_IDLE_MS || this.liveSockets().length > 0) return false;
    await this.closeForGood(now);
    return true;
  }

  /** Closes the room for good: its storage is deleted (connections still open are the caller's to close). */
  private async closeForGood(now: number): Promise<void> {
    this.ready = false;
    this.cancelTimer();
    this.cancelMatchTimer();
    // A last try at deliveries that are still failing; the room's storage goes either way.
    if (this.outbox.pending() > 0) await this.outbox.flush((d) => this.deliver(d), now, true);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  /* ---------------- Rebound's voice for a match read aloud ---------------- */

  private voicePreparing(): boolean {
    return this.ready && this.director()?.data.voice?.state === 'preparing';
  }

  /** Records the match's questions (or finds them kept), a few at a time, then marks the voice ready. */
  private prepareVoice(): Promise<void> {
    if (!this.preparing) {
      this.preparing = this.recordQuestions()
        .catch((error: unknown) => console.error('Preparing the voice failed:', error instanceof Error ? error.message : String(error)))
        .finally(() => {
          this.preparing = null;
          this.rescheduleAlarm();
        });
    }
    return this.preparing;
  }

  private async recordQuestions(): Promise<void> {
    const settings = ttsSettings(this.env);
    const first = this.director();
    if (!first?.data.voice || first.data.voice.state !== 'preparing') return;
    const record = async (spoken: string): Promise<Recording | null> => {
      if (!settings) return null;
      const key = await audioKey(settings.voice, spoken);
      const ms = await voiceObject(this.env, key)
        .ensure(key, spoken)
        .catch(() => null);
      return ms === null ? null : { key, ms };
    };
    const todo = matchQuestions(first.data.setup).filter((q) => !(q.id in first.data.voice!.items));
    for (let i = 0; i < todo.length; i += VOICE_BATCH) {
      const batch = todo.slice(i, i + VOICE_BATCH);
      const done = await Promise.all(batch.map(async (q) => [q.id, await record(spokenFor(q))] as const));
      if (!this.saveVoice((v) => done.forEach(([id, r]) => (v.items[id] = r)))) return;
    }
    const sample = first.data.voice.sample ?? (await record(SAMPLE_TEXT));
    this.saveVoice((v) => {
      v.sample = sample;
      v.state = 'ready';
    });
  }

  /** Changes the match's voice and tells the room; false once the room or its preparing voice is gone. */
  private saveVoice(change: (v: MatchVoice) => void): boolean {
    if (!this.ready) return false;
    const director = this.director();
    const v = director?.data.voice;
    if (!director || !v || v.state !== 'preparing') return false;
    change(v);
    this.sql.exec('UPDATE match SET data = ?', JSON.stringify(director.data));
    this.publishView(director.view());
    return true;
  }

  /* ---------------- match rooms (no reader: the server runs the game) ---------------- */

  private isMatch(): boolean {
    return this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM match').one().n > 0;
  }

  private director(): MatchDirector | null {
    const row = this.sql.exec<{ data: string }>('SELECT data FROM match').toArray()[0];
    return row ? new MatchDirector(JSON.parse(row.data) as MatchData) : null;
  }

  /**
   * Applies whatever the match has due by `now`, then stores it and tells the room. Waits while a buzz is being
   * decided: `settle` runs the match with the winner, so nothing that happened after the press comes first.
   * `gone` is a socket that is closing.
   */
  private runMatch(now: number, gone?: WebSocket): void {
    const room = this.room();
    if (!room || parseBuzz(room.buzz).window) return;
    const director = this.director();
    if (!director) return;
    director.advance(now);
    this.syncMatch(director, now, gone);
  }

  private matchBuzz(userId: string, pressedAt: number, now: number): void {
    const director = this.director();
    if (!director) return;
    const problem = director.buzz(userId, pressedAt, now);
    if (problem) for (const ws of this.ctx.getWebSockets(userTag(userId))) refuse(ws, problem);
    this.syncMatch(director, now);
  }

  /** After the director changed: buzzers, results, the end of the match, storage, the view and the next timer. */
  private syncMatch(director: MatchDirector, now: number, gone?: WebSocket): void {
    const d = director.data;
    const connected = this.connectedIds(gone);
    if (d.status === 'playing') {
      // A close call nobody can rule on (the other side has left) counts.
      if (d.q?.review && !director.deciders().some((m) => connected.has(m))) director.acceptUnopposed(now);
      // With every player gone, the match waits before its next question for the host to go on.
      if (!d.paused && !d.players.some((p) => connected.has(p.memberId))) director.pause(now);
    }

    // The buzzers the match wants, unless a buzz is being decided.
    const buzz = parseBuzz(this.room()!.buzz);
    if (!buzz.window) {
      const want = director.buzzers();
      const same =
        buzz.open === want.open &&
        buzz.sides.A === want.sides.A &&
        buzz.sides.B === want.sides.B &&
        (!want.open || (buzz.winner === null && sameMembers(buzz.buzzed, want.exclude)));
      if (!same) this.setBuzz({ open: want.open, sides: want.sides, winner: want.open ? null : buzz.winner, buzzed: want.exclude, window: null });
    }

    // Each free-for-all answer is shown as it is judged, and kept for the players' accounts at the end.
    for (const result of d.outbox) {
      this.broadcast(JSON.stringify({ type: 'result', result }));
      this.sql.exec('INSERT INTO results (user_id, result) VALUES (?, ?)', result.memberId, JSON.stringify(result));
    }
    d.outbox = [];

    // The end: every player's answers go to their account, and a team match to its team's games.
    let over: string | null = null;
    if (d.status === 'finished' && !d.recorded) {
      d.recorded = true;
      let game: OnlineGameRecord | null = null;
      if (d.setup.format === 'teams' && d.startedAt !== null) {
        d.gameId = `g-online-${this.room()!.id}`;
        game = director.gameRecord(d.gameId);
      }
      if (d.startedAt !== null) this.recordResults(d, game, now);
      over = JSON.stringify({ type: 'match_over', format: d.setup.format, game, heard: director.heardQuestionIds(), players: d.players });
    }

    const due = director.nextDue();
    this.sql.exec('UPDATE match SET data = ?, due_at = ?', JSON.stringify(d), due);
    this.publishView(director.view());
    if (over) {
      // Devices fetch their player's answers when they hear the match is over, so the answers are sent first.
      const message = over;
      this.ctx.waitUntil(this.flushOutbox(true).finally(() => this.broadcast(message)));
    }
    this.scheduleMatchTimer(due, now);
  }

  /**
   * Queues each player's answers for their account: a team match's outcomes from its game record (as for a Reader
   * console game), a free-for-all's judged answers. A team match whose players are all on the host's team also goes
   * to that team's games (the team checks the players are its members).
   */
  private recordResults(d: MatchData, game: OnlineGameRecord | null, now: number): void {
    const roomId = this.room()!.id;
    const members = new Map(this.sql.exec<MemberRow>('SELECT * FROM members').toArray().map((m) => [m.user_id, m]));
    let outcomes: Outcome[] = [];
    if (game) {
      const players: Player[] = d.players.map((p) => {
        const m = members.get(p.memberId);
        return {
          id: p.playerId,
          name: p.name,
          role: 'member',
          active: true,
          ...(m?.primary_subject ? { primarySubject: m.primary_subject } : {}),
          ...(m?.secondary_subject ? { secondarySubject: m.secondary_subject } : {}),
        };
      });
      try {
        outcomes = gameOutcomes(game, players);
      } catch (error) {
        console.error('Scoring a finished match failed:', error instanceof Error ? error.message : String(error));
      }
    } else {
      for (const row of this.sql.exec<{ result: string }>('SELECT result FROM results ORDER BY n')) {
        const r = JSON.parse(row.result) as AnswerResult;
        outcomes.push({
          key: `match:${roomId}:${r.questionId}`,
          playerId: r.playerId,
          questionId: r.questionId,
          subject: r.subject,
          kind: r.kind,
          correct: r.correct,
          interrupt: r.interrupt,
          latencyMs: r.latencyMs,
          t: r.t,
          via: 'game',
        });
      }
    }
    for (const p of d.players) {
      const mine = outcomes.filter((o) => o.playerId === p.playerId);
      if (mine.length > 0) this.outbox.add('answers', p.playerId, mine, now);
    }
    if (game) {
      const host = this.room()!.host_id;
      const teamId = members.get(host)?.team_id ?? null;
      if (teamId !== null && d.players.every((p) => members.get(p.memberId)?.team_id === teamId)) this.outbox.add('game', teamId, { record: game, by: host }, now);
    }
  }

  private async flushOutbox(all = false): Promise<void> {
    if (!this.ready) return;
    await this.outbox.flush((d) => this.deliver(d), Date.now(), all);
    this.rescheduleAlarm();
  }

  private async deliver(d: Delivery): Promise<void> {
    const payload = JSON.parse(d.payload);
    if (d.kind === 'answers') await userObject(this.env, d.target).putAnswers(payload as Outcome[]);
    else if (d.kind === 'game') await teamObject(this.env, d.target).putOnlineGame(payload.record, payload.by);
  }

  /** Stores the view and sends it to the room, unless it is unchanged. */
  private publishView(view: object): void {
    const room = this.room();
    if (!room) return;
    const text = JSON.stringify(view);
    if (room.state === text) return;
    const seq = room.seq + 1;
    this.sql.exec('UPDATE room SET state = ?, seq = ?', text, seq);
    this.broadcast(`{"type":"state","state":${text},"seq":${seq}}`);
  }

  private scheduleMatchTimer(due: number | null, now: number): void {
    this.cancelMatchTimer();
    if (due !== null) {
      this.matchTimer = setTimeout(
        () => {
          this.matchTimer = null;
          try {
            if (this.ready) this.runMatch(Date.now());
          } catch (e) {
            console.error('Running a match failed:', e instanceof Error ? (e.stack ?? e.message) : String(e));
          }
        },
        Math.max(0, due - now),
      );
    }
    this.rescheduleAlarm();
  }

  private cancelMatchTimer(): void {
    if (this.matchTimer !== null) clearTimeout(this.matchTimer);
    this.matchTimer = null;
  }

  private onMatchAnswer(ws: WebSocket, att: Attachment, msg: Record<string, unknown>, now: number): void {
    const text = cleanMessage(msg.text, MAX_ANSWER_CHARS, false);
    if (text === null) return refuse(ws, `Answers are 1 to ${MAX_ANSWER_CHARS} characters.`);
    const director = this.director();
    if (!director) return;
    const connected = this.connectedIds();
    // The captain gives the bonus answer; if the captain has dropped out, any teammate may.
    const mayAnswerBonus = (userId: string) => {
      const side = director.player(userId)?.side;
      const captain = side ? director.captainOf(side) : undefined;
      return !captain || captain.memberId === userId || !connected.has(captain.memberId);
    };
    const problem = director.answer(att.userId, text, now, mayAnswerBonus);
    if (problem) refuse(ws, problem);
    this.syncMatch(director, now);
  }

  private onRuling(ws: WebSocket, att: Attachment, msg: Record<string, unknown>, now: number): void {
    if (typeof msg.accept !== 'boolean') return refuse(ws, 'A ruling is accept: true or false.');
    const director = this.director();
    if (!director) return;
    const problem = director.ruling(att.userId, msg.accept, now);
    if (problem) refuse(ws, problem);
    this.syncMatch(director, now);
  }

  private onMatchControl(ws: WebSocket, type: string, now: number): void {
    const director = this.director();
    if (!director) return;
    if (type === 'start') {
      const problem = director.start(this.matchPlayers(), now);
      if (problem) return refuse(ws, problem);
      if (director.data.setup.format === 'ffa') this.sql.exec("UPDATE members SET side = 'A', captain = 0 WHERE side IS NOT NULL");
      else for (const p of director.data.players) this.sql.exec('UPDATE members SET captain = ? WHERE user_id = ?', p.captain ? 1 : 0, p.memberId);
      this.broadcastMembers();
    } else if (type === 'pause') director.pause(now);
    else if (type === 'resume') director.resume(now);
    else director.end(now);
    this.syncMatch(director, now);
  }

  /** The players on the sides when the match starts. Any signed-in user can play: their user id is their player id. */
  private matchPlayers(): MatchPlayer[] {
    return this.sql
      .exec<MemberRow>('SELECT * FROM members WHERE side IS NOT NULL ORDER BY joined_at, user_id')
      .toArray()
      .map((r) => ({ memberId: r.user_id, playerId: r.user_id, name: r.name, side: r.side!, captain: r.captain === 1 }));
  }

  /* ---------------- helpers ---------------- */

  private room(): RoomRow | null {
    return this.sql.exec<RoomRow>('SELECT * FROM room').toArray()[0] ?? null;
  }

  private member(userId: string): MemberRow | null {
    return this.sql.exec<MemberRow>('SELECT * FROM members WHERE user_id = ?', userId).toArray()[0] ?? null;
  }

  private sidesByMember(): Map<string, Side | null> {
    return new Map(this.sql.exec<MemberRow>('SELECT user_id, side FROM members').toArray().map((r) => [r.user_id, r.side]));
  }

  private liveSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter(isLive);
  }

  private connectedIds(gone?: WebSocket): Set<string> {
    const ids = new Set<string>();
    for (const ws of this.liveSockets()) {
      const att = ws === gone ? null : attachmentOf(ws);
      if (att) ids.add(att.userId);
    }
    return ids;
  }

  /**
   * Who is in the room. `readsText`: everyone connected for that member said their device cannot read aloud (one
   * device that can is enough to listen on).
   */
  private memberList(connected: Set<string>, gone?: WebSocket) {
    const voices = new Map<string, boolean[]>();
    for (const ws of this.liveSockets()) {
      const att = ws === gone ? null : attachmentOf(ws);
      if (att && att.voice !== undefined) voices.set(att.userId, [...(voices.get(att.userId) ?? []), att.voice]);
    }
    return this.sql
      .exec<MemberRow>('SELECT * FROM members ORDER BY joined_at, user_id')
      .toArray()
      .map((r) => {
        const said = voices.get(r.user_id);
        const readsText = !!said && said.length > 0 && !said.includes(true);
        return { memberId: r.user_id, name: r.name, playerId: r.user_id, side: r.side, captain: r.captain === 1, connected: connected.has(r.user_id), ...(readsText ? { readsText: true } : {}) };
      });
  }

  /** Sends the member list to the room. `gone` is a socket that is closing; `skip` already has the list. */
  private broadcastMembers(options: { gone?: WebSocket; skip?: WebSocket } = {}): void {
    const room = this.room();
    if (!room) return;
    const text = JSON.stringify({ type: 'members', members: this.memberList(this.connectedIds(options.gone), options.gone), hostId: room.host_id });
    for (const ws of this.liveSockets()) if (ws !== options.gone && ws !== options.skip) send(ws, text);
  }

  private broadcast(text: string): void {
    for (const ws of this.liveSockets()) send(ws, text);
  }

  private saveBuzz(buzz: BuzzState): void {
    this.sql.exec('UPDATE room SET buzz = ?', JSON.stringify(buzz));
  }

  /** Stores the buzz state and tells everyone. */
  private setBuzz(buzz: BuzzState): void {
    this.saveBuzz(buzz);
    this.broadcast(JSON.stringify({ type: 'buzz', buzz: publicBuzz(buzz) }));
  }
}

/** Reads the stored buzz state into fresh objects (callers modify the result before saving it). */
function parseBuzz(text: string): BuzzState {
  const stored = JSON.parse(text) as Partial<BuzzState>;
  return {
    open: stored.open === true,
    sides: { A: stored.sides?.A === true, B: stored.sides?.B === true },
    winner: stored.winner ?? null,
    buzzed: Array.isArray(stored.buzzed) ? [...stored.buzzed] : [],
    window: stored.window ? { endsAt: stored.window.endsAt, entries: [...stored.window.entries] } : null,
  };
}

function publicBuzz(buzz: BuzzState) {
  return { open: buzz.open, sides: buzz.sides, winner: buzz.winner };
}

function refuse(ws: WebSocket, message: string): void {
  send(ws, { type: 'error', message });
}

/** Chat keeps line breaks; answers are one line. Control characters are refused either way. */
function cleanMessage(value: unknown, maxChars: number, multiline: boolean): string | null {
  if (typeof value !== 'string') return null;
  let text = value.normalize('NFC').replace(/\r\n?/g, '\n');
  text = multiline ? text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : text.replace(/\s+/gu, ' ').trim();
  const chars = [...text].length;
  if (chars < 1 || chars > maxChars) return null;
  if (/[\u0000-\u0009\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/.test(text)) return null;
  return text;
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
