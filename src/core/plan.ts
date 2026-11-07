/**
 * The daily plan on the Today page: a short queue sized to the time a player has, in this order:
 *
 * 1. due reviews, capped at a third of the time so they never swamp the session;
 * 2. a targeted drill on a high-frequency topic in the player's primary subject where they are weak;
 * 3. a drill in their secondary subject;
 * 4. a short mixed round for breadth (a larger share as a competition gets close).
 *
 * Every item carries a "why this?" line. The plan is a pure function of its inputs, with a
 * random choice seeded by player and day, so the same morning gives the same plan.
 */
import type { PlayerModel } from './mastery';
import { practiceDay, seasonPhase, daysUntil, type SeasonPhase } from './review';
import { CORE_SUBJECTS, SUBJECT_LABELS, type CoreSubject, type Player } from './schema';
import { topicsForSubject } from './taxonomy';

export type PlanItemKind = 'review' | 'learn' | 'drill' | 'mixed';

export interface PlanItem {
  /** "review", "drill-primary", "drill-secondary", "drill-focus" or "mixed". */
  id: string;
  kind: PlanItemKind;
  title: string;
  why: string;
  minutes: number;
  /** Reviews: the most cards to review today. */
  cards?: number;
  /** Drills: subject and (when the library is tagged) topic. */
  subject?: CoreSubject;
  topic?: string;
  /** Learn: the concept card to read. */
  conceptId?: string;
  /** Drills and mixed rounds: number of questions. */
  count?: number;
  done: boolean;
}

export interface DayPlan {
  playerId: string;
  /** Practice day, "YYYY-MM-DD" (see practiceDay in review.ts). */
  day: string;
  minutes: number;
  phase: SeasonPhase;
  items: PlanItem[];
  createdAt: number;
}

export const PLAN_LENGTHS = [15, 30, 45] as const;
export const MINUTES_PER_REVIEW = 0.5;
export const MINUTES_PER_QUESTION = 1;
const MIN_DRILL = 4;

/**
 * Share of non-review time for drills and for mixed rounds. From the proposal's season table, with
 * the "learn and read" share going to topic drills until concept cards arrive.
 */
export const PHASE_MIX: Record<SeasonPhase, { drills: number; mixed: number }> = {
  off_season: { drills: 0.9, mixed: 0.1 },
  season: { drills: 0.8, mixed: 0.2 },
  final_weeks: { drills: 0.5, mixed: 0.5 },
};

export interface PlanInput {
  player: Pick<Player, 'id' | 'primarySubject' | 'secondarySubject'>;
  now: number;
  minutes: number;
  /** Review cards due today. */
  dueCount: number;
  nextEvent?: { name: string; date: string } | null;
  model?: PlayerModel;
  /** Library questions per topic id (catalog.json). Empty before the library is tagged. */
  topicCounts: Record<string, number>;
  /** Questions per topic id the player has not heard yet; topics without enough are skipped. */
  freshCounts?: Record<string, number>;
  /** Concept cards the team has written that the player has not read yet. */
  learnable?: Array<{ conceptId: string; name: string; topicId: string; subject: CoreSubject; questions: number }>;
}

export const MINUTES_PER_CARD = 3;

/** A small seeded random generator (mulberry32 over a string hash). */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

interface TopicChoice {
  topic?: string;
  why: string;
}

/** Frequency times weakness, choosing among the best few with the day's seed. */
export function chooseTopic(subject: CoreSubject, count: number, input: PlanInput, random: () => number): TopicChoice {
  const label = SUBJECT_LABELS[subject];
  const topics = topicsForSubject(subject);
  const total = topics.reduce((s, t) => s + (input.topicCounts[t.id] ?? 0), 0);
  if (total === 0) return { why: `Practice across ${label}` };
  const subjectLine = input.model?.subjects[subject];
  const scored = topics
    .map((t) => {
      const freq = input.topicCounts[t.id] ?? 0;
      const fresh = input.freshCounts?.[t.id] ?? freq;
      const line = input.model?.topics[t.id];
      const p = line?.p ?? subjectLine?.p ?? 0.5;
      // Square root keeps the biggest topics from crowding out everything else.
      return { t, freq, fresh, line, p, score: Math.sqrt(freq / total) * (1 - p) };
    })
    .filter((x) => x.freq >= count && x.fresh >= Math.min(count, MIN_DRILL))
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { why: `Practice across ${label}` };
  // Mostly the best topic, with close runners-up taking turns from day to day.
  const top = scored.slice(0, 4);
  const weights = top.map((x) => x.score ** 3);
  const sum = weights.reduce((s, w) => s + w, 0);
  let r = random() * sum;
  let pick = top[0];
  for (const [i, x] of top.entries()) {
    r -= weights[i];
    if (r <= 0) {
      pick = x;
      break;
    }
  }
  const share = Math.max(1, Math.round((pick.freq / total) * 100));
  let why: string;
  if (!pick.line || pick.line.n < 3) why = `A common ${label} topic (${share}% of its questions) you haven't practiced much yet`;
  else if (pick.p < 0.6) why = `A high-frequency ${label} topic (${share}% of its questions) you haven't mastered: about ${pct(pick.p)} on a typical toss-up`;
  else why = `One of the most common ${label} topics (${share}% of its questions); keep it sharp`;
  return { topic: pick.t.id, why };
}

/** The subject a player without assigned subjects should drill: their weakest, or the least practiced. */
function focusSubject(model: PlayerModel | undefined, random: () => number): CoreSubject {
  const lines = CORE_SUBJECTS.map((s) => ({ s, line: model?.subjects[s] }));
  const unpracticed = lines.filter((x) => !x.line || x.line.n < 5);
  if (unpracticed.length > 0) return unpracticed[Math.floor(random() * unpracticed.length)].s;
  return lines.sort((a, b) => a.line!.p - b.line!.p)[0].s;
}

