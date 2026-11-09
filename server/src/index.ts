/**
 * The Worker: CORS, routing, signing in, and checking sessions. It holds no data. A request's session is checked
 * with the user's own Durable Object (user.ts), then the request goes on, with the caller's identity, to the object
 * that owns what it is about: the user, a team (team.ts) or a room (room.ts). Sign-in runs here: Google ID tokens
 * and email links (auth.ts), with the Directory (directory.ts) mapping them to users.
 */

import { ID_PATTERN, MAX_NAME_CHARS, SESSION_TOKEN_PATTERN } from '../../src/core/accounts';
import { emailEnabled, emailSettings, sendSignInEmail, verifyGoogleToken } from './auth';
import { newId, SECRET_PATTERN, sha256Hex } from './crypto';
import type { Resolution } from './directory';
import {
  accepted,
  errorResponse,
  HttpError,
  identityHeader,
  json,
  MAX_BODY_BYTES,
  readBody,
  readJson,
  toErrorResponse,
  type Identity,
} from './http';
import { parseMatchSetup } from './match';
import { directoryObject, roomObject, teamObject, userObject, voiceObject } from './objects';
import { closedSocket } from './room';
import { audioKey, practiceQuestion, spokenFor, ttsSettings } from './tts';
import { TEAM_NOT_FOUND } from './team';
import { asObject, cleanLine, emailAddress, NAME_RULE, roomName } from './validate';

export { Directory } from './directory';
export { Registry } from './registry';
export { RoomServer } from './room';
export { Team } from './team';
export { UserServer } from './user';
export { VoiceCache } from './voice';

const ORIGIN_REFUSED = 'This website is not allowed to use the Rebound server.';
const SIGN_IN_AGAIN = 'Please sign in again.';
/** Sign-in bodies are small: a Google credential is a couple of kilobytes. */
const AUTH_BODY_BYTES = 16 * 1024;

/** Routes of the caller's own UserServer. */
const USER_PATHS = /^\/api\/(?:me(?:\/records|\/export)?|ai(?:\/(?:draft|explain|card))?|auth\/signout)$/;

export default {
  async fetch(request, env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowed = origin !== null && allowedOrigins(env).has(origin) ? origin : null;
    if (request.method === 'OPTIONS') return preflight(allowed);

    let response: Response;
    if (origin !== null && allowed === null) {
      // Browsers send Origin on cross-site requests and WebSocket upgrades. Refusing other sites outright (not
      // only withholding CORS headers) means their pages cannot even trigger side effects here.
      response = errorResponse(403, ORIGIN_REFUSED);
    } else {
      try {
        response = await route(request, env);
      } catch (error) {
        response = toErrorResponse(error);
      }
    }
    // A WebSocket upgrade passes through untouched.
    if (response.status === 101) return response;
    return withCors(response, allowed);
  },
} satisfies ExportedHandler<Env>;

const unsupported = () => new HttpError(405, "That action isn't supported here.");

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  switch (path) {
    case '/api/health':
      if (method !== 'GET') throw unsupported();
      return json({ ok: true });
    case '/api/auth/config':
      if (method !== 'GET') throw unsupported();
      return authConfig(env);
    case '/api/auth/google':
      if (method !== 'POST') throw unsupported();
      return googleSignIn(request, env);
    case '/api/auth/email/start':
      if (method !== 'POST') throw unsupported();
      return emailStart(request, env);
    case '/api/auth/email/finish':
      if (method !== 'POST') throw unsupported();
      return emailFinish(request, env);
    case '/api/rooms':
      if (method === 'GET') return listRooms(request, env, url);
      if (method === 'POST') return createRoom(request, env, url);
      throw unsupported();
    case '/api/teams':
      // Making a team starts with the user, who can be on one team at a time.
      if (method !== 'POST') throw unsupported();
      return forward(env, request, url, (id) => userObject(env, id.userId));
    case '/api/speech':
      if (method === 'GET') return speechStatus(request, env, url);
      if (method === 'POST') return recordForPractice(request, env, url);
      throw unsupported();
  }

  if (USER_PATHS.test(path)) return forward(env, request, url, (id) => userObject(env, id.userId));

  // A recording of Rebound's voice (signed-in players only; recordings are made for matches and solo practice).
  const speech = /^\/api\/speech\/([0-9a-f]{40})$/.exec(path);
  if (speech) {
    if (method !== 'GET') throw unsupported();
    await authenticate(request, env, url);
    const audio = await voiceObject(env, speech[1]!).read(speech[1]!);
    if (!audio) throw new HttpError(404, "That recording isn't here.");
    return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=31536000, immutable' } });
  }

  const room = /^\/api\/rooms\/([^/]+)(\/ws)?$/.exec(path);
  if (room) {
    if (room[2]) return connectRoom(request, env, url, room[1]!);
    if (method !== 'DELETE') throw unsupported();
    return cancelRoom(request, env, url, room[1]!);
  }

  const team = /^\/api\/teams\/([^/]+)(\/.*)?$/.exec(path);
  if (team) {
    // Only well-formed ids reach a Durable Object, so random paths never wake one.
    const teamId = team[1]!;
    if (!ID_PATTERN.test(teamId)) throw new HttpError(404, TEAM_NOT_FOUND);
    // Joining and leaving start with the user (one team at a time); everything else is the team's.
    const mine = team[2] === '/join' || team[2] === '/leave';
    return forward(env, request, url, (id) => (mine ? userObject(env, id.userId) : teamObject(env, teamId)));
  }

  throw new HttpError(404, 'Not found.');
}

