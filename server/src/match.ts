/**
 * Online matches with no reader: the team's Durable Object reveals each question on a schedule, runs the buzzers,
 * judges typed answers with the answer checker and keeps score. Two formats:
 *
 * - "teams": two sides under the NSB rules, through the shared rules engine (src/core/rules/engine.ts):
 *   interrupts, re-reads, rebounds, bonuses answered by the side's captain after conferring in the team channel,
 *   the game clock and halftime. The finished game is an ordinary game record, so stats and reviews use it.
 * - "ffa": everyone for themselves, toss-ups only: +4 for a right answer, −4 for a wrong interrupt, 0 for a wrong
 *   answer after the reading. One buzz each per toss-up; after a wrong answer the others may still buzz.
 *
 * With no moderator, the answer checker's close calls ("review") go to the opponents: anyone on the other side in a
 * team match, anyone else in a free-for-all, rules within 10 seconds, and no ruling counts as accepting. Everyone
 * has then seen the official answer, so a rejected close call ends the toss-up: nobody else may answer it.
 *
 * Pure: every method takes the time. rooms.ts stores `MatchData`, opens and closes the buzzers the director asks
 * for, publishes `view()`, and wakes the director at `nextDue()`.
 */
import { judgeAnswer } from '../../src/core/judge/judge';
import { applyEvent, currentWindow, replay, type EventInput, type MatchConfig, type MatchEvent, type MatchState, type TeamIdx } from '../../src/core/rules/engine';
import { getPreset, PRESETS } from '../../src/core/rules/presets';
import { LETTERS, SUBJECT_LABELS, type Letter, type Subject } from '../../src/core/schema';
import { buildReading, readingDurationMs } from '../../src/lib/reading';
import { HttpError } from './http';
import { asObject, cleanLine, MAX_ID_LENGTH } from './validate';

export type Side = 'A' | 'B';
export type MatchFormat = 'teams' | 'ffa';

/** The question label shows this long before the reading starts. */
export const LEAD_MS = 2000;
/** Before a bonus, and before a re-read for the other side. */
export const BONUS_LEAD_MS = 1500;
export const REREAD_LEAD_MS = 1500;
/** Free-for-all: after a wrong interrupt, the reading goes on after this pause. */
export const RESUME_LEAD_MS = 1000;
/** Time to type a toss-up answer after winning the buzz. */
export const TOSSUP_ANSWER_MS = 8000;
/** A captain who began within the bonus time may finish typing for this long. */
export const BONUS_GRACE_MS = 5000;
/** Opponents have this long to rule on a close call; no ruling accepts it. */
export const REVIEW_MS = 10_000;
/** The answer stays up this long before the next question. */
export const NEXT_DELAY_MS = 4000;
/** Halftime in an online match (the host can go on sooner). */
export const HALFTIME_MS = 60_000;
/** Free-for-all: the answer window after the reading, and after each wrong answer. */
export const FFA_WINDOW_MS = 5000;
export const FFA_POINTS = { correct: 4, wrongInterrupt: -4 } as const;

export const MIN_WPM = 60;
export const MAX_WPM = 600;
export const MAX_MATCH_PAIRS = 40;

export interface MatchQuestion {
  id: string;
  kind: 'tossup' | 'bonus';
  subject: Subject;
  format: 'short_answer' | 'multiple_choice';
  stem: string;
  choices?: Record<Letter, string>;
  answerLetter?: Letter;
  answer: string;
  accept: string[];
  reject: string[];
  answerRaw: string;
  /** A visual question: each device shows the figure from its own data. */
  figure: boolean;
}

export interface MatchSetup {
  format: MatchFormat;
  /** Team matches: the rules preset. */
  presetId: string;
  /** Reading speed in words per minute. */
  wpm: number;
  teamNames: [string, string];
  packet: { setId: string; setTitle: string; roundId: string; roundLabel: string; sourceUrl?: string };
  pairs: Array<{ tossup: MatchQuestion; bonus?: MatchQuestion }>;
  /** Free-for-all: how many toss-ups (from the start of the round). */
  tossupCount: number;
}

export interface MatchPlayer {
  memberId: string;
  playerId: string;
  name: string;
  /** Team matches: the side. Free-for-all players are all on side A. */
  side: Side;
  captain: boolean;
}

interface Reading {
  startedAt: number;
  durationMs: number;
  /** True once the reading has begun on screen (the buzzers open then). */
  started: boolean;
  /** The reveal stopped here while someone answers an interrupt. */
  pausedAt: number | null;
  /** Free-for-all: when a stopped reading goes on. */
  resumeAt: number | null;
}

interface QuestionRun {
  pairIndex: number;
  part: 'tossup' | 'bonus';
  reading: Reading;
  /** Free-for-all: the open answer window. */
  windowEndsAt: number | null;
  answering: { memberId: string; deadline: number; pressedAt: number; interrupt: boolean; latencyMs: number | null } | null;
  review: { memberId: string; response: string; deadline: number } | null;
  /** Free-for-all: who has buzzed on this toss-up. */
  buzzed: string[];
  overAt: number | null;
  status: string;
  /** The previous part's answer, shown while the bonus begins. */
  previous: { label: string; answer: string } | null;
}

/** One judged toss-up in a free-for-all; each device records its own player's as practice. */
export interface AnswerResult {
  memberId: string;
  playerId: string;
  questionId: string;
  subject: Subject;
  kind: 'tossup' | 'bonus';
  correct: boolean;
  interrupt: boolean;
  latencyMs: number | null;
  t: number;
}

