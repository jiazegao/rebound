/**
 * Trial: which model should write? The same slots are filled twice, by two writers, each through plan steps
 * 2 to 8 as far as one blind solver (flow.ts), and the two are compared on questions that come through per
 * dollar.
 *
 *   npx tsx scripts/gen/trials/writers.ts [--level hs|ms] [--tier late|early] [--slots 60] [--limit 8]
 *                                         [--writers claude-opus-5-5,claude-sonnet-5-5] [--mode live|batch] [--budget 40]
 *
 * --limit takes only the first so many slots: a small paid run to see what a slot costs before the full one.
 * Like the other trials, a limited run writes no summary.
 *
 * The slots are those of planned rounds (plan.ts), Energy left out: an Energy question is written from a lab
 * news item, and the collector of news items is not built yet.
 *
 * A checker is never the writer's own model, so the two writers' drafts are checked by different models:
 * Sonnet checks what Opus wrote, and Opus checks what Sonnet wrote. The comparison is therefore of two whole
 * set-ups, which is the choice to be made. It is not a like-for-like test of the writers alone.
 *
 * The questions written here are unreleased, so they are kept in the bank folder (ledger.ts), never in this
 * repository: the summary written to data/trials/ has counts and costs only.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CoreSubject, Level } from '../../../src/core/schema';
import { ideaGroups, makeDrafts, otherAnswersToAsk, solverDoubts, type FlowResult, type SlotRun, type Stage } from '../flow';
import { loadLabs } from '../labs';
import { BANK_DIR } from '../ledger';
import { loadLibrary, topicsById, type LibraryQuestion } from '../library';
import type { ModelApi, ModelReply } from '../llm';
import { loadTopicCounts, planRound } from '../plan';
import { loadProfile } from '../profile';
import { buildIndex } from '../search';
import { MATCH_PROMPT, matchRequest, readMatch } from '../steps/match';
import { RATE_PROMPT, rateRequest, readRating, type Anchors } from '../steps/rate';
import { asReadWithAnswer } from '../steps/show';
import { compare, readSolution, SOLVE_PROMPT, solveRequest } from '../steps/solve';
import { median, wordCount } from '../text';
import type { Slot, Tier } from '../types';
import { runTrial, trial, trialArgs, writeSummary, type TrialArgs } from './common';
import { anchorsFor, sampleDoe } from './doe';

export const WRITERS = ['claude-opus-5-5', 'claude-sonnet-5-5'];
export const IDEA_JUDGE = 'claude-haiku-5-5';

/** The model that checks a writer's drafts: Sonnet, unless Sonnet wrote them. */
export const checkerFor = (writer: string) => (writer === 'claude-sonnet-5-5' ? 'claude-opus-5-5' : 'claude-sonnet-5-5');

/** The first seed of the rounds the slots come from. */
const FIRST_SEED = 101;

/** `count` slots from planned rounds of a level and tier, without Energy. Ids say the round: "1t07", "2b03". */
export function trialSlots(level: Level, tier: Tier, count: number): Slot[] {
  const profile = loadProfile();
  const topicCounts = loadTopicCounts(level);
  const out: Slot[] = [];
  for (let round = 1; out.length < count; round++) {
    const plan = planRound({ level, tier, seed: FIRST_SEED + round - 1, profile, topicCounts });
    for (const slot of plan.slots) if (slot.subject !== 'energy' && out.length < count) out.push({ ...slot, id: `${round}${slot.id}` });
  }
  return out;
}

