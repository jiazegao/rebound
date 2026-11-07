import { describe, expect, it } from 'vitest';
import { pickDrill } from './drill';
import { rowLevel } from './levels';
import type { CatalogRow } from './schema';

describe('difficulty ladder filter', () => {
  it('serves only questions at the chosen level', () => {
    const rows: CatalogRow[] = [];
    for (let r = 1; r <= 17; r++) {
      const base = `doe-hs-01-r${String(r).padStart(2, '0')}`;
      rows.push([`${base}-t01`, 'physics', 'physics.optics', 't', r, '']);
    }
    rows.push(['team-nat-r01-t01', 'physics', 'physics.optics', 't', 24, '']);
    const levelOf = (row: CatalogRow) => rowLevel(row, new Map([['team-nat', 'nationals' as const]]));
    const late = pickDrill(rows, { subject: 'physics', count: 20, level: 'late', levelOf });
    expect(late.length).toBe(7);
    expect(late.every((p) => Number(/-r(\d+)-/.exec(p.questionId)![1]) >= 11)).toBe(true);
    const nationals = pickDrill(rows, { subject: 'physics', count: 5, level: 'nationals', levelOf });
    expect(nationals.map((p) => p.questionId)).toEqual(['team-nat-r01-t01']);
  });
});
