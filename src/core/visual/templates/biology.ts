/**
 * Generated visual bonuses: biology.
 * Each template draws a figure (svg.ts) and asks a bonus question about it with an exact answer.
 * See src/core/visual/README.md for the rules every template follows.
 */
import { multipleChoice } from '../choices';
import { decimalText, fractionText, gcd } from '../exact';
import type { Rng } from '../rng';
import { ACCENT, INK, PAPER, SOFT, arrow, circle, figure, line, path, rect, num, text } from '../svg';
import type { VisualTemplate } from '../types';
import { commas, textWidth } from './earth_bio_kit';

/** A fraction answer, with its decimal form accepted when it is short and exact (allele frequencies are often given as decimals). */
function fractionWithDecimal(n: number, d: number): { answer: string; accept: string[] } {
  const answer = fractionText(n, d);
  const value = n / d;
  const dec = decimalText(value, 4);
  const exact = Math.abs(Number(dec) - value) < 1e-12 && dec !== answer;
  return { answer, accept: exact ? [dec, ...(dec.startsWith('0.') ? [dec.slice(1)] : [])] : [] };
}

/* ---------------- a dihybrid Punnett square ---------------- */

interface PeaGene {
  letter: string;
  trait: string;
  dom: string;
  rec: string;
  organ: string;
}

const PEA_GENES: PeaGene[] = [
  { letter: 'R', trait: 'Seed shape', dom: 'round', rec: 'wrinkled', organ: 'seeds' },
  { letter: 'Y', trait: 'Seed color', dom: 'yellow', rec: 'green', organ: 'seeds' },
  { letter: 'P', trait: 'Flower color', dom: 'purple', rec: 'white', organ: 'flowers' },
  { letter: 'T', trait: 'Stem length', dom: 'long', rec: 'short', organ: 'stems' },
  { letter: 'G', trait: 'Pod color', dom: 'green', rec: 'yellow', organ: 'pods' },
];

/** A parent's genotype for one gene as its two alleles, dominant first: "Rr". */
function alleles(g: PeaGene, dominantCount: number): [string, string] {
  const A = g.letter;
  const a = g.letter.toLowerCase();
  return dominantCount === 2 ? [A, A] : dominantCount === 1 ? [A, a] : [a, a];
}

/** The four gametes of a dihybrid parent, in Punnett order (repeats kept, so each is 1/4). */
export function gametes(g1: [string, string], g2: [string, string]): string[] {
  return [g1[0] + g2[0], g1[0] + g2[1], g1[1] + g2[0], g1[1] + g2[1]];
}

/** The offspring genotype from two gametes, each gene written dominant allele first: "RrYy". */
export function offspring(x: string, y: string): string {
  const pair = (p: string, q: string) => (p === p.toUpperCase() ? p + q : q + p);
  return pair(x[0]!, y[0]!) + pair(x[1]!, y[1]!);
}

