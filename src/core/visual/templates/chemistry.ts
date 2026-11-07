/**
 * Generated visual bonuses: chemistry.
 * Each template draws a figure (svg.ts) and asks a bonus question about it with an exact answer.
 * See src/core/visual/README.md for the rules every template follows.
 *
 * Each template is a pure `...Draft(params)` builder (exported for the tests) and a `make(rng)` that
 * picks the parameters.
 */
import { multipleChoice } from '../choices';
import type { Rng } from '../rng';
import { ACCENT, arrow, dot, figure, line, plane, rect, text } from '../svg';
import type { VisualDraft, VisualTemplate } from '../types';
import { element, groundState, tablePosition } from './elements';
import { framedAxes, steps } from './graphs';

/* ---------------- an element on the periodic table ---------------- */

/** Main-group elements of periods 1–6 and the period 4 transition metals. */
export const TABLE_POOL: number[] = [];
for (let z = 1; z <= 86; z++) {
  const pos = tablePosition(z);
  if (pos && (pos.group <= 2 || pos.group >= 13 || pos.period === 4)) TABLE_POOL.push(z);
}

function cellExists(period: number, group: number): boolean {
  if (period === 1) return group === 1 || group === 18;
  if (period <= 3) return group <= 2 || group >= 13;
  return true;
}

function periodicFigure(period: number, group: number): string {
  const S = 24;
  const x0 = 34;
  const y0 = 30;
  const parts: string[] = [];
  for (let g = 1; g <= 18; g++) parts.push(text(x0 + (g - 0.5) * S, y0 - 8, String(g), { anchor: 'middle', size: 13 }));
  for (let p = 1; p <= 7; p++) parts.push(text(x0 - 8, y0 + (p - 0.5) * S, String(p), { anchor: 'end', baseline: 'middle', size: 13 }));
  for (let p = 1; p <= 7; p++) {
    for (let g = 1; g <= 18; g++) if (cellExists(p, g)) parts.push(rect(x0 + (g - 1) * S, y0 + (p - 1) * S, S, S, { width: 1.2 }));
  }
  // The lanthanide and actinide rows below the table.
  const fy = y0 + 7 * S + 14;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 14; c++) parts.push(rect(x0 + (3 + c) * S, fy + r * S, S, S, { width: 1.2 }));
  parts.push(rect(x0 + (group - 1) * S, y0 + (period - 1) * S, S, S, { stroke: ACCENT, width: 3, fill: ACCENT, fillOpacity: 0.55 }));
  return figure(480, 270, ...parts);
}

export function periodicDraft(z: number, ask: 'name' | 'number'): VisualDraft {
  const pos = tablePosition(z);
  if (!pos) throw new Error(`periodicDraft: no table position for Z = ${z}`);
  const el = element(z);
  return {
    stem:
      ask === 'name'
        ? 'What element occupies the highlighted cell of this periodic table?'
        : 'What is the atomic number of the element in the highlighted cell of this periodic table?',
    format: 'short_answer',
    ...(ask === 'name' ? { answer: el.name, accept: el.accept } : { answer: String(z) }),
    svg: periodicFigure(pos.period, pos.group),
    alt: 'An outline of the periodic table with group numbers 1 to 18 across the top and period numbers 1 to 7 down the side. One cell is highlighted.',
    topic: 'chemistry.periodic-trends',
  };
}

const periodicTable: VisualTemplate = {
  id: 'chemistry-periodic-table',
  subject: 'chemistry',
  title: 'Element on the periodic table',
  description: 'A blank periodic table with one highlighted cell (a main-group element or a period 4 transition metal); asks for the element or its atomic number.',
  make(rng) {
    return periodicDraft(rng.pick(TABLE_POOL), rng.chance(0.7) ? 'name' : 'number');
  },
};

/* ---------------- orbital box diagrams ---------------- */

/** One orbital box: its electrons' spins (+1 up, −1 down). Two up arrows break the Pauli principle. */
export type Box = Array<1 | -1>;
export interface ShownSubshell {
  name: string;
  boxes: Box[];
}
export interface OrbitalDiagram {
  /** Noble-gas core written before the boxes, e.g. "[Ne]", or null to show every subshell. */
  core: string | null;
  shells: ShownSubshell[];
}

const BOXES: Record<string, number> = { s: 1, p: 3, d: 5 };

/** Boxes for a subshell filled by Hund's rule: one up arrow in each box before any pairing. */
export function hundBoxes(count: number, electrons: number): Box[] {
  const boxes: Box[] = Array.from({ length: count }, () => []);
  for (let i = 0; i < Math.min(electrons, count); i++) boxes[i].push(1);
  for (let i = 0; i < electrons - count; i++) boxes[i].push(-1);
  return boxes;
}

/** The subshells a diagram shows for Z (Z ≤ 10 from 1s; then after a [Ne] or [Ar] core), with electron counts. */
function shownSubshells(z: number, config: Array<{ subshell: string; electrons: number }>): { core: string | null; shells: typeof config } {
  if (z <= 10) return { core: null, shells: config };
  const core = z <= 18 ? '[Ne]' : '[Ar]';
  const first = z <= 18 ? 3 : 5; // index of 3s or 4s in filling order
  return { core, shells: config.slice(first) };
}

