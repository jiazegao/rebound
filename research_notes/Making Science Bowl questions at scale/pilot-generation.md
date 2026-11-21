# Pilot, part 1: writing NSB rounds with an LLM and building blind tests

Run on 2026-11-21 from 05:16 to 06:02 UTC by Claude, working from its own knowledge: no web
searches or fetches. Python and Rebound's own code were used only for arithmetic, parsing and checks. Nothing in
the repository was changed. Everything this note describes is in `pilot/`; the scripts are in the session
scratchpad (`research/pilot/`).

**Do not give this note, `pilot/key/` or `pilot/logs/` to the checkers.** They contain answers and say which
questions are generated. Checkers get only `pilot/blind/`.

## Results in brief

- **Two complete rounds, 72 questions**: one high school (HS) and one middle school (MS) round of 18
  toss-up/bonus pairs each. Each follows the category order of DOE's 2022 Round 1 at its level, with nearly the
  same multiple-choice/short-answer mix (17 against 18 multiple-choice questions in HS, 16 against 17 in MS).
- **The self-review pass changed 15 of the 72 questions (16 edits) and found no wrong answer keys.** Nine edits
  only reordered choices, because the draft's keys were bunched on X (8 of 17 HS and 8 of 16 MS multiple-choice
  keys). The other seven fixed one giveaway, one ambiguity, two loose wordings, one weak distractor, one answer
  line and one style lapse.
- **The self-review missed the biggest problem: originality.** I checked the reviewed set against the library's
  23,720 DOE questions. In 33 of the 72 questions (46%), an existing DOE question asked for the same answer from
  the same cue, sometimes with the same numbers or nearly the same words. MS was worse (20 of 36) than HS (13 of
  36). Replacements had the same problem: 22 of 59 replacement candidates (37%) also matched a DOE question.
  **Rebound's own near-duplicate check (SimHash, 9-bit threshold) flags none of the 41 matched pairs.**
- **Final set**: I re-checked every key (all computations re-run in Python). My confidence that the answer is
  correct and the only defensible one is 5 for 64 questions and 4 for 8.
- **Blind tests**: 54 questions per level (36 generated + 18 DOE controls matched on category and
  toss-up/bonus), drawn with seed 20261121. All validation checks pass.

## 1. What I studied, and the structure I matched

I read `src/core/schema.ts`, `schema/nsb-json.schema.json`, `docs/NSB-JSON.md`, both DOE manifests and the
upload code. I chose the rounds to study by listing each round's category order and format counts (metadata only,
no question text) for HS sets 16-17 and MS sets 15-16, the most recent sets. MS set 15 (2021) is an irregular
virtual format: 15 pairs, five category letters, and some bonuses outside their toss-up's category. So both MS
rounds come from MS set 16. I read the full text of four rounds:

| Round | Season | Pairs | Category order | Toss-ups MC / SA | Bonuses MC / SA |
|---|---|---|---|---|---|
| doe-hs-17-r01 (Round 1) | 2022 | 18 | B C E N M P, three times | 12 / 6 | 6 / 12 |
| doe-hs-16-r02 (Round 2) | 2021 | 18 | B C E N M P, three times | 6 / 12 | 6 / 12 |
| doe-ms-16-r01 (Round 1) | 2022 | 18 | B C E N M P, three times | 11 / 7 | 6 / 12 |
| doe-ms-16-r08 (Round 8) | 2022 | 18 | B C E N M P, three times | 9 / 9 | 8 / 10 |

(B Biology, C Chemistry, E Earth and Space, N Energy, M Math, P Physics.) Every bonus is in its toss-up's
category. In every round of HS sets 16-17 and MS set 16, the order is the same six-category cycle; only the
starting category changes.

**Matched structure.** HS follows doe-hs-17-r01 and MS follows doe-ms-16-r01: 18 pairs in the order B C E N M P,
repeated three times, with each bonus in its toss-up's category.

