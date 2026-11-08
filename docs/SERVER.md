# Rebound server

The website is static (GitHub Pages). Everything about a player lives on this server (docs/ACCOUNTS.md): accounts,
each player's practice, teams and their shared work, live rooms and online matches, and optional AI help. The site
keeps only a session token.

It runs on Cloudflare: one Worker (HTTP and WebSocket routing, sign-in) and SQLite-backed Durable Objects. The free
plan is enough for a school.

## Principles

- **Accounts, no passwords.** People sign in with Google or with a one-time email link, and confirm they are 13 or
  older when the account is made. The server stores an email address, a display name and what the person chooses
  to add (subjects, graduation year, settings). Network addresses are kept only as salted hashes, for limits.
- **Practice belongs to the player.** A user's answers, review cards, plans and ledgers live in that user's own
  Durable Object and go with them from team to team. Teammates can read a player's visible collections (not their
  review cards or daily plan).
- **Teams are clans.** A user is on at most one team at a time. The team owns its shared work (lineups, assignments,
  games, packets, visual and written questions, concept cards) and its settings.
- **Rooms are open.** Any signed-in user with a room's link can join it, whatever their team.
- **Shared rules.** `src/core/accounts.ts` (collections, visibility, merges, API shapes) and `src/core/games.ts`
  (game records and their outcomes) are imported by both the site and the server, so they cannot disagree.

## Durable Objects

