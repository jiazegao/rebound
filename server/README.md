# Rebound team server

The shared place behind the static site: team data sync and live rooms. It is one Cloudflare Worker plus one
Durable Object per team (class `TeamServer`), which keeps that team's data in its own SQLite database and hosts
its rooms over WebSockets (Hibernation API). The full design is in [`docs/SERVER.md`](../docs/SERVER.md). The
sync rules (collections, permissions, merges, sizes) come from [`src/core/sync.ts`](../src/core/sync.ts), which the
site uses too.

```
src/index.ts     Worker: CORS, routing, team creation (each team gets its own Durable Object)
src/team.ts      TeamServer Durable Object: members, sessions, join codes, sync and room endpoints
src/rooms.ts     live rooms: messages, fair buzzing, team channel, hibernation-safe state
src/records.ts   the sync algorithm (canWrite, mergeRecord, paging) in one storage transaction
src/store.ts     SQLite schema and shared queries
src/crypto.ts    ids, tokens, PIN hashing (PBKDF2-SHA256), constant-time comparison (Web Crypto only)
src/http.ts      JSON responses, plain-language errors, size-limited bodies
src/validate.ts  input checks
test/*.test.ts   end-to-end tests run in workerd: identity, sync, HTTP/CORS, rooms over real WebSockets
```

## Run and test locally

No Cloudflare account is needed for either.

```bash
cd server
npm ci                  # install exactly what package-lock.json lists
npm test                # runs the real Worker and Durable Object in workerd (vitest + @cloudflare/vitest-plugin)
npm run typecheck       # tsc --noEmit
npx wrangler dev        # local server on http://localhost:8787 (data kept in server/.wrangler/, git-ignored)
```

Quick check against `wrangler dev`:

```bash
curl http://localhost:8787/api/health
curl -X POST http://localhost:8787/api/teams -H 'Content-Type: application/json' \
  -d '{"teamName":"Test HS","level":"HS","memberName":"Coach Kay","pin":"4321"}'
```

Note for dependency upgrades: npm 10 can crash with `Cannot read properties of null (reading 'edgesOut')` when
it resolves this tree without a lockfile. `npm install --legacy-peer-deps` gets past it; then run a plain
`npm install` once so the lockfile records the peer dependencies again.

## Deploy

1. Create an API token in the Cloudflare dashboard (My Profile → API Tokens) from the **Edit Cloudflare Workers**
   template. The permission that matters is **Account → Workers Scripts: Edit** (the Durable Object namespace and
   its SQLite migration are created when the script is uploaded); the template's Account Settings: Read and
   User Details/Memberships: Read let Wrangler find the account. Add **Zone → Workers Routes: Edit** only if the
   server will later get a custom domain.
2. The account needs a `workers.dev` subdomain (the dashboard's Workers & Pages page sets one up on first visit).
3. Check `ALLOWED_ORIGINS` in `wrangler.toml` (`[vars]`): the browser origins of the site, comma-separated, no
   paths or trailing slashes. It ships as
   `https://jiazegao.github.io,http://localhost:5173,http://localhost:4173`.
4. Deploy:

   ```bash
   cd server
   npm ci && npm test
   CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account id> npx wrangler deploy
   curl https://rebound-server.<your-subdomain>.workers.dev/api/health   # → {"ok":true}
   ```

5. Point the site at it: `VITE_SERVER_URL` in the build step of `.github/workflows/deploy.yml`. The published site
   uses `https://rebound-server.hanjian.workers.dev`. To test a deployed server end to end, run
   `SERVER_URL=<its address> node e2e/team-server.cjs` against a local build; its last step deletes the test team.

No secrets are needed for sync and rooms. SQLite-backed Durable Objects are available on the Workers Free plan.

### Optional: AI help

AI drafts and explanations (docs/SERVER.md, "AI help") stay off until the Worker has a Claude API key. To turn
them on, create a key in the Claude Console (console.anthropic.com → API Keys), ideally in a workspace with a
monthly spend limit, then:

```bash
cd server
npx wrangler secret put ANTHROPIC_API_KEY     # paste the key at the prompt; it is stored encrypted by Cloudflare
```

To turn AI help off again: `npx wrangler secret delete ANTHROPIC_API_KEY`. In `wrangler.toml`, `AI_DAILY_LIMIT`
caps the model calls each team can make per UTC day (default 50); `AI_MODEL` and `AI_CHECK_MODEL` choose the
models (default `claude-opus-5-5` for both). Redeploy after changing them.

What it costs: Claude Opus 5.5 is $4 per million input tokens and $20 per million output tokens (thinking
counts as output). Rough figures: a draft of three questions from a page of text, with its blind checks, is
about $0.15 to $0.35; an explanation about $0.01 to $0.05, and nothing when it is served from the team's cache.
At the default limit one team can spend at most a few dollars a day. Check real spending in the Claude Console.
The Workers Free plan's 10 ms CPU limit is not an issue: waiting on the API is not CPU time.

## Things to know

- **PIN hashing cost.** PBKDF2-SHA256 runs 20,000 iterations (`PIN_ITERATIONS` in `src/crypto.ts`), a few
  milliseconds of CPU per hash, which keeps sign-in inside the Free plan's 10 ms of CPU per request. A 4–8 digit
  PIN is weak against anyone holding its hash whatever the count, so the real defenses are that hashes never
  leave the Durable Object and the five-try lockout. Each stored hash records its own iteration count, so the
  count can change later without breaking existing PINs.
- **AI calls and privacy.** With AI help on, the passages members paste and the questions they ask about are sent
  to the Claude API, under the API key owner's agreement with Anthropic (its commercial terms and privacy policy
  say how API data is handled). Nothing else about the team is sent, and the key never reaches the site.
