import { describe, expect, it } from 'vitest';
import {
  applyOutcome,
  cardStage,
  dueToday,
  endOfPracticeDay,
  gradeCard,
  isStale,
  LEARNED_DAYS,
  manualCard,
  newCardPriority,
  newCardsPerDay,
  normalizeCard,
  practiceDay,
  Rating,
  RETENTION,
  reviewGrade,
  reviewQueue,
  reviewTiming,
  seasonPhase,
  State,
  summarizeCards,
  type CardOwner,
  type Outcome,
  type ReviewCard,
} from './review';

const DAY = 24 * 60 * 60 * 1000;
// Saturday 7 November 2026, 4 p.m. local time.
const T0 = new Date(2026, 10, 7, 16, 0, 0).getTime();
const OWNER: CardOwner = { id: 'p1', primarySubject: 'biology', secondarySubject: 'chemistry' };
const OPTS = { newPerDay: 4 };

function outcome(fields: Partial<Outcome> = {}): Outcome {
  return {
    key: 'attempt:a1',
    playerId: 'p1',
    questionId: 'doe-hs-17-r01-t01',
    subject: 'biology',
    kind: 'tossup',
    correct: false,
    interrupt: false,
    latencyMs: 1200,
    t: T0,
    via: 'practice',
    ...fields,
  };
}

/** A review at time t with the given grade. */
function review(card: ReviewCard, t: number, grade: Rating.Again | Rating.Hard | Rating.Good | Rating.Easy): ReviewCard {
  return gradeCard(card, { t, grade, via: 'review', correct: grade !== Rating.Again, ms: 3000 }, 0.88);
}

describe('season and retention', () => {
  it('uses the off-season, season and final-weeks targets', () => {
    expect(seasonPhase(new Date(2026, 6, 1).getTime())).toBe('off_season');
    expect(seasonPhase(new Date(2026, 10, 7).getTime())).toBe('season');
    expect(seasonPhase(new Date(2026, 10, 7).getTime(), '2027-02-06')).toBe('season');
    expect(seasonPhase(new Date(2027, 0, 20).getTime(), '2027-02-06')).toBe('final_weeks');
    // A competition that has already happened does not count.
    expect(seasonPhase(new Date(2027, 1, 10).getTime(), '2027-02-06')).toBe('season');
    expect(RETENTION.final_weeks).toBeGreaterThan(RETENTION.season);
    expect(RETENTION.season).toBeGreaterThan(RETENTION.off_season);
  });
});

