/**
 * Lineups: how many points a group of four is likely to score in a regional round, and which four
 * cover the subjects best.
 *
 * The model is deliberately simple and stated on the page:
 * - A regional round reads about 20 toss-ups, split across the six subjects as in DOE's recent sets.
 * - For each subject, the team "knows" a toss-up if any starter does. Knowledge overlaps (a question
 *   one player finds hard is often hard for all), so the strongest player counts fully and each other
 *   starter at half strength: 1 − (1 − p_best) · Π(1 − p_other / 2). Each p is the player's chance on
 *   a typical regional toss-up in that subject (from the mastery model, blended with a cautious prior
 *   while there are few answers).
 * - The opponent knows it with a fixed chance; when both teams know it, the faster team wins, from
 *   the players' median buzz times.
 * - A won toss-up is worth 4 points plus a bonus worth 10, converted if anyone on the team knows it
 *   (conferring is allowed), at bonus difficulty.
 * It ignores rebounds, interrupts and the clock, so the numbers are for comparing lineups, not for
 * predicting scores.
 */
import { CORE_SUBJECTS, type CoreSubject } from './schema';

/** Toss-ups per subject in a round where about 20 are read (DOE sets 10–17: 3.8 per subject, 3.0 Energy). */
export const ROUND_TOSSUPS: Record<CoreSubject, number> = {
  biology: 3.45,
  chemistry: 3.45,
  earth_space: 3.45,
  energy: 2.75,
  math: 3.45,
  physics: 3.45,
};

export const TOSSUP_POINTS = 4;
export const BONUS_POINTS = 10;
/** Conferring is not perfect: the team converts a bonus somewhat less often than "anyone knows it". */
const CONFERRING = 0.9;
/** How much a starter other than the subject's strongest adds (knowledge overlaps between players). */
const OVERLAP = 0.5;
/** A buzz this much faster (ms) turns a race into roughly 73–27. */
const RACE_SCALE_MS = 600;
/** Buzz time assumed for a player without buzz data. */
export const DEFAULT_BUZZ_MS = 2_000;

export interface Opponent {
  label: string;
  /** Chance the opponent knows a toss-up. */
  know: number;
  /** Their typical buzz time after the question ends. */
  buzzMs: number;
}

export const OPPONENTS: Record<'average' | 'strong', Opponent> = {
  average: { label: 'an average regional team', know: 0.45, buzzMs: 2_000 },
  strong: { label: 'a strong regional team', know: 0.65, buzzMs: 1_400 },
};

export interface PlayerProfile {
  playerId: string;
  /** Chance of knowing a typical regional toss-up, per subject. */
  tossup: Record<CoreSubject, number>;
  /** Chance of knowing a typical bonus, per subject. */
  bonus: Record<CoreSubject, number>;
  /** Median buzz time on correct toss-ups (ms after the reading ends), or null without data. */
  buzzMs: number | null;
  /** Answers behind each subject's estimate. */
  answers: Record<CoreSubject, number>;
}

export interface SubjectEstimate {
  subject: CoreSubject;
  /** The starter most likely to know it, and their chance. */
  coveredBy: string | null;
  best: number;
  /** Chance someone on the team knows a toss-up. */
  know: number;
  /** Chance the team wins the toss-up against the opponent. */
  win: number;
  /** Expected points per round from this subject, toss-ups and bonuses. */
  points: number;
  /** True when the best starter's estimate rests on fewer than 10 answers. */
  uncertain: boolean;
}

