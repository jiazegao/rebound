/**
 * Browser-side glue between the saved data and the learning logic in src/core:
 * a player's observations and model, due cards, today's plan, and the questions a player has heard.
 */
import { useMemo } from 'react';
import { gameState } from '../core/games';
import { playerModel, type Observation, type PlayerModel } from '../core/mastery';
import { buildPlan, resizePlan, type DayPlan } from '../core/plan';
import {
  dueToday,
  newCardsPerDay,
  practiceDay,
  reviewQueue,
  seasonPhase,
  summarizeCards,
  type CardOwner,
  type CardSummary,
  type DueToday,
  type Outcome,
  type ReviewCard,
} from '../core/review';
import type { CatalogRow, ConceptIndex, CoreSubject, Player } from '../core/schema';
import { topicById } from '../core/taxonomy';
import { attemptOutcome } from './outcomes';
import type { AppData, GameRecord } from './store';
import { isVisualId } from './visuals';

function roundFromId(questionId: string): number {
  const m = /-r(\d+)[a-z]*-[tb]\d+$/i.exec(questionId);
  return m ? Number(m[1]) : 1;
}

/**
 * Everything the player has answered themselves: their practice answers, and their answers in team games and online
 * matches (which the server writes to their account when the game ends).
 */
export function playerObservations(data: Pick<AppData, 'attempts' | 'answers'>, playerId: string, catalog: Map<string, CatalogRow> | null): Observation[] {
  const out: Observation[] = [];
  const add = (o: Outcome) => {
    // Visual lab answers (generated figures, photos, team visuals) are their own kind of practice: they are
    // not part of the mastery map, which rates players on library questions.
    if (isVisualId(o.questionId)) return;
    const row = catalog?.get(o.questionId);
    out.push({
      playerId: o.playerId,
      questionId: o.questionId,
      subject: o.subject,
      topic: row?.[2] ?? '',
      kind: o.kind,
      round: row?.[4] ?? roundFromId(o.questionId),
      correct: o.correct,
      interrupt: o.interrupt,
      latencyMs: o.latencyMs,
      t: o.t,
    });
  };
  for (const a of data.attempts) if (a.playerId === playerId) add(attemptOutcome(a));
  // Team bonuses and dead toss-ups are the team's (or nobody's), not the player's own answers.
  for (const o of data.answers) if (o.playerId === playerId && !o.shared) add(o);
  return out;
}

export function usePlayerModel(data: AppData, playerId: string | null, catalog: Map<string, CatalogRow> | null): PlayerModel | undefined {
  return useMemo(
    () => (playerId ? playerModel(playerObservations(data, playerId, catalog), Date.now()) : undefined),
    // Recompute when answers change, not on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playerId, catalog, data.attempts, data.answers],
  );
}

/** Question ids with an open problem report: their cards wait until the report is resolved. */
export function disputedQuestions(data: AppData): Set<string> {
  return new Set(data.reports.filter((r) => r.status === 'open').map((r) => r.questionId));
}

export function playerCards(data: AppData): ReviewCard[] {
  return Object.values(data.cards);
}

/** The player's cards in subjects order, for the new-card priority. Unknown players get no subjects. */
function ownerOf(data: AppData, playerId: string): CardOwner {
  const p = data.players.find((x) => x.id === playerId);
  return { id: playerId, primarySubject: p?.primarySubject, secondarySubject: p?.secondarySubject };
}

function cardOptions(data: AppData) {
  return { newPerDay: newCardsPerDay(data.settings.dailyMinutes), disputed: disputedQuestions(data) };
}

/** Today's due reviews and new cards for a player. */
export function playerDueToday(data: AppData, playerId: string, now = Date.now()): DueToday {
  return dueToday(playerCards(data), ownerOf(data, playerId), now, cardOptions(data));
}

/** Today's review session for a player, in order: due reviews, then new cards. */
export function playerDue(data: AppData, playerId: string, now = Date.now()): ReviewCard[] {
  return reviewQueue(playerDueToday(data, playerId, now));
}

