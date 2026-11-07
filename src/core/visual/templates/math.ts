/**
 * Generated visual bonuses: math.
 * Each template draws a figure (svg.ts) and asks a bonus question about it with an exact answer.
 * See src/core/visual/README.md for the rules every template follows.
 */
import { multipleChoice } from '../choices';
import { piText, radicalText, reduce } from '../exact';
import type { Rng } from '../rng';
import { ACCENT, angleArc, arrow, circle, dot, figure, INK, line, num, PAPER, path, plane, polygon, rect, rightAngleMark, SOFT, text } from '../svg';
import type { VisualTemplate } from '../types';
import {
  addDot,
  addPath,
  emptyObstacles,
  fmt,
  fractionAnswer,
  labelAt,
  placeLabel,
  pointText,
  spotsAround,
  sum,
  textWidth,
  tickLabels,
  type AnswerForms,
  type LabelSpot,
  type Obstacles,
} from './math-helpers';

/** A circle with a shaded sector; the radius and central angle are labeled only in the figure. */
const sector: VisualTemplate = {
  id: 'math-sector',
  subject: 'math',
  title: 'Sector of a circle',
  description: 'A circle with a shaded sector, its radius and central angle labeled; asks for the arc length or the sector area in terms of π.',
  make(rng) {
    const r = rng.int(2, 12);
    const deg = rng.pick([30, 40, 45, 60, 72, 80, 90, 100, 120, 135, 150, 160, 200, 210, 225, 240, 270, 300]);
    const askArea = rng.chance(0.5);
    const answer = askArea ? piText(r * r * deg, 360) : piText(r * deg, 180);
    const rot = rng.int(0, 11) * 30;

    const cx = 240;
    const cy = 180;
    const R = 130;
    const rad = (d: number) => (d * Math.PI) / 180;
    const px = (d: number) => cx + R * Math.cos(rad(d));
    const py = (d: number) => cy - R * Math.sin(rad(d));
    const a0 = rot;
    const a1 = rot + deg;
    const large = deg > 180 ? 1 : 0;
    const sectorPath = `M ${num(cx)} ${num(cy)} L ${num(px(a0))} ${num(py(a0))} A ${R} ${R} 0 ${large} 0 ${num(px(a1))} ${num(py(a1))} Z`;
    // The radius label sits beside the first radius; the angle label inside the arc's bisector.
    const mid = rad(a0);
    const lx = cx + (R / 2) * Math.cos(mid) + 14 * Math.sin(mid);
    const ly = cy - (R / 2) * Math.sin(mid) + 14 * Math.cos(mid);
    const bis = rad(a0 + deg / 2);
    const svg = figure(
      480,
      360,
      circle(cx, cy, R, { width: 2 }),
      path(sectorPath, { stroke: ACCENT, width: 2.5, fill: ACCENT, fillOpacity: SOFT * 1.6 }),
      line(cx, cy, px(a0), py(a0), { width: 2.5 }),
      line(cx, cy, px(a1), py(a1), { width: 2.5 }),
      angleArc(cx, cy, 30, a0, a1),
      dot(cx, cy, 4),
      text(lx, ly, String(r), { anchor: 'middle', baseline: 'middle', size: 18 }),
      text(cx + 52 * Math.cos(bis), cy - 52 * Math.sin(bis), `${deg}°`, { anchor: 'middle', baseline: 'middle', size: 16 }),
    );
    return {
      stem: askArea
        ? 'In the figure, the shaded region is a sector of a circle. In terms of π, what is the area of the shaded sector?'
        : 'In the figure, the shaded region is a sector of a circle. In terms of π, what is the length of the arc that bounds the shaded sector?',
      format: 'short_answer',
      answer,
      svg,
      alt: `A circle with one radius labeled and a shaded sector whose central angle is labeled in degrees.`,
      topic: 'math.geometry',
    };
  },
};

/* ---------------- shared geometry ---------------- */

type Pt = [number, number];

/** Twice the signed area of a polygon (shoelace formula); positive when the vertices run counterclockwise. */
export function shoelace2(pts: ReadonlyArray<readonly [number, number]>): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    s += x1 * y2 - x2 * y1;
  }
  return s;
}

/** The angle at vertex b between rays b→a and b→c, in degrees. */
function angleDeg(a: readonly [number, number], b: readonly [number, number], c: readonly [number, number]): number {
  const v1x = a[0] - b[0];
  const v1y = a[1] - b[1];
  const v2x = c[0] - b[0];
  const v2y = c[1] - b[1];
  const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Direction of the screen vector (dx, dy) as a math angle in degrees (counterclockwise from +x, y up). */
function screenAngle(dx: number, dy: number): number {
  return (Math.atan2(-dy, dx) * 180) / Math.PI;
}

/**
 * The marked angle at screen point (px, py) between the rays toward (ax, ay) and (bx, by), drawn as a
 * shaded wedge with an arc of radius r (the angle is less than 180°).
 */
function markedAngle(px: number, py: number, ax: number, ay: number, bx: number, by: number, r: number): string {
  let a1 = screenAngle(ax - px, ay - py);
  let a2 = screenAngle(bx - px, by - py);
  if ((((a2 - a1) % 360) + 360) % 360 > 180) [a1, a2] = [a2, a1];
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = px + r * Math.cos(rad(a1));
  const y1 = py - r * Math.sin(rad(a1));
  const x2 = px + r * Math.cos(rad(a2));
  const y2 = py - r * Math.sin(rad(a2));
  return (
    path(`M ${num(px)} ${num(py)} L ${num(x1)} ${num(y1)} A ${num(r)} ${num(r)} 0 0 0 ${num(x2)} ${num(y2)} Z`, { stroke: 'none', fill: ACCENT, fillOpacity: SOFT * 2 }) +
    angleArc(px, py, r, a1, a2, { stroke: ACCENT, width: 2.5 })
  );
}

/** A dimension line parallel to (x1, y1)–(x2, y2), `offset` units to its right-hand side (screen), with the length written in the middle. */
function dimension(x1: number, y1: number, x2: number, y2: number, label: string, offset: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const sx1 = x1 + nx * offset;
  const sy1 = y1 + ny * offset;
  const sx2 = x2 + nx * offset;
  const sy2 = y2 + ny * offset;
  const w = textWidth(label, 17);
  const mx = (sx1 + sx2) / 2;
  const my = (sy1 + sy2) / 2;
  return [
    line(x1 + nx * 5, y1 + ny * 5, x1 + nx * (offset + 7), y1 + ny * (offset + 7), { width: 1.2 }),
    line(x2 + nx * 5, y2 + ny * 5, x2 + nx * (offset + 7), y2 + ny * (offset + 7), { width: 1.2 }),
    arrow(sx1, sy1, sx2, sy2, { width: 1.5, head: 9, both: true }),
    rect(mx - w / 2 - 5, my - 11, w + 10, 22, { stroke: 'none', fill: PAPER }),
    text(mx, my, label, { anchor: 'middle', baseline: 'middle', size: 17 }),
  ].join('');
}

/* ---------------- area of a lattice polygon ---------------- */

/**
 * A convex polygon with `n` lattice vertices, counterclockwise from the lowest (then leftmost) vertex,
 * or null when the random points make a poor figure (degenerate, slivers, tiny sides, an easy box).
 */
function latticePolygon(rng: Rng, n: 3 | 4): Pt[] | null {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) pts.push([rng.int(-6, 6), rng.int(-4, 4)]);
  const cx = sum(pts.map((p) => p[0])) / n;
  const cy = sum(pts.map((p) => p[1])) / n;
  pts.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (pts[i]![1] < pts[start]![1] || (pts[i]![1] === pts[start]![1] && pts[i]![0] < pts[start]![0])) start = i;
  }
  const poly = [...pts.slice(start), ...pts.slice(0, start)];
  let axisSides = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n]!;
    const b = poly[i]!;
    const c = poly[(i + 1) % n]!;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross <= 0) return null;
    if ((c[0] - b[0]) ** 2 + (c[1] - b[1]) ** 2 < 9) return null;
    if (b[0] === c[0] || b[1] === c[1]) axisSides++;
    // Bounds no lattice angle can equal (unlike 45°), so rounding in Math.acos never decides.
    const ang = angleDeg(a, b, c);
    if (ang < (n === 3 ? 25 : 40) || ang > (n === 3 ? 125 : 145)) return null;
  }
  if (axisSides > (n === 3 ? 1 : 2)) return null;
  const twice = shoelace2(poly);
  if (twice < (n === 3 ? 12 : 20) || twice > (n === 3 ? 70 : 110)) return null;
  return poly;
}

