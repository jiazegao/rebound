/** Helpers for end-to-end tests: every call goes through the real Worker and Durable Objects in workerd. */

import { exports } from 'cloudflare:workers';
import { expect } from 'vitest';
import { setAuthTestOverrides } from '../src/auth';
import { base64url } from '../src/crypto';

export const BASE = 'https://rebound.test';
/** In ALLOWED_ORIGINS (wrangler.toml). */
export const SITE = 'http://localhost:5173';
/** GOOGLE_CLIENT_ID in vitest.config.ts. */
export const CLIENT_ID = 'test-client.apps.googleusercontent.com';

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

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls `check` until it returns something truthy. */
export async function eventually<T>(check: () => Promise<T | null | undefined | false>, timeoutMs = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting');
    await sleep(25);
  }
}

/* ---------------- Google sign-in, with a test key in place of Google's ---------------- */

export const KID = 'test-key-1';
let keys: { privateKey: CryptoKey; jwk: JsonWebKey } | null = null;

/** A test RSA key pair; its public half is what the server trusts instead of Google's published keys. */
export async function testKeys(): Promise<{ privateKey: CryptoKey; jwk: JsonWebKey }> {
  if (keys) return keys;
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = { ...((await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey), kid: KID, alg: 'RS256', use: 'sig' } as JsonWebKey;
  keys = { privateKey: pair.privateKey, jwk };
  return keys;
}

type AuthOverrides = Parameters<typeof setAuthTestOverrides>[0];
let extraOverrides: AuthOverrides = {};

/** Trusts the test key, plus any other overrides (email settings, fetches), until the next call. */
export async function useAuthOverrides(extra: AuthOverrides = {}): Promise<void> {
  extraOverrides = extra;
  setAuthTestOverrides({ googleKeys: [(await testKeys()).jwk], ...extra });
}

const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

/** A Google ID token for `claims`, signed with the test key (or `key`). */
export async function googleToken(claims: Record<string, unknown>, options: { kid?: string; key?: CryptoKey; header?: Record<string, unknown> } = {}): Promise<string> {
  const key = options.key ?? (await testKeys()).privateKey;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: options.kid ?? KID, typ: 'JWT', ...options.header };
  const payload = { iss: 'https://accounts.google.com', aud: CLIENT_ID, iat: now, exp: now + 3600, email_verified: true, ...claims };
  const signed = `${encode(header)}.${encode(payload)}`;
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signed)));
  return `${signed}.${base64url(signature)}`;
}

let counter = 0;

/** A fresh Google account: a unique `sub` and email address. */
export function newGoogleAccount(name = 'Player'): { sub: string; email: string } {
  const n = `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return { sub: `sub-${n}`, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${n}@example.org` };
}

export interface TestUser {
  id: string;
  token: string;
  user: Json;
  email: string;
  sub: string;
}

/** A new account, made through Google sign-in. */
export async function signUp(name: string, options: { headers?: Record<string, string> } = {}): Promise<TestUser> {
  await useAuthOverrides(extraOverrides);
  const account = newGoogleAccount(name);
  const credential = await googleToken(account);
  const res = await call('/api/auth/google', { body: { credential, over13: true, name }, headers: options.headers });
  expect(res.status).toBe(200);
  return { id: res.body.user.id, token: res.body.token, user: res.body.user, ...account };
}

/** Signs `user` in again with Google: a second session (another device). */
export async function signInAgain(user: TestUser): Promise<string> {
  await useAuthOverrides(extraOverrides);
  const res = await call('/api/auth/google', { body: { credential: await googleToken({ sub: user.sub, email: user.email }) } });
  expect(res.status).toBe(200);
  return res.body.token;
}

/* ---------------- teams ---------------- */

export interface TestTeam {
  teamId: string;
  joinCode: string;
  secret: string;
  captain: TestUser;
}

export async function makeTeam(captain: TestUser, body: Record<string, unknown> = {}, headers?: Record<string, string>): Promise<TestTeam> {
  const res = await call('/api/teams', { token: captain.token, body: { name: 'Ridgeview Science Bowl', level: 'HS', ...body }, headers });
  expect(res.status).toBe(201);
  const joinCode: string = res.body.joinCode;
  return { teamId: res.body.team.id, joinCode, secret: joinCode.split('.')[1]!, captain };
}

export function join(team: TestTeam, user: TestUser, body: Record<string, unknown> = {}): Promise<ApiResult> {
  return call(`/api/teams/${team.teamId}/join`, { token: user.token, body: { secret: team.secret, ...body } });
}

/** A team with a captain and members, each joined with the join code. */
export async function teamWith(captainName: string, ...memberNames: string[]): Promise<{ team: TestTeam; members: TestUser[] }> {
  const team = await makeTeam(await signUp(captainName));
  const members: TestUser[] = [];
  for (const name of memberNames) {
    const user = await signUp(name);
    expect((await join(team, user)).status).toBe(200);
    members.push(user);
  }
  return { team, members };
}

/* ---------------- records ---------------- */

export async function putRecords(path: string, token: string, changes: Array<{ c: string; id: string; body: unknown }>): Promise<Json> {
  const res = await call(path, { token, body: { changes } });
  expect(res.status).toBe(200);
  return res.body;
}

export async function getRecords(path: string, token: string, cursor = 0): Promise<Json> {
  const res = await call(`${path}?cursor=${cursor}`, { token });
  expect(res.status).toBe(200);
  return res.body;
}

/** Every record of a user's own collections, past all pages. */
export async function allMyRecords(token: string): Promise<Json[]> {
  const out: Json[] = [];
  let cursor = 0;
  for (;;) {
    const page = await getRecords('/api/me/records', token, cursor);
    out.push(...page.records);
    cursor = page.cursor;
    if (!page.more) return out;
  }
}

/* ---------------- live rooms ---------------- */

export async function createRoom(token: string, name = 'Tuesday scrimmage', match?: Record<string, unknown>): Promise<string> {
  const res = await call('/api/rooms', { token, body: { name, ...(match ? { match } : {}) } });
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

export function wsRequest(roomId: string, token: string, headers: Record<string, string> = {}): Promise<Response> {
  return exports.default.fetch(`${BASE}/api/rooms/${roomId}/ws?token=${encodeURIComponent(token)}`, { headers: { Upgrade: 'websocket', ...headers } });
}

/** Opens the link of a room that has closed (or never was): the socket opens only to close at once, saying why. */
export async function closedOnArrival(roomId: string, token: string): Promise<{ code: number; reason: string }> {
  const response = await wsRequest(roomId, token);
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  const closed = new Promise<{ code: number; reason: string }>((resolve) => ws.addEventListener('close', (e) => resolve({ code: e.code, reason: e.reason })));
  ws.accept();
  return closed;
}

export async function connect(roomId: string, token: string, options: { pongDelay?: number } = {}): Promise<RoomClient> {
  const response = await wsRequest(roomId, token);
  expect(response.status).toBe(101);
  const client = new RoomClient(response.webSocket!, options.pongDelay ?? 0);
  client.welcome = await client.next('welcome');
  return client;
}