/* ---------------- sessions ---------------- */

/**
 * The signed-in caller: `Authorization: Bearer <userId>.<secret>`, or for the room WebSocket only `?token=`
 * (browsers cannot set headers on WebSockets). The user's object checks the secret's hash; `visitRoom` records the
 * room being joined, so signing out can close that connection.
 */
async function authenticate(request: Request, env: Env, url: URL, visitRoom: string | null = null): Promise<Identity> {
  const header = request.headers.get('Authorization');
  const token = header !== null ? (/^Bearer\s+(\S+)$/i.exec(header.trim())?.[1] ?? null) : visitRoom !== null ? url.searchParams.get('token') : null;
  if (!token || !SESSION_TOKEN_PATTERN.test(token)) throw new HttpError(401, SIGN_IN_AGAIN);
  const [userId, secret] = token.split('.') as [string, string];
  const result = await userObject(env, userId).authenticate(await sha256Hex(secret), Date.now(), visitRoom);
  if (!result.ok) throw new HttpError(401, result.error);
  return { ...result.identity, address: request.headers.get('CF-Connecting-IP') };
}

/**
 * Sends a signed-in request on to the object `to` picks. GET goes through without a body. Other bodies are read
 * here first, up to the 2 MB limit, so an oversized upload never reaches an object. Only the identity header and
 * the body are passed on: a client's own headers never reach the objects.
 */
async function forward(env: Env, request: Request, url: URL, to: (identity: Identity) => { fetch(request: Request): Promise<Response> }): Promise<Response> {
  const identity = await authenticate(request, env, url);
  const init: RequestInit = { method: request.method, headers: identityHeader(identity) };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await readBody(request, MAX_BODY_BYTES);
  return to(identity).fetch(new Request(`https://rebound.internal${url.pathname}${url.search}`, init));
}

/* ---------------- signing in ---------------- */

function authConfig(env: Env): Response {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  return json({ google: clientId ? { clientId } : null, email: emailEnabled(emailSettings(env)) });
}

/** What a sign-in call says for a new account: a name, if the person confirmed they are 13 or older. */
function signupOf(body: Record<string, unknown>): { name: string | null; problem: string } {
  if (body.over13 !== true) return { name: null, problem: 'To make your account, confirm you are 13 or older and enter your name.' };
  const name = cleanLine(body.name, MAX_NAME_CHARS);
  return name === null ? { name: null, problem: NAME_RULE } : { name, problem: '' };
}

/** `POST /api/auth/google { credential, over13?, name? }` → `{ token, user }`. */
async function googleSignIn(request: Request, env: Env): Promise<Response> {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new HttpError(404, "Google sign-in isn't turned on for this server.");
  const body = asObject(await readJson(request, AUTH_BODY_BYTES));
  const credential = typeof body.credential === 'string' && body.credential.length <= 8192 ? body.credential.trim() : '';
  if (!credential) throw new HttpError(400, 'Sign in with Google again.');
  const now = Date.now();
  const account = await verifyGoogleToken(credential, clientId, now);
  const signup = signupOf(body);
  const address = request.headers.get('CF-Connecting-IP');
  const resolution = accepted(await directoryObject(env).resolveGoogle(account.sub, account.email, signup.name, address, now));
  return finishSignIn(env, resolution, signup, now, null);
}