/** The ground-state diagram of a neutral atom (Z ≤ 36). */
export function groundDiagram(z: number): OrbitalDiagram {
  const { core, shells } = shownSubshells(z, groundState(z));
  return { core, shells: shells.map((s) => ({ name: s.subshell, boxes: hundBoxes(BOXES[s.subshell[1]], s.electrons) })) };
}

export type OrbitalRule = 'aufbau' | 'hund' | 'pauli' | 'none';

/** Atoms that can show each violation in their valence shell (Z ≤ 18). */
export const RULE_ATOMS: Record<OrbitalRule, number[]> = {
  // One valence s electron moved up into the p subshell (needs room in p): 1s² 2s¹ 2p² for boron.
  aufbau: [3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17],
  // Two to four p electrons, paired while a p box stays empty.
  hund: [6, 7, 8, 14, 15, 16],
  // A filled s box drawn with two up arrows.
  pauli: [3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18],
  none: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
};

/** A diagram for Z (≤ 18) that breaks exactly the given rule ('none': the ground state). */
export function ruleDiagram(z: number, rule: OrbitalRule, rng: Rng): OrbitalDiagram {
  const ground = groundDiagram(z);
  if (rule === 'none') return ground;
  const counts = shownSubshells(z, groundState(z));
  const n = z <= 10 ? 2 : 3; // valence shell
  const sName = `${n}s`;
  const pName = `${n}p`;
  const sCount = counts.shells.find((s) => s.subshell === sName)?.electrons ?? 0;
  const pCount = counts.shells.find((s) => s.subshell === pName)?.electrons ?? 0;
  const lower = ground.shells.filter((s) => s.name !== sName && s.name !== pName);
  if (rule === 'aufbau') {
    return {
      core: ground.core,
      shells: [...lower, { name: sName, boxes: hundBoxes(1, sCount - 1) }, { name: pName, boxes: hundBoxes(3, pCount + 1) }],
    };
  }
  if (rule === 'hund') {
    // Pair the p electrons first: p² → [↑↓][ ][ ], p³ → [↑↓][↑][ ], p⁴ → [↑↓][↑↓][ ].
    const boxes: Box[] = [[], [], []];
    for (let i = 0; i < pCount; i++) boxes[Math.floor(i / 2)].push(i % 2 === 0 ? 1 : -1);
    const s = ground.shells.find((x) => x.name === sName)!;
    return { core: ground.core, shells: [...lower, s, { name: pName, boxes: rng.shuffle(boxes) }] };
  }
  // Pauli: a filled s box gets two parallel spins.
  const full = ground.shells.filter((s) => s.name.endsWith('s') && s.boxes[0].length === 2).map((s) => s.name);
  const target = rng.pick(full);
  return {
    core: ground.core,
    shells: ground.shells.map((s) => (s.name === target ? { name: s.name, boxes: [[1, 1] as Box] } : s)),
  };
}

function orbitalFigure(d: OrbitalDiagram): string {
  const B = 36;
  const GAP = 22;
  const coreW = d.core ? 62 : 0;
  const width = coreW + d.shells.reduce((w, s) => w + s.boxes.length * B, 0) + GAP * (d.shells.length - 1);
  const top = 92;
  let x = (480 - width) / 2;
  const parts: string[] = [];
  if (d.core) {
    parts.push(text(x + coreW - 16, top + B / 2, d.core, { anchor: 'end', baseline: 'middle', size: 19 }));
    x += coreW;
  }
  const spin = (cx: number, up: boolean) =>
    up ? arrow(cx, top + B - 5, cx, top + 5, { width: 2.2, head: 9 }) : arrow(cx, top + 5, cx, top + B - 5, { width: 2.2, head: 9 });
  for (const s of d.shells) {
    s.boxes.forEach((box, i) => {
      const bx = x + i * B;
      parts.push(rect(bx, top, B, B, { width: 2 }));
      const xs = box.length === 1 ? [bx + B / 2] : [bx + B / 2 - 7, bx + B / 2 + 7];
      box.forEach((e, j) => parts.push(spin(xs[j], e === 1)));
    });
    parts.push(text(x + (s.boxes.length * B) / 2, top + B + 25, s.name, { anchor: 'middle', size: 17 }));
    x += s.boxes.length * B + GAP;
  }
  return figure(480, 240, ...parts);
}

const RULE_CHOICES: Record<OrbitalRule, string> = {
  aufbau: 'The Aufbau principle',
  hund: "Hund's rule",
  pauli: 'The Pauli exclusion principle',
  none: 'None of these',
};

export function orbitalIdentifyDraft(z: number): VisualDraft {
  const el = element(z);
  return {
    stem: 'The orbital diagram shows the ground-state electron configuration of a neutral atom. What element is it?',
    format: 'short_answer',
    answer: el.name,
    accept: el.accept,
    svg: orbitalFigure(groundDiagram(z)),
    alt: 'An orbital box diagram: a row of boxes for the orbitals of each subshell, labeled below, with up and down arrows for electrons.',
    topic: 'chemistry.atomic-structure',
  };
}

