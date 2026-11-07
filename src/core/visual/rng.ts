/**
 * A small seeded random number generator (mulberry32). Generated visual questions use only this,
 * so a question id (template + seed) always gives back the same figure, question and answer, on
 * every device and in every later version of the site.
 */
export interface Rng {
  /** A number in [0, 1). */
  next(): number;
  /** An integer in [min, max], both included. */
  int(min: number, max: number): number;
  /** One item of a list. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy of a list. */
  shuffle<T>(items: readonly T[]): T[];
  /** `n` different items of a list, in random order. */
  sample<T>(items: readonly T[], n: number): T[];
  /** True with probability p. */
  chance(p: number): boolean;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new Error(`rng.int(${min}, ${max}): bad range`);
    return min + Math.floor(next() * (max - min + 1));
  };
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };
  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('rng.pick: empty list');
      return items[Math.floor(next() * items.length)]!;
    },
    shuffle,
    sample: <T>(items: readonly T[], n: number): T[] => {
      if (n > items.length) throw new Error(`rng.sample: asked for ${n} of ${items.length}`);
      return shuffle(items).slice(0, n);
    },
    chance: (p: number) => next() < p,
  };
}

/** A fresh seed for a new question (a positive 31-bit integer). */
export function newSeed(random: () => number = Math.random): number {
  return 1 + Math.floor(random() * 2_147_483_646);
}
