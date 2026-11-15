/**
 * The signed-in player's data, between this page and Rebound's server (docs/ACCOUNTS.md, "Site").
 *
 * - Signing in loads everything into the store: the profile, the player's own records, and their team's settings,
 *   members and records, in one request (/api/sync; long histories go on page by page).
 * - Pages change data only through store.update(). Shortly after a change, the records it touched go to the server:
 *   the player's own to /api/me/records, the team's to /api/teams/:id/records, and changed settings to their own
 *   endpoints. A failed send is retried; while the server cannot be reached, a banner says the last change was not
 *   saved, and sending goes on until it works.
 * - Unless the player chose otherwise, a copy of all this is kept on the device (deviceCopy.ts): the next visit opens
 *   from it at once and asks the server only for what changed since, and a change that was not sent before the page
 *   closed goes then. Without the copy (a shared computer), nothing about the player is kept on the device but the
 *   session token, each visit loads everything, and closing the page loses unsent changes.
 * - While the page is visible, what changed since the last look (the profile, the team, both sets of records) is
 *   fetched in one request: every minute while the player is doing something, every five when they are not, and
 *   when they come back to the page. Teammates' work and the player's other devices show up that way, and new game
 *   and match answers become review cards then.
 *
 * Network work runs one task at a time (load, send, refresh), so a refresh never races a send.
 */
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_SETTINGS,
  RECORDS_PAGE_SIZE,
  TEAM_COLLECTIONS,
  type Change,
  type NextEvent,
  type RecordOut,
  type RecordsResponse,
  type TeamCollection,
  type TeamInfo,
  type TeamMember,
  type TeamResponse,
  type UserProfile,
  type UserSettings,
} from '../core/accounts';
import type { Outcome } from '../core/review';
import type { Level, Player, Team } from '../core/schema';
import { fingerprint } from '../core/merge';
import * as api from './api';
import {
  applyTeamRecords,
  applyUserRecords,
  changeBatch,
  DELETED,
  isSentUserCollection,
  recordFingerprint,
  recordKey,
  SENT_USER_COLLECTIONS,
  teamCollectionRecords,
  tracksTeamRecord,
  tracksUserRecord,
  usableRecord,
  userCollectionRecords,
  type LocalRecord,
  type SentUserCollection,
} from './records';
import { deleteDeviceCopy, indexedDbCopy, COPY_VERSION, SOLO_SETUP_KEY, type CopyRow, type CopyState, type CopyStore } from './deviceCopy';
import { applyAnswers, emptyData, getData, replaceData, subscribeStore, update, type AppData, type AppSettings } from './store';

/* ---------------- what pages see ---------------- */

export type SessionStatus = 'starting' | 'signed-out' | 'loading' | 'ready' | 'failed';

export interface SessionState {
  status: SessionStatus;
  user: UserProfile | null;
  /** The team: its settings, members, the player's role and (for leaders) the invite code. Null with no team. */
  team: TeamResponse | null;
  /** Why loading failed, or why the player was signed out. */
  message: string | null;
}

export interface ConnectionState {
  /** Changes made here that the server has not confirmed yet. */
  unsaved: boolean;
  /** Sending has failed for a while (no connection, or the server is down); it keeps trying. */
  failing: boolean;
  error: string | null;
  /** Changes the server refused, newest first, with its reasons. */
  refused: Array<{ what: string; reason: string; at: number }>;
}

let session: SessionState = { status: 'starting', user: null, team: null, message: null };
let connection: ConnectionState = { unsaved: false, failing: false, error: null, refused: [] };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setSession(fields: Partial<SessionState>) {
  session = { ...session, ...fields };
  emit();
}

function setConnection(fields: Partial<ConnectionState>) {
  const next = { ...connection, ...fields };
  if (JSON.stringify(next) === JSON.stringify(connection)) return;
  connection = next;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getSession(): SessionState {
  return session;
}

export function getConnection(): ConnectionState {
  return connection;
}

/** Run `listener` whenever the session or the connection changes. */
export function subscribeSession(listener: () => void): () => void {
  return subscribe(listener);
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => session);
}

export function useConnection(): ConnectionState {
  return useSyncExternalStore(subscribe, () => connection);
}

export function dismissRefused(): void {
  setConnection({ refused: [] });
}

/** Hide the message about the session (signed out, removed from a team…) once the player has seen it. */
export function clearSessionMessage(): void {
  if (session.message) setSession({ message: null });
}

/* ---------------- from the server's shapes to AppData's ---------------- */

/** The next competition with its fields in a fixed order, so the same event always has the same fingerprint. */
function canonicalEvent(e: NextEvent | undefined | null): NextEvent | null {
  if (!e || typeof e.date !== 'string') return null;
  return { name: e.name ?? '', date: e.date, ...(e.lineupId ? { lineupId: e.lineupId } : {}), ...(e.finals ? { finals: true } : {}) };
}

export function teamOf(info: TeamInfo): Team {
  const event = canonicalEvent(info.nextEvent);
  const created = Number.isFinite(info.createdAt) ? new Date(info.createdAt) : new Date(0);
  return { id: info.id, name: info.name, level: info.level, createdAt: created.toISOString(), ...(event ? { nextEvent: event } : {}) };
}

/** What PATCH /api/teams/:id takes, from AppData's team. */
export function teamSettingsOf(t: Team): { name: string; level: Level; nextEvent: NextEvent | null } {
  return { name: t.name, level: t.level, nextEvent: canonicalEvent(t.nextEvent) };
}