| | Toss-ups MC / SA | Bonuses MC / SA | All MC |
|---|---|---|---|
| HS generated | 11 / 7 | 6 / 12 | 17 of 36 |
| doe-hs-17-r01 | 12 / 6 | 6 / 12 | 18 of 36 |
| MS generated | 10 / 8 | 6 / 12 | 16 of 36 |
| doe-ms-16-r01 | 11 / 7 | 6 / 12 | 17 of 36 |

**Conventions I followed.**
- Units come before the question ("In meters, ...", "To one decimal place, ...").
- Pronunciation guides go in brackets ("deuterostome [DOO-ter-oh-stome]").
- Choices are W-Z, short and parallel. The answer line reads "Y) TEXT" in capitals.
- Short-answer lines use "(ACCEPT: ...)", "(DO NOT ACCEPT: ...)" and "(accept in either order)".
- "Identify all of the following three ...: 1) ...; 2) ...; 3) ..." questions are answered "1, 3".
- Energy questions are framed as work at a DOE national lab ("Scientists at ... are studying ..."), but the
  answer rests on ordinary science, not on knowing the research.
- I used curly apostrophes and en-dash minus signs, the library's majority typography, so typography would not
  give away the source.

**How bonuses differ from toss-ups in the studied rounds.**
- Bonuses are mostly short answer (12 of 18 in three of the four rounds).
- Bonuses carry the multi-step work, since a bonus allows 20 seconds and a toss-up 5. Numeric short-answer items:
  6-9 bonuses per round against 2-5 toss-ups.
- All 9 "Identify all"/"Rank" items in the four rounds are bonuses.
- Toss-ups are short, quick recall, and in 2022 often multiple choice. Every Math bonus is short answer.

## 2. What was written: counts by level, category and type

Each level has 3 toss-ups and 3 bonuses per category.

| Level | Category | Toss-ups MC | Toss-ups SA | Bonuses MC | Bonuses SA |
|---|---|---|---|---|---|
| HS | Biology | 2 | 1 | 1 | 2 |
| HS | Chemistry | 2 | 1 | 1 | 2 |
| HS | Earth and Space | 2 | 1 | 1 | 2 |
| HS | Energy | 2 | 1 | 2 | 1 |
| HS | Math | 1 | 2 | 0 | 3 |
| HS | Physics | 2 | 1 | 1 | 2 |
| MS | Biology | 1 | 2 | 1 | 2 |
| MS | Chemistry | 2 | 1 | 1 | 2 |
| MS | Earth and Space | 3 | 0 | 2 | 1 |
| MS | Energy | 2 | 1 | 1 | 2 |
| MS | Math | 0 | 3 | 0 | 3 |
| MS | Physics | 2 | 1 | 1 | 2 |

- **Difficulty spread** (my own guesses, in `logs/generation-meta.json`):

  | Level | Easy | Easy-medium | Medium | Medium-hard | Hard |
  |---|---|---|---|---|---|
  | HS | 4 | 9 | 19 | 3 | 1 |
  | MS | 12 | 5 | 17 | 2 | 0 |

- **Keys**: multiple-choice keys are spread across W/X/Y/Z: 4/4/4/5 in HS and 4/4/4/4 in MS.
- **Tags**: Rebound's tagger gives a topic to 35 of the 36 HS and 33 of the 36 MS questions.

## 3. Self-review: what one pass caught

Every question got one pass against a fixed checklist:
- the key is correct (every computation re-run in Python);
- exactly one answer is defensible;
- the stem does not give the answer away;
- the answer line has the ACCEPT / DO NOT ACCEPT entries a moderator needs;
- the wording is precise and reads well aloud;
- the question fits the time limit without a calculator;
- the choices are plausible and parallel;
- across the round, the keyed letters are spread out.

**16 edits on 15 questions** (9 HS, 7 MS):

| Kind | Edits |
|---|---|
| Answer-key balance (choices reordered) | 9 |
| Wording precision | 2 |
| Distractor quality | 1 |
| Style | 1 |
| Answer line | 1 |
| Giveaway | 1 |
| Ambiguity | 1 |

No key was wrong in the draft.