export function orbitalRuleDraft(diagram: OrbitalDiagram, rule: OrbitalRule, rng: Rng): VisualDraft {
  const correct = RULE_CHOICES[rule];
  const others = (Object.keys(RULE_CHOICES) as OrbitalRule[]).filter((r) => r !== rule).map((r) => RULE_CHOICES[r]);
  const { choices, answerLetter } = multipleChoice(correct, others, rng);
  return {
    stem: 'Which of the following does this orbital diagram violate?',
    format: 'multiple_choice',
    choices,
    answerLetter,
    answer: correct,
    svg: orbitalFigure(diagram),
    alt: 'An orbital box diagram: a row of boxes for the orbitals of each subshell, labeled below, with up and down arrows for electrons.',
    topic: 'chemistry.atomic-structure',
  };
}

const orbitalDiagram: VisualTemplate = {
  id: 'chemistry-orbital-diagram',
  subject: 'chemistry',
  title: 'Orbital box diagrams',
  description: 'An orbital box diagram; asks which element has that ground state, or which rule (Aufbau, Hund, Pauli or none) the diagram breaks.',
  make(rng) {
    if (rng.chance(0.55)) return orbitalIdentifyDraft(rng.int(3, 36));
    const rule = rng.pick(['aufbau', 'hund', 'pauli', 'none'] as const);
    const z = rng.pick(RULE_ATOMS[rule]);
    return orbitalRuleDraft(ruleDiagram(z, rule, rng), rule, rng);
  },
};

/* ---------------- naming a skeletal formula ---------------- */

export type Family = 'alkane' | 'alkene' | 'alcohol';

const ROOTS: Record<number, string> = { 3: 'PROP', 4: 'BUT', 5: 'PENT', 6: 'HEX', 7: 'HEPT', 8: 'OCT' };

/**
 * The name of an unbranched chain of n carbons: an alkane, an alkene with its double bond starting at
 * carbon p, or an alcohol with its OH on carbon p (p is the lowest locant). The main answer is the
 * name NSB usually prints ("2-BUTANOL"); the current IUPAC form ("BUTAN-2-OL") and common names are accepted.
 */
export function organicName(n: number, family: Family, p: number): { answer: string; accept: string[] } {
  const R = ROOTS[n];
  if (!R) throw new Error(`organicName: no root for ${n} carbons`);
  if (family === 'alkane') return { answer: `${R}ANE`, accept: n >= 4 ? [`N-${R}ANE`] : [] };
  if (family === 'alkene') {
    if (n === 3) return { answer: 'PROPENE', accept: ['PROP-1-ENE', '1-PROPENE', 'PROPYLENE'] };
    const accept = [`${R}-${p}-ENE`];
    // A zigzag chain through an internal double bond is drawn trans (E).
    if (p >= 2) accept.push(`TRANS-${p}-${R}ENE`, `TRANS-${R}-${p}-ENE`, `(E)-${p}-${R}ENE`, `(E)-${R}-${p}-ENE`, `(${p}E)-${R}-${p}-ENE`);
    return { answer: `${p}-${R}ENE`, accept };
  }
  const accept = [`${R}AN-${p}-OL`];
  if (n === 3) accept.push(...(p === 1 ? ['N-PROPANOL', 'PROPYL ALCOHOL', 'N-PROPYL ALCOHOL'] : ['ISOPROPANOL', 'ISOPROPYL ALCOHOL']));
  else if (n === 4) accept.push(...(p === 1 ? ['N-BUTANOL', 'BUTYL ALCOHOL', 'N-BUTYL ALCOHOL'] : ['SEC-BUTANOL', 'SEC-BUTYL ALCOHOL']));
  else if (p === 1) accept.push(`N-${R}ANOL`, `${R}YL ALCOHOL`, `N-${R}YL ALCOHOL`);
  return { answer: `${p}-${R}ANOL`, accept };
}

export interface SkeletalParams {
  n: number;
  family: Family;
  /** Lowest locant of the double bond or OH (ignored for alkanes). */
  p: number;
  /** Number the chain from the right end of the drawing. */
  flip: boolean;
  /** The leftmost carbon sits on the upper row of the zigzag. */
  startUp: boolean;
}