/** The settings PATCH /api/me takes, from AppData's (which add the player's id). */
export function userSettingsOf(s: AppSettings): UserSettings {
  return {
    sound: s.sound,
    readingWpm: s.readingWpm,
    answerTimer: s.answerTimer,
    dailyMinutes: s.dailyMinutes,
    ...(s.cardsCursor !== undefined ? { cardsCursor: s.cardsCursor } : {}),
  };
}

export function appSettingsOf(user: UserProfile): AppSettings {
  const s: Partial<UserSettings> = user.settings ?? {};
  return {
    sound: typeof s.sound === 'boolean' ? s.sound : DEFAULT_SETTINGS.sound,
    readingWpm: typeof s.readingWpm === 'number' ? s.readingWpm : DEFAULT_SETTINGS.readingWpm,
    soloPlayerId: user.id,
    answerTimer: typeof s.answerTimer === 'boolean' ? s.answerTimer : DEFAULT_SETTINGS.answerTimer,
    dailyMinutes: typeof s.dailyMinutes === 'number' ? s.dailyMinutes : DEFAULT_SETTINGS.dailyMinutes,
    ...(typeof s.cardsCursor === 'number' ? { cardsCursor: s.cardsCursor } : {}),
  };
}

function memberPlayer(m: TeamMember): Player {
  return {
    id: m.userId,
    name: m.name,
    role: m.role,
    active: true,
    ...(m.squad ? { squad: m.squad } : {}),
    ...(m.primarySubject ? { primarySubject: m.primarySubject } : {}),
    ...(m.secondarySubject ? { secondarySubject: m.secondarySubject } : {}),
    ...(m.gradYear ? { gradYear: m.gradYear } : {}),
  };
}

/**
 * The players pages see: the team's members, or just the player when they have no team. The player's own name and
 * subjects come from their profile, which they may have just changed (the team's copy follows on the server).
 */
export function playersOf(user: UserProfile, team: TeamResponse | null): Player[] {
  const own = (role: Player['role'], squad?: string): Player => ({
    ...memberPlayer({ userId: user.id, name: user.name, role, squad, primarySubject: user.primarySubject, secondarySubject: user.secondarySubject, gradYear: user.gradYear, joinedAt: 0, lastSeen: 0 }),
  });
  if (!team) return [own('member')];
  const list = team.members.map((m) => (m.userId === user.id ? own(m.role, m.squad) : memberPlayer(m)));
  if (!list.some((p) => p.id === user.id)) list.push(own(team.you.role));
  return list;
}

/* ---------------- bookkeeping ---------------- */

interface Books {
  me: string;
  teamId: string | null;
  userCursor: number;
  teamCursor: number;
  /** What the server has of each record: its fingerprint, or DELETED. */
  known: Map<string, string>;
  /** The player's answers by record id, and each one's revision (for the review-card cursor). */
  answers: Map<string, Outcome>;
  answerRevs: Map<string, number>;
  /** Fingerprints of the server's copy of the settings and of the team's settings. */
  settingsFp: string;
  teamFp: string | null;
}

let books: Books | null = null;

/* ---------------- the copy on the device ---------------- */

/** Records whose row in the device's copy is out of date: what is here, or what the server has, changed. */
const stale = new Set<string>();

/** What the server has of each record. Every change is noted for the device's copy. */
class Known extends Map<string, string> {
  set(key: string, fp: string): this {
    if (this.get(key) !== fp) stale.add(key);
    return super.set(key, fp);
  }
}

/** Where the copy is kept: the browser's IndexedDB, or what a test puts in its place. */
let copyFactory: () => CopyStore | null = indexedDbCopy;
/** The copy, when this session keeps one (and the browser can). */
let copy: CopyStore | null = null;
/**
 * Whether this tab writes the copy. With several tabs open only one does (the first, then whichever is left), so
 * the copy is always one tab's whole view and never a mix of two.
 */
let copyWriter = true;
/** Copy writes run one after another, in the order they were asked for. */
let copyWrites: Promise<void> = Promise.resolve();
let copyTimer: ReturnType<typeof setTimeout> | undefined;
/** The records that were waiting to be sent when last looked at (their rows change when they are sent, or change back). */
let lastWaiting = new Set<string>();
/** A copy this old is not trusted: the account loads from the server and the copy starts again. */
const MAX_COPY_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const COPY_DELAY_MS = 250;

/** For tests: keep the copy somewhere else (null: where the browser keeps it). */
export function useCopyStore(factory: (() => CopyStore | null) | null): void {
  copyFactory = factory ?? indexedDbCopy;
}

function openCopy(): void {
  if (!api.keepsCopy()) copy = null;
  else copy ??= copyFactory();
}

/** A write to the copy failed (the device is out of room, or storage was switched off): go on without it. */
function dropCopy(store: CopyStore): void {
  if (copy === store) copy = null;
  void store.wipe().catch(() => undefined);
}

function copyState(b: Books): CopyState | null {
  if (!session.user) return null;
  const d = getData();
  return {
    v: COPY_VERSION,
    me: b.me,
    teamId: b.teamId,
    userCursor: b.userCursor,
    teamCursor: b.teamCursor,
    user: session.user,
    team: session.team,
    settings: d.settings,
    localTeam: d.team,
    settingsFp: b.settingsFp,
    teamFp: b.teamFp,
    savedAt: Date.now(),
  };
}

/** A record's row for the copy: what is here and what the server has, or null when neither has it. */
function copyRow(d: AppData, b: Books, key: string): CopyRow | null {
  const c = key.slice(0, key.indexOf('/'));
  const id = key.slice(c.length + 1);
  const known = b.known.get(key) ?? DELETED;
  if (c === 'answers') {
    const body = b.answers.get(id);
    return body ? { k: key, c, id, has: true, body, known, rev: b.answerRevs.get(id) } : null;
  }
  const local = isField(c) ? localField(d, c, b.me).get(key) : undefined;
  if (!local && known === DELETED) return null;
  return { k: key, c, id, has: !!local, body: local ? local.r.body : null, known };
}

