/*
 * Accounts for the browser tests (docs/ACCOUNTS.md): signs people up on a local server through its development
 * email outbox, makes and joins teams through the API, and opens browser contexts that are already signed in.
 *
 * The server must run with DEV_EMAIL_OUTBOX=1, and the site must be built without VITE_SERVER_URL (it then keeps
 * the server's address with the session):
 *
 *   cd server && cp .dev.vars.example .dev.vars && npx wrangler dev --port 8787 &
 *   npm run build && npx vite preview --port 4173 --strictPort &
 *
 * SERVER_URL and BASE_URL point the tests elsewhere (defaults http://localhost:8787 and http://localhost:4173/).
 */
const SERVER = (process.env.SERVER_URL || 'http://localhost:8787').replace(/\/+$/, '');
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
/** Where the site keeps the session (src/lib/api.ts). */
const SESSION_KEY = 'rebound-session';

// Every sign-up comes from its own made-up network address (in 198.18.0.0/15, which is set aside for tests), so
// the server's per-network limits on sign-in emails, new accounts and new teams never stop a later run. A local
// server reads the address from the CF-Connecting-IP header, as Cloudflare's network sets it in production.
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let made = 0;
function freshAddress() {
  const n = Math.floor(Math.random() * 2 ** 17);
  return `198.${18 + (n >> 16)}.${(n >> 8) & 255}.${n & 255}`;
}

/** One API call: the parsed JSON body, or an error naming the route, status and the server's message. */
async function call(route, { token, method, body, address } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (address) headers['CF-Connecting-IP'] = address;
  const verb = method || (body === undefined ? 'GET' : 'POST');
  let res;
  try {
    res = await fetch(`${SERVER}${route}`, { method: verb, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (err) {
    throw new Error(`cannot reach the server at ${SERVER} (start it with npx wrangler dev, see e2e/accounts.cjs): ${err.message}`);
  }
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text };
  }
  if (!res.ok) throw new Error(`${verb} ${route}: ${res.status} ${json.error || text}`);
  return json;
}

/**
 * A new account, signed up through the email outbox: { token, user, email, name }. The primary and secondary
 * subject and graduation year are set at once, before the account joins a team (members carry a copy of them).
 */
async function signUp(name, { email, primarySubject, secondarySubject, gradYear } = {}) {
  const address = freshAddress();
  made += 1;
  const mail = email || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'player'}+${RUN}-${made}@test.example`;
  const started = await call('/api/auth/email/start', { body: { email: mail }, address });
  if (!started.devCode) throw new Error('the server emailed a link instead of returning a code: run it with DEV_EMAIL_OUTBOX=1 (server/.dev.vars)');
  const signed = await call('/api/auth/email/finish', { body: { code: started.devCode, over13: true, name }, address });
  let user = signed.user;
  const profile = {
    ...(primarySubject ? { primarySubject } : {}),
    ...(secondarySubject ? { secondarySubject } : {}),
    ...(gradYear ? { gradYear } : {}),
  };
  if (Object.keys(profile).length) user = (await call('/api/me', { method: 'PATCH', token: signed.token, body: profile })).user;
  return { token: signed.token, user, email: mail, name };
}

/** A new team made by `account`, who becomes its captain: { team, joinCode }. `level` is 'HS' or 'MS'. */
function makeTeam(account, name, level = 'HS') {
  return call('/api/teams', { token: account.token, body: { name, level, leaveCurrent: true }, address: freshAddress() });
}

/** `account` joins the team of `joinCode` ("<teamId>.<secret>", the end of an invite link): { team }. */
function joinTeam(account, joinCode) {
  const [teamId, secret] = joinCode.split('.');
  return call(`/api/teams/${teamId}/join`, { token: account.token, body: { secret, leaveCurrent: true } });
}

/** A leader changes a member's role ('coach', 'captain' or 'member') or squad: { member }. */
function setMember(leader, teamId, userId, fields) {
  return call(`/api/teams/${teamId}/members/${userId}`, { method: 'PATCH', token: leader.token, body: fields });
}

/** A team of `players` ([{ name, primarySubject?, ... }]); the first one makes it and is captain. */
async function makeTeamOf(teamName, players, level = 'HS') {
  const accounts = [];
  for (const p of players) accounts.push(await signUp(p.name, p));
  const { team, joinCode } = await makeTeam(accounts[0], teamName, level);
  for (const a of accounts.slice(1)) await joinTeam(a, joinCode);
  return { team, joinCode, accounts };
}

/**
 * A browser context signed in as `account` (null: signed out, but the site already knows the server's address).
 * The session is in localStorage before the first page loads, as if the person had signed in earlier.
 */
function signedInContext(browser, account, options = {}) {
  const origin = new URL(BASE).origin;
  const value = JSON.stringify({ ...(account ? { token: account.token } : {}), server: SERVER });
  return browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    ...options,
    storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: SESSION_KEY, value }] }] },
  });
}

/**
 * Collects a page's errors into `errors`: uncaught exceptions and console errors, except the 403 a sign-in finish
 * answers when the account does not exist yet (the site then asks for a name and the 13+ confirmation, by design).
 */
function watchErrors(page, label, errors) {
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/status of 403/.test(m.text()) && /\/api\/auth\/(email|google)\/finish$/.test(m.location().url || '')) return;
    errors.push(`${label} console: ${m.text()}`);
  });
}

module.exports = { SERVER, BASE, SESSION_KEY, call, signUp, makeTeam, joinTeam, setMember, makeTeamOf, signedInContext, watchErrors };