| class | addressed by | holds |
|---|---|---|
| `Directory` | `"global"` | email address → user, Google account (`sub`) → user, pending email codes (hashed), sign-in limits |
| `UserServer` | user id | profile, sessions (hashed), the user's collections, rooms the user's sessions joined, AI usage and explanation cache |
| `Team` | team id | settings, members (role and squad, plus a copy of each member's name, subjects and graduation year), the current join secret, team collections, the list of rooms its members opened, pending answer deliveries |
| `RoomServer` | room id | one reader room or one online match: its members, sides, published state, buzzers, the match, pending result deliveries |
| `Registry` | `"global"` | daily caps on new teams (open sign-up) |

The Worker checks every request's session with the caller's `UserServer`, then sends the request on, with the
caller's identity, to the object that owns what it is about. Only the Worker builds requests to the objects, and it
never passes a client's own headers on. Objects call each other through RPC: a team tells a member's account it
removed them, a finished game's answers go to each player's account, a room lists itself for its team.

Ids are 16 lowercase base32 characters (80 random bits): users, teams and rooms. Only well-formed ids reach an
object, so random paths never wake one.

## Identity and sign-in

- A **user**: `{ id, email, name, createdAt, over13At, primarySubject?, secondarySubject?, gradYear?, settings }`
  (`UserProfile`), with `settings: { sound, readingWpm, answerTimer, dailyMinutes, cardsCursor? }`. One account per
  email address (lowercased).
- A **session token** is `<userId>.<secret>`, the secret 32 random bytes in base64url. The user's object keeps only
  the SHA-256 of the secret. Clients send `Authorization: Bearer <token>`, or `?token=` on the room WebSocket only
  (browsers cannot set headers on WebSockets). Sessions unused for 180 days expire; a session's last use is written
  at most once a minute. A user keeps at most 50 sessions (the least recently used end first).
- **Google.** The site shows Google's "Sign in with Google" button and sends the ID token it gets:
  `POST /api/auth/google { credential, over13?, name? }`. The server checks its RS256 signature against Google's
  published keys (`https://www.googleapis.com/oauth2/v3/certs`, cached as long as Google's `Cache-Control` says;
  an unknown key id fetches them again at most once a minute), then `aud` = `GOOGLE_CLIENT_ID`, `iss`
  (`accounts.google.com` or `https://accounts.google.com`), `exp` (60 seconds of leeway) and `email_verified`.
  It finds the user by Google account, else by email address (and links the Google account to them), else makes one.
  No client secret is needed.
- **Email link.** `POST /api/auth/email/start { email }` makes a one-time code (32 random bytes; its SHA-256 kept 15
  minutes) and emails the link `<SITE_URL>#/signin?code=<code>` through Resend. It answers `{ ok: true }` whether or
  not the address has an account. `POST /api/auth/email/finish { code, over13?, name? }` uses the code once and signs
  in.
- **New accounts.** Either finish call makes the account only with `over13: true` and a name (1–40 characters, NFC,
  whitespace collapsed, no control or direction-override characters). Otherwise it answers
  403 `{ error, needsSignup: true, email }`; the site asks for the name and the confirmation and calls again (the
  Google credential, or the email code until it expires, still works for that call).
- **Limits.** Sign-in emails: 3 per address per 15 minutes, 10 per network address per hour, `EMAIL_DAILY_LIMIT` per
  UTC day in all (default 90, under Resend's free 100). New accounts: 20 per network address per UTC day. Over a
  limit: 429 with `Retry-After`. An email Resend refuses is not counted.
- **Development.** With `DEV_EMAIL_OUTBOX = "1"` (in `server/.dev.vars` or the test config, never in
  `wrangler.toml`), `email/start` sends nothing and answers `{ ok: true, devCode }`.
- **Which ways are on.** Google needs `GOOGLE_CLIENT_ID`. Email needs `RESEND_API_KEY` and `EMAIL_FROM` (or the
  development outbox). `GET /api/auth/config` tells the site.

## HTTP API

All bodies are JSON. Errors are `{ "error": "<plain-language message>" }` (sometimes with more fields, below) with a
4xx or 5xx status. Every response carries CORS headers for the origins in `ALLOWED_ORIGINS` (comma-separated, for
example `https://jiazegao.github.io,http://localhost:5173,http://localhost:4173`); requests from other origins are
refused (403). "user" = signed in; "member" = signed in and on that team; "leader" = a member who is a coach or
captain.

| Method and path | Who | Body → response |
|---|---|---|
| `GET /api/health` | anyone | → `{ ok: true }` |
| `GET /api/auth/config` | anyone | → `{ google: { clientId } \| null, email: boolean }` |
| `POST /api/auth/google` | anyone | `{ credential, over13?, name? }` → `{ token, user }` |
| `POST /api/auth/email/start` | anyone | `{ email }` → `{ ok: true }` (`devCode` too in development) |
| `POST /api/auth/email/finish` | anyone | `{ code, over13?, name? }` → `{ token, user }` |
| `POST /api/auth/signout` | user | → `{ ok: true }` (ends this session and closes its room connections) |
| `GET /api/me` | user | → `{ user, team: { id, name, level, role } \| null }` |
| `PATCH /api/me` | user | `{ name?, primarySubject?, secondarySubject?, gradYear?, settings? }` → `{ user }` |
| `DELETE /api/me` | user | → `{ ok: true }` (leaves the team, then deletes the account and everything in it) |
| `GET /api/me/records?cursor=` | user | → `{ cursor, records: [{ c, id, body, rev }], more }` |
| `POST /api/me/records` | user | `{ changes: [{ c, id, body \| null }] }` → `{ cursor, rejected }` |
| `GET /api/me/export` | user | → the account as one JSON file (below) |
| `POST /api/teams` | user | `{ name, level: "HS"\|"MS", leaveCurrent? }` → 201 `{ team, joinCode }` (the caller becomes captain) |
| `GET /api/teams/:id` | member | → `{ team: { id, name, level, nextEvent?, createdAt }, members, you: { role }, joinCode? }` (`joinCode` for leaders) |
| `PATCH /api/teams/:id` | leader | `{ name?, level?, nextEvent? }` (`nextEvent: null` clears it) → `{ team }` |
| `POST /api/teams/:id/join` | user | `{ secret, leaveCurrent? }` → `{ team }` |
| `POST /api/teams/:id/leave` | member | → `{ ok: true }` |
| `PATCH /api/teams/:id/members/:userId` | leader, or the member for their own subjects | `{ role?, squad?, primarySubject?, secondarySubject?, gradYear? }` → `{ member }` |
| `DELETE /api/teams/:id/members/:userId` | leader (or the member themselves, which is leaving) | → `{ ok: true }` |
| `POST /api/teams/:id/join-code` | leader | → `{ joinCode }` (a new secret; old links stop working) |
| `DELETE /api/teams/:id` | leader | → `{ ok: true }` (deletes the team and its records) |
| `GET /api/teams/:id/records?cursor=` | member | → `{ cursor, records: [{ c, id, body, rev, by }], more }` |
| `POST /api/teams/:id/records` | member | `{ changes }` → `{ cursor, rejected }` |
| `GET /api/teams/:id/members/:userId/records?cursor=` | member | that teammate's visible collections, as for `/api/me/records` |
| `GET /api/rooms` | user | → `{ rooms }`: the open rooms opened by members of the caller's team (query parameters are ignored) |
| `POST /api/rooms` | user | `{ name, match? }` → 201 `{ roomId }` (the caller hosts it; with `match`, an online match: see Match rooms) |
| `GET /api/rooms/:id/ws?token=` | user | WebSocket upgrade (see Rooms) |
| `GET /api/ai` | user | → `{ enabled: false }`, or `{ enabled: true, model, dailyLimit, usedToday }` |
| `POST /api/ai/draft` | user | `{ passage, source, subject, kind?: "tossup"\|"bonus"\|"either", count?: 1–5 }` → `{ drafts, model, dailyLimit, usedToday }` |
| `POST /api/ai/explain` | user | `{ stem, answer, choices?: { W, X, Y, Z }, subject? }` → `{ explanation, answerLooksWrong, model, cached, dailyLimit, usedToday }` |
| `POST /api/ai/card` | user | `{ concept, passage, source }` → `{ card: { summary, facts, traps }, model, dailyLimit, usedToday }` |

A team member is `{ userId, name, role: "coach"|"captain"|"member", squad?, primarySubject?, secondarySubject?,
gradYear?, joinedAt, lastSeen }` (`TeamMember`); members are listed by name. Join codes are `<teamId>.<secret>` (a
12-character base32 secret, compared in constant time); the site shows them as links `<site>#/join/<joinCode>`.

Status codes: 201 for a new team or room; 400 for a malformed request; 401 for a missing or ended session; 403 for
`needsSignup` (`{ error, needsSignup: true, email }`), a wrong join code, a missing role, not being on the team, or an
unverified Google email address; 404 for an unknown team, room or route, or a sign-in method that is off; 409 for
being on a team already (`{ error, inTeam: true }`), the last leader leaving or being demoted, or a full team;
413 for too-large requests; 426 for a room address opened without a WebSocket; 429 for limits (with
`Retry-After`); 502 when an email could not be sent or the AI service failed; 503 when Google's keys or the AI key
are not available.

### People and teams

- **One team at a time.** Making or joining a team while on another answers 409 `{ error, inTeam: true }` unless the
  call says `leaveCurrent: true`. Then the new team takes the user first and the old team is left after, so a
  refused join (a wrong code) never costs the user their team. Joining a team one is already on just returns it.
- **Leaders.** The team's creator is its captain. Leaders change the team's settings, roles and squads, anyone's
  subjects and graduation year, remove members and replace the join code; a member may change their own subjects
  and graduation year (the site uses `PATCH /api/me` for that). A team always keeps a coach or captain: the last one
  cannot be demoted, and cannot leave (or delete their account) while others remain. The last member leaving deletes
  the team.
- **Copies.** A member's name, subjects and graduation year belong to their account; the team keeps a copy for its
  member list and for games. `PATCH /api/me` updates the copy; a leader's change goes to the account first. Each
  `GET /api/me` also refreshes the copy and the member's last-seen time, and repairs an account that missed being
  told it was removed.
- **Limits.** 200 members per team. New teams: 10 per network address and 300 in all per UTC day (the `Registry`).

### Records

A user's collections and a team's collections are each a set of records `(collection, id) → body`, with the
collections in `src/core/accounts.ts`:

- user: `attempts`, `answers`, `seen` and `conceptReads` (id `ledger`), `completions`, `reports`, `cards`, `plans`
  (id `today`). `answers` are written only by the server. Teammates may read all but `cards` and `plans`.
- team: `lineups` and `assignments` (leaders write), `games`, `packets`, `visuals`, `written`, `conceptCards`
  (members write).

`POST .../records` with `{ changes }` (at most 500; more is a 413): each change is checked (a known collection the
caller may write, an id of 1–200 characters, a JSON object body nested at most 100 deep and at most `MAX_RECORD_BYTES`
of JSON; `seen` and `conceptReads` use the id `ledger` and `plans` the id `today`; a user's `attempts`, `cards`,
`completions` and `plans` that name a `playerId` must name the user). Refused changes come back in `rejected` with a
reason. A user's records merge with `mergeUserRecord` (ledgers as unions, review cards by history, answers and
attempts never change once written; the rest last-writer-wins); team records are last-writer-wins. Storing what is
already there changes nothing; any other change takes the store's next revision (one counter per user and per team).
A delete (`body: null`) keeps a tombstone so other devices learn about it. The response's `cursor` is the store's
highest revision after the changes.

`GET .../records?cursor=` returns the records with a revision above `cursor`, oldest first, at most 500 (a page also
ends early at about 4 MB), with `body: null` for deleted ones and `more: true` when more are waiting; `cursor` in the
response is the last revision included (or the request's cursor when there are none). Team records also carry `by`,
the user who wrote that version.

`GET /api/me/export` answers (as an attachment, `rebound-<name>.json`):
`{ format: "rebound-account", version: 1, exportedAt, user, team: { id, name, level, role } | null,
records: { [collection]: { [id]: body } } }` (deleted records left out).

### Team games and answers

When a team's `games` record is stored with `status: "finished"` and no `online: true`, the team turns it into
outcomes with `gameOutcomes` (src/core/games.ts), using its members' copied subjects, and writes each member's
outcomes to that member's `answers` (record id = the outcome's `key`, fixed by the game, so a game saved again gives
the same answers; server writes replace what is stored). Players who are not on the team get nothing: a game cannot
write into other people's accounts. The answers are delivered before the records response returns; a delivery that
fails is retried from the team's alarm.

A player's devices turn new answers into review cards (`settings.cardsCursor` marks how far they have gone).

## Rooms

A room is its own Durable Object, made by any signed-in user (`POST /api/rooms`) and joined by anyone signed in who
has its link. It is listed for the creator's team, if any (`GET /api/rooms`: at most 20 open rooms per team; a
person may open 30 rooms per UTC day). A room closes 6 hours after everyone has left, and its data is deleted.

