import { describe, expect, it } from 'vitest';
import { isBaseSequence, judgeAnswer, type JudgeInput } from './judge';
import { parseIntegerList, parseNumber } from './numbers';
import { normalizeText, samePluralWord, toPlain } from './normalize';

const sa = (answer: string, extra: Partial<JudgeInput> = {}): JudgeInput => ({
  format: 'short_answer',
  stem: extra.stem ?? 'What is it?',
  answer,
  accept: extra.accept ?? [],
  reject: extra.reject ?? [],
});

const mc: JudgeInput = {
  format: 'multiple_choice',
  stem: 'An aqueous solution in which the concentration of OH– ions is greater than that of H+ ions is:',
  choices: { W: 'basic', X: 'acidic', Y: 'neutral', Z: 'in equilibrium' },
  answerLetter: 'W',
  answer: 'BASIC',
  accept: [],
  reject: [],
};

const verdict = (q: JudgeInput, response: string) => judgeAnswer(q, response).verdict;

describe('multiple choice (Rule 3-7)', () => {
  it.each(['W', 'w', 'W)', '(W)', 'basic', 'Basic', 'W basic', 'W) basic', 'w. Basic'])('accepts %s', (r) => {
    expect(verdict(mc, r)).toBe('correct');
  });
  it.each(['X', 'acidic', 'in equilibrium', 'X basic'])('rejects %s', (r) => {
    expect(verdict(mc, r)).toBe('incorrect');
  });
  it('requires both parts to be right when a letter and text are given', () => {
    const result = judgeAnswer(mc, 'W acidic');
    expect(result.verdict).toBe('incorrect');
    expect(result.reason).toMatch(/both must be right/);
  });
  it('flags a misspelled choice for review instead of guessing', () => {
    expect(verdict(mc, 'bassic')).toBe('review');
  });
  it('reads choice text that starts with a letter-like word as text', () => {
    const q: JudgeInput = { ...mc, choices: { W: 'X-rays', X: 'gamma rays', Y: 'radio waves', Z: 'microwaves' }, answerLetter: 'W', answer: 'X-RAYS' };
    expect(verdict(q, 'X-rays')).toBe('correct');
    expect(verdict(q, 'X')).toBe('incorrect');
  });
  it('treats an empty answer as incorrect', () => {
    expect(verdict(mc, '   ')).toBe('incorrect');
  });
});

describe('short answer text', () => {
  it('ignores case, articles, hyphens and plural/singular differences', () => {
    expect(verdict(sa('PHENOTYPE'), 'the phenotype')).toBe('correct');
    expect(verdict(sa('PHENOTYPE'), 'Phenotypes')).toBe('correct');
    expect(verdict(sa('HELPER T CELLS'), 'helper t cell')).toBe('correct');
    expect(verdict(sa('SEMICIRCULAR CANALS'), 'semi-circular canals')).toBe('correct');
    expect(verdict(sa('MITOCHONDRIA'), 'mitochondrion')).toBe('correct');
    expect(verdict(sa('NUCLEUS'), 'nuclei')).toBe('correct');
  });
  it('uses ACCEPT and DO NOT ACCEPT lists', () => {
    expect(verdict(sa('BACTERIOPHAGE', { accept: ['PHAGE'] }), 'phage')).toBe('correct');
    expect(verdict(sa('SEMICIRCULAR CANALS', { accept: ['SEMICIRCULAR DUCTS'] }), 'semicircular duct')).toBe('correct');
    const r = judgeAnswer(sa('MITOCHONDRIA', { reject: ['ORGANELLE'] }), 'organelle');
    expect(r.verdict).toBe('incorrect');
    expect(r.reason).toMatch(/not accepted/);
  });
  it('reads ACCEPT clauses left inside the answer text', () => {
    const q = sa('NITRATE (ACCEPT: NO3-) (DO NOT ACCEPT: NITRITE)');
    expect(verdict(q, 'nitrate')).toBe('correct');
    expect(verdict(q, 'NO3-')).toBe('correct');
    expect(verdict(q, 'nitrite')).toBe('incorrect');
  });
  it('treats parenthesised words as optional', () => {
    const q = sa('(CHARLES) DARWIN', { stem: 'Who proposed the theory of natural selection?' });
    expect(verdict(q, 'Darwin')).toBe('correct');
    expect(verdict(q, 'Charles Darwin')).toBe('correct');
  });
  it('accepts a last name alone, but a wrong first name is wrong (Rule A-2 i)', () => {
    const q = sa('ALBERT EINSTEIN', { stem: 'What physicist proposed the photon?' });
    expect(verdict(q, 'Einstein')).toBe('correct');
    expect(verdict(q, 'Alfred Einstein')).toBe('incorrect');
  });
  it('accepts simple formulas for names and the reverse (Rule A-2 c)', () => {
    expect(verdict(sa('CARBON DIOXIDE'), 'CO2')).toBe('correct');
    expect(verdict(sa('CARBON DIOXIDE'), 'CO₂')).toBe('correct');
    expect(verdict(sa('H2O'), 'water')).toBe('correct');
  });
  it('never treats a different real term as a misspelling', () => {
    expect(verdict(sa('HYPERTONIC'), 'hypotonic')).toBe('incorrect');
    expect(verdict(sa('ETHENE'), 'ethane')).toBe('incorrect');
    expect(verdict(sa('SULFATE'), 'sulfite')).toBe('incorrect');
    expect(verdict(sa('AFFERENT'), 'efferent')).toBe('incorrect');
    expect(verdict(sa('FERROUS'), 'ferric')).toBe('incorrect');
  });
  it('sends small spelling slips to review', () => {
    expect(verdict(sa('PHAGOCYTOSIS'), 'phagocytosys')).toBe('review');
    expect(verdict(sa('PHENOTYPE'), 'genotype')).toBe('incorrect');
  });
  it('turns small number words into digits', () => {
    expect(verdict(sa('4'), 'four')).toBe('correct');
  });
});

