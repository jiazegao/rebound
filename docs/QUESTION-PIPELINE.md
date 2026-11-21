# Plan: the pipeline that writes Rebound's own practice rounds

Status: a proposal, written 21 November 2026. Nothing in it is built yet. It turns the findings of the research report, [Generated Science Bowl rounds pass accuracy, fail originality](../reports/Making%20Science%20Bowl%20questions%20at%20scale.md), into a design that can be built step by step.

## In brief

The pipeline fills a round template with new questions in eleven steps and hands a person a finished round to sign off. Its order follows the pilot's main lesson: a model writes correct questions easily and new ones with difficulty. So the pipeline checks short *ideas* against the library before it writes anything, runs the free code checks before the paid ones, and gives originality, difficulty and freshness checks of their own.

- **What it makes.** Rounds in NSB format, labelled as Rebound originals. They go out first as private team packets, which work today with no change to the site.
- **What is new since the pilot.** An idea screen; a duplicate screen that compares answer and cue instead of wording; a source for every fact; a second blind solver; a difficulty gate; rules for assembling a round; and a review sheet for the person who signs off.
- **One part is already measured.** A plain keyword search plus a same-answer list put the matching DOE question in front of the judge for 61 of the pilot's 63 labelled matches, including all 55 strict duplicates. The screen needs no extra model or service to find its candidates.
- **Cost.** About $5–$7 of model calls per 23-pair round. A leaner setup costs about $2.50 and a pessimistic case about $14. The reviewer's time, a guessed 45–90 minutes a round, is the real limit on volume.
- **Order of work.** Foundations that cost nothing; then the model steps, tested on DOE's own questions; then a second pilot aimed at hard late-round questions; then the first team rounds; then a season's results before anything enters the public library.
- **What I need from you.** Five decisions, listed next. None of them blocks the first stage of building.

## Decisions I need from you

| # | Decision | What I recommend | Why | Needed before |
|---|---|---|---|---|
| 1 | How the model calls are paid for and run | A Claude API key with a monthly spending cap, used by scripts in this repository | Each call then contains only what that step may see, so the blind solver really is blind. Every prompt, model and token count is recorded, and half-price batches work. A cap of about $50 a month covers every stage up to one round a week. The alternative is to run each step inside Claude Code sessions as the pilot did: no key to set up, but weaker separation between writer and checker and no batch price | Stage B |
| 2 | Whether to add a checker from another model family | Yes for the second pilot, then keep it only if it catches something | The pilot's writer and checker were both Claude models, and both checkers named shared blind spots as their main limit. It needs a second provider's API key | Stage C |
| 3 | Who signs off rounds | One person per round who then reads it to the team instead of playing it: you, your coach or an alumnus | Team packets have no recorded voice. When a round is played in person someone reads it aloud anyway, and making that reader the reviewer spoils the round for nobody else | Stage D |
| 4 | Where unreleased questions are kept | A private GitHub repository beside this one | `jiazegao/rebound` is public. A round pushed here could be read by anyone, your own players included, before it is played. The pilot's two rounds, on the research branch, can already be read that way | Stage D |
| 5 | Whether generated rounds may ever leave a team | Decide after a season of team rounds, not now | Rebound's proposal says AI-written questions "never leave the team" ([PROPOSAL.md](PROPOSAL.md), sections 8 and 10). A public library of them changes that policy | Stage F |

Two defaults I will assume unless you say otherwise. The pipeline starts with your own team's level only, because rounds for the other level need a team to review and play them. And a round has 23 pairs, the in-person regional size: four per category and three for Energy. Its first 18 pairs are a complete virtual-format round.

## What the pilot found, and what the pipeline does about it

