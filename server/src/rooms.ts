/**
 * Live rooms (docs/SERVER.md, "Rooms"). In a reader room the reader's browser runs the game; the server relays
 * the reader's view, decides who buzzed first and carries each side's private channel. In a match room there is no
 * reader: the server runs the game itself (match.ts) and publishes the view.
 *
 * Sockets use the WebSocket Hibernation API: between messages the object may sleep or be evicted, so nothing
 * lives only in memory. Room state (host, sides and captains, the latest published state and its seq, the buzz
 * window) is in SQLite; each socket's own state (its round-trip time, rate limits) is in its attachment. The
 * only in-memory state is the 150 ms collection timer, which `resume` re-creates from SQLite after a wake-up
 * (an alarm backs it up in case the object is evicted with nothing else to wake it).
 */

import { newId } from './crypto';
import { HttpError, json } from './http';
import { MatchDirector, newMatchData, type MatchData, type MatchPlayer, type MatchSetup, type OnlineGameRecord } from './match';
import { putRecord } from './records';
import type { MemberRow, Store } from './store';
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
export const MAX_ROOMS = 20;
const MAX_SOCKETS_PER_ROOM = 64;
const MAX_MESSAGE_CHARS = 70_000;
const MAX_CHAT_CHARS = 500;
const MAX_ANSWER_CHARS = 200;
const CHATS_PER_SECOND = 5;
/** Not in the spec: a safety limit so a runaway reader page cannot flood everyone. */
const PUBLISHES_PER_SECOND = 10;
/** The server pings a socket at most this often (it pings after each client ping). */
const SERVER_PING_GAP_MS = 1000;
/** The backup alarm fires this long after a collection window should have ended. */
const ALARM_SLACK_MS = 500;
/** A room's last-active time is refreshed at most this often while messages arrive. */
const TOUCH_EVERY_MS = 60 * 1000;

export type Side = 'A' | 'B';

interface Winner {
  memberId: string;
  playerId: string | null;
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

type RoomRow = {
  id: string;
  name: string;
  host_id: string;
  created_at: number;
  last_active: number;
  state: string | null;
  seq: number;
  buzz: string;
};

type RoomMemberRow = { member_id: string; side: Side | null; captain: number };

/** What each socket remembers about itself; survives hibernation (and must stay under 2 KB). */
interface Attachment {
  roomId: string;
  memberId: string;
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
}

/** Messages only the room's reader (host) may send. */
const READER_ONLY = new Set(['publish', 'open', 'close', 'assign', 'handover']);
/** In a match room the server itself publishes and runs the buzzers. */
const MATCH_SERVER_ONLY = new Set(['publish', 'open', 'close']);
/** Match rooms: the host's controls. */
const MATCH_HOST_ONLY = new Set(['start', 'pause', 'resume', 'end']);

const roomTag = (roomId: string) => `room:${roomId}`;
export const memberTag = (memberId: string) => `member:${memberId}`;
export const sessionTag = (sid: string) => `sid:${sid}`;

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

export function closeQuietly(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
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

export class Rooms {
  /** Collection timers by room id. Lost on eviction; `resume` and the alarm recover them from SQLite. */
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Match timers by room id (the next reading end, deadline...), recovered the same way. */
  private readonly matchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private matchTableReady = false;
  /** The alarm last set, so an unchanged one is not set again. */
  private alarmAt: number | null = null;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly store: Store,
  ) {}

  private get sql(): SqlStorage {
    return this.store.sql;
  }

  /* ---------------- HTTP: create, list, connect ---------------- */

  /** A reader room, or with `setup` a match room the server runs itself. */
  create(host: MemberRow, name: string, now: number, setup: MatchSetup | null = null): Response {
    this.closeIdleRooms(now);
    const open = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM rooms').one().n;
    if (open >= MAX_ROOMS) {
      throw new HttpError(429, `Your team already has ${MAX_ROOMS} open rooms. Rooms close 6 hours after everyone leaves.`);
    }
    const roomId = newId(12);
    this.sql.exec(
      'INSERT INTO rooms (id, name, host_id, created_at, last_active, state, seq, buzz) VALUES (?, ?, ?, ?, ?, NULL, 0, ?)',
      roomId,
      name,
      host.id,
      now,
      now,
      JSON.stringify(IDLE_BUZZ),
    );
    if (setup) {
      this.ensureMatches();
      const data = newMatchData(setup);
      this.sql.exec('INSERT INTO matches (room_id, data, due_at) VALUES (?, ?, NULL)', roomId, JSON.stringify(data));
      this.publishView(roomId, new MatchDirector(data).view());
    }
    return json({ roomId }, 201);
  }

  list(now: number): Response {
    this.closeIdleRooms(now);
    const connected = new Map<string, Set<string>>();
    for (const ws of this.ctx.getWebSockets()) {
      const att = isLive(ws) ? attachmentOf(ws) : null;
      if (!att) continue;
      if (!connected.has(att.roomId)) connected.set(att.roomId, new Set());
      connected.get(att.roomId)!.add(att.memberId);
    }
    this.ensureMatches();
    const rows = this.sql
      .exec<{ id: string; name: string; host_id: string; created_at: number; host_name: string | null; format: string | null; status: string | null }>(
        `SELECT r.id, r.name, r.host_id, r.created_at, m.name AS host_name,
                json_extract(x.data, '$.setup.format') AS format, json_extract(x.data, '$.status') AS status
         FROM rooms r LEFT JOIN members m ON m.id = r.host_id LEFT JOIN matches x ON x.room_id = r.id
         ORDER BY r.created_at DESC`,
      )
      .toArray();
    const rooms = rows.map((r) => {
      const here = connected.get(r.id) ?? new Set<string>();
      return {
        roomId: r.id,
        name: r.name,
        host: { memberId: r.host_id, name: r.host_name ?? 'A former member' },
        // Players connected right now, not counting a reader (in a match room the host plays too).
        players: r.format ? here.size : [...here].filter((id) => id !== r.host_id).length,
        createdAt: r.created_at,
        kind: r.format ? ('match' as const) : ('reader' as const),
        ...(r.format ? { match: { format: r.format, status: r.status } } : {}),
      };
    });
    return json({ rooms });
  }

  connect(request: Request, member: MemberRow, sid: string, roomId: string, now: number): Response {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      throw new HttpError(426, 'This address is for live room connections (WebSocket).');
    }
    this.closeIdleRooms(now);
    const room = this.room(roomId);
    if (!room) throw new HttpError(404, 'This room has closed. Ask your reader for the new room.');
    if (this.liveSockets(roomId).length >= MAX_SOCKETS_PER_ROOM) throw new HttpError(429, 'This room is full.');

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [roomTag(roomId), memberTag(member.id), sessionTag(sid)]);
    const att: Attachment = { roomId, memberId: member.id, sid, rtt: null, pingAt: null, lastPing: 0, chats: [], publishes: [] };
    server.serializeAttachment(att);

