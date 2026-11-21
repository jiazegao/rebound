import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { libraryBuilt, loadLibrary } from '../library';
import { asRead } from '../steps/show';
import { isNumericAnswer } from '../text';
import { Said, standIn } from './standin';

// The trials keep their replies and their record of spending in the bank folder: a throwaway one here.
const bank = mkdtempSync(path.join(tmpdir(), 'rebound-checks-'));
process.env.REBOUND_BANK = bank;
afterAll(() => rmSync(bank, { recursive: true, force: true }));

const { trialArgs } = await import('./common');
const { sampleDoe } = await import('./doe');
const { computeTrial, knownWrong, renamedLabQuestions, secondTrial, sourceTrial, spread } = await import('./checks');

describe('the checks trial’s test sets', () => {
  it('takes items spread evenly through a list', () => {
    expect(spread([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5)).toEqual([0, 2, 4, 6, 8]);
    expect(spread([1, 2, 3], 9)).toEqual([1, 2, 3]);
    expect(spread([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });

  it('has the pilot’s five questions that name a lab by its old name', () => {
    const qs = renamedLabQuestions();
    expect(qs).toHaveLength(5);
    expect(qs.every((q) => q.stem.includes('National Renewable Energy Laboratory'))).toBe(true);
  });
});

describe.skipIf(!libraryBuilt())('the keys known to be wrong', () => {
  const library = loadLibrary();
  const known = knownWrong(library);

  it('are seven misprinted letters, shown as DOE printed them, and two disputed keys', () => {
    expect(known.filter((k) => k.kind === 'misprinted letter')).toHaveLength(7);
    expect(known.filter((k) => k.kind === 'disputed key')).toHaveLength(2);
    const winds = known.find((k) => k.id === 'doe-hs-01-r10-t19')!;
    // DOE printed "W) WINDS"; winds is choice Z. The key under test is the letter as printed, with that letter's choice.
    expect(winds.question.answerLetter).toBe('W');
    expect(winds.question.answer).toBe('RIVER CURRENTS');
    expect(winds.rightLetter).toBe('Z');
    expect(winds.solverSaid).toBe('Z) winds');
    for (const k of known.filter((x) => x.kind === 'misprinted letter')) expect(k.question.answerLetter).not.toBe(k.rightLetter);
  });
});

// The trials themselves, against a stand-in for the API: the scoring must be right before any money is spent.
describe.skipIf(!libraryBuilt())('a checks trial without the API', () => {
  const library = loadLibrary();
  const sample = sampleDoe(library);
  const args = (limit: number) => trialArgs({ model: 'claude-sonnet-5-5', mode: 'live' }, ['--limit', String(limit)]);

  it('scores a recomputation that is right except for every eighth question', async () => {
    const byText = new Map(sample.map((s) => [asRead(s.question), s]));
    let n = 0;
    const api = standIn((user, _system, params) => {
      expect(params.tools).toEqual([{ type: 'code_execution_20260120', name: 'code_execution' }]);
      const q = byText.get(user)!.question;
      const wrong = n++ % 8 === 0;
      const letter = q.format === 'multiple_choice' ? (wrong ? (q.answerLetter === 'W' ? 'X' : 'W') : q.answerLetter) : '';
      return new Said(`Set up and computed.\n${JSON.stringify({ answer: wrong ? '123456789' : q.format === 'multiple_choice' ? q.choices![q.answerLetter!] : q.answer, letter, value: null, consistent: !wrong, problems: wrong ? ['The values cannot both hold.'] : [], seconds: 30 })}`);
    });
    const summary = await computeTrial(sample, args(24), api);
    expect(api.calls).toBe(24);
    expect(summary.questions).toBe(24);
    expect(summary.read).toBe(24);
    expect(summary.results.every((r) => isNumericAnswer(sample.find((s) => s.id === r.id)!.question))).toBe(true);
    expect(summary.disagrees).toBeCloseTo(3 / 24, 3);
    expect(summary.agrees + summary.close).toBeCloseTo(21 / 24, 3);
    expect(summary.calledInconsistent).toBe(3);
    // Thirty seconds is over the time allowed for a toss-up and for a bonus.
    expect(summary.overTheTimeAllowed.tossups).toBe(summary.overTheTimeAllowed.ofTossups);
    expect(summary.overTheTimeAllowed.bonuses).toBe(summary.overTheTimeAllowed.ofBonuses);
    expect(summary.calls.batch).toBe(false);
  }, 60_000);

  it('scores a source check that supports what it is shown unless the key is "river currents"', async () => {
    const page = { url: 'https://www.usgs.gov/faqs/example', title: 'USGS', quote: 'words from the page' };
    let fromMemory = 0;
    const api = standIn((user, _system, params) => {
      expect((params.tools![0] as { type: string }).type).toBe('web_search_20260209');
      if (/ANSWER: W\) RIVER CURRENTS/.test(user)) return new Said('The page says wind forms them.\nCLAIM: Aeolian sandstones are formed by river currents.\nVERDICT: contradicted', [page], 2);
      if (/National Renewable Energy Laboratory/.test(user)) return new Said('The laboratory is now the National Laboratory of the Rockies.\nCLAIM: x\nVERDICT: supported', [page], 1);
      // Supported, but now and then with no page to show for it.
      if (user.length % 5 !== 0) return new Said('The page agrees.\nCLAIM: x\nVERDICT: supported', [page], 1);
      fromMemory += 1;
      return new Said('From memory.\nCLAIM: x\nVERDICT: supported', [], 1);
    });
    const summary = await sourceTrial(library, sample, args(20), api);
    expect(summary.rightKeys.questions).toBe(20);
    expect(summary.rightKeys.supported + summary.rightKeys.notFound).toBe(20);
    expect(summary.rightKeys.contradicted).toBe(0);
    expect(summary.wrongKeys).toMatchObject({ questions: 7, contradicted: 1 });
    expect(summary.wrongKeys.supported + summary.wrongKeys.notFound).toBe(6);
    expect(summary.disputedKeys.questions).toBe(2);
    expect(summary.renamedLab).toMatchObject({ questions: 5, supported: 5, noticedTheNewName: 5 });
    // "Supported" with no page is counted as nothing found.
    expect(fromMemory).toBeGreaterThan(0);
    expect(summary.results.filter((r) => r.verdict === 'not-found')).toHaveLength(fromMemory);
    expect(summary.results.find((r) => r.id === 'wrong-doe-hs-01-r10-t19')).toMatchObject({ verdict: 'contradicted', searches: 2, sources: [page.url] });
    expect(api.calls).toBe(34);
    // A search costs a cent on top of the tokens.
    expect(summary.calls.searches).toBeGreaterThanOrEqual(34);
    expect(summary.calls.cost).toBeGreaterThan(0.34);
  }, 60_000);

  it('scores a second look that sides with whatever solver it is told about', async () => {
    const api = standIn((user) => {
      const solver = /A solver who saw only the question answered (.+?), with confidence/.exec(user)?.[1];
      return new Said(`Reasoning.\n${JSON.stringify(solver ? { ruling: 'key wrong', answer: solver, reason: 'The solver was right.', fix: { stem: '', accept: [], reject: [] } } : { ruling: 'key right', answer: '', reason: 'Nothing wrong.', fix: { stem: '', accept: [], reject: [] } })}`);
    });
    const summary = await secondTrial(library, sample, trialArgs({ model: 'claude-opus-5-5', mode: 'live' }, ['--limit', '6']), api);
    expect(summary.wrongKeys).toMatchObject({ questions: 7, keyWrong: 7 });
    expect(summary.disputedKeys).toMatchObject({ questions: 2, keyWrong: 2 });
    // A checker that believes every solver overturns right keys too: the trial must show it.
    expect(summary.rightKeysWithAWrongSolver).toMatchObject({ questions: 6, keyWrong: 6, keyRight: 0 });
    expect(summary.spotChecks).toMatchObject({ questions: 3, keyRight: 3 });
    expect(summary.results.find((r) => r.id === 'wrong-doe-hs-01-r10-t19')!.answer).toBe('Z) winds');
    expect(api.calls).toBe(18);
  }, 60_000);
});
