/**
 * The device side of sync, without the network: turning the saved data into records (see
 * src/core/sync.ts), applying records that arrive from the server, and working out what changed
 * since the last sync from each record's fingerprint.
 */
import { fingerprint, recordKey, SYNC_COLLECTIONS, type PushChange, type SyncCollection, type SyncRecord } from '../core/sync';
import type { AppData } from './store';

export interface LocalRecord {
  c: SyncCollection;
  id: string;
  body: unknown;
}

/** What the device knows about each record it has synced: the fingerprint it had then and the server revision. */
export type Known = Record<string, { fp: string; rev: number }>;

type ArrayCollection = 'players' | 'lineups' | 'assignments' | 'packets' | 'visuals' | 'games' | 'attempts' | 'reports';
type MapCollection = 'completions' | 'conceptCards' | 'cards' | 'seen' | 'conceptReads' | 'plans';

const ARRAYS: ArrayCollection[] = ['players', 'lineups', 'assignments', 'packets', 'visuals', 'games', 'attempts', 'reports'];
const MAPS: MapCollection[] = ['completions', 'conceptCards', 'cards', 'seen', 'conceptReads', 'plans'];

/** Every synced record in the saved data, keyed by `collection/id`. */
export function toRecords(data: AppData): Map<string, LocalRecord> {
  const out = new Map<string, LocalRecord>();
  const add = (c: SyncCollection, id: string, body: unknown) => out.set(recordKey(c, id), { c, id, body });
  if (data.team) add('team', 'team', data.team);
  for (const c of ARRAYS) for (const item of data[c] as Array<{ id: string }>) add(c, item.id, item);
  for (const c of MAPS) for (const [id, body] of Object.entries(data[c] as Record<string, unknown>)) add(c, id, body);
  return out;
}

/** The changes to push: records that are new or changed since they were last synced, and deletions. */
export function localChanges(records: Map<string, LocalRecord>, known: Known): PushChange[] {
  const changes: PushChange[] = [];
  for (const [key, r] of records) {
    const k = known[key];
    if (!k || k.fp !== fingerprint(r.body)) changes.push({ c: r.c, id: r.id, body: r.body, baseRev: k?.rev ?? null });
  }
  for (const [key, k] of Object.entries(known)) {
    if (records.has(key) || k.fp === DELETED) continue;
    const slash = key.indexOf('/');
    changes.push({ c: key.slice(0, slash) as SyncCollection, id: key.slice(slash + 1), body: null, baseRev: k.rev });
  }
  // Apply order matters for a fresh device (the team before its players, and so on).
  const order = (c: SyncCollection) => SYNC_COLLECTIONS.indexOf(c);
  return changes.sort((a, b) => order(a.c) - order(b.c));
}

/**
 * The changes to send in one request: at most `maxCount`, and at most about `maxBytes` of JSON (the server
 * takes request bodies up to 2 MB, and a record with a picture can be a few hundred kilobytes). Always at
 * least one change, so a single large record still goes.
 */
export function pushBatch(changes: PushChange[], maxCount: number, maxBytes: number): PushChange[] {
  const out: PushChange[] = [];
  let bytes = 0;
  for (const change of changes) {
    if (out.length >= maxCount) break;
    const size = JSON.stringify(change).length;
    if (out.length > 0 && bytes + size > maxBytes) break;
    out.push(change);
    bytes += size;
  }
  return out;
}

/** Fingerprint stored for a record deleted on both sides. */
export const DELETED = '-';

/** Put records from the server into the saved data (body null deletes). */
export function applyRecords(d: AppData, records: SyncRecord[]): void {
  for (const r of records) {
    if (r.c === 'team') {
      if (r.body === null) d.team = null;
      else d.team = r.body as AppData['team'];
      continue;
    }
    if ((ARRAYS as string[]).includes(r.c)) {
      const list = d[r.c as ArrayCollection] as Array<{ id: string }>;
      const i = list.findIndex((x) => x.id === r.id);
      if (r.body === null) {
        if (i >= 0) list.splice(i, 1);
      } else if (i >= 0) list[i] = r.body as { id: string };
      else list.push(r.body as { id: string });
      continue;
    }
    const map = d[r.c as MapCollection] as Record<string, unknown>;
    if (r.body === null) delete map[r.id];
    else map[r.id] = r.body;
  }
  // Newest first, as the pages expect.
  d.games.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  d.lineups.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  d.assignments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  d.packets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  d.visuals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  d.attempts.sort((a, b) => a.t - b.t);
}

/** Remember what the server now has, so these records are not pushed again until they change. */
export function rememberRecords(known: Known, records: SyncRecord[]): Known {
  const next = { ...known };
  for (const r of records) next[recordKey(r.c, r.id)] = { fp: r.body === null ? DELETED : fingerprint(r.body), rev: r.rev };
  return next;
}
