/**
 * The pipeline's one door to the Claude API. Every model step builds `ModelRequest`s and gets `ModelReply`s
 * back; nothing else in scripts/gen talks to the network. That keeps three promises in one place:
 *
 *  - **A request holds only what its step may see.** A blind solver's request has the question and nothing
 *    else, because the request is the whole of what the model is given.
 *  - **Every call is recorded**: the model, the tokens and the cost, in dollars at the prices below.
 *  - **Spending has a limit.** `Spend` adds up what has been spent, and nothing is sent once the limit is
 *    reached. The limit set on the Claude Console account is the backstop behind it.
 *
 * Calls go out one at a time ("live", for steps that search the web or run code) or as a batch, which costs
 * half and usually finishes within an hour. A batch's id is written to a file before anything else, so a
 * run that is interrupted picks the batch up again instead of paying for it twice.
 *
 * The key is read from the REBOUND_ANTHROPIC_API_KEY environment variable, or ANTHROPIC_API_KEY when that is
 * not set, and is never printed or written anywhere. The first name is there in case ANTHROPIC_API_KEY, the
 * name that also controls Claude Code's own sign-in, is kept from the commands a Claude Code cloud session
 * runs. The address is fixed for a like reason: inside such a session ANTHROPIC_BASE_URL points at the
 * session's own service, which the SDK would otherwise pick up.
 */
import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const API_BASE = 'https://api.anthropic.com';
/** Where the key is looked for, in this order. */
export const KEY_VARIABLES = ['REBOUND_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY'] as const;

/** The key and the variable it came from, or null. */
function keyFromEnvironment(): { key: string; variable: string } | null {
  for (const variable of KEY_VARIABLES) {
    const key = process.env[variable]?.trim();
    if (key) return { key, variable };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Prices                                                              */
/* ------------------------------------------------------------------ */

/** The day the prices below were read from https://platform.claude.com/docs/en/about-claude/pricing. */
export const PRICES_CHECKED = '2026-11-21';

/** Dollars per million tokens. Haiku 5.5's are for prompts up to 100,000 tokens, which every step's are. */
export const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-fable-5-2': { input: 8, output: 40, cacheWrite: 10, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
};
/** Dollars per web search ($10 per 1,000), on top of the tokens the results take. Not halved in a batch. */
export const SEARCH_PRICE = 0.01;
/** A batch costs this share of the standard token price. */
export const BATCH_DISCOUNT = 0.5;

export interface Usage {
  /** Input tokens at full price. */
  input: number;
  /** Output tokens, thinking included. */
  output: number;
  /** Of the output: tokens the model spent reasoning. */
  thinking: number;
  /** Input tokens written to the prompt cache (1.25 times the input price). */
  cacheWrite: number;
  /** Input tokens read from the prompt cache (a small fraction of the input price). */
  cacheRead: number;
  /** Web searches made. */
  searches: number;
}

export const NO_USAGE: Usage = { input: 0, output: 0, thinking: 0, cacheWrite: 0, cacheRead: 0, searches: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return { input: a.input + b.input, output: a.output + b.output, thinking: a.thinking + b.thinking, cacheWrite: a.cacheWrite + b.cacheWrite, cacheRead: a.cacheRead + b.cacheRead, searches: a.searches + b.searches };
}

function priceOf(model: string) {
  const price = PRICES[model];
  if (!price) throw new Error(`No price is recorded for the model "${model}" (scripts/gen/llm.ts, PRICES), so its cost could not be counted. Add it from the published price list first.`);
  return price;
}

/** What a call cost, in dollars. */
export function costOf(model: string, usage: Usage, batch: boolean): number {
  const p = priceOf(model);
  const tokens = (usage.input * p.input + usage.output * p.output + usage.cacheWrite * p.cacheWrite + usage.cacheRead * p.cacheRead) / 1_000_000;
  return tokens * (batch ? BATCH_DISCOUNT : 1) + usage.searches * SEARCH_PRICE;
}

/* ------------------------------------------------------------------ */
/* Requests and replies                                                */
/* ------------------------------------------------------------------ */

export type Effort = 'low' | 'medium' | 'high';

export interface ModelRequest {
  /** Ties the reply to what was asked. Unique within a run; letters, digits, "-" and "_" only, 64 at most. */
  id: string;
  /** The step that asks ("solve", "judge"…), for the record of spending. */
  step: string;
  model: string;
  effort: Effort;
  /** What is the same for every request of the step: the instructions. Marked for the prompt cache. */
  system: string;
  /** What changes from request to request. */
  user: string;
  /** The reply must be JSON of this shape. Not possible together with `search`, whose replies carry citations. */
  schema?: Record<string, unknown>;
  /** Let the model search the web, on these sites only, at most this many times. */
  search?: { domains: string[]; maxUses: number };
  /** Let the model run Python in Anthropic's sandbox. */
  code?: boolean;
  /** The most output tokens the reply may take, thinking included: the ceiling on what one call can cost. */
  maxTokens: number;
}

export interface Citation {
  url: string;
  title: string;
  /** The words the search tool took from the page (150 characters at most). */
  quote: string;
}

export interface ModelReply {
  id: string;
  step: string;
  model: string;
  at: string;
  /** "refused": the model declined. "cut-off": it ran out of `maxTokens`. "error": the call or its JSON failed. */
  outcome: 'ok' | 'refused' | 'cut-off' | 'error';
  text: string;
  /** The parsed reply, when a schema was asked for and the reply was whole. */
  json?: unknown;
  citations: Citation[];
  usage: Usage;
  batch: boolean;
  /** Dollars. */
  cost: number;
  /** Why it was refused, or what went wrong. */
  note?: string;
}

type Params = Anthropic.MessageCreateParamsNonStreaming;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The API request for a pipeline request. */
export function toParams(request: ModelRequest): Params {
  if (!ID.test(request.id)) throw new Error(`"${request.id}" cannot be a request id: use letters, digits, "-" and "_", 64 at most.`);
  if (request.schema && request.search) throw new Error(`Request ${request.id} asks for both a JSON reply and web search; the API allows one or the other.`);
  if (request.code && request.search) throw new Error(`Request ${request.id} asks for both code and web search; give a step one tool.`);
  priceOf(request.model);
  const tools: NonNullable<Params['tools']> = [];
  if (request.search) tools.push({ type: 'web_search_20260209', name: 'web_search', allowed_domains: request.search.domains, max_uses: request.search.maxUses });
  if (request.code) tools.push({ type: 'code_execution_20260120', name: 'code_execution' });
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: request.user }],
    output_config: { effort: request.effort, ...(request.schema ? { format: { type: 'json_schema' as const, schema: request.schema } } : {}) },
    ...(tools.length ? { tools } : {}),
  };
}