/** Write the whole copy again (after loading everything from the server, or when this tab takes over the writing). */
function copyEverything(b: Books): void {
  const store = copy;
  const state = copyState(b);
  if (!store || !copyWriter || !state) return;
  clearTimeout(copyTimer);
  stale.clear();
  const d = getData();
  const keys = new Set<string>(b.known.keys());
  const fields: Field[] = [...SENT_USER_COLLECTIONS, ...(b.teamId ? TEAM_COLLECTIONS : [])];
  for (const field of fields) for (const key of localField(d, field, b.me).keys()) keys.add(key);
  for (const id of b.answers.keys()) keys.add(recordKey('answers', id));
  const rows: CopyRow[] = [];
  for (const key of keys) {
    const row = copyRow(d, b, key);
    if (row) rows.push(row);
  }
  copyWrites = copyWrites.then(() => store.replace(state, rows)).catch(() => dropCopy(store));
}

/** Write the rows that changed, shortly (several changes in a row go together). */
function copySoon(): void {
  if (!copy || !copyWriter || !books) return;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(copyChanges, COPY_DELAY_MS);
}

function copyChanges(): void {
  clearTimeout(copyTimer);
  const b = books;
  const store = copy;
  if (!b || !store || !copyWriter || session.status !== 'ready') return;
  const state = copyState(b);
  if (!state) return;
  const d = getData();
  const put: CopyRow[] = [];
  const remove: string[] = [];
  for (const key of stale) {
    const row = copyRow(d, b, key);
    if (row) put.push(row);
    else remove.push(key);
  }
  stale.clear();
  copyWrites = copyWrites.then(() => store.patch(state, put, remove)).catch(() => dropCopy(store));
}

/** The records waiting to be sent (and those that were, last time) have rows to write: note them. */
function noteWaiting(p: Pending): void {
  if (!copy) return;
  const waiting = new Set<string>();
  for (const ch of p.user) waiting.add(recordKey(ch.c, ch.id));
  for (const ch of p.team) waiting.add(recordKey(ch.c, ch.id));
  for (const key of waiting) stale.add(key);
  for (const key of lastWaiting) stale.add(key);
  lastWaiting = waiting;
  copySoon();
}

/** Signed out (or another account now): nothing of the player's stays on the device. */
function forgetDevice(): void {
  clearTimeout(copyTimer);
  stale.clear();
  lastWaiting = new Set();
  const store = copy;
  copy = null;
  copyWrites = copyWrites.then(() => (store ? store.wipe() : deleteDeviceCopy())).catch(() => undefined);
  try {
    globalThis.localStorage?.removeItem(SOLO_SETUP_KEY);
  } catch {
    /* storage blocked: there is nothing kept to remove */
  }
}

/** Whether this session keeps a copy of the account on this device. */
export function keepsDeviceCopy(): boolean {
  return api.keepsCopy();
}

/** Start or stop keeping a copy of the account on this device (the Account page's switch). Stopping deletes it. */
export async function setDeviceCopy(keep: boolean): Promise<void> {
  api.setKeepsCopy(keep);
  if (keep) {
    openCopy();
    if (books && session.status === 'ready') copyEverything(books);
  } else {
    clearTimeout(copyTimer);
    stale.clear();
    const store = copy;
    copy = null;
    copyWrites = copyWrites.then(() => (store ? store.wipe() : deleteDeviceCopy())).catch(() => undefined);
  }
  await copyWrites;
  emit();
}

/** Resolves once every write to the device's copy asked for so far is done. For tests. */
export async function copySettled(): Promise<void> {
  if (copyTimer !== undefined) copyChanges();
  for (;;) {
    const tail = copyWrites;
    await tail;
    if (tail === copyWrites) return;
  }
}

/** Whether the session on this device is still this player's (another tab may have signed in as someone else). */
const ownSession = (b: Books): boolean => api.sessionToken()?.startsWith(`${b.me}.`) ?? false;
/** Goes up whenever the session starts over, so work from an earlier session is dropped when it returns. */
let epoch = 0;
/** True while this module itself writes server data into the store (that is not a change to send). */
let quiet = false;

function quietly(fn: () => void) {
  quiet = true;
  try {
    fn();
  } finally {
    quiet = false;
  }
}

type Field = SentUserCollection | TeamCollection;
const isField = (c: string): c is Field => isSentUserCollection(c) || (TEAM_COLLECTIONS as readonly string[]).includes(c);

/** Each collection's records and fingerprints, recomputed only when the collection's object changes. */
const localCache = new Map<Field, { ref: unknown; me: string; records: Map<string, { r: LocalRecord; fp: string }> }>();

function localField(d: AppData, field: Field, me: string): Map<string, { r: LocalRecord; fp: string }> {
  const ref = d[field];
  const hit = localCache.get(field);
  if (hit && hit.ref === ref && hit.me === me) return hit.records;
  const list = isSentUserCollection(field) ? userCollectionRecords(d, field, me) : teamCollectionRecords(d, field);
  const records = new Map(list.map((r) => [recordKey(r.c, r.id), { r, fp: recordFingerprint(r.c, r.body) }]));
  localCache.set(field, { ref, me, records });
  return records;
}

function localFp(d: AppData, key: string, me: string): string {
  const c = key.slice(0, key.indexOf('/'));
  return isField(c) ? (localField(d, c, me).get(key)?.fp ?? DELETED) : DELETED;
}

