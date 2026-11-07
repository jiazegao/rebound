/**
 * Generated visual bonuses: earth and space.
 * Each template draws a figure (svg.ts) and asks a bonus question about it with an exact answer.
 * See src/core/visual/README.md for the rules every template follows.
 */
import { multipleChoice } from '../choices';
import { fractionText } from '../exact';
import { makeRng, type Rng } from '../rng';
import { ACCENT, INK, PAPER, SOFT, arrow, arrowHead, circle, dot, ellipse, figure, line, polygon, polyline, rect, text } from '../svg';
import type { VisualTemplate } from '../types';
import { SUN_FILL, clipHalf, clipRect, commas, edgeDistance, insideConvex, litDisc, polygonArea, segmentDistance, textWidth, type Pt } from './earth_bio_kit';

const rad = (d: number) => (d * Math.PI) / 180;

/* ---------------- phases of the Moon ---------------- */

interface Phase {
  name: string;
  accept: string[];
  reject: string[];
  /** How the phase reads in a stem: "see a waxing gibbous Moon". */
  seen: string;
}

/** Index k = the Moon's angle from the Sun's direction, counterclockwise as seen from above the North Pole, in steps of 45°. */
const PHASES: Phase[] = [
  { name: 'NEW MOON', accept: ['NEW'], reject: [], seen: 'a new Moon' },
  { name: 'WAXING CRESCENT', accept: ['WAXING CRESCENT MOON'], reject: ['WANING CRESCENT', 'WANING CRESCENT MOON'], seen: 'a waxing crescent Moon' },
  { name: 'FIRST QUARTER', accept: ['FIRST QUARTER MOON', '1ST QUARTER'], reject: [], seen: 'a first quarter Moon' },
  { name: 'WAXING GIBBOUS', accept: ['WAXING GIBBOUS MOON'], reject: ['WANING GIBBOUS', 'WANING GIBBOUS MOON'], seen: 'a waxing gibbous Moon' },
  { name: 'FULL MOON', accept: ['FULL'], reject: [], seen: 'a full Moon' },
  { name: 'WANING GIBBOUS', accept: ['WANING GIBBOUS MOON'], reject: ['WAXING GIBBOUS', 'WAXING GIBBOUS MOON'], seen: 'a waning gibbous Moon' },
  { name: 'THIRD QUARTER', accept: ['LAST QUARTER', 'THIRD QUARTER MOON', 'LAST QUARTER MOON', '3RD QUARTER'], reject: [], seen: 'a third quarter Moon' },
  { name: 'WANING CRESCENT', accept: ['WANING CRESCENT MOON'], reject: ['WAXING CRESCENT', 'WAXING CRESCENT MOON'], seen: 'a waning crescent Moon' },
];

/** Where a point at math angle `deg` lies around a center, in words for alt text. */
const AROUND = ['to the right of', 'to the upper right of', 'above', 'to the upper left of', 'to the left of', 'to the lower left of', 'below', 'to the lower right of'];

/** The phase of the Moon at a position in its orbit, seen from Earth: positions are multiples of 45°, counterclockwise. */
export function moonPhaseIndex(moonDeg: number, sunDeg: number): number {
  return (((Math.round((moonDeg - sunDeg) / 45) % 8) + 8) % 8);
}

const moonPhase: VisualTemplate = {
  id: 'earth_space-moon-phase',
  subject: 'earth_space',
  title: 'Phases of the Moon',
  description:
    "Earth and the Moon's orbit seen from above Earth's North Pole, with sunlight from one side; asks for the phase seen from Earth at the Moon's position, or which lettered position shows a named phase.",
  make(rng) {
    const sunRight = rng.chance(0.5);
    const sunDeg = sunRight ? 0 : 180;
    const lettered = rng.chance(0.4);
    const W = 480;
    const H = 340;
    const ex = sunRight ? 205 : 275;
    const ey = 172;
    const R = 108;
    const rm = 14;
    const re = 25;
    const at = (deg: number, r: number): [number, number] => [ex + r * Math.cos(rad(deg)), ey - r * Math.sin(rad(deg))];
    const parts: string[] = [];

    // Sunlight from one side: the edge of the Sun and parallel rays.
    parts.push(circle(sunRight ? W + 78 : -78, ey, 112, { fill: SUN_FILL, stroke: INK, width: 1.5 }));
    const rayFrom = sunRight ? 424 : 56;
    const rayTo = sunRight ? 366 : 114;
    for (const dy of [-112, -56, 56, 112]) parts.push(arrow(rayFrom, ey + dy, rayTo, ey + dy, { width: 2, head: 10 }));
    parts.push(text((rayFrom + rayTo) / 2, ey - 128, 'Sunlight', { anchor: 'middle', size: 15 }));

    // The orbit, with arrows showing the Moon's counterclockwise motion.
    parts.push(circle(ex, ey, R, { width: 1.3, dash: '5 5', opacity: 0.75 }));
    const orbitArrow = (deg: number) => {
      const [x, y] = at(deg, R);
      const tx = -Math.sin(rad(deg));
      const ty = -Math.cos(rad(deg));
      return arrowHead(x - 6 * tx, y - 6 * ty, x + 6 * tx, y + 6 * ty, 12);
    };

    // Earth, lit on the side facing the Sun.
    parts.push(litDisc(ex, ey, re, sunDeg));
    parts.push(text(ex, ey + re + 18, 'Earth', { anchor: 'middle', size: 15 }));

    const sideWord = sunRight ? 'right' : 'left';
    const intro = `A view from above Earth's North Pole: Earth at the center with the Moon's orbit drawn around it as a dashed circle. Sunlight comes from the ${sideWord}, so the ${sideWord} half of Earth and of the Moon is lit. Arrows on the orbit show the Moon moving counterclockwise.`;

    if (!lettered) {
      const k = rng.int(0, 7);
      const moonDeg = k * 45;
      const phase = PHASES[moonPhaseIndex(moonDeg, sunDeg)]!;
      for (const d of [moonDeg + 112.5, moonDeg + 247.5]) parts.push(orbitArrow(d));
      const [mx, my] = at(moonDeg, R);
      parts.push(litDisc(mx, my, rm, sunDeg, { stroke: ACCENT, width: 3 }));
      const [lx, ly] = at(moonDeg, R + rm + 20);
      parts.push(text(lx, ly, 'Moon', { anchor: 'middle', baseline: 'middle', size: 15, weight: 'bold' }));
      return {
        stem: "The figure shows Earth and the Moon's orbit viewed from above Earth's North Pole. What phase of the Moon is seen from Earth when the Moon is at the position shown?",
        format: 'short_answer',
        answer: phase.name,
        accept: phase.accept,
        reject: phase.reject,
        svg: figure(W, H, ...parts),
        alt: `${intro} The Moon is shown ${AROUND[k]} Earth.`,
        topic: 'earth_space.solar-system',
      };
    }

    // Eight lettered positions, lettered in order around the orbit from a random start.
    const start = rng.int(0, 7);
    const dir = rng.chance(0.5) ? 1 : -1;
    const letters: string[] = [];
    for (let k = 0; k < 8; k++) letters[(((start + dir * k) % 8) + 8) % 8] = 'ABCDEFGH'[k]!;
    for (const d of [22.5, 112.5, 202.5, 292.5]) parts.push(orbitArrow(d));
    for (let k = 0; k < 8; k++) {
      const [mx, my] = at(k * 45, R);
      parts.push(litDisc(mx, my, rm, sunDeg));
      const [lx, ly] = at(k * 45, R + rm + 16);
      parts.push(text(lx, ly, letters[k]!, { anchor: 'middle', baseline: 'middle', size: 16, weight: 'bold' }));
    }
    const target = rng.int(0, 7);
    const targetPos = (((target + sunDeg / 45) % 8) + 8) % 8;
    const answer = letters[targetPos]!;
    return {
      stem: `The figure shows the Moon at eight lettered positions in its orbit, viewed from above Earth's North Pole. At which position would an observer on Earth see ${PHASES[target]!.seen}?`,
      format: 'short_answer',
      answer,
      accept: [`POSITION ${answer}`],
      svg: figure(W, H, ...parts),
      alt: `${intro} The Moon is drawn at eight positions; going counterclockwise from the position to the right of Earth, they are labeled ${letters.join(', ')}.`,
      topic: 'earth_space.solar-system',
    };
  },
};