export interface MatchData {
  setup: MatchSetup;
  status: 'lobby' | 'playing' | 'finished';
  /** Pause before the next question (the host's call, or nobody connected). */
  paused: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  players: MatchPlayer[];
  /** Team matches: the rules engine's events (the game record). */
  events: MatchEvent[];
  ffa: { index: number; scores: Record<string, { score: number; correct: number; negs: number }> } | null;
  q: QuestionRun | null;
  halftimeAt: number | null;
  /** Free-for-all results not yet sent to the devices. */
  outbox: AnswerResult[];
  /** Team matches: the game record's id, once finished. */
  gameId: string | null;
  /** Set once the finished match has been recorded and announced. */
  recorded: boolean;
}

/** The finished team match, in the site's GameRecord format (src/lib/store.ts). */
export interface OnlineGameRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  presetId: string;
  packet: MatchSetup['packet'];
  pairs: Array<{ tossupId: string; bonusId?: string; subject: Subject }>;
  teams: [{ name: string; playerIds: string[] }, { name: string; playerIds: string[] }];
  events: MatchEvent[];
  status: 'finished';
  finalScores: [number, number];
  format: 'game';
  online: true;
}

/** What players' screens show (the RoomView type in src/lib/room.ts). */
export interface MatchView {
  phase: string;
  label: string;
  subject?: string;
  text?: string;
  reading?: { startedAt: number; wpm: number; pausedAt?: number };
  window?: { openedAt: number; seconds: number };
  teams: [string, string];
  scores: [number, number];
  bonusTeam?: 0 | 1;
  status?: string;
  answer?: string;
  figure?: { questionId: string };
  questionId?: string;
  match: {
    format: MatchFormat;
    status: MatchData['status'];
    paused: boolean;
    progress?: { n: number; of: number };
    answering?: { memberId: string; name: string; deadline: number; kind: 'tossup' | 'bonus' };
    review?: { memberId: string; name: string; response: string; deadline: number; deciders: Side | 'others' };
    standings?: Array<{ memberId: string; name: string; score: number; correct: number; negs: number }>;
    clock?: { remainingMs: number; runningSince: number | null };
    previous?: { label: string; answer: string };
    gameId?: string;
  };
}

/* ---------------- checking a new match ---------------- */

const SUBJECTS = new Set(Object.keys(SUBJECT_LABELS));

function str(v: unknown, max: number, what: string, allowEmpty = false): string {
  if (typeof v !== 'string' || v.length > max || (!allowEmpty && !v.trim())) throw new HttpError(400, `${what} is missing or too long.`);
  return v;
}

function strList(v: unknown, what: string): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 30) throw new HttpError(400, `${what} must be a list of at most 30 answers.`);
  return v.map((x) => str(x, 300, what));
}

function question(v: unknown, kind: 'tossup' | 'bonus', where: string): MatchQuestion {
  const o = asObject(v, where);
  const id = str(o.id, MAX_ID_LENGTH, `${where}'s id`);
  const subject = o.subject;
  if (typeof subject !== 'string' || !SUBJECTS.has(subject)) throw new HttpError(400, `${where} has an unknown subject.`);
  const format = o.format === 'multiple_choice' ? 'multiple_choice' : o.format === 'short_answer' ? 'short_answer' : null;
  if (!format) throw new HttpError(400, `${where} needs a format.`);
  let choices: Record<Letter, string> | undefined;
  let answerLetter: Letter | undefined;
  if (format === 'multiple_choice') {
    const c = asObject(o.choices, `${where}'s choices`);
    choices = Object.fromEntries(LETTERS.map((l) => [l, str(c[l], 500, `${where}'s choice ${l}`)])) as Record<Letter, string>;
    if (o.answerLetter !== undefined) {
      answerLetter = LETTERS.find((l) => l === o.answerLetter);
      if (!answerLetter) throw new HttpError(400, `${where} has an answer letter that is not W, X, Y or Z.`);
    }
  }
  const answer = str(o.answer, 500, `${where}'s answer`, true);
  if (!answer.trim() && !answerLetter) throw new HttpError(400, `${where} has no answer, so it cannot be judged. Choose another round.`);
  return {
    id,
    kind,
    subject: subject as Subject,
    format,
    stem: str(o.stem, 3000, `${where}'s text`),
    ...(choices ? { choices } : {}),
    ...(answerLetter ? { answerLetter } : {}),
    answer,
    accept: strList(o.accept, `${where}'s accepted answers`),
    reject: strList(o.reject, `${where}'s rejected answers`),
    answerRaw: typeof o.answerRaw === 'string' && o.answerRaw.length <= 1000 ? o.answerRaw : answer,
    figure: o.figure === true,
  };
}

