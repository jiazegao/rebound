/**
 * Ids, secrets, session tokens and PIN hashing. Only Web Crypto is used (crypto.getRandomValues and
 * crypto.subtle), so the same code runs in the Workers runtime and in the tests.
 */

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** Team ids: 16 lowercase base32 characters (80 random bits). */
export const TEAM_ID_PATTERN = /^[a-z2-7]{16}$/;
/** Join secrets: 12 lowercase base32 characters (60 random bits), stored only as a SHA-256 hash. */
export const SECRET_PATTERN = /^[a-z2-7]{12}$/;
/** Session tokens: 32 random bytes in base64url (43 characters), stored only as a SHA-256 hash. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * PBKDF2 rounds for new PINs. A 4–8 digit PIN is weak against anyone holding the hash however many
 * rounds there are, so the real defenses are keeping hashes inside the team's Durable Object and the
 * lockout after five wrong tries. 20,000 rounds (about 3 ms) keeps sign-in well inside the Workers
 * free plan's CPU limit. Stored hashes carry their round count, so this can change later.
 */
export const PIN_ITERATIONS = 20_000;
const PIN_SALT_BYTES = 16;
const PIN_HASH_BITS = 256;

/** Random lowercase base32 text. Each byte gives one character; 256 is a multiple of 32, so there is no bias. */
export function randomBase32(length: number): string {
  let out = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(length))) out += BASE32[byte & 31];
  return out;
}

export const newTeamId = (): string => randomBase32(16);
export const newJoinSecret = (): string => randomBase32(12);
/** Member and room ids only need to be unique within a team, but random ids also keep them unguessable. */
export const newId = (length = 16): string => randomBase32(length);

export function newSessionToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/.test(hex)) throw new Error('Not a hex string');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
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
 * Different lengths are not secret (every stored hash has a fixed length) and simply do not match.
 */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

/** Whether `secret` hashes to `storedHashHex`, compared in constant time. */
export async function secretMatches(secret: string, storedHashHex: string): Promise<boolean> {
  return sameBytes(await sha256(secret), fromHex(storedHashHex));
}

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, PIN_HASH_BITS);
  return new Uint8Array(bits);
}

/** Hashes a PIN with a new random salt. `hash` is "<iterations>$<hex>"; `salt` is hex. */
export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(PIN_SALT_BYTES));
  const derived = await pbkdf2(pin, salt, PIN_ITERATIONS);
  return { hash: `${PIN_ITERATIONS}$${toHex(derived)}`, salt: toHex(salt) };
}

export async function verifyPin(pin: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const [iterationsText, hashHex] = storedHash.split('$');
  const iterations = Number(iterationsText);
  if (!Number.isSafeInteger(iterations) || iterations <= 0 || !hashHex) return false;
  const derived = await pbkdf2(pin, fromHex(storedSalt), iterations);
  return sameBytes(derived, fromHex(hashHex));
}