const share = (part: number, whole: number) => (whole ? Math.round((1000 * part) / whole) / 1000 : 0);
const mean = (xs: number[]) => (xs.length ? Math.round((100 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 100 : null);
const dollars = (x: number) => Math.round(x * 10_000) / 10_000;

const WRITING: Stage[] = ['ideas', 'write', 'repair'];

/** What one writer's set-up did with the slots, in counts and dollars. */
export function score(writer: string, checker: string, result: FlowResult) {
  const { runs, costs } = result;
  const ended = (stage: string) => runs.filter((r) => r.ended?.stage === stage).length;
  const ideas = runs.flatMap((r) => r.ideas);
  const relations: Record<string, number> = {};
  for (const i of ideas) relations[i.relation ?? 'none'] = (relations[i.relation ?? 'none'] ?? 0) + 1;
  const written = runs.filter((r) => r.written);
  const through = runs.filter((r) => r.outcome !== 'ended');
  const passed = runs.filter((r) => r.outcome === 'passed');
  const stages = Object.fromEntries(Object.entries(costs).map(([stage, c]) => [stage, { model: c.model, calls: c.calls, inputTokens: c.usage.input + c.usage.cacheRead + c.usage.cacheWrite, outputTokens: c.usage.output, thinkingTokens: c.usage.thinking, cost: dollars(c.cost) }]));
  const total = Object.values(costs).reduce((a, c) => a + c.cost, 0);
  const writing = Object.entries(costs).filter(([stage]) => WRITING.includes(stage as Stage)).reduce((a, [, c]) => a + c.cost, 0);
  const bySubject = (rs: SlotRun[]) => {
    const out: Partial<Record<CoreSubject, number>> = {};
    for (const r of rs) out[r.slot.subject] = (out[r.slot.subject] ?? 0) + 1;
    return out;
  };
  const stemWords = (kind: 'tossup' | 'bonus') => {
    const lengths = through.filter((r) => r.slot.kind === kind).map((r) => wordCount(r.written!.draft.question.stem));
    return lengths.length ? median(lengths) : null;
  };
  return {
    writer,
    checker,
    slots: runs.length,
    ideas: { proposed: ideas.length, byRelation: relations, repeats: share(ideas.filter((i) => i.relation === 'same' || i.relation === 'reversed').length, ideas.length), slotsWithNoIdeaLeft: ended('idea-screen') + ended('ideas') },
    written: written.length,
    style: { passedFirstTime: written.filter((r) => !r.repaired).length, repaired: written.filter((r) => r.repaired && r.ended?.stage !== 'style').length, failedTwice: ended('style'), notWritten: ended('write') },
    textScreen: { repeats: ended('text-screen'), relationsOfTheRest: Object.fromEntries(['template', 'related', 'new'].map((rel) => [rel, through.filter((r) => r.judgment?.relation === rel).length])) },
    solver: { unanswered: through.filter((r) => r.written && r.solution === null).length, passed: passed.length, toSecondLook: through.length - passed.length },
    passed: passed.length,
    passedShare: share(passed.length, runs.length),
    passedBySubject: bySubject(passed),
    difficulty: { ratedBy: checker, passed: mean(passed.map((r) => r.rating).filter((x): x is number => typeof x === 'number')), through: mean(through.map((r) => r.rating).filter((x): x is number => typeof x === 'number')) },
    stemWordsMedian: { tossup: stemWords('tossup'), bonus: stemWords('bonus') },
    cost: { total: dollars(total), writing: dollars(writing), checking: dollars(total - writing), perSlot: dollars(total / Math.max(1, runs.length)), perPassed: passed.length ? dollars(total / passed.length) : null, passedPerDollar: total ? Math.round((100 * passed.length) / total) / 100 : null, stages },
  };
}

/** A writer's results in full, with the questions: for the bank folder only. */
function details(result: FlowResult) {
  return result.runs.map((r) => ({
    slot: r.slot,
    outcome: r.outcome,
    ended: r.ended,
    ideas: r.ideas,
    chosen: r.chosen,
    question: r.written ? asReadWithAnswer(r.written.draft.question) : null,
    draft: r.written?.draft,
    why: r.written?.why,
    whyNot: r.written?.whyNot,
    working: r.written?.working,
    repaired: r.repaired,
    findings: r.findings,
    judgment: r.judgment,
    solution: r.solution,
    doubts: r.doubts,
    rating: r.rating,
  }));
}

/**
 * One checker's view of every writer's questions. The flow gives each writer's questions to a checker that is
 * not the writer, so two writers are checked by two models, and their figures cannot be set side by side. Here
 * the same model solves and rates all of them, its own writing included, so that the sets can be compared on
 * one scale. A model checking its own questions shares its own blind spots: this is a measurement, never a check.
 */
export async function oneCheckersView(checker: string, results: ReadonlyMap<string, FlowResult>, anchorsOf: (slot: Slot) => Anchors, name: (stage: string, writer: string, model: string, prompt: string) => string, args: TrialArgs, api?: ModelApi) {
  const sets = [];
  for (const [writer, result] of results) {
    const through = result.runs.filter((r) => r.outcome !== 'ended');
    let doubted: number;
    let ratings: number[];
    let cost = 0;
    if (checkerFor(writer) === checker) {
      // The flow already had this model check these questions.
      doubted = through.filter((r) => r.doubts.length > 0).length;
      ratings = through.map((r) => r.rating).filter((x): x is number => typeof x === 'number');
    } else {
      const question = (r: SlotRun) => r.written!.draft.question;
      const solveRequests = through.map((r) => solveRequest(`solve-${r.slot.id}`, question(r), r.slot.level, checker));
      const solveReplies = await runTrial(name('view-solve', writer, checker, SOLVE_PROMPT), solveRequests, args, 900, api);
      const solutions = new Map(through.map((r) => [r.slot.id, solveReplies.get(`solve-${r.slot.id}`) ? readSolution(solveReplies.get(`solve-${r.slot.id}`)!) : null]));
      const disputed = through.filter((r) => solutions.get(r.slot.id) && question(r).format === 'short_answer' && compare(question(r), solutions.get(r.slot.id)!) !== 'agrees');
      const asked = through.flatMap((r) => (solutions.get(r.slot.id) ? otherAnswersToAsk(question(r), solutions.get(r.slot.id)!).map((answer, i) => ({ r, answer, id: `other-${r.slot.id}-${i + 1}` })) : []));
      const matchRequests = [...disputed.map((r) => matchRequest(`match-${r.slot.id}`, question(r), solutions.get(r.slot.id)!.answer, r.slot.level, IDEA_JUDGE)), ...asked.map((a) => matchRequest(a.id, question(a.r), a.answer, a.r.slot.level, IDEA_JUDGE))];
      const matchReplies = matchRequests.length ? await runTrial(name('view-match', writer, IDEA_JUDGE, `${MATCH_PROMPT}-${checker}`), matchRequests, args, 150, api) : new Map<string, ModelReply>();
      const ruling = (id: string) => (matchReplies.get(id) ? readMatch(matchReplies.get(id)!) : null);
      doubted = through.filter((r) => {
        const solution = solutions.get(r.slot.id);
        if (!solution) return true;
        const others = question(r).format === 'short_answer' ? asked.filter((a) => a.r === r && ruling(a.id)?.verdict !== 'accept').map((a) => a.answer) : undefined;
        return solverDoubts(r.slot, question(r), solution, ruling(`match-${r.slot.id}`), others).length > 0;
      }).length;
      const rateRequests = through.map((r) => rateRequest(`rate-${r.slot.id}`, question(r), r.slot.level, anchorsOf(r.slot), checker));
      const rateReplies = await runTrial(name('view-rate', writer, checker, RATE_PROMPT), rateRequests, args, 300, api);
      ratings = through.map((r) => (rateReplies.get(`rate-${r.slot.id}`) ? readRating(rateReplies.get(`rate-${r.slot.id}`)!)?.score : undefined)).filter((x): x is number => typeof x === 'number');
      for (const reply of [...solveRequests.map((q) => solveReplies.get(q.id)), ...matchRequests.map((q) => matchReplies.get(q.id)), ...rateRequests.map((q) => rateReplies.get(q.id))]) cost += reply?.cost ?? 0;
    }
    sets.push({ writer, itsOwnWriting: writer === checker, questions: through.length, withADoubt: doubted, withADoubtShare: share(doubted, through.length), meanRating: mean(ratings), costOfThisView: dollars(cost) });
  }
  return { checker, sets };
}

export interface WritersOptions {
  level: Level;
  tier: Tier;
  slots: number;
  writers: string[];
}

export async function writersTrial(library: LibraryQuestion[], options: WritersOptions, args: TrialArgs, api?: ModelApi) {
  const slots = trialSlots(options.level, options.tier, args.limit ? Math.min(args.limit, options.slots) : options.slots);
  const questions = library.map((x) => x.question);
  const index = buildIndex(questions);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const topicOf = topicsById(options.level);
  const checks = { profile: loadProfile(), labs: loadLabs() };
  // The rater's anchors are the ones the DOE trial uses, so the two sets of ratings can be read together.
  const inSample = new Set(sampleDoe(library).map((s) => s.id));
  const anchors = new Map<string, ReturnType<typeof anchorsFor>>();
  const anchorsOf = (slot: Slot) => {
    if (!anchors.has(slot.subject)) anchors.set(slot.subject, anchorsFor(library, slot.level, slot.subject, inSample));
    return anchors.get(slot.subject)!;
  };
  console.log(`${slots.length} ${options.level} ${options.tier}-round slots without Energy, in ${ideaGroups(slots).length} idea requests, for each of ${options.writers.join(' and ')}.`);
  const scores = [];
  const results = new Map<string, FlowResult>();
  const name = (stage: string, writer: string, model: string, prompt: string) => `writers-${options.level}-${options.tier}-${slots.length}-${writer}-${stage}-${model}-${prompt}`.toLowerCase();
  for (const writer of options.writers) {
    const checker = checkerFor(writer);
    const result = await makeDrafts(slots, { writer, ideaJudge: IDEA_JUDGE, matcher: IDEA_JUDGE, checker }, {
      library,
      index,
      byId,
      topicOf,
      checks,
      anchors: anchorsOf,
      salt: `writers/${options.level}/${options.tier}`,
      send: (stage, model, prompt, requests, expected) => runTrial(name(stage, writer, model, prompt), requests, args, expected, api),
    });
    results.set(writer, result);
    const s = score(writer, checker, result);
    scores.push(s);
    const file = path.join(BANK_DIR, 'trials', `writers-${options.level}-${options.tier}-${slots.length}-${writer}.json`.toLowerCase());
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ writer, checker, run: new Date().toISOString(), results: details(result) }, null, 1)}\n`);
    console.log(`\n${writer} (checked by ${checker}): ${s.passed} of ${s.slots} slots came through clean, ${s.solver.toSecondLook} more with a doubt. Ideas repeating the library: ${Math.round(100 * s.ideas.repeats)}%. Style: ${s.style.passedFirstTime} first time, ${s.style.repaired} after a repair, ${s.style.failedTwice} failed twice. Text screen dropped ${s.textScreen.repeats}.`);
    console.log(`  Cost $${s.cost.total.toFixed(2)} ($${s.cost.writing.toFixed(2)} writing, $${s.cost.checking.toFixed(2)} checking): $${s.cost.perPassed ?? '—'} a clean question, ${s.cost.passedPerDollar ?? '—'} clean questions a dollar. Mean difficulty rating of the clean ones: ${s.difficulty.passed ?? '—'}.`);
    console.log(`  The questions are in ${file}`);
  }
  // Each checker's view of both sets, so that they can be compared on one scale.
  const views = [];
  if (options.writers.length > 1) {
    for (const checker of new Set(options.writers.map(checkerFor))) {
      const view = await oneCheckersView(checker, results, anchorsOf, name, args, api);
      views.push(view);
      console.log(`\nAs ${checker} sees them: ${view.sets.map((v) => `${v.writer}'s questions${v.itsOwnWriting ? ' (its own)' : ''}: ${v.withADoubt} of ${v.questions} with a doubt, mean rating ${v.meanRating ?? '—'}`).join('; ')}.`);
    }
  }
  const summary = {
    about: 'Two writers on the same slots (scripts/gen/trials/writers.ts), each through ideas, the idea screen, writing, the house-style checks with one repair, the text screen, one blind solver and the difficulty rating. "passed" came through with no doubt raised; "toSecondLook" came through with one for the second look to settle. A checker is never the writer\'s own model, so the two set-ups are checked by different models: "oneCheckersView" has each checker solve and rate both sets, its own writing included, so that they can be compared on one scale. The questions themselves are unreleased and are not in this file.',
    level: options.level,
    tier: options.tier,
    slots: slots.length,
    ideaJudge: IDEA_JUDGE,
    run: new Date().toISOString().slice(0, 10),
    mode: args.mode,
    writers: scores,
    oneCheckersView: views,
  };
  if (!args.limit) console.log(`\nSummary: ${path.relative(process.cwd(), writeSummary(`writers.${options.level}-${options.tier}`.toLowerCase(), summary))}`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  trial(async () => {
    const argv = process.argv.slice(2);
    const value = (name: string, fallback: string) => {
      const i = argv.indexOf(`--${name}`);
      return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
    };
    const args = trialArgs({ model: '', mode: 'live' });
    const slots = Number(value('slots', '60'));
    if (!Number.isInteger(slots) || slots < 1) throw new Error('--slots is a whole number.');
    await writersTrial(loadLibrary(), { level: value('level', 'hs').toLowerCase() === 'ms' ? 'MS' : 'HS', tier: value('tier', 'late') === 'early' ? 'early' : 'late', slots, writers: value('writers', WRITERS.join(',')).split(',').map((w) => w.trim()).filter(Boolean) }, args);
  });
}
