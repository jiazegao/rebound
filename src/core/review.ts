/**
 * Timed review of misses and slow answers ("Review" in the site; FSRS underneath).
 *
 * A question becomes a review card for a player when they miss it, give it away on an interrupt,
 * get it right too slowly, or (for a subject owner) when nobody in a practice game could answer it.
 * The scheduler is FSRS (ts-fsrs, the algorithm Anki uses), working in whole days: a miss comes
 * back the next day, then after a few days, then weeks. Each review is timed, and the time decides
 * the grade, because a correct answer that would have lost the buzzer race is not yet learned.
 *
 * Everything here is pure: functions take cards and return new cards, so the store, the tests
 * and a future server can share them.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type FSRS, type Grade } from 'ts-fsrs';
import type { QuestionKind, Subject } from './schema';

export { Rating, State };
export type { Grade };

const DAY_MS = 24 * 60 * 60 * 1000;

/** A correct toss-up answer this long (or longer) after the reading ended counts as slow. */
export const SLOW_TOSSUP_MS = 3_000;

/** Why a card exists, shown to the player as the card's "why this?" note. */
export type CardReason = 'missed' | 'interrupt' | 'slow' | 'dead' | 'bonus' | 'manual';

export const REASON_TEXT: Record<CardReason, string> = {
  missed: 'You missed it',
  interrupt: 'Wrong interrupt',
  slow: 'Right, but slow to buzz',
  dead: 'Nobody got it, and it is in your subject',
  bonus: 'Your team missed this bonus',
  manual: 'You added it',
};

/** FSRS state with plain numbers instead of Dates, so it survives JSON and IndexedDB unchanged. */
export interface FsrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: State;
  lastReview: number | null;
}

/** One time the card was graded: in a review session, or by hearing the question again in practice. */
export interface CardEvent {
  t: number;
  grade: Grade;
  via: 'review' | 'practice' | 'game';
  correct: boolean;
  /** Buzz time in a review (from when the question appeared), or buzz latency in practice. */
  ms: number | null;
}

export interface ReviewCard {
  /** `${playerId}:${questionId}` */
  id: string;
  playerId: string;
  questionId: string;
  subject: Subject;
  kind: QuestionKind;
  reason: CardReason;
  createdAt: number;
  /** Keys of the practice answers and game entries already counted, so nothing is counted twice. */
  sources: string[];
  fsrs: FsrsState;
  log: CardEvent[];
}

export function cardId(playerId: string, questionId: string): string {
  return `${playerId}:${questionId}`;
}

/* ---------------- season and retention ---------------- */

export type SeasonPhase = 'off_season' | 'season' | 'final_weeks';

export const PHASE_TEXT: Record<SeasonPhase, string> = {
  off_season: 'Off-season (May to September)',
  season: 'Competition season',
  final_weeks: 'Last three weeks before a competition',
};

/** Days before a competition when practice switches to the final-weeks mix. */
export const FINAL_WEEKS_DAYS = 21;

/** Whole days from `now` until a "YYYY-MM-DD" date (0 on the day itself), or null if the date has passed or is invalid. */
export function daysUntil(date: string | null | undefined, now: number): number | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const today = new Date(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.round((target - start) / DAY_MS);
  return days >= 0 ? days : null;
}

export function seasonPhase(now: number, nextEventDate?: string | null): SeasonPhase {
  const days = daysUntil(nextEventDate, now);
  if (days !== null && days <= FINAL_WEEKS_DAYS) return 'final_weeks';
  const month = new Date(now).getMonth(); // 0 = January
  return month >= 4 && month <= 8 ? 'off_season' : 'season';
}

/** Target chance of still remembering a card when it comes due (higher = more frequent reviews). */
export const RETENTION: Record<SeasonPhase, number> = { off_season: 0.85, season: 0.88, final_weeks: 0.92 };

/* ---------------- scheduling ---------------- */

const schedulers = new Map<number, FSRS>();

function scheduler(retention: number): FSRS {
  let f = schedulers.get(retention);
  if (!f) {
    f = fsrs(
      generatorParameters({
        request_retention: retention,
        maximum_interval: 365,
        enable_fuzz: true,
        // Whole days only: misses return the next day rather than minutes later in the same session.
        enable_short_term: false,
      }),
    );
    schedulers.set(retention, f);
  }
  return f;
}

function toCard(s: FsrsState): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.lastReview === null ? undefined : new Date(s.lastReview),
  };
}

function fromCard(c: Card): FsrsState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ? c.last_review.getTime() : null,
  };
}

export function newFsrsState(at: number): FsrsState {
  return fromCard(createEmptyCard(new Date(at)));
}