function skeletalFigure(s: SkeletalParams): string {
  const L = 48;
  const dx = L * Math.cos(Math.PI / 6);
  const yc = 120;
  const yOf = (i: number) => yc + ((i % 2 === 0) === s.startUp ? -L / 4 : L / 4);
  // Drawing index of carbon k (numbered from the end nearer the group).
  const at = (k: number) => (s.flip ? s.n - k : k - 1);
  const carbons = Array.from({ length: s.n }, (_, i) => [i * dx, yOf(i)] as [number, number]);
  // Where the OH's oxygen goes: beyond a chain end, or straight out from an inner carbon.
  let oxygen: [number, number] | null = null;
  let ohCarbon = -1;
  if (s.family === 'alcohol') {
    ohCarbon = at(s.p);
    const [cx, cy] = carbons[ohCarbon];
    if (ohCarbon === 0) oxygen = [cx - dx, yOf(-1)];
    else if (ohCarbon === s.n - 1) oxygen = [cx + dx, yOf(s.n)];
    else oxygen = [cx, cy < yc ? cy - L : cy + L];
  }
  const xs = [...carbons.map((c) => c[0]), ...(oxygen ? [oxygen[0]] : [])];
  const shift = 240 - (Math.min(...xs) + Math.max(...xs)) / 2;
  const pts = carbons.map(([x, y]) => [x + shift, y] as [number, number]);
  const parts: string[] = [];
  const bond = { width: 2.6 };
  for (let i = 0; i + 1 < pts.length; i++) parts.push(line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], bond));
  if (s.family === 'alkene') {
    // The second line of the double bond, inside the zigzag's angle and a little shorter.
    const i = Math.min(at(s.p), at(s.p + 1));
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const ux = (bx - ax) / L;
    const uy = (by - ay) / L;
    const ref = pts[i + 2] ?? pts[i - 1];
    const side = Math.sign((ref[0] - ax) * -uy + (ref[1] - ay) * ux) || 1;
    const ox = -uy * 7 * side;
    const oy = ux * 7 * side;
    const trim = 0.17 * L;
    parts.push(line(ax + ux * trim + ox, ay + uy * trim + oy, bx - ux * trim + ox, by - uy * trim + oy, bond));
  }
  if (oxygen) {
    const [cx, cy] = pts[ohCarbon];
    const ox = oxygen[0] + shift;
    const oy = oxygen[1];
    const len = Math.hypot(ox - cx, oy - cy);
    // Stop the bond short of the label, which is centered on the oxygen.
    parts.push(line(cx, cy, ox - ((ox - cx) * 12) / len, oy - ((oy - cy) * 12) / len, bond));
    const leftEnd = ohCarbon === 0 && ox < cx;
    parts.push(
      leftEnd
        ? text(ox + 6.5, oy, 'HO', { anchor: 'end', baseline: 'middle', size: 18 })
        : text(ox - 6.5, oy, 'OH', { baseline: 'middle', size: 18 }),
    );
  }
  return figure(480, 240, ...parts);
}

export function skeletalDraft(s: SkeletalParams): VisualDraft {
  const { answer, accept } = organicName(s.n, s.family, s.p);
  const feature = s.family === 'alkane' ? 'single bonds only' : s.family === 'alkene' ? 'one carbon–carbon double bond' : 'one OH group';
  return {
    stem: 'Ignoring stereochemistry, what is the IUPAC name of the compound whose skeletal formula is shown?',
    format: 'short_answer',
    answer,
    accept,
    svg: skeletalFigure(s),
    alt: `A skeletal formula: an unbranched zigzag carbon chain with ${feature}.`,
    topic: 'chemistry.organic',
  };
}

const skeletalName: VisualTemplate = {
  id: 'chemistry-skeletal-name',
  subject: 'chemistry',
  title: 'Naming a skeletal formula',
  description: 'The skeletal formula of an unbranched alkane, alkene or alcohol with three to eight carbons; asks for its IUPAC name.',
  make(rng) {
    const n = rng.int(3, 8);
    const family = rng.pick(['alkane', 'alkene', 'alkene', 'alcohol', 'alcohol'] as const);
    const most = family === 'alkene' ? Math.floor(n / 2) : family === 'alcohol' ? Math.floor((n + 1) / 2) : 1;
    return skeletalDraft({ n, family, p: rng.int(1, most), flip: rng.chance(0.5), startUp: rng.chance(0.5) });
  },
};

/* ---------------- reaction energy diagram ---------------- */

/** Energies in kJ/mol; `catalyzed` is the peak of the dashed catalyzed path, when drawn. */
export interface ProfileParams {
  reactants: number;
  products: number;
  peak: number;
  catalyzed?: number;
  ask: 'enthalpy' | 'forward' | 'reverse' | 'lowered' | 'catalyzed';
}

export function profileAnswer(p: ProfileParams): number {
  switch (p.ask) {
    case 'enthalpy':
      return p.products - p.reactants;
    case 'forward':
      return p.peak - p.reactants;
    case 'reverse':
      return p.peak - p.products;
    case 'lowered':
      return p.peak - p.catalyzed!;
    case 'catalyzed':
      return p.catalyzed! - p.reactants;
  }
}

