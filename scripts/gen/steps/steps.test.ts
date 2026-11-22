import { describe, expect, it } from 'vitest';
import { NO_USAGE, toParams, type ModelReply } from '../llm';
import type { QuestionText } from '../types';
import { draftText, isRepeat, JUDGE_PROMPT, JUDGE_SCHEMA, judgeRequest, readJudgment } from './judge';
import { rateRequest, readRating } from './rate';
import { asRead, asReadWithAnswer, onOneLine, promptVersion } from './show';
import { matchRequest, readMatch, settled } from './match';
import { compare, readings, readSolution, SOLVE_SCHEMA, solveRequest, unacceptedAnswers, type Solution } from './solve';

const reply = (json: unknown, more: Partial<ModelReply> = {}): ModelReply => ({ id: 'x', step: 'test', model: 'claude-sonnet-5-5', at: '2026-11-21T00:00:00.000Z', outcome: 'ok', text: JSON.stringify(json), json, citations: [], codeRuns: 0, usage: NO_USAGE, batch: false, cost: 0, ...more });

const lichen: QuestionText = { kind: 'bonus', subject: 'biology', format: 'short_answer', stem: 'A lichen is a partnership between a fungus and what other kind of organism that carries out photosynthesis?', answer: 'ALGAE', accept: ['GREEN ALGAE', 'CYANOBACTERIA'], reject: ['MOSS'] };
const gas: QuestionText = { kind: 'tossup', subject: 'chemistry', format: 'multiple_choice', stem: 'Which of the following elements is a noble gas?', choices: { W: 'Argon', X: 'Chlorine', Y: 'Sodium', Z: 'Sulfur' }, answerLetter: 'W', answer: 'ARGON', accept: [], reject: [] };

