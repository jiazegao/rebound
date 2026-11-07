/**
 * Generated visual bonuses: physics.
 * Each template draws a figure (svg.ts) and asks a bonus question about it with an exact answer.
 * See src/core/visual/README.md for the rules every template follows.
 *
 * Each template is a pure `...Draft(params)` builder (exported for the tests) and a `make(rng)` that
 * picks the parameters.
 */
import { decimalText, fractionText, radicalText } from '../exact';
import type { Rng } from '../rng';
import { ACCENT, arrow, circle, dot, figure, INK, line, path, plane, SOFT, text } from '../svg';
import type { VisualDraft, VisualTemplate } from '../types';
import { addR, cell, divR, junction, mulR, parallelR, ratio, resistor, seriesR, terminal, type Ratio } from './circuits';
import { framedAxes, steps } from './graphs';

const OHM = 'Ω';

/** A rational answer in simplest form; its exact decimal (7/2 → 3.5) is accepted too. */
export function exactAnswer(r: Ratio): Pick<VisualDraft, 'answer' | 'accept'> {
  const [n, d] = r;
  const answer = fractionText(n, d);
  if (d === 1) return { answer };
  const dec = decimalText(n / d, 4);
  return Number(dec) === n / d ? { answer, accept: [dec] } : { answer };
}

/* ---------------- equivalent resistance of a network ---------------- */

/** Stages in series from A to B: a single resistor, or parallel branches that are each resistors in series. */
export type Stage = { kind: 'series'; r: number } | { kind: 'parallel'; branches: number[][] };

export function networkResistance(stages: readonly Stage[]): Ratio {
  return seriesR(
    stages.map((s) => (s.kind === 'series' ? ratio(s.r) : parallelR(s.branches.map((b) => seriesR(b.map((r) => ratio(r))))))),
  );
}

/** Shapes from A to B: 'S' is one resistor in series; a list gives the number of resistors in each parallel branch. */
const NETWORK_SHAPES: ReadonlyArray<ReadonlyArray<'S' | readonly number[]>> = [
  ['S', [1, 1]],
  [[1, 1], 'S'],
  [[2, 1]],
  ['S', [2, 1]],
  [[1, 1], [1, 1]],
  ['S', [1, 1, 1]],
  ['S', [1, 1], 'S'],
  [[2, 2]],
];
const NETWORK_OHMS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

function networkFigure(stages: readonly Stage[]): string {
  const SLOT = 84; // one resistor with its leads
  const BUS = 16; // wire between a parallel block's bus and its widest branch
  const GAP = 26; // wire between stages
  const LEAD = 34; // wire from a terminal to the first or last stage
  const widthOf = (s: Stage) => (s.kind === 'series' ? SLOT : 2 * BUS + SLOT * Math.max(...s.branches.map((b) => b.length)));
  const total = 2 * LEAD + stages.reduce((sum, s) => sum + widthOf(s), 0) + GAP * (stages.length - 1);
  const maxBranches = Math.max(...stages.map((s) => (s.kind === 'parallel' ? s.branches.length : 1)));
  const h = maxBranches >= 3 ? 300 : 260;
  const midY = h / 2;
  const xA = (480 - total) / 2;
  const xB = xA + total;
  const label = (x: number, y: number, r: number) => text(x, y, `${r} ${OHM}`, { anchor: 'middle', size: 15 });
  const big = { body: 46, amp: 10 };
  const parts: string[] = [];
  let x = xA + LEAD;
  parts.push(line(xA, midY, x, midY));
  stages.forEach((s, i) => {
    const w = widthOf(s);
    if (s.kind === 'series') {
      parts.push(resistor(x, midY, x + w, midY, big), label(x + w / 2, midY - 18, s.r));
    } else {
      const k = s.branches.length;
      const offsets = k === 2 ? [-50, 50] : [-78, 0, 78];
      const xl = x;
      const xr = x + w;
      parts.push(line(xl, midY + offsets[0], xl, midY + offsets[k - 1]), line(xr, midY + offsets[0], xr, midY + offsets[k - 1]));
      s.branches.forEach((branch, j) => {
        const y = midY + offsets[j];
        const start = xl + (w - branch.length * SLOT) / 2;
        parts.push(line(xl, y, start, y), line(start + branch.length * SLOT, y, xr, y));
        branch.forEach((r, m) => {
          const x1 = start + m * SLOT;
          parts.push(resistor(x1, y, x1 + SLOT, y, big), label(x1 + SLOT / 2, offsets[j] > 0 ? y + 30 : y - 18, r));
        });
      });
      parts.push(junction(xl, midY), junction(xr, midY));
    }
    x += w;
    if (i < stages.length - 1) {
      parts.push(line(x, midY, x + GAP, midY));
      x += GAP;
    }
  });
  parts.push(line(x, midY, xB, midY), terminal(xA, midY), terminal(xB, midY));
  parts.push(text(xA - 12, midY, 'A', { anchor: 'end', baseline: 'middle', size: 17, weight: 'bold' }));
  parts.push(text(xB + 12, midY, 'B', { baseline: 'middle', size: 17, weight: 'bold' }));
  return figure(480, h, ...parts);
}