/** `POST /api/auth/email/start { email }` → `{ ok: true }` (and `devCode` with the development outbox). */
async function emailStart(request: Request, env: Env): Promise<Response> {
  const settings = emailSettings(env);
  if (!emailEnabled(settings)) throw new HttpError(404, "Email sign-in isn't turned on for this server.");
  const email = emailAddress(asObject(await readJson(request, AUTH_BODY_BYTES)).email);
  // The same answer whether or not the address has an account, so this never tells anyone who uses Rebound.
  const started = accepted(await directoryObject(env).startEmail(email, request.headers.get('CF-Connecting-IP'), Date.now(), settings.dailyLimit));
  // Development only: nothing is sent; the code comes back so tests and local runs can sign in.
  if (settings.devOutbox) return json({ ok: true, devCode: started.code });
  try {
    await sendSignInEmail(settings, email, started.code);
  } catch (error) {
    await directoryObject(env).cancelEmail(started.codeHash);
    throw error;
  }
  return json({ ok: true });
}

/** `POST /api/auth/email/finish { code, over13?, name? }` → `{ token, user }`. */
async function emailFinish(request: Request, env: Env): Promise<Response> {
  if (!emailEnabled(emailSettings(env))) throw new HttpError(404, "Email sign-in isn't turned on for this server.");
  const body = asObject(await readJson(request, AUTH_BODY_BYTES));
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!SECRET_PATTERN.test(code)) throw new HttpError(400, "This sign-in link isn't complete. Open the link from your email again.");
  const codeHash = await sha256Hex(code);
  const signup = signupOf(body);
  const now = Date.now();
  const resolution = accepted(await directoryObject(env).finishEmail(codeHash, signup.name, request.headers.get('CF-Connecting-IP'), now));
  return finishSignIn(env, resolution, signup, now, codeHash);
}

/**
 * A session for the person the Directory found, or 403 `{ error, needsSignup: true, email }` when there is no
 * account yet and the call did not carry the 13+ confirmation and a name (the site asks, then calls again).
 */
async function finishSignIn(
  env: Env,
  resolution: Extract<Resolution, { ok: true }>,
  signup: { name: string | null; problem: string },
  now: number,
  codeHash: string | null,
): Promise<Response> {
  const needsSignup = () => new HttpError(403, signup.problem, undefined, { needsSignup: true, email: resolution.email });
  if (resolution.userId === null) throw needsSignup();
  const result = await userObject(env, resolution.userId).signIn(
    { userId: resolution.userId, email: resolution.email, signup: signup.name !== null ? { name: signup.name } : null },
    now,
  );
  if (!result.ok) {
    // The account's record exists but its data was never made (an earlier sign-up failed half way): the person
    // signs up again, with the same email code.
    if (codeHash !== null && resolution.expiresAt !== undefined) await directoryObject(env).restoreCode(codeHash, resolution.email, resolution.expiresAt);
    throw needsSignup();
  }
  return json({ token: result.token, user: result.user });
}

/* ---------------- Rebound's voice for solo practice ---------------- */

/** Solo practice read aloud may use this share of the month's characters, so matches always have some left. */
const PRACTICE_SHARE = 0.8;

/** `GET /api/speech`: whether Rebound's voice is set up. */
async function speechStatus(request: Request, env: Env, url: URL): Promise<Response> {
  await authenticate(request, env, url);
  return json({ enabled: ttsSettings(env) !== null });
}

/**
 * `POST /api/speech { stem, choices? }`: a question's recording for solo practice read aloud, made now unless it is
 * kept. `key` is null when it cannot be made (this month's share of characters is used, the player has asked for
 * RECORDINGS_PER_DAY new ones today, or Google failed): the player's device reads that question itself.
 */
