/**
 * TeamServer: one Durable Object per team. It owns the team's SQLite database (members, sessions, synced
 * records, rooms) and hosts the team's live rooms. The Worker (index.ts) forwards `/api/teams/:teamId/...`
 * here and creates new teams through CREATE_PATH. One team's object never touches another team's data.
 */

import { DurableObject } from 'cloudflare:workers';
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
  type TeamLevel,
} from './ai';
import {
  hashPin,
  newId,
  newJoinSecret,
  newSessionToken,
  SECRET_PATTERN,
  secretMatches,
  sha256Hex,
  TEAM_ID_PATTERN,
  TOKEN_PATTERN,
  verifyPin,
} from './crypto';
import { HttpError, json, jsonText, readJson, toErrorResponse } from './http';
import { parseMatchSetup } from './match';
import { parseSyncRequest, runSync } from './records';
import { closeQuietly, Rooms, sessionTag } from './rooms';
import { isLeader, memberInfo, publicMember, Store, type MemberRow } from './store';
import { asObject, createTeamInput, memberName, nameKey, pin, playerId, role, roomName } from './validate';

/** The Worker creates teams through this path. Outside requests can't reach it: the Worker only forwards /api/... paths. */
export const CREATE_PATH = '/internal/create-team';

export const TEAM_NOT_FOUND = "We couldn't find that team. Check the join link with your captain.";
const SIGN_IN_AGAIN = 'Please sign in again.';
const LEADERS_ONLY = 'Only coaches and captains can do that.';
const LAST_LEADER = 'A team needs at least one coach or captain. Make someone else a coach or captain first.';

const MINUTE = 60 * 1000;
/** Unused sessions expire after 180 days. */
const SESSION_IDLE_MS = 180 * 24 * 60 * MINUTE;
/** Five wrong PINs lock a member for 15 minutes. */
const PIN_TRIES = 5;
const LOCK_MS = 15 * MINUTE;
/** 30 failed joins per address per hour. Kept per team object (see README: a per-team, not global, limit). */
const ADDRESS_FAILURES = 30;
const ADDRESS_WINDOW_MS = 60 * MINUTE;
/** A safety cap, far above any real team. */
const MAX_MEMBERS = 200;
/** Session and last-seen times are written at most once a minute, not on every request. */
const TOUCH_EVERY_MS = MINUTE;

/** A wrong secret or PIN, or a try on a locked name: these count against the address's limit. */
class FailedGuess extends HttpError {}

interface Session {
  member: MemberRow;
  tokenHash: string;
  /** Short id of the session, used to close its live room connections when it signs out. */
  sid: string;
}

type Handler = (request: Request, url: URL, params: string[], now: number) => Promise<Response> | Response;

function minutes(ms: number): string {
  const n = Math.max(1, Math.ceil(ms / MINUTE));
  return n === 1 ? '1 minute' : `${n} minutes`;
}

export class TeamServer extends DurableObject<Env> {
  private readonly store: Store;
  private readonly rooms: Rooms;
  /** Whether this object holds a team: false for a fresh object, and again after the team is deleted. */
  private ready: boolean;