    this.sql.exec(
      'INSERT INTO room_members (room_id, member_id, side, captain, joined_at) VALUES (?, ?, NULL, 0, ?) ON CONFLICT DO NOTHING',
      roomId,
      member.id,
      now,
    );
    this.sql.exec('UPDATE rooms SET last_active = ? WHERE id = ?', now, roomId);

    const connected = this.connectedIds(roomId);
    connected.add(member.id);
    send(server, {
      type: 'welcome',
      you: { memberId: member.id, name: member.name, playerId: member.player_id },
      room: {
        roomId,
        name: room.name,
        kind: this.isMatch(roomId) ? 'match' : 'reader',
        hostId: room.host_id,
        members: this.memberList(roomId, connected),
        state: room.state === null ? null : JSON.parse(room.state),
        seq: room.seq,
        buzz: publicBuzz(parseBuzz(room.buzz)),
      },
      serverTime: now,
    });
    // Start measuring this connection's round-trip time right away.
    this.ping(server, att, now);
    this.broadcastMembers(roomId, { skip: server });
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ---------------- socket events ---------------- */

  message(ws: WebSocket, raw: string | ArrayBuffer, now: number): void {
    const att = attachmentOf(ws);
    if (!att) return closeQuietly(ws, 1011, 'Lost track of this connection. Please reconnect.');
    const member = this.store.memberById(att.memberId);
    if (!member) return closeQuietly(ws, 4003, 'You are no longer on this team.');
    if (!this.room(att.roomId)) return closeQuietly(ws, 4004, 'This room has closed.');

    // A collection window may have ended while the object was asleep or evicted; decide it first.
    this.settle(att.roomId, now, true);
    const isMatch = this.isMatch(att.roomId);
    // Likewise anything a match had due (a reading that ended, a deadline that passed).
    if (isMatch) this.runMatch(att.roomId, now);

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
    const room = this.room(att.roomId)!;
    // Keep a busy room's clock fresh (at most once a minute), so a long game is never mistaken for an idle room
    // if every connection drops at once, as on a server restart.
    if (now - room.last_active >= TOUCH_EVERY_MS) this.sql.exec('UPDATE rooms SET last_active = ? WHERE id = ?', now, room.id);
    const type = String(msg.type);
    if (isMatch && MATCH_SERVER_ONLY.has(type)) return refuse(ws, 'This room runs itself: there is no reader.');
    if (isMatch && MATCH_HOST_ONLY.has(type) && room.host_id !== att.memberId) return refuse(ws, 'Only the host can do that.');
    if (READER_ONLY.has(type) && room.host_id !== att.memberId) return refuse(ws, isMatch ? 'Only the host can do that.' : 'Only the reader can do that.');

    switch (msg.type) {
      case 'ping':
        return this.onPing(ws, att, msg, now);
      case 'pong':
        return this.onPong(ws, att, msg, now);
      case 'side':
        return this.onSide(ws, att, room, msg);
      case 'buzz':
        return this.onBuzz(ws, att, member, room, now);
      case 'chat':
        return this.onChat(ws, att, member, room, msg, now);
      case 'answer':
        return isMatch ? this.onMatchAnswer(ws, att, room, msg, now) : this.onAnswer(ws, att, member, room, msg, now);
      case 'ruling':
        if (!isMatch) break;
        return this.onRuling(ws, att, room, msg, now);
      case 'start':
      case 'pause':
      case 'resume':
      case 'end':
        if (!isMatch) break;
        return this.onMatchControl(ws, room, type, now);
      case 'publish':
        return this.onPublish(ws, att, room, msg, now);
      case 'open':
        return this.onOpen(ws, room, msg);
      case 'close':
        return this.onClose(room);
      case 'assign':
        return this.onAssign(ws, room, msg);
      case 'handover':
        return this.onHandover(ws, att, room, msg);
    }
    return refuse(ws, `Unknown message type: ${type.slice(0, 40)}.`);
  }

