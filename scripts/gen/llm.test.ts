import type Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ask, askAll, askBatch, BudgetError, costOf, forecast, lastJsonObject, NO_USAGE, run, savedReplies, Spend, tally, toParams, toReply, type BatchResult, type ModelApi, type ModelRequest } from './llm';

const dir = mkdtempSync(path.join(tmpdir(), 'rebound-llm-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let files = 0;
const file = (name: string) => path.join(dir, `${++files}-${name}`);

const request = (id: string, more: Partial<ModelRequest> = {}): ModelRequest => ({
  id,
  step: 'solve',
  model: 'claude-sonnet-5-5',
  effort: 'medium',
  system: 'Answer the question as a player would.',
  user: 'What organelle makes most of a cell’s ATP?',
  schema: { type: 'object', additionalProperties: false, required: ['answer'], properties: { answer: { type: 'string' } } },
  maxTokens: 2000,
  ...more,
});

/** An API message, as the service would return it. */
function message(text: string, more: { stop?: Anthropic.Message['stop_reason']; input?: number; output?: number; thinking?: number; cacheRead?: number; cacheWrite?: number; searches?: number; citations?: Array<{ url: string; title: string; cited_text: string }>; category?: string } = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text, citations: more.citations ? more.citations.map((c) => ({ type: 'web_search_result_location', encrypted_index: 'x', ...c })) : null }],
    stop_reason: more.stop ?? 'end_turn',
    stop_sequence: null,
    stop_details: more.category ? { type: 'refusal', category: more.category, explanation: 'declined by policy' } : null,
    usage: {
      input_tokens: more.input ?? 1000,
      output_tokens: more.output ?? 500,
      output_tokens_details: { thinking_tokens: more.thinking ?? 300 },
      cache_creation_input_tokens: more.cacheWrite ?? 0,
      cache_read_input_tokens: more.cacheRead ?? 0,
      server_tool_use: more.searches ? { web_search_requests: more.searches, web_fetch_requests: 0 } : null,
    },
  } as unknown as Anthropic.Message;
}

/** A stand-in for the API that answers from a function and remembers what it was sent. */
function fake(answer: (params: Anthropic.MessageCreateParamsNonStreaming, call: number) => Anthropic.Message | Error) {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const batches: Array<Array<{ custom_id: string; params: Anthropic.MessageCreateParamsNonStreaming }>> = [];
  let inFlight = 0;
  let most = 0;
  const api: ModelApi = {
    async create(params) {
      sent.push(params);
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      const out = answer(params, sent.length);
      if (out instanceof Error) throw out;
      return out;
    },
    async batchCreate(requests) {
      batches.push(requests);
      return `batch_${batches.length}`;
    },
    async batchEnded() {
      return { ended: true, processing: 0 };
    },
    async batchResults(id): Promise<BatchResult[]> {
      const requests = batches[Number(id.split('_')[1]) - 1]!;
      return requests.map((r, i) => {
        const out = answer(r.params, i + 1);
        return out instanceof Error ? { id: r.custom_id, error: out.message } : { id: r.custom_id, message: out };
      });
    },
  };
  return { api, sent, batches, mostInFlight: () => most };
}

describe('what a call costs', () => {
  it('follows the price list: input, output, cache and searches, and half for a batch', () => {
    const usage = { ...NO_USAGE, input: 1000, output: 500 };
    expect(costOf('claude-sonnet-5-5', usage, false)).toBeCloseTo(0.007, 10);
    expect(costOf('claude-sonnet-5-5', usage, true)).toBeCloseTo(0.0035, 10);
    expect(costOf('claude-opus-5-5', usage, false)).toBeCloseTo(0.014, 10);
    expect(costOf('claude-haiku-5-5', usage, false)).toBeCloseTo(0.00035, 10);
    expect(costOf('claude-opus-5-5', { ...NO_USAGE, cacheWrite: 1_000_000, cacheRead: 1_000_000 }, false)).toBeCloseTo(5.2, 10);
    // The search fee is not halved.
    expect(costOf('claude-sonnet-5-5', { ...usage, searches: 2 }, true)).toBeCloseTo(0.0235, 10);
  });

  it('refuses a model with no recorded price, since its spending could not be counted', () => {
    expect(() => costOf('claude-unknown-9', NO_USAGE, false)).toThrow(/No price/);
    expect(() => toParams(request('a', { model: 'claude-unknown-9' }))).toThrow(/No price/);
  });
});

