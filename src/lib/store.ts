/**
 * The team's data, stored in this browser (IndexedDB). Phase 0 keeps everything on the
 * device that runs practice; "Data" lets the team export and import a backup file.
 * A shared online database replaces this in a later phase without changing the pages,
 * because pages only use the hooks and actions below.
 */
import { useSyncExternalStore } from 'react';
import { del, get, set } from 'idb-keyval';
import type { DayPlan } from '../core/plan';
import {
  applyOutcome,
  cardId,
  cardStage,
  gradeCard,
  isStale,
  manualCard,
  normalizeCard,
  RETENTION,
  seasonPhase,
  type CardEvent,
  type Outcome,
  type ReviewCard,
} from '../core/review';
import type { MatchEvent } from '../core/rules/engine';
import type { Assignment, Completion, ConceptCard, Lineup, Player, QuestionKind, Subject, Team, TeamPacket, TeamVisual } from '../core/schema';
import { newId } from './format';
import { attemptOutcome, gameOutcomes } from './outcomes';

const KEY = 'rebound-data-v1';

export interface GamePairRef {
  tossupId: string;
  bonusId?: string;
  subject: Subject;
}

export interface GameRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  presetId: string;
  packet: { setId: string; setTitle: string; roundId: string; roundLabel: string; sourceUrl?: string };
  /** Snapshot of the questions in packet order, so stats never need to reload the set. */
  pairs: GamePairRef[];
  teams: [{ name: string; playerIds: string[] }, { name: string; playerIds: string[] }];
  events: MatchEvent[];
  status: 'in_progress' | 'finished';
  finalScores?: [number, number];
  /** The remote room this game is played in, when players join from their own devices. */
  roomId?: string;
  /** "tiebreak": a tiebreaker drill (5 toss-ups, no bonuses, no clock, repeated while tied). */
  format?: 'game' | 'tiebreak';
}

/** One answer in solo practice ("Try a round" while signed in as a player). */
export interface SoloAttempt {
  id: string;
  playerId: string;
  questionId: string;
  subject: Subject;
  kind: 'tossup' | 'bonus';
  correct: boolean;
  interrupt: boolean;
  latencyMs: number | null;
  /** True when the player overrode the checker's verdict. */
  overridden: boolean;
  t: number;
}

export interface ProblemReport {
  id: string;
  questionId: string;
  note: string;
  createdAt: string;
  status: 'open' | 'resolved';
}

export interface AppData {
  version: 1;
  team: Team | null;
  players: Player[];
  games: GameRecord[];
  /** playerId → questionId → when they last heard it (ms). */
  seen: Record<string, Record<string, number>>;
  attempts: SoloAttempt[];
  reports: ProblemReport[];
  /** Review cards, keyed by `${playerId}:${questionId}`. */
  cards: Record<string, ReviewCard>;
  /** Each player's plan for the current day, keyed by player id. */
  plans: Record<string, DayPlan>;
  lineups: Lineup[];
  packets: TeamPacket[];
  /** Concept cards, keyed by concept id. */
  conceptCards: Record<string, ConceptCard>;
  assignments: Assignment[];
  /** Keyed by `${assignmentId}:${playerId}`. */
  completions: Record<string, Completion>;
  /** playerId → conceptId → when they read that concept card. */
  conceptReads: Record<string, Record<string, number>>;
  /** Visual questions the team added, newest first. */
  visuals: TeamVisual[];
  settings: { sound: boolean; readingWpm: number; soloPlayerId: string | null; answerTimer: boolean; dailyMinutes: number };
  lastExportAt: string | null;
}

export function emptyData(): AppData {
  return {
    version: 1,
    team: null,
    players: [],
    games: [],
    seen: {},
    attempts: [],
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
    settings: { sound: true, readingWpm: 200, soloPlayerId: null, answerTimer: true, dailyMinutes: 30 },
    lastExportAt: null,
  };
}

