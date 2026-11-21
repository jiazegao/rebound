# Other producers and tools: how Science Bowl–style and quiz bowl sets are made outside DOE, and what banks, practice tools and AI generators exist

*Method note (researched 2026-11-21).* In this session WebFetch could not reach hsquizbowl.org, qbwiki.com or thetech.com (DNS blocked by the session's network rules), so I did not try other tournament sites. GitHub web pages could be fetched; the `gh` API could not (not enabled). Findings marked **(search summary)** come from search-engine summaries of pages I could not open. Their wording, dates and attribution to a specific thread are less certain than findings from pages I read directly: the GitHub READMEs, the SB Reader tournament table and PR #27. Undated forum material is labelled with its approximate year.

## 1. Student-run Science Bowl invitationals (2023–2026): which exist, and how they produce sets

### Takeaway
University-run high school invitationals at MIT, Stanford, Berkeley, Yale, Texas (UT Austin), Rice and UCLA all use the same model. Volunteer college students write the sets, mostly Science Bowl alumni; MIT's writing team is about 30 people. They write over roughly six months and produce about 600–950 questions per set. The sets are released free after the event, and Stanford reuses one set at "mirror" tournaments across the country. I found no Science Bowl invitational at Princeton or UChicago (only Science Olympiad events there). Georgia Tech hosts a DOE regional and is listed as a Stanford mirror for March 2027. None of the sources gives a budget, writer pay, a published style guide or an AI policy for these events.

### Cited Findings
**Which events ran or are scheduled (2023–2027)**
- 2025–26 season, per the scibowl.live listing: Berkeley Science Bowl and Rice Science Bowl (Houston), both Dec 6, 2025; Yale Science Bowl Invitational (New Haven), Jan 17, 2026; Stanford Science Bowl (Palo Alto), Mar 8, 2026; UCLA Science Bowl, Apr 15, 2026; and an online "NSSB Invitational", May 31, 2026. The Stanford list and scibowl.live disagree on some dates. — [scibowl.live tournaments](https://www.scibowl.live/tournaments) (search summary)
- 2026–27, per Stanford's tournament list:
  - Berkeley and Rice, both Dec 5, 2026.
  - Online: MOOSE on Dec 13, 2026, and MOSFET College+ on Dec 20, 2026.
  - A Mira Loma Fall Invitational in Sacramento (no date given).
  - Texas Science Bowl (online), Jan 17, 2027. The Jan 18, 2026 edition is listed with "Results" and "Statistics" links.
  — [Stanford tournament list](https://scibowl.stanford.edu/tournaments) (search summary)
- The Stanford mirrors page lists a "Georgia Tech Invitational" (Atlanta) for March 2027 that will use the Stanford set. — [Stanford mirrors](https://scibowl.stanford.edu/mirrors) (search summary)
- MIT High School Invitational: Saturday, Nov 14, 2026. Round robin and double elimination, plus wildcard rounds for teams eliminated in the morning; registration closed Oct 1. — [MIT HS Invitational](https://www.mitsciencebowl.com/high-school/hs-invitational) (search summary)
- NASTI 1 (Irvine), Nov 28, 2026: it will reuse another tournament's questions with that tournament's permission. — [NASTI 1](https://bowl.uhsscienceclub.org/) (search summary)
- SB Reader's packet catalog (Nov 2026) shows which events released sets:
  - MIT 2020–2025; Stanford 2025 and 2026; Yale 2026; Berkeley 2023; Texas 2025 and 2026.
  - Many student-run or high-school sets labelled 2025 or 2026: AVES, BASED, Bash, BTHS, CLASH (HS and MS), Clements, CUT, DAST, DVHS, FE!M, HSBT, ICSBT, ISBI, NWI, SCB, SMH, THUMB, TJSBT, Lexington Biology Bowl, National Chemistry Bowl and Trio Online Math Bowl.
  - Older student sets: Olympus 2022, IGNIS 2022, Prometheus 2021, MOOSE 2021, WISC 2021, Cast 2021, NSI 2023/2024, SSBT 2023, MNSBT 2024, Pohaku 2024, ISBL 2024.
  — [SB Reader tournaments.md](https://github.com/sbreader/sbreader.github.io/blob/main/docs/tournaments.md)
- Events SB Reader knows of that have no packets online (Nov 2026):
  - No packets posted: East Brunswick Invitational, Equity Northeast Science Bowl, MIT College+ Invitational, PHYS.
  - Still to come: Dougherty Valley MS 2026, MOSFET College+, CREST.
  - Hosted on isobowl.com but not yet released: Hawaii Science Bowl Tournament, three ISOBowl Invitational divisions, North South Science Bowl, Mitosisphere Bio Bowl 2026, BTHS Fall Invitational 3.
  - Others: SMH League Cup (Jan 2025) has no packets online; Pleasanton Invitational (2022) has results only.
  — [SB Reader README](https://github.com/sbreader/sbreader.github.io)
- Princeton: searches found only:
  - The student-run Princeton University Science Olympiad Invitational (Feb 7, 2026; 59 Division C teams). — [Princeton SciOly](https://scioly.princeton.edu/) (search summary)
  - PPPL's DOE New Jersey Regional Science Bowl. — [PPPL](https://www.pppl.gov/new-jersey-regional-science-bowl) (search summary)
  - The PRISMS Science+ Bowl, a middle school buzzer event. — [PRISMS](https://prismsus.org/events/science_bowl/index) (search summary)
- UChicago: only student-run Science Olympiad invitationals (Jan 2025, Jan 2026) turned up, no Science Bowl. — [UChicago SciOly](https://uchicagoscio.github.io/); [Duosmium 2026 UChicago](https://www.duosmium.org/results/2026-01-17_uchicago_invitational_c/) (search summary)
- Georgia Tech hosts the DOE regional high school Science Bowl (for example Feb 2024, in the Howey Physics Building). — [GT Physics outreach](https://physics.gatech.edu/outreach-programs-high-school-engagement) (search summary)

**MIT Science Bowl (MIT HS Invitational, since 2019)**
- MIT has hosted the High School Invitational since 2019. Student volunteers write the sets, many of them Science Bowl alumni. — [MIT HS Invitational](https://www.mitsciencebowl.com/high-school/hs-invitational) (search summary)
- Team size and process, per The Tech:
  - The writing team is about 30 people from MIT and other universities, and together they write "over 1,000 draft questions every year".
  - A smaller collegiate tournament is used to get feedback on draft questions and to keep the content to the "strict quality control standards" the Invitational is known for.
  - A volunteer recruiting effort in 2020 began the practice of student-written questions. This is slightly at odds with MIT's own "since 2019".
  — [The Tech, Dec 11, 2025](https://thetech.com/2025/12/11/science-bowl-tenth-anniversary) (search summary; page could not be fetched)
- Questions are pitched at "roughly college freshman level" and written by current MIT, BU and Tufts students. — [MIT alumni officiating listing](https://alumcommunity.mit.edu/events/295173) (search summary)
- The writing cycle starts around May, for an event in mid-November. — [MIT Science Bowl site](https://www.mitsciencebowl.com/high-school/hs-invitational) (search summary)
- The 2024 (sixth) invitational had 48 teams and more than 120 volunteers. A volunteer said every question used that day was written by a volunteer. — [MIT News, Jan 2, 2025](https://news.mit.edu/2025/high-school-teams-compete-mit-science-bowl-invitational-0102) (search summary)
- MIT changed the Energy category to focus on current research at MIT. — [MIT Science Bowl home](https://www.mitsciencebowl.com/) (search summary)
- Distribution: past invitational sets are posted free on MIT's Resources page, with a form for reporting errata. — [MIT Resources](https://www.mitsciencebowl.com/high-school/resources) (search summary)
- Set sizes, counting tossups and bonuses separately: MIT 2020: 600; 2021: 598; 2022: 648; 2023: 598; 2024: 646; 2025: 950. MIT's 2024 and 2025 visual rounds were released as slide decks. — [SB Reader tournaments.md](https://github.com/sbreader/sbreader.github.io/blob/main/docs/tournaments.md); [SB Reader README](https://github.com/sbreader/sbreader.github.io)
- MIT's 2015 Middle School Regional was the first fully student-run NSB tournament. — [MIT history](https://www.mitsciencebowl.com/history) (search summary)

**Stanford Science Bowl and its mirrors**
- Its first invitational, in March 2025, drew 36 teams from 26 schools. A team of Science Bowl alumni runs it. — [Stanford About Us](https://scibowl.stanford.edu/people) (search summary)
- Students from seven universities write the set, and it is used at mirrors across the country.
  - 2025 mirrors: the first Johns Hopkins Invitational, UCLA Science Bowl and the Collierville Invitational, a combined 88 teams.
  - Some writers also direct mirrors: the co-director of the JHU Invitational and the director of UCLA Science Bowl.
  — [Stanford Science Bowl](https://scibowl.stanford.edu/); [Stanford people pages](https://scibowl.stanford.edu/people) (search summary)
- Stanford especially encourages writers from other universities to join. — [Stanford volunteer page](https://scibowl.stanford.edu/invitational/volunteer) (search summary)
- The second invitational was on Mar 8, 2026. The third, in 2027, is tentatively a middle school day on Feb 20 and a high school day on Mar 7; another Stanford page says "March or April 2027". — [Stanford home](https://scibowl.stanford.edu/); [Competition details](https://scibowl.stanford.edu/invitational/competition-details) (search summary)
- The 2025 and 2026 sets have 644 questions each. Packets are published on scibowl.stanford.edu and include a "Past Questions" page. — [SB Reader tournaments.md](https://github.com/sbreader/sbreader.github.io/blob/main/docs/tournaments.md); [SB Reader site](https://sbreader.github.io/); [Stanford Past Questions](https://scibowl.stanford.edu/past-questions)

**Berkeley, Texas, Yale**
- Berkeley:
  - The 2025 event had 48 teams playing 10 rounds; Davidson Academy A won. — [Davidson Academy news](https://www.davidsonacademy.unr.edu/news/davidson-academy-science-bowl-team-wins-2025-berkeley-science-bowl/)
  - It is run by Berkeley students, held only on the UC Berkeley campus, and includes an energy division. — [Berkeley Science Bowl](https://www.berkeleysb.org/) (search summary)
  - Writer recruitment (notice dated Fall 2025): applicants send a sample of 5 tossup/bonus pairs "in the official DOE format". — [Berkeley volunteer page](https://www.berkeleysb.org/volunteer) (search summary)
  - The 2023 set has 644 questions. — [SB Reader tournaments.md](https://github.com/sbreader/sbreader.github.io/blob/main/docs/tournaments.md)
- Texas Science Bowl:
  - A high school invitational run by UT Austin students; "since 2025" it has hosted a virtual "high-stakes" tournament. Packets are posted under "Past Competitions" when available. — [Texas Science Bowl](https://texassciencebowl.org/) (search summary)
  - The 2025 set has 649 questions and the 2026 set 645. Three 2026 visual bonuses have no published figure. — [SB Reader tournaments.md](https://github.com/sbreader/sbreader.github.io/blob/main/docs/tournaments.md); [SB Reader README](https://github.com/sbreader/sbreader.github.io)
- Yale Science Bowl Invitational:
  - A student-run invitational for high school teams. — [yalesciencebowl.org](https://yalesciencebowl.org/) (search summary)
  - SB Reader holds only 92 questions from Yale 2026, which suggests a partial release. — [SB Reader tournaments.md](https://github.com/sbreader/sbreader.github.io/blob/main/docs/tournaments.md)

**A DOE alternative some invitationals can use instead of writing**
- DOE does not sponsor invitationals. For up to one tournament per year held before Dec 15, DOE supplies "previously-unreleased practice questions". Coordinators and everyone with access to them must sign non-disclosure agreements. The guidance page dates from 2019. — [DOE Invitational Practice Tournament](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/Invitational-Practice-Tournament) (search summary)

**Distribution and security**
- scibowl.live says it holds "the largest invitational packet repository in Science Bowl" (formerly cloud.mehvix). Its moderating software, MoSS, lists packets from a private AWS S3 bucket. A moderator unlocks a packet with its password at the event, so packets stay private until then. — [scibowl-org README](https://github.com/xpoes123/scibowl-org); [PR #226](https://github.com/xpoes123/scibowl-org/pull/226) (search summary)

### Inferences
- The typical production unit is a volunteer collegiate team of about 30 writers on a roughly six-month cycle (May → November at MIT), producing more than 1,000 drafts to yield one set of about 600–950 questions. The median of the university sets above is 644. One playtest round happens at a smaller college-level event; MIT's "MIT College+ Invitational" is probably that event, but no source confirms this.
- Stanford's mirror model spreads one writing effort across several events: four sites and about 124 teams in 2025 (36 at Stanford plus 88 at the three mirrors). It shows that the community already treats a good set as a reusable asset rather than a one-off.
- Tallying the SB Reader table, sets labelled 2025 or 2026 come to 31 sets and 15,495 questions: 9,369 labelled 2025 and 6,126 labelled 2026 so far. Many unlabelled sets are probably recent too. So the community releases very roughly 10,000–15,000 new Science Bowl–style questions a year for free. My tally is in /tmp/claude-0/-home-user-rebound/9c027786-268a-5678-a664-85e4e2994527/scratchpad/research/other_producers_and_tools/sbreader_counts.py.
- No source mentions writer pay at any Science Bowl invitational. Unpaid volunteer labour is the evident model, unlike NAQT (section 2).

### Gaps
- No invitational published its editing workflow: number of editors, sign-off steps or a written style guide. The closest are Berkeley's requirement to use the DOE format and MIT's playtest-plus-errata practice.
- I could not open The Tech (2024, 2025), the MIT and Stanford volunteer pages, the scibowl.live tournament list or texassciencebowl.org, so the team sizes, timelines and dates above come from search summaries.
- I found no budgets or costs (registration fees and what they fund) for any Science Bowl invitational.
- I found no reports of problems at specific invitationals (protests, errata counts) beyond the dataset-level error audits in section 5.
- Whether "Georgia Tech Invitational" (2027) is student-run, and who runs Rice, UCLA and NSSB, is unconfirmed.

## 2. Quiz bowl producers (NAQT, ACF, PACE, housewrites): staff, pay, editing, distribution, production rates and quality control

### Takeaway
Quiz bowl has three production models. NAQT is a company that pays freelance writers per accepted question, with tiered rates of up to $10.06 per tossup and $7.78 per bonus in 2026–27, rising to $17.61/$13.62 with consistency and science bonuses. ACF uses volunteer editors and requires teams to submit packets: a team writes a half-packet in exchange for a fee discount, or pays an opt-out fee. PACE uses volunteer members plus paid writing and editing, which drew criticism in 2025 over unpaid editors. The community's own estimates put a good pyramidal tossup at 20 minutes to 2 hours of writing and a housewrite set at 8 months or more. Editing and playtesting are treated as the bottleneck.

### Cited Findings
**NAQT (paid freelance model)**
- Pay, 2026–27: "up to $10.06 per tossup question and up to $7.78 per bonus question accepted by our editors". The rate depends on target difficulty and the writer's experience. Bonuses for writing consistently from week to week, and for science questions, raise the maximum to $17.61 per tossup and $13.62 per bonus. — [NAQT jobs](https://www.naqt.com/jobs/) (search summary)
- Writers are sorted into tiers by the typical quality of their questions. Higher-tier writers are credited when they write a question; lower-tier writers are credited only when a subject editor accepts it. Payment is quarterly by check or Zelle, or monthly for writers who regularly earn over $100 a month. — [NAQT jobs FAQ](https://www.naqt.com/jobs/faq.jsp) (search summary)
- To apply, writers must be 18 or older and must not live in, or regularly stay in, California. They submit ten sample questions (at least three tossups and three bonuses) written without help from other people "AI tools, or similar resources"; standard reference material is allowed. — [NAQT jobs](https://www.naqt.com/jobs/); [NAQT application advice](https://www.naqt.com/jobs/application-advice.html) (search summary)
- From 2026–27, NAQT prohibits "putting NAQT's content (including question content, website content, and practice materials) into large language models or other artificial intelligence software without explicit written permission". It will consider requests for use with AI tools, judged on "question security, privacy, and the humanity of quiz bowl". — [NAQT 2026–2027 changes](https://www.naqt.com/articles/2026-2027-changes.jsp); also in the [Licensing Policy](https://www.naqt.com/rules/licensing-policy) and [Host Policies](https://www.naqt.com/hosting/policies.jsp) (search summary)
- Older reference point: QBWiki gives "standard compensation" as about $4 per tossup, with bonuses slightly less (undated, probably pre-2020). — [QBWiki: Writing](https://www.qbwiki.com/wiki/Writing) (search summary). An earlier hsquizbowl thread announced new NAQT payment rates (about 2015, not read). — [hsquizbowl t=17418](https://hsquizbowl.org/forums/viewtopic.php?t=17418)

**ACF (volunteer editors plus team packet submission)**
- Teams with at least two players who played a mainstream collegiate tournament before Sept 1 of the prior year must submit a packet. — [ACF packet submission guidelines](https://acf-quizbowl.com/guidelines/packet-sub/) (search summary)
- Fees for 2026 events (search summary):
  - Winter: half-packet or a $50 opt-out fee. The fee adjustment runs from a $50 discount for the earliest deadline (Jul 26, 2026) to a $30 penalty for the Oct 18 deadline. — [2026 ACF Winter](https://acf-quizbowl.com/tournaments/winter/2026/)
  - Fall: optional since 2020. Discounts run from −$60 (Jul 5) down to −$10 (Sept 13), up to −$80, with at most one half-packet per team. — [2026 ACF Fall](https://acf-quizbowl.com/tournaments/fall/2026/)
  - Nationals: mandatory half-packets. — [2026 ACF Nationals](https://acf-quizbowl.com/tournaments/nationals/2026/)
  - Regionals: a $75 opt-out is listed, but that page may be stale. — [2026 ACF Regionals](https://acf-quizbowl.com/tournaments/regionals/2026/)
- Mechanics: teams request a category distribution and receive a template. They submit .doc/.docx in 10-pt Times New Roman, and files the editors can't open don't count as submitted. Bringing in non-playing club members or alumni as writers needs ACF's prior approval. — [ACF guidelines](https://acf-quizbowl.com/guidelines/packet-sub/); [2026 ACF Fall](https://acf-quizbowl.com/tournaments/fall/2026/) (search summary)
- ACF's rationale is that packet submission brings in fresh topics from across the country and helps editors avoid lopsided sets. — [Why Packet Submission?](https://acf-quizbowl.com/writing/why-packet-sub/) (search summary)

**PACE (National Scholastic Championship)**
- About 2017: PACE members "serve on a volunteer basis, although we do provide some compensation for specific tasks such as writing and editing questions (including to non-members)". A former writer described writers and editors as closer to contractors. — [hsquizbowl: Would You Recommend Working for PACE?](https://www.hsquizbowl.org/forums/viewtopic.php?t=18864) (search summary)
- 2025–26 Writing Mentorship Program: mentees write 20 questions and a self-reflection. Their questions can appear in the 2026 NSC "and writers will be paid accordingly", and mentees may be invited onto the NSC set team. — [PACE Writing Mentorship Program](https://www.pace-nsc.org/initiatives/writing-mentorship-program/); [hsquizbowl t=29261](https://hsquizbowl.org/forums/viewtopic.php?t=29261) (search summary)
- The 2022 call asked writers for 4 sample questions. It also advertised volunteer roles such as asynchronous read-through and proofreading. — [2022 PACE NSC writing and editing application](https://hsquizbowl.org/forums/viewtopic.php?t=25240) (search summary)
- NSC entry fees go "primarily toward writers and editors of the NSC question set", plus staff travel and operating costs. — [PACE NSC info](https://www.pace-nsc.org/national-scholastic-championship/) (search summary)
- 2025 criticism from a set editor: "it doesn't make sense to have unpaid laborers who do an order of magnitude more work than paid proofreaders." — [2025 PACE NSC Thanks and Discussion](https://hsquizbowl.org/forums/viewtopic.php?t=29102) (search summary)

**Housewrites and how-to guidance (quality-control practices)**
- PACE's guide to writing a set:
  - A set needs at least 14 packets to be usable by other hosts.
  - Act on playtester feedback, replacing clues playtesters call bad.
  - Track each answer line in a spreadsheet, colour-coded by stage (written, edited, packetized).
  — [PACE: So You Want to Write a Question Set?](https://www.pace-nsc.org/resources/so-you-want-to-write-a-question-set/) (search summary)
- Writing a set in-house means assigning someone to check for repeated questions and someone to edit for length and difficulty. — [PACE: Getting Questions for Your Tournament](https://www.pace-nsc.org/resources/getting-questions-for-your-tournament/) (search summary)
- A housewrite takes "at least 8 months to write, after assembling a team", and every question should be edited 4 weeks before the first mirror. — [hsquizbowl: So You Want To Write A Tournament](https://www.hsquizbowl.org/forums/viewtopic.php?t=26915) (search summary; about 2023)
- Typical size: "about a dozen packets of twenty tossups and twenty bonuses", or roughly 500 questions per tournament. — [QBWiki: Writing](https://www.qbwiki.com/wiki/Writing) (search summary)

**Production rates**
- One writer: "it often takes me 20 minutes or more to write a good tossup". A slower writer estimated about 2 hours per tossup when working from online articles and papers. Research to find clues is the most time-consuming part. — [hsquizbowl: Improving productivity as a writer](https://hsquizbowl.org/forums/viewtopic.php?t=11291) (search summary; older thread, and the quotes may come from a related thread)
- Packetizing (assembling and ordering packets) a whole set: about 1 hour by one editor's account, about 3 hours including manual checks by another's, about 2 hours in a separate guide. — [hsquizbowl: Best Practices in Randomization](https://www.hsquizbowl.org/forums/viewtopic.php?t=21067) (search summary)

**Post-event statistics culture**
- Communities publish conversion statistics after events, for example the 2014 PACE NSC Conversion Stats and the 2018 ACF Regionals "detailed stats survey". — [2014 PACE NSC Conversion Stats](https://www.hsquizbowl.org/forums/viewtopic.php?f=20&t=16134); [2018 ACF Regs stats survey](https://hsquizbowl.org/forums/viewtopic.php?f=9&t=20911) (search summary)
- Science Bowl now has a comparable tool: scibowl.live's MoSS moderating software "records buzzpoint statistics" and needs only one staffer per room. — [scibowl-org README](https://github.com/xpoes123/scibowl-org)

### Inferences
- Cost benchmark (my calculation): at NAQT's 2026–27 rates, writer pay alone for a 640-question set split evenly between tossups and bonuses would be about $5,700 at the base maximum and about $10,000 at the science-plus-consistency maximum, before editing.
  - Science Bowl tossups and bonuses are single short questions, not multi-clue pyramidal paragraphs, so human writing time per question is probably well below quiz bowl's 20 minutes to 2 hours per tossup.
  - I found no Science Bowl writer-hour data.
- In every human model, editing, fact-checking and playtesting take the most time (8+ months per housewrite, editing deadlines before mirrors, dedicated repeat checkers). An LLM pipeline would mainly speed up drafting, which is not the bottleneck. The savings depend on making verification cheap.
- ACF's model (teams submit drafts against an assigned category template; central editors finish them) resembles Rebound's existing "teams add their own packets" feature. A packet-submission incentive (credit or early access in exchange for drafts) could supply human-written seed material.
- NAQT's AI ban matters for Rebound's pipeline design: no NAQT questions may be used as prompts, few-shot examples or fine-tuning data without written permission.

### Gaps
- No current ACF or NAQT editor pay rates found.
- No pay schedule for PACE writers found.
- No cost per finished question (including editing) published by any producer.
- No measured questions-per-writer-hour statistic; only forum anecdotes.
- Exact thread attribution and years for the forum production-rate quotes are unverified (hsquizbowl.org was unreachable).

## 3. Existing Science Bowl question banks, practice tools and AI question generators (with quiz bowl analogs)

### Takeaway
Several free banks already collect real Science Bowl questions:
- SB Reader: about 102,000–104,000 questions from 113 sets, Nov 2026.
- SciBowl.club: 28,000+.
- scibowl.app: 27,000+.
- ISOBowl: 13,000+.
- scibowldb: 7,000+ tossup/bonus pairs.
- scibowl.live: the main invitational packet archive.

Their question text is not openly licensed. SB Reader says the questions belong to their writers and tournaments, and scibowldb has no license file. The AI tools I found explain existing questions (sciencebowler.com, gstavya/sciencebowl-ai) or generate generic quiz bowl or Science Olympiad material (Quizou, YesChat's "Academic Bowl Creator", SciOly Prep). I found no dedicated generator of original NSB-format questions as of Nov 2026.

### Cited Findings
**Science Bowl banks and archives**
- **SB Reader** (sbreader.github.io; maintainer Henry Lu, GitHub UnweidlyKhan349):
  - Size: the README gives "102,395 questions from 113 sets": 55,544 tossups and 46,851 bonuses, or 63,520 short answer and 38,875 multiple choice, including 567 visual questions. Subject counts sum to 103,640, and other versions give 104,246, so counts vary by version.
  - Sources: regional, national and invitational packets (MIT, Stanford, Yale and others), practice sets written by school teams, and hosts including scibowl.live, oly.mehvix.com, OSTI, ISOBowl, scibowldb, the "Periphery" database and Google Drive folders. Years 1993–2026.
  - Licensing: the code is MIT-licensed, but "the questions and figures in `data/` are not covered by the code license… they belong to their writers and tournaments". It did not ingest sciencebowl.org because that site is login-gated and needs its owner's permission.
  — [SB Reader README](https://github.com/sbreader/sbreader.github.io); [tournaments.md](https://github.com/sbreader/sbreader.github.io/blob/main/docs/tournaments.md)
- SB Reader grades answers by rules. Uncertain answers are shown as "Close" for the player to override. A subject model (91% held-out accuracy) placed 1,371 questions that had no printed subject. — [SB Reader README](https://github.com/sbreader/sbreader.github.io)
- **scibowl.live** (GitHub xpoes123/scibowl-org; GPL-3.0; "in active development"; © 2026):
  - A packet archive described as "the largest invitational packet repository in Science Bowl" and formerly called cloud.mehvix.
  - A listing of 2025–26 invitationals.
  - MoSS, its moderating software, with password-unlocked packets and buzzpoint statistics.
  — [scibowl-org README](https://github.com/xpoes123/scibowl-org). SB Reader re-downloaded "all 875" public packets on scibowl.live. — [SB Reader README](https://github.com/sbreader/sbreader.github.io)
- **scibowldb** (GitHub CQCumbers/ScibowlDB; scibowldb.com):
  - Size: "over 7000 pairs of toss-up and bonus questions", with question and answer text separated and tagged by format, subject and source; it also offers an API.
  - Named sources: the official sample sets, the CSUB Regionals set, and the 1998 and 2005 Nationals sets as compiled by New England Science Bowl.
  - The repository has 51 commits and 9 stars.
  — [ScibowlDB GitHub](https://github.com/CQCumbers/ScibowlDB)
  - The repository has no LICENSE file: the URL returns HTTP 404, and no licence shows on the repo page. — [ScibowlDB LICENSE (404)](https://github.com/CQCumbers/ScibowlDB/blob/master/LICENSE)
  - SB Reader lists a "ScibowlDB HW" subset of 2,051 questions. — [tournaments.md](https://github.com/sbreader/sbreader.github.io/blob/main/docs/tournaments.md)
- **ISOBowl** (isobowl.com): advertises "13,000+ real Science Bowl questions" and hosts packets and events. — [ISOBowl](https://isobowl.com/) (search summary); [SB Reader README](https://github.com/sbreader/sbreader.github.io)
- **SciBowl.club** (scibowl.prismsus.org): "28,000+ real tournament questions" from NSB middle school and high school sets and the MIT and Stanford invitationals, with four modes. — [SciBowl.club](https://scibowl.prismsus.org/) (search summary)
- **scibowl.app**: "27,000+ real questions, live buzzer rounds". — [scibowl.app](https://scibowl.app/) (search summary)
- **atombowl** (sciencebowl.org): practice mode, multiplayer rooms, a real-time buzzer and a "fast round generator with visual bonuses". Whether it generates questions with AI is not stated, and it is login-gated. — [atombowl](https://sciencebowl.org/) (search summary); [SB Reader README](https://github.com/sbreader/sbreader.github.io)
- DOE-only browsers:
  - Science Spoon (DOE sample sets, filterable by round and set). — [Science Spoon](https://www.sciencespoon.com/browse.cfm) (search summary)
  - PrepforSTEM/Imlem. — [PrepforSTEM](https://www.prepforstem.com/) (search summary)
  - arnavgarg233/scibowl-reader: "12,023 official HS questions" (Sets 1–17) in a QBReader-style reader. — [scibowl-reader](https://github.com/arnavgarg233/scibowl-reader) (search result title)
- **School-team banks** (in SB Reader): Mira Loma Question Database (15,308 questions), Stuyvesant Question Bank (2,150), Tycho Practice Rounds (501) and Evan Zhong Study Sets (155). Evan Zhong's sets come from an Albany High School question bank app. — [tournaments.md](https://github.com/sbreader/sbreader.github.io/blob/main/docs/tournaments.md); [evanzhong/sciencebowl](https://github-users.yhajoa.workers.dev/evanzhong/sciencebowl) (search summary)
- Dataset: Hugging Face "AarushSah/scibowl_no_headers" (licence not checked). — [Hugging Face](https://huggingface.co/datasets/AarushSah/scibowl_no_headers/viewer/default/train?p=49)

**Bots and utilities**
- **AwesomeSciBo**: a Discord bot offering "randomly generated (non-stock) rounds and training" from existing questions. It credits @CQCumbers' API (ScibowlDB) and has subject-targeted training and a cross-server leaderboard. MIT licence, 413 commits, 27 stars. — [AwesomeSciBo](https://github.com/ADawesomeguy/AwesomeSciBo)
- A "scibowlbot" listing on top.gg says it serves "recycled" Science Bowl questions in nine subjects. I did not verify which listing ID is that bot. — [top.gg listing](https://top.gg/bot/812356927773999126) (search summary)
- Set assemblers, not AI:
  - srangan24/Science-Bowl-Question-Generator, which is Mathematica-based and "accesses online practice questions across several websites and generates a competition set". — [GitHub](https://github.com/srangan24/Science-Bowl-Question-Generator)
  - arxenix/SciBowl-Question-Generator, which serves random existing questions. — [GitHub](https://github.com/arxenix/SciBowl-Question-Generator)
- nsbtoolbox: a formatter that checks questions against the official Science Bowl format, "Version 0.5.2 – Updated for 2024 NSB". — [nsbtoolbox](https://github.com/rishi-kulkarni/nsbtoolbox) (search summary)

**AI-based tools (2023–2026)**
- **sciencebowler.com**: DOE questions across all six subjects, with "on-demand deeper explanations powered by Gemini and Groq". The AI explains questions; it does not write them. — [Science Bowl Study App](https://sciencebowler.com/) (search summary)
- **gstavya/sciencebowl-ai** (MIT licence, 12 commits, 0 stars):
  - What it does: a Gemini/LangGraph practice agent with ChromaDB vector search over official PDFs from 2016–2024, and AI-generated explanations. It does not generate new questions.
  - Quality problem: SB Reader excluded its NSB National Finals livestream "transcripts" (HS 2015–2018 and 2024, MS 2024) because "they are an LLM's reconstruction of speech". In those transcripts "the same 2018 tossups appear twice with different answer choices" and some choices are marked "(incomplete)".
  — [sciencebowl-ai](https://github.com/gstavya/sciencebowl-ai); [SB Reader README](https://github.com/sbreader/sbreader.github.io)
- **Quizou**: "AI-powered scholar bowl practice" that generates "unlimited NAQT-style quiz bowl questions" on a chosen topic. It targets quiz bowl, not the DOE format, and I found no quality reviews. — [Quizou](https://quizou.app/) (search summary)
- **Academic Bowl Creator** (a custom GPT on YesChat): generic AI tossup and bonus questions. — [YesChat](https://www.yeschat.ai/gpts-9t557fZuAd9-Academic-Bowl-Creator) (search summary)
- **SciOly Prep**, an adjacent competition: AI-generated Science Olympiad practice tests. The site itself notes that questions are AI-generated and should be checked for accuracy. — [SciOly Prep](https://sciolyprep.com/) (search summary)
- **Transportist** (blog, Mar 21, 2023): a GPT-4-generated set of quiz bowl practice tossups, posted with "no guarantees of accuracy". A few were flawed. — [Transportist](https://transportist.org/2023/03/21/a-set-of-quizbowl-practice-questions/) (search summary)

**Quiz bowl analogs**
- **QBReader** (qbreader.org): "A text-based quizbowl packet reader with support for both single- and multi-player", with a searchable question database. Its answer checker is published separately as the `qb-answer-checker` npm package. Code is MIT-licensed; 2,484 commits. Question counts and the licence for question data are not stated in the README. — [qbreader/website](https://github.com/qbreader/website)
- **Protobowl** (2012, Kevin Kwok and Ben Vest):
  - Questions live in a separate MongoDB database; public dumps tag entries with `"source":"acfdb"`, meaning ACF packets. — [Protobowl GitHub](https://github.com/neotenic/protobowl) (search summary)
  - Per QBWiki, "the relatively small set of questions in the database at various points in Protobowl's history made memorization feasible". — [QBWiki: Protobowl](https://qbwiki.com/wiki/Protobowl) (search summary)

### Inferences
- Rebound's 23,720 DOE questions roughly match SB Reader's two DOE components: "NSB Regs" (12,015) plus "NSB MS Regs" (11,423) make 23,438. Serious players can already reach about four times as much material elsewhere, so a DOE-only library is the most likely to be memorized.
- Protobowl's memorization problem is the documented quiz bowl precedent for Rebound's worry that practice turns into answer recall.
- The aggregated invitational packets are a large stream of fresh human-written material, but they are not licensed for reuse. SB Reader disclaims ownership of its data, and scibowldb has no licence. Importing them into Rebound would need permission from each tournament. Original generation avoids this, though it needs its own source-data hygiene (no NAQT content, per section 2).
- The niche of a renewable, verified, original NSB-format set appears unfilled as of Nov 2026, though atombowl's "round generator" should be checked to see whether it uses AI.

### Gaps
- I could not open isobowl.com, scibowl.app, scibowl.prismsus.org, sciencebowl.org, sciencebowler.com or quizou.app. Their sizes and features come from search summaries, and their terms of use and licences are unknown.
- No user reviews or quality complaints found for Quizou or any AI Science Bowl tool.
- I could not find a GitHub repository for "scibowlbot", or Discord server counts for any bot.
- Licence of the Hugging Face scibowl dataset not checked.
- I could not verify whether DOE sample-set text is public domain (it is likely, as US federal government work, but that is an inference and the official-NSB researcher's scope).

## 4. Community reception of, and policies on, AI-written questions

### Takeaway
In quiz bowl, the most vocal community opinion (hsquizbowl essays and threads, 2020 to about 2025) is hostile to AI-written questions: they are called error-prone, clichéd and inauthentic. A minority would accept them if quality matched human work. At least one planned online tournament written entirely by AI (COVID era, unnamed) drew backlash. Formal rules so far restrict feeding content to AI and AI-assisted writer applications: NAQT 2026–27, and the Long Island Quiz Bowl Alliance's writing guide. No governing body bans AI-drafted sets outright. I found no Science Bowl–specific AI policy or Reddit discussion.

### Cited Findings
**Forum opinion**
- The "Opinion: Using AI to write Quizbowl Questions is a Bad Idea (an Essay)" thread (undated in the results; its topic ID suggests late 2024 to mid 2025):
  - The essay calls using AI to write questions "completely unacceptable" and says "AI generated questions are just bad". AI is "bad at fact checking, and leaves incorrect information in questions", and ChatGPT's wording can be awkward for players.
  - In a test, prompting ChatGPT for Harry Truman questions gave very similar results, "almost always with 'the buck stops here' as the first line".
  - The essay asks why editing an AI draft up to standard beats having a competent human write the question in the first place.
  - A reply would "not necessarily be opposed" to an AI-written tournament if quality equalled human-written questions. Another concern raised is that teams may start doubting whether questions were really written by a human.
  — [hsquizbowl t=28977](https://hsquizbowl.org/forums/viewtopic.php?t=28977) (search summary)
- One commenter said that if they found out a tournament they had played was written with an LLM, they would want their money back. A post recalls that "a planned (free) online tournament during the COVID era got a lot of flak since it was to be entirely written by AI"; the tournament is unnamed and the account second-hand. — [hsquizbowl t=28977](https://hsquizbowl.org/forums/viewtopic.php?t=28977); [hsquizbowl t=27978](https://hsquizbowl.org/forums/viewtopic.php?t=27978) (search summary; I could not tell which thread holds each post)
- "Quizbowl in 2044" (about 2024):
  - Generative AI is seen as useful in parts of writing and editing, but editors and quality control remain necessary. One poster says this is "already feasible with today's tech and a well-prompted model".
  - One poster predicts middle school and "A" sets will be "all AI-written with light human editing" because they reuse clues, and says generative questions have "almost certainly already made their way into tournaments". These are speculative, with no documented case.
  - Fully AI-written questions are compared to processed junk food: cheaper but thin.
  — [hsquizbowl t=27978](https://hsquizbowl.org/forums/viewtopic.php?t=27978) (search summary)
- "GPT3 for Quizbowl" (2020): GPT-3 invents facts and presents them confidently, so every generated line needs checking. A model fine-tuned on quiz bowl questions might do better. — [hsquizbowl t=24281](https://hsquizbowl.org/forums/viewtopic.php?t=24281) (search summary)
- A quiz bowl blog argues that an editor who knew AI questions were in a set would spend far more time editing it than otherwise. — [dekidder substack, "Week 220: considering AI's hallucination"](https://dekidder.substack.com/p/week-220-considering-ais-hallucination) (search summary)

**Written policies**
- NAQT (2026–27): no NAQT content may go into LLMs or other AI software without written permission. Writer-application samples must be written without AI tools. — [NAQT 2026–2027 changes](https://www.naqt.com/articles/2026-2027-changes.jsp); [NAQT jobs](https://www.naqt.com/jobs/) (search summary)
- The Long Island Quiz Bowl Alliance's writing guide says AI "should not be used during the writing process, whether it be for question ideation, research, or writing itself", because it is "often wrong". — [LIQBA: Writing Questions](https://liqba.com/writing-questions/) (search summary)
- A search result on pace-nsc.org titled "AI Question Writing Guide" says "any responsible writer or editor should always vet every single piece of information obtained from an LLM" and "Generative AI produces results of varying quality". A later search limited to the PACE site did not find the page, so it is unverified. — [pace-nsc.org/?p=1913](https://www.pace-nsc.org/?p=1913) (search snippet only)
- A search on bans found no tournament-wide ban on AI-written sets by NAQT, ACF or PACE; the NAQT rule restricts inputs, not AI drafting. — [NAQT 2026–2027 changes](https://www.naqt.com/articles/2026-2027-changes.jsp) (search summary)

**Evidence on how well AI handles questions**
- A 2026 University of Maryland feature reports that an AI system answered a recent quiz bowl set with 70% accuracy against about 55% for humans, but that "AI is far too confident in its authoritative pronouncements". — [Terp: Can AI and people play nice?](https://terp.umd.edu/can-ai-and-people-play-nice) (search summary)
- SciFaultyQA benchmark: GPT-4o detected only 16% of deliberately flawed science questions, Llama 3.1 12% and Gemini Flash 6%. — [SciFaultyQA summary (arXiv 2412.11988)](https://pith.science/paper/2412.11988) (secondary summary)
- Frontiers in Education (2026), on computer science multiple-choice items: no significant psychometric difference between human- and LLM-authored items, but students scored significantly lower on the LLM-authored ones, and the generation procedure mattered. — [Frontiers in Education 2026](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2026.1837523/full) (search summary)
- PyraModel (UMD, Fall 2023, with Jordan Boyd-Graber): fine-tunes Llama 2 as a regression model to judge quiz bowl question quality, toward computational question crafting. — [PyraModel paper](https://www.cs.umd.edu/sites/default/files/scholarly_papers/Fall_2023_Bolouri_Arman_Scholalry_Paper.pdf) (search summary)
- A Science Bowl data incident: LLM-reconstructed NSB finals transcripts in gstavya/sciencebowl-ai contain the same 2018 tossups twice with different answer choices, so SB Reader excluded them. — [SB Reader README](https://github.com/sbreader/sbreader.github.io)

### Inferences
- The objections are about paid tournaments and human authorship ("the humanity of quiz bowl"). A free practice tool that clearly labels questions as "AI-drafted, human-verified" and keeps them out of competition use avoids the money-back and authenticity complaints. It still faces the factual-error and cliché complaints.
- LLMs rarely catch flawed science questions when asked (SciFaultyQA). Verification should therefore not rely on the same model checking itself; it needs independent solving, computation, retrieval or human review.
- The "same opening clue every time" Truman example suggests a specific risk for renewable sets: an LLM recycles the same canonical facts. That would recreate the memorization problem the project is trying to solve unless prompts force diversity and the pipeline deduplicates against the existing bank.

### Gaps
- No r/ScienceBowl or Science Bowl Discord discussion of AI-written questions surfaced (Reddit could not be reached directly).
- No Science Bowl invitational (MIT, Stanford, Berkeley and others) has a published AI policy for writers, as far as I could find.
- No named, documented tournament that used LLM-written questions, and no post-event error report from one. The COVID-era case is second-hand.
- Exact dates and authors of the hsquizbowl posts could not be verified.

## 5. Lessons on quality: common failure modes, measuring difficulty, and how much editing a good set needs

### Takeaway
The best Science Bowl–specific evidence is SB Reader's audit of about 102,000 community questions. It found:
- 2–3% wrong or unusable questions in tournament packets, rising to 8% in math, physics and chemistry;
- 6–7% in school-team practice sets;
- many duplicate questions with conflicting keys, multiple-choice letters that contradict the answer text, missing figures, and notation lost in extraction.

Quiz bowl measures difficulty after play: points per bonus (PPB) of about 20/15/10 for top/median/bottom teams, bonus-part conversion targets of 90/50/15%, and power rates. Its practice is long editing cycles and playtesting. Editor-written questions behave more predictably than submitted ones.

### Cited Findings
**Measured error rates in human-written Science Bowl sets (SB Reader, November 2026)**
- Tournament-packet sets: two random reads on Nov 11, 2026 (159 questions across subjects, then 273 math, physics and chemistry questions) "found 23 wrong keys and 10 unusable questions… about 2–3% across subjects and 8% in the worked subjects". The maintainer estimates "roughly a thousand wrong or unusable questions are still in the 18,000 that have not been read". — [SB Reader README](https://github.com/sbreader/sbreader.github.io)
- School-team sets (Mira Loma, Stuyvesant, Tycho, Evan Zhong): "in two random reads of 400 questions each… about 6–7% had a wrong key or couldn't be used", with "roughly 1,000–1,400 such questions" likely still unread. — [SB Reader README](https://github.com/sbreader/sbreader.github.io)
- Other defects found:
  - 33 multiple-choice letters that disagreed with their answer text.
  - 58 groups of identical questions keyed differently.
  - 492 records whose accept-lists were shorter than their keys (Oct 27, 2026); 368 were rewritten.
  - 92 stems cut short.
  - Questions printing one choice twice, in CSUB, ICSBT 2025 and NESB. Even official DOE "NSB Regs Set 7 Round 10 repeats one choice".
  - Visual bonuses published without figures (SBST, LOST 2, ESBOT 2, FE!M 2025, ICSBT 2025, Texas 2026 and others).
  — [SB Reader README](https://github.com/sbreader/sbreader.github.io)
- PR #27 (merged Nov 4, 2026):
  - 210 duplicate records removed (103,853 → 103,640), including Mira Loma re-uploads, one of which had a wrong photoelectron key (40 instead of 37).
  - 11 wrong keys corrected from the question text.
  - One WSBT question removed "because its key needed a formula the question never gave".
  - 32 multiple-choice math sets written as they would be read aloud (for example "5 root 5") rewritten as math.
  - Glued item markers and wrong stated item counts fixed.
  — [SB Reader PR #27](https://github.com/UnweidlyKhan349/sbreader/pull/27)
- Answer-checking failures in the same PR:
  - Numbers were compared digit by digit, so "5.4" passed for "4.5 METERS".
  - After the fix, "1,122 wrong answers now fail and 279 right ones now pass".
  - 1,428 short answers now pass when the unit is written another way.
  — [SB Reader PR #27](https://github.com/UnweidlyKhan349/sbreader/pull/27)

**Official and older baseline complaints**
- DOE's 2026 Regional Coordinators' manual says that although questions get expert review, errors, omitted words and formatting issues still turn up "almost every week". Regional sites are told to have their own experts review questions beforehand. — [2026 NSB Regional Coordinators' Reference Manual](https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/NSB-Coordinator-Manual.pdf) (search summary)
- Older hsquizbowl complaints about Science Bowl questions (probably pre-2020): an answer accepted against the printed key (an "Aurora Australis" case), nationals questions "too hard", odd answer choices, and ambiguous multi-clue questions that make protests legitimate. — [hsquizbowl: Science Bowl (format discussion)](https://www.hsquizbowl.org/forums/viewtopic.php?t=3520); [hsquizbowl: Science Bowl](https://hsquizbowl.org/forums/viewtopic.php?t=18113) (search summary)
- A 2010 Mira Loma coaching handout called Science Bowl questions trivia-based and often built on Wikipedia-level sources. — [Mira Loma, "How to Improve Science Bowl" (2010)](https://resources.finalsite.net/images/v1623697741/bvsdorg/hkit1fwjpg6b5zylw0my/55383.pdf) (search summary)

**How difficulty is measured (quiz bowl)**
- PPB tiers: the best teams should convert about 20, most teams about 15 and weak teams about 10. Many teams over 20 means the set was too easy for the field; many single-digit teams means it was too hard. — [QBWiki: Bonus conversion](https://www.qbwiki.com/wiki/Bonus_conversion); [hsquizbowl: "Regular" High School Difficulty](https://hsquizbowl.org/forums/viewtopic.php?t=11456) (search summary)
- Power rate: 15–20% is cited as NAQT's target, but one commenter says median HSNCT and SCT power rates cluster around 20–25%. — [hsquizbowl: 2018 ACF Regs stats survey](https://hsquizbowl.org/forums/viewtopic.php?f=9&t=20911) (search summary)
- Bonus-part targets: about 90% / 50% / 15% conversion for easy, medium and hard parts. Real-set analysis found medium parts at about 50% and hard parts at about 15%. — [hsquizbowl: What's an Easy Part at Regular Difficulty?](https://hsquizbowl.org/forums/viewtopic.php?t=14164) (search summary)
- Questions written by editors show a lower standard deviation in average buzzpoint and conversion than submitted questions. — [hsquizbowl: 2018 ACF Regs stats survey](https://hsquizbowl.org/forums/viewtopic.php?f=9&t=20911) (search summary)
- Caveat: statistics such as PPB, power rate and buzzpoint average "describe how well the field did", not absolute difficulty. — [QBWiki: Difficulty](https://www.qbwiki.com/wiki/Difficulty) (search summary)

**How much editing and playtesting**
- Housewrites: at least 8 months after assembling a team, with every question edited 4 weeks before the first mirror. — [hsquizbowl t=26915](https://www.hsquizbowl.org/forums/viewtopic.php?t=26915) (search summary)
- PACE: replace clues that playtesters flag, assign a repeat checker and a length/difficulty editor, and track each question's stage. — [PACE set-writing guide](https://www.pace-nsc.org/resources/so-you-want-to-write-a-question-set/); [PACE: Getting Questions](https://www.pace-nsc.org/resources/getting-questions-for-your-tournament/) (search summary)
- MIT: more than 1,000 drafts from about 30 writers, plus a playtest at a smaller collegiate tournament, for a set of 600–950 questions; errata are collected after release. — [The Tech, Dec 2025](https://thetech.com/2025/12/11/science-bowl-tenth-anniversary) (search summary); [MIT Resources](https://www.mitsciencebowl.com/high-school/resources) (search summary); [SB Reader tournaments.md](https://github.com/sbreader/sbreader.github.io/blob/main/docs/tournaments.md)

### Inferences
- These rates give a human baseline an AI pipeline can be judged against: about 2–3% wrong or unusable overall for tournament sets, about 8% in calculation-heavy subjects, and 6–7% for school-team sets.
- Most defects are in the answer key or format, not in the stem. That suggests where the pipeline's checks should go:
  - solve each question independently and compare with the key, computing math, physics and chemistry answers;
  - check that each multiple-choice letter matches its answer text;
  - check that stated item counts match the list;
  - check units and numeric tolerance;
  - deduplicate against the whole bank, including conflicting keys on near-duplicates;
  - for visual questions, check that the figure is present.
- MIT's ratio of more than 1,000 drafts to a final set of 600–950 suggests skilled human volunteers keep most drafts after editing. No rejection rate is published.
- Rebound already records practice attempts. It can measure each generated question after release, like quiz bowl conversion statistics: tossup conversion rate, bonus conversion rate, buzz timing and how often players override "Close" answers. It can then retire or re-level outliers (near 0% or 100% conversion, or high dispute rates) instead of guessing difficulty before release.
- Difficulty targets for Science Bowl would have to be set from Rebound's own data. Quiz bowl PPB tiers do not carry over directly, because NSB bonuses are single questions, not three parts.

### Gaps
- No published conversion or difficulty statistics for any Science Bowl invitational were readable here. The Texas 2026 "Statistics" link and MoSS buzzpoint data exist, but I could not open them.
- No measured error rates for official DOE sets, apart from the coordinator manual's "almost every week" remark and individual defects SB Reader found.
- No published rejection or editing rates (drafts in versus questions out) for MIT, Stanford, NAQT, ACF or PACE.
- No hands-on measurement of AI-generated Science Bowl question error rates exists in public sources. Rebound's pilot (a separate task) would be the first data point.
