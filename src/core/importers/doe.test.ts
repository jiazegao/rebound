import { applyDoeErrata } from './doeErrata';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Question, Round } from '../schema';
import {
  DOE_CREDIT,
  detectVisual,
  doeQuestionId,
  doeRoundId,
  doeSetId,
  expectedPairsForYear,
  isNoiseLine,
  joinLines,
  linesFromPlainText,
  mapCategory,
  matchAnswerLine,
  normalizePronunciation,
  parseAnswerLine,
  parseDoeRound,
  parseQuestionHeader,
  type SourceLine,
} from './doe';
import { buildLines, formatScript, normalizeMathText, type PositionedText } from './pdfText';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function parseFixture(name: string, setNumber: number) {
  const setId = doeSetId(setNumber);
  const roundId = doeRoundId(setId, 1);
  return parseDoeRound(linesFromPlainText(fixture(name)), {
    setId,
    roundId,
    label: 'Round 1',
    order: 1,
    sourceUrl: `https://example.test/${name}.pdf`,
  });
}

const questions = (round: Round): Question[] => round.pairs.flatMap((p) => (p.bonus ? [p.tossup, p.bonus] : [p.tossup]));
const allText = (q: Question) => [q.stem, q.answer, q.answerRaw, ...Object.values(q.choices ?? {})].join('\n');

/** Plain text "page" lines for small inline tests. */
const lines = (text: string, page = 1): SourceLine[] => text.split('\n').map((t) => ({ text: t, page }));

describe('ids and constants', () => {
  it('builds stable ids', () => {
    expect(doeSetId(7)).toBe('doe-hs-07');
    expect(doeSetId(7, 'MS')).toBe('doe-ms-07');
    expect(doeSetId('finals', 'MS')).toBe('doe-ms-finals');
    expect(doeRoundId('doe-hs-17', 1)).toBe('doe-hs-17-r01');
    expect(doeQuestionId('doe-hs-17-r01', 'tossup', 3)).toBe('doe-hs-17-r01-t03');
    expect(doeQuestionId('doe-hs-17-r01', 'bonus', 12)).toBe('doe-hs-17-r01-b12');
  });

  it('knows the packet size of each era', () => {
    expect(expectedPairsForYear(2009)).toBe(25);
    expect(expectedPairsForYear(2013)).toBe(25);
    expect(expectedPairsForYear(2014)).toBe(23);
    expect(expectedPairsForYear(2020)).toBe(23);
    expect(expectedPairsForYear(2022)).toBe(18);
    expect(expectedPairsForYear(2021)).toBe(18);
    expect(expectedPairsForYear(2021, 'MS')).toBe(15);
    expect(expectedPairsForYear(2022, 'MS')).toBe(18);
    expect(expectedPairsForYear(undefined)).toBeUndefined();
  });
});