describe('numbers (Rule A-2 a)', () => {
  const q = sa('AT x = -5/4 (ALSO ACCEPT x = -1.25 OR -1¼)');
  it.each(['-5/4', 'x = -5/4', '-1.25', '-1 1/4', '-1¼'])('accepts %s for -5/4', (r) => {
    expect(verdict(q, r)).toBe('correct');
  });
  it('rejects unsimplified fractions', () => {
    expect(verdict(q, '-10/8')).toBe('incorrect');
    expect(verdict(sa('1/2'), '2/4')).toBe('incorrect');
  });
  it('sends an equal value in a different form to review', () => {
    expect(verdict(sa('1/2'), '0.5')).toBe('review');
    expect(verdict(sa('9π'), '28.274333882308138')).toBe('review');
  });
  it('handles π and radicals, including simplest radical form', () => {
    expect(verdict(sa('9π'), '9pi')).toBe('correct');
    expect(verdict(sa('9π'), '9 π')).toBe('correct');
    expect(verdict(sa('2√2'), '2 sqrt 2')).toBe('correct');
    expect(verdict(sa('2√2'), '2√2')).toBe('correct');
    expect(verdict(sa('2√2'), '√8')).toBe('incorrect');
    expect(verdict(sa('√2/2'), '1/√2')).toBe('incorrect');
    expect(verdict(sa('2√2'), '2.83')).toBe('incorrect');
  });
  it('checks units only when they are given (Rule A-2 h)', () => {
    const v = sa('25 METERS PER SECOND');
    expect(verdict(v, '25')).toBe('correct');
    expect(verdict(v, '25 m/s')).toBe('correct');
    expect(verdict(v, '25 meters per second')).toBe('correct');
    expect(verdict(v, '25 km/h')).toBe('incorrect');
    expect(verdict(sa('144'), '144 grams')).toBe('correct');
  });
  it('reads thousands separators and integers', () => {
    expect(verdict(sa('5,300'), '5300')).toBe('correct');
    expect(verdict(sa('144'), '145')).toBe('incorrect');
  });
});

describe('lists', () => {
  it('compares rankings in order', () => {
    const q = sa('1, 3, 2', { stem: 'Rank the following three elements in order of increasing electronegativity: 1) Silicon; 2) Nitrogen; 3) Phosphorus.' });
    expect(verdict(q, '1, 3, 2')).toBe('correct');
    expect(verdict(q, '1 3 2')).toBe('correct');
    expect(verdict(q, '2, 3, 1')).toBe('incorrect');
  });
  it('compares "identify all" answers as sets', () => {
    const q = sa('1 AND 3', { stem: 'Identify all of the following that are noble gases: 1) neon; 2) nitrogen; 3) argon.' });
    expect(verdict(q, '3, 1')).toBe('correct');
    expect(verdict(q, '1')).toBe('incorrect');
  });
});

