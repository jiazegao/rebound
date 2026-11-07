/** Player and team statistics, derived from logged games and solo practice. */
import { replay, type LogEntry, type MatchState } from '../core/rules/engine';
import { getPreset } from '../core/rules/presets';
import { CORE_SUBJECTS, type Subject } from '../core/schema';
import type { AppData, GameRecord } from './store';

export function gameState(game: GameRecord): MatchState | null {
  try {
    return replay({ preset: getPreset(game.presetId), teams: game.teams, pairCount: game.pairs.length }, game.events);
  } catch {
    return null;
  }
}

export interface SubjectLine {
  attempts: number;
  correct: number;
}

export interface PlayerLine {
  playerId: string;
  games: number;
  tossupAttempts: number;
  tossupCorrect: number;
  interrupts: number;
  interruptCorrect: number;
  faults: { incorrect: number; blurt: number; stall: number; communication: number };
  /** Points the player's faults on interrupts handed to the other team (or cost their own team). */
  penaltyPoints: number;
  /** Buzz times (ms after the reading ended) on correct, non-interrupt answers. */
  correctLatencies: number[];
  bySubject: Partial<Record<Subject, SubjectLine>>;
  bonusesHeard: number;
  bonusesCorrect: number;
  soloAnswered: number;
  soloCorrect: number;
  /** Toss-ups answered after the other team got it wrong. */
  rebounds: { attempts: number; correct: number };
}

function emptyLine(playerId: string): PlayerLine {
  return {
    playerId,
    games: 0,
    tossupAttempts: 0,
    tossupCorrect: 0,
    interrupts: 0,
    interruptCorrect: 0,
    faults: { incorrect: 0, blurt: 0, stall: 0, communication: 0 },
    penaltyPoints: 0,
    correctLatencies: [],
    bySubject: {},
    bonusesHeard: 0,
    bonusesCorrect: 0,
    soloAnswered: 0,
    soloCorrect: 0,
    rebounds: { attempts: 0, correct: 0 },
  };
}

function addLog(lines: Map<string, PlayerLine>, game: GameRecord, log: LogEntry[]): void {
  // Teams that already answered each toss-up wrong, to recognize rebounds.
  const wrongBy = new Map<number, Set<number>>();
  for (const entry of log) {
    if (entry.kind === 'tossup') {
      const line = lines.get(entry.playerId) ?? emptyLine(entry.playerId);
      lines.set(entry.playerId, line);
      const subject = game.pairs[entry.pairIndex]?.subject;
      const wrongTeams = wrongBy.get(entry.pairIndex) ?? new Set<number>();
      if (wrongTeams.has(entry.team === 0 ? 1 : 0)) {
        line.rebounds.attempts += 1;
        if (entry.result === 'correct') line.rebounds.correct += 1;
      }
      if (entry.result !== 'correct') wrongBy.set(entry.pairIndex, wrongTeams.add(entry.team));
      line.tossupAttempts += 1;
      if (entry.interrupt) line.interrupts += 1;
      if (entry.result === 'correct') {
        line.tossupCorrect += 1;
        if (entry.interrupt) line.interruptCorrect += 1;
        else if (entry.latencyMs !== null) line.correctLatencies.push(entry.latencyMs);
      } else {
        line.faults[entry.result] += 1;
        line.penaltyPoints += Math.abs(entry.points[0] + entry.points[1]);
      }
      if (subject) {
        const s = (line.bySubject[subject] ??= { attempts: 0, correct: 0 });
        s.attempts += 1;
        if (entry.result === 'correct') s.correct += 1;
      }
    } else if (entry.kind === 'bonus') {
      for (const playerId of game.teams[entry.team].playerIds) {
        const line = lines.get(playerId) ?? emptyLine(playerId);
        lines.set(playerId, line);
        line.bonusesHeard += 1;
        if (entry.result === 'correct') line.bonusesCorrect += 1;
      }
    }
  }
}