| Question | Kind | What changed | Why |
|---|---|---|---|
| pilot-gen-hs-r01-t08 | answer-key balance | Choices reordered; key Y to Z | Draft keys were bunched: 8 of 17 HS keys on X, 1 on Z |
| pilot-gen-hs-r01-b04 | answer-key balance | Choices reordered; key X to Z | same |
| pilot-gen-hs-r01-t13 | answer-key balance | Choices reordered; key X to Z | same |
| pilot-gen-hs-r01-t14 | answer-key balance | Choices reordered; key X to W | same |
| pilot-gen-hs-r01-t15 | wording precision | "shortest day, as measured by its sidereal rotation period" became "shortest sidereal rotation period" | "Day" usually means the solar day, which invites a protest |
| pilot-gen-hs-r01-t15 | answer-key balance | Choices reordered; key X to Z | same as above |
| pilot-gen-hs-r01-b10 | distractor quality | Reframed as "which best explains why neutrons locate hydrogen better than X-rays", with four reasons as choices | "Photons in the sample" was not a plausible distractor, so the item reduced to nuclei versus electrons |
| pilot-gen-hs-r01-t05 | style | Choices "Absolute value of x" and "Cosine of x" became "\|x\|" and "cos x" | Choices were in two registers; NSB choices are parallel |
| pilot-gen-hs-r01-t18 | answer line | Added ACCEPT "FARADAY–LENZ LAW" and DO NOT ACCEPT "LENZ’S LAW" | Lenz's law is the likeliest near-miss; the moderator needs a ruling |
| pilot-gen-ms-r01-b04 | giveaway | Lab changed from Princeton Plasma Physics Laboratory to Lawrence Livermore; "more than 100 million degrees" softened to "millions of degrees" | The lab's name contained the answer, PLASMA |
| pilot-gen-ms-r01-t04 | answer-key balance | Choices reordered; key X to W | Draft keys were bunched: 8 of 16 MS keys on X, 2 each on W and Z |
| pilot-gen-ms-r01-t16 | answer-key balance | Choices reordered; key X to W | same |
| pilot-gen-ms-r01-t09 | answer-key balance | Choices reordered; key X to Z | same |
| pilot-gen-ms-r01-b10 | answer-key balance | Choices reordered; key X to Z | same |
| pilot-gen-ms-r01-b18 | ambiguity | "the student’s average power output" became "at what average rate ... does the student do work against gravity" | A person's power output is several times the work against gravity; only the latter is exactly 250 W |
| pilot-gen-ms-r01-b06 | wording precision | "a constant net force ... pushes it" became "acts on it" | A net force is a sum, not a push |

(Several of these questions were later replaced in the originality stage; the log keeps the self-review edits as
made. Full text is in `logs/self-review-log.json`; the untouched first draft is in `logs/draft-v1.json`.)

## 4. Beyond self-review: the library originality check

The self-review found no originality problem. I had believed every question was original. A pipeline would
dedupe against its own bank, so I then compared the reviewed set with all 23,720 library questions.

**Method.** For each question I compared, against every library question:
- word 3-shingles of the stem and choices;
- content-word overlap with library questions that have the same answer, first matched exactly and then loosely
  (one answer contains the other, or half the answer words are shared).

I then read the closest matches. My rule: a question is a close paraphrase when a library question asks for the
same answer from the same cue (the same defining property, or the same computation with the same numbers).

**Process.** Every flagged question was replaced in its slot: same category, kind, format and key letter. Later
candidates were checked before use.

| Check | Questions replaced | Of which were earlier replacements | Candidates rejected before use |
|---|---|---|---|
| 1: exact answer match plus shingles | 20 | 0 | 0 |
| 2: loose answer match on the whole set; candidates screened in two batches | 14 | 5 | 11 |
| 3: loose match rerun on the whole set | 7 | 3 | 2 |
| Round assembly (section 4.3) | 0 | 0 | 1 |

That makes 33 slots replaced at least once. In `logs/originality-log.json` the field `round` is 1, 2 and 4 for
these three checks; 3 was the second candidate batch. The match counts in the summary follow from this table:

| | Written | Matched a DOE question |
|---|---|---|
| Reviewed draft | 72 | 33 (46%) |
| Replacement candidates | 59 | 22 (37%) |
| All questions written in the pilot | 131 | 55 (42%) |

