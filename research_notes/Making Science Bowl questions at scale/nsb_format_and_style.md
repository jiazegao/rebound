# NSB question format and house style (high school and middle school): rules spec plus a measured profile of Rebound's DOE library

Scope note: who writes and reviews NSB questions is covered by another researcher and is left out here. "Local data" below means Rebound's copy of the DOE sample sets in `/home/user/rebound/public/data/doe/` (23,720 questions), measured with scripts kept in `/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/` (`profile.py` → `out.txt`, `checks.py` → `checks.txt`, `extra.py` → `extra.txt`, `misc.py` → `misc.txt`, `examples.py`). Web pages were fetched on 2026-11-21.

## 1. What do the latest official rules (2027 season, HS and MS) specify about round structure, timing, question types, answer acceptance, interrupts/blurts, challenges and materials?

### Takeaway
One rulebook covers both levels: the in-person 2027 rules (dated 10-04-2026) and the 2027 virtual-regional rules (dated July 13, 2026). They fix scoring (toss-up 4, bonus 10), timing (5 s to buzz, 20 s for a bonus, 30 s for Finals visual bonuses, no extra time for computation), the MC answer rules (letter or exact choice text), a detailed appendix of answer-form conventions, and the interrupt, blurt, challenge and no-calculator rules. They don't say how many toss-ups an in-person round has (the virtual rules say 18), and they never mention ACCEPT or DO NOT ACCEPT lines, which are a packet convention.

### Cited Findings

**Documents and currency**
- The latest in-person rulebook is "2027 National Science Bowl® Official Academic Competition Rules (changes from 2026 are in green)", 15 pages, every page footed 10-04-2026. It covers eligibility for both HS (grades 9–12) and MS (grades 6–8) — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- I extracted the green (changed) text by colour. The only 2027 changes are dates: birth-date windows, the Finals dates (April 29 – May 3, 2027), the March 18, 2027 availability deadline, the 2028/2029 eligibility ban, and the Finals schedule. All question, timing and answer rules carry over unchanged from 2026 — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf) (colour extraction: `green.py` in the scratch folder)
- The virtual rulebook is "2027 National Science Bowl® Official Academic Competition Rules for 2027 Virtual Regional Competitions", dated July 13, 2026 — [Rules2027_Virtual_NSB.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027_Virtual_NSB.pdf)
- Players may not see any official NSB questions "other than those published on the NSB website" (Rule 1-2) — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)

**Round structure**
- Rule 3-1: there are two question types, toss-ups (4 points) and bonuses (10 points). A team that answers a toss-up correctly "will always have an opportunity to answer a bonus question; the other team is ineligible." Non-verbal communication is allowed on toss-ups; verbal and non-verbal on bonuses — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Rule 3-1: "The question categories for both middle school and high school are Biology, Chemistry, Earth and Space Science, Energy, Mathematics, and Physics." — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Rule 5-1: a match runs "until either the time expires or all toss-up questions (and earned bonuses for correct toss-ups) have been read." Regionals play two 8-minute halves with a 2-minute break. The Finals play 10-minute halves, and Finals rounds with visual bonuses play 12-minute halves. Each half begins with a toss-up — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- The in-person rules give no number of toss-ups per round. The virtual rules say the match runs until time expires or "all 18 toss-up questions" have been read (virtual Rule 5-1) — [Rules2027_Virtual_NSB.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027_Virtual_NSB.pdf)
- Stanford's invitational describes the standard match as "23 pairs of questions read by a moderator" — [Stanford Science Bowl resources](https://scibowl.stanford.edu/resources)
- Round sizes in the official sample sets: 25 toss-up/bonus pairs per round in 2007–2013, 23 in 2014–2020, 18 in HS 2021, HS 2022 and MS 2022, and 15 in MS 2021 — local data ([index.json](/home/user/rebound/public/data/doe/index.json); per-set table in [out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt))
- Tiebreakers in elimination games are 5 toss-ups, with no bonuses and no game clock (Rule 6-4). When three or more teams are tied in a round robin, each team hears the same 5 toss-ups in a separate room, scored +1/−1/0 with no interrupt penalties (Rule 9.1 iii) — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Finals format: 8 round-robin divisions, and the top 4 of each go to a 32-team double elimination (Rules 2-2, 10-1). HS ties for division places are broken by "the rankings of the teams in the Division Team Challenge" (10-3). MS ties use head-to-head records, then tiebreaker matches (10-2) — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Category order within rounds, measured in the sample sets:
  - 2014–2020 HS rounds: 4 toss-ups in each category and 3 in Energy (count pattern 3,4,4,4,4,4 in 17/17 rounds of 2018 and 2020 sets). The toss-ups come in blocks of six with each category at most once (17/17 rounds in Set 15, 9/9 in Set 13).
  - 2021–2022 rounds (HS, and MS 2022): 3 per category in a strict fixed cycle, Biology → Chemistry → Earth and Space → Energy → Math → Physics, with each round starting at a different point (15/15 rounds of HS Set 17, 9/9 of MS Set 16).
  - MS 2017–2020 used five printed categories at 5/5/5/5 plus 3 Energy, without blocks.
  - Two toss-ups in a row almost never share a category in 2018–2022 sets: none in any set except MS Set 13 (2019), which has 1 such pair in 374.
  - The bonus is in the same category as its toss-up in 11,858 of 11,860 pairs.
  - Source: local data ([checks.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/checks.txt), [out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt))
- Packet layout in the official PDFs:
  - The heading "TOSS-UP", then "1) Biology — Short Answer <stem>".
  - For MC, the choices on separate lines "W) …", "X) …", "Y) …", "Z) …".
  - Then "ANSWER: …", the heading "BONUS", "1) Biology — Short Answer …" and "ANSWER: …".
  - The 2020 packet adds a round header ("ROUND ROBIN – ROUND 1") and "******************" separators. The 2022 packet puts one pair per page (18 pages).
  - Categories print as "Biology", "Chemistry", "Earth and Space" (or "Earth & Space"), "Energy", "Math" and "Physics".
  - Sources: [2022-HS-1.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/HS-Sample-Questions/Sample-Set-17/2022-HS-1.pdf); [2020-HS-Rd1.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/HS-Sample-Questions/Sample-Set-15/2020-HS-Rd1.pdf); [2022-MS-1.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/MS-Sample-Questions/Sample-Set-16/2022-MS-1.pdf)
- Rule 3-5: "no player may buzz in until AFTER the moderator has identified the subject area of the question." Rule 5-6: a question "will be considered to have been begun if the subject area has been completely read" — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)

**Timing**
- Rule 5-2: teams have 5 seconds to buzz after a toss-up is read. "Timing will begin after the moderator has completed reading the toss-up question, including all choices on a multiple-choice question." Rule 3-8: after a wrong answer, blurt or verbal communication on a fully read toss-up, the other team gets "another 5 seconds" — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Rule 5-3: after a player is recognized, the moderator allows "a natural pause (up to 2 seconds)". Stalling counts as a wrong answer — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Bonus timing:
  - Rule 5-4: the team has 20 seconds "for its captain to begin to give its answer", timed from the end of the reading, including all MC choices.
  - Rule 5-5: the timekeeper says "5 SECONDS" after 15 s and "TIME" at 20 s. A captain who has begun may finish without stalling.
  - Finals visual bonuses get 30 s, with the warning at 25 s.
  - Source: [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- No timing rule gives computation questions extra time. Rules 5-2 to 5-5 set one 20 s bonus window whatever the content, and the only longer window is the Finals visual bonus — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- DOE's coaching page says "many bonus questions involve long computations that cannot afford the time for passing the answer down the line", so it suggests the captain be the team's mathematician — [NSB Tips and Resources](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/Tips-and-Resources)

**Question types and multiple-choice answers**
- Rule 3-3: "Questions are either multiple-choice or short-answer."
  - A player may answer an MC question "with either the letter answer (W, X, Y or Z) or the verbal answer; however, if the verbal answer is given, it must be exactly as indicated in the question or as read by the moderator."
  - For choices "conventionally written in symbols, common alternate expressions… shall be accepted" (for example "square root of 2" or "square root 2", "sine x" or "sine of x").
  - Only "the best of the 4 choices" is acceptable. If several choices are equally correct, any of them is accepted. If all are "equally not correct", the question is discarded.
  - Source: [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Rule 3-7: "the first response given… is the only one that counts". If a player gives "both a letter answer and a scientific answer to a multiple-choice question, both parts must be correct." Prefacing remarks such as "my answer is", or repeating the question, count as delaying the game and are scored incorrect — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Rule 3-4: "Once read in its entirety, a question will not be re-read." Rule 3-9: bonus answers must come from the captain. In virtual play the captain raises a hand and answers without being called on (virtual Rule 3-9) — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf); [Rules2027_Virtual_NSB.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027_Virtual_NSB.pdf)

**Answer conventions (Appendix A, applied "unless the question specifies otherwise")**
- A-1, conventions for all questions — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf):
  - g = 9.8 m/s² or 32 ft/s², near Earth's surface. Ignore unspecified friction and air resistance.
  - c = 300,000,000 m/s or 186,000 mi/s.
  - Speed of sound = 340 m/s or 1125 ft/s.
  - Absolute zero = −273 °C or −460 °F.
  - μ₀ = 4π × 10⁻⁷ H/m.
  - Numbers are base 10. Geometry is Euclidean, at most 3-D.
  - Trigonometric arguments are in radians. Log bases are specified unless the base is irrelevant.
  - Coins, dice and decks are fair and standard (a 52-card deck).
  - Functions are real, with the largest domain.
  - "three points" means three distinct points.
  - Visual-bonus figures "may or may not be drawn to scale".