const latticeArea: VisualTemplate = {
  id: 'math-lattice-polygon-area',
  subject: 'math',
  title: 'Area of a polygon on a grid',
  description: 'A triangle or convex quadrilateral whose vertices are labeled lattice points on a coordinate grid; asks for its area.',
  make(rng) {
    const n: 3 | 4 = rng.chance(0.3) ? 4 : 3;
    const W = 480;
    const H = 340;
    const P = plane({ xMin: -7, xMax: 7, yMin: -5, yMax: 5, left: 30, top: 20, width: 420, height: 300 });
    const names = ['A', 'B', 'C', 'D'].slice(0, n);
    const layout = (poly: Pt[]): LabelSpot[] | null => {
      const screen = poly.map(([x, y]) => [P.x(x), P.y(y)] as Pt);
      const obs = emptyObstacles();
      addPath(obs, screen, true);
      for (const [x, y] of screen) addDot(obs, x, y, 6);
      // the axes, and their x and y labels
      obs.segments.push([P.left, P.y(0), P.left + P.width + 12, P.y(0)], [P.x(0), P.top - 12, P.x(0), P.top + P.height]);
      obs.boxes.push({ x1: P.left + P.width - 10, y1: P.y(0) - 26, x2: W, y2: P.y(0) - 4 }, { x1: P.x(0) + 6, y1: 0, x2: P.x(0) + 24, y2: P.top + 16 });
      const gx = sum(screen.map((p) => p[0])) / n;
      const gy = sum(screen.map((p) => p[1])) / n;
      const spots: LabelSpot[] = [];
      for (let i = 0; i < n; i++) {
        const [x, y] = screen[i]!;
        const s = placeLabel(`${names[i]}${pointText(...poly[i]!)}`, spotsAround(x, y, x - gx, y - gy, 8).slice(0, 5), obs, { width: W, height: H }, 15);
        if (!s) return null;
        spots.push(s);
      }
      return spots;
    };
    let poly: Pt[] = n === 3 ? [[-4, -3], [5, -1], [1, 4]] : [[-3, -3], [5, -2], [4, 3], [-4, 2]];
    let spots: LabelSpot[] | null = null;
    for (let attempt = 0; attempt < 400 && !spots; attempt++) {
      const cand = latticePolygon(rng, n);
      if (!cand) continue;
      spots = layout(cand);
      if (spots) poly = cand;
    }
    spots ??= layout(poly);
    if (!spots) throw new Error('math-lattice-polygon-area: no layout');

    const screen = poly.map(([x, y]) => [P.x(x), P.y(y)] as Pt);
    const svg = figure(
      W,
      H,
      P.grid(1),
      P.axes({ tickLabels: false, xLabel: 'x', yLabel: 'y' }),
      polygon(screen, { stroke: ACCENT, width: 2.5, fill: ACCENT, fillOpacity: SOFT * 1.6 }),
      ...screen.map(([x, y]) => dot(x, y, 4.5)),
      ...spots.map((s, i) => labelAt(s, `${names[i]}${pointText(...poly[i]!)}`, { size: 15 })),
    );
    const shape = n === 3 ? 'triangle' : 'quadrilateral';
    const name = names.join('');
    return {
      stem: `What is the area of ${shape} ${name}?`,
      format: 'short_answer',
      ...fractionAnswer(shoelace2(poly), 2),
      svg,
      alt: `A coordinate grid with ${shape} ${name} shaded. Its vertices are lattice points labeled with their coordinates: ${poly.map((p, i) => `${names[i]}${pointText(...p)}`).join(', ')}.`,
      topic: 'math.geometry',
    };
  },
};

/* ---------------- right triangle: a side or a trigonometric ratio ---------------- */

type Side = 'adj' | 'opp' | 'hyp';
type TrigFn = 'sin' | 'cos' | 'tan' | 'csc' | 'sec' | 'cot';
const TRIG_RATIO: Record<TrigFn, [Side, Side]> = {
  sin: ['opp', 'hyp'],
  cos: ['adj', 'hyp'],
  tan: ['opp', 'adj'],
  csc: ['hyp', 'opp'],
  sec: ['hyp', 'adj'],
  cot: ['adj', 'opp'],
};

/** √(p/q) for whole numbers p and q, in simplest rationalized form: sqrtRatioText(4, 13) → "2√13/13". */
export function sqrtRatioText(p: number, q: number): string {
  return radicalText(1, q, p * q);
}

/** √(p/q) as an answer: a radical, or a fraction (with its decimal accepted) when the ratio is rational. */
function sqrtRatioAnswer(p: number, q: number): AnswerForms {
  const root = Math.round(Math.sqrt(p * q));
  return root * root === p * q ? fractionAnswer(root, q) : { answer: sqrtRatioText(p, q) };
}

