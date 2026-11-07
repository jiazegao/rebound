/**
 * Choosing questions for drills from the whole library, using the compact catalog
 * (public/data/doe/catalog.json) so nothing needs to be downloaded until the drill starts.
 *
 * - Fresh questions first: anything the player has heard is used only when nothing fresh is left.
 * - Targeted difficulty: questions the player should get right about 70–85% of the time come first.
 * - Few downloads: the questions come from a handful of sets (each set is one file).
 */
import { chance, questionDifficulty } from './mastery';
import { CORE_SUBJECTS, type CatalogRow, type CoreSubject, type Subject } from './schema';

export interface DrillRequest {
  /** One subject, or undefined for a mixed drill across the six subjects. */
  subject?: CoreSubject;
  /** Topic id within the subject. */
  topic?: string;
  /** Also use Energy questions whose underlying discipline is `subject`. */
  includeEnergyCross?: boolean;
  /** Number of questions to serve. */
  count: number;
  /** Allow bonuses on their own (when the bonus, not its toss-up, matches the topic). */
  allowBonusOnly?: boolean;
  /** questionId → when the player heard it. */
  seen?: Record<string, number>;
  /** The player's rating for a subject and topic (see mastery.ts), for difficulty targeting. */
  rating?: (subject: Subject, topic: string) => number;
  /** Most set files to load. */
  maxSets?: number;
  /** Random numbers in [0, 1); pass a seeded generator for repeatable picks. */
  random?: () => number;
}

export interface DrillPick {
  questionId: string;
  setId: string;
  /** A bonus served on its own, without its toss-up. */
  bonusOnly: boolean;
}

/** The set id in a question id: "doe-hs-17" in "doe-hs-17-r01-t01". */
export function setIdOf(questionId: string): string {
  return questionId.replace(/-r\d+[a-z]*-[tb]\d+$/i, '');
}

/** The toss-up that goes with a bonus id, and the other way round. */
export function partnerId(questionId: string): string {
  return questionId.replace(/-([tb])(\d+)$/, (_, k: string, n: string) => `-${k === 't' ? 'b' : 't'}${n}`);
}

/** Target chance of a correct answer for a drill question. */
export const TARGET_CHANCE = 0.775;

function matches(row: CatalogRow, req: DrillRequest): boolean {
  const [, subject, topic, , , cross] = row;
  if (req.topic) return topic === req.topic;
  if (!req.subject) return (CORE_SUBJECTS as Subject[]).includes(subject);
  if (subject === req.subject) return true;
  return !!req.includeEnergyCross && subject === 'energy' && cross === req.subject;
}

interface Candidate {
  row: CatalogRow;
  bonusOnly: boolean;
  setId: string;
  score: number;
}

