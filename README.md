# Rebound

A free, team-first practice website for the National Science Bowl (NSB). This covers **Phases 0–2** of the plan in
[`docs/PROPOSAL.md`](docs/PROPOSAL.md): every practice is logged, every player opens **Today** to find a daily plan and a review queue
built from their own misses, and the captain runs the team from the **Team** pages (lineups, assignments, scrimmages), with an optional
team server for sharing between devices and remote rooms.

Rebound is an unofficial study tool, not affiliated with or endorsed by the U.S. Department of Energy (DOE).

## What works today

| Page | What it does |
|---|---|
| **Home**, **Try a round** | Public pages. Anyone can play a DOE round solo without an account. |
| **Today** | Each player picks their name and gets a plan for 15, 30 or 45 minutes: due reviews (capped at a third of the time), a targeted drill on a weak, high-frequency topic in their primary subject, one in their secondary subject, and a mixed round. Every item says why it is there. The mix shifts toward timed mixed rounds in the last three weeks before the team's next competition (set on the Team page). |
| **Review** | Timed review of misses, wrong interrupts, slow correct answers, toss-ups nobody got in your subject, and bonuses your team missed, from solo practice and Reader console games. Scheduled with FSRS ([ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)) in whole days; the grade comes from correctness and buzz time. New misses join a few a day (wrong interrupts and the player's own subjects first), and a question answered right after a month's gap is learned and leaves the queue, so the daily load stays steady. Cards pause while their question has an open problem report. |
| **Practice → drills** | Subject and topic drills drawn from the whole library (fresh questions first, aimed at a 70–85% expected success rate, from a few set files), an option to add Energy questions that test the subject, and balanced mixed toss-ups. |
| **My progress** | Mastery by subject and a topic map (difficulty-adjusted ratings from each player's first answers), buzz speed, the review queue and daily activity, each with a table view. |
| **Team → Lineups** | Estimated points per regional round for any four players, subject by subject (difficulty-adjusted results, buzz speed, overlapping knowledge, a reference opponent); the five best foursomes; a suggested alternate; saved lineups, one set for the next competition. |
| **Team** | Create the team and add players, each with a primary and secondary subject and a graduation year; who covers what, and who takes over each subject next season; the team's best player in every topic, with gaps counted; the chosen lineup; sharing (below). |
| **Team → Assignments** | Drills, team packets, concept cards or clearing reviews, for chosen players with a due date; they show on each player's Today page and tick off when done; drills suggested from coverage gaps. |
| **Library → Team packets** | Scrimmages of questions nobody in the room has heard (balanced like a DOE round, at a chosen difficulty), and packets uploaded as PDF (parsed in the browser) or JSON, with a review screen; print, play in the Reader console or solo. Uploaded packets stay in the team's data. |
| **Learn** | Concept cards written by the team (summary, key facts, traps, sources), reviewed by a second player, next to the library questions that test each concept; concept drills; unread cards join the daily plan. |
| **Team stats** | Adds rebounds, net points per interrupt, small samples marked, and a week-by-week trend of practice games. |
| **Sharing and remote rooms** | Optional, through the team server ([`docs/SERVER.md`](docs/SERVER.md)): the captain shares the team, players join with a link, a display name and a PIN, and everything syncs between devices. The Reader console can open a remote room: players buzz from their own devices (server-timed, with latency correction), see the question read aloud or revealed in step, confer in a private team channel during bonuses, and their captain answers in an answer box. |
| **Offline** | A service worker keeps the site available offline after the first visit; **Data → Save all questions for offline use** stores the whole library (about 9 MB) for drills and reviews without a connection. The site can be installed to a home screen. |
| **Play → Reader console** | Run an in-person practice game from one laptop: question in large type, answer for the reader, 5 s / 20 s answer clocks, game clock, two-tap scoring under the **2027 rules** (interrupts, blurts, rebounds, double interrupts, halves, tiebreakers), undo, keyboard shortcuts. Every toss-up is logged. |
| **Game summary**, **Stats** | Per-player toss-up accuracy by subject, interrupts, points given away, median buzz time, bonus conversion; CSV export. |
| **Practice (solo)** | Questions appear letter by letter at a moderator's pace (the words-per-minute setting is converted to letters using the library's average word length, about 6 characters with the space); the word still appearing is shown fainter. Buzz with Space, start typing within 2 seconds (NSB's natural pause) and finish within 5, and the answer checker grades it (close calls go to "your call"). The answer timer can be switched off. |
| **Library** | Every DOE high school sample set, by set and round, searchable, printable, with links to the original PDFs and a "report a problem" button. Shows which questions the team has already heard, and lets a player add any question to their review queue. **Library → Topics** shows how often each topic comes up in each subject. |
| **NSB rules at a glance** | Generated from the same rule presets the game engine uses. |
| **For coaches**, **For school IT staff**, **Privacy, terms and credits**, **Data and backup** | Setup guide, network needs, credits, export/import/delete. |

The library holds **12,024 questions** (6,012 toss-up/bonus pairs) from all 17 DOE high school sample sets, 257 rounds.
About 2.5% of them, all in the older sets, carry an import note (for example, an equation that was an image in the PDF);
the site says so and links to the original page, and solo practice skips the few whose answers could not be read.

All team data is stored **in the browser on the device** (IndexedDB), and the site works without any server. A team that
shares itself through the team server also keeps a copy there, and every signed-in device syncs with it. Use
**Data → Download backup file** regularly either way; the file can be loaded on another device.

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other commands:

```bash
npm test           # unit tests (rules engine, answer checker, review scheduler, plans, drills, tagging, importer)
npm run build      # type-check and build the static site into dist/
npm run preview    # serve dist/ at http://localhost:4173
node e2e/smoke.cjs # browser walkthrough against the preview server (needs Playwright + Chromium)
node e2e/team-server.cjs # a captain and a player in two browsers against a local team server (see the file's header)
npx tsx scripts/checks/judge-self-check.ts   # grade every printed answer in the library against itself
npx tsx scripts/checks/review-load.ts 30 0.6 # simulate 90 days of reviews for a 30-minute plan and a 60% player
```

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

**The team server (optional).** Sharing a team between devices and remote rooms need the team server in `server/`: a
Cloudflare Worker with one Durable Object per team, which fits Cloudflare's free plan. [`server/README.md`](server/README.md)
covers testing it locally (no account needed), the API token and deploying it with Wrangler. The site finds the server
through `VITE_SERVER_URL` at build time; for the published site it belongs in the build step of
`.github/workflows/deploy.yml`. A build without it (such as `npm run build` on your own computer) asks for the server
address on the Share and Join forms instead, so local tests never touch the real server. A site hosted somewhere other than `https://jiazegao.github.io` must also be added to
`ALLOWED_ORIGINS` in `server/wrangler.toml`.

Before giving members the link, go through the launch checklist in the proposal ([Section 12](docs/PROPOSAL.md)): a team- or club-owned
domain the coach can access, the privacy and credits pages, asking school IT to allow the domain (the site's
*For school IT staff* page explains what to allow), and a test on a school Chromebook on the school network.

## Question data

The DOE high school sample sets ship with the site as JSON in `public/data/doe/`: one file per set, `index.json`, and
`catalog.json` (one compact row per question, so drills can choose questions without downloading every set). They are
U.S. Government works in the public domain; DOE's Office of Science asks to be credited and linked, and every round keeps
a link to its original PDF.

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
npm run data:fetch   # list the official PDFs and download missing ones into .cache/ (polite: ≥3 s between requests)
npm run data:build   # parse the cached PDFs into public/data/doe/ and write scripts/doe/REPORT.md
```

Only DOE-published sets belong in this folder. Community and invitational packets carry no open license: keep them
private to the team and never commit them (the `private-data/` folder is git-ignored for that purpose).

## How the code is organised

```
src/core/            framework-free logic, unit-tested
  schema.ts          shared data types ("NSB-JSON") for questions, sets, players, the catalog
  rules/presets.ts   rule presets (DOE Regional/Virtual/Finals 2027, invitational, practice)
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
  sync.ts            the sync contract (collections, who may write what, merges), shared with the server
src/lib/             browser-side helpers: store (IndexedDB), library loading, learning glue, offline, stats, router, sound,
                     team-server sync (sync.ts, syncRecords.ts) and the remote room client (room.ts)
src/pages/           one file per page
src/components/      shared UI pieces
src/sw/              the service worker template (vite.config.ts fills in the file list at build time)
scripts/doe/         data fetch/build scripts and the validation report
scripts/icons/       renders the app icons with Playwright
e2e/                 browser smoke test, the two-browser team-server test, and a small fixture question set
server/              the team server: Cloudflare Worker, Durable Object per team, tests (see server/README.md)
```

Key design choices:

- **Rules are data.** `presets.ts` holds every number the engine uses, and the public rules page is generated from it.
  Each October, when DOE posts the next season's rules, update the presets and the tests in `engine.test.ts`.
- **Games are event logs.** The Reader console stores events ("toss-up read", "buzz", "judged wrong", …); scores, stats
  and the "seen" ledger are all derived by replaying them, so undo is exact and old games can be re-scored.
- **The answer checker never guesses.** It returns `correct`, `incorrect` or `review`; near-miss spellings and equal
  values written in a different form come back as `review` and the player decides.
- **Pages only talk to `src/lib/store.ts`.** Sync watches the store and turns it into records (`src/lib/syncRecords.ts`),
  so sharing a team needed no changes to the pages beyond the sharing screens.
- **The site never depends on the server.** Without a connection everything works locally and sync catches up later. The
  synced collections, who may write what and how concurrent edits merge are defined once in `src/core/sync.ts`, which the
  server imports too, so the two cannot disagree.
- **Learning logic is pure.** Review scheduling, mastery, plans and drill choice are plain functions of the saved data, so
  they are unit-tested and can move to a server unchanged. Mastery counts only a player's first answer to each question;
  reviews measure memory of a question already seen, so they feed the schedule, not the mastery map.
- **Difficulty is estimated from round numbers for now.** Until there is enough team data to measure it, a question's
  difficulty comes from what DOE says about its sample sets: rounds 1–10 are about equal, and later rounds and bonuses are harder.

## Roadmap

From the proposal: Phases 0–2 are built. Phase 3 adds Finals presets with visual bonuses; Phase 4 adds the
question-writing studio, reading paths, middle school mode, and the open-source handoff.

## License

The code is released under the [MIT License](LICENSE).

The DOE question data in `public/data/doe/` is not covered by the MIT License: it is a U.S. Government work in the public
domain. DOE's Office of Science asks to be credited and linked, which the site does on every question and round.
