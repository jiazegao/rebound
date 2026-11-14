/**
 * The records behind AppData (docs/ACCOUNTS.md, "Who owns what"), without the network: which of the signed-in
 * player's practice goes to their own collections, which work goes to the team's, and how records from the server
 * fill AppData back in. Only the player's own records are ever produced for sending: a teammate's practice that
 * found its way into AppData is never sent.
 *
 * Each AppData field has the name of the collection it holds.
 */
import { isTeamCollection, LEDGER_ID, PLAN_ID, TEAM_COLLECTIONS, type Change, type RecordOut, type TeamCollection } from '../core/accounts';
import { fingerprint } from '../core/merge';
import type { SoloAttempt } from '../core/games';
import { cardId, normalizeCard, type Outcome, type ReviewCard } from '../core/review';
import type { Completion } from '../core/schema';
import type { DayPlan } from '../core/plan';
import type { AppData, ProblemReport } from './store';

export interface LocalRecord {
  c: string;
  id: string;
  body: unknown;
}

export const recordKey = (c: string, id: string): string => `${c}/${id}`;

/** The fingerprint kept for a record the server has deleted (or never had). */
export const DELETED = '-';

/** The player's collections a device sends. `answers` is missing: only the server writes those. */
export const SENT_USER_COLLECTIONS = ['attempts', 'seen', 'conceptReads', 'completions', 'reports', 'cards', 'plans'] as const;
export type SentUserCollection = (typeof SENT_USER_COLLECTIONS)[number];

export const isSentUserCollection = (c: string): c is SentUserCollection => (SENT_USER_COLLECTIONS as readonly string[]).includes(c);

/**
 * Whether a device keeps track of this user record: the collections it knows, and for the single-record
 * collections only their one id. Anything else (say, from a newer version of the site) is left alone, never deleted.
 */
export function tracksUserRecord(c: string, id: string): boolean {
  if (c === 'conceptReads') return id === LEDGER_ID;
  if (c === 'plans') return id === PLAN_ID;
  return c === 'answers' || isSentUserCollection(c);
}

/* ---------------- the questions a player has heard ---------------- */

/** Record ids are at most this long (the server's limit). */
const MAX_ID_CHARS = 200;

/**
 * The `seen` record a heard question is kept in. The questions a player has heard are stored a round at a time
 * (question ids end "-t01", "-b12"…, so a round's share everything before that), not in one record: hearing a
 * question then sends a round's worth of ids, not the player's whole history. Older versions of the site kept one
 * record, "ledger"; its questions are read too, and it is deleted once they are in the per-round records.
 */
export function heardGroup(questionId: string): string {
  const cut = questionId.lastIndexOf('-');
  const group = (cut > 0 ? questionId.slice(0, cut) : 'other').slice(0, MAX_ID_CHARS);
  return group === LEDGER_ID ? 'other' : group;
}

/** A player's heard questions as the `seen` records that hold them, one for each round. */
export function heardRecords(ledger: Record<string, number>): LocalRecord[] {
  const groups = new Map<string, Record<string, number>>();
  for (const [questionId, t] of Object.entries(ledger)) {
    const id = heardGroup(questionId);
    let body = groups.get(id);
    if (!body) groups.set(id, (body = {}));
    body[questionId] = t;
  }
  return [...groups].map(([id, body]) => ({ c: 'seen', id, body }));
}

/**
 * A record's fingerprint (to tell which records changed). Ledgers are fingerprinted with their entries in order:
 * the same questions and times are the same ledger whatever order they were written in, and the per-round records
 * are put together again from the whole ledger, in its order.
 */
export function recordFingerprint(c: string, body: unknown): string {
  if ((c === 'seen' || c === 'conceptReads') && obj(body)) {
    return fingerprint(Object.keys(body).sort().map((key) => [key, body[key]]));
  }
  return fingerprint(body);
}

export const tracksTeamRecord = (c: string): boolean => isTeamCollection(c);

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (v: Record<string, unknown>, field: string, type: 'string' | 'number' | 'object' | 'array') =>
  type === 'array' ? Array.isArray(v[field]) : type === 'object' ? obj(v[field]) : typeof v[field] === type;

/**
 * Whether a record from the server has the shape this version of the site needs (a deletion always does). A record
 * that does not is left out of AppData and out of the bookkeeping, so the site neither breaks on it nor deletes it.
 */