const dihybridPunnett: VisualTemplate = {
  id: 'biology-dihybrid-punnett',
  subject: 'biology',
  title: 'Dihybrid Punnett square',
  description:
    "A completed 4 × 4 Punnett square for two pea-plant genes, with each parent's gametes and a key to the alleles; asks for the fraction of offspring with a given genotype or phenotype.",
  make(rng) {
    const [ga, gb] = rng.sample(PEA_GENES, 2) as [PeaGene, PeaGene];
    const pickCount = () => (rng.chance(0.6) ? 1 : rng.chance(0.5) ? 2 : 0);
    let counts: number[];
    do counts = [pickCount(), pickCount(), pickCount(), pickCount()];
    while (counts.filter((c) => c === 1).length < 2);
    const top = gametes(alleles(ga, counts[0]!), alleles(gb, counts[1]!));
    const side = gametes(alleles(ga, counts[2]!), alleles(gb, counts[3]!));
    const cells = side.map((y) => top.map((x) => offspring(x, y)));
    const all = cells.flat();
    const isDom = (geno: string, i: number) => geno[2 * i] === geno[2 * i]!.toUpperCase();

    const phrase = (d1: boolean, d2: boolean) => {
      const w1 = d1 ? ga.dom : ga.rec;
      const w2 = d2 ? gb.dom : gb.rec;
      return ga.organ === gb.organ ? `${w1}, ${w2} ${ga.organ}` : `${w1} ${ga.organ} and ${w2} ${gb.organ}`;
    };
    const questions: Array<{ ask: string; count: number }> = [];
    for (const d1 of [true, false]) {
      for (const d2 of [true, false]) {
        questions.push({ ask: `have ${phrase(d1, d2)}`, count: all.filter((g) => isDom(g, 0) === d1 && isDom(g, 1) === d2).length });
      }
    }
    for (const geno of new Set(all)) questions.push({ ask: `have the genotype ${geno}`, count: all.filter((g) => g === geno).length });
    const het = (g: string, i: number) => g[2 * i] !== g[2 * i + 1];
    questions.push({ ask: 'be heterozygous for both genes', count: all.filter((g) => het(g, 0) && het(g, 1)).length });
    questions.push({ ask: 'be homozygous for both genes', count: all.filter((g) => !het(g, 0) && !het(g, 1)).length });
    const usable = questions.filter((q) => q.count > 0 && q.count < 16);
    const q = rng.pick(usable);

    const cw = 84;
    const ch = 38;
    const hw = 62;
    const hh = 34;
    const x0 = (480 - (hw + 4 * cw)) / 2;
    const y0 = 14;
    const parts: string[] = [];
    parts.push(rect(x0 + hw, y0, 4 * cw, hh, { stroke: 'none', fill: INK, fillOpacity: SOFT }));
    parts.push(rect(x0, y0 + hh, hw, 4 * ch, { stroke: 'none', fill: INK, fillOpacity: SOFT }));
    for (let i = 0; i <= 4; i++) {
      parts.push(line(x0 + hw + i * cw, y0, x0 + hw + i * cw, y0 + hh + 4 * ch, { width: i === 0 ? 2 : 1.3 }));
      parts.push(line(x0, y0 + hh + i * ch, x0 + hw + 4 * cw, y0 + hh + i * ch, { width: i === 0 ? 2 : 1.3 }));
    }
    top.forEach((g, i) => parts.push(text(x0 + hw + (i + 0.5) * cw, y0 + hh / 2, g, { anchor: 'middle', baseline: 'middle', size: 17, weight: 'bold' })));
    side.forEach((g, j) => parts.push(text(x0 + hw / 2, y0 + hh + (j + 0.5) * ch, g, { anchor: 'middle', baseline: 'middle', size: 17, weight: 'bold' })));
    cells.forEach((row, j) =>
      row.forEach((g, i) => parts.push(text(x0 + hw + (i + 0.5) * cw, y0 + hh + (j + 0.5) * ch, g, { anchor: 'middle', baseline: 'middle', size: 16 }))),
    );
    const keyY = y0 + hh + 4 * ch + 30;
    [ga, gb].forEach((g, i) =>
      parts.push(text(x0, keyY + i * 24, `${g.trait}: ${g.letter} = ${g.dom} (dominant), ${g.letter.toLowerCase()} = ${g.rec}`, { size: 15 })),
    );
    const key = (g: PeaGene) => `${g.trait.toLowerCase()}, with ${g.letter} for ${g.dom} dominant to ${g.letter.toLowerCase()} for ${g.rec}`;
    return {
      stem: `The completed Punnett square shows a cross between two pea plants. What fraction of the offspring are expected to ${q.ask}?`,
      format: 'short_answer',
      answer: fractionText(q.count, 16),
      svg: figure(480, keyY + 38, ...parts),
      alt: `A 4 by 4 Punnett square. Gametes across the top: ${top.join(', ')}. Gametes down the side: ${side.join(', ')}. Rows of offspring genotypes: ${cells.map((r) => r.join(', ')).join('; ')}. Key: ${key(ga)}; ${key(gb)}.`,
      topic: 'biology.genetics',
    };
  },
};

/* ---------------- a food web ---------------- */

interface Organism {
  name: string;
  /** What it eats (organisms one trophic level down). */
  eats: string[];
}

interface Ecosystem {
  levels: [Organism[], Organism[], Organism[], Organism[]];
}

const o = (name: string, eats: string[] = []): Organism => ({ name, eats });

