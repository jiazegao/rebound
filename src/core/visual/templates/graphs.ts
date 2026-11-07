/**
 * Framed axes for the physics and chemistry graph templates: axis lines along the plot's left and
 * bottom edges, tick marks, tick labels at 13 units and axis titles
 * outside the plotting area, so titles never sit on top of the data.
 */
import { line, text, type Plane } from '../svg';

export interface FramedAxesOptions {
  /** Tick marks along the x axis (data units). */
  xTicks?: readonly number[];
  /** Ticks that get a printed number (default: every tick). */
  xLabels?: readonly number[];
  yTicks?: readonly number[];
  yLabels?: readonly number[];
  /** Axis titles, e.g. "Time (s)". */
  xTitle?: string;
  yTitle?: string;
  /** Format a tick number (default String). */
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  /** x of the rotated y-axis title's baseline (default 20). */
  yTitleX?: number;
}

export function framedAxes(p: Plane, o: FramedAxesOptions): string {
  const parts: string[] = [];
  const bottom = p.top + p.height;
  const fx = o.formatX ?? String;
  const fy = o.formatY ?? String;
  parts.push(line(p.left, bottom, p.left + p.width, bottom, { width: 1.6, cap: 'square' }));
  parts.push(line(p.left, p.top, p.left, bottom, { width: 1.6, cap: 'square' }));
  for (const t of o.xTicks ?? []) parts.push(line(p.x(t), bottom, p.x(t), bottom + 5, { width: 1.5 }));
  for (const t of o.xLabels ?? o.xTicks ?? []) parts.push(text(p.x(t), bottom + 20, fx(t), { anchor: 'middle', size: 13 }));
  for (const t of o.yTicks ?? []) parts.push(line(p.left - 5, p.y(t), p.left, p.y(t), { width: 1.5 }));
  for (const t of o.yLabels ?? o.yTicks ?? []) parts.push(text(p.left - 9, p.y(t), fy(t), { anchor: 'end', size: 13, baseline: 'middle' }));
  if (o.xTitle) parts.push(text(p.left + p.width / 2, bottom + 42, o.xTitle, { anchor: 'middle', size: 14 }));
  if (o.yTitle) parts.push(text(o.yTitleX ?? 20, p.top + p.height / 2, o.yTitle, { anchor: 'middle', size: 14, rotate: -90 }));
  return parts.join('');
}

/** Whole numbers from `from` to `to` in steps of `step`. */
export function steps(from: number, to: number, step = 1): number[] {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