/** Checks the match a member asked for (POST /rooms with `match`). Messages reach the member's screen. */
export function parseMatchSetup(value: unknown): MatchSetup {
  const o = asObject(value, 'The match');
  const format = o.format === 'teams' || o.format === 'ffa' ? o.format : null;
  if (!format) throw new HttpError(400, 'Choose a match format: teams or ffa.');
  const presetId = typeof o.presetId === 'string' && PRESETS.some((p) => p.id === o.presetId) ? o.presetId : null;
  if (format === 'teams' && !presetId) throw new HttpError(400, 'Choose the rules for the match.');
  const wpm = o.wpm;
  if (typeof wpm !== 'number' || !Number.isFinite(wpm) || wpm < MIN_WPM || wpm > MAX_WPM) throw new HttpError(400, `Choose a reading speed of ${MIN_WPM} to ${MAX_WPM} words per minute.`);
  const names = Array.isArray(o.teamNames) ? o.teamNames : ['Team A', 'Team B'];
  const teamNames = [cleanLine(names[0], 40) ?? 'Team A', cleanLine(names[1], 40) ?? 'Team B'] as [string, string];
  const p = asObject(o.packet, 'The round');
  const packet = {
    setId: str(p.setId, MAX_ID_LENGTH, 'The set id'),
    setTitle: str(p.setTitle, 300, 'The set title'),
    roundId: str(p.roundId, MAX_ID_LENGTH, 'The round id'),
    roundLabel: str(p.roundLabel, 300, 'The round label'),
    ...(typeof p.sourceUrl === 'string' && p.sourceUrl.length <= 1000 && /^https:\/\//.test(p.sourceUrl) ? { sourceUrl: p.sourceUrl } : {}),
  };
  if (!Array.isArray(o.pairs) || o.pairs.length < 1 || o.pairs.length > MAX_MATCH_PAIRS) {
    throw new HttpError(400, `A match needs 1 to ${MAX_MATCH_PAIRS} toss-ups.`);
  }
  const pairs = o.pairs.map((raw, i) => {
    const pair = asObject(raw, `Pair ${i + 1}`);
    const tossup = question(pair.tossup, 'tossup', `Toss-up ${i + 1}`);
    const bonus = format === 'teams' && pair.bonus !== undefined && pair.bonus !== null ? question(pair.bonus, 'bonus', `Bonus ${i + 1}`) : undefined;
    return bonus ? { tossup, bonus } : { tossup };
  });
  const count = o.tossupCount === undefined ? pairs.length : o.tossupCount;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > pairs.length) {
    throw new HttpError(400, `Choose 1 to ${pairs.length} toss-ups.`);
  }
  return { format, presetId: presetId ?? PRESETS[0]!.id, wpm: Math.round(wpm), teamNames, packet, pairs, tossupCount: count };
}

export function newMatchData(setup: MatchSetup): MatchData {
  return {
    setup,
    status: 'lobby',
    paused: false,
    startedAt: null,
    finishedAt: null,
    players: [],
    events: [],
    ffa: null,
    q: null,
    halftimeAt: null,
    outbox: [],
    gameId: null,
    recorded: false,
  };
}

/* ---------------- the director ---------------- */

type Verdict = 'correct' | 'incorrect' | 'review';

function judge(q: MatchQuestion, text: string): Verdict {
  return judgeAnswer(q, text).verdict;
}

/** When the game clock runs out, if it is running. */
function clockExpiry(s: MatchState): number | null {
  const c = s.clock;
  if (!c || c.expired || c.runningSince === null || s.period === 'tiebreak') return null;
  if (s.phase === 'not_started' || s.phase === 'halftime' || s.phase === 'game_over') return null;
  return c.runningSince + c.remainingMs;
}

export class MatchDirector {
  private engine: MatchState | null = null;

  constructor(readonly data: MatchData) {
    if (data.setup.format === 'teams' && data.status !== 'lobby') this.engine = replay(this.config(), data.events);
  }

  private config(): MatchConfig {
    const team = (side: Side) => ({
      name: this.data.setup.teamNames[side === 'A' ? 0 : 1],
      playerIds: this.data.players.filter((p) => p.side === side).map((p) => p.playerId),
    });
    return { preset: getPreset(this.data.setup.presetId), teams: [team('A'), team('B')], pairCount: this.data.setup.pairs.length };
  }

  /* ---------------- control (the host) ---------------- */

  /** Starts the match with these players. Returns an error message, or null. */
  start(players: MatchPlayer[], now: number): string | null {
    const d = this.data;
    if (d.status !== 'lobby') return 'The match has already started.';
    if (d.setup.format === 'teams') {
      if (!players.some((p) => p.side === 'A') || !players.some((p) => p.side === 'B')) return 'Each side needs at least one player.';
      // Each side's captain answers its bonuses: the chosen one, or the first to join.
      d.players = players.map((p) => ({ ...p }));
      for (const side of ['A', 'B'] as const) {
        const mine = d.players.filter((p) => p.side === side);
        if (!mine.some((p) => p.captain)) mine[0]!.captain = true;
      }
    } else {
      if (players.length === 0) return 'Join the game first.';
      d.players = players.map((p) => ({ ...p, side: 'A' as const, captain: false }));
      d.ffa = { index: 0, scores: Object.fromEntries(d.players.map((p) => [p.memberId, { score: 0, correct: 0, negs: 0 }])) };
    }
    d.status = 'playing';
    d.startedAt = now;
    if (d.setup.format === 'teams') {
      this.engine = replay(this.config(), []);
      this.dispatch({ type: 'start' }, now);
      this.beginRead(0, 'tossup', now + LEAD_MS);
    } else {
      this.beginRead(0, 'tossup', now + LEAD_MS);
    }
    return null;
  }

  /** Pause before the next question. */
  pause(now: number): void {
    if (this.data.status !== 'playing') return;
    this.data.paused = true;
    this.pauseClockIfOver(now);
  }

  /** Go on: after a pause, or at halftime (without waiting out the break). */
  resume(now: number): void {
    const d = this.data;
    if (d.status !== 'playing') return;
    d.paused = false;
    const s = this.engine;
    if (s) {
      if (s.phase === 'halftime') d.halftimeAt = now - HALFTIME_MS;
      else if (s.clock && !s.clock.expired && s.clock.runningSince === null && s.period !== 'tiebreak') this.dispatch({ type: 'clock_resume' }, now);
      if (s.phase === 'question_over' && d.q?.overAt != null) d.q.overAt = Math.min(d.q.overAt, now - NEXT_DELAY_MS);
    } else if (d.q?.overAt != null) {
      d.q.overAt = Math.min(d.q.overAt, now - NEXT_DELAY_MS);
    }
    this.advance(now);
  }

