# Rebound's question library, the integration points a generated set must fit, and what generating questions with the Claude API would cost

Scope and method. Everything below comes from local files only. That means the repository at `/home/user/rebound`, read-only (99 commits, 2026-11-07 to 2026-11-21), and the claude-api skill docs bundled at `/tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api`.

The scripts written for this research sit in `/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/`. Each `.py` there has a matching `.out` with the printed results. Every computed number below cites the `.out` file it comes from and states how it was computed.

- **Pricing.** All prices come from the skill's cached docs. The docs themselves say to fetch the live Pricing page before quoting dollar figures, which this local-only research could not do. Treat every price as "cached, not verified".
- **Library data.** The library was read from `public/data/doe/*.json` as it stood on 2026-11-21.

## 1. The library: composition, age, gaps and known quality issues

### Takeaway
The library holds 23,720 questions in 34 DOE sample sets: 17 high school sets, 16 middle school sets and the middle school "Sample Rounds". That makes 507 rounds (11,860 toss-up/bonus pairs) from the 2007–2022 regionals.

- **Age and completeness.** The questions average about 12 years old. Nothing is newer than the 2022 season. Imports are 99.9% complete.
- **Flags.** 517 questions still carry an import flag, mostly "possible lost formatting".
- **Duplicates.** Exact duplicates are few: 167 redundant copies in 163 groups, 53 of those groups across levels. The studio's near-duplicate threshold matches 343 pairs.
- **Thin topics.** Nuclear chemistry, equilibrium, kinetics, development, the grid, solar, Earth's interior and fluids are thin at high school. Middle school chemistry (836 questions after the 2027 Physical Science split) is the smallest core subject.
- **Dated content.** About 1.8% of stems use time-sensitive wording, concentrated in Energy and Earth and Space. About 30% of Energy questions are "DOE labs and research programs" items, the kind that dates fastest.

### Cited Findings

