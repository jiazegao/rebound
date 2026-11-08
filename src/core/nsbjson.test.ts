/**
 * NSB-JSON: the writers' output and real data must validate against the published JSON Schema
 * (schema/nsb-json.schema.json), the schema must match the TypeScript types field for field, the
 * examples in docs/NSB-JSON.md must validate, and readNsbJson must round-trip files and explain bad ones.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import type { GamePairRef, GameRecord } from '../lib/store';
import {
  NSBJSON_KINDS,
  NSBJSON_VERSION,
  NsbJsonError,
  readNsbJson,
  toGameLogDoc,
  toQuestionSetDoc,
  toQuestionsDoc,
  type GameLog,
  type GameLogDoc,
  type GameRules,
  type QuestionsDoc,
  type QuestionSetDoc,
} from './nsbjson';
import { replay, type BonusResult, type EventInput, type MatchEvent, type MatchEventType, type TossupResult } from './rules/engine';
import { getPreset, type InterruptFaultMode, type RulesPreset } from './rules/presets';
import { CORE_SUBJECTS, LETTERS, SUBJECT_LABELS, type AnswerFormat, type Level, type Provider, type Question, type QuestionKind, type QuestionPair, type QuestionSet, type QuestionSource, type Round } from './schema';
import { generateVisual, VISUAL_TEMPLATES } from './visual';

/* ---------------- the schema and a validator ---------------- */

type JsonSchema = {
  required?: string[];
  properties?: Record<string, JsonSchema>;
  enum?: unknown[];
  oneOf?: JsonSchema[];
  allOf?: Array<{ if?: JsonSchema; then?: JsonSchema }>;
  const?: unknown;
  [key: string]: unknown;
};

const root = process.cwd();
const schema = JSON.parse(readFileSync(join(root, 'schema/nsb-json.schema.json'), 'utf8')) as JsonSchema & { $defs: Record<string, JsonSchema> };
const defs = schema.$defs;

const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  formats: {
    'date-time': (s: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)),
    uri: (s: string) => {
      try {
        return /^[a-z][a-z0-9+.-]*:/i.test(s) && new URL(s).href.length > 0;
      } catch {
        return false;
      }
    },
  },
});
const validate = ajv.compile(schema);

/** The schema's errors for a document (an empty list when it is valid), easy to read in a failed test. */
function schemaErrors(doc: unknown): string[] {
  return validate(doc) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);
}

/* ---------------- data ---------------- */

const doeDir = join(root, 'public/data/doe');
const loadSet = (id: string) => JSON.parse(readFileSync(join(doeDir, `${id}.json`), 'utf8')) as QuestionSet;
const haveDoe = existsSync(join(doeDir, 'doe-hs-01.json')) && existsSync(join(doeDir, 'doe-hs-17.json'));

function question(fields: Partial<Question> & Pick<Question, 'id' | 'kind'>): Question {
  return {
    number: 1,
    subject: 'chemistry',
    sourceCategory: 'CHEMISTRY',
    format: 'short_answer',
    stem: 'What is the conjugate base of nitric acid?',
    answer: 'NITRATE',
    accept: ['NO₃⁻'],
    reject: [],
    answerRaw: 'NITRATE (ACCEPT: NO₃⁻)',
    source: { provider: 'team', setId: 'team-pk-1', roundId: 'team-pk-1-r01', credit: 'Written by the team' },
    ...fields,
  };
}

