import { describe, expect, it } from 'vitest';
import {
  applyOutcome,
  dueCards,
  endOfPracticeDay,
  manualCard,
  practiceDay,
  Rating,
  RETENTION,
  reviewGrade,
  reviewTiming,
  seasonPhase,
  State,
  summarizeCards,
  gradeCard,
  type Outcome,
  type ReviewCard,
} from './review';

const DAY = 24 * 60 * 60 * 1000;
// Saturday 7 November 2026, 4 p.m. local time.
const T0 = new Date(2026, 10, 7, 16, 0, 0).getTime();

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
  it('turns a miss into a card that comes back the next day', () => {
    const card = applyOutcome(undefined, outcome(), RETENTION.season)!;
    expect(card.id).toBe('p1:doe-hs-17-r01-t01');
    expect(card.reason).toBe('missed');
    expect(card.log).toHaveLength(1);
    expect(card.log[0].grade).toBe(Rating.Again);
    expect(card.fsrs.state).not.toBe(State.New);
    const days = (card.fsrs.due - T0) / DAY;
    expect(days).toBeGreaterThanOrEqual(1);
    expect(days).toBeLessThan(2);
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

  it('counts each answer once', () => {
    const card = applyOutcome(undefined, outcome(), 0.88)!;
    expect(applyOutcome(card, outcome(), 0.88)).toBeNull();
    const again = applyOutcome(card, outcome({ key: 'game:g1:0:1', t: T0 + 3 * DAY, correct: true, latencyMs: 500, via: 'game' }), 0.88)!;
    expect(again.log).toHaveLength(2);
    expect(again.log[1].grade).toBe(Rating.Good);
    expect(again.sources).toEqual(['attempt:a1', 'game:g1:0:1']);
  });

  it('does not regrade a card on the same day (replaying a round right after seeing the answers)', () => {
    const card = applyOutcome(undefined, outcome(), 0.88)!;
    const replay = applyOutcome(card, outcome({ key: 'attempt:a2', t: T0 + 10 * 60 * 1000, correct: true, latencyMs: 200 }), 0.88)!;
    expect(replay.sources).toContain('attempt:a2');
    expect(replay.log).toHaveLength(1);
    expect(replay.fsrs).toEqual(card.fsrs);
  });

  it('a later miss on an existing card brings it back sooner', () => {
    let card = applyOutcome(undefined, outcome(), 0.88)!;
    card = gradeCard(card, { t: card.fsrs.due, grade: Rating.Good, via: 'review', correct: true, ms: 3000 }, 0.88);
    const goodDue = card.fsrs.due;
    const missed = applyOutcome(card, outcome({ key: 'attempt:a2', t: card.log[1].t + DAY }), 0.88)!;
    expect(missed.fsrs.due).toBeLessThan(goodDue + DAY);
    expect(missed.fsrs.lapses).toBe(card.fsrs.lapses + 1);
  });

  it('manual cards are due straight away', () => {
    const card = manualCard('p1', { id: 'q', subject: 'math', kind: 'bonus' }, T0);
    expect(card.fsrs.state).toBe(State.New);
    expect(dueCards([card], 'p1', T0)).toHaveLength(1);
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
    const at = card.fsrs.due;
    const easy = gradeCard(card, { t: at, grade: Rating.Easy, via: 'review', correct: true, ms: 1 }, 0.88);
    const hard = gradeCard(card, { t: at, grade: Rating.Hard, via: 'review', correct: true, ms: 1 }, 0.88);
    expect(easy.fsrs.due).toBeGreaterThan(hard.fsrs.due);
  });
});

describe('what is due', () => {
  it('a practice day runs from 4 a.m. to 4 a.m.', () => {
    expect(new Date(endOfPracticeDay(T0)).getHours()).toBe(4);
    expect(endOfPracticeDay(T0) - T0).toBeLessThanOrEqual(DAY);
    const lateNight = new Date(2026, 10, 8, 1, 30).getTime();
    expect(practiceDay(lateNight)).toBe('2026-11-07');
    expect(practiceDay(T0)).toBe('2026-11-07');
  });

  it('lists due cards, most overdue first, and skips disputed questions and other players', () => {
    const a = applyOutcome(undefined, outcome({ questionId: 'qa', key: 'a' }), 0.88)!;
    const b = applyOutcome(undefined, outcome({ questionId: 'qb', key: 'b', t: T0 - 5 * DAY }), 0.88)!;
    const c = applyOutcome(undefined, outcome({ questionId: 'qc', key: 'c', t: T0 - 5 * DAY }), 0.88)!;
    const other = applyOutcome(undefined, outcome({ questionId: 'qd', key: 'd', playerId: 'p2', t: T0 - 5 * DAY }), 0.88)!;
    const cards: ReviewCard[] = [a, b, c, other];
    expect(dueCards(cards, 'p1', T0).map((x) => x.questionId)).toEqual(['qb', 'qc']);
    expect(dueCards(cards, 'p1', T0, new Set(['qb'])).map((x) => x.questionId)).toEqual(['qc']);
    expect(dueCards(cards, 'p1', T0 + 2 * DAY)).toHaveLength(3);
    const s = summarizeCards(cards, 'p1', T0, new Set(['qb']));
    expect(s).toMatchObject({ total: 3, dueToday: 1, suspended: 1 });
    expect(s.nextDue).toBe(a.fsrs.due);
  });
});
