import { describe, expect, it } from 'vitest';
import { judgeAnswer } from '../../judge/judge';
import { draftToQuestion } from '../index';
import { makeRng } from '../rng';
import { checkTemplate } from '../testkit';
import {
  changeArrow,
  CHEMISTRY_TEMPLATES,
  groundDiagram,
  meltingT,
  organicName,
  periodicDraft,
  PHASE_POINTS,
  phaseAt,
  profileAnswer,
  profileDraft,
  ruleDiagram,
  RULE_ATOMS,
  skeletalDraft,
  specialPoint,
  TABLE_POOL,
  titrationPH,
  vaporP,
  type OrbitalDiagram,
  type OrbitalRule,
  type Phase,
  type PhaseChange,
  type PhaseShape,
} from './chemistry';
import { element, groundState, tablePosition } from './elements';

describe('chemistry visual templates', () => {
  it('has templates', () => expect(CHEMISTRY_TEMPLATES.length).toBeGreaterThan(0));
  for (const t of CHEMISTRY_TEMPLATES) it(t.id, () => checkTemplate(t));
});

const template = (id: string) => CHEMISTRY_TEMPLATES.find((t) => t.id === id)!;
const verdict = (id: string, seed: number, d: ReturnType<typeof periodicDraft>, response: string) =>
  judgeAnswer(draftToQuestion(template(id), seed, d), response).verdict;

describe('periodic table', () => {
  it('places elements in their period and group', () => {
    expect(tablePosition(2)).toEqual({ period: 1, group: 18 });
    expect(tablePosition(13)).toEqual({ period: 3, group: 13 });
    expect(tablePosition(21)).toEqual({ period: 4, group: 3 });
    expect(tablePosition(32)).toEqual({ period: 4, group: 14 });
    expect(tablePosition(49)).toEqual({ period: 5, group: 13 });
    expect(tablePosition(56)).toEqual({ period: 6, group: 2 });
    expect(tablePosition(82)).toEqual({ period: 6, group: 14 });
    expect(tablePosition(86)).toEqual({ period: 6, group: 18 });
    expect(tablePosition(64)).toBeNull();
  });
  it('asks only about main-group elements and period 4 transition metals', () => {
    expect(TABLE_POOL).toContain(26);
    expect(TABLE_POOL).toContain(84);
    expect(TABLE_POOL).not.toContain(47); // silver, period 5
    expect(TABLE_POOL).not.toContain(79); // gold, period 6
    expect(TABLE_POOL.length).toBe(52);
  });
  it('highlights the right cell and accepts the symbol', () => {
    const d = periodicDraft(32, 'name');
    expect(d.answer).toBe('GERMANIUM');
    expect(d.svg).toContain('<rect x="346" y="102" width="24" height="24"');
    expect(verdict('chemistry-periodic-table', 1, d, 'Ge')).toBe('correct');
    expect(verdict('chemistry-periodic-table', 1, d, 'germanium')).toBe('correct');
    expect(verdict('chemistry-periodic-table', 1, d, 'gallium')).toBe('incorrect');
    expect(periodicDraft(13, 'name').accept).toContain('ALUMINIUM');
    expect(periodicDraft(82, 'number').answer).toBe('82');
  });
});

/* Orbital diagram rules, checked independently of how the diagrams are built. */
const ORDER = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p'];
const CAPACITY: Record<string, number> = { s: 2, p: 6, d: 10 };
const CORE: Record<string, number> = { '[Ne]': 10, '[Ar]': 18 };

function electrons(d: OrbitalDiagram): number {
  return (d.core ? CORE[d.core] : 0) + d.shells.reduce((n, s) => n + s.boxes.reduce((m, b) => m + b.length, 0), 0);
}
function breaksPauli(d: OrbitalDiagram): boolean {
  return d.shells.some((s) => s.boxes.some((b) => b.length > 2 || (b.length === 2 && b[0] === b[1])));
}
function breaksHund(d: OrbitalDiagram): boolean {
  return d.shells.some((s) => {
    const paired = s.boxes.some((b) => b.length === 2);
    const empty = s.boxes.some((b) => b.length === 0);
    const singles = s.boxes.filter((b) => b.length === 1).map((b) => b[0]);
    return (paired && empty) || new Set(singles).size > 1;
  });
}
function breaksAufbau(d: OrbitalDiagram): boolean {
  const filled = (s: { name: string; boxes: number[][] }) => s.boxes.reduce((m, b) => m + b.length, 0) === CAPACITY[s.name[1]];
  const sorted = [...d.shells].sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
  const lastOccupied = sorted.reduce((last, s, i) => (s.boxes.some((b) => b.length) ? i : last), -1);
  return sorted.slice(0, lastOccupied).some((s) => !filled(s));
}
function brokenRules(d: OrbitalDiagram): OrbitalRule[] {
  const out: OrbitalRule[] = [];
  if (breaksAufbau(d)) out.push('aufbau');
  if (breaksHund(d)) out.push('hund');
  if (breaksPauli(d)) out.push('pauli');
  return out;
}