describe('format eras (fixtures are short excerpts of the official PDFs)', () => {
  it('Set 1 (2009): "1) BIOLOGY Short Answer", (read as: ...) pronunciations, footers', () => {
    const { round, warnings } = parseFixture('set01-2009-round01.txt', 1);
    expect(round.pairs).toHaveLength(4);
    expect(warnings.filter((w) => w.code !== 'possible-lost-formatting')).toEqual([]);
    const [p1, p2] = round.pairs;
    expect(p1.tossup).toMatchObject({
      id: 'doe-hs-01-r01-t01',
      kind: 'tossup',
      number: 1,
      subject: 'biology',
      sourceCategory: 'BIOLOGY',
      format: 'short_answer',
      answer: 'PHENOTYPE',
      answerRaw: 'PHENOTYPE',
      accept: [],
      reject: [],
    });
    expect(p1.tossup.stem).toBe(
      'What is the most common term used in genetics to describe the observable physical characteristics of an organism caused by the expression of a gene or set of genes?',
    );
    expect(p1.bonus?.stem).toContain('pseudopodia [SU-doe-POH-dee-ah] around the particle?');
    expect(p2.tossup.format).toBe('multiple_choice');
    expect(p2.tossup.choices).toEqual({ W: 'basic', X: 'acidic', Y: 'neutral', Z: 'in equilibrium' });
    expect(p2.tossup.answerLetter).toBe('W');
    expect(p2.tossup.answer).toBe('BASIC');
    expect(p2.tossup.stem).toContain('OH⁻ ions');
    expect(p2.bonus?.stem).toContain('Cu₂O');
    expect(round.pairs[2].tossup.source.page).toBe(2);
    expect(p1.tossup.source).toEqual({
      provider: 'doe',
      setId: 'doe-hs-01',
      roundId: 'doe-hs-01-r01',
      url: 'https://example.test/set01-2009-round01.txt.pdf',
      page: 1,
      credit: DOE_CREDIT,
    });
    for (const q of questions(round)) expect(allText(q)).not.toMatch(/High School Round|Page \d|ROUND 1/);
  });

  it('Set 2 (2012): "TOSS UP", "1. BIOLOGY", list answers keep commas', () => {
    const { round, printedLabel } = parseFixture('set02-2012-round01.txt', 2);
    expect(printedLabel).toBe('ROUND ROBIN ~ ROUND 1');
    expect(round.pairs.map((p) => p.number)).toEqual([1, 2, 3, 4]);
    const b1 = round.pairs[0].bonus!;
    expect(b1.answer).toBe('2, 3');
    expect(b1.accept).toEqual(['DENSITY DEPENDENT MORTALITY, LARGE BODY SIZE']);
    expect(round.pairs[3].bonus?.stem).toContain('1.6 x 10⁻¹⁹ coulombs');
    expect(round.pairs[3].bonus?.answer).toBe('6.4 x 10⁻¹⁴');
    expect(round.pairs[1].bonus?.choices?.Y).toBe('150 Kelvin and 50 atmospheres');
  });

  it('Set 4 (2011): underscore separators, read-as in answers, EARTH AND SPACE', () => {
    const { round } = parseFixture('set04-2011-round17.txt', 4);
    expect(round.pairs).toHaveLength(4);
    expect(round.pairs[0].bonus?.answer).toBe('RHIZOMORPHS [ry-ZŌE-mohrfs]');
    expect(round.pairs[0].bonus?.answerRaw).toBe('RHIZOMORPHS (read as: ry-ZŌE-mohrfs)');
    const b3 = round.pairs[2].bonus!;
    expect(b3.subject).toBe('earth_space');
    expect(b3.stem).toContain('(read as: pay-ley-ōe-thehr-MOH-meh-tehr)'.replace('(read as: ', '[').replace(')', ']'));
    expect(b3.choices?.X).toBe('Long-chain alkenones [AHL-kee-nōens]');
    expect(round.pairs[1].bonus?.answer).toBe('y = 4x + 1');
    expect(round.pairs[3].bonus?.answer).toBe('SPEED: 60, ACCELERATION: 12');
  });

  it('Set 7 (2013): "High School Round 1 A Page 1" footers', () => {
    const { round, warnings } = parseFixture('set07-2013-round01.txt', 7);
    expect(round.pairs).toHaveLength(4);
    expect(warnings).toEqual([]);
    for (const q of questions(round)) expect(allText(q)).not.toMatch(/High School Round/);
  });

  it('Set 10 (2016): en dash separator, "2016 NSB®" footers, ~~~ separators', () => {
    const { round, warnings } = parseFixture('set10-2016-round02.txt', 10);
    expect(warnings).toEqual([]);
    const t1 = round.pairs[0].tossup;
    expect(t1).toMatchObject({ sourceCategory: 'Energy', subject: 'energy', format: 'short_answer', answer: '1 AND 3' });
    expect(round.pairs[0].bonus?.choices?.W).toBe('2,2,4-trimethylpentane [try-methil-PEN-tane]');
    expect(round.pairs[1].tossup.sourceCategory).toBe('Earth and Space');
    expect(round.pairs[1].bonus?.accept).toEqual(['EXTRASOLAR PLANETS', 'PLANETS']);
    for (const q of questions(round)) expect(allText(q)).not.toMatch(/NSB®|Regional High School|~~~/);
  });

  it('Set 15 (2020): "Earth & Space –", **** separators, DO NOT ACCEPT', () => {
    const { round } = parseFixture('set15-2020-round01.txt', 15);
    expect(round.pairs).toHaveLength(4);
    expect(round.pairs[3].tossup.reject).toEqual(['GRANA']);
    expect(round.pairs[3].tossup.answer).toBe('THYLAKOIDS');
    // The PDF prints the charge without the 3.
    expect(round.pairs[1].bonus?.accept).toEqual(['PO₄⁻']);
    for (const q of questions(round)) expect(allText(q)).not.toContain('***');
  });

  it('Set 16 (2021): "High School / Set 2" header, answers wrapped over lines', () => {
    const { round, printedLabel } = parseFixture('set16-2021-round02.txt', 16);
    expect(printedLabel).toBe('Set 2');
    expect(round.pairs).toHaveLength(3);
    const t2 = round.pairs[1].tossup;
    expect(t2.answer).toBe('CLAUSIUS-CLAPEYRON');
    expect(t2.accept).toEqual(['CLASIUS-CLAPEYRON EQUATION', 'CLAUSIUS-CLAPEYRON RELATION']);
    expect(round.pairs[2].tossup.accept).toEqual(['SUPERPOSITION', 'LAW OF SUPERPOSITION']);
  });

  it('Set 17 (2022): em dash separator and bracket pronunciations', () => {
    const { round, warnings } = parseFixture('set17-2022-round01.txt', 17);
    expect(warnings).toEqual([]);
    const t1 = round.pairs[0].tossup;
    expect(t1).toMatchObject({ sourceCategory: 'Biology', subject: 'biology', format: 'short_answer' });
    expect(t1.stem).toContain('vestibular [ves-TIB-u-lar] system');
    expect(t1.answer).toBe('SEMICIRCULAR CANALS');
    expect(t1.accept).toEqual(['SEMICIRCULAR DUCTS']);
    expect(round.pairs[0].bonus?.accept).toEqual(['RIBULOSE 1,5-BISPHOSPHATE CARBOXYLASE/OXYGENASE']);
  });
});

describe('question headers', () => {
  it('reads every separator style', () => {
    expect(parseQuestionHeader('1) BIOLOGY Short Answer What is')).toMatchObject({ number: 1, category: 'BIOLOGY', format: 'short_answer', rest: 'What is' });
    expect(parseQuestionHeader('12. EARTH AND SPACE Multiple Choice Which')).toMatchObject({ number: 12, category: 'EARTH AND SPACE', format: 'multiple_choice' });
    expect(parseQuestionHeader('3) Earth and Space – Multiple Choice How')).toMatchObject({ category: 'Earth and Space', format: 'multiple_choice', rest: 'How' });
    expect(parseQuestionHeader('1) Biology — Short Answer Rotational')).toMatchObject({ category: 'Biology', format: 'short_answer', rest: 'Rotational' });
    expect(parseQuestionHeader('10) PHYSICS Multiple Choice. The amplitude')).toMatchObject({ format: 'multiple_choice', rest: 'The amplitude' });
    expect(parseQuestionHeader('8) ENERGY Short Answer: What principle')).toMatchObject({ format: 'short_answer', rest: 'What principle' });
  });

  it('accepts misspelt types after a known category', () => {
    expect(parseQuestionHeader('5) CHEMISTRY Short In kilojoules per mole')).toMatchObject({ format: 'short_answer', rest: 'In kilojoules per mole' });
    expect(parseQuestionHeader('14) Energy – Muliple Choice 97% of')).toMatchObject({ format: 'multiple_choice' });
    expect(parseQuestionHeader('5) Earth and Space – Multiple Choic Saturn’s rings')).toMatchObject({ format: 'multiple_choice', rest: 'Saturn’s rings' });
  });

  it('does not mistake numbered list items for questions', () => {
    expect(parseQuestionHeader('3) see-sawing, 4) twisting.')).toBeUndefined();
    expect(parseQuestionHeader('4)')).toBeUndefined();
    expect(parseQuestionHeader('1) Type III survivorship curve, 2) density dependent')).toBeUndefined();
    // Without a printed type, only a known category right after a TOSS-UP/BONUS marker counts.
    expect(parseQuestionHeader('2) MATH What is', false)).toMatchObject({ category: 'MATH', rest: 'What is' });
    expect(parseQuestionHeader('2) MATH What is', true)).toBeUndefined();
  });

  it('recognises answer lines but not stem text that starts with "answer"', () => {
    expect(matchAnswerLine('ANSWER: W) BASIC')).toBe('W) BASIC');
    expect(matchAnswerLine('Answer: 144')).toBe('144');
    expect(matchAnswerLine('ANSWER W) METHYLATION')).toBe('W) METHYLATION');
    expect(matchAnswerLine('ANSWER. Y) LOUDNESS')).toBe('Y) LOUDNESS');
    expect(matchAnswerLine('answer to three decimal places, what is log base 10 of 45?')).toBeUndefined();
    expect(matchAnswerLine('answer.')).toBeUndefined();
  });
});