function usageOf(message: Anthropic.Message): Usage {
  const u = message.usage;
  return {
    input: u.input_tokens,
    output: u.output_tokens,
    thinking: u.output_tokens_details?.thinking_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    searches: u.server_tool_use?.web_search_requests ?? 0,
  };
}

/** The last JSON object in a text: for steps that cannot ask for a schema and are told to end with one. */
export function lastJsonObject(text: string): unknown {
  for (let start = text.lastIndexOf('{'); start >= 0; start = text.lastIndexOf('{', start - 1)) {
    const end = text.lastIndexOf('}');
    if (end < start) return undefined;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // An inner brace: try the one before it.
    }
    if (start === 0) break;
  }
  return undefined;
}

/** The pipeline's reply for an API message. `usage` is the total when the message took more than one call. */
export function toReply(request: ModelRequest, message: Anthropic.Message, batch: boolean, usage = usageOf(message), now = new Date()): ModelReply {
  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const citations: Citation[] = [];
  for (const block of message.content) {
    if (block.type !== 'text') continue;
    for (const c of block.citations ?? []) {
      if (c.type === 'web_search_result_location') citations.push({ url: c.url, title: c.title ?? '', quote: c.cited_text });
    }
  }
  const reply: ModelReply = { id: request.id, step: request.step, model: request.model, at: now.toISOString(), outcome: 'ok', text, citations, usage, batch, cost: costOf(request.model, usage, batch) };
  if (message.stop_reason === 'refusal') {
    const details = message.stop_details;
    return { ...reply, outcome: 'refused', note: details ? [details.category, details.explanation].filter(Boolean).join(': ') || 'declined' : 'declined' };
  }
  if (message.stop_reason === 'max_tokens') return { ...reply, outcome: 'cut-off', note: `The reply ran past ${request.maxTokens} tokens.` };
  if (message.stop_reason === 'pause_turn') return { ...reply, outcome: 'error', note: 'The model was still using its tools when the turn was paused.' };
  if (request.schema) {
    try {
      reply.json = JSON.parse(text);
    } catch {
      return { ...reply, outcome: 'error', note: 'The reply was not the JSON asked for.' };
    }
  }
  return reply;
}