export function networkDraft(stages: readonly Stage[]): VisualDraft {
  const count = stages.reduce((n, s) => n + (s.kind === 'series' ? 1 : s.branches.reduce((m, b) => m + b.length, 0)), 0);
  return {
    stem: 'In ohms, what is the equivalent resistance of the network between points A and B?',
    format: 'short_answer',
    ...exactAnswer(networkResistance(stages)),
    svg: networkFigure(stages),
    alt: `A circuit diagram of ${count} resistors, each labeled with its resistance in ohms, connected in series and in parallel between terminals A and B.`,
    topic: 'physics.electrostatics-circuits',
  };
}

const resistorNetwork: VisualTemplate = {
  id: 'physics-resistor-network',
  subject: 'physics',
  title: 'Equivalent resistance',
  description: 'Three or four resistors in series and parallel between terminals A and B; asks for the equivalent resistance as an exact fraction.',
  make(rng) {
    const shape = rng.pick(NETWORK_SHAPES);
    const build = (value: () => number): Stage[] =>
      shape.map((s): Stage =>
        s === 'S' ? { kind: 'series', r: value() } : { kind: 'parallel', branches: rng.shuffle(s.map((n) => Array.from({ length: n }, value))) },
      );
    // Keep answers short: half the time a whole number of ohms, otherwise a denominator of at most 12
    // (an all-6 Ω network always qualifies).
    const ohms = () => rng.pick(NETWORK_OHMS);
    const limit = rng.chance(0.5) ? 1 : 12;
    let stages = build(ohms);
    for (let tries = 0; tries < 150 && networkResistance(stages)[1] > limit; tries++) stages = build(ohms);
    for (let tries = 0; tries < 60 && networkResistance(stages)[1] > 12; tries++) stages = build(ohms);
    if (networkResistance(stages)[1] > 12) stages = build(() => 6);
    return networkDraft(stages);
  },
};

/* ---------------- current or voltage in a battery circuit ---------------- */

/** R1 in series with the battery, then R2 and R3 in parallel; `target` is the highlighted resistor. */
export interface CircuitParams {
  emf: number;
  r1: number;
  r2: number;
  r3: number;
  target: 1 | 2 | 3;
  ask: 'current' | 'voltage';
}

export function circuitAnswer(p: CircuitParams): Ratio {
  const rp = parallelR([ratio(p.r2), ratio(p.r3)]);
  const current = divR(ratio(p.emf), addR(ratio(p.r1), rp));
  if (p.target === 1) return p.ask === 'current' ? current : mulR(current, ratio(p.r1));
  const vp = mulR(current, rp);
  return p.ask === 'current' ? divR(vp, ratio(p.target === 2 ? p.r2 : p.r3)) : vp;
}

/** Ordered pairs of resistances whose parallel combination is a whole number of ohms. */
const PARALLEL_PAIRS: Array<[number, number]> = [];
for (const a of [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30]) {
  for (const b of [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30]) if ((a * b) % (a + b) === 0) PARALLEL_PAIRS.push([a, b]);
}