- A-2(a), numerical answers "in exact and simplest form" — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf):
  - Integers as integers (2³ → 8).
  - Fractions and ratios in lowest terms. Improper or mixed fractions are both allowed.
  - No negative exponents ((12/20)x⁻⁴ → 3/(5x⁴)).
  - Ratios as fractions or as "3 to 2".
  - Irrational answers exact (9π). Radicals in simplest rationalized form (8/∛32 → 2∛2).
  - Angles 0 ≤ θ < 2π, or 0 ≤ θ < 360 in degrees.
  - Complex numbers as a + bi. Vectors in i, j, k ("i-hat" also accepted).
  - Polynomials in standard form, in decreasing degree with variables alphabetical. Factor completely over the integers. Solve equations over the reals.
  - Non-base-10 numerals read digit by digit ("two-three-four"), though "two hundred thirty-four" is also acceptable.
  - No scientific notation unless requested. No repeating decimals (use fractions).
  - Decimals read digit by digit ("point-two-four").
- A-2(b)–(k), other answer conventions — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf):
  - (b) Balanced equations use integer coefficients with no common factor.
  - (c) Chemical answers must avoid ambiguity. IUPAC preferred or systematic names, or formulas "when there are no isomers": CO2 is OK; "ethanol" and "ethyl alcohol" are OK but C2H6O is not; Cu2+, "copper two plus" and copper (II) are OK but "copper ion" is not.
  - (d) A taxonomic name may be "the scientific name or a synonymous common name (e.g., Arthropoda or arthropods)".
  - (e) Multi-part answers come in the order asked or labelled ("2 and 7", or "largest is 7 and smallest is 2", but not "7 and 2").
  - (f) "Short-answer list questions": "In questions that give a list of choices and ask for all choices that satisfy a certain property, the choices will be numbered. Either the verbal names or the numbers will be acceptable." Position words ("next to last"), "all" and "none" are accepted, as is "2 only".
  - (g) Named entities need the name, not a description: "Newton's Second Law", not "F = ma".
  - (h) "Units do not need to be stated in numerical answers; however, if they are stated, they must be correct". Unspecified units default to SI.
  - (i) A person's last name alone is sufficient, but a first name, if given, must be correct.
  - (j) "to the nearest unit" means round to the nearest multiple of that unit (1 m to the nearest inch = 39; 1 mile to the nearest hundred feet = 5,300). "Numbers provided in a question should be assumed to be exact" and don't limit significant figures.
  - (k) Answers required to a set number of significant figures "must be in integer or decimal form".
- Rule 3-3 points to the appendix as "the official list of conventions used regarding questions and answers". The rules never define "ACCEPT" or "DO NOT ACCEPT" lines. Those appear only in the packets' answer lines, for example "ANSWER: SEMICIRCULAR CANALS (ACCEPT: SEMICIRCULAR DUCTS)" — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf); [2022-HS-1.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/HS-Sample-Questions/Sample-Set-17/2022-HS-1.pdf)

**Interrupts, blurts and communication**
- Rule 6-2: if an interrupted toss-up is answered correctly, the team gets 4 points. "For any other circumstance (such as a wrong answer, a blurt, or audible communication), 4 points will be added to the opposing team's score", and the opponent, if still eligible, hears the toss-up "re-read from the beginning". Rule 6-3 covers the "double interrupt" during the re-read, after which 4 points go back to the first team — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Rule 4-1, blurts: a player must be recognized by designation (e.g., "A-2") before answering. Speaking first "is termed a blurt". The moderator won't say whether the answer was right, "no points will be awarded", and the blurting team is ineligible. If the question hadn't been completely read, it "will be reread in its entirety" for the opponent. The scoring summary lists a blurt on a fully read toss-up at +0, with the team disqualified from the question, and any of these on an interrupted toss-up at +4 to the opponent — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Rule 4-2, in person: on toss-ups, players "may communicate with each other quietly and non-verbally (e.g., in writing or by hand-signals)" but may not "audibly communicate verbally, mouth words or use audible signals such as tapping". Virtual: "only… hand signals. No writing or use of the Zoom chat box" — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf); [Rules2027_Virtual_NSB.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027_Virtual_NSB.pdf)
- Rule 3-10: each team gets one "accidental" buzz per round during the opponent's questions. Further ones count as distractions, which award the opponent 4 or 10 points plus the option of running 20 or 40 s off the clock — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)

**Challenges**
- Rule 7-1: challenges "must be made before the moderator begins the next question (that is, reads the question's scientific category)", or within 3 s of the end of a half for its last question. Only the 4 active players may challenge, and any involvement by others means the challenge is ruled against the team — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Rule 7-2: challenges may concern scientific content or the administration of the rules, never judgment calls. The listed judgment calls include "whether an answer has been pronounced correctly, whether an answer to a multiple-choice question is exact, whether a verbal answer to a short-answer list question is sufficient" — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Rule 7-3: each team gets 2 unsuccessful scientific-content challenges per round, including tiebreakers. Successful challenges don't count — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Rules 7-5 and 7-6: a team whose answer was ruled wrong must hold its challenge until the opponent has finished its attempt. If the challenge is upheld, the opponent's result is voided, time is restored, and the challenger gets 4 points and the bonus. If a correct ruling is overturned, the second team, if eligible, gets the next toss-up — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)

**Calculators and scratch paper**
- Rule 8-4: "No notes may be brought to the competition table. Nothing may be written before the clock starts. Scratch paper will be provided at the beginning of each match and collected at half-time and at the conclusion of the match." Rule 8-5: "Calculators, electronic devices, banner pens, periodic tables or other charts, etc. are not permitted during play", on pain of disqualification — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- Virtual Rule 8-3: "up to five sheets of 8.5 x 11 paper as scratch paper and a pen or pencil". Calculators, electronic devices and "scientific posters and charts (such as periodic tables or H-R diagrams)" are banned — [Rules2027_Virtual_NSB.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027_Virtual_NSB.pdf)

