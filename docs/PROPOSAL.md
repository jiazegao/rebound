# Rebound: a team-first study website for the National Science Bowl

*Proposal v2, November 7, 2026. Revised so Rebound is delivered as a website: one address, nothing to install. "Rebound" is a working name: in Science Bowl a rebound is the other team's chance after a miss, and here every miss becomes your next chance to learn. The evidence behind each design choice is in the verified landscape report written alongside this proposal (November 2026; not included in this repository).*

## Summary

Science Bowl does not need another question reader. About twenty free ones are live, SB Reader already serves 104,246 questions without a sign-up, and ISOBowl hosts online games and invitationals and, since July 2026, basic team groups. What no tool does is connect a team's practice to what each player should learn next.

**Rebound is a private website for a team.** Members open one address on a Chromebook, laptop or phone, join with a team code, and land on a page that tells them what to practice today. Every feature in this proposal is a page on that site, built around one loop:

```
  Play under exact NSB rules ──►  Log every buzz (who, when, right or wrong)
            ▲                                     │
            │                                     ▼
  Mixed, timed rounds               Diagnose: which concept was missed?
            ▲                                     │
            │                                     ▼
  Spaced, timed review    ◄──   Learn: concept card + quick retrieval checks
```

How it meets the goals:

| Goal | Rebound's answer |
|---|---|
| A website that's easy to use | One address, nothing to install; works on school Chromebooks and phones; a team is set up in three steps; a new member answers a first question within a minute (Section 1) |
| Subject-specific practice | A three-level NSB subject map (subject → topic → concept) with every question tagged, and ten practice modes tuned to how each subject is asked (Section 3) |
| Personalized learning of subject material | A per-player model of mastery, speed and memory for every concept; sourced concept cards written by the team; a daily plan shaped by each player's subjects and the tournament calendar (Section 4) |
| Built specifically for NSB | A versioned 2027 rules engine, an answer checker that follows NSB answer conventions, a Reader console for in-person practice, and presets for regionals, virtual events and the Finals (Section 5) |
| Other essentials | Captain tools (who covers what, lineups, assignments, scrimmage builder), trustworthy question data, privacy by default, cheap to run, and built to be handed to the next captain (Sections 6–9) |

## 1. The website

Rebound is one website. There is nothing to download: members open an address in the browser they already use, and the site works the same on a school Chromebook, a laptop or a phone. Everything below, from daily practice to the captain's tools, is a page on that site.

### 1.1 What "easy to use" means

Every page is held to these targets:

| Requirement | Target |
|---|---|
| Install | Nothing to install. The site can be added to a phone's home screen like an app, but nobody has to |
| First question | A new member answers a first question within one minute of opening the team link |
| Team setup | Three steps for a captain: name the team, choose high school or middle school, share the join link |
| Questions on day one | All DOE sample sets preloaded and credited, so practice can start immediately |
| No command line | Players, captains and coaches never need one; packets are added by uploading a PDF or JSON file |
| Devices and browsers | Chromebooks, Windows and Mac laptops, iPhones and Android phones, on current Chrome, Safari, Edge and Firefox |
| Speed | Pages load in under 3 seconds on a school Chromebook over school Wi-Fi |
| Navigation | Five main sections, any page within two clicks, and Today is always the home page |
| Keyboard play | Space to buzz, W/X/Y/Z for multiple choice, Enter to submit |
| School networks | One domain over standard HTTPS, a fallback when live connections are blocked, and a page telling school IT staff what to allow |
| Weak Wi-Fi | Drills and reviews keep working offline and sync later; the Reader console can download its packet as a PDF |
| Accessibility | Screen-reader labels, adjustable text size and reading speed, high-contrast and dark themes |
| Help | A two-minute tour on first visit and a help link on every page |

### 1.2 Site map

**Public pages** (no sign-in):

| Page | What it's for |
|---|---|
| Home | What Rebound is, who it's for, and how to start a team |
| Try a round | One DOE round playable in the browser without signing in, so new members and other captains can see how it works. It is a demo, not a public question bank |
| NSB rules at a glance | A plain-language summary of the 2027 rules, generated from the same presets the game engine uses so the two can never disagree |
| For coaches | A setup guide, what data is kept and who can see it |
| For school IT staff | The domain to allow, and why live practice rooms need a live connection |
| Privacy, terms and credits | Data practices; credit to DOE and every packet source; a clear statement that Rebound is not affiliated with DOE |

**Team pages** (after joining), in five main sections:

| Section | Pages | What happens there |
|---|---|---|
| Today (home) | Today's plan · My progress | The daily plan (4.4) and personal stats |
| Practice | Drills · Review · Mental math · Visual lab · Library | Subject- and topic-specific practice (3.2), timed review (4.3), and the searchable question library with sources and error reports (7) |
| Learn | Subject map · Concept cards · Reading paths | The mastery heat map and the learning content (4.1–4.2) |
| Play | Rooms · Reader console | Team rooms joined by code (5.4) and the console a reader uses at in-person practice (5.3) |
| Team | Roster · Who covers what · Lineups · Assignments · Scrimmages · Team stats · Calendar · Write | Captain and coach tools (6) and the question-writing studio (8) |

