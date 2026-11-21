/**
 * Trial: the blind solver and the difficulty rater on DOE's own questions.
 *
 *   npx tsx scripts/gen/trials/doe.ts --solve [--model claude-sonnet-5-5] [--limit 40] [--mode batch|live]
 *   npx tsx scripts/gen/trials/doe.ts --rate  [--model claude-sonnet-5-5] [--limit 24]
 *   npx tsx scripts/gen/trials/doe.ts --known [--model claude-sonnet-5-5]
 *   npx tsx scripts/gen/trials/doe.ts --sample          (prints the sample's make-up; costs nothing)
 *
 * The sample is 1,200 questions from DOE's 2014–22 sets: 50 for each level, category and tier (rounds 1–10,
 * or rounds 11 and later), half toss-ups and half bonuses, drawn with a fixed seed. DOE's keys are nearly
 * always right, so this measures the checker, not DOE:
 *
 *  --solve  how often a solver that has only the question disagrees with a right key (false alarms), what it
 *           flags, and whether its own sense of difficulty tells DOE's early rounds from its late ones;
 *  --rate   whether the rater, shown DOE questions of each tier, tells them apart better (on a quarter of
 *           the sample);
 *  --known  whether the solver catches the keys known to be wrong: seven answer letters DOE misprinted, and
 *           the two keys the November 2026 pilot disputed.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_SUBJECTS, type CoreSubject, type Level, type Question, type QuestionKind } from '../../../src/core/schema';
import { DOE_ERRATA } from '../../../src/core/importers/doeErrata';
import { loadLibrary, type LibraryQuestion } from '../library';
import type { ModelApi, ModelReply } from '../llm';
import { plain } from '../text';
import type { Tier } from '../types';
import { RATE_PROMPT, rateRequest, readRating, type Anchors } from '../steps/rate';
import { compare, readSolution, SOLVE_PROMPT, solveRequest, unacceptedAnswers } from '../steps/solve';
import { perCall, runTrial, seeded, seedOf, separation, shuffled, trial, trialArgs, writeSummary, type TrialArgs } from './common';

export interface SampleItem {
  id: string;
  level: Level;
  tier: Tier;
  subject: CoreSubject;
  kind: QuestionKind;
  question: Question;
}

/** The first season sampled: the 23-pair era and after, the style closest to today's. */
export const SAMPLE_FROM_YEAR = 2014;
export const SAMPLE_SEED = 20261121;

const NEEDS_A_FIGURE = /\b(shown|pictured|figure|diagram|illustrated|image|graph (below|above|shown))\b/i;

/** Questions a model can fairly be asked: complete, unflagged, in a current category, needing no picture. */
export function eligible(library: readonly LibraryQuestion[], fromYear = SAMPLE_FROM_YEAR): LibraryQuestion[] {
  return library.filter((x) => {
    const q = x.question;
    if ((x.year ?? 0) < fromYear || !(CORE_SUBJECTS as string[]).includes(q.subject)) return false;
    if (q.flags?.length || q.visual || q.figure || NEEDS_A_FIGURE.test(q.stem) || !q.stem.trim() || !q.answer.trim()) return false;
    return q.format === 'short_answer' || (!!q.choices && !!q.answerLetter);
  });
}

export const tierOf = (round: number): Tier => (round <= 10 ? 'early' : 'late');

/** The sample: `perCell` questions for each level, category and tier, half toss-ups and half bonuses. */
export function sampleDoe(library: readonly LibraryQuestion[], perCell = 50, seed = SAMPLE_SEED): SampleItem[] {
  const pool = eligible(library);
  const out: SampleItem[] = [];
  const taken = new Set<string>();
  for (const level of ['HS', 'MS'] as const) {
    for (const subject of CORE_SUBJECTS) {
      for (const tier of ['early', 'late'] as const) {
        for (const kind of ['tossup', 'bonus'] as const) {
          const cell = pool.filter((x) => x.level === level && x.question.subject === subject && tierOf(x.round) === tier && x.question.kind === kind);
          let n = 0;
          for (const x of shuffled(cell, seeded(seedOf(`${level}/${subject}/${tier}/${kind}`, seed)))) {
            if (n >= perCell / 2) break;
            // DOE printed some questions at both levels: each is asked once.
            const words = plain(x.question.stem);
            if (taken.has(words)) continue;
            taken.add(words);
            out.push({ id: x.question.id, level, tier, subject, kind, question: x.question });
            n += 1;
          }
        }
      }
    }
  }
  return out;
}

