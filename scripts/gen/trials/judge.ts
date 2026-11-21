/**
 * Trial: the duplicate judge against the pairs Rebound's November 2026 pilot labelled by hand.
 *
 *   npx tsx scripts/gen/trials/judge.ts [--model claude-sonnet-5-5] [--limit 20] [--mode live|batch] [--budget 40]
 *
 * Each draft is looked up in the library (search.ts) and the judge is shown what the search found. The plan's
 * bar: of the 55 drafts that repeat a library question, at least 52 are thrown away ("same" or "reversed"),
 * and of the drafts the pilot's checkers found to be different, at least four in five are kept.
 *
 * The checkers read only the closest few library questions for each draft, so a "different" draft the judge
 * throws away may be a repeat they missed: the summary lists every one with the judge's reason, to be read.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LETTERS } from '../../../src/core/schema';
import { DATA_DIR, loadLibrary } from '../library';
import { buildIndex, neighbours, TOP, type Query } from '../search';
import { isRepeat, JUDGE_PROMPT, judgeRequest, readJudgment, type Judgment, type Listed } from '../steps/judge';
import { onOneLine } from '../steps/show';
import type { ModelApi } from '../llm';
import { perCall, runTrial, trial, trialArgs, writeSummary, type TrialArgs } from './common';

interface Item {
  id: string;
  /** What the pilot found: the draft repeats a library question, reuses a method, or neither. */
  label: 'same' | 'template' | 'different';
  /** The library questions the pilot matched it with, when it named them. */
  matches: string[];
  draft: Query;
}

function items(): Item[] {
  const read = <T,>(file: string) => JSON.parse(readFileSync(path.join(DATA_DIR, 'eval', file), 'utf8')) as T;
  const pairs = read<{ pairs: Array<{ id: string; group: string; label: 'same' | 'template'; stem: string; choices?: Record<string, string>; answer: string; matches: string[] }> }>('duplicate-pairs.json').pairs;
  const final = read<{ questions: Array<{ id: string; label: Item['label']; stem: string; choices?: Record<string, string>; answer: string }> }>('pilot-final.json').questions;
  const out: Item[] = pairs.map((p) => ({ id: p.id, label: p.label, matches: p.matches, draft: { stem: p.stem, answer: p.answer, ...(p.choices ? { choices: p.choices } : {}) } }));
  // A pair's id is the place in the round the draft was written for, and a place can hold several drafts in turn.
  // Only the checkers' pairs are questions of the final rounds; the writer's are earlier drafts it replaced.
  const have = new Set(pairs.filter((p) => p.group === 'checker-found').map((p) => p.id));
  // The rest of the final rounds: drafts the checkers found no repeat for (and five whose template match they did not name).
  for (const q of final) if (!have.has(q.id)) out.push({ id: q.id, label: q.label, matches: [], draft: { stem: q.stem, answer: q.answer, ...(q.choices ? { choices: q.choices } : {}) } });
  return out;
}

const show = (q: Query) => [q.stem, ...(q.choices ? LETTERS.map((l) => `${l}) ${q.choices![l] ?? ''}`) : []), `ANSWER: ${q.answer}`].join('\n');

export async function judgeTrial(args: TrialArgs, api?: ModelApi) {
  const all = items();
  const chosen = args.limit ? all.slice(0, args.limit) : all;
  const library = loadLibrary();
  const index = buildIndex(library.map((x) => x.question));
  const byId = new Map(library.map((x) => [x.question.id, x.question]));
  // Kept by position, since ids repeat.
  const listed: Listed[][] = chosen.map((item) => neighbours(index, item.draft, TOP).map((nb) => ({ id: nb.id, line: onOneLine(nb.id, byId.get(nb.id)!) })));
  const requests = chosen.map((item, n) => judgeRequest(`judge-${String(n + 1).padStart(3, '0')}`, show(item.draft), listed[n]!, args.model));
  const replies = await runTrial(`judge-${args.model}-${JUDGE_PROMPT}`, requests, args, 400, api);

  const results = chosen.map((item, n) => {
    const reply = replies.get(requests[n]!.id);
    const judgment: Judgment | null = reply ? readJudgment(reply, listed[n]!) : null;
    return { n: n + 1, id: item.id, label: item.label, stem: item.draft.stem, relation: judgment?.relation ?? null, match: judgment?.match ?? '', namedTheMatch: !!judgment?.match && item.matches.includes(judgment.match), searchFoundIt: item.matches.some((m) => listed[n]!.some((l) => l.id === m)), reason: judgment?.reason ?? reply?.note ?? 'no reply' };
  });
  const of = (label: Item['label']) => results.filter((r) => r.label === label);
  const thrownAway = (rs: typeof results) => rs.filter((r) => r.relation && isRepeat(r.relation)).length;
  const count = (rs: typeof results) => Object.fromEntries(['same', 'reversed', 'template', 'related', 'new', 'none'].map((rel) => [rel, rs.filter((r) => (r.relation ?? 'none') === rel).length]));
  const same = of('same');
  const template = of('template');
  const different = of('different');
  const summary = {
    about: 'The duplicate judge on the drafts the November 2026 pilot labelled (scripts/gen/trials/judge.ts). A draft is thrown away when the judge calls it "same" or "reversed".',
    model: args.model,
    prompt: JUDGE_PROMPT,
    run: new Date().toISOString().slice(0, 10),
    repeats: { drafts: same.length, thrownAway: thrownAway(same), namedTheMatch: same.filter((r) => r.namedTheMatch).length, relations: count(same), bar: 'at least 52 of 55 thrown away' },
    templates: { drafts: template.length, thrownAway: thrownAway(template), relations: count(template) },
    different: { drafts: different.length, kept: different.length - thrownAway(different), relations: count(different), bar: 'at least four in five kept' },
    calls: perCall(requests.map((r) => replies.get(r.id)).filter((r) => !!r)),
    missedRepeats: same.filter((r) => !r.relation || !isRepeat(r.relation)),
    thrownAwayThoughLabelledDifferent: [...different, ...template].filter((r) => r.relation && isRepeat(r.relation)),
    results,
  };
  console.log(`\nRepeats thrown away: ${summary.repeats.thrownAway} of ${same.length} (the judge named the pilot's match for ${summary.repeats.namedTheMatch}).`);
  console.log(`Template drafts: ${JSON.stringify(summary.templates.relations)}`);
  console.log(`Different drafts kept: ${summary.different.kept} of ${different.length}. ${JSON.stringify(summary.different.relations)}`);
  for (const r of summary.missedRepeats) console.log(`  missed   ${r.id}: ${r.relation ?? 'no judgment'}. ${r.reason}`);
  for (const r of summary.thrownAwayThoughLabelledDifferent) console.log(`  rejected ${r.id} (${r.label}): ${r.relation} with ${r.match}. ${r.reason}`);
  if (!args.limit) console.log(`Summary: ${path.relative(process.cwd(), writeSummary(`judge.${args.model}`, summary))}`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  trial(async () => {
    await judgeTrial(trialArgs({ model: 'claude-sonnet-5-5', mode: 'live' }));
  });
}
