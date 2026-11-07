/**
 * Generated visual bonuses: energy.
 * Each template draws a figure (svg.ts) and asks a bonus question about it with an exact answer.
 * See src/core/visual/README.md for the rules every template follows.
 */
import { reduce } from '../exact';
import { ACCENT, arrow, circle, dot, figure, INK, line, num, PAPER, path, plane, rect, SOFT, text } from '../svg';
import type { VisualTemplate } from '../types';
import { decimalAnswer, exactDecimal, fmt, range, richText, sum, tickLabels, type AnswerForms } from './math-helpers';

/* ---------------- Sankey diagram: efficiency ---------------- */

interface Device {
  /** As it reads in a stem: "an electric motor". */
  name: string;
  input: string;
  useful: string;
  /** The main loss first, then an optional small second loss. */
  losses: Array<{ label: string; phrase: string }>;
  /** With a second loss: the range of its share of the input, in percent. */
  minor?: [number, number];
  /** Realistic efficiency range, in percent. */
  eff: [number, number];
  /** Inputs, all multiples of 100 so every flow is a whole number. */
  inputs: number[];
  unit: 'J' | 'MW';
}

const THERMAL = { label: 'Thermal', phrase: 'as thermal energy' };
const DEVICES: Device[] = [
  { name: 'an incandescent light bulb', input: 'Electrical', useful: 'Light', losses: [THERMAL], eff: [5, 10], inputs: [100, 200, 300, 400, 500], unit: 'J' },
  { name: 'an LED lamp', input: 'Electrical', useful: 'Light', losses: [THERMAL], eff: [25, 45], inputs: [100, 200, 300, 400, 500], unit: 'J' },
  { name: 'an electric motor', input: 'Electrical', useful: 'Kinetic', losses: [THERMAL, { label: 'Sound', phrase: 'as sound' }], minor: [1, 4], eff: [70, 90], inputs: [200, 400, 500, 800, 1000, 2000], unit: 'J' },
  { name: 'a gasoline car engine', input: 'Chemical', useful: 'Kinetic', losses: [THERMAL, { label: 'Sound', phrase: 'as sound' }], minor: [2, 5], eff: [20, 30], inputs: [500, 1000, 2000, 2500, 4000, 5000], unit: 'J' },
  { name: 'a coal-fired power plant', input: 'Chemical', useful: 'Electrical', losses: [{ label: 'Waste heat', phrase: 'as waste heat' }], eff: [32, 40], inputs: [800, 1000, 1200, 1500, 2000, 2500], unit: 'MW' },
  { name: 'a solar panel', input: 'Radiant', useful: 'Electrical', losses: [THERMAL, { label: 'Reflected', phrase: 'as reflected light' }], minor: [4, 9], eff: [15, 22], inputs: [500, 1000, 2000], unit: 'J' },
];

type SankeyAsk = 'eff' | 'eff-input' | 'eff-useful' | 'loss';

