/**
 * Sharing team data between devices: the contract between the browser and the team server.
 *
 * The team's data is a set of records, each in a collection and with an id (a player, a game,
 * a solo answer, a review card…). A device pushes the records it changed and pulls everything that
 * changed on the server since its last sync, tracked by a server-wide revision number. Most
 * collections are last-writer-wins per record; a few merge, so that no device loses another's work.
 *
 * Records are owned so that two devices rarely edit the same one: a player's answers, review cards
 * and plan are theirs; a game belongs to the device that ran it; a completion is one record per
 * player and assignment. Device settings never sync.
 *
 * This module is shared by the site and the server (server/), so both agree on the rules.
 */

/** Synced collections, in the order a new device should apply them. */
export const SYNC_COLLECTIONS = [
  'team',
  'players',
  'lineups',
  'assignments',
  'completions',
  'packets',
  'conceptCards',
  'games',
  'attempts',
  'seen',
  'cards',
  'plans',
  'reports',
] as const;

export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

export function isSyncCollection(c: string): c is SyncCollection {
  return (SYNC_COLLECTIONS as readonly string[]).includes(c);
}

/** A record as stored on the server and sent to devices. `body` null means deleted. */
export interface SyncRecord {
  c: SyncCollection;
  id: string;
  body: unknown;
  /** Server revision of this version (increasing across the whole team). */
  rev: number;
  /** Member who wrote this version. */
  by: string;
}

/** One change a device pushes. */
export interface PushChange {
  c: SyncCollection;
  id: string;
  /** The new body, or null to delete. */
  body: unknown;
  /** The server revision the device last saw for this record (null if it never saw one). */
  baseRev: number | null;
}

export interface SyncRequest {
  /** Highest revision the device has applied (0 for a fresh device). */
  cursor: number;
  changes: PushChange[];
}

export interface SyncResponse {
  /** New cursor: the highest revision included below (or the request's cursor if nothing changed). */
  cursor: number;
  /** Records with a revision above the request's cursor, including the stored result of each pushed change. */
  changes: SyncRecord[];
  /** Pushed changes the server refused, with a reason; the device should drop or restore them. */
  rejected: Array<{ c: SyncCollection; id: string; reason: string }>;
  /** True when more changes are waiting (the device should sync again right away). */
  more: boolean;
}

/** Most records the server returns in one response, and most changes a device may push at once. */
export const SYNC_PAGE_SIZE = 500;
/** Largest record body the server accepts, in bytes of JSON (an uploaded packet is the largest kind). */
export const MAX_RECORD_BYTES = 900_000;

/* ---------------- who may write what ---------------- */

export type MemberRole = 'coach' | 'captain' | 'member';

export interface MemberInfo {
  id: string;
  role: MemberRole;
  /** The roster player this member is, if any (coaches may have none). */
  playerId: string | null;
}

/** Collections only coaches and captains may change. */
const LEADER_ONLY: ReadonlySet<SyncCollection> = new Set(['team', 'lineups', 'assignments']);

function field(body: unknown, key: string): unknown {
  return body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined;
}

/**
 * Whether a member may write (or delete, when `body` is null) a record. Leaders may write anything.
 * Members may not change the team, lineups or assignments, may edit only their own roster entry,
 * and may write personal records (answers, review cards, plans, completions) only for themselves.
 * Games, seen ledgers, packets, concept cards and problem reports are shared work.
 */
export function canWrite(member: MemberInfo, c: SyncCollection, id: string, body: unknown, existing: unknown): boolean {
  if (member.role === 'coach' || member.role === 'captain') return true;
  if (LEADER_ONLY.has(c)) return false;
  const own = (playerId: unknown) => member.playerId !== null && playerId === member.playerId;
  switch (c) {
    case 'players':
      // Their own entry only, and not their role.
      return own(id) && (body === null ? false : field(body, 'role') === field(existing, 'role'));
    case 'attempts':
      return own(field(body ?? existing, 'playerId'));
    case 'cards':
      return own(field(body ?? existing, 'playerId'));
    case 'plans':
      return own(id);
    case 'completions':
      return own(field(body ?? existing, 'playerId'));
    default:
      return true;
  }
}

/* ---------------- merging concurrent edits ---------------- */

type SeenMap = Record<string, number>;

/** Seen ledgers merge: a question is heard if either side heard it, at the earlier time. */
export function mergeSeen(a: unknown, b: unknown): SeenMap {
  const out: SeenMap = { ...((a as SeenMap) ?? {}) };
  for (const [q, t] of Object.entries((b as SeenMap) ?? {})) {
    if (typeof t !== 'number') continue;
    out[q] = out[q] === undefined ? t : Math.min(out[q], t);
  }
  return out;
}

interface CardLike {
  log?: Array<{ t: number; via: string }>;
  sources?: string[];
}

/**
 * Review cards: keep the version that has seen more (a longer log); when both grew apart, keep the
 * one with the later last event. Sources (answers already counted) are combined either way.
 */
export function mergeCard(a: unknown, b: unknown): unknown {
  const x = a as CardLike;
  const y = b as CardLike;
  const lx = x.log ?? [];
  const ly = y.log ?? [];
  const last = (l: Array<{ t: number }>) => (l.length ? l[l.length - 1].t : 0);
  const winner = ly.length > lx.length || (ly.length === lx.length ? last(ly) >= last(lx) : last(ly) > last(lx)) ? y : x;
  const sources = [...new Set([...(x.sources ?? []), ...(y.sources ?? [])])];
  return { ...(winner as object), sources };
}

/**
 * The record to store when `incoming` arrives for a record whose stored version is `stored`.
 * `concurrent` is true when the device had not seen the stored version (its baseRev is older), so
 * the two edits happened without knowing about each other.
 */
export function mergeRecord(c: SyncCollection, stored: unknown, incoming: unknown, concurrent: boolean): unknown {
  if (incoming === null) return null;
  if (stored === null || stored === undefined || !concurrent) return incoming;
  switch (c) {
    case 'seen':
      return mergeSeen(stored, incoming);
    case 'cards':
      return mergeCard(stored, incoming);
    case 'attempts':
      // Answers never change once written.
      return stored;
    default:
      return incoming;
  }
}

/* ---------------- change detection on a device ---------------- */

/** A short, stable fingerprint of a record body (FNV-1a over its JSON), to tell which records changed. */
export function fingerprint(body: unknown): string {
  const s = JSON.stringify(body) ?? 'undefined';
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ ch, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36);
}

export function recordKey(c: SyncCollection, id: string): string {
  return `${c}/${id}`;
}
