/**
 * Simulates a player practicing daily for 90 days, to check that the review queue stays manageable.
 *
 * Each day: today's reviews up to the plan's cap (due cards first, then new ones), then drill and
 * mixed questions; each fresh question is missed with probability (1 − skill), and misses become
 * new cards. Recall at review time follows the FSRS forgetting curve of the card (new cards: 60%).
 * Prints the queue over time.
 *
 *   npx tsx scripts/checks/review-load.ts [minutesPerDay] [skill]
 */
import { applyOutcome, cardStage, dueToday, gradeCard, isStale, newCardsPerDay, Rating, recall, reviewQueue, type ReviewCard } from '../../src/core/review';

const DAY = 86_400_000;
const minutes = Number(process.argv[2] ?? 30);
const skill = Number(process.argv[3] ?? 0.6);
const retention = 0.88;
const reviewCap = Math.floor(minutes / 3 / 0.5);
const questionsPerDay = Math.round((minutes * 2) / 3); // the non-review two thirds, one question a minute

let seed = 42;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const cards = new Map<string, ReviewCard>();
let qn = 0;
const start = new Date(2026, 10, 1, 17).getTime();
const rows: string[] = [];
for (let day = 0; day < 90; day++) {
  const now = start + day * DAY;
  for (const [id, c] of cards) if (isStale(c, now)) cards.delete(id);
  const today = dueToday(cards.values(), { id: 'p', primarySubject: 'biology' }, now, { newPerDay: newCardsPerDay(minutes) });
  const due = reviewQueue(today);
  let reviewed = 0;
  let right = 0;
  for (const card of due.slice(0, reviewCap)) {
    const r = recall(card, now) ?? 0.6;
    const ok = random() < r;
    const grade = ok ? (random() < 0.7 ? Rating.Good : random() < 0.5 ? Rating.Easy : Rating.Hard) : Rating.Again;
    cards.set(card.id, gradeCard(card, { t: now + reviewed * 30_000, grade, via: 'review', correct: ok, ms: 4000 }, retention));
    reviewed += 1;
    if (ok) right += 1;
  }
  let created = 0;
  for (let i = 0; i < questionsPerDay; i++) {
    qn += 1;
    const correct = random() < skill;
    const slow = correct && random() < 0.15;
    const o = {
      key: `a${qn}`,
      playerId: 'p',
      questionId: `q${qn}`,
      subject: (random() < 0.5 ? 'biology' : 'chemistry') as 'biology' | 'chemistry',
      kind: 'tossup' as const,
      correct,
      interrupt: false,
      latencyMs: slow ? 3500 : 1500,
      t: now + 20 * 60_000 + i * 60_000,
      via: 'practice' as const,
    };
    const card = applyOutcome(undefined, o, retention);
    if (card) {
      cards.set(card.id, card);
      created += 1;
    }
  }
  if (day % 7 === 0 || day === 89) {
    const learned = [...cards.values()].filter((c) => cardStage(c) === 'learned').length;
    const inReview = [...cards.values()].filter((c) => cardStage(c) === 'review').length;
    rows.push(
      `day ${String(day).padStart(2)}  due ${String(today.reviews.length).padStart(3)} + ${today.fresh.length} new (${today.waiting} waiting)  reviewed ${String(reviewed).padStart(2)} (${right} right)  misses ${String(created).padStart(2)}  in review ${inReview}  learned ${learned}`,
    );
  }
}
console.log(`${minutes} min/day, skill ${skill}, review cap ${reviewCap}, ${questionsPerDay} new questions/day`);
console.log(rows.join('\n'));
