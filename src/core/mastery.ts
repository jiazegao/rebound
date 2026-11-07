/**
 * The learner model: mastery (accuracy adjusted for question difficulty) and fluency (buzz speed)
 * for each player, subject and topic.
 *
 * Mastery is a rating on the Elo scale, estimated from the player's first answer to each question
 * (replays of a round they have already heard are not evidence). A logistic model gives the chance
 * of a correct answer: p = 1 / (1 + 10^((difficulty − rating) / 400)). Each subject's rating starts
 * from a prior around an average player; each topic's rating starts from the player's subject
 * rating, so a topic with only two answers stays close to the subject. Recent answers count more
 * (half-life 60 days), so improvement shows.
 *
 * Question difficulty is not measured yet, so it comes from what DOE says about its sample sets:
 * rounds 1–10 are about equal, later rounds get harder, and bonuses are harder than toss-ups.
 */
import type { QuestionKind, Subject } from './schema';

export const BASE_DIFFICULTY = 1500;
const LOGISTIC = Math.LN10 / 400;
const SUBJECT_PRIOR_SD = 200;
const TOPIC_PRIOR_SD = 120;
const HALF_LIFE_DAYS = 60;

/** Prior difficulty of a question from its round (1-based) and kind. */
export function questionDifficulty(kind: QuestionKind, round: number): number {
  return BASE_DIFFICULTY + 15 * Math.max(0, round - 10) + (kind === 'bonus' ? 50 : 0);
}

/** Chance of a correct answer for a player of `rating` on a question of `difficulty`. */
export function chance(rating: number, difficulty = BASE_DIFFICULTY): number {
  return 1 / (1 + Math.exp(-LOGISTIC * (rating - difficulty)));
}

/** One answer used by the model. */
export interface Observation {
  playerId: string;
  questionId: string;
  subject: Subject;
  /** Topic id, or "" when the question has no topic. */
  topic: string;
  kind: QuestionKind;
  /** Round order within its set (1-based), for the difficulty prior. */
  round: number;
  correct: boolean;
  interrupt: boolean;
  /** Buzz time after the reading ended, for non-interrupt toss-ups. */
  latencyMs: number | null;
  t: number;
}

export interface SkillLine {
  /** Rating on the Elo scale. */
  rating: number;
  /** Chance of answering a typical regional toss-up (rounds 1–10) correctly. */
  p: number;
  /** Answers counted (first answers only). */
  n: number;
  correct: number;
  interrupts: number;
  interruptsCorrect: number;
  /** Median buzz time on correct, non-interrupt toss-ups (ms), or null. */
  medianBuzzMs: number | null;
  /** When the player last answered a question here. */
  last: number;
}

export interface PlayerModel {
  subjects: Partial<Record<Subject, SkillLine>>;
  topics: Record<string, SkillLine>;
  /** All first answers, oldest first. */
  observations: Observation[];
}

/** Keep each player's first answer to each question. */
export function firstAnswers(observations: Observation[]): Observation[] {
  const sorted = [...observations].sort((a, b) => a.t - b.t);
  const seen = new Set<string>();
  const out: Observation[] = [];
  for (const o of sorted) {
    const key = `${o.playerId}\u0000${o.questionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

/** Maximum a posteriori rating under the logistic model with a normal prior, by Newton's method. */
export function estimateRating(answers: Array<{ difficulty: number; correct: boolean; weight: number }>, priorMean: number, priorSd: number): number {
  let r = priorMean;
  const precision = 1 / (priorSd * priorSd);
  for (let iter = 0; iter < 25; iter++) {
    let grad = -(r - priorMean) * precision;
    let hess = -precision;
    for (const a of answers) {
      const p = chance(r, a.difficulty);
      grad += a.weight * LOGISTIC * ((a.correct ? 1 : 0) - p);
      hess -= a.weight * LOGISTIC * LOGISTIC * p * (1 - p);
    }
    const step = grad / hess;
    r -= step;
    if (Math.abs(step) < 0.01) break;
  }
  return r;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function line(obs: Observation[], priorMean: number, priorSd: number, now: number): SkillLine {
  const answers = obs.map((o) => ({
    difficulty: questionDifficulty(o.kind, o.round),
    correct: o.correct,
    weight: Math.pow(0.5, Math.max(0, now - o.t) / (HALF_LIFE_DAYS * 86_400_000)),
  }));
  const rating = estimateRating(answers, priorMean, priorSd);
  return {
    rating,
    p: chance(rating),
    n: obs.length,
    correct: obs.filter((o) => o.correct).length,
    interrupts: obs.filter((o) => o.interrupt).length,
    interruptsCorrect: obs.filter((o) => o.interrupt && o.correct).length,
    medianBuzzMs: median(obs.filter((o) => o.correct && !o.interrupt && o.kind === 'tossup' && o.latencyMs !== null).map((o) => o.latencyMs!)),
    last: obs.reduce((m, o) => Math.max(m, o.t), 0),
  };
}

/** Build the model for one player from their observations (any order; repeats are dropped). */
export function playerModel(observations: Observation[], now: number): PlayerModel {
  const first = firstAnswers(observations);
  const bySubject = new Map<Subject, Observation[]>();
  const byTopic = new Map<string, Observation[]>();
  for (const o of first) {
    bySubject.set(o.subject, [...(bySubject.get(o.subject) ?? []), o]);
    if (o.topic) byTopic.set(o.topic, [...(byTopic.get(o.topic) ?? []), o]);
  }
  const subjects: PlayerModel['subjects'] = {};
  for (const [subject, obs] of bySubject) subjects[subject] = line(obs, BASE_DIFFICULTY, SUBJECT_PRIOR_SD, now);
  const topics: PlayerModel['topics'] = {};
  for (const [topic, obs] of byTopic) {
    const subjectRating = subjects[obs[0].subject]?.rating ?? BASE_DIFFICULTY;
    topics[topic] = line(obs, subjectRating, TOPIC_PRIOR_SD, now);
  }
  return { subjects, topics, observations: first };
}

/** The player's rating for a topic, falling back to the subject and then to an average player. */
export function ratingFor(model: PlayerModel | undefined, subject: Subject, topic?: string): number {
  if (!model) return BASE_DIFFICULTY;
  if (topic && model.topics[topic]) return model.topics[topic].rating;
  return model.subjects[subject]?.rating ?? BASE_DIFFICULTY;
}