function circuitFigure(p: CircuitParams): string {
  const yT = 70;
  const yB = 240;
  const mid = (yT + yB) / 2;
  const xBat = 92;
  const xR2 = 282;
  const xR3 = 404;
  const hot = (t: number) => p.target === t;
  const color = (t: number) => (hot(t) ? ACCENT : INK);
  const label = (x: number, y: number, r: number, t: number, anchor: 'start' | 'middle') =>
    text(x, y, `${r} ${OHM}`, { anchor, baseline: 'middle', size: 16, fill: color(t), weight: hot(t) ? 'bold' : 'normal' });
  return figure(
    480,
    270,
    cell(xBat, yT, xBat, yB),
    line(xBat, yT, xBat + 36, yT),
    resistor(xBat + 36, yT, xBat + 156, yT, { color: color(1) }),
    line(xBat + 156, yT, xR3, yT),
    resistor(xR2, yT, xR2, yB, { color: color(2) }),
    resistor(xR3, yT, xR3, yB, { color: color(3) }),
    line(xBat, yB, xR3, yB),
    junction(xR2, yT),
    junction(xR2, yB),
    label(xBat + 96, yT - 20, p.r1, 1, 'middle'),
    label(xR2 + 18, mid, p.r2, 2, 'start'),
    label(xR3 + 18, mid, p.r3, 3, 'start'),
    text(xBat - 28, mid, `${p.emf} V`, { anchor: 'end', baseline: 'middle', size: 16 }),
  );
}

export function circuitDraft(p: CircuitParams): VisualDraft {
  return {
    stem:
      p.ask === 'current'
        ? 'The battery in the circuit shown is ideal. In amperes, what is the current through the highlighted resistor?'
        : 'The battery in the circuit shown is ideal. In volts, what is the potential difference across the highlighted resistor?',
    format: 'short_answer',
    ...exactAnswer(circuitAnswer(p)),
    svg: circuitFigure(p),
    alt: 'A circuit: a battery labeled with its voltage, one resistor in series with it, then two resistors in parallel, each resistor labeled in ohms. One resistor is highlighted.',
    topic: 'physics.electrostatics-circuits',
  };
}

const batteryCircuit: VisualTemplate = {
  id: 'physics-battery-circuit',
  subject: 'physics',
  title: 'Current and voltage in a circuit',
  description: 'A battery with one resistor in series and two in parallel; asks for the current through, or the voltage across, the highlighted resistor.',
  make(rng) {
    const [r2, r3] = rng.pick(PARALLEL_PAIRS);
    const r1 = rng.pick([1, 2, 3, 4, 5, 6, 8, 10]);
    const total = r1 + (r2 * r3) / (r2 + r3);
    // A whole-number total current keeps the answers short; the battery is at most 60 V.
    const current = rng.pick([1, 2, 3].filter((i) => i * total <= 60));
    return circuitDraft({
      emf: current * total,
      r1,
      r2,
      r3,
      target: rng.pick([1, 2, 3] as const),
      ask: rng.chance(0.5) ? 'current' : 'voltage',
    });
  },
};

/* ---------------- velocity–time graph ---------------- */

/**
 * A piecewise-linear velocity graph through (ts[i], vs[i]). `from` and `to` index ts: the interval asked
 * about ('acceleration' asks about the single segment from ts[from] to ts[from + 1]).
 */
export interface VelocityParams {
  ts: number[];
  vs: number[];
  mode: 'displacement' | 'acceleration' | 'average';
  from: number;
  to: number;
}

export function velocityAnswer(p: VelocityParams): Ratio {
  if (p.mode === 'acceleration') return ratio(Math.abs(p.vs[p.from + 1] - p.vs[p.from]), p.ts[p.from + 1] - p.ts[p.from]);
  let twice = 0; // twice the area under the graph (trapezoids)
  for (let k = p.from; k < p.to; k++) twice += (p.vs[k] + p.vs[k + 1]) * (p.ts[k + 1] - p.ts[k]);
  return p.mode === 'displacement' ? ratio(twice, 2) : ratio(twice, 2 * (p.ts[p.to] - p.ts[p.from]));
}

