/**
 * JSON responses, plain-language errors, size-limited request bodies, and the two ways the Worker and the Durable
 * Objects talk: the signed-in caller's identity on forwarded requests, and refusals returned (not thrown) by RPC.
 */

import { base64url, fromBase64url } from './crypto';

/** Largest request body accepted, in bytes (docs/SERVER.md: "request bodies up to 2 MB"). */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** An error whose message is safe and useful to show on a student's screen. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Seconds until trying again makes sense (sent as Retry-After). */
    readonly retryAfter?: number,
    /** More fields for the error body, such as `{ inTeam: true }`. */
    readonly extra?: Record<string, string | number | boolean>,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return jsonText(JSON.stringify(data), status, headers);
}

/** A JSON response from text that is already JSON (records pages are built this way, without re-parsing). */
export function jsonText(text: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(status: number, message: string, retryAfter?: number, extra?: Record<string, string | number | boolean>): Response {
  const response = json({ ...extra, error: message }, status);
  if (retryAfter !== undefined) response.headers.set('Retry-After', String(Math.max(1, Math.ceil(retryAfter))));
  return response;
}

/**
 * Turns anything thrown into a response. Unexpected errors are logged by message and stack only (never the
 * request, which may carry a token or a sign-in code) and reach the student as a generic message.
 */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) return errorResponse(error.status, error.message, error.retryAfter, error.extra);
  console.error('Unexpected error:', error instanceof Error ? (error.stack ?? error.message) : String(error));
  return errorResponse(500, 'Something went wrong on the Rebound server. Please try again.');
}

/* ---------------- refusals across RPC ---------------- */

/**
 * What a Durable Object's RPC method returns instead of throwing an HttpError: exceptions cross RPC as plain
 * errors and lose their status, so expected refusals travel as values and the caller throws them again.
 */
export interface Refusal {
  ok: false;
  status: number;
  error: string;
  retryAfter?: number;
  extra?: Record<string, string | number | boolean>;
}

export type Result<T extends object = object> = ({ ok: true } & T) | Refusal;

/** Runs `work`, turning an HttpError into a Refusal (anything else is a bug and is thrown). */
export async function refusing<T extends object>(work: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await work()) };
  } catch (error) {
    if (error instanceof HttpError) {
      return { ok: false, status: error.status, error: error.message, ...(error.retryAfter !== undefined ? { retryAfter: error.retryAfter } : {}), ...(error.extra ? { extra: error.extra } : {}) };
    }
    throw error;
  }
}

/** The value of an RPC result, or its refusal thrown again as an HttpError. */
export function accepted<R extends { ok: boolean }>(result: R): Exclude<R, { ok: false }> {
  if (!result.ok) {
    const refusal = result as unknown as Refusal;
    throw new HttpError(refusal.status, refusal.error, refusal.retryAfter, refusal.extra);
  }
  return result as Exclude<R, { ok: false }>;
}

/* ---------------- the caller's identity on forwarded requests ---------------- */

/** Who is calling, as the Worker established it from the session token (index.ts `authenticate`). */
export interface Identity {
  userId: string;
  name: string;
  /** Short id of the session (the start of its token's hash), so signing out can close its room connections. */
  sid: string;
  teamId: string | null;
  primarySubject?: string;
  secondarySubject?: string;
  /** The caller's network address (CF-Connecting-IP), for limits; null when there is none, as in tests. */
  address: string | null;
}

/**
 * Forwarded requests carry the caller's identity in this header. Only the Worker builds requests to the Durable
 * Objects (outside requests never reach them directly) and it never copies a client's headers onto them.
 */
const IDENTITY_HEADER = 'X-Rebound-Identity';

export function identityHeader(identity: Identity): Record<string, string> {
  return { [IDENTITY_HEADER]: base64url(new TextEncoder().encode(JSON.stringify(identity))) };
}

export function identityOf(request: Request): Identity {
  const value = request.headers.get(IDENTITY_HEADER);
  if (!value) throw new HttpError(401, 'Please sign in again.');
  return JSON.parse(new TextDecoder().decode(fromBase64url(value))) as Identity;
}

/* ---------------- bodies ---------------- */

const TOO_LARGE = 'That request is too large (the limit is 2 MB).';

/** Reads a request body of at most `maxBytes`, as a stream that is abandoned as soon as it passes the limit. */
export async function readBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<Uint8Array> {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && Number(declared) > maxBytes) throw new HttpError(413, TOO_LARGE);
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, TOO_LARGE);
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Reads a JSON body of at most `maxBytes`. The body is read as a stream and abandoned as soon as it passes the
 * limit, so a huge upload never sits in memory. Returns undefined for an empty body.
 */
export async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const bytes = await readBody(request, maxBytes);
  if (bytes.byteLength === 0) return undefined;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new HttpError(400, 'The request must be UTF-8 text.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "The request isn't valid JSON.");
  }
}

/** The `cursor` query parameter of a records request: a whole number, 0 when absent. */
export function cursorParam(url: URL): number {
  const raw = url.searchParams.get('cursor');
  if (raw === null || raw === '') return 0;
  const cursor = Number(raw);
  if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(cursor)) throw new HttpError(400, 'The cursor must be a whole number, 0 or more.');
  return cursor;
}

/** Routes inside a Durable Object: a path pattern and a handler per method. */
export type Handler = (request: Request, url: URL, params: string[]) => Promise<Response> | Response;
export type Routes = Array<[RegExp, Partial<Record<string, Handler>>]>;

export async function dispatch(routes: Routes, request: Request, path: string): Promise<Response> {
  const url = new URL(request.url);
  for (const [pattern, methods] of routes) {
    const params = pattern.exec(path);
    if (!params) continue;
    const handler = methods[request.method];
    if (!handler) throw new HttpError(405, "That action isn't supported here.");
    return await handler(request, url, params.slice(1));
  }
  throw new HttpError(404, 'Not found.');
}