function profileFigure(p: ProfileParams): string {
  // The energy axis is labeled only at the levels, so it can start below the lowest one instead of at 0.
  const low = Math.min(p.reactants, p.products);
  const yMin = Math.max(0, Math.floor((low - 40) / 50) * 50);
  const yMax = Math.ceil((p.peak + 30) / 50) * 50;
  const pl = plane({ xMin: 0, xMax: 10, yMin, yMax, left: 74, top: 18, width: 380, height: 214 });
  const curve = (peak: number) => (x: number) => {
    if (x <= 2.4) return p.reactants;
    if (x <= 5) return p.reactants + ((peak - p.reactants) * (1 - Math.cos((Math.PI * (x - 2.4)) / 2.6))) / 2;
    if (x <= 7.6) return p.products + ((peak - p.products) * (1 + Math.cos((Math.PI * (x - 5)) / 2.6))) / 2;
    return p.products;
  };
  const levels: Array<[number, number]> = [
    [p.reactants, 0],
    [p.products, 7.6],
    [p.peak, 5],
  ];
  if (p.catalyzed !== undefined) levels.push([p.catalyzed, 5]);
  const parts = [framedAxes(pl, { xTitle: 'Reaction progress', yTitle: 'Potential energy (kJ/mol)', yTitleX: 22 })];
  for (const [e, until] of levels) {
    if (until > 0) parts.push(line(pl.x(0), pl.y(e), pl.x(until), pl.y(e), { width: 1.2, dash: '2 4', opacity: 0.7 }));
    parts.push(line(pl.left - 5, pl.y(e), pl.left, pl.y(e), { width: 1.5 }));
    parts.push(text(pl.left - 9, pl.y(e), String(e), { anchor: 'end', baseline: 'middle', size: 14 }));
  }
  parts.push(pl.plot(curve(p.peak), { samples: 260, style: { width: 3 } }));
  if (p.catalyzed !== undefined) parts.push(pl.plot(curve(p.catalyzed), { from: 2.4, to: 7.6, samples: 160, style: { width: 2.6, dash: '9 6', stroke: ACCENT } }));
  // "Reactants" goes on the side of its plateau with more room before the next dotted line (or the axis).
  const others = levels.slice(1).map(([e]) => e);
  const above = Math.min(yMax, ...others.filter((e) => e > p.reactants)) - p.reactants;
  const below = p.reactants - Math.max(yMin, ...others.filter((e) => e < p.reactants));
  const room = ((Math.max(above, below) * pl.height) / (yMax - yMin)) / 2;
  const offset = Math.min(12, room) * (below > above ? 1 : -1);
  parts.push(text(pl.x(1.2), pl.y(p.reactants) + offset, 'Reactants', { anchor: 'middle', baseline: 'middle', size: 14 }));
  parts.push(text(pl.x(8.8), pl.y(p.products) - 11, 'Products', { anchor: 'middle', size: 14 }));
  return figure(480, 284, ...parts);
}

export function profileDraft(p: ProfileParams): VisualDraft {
  const intro = p.catalyzed !== undefined ? 'The dashed curve shows the same reaction with a catalyst.' : '';
  const ask = {
    enthalpy: 'In kilojoules per mole, what is ΔH of the forward reaction shown in this energy diagram, including its sign?',
    forward: 'In kilojoules per mole, what is the activation energy of the forward reaction shown in this energy diagram?',
    reverse: 'In kilojoules per mole, what is the activation energy of the reverse reaction shown in this energy diagram?',
    lowered: 'By how many kilojoules per mole does the catalyst lower the activation energy of the forward reaction?',
    catalyzed: 'In kilojoules per mole, what is the activation energy of the catalyzed forward reaction?',
  }[p.ask];
  return {
    stem: intro ? `${intro} ${ask}` : ask,
    format: 'short_answer',
    answer: String(profileAnswer(p)),
    svg: profileFigure(p),
    alt: `An energy diagram of potential energy in kJ/mol against reaction progress, with the energies of the reactants, the products and the peak labeled on the axis${p.catalyzed !== undefined ? ', and a dashed curve with a lower, labeled peak for the catalyzed path' : ''}.`,
    topic: p.ask === 'enthalpy' ? 'chemistry.thermochemistry' : 'chemistry.kinetics',
  };
}

const energyProfile: VisualTemplate = {
  id: 'chemistry-energy-profile',
  subject: 'chemistry',
  title: 'Reaction energy diagram',
  description: 'A potential energy diagram with labeled energies, sometimes with a catalyzed path; asks for ΔH (with its sign) or an activation energy.',
  make(rng) {
    // Peaks stay at or below 320 kJ/mol, so 30 kJ/mol between labels is at least 18 units on the axis.
    const reactants = rng.int(4, 16) * 10;
    let products = rng.int(2, 18) * 10;
    while (Math.abs(products - reactants) < 30) products = rng.int(2, 18) * 10;
    const high = Math.max(reactants, products);
    const ask = rng.pick(['enthalpy', 'forward', 'reverse', 'lowered', 'catalyzed'] as const);
    if (ask === 'lowered' || ask === 'catalyzed') {
      // Labeled energies at least 30 kJ/mol apart so their labels never touch.
      const catalyzed = high + rng.int(3, 7) * 10;
      const peak = catalyzed + rng.int(3, 7) * 10;
      return profileDraft({ reactants, products, peak, catalyzed, ask });
    }
    return profileDraft({ reactants, products, peak: high + rng.int(4, 14) * 10, ask });
  },
};

/* ---------------- phase diagram ---------------- */

/**
 * A schematic phase diagram in a 10 × 10 box of (temperature, pressure): triple point (tx, ty),
 * critical point (cx, cy), the solid–liquid line's slope dT/dP, and the height of the 1 atm line.
 */
export interface PhaseShape {
  tx: number;
  ty: number;
  cx: number;
  cy: number;
  slope: number;
  atm: number;
}

export type Phase = 'solid' | 'liquid' | 'gas' | 'supercritical';

const SUB_START = 0.6; // the sublimation curve starts at (0.6, 0.25)
const VAPOR_SLOPE = 0.45; // dP/dT of the liquid–gas curve at the triple point