const V_MAX = 12;

function velocityFigure(p: VelocityParams): string {
  const end = p.ts[p.ts.length - 1];
  const pl = plane({ xMin: 0, xMax: end, yMin: 0, yMax: V_MAX, left: 64, top: 20, width: 384, height: 216 });
  const pts = p.ts.map((t, i) => [t, p.vs[i]] as const);
  return figure(
    480,
    290,
    pl.grid(1, 1),
    framedAxes(pl, { xTicks: steps(0, end), yTicks: steps(0, V_MAX), yLabels: steps(0, V_MAX, 2), xTitle: 'Time (s)', yTitle: 'Velocity (m/s)' }),
    pl.polyline(pts, { width: 3 }),
    ...pts.map(([t, v]) => dot(pl.x(t), pl.y(v), 4.5)),
  );
}

export function velocityDraft(p: VelocityParams): VisualDraft {
  const a = p.ts[p.from];
  const b = p.ts[p.mode === 'acceleration' ? p.from + 1 : p.to];
  const span = `from t = ${a === 0 ? '0' : `${a} s`} to t = ${b} s`;
  const intro = 'The graph shows the velocity of a cart moving along a straight track.';
  const ask =
    p.mode === 'displacement'
      ? `In meters, what is the cart's displacement ${span}?`
      : p.mode === 'acceleration'
        ? `In meters per second squared, what is the magnitude of the cart's acceleration ${span}?`
        : `In meters per second, what is the cart's average velocity ${span}?`;
  return {
    stem: `${intro} ${ask}`,
    format: 'short_answer',
    ...exactAnswer(velocityAnswer(p)),
    svg: velocityFigure(p),
    alt: 'A velocity-versus-time graph made of straight segments on a grid, with time in seconds and velocity in meters per second.',
    topic: 'physics.kinematics-forces',
  };
}

/** Breakpoints 0 = t0 < t1 < … < t(parts) = total, each gap at least minGap whole seconds. */
function breakpoints(rng: Rng, total: number, parts: number, minGap: number): number[] {
  const gaps = Array.from({ length: parts }, () => minGap);
  for (let extra = total - parts * minGap; extra > 0; extra--) gaps[rng.int(0, parts - 1)] += 1;
  const ts = [0];
  for (const g of gaps) ts.push(ts[ts.length - 1] + g);
  return ts;
}

const velocityGraph: VisualTemplate = {
  id: 'physics-velocity-graph',
  subject: 'physics',
  title: 'Velocity–time graph',
  description: 'A piecewise-linear velocity–time graph on a grid; asks for a displacement (area), an acceleration (slope) or an average velocity.',
  make(rng) {
    const end = rng.pick([8, 10, 12]);
    const segments = rng.int(3, 4);
    const ts = breakpoints(rng, end, segments, 2);
    const vs = [rng.int(0, 6)];
    let flat = false;
    for (let i = 1; i <= segments; i++) {
      const prev = vs[i - 1];
      if (!flat && rng.chance(0.3)) {
        vs.push(prev);
        flat = true;
        continue;
      }
      let v = rng.int(0, V_MAX);
      while (v === prev) v = rng.int(0, V_MAX);
      vs.push(v);
    }
    const mode = rng.pick(['displacement', 'displacement', 'acceleration', 'average'] as const);
    if (mode === 'acceleration') {
      const sloped = vs.slice(0, -1).map((_, k) => k).filter((k) => vs[k + 1] !== vs[k]);
      const k = rng.pick(sloped);
      return velocityDraft({ ts, vs, mode, from: k, to: k + 1 });
    }
    if (mode === 'average') {
      // Only short averages (at most quarters); otherwise ask for the whole displacement instead.
      const p: VelocityParams = { ts, vs, mode, from: 0, to: segments };
      return velocityDraft(velocityAnswer(p)[1] <= 4 ? p : { ...p, mode: 'displacement' });
    }
    if (rng.chance(0.35)) return velocityDraft({ ts, vs, mode, from: 0, to: segments });
    // At least two segments, so the area is never a single flat strip.
    const from = rng.int(0, segments - 2);
    const to = rng.int(from + 2, segments);
    return velocityDraft({ ts, vs, mode, from, to });
  },
};

