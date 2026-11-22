import { describe, expect, it } from 'vitest';
import { loadLabs } from '../labs';
import { NO_USAGE, toParams, type Citation, type ModelReply } from '../llm';
import { loadSources } from '../sources';
import type { NewsItem, QuestionText } from '../types';
import { COMPUTE_PROMPT, computationAgrees, computeRequest, readComputation, type Computation } from './compute';
import { readSecondLook, SECOND_PROMPT, SECOND_SEARCHES, secondLookRequest } from './second';
import { asRead } from './show';
import { readSourceCheck, SOURCE_PROMPT, SOURCE_SEARCHES, sourceRequest } from './source';

const lists = loadSources();
const labs = loadLabs();

const said = (text: string, citations: Citation[] = [], more: Partial<ModelReply> = {}): ModelReply => ({ id: 'x', step: 'test', model: 'claude-sonnet-5-5', at: '2026-11-21T00:00:00.000Z', outcome: 'ok', text, citations, codeRuns: 0, usage: NO_USAGE, batch: false, cost: 0, ...more });

const car: QuestionText = { kind: 'bonus', subject: 'physics', format: 'short_answer', stem: 'A car starting at rest undergoes a constant acceleration of 16 meters per second squared. In meters per second, what is the speed of the car after it has traveled half a meter?', answer: '4', accept: [], reject: [] };
const half: QuestionText = { kind: 'tossup', subject: 'math', format: 'short_answer', stem: 'What is the probability that a fair coin lands heads?', answer: '1/2', accept: [], reject: [] };
const dam: QuestionText = { kind: 'bonus', subject: 'physics', format: 'multiple_choice', stem: 'In meters per second, which of the following is closest to the speed of water leaving a crack 80 meters below the surface of a lake?', choices: { W: '10', X: '30', Y: '40', Z: '60' }, answerLetter: 'Y', answer: '40', accept: [], reject: [] };
const helicase: QuestionText = { kind: 'tossup', subject: 'biology', format: 'short_answer', stem: 'What enzyme unwinds the DNA double helix at the replication fork?', answer: 'HELICASE', accept: [], reject: [] };

describe('recomputing a numeric answer', () => {
  const computed = (more: Partial<Computation>): Computation => ({ answer: '', letter: '', value: null, consistent: true, problems: [], seconds: 10, ranCode: true, ...more });

  it('is given the question as read, and the code tool', () => {
    const r = computeRequest('rb-hs-000002', car, 'HS', 'claude-sonnet-5-5');
    expect(r.step).toBe('compute');
    expect(r.user).toBe(asRead(car));
    expect(r.user).not.toContain('ANSWER');
    expect(r.code).toBe(true);
    expect(r.schema).toBeUndefined();
    expect(toParams(r).tools).toEqual([{ type: 'code_execution_20260120', name: 'code_execution' }]);
    expect(COMPUTE_PROMPT).toMatch(/^[0-9a-f]{8}$/);
  });

  it('reads the JSON object the reply ends with', () => {
    const c = readComputation(said('v² = 2ad = 2 × 16 × 0.5 = 16, so v = 4.\n\n{"answer": "4", "letter": "", "value": 4, "consistent": true, "problems": [], "seconds": 12}'));
    // No code was run for this reply, and it says so.
    expect(c).toEqual({ answer: '4', letter: '', value: 4, consistent: true, problems: [], seconds: 12, ranCode: false });
    expect(readComputation(said('{"answer": "4"}', [], { codeRuns: 2 }))!.ranCode).toBe(true);
    const odd = readComputation(said('{"answer": " 40 ", "letter": "Y", "value": "39.6", "consistent": false, "problems": ["The depth is given as a water level.", ""], "seconds": -3}'))!;
    expect(odd).toEqual({ answer: '40', letter: 'Y', value: null, consistent: false, problems: ['The depth is given as a water level.'], seconds: 0, ranCode: false });
    expect(readComputation(said('I could not set this up.'))).toBeNull();
    expect(readComputation(said('{"answer": ""}'))).toBeNull();
    expect(readComputation(said('{"answer": "4"}', [], { outcome: 'error' }))).toBeNull();
  });

  it('is held against the answer line: the same, a different value, or the same value in another form', () => {
    expect(computationAgrees(car, computed({ answer: '4', value: 4 }))).toBe('agrees');
    expect(computationAgrees(car, computed({ answer: '8', value: 8 }))).toBe('disagrees');
    expect(computationAgrees(half, computed({ answer: '1/2', value: 0.5 }))).toBe('agrees');
    expect(computationAgrees(half, computed({ answer: '3/4', value: 0.75 }))).toBe('disagrees');
    // Equal in value, not in form: never a plain disagreement.
    expect(computationAgrees(half, computed({ answer: '0.5', value: 0.5 }))).not.toBe('disagrees');
    expect(computationAgrees(half, computed({ answer: 'one half', value: 0.5 }))).not.toBe('disagrees');
    // A percentage worked out as a fraction is the same value too.
    const carnot = { ...half, stem: 'What is the efficiency of a Carnot engine between 500 kelvin and 200 kelvin?', answer: '60%' };
    expect(computationAgrees(carnot, computed({ answer: '3/5', value: 0.6 }))).toBe('close');
    expect(computationAgrees(carnot, computed({ answer: '2/5', value: 0.4 }))).toBe('disagrees');
    expect(computationAgrees(dam, computed({ answer: '40', letter: 'Y', value: 39.6 }))).toBe('agrees');
    expect(computationAgrees(dam, computed({ answer: '30', letter: 'X', value: 30 }))).toBe('disagrees');
  });
});

