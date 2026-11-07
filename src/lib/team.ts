/**
 * Team-level views of the learner model: each player's lineup profile, the team's best player in
 * every topic, and who takes over each subject when a player graduates.
 */
import { useMemo } from 'react';
import { cautiousChance, type PlayerProfile } from '../core/lineup';
import { BASE_DIFFICULTY, playerModel, type PlayerModel, type SkillLine } from '../core/mastery';
import { CORE_SUBJECTS, type CatalogRow, type CoreSubject, type Player } from '../core/schema';
import { TOPICS } from '../core/taxonomy';
import { playerObservations } from './learning';
import type { AppData } from './store';

/** Bonuses are a little harder than toss-ups (see questionDifficulty in mastery.ts). */
const BONUS_GAP = 50;

/** Players who play (active, not coaches). */
export function teamPlayers(data: AppData): Player[] {
  return data.players.filter((p) => p.active && p.role !== 'coach');
}

/** The learner model of every playing member, recomputed when answers change. */
export function useTeamModels(data: AppData, catalog: Map<string, CatalogRow> | null): Map<string, PlayerModel> {
  return useMemo(() => {
    const now = Date.now();
    return new Map(teamPlayers(data).map((p) => [p.id, playerModel(playerObservations(data, p.id, catalog), now)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, data.attempts, data.games, data.players]);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The chance at bonus difficulty for a player whose chance on a typical toss-up is p. */
function bonusChance(p: number): number {
  const rating = BASE_DIFFICULTY + 400 * Math.log10(p / (1 - p));
  return 1 / (1 + Math.pow(10, (BASE_DIFFICULTY + BONUS_GAP - rating) / 400));
}

/** A player's lineup profile: cautious per-subject chances (few answers lean on a prior) and buzz speed. */
export function profileFor(player: Player, model: PlayerModel | undefined): PlayerProfile {
  const tossup = {} as Record<CoreSubject, number>;
  const bonus = {} as Record<CoreSubject, number>;
  const answers = {} as Record<CoreSubject, number>;
  for (const s of CORE_SUBJECTS) {
    const line = model?.subjects[s];
    const own = player.primarySubject === s ? 'primary' : player.secondarySubject === s ? 'secondary' : null;
    const p = cautiousChance(line?.p, line?.n ?? 0, own);
    tossup[s] = p;
    bonus[s] = bonusChance(Math.min(0.99, Math.max(0.01, p)));
    answers[s] = line?.n ?? 0;
  }
  const buzzes = (model?.observations ?? []).filter((o) => o.correct && !o.interrupt && o.kind === 'tossup' && o.latencyMs !== null).map((o) => o.latencyMs!);
  return { playerId: player.id, tossup, bonus, buzzMs: median(buzzes), answers };
}

/* ---------------- who covers what ---------------- */

export interface TopicCoverage {
  topicId: string;
  subject: CoreSubject;
  /** The player with the highest mastery among those with enough answers, or null. */
  best: { playerId: string; line: SkillLine } | null;
  /** Players with enough answers in the topic. */
  players: number;
}

/** Answers a player needs in a topic before it counts toward coverage. */
export const MIN_TOPIC_ANSWERS = 3;

export function topicCoverage(models: Map<string, PlayerModel>): TopicCoverage[] {
  return TOPICS.map((t) => {
    let best: TopicCoverage['best'] = null;
    let players = 0;
    for (const [playerId, model] of models) {
      const line = model.topics[t.id];
      if (!line || line.n < MIN_TOPIC_ANSWERS) continue;
      players += 1;
      if (!best || line.p > best.line.p) best = { playerId, line };
    }
    return { topicId: t.id, subject: t.subject, best, players };
  });
}

/** The class that graduates at the end of the season containing `now` (seasons turn over in August). */
export function graduatingClass(now: number): number {
  const d = new Date(now);
  return d.getMonth() >= 7 ? d.getFullYear() + 1 : d.getFullYear();
}

export interface Succession {
  subject: CoreSubject;
  owners: Player[];
  /** Owners who graduate this season. */
  leaving: Player[];
  /** The strongest player in the subject who stays, if the owners all leave (or there are none). */
  successor: { player: Player; p: number } | null;
}

export function succession(players: Player[], models: Map<string, PlayerModel>, now: number): Succession[] {
  const year = graduatingClass(now);
  return CORE_SUBJECTS.map((subject) => {
    const owners = players.filter((p) => p.primarySubject === subject);
    const leaving = owners.filter((p) => p.gradYear !== undefined && p.gradYear <= year);
    const staying = players.filter((p) => !(p.gradYear !== undefined && p.gradYear <= year));
    let successor: Succession['successor'] = null;
    if (owners.length === 0 || leaving.length === owners.length) {
      for (const p of staying) {
        const prof = profileFor(p, models.get(p.id));
        if (!successor || prof.tossup[subject] > successor.p) successor = { player: p, p: prof.tossup[subject] };
      }
    }
    return { subject, owners, leaving, successor };
  });
}