  /** Ends the match now (the scores so far stand). */
  end(now: number): void {
    const d = this.data;
    if (d.status === 'finished') return;
    if (d.status === 'lobby') {
      d.status = 'finished';
      d.finishedAt = now;
      return;
    }
    if (this.engine && this.engine.phase !== 'game_over') this.dispatch({ type: 'end_game' }, now);
    this.finish(now, 'The host ended the match.');
  }

  /* ---------------- players ---------------- */

  player(memberId: string): MatchPlayer | undefined {
    return this.data.players.find((p) => p.memberId === memberId);
  }

  private nameOf(memberId: string): string {
    return this.player(memberId)?.name ?? 'Someone';
  }

  /** Who answers the bonus for `side` (its captain). */
  captainOf(side: Side): MatchPlayer | undefined {
    return this.data.players.find((p) => p.side === side && p.captain) ?? this.data.players.find((p) => p.side === side);
  }

  /** The side playing the current bonus, if any. */
  bonusSide(): Side | null {
    const s = this.engine;
    if (!s?.bonus || (s.phase !== 'bonus_reading' && s.phase !== 'bonus_open')) return null;
    return s.bonus.team === 0 ? 'A' : 'B';
  }

  /** Members who may rule on the current close call. */
  deciders(): string[] {
    const r = this.data.q?.review;
    if (!r) return [];
    if (this.data.setup.format === 'ffa') return this.data.players.filter((p) => p.memberId !== r.memberId).map((p) => p.memberId);
    const side = this.player(r.memberId)?.side;
    return this.data.players.filter((p) => p.side !== side).map((p) => p.memberId);
  }

  /* ---------------- time ---------------- */

  /** The next moment something happens on its own (a reading ends, time runs out...), or null. */
  nextDue(): number | null {
    if (this.data.status !== 'playing') return null;
    return this.engine ? this.teamsDue() : this.ffaDue();
  }

  /** Applies everything due up to `now`, in order. */
  advance(now: number): void {
    for (let i = 0; i < 200; i++) {
      const due = this.nextDue();
      if (due === null || due > now) return;
      if (this.engine) this.teamsStep(due);
      else this.ffaStep(due);
    }
  }

  /* ---------------- buzzers ---------------- */

  /** The buzzers the room should have open now: which sides, and who may not buzz again. */
  buzzers(): { open: boolean; sides: { A: boolean; B: boolean }; exclude: string[] } {
    const closed = { open: false, sides: { A: false, B: false }, exclude: [] as string[] };
    const d = this.data;
    const q = d.q;
    if (d.status !== 'playing' || !q || q.answering || q.review) return closed;
    if (this.engine) {
      const s = this.engine;
      const reading = s.phase === 'tossup_reading' && q.reading.started && q.reading.pausedAt === null;
      if (!reading && s.phase !== 'tossup_open') return closed;
      const sides = { A: !!s.tossup?.eligible[0], B: !!s.tossup?.eligible[1] };
      return { open: sides.A || sides.B, sides, exclude: [] };
    }
    if (q.overAt !== null || !q.reading.started || q.reading.pausedAt !== null) return closed;
    return { open: true, sides: { A: true, B: true }, exclude: [...q.buzzed] };
  }

  /** The room picked `memberId`'s buzz, pressed at `pressedAt`. Returns an error message, or null. */
  buzz(memberId: string, pressedAt: number, now: number): string | null {
    this.advance(Math.min(pressedAt, now));
    const err = this.engine ? this.teamsBuzz(memberId, pressedAt, now) : this.ffaBuzz(memberId, pressedAt, now);
    this.advance(now);
    return err;
  }

  /* ---------------- answers and rulings ---------------- */

  /**
   * A typed answer. `mayAnswerBonus` says whether this member may give their side's bonus answer (the captain, or
   * anyone on the side when the captain is not connected). Returns an error message, or null.
   */
  answer(memberId: string, text: string, now: number, mayAnswerBonus: (memberId: string) => boolean): string | null {
    this.advance(now);
    const d = this.data;
    const q = d.q;
    if (d.status !== 'playing' || !q) return 'There is nothing to answer right now.';
    if (q.review) return 'A close call is being decided.';
    const response = text.trim();
    if (!response) return 'Type an answer first.';
    return this.engine ? this.teamsAnswer(memberId, response, now, mayAnswerBonus) : this.ffaAnswer(memberId, response, now);
  }

  /** An opponent rules on a close call. */
  ruling(memberId: string, accept: boolean, now: number): string | null {
    this.advance(now);
    const r = this.data.q?.review;
    if (!r) return 'There is no close call to decide.';
    if (!this.deciders().includes(memberId)) return this.engine ? 'The other side decides this close call.' : "You can't rule on your own answer.";
    this.resolveReview(accept, now, `${this.nameOf(memberId)} ${accept ? 'accepted' : 'rejected'} it.`);
    return null;
  }

  /** Nobody who may rule is connected: the close call is accepted at once. */
  acceptUnopposed(now: number): void {
    if (this.data.q?.review) this.resolveReview(true, now, 'Nobody on the other side is here to rule, so it counts.');
  }

  /* ---------------- team matches ---------------- */

  private dispatch(input: EventInput, t: number): void {
    const last = this.data.events.length ? this.data.events[this.data.events.length - 1]!.t : 0;
    const event = { ...input, t: Math.max(t, last) } as MatchEvent;
    this.engine = applyEvent(this.engine!, event);
    this.data.events.push(event);
  }

