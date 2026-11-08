/**
 * Ids, secrets, session tokens and hashing. Only Web Crypto is used (crypto.getRandomValues and crypto.subtle), so
 * the same code runs in the Workers runtime and in the tests.
 */

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** Join secrets: 12 lowercase base32 characters (60 random bits). */
export const JOIN_SECRET_PATTERN = /^[a-z2-7]{12}$/;
/** Session secrets and email sign-in codes: 32 random bytes in base64url (43 characters). */
export const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Random lowercase base32 text. Each byte gives one character; 256 is a multiple of 32, so there is no bias. */
export function randomBase32(length: number): string {
  let out = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(length))) out += BASE32[byte & 31];
  return out;
}

/** User, team and room ids: 16 lowercase base32 characters (80 random bits), so they cannot be guessed. */
export const newId = (length = 16): string => randomBase32(length);
export const newJoinSecret = (): string => randomBase32(12);

/** 32 random bytes in base64url: the secret half of a session token, or an email sign-in code. */
export function newSecret(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes base64url (with or without padding). Throws on anything else. */
export function fromBase64url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(text)) throw new Error('Not base64url');
  const plain = text.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(plain + '='.repeat((4 - (plain.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await sha256(text));
}

/**
 * Compares two byte strings in constant time, so the time taken does not reveal how much of a secret matched.
 * Different lengths are not secret (both sides here are SHA-256 digests) and simply do not match.
 */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

/** Whether two secrets are equal, compared through their digests in constant time. */
export async function sameSecret(given: string, stored: string): Promise<boolean> {
  return sameBytes(await sha256(given), await sha256(stored));
}