export interface Pending {
  user: Change[];
  team: Change[];
  settings: UserSettings | null;
  teamSettings: ReturnType<typeof teamSettingsOf> | null;
}

/** Everything that differs from what the server is known to have: new, changed and deleted records, and settings. */
function pendingChanges(d: AppData, b: Books): Pending {
  const user: Change[] = [];
  const team: Change[] = [];
  const fields: Field[] = [...SENT_USER_COLLECTIONS, ...(b.teamId ? TEAM_COLLECTIONS : [])];
  for (const field of fields) {
    const out = isSentUserCollection(field) ? user : team;
    for (const [key, { r, fp }] of localField(d, field, b.me)) if ((b.known.get(key) ?? DELETED) !== fp) out.push({ c: r.c, id: r.id, body: r.body });
  }
  for (const [key, fp] of b.known) {
    if (fp === DELETED) continue;
    const c = key.slice(0, key.indexOf('/'));
    if (!isField(c) || (!isSentUserCollection(c) && !b.teamId)) continue;
    if (!localField(d, c, b.me).has(key)) (isSentUserCollection(c) ? user : team).push({ c, id: key.slice(c.length + 1), body: null });
  }
  const settings = userSettingsOf(d.settings);
  const teamSettings = b.teamId && d.team ? teamSettingsOf(d.team) : null;
  return {
    user,
    team,
    settings: fingerprint(settings) !== b.settingsFp ? settings : null,
    teamSettings: teamSettings && fingerprint(teamSettings) !== b.teamFp ? teamSettings : null,
  };
}

/** For tests: what would be sent now. */
export function pendingNow(): Pending | null {
  return books ? pendingChanges(getData(), books) : null;
}

function rememberUserRecord(b: Books, r: RecordOut): void {
  if (!tracksUserRecord(r.c, r.id) || !usableRecord(r)) return;
  b.known.set(recordKey(r.c, r.id), r.body === null ? DELETED : recordFingerprint(r.c, r.body));
  if (r.c === 'answers') {
    if (r.body === null) b.answerRevs.delete(r.id);
    else b.answerRevs.set(r.id, r.rev);
  }
}

/* ---------------- one task at a time ---------------- */

let chain: Promise<void> = Promise.resolve();

function queue(task: () => Promise<void>): Promise<void> {
  const run = chain.then(() => task().catch(() => undefined));
  chain = run;
  return run;
}

let flushTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let loadRetryTimer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;
let lastRefresh = 0;
let refreshQueued = false;

/**
 * How often an open, visible page asks the server what changed: while the player is doing something, and once they
 * have not touched the page for IDLE_AFTER_MS. Each look is one request; a page left open all afternoon should not
 * cost the server hundreds of them.
 */
export const ACTIVE_REFRESH_MS = 60_000;
export const IDLE_REFRESH_MS = 5 * 60_000;
const IDLE_AFTER_MS = 5 * 60_000;
const REFRESH_CHECK_MS = 10_000;
/** Coming back to the page (or back online) asks at once, unless it asked this recently. */
const WAKE_REFRESH_MS = 20_000;

/** Quick retries first, then every 10 seconds for as long as it takes. */
const RETRY_MS = [1_000, 3_000];
const SLOW_RETRY_MS = 10_000;
/** Most JSON to send in one request (records with pictures can be a few hundred kilobytes). */
const PUSH_BYTES = 1_500_000;

function scheduleFlush(ms = 400): void {
  if (!books || session.status !== 'ready') return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void queue(flushOnce), ms);
}

function clearTimers(): void {
  clearTimeout(flushTimer);
  clearTimeout(retryTimer);
  clearTimeout(loadRetryTimer);
}

/* ---------------- sending ---------------- */

const WHAT: Record<string, string> = {
  attempts: 'a practice answer',
  seen: 'the questions you have heard',
  conceptReads: 'what you have read',
  completions: 'a finished assignment',
  reports: 'a problem report',
  cards: 'a review question',
  plans: "today's plan",
  lineups: 'a lineup',
  assignments: 'an assignment',
  packets: 'a team packet',
  visuals: 'a visual question',
  written: 'a written question',
  conceptCards: 'a concept card',
  games: 'a game',
};

function noteRefused(what: string, reason: string): void {
  setConnection({ refused: [{ what, reason, at: Date.now() }, ...connection.refused].slice(0, 10) });
}

/** The team said no because the player is no longer on it (removed, or the team was deleted). */
const leftTeam = (err: unknown) => err instanceof api.ApiError && (err.status === 403 || err.status === 404);

class TeamGone extends Error {}

async function sendRecords(b: Books, scope: 'user' | 'team', changes: Change[], e: number): Promise<void> {
  let rest = changes;
  while (rest.length > 0) {
    const batch = changeBatch(rest, RECORDS_PAGE_SIZE, PUSH_BYTES);
    rest = rest.slice(batch.length);
    try {
      const res = scope === 'user' ? await api.saveMyRecords(batch) : await api.saveTeamRecords(b.teamId!, batch);
      if (e !== epoch) return;
      for (const ch of batch) b.known.set(recordKey(ch.c, ch.id), ch.body === null ? DELETED : recordFingerprint(ch.c, ch.body));
      // A refused change keeps the local copy but is not sent again (until it changes); say why.
      for (const r of res.rejected ?? []) noteRefused(WHAT[r.c] ?? r.c, r.reason);
    } catch (err) {
      if (e !== epoch) return;
      if (scope === 'team' && leftTeam(err)) throw new TeamGone();
      if (err instanceof api.ApiError && !err.retryable && err.status !== 401) {
        // Sending again would not help (too large, not allowed): keep the local copy and say why.
        for (const ch of batch) b.known.set(recordKey(ch.c, ch.id), ch.body === null ? DELETED : recordFingerprint(ch.c, ch.body));
        noteRefused(batch.length === 1 ? (WHAT[batch[0].c] ?? batch[0].c) : `${batch.length} changes`, err.message);
        continue;
      }
      throw err;
    }
  }
}