describe('showing a question to a model', () => {
  it('gives what a player hears: kind, category, format, stem and choices, and no answer', () => {
    expect(asRead(gas)).toBe('TOSS-UP · CHEMISTRY · Multiple Choice\nWhich of the following elements is a noble gas?\nW) Argon\nX) Chlorine\nY) Sodium\nZ) Sulfur');
    expect(asRead(lichen)).not.toMatch(/ALGAE|MOSS/);
  });

  it('adds the answer line only when asked', () => {
    expect(asReadWithAnswer(gas).split('\n').at(-1)).toBe('ANSWER: W) ARGON');
    expect(asReadWithAnswer(lichen).split('\n').at(-1)).toBe('ANSWER: ALGAE (ACCEPT: GREEN ALGAE, CYANOBACTERIA) (DO NOT ACCEPT: MOSS)');
  });

  it('puts a library question on one line with its id', () => {
    expect(onOneLine('doe-hs-03-r08-b06', { stem: 'Lichens are a symbiotic relationship\n of what 2 general types of organisms?', answer: 'GREEN ALGAE AND FUNGI' })).toBe('[doe-hs-03-r08-b06] Lichens are a symbiotic relationship of what 2 general types of organisms?  ANSWER: GREEN ALGAE AND FUNGI');
    expect(onOneLine('a', { ...gas, answer: 'ARGON' })).toBe('[a] Which of the following elements is a noble gas?  W) Argon  X) Chlorine  Y) Sodium  Z) Sulfur  ANSWER: W) ARGON');
  });

  it('names a prompt by its wording', () => {
    expect(promptVersion('abc')).toMatch(/^[0-9a-f]{8}$/);
    expect(promptVersion('abc')).not.toBe(promptVersion('abd'));
    expect(JUDGE_PROMPT).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('the duplicate judge', () => {
  const library = [{ id: 'doe-hs-03-r08-b06', line: '[doe-hs-03-r08-b06] Lichens are a symbiotic relationship of what 2 general types of organisms?  ANSWER: GREEN ALGAE AND FUNGI' }];

  it('is shown the draft with its answer and the library questions the search found', () => {
    const r = judgeRequest('rb-ms-000051', lichen, library, 'claude-sonnet-5-5');
    expect(r.step).toBe('judge-text');
    expect(r.user).toContain('<draft>\nBONUS · BIOLOGY · Short Answer');
    expect(r.user).toContain('ANSWER: ALGAE');
    expect(r.user).toContain('<library>\n[doe-hs-03-r08-b06]');
    expect(() => toParams(r)).not.toThrow();
  });

  it('is shown an idea as its three lines', () => {
    const idea = { answer: 'ALGAE', fact: 'A lichen is a fungus living with an alga or cyanobacterium.', cue: 'Name the photosynthetic partner of the fungus in a lichen.' };
    expect(judgeRequest('i-1', idea, library, 'claude-haiku-5-5').step).toBe('judge-idea');
    expect(draftText(idea)).toBe('Answer: ALGAE\nFact tested: A lichen is a fungus living with an alga or cyanobacterium.\nHow the question will point to it: Name the photosynthetic partner of the fungus in a lichen.');
    expect(judgeRequest('i-1', idea, [], 'claude-haiku-5-5').user).toContain('(the search found nothing)');
  });

  it('takes the closest relation among the library questions the judge compared, with its comparison as the reason', () => {
    const j = readJudgment(reply({ tests: 'The partners in a lichen.', closest: [{ id: 'doe-hs-99-r01-t01', tests: 'A moss.', compare: 'Only the topic is shared.', relation: 'related' }, { id: '[doe-hs-03-r08-b06]', tests: 'The two partners in a lichen.', compare: 'Both ask for the partners in a lichen.', relation: 'same' }] }), library)!;
    expect(j.relation).toBe('same');
    expect(j.match).toBe('doe-hs-03-r08-b06');
    expect(j.reason).toBe('Both ask for the partners in a lichen.');
    expect(j.tests).toBe('The partners in a lichen.');
    // A question the judge names that is not on the list keeps its relation and loses its id.
    expect(j.closest).toEqual([{ id: '', tests: 'A moss.', compare: 'Only the topic is shared.', relation: 'related' }, { id: 'doe-hs-03-r08-b06', tests: 'The two partners in a lichen.', compare: 'Both ask for the partners in a lichen.', relation: 'same' }]);
    expect(readJudgment(reply({ tests: 'x', closest: [{ id: 'not-on-the-list', tests: 'y', compare: 'c', relation: 'reversed' }] }), library)).toMatchObject({ relation: 'reversed', match: '' });
  });

  it('asks for the comparison before the relation, so the relation follows from it', () => {
    expect(Object.keys(JUDGE_SCHEMA.properties.closest.items.properties)).toEqual(['id', 'tests', 'compare', 'relation']);
  });

  it('calls a draft new when the judge found nothing close, and refuses a reply it cannot read', () => {
    expect(readJudgment(reply({ tests: 'x', closest: [] }), library)).toMatchObject({ relation: 'new', match: '', closest: [], reason: 'Nothing the search found is close.' });
    expect(readJudgment(reply({ tests: 'x', closest: [{ id: 'doe-hs-03-r08-b06', tests: 'y', compare: 'c', relation: 'identical' }] }), library)).toBeNull();
    expect(readJudgment(reply({ tests: 'x' }), library)).toBeNull();
    expect(readJudgment(reply(undefined, { outcome: 'refused' }), library)).toBeNull();
  });

  it('throws away what is the same or reversed, and keeps the rest', () => {
    expect(['same', 'reversed', 'template', 'related', 'new'].map((r) => isRepeat(r as 'same'))).toEqual([true, true, false, false, false]);
  });
});

describe('the blind solver', () => {
  const solved = (more: Partial<Solution>): Solution => ({ answer: '', letter: '', confidence: 5, otherAnswers: [], problems: [], remarks: [], seconds: 3, difficulty: 2, ...more });

  it('is given the question as read and nothing that could give the answer away', () => {
    const r = solveRequest('H001', lichen, 'MS', 'claude-sonnet-5-5');
    expect(r.user).toBe(asRead(lichen));
    expect(r.user).not.toMatch(/ALGAE|ACCEPT/);
    expect(r.system).toContain('middle school teams');
    expect(r.system).not.toMatch(/ALGAE/);
    expect(() => toParams(r)).not.toThrow();
  });

  it('reads a reply, and tidies what is out of range', () => {
    const s = readSolution(reply({ answer: ' Algae ', letter: '', confidence: 9, otherAnswers: ['cyanobacteria', ''], problems: [{ kind: 'ambiguous', note: 'two partners are possible' }, { kind: 'giveaway', note: 'a matter of style is not a fault' }], remarks: ['The stem is long.', ' '], seconds: 4, difficulty: 2 }));
    expect(s).toEqual({ answer: 'Algae', letter: '', confidence: 5, otherAnswers: ['cyanobacteria'], problems: [{ kind: 'ambiguous', note: 'two partners are possible' }], remarks: ['The stem is long.'], seconds: 4, difficulty: 2 });
    // A reply with no remarks still reads.
    expect(readSolution(reply({ answer: 'Algae', letter: '', confidence: 4, otherAnswers: [], problems: [], seconds: 3, difficulty: 1 }))).toMatchObject({ remarks: [] });
    expect(readSolution(reply({ letter: 'W' }))).toBeNull();
    expect(readSolution(reply(undefined, { outcome: 'cut-off' }))).toBeNull();
  });

  it('is held against the answer line by the answer checker', () => {
    expect(compare(lichen, solved({ answer: 'algae' }))).toBe('agrees');
    expect(compare(lichen, solved({ answer: 'cyanobacteria' }))).toBe('agrees');
    expect(compare(lichen, solved({ answer: 'moss' }))).toBe('disagrees');
    expect(compare(lichen, solved({ answer: '' }))).toBe('disagrees');
    expect(compare(gas, solved({ answer: 'Argon', letter: 'W' }))).toBe('agrees');
    expect(compare(gas, solved({ answer: 'Chlorine', letter: 'X' }))).toBe('disagrees');
    // The letter is what counts when both are given.
    expect(compare(gas, solved({ answer: 'Argon', letter: 'X' }))).toBe('disagrees');
  });

  it('does not ask the solver to write out its working, which the API refuses as extracting its reasoning', () => {
    expect(Object.keys(SOLVE_SCHEMA.properties)).not.toContain('working');
    expect(solveRequest('x', lichen, 'HS', 'claude-sonnet-5-5').effort).toBe('high');
  });

  it('reads an answer that carries a second form in brackets as either form', () => {
    expect(readings('Sodium (Na+)')).toEqual(['Sodium (Na+)', 'Sodium', 'Na+']);
    expect(readings('LIGO [Laser Interferometer Gravitational-Wave Observatory]')).toEqual(['LIGO [Laser Interferometer Gravitational-Wave Observatory]', 'LIGO', 'Laser Interferometer Gravitational-Wave Observatory']);
    expect(readings(' algae ')).toEqual(['algae']);
    expect(compare(lichen, solved({ answer: 'Algae (the photobiont)' }))).toBe('agrees');
    expect(compare(lichen, solved({ answer: 'a photobiont (cyanobacteria)' }))).toBe('agrees');
    expect(compare(lichen, solved({ answer: 'Moss (a bryophyte)' }))).toBe('disagrees');
  });

  it('points out a defensible answer the answer line would mark wrong', () => {
    expect(unacceptedAnswers(lichen, solved({ answer: 'algae', otherAnswers: ['cyanobacteria', 'a photobiont'] }))).toEqual(['a photobiont']);
  });
});

describe('matching an answer to the answer line', () => {
  it('is shown the question with its answer line and what the player said', () => {
    const r = matchRequest('m1', lichen, ' photobiont ', 'MS', 'claude-haiku-5-5');
    expect(r.step).toBe('match');
    expect(r.user).toBe(`<question>\n${asReadWithAnswer(lichen)}\n</question>\n\n<player_answer>\nphotobiont\n</player_answer>`);
    expect(r.system).toContain('Do not decide whether the answer line itself is right.');
    expect(() => toParams(r)).not.toThrow();
  });

  it('reads the verdict, which comes after the comparison', () => {
    expect(readMatch(reply({ compare: 'The same organism by another name.', verdict: 'accept' }))).toEqual({ verdict: 'accept', why: 'The same organism by another name.' });
    expect(readMatch(reply({ compare: 'x', verdict: 'maybe' }))).toBeNull();
    expect(readMatch(reply(undefined, { outcome: 'error' }))).toBeNull();
  });

  it('settles what the answer checker could not', () => {
    expect(settled('agrees', null)).toBe('agrees');
    expect(settled('agrees', { verdict: 'reject', why: '' })).toBe('agrees');
    expect(settled('disagrees', { verdict: 'accept', why: '' })).toBe('agrees');
    expect(settled('close', { verdict: 'reject', why: '' })).toBe('disagrees');
    expect(settled('disagrees', { verdict: 'unsure', why: '' })).toBe('close');
    // With no ruling, the checker's own verdict stands.
    expect(settled('disagrees', null)).toBe('disagrees');
    expect(settled('close', null)).toBe('close');
  });
});

describe('the difficulty rater', () => {
  it('is shown DOE questions of each tier, in the question’s own category and level, and the question with its answer', () => {
    const r = rateRequest('q', gas, 'HS', { early: [lichen], late: [gas] }, 'claude-sonnet-5-5');
    expect(r.system).toContain('a high school regional event');
    expect(r.system).toContain('a Chemistry question');
    expect(r.system).toMatch(/<early_rounds>\n\(1\)\nBONUS · BIOLOGY/);
    expect(r.user.split('\n').at(-1)).toBe('ANSWER: W) ARGON');
    expect(() => toParams(r)).not.toThrow();
  });

  it('reads a score from 1 to 5', () => {
    expect(readRating(reply({ score: 4, reason: 'Two steps.' }))).toEqual({ score: 4, reason: 'Two steps.' });
    expect(readRating(reply({ score: 7, reason: '' }))).toBeNull();
    expect(readRating(reply({ reason: 'none' }))).toBeNull();
  });
});
