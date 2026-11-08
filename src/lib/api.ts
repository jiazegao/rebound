/**
 * Rebound's server (docs/ACCOUNTS.md): where it is, the session, and one typed call for each route.
 *
 * The session token is the only thing about a player the site keeps on the device (in localStorage). A build made
 * without VITE_SERVER_URL asks for the server's address on the sign-in page and keeps it with the session.
 */
import {
  JOIN_CODE_PATTERN,
  type AuthConfig,
  type Change,
  type ChangesResponse,
  type MeResponse,
  type MemberRole,
  type NextEvent,
  type RecordsResponse,
  type SignedIn,
  type TeamInfo,
  type TeamMember,
  type TeamResponse,
  type UserProfile,
  type UserSettings,
} from '../core/accounts';
import type { CoreSubject, Level } from '../core/schema';
import type { AiCardDraft, AiDraft, AiExplanation, AiStatus } from './ai';

/** The server this build was made for ("" when none: the sign-in page then asks for its address). */
export const SERVER_URL: string = ((import.meta.env.VITE_SERVER_URL as string | undefined) ?? '').replace(/\/+$/, '');

/* ---------------- the session on this device ---------------- */

/** The localStorage key of the session (the token, and the server address for builds without one). */
export const SESSION_KEY = 'rebound-session';

interface Saved {
  token?: string;
  /** Only for builds without a server address. */
  server?: string;
}

function readSaved(): Saved {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Saved) : {};
    return {
      ...(typeof parsed.token === 'string' ? { token: parsed.token } : {}),
      ...(typeof parsed.server === 'string' ? { server: parsed.server } : {}),
    };
  } catch {
    return {};
  }
}

// Read once; kept in memory too, so a browser that blocks storage still keeps the session for this visit.
let saved: Saved = readSaved();

function writeSaved(next: Saved): void {
  saved = next;
  try {
    if (next.token || next.server) globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(next));
    else globalThis.localStorage?.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked: the session lasts until the tab closes */
  }
}

/** The server's address: the build's, or the one entered on the sign-in page. */
export function serverUrl(): string {
  return SERVER_URL || saved.server || '';
}

/** "https://example.org/" → "https://example.org", or null when it is not a web address. */
export function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? trimmed : null;
  } catch {
    return null;
  }
}

/** Remember the server address entered on the sign-in page (builds without one only). */
export function setServerUrl(input: string): boolean {
  const url = normalizeServerUrl(input);
  if (!url || SERVER_URL) return false;
  writeSaved({ ...saved, server: url });
  return true;
}

export function sessionToken(): string | null {
  return saved.token ?? null;
}

export function setSessionToken(token: string | null): void {
  writeSaved({ ...(saved.server ? { server: saved.server } : {}), ...(token ? { token } : {}) });
}

const sessionEndedListeners = new Set<() => void>();

/** Called when the server says the session is over (a 401), after the token is forgotten. */
export function onSessionEnded(listener: () => void): () => void {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

/** Another tab signed in or out: pick up its session. Returns whether the token changed. */
export function reloadSavedSession(): boolean {
  const before = saved.token ?? null;
  saved = readSaved();
  return (saved.token ?? null) !== before;
}

/* ---------------- requests ---------------- */

export class ApiError extends Error {
  constructor(
    message: string,
    /** The HTTP status, or 0 when the server could not be reached. */
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** No connection, a busy server or a passing fault: trying again later may work. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

/** A message a student can act on, preferring the server's own words. */
function errorText(status: number, body: Record<string, unknown>): string {
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
  if (status === 401) return 'You are signed out. Sign in again.';
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "Rebound's server could not find that. It may have been deleted.";
  if (status === 413) return 'That is too large to save.';
  if (status === 429) return 'Too many requests right now. Wait a minute and try again.';
  if (status >= 500) return "Rebound's server had a problem. Try again in a minute.";
  return `Rebound's server answered with an error (${status}).`;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Sign-in calls go without the session. */
  auth?: boolean;
  timeoutMs?: number;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = serverUrl();
  if (!base) throw new ApiError('Rebound does not know its server address yet. Enter it on the sign-in page.', 0);
  const token = options.auth === false ? null : sessionToken();
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000) : undefined;
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller?.signal,
    });
  } catch {
    throw new ApiError("Can't reach Rebound's server. Check the internet connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // A session the server no longer knows (expired, or signed out elsewhere): back to the sign-in page.
    if (res.status === 401 && token) {
      setSessionToken(null);
      for (const l of sessionEndedListeners) l();
    }
    throw new ApiError(errorText(res.status, body), res.status, body);
  }
  return body as T;
}