const share = (part: number, whole: number) => (whole ? Math.round((1000 * part) / whole) / 1000 : 0);
const mean = (xs: number[]) => (xs.length ? Math.round((100 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 100 : 0);

function makeUp(sample: readonly SampleItem[]) {
  const by = (f: (s: SampleItem) => string) => {
    const out: Record<string, number> = {};
    for (const s of sample) out[f(s)] = (out[f(s)] ?? 0) + 1;
    return out;
  };
  return { questions: sample.length, byLevelAndTier: by((s) => `${s.level} ${s.tier}`), bySubject: by((s) => s.subject), byKind: by((s) => s.kind), byFormat: by((s) => s.question.format) };
}

/* ---------------- --solve ---------------- */

export async function solve(sample: SampleItem[], args: TrialArgs, api?: ModelApi) {
  const requests = sample.map((s) => solveRequest(s.id, s.question, s.level, args.model));
  const replies = await runTrial(`doe-solve-${args.model}-${SOLVE_PROMPT}`, requests, args, 700, api);
  const rows = sample.map((s) => {
    const reply = replies.get(s.id);
    const solution = reply ? readSolution(reply) : null;
    return {
      id: s.id,
      level: s.level,
      tier: s.tier,
      subject: s.subject,
      kind: s.kind,
      format: s.question.format,
      outcome: reply?.outcome ?? 'none',
      verdict: solution ? compare(s.question, solution) : null,
      answer: solution ? (s.question.format === 'multiple_choice' ? `${solution.letter}) ${solution.answer}` : solution.answer) : '',
      key: s.question.answerRaw,
      confidence: solution?.confidence ?? null,
      difficulty: solution?.difficulty ?? null,
      seconds: solution?.seconds ?? null,
      problems: solution?.problems ?? [],
      otherAnswers: solution ? unacceptedAnswers(s.question, solution) : [],
    };
  });
  const answered = rows.filter((r) => r.verdict);
  const rate = (rs: typeof rows) => ({ questions: rs.length, agrees: share(rs.filter((r) => r.verdict === 'agrees').length, rs.length), close: share(rs.filter((r) => r.verdict === 'close').length, rs.length), disagrees: share(rs.filter((r) => r.verdict === 'disagrees').length, rs.length) });
  const groups = <K extends string>(key: (r: (typeof rows)[number]) => K) => Object.fromEntries([...new Set(answered.map(key))].sort().map((k) => [k, rate(answered.filter((r) => key(r) === k))]));
  const difficulty = (level: Level, tier: Tier) => answered.filter((r) => r.level === level && r.tier === tier).map((r) => r.difficulty!);
  const flagged = answered.filter((r) => r.problems.length);
  const problemKinds: Record<string, number> = {};
  for (const r of flagged) for (const p of r.problems) problemKinds[p.kind] = (problemKinds[p.kind] ?? 0) + 1;
  const summary = {
    about: 'A blind solver on a sample of DOE questions from 2014–22 (scripts/gen/trials/doe.ts --solve). DOE\'s keys are nearly always right, so a disagreement is almost always a false alarm: the solver was wrong, or the answer checker could not match a right answer in another form.',
    model: args.model,
    prompt: SOLVE_PROMPT,
    run: new Date().toISOString().slice(0, 10),
    sample: makeUp(sample),
    answered: answered.length,
    all: rate(answered),
    byTier: groups((r) => `${r.level} ${r.tier}`),
    bySubject: groups((r) => r.subject),
    byFormat: groups((r) => r.format),
    byKind: groups((r) => r.kind),
    byConfidence: groups((r) => `confidence ${r.confidence}`),
    flagged: { questions: flagged.length, share: share(flagged.length, answered.length), kinds: problemKinds, amongDisagreements: share(flagged.filter((r) => r.verdict === 'disagrees').length, answered.filter((r) => r.verdict === 'disagrees').length) },
    secondAnswers: { questions: answered.filter((r) => r.otherAnswers.length).length, share: share(answered.filter((r) => r.otherAnswers.length).length, answered.length) },
    difficulty: {
      note: 'The solver\'s own 1–5 rating, made without seeing the answer. "separation" is the chance that a late-round question is rated harder than an early-round one (ties count half): 0.5 is no better than a coin.',
      HS: { early: mean(difficulty('HS', 'early')), late: mean(difficulty('HS', 'late')), separation: Math.round(1000 * separation(difficulty('HS', 'early'), difficulty('HS', 'late'))) / 1000 },
      MS: { early: mean(difficulty('MS', 'early')), late: mean(difficulty('MS', 'late')), separation: Math.round(1000 * separation(difficulty('MS', 'early'), difficulty('MS', 'late'))) / 1000 },
    },
    calls: perCall(sample.map((s) => replies.get(s.id)).filter((r): r is ModelReply => !!r)),
    results: rows,
  };
  console.log(`\nAnswered ${answered.length} of ${sample.length}. Agrees with DOE's key: ${(100 * summary.all.agrees).toFixed(1)}%; close: ${(100 * summary.all.close).toFixed(1)}%; disagrees: ${(100 * summary.all.disagrees).toFixed(1)}%.`);
  console.log(`By tier: ${Object.entries(summary.byTier).map(([k, v]) => `${k} ${(100 * v.agrees).toFixed(0)}%`).join(', ')}`);
  console.log(`Flagged a problem in ${flagged.length} (${(100 * summary.flagged.share).toFixed(1)}%): ${JSON.stringify(problemKinds)}`);
  console.log(`Difficulty, early against late: HS ${summary.difficulty.HS.early} / ${summary.difficulty.HS.late} (separation ${summary.difficulty.HS.separation}); MS ${summary.difficulty.MS.early} / ${summary.difficulty.MS.late} (${summary.difficulty.MS.separation}).`);
  console.log(`Per call: ${JSON.stringify(summary.calls.meanTokens)}, $${summary.calls.costPerCall}.`);
  if (!args.limit) console.log(`Summary: ${path.relative(process.cwd(), writeSummary(`doe-solve.${args.model}`, summary))}`);
  return summary;
}

/* ---------------- --rate ---------------- */

/** How many of DOE's questions of each tier the rater is shown, per level and category. */
const ANCHORS_PER_TIER = 4;

/** Anchors for one level and category: DOE questions of each tier that are not in the sample, toss-ups and bonuses alike. */
export function anchorsFor(library: readonly LibraryQuestion[], level: Level, subject: CoreSubject, exclude: ReadonlySet<string>, seed = SAMPLE_SEED): { early: Question[]; late: Question[] } {
  const pool = eligible(library).filter((x) => x.level === level && x.question.subject === subject && !exclude.has(x.question.id));
  const pick = (tier: Tier) => {
    const out: Question[] = [];
    for (const kind of ['tossup', 'bonus'] as const) {
      const cell = shuffled(pool.filter((x) => tierOf(x.round) === tier && x.question.kind === kind), seeded(seedOf(`anchor/${level}/${subject}/${tier}/${kind}`, seed)));
      out.push(...cell.slice(0, ANCHORS_PER_TIER / 2).map((x) => x.question));
    }
    return out;
  };
  return { early: pick('early'), late: pick('late') };
}

export async function rate(library: LibraryQuestion[], sample: SampleItem[], args: TrialArgs, api?: ModelApi) {
  // A quarter of the sample, spread the same way: the first quarter of each level, category, tier and kind.
  const cells = new Map<string, SampleItem[]>();
  for (const s of sample) cells.set(`${s.level}/${s.subject}/${s.tier}/${s.kind}`, [...(cells.get(`${s.level}/${s.subject}/${s.tier}/${s.kind}`) ?? []), s]);
  const quarter = [...cells.values()].flatMap((cell) => cell.slice(0, Math.ceil(cell.length / 4)));
  const inSample = new Set(sample.map((s) => s.id));
  const anchors = new Map<string, Anchors>();
  const requests = quarter.map((s) => {
    const key = `${s.level}/${s.subject}`;
    if (!anchors.has(key)) anchors.set(key, anchorsFor(library, s.level, s.subject, inSample));
    return rateRequest(s.id, s.question, s.level, anchors.get(key)!, args.model);
  });
  const replies = await runTrial(`doe-rate-${args.model}-${RATE_PROMPT}`, requests, args, 250, api);
  const rows = quarter.map((s) => ({ id: s.id, level: s.level, tier: s.tier, subject: s.subject, kind: s.kind, score: (replies.get(s.id) && readRating(replies.get(s.id)!)?.score) ?? null }));
  const scores = (level: Level, tier: Tier) => rows.filter((r) => r.level === level && r.tier === tier && r.score !== null).map((r) => r.score!);
  const one = (level: Level) => ({ early: mean(scores(level, 'early')), late: mean(scores(level, 'late')), separation: Math.round(1000 * separation(scores(level, 'early'), scores(level, 'late'))) / 1000 });
  const summary = {
    about: 'The difficulty rater on a quarter of the DOE sample (scripts/gen/trials/doe.ts --rate): can it tell DOE\'s rounds 11 and later from its rounds 1–10 when shown four questions of each? "separation" is the chance that a late-round question is rated harder than an early-round one (ties count half).',
    model: args.model,
    prompt: RATE_PROMPT,
    run: new Date().toISOString().slice(0, 10),
    rated: rows.filter((r) => r.score !== null).length,
    HS: one('HS'),
    MS: one('MS'),
    calls: perCall(quarter.map((s) => replies.get(s.id)).filter((r): r is ModelReply => !!r)),
    results: rows,
  };
  console.log(`\nRated ${summary.rated} of ${quarter.length}. Early against late: HS ${summary.HS.early} / ${summary.HS.late} (separation ${summary.HS.separation}); MS ${summary.MS.early} / ${summary.MS.late} (${summary.MS.separation}).`);
  console.log(`Per call: ${JSON.stringify(summary.calls.meanTokens)}, $${summary.calls.costPerCall}.`);
  if (!args.limit) console.log(`Summary: ${path.relative(process.cwd(), writeSummary(`doe-rate.${args.model}`, summary))}`);
  return summary;
}

/* ---------------- --known ---------------- */

/** The two keys the November 2026 pilot's checker disputed against sources. */
const DISPUTED = ['doe-hs-03-r15-t21', 'doe-hs-01-r11-b23'];

export async function known(library: LibraryQuestion[], args: TrialArgs, api?: ModelApi) {
  const byId = new Map(library.map((x) => [x.question.id, x]));
  const cases = [
    ...DOE_ERRATA.map((e) => ({ id: e.id, kind: 'misprinted letter' as const, printed: /printed the answer as "([WXYZ])\)/.exec(e.note)?.[1] ?? '' })),
    ...DISPUTED.map((id) => ({ id, kind: 'disputed key' as const, printed: '' })),
  ].filter((c) => byId.has(c.id));
  const requests = cases.map((c) => solveRequest(c.id, byId.get(c.id)!.question, byId.get(c.id)!.level, args.model));
  const replies = await runTrial(`doe-known-${args.model}-${SOLVE_PROMPT}`, requests, args, 700, api);
  const rows = cases.map((c) => {
    const q = byId.get(c.id)!.question;
    const solution = replies.get(c.id) ? readSolution(replies.get(c.id)!) : null;
    // A misprinted letter is caught when the solver gives the corrected letter, not the printed one;
    // a disputed key when the solver disagrees with the key in the library.
    const caught = !solution ? null : c.kind === 'misprinted letter' ? solution.letter === q.answerLetter && solution.letter !== c.printed : compare(q, solution) === 'disagrees';
    return { id: c.id, kind: c.kind, printed: c.printed, key: q.answerRaw, answer: solution ? (q.format === 'multiple_choice' ? `${solution.letter}) ${solution.answer}` : solution.answer) : '', caught, otherAnswers: solution?.otherAnswers ?? [], problems: solution?.problems ?? [] };
  });
  const summary = {
    about: 'The blind solver on keys known to be wrong (scripts/gen/trials/doe.ts --known): seven answer letters DOE misprinted, which Rebound corrected, and two keys the November 2026 pilot disputed against sources.',
    model: args.model,
    prompt: SOLVE_PROMPT,
    run: new Date().toISOString().slice(0, 10),
    caught: rows.filter((r) => r.caught).length,
    of: rows.length,
    calls: perCall(cases.map((c) => replies.get(c.id)).filter((r): r is ModelReply => !!r)),
    results: rows,
  };
  console.log(`\nCaught ${summary.caught} of ${summary.of}.`);
  for (const r of rows) console.log(`  ${r.caught ? 'caught' : 'missed'}  ${r.id} (${r.kind}): key ${r.key}${r.printed ? `, DOE printed ${r.printed}` : ''}; solver said ${r.answer}`);
  if (!args.limit) console.log(`Summary: ${path.relative(process.cwd(), writeSummary(`doe-known.${args.model}`, summary))}`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  trial(async () => {
    const args = trialArgs({ model: 'claude-sonnet-5-5', mode: 'batch' });
    const library = loadLibrary();
    const sample = sampleDoe(library);
    if (args.flags.has('sample')) {
      console.log(JSON.stringify(makeUp(sample), null, 1));
      return;
    }
    // A small run takes questions from every cell: every n-th of the sample.
    const step = args.limit ? Math.max(1, Math.floor(sample.length / args.limit)) : 1;
    const chosen = args.limit ? sample.filter((_, i) => i % step === 0).slice(0, args.limit) : sample;
    if (args.flags.has('solve')) await solve(chosen, args);
    else if (args.flags.has('rate')) await rate(library, chosen, args);
    else if (args.flags.has('known')) await known(library, args);
    else console.error('Say which: --solve, --rate, --known or --sample.');
  });
}
