/** JSON responses, plain-language errors and size-limited request bodies. */

/** Largest request body accepted, in bytes (docs/SERVER.md: "request bodies up to 2 MB"). */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** An error whose message is safe and useful to show on a student's screen. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Seconds until trying again makes sense (sent as Retry-After). */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return jsonText(JSON.stringify(data), status);
}

/** A JSON response from text that is already JSON (sync builds its large responses this way). */
export function jsonText(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function errorResponse(status: number, message: string, retryAfter?: number): Response {
  const response = json({ error: message }, status);
  if (retryAfter !== undefined) response.headers.set('Retry-After', String(Math.max(1, Math.ceil(retryAfter))));
  return response;
}

/**
 * Turns anything thrown into a response. Unexpected errors are logged by message and stack only (never the
 * request, which may carry a PIN, a secret or a token) and reach the student as a generic message.
 */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) return errorResponse(error.status, error.message, error.retryAfter);
  console.error('Unexpected error:', error instanceof Error ? (error.stack ?? error.message) : String(error));
  return errorResponse(500, 'Something went wrong on the team server. Please try again.');
}

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
