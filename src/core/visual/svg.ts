/**
 * Building blocks for generated figures. A figure is an SVG string with a viewBox and no fixed size;
 * the page scales it to fit (a phone, the console on a projector, a printed worksheet).
 *
 * Colors: lines and text use currentColor, so a figure follows the page's text color in light and
 * dark mode and prints in black. ACCENT marks the one thing a question points at (a highlighted cell,
 * the star in question). Shaded regions use currentColor at low opacity. Labels drawn over lines get
 * a halo in the page's background color so they stay readable.
 */

export const INK = 'currentColor';
export const ACCENT = 'var(--figure-accent, #2a78d6)';
/** Background color, for label halos and white-filled shapes. */
export const PAPER = 'var(--figure-bg, #ffffff)';
/** Fill opacity for shaded regions. */
export const SOFT = 0.14;

export interface Style {
  /** Stroke color; INK by default. Use 'none' for no outline. */
  stroke?: string;
  /** Stroke width in viewBox units (default 2). */
  width?: number;
  /** Fill color; 'none' by default. */
  fill?: string;
  fillOpacity?: number;
  /** Dash pattern, e.g. "6 4". */
  dash?: string;
  opacity?: number;
  cap?: 'round' | 'butt' | 'square';
  join?: 'round' | 'miter' | 'bevel';
}

export interface TextOptions {
  anchor?: 'start' | 'middle' | 'end';
  /** Font size in viewBox units (default 16). */
  size?: number;
  weight?: 'normal' | 'bold';
  italic?: boolean;
  fill?: string;
  /** Vertical alignment: 'middle' centers the text on y (default: y is the baseline). */
  baseline?: 'baseline' | 'middle' | 'hanging';
  /** Rotation in degrees about (x, y). */
  rotate?: number;
  /** Draw a halo in the background color behind the text (default true). */
  halo?: boolean;
}

/** Escape text for SVG. */
export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A coordinate for the markup: at most 2 decimals, never "-0". */
export function num(x: number): string {
  if (!Number.isFinite(x)) throw new Error(`svg: coordinate is ${x}`);
  const r = Math.round(x * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function attrs(style: Style | undefined, defaults: Style): string {
  const s = { ...defaults, ...style };
  const out: string[] = [];
  out.push(`stroke="${s.stroke ?? INK}"`);
  if ((s.stroke ?? INK) !== 'none') out.push(`stroke-width="${num(s.width ?? 2)}"`);
  out.push(`fill="${s.fill ?? 'none'}"`);
  if (s.fillOpacity !== undefined) out.push(`fill-opacity="${num(s.fillOpacity)}"`);
  if (s.dash) out.push(`stroke-dasharray="${s.dash}"`);
  if (s.opacity !== undefined) out.push(`opacity="${num(s.opacity)}"`);
  if (s.cap) out.push(`stroke-linecap="${s.cap}"`);
  if (s.join) out.push(`stroke-linejoin="${s.join}"`);
  return out.join(' ');
}

/** The whole figure. Width and height set the aspect ratio (about 480 wide works well). */
export function figure(width: number, height: number, ...parts: string[]): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(width)} ${num(height)}" ` +
    `font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="16">${parts.join('')}</svg>`
  );
}

export function group(parts: string[], transform?: string): string {
  return `<g${transform ? ` transform="${transform}"` : ''}>${parts.join('')}</g>`;
}

export function line(x1: number, y1: number, x2: number, y2: number, style?: Style): string {
  return `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" ${attrs(style, { cap: 'round' })}/>`;
}

export function polyline(points: ReadonlyArray<readonly [number, number]>, style?: Style): string {
  return `<polyline points="${points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ')}" ${attrs(style, { join: 'round', cap: 'round' })}/>`;
}

export function polygon(points: ReadonlyArray<readonly [number, number]>, style?: Style): string {
  return `<polygon points="${points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ')}" ${attrs(style, { join: 'round' })}/>`;
}

export function circle(cx: number, cy: number, r: number, style?: Style): string {
  return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" ${attrs(style, {})}/>`;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, style?: Style): string {
  return `<ellipse cx="${num(cx)}" cy="${num(cy)}" rx="${num(rx)}" ry="${num(ry)}" ${attrs(style, {})}/>`;
}

export function rect(x: number, y: number, w: number, h: number, style?: Style & { rx?: number }): string {
  const rx = style?.rx ? ` rx="${num(style.rx)}"` : '';
  return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"${rx} ${attrs(style, {})}/>`;
}

/** A path from SVG path data (build the "d" string with num() for coordinates). */
export function path(d: string, style?: Style): string {
  return `<path d="${d}" ${attrs(style, { join: 'round', cap: 'round' })}/>`;
}

