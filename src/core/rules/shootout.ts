/**
 * The round robin shootout (2027 Rules 9-1 iii and 10-2 iii): when more than two teams are tied for
 * advancing places, each team, in a separate room, hears the same five toss-ups. Every question is read in
 * full and the usual 5 seconds are allowed to buzz. There are no interrupt penalties (and no reason to
 * interrupt). Scoring: +1 for a right answer, −1 for a wrong one, 0 for no answer, a blurt or audible
 * communication. Teams still tied go on: two teams play a 5 toss-up tiebreaker (Rule 6-4), three or more
 * another shootout.
 */

export type ShootoutMark = 'correct' | 'incorrect' | 'none';

export const SHOOTOUT_TOSSUPS = 5;

export const SHOOTOUT_POINTS: Record<ShootoutMark, number> = { correct: 1, incorrect: -1, none: 0 };

export function shootoutScore(marks: readonly ShootoutMark[]): number {
  return marks.reduce((sum, m) => sum + SHOOTOUT_POINTS[m], 0);
}

/** Teams by score, best first; teams with equal scores share a tier. */
export function shootoutTiers(scores: ReadonlyArray<{ id: string; score: number }>): Array<{ score: number; ids: string[] }> {
  const tiers = new Map<number, string[]>();
  for (const s of scores) tiers.set(s.score, [...(tiers.get(s.score) ?? []), s.id]);
  return [...tiers.entries()].sort((a, b) => b[0] - a[0]).map(([score, ids]) => ({ score, ids }));
}

export interface ShootoutOutcome {
  /** Teams that take an advancing place. */
  advance: string[];
  /** Teams that do not advance. */
  out: string[];
  /** Teams still tied for the remaining places. */
  stillTied: string[];
  /** Advancing places left for the teams still tied. */
  placesLeft: number;
  /** How the remaining tie is broken: a 5 toss-up tiebreaker match for two teams, a new shootout for more. */
  next: 'none' | 'tiebreaker' | 'shootout';
}

/** Who advances when `places` of the tied teams go through, after a shootout with these scores. */
export function shootoutOutcome(scores: ReadonlyArray<{ id: string; score: number }>, places: number): ShootoutOutcome {
  const out: ShootoutOutcome = { advance: [], out: [], stillTied: [], placesLeft: 0, next: 'none' };
  let remaining = Math.max(0, places);
  for (const tier of shootoutTiers(scores)) {
    if (remaining === 0) {
      out.out.push(...tier.ids);
    } else if (tier.ids.length <= remaining) {
      out.advance.push(...tier.ids);
      remaining -= tier.ids.length;
    } else {
      out.stillTied = [...tier.ids];
      out.placesLeft = remaining;
      out.next = tier.ids.length === 2 ? 'tiebreaker' : 'shootout';
      remaining = 0;
    }
  }
  return out;
}