describe('answer lines', () => {
  it('splits a multiple choice letter from its text', () => {
    expect(parseAnswerLine('W) BASIC', 'multiple_choice')).toEqual({
      answer: 'BASIC',
      answerLetter: 'W',
      accept: [],
      reject: [],
      notes: [],
      answerRaw: 'W) BASIC',
    });
    expect(parseAnswerLine('ANSWER: Z) 2.2', 'multiple_choice')).toMatchObject({ answer: '2.2', answerLetter: 'Z', answerRaw: 'Z) 2.2' });
  });

  it('splits ACCEPT alternatives on OR (any case)', () => {
    const a = parseAnswerLine('NORTH STAR (ACCEPT: POLARIS or ALPHA URSA MINORIS)');
    expect(a.answer).toBe('NORTH STAR');
    expect(a.accept).toEqual(['POLARIS', 'ALPHA URSA MINORIS']);
    expect(a.answerRaw).toBe('NORTH STAR (ACCEPT: POLARIS or ALPHA URSA MINORIS)');
  });

  it('splits on commas only when the main answer is not a list', () => {
    const a = parseAnswerLine('CERIUM (IV) OXIDE (ACCEPT: CeO2, CERIA, CERIC OXIDE) (DO NOT ACCEPT: CERIUM OXIDE, CERIUM (III) OXIDE, CERIUM (II) OXIDE)');
    expect(a.answer).toBe('CERIUM (IV) OXIDE');
    expect(a.accept).toEqual(['CeO2', 'CERIA', 'CERIC OXIDE']);
    expect(a.reject).toEqual(['CERIUM OXIDE', 'CERIUM (III) OXIDE', 'CERIUM (II) OXIDE']);

    const list = parseAnswerLine('FLUORESCENT LIGHTBULB, FISHING LURE, GOLF BALL, AND SOAP (ACCEPT: 1, 2, 3, 4, OR ALL)');
    expect(list.accept).toEqual(['1, 2, 3, 4', 'ALL']);
    expect(parseAnswerLine('1, 3, 4 (ACCEPT: WIDELY DILATED BRONCHI, DRY MOUTH, DILATED PUPILS)').accept).toEqual([
      'WIDELY DILATED BRONCHI, DRY MOUTH, DILATED PUPILS',
    ]);
    expect(parseAnswerLine('ROCKING, SYMMETRICAL STRETCHING, AND TWISTING (ACCEPT: 1, 2, AND 4)').accept).toEqual(['1, 2, AND 4']);
  });

  it('handles ACCEPT and DO NOT ACCEPT in one parenthesis', () => {
    const a = parseAnswerLine('SEEBECK EFFECT (ACCEPT: PELTIER-SEEBECK EFFECT, DO NOT ACCEPT: PELTIER EFFECT)');
    expect(a).toMatchObject({ answer: 'SEEBECK EFFECT', accept: ['PELTIER-SEEBECK EFFECT'], reject: ['PELTIER EFFECT'] });
    const b = parseAnswerLine('EQUILIBRIUM (ACCEPT: DYNAMIC EQUILIBRIUM, MECHANICAL EQUILIBRIUM; DO NOT ACCEPT: STATIC EQUILIBRIUM)');
    expect(b).toMatchObject({ accept: ['DYNAMIC EQUILIBRIUM', 'MECHANICAL EQUILIBRIUM'], reject: ['STATIC EQUILIBRIUM'] });
    const c = parseAnswerLine('CATENARY (ACCEPT: INVERTED CATENARY, HYPERBOLIC COSINE; do not accept: PARABOLA)');
    expect(c).toMatchObject({ accept: ['INVERTED CATENARY', 'HYPERBOLIC COSINE'], reject: ['PARABOLA'] });
  });

  it('reads ALSO ACCEPT and ACCEPT without a colon', () => {
    expect(parseAnswerLine('RADIATIVE (ALSO ACCEPT RADIATION OR THERMAL RADIATION)').accept).toEqual(['RADIATION', 'THERMAL RADIATION']);
    expect(parseAnswerLine('PYROCLAST (ACCEPT TEPHRA, PYROCLASTIC DEBRIS)').accept).toEqual(['TEPHRA', 'PYROCLASTIC DEBRIS']);
    expect(parseAnswerLine('2.4x10³ (ACCEPT 2400)').accept).toEqual(['2400']);
  });

  it('moves notes and solutions out of the answer', () => {
    expect(parseAnswerLine('73 AND 116 (accept in either order)')).toMatchObject({ answer: '73 AND 116', accept: [], notes: ['accept in either order'] });
    expect(parseAnswerLine('9π (Solution: C = πd; ½(18π) = 9π)')).toMatchObject({ answer: '9π', notes: ['Solution: C = πd; ½(18π) = 9π'] });
    expect(parseAnswerLine('NITROGEN AND OXYGEN (in any order)')).toMatchObject({ answer: 'NITROGEN AND OXYGEN', notes: ['in any order'] });
    expect(parseAnswerLine('2s AND 2p [must give both answers]')).toMatchObject({ answer: '2s AND 2p', notes: ['must give both answers'] });
  });

  it('keeps optional words, oxidation states, formulas and pronunciations in the answer', () => {
    expect(parseAnswerLine('(CHARLES) DARWIN').answer).toBe('(CHARLES) DARWIN');
    expect(parseAnswerLine('[Co(NH3)6]3+').answer).toBe('[Co(NH3)6]3+');
    expect(parseAnswerLine('HABER [HAH-bur] PROCESS (ACCEPT: HABER-BOSCH PROCESS)')).toMatchObject({
      answer: 'HABER [HAH-bur] PROCESS',
      accept: ['HABER-BOSCH PROCESS'],
    });
    expect(parseAnswerLine('THE KUIPER (read as: KY-per) BELT (ACCEPT: EDGEWORTH-KUIPER BELT)')).toMatchObject({
      answer: 'THE KUIPER [KY-per] BELT',
      accept: ['EDGEWORTH-KUIPER BELT'],
    });
  });

  it('does not split coordinates, intervals or script markup', () => {
    expect(parseAnswerLine('(0, 19/3) (ACCEPT: (0, 6 1/3) OR x = 0 AND y = 19/3)')).toMatchObject({
      answer: '(0, 19/3)',
      accept: ['(0, 6 1/3)', 'x = 0 AND y = 19/3'],
    });
    expect(parseAnswerLine('(-2, 2] (ACCEPT: ALL REAL NUMBERS GREATER THAN NEGATIVE 2 AND LESS THAN OR EQUAL TO 2)')).toMatchObject({
      answer: '(-2, 2]',
      accept: ['ALL REAL NUMBERS GREATER THAN NEGATIVE 2 AND LESS THAN OR EQUAL TO 2'],
    });
    expect(parseAnswerLine('2H₂O_((liquid)) → O_(2(gas)) + 4H⁺_((aqueous))')).toMatchObject({
      answer: '2H₂O_((liquid)) → O_(2(gas)) + 4H⁺_((aqueous))',
      notes: [],
    });
  });

  it('tells ACCEPT alternatives from ACCEPT instructions', () => {
    expect(parseAnswerLine('1, 2, 3 (ACCEPT: ALL OF THEM)')).toMatchObject({ accept: ['ALL OF THEM'], notes: [] });
    expect(parseAnswerLine('1, 2 (ACCEPT: ALL BUT LYSOSOME)')).toMatchObject({ accept: ['ALL BUT LYSOSOME'] });
    expect(parseAnswerLine('10 (ACCEPT: ANY ANSWER BETWEEN 0.1 AND 1000)')).toMatchObject({ accept: [], notes: ['ACCEPT: ANY ANSWER BETWEEN 0.1 AND 1000'] });
    expect(parseAnswerLine('ACETYLCHOLINE [uh-see-tul-koe-leen]')).toMatchObject({ answer: 'ACETYLCHOLINE [uh-see-tul-koe-leen]', notes: [] });
  });

  it('tolerates typos and periods between ACCEPT parts', () => {
    expect(parseAnswerLine('+150 (SO NOT ACCEPT: –150)')).toMatchObject({ answer: '+150', reject: ['–150'] });
    expect(parseAnswerLine('IRON (III) (ACCEPT: IRON III. DO NOT ACCEPT: IRON)')).toMatchObject({
      answer: 'IRON (III)',
      accept: ['IRON III'],
      reject: ['IRON'],
    });
  });

  it('copes with an answer cut off before its closing parenthesis', () => {
    expect(parseAnswerLine('SEMICIRCULAR CANALS (ACCEPT: SEMICIRCULAR DUCTS')).toMatchObject({
      answer: 'SEMICIRCULAR CANALS',
      accept: ['SEMICIRCULAR DUCTS'],
    });
  });
});