**Older rules, labelled by year (for context)**
- 2021 virtual rules (updated Oct 15, 2020): toss-ups were answered by raising a hand, and communication was allowed on toss-ups and bonuses ("verbal, visual, or written in the Zoom chat box"). MS categories were "Life Science, Physical Science, Earth and Space Science, Energy, and Mathematics" — [2021 rules](https://science.osti.gov/-/media/wdts/nsb/pdf/coordinator-resources/2021_nsb_rules.pdf)
- 2022 in-person rules (DOE SPR regional mirror, dated March 5, 2022):
  - Categories were already the six HS categories "for both middle school and high school".
  - A blurt earned "4 points to the opposing team".
  - Toss-up non-verbal communication included "mouthing words".
  - Visual bonuses were limited to "some of the High School double elimination rounds".
  - The 2027 text says "0" for blurts, bans mouthing, and refers to "some of the double elimination rounds" without "High School".
  - Sources: [2022 rules, SPR mirror](https://www.spr.doe.gov/ScienceBowl/sb2022/CompetitionRules2022_InPerson.html); [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)

### Inferences
- **Writing for interrupts.** Players may buzz as soon as the category has been read, and a wrong interrupt hands the opponent 4 points plus a full re-read. So a toss-up must be fair at every point of the reading and fully self-contained for a second hearing. The answer should be determined only once the question is actually asked. MC toss-ups must make sense once the choices are read, because the 5 s clock starts only after choice Z.
- **Writing MC choices.** The verbal answer must match the choice exactly, and challenges about MC exactness are not allowed. So choices must be short, distinct and easy to say, with no two that a player could say in the same words.
- **Writing short answers.** Officials judge only against the printed line, and 7-2 excludes "sufficiency" challenges on list questions. Writers therefore need to put foreseeable synonyms, symbols and formulas in ACCEPT, and likely near-misses in DO NOT ACCEPT.
- **Computation.** There is no calculator and no extra time, so a computation bonus must be solvable on scratch paper within 20 s of the end of the reading. Toss-up computations must be quicker still: 5 s, plus whatever lead the player gains by buzzing early.
- **Round templates.** A generator should support two formats: 23-pair rounds (the 2014–2020 regional format) and 18-pair rounds (the 2027 virtual format, and the 2021–2022 sample format). For tiebreakers it should draw 5 toss-ups with no bonuses.

### Gaps
- No in-person rule states the number of toss-ups per regional round, and I couldn't fetch the NSB Coordinator Manual (sc-drcds.osti.gov is unreachable from this session). The 23-pair figure rests on the 2014–2020 sample sets and Stanford's description. A search-engine summary said Wikipedia puts regional rounds at 23 and Finals rounds at 25, but the Wikipedia page returned HTTP 429, so this is unverified.
- The 2023–2026 rulebooks are gone (older `RulesYYYY.pdf` URLs return 404). The exact season when blurts went from 4 points to 0, and when mouthing words was banned, is unknown: the change falls between 2022 and the 2026 season.
- The HS Finals "Division Team Challenge" is referenced but not described in the rules.

## 2. What are the current HS and MS categories, what does each cover, and how does MS differ from HS in scope and difficulty?

### Takeaway
Both levels use the same six categories: Biology, Chemistry, Earth and Space Science, Energy, Mathematics and Physics. MS has done so since at least the 2022 season. Before that, MS used Life Science, Physical Science, Earth and Space, Energy and Math, plus General Science until 2016. MS differs from HS in depth, not format. DOE pitches MS regionals at 6th–8th-grade science and Algebra II textbooks, HS regionals at AP level, and the Finals one step higher. The Energy category is now DOE-lab research news drawn from any discipline.

### Cited Findings
- Rule 3-1 (2027): "The question categories for both middle school and high school are Biology, Chemistry, Earth and Space Science, Energy, Mathematics, and Physics." This text isn't marked as changed for 2027 — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)
- The same sentence appears in the 2022 in-person rules — [2022 rules, SPR mirror](https://www.spr.doe.gov/ScienceBowl/sb2022/CompetitionRules2022_InPerson.html). The 2021 virtual rules list MS categories as "Life Science, Physical Science, Earth and Space Science, Energy, and Mathematics" — [2021 rules](https://science.osti.gov/-/media/wdts/nsb/pdf/coordinator-resources/2021_nsb_rules.pdf)
- MS category history as printed in the sample sets — local data ([checks.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/checks.txt); [REPORT-MS.md](/home/user/rebound/scripts/doe/REPORT-MS.md)):
  - 2007–2009: Life Science, Physical Science, Earth Science, Math, General Science.
  - 2010–2016: Energy added.
  - 2017–2021: Life Science, Physical Science, Earth and Space, Math, Energy (General Science dropped).
  - 2022 (Set 16): Biology, Chemistry, Earth and Space, Energy, Math, Physics.
- HS printed categories: 2007 and 2009 had Biology, Chemistry, Physics, Math, Earth Science, General Science and Astronomy. 2011 onward has the current six — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt))
- Correction: the Rebound MS import report says "The 2027 rules split middle school Physical Science into Physics and Chemistry." The 2022 rules already used the split — [REPORT-MS.md](/home/user/rebound/scripts/doe/REPORT-MS.md); [2022 rules, SPR mirror](https://www.spr.doe.gov/ScienceBowl/sb2022/CompetitionRules2022_InPerson.html)
- DOE's live FAQ is stale and contradicts the rules. It says "The high school questions cover seven categories at a college freshman level" (then lists six) and "The middle school questions are in life science, physical science, earth and space science, energy, mathematics". It also says "questions in earlier rounds are easier than questions in later rounds" and "Regional questions are generally easier than national questions" — [NSB FAQ](https://science.osti.gov/wdts/nsb/FAQ)
- DOE difficulty guide: "National Science Bowl questions are by and large sourced from science textbooks commonly used at the middle school through undergraduate levels." Content difficulty by level — [NSB Tips and Resources](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/Tips-and-Resources):
  - MS Regional: "6th through 8th grade science and Algebra II textbooks".
  - MS National: "Honors-level high school science and Algebra II textbooks".
  - HS Regional: "AP-level high school science textbooks".
  - HS National: "Introductory college-level science textbooks".
- The same page says the first eight rounds of each sample set "come from the early rounds at Regional competitions and are typically less difficult than the questions in later rounds" — [NSB Tips and Resources](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/Tips-and-Resources)
- DOE's sample textbooks show what each category covers. The MS table still uses the old Life Science and Physical Science headings — [NSB Tips and Resources](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/Tips-and-Resources):
  - HS Biology: Glencoe Biology; Campbell; Raven; Alberts *Molecular Biology of the Cell*; Costanzo *Physiology*; Raven *Biology of Plants*.
  - HS Chemistry: Zumdahl; Klein *Organic Chemistry as a Second Language*.
  - HS Physics: Giancoli; Serway *College Physics*; Young *University Physics*; MIT OpenCourseWare.
  - HS Math: Pre-calculus; Calculus of a Single Variable; Probability and Statistics; Multivariable Calculus; Linear Algebra; Differential Equations.
  - HS Earth and Space: Seeds *Foundations of Astronomy*; Tarbuck & Lutgens; Garrison *Oceanography*; Grotzinger *Understanding Earth*; Zeilik.
  - HS Energy: "US Department of Energy National Laboratory Websites".
  - MS Math: Algebra 1, Geometry, Algebra 2.
  - MS Physical Science: McGraw-Hill *Physical Science*; Hewitt; Giancoli; Zumdahl.
  - MS Energy: DOE lab websites.
- Measured topic mix per category (all sets), from Rebound's rule-based tagger. These tags are indicative, not official — local data ([misc.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/misc.txt)):
  - HS Biology: animal physiology 21%, biochemistry and metabolism 13%, organism diversity 12%, plant biology 10%, molecular biology and biotech 10%, cells 9%, microbiology and immunology 9%, genetics 6%.
  - HS Chemistry: organic 18%, bonding and geometry 17%, acids and bases 9%, stoichiometry 8%, atomic structure 8%.
  - HS Earth and Space: solar system 15%, meteorology and climate 14%, minerals and rocks 13%, stars 13%, hydrology 9%, tectonics 9%, oceanography 7%.
  - HS Math: algebra 26%, geometry 20%, calculus 9%, number theory 9%.
  - HS Physics: kinematics and forces 19%, electrostatics and circuits 17%, nuclear and particle 11%.
  - MS Math: geometry 28%, algebra 25%, arithmetic 14%, number theory 10%, trigonometry 1%.
- Energy has changed character. Among Energy questions, the share that mention a DOE national lab, DOE facility or "Department of Energy" is — local data ([misc.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/misc.txt)):
  - HS: 1% (2007–13), 22% (2014–18), 96% (2019–22: 340 of 354).
  - MS: 0%, 18%, 96% (304 of 318).
- Rebound's cross-subject tags put HS Energy questions at physics 31%, chemistry 18%, biology 10%, math 6% and earth/space 4%; 32% get no cross-subject tag — local data ([misc.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/misc.txt))
- Invitationals confirm Energy's lab focus. MIT says it "modified the Energy section found in official tournament question sets to focus on current research conducted at MIT" — [MIT Science Bowl](https://www.mitsciencebowl.com/). Stanford: "Our Energy category, typically focused on Department of Energy labs" — [Stanford Science Bowl resources](https://scibowl.stanford.edu/resources)
- Measured MS-vs-HS differences, 2019–2022 sets — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt)):
  - MS stems are shorter: toss-up median 18 words vs 20; bonus median 22 vs 25.
  - "Identify all" is less common in MS: 7.5% vs 11.4% of questions.
  - MS physics is less numeric: 39.4% vs 46.7%.
  - MS math is as numeric as HS math: 84.1% vs 84.6%.
  - ACCEPT lines are slightly rarer in MS: 14.8% vs 17.5%.
  - The format is otherwise identical.
- Eligibility: MS is grades 6–8 (at most 3 years), HS grades 9–12 (at most 4 years). No student may compete at both levels in the same year (Rule 1-1) — [Rules2027.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf)

### Inferences
- New MS questions should be written in the six 2027 categories. Old MS "Physical Science" items are a style reference split across Chemistry and Physics. Old "General Science" items have no current home.
- An Energy generator needs a different recipe from the other categories. The 2019–2022 template is a one-sentence lead-in ("Scientists at <named DOE lab> are studying…"), then a standard Biology, Chemistry, Physics, Earth-science or Math question about that research. The source should be a real, citable DOE lab news item, which also matches DOE's own study list ("DOE National Laboratory Websites").
- For difficulty: MS math stays within arithmetic, Algebra I/II and geometry. HS math reaches calculus, linear algebra and complex numbers. The surface format is the same at both levels, so the level difference has to come from the content.

### Gaps
- DOE doesn't publish a syllabus or topic weighting per category. The only official scope indicators are the textbook list and the difficulty statement, and the topic shares above come from Rebound's tagger, not from DOE.
- No official sample questions after the 2022 season are public: HS Set 17 (2022) is flagged as the newest set on the live page. So 2023–2026 category coverage, and any changes to Energy since then, can't be measured.

## 3. What is NSB house style in official questions?

### Takeaway
Modern NSB style (2019–2022 sets) is plain and compact:
- Usually a single-sentence direct question opening with "What" or "Which of the following". About a third add a one-sentence lead-in.
- MC: four short, parallel W–Z choices, never "all/none of the above", numeric options in order, balanced answer letters. Negative stems are rare and set NOT in capitals.
- Bonuses lean on formulaic "Identify all of the following three…" and "Rank the following three…" items with numbered "1) …; 2) …; 3) …" lists.
- Short answers are one or two words, in capitals, with ACCEPT and DO NOT ACCEPT in parentheses.
- Computation stems give about two numbers and name the unit up front ("In joules, what is…").
- Energy items open with a DOE-lab lead-in.

