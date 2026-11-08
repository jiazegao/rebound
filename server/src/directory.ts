/**
 * The directory: one Durable Object for the whole server (named "global") that knows which user each email address
 * and Google account belongs to, keeps the pending email sign-in codes, and enforces the sign-in limits
 * (docs/ACCOUNTS.md, "Limits"). It holds no practice data. Codes are kept only as hashes, for 15 minutes; network
 * addresses, and the email addresses in the send log, only as salted hashes.
 */

import { DurableObject } from 'cloudflare:workers';
import { EMAIL_CODE_MS } from './auth';
import { newId, newSecret, sha256Hex } from './crypto';
import { HttpError, refusing, type Result } from './http';

/** Sign-in emails to one address per 15 minutes. */
export const EMAILS_PER_ADDRESS = 3;
const ADDRESS_WINDOW_MS = 15 * 60 * 1000;
/** Sign-in emails from one network address per hour. */
export const EMAILS_PER_NETWORK = 10;
const NETWORK_WINDOW_MS = 60 * 60 * 1000;
/** New accounts from one network address per UTC day (a school's network can still sign up a whole team). */
export const NEW_ACCOUNTS_PER_NETWORK = 20;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS emails (email TEXT PRIMARY KEY, user_id TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS emails_by_user ON emails (user_id);
CREATE TABLE IF NOT EXISTS google (sub TEXT PRIMARY KEY, user_id TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS google_by_user ON google (user_id);
CREATE TABLE IF NOT EXISTS codes (code_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sends (at INTEGER NOT NULL, email_key TEXT NOT NULL, address_key TEXT, code_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS signups (day TEXT NOT NULL, address_key TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (day, address_key));
`;

/**
 * Who signed in: a user id, or null when there is no account yet and the person must still sign up. An email
 * sign-in also gives its code's expiry, so the code can be put back if the sign-in cannot finish.
 */
export type Resolution = Result<{ userId: string | null; email: string; isNew: boolean; expiresAt?: number }>;

const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);
const startOfDay = (now: number) => Date.parse(`${dayOf(now)}T00:00:00Z`);
const secondsToMidnight = (now: number) => Math.ceil((startOfDay(now) + 24 * 60 * 60 * 1000 - now) / 1000);

function minutes(ms: number): string {
  const n = Math.max(1, Math.ceil(ms / 60_000));
  return n === 1 ? '1 minute' : `${n} minutes`;
}

export class Directory extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(SCHEMA);
  }

  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }

  /**
   * A new sign-in code for `email`, unless a limit says to wait: 3 per address per 15 minutes, 10 per network
   * address per hour, `dailyLimit` per UTC day in all. The caller sends the code (or cancels it if it can't).
   */
  async startEmail(email: string, address: string | null, now: number, dailyLimit: number): Promise<Result<{ code: string; codeHash: string }>> {
    // Hash first: everything after runs without awaiting, so parallel requests can't both take the last place.
    const salt = this.salt();
    const emailKey = await sha256Hex(`${salt}|email|${email}`);
    const addressKey = address === null ? null : await sha256Hex(`${salt}|address|${address}`);
    const code = newSecret();
    const codeHash = await sha256Hex(code);
    return refusing(() => {
      this.tidy(now);
      const toAddress = this.sql
        .exec<{ n: number; first: number | null }>('SELECT COUNT(*) AS n, MIN(at) AS first FROM sends WHERE email_key = ? AND at > ?', emailKey, now - ADDRESS_WINDOW_MS)
        .one();
      if (toAddress.n >= EMAILS_PER_ADDRESS) {
        const wait = toAddress.first! + ADDRESS_WINDOW_MS - now;
        throw new HttpError(429, `We just sent a few sign-in links to that address. Check your inbox (and spam folder), or ask again in ${minutes(wait)}.`, wait / 1000);
      }
      if (addressKey !== null) {
        const fromNetwork = this.sql
          .exec<{ n: number; first: number | null }>('SELECT COUNT(*) AS n, MIN(at) AS first FROM sends WHERE address_key = ? AND at > ?', addressKey, now - NETWORK_WINDOW_MS)
          .one();
        if (fromNetwork.n >= EMAILS_PER_NETWORK) {
          const wait = fromNetwork.first! + NETWORK_WINDOW_MS - now;
          throw new HttpError(429, `Too many sign-in emails were asked for from this network. Try again in ${minutes(wait)}.`, wait / 1000);
        }
      }
      const today = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM sends WHERE at >= ?', startOfDay(now)).one().n;
      if (today >= dailyLimit) {
        throw new HttpError(429, 'Rebound has sent all the sign-in emails it can today. Try again tomorrow, or sign in with Google.', secondsToMidnight(now));
      }
      this.sql.exec('INSERT INTO codes (code_hash, email, expires_at) VALUES (?, ?, ?)', codeHash, email, now + EMAIL_CODE_MS);
      this.sql.exec('INSERT INTO sends (at, email_key, address_key, code_hash) VALUES (?, ?, ?, ?)', now, emailKey, addressKey, codeHash);
      return { code, codeHash };
    });
  }

  /** The email could not be sent: forget its code and give back its place in the limits. */
  async cancelEmail(codeHash: string): Promise<void> {
    this.sql.exec('DELETE FROM codes WHERE code_hash = ?', codeHash);
    this.sql.exec('DELETE FROM sends WHERE code_hash = ?', codeHash);
  }

  /**
   * Uses an email code: the account with that address, or with `name` (the person confirmed they are 13 or older)
   * a new one. Without an account or a name the code stays usable, for the retry after the person signs up.
   */
  async finishEmail(codeHash: string, name: string | null, address: string | null, now: number): Promise<Resolution> {
    const addressKey = address === null ? null : await sha256Hex(`${this.salt()}|address|${address}`);
    return refusing(() => {
      this.tidy(now);
      const code = this.sql
        .exec<{ email: string; expires_at: number }>('SELECT email, expires_at FROM codes WHERE code_hash = ? AND expires_at > ?', codeHash, now)
        .toArray()[0];
      if (!code) throw new HttpError(400, 'This sign-in link has expired or was already used. Ask for a new one.');
      const existing = this.userByEmail(code.email);
      if (existing === null && name === null) return { userId: null, email: code.email, isNew: false, expiresAt: code.expires_at };
      let userId = existing;
      if (userId === null) {
        this.countNewAccount(addressKey, now);
        userId = newId();
        this.sql.exec('INSERT INTO emails (email, user_id) VALUES (?, ?)', code.email, userId);
      }
      this.sql.exec('DELETE FROM codes WHERE code_hash = ?', codeHash);
      return { userId, email: code.email, isNew: existing === null, expiresAt: code.expires_at };
    });
  }

  /** Puts back a code whose sign-in could not finish (the account must be made again), until it expires. */
  async restoreCode(codeHash: string, email: string, expiresAt: number): Promise<void> {
    this.sql.exec('INSERT INTO codes (code_hash, email, expires_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', codeHash, email, expiresAt);
  }

  /**
   * A verified Google account: the user with that Google account, else the user with its email address (linking the
   * Google account to them), else with `name` a new user.
   */
  async resolveGoogle(sub: string, email: string, name: string | null, address: string | null, now: number): Promise<Resolution> {
    const addressKey = address === null ? null : await sha256Hex(`${this.salt()}|address|${address}`);
    return refusing(() => {
      this.tidy(now);
      const bySub = this.sql.exec<{ user_id: string }>('SELECT user_id FROM google WHERE sub = ?', sub).toArray()[0]?.user_id ?? null;
      if (bySub !== null) return { userId: bySub, email, isNew: false };
      const byEmail = this.userByEmail(email);
      if (byEmail !== null) {
        this.sql.exec('INSERT INTO google (sub, user_id) VALUES (?, ?)', sub, byEmail);
        return { userId: byEmail, email, isNew: false };
      }
      if (name === null) return { userId: null, email, isNew: false };
      this.countNewAccount(addressKey, now);
      const userId = newId();
      this.sql.exec('INSERT INTO emails (email, user_id) VALUES (?, ?)', email, userId);
      this.sql.exec('INSERT INTO google (sub, user_id) VALUES (?, ?)', sub, userId);
      return { userId, email, isNew: true };
    });
  }

  /** A deleted account: its email address and Google account no longer lead to it. */
  async forget(userId: string): Promise<void> {
    const emails = this.sql.exec<{ email: string }>('SELECT email FROM emails WHERE user_id = ?', userId).toArray();
    for (const { email } of emails) this.sql.exec('DELETE FROM codes WHERE email = ?', email);
    this.sql.exec('DELETE FROM emails WHERE user_id = ?', userId);
    this.sql.exec('DELETE FROM google WHERE user_id = ?', userId);
  }

  private userByEmail(email: string): string | null {
    return this.sql.exec<{ user_id: string }>('SELECT user_id FROM emails WHERE email = ?', email).toArray()[0]?.user_id ?? null;
  }

  /** Counts a new account from the network address (none in local tests: not counted), or refuses it. */
  private countNewAccount(addressKey: string | null, now: number): void {
    if (addressKey === null) return;
    const day = dayOf(now);
    const made = this.sql.exec<{ count: number }>('SELECT count FROM signups WHERE day = ? AND address_key = ?', day, addressKey).toArray()[0]?.count ?? 0;
    if (made >= NEW_ACCOUNTS_PER_NETWORK) {
      throw new HttpError(429, `${NEW_ACCOUNTS_PER_NETWORK} accounts were already made from this network today. Please try again tomorrow.`, secondsToMidnight(now));
    }
    this.sql.exec('INSERT INTO signups (day, address_key, count) VALUES (?, ?, 1) ON CONFLICT (day, address_key) DO UPDATE SET count = count + 1', day, addressKey);
  }

  /** Drops expired codes and limit records nothing counts any more (the send log keeps today and the last hour). */
  private tidy(now: number): void {
    this.sql.exec('DELETE FROM codes WHERE expires_at <= ?', now);
    this.sql.exec('DELETE FROM sends WHERE at < ?', Math.min(startOfDay(now), now - NETWORK_WINDOW_MS));
    this.sql.exec('DELETE FROM signups WHERE day < ?', dayOf(now));
  }

  private salt(): string {
    const existing = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'salt'").toArray()[0]?.value;
    if (existing) return existing;
    const salt = newId(32);
    this.sql.exec("INSERT INTO meta (key, value) VALUES ('salt', ?)", salt);
    return salt;
  }
}
