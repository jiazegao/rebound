import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchEvent } from '../core/rules/engine';
import { cardId } from '../core/review';
import { freshTopicCounts, heardLedger, planFor, playerDue, playerObservations } from './learning';
import { gameOutcomes } from './outcomes';
import { addAttempt, addToReview, applyAnswers, emptyData, finishGame, getData, markSeen, setNextEvent, update, type GameRecord } from './store';

// Times are real timestamps so cards land on real days.
const T = new Date(2026, 10, 7, 16).getTime();
const DAY = 86_400_000;

const events: MatchEvent[] = [
  { type: 'start', t: T },
  // Toss-up 1 (biology): Ann answers 1.5 s after the reading; the bonus is right.
  { type: 'tossup_read', t: T + 10_000 },
  { type: 'buzz', team: 0, playerId: 'ann', t: T + 11_500 },
  { type: 'tossup_judged', result: 'correct', t: T + 12_000 },
  { type: 'bonus_read', t: T + 20_000 },
  { type: 'bonus_judged', result: 'correct', t: T + 30_000 },
  { type: 'next', t: T + 31_000 },
  // Toss-up 2 (math): Bea interrupts wrong; Abe answers the re-read 4 s after it ends (slow); team A misses the bonus.
  { type: 'buzz', team: 1, playerId: 'bea', t: T + 33_000 },
  { type: 'tossup_judged', result: 'incorrect', t: T + 34_000 },
  { type: 'tossup_read', t: T + 40_000 },
  { type: 'buzz', team: 0, playerId: 'abe', t: T + 44_000 },
  { type: 'tossup_judged', result: 'correct', t: T + 45_000 },
  { type: 'bonus_read', t: T + 46_000 },
  { type: 'bonus_judged', result: 'incorrect', t: T + 60_000 },
  { type: 'next', t: T + 61_000 },
  // Toss-up 3 (physics): nobody answers.
  { type: 'tossup_read', t: T + 70_000 },
  { type: 'tossup_dead', t: T + 75_000 },
];

function game(): GameRecord {
  return {
    id: 'g1',
    createdAt: new Date(T).toISOString(),
    updatedAt: new Date(T).toISOString(),
    presetId: 'doe-regional-2027',
    packet: { setId: 'doe-hs-17', setTitle: 'Set 17', roundId: 'doe-hs-17-r01', roundLabel: 'Round 1' },
    pairs: [
      { tossupId: 'doe-hs-17-r01-t01', bonusId: 'doe-hs-17-r01-b01', subject: 'biology' },
      { tossupId: 'doe-hs-17-r01-t02', bonusId: 'doe-hs-17-r01-b02', subject: 'math' },
      { tossupId: 'doe-hs-17-r01-t03', bonusId: 'doe-hs-17-r01-b03', subject: 'physics' },
    ],
    teams: [
      { name: 'A', playerIds: ['ann', 'abe'] },
      { name: 'B', playerIds: ['bea'] },
    ],
    events,
    status: 'in_progress',
  };
}

// The store stamps new cards with the clock, so tests run on a fixed clock.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T + 2 * 60 * 60 * 1000);
});
afterEach(() => {
  vi.useRealTimers();
});

/** A team of three; this device is signed in as `me`. */
function seed(me = 'ann') {
  update((d) => {
    Object.assign(d, emptyData());
    d.settings.soloPlayerId = me;
    d.team = { id: 't', name: 'Test', level: 'HS', createdAt: new Date(T).toISOString() };
    d.players = [
      { id: 'ann', name: 'Ann', role: 'member', active: true, primarySubject: 'biology' },
      { id: 'abe', name: 'Abe', role: 'member', active: true, primarySubject: 'math' },
      { id: 'bea', name: 'Bea', role: 'member', active: true, primarySubject: 'physics', secondarySubject: 'math' },
    ];
    d.games = [game()];
  });
}

describe('outcomes from a Reader console game', () => {
  it('lists answers, dead toss-ups for subject owners and bonuses for the team', () => {
    seed();
    const out = gameOutcomes(game(), getData().players);
    const summary = out.map((o) => `${o.playerId} ${o.questionId.slice(-3)} ${o.correct ? 'right' : 'wrong'}${o.reason ? ` (${o.reason})` : ''}`);
    expect(summary).toEqual([
      'ann t01 right',
      'ann b01 right',
      'bea t02 wrong',
      'abe t02 right',
      'abe b02 wrong (bonus)',
      'bea t03 wrong (dead)',
    ]);
    const abe = out.find((o) => o.playerId === 'abe' && o.kind === 'tossup')!;
    expect(abe.latencyMs).toBe(4_000);
  });
});