describe('cards from practice', () => {
  it('turns a miss into a new card that can first come up the next practice day', () => {
    const card = applyOutcome(undefined, outcome(), RETENTION.season)!;
    expect(card.id).toBe('p1:doe-hs-17-r01-t01');
    expect(card.reason).toBe('missed');
    expect(cardStage(card)).toBe('new');
    expect(card.fsrs.state).toBe(State.New);
    expect(card.log).toHaveLength(1);
    expect(card.log[0]).toMatchObject({ grade: Rating.Again, via: 'practice', correct: false });
    expect(dueToday([card], OWNER, T0, OPTS).fresh).toHaveLength(0);
    expect(dueToday([card], OWNER, T0 + DAY, OPTS).fresh).toHaveLength(1);
  });

  it('marks wrong interrupts and slow correct answers, and ignores quick correct answers', () => {
    expect(applyOutcome(undefined, outcome({ interrupt: true, latencyMs: null }), 0.88)!.reason).toBe('interrupt');
    const slow = applyOutcome(undefined, outcome({ correct: true, latencyMs: 4000 }), 0.88)!;
    expect(slow.reason).toBe('slow');
    expect(slow.log[0].grade).toBe(Rating.Hard);
    expect(applyOutcome(undefined, outcome({ correct: true, latencyMs: 900 }), 0.88)).toBeNull();
    expect(applyOutcome(undefined, outcome({ correct: true, interrupt: true, latencyMs: null }), 0.88)).toBeNull();
    // Bonuses have no buzz, so a correct bonus never makes a card.
    expect(applyOutcome(undefined, outcome({ kind: 'bonus', correct: true, latencyMs: null }), 0.88)).toBeNull();
  });

  it('counts each answer once, and keeps a new card waiting until its first review', () => {
    const card = applyOutcome(undefined, outcome(), 0.88)!;
    expect(applyOutcome(card, outcome(), 0.88)).toBeNull();
    const heard = applyOutcome(card, outcome({ key: 'game:g1:0:1', t: T0 + 3 * DAY, correct: true, latencyMs: 500, via: 'game' }), 0.88)!;
    expect(heard.sources).toEqual(['attempt:a1', 'game:g1:0:1']);
    expect(cardStage(heard)).toBe('new');
    // Missing it again renews its place in line.
    const missed = applyOutcome(card, outcome({ key: 'attempt:a2', t: T0 + 5 * DAY }), 0.88)!;
    expect(missed.createdAt).toBe(T0 + 5 * DAY);
    expect(missed.log).toHaveLength(2);
  });

  it('grades a card in review when the question comes up again in practice, but not twice in a day', () => {
    let card = applyOutcome(undefined, outcome(), 0.88)!;
    card = review(card, T0 + DAY, Rating.Good);
    expect(cardStage(card)).toBe('review');
    const goodDue = card.fsrs.due;
    const sameDay = applyOutcome(card, outcome({ key: 'attempt:a2', t: T0 + DAY + 60 * 60 * 1000 }), 0.88)!;
    expect(sameDay.fsrs).toEqual(card.fsrs);
    const missed = applyOutcome(card, outcome({ key: 'attempt:a3', t: T0 + 2 * DAY }), 0.88)!;
    expect(missed.fsrs.due).toBeLessThan(goodDue);
    expect(missed.fsrs.lapses).toBe(card.fsrs.lapses + 1);
  });

  it('retires a card as learned after a right answer with a month-long gap, and brings it back after a miss', () => {
    let card = applyOutcome(undefined, outcome(), 0.88)!;
    let t = T0 + DAY;
    for (let i = 0; i < 8 && cardStage(card) !== 'learned'; i++) {
      card = review(card, t, Rating.Good);
      t = card.fsrs.due;
    }
    expect(cardStage(card)).toBe('learned');
    expect(card.fsrs.scheduledDays).toBeGreaterThanOrEqual(LEARNED_DAYS);
    expect(dueToday([card], OWNER, card.fsrs.due + DAY, OPTS).reviews).toHaveLength(0);
    // Right again in a drill: still learned. Missed in a game: back in review.
    const t2 = card.retiredAt! + 40 * DAY;
    expect(cardStage(applyOutcome(card, outcome({ key: 'x', correct: true, latencyMs: 800, t: t2 }), 0.88)!)).toBe('learned');
    const back = applyOutcome(card, outcome({ key: 'y', t: t2, via: 'game' }), 0.88)!;
    expect(cardStage(back)).toBe('review');
    expect(back.retiredAt).toBeNull();
  });

  it('manual cards wait for no one', () => {
    const card = manualCard('p1', { id: 'q', subject: 'math', kind: 'bonus' }, T0);
    expect(card.fsrs.state).toBe(State.New);
    expect(dueToday([card], OWNER, T0, OPTS).fresh).toHaveLength(1);
    expect(isStale(card, T0 + 100 * DAY)).toBe(false);
  });

  it('fills in stages for cards saved before stages existed', () => {
    const old = review(applyOutcome(undefined, outcome(), 0.88)!, T0 + DAY, Rating.Good) as Partial<ReviewCard>;
    delete old.introducedAt;
    delete old.retiredAt;
    const fixed = normalizeCard(old as ReviewCard);
    expect(cardStage(fixed)).toBe('review');
    expect(fixed.retiredAt).toBeNull();
  });
});

describe('timed review grades', () => {
  const timing = reviewTiming('tossup', 180); // 180 reading units = 6 s at 300 wpm
  it('gives the reading time plus the buzz window', () => {
    expect(timing.readMs).toBe(6000);
    expect(timing.goodMs).toBe(11000);
    expect(timing.limitMs).toBe(21000);
  });
  it('grades by correctness and buzz time', () => {
    expect(reviewGrade(false, 1000, timing)).toBe(Rating.Again);
    expect(reviewGrade(true, 5000, timing)).toBe(Rating.Easy);
    expect(reviewGrade(true, 9000, timing)).toBe(Rating.Good);
    expect(reviewGrade(true, 15000, timing)).toBe(Rating.Hard);
  });
  it('gives bonuses their 20-second window', () => {
    const b = reviewTiming('bonus', 180);
    expect(b.easyMs).toBe(16000);
    expect(b.goodMs).toBe(26000);
    expect(reviewGrade(true, 30000, b)).toBe(Rating.Hard);
  });
  it('an easy answer pushes the card further out than a hard one', () => {
    const card = applyOutcome(undefined, outcome(), 0.88)!;
    expect(review(card, T0 + DAY, Rating.Easy).fsrs.due).toBeGreaterThan(review(card, T0 + DAY, Rating.Hard).fsrs.due);
  });
});

