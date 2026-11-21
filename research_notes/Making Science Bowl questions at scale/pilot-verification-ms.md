# Pilot, part 2 (middle school): blind solve and verification of 36 LLM-written and 18 DOE questions

Run on 2026-11-21 by Claude (a different model from the writer). Scripts: `/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/check-ms/` (`make_blind.py`, `grade.py`, `compute.py`, `originality.py`, `kw.py`, `style.py`). Phase A file: `pilot/check/blind-answers-ms.json` (saved before the key or any other note was opened). Nothing in the repository or in other notes was changed. No HS note or HS file in `pilot/` was read.

## Results in brief

- **I got all 54 right**: 36 of 36 newly written and 18 of 18 DOE. I found no wrong key in either group, so the blind check cannot tell the groups apart on accuracy.
- **The verification found real problems anyway**, mostly ones a solver cannot see: 3 substantive duplicates of DOE questions (and 4 more template-level ones), 2 outdated lab names, a giveaway or longest-correct-choice cue in 8 of 36 questions. DOE controls had 3 problem items of 18 (one inconsistent number, one over-advanced item, one weak distractor).
- **Shared-error spot check: 8 of 8 keys verified.** The expected shared-error rate on easy MS items is low, and this sample cannot show it is zero (one-sided 95% upper bound about 31% for n=8).
- **Style is detectable.** I labelled DOE vs new correctly 45 of 54 times (83%; chance given my guess counts is about 56%; always saying "new" gives 67%). Longer choices, "because" clauses and the lab preface were the main tells, but half of the DOE controls come from sets older than the style the writer imitated, which inflates this.
- **Raw LLM-written MS questions are accurate but not original.** Writing is the cheap part. Verification would need to be mainly an originality and level check, not an answer check.

## 1. Method

**Phase A (blind).** I read only `pilot/blind/questions-ms.json` (54 questions: 36 new, 18 DOE; 6 per category in the new group and 3 per category in the DOE group; 18 toss-ups and 18 bonuses new, 9 and 9 DOE). No web, no other files; Python for arithmetic only. For each question I recorded answer, confidence (1-5), MS-regional difficulty (1-5), flags with one-line reasons, and a DOE-or-new guess with a reason. The file was saved before I opened anything else.