The 22 matched candidates are the 8 earlier replacements plus the 14 rejected candidates.

| Slots replaced | Count |
|---|---|
| By level | MS 20, HS 13 |
| By category | Earth and Space 10 of 12, Physics 8 of 12, Biology 5, Energy 4, Math 3, Chemistry 3 |
| By kind | 19 toss-ups, 14 bonuses |

The matched DOE questions span every season, 2007-2022.

### 4.1 Which paraphrases were found

Some were close copies:
- The XeF₄ geometry question matches doe-hs-02-r09-b08 down to the "[ZEE-non]" pronunciation guide.
- The lens question used DOE's exact numbers (an object 10 cm from a lens with a 20 cm focal length; doe-ms-07-r05-t19).
- Others reused DOE's numbers: the divisors of 360 (doe-hs-04-r14-b17); 5 m/s² for 3 s giving 22.5 m (doe-ms-14-r14-b20).
- Others reused DOE's whole question: two dice with a prime sum (doe-ms-13-r06-b12); balancing methane combustion
  for the O₂ coefficient (doe-ms-01-r18-b15).
- Two stems were identical: "Which of the following elements is a metalloid?" (doe-ms-06-r04-t23) and "Which of
  the following energy sources is ... a fossil fuel?" (doe-ms-08-r05-t17).
- A rejected candidate opened with the same nine words as doe-ms-04-r03-t21: "When you stretch a rubber band and
  hold it, what type of energy ...".
- A first-round replacement on programmed cell death and the webbing between an embryo's fingers was nearly
  doe-hs-10-r01-t04 verbatim.

Most were same-cue paraphrases: the most natural way to cue a basic fact turned out to be the way DOE had already
cued it. Examples:
- the outer core as the liquid layer;
- the new moon for a solar eclipse;
- transpiration through stomata;
- the hanging wall moving down on a normal fault;
- argon as the third most abundant gas;
- Pangaea at 250 million years ago;
- the ball at the top of its flight;
- why the same side of the Moon faces Earth.

All 41 replacements, each with its matched DOE question, are in `logs/originality-log.json`. The 14 rejected
candidates are in its `rejectedCandidates` fields and in `logs/round-check-log.json`.

**Rebound's existing check would not have caught them.** Rebound's own functions (`questionText`, `simhash`,
`hamming`) put the 41 replaced questions 13 to 41 bits from their matches (median 29). Studio's `nearDuplicates`
flags 9 bits or fewer, so it flags none of them. A 3-shingle Jaccard of 0.3 or more finds 3 of the 41.

**Kept, by rule or as borderline.**
- *Computation templates with new numbers* (the rule above does not count these):
  - a decagon's angle sum (DOE asked an octadecagon);
  - a 2-by-2 determinant;
  - an LCM;
  - a quadratic's roots;
  - two marbles drawn without replacement;
  - an echo from a cliff (DOE has a barn 85 m away at 340 m/s);
  - the pH after mixing acid and base (a studied round asked for normality).
- *Same topic, different cue*:
  - the pulmonary artery carrying oxygen-poor blood (DOE asks which vessel carries oxygenated blood);
  - minerals harder than quartz (DOE has Mohs ranking questions);
  - chlorine's electron affinity (DOE has an ordering question);
  - P-waves arriving first (DOE asks about P-wave properties).

### 4.2 Review of the replacements (one pass): 3 edits

| Question | Kind | What changed | Why |
|---|---|---|---|
| pilot-gen-hs-r01-t07 | wording precision | Rh-factor stem reworded | Clumsy second sentence when read aloud |
| pilot-gen-ms-r01-t12 | answer line | Added DO NOT ACCEPT: 55 | 55° is the angle from the mirror's surface |
| pilot-gen-ms-r01-t13 | wording precision | "outer covering of a tooth" became "of the crown of a tooth" | Enamel covers only the crown |

### 4.3 Round assembly: 1 change

Reading each round whole showed that three of the six HS Energy questions were about neutrons (b04, b10, t16).
Per-question review cannot see this. I replaced b10 with a question on which gas forms at the cathode in water
electrolysis.
- The first candidate, pumped hydro storing gravitational energy, was rejected: same cue as doe-hs-07-r08-t24.
- The phrase "make hydrogen fuel" was cut from the new stem because it pointed at the key.

