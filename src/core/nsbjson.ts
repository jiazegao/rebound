/**
 * NSB-JSON: Rebound's published format for Science Bowl questions and game logs (docs/NSB-JSON.md,
 * schema/nsb-json.schema.json). Every file is one JSON object, an "envelope":
 *
 *   { "nsbjson": "1.0", "kind": "question-set" | "questions" | "game-log", ...the payload }
 *
 * This module writes the three kinds from the site's own data and reads them back, checking the
 * envelope, the version and the basic shape with plain-language errors. It does not run a full schema
 * validator (that stays out of the site bundle); the JSON Schema is for other programs and the tests.
 * Pure: no DOM, no storage.
 */
import type { Level, Player, Question, QuestionSet } from './schema';
import type { MatchEvent, MatchEventType } from './rules/engine';
import { PRESETS, type RulesPreset } from './rules/presets';
import type { GamePairRef, GameRecord } from '../lib/store';

/** The version this module writes. Readers accept any 1.x file. */
export const NSBJSON_VERSION = '1.0';

export const NSBJSON_KINDS = ['question-set', 'questions', 'game-log'] as const;
export type NsbJsonKind = (typeof NSBJSON_KINDS)[number];

/** The program name written in `generator`. */
const GENERATOR = 'Rebound';

/** Fields every NSB-JSON document has. */
export interface NsbJsonEnvelope<K extends NsbJsonKind = NsbJsonKind> {
  /** Format version, "MAJOR.MINOR" (this module writes "1.0"). */
  nsbjson: string;
  kind: K;
  /** The program that wrote the file, e.g. "Rebound". */
  generator?: string;
  /** When the file was written (ISO 8601 date and time). */
  exportedAt?: string;
}

/** A whole question set: rounds of toss-up/bonus pairs. */
export interface QuestionSetDoc extends NsbJsonEnvelope<'question-set'> {
  set: QuestionSet;
}

/** A flat list of questions, e.g. a team's written questions. */
export interface QuestionsDoc extends NsbJsonEnvelope<'questions'> {
  title: string;
  /** Who wrote or published the questions. */
  credit?: string;
  /** What others may do with them, e.g. "Private to the team". */
  license?: string;
  level?: Level;
  questions: Question[];
}

/** The numbers a game was played under: everything the engine needs to re-score it. */
export type GameRules = Pick<RulesPreset, 'name' | 'points' | 'interruptFaultMode' | 'timing' | 'visualBonus' | 'clock' | 'maxTossups' | 'tiebreakTossups'>;

/** One game, as the Reader console recorded it (a GameRecord without device-only fields). */
export interface GameLog {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Rules preset id, e.g. "doe-regional-2027". */
  presetId: string;
  /** Season of the rules, e.g. "2027". */
  season: string;
  rules: GameRules;
  /** "tiebreak": a tiebreaker drill that starts as a 5-toss-up tiebreaker from 0–0 (the engine's `tiebreakOnly`). */
  format: 'game' | 'tiebreak';
  packet: GameRecord['packet'];
  /** The packet's questions, in reading order (pair index = position in this list). */
  pairs: GamePairRef[];
  /** Starting lineups (substitutions are `set_lineup` events). */
  teams: GameRecord['teams'];
  /** Display names for the player ids, when the exporting team chose to include them. */
  players?: Array<{ id: string; name: string }>;
  /** The event log, exactly as the engine replays it. */
  events: MatchEvent[];
  status: GameRecord['status'];
  finalScores?: [number, number];
}

export interface GameLogDoc extends NsbJsonEnvelope<'game-log'> {
  game: GameLog;
}

export type NsbJsonDoc = QuestionSetDoc | QuestionsDoc | GameLogDoc;

/** Optional settings for the writers. */
export interface WriteOptions {
  /** Overrides the time written in `exportedAt` (default: now). */
  exportedAt?: string;
}