/* ---------------- net force from a top-view force diagram ---------------- */

export interface ForceParams {
  right: number;
  left: number;
  up: number;
  down: number;
  mass: number;
  ask: 'force' | 'acceleration';
}

/** |F|, or |F|/m for the acceleration: an exact fraction when |F| is whole (always, with TRIPLES), else a radical. */
export function forceAnswer(p: ForceParams): Pick<VisualDraft, 'answer' | 'accept'> {
  const fx = p.right - p.left;
  const fy = p.up - p.down;
  const square = fx * fx + fy * fy;
  const divisor = p.ask === 'force' ? 1 : p.mass;
  const root = Math.round(Math.sqrt(square));
  return root * root === square ? exactAnswer(ratio(root, divisor)) : { answer: radicalText(1, divisor, square) };
}

/** Pythagorean triples for the net force's components and magnitude. */
const TRIPLES: ReadonlyArray<readonly [number, number, number]> = [
  [3, 4, 5],
  [6, 8, 10],
  [5, 12, 13],
  [9, 12, 15],
  [8, 15, 17],
  [12, 16, 20],
  [15, 20, 25],
  [7, 24, 25],
];

function forceFigure(p: ForceParams): string {
  const cx = 240;
  const cy = 160;
  const R = 30;
  const biggest = Math.max(p.right, p.left, p.up, p.down);
  const len = (f: number) => 26 + (70 * f) / biggest;
  const style = { width: 3, head: 13 };
  const label = (x: number, y: number, f: number, anchor: 'start' | 'middle' | 'end') =>
    text(x, y, `${f} N`, { anchor, baseline: 'middle', size: 16 });
  const parts = [
    text(16, 24, 'Top view', { size: 14, italic: true }),
    circle(cx, cy, R, { fill: INK, fillOpacity: SOFT, width: 2.5 }),
    text(cx, cy, `${p.mass} kg`, { anchor: 'middle', baseline: 'middle', size: 15, halo: false }),
  ];
  if (p.right) {
    const x2 = cx + R + len(p.right);
    parts.push(arrow(cx + R, cy, x2, cy, style), label(x2 + 8, cy, p.right, 'start'));
  }
  if (p.left) {
    const x2 = cx - R - len(p.left);
    parts.push(arrow(cx - R, cy, x2, cy, style), label(x2 - 8, cy, p.left, 'end'));
  }
  if (p.up) {
    const y2 = cy - R - len(p.up);
    parts.push(arrow(cx, cy - R, cx, y2, style), label(cx, y2 - 14, p.up, 'middle'));
  }
  if (p.down) {
    const y2 = cy + R + len(p.down);
    parts.push(arrow(cx, cy + R, cx, y2, style), label(cx, y2 + 14, p.down, 'middle'));
  }
  return figure(480, 320, ...parts);
}

export function forceDraft(p: ForceParams): VisualDraft {
  const intro = 'The figure is a top view of a puck on level, frictionless ice, with all the horizontal forces on it.';
  return {
    stem:
      p.ask === 'force'
        ? `${intro} In newtons, what is the magnitude of the net force on the puck?`
        : `${intro} In meters per second squared, what is the magnitude of the puck's acceleration?`,
    format: 'short_answer',
    ...forceAnswer(p),
    svg: forceFigure(p),
    alt: 'A top view of a puck labeled with its mass in kilograms, with force arrows labeled in newtons pointing along two perpendicular directions.',
    topic: 'physics.kinematics-forces',
  };
}