/** Each organism has one trophic level, and eats only organisms one level down, so every level is unambiguous. */
const ECOSYSTEMS: Ecosystem[] = [
  {
    levels: [
      [o('Grass'), o('Clover'), o('Oak tree')],
      [o('Grasshopper', ['Grass', 'Clover']), o('Rabbit', ['Grass', 'Clover']), o('Mouse', ['Grass', 'Oak tree']), o('Caterpillar', ['Clover', 'Oak tree']), o('Squirrel', ['Oak tree'])],
      [o('Frog', ['Grasshopper', 'Caterpillar']), o('Snake', ['Mouse', 'Rabbit', 'Squirrel']), o('Shrew', ['Grasshopper', 'Caterpillar']), o('Songbird', ['Caterpillar', 'Grasshopper'])],
      [o('Hawk', ['Snake', 'Frog', 'Shrew', 'Songbird']), o('Owl', ['Shrew', 'Snake', 'Frog'])],
    ],
  },
  {
    levels: [
      [o('Algae'), o('Phytoplankton'), o('Pondweed')],
      [o('Zooplankton', ['Algae', 'Phytoplankton']), o('Snail', ['Algae', 'Pondweed']), o('Tadpole', ['Algae']), o('Mayfly nymph', ['Algae', 'Pondweed'])],
      [o('Minnow', ['Zooplankton', 'Mayfly nymph']), o('Dragonfly nymph', ['Mayfly nymph', 'Tadpole']), o('Sunfish', ['Snail', 'Zooplankton', 'Mayfly nymph']), o('Water beetle', ['Tadpole', 'Snail'])],
      [o('Bass', ['Minnow', 'Sunfish', 'Dragonfly nymph', 'Water beetle']), o('Heron', ['Minnow', 'Sunfish']), o('Kingfisher', ['Minnow'])],
    ],
  },
  {
    levels: [
      [o('Phytoplankton'), o('Kelp')],
      [o('Zooplankton', ['Phytoplankton']), o('Krill', ['Phytoplankton']), o('Sea urchin', ['Kelp']), o('Abalone', ['Kelp'])],
      [o('Herring', ['Zooplankton', 'Krill']), o('Squid', ['Krill', 'Zooplankton']), o('Sea otter', ['Sea urchin', 'Abalone'])],
      [o('Seal', ['Herring', 'Squid']), o('Tuna', ['Herring', 'Squid']), o('Bald eagle', ['Herring', 'Sea otter'])],
    ],
  },
];

export interface FoodWeb {
  /** levels[0] producers … levels[3] tertiary consumers. */
  levels: string[][];
  /** [food, eater]: energy flows from food to eater. */
  links: Array<[string, string]>;
}

/** Choose organisms so every consumer has food in the web and everything below the top is eaten by something. */
function buildWeb(rng: Rng): FoodWeb {
  for (;;) {
    const eco = rng.pick(ECOSYSTEMS);
    const chosen: Organism[][] = [[], [], [], []];
    chosen[3] = rng.sample(eco.levels[3], rng.chance(0.6) ? 1 : 2);
    let ok = true;
    for (let lv = 2; lv >= 0 && ok; lv--) {
      const above = chosen[lv + 1]!;
      const eaten = eco.levels[lv].filter((x) => above.some((y) => y.eats.includes(x.name)));
      const size = Math.min(eaten.length, rng.int(2, 3));
      // Keep sampling until every organism above has something to eat.
      let pick: Organism[] = [];
      for (let tries = 0; tries < 20; tries++) {
        pick = rng.sample(eaten, size);
        if (above.every((y) => y.eats.some((n) => pick.some((p) => p.name === n)))) break;
        pick = [];
      }
      if (pick.length < 2 && lv > 0) ok = false;
      if (pick.length === 0) ok = false;
      chosen[lv] = pick;
    }
    if (!ok) continue;
    const links: Array<[string, string]> = [];
    for (let lv = 1; lv <= 3; lv++) {
      for (const eater of chosen[lv]!) for (const food of chosen[lv - 1]!) if (eater.eats.includes(food.name)) links.push([food.name, eater.name]);
    }
    return { levels: chosen.map((l) => l.map((x) => x.name)), links };
  }
}

/** The number of food chains that start at a producer and end at `top`. */
export function chainsTo(web: FoodWeb, top: string): number {
  const producers = new Set(web.levels[0]);
  const count = (name: string): number => (producers.has(name) ? 1 : web.links.filter(([, eater]) => eater === name).reduce((s, [food]) => s + count(food), 0));
  return count(top);
}