async function flushOnce(): Promise<void> {
  const b = books;
  const e = epoch;
  if (!b || session.status !== 'ready' || !ownSession(b)) return;
  clearTimeout(retryTimer);
  try {
    for (let round = 0; round < 20; round++) {
      const p = pendingChanges(getData(), b);
      // What is waiting to go is written to the device's copy first: if the page closes now, it goes next time.
      noteWaiting(p);
      if (!p.user.length && !p.team.length && !p.settings && !p.teamSettings) break;
      if (p.user.length) await sendRecords(b, 'user', p.user, e);
      if (e !== epoch) return;
      if (p.team.length) await sendRecords(b, 'team', p.team, e);
      if (e !== epoch) return;
      if (p.settings) {
        const settings = p.settings;
        try {
          const res = await api.updateMe({ settings });
          if (e !== epoch) return;
          b.settingsFp = fingerprint(settings);
          setSession({ user: res.user ?? session.user });
        } catch (err) {
          if (!(err instanceof api.ApiError) || err.retryable || err.status === 401) throw err;
          b.settingsFp = fingerprint(settings);
          noteRefused('your settings', err.message);
        }
      }
      if (p.teamSettings && b.teamId) {
        const fields = p.teamSettings;
        try {
          const res = await api.updateTeamSettings(b.teamId, fields);
          if (e !== epoch) return;
          b.teamFp = fingerprint(fields);
          if (session.team && res.team) setSession({ team: { ...session.team, team: res.team } });
        } catch (err) {
          if (!(err instanceof api.ApiError) || err.retryable || err.status === 401) throw err;
          // Not a coach or captain (any more): put back the team's own settings.
          const serverTeam = session.team?.team;
          if (serverTeam) {
            b.teamFp = fingerprint(teamSettingsOf(teamOf(serverTeam)));
            quietly(() => update((d) => void (d.team = teamOf(serverTeam))));
          } else b.teamFp = fingerprint(fields);
          noteRefused("the team's settings", err.message);
        }
      }
    }
    if (e !== epoch) return;
    failures = 0;
    const left = pendingChanges(getData(), b);
    noteWaiting(left);
    setConnection({ failing: false, error: null, unsaved: left.user.length + left.team.length > 0 || !!left.settings || !!left.teamSettings });
  } catch (err) {
    if (e !== epoch) return;
    if (err instanceof TeamGone) {
      await load('You are no longer on that team (a coach or captain may have removed you, or deleted the team).');
      return;
    }
    if (err instanceof api.ApiError && err.status === 401) return; // signed out: api.ts already said so
    failures += 1;
    const delay = RETRY_MS[failures - 1] ?? SLOW_RETRY_MS;
    if (failures > RETRY_MS.length) setConnection({ failing: true, error: err instanceof Error ? err.message : String(err), unsaved: true });
    else setConnection({ unsaved: true });
    retryTimer = setTimeout(() => void queue(flushOnce), delay);
  }
}

/* ---------------- receiving ---------------- */

/** Fetch every page of records after `cursor`. */
async function pullAll(fetchPage: (cursor: number) => Promise<RecordsResponse>, cursor = 0): Promise<{ cursor: number; records: RecordOut[] }> {
  const records: RecordOut[] = [];
  for (let i = 0; i < 10_000; i++) {
    const res = await fetchPage(cursor);
    records.push(...(res.records ?? []));
    const next = Math.max(cursor, res.cursor ?? cursor);
    if (!res.more || next === cursor) return { cursor: next, records };
    cursor = next;
  }
  return { cursor, records };
}

/**
 * Records from the server that may go into the store now: a record changed here and not yet sent stays as it is
 * (it goes up next, and the server merges ledgers and review cards). The bookkeeping notes what the server has.
 */
function takeIncoming(b: Books, scope: 'user' | 'team', records: RecordOut[]): RecordOut[] {
  const d = getData();
  const out: RecordOut[] = [];
  // A record changed on the server while its pages were being read comes twice: only its latest version counts.
  const latest = new Map(records.map((r) => [recordKey(r.c, r.id), r]));
  for (const r of latest.values()) {
    if ((scope === 'user' ? !tracksUserRecord(r.c, r.id) : !tracksTeamRecord(r.c)) || !usableRecord(r)) continue;
    const key = recordKey(r.c, r.id);
    const changedHere = r.c !== 'answers' && localFp(d, key, b.me) !== (b.known.get(key) ?? DELETED);
    if (scope === 'user') rememberUserRecord(b, r);
    else b.known.set(key, r.body === null ? DELETED : recordFingerprint(r.c, r.body));
    if (!changedHere) out.push(r);
  }
  return out;
}

/** The player's answers above the cursor become review cards (see store.applyAnswers). */
function applyNewAnswers(b: Books): void {
  const cursor = getData().settings.cardsCursor ?? 0;
  let max = cursor;
  const fresh: Outcome[] = [];
  for (const [id, rev] of b.answerRevs) {
    if (rev <= cursor) continue;
    max = Math.max(max, rev);
    const o = b.answers.get(id);
    if (o) fresh.push(o);
  }
  if (max > cursor) applyAnswers(fresh, max);
}

