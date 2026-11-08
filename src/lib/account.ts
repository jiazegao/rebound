/**
 * Signing in and out, and the account and team actions that go straight to the server (docs/ACCOUNTS.md): Google
 * or a one-time email link (a new account needs a name and the 13+ confirmation), the profile, downloading or
 * deleting the account, and creating, joining, leaving and running a team. Practice itself goes through the store
 * and cloud.ts.
 */
import type { AuthConfig, MemberRole, SignedIn } from '../core/accounts';
import type { CoreSubject, Level } from '../core/schema';
import * as api from './api';
import { beginSession, endSession, flushNow, getSession, reloadAccount, takeTeamResponse, takeUserProfile } from './cloud';
import { downloadFile } from './format';

/* ---------------- signing in ---------------- */

export type SignInResult = { ok: true } | { needsSignup: true; email: string };

/** What a new account needs: a name (1–40 characters) and the person's confirmation that they are 13 or older. */
export interface Signup {
  name: string;
  over13: true;
}

let configCache: { server: string; promise: Promise<AuthConfig> } | null = null;

/** Which sign-in methods the server has turned on (asked once per server address). */
export function loadAuthConfig(): Promise<AuthConfig> {
  const server = api.serverUrl();
  if (!configCache || configCache.server !== server) {
    const promise = api.getAuthConfig().catch((err: unknown) => {
      configCache = null;
      throw err;
    });
    configCache = { server, promise };
  }
  return configCache.promise;
}

async function signedIn(call: Promise<SignedIn>): Promise<SignInResult> {
  try {
    const res = await call;
    await beginSession(res.token);
    return { ok: true };
  } catch (err) {
    const signup = api.needsSignup(err);
    if (signup) return { needsSignup: true, email: signup.email };
    throw err;
  }
}

const signupFields = (signup?: Signup) => (signup ? { name: signup.name.trim(), over13: true } : {});

/** Sign in with the ID token Google's button gave (it stays valid for the sign-up retry). */
export function signInWithGoogle(credential: string, signup?: Signup): Promise<SignInResult> {
  return signedIn(api.signInWithGoogleCredential(credential, signupFields(signup)));
}

/** Email a sign-in link. A development server sends nothing and returns `devCode` instead. */
export async function startEmailSignIn(email: string): Promise<{ devCode?: string }> {
  const res = await api.startEmailSignIn(email.trim());
  return res.devCode ? { devCode: res.devCode } : {};
}

// A code works once, and React runs effects twice in development: the same request is shared, not repeated.
const finishing = new Map<string, Promise<SignInResult>>();

/** Sign in with the code from an emailed link. */
export function finishEmailSignIn(code: string, signup?: Signup): Promise<SignInResult> {
  const key = `${code}|${signup ? 'signup' : ''}`;
  let p = finishing.get(key);
  if (!p) {
    p = signedIn(api.finishEmailSignIn(code, signupFields(signup)));
    finishing.set(key, p);
    p.catch(() => finishing.delete(key));
  }
  return p;
}

/** Sign out on this device: the last changes go first if they can, then the session ends on the server. */
export async function signOut(): Promise<void> {
  await flushNow().catch(() => false);
  try {
    await api.signOutSession();
  } catch {
    /* already signed out, or no connection: the token is forgotten here either way */
  }
  api.setSessionToken(null);
  endSession(null);
}

/* ---------------- the account ---------------- */

export interface ProfileFields {
  name?: string;
  primarySubject?: CoreSubject | null;
  secondarySubject?: CoreSubject | null;
  gradYear?: number | null;
}

/** Change the player's name, subjects or graduation year (the server copies them to the team). */
export async function updateProfile(fields: ProfileFields): Promise<void> {
  const res = await api.updateMe(fields);
  takeUserProfile(res.user);
}

/** Download everything the account holds, as one JSON file. */
export async function downloadMyData(): Promise<void> {
  const data = await api.exportMe();
  downloadFile(`rebound-account-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(data, null, 2)}\n`);
}

/** Delete the account and everything in it (the player leaves their team first). */
export async function deleteAccount(): Promise<void> {
  await api.deleteMe();
  api.setSessionToken(null);
  endSession('Your account and everything in it were deleted.');
}

/* ---------------- teams ---------------- */

function currentTeamId(): string {
  const id = getSession().team?.team.id;
  if (!id) throw new api.ApiError('You are not on a team.', 0);
  return id;
}

/** Start a team; the player becomes its captain. `leaveCurrent` leaves the team they are on (history goes with them). */
export async function createTeam(name: string, level: Level, leaveCurrent = false): Promise<void> {
  await flushNow().catch(() => false);
  await api.createTeamOnServer({ name: name.trim(), level, ...(leaveCurrent ? { leaveCurrent: true } : {}) });
  await reloadAccount();
}

/** Join with an invite code or link. `leaveCurrent` leaves the team the player is on. */
export async function joinTeam(code: string, leaveCurrent = false): Promise<void> {
  const parsed = api.parseJoinCode(code);
  if (!parsed) throw new api.ApiError('That invite link does not look right. Ask your captain to send it again.', 0);
  await flushNow().catch(() => false);
  await api.joinTeamOnServer(parsed.teamId, { secret: parsed.secret, ...(leaveCurrent ? { leaveCurrent: true } : {}) });
  await reloadAccount();
}

/** Leave the team. The player's practice history stays in their account and goes with them. */
export async function leaveTeam(): Promise<void> {
  await flushNow().catch(() => false);
  await api.leaveTeamOnServer(currentTeamId());
  await reloadAccount();
}

/** Coaches and captains: delete the team and everything it stores (members keep their own practice). */
export async function deleteTeam(): Promise<void> {
  await api.deleteTeamOnServer(currentTeamId());
  await reloadAccount();
}

/** Coaches and captains: a new invite link (the old one stops working). */
export async function newInviteLink(): Promise<string> {
  const { joinCode } = await api.newTeamJoinCode(currentTeamId());
  const team = getSession().team;
  if (team) takeTeamResponse({ ...team, joinCode });
  return joinCode;
}

export interface MemberChange {
  role?: MemberRole;
  squad?: string | null;
  primarySubject?: CoreSubject | null;
  secondarySubject?: CoreSubject | null;
  gradYear?: number | null;
}

/** Coaches and captains: change a teammate's role, sub-team or subjects. (Players change their own on Account.) */
export async function updateMember(userId: string, fields: MemberChange): Promise<void> {
  const teamId = currentTeamId();
  await api.updateTeamMember(teamId, userId, fields);
  takeTeamResponse(await api.getTeam(teamId));
}

/** Coaches and captains: take someone off the team (their practice stays in their account). */
export async function removeMember(userId: string): Promise<void> {
  const teamId = currentTeamId();
  await api.removeTeamMember(teamId, userId);
  takeTeamResponse(await api.getTeam(teamId));
}