export function text(x: number, y: number, content: string, opts: TextOptions = {}): string {
  const a: string[] = [`x="${num(x)}"`, `y="${num(y)}"`];
  if (opts.anchor && opts.anchor !== 'start') a.push(`text-anchor="${opts.anchor}"`);
  if (opts.size) a.push(`font-size="${num(opts.size)}"`);
  if (opts.weight === 'bold') a.push('font-weight="bold"');
  if (opts.italic) a.push('font-style="italic"');
  if (opts.baseline === 'middle') a.push('dominant-baseline="central"');
  if (opts.baseline === 'hanging') a.push('dominant-baseline="hanging"');
  if (opts.rotate) a.push(`transform="rotate(${num(opts.rotate)} ${num(x)} ${num(y)})"`);
  a.push(`fill="${opts.fill ?? INK}"`);
  if (opts.halo !== false) a.push(`stroke="${PAPER}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"`);
  return `<text ${a.join(' ')}>${esc(content)}</text>`;
}

/** A filled dot, e.g. a point on a graph. */
export function dot(x: number, y: number, r = 4, color: string = INK): string {
  return circle(x, y, r, { stroke: 'none', fill: color });
}

/** An arrowhead with its tip at (x2, y2), pointing away from (x1, y1). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size = 10, color: string = INK): string {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  const p1: [number, number] = [x2 - size * Math.cos(ang - spread), y2 - size * Math.sin(ang - spread)];
  const p2: [number, number] = [x2 - size * Math.cos(ang + spread), y2 - size * Math.sin(ang + spread)];
  return polygon([[x2, y2], p1, p2], { stroke: 'none', fill: color });
}

/** A line with an arrowhead at its end (and at its start too with `both`). */
export function arrow(x1: number, y1: number, x2: number, y2: number, style: Style & { head?: number; both?: boolean } = {}): string {
  const head = style.head ?? 10;
  const color = style.stroke ?? INK;
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len === 0) return '';
  // Stop the line short of the tip so a thick line doesn't poke through the head.
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const sx = style.both ? x1 + ux * head * 0.6 : x1;
  const sy = style.both ? y1 + uy * head * 0.6 : y1;
  const parts = [line(sx, sy, x2 - ux * head * 0.6, y2 - uy * head * 0.6, style), arrowHead(x1, y1, x2, y2, head, color)];
  if (style.both) parts.push(arrowHead(x2, y2, x1, y1, head, color));
  return parts.join('');
}

/**
 * An arc for marking an angle at (cx, cy), from `fromDeg` to `toDeg` counterclockwise, with angles
 * measured as in math (0° along +x, counterclockwise positive, y up on screen).
 */
export function angleArc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number, style?: Style): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(fromDeg));
  const y1 = cy - r * Math.sin(rad(fromDeg));
  const x2 = cx + r * Math.cos(rad(toDeg));
  const y2 = cy - r * Math.sin(rad(toDeg));
  let sweep = toDeg - fromDeg;
  while (sweep < 0) sweep += 360;
  const large = sweep > 180 ? 1 : 0;
  return path(`M ${num(x1)} ${num(y1)} A ${num(r)} ${num(r)} 0 ${large} 0 ${num(x2)} ${num(y2)}`, { width: 1.5, ...style });
}

/** The small square marking a right angle at (x, y) between unit directions (ux, uy) and (vx, vy) in screen coordinates. */
export function rightAngleMark(x: number, y: number, ux: number, uy: number, vx: number, vy: number, size = 12, style?: Style): string {
  return polyline(
    [
      [x + ux * size, y + uy * size],
      [x + ux * size + vx * size, y + uy * size + vy * size],
      [x + vx * size, y + vy * size],
    ],
    { width: 1.5, ...style },
  );
}

/** Tick marks across the middle of a segment, to show equal lengths (count 1–3). */
export function equalMarks(x1: number, y1: number, x2: number, y2: number, count = 1, size = 7): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * 5;
    const cx = mx + ux * off;
    const cy = my + uy * off;
    out.push(line(cx - uy * size, cy + ux * size, cx + uy * size, cy - ux * size, { width: 1.5 }));
  }
  return out.join('');
}

/* ---------------- a coordinate plane ---------------- */