/** A copy that is plain JSON data: what the file will hold, without `undefined` fields. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function envelope<K extends NsbJsonKind>(kind: K, opts: WriteOptions): NsbJsonEnvelope<K> {
  return { nsbjson: NSBJSON_VERSION, kind, generator: GENERATOR, exportedAt: opts.exportedAt ?? new Date().toISOString() };
}

export function toQuestionSetDoc(set: QuestionSet, opts: WriteOptions = {}): QuestionSetDoc {
  return plain({ ...envelope('question-set', opts), set });
}

export function toQuestionsDoc(
  questions: Question[],
  meta: { title: string; credit?: string; license?: string; level?: Level },
  opts: WriteOptions = {},
): QuestionsDoc {
  return plain({
    ...envelope('questions', opts),
    title: meta.title,
    ...(meta.credit ? { credit: meta.credit } : {}),
    ...(meta.license ? { license: meta.license } : {}),
    ...(meta.level ? { level: meta.level } : {}),
    questions,
  });
}

/**
 * One game as a game log. `players` (the team's roster) adds display names for the players in the game;
 * leave it out to export ids only. Throws if the game's rules preset is unknown (the log could not be re-scored).
 */
export function toGameLogDoc(game: GameRecord, opts: WriteOptions & { players?: Array<Pick<Player, 'id' | 'name'>> } = {}): GameLogDoc {
  const preset = PRESETS.find((p) => p.id === game.presetId);
  if (!preset) throw new Error(`This game was played under rules this version of Rebound does not know ("${game.presetId}"), so it cannot be exported.`);
  const inGame = new Set(game.teams.flatMap((t) => t.playerIds));
  for (const e of game.events) {
    if (e.type === 'buzz') inGame.add(e.playerId);
    if (e.type === 'set_lineup') e.playerIds.forEach((id) => inGame.add(id));
  }
  const players = (opts.players ?? []).filter((p) => inGame.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
  const { name, points, interruptFaultMode, timing, visualBonus, clock, maxTossups, tiebreakTossups } = preset;
  const log: GameLog = {
    id: game.id,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    presetId: game.presetId,
    season: preset.season,
    rules: { name, points, interruptFaultMode, timing, visualBonus, clock, maxTossups, tiebreakTossups },
    format: game.format ?? 'game',
    packet: game.packet,
    pairs: game.pairs,
    teams: game.teams,
    ...(players.length ? { players } : {}),
    events: game.events,
    status: game.status,
    ...(game.finalScores ? { finalScores: game.finalScores } : {}),
  };
  return plain({ ...envelope('game-log', opts), game: log });
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** A file that is not a readable NSB-JSON document. The message is meant for the person who chose the file. */
export class NsbJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NsbJsonError';
  }
}

/** Every event type the engine replays (a Record, so the compiler notices a new one). */
const EVENT_TYPES: Record<MatchEventType, true> = {
  start: true,
  tossup_read: true,
  buzz: true,
  tossup_judged: true,
  tossup_dead: true,
  bonus_read: true,
  bonus_judged: true,
  next: true,
  throw_out: true,
  clock_pause: true,
  clock_resume: true,
  time_expired: true,
  start_half: true,
  set_lineup: true,
  start_tiebreak: true,
  adjust_score: true,
  end_game: true,
};

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(message: string): never {
  throw new NsbJsonError(message);
}

/** The basics every consumer relies on: an object with an id, a question text and an answer. */
function checkQuestion(q: unknown, what: string): void {
  if (!isObject(q)) fail(`${what} is missing or is not a question.`);
  if (typeof q.id !== 'string' || q.id === '') fail(`${what} has no "id".`);
  if (typeof q.stem !== 'string') fail(`${what} has no question text ("stem").`);
  if (typeof q.answer !== 'string') fail(`${what} has no answer ("answer").`);
}

function checkQuestionSet(set: unknown): void {
  if (!isObject(set)) fail('This question set file has no "set" with the questions.');
  if (!Array.isArray(set.rounds)) fail('The question set has no "rounds" list.');
  set.rounds.forEach((round: unknown, i: number) => {
    const name = isObject(round) && typeof round.label === 'string' && round.label.trim() ? round.label.trim() : `round ${i + 1}`;
    if (!isObject(round) || !Array.isArray(round.pairs)) fail(`In the question set, ${name} has no "pairs" list.`);
    round.pairs.forEach((pair: unknown, j: number) => {
      const n = isObject(pair) && typeof pair.number === 'number' ? pair.number : j + 1;
      if (!isObject(pair)) fail(`In ${name}, pair ${j + 1} is not a toss-up and bonus pair.`);
      checkQuestion(pair.tossup, `Toss-up ${n} in ${name}`);
      if (pair.bonus !== undefined) checkQuestion(pair.bonus, `Bonus ${n} in ${name}`);
    });
  });
}

