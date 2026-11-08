/**
 * Signing in (docs/ACCOUNTS.md, "Identity and sign-in"): checking Google ID tokens, and sending email sign-in links
 * through Resend. Both run in the Worker; the Directory (directory.ts) then maps the verified Google account or
 * email address to a user. No passwords and no Google client secret: an ID token is checked against Google's
 * published keys, and an email link proves the person can read that inbox.
 */

import { fromBase64url } from './crypto';
import { HttpError } from './http';
import { emailAddress } from './validate';

export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
/** Clock difference tolerated when checking a token's times. */
const LEEWAY_S = 60;
/** An unknown key id refetches Google's keys (they rotate), but at most this often. */
const REFETCH_GAP_MS = 60_000;
/** Google's keys are cached as its Cache-Control says; this when it says nothing. */
const DEFAULT_KEYS_MAX_AGE_S = 3600;

export const RESEND_URL = 'https://api.resend.com/emails';
/** How long an email sign-in code works. */
export const EMAIL_CODE_MS = 15 * 60 * 1000;
export const DEFAULT_EMAIL_DAILY_LIMIT = 90;
const DEFAULT_SITE_URL = 'https://jiazegao.github.io/rebound/';

type TestOverrides = {
  /** Public keys to trust instead of fetching Google's. */
  googleKeys?: JsonWebKey[];
  /** The fetch that loads Google's keys (to check caching). */
  googleFetch?: typeof fetch;
  /** Email settings, and the fetch that calls Resend. */
  email?: Partial<EmailSettings> & { fetch?: typeof fetch };
};
let testOverrides: TestOverrides = {};

/** Tests only: trusted keys and fake fetches for Google and Resend. Also forgets the cached Google keys. */
export function setAuthTestOverrides(o: TestOverrides): void {
  testOverrides = o;
  keyCache = null;
}

/* ---------------- Google ---------------- */

interface KeySet {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
  expiresAt: number;
}

/**
 * Google's keys, kept for this isolate. Each request that finds them stale fetches them itself: a fetch shared
 * between requests would tie one request's I/O to another's.
 */
let keyCache: KeySet | null = null;

export interface GoogleAccount {
  sub: string;
  email: string;
}

const GOOGLE_FAILED = "Google sign-in didn't work. Please try again.";
const GOOGLE_DOWN = "Google sign-in isn't available right now. Please try again in a minute.";

const decodeJson = (part: string): unknown => JSON.parse(new TextDecoder().decode(fromBase64url(part)));

/**
 * Checks a Google ID token (a JWT): its RS256 signature against Google's published keys, then that it was made
 * for this site (`aud`), by Google (`iss`), is still valid (`exp`), and names a verified email address.
 */
export async function verifyGoogleToken(token: string, clientId: string, now: number): Promise<GoogleAccount> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, GOOGLE_FAILED);
  let header: { alg?: unknown; kid?: unknown };
  let claims: Record<string, unknown>;
  let signature: Uint8Array;
  try {
    header = decodeJson(parts[0]!) as typeof header;
    claims = decodeJson(parts[1]!) as typeof claims;
    signature = fromBase64url(parts[2]!);
  } catch {
    throw new HttpError(401, GOOGLE_FAILED);
  }
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || !claims || typeof claims !== 'object') throw new HttpError(401, GOOGLE_FAILED);
  const key = await googleKey(header.kid, now);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  if (!key || !(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed))) throw new HttpError(401, GOOGLE_FAILED);

  const seconds = now / 1000;
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (typeof claims.iss !== 'string' || !GOOGLE_ISSUERS.has(claims.iss) || !audience.includes(clientId)) throw new HttpError(401, GOOGLE_FAILED);
  if (typeof claims.exp !== 'number' || claims.exp + LEEWAY_S < seconds) throw new HttpError(401, 'Your Google sign-in expired. Please try again.');
  if (typeof claims.iat === 'number' && claims.iat - LEEWAY_S > seconds) throw new HttpError(401, GOOGLE_FAILED);
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw new HttpError(403, "Your Google account's email address isn't verified yet. Verify it with Google first.");
  }
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new HttpError(401, GOOGLE_FAILED);
  return { sub: claims.sub, email: emailAddress(claims.email) };
}