const netForce: VisualTemplate = {
  id: 'physics-net-force',
  subject: 'physics',
  title: 'Net force and acceleration',
  description: 'A top-view force diagram on a puck of known mass with forces along two perpendicular lines; asks for the net force or the acceleration.',
  make(rng) {
    const [a, b] = rng.pick(TRIPLES);
    const [nx, ny] = rng.chance(0.5) ? [a, b] : [b, a];
    const ex = rng.pick([0, 0, 2, 3, 4, 5, 6, 8, 10]);
    const ey = rng.pick([0, 0, 2, 3, 4, 5, 6, 8, 10]);
    const toRight = rng.chance(0.5);
    const toUp = rng.chance(0.5);
    return forceDraft({
      right: toRight ? nx + ex : ex,
      left: toRight ? ex : nx + ex,
      up: toUp ? ny + ey : ey,
      down: toUp ? ey : ny + ey,
      mass: rng.pick([1, 2, 3, 4, 5, 10]),
      ask: rng.chance(0.5) ? 'force' : 'acceleration',
    });
  },
};

/* ---------------- thin converging lens ---------------- */

/** Focal length f, object distance d (d > f, a real image) and object height h, all in centimeters. */
export interface LensParams {
  f: number;
  d: number;
  h: number;
  ask: 'distance' | 'height';
}

export function lensAnswer(p: LensParams): Ratio {
  // 1/f = 1/d + 1/i  →  i = fd/(d − f); the image height is h·i/d = hf/(d − f).
  return p.ask === 'distance' ? ratio(p.f * p.d, p.d - p.f) : ratio(p.h * p.f, p.d - p.f);
}

/** (f, d) pairs with a whole-number image distance and 1.2f ≤ d ≤ 4f. */
const LENS_CASES: Array<[number, number]> = [];
for (const f of [5, 6, 8, 10, 12, 15, 20]) {
  for (let d = Math.ceil(1.2 * f); d <= Math.min(4 * f, 60); d++) if ((f * f) % (d - f) === 0) LENS_CASES.push([f, d]);
}

function lensFigure(p: LensParams): string {
  const ay = 150; // optical axis
  const lx = 290; // lens
  const s = Math.min(250 / p.d, 150 / p.f);
  const xo = lx - p.d * s;
  const fl = lx - p.f * s;
  const fr = lx + p.f * s;
  const hpx = 34 + 9 * p.h;
  const dimY = 262;
  const ext = (x: number, y1: number) => line(x, y1, x, dimY + 8, { width: 1, opacity: 0.6 });
  const dim = { both: true, width: 1.5, head: 8 };
  return figure(
    480,
    300,
    line(14, ay, 466, ay, { width: 1.5 }),
    path(`M ${lx} 64 Q ${lx + 19} ${ay} ${lx} 236 Q ${lx - 19} ${ay} ${lx} 64 Z`, { width: 2, fill: INK, fillOpacity: SOFT }),
    arrow(xo, ay, xo, ay - hpx, { stroke: ACCENT, width: 3.5, head: 14 }),
    text(xo + 10, ay - hpx / 2, `h = ${p.h} cm`, { baseline: 'middle', size: 15 }),
    dot(fl, ay, 4.5),
    dot(fr, ay, 4.5),
    text(fl, ay + 24, 'F', { anchor: 'middle', size: 16, italic: true }),
    text(fr, ay + 24, 'F', { anchor: 'middle', size: 16, italic: true }),
    ext(xo, ay + 6),
    ext(lx, 238),
    ext(fr, ay + 32),
    arrow(xo, dimY, lx, dimY, dim),
    arrow(lx, dimY, fr, dimY, dim),
    text((xo + lx) / 2, dimY + 21, `${p.d} cm`, { anchor: 'middle', size: 15 }),
    text((lx + fr) / 2, dimY + 21, `${p.f} cm`, { anchor: 'middle', size: 15 }),
  );
}

export function lensDraft(p: LensParams): VisualDraft {
  const intro = 'The figure shows an object in front of a thin converging lens; F marks the focal points.';
  return {
    stem:
      p.ask === 'distance'
        ? `${intro} In centimeters, how far from the lens does the image form?`
        : `${intro} In centimeters, how tall is the image?`,
    format: 'short_answer',
    ...exactAnswer(lensAnswer(p)),
    svg: lensFigure(p),
    alt: "An upright object arrow on the axis of a thin converging lens. The focal points are marked F; the object's height, its distance from the lens and the focal length are labeled in centimeters.",
    topic: 'physics.optics',
  };
}