  private teamsPhaseDue(): number | null {
    const s = this.engine!;
    const q = this.data.q;
    switch (s.phase) {
      case 'tossup_reading':
      case 'bonus_reading': {
        const r = q?.reading;
        if (!r) return null;
        if (!r.started) return r.startedAt;
        return r.pausedAt === null ? r.startedAt + r.durationMs : null;
      }
      case 'tossup_open': {
        const w = currentWindow(s);
        return w ? w.openedAt + w.seconds * 1000 : null;
      }
      case 'tossup_answering':
        return q?.review?.deadline ?? q?.answering?.deadline ?? null;
      case 'bonus_open': {
        if (q?.review) return q.review.deadline;
        const w = currentWindow(s);
        return w ? w.openedAt + w.seconds * 1000 + BONUS_GRACE_MS : null;
      }
      case 'question_over':
        return this.data.paused || q?.overAt == null ? null : q.overAt + NEXT_DELAY_MS;
      case 'halftime':
        return this.data.paused || this.data.halftimeAt === null ? null : this.data.halftimeAt + HALFTIME_MS;
      default:
        return null;
    }
  }

  private teamsDue(): number | null {
    const phase = this.teamsPhaseDue();
    const expiry = clockExpiry(this.engine!);
    if (phase === null) return expiry;
    return expiry === null ? phase : Math.min(phase, expiry);
  }

  private teamsStep(t: number): void {
    const s = this.engine!;
    const expiry = clockExpiry(s);
    const phaseDue = this.teamsPhaseDue();
    if (expiry !== null && expiry <= t && (phaseDue === null || expiry <= phaseDue)) {
      // Rule 5-6: a toss-up already begun is finished, with its bonus; the half ends after it.
      this.dispatch({ type: 'time_expired' }, expiry);
      if (this.data.q) this.data.q.status = `${this.data.q.status} Time is up in this half: this question finishes.`.trim();
      return;
    }
    const q = this.data.q;
    switch (s.phase) {
      case 'tossup_reading':
      case 'bonus_reading': {
        const r = q!.reading;
        if (!r.started) {
          r.started = true;
          return;
        }
        if (s.phase === 'tossup_reading') this.dispatch({ type: 'tossup_read' }, t);
        else this.dispatch({ type: 'bonus_read', ...(this.currentQuestion()?.figure ? { visual: true } : {}) }, t);
        return;
      }
      case 'tossup_open':
        this.dispatch({ type: 'tossup_dead' }, t);
        this.questionOver(t, 'Time: nobody answered.');
        return;
      case 'tossup_answering':
        if (q?.review) return this.resolveReview(true, t, 'No ruling in time, so it counts.');
        this.judgeTossup('stall', t, `${this.nameOf(q!.answering!.memberId)} ran out of time to answer.`);
        return;
      case 'bonus_open':
        if (q?.review) return this.resolveReview(true, t, 'No ruling in time, so it counts.');
        this.dispatch({ type: 'bonus_judged', result: 'timeout' }, t);
        this.questionOver(t, 'Time: no answer to the bonus.');
        return;
      case 'question_over':
        this.dispatch({ type: 'next' }, t);
        this.afterNext(t);
        return;
      case 'halftime':
        this.dispatch({ type: 'start_half' }, t);
        this.afterNext(t);
        return;
    }
  }

  /** After `next` or `start_half`: the next toss-up, halftime or the end. */
  private afterNext(t: number): void {
    const s = this.engine!;
    if (s.phase === 'tossup_reading') this.beginRead(s.pairIndex, 'tossup', t + LEAD_MS);
    else if (s.phase === 'halftime') {
      this.data.halftimeAt = t;
      this.data.q = null;
    } else if (s.phase === 'game_over') this.finish(t, null);
  }

  private teamsBuzz(memberId: string, pressedAt: number, now: number): string | null {
    const s = this.engine!;
    const q = this.data.q;
    const player = this.player(memberId);
    if (!player) return 'You are not playing in this match.';
    if (!q || !((s.phase === 'tossup_reading' && q.reading.started && q.reading.pausedAt === null) || s.phase === 'tossup_open')) return 'Buzzers are closed.';
    const team: TeamIdx = player.side === 'A' ? 0 : 1;
    if (!s.tossup?.eligible[team]) return 'Your side has had its chance at this toss-up.';
    this.dispatch({ type: 'buzz', team, playerId: player.playerId }, pressedAt);
    const buzz = this.engine!.tossup!.buzz!;
    if (buzz.interrupt) q.reading.pausedAt = Math.max(q.reading.startedAt, Math.min(buzz.t, q.reading.startedAt + q.reading.durationMs));
    q.answering = { memberId, deadline: now + TOSSUP_ANSWER_MS, pressedAt: buzz.t, interrupt: buzz.interrupt, latencyMs: null };
    q.status = `${player.name} buzzed${buzz.interrupt ? ' (interrupt)' : ''}.`;
    return null;
  }

  private teamsAnswer(memberId: string, response: string, now: number, mayAnswerBonus: (memberId: string) => boolean): string | null {
    const s = this.engine!;
    const q = this.data.q!;
    if (s.phase === 'tossup_answering') {
      if (q.answering?.memberId !== memberId) return "It isn't your turn to answer.";
      const verdict = judge(this.currentQuestion()!, response);
      if (verdict === 'review') return this.startReview(memberId, response, now);
      return this.judgeTossup(verdict, now, `${this.nameOf(memberId)}: “${response}”. ${verdict === 'correct' ? 'Correct.' : 'Not correct.'}`);
    }
    if (s.phase === 'bonus_reading' || s.phase === 'bonus_open') {
      const player = this.player(memberId);
      if (!player || player.side !== this.bonusSide()) return 'Only the team playing the bonus answers it.';
      if (!mayAnswerBonus(memberId)) return "Your captain gives the team's answer.";
      if (s.phase === 'bonus_reading') return 'Wait until the whole bonus has been read.';
      q.answering = { memberId, deadline: now, pressedAt: now, interrupt: false, latencyMs: null };
      const verdict = judge(this.currentQuestion()!, response);
      if (verdict === 'review') return this.startReview(memberId, response, now);
      this.dispatch({ type: 'bonus_judged', result: verdict }, now);
      this.questionOver(now, `${player.name}: “${response}”. ${verdict === 'correct' ? `Correct: ${getPreset(this.data.setup.presetId).points.bonus} points.` : 'Not correct.'}`);
      return null;
    }
    return 'There is nothing to answer right now.';
  }

