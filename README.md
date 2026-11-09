# Rebound

A free, team-first practice website for the National Science Bowl (NSB). This covers **Phases 0–4** of the plan in
[`docs/PROPOSAL.md`](docs/PROPOSAL.md): every practice is logged, every player opens **Today** to find a daily plan and a review queue
built from their own misses, and the captain runs the team from the **Team** pages (lineups, assignments, scrimmages). Players sign in
to an account, so their practice follows them to any device ([`docs/ACCOUNTS.md`](docs/ACCOUNTS.md)); there are remote rooms and online
matches, Finals preparation (visual bonuses, Finals formats, tiebreakers), a question-writing studio, reading paths, middle school mode,
and an open format ([NSB-JSON](docs/NSB-JSON.md)) for questions and games.
Any school's team can use it; [`MAINTAINING.md`](MAINTAINING.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md) are for whoever looks after it next.

Rebound is an unofficial study tool, not affiliated with or endorsed by the U.S. Department of Energy (DOE).

## What works today

| Page | What it does |
|---|---|
| **Home**, **Try a round**, **Library**, **Rules** | Public pages. Anyone can play a DOE round solo or browse the library without an account; signed out, nothing is saved. |
| **Sign in**, **Account** | Sign in with Google (Google Identity Services) or, where the server turns it on, a one-time link by email; no passwords. A new account asks for a name and the confirmation that the person is 13 or older. Account: name, subjects and graduation year, settings, your problem reports, **Download my data**, **Delete my account**, sign out. |
| **Today** | Each signed-in player gets a plan for 15, 30 or 45 minutes: due reviews (capped at a third of the time), a targeted drill on a weak, high-frequency topic in their primary subject, one in their secondary subject, and a mixed round. Every item says why it is there. The mix shifts toward timed mixed rounds in the last three weeks before the team's next competition (set on the Team page). |
| **Learn → Review** | At the top of Learn: what is due, and a button that starts the review. Timed review of misses, wrong interrupts, slow correct answers, toss-ups nobody got in your subject, and bonuses your team missed, from solo practice, Reader console games and online matches (the server writes each player's game answers to their account, and their device turns new answers into review cards when it next loads). Scheduled with FSRS ([ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)) in whole days; the grade comes from correctness and buzz time. New misses join a few a day (wrong interrupts and the player's own subjects first), and a question answered right after a month's gap is learned and leaves the queue, so the daily load stays steady. Cards pause while their question has an open problem report. |
| **Practice → Solo practice → drills** | Subject and topic drills drawn from the whole library (fresh questions first, aimed at a 70–85% expected success rate, from a few set files), an option to add Energy questions that test the subject, and balanced mixed toss-ups. A level filter follows the difficulty ladder: early regional (DOE rounds 1–10), late regional (rounds 11–17), and invitational or nationals-level from the team's uploaded packets. |
| **Practice → Solo practice → Visual lab** | Practice for the Finals' visual bonuses: a figure, the question read at the player's pace, then 30 seconds (the warning at 25) to begin the answer. Figures come from generators that draw graphs, circuits, diagrams and charts in all six subjects with exactly computed answers; from 70 public-domain photos (cloud genera, rocks, minerals, planets, moons, galaxy types, volcano types, animal phyla, bacteria shapes, energy technologies); and from the team's own visual questions (a picture shrunk in the browser, shared with every member, importable and exportable as JSON). |
| **Practice → Solo practice → Tiebreakers** | The two tie formats: a 5 toss-up tiebreaker game in the Reader console (no bonuses, no clock, repeated while tied, Rule 6-4), a shootout drill on your own (five fully read toss-ups, +1 / −1 / 0, Rule 9-1), and a shootout console for three or more groups that says who advances and how a remaining tie is broken. |
| **My progress** | Mastery by subject and a topic map (difficulty-adjusted ratings from each player's first answers), buzz speed, the review queue and daily activity, each with a table view. Teammates can open each other's from Team stats (answers only: review queues stay private). |
| **Team → Lineups** | Estimated points per regional round for any four players, subject by subject (difficulty-adjusted results, buzz speed, overlapping knowledge, a reference opponent); the five best foursomes; a suggested alternate; saved lineups, one set for the next competition. |
| **Team** | Create a team (you become its captain) or join one with the invite link a coach or captain posts; a player is on one team at a time, and their own practice goes with them when they leave. Members with roles (coach, captain, member), sub-teams, subjects and graduation years (leaders edit anyone's, players their own subjects); the invite link (leaders; a new one stops the old); leave, or delete the team (leaders). Who covers what, and who takes over each subject next season; the team's best player in every topic, with gaps counted; the next competition and its lineup. |
| **Team → Write** | The question-writing studio. Write in DOE's format with checks as you type: four parallel choices with exactly one right (each other choice is run through the answer checker), answers in simplest form (Rule A-2), units the checker knows, a cited source, toss-up length, brackets and voice. It warns about near-duplicates of library questions (64-bit SimHash fingerprints of every library question) and of the team's own. The subject's owner, or a captain or coach, approves each question (never its author) or sends it back with a note; approved questions become team packets or download as Word or NSB-JSON. |
| **AI help (optional)** | Off unless the server has a Claude API key ([`server/README.md`](server/README.md)); for any signed-in player, with or without a team. Write → **Draft from a passage**: an AI model drafts questions from a passage a member pastes and cites, and a second call answers each draft without its key, so a wrong answer line shows. Under answers in drills and reviews, **Explain this answer**. On concept cards, **Draft from a passage**. Everything AI-made is labeled, needs a person's approval, and stays in the team's practice; each player has a daily limit. |
| **Team → Assignments** | Coaches and captains give drills, team packets, concept cards or clearing reviews, for chosen players with a due date; they show on each player's Today page and tick off when done; drills suggested from coverage gaps. |
| **Library → Team packets** | Scrimmages of questions nobody in the room has heard (balanced like a DOE round, at a chosen level of the difficulty ladder) for a format: a regional round, a Finals round, a Finals visual bonus round (a share of the bonuses replaced by visual bonuses in the same subject, spread through the round) or a tiebreaker drill; packets uploaded as PDF (parsed in the browser) or NSB-JSON, with a review screen and a difficulty level. Print (including a visual bonus worksheet for the players), download as Word (a moderator's copy or the players' copy, laid out like DOE's packets) or NSB-JSON, play in the Reader console or solo. Uploaded packets stay in the team's data. |
| **Learn → Concept cards** | Concept cards written by the team (summary, key facts, traps, sources), reviewed by a second player, next to the library questions that test each concept; concept drills; unread cards join the daily plan. **Reading paths**: each subject's topics in prerequisite order, each with what NSB asks about, free readings (OpenStax textbooks, U.S. agency pages) and a five-question check from DOE questions on the topic. |
| **Team stats** | Everyone on the team sees everyone's: the team's games plus each member's practice answers. Adds rebounds, net points per interrupt, small samples marked, and a week-by-week trend of practice games. |
| **Practice → Play online** | Any signed-in players (teammates, or anyone with the link) play each other from their own devices with no reader: a team match under the NSB rules (toss-ups, bonuses the captain answers after the side confers, the game clock) or an everyone-for-themselves toss-up game. The team server reveals each question at the same pace on every screen, or, read aloud, everyone hears it at the same moment and sees it only once it is over: in Rebound's own voice when the server has a Google Cloud Text-to-Speech key (each question recorded once and kept), otherwise in each device's own voice (a device with no voice shows the text instead; DOE's reading guides for math are said as written for moderators). It times the buzzers fairly and judges typed answers with the answer checker; close calls go to the opponents to accept or reject. Every player's answers go to their own account (and their review queue); a team match whose players are all on the host's team also counts in that team's Stats. |
| **Accounts and remote rooms** | Everything lives on Rebound's server ([`docs/ACCOUNTS.md`](docs/ACCOUNTS.md), [`docs/SERVER.md`](docs/SERVER.md)), open to any school's team: each player's practice with their account, the team's games and shared work with the team. Changes go up within a moment, and teammates' changes show up within 30 seconds. The Reader console can open a remote room: players buzz from their own devices (server-timed, with latency correction), see the question read aloud or revealed in step, confer in a private team channel during bonuses, and their captain answers in an answer box. |
| **Connection** | Practice needs a connection: nothing about a player is kept on the device. If a change cannot be saved, a banner says "Not connected: your last change was not saved" and Rebound keeps trying until it is. A service worker caches the site and the public question files so pages open quickly, and the site can be installed to a home screen. |
| **Practice → Reader console** | Run an in-person practice game from one laptop: question in large type, answer for the reader, 5 s / 20 s answer clocks, game clock, two-tap scoring under the **2027 rules** (interrupts, blurts, rebounds, double interrupts, halves, tiebreakers), undo, keyboard shortcuts. Every toss-up is logged. Presets for regionals, virtual events and the Finals: 10-minute halves, and visual bonus rounds with 12-minute halves and 30-second visual bonuses whose figure can be projected full screen (remote players see it on their own screens). |
| **Game summary**, **Stats** | Per-player toss-up accuracy by subject, interrupts, points given away, median buzz time, bonus conversion; CSV export, and the whole game as an NSB-JSON game log that other tools can re-score. |
| **Practice → Solo practice** | Questions appear letter by letter at a moderator's pace (the words-per-minute setting is converted to letters using the library's average word length, about 6 characters with the space); the word still appearing is shown fainter. Buzz with Space, start typing within 2 seconds (NSB's natural pause) and finish within 5, and the answer checker grades it (close calls go to "your call"). The answer timer can be switched off. |
| **Library** | Every DOE high school and middle school sample set, by set and round, the team's level first; searchable, printable, downloadable as Word or NSB-JSON, with links to the original PDFs and a "report a problem" button. Shows which questions the team has already heard, and lets a player add any question to their review queue. **Library → Topics** shows how often each topic comes up in each subject. |
| **Middle school mode** | Choose middle school when creating the team: drills, daily plans, scrimmages and the Learn pages then use DOE's 16 middle school sets and its middle school national sample rounds (nationals-level on the difficulty ladder). High school sets stay available for practicing up. Games follow the same 2027 rules; the rules page notes the one difference, how Finals round robin ties are broken (Rules 10-2 and 10-3). |
| **NSB rules at a glance** | Generated from the same rule presets the game engine uses. |
| **For coaches**, **For school IT staff**, **Privacy, terms and credits** | Setup guide, what is stored where, network needs (including Google's sign-in from accounts.google.com), the 13+ rule, credits. |

The library holds **23,720 questions**: 12,024 from all 17 DOE high school sample sets (257 rounds) and 11,696 from the
16 middle school sets plus DOE's middle school sample rounds from a national event (250 rounds). About 2.5% of the high
school questions and a similar share of the middle school ones, nearly all in the older sets, carry an import note (for
example, an equation that was an image in the PDF); the site says so and links to the original page, and solo practice
skips the few whose answers could not be read.

Each player's practice (answers, review queue, daily plan, heard questions, reads, finished assignments, problem reports)
is stored **with their account on Rebound's server**, and each team's shared work (games, lineups, assignments, packets,
written questions, concept cards, visual questions) **with the team** ([`docs/ACCOUNTS.md`](docs/ACCOUNTS.md)). The
browser keeps only the session token. Teammates see each other's stats; review queues and plans stay private. Any player
can download everything in their account, or delete it, from the Account page.

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

The public pages work on their own. Signing in needs Rebound's server: run it locally ([`server/README.md`](server/README.md);
with `DEV_EMAIL_OUTBOX = "1"` the sign-in page offers an email link and a **Sign in (development)** button, and no email is
sent), then either start the site with `VITE_SERVER_URL=http://localhost:8787 npm run dev` or enter the server's address on
the sign-in page.

Other commands:

```bash
npm test           # unit tests (rules engine, answer checker, review scheduler, plans, drills, tagging, importer, studio, NSB-JSON)
npm run build      # type-check and build the static site into dist/
npm run preview    # serve dist/ at http://localhost:4173
node e2e/smoke.cjs # browser walkthrough: a team of four accounts, each in its own browser (see below)
node e2e/team-server.cjs # joining by invite link, teammates' data, remote rooms and online matches, with outsiders
node e2e/speech.cjs # an online match read aloud: Rebound's voice (server started with --var DEV_TTS_FAKE:1), else device voices
node e2e/middle-school.cjs # a middle school team against the real library
npx tsx scripts/checks/judge-self-check.ts   # grade every printed answer in the library against itself
npx tsx scripts/checks/review-load.ts 30 0.6 # simulate 90 days of reviews for a 30-minute plan and a 60% player
cd server && npm test                        # the team server's tests, in the Workers runtime
```

The browser tests need Playwright with Chromium, a local server with the development email outbox
(`cd server && cp .dev.vars.example .dev.vars && npx wrangler dev`) and the site built without `VITE_SERVER_URL` and
served by `npx vite preview --port 4173`. They sign accounts up through the server's API (`e2e/accounts.cjs`), so
they never touch the real server.

The unit tests include a check that the answer checker accepts at least 99.9% of the 19,000+ printed answers and
alternatives in the DOE library (currently all but 2, both damaged in the source PDFs).

## Put it on the web

`npm run build` produces a static site in `dist/` (HTML, JS, CSS and JSON). It uses hash URLs (`/#/library`) and relative
paths, so it works from any static host or sub-folder with no server configuration.

**GitHub Pages (free):** push this folder to a GitHub repository, then in the repository's *Settings → Pages* choose
*GitHub Actions* as the source. The included workflow (`.github/workflows/deploy.yml`) tests, builds and publishes the site
on every push to `main`.

**Netlify or Cloudflare Pages (free tiers):** connect the repository, set the build command to `npm run build` and the
output folder to `dist`.

**The server.** Accounts, teams, practice and rooms live on Rebound's server in `server/`: a Cloudflare Worker with Durable
Objects for users, teams and rooms, which fits Cloudflare's free plan. [`server/README.md`](server/README.md)
covers testing it locally (no account needed), the API token and deploying it with Wrangler. The site finds the server
through `VITE_SERVER_URL` at build time; for the published site it belongs in the build step of
`.github/workflows/deploy.yml`. A build without it (such as `npm run build` on your own computer) asks for the server
address on the sign-in page instead, so local tests never touch the real server. A site hosted somewhere other than `https://jiazegao.github.io` must also be added to
`ALLOWED_ORIGINS` in `server/wrangler.toml`. Google sign-in uses the OAuth client id the server reports (`GOOGLE_CLIENT_ID`);
the site's origin must be listed under the client's *Authorized JavaScript origins* in Google Cloud Console, or Google's
button refuses to sign in.

Before giving members the link, go through the launch checklist in the proposal ([Section 12](docs/PROPOSAL.md)): a team- or club-owned
domain the coach can access, the privacy and credits pages, asking school IT to allow the domain (the site's
*For school IT staff* page explains what to allow), and a test on a school Chromebook on the school network.

## Question data

The DOE sample sets ship with the site as JSON in `public/data/doe/`: one file per set (`doe-hs-01.json`…,
`doe-ms-01.json`…, `doe-ms-finals.json`), `index.json` for both levels, and per level a catalog (`catalog.json`,
`catalog-ms.json`: one compact row per question, so drills can choose questions without downloading every set) and a
concept index (`concepts.json`, `concepts-ms.json`). `fingerprints.json` holds a SimHash fingerprint of every question
for the writing studio's duplicate search. They are U.S. Government works in the public domain; DOE's Office of Science
asks to be credited and linked, and every round keeps a link to its original PDF.

**Middle school categories.** Older middle school sets printed Physical Science, Life Science, Earth Science and General
Science. Life Science and Earth Science map to Biology and Earth and Space. Physical Science questions move to Physics
(1,184) or Chemistry (782) when the tagger's rules clearly agree (37 of 38 right on a hand-labelled check,
`scripts/doe/split-eval-ms.json`); the other 214 stay Physical Science, and General Science stays as printed. The printed
category is kept with every question. `scripts/doe/REPORT-MS.md` has the details, including two places where DOE
published the same questions twice.

**Visual bonuses.** DOE publishes no Finals visual bonuses, so the Visual lab has its own sources:

- **Generated figures** (`src/core/visual/`): 39 templates across the six subjects (circuits, lenses, motion graphs,
  periodic tables, organic structures, energy profiles, titration curves, moon phases, H–R diagrams, contour maps,
  rock layers, Punnett squares, pedigrees, food webs, Sankey diagrams, solar cell curves, geometry and graphs…) that
  draw an SVG figure and compute the answer exactly in NSB's simplest form. A question's id is its template and a seed, so it can be rebuilt anywhere; every template is tested
  over 80 seeds against the answer checker, and `npx tsx scripts/checks/visual-gallery.ts <dir>` renders them for a look.
  `src/core/visual/README.md` lists the rules a template follows.
- **Photos** (`public/data/visual/`): 70 public-domain photos in 10 groups (about 3 MB), from Wikimedia Commons and
  mostly from U.S. government agencies (NASA, NOAA, USGS, NPS, CDC), each with its author, licence and source page in
  `photos.json`. Each was checked by eye; answers without a clear public-domain example (nimbostratus, pumice,
  calcite…) are left out. `scripts/visual/build-photos.py` rebuilds the set
  from the curated list in `scripts/visual/photo-list.json` and refuses any file whose licence is not public domain.
- **The team's own** visual questions live in the team's data and are never published.

**Topics.** At build time, keyword rules in `src/core/tagging.ts` (no network, no AI) give each question a topic from
the 65 in `src/core/taxonomy.ts`. Questions in the most frequent topic or two of each subject also get up to three concepts
(139 concepts in all), and Energy questions get the discipline they really test. A question gets no topic rather than a
guess when the rules are unsure:

- **Coverage:** 96.9% of the 11,822 questions in the six core subjects.
- **Accuracy:** 85% on a 60-question sample drawn and hand-labelled after the rules were frozen. The rules score 91% on
  the 156-question sample used while writing them.
- **Known mistakes:** these are mostly boundary cases between neighbouring topics. They are listed in
  `scripts/doe/REPORT.md`, and the labels are in `scripts/doe/topic-eval.json`.
- **Keeping data in sync:** a test fails if the rules change without rebuilding the data.

To rebuild the data (for example when DOE posts a new set):

```bash
npm run data:fetch          # list the official PDFs and download missing ones into .cache/ (polite: ≥3 s between requests)
npm run data:build          # parse the cached PDFs into public/data/doe/ and write scripts/doe/REPORT.md
npm run data:fetch:ms       # the same for the middle school sets
npm run data:build:ms       # … and scripts/doe/REPORT-MS.md
npm run data:fingerprints   # then refresh the duplicate-search fingerprints (a test checks they match)
```

Only DOE-published sets belong in this folder. Community and invitational packets carry no open license: keep them
private to the team and never commit them (the `private-data/` folder is git-ignored for that purpose).

## How the code is organised

```
src/core/            framework-free logic, unit-tested
  schema.ts          shared data types for questions, sets, players, the catalog
  nsbjson.ts         NSB-JSON 1.0 (docs/NSB-JSON.md, schema/nsb-json.schema.json): writing and reading question sets,
                     question lists and game logs
  rules/presets.ts   rule presets (DOE Regional/Virtual/Finals 2027, invitational, practice) and the current season
  rules/engine.ts    event-sourced match engine: replay(events) → state; undo = drop last event
  judge/             answer checker: multiple choice rule, accept/reject lists, numbers, units, names
  importers/         DOE PDF → questions (text extraction + parser)
  taxonomy.ts        the subject map: 65 topics in the six 2027 subjects, with concepts
  tagging.ts         rule-based topic, concept and Energy cross-subject tagging, run at import
  review.ts          review cards on FSRS: cards from misses, timed grades, retention by season
  mastery.ts         learner model: difficulty-adjusted ratings per subject and topic, buzz speed
  plan.ts            the daily plan with "why this?" lines
  drill.ts           choosing drill questions from the catalog
  lineup.ts          the lineup model: expected points per round for any four players
  scrimmage.ts       scrimmage packets from questions nobody in the room has heard
  assignments.ts     assignment due dates, progress and suggestions from coverage gaps
  accounts.ts        the account contract (user and team collections, what teammates see, who writes what, merges, API
                     shapes), shared with the server
  games.ts           game records, practice answers and turning them into per-player outcomes, shared with the server
  merge.ts           merging two writes of a record (heard ledgers, review cards) and record fingerprints
  speech.ts          reading a question aloud: words for symbols, reading guides, phrases on the reading's timeline
  levels.ts          the difficulty ladder: DOE round levels and the levels of uploaded packets
  rules/shootout.ts  the round robin shootout (+1 / −1 / 0) and who advances
  visual/            generated visual bonuses: templates, SVG building blocks, exact answers, the photo-set questions
  studio.ts          the writing studio: checks on a draft, who may review, near-duplicates, packets from approved questions
  fingerprint.ts     SimHash fingerprints and word overlap for duplicate search
  readingPaths.ts    each subject's reading path: topics in prerequisite order, focus lines and free readings
src/lib/             browser-side helpers: the in-memory store (store.ts), the server's API (api.ts), sign-in and account
                     actions (account.ts), loading, sending and refreshing data (cloud.ts, with the record mapping in
                     records.ts), teammates' practice for team pages (teammates.ts), library loading, learning glue,
                     stats, router, sound, the service worker (offline.ts), the remote room client (room.ts), reading
                     aloud in online matches (recorded.ts: Rebound's voice; speech.ts: device voices), visual questions
                     (visuals.ts: generated, photo set and team-made; visualPool.ts; images.ts), Word export (docx.ts,
                     loaded only when someone downloads), AI help requests (ai.ts)
src/pages/           one file per page
src/components/      shared UI pieces
src/sw/              the service worker template (vite.config.ts fills in the file list at build time)
scripts/doe/         data fetch/build scripts and the validation reports (high school and middle school)
scripts/studio/      builds public/data/doe/fingerprints.json for the writing studio's duplicate search
scripts/rules/       the fall check for next season's rulebook (run by .github/workflows/rules-watch.yml)
scripts/icons/       renders the app icons with Playwright
scripts/visual/      builds the public-domain photo set for the Visual lab
e2e/                 browser tests (the smoke test, the team-server test with several accounts, matches read aloud,
                     middle school), the accounts helper they share, and a small fixture question set
server/              the server: Cloudflare Worker, Durable Objects for users, teams and rooms, sign-in, optional AI help,
                     tests (see server/README.md)
docs/                PROPOSAL.md (the plan), ACCOUNTS.md (accounts, teams and the API), SERVER.md (rooms and matches),
                     NSB-JSON.md (the open format)
schema/              nsb-json.schema.json (JSON Schema for NSB-JSON files)
```

Key design choices:

- **Rules are data.** `presets.ts` holds every number the engine uses, and the public rules page is generated from it.
  Each fall, when DOE posts the next season's rules, add the new season's presets and point `CURRENT_SEASON` at them
  (MAINTAINING.md, "New rules each season"; a scheduled workflow opens an issue with the checklist).
- **Games are event logs.** The Reader console stores events ("toss-up read", "buzz", "judged wrong", …); scores, stats
  and the "seen" ledger are all derived by replaying them, so undo is exact and old games can be re-scored.
- **The answer checker never guesses.** It returns `correct`, `incorrect` or `review`; near-miss spellings and equal
  values written in a different form come back as `review` and the player decides.
- **Pages only talk to `src/lib/store.ts`.** `update()` is the one way to change data; `cloud.ts` watches the store, works
  out which records a change touched (`records.ts`) and sends the player's own to their account and the team's to the
  team. A teammate's practice is never sent: only the signed-in player's records are ever produced.
- **Practice lives on the server.** Nothing about a player is kept on the device: the site loads everything at sign-in,
  sends each change within a moment, refreshes every 30 seconds, and says plainly when a change could not be saved. The
  collections, what teammates may see, who may write what and how concurrent edits merge are defined once in
  `src/core/accounts.ts`, which the server imports too, so the two cannot disagree.
- **Learning logic is pure.** Review scheduling, mastery, plans and drill choice are plain functions of the saved data, so
  they are unit-tested and can move to a server unchanged. Mastery counts only a player's first answer to each question;
  reviews measure memory of a question already seen, so they feed the schedule, not the mastery map.
- **Difficulty is estimated from round numbers for now.** Until there is enough team data to measure it, a question's
  difficulty comes from what DOE says about its sample sets: rounds 1–10 are about equal, and later rounds and bonuses are harder.

## Roadmap

All four phases of the proposal are built. What comes next is up to the teams that use it: open an issue, or see
CONTRIBUTING.md to send a change.

## License

The code is released under the [MIT License](LICENSE).

The DOE question data in `public/data/doe/` is not covered by the MIT License: it is a U.S. Government work in the public
domain. DOE's Office of Science asks to be credited and linked, which the site does on every question and round. The photos in
`public/data/visual/photos/` are public domain too; `photos.json` credits each one, and the site shows the credit with each photo.
