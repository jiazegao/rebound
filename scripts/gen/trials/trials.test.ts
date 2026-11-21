import type Anthropic from '@anthropic-ai/sdk';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { libraryBuilt, loadLibrary } from '../library';
import type { BatchResult, ModelApi } from '../llm';
import { asRead, asReadWithAnswer } from '../steps/show';

// The trials keep their replies and their record of spending in the bank folder: a throwaway one here.
const bank = mkdtempSync(path.join(tmpdir(), 'rebound-trials-'));
process.env.REBOUND_BANK = bank;
afterAll(() => rmSync(bank, { recursive: true, force: true }));

const { seeded, separation, shuffled, trialArgs } = await import('./common');
const { anchorsFor, eligible, known, rate, sampleDoe, solve, tierOf } = await import('./doe');
const { judgeTrial } = await import('./judge');

type Params = Anthropic.MessageCreateParamsNonStreaming;

/** A stand-in for the API that answers each request from its own text. */
function fake(answer: (user: string, system: string) => unknown): ModelApi & { calls: number } {
  const message = (params: Params): Anthropic.Message =>
    ({
      id: 'msg',
      type: 'message',
      role: 'assistant',
      model: params.model,
      content: [{ type: 'text', text: JSON.stringify(answer(String(params.messages[0]!.content), (params.system as Array<{ text: string }>)[0]!.text)), citations: null }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: 100, output_tokens: 400, output_tokens_details: { thinking_tokens: 250 }, cache_creation_input_tokens: 0, cache_read_input_tokens: 700, server_tool_use: null },
    }) as unknown as Anthropic.Message;
  let batch: Array<{ custom_id: string; params: Params }> = [];
  const api = {
    calls: 0,
    async create(params: Params) {
      api.calls += 1;
      return message(params);
    },
    async batchCreate(requests: Array<{ custom_id: string; params: Params }>) {
      batch = requests;
      api.calls += requests.length;
      return 'batch_1';
    },
    async batchEnded() {
      return { ended: true, processing: 0 };
    },
    async batchResults(): Promise<BatchResult[]> {
      return batch.map((r) => ({ id: r.custom_id, message: message(r.params) }));
    },
  };
  return api;
}