describe('review cards from games and practice', () => {
  it("turns the signed-in player's game answers into cards, once, and never writes anyone else's", () => {
    seed('bea');
    // Finishing a game writes no cards on this device: the server writes each player's answers to their account.
    finishGame('g1', [0, 0]);
    expect(getData().cards).toEqual({});
    // The server's answers arrive: Bea's own, plus some that are not hers (they are never applied).
    const answers = gameOutcomes({ ...game(), status: 'finished' }, getData().players);
    applyAnswers(answers, 7);
    expect(Object.keys(getData().cards).sort()).toEqual([
      cardId('bea', 'doe-hs-17-r01-t02'), // wrong interrupt
      cardId('bea', 'doe-hs-17-r01-t03'), // nobody got it; Bea owns physics
    ]);
    expect(getData().settings.cardsCursor).toBe(7);
    // The same answers again (another device, or a reload) add nothing, and the cursor never goes back.
    const before = JSON.stringify(getData().cards);
    applyAnswers(answers, 5);
    expect(JSON.stringify(getData().cards)).toBe(before);
    expect(getData().settings.cardsCursor).toBe(7);
    // New cards can first come up the next practice day.
    expect(playerDue(getData(), 'bea', T)).toHaveLength(0);
    expect(playerDue(getData(), 'bea', T + DAY + 60_000).map((c) => c.reason)).toEqual(['interrupt', 'dead']);
  });

  it('adds cards from solo misses and manual adds, and pauses disputed questions', () => {
    seed();
    addAttempt({ playerId: 'ann', questionId: 'doe-hs-17-r02-t04', subject: 'chemistry', kind: 'tossup', correct: false, interrupt: false, latencyMs: 2000, overridden: false, t: T });
    addAttempt({ playerId: 'ann', questionId: 'doe-hs-17-r02-t05', subject: 'chemistry', kind: 'tossup', correct: true, interrupt: false, latencyMs: 800, overridden: false, t: T });
    addToReview('ann', { id: 'doe-hs-17-r02-b06', subject: 'chemistry', kind: 'bonus' });
    expect(Object.keys(getData().cards).filter((id) => id.startsWith('ann:'))).toHaveLength(2);
    // The added question is due now; the miss waits for the next practice day.
    expect(playerDue(getData(), 'ann').map((c) => c.reason)).toEqual(['manual']);
    expect(playerDue(getData(), 'ann', T + DAY).map((c) => c.reason)).toEqual(['manual', 'missed']);
    update((d) => {
      d.reports.push({ id: 'r', questionId: 'doe-hs-17-r02-b06', note: 'wrong key', createdAt: '', status: 'open' });
    });
    expect(playerDue(getData(), 'ann')).toHaveLength(0);
  });

  it("saves only the signed-in player's practice", () => {
    seed();
    addAttempt({ playerId: 'abe', questionId: 'doe-hs-17-r02-t04', subject: 'chemistry', kind: 'tossup', correct: false, interrupt: false, latencyMs: 2000, overridden: false, t: T });
    addToReview('abe', { id: 'doe-hs-17-r02-b06', subject: 'chemistry', kind: 'bonus' });
    markSeen(['abe', 'bea'], ['doe-hs-17-r02-t04']);
    expect(getData().attempts).toEqual([]);
    expect(getData().cards).toEqual({});
    expect(getData().seen).toEqual({});
    markSeen(['ann', 'abe'], ['doe-hs-17-r02-t04'], T);
    expect(getData().seen).toEqual({ ann: { 'doe-hs-17-r02-t04': T } });
    // Signed out, nothing is saved at all.
    update((d) => {
      d.settings.soloPlayerId = null;
    });
    addAttempt({ playerId: 'ann', questionId: 'doe-hs-17-r02-t05', subject: 'chemistry', kind: 'tossup', correct: false, interrupt: false, latencyMs: 2000, overridden: false, t: T });
    expect(getData().attempts).toEqual([]);
  });

  it('drops new cards that waited two weeks when new answers come in', () => {
    seed();
    addAttempt({ playerId: 'ann', questionId: 'doe-hs-17-r02-t04', subject: 'chemistry', kind: 'tossup', correct: false, interrupt: false, latencyMs: 2000, overridden: false, t: T });
    vi.setSystemTime(T + 20 * DAY);
    addAttempt({ playerId: 'ann', questionId: 'doe-hs-17-r02-t05', subject: 'chemistry', kind: 'tossup', correct: false, interrupt: false, latencyMs: 2000, overridden: false, t: T + 20 * DAY });
    expect(Object.keys(getData().cards)).toEqual([cardId('ann', 'doe-hs-17-r02-t05')]);
  });
});