**After all stages, 31 of the 72 final questions are unchanged from the first draft.**

## 5. The questions I am least sure of

These eight have confidence 4; the other 64 have 5.

| Question | Why it is a 4 |
|---|---|
| pilot-gen-hs-r01-t07 | Rh factor: players may say only "D" or "Rh"; the accept list may need to grow |
| pilot-gen-hs-r01-t09 | Termination shock: the hardest HS item, and the heliosphere's boundaries are often confused; heliopause and bow shock are rejected |
| pilot-gen-hs-r01-b13 | Loop of Henle: statement 1 says "descending limb" (strictly, the thin descending limb is the water-permeable part); statement 2 says "actively transports" (strictly, secondary active transport) |
| pilot-gen-hs-r01-t15 | Moon craters: someone may argue that Earth's atmosphere (not a choice) is the main reason |
| pilot-gen-ms-r01-b01 | Lichen: the partner is a green alga or a cyanobacterium; scoring depends on the accept list |
| pilot-gen-ms-r01-t02 | "Distilled water" as the pure substance: a pedant can point to dissolved gases |
| pilot-gen-ms-r01-b04 | "Reflects it": free-text phrasing varies ("bounces it back") |
| pilot-gen-ms-r01-t09 | Why temperature falls with height: the physical reason is the expansion of rising air, though only one choice is defensible |

Two other risks:
- **Energy framing is unverified.** It makes 11 claims about labs' work, such as NREL's perovskite cells and wind
  turbines, Argonne's batteries, ORNL's Spallation Neutron Source, INL's fuel tests, LBNL's cool roofs and LLNL's
  laser fusion. I believe all of them, but none was checked. No answer depends on them.
- **Borderline originality.** The kept items in section 4.1 are the ones a stricter rule would replace.

## 6. What was hardest to write

1. **Originality, above all at MS and for recall questions.** Definition and recall items converged on DOE's cues
   far more often than computations did: Earth and Space lost 10 of 12 slots and Physics 8 of 12. Escaping
   meant moving to application or scenario cues and new numbers. Even then 37% of fresh candidates matched,
   because the library already has many scenario questions too.
2. **Energy.** DOE's 2021-22 Energy questions are lab-framed. Without sources, the framing has to stay at
   well-known lab missions, and the answer has to rest on general science. One draft gave the answer away through
   a lab's name (Princeton Plasma Physics Laboratory, answer "plasma"). Four Energy slots matched DOE questions.
3. **Computations.** Easy to get right: no computed key was wrong. Hard to make new: my first choice of numbers
   was often DOE's own (the 10 cm/20 cm lens, 360, 5 m/s² for 3 s, 15% of 80 giving 12). Toss-up arithmetic also
   had to fit in five seconds.
4. **Multiple-choice construction.** The draft placed keys on X about half the time. One distractor was not
   plausible.
5. **Pitching MS difficulty.** By my own rating the MS round has 12 easy items and no hard ones. DOE's MS rounds
   reach into HS material (MS set 16 Round 1 asks for the p-value of a 3.3-sigma muon measurement). The
   originality replacements leaned toward simple scenarios, which made this worse. My bonuses also run longer
   than DOE's: median 28 words (HS) and 26 (MS), against 19-26 and 15-21 in the studied rounds.
6. **Answer lines.** Deciding ACCEPT and DO NOT ACCEPT without a judge to test them against real responses
   (Rh variants, lichen partners, "reflects").

## 7. The blind tests

Scripts:
- `build_blind.py` builds the tests, with seed **20261121**;
- `validate_blind.py` checks them.

Rebuilding gives byte-identical files.

**Draw.** For each level, 36 generated questions get 18 DOE controls, one per two generated questions.
- Controls are matched exactly on level and category: 3 per category, against 6 generated.
- Controls are matched on toss-up/bonus at each level: 9 toss-ups and 9 bonuses, the same 1:1 split as the
  generated questions. The seeded RNG chose which three categories get 2 toss-up controls and 1 bonus control:

  | Level | Categories with 2 toss-up controls |
  |---|---|
  | HS | Chemistry, Earth and Space, Math |
  | MS | Chemistry, Earth and Space, Energy |

  The other three categories get 1 toss-up and 2 bonuses.