async function recordForPractice(request: Request, env: Env, url: URL): Promise<Response> {
  const identity = await authenticate(request, env, url);
  const settings = ttsSettings(env);
  if (!settings) return json({ enabled: false });
  const spoken = spokenFor(practiceQuestion(await readJson(request, 16 * 1024)));
  if (!spoken.trim()) throw new HttpError(400, 'That question has nothing to read aloud.');
  const key = await audioKey(settings.voice, spoken);
  const voice = voiceObject(env, key);
  const kept = await voice.lookup(key);
  if (kept !== null) return json({ enabled: true, key, ms: kept });
  if (!(await userObject(env, identity.userId).reserveRecording(Date.now()))) return json({ enabled: true, key: null, ms: null });
  const ms = await voice.ensure(key, spoken, PRACTICE_SHARE);
  return json({ enabled: true, key: ms === null ? null : key, ms });
}

/* ---------------- rooms ---------------- */

/** `GET /api/rooms`: the open rooms opened by members of the caller's team (query parameters are ignored). */
async function listRooms(request: Request, env: Env, url: URL): Promise<Response> {
  const identity = await authenticate(request, env, url);
  if (identity.teamId === null) return json({ rooms: [] });
  const listed = await teamObject(env, identity.teamId).listRooms(identity.userId, Date.now());
  // No longer on that team (or it was deleted): no team rooms.
  return json({ rooms: listed.ok ? listed.rooms : [] });
}

/** `POST /api/rooms { name, match? }`: any signed-in user opens a room; it is listed for their team, if any. */
async function createRoom(request: Request, env: Env, url: URL): Promise<Response> {
  const identity = await authenticate(request, env, url);
  const body = asObject(await readJson(request));
  const name = roomName(body.name);
  const setup = body.match === undefined || body.match === null ? null : parseMatchSetup(body.match);
  const now = Date.now();
  accepted(await userObject(env, identity.userId).reserveRoom(now));
  // Ids carry 80 random bits, so a clash is practically impossible; a taken id is refused and another drawn.
  for (let attempt = 0; attempt < 3; attempt++) {
    const roomId = newId();
    let listed = false;
    if (identity.teamId !== null) {
      const registered = await teamObject(env, identity.teamId).registerRoom(identity.userId, roomId, now);
      if (registered.ok) listed = true;
      else if (registered.status === 429) accepted(registered);
      // Any other refusal: the user has left that team, so the room is simply not listed.
    }
    const host = { userId: identity.userId, name: identity.name, teamId: identity.teamId };
    if (await roomObject(env, roomId).create({ roomId, name, host, setup, now })) return json({ roomId }, 201);
    if (listed) await teamObject(env, identity.teamId!).unregisterRoom(roomId);
  }
  throw new HttpError(503, "The room couldn't be opened right now. Please try again.");
}

/** `DELETE /api/rooms/:id`: the host cancels a match that has not started; one already closed counts as cancelled. */
async function cancelRoom(request: Request, env: Env, url: URL, roomId: string): Promise<Response> {
  const identity = await authenticate(request, env, url);
  if (!ID_PATTERN.test(roomId)) throw new HttpError(404, 'Not found.');
  accepted(await roomObject(env, roomId).cancel(identity.userId, Date.now()));
  return json({ ok: true });
}

/** `GET /api/rooms/:id/ws?token=`: the WebSocket, accepted by the room once the session checks out. */
async function connectRoom(request: Request, env: Env, url: URL, roomId: string): Promise<Response> {
  if (request.method !== 'GET') throw unsupported();
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'This address is for live room connections (WebSocket).');
  if (!ID_PATTERN.test(roomId)) return closedSocket();
  const identity = await authenticate(request, env, url, roomId);
  return roomObject(env, roomId).fetch(new Request('https://rebound.internal/connect', { headers: { Upgrade: 'websocket', ...identityHeader(identity) } }));
}

/* ---------------- CORS ---------------- */

function allowedOrigins(env: Env): Set<string> {
  return new Set(
    (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  );
}

function preflight(origin: string | null): Response {
  const headers = new Headers({ Vary: 'Origin' });
  if (origin !== null) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return new Response(null, { status: 204, headers });
}

function withCors(response: Response, origin: string | null): Response {
  const out = new Response(response.body, response);
  out.headers.set('Vary', 'Origin');
  if (origin !== null) {
    out.headers.set('Access-Control-Allow-Origin', origin);
    out.headers.set('Access-Control-Expose-Headers', 'Retry-After, Content-Disposition');
  }
  return out;
}