### Cited Findings
**DOE's own "rules of thumb that our writers follow"** — [NSB Tips and Resources](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/Tips-and-Resources)
- "Short Answer questions should always have one- or two-word answers with minimal room for interpretation."
- "Questions should minimize excessive verbiage in order avoid confusing fluff."
- "Follow the conventions as listed in the Appendix of the rules."
- "The best questions not only require recall of knowledge, but also involve application of that knowledge to arrive at the correct answer."
- "The goal of writing questions is not to stump students with esoteric facts, but to challenge them to study more…"
- The page also tells students to mimic "the style and construction of Official National Science Bowl® questions" and notes that questions "tend to revisit the same major topics year after year".

**Openings (2019–2022 sets)** — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt), [extra.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/extra.txt))
- HS toss-ups (n = 1,232):
  - First word: "What" 22.8%, "Which" 13.4%, "Scientists" 8.0%, "A" 8.0%, "The" 7.1%, "In" 5.8%, "If" 3.3%, "Researchers" 2.8%.
  - First two words: "What is" 13.3%, "Which of" 13.1%, "Scientists at" 6.9%, "Researchers at" 2.7%.
  - "What is the term…" 3.3%.
  - 91.6% contain what or which; 25.6% contain "which of the following".
- HS bonuses (n = 1,232): "Identify all" 16.1%, "What is" 8.4%, "Which of" 8.4%, "Scientists at" 7.1%, "Rank the" 3.7%, "Place the" 1.3%, "Order the" 0.7%.
- MS toss-ups (n = 1,094): "What is" 17.6%, "Which of" 11.5%, "Scientists at" 7.0%, "What is the term" 5.1%. MS bonuses: "Identify all" 11.7%, "What is" 9.3%, "Which of" 8.2%, "Rank the" 3.2%.
- Sentence count (numbered lists excluded):
  - HS toss-ups: 1 sentence 66.7%, 2 sentences 30.2%, 3 or more 3.1%.
  - HS bonuses: 52.7%, 40.9%, 6.3%.
  - MS toss-ups: 71.2%, 26.2%, 2.6%.
  - MS bonuses: 58.3%, 35.1%, 6.7%.
- MC stems end with "?" in 99.7% (HS) and 99.8% (MS) of 2019–22 sets. Older sets often ended with a colon, sentence-completion style ("…the predominant mineral in the mantle is:"): 99.7% of MC stems in HS Set 1 (2009) and 17.9% across all HS sets.

**Multiple-choice choices** — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt), [misc.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/misc.txt), [checks.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/checks.txt))
- Always exactly four choices, W–Z (4,916 of 4,916 HS MC questions).
- Choices are short: median 2 words, p90 8 (HS 2019–22).
- In 2019–22, 89–90% of choices start with a capital letter; most of the rest begin with numbers or symbols. Older sets often used lowercase choices (about 72% capitalized overall).
- "All of the above" and "None of the above" never appear in 2019–22 (0 of 677 HS, 0 of 558 MS MC questions), and only once in all 9,736 MC questions. "Both" or "Neither" choices appear in under 1%.
- Correct letters are balanced in 2019–22: W 25.4%, X 24.5%, Y 24.8%, Z 25.3% (HS). Older sets under-used Z (21.0% across all HS sets).
- No "longest answer is right" cue: the correct choice is the longest in 27.8% (HS) and 24.0% (MS) of 2019–22 non-numeric MC, against a chance rate of about 25%.
- Non-numeric choices are not alphabetized: 7.2% of HS questions are in alphabetical order, against 4.2% by chance.
- Numeric choices go in monotonic order:
  - Of 69 HS 2019–22 questions with all-numeric choices, the parser confirmed 42 ascending and 7 descending.
  - Most of the other 20 are ordered too once units or powers are read (e.g., "W) 1 nanometer X) 100 nanometers Y) 10 microns Z) 1 millimeter").
  - True exceptions are rare (e.g., doe-hs-13-r01-t03 "3π/2; 5π/4; 8π/5; 13π/6").
- The MC answer line always gives letter plus choice text in capitals ("ANSWER: W) TROPICAL DEPRESSION"): 100%, both levels. MC answers never carry ACCEPT lines (0.0%).
- Pronunciation guides go in square brackets, with the stressed syllable in capitals ("vestibular [ves-TIB-u-lar]", "Lysosome [LYE-soh-sohm]"). Share of questions with one in the stem or choices, 2019–22:
  - HS overall 22.0%: biology 39%, energy 29%, chemistry 26%, earth/space 26%, physics 12%, math 0.2%.
  - MS overall 16.2%.

**Negative stems**
- In 2019–22 sets, a capitalized "NOT" appears in 1.5% of HS and 1.1% of MS questions, down from 7.3% (HS) and 8.1% (MS) in 2007–2013. Other capitalized emphasis is rare in 2014–22 HS sets: "TRUE" 0.6%, "LEAST" 0.2%, "EXCEPT" ~0%. The usual form is "Which of the following is NOT …" — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt))

**Identify-all, rank and numbered-statement questions** — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt), [checks.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/checks.txt), [extra.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/extra.txt))
- The fixed formula is "Identify all of the following three <items> that <property>: 1) …; 2) …; 3) …." Items are separated by semicolons and the list ends with a period.
  - List size (HS 2014–22, n = 623): 3 items in 566 (91%), 4 in 53.
  - Answers are printed as numbers. Forms counted: single number 199; "1 AND 3" or "1, 2, AND 3" 161; "1, 3" 153; "ALL" or "ALL OF THEM" 68; "NONE" 25; "2 ONLY" 10.
  - About 15% of answers are all items and about 4% none.
- HS 2019–22: identify-all is 20.4% of bonuses but only 2.5% of toss-ups. MS: 14.4% vs 0.7%.
- Rank or order questions use "Rank the following three <items> in order of increasing <property>: 1) …; 2) …; 3) …." Variants are "Place the following three…" and "Order the following…".
  - HS 2014–22 (n = 173): 3 items in 140, 4 in 28. "Increasing" is the direction in 115; "from least…", "chronological" and similar are rare.
  - The answer is printed as "1, 3, 2".
  - Share in HS 2019–22: 6.7% of bonuses, 0.9% of toss-ups.
- Numbered lists of any kind appear in 15.2% of HS 2019–22 questions (27.0% of bonuses), up from 3.7% in 2007–2013.
- This style rose over time. Identify-all share of HS questions by set: about 0–1.6% in most 2007–2013 sets, 3.7% (2014), 8.7% (2015), 10–14% in 2017–2021, and 8.3% in 2022 (Set 17).

**Computation questions** — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt))
- Numbers given: numeric-answer stems contain a median of 2 numbers (p90: 4), at both levels.
- Units are usually named up front ("In kilograms, what is the mass…", "How far, in meters…"), in 18.9% of HS 2019–22 numeric-answer stems. Other leads are "To the nearest integer…", "Giving your answer in seconds and in scientific notation…" and "Rounding your answer to the nearest 10,000…".
- Explicit rounding or answer-form instructions appear in only 13.7% (HS) and 16.2% (MS) of 2019–22 numeric-answer stems:
  - "nearest" 7.2% / 11.9%
  - significant figures 4.0% / 2.5%
  - scientific notation 0.4% / 0.8%
  - "as a fraction/ratio/percent" 1.2% / 1.3%
- The rest rely on the appendix default of exact, simplest form.
- Stated assumptions are uncommon ("assume"/"given that" in 4.0% of HS numeric stems), because constants come from Appendix A-1.
- Math is partly written to be read aloud. Among HS math 2019–22 stems: "f of x" 10.2%, "open parenthesis … close parenthesis" 6.6%, "the fraction with numerator … and denominator …" 4.0%. Unicode superscripts (x²) appear in 20.6% — local data ([extra.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/extra.txt))

**Short answers and answer lines** — local data ([extra.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/extra.txt), [out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt))
- Short-answer main answers (2019–22, list questions excluded) have a median length of 1 word. 92.3% (HS) and 93.3% (MS) are 2 words or fewer.
- Answers are printed in capitals: 94.9% (HS 2019–22).
- ACCEPT and DO NOT ACCEPT share one parenthesis after the answer, separated by a semicolon: "ESTIVATION (ACCEPT: SUMMER TORPOR; DO NOT ACCEPT: TORPOR)".
- The 2021 and 2022 sets switch to lowercase "do not accept:" (HS Set 16: 11 lowercase, 0 uppercase; MS Set 15: 10 and 0). All earlier sets use uppercase.
- Other notes are rare (<0.5% each): "MUST GIVE BOTH ANSWERS", "ACCEPT IN ANY ORDER", "in any order". "PROMPT" appears once in 12,024 HS questions. Older sets (2007–2013) sometimes print "(Solution: …)" (2.4% of HS questions); 2019–22 sets never do.

**How toss-ups differ from bonuses (HS 2019–22; MS similar)** — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt), [misc.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/misc.txt), [checks.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/checks.txt))
- Length: bonus stems median 25 words (p90 44) vs 20 (p90 37) for toss-ups.
- MC share: bonuses 21.3%, toss-ups 33.6%.
- Numeric answers: bonuses 32.5%, toss-ups 23.8%. HS physics: 64.5% of bonuses vs 28.9% of toss-ups.
- Identify-all: 20.4% of bonuses vs 2.5% of toss-ups. Rank: 6.7% vs 0.9%.
- A bonus is always in its toss-up's category but is otherwise independent: same topic tag in 17.5% of 5,557 tagged pairs, against a 14.1% random same-subject baseline.

