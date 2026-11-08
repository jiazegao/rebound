/** Signing in: Google ID tokens (checked against a test key), email links through the development outbox, limits, sessions. */
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ID_PATTERN, SESSION_TOKEN_PATTERN } from '../../src/core/accounts';
import { GOOGLE_CERTS_URL, RESEND_URL, setAuthTestOverrides } from '../src/auth';
import { sha256Hex } from '../src/crypto';
import { EMAILS_PER_ADDRESS, EMAILS_PER_NETWORK, NEW_ACCOUNTS_PER_NETWORK } from '../src/directory';
import { call, CLIENT_ID, googleToken, newGoogleAccount, signUp, testKeys, useAuthOverrides, type Json } from './helpers';

const directory = () => env.DIRECTORY.get(env.DIRECTORY.idFromName('global'));
const userStub = (id: string) => env.USER.get(env.USER.idFromName(id));

beforeEach(() => useAuthOverrides());
afterEach(() => useAuthOverrides());

const google = (body: Record<string, unknown>, headers?: Record<string, string>) => call('/api/auth/google', { body, headers });
const start = (email: string, headers?: Record<string, string>) => call('/api/auth/email/start', { body: { email }, headers });
const finish = (body: Record<string, unknown>, headers?: Record<string, string>) => call('/api/auth/email/finish', { body, headers });

/** A fresh email address for the outbox tests. */
const freshEmail = () => newGoogleAccount('mail').email;

describe('sign-in settings', () => {
  it('tells the site which ways to sign in are on', async () => {
    expect((await call('/api/auth/config')).body).toEqual({ google: { clientId: CLIENT_ID }, email: true });
    // Without a Resend key and sender (and no development outbox), email sign-in is off.
    await useAuthOverrides({ email: { devOutbox: false, apiKey: null, from: null } });
    expect((await call('/api/auth/config')).body).toEqual({ google: { clientId: CLIENT_ID }, email: false });
    const refused = await start('kay@example.org');
    expect(refused.status).toBe(404);
    expect(refused.body.error).toBe("Email sign-in isn't turned on for this server.");
  });
});

