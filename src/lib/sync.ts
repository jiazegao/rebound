/**
 * Sharing the team's data through the team server (docs/SERVER.md). Optional: until a team
 * connects, nothing here runs and the site keeps everything on the device.
 *
 * - Creating a shared team uploads this device's team; joining one (by the captain's link) replaces
 *   this device's team data with the shared team's.
 * - Sync runs when the site opens, a few seconds after local changes, every 30 seconds while the
 *   page is visible, and when the connection comes back. Each run pushes changed records and pulls
 *   what other devices changed (see syncRecords.ts for the bookkeeping).
 */
import { del, get, set } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { fingerprint, recordKey, SYNC_PAGE_SIZE, type MemberRole, type SyncResponse } from '../core/sync';
import { emptyData, getData, subscribeStore, update, type AppData } from './store';
import { applyRecords, localChanges, rememberRecords, toRecords, type Known } from './syncRecords';

const KEY = 'rebound-sync-v1';

/** The team server for this build of the site ("" when none is configured). */
export const SERVER_URL: string = ((import.meta.env.VITE_SERVER_URL as string | undefined) ?? '').replace(/\/$/, '');

export interface SharedMember {
  id: string;
  name: string;
  role: MemberRole;
  playerId: string | null;
}

export interface SyncState {
  serverUrl: string;
  teamId: string;
  teamName: string;
  token: string;
  member: SharedMember;
  /** Leaders get the join code when they create the team or make a new one. */
  joinCode: string | null;
  cursor: number;
  known: Known;
  lastSyncAt: number | null;
  lastError: string | null;
  /** Changes the server refused, most recent first (shown so nobody wonders where they went). */
  rejected: Array<{ key: string; reason: string; at: number }>;
}

type Status = 'off' | 'syncing' | 'ok' | 'offline' | 'error' | 'signed-out';

let state: SyncState | null = null;
let status: Status = 'off';
let snapshot: { state: SyncState | null; status: Status } = { state, status };
const listeners = new Set<() => void>();
let running: Promise<void> | null = null;
let again = false;
let applying = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let backoff = 0;

function emit() {
  snapshot = { state, status };
  for (const l of listeners) l();
}

function setStatus(s: Status) {
  status = s;
  emit();
}

async function persist() {
  try {
    if (state) await set(KEY, state);
    else await del(KEY);
  } catch {
    /* storage blocked: sync still works for this visit */
  }
}

export function useSync(): { state: SyncState | null; status: Status } {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

/* ---------------- talking to the server ---------------- */

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function api<T>(base: string, path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...init.headers },
    });
  } catch {
    throw new SyncError("Can't reach the team server. Check the connection; your work is saved on this device and syncs later.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new SyncError(body.error ?? `The team server answered ${res.status}.`, res.status);
  return body;
}

function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!state) throw new SyncError('Not connected to a shared team.', 0);
  return api<T>(state.serverUrl, `/api/teams/${encodeURIComponent(state.teamId)}${path}`, { ...init, token: state.token });
}

/* ---------------- the sync loop ---------------- */

async function runOnce(): Promise<void> {
  if (!state) return;
  for (let round = 0; round < 50 && state; round++) {
    const before = toRecords(getData());
    const changes = localChanges(before, state.known).slice(0, SYNC_PAGE_SIZE);
    const res: SyncResponse = await authed<SyncResponse>('/sync', { method: 'POST', body: JSON.stringify({ cursor: state.cursor, changes }) });
    if (!state) return;
    // Records changed on this device while the request was out stay as they are; they go up next round.
    const now = toRecords(getData());
    const changedMeanwhile = (key: string) => fingerprint(before.get(key)?.body ?? null) !== fingerprint(now.get(key)?.body ?? null);
    const toApply = res.changes.filter((r) => !changedMeanwhile(recordKey(r.c, r.id)));
    if (toApply.length) {
      applying = true;
      try {
        update((d) => applyRecords(d, toApply));
      } finally {
        applying = false;
      }
    }
    let known = rememberRecords(state.known, res.changes);
    for (const r of res.rejected) {
      const key = recordKey(r.c, r.id);
      // Don't keep pushing a refused change; keep the local copy and say why.
      known = { ...known, [key]: { fp: fingerprint(now.get(key)?.body ?? null), rev: known[key]?.rev ?? 0 } };
    }
    state = {
      ...state,
      cursor: res.cursor,
      known,
      rejected: [...res.rejected.map((r) => ({ key: recordKey(r.c, r.id), reason: r.reason, at: Date.now() })), ...state.rejected].slice(0, 20),
    };
    if (!res.more && changes.length < SYNC_PAGE_SIZE) break;
  }
  if (state) state = { ...state, lastSyncAt: Date.now(), lastError: null };
}

/** Sync now (or right after the run in progress). */
export function syncNow(): Promise<void> {
  if (!state) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  setStatus('syncing');
  running = (async () => {
    try {
      do {
        again = false;
        await runOnce();
      } while (again && state);
      backoff = 0;
      setStatus(state ? 'ok' : 'off');
    } catch (err) {
      const e = err instanceof SyncError ? err : new SyncError(String(err), 0);
      if (state) state = { ...state, lastError: e.message };
      if (e.status === 401 || e.status === 403) setStatus('signed-out');
      else {
        setStatus(e.status === 0 ? 'offline' : 'error');
        backoff = Math.min(300_000, backoff ? backoff * 2 : 5_000);
        clearTimeout(timer);
        timer = setTimeout(() => void syncNow(), backoff);
      }
    } finally {
      running = null;
      await persist();
      emit();
    }
  })();
  return running;
}

