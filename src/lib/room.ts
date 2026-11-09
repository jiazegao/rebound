/**
 * The device side of a remote room (docs/SERVER.md, "Rooms"; docs/ACCOUNTS.md, "Online matches and rooms"): a
 * WebSocket client that keeps the room's members, the reader's published view, the buzzer state, the team channel
 * and the captain's answers, and estimates this device's clock offset from the server so a text reveal lines up on
 * every screen. Any signed-in player can be in a room; a member's `memberId` and `playerId` are both their user id.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

export type Side = 'A' | 'B';

export interface RoomMember {
  memberId: string;
  name: string;
  playerId: string | null;
  side: Side | null;
  captain: boolean;
  connected: boolean;
  /** A match read aloud: this member's device has no voice, so they see the text instead. */
  readsText?: boolean;
}

export interface BuzzState {
  open: boolean;
  sides: { A: boolean; B: boolean };
  winner: null | { memberId: string; playerId: string | null; side: Side; pressedAt: number };
}

/** A match room's extra view (server/src/match.ts, MatchView): the server runs the game, with no reader. */
export interface MatchInfo {
  format: 'teams' | 'ffa';
  /** How players get the questions: on screen ("text"), or read aloud by each device ("speech"). */
  mode?: 'text' | 'speech';
  status: 'lobby' | 'playing' | 'finished';
  /** The match waits before its next question (the host paused it, or everyone left). */
  paused: boolean;
  progress?: { n: number; of: number };
  /** Who is typing an answer now, and until when (server time). */
  answering?: { memberId: string; name: string; deadline: number; kind: 'tossup' | 'bonus' };
  /** A close call waiting for a ruling: the other side ('A' or 'B') decides, or everyone else ('others'). */
  review?: { memberId: string; name: string; response: string; deadline: number; deciders: Side | 'others' };
  /** Free-for-all scores, best first. */
  standings?: Array<{ memberId: string; name: string; score: number; correct: number; negs: number }>;
  /** Team matches: the game clock. */
  clock?: { remainingMs: number; runningSince: number | null };
  /** The toss-up's answer, shown while its bonus begins. */
  /** In a match read aloud, with the toss-up's text too (it never showed while it was read). */
  previous?: { label: string; answer: string; text?: string };
  /** Team matches: the game record's id, once finished. */
  gameId?: string;
  /**
   * A match read aloud with Rebound's voice: how far the recordings are ('preparing' until each question is
   * recorded), the lobby's sample, and once ready every recording, to fetch ahead.
   */
  voice?: { state: 'preparing' | 'ready'; done: number; total: number; rate: number; sample?: string; keys?: string[] };
}

/** One judged answer in a free-for-all (the server also writes it to the player's account). */
export interface MatchResult {
  memberId: string;
  playerId: string;
  questionId: string;
  subject: string;
  kind: 'tossup' | 'bonus';
  correct: boolean;
  interrupt: boolean;
  latencyMs: number | null;
  t: number;
}

/** The end of a match: a team match's game record (null for a free-for-all) and the questions heard. */
export interface MatchOver {
  format: 'teams' | 'ffa';
  game: unknown;
  heard: string[];
  players: Array<{ memberId: string; playerId: string; name: string; side: Side }>;
}

/** What the reader (or, in a match room, the server) publishes for the players' screens. */
export interface RoomView {
  phase: string;
  /** "Toss-up 3 of 25", "Bonus 3". */
  label: string;
  subject?: string;
  /** The question, once the players may see it (text reveal, or after it was read aloud). */
  text?: string;
  /**
   * Text reveal: when the reading started (server time) and how fast it runs; `pausedAt` stops it there. `audio`: in a
   * match read aloud with Rebound's voice, the question's recording and how fast it plays.
   */
  reading?: { startedAt: number; wpm: number; pausedAt?: number; audio?: { key: string; rate: number } };
  /** An answer window: when it opened (server time) and how long it lasts. */
  window?: { openedAt: number; seconds: number };
  teams: [string, string];
  scores: [number, number];
  /** Which side is playing the bonus (0 or 1), if any. */
  bonusTeam?: 0 | 1;
  /** Plain-language line, e.g. "Ann buzzed" or "Correct: 4 points to Team A". */
  status?: string;
  /** The answer, once the question is over. */
  answer?: string;
  /** A visual bonus: the question whose figure to show (each device loads it from its own data). */
  figure?: { questionId: string };
  /** The question on screen. */
  questionId?: string;
  /** Match rooms only. */
  match?: MatchInfo;
}

