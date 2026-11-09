# Rebound server

The place everything about a player lives: accounts (Google sign-in or a one-time email link), each player's
practice, teams and their shared work, live rooms and online matches, and optional AI help. It is one Cloudflare
Worker plus SQLite-backed Durable Objects: a `Directory` (who each email address and Google account belongs to,
sign-in codes and limits), a `UserServer` per user, a `Team` per team, a `RoomServer` per live room (WebSockets,
Hibernation API) and the `Registry` that caps new teams. The full design is in [`docs/SERVER.md`](../docs/SERVER.md)
and [`docs/ACCOUNTS.md`](../docs/ACCOUNTS.md). The account rules (collections, visibility, merges, API shapes) come
from [`src/core/accounts.ts`](../src/core/accounts.ts), which the site uses too.

```
src/index.ts      Worker: CORS, routing, session checks, sign-in, making and listing rooms
src/auth.ts       Google ID token checks against Google's published keys; sign-in emails through Resend
src/directory.ts  Directory Durable Object: email and Google account → user, email codes, sign-in limits
src/user.ts       UserServer Durable Object: profile, sessions, the user's records, team changes, AI routes
src/team.ts       Team Durable Object: settings, members, join code, team records, game answers, room list
src/room.ts       RoomServer Durable Object: one live room: messages, fair buzzing, team channel, online matches
src/match.ts      online matches with no reader: the match director, pure
src/records.ts    records: change checks, revisions and pages (shared by users and teams)
src/outbox.ts     deliveries between objects (a game's answers, a match's team game), retried from alarms
src/ai.ts         optional AI help (Claude API)
src/tts.ts        optional Rebound's voice for reading aloud: Google Text-to-Speech, MP3 lengths, test stand-ins
src/voice.ts      VoiceCache Durable Objects: the recordings, each question recorded once
src/registry.ts   Registry Durable Object: daily caps on new teams, characters recorded each month
src/http.ts       JSON responses, plain-language errors, size-limited bodies, the caller's identity
src/validate.ts   input checks; src/crypto.ts ids, secrets, hashes (Web Crypto only); src/objects.ts stubs
test/*.test.ts    end-to-end tests run in workerd: sign-in, accounts and records, teams, rooms, matches, voice, AI
```

## Run and test locally

No Cloudflare account is needed for either.

```bash
cd server
npm ci                       # install exactly what package-lock.json lists
npm test                     # runs the real Worker and Durable Objects in workerd (vitest + @cloudflare/vitest-plugin)
npm run typecheck            # tsc --noEmit
cp .dev.vars.example .dev.vars
npx wrangler dev             # local server on http://localhost:8787 (data kept in server/.wrangler/, git-ignored)
```

`.dev.vars` (git-ignored) sets `DEV_EMAIL_OUTBOX=1`: email sign-in then sends nothing and
`POST /api/auth/email/start` answers `{ ok: true, devCode }`, the code to finish with. The tests set the same
variable, and their own `GOOGLE_CLIENT_ID`, in `vitest.config.ts`; they sign Google ID tokens with a test key they
make (`test/helpers.ts`). Never put `DEV_EMAIL_OUTBOX` in `wrangler.toml`. The sign-in limits apply locally too,
except that `.dev.vars` lifts the daily cap on sign-in emails (none are sent); the per-network limits read the
`CF-Connecting-IP` header, which the browser tests (`e2e/accounts.cjs`) set to a made-up address for each sign-up.

Quick check against `wrangler dev`:

```bash
curl http://localhost:8787/api/health
curl http://localhost:8787/api/auth/config
curl -X POST http://localhost:8787/api/auth/email/start -H 'Content-Type: application/json' -d '{"email":"kay@example.org"}'
curl -X POST http://localhost:8787/api/auth/email/finish -H 'Content-Type: application/json' \
  -d '{"code":"<devCode>","over13":true,"name":"Coach Kay"}'
```

Note for dependency upgrades: npm 10 can crash with `Cannot read properties of null (reading 'edgesOut')` when
it resolves this tree without a lockfile. `npm install --legacy-peer-deps` gets past it; then run a plain
`npm install` once so the lockfile records the peer dependencies again.

## Deploy

1. Create an API token in the Cloudflare dashboard (My Profile → API Tokens) from the **Edit Cloudflare Workers**
   template. The permission that matters is **Account → Workers Scripts: Edit** (the Durable Object namespaces and
   their SQLite migrations are created when the script is uploaded); the template's Account Settings: Read and
   User Details/Memberships: Read let Wrangler find the account. Add **Zone → Workers Routes: Edit** only if the
   server will later get a custom domain.
