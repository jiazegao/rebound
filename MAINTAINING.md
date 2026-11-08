# Maintaining Rebound

For whoever looks after Rebound: what runs where, how to ship a change, the chores that come back every year,
and how to hand the project to the next captain. Written so a second maintainer can deploy a change without
help. If a step here is wrong or missing, fix this file in the same pull request.

## What runs where

| Piece | Where | How it gets there |
|---|---|---|
| The website | GitHub Pages: https://jiazegao.github.io/rebound/ | Automatically: every push to `main` runs `.github/workflows/deploy.yml` (tests, build, publish), about two minutes |
| The server (sign-in, accounts, teams, rooms and matches, AI help) | Cloudflare Workers: https://rebound-server.hanjian.workers.dev | By hand: Actions → **Deploy team server** → Run workflow (or `npx wrangler deploy` in `server/`) |
| DOE questions, tags, fingerprints, photos | `public/data/` in the repository | Built by the scripts in `scripts/`, reviewed, committed |
| Players' and teams' data | The server's Durable Objects: one per account, one per team, one per room (nothing is kept on devices) | Nothing to deploy |
| "Sign in with Google" | An OAuth client in a Google Cloud project; its client id is `GOOGLE_CLIENT_ID` in `server/wrangler.toml` | Set up once (server/README.md, "Google sign-in") |

The accounts behind it: the GitHub repository (`jiazegao/rebound`), the Cloudflare account that owns the
`hanjian.workers.dev` subdomain, the Google Cloud project that owns the OAuth client, and only if they are on, a
Resend account for email sign-in links and an Anthropic Console account that pays for the Claude API key.

All of Rebound's data lives in that Cloudflare account. It cannot be moved to another account: a Worker deployed
elsewhere starts empty (players can download their own data from the Account page, but there is no import).

## Ship a change