async function googleKey(kid: string, now: number): Promise<CryptoKey | null> {
  let set = keyCache && keyCache.expiresAt > now ? keyCache : await fetchKeys(now);
  // A key id we have not seen may be a key Google has just started using.
  if (!set.keys.has(kid) && now - set.fetchedAt >= REFETCH_GAP_MS) set = await fetchKeys(now);
  return set.keys.get(kid) ?? null;
}

async function fetchKeys(now: number): Promise<KeySet> {
  let jwks: unknown;
  let maxAge = DEFAULT_KEYS_MAX_AGE_S;
  if (testOverrides.googleKeys) {
    jwks = { keys: testOverrides.googleKeys };
  } else {
    let response: Response;
    try {
      response = await (testOverrides.googleFetch ?? fetch)(GOOGLE_CERTS_URL);
    } catch {
      throw new HttpError(503, GOOGLE_DOWN, 60);
    }
    if (!response.ok) throw new HttpError(503, GOOGLE_DOWN, 60);
    try {
      jwks = await response.json();
    } catch {
      throw new HttpError(503, GOOGLE_DOWN, 60);
    }
    const age = /max-age=(\d+)/i.exec(response.headers.get('Cache-Control') ?? '')?.[1];
    if (age !== undefined) maxAge = Number(age);
  }
  const keys = new Map<string, CryptoKey>();
  const list = (jwks as { keys?: unknown } | null)?.keys;
  for (const jwk of Array.isArray(list) ? (list as Array<Record<string, unknown>>) : []) {
    if (jwk?.kty !== 'RSA' || typeof jwk.kid !== 'string' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') continue;
    if (jwk.alg !== undefined && jwk.alg !== 'RS256') continue;
    try {
      const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      keys.set(jwk.kid, key);
    } catch {
      // A key we cannot use is skipped; tokens signed with it fail to verify.
    }
  }
  keyCache = { keys, fetchedAt: now, expiresAt: now + Math.max(60, maxAge) * 1000 };
  return keyCache;
}

/* ---------------- email links ---------------- */

export interface EmailSettings {
  apiKey: string | null;
  from: string | null;
  siteUrl: string;
  /** Development only: send nothing and hand the code back (DEV_EMAIL_OUTBOX = "1", never in wrangler.toml). */
  devOutbox: boolean;
  /** Emails sent per UTC day in all (under Resend's free 100). */
  dailyLimit: number;
}

export function emailSettings(env: Env): EmailSettings {
  const o = testOverrides.email ?? {};
  const limit = o.dailyLimit ?? Number(env.EMAIL_DAILY_LIMIT);
  return {
    apiKey: o.apiKey !== undefined ? o.apiKey : env.RESEND_API_KEY?.trim() || null,
    from: o.from !== undefined ? o.from : env.EMAIL_FROM?.trim() || null,
    siteUrl: o.siteUrl ?? (env.SITE_URL?.trim() || DEFAULT_SITE_URL),
    devOutbox: o.devOutbox ?? env.DEV_EMAIL_OUTBOX === '1',
    dailyLimit: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_EMAIL_DAILY_LIMIT,
  };
}

/** Email sign-in is on with a Resend key and a sender, or in development with the outbox. */
export function emailEnabled(s: EmailSettings): boolean {
  return s.devOutbox || (s.apiKey !== null && s.from !== null);
}

export function signInLink(s: EmailSettings, code: string): string {
  return `${s.siteUrl}#/signin?code=${code}`;
}

/** Sends the sign-in link. Throws a plain HttpError when Resend does not take it. */
export async function sendSignInEmail(s: EmailSettings, to: string, code: string): Promise<void> {
  const text = [
    'Open this link to sign in to Rebound:',
    '',
    signInLink(s, code),
    '',
    "The link works once, within 15 minutes. If you didn't ask to sign in, you can ignore this email.",
  ].join('\n');
  let response: Response;
  try {
    response = await (testOverrides.email?.fetch ?? fetch)(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: s.from, to: [to], subject: 'Your Rebound sign-in link', text }),
    });
  } catch {
    throw new HttpError(502, "We couldn't send the email right now. Please try again in a few minutes.");
  }
  if (!response.ok) {
    // Resend's answer may name the address or the key's problem; only its status goes to the log.
    console.error(`Resend refused a sign-in email: HTTP ${response.status}`);
    throw new HttpError(502, "We couldn't send the email right now. Please try again in a few minutes.");
  }
}