function subK(s: PhaseShape): number {
  return Math.log(s.ty / 0.25) / (s.tx - SUB_START);
}
function vaporB(s: PhaseShape): number {
  const span = s.cx - s.tx;
  return (s.cy - s.ty - VAPOR_SLOPE * span) / (span * span);
}
/** Pressure on the solid–gas curve (T ≤ tx). */
export function sublimationP(s: PhaseShape, t: number): number {
  return s.ty * Math.exp(subK(s) * (t - s.tx));
}
export function sublimationT(s: PhaseShape, pr: number): number {
  return s.tx + Math.log(pr / s.ty) / subK(s);
}
/** Pressure on the liquid–gas curve (tx ≤ T ≤ cx). */
export function vaporP(s: PhaseShape, t: number): number {
  const u = t - s.tx;
  return s.ty + VAPOR_SLOPE * u + vaporB(s) * u * u;
}
export function vaporT(s: PhaseShape, pr: number): number {
  const b = vaporB(s);
  return s.tx + (-VAPOR_SLOPE + Math.sqrt(VAPOR_SLOPE * VAPOR_SLOPE + 4 * b * (pr - s.ty))) / (2 * b);
}
/** Temperature on the solid–liquid line (P ≥ ty). */
export function meltingT(s: PhaseShape, pr: number): number {
  return s.tx + s.slope * (pr - s.ty);
}

/** The phase at (T, P) on this diagram. */
export function phaseAt(s: PhaseShape, t: number, pr: number): Phase {
  if (t > s.cx && pr > s.cy) return 'supercritical';
  if (pr >= s.ty && t < meltingT(s, pr)) return 'solid';
  if (pr < s.ty && t < s.tx) return pr > sublimationP(s, t) ? 'solid' : 'gas';
  if (t > s.cx) return 'gas';
  return pr > vaporP(s, t) ? 'liquid' : 'gas';
}

/** Points well inside each region for every shape `phaseShape` can make (checked in the tests). */
export const PHASE_POINTS: Record<Phase, Array<[number, number]>> = {
  solid: [[1.4, 6.0], [1.8, 7.6], [2.0, 5.0], [1.3, 8.6]],
  liquid: [[5.0, 6.2], [5.4, 6.8], [4.9, 5.6], [6.0, 6.9]],
  gas: [[6.6, 1.6], [5.6, 1.2], [7.2, 2.6], [4.6, 0.8]],
  supercritical: [[9.0, 8.7], [9.3, 9.3], [9.2, 8.5], [8.9, 9.4]],
};

export type PhasePoint = 'triple' | 'critical' | 'boiling' | 'melting';
export type PhaseChange = 'melting' | 'freezing' | 'vaporization' | 'condensation' | 'sublimation' | 'deposition';

export type PhaseQuestion =
  | { ask: 'phase'; phase: Phase; at: [number, number] }
  | { ask: 'point'; point: PhasePoint }
  | { ask: 'change'; change: PhaseChange; from: [number, number]; to: [number, number] };

export function phaseShape(rng: Rng): PhaseShape {
  const ty = rng.pick([2.6, 2.9, 3.2]);
  return {
    tx: rng.pick([3.2, 3.5, 3.8]),
    ty,
    cx: rng.pick([7.6, 7.9, 8.2]),
    cy: rng.pick([7.0, 7.3, 7.6]),
    slope: rng.pick([0.08, 0.12, -0.07]),
    atm: ty + rng.pick([1.4, 1.7, 2.0]),
  };
}

/** Where a special point sits, and which side of it its label goes. */
export function specialPoint(s: PhaseShape, point: PhasePoint): [number, number] {
  switch (point) {
    case 'triple':
      return [s.tx, s.ty];
    case 'critical':
      return [s.cx, s.cy];
    case 'boiling':
      return [vaporT(s, s.atm), s.atm];
    case 'melting':
      return [meltingT(s, s.atm), s.atm];
  }
}

/** An arrow that crosses exactly one boundary, for each phase change. */
export function changeArrow(s: PhaseShape, change: PhaseChange, level: number): { from: [number, number]; to: [number, number] } {
  let pr: number;
  let t: number;
  let half: number;
  if (change === 'melting' || change === 'freezing') {
    pr = [6.0, 6.8, 7.6, 8.4][level % 4];
    t = meltingT(s, pr);
    half = 1.1;
  } else if (change === 'vaporization' || change === 'condensation') {
    pr = s.ty + [1.4, 2.0, 2.6][level % 3];
    t = vaporT(s, pr);
    half = 0.9;
  } else {
    pr = [0.9, 1.3, 1.7][level % 3];
    t = sublimationT(s, pr);
    half = 1.0;
  }
  const rising = change === 'melting' || change === 'vaporization' || change === 'sublimation';
  const a: [number, number] = [t - half, pr];
  const b: [number, number] = [t + half, pr];
  return rising ? { from: a, to: b } : { from: b, to: a };
}

