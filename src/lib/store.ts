/**
 * The team's data, stored in this browser (IndexedDB). Phase 0 keeps everything on the
 * device that runs practice; "Data" lets the team export and import a backup file.
 * A shared online database replaces this in a later phase without changing the pages,
 * because pages only use the hooks and actions below.
 */
import { useSyncExternalStore } from 'react';
import { del, get, set } from 'idb-keyval';
import type { MatchEvent } from '../core/rules/engine';
import type { Player, Subject, Team } from '../core/schema';
import { newId } from './format';

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
  settings: { sound: boolean; readingWpm: number; soloPlayerId: string | null };
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
    settings: { sound: true, readingWpm: 200, soloPlayerId: null },
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
    if (saved && saved.version === 1) data = { ...emptyData(), ...saved, settings: { ...emptyData().settings, ...saved.settings } };
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
    d.attempts.push({ ...attempt, id: newId('a') });
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