describe('orbital diagrams', () => {
  it('fills ground states in order, with the chromium and copper exceptions', () => {
    expect(groundState(8)).toEqual([
      { subshell: '1s', electrons: 2 },
      { subshell: '2s', electrons: 2 },
      { subshell: '2p', electrons: 4 },
    ]);
    expect(groundState(24).slice(-2)).toEqual([
      { subshell: '4s', electrons: 1 },
      { subshell: '3d', electrons: 5 },
    ]);
    expect(groundState(29).slice(-2)).toEqual([
      { subshell: '4s', electrons: 1 },
      { subshell: '3d', electrons: 10 },
    ]);
    expect(groundState(26).slice(-2)).toEqual([
      { subshell: '4s', electrons: 2 },
      { subshell: '3d', electrons: 6 },
    ]);
  });
  it('draws ground states by Hund’s rule behind a noble-gas core', () => {
    expect(groundDiagram(8)).toEqual({
      core: null,
      shells: [
        { name: '1s', boxes: [[1, -1]] },
        { name: '2s', boxes: [[1, -1]] },
        { name: '2p', boxes: [[1, -1], [1], [1]] },
      ],
    });
    expect(groundDiagram(17).core).toBe('[Ne]');
    expect(groundDiagram(17).shells.map((s) => s.name)).toEqual(['3s', '3p']);
    expect(groundDiagram(24).shells).toEqual([
      { name: '4s', boxes: [[1]] },
      { name: '3d', boxes: [[1], [1], [1], [1], [1]] },
    ]);
    for (let z = 3; z <= 36; z++) {
      expect(electrons(groundDiagram(z))).toBe(z);
      // Chromium and copper are the real exceptions to the simple filling order (rule questions use Z ≤ 18).
      expect(brokenRules(groundDiagram(z))).toEqual(z === 24 || z === 29 ? ['aufbau'] : []);
    }
    expect(Math.max(...Object.values(RULE_ATOMS).flat())).toBeLessThanOrEqual(18);
  });
  it('builds diagrams that break exactly the rule asked about, with the right number of electrons', () => {
    const rng = makeRng(5);
    for (const rule of ['aufbau', 'hund', 'pauli', 'none'] as const) {
      for (const z of RULE_ATOMS[rule]) {
        for (let k = 0; k < 4; k++) {
          const d = ruleDiagram(z, rule, rng);
          expect(electrons(d)).toBe(z);
          expect(brokenRules(d)).toEqual(rule === 'none' ? [] : [rule]);
        }
      }
    }
  });
  it('matches hand-drawn examples', () => {
    // Boron with a 2s electron promoted: 1s² 2s¹ 2p².
    expect(ruleDiagram(5, 'aufbau', makeRng(1)).shells).toEqual([
      { name: '1s', boxes: [[1, -1]] },
      { name: '2s', boxes: [[1]] },
      { name: '2p', boxes: [[1], [1], []] },
    ]);
    // Sodium with its 3s electron in 3p.
    expect(ruleDiagram(11, 'aufbau', makeRng(1))).toEqual({
      core: '[Ne]',
      shells: [
        { name: '3s', boxes: [[]] },
        { name: '3p', boxes: [[1], [], []] },
      ],
    });
  });
});