describe('the source check', () => {
  const nih: Citation = { url: 'https://www.ncbi.nlm.nih.gov/books/NBK26850/', title: 'DNA Replication Mechanisms', quote: 'DNA helicases … unwind the double helix at the replication fork' };

  it('is given the question with its answer, and a search limited to the allowed sites', () => {
    const r = sourceRequest('rb-hs-000003', helicase, 'HS', lists, labs, 'claude-sonnet-5-5');
    expect(r.step).toBe('source');
    expect(r.user).toContain('ANSWER: HELICASE');
    expect(r.schema).toBeUndefined();
    expect(r.search!.maxUses).toBe(SOURCE_SEARCHES);
    expect(r.search!.domains).toEqual(expect.arrayContaining(['nih.gov', 'wikipedia.org', 'ornl.gov']));
    expect(r.search!.domains).not.toContain('openstax.org');
    const tool = toParams(r).tools![0] as { type: string; allowed_domains: string[]; max_uses: number };
    // The plain search tool: the newer one's replies carry no citations.
    expect(tool.type).toBe('web_search_20250305');
    expect(tool.max_uses).toBe(SOURCE_SEARCHES);
    expect(SOURCE_PROMPT).toMatch(/^[0-9a-f]{8}$/);
  });

  it('gives an Energy question’s checker the news item its opening rests on', () => {
    const news: NewsItem = { id: 'n1', lab: 'Oak Ridge National Laboratory', date: '2026-10-02', url: 'https://www.ornl.gov/news/example', title: 'Neutrons show how ions move', summary: 'Two sentences.' };
    const r = sourceRequest('x', { ...helicase, subject: 'energy' }, 'HS', lists, labs, 'claude-sonnet-5-5', news);
    expect(r.user).toContain('<news_item>\nLaboratory: Oak Ridge National Laboratory');
    expect(r.user).toContain('Page: https://www.ornl.gov/news/example');
  });

  it('keeps the search tool’s own words as the source', () => {
    const c = readSourceCheck(said('The NCBI Bookshelf states that helicases unwind the helix.\n\nCLAIM: Helicase unwinds DNA at the replication fork.\nVERDICT: supported', [nih, nih]), lists, labs, '2026-11-21')!;
    expect(c.verdict).toBe('supported');
    expect(c.claim).toBe('Helicase unwinds DNA at the replication fork.');
    expect(c.sources).toEqual([{ title: 'DNA Replication Mechanisms', url: nih.url, quote: nih.quote, checked: '2026-11-21' }]);
    expect(c.note).toBe('The NCBI Bookshelf states that helicases unwind the helix.');
  });

  it('does not count "supported" without a page from an allowed site', () => {
    expect(readSourceCheck(said('I am sure of this.\nCLAIM: x\nVERDICT: supported'), lists, labs)!.verdict).toBe('not-found');
    const offList: Citation[] = [{ url: 'https://openstax.org/books/biology-2e/pages/14-4', title: 'OpenStax', quote: 'helicase' }, { url: 'https://example.com/dna', title: 'Somewhere', quote: 'helicase' }];
    const c = readSourceCheck(said('CLAIM: x\nVERDICT: supported', offList), lists, labs)!;
    expect(c.sources).toEqual([]);
    expect(c.verdict).toBe('not-found');
  });

  it('reads the other verdicts, however the line is dressed', () => {
    expect(readSourceCheck(said('CLAIM: x\n**VERDICT:** Contradicted', [nih]), lists, labs)!.verdict).toBe('contradicted');
    expect(readSourceCheck(said('**CLAIM:** The claim.\nVERDICT: not found'), lists, labs)).toMatchObject({ verdict: 'not-found', claim: 'The claim.' });
    expect(readSourceCheck(said('The pages agree.'), lists, labs)).toBeNull();
    expect(readSourceCheck(said('VERDICT: supported', [nih], { outcome: 'cut-off' }), lists, labs)).toBeNull();
  });
});

