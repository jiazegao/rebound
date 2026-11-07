/**
 * Turning logged practice into per-player outcomes: one row per answer (or non-answer) to a
 * question. Review cards and the mastery model are both built from these.
 */
import type { Outcome } from '../core/review';
import type { Player, Subject } from '../core/schema';
import { gameState } from './stats';
import type { GameRecord, SoloAttempt } from './store';

export function attemptOutcome(a: SoloAttempt): Outcome {
  return {
    key: `attempt:${a.id}`,
    playerId: a.playerId,
    questionId: a.questionId,
    subject: a.subject,
    kind: a.kind,
    correct: a.correct,
    interrupt: a.interrupt,
    latencyMs: a.latencyMs,
    t: a.t,
    via: 'practice',
  };
}

function covers(players: Player[], playerId: string, subject: Subject, includeSecondary: boolean): boolean {
  const p = players.find((x) => x.id === playerId);
  return !!p && (p.primarySubject === subject || (includeSecondary && p.secondarySubject === subject));
}

/**
 * Outcomes from a Reader console game:
 * - every toss-up answer, right or wrong (blurts and communication faults are conduct, not knowledge, so they are left out);
 * - a toss-up nobody answered, for the players in the game whose primary subject it is;
 * - each bonus, for the players on that team who cover its subject (everyone on the team when nobody does).
 */
export function gameOutcomes(game: GameRecord, players: Player[]): Outcome[] {
  const state = gameState(game);
  if (!state) return [];
  const inGame = [...new Set(game.teams.flatMap((t) => t.playerIds))];
  const out: Outcome[] = [];
  for (const entry of state.log) {
    if (entry.kind === 'tossup') {
      if (entry.result === 'blurt' || entry.result === 'communication') continue;
      const pair = game.pairs[entry.pairIndex];
      if (!pair) continue;
      out.push({
        key: `game:${game.id}:${entry.pairIndex}:t:${entry.t}`,
        playerId: entry.playerId,
        questionId: pair.tossupId,
        subject: pair.subject,
        kind: 'tossup',
        correct: entry.result === 'correct',
        interrupt: entry.interrupt,
        latencyMs: entry.interrupt ? null : entry.latencyMs,
        t: entry.t,
        via: 'game',
      });
    } else if (entry.kind === 'tossup_dead') {
      const pair = game.pairs[entry.pairIndex];
      if (!pair) continue;
      for (const playerId of inGame.filter((id) => covers(players, id, pair.subject, false))) {
        out.push({
          key: `game:${game.id}:${entry.pairIndex}:dead:${entry.t}`,
          playerId,
          questionId: pair.tossupId,
          subject: pair.subject,
          kind: 'tossup',
          correct: false,
          interrupt: false,
          latencyMs: null,
          t: entry.t,
          via: 'game',
          reason: 'dead',
          shared: true,
        });
      }
    } else if (entry.kind === 'bonus') {
      const pair = game.pairs[entry.pairIndex];
      if (!pair?.bonusId) continue;
      const team = game.teams[entry.team].playerIds;
      const owners = team.filter((id) => covers(players, id, pair.subject, true));
      const correct = entry.result === 'correct';
      for (const playerId of owners.length > 0 ? owners : team) {
        out.push({
          key: `game:${game.id}:${entry.pairIndex}:b:${entry.t}`,
          playerId,
          questionId: pair.bonusId,
          subject: pair.subject,
          kind: 'bonus',
          correct,
          interrupt: false,
          latencyMs: null,
          t: entry.t,
          via: 'game',
          reason: correct ? undefined : 'bonus',
          shared: true,
        });
      }
    }
  }
  return out;
}
