/**
 * A copy of the signed-in player's account on the device (docs/ACCOUNTS.md, "A copy on the device"), so the site
 * opens with their practice at once and then asks the server only for what changed, and so an answer given without
 * a connection is still there after the page is closed.
 *
 * The copy mirrors what cloud.ts holds in memory: one row for each record (what is here, and the fingerprint of what
 * the server has), and one "state" entry with the cursors, the profile, the team and the settings. Everything that
 * differs from the server's side is found again from the rows after a restart, exactly as it is while the page is
 * open, so nothing needs its own "to send" list.
 *
 * It is the player's choice (a "shared computer" box at sign-in, a switch on the Account page), it belongs to one
 * session, and signing out deletes the database. A signed-out device holds nothing.
 */
import type { TeamResponse, UserProfile } from '../core/accounts';
import type { Team } from '../core/schema';
import type { AppSettings } from './store';

/** What a signed-in player last chose on the solo practice page (TryRound.tsx); forgotten at sign-out with the copy. */
export const SOLO_SETUP_KEY = 'rebound-solo-setup';

/** A copy written by a different version of this layout is ignored (and replaced by a fresh load). */
export const COPY_VERSION = 1;

export interface CopyState {
  v: number;
  /** The user the copy belongs to, and the team its team rows belong to. */
  me: string;
  teamId: string | null;
  userCursor: number;
  teamCursor: number;
  user: UserProfile;
  team: TeamResponse | null;
  /** The settings and the team as they are here (they may hold a change not sent yet)… */
  settings: AppSettings;
  localTeam: Team | null;
  /** …and the fingerprints of the server's. */
  settingsFp: string;
  teamFp: string | null;
  savedAt: number;
}

export interface CopyRow {
  /** "collection/id". */
  k: string;
  c: string;
  id: string;
  /** Whether the record exists here, and its body if it does. */
  has: boolean;
  body: unknown;
  /** The fingerprint of the server's copy, or "-" when the server has none. */
  known: string;
  /** Game and match answers: the record's revision (how far review cards have been made from them). */
  rev?: number;
}

export interface CopyStore {
  /** The whole copy; `state` is null when there is none (or it was only half written). */
  read(): Promise<{ state: CopyState | null; rows: CopyRow[] }>;
  /** Replaces the copy. The state goes in last, so a copy cut short has none and is ignored. */
  replace(state: CopyState, rows: CopyRow[]): Promise<void>;
  /** Writes changed rows, removes rows that are gone, and updates the state, together. */
  patch(state: CopyState, put: CopyRow[], remove: string[]): Promise<void>;
  /** Deletes the copy and the database that held it. */
  wipe(): Promise<void>;
}

/* ---------------- IndexedDB ---------------- */

const DB_NAME = 'rebound-account';
const ROWS = 'records';
const STATE = 'state';
/** Rows written in one transaction when the whole copy is replaced (a long history is tens of thousands). */
const CHUNK = 1000;

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('The device copy could not be written.'));
    tx.onabort = () => reject(tx.error ?? new Error('The device copy could not be written.'));
  });
}

function asked<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The device copy could not be read.'));
  });
}

/** The copy in the browser's IndexedDB, or null where there is none (an old browser, or storage switched off). */
export function indexedDbCopy(): CopyStore | null {
  const idb = globalThis.indexedDB;
  if (!idb) return null;
  let opening: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = idb.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(ROWS, { keyPath: 'k' });
        request.result.createObjectStore(STATE);
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab deletes the database (it signed out): let go, so the deletion is not held up.
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        db.onclose = () => {
          opening = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error('The device copy could not be opened.'));
      request.onblocked = () => reject(new Error('The device copy is in use by another tab.'));
    }).catch((error: unknown) => {
      opening = null;
      throw error;
    });
    return opening;
  };

  return {
    async read() {
      const db = await open();
      const tx = db.transaction([ROWS, STATE], 'readonly');
      const [state, rows] = await Promise.all([asked(tx.objectStore(STATE).get(STATE) as IDBRequest<CopyState | undefined>), asked(tx.objectStore(ROWS).getAll() as IDBRequest<CopyRow[]>)]);
      return { state: state ?? null, rows };
    },

    async replace(state, rows) {
      const db = await open();
      const clear = db.transaction([ROWS, STATE], 'readwrite');
      clear.objectStore(ROWS).clear();
      clear.objectStore(STATE).clear();
      await finished(clear);
      for (let i = 0; i < rows.length; i += CHUNK) {
        const tx = db.transaction(ROWS, 'readwrite');
        const store = tx.objectStore(ROWS);
        for (const row of rows.slice(i, i + CHUNK)) store.put(row);
        await finished(tx);
      }
      const last = db.transaction(STATE, 'readwrite');
      last.objectStore(STATE).put(state, STATE);
      await finished(last);
    },

    async patch(state, put, remove) {
      const db = await open();
      const tx = db.transaction([ROWS, STATE], 'readwrite');
      const store = tx.objectStore(ROWS);
      for (const row of put) store.put(row);
      for (const key of remove) store.delete(key);
      tx.objectStore(STATE).put(state, STATE);
      await finished(tx);
    },

    async wipe() {
      const db = await (opening ?? Promise.resolve(null)).catch(() => null);
      db?.close();
      opening = null;
      await new Promise<void>((resolve) => {
        const request = idb.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    },
  };
}

/** Deletes the database if a copy was ever made here, without creating one. For devices that keep no copy. */
export async function deleteDeviceCopy(): Promise<void> {
  const idb = globalThis.indexedDB;
  if (!idb) return;
  await new Promise<void>((resolve) => {
    const request = idb.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/* ---------------- in memory, for tests ---------------- */

/** A copy kept in memory, as IndexedDB keeps it (values are cloned in and out). */
export function memoryCopy(): CopyStore & { state: CopyState | null; rows: Map<string, CopyRow>; writes: number } {
  const clone = <T>(value: T): T => structuredClone(value);
  const self = {
    state: null as CopyState | null,
    rows: new Map<string, CopyRow>(),
    writes: 0,
    async read() {
      return { state: clone(self.state), rows: [...self.rows.values()].map(clone) };
    },
    async replace(state: CopyState, rows: CopyRow[]) {
      self.writes += 1;
      self.state = null;
      self.rows = new Map(rows.map((r) => [r.k, clone(r)]));
      self.state = clone(state);
    },
    async patch(state: CopyState, put: CopyRow[], remove: string[]) {
      self.writes += 1;
      for (const row of put) self.rows.set(row.k, clone(row));
      for (const key of remove) self.rows.delete(key);
      self.state = clone(state);
    },
    async wipe() {
      self.writes += 1;
      self.state = null;
      self.rows = new Map();
    },
  };
  return self;
}