const rightTriangle: VisualTemplate = {
  id: 'math-right-triangle-trig',
  subject: 'math',
  title: 'Right triangle: a side or a trig ratio',
  description: 'A right triangle with two sides labeled and an acute angle θ marked; asks for the third side or a trigonometric function of θ, in simplest radical form.',
  make(rng) {
    // Squares of the side lengths: adjacent and opposite legs (relative to θ) and the hypotenuse.
    let sq: Record<Side, number> = { adj: 16, opp: 9, hyp: 25 };
    let known: [Side, Side] = ['adj', 'opp'];
    for (let attempt = 0; attempt < 200; attempt++) {
      let cand: Record<Side, number>;
      let k: [Side, Side];
      if (rng.chance(0.5)) {
        const a = rng.int(1, 12);
        const b = rng.int(1, 12);
        cand = { adj: a * a, opp: b * b, hyp: a * a + b * b };
        k = ['adj', 'opp'];
      } else {
        const c = rng.int(3, 13);
        const a = rng.int(1, c - 1);
        const leg: Side = rng.chance(0.5) ? 'adj' : 'opp';
        cand = leg === 'adj' ? { adj: a * a, opp: c * c - a * a, hyp: c * c } : { adj: c * c - a * a, opp: a * a, hyp: c * c };
        k = [leg, 'hyp'];
      }
      const theta = (Math.atan(Math.sqrt(cand.opp / cand.adj)) * 180) / Math.PI;
      if (theta < 24 || theta > 66) continue;
      sq = cand;
      known = k;
      break;
    }
    const unknown = (['adj', 'opp', 'hyp'] as Side[]).find((s) => !known.includes(s))!;
    const askSide = rng.chance(0.4);
    const fn: TrigFn = rng.chance(0.8) ? rng.pick(['sin', 'cos', 'tan'] as const) : rng.pick(['csc', 'sec', 'cot'] as const);
    const forms: AnswerForms = askSide ? { answer: radicalText(1, 1, sq[unknown]) } : sqrtRatioAnswer(sq[TRIG_RATIO[fn][0]], sq[TRIG_RATIO[fn][1]]);

    // The triangle in math coordinates: right angle C at the origin, θ at A on the x-axis, B on the y-axis.
    const adjLen = Math.sqrt(sq.adj);
    const oppLen = Math.sqrt(sq.opp);
    let pts: Record<'A' | 'B' | 'C', Pt> = { A: [adjLen, 0], B: [0, oppLen], C: [0, 0] };
    const orient = rng.int(0, 9);
    const turn = orient < 8 ? (orient % 4) * 90 : -(Math.atan2(oppLen, -adjLen) * 180) / Math.PI;
    const mirror = orient < 8 ? orient >= 4 : orient === 9;
    const rot = (turn * Math.PI) / 180;
    const tf = ([x, y]: Pt): Pt => {
      const rx = x * Math.cos(rot) - y * Math.sin(rot);
      const ry = x * Math.sin(rot) + y * Math.cos(rot);
      return [mirror ? -rx : rx, ry];
    };
    pts = { A: tf(pts.A), B: tf(pts.B), C: tf(pts.C) };
    const all = [pts.A, pts.B, pts.C];
    const minX = Math.min(...all.map((p) => p[0]));
    const maxX = Math.max(...all.map((p) => p[0]));
    const minY = Math.min(...all.map((p) => p[1]));
    const maxY = Math.max(...all.map((p) => p[1]));
    const W = 480;
    const H = 340;
    const s = Math.min((W - 150) / (maxX - minX), (H - 110) / (maxY - minY));
    const toScreen = ([x, y]: Pt): Pt => [W / 2 + s * (x - (minX + maxX) / 2), H / 2 - s * (y - (minY + maxY) / 2)];
    const A = toScreen(pts.A);
    const B = toScreen(pts.B);
    const C = toScreen(pts.C);
    const gx = (A[0] + B[0] + C[0]) / 3;
    const gy = (A[1] + B[1] + C[1]) / 3;

    const sideEnds: Record<Side, [Pt, Pt]> = { adj: [A, C], opp: [B, C], hyp: [A, B] };
    const sideLabel = (side: Side, label: string, italic: boolean): string => {
      const [p, q] = sideEnds[side];
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      let nx = -(q[1] - p[1]) / len;
      let ny = (q[0] - p[0]) / len;
      if (nx * (mx - gx) + ny * (my - gy) < 0) [nx, ny] = [-nx, -ny];
      const w = textWidth(label, 18);
      const off = 10 + Math.abs(nx) * (w / 2) + Math.abs(ny) * 9;
      return text(mx + nx * off, my + ny * off, label, { anchor: 'middle', baseline: 'middle', size: 18, italic });
    };
    const len = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
    const unit = (p: Pt, q: Pt): Pt => [(q[0] - p[0]) / len(p, q), (q[1] - p[1]) / len(p, q)];
    const toA = unit(C, A);
    const toB = unit(C, B);
    const theta = Math.atan(oppLen / adjLen);
    const uAC = unit(A, C);
    const uAB = unit(A, B);
    const bis = [uAC[0] + uAB[0], uAC[1] + uAB[1]];
    const bl = Math.hypot(bis[0]!, bis[1]!);
    const d = Math.min(80, Math.max(42, 14 / Math.sin(theta / 2)));
    const arcR = Math.min(30, d - 16);
    const labels: string[] = [];
    for (const side of known) labels.push(sideLabel(side, String(Math.round(Math.sqrt(sq[side]))), false));
    if (askSide) labels.push(sideLabel(unknown, 'x', true));

    const svg = figure(
      W,
      H,
      polygon([A, B, C], { width: 2.5, fill: ACCENT, fillOpacity: SOFT * 0.6 }),
      rightAngleMark(C[0], C[1], toA[0], toA[1], toB[0], toB[1], 14),
      markedAngle(A[0], A[1], C[0], C[1], B[0], B[1], arcR),
      text(A[0] + (bis[0]! / bl) * d, A[1] + (bis[1]! / bl) * d, 'θ', { anchor: 'middle', baseline: 'middle', size: 18, italic: true }),
      ...labels,
    );
    const sideName: Record<Side, string> = { adj: 'the leg adjacent to θ', opp: 'the leg opposite θ', hyp: 'the hypotenuse' };
    const knownText = known.map((k) => `${sideName[k]} is labeled ${Math.round(Math.sqrt(sq[k]))}`).join(' and ');
    return {
      stem: askSide ? 'In the right triangle shown, what is the value of x?' : `In the right triangle shown, what is the value of ${fn} θ?`,
      format: 'short_answer',
      ...forms,
      svg,
      alt: `A right triangle with an acute angle θ marked; ${knownText}${askSide ? `, and ${sideName[unknown]} is labeled x` : ''}.`,
      topic: askSide ? 'math.geometry' : 'math.trigonometry',
    };
  },
};

/* ---------------- shaded region between a circle and a polygon ---------------- */

type ShadeKind = 'circle-in-square' | 'square-in-circle' | 'quarter-circle' | 'four-quarters' | 'circle-in-triangle';