const sankey: VisualTemplate = {
  id: 'energy-sankey-efficiency',
  subject: 'energy',
  title: 'Sankey diagram and efficiency',
  description: 'A Sankey diagram of the energy flowing through a device or power plant, with one flow possibly unknown; asks for the efficiency as a percent or for the unknown loss.',
  make(rng) {
    const dev = rng.pick(DEVICES);
    const E = rng.pick(dev.inputs);
    const unit = E / 100;
    const effPct = rng.int(dev.eff[0], dev.eff[1]);
    const useful = effPct * unit;
    const minor = dev.minor ? rng.int(dev.minor[0], dev.minor[1]) * unit : 0;
    const losses = dev.losses.length === 2 ? [E - useful - minor, minor] : [E - useful];
    const ask = rng.pick<SankeyAsk>(['eff', 'eff', 'eff-input', 'eff-useful', 'eff-useful', 'loss', 'loss']);
    const lossAsked = ask === 'loss' ? rng.int(0, losses.length - 1) : -1;
    const val = (v: number, unknown: boolean) => (unknown ? '?' : `${v} ${dev.unit}`);

    const W = 480;
    const H = 340;
    const x0 = 18;
    const xSplit = 128;
    const y0 = 64;
    const Hb = 110;
    const k = Hb / E;
    const r = 18;
    const yEnd = 252;
    const xEnd = 396;
    const wU = useful * k;
    const hU = Math.min(24, Math.max(12, 10 + wU * 0.2));
    // Bands under the useful flow, top to bottom: the small loss (if any), then the main loss, which peels off first.
    const order = losses.length === 2 ? [1, 0] : [0];
    let yc = y0 + wU;
    const bands = order.map((i) => {
      const top = yc;
      yc += losses[i]! * k;
      return { i, top, bot: yc, w: losses[i]! * k, xs: 0 };
    });
    for (let j = bands.length - 1; j >= 0; j--) {
      const b = bands[j]!;
      const below = bands[j + 1];
      b.xs = below ? Math.max(below.xs + below.w + 28, below.xs + below.w / 2 + 112 - b.w / 2) : 150;
    }
    // ACCENT marks the flow the question is about: the useful output for efficiency, else the unknown loss.
    const usefulFill = ask === 'loss' ? { width: 1.5, fill: INK, fillOpacity: SOFT } : { width: 1.5, fill: ACCENT, fillOpacity: SOFT * 2.6 };
    const parts: string[] = [
      rect(x0, y0, xSplit - x0, Hb, { width: 1.5, fill: INK, fillOpacity: SOFT }),
      path(
        `M ${xSplit} ${num(y0)} L ${xEnd} ${num(y0)} L ${xEnd} ${num(y0 - 5)} L ${num(xEnd + hU)} ${num(y0 + wU / 2)} L ${xEnd} ${num(y0 + wU + 5)} L ${xEnd} ${num(y0 + wU)} L ${xSplit} ${num(y0 + wU)} Z`,
        usefulFill,
      ),
    ];
    const head = (w: number) => Math.min(20, Math.max(10, 8 + w * 0.2));
    const labelY = yEnd + Math.max(...bands.map((b) => head(b.w))) + 20;
    for (const b of bands) {
      const R = r + b.w;
      const h = head(b.w);
      const cx = b.xs + r + b.w / 2;
      const asked = b.i === lossAsked;
      parts.push(
        path(
          `M ${xSplit} ${num(b.top)} L ${num(b.xs)} ${num(b.top)} A ${num(R)} ${num(R)} 0 0 1 ${num(b.xs + R)} ${num(b.bot + r)} ` +
            `L ${num(b.xs + R)} ${yEnd} L ${num(b.xs + R + 6)} ${yEnd} L ${num(cx)} ${num(yEnd + h)} L ${num(b.xs + r - 6)} ${yEnd} ` +
            `L ${num(b.xs + r)} ${yEnd} L ${num(b.xs + r)} ${num(b.bot + r)} A ${r} ${r} 0 0 0 ${num(b.xs)} ${num(b.bot)} L ${xSplit} ${num(b.bot)} Z`,
          asked ? { width: 1.5, fill: ACCENT, fillOpacity: SOFT * 2.6 } : { width: 1.5, fill: INK, fillOpacity: SOFT },
        ),
        text(cx, labelY, dev.losses[b.i]!.label, { anchor: 'middle', size: 15 }),
        text(cx, labelY + 19, val(losses[b.i]!, asked), { anchor: 'middle', size: 15, weight: asked ? 'bold' : 'normal' }),
      );
    }
    const inputUnknown = ask === 'eff-input';
    const usefulUnknown = ask === 'eff-useful';
    parts.push(
      text((x0 + xSplit) / 2, y0 + Hb / 2 - 10, dev.input, { anchor: 'middle', size: 15 }),
      text((x0 + xSplit) / 2, y0 + Hb / 2 + 12, val(E, inputUnknown), { anchor: 'middle', size: 15, weight: inputUnknown ? 'bold' : 'normal' }),
      text(xEnd + hU, y0 - 12, `${dev.useful}: ${val(useful, usefulUnknown)}`, { anchor: 'end', size: 15 }),
    );
    const flows = dev.losses.map((l, i) => `${l.label.toLowerCase()} ${i === lossAsked ? 'unknown' : `${losses[i]} ${dev.unit}`}`).join(' and ');
    const stemLead = `The Sankey diagram shows the energy flow in ${dev.name}.`;
    const loss = dev.losses[Math.max(0, lossAsked)]!;
    const forms: AnswerForms = ask === 'loss' ? { answer: String(losses[lossAsked]) } : { answer: String(effPct) };
    return {
      stem:
        ask === 'loss'
          ? `${stemLead} In ${dev.unit === 'J' ? 'joules, how much energy is transferred' : 'megawatts, how much power is lost'} ${loss.phrase}?`
          : `${stemLead} What is its efficiency, as a percent?`,
      format: 'short_answer',
      ...forms,
      svg: figure(W, H, ...parts),
      alt: `A Sankey diagram for ${dev.name}. The input, ${dev.input.toLowerCase()} energy (${inputUnknown ? 'unknown' : `${E} ${dev.unit}`}), splits into a useful output, ${dev.useful.toLowerCase()} (${usefulUnknown ? 'unknown' : `${useful} ${dev.unit}`}), that continues straight, and losses that turn downward: ${flows}.`,
      topic: 'energy.conversion-efficiency',
    };
  },
};

