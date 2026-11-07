/**
 * Circuit symbols for the physics visual templates (resistors, cells, junctions, terminals) and exact
 * rational arithmetic for series and parallel combinations.
 */
import { reduce } from '../exact';
import { circle, dot, INK, line, PAPER, polyline } from '../svg';

/** A resistor from (x1, y1) to (x2, y2): straight leads and a zigzag of `body` units in the middle. */
export function resistor(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { color?: string; body?: number; amp?: number } = {},
): string {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const body = Math.min(opts.body ?? 40, len - 8);
  const amp = opts.amp ?? 9;
  const s = (len - body) / 2;
  const at = (t: number, off = 0): [number, number] => [x1 + ux * t - uy * off, y1 + uy * t + ux * off];
  const teeth = 6;
  const zig: Array<[number, number]> = [at(s)];
  for (let i = 0; i < teeth; i++) zig.push(at(s + (body * (i + 0.5)) / teeth, i % 2 === 0 ? -amp : amp));
  zig.push(at(s + body));
  const color = opts.color ?? INK;
  const [ax, ay] = at(s);
  const [bx, by] = at(s + body);
  return [line(x1, y1, ax, ay), line(bx, by, x2, y2), polyline(zig, { stroke: color, width: color === INK ? 2 : 3.2 })].join('');
}

/** A cell (battery) on the segment from (x1, y1) to (x2, y2); the long (+) plate faces (x1, y1). */
export function cell(x1: number, y1: number, x2: number, y2: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const nx = -uy;
  const ny = ux;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const gap = 5;
  const [px, py] = [mx - ux * gap, my - uy * gap];
  const [qx, qy] = [mx + ux * gap, my + uy * gap];
  return [
    line(x1, y1, px, py),
    line(qx, qy, x2, y2),
    line(px - nx * 18, py - ny * 18, px + nx * 18, py + ny * 18, { width: 2.2, cap: 'butt' }),
    line(qx - nx * 9, qy - ny * 9, qx + nx * 9, qy + ny * 9, { width: 5, cap: 'butt' }),
  ].join('');
}

/** A junction dot where three or more wires meet. */
export function junction(x: number, y: number): string {
  return dot(x, y, 4.5);
}

/** An open terminal (a small hollow circle). */
export function terminal(x: number, y: number): string {
  return circle(x, y, 5.5, { fill: PAPER, width: 2 });
}

/* ---------------- exact fractions ---------------- */

/** A fraction [numerator, denominator] in lowest terms with a positive denominator. */
export type Ratio = readonly [number, number];

export function ratio(n: number, d = 1): Ratio {
  return reduce(n, d);
}

export function addR(a: Ratio, b: Ratio): Ratio {
  return reduce(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
}

export function subR(a: Ratio, b: Ratio): Ratio {
  return reduce(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
}

export function mulR(a: Ratio, b: Ratio): Ratio {
  return reduce(a[0] * b[0], a[1] * b[1]);
}

export function divR(a: Ratio, b: Ratio): Ratio {
  return reduce(a[0] * b[1], a[1] * b[0]);
}

/** Resistors in series: the sum. */
export function seriesR(rs: readonly Ratio[]): Ratio {
  return rs.reduce<Ratio>((acc, r) => addR(acc, r), [0, 1]);
}

/** Resistors in parallel: the reciprocal of the sum of reciprocals. */
export function parallelR(rs: readonly Ratio[]): Ratio {
  return divR([1, 1], rs.reduce<Ratio>((acc, r) => addR(acc, divR([1, 1], r)), [0, 1]));
}
