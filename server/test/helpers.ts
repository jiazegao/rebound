/** Helpers for end-to-end tests: every call goes through the real Worker and Durable Object in workerd. */

import { exports } from 'cloudflare:workers';
import { expect } from 'vitest';
import type { PushChange, SyncResponse } from '../../src/core/sync';

export const BASE = 'https://rebound.test';
/** In ALLOWED_ORIGINS (wrangler.toml). */
export const SITE = 'http://localhost:5173';

// Test responses are loosely typed on purpose: the assertions check their shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export interface ApiResult {
  status: number;
  body: Json;
  headers: Headers;
}

export interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
}

export async function call(path: string, options: CallOptions = {}): Promise<ApiResult> {
  const headers = new Headers(options.headers);
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  let body: string | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set('Content-Type', 'application/json');
  }
  const response = await exports.default.fetch(`${BASE}${path}`, {
    method: options.method ?? (body === undefined ? 'GET' : 'POST'),
    headers,
    body,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

export interface TestTeam {
  teamId: string;
  joinCode: string;
  secret: string;
  /** The captain who created the team. */
  token: string;
  member: Json;
}

export async function createTeam(input: Record<string, unknown> = {}): Promise<TestTeam> {
  const res = await call('/api/teams', {
    body: { teamName: 'Ridgeview Science Bowl', level: 'HS', memberName: 'Cora Captain', pin: '2468', playerId: 'p-cora', ...input },
  });
  expect(res.status).toBe(201);
  const joinCode: string = res.body.joinCode;
  return { teamId: res.body.teamId, joinCode, secret: joinCode.split('.')[1]!, token: res.body.token, member: res.body.member };
}

/** Joins (or signs in). Each call comes from `ip` (CF-Connecting-IP), so tests can play several networks. */
export function join(teamId: string, body: Record<string, unknown>, ip = '198.51.100.7'): Promise<ApiResult> {
  return call(`/api/teams/${teamId}/join`, { body, headers: { 'CF-Connecting-IP': ip } });
}

export interface TestMember {
  token: string;
  member: Json;
}

/** Joins as a new member and returns its session. */
export async function addMember(team: TestTeam, memberName: string, playerId: string | null, pin = '1357'): Promise<TestMember> {
  const res = await join(team.teamId, { secret: team.secret, memberName, pin, ...(playerId ? { playerId } : {}) });
  expect(res.status).toBe(200);
  return { token: res.body.token, member: res.body.member };
}

export async function sync(team: TestTeam, token: string, cursor: number, changes: PushChange[] = []): Promise<SyncResponse> {
  const res = await call(`/api/teams/${team.teamId}/sync`, { token, body: { cursor, changes } });
  expect(res.status).toBe(200);
  return res.body as SyncResponse;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ---------------- live rooms ---------------- */

export async function createRoom(team: TestTeam, token: string, name = 'Tuesday scrimmage'): Promise<string> {
  const res = await call(`/api/teams/${team.teamId}/rooms`, { token, body: { name } });
  expect(res.status).toBe(201);
  return res.body.roomId;
}

interface Waiter {
  type: string;
  match: (message: Json) => boolean;
  resolve: (message: Json) => void;
}

/**
 * A room connection. Messages are queued by type and taken in order with `next`. The server's own pings are
 * answered automatically after `pongDelay` ms, which is how a test plays a slow connection.
 */
export class RoomClient {
  welcome: Json = null;
  closed: { code: number; reason: string } | null = null;
  /** Server pings answered so far. */
  pongsSent = 0;
  private readonly queue: Json[] = [];
  private readonly waiters: Waiter[] = [];
  private closeWaiters: Array<() => void> = [];

  constructor(
    readonly ws: WebSocket,
    public pongDelay = 0,
  ) {
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data as string);
      if (message.type === 'ping') {
        this.answerPing(message.t);
        return;
      }
      const waiter = this.waiters.find((w) => w.type === message.type && w.match(message));
      if (waiter) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      } else {
        this.queue.push(message);
      }
    });
    ws.addEventListener('close', (event) => {
      this.closed = { code: event.code, reason: event.reason };
      for (const resolve of this.closeWaiters) resolve();
      this.closeWaiters = [];
    });
    ws.accept();
  }

  private answerPing(t: number): void {
    const reply = () => {
      try {
        this.ws.send(JSON.stringify({ type: 'pong', t }));
        this.pongsSent++;
      } catch {
        // closed meanwhile
      }
    };
    if (this.pongDelay > 0) setTimeout(reply, this.pongDelay);
    else reply();
  }

  send(message: Json): void {
    this.ws.send(JSON.stringify(message));
  }

  /** The next message of `type` (matching `match`), waiting up to `timeoutMs`. */
  next(type: string, match: (message: Json) => boolean = () => true, timeoutMs = 3000): Promise<Json> {
    const index = this.queue.findIndex((m) => m.type === type && match(m));
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { type, match, resolve };
      this.waiters.push(waiter);
      setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          reject(new Error(`No "${type}" message within ${timeoutMs} ms`));
        }
      }, timeoutMs);
    });
  }

  /** Asserts that no message of `type` arrives within `ms`. */
  async nothing(type: string, ms = 300): Promise<void> {
    await sleep(ms);
    expect(this.queue.filter((m) => m.type === type)).toEqual([]);
  }

  /** Drops queued messages of `type`. */
  drop(type: string): void {
    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].type === type) this.queue.splice(i, 1);
  }

  /** A ping/pong round trip: once it returns, the server has handled everything this client sent before. */
  async roundTrip(): Promise<Json> {
    const t = Math.random() * 1e9;
    this.send({ type: 'ping', t });
    return this.next('pong', (m) => m.t === t);
  }

  waitClosed(timeoutMs = 3000): Promise<void> {
    if (this.closed) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.closeWaiters.push(resolve);
      setTimeout(() => reject(new Error('Socket did not close')), timeoutMs);
    });
  }

  close(): void {
    try {
      this.ws.close(1000, 'Done');
    } catch {
      // already closed
    }
  }
}

export function wsRequest(team: TestTeam, roomId: string, token: string, headers: Record<string, string> = {}): Promise<Response> {
  return exports.default.fetch(`${BASE}/api/teams/${team.teamId}/rooms/${roomId}/ws?token=${encodeURIComponent(token)}`, {
    headers: { Upgrade: 'websocket', ...headers },
  });
}

export async function connect(team: TestTeam, roomId: string, token: string, options: { pongDelay?: number } = {}): Promise<RoomClient> {
  const response = await wsRequest(team, roomId, token);
  expect(response.status).toBe(101);
  const client = new RoomClient(response.webSocket!, options.pongDelay ?? 0);
  client.welcome = await client.next('welcome');
  return client;
}