const thinLens: VisualTemplate = {
  id: 'physics-thin-lens',
  subject: 'physics',
  title: 'Image in a converging lens',
  description: 'An object in front of a thin converging lens with the distances labeled; asks for the image distance or the image height.',
  make(rng) {
    const [f, d] = rng.pick(LENS_CASES);
    const ask = rng.chance(0.5) ? 'distance' : 'height';
    // For the height, prefer an object height that makes a whole-number image height.
    const heights = [1, 2, 3, 4, 5, 6];
    const whole = heights.filter((h) => (h * f) % (d - f) === 0);
    const h = rng.pick(ask === 'height' && whole.length ? whole : heights);
    return lensDraft({ f, d, h, ask });
  },
};

/* ---------------- two vectors on a grid ---------------- */

/** Two vectors from the origin, in grid squares. 'force': |F₁ + F₂|; 'velocity': |v₂ − v₁|. */
export interface VectorParams {
  a: readonly [number, number];
  b: readonly [number, number];
  kind: 'force' | 'velocity';
}

export function vectorAnswer(p: VectorParams): string {
  const sign = p.kind === 'force' ? 1 : -1;
  const x = p.b[0] + sign * p.a[0];
  const y = p.b[1] + sign * p.a[1];
  return radicalText(1, 1, x * x + y * y);
}

function vectorFigure(p: VectorParams): string {
  const pl = plane({ xMin: -6, xMax: 6, yMin: -4, yMax: 4, left: 48, top: 44, width: 384, height: 256 });
  const [n1, n2] = p.kind === 'force' ? ['F₁', 'F₂'] : ['v₁', 'v₂'];
  const parts = [
    text(48, 28, p.kind === 'force' ? 'Each square is 1 N on a side.' : 'Each square is 1 m/s on a side.', { size: 14 }),
    pl.grid(1),
    line(pl.x(-6), pl.y(0), pl.x(6), pl.y(0), { width: 1.5, opacity: 0.55 }),
    line(pl.x(0), pl.y(-4), pl.x(0), pl.y(4), { width: 1.5, opacity: 0.55 }),
  ];
  for (const [v, name] of [[p.a, n1], [p.b, n2]] as const) {
    const len = Math.hypot(v[0], v[1]);
    const tx = pl.x(v[0]);
    const ty = pl.y(v[1]);
    parts.push(arrow(pl.x(0), pl.y(0), tx, ty, { width: 3, head: 13 }));
    parts.push(text(tx + (17 * v[0]) / len, ty - (17 * v[1]) / len, name, { anchor: 'middle', baseline: 'middle', size: 17, italic: true, weight: 'bold' }));
  }
  parts.push(dot(pl.x(0), pl.y(0), 4));
  return figure(480, 316, ...parts);
}

export function vectorDraft(p: VectorParams): VisualDraft {
  return {
    stem:
      p.kind === 'force'
        ? 'Forces F₁ and F₂, drawn to scale on the grid, act on an object at the origin. In newtons, what is the magnitude of the net force on the object?'
        : "An object's velocity changes from v₁ to v₂, both drawn to scale on the grid. In meters per second, what is the magnitude of the change in its velocity?",
    format: 'short_answer',
    answer: vectorAnswer(p),
    svg: vectorFigure(p),
    alt:
      p.kind === 'force'
        ? 'A square grid with two force arrows, F₁ and F₂, drawn from the origin; a note gives the scale of one square.'
        : 'A square grid with two velocity arrows, v₁ and v₂, drawn from the origin; a note gives the scale of one square.',
    topic: 'physics.kinematics-forces',
  };
}

/** A whole-number vector that fits the grid with room for its label. */
function gridVector(rng: Rng): [number, number] {
  for (;;) {
    const v: [number, number] = [rng.int(-5, 5), rng.int(-3, 3)];
    if (v[0] * v[0] + v[1] * v[1] >= 5) return v;
  }
}