`GET /api/rooms` answers `{ rooms: [{ roomId, name, host: { userId, name }, players, createdAt, kind:
"reader"|"match", match?: { format, status } }] }`, newest first; `players` counts the people connected now, not
counting a reader (in a match room the host plays too). Rooms of people who have left the team drop off the list.

A reader room is a live game hosted by one user (the reader). The reader's browser runs the rules engine and the
clocks, exactly as in the in-person Reader console; the server relays the reader's view to the players, decides who
buzzed first, and carries each side's private channel. Room members are users: a member's `memberId` and `playerId`
are both their user id, and their name comes from their account (at each connection).

Connect with `GET /api/rooms/:id/ws?token=<session token>`; the server checks the session before accepting the
upgrade. Messages are JSON objects with a `type`. Server time is the room object's `Date.now()`.

### Server → client

| type | fields | when |
|---|---|---|
| `welcome` | `you: { memberId, name, playerId }`, `room: { roomId, name, kind, hostId, members, state, seq, buzz }`, `serverTime` | after connecting |
| `pong` | `t` (echoed), `serverTime` | reply to `ping` |
| `ping` | `t` (server time) | after `welcome` and after a client's ping (at most once a second); the client answers `{ type: "pong", t }` at once, which is how the server measures the round trip |
| `members` | `members: { memberId, name, playerId, side: "A"\|"B"\|null, captain: boolean, connected: boolean }[]`, `hostId` | anyone joins, leaves or changes side |
| `state` | `state` (the reader's last published view, any JSON up to 64 KB), `seq` | the reader publishes |
| `buzz` | `buzz: { open: boolean, sides: { A: boolean, B: boolean }, winner: null \| { memberId, playerId, side, pressedAt } }` | buzzers open, close or someone wins |
| `chat` | `from: { memberId, name }`, `side`, `text`, `at` | a teammate writes in the team channel |
| `answer` | `from: { memberId, name }`, `side`, `text`, `at` | a side's captain submits an answer (to the reader and that side) |
| `error` | `message` | a refused message (the connection stays open) |

The room lists its host from the start (not connected until they join). The server closes a connection with code
4001 when its session signs out or its account is deleted, and 4004 when the room has closed; clients should not
reconnect after those.

### Client → server

| type | fields | who |
|---|---|---|
| `ping` | `t` (client clock) | anyone; clients ping every few seconds |
| `side` | `side: "A"\|"B"\|null` | a player choosing a side (the reader can override with `assign`) |
| `buzz` | – | a player |
| `chat` | `text` (≤ 500 characters, at most 5 a second) | a player; delivered only to the same side |
| `answer` | `text` (≤ 200 characters) | a side's captain; delivered to the reader and that side |
| `publish` | `state` (≤ 64 KB) | the reader; stored and relayed to everyone as `state` |
| `open` | `sides: { A: boolean, B: boolean }` | the reader: open buzzers for those sides |
| `close` | – | the reader |
| `assign` | `memberId`, `side`, `captain?` | the reader |
| `handover` | `memberId` | the reader: make someone else the reader |

### Fair buzzing

- Each connection keeps a smoothed round-trip time from the server's own pings (exponentially weighted with
  weight 0.25, starting from the first sample; samples above 3 seconds are ignored). A client that never answers
  gets no correction. A client that delays its answers on purpose can gain up to 1.5 seconds: latency
  correction always trusts the client a little.