function checkQuestions(doc: Obj): void {
  if (typeof doc.title !== 'string') fail('This question list has no "title".');
  if (!Array.isArray(doc.questions)) fail('This question list has no "questions".');
  doc.questions.forEach((q: unknown, i: number) => checkQuestion(q, `Question ${i + 1}`));
}

function checkGameLog(game: unknown, newer: string | null): void {
  if (!isObject(game)) fail('This game log file has no "game".');
  if (typeof game.presetId !== 'string') fail('The game log does not say which rules it was played under ("presetId").');
  if (!isObject(game.rules)) fail('The game log does not include its scoring rules ("rules").');
  const teams = game.teams;
  if (!Array.isArray(teams) || teams.length !== 2 || !teams.every((t) => isObject(t) && typeof t.name === 'string' && Array.isArray(t.playerIds))) {
    fail('The game log should list exactly two teams, each with a "name" and "playerIds".');
  }
  if (!Array.isArray(game.pairs) || !game.pairs.every((p) => isObject(p) && typeof p.tossupId === 'string')) {
    fail('The game log has no list of the questions in its packet ("pairs").');
  }
  if (!Array.isArray(game.events)) fail('The game log has no "events" list.');
  game.events.forEach((e: unknown, i: number) => {
    if (!isObject(e) || typeof e.type !== 'string' || typeof e.t !== 'number') fail(`Event ${i + 1} in the game log is damaged: every event needs a "type" and a time "t".`);
    if (!Object.hasOwn(EVENT_TYPES, e.type)) {
      fail(`Event ${i + 1} in the game log is "${e.type}", which this site does not know${newer ? ` (the file uses NSB-JSON ${newer})` : ''}, so the game cannot be replayed.`);
    }
  });
}

/**
 * Parse an NSB-JSON file. Checks the envelope, the version (any 1.x), the kind and the basic shape of
 * the payload; fields this version does not know are kept but not used. Throws an NsbJsonError with
 * a plain-language message for anything else.
 */
export function readNsbJson(text: string): NsbJsonDoc {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    fail('This file is not valid JSON, so it is not an NSB-JSON file. It may be damaged or a different kind of file.');
  }
  if (!isObject(data)) fail('This is not an NSB-JSON file: it should hold one JSON object that starts with "nsbjson" and "kind".');

  if (!('nsbjson' in data)) {
    if (data.app === 'rebound' && isObject(data.data)) fail('This is a backup file from an older version of Rebound, not an NSB-JSON file. Rebound keeps practice in accounts now and does not load backups.');
    if (Array.isArray(data.rounds)) {
      fail('This looks like a question set without the NSB-JSON header. Add "nsbjson": "1.0" and "kind": "question-set" around it, or upload it as a packet.');
    }
    fail('This is not an NSB-JSON file: it has no "nsbjson" version.');
  }
  const version = data.nsbjson;
  if (typeof version !== 'string' || !/^\d+\.\d+$/.test(version)) {
    fail(`The "nsbjson" version should look like "1.0", but this file has ${JSON.stringify(version)}.`);
  }
  const [major, minor] = version.split('.').map(Number);
  if (major > 1) fail(`This file uses NSB-JSON ${version}, which is newer than this site can read (it reads version 1). Ask for a version 1 file.`);
  if (major < 1) fail(`This file says it uses NSB-JSON ${version}, but the first version is 1.0.`);
  const newer = minor > 0 ? version : null;

  const kind = data.kind;
  if (typeof kind !== 'string') fail('This NSB-JSON file does not say what it holds: "kind" should be "question-set", "questions" or "game-log".');
  if (!(NSBJSON_KINDS as readonly string[]).includes(kind)) {
    fail(`This NSB-JSON file holds "${kind}", which this site cannot read${newer ? ` (the file uses NSB-JSON ${newer})` : ''}. It reads "question-set", "questions" and "game-log".`);
  }

  switch (kind as NsbJsonKind) {
    case 'question-set':
      checkQuestionSet(data.set);
      break;
    case 'questions':
      checkQuestions(data);
      break;
    case 'game-log':
      checkGameLog(data.game, newer);
      break;
  }
  return data as unknown as NsbJsonDoc;
}
