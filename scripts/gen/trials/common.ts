/**
 * What the trials share. A trial runs one model step on a fixed test set and scores it: it costs money, so it
 * is run by hand (npm run gen:trial:… ), never by `npm test`. Replies are kept in the bank folder (ledger.ts),
 * so a trial that is stopped or repeated does not pay twice; its summary is written to scripts/gen/data/trials/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BANK_DIR } from '../ledger';
import { DATA_DIR } from '../library';
import { BudgetError, KeyError, run, Spend, tally, type ModelApi, type ModelReply, type ModelRequest } from '../llm';
import { connect } from '../workspace';

/** The most the whole of stage B may spend, in dollars, unless --budget says otherwise. */
export const STAGE_BUDGET = 40;

export const SPEND_FILE = path.join(BANK_DIR, 'spend.jsonl');
export const TRIALS_DIR = path.join(DATA_DIR, 'trials');

export interface TrialArgs {
  model: string;
  mode: 'live' | 'batch';
  /** Only the first so many items: a small paid run to measure before the full one. */
  limit: number;
  budget: number;
  flags: Set<string>;
}

export function trialArgs(defaults: { model: string; mode: 'live' | 'batch' }, argv = process.argv.slice(2)): TrialArgs {
  const value = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const mode = value('mode') ?? defaults.mode;
  if (mode !== 'live' && mode !== 'batch') throw new Error('--mode is live or batch.');
  const limit = Number(value('limit') ?? 0);
  const budget = Number(value('budget') ?? STAGE_BUDGET);
  if (!Number.isInteger(limit) || limit < 0 || !(budget > 0)) throw new Error('--limit is a whole number and --budget a number of dollars.');
  return { model: value('model') ?? defaults.model, mode, limit, budget, flags: new Set(argv.filter((a) => a.startsWith('--')).map((a) => a.slice(2))) };
}

/** A repeatable source of random numbers (mulberry32): the same seed always gives the same sample. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A number from a text, so a seed can depend on a name. */
export function seedOf(text: string, base = 20261121): number {
  let h = base >>> 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h ^ text.charCodeAt(i), 0x01000193) + 0x9e3779b1) >>> 0;
  return h;
}

/**
 * Send a trial's requests and return the replies by request id. `name` names the folder the replies are kept
 * in: give it the prompt's version, so a changed prompt starts afresh and an unchanged one is not paid for twice.
 */
export async function runTrial(name: string, requests: readonly ModelRequest[], args: TrialArgs, expectedOutputTokens: number, api: ModelApi = connect()): Promise<Map<string, ModelReply>> {
  const spend = new Spend(SPEND_FILE, args.budget);
  const before = spend.total();
  console.log(`${name}: ${requests.length} requests, ${args.mode}. Spent so far: $${before.toFixed(2)} of the $${args.budget.toFixed(2)} limit.`);
  const replies = await run(api, requests, { dir: path.join(BANK_DIR, 'runs', name), mode: args.mode, spend, expectedOutputTokens, concurrency: 6, pollMs: 30_000, log: (line) => console.log(`  ${line}`) });
  const mine = requests.map((r) => replies.get(r.id)).filter((r): r is ModelReply => !!r);
  const t = tally(mine);
  console.log(`  ${t.outcomes.ok} answered, ${t.outcomes.refused} refused, ${t.outcomes['cut-off']} cut off, ${t.outcomes.error} failed. This run cost $${(spend.total() - before).toFixed(3)}; these replies cost $${t.cost.toFixed(3)} in all.`);
  return replies;
}

/** Run a trial's script, ending with a plain message, not a stack trace, when the key or the limit stops it. */
export function trial(main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    if (err instanceof KeyError || err instanceof BudgetError) console.error(`Stopped: ${err.message}`);
    else console.error(err);
    process.exit(1);
  });
}

/** Tokens and dollars per call, for the measured cost table. */
export function perCall(replies: readonly ModelReply[]) {
  const t = tally(replies);
  const n = Math.max(1, t.calls);
  const round = (x: number) => Math.round(x);
  return {
    calls: t.calls,
    outcomes: t.outcomes,
    batch: replies.some((r) => r.batch),
    meanTokens: { input: round(t.usage.input / n), cacheRead: round(t.usage.cacheRead / n), cacheWrite: round(t.usage.cacheWrite / n), output: round(t.usage.output / n), thinking: round(t.usage.thinking / n) },
    searches: t.usage.searches,
    cost: Math.round(t.cost * 10_000) / 10_000,
    costPerCall: Math.round((t.cost / n) * 1_000_000) / 1_000_000,
  };
}

export function writeSummary(name: string, summary: unknown): string {
  mkdirSync(TRIALS_DIR, { recursive: true });
  const file = path.join(TRIALS_DIR, `${name}.json`);
  writeFileSync(file, `${JSON.stringify(summary, null, 1)}\n`);
  return file;
}

/** The chance that a value drawn from `high` beats one drawn from `low` (ties count half): 0.5 is no better than a coin. */
export function separation(low: readonly number[], high: readonly number[]): number {
  if (low.length === 0 || high.length === 0) return 0.5;
  let wins = 0;
  for (const h of high) for (const l of low) wins += h > l ? 1 : h === l ? 0.5 : 0;
  return wins / (low.length * high.length);
}