export interface ChatLine {
  from: { memberId: string; name: string };
  side: Side;
  text: string;
  at: number;
}

/** Why the room's connection ended for good (this device stops reconnecting). */
export interface RoomEnd {
  title: string;
  message: string;
}

/** The server's close codes that end the connection for good (server/src/room.ts). */
const FINAL_CLOSES: Record<number, RoomEnd> = {
  4001: { title: 'Signed out', message: 'You are signed out. Sign in again, then open the room link again.' },
  4003: { title: 'Not in this room', message: 'You can no longer be in this room.' },
  4004: { title: 'This game has closed', message: 'It has closed, or the link isn’t right. Ask the host for a new link.' },
  4005: { title: 'Match cancelled', message: 'The host cancelled this match before it started.' },
};

export interface RoomSnapshot {
  connected: boolean;
  /** A refusal or a connection problem, shown for a moment. */
  error: string | null;
  /** Set once the connection has ended for good: the room closed, the host cancelled the match, or signed out. */
  ended: RoomEnd | null;
  you: { memberId: string; name: string; playerId: string | null } | null;
  roomName: string;
  /** "match": the server runs the game (no reader). Null until the welcome arrives. */
  kind: 'reader' | 'match' | null;
  hostId: string | null;
  members: RoomMember[];
  view: RoomView | null;
  buzz: BuzzState;
  chat: ChatLine[];
  answers: ChatLine[];
}

const EMPTY_BUZZ: BuzzState = { open: false, sides: { A: false, B: false }, winner: null };