const foodWeb: VisualTemplate = {
  id: 'biology-food-web',
  subject: 'biology',
  title: 'Food web',
  description:
    'A food web with arrows in the direction of energy flow; asks how many food chains end at a top consumer, how many organisms are at a trophic level, or how much energy reaches a highlighted organism by the 10% rule.',
  make(rng) {
    const web = buildWeb(rng);
    const levelOf = new Map<string, number>();
    web.levels.forEach((l, i) => l.forEach((n) => levelOf.set(n, i)));
    const kind = rng.pick(['chains', 'chains', 'count', 'energy'] as const);

    let stem: string;
    let answer: string;
    let highlight: string | null = null;
    const intro = 'In the food web shown, arrows point in the direction of energy flow.';
    if (kind === 'chains') {
      const top = rng.pick(web.levels[3]!);
      answer = String(chainsTo(web, top));
      stem = `${intro} How many different food chains in this web begin with a producer and end with the ${top.toLowerCase()}?`;
    } else if (kind === 'count') {
      const which = rng.pick([1, 2, -1]);
      const names = ['producers', 'primary consumers', 'secondary consumers'];
      const n = which === -1 ? web.levels[1]!.length + web.levels[2]!.length + web.levels[3]!.length : web.levels[which]!.length;
      answer = String(n);
      stem = which === -1 ? `${intro} How many of the organisms in this web are consumers?` : `${intro} How many ${names[which]} are in this food web?`;
    } else {
      const lv = rng.int(1, 3);
      highlight = rng.pick(web.levels[lv]!);
      const energy = rng.pick([10_000, 20_000, 50_000, 100_000, 200_000, 500_000]);
      answer = commas(energy / Math.pow(10, lv));
      stem = `${intro} The producers in this web capture ${commas(energy)} kilojoules of energy. According to the 10% rule, how many kilojoules of this energy reach the trophic level of the highlighted organism?`;
    }

    // Rows by trophic level, producers at the bottom; within a row, order by where each organism's food sits.
    const rowY = [262, 188, 114, 40];
    const pos = new Map<string, { x: number; y: number; w: number }>();
    const order: string[][] = [];
    web.levels.forEach((names, lv) => {
      let row = [...names];
      if (lv === 0) row = rng.shuffle(row);
      else {
        const mean = (n: string) => {
          const xs = web.links.filter(([, e]) => e === n).map(([f]) => pos.get(f)!.x);
          return xs.reduce((a, b) => a + b, 0) / xs.length;
        };
        row.sort((a, b) => mean(a) - mean(b));
      }
      order.push(row);
      row.forEach((n, i) => pos.set(n, { x: (480 * (i + 0.5)) / row.length, y: rowY[lv]!, w: textWidth(n, 15) + 22 }));
    });
    const boxH = 30;
    const parts: string[] = [];
    // Arrows first, from the top edge of the food to the bottom edge of the eater, spread along each edge.
    const spread = (n: string, list: string[], edgeWidth: number) => {
      const k = list.length;
      const stepX = Math.min(16, (edgeWidth - 20) / Math.max(1, k - 1));
      return (other: string) => pos.get(n)!.x + (list.indexOf(other) - (k - 1) / 2) * stepX;
    };
    const outX = new Map<string, (o: string) => number>();
    const inX = new Map<string, (o: string) => number>();
    for (const n of levelOf.keys()) {
      const eaters = web.links.filter(([f]) => f === n).map(([, e]) => e).sort((a, b) => pos.get(a)!.x - pos.get(b)!.x);
      const foods = web.links.filter(([, e]) => e === n).map(([f]) => f).sort((a, b) => pos.get(a)!.x - pos.get(b)!.x);
      outX.set(n, spread(n, eaters, pos.get(n)!.w));
      inX.set(n, spread(n, foods, pos.get(n)!.w));
    }
    for (const [f, e] of web.links) {
      const a = pos.get(f)!;
      const b = pos.get(e)!;
      parts.push(arrow(outX.get(f)!(e), a.y - boxH / 2, inX.get(e)!(f), b.y + boxH / 2 + 1, { width: 1.6, head: 9 }));
    }
    for (const [n, p] of pos) {
      const hl = n === highlight;
      parts.push(
        rect(p.x - p.w / 2, p.y - boxH / 2, p.w, boxH, {
          rx: 6,
          stroke: hl ? ACCENT : INK,
          width: hl ? 3 : 1.5,
          fill: hl ? ACCENT : PAPER,
          ...(hl ? { fillOpacity: 0.18 } : {}),
        }),
      );
      parts.push(text(p.x, p.y, n, { anchor: 'middle', baseline: 'middle', size: 15, halo: false, weight: hl ? 'bold' : 'normal' }));
    }
    const arrows = web.links.map(([f, e]) => `${f.toLowerCase()} to ${e.toLowerCase()}`).join(', ');
    return {
      stem,
      format: 'short_answer',
      answer,
      svg: figure(480, 290, ...parts),
      alt: `A food web of ${levelOf.size} organisms: ${order.map((r) => r.join(', ')).join('; ')} (bottom row to top row). Arrows run from ${arrows}.${highlight ? ` The ${highlight.toLowerCase()} is highlighted.` : ''}`,
      topic: 'biology.ecology',
    };
  },
};