/* ---------------- the H–R diagram ---------------- */

/** The main sequence as (log T, log L) points, hottest first. */
const MAIN_SEQUENCE: Array<[number, number]> = [
  [4.62, 5.5], [4.48, 4.35], [4.19, 2.9], [3.99, 1.6], [3.86, 0.8], [3.76, 0.0], [3.72, -0.35], [3.64, -0.85], [3.585, -1.2], [3.48, -2.2], [3.415, -3.3],
];

export function mainSequenceLogL(logT: number): number {
  const pts = MAIN_SEQUENCE;
  if (logT >= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, l1] = pts[i - 1]!;
    const [t2, l2] = pts[i]!;
    if (logT >= t2) return l1 + ((logT - t1) * (l2 - l1)) / (t2 - t1);
  }
  return pts[pts.length - 1]![1];
}

const whiteDwarfLogL = (logT: number) => -2.9 + 4 * (logT - 4);
const giantLogL = (logT: number) => 1.5 + (3.72 - logT) * 8;

/** The faint background stars: the same for every question, so the diagram always looks the same. */
const HR_BACKGROUND: Array<[number, number]> = (() => {
  const r = makeRng(20_270_419);
  const noise = (s: number) => (r.next() + r.next() + r.next() - 1.5) * s;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < 90; i++) {
    const t = 3.43 + Math.pow(r.next(), 1.4) * 1.15;
    out.push([t, mainSequenceLogL(t) + noise(0.35)]);
  }
  for (let i = 0; i < 24; i++) {
    const t = 3.56 + r.next() * 0.16;
    out.push([t, giantLogL(t) + noise(0.5)]);
  }
  for (let i = 0; i < 16; i++) out.push([3.55 + r.next() * 0.9, 4.6 + r.next() * 1.2]);
  for (let i = 0; i < 14; i++) {
    const t = 3.85 + r.next() * 0.5;
    out.push([t, whiteDwarfLogL(t) + noise(0.25)]);
  }
  return out;
})();

const HR_PLOT = { left: 92, top: 22, width: 364, height: 292, tMax: 4.66, tMin: 3.38, lMin: -4.6, lMax: 6.6 };
const hrX = (logT: number) => HR_PLOT.left + ((HR_PLOT.tMax - logT) / (HR_PLOT.tMax - HR_PLOT.tMin)) * HR_PLOT.width;
const hrY = (logL: number) => HR_PLOT.top + ((HR_PLOT.lMax - logL) / (HR_PLOT.lMax - HR_PLOT.lMin)) * HR_PLOT.height;

/** A luminosity for alt text: "0.003", "1", "40", "200,000". */
function luminosityWords(logL: number): string {
  const v = Math.pow(10, logL);
  const digits = Math.floor(logL);
  const rounded = Math.round(v / Math.pow(10, digits)) * Math.pow(10, digits);
  if (rounded >= 1) return commas(rounded);
  return rounded.toFixed(-digits);
}

function temperatureWords(logT: number): string {
  const v = Math.pow(10, logT);
  return `${commas(Math.round(v / 100) * 100)} K`;
}

type StarKind = 'whiteDwarf' | 'redGiant' | 'supergiant' | 'hotMain' | 'sunLike' | 'redDwarf';