/** Choose questions for a drill. Returns fewer than `count` only when the library has too few. */
export function pickDrill(rows: CatalogRow[], req: DrillRequest): DrillPick[] {
  const random = req.random ?? Math.random;
  const seen = req.seen ?? {};
  const maxSets = req.maxSets ?? 4;

  const tossupMatches = new Set<string>();
  for (const row of rows) if (row[3] === 't' && matches(row, req)) tossupMatches.add(row[0]);

  const candidates: Candidate[] = [];
  for (const row of rows) {
    if (!matches(row, req)) continue;
    const isBonus = row[3] === 'b';
    // A bonus whose toss-up also matches is served after that toss-up, not on its own.
    if (isBonus && (!req.allowBonusOnly || tossupMatches.has(partnerId(row[0])))) continue;
    const heardAt = seen[row[0]];
    const p = req.rating ? chance(req.rating(row[1], row[2]), questionDifficulty(isBonus ? 'bonus' : 'tossup', row[4])) : TARGET_CHANCE;
    // Lower is better: fresh before heard, then closeness to the target chance, with a little noise for variety.
    const score = (heardAt ? 10 + heardAt / 1e13 : 0) + Math.abs(p - TARGET_CHANCE) + random() * 0.08;
    candidates.push({ row, bonusOnly: isBonus, setId: setIdOf(row[0]), score });
  }
  if (candidates.length === 0) return [];

  // Bonuses on their own make up at most a third of a drill.
  const maxBonusOnly = Math.floor(req.count / 3);
  candidates.sort((a, b) => a.score - b.score);

  // Choose sets: repeatedly take the set whose best remaining candidates are best, until enough questions.
  const bySet = new Map<string, Candidate[]>();
  for (const c of candidates) bySet.set(c.setId, [...(bySet.get(c.setId) ?? []), c]);
  const setOrder = [...bySet.entries()]
    .map(([setId, list]) => {
      const top = list.slice(0, req.count);
      const avg = top.reduce((s, c) => s + c.score, 0) / top.length;
      // Prefer sets that can supply more of the drill.
      return { setId, rank: avg - Math.min(top.length, req.count) * 0.02 };
    })
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.setId);

  // Twice as many candidates as needed leaves room for variety.
  const chosenSets = new Set<string>();
  let available = 0;
  for (const setId of setOrder) {
    if (chosenSets.size >= maxSets || available >= req.count * 2) break;
    chosenSets.add(setId);
    available += bySet.get(setId)!.length;
  }
  let pool = candidates.filter((c) => chosenSets.has(c.setId));
  if (pool.length < req.count) pool = candidates;

  const picks: DrillPick[] = [];
  let bonusOnly = 0;
  for (const c of pool) {
    if (picks.length >= req.count) break;
    if (c.bonusOnly && bonusOnly >= maxBonusOnly) continue;
    if (c.bonusOnly) bonusOnly += 1;
    picks.push({ questionId: c.row[0], setId: c.setId, bonusOnly: c.bonusOnly });
  }

  // A mixed drill rotates through the subjects, as a real round does.
  if (!req.subject && !req.topic) return interleaveBySubject(picks, rows);
  return shuffle(picks, random);
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function interleaveBySubject(picks: DrillPick[], rows: CatalogRow[]): DrillPick[] {
  const subjectOf = new Map(rows.map((r) => [r[0], r[1]]));
  const queues = new Map<Subject, DrillPick[]>();
  for (const p of picks) {
    const s = subjectOf.get(p.questionId)!;
    queues.set(s, [...(queues.get(s) ?? []), p]);
  }
  const out: DrillPick[] = [];
  while (out.length < picks.length) {
    for (const q of queues.values()) {
      const next = q.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

/**
 * Pick a mixed set of toss-ups balanced across the six subjects (for the plan's mixed round),
 * from the two sets with the most questions the player has not heard.
 */
export function pickMixed(rows: CatalogRow[], req: Omit<DrillRequest, 'subject' | 'topic' | 'includeEnergyCross' | 'allowBonusOnly'>): DrillPick[] {
  const random = req.random ?? Math.random;
  const seen = req.seen ?? {};
  const fresh = new Map<string, number>();
  for (const row of rows) {
    if (row[3] !== 't' || seen[row[0]] || !(CORE_SUBJECTS as Subject[]).includes(row[1])) continue;
    const setId = setIdOf(row[0]);
    fresh.set(setId, (fresh.get(setId) ?? 0) + 1);
  }
  const sets = new Set(
    [...fresh.entries()]
      .map(([setId, n]) => ({ setId, rank: n + random() * 20 }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 2)
      .map((x) => x.setId),
  );
  const local = rows.filter((r) => sets.has(setIdOf(r[0])));
  const per = Math.floor(req.count / CORE_SUBJECTS.length);
  const extra = req.count - per * CORE_SUBJECTS.length;
  const lists = shuffle(CORE_SUBJECTS, random).map((subject, i) => {
    const want = per + (i < extra ? 1 : 0);
    if (want === 0) return [];
    const picks = pickDrill(local, { ...req, subject, count: want, maxSets: 2 });
    return picks.length >= want ? picks : pickDrill(rows, { ...req, subject, count: want, maxSets: 1 });
  });
  const out: DrillPick[] = [];
  for (let i = 0; lists.some((l) => l.length > i); i++) {
    for (const list of lists) if (list[i]) out.push(list[i]);
  }
  return out.slice(0, req.count);
}
