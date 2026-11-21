# Pilot verification, high school: blind solve, key check and comparison of 36 LLM-written questions with 18 real DOE questions

Run on 2026-11-21 by Claude (a different model from the writer). Scripts are in `/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/check-hs/` (`phaseA.py`, `sample.py`, `compute.py`, `orig.py`, `stats.py`, `writemd.py`). The saved blind answers are in `pilot/check/blind-answers-hs.json`. Nothing in the repository or in the other notes was changed.

## Summary

- **Blind accuracy.** I agreed with the key on 36 of 36 newly written questions (100%) and on 16 of 18 DOE questions (89%). The two disagreements (H016, H043) are both DOE questions, and on both I judge the DOE key wrong.
- **Key errors.** After checking against sources, 0 of 36 newly written keys were wrong; 2 of 18 DOE keys were wrong. One newly written question has a design flaw (H033, a giveaway). One DOE question has a typo (H020).
- **Shared-error spot check.** 8 of 8 randomly chosen unflagged, agreed, newly written keys verified. This puts the shared-error rate at 0 of 8, with a 95% upper bound of about 37%. It cannot show the rate is low.
- **Computations.** All 22 numeric answers (17 newly written, 5 DOE; list in section 4) recompute in Python to the key.
- **Originality.** Strict substantive duplicates (same answer from the same cue) among the 36: 0. Same-template matches with new numbers: 9, and same-topic matches with a different cue: 5. This is **a filtered result**: the writer had already replaced 33 of 72 draft questions after a library check, so the 36 are survivors (section 5).
- **Style.** Written questions are close to house style, with the visible differences listed in section 6 (lab prefixes, longer multi-sentence stems, longer MC choices, constructed-number computations, a mild longest-answer cue).
- **Detection.** I identified the source correctly for 49 of 54 questions (91%) against 67% for always guessing "new". Chance with my own guess rate is 56%. The hypergeometric p-value is about 1e-8.
- **Difficulty.** I rated the written questions easier (mean 1.9 vs 2.5), and the DOE controls drew far more flags (9 of 18 items vs 2 of 36).

## 1. Method

**Phase A (blind).** I opened only `pilot/blind/questions-hs.json` and used no web and no other files. I answered each of the 54 questions as a player under match conditions, with Python permitted but, in practice, reasoned by hand. For each I recorded the answer, confidence 1-5, difficulty for an HS regional 1-5, issue flags with one-line reasons and a guess at the source (DOE or new) with a reason. I saved the file before opening anything else. Flag categories: wrong or unanswerable; more than one defensible answer; factual error; unclear aloud; outdated; giveaway; style unlike NSB.