export function buildPlan(input: PlanInput): DayPlan {
  const { player, now, minutes } = input;
  const phase = seasonPhase(now, input.nextEvent?.date);
  const day = practiceDay(now);
  const random = seededRandom(`${player.id}|${day}`);
  const items: PlanItem[] = [];

  // 1. Reviews, at most a third of the time.
  const cap = Math.max(1, Math.floor(minutes / 3 / MINUTES_PER_REVIEW));
  const cards = Math.min(input.dueCount, cap);
  items.push({
    id: 'review',
    kind: 'review',
    title: cards > 0 ? `Review ${cards} question${cards === 1 ? '' : 's'}` : 'Review',
    why:
      input.dueCount === 0
        ? 'Nothing due today. Questions you miss or answer slowly come back here on a schedule.'
        : input.dueCount > cards
          ? `Due reviews (${input.dueCount} waiting; the rest move to tomorrow so reviews don't take over)`
          : 'Due reviews: questions you missed or answered slowly, back before you forget them',
    minutes: cards * MINUTES_PER_REVIEW,
    cards,
    done: false,
  });

  // 2. New concepts from the player's own subjects (more in the off-season), by frequency times weakness.
  const own = [player.primarySubject, player.secondarySubject].filter(Boolean) as CoreSubject[];
  const wanted = phase === 'off_season' ? 2 : 1;
  const learn = (input.learnable ?? [])
    .filter((c) => own.includes(c.subject))
    .map((c) => {
      const p = input.model?.topics[c.topicId]?.p ?? input.model?.subjects[c.subject]?.p ?? 0.5;
      return { c, p, score: Math.sqrt(c.questions) * (1 - p) * (c.subject === player.primarySubject ? 1.5 : 1) + random() * 0.01 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, minutes >= 20 ? wanted : 0);
  for (const [i, { c, p }] of learn.entries()) {
    items.push({
      id: `learn-${i + 1}`,
      kind: 'learn',
      title: `Read: ${c.name}`,
      why: `A ${SUBJECT_LABELS[c.subject]} concept card you haven't read; ${c.questions} library questions test it${p < 0.6 ? `, and you are at about ${pct(p)} on its topic` : ''}.`,
      minutes: MINUTES_PER_CARD,
      subject: c.subject,
      topic: c.topicId,
      conceptId: c.conceptId,
      done: false,
    });
  }

  // 3–4. Drills, then 5. a mixed round.
  const rest = Math.max(0, minutes - cards * MINUTES_PER_REVIEW - learn.length * MINUTES_PER_CARD);
  const mixedMinutes = Math.min(rest, Math.max(minutes >= 20 ? 5 : 3, Math.round(rest * PHASE_MIX[phase].mixed)));
  const drillMinutes = rest - mixedMinutes;

  const primary = player.primarySubject;
  const secondary = player.secondarySubject && player.secondarySubject !== primary ? player.secondarySubject : undefined;
  const drills: Array<{ id: string; subject: CoreSubject; minutes: number; role: string }> = [];
  if (primary) {
    const split = secondary && drillMinutes >= 2 * MIN_DRILL * MINUTES_PER_QUESTION;
    drills.push({ id: 'drill-primary', subject: primary, minutes: split ? Math.round((drillMinutes * 2) / 3) : drillMinutes, role: 'Your primary subject' });
    if (split) drills.push({ id: 'drill-secondary', subject: secondary!, minutes: drillMinutes - Math.round((drillMinutes * 2) / 3), role: 'Your secondary subject' });
  } else if (drillMinutes > 0) {
    const subject = focusSubject(input.model, random);
    drills.push({ id: 'drill-focus', subject, minutes: drillMinutes, role: 'No subject assigned yet, so a weak spot' });
  }
  for (const d of drills) {
    const count = Math.max(MIN_DRILL, Math.round(d.minutes / MINUTES_PER_QUESTION));
    const choice = chooseTopic(d.subject, count, input, random);
    items.push({
      id: d.id,
      kind: 'drill',
      title: `${SUBJECT_LABELS[d.subject]} drill`,
      why: `${d.role}. ${choice.why}.`,
      minutes: count * MINUTES_PER_QUESTION,
      subject: d.subject,
      topic: choice.topic,
      count,
      done: false,
    });
  }

  if (mixedMinutes > 0) {
    const count = Math.max(3, Math.round(mixedMinutes / MINUTES_PER_QUESTION));
    const days = daysUntil(input.nextEvent?.date, now);
    items.push({
      id: 'mixed',
      kind: 'mixed',
      title: `Mixed round: ${count} toss-ups`,
      why:
        phase === 'final_weeks' && days !== null
          ? `${input.nextEvent!.name || 'Your competition'} is ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}: timed mixed play, like the real thing`
          : 'Breadth: rebounds and easy toss-ups in any subject are still points',
      minutes: count * MINUTES_PER_QUESTION,
      count,
      done: false,
    });
  }

  return { playerId: player.id, day, minutes, phase, items, createdAt: now };
}

/** Rebuild a plan with a new length, keeping what is already done. */
export function resizePlan(old: DayPlan, input: PlanInput): DayPlan {
  const next = buildPlan(input);
  const done = new Map(old.items.map((i) => [i.id, i]));
  next.items = next.items.map((i) => {
    const prev = done.get(i.id);
    return prev?.done ? { ...prev } : i;
  });
  return next;
}