/* ---------------- heat engine between two reservoirs ---------------- */

type EngineAsk = 'eff' | 'work' | 'reject' | 'input';

const HOT = [400, 450, 500, 600, 700, 750, 800, 900, 1000, 1200];
const COLD = [250, 270, 280, 300, 320, 350, 360, 400];

/** Maximum (Carnot) efficiency between reservoirs at hot and cold kelvin temperatures, as a reduced fraction. */
export function carnotEfficiency(hot: number, cold: number): [number, number] {
  return reduce(hot - cold, hot);
}

const heatEngine: VisualTemplate = {
  id: 'energy-carnot-engine',
  subject: 'energy',
  title: 'Heat engine limits',
  description: 'A heat engine between hot and cold reservoirs at labeled kelvin temperatures; asks for the maximum (Carnot) efficiency, the maximum work, the minimum heat rejected or the minimum heat absorbed.',
  make(rng) {
    const ask = rng.pick<EngineAsk>(['eff', 'eff', 'work', 'work', 'reject', 'input']);
    let hot = 600;
    let cold = 300;
    let qh = 1200;
    let work = 600;
    for (let attempt = 0; attempt < 500; attempt++) {
      const h = rng.pick(HOT);
      const c = rng.pick(COLD);
      if (c > h - 150) continue;
      const [p, q] = carnotEfficiency(h, c);
      if (ask === 'eff') {
        if (100 % q !== 0) continue;
      } else if (ask === 'input') {
        // Work given: a multiple of p (so that Q_H = W·q/p is whole), between 100 and 3000 J.
        const options = range(100, 3000, 50).filter((w) => w % p === 0 && ((w / p) * q) % 10 === 0);
        if (options.length === 0) continue;
        work = rng.pick(options);
        qh = (work / p) * q;
      } else {
        const options = range(300, 6000, 100).filter((x) => x % q === 0);
        if (options.length === 0) continue;
        qh = rng.pick(options);
        work = (qh / q) * p;
      }
      hot = h;
      cold = c;
      break;
    }
    const [p, q] = carnotEfficiency(hot, cold);
    const effPct = (100 * p) / q;

    const W = 480;
    const H = 380;
    const cx = 240;
    const ey = 190;
    const er = 46;
    const accent = (on: boolean) => (on ? ACCENT : INK);
    const parts: string[] = [
      rect(110, 16, 260, 66, { rx: 8, width: 2, fill: INK, fillOpacity: SOFT }),
      text(cx, 42, 'Hot reservoir', { anchor: 'middle', size: 16, weight: 'bold' }),
      richText(cx, 68, ['T', { sub: 'H' }, ` = ${hot} K`], { anchor: 'middle', size: 16 }),
      rect(110, 298, 260, 66, { rx: 8, width: 2, fill: INK, fillOpacity: SOFT * 0.5 }),
      text(cx, 324, 'Cold reservoir', { anchor: 'middle', size: 16, weight: 'bold' }),
      richText(cx, 350, ['T', { sub: 'C' }, ` = ${cold} K`], { anchor: 'middle', size: 16 }),
      arrow(cx, 82, cx, ey - er - 2, { width: 3, head: 13, stroke: accent(ask === 'input') }),
      arrow(cx, ey + er, cx, 296, { width: 3, head: 13, stroke: accent(ask === 'reject') }),
      arrow(cx + er, ey, 430, ey, { width: 3, head: 13, stroke: accent(ask === 'work') }),
      circle(cx, ey, er, { width: 2.5, fill: PAPER }),
      text(cx, ey, 'Engine', { anchor: 'middle', baseline: 'middle', size: 15 }),
      richText(cx + 12, 132, ['Q', { sub: 'H' }, ask === 'work' || ask === 'reject' ? ` = ${qh} J` : ''], { size: 16 }),
      richText(cx + 12, 262, ['Q', { sub: 'C' }], { size: 16 }),
      text((cx + er + 430) / 2, ey - 14, ask === 'input' ? `W = ${work} J` : 'W', { anchor: 'middle', size: 16 }),
    ];
    const lead = 'The figure shows a heat engine operating between two reservoirs.';
    let stem: string;
    let forms: AnswerForms;
    switch (ask) {
      case 'eff':
        stem = `${lead} What is the maximum possible efficiency of this engine, as a percent?`;
        forms = { answer: String(effPct) };
        break;
      case 'work':
        stem = `${lead} In joules, what is the maximum work the engine can do in each cycle?`;
        forms = { answer: String(work) };
        break;
      case 'reject':
        stem = `${lead} In joules, what is the minimum heat the engine must release to the cold reservoir in each cycle?`;
        forms = { answer: String(qh - work) };
        break;
      default:
        stem = `${lead} To do the work shown in each cycle, what is the minimum heat, in joules, that the engine must absorb from the hot reservoir?`;
        forms = { answer: String(qh) };
    }
    return {
      stem,
      format: 'short_answer',
      ...forms,
      svg: figure(W, H, ...parts),
      alt:
        `A heat engine drawn as a circle between a hot reservoir at ${hot} kelvins above and a cold reservoir at ${cold} kelvins below. ` +
        `Arrows show the heat absorbed from the hot reservoir, Q sub H${ask === 'work' || ask === 'reject' ? ` (${qh} joules per cycle)` : ''}, the heat released to the cold reservoir, Q sub C, and the work done, W${ask === 'input' ? ` (${work} joules per cycle)` : ''}.`,
      topic: 'energy.conversion-efficiency',
    };
  },
};

