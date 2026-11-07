import { describe, expect, it } from 'vitest';
import { judgeAnswer } from '../../judge/judge';
import { fractionText } from '../exact';
import { draftToQuestion } from '../index';
import { makeRng } from '../rng';
import { checkTemplate } from '../testkit';
import type { VisualTemplate } from '../types';
import { BIOLOGY_TEMPLATES, chainsTo, gametes, mrnaFromTemplate, offspring } from './biology';

const byId = (id: string): VisualTemplate => {
  const t = BIOLOGY_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`no template ${id}`);
  return t;
};

const drafts = (id: string, n = 200) => {
  const t = byId(id);
  return Array.from({ length: n }, (_, i) => ({ seed: i + 1, t, d: t.make(makeRng(i + 1)) }));
};

describe('biology visual templates', () => {
  it('has templates', () => expect(BIOLOGY_TEMPLATES.length).toBeGreaterThan(0));
  for (const t of BIOLOGY_TEMPLATES) it(t.id, () => checkTemplate(t));
});

describe('dihybrid Punnett square', () => {
  it('forms gametes and offspring genotypes', () => {
    expect(gametes(['R', 'r'], ['Y', 'y'])).toEqual(['RY', 'Ry', 'rY', 'ry']);
    expect(gametes(['R', 'R'], ['y', 'y'])).toEqual(['Ry', 'Ry', 'Ry', 'Ry']);
    expect(offspring('Ry', 'rY')).toBe('RrYy');
    expect(offspring('rY', 'RY')).toBe('RrYY');
    expect(offspring('ry', 'ry')).toBe('rryy');
  });

  it('gives the 9:3:3:1 ratio for a dihybrid cross', () => {
    const g = gametes(['R', 'r'], ['Y', 'y']);
    const all = g.flatMap((x) => g.map((y) => offspring(x, y)));
    const dom = (s: string, i: number) => s[2 * i] === s[2 * i]!.toUpperCase();
    expect(all.filter((s) => dom(s, 0) && dom(s, 1)).length).toBe(9);
    expect(all.filter((s) => dom(s, 0) && !dom(s, 1)).length).toBe(3);
    expect(all.filter((s) => !dom(s, 0) && !dom(s, 1)).length).toBe(1);
    expect(all.filter((s) => s === 'RrYy').length).toBe(4);
  });

  it('answers agree with the cells in the figure', () => {
    for (const { d } of drafts('biology-dihybrid-punnett')) {
      const rows = /Rows of offspring genotypes: ([^.]*)\./.exec(d.alt)![1]!.split('; ').map((r) => r.split(', '));
      const cells = rows.flat();
      expect(cells.length).toBe(16);
      const m = /the genotype (\w+)\?/.exec(d.stem);
      if (m) expect(d.answer).toBe(fractionText(cells.filter((c) => c === m[1]).length, 16));
    }
  });
});