const hrDiagram: VisualTemplate = {
  id: 'earth_space-hr-diagram',
  subject: 'earth_space',
  title: 'Stars on an H–R diagram',
  description:
    'A Hertzsprung–Russell diagram with six lettered stars; asks which star is a white dwarf, red giant, supergiant or red dwarf, or which is hottest, coolest, most or least luminous, largest or smallest.',
  make(rng) {
    const u = (a: number, b: number) => a + (b - a) * rng.next();
    const stars: Record<StarKind, [number, number]> = {
      whiteDwarf: [0, 0],
      redGiant: [0, 0],
      supergiant: [0, 0],
      hotMain: [0, 0],
      sunLike: [0, 0],
      redDwarf: [0, 0],
    };
    let t = u(3.92, 4.05);
    stars.whiteDwarf = [t, whiteDwarfLogL(t)];
    t = u(3.58, 3.66);
    stars.redGiant = [t, giantLogL(t) + u(-0.1, 0.1)];
    stars.supergiant = [u(3.56, 3.9), u(5.2, 5.7)];
    t = u(4.3, 4.45);
    stars.hotMain = [t, mainSequenceLogL(t)];
    t = u(3.73, 3.84);
    stars.sunLike = [t, mainSequenceLogL(t)];
    t = u(3.5, 3.56);
    stars.redDwarf = [t, mainSequenceLogL(t)];

    const kinds = Object.keys(stars) as StarKind[];
    const letterOf = Object.fromEntries(rng.shuffle(kinds).map((k, i) => [k, 'ABCDEF'[i]!])) as Record<StarKind, string>;
    const logR = (k: StarKind) => stars[k][1] / 2 - 2 * stars[k][0];

    // The extreme star for a property, but only when it beats the runner-up by a margin a reader can see.
    const extreme = (value: (k: StarKind) => number, sign: 1 | -1, margin: number): StarKind | null => {
      const sorted = [...kinds].sort((a, b) => sign * (value(b) - value(a)));
      return sign * (value(sorted[0]!) - value(sorted[1]!)) >= margin ? sorted[0]! : null;
    };
    const questions: Array<[string, StarKind | null]> = [
      ['Which lettered star is a white dwarf?', 'whiteDwarf'],
      ['Which lettered star is a red giant?', 'redGiant'],
      ['Which lettered star is a supergiant?', 'supergiant'],
      ['Which lettered star is a red dwarf?', 'redDwarf'],
      ['Which lettered star has the highest surface temperature?', extreme((k) => stars[k][0], 1, 0.05)],
      ['Which lettered star has the lowest surface temperature?', extreme((k) => stars[k][0], -1, 0.04)],
      ['Which lettered star has the greatest luminosity?', extreme((k) => stars[k][1], 1, 0.6)],
      ['Which lettered star has the lowest luminosity?', extreme((k) => stars[k][1], -1, 0.6)],
      ['Which lettered star has the largest radius?', extreme(logR, 1, 0.3)],
      ['Which lettered star has the smallest radius?', extreme(logR, -1, 0.3)],
    ];
    const [question, target] = rng.pick(questions.filter((q) => q[1] !== null)) as [string, StarKind];
    const answer = letterOf[target];

    const P = HR_PLOT;
    const parts: string[] = [];
    parts.push(rect(P.left, P.top, P.width, P.height, { width: 1.5 }));
    for (const [lt, ll] of HR_BACKGROUND) {
      const x = hrX(lt);
      const y = hrY(ll);
      if (x < P.left + 3 || x > P.left + P.width - 3 || y < P.top + 3 || y > P.top + P.height - 3) continue;
      parts.push(circle(x, y, 2, { stroke: 'none', fill: INK, opacity: 0.4 }));
    }
    for (const [lt, label] of [[Math.log10(40000), '40,000'], [Math.log10(20000), '20,000'], [4, '10,000'], [Math.log10(5000), '5,000'], [Math.log10(2500), '2,500']] as Array<[number, string]>) {
      const x = hrX(lt);
      parts.push(line(x, P.top + P.height, x, P.top + P.height + 5, { width: 1.5 }));
      parts.push(text(x, P.top + P.height + 20, label, { anchor: 'middle', size: 13 }));
    }
    for (const [ll, label] of [[-4, '10⁻⁴'], [-2, '10⁻²'], [0, '1'], [2, '10²'], [4, '10⁴'], [6, '10⁶']] as Array<[number, string]>) {
      const y = hrY(ll);
      parts.push(line(P.left - 5, y, P.left, y, { width: 1.5 }));
      parts.push(text(P.left - 9, y, label, { anchor: 'end', baseline: 'middle', size: 13 }));
    }
    parts.push(text(P.left + P.width / 2, P.top + P.height + 42, 'Surface temperature (K)', { anchor: 'middle', size: 14 }));
    parts.push(text(24, P.top + P.height / 2, 'Luminosity (Sun = 1)', { anchor: 'middle', baseline: 'middle', size: 14, rotate: -90 }));

    for (const k of kinds) {
      const x = hrX(stars[k][0]);
      const y = hrY(stars[k][1]);
      parts.push(circle(x, y, 6.5, { stroke: PAPER, width: 2, fill: INK }));
      const right = x < P.left + P.width - 34;
      parts.push(text(right ? x + 11 : x - 11, y, letterOf[k], { anchor: right ? 'start' : 'end', baseline: 'middle', size: 16, weight: 'bold' }));
    }

    const described = kinds
      .map((k) => [letterOf[k], k] as const)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([L, k]) => `${L} at about ${temperatureWords(stars[k][0])} with luminosity about ${luminosityWords(stars[k][1])}`)
      .join('; ');
    return {
      stem: `The figure shows a Hertzsprung–Russell diagram with six lettered stars. ${question}`,
      format: 'short_answer',
      answer,
      accept: [`STAR ${answer}`],
      svg: figure(480, 380, ...parts),
      alt: `A Hertzsprung–Russell diagram: luminosity compared with the Sun on a logarithmic vertical axis from 10⁻⁴ to 10⁶, and surface temperature on the horizontal axis, falling from 40,000 K at the left to 2,500 K at the right. Faint dots show the main sequence running from upper left to lower right, giants and supergiants above it to the right, and white dwarfs at the lower left. Lettered stars: ${described}.`,
      topic: 'earth_space.stars',
    };
  },
};

/* ---------------- seasons ---------------- */

const NH_EVENTS = ['June solstice', 'September equinox', 'December solstice', 'March equinox'];
/** The season that begins in the Southern Hemisphere at each of NH_EVENTS. */
const SH_SEASONS = ['Winter', 'Spring', 'Summer', 'Autumn'];
const ORBIT_SPOTS = ['at the right end of the orbit', 'at the far side of the orbit (top of the figure)', 'at the left end of the orbit', 'at the near side of the orbit (bottom of the figure)'];

/**
 * Which solstice or equinox happens with Earth at orbit position `pos` (0 right, 1 far side, 2 left, 3 near side,
 * counterclockwise as drawn) when the north end of the axis leans toward the left (tilt -1) or right (+1) of the figure:
 * 0 June solstice, 1 September equinox, 2 December solstice, 3 March equinox.
 */
export function seasonEvent(pos: number, tilt: -1 | 1): number {
  // The June solstice is where the north end leans toward the Sun at the center.
  const june = tilt === -1 ? 0 : 2;
  return (pos - june + 4) % 4;
}

