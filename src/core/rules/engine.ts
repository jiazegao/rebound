/**
 * The match engine: a pure, event-sourced state machine for one Science Bowl game.
 *
 * The Reader console records what happens as events ("toss-up read", "player buzzed",
 * "judged incorrect", ...). `replay(config, events)` rebuilds the game state from those
 * events, so undo is simply "drop the last event and replay", and the event list itself
 * is the permanent record of the game.
 *
 * Rule numbers refer to the 2027 NSB Competition Rules.
 */
import { visualBonusTiming, type RulesPreset } from './presets';

export type TeamIdx = 0 | 1;
export type TossupFault = 'incorrect' | 'blurt' | 'stall' | 'communication';
export type TossupResult = 'correct' | TossupFault;
export type BonusResult = 'correct' | 'incorrect' | 'timeout';

export interface MatchTeam {
  name: string;
  /** Up to four active players (Rule 8-1). */
  playerIds: string[];
}

export interface MatchConfig {
  preset: RulesPreset;
  teams: [MatchTeam, MatchTeam];
  /** Number of toss-up/bonus pairs available in the packet. */
  pairCount: number;
  /**
   * A tiebreaker drill: the game starts as a 5-toss-up tiebreaker (Rule 6-4) from 0–0, with no bonuses and
   * no game clock, and goes on in series of 5 until one team leads.
   */
  tiebreakOnly?: boolean;
}

export type MatchEvent =
  | { type: 'start'; t: number }
  /** The reader finished reading the toss-up, including all four choices (Rule 5-2). */
  | { type: 'tossup_read'; t: number }
  | { type: 'buzz'; t: number; team: TeamIdx; playerId: string }
  | { type: 'tossup_judged'; t: number; result: TossupResult }
  /** The answer window ran out with no (further) buzz. */
  | { type: 'tossup_dead'; t: number }
  /**
   * The reader finished reading the bonus, including all four choices (Rule 5-4). `visual` marks a visual
   * bonus, which gets the longer visual window (30 s at the Finals, Rules 5-4 and 5-5).
   */
  | { type: 'bonus_read'; t: number; visual?: boolean }
  | { type: 'bonus_judged'; t: number; result: BonusResult }
  | { type: 'next'; t: number }
  /** Discard the current question (moderator error, broken question...). */
  | { type: 'throw_out'; t: number; note?: string }
  | { type: 'clock_pause'; t: number }
  | { type: 'clock_resume'; t: number }
  | { type: 'time_expired'; t: number }
  | { type: 'start_half'; t: number }
  /** Substitutions happen only at the start of a half or tiebreaker (Rule 8-1). */
  | { type: 'set_lineup'; t: number; team: TeamIdx; playerIds: string[] }
  | { type: 'start_tiebreak'; t: number }
  /** Manual score correction, e.g. after a successful challenge. */
  | { type: 'adjust_score'; t: number; team: TeamIdx; delta: number; note: string }
  | { type: 'end_game'; t: number };