const enc = encodeURIComponent;

/* ---------------- sign-in ---------------- */

export const getAuthConfig = () => request<AuthConfig>('/api/auth/config', { auth: false });

export interface SignupFields {
  over13?: boolean;
  name?: string;
}

export const signInWithGoogleCredential = (credential: string, signup: SignupFields = {}) =>
  request<SignedIn>('/api/auth/google', { method: 'POST', body: { credential, ...signup }, auth: false });

/** `devCode` comes back only from a development server (DEV_EMAIL_OUTBOX), which sends no email. */
export const startEmailSignIn = (email: string) =>
  request<{ ok: true; devCode?: string }>('/api/auth/email/start', { method: 'POST', body: { email }, auth: false });

export const finishEmailSignIn = (code: string, signup: SignupFields = {}) =>
  request<SignedIn>('/api/auth/email/finish', { method: 'POST', body: { code, ...signup }, auth: false });

export const signOutSession = () => request<{ ok: true }>('/api/auth/signout', { method: 'POST', body: {} });

/** The 403 a sign-in answers when there is no account yet: ask for a name and the 13+ confirmation, then retry. */
export function needsSignup(err: unknown): { email: string } | null {
  if (err instanceof ApiError && err.status === 403 && err.body.needsSignup === true) {
    return { email: typeof err.body.email === 'string' ? err.body.email : '' };
  }
  return null;
}

/* ---------------- the signed-in user ---------------- */

export interface ProfileFields {
  name?: string;
  primarySubject?: CoreSubject | null;
  secondarySubject?: CoreSubject | null;
  gradYear?: number | null;
  settings?: UserSettings;
}

export const getMe = () => request<MeResponse>('/api/me');
export const updateMe = (fields: ProfileFields) => request<{ user: UserProfile }>('/api/me', { method: 'PATCH', body: fields });
export const deleteMe = () => request<{ ok: true }>('/api/me', { method: 'DELETE' });
// Record pages can be large (a team's uploaded packets), so reading them may take a while on a slow school network.
export const getMyRecords = (cursor: number) => request<RecordsResponse>(`/api/me/records?cursor=${cursor}`, { timeoutMs: 120_000 });
export const saveMyRecords = (changes: Change[]) => request<ChangesResponse>('/api/me/records', { method: 'POST', body: { changes }, timeoutMs: 60_000 });
export const exportMe = () => request<unknown>('/api/me/export', { timeoutMs: 60_000 });

/* ---------------- teams ---------------- */

export interface MemberFields {
  role?: MemberRole;
  squad?: string | null;
  primarySubject?: CoreSubject | null;
  secondarySubject?: CoreSubject | null;
  gradYear?: number | null;
}

export const createTeamOnServer = (body: { name: string; level: Level; leaveCurrent?: boolean }) =>
  request<{ team: TeamInfo; joinCode: string }>('/api/teams', { method: 'POST', body });
export const getTeam = (teamId: string) => request<TeamResponse>(`/api/teams/${enc(teamId)}`);
export const updateTeamSettings = (teamId: string, body: { name?: string; level?: Level; nextEvent?: NextEvent | null }) =>
  request<{ team: TeamInfo }>(`/api/teams/${enc(teamId)}`, { method: 'PATCH', body });
export const joinTeamOnServer = (teamId: string, body: { secret: string; leaveCurrent?: boolean }) =>
  request<{ team: TeamInfo }>(`/api/teams/${enc(teamId)}/join`, { method: 'POST', body });
export const leaveTeamOnServer = (teamId: string) => request<{ ok: true }>(`/api/teams/${enc(teamId)}/leave`, { method: 'POST', body: {} });
export const updateTeamMember = (teamId: string, userId: string, body: MemberFields) =>
  request<{ member: TeamMember }>(`/api/teams/${enc(teamId)}/members/${enc(userId)}`, { method: 'PATCH', body });