**Phase B.**
1. I opened `pilot/key/key-hs.json` and compared each answer. Every disagreement and flag was adjudicated against sources (OpenStax, LibreTexts, NPS and USGS, Mindat, NOAA and arXiv papers, via web search and fetch). Wikipedia was unreachable from this session (the host is outside the allowed network), so I used other sources.
2. Shared-error check: 34 newly written questions had agreement and no flag. I drew 8 with `random.Random(20261122).sample(...)` over those 34 in key order (the key's seed 20261121 plus one). The draw was H002, H025, H029, H030, H032, H037, H044, H052.
3. Computations: `compute.py` recomputes every numeric answer.
4. Originality: for each of the 36 written questions I compared stem plus choices against all 23,720 library questions (33 HS and MS set files plus `doe-ms-finals`; the text is in `stem`, `choices` and `answer` per `src/core/schema.ts`). I used TF-IDF cosine similarity, and added every library question with the same normalised answer and every question sharing content words. I read the top 3 per question by a combined score (cosine + same answer + shared stem words), then judged by hand. A substantive duplicate asks for the same answer from the same cue.
5. Style: measured the 36 vs the 18 in the blind file and compared with the measured library profile in `nsb_format_and_style.md`.
6. Group comparison and detection statistics: `stats.py`.

**Order of reading.** After Phase A I opened the key, then the style note, `schema.ts`, the library and the generation set text (needed to see the written questions' original IDs). I read `pilot-generation.md`, which describes the writer's own originality filter, only after my own originality run had finished, and I use it only to put my result in context (section 5). I did not read any MS file in the notes folder. The library's MS DOE sets were included in the originality search because the task said the full library.

## 2. Group comparison

Groups: newly written (n=36, 6 per category, 18 toss-ups and 18 bonuses, 17 multiple choice) and DOE controls (n=18, 3 per category, 9 bonuses, 5 multiple choice).

| Measure | Newly written (36) | DOE controls (18) |
|---|---|---|
| My blind answer agreed with the key | 36 (100%) | 16 (89%) |
| My answer wrong, key right | 0 | 0 |
| Key wrong after source check | 0 (95% upper bound 9.7%) | 2 (11%): H016, H043 |
| Items with at least one of my flags | 2 (6%): H033, H038 | 9 (50%): H007, H011, H012, H016, H019, H020, H036, H040, H045 |
| My flags kept after adjudication | 1 (H033, giveaway) | 2 (H016 key wrong, H020 typo); plus H043, a key error I found as a disagreement rather than a flag |
| Verdict: key correct and fine | 35 | 15 |
| Verdict: key wrong | 0 | 2 |
| Verdict: flawed | 1 | 1 |
| Verdict: more than one defensible | 0 | 0 |
| Disputable ruling and false learning both "yes" | 0 | 2 |
| Mean confidence (1-5) | 5.00 | 4.39 |
| Mean difficulty for HS regional (1-5) | 1.94 | 2.50 |
| Difficulty distribution (1/2/3/4) | 10 / 18 / 8 / 0 | 5 / 3 / 6 / 4 |
| Source guessed right | 34 of 36 (94%) | 15 of 18 (83%) |

Verdict key: *key correct* = my answer was wrong; *key wrong*; *more than one defensible*; *flawed* = ill-posed, unfair aloud, outdated or a giveaway; *fine* = flag withdrawn. No question was marked "key correct (my answer wrong)", because every disagreement went the other way.

Flag counts by type, before adjudication. Written: giveaway 1 (H033), unclear aloud 1 (H038). DOE: more than one defensible 4 (H007, H012, H016, H045), giveaway 2 (H011, H019), factual error or typo 1 (H020), unclear aloud 2 (H036, H040). The DOE flags came mostly from loose wording, as in the older sets; the written questions are tidier but easier.

## 3. Problem items

All items where I disagreed with the key or kept a flag after adjudication, plus the flags I withdrew (for transparency). "Disputed" means a moderator's ruling would likely be disputed in a real match. "False" means a player would learn something false from it.

### 3.1 Items with a kept problem

| ID | Source | Question (as heard) and key | Verdict | Evidence | Disputed / False |
|---|---|---|---|---|---|
| H016 | DOE (doe-hs-03-r15-t21) | "In what region of the electromagnetic spectrum is a supernova most commonly detected?" Key: ULTRAVIOLET (ACCEPT: UV). My answer: visible (optical). | **Key wrong** (at the least, ill-posed). I am fairly confident but not certain: UV is observed, but optical is the usual discovery band. | Supernovae are "typically discovered via optical emission" and have been imaged at radio, IR, optical, UV and X-ray (Universe special issue, "A Multiwavelength View of Supernovae", https://www.mdpi.com/journal/universe/special_issues/ls55201qo5; Sky at Night, https://www.skyatnightmagazine.com/space-science/when-stars-collapse-what-is-a-supernova). Swift UVOT papers treat UV as a follow-up band (https://arxiv.org/pdf/0803.1265). Neutrinos and X-rays are other detection channels (arXiv 2308.03840). No source I found makes UV the most common band. The stem also fails the "one answer" test. | Yes / Yes |
| H043 | DOE (doe-hs-01-r11-b23) | "Name all of the following 4 cells that are leukocytes: neutrophil; basophil; melanocyte; macrophage." Key: NEUTROPHIL; BASOPHIL. My answer: neutrophil, basophil and macrophage. | **Key wrong** (arguably "more than one defensible", since some texts reserve "leukocyte" for circulating cells). | OpenStax Anatomy and Physiology 2e, 18.4: macrophages are monocytes (agranular leukocytes) that have left the circulation; "monocytes ... mature into macrophages" (https://openstax.org/books/anatomy-and-physiology/pages/18-4-leukocytes-and-platelets). Britannica lists leukocytes with monocytes and macrophages as the same lineage (https://www.britannica.com/science/blood-biochemistry/White-blood-cells-leukocytes). A player who says macrophage is told it is not a white blood cell. | Yes / Yes |
| H033 | New (pilot-gen-hs-r01-t15) | "Which of the following is the main reason the Moon's surface keeps far more impact craters than Earth's surface does?" Key: Z) The Moon lacks the weathering, erosion and plate tectonics that erase craters on Earth. | **Flawed (giveaway).** The key is correct. The right choice is 2 to 3 times longer than the others and is the only one phrased as a full reason; W, X and Y are false statements. | Key content is right: NASA Space Place and Cosmicopia say Earth's craters are erased by erosion and plate tectonics, and the impact rate is not the main factor (https://spaceplace.nasa.gov/craters/en/; https://science.nasa.gov/moon/lunar-craters/). The writer's own confidence was 4 here. | No / No |
| H020 | DOE (doe-hs-03-r01-b16) | "Which of the following is the term used to describe the resistance to flow of a liquid:" W) viscosity; X) surface tension; Y) maleability; Z) vapor pressure. | **Flawed (minor).** Key is right. A distractor is misspelled ("maleability" for malleability) and the stem ends in a colon, as the notes show older sets often did. It is also a trivial recall question. | Spelling: malleability (standard dictionaries). Viscosity as resistance to flow: OpenStax Chemistry 2e, 10.1 (https://openstax.org/books/chemistry-2e/pages/10-1-intermolecular-forces). | No / No (the misspelled choice is a wrong answer) |

### 3.2 Flags withdrawn after checking

| ID | Source | My flag | Verdict and reasoning | Disputed / False |
|---|---|---|---|---|
| H007 | DOE | More than one defensible: "Assuming similar wind velocity and turbine swept area ... largest power output" (key: Y Rhode Island) | **Fine.** The premise fixes wind speed, so power is proportional to air density (P = 1/2 rho A v^3), and Rhode Island is at sea level while Denver is about 1,600 m up with roughly 15% lower density (my estimate). Sources: Illinois ECE 333 wind power lecture (https://courses.grainger.illinois.edu/ece333/fa2014/handouts/files/Lecture 5 - Wind Power.pdf); HOMER altitude correction (https://support.ul-renewables.com/homer-manual-pro/altitude.html). The question is a trick, and most players will answer West Texas, but the ruling would hold. My own answer matched the key. | No / No |
| H011 | DOE | Giveaway ("circulation" suggests convection; diffusion is not a heat-transfer mode) | **Fine.** Convection drives the Hadley cell (heating at the equator, rising air). It is an easy question, not a giveaway in the sense of stating the answer. NOAA AOML and arXiv 2310.16192 describe it as a thermally driven overturning circulation. | No / No |
| H012 | DOE | More than one defensible: Bateman's principle or Trivers' parental investment theory | **Fine.** The stem says "principle", which fits Bateman's principle; Trivers' work is a "theory" built on it (PMC3096780, "Bateman's principles and human sex roles", https://pmc.ncbi.nlm.nih.gov/articles/PMC3096780/). A moderator could still be asked about Trivers; I would add an ACCEPT line. | No / No |
| H019 | DOE | Giveaway ("by differences in boiling point") | **Fine.** The stem is a definition and the answer is the process it defines; it is a recall item with plausible distractors (chromatography, NMR, MS). Simple distillation is not offered. | No / No |
| H036 | DOE | Unclear aloud (three long statements) | **Fine.** Key (2 and 3) is correct: statement 1 is false (Malus's law: transmitted intensity is I0 cos^2(theta), proportional to E^2, not inversely); statement 2 matches the Brewster angle (reflected light fully polarized, along the surface); statement 3 is the definition of optical activity. Source: OpenStax University Physics Vol. 3, 1.7 (https://openstax.org/books/university-physics-volume-3/pages/1-7-polarization). The statements are long but typical for a DOE bonus. | No / No |
| H038 | New | Unclear aloud (matrix read aloud) | **Fine.** The wording is almost exactly DOE's own phrasing ("the 2-by-2 matrix with first row ..."), which is spoken-friendly. | No / No |
| H040 | DOE | Unclear aloud, no units | **Fine.** "x of t equals 1 over t squared" is DOE's own verbalisation; the speed is 1/4 in the question's units. | No / No |
| H045 | DOE | More than one defensible (limestone placement) | **Fine, with a caveat.** The "typical sequence" hedge points to the Walther's-law clastic sequence: sand nearshore, mud farther out, carbonate farthest, where little siliciclastic sediment arrives. Limestone also forms in shallow tropical platforms, so the hedge matters. Sources: facies and Walther's law summaries (https://www.slideshare.net/slideshow/walthers-law-of-correlation-of-facies/12735640, a lecture slide set, so weaker evidence). I rate this a minor risk. | No / No |

## 4. Shared-error spot check and computation check

### 4.1 Shared-error spot check (8 random newly written questions)

Seed 20261122 (key seed 20261121 plus one), `random.Random(seed).sample(eligible, 8)` over 34 eligible items. Eligible = newly written, my answer matched the key, I raised no flag.

| ID | Question | Key | Authoritative check | Result |
|---|---|---|---|---|
| H002 | Which element releases the most energy gaining an electron (Cl, F, O, Br) | Chlorine | LibreTexts electron affinity pages: Cl about -349 kJ/mol vs F about -328 kJ/mol (https://chem.libretexts.org/Bookshelves/Physical_and_Theoretical_Chemistry_Textbook_Maps/Supplemental_Modules_(Physical_and_Theoretical_Chemistry)/Physical_Properties_of_Matter/Atomic_and_Molecular_Properties/Electron_Affinity) | Key correct |
| H025 | Remainder of 2^100 divided by 7 | 2 | Python `pow(2,100,7)` = 2; 2^3 = 1 mod 7 and 100 mod 3 = 1 | Key correct |
| H029 | GCD of 391 and 299 | 23 | Python `math.gcd` = 23 (391 = 17 x 23, 299 = 13 x 23) | Key correct |
| H030 | Perovskite mineral composition | Calcium titanate | Mindat: perovskite is CaTiO3, named by Gustav Rose in 1839 for Count Lev Perovski (https://www.mindat.org/min-3166.html) | Key correct |
| H032 | Minerals harder than quartz (topaz, orthoclase, corundum) | 1, 3 | NPS Mohs scale: corundum 9, topaz 8, quartz 7, orthoclase 6 (https://www.nps.gov/articles/mohs-hardness-scale.htm); USGS gemstone guide agrees | Key correct |
| H037 | Tsunami at 200 m/s over 3,600 km | 5 hours | 3,600,000 / 200 / 3,600 = 5.0 (Python). Physical check: sqrt(g d) = 198 m/s for d = 4,000 m, a typical deep-ocean depth; NOAA says speed depends on depth (https://oceanservice.noaa.gov/facts/tsunami.html) | Key correct |
| H044 | Product at the cathode in water electrolysis | Hydrogen gas | OpenStax Chemistry 2e, 17.7 Electrolysis (https://openstax.org/books/chemistry-2e/pages/17-7-electrolysis); DOE Hydrogen Production: Electrolysis (https://www.energy.gov/eere/fuelcells/hydrogen-production-electrolysis) | Key correct |
| H052 | Orbital radius 9 times larger, period factor | 27 | OpenStax University Physics Vol. 1, 13.5: T^2 proportional to a^3, so T scales as 9^1.5 = 27 (https://openstax.org/books/university-physics-volume-1/pages/13-5-keplers-laws-of-planetary-motion) | Key correct |

**Result: 0 of 8 shared errors.** The 95% Clopper-Pearson upper bound is 36.9%. With the two flagged newly written items also checked (H033 giveaway, H038), no key was wrong among the 36 written questions. The sample shows no evidence of shared errors but cannot exclude a rate of, say, 5% to 10%. I also note that the topics here are mostly textbook facts, which are the easiest places for the writer and the checker to agree.

### 4.2 Computation check (all numeric answers, `compute.py`)

| ID | Group | Computed | Key | Match |
|---|---|---|---|---|
| H004 | new | pH = -log10(0.05) = 1.301 | 1.3 | yes |
| H005 | new | 1/2 x 200 x 0.1^2 = 1.0 J | 1 | yes |
| H006 | new | 6||3 = 2, total 6 ohm, I = 2 A, V across the pair = 4 V, I(3 ohm) = 1.333 A | 4/3 | yes |
| H008 | DOE | (2x4-1, 2x2-7) = (7, -3) | (7, -3) | yes |
| H013 | new | 5 (tree count with max degree 4 for 6 carbons; control cases C4 = 2, C5 = 3, C7 = 9 correct) | 5 | yes |
| H015 | new | 2pq = 2(0.8)(0.2) = 32% | X) 32% | yes |
| H021 | new | mgh = mu m g d gives d = h/mu = 20 m | 20 | yes |
| H023 | DOE | 40 mod 12 = 4 | 4 | yes |
| H025 | new | 2 | 2 | yes |
| H026 | new | D^2 x v^3 = 4 x 8 = 32 | 32 | yes |
| H027 | new | (10-2) x 180 = 1,440 | 1,440 | yes |
| H029 | new | 23 | 23 | yes |
| H034 | new | 2 x 3 = 6 | 6 | yes |
| H037 | new | 5.0 h | 5 | yes |
| H038 | new | 3x4 - 5x2 = 2 | 2 | yes |
| H040 | DOE | abs(-2 t^-3) at t = 2 = 0.25 | 1/4 | yes |
| H042 | new | 2 x (4/10)(6/9) = 8/15 | 8/15 | yes |
| H051 | DOE | 0.15/0.39 = 0.3846 | Z) 0.385 | yes |
| H052 | new | 9^1.5 = 27 | Y) 27 | yes |
| H053 | DOE | (100+50)/100 = 1.5 | 3/2 | yes |
| H054 | new | i x m: 0.10, 0.20, 0.30, 0.15; CaCl2 lowest freezing point | Y) | yes |
| H003 | new | r = mv/qB, doubles with v | Y) | yes (symbolic) |

All 22 numeric or scaling answers recompute (17 newly written, 5 DOE counting H003 as symbolic). No key errors found in this check. One note on H040: the DOE answer line is correct, though the stem gives no units.

## 5. Originality

**Method and a necessary caveat.** The final set had already been checked against the library by its writer, who replaced 33 of 72 first-draft questions, 13 of 36 on the HS side, because they matched a DOE question (per `pilot-generation.md`, which I read only after my own run). The 36 I checked are survivors of that filter, so the results below understate what raw LLM output would show. I did not independently re-measure the raw draft rate, and I did not re-verify the writer's 46% figure.

**Results (36 newly written questions vs 23,720 library questions).**
- **Substantive duplicates (same answer from the same cue): 0 of 36.** The closest same-answer, same-topic pairs were all different cues (for example, H003's cue, a charged particle perpendicular to a magnetic field, appears in doe-hs-08-r11-b04, which asks for the path shape, a circle).
- **Same template, new numbers or answer: 9 of 36.** H038 (determinant), H006 (resistor network), H027 (interior-angle sum), H025 (remainder), H042 (marbles drawn without replacement), H013 (isomer count), H005 (spring energy), H054 (lowest freezing point), H004 (acid and base mixing). A player who has seen the DOE question learns the method, not the answer. The writer's note lists the same kept computation templates.
- **Same topic, different cue: 5 of 36.** H032 (Mohs ordering), H002 (electron affinity vs a DOE periodic-trend ordering), H030 (DOE has other perovskite solar cell questions), H039 (doe-hs-12-r03-b03 gives bundle-sheath cells in the stem and asks for C4), H049 (DOE asks about advection fog, this asks about radiation fog).
- Stem-level text matches (cosine) were low everywhere except the template cases: the top cosine was 0.98 (H038), 0.79 (H006), 0.62 (H027, H004) and 0.70 (H042); all others were below 0.6.

**Worst three pairs.**

1. **H038 vs doe-ms-16-r05-t01.** New: "What is the determinant of the 2-by-2 matrix whose first row is 3, 5 and whose second row is 2, 4?" (answer 2). DOE: "What is the determinant of the 2-by-2 matrix with first row 3, 10 and second row 2, 5?" (answer -5). Same words in the same order apart from two numbers; the cosine is 0.98. It does not meet my strict duplicate rule because the answer differs, but it is the closest paraphrase in the set.
2. **H006 vs doe-hs-14-r03-b06 and doe-ms-14-r15-b01.** New: "A 6-ohm resistor and a 3-ohm resistor are connected in parallel, and this combination is connected in series with a 4-ohm resistor across an ideal 12-volt battery. In amperes, what is the current through the 3-ohm resistor?" (4/3). DOE: "A 1-ohm resistor and a 2-ohm resistor are connected in parallel to an 8-volt battery with internal resistance of 2 ohms. In amperes, how much current flows through the 1-ohm resistor?" (2); and "A 1-ohm resistor and a 2-ohm resistor are connected in parallel. This circuit is connected in series to a 9-volt battery. In ohms, what is the total resistance of the circuit?" (2/3). Same parallel-then-series structure and the same unit-first lead-in.
3. **H027 vs doe-ms-05-r15-t06 and doe-ms-03-r10-b03.** New: "In degrees, what is the sum of the interior angles of a decagon?" (1,440). DOE: "What is the sum of the interior angles, in degrees, of a regular octadecagon?" (2880), and "Find the sum of all interior angles, in degrees, in a regular hexagon" (720). Same cue and formula, a different polygon.

(H042 versus doe-ms-13-r01-b17 is a fourth: "4 blue marbles, 3 green marbles, and 3 red marbles ... two marbles are selected without replacement ... the same color?" (4/15), against the new two-different-colours question with 4 red and 6 blue.)

**Reading.** In this batch the originality problem is mostly one of templates for math, physics and chemistry computations, where the natural way to phrase a problem is the way DOE already did. The DOE sets are 23,720 questions, so any generator needs an answer-plus-cue check, not just text similarity: text similarity alone put only 6 of the 9 template cases above a cosine of 0.6 (H013, H005 and H054 were at 0.41 to 0.49).

## 6. Style compared with NSB house style

Measured on the 36 written and 18 DOE controls in the blind file (small samples), compared with the library profile in `nsb_format_and_style.md`.

| Feature | Newly written (36) | DOE controls (18) | House style per notes |
|---|---|---|---|
| Median stem length (words) | 25 (mean 23.8) | 21 (mean 25.3) | toss-ups 20, bonuses 25 |
| Two or more sentences | 16 of 36 (44%) | 4 of 18 (22%) | about 30% of toss-ups, 41% of bonuses |
| Lab or "Scientists" lead-in | 6 (all in Energy: H018, H022, H026, H028, H030, H044) | 0 | 9-15% of all questions, almost all Energy |
| Multiple choice share | 17 of 36 (47%) | 5 of 18 (28%) | 21% of bonuses, 34% of toss-ups |
| Mean words per MC choice | 2.75 | 1.35 | median 2, p90 8 |
| Correct choice strictly longest | 4 of 17 | 2 of 5 | about 25% (chance) |
| Correct-letter spread | W 4, X 4, Y 4, Z 5 | W 2, Y 2, Z 1 | balanced |
| Bracketed pronunciation guides | 7 | 2 | 22% of HS questions |
| Short answers with ACCEPT lines | 5 of 19 | 4 of 13 | present but uncommon |
| "Identify/Name all" or rank/order | 2 | 3 | 20% of bonuses |

**Systematic differences I see.**
- **Constructed-number computations.** Written computation items use round, designed numbers (GCD 391 and 299, 2^100 mod 7, 6 and 3 ohm resistors). DOE's are similar in spirit but include irregular ones (39%, 52% and 15%; a 5-kilogram mass at 10 m/s).
- **Lab lead-ins are all attached to Energy**, as in DOE, but in the written set they sometimes decorate a plain fact (H044 electrolysis, H022 light-water reactors, H030 perovskite name), where DOE's lead-ins usually introduce a research topic.
- **Longer, explanatory stems with a setup sentence** (H017, H039, H041, H018) and longer MC choices, versus DOE's terse stems and 1-2 word choices. The H033 correct choice is a full sentence next to short wrong ones, the one real length cue.
- **Bonuses use few "Identify all of the following three" and no rank items beyond H032 and H035** (2 of 18 bonuses). DOE bonuses use them for about 20%; the 18 DOE controls also had only 3.
- **No spoken-aloud problems.** Written items are cleaner aloud than the DOE controls (typos, colon endings, "x of t" phrasing).
- **Answer lines** follow house style (capitals; "ACCEPT:" inside parentheses; "DO NOT ACCEPT: HELIOPAUSE OR BOW SHOCK"), including an ACCEPT line on H017.
- **Question mark endings:** 34 of 36 written, 14 of 18 DOE controls (the older-set colon endings).

## 7. Detection accuracy

I guessed DOE for 17 questions and "new" for 37.

| | Truly new (36) | Truly DOE (18) |
|---|---|---|
| Guessed new | 34 | 3 (H023, H031, H040) |
| Guessed DOE | 2 (H009, H024) | 15 |

- **Accuracy 49 of 54 (90.7%).** DOE precision 15 of 17 (88%), DOE recall 15 of 18 (83%).
- Baseline "always guess new" would be 36 of 54 = 66.7%. Chance with my own guess rate (17 of 54 DOE) is 56.2%. A one-sided binomial test against 66.7% gives p = 3.8e-5, and against 56.2% p = 3e-8. A hypergeometric test on the 15 hits among my 17 DOE guesses gives p = 1.1e-8.
- **Cues that worked:** loose or old-style wording (H007, H012, H020, H053), idiosyncratic numbers (H051), colon endings and typos, terse recall questions in DOE's older style. Cues that failed: DOE questions that are clean and look constructed (H023, mod 12; H040, "x of t equals"; H031), and written questions with a leading "Which of the following ... is odd" (H009) or porphyritic-rock recall with pronunciation guides (H024).
- A caveat for detection: I may remember some published DOE questions (H008, H010, H047, H048 felt familiar), which inflates this number. It would drop if the controls were less familiar. I also cannot separate a family-style effect from the reasons I gave.

## 8. Conclusions

1. **Raw LLM-written HS questions were accurate in this sample.** 36 of 36 keys held up (95% upper bound on the error rate: 9.7%), and 8 of 8 randomly checked keys verified. The one design problem was a giveaway choice. This agrees with the writer's own self-review, which found no wrong keys.
2. **That accuracy is partly the product of easy questions and a shared knowledge base.** My difficulty ratings put 78% of written questions at 1 or 2, vs 44% of DOE controls, and all 8 spot-checked topics were textbook facts or arithmetic. DOE's controls drew flags from loose or dated wording (H012, H016, H020, H043), so the real questions had more key problems (2 of 18) than the written ones (0 of 36), but the sample is too small to say the rates differ (one-sided Fisher exact p is about 0.11 for 0 of 36 vs 2 of 18, not significant).
3. **The independent check caught problems the writer's did not, and caught them in the DOE set.** My flags were mostly noise: 11 flags were raised and 8 were withdrawn. The three kept were H033 (a giveaway in a written question, which the writer had already rated confidence 4), H016 and H020 (DOE). The one other problem, H043, came from a disagreement with the key, not from a flag. A verification step is cheap but its hits are concentrated in ambiguity and giveaways, not wrong facts.
4. **Originality is the main risk, not accuracy.** Strict duplicates were 0 of 36 only after a filter that replaced 46% of draft questions. 9 of the 36 survivors remain same-template matches (new numbers), and the best was a near-verbatim determinant question. A pipeline needs an answer-and-cue check against the full library, not text similarity, and probably a policy on template questions.
5. **Written questions are detectable.** I found 91% by style alone: lab prefixes on plain facts, longer explanatory stems and choices, designed numbers, and no typos. A practice site would not need to hide the source, but if indistinguishability matters, those are the features to lint (consistent with the notes' lint list).
6. **Recommendation for Rebound.** An LLM-plus-verification route is workable for accuracy at this difficulty. Add (a) an answer-plus-cue duplicate check, (b) a longest-choice and giveaway lint, (c) a human pass on every item that looks hard or ambiguous (the places where I found issues), and (d) do not copy DOE keys without review: H016 and H043 show the library itself contains answers that a modern checker disputes.

## 9. Limitations

- **Same model family.** I and the writer are different models of the same family (Claude), so errors we both make are the ones this check is least able to detect. The 8-item spot check partly addresses this, but it found nothing and has little power.
- **Small sample.** 36 vs 18 questions; one item changes a rate by 3 to 6 points. Confidence bounds are wide (0 of 36 has a 95% upper bound of about 10%). Group differences in flag rate, difficulty and verdicts are suggestive only.
- **Memory of DOE questions.** I may recall published DOE questions, which affects both my accuracy on controls and my source guesses. DOE's key could also be old: DOE warns that answers change as science advances.
- **Selection effects.** The written set was self-reviewed and filtered for library matches before I saw it, and the DOE controls were matched on category and kind but not difficulty; the written questions are about 0.6 difficulty points easier by my ratings.
- **Difficulty ratings and flags are mine.** There is no second rater. My H016 and H043 verdicts rest on definitions and common usage, and a different checker might call them "more than one defensible".
- **Sources.** Wikipedia was not reachable from this session, so I used OpenStax, LibreTexts, NPS, USGS, Mindat, NOAA, DOE and arXiv. Several search results were summaries rather than primary pages, and some (the Walther's-law lecture slides, the wind-density lecture notes) are secondary. The 15% Denver air-density deficit is my own estimate from the standard atmosphere, not a figure from a cited source.
- **Originality scope.** The comparison only covers the library's DOE sets, not other question banks or the web. TF-IDF plus manual reading of the top three per question can miss a paraphrase with different words, though same-answer candidates were also checked.
- **My detection result may be inflated** by the lab-prefix cue and by the known ratio (one-third DOE) I was told.

## Appendix: per-question grading

Agree = my blind answer matched the key (after adjudication; "NO" means key wrong). Conf and Diff are my blind confidence and difficulty. Source guess shows whether it was right.

| ID | True source | My answer | Key | Agree | Conf | Diff | My flags | Source guess |
|---|---|---|---|---|---|---|---|---|
| H001 | new | Z: Ethanol | Z) ETHANOL | yes | 5 | 1 | - | new (ok) |
| H002 | new | W: Chlorine | W) CHLORINE | yes | 5 | 2 | - | new (ok) |
| H003 | new | Y: It doubles | Y) IT DOUBLES | yes | 5 | 2 | - | new (ok) |
| H004 | new | 1.3 | 1.3 | yes | 5 | 2 | - | new (ok) |
| H005 | new | 1 joule | 1 | yes | 5 | 1 | - | new (ok) |
| H006 | new | 4/3 A (about 1.33 A) | 4/3 (ACCEPT: 1 1/3, 1.33) | yes | 5 | 3 | - | new (ok) |
| H007 | doe | Y: Rhode Island (sea level, densest air; power s | Y) RHODE ISLAND | yes | 3 | 3 | multiple_defensible | doe (ok) |
| H008 | doe | (7, -3) | (7, –3) (ACCEPT: x = 7 AND y = –3) | yes | 5 | 1 | - | doe (ok) |
| H009 | new | X: x^3 - x | X) x³ – x | yes | 5 | 1 | - | doe (miss) |
| H010 | doe | Telomeres | TELOMERES | yes | 5 | 1 | - | doe (ok) |
| H011 | doe | Y: Convection | Y) CONVECTION | yes | 5 | 1 | giveaway | doe (ok) |
| H012 | doe | Bateman's principle | BATEMAN’S | yes | 3 | 4 | multiple_defensible | doe (ok) |
| H013 | new | 5 | 5 | yes | 5 | 3 | - | new (ok) |
| H014 | new | X: Tightening the string | X) TIGHTENING THE STRING | yes | 5 | 1 | - | new (ok) |
| H015 | new | X: 32% | X) 32% | yes | 5 | 2 | - | new (ok) |
| H016 | doe | Visible light (optical) | ULTRAVIOLET (ACCEPT: UV) | NO | 3 | 4 | multiple_defensible | doe (ok) |
| H017 | new | Rh (D) antigen / Rh factor | RH FACTOR (ACCEPT: RH ANTIGEN, RHESUS FACTOR, D  | yes | 5 | 2 | - | new (ok) |
| H018 | new | Z: Neutron | Z) NEUTRON | yes | 5 | 2 | - | new (ok) |
| H019 | doe | W: Fractional distillation | W) FRACTIONAL DISTILLATION | yes | 5 | 1 | giveaway | doe (ok) |
| H020 | doe | W: viscosity | W) VISCOSITY | yes | 5 | 1 | factual_error | doe (ok) |
| H021 | new | 20 m | 20 | yes | 5 | 3 | - | new (ok) |
| H022 | new | W: Neutron moderator | W) NEUTRON MODERATOR | yes | 5 | 2 | - | new (ok) |
| H023 | doe | 4 | 4 | yes | 5 | 3 | - | new (miss) |
| H024 | new | Z: Porphyritic | Z) PORPHYRITIC | yes | 5 | 2 | - | doe (miss) |
| H025 | new | 2 | 2 | yes | 5 | 3 | - | new (ok) |
| H026 | new | 32 | 32 | yes | 5 | 3 | - | new (ok) |
| H027 | new | 1440 degrees | 1,440 | yes | 5 | 1 | - | new (ok) |
| H028 | new | Methane | METHANE (ACCEPT: CH₄) | yes | 5 | 2 | - | new (ok) |
| H029 | new | 23 | 23 | yes | 5 | 3 | - | new (ok) |
| H030 | new | W: Calcium titanate | W) CALCIUM TITANATE | yes | 5 | 2 | - | new (ok) |
| H031 | doe | Aldehydes | ALDEHYDE | yes | 5 | 3 | - | new (miss) |
| H032 | new | 1 and 3 (Topaz and Corundum) | 1, 3 | yes | 5 | 2 | - | new (ok) |
| H033 | new | Z: The Moon lacks weathering, erosion and plate  | Z) THE MOON LACKS THE WEATHERING, EROSION AND PL | yes | 5 | 1 | giveaway | new (ok) |
| H034 | new | 6 | 6 | yes | 5 | 2 | - | new (ok) |
| H035 | new | 1 and 2 | 1, 2 | yes | 5 | 3 | - | new (ok) |
| H036 | doe | 2 and 3 (1 is false: transmitted intensity is pr | 2 AND 3 | yes | 4 | 4 | unclear_aloud | doe (ok) |
| H037 | new | 5 hours | 5 | yes | 5 | 2 | - | new (ok) |
| H038 | new | 2 | 2 | yes | 5 | 1 | unclear_aloud | new (ok) |
| H039 | new | Bundle sheath cells | BUNDLE-SHEATH CELLS (ACCEPT: BUNDLE SHEATH) | yes | 5 | 2 | - | new (ok) |
| H040 | doe | 0.25 (units not given; m/s if x in meters) | ONE-FOURTH (ACCEPT: 0.25) | yes | 5 | 3 | unclear_aloud | new (miss) |
| H041 | new | Termination shock | TERMINATION SHOCK (DO NOT ACCEPT: HELIOPAUSE OR  | yes | 5 | 3 | - | new (ok) |
| H042 | new | 8/15 | 8/15 | yes | 5 | 2 | - | new (ok) |
| H043 | doe | Neutrophil, basophil and macrophage | NEUTROPHIL; BASOPHIL | NO | 4 | 2 | - | doe (ok) |
| H044 | new | W: Hydrogen gas | W) HYDROGEN GAS | yes | 5 | 1 | - | new (ok) |
| H045 | doe | Sandstone, shale, limestone (nearest to farthest | 3, 1, 2 | yes | 3 | 4 | multiple_defensible | doe (ok) |
| H046 | new | Z: Sea urchin | Z) SEA URCHIN | yes | 5 | 1 | - | new (ok) |
| H047 | doe | Sulfur | SULFUR | yes | 5 | 2 | - | doe (ok) |
| H048 | doe | Ephemeral streams (washes/arroyos) | EPHEMERAL STREAMS | yes | 4 | 2 | - | doe (ok) |
| H049 | new | X: A clear, calm night with moist air near the g | X) A CLEAR, CALM NIGHT WITH MOIST AIR NEAR THE G | yes | 5 | 2 | - | new (ok) |
| H050 | new | Y: Epinephrine | Y) EPINEPHRINE | yes | 5 | 1 | - | new (ok) |
| H051 | doe | Z: 0.385 | Z) 0.385 | yes | 5 | 3 | - | doe (ok) |
| H052 | new | Y: 27 | Y) 27 | yes | 5 | 2 | - | new (ok) |
| H053 | doe | 1.5 | 3/2 (ACCEPT: 1 ½, 1.5, 3 TO 2) | yes | 5 | 3 | - | doe (ok) |
| H054 | new | Y: 0.10-molal calcium chloride | Y) 0.10-MOLAL CALCIUM CHLORIDE | yes | 5 | 2 | - | new (ok) |