const failed = (request: ModelRequest, batch: boolean, note: string): ModelReply => ({ id: request.id, step: request.step, model: request.model, at: new Date().toISOString(), outcome: 'error', text: '', citations: [], usage: NO_USAGE, batch, cost: 0, note });

/* ------------------------------------------------------------------ */
/* The API, and a stand-in for tests                                   */
/* ------------------------------------------------------------------ */

export interface BatchResult {
  id: string;
  message?: Anthropic.Message;
  /** Why there is no message: the request was invalid, the service failed, or the batch expired first. */
  error?: string;
}

/** The few calls the pipeline makes. Tests pass a stand-in; `claudeApi` is the real thing. */
export interface ModelApi {
  create(params: Params): Promise<Anthropic.Message>;
  batchCreate(requests: Array<{ custom_id: string; params: Params }>): Promise<string>;
  batchEnded(id: string): Promise<{ ended: boolean; processing: number }>;
  batchResults(id: string): Promise<BatchResult[]>;
}

/** The key was refused, or the account cannot pay: nothing more should be sent. */
export class KeyError extends Error {}

/** The name of the variable the key was found in, or null when there is no key. */
export function keyVariable(): string | null {
  return keyFromEnvironment()?.variable ?? null;
}

/** The Claude API, with the key from the environment. */
export function claudeApi(apiKey = keyFromEnvironment()?.key): ModelApi & { client: Anthropic } {
  if (!apiKey) throw new KeyError(`No Claude API key: neither ${KEY_VARIABLES.join(' nor ')} is set in the environment.`);
  const client = new Anthropic({ apiKey, authToken: null, baseURL: API_BASE, maxRetries: 4, timeout: 15 * 60_000 });
  return {
    client,
    // Streamed and gathered, so a long search or a long reply cannot run into a request timeout.
    create: (params) => client.messages.stream(params).finalMessage(),
    batchCreate: async (requests) => (await client.messages.batches.create({ requests })).id,
    batchEnded: async (id) => {
      const b = await client.messages.batches.retrieve(id);
      return { ended: b.processing_status === 'ended', processing: b.request_counts.processing };
    },
    batchResults: async (id) => {
      const out: BatchResult[] = [];
      for await (const r of await client.messages.batches.results(id)) {
        if (r.result.type === 'succeeded') out.push({ id: r.custom_id, message: r.result.message });
        else if (r.result.type === 'errored') out.push({ id: r.custom_id, error: `The request failed (${r.result.error.error.type}): ${r.result.error.error.message}` });
        else out.push({ id: r.custom_id, error: r.result.type === 'expired' ? 'The batch expired before this request ran.' : 'The batch was cancelled before this request ran.' });
      }
      return out;
    },
  };
}

function explain(err: unknown): { note: string; fatal: boolean } {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return { note: 'The Claude API refused the key.', fatal: true };
  if (err instanceof Anthropic.BadRequestError && /credit balance|billing/i.test(err.message)) return { note: `The account cannot pay for this call: ${err.message}`, fatal: true };
  if (err instanceof Anthropic.RateLimitError) return { note: 'The Claude API is limiting requests; this one was not answered after several tries.', fatal: false };
  if (err instanceof Anthropic.APIError) return { note: `The Claude API answered with an error (${err.status ?? 'no status'}): ${err.message}`, fatal: false };
  return { note: `The call failed: ${err instanceof Error ? err.message : String(err)}`, fatal: false };
}

/* ------------------------------------------------------------------ */
/* Spending                                                            */
/* ------------------------------------------------------------------ */

/** The spending limit was reached: nothing more is sent. */
export class BudgetError extends Error {}

/**
 * What has been spent, kept as one line per call in a file, and the limit it may not pass. The file outlives a
 * run, so a limit covers everything recorded in it.
 */
export class Spend {
  private spent = 0;
  constructor(
    readonly file: string,
    /** Dollars. */
    readonly limit: number,
  ) {
    if (!(limit >= 0)) throw new Error('A spending limit must be a number of dollars, zero or more.');
    if (existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) if (line.trim()) this.spent += (JSON.parse(line) as { cost: number }).cost;
    }
  }

  total(): number {
    return this.spent;
  }

  /** Dollars left under the limit. */
  room(): number {
    return Math.max(0, this.limit - this.spent);
  }

  /** Stop unless `expected` more dollars fit under the limit. */
  check(expected: number, what: string): void {
    if (this.spent + expected > this.limit) {
      throw new BudgetError(`${what} is expected to cost about $${expected.toFixed(2)}, but only $${this.room().toFixed(2)} is left of the $${this.limit.toFixed(2)} limit ($${this.spent.toFixed(2)} spent).`);
    }
  }

  record(reply: ModelReply): void {
    if (reply.cost === 0 && reply.outcome === 'error') return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    appendFileSync(this.file, `${JSON.stringify({ at: reply.at, step: reply.step, id: reply.id, model: reply.model, batch: reply.batch, usage: reply.usage, cost: reply.cost })}\n`);
    this.spent += reply.cost;
  }
}

