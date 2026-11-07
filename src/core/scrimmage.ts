/**
 * Scrimmage packets: a round of toss-up/bonus pairs from the library that nobody in the room has
 * heard, balanced across the six subjects like a DOE round and aimed at a difficulty level.
 *
 * Pairs stay as DOE printed them (a toss-up with its own bonus). Questions come from a few set files
 * where possible, so a laptop downloads little before practice.
 */
import { partnerId, setIdOf } from './drill';
import { ROUND_TOSSUPS } from './lineup';
import { CORE_SUBJECTS, type CatalogRow, type CoreSubject, type Subject } from './schema';

export type ScrimmageLevel = 'early' | 'late' | 'any';

export const LEVEL_TEXT: Record<ScrimmageLevel, string> = {
  early: 'Early regional (rounds 1–10)',
  late: 'Late regional (rounds 11–17, harder)',
  any: 'Any round',
};

export interface ScrimmageOptions {
  /** Toss-up/bonus pairs in the packet. */
  size: number;
  level: ScrimmageLevel;
  /** Question ids any player in the room has heard. */
  heard: ReadonlySet<string>;
  random?: () => number;
  /** Most set files to draw from before reaching wider. */
  maxSets?: number;
}

export interface ScrimmagePair {
  tossupId: string;
  bonusId?: string;
  subject: CoreSubject;
}

export interface ScrimmageResult {
  pairs: ScrimmagePair[];
  /** Pairs that had to include questions someone has heard, because fresh ones ran out. */
  heardPairs: number;
  sets: string[];
}

function levelMatches(round: number, level: ScrimmageLevel): boolean {
  if (level === 'early') return round <= 10;
  if (level === 'late') return round >= 11;
  return true;
}

/** Pairs per subject for a packet of `size`, in DOE's proportions (Energy a little less). */
export function subjectQuotas(size: number): Record<CoreSubject, number> {
  const total = CORE_SUBJECTS.reduce((s, x) => s + ROUND_TOSSUPS[x], 0);
  const exact = CORE_SUBJECTS.map((s) => ({ s, x: (size * ROUND_TOSSUPS[s]) / total }));
  const quotas = Object.fromEntries(exact.map(({ s, x }) => [s, Math.floor(x)])) as Record<CoreSubject, number>;
  let left = size - Object.values(quotas).reduce((a, b) => a + b, 0);
  for (const { s } of [...exact].sort((a, b) => (b.x % 1) - (a.x % 1))) {
    if (left <= 0) break;
    quotas[s] += 1;
    left -= 1;
  }
  return quotas;
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildScrimmage(rows: CatalogRow[], opts: ScrimmageOptions): ScrimmageResult {
  const random = opts.random ?? Math.random;
  const maxSets = opts.maxSets ?? 4;
  const bonusIds = new Set(rows.filter((r) => r[3] === 'b').map((r) => r[0]));
  const isCore = (s: Subject): s is CoreSubject => (CORE_SUBJECTS as Subject[]).includes(s);

  interface Candidate extends ScrimmagePair {
    setId: string;
    fresh: boolean;
  }
  const all: Candidate[] = [];
  for (const r of rows) {
    if (r[3] !== 't' || !isCore(r[1]) || !levelMatches(r[4], opts.level)) continue;
    const bonus = partnerId(r[0]);
    const bonusId = bonusIds.has(bonus) ? bonus : undefined;
    const fresh = !opts.heard.has(r[0]) && !(bonusId && opts.heard.has(bonusId));
    all.push({ tossupId: r[0], bonusId, subject: r[1], setId: setIdOf(r[0]), fresh });
  }

  const quotas = subjectQuotas(opts.size);
  // Sets with the most fresh pairs first (random among equals), until each subject has room to choose.
  const freshBySet = new Map<string, Candidate[]>();
  for (const c of all) if (c.fresh) freshBySet.set(c.setId, [...(freshBySet.get(c.setId) ?? []), c]);
  const setOrder = shuffle([...freshBySet.keys()], random).sort((a, b) => freshBySet.get(b)!.length - freshBySet.get(a)!.length);
  const chosenSets: string[] = [];
  const enough = () => CORE_SUBJECTS.every((s) => chosenSets.reduce((n, id) => n + freshBySet.get(id)!.filter((c) => c.subject === s).length, 0) >= quotas[s] * 2);
  for (const id of setOrder) {
    if (chosenSets.length >= maxSets || enough()) break;
    chosenSets.push(id);
  }

  const used = new Set<string>();
  const picks = new Map<CoreSubject, Candidate[]>(CORE_SUBJECTS.map((s) => [s, []]));
  const take = (pool: Candidate[], subject: CoreSubject, n: number) => {
    for (const c of shuffle(pool, random)) {
      if (picks.get(subject)!.length >= n) break;
      if (c.subject !== subject || used.has(c.tossupId)) continue;
      used.add(c.tossupId);
      picks.get(subject)!.push(c);
    }
  };
  for (const s of CORE_SUBJECTS) {
    take(all.filter((c) => c.fresh && chosenSets.includes(c.setId)), s, quotas[s]);
    take(all.filter((c) => c.fresh), s, quotas[s]);
    take(all, s, quotas[s]);
  }
  // A subject that ran dry: fill the packet from the others.
  let short = opts.size - [...picks.values()].reduce((n, l) => n + l.length, 0);
  for (const s of CORE_SUBJECTS) {
    if (short <= 0) break;
    const before = picks.get(s)!.length;
    take(all, s, before + short);
    short -= picks.get(s)!.length - before;
  }

  // Rotate through the subjects in a shuffled order, as a DOE round does.
  const order = shuffle(CORE_SUBJECTS, random);
  const queues = order.map((s) => [...picks.get(s)!]);
  const pairs: Candidate[] = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) pairs.push(q.shift()!);

  return {
    pairs: pairs.map(({ tossupId, bonusId, subject }) => ({ tossupId, bonusId, subject })),
    heardPairs: pairs.filter((p) => !p.fresh).length,
    sets: [...new Set(pairs.map((p) => p.setId))],
  };
}