**Lead-ins**
- In 2019–22, about 9–15% of all questions per set (8.8–15.0%) open with "Scientists/Researchers at <lab> are studying…". These are almost all Energy (76% of HS Energy questions start that way, and 96% mention a lab or DOE). The labs most named are Oak Ridge, Pacific Northwest, Lawrence Berkeley, Brookhaven, SLAC, Argonne, Ames and Thomas Jefferson — local data ([checks.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/checks.txt), [misc.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/misc.txt))

**Position in the set**
- Surface form barely changes with round number. In 2014–22 HS sets, rounds 1–8 vs rounds 9 and later: toss-up median 18 vs 20 words, MC 33.2% vs 35.4%, identify-all 9.0% vs 10.8%, numeric 26.2% vs 26.2%. Difficulty is carried by content, not format — local data ([extra.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/extra.txt))

**DOE's caution about the samples**
- DOE says "as fields of science advance, the answers to some of the questions change. The files below should be used as a resource for sample questions, not sample answers." — [HS sample page](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/HS-Sample-Questions); [MS sample page](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/MS-Sample-Questions)

### Inferences
- For indistinguishability, the strongest checkable signals are:
  - question-mark endings
  - four short, parallel, capitalized choices, with no all/none-of-the-above
  - balanced letters, and no longest-choice or alphabetical bias
  - ascending numeric choices
  - the exact "Identify all of the following three…" and "Rank the following three… in order of increasing…" formulas, with "1) …; 2) …; 3) …." lists and numeric answers
  - one-word capitalized short answers
  - unit-first computation stems
  - DOE-lab lead-ins in Energy only
  - bracketed stress-capitalized pronunciation guides on hard terms
- These features can be checked automatically against the measured rates.
- LLM drafts tend to have the correct choice longest, to overuse "NOT", and to leave numeric choices unordered. The library's near-chance rates give concrete targets for automated lint checks.
- Answer lines should follow the 2027 appendix, which can differ from older packets. For example, the 2019 MS packet's "CHORDATA (DO NOT ACCEPT: CHORDATES)" (doe-ms-13-r02-t08) conflicts with A-2(d), which accepts "a synonymous common name (e.g., Arthropoda or arthropods)" and was already in the 2022 rules ([2022 rules, SPR mirror](https://www.spr.doe.gov/ScienceBowl/sb2022/CompetitionRules2022_InPerson.html)). Old answer lines shouldn't be copied blindly.
- For Rebound's synthetic voice, two things in the text need converting: bracketed guides (read the guide, not the bracket) and symbolic math (superscripts, fractions). Official packets already verbalize some math ("open parenthesis"), so a voice-ready verbalized form is in keeping with house style.

### Gaps
- There is no public official style manual beyond DOE's five rules of thumb and the rules appendix. Everything else is inferred from published packets, the newest from the 2022 season. Style drift in 2023–2026 rounds (for example, the MC share rebounding to about 40% in 2022) can't be checked.
- "Typical" and "rare" here rest on regex classifiers with known error. See the method notes in section 4.

## 4. Measured style profile of Rebound's local DOE library (HS vs MS, by category)

### Takeaway
The library holds 12,024 HS and 11,696 MS questions (6,012 and 5,848 pairs) from 2007–2022 regional seasons. Across all sets about 41% are multiple choice, but recent sets run 22–40% MC depending on year. Stems are short: toss-up median 18 words HS and 15 MS overall, 20 and 18 in 2019–22, with bonuses about 4–5 words longer. About a quarter of questions have a numeric answer: roughly 80% in Math, 40–47% in Physics, and under 10% in Biology and Earth/Space. Identify-all questions (about 11% of HS questions recently) and ACCEPT lines (14–18%) have grown over time, while DO NOT ACCEPT stays at about 2%.

### Cited Findings

**Method and definitions** — local data ([profile.py](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/profile.py), [checks.py](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/checks.py), [schema.ts](/home/user/rebound/src/core/schema.ts))
- Inputs: every set listed in `index.json`. "Category" means Rebound's `subject`, mapped to the 2027 categories (legacy `general_science` and `physical_science` are reported separately). MS "Physical Science" was split into chemistry and physics by Rebound's importer.
- Stem words: whitespace tokens in `stem` after removing [bracketed] pronunciation guides, excluding choices. "Incl. choices" adds the choice words.
- "Numeric answer" means either:
  - a short answer whose main answer starts with a number, sign, radical, π or "negative", excluding identify-all, rank and numbered-list questions; or
  - an MC question whose four choices all start that way.
- Audit of the numeric classifier (math, physics, chemistry and energy, 2014–22):
  - About 27 of 30 random positives were genuine computations. The rest were numeric recall, such as a wind-energy percentage or a BCC coordination number.
  - About 5 of 30 random negatives were computations with non-numeric answer forms (coordinates, "x = 0 or x = 9", "EIGHT").
  - So the measure roughly approximates computation in Math, Physics and Chemistry, and overstates it in Biology and Earth/Space, where numeric answers are often recall ("how many domains of life").
  - Source: [checks.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/checks.txt)
- "Identify all" = stem contains "identify all". "Rank" = "rank", or "order/arrange/list/place/put the following". "Numbered list" = stem contains both "1)" and "2)". ACCEPT / DO NOT ACCEPT = non-empty `accept` / `reject` lists, or the words in `answerRaw`.

**Counts and seasons** — local data ([index.json](/home/user/rebound/public/data/doe/index.json), [manifest.json](/home/user/rebound/scripts/doe/manifest.json), [manifest-ms.json](/home/user/rebound/scripts/doe/manifest-ms.json), [out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt))

HS sets:

| Sets | Seasons | Rounds × pairs per round | Questions |
|---|---|---|---|
| HS 1–7 | 2009, 2012, 2007, 2011, 2011, 2012, 2013 | 15–17 rounds × 25 | 5,650 |
| HS 8–12 | 2014, 2015, 2016, 2017, 2018 | 17 × 23 | 3,910 |
| HS 13–14 | 2019 (two sets) | 9 × 23 and 8 × 23 | 782 |
| HS 15 | 2020 | 17 × 23 | 782 |
| HS 16 | 2021 (virtual year) | 10 × 18 | 360 |
| HS 17 | 2022, flagged "new set" on DOE's page; its PDF was created Feb 3, 2026 | 15 × 18 | 540 |

MS sets:

| Sets | Seasons | Rounds × pairs per round | Questions |
|---|---|---|---|
| MS 1–7 | 2009, 2008, 2007, 2010, 2011, 2012, 2013 | 10–18 × 25 (one round of 24) | 5,398 |
| MS 8–14 | 2014–2020 | 17 × 23 | 5,474 |
| MS 15 | 2021 | 10 × 15 | 300 |
| MS 16 | 2022 | 9 × 18 | 324 |
| MS "Sample Rounds" (`doe-ms-finals`) | undated, 2000s-era categories: Round Robin 2 and 5, Double Elimination 1 and 3 | 4 × 25 | 200 |

- Sources for the "new set" flag and PDF date: [HS sample page](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/HS-Sample-Questions); PDF metadata of [2022-HS-1.pdf](https://science.osti.gov/-/media/wdts/nsb/pdf/HS-Sample-Questions/Sample-Set-17/2022-HS-1.pdf)
- Year evidence comes from DOE's page text ("Sample Questions Set 1 (from 2009)") for older sets and from file names for Sets 12–17 (HS) and 14–16 (MS) — [manifest.json](/home/user/rebound/scripts/doe/manifest.json); [manifest-ms.json](/home/user/rebound/scripts/doe/manifest-ms.json)
- Counts by category, toss-ups = bonuses unless noted — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt)):
  - HS: biology 2,180 (18.1%), chemistry 2,076 (17.3%), earth_space 2,192 (18.2%), energy 1,338 (11.1%), math 1,986 (16.5%), physics 2,050 (17.0%), general_science 202 (1.7%).
  - MS: biology 2,272 (19.4%), chemistry 836 (7.1%; 416 toss-ups / 420 bonuses), earth_space 2,258 (19.3%), energy 1,216 (10.4%), math 2,278 (19.5%), physics 1,238 (10.6%; 605 / 633), general_science 1,384 (11.8%), physical_science left unsplit 214 (1.8%).

**Table A. Overall** — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt)). Stem words are median/p90.

Format and length:

| Group | n | MC | MC toss-ups | MC bonuses | Toss-up stem words | Bonus stem words | Toss-up words incl. choices | Bonus words incl. choices |
|---|---|---|---|---|---|---|---|---|
| HS all sets | 12,024 | 40.9% | 48.7% | 33.1% | 18/35 | 22/44 | 23/48 | 27/53 |
| HS 2019–22 | 2,464 | 27.5% | 33.6% | 21.3% | 20/37 | 25/44 | 22/45 | 28/50 |
| MS all sets | 11,696 | 41.2% | 48.4% | 34.0% | 15/29 | 19/37 | 20/40 | 23/47 |
| MS 2019–22 | 2,188 | 25.5% | 29.1% | 21.9% | 18/33 | 22/40 | 20/38 | 24/44 |

