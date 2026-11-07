/**
 * The device side of a remote room (docs/SERVER.md, "Rooms"): a WebSocket client that keeps the
 * room's members, the reader's published view, the buzzer state, the team channel and the captain's
 * answers, and estimates this device's clock offset from the server so a text reveal lines up on
 * every screen.
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
}

export interface BuzzState {
  open: boolean;
  sides: { A: boolean; B: boolean };
  winner: null | { memberId: string; playerId: string | null; side: Side; pressedAt: number };
}

/** What the reader publishes for the players' screens. */
export interface RoomView {
  phase: string;
  /** "Toss-up 3 of 25", "Bonus 3". */
  label: string;
  subject?: string;
  /** The question, once the players may see it (text reveal, or after it was read aloud). */
  text?: string;
  /** Text reveal: when the reading started (server time) and how fast it runs. */
  reading?: { startedAt: number; wpm: number };
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
}

export interface ChatLine {
  from: { memberId: string; name: string };
  side: Side;
  text: string;
  at: number;
}

export interface RoomSnapshot {
  connected: boolean;
  error: string | null;
  you: { memberId: string; name: string; playerId: string | null } | null;
  roomName: string;
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
  private snap: RoomSnapshot = { connected: false, error: null, you: null, roomName: '', hostId: null, members: [], view: null, buzz: EMPTY_BUZZ, chat: [], answers: [] };
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private retry = 0;
  private closed = false;
  /** Best clock offset (server − local) from the ping with the shortest round trip among recent ones. */
  private samples: Array<{ rtt: number; offset: number }> = [];
  /** Called with each buzz winner (the reader's console records it). */
  onWinner: ((w: NonNullable<BuzzState['winner']>) => void) | null = null;

  constructor(private readonly url: string) {}

  static url(serverUrl: string, teamId: string, roomId: string, token: string): string {
    const base = serverUrl.replace(/^http/, 'ws');
    return `${base}/api/teams/${encodeURIComponent(teamId)}/rooms/${encodeURIComponent(roomId)}/ws?token=${encodeURIComponent(token)}`;
  }

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
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      this.set({ connected: false });
      if (this.closed) return;
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

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private ping(): void {
    this.send({ type: 'ping', t: Date.now() });
  }

  private handle(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'welcome': {
        const room = msg.room as { name: string; hostId: string; members: RoomMember[]; state: RoomView | null; buzz: BuzzState };
        this.set({ you: msg.you as RoomSnapshot['you'], roomName: room.name, hostId: room.hostId, members: room.members, view: room.state ?? null, buzz: room.buzz ?? EMPTY_BUZZ });
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
    }
  }

  // Players
  buzz = () => this.send({ type: 'buzz' });
  chooseSide = (side: Side | null) => this.send({ type: 'side', side });
  chat = (text: string) => this.send({ type: 'chat', text: text.slice(0, 500) });
  answer = (text: string) => this.send({ type: 'answer', text: text.slice(0, 200) });
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
