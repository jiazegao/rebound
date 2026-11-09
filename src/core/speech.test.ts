import { describe, expect, it } from 'vitest';
import { buildReading, readingDurationMs } from '../lib/reading';
import { bracketKind, MAX_PHRASE_WORDS, MAX_RATE, MIN_RATE, rateFor, speechChunks, spokenText } from './speech';

const say = (stem: string, choices?: Record<'W' | 'X' | 'Y' | 'Z', string>) => speechChunks(buildReading({ stem, choices }), 180).map((c) => c.say);
const sayAll = (stem: string) => say(stem).join(' ');

describe('brackets in DOE questions', () => {
  it('skips pronunciation guides and notes to the moderator', () => {
    for (const c of ['SU-doe-POH-dee-ah', 'ves-TIB-u-lar', 'TALL – you – een', 'SHIST', 'ray-nee', 'read slowly', 'pause']) expect(bracketKind(c)).toBe('pronunciation');
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
    ['(x² − 16)/(4x − x²)', '(x squared minus 16) over (4x minus x squared)'],
    ['125/343', '125 over 343'],
    ['12°C', '12 degrees Celsius'],
    ['in terms of π', 'in terms of pi'],
    ['√x', 'the square root of x'],
    ['f(x) when g’(2) is 0', 'f of x when g prime of 2 is 0'],
    ['from 1990–2000', 'from 1990 to 2000'],
    ['10 m/s', '10 m per s'],
    ['aₙ = 5', 'a sub n equals 5'],
    ['0 ≤ x < 2π', '0 less than or equal to x less than 2 pi'],
    ['Cu₂O', 'Cu2O'],
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

  it('keeps phrases short and ends one at each answer choice', () => {
    for (const c of chunks) expect(c.say.split(' ').length).toBeLessThanOrEqual(MAX_PHRASE_WORDS);
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
