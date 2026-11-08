/**
 * The account contract between the site and the server (docs/ACCOUNTS.md): which collections a user owns and which
 * their team owns, what teammates may read, who may write team records, how concurrent writes merge, and the
 * shapes the API sends. Shared by both sides, so they cannot disagree.
 */
import type { CoreSubject, Level } from './schema';
import { mergeCard, mergeSeen } from './sync';

/* ---------------- ids and tokens ---------------- */

/** User, team and room ids: 16 lowercase base32 characters. */
export const ID_PATTERN = /^[a-z2-7]{16}$/;
/** Session tokens: "<userId>.<secret>" (the secret is 32 random bytes in base64url). */
export const SESSION_TOKEN_PATTERN = /^[a-z2-7]{16}\.[A-Za-z0-9_-]{43}$/;
/** Join codes: "<teamId>.<secret>". */
export const JOIN_CODE_PATTERN = /^[a-z2-7]{16}\.[a-z2-7]{12}$/;

export const MAX_NAME_CHARS = 40;
export const MAX_TEAM_NAME_CHARS = 80;
/** Records per page in a records response; changes per request. */
export const RECORDS_PAGE_SIZE = 500;
export const MAX_RECORD_BYTES = 900_000;

/* ---------------- people ---------------- */

export type MemberRole = 'coach' | 'captain' | 'member';

export const isLeader = (role: MemberRole | null | undefined): boolean => role === 'coach' || role === 'captain';

export interface UserSettings {
  sound: boolean;
  readingWpm: number;
  answerTimer: boolean;
  dailyMinutes: number;
  /** How far this user's `answers` have been turned into review cards (the last answers revision applied). */
  cardsCursor?: number;
}

export const DEFAULT_SETTINGS: UserSettings = { sound: true, readingWpm: 200, answerTimer: true, dailyMinutes: 30 };

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  /** ms since the epoch. */
  createdAt: number;
  /** When the person confirmed they are 13 or older. */
  over13At: number;
  primarySubject?: CoreSubject;
  secondarySubject?: CoreSubject;
  gradYear?: number;
  settings: UserSettings;
}

export interface NextEvent {
  name: string;
  /** "YYYY-MM-DD" */
  date: string;
  lineupId?: string;
  finals?: boolean;
}

export interface TeamInfo {
  id: string;
  name: string;
  level: Level;
  nextEvent?: NextEvent;
  createdAt: number;
}

export interface TeamMember {
  userId: string;
  name: string;
  role: MemberRole;
  /** Sub-team label, e.g. "A". */
  squad?: string;
  primarySubject?: CoreSubject;
  secondarySubject?: CoreSubject;
  gradYear?: number;
  joinedAt: number;
  lastSeen: number;
}

/* ---------------- API shapes ---------------- */

export interface AuthConfig {
  google: { clientId: string } | null;
  email: boolean;
}

export interface SignedIn {
  token: string;
  user: UserProfile;
}

/** 403 from a sign-in finish when no account exists yet: ask for a name and the 13+ confirmation, then retry. */
export interface NeedsSignup {
  error: string;
  needsSignup: true;
  email: string;
}

export interface MeResponse {
  user: UserProfile;
  team: { id: string; name: string; level: Level; role: MemberRole } | null;
}

export interface TeamResponse {
  team: TeamInfo;
  members: TeamMember[];
  you: { role: MemberRole };
}

export interface RecordOut {
  c: string;
  id: string;
  body: unknown;
  rev: number;
  /** Who wrote this version (a user id), for team records. */
  by?: string;
}

export interface RecordsResponse {
  cursor: number;
  records: RecordOut[];
  more: boolean;
}

/** One change a device sends: the new body, or null to delete. */
export interface Change {
  c: string;
  id: string;
  body: unknown;
}

export interface ChangesResponse {
  /** The highest revision the store now has. */
  cursor: number;
  rejected: Array<{ c: string; id: string; reason: string }>;
}

/* ---------------- collections ---------------- */

/** A user's own collections (stored with the user; travel with them from team to team). */
export const USER_COLLECTIONS = ['attempts', 'answers', 'seen', 'conceptReads', 'completions', 'reports', 'cards', 'plans'] as const;
export type UserCollection = (typeof USER_COLLECTIONS)[number];

/** What teammates may read of a user's collections. Review cards and daily plans stay private. */
export const TEAM_VISIBLE: ReadonlySet<UserCollection> = new Set(['attempts', 'answers', 'seen', 'conceptReads', 'completions', 'reports']);

/** Written only by the server (a game's or a match's answers), never by the user's devices. */
export const SERVER_WRITTEN: ReadonlySet<UserCollection> = new Set(['answers']);

/** Single-record collections and their one record id. */
export const LEDGER_ID = 'ledger';
export const PLAN_ID = 'today';

/** The team's collections. */
export const TEAM_COLLECTIONS = ['lineups', 'assignments', 'packets', 'visuals', 'written', 'conceptCards', 'games'] as const;
export type TeamCollection = (typeof TEAM_COLLECTIONS)[number];

/** Only coaches and captains change these. */
export const LEADER_ONLY: ReadonlySet<TeamCollection> = new Set(['lineups', 'assignments']);

export const isUserCollection = (c: string): c is UserCollection => (USER_COLLECTIONS as readonly string[]).includes(c);
export const isTeamCollection = (c: string): c is TeamCollection => (TEAM_COLLECTIONS as readonly string[]).includes(c);

/** Whether a member with `role` may write a record in team collection `c`. */
export function canWriteTeam(role: MemberRole, c: TeamCollection): boolean {
  return !LEADER_ONLY.has(c) || isLeader(role);
}

/**
 * The record to store when `incoming` arrives for a user record whose stored version is `stored` (one user's
 * devices can write at the same time). Ledgers merge as unions, review cards merge their histories, and answers
 * never change once written; everything else is last-writer-wins.
 */
export function mergeUserRecord(c: UserCollection, stored: unknown, incoming: unknown): unknown {
  if (incoming === null) return null;
  if (stored === null || stored === undefined) return incoming;
  switch (c) {
    case 'seen':
    case 'conceptReads':
      return mergeSeen(stored, incoming);
    case 'cards':
      return mergeCard(stored, incoming);
    case 'attempts':
    case 'answers':
      return stored;
    default:
      return incoming;
  }
}