const seasons: VisualTemplate = {
  id: 'earth_space-seasons',
  subject: 'earth_space',
  title: 'Solstices and equinoxes',
  description:
    "Earth at four points of its orbit with its tilted axis drawn, one position highlighted; asks which solstice or equinox occurs there, or which season begins then in the Southern Hemisphere.",
  make(rng) {
    const tilt = rng.chance(0.5) ? -1 : 1;
    const pos = rng.int(0, 3);
    const south = rng.chance(0.5);
    const event = seasonEvent(pos, tilt);

    const cx = 240;
    const cy = 170;
    const rx = 172;
    const ry = 92;
    const re = 17;
    const eps = rad(23.5);
    const spot = (t: number): [number, number] => [cx + rx * Math.cos(rad(t)), cy - ry * Math.sin(rad(t))];
    const parts: string[] = [];
    parts.push(ellipse(cx, cy, rx, ry, { width: 1.5, opacity: 0.8 }));
    for (const t of [45, 135, 225, 315]) {
      const [x, y] = spot(t);
      const dx = -rx * Math.sin(rad(t));
      const dy = -ry * Math.cos(rad(t));
      const len = Math.hypot(dx, dy);
      parts.push(arrowHead(x - (7 * dx) / len, y - (7 * dy) / len, x + (7 * dx) / len, y + (7 * dy) / len, 13));
    }
    parts.push(circle(cx, cy, 24, { fill: SUN_FILL, stroke: INK, width: 1.5 }));
    parts.push(text(cx, cy - 33, 'Sun', { anchor: 'middle', size: 15 }));

    const ax = tilt * Math.sin(eps);
    const ay = -Math.cos(eps);
    const earth = (x: number, y: number, highlight: boolean) => {
      const out: string[] = [];
      out.push(
        highlight
          ? circle(x, y, re, { fill: ACCENT, fillOpacity: 0.35, stroke: ACCENT, width: 3 })
          : circle(x, y, re, { fill: INK, fillOpacity: SOFT, stroke: INK, width: 1.5 }),
      );
      out.push(line(x - Math.cos(eps) * re, y - tilt * Math.sin(eps) * re, x + Math.cos(eps) * re, y + tilt * Math.sin(eps) * re, { width: 1.2, dash: '3 3' }));
      out.push(line(x - ax * 31, y - ay * 31, x + ax * 31, y + ay * 31, { width: 2.2 }));
      out.push(text(x + ax * 40, y + ay * 40, 'N', { anchor: 'middle', baseline: 'middle', size: 13, weight: 'bold' }));
      return out.join('');
    };
    const others: string[] = [];
    for (let p = 0; p < 4; p++) if (p !== pos) others.push(earth(...spot(p * 90), false));
    parts.push(`<g opacity="0.6">${others.join('')}</g>`);
    parts.push(earth(...spot(pos * 90), true));

    const intro = "The figure shows Earth at four points in its orbit around the Sun, seen at an angle from above, with arrows showing the direction of Earth's motion.";
    const correct = south ? SH_SEASONS[event]! : NH_EVENTS[event]!;
    const pool = south ? SH_SEASONS : NH_EVENTS;
    const { choices, answerLetter } = multipleChoice(correct, pool.filter((x) => x !== correct), rng);
    return {
      stem: south
        ? `${intro} Which season begins in the Southern Hemisphere when Earth is at the highlighted position?`
        : `${intro} Which of the following occurs when Earth is at the highlighted position?`,
      format: 'multiple_choice',
      choices,
      answerLetter,
      answer: correct,
      svg: figure(480, 310, ...parts),
      alt: `Earth's orbit drawn as an ellipse around the Sun, seen at an angle from above, with Earth at four positions: the two ends of the orbit, its far side and its near side. Arrows show Earth moving counterclockwise. At every position Earth's axis is drawn with its north end, marked N, leaning toward the ${tilt === -1 ? 'left' : 'right'} side of the figure. The highlighted Earth is ${ORBIT_SPOTS[pos]}.`,
      topic: 'earth_space.solar-system',
    };
  },
};

/* ---------------- an elliptical orbit ---------------- */

type OrbitAsk = 'eccentricity' | 'axis' | 'period' | 'speed';

/** Exact answers for an orbit with perihelion distance rp and aphelion distance ra (in AU). */
export function orbitAnswer(ask: OrbitAsk, rp: number, ra: number): string {
  if (ask === 'eccentricity') return fractionText(ra - rp, ra + rp);
  if (ask === 'axis') return fractionText(ra + rp, 2);
  if (ask === 'speed') return fractionText(ra, rp);
  const a = (ra + rp) / 2;
  const root = Math.round(Math.sqrt(a));
  if (root * root !== a) throw new Error(`orbitAnswer: semi-major axis ${a} AU is not a perfect square`);
  return String(root * root * root);
}

const ellipticalOrbit: VisualTemplate = {
  id: 'earth_space-elliptical-orbit',
  subject: 'earth_space',
  title: "Kepler's laws on an elliptical orbit",
  description:
    'An elliptical orbit around the Sun drawn to scale, with the perihelion and aphelion distances labeled in AU; asks for the eccentricity, the semi-major axis, the period, or the ratio of speeds at perihelion and aphelion.',
  make(rng) {
    const ask = rng.pick<OrbitAsk>(['eccentricity', 'eccentricity', 'axis', 'period', 'speed']);
    let rp: number;
    let ra: number;
    if (ask === 'period') {
      const a = rng.pick([4, 9, 16, 25]);
      rp = rng.int(Math.ceil(0.2 * a), Math.floor(0.8 * a));
      ra = 2 * a - rp;
    } else {
      rp = rng.int(1, 9);
      ra = rng.int(Math.ceil(1.5 * rp), Math.min(9 * rp, 40));
    }
    const e = (ra - rp) / (ra + rp);
    const answer = orbitAnswer(ask, rp, ra);

    // Drawn to scale: semi-major axis A and semi-minor axis B in figure units.
    const A = Math.min(150, 116 / Math.sqrt(1 - e * e));
    const B = A * Math.sqrt(1 - e * e);
    const cx = 240;
    const cy = B + 34;
    const H = Math.round(2 * B + 84);
    const side = rng.chance(0.5) ? 1 : -1; // perihelion on the right (1) or the left (-1)
    const sunX = cx + side * A * e;
    const periX = cx + side * A;
    const apX = cx - side * A;
    const parts: string[] = [];
    parts.push(ellipse(cx, cy, A, B, { width: 2.5 }));
    parts.push(line(apX, cy, periX, cy, { width: 1, dash: '4 4', opacity: 0.7 }));
    parts.push(dot(periX, cy, 4.5));
    parts.push(dot(apX, cy, 4.5));
    parts.push(circle(sunX, cy, 10, { fill: SUN_FILL, stroke: INK, width: 1.5 }));
    parts.push(text(sunX, cy + 28, 'Sun', { anchor: 'middle', size: 14 }));
    parts.push(text(periX + side * 10, cy, 'Perihelion', { anchor: side === 1 ? 'start' : 'end', baseline: 'middle', size: 14 }));
    parts.push(text(apX - side * 10, cy, 'Aphelion', { anchor: side === 1 ? 'end' : 'start', baseline: 'middle', size: 14 }));
    const dimY = cy - 15;
    parts.push(line(sunX, cy - 11, sunX, dimY - 4, { width: 1 }));
    parts.push(arrow(sunX, dimY, periX, dimY, { width: 1.3, head: 7, both: true }));
    parts.push(arrow(sunX, dimY, apX, dimY, { width: 1.3, head: 7, both: true }));
    // Each distance sits over its dimension line, but stays inside the ellipse (near a vertex the curve is close).
    const labelY = dimY - 7;
    const top = labelY - 11 - cy;
    const halfWidth = A * Math.sqrt(Math.max(0, 1 - (top / B) ** 2));
    const distanceLabel = (x1: number, x2: number, label: string) => {
      const w = textWidth(label, 14);
      const mid = Math.min(cx + halfWidth - 7 - w / 2, Math.max(cx - halfWidth + 7 + w / 2, (x1 + x2) / 2));
      return text(mid, labelY, label, { anchor: 'middle', size: 14 });
    };
    parts.push(distanceLabel(sunX, periX, `${rp} AU`));
    parts.push(distanceLabel(sunX, apX, `${ra} AU`));

    const body = e >= 0.6 ? 'a comet' : 'an asteroid';
    const intro = `The figure shows the orbit of ${body} around the Sun, with its perihelion and aphelion distances labeled.`;
    const questions: Record<OrbitAsk, string> = {
      eccentricity: 'What is the eccentricity of the orbit?',
      axis: "In astronomical units, what is the length of the orbit's semi-major axis?",
      period: `In years, what is the orbital period of the ${body.split(' ')[1]}?`,
      speed: `By what factor is the ${body.split(' ')[1]}'s orbital speed at perihelion greater than its orbital speed at aphelion?`,
    };
    return {
      stem: `${intro} ${questions[ask]}`,
      format: 'short_answer',
      answer,
      svg: figure(480, H, ...parts),
      alt: `An elliptical orbit drawn to scale with the Sun at one focus. The distance from the Sun to the perihelion point is labeled ${rp} AU and the distance from the Sun to the aphelion point is labeled ${ra} AU.`,
      topic: 'earth_space.solar-system',
    };
  },
};

