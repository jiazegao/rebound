import { describe, expect, it } from 'vitest';
import { makeRng } from '../rng';
import { checkTemplate } from '../testkit';
import {
  circuitAnswer,
  circuitDraft,
  exactAnswer,
  forceDraft,
  lensAnswer,
  lensDraft,
  networkDraft,
  networkResistance,
  PHYSICS_TEMPLATES,
  vectorAnswer,
  velocityAnswer,
  velocityDraft,
  waveAnswer,
} from './physics';

describe('physics visual templates', () => {
  it('has templates', () => expect(PHYSICS_TEMPLATES.length).toBeGreaterThan(0));
  for (const t of PHYSICS_TEMPLATES) it(t.id, () => checkTemplate(t));
});

const template = (id: string) => PHYSICS_TEMPLATES.find((t) => t.id === id)!;

describe('exact answers', () => {
  it('prints fractions and accepts their exact decimals', () => {
    expect(exactAnswer([6, 1])).toEqual({ answer: '6' });
    expect(exactAnswer([15, 4])).toEqual({ answer: '15/4', accept: ['3.75'] });
    expect(exactAnswer([2, 3])).toEqual({ answer: '2/3' });
    expect(exactAnswer([31, 5])).toEqual({ answer: '31/5', accept: ['6.2'] });
  });
});

describe('resistor networks', () => {
  it('combines series and parallel resistors', () => {
    // 4 + (6 ∥ 3) = 4 + 2 = 6
    expect(networkResistance([{ kind: 'series', r: 4 }, { kind: 'parallel', branches: [[6], [3]] }])).toEqual([6, 1]);
    // (10 + 5) ∥ 5 = 75/20 = 15/4
    expect(networkResistance([{ kind: 'parallel', branches: [[10, 5], [5]] }])).toEqual([15, 4]);
    // (6 ∥ 3) + (4 ∥ 12) = 2 + 3
    expect(networkResistance([{ kind: 'parallel', branches: [[6], [3]] }, { kind: 'parallel', branches: [[4], [12]] }])).toEqual([5, 1]);
    // 2 + (3 ∥ 6 ∥ 2) = 2 + 1
    expect(networkResistance([{ kind: 'series', r: 2 }, { kind: 'parallel', branches: [[3], [6], [2]] }])).toEqual([3, 1]);
    // (4 + 8) ∥ (6 + 6) = 6
    expect(networkResistance([{ kind: 'parallel', branches: [[4, 8], [6, 6]] }])).toEqual([6, 1]);
  });
  it('prints the answer in simplest form, with the decimal accepted', () => {
    const d = networkDraft([{ kind: 'series', r: 5 }, { kind: 'parallel', branches: [[2], [3]] }]);
    expect(d.answer).toBe('31/5');
    expect(d.accept).toEqual(['6.2']);
    expect(d.svg).toContain('5 Ω');
  });
  it('keeps denominators small', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const d = template('physics-resistor-network').make(makeRng(seed));
      const den = d.answer.includes('/') ? Number(d.answer.split('/')[1]) : 1;
      expect(den).toBeLessThanOrEqual(12);
    }
  });
});

describe('battery circuit', () => {
  // 12 V, R1 = 4 Ω, R2 = 6 Ω ∥ R3 = 3 Ω: 6 Ω in all, 2 A from the battery, 4 V across the pair.
  const base = { emf: 12, r1: 4, r2: 6, r3: 3 } as const;
  it('finds currents and voltages', () => {
    expect(circuitAnswer({ ...base, target: 1, ask: 'current' })).toEqual([2, 1]);
    expect(circuitAnswer({ ...base, target: 1, ask: 'voltage' })).toEqual([8, 1]);
    expect(circuitAnswer({ ...base, target: 2, ask: 'current' })).toEqual([2, 3]);
    expect(circuitAnswer({ ...base, target: 2, ask: 'voltage' })).toEqual([4, 1]);
    expect(circuitAnswer({ ...base, target: 3, ask: 'current' })).toEqual([4, 3]);
    expect(circuitAnswer({ ...base, target: 3, ask: 'voltage' })).toEqual([4, 1]);
  });
  it('asks about the highlighted resistor', () => {
    const d = circuitDraft({ ...base, target: 2, ask: 'current' });
    expect(d.answer).toBe('2/3');
    expect(d.stem).toMatch(/amperes/);
    expect(d.svg).toContain('12 V');
  });
  it('labels a battery of at most 60 V', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const volts = /(\d+) V</.exec(template('physics-battery-circuit').make(makeRng(seed)).svg);
      expect(Number(volts?.[1])).toBeLessThanOrEqual(60);
    }
  });
});