Members see their own stats, their assignments and the writing studio; tools for editing the roster, lineups and assignments appear only for captains, coaches and subject owners. Labels use plain words: "Review," not "FSRS"; "Who covers what," not "ownership matrix."

### 1.3 Four everyday journeys

- **A new member joins.** They tap the join link the captain posted in the team Discord, choose a display name and PIN (or use a school Google account where the school allows it), pick a primary and a secondary subject, and play a five-question warm-up that gives the learner model a starting point. Then they land on Today.
- **Daily practice, 15–30 minutes on a phone or Chromebook.** Open Today, clear the due reviews, take one short lesson, do the targeted drill and finish with a mixed timed round. Each item says why it's there.
- **Tuesday practice in the classroom.** The captain builds a scrimmage of questions nobody in the room has heard (Team → Scrimmages). The reader opens it in Play → Reader console on a laptop, projected if wanted. Players buzz on hardware buzzers or on their own devices through the room link, and every toss-up is logged as it's scored.
- **The week before a regional.** The captain checks Team → Lineups and Who covers what, assigns the gap topics, and marks the regional on the Calendar. Every player's Today plan shifts toward timed mixed rounds automatically.

### 1.4 Accounts that suit students

- Members join with the team code. The default sign-in is a display name plus a PIN that a coach can reset, with no email needed, which is the right default for middle schoolers. School Google sign-in is an option where the school lets students use it on outside sites.
- Coaches and captains manage the roster. There are no public profiles, and members can download or delete their own data.

## 2. What existing tools get right and wrong

| Need | Best existing option (Nov 2026) | What's missing | Rebound's answer |
|---|---|---|---|
| Questions | DOE samples (~23,700), SB Reader (104,246), ISOBowl (16,941 released) | Scattered; duplicates; wrong keys (6–7% in student-written sets); nothing tracks what you have already heard | One library with provenance, de-duplication, error flags and a per-player "seen" ledger |
| Rules-accurate games | Atom Bowl (5 s and 20 s clocks), ISOBowl (server-timed rooms) | The 2025–27 rule changes (0-point blurts, legal silent signals, 18-toss-up virtual games) are not reliably encoded; SB Reader allows only 4 s to buzz | A versioned rules engine with official presets |
| Answer checking | SB Reader's matcher (numbers, fractions, units, "identify all") | Most sites are brittle or self-graded; QB Reader rejects "1/2" for 0.5 and "W" for a letter answer | A layered NSB checker with overrides and a protest-to-errata log |
| Subject practice | Subject filters on every site | No topic- or concept-level practice; little no-calculator math; almost no visual bonuses | Concept-tagged drills, math problem generators, a visual-bonus lab |
| Learning material | Science Bowl Prep (252 lessons), Atom Bowl (90 lessons) | Lessons are not linked to your misses or your mastery | Concept cards attached to the questions that test them |
| Spaced review | ScienceBowler (undisclosed algorithm, sign-in required) | Not timed, not linked to concepts | FSRS review of misses and slow answers, always timed |
| Personal plan | scibowl.app's advertised seven-day plan | Not aware of a player's subjects or the tournament date | A daily plan shaped by role, concept frequency and calendar |
| Team management | ISOBowl v4.0 team groups (beta): roster, per-subject conversion, scheduled practices | No map of who covers what, lineup tools, assignments with completion, or logging of in-person practice | Team pages and a Reader console |
| Writing questions | NSB Toolbox (formats and lints .docx files) | No review pipeline | A writing studio with peer review and export |
| Staying alive | (none) | Single maintainers, link rot, sign-in walls, bot-flooded public rooms, no terms | Open source, exportable, private by default, documented handoff |

Eight design principles follow:

1. **A website, nothing to install.** One address that works on school Chromebooks and phones.
2. **Team-first and private by default.** No public lobbies; everything belongs to a team space.
3. **NSB-exact.** Rules and answer conventions are code, versioned each season and tested against the rulebook.
4. **Every practice produces data**, including in-person practice, where most practice happens.
5. **Concepts, not just questions.** The unit of learning is a concept; questions are evidence about it.
6. **Trust over volume.** Provenance, errata, and difficulty measured from real results.
7. **Integrate, don't duplicate.** ISOBowl for tournaments and cross-team scrimmages, BuzzIn.Live for remote buzzers, Discord for chat, NSB Toolbox for packet formatting.
8. **Built to be handed down.** Open code, a documented data format, one-click export and near-zero hosting cost.

## 3. Subject-specific practice

### 3.1 The NSB subject map

Every question is tagged at three levels: **subject → topic → concept**. Subjects are the six 2027 categories (Biology, Chemistry, Earth and Space Science, Energy, Mathematics, Physics), which now apply to middle school too. Older sets' Astronomy, General Science, Life Science and Physical Science are mapped onto them at import. A starter topic list, to be refined by each subject owner:

