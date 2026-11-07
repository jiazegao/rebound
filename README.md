# Rebound

A free, team-first practice website for the National Science Bowl (NSB). This is **Phase 0** of the plan in
[`docs/PROPOSAL.md`](docs/PROPOSAL.md): the site can go live, and every practice is logged.

Rebound is an unofficial study tool, not affiliated with or endorsed by the U.S. Department of Energy (DOE).

## What works today

| Page | What it does |
|---|---|
| **Home**, **Try a round** | Public pages. Anyone can play a DOE round solo without an account. |
| **Team** | Create the team, add players, give each a primary and secondary subject, see "who covers what". |
| **Play → Reader console** | Run an in-person practice game from one laptop: question in large type, answer for the reader, 5 s / 20 s answer clocks, game clock, two-tap scoring under the **2027 rules** (interrupts, blurts, rebounds, double interrupts, halves, tiebreakers), undo, keyboard shortcuts. Every toss-up is logged. |
| **Game summary**, **Stats** | Per-player toss-up accuracy by subject, interrupts, points given away, median buzz time, bonus conversion; CSV export. |
| **Practice (solo)** | Questions appear letter by letter at a moderator's pace (the words-per-minute setting is converted to letters using the library's average word length, about 6 characters with the space); the word still appearing is shown fainter. Buzz with Space, start typing within 2 seconds (NSB's natural pause) and finish within 5, and the answer checker grades it (close calls go to "your call"). The answer timer can be switched off. |
| **Library** | Every DOE high school sample set, by set and round, searchable, printable, with links to the original PDFs and a "report a problem" button. Shows which questions the team has already heard. |
| **NSB rules at a glance** | Generated from the same rule presets the game engine uses. |
| **For coaches**, **For school IT staff**, **Privacy, terms and credits**, **Data and backup** | Setup guide, network needs, credits, export/import/delete. |

The library holds **12,024 questions** (6,012 toss-up/bonus pairs) from all 17 DOE high school sample sets, 257 rounds.
About 2.5% of them, all in the older sets, carry an import note (for example, an equation that was an image in the PDF);
the site says so and links to the original page, and solo practice skips the few whose answers could not be read.

All team data is stored **in the browser on the device** (IndexedDB). Use **Data → Download backup file** regularly;
the file can be loaded on another device. A shared online database is planned for a later phase.

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other commands:

```bash
npm test           # unit tests (rules engine, answer checker, stats, importer)
npm run build      # type-check and build the static site into dist/
npm run preview    # serve dist/ at http://localhost:4173
node e2e/smoke.cjs # browser walkthrough against the preview server (needs Playwright + Chromium)
npx tsx scripts/checks/judge-self-check.ts   # grade every printed answer in the library against itself
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

Before giving members the link, go through the launch checklist in the proposal ([Section 12](docs/PROPOSAL.md)): a team- or club-owned
domain the coach can access, the privacy and credits pages, asking school IT to allow the domain (the site's
*For school IT staff* page explains what to allow), and a test on a school Chromebook on the school network.

## Question data

The DOE high school sample sets ship with the site as JSON in `public/data/doe/` (one file per set plus `index.json`).
They are U.S. Government works in the public domain; DOE's Office of Science asks to be credited and linked, and every
round keeps a link to its original PDF.

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
  schema.ts          shared data types ("NSB-JSON") for questions, sets, players
  rules/presets.ts   rule presets (DOE Regional/Virtual/Finals 2027, invitational, practice)
  rules/engine.ts    event-sourced match engine: replay(events) → state; undo = drop last event
  judge/             answer checker: multiple choice rule, accept/reject lists, numbers, units, names
  importers/         DOE PDF → questions (text extraction + parser)
src/lib/             browser-side helpers: store (IndexedDB), library loading, stats, router, sound
src/pages/           one file per page
src/components/      shared UI pieces
scripts/doe/         data fetch/build scripts and the validation report
e2e/                 browser smoke test and a small fixture question set
```

Key design choices:

- **Rules are data.** `presets.ts` holds every number the engine uses, and the public rules page is generated from it.
  Each October, when DOE posts the next season's rules, update the presets and the tests in `engine.test.ts`.
- **Games are event logs.** The Reader console stores events ("toss-up read", "buzz", "judged wrong", …); scores, stats
  and the "seen" ledger are all derived by replaying them, so undo is exact and old games can be re-scored.
- **The answer checker never guesses.** It returns `correct`, `incorrect` or `review`; near-miss spellings and equal
  values written in a different form come back as `review` and the player decides.
- **Pages only talk to `src/lib/store.ts`.** Swapping local storage for a shared database later should not require page
  changes.

## Roadmap

From the proposal: Phase 1 adds the personal **Today** plan and timed spaced review (FSRS) of misses; Phase 2 adds the
captain's lineup simulator, assignments, scrimmage builder, concept cards and online team rooms; Phase 3 adds Finals
presets with visual bonuses; Phase 4 adds the question-writing studio, reading paths, middle school mode, and the
open-source handoff.

## License

The code is released under the [MIT License](LICENSE).

The DOE question data in `public/data/doe/` is not covered by the MIT License: it is a U.S. Government work in the public
domain. DOE's Office of Science asks to be credited and linked, which the site does on every question and round.