/* ---------------- a topographic map ---------------- */

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

type TopoAsk = 'elevation' | 'relief' | 'interval';

const topographicMap: VisualTemplate = {
  id: 'earth_space-topographic-map',
  subject: 'earth_space',
  title: 'Reading a topographic map',
  description:
    'A contour map of a hill with two contour lines labeled; asks for the elevation of a marked point, the difference in elevation between two marked points, or the contour interval.',
  make(rng) {
    const feet = rng.chance(0.35);
    const unitWord = feet ? 'feet' : 'meters';
    const unitShort = feet ? 'ft' : 'm';
    const interval = feet ? rng.pick([10, 20, 40, 50, 100]) : rng.pick([5, 10, 20, 25, 50]);
    const n = rng.int(5, 7);
    const base = interval * rng.int(Math.ceil(100 / interval), Math.floor(1500 / interval));
    const elev = (k: number) => base + k * interval;
    const ask = rng.pick<TopoAsk>(['elevation', 'elevation', 'relief', 'interval']);

    // The hill: n nested closed contours. Contour k is s_k·f(θ) around a center that drifts a little from
    // level to level (less than the gap between levels, so contours never cross).
    const amp = [0.04 + 0.06 * rng.next(), 0.06 + 0.1 * rng.next(), 0.05 * rng.next()];
    const ph = [rng.next(), rng.next(), rng.next()].map((x) => x * 2 * Math.PI);
    const f = (t: number) => 1 + amp[0]! * Math.cos(t + ph[0]!) + amp[1]! * Math.cos(2 * t + ph[1]!) + amp[2]! * Math.cos(3 * t + ph[2]!);
    const ax = 1.32;
    const ay = 1.0;
    const frame = { x0: 14, y0: 14, x1: 466, y1: 316 };
    const cx = 240 + rng.int(-15, 15);
    const cy = 165 + rng.int(-6, 6);
    let s0 = 106;
    for (let i = 0; i < 360; i += 2) {
      const t = rad(i);
      const x = f(t) * Math.cos(t) * ax;
      const y = f(t) * Math.sin(t) * ay;
      if (x > 1e-6) s0 = Math.min(s0, (frame.x1 - 10 - cx) / x);
      if (x < -1e-6) s0 = Math.min(s0, (cx - frame.x0 - 10) / -x);
      if (y > 1e-6) s0 = Math.min(s0, (cy - frame.y0 - 12) / y);
      if (y < -1e-6) s0 = Math.min(s0, (frame.y1 - 12 - cy) / -y);
    }
    const step = s0 / (n + 0.6);
    const drift = [rng.next() * 4 - 2, rng.next() * 4 - 2];
    const pointAt = (k: number, deg: number): [number, number] => {
      const t = rad(deg);
      const r = (s0 - k * step) * f(t);
      return [cx + k * drift[0]! + r * Math.cos(t) * ax, cy + k * drift[1]! - r * Math.sin(t) * ay];
    };

    // Which contours carry elevation labels, and which carry the lettered points.
    let labeled: [number, number];
    let pts: number[] = [];
    if (ask === 'interval') {
      const k1 = rng.int(0, 1);
      labeled = [k1, k1 + rng.int(2, Math.min(4, n - 1 - k1))];
    } else {
      labeled = [0, rng.pick([2, 3])];
      const free = [];
      for (let k = 1; k < n; k++) if (!labeled.includes(k)) free.push(k);
      pts = rng.sample(free, 2);
    }

    const parts: string[] = [];
    parts.push(rect(frame.x0, frame.y0, frame.x1 - frame.x0, frame.y1 - frame.y0, { width: 1.5 }));
    for (let k = 0; k < n; k++) {
      const ring: Array<[number, number]> = [];
      for (let i = 0; i < 360; i += 3) ring.push(pointAt(k, i));
      parts.push(polygon(ring, { width: labeled.includes(k) ? 2.2 : 1.4 }));
    }
    // Elevation labels sit on their contour near the top and the bottom of the hill, where the lines run across.
    const labelDeg = rng.chance(0.5) ? [90 + rng.int(-25, 25), 270 + rng.int(-25, 25)] : [270 + rng.int(-25, 25), 90 + rng.int(-25, 25)];
    labeled.forEach((k, i) => {
      const [x, y] = pointAt(k, labelDeg[i]!);
      parts.push(text(x, y, commas(elev(k)), { anchor: 'middle', baseline: 'middle', size: 13 }));
    });
    // Lettered points sit on the sides of the hill, one on each side.
    const pointDeg = rng.chance(0.5) ? [rng.int(-25, 25), 180 + rng.int(-25, 25)] : [180 + rng.int(-25, 25), rng.int(-25, 25)];
    pts.forEach((k, i) => {
      const [x, y] = pointAt(k, pointDeg[i]!);
      parts.push(circle(x, y, 4.5, { stroke: PAPER, width: 1.5, fill: ACCENT }));
      parts.push(text(x, y - 12, 'AB'[i]!, { anchor: 'middle', size: 15, weight: 'bold' }));
    });
    if (ask !== 'interval') parts.push(text(frame.x0, frame.y1 + 22, `Contour interval: ${interval} ${unitShort}`, { size: 14 }));

    let answer: number;
    let question: string;
    if (ask === 'interval') {
      answer = interval;
      question = `The topographic map shows a hill with two contour lines labeled. In ${unitWord}, what is the contour interval of the map?`;
    } else if (ask === 'relief') {
      answer = Math.abs(pts[0]! - pts[1]!) * interval;
      question = `The topographic map shows a hill. In ${unitWord}, what is the difference in elevation between points A and B?`;
    } else {
      const which = rng.int(0, 1);
      answer = elev(pts[which]!);
      question = `The topographic map shows a hill. In ${unitWord}, what is the elevation of point ${'AB'[which]}?`;
    }
    const nth = (k: number) => (k === 0 ? 'outermost contour' : `${ORDINALS[k]} contour from the outside`);
    const altParts = [
      `A topographic map of a hill drawn as ${n} closed contour lines, one inside the next.`,
      `The ${nth(labeled[0])} is labeled ${commas(elev(labeled[0]))} and the ${nth(labeled[1])} is labeled ${commas(elev(labeled[1]))}.`,
    ];
    if (ask !== 'interval') {
      altParts.push(`The contour interval is ${interval} ${unitWord}.`);
      altParts.push(`Point A lies on the ${nth(pts[0]!)} and point B on the ${nth(pts[1]!)}.`);
    }
    return {
      stem: question,
      format: 'short_answer',
      answer: commas(answer),
      svg: figure(480, 346, ...parts),
      alt: altParts.join(' '),
      topic: 'earth_space.surface-hydrology',
    };
  },
};