const shadedRegion: VisualTemplate = {
  id: 'math-shaded-region-pi',
  subject: 'math',
  title: 'Shaded region with circles',
  description: 'A circle inscribed in (or circumscribed about) a square or an equilateral triangle, or quarter circles in a square, with one length labeled; asks for the exact area of the shaded region.',
  make(rng) {
    const kind = rng.pick<ShadeKind>(['circle-in-square', 'circle-in-square', 'square-in-circle', 'square-in-circle', 'quarter-circle', 'four-quarters', 'circle-in-triangle', 'circle-in-triangle']);
    const W = 480;
    const H = 350;
    const shade = { stroke: 'none', fill: ACCENT, fillOpacity: SOFT * 1.8 };
    const hole = { width: 2, fill: PAPER };
    const parts: string[] = [];
    let answer: string;
    let stem: string;
    let alt: string;
    const minus = (a: string, b: string) => `${a} − ${b}`;
    switch (kind) {
      case 'circle-in-square': {
        // Square 240 wide; the circle touches all four sides.
        const labelRadius = rng.chance(0.4);
        const s = labelRadius ? 0 : rng.int(2, 14);
        const r = labelRadius ? rng.int(1, 9) : 0;
        parts.push(rect(120, 40, 240, 240, shade), circle(240, 160, 120, hole), rect(120, 40, 240, 240, { width: 2.5 }));
        if (labelRadius) {
          const a = (35 * Math.PI) / 180;
          const ex = 240 + 120 * Math.cos(a);
          const ey = 160 - 120 * Math.sin(a);
          parts.push(line(240, 160, ex, ey, { width: 2 }), dot(240, 160, 4), text((240 + ex) / 2 - 8, (160 + ey) / 2 - 14, String(r), { anchor: 'middle', baseline: 'middle', size: 18 }));
          answer = minus(String(4 * r * r), piText(r * r));
        } else {
          parts.push(dimension(120, 280, 360, 280, String(s), 30));
          answer = minus(String(s * s), piText(s * s, 4));
        }
        stem = 'A circle is inscribed in a square, as shown. In terms of π, what is the area of the shaded region inside the square but outside the circle?';
        alt = `A circle inscribed in a square; the region inside the square and outside the circle is shaded. ${labelRadius ? `A radius of the circle is labeled ${r}.` : `The side of the square is labeled ${s}.`}`;
        break;
      }
      case 'square-in-circle': {
        // Circle of radius 140; the square's vertices are on the circle.
        const labelRadius = rng.chance(0.5);
        const s = labelRadius ? 0 : rng.int(2, 12);
        const r = labelRadius ? rng.int(1, 10) : 0;
        const h = 140 / Math.SQRT2;
        parts.push(circle(240, 175, 140, shade), rect(240 - h, 175 - h, 2 * h, 2 * h, hole), circle(240, 175, 140, { width: 2.5 }));
        if (labelRadius) {
          parts.push(line(240, 175, 240, 35, { width: 2 }), dot(240, 175, 4), text(250, 120, String(r), { baseline: 'middle', size: 18 }));
          answer = minus(piText(r * r), String(2 * r * r));
        } else {
          parts.push(text(240, 175 + h - 16, String(s), { anchor: 'middle', size: 18 }));
          answer = minus(piText(s * s, 2), String(s * s));
        }
        stem = 'A square is inscribed in a circle, as shown. In terms of π, what is the area of the shaded region inside the circle but outside the square?';
        alt = `A square inscribed in a circle; the region inside the circle and outside the square is shaded. ${labelRadius ? `A radius of the circle is labeled ${r}.` : `A side of the square is labeled ${s}.`}`;
        break;
      }
      case 'quarter-circle': {
        // A quarter circle centered at one corner of the square, through the two neighboring corners.
        const s = rng.int(2, 14);
        const corner = rng.int(0, 3);
        const xs = [120, 360, 360, 120];
        const ys = [280, 280, 40, 40];
        const cx = xs[corner]!;
        const cy = ys[corner]!;
        const p1x = xs[(corner + 1) % 4]!;
        const p1y = ys[(corner + 1) % 4]!;
        const p2x = xs[(corner + 3) % 4]!;
        const p2y = ys[(corner + 3) % 4]!;
        const quarter = `M ${cx} ${cy} L ${p1x} ${p1y} A 240 240 0 0 0 ${p2x} ${p2y} Z`;
        parts.push(rect(120, 40, 240, 240, shade), path(quarter, hole), rect(120, 40, 240, 240, { width: 2.5 }), dot(cx, cy, 4), dimension(120, 280, 360, 280, String(s), 30));
        answer = minus(String(s * s), piText(s * s, 4));
        stem = 'The figure shows a square and a quarter circle centered at one corner of the square that passes through two other corners. In terms of π, what is the area of the shaded region?';
        alt = `A square with a quarter circle centered at one corner; the part of the square outside the quarter circle is shaded. The side of the square is labeled ${s}.`;
        break;
      }
      case 'four-quarters': {
        // Four quarter circles of radius s/2 centered at the corners meet at the midpoints of the sides.
        const s = 2 * rng.int(1, 7);
        const qs = [
          'M 120 280 L 240 280 A 120 120 0 0 0 120 160 Z',
          'M 360 280 L 360 160 A 120 120 0 0 0 240 280 Z',
          'M 360 40 L 240 40 A 120 120 0 0 0 360 160 Z',
          'M 120 40 L 120 160 A 120 120 0 0 0 240 40 Z',
        ];
        parts.push(rect(120, 40, 240, 240, shade), ...qs.map((d) => path(d, hole)), rect(120, 40, 240, 240, { width: 2.5 }), dimension(120, 280, 360, 280, String(s), 30));
        answer = minus(String(s * s), piText(s * s, 4));
        stem = 'Four congruent quarter circles are centered at the corners of the square shown, and neighboring quarter circles meet at the midpoints of its sides. In terms of π, what is the area of the shaded region?';
        alt = `A square with a quarter circle centered at each corner, each reaching the midpoints of two sides; the region inside the square and outside all four quarter circles is shaded. The side of the square is labeled ${s}.`;
        break;
      }
      case 'circle-in-triangle': {
        // Equilateral triangle with side 280; inradius 280 / (2√3).
        const s = rng.int(2, 12);
        const side = 280;
        const tri: Pt[] = [
          [100, 290],
          [380, 290],
          [240, 290 - (side * Math.sqrt(3)) / 2],
        ];
        const ir = side / (2 * Math.sqrt(3));
        parts.push(
          polygon(tri, shade),
          circle(240, 290 - ir, ir, hole),
          polygon(tri, { width: 2.5 }),
          dimension(100, 290, 380, 290, String(s), 26),
        );
        answer = minus(radicalText(s * s, 4, 3), piText(s * s, 12));
        stem = 'A circle is inscribed in an equilateral triangle, as shown. What is the exact area of the shaded region inside the triangle but outside the circle?';
        alt = `A circle inscribed in an equilateral triangle; the region inside the triangle and outside the circle is shaded. The side of the triangle is labeled ${s}.`;
        break;
      }
    }
    return {
      stem,
      format: 'short_answer',
      answer,
      svg: figure(W, H, ...parts),
      alt,
      topic: 'math.geometry',
    };
  },
};

/* ---------------- angles of a regular polygon ---------------- */

type PolygonAsk = 'interior' | 'diagonal' | 'exterior' | 'count';

/** The angle at one vertex of a regular n-gon between the chords to vertices s and t steps further around (0 < s < t < n): (t − s)·180/n degrees. */
export function polygonChordAngle(n: number, s: number, t: number): [number, number] {
  return reduce(180 * (t - s), n);
}