/**
 * A rough forecast of what requests will cost, for checking against the limit before sending: the prompt at
 * about three characters a token, and `outputTokens` of reply each (measure it on a few calls first).
 */
export function forecast(requests: readonly ModelRequest[], outputTokens: number, batch: boolean): number {
  let dollars = 0;
  for (const r of requests) {
    const input = Math.ceil((r.system.length + r.user.length) / 3);
    dollars += costOf(r.model, { ...NO_USAGE, input, output: outputTokens, searches: r.search?.maxUses ?? 0 }, batch);
  }
  return dollars;
}

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

/** How many times a paused tool-using turn is sent back to be finished. */
const MAX_CONTINUES = 4;

/** One live call. A turn the server paused while using its tools is sent back until it finishes. */
export async function ask(api: ModelApi, request: ModelRequest): Promise<ModelReply> {
  const params = toParams(request);
  let usage = NO_USAGE;
  try {
    let message = await api.create(params);
    usage = addUsage(usage, usageOf(message));
    for (let i = 0; message.stop_reason === 'pause_turn' && i < MAX_CONTINUES; i++) {
      message = await api.create({ ...params, messages: [...params.messages, { role: 'assistant', content: message.content as Anthropic.ContentBlockParam[] }] });
      usage = addUsage(usage, usageOf(message));
    }
    return toReply(request, message, false, usage);
  } catch (err) {
    const { note, fatal } = explain(err);
    if (fatal) throw new KeyError(note);
    // Tokens already used by an earlier part of the turn are still owed.
    return { ...failed(request, false, note), usage, cost: costOf(request.model, usage, false) };
  }
}

export interface SendOptions {
  spend: Spend;
  /** Called with each reply as it arrives, so it can be saved at once. */
  onReply?: (reply: ModelReply) => void;
  /** Live calls in flight at once. */
  concurrency?: number;
}

/**
 * Live calls, a few at a time. Each reply is recorded in `spend` as it arrives; once the limit is reached the
 * rest are not sent and come back as errors saying so.
 */
export async function askAll(api: ModelApi, requests: readonly ModelRequest[], options: SendOptions): Promise<ModelReply[]> {
  const replies = new Array<ModelReply>(requests.length);
  let next = 0;
  let stopped: Error | null = null;
  const worker = async () => {
    while (next < requests.length && !stopped) {
      const i = next++;
      const request = requests[i]!;
      if (options.spend.room() <= 0) {
        replies[i] = failed(request, false, 'Not sent: the spending limit was reached.');
        continue;
      }
      try {
        replies[i] = await ask(api, request);
      } catch (err) {
        stopped = err instanceof Error ? err : new Error(String(err));
        return;
      }
      options.spend.record(replies[i]!);
      options.onReply?.(replies[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 4, requests.length)) }, worker));
  if (stopped) throw stopped;
  for (let i = 0; i < requests.length; i++) replies[i] ??= failed(requests[i]!, false, 'Not sent: the spending limit was reached.');
  return replies;
}