Question types and answer lines:

| Group | Numeric (toss-ups / bonuses) | Identify all | Rank | Numbered list | Uppercase NOT | ACCEPT | DO NOT ACCEPT |
|---|---|---|---|---|---|---|---|
| HS all sets | 26.3% (21.7 / 30.9) | 5.8% | 2.2% | 8.5% | 4.9% | 14.0% | 1.7% |
| HS 2019–22 | 28.1% (23.8 / 32.5) | 11.4% | 3.8% | 15.2% | 1.5% | 17.5% | 2.4% |
| MS all sets | 23.9% (20.6 / 27.3) | 3.4% | 2.1% | 5.2% | 5.1% | 11.2% | 1.3% |
| MS 2019–22 | 27.3% (23.6 / 31.1) | 7.5% | 2.7% | 10.1% | 1.1% | 14.8% | 2.2% |

- MC questions never carry ACCEPT lines. Among short answers only, ACCEPT appears in 23.7% (HS all), 24.1% (HS 2019–22), 19.0% (MS all) and 19.8% (MS 2019–22). DO NOT ACCEPT appears in 2.8%, 3.4%, 2.2% and 2.9% — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt))

**Table B. By era** — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt))

| Group | n | MC | Toss-up / bonus stem median | Numeric | Identify all | Numbered list | Uppercase NOT | ACCEPT | DO NOT ACCEPT |
|---|---|---|---|---|---|---|---|---|---|
| HS 2007–13 | 5,650 | 48.4% | 17 / 21 | 26.4% | 1.4% | 3.7% | 7.3% | 12.8% | 1.3% |
| HS 2014–20 | 5,474 | 34.0% | 19 / 23 | 26.0% | 9.8% | 12.7% | 2.9% | 14.8% | 1.9% |
| HS 2021–22 | 900 | 35.7% | 20 / 24 | 27.7% | 9.9% | 13.3% | 1.8% | 16.4% | 2.3% |
| MS 2007–13 | 5,398 | 48.2% | 15 / 18 | 23.2% | 1.1% | 2.6% | 8.1% | 9.4% | 0.9% |
| MS 2014–20 | 5,474 | 35.2% | 15 / 19 | 24.5% | 5.3% | 7.4% | 2.7% | 12.3% | 1.6% |
| MS 2021–22 | 624 | 32.2% | 18 / 22 | 24.8% | 7.5% | 10.9% | 1.3% | 16.5% | 2.2% |
| MS undated sample rounds | 200 | 45.5% | 16 / 18 | 27.5% | 0.0% | 0.0% | 1.0% | 12.5% | 0.0% |

- MC share by recent set: HS 2018 23.9%, 2019 22.7% and 23.4%, 2020 22.5%, 2021 29.7%, 2022 39.6%. MS 2018 24.9%, 2019 21.6%, 2020 24.0%, 2021 24.7%, 2022 39.2% — local data ([checks.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/checks.txt))

**Table C. By category, all sets** — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt))

| Level / category | n | MC | Toss-up stem median/p90 | Bonus stem median/p90 | Numeric | Identify all | Rank | ACCEPT | DO NOT ACCEPT |
|---|---|---|---|---|---|---|---|---|---|
| HS Biology | 2,180 | 46.2% | 15/28 | 19/38 | 3.8% | 8.0% | 1.9% | 18.0% | 2.1% |
| HS Chemistry | 2,076 | 42.8% | 16.5/34 | 21/43 | 18.8% | 9.7% | 5.7% | 14.0% | 1.4% |
| HS Earth & Space | 2,192 | 54.0% | 16/27 | 18/35 | 8.5% | 5.4% | 2.8% | 10.2% | 1.1% |
| HS Energy | 1,338 | 47.7% | 23/38 | 27/44 | 13.6% | 4.8% | 1.9% | 17.5% | 2.4% |
| HS Math | 1,986 | 17.9% | 18/33 | 22/39 | 69.4% | 0.9% | 0.1% | 12.8% | 1.5% |
| HS Physics | 2,050 | 35.2% | 24/44 | 34/56 | 44.0% | 6.1% | 0.8% | 12.6% | 1.7% |
| HS General Science (legacy) | 202 | 59.9% | 15/29 | 15/29 | 19.8% | 0.5% | 1.0% | 13.9% | 2.0% |
| MS Biology | 2,272 | 45.1% | 14/25 | 17/31 | 3.4% | 3.8% | 1.4% | 14.2% | 1.8% |
| MS Chemistry | 836 | 43.4% | 14/25 | 16/30 | 14.2% | 6.5% | 3.1% | 10.9% | 0.6% |
| MS Earth & Space | 2,258 | 51.3% | 14/26 | 17/31 | 6.3% | 5.2% | 3.3% | 9.3% | 1.5% |
| MS Energy | 1,216 | 49.1% | 20/36 | 23/41 | 11.2% | 2.8% | 2.5% | 16.7% | 1.1% |
| MS Math | 2,278 | 15.5% | 16/30 | 21/39 | 76.0% | 1.1% | 0.5% | 9.2% | 0.6% |
| MS Physics | 1,238 | 38.5% | 17/32 | 23/44 | 28.8% | 4.0% | 1.9% | 9.7% | 1.8% |
| MS General Science (legacy) | 1,384 | 54.6% | 15/28 | 16/34 | 13.1% | 1.7% | 2.7% | 10.1% | 1.5% |
| MS Physical Science (unsplit legacy) | 214 | 43.0% | 15/27 | 19.5/42 | 26.2% | 3.3% | 2.3% | 7.0% | 0.5% |

**Table D. By category, 2019–2022 sets (closest to current style)** — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt))

| Level / category | n | MC (toss-ups / bonuses) | Toss-up stem median/p90 | Bonus stem median/p90 | Numeric (toss-ups / bonuses) | Identify all | Rank | ACCEPT | DO NOT ACCEPT |
|---|---|---|---|---|---|---|---|---|---|
| HS Biology | 422 | 26.8% (25.1 / 28.4) | 16/24 | 21/37 | 3.3% (0.9 / 5.7) | 16.1% | 3.1% | 24.6% | 2.8% |
| HS Chemistry | 422 | 30.8% (39.8 / 21.8) | 16/30 | 20/40 | 16.1% (13.3 / 19.0) | 16.4% | 11.1% | 14.7% | 1.7% |
| HS Earth & Space | 422 | 37.7% (42.7 / 32.7) | 15/27 | 21/38 | 8.1% (6.6 / 9.5) | 13.7% | 5.7% | 12.1% | 1.9% |
| HS Energy | 354 | 37.3% (41.2 / 33.3) | 30/42 | 33/46 | 6.5% (4.5 / 8.5) | 7.9% | 0.8% | 23.7% | 4.2% |
| HS Math | 422 | 9.2% (16.1 / 2.4) | 19/35 | 25/39 | 84.6% (85.3 / 83.9) | 0.7% | 0.0% | 15.6% | 1.2% |
| HS Physics | 422 | 24.6% (37.9 / 11.4) | 25/44 | 37/56 | 46.7% (28.9 / 64.5) | 13.3% | 1.4% | 14.9% | 3.1% |
| MS Biology | 454 | 28.6% (28.2 / 29.1) | 16/25 | 18/31 | 1.8% (0.0 / 3.5) | 9.0% | 2.4% | 20.3% | 3.3% |
| MS Chemistry | 198 | 26.8% (30.6 / 23.0) | 15/27 | 19/36 | 15.7% (7.1 / 24.0) | 14.1% | 6.6% | 8.1% | 0.5% |
| MS Earth & Space | 454 | 37.0% (41.9 / 32.2) | 15/26 | 20/36 | 6.4% (6.2 / 6.6) | 12.3% | 5.3% | 10.4% | 2.9% |
| MS Energy | 318 | 32.4% (35.2 / 29.6) | 29/41 | 31/44 | 7.9% (8.8 / 6.9) | 5.0% | 0.3% | 26.1% | 1.3% |
| MS Math | 454 | 4.4% (7.9 / 0.9) | 17/28 | 23/38 | 84.1% (80.6 / 87.7) | 1.3% | 0.0% | 11.5% | 1.1% |
| MS Physics | 274 | 26.6% (35.8 / 17.9) | 20/36 | 27/44 | 39.4% (24.6 / 53.6) | 5.5% | 3.6% | 10.9% | 3.6% |

- The 2019–22 MS Chemistry, Physics and unsplit Physical Science rows (198 + 274 + 36) come from the 2019–2021 "Physical Science" category plus the 2022 Chemistry and Physics categories (54 + 54) — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt))
- The MS printed-category view (all MS sets) — local data ([out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt)):

| Printed category | n | MC | Numeric |
|---|---|---|---|
| Math | 2,278 | 15.5% | 76.0% |
| Life Science | 2,215 | 45.4% | 3.5% |
| Physical Science | 2,180 | 40.4% | 23.2% |
| Earth and Space | 1,782 | 47.5% | 6.1% |
| General Science | 1,383 | 54.6% | 13.1% |
| Energy | 1,216 | 49.1% | 11.2% |
| Earth Science | 476 | 65.5% | 6.9% |
| 2022 categories (Biology / Chemistry / Physics) | 57 / 54 / 54 | — | — |

