/** Input checks shared by the routes. Every message here can reach a student's screen. */

import { MAX_NAME_CHARS, MAX_TEAM_NAME_CHARS, type MemberRole, type NextEvent, type UserSettings } from '../../src/core/accounts';
import { CORE_SUBJECTS, type CoreSubject } from '../../src/core/schema';
import { HttpError } from './http';

/** Longest record id or other client-made id (docs/SERVER.md: "ids up to 200 characters"). */
export const MAX_ID_LENGTH = 200;
/** JSON nesting deeper than this is refused, so no body can exhaust the stack when it is compared or copied. */
export const MAX_JSON_DEPTH = 100;

export function asObject(value: unknown, what = 'The request'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, `${what} must be a JSON object.`);
  return value as Record<string, unknown>;
}

/** Control characters never belong in names; bidirectional overrides can make a name display as another. */
const UNSAFE_IN_NAMES = /[\p{Cc}‪-‮⁦-⁩]/u;

/** Text in Unicode NFC with runs of whitespace collapsed to one space, or null if it is not a usable name. */
export function cleanLine(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  const chars = [...text].length;
  if (chars < 1 || chars > maxChars || UNSAFE_IN_NAMES.test(text)) return null;
  return text;
}

export const NAME_RULE = `Enter a name of 1 to ${MAX_NAME_CHARS} characters.`;

/** A person's display name (their account name, shown to teammates and in rooms). */
export function personName(value: unknown): string {
  const name = cleanLine(value, MAX_NAME_CHARS);
  if (name === null) throw new HttpError(400, NAME_RULE);
  return name;
}

export function teamName(value: unknown): string {
  const name = cleanLine(value, MAX_TEAM_NAME_CHARS);
  if (name === null) throw new HttpError(400, `Enter a team name of 1 to ${MAX_TEAM_NAME_CHARS} characters.`);
  return name;
}

export function roomName(value: unknown): string {
  const name = cleanLine(value, 60);
  if (name === null) throw new HttpError(400, 'Enter a room name of 1 to 60 characters.');
  return name;
}

export function level(value: unknown): 'HS' | 'MS' {
  if (value === 'HS' || value === 'MS') return value;
  throw new HttpError(400, 'Choose a level: HS (high school) or MS (middle school).');
}

export function role(value: unknown): MemberRole {
  if (value === 'coach' || value === 'captain' || value === 'member') return value;
  throw new HttpError(400, 'A role must be coach, captain or member.');
}

/** A core subject, or null to clear it. */
export function subject(value: unknown): CoreSubject | null {
  if (value === null) return null;
  if (typeof value === 'string' && (CORE_SUBJECTS as string[]).includes(value)) return value as CoreSubject;
  throw new HttpError(400, `A subject must be one of: ${CORE_SUBJECTS.join(', ')}.`);
}

/** A graduation year, or null to clear it. */
export function gradYear(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 2100) return value;
  throw new HttpError(400, 'A graduation year must be a year such as 2028.');
}

/** A squad label (a sub-team such as "A"), or null to clear it. */
export function squad(value: unknown): string | null {
  if (value === null) return null;
  const label = cleanLine(value, 20);
  if (label === null) throw new HttpError(400, 'A squad name is 1 to 20 characters.');
  return label;
}

/** An email address, trimmed and lowercased (one account per address). */
export function emailAddress(value: unknown): string {
  const email = typeof value === 'string' ? value.normalize('NFC').trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@\p{Cc}]+@[^\s@\p{Cc}]+\.[^\s@\p{Cc}]+$/u.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  return email;
}

/** The next competition: `{ name, date: "YYYY-MM-DD", lineupId?, finals? }`, or null to clear it. */
export function nextEvent(value: unknown): NextEvent | null {
  if (value === null) return null;
  const o = asObject(value, 'The next competition');
  const name = cleanLine(o.name, 80);
  if (name === null) throw new HttpError(400, "Enter the competition's name (1 to 80 characters).");
  const date = typeof o.date === 'string' ? o.date : '';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, "Enter the competition's date as YYYY-MM-DD.");
  }
  const out: NextEvent = { name, date };
  if (o.lineupId !== undefined && o.lineupId !== null) {
    if (typeof o.lineupId !== 'string' || o.lineupId.length < 1 || o.lineupId.length > MAX_ID_LENGTH) throw new HttpError(400, 'That lineup id is not valid.');
    out.lineupId = o.lineupId;
  }
  if (o.finals !== undefined && o.finals !== null) {
    if (typeof o.finals !== 'boolean') throw new HttpError(400, 'finals must be true or false.');
    if (o.finals) out.finals = true;
  }
  return out;
}

/** Allowed ranges of the settings the site sends (docs/ACCOUNTS.md: the whole settings object each time). */
const SETTING_RULES: { [K in keyof UserSettings]-?: (v: unknown) => boolean } = {
  sound: (v) => typeof v === 'boolean',
  readingWpm: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 60 && v <= 600,
  answerTimer: (v) => typeof v === 'boolean',
  dailyMinutes: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 600,
  cardsCursor: (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0,
};

const SETTING_PROBLEMS: Record<keyof UserSettings, string> = {
  sound: 'sound must be true or false.',
  readingWpm: 'The reading speed must be 60 to 600 words per minute.',
  answerTimer: 'answerTimer must be true or false.',
  dailyMinutes: 'Daily minutes must be a whole number from 1 to 600.',
  cardsCursor: 'cardsCursor must be a whole number, 0 or more.',
};

/** `current` with the known settings in `value` applied (each checked); unknown keys are ignored. */
export function mergeSettings(current: UserSettings, value: unknown): UserSettings {
  const o = asObject(value, 'The settings');
  const out: UserSettings = { ...current };
  for (const key of Object.keys(SETTING_RULES) as Array<keyof UserSettings>) {
    if (!(key in o) || o[key] === undefined) continue;
    if (!SETTING_RULES[key](o[key])) throw new HttpError(400, SETTING_PROBLEMS[key]);
    (out as unknown as Record<string, unknown>)[key] = o[key];
  }
  return out;
}

/** Whether a parsed JSON value nests deeper than `limit`, checked without recursion. */
export function nestsDeeperThan(value: unknown, limit: number): boolean {
  const stack: Array<[unknown, number]> = [[value, 1]];
  while (stack.length > 0) {
    const [item, depth] = stack.pop()!;
    if (item === null || typeof item !== 'object') continue;
    if (depth > limit) return true;
    for (const child of Array.isArray(item) ? item : Object.values(item)) {
      if (child !== null && typeof child === 'object') stack.push([child, depth + 1]);
    }
  }
  return false;
}

/** Deep equality of two JSON values, ignoring object key order. Inputs are depth-checked, so recursion is safe. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameJson(item, b[i]));
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(y, key) && sameJson(x[key], y[key]));
}

/** Size of a string in bytes of UTF-8, without allocating an encoded copy. */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}