function phaseFigure(s: PhaseShape, q: PhaseQuestion): string {
  const pl = plane({ xMin: 0, xMax: 10, yMin: 0, yMax: 10, left: 56, top: 18, width: 400, height: 216 });
  const X = (t: number) => pl.x(t);
  const Y = (pr: number) => pl.y(pr);
  const parts = [
    framedAxes(pl, { xTitle: 'Temperature', yTitle: 'Pressure', yTitleX: 30 }),
    pl.plot((t) => sublimationP(s, t), { from: SUB_START, to: s.tx, samples: 80, style: { width: 2.6 } }),
    pl.plot((t) => vaporP(s, t), { from: s.tx, to: s.cx, samples: 80, style: { width: 2.6 } }),
    line(X(s.tx), Y(s.ty), X(meltingT(s, 10)), Y(10), { width: 2.6 }),
    dot(X(s.tx), Y(s.ty), 4),
    dot(X(s.cx), Y(s.cy), 4),
  ];
  if (q.ask === 'point') {
    // The label sits at the right end of the dashed line, in the empty gas region.
    parts.unshift(
      line(pl.left, Y(s.atm), pl.left + pl.width, Y(s.atm), { width: 1.3, dash: '6 5', opacity: 0.75 }),
      text(pl.left + pl.width - 4, Y(s.atm) - 8, '1 atm', { anchor: 'end', size: 14 }),
    );
  }
  if (q.ask === 'phase' || q.ask === 'point') {
    const [t, pr] = q.ask === 'phase' ? q.at : specialPoint(s, q.point);
    // Labels go where the diagram is empty: below right of the triple point and the boiling point,
    // above right of the critical point, on the solid side of the melting point.
    const [dx, dy, anchor] =
      q.ask === 'phase' || q.point === 'critical'
        ? [11, -11, 'start' as const]
        : q.point === 'melting'
          ? [-12, -11, 'end' as const]
          : [11, 17, 'start' as const];
    parts.push(dot(X(t), Y(pr), 6.5, ACCENT), text(X(t) + dx, Y(pr) + dy, 'X', { anchor, size: 17, weight: 'bold', fill: ACCENT }));
  } else {
    parts.push(arrow(X(q.from[0]), Y(q.from[1]), X(q.to[0]), Y(q.to[1]), { stroke: ACCENT, width: 3.5, head: 14 }));
  }
  return figure(480, 290, ...parts);
}

const PHASE_NAMES: Record<Phase, string> = { solid: 'Solid', liquid: 'Liquid', gas: 'Gas', supercritical: 'Supercritical fluid' };
const POINT_NAMES: Record<PhasePoint, string> = {
  triple: 'Triple point',
  critical: 'Critical point',
  boiling: 'Normal boiling point',
  melting: 'Normal melting point',
};
const CHANGE_NAMES: Record<PhaseChange, string> = {
  melting: 'Melting',
  freezing: 'Freezing',
  vaporization: 'Vaporization',
  condensation: 'Condensation',
  sublimation: 'Sublimation',
  deposition: 'Deposition',
};

export function phaseDraft(s: PhaseShape, q: PhaseQuestion, rng: Rng): VisualDraft {
  const names: Record<string, string> = q.ask === 'phase' ? PHASE_NAMES : q.ask === 'point' ? POINT_NAMES : CHANGE_NAMES;
  const key = q.ask === 'phase' ? q.phase : q.ask === 'point' ? q.point : q.change;
  const correct = names[key];
  const { choices, answerLetter } = multipleChoice(
    correct,
    Object.values(names).filter((n) => n !== correct),
    rng,
  );
  const stem =
    q.ask === 'phase'
      ? 'In what phase is the substance at point X on this phase diagram?'
      : q.ask === 'point'
        ? 'What is the point marked X on this phase diagram called?'
        : 'Which phase change does the arrow on this phase diagram represent?';
  return {
    stem,
    format: 'multiple_choice',
    choices,
    answerLetter,
    answer: correct,
    svg: phaseFigure(s, q),
    alt:
      q.ask === 'change'
        ? 'A phase diagram of pressure against temperature with its three boundary curves and an arrow crossing one of them.'
        : `A phase diagram of pressure against temperature with its three boundary curves${q.ask === 'point' ? ', a dashed line at 1 atm,' : ''} and a point marked X.`,
    topic: 'chemistry.thermochemistry',
  };
}

const phaseDiagram: VisualTemplate = {
  id: 'chemistry-phase-diagram',
  subject: 'chemistry',
  title: 'Reading a phase diagram',
  description: 'A schematic phase diagram with a marked point or an arrow; asks for the phase, the name of the point, or the phase change.',
  make(rng) {
    const s = phaseShape(rng);
    const ask = rng.pick(['phase', 'point', 'change'] as const);
    if (ask === 'phase') {
      const phase = rng.pick(['solid', 'liquid', 'gas', 'supercritical'] as const);
      return phaseDraft(s, { ask, phase, at: rng.pick(PHASE_POINTS[phase]) }, rng);
    }
    if (ask === 'point') return phaseDraft(s, { ask, point: rng.pick(['triple', 'critical', 'boiling', 'melting'] as const) }, rng);
    const change = rng.pick(['melting', 'freezing', 'vaporization', 'condensation', 'sublimation', 'deposition'] as const);
    return phaseDraft(s, { ask, change, ...changeArrow(s, change, rng.int(0, 11)) }, rng);
  },
};

/* ---------------- titration curve ---------------- */

/** What is in the flask, then what is added: SA strong acid, WA weak acid, SB strong base, WB weak base. */
export type Titration = 'SA-SB' | 'WA-SB' | 'SB-SA' | 'WB-SA';

const KW = 1e-14;

/** [H⁺] when the net strong acid minus strong base concentration is `excess` (stable for either sign). */
function strongH(excess: number): number {
  const root = Math.sqrt(excess * excess + 4 * KW);
  return excess >= 0 ? (excess + root) / 2 : (2 * KW) / (root - excess);
}