export type MatchEventType = MatchEvent['type'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A MatchEvent without its timestamp, for code that stamps the time when dispatching. */
export type EventInput = DistributiveOmit<MatchEvent, 't'>;

export type Phase =
  | 'not_started'
  /** The toss-up is being read (first reading, or a full re-read for the other team). */
  | 'tossup_reading'
  /** Reading finished; the answer window is open. */
  | 'tossup_open'
  /** A player buzzed and is answering. */
  | 'tossup_answering'
  | 'bonus_reading'
  | 'bonus_open'
  | 'question_over'
  | 'halftime'
  | 'game_over';

export type Period = 1 | 2 | 'tiebreak';

export interface Buzz {
  team: TeamIdx;
  playerId: string;
  t: number;
  /** True when the player buzzed before the reading was complete (Rule 6-2). */
  interrupt: boolean;
}

export interface TossupState {
  pairIndex: number;
  eligible: [boolean, boolean];
  readComplete: boolean;
  /** True while the toss-up is being re-read for the other team after an interrupt fault. */
  reread: boolean;
  windowOpenedAt: number | null;
  windowKind: 'initial' | 'rebound' | null;
  buzz: Buzz | null;
  winner: TeamIdx | null;
}

export interface BonusState {
  team: TeamIdx;
  pairIndex: number;
  readComplete: boolean;
  windowOpenedAt: number | null;
  /** A visual bonus (longer answer window). */
  visual?: boolean;
}

export interface ClockState {
  halfMs: number;
  /** Time left when the clock was last paused or started. */
  remainingMs: number;
  /** Timestamp the clock was last started, or null while paused. */
  runningSince: number | null;
  expired: boolean;
}

export type LogEntry =
  | {
      kind: 'tossup';
      pairIndex: number;
      period: Period;
      team: TeamIdx;
      playerId: string;
      result: TossupResult;
      interrupt: boolean;
      reread: boolean;
      /** Milliseconds from the end of the reading (or of the previous answer) to the buzz; null for interrupts. */
      latencyMs: number | null;
      /** Points this attempt added to each team. */
      points: [number, number];
      t: number;
    }
  | { kind: 'tossup_dead'; pairIndex: number; period: Period; t: number }
  | { kind: 'bonus'; pairIndex: number; period: Period; team: TeamIdx; result: BonusResult; points: [number, number]; t: number }
  | { kind: 'throw_out'; pairIndex: number; period: Period; part: 'tossup' | 'bonus'; note?: string; t: number }
  | { kind: 'adjust'; team: TeamIdx; delta: number; note: string; t: number };

export type EndReason = 'time' | 'packet' | 'limit' | 'manual' | 'tiebreak';

export interface MatchState {
  config: MatchConfig;
  phase: Phase;
  period: Period;
  scores: [number, number];
  /** Index of the current (or most recent) pair in the packet; -1 before the game starts. */
  pairIndex: number;
  /** Toss-ups begun in regulation play (for the virtual 18-toss-up limit). */
  tossupsBegun: number;
  /** Toss-ups begun in the current tiebreaker series. */
  tiebreakBegun: number;
  tossup: TossupState | null;
  bonus: BonusState | null;
  clock: ClockState | null;
  lineups: [string[], string[]];
  log: LogEntry[];
  /** Packet positions whose toss-up / bonus was read aloud, for the "seen" ledger. */
  readTossups: number[];
  readBonuses: number[];
  endedReason: EndReason | null;
}

export class RuleError extends Error {}

const other = (team: TeamIdx): TeamIdx => (team === 0 ? 1 : 0);

export function createMatch(config: MatchConfig): MatchState {
  return {
    config,
    phase: 'not_started',
    period: 1,
    scores: [0, 0],
    pairIndex: -1,
    tossupsBegun: 0,
    tiebreakBegun: 0,
    tossup: null,
    bonus: null,
    clock: null,
    lineups: [[...config.teams[0].playerIds], [...config.teams[1].playerIds]],
    log: [],
    readTossups: [],
    readBonuses: [],
    endedReason: null,
  };
}

export function replay(config: MatchConfig, events: MatchEvent[]): MatchState {
  return events.reduce(applyEvent, createMatch(config));
}

/** Milliseconds left on the game clock at time `now`, or null for untimed games. */
export function clockRemainingMs(state: MatchState, now: number): number | null {
  const clock = state.clock;
  if (!clock) return null;
  if (clock.expired) return 0;
  if (clock.runningSince === null) return clock.remainingMs;
  return Math.max(0, clock.remainingMs - (now - clock.runningSince));
}

/** The answer window currently running, for countdown displays. */
export function currentWindow(state: MatchState): { kind: 'tossup' | 'rebound' | 'bonus'; openedAt: number; seconds: number; warningAt?: number } | null {
  const timing = state.config.preset.timing;
  if (state.phase === 'tossup_open' && state.tossup?.windowOpenedAt != null) {
    const rebound = state.tossup.windowKind === 'rebound';
    return {
      kind: rebound ? 'rebound' : 'tossup',
      openedAt: state.tossup.windowOpenedAt,
      seconds: rebound ? timing.reboundWindowSec : timing.tossupWindowSec,
    };
  }
  if (state.phase === 'bonus_open' && state.bonus?.windowOpenedAt != null) {
    if (state.bonus.visual) {
      const v = visualBonusTiming(state.config.preset);
      return { kind: 'bonus', openedAt: state.bonus.windowOpenedAt, seconds: v.sec, warningAt: v.warningAtSec };
    }
    return { kind: 'bonus', openedAt: state.bonus.windowOpenedAt, seconds: timing.bonusSec, warningAt: timing.bonusWarningAtSec };
  }
  return null;
}

/** Which event types are valid right now. The Reader console only offers these. */
export function allowedEvents(state: MatchState): Set<MatchEventType> {
  const allowed = new Set<MatchEventType>();
  const p = state.phase;
  const timed = state.clock !== null && !state.clock.expired && state.period !== 'tiebreak';
  if (p === 'not_started') {
    allowed.add('start');
    allowed.add('set_lineup');
    return allowed;
  }
  if (p === 'game_over') {
    if (state.scores[0] === state.scores[1] && hasNextPair(state)) {
      allowed.add('start_tiebreak');
      allowed.add('set_lineup');
    }
    allowed.add('adjust_score');
    return allowed;
  }
  if (p === 'halftime') {
    allowed.add('start_half');
    allowed.add('set_lineup');
    allowed.add('adjust_score');
    allowed.add('end_game');
    return allowed;
  }
  allowed.add('adjust_score');
  allowed.add('end_game');
  if (timed) {
    allowed.add('time_expired');
    allowed.add(state.clock!.runningSince === null ? 'clock_resume' : 'clock_pause');
  }
  switch (p) {
    case 'tossup_reading':
      allowed.add('tossup_read');
      allowed.add('buzz');
      allowed.add('throw_out');
      break;
    case 'tossup_open':
      allowed.add('buzz');
      allowed.add('tossup_dead');
      allowed.add('throw_out');
      break;
    case 'tossup_answering':
      allowed.add('tossup_judged');
      allowed.add('throw_out');
      break;
    case 'bonus_reading':
      allowed.add('bonus_read');
      allowed.add('throw_out');
      break;
    case 'bonus_open':
      allowed.add('bonus_judged');
      allowed.add('throw_out');
      break;
    case 'question_over':
      allowed.add('next');
      break;
  }
  return allowed;
}

function hasNextPair(state: MatchState): boolean {
  return state.pairIndex + 1 < state.config.pairCount;
}

function beginTossup(s: MatchState, pairIndex: number): void {
  s.pairIndex = pairIndex;
  s.tossup = {
    pairIndex,
    eligible: [true, true],
    readComplete: false,
    reread: false,
    windowOpenedAt: null,
    windowKind: null,
    buzz: null,
    winner: null,
  };
  s.bonus = null;
  s.phase = 'tossup_reading';
  if (s.period === 'tiebreak') s.tiebreakBegun += 1;
  else s.tossupsBegun += 1;
  if (!s.readTossups.includes(pairIndex)) s.readTossups.push(pairIndex);
}

function endGame(s: MatchState, reason: EndReason, t: number): void {
  s.phase = 'game_over';
  s.endedReason = reason;
  s.tossup = null;
  s.bonus = null;
  if (s.clock) stopClock(s.clock, t);
}

function stopClock(clock: ClockState, t: number): void {
  if (clock.runningSince !== null) {
    clock.remainingMs = Math.max(0, clock.remainingMs - (t - clock.runningSince));
    clock.runningSince = null;
  }
}

function freshClock(preset: RulesPreset, t: number): ClockState | null {
  if (!preset.clock) return null;
  const halfMs = preset.clock.halfMinutes * 60_000;
  return { halfMs, remainingMs: halfMs, runningSince: t, expired: false };
}

function cloneState(s: MatchState): MatchState {
  return {
    ...s,
    scores: [...s.scores] as [number, number],
    tossup: s.tossup ? { ...s.tossup, eligible: [...s.tossup.eligible] as [boolean, boolean], buzz: s.tossup.buzz ? { ...s.tossup.buzz } : null } : null,
    bonus: s.bonus ? { ...s.bonus } : null,
    clock: s.clock ? { ...s.clock } : null,
    lineups: [[...s.lineups[0]], [...s.lineups[1]]],
    log: [...s.log],
    readTossups: [...s.readTossups],
    readBonuses: [...s.readBonuses],
  };
}

/** Apply one event. Throws RuleError if the event is not allowed in the current state. */
export function applyEvent(state: MatchState, event: MatchEvent): MatchState {
  if (!allowedEvents(state).has(event.type)) {
    throw new RuleError(`"${event.type}" is not allowed during ${state.phase}`);
  }
  const s = cloneState(state);
  const preset = s.config.preset;
  const { t } = event;

  switch (event.type) {
    case 'start': {
      if (s.config.pairCount < 1) throw new RuleError('The packet has no questions');
      if (s.config.tiebreakOnly) {
        s.period = 'tiebreak';
        s.clock = null;
        s.tiebreakBegun = 0;
      } else {
        s.period = 1;
        s.clock = freshClock(preset, t);
      }
      beginTossup(s, 0);
      return s;
    }

    case 'tossup_read': {
      const tu = s.tossup!;
      tu.readComplete = true;
      tu.windowOpenedAt = t;
      tu.windowKind = 'initial';
      s.phase = 'tossup_open';
      return s;
    }

    case 'buzz': {
      const tu = s.tossup!;
      if (!tu.eligible[event.team]) throw new RuleError(`${s.config.teams[event.team].name} has already had its chance at this toss-up`);
      if (s.lineups[event.team].length > 0 && !s.lineups[event.team].includes(event.playerId)) {
        throw new RuleError('That player is not in the active lineup');
      }
      tu.buzz = { team: event.team, playerId: event.playerId, t, interrupt: !tu.readComplete };
      s.phase = 'tossup_answering';
      return s;
    }

    case 'tossup_judged': {
      const tu = s.tossup!;
      const buzz = tu.buzz!;
      const team = buzz.team;
      const opp = other(team);
      const points: [number, number] = [0, 0];
      const latencyMs = buzz.interrupt || tu.windowOpenedAt === null ? null : Math.max(0, buzz.t - tu.windowOpenedAt);

      if (event.result === 'correct') {
        points[team] += preset.points.tossup;
        s.scores[team] += preset.points.tossup;
        tu.winner = team;
        s.log.push({ kind: 'tossup', pairIndex: tu.pairIndex, period: s.period, team, playerId: buzz.playerId, result: 'correct', interrupt: buzz.interrupt, reread: tu.reread, latencyMs, points, t });
        tu.buzz = null;
        if (s.period === 'tiebreak') {
          // No bonuses in tiebreakers (Rule 6-4).
          s.phase = 'question_over';
        } else {
          s.bonus = { team, pairIndex: tu.pairIndex, readComplete: false, windowOpenedAt: null };
          s.phase = 'bonus_reading';
          if (!s.readBonuses.includes(tu.pairIndex)) s.readBonuses.push(tu.pairIndex);
        }
        return s;
      }

      // A fault: wrong answer, blurt, stall or audible communication. The team loses the toss-up (Rules 3-2, 4-1, 4-2, 5-3).
      tu.eligible[team] = false;
      if (buzz.interrupt) {
        // Rule 6-2 (and 6-3 for a second interrupt during the re-read).
        if (preset.interruptFaultMode === 'opponent_gains') {
          points[opp] += preset.points.interruptFault;
          s.scores[opp] += preset.points.interruptFault;
        } else {
          points[team] -= preset.points.interruptFault;
          s.scores[team] -= preset.points.interruptFault;
        }
      }
      s.log.push({ kind: 'tossup', pairIndex: tu.pairIndex, period: s.period, team, playerId: buzz.playerId, result: event.result, interrupt: buzz.interrupt, reread: tu.reread, latencyMs, points, t });
      tu.buzz = null;

      if (!tu.eligible[opp]) {
        s.phase = 'question_over';
      } else if (buzz.interrupt) {
        // The question is re-read in its entirety for the other team (Rules 4-1, 6-2).
        tu.reread = true;
        tu.readComplete = false;
        tu.windowOpenedAt = null;
        tu.windowKind = null;
        s.phase = 'tossup_reading';
      } else {
        // The other team gets another 5 seconds after the moderator rules the answer wrong (Rule 3-8).
        tu.windowOpenedAt = t;
        tu.windowKind = 'rebound';
        s.phase = 'tossup_open';
      }
      return s;
    }

    case 'tossup_dead': {
      s.log.push({ kind: 'tossup_dead', pairIndex: s.tossup!.pairIndex, period: s.period, t });
      s.phase = 'question_over';
      return s;
    }

    case 'bonus_read': {
      const b = s.bonus!;
      b.readComplete = true;
      b.windowOpenedAt = t;
      if (event.visual) b.visual = true;
      s.phase = 'bonus_open';
      return s;
    }

    case 'bonus_judged': {
      const b = s.bonus!;
      const points: [number, number] = [0, 0];
      if (event.result === 'correct') {
        points[b.team] += preset.points.bonus;
        s.scores[b.team] += preset.points.bonus;
      }
      s.log.push({ kind: 'bonus', pairIndex: b.pairIndex, period: s.period, team: b.team, result: event.result, points, t });
      s.phase = 'question_over';
      return s;
    }

    case 'throw_out': {
      const part = s.phase === 'bonus_reading' || s.phase === 'bonus_open' ? 'bonus' : 'tossup';
      s.log.push({ kind: 'throw_out', pairIndex: s.pairIndex, period: s.period, part, note: event.note, t });
      if (s.tossup) s.tossup.buzz = null;
      s.bonus = null;
      s.phase = 'question_over';
      return s;
    }

    case 'next': {
      if (s.period === 'tiebreak') {
        if (s.tiebreakBegun >= preset.tiebreakTossups) {
          if (s.scores[0] !== s.scores[1]) {
            endGame(s, 'tiebreak', t);
            return s;
          }
          // Still tied: another series of 5 (Rule 6-4).
          s.tiebreakBegun = 0;
        }
        if (!hasNextPair(s)) {
          endGame(s, 'packet', t);
          return s;
        }
        beginTossup(s, s.pairIndex + 1);
        return s;
      }
      if (s.clock?.expired) {
        if (s.period === 1 && (preset.clock?.halves ?? 1) > 1 && hasNextPair(s)) {
          s.phase = 'halftime';
          s.tossup = null;
          s.bonus = null;
        } else {
          endGame(s, 'time', t);
        }
        return s;
      }
      if (preset.maxTossups !== null && s.tossupsBegun >= preset.maxTossups) {
        endGame(s, 'limit', t);
        return s;
      }
      if (!hasNextPair(s)) {
        endGame(s, 'packet', t);
        return s;
      }
      beginTossup(s, s.pairIndex + 1);
      return s;
    }

    case 'clock_pause': {
      stopClock(s.clock!, t);
      return s;
    }

    case 'clock_resume': {
      s.clock!.runningSince = t;
      return s;
    }

    case 'time_expired': {
      // Rule 5-6: a toss-up already begun is finished (with its bonus); the half ends afterwards.
      const clock = s.clock!;
      clock.expired = true;
      clock.remainingMs = 0;
      clock.runningSince = null;
      return s;
    }

    case 'start_half': {
      s.period = 2;
      s.clock = freshClock(preset, t);
      if (!hasNextPair(s)) {
        endGame(s, 'packet', t);
        return s;
      }
      beginTossup(s, s.pairIndex + 1);
      return s;
    }

    case 'set_lineup': {
      if (event.playerIds.length < 1 || event.playerIds.length > 4) {
        throw new RuleError('A lineup has one to four players');
      }
      s.lineups[event.team] = [...event.playerIds];
      return s;
    }

    case 'start_tiebreak': {
      s.period = 'tiebreak';
      s.clock = null;
      s.tiebreakBegun = 0;
      s.endedReason = null;
      beginTossup(s, s.pairIndex + 1);
      return s;
    }

    case 'adjust_score': {
      s.scores[event.team] += event.delta;
      s.log.push({ kind: 'adjust', team: event.team, delta: event.delta, note: event.note, t });
      return s;
    }

    case 'end_game': {
      endGame(s, 'manual', t);
      return s;
    }
  }
}