/* ---------------- solar panel I–V curve ---------------- */

/**
 * The shape I = Isc·(1 − (V/Voc)^m)^p of an I–V curve whose maximum power point is at V = u·Voc,
 * I = i·Isc. With m ≥ 1 and 0 < p ≤ 1 the curve is concave and falling, so V·I has exactly one maximum,
 * there. Returns null when no such shape exists.
 */
export function ivShape(u: number, i: number): { m: number; p: number } | null {
  const shape = ivShapeParams(u, i);
  return shape && shape.m >= 1 && shape.p > 0 && shape.p <= 1 ? shape : null;
}

/** The (m, p) of ivShape() before the realism check, or null if none fits. */
export function ivShapeParams(u: number, i: number): { m: number; p: number } | null {
  // With k = p·m: u^m = 1/(1 + k) puts the maximum of V·I at u, and i = (k/(1 + k))^p. Solve for k.
  const lnI = (k: number) => (-Math.log(u) * k * Math.log(k / (1 + k))) / Math.log(1 + k);
  const target = Math.log(i);
  let lo = 1e-3;
  let hi = 1e7;
  if (lnI(lo) > target || lnI(hi) < target) return null;
  for (let it = 0; it < 200; it++) {
    const mid = Math.sqrt(lo * hi);
    if (lnI(mid) < target) lo = mid;
    else hi = mid;
  }
  const k = Math.sqrt(lo * hi);
  const m = Math.log(1 + k) / -Math.log(u);
  return { m, p: k / m };
}

interface SolarPanel {
  voc: number;
  isc: number;
  vmp: number;
  imp: number;
  /** Maximum power Vmp·Imp in hundredths of a watt (a whole number). */
  p100: number;
  m: number;
  p: number;
  /** Index into PANEL_CLASSES. */
  cls: number;
}

