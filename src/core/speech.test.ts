import { describe, expect, it } from 'vitest';
import { buildReading, readingDurationMs } from '../lib/reading';
import { bracketKind, MAX_PHRASE_MS, MAX_RATE, MIN_PHRASE_MS, MIN_RATE, rateFor, speechChunks, spokenFor, spokenText } from './speech';

const say = (stem: string, choices?: Record<'W' | 'X' | 'Y' | 'Z', string>) => speechChunks(buildReading({ stem, choices }), 180).map((c) => c.say);
const sayAll = (stem: string) => say(stem).join(' ');

describe('brackets in DOE questions', () => {
  it('skips pronunciation guides and notes to the moderator', () => {
    for (const c of ['SU-doe-POH-dee-ah', 'ves-TIB-u-lar', 'TALL – you – een', 'SHIST', 'ray-nee', 'read slowly', 'pause', 'dy-E-thi-leen', 'play-O-truh-pee']) {
      expect(bracketKind(c)).toBe('pronunciation');
    }
    for (const c of ['X-big-B-X-little-B', 'S-eye', 'A-R-4-s-2']) expect(bracketKind(c)).toBe('reading');
  });

  it('reads reading guides, and says notation like the rest of the text', () => {
    for (const c of ['y equals the square root of x squared', 'theta', 'A, A, A', 'one <pause> s', '1, s, 2; 2, s, 2', 'little b', 'C double bond C']) {
      expect(bracketKind(c)).toBe('reading');
    }
    for (const c of ['NH₄⁺', 'π/6 (x + π/12)', '3a – (b + c) – 4d']) expect(bracketKind(c)).toBe('notation');
  });
});

describe('symbols in words', () => {
  it.each([
    ['x²', 'x squared'],
    ['4x³', '4x cubed'],
    ['8 × 10⁻²', '8 times 10 to the power of negative 2'],
    ['2ˣ⁺¹', '2 to the power of x plus 1'],
    ['SO₄²⁻', 'SO4 2 minus'],
    ['Fe³⁺', 'Fe 3 plus'],
    ['OH⁻', 'OH minus'],
    ['N⁺²', 'N 2 plus'],
    ['1s²2s²2p⁵', '1s 2 2s 2 2p 5'],
    ['25.101 – 0.9608', '25.101 minus 0.9608'],
    ['b = –1', 'b equals negative 1'],
    ['(x² − 16)/(4x − x²)', '(x squared minus 16) divided by (4x minus x squared)'],
    ['125/343', '125 over 343'],
    ['14π/3', '14 pi over 3'],
    ['1/x', '1 over x'],
    ['x/(x + 2)', 'x divided by (x plus 2)'],
    ['1.6 x 10⁻¹⁹', '1.6 times 10 to the power of negative 19'],
    ['2 Mg_((s)) + O_(2(g))', '2 Mg solid plus O2 gas'],
    ['NaOH_((aq))', 'NaOH aqueous'],
    ['K_(eq)', 'K sub eq'],
    ['t_(1/2)', 't sub one half'],
    ['lim_(x→0) f(x)', 'the limit as x approaches 0 f of x'],
    ['12°C', '12 degrees Celsius'],
    ['in terms of π', 'in terms of pi'],
    ['√x', 'the square root of x'],
    ['f(x) when g’(2) is 0', 'f of x when g prime of 2 is 0'],
    ['from 1990–2000', 'from 1990 to 2000'],
    ['10 m/s', '10 m per s'],
    ['aₙ = 5', 'a sub n equals 5'],
    ['0 ≤ x < 2π', '0 less than or equal to x less than 2 pi'],
    ['Cu₂O', 'Cu2O'],
    ['25!', '25 factorial'],
    ['x³/3!', 'x cubed over 3 factorial'],
    ['there is snow!', 'there is snow!'],
    ['20ºC', '20 degrees Celsius'],
    ['343 meters/second', '343 meters per second'],
    ['1 + m2/m1', '1 plus m2 over m1'],
    ['Force/mass', 'Force over mass'],
    ['CRISPR/Cas9', 'CRISPR Cas9'],
    ['true/false', 'true false'],
    ['the G1/S checkpoint', 'the G1 S checkpoint'],
    ['the σ* 1s orbital', 'the sigma star 1s orbital'],
    ['a fungus*', 'a fungus'],
    ['E.coli', 'E. coli'],
    ['α-Defensin', 'alpha-Defensin'],
    ['¹H-NMR', 'H 1 NMR'],
    ['log₂ 8', 'log base 2 of 8'],
    ['−2√5 and i√2', 'negative 2 times the square root of 5 and i times the square root of 2'],
    ['⁴√81', 'the fourth root of 81'],
  ])('%s is said "%s"', (text, words) => {
    expect(spokenText(text)).toBe(words);
  });

  it('leaves out characters no voice can say', () => {
    expect(spokenText('ଵ/గ ሺ1 ൅ ݎሻ')).toBe('/ 1');
  });
});