**Sets, levels and source seasons**
- The HS manifest lists 17 sets from DOE's HS sample page, with years and evidence. Sets 1–9 take their year from page text ("Sample Questions Set 1 (from 2009)"); sets 10–17 use "known year; matches file names". The years are: Set 1 2009, Set 2 2012, Set 3 2007, Sets 4–5 2011, Set 6 2012, Set 7 2013, Set 8 2014, Set 9 2015, Set 10 2016, Set 11 2017, Set 12 2018, Sets 13–14 2019 (split 9 + 8 rounds), Set 15 2020, Set 16 2021, Set 17 2022. The sets hold 257 rounds in all — [manifest.json](file:///home/user/rebound/scripts/doe/manifest.json); [REPORT.md, "Notes"](file:///home/user/rebound/scripts/doe/REPORT.md)
- The MS manifest lists Sets 1–16 (2009, 2008, 2007, 2010, 2011, 2012, 2013, 2014–2020, 2021, 2022) plus "Sample Rounds" (4 undated rounds). That makes 250 round PDFs (manifest entries: 250 rounds + 1 resource) — [manifest-ms.json](file:///home/user/rebound/scripts/doe/manifest-ms.json); [REPORT-MS.md, "Sets"](file:///home/user/rebound/scripts/doe/REPORT-MS.md)
- DOE posts sample sets years after the season. The MS Set 14 (2020) PDFs were created 2024-12-05 to 2024-12-10, and the MS Set 16 (2022) PDFs on 2026-02-03. Set 2 ("2008") has PDFs created 2004-02-04 and footers naming the "Junior National Science Bowl". The Sample Rounds' PDFs date from 2006-10-04 — [REPORT-MS.md, "Where the sets come from"](file:///home/user/rebound/scripts/doe/REPORT-MS.md)
- Totals are HS 6,012 toss-ups + 6,012 bonuses = 12,024, and MS 5,848 + 5,848 = 11,696, for 23,720 in all. The fingerprint file's `count` is also 23,720. HS has 12,011 questions with category, type and answer (99.9%); MS has 11,687 (99.9%) — [REPORT.md](file:///home/user/rebound/scripts/doe/REPORT.md); [REPORT-MS.md](file:///home/user/rebound/scripts/doe/REPORT-MS.md); [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)
- Packet sizes vary by year: 25 pairs per round through 2013, 23 for 2014–2020, and 18 for the 2021–2022 virtual HS sets (MS: 15 in 2021, 18 in 2022). The measured round sizes are:
  - **HS:** 113 rounds × 25, 119 × 23, 25 × 18.
  - **MS:** 111 × 25, 1 × 24, 119 × 23, 9 × 18, 10 × 15.

  — [REPORT.md](file:///home/user/rebound/scripts/doe/REPORT.md); [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)
- Rounds by season:
  - **HS:** 2007 17, 2009 17, 2011 32, 2012 30, 2013–2020 17 each, 2021 10, 2022 15. There are no HS sets for 2008 or 2010.
  - **MS:** 2007 15, 2008 10, 2009 18, 2010 17, 2011 16, 2012 17, 2013 15, 2014–2020 17 each, 2021 10, 2022 9, undated 4.

  — [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)
- Age, computed as 2026 minus the set year and averaged over questions with a year:
  - **HS:** mean 11.6 years, median 12, minimum 4, maximum 19. 53.0% of questions come from 2014 or later.
  - **MS:** mean 12.0 years, median 12. 52.1% come from 2014 or later.

  — [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)

**Rounds and questions by category and type**
- Questions by subject:
  - **HS:** earth_space 2,192, biology 2,180, chemistry 2,076, physics 2,050, math 1,986, energy 1,338, general_science 202 (legacy). Core-subject questions number 11,822.
  - **MS:** math 2,278, biology 2,272, earth_space 2,258, general_science 1,384 (legacy), physics 1,238, energy 1,216, chemistry 836, physical_science 214 (legacy). Core-subject questions number 10,098.

  — [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)
- Energy is absent from the oldest sets. HS Sets 1 and 3 (2009, 2007) print General Science instead, and MS Sets 1–3 have no Energy. The 2021–2022 HS sets are exactly balanced (60 or 90 per subject) — [REPORT.md, "Questions by subject"](file:///home/user/rebound/scripts/doe/REPORT.md); [REPORT-MS.md](file:///home/user/rebound/scripts/doe/REPORT-MS.md)
- The MS Physical Science split for the 2027 rules moved 2,180 Physical Science questions: 1,184 to physics (54.3%) and 782 to chemistry (35.9%), with 214 kept as physical_science (9.8%). On the blind sample C, labelled after the rule was fixed, 37 of 38 moves were right (97.4%) — [REPORT-MS.md, "Physical Science split"](file:///home/user/rebound/scripts/doe/REPORT-MS.md)
- Question types:
  - **HS:** 7,108 short answer and 4,916 multiple choice. Toss-ups split 3,084 short answer / 2,928 multiple choice; bonuses 4,024 / 1,988.
  - **MS:** 6,876 short answer and 4,820 multiple choice. Toss-ups split 3,016 / 2,832; bonuses 3,860 / 1,988.

  — [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)
- Question length, measured over stem + choices + answer:
  - **HS:** mean 196 characters (32.4 words). Toss-up short answer averages 139 characters (23.7 words), toss-up multiple choice 232 (37.1), bonus short answer 177 (30.5), bonus multiple choice 269 (42.7).
  - **MS:** mean 166 characters (27.8 words).
  - **Answer lines:** the mean `answerRaw` is 22 characters at HS and 19 at MS.

  — [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)
- Answer-line extras:
  - **HS:** 1,675 questions carry ACCEPT alternatives, 200 carry DO NOT ACCEPT lists and 340 carry notes.
  - **MS:** 1,298, 149 and 237 respectively.

  — [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)
- No HS question is marked `visual`. One MS question is (`doe-ms-finals-r04-t15`, a cathode-ray question), and it has no figure. DOE's figures are not imported — [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out); [schema.ts](file:///home/user/rebound/src/core/schema.ts)
- About 28% of HS questions are computational and about 24% of MS questions; these are the ones a numeric code check would cover.
  - **How they were counted:** a question counts if it has a numeric short answer or four numeric multiple-choice options.
  - **HS:** 2,860 numeric short answers plus 470 multiple choice with four numeric options = 3,330 (27.7%). Math accounts for 1,076 and physics for 740.
  - **MS:** 2,502 + 342 = 2,844 (24.3%).

  — [library_stats2.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats2.out)

**Known import errors and quality issues**
- **Answer-key corrections.** Seven answer keys were corrected after a person reviewed them against the PDF (2 HS, 5 MS); in each, DOE's printed letter named the wrong option. Example: `doe-ms-08-r17-t17` was printed "Y) 2.5", but 2.5 is choice X — [REPORT.md](file:///home/user/rebound/scripts/doe/REPORT.md); [REPORT-MS.md](file:///home/user/rebound/scripts/doe/REPORT-MS.md)
- **The errata file.** `src/core/importers/doeErrata.ts` holds 127 reviewed entries. They split between `DOE_ERRATA` (answer letters) and `DOE_TEXT_FIXES` (text restored from the PDFs). The build "stops with an error if an entry no longer fits". The git history shows restorations on 2026-11-20: math symbols, a fraction, a derivative, and "the questions whose equations were images, restored and checked against the PDFs" (commit 1a47d9b) — [doeErrata.ts](file:///home/user/rebound/src/core/importers/doeErrata.ts); [git log](file:///home/user/rebound/.git)
- **Current flags.** 296 HS questions are flagged:
  - possible-lost-formatting 183
  - text-corrected 88
  - type-mismatch 16
  - choice-letters-fixed 6
  - erratum 2
  - choices-reordered 2
  - mc-answer-mismatch 2
  - choices-missing 1
  - kind-inferred 1

  221 MS questions are flagged:
  - possible-lost-formatting 159
  - text-corrected 29
  - number-mismatch 12
  - type-unknown 6
  - type-mismatch 6
  - erratum 5
  - image-not-extracted 2
  - one each of mc-answer-mismatch, choices-missing, choice-letters-fixed, kind-corrected, choices-reordered and category-unknown

  That is 517 flagged questions in all (2.2% of 23,720) — [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)
- **The reports' flag tables are older than the data.** REPORT.md lists HS possible-lost-formatting 270, image-not-extracted 79 and answer-missing 13. It was last changed in commit bf38418 on 2026-11-07, while the set files changed on 2026-11-20 (1a47d9b). The lower current counts are consistent with the 2026-11-20 restorations — [REPORT.md, "Flags"](file:///home/user/rebound/scripts/doe/REPORT.md); [git log](file:///home/user/rebound/.git)
- **Gaps that cannot be recovered.** Equations drawn with lines or images (radicals, some fraction bars) and answers printed as images cannot be recovered from the text. HS Set 8 (29 questions, plus a few in Sets 2 and 7) uses an equation font whose characters map to Tamil, Telugu or U+FFFD. MS Sets 6–8 have 15 such questions. MS Set 4 Round 4 toss-up 21 lost two of its options — [REPORT.md, "Notes"](file:///home/user/rebound/scripts/doe/REPORT.md); [REPORT-MS.md, "Notes"](file:///home/user/rebound/scripts/doe/REPORT-MS.md); [build.ts](file:///home/user/rebound/scripts/doe/build.ts)
- **Source problems.** DOE's page answered HTTP 403 to the fetch script, so the MS manifest was built from a copy of the page saved on 2026-11-06. The page also links MS Set 15 Round 7 to a high school file, so the importer used the MS file that sits next to the other Set 15 rounds — [REPORT-MS.md, "Downloads and failures"](file:///home/user/rebound/scripts/doe/REPORT-MS.md)
- **Answer-checker self-check.** I ran it on 2026-11-21. It checked 19,170 HS answers (every printed answer, every ACCEPT alternative, and each multiple-choice letter and choice text) and found 2 not judged correct (0.01%).
  - `doe-hs-08-r05-t21`: the answer is an unrecovered equation-font glyph.
  - `doe-hs-01-r14-t04`: a choice-text clash.
  - The script covers HS sets only.

  — [judge-self-check.ts](file:///home/user/rebound/scripts/checks/judge-self-check.ts)
- **Topic tagger accuracy.** The rule-based tagger (keywords, no AI) puts a topic on 96.9% of HS core questions (371 untagged) and 94.1% of MS core questions (595 untagged). Against hand labels, it scored:
  - 142 of 156 on the main sample (91.0%)
  - 52 of 60 on holdout-1 (86.7%)
  - 51 of 60 on holdout-2 (85.0%), the "fairest estimate for unseen questions"

  Energy cross-subject agreement is 35 of 46 (76.1%). No MS topic sample has been labelled — [REPORT.md, "Topics"/"Evaluation"](file:///home/user/rebound/scripts/doe/REPORT.md); [REPORT-MS.md, "Evaluation"](file:///home/user/rebound/scripts/doe/REPORT-MS.md)

**Duplicates**
- **How fingerprints work.** A fingerprint is a 64-bit SimHash over word 3-shingles of the normalized stem, choices and answer (lower case, pronunciation guides and punctuation removed). `scripts/studio/fingerprints.ts` writes `public/data/doe/fingerprints.json`: 23,720 `[id, hash]` pairs, 973 KB. A test fails when the file is out of date — [fingerprint.ts](file:///home/user/rebound/src/core/fingerprint.ts); [fingerprints.ts](file:///home/user/rebound/scripts/studio/fingerprints.ts)
- **Studio thresholds.** The studio treats 9 or fewer differing bits (`NEAR_DUPLICATE_BITS = 9`) as "a likely duplicate of a library question", and a 3-shingle Jaccard of at least 0.5 (`SIMILAR_JACCARD`) as similar among team-written questions — [studio.ts](file:///home/user/rebound/src/core/studio.ts)
- **Measured duplicates** (all-pairs XOR and popcount over the 23,720 fingerprints with numpy):
  - **Identical fingerprints:** 163 groups covering 330 questions, or 167 redundant copies. Identical normalized text gives the same 163 groups. 53 of the groups (106 questions) span HS and MS.
  - **Within 3 bits:** 179 pairs (345 distinct questions).
  - **Within 6 bits:** 232 pairs (430).
  - **Within 9 bits (the studio threshold):** 343 pairs (608 distinct questions), 85 of them HS–MS pairs.

  — [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)
- **A known cross-level duplicate.** MS Set 16 Round 7 has the same 36 questions as HS Set 17 Round 10. The two PDFs were made the same day and differ only in one ACCEPT list and the moderator's closing lines. They are kept as DOE published them — [REPORT-MS.md, "Notes"](file:///home/user/rebound/scripts/doe/REPORT-MS.md)
- **Duplicates in the voice index.** The index lists 23,573 recordings for 23,720 questions, because "questions with the same words share one recording" (the 23,573 includes the sample line) — [voice index.json](file:///home/user/rebound/public/data/voice/index.json); [export-library.ts](file:///home/user/rebound/scripts/voice/export-library.ts)

**What the data files are**
- **`catalog.json` / `catalog-ms.json`** (810 KB / 755 KB) hold "one compact row per question … so drills and plans can choose questions without downloading every set". The rows are `[id, subject, topic or "", "t"|"b", round order, crossSubject or ""]`, plus `topicCounts` for frequency-weighted planning. There is one file per level — [schema.ts, `CatalogRow`/`Catalog`](file:///home/user/rebound/src/core/schema.ts); [build.ts](file:///home/user/rebound/scripts/doe/build.ts)
- **`concepts.json` / `concepts-ms.json`** (150 KB / 129 KB) map each concept to its question ids ("for the Learn pages"). Concept lists exist only for the most frequent topics of each subject: 14 topics such as Animal physiology, Organic chemistry and Algebra. A question gets up to three concepts — [schema.ts, `ConceptIndex`](file:///home/user/rebound/src/core/schema.ts); [REPORT.md, "Concepts"](file:///home/user/rebound/scripts/doe/REPORT.md)
- **`topic-eval.json`** holds the hand-labelled, seeded, stratified samples that score the tagger: 156 + 60 + 60 HS questions. **`split-eval-ms.json`** holds hand labels (physics, chemistry or "either") for random MS Physical Science questions: samples A (80), B (60) and C (50) — [REPORT.md](file:///home/user/rebound/scripts/doe/REPORT.md); [REPORT-MS.md](file:///home/user/rebound/scripts/doe/REPORT-MS.md)
- **`index.json`** (135 KB) is a `LibraryIndex` of `SetSummary` entries for both levels, HS first. Each entry lists the set's rounds with pair counts, plus `questionCount` and `subjectCounts` — [schema.ts](file:///home/user/rebound/src/core/schema.ts); [build.ts](file:///home/user/rebound/scripts/doe/build.ts)

**Thin and dated topics**
- **The 12 thinnest HS topics** (core questions): chemistry.nuclear 37, chemistry.equilibrium 47, biology.development 47, energy.grid-transmission 47, energy.solar 54, earth_space.earth-interior 58, physics.fluids 67, math.statistics 71, chemistry.kinetics 75, biology.evolution-classification 83, earth_space.geologic-time-fossils 89, energy.data-units 94 — [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)
- **The 12 thinnest MS topics:** math.calculus 3, chemistry.nuclear 6, chemistry.equilibrium 7, math.vectors-matrices-complex 11, chemistry.kinetics 14, math.trigonometry 26, biology.development 32, chemistry.thermochemistry 34, energy.grid-transmission 40, physics.relativity-quantum 41, chemistry.electrochemistry 41, physics.magnetism-induction 43 — [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)
- **DOE labs topic.** "DOE labs, facilities and research programs" is the largest Energy topic: 418 of 1,338 HS Energy questions (31.2%) and 363 of 1,216 MS (29.9%). By comparison, HS Solar has 54 questions and HS Grid and transmission 47 — [REPORT.md, "Questions per topic"](file:///home/user/rebound/scripts/doe/REPORT.md); [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)
- **Time-sensitive wording.** The regex matched "currently", "recently", "as of", "today", "latest", "newest", "most recent", "this year", "to date", "so far", "is now", "planned", "upcoming", "scheduled" or a year from 1950–2029.
  - **HS:** 215 of 12,024 stems (1.8%): Energy 91, Earth and Space 51, physics 28.
  - **MS:** 210 of 11,696 (1.8%): Energy 81, Earth and Space 53.
  - **Examples:** `doe-hs-01-r17-t24` asks for the boson "not yet … observed as of June 2008". `doe-ms-05-r03-b19` asks for a share of U.S. crude oil production "as of 2009". `doe-ms-06-r12-b13` refers to "the recently discovered circumbinary planet".
  - **Caveat:** a first, looser pattern that included "current" matched electric and ocean currents, so it was dropped.

  — [library_stats2.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats2.out); [library_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats.out)

### Inferences
- **The newest material is four seasons old.** No 2023–2026 regional questions are in the library, and DOE has posted MS sets two to four years after the season. A team practicing for 2027 is therefore drilling on content written for 2007–2022 categories. The pre-2011 sets also contain 1,586 legacy-subject questions (202 HS + 1,384 MS General Science) that do not fit 2027 rounds.
- **Balanced rounds run out sooner than raw counts suggest.** Assume rounds are balanced across the six 2027 subjects (the 2021–2022 sets are exactly balanced) and that a pair's two questions share a subject. Then the smallest subject binds:
  - HS Energy has about 1,338/2 ≈ 669 pairs.
  - MS chemistry has about 836/2 ≈ 418 pairs.
  - At 25/6 ≈ 4.2 pairs per subject per round, that is about 160 balanced HS rounds and about 100 balanced MS rounds, against 236 and 201 core-pair round equivalents. This is my arithmetic, not a Rebound output.
- **Where generated sets would help most.** Thin topics, both levels' Energy (renewables, storage and the grid are thin, while DOE-lab news is large and dates fastest), MS chemistry, and post-2022 science would all benefit most.
- **The duplicate check is ready to reuse.** The studio's 64-bit SimHash check at 9 bits or fewer, plus 3-shingle Jaccard, can serve as a regurgitation filter for generated questions. In the DOE library that threshold matches only 343 pairs out of about 281 million (23,720 × 23,719 / 2), so it is selective.

### Gaps
- I did not reconcile the 127 errata entries against the 7 + 117 flagged corrections one by one. The split shown is from the flags in the data.
- The dated-wording counts come from a regex heuristic, not a hand review. I found no file that lists outdated facts, such as superseded constants, renamed facilities or completed missions.
- No MS topic-tagger accuracy sample exists, so MS topic counts carry unmeasured error.

## 2. How long the library lasts a team, and whether Rebound tracks what has been seen

### Takeaway
At 2–4 practice rounds a week, a team hears all 257 HS rounds in 64–128 weeks (1.2–2.5 calendar years) and all 250 MS rounds in 62–125 weeks. On a 36-week school year that is roughly 1.7–3.6 seasons. Balanced six-subject rounds and solo drilling shorten this a lot.

Rebound does track what each player has heard. A per-player `seen` ledger, stored a round at a time, is combined with team games. Drills prefer fresh questions, and scrimmages are built from pairs nobody in the room has heard. So the pool for team scrimmages shrinks as every member drills.

### Cited Findings
- **Rounds and pairs per level.** HS has 257 rounds and 6,012 pairs, 5,911 of them core-subject (by toss-up subject). MS has 250 rounds and 5,848 pairs, 5,034 of them core-subject. Expressed as 25-pair rounds of core pairs, that is 5,911/25 = 236.4 (HS) and 5,034/25 = 201.4 (MS) — [library_stats2.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/library_stats2.out)
- **Weeks to hear every round** (weeks = rounds ÷ rounds per week; years = weeks ÷ 52; school years = weeks ÷ 36, an assumption):

| Level, basis | Rounds | 2/week | 3/week | 4/week |
|---|---|---|---|---|
| HS, published rounds | 257 | 128 wk = 2.5 yr (3.6 school yr) | 86 wk = 1.6 yr (2.4) | 64 wk = 1.2 yr (1.8) |
| HS, 25-pair core rounds | 236 | 118 wk = 2.3 yr (3.3) | 79 wk = 1.5 yr (2.2) | 59 wk = 1.1 yr (1.6) |
| MS, published rounds | 250 | 125 wk = 2.4 yr (3.5) | 83 wk = 1.6 yr (2.3) | 62 wk = 1.2 yr (1.7) |
| MS, 25-pair core rounds | 201 | 101 wk = 1.9 yr (2.8) | 67 wk = 1.3 yr (1.9) | 50 wk = 1.0 yr (1.4) |

  — [lifetime.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/lifetime.out)
- **Solo drilling volume.** The review-load simulation models fresh questions per day as `round(minutes × 2/3)`: "the non-review two thirds, one question a minute". The default daily plan is 30 minutes (`dailyMinutes: 30`), which gives 20 fresh questions per player per day. Plans spend 80–90% of non-review time on drills outside the final weeks (`PHASE_MIX`) — [review-load.ts](file:///home/user/rebound/scripts/checks/review-load.ts); [store.ts](file:///home/user/rebound/src/lib/store.ts); [plan.ts](file:///home/user/rebound/src/core/plan.ts)
- **How fast solo drilling uses up the pool.** At 20 fresh questions a day with no overlap between players, the share of the core pool heard by nobody runs out after:
  - **HS (11,822 core questions):** 591 practice days for one player, 148 days (30 five-day weeks) for 4 players, 74 days for 8.
  - **MS (10,098):** 505, 126 and 63 days.
  - **One player drilling only one subject:** HS Energy (1,338) lasts 67 days, HS Earth and Space (2,192) 110 days, MS chemistry (836) 42 days.

  — [lifetime.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/lifetime.out)
- **The heard ledger.** Each player has a `seen` ledger (`AppData.seen: Record<playerId, Record<questionId, time>>`). `heardLedger()` returns "their own 'seen' ledger (practice, online matches), plus every question read in the team's games they played in". `freshTopicCounts()` counts each topic's unheard questions for the daily plan — [learning.ts](file:///home/user/rebound/src/lib/learning.ts); [store.ts](file:///home/user/rebound/src/lib/store.ts)
- **How the server stores it.** "The questions a player has heard (`seen`) are kept a round at a time … hearing a question sends a round's worth of ids". Records merge as unions, and teammates may read all collections except `cards` and `plans` — [SERVER.md, "Records"](file:///home/user/rebound/docs/SERVER.md)
- **Drills.** The drill picker puts "fresh questions first: anything the player has heard is used only when nothing fresh is left". It aims at a target success chance; the README gives 70–85% — [drill.ts](file:///home/user/rebound/src/core/drill.ts); [README.md](file:///home/user/rebound/README.md)
- **Scrimmages.** A scrimmage is "a round of toss-up/bonus pairs that nobody in the room has heard", with per-subject quotas. It reports `heardPairs`, the pairs "that had to include questions someone has heard, because fresh ones ran out". The visual-bonus pool also puts questions the room has heard last — [scrimmage.ts](file:///home/user/rebound/src/core/scrimmage.ts); [visualPool.ts](file:///home/user/rebound/src/lib/visualPool.ts)

### Inferences
- **The binding constraint is the scrimmage builder's "unheard by anyone in the room" rule.** Four players drilling 30 minutes a day could, in the worst case, leave no fully fresh HS pairs after about 30 weeks. Balanced rounds also hit the smallest subject first (about 160 HS / about 100 MS balanced rounds; see section 1).
- **A steady supply would fit straight in.** Every heard-tracking path keys on stable question ids. New sets with ids that never change would therefore count as "fresh" with no code change to drills, plans or scrimmages, provided they appear in the catalog the picker reads.
- **Volume needed for three fresh rounds a week.** That takes 156 rounds a year, or 7,800 accepted questions (3 × 52 × 50).

### Gaps
- No file says how many practice weeks a season has; the 36-week school year is an assumption.
- The 20-questions-a-day figure comes from a simulation's assumption, not from logged usage. The repository has no aggregate usage data.

## 3. Integration points a generated set would need

### Takeaway
A generated set would plug into these pieces:

- **Schema:** the NSB-JSON question schema, which already has a `rebound` provider and an `ai` provenance field on written questions.
- **Library files:** the catalog, concepts, index and fingerprint files that drills and plans read.
- **Checks:** the answer checker, whose conventions answer lines must satisfy, and the studio's automatic checks and review rules.
- **Packets:** the team-packet path, which is private, unvoiced and up to 900 KB per record.
- **Voice and visuals:** the voice pipeline, and the visual-question template system, a working precedent for generated questions.

The DOE build script and two test files hard-code "the library is DOE sets", so adding a generated set to the public library needs a new build path and test changes.

### Cited Findings
**Question schema (`src/core/schema.ts`, NSB-JSON)**
- **Question fields.** Required: `id`, `kind`, `number`, `subject` (one of six core subjects, or a legacy subject), `sourceCategory`, `format` (`short_answer` or `multiple_choice`), `stem`, `answer`, `accept[]`, `reject[]`, `answerRaw` and `source {provider, setId, roundId, url?, page?, credit}`. Optional: `choices` (W–Z), `answerLetter`, `notes`, `visual`, `figure`, `flags`, `topic`, `concepts` and `crossSubject` — [schema.ts](file:///home/user/rebound/src/core/schema.ts); [NSB-JSON.md, "Questions"](file:///home/user/rebound/docs/NSB-JSON.md)
- **The `rebound` provider.** `Provider` already includes `'rebound'`, defined as "questions the site generates itself (visual bonuses drawn from templates)". NSB-JSON's provenance table describes it as "generated by Rebound" — [schema.ts](file:///home/user/rebound/src/core/schema.ts); [NSB-JSON.md, "Provenance"](file:///home/user/rebound/docs/NSB-JSON.md)
- **Ids and text conventions.** "A question keeps its id in every file, so practice history and game logs can refer to it". The documented id patterns are `doe-…`, `team-<packet>-r01-t01`, `wq-<id>`, `vis-<template>-<seed>`, `vph-…` and `vtm-…`. Text is plain Unicode with pronunciation guides in [brackets]. Programs that write new questions build `answerRaw` "from the parts, as `ANSWER (ACCEPT: A; B) (DO NOT ACCEPT: C)`" — [NSB-JSON.md, "Ids"/"Text"](file:///home/user/rebound/docs/NSB-JSON.md)
- **`WrittenQuestion`.** This is the studio's record type. It holds `status` (draft, review or approved), `authorId`, `reviewerId`, `sources[]` (at least one source is required before review), `comments`, and an `ai` block: `{model, at, passageSource, support?, blindAnswer?, blindAgreed?}` — [schema.ts](file:///home/user/rebound/src/core/schema.ts)

**Team packets: written, imported, stored**
- **Two kinds.** `TeamPacket` is either a `scrimmage` (library toss-up and bonus ids) or an `upload` (its own `QuestionSet`). An upload carries a `level` (regional, invitational or nationals) and "stay[s] in the team's own data and [is] never published" — [schema.ts](file:///home/user/rebound/src/core/schema.ts)
- **Upload path.** PDFs are read in the browser with pdf.js and parsed with the same importer as the DOE sets. NSB-JSON files are read with `readNsbJson`. Uploaded questions are tagged with the rule-based tagger. The packet goes "only to the team's own records on Rebound's server", licensed `'Private to the team. Community packets carry no open license: do not redistribute.'` — [upload.ts](file:///home/user/rebound/src/lib/upload.ts)
- **Storage limits.** Team records live in the `packets` collection of the team's Durable Object. Each record is at most `MAX_RECORD_BYTES = 900_000` of JSON, and a request carries at most 500 changes. Library set files average 790 bytes per question (18,734,635 bytes ÷ 23,720), so one packet record holds roughly 900,000 ÷ 790 ≈ 1,100 questions — [accounts.ts](file:///home/user/rebound/src/core/accounts.ts); [SERVER.md, "Records"](file:///home/user/rebound/docs/SERVER.md); directory listing of `public/data/doe`
- **Difficulty of uploads.** Uploads get a nominal DOE-style round for the difficulty prior (`NOMINAL_ROUND`: regional 12, invitational 17, nationals 24). An upload without a level counts as invitational — [levels.ts](file:///home/user/rebound/src/core/levels.ts)

**The studio (Team → Write)**
- **What it is.** `src/core/studio.ts` holds the checks, the peer-review rules, the near-duplicate search and the packet builder; `src/pages/Write.tsx` is the page. `checkWritten()` errors block review; warnings do not. The checks are:
  - **Multiple choice:** all four choices, choices not the same, a marked letter, and no other choice the checker would accept (error `two-right`); parallel kinds and lengths and no "all of the above" (warnings).
  - **Answer form (Rule A-2):** simplest form (error); units the checker knows, scientific notation only when asked, repeating decimals and rounding instructions (warnings).
  - **Source and style:** at least one cited source and matched brackets (errors); a toss-up over 70 words and first-person voice (warnings).

  — [studio.ts](file:///home/user/rebound/src/core/studio.ts)
- **Review rules.** `canReview`: anyone but the author who owns the subject, or a coach or captain. `packetFromWritten()` rotates subjects, pairs bonuses by subject, uses 25 pairs per round by default, and appends the note "AI-drafted (internal practice only)" to AI questions. It hard-codes `level: 'HS'` on the packet it builds — [studio.ts](file:///home/user/rebound/src/core/studio.ts)
- **Existing AI path.** "Everything AI-made is labeled, needs a person's approval, and stays in the team's practice; each player has a daily limit" — [README.md](file:///home/user/rebound/README.md); [SERVER.md, "AI help"](file:///home/user/rebound/docs/SERVER.md)

**The answer judge**
- **What it does.** Answer checker v1 follows "the 2027 rules 3-7 and Appendix A-2". Its verdicts are `correct`, `incorrect` or `review`: "it never guesses on near-misses", and close calls go to the player. It guards confusable pairs (hyper/hypo, anion/cation, mitosis/meiosis …) and chemistry suffix families (-ane/-ene/-yne, -ate/-ite/-ide), and maps formulas to names (H₂O = water) — [judge.ts](file:///home/user/rebound/src/core/judge/judge.ts)
- **Where it is used.** The studio runs every other choice through the judge to catch two right answers. Visual templates must have "the printed answer (and each accepted answer) graded correct by the answer checker". The online match director judges typed answers with `judgeAnswer` — [studio.ts](file:///home/user/rebound/src/core/studio.ts); [visual README](file:///home/user/rebound/src/core/visual/README.md); [match.ts](file:///home/user/rebound/server/src/match.ts)
- **The self-check script** judges every library answer and ACCEPT alternative and prints the share not judged correct. On 2026-11-21 that was 2 of 19,170 (HS only) — [judge-self-check.ts](file:///home/user/rebound/scripts/checks/judge-self-check.ts)

**Review tooling**
- `scripts/checks/review-load.ts` is not a question-review tool. It "simulates a player practicing daily for 90 days, to check that the review queue stays manageable" (FSRS forgetting curve, review cap `floor(minutes/3/0.5)`) — [review-load.ts](file:///home/user/rebound/scripts/checks/review-load.ts)
- Human review of written questions happens in the studio (`canReview`, comments, status draft → review → approved) — [studio.ts](file:///home/user/rebound/src/core/studio.ts); [schema.ts](file:///home/user/rebound/src/core/schema.ts)

**Visual questions**
- **Generated from templates.** Visual bonuses are generated: "each template draws an SVG figure and asks a bonus question about it whose answer the code computes exactly". Ids are `vis-<template>-<seed>` and "are forever". Templates must be deterministic, have "one unambiguous answer", and give answers in NSB's exact simplest form — [visual README](file:///home/user/rebound/src/core/visual/README.md)
- **Counts.** There are 39 templates, counted from the `id: '<subject>-…'` lines in each subject's template file (biology 6, chemistry 6, earth_space 6, energy 5, math 9, physics 7) and a photo set of 70 public-domain Wikimedia Commons photos in 10 groups (`photos.json`, `build-photos.py` refuses non-public-domain files). Team-added visuals use `vtm-` ids — [templates directory](file:///home/user/rebound/src/core/visual/templates); [photos.json](file:///home/user/rebound/public/data/visual/photos.json); [build-photos.py](file:///home/user/rebound/scripts/visual/build-photos.py); [visuals.ts](file:///home/user/rebound/src/lib/visuals.ts)

**How library sets are built and served**
- **The build.** `scripts/doe/build.ts` builds `public/data/doe/` from the cached DOE PDFs of one level. It writes the set files, `catalog(-ms).json`, `concepts(-ms).json`, `index.json` and the report, and tags every question with the rule-based tagger. It is driven by `manifest(-ms).json` and PDFs. The catalog's round field is `catalogRound(id, r.order)` — [build.ts](file:///home/user/rebound/scripts/doe/build.ts); [levels.ts](file:///home/user/rebound/src/core/levels.ts)
- **The site.** It loads `data/doe/index.json`, one catalog per level and set files on demand (`BASE = 'data/doe/'`). The service worker keeps "public question files" in their own cache — [library.ts](file:///home/user/rebound/src/lib/library.ts); [sw-template.js](file:///home/user/rebound/src/sw/sw-template.js)
- **Deploys.** GitHub Pages deploys "on every push to main" and run `npm test` before `npm run build` — [deploy.yml](file:///home/user/rebound/.github/workflows/deploy.yml)
- **Tests that assume DOE-only sets:**
  - `doe-library.test.ts` asserts every set id starts with `doe-hs-` or `doe-ms-`.
  - The same file asserts the MS sets equal exactly `doe-ms-01…16` plus `doe-ms-finals`, and that summaries match set files.
  - `tagging.test.ts` checks the catalog and index timestamps.

  — [doe-library.test.ts](file:///home/user/rebound/src/core/importers/doe-library.test.ts); [tagging.test.ts](file:///home/user/rebound/src/core/tagging.test.ts); [build.ts header](file:///home/user/rebound/scripts/doe/build.ts)
- **Maintainer procedure.** "When DOE adds a sample set, fetch, build, read the report, run `npm test`, commit". After any library change, run `npm run data:fingerprints`. "Never commit community or invitational packets" — [MAINTAINING.md, "Question data"](file:///home/user/rebound/MAINTAINING.md)

### Inferences
- **Two routes exist.**
  - **Public library route:** a generated set as a `provider: 'rebound'` set in `public/data/doe/`, which drills, plans, Learn pages, scrimmages and the voice would all see. This needs a non-PDF build step that writes the set file, index entry, catalog rows and concepts; test changes for the DOE-only assertions; regenerated fingerprints; and recordings.
  - **Team-packet route:** an NSB-JSON `question-set` uploaded by a team. It works today with no code change, but it stays private, has no recordings ("shown as text"), and is capped at about 1,100 questions per record.
- **Difficulty would sit on round numbers.** The catalog's round field is the only difficulty channel the drill picker and mastery prior use. A generated set must pick nominal rounds deliberately, as uploads do with `NOMINAL_ROUND`.
- **The studio's checks double as automatic gates.** `checkWritten` plus `nearDuplicates` (9 bits or fewer) plus `judgeAnswer` on the key, every ACCEPT and every non-key choice are directly reusable as the pipeline's free automatic gates, before any API spend on adjudication.
- **Policy conflict.** Today's policy labels AI-drafted questions "internal practice only". Publishing generated sets library-wide would be a policy change, not just a technical one.

### Gaps
- I did not read `src/pages/Write.tsx` or the upload review screen in full, so the exact UI steps for importing a large generated packet were not traced.
- I did not check whether `packetFromWritten`'s hard-coded `level: 'HS'` affects middle school teams in practice.

## 4. What adding a generated set requires end to end, including Rebound's voice

### Takeaway
To publish a generated set in the library, these must happen in order:

1. Write it in Rebound's schema with stable ids, topics and a nominal round.
2. Regenerate the index, catalog, concepts and fingerprints, and adjust the DOE-only tests.
3. Record every question with Kokoro on the captain's Windows PC, check it with Whisper, publish it to the two Cloudflare Workers and commit `public/data/voice`. Until then the voice guard test fails and blocks the Pages deploy.

The voice work is small per question: about 11.7 seconds of audio (12.6 seconds for HS), about 0.2 seconds of GPU synthesis, 0.4 seconds of Whisper checking and about 70 kB of storage. A 50-question round is about 10 minutes of audio, about 30 seconds of machine time and 3.5 MB. The two free Workers have room for about 16,400 more recordings before a third is needed.

### Cited Findings
- **The guard test.** `voice.test.ts` requires the published recordings to "cover every question in the library, by its words now". It reads `public/data/doe/index.json`, computes each question's `audioKey(RECORDED_VOICE, spokenFor({stem, choices}))`, fails with "N questions have no published recording of their words: export, generate and publish them again", and checks `index.questions` equals the library count — [voice.test.ts](file:///home/user/rebound/src/lib/voice.test.ts)
- **The pipeline steps.** `export-library.ts` writes `voice/jobs.jsonl`. Then `kokoro_voice.py generate`, `kokoro_voice.py check` (Whisper) and `kokoro_voice.py publish` run, followed by `git add public/data/voice` and a commit. The README adds: "the site plays a question from its recording only once the index on the live site lists it". A question with no recording, "such as a team's own packets, is shown as text" — [voice README](file:///home/user/rebound/scripts/voice/README.md)
- **Where recordings are made.** The commands are PowerShell on Windows. Kokoro runs on the user's graphics card. "On an RTX 5070 Ti, one process works about 63 times faster than real time (about an hour for the library) and three parts together about 104 times (about 40 minutes)". Whisper takes "about 0.4 seconds a recording: about 2½ hours for the library" — [voice README](file:///home/user/rebound/scripts/voice/README.md)
- **Library totals.** "The whole library is about 23,600 recordings, 76 hours of speech and 1.65 GB". `--kbps 32` gives "about 1 GB" — [voice README](file:///home/user/rebound/scripts/voice/README.md)
- **Measured index.** The published index holds 23,572 distinct recordings (plus the sample line, giving `recordings: 23573`) for 23,720 questions.
  - **Duration:** 76.38 hours in total, a mean of 11.67 seconds per recording (median 10.56). HS set entries average 12.62 seconds and MS 10.65.
  - **Storage:** 1.65 GB ÷ 23,572 = 70.0 kB per recording (about 48 kbit/s), or 75.2 kB if "GB" means GiB.

  — [voice_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/voice_stats.out); [voice index.json](file:///home/user/rebound/public/data/voice/index.json)
- **Voice workload,** computed as n × mean seconds for audio, ÷ 63 or ÷ 104 for Kokoro, × 0.4 s for Whisper, and × 70 kB for storage:
  - **1,000 HS questions:** 3.51 h of audio, 3.3 min of Kokoro (one process) or 2.0 min (three processes), 6.7 min of Whisper, 70 MB.
  - **One 50-question HS round:** 0.18 h (10.5 min) of audio, about 12 s of Kokoro, 20 s of Whisper, 3.5 MB.
  - **A year of 3 rounds a week (7,800 questions):** 27.3 h of audio, 26 min of Kokoro, 52 min of Whisper, 546 MB.

  — [voice_workload.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/voice_workload.out)
- **Worker capacity.** The recordings are split by the first character of their names: `rebound-voice-1` holds 0–7 and `rebound-voice-2` holds 8–f. "A Worker on Cloudflare's free plan holds up to 20,000 files". The current split is 11,718 + 11,854, leaving 8,282 + 8,146 = 16,428 free slots. MAINTAINING.md: "a library past about 40,000 recordings needs `publish --hosts 3`" — [voice README](file:///home/user/rebound/scripts/voice/README.md); [voice_stats.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/voice_stats.out); [MAINTAINING.md](file:///home/user/rebound/MAINTAINING.md)
- **Pronunciation work.** New words may need fixes in `scripts/voice/pronunciations.tsv`. `kokoro_voice.py words` lists the words Kokoro must guess, and `review.html` lists suspect recordings, worst first. Changing `src/core/speech.ts` changes recording names — [voice README](file:///home/user/rebound/scripts/voice/README.md)
- **Publishing.** `publish` first re-runs the export and "stops and says so" if any recording is missing. It needs `npx wrangler login` to the Cloudflare account that runs Rebound's server — [voice README](file:///home/user/rebound/scripts/voice/README.md)

### Inferences
End-to-end checklist for a library-published generated set. These are my synthesis of the files cited in sections 3 and 4.

1. **Generate** each question in Rebound's `Question` shape, with:
   - a stable id prefix, e.g. `rebound-hs-…`, following the NSB-JSON advice to use one's own prefix;
   - `provider: 'rebound'`, a `credit` and a `license`;
   - `answerRaw` built from its parts;
   - `topic`, `concepts` and `crossSubject` from `tagQuestion`.
2. **Run the free gates:** `checkWritten`; the judge on the key, every ACCEPT and every non-key choice; `nearDuplicates` against `fingerprints.json` and against earlier generated sets.
3. **Run the paid verification steps** (section 6).
4. **Human review** (studio-style approval by someone other than the author).
5. **Pick nominal round numbers** for the difficulty prior.
6. **Write the set file**, add it to `index.json`, append catalog rows and concept ids (a new non-PDF build step), and run `npm run data:fingerprints`.
7. **Relax the DOE-only assertions** in `doe-library.test.ts`.
8. **Voice:** on the captain's PC, export → generate → check → publish → commit `public/data/voice`.
9. **Push to main.** CI runs `npm test` (including the voice guard), then deploys to Pages.

- **Who must act.** Step 8 is the only step that requires the captain's Windows PC and GPU, plus the Cloudflare login. Each release therefore depends on that machine and that person, even though the machine time per round is under a minute.
- **Delivery options.** At 3 rounds a week (7,800 questions a year), the free Worker headroom (about 16,400) lasts about two years before `--hosts 3`. Shipping generated rounds as team packets avoids the voice and tests entirely, but loses read-aloud and library-wide drills.

### Gaps
- The README gives no Kokoro or Whisper throughput for any GPU other than an RTX 5070 Ti. It also gives no per-question human listening time for review.
- No file gives Cloudflare Worker storage limits other than the 20,000-file count. Whether 1.65 GB-scale growth hits another limit was not checked.

## 5. Calibration data: does Rebound record per-question results that could calibrate difficulty?

### Takeaway
Rebound records per-question results, but only inside each player's own account. Each result holds a correct flag, an interrupt flag, a latency, a time and where it came from. Team games keep buzz and judgment events with timestamps. Nothing aggregates results across players or teams.

The difficulty model says plainly that "question difficulty is not measured yet": it uses a prior based on round number. Calibrating generated questions would need four things:

- an opt-in, cross-account aggregation of first answers per question id;
- the buzz position for interrupts, which is not saved;
- a fitted item-difficulty model;
- enough answers per question.

### Cited Findings
- **Solo attempts.** A solo answer is saved as `SoloAttempt {id, playerId, questionId, subject, kind, correct, interrupt, latencyMs, overridden, t}`, where `overridden` means "the player overrode the checker's verdict" — [games.ts](file:///home/user/rebound/src/core/games.ts)
- **Outcomes.** `Outcome` adds `via: 'practice' | 'game'`, `reason` and `shared`. `latencyMs` is defined as "Buzz time after the reading ended (toss-ups, non-interrupts)" — [review.ts](file:///home/user/rebound/src/core/review.ts)
- **Interrupts lose their buzz position.** In solo practice an interrupt records `latencyMs: null` and the position in a local `shownChars` field, which `SoloAttempt` does not store. A buzz after the reading records `buzzedAt − openedAt` — [TryRound.tsx](file:///home/user/rebound/src/pages/TryRound.tsx); [games.ts](file:///home/user/rebound/src/core/games.ts)
- **Game events.** Games keep `MatchEvent`s with times: `start`, `tossup_read` ("the reader finished reading the toss-up"), `buzz {t, team, playerId}`, `tossup_judged` and `tossup_dead`. Online matches hold `answering {pressedAt, interrupt, latencyMs}` and `reading {startedAt, wpm, pausedAt?}` — [engine.ts](file:///home/user/rebound/src/core/rules/engine.ts); [match.ts](file:///home/user/rebound/server/src/match.ts)
- **Where results are stored.** A finished online match writes each player's outcomes to that player's `answers` collection. Each outcome carries `playerId`, `questionId`, `subject`, `kind`, `correct`, `interrupt`, `latencyMs`, `t` and `via: 'game'`. Team games are turned into outcomes by the team and written to members' `answers`. "Players who are not on the team get nothing" — [room.ts](file:///home/user/rebound/server/src/room.ts); [SERVER.md, "Team games and answers"](file:///home/user/rebound/docs/SERVER.md)
- **Ownership.** "Practice belongs to the player. A user's answers, review cards, plans and ledgers live in that user's own Durable Object". Rooms close "6 hours after everyone has left, and [their] data is deleted". The storage tables are per object: UserServer `records`, Team `records`, RoomServer `results` — [SERVER.md](file:///home/user/rebound/docs/SERVER.md)
- **No cross-team aggregation.** A search of `server/src/*.ts` and `docs/SERVER.md` for aggregation, cross-team or per-question statistics found nothing — search of [server/src](file:///home/user/rebound/server/src)
- **The difficulty model.** "Question difficulty is not measured yet, so it comes from what DOE says about its sample sets: rounds 1–10 are about equal, later rounds get harder, and bonuses are harder than toss-ups". The formula is `questionDifficulty = 1500 + 15 × max(0, round − 10) + (bonus ? 50 : 0)`, used in a logistic Elo-scale model. Player ratings use "the player's first answer to each question (replays of a round they have already heard are not evidence)", with a 60-day half-life — [mastery.ts](file:///home/user/rebound/src/core/mastery.ts)
- **Difficulty levels.** Rounds 1–10 are "early regional", later rounds "late regional", and round 24 or higher "nationals". DOE's MS Sample Rounds are mapped to nationals level — [levels.ts](file:///home/user/rebound/src/core/levels.ts)

### Inferences
The raw material exists, but four things are missing before generated questions can be calibrated:

1. **A consented, cross-account store.** Today's privacy design keeps answers with each player, so this is a product and policy change, not just code.
2. **Buzz position for interrupts.** Characters shown, or milliseconds since the reading started, are needed to measure toss-up "buzzability". At the moment only "interrupted: yes" survives.
3. **A difficulty model fitted to questions.** The existing Elo machinery could be extended to update a per-question difficulty from first answers, adjusted for each player's rating. That separates hard questions from weak players.
4. **Volume and segmentation.** That means HS vs MS, solo vs game, and excluding `overridden` or `review` verdicts. A question needs enough first answers before its estimate means anything.

- **Workable in the meantime.** Ship generated rounds at a nominal round number. Compare their first-answer correct rates with DOE questions of the same subject and topic among the same players, which the per-player data already allows within one team.

### Gaps
- I found no local figure for how many players or answers Rebound has. The answers needed per question for a stable estimate is not in local sources.
- Whether `buzz` event times in Reader-console games can be turned into buzz positions (via the `tossup_read` time and reading speed) was not tested.

## 6. Cost model: an LLM generation-and-verification pipeline at current Claude API prices

### Takeaway
At central token estimates, a four-step pipeline costs:

| Mix | Standard, per 1,000 | Standard, per 50-question round | Batch, per 1,000 | Batch, per round |
|---|---|---|---|---|
| All Opus 5.5 | $45 | $2.27 | $23 | $1.13 |
| Opus generates, Sonnet solves | $35 | $1.73 | $17 | $0.86 |
| All Sonnet 5.5 | $23 | $1.15 | $11 | $0.57 |
| Sonnet generates, Haiku solves | $12 | $0.62 | $6 | $0.31 |
| All Haiku 5.5 | $1.15 | $0.06 | $0.57 | $0.03 |

The four steps are: generate with a cached style guide and examples, blind-solve with a second model, adjudicate the 15% that disagree, and run code checks on the 28% that are numeric.

- **Scale.** A year of three fresh rounds a week (9,750 generated for 7,800 kept at an assumed 80% yield) costs about $5–$440, depending on the mix and batching.
- **What drives cost.** Output and thinking tokens are about 85–90% of the cost, so effort settings matter more than caching.
- **Tools.** Code-execution and web-search fees are negligible at this scale.

### Cited Findings
**Prices (cached skill docs, not verified against the live page)**
- **Model ids:** `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`. Opus 5.5 is "the current Opus and the default model" — [models.md](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/models.md)
- **Opus 5.5:** $4 / $20 per MTok input/output; 5-minute cache writes $5, 1-hour cache writes $8, cache reads $0.20 (0.05× base input); batch $2 / $10 — [model-migration.md L2039](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/model-migration.md); [models.md L79](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/models.md)
- **Sonnet 5.5:** $2 / $10 per MTok; 5-minute cache writes $2.50, 1-hour $4, cache reads $0.20; "Claude Sonnet 5's batch rates" — [model-migration.md L2087](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/model-migration.md)
- **Haiku 5.5:** $0.10 / $0.50 per MTok when the prompt is 100K tokens or fewer, $0.50 / $2.50 above that. Cache reads are 0.1× the input rate, 5-minute writes 1.25× and 1-hour writes 2× — [model-migration.md L2240](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/model-migration.md); [models.md L87](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/models.md)
- **Message Batches.** "50% off every token in the request, including cache reads and writes - the discounts stack". Results arrive "within 24 hours; that window is an expiry, not an SLA". Batch requests are "single-shot - no mid-batch tool loop", and "cache hits inside a concurrent batch are best-effort". The batches doc adds: "Up to 100,000 requests or 256 MB per batch; most batches complete within 1 hour; maximum 24 hours; … All Messages API features supported (vision, tools, caching, etc.)" — [cost-optimization.md L151–154](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/cost-optimization.md); [batches.md](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/python/claude-api/batches.md)
- **Prompt caching.**
  - Writes cost "1.25× for 5-minute TTL, 2× for 1-hour TTL".
  - The minimum cacheable prompt is 512 tokens on the newest models (Opus 5, Sonnet 5.5 and Haiku 5.5 sections).
  - "N parallel requests with identical prefixes all pay full price - none can read what the others are still writing".

  — [prompt-caching.md L140–144, L254](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/prompt-caching.md); [model-migration.md L1044, L2201, L2360](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/model-migration.md)
- **Code execution.** "Free when used with web search/web fetch tools; otherwise $0.05/hour after 1,550 free hours/month per organization". The container has 1 CPU, 5 GiB of RAM, no internet and Python 3.11 with data-science libraries, and persists 30 days — [tool-use-concepts.md L169–179](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/tool-use-concepts.md)
- **Web search.** "Web searches at $10 per 1,000". This is stated for Managed Agents list cost; it is the only web-search price in the skill docs. Server-side tools run a sampling loop that stops with `pause_turn` after 10 iterations — [managed-agents-core.md L205](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/managed-agents-core.md); [tool-use-concepts.md L132](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/tool-use-concepts.md)
- **Thinking and effort.**
  - **Opus 5.5:** thinking "can't be disabled (effort is the only control, default `medium`)".
  - **Sonnet 5.5:** default effort `high`; `thinking: {type: "disabled"}` returns 400, so use `{type: "between_tools"}` at effort high or below.
  - **Haiku 5.5:** `disabled` is accepted at effort high or below; default `medium`.
  - **Forced tools:** forced `tool_choice` returns 400 on Opus 5.5 and Sonnet 5.5.
  - **Billing:** "`max_tokens` is a hard limit on total output (thinking + response text)", and `usage.output_tokens_details.thinking_tokens` "meters thinking spend".

  — [models.md L79–87](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/models.md); [model-migration.md L1218](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/model-migration.md); [cost-optimization.md L67](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/cost-optimization.md)
- **Tokenizer.** Sonnet 5 and later, and Haiku 5.5, count the same text as about 30% more tokens than earlier models. The skill docs give no characters-per-token rule — [models.md L85, L87](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/models.md); search of [token-counting.md](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/token-counting.md)
- **Pricing must be fetched live.** The docs require fetching the live Pricing page "before any dollar figure"; facts taken from the skill's own files should be labelled "cached, not verified" — [latency-optimization.md L126](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/latency-optimization.md); [cost-optimization.md L28](file:///tmp/claude-0/bundled-skills/2.1.319/c4f1e0720db6343fc46baaa88632067a/claude-api/shared/cost-optimization.md)
- **Rebound's existing AI path, a local anchor for prompt sizes.**
  - **Model:** `DEFAULT_AI_MODEL = 'claude-opus-5-5'`; the blind check uses `AI_CHECK_MODEL`, the same model unless set.
  - **Drafts:** at most 5 per call, from passages of 200–12,000 characters, at `effort: 'high'`.
  - **Blind solve:** `effort: 'medium'`.
  - **Request settings:** `max_tokens: 16000`, JSON-schema `output_config.format`, and the server-side refusal fallback for Opus, Fable and Sonnet 5.5.
  - **Limit:** 50 calls per user per day.
  - **Prompt sizes:** the draft system prompt is 1,095 characters (180 words); the solver prompt is 232 characters.

  — [ai.ts](file:///home/user/rebound/server/src/ai.ts); [ai_prompt_sizes.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/ai_prompt_sizes.out); [SERVER.md, "AI help"](file:///home/user/rebound/docs/SERVER.md)

**Token assumptions per generated question** (central scenario; stated in `cost_model.py`)

These are assumptions, not measurements.

- **Question size.** Library questions average 166–196 characters (section 1). At about 3 characters per token for the newer tokenizer, that is about 65 tokens of question text. The 3-characters ratio is my assumption: about 4 characters per token for older tokenizers ÷ 1.3.
- **Step 1, generation.**
  - **Input:** a cached prefix of 10,000 tokens (a style guide of about 4,000 plus few-shot examples of about 6,000) shared by a request that writes 10 questions. That is 1,000 cache-read tokens per question. Each question also needs about 100 uncached spec tokens (subject, topic, kind and format, difficulty target, an "avoid" list).
  - **Output:** 750 tokens (about 250 of JSON with answer line, ACCEPT list and a supporting statement, plus about 500 of thinking).
  - **Cache writes:** 12 prefixes (6 subjects × 2 levels), each written once per run.
- **Step 2, blind solve** (every question): 800 cached tokens of solver instructions plus 100 uncached (the question without its key). Output 640 tokens (about 600 thinking plus a short answer).
- **Step 3, adjudication** (15% of questions; 10% low, 20% high): 3,000 cached rubric tokens plus 600 uncached (question, key, blind answer, judge verdict). Output 2,300 tokens (about 2,000 thinking plus a verdict or fix).
- **Step 4, numeric check with code execution** (28% of questions, the HS computational share from section 1): 1,000 cached tokens plus 3,000 uncached (tool overhead, question, code result and server-loop re-reads). Output 900 tokens (code, thinking, verdict). One container-minute per check.
- **Per-question total:** 2,530 cache-read + 1,130 uncached input + 1,987 output tokens.
  - **Low scenario:** 6,000-token prefix, outputs 400 / 250 / 1,000 / 600, 10% disagreement, 24% numeric.
  - **High scenario:** 15,000-token prefix shared by only 5 questions, outputs 1,500 / 1,500 / 4,000 / 1,500, 20% disagreement, 2 web searches per adjudication at about 4,000 result tokens each, and 5 container-minutes.

  — [cost_model.py](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/cost_model.py); [cost_model.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/cost_model.out)

**Results** (USD; per 1,000 generated questions and per 25-pair round of 50 questions)

How each cost is computed: per question, cost = Σ over steps of (tokens × price ÷ 10⁶) × the share of questions the step applies to. Then:

- **Batch:** × 0.5 on all tokens. Web-search fees are assumed not discounted.
- **"All cache misses":** every request writes its prefix at the 1.25× rate.
- **Per round:** × 50.
- **Per accepted question:** ÷ yield (80% assumed).
- **Worked example** (central, Opus 5.5 generation step): 1,000 × $0.20/M + 100 × $4/M + 750 × $20/M + 12 × 10,000 × $5/M ÷ 1,000 = $0.0002 + $0.0004 + $0.0150 + $0.0006 = $0.0162 per question, or $16.20 per 1,000.

Central scenario:

| Mix (generate / blind solve / adjudicate / numeric check) | Standard, per 1,000 | Standard, per round | Batch, per 1,000 | Batch, per round | Batch, all cache misses, per 1,000 | Batch, per 1,000 accepted (80%) |
|---|---|---|---|---|---|---|
| A. Opus / Opus / Opus / Opus | $45.37 | $2.27 | $22.68 | $1.13 | $28.46 | $28.35 |
| B. Opus / Sonnet / Opus / Sonnet | $34.57 | $1.73 | $17.28 | $0.86 | $21.71 | $21.60 |
| C. Sonnet / Opus / Opus / Sonnet | $33.17 | $1.66 | $16.58 | $0.83 | $20.91 | $20.73 |
| D. Sonnet / Sonnet / Sonnet / Sonnet | $22.94 | $1.15 | $11.47 | $0.57 | $14.23 | $14.33 |
| E. Sonnet / Haiku / Sonnet / Haiku | $12.47 | $0.62 | $6.24 | $0.31 | $7.81 | $7.79 |
| F. Haiku / Sonnet / Sonnet / Haiku | $11.10 | $0.56 | $5.55 | $0.28 | $7.05 | $6.94 |
| G. Haiku / Haiku / Haiku / Haiku | $1.15 | $0.06 | $0.57 | $0.03 | $0.71 | $0.72 |

— [cost_model.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/cost_model.out)

Low-to-high ranges (per 1,000 generated; per round in brackets):

| Mix | Standard | Batch |
|---|---|---|
| A | $21.41–$105.40 ($1.07–$5.27) | $10.70–$54.70 ($0.54–$2.73) |
| B | $16.31–$82.54 ($0.82–$4.13) | $8.15–$43.27 ($0.41–$2.16) |
| C | $14.67–$81.99 ($0.73–$4.10) | $7.33–$42.99 ($0.37–$2.15) |
| D | $10.87–$55.17 ($0.54–$2.76) | $5.43–$29.58 ($0.27–$1.48) |
| E | $5.86–$33.24 ($0.29–$1.66) | $2.93–$18.62 ($0.15–$0.93) |
| F | $4.31–$32.30 ($0.22–$1.62) | $2.15–$18.15 ($0.11–$0.91) |
| G | $0.54–$6.56 ($0.03–$0.33) | $0.27–$5.28 ($0.01–$0.26) |

The high scenario includes $4 per 1,000 in web-search fees (20% × 2 searches × $0.01). That fee is why batching less than halves it — [cost_model.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/cost_model.out)

Central scenario, standard tier, per 1,000 generated questions by step:

| Mix | Generate | Blind solve | Adjudicate | Numeric | Total |
|---|---|---|---|---|---|
| A | $16.20 | $13.36 | $7.35 | $8.46 | $45.37 |
| B | $16.20 | $6.76 | $7.35 | $4.26 | $34.57 |
| C | $8.20 | $13.36 | $7.35 | $4.26 | $33.17 |
| D | $8.20 | $6.76 | $3.72 | $4.26 | $22.94 |
| E | $8.20 | $0.34 | $3.72 | $0.21 | $12.47 |
| F | $0.41 | $6.76 | $3.72 | $0.21 | $11.10 |
| G | $0.41 | $0.34 | $0.19 | $0.21 | $1.15 |

Container time beyond the free tier would add $0.23 per 1,000 (28% × 1 min ÷ 60 × $0.05). The 1,550 free hours a month cover about 330,000 questions at one minute per check — [cost_model.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/cost_model.out)

Doubling every step's thinking tokens (central otherwise, standard) raises the totals to A $76.17, B $57.97, C $57.57, D $38.34, E $20.84, F $20.42 and G $1.92 per 1,000 — [cost_model.out](file:///tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/rebound_library_and_costs/cost_model.out)

### Inferences
- **Output dominates.** In mix A, output is 1,987 × $20/M = $0.0397 of $0.0454 per question (87.6%). Lowering effort and keeping visible output short (structured JSON, no prose) is the biggest lever. Caching the 10,000-token prefix saves only (4 − 0.20) × 1,000 ÷ 10⁶ = $0.0038 per question on Opus ($3.80 per 1,000), and the batch-misses column shows the worst case.
- **Batching fits this job.** Batching halves cost and suits unattended set production that nobody waits for. Two precautions: warm each cached prefix with one request before fanning out, because parallel first requests "all pay full price"; and treat batch cache hits as best-effort.
- **Annual cost of three fresh rounds a week.** That is 156 rounds, or 7,800 accepted = 9,750 generated at 80% yield. Using the central per-1,000 figures × 9.75:
  - mix A standard: about $442;
  - mix B batch: about $168;
  - mix D batch: about $112;
  - mix E batch: about $61;
  - mix G batch: about $5.6.

  Per accepted round (× 1.25): A standard $2.84, B batch $1.08, E batch $0.39. API cost is small next to human review time.
- **Solver strength matters.** A Haiku solver (mixes E and G) costs very little, but agreement with a weak solver is weaker evidence. A strong solver checking a cheaper writer (mix C, or F's Sonnet solver) puts money where errors are caught.
- **Pipeline design notes.** Keep the existing `output_config.format` JSON-schema approach rather than forced tool calls (which return 400 on Opus and Sonnet 5.5). Handle `stop_reason: "refusal"`: Opus 5.5's classifiers include `bio`, and Haiku has no server-side fallback.

### Gaps
- No measured token counts exist. The pilot folder (`research_notes/…/pilot`) was empty when I checked, and I made no API calls. The characters-per-token ratio, thinking tokens per step and code-execution tool overhead are all assumptions; `count_tokens` or a pilot's `usage` objects would replace them.
- Prices are from the skill's cached docs and were not checked against the live Pricing page. Sonnet 5.5 and Haiku 5.5 batch rates are inferred from the 50% rule; only Opus 5.5's batch price ($2 / $10) is stated outright.
- The local docs do not say whether the web-search fee is discounted in batches, or how container time is metered (granularity, minimums).
- The yield (80%), the disagreement rate (10–20%, from the brief) and human review minutes per question are unmeasured. So is the refusal rate on NSB biology and chemistry content.