/** Grade a card and schedule its next review. */
export function gradeCard(card: ReviewCard, event: CardEvent, retention: number): ReviewCard {
  const { card: next } = scheduler(retention).next(toCard(card.fsrs), new Date(event.t), event.grade);
  return { ...card, fsrs: fromCard(next), log: [...card.log, event] };
}

/** Chance (0–1) that the player still remembers the card at `now`. New cards return null. */
export function recall(card: ReviewCard, now: number): number | null {
  if (card.fsrs.state === State.New) return null;
  return scheduler(RETENTION.season).get_retrievability(toCard(card.fsrs), new Date(now), false);
}

/* ---------------- grading a timed review ---------------- */

/**
 * Silent reading speed allowed in a review, in words per minute. Faster than a moderator reads
 * aloud, because the player reads the question to themself.
 */
export const REVIEW_READING_WPM = 300;
/** After the reading allowance: toss-ups get the 5 s buzz window, bonuses the 20 s answer window. */
export const REVIEW_WINDOW_MS: Record<QuestionKind, number> = { tossup: 5_000, bonus: 20_000 };
/** A review times out this long after the reading allowance ends. */
export const REVIEW_LIMIT_MS: Record<QuestionKind, number> = { tossup: 15_000, bonus: 40_000 };

export interface ReviewTiming {
  /** Time allowed to read the question silently. */
  readMs: number;
  /** Correct by this time: Easy. */
  easyMs: number;
  /** Correct by this time: Good. Later but correct: Hard. */
  goodMs: number;
  /** No answer by this time: the review ends as a miss. */
  limitMs: number;
}

/** `readingUnits` is the question's length in reading units (see src/lib/reading.ts). */
export function reviewTiming(kind: QuestionKind, readingUnits: number): ReviewTiming {
  const readMs = Math.round(readingUnits * (60_000 / (REVIEW_READING_WPM * 6)));
  const window = REVIEW_WINDOW_MS[kind];
  return {
    readMs,
    easyMs: kind === 'tossup' ? readMs : readMs + window / 2,
    goodMs: readMs + window,
    limitMs: readMs + REVIEW_LIMIT_MS[kind],
  };
}

/**
 * The grade for a review. Toss-ups are timed to the buzz: knowing it by the time you finish reading
 * is Easy, within the 5 s window is Good, later is Hard. Bonuses are timed to the submitted answer.
 */
export function reviewGrade(correct: boolean, ms: number | null, timing: ReviewTiming): Grade {
  if (!correct) return Rating.Again;
  if (ms === null) return Rating.Good;
  if (ms <= timing.easyMs) return Rating.Easy;
  if (ms <= timing.goodMs) return Rating.Good;
  return Rating.Hard;
}

/* ---------------- cards from practice and games ---------------- */

/** One answer (or non-answer) to a question by a player, from solo practice or a practice game. */
export interface Outcome {
  /** Unique key of the answer, e.g. "attempt:a-123" or "game:g-1:4:1700000000000". */
  key: string;
  playerId: string;
  questionId: string;
  subject: Subject;
  kind: QuestionKind;
  correct: boolean;
  interrupt: boolean;
  /** Buzz time after the reading ended (toss-ups, non-interrupts). */
  latencyMs: number | null;
  t: number;
  via: 'practice' | 'game';
  /** Set when a miss is not the player's own wrong answer (a dead toss-up, a team bonus). */
  reason?: CardReason;
  /** True when the answer was the team's (a bonus in a game) or nobody's (a dead toss-up), not the player's own. */
  shared?: boolean;
}

/**
 * Hearing a question again within this long of the card's last grade does not change its schedule:
 * replaying a round right after seeing the answers shows short-term memory, not learning.
 */
export const MIN_REGRADE_GAP_MS = 12 * 60 * 60 * 1000;

/** The grade an answer in practice gives a card the player already has. */
export function practiceGrade(o: Pick<Outcome, 'correct' | 'interrupt' | 'latencyMs' | 'kind'>): Grade {
  if (!o.correct) return Rating.Again;
  if (o.kind === 'tossup' && !o.interrupt && o.latencyMs !== null && o.latencyMs >= SLOW_TOSSUP_MS) return Rating.Hard;
  return Rating.Good;
}

/** Why this answer should create a card, or null if it should not. */
export function reasonFor(o: Outcome): CardReason | null {
  if (o.reason) return o.reason;
  if (!o.correct) return o.interrupt ? 'interrupt' : 'missed';
  if (o.kind === 'tossup' && !o.interrupt && o.latencyMs !== null && o.latencyMs >= SLOW_TOSSUP_MS) return 'slow';
  return null;
}