| Subject | Starter topics |
|---|---|
| Biology | cells and membranes; biochemistry and metabolism; molecular biology and biotechnology; genetics; evolution and classification; ecology; animal physiology; plant biology; microbiology and immunology; development; organism diversity |
| Chemistry | atomic structure; periodic trends; bonding and geometry; stoichiometry and solutions; gases; thermochemistry; kinetics; equilibrium; acids and bases; electrochemistry; organic; nuclear; lab and descriptive chemistry |
| Physics | kinematics and forces; work, energy and momentum; rotation and gravitation; oscillations, waves and sound; optics; thermodynamics; electrostatics and circuits; magnetism and induction; fluids; relativity and quantum; nuclear and particle |
| Earth and Space | minerals and rocks; plate tectonics and structure; Earth's interior; surface processes and hydrology; geologic time and fossils; meteorology and climate; oceanography; solar system; stars; galaxies and cosmology; observational astronomy |
| Energy | conversion and efficiency; fossil fuels; nuclear fission and fusion; solar; wind, hydro, geothermal and biomass; storage, batteries and hydrogen; grid and transmission; energy data and units; DOE labs, facilities and research programs |
| Math | mental arithmetic; algebra; plane and solid geometry; trigonometry; sequences, series and logarithms; vectors, matrices and complex numbers; calculus; probability and combinatorics; statistics; number theory |

Concepts are the specific ideas inside each topic: Hardy–Weinberg equilibrium, Le Chatelier's principle, the Doppler effect, the H–R diagram, the Mohs scale, capacity factor, L'Hôpital's rule. A few hundred per subject is realistic. One student project (science-bowl-coach) already rotates through 709 Science Bowl topics and could be a starting point if its license allows.

**Energy is tagged twice.** At the 2025 Finals, energy toss-ups were labeled "energy (chemistry)," "energy (math)" and "energy (physics)," and a finalist called the category "a catch-all." So every Energy question also carries the discipline it really tests, and Energy practice can be served to the Chemistry or Physics owner as well as the Energy owner. Energy is only 4.6% of the largest question bank, so it is also where team-written questions and concept cards matter most.

**How tagging happens.** When questions are imported, the site suggests concepts by matching question text against concept names and descriptions. The subject owner confirms suggestions in bulk on a review page, and any player can flag a wrong tag.

**A concept frequency map.** Once the library is tagged, Rebound counts how often each concept appears, split by source level (DOE regional, invitational, nationals-level). That gives Science Bowl what QB Reader's frequency lists give quiz bowl: a data-driven answer to "what should I learn first?"

### 3.2 Practice modes

These all live under Practice on the site.

| Mode | What it is | What it trains | Subjects |
|---|---|---|---|
| Subject drill | Toss-ups from one subject or topic under NSB timing | Recall and speed in an owned subject | All |
| Concept ladder | One concept, questions ordered from easiest to hardest by measured difficulty | Depth on a weak spot | All |
| Rapid recognition | Text revealed at reading pace; buzz as early as you can; buzz point recorded | Early recognition ("prediction") and interrupt discipline | Biology, Earth and Space, Chemistry |
| Bonus workshop | Bonuses only, 20 s with the 15 s warning, on-screen scratch pad | Multi-step reasoning and computation | Math, Physics, Chemistry |
| Mental-math sprint | Generated numeric problems, no calculator, answers in exact simplest form | Arithmetic speed under NSB conventions | Math, Physics, Chemistry, Energy |
| Multiple-choice format drill | Multiple-choice questions answered by letter only; format slips scored wrong | Avoiding the kind of slip that cost points in the 2025 final | All |
| Visual lab | Figure-based bonuses with the 30 s Finals window | Finals visual rounds, which have no official samples | All |
| Energy cross-drill | Energy questions served by their underlying discipline | Covering the catch-all category | Energy and related owners |
| Read-aloud | Text-to-speech with science pronunciation at moderator pace | Listening the way questions are actually heard | All |
| Mixed round | A full round under the chosen rules preset, all subjects interleaved | Game readiness | All |

### 3.3 What each subject needs

- **Math.** Many bonus points come from computation, and DOE suggests the captain be the team's mathematician because "many bonus questions involve long computations." Rebound generates computation problems from templates and computes the exact answer with a computer algebra system instead of asking an AI to write them, since studies find language models much less accurate at writing valid numerical-answer questions. Answers are checked in exact simplest form, as the rules require.
- **Physics.** The same generators cover kinematics, circuits and optics. The checker applies NSB conventions: g = 9.8 m/s², angles in radians, units optional but a wrong unit counts as wrong.
- **Chemistry.** The checker treats formulas and names as equivalent (H₂O and water). Generators cover stoichiometry, gas laws, pH and half-life. Ordering questions, such as ranking by electronegativity, are scored as sequences.
- **Biology.** Recognition speed matters most, so the focus is rapid-recognition mode plus drills on confusable pairs (hypertonic and hypotonic, mitosis and meiosis stages), which the checker also guards against.
- **Earth and Space.** Identification-heavy (minerals, rocks, star types, cloud types). Public-domain images from USGS, NOAA and NASA make visual practice cheap to build.
- **Energy.** Concept cards are drawn from the public-domain sources DOE itself points to (EERE, EIA and Basic Energy Sciences pages), plus cross-tagged practice.

## 4. Personalized learning of subject material

### 4.1 Concept cards: the learning content

Each concept has a short card on the Learn pages:

- a summary of 150 words or less;
- key facts, formulas and units;
- "how NSB asks it": two or three example question stems;
- traps and look-alikes;
- sources: a textbook section, agency page or article;
- links to every question tagged with the concept.