describe('multiple choice parsing', () => {
  const parse = (text: string) =>
    parseDoeRound(lines(text), { setId: 'doe-hs-99', roundId: 'doe-hs-99-r01', label: 'Round 1', order: 1 }).round;

  it('joins options that wrap onto the next line', () => {
    const round = parse(`TOSS-UP
1) EARTH SCIENCE Multiple Choice Which of the following is LEAST accurate about
minerals:
W) calcite has a hardness of 3 on most of its surfaces but a hardness of 4 along the crystal face
perpendicular to its long axis
X) the Moh’s scale measures the absolute hardness of minerals
Y) a mineral’s chemical composition largely determines its crystal shape and cleavage pattern
Z) a mineral’s color is the same as its streak
ANSWER: Z) A MINERAL’S COLOR IS THE SAME AS ITS STREAK`);
    const q = round.pairs[0].tossup;
    expect(q.stem).toBe('Which of the following is LEAST accurate about minerals:');
    expect(q.choices?.W).toBe('calcite has a hardness of 3 on most of its surfaces but a hardness of 4 along the crystal face perpendicular to its long axis');
    expect(q.answerLetter).toBe('Z');
    expect(q.answer).toBe('A MINERAL’S COLOR IS THE SAME AS ITS STREAK');
    expect(q.subject).toBe('earth_space');
    expect(q.flags).toBeUndefined();
  });

  it('splits options printed on one line', () => {
    const round = parse(`TOSS-UP
5) EARTH SCIENCE Multiple Choice How many miles away is the storm:
W) 3 X) 6 Y) 9 Z) 15
ANSWER: W) 3`);
    expect(round.pairs[0].tossup.choices).toEqual({ W: '3', X: '6', Y: '9', Z: '15' });
  });

  it('reads misprinted option letters in order and trusts the answer text', () => {
    const round = parse(`TOSS-UP
1) EARTH AND SPACE Multiple Choice Isotelus rex is the largest found fossil of what organism?
W) Dinosaur
X) Whale
W) Fish
Z) Trilobite
ANSWER: Z) TRILOBITE
BONUS
1) GENERAL SCIENCE Multiple Choice Which battery technology was stopped by regulations:
W) nickel-cadmium cells
X) mercury-oxide cells
Y) zinc-air cells
Z) aluminum-air cells
ANSWER: W) MERCURY-OXIDE CELLS`);
    const t = round.pairs[0].tossup;
    expect(t.choices).toEqual({ W: 'Dinosaur', X: 'Whale', Y: 'Fish', Z: 'Trilobite' });
    expect(t.flags).toEqual(['choice-letters-fixed']);
    const b = round.pairs[0].bonus!;
    expect(b.answerLetter).toBe('X');
    expect(b.answerRaw).toBe('W) MERCURY-OXIDE CELLS');
    expect(b.flags).toContain('answer-letter-corrected');
  });

  it('flags missing options and missing answers', () => {
    const round = parse(`TOSS-UP
2) MATH Multiple Choice Which of the following functions is continuous at x = -1?
W) f(x) = 1/x
X) g(x) = x
ANSWER: X) g(x) = x
BONUS
2) MATH Short Answer Change 120 degrees to radians in terms of π.
ANSWER:`);
    expect(round.pairs[0].tossup.flags).toContain('choices-missing');
    expect(round.pairs[0].bonus?.flags).toContain('answer-missing');
  });

  it('follows the layout when the printed type is wrong', () => {
    const round = parse(`TOSS-UP
3) PHYSICS Multiple Choice What will be the final temperature in degrees Celsius?
ANSWER: 22`);
    expect(round.pairs[0].tossup).toMatchObject({ format: 'short_answer', answer: '22', flags: ['type-mismatch'] });
  });
});