/** Panel sizes: a small 36-cell panel and common 60-cell and 72-cell modules, with realistic areas in m². */
const PANEL_CLASSES: Array<{ voc: number[]; isc: number[]; areas: number[] }> = [
  { voc: [21, 21.5, 22, 22.5], isc: [5, 5.5, 6, 6.5], areas: [0.6, 0.65, 0.7] },
  { voc: [37, 37.5, 38, 38.5, 39, 39.5, 40], isc: [8.5, 9, 9.5, 10], areas: [1.6, 1.65, 1.7] },
  { voc: [44, 45, 46, 47, 48], isc: [9, 9.5, 10, 10.5], areas: [1.9, 1.95, 2] },
];

let panelCache: SolarPanel[] | null = null;

/**
 * Realistic panels: Vmp is 78–85% of Voc (in 0.1 V steps) and Imp is 90–95% of Isc (in 0.1 A steps), and
 * a smooth concave curve has its maximum power point exactly there.
 */
export function solarPanels(): SolarPanel[] {
  if (panelCache) return panelCache;
  const out: SolarPanel[] = [];
  PANEL_CLASSES.forEach((c, cls) => {
    for (const voc of c.voc) {
      for (const isc of c.isc) {
        for (let v10 = Math.ceil(voc * 7.8); v10 <= Math.floor(voc * 8.5); v10++) {
          for (let i10 = Math.ceil(isc * 9); i10 <= Math.floor(isc * 9.5); i10++) {
            const shape = ivShape(v10 / 10 / voc, i10 / 10 / isc);
            if (shape) out.push({ voc, isc, vmp: v10 / 10, imp: i10 / 10, p100: v10 * i10, ...shape, cls });
          }
        }
      }
    }
  });
  panelCache = out;
  return out;
}

type SolarAsk = 'power' | 'ff' | 'eff';