/** A small set that does not need the DOE files. */
const smallSet: QuestionSet = {
  id: 'team-pk-1',
  provider: 'team',
  level: 'HS',
  title: 'Practice packet',
  credit: 'Written by the team',
  license: 'Private to the team',
  rounds: [
    {
      id: 'team-pk-1-r01',
      label: 'Round 1',
      order: 1,
      pairs: [
        {
          number: 1,
          tossup: question({ id: 'team-pk-1-r01-t01', kind: 'tossup' }),
          bonus: question({
            id: 'team-pk-1-r01-b01',
            kind: 'bonus',
            format: 'multiple_choice',
            stem: 'Which of the following is a noble gas?',
            choices: { W: 'Nitrogen', X: 'Argon', Y: 'Chlorine', Z: 'Sodium' },
            answer: 'Argon',
            answerLetter: 'X',
            accept: [],
            answerRaw: 'X) ARGON',
          }),
        },
        { number: 2, tossup: question({ id: 'team-pk-1-r01-t02', kind: 'tossup', number: 2 }) },
      ],
    },
  ],
};

const A = 0 as const;
const B = 1 as const;

/** A short game touching most event types: rebounds, an interrupt fault, a throw-out, the clock, a challenge, halftime and a substitution. */
const GAME_EVENTS: EventInput[] = [
  { type: 'start' },
  { type: 'tossup_read' },
  { type: 'buzz', team: A, playerId: 'p-ann' },
  { type: 'tossup_judged', result: 'incorrect' },
  { type: 'buzz', team: B, playerId: 'p-bo' },
  { type: 'tossup_judged', result: 'correct' },
  { type: 'bonus_read' },
  { type: 'bonus_judged', result: 'correct' },
  { type: 'next' },
  { type: 'buzz', team: A, playerId: 'p-al' },
  { type: 'tossup_judged', result: 'incorrect' },
  { type: 'tossup_read' },
  { type: 'tossup_dead' },
  { type: 'next' },
  { type: 'throw_out', note: 'Misread' },
  { type: 'next' },
  { type: 'clock_pause' },
  { type: 'clock_resume' },
  { type: 'tossup_read' },
  { type: 'buzz', team: A, playerId: 'p-ann' },
  { type: 'tossup_judged', result: 'correct' },
  { type: 'bonus_read', visual: true },
  { type: 'bonus_judged', result: 'timeout' },
  { type: 'adjust_score', team: A, delta: 4, note: 'Challenge upheld' },
  { type: 'time_expired' },
  { type: 'next' },
  { type: 'set_lineup', team: B, playerIds: ['p-bo', 'p-bea'] },
  { type: 'start_half' },
  { type: 'tossup_read' },
  { type: 'buzz', team: B, playerId: 'p-bea' },
  { type: 'tossup_judged', result: 'blurt' },
  { type: 'tossup_dead' },
  { type: 'end_game' },
];

function sampleGame(pairs: GamePairRef[]): GameRecord {
  const events = GAME_EVENTS.map((e, i) => ({ ...e, t: 1_700_000_000_000 + i * 1_500 }) as MatchEvent);
  const teams: GameRecord['teams'] = [
    { name: 'Gold', playerIds: ['p-ann', 'p-al'] },
    { name: 'Blue', playerIds: ['p-bo', 'p-ben'] },
  ];
  const state = replay({ preset: getPreset('doe-regional-2027'), teams, pairCount: pairs.length }, events);
  return {
    id: 'g-test1',
    createdAt: '2026-11-01T18:00:00.000Z',
    updatedAt: '2026-11-01T18:20:00.000Z',
    presetId: 'doe-regional-2027',
    packet: { setId: 'doe-hs-17', setTitle: 'DOE High School Sample Set 17', roundId: 'doe-hs-17-r01', roundLabel: 'Round 1', sourceUrl: 'https://science.osti.gov/-/media/wdts/nsb/pdf/HS-Sample-Questions/Sample-Set-17/2022-HS-1.pdf' },
    pairs,
    teams,
    events,
    status: 'finished',
    finalScores: state.scores,
    roomId: 'room-should-not-be-exported',
  };
}

const PAIRS: GamePairRef[] = Array.from({ length: 6 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { tossupId: `doe-hs-17-r01-t${n}`, ...(i === 5 ? {} : { bonusId: `doe-hs-17-r01-b${n}` }), subject: CORE_SUBJECTS[i % 6] };
});

