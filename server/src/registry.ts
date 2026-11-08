/**
 * The registry: one Durable Object for the whole server that only counts new teams, so sign-up can be open to
 * any school without letting one network, or a script, create teams without end. It never sees team data.
 * Network addresses are kept only as salted hashes, and only for the current UTC day.
 */

import { DurableObject } from 'cloudflare:workers';
import { newId, sha256Hex } from './crypto';

/** New teams one network address may create per UTC day (a school network can still make several). */
export const TEAMS_PER_ADDRESS_PER_DAY = 10;
/** New teams per UTC day across the whole server: a backstop against abuse from many addresses. */
export const TEAMS_PER_DAY = 300;

export type Reservation = { ok: true } | { ok: false; message: string; retryAfter: number };

const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

function secondsToMidnight(now: number): number {
  const d = new Date(now);
  return Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now) / 1000);
}

export class Registry extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS creations (day TEXT NOT NULL, address TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (day, address));
    `);
  }

  /**
   * Counts one new team from `address` (CF-Connecting-IP; null when there is none, as in local tests, which
   * skips the per-address check), or refuses it with how long to wait.
   */
  async reserveTeam(address: string | null, now: number): Promise<Reservation> {
    const sql = this.ctx.storage.sql;
    // Hash first: everything after it runs without awaiting, so parallel requests can't both take the last slot.
    const key = address === null ? null : await sha256Hex(`${this.salt()}|${address}`);
    const day = dayOf(now);
    sql.exec('DELETE FROM creations WHERE day < ?', day);
    const total = sql.exec<{ n: number }>('SELECT COALESCE(SUM(count), 0) AS n FROM creations WHERE day = ?', day).one().n;
    if (total >= TEAMS_PER_DAY) {
      return { ok: false, message: 'Rebound has reached its limit of new teams for today. Please try again tomorrow.', retryAfter: secondsToMidnight(now) };
    }
    const row = key === null ? 'none' : key;
    if (key !== null) {
      const mine = sql.exec<{ count: number }>('SELECT count FROM creations WHERE day = ? AND address = ?', day, key).toArray()[0]?.count ?? 0;
      if (mine >= TEAMS_PER_ADDRESS_PER_DAY) {
        return {
          ok: false,
          message: `${TEAMS_PER_ADDRESS_PER_DAY} teams were already created from this network today. Try again tomorrow, or join an existing team with its join link.`,
          retryAfter: secondsToMidnight(now),
        };
      }
    }
    sql.exec('INSERT INTO creations (day, address, count) VALUES (?, ?, 1) ON CONFLICT(day, address) DO UPDATE SET count = count + 1', day, row);
    return { ok: true };
  }

  /** Teams created today, for the maintainer's checks (and tests). */
  async createdToday(now: number): Promise<number> {
    return this.ctx.storage.sql.exec<{ n: number }>('SELECT COALESCE(SUM(count), 0) AS n FROM creations WHERE day = ?', dayOf(now)).one().n;
  }

  private salt(): string {
    const sql = this.ctx.storage.sql;
    const existing = sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'salt'").toArray()[0]?.value;
    if (existing) return existing;
    const salt = newId(32);
    sql.exec("INSERT INTO meta (key, value) VALUES ('salt', ?)", salt);
    return salt;
  }
}
