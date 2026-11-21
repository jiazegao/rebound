import { describe, expect, it } from 'vitest';
import { checkQuestion, hasErrors, tidy } from '../checks';
import { loadLabs } from '../labs';
import { libraryBuilt, loadLibrary, tierOf, topicsById } from '../library';
import { NO_USAGE, toParams, type ModelReply } from '../llm';
import { loadProfile } from '../profile';
import { isNumericAnswer, wordCount } from '../text';
import type { Idea, NewsItem, Slot } from '../types';
import { levelExamples, slotLine, stemLengths, takenAnswers, tierBrief } from './brief';
import { ideaQuery, IDEAS_PER_SLOT, IDEAS_PROMPT, ideasRequest, readIdeas } from './ideas';
import { readWritten, repairRequest, WRITE_PROMPT, writeRequest, type WriteContext } from './write';

const reply = (json: unknown, more: Partial<ModelReply> = {}): ModelReply => ({ id: 'x', step: 'test', model: 'claude-opus-5-5', at: '2026-11-21T00:00:00.000Z', outcome: 'ok', text: JSON.stringify(json), json, citations: [], usage: NO_USAGE, batch: false, cost: 0, ...more });

const tossup: Slot = { id: 't07', level: 'HS', tier: 'late', kind: 'tossup', subject: 'biology', form: 'multiple_choice', skill: 'application', topic: 'biology.genetics', letter: 'Y' };
const bonus: Slot = { id: 'b12', level: 'HS', tier: 'late', kind: 'bonus', subject: 'biology', form: 'short_answer', skill: 'recall', topic: 'biology.genetics' };
const energy: Slot = { id: 't04', level: 'HS', tier: 'late', kind: 'tossup', subject: 'energy', form: 'short_answer', skill: 'recall', topic: 'energy.doe-labs', newsId: 'n1' };
const news: NewsItem = { id: 'n1', lab: 'Oak Ridge National Laboratory', date: '2026-10-02', url: 'https://www.ornl.gov/news/example', title: 'Neutrons show how a battery electrolyte moves ions', summary: 'Researchers used neutron scattering to follow lithium ions through a solid electrolyte. The work points to faster-charging batteries.' };
const example = { kind: 'tossup' as const, subject: 'biology' as const, format: 'short_answer' as const, stem: 'What term describes an organism with two different alleles of a gene?', answer: 'HETEROZYGOUS', accept: [], reject: [] };

describe('what the writer is told about the level', () => {
  it('starts from DOE’s own words for each event, and says what makes a late round hard', () => {
    expect(tierBrief('HS', 'early')).toContain('AP-level high school science textbooks');
    expect(tierBrief('HS', 'early')).toContain('rounds 1 to 10');
    expect(tierBrief('HS', 'late')).toContain('rounds 11 to 17');
    expect(tierBrief('HS', 'late')).toContain('never length, obscure trivia');
    expect(tierBrief('MS', 'early')).toContain('6th through 8th grade science textbooks and Algebra II textbooks');
    expect(tierBrief('MS', 'late')).toContain('no calculus');
  });

  it('says a slot in a line', () => {
    expect(slotLine(tossup)).toBe('t07: Biology toss-up; multiple choice; application; topic: Genetics');
    expect(slotLine({ ...bonus, form: 'identify_all' })).toBe('b12: Biology bonus; "Identify all" (short answer); recall; topic: Genetics');
  });

  it('gives the length of DOE’s stems of the kind', () => {
    const lengths = stemLengths(loadProfile(), { level: 'HS', subject: 'physics', kind: 'bonus' });
    expect(lengths.usual).toBeGreaterThan(20);
    expect(lengths.most).toBeGreaterThan(lengths.usual);
  });
});