describe('the second look', () => {
  it('is told what the checks found, never why the writer thought the answer right', () => {
    const r = secondLookRequest('rb-hs-000003-2', helicase, 'HS', ['A solver answered TOPOISOMERASE, with confidence 3.', 'No source was found.'], lists, labs, 'claude-opus-5-5');
    expect(r.step).toBe('second-look');
    expect(r.effort).toBe('high');
    expect(r.user).toContain('ANSWER: HELICASE');
    expect(r.user).toContain('<what_the_checks_found>\n- A solver answered TOPOISOMERASE, with confidence 3.\n- No source was found.\n</what_the_checks_found>');
    expect(r.search!.maxUses).toBe(SECOND_SEARCHES);
    expect(r.code).toBeUndefined();
    expect(SECOND_PROMPT).toMatch(/^[0-9a-f]{8}$/);
    expect(() => toParams(r)).not.toThrow();
  });

  it('gives a calculation the code tool instead of search, and says when it is only a spot check', () => {
    const r = secondLookRequest('x', car, 'HS', [], lists, labs, 'claude-opus-5-5');
    expect(r.code).toBe(true);
    expect(r.search).toBeUndefined();
    expect(r.user).toContain('This is a spot check.');
    expect(() => toParams(r)).not.toThrow();
  });

  it('reads the ruling, and a fix only for an ambiguous question', () => {
    const ambiguous = readSecondLook(said('Both names are in use.\n{"ruling": "ambiguous", "answer": "HELICASE", "reason": "DnaB is the same enzyme in bacteria.", "fix": {"stem": "", "accept": ["DNA HELICASE", " "], "reject": []}}'), lists, labs)!;
    expect(ambiguous).toEqual({ ruling: 'ambiguous', answer: 'HELICASE', reason: 'DnaB is the same enzyme in bacteria.', fix: { stem: '', accept: ['DNA HELICASE'], reject: [] }, sources: [] });
    const wrong = readSecondLook(said('{"ruling": "key wrong", "answer": "TOPOISOMERASE", "reason": "x", "fix": {"stem": "A new stem?", "accept": ["y"], "reject": []}}'), lists, labs)!;
    expect(wrong.ruling).toBe('key wrong');
    expect(wrong.fix).toEqual({ stem: '', accept: [], reject: [] });
    expect(readSecondLook(said('{"ruling": "key right", "answer": "HELICASE", "reason": "x"}'), lists, labs)!.fix).toEqual({ stem: '', accept: [], reject: [] });
    expect(readSecondLook(said('{"ruling": "probably fine"}'), lists, labs)).toBeNull();
    expect(readSecondLook(said('No JSON here.'), lists, labs)).toBeNull();
  });

  it('keeps the pages it cited, from allowed sites only', () => {
    const cited: Citation[] = [{ url: 'https://en.wikipedia.org/wiki/Helicase', title: 'Helicase', quote: 'Helicases are a class of enzymes' }, { url: 'https://naqt.com/x', title: 'NAQT', quote: 'helicase' }];
    expect(readSecondLook(said('{"ruling": "key right", "answer": "HELICASE", "reason": "x", "fix": {}}', cited), lists, labs, '2026-11-21')!.sources).toEqual([{ title: 'Helicase', url: 'https://en.wikipedia.org/wiki/Helicase', quote: 'Helicases are a class of enzymes', checked: '2026-11-21' }]);
  });
});
