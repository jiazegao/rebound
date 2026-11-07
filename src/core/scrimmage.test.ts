import { describe, expect, it } from 'vitest';
import { seededRandom } from './plan';
import { buildScrimmage, subjectQuotas } from './scrimmage';
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