const vectorGrid: VisualTemplate = {
  id: 'physics-vector-grid',
  subject: 'physics',
  title: 'Adding vectors on a grid',
  description: 'Two force or velocity vectors drawn on a grid; asks for the magnitude of the net force or of the change in velocity, in simplest radical form.',
  make(rng) {
    const a = gridVector(rng);
    let b = gridVector(rng);
    // Clearly different directions (at least 25° apart, not opposite) and tips far enough apart for the labels.
    const angle = (u: readonly number[], v: readonly number[]) =>
      Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1])))));
    while (angle(a, b) < (25 * Math.PI) / 180 || angle(a, b) > (170 * Math.PI) / 180 || Math.hypot(a[0] - b[0], a[1] - b[1]) < 2) {
      b = gridVector(rng);
    }
    return vectorDraft({ a, b, kind: rng.chance(0.6) ? 'force' : 'velocity' });
  },
};

/* ---------------- a transverse wave ---------------- */

/** A snapshot y = A cos(2π(x − crest)/λ): λ and the span in meters, A in centimeters, f in hertz. */
export interface WaveParams {
  wavelength: number;
  amplitude: number;
  frequency: number;
  crest: number;
  span: number;
  ask: 'wavelength' | 'amplitude' | 'speed';
}

export function waveAnswer(p: WaveParams): number {
  return p.ask === 'wavelength' ? p.wavelength : p.ask === 'amplitude' ? p.amplitude : p.wavelength * p.frequency;
}

function waveFigure(p: WaveParams): string {
  const ym = p.amplitude + 1;
  const pl = plane({ xMin: 0, xMax: p.span, yMin: -ym, yMax: ym, left: 64, top: 34, width: 384, height: 200 });
  const yLabels = ym <= 5 ? steps(-ym, ym) : steps(-ym + (ym % 2), ym, 2);
  return figure(
    480,
    288,
    pl.grid(1, 1),
    line(pl.x(0), pl.y(0), pl.x(p.span), pl.y(0), { width: 1.5, opacity: 0.7 }),
    framedAxes(pl, { xTicks: steps(0, p.span), yTicks: steps(-ym, ym), yLabels, xTitle: 'Position (m)', yTitle: 'Displacement (cm)' }),
    pl.plot((x) => p.amplitude * Math.cos((2 * Math.PI * (x - p.crest)) / p.wavelength), { samples: 360, style: { width: 3, stroke: ACCENT } }),
    text(448, 22, `f = ${p.frequency} Hz`, { anchor: 'end', size: 15 }),
  );
}

export function waveDraft(p: WaveParams): VisualDraft {
  const intro = 'The graph is a snapshot of a transverse wave traveling along a string.';
  const ask =
    p.ask === 'wavelength'
      ? 'In meters, what is the wavelength of the wave?'
      : p.ask === 'amplitude'
        ? 'In centimeters, what is the amplitude of the wave?'
        : 'Using the frequency shown, what is the speed of the wave in meters per second?';
  return {
    stem: `${intro} ${ask}`,
    format: 'short_answer',
    answer: String(waveAnswer(p)),
    svg: waveFigure(p),
    alt: "A graph of a transverse wave's displacement in centimeters against position in meters, on a grid, with the wave's frequency labeled.",
    topic: 'physics.waves-sound',
  };
}

const waveGraph: VisualTemplate = {
  id: 'physics-wave-graph',
  subject: 'physics',
  title: 'Reading a wave',
  description: 'A snapshot graph of a transverse wave with its frequency labeled; asks for the wavelength, the amplitude or the wave speed.',
  make(rng) {
    const wavelength = rng.pick([2, 3, 4, 5, 6]);
    // Two to four wavelengths across the graph.
    const span = rng.pick([8, 10, 12].filter((s) => s >= 2 * wavelength && s <= 4 * wavelength));
    return waveDraft({
      wavelength,
      amplitude: rng.int(2, 6),
      frequency: rng.pick([2, 3, 4, 5, 10]),
      crest: rng.int(0, wavelength - 1),
      span,
      ask: rng.pick(['wavelength', 'amplitude', 'speed'] as const),
    });
  },
};

export const PHYSICS_TEMPLATES: VisualTemplate[] = [resistorNetwork, batteryCircuit, velocityGraph, netForce, thinLens, vectorGrid, waveGraph];
