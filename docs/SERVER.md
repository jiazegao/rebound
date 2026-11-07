# Rebound team server

The website is static (GitHub Pages) and works on its own, one device at a time. The team server adds two
things that need a shared place:

1. **Shared team data.** The roster, games, answers, review cards, plans, lineups, assignments, packets and
   concept cards sync between the practice laptop and every player's phone or Chromebook.
2. **Remote rooms.** Live games with players on their own devices: server-timed buzzing, the question text
   revealed in step on every screen, a private team channel during bonuses, and a captain's answer box.

It runs on Cloudflare: one Worker (HTTP and WebSocket routing) and one Durable Object per team, which stores the
team's data in its built-in SQLite database and hosts the team's rooms. The free plan is enough for a team.

## Principles

- **The site never depends on the server.** Without a connection (or before a team connects) everything
  works locally, as in Phase 0 and 1. Sync catches up later.
- **Team-private.** Every request except creating a team and joining one needs a member session. One team's
  Durable Object never reads another's data. No public rooms, no listings, no analytics.
- **Minimal personal data.** Display names and a PIN (stored only as a salted hash). No emails, no passwords to
  reset, no IP logging beyond Cloudflare's own.
- **Shared rules.** `src/core/sync.ts` (collections, merges, permissions) is imported by both the site and the
  server, so they cannot disagree.

## Identity

- A **team** has a random id (16 characters, base32 lowercase) and a **join secret** (12 characters, base32,
  stored hashed). The **join code** is `<teamId>.<secret>`; the site shows it as a link
  `https://<site>/#/join/<joinCode>` for the captain to post in the team's chat.
- A **member** has a display name (unique in the team, case-insensitive, 1–40 characters), a role (`coach`,
  `captain` or `member`), an optional roster player id (`playerId`, matching a record in the `players`
  collection; one member per roster player) and a PIN (4–8 digits, PBKDF2-SHA256 with a 16-byte random salt).
  A 4–8 digit PIN is weak against anyone holding its hash however many rounds there are, so the defenses are
  that hashes never leave the team's Durable Object and the lockout below; 20,000 rounds keep sign-in well
  inside the Workers free plan's CPU limit. Each hash records its round count, so this can change later.
- Signing in on a new device: the join code, the member's name and PIN. Five wrong PINs lock that member out
  for 15 minutes.
- Linking to the roster: a new member whose name matches exactly one active roster player who is not linked yet
  is linked to that player. A member who is not linked can link to a free roster player by signing in with
  `playerId` ("Which player are you?" after joining). Changing an existing link is for leaders.
- A **session token** is 32 random bytes (base64url) sent as `Authorization: Bearer <token>`. The server stores
  only its SHA-256. Sessions last until the member signs out or is removed; unused sessions expire after 180 days.
- The member who creates the team is its `captain`. Leaders (coach, captain) can change roles, link members
  to roster players, remove members (which ends their sessions) and rotate the join secret.

## HTTP API

All bodies are JSON. Errors are `{ "error": "<plain-language message>" }` with a 4xx or 5xx status. Every
response carries CORS headers for the origins in the `ALLOWED_ORIGINS` variable (comma-separated, for example
`https://jiazegao.github.io,http://localhost:5173,http://localhost:4173`); other origins get no CORS headers.

| Method and path | Who | Body → response |
|---|---|---|
| `GET /api/health` | anyone | → `{ ok: true }` |
| `POST /api/teams` | anyone | `{ teamName, level: "HS"\|"MS", memberName, pin, playerId? }` → 201 `{ teamId, joinCode, token, member }` |
| `POST /api/teams/:teamId/join` | anyone with the secret | `{ secret, memberName, pin, playerId? }` → `{ token, member, teamName }`. An existing name signs in (PIN checked); a new name creates a `member`. |
| `GET /api/teams/:teamId/me` | member | → `{ member, teamName }` |
| `POST /api/teams/:teamId/signout` | member | → `{ ok: true }` (ends this session) |
| `POST /api/teams/:teamId/pin` | member | `{ pin, newPin }` → `{ ok: true }` |
| `POST /api/teams/:teamId/sync` | member | `SyncRequest` → `SyncResponse` (see below) |
| `GET /api/teams/:teamId/members` | leader | → `{ members: MemberInfo & { name, lastSeen }[] }` |
| `PATCH /api/teams/:teamId/members/:memberId` | leader | `{ role?, playerId? }` → `{ member }` |
| `DELETE /api/teams/:teamId/members/:memberId` | leader | → `{ ok: true }` |
| `POST /api/teams/:teamId/join-code` | leader | → `{ joinCode }` (new secret; old links stop working) |
| `DELETE /api/teams/:teamId` | coach or captain | → `{ ok: true }` (deletes everything for the team) |
| `POST /api/teams/:teamId/rooms` | member | `{ name }` → 201 `{ roomId }` (the caller hosts it) |
| `GET /api/teams/:teamId/rooms` | member | → `{ rooms: { roomId, name, host: { memberId, name }, players, createdAt }[] }` (`players`: connected now, not counting the reader) |
| `GET /api/teams/:teamId/rooms/:roomId/ws?token=…` | member | WebSocket upgrade (see Rooms) |

`member` objects are `{ id, name, role, playerId }` (the `MemberInfo` type plus the name).