function schedule(ms = 2_500) {
  if (!state || applying || status === 'signed-out') return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

let started = false;
function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  subscribeStore(() => schedule());
  interval = setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 30_000);
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
}

/** Load the saved connection, if any, and sync. Call once at startup. */
export async function initSync(): Promise<void> {
  try {
    state = ((await get<SyncState>(KEY)) as SyncState | undefined) ?? null;
  } catch {
    state = null;
  }
  if (!state) return emit();
  start();
  void syncNow();
}

/* ---------------- creating, joining, leaving ---------------- */

interface Joined {
  token: string;
  member: SharedMember;
  teamName?: string;
  teamId?: string;
  joinCode?: string;
}

/** Share this device's team: create it on the server as its captain, then upload everything. */
export async function createSharedTeam(serverUrl: string, memberName: string, pin: string): Promise<void> {
  const data = getData();
  if (!data.team) throw new SyncError('Set up the team on this device first.', 0);
  const res = await api<Joined & { teamId: string; joinCode: string }>(serverUrl, '/api/teams', {
    method: 'POST',
    body: JSON.stringify({ teamName: data.team.name, level: data.team.level, memberName, pin, playerId: data.settings.soloPlayerId ?? undefined }),
  });
  state = {
    serverUrl,
    teamId: res.teamId,
    teamName: data.team.name,
    token: res.token,
    member: res.member,
    joinCode: res.joinCode,
    cursor: 0,
    known: {},
    lastSyncAt: null,
    lastError: null,
    rejected: [],
  };
  await persist();
  start();
  await syncNow();
}

/** The parts of a join link or code ("…#/join/<teamId>.<secret>" or "<teamId>.<secret>"). */
export function parseJoinCode(input: string): { teamId: string; secret: string } | null {
  const code = input.trim().split('/join/').pop()!.trim();
  const m = /^([a-z0-9]{6,40})\.([a-z0-9]{6,40})$/i.exec(code);
  return m ? { teamId: m[1].toLowerCase(), secret: m[2].toLowerCase() } : null;
}

/**
 * Join (or sign in to) a shared team. This device's team data is replaced by the shared team's,
 * so download a backup first if it holds anything else.
 */
export async function joinSharedTeam(serverUrl: string, joinCode: string, memberName: string, pin: string, playerId?: string): Promise<void> {
  const parsed = parseJoinCode(joinCode);
  if (!parsed) throw new SyncError('That join link does not look right. Ask your captain for the link again.', 0);
  const res = await api<Joined>(serverUrl, `/api/teams/${parsed.teamId}/join`, {
    method: 'POST',
    body: JSON.stringify({ secret: parsed.secret, memberName, pin, playerId }),
  });
  const settings = getData().settings;
  update((d) => {
    Object.assign(d, emptyData(), { settings: { ...settings, soloPlayerId: res.member.playerId ?? settings.soloPlayerId } });
  });
  state = {
    serverUrl,
    teamId: parsed.teamId,
    teamName: res.teamName ?? '',
    token: res.token,
    member: res.member,
    joinCode: null,
    cursor: 0,
    known: {},
    lastSyncAt: null,
    lastError: null,
    rejected: [],
  };
  await persist();
  start();
  await syncNow();
}

/** Stop sharing on this device (the team's data stays here, and on the server for everyone else). */
export async function leaveSharedTeam(): Promise<void> {
  if (!state) return;
  try {
    await authed('/signout', { method: 'POST' });
  } catch {
    /* already signed out, or offline: forget the session anyway */
  }
  state = null;
  clearTimeout(timer);
  clearInterval(interval);
  started = false;
  await persist();
  setStatus('off');
}

/* ---------------- members (leaders) ---------------- */

export interface MemberListing extends SharedMember {
  lastSeen: number | null;
}

export async function listMembers(): Promise<MemberListing[]> {
  return (await authed<{ members: MemberListing[] }>('/members')).members;
}

export async function updateMember(memberId: string, fields: { role?: MemberRole; playerId?: string | null }): Promise<SharedMember> {
  const res = await authed<{ member: SharedMember }>(`/members/${encodeURIComponent(memberId)}`, { method: 'PATCH', body: JSON.stringify(fields) });
  if (state && memberId === state.member.id) {
    state = { ...state, member: res.member };
    await persist();
    emit();
  }
  return res.member;
}

export async function removeMember(memberId: string): Promise<void> {
  await authed(`/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' });
}

export async function newJoinCode(): Promise<string> {
  const res = await authed<{ joinCode: string }>('/join-code', { method: 'POST' });
  if (state) {
    state = { ...state, joinCode: res.joinCode };
    await persist();
    emit();
  }
  return res.joinCode;
}

/** For pages that need the session (rooms). */
export function currentSession(): { serverUrl: string; teamId: string; token: string; member: SharedMember } | null {
  return state ? { serverUrl: state.serverUrl, teamId: state.teamId, token: state.token, member: state.member } : null;
}

/** For tests and the data page: the records this device would push now. */
export function pendingChanges(data: AppData = getData()): number {
  return state ? localChanges(toRecords(data), state.known).length : 0;
}