describe('a request', () => {
  it('carries the instructions marked for the cache, the effort and the reply’s shape', () => {
    const p = toParams(request('q-1'));
    expect(p.model).toBe('claude-sonnet-5-5');
    expect(p.max_tokens).toBe(2000);
    expect(p.system).toEqual([{ type: 'text', text: 'Answer the question as a player would.', cache_control: { type: 'ephemeral' } }]);
    expect(p.messages).toEqual([{ role: 'user', content: 'What organelle makes most of a cell’s ATP?' }]);
    expect(p.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: request('q-1').schema } });
    expect(p.tools).toBeUndefined();
  });

  it('can search allowed sites or run code, but not both, and not search with a JSON reply', () => {
    const search = toParams(request('q-1', { schema: undefined, search: { domains: ['nasa.gov', 'nlr.gov'], maxUses: 2 } }));
    expect(search.tools).toEqual([{ type: 'web_search_20260209', name: 'web_search', allowed_domains: ['nasa.gov', 'nlr.gov'], max_uses: 2 }]);
    expect(search.output_config).toEqual({ effort: 'medium' });
    expect(toParams(request('q-1', { code: true })).tools).toEqual([{ type: 'code_execution_20260120', name: 'code_execution' }]);
    expect(() => toParams(request('q-1', { search: { domains: ['nasa.gov'], maxUses: 1 } }))).toThrow(/one or the other/);
    expect(() => toParams(request('q-1', { schema: undefined, code: true, search: { domains: ['nasa.gov'], maxUses: 1 } }))).toThrow(/one tool/);
  });

  it('needs an id the batch interface accepts', () => {
    expect(() => toParams(request('doe-hs-13-r01-t01'))).not.toThrow();
    expect(() => toParams(request('has space'))).toThrow(/request id/);
    expect(() => toParams(request('x'.repeat(65)))).toThrow(/request id/);
  });
});

describe('a reply', () => {
  it('is parsed as JSON, with its tokens and cost', () => {
    const r = toReply(request('q-1'), message('{"answer":"MITOCHONDRION"}', { input: 200, output: 600, thinking: 450, cacheRead: 800 }), false);
    expect(r.outcome).toBe('ok');
    expect(r.json).toEqual({ answer: 'MITOCHONDRION' });
    expect(r.usage).toEqual({ input: 200, output: 600, thinking: 450, cacheWrite: 0, cacheRead: 800, searches: 0 });
    expect(r.cost).toBeCloseTo((200 * 2 + 600 * 10 + 800 * 0.1) / 1e6, 12);
    expect(r.batch).toBe(false);
  });

  it('says when the model declined, ran out of room or did not return JSON', () => {
    expect(toReply(request('q-1'), message('', { stop: 'refusal', category: 'bio' }), false)).toMatchObject({ outcome: 'refused', note: 'bio: declined by policy' });
    expect(toReply(request('q-1'), message('{"answer":"MITO', { stop: 'max_tokens' }), false)).toMatchObject({ outcome: 'cut-off' });
    expect(toReply(request('q-1'), message('I think it is the mitochondrion.'), false)).toMatchObject({ outcome: 'error', note: 'The reply was not the JSON asked for.' });
    // A refusal still costs what it used.
    expect(toReply(request('q-1'), message('', { stop: 'refusal', category: 'bio' }), false).cost).toBeGreaterThan(0);
  });

  it('keeps the search tool’s own citations', () => {
    const r = toReply(request('q-1', { schema: undefined, search: { domains: ['nasa.gov'], maxUses: 2 } }), message('The Moon lacks erosion. VERDICT: supported', { searches: 1, citations: [{ url: 'https://science.nasa.gov/moon/lunar-craters/', title: 'Lunar Craters', cited_text: 'Earth’s craters are erased by erosion' }] }), false);
    expect(r.citations).toEqual([{ url: 'https://science.nasa.gov/moon/lunar-craters/', title: 'Lunar Craters', quote: 'Earth’s craters are erased by erosion' }]);
    expect(r.usage.searches).toBe(1);
    expect(r.json).toBeUndefined();
  });

  it('can end with a JSON object when no schema could be asked for', () => {
    expect(lastJsonObject('I ran the code.\n{"answer":"4/3","consistent":true}')).toEqual({ answer: '4/3', consistent: true });
    expect(lastJsonObject('First {"a":1} then {"b":{"c":2}} done')).toEqual({ b: { c: 2 } });
    expect(lastJsonObject('no object here')).toBeUndefined();
  });
});

