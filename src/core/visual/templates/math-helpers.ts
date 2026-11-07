/**
 * Helpers shared by the math and energy visual templates: numbers as printed in figures and
 * answers, text with subscripts, tick labels at a readable size, and label placement that keeps
 * labels inside the figure and clear of lines, points and each other.
 */
import { fractionText, reduce } from '../exact';
import { text, type Plane, type TextOptions } from '../svg';

/* ---------------- numbers ---------------- */

/** A number as printed in a figure or stem, with a true minus sign: "−3", "2.5". */
export function fmt(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  const s = String(Math.abs(r));
  return r < 0 ? `−${s}` : s;
}

/** A point as printed in a figure: "(−3, 2)". */
export function pointText(x: number, y: number): string {
  return `(${fmt(x)}, ${fmt(y)})`;
}

/** n/d as an exact decimal ("7.5", "-0.125") when it terminates within `places` decimals; otherwise null. */
export function exactDecimal(n: number, d: number, places = 3): string | null {
  const [a, b] = reduce(n, d);
  for (let p = 0; p <= places; p++) {
    const scaled = (a * 10 ** p) / b;
    if (!Number.isInteger(scaled)) continue;
    const digits = String(Math.abs(scaled)).padStart(p + 1, '0');
    const whole = digits.slice(0, digits.length - p);
    const frac = digits.slice(digits.length - p);
    return `${scaled < 0 ? '-' : ''}${whole}${p ? `.${frac}` : ''}`;
  }
  return null;
}

export interface AnswerForms {
  answer: string;
  accept?: string[];
}

/**
 * A math answer n/d: the reduced fraction as printed ("15/2"), with the exact decimal ("7.5") accepted
 * when it terminates, as DOE answer keys usually do. Whole numbers print as whole numbers.
 */
export function fractionAnswer(n: number, d = 1): AnswerForms {
  const answer = fractionText(n, d);
  const [, b] = reduce(n, d);
  if (b === 1) return { answer };
  const dec = exactDecimal(n, d);
  return dec ? { answer, accept: [dec] } : { answer };
}

/**
 * A measured quantity n/d (energy, power): printed as a decimal ("9.5"), as a team would say it, with
 * the reduced fraction accepted too. Use only when the decimal terminates within `places` decimals.
 */
export function decimalAnswer(n: number, d = 1, places = 3): AnswerForms {
  const dec = exactDecimal(n, d, places);
  if (dec === null) throw new Error(`decimalAnswer(${n}, ${d}): not a terminating decimal`);
  const frac = fractionText(n, d);
  return frac === dec ? { answer: dec } : { answer: dec, accept: [frac] };
}

/** Sum of a list of numbers. */
export function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/* ---------------- text ---------------- */

/** A run of text: plain, or a subscript ({ sub: 'H' } in T_H). */
export type Run = string | { sub: string };

/**
 * Text with subscripts, e.g. richText(x, y, ['T', { sub: 'H' }, ' = 600 K']). Subscripts are at least 13
 * units high and are lowered with dy, which every browser supports.
 */
export function richText(x: number, y: number, runs: readonly Run[], opts: TextOptions = {}): string {
  const size = opts.size ?? 16;
  const subSize = Math.max(13, Math.round(size * 0.8));
  const shift = Math.round(size * 0.3);
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let inner = '';
  let lowered = false;
  for (const r of runs) {
    if (typeof r === 'string') {
      inner += lowered ? `<tspan dy="${-shift}">${escape(r)}</tspan>` : escape(r);
      lowered = false;
    } else {
      inner += `<tspan dy="${lowered ? 0 : shift}" font-size="${subSize}">${escape(r.sub)}</tspan>`;
      lowered = true;
    }
  }
  const placeholder = 'RICHTEXTPLACEHOLDER';
  return text(x, y, placeholder, opts).replace(placeholder, inner);
}

/** Rough width of a text in viewBox units (system sans-serif fonts), for placing labels. */
export function textWidth(content: string, size = 16): number {
  let w = 0;
  for (const ch of content) {
    if (ch === ' ') w += 0.28;
    else if ('.,:;()|\'′'.includes(ch)) w += 0.3;
    else if ('ijlI1'.includes(ch)) w += 0.36;
    else if ('mwMW%'.includes(ch)) w += 0.85;
    else if (/[A-Z]/.test(ch)) w += 0.66;
    else w += 0.58;
  }
  return w * size;
}

/* ---------------- boxes and label placement ---------------- */

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LabelSpot {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  /** Vertical alignment as in TextOptions. */
  baseline: 'baseline' | 'middle' | 'hanging';
}

/** The box a text covers (approximately), padded by `pad` on every side. */
export function textBox(spot: LabelSpot, content: string, size = 16, pad = 2): Box {
  const w = textWidth(content, size);
  const x1 = spot.anchor === 'start' ? spot.x : spot.anchor === 'middle' ? spot.x - w / 2 : spot.x - w;
  const top = spot.baseline === 'baseline' ? spot.y - size * 0.74 : spot.baseline === 'middle' ? spot.y - size * 0.5 : spot.y;
  return { x1: x1 - pad, y1: top - pad, x2: x1 + w + pad, y2: top + size * (spot.baseline === 'baseline' ? 0.98 : 1) + pad };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
}