export function usableRecord(r: { c: string; body: unknown }): boolean {
  const b = r.body;
  if (b === null) return true;
  if (!obj(b)) return false;
  switch (r.c) {
    case 'attempts':
    case 'answers':
      return has(b, 'questionId', 'string') && has(b, 't', 'number');
    case 'seen':
    case 'conceptReads':
      return Object.values(b).every((t) => typeof t === 'number');
    case 'cards':
      return has(b, 'fsrs', 'object') && has(b, 'log', 'array') && has(b, 'sources', 'array');
    case 'plans':
      return has(b, 'day', 'string') && has(b, 'items', 'array');
    case 'completions':
      return has(b, 'at', 'string');
    case 'reports':
      return has(b, 'questionId', 'string');
    case 'games':
      return has(b, 'teams', 'array') && has(b, 'events', 'array') && has(b, 'pairs', 'array') && has(b, 'packet', 'object');
    case 'lineups':
      return has(b, 'starters', 'array') && has(b, 'alternates', 'array');
    case 'assignments':
      return has(b, 'playerIds', 'array') && has(b, 'due', 'string');
    case 'visuals':
    case 'written':
      return has(b, 'question', 'object');
    default:
      return true;
  }
}

/* ---------------- AppData → records ---------------- */

/** The signed-in player's own records in one collection. */
export function userCollectionRecords(d: AppData, c: SentUserCollection, me: string): LocalRecord[] {
  switch (c) {
    case 'attempts':
      return d.attempts.filter((a) => a.playerId === me).map((a) => ({ c, id: a.id, body: a }));
    case 'seen':
      return d.seen[me] ? heardRecords(d.seen[me]) : [];
    case 'conceptReads':
      return d.conceptReads[me] ? [{ c, id: LEDGER_ID, body: d.conceptReads[me] }] : [];
    case 'completions':
      return Object.values(d.completions)
        .filter((x) => x.playerId === me)
        .map((x) => ({ c, id: x.assignmentId, body: x }));
    case 'reports':
      // Reports carry no player: every report in AppData is the player's own.
      return d.reports.map((r) => ({ c, id: r.id, body: r }));
    case 'cards':
      return Object.values(d.cards)
        .filter((x) => x.playerId === me)
        .map((x) => ({ c, id: x.questionId, body: x }));
    case 'plans':
      return d.plans[me] ? [{ c, id: PLAN_ID, body: d.plans[me] }] : [];
  }
}

/** The team's records in one collection. */
export function teamCollectionRecords(d: AppData, c: TeamCollection): LocalRecord[] {
  if (c === 'conceptCards') return Object.entries(d.conceptCards).map(([id, body]) => ({ c, id, body }));
  return (d[c] as Array<{ id: string }>).map((x) => ({ c, id: x.id, body: x }));
}

function keyed(records: LocalRecord[], into = new Map<string, LocalRecord>()): Map<string, LocalRecord> {
  for (const r of records) into.set(recordKey(r.c, r.id), r);
  return into;
}

/** Every record of the signed-in player's own, keyed "collection/id". */
export function userRecords(d: AppData, me: string): Map<string, LocalRecord> {
  const out = new Map<string, LocalRecord>();
  for (const c of SENT_USER_COLLECTIONS) keyed(userCollectionRecords(d, c, me), out);
  return out;
}

/** Every team record, keyed "collection/id". */
export function teamRecords(d: AppData): Map<string, LocalRecord> {
  const out = new Map<string, LocalRecord>();
  for (const c of TEAM_COLLECTIONS) keyed(teamCollectionRecords(d, c), out);
  return out;
}

/**
 * The changes to send in one request: at most `maxCount`, and at most about `maxBytes` of JSON (a record with a
 * picture can be a few hundred kilobytes). Always at least one change, so a single large record still goes.
 */
export function changeBatch(changes: Change[], maxCount: number, maxBytes: number): Change[] {
  const out: Change[] = [];
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

/* ---------------- records → AppData ---------------- */

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A list's items by id, to put many records into it without searching the list for each one: a long history is
 * tens of thousands of records, and a search for each made loading it slow down with its square.
 */
function byId<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((x) => [x.id, x]));
}

function setIn<T extends { id: string }>(items: Map<string, T>, id: string, body: T | null): void {
  if (body === null) items.delete(id);
  else items.set(id, body);
}

