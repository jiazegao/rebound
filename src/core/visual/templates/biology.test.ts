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
    const kinds = new Set<string>();
    for (const { d } of drafts('biology-dihybrid-punnett', 400)) {
      const rows = /Rows of offspring genotypes: ([^.]*)\./.exec(d.alt)![1]!.split('; ').map((r) => r.split(', '));
      const cells = rows.flat();
      expect(cells.length).toBe(16);
      const genes = [...d.alt.matchAll(/(seed shape|seed color|flower color|stem length|pod color), with \w for (\w+) dominant to \w for (\w+)/g)].map((m) => ({
        organ: { 'seed shape': 'seeds', 'seed color': 'seeds', 'flower color': 'flowers', 'stem length': 'stems', 'pod color': 'pods' }[m[1]!]!,
        dom: m[2]!,
        rec: m[3]!,
      }));
      expect(genes.length).toBe(2);
      const dom = (c: string, i: number) => c[2 * i] === c[2 * i]!.toUpperCase();
      const het = (c: string, i: number) => c[2 * i] !== c[2 * i + 1];
      let count: number | null = null;
      const geno = /the genotype (\w+)\?/.exec(d.stem);
      if (geno) {
        count = cells.filter((c) => c === geno[1]).length;
        kinds.add('genotype');
      } else if (/heterozygous for both/.test(d.stem)) {
        count = cells.filter((c) => het(c, 0) && het(c, 1)).length;
        kinds.add('het');
      } else if (/homozygous for both/.test(d.stem)) {
        count = cells.filter((c) => !het(c, 0) && !het(c, 1)).length;
        kinds.add('hom');
      } else {
        const [g1, g2] = genes as [(typeof genes)[0], (typeof genes)[0]];
        for (const d1 of [true, false]) {
          for (const d2 of [true, false]) {
            const w1 = d1 ? g1.dom : g1.rec;
            const w2 = d2 ? g2.dom : g2.rec;
            const phrase = g1.organ === g2.organ ? `${w1}, ${w2} ${g1.organ}` : `${w1} ${g1.organ} and ${w2} ${g2.organ}`;
            if (!d.stem.includes(`have ${phrase}?`)) continue;
            count = cells.filter((c) => dom(c, 0) === d1 && dom(c, 1) === d2).length;
            kinds.add('phenotype');
          }
        }
      }
      expect(count).not.toBeNull();
      expect(d.answer).toBe(fractionText(count!, 16));
    }
    expect([...kinds].sort()).toEqual(['genotype', 'het', 'hom', 'phenotype']);
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
      const arrows = /Arrows run from (.*?)\.( The|$)/.exec(d.alt)![1]!.split(', ').map((a) => a.toLowerCase().split(' to '));
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
    let checked = 0;
    for (const { d } of drafts('biology-allele-frequency')) {
      const m = /genotype: (\w)\w, ([\d,]+); \w\w, ([\d,]+); \w\w, ([\d,]+)\./.exec(d.alt);
      if (!m) continue;
      checked++;
      const [AA, Aa, aa] = [m[2], m[3], m[4]].map((x) => Number(x!.replace(/,/g, '')));
      const N = AA! + Aa! + aa!;
      const dominant = new RegExp(`frequency of the ${m[1]} allele`).test(d.stem);
      const nA = 2 * AA! + Aa!;
      expect(d.answer).toBe(fractionText(dominant ? nA : 2 * N - nA, 2 * N));
    }
    expect(checked).toBeGreaterThan(50);
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
    let checked = 0;
    for (const { d } of drafts('biology-allele-frequency', 400)) {
      const m = /two bars: ([\d,]+) individuals with the dominant phenotype and ([\d,]+) with the recessive/.exec(d.alt);
      if (!m) continue;
      checked++;
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
    expect(checked).toBeGreaterThan(50);
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
      const swapped = d.answer.slice(0, 4) + (d.answer[4] === 'A' ? 'G' : 'A') + d.answer.slice(5);
      expect(judgeAnswer(q, swapped).verdict).toBe('incorrect');
      expect(judgeAnswer(q, [...d.answer].reverse().join('')).verdict).not.toBe('correct');
    }
  });
});

describe('cell cycle', () => {
  it('answers agree with the phase lengths in the pie chart', () => {
    let checked = 0;
    for (const { d } of drafts('biology-cell-cycle', 300)) {
      const hours = [...d.alt.matchAll(/(G1|S|G2|M) (\d+) (hours|percent)/g)].map((m) => Number(m[2]));
      const percent = d.alt.includes('percent');
      if (percent) {
        const total = Number(/lasts (\d+) hours/.exec(d.stem)![1]);
        const phase = /spend in (?:the )?(G1|S|G2|M)/.exec(d.stem)![1]!;
        expect(Number(d.answer)).toBe((hours[['G1', 'S', 'G2', 'M'].indexOf(phase)]! * total) / 100);
        checked++;
        continue;
      }
      const total = hours.reduce((a, b) => a + b, 0);
      const phaseOf = (name: string) => hours[['G1', 'S', 'G2', 'M'].indexOf(name)]!;
      const cells = /how many of ([\d,]+) cells .* in (?:the )?(G1|S|G2|M)/.exec(d.stem);
      const frac = /spend in (?:the )?(G1|S|G2|M)\b/.exec(d.stem);
      if (/interphase/.test(d.stem)) expect(d.answer).toBe(fractionText(total - hours[3]!, total));
      else if (cells) expect(Number(d.answer.replace(/,/g, ''))).toBe((Number(cells[1]!.replace(/,/g, '')) * phaseOf(cells[2]!)) / total);
      else expect(d.answer).toBe(fractionText(phaseOf(frac![1]!), total));
      checked++;
    }
    expect(checked).toBe(300);
  });
});