  /** Judges the toss-up being answered. `end` stops it there (a rejected close call: everyone saw the answer). */
  private judgeTossup(result: 'correct' | 'incorrect' | 'stall', t: number, status: string, end = false): null {
    this.dispatch({ type: 'tossup_judged', result }, t);
    const q = this.data.q!;
    q.answering = null;
    q.review = null;
    const s = this.engine!;
    if (end && s.phase !== 'question_over') {
      if (s.phase === 'tossup_reading') this.dispatch({ type: 'tossup_read' }, t);
      if (this.engine!.phase === 'tossup_open') this.dispatch({ type: 'tossup_dead' }, t);
      this.questionOver(t, `${status} Nobody else may answer this one.`);
      return null;
    }
    switch (this.engine!.phase) {
      case 'bonus_reading': {
        const pair = this.data.setup.pairs[q.pairIndex]!;
        if (!pair.bonus) {
          this.dispatch({ type: 'throw_out', note: 'This round has no bonus here.' }, t);
          this.questionOver(t, status);
          return null;
        }
        const previous = { label: `Toss-up ${q.pairIndex + 1}`, answer: pair.tossup.answerRaw };
        this.beginRead(q.pairIndex, 'bonus', t + BONUS_LEAD_MS);
        this.data.q!.previous = previous;
        this.data.q!.status = `${status} A bonus for ${this.data.setup.teamNames[this.engine!.bonus!.team]}.`;
        return null;
      }
      case 'tossup_reading':
        // An interrupt fault: the toss-up is read again in full for the other side (Rule 6-2).
        this.beginRead(q.pairIndex, 'tossup', t + REREAD_LEAD_MS);
        this.data.q!.status = `${status} It is read again for ${this.otherTeamName()}.`;
        return null;
      case 'tossup_open':
        q.status = `${status} ${this.otherTeamName()} may buzz.`;
        return null;
      default:
        this.questionOver(t, status);
        return null;
    }
  }

  private otherTeamName(): string {
    const eligible = this.engine!.tossup?.eligible;
    const idx = eligible?.[0] ? 0 : 1;
    return this.data.setup.teamNames[idx];
  }

  /* ---------------- free-for-all ---------------- */

  private ffaQuestionCount(): number {
    return Math.min(this.data.setup.tossupCount, this.data.setup.pairs.length);
  }

  private ffaDue(): number | null {
    const q = this.data.q;
    if (!q) return null;
    if (q.overAt !== null) return this.data.paused ? null : q.overAt + NEXT_DELAY_MS;
    if (q.review) return q.review.deadline;
    if (q.answering) return q.answering.deadline;
    const r = q.reading;
    if (!r.started) return r.startedAt;
    if (r.pausedAt !== null) return r.resumeAt;
    if (q.windowEndsAt !== null) return q.windowEndsAt;
    return r.startedAt + r.durationMs;
  }

  private ffaStep(t: number): void {
    const q = this.data.q!;
    if (q.overAt !== null) return this.ffaNext(t);
    if (q.review) return this.resolveReview(true, t, 'No ruling in time, so it counts.');
    if (q.answering) return this.ffaJudge(false, t, `${this.nameOf(q.answering.memberId)} ran out of time to answer.`);
    const r = q.reading;
    if (!r.started) {
      r.started = true;
      return;
    }
    if (r.pausedAt !== null) {
      // Go on reading from where it stopped.
      r.startedAt += t - r.pausedAt;
      r.pausedAt = null;
      r.resumeAt = null;
      return;
    }
    if (q.windowEndsAt !== null) return this.ffaOver(t, q.buzzed.length ? 'Time: nobody else answered.' : 'Time: nobody answered.');
    q.windowEndsAt = t + FFA_WINDOW_MS;
  }

  private ffaBuzz(memberId: string, pressedAt: number, now: number): string | null {
    const q = this.data.q;
    if (!this.player(memberId)) return 'Join the game to buzz.';
    if (!q || q.overAt !== null || q.answering || q.review || !q.reading.started || q.reading.pausedAt !== null) return 'Buzzers are closed.';
    if (q.buzzed.includes(memberId)) return 'You already buzzed on this toss-up.';
    q.buzzed.push(memberId);
    const r = q.reading;
    const readEnd = r.startedAt + r.durationMs;
    const interrupt = q.windowEndsAt === null && pressedAt < readEnd;
    if (interrupt) r.pausedAt = Math.max(r.startedAt, pressedAt);
    q.answering = { memberId, deadline: now + TOSSUP_ANSWER_MS, pressedAt, interrupt, latencyMs: interrupt ? null : Math.max(0, pressedAt - readEnd) };
    q.status = `${this.nameOf(memberId)} buzzed${interrupt ? ' (interrupt)' : ''}.`;
    return null;
  }

  private ffaAnswer(memberId: string, response: string, now: number): string | null {
    const q = this.data.q!;
    if (!q.answering || q.answering.memberId !== memberId) return "It isn't your turn to answer.";
    const verdict = judge(this.currentQuestion()!, response);
    if (verdict === 'review') return this.startReview(memberId, response, now);
    this.ffaJudge(verdict === 'correct', now, `${this.nameOf(memberId)}: “${response}”.`);
    return null;
  }