const solarIv: VisualTemplate = {
  id: 'energy-solar-iv-curve',
  subject: 'energy',
  title: 'Solar panel I–V curve',
  description: 'The current–voltage curve of a solar panel with its short-circuit current, open-circuit voltage and maximum power point labeled; asks for the maximum power, the fill factor or the efficiency.',
  make(rng) {
    const ask = rng.pick<SolarAsk>(['power', 'power', 'ff', 'eff']);
    // Every panel works for the power question; the others need a whole-percent answer.
    const pool = solarPanels().flatMap((c) => {
      // power in watts = p100 / 100
      if (ask === 'power') return c.p100 % 100 === 0 ? [{ panel: c, area: 0, answer: c.p100 / 100 }] : [];
      if (ask === 'ff') {
        // fill factor = P / (Voc·Isc) = 100·(p100 / 100) / ((2Voc / 2)·(2Isc / 2)), in percent
        const den = Math.round(2 * c.voc) * Math.round(2 * c.isc);
        return (4 * c.p100) % den === 0 ? [{ panel: c, area: 0, answer: (4 * c.p100) / den }] : [];
      }
      // efficiency = P / (1000 W/m² · A) = (p100 / 100) / (10 · a100 / 100) = p100 / (10·a100), in percent
      return PANEL_CLASSES[c.cls]!.areas
        .filter((a) => c.p100 % (10 * Math.round(100 * a)) === 0)
        .map((a) => ({ panel: c, area: a, answer: c.p100 / (10 * Math.round(100 * a)) }));
    });
    // Choose the answer first, so that values shared by many panels do not crowd out the rest.
    const want = rng.pick([...new Set(pool.map((x) => x.answer))].sort((a, b) => a - b));
    const { panel, area, answer } = rng.pick(pool.filter((x) => x.answer === want));
    const { voc, isc, vmp, imp, m, p } = panel;
    const xMax = Math.ceil((voc * 1.32) / 5) * 5;
    const yMax = Math.ceil(isc * 1.3);
    const W = 480;
    const H = 340;
    const P = plane({ xMin: 0, xMax, yMin: 0, yMax, left: 66, top: 22, width: 380, height: 252 });
    const I = (v: number) => (v >= voc ? 0 : isc * Math.pow(1 - Math.pow(v / voc, m), p));
    const xStep = xMax > 30 ? 10 : 5;
    const yStep = yMax > 8 ? 2 : 1;
    const parts: string[] = [
      P.grid(xStep / 2, yStep / 2),
      rect(P.x(0), P.y(imp), P.x(vmp) - P.x(0), P.y(0) - P.y(imp), { stroke: 'none', fill: ACCENT, fillOpacity: SOFT * 1.4 }),
      P.axes({ tickLabels: false, edges: true, xTicks: xStep, yTicks: yStep }),
      tickLabels(P, { x: range(xStep, xMax, xStep), y: range(yStep, yMax, yStep), edges: true }),
      text(P.x(0) - 8, P.y(0) + 8, '0', { anchor: 'end', size: 13, baseline: 'hanging' }),
      text(P.left + P.width / 2, H - 12, 'Voltage (V)', { anchor: 'middle', size: 15 }),
      text(20, P.top + P.height / 2, 'Current (A)', { anchor: 'middle', size: 15, rotate: -90 }),
      line(P.x(vmp), P.y(imp), P.x(vmp), P.y(0), { width: 1.5, dash: '5 4', stroke: ACCENT }),
      line(P.x(vmp), P.y(imp), P.x(0), P.y(imp), { width: 1.5, dash: '5 4', stroke: ACCENT }),
      P.plot(I, { from: 0, to: voc, samples: 300, style: { width: 3 } }),
      dot(P.x(0), P.y(isc), 5),
      dot(P.x(voc), P.y(0), 5),
      dot(P.x(vmp), P.y(imp), 6, ACCENT),
      richText(P.x(0) + 10, P.y(isc) - 12, ['I', { sub: 'sc' }, ` = ${fmt(isc)} A`], { size: 15 }),
      richText(P.x(voc) + 8, P.y(0) - 14, ['V', { sub: 'oc' }, ` = ${fmt(voc)} V`], { size: 15 }),
      text(P.x(vmp) + 10, P.y(imp) - 30, 'Maximum power point', { size: 14 }),
      text(P.x(vmp) + 10, P.y(imp) - 12, `(${fmt(vmp)} V, ${fmt(imp)} A)`, { size: 15 }),
    ];
    const lead = 'The graph shows the current–voltage curve of a solar panel in full sunlight, with its maximum power point marked.';
    const stem =
      ask === 'power'
        ? `${lead} What is the panel's maximum power output, in watts?`
        : ask === 'ff'
          ? `${lead} What is the fill factor of this panel, as a percent?`
          : `${lead} The panel has an area of ${fmt(area)} square meters, and the sunlight delivers 1000 watts per square meter. What is the panel's efficiency at its maximum power point, as a percent?`;
    return {
      stem,
      format: 'short_answer',
      answer: String(answer),
      svg: figure(W, H, ...parts),
      alt: `A current–voltage curve for a solar panel: current in amperes against voltage in volts. The curve starts at the short-circuit current, ${fmt(isc)} A, stays nearly flat, then falls steeply to zero at the open-circuit voltage, ${fmt(voc)} V. The maximum power point is marked at ${fmt(vmp)} V and ${fmt(imp)} A.`,
      topic: 'energy.solar',
    };
  },
};

/* ---------------- household power use over time ---------------- */

type LoadAsk = 'energy' | 'cost' | 'average';

/** Energy in kilowatt-hours under a step graph of power (kW) over consecutive durations (h). */
export function stepEnergy(steps: ReadonlyArray<readonly [number, number]>): number {
  return sum(steps.map(([kw, h]) => kw * h));
}