export interface BatchOptions extends SendOptions {
  /** Where the batch's id is kept while it runs, so an interrupted run picks it up instead of sending it again. */
  stateFile: string;
  /** Tokens of reply to expect per request, for the check against the limit. */
  expectedOutputTokens: number;
  /** Milliseconds between looks at the batch. */
  pollMs?: number;
  log?: (line: string) => void;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The same requests as one batch, at half price. Returns when the batch has ended, which is usually within
 * the hour and can take a day. The forecast must fit under the spending limit before anything is sent.
 */
export async function askBatch(api: ModelApi, requests: readonly ModelRequest[], options: BatchOptions): Promise<ModelReply[]> {
  if (requests.length === 0) return [];
  const log = options.log ?? (() => {});
  const byId = new Map(requests.map((r) => [r.id, r]));
  if (byId.size !== requests.length) throw new Error('Two requests in the batch have the same id.');
  let batchId: string;
  if (existsSync(options.stateFile)) {
    batchId = (JSON.parse(readFileSync(options.stateFile, 'utf8')) as { batchId: string }).batchId;
    log(`Picking up batch ${batchId}, sent earlier.`);
  } else {
    const expected = forecast(requests, options.expectedOutputTokens, true);
    options.spend.check(expected, `This batch of ${requests.length} requests`);
    try {
      batchId = await api.batchCreate(requests.map((r) => ({ custom_id: r.id, params: toParams(r) })));
    } catch (err) {
      const { note, fatal } = explain(err);
      if (fatal) throw new KeyError(note);
      throw new Error(`The batch could not be sent. ${note}`);
    }
    mkdirSync(path.dirname(options.stateFile), { recursive: true });
    writeFileSync(options.stateFile, `${JSON.stringify({ batchId, requests: requests.length, sent: new Date().toISOString() })}\n`);
    log(`Sent batch ${batchId}: ${requests.length} requests, about $${expected.toFixed(2)} expected.`);
  }
  for (;;) {
    const { ended, processing } = await api.batchEnded(batchId);
    if (ended) break;
    log(`Batch ${batchId}: ${processing} still to run.`);
    await wait(options.pollMs ?? 60_000);
  }
  const replies: ModelReply[] = [];
  const answered = new Set<string>();
  for (const result of await api.batchResults(batchId)) {
    const request = byId.get(result.id);
    if (!request) continue;
    answered.add(result.id);
    const reply = result.message ? toReply(request, result.message, true) : failed(request, true, result.error ?? 'No reply.');
    options.spend.record(reply);
    options.onReply?.(reply);
    replies.push(reply);
  }
  for (const r of requests) if (!answered.has(r.id)) replies.push(failed(r, true, 'The batch returned nothing for this request.'));
  rmSync(options.stateFile, { force: true });
  return replies;
}

/* ------------------------------------------------------------------ */
/* A run: requests answered once, however often it is restarted        */
/* ------------------------------------------------------------------ */

/** The replies saved in a run's file, by request id (the last one wins). */
export function savedReplies(file: string): Map<string, ModelReply> {
  const out = new Map<string, ModelReply>();
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const reply = JSON.parse(line) as ModelReply;
    out.set(reply.id, reply);
  }
  return out;
}

export interface RunOptions {
  /** The run's folder: replies.jsonl is kept there, and the batch's state while one is running. */
  dir: string;
  mode: 'live' | 'batch';
  spend: Spend;
  expectedOutputTokens: number;
  concurrency?: number;
  pollMs?: number;
  log?: (line: string) => void;
}

/**
 * Answer every request once. Replies are saved as they arrive; a request already answered (or refused, or
 * cut off) is not sent again when the run is restarted, and one that failed is tried again.
 */
export async function run(api: ModelApi, requests: readonly ModelRequest[], options: RunOptions): Promise<Map<string, ModelReply>> {
  mkdirSync(options.dir, { recursive: true });
  const file = path.join(options.dir, 'replies.jsonl');
  const saved = savedReplies(file);
  const todo = requests.filter((r) => {
    const reply = saved.get(r.id);
    return !reply || reply.outcome === 'error';
  });
  const log = options.log ?? (() => {});
  if (todo.length < requests.length) log(`${requests.length - todo.length} of ${requests.length} already answered.`);
  const onReply = (reply: ModelReply) => {
    appendFileSync(file, `${JSON.stringify(reply)}\n`);
    saved.set(reply.id, reply);
  };
  if (todo.length === 0) return saved;
  if (options.mode === 'batch') {
    await askBatch(api, todo, { spend: options.spend, onReply, stateFile: path.join(options.dir, 'batch.json'), expectedOutputTokens: options.expectedOutputTokens, pollMs: options.pollMs, log });
  } else {
    options.spend.check(forecast(todo, options.expectedOutputTokens, false), `These ${todo.length} calls`);
    const replies = await askAll(api, todo, { spend: options.spend, onReply, concurrency: options.concurrency });
    for (const reply of replies) if (!saved.has(reply.id)) saved.set(reply.id, reply);
  }
  return saved;
}

/** Totals for a set of replies: how many ended each way, the tokens and the dollars. */
export function tally(replies: Iterable<ModelReply>): { calls: number; outcomes: Record<ModelReply['outcome'], number>; usage: Usage; cost: number } {
  const out = { calls: 0, outcomes: { ok: 0, refused: 0, 'cut-off': 0, error: 0 }, usage: NO_USAGE, cost: 0 };
  for (const r of replies) {
    out.calls += 1;
    out.outcomes[r.outcome] += 1;
    out.usage = addUsage(out.usage, r.usage);
    out.cost += r.cost;
  }
  return out;
}
