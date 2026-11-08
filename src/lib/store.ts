/**
 * The signed-in player's data and their team's, in memory (docs/ACCOUNTS.md, "Site"). Pages read it with useData()
 * and change it only through update() and the actions below. cloud.ts fills it from Rebound's server after sign-in
 * and sends every change back; nothing is kept on the device. Signed out, the data is empty and practice saves
 * nothing.
 *
 * A player's id is their user id. AppData holds the signed-in player's own practice (attempts, answers, heard
 * ledgers, review cards, plan…) and the team's shared work (games, lineups, packets…); teammates' practice is
 * loaded separately when a page needs it (teammates.ts).
 */
import { useSyncExternalStore } from 'react';
import type { DayPlan } from '../core/plan';
import {
  applyOutcome,
  cardId,
  cardStage,
  gradeCard,
  isStale,
  manualCard,
  RETENTION,
  seasonPhase,
  type CardEvent,
  type Outcome,
  type ReviewCard,
} from '../core/review';
import type { MatchEvent } from '../core/rules/engine';
import type { Assignment, Completion, ConceptCard, Lineup, Player, QuestionKind, Subject, Team, TeamPacket, TeamVisual, WrittenQuestion } from '../core/schema';
import { newId } from './format';
import { attemptOutcome } from './outcomes';

export type { GamePairRef, GameRecord, SoloAttempt } from '../core/games';
import type { GameRecord, SoloAttempt } from '../core/games';

export interface ProblemReport {
  id: string;
  questionId: string;
  note: string;
  createdAt: string;
  status: 'open' | 'resolved';
}

export interface AppSettings {
  sound: boolean;
  readingWpm: number;
  /** The signed-in player's id (null when signed out). */
  soloPlayerId: string | null;
  answerTimer: boolean;
  dailyMinutes: number;
  /** How far the player's game and match answers have been turned into review cards (an answers revision). */
  cardsCursor?: number;
}

export interface AppData {
  team: Team | null;
  /** The team's members, or just the signed-in player when they have no team. */
  players: Player[];
  games: GameRecord[];
  /** playerId → questionId → when they first heard it (ms). */
  seen: Record<string, Record<string, number>>;
  attempts: SoloAttempt[];
  /** The player's answers in team games and online matches, oldest first (the server writes them). */
  answers: Outcome[];
  reports: ProblemReport[];
  /** Review cards, keyed by `${playerId}:${questionId}`. */
  cards: Record<string, ReviewCard>;
  /** The player's plan for the current day, keyed by player id. */
  plans: Record<string, DayPlan>;
  lineups: Lineup[];
  packets: TeamPacket[];
  /** Concept cards, keyed by concept id. */
  conceptCards: Record<string, ConceptCard>;
  assignments: Assignment[];
  /** Keyed by `${assignmentId}:${playerId}`. */
  completions: Record<string, Completion>;
  /** playerId → conceptId (or "reading:<topic>") → when they read it. */
  conceptReads: Record<string, Record<string, number>>;
  /** Visual questions the team added, newest first. */
  visuals: TeamVisual[];
  /** Questions the team writes in the studio (Team → Write), newest first. */
  written: WrittenQuestion[];
  settings: AppSettings;
}

export const DEFAULT_APP_SETTINGS: AppSettings = { sound: true, readingWpm: 200, soloPlayerId: null, answerTimer: true, dailyMinutes: 30 };

export function emptyData(): AppData {
  return {
    team: null,
    players: [],
    games: [],
    seen: {},
    attempts: [],
    answers: [],
    reports: [],
    cards: {},
    plans: {},
    lineups: [],
    packets: [],
    conceptCards: {},
    assignments: [],
    completions: {},
    conceptReads: {},
    visuals: [],
    written: [],
    settings: { ...DEFAULT_APP_SETTINGS },
  };
}

let data: AppData = emptyData();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Run `listener` after every change to the data (cloud.ts sends changes this way). Returns an unsubscribe function. */
export function subscribeStore(listener: () => void): () => void {
  return subscribe(listener);
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, () => data);
}

export function getData(): AppData {
  return data;
}

/** Replace all data at once (cloud.ts, when the player signs in or out). */
export function replaceData(next: AppData): void {
  data = next;
  emit();
}

/**
 * Change data through a draft; listeners re-render and cloud.ts sends what changed. Each top-level collection is
 * copied the first time the change reads it, so untouched collections keep their identity: pages that memoize on
 * `data.attempts` recompute only when attempts change, and cloud.ts only re-checks collections that were touched.
 */