/* ---------------- relative dating in a cross-section ---------------- */

interface GeoFeature {
  kind: 'layer' | 'dike' | 'fault' | 'surface';
  /** Filled pieces (layers, the dike). */
  polys: Pt[][];
  /** Line pieces (the fault, the erosion surface). */
  segs: Array<[Pt, Pt]>;
  /** Fill opacity of a layer. */
  shade: number;
  letter: string;
  upper: boolean;
}

const SECTION = { x0: 20, y0: 18, x1: 460, y1: 318 };

function clipSeg(seg: [Pt, Pt], f: (p: Pt) => number): [Pt, Pt] | null {
  const [a, b] = seg;
  const fa = f(a);
  const fb = f(b);
  if (fa < 0 && fb < 0) return null;
  if (fa >= 0 && fb >= 0) return seg;
  const t = fa / (fa - fb);
  const c: Pt = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return fa >= 0 ? [a, c] : [c, b];
}

function clipSegRect(seg: [Pt, Pt]): [Pt, Pt] | null {
  const { x0, y0, x1, y1 } = SECTION;
  let s: [Pt, Pt] | null = seg;
  for (const f of [(q: Pt) => q[0] - x0, (q: Pt) => x1 - q[0], (q: Pt) => q[1] - y0, (q: Pt) => y1 - q[1]]) {
    if (!s) return null;
    s = clipSeg(s, f);
  }
  return s;
}

/** The vertical extent of a convex polygon at x, or null. */
function spanAtX(poly: readonly Pt[], x: number): [number, number] | null {
  const ys: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) ys.push(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
  }
  return ys.length >= 2 ? [Math.min(...ys), Math.max(...ys)] : null;
}

/** The horizontal extent of a convex polygon at y, or null. */
function spanAtY(poly: readonly Pt[], y: number): [number, number] | null {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null;
}

function wavy(a: Pt, b: Pt): string {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1) return '';
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const pts: Array<[number, number]> = [];
  for (let d = 0; d <= len; d += 2) {
    const w = 2.6 * Math.sin((d / 14) * 2 * Math.PI);
    pts.push([a[0] + ux * d - uy * w, a[1] + uy * d + ux * w]);
  }
  return polyline(pts, { width: 2.2 });
}

interface Section {
  features: GeoFeature[];
  /** Letters in order of formation, oldest first. */
  ageOrder: string[];
  dike?: string;
  fault?: string;
  alt: string;
  labels: string[];
}