describe.skipIf(!libraryBuilt())('what the writer is shown from the library', () => {
  const library = loadLibrary();

  it('shows DOE questions of the slot’s own level, tier, category and kind, the same ones each time', () => {
    const shown = levelExamples(library, tossup, 4, 'round-3');
    expect(shown).toHaveLength(4);
    const byId = new Map(library.map((x) => [x.question.id, x]));
    for (const q of shown) {
      const x = byId.get(q.id)!;
      expect([x.level, q.subject, q.kind, tierOf(x.round)]).toEqual(['HS', 'biology', 'tossup', 'late']);
      expect(x.year).toBeGreaterThanOrEqual(2014);
    }
    expect(levelExamples(library, tossup, 4, 'round-3').map((q) => q.id)).toEqual(shown.map((q) => q.id));
    expect(levelExamples(library, tossup, 4, 'round-4').map((q) => q.id)).not.toEqual(shown.map((q) => q.id));
    // A question held back as a test is never shown.
    const held = new Set(shown.map((q) => q.id));
    expect(levelExamples(library, tossup, 4, 'round-3', held).some((q) => held.has(q.id))).toBe(false);
  });

  it('lists the answers a topic has used, most used first, and only ones a new question could collide with', () => {
    const taken = takenAnswers(library, topicsById('HS'), 'HS', 'biology.genetics');
    expect(taken.length).toBeGreaterThan(40);
    expect(taken.slice(0, 12)).toContain('phenotype');
    expect(new Set(taken).size).toBe(taken.length);
    for (const a of taken) {
      expect(wordCount(a)).toBeLessThanOrEqual(4);
      expect(isNumericAnswer({ format: 'short_answer', stem: '', answer: a })).toBe(false);
    }
    expect(takenAnswers(library, topicsById('HS'), 'HS', 'biology.genetics', 10)).toHaveLength(10);
    // Each level has its own list.
    expect(takenAnswers(library, topicsById('MS'), 'MS', 'biology.genetics')).not.toEqual(taken);
  });
});

describe('proposing ideas', () => {
  const context = { examples: [example], taken: ['phenotype', 'barr body'] };

  it('is given the level, the slots, DOE’s examples and the answers already used', () => {
    const r = ideasRequest('ideas-genetics', [tossup, bonus], context, 'claude-opus-5-5');
    expect(r.step).toBe('ideas');
    expect(r.system).toContain('high school teams');
    expect(r.system).toContain(`Give ${IDEAS_PER_SLOT} ideas for each slot`);
    expect(r.user).toContain('<level>\nThe Department of Energy says');
    expect(r.user).toContain('<slots>\nt07: Biology toss-up; multiple choice; application; topic: Genetics\nb12: Biology bonus; short answer; recall; topic: Genetics\n</slots>');
    expect(r.user).toContain('ANSWER: HETEROZYGOUS');
    expect(r.user).toContain('<answers_already_used topic="Genetics">\nphenotype; barr body\n</answers_already_used>');
    expect(r.user).not.toContain('<news_item>');
    expect(IDEAS_PROMPT).toMatch(/^[0-9a-f]{8}$/);
    expect(() => toParams(r)).not.toThrow();
  });

  it('gives an Energy slot its news item, and asks for it alone', () => {
    const r = ideasRequest('ideas-t04', [energy], { examples: [], taken: [], news }, 'claude-opus-5-5');
    expect(r.user).toContain('<news_item>\nLaboratory: Oak Ridge National Laboratory\nPublished: 2026-10-02\nTitle: Neutrons show');
    expect(r.user).toContain('(none recorded)');
    expect(() => ideasRequest('x', [energy, { ...energy, id: 'b04' }], { examples: [], taken: [], news }, 'claude-opus-5-5')).toThrow(/alone/);
  });

  it('refuses slots that do not share a topic', () => {
    expect(() => ideasRequest('x', [tossup, { ...bonus, topic: 'biology.cells' }], context, 'claude-opus-5-5')).toThrow(/share/);
    expect(() => ideasRequest('x', [], context, 'claude-opus-5-5')).toThrow(/at least one/);
  });

  it('reads the ideas by slot, and drops what is empty or for a slot nobody asked about', () => {
    const ideas = readIdeas(
      reply({
        ideas: [
          { slot: 't07', answer: 'Epistasis', fact: 'One gene can mask the expression of another.', cue: 'A cross gives a 9:3:4 ratio; name the interaction.', method: '' },
          { slot: 'b12', answer: '1/8', fact: 'Independent assortment multiplies probabilities.', cue: 'Three heterozygous genes, all recessive.', method: '1/2 × 1/2 × 1/2 = 1/8' },
          { slot: 't07:', answer: ' Pleiotropy ', fact: 'One gene affects several traits.', cue: 'x', method: '' },
          { slot: 't99', answer: 'x', fact: 'y', cue: 'z', method: '' },
          { slot: 'b12', answer: '', fact: 'no answer', cue: 'z', method: '' },
        ],
      }),
      [tossup, bonus],
    )!;
    expect(ideas.get('t07')!.map((i) => i.answer)).toEqual(['Epistasis', 'Pleiotropy']);
    expect(ideas.get('t07')![0]).not.toHaveProperty('method');
    expect(ideas.get('b12')).toEqual([{ answer: '1/8', fact: 'Independent assortment multiplies probabilities.', cue: 'Three heterozygous genes, all recessive.', method: '1/2 × 1/2 × 1/2 = 1/8' }]);
    expect(readIdeas(reply({ ideas: [] }), [tossup])!.get('t07')).toEqual([]);
    expect(readIdeas(reply({ notIdeas: 1 }), [tossup])).toBeNull();
    expect(readIdeas(reply(undefined, { outcome: 'refused' }), [tossup])).toBeNull();
  });

  it('can be looked up in the library by its lines', () => {
    expect(ideaQuery({ answer: 'Epistasis', fact: 'One gene masks another.', cue: 'A 9:3:4 ratio.' })).toEqual({ stem: 'One gene masks another. A 9:3:4 ratio.', answer: 'Epistasis' });
  });
});