/** The profile from the server: the player's name and subjects, and their settings unless changed here. */
function takeProfile(b: Books, user: UserProfile): void {
  if (JSON.stringify(user) !== JSON.stringify(session.user)) setSession({ user });
  const serverSettings = appSettingsOf(user);
  const d = getData();
  const changedHere = fingerprint(userSettingsOf(d.settings)) !== b.settingsFp;
  b.settingsFp = fingerprint(userSettingsOf(serverSettings));
  // Another device may have moved the review-card cursor further; never move it back.
  const cardsCursor = Math.max(d.settings.cardsCursor ?? 0, serverSettings.cardsCursor ?? 0);
  const settings: AppSettings = { ...serverSettings, ...(cardsCursor ? { cardsCursor } : {}) };
  const settingsChanged = !changedHere && JSON.stringify(settings) !== JSON.stringify(d.settings);
  const players = playersOf(user, session.team);
  const playersChanged = JSON.stringify(players) !== JSON.stringify(d.players);
  if (!settingsChanged && !playersChanged) return;
  quietly(() =>
    update((draft) => {
      if (settingsChanged) draft.settings = settings;
      if (playersChanged) draft.players = players;
    }),
  );
}

/** The team's settings and members from the server; the team's settings stay as they are if changed here. */
function takeTeam(b: Books, t: TeamResponse): void {
  if (JSON.stringify(t) !== JSON.stringify(session.team)) setSession({ team: t });
  const d = getData();
  const serverTeam = teamOf(t.team);
  const changedHere = !!d.team && fingerprint(teamSettingsOf(d.team)) !== b.teamFp;
  b.teamFp = fingerprint(teamSettingsOf(serverTeam));
  const players = session.user ? playersOf(session.user, t) : d.players;
  const teamChanged = !changedHere && JSON.stringify(serverTeam) !== JSON.stringify(d.team);
  const playersChanged = JSON.stringify(players) !== JSON.stringify(d.players);
  if (!teamChanged && !playersChanged) return;
  quietly(() =>
    update((draft) => {
      if (teamChanged) draft.team = serverTeam;
      if (playersChanged) draft.players = players;
    }),
  );
}

/**
 * The rest of a set of records after its first page (which came with the sync), from the cursor that page was asked
 * with.
 */
async function rest(first: RecordsResponse, fetchPage: (cursor: number) => Promise<RecordsResponse>, from: number): Promise<{ cursor: number; records: RecordOut[] }> {
  const records = [...(first.records ?? [])];
  const cursor = Math.max(from, first.cursor ?? from);
  if (!first.more || cursor === from) return { cursor, records };
  const more = await pullAll(fetchPage, cursor);
  return { cursor: more.cursor, records: [...records, ...more.records] };
}

/**
 * Whether a store's latest revision is behind the cursor this page holds: the store was reset, and what is here is
 * a copy of data that no longer exists.
 */
const behind = (page: RecordsResponse, cursor: number): boolean => typeof page.head === 'number' && page.head < cursor;

const LEFT_TEAM = 'You are no longer on that team (a coach or captain may have removed you, or deleted the team).';

async function refreshOnce(): Promise<void> {
  refreshQueued = false;
  const b = books;
  const e = epoch;
  if (!b || session.status !== 'ready' || !ownSession(b)) return;
  lastRefresh = Date.now();
  try {
    const res = await api.sync(b.userCursor, b.teamCursor, b.teamId);
    if (e !== epoch) return;
    if (res.user.id !== b.me || (res.team?.id ?? null) !== b.teamId || (b.teamId !== null && !res.teamData)) {
      // Joined, left or was removed from a team (here or on another device): load everything again.
      await load(b.teamId && !res.team ? LEFT_TEAM : null);
      return;
    }
    if (behind(res.mine, b.userCursor) || (res.teamData && behind(res.teamData.records, b.teamCursor))) {
      await load();
      return;
    }
    takeProfile(b, res.user);
    const teamId = b.teamId;
    const [mine, theirs] = await Promise.all([
      rest(res.mine, (c) => api.getMyRecords(c), b.userCursor),
      res.teamData && teamId ? rest(res.teamData.records, (c) => api.getTeamRecords(teamId, c), b.teamCursor) : null,
    ]);
    if (e !== epoch) return;
    const fromMe = takeIncoming(b, 'user', mine.records);
    b.userCursor = mine.cursor;
    if (fromMe.length) quietly(() => update((d) => applyUserRecords(d, b.me, fromMe, b.answers)));
    if (res.teamData && theirs) {
      takeTeam(b, teamOnly(res.teamData));
      const fromTeam = takeIncoming(b, 'team', theirs.records);
      b.teamCursor = theirs.cursor;
      if (fromTeam.length) quietly(() => update((d) => applyTeamRecords(d, fromTeam)));
    }
    applyNewAnswers(b);
    // What arrived (and how far the cursors have moved) goes into the device's copy.
    copySoon();
    // The server answered: anything still waiting goes now.
    const left = pendingChanges(getData(), b);
    if (left.user.length || left.team.length || left.settings || left.teamSettings) scheduleFlush(0);
  } catch (err) {
    if (e !== epoch) return;
    if (b.teamId && leftTeam(err)) await load(LEFT_TEAM);
    // Otherwise (no connection): the next refresh tries again; unsaved changes have their own retries.
  }
}

/** The team from a sync, without the page of records that came with it. */
function teamOnly(data: NonNullable<api.SyncResponse['teamData']>): TeamResponse {
  const { records: _records, ...team } = data;
  return team;
}

/* ---------------- loading ---------------- */

/**
 * Before loading again (the player joined or left a team, here or elsewhere), send what they changed in their own
 * records and settings, so it is not lost. Team changes are left: the team may be gone.
 */