/** Solve an increasing charge balance f(h) = 0 for h by bisection on log h. */
function solveH(f: (h: number) => number): number {
  let lo = -15;
  let hi = 1;
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    if (f(10 ** mid) > 0) hi = mid;
    else lo = mid;
  }
  return 10 ** ((lo + hi) / 2);
}

/**
 * pH after `v` mL of 0.100 M titrant is added to `veq` mL of 0.100 M analyte (so the equivalence point
 * is at `veq` mL). `pk` is the weak acid's pKa or the weak base's pKb.
 */
export function titrationPH(kind: Titration, pk: number, veq: number, v: number): number {
  const C = 0.1;
  const total = veq + v;
  const analyte = (C * veq) / total;
  const titrant = (C * v) / total;
  let h: number;
  if (kind === 'SA-SB') h = strongH(analyte - titrant);
  else if (kind === 'SB-SA') h = strongH(titrant - analyte);
  else if (kind === 'WA-SB') {
    const ka = 10 ** -pk;
    // [H⁺] + [Na⁺] = [OH⁻] + [A⁻]
    h = solveH((x) => x + titrant - KW / x - (analyte * ka) / (ka + x));
  } else {
    const ka = KW / 10 ** -pk; // Ka of the conjugate acid BH⁺
    // [H⁺] + [BH⁺] = [OH⁻] + [Cl⁻]
    h = solveH((x) => x + (analyte * x) / (x + ka) - KW / x - titrant);
  }
  return -Math.log10(h);
}

export interface TitrationParams {
  kind: Titration;
  pk: number;
  veq: number;
  ask: 'identify' | 'pka' | 'volume';
}

function titrationFigure(p: TitrationParams): string {
  const xMax = 2 * p.veq;
  const pl = plane({ xMin: 0, xMax, yMin: 0, yMax: 14, left: 58, top: 16, width: 392, height: 224 });
  // Sample densely enough that the jump at the equivalence point is drawn as a steep line.
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= 480; i++) {
    const v = (xMax * i) / 480;
    points.push([v, titrationPH(p.kind, p.pk, p.veq, v)]);
  }
  return figure(
    480,
    290,
    pl.grid(5, 1),
    framedAxes(pl, {
      xTicks: steps(0, xMax, 5),
      xLabels: steps(0, xMax, xMax <= 50 ? 5 : 10),
      yTicks: steps(0, 14),
      yLabels: steps(0, 14, 2),
      xTitle: 'Volume of titrant added (mL)',
      yTitle: 'pH',
      yTitleX: 26,
    }),
    pl.polyline(points, { width: 3, stroke: ACCENT }),
  );
}

const TITRATION_NAMES: Record<Titration, string> = {
  'SA-SB': 'Strong acid titrated with a strong base',
  'WA-SB': 'Weak acid titrated with a strong base',
  'SB-SA': 'Strong base titrated with a strong acid',
  'WB-SA': 'Weak base titrated with a strong acid',
};

export function titrationDraft(p: TitrationParams, rng: Rng): VisualDraft {
  const base = {
    svg: titrationFigure(p),
    alt: 'A titration curve: pH from 0 to 14 against the volume of titrant added in milliliters, on a grid.',
    topic: 'chemistry.acids-bases',
  };
  if (p.ask === 'identify') {
    const correct = TITRATION_NAMES[p.kind];
    const { choices, answerLetter } = multipleChoice(
      correct,
      Object.values(TITRATION_NAMES).filter((n) => n !== correct),
      rng,
    );
    return {
      stem: 'The graph shows the pH of the solution in the flask during a titration. Which of the following describes the titration?',
      format: 'multiple_choice',
      choices,
      answerLetter,
      answer: correct,
      ...base,
    };
  }
  return {
    stem:
      p.ask === 'pka'
        ? 'The graph shows the pH during the titration of a weak acid with a strong base. To the nearest whole number, what is the pKa of the weak acid?'
        : 'The graph shows the pH of the solution in the flask during a titration. In milliliters, how much titrant had been added at the equivalence point?',
    format: 'short_answer',
    answer: String(p.ask === 'pka' ? p.pk : p.veq),
    ...base,
  };
}

const titrationCurve: VisualTemplate = {
  id: 'chemistry-titration-curve',
  subject: 'chemistry',
  title: 'Reading a titration curve',
  description: 'A computed pH titration curve; asks which kind of titration it is, the equivalence volume, or the weak acid’s pKa from the half-equivalence point.',
  make(rng) {
    const ask = rng.pick(['identify', 'identify', 'pka', 'volume'] as const);
    if (ask === 'pka') return titrationDraft({ kind: 'WA-SB', pk: rng.int(3, 6), veq: rng.pick([20, 30, 40]), ask }, rng);
    const kind = rng.pick(['SA-SB', 'WA-SB', 'SB-SA', 'WB-SA'] as const);
    // Acetic acid (pKa 4.76) and ammonia (pKb 4.75) for the weak ones.
    const pk = kind === 'WA-SB' ? 4.76 : 4.75;
    return titrationDraft({ kind, pk, veq: rng.pick([20, 25, 30, 40]), ask }, rng);
  },
};

export const CHEMISTRY_TEMPLATES: VisualTemplate[] = [periodicTable, orbitalDiagram, skeletalName, energyProfile, phaseDiagram, titrationCurve];
