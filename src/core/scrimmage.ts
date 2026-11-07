/**
 * Scrimmage packets: a round of toss-up/bonus pairs that nobody in the room has heard, balanced across the
 * six subjects like a DOE round, aimed at a level of the difficulty ladder, and built for a format:
 *
 * - regional: a DOE regional round (two 8-minute halves);
 * - finals: a Finals round (two 10-minute halves), so more questions get read;
 * - finals-visual: a Finals visual bonus round (two 12-minute halves): some bonuses are replaced by visual
 *   bonuses in the same subject, spread through the round;
 * - tiebreak: toss-ups only, played 5 at a time (Rule 6-4).
 *
 * Pairs otherwise stay as printed (a toss-up with its own bonus). Questions come from a few set files where
 * possible, so a laptop downloads little before practice.
 */
import { partnerId, setIdOf } from './drill';
import { rowLevel } from './levels';
import { ROUND_TOSSUPS } from './lineup';
import { CORE_SUBJECTS, type CatalogRow, type CoreSubject, type DifficultyLevel, type ScrimmageFormat, type Subject } from './schema';

export type ScrimmageLevel = DifficultyLevel | 'any';

export const LEVEL_TEXT: Record<ScrimmageLevel, string> = {
  early: 'Early regional (DOE rounds 1–10)',
  late: 'Late regional (DOE rounds 11–17, harder)',
  invitational: 'Invitational (your uploaded invitational packets)',
  nationals: 'Nationals-level (your uploaded nationals-level packets)',
  any: 'Any level (DOE library)',
};

export const FORMATS: Record<ScrimmageFormat, { label: string; hint: string; size: number; presetId: string }> = {
  regional: { label: 'Regional round', hint: 'Two 8-minute halves, as at regionals.', size: 25, presetId: 'doe-regional-2027' },
  finals: { label: 'Finals round', hint: 'Two 10-minute halves: Finals round robin and double elimination rounds.', size: 30, presetId: 'doe-finals-2027' },
  'finals-visual': {
    label: 'Finals visual bonus round',
    hint: 'Two 12-minute halves; visual bonuses show a figure and allow 30 seconds.',
    size: 30,
    presetId: 'doe-finals-visual-2027',
  },
  tiebreak: { label: 'Tiebreaker drill', hint: 'Toss-ups only, played 5 at a time with no bonuses and no clock (Rule 6-4).', size: 10, presetId: 'doe-regional-2027' },
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
  format?: ScrimmageFormat;
  /** Levels of the team's uploaded sets (by set id); DOE rows use their round number. */
  teamLevels?: ReadonlyMap<string, DifficultyLevel>;
  /** Finals visual rounds: the share of bonuses to make visual (0–1, default one half). */
  visualShare?: number;
  /** Finals visual rounds: a visual bonus id for a subject, or null when there is none to give. */
  pickVisual?: (subject: CoreSubject) => string | null;
}

export interface ScrimmagePair {
  tossupId: string;
  bonusId?: string;
  subject: CoreSubject;
  /** The bonus is a visual bonus that replaced the printed one. */
  visual?: boolean;
}

export interface ScrimmageResult {
  pairs: ScrimmagePair[];
  /** Pairs that had to include questions someone has heard, because fresh ones ran out. */
  heardPairs: number;
  sets: string[];
  /** Visual bonuses in the packet. */
  visualBonuses: number;
}

/** Which of `n` positions get one of `k` items, spread evenly (e.g. every other one for k = n / 2). */
export function spread(n: number, k: number): number[] {
  const out: number[] = [];
  if (k <= 0 || n <= 0) return out;
  const m = Math.min(k, n);
  for (let i = 0; i < n; i++) if (Math.floor(((i + 1) * m) / n) > Math.floor((i * m) / n)) out.push(i);
  return out;
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
    if (r[3] !== 't' || !isCore(r[1]) || (opts.level !== 'any' && rowLevel(r, opts.teamLevels) !== opts.level)) continue;
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

  const out: ScrimmagePair[] = pairs.map(({ tossupId, bonusId, subject }) =>
    opts.format === 'tiebreak' ? { tossupId, subject } : { tossupId, bonusId, subject },
  );
  // A Finals visual round: swap a share of the bonuses, spread through the round, for visual bonuses.
  let visualBonuses = 0;
  if (opts.format === 'finals-visual' && opts.pickVisual) {
    for (const i of spread(out.length, Math.round(out.length * (opts.visualShare ?? 0.5)))) {
      const id = opts.pickVisual(out[i]!.subject);
      if (!id) continue;
      out[i] = { ...out[i]!, bonusId: id, visual: true };
      visualBonuses += 1;
    }
  }
  return {
    pairs: out,
    heardPairs: pairs.filter((p) => !p.fresh).length,
    sets: [...new Set(pairs.map((p) => p.setId))],
    visualBonuses,
  };
}