  /** A socket closed or failed: tell the room if its member has no other connection left. */
  closed(ws: WebSocket, now: number): void {
    const att = attachmentOf(ws);
    if (!att || !this.room(att.roomId)) return;
    this.sql.exec('UPDATE rooms SET last_active = ? WHERE id = ?', now, att.roomId);
    const stillHere = this.liveSockets(att.roomId).some((s) => s !== ws && attachmentOf(s)?.memberId === att.memberId);
    if (!stillHere) this.broadcastMembers(att.roomId, { gone: ws });
    // A match pauses when its last player leaves, and a close call with nobody left to rule counts.
    if (this.isMatch(att.roomId)) this.runMatch(att.roomId, now, ws);
  }

  /* ---------------- client messages ---------------- */

  /** Answers the client's ping (for its clock offset), then pings back to measure the round trip ourselves. */
  private onPing(ws: WebSocket, att: Attachment, msg: Record<string, unknown>, now: number): void {
    if (typeof msg.t !== 'number' || !Number.isFinite(msg.t)) return refuse(ws, 'A ping needs the client time (t).');
    send(ws, { type: 'pong', t: msg.t, serverTime: now });
    // An unanswered ping stays valid for as long as its sample could count, so a connection slower than its
    // own ping interval still gets measured.
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
   * A pong answering our latest ping gives one round-trip sample. The smoothed value starts from the first
   * sample and moves a quarter of the way toward each later one; samples above 3 seconds are ignored.
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
    if (this.isMatch(room.id)) {
      if (this.director(room.id)?.data.status !== 'lobby') return refuse(ws, 'Sides are set once the match starts.');
    } else if (room.host_id === att.memberId) return refuse(ws, "The reader doesn't play on a side.");
    const current = this.roomMember(room.id, att.memberId);
    if (current?.side === side) return;
    // Changing sides gives up the captaincy of the old side.
    this.sql.exec('UPDATE room_members SET side = ?, captain = 0 WHERE room_id = ? AND member_id = ?', side, room.id, att.memberId);
    this.broadcastMembers(room.id);
  }

  private onBuzz(ws: WebSocket, att: Attachment, member: MemberRow, room: RoomRow, now: number): void {
    if (room.host_id === att.memberId && !this.isMatch(room.id)) return refuse(ws, "The reader can't buzz.");
    const side = this.roomMember(room.id, att.memberId)?.side ?? null;
    if (side === null) return refuse(ws, 'Pick a side before buzzing.');
    const buzz = parseBuzz(room.buzz);
    if (!buzz.open) return refuse(ws, 'Buzzers are closed.');
    if (!buzz.sides[side]) return refuse(ws, 'Buzzers are closed for your side.');
    if (buzz.buzzed.includes(att.memberId)) return refuse(ws, 'You already buzzed.');

    // Latency correction: the press happened about half a round trip before the message arrived.
    const entry: BuzzEntry = {
      memberId: att.memberId,
      playerId: member.player_id,
      side,
      pressedAt: now - (att.rtt ?? 0) / 2,
      receivedAt: now,
    };
    buzz.buzzed.push(att.memberId);
    if (buzz.window) {
      buzz.window.entries.push(entry);
    } else {
      buzz.window = { endsAt: now + BUZZ_WINDOW_MS, entries: [entry] };
      this.schedule(room.id, BUZZ_WINDOW_MS);
    }
    this.saveBuzz(room.id, buzz);
    if (buzz.window.entries.length === 1) this.rescheduleAlarm();
  }

