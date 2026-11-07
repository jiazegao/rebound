/**
 * Small helpers shared by the earth and space and the biology visual templates.
 */
import { INK, num, path } from '../svg';

/** A whole number with thousands separators, as DOE prints them: 12,500. */
export function commas(n: number): string {
  const s = String(Math.round(Math.abs(n)));
  const out = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${out}` : out;
}

/** A rough width of text in the figure's sans-serif font, for laying out boxes and labels. */
export function textWidth(s: string, size = 16): number {
  let w = 0;
  for (const ch of s) {
    if (/[ilI.,:;'′|!1]/.test(ch)) w += 0.3;
    else if (/[mwMW]/.test(ch)) w += 0.85;
    else if (/[A-Z0-9]/.test(ch)) w += 0.64;
    else if (ch === ' ') w += 0.28;
    else w += 0.53;
  }
  return w * size;
}

/** Fixed colors for sunlit bodies: they mean "lit" and "dark" in both light and dark mode. */
export const SUN_FILL = '#f4b63f';
export const LIT_FILL = '#f6e08f';
export const NIGHT_FILL = '#3a4049';

/**
 * A sphere lit from one direction: the half facing the light is LIT_FILL, the other half NIGHT_FILL.
 * `lightDeg` is the direction toward the light as a math angle (0° along +x, counterclockwise, y up).
 */
export function litDisc(cx: number, cy: number, r: number, lightDeg: number, outline: { stroke?: string; width?: number } = {}): string {
  const a = (lightDeg * Math.PI) / 180;
  // The terminator is the diameter perpendicular to the light; its ends in screen coordinates (y down):
  const tx = Math.sin(a) * r;
  const ty = Math.cos(a) * r;
  const p1 = `${num(cx + tx)} ${num(cy + ty)}`;
  const p2 = `${num(cx - tx)} ${num(cy - ty)}`;
  const lit = path(`M ${p1} A ${num(r)} ${num(r)} 0 0 0 ${p2} Z`, { stroke: 'none', fill: LIT_FILL });
  const dark = path(`M ${p1} A ${num(r)} ${num(r)} 0 0 1 ${p2} Z`, { stroke: 'none', fill: NIGHT_FILL });
  const ring = `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" stroke="${outline.stroke ?? INK}" stroke-width="${num(outline.width ?? 1.5)}" fill="none"/>`;
  return lit + dark + ring;
}

/* ---------------- convex polygons ---------------- */

export type Pt = [number, number];

/** The part of a convex polygon where the linear function f is ≥ 0 (Sutherland–Hodgman against one half-plane). */
export function clipHalf(poly: readonly Pt[], f: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/** A convex polygon clipped to the rectangle [x0, x1] × [y0, y1]. */
export function clipRect(poly: readonly Pt[], x0: number, y0: number, x1: number, y1: number): Pt[] {
  let p: Pt[] = [...poly];
  p = clipHalf(p, (q) => q[0] - x0);
  p = clipHalf(p, (q) => x1 - q[0]);
  p = clipHalf(p, (q) => q[1] - y0);
  p = clipHalf(p, (q) => y1 - q[1]);
  return p;
}

export function polygonArea(poly: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/** True when p is inside the convex polygon (either winding). */
export function insideConvex(poly: readonly Pt[], p: Pt): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Distance from p to the segment ab. */
export function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Distance from p to a polygon's boundary. */
export function edgeDistance(poly: readonly Pt[], p: Pt): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segmentDistance(p, poly[i]!, poly[(i + 1) % poly.length]!));
  return d;
}

export function polygonPoints(poly: readonly Pt[]): string {
  return poly.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
}
