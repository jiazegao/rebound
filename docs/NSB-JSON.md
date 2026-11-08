# NSB-JSON 1.0

NSB-JSON is a JSON format for National Science Bowl questions and game logs: the Science Bowl counterpart of
quiz bowl's QBJ, which has no Science Bowl rule set. One file holds a question set, a list of questions, or one
game's log, written so that another program can read the questions exactly as printed and re-score the game
event by event.

It is for anyone who writes Science Bowl software (moderator consoles, buzzer systems, stat trackers, packet
editors, question banks) and for teams who want to move their questions and games between programs. Rebound
reads and writes it; nothing in it is specific to Rebound except a few optional fields, marked below.

- **Schema:** [`schema/nsb-json.schema.json`](../schema/nsb-json.schema.json) (JSON Schema, draft 2020-12).
- **Reference implementation:** [`src/core/nsbjson.ts`](../src/core/nsbjson.ts) writes and reads the three kinds;
  [`src/core/rules/engine.ts`](../src/core/rules/engine.ts) replays a game log.
- **License:** this specification and the schema are released under the MIT License, like Rebound's code
  ([`LICENSE`](../LICENSE)): anyone may implement, copy or adapt them. The license covers the format, not the
  questions in a file; each file says who wrote its questions and on what terms (`credit`, `license`).

NSB-JSON is unofficial and not affiliated with or endorsed by the U.S. Department of Energy (DOE).

## Conventions

- A file is UTF-8 JSON holding one object, the **envelope**. Use the `.json` extension.
- "Required" fields must be present. Leave an optional field out rather than writing `null`, unless its table
  says `null` is a value.
- Text is plain Unicode: no HTML or Markdown. Use Unicode for symbols, subscripts and superscripts (`NO₃⁻`, `x²`),
  since a file carries no other formatting.