export interface LineupEstimate {
  playerIds: string[];
  points: number;
  tossupPoints: number;
  bonusPoints: number;
  subjects: SubjectEstimate[];
  /** The subject with the lowest chance of winning a toss-up. */
  weakest: CoreSubject;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function estimateLineup(players: PlayerProfile[], opponent: Opponent = OPPONENTS.average): LineupEstimate {
  const subjects: SubjectEstimate[] = CORE_SUBJECTS.map((subject) => {
    let best = 0;
    let coveredBy: string | null = null;
    let weight = 0;
    let buzz = 0;
    for (const p of players) {
      const t = p.tossup[subject];
      if (t > best) {
        best = t;
        coveredBy = p.playerId;
      }
      // Players who know more of the subject answer more of its toss-ups, so their speed counts more.
      weight += t;
      buzz += t * (p.buzzMs ?? DEFAULT_BUZZ_MS);
    }
    const lead = players.find((p) => p.playerId === coveredBy);
    let missAll = 1 - best;
    let missBonus = 1 - (lead?.bonus[subject] ?? 0);
    for (const p of players) {
      if (p === lead) continue;
      missAll *= 1 - OVERLAP * p.tossup[subject];
      missBonus *= 1 - OVERLAP * p.bonus[subject];
    }
    const know = 1 - missAll;
    const ourBuzz = weight > 0 ? buzz / weight : DEFAULT_BUZZ_MS;
    const race = sigmoid((opponent.buzzMs - ourBuzz) / RACE_SCALE_MS);
    const win = know * (1 - opponent.know) + know * opponent.know * race;
    const bonusRate = CONFERRING * (1 - missBonus);
    const n = ROUND_TOSSUPS[subject];
    const points = n * win * (TOSSUP_POINTS + BONUS_POINTS * bonusRate);
    const coverer = players.find((p) => p.playerId === coveredBy);
    return { subject, coveredBy, best, know, win, points, uncertain: !coverer || coverer.answers[subject] < 10 };
  });
  const tossupPoints = subjects.reduce((s, x) => s + ROUND_TOSSUPS[x.subject] * x.win * TOSSUP_POINTS, 0);
  const points = subjects.reduce((s, x) => s + x.points, 0);
  const weakest = [...subjects].sort((a, b) => a.win - b.win)[0].subject;
  return { playerIds: players.map((p) => p.playerId), points, tossupPoints, bonusPoints: points - tossupPoints, subjects, weakest };
}

function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, chosen: T[]) => {
    if (chosen.length === k) {
      out.push([...chosen]);
      return;
    }
    for (let i = start; i <= items.length - (k - chosen.length); i++) {
      chosen.push(items[i]);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return out;
}

/** The best lineups of `size` from the pool, best first. Small rosters only (all combinations are tried). */
export function suggestLineups(pool: PlayerProfile[], opponent: Opponent = OPPONENTS.average, size = 4, top = 5): LineupEstimate[] {
  if (pool.length <= size) return [estimateLineup(pool, opponent)];
  return combinations(pool, size)
    .map((group) => estimateLineup(group, opponent))
    .sort((a, b) => b.points - a.points || a.playerIds.join().localeCompare(b.playerIds.join()))
    .slice(0, top);
}

/**
 * The best alternate for a lineup: the bench player whose best substitution (for any one starter)
 * keeps the most points, with that substitution.
 */
export function bestAlternate(
  starters: PlayerProfile[],
  bench: PlayerProfile[],
  opponent: Opponent = OPPONENTS.average,
): { playerId: string; replaces: string; points: number } | null {
  let best: { playerId: string; replaces: string; points: number } | null = null;
  for (const b of bench) {
    for (const s of starters) {
      const points = estimateLineup([...starters.filter((x) => x !== s), b], opponent).points;
      if (!best || points > best.points) best = { playerId: b.playerId, replaces: s.playerId, points };
    }
  }
  return best;
}

/**
 * Blend a model estimate with a cautious prior while there are few answers: a player knows about one
 * regional toss-up in seven outside their subjects, and well under half in their own.
 */
export function cautiousChance(modelP: number | undefined, answers: number, ownSubject: 'primary' | 'secondary' | null): number {
  const prior = ownSubject === 'primary' ? 0.4 : ownSubject === 'secondary' ? 0.3 : 0.15;
  const k = 8;
  if (modelP === undefined || answers === 0) return prior;
  return (answers * modelP + k * prior) / (answers + k);
}