export class RoomClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private snap: RoomSnapshot = { connected: false, error: null, ended: null, you: null, roomName: '', kind: null, hostId: null, members: [], view: null, buzz: EMPTY_BUZZ, chat: [], answers: [] };
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private retry = 0;
  private closed = false;
  /** Best clock offset (server − local) from the ping with the shortest round trip among recent ones. */
  private samples: Array<{ rtt: number; offset: number }> = [];
  /** Called with each buzz winner (the reader's console records it). */
  onWinner: ((w: NonNullable<BuzzState['winner']>) => void) | null = null;
  /** Match rooms: each judged free-for-all answer, and the end of the match. */
  onResult: ((r: MatchResult) => void) | null = null;
  onMatchOver: ((m: MatchOver) => void) | null = null;

  /** `url` comes from api.roomSocketUrl. */
  constructor(private readonly url: string) {}

  get snapshot(): RoomSnapshot {
    return this.snap;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(fields: Partial<RoomSnapshot>) {
    this.snap = { ...this.snap, ...fields };
    for (const l of this.listeners) l();
  }

  /** This device's estimate of the server clock. */
  serverNow(): number {
    if (this.samples.length === 0) return Date.now();
    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    return Date.now() + best.offset;
  }

  connect(): void {
    this.closed = false;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.set({ connected: true, error: null });
      this.ping();
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.ping(), 3_000);
    };
    ws.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onclose = (e) => {
      clearInterval(this.pingTimer);
      this.set({ connected: false });
      if (this.closed) return;
      // The server's own reasons for closing: don't keep reconnecting.
      const ended = FINAL_CLOSES[e.code];
      if (ended) {
        this.closed = true;
        this.set({ ended, error: null });
        return;
      }
      // Reconnect with backoff (a school network can drop the connection now and then).
      this.retry = Math.min(this.retry + 1, 6);
      setTimeout(() => !this.closed && this.connect(), 500 * 2 ** this.retry);
    };
    ws.onerror = () => this.set({ error: "The room connection failed. Check the connection; Rebound keeps trying." });
  }

  close(): void {
    this.closed = true;
    clearInterval(this.pingTimer);
    this.ws?.close();
  }

  /** This device ended the room itself (the host cancelled the match): disconnect, and say why. */
  endHere(ended: RoomEnd): void {
    this.close();
    this.set({ ended, error: null });
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private ping(): void {
    this.send({ type: 'ping', t: Date.now() });
  }

  private handle(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'ping':
        // The server measures this connection's round trip to time buzzes fairly: answer at once.
        this.send({ type: 'pong', t: msg.t });
        break;
      case 'welcome': {
        const room = msg.room as { name: string; kind?: 'reader' | 'match'; hostId: string; members: RoomMember[]; state: RoomView | null; buzz: BuzzState };
        this.set({
          you: msg.you as RoomSnapshot['you'],
          roomName: room.name,
          kind: room.kind ?? 'reader',
          hostId: room.hostId,
          members: room.members,
          view: room.state ?? null,
          buzz: room.buzz ?? EMPTY_BUZZ,
        });
        break;
      }
      case 'pong': {
        const t = Number(msg.t);
        const now = Date.now();
        const rtt = now - t;
        if (rtt >= 0 && rtt < 3_000) {
          this.samples = [...this.samples.slice(-7), { rtt, offset: Number(msg.serverTime) - (t + rtt / 2) }];
        }
        break;
      }
      case 'members':
        this.set({ members: msg.members as RoomMember[], hostId: (msg.hostId as string) ?? this.snap.hostId });
        break;
      case 'state':
        this.set({ view: msg.state as RoomView });
        break;
      case 'buzz': {
        const buzz = msg.buzz as BuzzState;
        const fresh = buzz.winner && (!this.snap.buzz.winner || this.snap.buzz.winner.pressedAt !== buzz.winner.pressedAt || this.snap.buzz.winner.memberId !== buzz.winner.memberId);
        this.set({ buzz });
        if (fresh && buzz.winner) this.onWinner?.(buzz.winner);
        break;
      }
      case 'chat':
        this.set({ chat: [...this.snap.chat.slice(-99), msg as unknown as ChatLine] });
        break;
      case 'answer':
        this.set({ answers: [...this.snap.answers.slice(-19), msg as unknown as ChatLine] });
        break;
      case 'error':
        this.set({ error: String(msg.message ?? 'The room refused that.') });
        break;
      case 'result':
        this.onResult?.(msg.result as MatchResult);
        break;
      case 'match_over':
        this.onMatchOver?.(msg as unknown as MatchOver);
        break;
    }
  }

  /** Clears the last error (after the player has seen it). */
  clearError = () => this.set({ error: null });

  // Players
  buzz = () => this.send({ type: 'buzz' });
  chooseSide = (side: Side | null) => this.send({ type: 'side', side });
  /** Whether this device can read questions aloud (matches read aloud); the room shows who reads the text instead. */
  voice = (ok: boolean) => this.send({ type: 'voice', ok });
  chat = (text: string) => this.send({ type: 'chat', text: text.slice(0, 500) });
  answer = (text: string) => this.send({ type: 'answer', text: text.slice(0, 200) });
  ruling = (accept: boolean) => this.send({ type: 'ruling', accept });
  // A match room's host
  start = () => this.send({ type: 'start' });
  pause = () => this.send({ type: 'pause' });
  resume = () => this.send({ type: 'resume' });
  end = () => this.send({ type: 'end' });
  // The reader
  publish = (state: RoomView) => this.send({ type: 'publish', state });
  open = (sides: { A: boolean; B: boolean }) => this.send({ type: 'open', sides });
  closeBuzzers = () => this.send({ type: 'close' });
  assign = (memberId: string, side: Side | null, captain?: boolean) => this.send({ type: 'assign', memberId, side, captain });
  handover = (memberId: string) => this.send({ type: 'handover', memberId });
}

/** Connect to a room while the component is mounted. Pass null to stay disconnected. */
export function useRoom(url: string | null): { client: RoomClient | null; snapshot: RoomSnapshot | null } {
  const [client, setClient] = useState<RoomClient | null>(null);
  useEffect(() => {
    if (!url) return;
    const c = new RoomClient(url);
    c.connect();
    setClient(c);
    return () => {
      c.close();
      setClient(null);
    };
  }, [url]);
  const snapshot = useSyncExternalStore(
    (l) => (client ? client.subscribe(l) : () => undefined),
    () => (client ? client.snapshot : null),
  );
  return { client, snapshot };
}