describe('round structure', () => {
  it('removes headers, footers, page numbers and separators', () => {
    for (const noise of [
      'ROUND 1',
      'HIGH SCHOOL - ROUND 17A',
      'High School Round 1 Page 2',
      'High School Round 4 A Page 13',
      'Round 17',
      'Page 3',
      'Round Robin ~ Round 1 Page 1',
      'ROUND ROBIN – ROUND 1',
      'Double Elimination ~ Round 4 Page 1',
      '2019 Regional Science Bowl – Round 17A Page 1',
      '2007 Regional Science Bowl – Page 1',
      '2016 NSB® Regional High School Questions Page 1',
      '2017 Regional High School NSB® PAGE 1',
      'High School',
      'Set 2',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '_______________________________________________________',
      '******************',
    ]) {
      expect(isNoiseLine(noise), noise).toBe(true);
    }
    for (const text of ['TOSS-UP', 'ANSWER: 2', 'W) basic', 'Round your answer to the nearest hundred.', '3) Proteins.']) {
      expect(isNoiseLine(text), text).toBe(false);
    }
  });

  it('drops lines repeated on most pages even when no pattern knows them', () => {
    const pages = [1, 2, 3].map(
      (n) => `TOSS-UP
${n}) PHYSICS Short Answer Question ${n}?
ANSWER: ${n}
BONUS
${n}) PHYSICS Short Answer Bonus ${n}?
ANSWER: ${n + 10}
Mystery Footer Text ${n}`,
    );
    const { round } = parseDoeRound(linesFromPlainText(pages.join('\f')), { setId: 'doe-hs-99', roundId: 'doe-hs-99-r01', label: 'Round 1', order: 1 });
    expect(round.pairs).toHaveLength(3);
    expect(round.pairs[0].bonus?.answer).toBe('11');
    expect(round.pairs[2].bonus?.source.page).toBe(3);
  });

  it('joins wrapped lines, keeping hyphens at line ends', () => {
    expect(joinLines(['The TEX86 paleothermometer [pay-ley-ōe-', 'thehr-MOH-meh-tehr], measured'])).toBe(
      'The TEX86 paleothermometer [pay-ley-ōe-thehr-MOH-meh-tehr], measured',
    );
    expect(joinLines(['ANSWER: SHIFTS TO THE RIGHT (ACCEPT: MORE METHANOL IS PRODUCED, MORE', 'PRODUCT IS PRODUCED)'])).toBe(
      'ANSWER: SHIFTS TO THE RIGHT (ACCEPT: MORE METHANOL IS PRODUCED, MORE PRODUCT IS PRODUCED)',
    );
    expect(joinLines(['an answer of 10 –', '7'])).toBe('an answer of 10 – 7');
  });

  it('normalises old-style pronunciation guides', () => {
    expect(normalizePronunciation('pseudopodia (read as: SU-doe-POH-dee-ah) around')).toBe('pseudopodia [SU-doe-POH-dee-ah] around');
    expect(normalizePronunciation('Find (read as: the limit as x approaches 0 of f(x))')).toBe('Find [the limit as x approaches 0 of f(x)]');
    expect(normalizePronunciation('a (CHARLES) DARWIN')).toBe('a (CHARLES) DARWIN');
  });

  it('infers a missing marker, keeps numbering and does not mistake list items or wrapped answers', () => {
    const { round, warnings } = parseDoeRound(
      lines(`TOSS-UP
17) CHEMISTRY Short Answer Identify all of the following four motions:
1) rocking, 2) symmetrical stretching,
3) see-sawing, 4) twisting.
ANSWER: ROCKING, SYMMETRICAL STRETCHING, AND TWISTING (ACCEPT: 1, 2, AND
4)
BONUS
17) CHEMISTRY Short Answer What is 2 + 2?
ANSWER: 4
~~~~~~~~~~~~~~
18) Chemistry – Multiple Choice Which statement is NOT true?
W) a
X) b
Y) c
Z) d
ANSWER: Y) C
BONUS
18) Chemistry – Short Answer Name it.
ANSWER: IT`),
      { setId: 'doe-hs-99', roundId: 'doe-hs-99-r05', label: 'Round 5', order: 5 },
    );
    expect(round.pairs.map((p) => p.number)).toEqual([17, 18]);
    expect(round.pairs[0].tossup.stem).toBe('Identify all of the following four motions: 1) rocking, 2) symmetrical stretching, 3) see-sawing, 4) twisting.');
    expect(round.pairs[0].tossup.accept).toEqual(['1, 2, AND 4']);
    expect(round.pairs[1].tossup.id).toBe('doe-hs-99-r05-t18');
    expect(round.pairs[1].tossup.flags).toEqual(['kind-inferred']);
    expect(round.pairs[1].bonus?.id).toBe('doe-hs-99-r05-b18');
    expect(warnings.map((w) => w.code)).toEqual(['kind-inferred']);
  });

  it('reports a bonus without a toss-up', () => {
    const { round, warnings } = parseDoeRound(lines(`BONUS\n1) MATH Short Answer What is 1 + 1?\nANSWER: 2`), {
      setId: 'doe-hs-99',
      roundId: 'doe-hs-99-r01',
      label: 'Round 1',
      order: 1,
    });
    expect(round.pairs).toEqual([]);
    expect(warnings.map((w) => w.code)).toEqual(['orphan-bonus']);
  });

  it('flags image and equation hints from the text extractor', () => {
    const src: SourceLine[] = [
      { text: 'TOSS-UP', page: 1 },
      { text: '2) MATH Short Answer Find', page: 1 },
      { text: '', page: 1, hints: ['image'] },
      { text: '(read as: the limit as x approaches infinity of e to the negative x)', page: 1 },
      { text: 'ANSWER: 0', page: 1 },
    ];
    const q = parseDoeRound(src, { setId: 'doe-hs-99', roundId: 'doe-hs-99-r01', label: 'Round 1', order: 1 }).round.pairs[0].tossup;
    expect(q.stem).toBe('Find [the limit as x approaches infinity of e to the negative x]');
    expect(q.flags).toEqual(['image-not-extracted', 'possible-lost-formatting']);
  });
});