export function update(mutate: (draft: AppData) => void): void {
  const next: AppData = { ...data };
  const target = next as unknown as Record<PropertyKey, unknown>;
  const copied = new Set<PropertyKey>();
  const draft = new Proxy(target, {
    get(t, key, receiver) {
      if (!copied.has(key) && Object.prototype.hasOwnProperty.call(t, key)) {
        copied.add(key);
        const value = t[key];
        if (value !== null && typeof value === 'object') t[key] = structuredClone(value);
      }
      return Reflect.get(t, key, receiver);
    },
    set(t, key, value) {
      copied.add(key);
      t[key] = value;
      return true;
    },
    deleteProperty(t, key) {
      copied.add(key);
      delete t[key];
      return true;
    },
  }) as unknown as AppData;
  mutate(draft);
  data = next;
  emit();
}

/** The signed-in player's id, or null when signed out. */
export function currentPlayerId(d: AppData = data): string | null {
  return d.settings.soloPlayerId;
}

/** The signed-in player (null when signed out). */
export function useCurrentPlayer(): Player | null {
  const d = useData();
  return d.players.find((p) => p.id === d.settings.soloPlayerId) ?? null;
}

/* ---------------- team settings ---------------- */

/** Rename the team or change its level (coaches and captains; cloud.ts sends it to the team's settings). */
export function renameTeam(name: string, level: Team['level']): void {
  update((d) => {
    if (d.team) d.team = { ...d.team, name: name.trim() || d.team.name, level };
  });
}

export function setNextEvent(event: { name: string; date: string; finals?: boolean } | null): void {
  update((d) => {
    if (!d.team) return;
    if (event && /^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
      d.team.nextEvent = { name: event.name.trim(), date: event.date, lineupId: d.team.nextEvent?.lineupId, ...(event.finals ? { finals: true } : {}) };
      if (!d.team.nextEvent.lineupId) delete d.team.nextEvent.lineupId;
    } else delete d.team.nextEvent;
    // Today's plans are rebuilt (keeping what is done) when the date moves them into another season phase.
  });
}

/* ---------------- games ---------------- */

export function createGame(game: Omit<GameRecord, 'id' | 'createdAt' | 'updatedAt' | 'events' | 'status'>): string {
  const id = newId('g');
  const now = new Date().toISOString();
  update((d) => {
    d.games.unshift({ ...game, id, createdAt: now, updatedAt: now, events: [], status: 'in_progress' });
  });
  return id;
}

export function appendEvent(gameId: string, event: MatchEvent): void {
  update((d) => {
    const g = d.games.find((x) => x.id === gameId);
    if (!g) return;
    g.events.push(event);
    g.updatedAt = new Date().toISOString();
  });
}

export function undoEvent(gameId: string): void {
  update((d) => {
    const g = d.games.find((x) => x.id === gameId);
    if (!g || g.events.length === 0) return;
    g.events.pop();
    g.status = 'in_progress';
    g.finalScores = undefined;
    g.updatedAt = new Date().toISOString();
  });
}

/**
 * End a game. The server turns the finished game into each player's answers, and each player's own device makes
 * their review cards from those answers when it next loads; no device writes cards for anyone else.
 */
export function finishGame(gameId: string, scores: [number, number]): void {
  update((d) => {
    const g = d.games.find((x) => x.id === gameId);
    if (!g) return;
    g.status = 'finished';
    g.finalScores = scores;
    g.updatedAt = new Date().toISOString();
  });
}

export function setGameRoom(gameId: string, roomId: string | undefined): void {
  update((d) => {
    const g = d.games.find((x) => x.id === gameId);
    if (!g) return;
    if (roomId) g.roomId = roomId;
    else delete g.roomId;
  });
}

export function deleteGame(gameId: string): void {
  update((d) => {
    d.games = d.games.filter((g) => g.id !== gameId);
  });
}

/* ---------------- the player's own practice ---------------- */

/**
 * Record that the signed-in player heard these questions (when they are among `playerIds`). Each player's own
 * device keeps their ledger; questions read in team games count as heard for everyone who played (learning.ts).
 */
export function markSeen(playerIds: string[], questionIds: string[], at = Date.now()): void {
  const me = data.settings.soloPlayerId;
  if (!me || !playerIds.includes(me) || questionIds.length === 0) return;
  const ledger = data.seen[me];
  if (ledger && questionIds.every((q) => ledger[q])) return;
  update((d) => {
    const mine = (d.seen[me] ??= {});
    for (const q of questionIds) mine[q] ??= at;
  });
}

/** One practice answer by the signed-in player (anyone else's, or while signed out, is not saved). */
export function addAttempt(attempt: Omit<SoloAttempt, 'id'>): void {
  if (!attempt.playerId || attempt.playerId !== data.settings.soloPlayerId) return;
  update((d) => {
    const a = { ...attempt, id: newId('a') };
    d.attempts.push(a);
    applyOutcomes(d, [attemptOutcome(a)]);
  });
}

/**
 * The player's new answers from team games and online matches (written by the server) become review cards, and
 * the cursor remembers how far that has gone. Each answer counts once even if this runs again.
 */