| Finding | Evidence | What the pipeline does |
|---|---|---|
| Nearly half the drafts repeated a DOE question | 33 of 72 first drafts (46%) and 22 of 59 replacements (37%) asked for a DOE answer from DOE's cue. Only 55% of what was written was kept | Screens one-line ideas before writing (step 3) and the finished text again (step 6). Shows the writer the cues already used |
| Rebound's duplicate check misses paraphrases | SimHash flagged 0 of 41 matched pairs. Three duplicates survived the writer's own clean-up | A new screen: find library questions by answer and by keywords, then a model judges whether the fact and cue are the same |
| A writer checking its own work keeps choosing the obvious cue | All three surviving duplicates were themselves replacements | The judge is never the writer, and each judgment sees the actual DOE questions |
| Keys were right, on easy questions checked by a sibling model | 0 of 72 generated keys wrong; 2 of 36 DOE controls wrong | Two blind solvers, a recomputation in code, a source for each fact, and a random re-check of questions that passed |
| Questions came out too easy | Rated 1.94 against 3.43 (HS) and 3.17 (MS) for DOE's rounds 11 and later | Each slot has a difficulty tier. A rater that is not the writer gates it. Real play decides in the end |
| Facts can be out of date | 5 of 12 Energy questions named a lab renamed in December 2025. None of 11 claims about lab research was checked | Energy questions are written from dated lab news. A table of current lab names is checked by code |
| Style gave the source away | Choices of 3.5 words against DOE's 1.6; the right choice longest in 5 of 15; half the first-draft keys on X | House-style checks built from DOE's measured style, with automatic shuffling of choices |
| A round can fail as a whole | Three of six HS Energy questions were about neutrons, and each passed alone | Assembly rules for topic variety, format mix and difficulty (step 9) |
| The checkers' own flags were noisy | One checker flagged 29 of 54 questions and withdrew 18 | A flag sends a question to a closer check. Only a failed check or the reviewer rejects one |

Sources: [pilot generation note](../research_notes/Making%20Science%20Bowl%20questions%20at%20scale/pilot-generation.md), [HS verification](../research_notes/Making%20Science%20Bowl%20questions%20at%20scale/pilot-verification-hs.md), [MS verification](../research_notes/Making%20Science%20Bowl%20questions%20at%20scale/pilot-verification-ms.md).

## The pipeline at a glance

The "drafts per kept question" column is the planning assumption for how much each step lets through. The second pilot replaces it with measured numbers.

| # | Step | Done by | A question fails here when | Drafts per kept question |
|---|---|---|---|---|
| 1 | Plan the round | Code | — | — |
| 2 | Propose ideas | Writer model | — | 3.0 ideas |
| 3 | Screen the ideas | Search, then a small model | the fact and cue are already in the library or the bank | 1.5 ideas |
| 4 | Write the question | Writer model | — | 1.5 |
| 5 | House-style checks | Code | it breaks a format or style rule and one repair does not fix it | 1.35 |
| 6 | Screen the finished text | Search, then a judge model | it matches a library or bank question after all | 1.2 |
| 7 | Independent checks | Two solver models, code, web sources | the key is disputed, a second answer is defensible, or no source supports the fact | 1.1 |
| 8 | Rate the difficulty | Rater model | it does not fit its tier and fits no other open slot | 1.05 |
| 9 | Assemble the round | Code | it is left over (it becomes a spare) | 1.0 |
| 10 | Sign-off | A person | the reviewer rejects it | — |
| 11 | Release, then track | Code and the site | players' reports or results show a problem | — |

Three kinds of question take slightly different routes through steps 2 to 7:

- **Fact questions** (most of Biology, Chemistry, Earth and Space, and Physics theory). The writer works from its own knowledge, and step 7 finds a source afterwards.
- **Computation questions** (about 28% of high school questions, mostly Math and Physics). The key is computed by running code when the question is written, and again, blind, in step 7. No source is needed.
- **Energy questions.** Each is written from one dated news item from a DOE lab, so the lead-in is true and current. The answer still rests on ordinary science.

## Built once: the foundations

These are the parts every run depends on. All but the last need no model calls.

**A style profile.** One file of measured numbers from DOE's 2019–22 sets, by level, category and toss-up or bonus: the share of multiple choice, of numeric answers, of "Identify all" and "Rank" questions, of ACCEPT lines and of pronunciation guides, and the median and 90th-percentile lengths of stems and choices. The research already measured these ([format note](../research_notes/Making%20Science%20Bowl%20questions%20at%20scale/nsb_format_and_style.md), Table D). A script will recompute them so the file can be rebuilt when the library changes. Steps 1, 5 and 9 read it.