describe('middle school formats', () => {
  const ms = (text: string) => parseDoeRound(lines(text), { setId: 'doe-ms-99', roundId: 'doe-ms-99-r01', label: 'Round 1', order: 1 });

  it('reads middle school headers and footers as noise and as the printed label', () => {
    for (const noise of [
      'MIDDLE SCHOOL - ROUND 1A',
      'Middle School',
      'ROUND ROBIN 2',
      'DOUBLE ELIMINATION ROUND 1',
      'SINGLE ELIMINATION ROUND 3',
      'Round Robin 5, Page 3',
    ]) {
      expect(isNoiseLine(noise), noise).toBe(true);
    }
    expect(ms('DOUBLE ELIMINATION ROUND 3\nTOSS-UP\n1) MATH Short Answer What is 1 + 1?\nANSWER: 2').printedLabel).toBe('DOUBLE ELIMINATION ROUND 3');
    expect(ms('MIDDLE SCHOOL - ROUND 17A\nTOSS-UP\n1) Math – Short Answer What is 1 + 1?\nANSWER: 2').printedLabel).toBe('MIDDLE SCHOOL - ROUND 17A');
  });

  it('reads numbers with an asterisk or without the parenthesis, and a doubled category', () => {
    expect(parseQuestionHeader('*1) GENERAL SCIENCE Multiple Choice Fungi are usually spread by:')).toMatchObject({ number: 1, category: 'GENERAL SCIENCE', format: 'multiple_choice' });
    expect(parseQuestionHeader('17 LIFE SCIENCE Short Answer There are two main kinds of vaccines.')).toMatchObject({ number: 17, category: 'LIFE SCIENCE', format: 'short_answer' });
    expect(parseQuestionHeader('17 meters per second is the speed')).toBeUndefined();
    expect(parseQuestionHeader('17) LIFE SCIENCE Mutliple Choice Among adult humans,')).toMatchObject({ format: 'multiple_choice' });
    expect(mapCategory('MATH Math')).toBe('math');
    expect(mapCategory('Physical SCIENCE')).toBe('physical_science');
  });

  it('reads options printed in lower case and the "ANWER:" typo', () => {
    const { round } = ms(`TOSS-UP
1) LIFE SCIENCE Multiple Choice Which cells are capable of the most phagocytosis
w) plasma cells
X) lymphocytes
Y) mast cells
Z) macrophages
ANWER: Z) MACROPHAGES
BONUS
1) GENERAL SCIENCE Multiple Choice The shape of galaxies is mostly attributed to:
w) light
x) matter
y) electricity
z) gravity
ANSWER: Z) GRAVITY`);
    expect(round.pairs[0].tossup.choices).toEqual({ W: 'plasma cells', X: 'lymphocytes', Y: 'mast cells', Z: 'macrophages' });
    expect(round.pairs[0].tossup).toMatchObject({ answer: 'MACROPHAGES', answerLetter: 'Z' });
    expect(round.pairs[0].tossup.flags).toBeUndefined();
    expect(round.pairs[0].bonus?.choices).toEqual({ W: 'light', X: 'matter', Y: 'electricity', Z: 'gravity' });
  });

  it('reads a question printed with its number only, right after its marker', () => {
    const { round, strayLines } = ms(`TOSS-UP
15) PHYSICAL SCIENCE Short Answer Name the two planets.
ANSWER: MARS AND JUPITER
BONUS
15) MATH Short Answer What is 2 + 2?
ANSWER: 4
TOSS-UP
16) What is the most common term for the 12 constellations the Sun passes in front of?
ANSWER: ZODIAC
BONUS
16) GENERAL SCIENCE Short Answer A 1 pint 9 ounce bottle contains how many fluid ounces?
ANSWER: 25`);
    expect(strayLines).toEqual([]);
    expect(round.pairs.map((p) => p.number)).toEqual([15, 16]);
    expect(round.pairs[1].tossup).toMatchObject({ answer: 'ZODIAC', sourceCategory: '', subject: 'general_science', flags: ['category-unknown', 'type-unknown'] });
    expect(round.pairs[1].bonus?.answer).toBe('25');
  });

  it('reads a bonus printed under a second TOSS-UP marker, and toss-ups printed out of order', () => {
    const { round } = ms(`TOSS-UP
16) Physical Science – Short Answer What particle was found in cathode ray experiments?
ANSWER: ELECTRON
TOSS-UP
16) Physical Science – Short Answer What device stores charge?
ANSWER: CAPACITOR
TOSS-UP
17) Math – Short Answer What is 3 + 4?
ANSWER: 7
BONUS
17) Math – Short Answer What is 3 x 4?
ANSWER: 12
TOSS-UP
19) Math – Short Answer What is 9 + 9?
ANSWER: 18
BONUS
19) Math – Short Answer What is 9 x 9?
ANSWER: 81
TOSS-UP
18) Math – Short Answer What is 8 + 8?
ANSWER: 16
BONUS
18) Math – Short Answer What is 8 x 8?
ANSWER: 64
TOSS-UP
20) Math – Short Answer What is 1 + 1?
ANSWER: 2
BONUS
20) Math – Short Answer What is 1 x 1?
ANSWER: 1`);
    expect(round.pairs.map((p) => p.number)).toEqual([16, 17, 18, 19, 20]);
    expect(round.pairs[0].bonus).toMatchObject({ kind: 'bonus', answer: 'CAPACITOR', flags: ['kind-corrected'] });
    expect(round.pairs[2].tossup).toMatchObject({ answer: '18', flags: ['number-mismatch'] });
    expect(round.pairs[3].tossup).toMatchObject({ answer: '16', flags: ['number-mismatch'] });
    expect(round.pairs[4].tossup.flags).toBeUndefined();
  });

  it('keeps a skipped number when the question was omitted', () => {
    const { round } = ms(`TOSS-UP
7) MATH Short Answer What is 7?
ANSWER: 7
BONUS
7) MATH Short Answer What is 77?
ANSWER: 77
The toss-up and bonus for Question 8 have been omitted.
TOSS-UP
9) MATH Short Answer What is 9?
ANSWER: 9
BONUS
9) MATH Short Answer What is 99?
ANSWER: 99`);
    expect(round.pairs.map((p) => p.number)).toEqual([7, 9]);
    expect(round.pairs[1].tossup.flags).toBeUndefined();
  });

  it('takes the letter of the one option an answer names when the letter is not printed', () => {
    const { round, warnings } = ms(`TOSS-UP
13) Energy – Multiple Choice As a spring is compressed, what happens to its elastic potential energy?
W) It increases
X) It decreases
Y) It is unchanged
Z) It decreases, then increases
ANSWER: IT INCREASES
BONUS
13) Math – Multiple Choice Which is largest?
W) 2
X) 20
Y) 25
Z) 3
ANSWER: 2`);
    expect(round.pairs[0].tossup).toMatchObject({ answer: 'IT INCREASES', answerLetter: 'W' });
    expect(round.pairs[0].tossup.flags).toBeUndefined();
    expect(warnings.map((w) => w.code)).toContain('answer-letter-inferred');
    // "2" names W exactly; prefixes of other options do not count.
    expect(round.pairs[0].bonus).toMatchObject({ answerLetter: 'W' });
  });
});