const regularPolygonAngle: VisualTemplate = {
  id: 'math-regular-polygon-angle',
  subject: 'math',
  title: 'Angles in a regular polygon',
  description: 'A regular polygon with an angle marked between two sides, two diagonals, a side and a diagonal, or a side and an extended side; asks for its measure in degrees (or for the number of diagonals).',
  make(rng) {
    const n = rng.pick([5, 6, 7, 8, 9, 10, 12]);
    const ask = rng.pick<PolygonAsk>(['interior', 'interior', 'diagonal', 'diagonal', 'diagonal', 'exterior', 'count']);
    const W = 480;
    const H = 380;
    const cx = 240;
    const cy = 192;
    const R = 145;
    const V = (i: number): Pt => {
      const a = ((-90 + 180 / n + (((i % n) + n) % n) * (360 / n)) * Math.PI) / 180;
      return [cx + R * Math.cos(a), cy - R * Math.sin(a)];
    };
    const verts = Array.from({ length: n }, (_, i) => V(i));
    const p = rng.int(0, n - 1);
    const P = V(p);
    const parts: string[] = [polygon(verts, { width: 2.5 })];
    let forms: AnswerForms;
    let detail = '';
    const arcRadius = (deg: number) => Math.min(70, Math.max(32, 21 / ((deg * Math.PI) / 180)));
    if (ask === 'count') {
      forms = { answer: String((n * (n - 3)) / 2) };
    } else if (ask === 'exterior') {
      const prev = V(p - 1);
      const next = V(p + 1);
      const ux = (P[0] - prev[0]) / Math.hypot(P[0] - prev[0], P[1] - prev[1]);
      const uy = (P[1] - prev[1]) / Math.hypot(P[0] - prev[0], P[1] - prev[1]);
      const ext: Pt = [P[0] + ux * 80, P[1] + uy * 80];
      parts.push(line(P[0], P[1], ext[0], ext[1], { width: 2, dash: '7 5' }), markedAngle(P[0], P[1], ext[0], ext[1], next[0], next[1], arcRadius(360 / n)));
      forms = fractionAnswer(360, n);
      detail = 'between one side and the extension of the neighboring side';
    } else {
      let s = 1;
      let t = n - 1;
      if (ask === 'diagonal') {
        do {
          s = rng.int(1, n - 2);
          t = rng.int(s + 1, n - 1);
        } while (s === 1 && t === n - 1);
      }
      const A = V(p + s);
      const B = V(p + t);
      const [num180, den] = polygonChordAngle(n, s, t);
      if (s !== 1) parts.push(line(P[0], P[1], A[0], A[1], { width: 2 }));
      if (t !== n - 1) parts.push(line(P[0], P[1], B[0], B[1], { width: 2 }));
      parts.push(markedAngle(P[0], P[1], A[0], A[1], B[0], B[1], arcRadius(num180 / den)));
      forms = fractionAnswer(num180, den);
      detail = ask === 'interior' ? 'between the two sides that meet there' : s === 1 || t === n - 1 ? 'between a side and a diagonal drawn from that vertex' : 'between two diagonals drawn from that vertex';
    }
    parts.push(...verts.map(([x, y]) => dot(x, y, 4)));
    return {
      stem: ask === 'count' ? 'How many diagonals does the regular polygon shown have?' : 'The figure shows a regular polygon. What is the degree measure of the marked angle?',
      format: 'short_answer',
      ...forms,
      svg: figure(W, H, ...parts),
      alt: ask === 'count' ? `A regular polygon with ${n} sides.` : `A regular polygon with ${n} sides; an angle at one vertex is marked ${detail}.`,
      topic: 'math.geometry',
    };
  },
};

/* ---------------- Venn diagram ---------------- */

/** Circle centers of the Venn diagram (A, B, C) and their radius. */
export const VENN_CENTERS: Pt[] = [
  [185, 150],
  [295, 150],
  [240, 245],
];
export const VENN_R = 105;

/** Where to write the count of a region: bit 0 = in A, bit 1 = in B, bit 2 = in C; 0 is outside all three. */
export function vennSpot(mask: number): Pt {
  const gx = sum(VENN_CENTERS.map((c) => c[0])) / 3;
  const gy = sum(VENN_CENTERS.map((c) => c[1])) / 3;
  if (mask === 0) return [52, 336];
  if (mask === 7) return [gx, gy];
  const bits = [0, 1, 2].filter((i) => mask & (1 << i));
  if (bits.length === 1) {
    const [x, y] = VENN_CENTERS[bits[0]!]!;
    const d = Math.hypot(x - gx, y - gy);
    return [x + ((x - gx) / d) * VENN_R * 0.5, y + ((y - gy) / d) * VENN_R * 0.5];
  }
  const other = [0, 1, 2].find((i) => !(mask & (1 << i)))!;
  const [ox, oy] = VENN_CENTERS[other]!;
  const d = Math.hypot(gx - ox, gy - oy);
  return [gx + ((gx - ox) / d) * VENN_R * 0.64, gy + ((gy - oy) / d) * VENN_R * 0.64];
}

const popcount = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);

/**
 * Set expressions over X, Y, Z (a shuffle of A, B, C); x, y, z are the bits of X, Y and Z. `sym` lists
 * interchangeable variables (0 = X, 1 = Y, 2 = Z), which are put in alphabetical order ("A ∪ B", not "B ∪ A").
 */
const SET_QUESTIONS: Array<{ expr: string; sym: Array<[number, number]>; holds: (m: number, x: number, y: number, z: number) => boolean }> = [
  { expr: 'X ∪ Y', sym: [[0, 1]], holds: (m, x, y) => (m & (x | y)) !== 0 },
  { expr: 'X ∩ Y', sym: [[0, 1]], holds: (m, x, y) => (m & x) !== 0 && (m & y) !== 0 },
  { expr: 'X ∩ Y′', sym: [], holds: (m, x, y) => (m & x) !== 0 && (m & y) === 0 },
  { expr: '(X ∪ Y) ∩ Z′', sym: [[0, 1]], holds: (m, x, y, z) => (m & (x | y)) !== 0 && (m & z) === 0 },
  { expr: 'X ∩ (Y ∪ Z)', sym: [[1, 2]], holds: (m, x, y, z) => (m & x) !== 0 && (m & (y | z)) !== 0 },
  { expr: 'X′ ∩ Y′', sym: [[0, 1]], holds: (m, x, y) => (m & (x | y)) === 0 },
  { expr: '(X ∩ Y) ∪ Z', sym: [[0, 1]], holds: (m, x, y, z) => ((m & x) !== 0 && (m & y) !== 0) || (m & z) !== 0 },
  { expr: '(X ∪ Y)′', sym: [[0, 1]], holds: (m, x, y) => (m & (x | y)) === 0 },
  { expr: 'X ∪ Y ∪ Z', sym: [[0, 1], [1, 2], [0, 1]], holds: (m) => m !== 0 },
];

const CLUBS = ['Chess', 'Drama', 'Robotics', 'Math', 'Art', 'Debate', 'Science', 'Coding'];