/**
 * Apply an answer to the player's card for that question. A miss or slow answer creates the card
 * (counting the answer as its first review); an answer to a question that already has a card counts
 * as a review of it. Returns the new card, or null when nothing changes.
 */
export function applyOutcome(existing: ReviewCard | undefined, o: Outcome, retention: number): ReviewCard | null {
  const event: CardEvent = { t: o.t, grade: practiceGrade(o), via: o.via, correct: o.correct, ms: o.latencyMs };
  if (existing) {
    if (existing.sources.includes(o.key)) return null;
    const withSource = { ...existing, sources: [...existing.sources, o.key] };
    const last = existing.fsrs.lastReview;
    if (last !== null && o.t - last < MIN_REGRADE_GAP_MS) return withSource;
    // A game finished late can report answers older than the last review; schedules only move forward.
    return gradeCard(withSource, { ...event, t: Math.max(o.t, last ?? o.t) }, retention);
  }
  const reason = reasonFor(o);
  if (!reason) return null;
  const card: ReviewCard = {
    id: cardId(o.playerId, o.questionId),
    playerId: o.playerId,
    questionId: o.questionId,
    subject: o.subject,
    kind: o.kind,
    reason,
    createdAt: o.t,
    sources: [o.key],
    fsrs: newFsrsState(o.t),
    log: [],
  };
  return gradeCard(card, event, retention);
}

/** A card the player asked for: due straight away, with no answer counted yet. */
export function manualCard(playerId: string, q: { id: string; subject: Subject; kind: QuestionKind }, at: number): ReviewCard {
  return {
    id: cardId(playerId, q.id),
    playerId,
    questionId: q.id,
    subject: q.subject,
    kind: q.kind,
    reason: 'manual',
    createdAt: at,
    sources: [],
    fsrs: newFsrsState(at),
    log: [],
  };
}

/* ---------------- what is due ---------------- */

/** Hour of the day when a new practice day starts (like Anki): cards due before then count as due today. */
export const DAY_STARTS_AT_HOUR = 4;

/** The end of the practice day that contains `now` (the next 4 a.m., local time). */
export function endOfPracticeDay(now: number): number {
  const d = new Date(now);
  const cutoff = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_STARTS_AT_HOUR);
  if (cutoff.getTime() <= now) cutoff.setDate(cutoff.getDate() + 1);
  return cutoff.getTime();
}

/** The practice day `now` belongs to, as "YYYY-MM-DD" (a day runs from 4 a.m. to 4 a.m.). */
export function practiceDay(now: number): string {
  const d = new Date(endOfPracticeDay(now));
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Cards are suspended while their question has an open problem report, so a disputed answer is never drilled. */
export function isSuspended(card: ReviewCard, disputed: ReadonlySet<string>): boolean {
  return disputed.has(card.questionId);
}

/** The player's cards due by the end of today, most overdue first. */
export function dueCards(cards: Iterable<ReviewCard>, playerId: string, now: number, disputed: ReadonlySet<string> = new Set()): ReviewCard[] {
  const end = endOfPracticeDay(now);
  const due: ReviewCard[] = [];
  for (const c of cards) {
    if (c.playerId === playerId && c.fsrs.due < end && !isSuspended(c, disputed)) due.push(c);
  }
  return due.sort((a, b) => a.fsrs.due - b.fsrs.due || a.id.localeCompare(b.id));
}

export interface CardSummary {
  total: number;
  dueToday: number;
  suspended: number;
  /** Cards remembered for three weeks or longer. */
  mature: number;
  /** Reviews done today. */
  reviewedToday: number;
  /** The next card that comes due after today, if any. */
  nextDue: number | null;
}

export function summarizeCards(cards: Iterable<ReviewCard>, playerId: string, now: number, disputed: ReadonlySet<string> = new Set()): CardSummary {
  const end = endOfPracticeDay(now);
  const start = end - DAY_MS;
  const s: CardSummary = { total: 0, dueToday: 0, suspended: 0, mature: 0, reviewedToday: 0, nextDue: null };
  for (const c of cards) {
    if (c.playerId !== playerId) continue;
    s.total += 1;
    if (isSuspended(c, disputed)) {
      s.suspended += 1;
      continue;
    }
    if (c.fsrs.due < end) s.dueToday += 1;
    else if (s.nextDue === null || c.fsrs.due < s.nextDue) s.nextDue = c.fsrs.due;
    if (c.fsrs.stability >= 21) s.mature += 1;
    s.reviewedToday += c.log.filter((e) => e.via === 'review' && e.t >= start && e.t < end).length;
  }
  return s;
}