describe('plans and observations', () => {
  it('counts first answers from game answers and practice for the mastery model, not from the games themselves', () => {
    seed();
    // A team view (useTeamData) holds every member's answers, as the server wrote them when the game ended.
    const answers = gameOutcomes({ ...game(), status: 'finished' }, getData().players);
    expect(playerObservations(getData(), 'abe', null)).toEqual([]);
    const data = { ...getData(), answers };
    const obs = playerObservations(data, 'abe', new Map([['doe-hs-17-r01-t02', ['doe-hs-17-r01-t02', 'math', 'math.algebra', 't', 1, '']]]));
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ topic: 'math.algebra', correct: true, round: 1 });
    // Team bonuses and dead toss-ups are not the player's own answers.
    expect(playerObservations(data, 'bea', null).map((o) => o.questionId)).toEqual(['doe-hs-17-r01-t02']);
    // Practice answers count too.
    const withPractice = {
      ...data,
      attempts: [{ id: 'a1', playerId: 'bea', questionId: 'doe-hs-17-r02-t04', subject: 'chemistry' as const, kind: 'tossup' as const, correct: true, interrupt: false, latencyMs: 900, overridden: false, t: T }],
    };
    expect(playerObservations(withPractice, 'bea', null).map((o) => o.questionId).sort()).toEqual(['doe-hs-17-r01-t02', 'doe-hs-17-r02-t04']);
  });

  it("counts questions read in the team's games as heard by everyone who played", () => {
    seed();
    update((d) => {
      d.seen = { ann: { 'doe-hs-17-r09-t01': 5 } };
    });
    const ann = heardLedger(getData(), 'ann');
    expect(Object.keys(ann).sort()).toEqual([
      'doe-hs-17-r01-b01',
      'doe-hs-17-r01-b02',
      'doe-hs-17-r01-t01',
      'doe-hs-17-r01-t02',
      'doe-hs-17-r01-t03',
      'doe-hs-17-r09-t01',
    ]);
    expect(ann['doe-hs-17-r09-t01']).toBe(5);
    // Bea played too; a player who was not in the game has heard none of it.
    expect(heardLedger(getData(), 'bea')['doe-hs-17-r01-t03']).toBe(T);
    expect(heardLedger(getData(), 'cy')).toEqual({});
  });

  it('keeps one plan a day, and rebuilds it (keeping what is done) when the season phase changes', () => {
    seed();
    const ann = getData().players[0];
    const catalog = { rows: [], topicCounts: {} };
    const first = planFor(getData(), ann, 30, undefined, catalog, T);
    expect(first.changed).toBe(true);
    update((d) => {
      d.plans.ann = { ...first.plan, items: first.plan.items.map((i) => (i.id === 'review' ? { ...i, done: true } : i)) };
    });
    expect(planFor(getData(), ann, 30, undefined, catalog, T + 60_000).changed).toBe(false);
    const d = new Date(T + 5 * DAY);
    setNextEvent({ name: 'Regional', date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` });
    const rebuilt = planFor(getData(), ann, 30, undefined, catalog, T + 120_000);
    expect(rebuilt.changed).toBe(true);
    expect(rebuilt.plan.phase).toBe('final_weeks');
    expect(rebuilt.plan.items.find((i) => i.id === 'review')!.done).toBe(true);
  });

  it('counts fresh questions per topic', () => {
    const rows: Parameters<typeof freshTopicCounts>[0] = [
      ['a', 'math', 'math.algebra', 't', 1, ''],
      ['b', 'math', 'math.algebra', 'b', 1, ''],
      ['c', 'math', '', 't', 1, ''],
    ];
    expect(freshTopicCounts(rows, { a: 1 })).toEqual({ 'math.algebra': 1 });
  });
});
