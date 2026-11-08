import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { BASE, call, SITE, signUp } from './helpers';

describe('health', () => {
  it('answers anyone', async () => {
    const res = await call('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('CORS', () => {
  it('adds CORS headers for each allowed origin only', async () => {
    for (const origin of ['https://jiazegao.github.io', 'http://localhost:5173', 'http://localhost:4173']) {
      const res = await call('/api/health', { headers: { Origin: origin } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(res.headers.get('Vary')).toMatch(/Origin/);
    }
    const none = await call('/api/health');
    expect(none.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('refuses other origins, without CORS headers', async () => {
    for (const origin of ['https://evil.example', 'https://jiazegao.github.io.evil.example', 'null']) {
      const res = await call('/api/health', { headers: { Origin: origin } });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not allowed/);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    // Including writes: another site's page cannot start a sign-in or make a team.
    const signIn = await call('/api/auth/email/start', { headers: { Origin: 'https://evil.example' }, body: { email: 'a@example.org' } });
    expect(signIn.status).toBe(403);
    const user = await signUp('Cora');
    const create = await call('/api/teams', { token: user.token, headers: { Origin: 'https://evil.example' }, body: { name: 'T', level: 'HS' } });
    expect(create.status).toBe(403);
  });

  it('answers preflight requests', async () => {
    const preflight = (origin: string) =>
      exports.default.fetch(`${BASE}/api/me/records`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
      });
    const ok = await preflight(SITE);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
    expect(ok.headers.get('Access-Control-Allow-Methods')).toMatch(/POST/);
    expect(ok.headers.get('Access-Control-Allow-Methods')).toMatch(/PATCH/);
    expect(ok.headers.get('Access-Control-Allow-Methods')).toMatch(/DELETE/);
    expect(ok.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toMatch(/authorization/);
    expect(ok.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toMatch(/content-type/);
    expect(Number(ok.headers.get('Access-Control-Max-Age'))).toBeGreaterThan(0);

    const other = await preflight('https://evil.example');
    expect(other.status).toBe(204);
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(other.headers.get('Access-Control-Allow-Methods')).toBeNull();
  });

  it('puts CORS headers on errors too, so the site can read the message', async () => {
    const res = await call('/api/me', { headers: { Origin: SITE } });
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
    expect(res.headers.get('Access-Control-Expose-Headers')).toMatch(/Retry-After/);
    expect(res.body.error).toBe('Please sign in again.');
    const missing = await call('/api/nothing-here', { headers: { Origin: SITE } });
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
  });
});

describe('request limits and routing', () => {
  it('refuses bodies over 2 MB, declared or streamed', async () => {
    const user = await signUp('Max');
    const big = JSON.stringify({ changes: [{ c: 'attempts', id: 'a', body: { x: 'y'.repeat(2 * 1024 * 1024) } }] });
    const declared = await call('/api/me/records', { token: user.token, body: JSON.parse(big) });
    expect(declared.status).toBe(413);
    expect(declared.body.error).toMatch(/too large/);

    // No Content-Length: the body is cut off while streaming.
    const chunk = new TextEncoder().encode('x'.repeat(256 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 12) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const streamed = await exports.default.fetch(`${BASE}/api/me/records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
      body: stream,
    });
    expect(streamed.status).toBe(413);
    const signIn = await exports.default.fetch(`${BASE}/api/auth/google`, { method: 'POST', body: big });
    expect(signIn.status).toBe(413);

    // Just under the limit is fine (and the oversized record inside is refused on its own).
    const nearly = JSON.stringify({ changes: [{ c: 'attempts', id: 'a', body: { x: 'y'.repeat(1_900_000) } }] });
    const ok = await call('/api/me/records', { token: user.token, body: JSON.parse(nearly) });
    expect(ok.status).toBe(200);
    expect(ok.body.rejected[0].reason).toMatch(/too large/);
  });

  it('refuses bodies that are not JSON objects', async () => {
    const raw = (body: string) => exports.default.fetch(`${BASE}/api/auth/email/start`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
    expect((await raw('{not json')).status).toBe(400);
    expect((await raw('"a string"')).status).toBe(400);
    expect((await raw('')).status).toBe(400);
    expect(((await (await raw('{not json')).json()) as { error: string }).error).toMatch(/isn't valid JSON/);
  });

  it('answers unknown paths and methods plainly', async () => {
    const user = await signUp('Ned');
    expect((await call('/')).status).toBe(404);
    expect((await call('/api/teams')).status).toBe(405);
    expect((await call('/api/health', { method: 'POST', body: {} })).status).toBe(405);
    expect((await call('/api/auth/google')).status).toBe(405);
    expect((await call('/api/me/nothing', { token: user.token })).status).toBe(404);
    expect((await call('/api/teams/not-a-team/records', { token: user.token })).status).toBe(404);
    const wrongMethod = await call('/api/me/export', { method: 'DELETE', token: user.token });
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.body.error).toMatch(/isn't supported/);
  });
});