**Short verbatim examples (2019–2022 sets, unflagged in Rebound's import; text as stored in the library)** — local data ([rows.json source: public/data/doe](/home/user/rebound/public/data/doe/index.json); ids resolve to the official PDFs listed in [manifest.json](/home/user/rebound/scripts/doe/manifest.json) and [manifest-ms.json](/home/user/rebound/scripts/doe/manifest-ms.json))

*HS Biology*
- doe-hs-17-r08-t13 (2022, toss-up, Short Answer): "Parathyroid hormone is responsible primarily for the regulation of serum levels of what ion?" ANSWER: CALCIUM TWO PLUS (ACCEPT: CA²⁺)
- doe-hs-15-r11-t13 (2020, toss-up, MC): "G-protein-coupled receptors and receptor tyrosine [TIE-row-seen] kinases are typically found on which of the following structures? W) Endoplasmic reticulum [reh-TIK-yoo-lum] X) Nuclear envelope Y) Cell wall Z) Plasma membrane" ANSWER: Z) PLASMA MEMBRANE
- doe-hs-17-r12-b12 (2022, bonus, SA): "Identify all of the following three statements that are true of mycorrhizae: 1) The hyphae can penetrate the plasma membranes of the host cells; 2) They can improve nutrient uptake for the plant; 3) They are primarily mutualistic." ANSWER: 2, 3
- doe-hs-15-r06-t23 (2020, toss-up, SA): "During what phase of meiosis [my-OH-sis] do sister chromatids separate?" ANSWER: ANAPHASE II (DO NOT ACCEPT: ANAPHASE, ANAPHASE I)

*HS Chemistry*
- doe-hs-17-r01-t02 (2022, toss-up, SA): "What is the conjugate base of nitric acid?" ANSWER: NITRATE (ACCEPT: NO₃⁻)
- doe-hs-17-r12-t07 (2022, toss-up, MC): "Which of the following ions has the largest polarizability? W) Iodide X) Chloride Y) Bromide Z) Fluoride" ANSWER: W) IODIDE
- doe-hs-17-r01-b02 (2022, bonus, SA): "Rank the following three elements in order of increasing electronegativity: 1) Silicon; 2) Nitrogen; 3) Phosphorus." ANSWER: 1, 3, 2
- doe-hs-15-r10-t11 (2020, toss-up, SA): "What is the term used to describe the movement of a gas as it escapes through a small opening?" ANSWER: EFFUSION (DO NOT ACCEPT: DIFFUSION)

*HS Earth and Space*
- doe-hs-15-r16-t10 (2020, toss-up, SA): "A type One-A supernova is caused by the destruction of what stellar remnant?" ANSWER: WHITE DWARF
- doe-hs-16-r03-t16 (2021, toss-up, MC): "Which of the following properties of a telescope determines its resolving power? W) Objective focal length X) Eyepiece focal length Y) Lens index of refraction Z) Aperture [AP-ur-chur]" ANSWER: Z) APERTURE
- doe-hs-13-r05-b15 (2019, bonus, SA): "A slab of oceanic lithosphere is subducting at a rate of 8 centimeters per year. How far, in meters, will the slab subduct in 5 centuries if current rates are maintained?" ANSWER: 40
- doe-hs-16-r08-t12 (2021, toss-up, SA): "Spring tides occur at what two lunar phases?" ANSWER: NEW, FULL (ACCEPT: NEW MOON, FULL MOON, in any order)

*HS Energy*
- doe-hs-17-r01-t04 (2022, toss-up, MC): "Scientists at Lawrence Berkeley National Lab are studying how plant leaves emit a single-carbon alcohol. What is the name of this alcohol? W) Ethanol X) Propanol Y) Methanol Z) Butanol" ANSWER: Y) METHANOL
- doe-hs-17-r06-b17 (2022, bonus, SA): "Scientists at Thomas Jefferson National Accelerator Facility are studying particles that contain heavy quarks. Rank the following three quark flavors in order of increasing mass: 1) Up; 2) Bottom; 3) Strange." ANSWER: 1, 3, 2
- doe-hs-15-r02-t12 (2020, toss-up, SA): "Researchers at the National Energy Technology Laboratory are developing membranes that can capture carbon dioxide from the air before it is emitted from power plants. What is the term for the process by which gas molecules adhere to the surface of a solid?" ANSWER: ADSORPTION (DO NOT ACCEPT: ABSORPTION)

*HS Math*
- doe-hs-17-r15-t05 (2022, toss-up, SA): "How many diagonals does a 15-sided convex polygon have?" ANSWER: 90
- doe-hs-17-r12-t04 (2022, toss-up, MC): "In data that are normally distributed, an observation that is one standard deviation above the mean is closest to which of the following percentiles? W) 34 X) 68 Y) 84 Z) 95" ANSWER: Y) 84
- doe-hs-17-r05-b13 (2022, bonus, SA): "A rhombus has diagonals of lengths 14 and 18. To the nearest integer, what is its perimeter?" ANSWER: 46
- doe-hs-17-r05-t01 (2022, toss-up, SA): "What is the partial derivative with respect to y of x³y⁴?" ANSWER: 4x³y³ (DO NOT ACCEPT: x³4y³)

*HS Physics*
- doe-hs-14-r05-t20 (2019, toss-up, MC): "If one takes the line integral of an electric field over a particular path, the answer can be expressed in which of the following units? W) Coulombs X) Volts Y) Amperes Z) Newtons" ANSWER: X) VOLTS
- doe-hs-13-r03-b05 (2019, bonus, SA): "A disk is spinning at 950 rotations per minute. To the nearest ten radians per second, how fast is it spinning?" ANSWER: 100
- doe-hs-16-r06-b11 (2021, bonus, SA): "Identify all of the following three properties of an electromagnetic wave that can change when the wave passes from one medium to another: 1) Period; 2) Wavelength; 3) Speed." ANSWER: 2, 3
- doe-hs-17-r03-b10 (2022, bonus, SA): "What law states that a planetary orbit sweeps out area around its star at a constant rate?" ANSWER: KEPLER'S SECOND LAW (ACCEPT: KEPLER'S SECOND; do not accept: KEPLER'S)

*MS Biology (printed "Life Science" before 2022)*
- doe-ms-14-r03-t04 (2020, toss-up, SA): "What is the largest artery in the human body?" ANSWER: AORTA
- doe-ms-14-r02-t08 (2020, toss-up, MC): "Which of the following eukaryotic organelles contains digestive enzymes at maturity? W) Lysosome [LYE-soh-sohm] X) Chloroplast Y) Golgi apparatus Z) Nucleus" ANSWER: W) LYSOSOME
- doe-ms-13-r09-b21 (2019, bonus, SA): "Identify all of the following three structures that are part of the digestive tract: 1) Pharynx [fair-inx]; 2) Larynx; 3) Esophagus." ANSWER: 1, 3
- doe-ms-16-r01-b01 (2022, printed "Biology", bonus, SA): "What enzyme is responsible for transcribing DNA to RNA in bacteria?" ANSWER: RNA POLYMERASE (ACCEPT: RNAP; do not accept: RNA polymerase II)

*MS Chemistry (printed "Physical Science" before 2022)*
- doe-ms-16-r09-t07 (2022, toss-up, MC): "The organic molecule found in vinegar is an example of what class of organic molecule? W) Amine X) Hydrocarbon Y) Carboxylic acid Z) Alcohol" ANSWER: Y) CARBOXYLIC ACID
- doe-ms-16-r04-b15 (2022, bonus, SA): "Rank the following three elements in order of increasing atomic radius: 1) Magnesium; 2) Silicon; 3) Chlorine." ANSWER: 3, 2, 1
- doe-ms-14-r16-t23 (2020, toss-up, SA): "How many valence electrons does the sodium plus ion possess?" ANSWER: EIGHT (DO NOT ACCEPT: ZERO)
- doe-ms-13-r16-b16 (2019, bonus, SA): "What is the pH of a 1-millimolar solution of sodium hydroxide?" ANSWER: 11

*MS Earth and Space*
- doe-ms-14-r08-t03 (2020, toss-up, SA): "What major rock type is produced when magma cools and solidifies?" ANSWER: IGNEOUS (ACCEPT: INTRUSIVE IGNEOUS, PLUTONIC)
- doe-ms-14-r06-t06 (2020, toss-up, MC): "Which of these minerals would most likely be used in making industrial abrasives such as sandpaper due to its hardness? W) Barite X) Calcite Y) Halite [HAY-lite] Z) Garnet" ANSWER: Z) GARNET
- doe-ms-13-r01-b19 (2019, bonus, SA): "Rank the following three minerals in order of increasing Mohs hardness: 1) Fluorite; 2) Apatite; 3) Quartz." ANSWER: 1, 2, 3
- doe-ms-14-r10-t03 (2020, toss-up, SA): "Most long-period comets are thought to originate in what part of the solar system?" ANSWER: OORT CLOUD (DO NOT ACCEPT: KUIPER [KYE-pur] BELT)

