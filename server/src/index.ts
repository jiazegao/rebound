/**
 * The Worker: CORS, routing and team creation. Everything about a team happens in that team's Durable Object
 * (team.ts), addressed by `idFromName(teamId)`; the Worker itself never reads team data.
 */

import { newTeamId, TEAM_ID_PATTERN } from './crypto';
import { errorResponse, HttpError, json, MAX_BODY_BYTES, readBody, readJson, toErrorResponse } from './http';
import { CREATE_PATH, TEAM_NOT_FOUND } from './team';
import { createTeamInput } from './validate';

export { TeamServer } from './team';

const ORIGIN_REFUSED = 'This website is not allowed to use the Rebound team server.';

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

async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;

  if (path === '/api/health') {
    if (request.method !== 'GET') throw new HttpError(405, "That action isn't supported here.");
    return json({ ok: true });
  }

  if (path === '/api/teams') {
    if (request.method !== 'POST') throw new HttpError(405, "That action isn't supported here.");
    return createTeam(request, env);
  }

  const match = /^\/api\/teams\/([^/]+)(?:\/|$)/.exec(path);
  if (match) {
    // Only well-formed ids reach a Durable Object, so random paths never wake one.
    if (!TEAM_ID_PATTERN.test(match[1]!)) throw new HttpError(404, TEAM_NOT_FOUND);
    const team = env.TEAM.get(env.TEAM.idFromName(match[1]!));
    // GET (including the WebSocket upgrade) goes through as is. Other requests are read here first, up to the
    // 2 MB limit, so an oversized upload never reaches the team's object, and the object can answer early
    // (say, 401) without leaving a half-read stream behind.
    if (request.method === 'GET' || request.method === 'HEAD') return team.fetch(request);
    const body = await readBody(request, MAX_BODY_BYTES);
    return team.fetch(new Request(request.url, { method: request.method, headers: request.headers, body }));
  }

  throw new HttpError(404, 'Not found.');
}

/** `POST /api/teams`: a new random team id, and a new Durable Object initialized with the team. */
async function createTeam(request: Request, env: Env): Promise<Response> {
  const input = createTeamInput(await readJson(request));
  // Ids carry 80 random bits, so a clash is practically impossible; the object refuses an id that is already a
  // team (409) and another is drawn.
  for (let attempt = 0; attempt < 3; attempt++) {
    const teamId = newTeamId();
    const stub = env.TEAM.get(env.TEAM.idFromName(teamId));
    const response = await stub.fetch(`https://team.internal${CREATE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, teamId }),
    });
    if (response.status !== 409) return response;
  }
  throw new HttpError(503, "The team couldn't be created right now. Please try again.");
}

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
    out.headers.set('Access-Control-Expose-Headers', 'Retry-After');
  }
  return out;
}