/* ---------------- allele frequencies from a bar graph ---------------- */

const GENE_LETTERS = ['A', 'B', 'D', 'E', 'G', 'H', 'R', 'T'];

function barChart(bars: Array<{ label: string[]; value: number }>, yTitle: string): string {
  const left = 84;
  const right = 456;
  const top = 26;
  const bottom = 250;
  const max = Math.max(...bars.map((b) => b.value));
  const step = [10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => max / s <= 5)!;
  const yMax = Math.ceil(max / step) * step;
  const Y = (v: number) => bottom - ((bottom - top) * v) / yMax;
  const parts: string[] = [];
  for (let v = 0; v <= yMax; v += step) {
    parts.push(line(left, Y(v), right, Y(v), { width: 1, opacity: v === 0 ? 1 : 0.2 }));
    parts.push(text(left - 8, Y(v), commas(v), { anchor: 'end', baseline: 'middle', size: 13 }));
  }
  parts.push(line(left, top - 6, left, bottom, { width: 1.5 }));
  parts.push(line(left, bottom, right, bottom, { width: 1.5 }));
  const slot = (right - left) / bars.length;
  const bw = Math.min(84, slot * 0.55);
  bars.forEach((b, i) => {
    const cx = left + slot * (i + 0.5);
    parts.push(rect(cx - bw / 2, Y(b.value), bw, bottom - Y(b.value), { stroke: INK, width: 1.5, fill: INK, fillOpacity: 0.22 }));
    parts.push(text(cx, Y(b.value) - 8, commas(b.value), { anchor: 'middle', size: 15, weight: 'bold' }));
    b.label.forEach((l, j) => parts.push(text(cx, bottom + 22 + j * 17, l, { anchor: 'middle', size: b.label.length > 1 ? 14 : 17, weight: b.label.length > 1 ? 'normal' : 'bold' })));
  });
  parts.push(text(24, (top + bottom) / 2, yTitle, { anchor: 'middle', baseline: 'middle', size: 14, rotate: -90 }));
  return figure(480, 300, ...parts);
}