const vennDiagram: VisualTemplate = {
  id: 'math-venn-diagram',
  subject: 'math',
  title: 'Venn diagram counts',
  description: 'A three-set Venn diagram with the count of every region; asks for the size of a set expression, a count such as "exactly two", or a probability.',
  make(rng) {
    const W = 480;
    const H = 380;
    const counts = Array.from({ length: 8 }, (_, m) => (m === 0 ? rng.int(1, 15) : rng.int(1, 14)));
    const total = sum(counts);
    const count = (holds: (m: number) => boolean) => sum(counts.filter((_, m) => holds(m)));
    const abstract = rng.chance(0.45);
    const parts: string[] = [rect(14, 14, 452, 352, { width: 2 })];
    // Neutral shading that darkens where circles overlap.
    for (const [x, y] of VENN_CENTERS) parts.push(circle(x, y, VENN_R, { width: 2.5, fill: INK, fillOpacity: SOFT * 0.6 }));
    for (let m = 0; m < 8; m++) {
      const [x, y] = vennSpot(m);
      parts.push(text(x, y, String(counts[m]), { anchor: 'middle', baseline: 'middle', size: 18 }));
    }
    let stem: string;
    let forms: AnswerForms;
    let names: string[];
    if (abstract) {
      names = ['A', 'B', 'C'];
      parts.push(
        text(30, 40, 'U', { size: 20, italic: true, baseline: 'middle' }),
        text(96, 62, 'A', { anchor: 'middle', baseline: 'middle', size: 22, italic: true }),
        text(384, 62, 'B', { anchor: 'middle', baseline: 'middle', size: 22, italic: true }),
        text(342, 330, 'C', { anchor: 'middle', baseline: 'middle', size: 22, italic: true }),
      );
      const q = rng.pick(SET_QUESTIONS);
      const order = rng.shuffle([0, 1, 2]);
      for (const [u, v] of q.sym) if (order[u]! > order[v]!) [order[u], order[v]] = [order[v]!, order[u]!];
      const [x, y, z] = order.map((i) => 1 << i) as [number, number, number];
      const expr = q.expr.replace(/[XYZ]/g, (v) => names[order['XYZ'.indexOf(v)]!]!);
      forms = { answer: String(count((m) => q.holds(m, x, y, z))) };
      stem = `The Venn diagram shows the number of elements in each region for sets A, B and C in the universal set U. How many elements are in ${expr}?`;
    } else {
      names = rng.sample(CLUBS, 3);
      const lower = names.map((s) => s.toLowerCase());
      parts.push(
        text(128, 54, names[0]!, { anchor: 'end', size: 16, weight: 'bold' }),
        text(352, 54, names[1]!, { size: 16, weight: 'bold' }),
        text(308, 346, names[2]!, { size: 16, weight: 'bold' }),
      );
      const [i, j] = rng.sample([0, 1, 2], 2) as [number, number];
      const bi = 1 << i;
      const bj = 1 << j;
      const lead = 'The Venn diagram shows how many of the students surveyed are in each of three clubs.';
      const ask = rng.pick(['one', 'two', 'atLeastTwo', 'butNot', 'both', 'pNone', 'pTwo', 'pGiven', 'pGiven']);
      switch (ask) {
        case 'one':
          forms = { answer: String(count((m) => popcount(m) === 1)) };
          stem = `${lead} How many of these students are in exactly one of the three clubs?`;
          break;
        case 'two':
          forms = { answer: String(count((m) => popcount(m) === 2)) };
          stem = `${lead} How many of these students are in exactly two of the three clubs?`;
          break;
        case 'atLeastTwo':
          forms = { answer: String(count((m) => popcount(m) >= 2)) };
          stem = `${lead} How many of these students are in at least two of the three clubs?`;
          break;
        case 'butNot':
          forms = { answer: String(count((m) => (m & bi) !== 0 && (m & bj) === 0)) };
          stem = `${lead} How many of these students are in the ${lower[i]} club but not the ${lower[j]} club?`;
          break;
        case 'both':
          forms = { answer: String(count((m) => (m & bi) !== 0 && (m & bj) !== 0)) };
          stem = `${lead} How many of these students are in both the ${lower[i]} club and the ${lower[j]} club?`;
          break;
        case 'pNone':
          forms = fractionAnswer(counts[0]!, total);
          stem = `${lead} If one of the students surveyed is chosen at random, what is the probability that the student is in none of the three clubs?`;
          break;
        case 'pTwo':
          forms = fractionAnswer(count((m) => popcount(m) === 2), total);
          stem = `${lead} If one of the students surveyed is chosen at random, what is the probability that the student is in exactly two of the three clubs?`;
          break;
        default:
          forms = fractionAnswer(
            count((m) => (m & bi) !== 0 && (m & bj) !== 0),
            count((m) => (m & bi) !== 0),
          );
          stem = `${lead} If a student in the ${lower[i]} club is chosen at random, what is the probability that the student is also in the ${lower[j]} club?`;
      }
    }
    return {
      stem,
      format: 'short_answer',
      ...forms,
      svg: figure(W, H, ...parts),
      alt: `A Venn diagram of three overlapping circles labeled ${names.join(', ')} inside a rectangle, with a number written in each of the eight regions, including the region outside all three circles.`,
      topic: 'math.probability-combinatorics',
    };
  },
};

/* ---------------- dot plot: mean or median ---------------- */

interface DotContext {
  stem: string;
  axis: string;
  /** What "the mean ___" and "the median ___" say. */
  noun: string;
  lo: [number, number];
  span: [number, number];
  hiMax?: number;
}

const DOT_CONTEXTS: DotContext[] = [
  { stem: 'The dot plot shows the number of goals a soccer team scored in each game of its season.', axis: 'Goals scored in a game', noun: 'number of goals per game', lo: [0, 0], span: [5, 7] },
  { stem: 'The dot plot shows how many books each student in a reading club read over the summer.', axis: 'Books read', noun: 'number of books read', lo: [0, 2], span: [6, 8] },
  { stem: 'The dot plot shows the scores of a class on a 10-point quiz.', axis: 'Quiz score', noun: 'score', lo: [2, 4], span: [6, 8], hiMax: 10 },
  { stem: 'The dot plot shows how many siblings each student in a class has.', axis: 'Number of siblings', noun: 'number of siblings', lo: [0, 0], span: [4, 6] },
  { stem: 'The dot plot shows how many hours each student on a team slept last night, to the nearest hour.', axis: 'Hours of sleep', noun: 'number of hours of sleep', lo: [4, 6], span: [4, 6] },
];

/** The median of a list of whole numbers, as a fraction [numerator, denominator]. */
export function medianFraction(values: readonly number[]): [number, number] {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  return n % 2 === 1 ? [v[(n - 1) / 2]!, 1] : reduce(v[n / 2 - 1]! + v[n / 2]!, 2);
}