Each subject's owner writes and maintains its cards, and a second player reviews them, so writing cards doubles as the owner's off-season study. Sources should be ones the team can legally quote. OpenStax's free college textbooks (Biology 2e, Chemistry 2e, University Physics, Astronomy 2e and others, most under a Creative Commons license, so check each title) sit at the "introductory college-level textbook" difficulty DOE cites for the Finals. US agency pages (DOE, EIA, NASA, USGS, NOAA) are public domain. AI may draft a card only from a cited passage; only a person can publish it, and it keeps an "AI-drafted" label.

For deeper study, each subject also gets a **reading path**: topics in prerequisite order, each mapped to textbook sections, with a short retrieval check after each reading. This supports the off-season model strong programs describe; Mira Loma's coach put it as "the offseason is the time for studying one's subject in depth."

### 4.2 The learner model

For each player and each concept, Rebound tracks four signals:

| Signal | What it measures | Source |
|---|---|---|
| Mastery | Accuracy, adjusted for question difficulty | Every logged attempt, updated Elo-style |
| Fluency | Speed: correct within the 5 s window, and how early in the reading the player buzzes | Buzz timestamps |
| Memory | When the player is likely to forget it | FSRS state of review cards |
| Calibration | Whether confidence matches correctness | An optional "sure / unsure" tap after answering |

**Question difficulty is measured, not guessed.** It starts from what is known (DOE says rounds 1–10 of each set are about equal in difficulty, which then rises through round 17, and invitationals run harder than regionals) and updates from real results. AI-assigned difficulty is not used: a 2026 study found an LLM's difficulty labels essentially uncorrelated (ρ = 0.06) with how hard 311 questions proved for students. If other teams join, anonymized results can sharpen everyone's estimates.

Players see the model on Learn → Subject map: a heat map of topics colored by mastery, with fluency and due reviews marked.

### 4.3 From a miss to mastery

1. A miss, a wrong interrupt or a correct-but-slow answer is logged.
2. Rebound links it to the question's concepts.
3. The question becomes a review card scheduled with FSRS, the open-source scheduler Anki uses. If the player's mastery of the concept is low, the concept card is queued too.
4. Next session: a two-minute micro-lesson with the concept card, two or three quick retrieval questions, and a worked example for computation concepts.
5. Reviews come back on a spaced schedule and are **always timed**. Slow-but-correct answers are rescheduled sooner.
6. Once the concept is stable, it appears only in mixed rounds.

If anyone disputes an answer key, every card that uses it is suspended until a person resolves the dispute, so the schedule never drills a wrong answer into memory.

### 4.4 The daily plan (the Today page)

Each player's Today page shows a queue sized to the time they have (for example 20, 30 or 45 minutes), in this order:

1. due reviews, capped so they never swamp the session;
2. anything the captain assigned;
3. one or two new concepts from the player's primary subject, chosen by frequency times weakness, and only once prerequisites are solid;
4. a targeted drill of questions the player should get right about 70–85% of the time;
5. a short mixed, timed round for breadth;
6. a speed sprint on concepts already mastered.

Every item carries a "why this?" label, such as "due review," "high-frequency concept you haven't mastered" or "assigned by captain."

**Shaped by role.** Following the primary-plus-secondary model Lexington uses, time splits roughly 50% primary subject, 25% secondary and 25% everything else. The breadth share has a floor, because rebounds and easy toss-ups in any subject are still points.

**Shaped by the calendar.** The plan shifts as the next tournament approaches:

| Phase | Learn and read | Targeted drills | Timed games and mixed rounds | Review retention target |
|---|---|---|---|---|
| Off-season (May–Sep) | 60% | 30% | 10% | 0.85 |
| Early season (Oct–Dec) | 40% | 40% | 20% | 0.88 |
| Last 3 weeks before a regional | 15% | 35% | 50% | 0.92 |
| Finals prep | 20% (visual and nationals-level) | 30% | 50% | 0.92 |

### 4.5 Why this design

- **Retrieval beats rereading**, with an average effect around g = 0.50, so every learning item ends in a question rather than a page.
- **Spacing and interleaving help, but less in real classrooms.** A 2026 classroom meta-analysis found effects of 0.37 for testing, 0.20 for spacing and 0.40 for interleaving, appearing reliably only when practice actually makes students retrieve. So reviews are real timed questions, and mixed rounds are a fixed part of every plan.
- **Retrieval practice makes recall faster, not just more accurate** (van den Broek et al., 2013). For buzzer play that is the most useful effect, so reviews are timed and slow answers count as weak.
- **AI help during play is a risk.** At the 2026 QANTA human–AI tournament, bonus parts answered after consulting an AI were less accurate (72.1%) than parts answered alone (80.0%). Teams probably consulted on harder parts, so this is a caution rather than proof, but Rebound keeps AI out of live play and uses it, if at all, after the round.

## 5. Built specifically for NSB

### 5.1 A versioned rules engine

Rules are a tested state machine with presets, not hard-coded timers. The 2027 presets encode:

