/**
 * The team's SQLite database (inside its Durable Object): the schema and the small queries shared by the
 * routes. Tables follow docs/SERVER.md; `rooms.buzz`, `room_members` and `join_failures` are additions for room
 * state that must outlive hibernation and for the per-address sign-in limit.
 */

import type { MemberInfo, MemberRole } from '../../src/core/sync';

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  player_id TEXT,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_member ON sessions (member_id);
CREATE TABLE IF NOT EXISTS records (
  c TEXT NOT NULL,
  id TEXT NOT NULL,
  body TEXT,
  rev INTEGER NOT NULL,
  "by" TEXT NOT NULL,
  PRIMARY KEY (c, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS records_by_rev ON records (rev);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL,
  state TEXT,
  seq INTEGER NOT NULL DEFAULT 0,
  buzz TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS room_members (
  room_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  side TEXT,
  captain INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, member_id)
);
CREATE TABLE IF NOT EXISTS matches (room_id TEXT PRIMARY KEY, data TEXT NOT NULL, due_at INTEGER);
CREATE TABLE IF NOT EXISTS join_failures (
  ip_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
`;

export type MemberRow = {
  id: string;
  name: string;
  name_key: string;
  role: MemberRole;
  player_id: string | null;
  pin_hash: string;
  pin_salt: string;
  failed: number;
  locked_until: number;
  created_at: number;
  last_seen: number;
};

/** A member as the API shows it: `{ id, name, role, playerId }`. */
export interface PublicMember extends MemberInfo {
  name: string;
}

export function publicMember(row: MemberRow): PublicMember {
  return { id: row.id, name: row.name, role: row.role, playerId: row.player_id };
}

export function memberInfo(row: MemberRow): MemberInfo {
  return { id: row.id, role: row.role, playerId: row.player_id };
}

export const isLeader = (row: Pick<MemberRow, 'role'>): boolean => row.role === 'coach' || row.role === 'captain';

export class Store {
  constructor(readonly sql: SqlStorage) {}

  /** Whether this object holds a team. A fresh object has no tables until a team is created in it. */
  hasTeam(): boolean {
    const tables = this.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'").toArray();
    return tables.length > 0 && this.meta('teamId') !== null;
  }

  createSchema(): void {
    this.sql.exec(SCHEMA);
    this.setMeta('schemaVersion', SCHEMA_VERSION);
  }

  meta(key: string): string | null {
    const row = this.sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0];
    return row ? row.value : null;
  }

  setMeta(key: string, value: string | number): void {
    this.sql.exec(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      key,
      String(value),
    );
  }

  memberById(id: string): MemberRow | null {
    return this.sql.exec<MemberRow>('SELECT * FROM members WHERE id = ?', id).toArray()[0] ?? null;
  }

  memberByNameKey(key: string): MemberRow | null {
    return this.sql.exec<MemberRow>('SELECT * FROM members WHERE name_key = ?', key).toArray()[0] ?? null;
  }

  /** The member linked to a roster player, other than `exceptId`. */
  memberByPlayer(playerId: string, exceptId = ''): MemberRow | null {
    return (
      this.sql.exec<MemberRow>('SELECT * FROM members WHERE player_id = ? AND id != ?', playerId, exceptId).toArray()[0] ?? null
    );
  }

  /**
   * Roster players (from the synced "players" records) whose name matches `key` and who are still
   * active and not linked to any member.
   */
  unclaimedPlayersNamed(key: string, nameKeyOf: (name: string) => string): string[] {
    const rows = this.sql.exec<{ id: string; body: string }>("SELECT id, body FROM records WHERE c = 'players' AND body IS NOT NULL").toArray();
    const out: string[] = [];
    for (const row of rows) {
      let body: { name?: unknown; active?: unknown };
      try {
        body = JSON.parse(row.body) as typeof body;
      } catch {
        continue;
      }
      if (typeof body.name !== 'string' || body.active === false || nameKeyOf(body.name.trim()) !== key) continue;
      if (!this.memberByPlayer(row.id)) out.push(row.id);
    }
    return out;
  }

  countMembers(): number {
    return this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM members').one().n;
  }

  countLeaders(): number {
    return this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM members WHERE role IN ('coach', 'captain')").one().n;
  }
}
