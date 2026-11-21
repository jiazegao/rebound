# The question pipeline

Rebound's library is everything DOE has published, 23,720 questions, the newest from 2022, and a team that
practices hard runs out of fresh rounds. The plan is a pipeline that writes new rounds in NSB format and checks
them before a person signs them off. The plan itself is
[docs/QUESTION-PIPELINE.md](https://github.com/jiazegao/rebound/blob/research/question-writing/docs/QUESTION-PIPELINE.md)
on the `research/question-writing` branch.

This folder holds the plan's first stage, the parts that are plain code and need no model, and most of its
second: every step a model does, and the trials that measure each one. No trial has been run yet, so no
question has been written by it, and nothing here changes the site.

| Part | File | What it does |
|---|---|---|
| Style in numbers | `profile.ts` → `data/style-profile.json` | DOE's 2019–22 sets measured by level, category and toss-up or bonus: how many questions are multiple choice, numeric, "Identify all" or "Rank"; how long stems and choices run; how one DOE round differs from the next |
| House-style checks | `checks.ts`, `check.ts` | Fixes what needs no judgment, then lists what is wrong with a question or a round |
| Library search | `search.ts` | Finds the library questions a draft might repeat, by answer and by keywords |
| Lab table | `labs.ts`, `data/labs.json` | DOE's 17 national laboratories: current names, names they no longer have, home and news pages |
| Source lists | `sources.ts`, `data/sources.json` | The sites a model may read when checking a fact, and the sites it may never use |
| Ledger | `ledger.ts`, `types.ts` | One record per question the pipeline writes, from idea to play |
| Fixed test sets | `data/eval/` | The matches and faults Rebound's November 2026 pilot found by hand |
| Model calls | `llm.ts`, `key.ts` | The one door to the Claude API: what each call may see, what it cost, and a spending limit |
| Round plan | `plan.ts` | The slots a round's questions are written to fill: category, toss-up or bonus, form, skill, topic and key letter, drawn from the style profile with a seed |
| Model steps | `steps/` | The prompt, reply format and reading of each step a model does (the table below) |
| The flow | `flow.ts` | Takes slots through ideas, the idea screen, writing, the house-style checks, the text screen, a blind solver and the rating |
| Trials | `trials/` → `data/trials/` | Each model step run on a fixed test set and scored. They cost money, so they are run by hand |

## Commands

```bash
npm run gen:check -- packet.nsb.json        # check a file of questions (NSB-JSON); exits with 1 on any error
npm run gen:check -- questions.nsb.json --level ms
npm run gen:check -- old-packet.nsb.json --old   # leave out the "nothing out of date" checks
npm run gen:check -- --doe                  # DOE's own 2019–22 questions through the same checks
npm run gen:search -- --stem "A lichen is a partnership between a fungus and what other organism?" --answer "ALGAE"
npm run gen:profile                         # rebuild data/style-profile.json after the library changes

npm run gen:plan -- --level hs --tier late --seed 3   # a round's slots (free)

npm run gen:key                             # is the Claude API key there, and does it work? (one tiny paid call)
npm run gen:trial:judge -- --limit 20       # the duplicate judge on the pilot's labelled drafts (paid)
npm run gen:trial:doe -- --sample           # the make-up of the DOE sample (free)
npm run gen:trial:doe -- --solve --limit 40 --mode live   # the blind solver on DOE's questions (paid)
npm run gen:trial:doe -- --rate             # the difficulty rater (paid)
npm run gen:trial:doe -- --known            # the solver on keys known to be wrong (paid)
npm run gen:trial:checks -- --compute       # numeric answers worked again in code (paid)
npm run gen:trial:checks -- --source        # facts checked against the allowed sites (paid)
npm run gen:trial:checks -- --second        # the second look on wrong and right keys (paid)
npm run gen:trial:writers -- --limit 8      # two writers on the same slots, by questions per dollar (paid)
```

## House-style checks

`tidy` fixes, without asking: spacing, apostrophes and minus signs as the library prints them (`don’t`, `–3`);
numeric choices put in rising order; and the key moved to the letter the round plan chose, so keys spread over
W to Z. It does not change capitals: turning `mL` into `ML` would be an error, so capitals are only checked.

`checkQuestion` then lists findings. An error fails the question; a warning is for the reviewer.

| Error | Meaning |
|---|---|
| studio errors | The Write studio's own checks (`src/core/studio.ts`): four distinct choices, a marked letter, two choices the answer checker would both accept, an answer not in simplest form, an unmatched bracket |
| `key-not-accepted`, `accept-not-accepted`, `reject-accepted`, `letter-text-mismatch` | The answer line disagrees with the answer checker or with itself |
| `mc-ending` | A multiple-choice stem that does not end in a question mark |
| `refers-to-choices` | "All of the above", "none of the above", "both W and X" |
| `because-clause` | A choice that carries its own reason |
| `right-choice-long` | The right choice is 50 characters or more and at least 1.25 times the next longest |
| `list-form`, `list-answer` | An "Identify all" or "Rank" question that leaves DOE's wording, numbering or answer form |
| `answer-in-lab-name` | A lab whose name contains the answer ("Princeton Plasma Physics Laboratory" … PLASMA) |
| `stem-long` | A stem more than 1.25 times the length nine in ten of DOE's stems stay within, for its level, category and kind |
| `former-lab-name` | A name a lab no longer has |
| `time-tied` | Wording that will not stay true ("currently", "the newest", "in 2026") with no date recorded |
| `energy-source` | An Energy question that names a lab without the dated news item it was written from |

Warnings: a stem longer than nine in ten of DOE's, long choices, an answer said in its own question, an answer
not in capitals, "we" or "my", a lower-case "not", list punctuation, and the studio's warnings.

`checkRound` judges a set of questions together. Errors: a letter holding under 15% or over 35% of the keys
(with eight or more keys); the right choice the longest more often than in 95% of DOE's rounds; more than one
NOT question. Warnings say where stem lengths, choice lengths or the share of multiple choice fall outside the
range of DOE's own rounds.

### How the thresholds were set

They were tuned on DOE's own 2019–22 questions, with the bar that at least 95% must pass. `npm run gen:check -- --doe`
prints the current figures; on 21 November 2026:

- **4,478 of 4,652 pass with no error (96.3%).** Stem length accounts for 142 of the 174 that fail, by design:
  it fails the longest 3%.
- No other rule fails more than 12 questions (0.26%). Two of DOE's own questions name Princeton Plasma
  Physics Lab and have the answer "plasma".
- The automatic fixes leave DOE's questions alone apart from typography and two sets of numeric choices that
  DOE printed out of order.
- The key-letter rule is stricter than DOE's practice. DOE's keys are even over a whole set, a quarter on each
  letter, but not within each round: about a third of its recent rounds would fail. A generated round meets
  the rule for free, because the round plan chooses each key's letter.

The pilot's faults are a fixed test (`data/eval/pilot-faults.json`): the lab whose name held the answer, the
long right choice, the "because" clauses, the five questions naming a renamed lab, and the two first-draft
rounds with half their keys on X. All are caught.

Two rules changed from the plan once they met the data. The plan failed a right choice "half again as long as
the next longest"; none of the pilot's long right choices was that much longer, so the rule became 1.25 times
with a minimum length. And an answer said in its own question is a warning, not an error: in DOE's sets that
is usually harmless ("oxygen-18-labeled water … what product?" OXYGEN).

## Library search

`neighbours` returns the questions to put in front of a judge: the top 20 of a keyword search (BM25, a
standard ranking that favours shared uncommon words) and the top 20 of the questions with the same answer.
`nearCopies` returns questions a draft all but copies, which need no judge: 60% of three-word runs shared, or
the studio's fingerprint (9 bits or fewer of 64) together with 30%.

The plan proposed 30% alone, and measuring it showed that to be far too low. Against the rest of the library
it called one in five of DOE's own 2019–22 questions a copy, most of them different questions sharing a stock
phrase ("Indole-acetic acid is an example of what class of plant hormones?" with "A see-saw is an example of
what class of lever?"). It also rejected three of the pilot's final questions that its checkers had passed.
From 60% up, the pairs are one sentence with a number or a name changed. A fingerprint match alone is not
enough either: among the pilot's drafts it paired a question about a prism with one about planets.

The fixed test is the pilot's 63 labelled pairs (`data/eval/duplicate-pairs.json`). The top 20 of the two
lists hold the matching library question for 61 of them: all 55 where the draft asked for the same answer
from the same cue, and 6 of the 8 where it reused a method with new numbers. The two misses state a fact in
words the library question does not share. One caution: 52 of the 63 were found by the pilot's writer with
word-based methods much like these, so only the 11 the checkers found are an independent test.

Search finds candidates. Deciding whether a candidate really is the same question is the judge's job, which is
a model's and belongs to the next stage.

## The lab table and the source lists

`data/labs.json` was checked against DOE's own list on the date in its `checked` field. A lab's `news` page is
given only where the page loaded that day; four labs' sites refuse automated requests and have none yet.
A name ending in Laboratory also matches Lab, Labs and Laboratories. Check the table every quarter
(MAINTAINING.md, "Question data").

`data/sources.json` starts narrow on purpose: U.S. government science agencies, the labs' own sites and
Wikipedia are allowed; OpenStax, NAQT, question banks and DOE's own question pages are banned; everything
else is unlisted and needs a person's decision. Add a site only after reading its terms on AI use.

## The ledger

Every question the pipeline writes gets a permanent id (`rb-hs-000123`) and one line in a JSON Lines file:
its slot, idea, text, sources, every check's result, the reviewer's decision, where it was released and what
play showed (`types.ts`, `BankRecord`). Each check records a hash of the words it ran on, so a question whose
wording changed afterwards cannot be released on old checks (`releaseBlockers`).

This repository is public, and a question read before it is played is spoiled. So the ledger and unreleased
rounds live outside it: in `private-data/gen/` (ignored by git), or wherever the `REBOUND_BANK` environment
variable points.

## Model calls, the key and the spending limit

Every model step builds requests for `llm.ts` and reads its replies; nothing else here talks to the network.
A request holds only what its step may see: the blind solver's has the question as a moderator reads it and
nothing else, so the solver cannot be shown the answer by accident.

- **The key** is read from the `REBOUND_ANTHROPIC_API_KEY` environment variable, or `ANTHROPIC_API_KEY` when
  that is not set. It is never printed or written to a file. `npm run gen:key` says whether it is there and
  whether it works.
- **A key for a whole organization needs a workspace.** A key made for one workspace works as it is. One made
  for the organization must name a workspace with every request: `npm run gen:key` finds it when the key may
  list workspaces, and remembers it in the bank folder. When it may not, set `REBOUND_ANTHROPIC_WORKSPACE_ID`
  to the workspace's ID from the Claude Console (Settings, Workspaces). The ID is no secret, but it names the
  account, so it is kept out of this repository.
- **Every call is recorded** with its model, tokens and cost in `private-data/gen/spend.jsonl`. Costs are
  worked out from the prices in `llm.ts`, read from Anthropic's price list on the date given there; a model
  with no recorded price is refused.
- **Nothing is sent past the limit.** A trial stops when the recorded spending reaches its limit: $40 for
  the whole of stage B unless `--budget` says otherwise. A batch is not sent unless its forecast fits. The
  limit set on the Claude Console account is the backstop.
- **Batches** cost half and usually finish within the hour. A batch's id is saved before anything else, and
  replies are saved as they arrive, so a run that is stopped or repeated never pays for the same answer twice.
  A changed prompt starts a new folder of replies; an unchanged one reuses what it has.

Two things differ inside a Claude Code cloud session. A variable called `ANTHROPIC_API_KEY`, saved on the
cloud environment, is kept from the commands a session runs: on 21 November 2026 neither the session this was
built in nor one started after the variable was saved could see it. (That name also controls Claude Code's own
sign-in.) So save the key on the environment as `REBOUND_ANTHROPIC_API_KEY`. A variable reaches a session
when it starts; a session that is already running gets it when its machine next restarts, which happens after
it has been idle. And `ANTHROPIC_BASE_URL` points at the session's own service, so `llm.ts` sets the API's
address itself.

## The round plan

`planRound` gives a round's slots. The categories run in the cycle of DOE's 2021–22 sets (Biology, Chemistry,
Earth and Space, Energy, Math, Physics), four times, with Energy left out of the last pass: 23 pairs, of which
the first 18 are a whole virtual-format round. Each slot's form (multiple choice, short answer, "Identify all",
"Rank") and whether it is a calculation are drawn from the style profile for its category and kind, so a
planned round has DOE's mix. A draw whose share of multiple choice falls outside the range of DOE's own
rounds is thrown back.

Of the slots that are not calculations, half ask for application in a late round and 30% in an early one;
the rest ask for recall. That split is our own starting point, not DOE's. Topics are drawn in proportion to
how often DOE asks them at the level, half as much again for topics it asks only 30 to 99 times, and no topic
fills more than two slots of a round. Multiple-choice slots are given their key letters in turn, so the keys
are spread evenly whatever is written.

## The model steps

| Plan step | File | Model to start with | What it is given | What it returns |
|---|---|---|---|---|
| 2. Propose ideas | `steps/ideas.ts` | Opus 5.5 | The level, one topic's slots, a few DOE questions of the level, the answers the library has used in the topic | Three ideas a slot: answer, fact, cue, and the method for a calculation |
| 3. Screen the ideas | `steps/judge.ts` | Haiku 5.5 | One idea and the 40 or so library questions search found | Same, reversed, template, related or new, with the question it is closest to |
| 4. Write | `steps/write.ts` | Opus 5.5 | The slot, the idea, DOE's house style, the library questions near the idea | The question as data, with its reasons |
| 5. Repair | `steps/write.ts` | Opus 5.5 | The same, the draft, and what the code checks found | The question again, once |
| 6. Screen the text | `steps/judge.ts` | Sonnet 5.5 | The finished question and what search found for it | The same five classes |
| 7. Blind solve | `steps/solve.ts` | Sonnet 5.5 | The question as read, and nothing else | An answer, other defensible answers, faults, seconds, difficulty |
| 7. Recompute | `steps/compute.ts` | Sonnet 5.5, with code | A numeric question as read | The answer worked in code, and whether the values given can all be true |
| 7. Source | `steps/source.ts` | Sonnet 5.5, with search | The question and its answer line | Supported, contradicted or not found, with the search tool's own citation |
| 7. Second look | `steps/second.ts` | Opus 5.5, with search or code | The question, its answer line and what the checks found | Key right, key wrong or ambiguous, and a fix for an ambiguous one |
| 8. Rate | `steps/rate.ts` | Sonnet 5.5 | The question, with DOE questions of each tier | A score from 1 to 5 |

A checker never sees the writer's reasons, and is never the writer's own model.

`steps/brief.ts` builds what the writer is told about a slot: how hard the round is meant to be, in DOE's own
words for where each event's questions come from; a few DOE questions of that level, tier and category; and
the answers the library already uses in the topic.

Three things differ from the plan:

- **The writer has no code tool.** Its calls can then go in a half-price batch. Every numeric key is worked
  again in code at step 7, blind, which is where a wrong one is caught either way.
- **A reply that searches or runs code cannot be held to a JSON shape.** Those steps end their reply with a
  JSON object or two fixed lines, read from the end of the text.
- **Energy questions wait for the news collector.** The idea and writing steps take a lab news item, and
  the collector that gathers them is not built yet.

## The flow

`makeDrafts` (`flow.ts`) takes a list of slots through steps 2 to 8 as far as one blind solver and the
rating, a stage at a time, so each stage can go as one batch. A draft falls out at the stage that fails it,
with the reason. One that comes through with a doubt on it (the solver gave another form of the answer, named
a second answer, or reported a fault) is marked for the second look: only a failed check rejects a question.

Still to be joined on: the second solver, the recomputation, the source check and the second look (their
steps are built and have trials of their own), the assembly of a round, and the ledger.

## Trials

A trial runs one model step on a fixed test set and writes a summary to `data/trials/`. The scoring of each
is tested against a stand-in for the API (`trials/standin.ts`), so it is known to work before money is spent.
Use `--limit` first: a small run shows what a call really costs, and writes no summary.

| Trial | Test set | What it must show |
|---|---|---|
| `trials/judge.ts` | The pilot's 55 drafts that repeat a library question, 13 that reuse a method, and 56 its checkers found different | At least 52 of the 55 thrown away, and at least four in five of the different ones kept |
| `trials/doe.ts --solve` | 1,200 DOE questions of 2014–22: 50 for each level, category and tier | How often a solver with only the question disagrees with a right key, and what it flags |
| `trials/doe.ts --rate` | A quarter of that sample, with four DOE questions of each tier shown as anchors | Whether the rater can tell DOE's rounds 11 and later from its rounds 1–10 |
| `trials/doe.ts --known` | Seven answer letters DOE misprinted and two keys the pilot disputed | Whether the solver catches them |
| `trials/checks.ts --compute` | 60 DOE questions with numeric answers | How often working it again in code disagrees with a right key |
| `trials/checks.ts --source` | 40 DOE fact questions; the seven misprinted letters as printed; the two disputed keys; the pilot's five questions that name a renamed lab | Whether a search supports a right key, contradicts a wrong one, and notices the new name |
| `trials/checks.ts --second` | The same wrong and disputed keys with what a solver said; right keys with a solver who was wrong; spot checks | Whether the second look overturns a wrong key and upholds a right one |
| `trials/writers.ts` | 60 slots of planned late rounds, Energy left out, filled by Opus 5.5 and by Sonnet 5.5 | Questions that come through per dollar, for each writer's whole set-up |

The writer comparison checks each writer's drafts with a different model, since a checker is never the
writer's own: Sonnet checks what Opus wrote, and Opus checks what Sonnet wrote. So it compares two whole
set-ups, which is the choice to be made, and is not a like-for-like test of the writers alone. The questions
it writes are unreleased: they are kept in the bank folder, and the summary has counts and costs only.

No trial has been run yet: they wait for the key.

## Tests

`npm test` runs them with the rest. The ones that read the library are skipped when `public/data/doe` has not
been built.

## What comes next

The rest of stage B is running the trials above, changing a prompt where a step misses its bar, and replacing
the plan's cost table with measured numbers. Stage C then joins the steps into one run that makes two
late-tier rounds end to end: the news collector for Energy, the second solver, the assembly of a round and the
ledger.