| Rule | 2027 in-person | 2027 virtual |
|---|---|---|
| Scoring | Toss-up 4; bonus 10, only for the team that converted the toss-up | Same |
| Buzz window | 5 s after reading ends, including all four choices; 5 s rebound for the other team | Same |
| Answer start | A natural pause of up to 2 s, after which a stall counts as wrong | Same |
| Blurt on a fully read toss-up | 0 points; that team loses the question | Same |
| Wrong interrupt | +4 to the opponent, who hears a full re-read | Same |
| Toss-up communication | Silent writing or hand signals allowed | Hand signals only |
| Bonus | 20 s for the captain to begin, warning at 15 s; open discussion | Captain raises a hand while answering |
| Game length | 8-minute halves at regionals; 10 at the Finals; 12 in visual-bonus rounds | 18 toss-ups or time |
| Materials | No calculators; scratch paper issued and collected | Up to five sheets of paper |
| Visual bonus | 30 s window, warning at 25 s | (not used) |
| Challenges | Before the next question's category is read; 2 unsuccessful challenges per team per round | (not separately checked) |
| Ties | Elimination games: 5-toss-up tiebreakers without bonuses. Round-robin ties among several teams: a +1/−1/0 shootout | (not separately checked) |

Presets: **DOE Regional 2027**, **DOE Virtual 2027**, **DOE Finals 2027** (round robin, double elimination, visual rounds), **Invitational** (for example −4 negs instead of +4 to the opponent, custom halves) and **Practice** (no clock). Every logged game records which preset and version it used, and the public "NSB rules at a glance" page is generated from the same presets. Each October, when DOE posts the new rulebook (the 2027 edition went up October 5, 2026), someone compares it with the presets and updates the tests. DOE's own 2013 flowchart and coordinators' manual still describe the old blurt rule, so the engine follows the rulebook, not the handouts.

### 5.2 An answer checker that knows NSB conventions

Checking happens in layers, cheapest first:

1. **Multiple choice, exactly as the rules say.** The letter (W, X, Y or Z) or the choice's exact text counts. If both are given, both must be right, and only the first response counts.
2. **Short answers.** The question's ANSWER, ACCEPT and DO NOT ACCEPT lines; last names alone for people; names and formulas treated as equivalent; singular and plural forms.
3. **Numbers.** Fractions, decimals, π, radicals and scientific notation compared by value, with answers not in simplest form flagged. Units are optional, but a wrong unit is wrong.
4. **Lists and orders.** "Identify all" answers are compared as sets (the 2026 high school final was decided on one) and rankings as sequences.
5. **A guard for look-alike answers** (hypertonic and hypotonic, anode and cathode, left and right), so near-spellings cannot slip through.
6. **An optional small AI judge, for near-misses only.** A student project, scibowlgrader, reports 97.4% accuracy grading NSB short answers with a small model that runs in the browser, measured on its author's own tests. Rebound would use such a judge off the critical path, and it never overrides the look-alike guard.
7. **A one-key override and a protest log.** Any player can mark "I was right" or "I was wrong." Disputes go to the subject owner and become errata.

The checker ships with a test set of real team responses, and its false-accept and false-reject rates are tracked for each subject.

### 5.3 The Reader console for in-person practice

DOE tells coaches to spend "the vast majority" of team meetings on practice games, so the most important page on the site is Play → Reader console, opened on any laptop at practice and projected if wanted:

- a large-type reader view with pronunciation guides;
- clocks that start when the reader taps "done reading," with audible warnings;
- two-tap scoring: who buzzed, then correct, wrong, blurt or interrupt, with points applied by the preset automatically;
- any kind of buzzer: a hardware lockout system (the reader taps the winning player), players' own phones or Chromebooks opening the room link (buzz order decided by server timestamps), or BuzzIn.Live;
- a download of the same packet as a PDF, for paper or for a day the Wi-Fi fails.

Every toss-up feeds each player's statistics, the seen ledger and the review queue, so nobody has to score a practice twice.

### 5.4 Remote team rooms

Invite-only rooms under Play → Rooms, with links that can be posted to the team's Discord:

- server-timed buzzing with latency correction;
- text reveal or read-aloud;
- a private team channel for bonus discussion while the 20 s clock runs;
- a captain-only answer box;
- the virtual preset (hand signals only, 18 toss-ups).

Rooms are never public, because QB Reader's public rooms were overrun by bots in 2026.

### 5.5 Game-situation drills

- **Interrupt discipline.** A wrong interrupt gives the opponent 4 points plus a full re-read, so interrupting pays only when a player is well above 50% sure. Rebound shows each player their net points per interrupt by subject, and where they sit on a "too timid / too early" chart of buzz timing against accuracy. A Wyoming regional champion said it took "three years to master not buzzing in too early."
- **Format drills.** DOE's own hints note that "Most teams choose to answer with the letter only."
- **Clock management.** Late-half scenarios, since top teams use the clock deliberately.
- **Tiebreakers.** Five-toss-up tiebreakers and round-robin shootouts.
- **Visual rounds.** Finals elimination rounds use visual bonuses, and no official samples exist; SB Reader's 571 visual questions can seed a practice set.

The high school Finals' Division Team Challenge has no published rules, so it stays an open item.

### 5.6 A difficulty ladder

Questions are leveled from data and source:

1. early regional (DOE rounds 1–10);
2. late regional (rounds 11–17);
3. invitational;
4. nationals-level.

Players and captains filter by level, and scrimmages can target one, for example regional-final practice in February.

### 5.7 Middle school mode

