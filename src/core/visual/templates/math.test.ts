import { describe, expect, it } from 'vitest';
import { parseNumber } from '../../judge/numbers';
import { makeRng } from '../rng';
import { checkTemplate } from '../testkit';
import { equationText, MATH_TEMPLATES, medianFraction, polygonChordAngle, shoelace2, sqrtRatioText, transformed, VENN_CENTERS, VENN_R, vennSpot } from './math';
import { decimalAnswer, exactDecimal, fractionAnswer, pointText } from './math-helpers';

describe('math visual templates', () => {
  it('has templates', () => expect(MATH_TEMPLATES.length).toBeGreaterThan(0));
  for (const t of MATH_TEMPLATES) it(t.id, () => checkTemplate(t));
});

const draft = (id: string, seed: number) => {
  const t = MATH_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`no template ${id}`);
  return t.make(makeRng(seed));
};
/** The printed answer as a number, read the way the answer checker reads it. */
const valueOf = (answer: string): number => {
  const p = parseNumber(answer);
  if (!p || p.unsimplified) throw new Error(`not a number in simplest form: ${answer}`);
  return p.value;
};
/** Numbers in a text, reading true minus signs as negatives. */
const numbers = (s: string): number[] => [...s.replace(/−/g, '-').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
const SEEDS = Array.from({ length: 80 }, (_, i) => i + 1);

describe('math helpers, worked by hand', () => {
  it('shoelace formula gives twice the signed area', () => {
    expect(shoelace2([[-6, -2], [4, -2], [-1, 1]])).toBe(30); // base 10, height 3
    expect(shoelace2([[-2, -4], [4, -4], [1, 2], [-2, 1]])).toBe(51);
    expect(shoelace2([[0, 0], [0, 4], [3, 0]])).toBe(-12); // clockwise
  });
  it('square roots of ratios are rationalized and simplified', () => {
    expect(sqrtRatioText(4, 13)).toBe('2√13/13'); // 2/√13
    expect(sqrtRatioText(9, 25)).toBe('3/5');
    expect(sqrtRatioText(12, 16)).toBe('√3/2');
    expect(sqrtRatioText(4, 12)).toBe('√3/3'); // 2/√12 = 1/√3
    expect(sqrtRatioText(41, 25)).toBe('√41/5');
  });
  it('chord angles in a regular polygon', () => {
    expect(polygonChordAngle(8, 1, 7)).toEqual([135, 1]); // interior angle of an octagon
    expect(polygonChordAngle(7, 1, 2)).toEqual([180, 7]);
    expect(polygonChordAngle(9, 2, 6)).toEqual([80, 1]);
    expect(polygonChordAngle(6, 2, 4)).toEqual([60, 1]); // equilateral triangle in a hexagon
    expect(polygonChordAngle(8, 1, 4)).toEqual([135, 2]);
  });
  it('median of whole numbers', () => {
    expect(medianFraction([3, 1, 2])).toEqual([2, 1]);
    expect(medianFraction([1, 2, 3, 4])).toEqual([5, 2]);
    expect(medianFraction([4, 4, 1, 9])).toEqual([4, 1]);
  });
  it('fractions print reduced, with terminating decimals accepted', () => {
    expect(fractionAnswer(51, 2)).toEqual({ answer: '51/2', accept: ['25.5'] });
    expect(fractionAnswer(-27, 8)).toEqual({ answer: '-27/8', accept: ['-3.375'] });
    expect(fractionAnswer(58, 19)).toEqual({ answer: '58/19' });
    expect(fractionAnswer(6, 3)).toEqual({ answer: '2' });
    expect(decimalAnswer(21, 2)).toEqual({ answer: '10.5', accept: ['21/2'] });
    expect(exactDecimal(1, 8)).toBe('0.125');
    expect(exactDecimal(1, 3)).toBeNull();
    expect(pointText(-3, 0)).toBe('(−3, 0)');
  });
  it('equations of transformed graphs', () => {
    expect(equationText('abs', { a: [-1, 2], h: -2, k: -3 })).toBe('y = −(1/2)|x + 2| − 3');
    expect(equationText('quad', { a: [2, 1], h: 3, k: -1 })).toBe('y = 2(x − 3)² − 1');
    expect(equationText('sqrt', { a: [1, 1], h: -1, k: 1 })).toBe('y = √(x + 1) + 1');
    expect(equationText('sqrt', { a: [-2, 1], h: 3, k: 2 })).toBe('y = −2√(x − 3) + 2');
    expect(transformed('abs', { a: [1, 2], h: 4, k: 2 })(2)).toBe(3);
    expect(transformed('quad', { a: [2, 1], h: 3, k: -1 })(2)).toBe(1);
    expect(transformed('sqrt', { a: [-2, 1], h: -3, k: 2 })(-2)).toBe(0);
    expect(transformed('sqrt', { a: [1, 1], h: 0, k: 0 })(-1)).toBeNaN();
  });
  it('Venn region labels sit inside exactly the right circles, clear of the outlines', () => {
    for (let mask = 0; mask < 8; mask++) {
      const [x, y] = vennSpot(mask);
      VENN_CENTERS.forEach(([cx, cy], i) => {
        const d = Math.hypot(x - cx, y - cy);
        expect(d < VENN_R, `mask ${mask}, circle ${i}`).toBe(Boolean(mask & (1 << i)));
        expect(Math.abs(d - VENN_R)).toBeGreaterThan(20);
      });
    }
  });
});

describe('math answers for seeds checked by hand', () => {
  // Each figure was rendered and the answer worked out from it by hand.
  const cases: Array<[string, number, string]> = [
    ['math-lattice-polygon-area', 7919, '15'], // A(−6, −2), B(4, −2), C(−1, 1): base 10, height 3
    ['math-lattice-polygon-area', 31676, '51/2'], // A(−2, −4), B(4, −4), C(1, 2), D(−2, 1)
    ['math-right-triangle-trig', 7919, '2√41'], // legs 8 and 10
    ['math-right-triangle-trig', 23757, '√3/3'], // tan θ, opposite 2, hypotenuse 4
    ['math-right-triangle-trig', 31676, '3/4'], // cot θ, adjacent 9, opposite 12
    ['math-shaded-region-pi', 15838, '36√3 − 12π'], // equilateral triangle, side 12
    ['math-shaded-region-pi', 39595, '25π/2 − 25'], // square of side 5 in a circle
    ['math-shaded-region-pi', 47514, '81π − 162'], // circle of radius 9 around a square
    ['math-regular-polygon-angle', 7919, '40'], // exterior angle of a 9-gon
    ['math-regular-polygon-angle', 15838, '54'], // diagonals of a 12-gon
    ['math-regular-polygon-angle', 47514, '180/7'], // side and the next diagonal of a heptagon
    ['math-regular-polygon-angle', 63352, '100'], // 5 of 9 arcs
    ['math-venn-diagram', 7919, '18'], // coding but not math: 6 + 12
    ['math-venn-diagram', 15838, '1/4'], // none: 14 of 56
    ['math-venn-diagram', 55433, '57'], // A ∪ B ∪ C
    ['math-dot-plot-stats', 7919, '58/19'],
    ['math-dot-plot-stats', 31676, '2'],
    ['math-parabola-graph', 7919, '-56'], // roots 1 and 5, y-intercept −2: f(−9) = −2/5 · 140
    ['math-parabola-graph', 15838, '2'], // roots 1 and 3, y-intercept −6: maximum f(2)
    ['math-parabola-graph', 39595, '-9/2'], // roots −3 and 6, y-intercept −4
    ['math-graph-equation', 7919, 'y = 2√(x + 2) + 3'], // starts at (−2, 3), through (−1, 5)
    ['math-graph-equation', 31676, 'y = (1/2)|x − 4| + 2'], // vertex (4, 2), through (2, 3)
    ['math-graph-equation', 55433, 'y = 2(x − 3)² − 1'], // vertex (3, −1), through (2, 1)
  ];
  for (const [id, seed, answer] of cases) it(`${id} seed ${seed}`, () => expect(draft(id, seed).answer).toBe(answer));
});

describe('math answers agree with the figure data over many seeds', () => {
  it('lattice polygon area (split into triangles)', () => {
    for (const seed of SEEDS) {
      const d = draft('math-lattice-polygon-area', seed);
      const pts = [...d.alt.replace(/−/g, '-').matchAll(/[A-D]\((-?\d+), (-?\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
      const tri = (a: readonly number[], b: readonly number[], c: readonly number[]) => Math.abs((b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!)) / 2;
      const area = tri(pts[0]!, pts[1]!, pts[2]!) + (pts.length === 4 ? tri(pts[0]!, pts[2]!, pts[3]!) : 0);
      expect(valueOf(d.answer), `seed ${seed}`).toBeCloseTo(area, 9);
    }
  });

  it('right triangle side or trigonometric ratio', () => {
    for (const seed of SEEDS) {
      const d = draft('math-right-triangle-trig', seed);
      const side = (name: string) => {
        const m = new RegExp(`${name} is labeled (\\d+|x)`).exec(d.alt);
        return m && m[1] !== 'x' ? Number(m[1]) : null;
      };
      let adj = side('the leg adjacent to θ');
      let opp = side('the leg opposite θ');
      let hyp = side('the hypotenuse');
      if (hyp === null) hyp = Math.hypot(adj!, opp!);
      else if (adj === null) adj = Math.sqrt(hyp * hyp - opp! * opp!);
      else opp = Math.sqrt(hyp * hyp - adj * adj);
      const fn = /value of (sin|cos|tan|csc|sec|cot) θ/.exec(d.stem)?.[1];
      const ratios: Record<string, number> = { sin: opp! / hyp, cos: adj! / hyp, tan: opp! / adj!, csc: hyp / opp!, sec: hyp / adj!, cot: adj! / opp! };
      const unknown = /the (leg adjacent to θ|leg opposite θ|hypotenuse) is labeled x/.exec(d.alt)?.[1];
      const expected = fn ? ratios[fn]! : unknown === 'hypotenuse' ? hyp : unknown === 'leg opposite θ' ? opp! : adj!;
      expect(valueOf(d.answer), `seed ${seed}: ${d.stem}`).toBeCloseTo(expected, 9);
    }
  });

  it('shaded regions', () => {
    for (const seed of SEEDS) {
      const d = draft('math-shaded-region-pi', seed);
      const v = numbers(d.alt.slice(d.alt.lastIndexOf('labeled')))[0]!;
      const radius = d.alt.includes('radius of the circle');
      let area: number;
      if (d.alt.startsWith('A circle inscribed in a square')) area = radius ? 4 * v * v - Math.PI * v * v : v * v - (Math.PI * v * v) / 4;
      else if (d.alt.startsWith('A square inscribed in a circle')) area = radius ? Math.PI * v * v - 2 * v * v : (Math.PI * v * v) / 2 - v * v;
      else if (d.alt.includes('at each corner')) area = v * v - Math.PI * (v / 2) ** 2;
      else if (d.alt.includes('quarter circle centered at one corner')) area = v * v - (Math.PI * v * v) / 4;
      else area = (Math.sqrt(3) / 4) * v * v - Math.PI * (v / (2 * Math.sqrt(3))) ** 2; // inradius s/(2√3)
      expect(valueOf(d.answer), `seed ${seed}: ${d.alt}`).toBeCloseTo(area, 9);
    }
  });

  it('regular polygon angles', () => {
    for (const seed of SEEDS) {
      const d = draft('math-regular-polygon-angle', seed);
      const n = numbers(d.alt)[0]!;
      const v = valueOf(d.answer);
      if (d.stem.includes('diagonals')) expect(v).toBe((n * (n - 3)) / 2);
      else if (d.alt.includes('two sides')) expect(v).toBeCloseTo(((n - 2) * 180) / n, 9);
      else if (d.alt.includes('extension')) expect(v).toBeCloseTo(360 / n, 9);
      else {
        // an inscribed angle: k arcs of 360/n each, halved, with 1 ≤ k ≤ n − 3
        const k = (v * n) / 180;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
        expect(k).toBeGreaterThanOrEqual(1);
        expect(k).toBeLessThanOrEqual(n - 3);
      }
    }
  });

  it('dot plot mean and median', () => {
    for (const seed of SEEDS) {
      const d = draft('math-dot-plot-stats', seed);
      const values = [...d.alt.matchAll(/(\d+) at (\d+)/g)].flatMap((m) => Array.from({ length: Number(m[1]) }, () => Number(m[2])));
      values.sort((a, b) => a - b);
      const n = values.length;
      const expected = d.stem.includes('mean') ? values.reduce((a, b) => a + b, 0) / n : n % 2 ? values[(n - 1) / 2]! : (values[n / 2 - 1]! + values[n / 2]!) / 2;
      expect(valueOf(d.answer), `seed ${seed}`).toBeCloseTo(expected, 9);
    }
  });

  it('graph equation: exactly one choice passes through both marked points', () => {
    // Read a choice such as "y = −(1/2)|x + 2| − 3" back into a function.
    const parse = (eq: string) => {
      const m = /^y = (−?)(?:(\d+)|\((\d+)\/(\d+)\))?(\||√\(|\()x ([−+]) (\d+)(?:\||\)²|\)) ([−+]) (\d+)$/.exec(eq);
      if (!m) throw new Error(`cannot read ${eq}`);
      const a = (m[1] ? -1 : 1) * (m[2] ? Number(m[2]) : m[3] ? Number(m[3]) / Number(m[4]) : 1);
      const h = (m[6] === '−' ? 1 : -1) * Number(m[7]);
      const k = (m[8] === '+' ? 1 : -1) * Number(m[9]);
      const g = m[5] === '|' ? Math.abs : m[5] === '(' ? (u: number) => u * u : (u: number) => (u < 0 ? NaN : Math.sqrt(u));
      return (x: number) => a * g(x - h) + k;
    };
    for (const seed of SEEDS) {
      const d = draft('math-graph-equation', seed);
      const marked = [...d.alt.replace(/−/g, '-').matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
      expect(marked.length).toBe(2);
      const fits = Object.entries(d.choices!).filter(([, eq]) => marked.every(([x, y]) => Math.abs(parse(eq)(x) - y) < 1e-9));
      expect(fits.map(([letter]) => letter), `seed ${seed}`).toEqual([d.answerLetter]);
    }
  });

  it('Venn diagram counts, read back from the figure', () => {
    // Masks: bit 0 = first set (A), bit 1 = second (B), bit 2 = third (C); 0 = outside all three.
    const ALL = [0, 1, 2, 3, 4, 5, 6, 7];
    const pop = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
    /** A set expression such as "(A ∪ C) ∩ B′" as the set of region masks it covers. */
    const evalSet = (expr: string): number[] => {
      let i = 0;
      const src = expr.replace(/\s+/g, '');
      const atom = (): number[] => {
        let out: number[];
        if (src[i] === '(') {
          i++;
          out = union();
          i++; // ')'
        } else {
          const bit = 1 << 'ABC'.indexOf(src[i++]!);
          out = ALL.filter((m) => m & bit);
        }
        while (src[i] === '′') {
          i++;
          const inside = out;
          out = ALL.filter((m) => !inside.includes(m));
        }
        return out;
      };
      const union = (): number[] => {
        let left = atom();
        while (src[i] === '∪' || src[i] === '∩') {
          const op = src[i++];
          const right = atom();
          left = op === '∪' ? ALL.filter((m) => left.includes(m) || right.includes(m)) : left.filter((m) => right.includes(m));
        }
        return left;
      };
      return union();
    };
    for (const seed of SEEDS) {
      const d = draft('math-venn-diagram', seed);
      const counts = [...d.svg.matchAll(/>(\d+)<\/text>/g)].slice(0, 8).map((m) => Number(m[1]));
      const total = counts.reduce((a, b) => a + b, 0);
      const size = (masks: number[]) => masks.reduce((a, m) => a + counts[m]!, 0);
      const names = /labeled (.+?) inside/.exec(d.alt)![1]!.split(', ').map((n) => n.toLowerCase());
      const bit = (club: string) => 1 << names.indexOf(club);
      let expected: number;
      const setExpr = /How many elements are in (.+)\?$/.exec(d.stem)?.[1];
      const given = /a student in the (\w+) club is chosen at random, what is the probability that the student is also in the (\w+) club/.exec(d.stem);
      const butNot = /in the (\w+) club but not the (\w+) club/.exec(d.stem);
      const both = /in both the (\w+) club and the (\w+) club/.exec(d.stem);
      if (setExpr) expected = size(evalSet(setExpr));
      else if (given) expected = size(ALL.filter((m) => m & bit(given[1]!) && m & bit(given[2]!))) / size(ALL.filter((m) => m & bit(given[1]!)));
      else if (butNot) expected = size(ALL.filter((m) => m & bit(butNot[1]!) && !(m & bit(butNot[2]!))));
      else if (both) expected = size(ALL.filter((m) => m & bit(both[1]!) && m & bit(both[2]!)));
      else {
        const which = /in (exactly one|exactly two|at least two|none) of the three clubs/.exec(d.stem)![1]!;
        const masks = ALL.filter((m) => (which === 'exactly one' ? pop(m) === 1 : which === 'exactly two' ? pop(m) === 2 : which === 'at least two' ? pop(m) >= 2 : m === 0));
        expected = d.stem.includes('probability') ? size(masks) / total : size(masks);
      }
      expect(valueOf(d.answer), `seed ${seed}: ${d.stem}`).toBeCloseTo(expected, 9);
    }
  });

  it('parabola through its labeled intercepts', () => {
    for (const seed of SEEDS) {
      const d = draft('math-parabola-graph', seed);
      const [r1, , r2, , , c] = numbers(d.alt.slice(d.alt.indexOf('x-intercepts')));
      const a = c! / (r1! * r2!);
      const f = (x: number) => a * (x - r1!) * (x - r2!);
      // the curve really passes through the three labeled points
      expect(f(0)).toBeCloseTo(c!, 9);
      let expected: number;
      if (/minimum|maximum/.test(d.stem)) expected = f((r1! + r2!) / 2);
      else if (d.stem.includes('value of b')) expected = -a * (r1! + r2!);
      else if (d.stem.includes('value of a')) expected = a;
      else expected = f(numbers(/f\((.+?)\)\?/.exec(d.stem)![1]!)[0]!);
      expect(valueOf(d.answer), `seed ${seed}: ${d.stem}`).toBeCloseTo(expected, 9);
      if (d.stem.includes('minimum')) expect(a).toBeGreaterThan(0);
      if (d.stem.includes('maximum')) expect(a).toBeLessThan(0);
    }
  });
});