- Within each level-category-kind cell, controls are drawn uniformly from the eligible pool.
- Generated questions and controls were shuffled together and given ids H001-H054 and M001-M054.

**Exclusions.** The three you specified, plus two hygiene rules (4 and 5) that I added:

| Rule | HS excluded | MS excluded |
|---|---|---|
| 1. From the four studied rounds | 72 | 72 |
| 2. Empty stem | 0 | 0 |
| 3. Needs an image: `visual`, a `figure`, the importer's "image-not-extracted" flag, or figure wording such as "shown below" | 8 | 11 |
| 4. Stored text or key may differ from DOE's print: importer flags such as possible-lost-formatting, mc-answer-mismatch, erratum or choices-reordered; an answer-line letter that disagrees with the stored key; incomplete choices | 208 | 184 |
| 5. Near-duplicate of a generated question (same loose answer and 25% or more content-word overlap, or 0.3 or more 3-shingle Jaccard), so no checker sees a generated question beside the DOE question it resembles | 162 | 136 |
| **Eligible pool left** | **11,372** | **9,695** |

Rule 5 is broad: it also removes unrelated questions that happen to share a common answer.

I read all 36 drawn controls: none needs a figure, so the manual exclusion list stayed empty.

**Files.**
- `blind/questions-hs.json` and `blind/questions-ms.json`: for each item, only the anonymous id, level,
  category (the library's category id, with a legend of names), toss-up or bonus, question type, stem and, for
  multiple choice, W-Z choices.
- `key/key-hs.json` and `key/key-ms.json`: each anonymous id mapped to its source ("generated" or "doe"), its
  original id and its answer line exactly as written or printed. Generated questions also carry my confidence
  (1-5).

**Validation (all checks pass).**
- **Counts**: 54 per level; 36 generated and 18 DOE; 6 + 3 per category; 18 + 9 toss-ups and 18 + 9 bonuses.
- **Ids**: the same ids in the blind and key files, contiguous.
- **Fields**: only player-facing fields in the blind files.
- **Text**: blind text identical to its source (whitespace collapsed); key answer lines identical to their
  sources; every multiple-choice key's letter matches the answer text.
- **No leaks**: no answer lines, letters, ids, sources or key field names anywhere in the blind files.
- **Answer text in the stem**: five hits, each read and judged not a leak:
  - two DOE list questions name their options in the stem;
  - one generated either/or question names both P- and S-waves;
  - in two generated questions a given number equals the answer by design: 20 g of sugar in 80 g of water gives
    20%, and the 35° mirror angle.

  These are allowlisted by original id, so a new draw cannot reuse them.

**Limits to keep in mind when reading the checkers' results.**
- **Controls span 2007-2022.** Five of the 36 have pre-2010 style that could reveal the source: lowercase choices
  after a trailing colon, or "Name all of the following 4 ...".
- **Fewer controls are multiple choice**: 5 of 18 HS and 6 of 18 MS controls, against 17 of 36 and 16 of 36
  generated.
- **Generated bonuses are wordier** than DOE's.
- **Two controls have keys that look questionable** to me:
  - doe-hs-03-r15-t21 keys ultraviolet as the band where supernovae are "most commonly detected";
  - doe-hs-01-r11-b23 leaves macrophages off a list of leukocytes.

  I left both in: the draw should not be filtered by quality, and DOE's own error rate is part of what the
  checkers measure.

## 8. How long it took

The run took 46 minutes of wall-clock time for one agent, from 05:16:16 to 06:01:50 UTC (`date` at the start and
the end). Stage times come from the file timestamps.

| Stage | Time (UTC) | Duration |
|---|---|---|
| Read the schema, docs, upload code and manifests; study four rounds | 05:16-05:27 | about 11 min |
| Draft 72 questions (draft v1 saved at 05:30:58) | 05:27-05:31 | about 4 min |
| Self-review pass (v2) | 05:31-05:35 | about 4 min |
| Library check and three rounds of replacements (v3-v5) | 05:35-05:46 | about 11 min |
| Round-assembly change (v6) | 05:46-05:49 | about 3 min |
| Build the set file and import copies, validate, dry-run Rebound's upload | 05:49-05:52 | about 3 min |
| Blind draw and validation | 05:52-05:57 | about 5 min |
| SimHash comparison and this note | 05:57-06:02 | about 5 min |

Most of the work after drafting was spent on originality, not on errors.

## 9. What a production pipeline should do differently

1. **Dedupe on answer and cue, not on wording, against every public set it can get** (DOE's sets and any shared
   packets).
   - Lexical checks miss most paraphrases: SimHash at 9 bits caught none of 41 and shingles caught 3.
   - Match on the answer first, then ask a similarity model or an LLM judge whether the cue is the same.
   - Budget for a large share of drafts failing: about 46% did here, 56% at MS.
2. **Generate against the grain.** Give the generator the library's existing questions for the target answer as
   cues to avoid. Ask for application or scenario cues, new numbers and multi-step reasoning. Prefer topics where
   the library is thin over the most famous facts.
3. **Automate the cheap checks that found real problems here.**
   - Shuffle choices so keys spread across W-Z.
   - Flag answer words in the stem, including names (a lab's name gave one answer away).
   - Re-run every computation in code.
   - Cap toss-up arithmetic and stem length.
4. **Verify independently before people see a question.** This pilot had no outside check.
   - Have a second model answer blind, without the key. `WrittenQuestion.ai.blindAnswer` and `blindAgreed`
     already exist for this.
   - Require a cited source for each fact, as the Write studio does before peer review.
5. **Assemble rounds with constraints**: topic diversity within a category (three neutron questions passed
   per-question review), the MC/SA mix, a difficulty spread, and length limits for bonuses.
6. **Build Energy questions from a vetted list of real, dated lab research summaries**, not from model memory,
   so the framing is true and current.
7. **Calibrate difficulty** with Rebound's own play data and DOE's round order. Generated MS rounds need
   deliberate hard items.
8. **Keep subject-owner review as the last gate**, and label AI-written questions, as the schema's `ai` field
   intends.
9. **For the next blind test**:
   - draw controls from the style era being imitated (for example 2014 onward), or match on question type too;
   - keep the near-duplicate exclusion.

## 10. Files

All paths are under `pilot/`.

- `generated-set.json`: both rounds in the library's set-file shape. The set id is `pilot-gen` and question ids
  look like `pilot-gen-hs-r01-t01`.
  - Category is marked as the library marks it (`subject` such as `earth_space`; `sourceCategory` such as
    "Earth and Space").
  - Answer fields come from Rebound's own answer-line parser, and topic tags from its tagger.
  - A library set carries a single `level`, but this file holds one round of each level. So the level ("HS" or
    "MS", as the library marks it) is on each round and each question, and the set lists `levels: ["HS", "MS"]`
    instead of a single `level`.
  - Each pair validates against the schema's `questionPair`.
- `import/pilot-gen-hs.nsb.json` and `import/pilot-gen-ms.nsb.json`: NSB-JSON `question-set` copies, one per
  level. Both are schema-valid. Rebound's real upload parser reads them with no warnings (dry run through
  `parseJson` in `src/lib/upload.ts`). The packet upload accepts JSON or PDF files, not pasted text.
  - **To load**: signed in and on a team, open Team → Packets, go to "Upload a packet", choose the file under
    Files, check the round, then click "Save packet" (also in `import/HOW-TO-LOAD.txt`).
- `blind/questions-hs.json`, `blind/questions-ms.json`: for the checkers.
- `key/key-hs.json`, `key/key-ms.json`: not for the checkers.
- `logs/`, not for the checkers:
  - `draft-v1.json`: the raw first draft;
  - `self-review-log.json`;
  - `originality-log.json`;
  - `replacement-review-log.json`;
  - `round-check-log.json`;
  - `generation-meta.json`: per question, the difficulty guess, confidence and the stages that changed it.