describe('category mapping', () => {
  it('maps every printed category', () => {
    const cases: [string, string][] = [
      ['BIOLOGY', 'biology'],
      ['Life Science', 'biology'],
      ['CHEMISTRY', 'chemistry'],
      ['Physics', 'physics'],
      ['MATH', 'math'],
      ['Mathematics', 'math'],
      ['ENERGY', 'energy'],
      ['EARTH AND SPACE', 'earth_space'],
      ['Earth and Space Science', 'earth_space'],
      ['Earth & Space', 'earth_space'],
      ['EARTH SCIENCE', 'earth_space'],
      ['ASTRONOMY', 'earth_space'],
      ['GENERAL SCIENCE', 'general_science'],
      ['Computer Science', 'computer_science'],
      ['PHYSICAL SCIENCE', 'physical_science'],
    ];
    for (const [printed, subject] of cases) expect(mapCategory(printed), printed).toBe(subject);
  });

  it('ignores case and spacing, tolerates the EARTH ANDE SPACE typo, rejects unknowns', () => {
    expect(mapCategory('  earth   and space ')).toBe('earth_space');
    expect(mapCategory('eArTh sCiEnCe')).toBe('earth_space');
    expect(mapCategory('EARTH ANDE SPACE')).toBe('earth_space');
    expect(mapCategory('ASTROLOGY')).toBeUndefined();
    expect(mapCategory('')).toBeUndefined();
  });

  it('flags an unknown category', () => {
    const { round, warnings } = parseDoeRound(lines(`TOSS-UP\n1) ALCHEMY Short Answer What is gold?\nANSWER: AU`), {
      setId: 'doe-hs-99',
      roundId: 'doe-hs-99-r01',
      label: 'Round 1',
      order: 1,
    });
    expect(round.pairs[0].tossup).toMatchObject({ sourceCategory: 'ALCHEMY', subject: 'general_science', flags: ['category-unknown'] });
    expect(warnings.map((w) => w.code)).toEqual(['category-unknown', 'bonus-missing']);
  });
});

describe('visual questions', () => {
  it('detects questions that depend on a figure', () => {
    expect(detectVisual('Using the diagram shown, identify the structure labeled A.')).toBe(true);
    expect(detectVisual('Which of the following is shown in the figure?')).toBe(true);
    expect(detectVisual('Refer to the diagram to answer the question.')).toBe(true);
    expect(detectVisual('VISUAL BONUS: identify the organelle.')).toBe(true);
    expect(detectVisual('To the nearest degree Celsius, what is the x-intercept of this graph?')).toBe(false);
    expect(detectVisual('Which of the following map projections has true latitude and longitude lines?')).toBe(false);
    expect(detectVisual('What is the image of the point (2, 3) after a reflection over the x-axis?')).toBe(false);
    expect(detectVisual('Sketch the graph of y = x² in your head. Where is its vertex?')).toBe(false);
  });
});