export function boxInside(b: Box, width: number, height: number, margin = 2): boolean {
  return b.x1 >= margin && b.y1 >= margin && b.x2 <= width - margin && b.y2 <= height - margin;
}

/** True when segment (x1, y1)–(x2, y2) passes through box b. */
export function segmentHitsBox(x1: number, y1: number, x2: number, y2: number, b: Box): boolean {
  // Liang–Barsky clipping.
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const edges: Array<[number, number]> = [
    [-dx, x1 - b.x1],
    [dx, b.x2 - x1],
    [-dy, y1 - b.y1],
    [dy, b.y2 - y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return true;
}

/** Things a label must stay clear of. */
export interface Obstacles {
  boxes: Box[];
  segments: Array<readonly [number, number, number, number]>;
}

export function emptyObstacles(): Obstacles {
  return { boxes: [], segments: [] };
}

/** Add a polyline (or closed polygon) to the obstacles as segments. */
export function addPath(obs: Obstacles, pts: ReadonlyArray<readonly [number, number]>, closed = false): void {
  for (let i = 0; i + 1 < pts.length; i++) obs.segments.push([pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]]);
  if (closed && pts.length > 2) obs.segments.push([pts[pts.length - 1]![0], pts[pts.length - 1]![1], pts[0]![0], pts[0]![1]]);
}

/** A point (a dot) as an obstacle: a small box around it. */
export function addDot(obs: Obstacles, x: number, y: number, r = 6): void {
  obs.boxes.push({ x1: x - r, y1: y - r, x2: x + r, y2: y + r });
}

/**
 * The first spot (in order of preference) where the label fits inside the figure and clear of the
 * obstacles, or null. The chosen label's box is added to the obstacles, so later labels avoid it.
 */
export function placeLabel(
  content: string,
  spots: readonly LabelSpot[],
  obs: Obstacles,
  fig: { width: number; height: number },
  size = 16,
): LabelSpot | null {
  for (const s of spots) {
    const b = textBox(s, content, size);
    if (!boxInside(b, fig.width, fig.height)) continue;
    if (obs.boxes.some((o) => boxesOverlap(o, b))) continue;
    if (obs.segments.some(([x1, y1, x2, y2]) => segmentHitsBox(x1, y1, x2, y2, b))) continue;
    obs.boxes.push(b);
    return s;
  }
  return null;
}

/**
 * Spots around a point (x, y), the ones in direction (dx, dy) first (screen coordinates): good for
 * labeling a vertex away from the middle of its figure.
 */
export function spotsAround(x: number, y: number, dx: number, dy: number, gap = 9): LabelSpot[] {
  // Exact directions and plain arithmetic (no Math.cos), with ties kept in this order by the stable sort,
  // so every browser ranks the spots the same way and a seed gives the same figure everywhere.
  const dirs: Array<[number, number]> = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const score = ([cx, cy]: [number, number]) => (cx * dx + cy * dy) * (cx !== 0 && cy !== 0 ? Math.SQRT1_2 : 1);
  dirs.sort((a, b) => score(b) - score(a));
  return dirs.map(([cx, cy]): LabelSpot => {
    const anchor = cx > 0 ? 'start' : cx < 0 ? 'end' : 'middle';
    const baseline = cy > 0 ? 'hanging' : cy < 0 ? 'baseline' : 'middle';
    // A label above its point needs a little more room for the descent below its baseline.
    const ox = anchor === 'start' ? gap : anchor === 'end' ? -gap : 0;
    const oy = baseline === 'hanging' ? gap : baseline === 'baseline' ? -gap - 4 : 0;
    return { x: x + ox, y: y + oy, anchor, baseline };
  });
}

/** Render a label at a spot. */
export function labelAt(spot: LabelSpot, content: string, opts: TextOptions = {}): string {
  return text(spot.x, spot.y, content, { ...opts, anchor: spot.anchor, baseline: spot.baseline });
}

/* ---------------- axes ---------------- */

/**
 * Tick labels for a plane, 13 units high (the plane's own are smaller than figures allow). Draw the
 * axes with tickLabels: false and add these. Positions follow Plane.axes().
 */
export function tickLabels(
  p: Plane,
  opts: { x?: readonly number[]; y?: readonly number[]; edges?: boolean; size?: number; format?: (v: number) => string },
): string {
  const size = opts.size ?? 13;
  const f = opts.format ?? fmt;
  const yAxisAt = opts.edges || p.xMin > 0 || p.xMax < 0 ? p.xMin : 0;
  const xAxisAt = opts.edges || p.yMin > 0 || p.yMax < 0 ? p.yMin : 0;
  const ax = p.x(yAxisAt);
  const ay = p.y(xAxisAt);
  const parts: string[] = [];
  for (const t of opts.x ?? []) parts.push(text(p.x(t), ay + 8, f(t), { anchor: 'middle', size, baseline: 'hanging' }));
  for (const t of opts.y ?? []) parts.push(text(ax - 8, p.y(t), f(t), { anchor: 'end', size, baseline: 'middle' }));
  return parts.join('');
}

/** Numbers from `from` to `to` in steps of `step`, without floating-point drift. */
export function range(from: number, to: number, step = 1): number[] {
  const out: number[] = [];
  const n = Math.floor((to - from) / step + 1e-9);
  for (let i = 0; i <= n; i++) out.push(Math.round((from + i * step) * 1e6) / 1e6);
  return out;
}