- **Logs.** WebSocket URLs carry the session token (browsers cannot set headers on WebSockets), so Workers Logs
  stay off in `wrangler.toml`. Use `npx wrangler tail` to watch errors live. The server never logs PINs,
  secrets or tokens.
- **Failed-join limit.** The 30-per-hour limit per network address is kept inside each team's object. Every
  sign-in attempt counts against it until it succeeds, and the address is stored only as a salted hash, removed
  at the first sign-in attempt an hour or more later. It protects each team, but it is not a global limit.
- **Open sign-up.** Any school can create a team. A single `Registry` Durable Object (`src/registry.ts`) counts
  new teams: at most 10 per network address and 300 in all per UTC day (429 with `Retry-After` past either).
  Addresses are kept only as salted hashes, for the current day. If a school hits the address limit (a whole
  district behind one address, say), raise `TEAMS_PER_ADDRESS_PER_DAY` and redeploy.
- **Round-trip times for fair buzzing.** Besides answering the client's `ping` with `pong`, the server sends
  its own `{ "type": "ping", "t": <server time> }` (after `welcome` and after each client ping, at most once a
  second). The client should answer at once with `{ "type": "pong", "t": <same t> }`; the server measures the
  round trip from that. A client that never answers simply gets no latency correction.

## Protocol details beyond docs/SERVER.md

- `GET /rooms` returns `{ rooms: [{ roomId, name, host: { memberId, name }, players, createdAt }] }`, newest
  first; `players` is the number of members connected right now, not counting the reader.
- `welcome.room` also carries `seq` (of the latest `state`). Status codes: 201 for a new team or room, 401 for a
  missing or ended session, 403 for a wrong secret, wrong PIN or missing role, 409 for conflicts (a roster player
  already linked, removing or demoting the last leader), 413 for too-large requests, 429 for locks and limits
  (with `Retry-After`).
- Refused room messages (a closed buzzer, a second buzz, a non-reader `publish`, chat too fast…) get an `error`
  message; the connection stays open. The server closes sockets with code 4001 (signed out), 4003 (removed from
  the team) or 4004 (team deleted or room closed).
- Rules not spelled out in the spec: one member per roster player; a team always keeps at least one coach or
  captain; an existing name signing in keeps its roster link (leaders change links); the reader has no side and
  cannot buzz; a side has at most one captain, and changing sides gives up the captaincy; `close` drops buzzes
  still being collected but keeps an announced winner until the next `open`.
- Safety limits: 200 members per team, 20 open rooms, 64 connections per room, 10 `publish` messages a second,
  JSON nested at most 100 deep, and a sync page also ends early at about 4 MB (with `more: true`).
- Requests from origins outside `ALLOWED_ORIGINS` are refused (403), not only left without CORS headers.
