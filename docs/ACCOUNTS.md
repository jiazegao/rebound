# Accounts, teams as clans, cloud-only data

Design for replacing Rebound's local-first data and PIN sign-in with accounts. Decisions (November 2026):

- **Everything lives in the cloud.** Nothing about a player is stored on the device: no IndexedDB, no backup
  files to restore, no offline practice. The site keeps only a session token. Public question files are still
  cached by the service worker for speed.
- **Accounts.** Everyone signs in with Google or with a one-time email link (no passwords). Sign-up requires
  confirming the person is 13 or older (COPPA; personal Google accounts also start at 13).
- **Practice belongs to the player.** Answers, review cards, plans, the "seen" ledger and stats belong to the
  account and travel with it.
- **Teams are clans.** A player belongs to at most one team at a time; joining another leaves the old one, and
  the player's history goes along. Everyone on the team sees teammates' stats (game results, accuracy, practice
  activity); a player's review queue and daily plan stay private.
- **Online games are open to any signed-in player** with the link, whatever their team. Results go to each
  player's account.
- **Start fresh.** Existing local data and the old team server data are not migrated (devices can still download
  a backup file from the current version before the switch).

## Identity and sign-in

A user: `{ id, email, name, createdAt, over13At, primarySubject?, secondarySubject?, gradYear?, settings }`.
`id` is 16 lowercase base32 characters. `email` is lowercased and unique. Settings: `{ sound, readingWpm,
answerTimer, dailyMinutes }`.

Session tokens are `<userId>.<secret>` (secret: 32 random bytes, base64url). Only the SHA-256 of the secret is
stored, in the user's own storage. Sessions unused for 180 days expire. Clients send
`Authorization: Bearer <token>`, or `?token=` on WebSockets.

**Google.** The site shows Google's "Sign in with Google" button (Google Identity Services, loaded from
accounts.google.com) and receives an ID token (a JWT). `POST /api/auth/google { credential, over13?, name? }`:
the server checks the RS256 signature against Google's published keys
(`https://www.googleapis.com/oauth2/v3/certs`, cached), `aud` = `GOOGLE_CLIENT_ID`, `iss` = `accounts.google.com`
or `https://accounts.google.com`, `exp` in the future, `email_verified` true. It finds the user by Google `sub`,
else by email, else creates one. No client secret is needed.

**Email link.** `POST /api/auth/email/start { email }` creates a one-time code (32 random bytes; its hash kept
15 minutes) and emails a link `<SITE_URL>#/signin?code=<code>` through Resend (`RESEND_API_KEY` secret,
`EMAIL_FROM` var). It always answers `{ ok: true }`, so it never reveals whether an account exists.
`POST /api/auth/email/finish { code, over13?, name? }` uses the code once and signs in.

**New accounts.** Either finish call creates the account only with `over13: true` and a name (1–40 characters);
otherwise it answers 403 `{ error, needsSignup: true, email }` and the site asks for the name and the
confirmation, then repeats the call (the Google credential or the email code is still valid for that retry: an
email code stays usable for 15 minutes until an account is made with it).

