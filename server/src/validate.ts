/** Input checks shared by the routes. Every message here can reach a student's screen. */

import type { MemberRole } from '../../src/core/sync';
import { HttpError } from './http';

/** Longest record id, player id or other client-made id (docs/SERVER.md: "ids up to 200 characters"). */
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

export function memberName(value: unknown): string {
  const name = cleanLine(value, 40);
  if (name === null) throw new HttpError(400, 'Enter a name of 1 to 40 characters.');
  return name;
}

/** Names are unique in a team regardless of case (and of compatibility forms such as full-width letters). */
export function nameKey(name: string): string {
  return name.normalize('NFKC').toLowerCase();
}

export function teamName(value: unknown): string {
  const name = cleanLine(value, 80);
  if (name === null) throw new HttpError(400, 'Enter a team name of 1 to 80 characters.');
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

/** PINs are strings of 4 to 8 digits (a number would lose leading zeros). */
export function pin(value: unknown, message = 'Your PIN must be 4 to 8 digits.'): string {
  if (typeof value !== 'string' || !/^[0-9]{4,8}$/.test(value)) throw new HttpError(400, message);
  return value;
}

export function role(value: unknown): MemberRole {
  if (value === 'coach' || value === 'captain' || value === 'member') return value;
  throw new HttpError(400, 'A role must be coach, captain or member.');
}

/** An optional roster player id: absent or null means none. */
export function playerId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_ID_LENGTH) {
    throw new HttpError(400, `A roster player id must be 1 to ${MAX_ID_LENGTH} characters.`);
  }
  return value;
}

export interface CreateTeamInput {
  teamName: string;
  level: 'HS' | 'MS';
  memberName: string;
  pin: string;
  playerId: string | null;
}

/** The body of `POST /api/teams`: `{ teamName, level, memberName, pin, playerId? }`. */
export function createTeamInput(value: unknown): CreateTeamInput {
  const body = asObject(value);
  return {
    teamName: teamName(body.teamName),
    level: level(body.level),
    memberName: memberName(body.memberName),
    pin: pin(body.pin),
    playerId: playerId(body.playerId),
  };
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