/** Stats for every player across all logged games and solo practice. */
export function playerLines(data: AppData): PlayerLine[] {
  const lines = new Map<string, PlayerLine>();
  for (const p of data.players) lines.set(p.id, emptyLine(p.id));
  for (const game of data.games) {
    const state = gameState(game);
    if (!state) continue;
    for (const id of new Set(game.teams.flatMap((t) => t.playerIds))) {
      const line = lines.get(id) ?? emptyLine(id);
      lines.set(id, line);
      line.games += 1;
    }
    addLog(lines, game, state.log);
  }
  for (const a of data.attempts) {
    const line = lines.get(a.playerId) ?? emptyLine(a.playerId);
    lines.set(a.playerId, line);
    line.soloAnswered += 1;
    if (a.correct) line.soloCorrect += 1;
  }
  return [...lines.values()];
}

/** Stats for the players in one game. */
export function gameLines(game: GameRecord, state: MatchState): PlayerLine[] {
  const lines = new Map<string, PlayerLine>();
  for (const id of game.teams.flatMap((t) => t.playerIds)) lines.set(id, { ...emptyLine(id), games: 1 });
  addLog(lines, game, state.log);
  return [...lines.values()];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Bonus conversion for each team in a game. */
export function bonusLines(state: MatchState): Array<{ heard: number; correct: number }> {
  const lines = [
    { heard: 0, correct: 0 },
    { heard: 0, correct: 0 },
  ];
  for (const entry of state.log) {
    if (entry.kind !== 'bonus') continue;
    lines[entry.team].heard += 1;
    if (entry.result === 'correct') lines[entry.team].correct += 1;
  }
  return lines;
}

export const STAT_SUBJECTS = CORE_SUBJECTS;

/* ---------------- uncertainty and trends ---------------- */

/** True when a rate rests on too few answers to compare players (fewer than 10). */
export function fewAnswers(n: number): boolean {
  return n < 10;
}

/** Net points per interrupt: +4 for a right one, −4 (given to the other team) for a wrong one. */
export function netPerInterrupt(line: Pick<PlayerLine, 'interrupts' | 'interruptCorrect'>): number | null {
  if (line.interrupts === 0) return null;
  const wrong = line.interrupts - line.interruptCorrect;
  return (4 * line.interruptCorrect - 4 * wrong) / line.interrupts;
}

export interface WeekLine {
  /** Monday of the week, "YYYY-MM-DD". */
  week: string;
  games: number;
  tossupsRead: number;
  tossupsAnswered: number;
  bonusesHeard: number;
  bonusesCorrect: number;
  wrongInterrupts: number;
  points: number;
}

function mondayOf(t: number): string {
  const d = new Date(t);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Finished practice games week by week: how much got answered, bonus conversion, wrong interrupts, points. */
export function weeklyTrend(data: AppData): WeekLine[] {
  const weeks = new Map<string, WeekLine>();
  for (const game of data.games) {
    if (game.status !== 'finished') continue;
    const state = gameState(game);
    if (!state) continue;
    const key = mondayOf(new Date(game.createdAt).getTime());
    const w = weeks.get(key) ?? { week: key, games: 0, tossupsRead: 0, tossupsAnswered: 0, bonusesHeard: 0, bonusesCorrect: 0, wrongInterrupts: 0, points: 0 };
    weeks.set(key, w);
    w.games += 1;
    w.points += state.scores[0] + state.scores[1];
    const answered = new Set<number>();
    const read = new Set<number>();
    for (const e of state.log) {
      if (e.kind === 'tossup') {
        read.add(e.pairIndex);
        if (e.result === 'correct') answered.add(e.pairIndex);
        if (e.interrupt && e.result !== 'correct') w.wrongInterrupts += 1;
      } else if (e.kind === 'tossup_dead') read.add(e.pairIndex);
      else if (e.kind === 'bonus') {
        w.bonusesHeard += 1;
        if (e.result === 'correct') w.bonusesCorrect += 1;
      }
    }
    w.tossupsRead += read.size;
    w.tossupsAnswered += answered.size;
  }
  return [...weeks.values()].sort((a, b) => b.week.localeCompare(a.week));
}