describe('pedigree', () => {
  type Mode = 'AD' | 'AR' | 'XD' | 'XR';
  interface Ind {
    male: boolean;
    affected: boolean;
    father?: number;
    mother?: number;
  }

  /** Genotypes as the number of trait alleles (a male's X-linked genotype is 0 or 1). */
  function solutions(mode: Mode, people: Ind[], limit = 1000): number[][] {
    const xLinked = mode === 'XD' || mode === 'XR';
    const options = (p: Ind) => (xLinked && p.male ? [0, 1] : [0, 1, 2]);
    const shows = (p: Ind, g: number) =>
      mode === 'AD' || mode === 'XD' ? g >= 1 : mode === 'AR' ? g === 2 : p.male ? g === 1 : g === 2;
    const passes = (g: number) => (g === 0 ? [0] : g === 1 ? [0, 1] : [1]);
    const fromParents = (p: Ind, g: number, gf: number, gm: number) => {
      if (!xLinked) return passes(gf).some((a) => passes(gm).some((b) => a + b === g));
      return p.male ? passes(gm).includes(g) : passes(gm).some((b) => gf + b === g);
    };
    const out: number[][] = [];
    const g: number[] = [];
    const dfs = (i: number) => {
      if (out.length >= limit) return;
      if (i === people.length) {
        out.push([...g]);
        return;
      }
      const p = people[i]!;
      for (const v of options(p)) {
        if (shows(p, v) !== p.affected) continue;
        if (p.father !== undefined && !fromParents(p, v, g[p.father]!, g[p.mother!]!)) continue;
        g[i] = v;
        dfs(i + 1);
      }
    };
    dfs(0);
    return out;
  }

  /** Read the pedigree back from its alt text: generation I, generation II (with the spouse), generation III. */
  function parse(alt: string): { people: Ind[]; link: number; spouse: number } {
    const section = (name: string) => alt.slice(alt.indexOf(`Generation ${name}`)).split('Generation ')[1]!;
    const persons = (s: string) => [...s.matchAll(/(\d+), (affected|unaffected) (male|female)/g)].map((m) => ({ affected: m[2] === 'affected', male: m[3] === 'male' }));
    const g1 = persons(section('I:'));
    const g2 = persons(section('II,'));
    const g3 = persons(section('III,'));
    const linkNo = Number(/II-(\d+) is married to/.exec(alt)![1]);
    const people: Ind[] = [];
    g1.forEach((p) => people.push(p));
    const father1 = g1.findIndex((p) => p.male);
    const mother1 = g1.findIndex((p) => !p.male);
    g2.forEach((p, i) => people.push(i === g2.length - 1 ? p : { ...p, father: father1, mother: mother1 }));
    const link = 2 + linkNo - 1;
    const spouse = 2 + g2.length - 1;
    const [f, m] = people[link]!.male ? [link, spouse] : [spouse, link];
    g3.forEach((p) => people.push({ ...p, father: f, mother: m }));
    return { people, link, spouse };
  }

  it('the solver tells the classic patterns apart', () => {
    // Two unaffected parents with an affected daughter: only autosomal recessive.
    const ar: Ind[] = [{ male: true, affected: false }, { male: false, affected: false }, { male: false, affected: true, father: 0, mother: 1 }];
    expect((['AD', 'AR', 'XD', 'XR'] as Mode[]).filter((m) => solutions(m, ar).length > 0)).toEqual(['AR']);
    // Two affected parents with an unaffected daughter: only autosomal dominant.
    const ad: Ind[] = [{ male: true, affected: true }, { male: false, affected: true }, { male: false, affected: false, father: 0, mother: 1 }];
    expect((['AD', 'AR', 'XD', 'XR'] as Mode[]).filter((m) => solutions(m, ad).length > 0)).toEqual(['AD']);
  });

  it('every pedigree fits exactly one mode of inheritance, and the couple asked about has known genotypes', () => {
    for (const { d } of drafts('biology-pedigree', 300)) {
      const { people, link, spouse } = parse(d.alt);
      const fits = (['AD', 'AR', 'XD', 'XR'] as Mode[]).filter((m) => solutions(m, people).length > 0);
      expect(fits.length).toBe(1);
      const mode = fits[0]!;
      if (d.format === 'multiple_choice') expect(d.answer).toBe(mode === 'AD' ? 'Autosomal dominant' : 'Autosomal recessive');
      else expect(d.stem).toContain(mode === 'AD' ? 'autosomal dominant' : 'autosomal recessive');
      // Both members of the couple are heterozygous in every genotype assignment that fits.
      const couples = new Set(solutions(mode, people).map((g) => `${g[link]}${g[spouse]}`));
      expect([...couples]).toEqual(['11']);
    }
  });
});
