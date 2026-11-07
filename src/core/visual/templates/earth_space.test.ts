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

/** Drafts for many seeds of one template. */
const drafts = (id: string, n = 300) => {
  const t = byId(id);
  return Array.from({ length: n }, (_, i) => t.make(makeRng(i + 1)));
};
const letters = (list: string) => list.split(/, | and /).map((x) => x.trim());

describe('answers agree with the figures', () => {
  it('moon phase', () => {
    const where = ['to the right of', 'to the upper right of', 'above', 'to the upper left of', 'to the left of', 'to the lower left of', 'below', 'to the lower right of'];
    const names = ['NEW MOON', 'WAXING CRESCENT', 'FIRST QUARTER', 'WAXING GIBBOUS', 'FULL MOON', 'WANING GIBBOUS', 'THIRD QUARTER', 'WANING CRESCENT'];
    const seen = ['a new Moon', 'a waxing crescent Moon', 'a first quarter Moon', 'a waxing gibbous Moon', 'a full Moon', 'a waning gibbous Moon', 'a third quarter Moon', 'a waning crescent Moon'];
    let lettered = 0;
    for (const d of drafts('earth_space-moon-phase')) {
      const sunDeg = /Sunlight comes from the right/.test(d.alt) ? 0 : 180;
      const shown = /The Moon is shown (.*) Earth\./.exec(d.alt);
      if (shown) {
        expect(d.answer).toBe(names[moonPhaseIndex(where.indexOf(shown[1]!) * 45, sunDeg)]);
        continue;
      }
      lettered++;
      const order = letters(/they are labeled (.*)\./.exec(d.alt)![1]!);
      const phase = seen.findIndex((s) => d.stem.includes(`see ${s}?`));
      const k = order.findIndex((_, i) => moonPhaseIndex(i * 45, sunDeg) === phase);
      expect(d.answer).toBe(order[k]);
    }
    expect(lettered).toBeGreaterThan(0);
  });

  it('H–R diagram: named star types sit in their regions', () => {
    for (const d of drafts('earth_space-hr-diagram')) {
      const stars = new Map([...d.alt.matchAll(/([A-F]) at about ([\d,]+) K with luminosity about (\d[\d,]*(?:\.\d+)?)/g)].map((m) => [m[1]!, { T: Number(m[2]!.replace(/,/g, '')), L: Number(m[3]!.replace(/,/g, '')) }]));
      expect(stars.size).toBe(6);
      const s = stars.get(d.answer)!;
      if (/white dwarf/.test(d.stem)) expect(s.L < 0.01 && s.T > 7000).toBe(true);
      if (/red giant/.test(d.stem)) expect(s.L >= 30 && s.L <= 1000 && s.T < 5000).toBe(true);
      if (/supergiant/.test(d.stem)) expect(s.L >= 100_000).toBe(true);
      if (/red dwarf/.test(d.stem)) expect(s.L < 0.1 && s.T < 4000).toBe(true);
      if (/highest surface temperature/.test(d.stem)) expect([...stars.values()].every((x) => x.T <= s.T)).toBe(true);
      if (/greatest luminosity/.test(d.stem)) expect([...stars.values()].every((x) => x.L <= s.L)).toBe(true);
    }
  });

  it('seasons', () => {
    const spots = ['at the right end', 'at the far side', 'at the left end', 'at the near side'];
    for (const d of drafts('earth_space-seasons')) {
      const tilt = /leaning toward the left side/.test(d.alt) ? -1 : 1;
      const pos = spots.findIndex((s) => d.alt.includes(`highlighted Earth is ${s}`));
      const event = seasonEvent(pos, tilt);
      const expected = d.stem.includes('Southern Hemisphere') ? ['Winter', 'Spring', 'Summer', 'Autumn'][event] : ['June solstice', 'September equinox', 'December solstice', 'March equinox'][event];
      expect(d.answer).toBe(expected);
    }
  });

  it('elliptical orbit', () => {
    for (const d of drafts('earth_space-elliptical-orbit')) {
      const m = /labeled (\d+) AU and .* labeled (\d+) AU/.exec(d.alt)!;
      const [rp, ra] = [Number(m[1]), Number(m[2])];
      const ask = /eccentricity/.test(d.stem) ? 'eccentricity' : /semi-major/.test(d.stem) ? 'axis' : /period/.test(d.stem) ? 'period' : 'speed';
      expect(d.answer).toBe(orbitAnswer(ask, rp, ra));
    }
  });

  it('topographic map', () => {
    const ordinal = (s: string) => (s === 'outermost contour' ? 0 : ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'].indexOf(s.split(' ')[0]!));
    for (const d of drafts('earth_space-topographic-map')) {
      const lab = /The (.*?) is labeled ([\d,]+) and the (.*?) is labeled ([\d,]+)\./.exec(d.alt)!;
      const [k1, e1, k2, e2] = [ordinal(lab[1]!), Number(lab[2]!.replace(/,/g, '')), ordinal(lab[3]!), Number(lab[4]!.replace(/,/g, ''))];
      const interval = (e2 - e1) / (k2 - k1);
      const answer = Number(d.answer.replace(/,/g, ''));
      if (/contour interval of the map/.test(d.stem)) {
        expect(answer).toBe(interval);
        continue;
      }
      expect(d.alt).toContain(`The contour interval is ${interval} `);
      const pts = /Point A lies on the (.*?) and point B on the (.*?)\./.exec(d.alt)!;
      const [kA, kB] = [ordinal(pts[1]!), ordinal(pts[2]!)];
      const elev = (k: number) => e1 + (k - k1) * interval;
      if (/difference in elevation/.test(d.stem)) expect(answer).toBe(Math.abs(elev(kA) - elev(kB)));
      else expect(answer).toBe(elev(/point A\?/.test(d.stem) ? kA : kB));
    }
  });

  it('relative dating follows superposition and cross-cutting relationships', () => {
    let pairs = 0;
    for (const d of drafts('earth_space-relative-dating', 400)) {
      const lower = letters(/Sedimentary layers (.*?), from bottom to top/.exec(d.alt)![1]!);
      const upperMatch = /(?:layers|layer) ([A-Z](?:(?:, | and )[A-Z])*) lies? on top of it/.exec(d.alt);
      const upper = upperMatch ? letters(upperMatch[1]!) : [];
      const layers = [...lower, ...upper];
      const dike = /An igneous intrusion, ([A-Z]), cuts through layers (.*?)\./.exec(d.alt);
      const fault = /Fault ([A-Z]) offsets layers (.*?)(?: and intrusion ([A-Z]))?\./.exec(d.alt);
      // Age of each feature as a rank: a cross-cutting feature is younger than every layer it cuts and older than the rest.
      const rank = new Map<string, number>();
      layers.forEach((l, i) => rank.set(l, i));
      const after = (cut: string[]) => Math.max(...cut.map((l) => rank.get(l)!)) + 0.5;
      if (dike) rank.set(dike[1]!, after(letters(dike[2]!)));
      if (fault) rank.set(fault[1]!, after(letters(fault[2]!)));
      if (dike && fault && rank.get(dike[1]!) === rank.get(fault[1]!)) {
        // Both formed between the same layers: the one that cuts the other is younger.
        const faultYounger = fault[3] === dike[1];
        expect(faultYounger || d.alt.includes(`Intrusion ${dike[1]} crosses fault ${fault[1]} without being offset`)).toBe(true);
        rank.set(faultYounger ? fault[1]! : dike[1]!, rank.get(dike[1]!)! + 0.25);
      }
      const byAge = [...rank.entries()].sort((a, b) => a[1] - b[1]).map(([l]) => l);
      if (/oldest/.test(d.stem)) expect(d.answer).toBe(byAge[0]);
      else if (/youngest/.test(d.stem)) expect(d.answer).toBe(byAge[byAge.length - 1]);
      else {
        pairs++;
        expect(rank.get(d.answer)).toBeGreaterThan(rank.get(d.answer === dike![1] ? fault![1]! : dike![1]!)!);
      }
    }
    expect(pairs).toBeGreaterThan(0);
  });
});
