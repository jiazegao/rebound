# The question pipeline: foundations

Rebound's library is everything DOE has published, 23,720 questions, the newest from 2022, and a team that
practices hard runs out of fresh rounds. The plan is a pipeline that writes new rounds in NSB format and checks
them before a person signs them off. The plan itself is
[docs/QUESTION-PIPELINE.md](https://github.com/jiazegao/rebound/blob/research/question-writing/docs/QUESTION-PIPELINE.md)
on the `research/question-writing` branch.

This folder holds the plan's first stage: the parts that are plain code and need no model. Nothing here
writes a question yet, and nothing here changes the site.

| Part | File | What it does |
|---|---|---|
| Style in numbers | `profile.ts` → `data/style-profile.json` | DOE's 2019–22 sets measured by level, category and toss-up or bonus: how many questions are multiple choice, numeric, "Identify all" or "Rank"; how long stems and choices run; how one DOE round differs from the next |
| House-style checks | `checks.ts`, `check.ts` | Fixes what needs no judgment, then lists what is wrong with a question or a round |
| Library search | `search.ts` | Finds the library questions a draft might repeat, by answer and by keywords |
| Lab table | `labs.ts`, `data/labs.json` | DOE's 17 national laboratories: current names, names they no longer have, home and news pages |
| Source lists | `sources.ts`, `data/sources.json` | The sites a model may read when checking a fact, and the sites it may never use |
| Ledger | `ledger.ts`, `types.ts` | One record per question the pipeline writes, from idea to play |
| Fixed test sets | `data/eval/` | The matches and faults Rebound's November 2026 pilot found by hand |

## Commands

```bash
npm run gen:check -- packet.nsb.json        # check a file of questions (NSB-JSON); exits with 1 on any error
npm run gen:check -- questions.nsb.json --level ms
npm run gen:check -- old-packet.nsb.json --old   # leave out the "nothing out of date" checks
npm run gen:check -- --doe                  # DOE's own 2019–22 questions through the same checks
npm run gen:search -- --stem "A lichen is a partnership between a fungus and what other organism?" --answer "ALGAE"
npm run gen:profile                         # rebuild data/style-profile.json after the library changes
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
`nearCopies` returns questions a draft all but copies, by the studio's fingerprint (9 bits or fewer of 64) or
by 30% of three-word runs shared; those need no judge.

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

## Tests

`npm test` runs them with the rest. The ones that read the library are skipped when `public/data/doe` has not
been built.

## What comes next

Stage B of the plan adds the model steps (ideas, writing, the duplicate judge, blind solvers, source checks,
difficulty rating), each tested on these fixed sets and on a sample of DOE's own questions before it is
trusted. It needs a Claude API key, kept as a secret of the machine that runs it and never in this repository.