describe('Google sign-in', () => {
  it('makes an account only with the 13+ confirmation and a name', async () => {
    const account = newGoogleAccount('Cora');
    const credential = await googleToken({ ...account, email: account.email.toUpperCase() });

    const first = await google({ credential });
    expect(first.status).toBe(403);
    expect(first.body).toEqual({ error: 'To make your account, confirm you are 13 or older and enter your name.', needsSignup: true, email: account.email });
    const badName = await google({ credential, over13: true, name: '   ' });
    expect(badName.status).toBe(403);
    expect(badName.body).toMatchObject({ needsSignup: true, error: 'Enter a name of 1 to 40 characters.' });
    expect((await google({ credential, over13: false, name: 'Cora' })).body.needsSignup).toBe(true);

    const made = await google({ credential, over13: true, name: '  Cora   Captain ' });
    expect(made.status).toBe(200);
    expect(made.body.token).toMatch(SESSION_TOKEN_PATTERN);
    expect(made.body.user).toEqual({
      id: expect.stringMatching(ID_PATTERN),
      email: account.email,
      name: 'Cora Captain',
      createdAt: expect.any(Number),
      over13At: expect.any(Number),
      settings: { sound: true, readingWpm: 200, answerTimer: true, dailyMinutes: 30 },
    });
    expect(made.body.token.startsWith(`${made.body.user.id}.`)).toBe(true);

    // Signing in again needs nothing more, and gives another session; a name sent along changes nothing.
    const again = await google({ credential: await googleToken(account), over13: true, name: 'Someone Else' });
    expect(again.status).toBe(200);
    expect(again.body.user).toEqual(made.body.user);
    expect(again.body.token).not.toBe(made.body.token);
    for (const token of [made.body.token, again.body.token]) expect((await call('/api/me', { token })).status).toBe(200);
  });

  it('finds an account made with an email link by its address, then by its Google account', async () => {
    const email = freshEmail();
    const code = (await start(email)).body.devCode;
    const viaEmail = await finish({ code, over13: true, name: 'Dee' });
    expect(viaEmail.status).toBe(200);
    const viaGoogle = await google({ credential: await googleToken({ sub: 'sub-dee', email }) });
    expect(viaGoogle.body.user.id).toBe(viaEmail.body.user.id);
    // Linked now: the Google account finds it even after its email address changes.
    const renamed = await google({ credential: await googleToken({ sub: 'sub-dee', email: freshEmail() }) });
    expect(renamed.body.user.id).toBe(viaEmail.body.user.id);
  });

  it('refuses tokens that are not from Google for this site, or not current', async () => {
    const account = newGoogleAccount('Eve');
    const ok = await googleToken(account);
    await google({ credential: ok, over13: true, name: 'Eve' });
    const now = Math.floor(Date.now() / 1000);
    const other = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const refusals: Array<[string, string]> = [
      [await googleToken({ ...account, aud: 'someone-else.apps.googleusercontent.com' }), "Google sign-in didn't work. Please try again."],
      [await googleToken({ ...account, iss: 'https://evil.example' }), "Google sign-in didn't work. Please try again."],
      [await googleToken({ ...account, exp: now - 120 }), 'Your Google sign-in expired. Please try again.'],
      [await googleToken({ ...account, iat: now + 600 }), "Google sign-in didn't work. Please try again."],
      [await googleToken(account, { key: other.privateKey }), "Google sign-in didn't work. Please try again."],
      [await googleToken(account, { kid: 'unknown-key' }), "Google sign-in didn't work. Please try again."],
      [await googleToken(account, { header: { alg: 'HS256' } }), "Google sign-in didn't work. Please try again."],
      [`${ok.split('.')[0]}.${ok.split('.')[1]}.`, "Google sign-in didn't work. Please try again."],
      ['not-a-token', "Google sign-in didn't work. Please try again."],
    ];
    for (const [credential, error] of refusals) {
      const res = await google({ credential });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe(error);
    }
    const unverified = await google({ credential: await googleToken({ ...account, email_verified: false }) });
    expect(unverified.status).toBe(403);
    expect(unverified.body.error).toMatch(/isn't verified/);
    expect((await google({})).status).toBe(400);
    // A token that expired a few seconds ago still counts (clocks differ a little).
    expect((await google({ credential: await googleToken({ ...account, exp: now - 20 }) })).status).toBe(200);
  });

  it("loads Google's keys once, for as long as Google says to keep them", async () => {
    const { jwk } = await testKeys();
    const fetched: string[] = [];
    setAuthTestOverrides({
      googleFetch: (async (input: RequestInfo | URL) => {
        fetched.push(String(input instanceof Request ? input.url : input));
        return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600, must-revalidate' } });
      }) as typeof fetch,
    });
    const account = newGoogleAccount('Kai');
    expect((await google({ credential: await googleToken(account), over13: true, name: 'Kai' })).status).toBe(200);
    expect((await google({ credential: await googleToken(account) })).status).toBe(200);
    expect(fetched).toEqual([GOOGLE_CERTS_URL]);
    // An unknown key id fetches again only if the keys are more than a minute old.
    expect((await google({ credential: await googleToken(account, { kid: 'rotated' }) })).status).toBe(401);
    expect(fetched).toHaveLength(1);

    setAuthTestOverrides({ googleFetch: (async () => new Response('down', { status: 500 })) as typeof fetch });
    const down = await google({ credential: await googleToken(account) });
    expect(down.status).toBe(503);
    expect(down.body.error).toMatch(/isn't available right now/);
  });
});

describe('email sign-in', () => {
  it('makes an account from a one-time code, after the 13+ confirmation and a name', async () => {
    const email = freshEmail();
    const started = await start(`  ${email.toUpperCase()} `);
    expect(started.status).toBe(200);
    expect(started.body).toEqual({ ok: true, devCode: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    const code = started.body.devCode;

    // No account yet: the code stays usable for the retry with the confirmation and a name.
    const first = await finish({ code });
    expect(first.status).toBe(403);
    expect(first.body).toEqual({ error: expect.any(String), needsSignup: true, email });
    const made = await finish({ code, over13: true, name: 'Lee' });
    expect(made.status).toBe(200);
    expect(made.body.user).toMatchObject({ email, name: 'Lee' });
    // Once used, the code is gone.
    const reused = await finish({ code, over13: true, name: 'Lee' });
    expect(reused.status).toBe(400);
    expect(reused.body.error).toBe('This sign-in link has expired or was already used. Ask for a new one.');

    // An existing account signs in with a new code, no questions asked.
    const again = await finish({ code: (await start(email)).body.devCode });
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(made.body.user.id);
  });

  it('lets the person sign up again when an earlier sign-up stopped half way', async () => {
    // The directory has the address, but the account itself was never made (the server failed in between).
    const email = freshEmail();
    await runInDurableObject(directory(), (_i, state) => {
      state.storage.sql.exec("INSERT INTO emails (email, user_id) VALUES (?, 'halfwaydoneuser2')", email);
    });
    const code = (await start(email)).body.devCode;
    const asked = await finish({ code });
    expect(asked.status).toBe(403);
    expect(asked.body).toMatchObject({ needsSignup: true, email });
    // The same code still works for the retry.
    const made = await finish({ code, over13: true, name: 'Half Way' });
    expect(made.status).toBe(200);
    expect(made.body.user).toMatchObject({ id: 'halfwaydoneuser2', email, name: 'Half Way' });
  });

  it('refuses bad addresses, malformed codes and expired codes', async () => {
    for (const email of ['', 'nobody', 'a@b', 'two@@example.org', 'sp ace@example.org', 'x'.repeat(250) + '@example.org']) {
      const res = await start(email);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Enter a valid email address.');
    }
    expect((await finish({ code: 'short' })).status).toBe(400);
    expect((await finish({ code: 'x'.repeat(43) })).status).toBe(400);

    const code = (await start(freshEmail())).body.devCode;
    const hash = await sha256Hex(code);
    await runInDurableObject(directory(), (_i, state) => {
      state.storage.sql.exec('UPDATE codes SET expires_at = ? WHERE code_hash = ?', Date.now() - 1, hash);
    });
    expect((await finish({ code, over13: true, name: 'Late' })).body.error).toMatch(/expired or was already used/);
  });

  it('limits emails per address, per network and per day', async () => {
    const email = freshEmail();
    for (let i = 0; i < EMAILS_PER_ADDRESS; i++) expect((await start(i % 2 ? email.toUpperCase() : email)).status).toBe(200);
    const tooMany = await start(email);
    expect(tooMany.status).toBe(429);
    expect(tooMany.body.error).toMatch(/^We just sent a few sign-in links to that address\. .* ask again in 1[45] minutes\.$/);
    expect(Number(tooMany.headers.get('Retry-After'))).toBeGreaterThan(800);
    // Another address is not affected.
    expect((await start(freshEmail())).status).toBe(200);

    const network = { 'CF-Connecting-IP': '203.0.113.50' };
    for (let i = 0; i < EMAILS_PER_NETWORK; i++) expect((await start(freshEmail(), network)).status).toBe(200);
    const fromNetwork = await start(freshEmail(), network);
    expect(fromNetwork.status).toBe(429);
    expect(fromNetwork.body.error).toMatch(/^Too many sign-in emails were asked for from this network\. Try again in \d+ minutes\.$/);
    expect((await start(freshEmail(), { 'CF-Connecting-IP': '203.0.113.51' })).status).toBe(200);

    // The daily total (EMAIL_DAILY_LIMIT, 90 here) counts every address and network.
    const sentToday = () =>
      runInDurableObject(directory(), (_i, state) => state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM sends').one().n);
    const filler = 90 - (await sentToday());
    await runInDurableObject(directory(), (_i, state) => {
      for (let i = 0; i < filler; i++) state.storage.sql.exec("INSERT INTO sends (at, email_key, address_key, code_hash) VALUES (?, ?, NULL, 'filler')", Date.now(), `filler-${i}`);
    });
    const daily = await start(freshEmail());
    expect(daily.status).toBe(429);
    expect(daily.body.error).toBe('Rebound has sent all the sign-in emails it can today. Try again tomorrow, or sign in with Google.');
    await runInDurableObject(directory(), (_i, state) => {
      state.storage.sql.exec("DELETE FROM sends WHERE code_hash = 'filler'");
    });
    expect((await start(freshEmail())).status).toBe(200);
  });

  it('sends the link through Resend, and gives the place back when sending fails', async () => {
    const sent: Json[] = [];
    let failing = false;
    const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      sent.push({ url: request.url, auth: request.headers.get('Authorization'), body: await request.json() });
      return failing ? new Response('{"message":"invalid"}', { status: 422 }) : new Response('{"id":"email-1"}', { status: 200 });
    }) as typeof fetch;
    await useAuthOverrides({ email: { devOutbox: false, apiKey: 're_test_key', from: 'Rebound <signin@example.org>', fetch: fake } });

    const email = freshEmail();
    const res = await start(email);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: RESEND_URL, auth: 'Bearer re_test_key', body: { from: 'Rebound <signin@example.org>', to: [email], subject: 'Your Rebound sign-in link' } });
    const text: string = sent[0].body.text;
    const link = /https:\/\/jiazegao\.github\.io\/rebound\/#\/signin\?code=([A-Za-z0-9_-]{43})/.exec(text);
    expect(link).not.toBeNull();
    expect(text).toMatch(/works once, within 15 minutes/);
    expect((await finish({ code: link![1], over13: true, name: 'Mo' })).status).toBe(200);

    failing = true;
    const other = freshEmail();
    for (let i = 0; i < EMAILS_PER_ADDRESS + 1; i++) {
      const failed = await start(other);
      expect(failed.status).toBe(502);
      expect(failed.body.error).toBe("We couldn't send the email right now. Please try again in a few minutes.");
    }
    failing = false;
    expect((await start(other)).status).toBe(200);
  });
});

describe('new accounts', () => {
  it(`allows ${NEW_ACCOUNTS_PER_NETWORK} new accounts per network address per day`, async () => {
    const network = { 'CF-Connecting-IP': '198.51.100.99' };
    const made = [];
    for (let i = 0; i < NEW_ACCOUNTS_PER_NETWORK; i++) made.push(await signUp(`Student ${i}`, { headers: network }));
    const account = newGoogleAccount('One More');
    const refused = await google({ credential: await googleToken(account), over13: true, name: 'One More' }, network);
    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe(`${NEW_ACCOUNTS_PER_NETWORK} accounts were already made from this network today. Please try again tomorrow.`);
    expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0);
    // Without the confirmation the answer is still "sign up first": the limit counts accounts made, not asked about.
    expect((await google({ credential: await googleToken(newGoogleAccount('Asks')) }, network)).status).toBe(403);
    // Signing in to an existing account is not limited, and another network can still make one.
    expect((await google({ credential: await googleToken({ sub: made[0]!.sub, email: made[0]!.email }) }, network)).status).toBe(200);
    expect((await signUp('Elsewhere', { headers: { 'CF-Connecting-IP': '198.51.100.100' } })).id).toMatch(ID_PATTERN);
  });
});