  /** Paths after /api/teams/:teamId, with a handler per method. */
  private readonly routes: Array<[RegExp, Partial<Record<string, Handler>>]> = [
    [/^$/, { DELETE: (r) => this.deleteTeam(r) }],
    [/^\/join$/, { POST: (r, _u, _p, now) => this.join(r, now) }],
    [/^\/me$/, { GET: (r) => this.me(r) }],
    [/^\/signout$/, { POST: (r) => this.signOut(r) }],
    [/^\/pin$/, { POST: (r) => this.changePin(r) }],
    [/^\/sync$/, { POST: (r) => this.sync(r) }],
    [/^\/members$/, { GET: (r) => this.listMembers(r) }],
    [/^\/members\/([^/]+)$/, { PATCH: (r, _u, [id]) => this.updateMember(r, id!), DELETE: (r, _u, [id]) => this.removeMember(r, id!) }],
    [/^\/join-code$/, { POST: (r) => this.rotateJoinCode(r) }],
    [/^\/rooms$/, { POST: (r) => this.createRoom(r), GET: (r) => this.listRooms(r) }],
    [/^\/rooms\/([^/]+)\/ws$/, { GET: (r, u, [roomId]) => this.openRoomSocket(r, u, roomId!) }],
    [/^\/ai$/, { GET: (r) => this.aiStatus(r) }],
    [/^\/ai\/draft$/, { POST: (r) => this.aiDraft(r) }],
    [/^\/ai\/explain$/, { POST: (r) => this.aiExplain(r) }],
    [/^\/ai\/card$/, { POST: (r) => this.aiCard(r) }],
  ];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new Store(ctx.storage.sql);
    this.rooms = new Rooms(ctx, this.store);
    this.ready = this.store.hasTeam();
    // Waking up (after hibernation or eviction): re-create timers for buzz windows still being collected.
    if (this.ready) this.rooms.resume(Date.now());
  }

  private get sql(): SqlStorage {
    return this.store.sql;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === CREATE_PATH && request.method === 'POST') return await this.createTeam(request);
      const match = /^\/api\/teams\/([a-z2-7]{16})(\/.*)?$/.exec(url.pathname);
      if (!match || !this.ready || this.store.meta('teamId') !== match[1]) throw new HttpError(404, TEAM_NOT_FOUND);
      const rest = match[2] ?? '';
      for (const [pattern, methods] of this.routes) {
        const params = pattern.exec(rest);
        if (!params) continue;
        const handler = methods[request.method];
        if (!handler) throw new HttpError(405, "That action isn't supported here.");
        return await handler(request, url, params.slice(1), Date.now());
      }
      throw new HttpError(404, 'Not found.');
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  /* ---------------- live rooms (WebSocket Hibernation API) ---------------- */

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (!this.ready) return closeQuietly(ws, 4004, 'This team was deleted.');
    try {
      this.rooms.message(ws, message, Date.now());
    } catch (error) {
      console.error('Room message failed:', error instanceof Error ? (error.stack ?? error.message) : String(error));
      try {
        ws.send(JSON.stringify({ type: 'error', message: 'Something went wrong on the team server.' }));
      } catch {
        // closing
      }
    }
  }

  webSocketClose(ws: WebSocket): void {
    if (this.ready) this.rooms.closed(ws, Date.now());
    // Completes the closing handshake on runtimes that do not reply to a close by themselves.
    closeQuietly(ws, 1000, 'Closed');
  }

  webSocketError(ws: WebSocket): void {
    if (this.ready) this.rooms.closed(ws, Date.now());
  }

  /** Backup for the buzz window timer (see rooms.ts). */
  alarm(): void {
    if (this.ready) this.rooms.alarm(Date.now());
  }

  /* ---------------- team creation and deletion ---------------- */

  private async createTeam(request: Request): Promise<Response> {
    const body = asObject(await readJson(request));
    const teamId = typeof body.teamId === 'string' && TEAM_ID_PATTERN.test(body.teamId) ? body.teamId : null;
    if (!teamId) throw new HttpError(400, 'Missing team id.');
    const input = createTeamInput(body);
    if (this.ready) throw new HttpError(409, 'That team id is taken.');

    // The slow work (hashing) comes first, so the writes below run in one uninterrupted transaction.
    const pinHash = await hashPin(input.pin);
    const secret = newJoinSecret();
    const secretHash = await sha256Hex(secret);
    const { token, tokenHash } = await newSession();
    if (this.ready) throw new HttpError(409, 'That team id is taken.');

    const now = Date.now();
    const member = newMember(input.memberName, 'captain', input.playerId, pinHash, now);
    this.ctx.storage.transactionSync(() => {
      this.store.createSchema();
      this.store.setMeta('teamId', teamId);
      this.store.setMeta('teamName', input.teamName);
      this.store.setMeta('level', input.level);
      this.store.setMeta('joinSecretHash', secretHash);
      this.store.setMeta('rev', 0);
      this.store.setMeta('createdAt', now);
      // Salt for the hashed addresses in join_failures, so raw IP addresses are never stored.
      this.store.setMeta('addressSalt', newId(32));
      this.insertMember(member);
      this.insertSession(tokenHash, member.id, now);
    });
    this.ready = true;
    return json({ teamId, joinCode: `${teamId}.${secret}`, token, member: publicMember(member) }, 201);
  }

  private async deleteTeam(request: Request): Promise<Response> {
    const session = await this.authenticate(request);
    this.requireLeader(session.member.id);
    this.ready = false;
    this.rooms.shutdown('This team was deleted.');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    return json({ ok: true });
  }

  /* ---------------- joining and signing in ---------------- */

  private async join(request: Request, now: number): Promise<Response> {
    const body = asObject(await readJson(request));
    const secret = typeof body.secret === 'string' ? body.secret.trim().toLowerCase() : '';
    if (!secret) throw new HttpError(400, 'The join code is missing. Open the join link from your captain again.');
    const name = memberName(body.memberName);
    const pinValue = pin(body.pin);
    const player = playerId(body.playerId);

    const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    this.requireReady();
    const addressKey = await sha256Hex(`${this.store.meta('addressSalt')}|${address}`);
    this.requireReady();
    // Count the attempt as failed before any slow check and refund it unless it truly failed, so a burst of
    // parallel guesses is counted in full.
    this.reserveAddressFailure(addressKey, now);
    let failed = false;
    try {
      return await this.joinChecked(secret, name, pinValue, player, now);
    } catch (error) {
      failed = error instanceof FailedGuess;
      throw error;
    } finally {
      if (!failed && this.ready) this.refundAddressFailure(addressKey);
    }
  }

  private async joinChecked(secret: string, name: string, pinValue: string, player: string | null, now: number): Promise<Response> {
    const secretHash = this.store.meta('joinSecretHash') ?? '';
    if (!SECRET_PATTERN.test(secret) || !(await secretMatches(secret, secretHash))) {
      throw new FailedGuess(403, 'This join link no longer works. Ask your captain for the current one.');
    }
    this.requireReady();
    const key = nameKey(name);
    const existing = this.store.memberByNameKey(key);

    if (existing) {
      // An existing name signs in with its PIN. A member who is not linked to a roster player yet may
      // link to a free one here ("Which player are you?" after joining); changing an existing link is
      // for leaders.
      this.reservePinTry(existing, now);
      const ok = await verifyPin(pinValue, existing.pin_hash, existing.pin_salt);
      this.requireReady();
      let member = this.store.memberById(existing.id);
      if (!member) throw new HttpError(409, 'That member was just removed from the team.');
      if (!ok) throw this.wrongPin(member, now, "That PIN isn't right for this name.");
      this.sql.exec('UPDATE members SET failed = 0, locked_until = 0 WHERE id = ?', member.id);
      if (player !== null && member.player_id === null) {
        this.requirePlayerFree(player, member.id);
        this.sql.exec('UPDATE members SET player_id = ? WHERE id = ?', player, member.id);
        member = this.store.memberById(member.id)!;
      }
      const { token, tokenHash } = await newSession();
      this.requireReady();
      this.insertSession(tokenHash, member.id, now);
      return json({ token, member: publicMember(member), teamName: this.store.meta('teamName') });
    }

    // A new name joins as a member.
    if (this.store.countMembers() >= MAX_MEMBERS) {
      throw new HttpError(409, `This team already has ${MAX_MEMBERS} members. Ask a coach or captain to remove old ones.`);
    }
    this.requirePlayerFree(player, '');
    const pinHash = await hashPin(pinValue);
    const { token, tokenHash } = await newSession();
    this.requireReady();
    // Check again after the slow hashing: another request may have taken the name or the roster player.
    if (this.store.memberByNameKey(key)) throw new HttpError(409, 'Someone just joined with that name. Try again to sign in.');
    this.requirePlayerFree(player, '');
    // Without a roster player, link the one with the same name when there is exactly one free.
    const byName = player === null ? this.store.unclaimedPlayersNamed(key, nameKey) : [];
    const member = newMember(name, 'member', player ?? (byName.length === 1 ? byName[0] : null), pinHash, now);
    this.ctx.storage.transactionSync(() => {
      this.insertMember(member);
      this.insertSession(tokenHash, member.id, now);
    });
    return json({ token, member: publicMember(member), teamName: this.store.meta('teamName') });
  }

  private reserveAddressFailure(key: string, now: number): void {
    this.sql.exec('DELETE FROM join_failures WHERE window_start <= ?', now - ADDRESS_WINDOW_MS);
    const row = this.sql
      .exec<{ window_start: number; count: number }>('SELECT window_start, count FROM join_failures WHERE ip_key = ?', key)
      .toArray()[0];
    if (!row) {
      this.sql.exec('INSERT INTO join_failures (ip_key, window_start, count) VALUES (?, ?, 1)', key, now);
      return;
    }
    if (row.count >= ADDRESS_FAILURES) {
      const wait = row.window_start + ADDRESS_WINDOW_MS - now;
      throw new HttpError(429, `Too many failed sign-ins from this network. Try again in ${minutes(wait)}.`, wait / 1000);
    }
    this.sql.exec('UPDATE join_failures SET count = count + 1 WHERE ip_key = ?', key);
  }

  private refundAddressFailure(key: string): void {
    this.sql.exec('UPDATE join_failures SET count = MAX(count - 1, 0) WHERE ip_key = ?', key);
  }

  /** Counts a PIN try before the slow check (refused while locked); the fifth try in a row sets the lock. */
  private reservePinTry(member: MemberRow, now: number): void {
    if (member.locked_until > now) {
      const wait = member.locked_until - now;
      throw new FailedGuess(429, `Too many wrong PINs for this name. Try again in ${minutes(wait)}.`, wait / 1000);
    }
    const tries = member.failed + 1;
    if (tries >= PIN_TRIES) this.sql.exec('UPDATE members SET failed = 0, locked_until = ? WHERE id = ?', now + LOCK_MS, member.id);
    else this.sql.exec('UPDATE members SET failed = ? WHERE id = ?', tries, member.id);
  }

  /** The error for a wrong PIN, saying how many tries are left (`member` is read after the try was counted). */
  private wrongPin(member: MemberRow, now: number, message: string): FailedGuess {
    if (member.locked_until > now) return new FailedGuess(403, `${message} Too many wrong PINs: try again in ${minutes(LOCK_MS)}.`);
    const left = PIN_TRIES - member.failed;
    return new FailedGuess(403, `${message} ${left} ${left === 1 ? 'try' : 'tries'} left before a 15-minute lock.`);
  }

  private requirePlayerFree(player: string | null, exceptMemberId: string): void {
    if (player === null) return;
    const other = this.store.memberByPlayer(player, exceptMemberId);
    if (other) {
      throw new HttpError(409, `${other.name} is already linked to that roster player. Ask a coach or captain to change the link.`);
    }
  }

  /* ---------------- sessions ---------------- */

  /**
   * The member behind the request's session token: `Authorization: Bearer <token>`, or for the room WebSocket
   * only, `?token=` (browsers cannot set headers on WebSockets).
   */
  private async authenticate(request: Request, url?: URL): Promise<Session> {
    const header = request.headers.get('Authorization');
    const token = header !== null ? (/^Bearer\s+(\S+)$/i.exec(header.trim())?.[1] ?? null) : (url?.searchParams.get('token') ?? null);
    if (!token || !TOKEN_PATTERN.test(token)) throw new HttpError(401, SIGN_IN_AGAIN);
    const tokenHash = await sha256Hex(token);
    this.requireReady();
    const now = Date.now();
    const session = this.sql
      .exec<{ member_id: string; last_used: number }>('SELECT member_id, last_used FROM sessions WHERE token_hash = ?', tokenHash)
      .toArray()[0];
    if (!session) throw new HttpError(401, `Your session has ended. ${SIGN_IN_AGAIN}`);
    const member = this.store.memberById(session.member_id);
    if (!member || session.last_used <= now - SESSION_IDLE_MS) {
      this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
      throw new HttpError(401, member ? `Your session expired after 180 days without use. ${SIGN_IN_AGAIN}` : `Your session has ended. ${SIGN_IN_AGAIN}`);
    }
    if (now - session.last_used >= TOUCH_EVERY_MS) {
      this.sql.exec('UPDATE sessions SET last_used = ? WHERE token_hash = ?', now, tokenHash);
      this.sql.exec('UPDATE members SET last_seen = ? WHERE id = ?', now, member.id);
      member.last_seen = now;
    }
    return { member, tokenHash, sid: tokenHash.slice(0, 16) };
  }

  private async me(request: Request): Promise<Response> {
    const { member } = await this.authenticate(request);
    return json({ member: publicMember(member), teamName: this.store.meta('teamName') });
  }

  private async signOut(request: Request): Promise<Response> {
    const session = await this.authenticate(request);
    this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', session.tokenHash);
    this.rooms.closeTagged(sessionTag(session.sid), 4001, 'Signed out.');
    return json({ ok: true });
  }

  private async changePin(request: Request): Promise<Response> {
    const session = await this.authenticate(request);
    const body = asObject(await readJson(request));
    const current = pin(body.pin, 'Enter your current PIN (4 to 8 digits).');
    const next = pin(body.newPin, 'Your new PIN must be 4 to 8 digits.');
    this.requireReady();
    const now = Date.now();
    const member = this.store.memberById(session.member.id);
    if (!member) throw new HttpError(401, SIGN_IN_AGAIN);
    this.reservePinTry(member, now);
    const ok = await verifyPin(current, member.pin_hash, member.pin_salt);
    this.requireReady();
    const fresh = this.store.memberById(member.id);
    if (!fresh) throw new HttpError(401, SIGN_IN_AGAIN);
    if (!ok) throw this.wrongPin(fresh, now, "Your current PIN isn't right.");
    const pinHash = await hashPin(next);
    this.requireReady();
    this.sql.exec(
      'UPDATE members SET pin_hash = ?, pin_salt = ?, failed = 0, locked_until = 0 WHERE id = ?',
      pinHash.hash,
      pinHash.salt,
      member.id,
    );
    return json({ ok: true });
  }

  /* ---------------- members (leaders) ---------------- */

  private async listMembers(request: Request): Promise<Response> {
    const session = await this.authenticate(request);
    this.requireLeader(session.member.id);
    const rows = this.sql.exec<MemberRow>('SELECT * FROM members ORDER BY name_key').toArray();
    return json({ members: rows.map((row) => ({ ...publicMember(row), lastSeen: row.last_seen })) });
  }

  private async updateMember(request: Request, id: string): Promise<Response> {
    const session = await this.authenticate(request);
    const body = asObject(await readJson(request));
    this.requireLeader(session.member.id);
    const target = this.store.memberById(id);
    if (!target) throw new HttpError(404, "That member isn't on the team.");
    if (!('role' in body) && !('playerId' in body)) throw new HttpError(400, 'Send a role or a playerId to change.');
    const newRole = 'role' in body ? role(body.role) : target.role;
    const newPlayer = 'playerId' in body ? playerId(body.playerId) : target.player_id;
    if (isLeader(target) && newRole === 'member' && this.store.countLeaders() <= 1) throw new HttpError(409, LAST_LEADER);
    if (newPlayer !== target.player_id) this.requirePlayerFree(newPlayer, target.id);
    this.sql.exec('UPDATE members SET role = ?, player_id = ? WHERE id = ?', newRole, newPlayer, id);
    if (newPlayer !== target.player_id) this.rooms.memberChanged(id);
    return json({ member: publicMember({ ...target, role: newRole, player_id: newPlayer }) });
  }

  /** Removing a member ends their sessions and closes their room connections. Their synced records stay. */
  private async removeMember(request: Request, id: string): Promise<Response> {
    const session = await this.authenticate(request);
    this.requireLeader(session.member.id);
    const target = this.store.memberById(id);
    if (!target) throw new HttpError(404, "That member isn't on the team.");
    if (isLeader(target) && this.store.countLeaders() <= 1) throw new HttpError(409, LAST_LEADER);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM sessions WHERE member_id = ?', id);
      this.sql.exec('DELETE FROM members WHERE id = ?', id);
    });
    this.rooms.memberRemoved(id);
    return json({ ok: true });
  }

  private async rotateJoinCode(request: Request): Promise<Response> {
    const session = await this.authenticate(request);
    const secret = newJoinSecret();
    const secretHash = await sha256Hex(secret);
    this.requireLeader(session.member.id);
    this.store.setMeta('joinSecretHash', secretHash);
    return json({ joinCode: `${this.store.meta('teamId')}.${secret}` });
  }

  /* ---------------- sync ---------------- */

  private async sync(request: Request): Promise<Response> {
    const session = await this.authenticate(request);
    const parsed = parseSyncRequest(await readJson(request));
    this.requireReady();
    // Read the member again: their role may have changed while the body was arriving.
    const member = this.store.memberById(session.member.id);
    if (!member) throw new HttpError(401, SIGN_IN_AGAIN);
    // Pushing and reading back happen in one transaction, so a device never sees half a sync.
    const text = this.ctx.storage.transactionSync(() => runSync(this.store, memberInfo(member), parsed));
    return jsonText(text);
  }

  /* ---------------- rooms ---------------- */

  /** A reader room, or with `match` a room where the server runs the game (online matches with no reader). */
  private async createRoom(request: Request): Promise<Response> {
    const session = await this.authenticate(request);
    const body = asObject(await readJson(request));
    const name = roomName(body.name);
    const setup = body.match === undefined || body.match === null ? null : parseMatchSetup(body.match);
    this.requireReady();
    return this.rooms.create(session.member, name, Date.now(), setup);
  }

  private async listRooms(request: Request): Promise<Response> {
    await this.authenticate(request);
    return this.rooms.list(Date.now());
  }

  // (Not named `connect`: DurableObject reserves that for TCP sockets.)
  private async openRoomSocket(request: Request, url: URL, roomId: string): Promise<Response> {
    const session = await this.authenticate(request, url);
    return this.rooms.connect(request, session.member, session.sid, roomId, Date.now());
  }

  /* ---------------- AI help (optional; see ai.ts) ---------------- */

  private async aiStatus(request: Request): Promise<Response> {
    await this.authenticate(request);
    const settings = aiSettings(this.env);
    if (!settings) return json({ enabled: false });
    return json({ enabled: true, model: settings.model, ...this.aiUsage(settings) });
  }

  /** Question drafts from a cited passage, each with a blind answer check. Uses one call plus one per draft. */
  private async aiDraft(request: Request): Promise<Response> {
    await this.authenticate(request);
    const settings = this.requireAi();
    const input = parseDraftInput(await readJson(request, AI_BODY_BYTES), this.level());
    const result = await this.withAiCalls(settings, 1 + input.count, () => draftQuestions(settings, input));
    return json({ drafts: result.drafts, model: result.model, ...this.aiUsage(settings) });
  }

  /** An explanation of a question's answer. The team shares one cache, so a question is explained once. */
  private async aiExplain(request: Request): Promise<Response> {
    await this.authenticate(request);
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
    await this.authenticate(request);
    const settings = this.requireAi();
    const input = parseCardInput(await readJson(request, AI_BODY_BYTES));
    const result = await this.withAiCalls(settings, 1, () => draftCard(settings, input));
    return json({ card: result.card, model: result.model, ...this.aiUsage(settings) });
  }

  private requireAi(): AiSettings {
    const settings = aiSettings(this.env);
    if (!settings) throw new HttpError(404, 'AI help is not turned on for this team server.');
    return settings;
  }

  private level(): TeamLevel {
    return this.store.meta('level') === 'MS' ? 'MS' : 'HS';
  }

  private aiUsage(settings: AiSettings): { dailyLimit: number; usedToday: number } {
    this.requireReady();
    ensureAiTables(this.sql);
    return { dailyLimit: settings.dailyLimit, usedToday: usedToday(this.sql, Date.now()) };
  }

  /**
   * Counts `calls` against the team's daily limit before `work` starts (so parallel requests can't overrun
   * it), then gives back the calls that never reached the model: a failed call, or fewer drafts than asked.
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

  private requireReady(): void {
    if (!this.ready) throw new HttpError(404, TEAM_NOT_FOUND);
  }

  /** Checks leadership on a fresh read (a role can change while a request waits on hashing or its body). */
  private requireLeader(memberId: string): MemberRow {
    this.requireReady();
    const member = this.store.memberById(memberId);
    if (!member) throw new HttpError(401, SIGN_IN_AGAIN);
    if (!isLeader(member)) throw new HttpError(403, LEADERS_ONLY);
    return member;
  }

  private insertMember(m: MemberRow): void {
    this.sql.exec(
      `INSERT INTO members (id, name, name_key, role, player_id, pin_hash, pin_salt, failed, locked_until, created_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m.id,
      m.name,
      m.name_key,
      m.role,
      m.player_id,
      m.pin_hash,
      m.pin_salt,
      m.failed,
      m.locked_until,
      m.created_at,
      m.last_seen,
    );
  }

  private insertSession(tokenHash: string, memberId: string, now: number): void {
    // Tidy up first: sessions unused for 180 days are gone for good.
    this.sql.exec('DELETE FROM sessions WHERE last_used <= ?', now - SESSION_IDLE_MS);
    this.sql.exec('INSERT INTO sessions (token_hash, member_id, created_at, last_used) VALUES (?, ?, ?, ?)', tokenHash, memberId, now, now);
    this.sql.exec('UPDATE members SET last_seen = ? WHERE id = ?', now, memberId);
  }
}

async function newSession(): Promise<{ token: string; tokenHash: string }> {
  const token = newSessionToken();
  return { token, tokenHash: await sha256Hex(token) };
}

function newMember(
  name: string,
  memberRole: MemberRow['role'],
  player: string | null,
  pinHash: { hash: string; salt: string },
  now: number,
): MemberRow {
  return {
    id: newId(),
    name,
    name_key: nameKey(name),
    role: memberRole,
    player_id: player,
    pin_hash: pinHash.hash,
    pin_salt: pinHash.salt,
    failed: 0,
    locked_until: 0,
    created_at: now,
    last_seen: now,
  };
}