export interface PlaneOptions {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Where the plotting area sits in the figure, in viewBox units. */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AxesOptions {
  xLabel?: string;
  yLabel?: string;
  /** Spacing of tick marks in data units (default 1), or explicit tick positions. */
  xTicks?: number | number[];
  yTicks?: number | number[];
  /** Print numbers at the ticks (default true). */
  tickLabels?: boolean;
  /** Arrowheads at the positive ends (default true). */
  arrows?: boolean;
  /** Draw the axes along the plot's edges instead of through the origin (for graphs that start at 0, like v–t graphs). */
  edges?: boolean;
}

export interface Plane extends PlaneOptions {
  /** Data x → figure x. */
  x(v: number): number;
  /** Data y → figure y (y grows upward). */
  y(v: number): number;
  /** Light grid lines every `step` data units. */
  grid(step?: number, yStep?: number): string;
  axes(opts?: AxesOptions): string;
  /** The graph of f over [from, to] (default the whole plane), broken where f leaves the plane or is undefined. */
  plot(f: (x: number) => number, opts?: { from?: number; to?: number; samples?: number; style?: Style }): string;
  /** A polyline through data points. */
  polyline(points: ReadonlyArray<readonly [number, number]>, style?: Style): string;
  /** A dot at a data point, with an optional label next to it. */
  point(x: number, y: number, opts?: { label?: string; color?: string; r?: number; dx?: number; dy?: number; anchor?: TextOptions['anchor'] }): string;
}

function ticksFor(min: number, max: number, spec: number | number[] | undefined): number[] {
  if (Array.isArray(spec)) return spec.filter((t) => t >= min && t <= max);
  const step = spec ?? 1;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

export function plane(o: PlaneOptions): Plane {
  const sx = o.width / (o.xMax - o.xMin);
  const sy = o.height / (o.yMax - o.yMin);
  const X = (v: number) => o.left + (v - o.xMin) * sx;
  const Y = (v: number) => o.top + (o.yMax - v) * sy;
  const p: Plane = {
    ...o,
    x: X,
    y: Y,
    grid(step = 1, yStep = step) {
      const parts: string[] = [];
      for (const t of ticksFor(o.xMin, o.xMax, step)) parts.push(line(X(t), o.top, X(t), o.top + o.height, { width: 1, opacity: 0.18 }));
      for (const t of ticksFor(o.yMin, o.yMax, yStep)) parts.push(line(o.left, Y(t), o.left + o.width, Y(t), { width: 1, opacity: 0.18 }));
      return parts.join('');
    },
    axes(a = {}) {
      const parts: string[] = [];
      const yAxisAt = a.edges || o.xMin > 0 || o.xMax < 0 ? o.xMin : 0;
      const xAxisAt = a.edges || o.yMin > 0 || o.yMax < 0 ? o.yMin : 0;
      const ax = X(yAxisAt);
      const ay = Y(xAxisAt);
      const arrows = a.arrows !== false;
      const right = o.left + o.width + (arrows ? 12 : 0);
      const top = o.top - (arrows ? 12 : 0);
      parts.push(arrows ? arrow(o.left, ay, right, ay, { width: 1.5, head: 9 }) : line(o.left, ay, right, ay, { width: 1.5 }));
      parts.push(arrows ? arrow(ax, o.top + o.height, ax, top, { width: 1.5, head: 9 }) : line(ax, o.top + o.height, ax, top, { width: 1.5 }));
      const labels = a.tickLabels !== false;
      for (const t of ticksFor(o.xMin, o.xMax, a.xTicks)) {
        if (t === yAxisAt && !a.edges) continue;
        parts.push(line(X(t), ay - 4, X(t), ay + 4, { width: 1.5 }));
        if (labels) parts.push(text(X(t), ay + 18, String(t), { anchor: 'middle', size: 12 }));
      }
      for (const t of ticksFor(o.yMin, o.yMax, a.yTicks)) {
        if (t === xAxisAt && !a.edges) continue;
        parts.push(line(ax - 4, Y(t), ax + 4, Y(t), { width: 1.5 }));
        if (labels) parts.push(text(ax - 8, Y(t), String(t), { anchor: 'end', size: 12, baseline: 'middle' }));
      }
      if (a.xLabel) parts.push(text(right, ay - 10, a.xLabel, { anchor: 'end', size: 14, italic: true }));
      if (a.yLabel) parts.push(text(ax + 10, top + 4, a.yLabel, { size: 14, italic: true, baseline: 'hanging' }));
      return parts.join('');
    },
    plot(f, opts = {}) {
      const from = opts.from ?? o.xMin;
      const to = opts.to ?? o.xMax;
      const n = opts.samples ?? 240;
      const margin = (o.yMax - o.yMin) * 0.02;
      const runs: Array<Array<[number, number]>> = [];
      let run: Array<[number, number]> = [];
      for (let i = 0; i <= n; i++) {
        const xv = from + ((to - from) * i) / n;
        const yv = f(xv);
        if (!Number.isFinite(yv) || yv < o.yMin - margin || yv > o.yMax + margin) {
          if (run.length > 1) runs.push(run);
          run = [];
          continue;
        }
        run.push([X(xv), Y(yv)]);
      }
      if (run.length > 1) runs.push(run);
      return runs.map((r) => polyline(r, { width: 2.5, ...opts.style })).join('');
    },
    polyline(points, style) {
      return polyline(
        points.map(([a, b]) => [X(a), Y(b)] as [number, number]),
        { width: 2.5, ...style },
      );
    },
    point(xv, yv, opts = {}) {
      const parts = [dot(X(xv), Y(yv), opts.r ?? 4.5, opts.color ?? INK)];
      if (opts.label) parts.push(text(X(xv) + (opts.dx ?? 8), Y(yv) + (opts.dy ?? -8), opts.label, { size: 14, anchor: opts.anchor }));
      return parts.join('');
    },
  };
  return p;
}