const loadProfile: VisualTemplate = {
  id: 'energy-household-load',
  subject: 'energy',
  title: 'Energy from a power graph',
  description: 'A step graph of a household’s electric power over several hours; asks for the energy used in kilowatt-hours, its cost at a given price, or the average power.',
  make(rng) {
    const hours = rng.pick([6, 8, 8, 10]);
    // Power levels in half-kilowatts, durations in hours.
    const steps: Array<[number, number]> = [];
    let t = 0;
    let prev = -1;
    while (t < hours) {
      const d = Math.min(hours - t, rng.pick([1, 1, 2, 2, 3]));
      let level = prev;
      while (level === prev) level = rng.int(1, 8);
      steps.push([level / 2, d]);
      prev = level;
      t += d;
    }
    const energy2 = sum(steps.map(([kw, h]) => kw * 2 * h)); // in half-kilowatt-hours: a whole number
    let ask = rng.pick<LoadAsk>(['energy', 'energy', 'cost', 'average']);
    if (ask === 'average' && exactDecimal(energy2, 2 * hours, 2) === null) ask = 'energy';
    const price = rng.pick(energy2 % 2 === 0 ? [10, 11, 12, 13, 14, 15, 16, 18] : [10, 12, 14, 16, 18, 20]);
    let forms: AnswerForms;
    const lead = `The graph shows the electric power used by a household over ${hours} hours.`;
    let stem: string;
    switch (ask) {
      case 'energy':
        forms = decimalAnswer(energy2, 2);
        stem = `${lead} How much electrical energy, in kilowatt-hours, did the household use during this time?`;
        break;
      case 'cost':
        forms = { answer: String((energy2 * price) / 2) };
        stem = `${lead} If electricity costs ${price} cents per kilowatt-hour, what did this energy cost, in cents?`;
        break;
      default:
        forms = decimalAnswer(energy2, 2 * hours, 2);
        stem = `${lead} What was the household's average power over these ${hours} hours, in kilowatts?`;
    }
    const W = 480;
    const H = 320;
    const P = plane({ xMin: 0, xMax: hours, yMin: 0, yMax: 4.5, left: 62, top: 22, width: 392, height: 234 });
    const pts: Array<[number, number]> = [];
    let x = 0;
    for (const [kw, d] of steps) {
      pts.push([x, kw], [x + d, kw]);
      x += d;
    }
    const area = [[0, 0] as [number, number], ...pts, [hours, 0] as [number, number]];
    const parts: string[] = [
      P.grid(1, 0.5),
      path(`M ${area.map(([a, b]) => `${num(P.x(a))} ${num(P.y(b))}`).join(' L ')} Z`, { stroke: 'none', fill: ACCENT, fillOpacity: SOFT * 1.5 }),
      P.axes({ tickLabels: false, edges: true, xTicks: 1, yTicks: 0.5 }),
      tickLabels(P, { x: range(1, hours), y: range(0.5, 4.5, 0.5), edges: true }),
      text(P.x(0) - 8, P.y(0) + 8, '0', { anchor: 'end', size: 13, baseline: 'hanging' }),
      P.polyline(pts, { stroke: ACCENT, width: 3 }),
      text(P.left + P.width / 2, H - 12, 'Time (hours)', { anchor: 'middle', size: 15 }),
      text(18, P.top + P.height / 2, 'Power (kW)', { anchor: 'middle', size: 15, rotate: -90 }),
    ];
    return {
      stem,
      format: 'short_answer',
      ...forms,
      svg: figure(W, H, ...parts),
      alt: `A step graph of power in kilowatts against time in hours, from 0 to ${hours} hours: ${steps.map(([kw, d]) => `${fmt(kw)} kW for ${d} ${d === 1 ? 'hour' : 'hours'}`).join(', then ')}.`,
      topic: 'energy.data-units',
    };
  },
};

/* ---------------- electricity generation mix ---------------- */

interface Source {
  name: string;
  kind: 'fossil' | 'nuclear' | 'renewable';
  /** Typical weight in a mix, for realistic-looking charts. */
  weight: [number, number];
  /** How a stem names it: "from nuclear power". */
  phrase: string;
}

const SOURCES: Source[] = [
  { name: 'Coal', kind: 'fossil', weight: [4, 30], phrase: 'coal' },
  { name: 'Natural gas', kind: 'fossil', weight: [10, 40], phrase: 'natural gas' },
  { name: 'Petroleum', kind: 'fossil', weight: [1, 4], phrase: 'petroleum' },
  { name: 'Nuclear', kind: 'nuclear', weight: [8, 30], phrase: 'nuclear power' },
  { name: 'Hydropower', kind: 'renewable', weight: [3, 20], phrase: 'hydropower' },
  { name: 'Wind', kind: 'renewable', weight: [4, 20], phrase: 'wind' },
  { name: 'Solar', kind: 'renewable', weight: [2, 14], phrase: 'solar power' },
  { name: 'Geothermal', kind: 'renewable', weight: [1, 4], phrase: 'geothermal power' },
];

