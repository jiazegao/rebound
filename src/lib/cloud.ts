/**
 * The signed-in player's data, between this page and Rebound's server (docs/ACCOUNTS.md, "Site").
 *
 * - Signing in loads everything into the store: the profile (/api/me), the player's own records, and their team's
 *   settings, members and records. Nothing about the player is kept on the device but the session token.
 * - Pages change data only through store.update(). Shortly after a change, the records it touched go to the server:
 *   the player's own to /api/me/records, the team's to /api/teams/:id/records, and changed settings to their own
 *   endpoints. A failed send is retried; while the server cannot be reached, a banner says the last change was not
 *   saved, and sending goes on until it works. There is no offline mode: closing the page loses unsent changes.
 * - Every 30 seconds while the page is visible, the profile, the team and both sets of records are refreshed, so
 *   teammates' work and the player's other devices show up. New game and match answers become review cards then.
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
  const records = new Map(list.map((r) => [recordKey(r.c, r.id), { r, fp: fingerprint(r.body) }]));
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
  b.known.set(recordKey(r.c, r.id), r.body === null ? DELETED : fingerprint(r.body));
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
      for (const ch of batch) b.known.set(recordKey(ch.c, ch.id), ch.body === null ? DELETED : fingerprint(ch.body));
      // A refused change keeps the local copy but is not sent again (until it changes); say why.
      for (const r of res.rejected ?? []) noteRefused(WHAT[r.c] ?? r.c, r.reason);
    } catch (err) {
      if (e !== epoch) return;
      if (scope === 'team' && leftTeam(err)) throw new TeamGone();
      if (err instanceof api.ApiError && !err.retryable && err.status !== 401) {
        // Sending again would not help (too large, not allowed): keep the local copy and say why.
        for (const ch of batch) b.known.set(recordKey(ch.c, ch.id), ch.body === null ? DELETED : fingerprint(ch.body));
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
    else b.known.set(key, r.body === null ? DELETED : fingerprint(r.body));
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
  setSession({ user });
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
  setSession({ team: t });
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

async function refreshOnce(): Promise<void> {
  refreshQueued = false;
  const b = books;
  const e = epoch;
  if (!b || session.status !== 'ready' || !ownSession(b)) return;
  lastRefresh = Date.now();
  try {
    const me = await api.getMe();
    if (e !== epoch) return;
    if (me.user.id !== b.me || (me.team?.id ?? null) !== b.teamId) {
      // Joined, left or was removed from a team (here or on another device): load everything again.
      await load(b.teamId && !me.team ? 'You are no longer on that team (a coach or captain may have removed you, or deleted the team).' : null);
      return;
    }
    takeProfile(b, me.user);
    const mine = await pullAll((c) => api.getMyRecords(c), b.userCursor);
    if (e !== epoch) return;
    const fromMe = takeIncoming(b, 'user', mine.records);
    b.userCursor = mine.cursor;
    if (fromMe.length) quietly(() => update((d) => applyUserRecords(d, b.me, fromMe, b.answers)));
    if (b.teamId) {
      const t = await api.getTeam(b.teamId);
      if (e !== epoch) return;
      takeTeam(b, t);
      const theirs = await pullAll((c) => api.getTeamRecords(b.teamId!, c), b.teamCursor);
      if (e !== epoch) return;
      const fromTeam = takeIncoming(b, 'team', theirs.records);
      b.teamCursor = theirs.cursor;
      if (fromTeam.length) quietly(() => update((d) => applyTeamRecords(d, fromTeam)));
    }
    applyNewAnswers(b);
    // The server answered: anything still waiting goes now.
    const left = pendingChanges(getData(), b);
    if (left.user.length || left.team.length || left.settings || left.teamSettings) scheduleFlush(0);
  } catch (err) {
    if (e !== epoch) return;
    if (b.teamId && leftTeam(err)) await load('You are no longer on that team (a coach or captain may have removed you, or deleted the team).');
    // Otherwise (no connection): the next refresh tries again; unsaved changes have their own retries.
  }
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
    const me = await api.getMe();
    if (e !== epoch) return;
    const mine = await pullAll((c) => api.getMyRecords(c));
    if (e !== epoch) return;
    let team: TeamResponse | null = null;
    let theirs: { cursor: number; records: RecordOut[] } = { cursor: 0, records: [] };
    if (me.team) {
      try {
        team = await api.getTeam(me.team.id);
        theirs = await pullAll((c) => api.getTeamRecords(me.team!.id, c));
      } catch (err) {
        // Removed from the team a moment ago: carry on without it.
        if (!leftTeam(err)) throw err;
        team = null;
        theirs = { cursor: 0, records: [] };
      }
      if (e !== epoch) return;
    }
    const b: Books = {
      me: me.user.id,
      teamId: team?.team.id ?? null,
      userCursor: mine.cursor,
      teamCursor: theirs.cursor,
      known: new Map(),
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
      for (const r of theirs.records) if (tracksTeamRecord(r.c) && usableRecord(r)) b.known.set(recordKey(r.c, r.id), r.body === null ? DELETED : fingerprint(r.body));
    }
    b.settingsFp = fingerprint(userSettingsOf(d.settings));
    b.teamFp = d.team ? fingerprint(teamSettingsOf(d.team)) : null;
    books = b;
    lastRefresh = Date.now();
    quietly(() => replaceData(d));
    setSession({ status: 'ready', user: me.user, team, message });
    setConnection({ unsaved: false, failing: false, error: null });
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
  if (books && books.teamId === t.team.id) takeTeam(books, t);
}

/** Put a fresh copy of the profile (after the player changes their name or subjects) into the session. */
export function takeUserProfile(user: UserProfile): void {
  if (books && books.me === user.id) takeProfile(books, user);
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
        if (Date.now() - lastRefresh > 5_000) void refreshNow();
      }
    };
    setInterval(() => {
      if (document.visibilityState === 'visible' && session.status === 'ready') void refreshNow();
    }, 30_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') wake();
    });
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
  if (api.sessionToken()) {
    // Pages for signed-in players show "Loading your account" from the first render, not a sign-in prompt.
    setSession({ status: 'loading' });
    void queue(() => load());
  } else setSession({ status: 'signed-out' });
}