*MS Energy*
- doe-ms-15-r07-t05 (2021, toss-up, MC): "Scientists at Lawrence Berkeley National Lab are studying enzymes responsible for fat metabolism. In what animal organelle are these enzymes most active? W) Cytosol X) Mitochondrion Y) Nucleus Z) Smooth ER" ANSWER: X) MITOCHONDRION
- doe-ms-16-r06-b07 (2022, bonus, SA): "Scientists supported by the Department of Energy are studying biopolymers. Identify all of the following three molecules that are examples of biopolymers: 1) Silk; 2) DNA; 3) Polyethylene." ANSWER: 1, 2
- doe-ms-15-r06-t01 (2021, toss-up, SA): "Scientists at Fermi National Accelerator Lab are studying what substance that is thought to be the reason that the expansion of the universe is accelerating?" ANSWER: DARK ENERGY (do not accept: DARK MATTER)
- doe-ms-14-r03-b10 (2020, bonus, SA): "Scientists at Ames Lab are studying the properties of superconductors at temperatures of around 50 milli-kelvins. To the nearest degree, what temperature in Celsius does this equal?" ANSWER: –273

*MS Math*
- doe-ms-15-r03-t03 (2021, toss-up, SA): "What fraction is halfway between 1/8 and 1/12?" ANSWER: 5/48
- doe-ms-14-r12-t11 (2020, toss-up, MC): "A rectangle has side lengths that are integers greater than one. Which of the following could be its area? W) 83 X) 89 Y) 91 Z) 97" ANSWER: Y) 91
- doe-ms-16-r08-b05 (2022, bonus, SA): "Solve the following equation for x: x – 5 equals the square root of open parenthesis, 4x + 1, close parenthesis." ANSWER: 12 (do not accept: 2)
- doe-ms-14-r04-b09 (2020, bonus, SA): "Rounding your answer to the nearest 10,000, what is 447 times 356?" ANSWER: 160,000

*MS Physics (printed "Physical Science" before 2022)*
- doe-ms-13-r08-t12 (2019, toss-up, SA): "What is the SI derived unit for charge?" ANSWER: COULOMB
- doe-ms-14-r06-t07 (2020, toss-up, MC): "Which of the following quantities is kept constant by a gas undergoing an isobaric [eye-soh-BARE-ik] process? W) Temperature X) Volume Y) Internal energy Z) Pressure" ANSWER: Z) PRESSURE
- doe-ms-14-r07-t06 (2020, toss-up, SA): "A ray of light hits a mirror at an incidence angle of 30 degrees relative to the normal. In degrees, what is the angle of reflection relative to the normal?" ANSWER: 30
- doe-ms-16-r06-b03 (2022, printed "Physics", bonus, SA): "Rank the following three regions of the electromagnetic spectrum in order of increasing energy: 1) Infrared; 2) Gamma; 3) Ultraviolet." ANSWER: 1, 3, 2

### Inferences
- The "current" target profile depends on which window you trust. The 2018–2021 sets ran about 22–30% MC, but both 2022 sets returned to about 40% MC. A generator should take MC share per category from the most recent sets, about 25–40% overall, rather than the 41% all-years figure. Math should be about 4–9% MC overall (8–16% of toss-ups) and Earth and Space about 37–38% overall (42–43% of toss-ups).
- Bonuses should carry most of the identify-all, rank and computation load: in HS about 20% identify-all, 7% rank and 33% numeric. Toss-ups should be mostly single-fact recall or one-step computation.
- Generated items should land near the measured lengths: toss-ups around 15–20 words (p90 under 40), bonuses around 20–25 (p90 under 45). HS Physics toss-ups (median 25 words) and Energy toss-ups at both levels (29–30) run longer.
- Every set is at least four years old: the newest are the 2022 seasons, published as late as Feb 2026. So generated questions that read like the 2022 sets will match what students know as official style, but may not match unreleased 2023–2027 packets.

### Gaps
- The regex classifiers have error. The numeric audit is above. "Identify all" and "rank" will miss rephrasings such as "Which two of the following…". Rebound's subject mapping and topic tags are rule-based, and the MS Physical Science split carries import-time misassignment risk.
- Some older sets (2007–2014) carry import flags ("possible-lost-formatting", "text-corrected"; e.g., 44 text corrections in HS Set 4), so their exact wording may differ slightly from the PDFs. The 2019–2022 sets used for examples have no flags — [REPORT.md](/home/user/rebound/scripts/doe/REPORT.md); [out.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/out.txt)
- DOE gives no seasons for the undated MS "Sample Rounds", or which events they come from, beyond their round labels.

## 5. Are there published third-party guides that codify NSB style?

### Takeaway
I found no public, NSB-specific writer's style guide from any invitational. MIT and Stanford describe their writing processes but publish no style rules. The closest codified sources are DOE's own five "rules of thumb" on its Tips page and the rules appendix. Two adjacent sources also help: a 2010 student guide from Mira Loma High School with concrete NSB-style advice, and the National Ocean Sciences Bowl's published buzzer-question guidelines, for a sister competition with the same W/X/Y/Z conventions.

### Cited Findings
- DOE's Tips page publishes "a few rules of thumb that our writers follow" (quoted in section 3) and recommends students write questions by "mimicking the style and construction of Official National Science Bowl® questions" — [NSB Tips and Resources](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/Tips-and-Resources)
- MIT Science Bowl: "All questions for the MIT Science Bowl High School Invitational are written by volunteer question writers, most of whom are Science Bowl alumni. The writing cycle for each year's invitational starts around May." No guidelines are published on the page — [MIT Science Bowl College+](https://www.mitsciencebowl.com/college). The home page says MIT "modified the Energy section found in official tournament question sets to focus on current research conducted at MIT" — [MIT Science Bowl](https://www.mitsciencebowl.com/)
- Stanford Science Bowl:
  - "Each match consists of 23 pairs of questions read by a moderator."
  - "For regional questions, higher-numbered rounds and sets are harder, although higher-numbered sets are more recent and of higher quality. Invitational questions are often harder than regional questions."
  - SSB difficulty "will range from early regionals to mid-nationals difficulty".
  - It publishes no writer style rules.
  - Source: [Stanford Science Bowl resources](https://scibowl.stanford.edu/resources)
- Mira Loma High School, "How to Improve Science Bowl" (Rishi Kulkarni, 11/19/2010; student-written, old) — [Mira Loma guide (2010)](https://resources.finalsite.net/images/v1623697741/bvsdorg/hkit1fwjpg6b5zylw0my/55383.pdf):
  - On MC: "the choices should all be formatted identically. This enables more knowledgeable players to buzz in earlier." Choices should be worded so a player who hears the first choice can say "Balmer" without worrying it should be "Balmer series".
  - "Pseudo-multiple choice" short answers (pick the numbered items that satisfy a property) had "become increasingly popular in the later stages of the Regional and National tournaments".
  - "the answer must be short".
  - Writers aim for introductory-college difficulty.
  - On pyramid-style toss-ups: "The National competition has few tossups of this type."
- National Ocean Sciences Bowl, "Guidelines to Writing Buzzer Questions" (2024), for a different competition — [NOSB Buzzer Question Guidelines 2024](https://nosb.org/wp-content/uploads/2024/05/Buzzer-Question-Guidelines-2024.pdf):
  - "Toss-up questions are ALWAYS multiple choice. Bonus questions should be short answer." This differs from NSB, which mixes both formats in both slots.
  - "'All of the above' and 'None of the above' are NOT ACCEPTABLE."
  - "Fill in the blank and True/False questions are NOT ACCEPTABLE."
  - "Questions MUST include the phonetic pronunciation for longer scientific names and terminology."
  - "Questions based on Wikipedia content or that do not contain references will NOT be accepted"; reference material should be current, within the last five years.
  - Its Technical Advisory Panels review all questions.
- Quiz-bowl writing guides (ACF, NAQT and university primers) surfaced in searches. According to the search-result summary (I didn't fetch them), they describe clue-ordered toss-ups ("most obscure to least obscure") and different point values. The NSB samples don't use that structure: 2019–22 HS toss-ups are 67% single-sentence — [Stanford-derived timed-games guide on ACF](https://acf-quizbowl.com/archive/maqt/stanfordguide.html) (search result only); local data ([extra.txt](/tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/nsb_format_and_style/extra.txt))

### Inferences
- With no published invitational guide, Rebound's style spec has to be built as this note does: the rules appendix, DOE's rules of thumb, and the statistics of the official packets. The NOSB list is a good model for the pass/fail lint rules: no AOTA/NOTA, no fill-in-the-blank or True/False, pronunciation guides on long terms, and a cited reference for every question.
- Invitational writers (MIT, Stanford) deliberately rewrite the Energy category around their own institution's research. Rebound could use the same pattern for renewable Energy sets, built from recent DOE lab press releases.

### Gaps
- Several sources couldn't be fetched:
  - DOE's "Helpful Hints" and the NSB Coordinator Manual on sc-drcds.osti.gov: the host is unreachable from this session's network. They may contain more format detail, such as packet sizes.
  - The "NSB-P Starter Pack" (sciencebowl.pk): HTTP 402.
  - QBWiki's Science Bowl page: HTTP 403.
- A search snippet said MIT's organizers developed "question-writing guidelines for each science bowl category". The fetched MIT pages don't say this, and I found no published copy.
- Writer guides from other well-known invitationals, if any exist privately, didn't turn up in searches.
