/**
 * Team: one Durable Object per team (named by the team id). It keeps the team's settings (name, level, next
 * competition), its members (with a copy of each member's name, subjects and graduation year from their account,
 * plus their role and squad), the current invite secret, the team's collections, and an index of the rooms its
 * members opened (docs/ACCOUNTS.md). Membership is decided here; each member's UserServer remembers which team it is
 * on and is told when a leader removes them or deletes the team.
 *
 * A finished Reader console game saved in `games` becomes answers in each player's account (`gameOutcomes`),
 * delivered through the outbox so a busy account does not lose them.
 */

import { DurableObject } from 'cloudflare:workers';
import { canWriteTeam, isLeader, isTeamCollection, type MemberRole, type TeamInfo, type TeamMember, type TeamResponse } from '../../src/core/accounts';
import { gameOutcomes, type GameRecord } from '../../src/core/games';
import type { Outcome } from '../../src/core/review';
import type { CoreSubject, Level, Player } from '../../src/core/schema';
import { JOIN_SECRET_PATTERN, newJoinSecret, sameSecret } from './crypto';
import { cursorParam, dispatch, HttpError, identityOf, json, jsonText, readJson, refusing, toErrorResponse, type Result, type Routes } from './http';
import { getMeta, hasTable, roomObject, setMeta, userObject } from './objects';
import { Outbox, OUTBOX_SCHEMA, type Delivery } from './outbox';
import { parseChanges, Records, RECORDS_SCHEMA, shapeProblem, type Rejection } from './records';
import type { RoomSummary } from './room';
import type { MemberCopy, ProfileFields, TeamSummary } from './user';
import { asObject, gradYear, level, nextEvent, role, squad, subject, teamName } from './validate';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  squad TEXT,
  primary_subject TEXT,
  secondary_subject TEXT,
  grad_year INTEGER,
  joined_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (room_id TEXT PRIMARY KEY, host_id TEXT NOT NULL, created_at INTEGER NOT NULL);