describe("today's queue", () => {
  it('a practice day runs from 4 a.m. to 4 a.m.', () => {
    expect(new Date(endOfPracticeDay(T0)).getHours()).toBe(4);
    expect(endOfPracticeDay(T0) - T0).toBeLessThanOrEqual(DAY);
    const lateNight = new Date(2026, 10, 8, 1, 30).getTime();
    expect(practiceDay(lateNight)).toBe('2026-11-07');
    expect(practiceDay(T0)).toBe('2026-11-07');
  });

  it('lets a few new cards join each day: added questions, wrong interrupts and own subjects first', () => {
    const make = (q: string, fields: Partial<Outcome>) => applyOutcome(undefined, outcome({ key: q, questionId: q, ...fields }), 0.88)!;
    const cards = [
      make('physics-miss', { subject: 'physics' }),
      make('bio-miss', { subject: 'biology' }),
      make('chem-miss', { subject: 'chemistry' }),
      make('physics-interrupt', { subject: 'physics', interrupt: true, latencyMs: null }),
      make('bio-slow', { subject: 'biology', correct: true, latencyMs: 4000 }),
      manualCard('p1', { id: 'added', subject: 'math', kind: 'bonus' }, T0),
    ];
    const order = [...cards].sort((a, b) => newCardPriority(b, OWNER) - newCardPriority(a, OWNER)).map((c) => c.questionId);
    expect(order.slice(0, 3)).toEqual(['added', 'physics-interrupt', 'bio-miss']);
    const tomorrow = dueToday(cards, OWNER, T0 + DAY, OPTS);
    expect(tomorrow.fresh.map((c) => c.questionId)).toEqual(['added', 'physics-interrupt', 'bio-miss', 'bio-slow']);
    expect(tomorrow.waiting).toBe(2);
    // Two of them reviewed today: only two more new cards may join today.
    const reviewed = cards.map((c) => (c.questionId === 'added' || c.questionId === 'bio-miss' ? review(c, T0 + DAY, Rating.Good) : c));
    const later = dueToday(reviewed, OWNER, T0 + DAY + 60_000, OPTS);
    expect(later.fresh.map((c) => c.questionId)).toEqual(['physics-interrupt', 'bio-slow']);
    // New cards that wait two weeks are dropped.
    expect(dueToday(cards, OWNER, T0 + 15 * DAY, OPTS).fresh.map((c) => c.questionId)).toEqual(['added']);
  });

  it('lists due reviews before new cards, most overdue first, skipping disputed questions and other players', () => {
    const make = (q: string, t: number, playerId = 'p1') => review(applyOutcome(undefined, outcome({ key: q, questionId: q, t, playerId }), 0.88)!, t + DAY, Rating.Again);
    const a = make('qa', T0 - 2 * DAY);
    const b = make('qb', T0 - 6 * DAY);
    const other = make('qd', T0 - 6 * DAY, 'p2');
    const fresh = applyOutcome(undefined, outcome({ key: 'qn', questionId: 'qn', t: T0 - DAY }), 0.88)!;
    const q = reviewQueue(dueToday([a, b, other, fresh], OWNER, T0, OPTS));
    expect(q.map((c) => c.questionId)).toEqual(['qb', 'qa', 'qn']);
    expect(reviewQueue(dueToday([a, b, fresh], OWNER, T0, { ...OPTS, disputed: new Set(['qb']) })).map((c) => c.questionId)).toEqual(['qa', 'qn']);
    const s = summarizeCards([a, b, other, fresh], OWNER, T0, { ...OPTS, disputed: new Set(['qb']) });
    expect(s).toMatchObject({ total: 3, dueToday: 2, suspended: 1, learned: 0, waiting: 0, startingTomorrow: 0 });
    // A miss from today's practice starts tomorrow.
    const today = applyOutcome(undefined, outcome({ key: 'qt', questionId: 'qt', t: T0 }), 0.88)!;
    expect(summarizeCards([a, today], OWNER, T0 + 60_000, OPTS)).toMatchObject({ total: 2, dueToday: 1, startingTomorrow: 1 });
  });

  it('scales the new-card allowance with the plan length', () => {
    expect(newCardsPerDay(15)).toBe(2);
    expect(newCardsPerDay(30)).toBe(4);
    expect(newCardsPerDay(45)).toBe(6);
  });
});