describe('live calls', () => {
  it('send a paused tool-using turn back until it finishes, and add up what both parts used', async () => {
    const { api, sent } = fake((_, call) => (call === 1 ? message('', { stop: 'pause_turn', input: 100, output: 50 }) : message('{"answer":"5"}', { input: 300, output: 80 })));
    const r = await ask(api, request('q-1', { code: true }));
    expect(sent).toHaveLength(2);
    expect(sent[1]!.messages).toHaveLength(2);
    expect(r.outcome).toBe('ok');
    expect(r.usage.input).toBe(400);
    expect(r.usage.output).toBe(130);
  });

  it('run a few at a time, save each reply as it comes and record what it cost', async () => {
    const { api, mostInFlight } = fake(() => message('{"answer":"x"}'));
    const spend = new Spend(file('spend.jsonl'), 5);
    const seen: string[] = [];
    const replies = await askAll(api, Array.from({ length: 12 }, (_, i) => request(`q-${i}`)), { spend, concurrency: 3, onReply: (r) => seen.push(r.id) });
    expect(replies.map((r) => r.id)).toEqual(Array.from({ length: 12 }, (_, i) => `q-${i}`));
    expect(seen).toHaveLength(12);
    expect(mostInFlight()).toBeLessThanOrEqual(3);
    expect(spend.total()).toBeCloseTo(12 * 0.007, 10);
    // The record outlives the run.
    expect(new Spend(spend.file, 5).total()).toBeCloseTo(12 * 0.007, 10);
  });

  it('stop sending once the limit is reached', async () => {
    const { api, sent } = fake(() => message('{"answer":"x"}'));
    const spend = new Spend(file('spend.jsonl'), 0.02);
    const replies = await askAll(api, Array.from({ length: 10 }, (_, i) => request(`q-${i}`)), { spend, concurrency: 1 });
    expect(sent).toHaveLength(3);
    expect(replies.filter((r) => r.outcome === 'ok')).toHaveLength(3);
    expect(replies[9]).toMatchObject({ outcome: 'error', note: 'Not sent: the spending limit was reached.', cost: 0 });
  });

  it('carry on past a call that fails, without charging for it', async () => {
    const { api } = fake((_, call) => (call === 2 ? new Error('socket hang up') : message('{"answer":"x"}')));
    const spend = new Spend(file('spend.jsonl'), 5);
    const replies = await askAll(api, [request('a'), request('b'), request('c')], { spend, concurrency: 1 });
    expect(replies.map((r) => r.outcome)).toEqual(['ok', 'error', 'ok']);
    expect(replies[1]!.note).toMatch(/socket hang up/);
    expect(spend.total()).toBeCloseTo(2 * 0.007, 10);
  });
});