const alleleFrequency: VisualTemplate = {
  id: 'biology-allele-frequency',
  subject: 'biology',
  title: 'Allele frequencies and Hardy–Weinberg',
  description:
    'A bar graph of genotype counts (or of dominant and recessive phenotype counts) in a population; asks for an allele frequency, or a Hardy–Weinberg prediction, as a fraction.',
  make(rng) {
    const A = rng.pick(GENE_LETTERS);
    const a = A.toLowerCase();
    if (rng.chance(0.5)) {
      // Genotype counts: frequency = (2 × homozygotes + heterozygotes) / (2N). Counts are multiples of N/20.
      const N = rng.pick([100, 200, 400, 500]);
      const g = N / 20;
      const k = rng.int(4, 16); // p = k/20
      const lo = Math.max(1, k - 19);
      const hi = Math.floor((k - 1) / 1) >= 1 ? k - 1 : 1;
      // AA = g·m with 1 ≤ m, Aa = 2g(k − m) ≥ g, aa = g(20 − 2k + m) ≥ g.
      const mMin = Math.max(lo, 2 * k - 19);
      const mMax = Math.min(hi, k - 1);
      const m = rng.int(mMin, mMax);
      const counts = { AA: g * m, Aa: 2 * g * (k - m), aa: g * (20 - 2 * k + m) };
      const askDominant = rng.chance(0.5);
      const nA = 2 * counts.AA + counts.Aa;
      const { answer, accept } = fractionWithDecimal(askDominant ? nA : 2 * N - nA, 2 * N);
      return {
        stem: `The bar graph shows the number of individuals with each genotype for one gene in a population. What is the frequency of the ${askDominant ? A : a} allele in this population?`,
        format: 'short_answer',
        answer,
        accept,
        svg: barChart(
          [
            { label: [A + A], value: counts.AA },
            { label: [A + a], value: counts.Aa },
            { label: [a + a], value: counts.aa },
          ],
          'Number of individuals',
        ),
        alt: `A bar graph of the number of individuals with each genotype: ${A}${A}, ${commas(counts.AA)}; ${A}${a}, ${commas(counts.Aa)}; ${a}${a}, ${commas(counts.aa)}.`,
        topic: 'biology.genetics',
      };
    }
    // Phenotype counts in Hardy–Weinberg equilibrium: q² = recessive fraction.
    const options: Array<[number, number, number]> = [];
    for (const [qn, qd] of [[1, 10], [1, 5], [3, 10], [2, 5], [1, 2], [3, 5], [7, 10], [4, 5], [1, 4], [3, 4]] as Array<[number, number]>) {
      for (const N of [100, 200, 400, 500, 1000]) if (N % (qd * qd) === 0) options.push([qn, qd, N]);
    }
    const [qn, qd, N] = rng.pick(options);
    const recessive = (N * qn * qn) / (qd * qd);
    const ask = rng.pick(['q', 'p', 'het', 'hetCount', 'homDom'] as const);
    const pn = qd - qn;
    let stemQ: string;
    let answer: string;
    let accept: string[] = [];
    if (ask === 'q') {
      ({ answer, accept } = fractionWithDecimal(qn, qd));
      stemQ = 'what is the frequency of the recessive allele?';
    } else if (ask === 'p') {
      ({ answer, accept } = fractionWithDecimal(pn, qd));
      stemQ = 'what is the frequency of the dominant allele?';
    } else if (ask === 'het') {
      ({ answer, accept } = fractionWithDecimal(2 * pn * qn, qd * qd));
      stemQ = 'what fraction of the population is expected to be heterozygous?';
    } else if (ask === 'homDom') {
      ({ answer, accept } = fractionWithDecimal(pn * pn, qd * qd));
      stemQ = 'what fraction of the population is expected to be homozygous dominant?';
    } else {
      answer = commas((2 * pn * qn * N) / (qd * qd));
      stemQ = 'how many individuals in the population are expected to be heterozygous?';
    }
    return {
      stem: `The bar graph shows how many individuals in a population show the dominant and the recessive phenotype of a trait controlled by one gene with two alleles. Assuming Hardy–Weinberg equilibrium, ${stemQ}`,
      format: 'short_answer',
      answer,
      accept,
      svg: barChart(
        [
          { label: ['Dominant', `phenotype (${A}_)`], value: N - recessive },
          { label: ['Recessive', `phenotype (${a}${a})`], value: recessive },
        ],
        'Number of individuals',
      ),
      alt: `A bar graph with two bars: ${commas(N - recessive)} individuals with the dominant phenotype and ${commas(recessive)} with the recessive phenotype (${a}${a}).`,
      topic: 'biology.genetics',
    };
  },
};

/* ---------------- transcription ---------------- */

const PAIR: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G' };

/** The mRNA (5′ → 3′) transcribed from a template strand written 5′ → 3′. */
export function mrnaFromTemplate(template5to3: string): string {
  return [...template5to3]
    .reverse()
    .map((b) => (PAIR[b] === 'T' ? 'U' : PAIR[b]!))
    .join('');
}

