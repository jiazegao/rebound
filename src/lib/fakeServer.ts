/**
 * For tests only: an in-memory stand-in for Rebound's server, answering the account routes of docs/ACCOUNTS.md
 * that the site's data layer uses, with the contract's merge and permission rules (src/core/accounts.ts). Install
 * it as `fetch` and look at `calls` to see exactly what the site sent where.
 */
import {
  canWriteTeam,
  isLeader,
  isTeamCollection,
  isUserCollection,
  mergeUserRecord,
  SERVER_WRITTEN,
  TEAM_VISIBLE,
  type Change,
  type MemberRole,
  type RecordOut,
  type TeamInfo,
  type TeamMember,
  type UserProfile,
} from '../core/accounts';

interface Store {
  rev: number;
  records: Map<string, RecordOut>;
}

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

const key = (c: string, id: string) => `${c}/${id}`;

function put(store: Store, c: string, id: string, body: unknown): void {
  store.rev += 1;
  store.records.set(key(c, id), { c, id, body, rev: store.rev });
}

function page(store: Store, cursor: number, size: number, only?: (r: RecordOut) => boolean) {
  const all = [...store.records.values()].filter((r) => r.rev > cursor && (!only || only(r))).sort((a, b) => a.rev - b.rev);
  const records = all.slice(0, size);
  return { cursor: records.length ? records[records.length - 1].rev : cursor, records, more: all.length > size };
}

export class FakeServer {
  users = new Map<string, { profile: UserProfile; store: Store; teamId: string | null }>();
  teams = new Map<string, { info: TeamInfo; members: TeamMember[]; store: Store; joinCode: string }>();
  tokens = new Map<string, string>();
  calls: Call[] = [];
  /** No connection: every request fails as a network error. */
  down = false;
  /** Records per page (small, so tests see paging). */
  pageSize = 500;
  /** Answer the next requests whose path starts with a prefix with this status. */
  failures: Array<{ prefix: string; status: number }> = [];

  addUser(id: string, name: string, fields: Partial<UserProfile> = {}): string {
    const profile: UserProfile = {
      id,
      email: `${id}@example.org`,
      name,
      createdAt: Date.UTC(2026, 10, 1),
      over13At: Date.UTC(2026, 10, 1),
      settings: { sound: true, readingWpm: 200, answerTimer: true, dailyMinutes: 30 },
      ...fields,
    };
    this.users.set(id, { profile, store: { rev: 0, records: new Map() }, teamId: null });
    const token = `${id}.${'s'.repeat(43)}`;
    this.tokens.set(token, id);
    return token;
  }

  addTeam(id: string, name: string, members: Array<{ userId: string; role: MemberRole }>): void {
    this.teams.set(id, {
      info: { id, name, level: 'HS', createdAt: Date.UTC(2026, 10, 1) },
      // The team keeps a copy of each member's name and subjects.
      members: members.map((m) => {
        const { name, primarySubject, secondarySubject, gradYear } = this.users.get(m.userId)!.profile;
        return { userId: m.userId, name, role: m.role, primarySubject, secondarySubject, gradYear, joinedAt: 1, lastSeen: 2 };
      }),
      store: { rev: 0, records: new Map() },
      joinCode: `${id}.aaaaaaaaaaaa`,
    });
    for (const m of members) this.users.get(m.userId)!.teamId = id;
  }

  /** Another device (or the server itself) writes a user record. */
  writeUser(userId: string, c: string, id: string, body: unknown): void {
    put(this.users.get(userId)!.store, c, id, body);
  }

  writeTeam(teamId: string, c: string, id: string, body: unknown): void {
    put(this.teams.get(teamId)!.store, c, id, body);
  }

  userRecord(userId: string, c: string, id: string): unknown {
    return this.users.get(userId)!.store.records.get(key(c, id))?.body;
  }

  teamRecord(teamId: string, c: string, id: string): unknown {
    return this.teams.get(teamId)!.store.records.get(key(c, id))?.body;
  }

