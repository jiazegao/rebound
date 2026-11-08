# Contributing to Rebound

Rebound is a free practice site for National Science Bowl teams, built by students. Fixes and features from
other teams are welcome. This page covers how to get set up and what a good change looks like; MAINTAINING.md
covers deploying and the yearly chores.

## Get set up

Node.js 22 (20 works), then:

```bash
npm ci
npm run dev                     # http://localhost:5173
npm test                        # unit tests
cd server && npm ci && npm test # the team server's tests, in the Workers runtime
```

README.md, "How the code is organised", is the map of the code. `docs/ACCOUNTS.md` describes accounts, teams and
the server's API, `docs/SERVER.md` rooms and online matches, and `docs/NSB-JSON.md` the question and game formats.
The public pages work with `npm run dev` alone; to sign in locally, run the server too (server/README.md, "Run and
test locally"): its development email outbox gives a **Sign in (development)** link instead of sending email.

## What a good change looks like

- **Pages talk to the store, not to the network.** A player's data lives on the server, and the site keeps it in
  memory while they are signed in (`src/lib/store.ts`). Pages read the store and change it with `update()`;
  `src/lib/cloud.ts` sends each change to the server (the player's own records to their account, the team's to the
  team). Public pages (Home, Try a round, Library, Rules) must keep working signed out.
- **Logic is pure and tested.** Rules, answer checking, scheduling, plans, drills and the writing studio's
  checks are plain functions in `src/core/` with tests next to them. Add a test with every behavior change,
  and a regression test with every bug fix.
- **Rules are data.** Every number the game engine uses comes from `src/core/rules/presets.ts`; cite the rule
  number in a comment when you change one.
- **Plain language.** Text on screen is short, concrete and kind to a nervous ninth grader: say what happened and
  what to do next. No jargon in error messages.
- **Accessible.** Real buttons and labels, keyboard shortcuts that do not trap focus, enough contrast in both
  themes, and no information carried by color alone.
- **Respect the data's owners.** DOE questions are public domain and credited on every round. Never commit
  community or invitational packets, or anything else you are not allowed to publish (keep it in
  `private-data/`, which git ignores). Photos must be public domain, with their source recorded.
- **Students' privacy.** No analytics, trackers, ads or third-party requests from the site, apart from Google's
  sign-in button. Accounts are for people 13 and older. The server keeps each account's email address (and Google
  account id), name, profile and settings, sign-in sessions (only their hashes) and practice, and each team's own
  records, nothing more. Teammates may see only what `TEAM_VISIBLE` in `src/core/accounts.ts` lists; review
  queues and daily plans stay private.

## Checks before a pull request

```bash
npm test
npm run build          # type-checks with tsc --noEmit, then builds (never run `tsc -b`: it writes .js files next to the sources)
```

For changes you can see, also run the browser smoke test (`node e2e/smoke.cjs` against a local server and
`npx vite preview --port 4173`; see `e2e/accounts.cjs` and the file's header), and attach a screenshot to the pull
request. For server changes, `cd server && npm test`.
The **Test** workflow runs the unit tests, the build and the server tests on every pull request.

## Changes that need the server deployed first

A change to the account contract (`src/core/accounts.ts`), to the game helpers the server uses
(`src/core/games.ts`), to `server/`, or a new route the site calls must reach the server before the site: see
MAINTAINING.md, "Ship a change". Say so in the pull request.

## Reporting a wrong answer or a broken question

Use the "Report a problem" link on the question in the Library, or open an issue with the question's id (for
example `doe-hs-17-r01-t05`), what the PDF says and what Rebound shows.