async function sendOwnChangesFirst(): Promise<void> {
  const b = books;
  // Only with the same player's session (a token is "<userId>.<secret>"): another account never gets these.
  if (!b || !ownSession(b)) return;
  try {
    const p = pendingChanges(getData(), b);
    if (p.user.length) await sendRecords(b, 'user', p.user, epoch);
    if (p.settings) await api.updateMe({ settings: p.settings });
  } catch {
    /* no connection: the load below says so */
  }
}

/** Load the signed-in player's account, records and team from scratch. */
async function load(message: string | null = null): Promise<void> {
  await sendOwnChangesFirst();
  const e = ++epoch;
  books = null;
  clearTimers();
  localCache.clear();
  failures = 0;
  if (!api.sessionToken()) return endSession(null);
  setSession({ status: 'loading', message });
  try {
    const first = await api.sync(0, 0, null);
    if (e !== epoch) return;
    const me = { user: first.user };
    let team: TeamResponse | null = first.teamData ? teamOnly(first.teamData) : null;
    const teamId = team?.team.id ?? null;
    // The first pages came with the sync; a long history goes on page by page, the player's and the team's together.
    const [mine, teamRecords] = await Promise.all([
      rest(first.mine, (c) => api.getMyRecords(c), 0),
      first.teamData && teamId
        ? rest(first.teamData.records, (c) => api.getTeamRecords(teamId, c), 0).catch((err: unknown) => {
            // Removed from the team a moment ago: carry on without it.
            if (!leftTeam(err)) throw err;
            return null;
          })
        : null,
    ]);
    if (e !== epoch) return;
    if (teamRecords === null) team = null;
    const theirs = teamRecords ?? { cursor: 0, records: [] as RecordOut[] };
    const b: Books = {
      me: me.user.id,
      teamId: team?.team.id ?? null,
      userCursor: mine.cursor,
      teamCursor: theirs.cursor,
      known: new Known(),
      answers: new Map(),
      answerRevs: new Map(),
      settingsFp: '',
      teamFp: null,
    };
    const d = emptyData();
    d.settings = appSettingsOf(me.user);
    d.players = playersOf(me.user, team);
    d.team = team ? teamOf(team.team) : null;
    applyUserRecords(d, b.me, mine.records, b.answers);
    for (const r of mine.records) rememberUserRecord(b, r);
    if (team) {
      applyTeamRecords(d, theirs.records);
      for (const r of theirs.records) if (tracksTeamRecord(r.c) && usableRecord(r)) b.known.set(recordKey(r.c, r.id), r.body === null ? DELETED : recordFingerprint(r.c, r.body));
    }
    b.settingsFp = fingerprint(userSettingsOf(d.settings));
    b.teamFp = d.team ? fingerprint(teamSettingsOf(d.team)) : null;
    books = b;
    lastRefresh = Date.now();
    quietly(() => replaceData(d));
    setSession({ status: 'ready', user: me.user, team, message });
    setConnection({ unsaved: false, failing: false, error: null });
    // Everything came from the server: the device's copy starts again from it.
    openCopy();
    lastWaiting = new Set();
    copyEverything(b);
    applyNewAnswers(b);
    scheduleFlush(0);
  } catch (err) {
    if (e !== epoch) return;
    if (err instanceof api.ApiError && err.status === 401) return; // api.ts signed the player out
    // Nothing from an earlier load stays on show: it could not be saved now anyway.
    quietly(() => replaceData(emptyData()));
    setSession({ status: 'failed', user: null, team: null, message: err instanceof Error ? err.message : String(err) });
    clearTimeout(loadRetryTimer);
    loadRetryTimer = setTimeout(() => {
      if (session.status === 'failed') void queue(() => load());
    }, 15_000);
  }
}

/**
 * Open from the copy on the device, if this session has one: the player's practice is on screen at once, and the
 * server is then asked only for what changed since. False when there is no usable copy (the account then loads
 * from the server as on a first visit).
 */
async function restore(): Promise<boolean> {
  const token = api.sessionToken();
  openCopy();
  const store = copy;
  if (!token || !store) return false;
  let saved: Awaited<ReturnType<CopyStore['read']>>;
  try {
    saved = await store.read();
  } catch {
    dropCopy(store);
    return false;
  }
  const state = saved.state;
  // Someone else's copy, one from another version of the site, or one too old to trust: it goes.
  if (!state || state.v !== COPY_VERSION || !token.startsWith(`${state.me}.`) || Date.now() - state.savedAt > MAX_COPY_AGE_MS) {
    if (state || saved.rows.length) await store.wipe().catch(() => undefined);
    return false;
  }
  if (api.sessionToken() !== token) return false;
  epoch += 1;
  clearTimers();
  localCache.clear();
  failures = 0;
  const b: Books = {
    me: state.me,
    teamId: state.teamId,
    userCursor: state.userCursor,
    teamCursor: state.teamCursor,
    known: new Known(),
    answers: new Map(),
    answerRevs: new Map(),
    settingsFp: state.settingsFp,
    teamFp: state.teamFp,
  };
  const d = emptyData();
  d.settings = { ...state.settings, soloPlayerId: state.me };
  d.players = playersOf(state.user, state.team);
  d.team = state.teamId ? state.localTeam : null;
  const mine: RecordOut[] = [];
  const theirs: RecordOut[] = [];
  for (const row of saved.rows) {
    b.known.set(row.k, row.known);
    if (row.c === 'answers' && typeof row.rev === 'number') b.answerRevs.set(row.id, row.rev);
    if (!row.has) continue;
    if ((TEAM_COLLECTIONS as readonly string[]).includes(row.c)) theirs.push({ c: row.c, id: row.id, body: row.body, rev: row.rev ?? 0 });
    else mine.push({ c: row.c, id: row.id, body: row.body, rev: row.rev ?? 0 });
  }
  applyUserRecords(d, b.me, mine, b.answers);
  if (b.teamId) applyTeamRecords(d, theirs);
  // The rows are as the copy has them: nothing to write until something changes.
  stale.clear();
  lastWaiting = new Set();
  books = b;
  // Not refreshed yet: the look at the server below is the first.
  lastRefresh = 0;
  quietly(() => replaceData(d));
  setSession({ status: 'ready', user: state.user, team: state.team, message: null });
  const waiting = pendingChanges(d, b);
  setConnection({ unsaved: waiting.user.length + waiting.team.length > 0 || !!waiting.settings || !!waiting.teamSettings, failing: false, error: null });
  applyNewAnswers(b);
  scheduleFlush(0);
  void refreshNow();
  return true;
}