**Phase B.**
1. Compared my answers with `pilot/key/key-ms.json` (by eye, with the key's answer line; all 54 agreed). Adjudicated every flag (29 questions carried at least one) against sources.
2. Shared-error spot check: `random.Random(20261125).sample()` over the 15 newly written questions where I agreed with the key and raised no flag (M002, M004, M005, M009, M010, M021, M025, M029, M033, M041, M046, M048, M049, M053, M054). Picked: **M002, M009, M021, M025, M029, M033, M053, M054**. (Seed is mine; the key's own seed 20261121 was not used.)
3. Recomputed every numeric answer with Python (`compute.py`).
4. Originality: TF-IDF cosine on stem+choices over all 23,720 questions in `public/data/doe/doe-*.json` (fields `stem`, `choices`, `answer`, `answerRaw`; see `src/core/schema.ts`), plus exact-answer matching and about 40 keyword searches built from each question's answer and cue words. I then read the best candidates and judged them by hand.
5. Style: compared with `nsb_format_and_style.md` sections 3 and 4 (and the blind set measures in `style.py`).
6. Group comparison and detection accuracy.

Definitions. **Substantive duplicate**: a library question asks for the same answer from the same cue. **Template-level near-duplicate**: same task and cue structure with different numbers or a reversed cue. Severity uses two yes/no tests: *D* = a moderator's ruling would likely be disputed in a real match; *F* = a player could learn something false from it.

## 2. Group tables

Groups are by the key's `source` field, revealed after Phase A.

| | Newly written (n=36) | DOE controls (n=18) |
|---|---|---|
| My answer matched key | 36 (100%) | 18 (100%) |
| Key wrong (verdict) | 0 | 0 |
| Mean confidence (1-5) | 4.94 | 4.44 |
| Mean MS-regional difficulty (1-5) | 1.94 | 2.61 |
| Difficulty distribution 1 / 2 / 3 / 4 / 5 | 11 / 17 / 7 / 1 / 0 | 2 / 8 / 4 / 3 / 1 |
| Questions with at least one blind flag | 21 (58%) | 8 (44%) |
| Total blind flags | 30 | 11 |
| Writer's confidence (key) | 5 for 32, 4 for 4 | n/a |

Blind flags by type (a question can carry several):

| Flag | New | DOE |
|---|---|---|
| style unlike NSB | 10 | 1 |
| wrong level | 9 | 3 |
| giveaway | 8 | 1 |
| unclear aloud | 2 | 4 |
| more than one defensible answer | 1 | 1 |
| factual error | 0 | 1 |
| wrong or unanswerable | 0 | 0 |
| outdated | 0 | 0 |

Verdicts after adjudication (one verdict per flagged question; unflagged questions are "fine"):

| Verdict | New | DOE |
|---|---|---|
| Key correct (my answer was wrong) | 0 | 0 |
| Key wrong | 0 | 0 |
| More than one defensible answer | 0 | 1 (M042) |
| Flawed (ill-posed, aloud, outdated, giveaway, level) | 8 (M006, M011, M017, M020, M026, M047, M050, M052) | 2 (M007, M022) |
| Fine (flags withdrawn) | 13 | 5 |
| Questions with a real problem | 8 of 36 (22%) | 3 of 18 (17%) |
| Additional, found only in Phase B | 2 outdated lab names (M011, M050; both already flawed); 3 substantive duplicates (M017, M051, M052) and 4 template-level ones | n/a (controls are the library) |

Counting the Phase B originality findings, problem questions among the new group are 9 of 36 (25%): the 8 above plus M051 (duplicate only), since M017 and M052 were already in the flawed list. The difference between 22-25% and 17% is not statistically meaningful at these sizes.

Why so many withdrawals. I flagged the "Scientists at <lab>" preface and trivial arithmetic as non-NSB or too easy. The style notes show lab lead-ins are standard for MS Energy (96% of 2019-22 MS Energy items), and DOE MS sets have equally trivial items (e.g. doe-ms-01-r03-t20 "angle of incidence 27, angle of reflection?" and doe-ms-02-r01-t13 "metals that can be hammered into thin sheets are called malleable"). Those flags were withdrawn. 13 of 21 flagged new questions and 5 of 8 flagged DOE questions were withdrawn. My blind flags over-called style and level.

## 3. Problem items

All 54 of my answers agreed with the key, so there is no "key correct, you were wrong" row. Every flagged question is listed in section 3.2.

### 3.1 Items with a substantive verdict

**M007 (DOE, doe-ms-13-r16-b23): flawed. Key (0.8) correct.**
"An ideal gas with molar mass 26 is kept at 200 kelvins and at 4 atmospheres of pressure, and is found to have a density of 1.6 grams per liter. What is the density, in grams per liter, of a different ideal gas with molar mass 52 if it is at a temperature of 400 kelvins and a pressure of 2 atmospheres?"
Density of an ideal gas is d = PM/RT ([OpenStax Chemistry 2e 9.3, via UCF copy](https://pressbooks.online.ucf.edu/chemistryfundamentals/?p=145); [LibreTexts 10.5](https://chem.libretexts.org/Courses/Southeast_Missouri_State_University/CH185%3A_General_Chemistry_(Ragain)/10%3A_Gases/10.05%3A_Applications_of_the_Ideal_Gas_Law-_Molar_Volume_Density_and_Molar_Mass_of_a_Gas)). Using that, the first gas would be 6.34 g/L, not 1.6 g/L; the second 3.17 g/L. Only the ratio method gives 0.8, because the ratio is (52/26)(2/4)(200/400) = 0.5 and 0.5 x 1.6 = 0.8. A player who computes from first principles gets 3.17 and would challenge. Also five numeric conditions are hard to hold aloud and the proportional-gas-law reasoning is high for MS (my difficulty 4). Severity: D yes (rare), F mild (the stated 1.6 g/L is not a real gas density).

**M042 (DOE, doe-ms-06-r01-b13): more than one defensible answer (weak). Key (hollow bones) correct as best.**
"Which of the following is an adaptation in birds that facilitates flight? W) Hollow bones X) Sharp claws Y) Smooth feathers Z) Small beaks"
[OpenStax Biology 29.5](https://openstax.org/books/biology/pages/29-5-birds) and the [Stanford birds essay](https://web.stanford.edu/group/stanfordbirds/text/essays/Adaptations.html) list hollow, air-filled bones, and also say contour feathers form a smooth surface that reduces drag and flight feathers make lift, so "smooth feathers" is a defensible second answer to a loose stem. NSB Rule 3-3 accepts only "the best of the 4", so a challenge from a Y answerer is plausible. Severity: D yes, F no.

**M022 (DOE, doe-ms-12-r14-t19): flawed (level, loose analogy). Key (helium) correct.**
"Variable stars will pulsate in size due to the ionized form of what element acting as a compressible spring?"
Pulsation of Cepheids is driven by the kappa mechanism (the "Eddington valve"): partly ionized helium (He II to He III) absorbs energy on compression and releases it on expansion ([Wikipedia: Eddington valve](https://en.wikipedia.com/wiki/Eddington_valve); [arXiv review 2307.12386](https://arxiv.org/pdf/2307.12386)). The literature calls this a valve or heat engine; gravity and gas pressure supply the restoring force, so "compressible spring" is a loose analogy, not the standard description. Far above MS (difficulty 5). Severity: D low (key is right), F mild (analogy).

**M011 (new): flawed (giveaway, outdated).** "Scientists at the National Renewable Energy Laboratory are working to make solar panels more efficient. Solar cells convert sunlight directly into what form of energy?" The stem nearly states the answer (photovoltaic efficiency) and the lab was renamed National Laboratory of the Rockies on 1 December 2025 ([DOE](https://www.energy.gov/eere/articles/energy-department-renames-nrel-national-lab-rockies)). The same outdated name is in **M050 (new)**: "Scientists at the National Renewable Energy Laboratory study geothermal power plants. Geothermal energy comes mainly from which of the following?" (key W, heat from inside Earth). The name is also stale in the whole DOE-style Energy lead-in pool. I did not flag this blind. Severity: D no, F no (the facts are right, the name is stale).

**M017 (new): flawed (giveaway) and substantive duplicate.** See 4.

**M052 (new): flawed (longest-correct choice, strawmen) and substantive duplicate.** "A winter coat stuffed with down feathers keeps a person warm mainly because of which of the following?" (key Y, air trapped between the feathers conducts heat poorly). Fine as science: still-air insulation, see doe-ms-16-r09-b18 (4). Severity: D no, F no.

**M020, M047 (new): flawed (correct choice is the most precise, long sentences; distractors are strawmen).** M020: "Which of the following is the main reason that coastal cities usually have milder winters than inland cities at the same latitude?" Key X, water heats and cools more slowly than land; this is supported by water's high specific heat and mixing depth ([Hill, LibreTexts oceanography 4.2](https://geo.libretexts.org/Bookshelves/Oceanography/Oceanography_(Hill)/04%3A_Properties_of_Water/4.2%3A_Heat_capacity_the_ocean_and_our_weather); [FAU/NASA module](https://www.ces.fau.edu/nasa/module-3/why-does-temperature-vary/land-and-water.php)). M047: "Which of the following is the main reason air temperature usually decreases with height in the troposphere?" Key Z, heated mainly from below by Earth's surface ([NASA Earth Observatory video via ViewSpace](https://viewspace.org/video_library/videos/868-359112163?tags=248); [Windows to the Universe](https://www.windows2universe.org/earth/Atmosphere/troposphere_temperature.html&edu=high)). Keys correct. Severity: D no, F no.

**M006, M026 (new): flawed (style, giveaway).** M006: choices carry "because ..." clauses ("W) It is greater, because the magnesium combined with oxygen"), unlike DOE's short parallel choices; the key is correct (Mg + O2 gives MgO, a mass gain). M026: "In hot climates, a white roof keeps a building cooler than a black roof mainly because the white roof does what to more of the incoming sunlight?" gives "reflects" away; LBNL's cool-roof work is on reflectance ([LBNL Heat Island Group](https://heatisland.lbl.gov/node/22)). Severity: D no, F no.

### 3.2 Every flagged question

Verdict "fine" means the flag was withdrawn after checking.

| Id | Group | Blind flags (reason) | Verdict | Note |
|---|---|---|---|---|
| M006 | new | style (because-choices); giveaway | flawed | see 3.1 |
| M007 | DOE | factual error; unclear aloud; level | flawed | see 3.1 |
| M008 | new | level (trivial) | fine | DOE MS has comparable items |
| M011 | new | giveaway; style (lab preface); trivial | flawed | giveaway kept; preface withdrawn; outdated added in B |
| M012 | DOE | unclear aloud; level | fine | DOE reads formulas aloud; cadmium permanganate is balanced (Cd2+ with two MnO4-) |
| M014 | new | trivial | fine | |
| M015 | DOE | unclear aloud | fine | answer 73/8 verified; the key accepts 9.125 |
| M016 | new | style (lab preface) | fine | Argonne does Li-ion research ([Argonne](https://www.anl.gov/article/the-search-for-a-superbattery)); on discharge Li+ moves anode to cathode through the electrolyte |
| M017 | new | style; giveaway | flawed | duplicate (4) |
| M019 | new | trivial | fine | |
| M020 | new | style; giveaway | flawed | see 3.1 |
| M022 | DOE | level (too advanced) | flawed | see 3.1 |
| M023 | new | unclear aloud (fraction answer) | fine | key accepts 4 8/13; hard to compute in 20 s but fair |
| M024 | DOE | giveaway ("joules" is a unit) | fine | momentum is the only quantity of the form mv |
| M026 | new | style; giveaway | flawed | see 3.1 |
| M027 | new | trivial | fine | |
| M031 | new | trivial | fine | template duplicate (4) |
| M032 | new | style (lab preface) | fine | |
| M034 | new | unclear aloud (formula) | fine | the stem names the compound |
| M035 | new | trivial | fine | |
| M038 | DOE | style (awkward "graph ... graphed") | fine | |
| M039 | new | trivial | fine | |
| M040 | DOE | unclear aloud (x/3, one-half) | fine | |
| M042 | DOE | more than one defensible | more than one defensible | see 3.1 |
| M044 | new | trivial | fine | template duplicate (4) |
| M047 | new | style; giveaway | flawed | see 3.1 |
| M050 | new | style; giveaway | flawed | giveaway kept; outdated added in B |
| M051 | new | more than one defensible (algae or cyanobacteria) | fine | the key's ACCEPT covers both; photobionts are usually green algae, about 10% cyanobacteria ([Wikipedia: lichen anatomy](https://en.wikipedia.org/wiki/Lichen_anatomy_and_physiology)); but see 4 |
| M052 | new | style; giveaway | flawed | see 3.1 |

Other keys I checked for facts raised in the adjudication. Ceres is a dwarf planet and Vesta is a protoplanet/asteroid, so M046's key (Ceres) is right ([NASA Ceres](https://solarsystem.nasa.gov/planets/dwarf-planets/ceres/in-depth.amp)); Charles's law is volume proportional to absolute temperature at constant pressure ([Saylor](https://saylordotorg.github.io/text_general-chemistry-principles-patterns-and-applications-v1.0/s14-03-relationships-among-pressure-t.html), [NASA Glenn](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/charles-and-gay-lussacs-law)), so M036 is right though the stem leaves out "at constant pressure"; for M043 phytoplankton, as the producer level, hold the highest net production of the four, since energy falls with each trophic level ([UMN Environmental Biology](https://pressbooks.umn.edu/environmentalbiology/chapter/energy-flow-through-ecosystems/)).

## 4. Originality

36 new questions were compared with the full library. Best matches (answers and cue words, hand-judged):

| Id | Best library match | Judgment |
|---|---|---|
| M017 | doe-ms-09-r05-t17 | **Substantive duplicate** |
| M052 | doe-ms-16-r09-b18 | **Substantive duplicate** |
| M051 | doe-hs-03-r08-b06 | **Substantive duplicate** (HS) |
| M031 | doe-ms-14-r07-t06, doe-ms-01-r03-t20, doe-ms-10-r11-t06 | Template-level near-duplicate (only the angle differs) |
| M009 | doe-ms-07-r05-b01 | Template-level near-duplicate (same echo task, other numbers) |
| M044 | doe-ms-02-r01-t13 | Template-level near-duplicate (same fact, cue reversed) |
| M050 | doe-ms-08-r03-t14 | Template-level near-duplicate (geothermal source) |
| M016, M004, M034, M041, M048, M023, M027, M029, M035, M039, M053 and others | related library questions (e.g. doe-hs-07-r16-t16, doe-ms-10-r15-b11, doe-hs-12-r04-t07, doe-ms-01-r03-b09, doe-ms-12-r03-b19) | Related topic or template, different ask or answer; not duplicates |

**Count: 3 of 36 substantive duplicates (8%); 7 of 36 (19%) counting the template-level ones.** Of the 3, two are in MS sets and one in an HS set. The library's own SimHash check was not run here. Because TF-IDF cosine was below 0.6 for each of the three strict duplicates, text similarity alone would have missed them. The writer's own note (`pilot-generation.md`) says a first draft was at 46% matching and the final set was meant to be after replacement; 3-7 matches remain in the final MS set, so that pass did not fully remove them.

**Worst three pairs**

1. **M017 vs doe-ms-09-r05-t17** (both answer TURBINE).
   - New: "Scientists at Idaho National Laboratory study nuclear power plants. In these plants, heat from the reactor turns water into steam, and the steam spins what device that is connected to a generator?"
   - DOE: "When creating electric current using steam, the electric generator is attached to what type of equipment that catches the steam to rotate the generator?"
2. **M052 vs doe-ms-16-r09-b18** (both: trapped air insulates).
   - New: "A winter coat stuffed with down feathers keeps a person warm mainly because of which of the following? ... Y) Air trapped between the feathers conducts heat poorly"
   - DOE: "Which of the following best describes the purpose of down feathers? W) Trapping a layer of air to act as insulation ..."
3. **M051 vs doe-hs-03-r08-b06** (both: algae and fungi).
   - New: "A lichen is a partnership between a fungus and what other kind of organism that carries out photosynthesis?" (ALGAE)
   - DOE: "Lichens are a symbiotic relationship of what 2 general types of organisms?" (GREEN ALGAE AND FUNGI)

Honourable mentions: M031 and M009 differ from DOE questions only by their numbers (35 vs 30 or 27 degrees; 680 m cliff vs 85 m barn), so a player who has seen the library gets them free.

## 5. Computation check

Every numeric answer, new and DOE, was recomputed (`compute.py`). All match the key, with one exception to the stem and not to the answer.

| Id | Recomputation | Result |
|---|---|---|
| M007 | 1.6 x (52/26)(2/4)(200/400) | 0.8, matches. Absolute density from PM/RT gives 6.34 and 3.17 g/L, so the stem's 1.6 is inconsistent |
| M008 | 20/(20+80) | 20 |
| M009 | 2 x 680/340 | 4 s |
| M015 | 5 + (11/8)(3) | 73/8 = 9.125 |
| M021 | a = 20/5 = 4; d = 1/2 x 4 x 16 | 32 m |
| M023 | 5-12-13 triangle; 5 x 12/13 | 60/13 |
| M027 | lcm(12,18) | 36 |
| M029 | integer roots of x^2-5x-14 | 7 and -2 |
| M031 | angle of reflection = incidence | 35 |
| M032 | (60-10) W x 4 h x 30 d / 1000 | 6 kWh |
| M034 | 2 + 3(1+4) | 17 atoms |
| M035 | 0.4 x 35 | 14 |
| M039 | (4+8+15+21)/4 | 12 |
| M040 | (1/2-5)/(1/3-2); back-substitution gives 0 | 27/10 |
| M048 | 78/2 | 39 |
| M053 | 2(w+2w)=30; w=5, l=10 | 50 |
| M054 | 50 x 10 x 4 / 8 | 250 W |

(The first line of `compute.py` prints "CHECK" for M007 only because it compares 0.8 as a float with 4/5; they are equal.) 16 of 17 stems recompute exactly; 1 (M007) has an inconsistent given. The writer's confidence of 5 on all computation items was justified.

## 6. Shared-error spot check

Eight new questions where I agreed with the key and raised no flag, picked with seed 20261125. Each key was checked against a source.

| Id | Key | Source | Result |
|---|---|---|---|
| M002 | Tungsten (accept wolfram) | [LANL periodic table, element 74](https://periodic.lanl.gov/74.shtml); [HyperPhysics](https://hyperphysics.gsu.edu/hbase/pertab/w.html) | Verified: W, from wolfram |
| M009 | 4 | NSB Appendix A-1 sets sound at 340 m/s (section 1 of `nsb_format_and_style.md`; real value 343 m/s at 20 C per [HyperPhysics](https://hyperphysics.gsu.edu/hbase/sound/souspe3.html)); 2x680/340 | Verified (the stem gives the speed) |
| M021 | 32 | [OpenStax University Physics 5.3](https://openstax.org/books/university-physics-volume-1/pages/5-3-newtons-second-law); F=ma then d=at^2/2 | Verified |
| M025 | Folded mountains | [USGS, The Himalayas: two continents collide](https://pubs.usgs.gov/gip/dynamic/himalaya.html) | Verified |
| M029 | 7 and -2 | algebra (factor (x-7)(x+2)); Python | Verified |
| M033 | Increases | [Britannica, seafloor spreading](https://www.britannica.com/science/plate-tectonics/Seafloor-spreading) | Verified |
| M053 | 50 | algebra; Python | Verified |
| M054 | 250 | P = W/t with W = mgh; Python (the definition is standard and I did not fetch a page for it) | Verified |

**0 of 8 keys wrong.** With n=8 a one-sided Clopper-Pearson 95% upper bound on the shared-error rate among agree-and-unflagged items is about 31%; the point estimate is 0%. Over the whole group, no key was wrong in 36, and the one-sided 95% upper bound is about 8%. These items are mostly textbook MS arithmetic and standard facts, so the test is weak for hard items. Genuine shared-model blind spots would be most likely in specialized facts (e.g. lab-specific Energy items), and those are where this pilot has the fewest questions.

## 7. Style differences (new vs DOE controls in the blind set)

| Measure | New (36) | DOE (18) | House style (nsb_format_and_style.md) |
|---|---|---|---|
| Multiple choice | 16 (44%) | 6 (33%) | 22-40% in recent sets |
| Median stem words, toss-up / bonus | 17.5 / 26 | 16 / 15 | MS median about 18 / 22 |
| Mean words per choice | 3.5 (median question 2.6) | 1.6 (median question 1.0) | choices median 2 words |
| Correct choice strictly longest (non-numeric MC) | 5 of 15 | 0 of 5 | about 24% of MS non-numeric MC |
| Choices with "because" clauses | 1 | 0 | none |
| Correct letters W / X / Y / Z | 4 / 4 / 4 / 4 | 3 / 2 / 1 / 0 | about equal |
| Short answers with ACCEPT or DO NOT ACCEPT | 10 of 20 | 6 of 12 | 14.8% (MS, all sets) |
| "Scientists at ..." preface | 5 of 6 Energy items (+1 "Researchers at") | 0 of 3 Energy items | 96% of MS Energy in 2019-22 |
| Pronunciation guides | 2 | 1 | 16% of MS |
| Numeric-answer questions | about 15 (42%) | 3-4 (17-22%) | about 25% overall |
| "Identify all" lists | 1 | 0 | 14% of MS bonuses |

Systematic differences.
- **Choices are longer and fuller.** New MC choices are full sentences with explanations ("...because..."), five of the 15 non-numeric MC items have the unique longest choice correct, and distractors are strawmen ("breaking waves release heat through friction", "the Sun is farther away"). DOE choices are one to three words.
- **Bonus length.** New bonuses are longer than new toss-ups (26 vs 17.5 words, as the writer intended) while DOE bonuses in this sample are no longer than toss-ups (15 vs 16); small sample.
- **More computation, and neater numbers.** The new group has more numeric answers (about 42% against 17-22%), all with round, clean values (680 m and 340 m/s, 20 N and 5 kg, a 5-12-13 triangle). DOE numbers are messier (73/8, 2.7, the inconsistent 1.6 g/L).
- **Energy lead-in is uniform.** All six new Energy items open with a lab preface, which matches 2019-22 style but ties the lab to the question only loosely; the three DOE Energy controls come from older sets (ms-04, ms-05, ms-06) and have none.
- **Level.** The new set is easier: mean 1.94 vs 2.61, and 11 of 36 rated 1 against 2 of 18. Almost nothing above 3 (one 4). The DOE controls reach 5 (M022). MS regionals should include harder items, and DOE's early-round items alone resemble the new set more than the late-round ones do.
- **Answer lines** in the key follow DOE conventions (capitals, "ACCEPT:" in parentheses, letter plus choice text); no systematic difference.
- **Questions are clean.** The new group had no run-ons, no negative stems and no stems without "?" among MC (16 of 16 end in "?", against 3 of 6 for DOE, which has older colon-ending stems such as M024 and M038). DOE's older sets are less polished than the new writing.

## 8. Detection accuracy

| | Truth new | Truth DOE |
|---|---|---|
| I guessed new | 32 | 5 (M015, M028, M036, M037, M040) |
| I guessed DOE | 4 (M004, M033, M046, M048) | 13 |

- Overall 45 of 54 (83%). Precision of a "DOE" call 13 of 17 (76%), recall 13 of 18 (72%).
- Chance with the same guess counts (17 DOE guesses, 18 true DOE) is 30.3 correct (56%). Always saying "new" gives 36 (67%). The chance of getting 13 or more DOE calls right by luck is about 1e-5 (hypergeometric).
- So the guesses beat both baselines. The cues I used were real: lab prefaces, because-clauses, tidy numbers, strawman distractors, and DOE oddities (pronunciation guides on choices, colon-ended stems, messy figures).
- **Confound.** The 18 DOE controls come from sets 2 to 15 (none from set 16, the 2022 set the writer imitated), so some of my accuracy came from older formatting. Two of the four new questions I called DOE (M004, M046) have a bracketed pronunciation guide on a choice, a DOE habit the writer copied. DOE items that looked most like the new writing (M028 Ohm's law, M036 Charles's law, M037 exothermic, M015, M040) were the ones I missed.
- The set is also one-third DOE and I knew it (the split in the brief), which makes "guess new" the default.

## 9. Conclusions

1. **Accuracy is not the bottleneck.** The writer produced 36 MS questions with 0 wrong keys, and a solver agreed on all. Every key I checked against a source was right, including the 8 chosen at random. For MS content, an independent LLM answer check will approve nearly everything and catch almost nothing wrong.
2. **What the blind check could not see is what mattered.** Duplicates of DOE questions (3 of 36 substantive, 7 of 36 with template-level), the stale lab name (2 of 6 Energy items, caused by the rename after the writer's knowledge), and giveaways or longest-correct cues (8 of 36) were found only by library search, web check or style comparison. A pipeline needs an automatic originality screen built on answer plus cue words (TF-IDF alone missed all three strict duplicates), a date and name check for the Energy lead-ins, and a lint for choice length.
3. **The new questions are easier and cleaner than DOE's.** They are easy to answer, avoid the oddities of DOE's older sets, and under-represent hard questions. Practice sets built from them would under-prepare players for the top of a regional.
4. **DOE's own questions are not error-free either.** 3 of 18 controls had a problem (an inconsistent given, an over-advanced and loosely analogised item, a weak distractor). A solver's blind pass catches these about as often as it does for the new group, so a "perfect" check rate should not be the standard.
5. **Human review is still needed** for originality, level mix and modern lab facts; the check by an LLM could be reduced to a short second-opinion pass.

## 10. Limitations

- **Same model family.** The writer and I are different Claude models that share training data and likely share blind spots. My 100% agreement and 8-of-8 spot check cannot rule out shared errors; sources, not my answer, are the evidence. A different model family or human experts could disagree where I agreed.
- **Small sample.** 36 new and 18 DOE questions, 6 and 3 per category. Rates such as 22% vs 17% problem questions are not distinguishable; the confidence intervals are wide (the zero-error result has a one-sided 95% upper bound of about 8%).
- **I may remember published DOE questions.** I may have seen DOE sample sets in training. That can raise my accuracy on DOE controls, and my DOE guesses (e.g. "this looks like a DOE phrase") may reflect memory, not style. Both effects favour the DOE group and detection accuracy.
- **Controls are not matched on era.** DOE controls came from sets 2-15 while the writer imitated set 16, so style and detection results are inflated (see 8).
- **Originality search.** It covers the Rebound library (the published DOE samples, HS and MS) only. DOE questions that are not published, other quiz-bowl sets and textbooks were not searched, and my judgment of "substantive" is subjective; I judged by hand after screening, so near-duplicates beyond the top candidates may remain.
- **Sources.** Several adjudications rest on educational sites and encyclopedias, as search returned them; where I could not fetch a primary page (OpenStax gas law section, USGS seafloor page, NIST) I said so and used a secondary or LANL/USGS page instead. The NSB rule items (340 m/s, "best of the 4") come from the existing notes file, which read the 2027 rules, not from a fresh fetch.
- **Blind flags were noisy.** I flagged 29 of 54 questions and withdrew 18 of them; my blind flags are better read as prompts for checking than as error detectors.
- **Level calls are mine.** Difficulty ratings are one solver's opinion, not response data.