export function applyAnswers(outcomes: Outcome[], cursor: number): void {
  update((d) => {
    const me = d.settings.soloPlayerId;
    if (!me) return;
    applyOutcomes(
      d,
      outcomes.filter((o) => o.playerId === me),
    );
    d.settings.cardsCursor = Math.max(d.settings.cardsCursor ?? 0, cursor);
  });
}

/* ---------------- review cards ---------------- */

/** The retention target in force at time `t` (it rises as the next competition gets close). */
export function retentionAt(d: AppData, t: number): number {
  return RETENTION[seasonPhase(t, d.team?.nextEvent?.date)];
}

function applyOutcomes(d: AppData, outcomes: Outcome[]): void {
  const players = new Set<string>();
  for (const o of [...outcomes].sort((a, b) => a.t - b.t)) {
    // Generated visual bonuses never become review cards: the same seed brings back the same numbers, so a
    // retry would test memory of an answer, not the skill. Photo and team visual misses do (identification).
    if (o.questionId.startsWith('vis-')) continue;
    const id = cardId(o.playerId, o.questionId);
    const next = applyOutcome(d.cards[id], o, retentionAt(d, o.t));
    if (next) d.cards[id] = next;
    players.add(o.playerId);
  }
  // New cards that waited too long are dropped; a later miss brings the question back.
  const now = Date.now();
  for (const [id, card] of Object.entries(d.cards)) {
    if (players.has(card.playerId) && isStale(card, now)) delete d.cards[id];
  }
}

/** Put a question in the player's review queue: it comes up in the next review session. */
export function addToReview(playerId: string, q: { id: string; subject: Subject; kind: QuestionKind }): void {
  if (playerId !== data.settings.soloPlayerId) return;
  update((d) => {
    const id = cardId(playerId, q.id);
    const existing = d.cards[id];
    const now = Date.now();
    if (!existing || cardStage(existing) === 'new') {
      // An added question goes to the front of the new cards (see newCardPriority).
      d.cards[id] = { ...manualCard(playerId, q, now), sources: existing?.sources ?? [], log: existing?.log ?? [] };
    } else {
      // In review or learned: due today again.
      d.cards[id] = { ...existing, retiredAt: null, fsrs: { ...existing.fsrs, due: Math.min(existing.fsrs.due, now) } };
    }
  });
}

export function removeFromReview(id: string): void {
  update((d) => {
    delete d.cards[id];
  });
}

/** Save the result of one timed review. */
export function recordReview(id: string, event: CardEvent): void {
  update((d) => {
    const card = d.cards[id];
    if (card) d.cards[id] = gradeCard(card, event, retentionAt(d, event.t));
  });
}

/* ---------------- plans ---------------- */

export function savePlan(plan: DayPlan): void {
  if (plan.playerId !== data.settings.soloPlayerId) return;
  update((d) => {
    d.plans[plan.playerId] = plan;
  });
}

/** Tick off a plan item (only if the plan is still the one for that day). */
export function completePlanItem(playerId: string, day: string, itemId: string): void {
  const plan = data.plans[playerId];
  if (!plan || plan.day !== day || plan.items.find((i) => i.id === itemId)?.done !== false) return;
  update((d) => {
    const item = d.plans[playerId]?.items.find((i) => i.id === itemId);
    if (item) item.done = true;
  });
}

/* ---------------- problem reports and settings ---------------- */

export function reportProblem(questionId: string, note: string): void {
  if (!data.settings.soloPlayerId) return;
  update((d) => {
    d.reports.unshift({ id: newId('r'), questionId, note: note.trim(), createdAt: new Date().toISOString(), status: 'open' });
  });
}

export function setReportStatus(id: string, status: ProblemReport['status']): void {
  update((d) => {
    const r = d.reports.find((x) => x.id === id);
    if (r) r.status = status;
  });
}

/** Change the player's settings (sound, reading speed, answer timer, daily minutes). */
export function updateSettings(fields: Partial<Omit<AppSettings, 'soloPlayerId' | 'cardsCursor'>>): void {
  update((d) => {
    d.settings = { ...d.settings, ...fields };
  });
}

/* ---------------- team packets ---------------- */

/** Save a scrimmage or uploaded packet. Returns its id. */
export function savePacket(packet: Omit<TeamPacket, 'id' | 'createdAt'> & { id?: string }): string {
  const id = packet.id ?? newId('pk');
  update((d) => {
    const existing = d.packets.find((p) => p.id === id);
    if (existing) Object.assign(existing, packet, { id });
    else d.packets.unshift({ ...packet, id, createdAt: new Date().toISOString() });
  });
  return id;
}

export function deletePacket(id: string): void {
  update((d) => {
    d.packets = d.packets.filter((p) => p.id !== id);
  });
}