**Limits.** Email links: 3 per address per 15 minutes, 10 per network address per hour, `EMAIL_DAILY_LIMIT` per
day in all (default 90, under Resend's free 100). New accounts: 20 per network address per day.

**Development only.** With `DEV_EMAIL_OUTBOX = "1"` (set in `server/.dev.vars` or the test config, never in
`wrangler.toml`), `email/start` also returns `{ devCode }` and sends nothing, so tests and local runs can sign in.

`GET /api/auth/config` → `{ google: { clientId } | null, email: boolean }` tells the site which methods are on.

## Who owns what

User collections (in the user's storage; written only by the user, plus the server for game answers):

| collection | id | body | teammates see it |
|---|---|---|---|
| `attempts` | attempt id | `SoloAttempt` (a practice answer) | yes |
| `answers` | `game:<gameId>:<pair>:<t\|dead\|b>:<time>` (a Reader console game or a team match: the question's place in the packet, a toss-up, a dead toss-up or a bonus, and when it was judged) or `match:<roomId>:<questionId>` (a free-for-all) | `Outcome` (src/core/review.ts) from a team game or an online match, written by the server | yes |
| `seen` | `ledger` | `{ [questionId]: ms }` (merged as a union) | yes |
| `conceptReads` | `ledger` | `{ [conceptId or "reading:<topic>"]: ms }` (merged as a union) | yes |
| `completions` | `<assignmentId>` | `Completion` | yes |
| `reports` | report id | `ProblemReport` | yes |
| `cards` | `<questionId>` | `ReviewCard` (merged like today's cards) | **no** |
| `plans` | `today` | `DayPlan` | **no** |

Team collections (in the team's storage): `lineups`, `assignments` (leaders write), `games`, `packets`,
`visuals`, `written`, `conceptCards` (members write; `canWriteTeam` in src/core/accounts.ts). The team's name,
level and next competition, and its members and their roles, are team settings with their own endpoints.

Player identity everywhere (`playerId` in attempts, games, lineups, cards...) is the user's id.

## Team games and answers

A game played in the Reader console belongs to the team. When a `games` record is written with
`status: "finished"`, the team server turns it into outcomes (`gameOutcomes`, src/lib/outcomes.ts, moved to
src/core) and stores each player's outcomes in that player's `answers` (ids fixed by the game, so a game saved
twice gives the same answers). A player's mastery and review cards come from their `attempts` and `answers`;
team stats come from the team's `games` and its members' `attempts`.

A player's device turns new answers into review cards when it next loads (a cursor in the user's settings marks
how far it has gone).

## Online matches and rooms

Rooms leave the team: each room is its own Durable Object (`RoomServer`), created by any signed-in user
(`POST /api/rooms { name, match? }`), joined by link (`GET /api/rooms/:id/ws?token=`). Match rooms work as today
(server/src/match.ts), with members being any signed-in users. At the end of a match:

- every player's outcomes are written to their `answers` (team matches and free-for-alls alike);
- a team match whose players are all on the host's team is also written to that team's `games`.

Reader rooms (a Reader console game played remotely) still relay the reader's view; players are matched to the
game's players by user id.

`GET /api/rooms?team=1` lists the open rooms created by members of the caller's team.

## Server

| Durable Object | key | holds |
|---|---|---|
| `Directory` | `"global"` | email → user, Google sub → user, email codes, sign-in rate limits |
| `UserServer` | user id | profile, sessions, user collections |
| `TeamServer` | team id | settings, members (with a copy of each member's name and subjects), join secret, team collections |
| `RoomServer` | room id | one room or match |
| `Registry` | `"global"` | daily caps on new teams (unchanged) |

The old `TeamServer` data is deleted by a migration (start fresh); the new team class is `Team`.

### API

All JSON; errors `{ error }`; the session as above. "member" = signed in and on that team; "leader" = coach or
captain.

| route | who | body → response |
|---|---|---|
| `GET /api/auth/config` | anyone | → `{ google, email }` |
| `POST /api/auth/google` | anyone | `{ credential, over13?, name? }` → `{ token, user }` |
| `POST /api/auth/email/start` | anyone | `{ email }` → `{ ok: true }` |
| `POST /api/auth/email/finish` | anyone | `{ code, over13?, name? }` → `{ token, user }` |
| `POST /api/auth/signout` | user | → `{ ok: true }` |
| `GET /api/me` | user | → `{ user, team: { id, name, level, role } \| null }` |
| `PATCH /api/me` | user | `{ name?, primarySubject?, secondarySubject?, gradYear?, settings? }` → `{ user }` |
| `DELETE /api/me` | user | leaves the team, deletes everything → `{ ok: true }` |
| `GET /api/me/records?cursor=` | user | → `{ cursor, records: [{ c, id, body, rev }], more }` |
| `POST /api/me/records` | user | `{ changes: [{ c, id, body \| null }] }` → `{ cursor, rejected }` |
| `GET /api/me/export` | user | → everything, as one JSON file |
| `POST /api/teams` | user | `{ name, level, leaveCurrent? }` → 201 `{ team, joinCode }` (the caller becomes captain) |
| `GET /api/teams/:id` | member | → `{ team: { id, name, level, nextEvent, createdAt }, members, you, joinCode? }` (`joinCode` for leaders: the team keeps its current invite secret so leaders can show the link again) |
| `PATCH /api/teams/:id` | leader | `{ name?, level?, nextEvent? }` (`nextEvent: null` clears it) → `{ team }` |
| `POST /api/teams/:id/join` | user | `{ secret, leaveCurrent? }` → `{ team }` |
| `POST /api/teams/:id/leave` | member | → `{ ok: true }` (the last member leaving deletes the team; the last leader must hand over first) |
| `PATCH /api/teams/:id/members/:userId` | leader (or the member, for their own subjects) | `{ role?, squad?, primarySubject?, secondarySubject?, gradYear? }` → `{ member }` |
| `DELETE /api/teams/:id/members/:userId` | leader | → `{ ok: true }` |
| `POST /api/teams/:id/join-code` | leader | → `{ joinCode }` |
| `DELETE /api/teams/:id` | leader | → `{ ok: true }` |
| `GET /api/teams/:id/records?cursor=` | member | team collections, as for `/api/me/records` |
| `POST /api/teams/:id/records` | member | `{ changes }` → `{ cursor, rejected }` |
| `GET /api/teams/:id/members/:userId/records` | member | that teammate's visible collections |
| `GET /api/rooms` | user | → `{ rooms }` (the caller's team's open rooms; query parameters are ignored) |
| `POST /api/rooms` | user | `{ name, match? }` → 201 `{ roomId }` |
| `GET /api/rooms/:id/ws?token=` | user | WebSocket (docs/SERVER.md, Rooms) |

A member: `{ userId, name, role: "coach"|"captain"|"member", squad?, primarySubject?, secondarySubject?,
gradYear?, joinedAt, lastSeen }`. Join codes: `<teamId>.<secret>`, as links `<site>#/join/<code>`.

Records responses list records with a revision above `cursor`, oldest first, at most 500, `body: null` for a
deleted record. A team's `GET /api/teams/:id/members/:userId/records` takes the same `cursor` and returns only
`TEAM_VISIBLE` collections. Types: src/core/accounts.ts.

Rooms: `GET /api/rooms` → `{ rooms: [{ roomId, name, host: { userId, name }, players, createdAt, kind:
"reader"|"match", match?: { format, status } }] }`. In a room, a member's `memberId` and `playerId` are both their
user id. WebSocket messages are otherwise as in docs/SERVER.md.

AI help moves from the team to the user: `GET /api/ai`, `POST /api/ai/draft`, `/api/ai/explain`, `/api/ai/card`
(signed in; bodies and answers as before), with `AI_DAILY_LIMIT` calls per user per day and the explanation cache
per user.

## Site

- **Store.** `AppData` stays the in-memory shape the pages use, filled from the server at sign-in (`/api/me`,
  `/api/me/records`, and the team's settings, members and records). Nothing is written to IndexedDB.
  `update(fn)` diffs the records it changed and sends them at once (user collections to `/api/me/records`, team
  collections to the team). If the server cannot be reached, the site shows "Not connected: your last change was
  not saved", keeps the unsent changes in memory and keeps trying (after 1 and 3 seconds, then every 10, and at
  once when the browser is back online); closing the tab before they are sent asks first, and loses them. Pages
  that need the account show "Not connected" until it has loaded. Team records and settings are refreshed every 30
  seconds while the page is visible.
- `players` = the team's members (or just the signed-in user, with no team); `settings.soloPlayerId` = the user.
  Teammates' visible collections load when a page needs them (Stats, Lineups, Team, scrimmage builder,
  Assignments).
- **Pages.** Sign in (Google button, email link, the 13+ confirmation and name for new accounts); Team (create or
  join, members and roles, invite link, leave; no roster to edit); Today, Review and Progress are the signed-in
  player's; Data becomes Account (download my data, delete my account). Public pages (Home, Try a round, Library,
  Rules) work without signing in and save nothing.
- **Removed.** IndexedDB storage, backup restore, PIN sign-in and team sharing, adding roster players, offline
  practice and "Save all questions for offline use".
