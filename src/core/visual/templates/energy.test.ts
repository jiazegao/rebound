import { describe, expect, it } from 'vitest';
import { parseNumber } from '../../judge/numbers';
import { makeRng } from '../rng';
import { checkTemplate } from '../testkit';
import { carnotEfficiency, ENERGY_TEMPLATES, ivShape, solarPanels, stepEnergy } from './energy';

describe('energy visual templates', () => {
  it('has templates', () => expect(ENERGY_TEMPLATES.length).toBeGreaterThan(0));
  for (const t of ENERGY_TEMPLATES) it(t.id, () => checkTemplate(t));
});

const draft = (id: string, seed: number) => {
  const t = ENERGY_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`no template ${id}`);
  return t.make(makeRng(seed));
};
const valueOf = (answer: string): number => {
  const p = parseNumber(answer);
  if (!p || p.unsimplified) throw new Error(`not a number in simplest form: ${answer}`);
  return p.value;
};
const SEEDS = Array.from({ length: 80 }, (_, i) => i + 1);

describe('energy helpers, worked by hand', () => {
  it('Carnot efficiency is 1 − Tc/Th', () => {
    expect(carnotEfficiency(600, 300)).toEqual([1, 2]);
    expect(carnotEfficiency(1000, 280)).toEqual([18, 25]); // 72%
    expect(carnotEfficiency(700, 300)).toEqual([4, 7]);
  });
  it('energy under a power step graph', () => {
    expect(stepEnergy([[2, 2], [1, 3], [0.5, 2], [2.5, 1]])).toBe(10.5);
    expect(stepEnergy([[4, 2], [3.5, 3], [2, 1]])).toBe(20.5);
  });
  it('the I–V curve shape puts the maximum power point where it is marked', () => {
    for (const [u, i] of [[0.8, 0.9], [0.84, 0.94], [0.82, 0.93]] as const) {
      const shape = ivShape(u, i)!;
      expect(shape).not.toBeNull();
      const I = (x: number) => Math.pow(1 - Math.pow(x, shape.m), shape.p);
      expect(I(u)).toBeCloseTo(i, 9);
      let best = 0;
      for (let k = 1; k < 100000; k++) if ((k / 1e5) * I(k / 1e5) > (best / 1e5) * I(best / 1e5)) best = k;
      expect(best / 1e5).toBeCloseTo(u, 4);
    }
    // A knee too sharp for its voltage needs p > 1, a curve that flattens out as it reaches the open-circuit
    // voltage (real curves meet it steeply): refused.
    expect(ivShape(0.78, 0.92)).toBeNull();
    expect(ivShape(0.76, 0.96)).toBeNull();
  });
  it('every candidate panel has a concave, falling curve with its maximum power at the marked point', () => {
    const panels = solarPanels();
    expect(panels.length).toBeGreaterThan(1000);
    for (const pn of panels.filter((_, k) => k % 37 === 0)) {
      expect(pn.m).toBeGreaterThanOrEqual(1);
      expect(pn.p).toBeLessThanOrEqual(1);
      const I = (v: number) => pn.isc * Math.pow(1 - Math.pow(v / pn.voc, pn.m), pn.p);
      expect(I(pn.vmp)).toBeCloseTo(pn.imp, 9);
      let bestV = 0;
      let bestP = 0;
      for (let k = 0; k <= 20000; k++) {
        const v = (pn.voc * k) / 20000;
        if (v * I(v) > bestP) [bestV, bestP] = [v, v * I(v)];
      }
      expect(Math.abs(bestV - pn.vmp)).toBeLessThan(pn.voc * 1e-3);
      expect(Math.abs(bestP - pn.vmp * pn.imp) / (pn.vmp * pn.imp)).toBeLessThan(1e-6);
    }
  });
});

describe('energy answers for seeds checked by hand', () => {
  const cases: Array<[string, number, string]> = [
    ['energy-sankey-efficiency', 7919, '1300'], // 2000 MW in, 700 MW electrical out
    ['energy-sankey-efficiency', 15838, '17'], // 340 J of 2000 J
    ['energy-sankey-efficiency', 23757, '35'], // 500 − 95 − 370
    ['energy-sankey-efficiency', 55433, '1360'], // 2000 − 580 − 60
    ['energy-carnot-engine', 7919, '1700'], // 5100 J · 300/900
    ['energy-carnot-engine', 15838, '3000'], // 2300 J ÷ (920/1200)
    ['energy-carnot-engine', 31676, '60'], // 1 − 360/900
    ['energy-solar-iv-curve', 7919, '78'], // fill factor (34 · 7.8)/(40 · 8.5)
    ['energy-solar-iv-curve', 15838, '20'], // 40 V · 9.5 A over 1.9 m² at 1000 W/m²
    ['energy-solar-iv-curve', 31676, '328'], // 40 V · 8.2 A
    ['energy-household-load', 7919, '10.5'], // 2·2 + 1·3 + 0.5·2 + 2.5·1
    ['energy-household-load', 15838, '17'],
    ['energy-generation-mix', 7919, '50'], // fossil 100 of 200 TWh
    ['energy-generation-mix', 23757, '31'], // renewable 155 of 500 TWh
  ];
  for (const [id, seed, answer] of cases) it(`${id} seed ${seed}`, () => expect(draft(id, seed).answer).toBe(answer));
});