export function playerCardSummary(data: AppData, playerId: string, now = Date.now()): CardSummary {
  return summarizeCards(playerCards(data), ownerOf(data, playerId), now, cardOptions(data));
}

/** Reviewed concept cards the player has not read yet, for the plan's "new concept" items. */
export function learnableCards(data: AppData, playerId: string, concepts: ConceptIndex | null) {
  const read = data.conceptReads[playerId] ?? {};
  const out: Array<{ conceptId: string; name: string; topicId: string; subject: CoreSubject; questions: number }> = [];
  for (const card of Object.values(data.conceptCards)) {
    if (card.status !== 'reviewed' || read[card.id]) continue;
    const topicId = card.id.split('.').slice(0, 2).join('.');
    const topic = topicById(topicId);
    const concept = topic?.concepts.find((c) => c.id === card.id);
    if (!topic || !concept) continue;
    out.push({ conceptId: card.id, name: concept.name, topicId, subject: topic.subject, questions: concepts?.concepts[card.id]?.length ?? 1 });
  }
  return out;
}

/** Questions per topic the player has not heard yet. */
export function freshTopicCounts(rows: CatalogRow[], seen: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) if (r[2] && !seen?.[r[0]]) out[r[2]] = (out[r[2]] ?? 0) + 1;
  return out;
}

/**
 * The player's plan for today: the saved one if it is for today and the same length, otherwise a new
 * one (keeping anything already done today). Pass the catalog once it has loaded, or null if it could not.
 */
export function planFor(
  data: AppData,
  player: Player,
  minutes: number,
  model: PlayerModel | undefined,
  catalog: { rows: CatalogRow[]; topicCounts: Record<string, number> } | null,
  now = Date.now(),
  concepts: ConceptIndex | null = null,
): { plan: DayPlan; changed: boolean } {
  const saved = data.plans[player.id];
  const day = practiceDay(now);
  const phase = seasonPhase(now, data.team?.nextEvent?.date);
  if (saved && saved.day === day && saved.minutes === minutes && saved.phase === phase) return { plan: saved, changed: false };
  const input = {
    player,
    now,
    minutes,
    dueCount: playerDue(data, player.id, now).length,
    nextEvent: data.team?.nextEvent ?? null,
    model,
    topicCounts: catalog?.topicCounts ?? {},
    freshCounts: catalog ? freshTopicCounts(catalog.rows, heardLedger(data, player.id)) : undefined,
    learnable: learnableCards(data, player.id, concepts),
  };
  const plan = saved && saved.day === day ? resizePlan(saved, input) : buildPlan(input);
  return { plan, changed: true };
}

/* ---------------- what a player has heard ---------------- */

const heardInGames = new Map<string, { ids: string[]; players: string[]; t: number }>();

/** The questions read in a game and who played in it (cached until the game changes). */
function gameHeard(game: GameRecord): { ids: string[]; players: string[]; t: number } {
  const key = `${game.id}|${game.events.length}|${game.updatedAt}`;
  let hit = heardInGames.get(key);
  if (!hit) {
    const state = gameState(game);
    const ids = state
      ? [...state.readTossups.map((i) => game.pairs[i]?.tossupId), ...state.readBonuses.map((i) => game.pairs[i]?.bonusId)].filter((id): id is string => !!id)
      : [];
    hit = { ids, players: game.teams.flatMap((t) => t.playerIds), t: Date.parse(game.createdAt) || 0 };
    if (heardInGames.size > 2_000) heardInGames.clear();
    heardInGames.set(key, hit);
  }
  return hit;
}

/**
 * The questions a player has heard, and when: their own "seen" ledger (practice, online matches), plus every
 * question read in the team's games they played in. Each player's device writes only its own ledger, so a Reader
 * console game counts for everyone in it this way.
 */
export function heardLedger(data: Pick<AppData, 'seen' | 'games'>, playerId: string): Record<string, number> {
  const out: Record<string, number> = { ...(data.seen[playerId] ?? {}) };
  for (const game of data.games) {
    const heard = gameHeard(game);
    if (!heard.players.includes(playerId)) continue;
    for (const id of heard.ids) out[id] ??= heard.t;
  }
  return out;
}