- A `buzz` from an eligible player (buzzers open, their side open, not already buzzed in this window) is
  stamped `pressedAt = receivedAt − rtt / 2`.
- The first buzz in a window starts a 150 ms collection period. At its end the earliest `pressedAt` wins;
  ties go to the earlier arrival. The server closes the buzzers and sends `buzz` with the winner to everyone.
- The reader judges and, for a rebound, opens buzzers again for the other side only.
- Clients use `pong` to estimate their clock offset, so the text reveal (`state` carries the reading's start
  time in server time and the reading speed) lines up on every screen.
- Timers (the collection window, the match's next step) live in memory; an alarm backs them up, so a room evicted
  mid-window still decides it.

### Match rooms (online matches with no reader)

A room created with `match` has no reader: the server runs the game itself (`server/src/match.ts`). The host
(the user who created it) plays like anyone else and also starts, pauses and ends it. Anyone signed in can play.
`match` is `{ format: "teams"|"ffa", presetId, wpm, teamNames?, packet: { setId, setTitle, roundId, roundLabel,
sourceUrl? }, pairs: { tossup, bonus? }[], tossupCount? }`, with each question's `id, subject, format, stem,
choices?, answerLetter?, answer, accept, reject, answerRaw, figure` (at most 40 pairs; free-for-all games use
toss-ups only). The server keeps the questions and sends a question's text only when its reading starts, and its
answer only when it is over or a close call is being decided.

- **teams**: two sides under the rules preset, through the shared rules engine: interrupts and re-reads,
  rebounds, the game clock and halftime. A side's captain (the one chosen in the lobby, or its first player) types
  the bonus answer after the side confers in its channel; if the captain is not connected, any teammate may.
- **ffa**: everyone for themselves, toss-ups only: +4 for a right answer, −4 for a wrong interrupt, 0 for a wrong
  answer after the reading. One buzz each per toss-up; after a wrong interrupt the reading goes on, after a wrong
  answer at the end a new 5-second window opens for the others.
- **Timing**: each question's label shows 2 seconds before its reading starts; the buzzers open with the reading.
  A player who wins the buzz has 8 seconds to type an answer (then it is a stall); a captain has the bonus time
  (20 seconds, or 30 for a visual bonus) plus 5 seconds to finish typing. The answer stays up 4 seconds before the
  next question; halftime lasts a minute unless the host starts the second half sooner.
- **Judging**: the answer checker (`src/core/judge/`). Its close calls ("review") go to the opponents: anyone on
  the other side, or in a free-for-all anyone else, sends `ruling`; no ruling within 10 seconds, or nobody there to
  rule, counts as accepted. Everyone has then seen the answer, so a rejected close call ends the toss-up.
- **Results**: at the end, every player's outcomes go to their account's `answers`: a team match's from its game
  record (id `g-online-<roomId>`, `online: true`) through `gameOutcomes`, as for a Reader console game; a
  free-for-all's judged answers as outcomes with key `match:<roomId>:<questionId>` and `via: "game"`. When every
  player of a team match is on the host's team, the game record is also stored in that team's `games` (by the
  host). Devices do not record match results themselves: `match_over` goes out once the answers have been written
  (or their first try failed; failed deliveries are retried from the room's alarm), so a device that refreshes its
  player's records then finds them.
- **Pausing**: the host can pause before the next question; a match also pauses there when every player has left.

Extra messages in match rooms (`publish`, `open` and `close` are refused there; `answer` goes to the server, not
to a reader):

| direction | type | fields | who / when |
|---|---|---|---|
| client → server | `start`, `pause`, `resume`, `end` | – | the host (`resume` also starts the second half at halftime) |
| client → server | `answer` | `text` (≤ 200 characters) | the player who won the buzz, or the bonus side's captain |
| client → server | `ruling` | `accept: boolean` | an opponent, during a close call |
| server → client | `state` | the match's view: `label`, `text`, `reading { startedAt, wpm, pausedAt? }`, `window`, `scores`, `status`, `answer`, `match { format, status, paused, answering, review, standings, clock, previous, gameId }` | whenever it changes |
| server → client | `result` | `result: { memberId, playerId, questionId, subject, kind, correct, interrupt, latencyMs, t }` | each judged free-for-all answer (for display; the server records it) |
| server → client | `match_over` | `format`, `game` (the team match's game record, or null), `heard` (question ids), `players` | once, at the end, after the answers were written |

## AI help (optional)

Off unless the Worker has an `ANTHROPIC_API_KEY` secret; then `GET /api/ai` says `enabled: true` and the site shows
"Draft from a passage (AI)" in Write and on concept cards, and "Explain this answer (AI)" under answers. The
server calls the Claude API (model `AI_MODEL`, default `claude-opus-5-5`) with a structured-output schema and,
for models that have one, the server-side refusal fallback. Questions are written for the level of the user's team
(high school without one).

- **Drafts** (`/api/ai/draft`): `passage` is 200 to 12,000 characters the user pasted, `source` names it (book and
  section, or web page), `subject` is a core subject id. Each draft is `{ kind, format, stem, choices?,
  answerLetter?, answer, accept, support }` (`support` quotes the passage), and a second call answers each draft
  without its key or the passage: `blindAnswer` is what it said and `blindAgreed` whether the answer checker
  accepts it for the key. The site saves drafts as written questions labeled with `ai`; they go through the same
  checks and review as any question, and packets mark them "AI-drafted (internal practice only)". Users should
  paste only text whose terms allow it, such as public-domain U.S. government pages; the server refuses passages it
  can tell come from OpenStax, whose license does not allow putting its books into AI tools.
- **Explanations** (`/api/ai/explain`): at most 120 words; `answerLooksWrong` flags a key the model disputes. Cached
  for the user for 180 days by model and question text (`cached: true` costs nothing).
- **Limits**: each user may make `AI_DAILY_LIMIT` model calls per UTC day (default 50). A draft request costs one
  call plus one per draft for the blind check, and is refused whole (429 with `Retry-After`) if it would pass the
  limit. Calls that never reached the model (the service was busy, the key failed) are not counted; a refusal
  (422) is.

## Storage (SQLite in each Durable Object)

```
Directory   meta(key, value)                                   -- the salt for hashed network addresses
            emails(email PRIMARY KEY, user_id)                 -- one account per address
            google(sub PRIMARY KEY, user_id)
            codes(code_hash PRIMARY KEY, email, expires_at)    -- email sign-in codes, kept 15 minutes
            sends(at, email_key, address_key, code_hash)       -- the email limits (salted hashes; today and the last hour)
            signups(day, address_key, count)                   -- new accounts per network address, today only
UserServer  meta(key, value)                                   -- profile (JSON), teamId, team (the summary /api/me shows)
            sessions(token_hash PRIMARY KEY, created_at, last_used)
            records(c, id, body, rev, by)                      -- index on rev; body NULL = deleted
            room_visits(room_id, sid, at)                      -- rooms a session joined in the last 7 days
            rooms_made(day, count)
            ai_usage(day, count), ai_cache(key, value, created_at)   -- created on first AI use
Team        meta(key, value)                                   -- teamId, name, level, nextEvent, createdAt, joinSecret
            members(user_id PRIMARY KEY, name, role, squad, primary_subject, secondary_subject, grad_year, joined_at, last_seen)
            records(c, id, body, rev, by)
            rooms(room_id PRIMARY KEY, host_id, created_at)    -- rooms its members opened
            outbox(id, kind, target, payload, tries, next_at)  -- answers still to deliver
RoomServer  room(id, name, host_id, created_at, last_active, state, seq, buzz)
            members(user_id PRIMARY KEY, name, team_id, primary_subject, secondary_subject, side, captain, joined_at)
            match(one, data, due_at)                           -- an online match: its state and its next deadline
            results(n, user_id, result)                        -- a free-for-all's judged answers
            outbox(id, kind, target, payload, tries, next_at)  -- answers and the team game still to deliver
Registry    meta(key, value), creations(day, address, count)
```

The `v3` migration in `wrangler.toml` deletes the old per-team `TeamServer` class and all its data (accounts start
fresh; nothing is migrated).

## Code layout and running it

```
server/
  package.json         wrangler, @cloudflare/vitest-plugin, vitest, typescript
  wrangler.toml        Worker "rebound-server", the Durable Object bindings and migrations, vars
  src/index.ts         the Worker: CORS, routing, sessions, sign-in, making and listing rooms
  src/auth.ts          Google ID token checks (Google's keys, cached) and email links through Resend
  src/directory.ts     Directory: email and Google account → user, email codes, sign-in limits
  src/user.ts          UserServer: profile, sessions, the user's records, team changes, AI routes
  src/team.ts          Team: settings, members, team records, game answers, the team's room list
  src/room.ts          RoomServer: one live room: messages, fair buzzing, team channel, online matches
  src/match.ts         online matches with no reader: the match director (teams and free-for-all), pure and tested
  src/records.ts       records: change checks, revisions, pages
  src/outbox.ts        deliveries to other objects, retried from alarms
  src/ai.ts            optional AI help: Claude API calls, input checks, daily limit, explanation cache
  src/registry.ts      Registry: daily caps on new teams (open sign-up)
  src/http.ts          JSON responses, errors, bodies, the caller's identity on forwarded requests
  src/validate.ts      input checks; src/crypto.ts ids, secrets and hashes; src/objects.ts stubs
  test/*.test.ts       end-to-end tests in the Workers runtime (vitest-pool-workers)
```

```bash
cd server
npm install
npm test                # runs the Worker and Durable Objects locally in workerd
npx wrangler dev        # local server on http://localhost:8787 (copy .dev.vars.example to .dev.vars first)
npx wrangler deploy     # needs CLOUDFLARE_API_TOKEN (Account → Workers Scripts: Edit; see server/README.md)
```

`ALLOWED_ORIGINS`, `SITE_URL`, `GOOGLE_CLIENT_ID`, `EMAIL_FROM`, `EMAIL_DAILY_LIMIT` and `AI_DAILY_LIMIT` are set in
`wrangler.toml` under `[vars]`; `RESEND_API_KEY` and `ANTHROPIC_API_KEY` are secrets.