/** Build one cross-section, or null when its labels do not fit (the caller tries again). */
function buildSection(rng: Rng, simple: boolean): Section | null {
  const { x0, y0, x1, y1 } = SECTION;
  const erosion = !simple && rng.chance(0.5);
  const tiltDeg = erosion && rng.chance(0.6) ? (rng.chance(0.5) ? -1 : 1) * (8 + 8 * rng.next()) : 0;
  const events: Array<'dike' | 'fault'> = simple ? ['dike'] : rng.pick([['dike'], ['fault'], ['dike', 'fault'], ['fault', 'dike'], ['dike', 'fault'], ['fault', 'dike']]);
  const chronology: Array<'dike' | 'fault' | 'erosion'> = [...events];
  if (erosion) chronology.splice(rng.int(1, events.length), 0, 'erosion');

  const nUpper = erosion ? rng.int(1, 2) : 0;
  const tUpper = 34 + rng.int(0, 8);
  const yU = y0 + nUpper * tUpper;
  const yTop = erosion ? yU : y0;
  const nLower = erosion ? rng.int(3, 4) : rng.int(3, 5);
  const hl = y1 - yTop;
  const raw = Array.from({ length: nLower }, () => 0.85 + 0.3 * rng.next());
  const sum = raw.reduce((a, b) => a + b, 0);
  const thick = raw.map((x) => (x * hl) / sum);

  // Lower layers, oldest first: horizontal bands (the oldest reaches far down, the youngest far up), then tilted.
  const pivot: Pt = [240, (yTop + y1) / 2];
  const turn = rad(tiltDeg);
  const rotate = (p: Pt): Pt => {
    const dx = p[0] - pivot[0];
    const dy = p[1] - pivot[1];
    return [pivot[0] + dx * Math.cos(turn) - dy * Math.sin(turn), pivot[1] + dx * Math.sin(turn) + dy * Math.cos(turn)];
  };
  const band = (top: number, bottom: number): Pt[] => [[-1500, top], [2000, top], [2000, bottom], [-1500, bottom]];
  const shades = [0.07, 0.22, 0.12, 0.3, 0.17];
  const features: GeoFeature[] = [];
  let bottom = 1500;
  let boundary = y1;
  for (let i = 0; i < nLower; i++) {
    boundary -= thick[i]!;
    const top = i === nLower - 1 ? -1500 : boundary;
    features.push({ kind: 'layer', polys: [band(top, bottom).map(rotate)], segs: [], shade: shades[i]!, letter: '', upper: false });
    bottom = boundary;
  }

  // The dike and the fault cross at P, inside the lower layers, so their relative age shows.
  const P: Pt = [190 + rng.int(0, 100), yTop + hl * (0.45 + 0.25 * rng.next())];
  const beta = rad(28 + rng.int(0, 12));
  const dip = rng.chance(0.5) ? 1 : -1;
  const normal = rng.chance(0.6);
  const slip = Math.max((22 + rng.int(0, 10)) / Math.cos(beta), 17 / Math.sin(beta));
  const faultX = (y: number) => P[0] + dip * Math.tan(beta) * (y - P[1]);
  const side = (q: Pt) => dip * (q[0] - faultX(q[1]));
  const shift: Pt = [(normal ? 1 : -1) * slip * dip * Math.sin(beta), (normal ? 1 : -1) * slip * Math.cos(beta)];
  const lean = (rng.next() - 0.5) * 0.4;
  const width = 16 + rng.int(0, 6);
  const dikeX = (y: number) => P[0] + lean * (y - P[1]);

  let upperShade = 0;
  for (const ev of chronology) {
    if (ev === 'dike') {
      const poly: Pt[] = [[dikeX(-1500) - width / 2, -1500], [dikeX(-1500) + width / 2, -1500], [dikeX(1500) + width / 2, 1500], [dikeX(1500) - width / 2, 1500]];
      features.push({ kind: 'dike', polys: [poly], segs: [], shade: 0, letter: '', upper: false });
    } else if (ev === 'fault') {
      for (const ft of features) {
        const polys: Pt[][] = [];
        for (const p of ft.polys) {
          const foot = clipHalf(p, (q) => -side(q));
          const hang = clipHalf(p, side).map(([x, y]): Pt => [x + shift[0], y + shift[1]]);
          if (foot.length >= 3) polys.push(foot);
          if (hang.length >= 3) polys.push(hang);
        }
        const segs: Array<[Pt, Pt]> = [];
        for (const s of ft.segs) {
          const foot = clipSeg(s, (q) => -side(q));
          const hang = clipSeg(s, side);
          if (foot) segs.push(foot);
          if (hang) segs.push([[hang[0][0] + shift[0], hang[0][1] + shift[1]], [hang[1][0] + shift[0], hang[1][1] + shift[1]]]);
        }
        ft.polys = polys;
        ft.segs = segs;
      }
      features.push({ kind: 'fault', polys: [], segs: [[[faultX(-1500), -1500], [faultX(1500), 1500]]], shade: 0, letter: '', upper: false });
    } else {
      for (const ft of features) {
        ft.polys = ft.polys.map((p) => clipHalf(p, (q) => q[1] - yU)).filter((p) => p.length >= 3);
        ft.segs = ft.segs.map((s) => clipSeg(s, (q) => q[1] - yU)).filter((s): s is [Pt, Pt] => s !== null);
      }
      features.push({ kind: 'surface', polys: [], segs: [[[-1500, yU], [2000, yU]]], shade: 0, letter: '', upper: false });
      let b = yU;
      for (let i = 0; i < nUpper; i++) {
        const top = i === nUpper - 1 ? -1500 : b - tUpper;
        features.push({ kind: 'layer', polys: [band(top, b)], segs: [], shade: [0.04, 0.2][upperShade++ % 2]!, letter: '', upper: true });
        b -= tUpper;
      }
    }
  }
  for (const ft of features) {
    ft.polys = ft.polys.map((p) => clipRect(p, x0, y0, x1, y1)).filter((p) => p.length >= 3 && polygonArea(p) > 1);
    ft.segs = ft.segs.map(clipSegRect).filter((s): s is [Pt, Pt] => s !== null && Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) > 1);
  }

  const lettered = features.filter((ft) => ft.kind !== 'surface');
  const letters = rng.shuffle('ABCDEFGHJK'.slice(0, lettered.length).split(''));
  lettered.forEach((ft, i) => (ft.letter = letters[i]!));

  // Labels: the dike's inside it, the fault's beside it, each layer's in its roomiest spot clear of everything else.
  const placed: Pt[] = [];
  const labels: string[] = [];
  const dikePolys = features.filter((ft) => ft.kind === 'dike').flatMap((ft) => ft.polys);
  const faultSegs = features.filter((ft) => ft.kind === 'fault').flatMap((ft) => ft.segs);
  const surfaceSegs = features.filter((ft) => ft.kind === 'surface').flatMap((ft) => ft.segs);
  const clearOf = (p: Pt, hx: number, hy: number, own: GeoFeature) => {
    const corners: Pt[] = [[p[0] - hx, p[1] - hy], [p[0] + hx, p[1] - hy], [p[0] + hx, p[1] + hy], [p[0] - hx, p[1] + hy], p];
    if (p[0] - hx < x0 + 4 || p[0] + hx > x1 - 4 || p[1] - hy < y0 + 3 || p[1] + hy > y1 - 3) return false;
    if (placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 30)) return false;
    if (own.kind !== 'dike' && dikePolys.some((d) => corners.some((c) => insideConvex(d, c)) || edgeDistance(d, p) < hx + 5)) return false;
    if (own.kind !== 'fault' && faultSegs.some((s) => segmentDistance(p, s[0], s[1]) < hx + 6)) return false;
    if (surfaceSegs.some((s) => segmentDistance(p, s[0], s[1]) < hy + 5)) return false;
    return true;
  };
  const put = (ft: GeoFeature, p: Pt) => {
    placed.push(p);
    labels.push(text(p[0], p[1], ft.letter, { anchor: 'middle', baseline: 'middle', size: 16, weight: 'bold' }));
  };
  for (const ft of lettered.filter((x) => x.kind === 'dike')) {
    let best: Pt | null = null;
    let bestRoom = 0;
    for (const poly of ft.polys) {
      for (let y = y0 + 16; y <= y1 - 16; y += 6) {
        const span = spanAtY(poly, y);
        if (!span) continue;
        const p: Pt = [(span[0] + span[1]) / 2, y];
        const room = Math.min((span[1] - span[0]) / 2, ...[-11, 11].map((dy) => {
          const s2 = spanAtY(poly, y + dy);
          return s2 ? Math.min(p[0] - s2[0], s2[1] - p[0]) : 0;
        }));
        if (room < 6.5 || !clearOf(p, 6, 9, ft)) continue;
        const score = room - Math.abs(y - (y0 + y1) / 2) * 0.01;
        if (score > bestRoom) [best, bestRoom] = [p, score];
      }
    }
    if (!best) return null;
    put(ft, best);
  }
  // The fault's letter goes just below the section, where the fault meets the bottom edge (every fault reaches it).
  for (const ft of lettered.filter((x) => x.kind === 'fault')) {
    const ends = ft.segs.flatMap((sg) => sg).filter((q) => Math.abs(q[1] - y1) < 0.5);
    if (ends.length === 0) return null;
    const xb = ends[0]![0];
    if (xb < x0 + 10 || xb > x1 - 10) return null;
    labels.push(text(xb, y1 + 17, ft.letter, { anchor: 'middle', baseline: 'middle', size: 16, weight: 'bold' }));
  }
  for (const ft of lettered.filter((x) => x.kind === 'layer')) {
    let best: Pt | null = null;
    let bestScore = -Infinity;
    for (const poly of ft.polys) {
      for (let x = x0 + 16; x <= x1 - 16; x += 8) {
        const span = spanAtX(poly, x);
        if (!span) continue;
        const p: Pt = [x, (span[0] + span[1]) / 2];
        const corners: Pt[] = [[x - 9, p[1] - 10], [x + 9, p[1] - 10], [x + 9, p[1] + 10], [x - 9, p[1] + 10]];
        if (!corners.every((c) => insideConvex(poly, c))) continue;
        if (!clearOf(p, 9, 10, ft)) continue;
        const clearance = Math.min(80, ...dikePolys.map((d) => edgeDistance(d, p)), ...faultSegs.map((sg) => segmentDistance(p, sg[0], sg[1])));
        const score = Math.min(edgeDistance(poly, p), 20) + 0.25 * clearance;
        if (score > bestScore) [best, bestScore] = [p, score];
      }
    }
    if (!best) return null;
    put(ft, best);
  }

  const ageOrder = lettered.map((ft) => ft.letter);
  const dike = lettered.find((ft) => ft.kind === 'dike');
  const fault = lettered.find((ft) => ft.kind === 'fault');
  const lower = lettered.filter((ft) => ft.kind === 'layer' && !ft.upper).map((ft) => ft.letter);
  const upper = lettered.filter((ft) => ft.upper).map((ft) => ft.letter);
  const list = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const before = (ft: GeoFeature) => lettered.slice(0, lettered.indexOf(ft));
  const alt: string[] = [
    `A geologic cross-section. Sedimentary layers ${list(lower)}, from bottom to top${tiltDeg ? ', are tilted' : ''}.`,
  ];
  if (dike) {
    const cut = before(dike).filter((ft) => ft.kind === 'layer').map((ft) => ft.letter);
    alt.push(`An igneous intrusion, ${dike.letter}, cuts through layers ${list(cut)}.`);
  }
  if (fault) {
    const cut = before(fault).filter((ft) => ft.kind === 'layer').map((ft) => ft.letter);
    const offsetsDike = dike && before(fault).includes(dike);
    alt.push(`Fault ${fault.letter} offsets layers ${list(cut)}${offsetsDike ? ` and intrusion ${dike.letter}` : ''}.`);
    if (dike && !offsetsDike) alt.push(`Intrusion ${dike.letter} crosses fault ${fault.letter} without being offset.`);
  }
  if (erosion) {
    const surface = features.find((ft) => ft.kind === 'surface')!;
    const truncated = lettered.slice(0, features.indexOf(surface)).filter((ft) => !ft.upper && ft.kind !== 'layer').map((ft) => (ft.kind === 'dike' ? `intrusion ${ft.letter}` : `fault ${ft.letter}`));
    alt.push(`A wavy erosion surface cuts across the lower layers${truncated.length ? ` and ${list(truncated)}` : ''}; ${upper.length === 1 ? `layer ${upper[0]} lies` : `layers ${list(upper)} lie`} on top of it${upper.length > 1 ? ', from bottom to top' : ''}.`);
  }
  return { features, ageOrder, dike: dike?.letter, fault: fault?.letter, alt: alt.join(' '), labels };
}