const transcription: VisualTemplate = {
  id: 'biology-transcription',
  subject: 'biology',
  title: 'Transcribing a DNA template',
  description:
    'A DNA template strand (alone, or paired with its coding strand) with its 5′ and 3′ ends labeled, drawn in either direction; asks for the mRNA transcribed from it, written 5′ to 3′.',
  make(rng) {
    const len = 9;
    let mrna: string;
    do mrna = Array.from({ length: len }, () => rng.pick(['A', 'U', 'G', 'C'])).join('');
    while ([...mrna].filter((b) => b === 'U').length < 2 || new Set(mrna).size < 4);
    const coding = mrna.replace(/U/g, 'T'); // 5′ → 3′
    const template = [...coding].reverse().map((b) => PAIR[b]!).join(''); // 5′ → 3′
    const double = rng.chance(0.5);
    // How the strands are drawn left to right.
    const templateLeft5 = rng.chance(0.5);
    const templateShown = templateLeft5 ? template : [...template].reverse().join('');
    const codingShown = [...templateShown].map((b) => PAIR[b]!).join('');
    const templateOnTop = !double || rng.chance(0.5);

    const box = 36;
    const x0 = (480 - len * box) / 2;
    const parts: string[] = [];
    const strand = (seq: string, y: number, left5: boolean, highlighted: boolean, name: string, nameAbove: boolean) => {
      [...seq].forEach((b, i) => {
        parts.push(rect(x0 + i * box, y, box, box, { stroke: highlighted ? ACCENT : INK, width: highlighted ? 2.4 : 1.4, fill: highlighted ? ACCENT : 'none', ...(highlighted ? { fillOpacity: 0.12 } : {}) }));
        parts.push(text(x0 + (i + 0.5) * box, y + box / 2, b, { anchor: 'middle', baseline: 'middle', size: 19, weight: 'bold', halo: false }));
      });
      parts.push(text(x0 - 12, y + box / 2, left5 ? '5′' : '3′', { anchor: 'end', baseline: 'middle', size: 18, weight: 'bold' }));
      parts.push(text(x0 + len * box + 12, y + box / 2, left5 ? '3′' : '5′', { anchor: 'start', baseline: 'middle', size: 18, weight: 'bold' }));
      parts.push(text(x0, nameAbove ? y - 12 : y + box + 24, name, { size: 15, weight: highlighted ? 'bold' : 'normal', fill: INK }));
    };
    let alt: string;
    const ends = (seq: string, left5: boolean) => `${left5 ? '5′' : '3′'}-${seq}-${left5 ? '3′' : '5′'}`;
    if (!double) {
      strand(templateShown, 104, templateLeft5, true, 'Template strand', true);
      alt = `One DNA strand, labeled template strand, reading left to right ${ends(templateShown, templateLeft5)}.`;
    } else {
      const yTop = 82;
      const yBottom = 152;
      const topSeq = templateOnTop ? templateShown : codingShown;
      const bottomSeq = templateOnTop ? codingShown : templateShown;
      const topLeft5 = templateOnTop ? templateLeft5 : !templateLeft5;
      for (let i = 0; i < len; i++) parts.push(line(x0 + (i + 0.5) * box, yTop + box, x0 + (i + 0.5) * box, yBottom, { width: 1.5, dash: '3 3' }));
      strand(topSeq, yTop, topLeft5, templateOnTop, templateOnTop ? 'Template strand' : 'Coding strand', true);
      strand(bottomSeq, yBottom, !topLeft5, !templateOnTop, templateOnTop ? 'Coding strand' : 'Template strand', false);
      alt = `Double-stranded DNA. Top strand (${templateOnTop ? 'template' : 'coding'} strand), left to right: ${ends(topSeq, topLeft5)}. Bottom strand (${templateOnTop ? 'coding' : 'template'} strand), left to right: ${ends(bottomSeq, !topLeft5)}.`;
    }
    return {
      stem: double
        ? 'The figure shows a segment of double-stranded DNA with its template strand labeled. What is the sequence of the mRNA transcribed from this segment, written from its 5′ end to its 3′ end?'
        : 'The figure shows a segment of a DNA template strand. What is the sequence of the mRNA transcribed from it, written from its 5′ end to its 3′ end?',
      format: 'short_answer',
      answer: mrna,
      accept: [`5′-${mrna}-3′`, `5'-${mrna}-3'`, `5' ${mrna} 3'`],
      svg: figure(480, 250, ...parts),
      alt,
      topic: 'biology.molecular-biotech',
    };
  },
};

/* ---------------- the cell cycle ---------------- */

const PHASE_NAMES = ['G1', 'S', 'G2', 'M'];