describe('skeletal formulas', () => {
  it('names chains with the lowest locant and accepts other correct forms', () => {
    expect(organicName(6, 'alkane', 1)).toEqual({ answer: 'HEXANE', accept: ['N-HEXANE'] });
    expect(organicName(3, 'alkene', 1).answer).toBe('PROPENE');
    expect(organicName(4, 'alkene', 1)).toEqual({ answer: '1-BUTENE', accept: ['BUT-1-ENE'] });
    const pentene = organicName(5, 'alkene', 2);
    expect(pentene.answer).toBe('2-PENTENE');
    expect(pentene.accept).toEqual(expect.arrayContaining(['PENT-2-ENE', 'TRANS-2-PENTENE', '(E)-PENT-2-ENE']));
    const butanol = organicName(4, 'alcohol', 2);
    expect(butanol.answer).toBe('2-BUTANOL');
    expect(butanol.accept).toEqual(expect.arrayContaining(['BUTAN-2-OL', 'SEC-BUTYL ALCOHOL']));
    expect(organicName(3, 'alcohol', 2).accept).toContain('ISOPROPYL ALCOHOL');
    expect(organicName(7, 'alcohol', 4).answer).toBe('4-HEPTANOL');
  });
  it('judges names the way NSB would', () => {
    const d = skeletalDraft({ n: 4, family: 'alcohol', p: 2, flip: true, startUp: false });
    const v = (r: string) => verdict('chemistry-skeletal-name', 1, d, r);
    expect(v('2-butanol')).toBe('correct');
    expect(v('butan-2-ol')).toBe('correct');
    expect(v('sec-butyl alcohol')).toBe('correct');
    expect(v('1-butanol')).toBe('incorrect');
    expect(v('2-butanal')).toBe('incorrect');
    const e = skeletalDraft({ n: 5, family: 'alkene', p: 2, flip: false, startUp: true });
    expect(verdict('chemistry-skeletal-name', 1, e, 'trans-2-pentene')).toBe('correct');
    expect(verdict('chemistry-skeletal-name', 1, e, 'cis-2-pentene')).toBe('incorrect');
    expect(verdict('chemistry-skeletal-name', 1, e, '2-pentyne')).toBe('incorrect');
  });
  it('draws one line per bond (two for the double bond)', () => {
    const lines = (svg: string) => (svg.match(/<line /g) ?? []).length;
    expect(lines(skeletalDraft({ n: 6, family: 'alkane', p: 1, flip: false, startUp: true }).svg)).toBe(5);
    expect(lines(skeletalDraft({ n: 6, family: 'alkene', p: 3, flip: false, startUp: true }).svg)).toBe(6);
    const alcohol = skeletalDraft({ n: 5, family: 'alcohol', p: 1, flip: false, startUp: true }).svg;
    expect(lines(alcohol)).toBe(5);
    expect(alcohol).toContain('>HO</text>');
    expect(skeletalDraft({ n: 5, family: 'alcohol', p: 1, flip: true, startUp: true }).svg).toContain('>OH</text>');
  });
});

describe('energy diagrams', () => {
  const p = { reactants: 50, products: 20, peak: 130, catalyzed: 100 };
  it('reads ΔH with its sign and the activation energies', () => {
    expect(profileAnswer({ ...p, ask: 'enthalpy' })).toBe(-30);
    expect(profileAnswer({ ...p, ask: 'forward' })).toBe(80);
    expect(profileAnswer({ ...p, ask: 'reverse' })).toBe(110);
    expect(profileAnswer({ ...p, ask: 'lowered' })).toBe(30);
    expect(profileAnswer({ ...p, ask: 'catalyzed' })).toBe(50);
    expect(profileAnswer({ reactants: 40, products: 90, peak: 150, ask: 'enthalpy' })).toBe(50);
  });
  it('refuses ΔH with the wrong sign', () => {
    const d = profileDraft({ reactants: 50, products: 20, peak: 130, ask: 'enthalpy' });
    expect(verdict('chemistry-energy-profile', 1, d, '-30')).toBe('correct');
    expect(verdict('chemistry-energy-profile', 1, d, '30')).toBe('incorrect');
  });
  it('keeps labeled energies at least 30 kJ/mol apart', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const svg = template('chemistry-energy-profile').make(makeRng(seed)).svg;
      const values = [...svg.matchAll(/text-anchor="end"[^>]*>(\d+)</g)].map((m) => Number(m[1])).sort((a, b) => a - b);
      for (let i = 1; i < values.length; i++) expect(values[i] - values[i - 1]).toBeGreaterThanOrEqual(30);
      expect(values[values.length - 1]).toBeLessThanOrEqual(320);
    }
  });
});