**Library search.** Two lookups over all 23,720 DOE questions, plus every question the pipeline has ever kept:

- a same-answer list: library questions whose answer equals, contains or shares half its words with the candidate's answer;
- a keyword search (BM25, a standard ranking by shared uncommon words) over each question's stem, choices and answer.

I tested both on the 63 pairs the pilot labelled as matches. Taking the top 20 from each list:

| Labelled pairs | Pairs | Match found in the top 20 |
|---|---|---|
| Drafts the writer replaced as duplicates | 41 | 41 |
| Candidates the writer rejected before use | 11 | 11 |
| Duplicates the checkers found in the final rounds | 3 | 3 |
| Same template with new numbers or a reversed cue (checkers) | 8 | 6 |
| **All** | **63** | **61** |

The keyword search alone found 59, and the same-answer list alone 46. One caution: the writer found its 52 pairs with word-based methods much like these, so only the checkers' 11 are an independent test. The script and its output are in [plan/measurements.py](../research_notes/Making%20Science%20Bowl%20questions%20at%20scale/plan/measurements.py) and [measurements.txt](../research_notes/Making%20Science%20Bowl%20questions%20at%20scale/plan/measurements.txt). The search only finds candidates; whether the judge model then decides correctly is not yet tested, and Stage B tests it.

The same script shows why duplicates are a matter of cue, not of a few overused answers. The high school library's 3,656 word-answer questions use 2,804 different answers, and only 36% of them share an answer with another question (47% at middle school). So a draft can usually escape a duplicate by choosing a different fact or cue, and the screen can afford to be strict.

**A table of the national labs** with each lab's current official name, its former names and its news page. Code rejects a former name and suggests the current one. The table is checked every quarter, since the pilot's five outdated questions all came from one rename.