const dotPlot: VisualTemplate = {
  id: 'math-dot-plot-stats',
  subject: 'math',
  title: 'Mean or median from a dot plot',
  description: 'A dot plot of a small data set; asks for the mean or the median.',
  make(rng) {
    const ctx = rng.pick(DOT_CONTEXTS);
    let lo = 0;
    let freqs: number[] = [];
    for (let attempt = 0; attempt < 300; attempt++) {
      lo = rng.int(ctx.lo[0], ctx.lo[1]);
      let span = rng.int(ctx.span[0], ctx.span[1]);
      if (ctx.hiMax !== undefined) span = Math.min(span, ctx.hiMax - lo);
      const peak = rng.int(0, span);
      const spread = rng.pick([1, 1.5, 2]);
      freqs = Array.from({ length: span + 1 }, (_, i) => Math.max(0, Math.min(7, Math.round(5 - Math.abs(i - peak) * spread) + rng.int(-1, 1))));
      const n = sum(freqs);
      if (n >= 11 && n <= 24 && freqs.filter((f) => f > 0).length >= 4 && freqs[0]! + freqs[freqs.length - 1]! > 0) break;
      freqs = [];
    }
    if (freqs.length === 0) freqs = [1, 3, 5, 4, 2, 1];
    const values = freqs.flatMap((f, i) => Array.from({ length: f }, () => lo + i));
    const askMean = rng.chance(0.55);
    const forms = askMean ? fractionAnswer(sum(values), values.length) : fractionAnswer(...medianFraction(values));

    const W = 480;
    const H = 250;
    const axisY = 178;
    const step = Math.min(56, 400 / freqs.length);
    const x0 = W / 2 - (step * (freqs.length - 1)) / 2;
    const parts: string[] = [line(x0 - step * 0.7, axisY, x0 + step * (freqs.length - 1) + step * 0.7, axisY, { width: 2 })];
    freqs.forEach((f, i) => {
      const x = x0 + i * step;
      parts.push(line(x, axisY - 5, x, axisY + 5, { width: 2 }), text(x, axisY + 12, String(lo + i), { anchor: 'middle', baseline: 'hanging', size: 15 }));
      for (let j = 0; j < f; j++) parts.push(circle(x, axisY - 17 - j * 19, 8, { stroke: 'none', fill: ACCENT }));
    });
    parts.push(text(W / 2, axisY + 56, ctx.axis, { anchor: 'middle', size: 15 }));
    return {
      stem: `${ctx.stem} What is the ${askMean ? 'mean' : 'median'} ${ctx.noun}?`,
      format: 'short_answer',
      ...forms,
      svg: figure(W, H, ...parts),
      alt: `A dot plot of ${values.length} values on a number line from ${lo} to ${lo + freqs.length - 1} (${ctx.axis.toLowerCase()}): ${freqs
        .map((f, i) => [f, lo + i] as const)
        .filter(([f]) => f > 0)
        .map(([f, v]) => `${f} at ${v}`)
        .join(', ')}.`,
      topic: 'math.statistics',
    };
  },
};

/* ---------------- graph of a parabola ---------------- */

const parabolaGraph: VisualTemplate = {
  id: 'math-parabola-graph',
  subject: 'math',
  title: 'Reading a parabola',
  description: 'The graph of a quadratic function with its two x-intercepts and its y-intercept labeled; asks for its maximum or minimum value, a coefficient, or a value of the function.',
  make(rng) {
    const W = 480;
    const H = 400;
    const P = plane({ xMin: -8, xMax: 8, yMin: -10, yMax: 10, left: 40, top: 22, width: 400, height: 356 });
    type Layout = { r1: number; r2: number; c: number; a: [number, number]; spots: LabelSpot[] };
    const layoutFor = (r1: number, r2: number, c: number): Layout | null => {
      const a = reduce(c, r1 * r2);
      const f = (x: number) => (a[0] * (x - r1) * (x - r2)) / a[1];
      const vertex = f((r1 + r2) / 2);
      if (Math.abs(vertex) > 9.2 || Math.abs(vertex) < 1.5) return null;
      const obs: Obstacles = emptyObstacles();
      const curve: Pt[] = [];
      for (let i = 0; i <= 160; i++) {
        const x = -8 + i / 10;
        const y = f(x);
        if (y >= -10.5 && y <= 10.5) curve.push([P.x(x), P.y(y)]);
        else if (curve.length) {
          addPath(obs, curve);
          curve.length = 0;
        }
      }
      addPath(obs, curve);
      obs.segments.push([P.left, P.y(0), P.left + P.width + 12, P.y(0)], [P.x(0), P.top - 12, P.x(0), P.top + P.height]);
      obs.boxes.push({ x1: P.left + P.width - 10, y1: P.y(0) - 26, x2: W, y2: P.y(0) - 4 }, { x1: P.x(0) + 6, y1: 0, x2: P.x(0) + 24, y2: P.top + 16 });
      const pts: Pt[] = [
        [r1, 0],
        [r2, 0],
        [0, c],
      ];
      for (const [x, y] of pts) addDot(obs, P.x(x), P.y(y), 6);
      // Roots: label on the outer side, away from the arms of the parabola. The y-intercept: away from
      // the x-axis, on the side where the curve moves away (screen directions, y down).
      const up = a[0] > 0 ? -1 : 1;
      const slope0 = -(a[0] * (r1 + r2)) / a[1];
      const below = c < 0;
      const prefer: Pt[] = [
        [-1, -up],
        [1, -up],
        [slope0 === 0 || below === slope0 > 0 ? 1 : -1, below ? 1 : -1],
      ];
      const spots: LabelSpot[] = [];
      for (let i = 0; i < 3; i++) {
        const [x, y] = pts[i]!;
        const s = placeLabel(pointText(x, y), spotsAround(P.x(x), P.y(y), prefer[i]![0], prefer[i]![1], 8), obs, { width: W, height: H }, 15);
        if (!s) return null;
        spots.push(s);
      }
      return { r1, r2, c, a, spots };
    };
    let layout: Layout | null = null;
    for (let attempt = 0; attempt < 400 && !layout; attempt++) {
      const r1 = rng.int(-6, 4);
      const r2 = rng.int(r1 + 2, 6);
      const c = rng.int(-8, 8);
      if (r1 === 0 || r2 === 0 || c === 0) continue;
      layout = layoutFor(r1, r2, c);
    }
    layout ??= layoutFor(-2, 4, -4);
    if (!layout) throw new Error('math-parabola-graph: no layout');
    const { r1, r2, c, a, spots } = layout;
    const [an, ad] = a;
    const f = (x: number) => (an * (x - r1) * (x - r2)) / ad;
    const symmetric = r1 + r2 === 0;
    const ask = rng.pick(symmetric ? ['a', 'value'] : ['extremum', 'extremum', 'b', 'a', 'value']);
    let stem: string;
    let forms: AnswerForms;
    switch (ask) {
      case 'extremum':
        forms = fractionAnswer(-an * (r2 - r1) * (r2 - r1), 4 * ad);
        stem = `The graph of the quadratic function f is shown. What is the ${an > 0 ? 'minimum' : 'maximum'} value of f(x)?`;
        break;
      case 'b':
        forms = fractionAnswer(-an * (r1 + r2), ad);
        stem = 'The graph of y = ax² + bx + c is shown. What is the value of b?';
        break;
      case 'a':
        forms = fractionAnswer(an, ad);
        stem = 'The graph of y = ax² + bx + c is shown. What is the value of a?';
        break;
      default: {
        let k = 0;
        do k = rng.pick([-10, -9, -8, -7, 7, 8, 9, 10]);
        while (k === r1 || k === r2);
        forms = fractionAnswer(an * (k - r1) * (k - r2), ad);
        stem = `The graph of the quadratic function f is shown. What is f(${fmt(k)})?`;
      }
    }
    const pts: Pt[] = [
      [r1, 0],
      [r2, 0],
      [0, c],
    ];
    const svg = figure(
      W,
      H,
      P.grid(1),
      P.axes({ tickLabels: false, xLabel: 'x', yLabel: 'y' }),
      P.plot(f, { style: { stroke: ACCENT, width: 3 } }),
      ...pts.map(([x, y], i) => P.point(x, y) + labelAt(spots[i]!, pointText(x, y), { size: 15 })),
    );
    return {
      stem,
      format: 'short_answer',
      ...forms,
      svg,
      alt: `The graph of a parabola that opens ${an > 0 ? 'upward' : 'downward'} on a grid, with its x-intercepts ${pointText(r1, 0)} and ${pointText(r2, 0)} and its y-intercept ${pointText(0, c)} labeled.`,
      topic: 'math.algebra',
    };
  },
};