- Dates and times are ISO 8601 strings (`2026-11-07T18:00:00.000Z`), except the event times `t` in game logs.
- URLs are absolute.
- Programs ignore fields they do not know (see [Versioning](#versioning)).

## The envelope

| Field | Type | Required | Meaning |
|---|---|---|---|
| `nsbjson` | string | yes | Version of this format, `"MAJOR.MINOR"`. This document describes `"1.0"`. |
| `kind` | string | yes | What the file holds: `"question-set"`, `"questions"` or `"game-log"`. |
| `generator` | string | no | The program that wrote the file, e.g. `"Rebound"`. |
| `exportedAt` | string | no | When the file was written (date and time). |

The other fields depend on the kind: `set` for a question set, `title` and `questions` for a list of questions,
`game` for a game log.

## Kind `question-set`

A whole set: rounds of toss-up/bonus pairs, as published (for example one of DOE's sample sets) or as a team put
it together.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `set` | QuestionSet | yes | The set. |

**QuestionSet**

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Set id, e.g. `"doe-hs-17"` (see [Ids](#ids)). |
| `provider` | string | yes | Where the set comes from: `doe`, `sbreader`, `team`, `rebound` or `other` (see [Provenance](#provenance)). |
| `level` | string | yes | `"HS"` (high school) or `"MS"` (middle school). |
| `title` | string | yes | e.g. `"DOE High School Sample Set 17"`. |
| `year` | string | no | e.g. `"2022"`, when the set comes from a given year's competitions. |
| `setNumber` | integer | no | The publisher's number for the set (1 or more). |
| `sourcePage` | string | no | URL of the page the set was published on. |
| `credit` | string | yes | Credit line to show with the questions. |
| `license` | string | yes | What others may do with the questions, in plain words. |
| `rounds` | Round[] | yes | The rounds, in order. |

**Round**

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Round id, e.g. `"doe-hs-17-r01"`. |
| `label` | string | yes | As printed, e.g. `"Round 1"` or `"Round 1A"`. |
| `order` | integer | yes | Position of the round in its set (1-based). Later DOE rounds are harder. |
| `sourceUrl` | string | no | URL of the original file, e.g. DOE's PDF. |
| `pairs` | Pair[] | yes | Toss-up/bonus pairs in reading order. |

**Pair**

| Field | Type | Required | Meaning |
|---|---|---|---|
| `number` | integer | yes | Pair number in the round (1-based). |
| `tossup` | Question | yes | A question with `kind: "tossup"`. |
| `bonus` | Question | no | A question with `kind: "bonus"`. Left out for a toss-up without a bonus (tiebreakers). |

```json
{
  "nsbjson": "1.0",
  "kind": "question-set",
  "generator": "Rebound",
  "exportedAt": "2026-11-07T18:00:00.000Z",
  "set": {
    "id": "doe-hs-17",
    "provider": "doe",
    "level": "HS",
    "title": "DOE High School Sample Set 17",
    "year": "2022",
    "setNumber": 17,
    "credit": "U.S. Department of Energy, National Science Bowl sample questions (science.osti.gov/wdts/nsb)",
    "license": "Public domain (U.S. Government work); DOE Office of Science asks to be credited and linked.",
    "rounds": [
      {
        "id": "doe-hs-17-r01",
        "label": "Round 1",
        "order": 1,
        "sourceUrl": "https://science.osti.gov/-/media/wdts/nsb/pdf/HS-Sample-Questions/Sample-Set-17/2022-HS-1.pdf",
        "pairs": [
          {
            "number": 1,
            "tossup": {
              "id": "doe-hs-17-r01-t01",
              "kind": "tossup",
              "number": 1,
              "subject": "biology",
              "sourceCategory": "Biology",
              "format": "short_answer",
              "stem": "Rotational accelerations are detected by the mammalian vestibular [ves-TIB-u-lar] system through what structure composed of three interconnected tubes?",
              "answer": "SEMICIRCULAR CANALS",
              "accept": ["SEMICIRCULAR DUCTS"],
              "reject": [],
              "answerRaw": "SEMICIRCULAR CANALS (ACCEPT: SEMICIRCULAR DUCTS)",
              "source": {
                "provider": "doe",
                "setId": "doe-hs-17",
                "roundId": "doe-hs-17-r01",
                "url": "https://science.osti.gov/-/media/wdts/nsb/pdf/HS-Sample-Questions/Sample-Set-17/2022-HS-1.pdf",
                "page": 1,
                "credit": "U.S. Department of Energy, National Science Bowl sample questions (science.osti.gov/wdts/nsb)"
              }
            },
            "bonus": {
              "id": "doe-hs-17-r01-b01",
              "kind": "bonus",
              "number": 1,
              "subject": "biology",
              "sourceCategory": "Biology",
              "format": "short_answer",
              "stem": "What is the most abundant protein in plant leaves?",
              "answer": "RUBISCO",
              "accept": ["RIBULOSE 1,5-BISPHOSPHATE CARBOXYLASE/OXYGENASE"],
              "reject": [],
              "answerRaw": "RUBISCO (ACCEPT: RIBULOSE 1,5-BISPHOSPHATE CARBOXYLASE/OXYGENASE)",
              "source": {
                "provider": "doe",
                "setId": "doe-hs-17",
                "roundId": "doe-hs-17-r01",
                "url": "https://science.osti.gov/-/media/wdts/nsb/pdf/HS-Sample-Questions/Sample-Set-17/2022-HS-1.pdf",
                "page": 1,
                "credit": "U.S. Department of Energy, National Science Bowl sample questions (science.osti.gov/wdts/nsb)"
              }
            }
          }
        ]
      }
    ]
  }
}
```

## Kind `questions`

A flat list of questions that do not form rounds yet, for example the questions a team has written.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `title` | string | yes | e.g. `"Chemistry questions, fall 2026"`. |
| `credit` | string | no | Who wrote or published the questions. |
| `license` | string | no | What others may do with them, e.g. `"Private to the team"`. |
| `level` | string | no | `"HS"` or `"MS"`. |
| `questions` | Question[] | yes | The questions. |

```json
{
  "nsbjson": "1.0",
  "kind": "questions",
  "title": "Chemistry questions, fall 2026",
  "credit": "Example High School Science Bowl team",
  "license": "Private to the team",
  "level": "HS",
  "questions": [
    {
      "id": "wq-mh2x81qz4k",
      "kind": "tossup",
      "number": 1,
      "subject": "chemistry",
      "sourceCategory": "CHEMISTRY",
      "format": "multiple_choice",
      "stem": "Which of the following elements has the highest first ionization energy?",
      "choices": { "W": "Sodium", "X": "Magnesium", "Y": "Neon", "Z": "Argon" },
      "answer": "Neon",
      "answerLetter": "Y",
      "accept": [],
      "reject": [],
      "answerRaw": "Y) NEON",
      "source": { "provider": "team", "setId": "wq", "roundId": "wq", "credit": "Example High School Science Bowl team" }
    }
  ]
}
```

## Questions

Every question, in a set or a list, has the same fields.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Stable id, e.g. `"doe-hs-17-r01-t01"` (see [Ids](#ids)). |
| `kind` | string | yes | `"tossup"` or `"bonus"`. |
| `number` | integer | yes | Question number in its round (1-based). A toss-up and its bonus share a number. |
| `subject` | string | yes | Category, mapped to the 2027 categories (see [Subjects](#subjects)). |
| `sourceCategory` | string | yes | Category exactly as printed, e.g. `"EARTH SCIENCE"`, `"Earth and Space"`. May be empty. |
| `format` | string | yes | `"short_answer"` or `"multiple_choice"`. |
| `stem` | string | yes | The question, without its choices (see [Text](#text)). |
| `choices` | object | no | Multiple choice: `{ "W": …, "X": …, "Y": …, "Z": … }`, each the choice text without its letter. |
| `answer` | string | yes | Main answer as printed. Multiple choice: the text of the correct choice. Empty when the source's answer could not be read. |
| `answerLetter` | string | no | Multiple choice: the correct letter, `W`, `X`, `Y` or `Z`. |
| `accept` | string[] | yes | Other acceptable answers (`ACCEPT:`, `ALSO ACCEPT`), one per item. |
| `reject` | string[] | yes | Answers to reject (`DO NOT ACCEPT:`), one per item. |
| `answerRaw` | string | yes | The complete answer line as printed, without the word `ANSWER:`. |
| `notes` | string[] | no | Instructions from the answer line that are not answers: `"MUST GIVE BOTH ANSWERS"`, `"IN ANY ORDER"`, `"Solution: …"`. |
| `visual` | boolean | no | `true` when the question depends on a picture or figure. |
| `figure` | Figure | no | The figure, when the file has it (see [Figures](#figures)). |
| `source` | Source | yes | Where the question comes from (see [Provenance](#provenance)). |
| `flags` | string[] | no | Warnings raised while importing (see [Provenance](#provenance)). Absent or empty when clean. |
| `topic` | string | no | Rebound only: a topic id from Rebound's taxonomy (`src/core/taxonomy.ts`), e.g. `"biology.genetics"`. |
| `concepts` | string[] | no | Rebound only: concept ids within the topic, e.g. `"biology.genetics.hardy-weinberg"`. |
| `crossSubject` | string | no | For Energy questions: the core subject the question really tests, e.g. `"chemistry"`. |

Leave `topic` and `concepts` out unless you use Rebound's taxonomy.

### Text

- **Stem.** The question as the moderator reads it, without `TOSS-UP`/`BONUS`, the number, the category, the
  question type or the choices. Numbered lists inside a question stay in the text:
  `"Rank the following three elements in order of increasing electronegativity: 1) Silicon; 2) Nitrogen; 3) Phosphorus."`
- **Pronunciation guides** go in square brackets right after the word: `vestibular [ves-TIB-u-lar]`. Older DOE
  sets print them as `(read as: …)`; convert those to brackets. Programs that check answers ignore bracketed guides.
- **Multiple choice** questions have `format: "multiple_choice"`, all four `choices` (Science Bowl uses W, X, Y and
  Z, never A–D), `answerLetter`, and in `answer` the text of the correct choice as printed on the answer line
  (its capitals may differ from the choice). Short-answer questions have neither `choices` nor `answerLetter`.
  A draft may lack them; programs must not fail on a multiple choice question without them.
- **Answer lines.** DOE prints, for example:

  ```text
  ANSWER: W) TROPICAL DEPRESSION
  ANSWER: SMOOTH ENDOPLASMIC RETICULUM (ACCEPT: ENDOPLASMIC RETICULUM, ER; DO NOT ACCEPT: ROUGH ER)
  ANSWER: –3 AND –7 (must give both answers)
  ```

  NSB-JSON keeps the line as printed, without `ANSWER:`, in `answerRaw` (what a moderator reads) and its parts in
  `answer`, `answerLetter`, `accept`, `reject` and `notes` (what an answer checker uses). The lines above become
  `answer: "TROPICAL DEPRESSION"` with `answerLetter: "W"`; `answer: "SMOOTH ENDOPLASMIC RETICULUM"` with
  `accept: ["ENDOPLASMIC RETICULUM", "ER"]` and `reject: ["ROUGH ER"]`; and `answer: "–3 AND –7"` with
  `notes: ["must give both answers"]`. A program that writes new questions builds `answerRaw` from the parts,
  as `ANSWER (ACCEPT: A; B) (DO NOT ACCEPT: C)`, with the letter first for multiple choice (`X) ARGON`).

### Subjects

| `subject` | Category | Notes |
|---|---|---|
| `biology` | Biology | Includes older "Life Science". |
| `chemistry` | Chemistry | |
| `earth_space` | Earth and Space | Includes older "Earth Science" and "Astronomy". |
| `energy` | Energy | `crossSubject` may name the discipline a question really tests. |
| `math` | Math | |
| `physics` | Physics | |
| `general_science` | General Science | Legacy: older sets only, no 2027 equivalent. |
| `computer_science` | Computer Science | Legacy. |
| `physical_science` | Physical Science | Legacy. |

The first six are the 2027 categories for both high school and middle school. `sourceCategory` keeps what was
printed, so nothing is lost by the mapping.

### Figures

`visual: true` marks a question that depends on a picture (a Finals visual bonus, or a question whose figure
was not imported). `figure` holds the picture when the file has it, in one of two forms:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `kind` | string | yes | `"svg"` or `"image"`. |
| `svg` | string | `svg` only | SVG markup. |
| `src` | string | `image` only | The picture: a `data:` URL (JPEG, PNG or WebP, base64), or a path on the site that published the file. |
| `alt` | string | yes | What the figure shows, for screen readers and for players who cannot see it. |
| `credit` | string | no (`image`) | Who made the picture, and its license. |
| `sourceUrl` | string | no (`image`) | URL of the page the picture comes from. |

**Never insert `figure.svg` from a file you did not generate yourself into a page as markup** (`innerHTML`,
`dangerouslySetInnerHTML`, `v-html` and the like): SVG can carry scripts and links. Draw the figure yourself, or
leave it out. Rebound draws SVG figures only with its own generators, rebuilding them from the question id
(`vis-<template>-<seed>`), and drops SVG figures from files it imports. Check an `image` figure's `src` before
showing it too: Rebound shows only base64 `data:` URLs of JPEG, PNG and WebP images and its own photo files, and
links a `sourceUrl` only when it starts with `https://`.

### Ids

Ids are case-sensitive strings without spaces. A question keeps its id in every file, so practice history and
game logs can refer to it. Ids are unique among the questions (and among the rounds, and the sets) of a file.

The ids Rebound writes:

| Pattern | What |
|---|---|
| `doe-hs-17`, `doe-hs-17-r01`, `doe-hs-17-r01-t01`, `doe-hs-17-r01-b01` | DOE sample sets, their rounds, toss-ups and bonuses (two-digit numbers; middle school sets are `doe-ms-…`). |
| `team-<packet>-r01-t01` | Questions in a packet a team uploaded. |
| `wq-<id>` | Questions a team wrote. |
| `vis-<template>-<seed>` | Generated visual bonuses: the template and the seed rebuild the same figure and answer. |
| `vph-<photo>-<seed>` | Visual bonuses from Rebound's public-domain photo set. |
| `vtm-<id>` | Visual questions a team added. |

Other programs should start their ids with a short name of their own (`mytool-…`) so they never collide with
these, and keep DOE's ids for DOE questions.

### Provenance

Every question carries a `source`, so credit travels with it even when it is copied out of its set:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `provider` | string | yes | `doe` (DOE's published sample sets), `sbreader` (SB Reader files), `team` (written or uploaded by a team), `rebound` (generated by Rebound), `other`. |
| `setId` | string | yes | The set it belongs to, e.g. `"doe-hs-17"`. |
| `roundId` | string | yes | The round, e.g. `"doe-hs-17-r01"`. |
| `url` | string | no | URL of the original file. |
| `page` | integer | no | 1-based page in the original file. |
| `credit` | string | yes | Credit line to show next to the question. |

Show `source.credit` with the question; DOE asks to be credited and linked, and other writers deserve the same.
A set's `license` says in plain words what others may do with its questions: DOE's sample sets are public domain;
community and invitational packets usually carry no open license and stay private to a team.

`flags` lists problems found while importing, so a program can warn before using the question. Rebound writes:

| Flag | Meaning |
|---|---|
| `possible-lost-formatting` | Some math or symbols may not have come through from the PDF. |
| `image-not-extracted` | Part of the question is an image in the original. |
| `answer-missing` | The answer is an image in the original (`answer` is empty). |
| `choices-missing` | The choices could not be read. |
| `choice-letters-fixed`, `choices-reordered` | The choice letters were misprinted and repaired. |
| `answer-letter-corrected`, `mc-answer-mismatch` | The printed letter and the printed answer disagree. |
| `type-mismatch` | The printed question type did not match its format. |
| `kind-inferred` | The toss-up or bonus label was missing and was inferred. |
| `erratum` | A misprint in the answer line was corrected after review (see `notes`). |

Other flags may appear; show them as they are.

## Kind `game-log`

One game, recorded as the events the moderator's console logged ("toss-up read", "player buzzed", "judged
incorrect", …). Replaying the events in order gives the score, every player's answers and which questions were
heard; nothing else needs to be stored.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `game` | Game | yes | The game. |

**Game**

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Game id. |
| `createdAt`, `updatedAt` | string | yes | When the game was set up and last changed. |
| `presetId` | string | yes | The rules preset, e.g. `"doe-regional-2027"` (Rebound's presets are in `src/core/rules/presets.ts`). |
| `season` | string | yes | The season of those rules, e.g. `"2027"`. |
| `rules` | Rules | yes | The numbers the game was played under (below), so it can be re-scored without knowing the preset. |
| `format` | string | yes | `"game"`, or `"tiebreak"` for a tiebreaker drill: the game starts as a tiebreaker from 0–0. |
| `packet` | object | yes | The round played: `setId`, `setTitle`, `roundId`, `roundLabel` (all required) and `sourceUrl`. |
| `pairs` | object[] | yes | The packet's questions in reading order: `tossupId` and `subject` (required), `bonusId`. The game goes through them in order: `start` begins the first, and each `next`, `start_half` or `start_tiebreak` that begins a toss-up moves to the following one. |
| `teams` | object[] | yes | Exactly two teams, each `{ "name": …, "playerIds": […] }` with its starting lineup (at most four players, Rule 8-1). Team 0 is the first. An empty lineup means it was not recorded. |
| `players` | object[] | no | Display names, `{ "id": …, "name": … }`, when the team chose to include them. |
| `events` | Event[] | yes | Everything that happened, in order. |
| `status` | string | yes | `"in_progress"` or `"finished"`. |
| `finalScores` | number[] | no | `[team 0, team 1]` when the game finished. Re-scoring the events gives the same numbers. |

**Rules**

| Field | Type | Meaning |
|---|---|---|
| `name` | string | The preset's name. |
| `points` | object | `tossup` (4), `bonus` (10) and `interruptFault` (4): points for a correct toss-up, a correct bonus, and a fault on an interrupted toss-up. |
| `interruptFaultMode` | string | `"opponent_gains"`: the other team gains `interruptFault` (DOE Rule 6-2). `"interrupter_loses"`: the interrupting team loses it (a common invitational variant). |
| `timing` | object | Answer windows in seconds: `tossupWindowSec`, `reboundWindowSec`, `bonusSec`, `bonusWarningAtSec`, `naturalPauseSec`. |
| `visualBonus` | object or `null` | `sec` and `warningAtSec` for visual bonuses; `null` when the rules have none. |
| `clock` | object or `null` | `halves`, `halfMinutes`, `breakMinutes`; `null` for an untimed game. |
| `maxTossups` | integer or `null` | The most toss-ups in a game (virtual events stop at 18); `null` to play the whole packet. |
| `tiebreakTossups` | integer | Toss-ups in a tiebreaker series (5). |

All Rules fields are required.

**Events.** Every event has `type` and `t`, the time in milliseconds. Rebound writes Unix time; only the
differences between events matter, and `t` never decreases from one event to the next. `team` is `0` or `1`.

| `type` | Other fields | Meaning |
|---|---|---|
| `start` | | The game begins with the first pair's toss-up, and the game clock starts (when the rules have one and `format` is `"game"`). |
| `tossup_read` | | The moderator finished reading the toss-up, choices included; the answer window opens (Rule 5-2). |
| `buzz` | `team`, `playerId` | A player buzzed. Before `tossup_read` it is an interrupt. |
| `tossup_judged` | `result` | The buzzing player's answer: `correct`, `incorrect`, `blurt`, `stall` or `communication`. |
| `tossup_dead` | | The answer window ran out with no further buzz. |
| `bonus_read` | `visual` (optional, `true`) | The moderator finished reading the bonus; `visual` marks a visual bonus (longer window). |
| `bonus_judged` | `result` | `correct`, `incorrect` or `timeout`. |
| `next` | | Go on to the next pair; or to halftime, or the end of the game, when time, the packet or `maxTossups` runs out. |
| `throw_out` | `note` (optional) | The current question is discarded (misread, broken question). |
| `clock_pause`, `clock_resume` | | The game clock stops or restarts. |
| `time_expired` | | Time ran out; the current question and its bonus finish first (Rule 5-6). |
| `start_half` | | The second half begins with the next pair. |
| `set_lineup` | `team`, `playerIds` (1 to 4) | A new lineup: before the game, at halftime or before a tiebreaker (Rule 8-1). |
| `start_tiebreak` | | A tiebreaker begins with the next pair: toss-ups only, no clock (Rule 6-4). |
| `adjust_score` | `team`, `delta`, `note` | A manual correction, e.g. after a challenge. `delta` may be negative. |
| `end_game` | | The game ends. |

**Scoring.** Replaying the events with the game's `rules` gives the score:

- A correct toss-up gives the buzzing team `points.tossup`, and that team hears the bonus (no bonuses in tiebreakers).
- A fault (`incorrect`, `blurt`, `stall`, `communication`) scores nothing, and that team may not buzz again on
  this toss-up. If the buzz was an interrupt (before the `tossup_read` of the current reading), the other team
  gains `points.interruptFault` (`opponent_gains`), or the interrupting team loses it (`interrupter_loses`), and
  the toss-up is read again in full for the other team (a new reading, ended by its own `tossup_read`). If both
  teams fault on interrupts, both penalties count (Rule 6-3).
- A correct bonus gives the team that won the toss-up `points.bonus`.
- `adjust_score` adds `delta` to the team's score. Other events score nothing.

Rebound's `replay()` in `src/core/rules/engine.ts` is the reference: it also checks that every event is allowed
when it happens (for example, no buzz from a team that already had its chance) and refuses a log that breaks the rules.

```json
{
  "nsbjson": "1.0",
  "kind": "game-log",
  "generator": "Rebound",
  "exportedAt": "2026-11-07T18:30:00.000Z",
  "game": {
    "id": "g-mh2x81qz4k",
    "createdAt": "2026-11-07T17:58:00.000Z",
    "updatedAt": "2026-11-07T18:01:15.000Z",
    "presetId": "practice-untimed",
    "season": "2027",
    "rules": {
      "name": "Practice (no game clock)",
      "points": { "tossup": 4, "bonus": 10, "interruptFault": 4 },
      "interruptFaultMode": "opponent_gains",
      "timing": { "tossupWindowSec": 5, "reboundWindowSec": 5, "bonusSec": 20, "bonusWarningAtSec": 15, "naturalPauseSec": 2 },
      "visualBonus": { "sec": 30, "warningAtSec": 25 },
      "clock": null,
      "maxTossups": null,
      "tiebreakTossups": 5
    },
    "format": "game",
    "packet": { "setId": "doe-hs-17", "setTitle": "DOE High School Sample Set 17", "roundId": "doe-hs-17-r01", "roundLabel": "Round 1" },
    "pairs": [
      { "tossupId": "doe-hs-17-r01-t01", "bonusId": "doe-hs-17-r01-b01", "subject": "biology" },
      { "tossupId": "doe-hs-17-r01-t02", "bonusId": "doe-hs-17-r01-b02", "subject": "chemistry" }
    ],
    "teams": [
      { "name": "Gold", "playerIds": ["p-ann", "p-al"] },
      { "name": "Blue", "playerIds": ["p-bo"] }
    ],
    "players": [
      { "id": "p-ann", "name": "Ann" },
      { "id": "p-al", "name": "Al" },
      { "id": "p-bo", "name": "Bo" }
    ],
    "events": [
      { "type": "start", "t": 1794074400000 },
      { "type": "tossup_read", "t": 1794074406000 },
      { "type": "buzz", "t": 1794074407200, "team": 0, "playerId": "p-ann" },
      { "type": "tossup_judged", "t": 1794074409000, "result": "correct" },
      { "type": "bonus_read", "t": 1794074415000 },
      { "type": "bonus_judged", "t": 1794074430000, "result": "incorrect" },
      { "type": "next", "t": 1794074432000 },
      { "type": "buzz", "t": 1794074436000, "team": 1, "playerId": "p-bo" },
      { "type": "tossup_judged", "t": 1794074437000, "result": "incorrect" },
      { "type": "tossup_read", "t": 1794074445000 },
      { "type": "buzz", "t": 1794074446500, "team": 0, "playerId": "p-al" },
      { "type": "tossup_judged", "t": 1794074448000, "result": "correct" },
      { "type": "bonus_read", "t": 1794074455000 },
      { "type": "bonus_judged", "t": 1794074470000, "result": "correct" },
      { "type": "end_game", "t": 1794074475000 }
    ],
    "status": "finished",
    "finalScores": [22, 0]
  }
}
```

Gold scores 4 for the first toss-up and misses the bonus; Blue interrupts the second toss-up and is wrong, so
Gold gains 4 and hears the whole toss-up again, answers it (4) and the bonus (10): 22 to 0.

## Versioning

`nsbjson` is `"MAJOR.MINOR"`.

- **Additive changes bump the minor version** (1.1, 1.2, …): a new optional field, a new kind, a new value in a
  list (a subject, an event type, a flag). A program written for 1.0 can read every 1.x file, apart from what
  the later version added.
- **Anything else bumps the major version** (2.0): removing or renaming a field, changing its type or meaning,
  making an optional field required.

Programs that read NSB-JSON:

- read any 1.x file, and **ignore fields they do not know** (keep them when rewriting the file, if they can);
- refuse a file with a higher major version, saying so in plain words;
- treat a value they do not know in a list as unknown, not as an error for the whole file: show a question with
  an unknown subject under "other", but do not re-score a game log that has an event type you do not know.

Programs that write NSB-JSON write the lowest version that has every field they use (`"1.0"` for everything in
this document), never give a field a different meaning, and name fields of their own with an `x-` prefix
(`"x-mytool-difficulty"`) so that later versions never collide with them.

## Validating

The schema checks a file's structure, types and lists of values. With [Ajv](https://ajv.js.org/):

```js
import Ajv2020 from 'ajv/dist/2020.js';
import schema from './nsb-json.schema.json' with { type: 'json' };

const validate = new Ajv2020({ allErrors: true, validateFormats: false }).compile(schema);
if (!validate(doc)) console.log(validate.errors);
```

`format` keywords (`date-time`, `uri`) are annotations unless your validator checks formats (for Ajv, add
`ajv-formats`). Some things the schema cannot check: that ids are unique, that `answer` matches the choice
`answerLetter` names, and that a game's events follow the rules (replaying them does).

The schema describes the current 1.x version, and older 1.x files stay valid against it; validate a file with
the schema of its own version or a later one. It allows fields it does not define, as the versioning rules
require, so a misspelled optional field is not an error.
