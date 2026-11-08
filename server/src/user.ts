/**
 * UserServer: one Durable Object per user (named by the user id). It keeps the user's profile, sessions and own
 * collections (docs/ACCOUNTS.md, "Who owns what"), their AI usage and explanation cache, and which team they are on.
 *
 * The Worker (index.ts) checks every session here (`authenticate`), then forwards the user's own routes with their
 * identity. Making, joining and leaving teams also start here, one at a time per user, so a person is never left on
 * two teams. The team (team.ts) decides membership; this object only remembers which team it is, and hears when a
 * leader removes the user or deletes the team.
 */

import { DurableObject } from 'cloudflare:workers';
import {
  DEFAULT_SETTINGS,
  isUserCollection,
  LEDGER_ID,
  mergeUserRecord,
  PLAN_ID,
  SERVER_WRITTEN,
  TEAM_VISIBLE,
  type MemberRole,
  type UserCollection,
  type UserProfile,
} from '../../src/core/accounts';
import type { Outcome } from '../../src/core/review';
import type { CoreSubject, Level } from '../../src/core/schema';
import {
  AI_BODY_BYTES,
  aiSettings,
  AiUnavailable,
  cachedValue,
  cacheValue,
  checkExplanation,
  draftCard,
  draftQuestions,
  ensureAiTables,
  explainAnswer,
  parseCardInput,
  parseDraftInput,
  parseExplainInput,
  refundAiCalls,
  reserveAiCalls,
  usedToday,
  type AiSettings,
} from './ai';
import { newId, newSecret, sha256Hex } from './crypto';
import { accepted, cursorParam, dispatch, HttpError, identityOf, json, jsonText, readJson, refusing, toErrorResponse, type Identity, type Result, type Routes } from './http';
import { directoryObject, getMeta, hasTable, registryObject, roomObject, setMeta, teamObject } from './objects';
import { parseChanges, Records, RECORDS_SCHEMA, shapeProblem, TOO_LARGE, tooLarge, type Rejection } from './records';
import type { CreatedTeam } from './team';
import { asObject, gradYear, level, MAX_ID_LENGTH, mergeSettings, personName, subject, teamName } from './validate';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, last_used INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS room_visits (room_id TEXT NOT NULL, sid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (room_id, sid));
CREATE TABLE IF NOT EXISTS rooms_made (day TEXT PRIMARY KEY, count INTEGER NOT NULL);
${RECORDS_SCHEMA}
`;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
/** Sessions unused for 180 days expire. */
export const SESSION_IDLE_MS = 180 * DAY;
/** A session's last use is written at most once a minute, not on every request. */
const TOUCH_EVERY_MS = MINUTE;
/** A safety cap: the oldest sessions beyond it end (each sign-in on a new device makes one). */
const MAX_SESSIONS = 50;
/** Rooms the user joined are remembered this long, so signing out can close those connections. */
const VISITS_KEPT_MS = 7 * DAY;
/** Rooms one user may open per UTC day (a safety limit: rooms are open to anyone signed in). */
export const ROOMS_PER_DAY = 30;

const SESSION_ENDED = 'Your session has ended. Please sign in again.';
const SESSION_EXPIRED = 'Your session expired after 180 days without use. Please sign in again.';
export const IN_TEAM = "You're already on a team. You can be on one team at a time.";

/** The copy of a user's details their team keeps (members' names, subjects and graduation years). */
export interface MemberCopy {
  name: string;
  primarySubject?: CoreSubject;
  secondarySubject?: CoreSubject;
  gradYear?: number;
}

export type TeamSummary = { id: string; name: string; level: Level; role: MemberRole };

export type AuthResult = { ok: true; identity: Omit<Identity, 'address'> } | { ok: false; error: string };

export type SignInResult = { ok: true; token: string; user: UserProfile } | { ok: false; needsSignup: true };

/** Fields a leader may change in another member's profile (PATCH /api/teams/:id/members/:userId). */
export interface ProfileFields {
  primarySubject?: CoreSubject | null;
  secondarySubject?: CoreSubject | null;
  gradYear?: number | null;
}

export function copyOf(p: UserProfile): MemberCopy {
  return {
    name: p.name,
    ...(p.primarySubject ? { primarySubject: p.primarySubject } : {}),
    ...(p.secondarySubject ? { secondarySubject: p.secondarySubject } : {}),
    ...(p.gradYear !== undefined ? { gradYear: p.gradYear } : {}),
  };
}

/** Applies subject and graduation-year changes to a profile (null clears a field). */
function applyFields(p: UserProfile, fields: ProfileFields): UserProfile {
  const next: UserProfile = { ...p };
  for (const key of ['primarySubject', 'secondarySubject', 'gradYear'] as const) {
    if (!(key in fields) || fields[key] === undefined) continue;
    if (fields[key] === null) delete next[key];
    else (next as unknown as Record<string, unknown>)[key] = fields[key];
  }
  return next;
}

/** Collections whose records name their player: they must name this user. */
const NAMES_PLAYER: ReadonlySet<string> = new Set(['attempts', 'cards', 'completions', 'plans']);

const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

export class UserServer extends DurableObject<Env> {
  private readonly records: Records;
  /** Whether this object holds an account: false for a fresh object, and again once the account is deleted. */
  private ready: boolean;
  /** Team changes (make, join, leave, delete the account) run one at a time, in order. */
  private teamChanges: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.records = new Records(ctx.storage.sql);
    this.ready = hasTable(ctx.storage.sql, 'meta') && getMeta(ctx.storage.sql, 'profile') !== null;
  }

  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }

  /* ---------------- RPC: sessions and sign-in (from the Worker) ---------------- */

  /**
   * The user behind a session, by the SHA-256 of the token's secret. `visitRoom` records a room the session is
   * connecting to, so signing out can close that connection.
   */
  async authenticate(tokenHash: string, now: number, visitRoom: string | null = null): Promise<AuthResult> {
    const profile = this.profile();
    if (!profile) return { ok: false, error: SESSION_ENDED };
    const session = this.sql.exec<{ last_used: number }>('SELECT last_used FROM sessions WHERE token_hash = ?', tokenHash).toArray()[0];
    if (!session) return { ok: false, error: SESSION_ENDED };
    if (session.last_used <= now - SESSION_IDLE_MS) {
      this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
      return { ok: false, error: SESSION_EXPIRED };
    }
    if (now - session.last_used >= TOUCH_EVERY_MS) this.sql.exec('UPDATE sessions SET last_used = ? WHERE token_hash = ?', now, tokenHash);
    const sid = tokenHash.slice(0, 16);
    if (visitRoom !== null) {
      this.sql.exec('DELETE FROM room_visits WHERE at <= ?', now - VISITS_KEPT_MS);
      this.sql.exec('INSERT INTO room_visits (room_id, sid, at) VALUES (?, ?, ?) ON CONFLICT (room_id, sid) DO UPDATE SET at = excluded.at', visitRoom, sid, now);
    }
    return {
      ok: true,
      identity: {
        userId: profile.id,
        name: profile.name,
        sid,
        teamId: this.teamId(),
        ...(profile.primarySubject ? { primarySubject: profile.primarySubject } : {}),
        ...(profile.secondarySubject ? { secondarySubject: profile.secondarySubject } : {}),
      },
    };
  }

  /**
   * A new session for a person the Directory identified. Without an account here yet, `signup` (their name; they
   * confirmed they are 13 or older) makes it; without either, the person must sign up first.
   */
  async signIn(input: { userId: string; email: string; signup: { name: string } | null }, now: number): Promise<SignInResult> {
    // The slow part first, so the checks and writes below run without a gap.
    const secret = newSecret();
    const tokenHash = await sha256Hex(secret);
    let profile = this.profile();
    if (!profile) {
      if (!input.signup) return { ok: false, needsSignup: true };
      // The Directory and this object agree on the id: it is this object's name.
      if (!/^[a-z2-7]{16}$/.test(input.userId)) throw new Error('Bad user id');
      profile = { id: input.userId, email: input.email, name: input.signup.name, createdAt: now, over13At: now, settings: { ...DEFAULT_SETTINGS } };
      const created = profile;
      this.ctx.storage.transactionSync(() => {
        this.sql.exec(SCHEMA);
        setMeta(this.sql, 'profile', JSON.stringify(created));
      });
      this.ready = true;
    }
    this.sql.exec('DELETE FROM sessions WHERE last_used <= ?', now - SESSION_IDLE_MS);
    this.sql.exec('INSERT INTO sessions (token_hash, created_at, last_used) VALUES (?, ?, ?)', tokenHash, now, now);
    this.sql.exec(
      'DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions ORDER BY last_used DESC, created_at DESC LIMIT -1 OFFSET ?)',
      MAX_SESSIONS,
    );
    return { ok: true, token: `${profile.id}.${secret}`, user: profile };
  }

  /* ---------------- RPC: from teams and rooms ---------------- */

  /** The team removed this user, or was deleted. Ignored if the user has moved on to another team meanwhile. */
  async teamLeft(teamId: string): Promise<void> {
    if (this.ready && this.teamId() === teamId) this.setTeam(null, null);
  }

  /** Answers from an online match (server writes: they replace what is stored under the same id). */
  async putAnswers(outcomes: Outcome[]): Promise<void> {
    if (!this.ready || !Array.isArray(outcomes)) return;
    const userId = this.profile()!.id;
    this.ctx.storage.transactionSync(() => {
      for (const o of outcomes) if (this.isAnswerFor(userId, o)) this.records.put('answers', o.key, o);
    });
  }

  /**
   * This user's answers from one team game (`game:<gameId>:...`), replacing whatever an earlier save of the game
   * gave: a game judged again after it ended changes them, and a game put back in progress or deleted takes them
   * away (an empty list). `version` grows with every save of the game, so an older save that arrives late (a retried
   * delivery) never undoes a newer one.
   */
  async putGameAnswers(gameId: string, version: number, outcomes: Outcome[]): Promise<void> {
    if (!this.ready || typeof gameId !== 'string' || !gameId || gameId.length > MAX_ID_LENGTH || !Number.isSafeInteger(version) || !Array.isArray(outcomes)) return;
    const userId = this.profile()!.id;
    const prefix = `game:${gameId}:`;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('CREATE TABLE IF NOT EXISTS game_answers (game_id TEXT PRIMARY KEY, version INTEGER NOT NULL)');
      const applied = this.sql.exec<{ version: number }>('SELECT version FROM game_answers WHERE game_id = ?', gameId).toArray()[0]?.version;
      if (applied !== undefined && applied >= version) return;
      this.sql.exec('INSERT INTO game_answers (game_id, version) VALUES (?, ?) ON CONFLICT (game_id) DO UPDATE SET version = excluded.version', gameId, version);
      const kept = new Set<string>();
      for (const o of outcomes) {
        if (!this.isAnswerFor(userId, o) || !o.key.startsWith(prefix)) continue;
        kept.add(o.key);
        this.records.put('answers', o.key, o);
      }
      const stored = this.sql
        .exec<{ id: string }>("SELECT id FROM records WHERE c = 'answers' AND body IS NOT NULL AND substr(id, 1, ?) = ?", prefix.length, prefix)
        .toArray();
      for (const { id } of stored) if (!kept.has(id)) this.records.put('answers', id, null);
    });
  }

  private isAnswerFor(userId: string, o: Outcome | null | undefined): o is Outcome {
    return !!o && typeof o.key === 'string' && o.key.length >= 1 && o.key.length <= MAX_ID_LENGTH && o.playerId === userId && !tooLarge(o);
  }

  /** What teammates may read: the TEAM_VISIBLE collections, as a records page (JSON text). */
  async visibleRecords(cursor: number): Promise<string> {
    if (!this.ready) return `{"cursor":${cursor},"records":[],"more":false}`;
    return this.records.page(cursor, { only: TEAM_VISIBLE });
  }

  /** A leader changed this user's subjects or graduation year on the team: the profile changes, and its copy returns. */
  async applyProfile(fields: ProfileFields): Promise<MemberCopy | null> {
    const profile = this.profile();
    if (!profile) return null;
    const next = applyFields(profile, fields);
    setMeta(this.sql, 'profile', JSON.stringify(next));
    return copyOf(next);
  }

  /** Counts a room the user opens today, or refuses it (ROOMS_PER_DAY). */
  async reserveRoom(now: number): Promise<Result> {
    return refusing(() => {
      if (!this.ready) throw new HttpError(401, SESSION_ENDED);
      const day = dayOf(now);
      this.sql.exec('DELETE FROM rooms_made WHERE day < ?', day);
      const made = this.sql.exec<{ count: number }>('SELECT count FROM rooms_made WHERE day = ?', day).toArray()[0]?.count ?? 0;
      if (made >= ROOMS_PER_DAY) {
        const wait = (Date.parse(`${day}T00:00:00Z`) + DAY - now) / 1000;
        throw new HttpError(429, `You have opened ${ROOMS_PER_DAY} rooms today. You can open more tomorrow.`, wait);
      }
      this.sql.exec('INSERT INTO rooms_made (day, count) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET count = count + 1', day);
      return {};
    });
  }

  /* ---------------- HTTP: the user's own routes, forwarded with their identity ---------------- */

  async fetch(request: Request): Promise<Response> {
    try {
      const identity = identityOf(request);
      if (!this.ready || this.profile()?.id !== identity.userId) throw new HttpError(401, SESSION_ENDED);
      return await dispatch(this.routes(identity), request, new URL(request.url).pathname);
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  private routes(identity: Identity): Routes {
    return [
      [/^\/api\/me$/, { GET: () => this.getMe(), PATCH: (r) => this.patchMe(r), DELETE: () => this.deleteMe() }],
      [/^\/api\/me\/records$/, { GET: (_r, url) => jsonText(this.records.page(cursorParam(url))), POST: (r) => this.putRecords(r) }],
      [/^\/api\/me\/export$/, { GET: () => this.exportAll() }],
      [/^\/api\/auth\/signout$/, { POST: () => this.signOut(identity) }],
      [/^\/api\/teams$/, { POST: (r) => this.createTeam(r, identity) }],
      [/^\/api\/teams\/([a-z2-7]{16})\/join$/, { POST: (r, _u, [teamId]) => this.joinTeam(r, teamId!) }],
      [/^\/api\/teams\/([a-z2-7]{16})\/leave$/, { POST: (_r, _u, [teamId]) => this.leaveTeam(teamId!) }],
      [/^\/api\/ai$/, { GET: () => this.aiStatus() }],
      [/^\/api\/ai\/draft$/, { POST: (r) => this.aiDraft(r) }],
      [/^\/api\/ai\/explain$/, { POST: (r) => this.aiExplain(r) }],
      [/^\/api\/ai\/card$/, { POST: (r) => this.aiCard(r) }],
    ];
  }

  /* ---------------- me ---------------- */

  private async getMe(): Promise<Response> {
    const team = await this.refreshTeam(Date.now());
    this.requireReady();
    return json({ user: this.profile(), team });
  }

  /**
   * The user's team, checked with the team itself, which also takes the latest copy of the user's name and subjects
   * (so a copy that missed an update catches up). If the team cannot be reached, what this object last knew.
   */
  private async refreshTeam(now: number): Promise<TeamSummary | null> {
    const teamId = this.teamId();
    if (teamId === null) return null;
    let summary: TeamSummary | null;
    try {
      summary = await teamObject(this.env, teamId).syncMember(this.profile()!.id, copyOf(this.profile()!), now);
    } catch (error) {
      console.error('Checking the team failed:', error instanceof Error ? error.message : String(error));
      return this.cachedTeam();
    }
    this.requireReady();
    // A team change that finished meanwhile knows better.
    if (this.teamId() !== teamId) return this.cachedTeam();
    this.setTeam(summary ? teamId : null, summary);
    return summary;
  }

  private async patchMe(request: Request): Promise<Response> {
    const body = asObject(await readJson(request));
    this.requireReady();
    const profile = this.profile()!;
    // Everything is checked before anything is saved.
    let next: UserProfile = { ...profile };
    if ('name' in body) next.name = personName(body.name);
    const fields: ProfileFields = {};
    if ('primarySubject' in body) fields.primarySubject = subject(body.primarySubject);
    if ('secondarySubject' in body) fields.secondarySubject = subject(body.secondarySubject);
    if ('gradYear' in body) fields.gradYear = gradYear(body.gradYear);
    next = applyFields(next, fields);
    if ('settings' in body) next.settings = mergeSettings(profile.settings, body.settings);
    setMeta(this.sql, 'profile', JSON.stringify(next));
    // The team keeps a copy of the name, subjects and graduation year.
    if (JSON.stringify(copyOf(next)) !== JSON.stringify(copyOf(profile))) await this.refreshTeam(Date.now());
    this.requireReady();
    return json({ user: this.profile() });
  }

  /** Leaves the team (as for leaving it), forgets the email and Google account, and deletes everything. */
  private deleteMe(): Promise<Response> {
    return this.oneAtATime(async () => {
      this.requireReady();
      const userId = this.profile()!.id;
      const teamId = this.teamId();
      if (teamId !== null) {
        const left = await teamObject(this.env, teamId).removeMember(userId);
        // Not on that team after all (403) or no such team (404): nothing to leave.
        if (!left.ok && left.status !== 403 && left.status !== 404) accepted(left);
      }
      await directoryObject(this.env).forget(userId);
      this.requireReady();
      await this.closeRoomConnections(null);
      this.ready = false;
      await this.ctx.storage.deleteAll();
      return json({ ok: true });
    });
  }

  private exportAll(): Response {
    const profile = this.profile()!;
    const text = `{"format":"rebound-account","version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"user":${JSON.stringify(profile)},"team":${JSON.stringify(this.cachedTeam())},"records":${this.records.all()}}`;
    const file = `rebound-${profile.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'account'}.json`;
    return jsonText(text, 200, { 'Content-Disposition': `attachment; filename="${file}"` });
  }

  /* ---------------- records ---------------- */

  private async putRecords(request: Request): Promise<Response> {
    const changes = parseChanges(await readJson(request));
    this.requireReady();
    const userId = this.profile()!.id;
    const result = this.ctx.storage.transactionSync(() => {
      const rejected: Rejection[] = [];
      for (const change of changes) {
        const reason = shapeProblem(change) ?? this.problemWith(change.c, change.id, change.body, userId);
        if (reason) {
          rejected.push({ c: change.c, id: change.id, reason });
          continue;
        }
        const c = change.c as UserCollection;
        // Several devices of one user can write at once: ledgers and review cards merge, answers never change.
        const merged = mergeUserRecord(c, this.records.body(c, change.id), change.body);
        if (tooLarge(merged)) {
          rejected.push({ c, id: change.id, reason: TOO_LARGE });
          continue;
        }
        this.records.put(c, change.id, merged);
      }
      return { cursor: this.records.rev(), rejected };
    });
    return json(result);
  }

  /** Why the user may not store this record, or null. */
  private problemWith(c: string, id: string, body: unknown, userId: string): string | null {
    if (!isUserCollection(c)) return "This kind of data isn't kept with your account.";
    if (SERVER_WRITTEN.has(c)) return 'Game answers are recorded by the server.';
    if ((c === 'seen' || c === 'conceptReads') && id !== LEDGER_ID) return `This record's id must be "${LEDGER_ID}".`;
    if (c === 'plans' && id !== PLAN_ID) return `This record's id must be "${PLAN_ID}".`;
    // Teammates see these records; one must not be able to put words in another player's mouth.
    const playerId = body !== null ? (body as Record<string, unknown>).playerId : undefined;
    if (NAMES_PLAYER.has(c) && playerId !== undefined && playerId !== userId) return 'This record belongs to another player.';
    return null;
  }

  /* ---------------- sessions ---------------- */

  private async signOut(identity: Identity): Promise<Response> {
    this.sql.exec('DELETE FROM sessions WHERE substr(token_hash, 1, 16) = ?', identity.sid);
    await this.closeRoomConnections(identity.sid);
    return json({ ok: true });
  }

  /** Closes the room connections of one session (signing out), or of every session (deleting the account). */
  private async closeRoomConnections(sid: string | null): Promise<void> {
    const since = Date.now() - VISITS_KEPT_MS;
    const rooms =
      sid === null
        ? this.sql.exec<{ room_id: string }>('SELECT DISTINCT room_id FROM room_visits WHERE at > ?', since).toArray()
        : this.sql.exec<{ room_id: string }>('SELECT room_id FROM room_visits WHERE sid = ? AND at > ?', sid, since).toArray();
    const userId = this.profile()!.id;
    const results = await Promise.allSettled(
      rooms.map(({ room_id }) => (sid === null ? roomObject(this.env, room_id).closeUser(userId) : roomObject(this.env, room_id).closeSession(sid))),
    );
    for (const r of results) if (r.status === 'rejected') console.error('Closing a room connection failed:', String(r.reason));
    if (this.ready) {
      if (sid === null) this.sql.exec('DELETE FROM room_visits');
      else this.sql.exec('DELETE FROM room_visits WHERE sid = ?', sid);
    }
  }

  /* ---------------- teams: one at a time ---------------- */

  /** `POST /api/teams`: a new team with this user as its captain (leaving their current team with `leaveCurrent`). */
  private async createTeam(request: Request, identity: Identity): Promise<Response> {
    const body = asObject(await readJson(request));
    const name = teamName(body.name);
    const teamLevel = level(body.level);
    const leaveCurrent = body.leaveCurrent === true;
    return this.oneAtATime(async () => {
      this.requireReady();
      const profile = this.profile()!;
      const current = this.teamId();
      if (current !== null) await this.checkCanLeave(current, leaveCurrent);
      // Sign-up is open to any school; the registry caps new teams per network address and per day.
      const reservation = await registryObject(this.env).reserveTeam(identity.address, Date.now());
      if (!reservation.ok) throw new HttpError(429, reservation.message, reservation.retryAfter);
      // Ids carry 80 random bits, so a clash is practically impossible; a taken id is refused and another drawn.
      let created: CreatedTeam | null = null;
      for (let attempt = 0; attempt < 3 && !created; attempt++) {
        const teamId = newId();
        created = await teamObject(this.env, teamId).create({ teamId, name, level: teamLevel, captain: { userId: profile.id, ...copyOf(profile) }, now: Date.now() });
      }
      if (!created) throw new HttpError(503, "The team couldn't be created right now. Please try again.");
      if (current !== null) await this.leaveAfterJoining(current, created.team.id);
      this.requireReady();
      this.setTeam(created.team.id, { id: created.team.id, name: created.team.name, level: created.team.level, role: 'captain' });
      return json({ team: created.team, joinCode: created.joinCode }, 201);
    });
  }

  /** `POST /api/teams/:id/join { secret, leaveCurrent? }`. */
  private async joinTeam(request: Request, teamId: string): Promise<Response> {
    const body = asObject(await readJson(request));
    const secret = typeof body.secret === 'string' ? body.secret.trim().toLowerCase() : '';
    if (!secret) throw new HttpError(400, 'The join code is missing. Open the join link from your captain again.');
    const leaveCurrent = body.leaveCurrent === true;
    return this.oneAtATime(async () => {
      this.requireReady();
      const profile = this.profile()!;
      const current = this.teamId();
      const moving = current !== null && current !== teamId;
      if (moving) await this.checkCanLeave(current, leaveCurrent);
      const joined = accepted(await teamObject(this.env, teamId).addMember({ secret, member: { userId: profile.id, ...copyOf(profile) }, now: Date.now() }));
      if (moving) await this.leaveAfterJoining(current, teamId);
      this.requireReady();
      this.setTeam(teamId, { id: teamId, name: joined.team.name, level: joined.team.level, role: joined.role });
      return json({ team: joined.team });
    });
  }

  /** `POST /api/teams/:id/leave`. The last member leaving deletes the team; the last leader must hand over first. */
  private leaveTeam(teamId: string): Promise<Response> {
    return this.oneAtATime(async () => {
      this.requireReady();
      const left = await teamObject(this.env, teamId).removeMember(this.profile()!.id);
      this.requireReady();
      const mine = this.teamId() === teamId;
      // Already gone from that team (removed by a leader, or the team was deleted): the leave is done.
      if (!left.ok && !(mine && (left.status === 403 || left.status === 404))) accepted(left);
      if (mine) this.setTeam(null, null);
      return json({ ok: true });
    });
  }

  /** Before moving to another team: allowed only with `leaveCurrent`, and not for the current team's last leader. */
  private async checkCanLeave(current: string, leaveCurrent: boolean): Promise<void> {
    if (!leaveCurrent) throw new HttpError(409, IN_TEAM, undefined, { inTeam: true });
    accepted(await teamObject(this.env, current).canLeave(this.profile()!.id));
    this.requireReady();
  }

  /**
   * Leaves the old team once the new one has the user, so a refused join never costs them their team. If the old
   * team refuses after all (its other leader stepped down meanwhile), the join is undone.
   */
  private async leaveAfterJoining(oldTeamId: string, newTeamId: string): Promise<void> {
    const userId = this.profile()!.id;
    const left = await teamObject(this.env, oldTeamId).removeMember(userId);
    if (!left.ok && left.status !== 403 && left.status !== 404) {
      await teamObject(this.env, newTeamId).removeMember(userId);
      accepted(left);
    }
  }

  private oneAtATime<T>(work: () => Promise<T>): Promise<T> {
    const run = this.teamChanges.then(work);
    this.teamChanges = run.catch(() => undefined);
    return run;
  }

  /* ---------------- AI help (optional; see ai.ts) ---------------- */

  private aiStatus(): Response {
    const settings = aiSettings(this.env);
    if (!settings) return json({ enabled: false });
    return json({ enabled: true, model: settings.model, ...this.aiUsage(settings) });
  }

  /** Question drafts from a cited passage, each with a blind answer check. Uses one call plus one per draft. */
  private async aiDraft(request: Request): Promise<Response> {
    const settings = this.requireAi();
    const input = parseDraftInput(await readJson(request, AI_BODY_BYTES), this.level());
    const result = await this.withAiCalls(settings, 1 + input.count, () => draftQuestions(settings, input));
    return json({ drafts: result.drafts, model: result.model, ...this.aiUsage(settings) });
  }

  /** An explanation of a question's answer, cached for this user, so a question is explained once. */
  private async aiExplain(request: Request): Promise<Response> {
    const settings = this.requireAi();
    const input = parseExplainInput(await readJson(request, AI_BODY_BYTES), this.level());
    const key = await sha256Hex(JSON.stringify(['explain', settings.model, input]));
    this.requireReady();
    ensureAiTables(this.sql);
    const hit = cachedValue(this.sql, key, Date.now()) as { model?: unknown } | null;
    const cached = checkExplanation(hit);
    if (cached && typeof hit?.model === 'string') return json({ ...cached, model: hit.model, cached: true, ...this.aiUsage(settings) });
    const result = await this.withAiCalls(settings, 1, () => explainAnswer(settings, input));
    this.requireReady();
    cacheValue(this.sql, key, result, Date.now());
    return json({ ...result, cached: false, ...this.aiUsage(settings) });
  }

  private async aiCard(request: Request): Promise<Response> {
    const settings = this.requireAi();
    const input = parseCardInput(await readJson(request, AI_BODY_BYTES));
    const result = await this.withAiCalls(settings, 1, () => draftCard(settings, input));
    return json({ card: result.card, model: result.model, ...this.aiUsage(settings) });
  }

  private requireAi(): AiSettings {
    const settings = aiSettings(this.env);
    if (!settings) throw new HttpError(404, 'AI help is not turned on for this server.');
    return settings;
  }

  /** Questions are written for the level of the user's team (high school without one). */
  private level(): 'HS' | 'MS' {
    return this.cachedTeam()?.level === 'MS' ? 'MS' : 'HS';
  }

  private aiUsage(settings: AiSettings): { dailyLimit: number; usedToday: number } {
    this.requireReady();
    ensureAiTables(this.sql);
    return { dailyLimit: settings.dailyLimit, usedToday: usedToday(this.sql, Date.now()) };
  }

  /**
   * Counts `calls` against the user's daily limit before `work` starts (so parallel requests can't overrun it),
   * then gives back the calls that never reached the model: a failed call, or fewer drafts than asked.
   */
  private async withAiCalls<T>(settings: AiSettings, calls: number, work: () => Promise<T>): Promise<T> {
    this.requireReady();
    ensureAiTables(this.sql);
    const day = reserveAiCalls(this.sql, settings.dailyLimit, calls, Date.now());
    let used = calls;
    try {
      const result = await work();
      const reported = (result as { calls?: unknown }).calls;
      if (typeof reported === 'number') used = Math.min(calls, reported);
      return result;
    } catch (error) {
      // Only the first call runs before anything can fail (drafting stops there), unless it never ran at all.
      used = error instanceof AiUnavailable ? 0 : 1;
      throw error;
    } finally {
      if (this.ready && used < calls) refundAiCalls(this.sql, day, calls - used);
    }
  }

  /* ---------------- helpers ---------------- */

  private profile(): UserProfile | null {
    if (!this.ready) return null;
    const text = getMeta(this.sql, 'profile');
    return text === null ? null : (JSON.parse(text) as UserProfile);
  }

  private teamId(): string | null {
    return getMeta(this.sql, 'teamId') || null;
  }

  private cachedTeam(): TeamSummary | null {
    const text = getMeta(this.sql, 'team');
    return text ? (JSON.parse(text) as TeamSummary) : null;
  }

  private setTeam(teamId: string | null, summary: TeamSummary | null): void {
    setMeta(this.sql, 'teamId', teamId ?? '');
    setMeta(this.sql, 'team', summary ? JSON.stringify(summary) : '');
  }

  /** After any wait: the account may have been deleted meanwhile. */
  private requireReady(): void {
    if (!this.ready) throw new HttpError(401, SESSION_ENDED);
  }
}