/* ---------------- graph of a transformed function: choose its equation ---------------- */

type Family = 'abs' | 'quad' | 'sqrt';
type Transform = { a: [number, number]; h: number; k: number };

/** y = a·g(x − h) + k for g(x) = |x|, x² or √x, as a function. */
export function transformed(family: Family, { a, h, k }: Transform): (x: number) => number {
  const g = family === 'abs' ? Math.abs : family === 'quad' ? (u: number) => u * u : (u: number) => (u < 0 ? NaN : Math.sqrt(u));
  return (x: number) => (a[0] * g(x - h)) / a[1] + k;
}

/** The equation as printed in a choice, e.g. "y = −2|x + 3| + 1" or "y = (1/2)(x − 4)² − 2". h and k are not 0. */
export function equationText(family: Family, { a, h, k }: Transform): string {
  const [an, ad] = reduce(a[0], a[1]);
  const coef = `${an < 0 ? '−' : ''}${ad === 1 ? (Math.abs(an) === 1 ? '' : String(Math.abs(an))) : `(${Math.abs(an)}/${ad})`}`;
  const inner = `x ${h > 0 ? '−' : '+'} ${Math.abs(h)}`;
  const body = family === 'abs' ? `|${inner}|` : family === 'sqrt' ? `√(${inner})` : `(${inner})²`;
  return `y = ${coef}${body} ${k > 0 ? '+' : '−'} ${Math.abs(k)}`;
}

const graphEquation: VisualTemplate = {
  id: 'math-graph-equation',
  subject: 'math',
  title: 'Equation of a graph',
  description: 'The graph of a shifted, stretched or reflected absolute value, quadratic or square root function on a grid; asks which of four equations it has (multiple choice).',
  make(rng) {
    const family = rng.pick<Family>(['abs', 'quad', 'sqrt']);
    const a = rng.pick<[number, number]>(
      family === 'sqrt'
        ? [[1, 1], [-1, 1], [2, 1], [-2, 1]]
        : [[1, 1], [-1, 1], [2, 1], [-2, 1], [1, 2], [-1, 2]],
    );
    let h = 0;
    let k = 0;
    while (h === 0 || k === 0 || h === k) {
      h = family === 'sqrt' ? rng.int(-5, 2) : rng.int(-4, 4);
      k = rng.int(-4, 4);
    }
    const truth: Transform = { a, h, k };
    const f = transformed(family, truth);
    // A second lattice point that shows the stretch: one or two units from the vertex, toward the middle.
    const dx = (a[1] === 2 ? 2 : 1) * (family === 'sqrt' || h <= 0 ? 1 : -1);
    const pts: Pt[] = [
      [h, k],
      [h + dx, f(h + dx)],
    ];
    // Distractors: each a common slip, and each misses one of the two marked points.
    const flip = (q: [number, number]): [number, number] => [-q[0], q[1]];
    const cands: Transform[] = [
      { a, h: -h, k },
      { a, h, k: -k },
      { a: flip(a), h, k },
      { a, h: k, k: h },
      { a, h: -h, k: -k },
      { a: flip(a), h: -h, k },
    ];
    if (!(Math.abs(a[0]) === 1 && a[1] === 1)) cands.push({ a: [Math.sign(a[0]) * a[1], Math.abs(a[0])], h, k });
    const distractors = cands
      .filter((c) => pts.some(([x, y]) => !(Math.abs(transformed(family, c)(x) - y) < 1e-9)))
      .map((c) => equationText(family, c));
    const answer = equationText(family, truth);
    const { choices, answerLetter } = multipleChoice(answer, distractors, rng);

    const W = 480;
    const H = 420;
    const P = plane({ xMin: -7, xMax: 7, yMin: -7, yMax: 7, left: 44, top: 14, width: 392, height: 392 });
    const ticks = [-6, -4, -2, 2, 4, 6];
    const curve = { stroke: ACCENT, width: 3 };
    const svg = figure(
      W,
      H,
      P.grid(1),
      P.axes({ tickLabels: false, xLabel: 'x', yLabel: 'y' }),
      family === 'sqrt' ? P.plot(f, { from: h, to: 7, samples: 400, style: curve }) : P.plot(f, { from: -7, to: h, samples: 200, style: curve }) + P.plot(f, { from: h, to: 7, samples: 200, style: curve }),
      // over the curve, so their halo keeps them readable where it crosses
      tickLabels(P, { x: ticks, y: ticks }),
      ...pts.map(([x, y]) => P.point(x, y)),
    );
    const opens = a[0] > 0 ? 'upward' : 'downward';
    const shape =
      family === 'abs'
        ? `a V-shaped graph opening ${opens} with its vertex at ${pointText(h, k)}`
        : family === 'quad'
          ? `a parabola opening ${opens} with its vertex at ${pointText(h, k)}`
          : `a curve that starts at ${pointText(h, k)} and ${a[0] > 0 ? 'rises' : 'falls'} more and more slowly to the right`;
    return {
      stem: 'Which of the following is an equation of the graph shown?',
      format: 'multiple_choice',
      choices,
      answerLetter,
      answer,
      svg,
      alt: `A coordinate grid with ${shape}, also passing through ${pointText(...pts[1]!)}; both points are marked.`,
      topic: 'math.algebra',
    };
  },
};

export const MATH_TEMPLATES: VisualTemplate[] = [
  sector,
  latticeArea,
  rightTriangle,
  shadedRegion,
  regularPolygonAngle,
  vennDiagram,
  dotPlot,
  parabolaGraph,
  graphEquation,
];
