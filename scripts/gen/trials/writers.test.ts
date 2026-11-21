import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { libraryBuilt, loadLibrary } from '../library';
import { scripted, STAND_IN_USAGE, standIn } from './standin';

// The trial keeps its replies, its spending and the questions it writes in the bank folder: a throwaway one here.
const bank = mkdtempSync(path.join(tmpdir(), 'rebound-writers-'));
process.env.REBOUND_BANK = bank;
afterAll(() => rmSync(bank, { recursive: true, force: true }));

// Nothing may have fixed the bank folder before the line above redirected it: a trial run here would then
// write its stand-in replies and spending into the real one.
const { BANK_DIR } = await import('../ledger');
if (BANK_DIR !== bank) throw new Error('The bank folder was fixed before this test redirected it: a static import here loads ledger.ts.');

const { costOf, NO_USAGE } = await import('../llm');
const { trialArgs } = await import('./common');
const { checkerFor, trialSlots, writersTrial } = await import('./writers');

describe('the writer comparison’s slots', () => {
  it('are the slots of planned rounds without Energy, the same every time', () => {
    const slots = trialSlots('HS', 'late', 50);
    expect(slots).toHaveLength(50);
    expect(slots.some((s) => s.subject === 'energy')).toBe(false);
    expect(new Set(slots.map((s) => s.id)).size).toBe(50);
    // A round gives 40 slots once its six Energy slots are left out, so the 41st is the second round's first.
    expect(slots[0]!.id).toBe('1t01');
    expect(slots[40]!.id).toBe('2t01');
    expect(slots.every((s) => s.level === 'HS' && s.tier === 'late')).toBe(true);
    expect(trialSlots('HS', 'late', 50)).toEqual(slots);
    expect(trialSlots('MS', 'early', 6).every((s) => s.level === 'MS' && s.tier === 'early')).toBe(true);
  });

  it('are checked by a model that did not write them', () => {
    expect(checkerFor('claude-opus-5-5')).toBe('claude-sonnet-5-5');
    expect(checkerFor('claude-sonnet-5-5')).toBe('claude-opus-5-5');
  });
});

describe.skipIf(!libraryBuilt())('the writer comparison without the API', () => {
  const library = loadLibrary();

  it('scores each writer’s set-up in questions that come through and in dollars', async () => {
    const slots = trialSlots('HS', 'late', 16);
    const api = standIn(scripted({ textRepeats: new Set([slots[1]!.id]), solverWrong: new Set([slots[2]!.id]), brokenTwice: new Set([slots[3]!.id]) }));
    const args = trialArgs({ model: '', mode: 'live' }, ['--limit', '16']);
    const summary = await writersTrial(library, { level: 'HS', tier: 'late', slots: 60, writers: ['claude-opus-5-5', 'claude-sonnet-5-5'] }, args, api);
    expect(summary.slots).toBe(16);
    expect(summary.writers.map((w) => [w.writer, w.checker])).toEqual([['claude-opus-5-5', 'claude-sonnet-5-5'], ['claude-sonnet-5-5', 'claude-opus-5-5']]);
    for (const w of summary.writers) {
      expect(w.slots).toBe(16);
      // Three ideas a slot; the scripted judge calls the first of each a repeat.
      expect(w.ideas.proposed).toBe(48);
      expect(w.ideas.byRelation).toEqual({ same: 16, related: 16, new: 16 });
      expect(w.ideas.repeats).toBeCloseTo(1 / 3, 3);
      expect(w.written).toBe(16);
      expect(w.style).toEqual({ passedFirstTime: 15, repaired: 0, failedTwice: 1, notWritten: 0 });
      expect(w.textScreen.repeats).toBe(1);
      expect(w.solver).toEqual({ unanswered: 0, passed: 13, toSecondLook: 1 });
      expect(w.passed).toBe(13);
      expect(w.difficulty).toMatchObject({ ratedBy: w.checker, passed: 4, through: 4 });
      const calls = Object.values(w.cost.stages).reduce((a, s) => a + s.calls, 0);
      // Ideas (one request a topic group), 48 idea screens, 16 drafts, 1 repair, 15 text screens, 14 solves, 14 ratings.
      expect(calls - w.cost.stages.ideas!.calls).toBe(48 + 16 + 1 + 15 + 14 + 14);
      expect(w.cost.total).toBeCloseTo(Object.values(w.cost.stages).reduce((a, s) => a + s.cost, 0), 3);
      expect(w.cost.writing + w.cost.checking).toBeCloseTo(w.cost.total, 3);
      expect(w.cost.passedPerDollar).toBeCloseTo(13 / w.cost.total, 0);
      // Every stand-in reply reports the same tokens, so a stage costs its calls times the model's price.
      const one = (model: string) => costOf(model, { ...NO_USAGE, input: STAND_IN_USAGE.input, output: STAND_IN_USAGE.output, cacheRead: STAND_IN_USAGE.cacheRead }, false);
      expect(w.cost.stages.write!.cost).toBeCloseTo(16 * one(w.writer), 3);
      expect(w.cost.stages.solve!.cost).toBeCloseTo(14 * one(w.checker), 3);
      expect(w.cost.stages['idea-screen']!.model).toBe('claude-haiku-5-5');
    }
    // Opus writes for twice Sonnet's price, and is checked for half of it.
    expect(summary.writers[0]!.cost.writing).toBeGreaterThan(summary.writers[1]!.cost.writing);
    expect(summary.writers[0]!.cost.checking).toBeLessThan(summary.writers[1]!.cost.checking);

    // The questions go to the bank folder, and nothing of them is in the summary.
    const file = path.join(bank, 'trials', 'writers-hs-late-16-claude-opus-5-5.json');
    expect(existsSync(file)).toBe(true);
    const kept = JSON.parse(readFileSync(file, 'utf8')) as { results: Array<{ outcome: string; question: string | null; ended?: { stage: string } }> };
    expect(kept.results).toHaveLength(16);
    expect(kept.results[0]!.question).toContain('slot 1t01');
    expect(kept.results[1]!.ended!.stage).toBe('text-screen');
    expect(kept.results[2]!.outcome).toBe('second-look');
    expect(kept.results[3]!.ended!.stage).toBe('style');
    expect(JSON.stringify(summary)).not.toContain('slot 1t01');

    // Asked again, nothing is sent: every reply is on file.
    const before = api.calls;
    await writersTrial(library, { level: 'HS', tier: 'late', slots: 60, writers: ['claude-opus-5-5', 'claude-sonnet-5-5'] }, args, api);
    expect(api.calls).toBe(before);
  }, 120_000);
});