describe('pdfText: superscripts, subscripts and fractions', () => {
  const item = (str: string, x: number, y: number, size: number, width = str.length * size * 0.5): PositionedText => ({ str, x, y, size, width });

  it('writes raised and lowered digits as Unicode', () => {
    const page = buildLines(
      [
        item('A proton with a charge of 1.6 x 10', 72, 500, 10.98, 164.43),
        item('-19', 236.43, 503.49, 7.02, 10.14),
        item(' ', 246.57, 503.49, 7.02, 0.43),
        item('coulombs', 249.57, 500, 10.98, 45),
        item('Y) CO', 72, 480, 14, 37.74),
        item('3', 109.8, 478.44, 9, 4.44),
        item('2–', 114.24, 485.04, 9, 9.06),
      ],
      1,
    );
    expect(page.map((l) => l.text)).toEqual(['A proton with a charge of 1.6 x 10⁻¹⁹ coulombs', 'Y) CO₃²⁻']);
  });

  it('falls back to ^(...) when a script has letters without Unicode forms', () => {
    const page = buildLines(
      [
        item('ANSWER: a', 90, 600, 12, 64),
        item('b', 154.89, 605.38, 7, 3.5),
        item('+', 158.5, 605.38, 7, 3.85),
        item('b', 162.6, 605.38, 7, 3.5),
      ],
      1,
    );
    expect(page[0].text).toBe('ANSWER: a^(b+b)');
  });

  it('reads a small stacked fraction inside a line', () => {
    const page = buildLines(
      [
        item('Find the ratio of x to y if:', 72, 629.7, 10.98, 247),
        item('(x−y)', 325.08, 636.18, 7.98, 22.5),
        item('(x+y)', 325.08, 624.12, 7.98, 22.5),
        item('=', 350.76, 629.7, 10.98, 8.2),
        item('2', 364.5, 636.18, 7.98, 4.62),
        item('3', 364.5, 624.12, 7.98, 4.62),
      ],
      1,
    );
    expect(page).toHaveLength(1);
    expect(page[0].text).toBe('Find the ratio of x to y if: (x−y)/(x+y) = 2/3');
    expect(page[0].hints).toContain('math');
  });

  it('reads a whole number followed by a stacked fraction as a mixed number', () => {
    // "Add the following: 3 ½ + 2 ⅓ =" with the fractions stacked in a smaller font (middle school Set 2).
    const page = buildLines(
      [
        item('Add the following: 3', 72, 629.7, 10.98, 120),
        item('1', 193, 636.18, 7.98, 4.62),
        item('2', 193, 624.12, 7.98, 4.62),
        item('+ 2', 200, 629.7, 10.98, 14),
        item('1', 215, 636.18, 7.98, 4.62),
        item('3', 215, 624.12, 7.98, 4.62),
        item('=', 224, 629.7, 10.98, 8.2),
      ],
      1,
    );
    expect(page).toHaveLength(1);
    expect(page[0].text).toBe('Add the following: 3 1/2 + 2 1/3 =');
  });

  it('keeps exponents of consecutive option lines apart', () => {
    const page = buildLines(
      [
        item('W) 10', 72.01, 226.62, 10.98, 29.32),
        item('-7', 101.34, 231.6, 7.02, 6.24),
        item('X) 10', 72, 214.01, 10.98, 26.2),
        item('-5', 98.22, 219, 7.02, 6.24),
      ],
      1,
    );
    expect(page.map((l) => l.text)).toEqual(['W) 10⁻⁷', 'X) 10⁻⁵']);
  });

  it('formats scripts', () => {
    expect(formatScript('2', 'sup')).toBe('²');
    expect(formatScript('–7', 'sup')).toBe('⁻⁷');
    expect(formatScript('n+1', 'sup')).toBe('ⁿ⁺¹');
    expect(formatScript('2x', 'sub')).toBe('₂ₓ');
    expect(formatScript('aq', 'sub')).toBe('_(aq)');
    expect(formatScript('th', 'sup')).toBe('th');
    expect(formatScript('o', 'sup', '90')).toBe('°');
  });

  it('repairs math letters and symbol-font characters', () => {
    expect(normalizeMathText('(𝑥𝑥−𝑦𝑦)')).toBe('(x−y)');
    expect(normalizeMathText('(x \u0000 2)')).toBe('(x − 2)');
    expect(normalizeMathText('solid \uf0e0 vapor')).toBe('solid → vapor');
    expect(normalizeMathText('SiCl₄ + 2Mg à\uf0e0 2MgCl₂')).toBe('SiCl₄ + 2Mg → 2MgCl₂');
    expect(normalizeMathText('An \uf061-particle')).toBe('An α-particle');
  });
});

describe('answer-key fixes', () => {
  const meta = { setId: 'doe-hs-07', roundId: 'doe-hs-07-r09', label: 'Round 9', order: 9, credit: 'test' };
  const round = (body: string) => parseDoeRound(linesFromPlainText(body), meta).round;

  it('keeps DOE letters when the choices are printed out of order', () => {
    const r = round(`TOSS-UP
20) EARTH AND SPACE Short Answer What type of stream drainage is the Columbia River along the Columbia River Gorge?
ANSWER: ANTECEDENT
BONUS
20) EARTH AND SPACE Multiple Choice The Columbia River Gorge primarily cuts through what type of rock?
W) Granite
Y) Sandstone
X) Basalt
Z) Schist [SHIST]
ANSWER: X) BASALT`);
    const q = r.pairs[0]?.bonus;
    expect(q?.choices).toMatchObject({ W: 'Granite', X: 'Basalt', Y: 'Sandstone' });
    expect(q?.answerLetter).toBe('X');
    expect(q?.flags).toContain('choices-reordered');
    expect(q?.flags ?? []).not.toContain('answer-letter-corrected');
  });

  it('applies reviewed errata and refuses ones that no longer fit', () => {
    const r = round(`TOSS-UP
20) GENERAL SCIENCE Multiple Choice Which of the following is an all but obsolete battery technology stopped by government regulations in this country because of toxicity issues:
W) nickel-cadmium cells
X) mercury-oxide cells
Y) zinc-air cells
Z) aluminum-air cells
ANSWER: W) MERCURY-OXIDE CELLS`);
    const q = r.pairs[0].tossup;
    const erratum = { id: q.id, answerLetter: 'X' as const, note: 'Corrected: test', reviewed: '2026-11-07' };
    expect(applyDoeErrata(r, [erratum])).toEqual([q.id]);
    expect(q.answerLetter).toBe('X');
    expect(q.flags).toEqual(['erratum']);
    expect(q.notes).toEqual(['Corrected: test']);
    expect(() => applyDoeErrata(r, [{ ...erratum, answerLetter: 'Y' }])).toThrow(/no longer fits/);
  });
});
