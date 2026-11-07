import { describe, expect, it } from 'vitest';
import { seededRandom } from './plan';
import { buildScrimmage, spread, subjectQuotas } from './scrimmage';
import { teamCatalog } from './levels';
import type { TeamPacket } from './schema';
import { CORE_SUBJECTS, type CatalogRow, type CoreSubject } from './schema';

/** `sets` sets of 17 rounds, each round with one toss-up/bonus pair per subject. */
function catalog(sets: number): CatalogRow[] {
  const rows: CatalogRow[] = [];
  for (let s = 1; s <= sets; s++) {
    for (let r = 1; r <= 17; r++) {
      CORE_SUBJECTS.forEach((subject: CoreSubject, i) => {
        const base = `doe-hs-${String(s).padStart(2, '0')}-r${String(r).padStart(2, '0')}`;
        const n = String(i + 1).padStart(2, '0');
        rows.push([`${base}-t${n}`, subject, `${subject}.x`, 't', r, '']);
        rows.push([`${base}-b${n}`, subject, `${subject}.x`, 'b', r, '']);
      });
    }
  }
  return rows;
}

describe('scrimmage packets', () => {
  const rows = catalog(8);

  it('splits a packet across subjects in DOE proportions', () => {
    const q = subjectQuotas(25);
    expect(Object.values(q).reduce((a, b) => a + b, 0)).toBe(25);
    expect(q.energy).toBeLessThanOrEqual(q.biology);
    expect(Math.max(...Object.values(q)) - Math.min(...Object.values(q))).toBeLessThanOrEqual(1);
  });

  it('serves pairs nobody in the room has heard, at the chosen level, from few sets', () => {
    const heard = new Set(rows.filter((r) => r[0].startsWith('doe-hs-01')).map((r) => r[0]));
    // Hearing only the bonus also rules a pair out.
    heard.add('doe-hs-02-r01-b01');
    const res = buildScrimmage(rows, { size: 24, level: 'early', heard, random: seededRandom('s') });
    expect(res.pairs).toHaveLength(24);
    expect(res.heardPairs).toBe(0);
    for (const p of res.pairs) {
      expect(p.tossupId.startsWith('doe-hs-01')).toBe(false);
      expect(p.tossupId).not.toBe('doe-hs-02-r01-t01');
      expect(Number(/-r(\d+)-/.exec(p.tossupId)![1])).toBeLessThanOrEqual(10);
      expect(p.bonusId).toBe(p.tossupId.replace('-t', '-b'));
    }
    expect(res.sets.length).toBeLessThanOrEqual(4);
  });

  it('rotates through the subjects like a real round', () => {
    const res = buildScrimmage(rows, { size: 12, level: 'any', heard: new Set(), random: seededRandom('r') });
    const first6 = res.pairs.slice(0, 6).map((p) => p.subject);
    expect(new Set(first6).size).toBe(6);
  });

  it('uses heard questions only when fresh ones run out, and says so', () => {
    const small = catalog(1);
    const heard = new Set(small.map((r) => r[0]));
    const res = buildScrimmage(small, { size: 10, level: 'late', heard, random: seededRandom('h') });
    expect(res.pairs).toHaveLength(10);
    expect(res.heardPairs).toBe(10);
    for (const p of res.pairs) expect(Number(/-r(\d+)-/.exec(p.tossupId)![1])).toBeGreaterThanOrEqual(11);
  });
});

describe('Finals and tiebreaker formats', () => {
  const rows = catalog(8);

  it('spreads k items evenly over n positions', () => {
    expect(spread(10, 5)).toEqual([1, 3, 5, 7, 9]);
    expect(spread(6, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(spread(5, 0)).toEqual([]);
    expect(spread(4, 9)).toEqual([0, 1, 2, 3]);
  });

  it('a tiebreaker packet has toss-ups only', () => {
    const res = buildScrimmage(rows, { size: 10, level: 'any', heard: new Set(), format: 'tiebreak', random: seededRandom('t') });
    expect(res.pairs).toHaveLength(10);
    expect(res.pairs.every((p) => p.bonusId === undefined)).toBe(true);
  });

  it('a Finals visual round swaps a share of bonuses for visual bonuses in the same subject', () => {
    const asked: string[] = [];
    let n = 0;
    const res = buildScrimmage(rows, {
      size: 30,
      level: 'any',
      heard: new Set(),
      format: 'finals-visual',
      visualShare: 0.5,
      random: seededRandom('v'),
      pickVisual: (subject) => {
        asked.push(subject);
        n += 1;
        return `vis-${subject}-x-${n}`;
      },
    });
    expect(res.visualBonuses).toBe(15);
    const visual = res.pairs.filter((p) => p.visual);
    expect(visual).toHaveLength(15);
    for (const p of visual) expect(p.bonusId!.startsWith(`vis-${p.subject}-`)).toBe(true);
    // Every other pair: no two visual bonuses in a row.
    res.pairs.forEach((p, i) => {
      if (i > 0) expect(p.visual && res.pairs[i - 1]!.visual).toBeFalsy();
    });
  });

  it('keeps the printed bonus when no visual bonus is available for a subject', () => {
    const res = buildScrimmage(rows, { size: 12, level: 'any', heard: new Set(), format: 'finals-visual', visualShare: 1, pickVisual: (s) => (s === 'math' ? 'vis-math-sector-1' : null), random: seededRandom('m') });
    expect(res.pairs.filter((p) => p.visual).every((p) => p.subject === 'math')).toBe(true);
    expect(res.pairs.filter((p) => !p.visual).every((p) => p.bonusId?.startsWith('doe-'))).toBe(true);
  });

  it('targets the nationals-level packets the team uploaded', () => {
    const q = (id: string, kind: 'tossup' | 'bonus', subject: CoreSubject) => ({
      id, kind, number: 1, subject, sourceCategory: '', format: 'short_answer' as const, stem: 'x?', answer: 'Y', accept: [], reject: [], answerRaw: 'Y',
      source: { provider: 'team' as const, setId: 'team-nat', roundId: 'team-nat-r01', credit: '' },
    });
    // Uploaded questions use the library's id pattern: <set>-r01-t01 and <set>-r01-b01.
    const num = (i: number, k: number) => String(i * 2 + k).padStart(2, '0');
    const pairs = CORE_SUBJECTS.flatMap((s, i) => [1, 2].map((k) => ({ number: i * 2 + k, tossup: q(`team-nat-r01-t${num(i, k)}`, 'tossup', s), bonus: q(`team-nat-r01-b${num(i, k)}`, 'bonus', s) })));
    const packet: TeamPacket = {
      id: 'nat', kind: 'upload', title: 'Nationals practice', createdAt: '2026-11-07', level: 'nationals',
      set: { id: 'team-nat', provider: 'team', level: 'HS', title: 'Nationals practice', credit: '', license: '', rounds: [{ id: 'team-nat-r01', label: 'Round 1', order: 1, pairs }] },
    };
    const team = teamCatalog([packet]);
    const res = buildScrimmage([...rows, ...team.rows], { size: 12, level: 'nationals', heard: new Set(), teamLevels: team.levels, random: seededRandom('n') });
    expect(res.pairs.length).toBeGreaterThan(0);
    expect(res.pairs.every((p) => p.tossupId.startsWith('team-nat'))).toBe(true);
  });
});