describe('what is said', () => {
  it('says a reading guide in place of the math before it', () => {
    expect(sayAll('What is the slope of the curve y = √x² − 3x [y equals the square root of x squared minus 3x] at the point (4, 2)?')).toBe(
      'What is the slope of the curve y equals the square root of x squared minus 3x at the point (4, 2)?',
    );
    // The guide reads only the right side: "rate =" stays.
    expect(sayAll('Give the order of this rate law: rate = k[NH₄⁺][NO₂⁻] [k times the concentration of NH₄⁺ times the concentration of NO₂⁻]')).toBe(
      'Give the order of this rate law: rate equals k times the concentration of NH4 plus times the concentration of NO2 minus',
    );
    expect(sayAll('Which genotype is AAA [A, A, A] here?')).toBe('Which genotype is A, A, A here?');
    expect(sayAll('Burning wood: Wood → [yields] Fire')).toBe('Burning wood: Wood yields Fire');
  });

  it('says an x between numbers as times, and a slash on its own as over or divided by', () => {
    expect(sayAll('a buoyant force of 19.6 x 10³ newtons, or 6.02 x 10²³')).toBe('a buoyant force of 19.6 times 10 cubed newtons, or 6.02 times 10 to the power of 23');
    expect(sayAll('the ellipse (x + 1)² / 16 + y² /9 = 1, and x / (x + 2)')).toBe(
      'the ellipse open parenthesis x plus 1 close parenthesis squared over 16 plus y squared over 9 equals 1, and x divided by open parenthesis x plus 2 close parenthesis',
    );
    expect(sayAll('Is x between 2 and 3, or 2 x y?')).toBe('Is x between 2 and 3, or 2 x y?');
  });

  it('says the brackets of math, and "times" between brackets multiplied, as DOE reads them', () => {
    expect(sayAll('Multiply, giving your answer in standard a + bi form: (6 + 3i)(4 + i)')).toBe(
      'Multiply, giving your answer in standard a plus bi form: open parenthesis 6 plus 3i close parenthesis times open parenthesis 4 plus i close parenthesis',
    );
    expect(sayAll('Arrange in order: (–3)²; –(4)²')).toBe(
      'Arrange in order: open parenthesis negative 3 close parenthesis squared; negative open parenthesis 4 close parenthesis squared',
    );
    expect(sayAll('Solve 3(x + 1) ≥ 9, express f(x + 1), and find 2/(n + 6)')).toBe(
      'Solve 3 times open parenthesis x plus 1 close parenthesis greater than or equal to 9, express f of open parenthesis x plus 1 close parenthesis, and find 2 divided by open parenthesis n plus 6 close parenthesis',
    );
    expect(sayAll('Multiply the following 5 numbers: (-2)(-5)(-4)')).toBe('Multiply the following 5 numbers: (-2) times (-5) times (-4)');
    // Points, chemical groups, states, values given in passing and spellings keep their brackets unsaid.
    expect(sayAll('the point (3, –5), Ca(OH)₂, NaOH_((aq)), air (n = 1.00), the name (K-A-T)')).toBe(
      'the point (3, negative 5), Ca(OH)2, NaOH aqueous, air (n equals 1.00), the name (K-A-T)',
    );
  });

  it('says an x after a choice letter as the variable', () => {
    expect(say('Which is a root?', { W: 'x − 2 = 0', X: 'x + 2 = 0', Y: '2x = 1', Z: 'x² = 4' })).toEqual([
      'Which is a root?',
      'W, x minus 2 equals 0',
      'X, x plus 2 equals 0',
      'Y, 2x equals 1',
      'Z, x squared equals 4',
    ]);
  });

  it('lets a guide read a factorial, a star and a product of variables, but not a statement number', () => {
    expect(sayAll('How many zeroes are at the end of 25! [25 factorial]?')).toBe('How many zeroes are at the end of 25 factorial?');
    expect(sayAll('If a * b = ab ÷ (a + b) [a star b equals a times b divided by the quantity a plus b], then')).toBe(
      'If a star b equals a times b divided by the quantity a plus b, then',
    );
    expect(sayAll('have bond orders: 1) H-two [H-2]; 2) He-two [H-E-2]')).toBe('have bond orders: 1) H-2; 2) H-E-2');
  });

  it('says a guide that only names an operator in place of that operator, keeping the math before it', () => {
    expect(sayAll('Which is reduced in the reaction: 3 Zn + Fe₂O₃ → [yields] 2Fe + 3 ZnO.')).toBe(
      'Which is reduced in the reaction: 3 Zn plus Fe2O3 yields 2Fe plus 3 ZnO.',
    );
    // The arrow was lost from the PDF; the guide stands in for it.
    expect(sayAll('in the gas phase: 2 H₂O_((g)) [in equilibrium with] 2 H_(2(g)) + O_(2(g)).')).toBe(
      'in the gas phase: 2 H2O gas in equilibrium with 2 H2 gas plus O2 gas.',
    );
  });

  it('says a core or a genotype once, by the guide that reads it', () => {
    expect(say('Which configuration is most stable?', { W: '[He]2s¹ [H-E-2-S-1]', X: '[Ar]4s²3d⁹ [A-R-4-s-2-short pause-3-d-9]', Y: 'He 2 [pause] 2 plus', Z: '[He] 2s²2p⁶' })).toEqual([
      'Which configuration is most stable?',
      'W, H-E-2-S-1',
      'X, A-R-4-s-2, 3-d-9',
      'Y, He 2, 2 plus',
      'Z, He 2s 2 2p 6',
    ]);
    expect(sayAll('When two organisms with the genotype Aa [big A, little a] are crossed, what proportion?')).toBe(
      'When two organisms with the genotype big A, little a are crossed, what proportion?',
    );
    expect(sayAll('If a bb [little B little B] mouse is crossed with a Bb [big B little b] mouse, what percent?')).toBe(
      'If a little B little B mouse is crossed with a big B little b mouse, what percent?',
    );
  });

  it('takes guides written out in the text, "(read as ...)" and "Read as: ...", like those in brackets', () => {
    expect(sayAll('Find (1 + i)¹² (read as the quantity 1 plus i to the twelfth).')).toBe('Find the quantity 1 plus i to the twelfth.');
    expect(say('Which is correct?', { W: 'Fibrinogen (read as; fy-BRI-noh-jehn)', X: 'k', Y: 'j', Z: 'i' })[1]).toBe('W, Fibrinogen');
    expect(say('Which is greater than 1:', { W: '–(–k)³ Read as: negative - open parenthesis - negative k - closed parenthesis - to the third power', X: 'k', Y: 'j', Z: 'i' })[1]).toBe(
      'W, negative, open parenthesis, negative k, closed parenthesis, to the third power',
    );
  });

  it('skips pronunciation guides', () => {
    expect(sayAll('It engulfs a particle by extending its pseudopodia [SU-doe-POH-dee-ah] around the particle?')).toBe(
      'It engulfs a particle by extending its pseudopodia around the particle?',
    );
    expect(sayAll('reacted on Raney [ray-nee] nickel')).toBe('reacted on Raney nickel');
  });

  it('says each answer choice as its own phrase, with its letter, even when a guide reads it', () => {
    expect(say('Which of the following is equivalent to ln(1/8) [the natural log of one eighth]?', { W: '3ln2 [3 natural log of 2]', X: '-ln3 [negative natural log of 3]', Y: 'e', Z: '0' })).toEqual([
      'Which of the following is equivalent to the natural log of one eighth?',
      'W, 3 natural log of 2',
      'X, negative natural log of 3',
      'Y, e',
      'Z, 0',
    ]);
  });
});