  /** The changes the site sent to a records endpoint ("/api/me/records" or "/api/teams/<id>/records"). */
  sentChanges(path: string): Change[] {
    return this.calls.filter((c) => c.method === 'POST' && c.path === path).flatMap((c) => (c.body as { changes: Change[] }).changes);
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    if (this.down) throw new TypeError('Failed to fetch');
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    this.calls.push({ method, path: url.pathname, body });
    const failure = this.failures.findIndex((f) => url.pathname.startsWith(f.prefix));
    if (failure >= 0) {
      const [f] = this.failures.splice(failure, 1);
      return json(f.status, { error: `Failed on purpose (${f.status}).` });
    }
    const auth = new Headers(init.headers).get('authorization');
    const userId = auth?.startsWith('Bearer ') ? this.tokens.get(auth.slice(7)) : undefined;
    const user = userId ? this.users.get(userId) : undefined;
    if (!user) return json(401, { error: 'You are signed out. Sign in again.' });
    const cursor = Number(url.searchParams.get('cursor') ?? 0);
    const parts = url.pathname.split('/').filter(Boolean); // api, me|teams, …

    if (parts[1] === 'me') {
      if (parts.length === 2 && method === 'GET') {
        const team = user.teamId ? this.teams.get(user.teamId) : undefined;
        const role = team?.members.find((m) => m.userId === userId)?.role;
        return json(200, { user: user.profile, team: team && role ? { id: team.info.id, name: team.info.name, level: team.info.level, role } : null });
      }
      if (parts.length === 2 && method === 'PATCH') {
        const { settings, ...fields } = body as Record<string, unknown>;
        user.profile = { ...user.profile, ...(fields as Partial<UserProfile>), settings: { ...user.profile.settings, ...(settings as object) } };
        return json(200, { user: user.profile });
      }
      if (parts[2] === 'records' && method === 'GET') return json(200, page(user.store, cursor, this.pageSize));
      if (parts[2] === 'records' && method === 'POST') {
        const rejected: Array<{ c: string; id: string; reason: string }> = [];
        for (const ch of (body as { changes: Change[] }).changes) {
          if (!isUserCollection(ch.c) || SERVER_WRITTEN.has(ch.c)) {
            rejected.push({ c: ch.c, id: ch.id, reason: 'Only the server writes these.' });
            continue;
          }
          const stored = user.store.records.get(key(ch.c, ch.id))?.body;
          const merged = mergeUserRecord(ch.c, stored ?? null, ch.body);
          if (JSON.stringify(merged) !== JSON.stringify(stored ?? null)) put(user.store, ch.c, ch.id, merged);
        }
        return json(200, { cursor: user.store.rev, rejected });
      }
    }

    if (parts[1] === 'teams' && parts[2]) {
      const team = this.teams.get(parts[2]);
      const me = team?.members.find((m) => m.userId === userId);
      if (!team || !me) return json(403, { error: 'You are not on this team.' });
      if (parts.length === 3 && method === 'GET') {
        return json(200, { team: team.info, members: team.members, you: { role: me.role }, ...(isLeader(me.role) ? { joinCode: team.joinCode } : {}) });
      }
      if (parts.length === 3 && method === 'PATCH') {
        if (!isLeader(me.role)) return json(403, { error: 'Only coaches and captains can change the team.' });
        const fields = body as Record<string, unknown>;
        const info: TeamInfo = { ...team.info, ...(fields.name ? { name: fields.name as string } : {}), ...(fields.level ? { level: fields.level as TeamInfo['level'] } : {}) };
        if (fields.nextEvent === null) delete info.nextEvent;
        else if (fields.nextEvent) info.nextEvent = fields.nextEvent as TeamInfo['nextEvent'];
        team.info = info;
        return json(200, { team: info });
      }
      if (parts[3] === 'records' && method === 'GET') return json(200, page(team.store, cursor, this.pageSize));
      if (parts[3] === 'records' && method === 'POST') {
        const rejected: Array<{ c: string; id: string; reason: string }> = [];
        for (const ch of (body as { changes: Change[] }).changes) {
          if (!isTeamCollection(ch.c)) rejected.push({ c: ch.c, id: ch.id, reason: 'Not a team collection.' });
          else if (!canWriteTeam(me.role, ch.c)) rejected.push({ c: ch.c, id: ch.id, reason: 'Only coaches and captains change these.' });
          else put(team.store, ch.c, ch.id, ch.body);
        }
        return json(200, { cursor: team.store.rev, rejected });
      }
      if (parts[3] === 'members' && parts[5] === 'records' && method === 'GET') {
        const other = this.users.get(parts[4]);
        if (!other || !team.members.some((m) => m.userId === parts[4])) return json(404, { error: 'Not on this team.' });
        return json(200, page(other.store, cursor, this.pageSize, (r) => TEAM_VISIBLE.has(r.c as never)));
      }
    }
    return json(404, { error: `No route for ${method} ${url.pathname}` });
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