**Source lists.** One list of sites whose text may be given to a model or read by one during a check: U.S. government pages first (NASA, NOAA, USGS, NIH, NIST, EIA, DOE and its labs), then encyclopedias and university pages for facts only. One list of sites that may never be used: OpenStax, whose license does not allow putting its books into AI tools (Rebound's server already refuses it, in [server/src/ai.ts](../server/src/ai.ts)); NAQT; and every question bank and community packet. Unreleased official questions are never used in any form (Rule 1-2).

**Test sets that stay fixed.** They are used to check every prompt or model change before it is trusted:

- the 63 labelled pairs above, plus the pairs the pilot judged *not* to be duplicates;
- DOE questions with keys known to be wrong: the two the pilot found, and the seven misprinted answer letters Rebound's importer corrected;
- a sample of DOE questions from rounds 1–10 and rounds 11–17, for the difficulty rater.

**A pass over DOE's own questions.** This is the report's first rollout step, and it also calibrates the checkers. It starts with a sample of about 1,200 questions, spread evenly over level, tier and category. Each is solved blind and rated for difficulty. The sample answers four questions before real money is spent: how often a solver disagrees with a correct DOE key (the false-alarm rate); whether solvers catch the known wrong keys; whether the difficulty ratings separate DOE's early rounds from its late ones; and what a call really costs. If the answers are good, the whole library follows in one half-price batch, and its disagreements become a list of possible errata for a person to review. That review is separate work and does not hold up the pipeline.

## The steps in detail

### 1. Plan the round

Code fills a template of slots from the style profile, using a seed so the same plan can be rebuilt. A slot says: level, tier (early, like DOE rounds 1–10, or late, like rounds 11–17), category, toss-up or bonus, form (multiple choice, short answer, "Identify all" or "Rank"), skill (recall, application or computation), topic, and for multiple choice the letter the key should land on.

- **Order and counts.** The six-category cycle of DOE's 2021–22 sets (Biology, Chemistry, Earth and Space, Energy, Math, Physics), run four times with Energy left out of the last pass. Each bonus is in its toss-up's category.
- **Form and skill.** Drawn per category from the profile. For example, high school Math is about 9% multiple choice and 85% numeric; high school Physics bonuses are 65% numeric; about 20% of high school bonuses are "Identify all". As a starting target of our own, at least half the non-computation slots in a late round ask for application, not recall, because recall cues are the ones DOE has used up.
- **Topics.** Drawn in proportion to each topic's share of DOE's questions in that category, with extra weight on the thin topics the research listed (nuclear chemistry, equilibrium, kinetics, the grid, solar, fluids, and middle school chemistry). No topic appears more than twice in a round.
- **Energy.** Each Energy slot is given one unused news item (see step 2).

### 2. Propose ideas

For each slot the writer proposes three ideas. An idea is three short lines: the answer, the fact being tested, and the cue, meaning how the question will point at the answer. For a computation it also names the method and the numbers.

The prompt gives the writer the slot, a description of the tier, a few DOE questions of that tier as examples of level, and the list of answers the library already uses in that topic. It asks for answers that are not on the list, or for a clearly different cue when an answer is reused. The tier descriptions start from DOE's own guide: AP-level textbooks for high school regionals, and grade 6–8 science with algebra for middle school. Late rounds reach toward the next level up, as DOE's do.

Energy ideas start from a news item. A small collector gathers recent items from DOE and lab news pages: lab, date, link, and a two-sentence summary of the research. Items older than two years are dropped. The idea must turn on the science behind the item, never on the news itself, as DOE's own Energy questions do.

### 3. Screen the ideas

Each idea is looked up with the library search, and a small model judges it against the forty or so questions the search returns. It answers with one of five classes:

| Class | Meaning | Example from the pilot | Outcome |
|---|---|---|---|
| Same | The same answer from the same cue, or the same computation with the same numbers | The outer core as Earth's liquid layer | Dropped |
| Reversed | The same fact with question and answer swapped | "Metals that can be hammered into sheets are called…" against "Which is a property of metals?" | Dropped |
| Template | The same method with new numbers or objects | The angle sum of a decagon, where DOE asked an octadecagon | Kept for computation, within the cap in step 9 |
| Related | The same answer or topic, a different fact or cue | The pulmonary artery carrying oxygen-poor blood, where DOE asks which vessel carries oxygenated blood | Kept |
| New | Nothing close | | Kept |

Ideas are also compared with each other and with everything already in the bank. The best surviving idea for each slot goes on, with one spare.

This step is where the pilot's largest waste is removed. Its lichen question reached the final middle school round although DOE asks which two organisms form a lichen. Here that idea would meet the DOE question as one line of text, before anything is written or checked.

### 4. Write the question

The writer turns each idea into a full question in the slot's form. The prompt holds the house-style rules, the answer conventions of Appendix A of the rules, and the DOE questions found in step 3 marked as cues already used. The reply is structured data, not free text:

- the stem, with pronunciation guides in brackets;
- for multiple choice, four choices and the letter; otherwise the answer with its ACCEPT and DO NOT ACCEPT lists;
- one line saying why the answer is right, and for multiple choice one line per wrong choice saying why it is wrong;
- for a computation, the worked steps, with the key computed by running code, not by the model's arithmetic;
- for Energy, the lead-in sentence and the news item it rests on;
- whether the fact could change with time.

Showing DOE questions to the writer has a known risk: a model can copy what it is shown. Step 6 exists partly to catch that.

### 5. House-style checks

All of this is code and costs nothing. It reuses the Write studio's `checkWritten` and the answer checker ([studio.ts](../src/core/studio.ts), [judge.ts](../src/core/judge/judge.ts)) and adds rules taken from DOE's measured style.

Fixed automatically:

- choices that are not numbers are shuffled so the key lands on the slot's letter;
- numeric choices are put in order;
- the answer line is rebuilt from its parts, in capitals;
- apostrophes, minus signs and subscripts are made consistent with the library.

A question fails when:

- the Write studio reports an error: two choices would be accepted as right, an answer is not in simplest form, a bracket is unmatched;
- the answer checker does not accept the key or an ACCEPT entry, or does accept a DO NOT ACCEPT entry or a wrong choice;
- a multiple-choice stem does not end in a question mark, or a choice is "all of the above", "none of the above", "both" or "neither";
- an "Identify all" or "Rank" question departs from DOE's fixed wording and numbered list;
- the key's words appear in the stem, including inside a lab's name (the pilot's "Princeton Plasma Physics Laboratory" with the answer "plasma");
- the right choice is half again as long as the next longest, or any choice carries a "because" clause;
- the stem is more than a quarter over the 90th-percentile length for its category;
- a lab is named by a former name, or an Energy question has no dated source;
- the wording is tied to a date ("currently", "the newest", a year) with no date recorded for it.

A failed question goes back to the writer once with the messages. A second failure drops it.

These thresholds are tested before use. At least 95% of DOE's own unflagged 2019–22 questions should pass, and the pilot's first drafts with known faults should fail.

### 6. Screen the finished text

The same search runs on the full question, and a stronger model than in step 3 gives the same five classes. Near-copies are rejected without asking a model: a SimHash distance of 9 bits or less, as the studio uses today, or 30% of three-word sequences shared with a library question.

Before it is trusted, the judge must flag at least 52 of the 55 strict labelled pairs and pass at least four in five of the pairs the pilot judged different. A wrongly rejected draft costs a few cents; a missed duplicate costs a spoiled question.

### 7. Independent checks

Four checks, none of which sees the writer's reasoning.

- **Blind solve.** Two solvers get only what a player hears: the stem and, for multiple choice, the choices. Neither is the writer's model, and the second comes from another model family if decision 2 allows. Each returns its answer, every answer it thinks could be defended, the seconds a strong player would need, and any problems it sees. Rebound's answer checker compares each answer with the key. This is the step that caught DOE's two wrong keys.
- **Recompute.** For every numeric answer, a solver with a code tool works the problem blind, and the result must equal the key in exact form. It also checks that the given values are possible together. One DOE control gave a gas a density it could not have.
- **Source.** For every fact question, a model with web search, limited to the allowed sites, looks for support. It must return a link and the supporting words. The words kept are the search tool's own citation, up to 150 characters taken from the page, not text the model types out. For Energy it also confirms the lead-in against the news item.
- **Second look.** Any disagreement, flag or missing source goes to a stronger model with search. It rules that the key is right, that the key is wrong, or that the question is ambiguous. An ambiguous question may be repaired once, for example with an added ACCEPT line, and then repeats steps 5 to 7. Anything else is dropped.

A question passes when both solvers agree with the key, neither names a second answer the checker would reject, the recomputation or the source agrees, and no flag is left open.

One question in ten that passes gets the second look anyway, from the stronger model. Agreement between similar models is weak evidence, and this sample measures how often they are wrong together.

### 8. Rate the difficulty

A rater that is not the writer scores each question from 1 to 5 for its level, with DOE questions of known tier beside it as anchors. A question is accepted for its tier when its score falls where the middle half of DOE's questions of that tier fall. One that fits the other tier moves to an open slot there. The solvers' estimates of time catch computations too long for 5 seconds on a toss-up or 20 on a bonus.

This check is used only if the DOE sample shows the rater can tell DOE's early rounds from its late ones. The research found that models judge difficulty poorly, especially for hard questions. If the rater fails that test, difficulty rests on the tier descriptions, the reviewer and real play.

### 9. Assemble the round

Code picks one question per slot under rules that no single-question check can apply:

- no two questions with the same answer or key term, and at least four topics among each category's questions;
- a toss-up and its bonus do not test the same fact;
- key letters W to Z each hold between 15% and 35% of the multiple-choice keys;
- the right choice is the longest in at most a third of non-numeric multiple-choice questions;
- at most one question with NOT in the stem;
- at most half the computation questions reuse a DOE template, and none shares DOE's numbers;
- the mean difficulty rating is within a quarter point of DOE's mean for the tier, and a late round has some questions rated 4 or more;
- median stem lengths are within a fifth of the profile's.

An empty slot first relaxes its form, then asks steps 2 to 8 for more, twice at most. Leftover questions that passed everything are kept as spares, at least one per category.

### 10. Sign-off by a person

The reviewer gets one page per round. For each question it shows:

- the question as it will be read, the answer line, and the slot it fills;
- why the answer is right: the source's passage with its link, or the worked computation;
- what the checks found: both solvers' answers, the flags raised and how they were settled, the difficulty score;
- the three closest DOE questions, with the judge's reason for calling them different;
- four buttons: approve, approve with an edit, reject with a reason, or unsure.

"Unsure" swaps in a spare. An edit re-runs the code checks at once, and an edit that changes the stem's meaning, the choices or the answer sends the question back through step 7. The page times each question, because nobody has measured how long this review takes and that number sets the pipeline's real capacity.

The page is a single file that works offline and saves the decisions to a small file the pipeline reads back. A round is released only when every question in it is approved.

### 11. Release, then track

**Release.** The round is written as an NSB-JSON packet, the format the pilot's files already used, and uploaded under Team → Packets. Each question carries a note: "Rebound original: written with AI and checked by a person. Not an official National Science Bowl question." A printable reader's copy can be made with the existing .docx export.

**Track.** After a round is played, three signals come back:

- **Reports.** Rebound's "Report a problem" button saves a report that teammates can see, but today it appears only under Library questions, not in a team's packets. Until it is added there (see the site changes below), players tell the reviewer. Every report on a generated question is reviewed.
- **Results.** Each player's first answer to each question, compared with the same players' first answers to DOE questions of the same subject and tier.
- **Overrides.** How often players overrule the answer checker on a question, which points at a missing ACCEPT line.

A confirmed error retires the question or corrects it. The record keeps the history either way.

## Records, ids and labels

- **Bank ids.** Every question that reaches step 4 gets a permanent id such as `rb-hs-000123`, never reused. A corrected typo keeps the id with a new revision number. A changed question gets a new id.
- **The ledger.** One line per question: its slot, its idea, its text, its sources, the result of every check with the model and prompt version that produced it, the token counts, the reviewer's decision and time, where it was released, and what play showed. Each check records the exact text it ran on, so a question whose text changed afterwards cannot be released on stale checks.
- **Where it lives.** Pipeline code, prompts, the style profile, the lab table and the test sets go in this repository, which is public. Runs, the ledger, review pages and unreleased rounds go in the private repository (decision 4).
- **In the packet.** Each question carries its bank id, its sources and its reviewer in an `x-rebound` field, the prefix [NSB-JSON](NSB-JSON.md) reserves for a program's own fields. The upload renumbers questions as `team-<packet>-r01-t01`, so this field is what ties a played question back to the ledger. The site's upload code keeps fields it does not know; Stage D tests that the server keeps them too. A question's place in its round is the fallback.
- **Wording.** Rounds are called Rebound practice rounds in NSB format. They never carry the NSB name as if official, or any DOE or NSB logo.

## Quality bars

| Measure | Bar | What happens if missed |
|---|---|---|
| Wrong keys confirmed after release | At most 1% of played questions. For comparison, tournament sets run 2–3% and the pilot's DOE controls had 2 wrong in 36 | Above 2% in any month: stop releasing and find the step that let them through |
| Duplicates of library questions found after release | At most 2% | Tighten the judge and re-screen the bank |
| Difficulty | Players' first-answer accuracy on generated questions within 10 points of their accuracy on DOE questions of the same subject and tier, once a level has 200 first answers per tier | Adjust the tier descriptions and the rater's bands |
| Rejections at sign-off | Between 3% and 20% | Above 20%, the automatic checks are too loose. Below 3% for a month, lighten the review of questions with no flags |
| Review time | Recorded for every question; no bar yet | It sets how many rounds a week are possible |
| Ideas kept at step 3 | Watched, no bar | A steady fall means the easy ground is used up and the plan must shift toward application questions and new topics |

## Models, running it and cost

**Models.** These are starting choices, each to be confirmed by a small comparison in Stage B.

| Role | Starting model | Note |
|---|---|---|
| Writer (steps 2 and 4) | `claude-opus-5-5` | Compare with `claude-sonnet-5-5` on questions kept per dollar |
| Idea screen (step 3) | `claude-haiku-5-5` | A coarse filter; step 6 catches its misses |
| Text screen (step 6), first solver, rater | `claude-sonnet-5-5` | Never the writer's model |
| Second solver | A model from another company | Decision 2 |
| Source check | `claude-sonnet-5-5` with web search | |
| Second look | `claude-opus-5-5` with web search | A stronger model, such as `claude-fable-5-2`, for late-round questions if the pilot shows the need |

**How it runs.** Scripts in `scripts/gen/`, in TypeScript like the rest of Rebound, so they reuse the schema, the answer checker, the studio checks and the NSB-JSON writer directly. Each step reads files and writes files, so a run can stop and resume, and every intermediate result is kept. Steps with no tool use go through the half-price batch interface, where most batches finish within an hour. Steps that search the web or run code are called directly. A run stops when its estimated spend passes a budget given on the command line, on top of the cap set on the account. The key is kept as a secret of the machine or cloud environment that runs the scripts, never in the repository or in chat. Once the steps are stable, a scheduled weekly run can prepare the round and leave its review page ready. Replies use the same structured-output and refusal handling as the server's existing AI help. The share of biology and chemistry questions that a model refuses to write is unmeasured, and Stage C measures it.

**Cost.** Prices are from Anthropic's published list, read on 21 November 2026: per million input and output tokens, $4 and $20 for Opus 5.5, $2 and $10 for Sonnet 5.5, $0.10 and $0.50 for Haiku 5.5; half that in batches; $10 per 1,000 web searches. The token counts are my assumptions, not measurements.

| Step | Cost per kept question |
|---|---|
| Ideas | $0.022 |
| Idea screen | $0.001 |
| Writing, with code for numeric keys | $0.048 |
| Text screen | $0.013 |
| Two blind solves | $0.018 |
| Recompute (numeric questions) | $0.004 |
| Source check (fact questions) | $0.028 |
| Difficulty rating | $0.004 |
| Second look, and the one-in-ten re-check | $0.022 |
| **Total at standard prices** | **$0.16** |
| Total with batches where possible | about $0.115 |

| Volume | Model calls |
|---|---|
| One 23-pair round (46 questions) | $5.30 with batches, $7.30 without |
| A leaner setup: Sonnet as writer, sources only for Energy, late-round and flagged questions, one solver | about $2.50 a round |
| If the models think twice as long and half as many drafts survive | roughly $14 a round |
| One round a week for a 30-week season | $160–$220 |
| Three rounds a week all year | $830–$1,140, or $390–$620 on the leaner setup |
| The DOE sample of 1,200 questions | under $20 |
| The whole DOE library, one solver, in a batch | about $90, plus $60–$130 to settle disagreements |

The yearly figure is higher than the report's $110–$810 for the same volume. This plan checks every fact against a source, uses two solvers and adds the idea step; the report's model had none of those.

Reviewer time is the larger cost. At one to two minutes a question, a guess, a round takes 45 to 90 minutes. One round a week is the starting volume.

## Build order

Each stage ends with something you can look at, and I would stop for your go-ahead between stages.

| Stage | What gets built | It is done when | Needs from you | Model cost |
|---|---|---|---|---|
| A. Foundations | The `scripts/gen/` skeleton and ledger format; the style profile; the house-style checks with tests; library search with the 63-pair test; the lab table and source lists | The checks pass 95% of DOE's recent questions and fail the pilot's faulty drafts; the search test runs with the other tests | Approval of this plan | None |
| B. Model steps and calibration | The model adapter for direct and batch calls; prompts for every step; the judge tested on the labelled pairs; the DOE sample of 1,200; the difficulty rater's test; the writer comparison | Each step meets its test, and the cost table above is replaced by measured numbers | Decision 1 | Under $40 |
| C. Second pilot | Two late-tier rounds made by the pipeline end to end, then a blind test against DOE questions from rounds 11–17, with both solvers and an independent originality audit | A report against the criteria below | Decision 2 | $15–$30 |
| D. First team rounds | The review page; packet export; the private repository; one round a week | A round has been reviewed, played and its results read back | Decisions 3 and 4 | About $5–$7 a week |
| E. The DOE library pass | The full batch and the errata review list | Disagreements are listed for a person to judge | Your decision once Stage B shows the cost | About $150–$220 |
| F. Season review | The quality bars measured over a season; the decision on a public library | — | Decision 5 | — |

Stage A needs no key, no second repository and no reviewer, so it can start as soon as you approve the plan. I would build it on its own branch from `main`.

**Criteria for the second pilot.** It passes when, among about 90 finished questions:

- no key is wrong after independent checking, which puts the true rate under about 3%;
- an originality audit by a model that took no part in the screening finds at most two strict duplicates;
- the mean difficulty rating is within 0.3 of DOE's rounds 11–17 controls, drawn from the 2014–22 sets;
- no lab name or dated fact is out of date.

It also reports what each step let through, the measured cost per kept question, the reviewer's minutes per question, and what the second solver caught that the first did not.

**Small changes to the site.** None is needed before the first team round. Each needs your go-ahead when its time comes.

| Change | Why | When |
|---|---|---|
| "Report a problem" on a packet's questions | The button exists only under Library questions | With the first team rounds, if you want reports saved in the site |
| A way to download a packet's results | The difficulty comparison in the quality bars needs each player's first answers to a packet's questions | Before the season review |
| An "early regional" level for uploaded packets | Uploads marked regional are treated like round 12, so an early-tier round would be rated too hard by the practice planner | With the first early-tier round |
| The upload's fixed high school level | `uploadSet` and the studio's packet builder mark every packet as high school | Before any middle school round |
| The license line for DOE's sets | The report found it should cite DOE's web policy, not the copyright statute (README, Info page, NSB-JSON document) | Any time |

## Risks

| Risk | What limits it |
|---|---|
| Review becomes the bottleneck | Volume is set by measured review time. Questions with no flags can later get a lighter read |
| Two models share a wrong belief | A solver from another family, a source for every fact, the one-in-ten re-check, the reviewer, and players' reports |
| Originality runs out as the bank grows | The share of ideas kept at step 3 is watched; the round plan shifts toward application questions and thin topics |
| The search for new answers drifts into obscure facts | Topics are drawn from DOE's own mix; the tier descriptions name the textbook level; the reviewer can reject a question as too obscure |
| A model update changes behaviour | Model ids are fixed for each run and recorded per question; the fixed test sets are re-run before a new model is used |
| Spending runs over | The account's cap, the per-run budget, and batches |
| Unreleased questions leak | The private repository; nothing unreleased is pushed to this one |
| A fact goes out of date after release | The lab table's quarterly check; Energy questions carry a date after which they are re-checked or retired |
| DOE publishes sets that match bank questions | When a DOE set is added to the library, the whole bank is screened against it and matches are retired |
| The rules change in the fall | The answer conventions used by the checks are added to the existing rules-update checklist in [MAINTAINING.md](../MAINTAINING.md) |
| AI-written questions are unwelcome in the community | Every round is labelled; rounds stay within a team until decision 5 |

## Later, not in this plan

- **The public library.** If decision 5 goes that way, generated sets need their own data folder beside DOE's, a loader that merges the two, fingerprints and recordings for every question (made with Kokoro on your PC), a license such as CC0, a way for reports to reach the maintainer, and new wording for Rebound's AI policy. One wrinkle is already visible: a team that played a round as a packet will see it as fresh when it enters the library, because the ids differ.
- **Computation templates.** A computation question could be written once as a small program that produces new numbers each time, with the answer computed exactly, as Rebound's 39 visual-bonus templates already do. A person would then review one template instead of every question. This fits the proposal's own preference for template-made math and physics problems, and it is the most direct way around the review bottleneck.
- **A third search by meaning.** The two labelled pairs the search missed were the same fact in different words. If the second pilot's audit finds more of these, a search over one-line statements of each question's fact would catch them.
- **The checks inside the Write studio.** The house-style checks and the duplicate screen could later help teams who write their own questions.