/* ---------------- team visual questions ---------------- */

/** Add or update a team visual question. */
export function saveVisual(visual: Omit<TeamVisual, 'createdAt' | 'updatedAt'>): void {
  const now = new Date().toISOString();
  update((d) => {
    const existing = d.visuals.find((v) => v.id === visual.id);
    if (existing) Object.assign(existing, visual, { updatedAt: now });
    else d.visuals.unshift({ ...visual, createdAt: now, updatedAt: now });
  });
}

export function deleteVisual(id: string): void {
  update((d) => {
    d.visuals = d.visuals.filter((v) => v.id !== id);
  });
}

/* ---------------- the question-writing studio ---------------- */

/** Add or update a team-written question. */
export function saveWritten(w: WrittenQuestion): void {
  const now = new Date().toISOString();
  update((d) => {
    const i = d.written.findIndex((x) => x.id === w.id);
    if (i >= 0) d.written[i] = { ...w, updatedAt: now };
    else d.written.unshift({ ...w, createdAt: now, updatedAt: now });
  });
}

export function deleteWritten(id: string): void {
  update((d) => {
    d.written = d.written.filter((w) => w.id !== id);
  });
}

/* ---------------- assignments ---------------- */

export function createAssignment(fields: Omit<Assignment, 'id' | 'createdAt'>): string {
  const id = newId('as');
  update((d) => {
    d.assignments.unshift({ ...fields, id, createdAt: new Date().toISOString() });
  });
  return id;
}

/** Delete an assignment (teammates' completions of it stay in their own accounts, where nothing shows them). */
export function deleteAssignment(id: string): void {
  update((d) => {
    d.assignments = d.assignments.filter((a) => a.id !== id);
    for (const key of Object.keys(d.completions)) if (d.completions[key].assignmentId === id) delete d.completions[key];
  });
}

/** Record that the signed-in player finished an assignment (once). */
export function completeAssignment(assignmentId: string, playerId: string): void {
  const id = `${assignmentId}:${playerId}`;
  if (playerId !== data.settings.soloPlayerId) return;
  if (data.completions[id] || !data.assignments.some((a) => a.id === assignmentId && a.playerIds.includes(playerId))) return;
  update((d) => {
    d.completions[id] = { id, assignmentId, playerId, at: new Date().toISOString() };
  });
}

export function markConceptRead(playerId: string, conceptId: string): void {
  if (playerId !== data.settings.soloPlayerId || data.conceptReads[playerId]?.[conceptId]) return;
  update((d) => {
    (d.conceptReads[playerId] ??= {})[conceptId] = Date.now();
  });
}

/**
 * Reading path steps a player has read share the concept-read ledger (it merges the same way), under keys no
 * concept id can take: "reading:biology.genetics".
 */
export const readingKey = (topicId: string): string => `reading:${topicId}`;

export function markReadingDone(playerId: string, topicId: string): void {
  markConceptRead(playerId, readingKey(topicId));
}

/* ---------------- concept cards ---------------- */

export function saveConceptCard(card: Omit<ConceptCard, 'updatedAt'>): void {
  update((d) => {
    d.conceptCards[card.id] = { ...card, updatedAt: new Date().toISOString() };
  });
}

/** A second player confirms the card (the author cannot review their own card). */
export function reviewConceptCard(id: string, reviewerId: string): void {
  update((d) => {
    const card = d.conceptCards[id];
    if (!card || card.authorId === reviewerId) return;
    d.conceptCards[id] = { ...card, status: 'reviewed', reviewerId, updatedAt: new Date().toISOString() };
  });
}

/* ---------------- lineups ---------------- */

/** Save a lineup (new when `id` is missing). Returns its id. */
export function saveLineup(fields: { id?: string; name: string; starters: string[]; alternates: string[] }): string {
  const id = fields.id ?? newId('l');
  const now = new Date().toISOString();
  update((d) => {
    const existing = d.lineups.find((l) => l.id === id);
    const name = fields.name.trim() || 'Lineup';
    if (existing) Object.assign(existing, { name, starters: fields.starters, alternates: fields.alternates, updatedAt: now });
    else d.lineups.unshift({ id, name, starters: fields.starters, alternates: fields.alternates, createdAt: now, updatedAt: now });
  });
  return id;
}

export function deleteLineup(id: string): void {
  update((d) => {
    d.lineups = d.lineups.filter((l) => l.id !== id);
    if (d.team?.nextEvent?.lineupId === id) delete d.team.nextEvent.lineupId;
  });
}

/** Make a saved lineup the one for the team's next competition (or clear it with null). */
export function setEventLineup(id: string | null): void {
  update((d) => {
    if (!d.team?.nextEvent) return;
    if (id) d.team.nextEvent.lineupId = id;
    else delete d.team.nextEvent.lineupId;
  });
}