/**
 * Put the player's own records from the server into AppData (`body: null` deletes). Bodies are pinned to the
 * record's id and to `me`, so what arrives always maps back to the same record. `answers` holds the player's game
 * and match answers by record id (AppData keeps them as a list), so an answer that arrives again replaces itself.
 */
export function applyUserRecords(d: AppData, me: string, records: RecordOut[], answers: Map<string, Outcome>): void {
  let answersChanged = false;
  let attempts: Map<string, SoloAttempt> | null = null;
  let reports: Map<string, ProblemReport> | null = null;
  for (const r of records) {
    if (!tracksUserRecord(r.c, r.id) || !usableRecord(r)) continue;
    const body = isObject(r.body) ? r.body : null;
    switch (r.c) {
      case 'answers':
        if (body) answers.set(r.id, { ...(body as unknown as Outcome), playerId: me });
        else answers.delete(r.id);
        answersChanged = true;
        break;
      case 'attempts':
        setIn((attempts ??= byId(d.attempts)), r.id, body ? ({ ...body, id: r.id, playerId: me } as unknown as SoloAttempt) : null);
        break;
      case 'seen': {
        // Each record holds some of the questions the player has heard (a round's, or everything in the one record
        // older versions kept): together they are the ledger, each question at the earliest time it was heard. A
        // deleted record takes nothing away: its questions are in the others (the old record goes that way).
        if (!body) break;
        const ledger = (d.seen[me] ??= {});
        for (const [questionId, t] of Object.entries(body as Record<string, number>)) {
          ledger[questionId] = ledger[questionId] === undefined ? t : Math.min(ledger[questionId], t);
        }
        break;
      }
      case 'conceptReads':
        if (body) d[r.c][me] = body as Record<string, number>;
        else delete d[r.c][me];
        break;
      case 'completions':
        if (body) d.completions[`${r.id}:${me}`] = { ...(body as unknown as Completion), id: `${r.id}:${me}`, assignmentId: r.id, playerId: me };
        else delete d.completions[`${r.id}:${me}`];
        break;
      case 'reports':
        setIn((reports ??= byId(d.reports)), r.id, body ? ({ ...body, id: r.id } as unknown as ProblemReport) : null);
        break;
      case 'cards':
        if (body) d.cards[cardId(me, r.id)] = { ...normalizeCard(body as unknown as ReviewCard), id: cardId(me, r.id), playerId: me, questionId: r.id };
        else delete d.cards[cardId(me, r.id)];
        break;
      case 'plans':
        if (body) d.plans[me] = { ...(body as unknown as DayPlan), playerId: me };
        else delete d.plans[me];
        break;
    }
  }
  // Only collections that received records are touched, so the others keep their identity (see store.update).
  if (answersChanged) d.answers = [...answers.values()].sort((a, b) => a.t - b.t);
  if (attempts) d.attempts = [...attempts.values()].sort((a, b) => a.t - b.t);
  if (reports) d.reports = [...reports.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** Put team records from the server into AppData (`body: null` deletes), newest first as the pages expect. */
export function applyTeamRecords(d: AppData, records: RecordOut[]): void {
  const lists = new Map<Exclude<TeamCollection, 'conceptCards'>, Map<string, { id: string }>>();
  for (const r of records) {
    if (!isTeamCollection(r.c) || !usableRecord(r)) continue;
    const body = isObject(r.body) ? { ...r.body, id: r.id } : null;
    if (r.c === 'conceptCards') {
      if (body) d.conceptCards[r.id] = body as unknown as AppData['conceptCards'][string];
      else delete d.conceptCards[r.id];
      continue;
    }
    let items = lists.get(r.c);
    if (!items) lists.set(r.c, (items = byId(d[r.c] as Array<{ id: string }>)));
    setIn(items, r.id, body as { id: string } | null);
  }
  const by = (field: 'createdAt' | 'updatedAt') => (a: object, b: object) =>
    String((b as Record<string, unknown>)[field] ?? '').localeCompare(String((a as Record<string, unknown>)[field] ?? ''));
  const data = d as unknown as Record<string, object[]>;
  for (const [c, items] of lists) data[c] = [...items.values()].sort(by(c === 'lineups' ? 'updatedAt' : 'createdAt'));
}