${RECORDS_SCHEMA}
${OUTBOX_SCHEMA}
`;

/** A safety cap, far above any real team. */
export const MAX_MEMBERS = 200;
/** Open rooms the team's members may have at once (rooms close 6 hours after everyone leaves). */
export const MAX_ROOMS = 20;
/** A member's last-seen time is written at most once a minute. */
const TOUCH_EVERY_MS = 60 * 1000;

export const TEAM_NOT_FOUND = "We couldn't find that team. Check the join link with your captain.";
const NOT_ON_TEAM = "You're not on this team.";
const NOT_A_MEMBER = "That person isn't on this team.";
const LEADERS_ONLY = 'Only coaches and captains can do that.';
const LAST_LEADER = 'A team needs at least one coach or captain. Make someone else a coach or captain first.';
const OLD_JOIN_LINK = 'This join link no longer works. Ask your captain for the current one.';

type MemberRow = {
  user_id: string;
  name: string;
  role: MemberRole;
  squad: string | null;
  primary_subject: CoreSubject | null;
  secondary_subject: CoreSubject | null;
  grad_year: number | null;
  joined_at: number;
  last_seen: number;
};

export interface CreatedTeam {
  team: TeamInfo;
  joinCode: string;
}

function memberOut(r: MemberRow): TeamMember {
  return {
    userId: r.user_id,
    name: r.name,
    role: r.role,
    ...(r.squad !== null ? { squad: r.squad } : {}),
    ...(r.primary_subject !== null ? { primarySubject: r.primary_subject } : {}),
    ...(r.secondary_subject !== null ? { secondarySubject: r.secondary_subject } : {}),
    ...(r.grad_year !== null ? { gradYear: r.grad_year } : {}),
    joinedAt: r.joined_at,
    lastSeen: r.last_seen,
  };
}

/** The members as the rules engine's players (who covers which subject decides dead toss-ups and bonuses). */
function asPlayer(r: MemberRow): Player {
  return {
    id: r.user_id,
    name: r.name,
    role: r.role,
    active: true,
    ...(r.squad !== null ? { squad: r.squad } : {}),
    ...(r.primary_subject !== null ? { primarySubject: r.primary_subject } : {}),
    ...(r.secondary_subject !== null ? { secondarySubject: r.secondary_subject } : {}),
    ...(r.grad_year !== null ? { gradYear: r.grad_year } : {}),
  };
}

export class Team extends DurableObject<Env> {
  private readonly records: Records;
  private readonly outbox: Outbox;
  /** Whether this object holds a team: false for a fresh object, and again after the team is deleted. */
  private ready: boolean;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.records = new Records(ctx.storage.sql);
    this.outbox = new Outbox(ctx.storage.sql);
    this.ready = hasTable(ctx.storage.sql, 'meta') && getMeta(ctx.storage.sql, 'teamId') !== null;
  }

  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }

  /* ---------------- RPC: membership (from the members' UserServers) ---------------- */

  /** Makes this object a new team with `captain` as its first member, or null if it already holds one. */
  async create(input: { teamId: string; name: string; level: Level; captain: MemberCopy & { userId: string }; now: number }): Promise<CreatedTeam | null> {
    if (this.ready) return null;
    const secret = newJoinSecret();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(SCHEMA);
      setMeta(this.sql, 'teamId', input.teamId);
      setMeta(this.sql, 'name', input.name);
      setMeta(this.sql, 'level', input.level);
      setMeta(this.sql, 'createdAt', input.now);
      setMeta(this.sql, 'joinSecret', secret);
      this.insertMember(input.captain, 'captain', input.now);
    });
    this.ready = true;
    return { team: this.info(), joinCode: `${input.teamId}.${secret}` };
  }

  /**
   * Adds a member who has the current join secret (compared in constant time). Someone already on the team is
   * simply welcomed back, whatever link they used.
   */
  async addMember(input: { secret: string; member: MemberCopy & { userId: string }; now: number }): Promise<Result<{ team: TeamInfo; role: MemberRole }>> {
    return refusing(async () => {
      this.requireReady();
      const existing = this.member(input.member.userId);
      if (existing) return { team: this.info(), role: existing.role };
      const ok = JOIN_SECRET_PATTERN.test(input.secret) && (await sameSecret(input.secret, getMeta(this.sql, 'joinSecret') ?? ''));
      this.requireReady();
      if (!ok) throw new HttpError(403, OLD_JOIN_LINK);
      const again = this.member(input.member.userId);
      if (again) return { team: this.info(), role: again.role };
      if (this.countMembers() >= MAX_MEMBERS) {
        throw new HttpError(409, `This team already has ${MAX_MEMBERS} members. Ask a coach or captain to remove old ones.`);
      }
      this.insertMember(input.member, 'member', input.now);
      return { team: this.info(), role: 'member' as MemberRole };
    });
  }

  /** Whether `userId` may leave (not the last coach or captain while others remain). Not being a member is fine. */
  async canLeave(userId: string): Promise<Result> {
    return refusing(() => {
      const me = this.ready ? this.member(userId) : null;
      if (me) this.checkLastLeader(me);
      return {};
    });
  }

  /** A member leaves (or deletes their account). The last member leaving deletes the team. */
  async removeMember(userId: string): Promise<Result> {
    return refusing(async () => {
      this.requireReady();
      const me = this.member(userId);
      if (!me) throw new HttpError(403, NOT_ON_TEAM);
      this.checkLastLeader(me);
      if (this.countMembers() <= 1) await this.deleteTeam();
      else this.dropMember(userId);
      return {};
    });
  }

  /**
   * The member's summary of the team, after taking the latest copy of their details (GET and PATCH /api/me send it).
   * Null when they are not on this team.
   */
  async syncMember(userId: string, copy: MemberCopy, now: number): Promise<TeamSummary | null> {
    if (!this.ready) return null;
    const me = this.member(userId);
    if (!me) return null;
    this.sql.exec(
      'UPDATE members SET name = ?, primary_subject = ?, secondary_subject = ?, grad_year = ?, last_seen = ? WHERE user_id = ?',
      copy.name,
      copy.primarySubject ?? null,
      copy.secondarySubject ?? null,
      copy.gradYear ?? null,
      now,
      userId,
    );
    const info = this.info();
    return { id: info.id, name: info.name, level: info.level, role: me.role };
  }

  /* ---------------- RPC: rooms and online matches ---------------- */

  /** Adds a room a member opened to the team's list, unless the team already has MAX_ROOMS open. */
  async registerRoom(userId: string, roomId: string, now: number): Promise<Result> {
    return refusing(async () => {
      this.requireReady();
      if (!this.member(userId)) throw new HttpError(403, NOT_ON_TEAM);
      if (this.countRooms() >= MAX_ROOMS) {
        await this.roomSummaries(now);
        this.requireReady();
        if (this.countRooms() >= MAX_ROOMS) {
          throw new HttpError(429, `Your team already has ${MAX_ROOMS} open rooms. Rooms close 6 hours after everyone leaves.`);
        }
      }
      this.sql.exec('INSERT INTO rooms (room_id, host_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', roomId, userId, now);
      return {};
    });
  }

  async unregisterRoom(roomId: string): Promise<void> {
    if (this.ready) this.sql.exec('DELETE FROM rooms WHERE room_id = ?', roomId);
  }

  /** The open rooms the team's members opened, newest first (`GET /api/rooms`). */
  async listRooms(userId: string, now: number): Promise<Result<{ rooms: RoomSummary[] }>> {
    return refusing(async () => {
      this.requireReady();
      if (!this.member(userId)) throw new HttpError(403, NOT_ON_TEAM);
      return { rooms: await this.roomSummaries(now) };
    });
  }

  /**
   * A finished online team match whose players are all on this team (from its room). Its answers were already
   * written to the players' accounts by the room, so this only keeps the game. Refused if a player is not a member.
   */
  async putOnlineGame(record: GameRecord, by: string): Promise<boolean> {
    if (!this.ready) return false;
    const players = record.teams.flatMap((t) => t.playerIds);
    if (players.length === 0 || !players.every((id) => this.member(id))) return false;
    this.ctx.storage.transactionSync(() => this.records.put('games', record.id, record, by));
    return true;
  }

  /* ---------------- HTTP: team routes, forwarded with the caller's identity ---------------- */

  async fetch(request: Request): Promise<Response> {
    try {
      const identity = identityOf(request);
      const match = /^\/api\/teams\/([a-z2-7]{16})(\/.*)?$/.exec(new URL(request.url).pathname);
      if (!match || !this.ready || getMeta(this.sql, 'teamId') !== match[1]) throw new HttpError(404, TEAM_NOT_FOUND);
      const me = this.member(identity.userId);
      if (!me) throw new HttpError(403, NOT_ON_TEAM);
      const now = Date.now();
      if (now - me.last_seen >= TOUCH_EVERY_MS) this.sql.exec('UPDATE members SET last_seen = ? WHERE user_id = ?', now, me.user_id);
      return await dispatch(this.routes(identity.userId), request, match[2] ?? '');
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  private routes(caller: string): Routes {
    return [
      [/^$/, { GET: () => this.getTeam(caller), PATCH: (r) => this.patchTeam(r, caller), DELETE: () => this.deleteTeamRoute(caller) }],
      [/^\/members\/([a-z2-7]{16})$/, { PATCH: (r, _u, [id]) => this.patchMember(r, caller, id!), DELETE: (_r, _u, [id]) => this.removeMemberRoute(caller, id!) }],
      [/^\/members\/([a-z2-7]{16})\/records$/, { GET: (_r, url, [id]) => this.teammateRecords(url, id!) }],
      [/^\/join-code$/, { POST: () => this.rotateJoinCode(caller) }],
      [/^\/records$/, { GET: (_r, url) => jsonText(this.records.page(cursorParam(url), { by: true })), POST: (r) => this.putRecords(r, caller) }],
    ];
  }

  private getTeam(caller: string): Response {
    const me = this.member(caller)!;
    const out: TeamResponse = { team: this.info(), members: this.members().map(memberOut), you: { role: me.role } };
    // Leaders can show the invite link again; the secret is kept for that (POST /join-code replaces it).
    if (isLeader(me.role)) out.joinCode = `${this.info().id}.${getMeta(this.sql, 'joinSecret')}`;
    return json(out);
  }

  private async patchTeam(request: Request, caller: string): Promise<Response> {
    const body = asObject(await readJson(request));
    this.requireLeader(caller);
    // Everything is checked before anything is saved.
    const name = 'name' in body ? teamName(body.name) : null;
    const teamLevel = 'level' in body ? level(body.level) : null;
    const event = 'nextEvent' in body ? nextEvent(body.nextEvent) : undefined;
    if (name !== null) setMeta(this.sql, 'name', name);
    if (teamLevel !== null) setMeta(this.sql, 'level', teamLevel);
    if (event !== undefined) setMeta(this.sql, 'nextEvent', event === null ? '' : JSON.stringify(event));
    return json({ team: this.info() });
  }

  private async deleteTeamRoute(caller: string): Promise<Response> {
    this.requireLeader(caller);
    const teamId = this.info().id;
    const members = this.members().map((m) => m.user_id);
    await this.deleteTeam();
    // Each member's account stops pointing here (a member whose account misses this finds out on their next visit).
    const told = await Promise.allSettled(members.map((id) => userObject(this.env, id).teamLeft(teamId)));
    for (const r of told) if (r.status === 'rejected') console.error('Telling a member the team was deleted failed:', String(r.reason));
    return json({ ok: true });
  }

  /**
   * Leaders change roles and squads, and anyone's subjects and graduation year; members may change their own
   * subjects and graduation year. Subject changes go to the member's account (the profile is the source) first.
   */
  private async patchMember(request: Request, caller: string, targetId: string): Promise<Response> {
    const body = asObject(await readJson(request));
    this.requireReady();
    const me = this.member(caller);
    if (!me) throw new HttpError(403, NOT_ON_TEAM);
    const target = this.member(targetId);
    if (!target) throw new HttpError(404, NOT_A_MEMBER);
    const teamFields = ['role', 'squad'].filter((k) => k in body);
    const profileKeys = (['primarySubject', 'secondarySubject', 'gradYear'] as const).filter((k) => k in body);
    if (teamFields.length === 0 && profileKeys.length === 0) throw new HttpError(400, 'Send a role, squad, subject or graduation year to change.');
    if (teamFields.length > 0 && !isLeader(me.role)) throw new HttpError(403, LEADERS_ONLY);
    if (profileKeys.length > 0 && !isLeader(me.role) && caller !== targetId) {
      throw new HttpError(403, "Only coaches, captains and the player themselves can change a player's subjects.");
    }
    const newRole = 'role' in body ? role(body.role) : target.role;
    const newSquad = 'squad' in body ? squad(body.squad) : target.squad;
    const fields: ProfileFields = {};
    if ('primarySubject' in body) fields.primarySubject = subject(body.primarySubject);
    if ('secondarySubject' in body) fields.secondarySubject = subject(body.secondarySubject);
    if ('gradYear' in body) fields.gradYear = gradYear(body.gradYear);

    let copy: MemberCopy | null = null;
    if (profileKeys.length > 0) {
      copy = await userObject(this.env, targetId).applyProfile(fields);
      this.requireReady();
    }
    // Read again after the wait: the member may have left, or roles changed meanwhile.
    const fresh = this.member(targetId);
    if (!fresh) throw new HttpError(404, NOT_A_MEMBER);
    if ('role' in body && isLeader(fresh.role) && !isLeader(newRole) && this.countLeaders() <= 1) throw new HttpError(409, LAST_LEADER);
    this.sql.exec('UPDATE members SET role = ?, squad = ? WHERE user_id = ?', newRole, newSquad, targetId);
    if (copy) {
      this.sql.exec(
        'UPDATE members SET name = ?, primary_subject = ?, secondary_subject = ?, grad_year = ? WHERE user_id = ?',
        copy.name,
        copy.primarySubject ?? null,
        copy.secondarySubject ?? null,
        copy.gradYear ?? null,
        targetId,
      );
    }
    return json({ member: memberOut(this.member(targetId)!) });
  }

  /** A leader removes a member (or anyone removes themselves, which is leaving). */
  private async removeMemberRoute(caller: string, targetId: string): Promise<Response> {
    const teamId = this.info().id;
    if (caller !== targetId) this.requireLeader(caller);
    const target = this.member(targetId);
    if (!target) throw new HttpError(404, NOT_A_MEMBER);
    this.checkLastLeader(target);
    if (this.countMembers() <= 1) await this.deleteTeam();
    else this.dropMember(targetId);
    try {
      await userObject(this.env, targetId).teamLeft(teamId);
    } catch (error) {
      // Their account finds out on its next visit (GET /api/me checks with the team).
      console.error('Telling a removed member failed:', error instanceof Error ? error.message : String(error));
    }
    return json({ ok: true });
  }

  private async rotateJoinCode(caller: string): Promise<Response> {
    this.requireLeader(caller);
    const secret = newJoinSecret();
    setMeta(this.sql, 'joinSecret', secret);
    return json({ joinCode: `${this.info().id}.${secret}` });
  }

  /** A teammate's visible collections (their review cards and plans stay private). */
  private async teammateRecords(url: URL, targetId: string): Promise<Response> {
    if (!this.member(targetId)) throw new HttpError(404, NOT_A_MEMBER);
    return jsonText(await userObject(this.env, targetId).visibleRecords(cursorParam(url)));
  }

  /* ---------------- team records ---------------- */

  private async putRecords(request: Request, caller: string): Promise<Response> {
    const changes = parseChanges(await readJson(request));
    this.requireReady();
    // Read the member again: their role may have changed while the body was arriving.
    const me = this.member(caller);
    if (!me) throw new HttpError(403, NOT_ON_TEAM);
    const now = Date.now();
    const result = this.ctx.storage.transactionSync(() => {
      const rejected: Rejection[] = [];
      for (const change of changes) {
        let reason = shapeProblem(change);
        if (!reason && !isTeamCollection(change.c)) reason = "This kind of data isn't kept for teams.";
        if (!reason && isTeamCollection(change.c) && !canWriteTeam(me.role, change.c)) reason = 'Only coaches and captains can change this.';
        if (reason) {
          rejected.push({ c: change.c, id: change.id, reason });
          continue;
        }
        // Team records are last-writer-wins.
        if (this.records.put(change.c, change.id, change.body, caller) && change.c === 'games') this.queueGameAnswers(change.body, now);
      }
      return { cursor: this.records.rev(), rejected };
    });
    // Deliver the answers before answering, so the players see them when they next load.
    if (this.outbox.pending() > 0) await this.flushOutbox(true);
    return json(result);
  }

  /**
   * A finished Reader console game: each player's outcomes go to their account's `answers` (ids fixed by the game,
   * so saving it again gives the same answers). Online matches are left out: their room already wrote them. Only
   * members get answers, so a game cannot write into other people's accounts.
   */
  private queueGameAnswers(body: unknown, now: number): void {
    const game = body as GameRecord | null;
    if (!game || game.status !== 'finished' || game.online === true) return;
    const rows = this.members();
    let outcomes: Outcome[];
    try {
      outcomes = gameOutcomes(game, rows.map(asPlayer));
    } catch {
      return; // A game the rules cannot replay has no answers to give.
    }
    const members = new Set(rows.map((r) => r.user_id));
    const byPlayer = new Map<string, Outcome[]>();
    for (const o of outcomes) {
      if (!members.has(o.playerId)) continue;
      if (!byPlayer.has(o.playerId)) byPlayer.set(o.playerId, []);
      byPlayer.get(o.playerId)!.push(o);
    }
    for (const [playerId, list] of byPlayer) this.outbox.add('answers', playerId, list, now);
  }

  private async flushOutbox(all = false): Promise<void> {
    if (!this.ready) return;
    await this.outbox.flush((d) => this.deliver(d), Date.now(), all);
    if (!this.ready) return;
    const next = this.outbox.nextAt();
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  private async deliver(d: Delivery): Promise<void> {
    if (d.kind === 'answers') await userObject(this.env, d.target).putAnswers(JSON.parse(d.payload) as Outcome[]);
  }

  /** Retries deliveries that failed. */
  async alarm(): Promise<void> {
    await this.flushOutbox();
  }

  /* ---------------- helpers ---------------- */

  private info(): TeamInfo {
    const event = getMeta(this.sql, 'nextEvent');
    return {
      id: getMeta(this.sql, 'teamId')!,
      name: getMeta(this.sql, 'name')!,
      level: getMeta(this.sql, 'level') === 'MS' ? 'MS' : 'HS',
      ...(event ? { nextEvent: JSON.parse(event) } : {}),
      createdAt: Number(getMeta(this.sql, 'createdAt')),
    };
  }

  private member(userId: string): MemberRow | null {
    return this.sql.exec<MemberRow>('SELECT * FROM members WHERE user_id = ?', userId).toArray()[0] ?? null;
  }

  private members(): MemberRow[] {
    return this.sql.exec<MemberRow>('SELECT * FROM members ORDER BY name COLLATE NOCASE, user_id').toArray();
  }

  private insertMember(m: MemberCopy & { userId: string }, memberRole: MemberRole, now: number): void {
    this.sql.exec(
      `INSERT INTO members (user_id, name, role, squad, primary_subject, secondary_subject, grad_year, joined_at, last_seen)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      m.userId,
      m.name,
      memberRole,
      m.primarySubject ?? null,
      m.secondarySubject ?? null,
      m.gradYear ?? null,
      now,
      now,
    );
  }

  /** Removes a member and the rooms they listed for the team. */
  private dropMember(userId: string): void {
    this.sql.exec('DELETE FROM members WHERE user_id = ?', userId);
    this.sql.exec('DELETE FROM rooms WHERE host_id = ?', userId);
  }

  private countMembers(): number {
    return this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM members').one().n;
  }

  private countLeaders(): number {
    return this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM members WHERE role IN ('coach', 'captain')").one().n;
  }

  private countRooms(): number {
    return this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM rooms').one().n;
  }

  /** The last coach or captain may not leave while others remain (they hand over first). */
  private checkLastLeader(m: MemberRow): void {
    if (isLeader(m.role) && this.countLeaders() <= 1 && this.countMembers() > 1) throw new HttpError(409, LAST_LEADER);
  }

  /**
   * The rooms in the list that are still open, newest first; closed ones leave the list. A room listed in the last
   * minute may still be opening (it is listed just before it is made), so it stays even if it does not answer yet.
   */
  private async roomSummaries(now: number): Promise<RoomSummary[]> {
    const rows = this.sql.exec<{ room_id: string; created_at: number }>('SELECT room_id, created_at FROM rooms ORDER BY created_at DESC').toArray();
    const found = await Promise.all(
      rows.map(async ({ room_id }) => {
        try {
          return await roomObject(this.env, room_id).summary(now);
        } catch (error) {
          // A room that cannot be reached right now stays in the list, but is not shown.
          console.error('Reading a room failed:', error instanceof Error ? error.message : String(error));
          return undefined;
        }
      }),
    );
    if (this.ready) {
      rows.forEach(({ room_id, created_at }, i) => {
        if (found[i] === null && created_at < now - 60_000) this.sql.exec('DELETE FROM rooms WHERE room_id = ?', room_id);
      });
    }
    return found.filter((r) => !!r) as RoomSummary[];
  }

  /** Deletes everything (the last member left, or a leader deleted the team), after a last try at deliveries. */
  private async deleteTeam(): Promise<void> {
    if (this.outbox.pending() > 0) await this.outbox.flush((d) => this.deliver(d), Date.now(), true);
    this.ready = false;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private requireReady(): void {
    if (!this.ready) throw new HttpError(404, TEAM_NOT_FOUND);
  }

  /** Checks leadership on a fresh read (a role can change while a request waits for its body). */
  private requireLeader(userId: string): MemberRow {
    this.requireReady();
    const me = this.member(userId);
    if (!me) throw new HttpError(403, NOT_ON_TEAM);
    if (!isLeader(me.role)) throw new HttpError(403, LEADERS_ONLY);
    return me;
  }
}