  /** Scores the answer being given. `end` stops the toss-up there (a rejected close call). */
  private ffaJudge(correct: boolean, t: number, status: string, end = false): void {
    const d = this.data;
    const q = d.q!;
    const a = q.answering!;
    const score = d.ffa!.scores[a.memberId]!;
    const player = this.player(a.memberId)!;
    const tossup = this.currentQuestion()!;
    d.outbox.push({ memberId: a.memberId, playerId: player.playerId, questionId: tossup.id, subject: tossup.subject, kind: 'tossup', correct, interrupt: a.interrupt, latencyMs: a.latencyMs, t });
    q.answering = null;
    q.review = null;
    if (correct) {
      score.score += FFA_POINTS.correct;
      score.correct += 1;
      this.ffaOver(t, `${status} Correct: +${FFA_POINTS.correct}.`);
      return;
    }
    if (a.interrupt) {
      score.score += FFA_POINTS.wrongInterrupt;
      score.negs += 1;
    }
    const lost = a.interrupt ? ` ${FFA_POINTS.wrongInterrupt} for a wrong interrupt.` : ' Not correct.';
    if (end) return this.ffaOver(t, `${status}${lost} Nobody else may answer this one.`);
    if (d.players.every((p) => q.buzzed.includes(p.memberId))) return this.ffaOver(t, `${status}${lost}`);
    const r = q.reading;
    if (r.pausedAt !== null) {
      r.resumeAt = t + RESUME_LEAD_MS;
      q.status = `${status}${lost} The reading goes on.`;
    } else {
      q.windowEndsAt = t + FFA_WINDOW_MS;
      q.status = `${status}${lost} Anyone else may buzz.`;
    }
  }

  private ffaOver(t: number, status: string): void {
    const q = this.data.q!;
    q.overAt = t;
    q.status = status;
    q.windowEndsAt = null;
  }

  private ffaNext(t: number): void {
    const f = this.data.ffa!;
    f.index += 1;
    if (f.index >= this.ffaQuestionCount()) return this.finish(t, null);
    this.beginRead(f.index, 'tossup', t + LEAD_MS);
  }

  /* ---------------- shared ---------------- */

  private currentQuestion(): MatchQuestion | null {
    const q = this.data.q;
    if (!q) return null;
    const pair = this.data.setup.pairs[q.pairIndex];
    if (!pair) return null;
    return q.part === 'tossup' ? pair.tossup : (pair.bonus ?? null);
  }

  private beginRead(pairIndex: number, part: 'tossup' | 'bonus', startAt: number): void {
    const pair = this.data.setup.pairs[pairIndex]!;
    const question = part === 'tossup' ? pair.tossup : pair.bonus!;
    this.data.q = {
      pairIndex,
      part,
      reading: { startedAt: startAt, durationMs: readingDurationMs(buildReading(question), this.data.setup.wpm), started: false, pausedAt: null, resumeAt: null },
      windowEndsAt: null,
      answering: null,
      review: null,
      buzzed: [],
      overAt: null,
      status: '',
      previous: null,
    };
  }

  private startReview(memberId: string, response: string, now: number): null {
    const q = this.data.q!;
    q.review = { memberId, response, deadline: now + REVIEW_MS };
    const who = this.engine ? `${this.otherSideName(memberId)} decides` : 'the other players decide';
    q.status = `${this.nameOf(memberId)}: “${response}”. A close call: ${who} whether it matches.`;
    return null;
  }

  private otherSideName(memberId: string): string {
    return this.data.setup.teamNames[this.player(memberId)?.side === 'A' ? 1 : 0];
  }

  private resolveReview(accept: boolean, t: number, note: string): void {
    const q = this.data.q!;
    const r = q.review!;
    const status = `${this.nameOf(r.memberId)}: “${r.response}”. ${note}`;
    if (!this.engine) {
      this.ffaJudge(accept, t, status, !accept);
      return;
    }
    if (q.part === 'tossup') {
      this.judgeTossup(accept ? 'correct' : 'incorrect', t, `${status} ${accept ? 'Correct.' : 'Not correct.'}`, !accept);
      return;
    }
    q.review = null;
    this.dispatch({ type: 'bonus_judged', result: accept ? 'correct' : 'incorrect' }, t);
    this.questionOver(t, `${status} ${accept ? 'Correct.' : 'Not correct.'}`);
  }

  private questionOver(t: number, status: string): void {
    const q = this.data.q;
    if (q) {
      q.overAt = t;
      q.status = status;
      q.answering = null;
      q.review = null;
    }
    this.pauseClockIfOver(t);
  }

  /** While paused, the game clock stops between questions. */
  private pauseClockIfOver(t: number): void {
    const s = this.engine;
    if (!this.data.paused || !s || s.phase !== 'question_over') return;
    if (s.clock && !s.clock.expired && s.clock.runningSince !== null && s.period !== 'tiebreak') this.dispatch({ type: 'clock_pause' }, t);
  }

  private finish(t: number, status: string | null): void {
    const d = this.data;
    d.status = 'finished';
    d.finishedAt = t;
    if (d.q) {
      d.q.overAt ??= t;
      d.q.answering = null;
      d.q.review = null;
      if (status) d.q.status = status;
    }
  }

  /** The finished team match as a game record (null for a free-for-all, or before the end). */
  gameRecord(id: string): OnlineGameRecord | null {
    const d = this.data;
    if (!this.engine || d.status !== 'finished' || d.startedAt === null) return null;
    const config = this.config();
    return {
      id,
      createdAt: new Date(d.startedAt).toISOString(),
      updatedAt: new Date(d.finishedAt ?? d.startedAt).toISOString(),
      presetId: d.setup.presetId,
      packet: d.setup.packet,
      pairs: d.setup.pairs.map((p) => ({ tossupId: p.tossup.id, ...(p.bonus ? { bonusId: p.bonus.id } : {}), subject: p.tossup.subject })),
      teams: [
        { name: config.teams[0].name, playerIds: config.teams[0].playerIds },
        { name: config.teams[1].name, playerIds: config.teams[1].playerIds },
      ],
      events: d.events,
      status: 'finished',
      finalScores: [...this.engine.scores] as [number, number],
      format: 'game',
      online: true,
    };
  }

