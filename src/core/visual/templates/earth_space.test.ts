import { describe, expect, it } from 'vitest';
import { judgeAnswer } from '../../judge/judge';
import { draftToQuestion } from '../index';
import { makeRng } from '../rng';
import { checkTemplate } from '../testkit';
import { EARTH_SPACE_TEMPLATES, mainSequenceLogL, moonPhaseIndex, orbitAnswer, seasonEvent } from './earth_space';

const byId = (id: string) => {
  const t = EARTH_SPACE_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`no template ${id}`);
  return t;
};

describe('earth and space visual templates', () => {
  it('has templates', () => expect(EARTH_SPACE_TEMPLATES.length).toBeGreaterThan(0));
  for (const t of EARTH_SPACE_TEMPLATES) it(t.id, () => checkTemplate(t));
});

describe('moon phases', () => {
  it('names the phase from the angle between the Moon and the Sun, counterclockwise from above the North Pole', () => {
    // Sunlight from the right (Sun at 0°): new Moon toward the Sun, first quarter above Earth, full Moon opposite.
    expect(moonPhaseIndex(0, 0)).toBe(0);
    expect(moonPhaseIndex(45, 0)).toBe(1);
    expect(moonPhaseIndex(90, 0)).toBe(2);
    expect(moonPhaseIndex(180, 0)).toBe(4);
    expect(moonPhaseIndex(270, 0)).toBe(6);
    expect(moonPhaseIndex(315, 0)).toBe(7);
    // Sunlight from the left (Sun at 180°): first quarter is below Earth, full Moon to the right.
    expect(moonPhaseIndex(180, 180)).toBe(0);
    expect(moonPhaseIndex(225, 180)).toBe(1);
    expect(moonPhaseIndex(270, 180)).toBe(2);
    expect(moonPhaseIndex(0, 180)).toBe(4);
    expect(moonPhaseIndex(90, 180)).toBe(6);
  });

  it('refuses the opposite waxing or waning phase and accepts the usual variants', () => {
    const t = byId('earth_space-moon-phase');
    let seen = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const d = t.make(makeRng(seed));
      const q = draftToQuestion(t, seed, d);
      if (d.answer === 'WAXING GIBBOUS') {
        expect(judgeAnswer(q, 'waning gibbous').verdict).toBe('incorrect');
        expect(judgeAnswer(q, 'waxing gibbous moon').verdict).toBe('correct');
        seen++;
      }
      if (d.answer === 'THIRD QUARTER') {
        expect(judgeAnswer(q, 'last quarter').verdict).toBe('correct');
        expect(judgeAnswer(q, 'first quarter').verdict).toBe('incorrect');
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('H–R diagram', () => {
  it('puts the Sun on the main sequence', () => {
    expect(mainSequenceLogL(3.76)).toBeCloseTo(0, 5);
    expect(mainSequenceLogL(4.48)).toBeCloseTo(4.35, 5);
  });
});

describe('seasons', () => {
  it('finds the June solstice where the north end of the axis leans toward the Sun', () => {
    // North end leaning left: Earth at the right end of the orbit leans toward the Sun.
    expect(seasonEvent(0, -1)).toBe(0); // June solstice
    expect(seasonEvent(1, -1)).toBe(1); // September equinox follows, counterclockwise
    expect(seasonEvent(2, -1)).toBe(2); // December solstice
    expect(seasonEvent(3, -1)).toBe(3); // March equinox
    // North end leaning right: the left end of the orbit is the June solstice.
    expect(seasonEvent(2, 1)).toBe(0);
    expect(seasonEvent(3, 1)).toBe(1);
    expect(seasonEvent(0, 1)).toBe(2);
    expect(seasonEvent(1, 1)).toBe(3);
  });
});

describe('elliptical orbit', () => {
  it('computes eccentricity, semi-major axis, period and speed ratio exactly', () => {
    expect(orbitAnswer('eccentricity', 2, 6)).toBe('1/2');
    expect(orbitAnswer('eccentricity', 1, 9)).toBe('4/5');
    expect(orbitAnswer('axis', 1, 6)).toBe('7/2');
    expect(orbitAnswer('period', 1, 7)).toBe('8'); // a = 4 AU, P = 4^(3/2)
    expect(orbitAnswer('period', 6, 12)).toBe('27'); // a = 9 AU
    expect(orbitAnswer('speed', 3, 7)).toBe('7/3');
    expect(() => orbitAnswer('period', 1, 4)).toThrow();
  });
});