function drawSection(s: Section): string {
  const { x0, y0, x1, y1 } = SECTION;
  const parts: string[] = [];
  for (const ft of s.features) {
    if (ft.kind === 'layer') for (const p of ft.polys) parts.push(polygon(p, { stroke: INK, width: 1, fill: INK, fillOpacity: ft.shade }));
    if (ft.kind === 'dike') {
      for (const p of ft.polys) {
        parts.push(polygon(p, { stroke: 'none', fill: PAPER }));
        parts.push(polygon(p, { stroke: INK, width: 1.4, fill: INK, fillOpacity: 0.5 }));
      }
    }
    if (ft.kind === 'fault') for (const [a, b] of ft.segs) parts.push(line(a[0], a[1], b[0], b[1], { width: 3.2 }));
    if (ft.kind === 'surface') for (const [a, b] of ft.segs) parts.push(wavy(a, b));
  }
  parts.push(rect(x0, y0, x1 - x0, y1 - y0, { width: 1.8 }));
  parts.push(...s.labels);
  return figure(480, 346, ...parts);
}

type DatingAsk = 'oldest' | 'youngest' | 'pair';

const relativeDating: VisualTemplate = {
  id: 'earth_space-relative-dating',
  subject: 'earth_space',
  title: 'Relative dating in a cross-section',
  description:
    'A geologic cross-section with lettered sedimentary layers, an igneous intrusion and/or a fault, sometimes an unconformity; asks for the oldest or youngest feature, or which of the intrusion and the fault is younger.',
  make(rng) {
    let s: Section | null = null;
    for (let i = 0; i < 40 && !s; i++) s = buildSection(rng, false);
    if (!s) s = buildSection(rng, true);
    if (!s) throw new Error('relative dating: no layout fits');
    const asks: DatingAsk[] = ['oldest', 'youngest', 'youngest'];
    if (s.dike && s.fault) asks.push('pair', 'pair');
    const ask = rng.pick(asks);
    const has = [s.dike ? 'an igneous intrusion' : '', s.fault ? 'a fault' : ''].filter(Boolean).join(' and ');
    const intro = `The geologic cross-section shows sedimentary rock layers and ${has}, each labeled with a letter. The layers have not been overturned.`;
    let stem: string;
    let answer: string;
    if (ask === 'pair') {
      const dikeAge = s.ageOrder.indexOf(s.dike!);
      const faultAge = s.ageOrder.indexOf(s.fault!);
      answer = dikeAge > faultAge ? s.dike! : s.fault!;
      stem = `${intro} Which is younger, intrusion ${s.dike} or fault ${s.fault}?`;
    } else if (ask === 'oldest') {
      answer = s.ageOrder[0]!;
      stem = `${intro} Which lettered feature is the oldest?`;
    } else {
      answer = s.ageOrder[s.ageOrder.length - 1]!;
      stem = `${intro} Which lettered feature is the youngest?`;
    }
    return {
      stem,
      format: 'short_answer',
      answer,
      accept: [answer === s.dike ? `INTRUSION ${answer}` : answer === s.fault ? `FAULT ${answer}` : `LAYER ${answer}`, `FEATURE ${answer}`],
      svg: drawSection(s),
      alt: s.alt,
      topic: 'earth_space.geologic-time-fossils',
    };
  },
};

export const EARTH_SPACE_TEMPLATES: VisualTemplate[] = [moonPhase, hrDiagram, seasons, ellipticalOrbit, topographicMap, relativeDating];