const ROSTER = [
  { id: 'p-ann', name: 'Ann' },
  { id: 'p-al', name: 'Al' },
  { id: 'p-bo', name: 'Bo' },
  { id: 'p-ben', name: 'Ben' },
  { id: 'p-bea', name: 'Bea' },
  { id: 'p-cy', name: 'Cy (not in this game)' },
];

/* ---------------- writing and validating ---------------- */

describe('NSB-JSON documents validate against the schema', () => {
  it('compiles in strict mode', () => {
    expect(typeof validate).toBe('function');
  });

  it.skipIf(!haveDoe)('accepts real DOE sets in a question-set document (the oldest and the newest)', () => {
    for (const id of ['doe-hs-01', 'doe-hs-17']) {
      const doc = toQuestionSetDoc(loadSet(id));
      expect(doc).toMatchObject({ nsbjson: NSBJSON_VERSION, kind: 'question-set', generator: 'Rebound' });
      expect(schemaErrors(doc), id).toEqual([]);
    }
  });

  it('accepts a small team set, with a pair that has no bonus', () => {
    expect(schemaErrors(toQuestionSetDoc(smallSet))).toEqual([]);
  });

  it('accepts a questions document with generated figures, a team picture and DOE questions', () => {
    const generated = VISUAL_TEMPLATES.flatMap((t) => [1, 2].map((seed) => generateVisual(t.id, seed))).filter((q): q is Question => q !== null);
    expect(generated.length).toBeGreaterThan(40);
    const teamPicture = question({
      id: 'vtm-v-abc123',
      kind: 'bonus',
      subject: 'earth_space',
      sourceCategory: 'EARTH AND SPACE',
      stem: 'What type of cloud is shown?',
      answer: 'CUMULUS',
      accept: [],
      answerRaw: 'CUMULUS',
      visual: true,
      figure: { kind: 'image', src: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', alt: 'Puffy white clouds', credit: 'Photo by Ann' },
    });
    const doe = haveDoe ? loadSet('doe-hs-17').rounds[0].pairs.flatMap((p) => [p.tossup, p.bonus!]) : [];
    const doc = toQuestionsDoc([...generated, teamPicture, ...doe], { title: 'Mixed questions', credit: 'Rebound and DOE', license: 'Private to the team', level: 'HS' });
    expect(doc.questions).toHaveLength(generated.length + 1 + doe.length);
    expect(schemaErrors(doc)).toEqual([]);
  });

  it('accepts a game log from a replayed game, and the log re-scores to the same result from its own rules', () => {
    const game = sampleGame(PAIRS);
    expect(game.finalScores).toEqual([8, 18]);
    const doc = toGameLogDoc(game, { players: ROSTER, exportedAt: '2026-11-02T08:00:00.000Z' });
    expect(schemaErrors(doc)).toEqual([]);

    const log = doc.game;
    expect(doc.exportedAt).toBe('2026-11-02T08:00:00.000Z');
    expect(log).toMatchObject({ presetId: 'doe-regional-2027', season: '2027', format: 'game', status: 'finished', finalScores: [8, 18] });
    expect(log).not.toHaveProperty('roomId');
    expect(log.events).toEqual(game.events);
    expect(log.pairs).toEqual(PAIRS);
    expect(log.players?.map((p) => p.id).sort()).toEqual(['p-al', 'p-ann', 'p-bea', 'p-ben', 'p-bo']);

    // Another program needs only the file: rebuild a preset from the snapshot and replay.
    const fromFile: RulesPreset = {
      ...log.rules,
      id: log.presetId,
      season: log.season,
      summary: '',
      official: false,
      unsuccessfulChallengeLimit: null,
      communication: { tossup: '', bonus: '' },
      notes: [],
      source: null,
    };
    const rescored = replay({ preset: fromFile, teams: log.teams, pairCount: log.pairs.length, tiebreakOnly: log.format === 'tiebreak' }, log.events);
    expect(rescored.scores).toEqual([8, 18]);
    expect(rescored.endedReason).toBe('manual');
  });

  it('writes a tiebreak drill and a game without names', () => {
    const game: GameRecord = { ...sampleGame(PAIRS), format: 'tiebreak', status: 'in_progress', events: [{ type: 'start', t: 5 }], finalScores: undefined };
    const doc = toGameLogDoc(game);
    expect(doc.game.format).toBe('tiebreak');
    expect(doc.game).not.toHaveProperty('players');
    expect(doc.game).not.toHaveProperty('finalScores');
    expect(schemaErrors(doc)).toEqual([]);
  });

  it('refuses to export a game played under unknown rules', () => {
    expect(() => toGameLogDoc({ ...sampleGame(PAIRS), presetId: 'old-preset' })).toThrow(/rules this version of Rebound does not know/);
  });

  it('rejects documents that break the format', () => {
    const set = toQuestionSetDoc(smallSet);
    const tossup = set.set.rounds[0].pairs[0].tossup;
    const broken: Array<[string, unknown]> = [
      ['a newer major version', { ...set, nsbjson: '2.0' }],
      ['an unknown kind', { ...set, kind: 'tournament' }],
      ['a game log without its game', { nsbjson: '1.0', kind: 'game-log' }],
      ['an unknown subject', { ...set, set: { ...set.set, rounds: [{ ...set.set.rounds[0], pairs: [{ number: 1, tossup: { ...tossup, subject: 'astronomy' } }] }] } }],
      ['a bonus in the toss-up place', { ...set, set: { ...set.set, rounds: [{ ...set.set.rounds[0], pairs: [{ number: 1, tossup: { ...tossup, kind: 'bonus' } }] }] } }],
      ['a fifth choice', toQuestionsDoc([{ ...tossup, format: 'multiple_choice', choices: { W: 'a', X: 'b', Y: 'c', Z: 'd', V: 'e' } as never }], { title: 't' })],
      ['a missing answer line', toQuestionsDoc([{ ...tossup, answerRaw: undefined as never }], { title: 't' })],
      ['a buzz without a player', (() => {
        const doc = toGameLogDoc(sampleGame(PAIRS));
        (doc.game.events[2] as unknown as Record<string, unknown>).playerId = undefined;
        return JSON.parse(JSON.stringify(doc));
      })()],
      ['a lineup of five', (() => {
        const doc = toGameLogDoc(sampleGame(PAIRS));
        doc.game.teams[0].playerIds = ['a', 'b', 'c', 'd', 'e'];
        return doc;
      })()],
    ];
    for (const [what, doc] of broken) expect(schemaErrors(doc), what).not.toEqual([]);
  });
});

/* ---------------- reading ---------------- */

describe('readNsbJson', () => {
  it('round-trips all three kinds', () => {
    const docs = [
      toQuestionSetDoc(haveDoe ? loadSet('doe-hs-17') : smallSet),
      toQuestionsDoc(smallSet.rounds[0].pairs.map((p) => p.tossup), { title: 'Our questions' }),
      toGameLogDoc(sampleGame(PAIRS), { players: ROSTER }),
    ];
    for (const doc of docs) expect(readNsbJson(JSON.stringify(doc, null, 2))).toEqual(doc);
  });

  it('reads later 1.x files and keeps the fields it does not know', () => {
    const doc = { ...toQuestionSetDoc(smallSet), nsbjson: '1.4', futureField: { x: 1 } };
    expect(readNsbJson(JSON.stringify(doc))).toEqual(doc);
    expect(readNsbJson(`﻿${JSON.stringify(doc)}`).kind).toBe('question-set');
  });

  const set = toQuestionSetDoc(smallSet);
  const game = toGameLogDoc(sampleGame(PAIRS));
  const cases: Array<[string, string, RegExp]> = [
    ['damaged JSON', '{"nsbjson": "1.0", ', /not valid JSON/],
    ['a list', '[1, 2]', /should hold one JSON object/],
    ['a Rebound backup', JSON.stringify({ app: 'rebound', exportedAt: 'x', data: { version: 1 } }), /backup file from an older version of Rebound/],
    ['a set without the header', JSON.stringify(smallSet), /question set without the NSB-JSON header/],
    ['no version', JSON.stringify({ kind: 'questions' }), /has no "nsbjson" version/],
    ['a version as a number', JSON.stringify({ ...set, nsbjson: 1 }), /should look like "1\.0".*1\b/],
    ['a newer major version', JSON.stringify({ ...set, nsbjson: '2.1' }), /NSB-JSON 2\.1, which is newer than this site can read/],
    ['version 0', JSON.stringify({ ...set, nsbjson: '0.9' }), /first version is 1\.0/],
    ['no kind', JSON.stringify({ nsbjson: '1.0' }), /does not say what it holds/],
    ['an unknown kind', JSON.stringify({ nsbjson: '1.2', kind: 'tournament' }), /holds "tournament".*NSB-JSON 1\.2/],
    ['a set without rounds', JSON.stringify({ ...set, set: { ...set.set, rounds: undefined } }), /no "rounds" list/],
    ['a round without pairs', JSON.stringify({ ...set, set: { ...set.set, rounds: [{ label: 'Round 1A' }] } }), /Round 1A has no "pairs" list/],
    [
      'a toss-up without an answer',
      JSON.stringify({ ...set, set: { ...set.set, rounds: [{ label: 'Round 1', pairs: [{ number: 3, tossup: { id: 'x', stem: 'Why?' } }] }] } }),
      /^Toss-up 3 in Round 1 has no answer \("answer"\)\.$/,
    ],
    [
      'a bonus without a stem',
      JSON.stringify({ ...set, set: { ...set.set, rounds: [{ pairs: [{ number: 1, tossup: { id: 'x', stem: 's', answer: 'a' }, bonus: { id: 'y', answer: 'a' } }] }] } }),
      /^Bonus 1 in round 1 has no question text/,
    ],
    ['a question list without a title', JSON.stringify({ nsbjson: '1.0', kind: 'questions', questions: [] }), /no "title"/],
    ['a question list with a broken question', JSON.stringify({ nsbjson: '1.0', kind: 'questions', title: 't', questions: [{ id: 'a', stem: 's', answer: 'x' }, 'oops'] }), /^Question 2 is missing or is not a question\.$/],
    ['a game log with one team', JSON.stringify({ ...game, game: { ...game.game, teams: [game.game.teams[0]] } }), /exactly two teams/],
    ['a game log without rules', JSON.stringify({ ...game, game: { ...game.game, rules: undefined } }), /scoring rules/],
    ['a damaged event', JSON.stringify({ ...game, game: { ...game.game, events: [{ type: 'start' }] } }), /Event 1 in the game log is damaged/],
    [
      'an unknown event from a later version',
      JSON.stringify({ ...game, nsbjson: '1.1', game: { ...game.game, events: [{ type: 'start', t: 1 }, { type: 'timeout_called', t: 2 }] } }),
      /Event 2 in the game log is "timeout_called".*NSB-JSON 1\.1.*cannot be replayed/,
    ],
  ];
  for (const [what, text, message] of cases) {
    it(`explains ${what}`, () => {
      let error: unknown;
      try {
        readNsbJson(text);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(NsbJsonError);
      expect((error as Error).message).toMatch(message);
    });
  }
});

/* ---------------- the schema matches the TypeScript types ---------------- */

/** Keys of T that are required / optional, as records the compiler checks against the type. */
type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T] & string;
type OptionalKeys<T> = Exclude<keyof T & string, RequiredKeys<T>>;
interface Shape<T> {
  required: Record<RequiredKeys<T>, true>;
  optional: Record<OptionalKeys<T>, true>;
}

const sorted = (xs: Iterable<string>) => [...xs].sort();

function expectShape(name: string, def: JsonSchema, shape: Shape<unknown> | { required: object; optional: object }, base: JsonSchema = {}) {
  const required = [...(base.required ?? []), ...(def.required ?? [])];
  const properties = [...Object.keys(base.properties ?? {}), ...Object.keys(def.properties ?? {})];
  expect(sorted(required), `${name}: required`).toEqual(sorted(Object.keys(shape.required)));
  expect(sorted(properties), `${name}: properties`).toEqual(sorted([...Object.keys(shape.required), ...Object.keys(shape.optional)]));
}

const QUESTION: Shape<Question> = {
  required: { id: true, kind: true, number: true, subject: true, sourceCategory: true, format: true, stem: true, answer: true, accept: true, reject: true, answerRaw: true, source: true },
  optional: { choices: true, answerLetter: true, notes: true, visual: true, figure: true, flags: true, topic: true, concepts: true, crossSubject: true },
};
const SOURCE: Shape<QuestionSource> = { required: { provider: true, setId: true, roundId: true, credit: true }, optional: { url: true, page: true } };
const PAIR: Shape<QuestionPair> = { required: { number: true, tossup: true }, optional: { bonus: true } };
const ROUND: Shape<Round> = { required: { id: true, label: true, order: true, pairs: true }, optional: { sourceUrl: true } };
const SET: Shape<QuestionSet> = {
  required: { id: true, provider: true, level: true, title: true, credit: true, license: true, rounds: true },
  optional: { year: true, setNumber: true, sourcePage: true },
};
const SVG_FIGURE: Shape<Extract<NonNullable<Question['figure']>, { kind: 'svg' }>> = { required: { kind: true, svg: true, alt: true }, optional: {} };
const IMAGE_FIGURE: Shape<Extract<NonNullable<Question['figure']>, { kind: 'image' }>> = { required: { kind: true, src: true, alt: true }, optional: { credit: true, sourceUrl: true } };

const SET_DOC: Shape<QuestionSetDoc> = { required: { nsbjson: true, kind: true, set: true }, optional: { generator: true, exportedAt: true } };
const QUESTIONS_DOC: Shape<QuestionsDoc> = {
  required: { nsbjson: true, kind: true, title: true, questions: true },
  optional: { generator: true, exportedAt: true, credit: true, license: true, level: true },
};
const GAME_DOC: Shape<GameLogDoc> = { required: { nsbjson: true, kind: true, game: true }, optional: { generator: true, exportedAt: true } };
const GAME: Shape<GameLog> = {
  required: { id: true, createdAt: true, updatedAt: true, presetId: true, season: true, rules: true, format: true, packet: true, pairs: true, teams: true, events: true, status: true },
  optional: { players: true, finalScores: true },
};
const PACKET: Shape<GameRecord['packet']> = { required: { setId: true, setTitle: true, roundId: true, roundLabel: true }, optional: { sourceUrl: true } };
const GAME_PAIR: Shape<GamePairRef> = { required: { tossupId: true, subject: true }, optional: { bonusId: true } };
const TEAM: Shape<GameRecord['teams'][number]> = { required: { name: true, playerIds: true }, optional: {} };
const PLAYER: Shape<NonNullable<GameLog['players']>[number]> = { required: { id: true, name: true }, optional: {} };
const RULES: Shape<GameRules> = {
  required: { name: true, points: true, interruptFaultMode: true, timing: true, visualBonus: true, clock: true, maxTossups: true, tiebreakTossups: true },
  optional: {},
};
const POINTS: Shape<GameRules['points']> = { required: { tossup: true, bonus: true, interruptFault: true }, optional: {} };
const TIMING: Shape<GameRules['timing']> = { required: { tossupWindowSec: true, reboundWindowSec: true, bonusSec: true, bonusWarningAtSec: true, naturalPauseSec: true }, optional: {} };
const CLOCK: Shape<NonNullable<GameRules['clock']>> = { required: { halves: true, halfMinutes: true, breakMinutes: true }, optional: {} };
const VISUAL_BONUS: Shape<NonNullable<GameRules['visualBonus']>> = { required: { sec: true, warningAtSec: true }, optional: {} };

const plainEvent = { required: { type: true, t: true }, optional: {} } as const;
const EVENTS: { [T in MatchEventType]: Shape<Extract<MatchEvent, { type: T }>> } = {
  start: plainEvent,
  tossup_read: plainEvent,
  buzz: { required: { type: true, t: true, team: true, playerId: true }, optional: {} },
  tossup_judged: { required: { type: true, t: true, result: true }, optional: {} },
  tossup_dead: plainEvent,
  bonus_read: { required: { type: true, t: true }, optional: { visual: true } },
  bonus_judged: { required: { type: true, t: true, result: true }, optional: {} },
  next: plainEvent,
  throw_out: { required: { type: true, t: true }, optional: { note: true } },
  clock_pause: plainEvent,
  clock_resume: plainEvent,
  time_expired: plainEvent,
  start_half: plainEvent,
  set_lineup: { required: { type: true, t: true, team: true, playerIds: true }, optional: {} },
  start_tiebreak: plainEvent,
  adjust_score: { required: { type: true, t: true, team: true, delta: true, note: true }, optional: {} },
  end_game: plainEvent,
};

const PROVIDERS: Record<Provider, true> = { doe: true, sbreader: true, team: true, rebound: true, other: true };
const LEVELS: Record<Level, true> = { HS: true, MS: true };
const FORMATS: Record<AnswerFormat, true> = { short_answer: true, multiple_choice: true };
const QUESTION_KINDS: Record<QuestionKind, true> = { tossup: true, bonus: true };
const TOSSUP_RESULTS: Record<TossupResult, true> = { correct: true, incorrect: true, blurt: true, stall: true, communication: true };
const BONUS_RESULTS: Record<BonusResult, true> = { correct: true, incorrect: true, timeout: true };
const FAULT_MODES: Record<InterruptFaultMode, true> = { opponent_gains: true, interrupter_loses: true };
const STATUSES: Record<GameLog['status'], true> = { in_progress: true, finished: true };
const GAME_FORMATS: Record<GameLog['format'], true> = { game: true, tiebreak: true };

/** The `then` part of the event schema for one event type (an empty schema when it has no fields of its own). */
function eventFields(type: string): JsonSchema {
  const branch = defs.matchEvent.allOf?.find((b) => b.if?.properties?.type?.const === type);
  return branch?.then ?? {};
}

describe('the schema matches the TypeScript types', () => {
  it('has the same required and optional fields', () => {
    expectShape('question', defs.question, QUESTION);
    expectShape('questionSource', defs.questionSource, SOURCE);
    expectShape('questionPair', defs.questionPair, PAIR);
    expectShape('round', defs.round, ROUND);
    expectShape('questionSet', defs.questionSet, SET);
    expectShape('svg figure', defs.figure.oneOf![0], SVG_FIGURE);
    expectShape('image figure', defs.figure.oneOf![1], IMAGE_FIGURE);
    expectShape('question-set document', defs.questionSetDoc, SET_DOC, schema);
    expectShape('questions document', defs.questionsDoc, QUESTIONS_DOC, schema);
    expectShape('game-log document', defs.gameLogDoc, GAME_DOC, schema);
    expectShape('gameLog', defs.gameLog, GAME);
    expectShape('gamePacket', defs.gamePacket, PACKET);
    expectShape('gamePair', defs.gamePair, GAME_PAIR);
    expectShape('gameTeam', defs.gameTeam, TEAM);
    expectShape('gamePlayer', defs.gamePlayer, PLAYER);
    expectShape('gameRules', defs.gameRules, RULES);
    expectShape('points', defs.gameRules.properties!.points, POINTS);
    expectShape('timing', defs.gameRules.properties!.timing, TIMING);
    expectShape('clock', defs.gameRules.properties!.clock.oneOf![1], CLOCK);
    expectShape('visualBonus', defs.gameRules.properties!.visualBonus.oneOf![1], VISUAL_BONUS);
    for (const [type, shape] of Object.entries(EVENTS)) expectShape(`event ${type}`, eventFields(type), shape, defs.matchEvent);
  });

  it('has the same enums', () => {
    const keys = (r: object) => sorted(Object.keys(r));
    expect(sorted(defs.subject.enum as string[])).toEqual(keys(SUBJECT_LABELS));
    expect(defs.coreSubject.enum).toEqual(CORE_SUBJECTS);
    expect(defs.letter.enum).toEqual(LETTERS);
    expect(sorted(defs.provider.enum as string[])).toEqual(keys(PROVIDERS));
    expect(sorted(defs.level.enum as string[])).toEqual(keys(LEVELS));
    expect(sorted(defs.question.properties!.format.enum as string[])).toEqual(keys(FORMATS));
    expect(sorted(defs.question.properties!.kind.enum as string[])).toEqual(keys(QUESTION_KINDS));
    expect(schema.properties!.kind.enum).toEqual([...NSBJSON_KINDS]);
    expect(sorted(defs.matchEvent.properties!.type.enum as string[])).toEqual(keys(EVENTS));
    expect(sorted(eventFields('tossup_judged').properties!.result.enum as string[])).toEqual(keys(TOSSUP_RESULTS));
    expect(sorted(eventFields('bonus_judged').properties!.result.enum as string[])).toEqual(keys(BONUS_RESULTS));
    expect(sorted(defs.gameRules.properties!.interruptFaultMode.enum as string[])).toEqual(keys(FAULT_MODES));
    expect(sorted(defs.gameLog.properties!.status.enum as string[])).toEqual(keys(STATUSES));
    expect(sorted(defs.gameLog.properties!.format.enum as string[])).toEqual(keys(GAME_FORMATS));
  });
});

/* ---------------- the specification ---------------- */

describe('docs/NSB-JSON.md', () => {
  const spec = readFileSync(join(root, 'docs/NSB-JSON.md'), 'utf8');
  const examples = [...spec.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>).filter((x) => 'nsbjson' in x);

  it('has an example of each kind, and every example is valid and readable', () => {
    expect(sorted(new Set(examples.map((x) => String(x.kind))))).toEqual(sorted(NSBJSON_KINDS));
    for (const example of examples) {
      expect(schemaErrors(example), JSON.stringify(example).slice(0, 80)).toEqual([]);
      expect(readNsbJson(JSON.stringify(example))).toEqual(example);
    }
  });

  it('has a game log example that re-scores to its final scores with the engine', () => {
    const games = examples.filter((x) => x.kind === 'game-log').map((x) => (x as unknown as GameLogDoc).game);
    expect(games.length).toBeGreaterThan(0);
    for (const g of games) {
      const preset = { ...getPreset(g.presetId), ...g.rules };
      expect(preset).toEqual(getPreset(g.presetId));
      const state = replay({ preset, teams: g.teams, pairCount: g.pairs.length, tiebreakOnly: g.format === 'tiebreak' }, g.events);
      expect(state.scores).toEqual(g.finalScores);
    }
  });

  it('states the version this module writes', () => {
    expect(spec).toContain(`# NSB-JSON ${NSBJSON_VERSION}`);
    expect(schema.title).toBe(`NSB-JSON ${NSBJSON_VERSION}`);
  });
});