  private onChat(ws: WebSocket, att: Attachment, member: MemberRow, room: RoomRow, msg: Record<string, unknown>, now: number): void {
    const text = cleanMessage(msg.text, MAX_CHAT_CHARS, true);
    if (text === null) return refuse(ws, `Chat messages are 1 to ${MAX_CHAT_CHARS} characters.`);
    const side = this.roomMember(room.id, att.memberId)?.side ?? null;
    if (side === null) return refuse(ws, 'Join a side to use its team channel.');
    if (!allowRate(att.chats, now, CHATS_PER_SECOND)) return refuse(ws, "You're sending messages too fast.");
    ws.serializeAttachment(att);
    const out = JSON.stringify({ type: 'chat', from: { memberId: member.id, name: member.name }, side, text, at: now });
    // The team channel is private to the side: not the other side, not the reader.
    const sides = this.sidesByMember(room.id);
    for (const s of this.liveSockets(room.id)) {
      const other = attachmentOf(s);
      if (other && sides.get(other.memberId) === side) send(s, out);
    }
  }

  private onAnswer(ws: WebSocket, att: Attachment, member: MemberRow, room: RoomRow, msg: Record<string, unknown>, now: number): void {
    const me = this.roomMember(room.id, att.memberId);
    if (!me?.side || me.captain !== 1) return refuse(ws, "Only a side's captain can submit an answer.");
    const text = cleanMessage(msg.text, MAX_ANSWER_CHARS, false);
    if (text === null) return refuse(ws, `Answers are 1 to ${MAX_ANSWER_CHARS} characters.`);
    const out = JSON.stringify({ type: 'answer', from: { memberId: member.id, name: member.name }, side: me.side, text, at: now });
    const sides = this.sidesByMember(room.id);
    for (const s of this.liveSockets(room.id)) {
      const other = attachmentOf(s);
      if (other && (other.memberId === room.host_id || sides.get(other.memberId) === me.side)) send(s, out);
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
    this.sql.exec('UPDATE rooms SET state = ?, seq = ? WHERE id = ?', text, seq, room.id);
    this.broadcast(room.id, `{"type":"state","state":${text},"seq":${seq}}`);
  }

  private onOpen(ws: WebSocket, room: RoomRow, msg: Record<string, unknown>): void {
    const sides = msg.sides;
    if (!sides || typeof sides !== 'object' || Array.isArray(sides)) return refuse(ws, 'Say which sides to open: { A, B }.');
    const A = (sides as Record<string, unknown>).A === true;
    const B = (sides as Record<string, unknown>).B === true;
    // Opening starts fresh: no winner, nobody has buzzed, any pending window is dropped.
    this.cancelTimer(room.id);
    this.setBuzz(room.id, { open: A || B, sides: { A, B }, winner: null, buzzed: [], window: null });
  }

  private onClose(room: RoomRow): void {
    // Closing drops buzzes still being collected; a winner already announced stays until the next open.
    const buzz = parseBuzz(room.buzz);
    this.cancelTimer(room.id);
    this.setBuzz(room.id, { ...buzz, open: false, sides: { A: false, B: false }, window: null });
  }

  private onAssign(ws: WebSocket, room: RoomRow, msg: Record<string, unknown>): void {
    const memberId = typeof msg.memberId === 'string' ? msg.memberId : '';
    const side = parseSide(msg.side);
    if (side === undefined) return refuse(ws, 'Choose side A, side B, or no side.');
    if (msg.captain !== undefined && typeof msg.captain !== 'boolean') return refuse(ws, 'captain must be true or false.');
    const target = this.roomMember(room.id, memberId);
    if (!target) return refuse(ws, "That member hasn't joined this room.");
    const isMatch = this.isMatch(room.id);
    if (isMatch && this.director(room.id)?.data.status !== 'lobby') return refuse(ws, 'Sides are set once the match starts.');
    if (!isMatch && memberId === room.host_id) return refuse(ws, "The reader doesn't play on a side.");
    if (msg.captain === true && side === null) return refuse(ws, 'A captain needs a side.');
    // Without `captain`, a member keeps their captaincy only if they stay on the same side.
    const captain = side !== null && (msg.captain === undefined ? target.side === side && target.captain === 1 : msg.captain === true);
    if (captain) this.sql.exec('UPDATE room_members SET captain = 0 WHERE room_id = ? AND side = ?', room.id, side);
    this.sql.exec(
      'UPDATE room_members SET side = ?, captain = ? WHERE room_id = ? AND member_id = ?',
      side,
      captain ? 1 : 0,
      room.id,
      memberId,
    );
    this.broadcastMembers(room.id);
  }

  private onHandover(ws: WebSocket, att: Attachment, room: RoomRow, msg: Record<string, unknown>): void {
    const memberId = typeof msg.memberId === 'string' ? msg.memberId : '';
    if (memberId === att.memberId) return;
    if (!this.roomMember(room.id, memberId)) return refuse(ws, "That member hasn't joined this room.");
    if (!this.connectedIds(room.id).has(memberId)) return refuse(ws, "That member isn't connected right now.");
    this.sql.exec('UPDATE rooms SET host_id = ? WHERE id = ?', memberId, room.id);
    // The new reader leaves their side (in a match room the host plays like anyone else).
    if (!this.isMatch(room.id)) this.sql.exec('UPDATE room_members SET side = NULL, captain = 0 WHERE room_id = ? AND member_id = ?', room.id, memberId);
    this.broadcastMembers(room.id);
  }

  /* ---------------- the buzz window ---------------- */

  private schedule(roomId: string, delay: number): void {
    this.cancelTimer(roomId);
    const timer = setTimeout(() => {
      this.timers.delete(roomId);
      try {
        this.settle(roomId, Date.now(), false);
      } catch (e) {
        console.error('Deciding a buzz failed:', e instanceof Error ? e.message : String(e));
      }
    }, Math.max(0, delay));
    this.timers.set(roomId, timer);
  }

  private cancelTimer(roomId: string): void {
    const timer = this.timers.get(roomId);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(roomId);
  }

  /**
   * Decides the window if it has ended: the earliest `pressedAt` wins, and on a tie the earlier arrival (entries
   * are in arrival order). The server then closes the buzzers and tells everyone. `strict` (used when a message
   * arrives) leaves a window that ends exactly now open, so a buzz received at the 150 ms mark still counts.
   */
  private settle(roomId: string, now: number, strict: boolean): void {
    const room = this.room(roomId);
    if (!room) return;
    const buzz = parseBuzz(room.buzz);
    if (!buzz.window) return;
    const due = strict ? now > buzz.window.endsAt : now >= buzz.window.endsAt;
    if (!due) {
      if (!this.timers.has(roomId)) this.schedule(roomId, buzz.window.endsAt - now);
      return;
    }
    let best = buzz.window.entries[0]!;
    for (const entry of buzz.window.entries) if (entry.pressedAt < best.pressedAt) best = entry;
    this.cancelTimer(roomId);
    this.setBuzz(roomId, {
      open: false,
      sides: { A: false, B: false },
      winner: { memberId: best.memberId, playerId: best.playerId, side: best.side, pressedAt: best.pressedAt },
      buzzed: buzz.buzzed,
      window: null,
    });
    if (this.isMatch(roomId)) this.matchBuzz(roomId, best.memberId, best.pressedAt, now);
  }

  /** After the object wakes up: re-create the timers of windows still being collected and of running matches. */
  resume(now: number): void {
    for (const { id, buzz } of this.sql.exec<{ id: string; buzz: string }>('SELECT id, buzz FROM rooms').toArray()) {
      const window = parseBuzz(buzz).window;
      if (window) this.schedule(id, window.endsAt - now);
    }
    this.ensureMatches();
    for (const { room_id, due_at } of this.sql.exec<{ room_id: string; due_at: number }>('SELECT room_id, due_at FROM matches WHERE due_at IS NOT NULL').toArray()) {
      this.scheduleMatchTimer(room_id, due_at, now);
    }
  }

  /** The backup alarm: decide any window and run any match whose timer was lost; keep an alarm while work remains. */
  alarm(now: number): void {
    this.alarmAt = null;
    for (const { id, buzz } of this.sql.exec<{ id: string; buzz: string }>('SELECT id, buzz FROM rooms').toArray()) {
      const window = parseBuzz(buzz).window;
      if (window && now >= window.endsAt) this.settle(id, now, false);
    }
    this.ensureMatches();
    for (const { room_id } of this.sql.exec<{ room_id: string }>('SELECT room_id FROM matches WHERE due_at IS NOT NULL AND due_at <= ?', now).toArray()) {
      this.runMatch(room_id, now);
    }
    this.rescheduleAlarm();
  }

  /** One alarm backs up every timer: the earliest buzz window or match deadline still ahead. */
  private rescheduleAlarm(): void {
    let next: number | null = null;
    for (const { buzz } of this.sql.exec<{ buzz: string }>('SELECT buzz FROM rooms').toArray()) {
      const window = parseBuzz(buzz).window;
      if (window) next = Math.min(next ?? Infinity, window.endsAt);
    }
    this.ensureMatches();
    const due = this.sql.exec<{ due: number | null }>('SELECT MIN(due_at) AS due FROM matches').one().due;
    if (due !== null) next = Math.min(next ?? Infinity, due);
    if (next === null) return;
    const at = next + ALARM_SLACK_MS;
    if (this.alarmAt === at) return;
    this.alarmAt = at;
    this.ctx.storage.setAlarm(at).catch((e: unknown) => console.error('setAlarm failed:', e));
  }

  /* ---------------- match rooms (no reader: the server runs the game) ---------------- */

  /** Teams created before online matches have no matches table yet. */
  private ensureMatches(): void {
    if (this.matchTableReady) return;
    this.sql.exec('CREATE TABLE IF NOT EXISTS matches (room_id TEXT PRIMARY KEY, data TEXT NOT NULL, due_at INTEGER)');
    this.matchTableReady = true;
  }

  private isMatch(roomId: string): boolean {
    this.ensureMatches();
    return this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM matches WHERE room_id = ?', roomId).one().n > 0;
  }

  private director(roomId: string): MatchDirector | null {
    this.ensureMatches();
    const row = this.sql.exec<{ data: string }>('SELECT data FROM matches WHERE room_id = ?', roomId).toArray()[0];
    return row ? new MatchDirector(JSON.parse(row.data) as MatchData) : null;
  }

  /**
   * Applies whatever the match has due by `now`, then stores it and tells the room. Waits while a buzz is being
   * decided: `settle` runs the match with the winner, so nothing that happened after the press comes first.
   * `gone` is a socket that is closing.
   */
  private runMatch(roomId: string, now: number, gone?: WebSocket): void {
    const room = this.room(roomId);
    if (!room || parseBuzz(room.buzz).window) return;
    const director = this.director(roomId);
    if (!director) return;
    director.advance(now);
    this.syncMatch(room, director, now, gone);
  }

  private matchBuzz(roomId: string, memberId: string, pressedAt: number, now: number): void {
    const room = this.room(roomId);
    const director = this.director(roomId);
    if (!room || !director) return;
    const problem = director.buzz(memberId, pressedAt, now);
    if (problem) for (const ws of this.ctx.getWebSockets(memberTag(memberId))) if (attachmentOf(ws)?.roomId === roomId) refuse(ws, problem);
    this.syncMatch(room, director, now);
  }

  /** After the director changed: buzzers, results, the end of the match, storage, the view and the next timer. */
  private syncMatch(room: RoomRow, director: MatchDirector, now: number, gone?: WebSocket): void {
    const d = director.data;
    const connected = this.connectedIds(room.id, gone);
    if (d.status === 'playing') {
      // A close call nobody can rule on (the other side has left) counts.
      if (d.q?.review && !director.deciders().some((m) => connected.has(m))) director.acceptUnopposed(now);
      // With every player gone, the match waits before its next question for the host to go on.
      if (!d.paused && !d.players.some((p) => connected.has(p.memberId))) director.pause(now);
    }

    // The buzzers the match wants, unless a buzz is being decided.
    const fresh = this.room(room.id)!;
    const buzz = parseBuzz(fresh.buzz);
    if (!buzz.window) {
      const want = director.buzzers();
      const same =
        buzz.open === want.open &&
        buzz.sides.A === want.sides.A &&
        buzz.sides.B === want.sides.B &&
        (!want.open || (buzz.winner === null && sameMembers(buzz.buzzed, want.exclude)));
      if (!same) this.setBuzz(room.id, { open: want.open, sides: want.sides, winner: want.open ? null : buzz.winner, buzzed: want.exclude, window: null });
    }

    // Each free-for-all answer goes to the devices: each records its own player's as practice.
    for (const result of d.outbox) this.broadcast(room.id, JSON.stringify({ type: 'result', result }));
    d.outbox = [];

    // The end: a team match becomes a game record every device syncs; the devices record their own results.
    let over: string | null = null;
    if (d.status === 'finished' && !d.recorded) {
      d.recorded = true;
      let game: OnlineGameRecord | null = null;
      if (d.setup.format === 'teams' && d.startedAt !== null) {
        d.gameId = `g-online-${room.id}`;
        const record = director.gameRecord(d.gameId);
        if (record) this.ctx.storage.transactionSync(() => putRecord(this.store, 'games', record.id, record, room.host_id));
        game = record;
      }
      over = JSON.stringify({ type: 'match_over', format: d.setup.format, game, heard: director.heardQuestionIds(), players: d.players });
    }

    const due = director.nextDue();
    this.sql.exec('UPDATE matches SET data = ?, due_at = ? WHERE room_id = ?', JSON.stringify(d), due, room.id);
    this.publishView(room.id, director.view());
    if (over) this.broadcast(room.id, over);
    this.scheduleMatchTimer(room.id, due, now);
  }

  /** Stores the view and sends it to the room, unless it is unchanged. */
  private publishView(roomId: string, view: object): void {
    const room = this.room(roomId);
    if (!room) return;
    const text = JSON.stringify(view);
    if (room.state === text) return;
    const seq = room.seq + 1;
    this.sql.exec('UPDATE rooms SET state = ?, seq = ? WHERE id = ?', text, seq, roomId);
    this.broadcast(roomId, `{"type":"state","state":${text},"seq":${seq}}`);
  }

  private scheduleMatchTimer(roomId: string, due: number | null, now: number): void {
    this.cancelMatchTimer(roomId);
    if (due !== null) {
      const timer = setTimeout(
        () => {
          this.matchTimers.delete(roomId);
          try {
            this.runMatch(roomId, Date.now());
          } catch (e) {
            console.error('Running a match failed:', e instanceof Error ? (e.stack ?? e.message) : String(e));
          }
        },
        Math.max(0, due - now),
      );
      this.matchTimers.set(roomId, timer);
    }
    this.rescheduleAlarm();
  }

  private cancelMatchTimer(roomId: string): void {
    const timer = this.matchTimers.get(roomId);
    if (timer !== undefined) clearTimeout(timer);
    this.matchTimers.delete(roomId);
  }

  private onMatchAnswer(ws: WebSocket, att: Attachment, room: RoomRow, msg: Record<string, unknown>, now: number): void {
    const text = cleanMessage(msg.text, MAX_ANSWER_CHARS, false);
    if (text === null) return refuse(ws, `Answers are 1 to ${MAX_ANSWER_CHARS} characters.`);
    const director = this.director(room.id);
    if (!director) return;
    const connected = this.connectedIds(room.id);
    // The captain gives the bonus answer; if the captain has dropped out, any teammate may.
    const mayAnswerBonus = (memberId: string) => {
      const side = director.player(memberId)?.side;
      const captain = side ? director.captainOf(side) : undefined;
      return !captain || captain.memberId === memberId || !connected.has(captain.memberId);
    };
    const problem = director.answer(att.memberId, text, now, mayAnswerBonus);
    if (problem) refuse(ws, problem);
    this.syncMatch(this.room(room.id)!, director, now);
  }

  private onRuling(ws: WebSocket, att: Attachment, room: RoomRow, msg: Record<string, unknown>, now: number): void {
    if (typeof msg.accept !== 'boolean') return refuse(ws, 'A ruling is accept: true or false.');
    const director = this.director(room.id);
    if (!director) return;
    const problem = director.ruling(att.memberId, msg.accept, now);
    if (problem) refuse(ws, problem);
    this.syncMatch(this.room(room.id)!, director, now);
  }

  private onMatchControl(ws: WebSocket, room: RoomRow, type: string, now: number): void {
    const director = this.director(room.id);
    if (!director) return;
    if (type === 'start') {
      const players = this.matchPlayers(room.id, director.data.setup.format);
      if (typeof players === 'string') return refuse(ws, players);
      const problem = director.start(players, now);
      if (problem) return refuse(ws, problem);
      if (director.data.setup.format === 'ffa') this.sql.exec("UPDATE room_members SET side = 'A', captain = 0 WHERE room_id = ? AND side IS NOT NULL", room.id);
      else for (const p of director.data.players) this.sql.exec('UPDATE room_members SET captain = ? WHERE room_id = ? AND member_id = ?', p.captain ? 1 : 0, room.id, p.memberId);
      this.broadcastMembers(room.id);
    } else if (type === 'pause') director.pause(now);
    else if (type === 'resume') director.resume(now);
    else director.end(now);
    this.syncMatch(this.room(room.id)!, director, now);
  }

  /** The players on the sides when the match starts. Each needs a roster player, so the results are theirs. */
  private matchPlayers(roomId: string, format: MatchSetup['format']): MatchPlayer[] | string {
    const rows = this.sql
      .exec<{ member_id: string; name: string; player_id: string | null; side: Side | null; captain: number }>(
        `SELECT rm.member_id, m.name, m.player_id, rm.side, rm.captain
         FROM room_members rm JOIN members m ON m.id = rm.member_id
         WHERE rm.room_id = ? AND rm.side IS NOT NULL ORDER BY rm.joined_at, rm.member_id`,
        roomId,
      )
      .toArray();
    const unlinked = rows.find((r) => r.player_id === null);
    if (unlinked) {
      return `${unlinked.name} isn't linked to a player on the team's roster yet, so their results would have nowhere to go. They can pick their name when they next sign in, or ${format === 'teams' ? 'leave their side' : 'watch instead'}.`;
    }
    return rows.map((r) => ({ memberId: r.member_id, playerId: r.player_id!, name: r.name, side: r.side!, captain: r.captain === 1 }));
  }

  /* ---------------- team events ---------------- */

  /** A member was removed from the team: drop them from rooms, close their sockets, tell the rooms. */
  memberRemoved(memberId: string): void {
    const rooms = this.sql.exec<{ room_id: string }>('SELECT room_id FROM room_members WHERE member_id = ?', memberId).toArray();
    this.sql.exec('DELETE FROM room_members WHERE member_id = ?', memberId);
    this.closeTagged(memberTag(memberId), 4003, 'You are no longer on this team.');
    for (const { room_id } of rooms) if (this.room(room_id)) this.broadcastMembers(room_id);
  }

  /** A member's details changed (their roster player): refresh the member lists of their rooms. */
  memberChanged(memberId: string): void {
    const rooms = this.sql.exec<{ room_id: string }>('SELECT room_id FROM room_members WHERE member_id = ?', memberId).toArray();
    for (const { room_id } of rooms) if (this.room(room_id)) this.broadcastMembers(room_id);
  }

  closeTagged(tag: string, code: number, reason: string): void {
    for (const ws of this.ctx.getWebSockets(tag)) closeQuietly(ws, code, reason);
  }

  /** The team is being deleted: stop timers and close every socket. */
  shutdown(reason: string): void {
    for (const timer of [...this.timers.values(), ...this.matchTimers.values()]) clearTimeout(timer);
    this.timers.clear();
    this.matchTimers.clear();
    for (const ws of this.ctx.getWebSockets()) closeQuietly(ws, 4004, reason);
  }

  /* ---------------- helpers ---------------- */

  private room(roomId: string): RoomRow | null {
    return this.sql.exec<RoomRow>('SELECT * FROM rooms WHERE id = ?', roomId).toArray()[0] ?? null;
  }

  private roomMember(roomId: string, memberId: string): RoomMemberRow | null {
    return (
      this.sql
        .exec<RoomMemberRow>('SELECT member_id, side, captain FROM room_members WHERE room_id = ? AND member_id = ?', roomId, memberId)
        .toArray()[0] ?? null
    );
  }

  private sidesByMember(roomId: string): Map<string, Side | null> {
    const rows = this.sql.exec<RoomMemberRow>('SELECT member_id, side, captain FROM room_members WHERE room_id = ?', roomId);
    return new Map([...rows].map((r) => [r.member_id, r.side]));
  }

  /** Rooms with nobody connected for 6 hours are closed (deleted) whenever rooms are listed, made or joined. */
  private closeIdleRooms(now: number): void {
    const idle = this.sql.exec<{ id: string }>('SELECT id FROM rooms WHERE last_active < ?', now - ROOM_IDLE_MS).toArray();
    for (const { id } of idle) {
      if (this.liveSockets(id).length > 0) continue;
      this.cancelTimer(id);
      this.cancelMatchTimer(id);
      this.sql.exec('DELETE FROM room_members WHERE room_id = ?', id);
      this.sql.exec('DELETE FROM rooms WHERE id = ?', id);
      this.ensureMatches();
      this.sql.exec('DELETE FROM matches WHERE room_id = ?', id);
    }
  }

  private liveSockets(roomId: string): WebSocket[] {
    return this.ctx.getWebSockets(roomTag(roomId)).filter(isLive);
  }

  private connectedIds(roomId: string, gone?: WebSocket): Set<string> {
    const ids = new Set<string>();
    for (const ws of this.liveSockets(roomId)) {
      const att = ws === gone ? null : attachmentOf(ws);
      if (att) ids.add(att.memberId);
    }
    return ids;
  }

  private memberList(roomId: string, connected: Set<string>) {
    return this.sql
      .exec<{ member_id: string; name: string; player_id: string | null; side: Side | null; captain: number }>(
        `SELECT rm.member_id, m.name, m.player_id, rm.side, rm.captain
         FROM room_members rm JOIN members m ON m.id = rm.member_id
         WHERE rm.room_id = ? ORDER BY rm.joined_at, rm.member_id`,
        roomId,
      )
      .toArray()
      .map((r) => ({
        memberId: r.member_id,
        name: r.name,
        playerId: r.player_id,
        side: r.side,
        captain: r.captain === 1,
        connected: connected.has(r.member_id),
      }));
  }

  /** Sends the member list to the room. `gone` is a socket that is closing; `skip` already has the list. */
  private broadcastMembers(roomId: string, options: { gone?: WebSocket; skip?: WebSocket } = {}): void {
    const room = this.room(roomId);
    if (!room) return;
    const members = this.memberList(roomId, this.connectedIds(roomId, options.gone));
    const text = JSON.stringify({ type: 'members', members, hostId: room.host_id });
    for (const ws of this.liveSockets(roomId)) if (ws !== options.gone && ws !== options.skip) send(ws, text);
  }

  private broadcast(roomId: string, text: string): void {
    for (const ws of this.liveSockets(roomId)) send(ws, text);
  }

  private saveBuzz(roomId: string, buzz: BuzzState): void {
    this.sql.exec('UPDATE rooms SET buzz = ? WHERE id = ?', JSON.stringify(buzz), roomId);
  }

  /** Stores the buzz state and tells everyone. */
  private setBuzz(roomId: string, buzz: BuzzState): void {
    this.saveBuzz(roomId, buzz);
    this.broadcast(roomId, JSON.stringify({ type: 'buzz', buzz: publicBuzz(buzz) }));
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