describe('a recording of a question', () => {
  it('pauses before the choices that complete a stem, and ends every other line as a sentence', () => {
    const choices = { W: 'heat', X: 'light', Y: 'sound', Z: 'motion' };
    expect(spokenFor({ stem: 'Most of the energy is lost as:', choices })).toBe('Most of the energy is lost as: W, heat. X, light. Y, sound. Z, motion.');
    expect(spokenFor({ stem: 'Most of the energy is lost as', choices })).toBe('Most of the energy is lost as: W, heat. X, light. Y, sound. Z, motion.');
    expect(spokenFor({ stem: 'Which is lost most?', choices })).toBe('Which is lost most? W, heat. X, light. Y, sound. Z, motion.');
  });
});

describe('phrases', () => {
  it('end at punctuation once they last a moment, not at an initial', () => {
    expect(say('Bacteria in the species E. coli live in the gut. Which vitamin do they make there?')).toEqual([
      'Bacteria in the species E. coli live in the gut.',
      'Which vitamin do they make there?',
    ]);
    // "Yes," alone is too short to be a phrase of its own: each phrase costs the voice a moment to start.
    expect(say('Yes, the gut bacteria make it. Which vitamin is it?')).toEqual(['Yes, the gut bacteria make it.', 'Which vitamin is it?']);
  });

  it('split a long sentence at its commas, and within a long stretch with none', () => {
    expect(
      say(
        'An aqueous solution in which the concentration of hydroxide ions is greater than that of hydrogen ions, at 25 degrees Celsius and one atmosphere of pressure, is called what?',
      ),
    ).toEqual([
      'An aqueous solution in which the concentration',
      'of hydroxide ions is greater than that of hydrogen ions,',
      'at 25 degrees Celsius and one atmosphere of pressure,',
      'is called what?',
    ]);
  });
});