Middle school now uses the same six categories, so supporting it takes only middle school presets and the middle school question level (DOE's MS sets 1–16). Choosing "middle school" during team setup is all a feeder program needs.

## 6. Captain and coach tools (the Team pages)

Members can see their own stats and assignments here; editing tools appear only for captains, coaches and subject owners.

- **Roster and sub-teams.** Sub-teams A–D, the way Lexington runs them, with coach, captain and member roles.
- **Who covers what.** Each member's primary and secondary subjects, plus a heat map of the team's best mastery per topic, so gaps stand out ("nobody is above 60% on optics"). It also plans succession: who takes over each subject when a senior graduates.
- **Lineups.** For any four players, the page estimates expected points per round from each player's per-subject accuracy and buzz speed, and suggests the best-covering lineup. This extends what Science-Bowl-Tracker's Team Builder already does.
- **Assignments.** Question sets, concepts or readings with due dates and completion tracking, or assigned automatically from coverage gaps.
- **Scrimmages.** A packet of questions nobody in the room has heard, balanced across subjects and aimed at a difficulty level, ready for the Reader console or as a PDF.
- **Team stats.**
  - Per player: toss-up accuracy by subject and topic, interrupt rate and accuracy, blurts, buzz timing and rebounds.
  - Per team: bonus conversion, points per game and trends.
  - Small samples are marked as uncertain rather than turned into rankings.
- **Calendar.** Regionals and invitationals (entered from Stanford's list), with each player's Today plan tapering automatically.

## 7. Trustworthy question data (the Library)

- **Provenance on every question:** source tournament and round, original URL and page, a content fingerprint, permission status and any embargo.
- **A seen ledger:** what each player has heard, so drills and scrimmages serve fresh questions. Complaints about teams having already seen the available sets go back to at least 2018.
- **De-duplication** across DOE, SB Reader, ISOBowl and team sets, by fingerprint and by text similarity.
- **Reliability weights.** Sources with known error rates are served less and flagged faster; for example, SB Reader's audit found 6–7% of student-written school sets had a wrong key or were unusable.
- **An errata workflow.** A player reports a problem from any question; the subject owner decides, the fix is versioned, and affected review cards are restored.
- **Adding questions.** DOE sets come preloaded; their PDFs are text-based and uniformly formatted, so parsing is straightforward. A captain adds a packet by uploading a PDF or JSON file on the Library page: the site extracts the questions, shows a review screen for anything that didn't parse cleanly, and only then adds them to the team's library. SB Reader's files, the ScibowlDB dump and ISOBowl's released rounds (never embargoed ones, which its API withholds) are pulled in by scheduled server jobs, kept private and attributed.
- **Permissions:**
  - DOE questions are public domain, but DOE asks for credit and for links rather than re-hosting.
  - Community packets carry no license, so they stay inside the team, attributed, and are never redistributed.
  - Unreleased official packets are never loaded; the 2027 rules bar players from official questions other than those published on the NSB website.

## 8. Question-writing studio (Team → Write)

DOE's tips note that strong teams write their own questions from their study materials. The studio turns that habit into a library that grows every season:

- **DOE-style templates:** toss-up and bonus, category, short answer or multiple choice, W–Z choices, ANSWER, ACCEPT and DO NOT ACCEPT lines, and pronunciation guides.
- **Automatic checks:**
  - choices are parallel and only one is correct;
  - numbers are in simplest form and units are right;
  - the question doesn't duplicate one already in the library;
  - every question cites a source.
- **Peer review:** draft, then review by the subject owner, then approval into the team's library. Difficulty is calibrated afterwards from real play.
- **Export** to NSB Toolbox's .docx format for running practice tournaments, and to JSON.
- **Optional AI drafts.**
  - A strong model drafts from a cited passage, and a second model answers the draft blind to catch bad keys.
  - A person approves every question; AI-drafted questions are labeled and kept to internal practice.
  - The quiz bowl community reacted sharply against AI-written tournament questions in 2026, which is why they never leave the team.

## 9. Other qualities

| Quality | What it means in Rebound |
|---|---|
| Privacy | Team-scoped spaces and invite codes; no public lobbies, leaderboards or profiles; minimal personal data (display names, coach-managed accounts); download and deletion of your own data; no ads or trackers. If middle schoolers under 13 use the site, US children's privacy law (COPPA) applies, so use coach-created accounts without personal information and check your school's rules. |
| Access | Covered in Section 1: any modern browser, offline drills, keyboard play, screen-reader labels, and a page for school IT staff. |
| Low cost | Free-tier hosting plus a domain, with a target under $10 a month (Section 11). AI is optional and cheap: at November 2026 list prices (for example $0.10 and $0.50 per million input and output tokens for Claude Haiku 5.5, or $0.075 and $0.30 for Groq's gpt-oss-20b), a team's season of AI use costs a few dollars. Avoid free AI tiers that use submitted content to improve their products, such as Gemini's, for student answers. |
| Durability | Open source (MIT or Apache-2.0); a published question-and-game-log format, "NSB-JSON," the Science Bowl counterpart of quiz bowl's QBJ, which has no Science Bowl rule set; one-click export; no dependence on anyone's personal server; contributor docs and a captain handoff checklist; automated tests for the rules engine and the checker. |
| Fairness | Credit to DOE and every packet source; no NSB logo or anything implying DOE affiliation; embargoes honored, as are tournaments' requests not to discuss their questions. |
| Healthy motivation | Team goals and personal improvement instead of public rankings; optional streaks; stats shown with their uncertainty. |
| Integrations | Discord webhooks for daily reminders, room links and a weekly team digest; ISOBowl for cross-team scrimmages and tournaments; BuzzIn.Live or Klaxon for remote buzzers; calendar export. |

Where AI is and isn't used:

| Task | Uses AI? | Guardrail |
|---|---|---|
| Live play | No | Keeps practice honest |
| Math and physics problem generation | No | Templates with exact answers computed by a computer algebra system |
| Difficulty estimates | No | Measured from results |
| Near-miss answer judging | Optional, a small model running in the browser | Off the critical path; one-key override |
| Concept tagging suggestions | Yes | The subject owner confirms |
| Explanations and concept-card drafts | Optional | From cited sources; labeled; approved by a person |
| Question drafts | Optional | Blind solve by a second model; human approval; internal use only |

## 10. What Rebound will not do

- Become another public question reader or open lobby; about twenty already exist. The public "Try a round" page is a one-round demo.
- Host tournaments; ISOBowl does that.
- Ship a separate mobile app; the website works on phones and can be added to the home screen.
- Scrape question banks that require a sign-in.
- Present AI-written questions as official or use them outside the team.
- Charge for features built on other people's packets.
- Use NSB branding.

## 11. How the website is built and hosted

```
 Members' browsers (Chromebook · laptop · phone)
        │  one domain, HTTPS
        ▼
 Static website on a CDN host ──────►  Room server for live games
 (all pages; questions cached           (server-timed buzzes, rules engine,
  for offline drills)                    latency correction; falls back to
        │                                ordinary web requests if the school
        ▼                                blocks live connections)
 Database and sign-in
 (team privacy enforced inside the database)
        ▲
        │ server-side jobs
 DOE sets (preloaded, re-checked monthly) · captain uploads
 (PDF/JSON → extract → review screen → library) · scheduled imports of
 SB Reader, ScibowlDB and ISOBowl released rounds (private, attributed)
 Offline preparation: math problem banks generated with SymPy, loaded in bulk
```

| Piece | Suggested choice | Why |
|---|---|---|
| Website front end | TypeScript with React or Svelte, built as a static site; KaTeX for math; browser text-to-speech | Loads fast from a CDN and runs in any modern browser |
| Hosting | Cloudflare Pages, Netlify or Vercel on a free plan, with automatic deploys from GitHub and a preview link for every change | Free and fast, with no servers to patch |
| Domain | A team- or club-owned domain (roughly $10–15 a year), registered to an account the coach can access and set to auto-renew | The address outlives any one student |
| Database and sign-in | Postgres with row-level security, for example Supabase | Team privacy enforced by the database; SQL for stats; a free tier |
| Live rooms | A small authoritative room server (for example Node WebSockets, or Cloudflare Durable Objects) with a fallback to ordinary requests | Fair buzzes, even behind filters that block live connections |
| Imports | Server-side functions with PDF text extraction and a review screen before anything reaches the library | No command line for captains |
| Shared logic | TypeScript packages: `rules-engine`, `judge`, `planner` (built on ts-fsrs) and `nsb-schema` | The same tested code runs in the browser and on the server |
| Monitoring and backups | Free uptime checks and error reports; nightly database backups; a monthly full export to team-controlled storage | Problems get noticed and data survives |
| Optional AI | A small judge model in the browser; server-side calls to a low-cost API, with caching | Cheap, private and replaceable |

**Security basics:** HTTPS everywhere, row-level security on every table, rate limits on sign-in and room joining, a content security policy, and no third-party trackers or ads.

**Cost:** about $12 a year for the domain; free hosting and database tiers should cover one team; a few dollars a month if live rooms outgrow a free plan; optional AI at a few dollars a season. The target is under $10 a month.

**Core records:**

- **Question:** source and provenance, level, subject, legacy subject, concepts, type, format, text, choices, answer, accept and reject lists, pronunciations, visual asset, linked bonus, difficulty (starting estimate, current estimate, sample size), flags and fingerprint.
- **Concept:** subject, topic, prerequisites, frequency and card versions.
- **Attempt:** player, question, game, buzz time, position in the reading, response, judgment, override, confidence and ruleset version.
- **Review card:** FSRS state.
- **Game:** preset and version, rosters and event log.
- **Team:** members, roles, subject ownership and assignments.

Keep question data out of any public code repository; publish only the code and the schema.

## 12. Roadmap: shipping the site this season

Key dates: DOE's deadline to register a school's first team is November 23, 2026; regionals run January–March 2027; the Finals are April 29–May 3, 2027. Every phase ships to the live website, so the team uses it from the first phase on.

| Phase | When | What goes live on the site | Done when |
|---|---|---|---|
| 0. Site live; every practice logged | Nov 9 – Dec 6 | Public pages (Home, Try a round, NSB rules at a glance, For coaches, For school IT staff, privacy and credits); team setup and join flow; Library with DOE sets preloaded and SB Reader data imported privately; Reader console with the 2027 regional preset, clocks and two-tap scoring; checker v1 (multiple choice, accept lists, numbers, units, last names); seen ledger | The team runs a full practice round from the website and every toss-up is logged |
| 1. Today and Review | Dec 7 – Jan 3 | Today page v1; timed review of misses and slow answers; subject and topic drills; starter subject map with concept tags on high-frequency topics; My progress; offline drills | Every player opens Today and finds a review queue |
| 2. Team pages | Jan – Feb | Who covers what; Lineups; Assignments; Scrimmages; Team stats; packet upload; concept cards for each primary subject; daily plan v1; remote rooms with a bonus channel and the virtual preset | The captain sets a regional lineup from the Team pages |
| 3. Finals prep, if you qualify | Mar – Apr | Finals presets (10- and 12-minute halves, 30 s visual bonuses); Visual lab; nationals-level filter; tiebreaker drills | A Finals-format scrimmage runs on the site |
| 4. Off-season and handoff | May – Sep | Write (studio); Reading paths for every subject; optional AI drafts and explanations; middle school mode; open-source release with the NSB-JSON spec; handoff docs; team sign-up open to other schools | A second maintainer deploys a change unaided, and the 2028 rules are live soon after DOE posts them |

**Launch checklist** (before members get the link):

- The domain is registered to a team or club account the coach can access, with HTTPS on and auto-renew set.
- The privacy page, terms and credits are up, including credit to DOE and a statement that Rebound is not affiliated with DOE.
- The "For school IT staff" page is up, and the school's IT staff have been asked to allow the domain before the first practice.
- The site has been tested on a school Chromebook on the school network, and on an iPhone and an Android phone.
- Nightly backups are running and one restore has been tested.
- Uptime alerts go to two people.
- The coach has admin access to the hosting, database and domain accounts.

A workable build team:

- two web developers;
- one data lead for the importers and tagging;
- six subject owners for concept maps, cards and tag review;
- one person who owns the checker's test set.

## 13. How you'll know it works

| Measure | Target |
|---|---|
| Time from join link to first answered question | Under one minute for a typical new member |
| Page load on a school Chromebook | Under 3 seconds |
| Uptime during scheduled practices | 99% or more |
| Practice toss-ups logged | 80% or more |
| Weekly active members | 90% or more |
| Reviews done on time | 80% or more of due reviews |
| Checker accuracy | Under 2% false accepts and 3% false rejects on the test set |
| Interrupt quality | Net points per interrupt rising month over month |
| Coverage | Every topic has at least one player above 70% mastery by the first regional |
| Speed | Median correct-buzz time on mastered concepts falling |
| Results | Points per game at invitationals and regionals compared with last season |
| Durability | A second maintainer trained before the lead developer graduates |

## 14. Risks

| Risk | Mitigation |
|---|---|
| Too much to build before regionals | Phase 0 alone already beats spreadsheets; cut scope rather than slip dates |
| The school's web filter blocks the site | The "For school IT staff" page; ask IT to allow the domain before launch; one domain; a fallback for live connections |
| The site is down during practice | The Reader console downloads the packet as a PDF ahead of time; drills work offline; uptime alerts |
| The domain or accounts lapse when students graduate | Domain and hosting owned by a team or club account with the coach as admin; auto-renew; the handoff checklist |
| Wrong answer keys | Provenance, reliability weights, disputes that suspend review cards, errata |
| Permissions on community packets | Private team use with attribution; ask MIT, Stanford and others before sharing anything more widely |
| AI mistakes | No AI in live play, math generation or difficulty; labels and human approval everywhere else |
| Low adoption | The Reader console is used at every practice; Discord reminders; captain assignments |
| The developer graduates | Simple stack, tests, docs, open source, a handoff checklist |
| Student privacy | Minimal data, team-private spaces, coach oversight |

## 15. Questions to settle with the team

1. How much practice is in person versus online, and does the team own a hardware buzzer system?
2. Is this only for your team, or should other schools be able to create team spaces?
3. Who owns which subject, and how many hours a week can each person give?
4. Which devices do members use, and are phones allowed at practice?
5. Is there a middle school feeder program to support?
6. Who should own the domain and hosting accounts: the coach, the club, or the school?
7. Can students sign in to outside sites with their school Google accounts, and will school IT allow a new domain?
8. Open source from day one, or after the season?

A ten-minute poll of the team, and perhaps the Science Bowl Discord, would settle which features matter most.

## Key references

- 2027 NSB rules: [in-person](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf), [virtual](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027_Virtual_NSB.pdf)
- DOE sample questions: [high school](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/HS-Sample-Questions), [middle school](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/MS-Sample-Questions); [Tips and Resources](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/Tips-and-Resources)
- Reuse rules: [Office of Science web policies](https://science.osti.gov/Web-Policies), [NSB logo rules](https://science.osti.gov/wdts/nsb/About/Logos)
- Existing tools to integrate with or learn from: [SB Reader](https://unweidlykhan349.github.io/sbreader/), [ISOBowl changelog](https://isobowl.com/changelog), [NSB Toolbox](https://github.com/rishi-kulkarni/nsb-toolbox), [Science-Bowl-Tracker](https://github.com/paxtoncava/Science-Bowl-Tracker), [scibowlgrader](https://github.com/tshulin/scibowlgrader), [BuzzIn.Live](https://buzzin.live/)
- Building blocks: [FSRS libraries (ts-fsrs, py-fsrs)](https://github.com/open-spaced-repetition), [OpenStax textbooks](https://openstax.org/)
- Full evidence: the verified landscape report written alongside this proposal (not included in this repository)