describe('the trials’ arithmetic', () => {
  it('draws the same random numbers for the same seed', () => {
    const a = seeded(42);
    const b = seeded(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(shuffled([1, 2, 3, 4, 5, 6], seeded(7))).toEqual(shuffled([1, 2, 3, 4, 5, 6], seeded(7)));
    expect(shuffled([1, 2, 3, 4, 5, 6], seeded(7)).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('measures how well a score separates two groups', () => {
    expect(separation([1, 2], [3, 4])).toBe(1);
    expect(separation([3, 3], [3, 3])).toBe(0.5);
    expect(separation([1, 3], [2, 4])).toBe(0.75);
    expect(separation([], [1])).toBe(0.5);
  });

  it('reads a trial’s options', () => {
    expect(trialArgs({ model: 'claude-sonnet-5-5', mode: 'batch' }, ['--solve', '--limit', '40', '--mode', 'live'])).toMatchObject({ model: 'claude-sonnet-5-5', mode: 'live', limit: 40, budget: 40 });
    expect(trialArgs({ model: 'claude-sonnet-5-5', mode: 'batch' }, ['--model', 'claude-haiku-5-5', '--budget', '5']).budget).toBe(5);
    expect(() => trialArgs({ model: 'x', mode: 'batch' }, ['--mode', 'fast'])).toThrow();
  });
});

describe.skipIf(!libraryBuilt())('the DOE sample', () => {
  const library = loadLibrary();
  const sample = sampleDoe(library);

  it('is 1,200 questions, 25 toss-ups and 25 bonuses for each level, category and tier, the same every time', () => {
    expect(sample).toHaveLength(1200);
    const cells = new Map<string, number>();
    for (const s of sample) cells.set(`${s.level}/${s.subject}/${s.tier}/${s.kind}`, (cells.get(`${s.level}/${s.subject}/${s.tier}/${s.kind}`) ?? 0) + 1);
    expect(cells.size).toBe(48);
    expect([...cells.values()].every((n) => n === 25)).toBe(true);
    expect(sampleDoe(library).map((s) => s.id)).toEqual(sample.map((s) => s.id));
    expect(new Set(sample.map((s) => s.id)).size).toBe(1200);
  });

  it('takes only complete, unflagged questions of 2014 on that need no picture', () => {
    const ok = new Set(eligible(library).map((x) => x.question.id));
    const byId = new Map(library.map((x) => [x.question.id, x]));
    for (const s of sample) {
      expect(ok.has(s.id), s.id).toBe(true);
      const x = byId.get(s.id)!;
      expect(x.year).toBeGreaterThanOrEqual(2014);
      expect(tierOf(x.round)).toBe(s.tier);
      expect(x.question.flags ?? []).toEqual([]);
    }
  });

  it('gives the rater anchors of each tier that are not in the sample', () => {
    const inSample = new Set(sample.map((s) => s.id));
    const a = anchorsFor(library, 'HS', 'physics', inSample);
    expect(a.early).toHaveLength(4);
    expect(a.late).toHaveLength(4);
    for (const q of [...a.early, ...a.late]) {
      expect(inSample.has(q.id)).toBe(false);
      expect(q.subject).toBe('physics');
    }
    expect(a.early.filter((q) => q.kind === 'tossup')).toHaveLength(2);
  });
});

// The trials themselves, against a stand-in for the API: the scoring must be right before any money is spent.
describe.skipIf(!libraryBuilt())('a trial run without the API', () => {
  const library = loadLibrary();
  const sample = sampleDoe(library);
  const args = (more: string[]) => trialArgs({ model: 'claude-sonnet-5-5', mode: 'live' }, ['--limit', '48', ...more]);
  const every = (n: number) => sample.filter((_, i) => i % Math.floor(sample.length / n) === 0).slice(0, n);

  it('scores a blind solver that is right nine times in ten', async () => {
    const chosen = every(48);
    const byText = new Map(chosen.map((s, i) => [asRead(s.question), { s, i }]));
    const api = fake((user) => {
      const { s, i } = byText.get(user)!;
      const wrong = i % 10 === 0;
      const q = s.question;
      const letter = q.format === 'multiple_choice' ? (wrong ? (q.answerLetter === 'W' ? 'X' : 'W') : q.answerLetter) : '';
      return { answer: wrong ? 'not the answer at all' : q.format === 'multiple_choice' ? q.choices![q.answerLetter!] : q.answer, letter, confidence: wrong ? 2 : 5, otherAnswers: [], problems: wrong ? [{ kind: 'ambiguous', note: 'unsure' }] : [], seconds: 4, difficulty: s.tier === 'late' ? 4 : 2 };
    });
    const summary = await solve(chosen, args(['--mode', 'batch']), api);
    expect(api.calls).toBe(48);
    expect(summary.answered).toBe(48);
    expect(summary.all.disagrees).toBeCloseTo(5 / 48, 2);
    expect(summary.all.agrees + summary.all.close).toBeCloseTo(43 / 48, 2);
    expect(summary.flagged.questions).toBe(5);
    expect(summary.flagged.amongDisagreements).toBe(1);
    expect(summary.difficulty.HS.separation).toBe(1);
    expect(summary.calls.batch).toBe(true);
    expect(summary.calls.costPerCall).toBeCloseTo((100 * 2 + 400 * 10 + 700 * 0.1) / 1e6 / 2, 6);
    // Asked again, nothing is sent: the replies are on file.
    await solve(chosen, args(['--mode', 'batch']), api);
    expect(api.calls).toBe(48);
  }, 60_000);

  it('scores a rater that follows the tiers', async () => {
    const chosen = every(48);
    const tiers = new Map(chosen.map((s) => [asReadWithAnswer(s.question), s.tier]));
    const api = fake((user) => ({ score: tiers.get(user) === 'late' ? 4 : 2, reason: 'by its round' }));
    const summary = await rate(library, chosen, args([]), api);
    // One question from each of the 48 cells, so each is its cell's quarter.
    expect(summary.rated).toBe(48);
    expect(summary.HS).toEqual({ early: 2, late: 4, separation: 1 });
    expect(summary.MS.early).toBe(2);
  }, 60_000);

  it('counts a misprinted letter as caught when the solver gives the corrected one', async () => {
    const byId = new Map(library.map((x) => [x.question.id, x.question]));
    const byText = new Map([...byId.values()].map((q) => [asRead(q), q]));
    const api = fake((user) => {
      const q = byText.get(user)!;
      return { answer: q.choices?.[q.answerLetter!] ?? q.answer, letter: q.answerLetter ?? '', confidence: 5, otherAnswers: [], problems: [], seconds: 3, difficulty: 2 };
    });
    const summary = await known(library, args([]), api);
    expect(summary.of).toBe(9);
    // A solver that always agrees with the library catches the seven corrected letters and neither disputed key.
    expect(summary.caught).toBe(7);
    expect(summary.results.filter((r) => r.kind === 'disputed key').every((r) => r.caught === false)).toBe(true);
  }, 60_000);

  it('scores a judge that calls everything the same as the first question listed', async () => {
    const api = fake((user) => {
      const first = /<library>\n\[([^\]]+)\]/.exec(user)?.[1] ?? '';
      return { relation: first ? 'same' : 'new', match: first, reason: 'test' };
    });
    const summary = await judgeTrial(trialArgs({ model: 'claude-haiku-5-5', mode: 'live' }, ['--limit', '70']), api);
    expect(summary.repeats.drafts).toBe(55);
    expect(summary.repeats.thrownAway).toBe(55);
    // The 63 labelled pairs come first, then seven of the final rounds' other questions.
    expect(summary.templates.drafts + summary.different.drafts).toBe(15);
    expect(summary.different.kept).toBe(0);
    expect(new Set(summary.results.map((r) => r.n)).size).toBe(70);
    // Naming the first question listed is right only when the pilot's match heads the list.
    expect(summary.repeats.namedTheMatch).toBeGreaterThan(10);
    expect(summary.repeats.namedTheMatch).toBeLessThan(55);
    expect(summary.results.filter((r) => r.label === 'same').every((r) => r.searchFoundIt)).toBe(true);
  }, 60_000);
});