describe('phrases on the timeline', () => {
  const stem =
    'An aqueous solution in which the concentration of OH⁻ ions is greater than that of H⁺ ions, at 25 degrees and one atmosphere of pressure, is called what?';
  const reading = buildReading({ stem, choices: { W: 'basic', X: 'acidic', Y: 'neutral', Z: 'in equilibrium' } });
  const chunks = speechChunks(reading, 200);

  it('covers the whole reading, in order, from its start to its end', () => {
    expect(chunks[0]!.startMs).toBe(0);
    expect(chunks[chunks.length - 1]!.endMs).toBeCloseTo(readingDurationMs(reading, 200), 6);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startMs).toBeGreaterThanOrEqual(chunks[i - 1]!.endMs);
      expect(chunks[i]!.start).toBeGreaterThanOrEqual(chunks[i - 1]!.end);
    }
  });

  it('keeps phrases short, but long enough to be worth starting, and ends one at each answer choice', () => {
    for (const c of chunks) expect(c.endMs - c.startMs).toBeLessThanOrEqual(MAX_PHRASE_MS + 600);
    for (const c of chunks.slice(0, -5)) expect(c.endMs - c.startMs).toBeGreaterThanOrEqual(MIN_PHRASE_MS);
    expect(chunks.slice(-4).map((c) => c.say)).toEqual(['W, basic', 'X, acidic', 'Y, neutral', 'Z, in equilibrium']);
    // The pause before each choice is part of the timeline, so a choice starts after a gap.
    const w = chunks[chunks.length - 4]!;
    expect(w.startMs).toBeGreaterThan(chunks[chunks.length - 5]!.endMs);
  });
});

describe('speaking rate', () => {
  it('fits a phrase into its time, within what voices can do', () => {
    // 30 characters in 2 seconds, from a voice that says 15 a second: its normal rate.
    expect(rateFor('a'.repeat(30), 2000, 15)).toBeCloseTo(1, 6);
    expect(rateFor('a'.repeat(30), 1000, 15)).toBeCloseTo(2, 6);
    expect(rateFor('a'.repeat(30), 100, 15)).toBe(MAX_RATE);
    expect(rateFor('a'.repeat(3), 5000, 15)).toBe(MIN_RATE);
    expect(rateFor('anything', 0, 15)).toBe(MAX_RATE);
  });
});