describe('food web', () => {
  it('counts food chains from producers to a top consumer', () => {
    const web = {
      levels: [['Grass', 'Clover'], ['Rabbit', 'Mouse'], ['Snake'], ['Hawk']],
      links: [
        ['Grass', 'Rabbit'],
        ['Clover', 'Rabbit'],
        ['Grass', 'Mouse'],
        ['Rabbit', 'Snake'],
        ['Mouse', 'Snake'],
        ['Snake', 'Hawk'],
      ] as Array<[string, string]>,
    };
    expect(chainsTo(web, 'Hawk')).toBe(3);
    expect(chainsTo(web, 'Rabbit')).toBe(2);
  });

  it('every consumer eats only organisms one trophic level below it', () => {
    for (const { d } of drafts('biology-food-web')) {
      const rows = /organisms: ([^(]*) \(bottom row to top row\)/.exec(d.alt)![1]!.split('; ').map((r) => r.split(', ').map((x) => x.toLowerCase()));
      expect(rows.length).toBe(4);
      const level = new Map<string, number>();
      rows.forEach((r, i) => r.forEach((n) => level.set(n, i)));
      const arrows = /Arrows run from (.*?)\.( The|$)/.exec(d.alt)![1]!.split(', ').map((a) => a.split(' to '));
      for (const [food, eater] of arrows) expect(level.get(eater!)! - level.get(food!)!).toBe(1);
      // Every consumer has food, and everything below the top row is eaten.
      for (const [n, lv] of level) {
        if (lv > 0) expect(arrows.some(([, e]) => e === n)).toBe(true);
        if (lv < 3) expect(arrows.some(([f]) => f === n)).toBe(true);
      }
    }
  });
});

describe('allele frequency', () => {
  it('computes allele frequencies from genotype counts', () => {
    for (const { d } of drafts('biology-allele-frequency')) {
      const m = /genotype: (\w)\w, ([\d,]+); \w\w, ([\d,]+); \w\w, ([\d,]+)\./.exec(d.alt);
      if (!m) continue;
      const [AA, Aa, aa] = [m[2], m[3], m[4]].map((x) => Number(x!.replace(/,/g, '')));
      const N = AA! + Aa! + aa!;
      const dominant = new RegExp(`frequency of the ${m[1]} allele`).test(d.stem);
      const nA = 2 * AA! + Aa!;
      expect(d.answer).toBe(fractionText(dominant ? nA : 2 * N - nA, 2 * N));
    }
  });

  it('accepts the decimal form of a frequency', () => {
    let seen = 0;
    for (const { seed, t, d } of drafts('biology-allele-frequency')) {
      if (d.answer !== '3/5') continue;
      const q = draftToQuestion(t, seed, d);
      expect(judgeAnswer(q, '0.6').verdict).toBe('correct');
      expect(judgeAnswer(q, '6/10').verdict).toBe('incorrect');
      seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('applies Hardy–Weinberg to phenotype counts', () => {
    for (const { d } of drafts('biology-allele-frequency', 400)) {
      const m = /two bars: ([\d,]+) individuals with the dominant phenotype and ([\d,]+) with the recessive/.exec(d.alt);
      if (!m) continue;
      const dom = Number(m[1]!.replace(/,/g, ''));
      const rec = Number(m[2]!.replace(/,/g, ''));
      const N = dom + rec;
      const q = Math.sqrt(rec / N);
      const p = 1 - q;
      const value = d.answer.includes('/') ? Number(d.answer.split('/')[0]) / Number(d.answer.split('/')[1]) : Number(d.answer.replace(/,/g, ''));
      if (/recessive allele\?/.test(d.stem)) expect(value).toBeCloseTo(q, 9);
      else if (/dominant allele\?/.test(d.stem)) expect(value).toBeCloseTo(p, 9);
      else if (/fraction .* heterozygous/.test(d.stem)) expect(value).toBeCloseTo(2 * p * q, 9);
      else if (/homozygous dominant/.test(d.stem)) expect(value).toBeCloseTo(p * p, 9);
      else expect(value).toBeCloseTo(2 * p * q * N, 6);
    }
  });
});

describe('transcription', () => {
  it('reads the template backward and pairs each base, with U for A', () => {
    // Template 5′-TACGGATTC-3′ pairs with mRNA 3′-AUGCCUAAG-5′, i.e. 5′-GAAUCCGUA-3′.
    expect(mrnaFromTemplate('TACGGATTC')).toBe('GAAUCCGUA');
  });

  it('answers agree with the strand drawn, whichever way it runs', () => {
    for (const { seed, t, d } of drafts('biology-transcription')) {
      const ends = (s: string) => {
        const m = /([35])′-([ACGT]+)-([35])′/.exec(s)!;
        return m[1] === '5' ? m[2]! : [...m[2]!].reverse().join('');
      };
      const templateText = d.alt.includes('Top strand (template')
        ? /Top strand \(template strand\), left to right: ([^.]*)\./.exec(d.alt)![1]!
        : d.alt.includes('Bottom strand (template')
          ? /Bottom strand \(template strand\), left to right: ([^.]*)\./.exec(d.alt)![1]!
          : /reading left to right (.*)\./.exec(d.alt)![1]!;
      expect(d.answer).toBe(mrnaFromTemplate(ends(templateText)));
      const q = draftToQuestion(t, seed, d);
      expect(judgeAnswer(q, d.answer.match(/.{1,3}/g)!.join(' ')).verdict).toBe('correct');
      expect(judgeAnswer(q, `5'-${d.answer}-3'`).verdict).toBe('correct');
    }
  });
});

describe('cell cycle', () => {
  it('answers agree with the phase lengths in the pie chart', () => {
    for (const { d } of drafts('biology-cell-cycle')) {
      const hours = [...d.alt.matchAll(/(G1|S|G2|M) (\d+) (hours|percent)/g)].map((m) => Number(m[2]));
      const percent = d.alt.includes('percent');
      if (percent) {
        const total = Number(/lasts (\d+) hours/.exec(d.stem)![1]);
        const phase = /spend in (?:the )?(G1|S|G2|M)/.exec(d.stem)![1]!;
        expect(Number(d.answer)).toBe((hours[['G1', 'S', 'G2', 'M'].indexOf(phase)]! * total) / 100);
        continue;
      }
      const total = hours.reduce((a, b) => a + b, 0);
      if (/interphase/.test(d.stem)) expect(d.answer).toBe(fractionText(total - hours[3]!, total));
      const cells = /how many of ([\d,]+) cells .* in (?:the )?(G1|S|G2|M)/.exec(d.stem);
      if (cells) {
        const n = Number(cells[1]!.replace(/,/g, ''));
        const h = hours[['G1', 'S', 'G2', 'M'].indexOf(cells[2]!)]!;
        expect(Number(d.answer.replace(/,/g, ''))).toBe((n * h) / total);
      }
    }
  });
});