type MixAsk = 'fossil' | 'renewable' | 'single';

const generationMix: VisualTemplate = {
  id: 'energy-generation-mix',
  subject: 'energy',
  title: 'Electricity generation mix',
  description: 'A bar chart of one year’s electricity generation by source in a hypothetical region; asks what percent came from fossil fuels, from renewable sources or from one source.',
  make(rng) {
    // Coal, natural gas, nuclear, wind and solar always appear; one or two of the others join them.
    const extra = rng.sample(['Petroleum', 'Hydropower', 'Geothermal'], rng.int(1, 2));
    const chosen = SOURCES.filter((s) => ['Coal', 'Natural gas', 'Nuclear', 'Wind', 'Solar', ...extra].includes(s.name));
    // Whole-percent shares, at least 2 each, summing to 100.
    const raw = chosen.map((s) => rng.int(s.weight[0], s.weight[1]));
    const total = sum(raw);
    const shares = raw.map((w) => Math.max(2, Math.round((100 * w) / total)));
    let diff = 100 - sum(shares);
    while (diff !== 0) {
      const i = shares.indexOf(Math.max(...shares));
      const step = diff > 0 ? 1 : -1;
      shares[i]! += step;
      diff -= step;
    }
    const twh = rng.pick([100, 200, 300, 400, 500]);
    const values = shares.map((s) => (s * twh) / 100);
    const ask = rng.pick<MixAsk>(['fossil', 'fossil', 'renewable', 'renewable', 'single']);
    const pick = rng.int(0, chosen.length - 1);
    const shareOf = (f: (s: Source, i: number) => boolean) => sum(shares.filter((_, i) => f(chosen[i]!, i)));
    const lead = 'The bar chart shows the electricity generated in one year in a hypothetical region, by source.';
    let stem: string;
    let answer: number;
    switch (ask) {
      case 'fossil':
        answer = shareOf((s) => s.kind === 'fossil');
        stem = `${lead} What percent of the region's electricity was generated from fossil fuels?`;
        break;
      case 'renewable':
        answer = shareOf((s) => s.kind === 'renewable');
        stem = `${lead} What percent of the region's electricity was generated from renewable sources?`;
        break;
      default:
        answer = shares[pick]!;
        stem = `${lead} What percent of the region's electricity was generated from ${chosen[pick]!.phrase}?`;
    }

    const W = 480;
    const rowH = 38;
    const top = 50;
    const H = top + chosen.length * rowH + 16;
    const barX = 128;
    const maxV = Math.max(...values);
    const scale = 270 / maxV;
    const parts: string[] = [text(W / 2, 26, 'Electricity generated (TWh)', { anchor: 'middle', size: 16, weight: 'bold' })];
    chosen.forEach((s, i) => {
      const y = top + i * rowH;
      const w = values[i]! * scale;
      parts.push(
        text(barX - 10, y + 13, s.name, { anchor: 'end', baseline: 'middle', size: 15 }),
        // ACCENT only for the one source a question names; classifying the others is part of the question.
        rect(barX, y, w, 26, ask === 'single' && i === pick ? { width: 1.5, fill: ACCENT, fillOpacity: SOFT * 3 } : { width: 1.5, fill: INK, fillOpacity: SOFT * 1.2 }),
        text(barX + w + 8, y + 13, String(values[i]), { baseline: 'middle', size: 15 }),
      );
    });
    parts.push(line(barX, top - 8, barX, top + chosen.length * rowH - 4, { width: 2 }));
    return {
      stem,
      format: 'short_answer',
      answer: String(answer),
      svg: figure(W, Math.max(240, H), ...parts),
      alt: `A horizontal bar chart of electricity generated in one year, in terawatt-hours: ${chosen.map((s, i) => `${s.name.toLowerCase()} ${values[i]}`).join(', ')}.`,
      topic: 'energy.data-units',
    };
  },
};

export const ENERGY_TEMPLATES: VisualTemplate[] = [sankey, heatEngine, solarIv, loadProfile, generationMix];