describe('phase diagrams', () => {
  const shapes: PhaseShape[] = [];
  for (const tx of [3.2, 3.5, 3.8])
    for (const ty of [2.6, 2.9, 3.2])
      for (const cx of [7.6, 7.9, 8.2])
        for (const cy of [7.0, 7.3, 7.6])
          for (const slope of [0.08, 0.12, -0.07]) for (const up of [1.4, 1.7, 2.0]) shapes.push({ tx, ty, cx, cy, slope, atm: ty + up });

  it('classifies regions', () => {
    const s: PhaseShape = { tx: 3.5, ty: 2.9, cx: 7.9, cy: 7.3, slope: 0.08, atm: 4.6 };
    expect(phaseAt(s, 1, 6)).toBe('solid');
    expect(phaseAt(s, 5.5, 7)).toBe('liquid');
    expect(phaseAt(s, 6, 1)).toBe('gas');
    expect(phaseAt(s, 9, 9)).toBe('supercritical');
    expect(phaseAt(s, 9, 5)).toBe('gas');
  });
  it('puts every marked point well inside its region, for every shape', () => {
    for (const s of shapes) {
      for (const [phase, points] of Object.entries(PHASE_POINTS) as Array<[Phase, Array<[number, number]>]>) {
        for (const [t, pr] of points) {
          for (const [dt, dp] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) expect(phaseAt(s, t + dt, pr + dp)).toBe(phase);
        }
      }
    }
  });
  it('places the special points on their curves', () => {
    for (const s of shapes) {
      const [bt, bp] = specialPoint(s, 'boiling');
      expect(bp).toBe(s.atm);
      expect(vaporP(s, bt)).toBeCloseTo(s.atm, 9);
      expect(bt).toBeGreaterThan(s.tx + 0.8);
      expect(specialPoint(s, 'melting')[0]).toBeCloseTo(meltingT(s, s.atm), 9);
      expect(s.atm).toBeLessThan(s.cy - 1);
    }
  });
  it('draws each phase-change arrow across exactly one boundary', () => {
    const ends: Record<PhaseChange, [Phase, Phase]> = {
      melting: ['solid', 'liquid'],
      freezing: ['liquid', 'solid'],
      vaporization: ['liquid', 'gas'],
      condensation: ['gas', 'liquid'],
      sublimation: ['solid', 'gas'],
      deposition: ['gas', 'solid'],
    };
    for (const s of shapes) {
      for (const change of Object.keys(ends) as PhaseChange[]) {
        for (let level = 0; level < 4; level++) {
          const { from, to } = changeArrow(s, change, level);
          const along = Array.from({ length: 41 }, (_, i) => phaseAt(s, from[0] + ((to[0] - from[0]) * i) / 40, from[1]));
          const switches = along.filter((ph, i) => i > 0 && ph !== along[i - 1]).length;
          expect([along[0], along[40], switches]).toEqual([...ends[change], 1]);
          // Both ends at least 0.3 from the boundary they cross, and inside the box.
          expect(phaseAt(s, from[0] + Math.sign(to[0] - from[0]) * 0.3, from[1])).toBe(ends[change][0]);
          expect(phaseAt(s, to[0] - Math.sign(to[0] - from[0]) * 0.3, to[1])).toBe(ends[change][1]);
          expect(Math.min(from[0], to[0])).toBeGreaterThan(0.3);
          expect(Math.max(from[0], to[0])).toBeLessThan(9.7);
        }
      }
    }
  });
});

describe('titration curves', () => {
  it('computes pH from the charge balance', () => {
    expect(titrationPH('SA-SB', 0, 25, 0)).toBeCloseTo(1, 2);
    expect(titrationPH('SA-SB', 0, 25, 25)).toBeCloseTo(7, 2);
    expect(titrationPH('SA-SB', 0, 25, 50)).toBeCloseTo(14 + Math.log10(0.1 / 3), 2);
    expect(titrationPH('SB-SA', 0, 25, 0)).toBeCloseTo(13, 2);
    expect(titrationPH('SB-SA', 0, 25, 25)).toBeCloseTo(7, 2);
    expect(titrationPH('WA-SB', 4.76, 25, 0)).toBeCloseTo(2.88, 1);
    expect(titrationPH('WA-SB', 4.76, 25, 12.5)).toBeCloseTo(4.76, 1);
    expect(titrationPH('WA-SB', 4.76, 25, 25)).toBeCloseTo(8.73, 1);
    expect(titrationPH('WB-SA', 4.75, 25, 0)).toBeCloseTo(11.12, 1);
    expect(titrationPH('WB-SA', 4.75, 25, 12.5)).toBeCloseTo(9.25, 1);
    expect(titrationPH('WB-SA', 4.75, 25, 25)).toBeCloseTo(5.28, 1);
  });
  it('reads the pKa at half-equivalence to the nearest whole number', () => {
    for (const pk of [3, 4, 5, 6]) for (const veq of [20, 30, 40]) expect(Math.round(titrationPH('WA-SB', pk, veq, veq / 2))).toBe(pk);
  });
  it('has its steepest rise at the equivalence point', () => {
    for (const kind of ['SA-SB', 'WA-SB', 'SB-SA', 'WB-SA'] as const) {
      let best = 0;
      let at = 0;
      for (let v = 0.5; v < 50; v += 0.5) {
        const slope = Math.abs(titrationPH(kind, 4.75, 25, v + 0.25) - titrationPH(kind, 4.75, 25, v - 0.25));
        if (slope > best) [best, at] = [slope, v];
      }
      expect(at).toBe(25);
    }
  });
});

describe('element data', () => {
  it('has names, symbols and spellings', () => {
    expect(element(26)).toEqual({ z: 26, symbol: 'Fe', name: 'IRON', accept: ['Fe'] });
    expect(element(55).accept).toEqual(['Cs', 'CAESIUM']);
    expect(element(86).name).toBe('RADON');
  });
});