Limits: request bodies up to 2 MB; at most `SYNC_PAGE_SIZE` changes per sync request (more is a 413); record
bodies up to `MAX_RECORD_BYTES`; ids up to 200 characters; 30 failed joins per network address per hour (kept
per team); 200 members, 20 open rooms and 64 connections per room. Locks and limits answer 429 with
`Retry-After`. Requests from origins not in `ALLOWED_ORIGINS` get a 403. The last coach or captain cannot be
removed or demoted.

## Sync

The team's data is a set of records `(collection, id) → body`, with the collections and rules in
`src/core/sync.ts`. The server keeps one revision counter per team.

`POST /sync` with `{ cursor, changes }`:

1. For each change, in order: check the collection and sizes; load the stored record; check
   `canWrite(member, c, id, body, storedBody)` (refused changes go to `rejected`); compute
   `concurrent = stored exists && (baseRev === null || baseRev < stored.rev)`; compute
   `merged = mergeRecord(c, storedBody, body, concurrent)`. If `merged` equals the stored body, nothing changes.
   Otherwise the counter goes up by one and the record is stored with that revision and `by = member.id`.
   A delete stores `body = null` (a tombstone, kept so other devices learn about it).
2. Respond with every record whose revision is above `cursor`, oldest first, at most `SYNC_PAGE_SIZE`, plus
   `more: true` when there are more. `cursor` in the response is the last revision included (or the
   request's cursor when there are none). Records the device itself just pushed come back too, with their
   new revisions; that is how it learns them.

Steps 1 and 2 run inside one storage transaction, so a device never sees half a sync.

## Rooms

A room is a live game hosted by one member (the reader). The reader's browser runs the rules engine and
the clocks, exactly as in the in-person Reader console; the server relays the reader's view to the players,
decides who buzzed first, and carries the team channel. Rooms live in the team's Durable Object and close
after 6 hours with nobody connected.

Connect with `GET /api/teams/:teamId/rooms/:roomId/ws?token=<session token>` (browsers cannot set headers on
WebSockets, so the token goes in the query string; the server checks it before accepting the upgrade).
Messages are JSON objects with a `type`. Server time is the Durable Object's `Date.now()`.

### Server → client

| type | fields | when |
|---|---|---|
| `welcome` | `you: { memberId, name, playerId }`, `room: { roomId, name, hostId, members, state, seq, buzz }`, `serverTime` | after connecting |
| `pong` | `t` (echoed), `serverTime` | reply to `ping` |
| `ping` | `t` (server time) | after `welcome` and after a client's ping (at most once a second); the client answers `{ type: "pong", t }` at once, which is how the server measures the round trip |
| `members` | `members: { memberId, name, playerId, side: "A"\|"B"\|null, captain: boolean, connected: boolean }[]`, `hostId` | anyone joins, leaves or changes side |
| `state` | `state` (the reader's last published view, any JSON up to 64 KB), `seq` | the reader publishes |
| `buzz` | `buzz: { open: boolean, sides: { A: boolean, B: boolean }, winner: null \| { memberId, playerId, side, pressedAt } }` | buzzers open, close or someone wins |
| `chat` | `from: { memberId, name }`, `side`, `text`, `at` | a teammate writes in the team channel |
| `answer` | `from: { memberId, name }`, `side`, `text`, `at` | a side's captain submits an answer (to the reader and that side) |
| `error` | `message` | a refused message (the connection stays open) |

The server closes a connection with code 4001 when the session ends, 4003 when the member is removed, and 4004
when the room closes or the team is deleted; clients should not reconnect after those.

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

## Storage (SQLite in the Durable Object)

```
meta(key TEXT PRIMARY KEY, value TEXT)            -- teamName, level, joinSecretHash, rev, createdAt
members(id TEXT PRIMARY KEY, name TEXT, name_key TEXT UNIQUE, role TEXT, player_id TEXT,
        pin_hash TEXT, pin_salt TEXT, failed INTEGER, locked_until INTEGER, created_at INTEGER, last_seen INTEGER)
sessions(token_hash TEXT PRIMARY KEY, member_id TEXT, created_at INTEGER, last_used INTEGER)
records(c TEXT, id TEXT, body TEXT, rev INTEGER, by TEXT, PRIMARY KEY (c, id))   -- index on rev
rooms(id TEXT PRIMARY KEY, name TEXT, host_id TEXT, created_at INTEGER, last_active INTEGER, state TEXT, seq INTEGER)
```

## Code layout and running it

```
server/
  package.json         wrangler, @cloudflare/vitest-plugin, vitest, typescript
  wrangler.toml        Worker "rebound-server", Durable Object binding TEAM (class TeamServer, SQLite)
  src/index.ts         routing, CORS, team creation (a new Durable Object per team)
  src/team.ts          the TeamServer Durable Object: members, sessions, sync, rooms
  src/crypto.ts        ids, tokens, PIN hashing, constant-time comparison
  test/*.test.ts       end-to-end tests in the Workers runtime (vitest-pool-workers)
```

```bash
cd server
npm install
npm test                # runs the Worker and Durable Object locally in workerd
npx wrangler dev        # local server on http://localhost:8787
npx wrangler deploy     # needs CLOUDFLARE_API_TOKEN (Workers Scripts: Edit, Durable Objects: Edit)
```

`ALLOWED_ORIGINS` is set in `wrangler.toml` under `[vars]`.