describe('a batch', () => {
  const requests = Array.from({ length: 5 }, (_, i) => request(`q-${i}`));

  it('is sent once, at half price, and its id is kept until the results are in', async () => {
    const { api, batches } = fake(() => message('{"answer":"x"}'));
    const spend = new Spend(file('spend.jsonl'), 5);
    const stateFile = file('batch.json');
    const lines: string[] = [];
    const replies = await askBatch(api, requests, { spend, stateFile, expectedOutputTokens: 500, pollMs: 1, log: (l) => lines.push(l) });
    expect(batches).toHaveLength(1);
    expect(batches[0]!.map((r) => r.custom_id)).toEqual(requests.map((r) => r.id));
    expect(replies.every((r) => r.batch && r.outcome === 'ok')).toBe(true);
    expect(spend.total()).toBeCloseTo(5 * 0.0035, 10);
    expect(existsSync(stateFile)).toBe(false);
    expect(lines[0]).toMatch(/^Sent batch batch_1: 5 requests/);
  });

  it('is picked up, not sent again, when a run restarts while it is out', async () => {
    const { api, batches } = fake(() => message('{"answer":"x"}'));
    const stateFile = file('batch.json');
    await api.batchCreate(requests.map((r) => ({ custom_id: r.id, params: toParams(r) })));
    writeFileSync(stateFile, JSON.stringify({ batchId: 'batch_1' }));
    const replies = await askBatch(api, requests, { spend: new Spend(file('spend.jsonl'), 5), stateFile, expectedOutputTokens: 500, pollMs: 1 });
    expect(batches).toHaveLength(1);
    expect(replies).toHaveLength(5);
  });

  it('is not sent when its forecast does not fit under the limit', async () => {
    const { api, batches } = fake(() => message('{"answer":"x"}'));
    const big = Array.from({ length: 1000 }, (_, i) => request(`q-${i}`));
    expect(forecast(big, 500, true)).toBeGreaterThan(2);
    await expect(askBatch(api, big, { spend: new Spend(file('spend.jsonl'), 1), stateFile: file('batch.json'), expectedOutputTokens: 500, pollMs: 1 })).rejects.toThrow(BudgetError);
    expect(batches).toHaveLength(0);
  });

  it('reports a request the batch failed or lost', async () => {
    const { api } = fake((_, call) => (call === 2 ? new Error('The request failed (invalid_request_error): bad schema') : message('{"answer":"x"}')));
    const replies = await askBatch(api, requests, { spend: new Spend(file('spend.jsonl'), 5), stateFile: file('batch.json'), expectedOutputTokens: 500, pollMs: 1 });
    expect(replies.filter((r) => r.outcome === 'error').map((r) => [r.id, r.note])).toEqual([['q-1', 'The request failed (invalid_request_error): bad schema']]);
  });
});

describe('a run', () => {
  it('answers each request once however often it is restarted, and tries failures again', async () => {
    let failing = true;
    const { api, sent } = fake((params) => (failing && String(params.messages[0]!.content).includes('second') ? new Error('timeout') : message('{"answer":"x"}')));
    const runDir = file('run');
    const spend = new Spend(file('spend.jsonl'), 5);
    const requests = [request('a'), request('b', { user: 'the second question' }), request('c')];
    const first = await run(api, requests, { dir: runDir, mode: 'live', spend, expectedOutputTokens: 500, concurrency: 1 });
    expect([...first.values()].map((r) => r.outcome).sort()).toEqual(['error', 'ok', 'ok']);
    expect(sent).toHaveLength(3);
    failing = false;
    const second = await run(api, requests, { dir: runDir, mode: 'live', spend, expectedOutputTokens: 500, concurrency: 1 });
    expect(sent).toHaveLength(4);
    expect([...second.values()].every((r) => r.outcome === 'ok')).toBe(true);
    await run(api, requests, { dir: runDir, mode: 'live', spend, expectedOutputTokens: 500 });
    expect(sent).toHaveLength(4);
    expect(savedReplies(path.join(runDir, 'replies.jsonl')).size).toBe(3);
    // The file is a log: the failed try stays in it, and the later answer for the same request wins.
    expect(readFileSync(path.join(runDir, 'replies.jsonl'), 'utf8').trim().split('\n')).toHaveLength(4);
    expect(tally(second.values())).toMatchObject({ calls: 3, outcomes: { ok: 3, refused: 0, 'cut-off': 0, error: 0 } });
  });
});