/* ---------------- starting, signing in and out ---------------- */

/** Forget the player's data on this page (signed out here, in another tab, or by the server). */
export function endSession(message: string | null): void {
  epoch += 1;
  books = null;
  clearTimers();
  localCache.clear();
  failures = 0;
  quietly(() => replaceData(emptyData()));
  setSession({ status: 'signed-out', user: null, team: null, message });
  setConnection({ unsaved: false, failing: false, error: null, refused: [] });
  forgetDevice();
}

/** After signing in: keep the session and load the account. */
export function beginSession(token: string): Promise<void> {
  api.setSessionToken(token);
  return queue(() => load());
}

/** Load everything again (after joining, leaving or deleting a team). */
export function reloadAccount(message: string | null = null): Promise<void> {
  return queue(() => load(message));
}

/** Fetch what changed on the server now (for example right after a match ends). */
export function refreshNow(): Promise<void> {
  if (refreshQueued) return chain;
  refreshQueued = true;
  return queue(refreshOnce);
}

/** Resolves once the network work queued so far (and anything it queued) is done. For tests and sign-out. */
export async function settled(): Promise<void> {
  for (;;) {
    const tail = chain;
    await tail;
    if (tail === chain) return;
  }
}

/** Send waiting changes now; resolves to whether everything is saved. */
export async function flushNow(): Promise<boolean> {
  clearTimeout(flushTimer);
  await queue(flushOnce);
  return !connection.unsaved;
}

/** Put a fresh copy of the team (after a coach changes members or the invite link) into the session. */
export function takeTeamResponse(t: TeamResponse): void {
  if (books && books.teamId === t.team.id) {
    takeTeam(books, t);
    copySoon();
  }
}

/** Put a fresh copy of the profile (after the player changes their name or subjects) into the session. */
export function takeUserProfile(user: UserProfile): void {
  if (books && books.me === user.id) {
    takeProfile(books, user);
    copySoon();
  }
}

let started = false;

/** Start at page load: load the saved session's account, and keep it fresh. */
export function startCloud(): void {
  if (started) return;
  started = true;
  api.onSessionEnded(() => endSession('You were signed out. Sign in again to keep practicing.'));
  subscribeStore(() => {
    if (quiet || !books) return;
    if (!connection.unsaved) setConnection({ unsaved: true });
    scheduleFlush();
  });
  if (typeof window !== 'undefined') {
    const wake = () => {
      if (session.status === 'failed') void queue(() => load());
      else if (session.status === 'ready') {
        if (connection.unsaved) scheduleFlush(0);
        if (Date.now() - lastRefresh > WAKE_REFRESH_MS) void refreshNow();
      }
    };
    // Whether the player is doing something: a page left open and untouched asks far less often.
    let lastInput = Date.now();
    const noteInput = () => {
      lastInput = Date.now();
    };
    for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(type, noteInput, { passive: true, capture: true });
    setInterval(() => {
      if (document.visibilityState !== 'visible' || session.status !== 'ready') return;
      const every = Date.now() - lastInput < IDLE_AFTER_MS ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS;
      if (Date.now() - lastRefresh >= every) void refreshNow();
    }, REFRESH_CHECK_MS);
    // Leaving the page (another tab, the phone's home screen, closing it): what was just changed goes into the
    // device's copy now, not after the usual short wait, so it is there if the page never comes back.
    const leaving = () => {
      if (!books || session.status !== 'ready' || !copy) return;
      noteWaiting(pendingChanges(getData(), books));
      copyChanges();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') wake();
      else leaving();
    });
    window.addEventListener('pagehide', leaving);
    window.addEventListener('online', wake);
    // Signing in or out in another tab (an email link opens in a new one) carries over to this one.
    window.addEventListener('storage', (event) => {
      if (event.key !== null && event.key !== api.SESSION_KEY) return;
      if (!api.reloadSavedSession()) return;
      if (api.sessionToken()) void queue(() => load());
      else endSession(null);
    });
    window.addEventListener('beforeunload', (event) => {
      if (!connection.unsaved) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }
  // With several tabs open, one writes the device's copy: the first, then whichever is left when it closes.
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (locks?.request) {
    copyWriter = false;
    void locks
      .request('rebound-device-copy', () => {
        copyWriter = true;
        if (books && session.status === 'ready') copyEverything(books);
        return new Promise<never>(() => undefined);
      })
      .catch(() => {
        copyWriter = true;
      });
  }
  if (api.sessionToken()) {
    // Pages for signed-in players show "Loading your account" from the first render, not a sign-in prompt.
    setSession({ status: 'loading' });
    // From the copy on the device when there is one (then only what changed is fetched); from the server otherwise.
    void queue(async () => {
      if (!(await restore())) await load();
    });
  } else setSession({ status: 'signed-out' });
}