describe('sessions', () => {
  it('checks the token, and signing out ends only that session', async () => {
    const user = await signUp('Nia');
    const second = await google({ credential: await googleToken({ sub: user.sub, email: user.email }) });
    expect((await call('/api/me', { token: user.token })).body.user.name).toBe('Nia');
    for (const bad of ['garbage', `${user.id}.${'x'.repeat(43)}`, `${'a'.repeat(16)}.${user.token.split('.')[1]}`]) {
      const res = await call('/api/me', { token: bad });
      expect(res.status).toBe(401);
    }
    expect((await call('/api/me', { token: `${user.id}.${'x'.repeat(43)}` })).body.error).toBe('Your session has ended. Please sign in again.');

    const out = await call('/api/auth/signout', { method: 'POST', token: user.token });
    expect(out.body).toEqual({ ok: true });
    expect((await call('/api/me', { token: user.token })).status).toBe(401);
    expect((await call('/api/me', { token: second.body.token })).status).toBe(200);
  });

  it('keeps only hashes, notes use at most once a minute, and ends sessions unused for 180 days', async () => {
    const user = await signUp('Oli');
    const secret = user.token.split('.')[1]!;
    const hash = await sha256Hex(secret);
    const rows = await runInDurableObject(userStub(user.id), (_i, state) => state.storage.sql.exec<{ token_hash: string }>('SELECT token_hash FROM sessions').toArray());
    expect(rows.map((r) => r.token_hash)).toEqual([hash]);

    const lastUsed = () => runInDurableObject(userStub(user.id), (_i, state) => state.storage.sql.exec<{ last_used: number }>('SELECT last_used FROM sessions').one().last_used);
    const setLastUsed = (t: number) =>
      runInDurableObject(userStub(user.id), (_i, state) => {
        state.storage.sql.exec('UPDATE sessions SET last_used = ?', t);
      });
    const recent = Date.now() - 30_000;
    await setLastUsed(recent);
    await call('/api/me', { token: user.token });
    expect(await lastUsed()).toBe(recent);
    await setLastUsed(Date.now() - 120_000);
    await call('/api/me', { token: user.token });
    expect(await lastUsed()).toBeGreaterThan(Date.now() - 5000);

    await setLastUsed(Date.now() - 181 * 24 * 60 * 60 * 1000);
    const expired = await call('/api/me', { token: user.token });
    expect(expired.status).toBe(401);
    expect(expired.body.error).toBe('Your session expired after 180 days without use. Please sign in again.');
    expect((await call('/api/me', { token: user.token })).body.error).toBe('Your session has ended. Please sign in again.');
  });
});