let data: AppData = emptyData();
let status = { loaded: false, persistent: true };
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function save(): Promise<void> {
  try {
    await set(KEY, data);
    if (!status.persistent) {
      status = { ...status, persistent: true };
      emit();
    }
  } catch {
    if (status.persistent) {
      status = { ...status, persistent: false };
      emit();
    }
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save(), 200);
}

/** Load saved data. Call once before rendering. Works (in memory only) if storage is blocked. */
export async function initStore(): Promise<void> {
  try {
    const saved = await get<AppData>(KEY);
    if (saved && saved.version === 1) {
      data = normalize({ ...emptyData(), ...saved, settings: { ...emptyData().settings, ...saved.settings } });
      if (saved.cards === undefined) backfillCards(data);
    }
  } catch {
    status = { ...status, persistent: false };
  }
  status = { ...status, loaded: true };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(saveTimer);
        void save();
      }
    });
  }
  emit();
}

/** Run `listener` after every change to the data (for background sync). Returns an unsubscribe function. */
export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, () => data);
}

export function useStoreStatus(): { loaded: boolean; persistent: boolean } {
  return useSyncExternalStore(subscribe, () => status);
}

export function getData(): AppData {
  return data;
}

/** Change data through a draft copy; listeners re-render and the change is saved. */
export function update(mutate: (draft: AppData) => void): void {
  const draft = structuredClone(data);
  mutate(draft);
  data = draft;
  emit();
  scheduleSave();
}

/* ---------------- actions ---------------- */

export function createTeam(name: string, level: Team['level']): void {
  update((d) => {
    d.team = { id: newId('team'), name: name.trim() || 'Our team', level, createdAt: new Date().toISOString() };
  });
}

export function renameTeam(name: string, level: Team['level']): void {
  update((d) => {
    if (d.team) d.team = { ...d.team, name: name.trim() || d.team.name, level };
  });
}

export function addPlayer(fields: Omit<Player, 'id' | 'active'> & { active?: boolean }): string {
  const id = newId('p');
  update((d) => {
    d.players.push({ id, active: true, ...fields, name: fields.name.trim() });
  });
  return id;
}

export function updatePlayer(id: string, fields: Partial<Omit<Player, 'id'>>): void {
  update((d) => {
    const p = d.players.find((x) => x.id === id);
    if (p) Object.assign(p, fields);
  });
}

export function removePlayer(id: string): void {
  update((d) => {
    const p = d.players.find((x) => x.id === id);
    // Keep players who appear in games so old stats still have names; just mark them inactive.
    const inGames = d.games.some((g) => g.teams.some((t) => t.playerIds.includes(id)));
    if (p && inGames) p.active = false;
    else d.players = d.players.filter((x) => x.id !== id);
  });
}

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

export function finishGame(gameId: string, scores: [number, number]): void {
  update((d) => {
    const g = d.games.find((x) => x.id === gameId);
    if (!g) return;
    g.status = 'finished';
    g.finalScores = scores;
    g.updatedAt = new Date().toISOString();
    // Misses, slow buzzes and missed bonuses become review cards (each answer only once, even if the game is reopened).
    applyOutcomes(d, gameOutcomes(g, d.players));
  });
}

export function setGameRoom(gameId: string, roomId: string | undefined): void {
  update((d) => {
    const g = d.games.find((x) => x.id === gameId);
    if (g) g.roomId = roomId;
  });
}

export function deleteGame(gameId: string): void {
  update((d) => {
    d.games = d.games.filter((g) => g.id !== gameId);
  });
}

/** Record that these players heard these questions. */
export function markSeen(playerIds: string[], questionIds: string[], at = Date.now()): void {
  if (playerIds.length === 0 || questionIds.length === 0) return;
  const current = data.seen;
  const missing = playerIds.some((p) => questionIds.some((q) => !current[p]?.[q]));
  if (!missing) return;
  update((d) => {
    for (const p of playerIds) {
      const ledger = (d.seen[p] ??= {});
      for (const q of questionIds) ledger[q] ??= at;
    }
  });
}

export function addAttempt(attempt: Omit<SoloAttempt, 'id'>): void {
  update((d) => {
    const a = { ...attempt, id: newId('a') };
    d.attempts.push(a);
    applyOutcomes(d, [attemptOutcome(a)]);
  });
}