export const removeTeamMember = (teamId: string, userId: string) =>
  request<{ ok: true }>(`/api/teams/${enc(teamId)}/members/${enc(userId)}`, { method: 'DELETE' });
export const newTeamJoinCode = (teamId: string) => request<{ joinCode: string }>(`/api/teams/${enc(teamId)}/join-code`, { method: 'POST', body: {} });
export const deleteTeamOnServer = (teamId: string) => request<{ ok: true }>(`/api/teams/${enc(teamId)}`, { method: 'DELETE' });
export const getTeamRecords = (teamId: string, cursor: number) =>
  request<RecordsResponse>(`/api/teams/${enc(teamId)}/records?cursor=${cursor}`, { timeoutMs: 120_000 });
export const saveTeamRecords = (teamId: string, changes: Change[]) =>
  request<ChangesResponse>(`/api/teams/${enc(teamId)}/records`, { method: 'POST', body: { changes }, timeoutMs: 60_000 });
/** A teammate's visible collections (never their review cards or plans). */
export const getMemberRecords = (teamId: string, userId: string, cursor: number) =>
  request<RecordsResponse>(`/api/teams/${enc(teamId)}/members/${enc(userId)}/records?cursor=${cursor}`, { timeoutMs: 120_000 });

/** The parts of an invite code or link ("…#/join/<teamId>.<secret>" or "<teamId>.<secret>"). */
export function parseJoinCode(input: string): { teamId: string; secret: string; code: string } | null {
  const code = (input.trim().split('/join/').pop() ?? '').trim().replace(/[?#].*$/, '');
  if (!JOIN_CODE_PATTERN.test(code)) return null;
  const [teamId, secret] = code.split('.');
  return { teamId, secret, code };
}

/** The link a captain posts for the team: this site's address with "#/join/<code>". */
export function joinLink(code: string): string {
  return `${location.origin}${location.pathname}#/join/${code}`;
}

/* ---------------- rooms ---------------- */

export interface RoomListing {
  roomId: string;
  name: string;
  host: { userId: string; name: string };
  /** People connected now, not counting the reader (in a match room, everyone). */
  players: number;
  createdAt: number;
  /** "match": an online match the server runs (no reader). */
  kind?: 'reader' | 'match';
  match?: { format: 'teams' | 'ffa'; status: 'lobby' | 'playing' | 'finished' };
}

/** The open rooms made by members of the caller's team. */
export const listRooms = async () => (await request<{ rooms: RoomListing[] }>('/api/rooms?team=1')).rooms;

/** Open a room: a reader room, or with `match` an online match the server runs. Any signed-in player may. */
export const createRoom = async (name: string, match?: unknown) =>
  (await request<{ roomId: string }>('/api/rooms', { method: 'POST', body: match ? { name, match } : { name } })).roomId;

/** The room's WebSocket address (browsers cannot set headers on WebSockets, so the token goes in the query). */
export function roomSocketUrl(roomId: string): string | null {
  const token = sessionToken();
  const base = serverUrl();
  if (!token || !base) return null;
  return `${base.replace(/^http/, 'ws')}/api/rooms/${enc(roomId)}/ws?token=${enc(token)}`;
}

/* ---------------- AI help ---------------- */

export interface AiUsage {
  dailyLimit: number;
  usedToday: number;
}

export const getAiStatus = () => request<AiStatus>('/api/ai');
export const postAiDraft = (body: { passage: string; source: string; subject: CoreSubject; kind: 'tossup' | 'bonus' | 'either'; count: number }) =>
  request<{ drafts: AiDraft[]; model: string } & AiUsage>('/api/ai/draft', { method: 'POST', body, timeoutMs: 120_000 });
export const postAiExplain = (body: { subject: string; stem: string; choices?: unknown; answer: string }) =>
  request<AiExplanation & AiUsage>('/api/ai/explain', { method: 'POST', body, timeoutMs: 60_000 });
export const postAiCard = (body: { concept: string; passage: string; source: string }) =>
  request<{ card: AiCardDraft; model: string } & AiUsage>('/api/ai/card', { method: 'POST', body, timeoutMs: 120_000 });