2. The account needs a `workers.dev` subdomain (the dashboard's Workers & Pages page sets one up on first visit).
3. Check the `[vars]` in `wrangler.toml`:
   - `ALLOWED_ORIGINS`: the browser origins of the site, comma-separated, no paths or trailing slashes. It ships as
     `https://jiazegao.github.io,http://localhost:5173,http://localhost:4173`.
   - `SITE_URL`: the site's address, for email sign-in links (`<SITE_URL>#/signin?code=...`). It ships as
     `https://jiazegao.github.io/rebound/`.
   - `GOOGLE_CLIENT_ID`: the OAuth client id for "Sign in with Google" (a public identifier, not a secret; see below).
   - `EMAIL_FROM` and `EMAIL_DAILY_LIMIT`: see "Email sign-in" below.
4. **The first deploy of accounts deletes the old team data.** The `v3` migration deletes the old `TeamServer`
   class and every team's data with it (accounts start fresh). Make sure everyone has downloaded a backup from the
   old version of the site first.
5. Deploy:

   ```bash
   cd server
   npm ci && npm test
   CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account id> npx wrangler deploy
   curl https://rebound-server.<your-subdomain>.workers.dev/api/health        # → {"ok":true}
   curl https://rebound-server.<your-subdomain>.workers.dev/api/auth/config   # which sign-ins are on
   ```

6. Point the site at it: `VITE_SERVER_URL` in the build step of `.github/workflows/deploy.yml`. The published site
   uses `https://rebound-server.hanjian.workers.dev`.

SQLite-backed Durable Objects are available on the Workers Free plan.

### Google sign-in

In the Google Cloud console (Google Auth Platform → Clients, or APIs & Services → Credentials), an OAuth client of
type **Web application** with the site's origins under **Authorized JavaScript origins**: `https://jiazegao.github.io`,
and for development `http://localhost:5173` and `http://localhost:4173` (origins only: no path such as `/rebound/`).
Its client id goes in `wrangler.toml` as `GOOGLE_CLIENT_ID`; no client secret is used. Without `GOOGLE_CLIENT_ID`,
Google sign-in is off.

Rebound asks Google only for the basic sign-in scopes (`openid`, `email`, `profile`), so the app needs no Google
verification, but its **Audience** (the OAuth consent screen's publishing status) must be **In production**: while
it says *Testing*, only the test users listed there can sign in. Under **Branding**, give the app's name, a support
email, and the home page and the privacy page (`https://jiazegao.github.io/rebound/#/about`).

### Email sign-in

One-time links sent through [Resend](https://resend.com). It stays off until both are set:

```bash
cd server
npx wrangler secret put RESEND_API_KEY     # a Resend API key with permission to send; stored encrypted by Cloudflare
```

and in `wrangler.toml` `EMAIL_FROM = "Rebound <signin@your-domain.example>"`, an address on a domain verified with
Resend. `EMAIL_DAILY_LIMIT` (default 90) keeps the total under Resend's free 100 emails a day; each address gets at
most 3 links per 15 minutes and each network address 10 per hour. Redeploy after changing them.

### Optional: Rebound's voice for reading aloud

Matches and solo practice read aloud (docs/SERVER.md, "Read aloud" and "Solo practice read aloud") use each player's
device voice until the Worker has a Google Cloud API key; then every player hears the same natural voice (Google's
Chirp 3 HD), each question recorded once and kept.
In the Google Cloud project that holds the sign-in client:

1. **Billing** (Billing → Link a billing account). Google asks for a card even within the free allowance.
2. **The API**: APIs & Services → Library → *Cloud Text-to-Speech API* → Enable.
3. **A key**: APIs & Services → Credentials → Create credentials → API key; under *API restrictions*, allow only the
   Cloud Text-to-Speech API.
4. **A budget alert**: Billing → Budgets & alerts → Create budget, for example $5, with emails at 50% and 100%.
5. **The secret**, in `server/`: `npx wrangler secret put GOOGLE_TTS_API_KEY` (or in the Cloudflare dashboard: Workers &
   Pages → rebound-server → Settings → Variables and Secrets → Add → Secret). It applies at once; no redeploy.

What it costs: each question is recorded once, so a match or a practice session only sends questions never read
before. A median round is about 7,800 characters and the whole DOE library about 4 million; Google gives 1 million
characters a month free for Chirp 3 HD voices, then charges about $30 per million. `TTS_MONTHLY_CHARS` in
`wrangler.toml` (default 900,000) stops recording new questions once a month's characters reach it; those questions
are then read by the devices' own voices. Solo practice may use 80% of it, so matches always have some left, and each
player at most 300 new recordings a day.
`TTS_VOICE` picks the voice (Google's list of Chirp 3 HD voices names them, for example `en-US-Chirp3-HD-Kore`;
recordings are kept per voice, so changing it records questions again). Only question text is sent, nothing about
players.

To test locally without Google, start the server with silent stand-in recordings: `npx wrangler dev --var
DEV_TTS_FAKE:1` (never in `wrangler.toml`).

### Optional: AI help

AI drafts and explanations (docs/SERVER.md, "AI help") stay off until the Worker has a Claude API key. To turn
them on, create a key in the Claude Console (console.anthropic.com → API Keys), ideally in a workspace with a
monthly spend limit, then:

```bash
cd server
npx wrangler secret put ANTHROPIC_API_KEY     # paste the key at the prompt; it is stored encrypted by Cloudflare
```

To turn AI help off again: `npx wrangler secret delete ANTHROPIC_API_KEY`. In `wrangler.toml`, `AI_DAILY_LIMIT`
caps the model calls each user can make per UTC day (default 50); `AI_MODEL` and `AI_CHECK_MODEL` choose the
models (default `claude-opus-5-5` for both). Redeploy after changing them.

What it costs: Claude Opus 5.5 is $4 per million input tokens and $20 per million output tokens (thinking
counts as output). Rough figures: a draft of three questions from a page of text, with its blind checks, is
about $0.15 to $0.35; an explanation about $0.01 to $0.05, and nothing when it is served from the user's cache.
At the default limit one person can spend at most a few dollars a day, so a whole team can spend several times
that; lower `AI_DAILY_LIMIT` if needed. Check real spending in the Claude Console. The Workers Free plan's 10 ms CPU
limit is not an issue: waiting on the API is not CPU time.

## Things to know

- **Sessions.** Tokens are `<userId>.<secret>`; only the SHA-256 of the secret is stored, in the user's own object.
  Unused sessions expire after 180 days, and a user keeps at most 50. Signing out ends one session and closes its
  room connections.
- **Accounts and privacy.** The server stores an email address, a display name, what the person adds (subjects,
  graduation year, settings) and their practice. Accounts need the 13+ confirmation. `GET /api/me/export` gives a
  person everything in their account; `DELETE /api/me` deletes it (a team's last coach or captain hands over first).
  Network addresses are kept only as salted hashes, for the limits, for at most a day.
- **AI calls and privacy.** With AI help on, the passages people paste and the questions they ask about are sent
  to the Claude API, under the API key owner's agreement with Anthropic (its commercial terms and privacy policy
  say how API data is handled). Nothing else is sent, and the key never reaches the site.
- **Logs.** WebSocket URLs carry the session token (browsers cannot set headers on WebSockets), so Workers Logs
  stay off in `wrangler.toml`. Use `npx wrangler tail` to watch errors live. The server never logs secrets, tokens
  or sign-in codes, and logs only the status of a failed Resend call.
- **Open sign-up.** Anyone 13 or older can make an account (20 new accounts per network address per day) and any
  school can make a team: the `Registry` (`src/registry.ts`) allows 10 new teams per network address and 300 in all
  per UTC day (429 with `Retry-After` past either). If a school hits the address limits (a whole district behind
  one address, say), raise `NEW_ACCOUNTS_PER_NETWORK` in `src/directory.ts` or `TEAMS_PER_ADDRESS_PER_DAY` and
  redeploy.
- **Deliveries between objects.** A finished game's answers (and an online team match's game record) are written to
  the other objects through an outbox kept in the same SQLite database, sent at once and retried from the object's
  alarm (after 30 seconds, then 2 and 10 minutes, 1, 6 and 24 hours) if the other object cannot be reached.
- **Round-trip times for fair buzzing.** Besides answering the client's `ping` with `pong`, the server sends
  its own `{ "type": "ping", "t": <server time> }` (after `welcome` and after each client ping, at most once a
  second). The client should answer at once with `{ "type": "pong", "t": <same t> }`; the server measures the
  round trip from that. A client that never answers simply gets no latency correction.

## Protocol details beyond docs/SERVER.md

- `welcome.room` also carries `seq` (of the latest `state`). Refused room messages (a closed buzzer, a second buzz,
  a non-reader `publish`, chat too fast…) get an `error` message; the connection stays open. The server closes
  sockets with code 4001 (signed out, or the account was deleted) or 4004 (the room closed).
- Rules not spelled out in the spec: the reader has no side and cannot buzz; a side has at most one captain, and
  changing sides gives up the captaincy; `close` drops buzzes still being collected but keeps an announced winner
  until the next `open`; joining a team one is already on returns it, whatever the link.
- Safety limits: 200 members per team, 20 open rooms per team, 30 new rooms per person per day, 64 connections per
  room, 10 `publish` messages a second, JSON nested at most 100 deep, and a records page also ends early at about
  4 MB (with `more: true`).
- Requests from origins outside `ALLOWED_ORIGINS` are refused (403), not only left without CORS headers.
