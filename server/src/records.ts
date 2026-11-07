/**
 * Sync (docs/SERVER.md, "Sync"): apply a device's pushed changes using the shared rules in src/core/sync.ts
 * (canWrite, mergeRecord, sizes), then return every record newer than the device's cursor. The caller runs
 * `runSync` inside one storage transaction, so a device never sees half a sync.
 */

import {
  canWrite,
  isSyncCollection,
  MAX_RECORD_BYTES,
  mergeRecord,
  SYNC_PAGE_SIZE,
  type MemberInfo,
  type SyncCollection,
} from '../../src/core/sync';
import { HttpError } from './http';
import type { Store } from './store';
import { asObject, MAX_ID_LENGTH, MAX_JSON_DEPTH, nestsDeeperThan, sameJson, utf8Bytes } from './validate';

/**
 * A page also ends early once it holds about this many bytes of records (always at least one record), so a
 * page of 500 large packets cannot become a response of hundreds of megabytes. `more` is then true.
 */
export const SYNC_RESPONSE_BYTES = 4 * 1024 * 1024;

/** A pushed change after its shape is checked. The collection is checked per change, in `runSync`. */
export interface IncomingChange {
  c: string;
  id: string;
  body: unknown;
  baseRev: number | null;
}

export interface IncomingSync {
  cursor: number;
  changes: IncomingChange[];
}

/** Checks the request's shape. A malformed request is a client bug, so it fails as a whole (400). */
export function parseSyncRequest(value: unknown): IncomingSync {
  const body = asObject(value);
  const cursor = body.cursor ?? 0;
  if (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0) {
    throw new HttpError(400, 'The sync cursor must be a whole number, 0 or more.');
  }
  const changes = body.changes ?? [];
  if (!Array.isArray(changes)) throw new HttpError(400, 'The changes to sync must be a list.');
  if (changes.length > SYNC_PAGE_SIZE) throw new HttpError(413, `Send at most ${SYNC_PAGE_SIZE} changes at a time.`);
  return { cursor, changes: changes.map(parseChange) };
}

function parseChange(value: unknown, index: number): IncomingChange {
  const which = `Change ${index + 1}`;
  const change = asObject(value, which);
  if (typeof change.c !== 'string') throw new HttpError(400, `${which} needs a collection name (c).`);
  if (typeof change.id !== 'string') throw new HttpError(400, `${which} needs a record id.`);
  if (!('body' in change)) throw new HttpError(400, `${which} needs a body (null to delete).`);
  const baseRev = change.baseRev ?? null;
  if (baseRev !== null && (typeof baseRev !== 'number' || !Number.isSafeInteger(baseRev) || baseRev < 0)) {
    throw new HttpError(400, `${which} has a baseRev that is not a whole number.`);
  }
  return { c: change.c, id: change.id, body: change.body, baseRev };
}

/** Why one change cannot be stored, or null if it can. These reasons go back to the device in `rejected`. */
function problemWith(change: IncomingChange): string | null {
  if (!isSyncCollection(change.c)) return "This kind of data can't be synced.";
  if (change.id.length < 1 || change.id.length > MAX_ID_LENGTH) return `Record ids must be 1 to ${MAX_ID_LENGTH} characters.`;
  if (change.body !== null) {
    if (nestsDeeperThan(change.body, MAX_JSON_DEPTH)) return 'This record is nested too deeply to sync.';
    if (utf8Bytes(JSON.stringify(change.body)) > MAX_RECORD_BYTES) return tooLarge;
  }
  return null;
}

const tooLarge = `This record is too large to sync (the limit is ${Math.round(MAX_RECORD_BYTES / 1000)} KB).`;
const notAllowed = "You don't have permission to change this record.";

type StoredRecord = { body: string | null; rev: number };
type RecordRow = { c: string; id: string; body: string | null; rev: number; by: string };

/** Applies the changes and builds the response as JSON text (stored bodies are spliced in without re-parsing). */
export function runSync(store: Store, member: MemberInfo, request: IncomingSync): string {
  const { sql } = store;
  let rev = Number(store.meta('rev') ?? 0);
  const rejected: Array<{ c: string; id: string; reason: string }> = [];

  for (const change of request.changes) {
    const problem = problemWith(change);
    if (problem) {
      rejected.push({ c: change.c, id: change.id, reason: problem });
      continue;
    }
    const c = change.c as SyncCollection;
    const stored = sql.exec<StoredRecord>('SELECT body, rev FROM records WHERE c = ? AND id = ?', c, change.id).toArray()[0];
    const storedBody: unknown = stored && stored.body !== null ? JSON.parse(stored.body) : null;

    if (!canWrite(member, c, change.id, change.body, storedBody)) {
      rejected.push({ c, id: change.id, reason: notAllowed });
      continue;
    }
    // Concurrent: the device had not seen the stored version, so the two edits did not know about each other.
    const concurrent = stored !== undefined && (change.baseRev === null || change.baseRev < stored.rev);
    const merged = mergeRecord(c, storedBody, change.body, concurrent);

    // One revision per real change: storing what is already there (or deleting what never existed) is a no-op.
    if (stored ? sameJson(merged, storedBody) : merged === null) continue;

    const text = merged === null ? null : JSON.stringify(merged);
    if (text !== null && utf8Bytes(text) > MAX_RECORD_BYTES) {
      rejected.push({ c, id: change.id, reason: tooLarge });
      continue;
    }
    rev += 1;
    sql.exec(
      `INSERT INTO records (c, id, body, rev, "by") VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (c, id) DO UPDATE SET body = excluded.body, rev = excluded.rev, "by" = excluded."by"`,
      c,
      change.id,
      text,
      rev,
      member.id,
    );
  }
  store.setMeta('rev', rev);

  // Everything above the device's cursor, oldest first, including what it just pushed (with new revisions).
  const parts: string[] = [];
  let cursor = request.cursor;
  let size = 0;
  let more = false;
  const rows = sql.exec<RecordRow>(
    'SELECT c, id, body, rev, "by" AS "by" FROM records WHERE rev > ? ORDER BY rev LIMIT ?',
    request.cursor,
    SYNC_PAGE_SIZE + 1,
  );
  for (const row of rows) {
    const part = `{"c":${JSON.stringify(row.c)},"id":${JSON.stringify(row.id)},"body":${row.body ?? 'null'},"rev":${row.rev},"by":${JSON.stringify(row.by)}}`;
    if (parts.length === SYNC_PAGE_SIZE || (parts.length > 0 && size + part.length > SYNC_RESPONSE_BYTES)) {
      more = true;
      break;
    }
    parts.push(part);
    size += part.length;
    cursor = row.rev;
  }
  return `{"cursor":${cursor},"changes":[${parts.join(',')}],"rejected":${JSON.stringify(rejected)},"more":${more}}`;
}