const cellCycle: VisualTemplate = {
  id: 'biology-cell-cycle',
  subject: 'biology',
  title: 'Cell cycle pie chart',
  description:
    'A pie chart of the phases of a cell cycle (G1, S, G2, M) labeled in hours or in percent; asks for the fraction of the cycle in a phase or in interphase, the hours in a phase, or the expected number of cells in a phase.',
  make(rng) {
    const percentMode = rng.chance(0.3);
    let hours: number[];
    let total: number;
    let percents: number[] = [];
    if (percentMode) {
      total = rng.pick([20, 40]);
      const stepPct = 5;
      for (;;) {
        const m = rng.pick([5, 10]);
        const g2 = rng.pick([10, 15, 20]);
        const s = rng.pick([25, 30, 35, 40]);
        const g1 = 100 - m - g2 - s;
        if (g1 >= 20) {
          percents = [g1, s, g2, m];
          break;
        }
      }
      hours = percents.map((p) => (p * total) / 100);
      void stepPct;
    } else {
      hours = [rng.int(5, 14), rng.int(5, 9), rng.int(2, 5), rng.int(1, 2)];
      total = hours.reduce((a, b) => a + b, 0);
    }

    let stem: string;
    let answer: string;
    if (percentMode) {
      const i = rng.int(0, 3);
      answer = String(hours[i]);
      stem = `The pie chart shows the percentage of the cell cycle spent in each phase for a cell type whose cycle lasts ${total} hours. How many hours does the cell spend in ${PHASE_NAMES[i] === 'M' ? 'the M phase' : `${PHASE_NAMES[i]}`}?`;
    } else {
      const kind = rng.pick(['fraction', 'interphase', 'cells'] as const);
      if (kind === 'interphase') {
        answer = fractionText(total - hours[3]!, total);
        stem = 'The pie chart shows how many hours a dividing cell spends in each phase of its cell cycle. What fraction of the cycle does the cell spend in interphase?';
      } else if (kind === 'fraction') {
        const i = rng.int(0, 3);
        answer = fractionText(hours[i]!, total);
        stem = `The pie chart shows how many hours a dividing cell spends in each phase of its cell cycle. What fraction of the cycle does the cell spend in ${i === 3 ? 'the M phase' : i === 1 ? 'the S phase' : PHASE_NAMES[i]}?`;
      } else {
        const i = rng.int(0, 3);
        const unit = total / gcd(total, hours[i]!);
        const mult = Math.max(1, Math.ceil(200 / unit));
        const n = unit * (mult + rng.int(0, 3) * Math.max(1, Math.round(100 / unit)));
        answer = commas((n * hours[i]!) / total);
        stem = `The pie chart shows how many hours the cells of a culture spend in each phase of their cell cycle. If ${commas(n)} cells in the culture are dividing out of step with one another, how many would you expect to be in ${i === 3 ? 'the M phase' : i === 1 ? 'the S phase' : PHASE_NAMES[i]} at any moment?`;
      }
    }

    // The pie: clockwise from the top, G1, S, G2, M.
    const cx = 240;
    const cy = 172;
    const r = 112;
    const shades = [0.08, 0.2, 0.34, 0.55];
    const parts: string[] = [];
    let start = -90;
    const labels: Array<{ side: 1 | -1; y: number; ax: number; ay: number; text: string }> = [];
    hours.forEach((h, i) => {
      const sweep = (360 * h) / total;
      const end = start + sweep;
      const p = (deg: number): [number, number] => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
      const [sx, sy] = p(start);
      const [ex, ey] = p(end);
      parts.push(path(`M ${num(cx)} ${num(cy)} L ${num(sx)} ${num(sy)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${num(ex)} ${num(ey)} Z`, { stroke: INK, width: 1.5, fill: INK, fillOpacity: shades[i] }));
      const mid = start + sweep / 2;
      const [ax, ay] = p(mid);
      labels.push({ side: ax >= cx ? 1 : -1, y: ay, ax, ay, text: `${PHASE_NAMES[i]}: ${percentMode ? `${percents[i]}%` : `${h} h`}` });
      start = end;
    });
    // Labels sit beside the pie on leader lines, pushed apart vertically when they would overlap.
    for (const sideSign of [1, -1] as const) {
      const group = labels.filter((l) => l.side === sideSign).sort((a, b) => a.y - b.y);
      for (let i = 1; i < group.length; i++) group[i]!.y = Math.max(group[i]!.y, group[i - 1]!.y + 24);
      for (let i = group.length - 2; i >= 0; i--) group[i]!.y = Math.min(group[i]!.y, group[i + 1]!.y - 24);
      for (const l of group) {
        const lx = cx + sideSign * (r + 26);
        parts.push(line(l.ax, l.ay, cx + sideSign * (r + 10), l.y, { width: 1.2 }));
        parts.push(line(cx + sideSign * (r + 10), l.y, lx - sideSign * 4, l.y, { width: 1.2 }));
        parts.push(text(lx, l.y, l.text, { anchor: sideSign === 1 ? 'start' : 'end', baseline: 'middle', size: 16 }));
      }
    }
    const altPhases = PHASE_NAMES.map((n, i) => `${n} ${percentMode ? `${percents[i]} percent` : `${hours[i]} hours`}`).join(', ');
    return {
      stem,
      format: 'short_answer',
      answer,
      svg: figure(480, 344, ...parts),
      alt: `A pie chart of the cell cycle, going clockwise from the top: ${altPhases}.`,
      topic: 'biology.cells-membranes',
    };
  },
};

export const BIOLOGY_TEMPLATES: VisualTemplate[] = [dihybridPunnett, foodWeb, alleleFrequency, transcription, cellCycle];

// Keep the import list honest for helpers used only in some templates.
void circle;
void multipleChoice;