describe('multi-part answers (semicolons separate parts, not alternatives)', () => {
  const q = sa('CYTOSINE; THYMINE');
  it('needs every part, in order', () => {
    expect(verdict(q, 'cytosine; thymine')).toBe('correct');
    expect(verdict(q, 'cytosine, thymine')).toBe('correct');
    expect(verdict(q, 'cytosine and thymine')).toBe('correct');
    expect(verdict(q, 'thymine, cytosine')).toBe('incorrect');
    const partial = judgeAnswer(q, 'cytosine');
    expect(partial.verdict).toBe('incorrect');
    expect(partial.reason).toMatch(/2 parts/);
  });
  it('allows any order when the answer line says so', () => {
    const anyOrder = { ...sa('MERCURY; VENUS'), answerRaw: 'MERCURY; VENUS (in any order)' };
    expect(verdict(anyOrder, 'venus and mercury')).toBe('correct');
  });
  it('reads labelled parts', () => {
    const labelled = sa('LARGEST = Rb⁺; SMALLEST = Li⁺', { accept: ['RUBIDIUM AND LITHIUM'] });
    expect(verdict(labelled, 'Rb+, Li+')).toBe('correct');
    expect(verdict(labelled, 'rubidium and lithium')).toBe('correct');
    expect(verdict(labelled, 'Li+, Rb+')).toBe('incorrect');
  });
});

describe('answer-line edge cases from the DOE sets', () => {
  it('matches DO NOT ACCEPT entries exactly, not by plural', () => {
    const q = sa('2 POLAR NUCLEI', { accept: ['POLAR NUCLEI'], reject: ['POLAR NUCLEUS'] });
    expect(verdict(q, 'polar nuclei')).toBe('correct');
    expect(verdict(q, 'polar nucleus')).toBe('incorrect');
  });
  it('ignores a reject entry that contradicts an accepted answer', () => {
    expect(verdict(sa('+4.5', { accept: ['4.5'], reject: ['4.5'] }), '4.5')).toBe('correct');
  });
  it('only applies the last-name rule to questions about people', () => {
    const q = sa('APPARENT MAGNITUDE', { stem: 'What quantity, discovered by comparing stars, measures brightness as seen from Earth?' });
    expect(judgeAnswer(q, 'absolute magnitude').reason).not.toMatch(/first name/);
  });
  it('keeps math in square brackets', () => {
    expect(verdict(sa('[-π/2, π/2]'), '[-π/2, π/2]')).toBe('correct');
  });
  it('tells apart choices that differ only in symbols', () => {
    const q: JudgeInput = {
      ...mc,
      choices: { W: "y' + y = 0", X: "y'' - 2y² - 2 = 0", Y: "y' - xy = 0", Z: "y' - 2y² - 2 = 0" },
      answerLetter: 'Z',
      answer: "y' - 2y² - 2 = 0",
    };
    expect(verdict(q, "y' - 2y² - 2 = 0")).toBe('correct');
  });
});

describe('helpers', () => {
  it('converts typographic characters', () => {
    expect(toPlain('10⁻⁷')).toBe('10^(-7)');
    expect(toPlain('x²')).toBe('x^2');
    expect(toPlain('1¼')).toBe('1 1/4');
    expect(toPlain('−3')).toBe('-3');
  });
  it('normalises text', () => {
    expect(normalizeText('The Cytokines [sigh-toe-kines].')).toBe('cytokines');
  });
  it('knows scientific plurals', () => {
    expect(samePluralWord('bacteria', 'bacterium')).toBe(true);
    expect(samePluralWord('larvae', 'larva')).toBe(true);
    expect(samePluralWord('vertices', 'vertex')).toBe(true);
    expect(samePluralWord('mass', 'ma')).toBe(false);
  });
  it('parses numbers with units and scientific notation', () => {
    expect(parseNumber('3 x 10^8 m/s')).toMatchObject({ value: 3e8, kind: 'scientific', unit: 'm/s' });
    expect(parseNumber('5 eV')).toMatchObject({ value: 5, unit: 'eV' });
    expect(parseNumber('1 and 3')).toBeNull();
    expect(parseIntegerList('2 and 7')).toEqual([2, 7]);
  });
});

describe('base sequences', () => {
  const q = { format: 'short_answer' as const, stem: 'What is the mRNA sequence?', answer: 'GGUCAGAUG', accept: ["5'-GGUCAGAUG-3'"], reject: [] };
  it('accepts the sequence, spaced or with its ends marked', () => {
    expect(judgeAnswer(q, 'GGU CAG AUG').verdict).toBe('correct');
    expect(judgeAnswer(q, "5'-GGUCAGAUG-3'").verdict).toBe('correct');
  });
  it('gives no spelling slack: one different base is wrong', () => {
    expect(judgeAnswer(q, 'GGUCAGAUC').verdict).toBe('incorrect');
    expect(judgeAnswer(q, 'GAUCAGAUG').verdict).toBe('incorrect');
  });
  it('knows a sequence when it sees one', () => {
    expect(isBaseSequence("5′-ATG GCA-3′")).toBe(true);
    expect(isBaseSequence('AUGC')).toBe(true);
    expect(isBaseSequence('ACU')).toBe(false);
    expect(isBaseSequence('CATALASE')).toBe(false);
  });
});