describe('writing a question', () => {
  const idea: Idea = { answer: 'Epistasis', fact: 'One gene can mask the expression of another.', cue: 'A dihybrid cross gives a 9:3:4 ratio; name the interaction.' };
  const context: WriteContext = { examples: [example], near: [{ id: 'doe-hs-09-r03-t11', line: '[doe-hs-09-r03-t11] What term describes one gene masking another?  ANSWER: EPISTASIS' }], lengths: { usual: 20, most: 37 } };
  const written = {
    stem: 'A cross of two mice heterozygous for two coat-color genes gives offspring in a 9 to 3 to 4 ratio. Which of the following best explains the ratio?',
    choices: { W: 'Epistasis [ep-ih-STAY-sis]', X: 'Codominance', Y: 'Linkage', Z: 'Pleiotropy' },
    letter: 'W',
    answer: '',
    accept: [],
    reject: [],
    why: 'A 9:3:4 ratio is the mark of recessive epistasis.',
    whyNot: ['X: codominance gives a 1:2:1 ratio at one gene.', 'Y: linkage changes the ratio toward the parental types.', 'Z: pleiotropy is one gene with several effects.'],
    working: '',
    choicesInOrder: false,
    timeTied: false,
    problem: '',
  };

  it('is given the slot, the idea, the lengths, the letter and the library questions near the idea', () => {
    const r = writeRequest('rb-hs-000001', tossup, idea, context, 'claude-opus-5-5');
    expect(r.step).toBe('write');
    expect(r.user).toContain('t07: Biology toss-up; multiple choice; application; topic: Genetics');
    expect(r.user).toContain('Put the right choice on Y, unless the choices are numbers.');
    expect(r.user).toContain('Stem length: usually about 20 words; never more than 37.');
    expect(r.user).toContain('<idea>\nAnswer: Epistasis\nFact tested: One gene can mask');
    expect(r.user).toContain('<library_questions_near_this_idea>\n[doe-hs-09-r03-t11]');
    expect(writeRequest('x', bonus, idea, { ...context, near: [] }, 'claude-opus-5-5').user).toContain('(the search found none)');
    expect(writeRequest('x', bonus, idea, context, 'claude-opus-5-5').user).not.toContain('Put the right choice');
    expect(WRITE_PROMPT).toMatch(/^[0-9a-f]{8}$/);
    expect(() => toParams(r)).not.toThrow();
  });

  it('reads a multiple-choice question, taking the answer from the right choice', () => {
    const w = readWritten(reply(written), tossup)!;
    expect(w.draft.question).toEqual({ kind: 'tossup', subject: 'biology', format: 'multiple_choice', stem: written.stem, choices: written.choices, answerLetter: 'W', answer: 'Epistasis', accept: [], reject: [] });
    expect(w.draft).toMatchObject({ level: 'HS', tier: 'late', form: 'multiple_choice', letter: 'Y' });
    expect(w.draft).not.toHaveProperty('keepChoiceOrder');
    expect(w.whyNot).toHaveLength(3);
    expect(w.timeTied).toBe(false);
    expect(readWritten(reply({ ...written, letter: '' }), tossup)).toBeNull();
    expect(readWritten(reply({ ...written, choices: { ...written.choices, Z: ' ' } }), tossup)).toBeNull();
    expect(readWritten(reply({ ...written, stem: '' }), tossup)).toBeNull();
    expect(readWritten(reply(undefined, { outcome: 'cut-off' }), tossup)).toBeNull();
  });

  it('writes a question the house-style checks pass, with the key moved to the slot’s letter', () => {
    const ctx = { profile: loadProfile(), labs: loadLabs() };
    const { draft, changes } = tidy(readWritten(reply(written), tossup)!.draft);
    expect(draft.question.answerLetter).toBe('Y');
    expect(draft.question.choices!.Y).toBe('Epistasis [ep-ih-STAY-sis]');
    expect(changes.join(' ')).toContain('The key moved from W to Y');
    expect(hasErrors(checkQuestion(draft, ctx))).toBe(false);
  });

  it('reads a short answer with its ACCEPT and DO NOT ACCEPT lists', () => {
    const w = readWritten(reply({ ...written, stem: 'What term describes one gene masking the expression of another gene?', choices: { W: '', X: '', Y: '', Z: '' }, letter: '', answer: ' EPISTASIS ', accept: ['EPISTATIC INTERACTION', ''], reject: ['DOMINANCE'], whyNot: [] }), bonus)!;
    expect(w.draft.question).toEqual({ kind: 'bonus', subject: 'biology', format: 'short_answer', stem: 'What term describes one gene masking the expression of another gene?', answer: 'EPISTASIS', accept: ['EPISTATIC INTERACTION'], reject: ['DOMINANCE'] });
    expect(readWritten(reply({ ...written, answer: '' }), bonus)).toBeNull();
  });

  it('keeps an order of choices the writer says means something, and marks what may go out of date', () => {
    const w = readWritten(reply({ ...written, choicesInOrder: true, timeTied: true, problem: 'The fact may change.' }), tossup)!;
    expect(w.draft.keepChoiceOrder).toBe(true);
    expect(w.timeTied).toBe(true);
    expect(w.problem).toBe('The fact may change.');
  });

  it('ties an Energy question to its dated news item', () => {
    const r = writeRequest('x', energy, idea, { ...context, news }, 'claude-opus-5-5');
    expect(r.user).toContain('<news_item>\nLaboratory: Oak Ridge National Laboratory');
    const w = readWritten(reply({ ...written, stem: 'Scientists at Oak Ridge National Laboratory are studying how ions move through a solid. What particle do they scatter from the solid?', choices: { W: '', X: '', Y: '', Z: '' }, letter: '', answer: 'NEUTRON' }), energy, news)!;
    expect(w.draft.sources).toEqual([{ title: news.title, url: news.url, published: '2026-10-02' }]);
    expect(w.draft.asOf).toBe('2026-10-02');
  });

  it('sends a failed draft back once, with the draft and the errors the checks found', () => {
    const w = readWritten(reply(written), tossup)!;
    const r = repairRequest('rb-hs-000001-2', tossup, idea, context, w, [{ level: 'error', code: 'stem-long', message: '52 words: nine in ten are 37 words or fewer.' }, { level: 'warning', code: 'choices-long', message: 'Only a warning.' }], 'claude-opus-5-5');
    expect(r.step).toBe('repair');
    expect(r.user).toContain('<your_draft>\nTOSS-UP · BIOLOGY · Multiple Choice');
    expect(r.user).toContain('ANSWER: W) Epistasis\n</your_draft>');
    expect(r.user).toContain('<what_the_checks_found>\n- 52 words: nine in ten are 37 words or fewer.\n</what_the_checks_found>');
    expect(r.user).not.toContain('Only a warning.');
    expect(r.system).toBe(writeRequest('x', tossup, idea, context, 'claude-opus-5-5').system);
  });
});