1. Make a branch, change the code, and run the checks:

   ```bash
   npm ci
   npm test            # unit tests
   npm run build       # type-check and build
   ```

   For a change you can see in the browser, also run the browser tests: a local server
   (`cd server && cp .dev.vars.example .dev.vars && npx wrangler dev`), the site built without `VITE_SERVER_URL`
   (`npm run build && npx vite preview --port 4173`), then `node e2e/smoke.cjs` (see `e2e/accounts.cjs` and each
   file's header). For a server change, `cd server && npm ci && npm test`.
2. Open a pull request. The **Test** workflow runs the site's and the server's tests.
3. **If the change touches the server, or what the site sends it, deploy the server first** (step 4), then merge.
   That includes `server/`, the account contract in `src/core/accounts.ts` (a new collection, a change to what
   teammates see or who may write what, or a new record field the server checks), the game helpers in
   `src/core/games.ts` the server uses to score finished games, and new routes the site calls. The server refuses
   changes in collections it does not know, so a site that ships first loses those changes.
4. Deploy the server: Actions → **Deploy team server** → Run workflow. It runs the server tests, deploys with
   Wrangler and checks `/api/health`. Durable Object migrations in `server/wrangler.toml` (`[[migrations]]`) are
   applied by the deploy itself; never edit or remove an existing migration, only add a new tag.
5. Merge to `main`. The site deploys itself; check the live site once it is done (Actions → Deploy to GitHub Pages).

To undo: revert the commit on `main` for the site; for the server, `npx wrangler rollback` (in `server/`, with the
Cloudflare token in your shell) or deploy the previous commit.

## One-time setup for a new maintainer

- **GitHub:** be a collaborator with the Maintain or Admin role (Settings → Collaborators).
- **Cloudflare:** be a member of the Cloudflare account (Manage Account → Members), or ask its owner for an API
  token. Tokens come from My Profile → API Tokens → Create Token → the **Edit Cloudflare Workers** template.
- **Deploy secrets:** add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (Workers & Pages → Overview, right
  column) as repository secrets: Settings → Secrets and variables → Actions → New repository secret. The
  **Deploy team server** workflow reads them. To deploy from your own computer instead, set the same two
  variables in your shell and run `npx wrangler deploy` in `server/`.
- **Locally:** Node.js 22, then `npm ci` at the root and in `server/`.

## Secrets: what exists and where it lives

| Secret | Where it is kept | Used for |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub repository secrets (or your shell) | Deploying the server |
| `RESEND_API_KEY` (optional) | A Cloudflare Worker secret: `npx wrangler secret put RESEND_API_KEY` in `server/` | Email sign-in links (server/README.md, "Email sign-in"; also needs `EMAIL_FROM`) |
| `ANTHROPIC_API_KEY` (optional) | A Cloudflare Worker secret: `npx wrangler secret put ANTHROPIC_API_KEY` in `server/` | AI help (server/README.md, "Optional: AI help") |

The site itself has no secrets, and neither does Google sign-in (the client id is public; no client secret is
used). Never commit a secret, paste one into an issue, or put one in `wrangler.toml` (its `[vars]` are public). If one leaks, revoke it where it was made and create a new one.

## Question data

- **DOE sample sets.** `npm run data:fetch` and `npm run data:build` (high school), `npm run data:fetch:ms` and
  `npm run data:build:ms` (middle school). Fetching is polite (one request at a time, 3 s apart) and caches PDFs
  in `.cache/doe/pdf/`; building writes `public/data/doe/` and a report (`scripts/doe/REPORT.md`,
  `REPORT-MS.md`). Read the report's warnings before committing. Re-running a build on the same PDFs writes the
  same bytes. When DOE adds a sample set, fetch, build, read the report, run `npm test`, commit.
- **Duplicate fingerprints for Write.** After any change to the library, run `npm run data:fingerprints`; a test
  fails if `public/data/doe/fingerprints.json` is out of date.
- **Photos for visual bonuses.** `python3 -I scripts/visual/build-photos.py` (public-domain Wikimedia Commons
  files only; see the script's header).
- **Never commit** community or invitational packets, or anything else you are not allowed to publish. Keep
  them in `private-data/` (gitignored). Teams upload their own packets into their own team data instead.

## New rules each season (every fall)

DOE posts the next season's rules in the fall (the 2027 rules were dated October 4, 2026). The **Watch for new
NSB rules** workflow (`.github/workflows/rules-watch.yml`, Mondays from September to December) looks for the
next rulebook and opens an issue titled "Rules update for the 2028 season" (and so on) when it appears, or on
October 1 as a reminder if DOE's site refuses automated requests. The issue carries this checklist:

1. Read the new in-person and virtual rulebooks and list what changed: points, clocks and timing windows,
   tiebreakers, challenges, the answer conventions in Appendix A, and the subject categories.
2. In `src/core/rules/presets.ts`, add the new season's DOE presets (`doe-regional-2028`, `doe-virtual-2028`,
   `doe-finals-2028`, `doe-finals-visual-2028`) by copying the current ones and changing what changed, with
   the new rule numbers. Keep the old presets: saved games refer to them.
3. In the same file, set `CURRENT_SEASON`, `CURRENT_PRESET_IDS` and `CURRENT_RULES_URL` (add `RULES_2028_URL`)
   to the new season, and move the variant presets (`invitational-neg4`, `practice-untimed`) to the new season.
   Pages, scrimmages and the Reader console read these constants, so nothing else needs the year.
4. If the answer conventions changed, update `src/core/judge/` and its tests. If the categories changed,
   `src/core/importers/doeSubjects.ts` and the taxonomy.
5. Update the engine tests (`src/core/rules/engine.test.ts`) and `e2e/smoke.cjs` where numbers changed. Run
   `npm test`, the smoke test, and look at the Rules page and a game in the Reader console.
6. Merge to `main`. The site deploys itself; the server needs nothing for a rules change.

## Watching the server

- Live errors: `npx wrangler tail` in `server/` (with the Cloudflare token). Request logs are off on purpose
  (WebSocket URLs carry session tokens; see server/README.md).
- Usage: Cloudflare dashboard → Workers & Pages → rebound-server → Metrics. The Workers Free plan allows
  100,000 requests a day.
- Sign-up limits: 20 new accounts per network address per day (`server/src/directory.ts`), and 10 new teams per
  network address and 300 in all per day (`server/src/registry.ts`). A whole school signs up from one network
  address, so a big club can hit the account limit on its first day: they can finish the next day, or you can
  raise `NEW_ACCOUNTS_PER_NETWORK` (or `TEAMS_PER_ADDRESS_PER_DAY`) and redeploy.
- Email sign-in (if on): 3 links per address per 15 minutes, 10 per network address per hour, and
  `EMAIL_DAILY_LIMIT` in all per day (`server/wrangler.toml`, under Resend's free 100). Google sign-in has no limit.
- AI help (if on): the daily limit per player is `AI_DAILY_LIMIT` in `server/wrangler.toml`; spending shows in the
  Anthropic Console.

## Handing over to the next captain

- [ ] Add the next maintainer to the GitHub repository (Admin), or transfer the repository to them or to a
      school or club organization. If the repository moves, update the URLs in `README.md`, this file,
      `scripts/rules/watch.mjs` and `ALLOWED_ORIGINS` in `server/wrangler.toml` (the site's new address).
- [ ] Give them access to the Cloudflare account (Manage Account → Members). Don't move the Worker to another
      account: every player's account and every team lives in its Durable Objects, and a Worker deployed
      elsewhere starts empty. The site's server address (`VITE_SERVER_URL` in `.github/workflows/deploy.yml`)
      must keep pointing at the live server.
- [ ] Give them access to the Google Cloud project that owns the sign-in client (IAM → Grant access, the Owner
      role), so they can add origins (a new domain must be listed there) and keep the app's Audience
      *In production*. If the project cannot be shared, they make a new OAuth client and set its id as
      `GOOGLE_CLIENT_ID`; accounts keep working, because the server also finds people by their email address.
- [ ] Decide who pays for AI help, if it is on. The key belongs to whoever pays; the new owner sets their own
      with `npx wrangler secret put ANTHROPIC_API_KEY`.
- [ ] On your team, make the new captain a captain (Team → Members). The last leader cannot leave a team until
      someone else leads it.
- [ ] Walk through "Ship a change" together once: a small fix through a pull request, a server deploy with
      the workflow, a merge, and a look at the live site. Then let them do the next one alone.
- [ ] Hand over anything that is not in the repository (passwords to shared accounts, the team's private
      packets) in person, not in an issue.