/* ---------------- review cards ---------------- */

/** The retention target in force at time `t` (it rises as the next competition gets close). */
export function retentionAt(d: AppData, t: number): number {
  return RETENTION[seasonPhase(t, d.team?.nextEvent?.date)];
}

/** Fill in fields that data saved by an earlier version lacks. */
function normalize(d: AppData): AppData {
  for (const id of Object.keys(d.cards)) d.cards[id] = normalizeCard(d.cards[id]);
  return d;
}

/** Data from before review cards existed: build cards from the practice already logged (recent misses only). */
function backfillCards(d: AppData): void {
  const outcomes = [...d.attempts.map(attemptOutcome), ...d.games.filter((g) => g.status === 'finished').flatMap((g) => gameOutcomes(g, d.players))];
  applyOutcomes(d, outcomes);
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

/** Put a question in a player's review queue: it comes up in the next review session. */
export function addToReview(playerId: string, q: { id: string; subject: Subject; kind: QuestionKind }): void {
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

/* ---------------- plans and the calendar ---------------- */

export function savePlan(plan: DayPlan): void {
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

export function setNextEvent(event: { name: string; date: string; finals?: boolean } | null): void {
  update((d) => {
    if (!d.team) return;
    if (event && /^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
      d.team.nextEvent = { name: event.name.trim(), date: event.date, lineupId: d.team.nextEvent?.lineupId, ...(event.finals ? { finals: true } : {}) };
    } else delete d.team.nextEvent;
    // Today's plans are rebuilt (keeping what is done) when the date moves them into another season phase.
  });
}

export function reportProblem(questionId: string, note: string): void {
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

export function updateSettings(fields: Partial<AppData['settings']>): void {
  update((d) => {
    d.settings = { ...d.settings, ...fields };
  });
}

export function exportData(): string {
  update((d) => {
    d.lastExportAt = new Date().toISOString();
  });
  return JSON.stringify({ app: 'rebound', exportedAt: new Date().toISOString(), data }, null, 2);
}

/** Replace all data with an exported file. Throws if the file is not a Rebound export. */
export function importData(json: string): void {
  const parsed = JSON.parse(json);
  const incoming = parsed?.data ?? parsed;
  if (!incoming || incoming.version !== 1 || !Array.isArray(incoming.players) || !Array.isArray(incoming.games)) {
    throw new Error('This file is not a Rebound data export.');
  }
  update((d) => {
    Object.assign(d, emptyData(), incoming, { settings: { ...emptyData().settings, ...incoming.settings } });
    normalize(d);
    if (incoming.cards === undefined) backfillCards(d);
  });
}

export async function resetAll(): Promise<void> {
  data = emptyData();
  emit();
  try {
    await del(KEY);
  } catch {
    /* storage unavailable: nothing to delete */
  }
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

/* ---------------- assignments ---------------- */

export function createAssignment(fields: Omit<Assignment, 'id' | 'createdAt'>): string {
  const id = newId('as');
  update((d) => {
    d.assignments.unshift({ ...fields, id, createdAt: new Date().toISOString() });
  });
  return id;
}

export function deleteAssignment(id: string): void {
  update((d) => {
    d.assignments = d.assignments.filter((a) => a.id !== id);
    for (const key of Object.keys(d.completions)) if (d.completions[key].assignmentId === id) delete d.completions[key];
  });
}

/** Record that a player finished an assignment (once). */
export function completeAssignment(assignmentId: string, playerId: string): void {
  const id = `${assignmentId}:${playerId}`;
  if (data.completions[id] || !data.assignments.some((a) => a.id === assignmentId && a.playerIds.includes(playerId))) return;
  update((d) => {
    d.completions[id] = { id, assignmentId, playerId, at: new Date().toISOString() };
  });
}

export function markConceptRead(playerId: string, conceptId: string): void {
  if (data.conceptReads[playerId]?.[conceptId]) return;
  update((d) => {
    (d.conceptReads[playerId] ??= {})[conceptId] = Date.now();
  });
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
