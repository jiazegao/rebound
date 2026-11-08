/**
 * Records (docs/ACCOUNTS.md): a user's collections and a team's collections are each a set of records
 * `(collection, id) → body`. Every stored change takes the next revision of that store, so a device reads
 * "everything newer than my cursor", oldest first. A delete keeps a tombstone (body null) so other devices learn
 * about it. The checks and the paging here are shared by UserServer (user.ts) and Team (team.ts); who may write what,
 * and how writes merge, are theirs (from src/core/accounts.ts).
 */

import { MAX_RECORD_BYTES, RECORDS_PAGE_SIZE } from '../../src/core/accounts';
import { HttpError } from './http';
import { asObject, MAX_ID_LENGTH, MAX_JSON_DEPTH, nestsDeeperThan, sameJson, utf8Bytes } from './validate';

/**
 * A page also ends early once it holds about this many bytes of records (always at least one record), so a page
 * of 500 large packets cannot become a response of hundreds of megabytes. `more` is then true.
 */
export const PAGE_BYTES = 4 * 1024 * 1024;

export const RECORDS_SCHEMA = `
CREATE TABLE IF NOT EXISTS records (
  c TEXT NOT NULL,
  id TEXT NOT NULL,
  body TEXT,
  rev INTEGER NOT NULL,
  "by" TEXT,
  PRIMARY KEY (c, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS records_by_rev ON records (rev);
`;

export const TOO_LARGE = `This record is too large to save (the limit is ${Math.round(MAX_RECORD_BYTES / 1000)} KB).`;

/** One change a device sends: the new body, or null to delete. */
export interface IncomingChange {
  c: string;
  id: string;
  body: unknown;
}

export interface Rejection {
  c: string;
  id: string;
  reason: string;
}

/** Checks the shape of `{ changes }`. A malformed request is a client bug, so it fails as a whole (400). */
export function parseChanges(value: unknown): IncomingChange[] {
  const changes = asObject(value).changes;
  if (!Array.isArray(changes)) throw new HttpError(400, 'Send the changes as a list.');
  if (changes.length > RECORDS_PAGE_SIZE) throw new HttpError(413, `Send at most ${RECORDS_PAGE_SIZE} changes at a time.`);
  return changes.map((raw, index) => {
    const which = `Change ${index + 1}`;
    const change = asObject(raw, which);
    if (typeof change.c !== 'string') throw new HttpError(400, `${which} needs a collection name (c).`);
    if (typeof change.id !== 'string') throw new HttpError(400, `${which} needs a record id.`);
    if (!('body' in change)) throw new HttpError(400, `${which} needs a body (null to delete).`);
    return { c: change.c, id: change.id, body: change.body };
  });
}

/** Why a change cannot be stored whatever its collection (its id, shape or size), or null if it can. */
export function shapeProblem(change: IncomingChange): string | null {
  if (change.id.length < 1 || change.id.length > MAX_ID_LENGTH) return `Record ids must be 1 to ${MAX_ID_LENGTH} characters.`;
  if (change.body === null) return null;
  // Every kind of record is an object; merges and stats read their fields.
  if (typeof change.body !== 'object' || Array.isArray(change.body)) return 'A record must be a JSON object.';
  if (nestsDeeperThan(change.body, MAX_JSON_DEPTH)) return 'This record is nested too deeply to save.';
  if (tooLarge(change.body)) return TOO_LARGE;
  return null;
}

export function tooLarge(body: unknown): boolean {
  return body !== null && utf8Bytes(JSON.stringify(body)) > MAX_RECORD_BYTES;
}

type Row = { c: string; id: string; body: string | null; rev: number; by: string | null };

/** One store's records table (a user's or a team's). Writes are meant to run inside a storage transaction. */
export class Records {
  constructor(private readonly sql: SqlStorage) {}

  /** The latest revision. Rows are never removed (deletes keep tombstones), so the highest one only grows. */
  rev(): number {
    return this.sql.exec<{ rev: number }>('SELECT COALESCE(MAX(rev), 0) AS rev FROM records').one().rev;
  }

  /** The stored body (null for none or a tombstone). */
  body(c: string, id: string): unknown {
    const row = this.sql.exec<{ body: string | null }>('SELECT body FROM records WHERE c = ? AND id = ?', c, id).toArray()[0];
    return row && row.body !== null ? JSON.parse(row.body) : null;
  }

  /**
   * Stores `body` (null: a tombstone) under the next revision, `by` the user who wrote it (team records). Storing
   * what is already there, or deleting what never existed, changes nothing. Returns whether it changed.
   */
  put(c: string, id: string, body: unknown, by: string | null = null): boolean {
    const row = this.sql.exec<{ body: string | null }>('SELECT body FROM records WHERE c = ? AND id = ?', c, id).toArray()[0];
    if (row ? sameJson(body, row.body === null ? null : JSON.parse(row.body)) : body === null) return false;
    this.sql.exec(
      `INSERT INTO records (c, id, body, rev, "by") VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (c, id) DO UPDATE SET body = excluded.body, rev = excluded.rev, "by" = excluded."by"`,
      c,
      id,
      body === null ? null : JSON.stringify(body),
      this.rev() + 1,
      by,
    );
    return true;
  }

  /**
   * Records with a revision above `cursor`, oldest first, as the JSON text of `{ cursor, records, more }` (stored
   * bodies are spliced in without parsing them again). `only` limits the collections; `by` adds who wrote each.
   */
  page(cursor: number, options: { only?: ReadonlySet<string>; by?: boolean } = {}): string {
    const only = options.only ? [...options.only] : null;
    const filter = only ? ` AND c IN (${only.map(() => '?').join(', ')})` : '';
    const rows = this.sql.exec<Row>(
      `SELECT c, id, body, rev, "by" AS "by" FROM records WHERE rev > ?${filter} ORDER BY rev LIMIT ?`,
      cursor,
      ...(only ?? []),
      RECORDS_PAGE_SIZE + 1,
    );
    const parts: string[] = [];
    let next = cursor;
    let size = 0;
    let more = false;
    for (const row of rows) {
      const by = options.by && row.by !== null ? `,"by":${JSON.stringify(row.by)}` : '';
      const part = `{"c":${JSON.stringify(row.c)},"id":${JSON.stringify(row.id)},"body":${row.body ?? 'null'},"rev":${row.rev}${by}}`;
      if (parts.length === RECORDS_PAGE_SIZE || (parts.length > 0 && size + part.length > PAGE_BYTES)) {
        more = true;
        break;
      }
      parts.push(part);
      size += part.length;
      next = row.rev;
    }
    return `{"cursor":${next},"records":[${parts.join(',')}],"more":${more}}`;
  }

  /** Every record that is not deleted, as JSON text of `{ [collection]: { [id]: body } }` (for exports). */
  all(): string {
    const groups = new Map<string, string[]>();
    for (const row of this.sql.exec<Row>('SELECT c, id, body FROM records WHERE body IS NOT NULL ORDER BY c, id')) {
      if (!groups.has(row.c)) groups.set(row.c, []);
      groups.get(row.c)!.push(`${JSON.stringify(row.id)}:${row.body}`);
    }
    return `{${[...groups].map(([c, entries]) => `${JSON.stringify(c)}:{${entries.join(',')}}`).join(',')}}`;
  }
}