describe('energy answers agree with the figure data over many seeds', () => {
  it('Sankey diagram: conservation of energy, then efficiency or the unknown loss', () => {
    for (const seed of SEEDS) {
      const d = draft('energy-sankey-efficiency', seed);
      const flow = (s: string) => (s === 'unknown' ? null : Number(s.split(' ')[0]));
      let input = flow(/energy \((\d+ (?:J|MW)|unknown)\)/.exec(d.alt)![1]!);
      let useful = flow(/useful output, [a-z]+ \((\d+ (?:J|MW)|unknown)\)/.exec(d.alt)![1]!);
      const losses = d.alt
        .slice(d.alt.indexOf('downward: ') + 10, -1)
        .split(' and ')
        .map((s) => flow(s.replace(/^[a-z ]+? (?=\d|unknown)/, '')));
      const unknownLoss = losses.indexOf(null);
      expect([input, useful, ...losses].filter((x) => x === null).length, `seed ${seed}: one unknown at most`).toBeLessThanOrEqual(1);
      const known = (xs: Array<number | null>) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
      if (input === null) input = useful! + known(losses);
      if (useful === null) useful = input - known(losses);
      if (unknownLoss >= 0) {
        expect(d.stem).toMatch(/how much (energy|power)/);
        expect(valueOf(d.answer)).toBe(input - useful - known(losses));
      } else {
        expect(input).toBe(useful + known(losses));
        expect(valueOf(d.answer), `seed ${seed}`).toBeCloseTo((100 * useful) / input, 9);
      }
    }
  });

  it('heat engine at the Carnot limit', () => {
    for (const seed of SEEDS) {
      const d = draft('energy-carnot-engine', seed);
      const hot = Number(/hot reservoir at (\d+) kelvins/.exec(d.alt)![1]);
      const cold = Number(/cold reservoir at (\d+) kelvins/.exec(d.alt)![1]);
      const eff = 1 - cold / hot;
      const qh = /Q sub H \((\d+) joules/.exec(d.alt)?.[1];
      const w = /W \((\d+) joules/.exec(d.alt)?.[1];
      let expected: number;
      if (d.stem.includes('efficiency')) expected = 100 * eff;
      else if (d.stem.includes('maximum work')) expected = Number(qh) * eff;
      else if (d.stem.includes('release')) expected = Number(qh) * (cold / hot);
      else expected = Number(w) / eff;
      expect(valueOf(d.answer), `seed ${seed}: ${d.stem}`).toBeCloseTo(expected, 9);
      expect(Number.isInteger(valueOf(d.answer))).toBe(true);
    }
  });

  it('solar panel power, fill factor and efficiency', () => {
    for (const seed of SEEDS) {
      const d = draft('energy-solar-iv-curve', seed);
      const isc = Number(/short-circuit current, ([\d.]+) A/.exec(d.alt)![1]);
      const voc = Number(/open-circuit voltage, ([\d.]+) V/.exec(d.alt)![1]);
      const [, vmp, imp] = /marked at ([\d.]+) V and ([\d.]+) A/.exec(d.alt)!.map(Number);
      const power = vmp! * imp!;
      let expected: number;
      if (d.stem.includes('fill factor')) expected = (100 * power) / (voc * isc);
      else if (d.stem.includes('efficiency')) expected = (100 * power) / (1000 * Number(/area of ([\d.]+) square meters/.exec(d.stem)![1]));
      else expected = power;
      expect(valueOf(d.answer), `seed ${seed}: ${d.stem}`).toBeCloseTo(expected, 9);
      // realistic values
      expect(vmp! / voc).toBeGreaterThan(0.77);
      expect(imp! / isc).toBeGreaterThan(0.89);
    }
  });

  it('household energy, cost and average power', () => {
    for (const seed of SEEDS) {
      const d = draft('energy-household-load', seed);
      const steps = [...d.alt.matchAll(/([\d.]+) kW for (\d+) hours?/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
      const hours = Number(/from 0 to (\d+) hours/.exec(d.alt)![1]);
      expect(steps.reduce((a, [, h]) => a + h, 0)).toBe(hours);
      const energy = stepEnergy(steps);
      const price = /costs (\d+) cents/.exec(d.stem)?.[1];
      const expected = price ? energy * Number(price) : d.stem.includes('average') ? energy / hours : energy;
      expect(valueOf(d.answer), `seed ${seed}: ${d.stem}`).toBeCloseTo(expected, 9);
    }
  });

  it('generation mix shares', () => {
    const kind: Record<string, 'fossil' | 'nuclear' | 'renewable'> = {
      coal: 'fossil',
      'natural gas': 'fossil',
      petroleum: 'fossil',
      nuclear: 'nuclear',
      hydropower: 'renewable',
      wind: 'renewable',
      solar: 'renewable',
      geothermal: 'renewable',
    };
    const phrase: Record<string, string> = { 'nuclear power': 'nuclear', 'solar power': 'solar', 'geothermal power': 'geothermal' };
    for (const seed of SEEDS) {
      const d = draft('energy-generation-mix', seed);
      const rows = [...d.alt.slice(d.alt.indexOf(':') + 1).matchAll(/([a-z ]+?) (\d+)/g)].map((m) => [m[1]!.trim(), Number(m[2])] as const);
      expect(rows.every(([name]) => name in kind), d.alt).toBe(true);
      const total = rows.reduce((a, [, v]) => a + v, 0);
      const share = (f: (name: string) => boolean) => (100 * rows.filter(([n]) => f(n)).reduce((a, [, v]) => a + v, 0)) / total;
      let expected: number;
      if (d.stem.includes('fossil fuels')) expected = share((n) => kind[n] === 'fossil');
      else if (d.stem.includes('renewable')) expected = share((n) => kind[n] === 'renewable');
      else {
        const asked = /generated from (.+)\?$/.exec(d.stem)![1]!;
        expected = share((n) => n === (phrase[asked] ?? asked));
      }
      expect(valueOf(d.answer), `seed ${seed}: ${d.stem}`).toBeCloseTo(expected, 9);
    }
  });
});