describe('velocity graph', () => {
  const ts = [0, 2, 6, 10];
  const vs = [0, 8, 8, 0];
  it('finds displacement as the area under the graph', () => {
    // 8 + 32 + 16
    expect(velocityAnswer({ ts, vs, mode: 'displacement', from: 0, to: 3 })).toEqual([56, 1]);
    expect(velocityAnswer({ ts, vs, mode: 'displacement', from: 1, to: 3 })).toEqual([48, 1]);
    // (2+5)·3/2 + 5·2 + (5+1)·3/2 = 10.5 + 10 + 9
    expect(velocityAnswer({ ts: [0, 3, 5, 8], vs: [2, 5, 5, 1], mode: 'displacement', from: 0, to: 3 })).toEqual([59, 2]);
  });
  it('finds the acceleration as the slope and the average velocity', () => {
    expect(velocityAnswer({ ts, vs, mode: 'acceleration', from: 0, to: 1 })).toEqual([4, 1]);
    expect(velocityAnswer({ ts, vs, mode: 'acceleration', from: 2, to: 3 })).toEqual([2, 1]);
    expect(velocityAnswer({ ts: [0, 3, 5, 8], vs: [2, 5, 5, 1], mode: 'acceleration', from: 2, to: 3 })).toEqual([4, 3]);
    expect(velocityAnswer({ ts, vs, mode: 'average', from: 0, to: 3 })).toEqual([28, 5]);
  });
  it('keeps average velocities to at most quarters', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const d = template('physics-velocity-graph').make(makeRng(seed));
      if (d.stem.includes('average')) expect(Number(d.answer.split('/')[1] ?? 1)).toBeLessThanOrEqual(4);
    }
  });
  it('states the interval in the stem', () => {
    const d = velocityDraft({ ts, vs, mode: 'average', from: 0, to: 3 });
    expect(d.stem).toContain('from t = 0 to t = 10 s');
    expect(d.answer).toBe('28/5');
    expect(d.accept).toEqual(['5.6']);
  });
});

describe('net force', () => {
  it('adds perpendicular forces', () => {
    // (11 − 3, 6 − 0) = (8, 6): 10 N; on 4 kg, 5/2 m/s²
    const p = { right: 11, left: 3, up: 6, down: 0, mass: 4 };
    expect(forceDraft({ ...p, ask: 'force' }).answer).toBe('10');
    const a = forceDraft({ ...p, ask: 'acceleration' });
    expect(a.answer).toBe('5/2');
    expect(a.accept).toEqual(['2.5']);
  });
  it('gives a simplified radical when the components are not a Pythagorean triple', () => {
    expect(forceDraft({ right: 3, left: 0, up: 1, down: 0, mass: 2, ask: 'acceleration' }).answer).toBe('√10/2');
    expect(forceDraft({ right: 2, left: 0, up: 0, down: 2, mass: 1, ask: 'force' }).answer).toBe('2√2');
  });
  it('always has a whole-number net force', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const d = template('physics-net-force').make(makeRng(seed));
      expect(d.answer).not.toContain('√');
    }
  });
});

describe('thin lens', () => {
  it('uses the thin-lens equation', () => {
    expect(lensAnswer({ f: 10, d: 15, h: 2, ask: 'distance' })).toEqual([30, 1]);
    expect(lensAnswer({ f: 10, d: 15, h: 2, ask: 'height' })).toEqual([4, 1]);
    expect(lensAnswer({ f: 12, d: 21, h: 3, ask: 'distance' })).toEqual([28, 1]);
    expect(lensAnswer({ f: 15, d: 45, h: 1, ask: 'distance' })).toEqual([45, 2]);
    expect(lensDraft({ f: 20, d: 60, h: 3, ask: 'height' }).answer).toBe('3/2');
  });
  it('makes whole-number image distances with the object outside the focal length', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const d = template('physics-thin-lens').make(makeRng(seed));
      if (d.stem.includes('how far')) expect(d.answer).toMatch(/^\d+$/);
    }
  });
});

describe('vectors on a grid', () => {
  it('finds the magnitude of a sum or a difference', () => {
    expect(vectorAnswer({ a: [3, 1], b: [-1, 4], kind: 'force' })).toBe('√29');
    expect(vectorAnswer({ a: [3, 1], b: [-1, 4], kind: 'velocity' })).toBe('5');
    expect(vectorAnswer({ a: [2, 2], b: [2, -2], kind: 'force' })).toBe('4');
    expect(vectorAnswer({ a: [4, 2], b: [0, -2], kind: 'velocity' })).toBe('4√2');
  });
});

describe('wave graph', () => {
  it('reads the wavelength and amplitude and finds the speed', () => {
    const p = { wavelength: 4, amplitude: 3, frequency: 5, crest: 1, span: 12 } as const;
    expect(waveAnswer({ ...p, ask: 'wavelength' })).toBe(4);
    expect(waveAnswer({ ...p, ask: 'amplitude' })).toBe(3);
    expect(waveAnswer({ ...p, ask: 'speed' })).toBe(20);
  });
});