  /** The questions heard so far, for the "seen" ledger. */
  heardQuestionIds(): string[] {
    const d = this.data;
    if (this.engine) {
      const ids: string[] = [];
      for (const i of this.engine.readTossups) ids.push(d.setup.pairs[i]!.tossup.id);
      for (const i of this.engine.readBonuses) if (d.setup.pairs[i]?.bonus) ids.push(d.setup.pairs[i]!.bonus!.id);
      return ids;
    }
    const last = d.ffa ? Math.min(d.ffa.index, this.ffaQuestionCount() - 1) : -1;
    return d.setup.pairs.slice(0, last + 1).map((p) => p.tossup.id);
  }

  /* ---------------- the players' view ---------------- */

  view(): MatchView {
    const d = this.data;
    const s = this.engine;
    const q = d.q;
    const question = this.currentQuestion();
    const scores: [number, number] = s ? [...s.scores] as [number, number] : [0, 0];
    const match: MatchView['match'] = { format: d.setup.format, status: d.status, paused: d.paused };
    if (d.setup.format === 'ffa') {
      match.progress = { n: Math.min((d.ffa?.index ?? 0) + 1, this.ffaQuestionCount()), of: this.ffaQuestionCount() };
      match.standings = d.players
        .map((p) => ({ memberId: p.memberId, name: p.name, ...(d.ffa?.scores[p.memberId] ?? { score: 0, correct: 0, negs: 0 }) }))
        .sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name));
    } else {
      match.progress = { n: Math.max(1, (s?.pairIndex ?? 0) + 1), of: d.setup.pairs.length };
      if (s?.clock) match.clock = { remainingMs: s.clock.remainingMs, runningSince: s.clock.runningSince };
    }
    if (d.gameId) match.gameId = d.gameId;
    const view: MatchView = { phase: s?.phase ?? (d.status === 'playing' ? 'ffa' : d.status), label: '', teams: d.setup.teamNames, scores, match };

    if (d.status === 'lobby') {
      view.label = d.setup.format === 'teams' ? 'Waiting for the host to start the match' : 'Waiting for the host to start the game';
      return view;
    }
    if (s?.phase === 'halftime') {
      view.label = 'Halftime';
      view.status = d.paused ? 'Paused. The host will start the second half.' : 'The second half starts in a minute (the host can start it sooner).';
      return view;
    }
    if (q && question) {
      const n = q.pairIndex + 1;
      view.label = q.part === 'bonus' ? `Bonus ${n}` : d.setup.format === 'ffa' ? `Toss-up ${n} of ${this.ffaQuestionCount()}` : `Toss-up ${n}`;
      view.subject = SUBJECT_LABELS[question.subject] ?? question.subject;
      view.questionId = question.id;
      const over = q.overAt !== null || d.status === 'finished';
      if (q.reading.started || over) {
        view.text = buildReading(question).text;
        // A reading still going, or stopped for an interrupt, is revealed in step; otherwise the whole text shows.
        if (!over && (q.reading.pausedAt !== null || this.readingRunning())) {
          view.reading = { startedAt: q.reading.startedAt, wpm: d.setup.wpm, ...(q.reading.pausedAt !== null ? { pausedAt: q.reading.pausedAt } : {}) };
        }
        if (question.figure) view.figure = { questionId: question.id };
      }
      if (over || q.review) view.answer = question.answerRaw;
      if (q.status) view.status = q.status;
      if (q.previous && !over) match.previous = q.previous;
      if (!over && q.answering && !q.review) {
        match.answering = { memberId: q.answering.memberId, name: this.nameOf(q.answering.memberId), deadline: q.answering.deadline, kind: q.part };
      }
      if (q.review) {
        const side = this.player(q.review.memberId)?.side ?? 'A';
        match.review = {
          memberId: q.review.memberId,
          name: this.nameOf(q.review.memberId),
          response: q.review.response,
          deadline: q.review.deadline,
          deciders: this.engine ? (side === 'A' ? 'B' : 'A') : 'others',
        };
      }
      if (s) {
        const w = currentWindow(s);
        if (w && !q.review) view.window = { openedAt: w.openedAt, seconds: w.seconds };
        if (s.bonus && (s.phase === 'bonus_reading' || s.phase === 'bonus_open' || (s.phase === 'question_over' && q.part === 'bonus'))) view.bonusTeam = s.bonus.team;
      } else if (q.windowEndsAt !== null && !q.answering && !q.review) {
        view.window = { openedAt: q.windowEndsAt - FFA_WINDOW_MS, seconds: FFA_WINDOW_MS / 1000 };
      }
    }
    if (d.status === 'finished') {
      view.label = 'Final';
      view.phase = 'game_over';
      const final = s ? `Final: ${d.setup.teamNames[0]} ${scores[0]}, ${d.setup.teamNames[1]} ${scores[1]}.` : 'Final standings.';
      view.status = q?.status ? `${q.status} ${final}` : final;
    }
    return view;
  }

  /** Whether the reading is under way (begun, not yet finished). */
  private readingRunning(): boolean {
    const q = this.data.q;
    if (!q || !q.reading.started) return false;
    if (this.engine) return this.engine.phase === 'tossup_reading' || this.engine.phase === 'bonus_reading';
    return q.windowEndsAt === null && !q.answering;
  }
}
