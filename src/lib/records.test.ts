import { describe, expect, it } from 'vitest';
import type { RecordOut } from '../core/accounts';
import type { Outcome, ReviewCard } from '../core/review';
import { applyTeamRecords, applyUserRecords, changeBatch, recordKey, teamRecords, tracksUserRecord, userRecords } from './records';
import { emptyData, type AppData } from './store';

const card = (playerId: string, questionId: string): ReviewCard =>
  ({
    id: `${playerId}:${questionId}`,
    playerId,
    questionId,
    subject: 'biology',
    kind: 'tossup',
    reason: 'missed',
    createdAt: 1,
    sources: ['attempt:a1'],
    fsrs: { due: 2, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, state: 0, last_review: undefined },
    log: [],
    introducedAt: null,
    retiredAt: null,
  }) as unknown as ReviewCard;

/** A device signed in as "me", holding (by mistake) some of teammate "tm"'s practice too. */
function sample(): AppData {
  const d = emptyData();
  d.settings.soloPlayerId = 'me';
  d.team = { id: 't1', name: 'Test', level: 'HS', createdAt: '2026-11-07T00:00:00.000Z' };
  d.players = [
    { id: 'me', name: 'Ann', role: 'captain', active: true },
    { id: 'tm', name: 'Ben', role: 'member', active: true },
  ];
  d.attempts = [
    { id: 'a1', playerId: 'me', questionId: 'q1', subject: 'biology', kind: 'tossup', correct: true, interrupt: false, latencyMs: 1000, overridden: false, t: 1 },
    { id: 'a2', playerId: 'tm', questionId: 'q1', subject: 'biology', kind: 'tossup', correct: false, interrupt: false, latencyMs: 1000, overridden: false, t: 2 },
  ];
  d.seen = { me: { q1: 5 }, tm: { q1: 6 } };
  d.conceptReads = { tm: { 'biology.cells.membrane': 1 } };
  d.cards = { 'me:q1': card('me', 'q1'), 'tm:q1': card('tm', 'q1') };
  d.plans = { tm: { playerId: 'tm' } as unknown as AppData['plans'][string] };
  d.completions = {
    'as1:me': { id: 'as1:me', assignmentId: 'as1', playerId: 'me', at: 'x' },
    'as1:tm': { id: 'as1:tm', assignmentId: 'as1', playerId: 'tm', at: 'x' },
  };
  d.reports = [{ id: 'r1', questionId: 'q9', note: 'typo', createdAt: '2026-11-07', status: 'open' }];
  d.answers = [{ key: 'game:g1:0:t:1', playerId: 'me', questionId: 'q2', subject: 'math', kind: 'tossup', correct: true, interrupt: false, latencyMs: 900, t: 3, via: 'game' }];
  d.games = [
    {
      id: 'g1',
      createdAt: '2026-11-07T00:00:00.000Z',
      updatedAt: '2026-11-07T00:00:00.000Z',
      presetId: 'doe-regional-2027',
      packet: { setId: 's', setTitle: 'S', roundId: 'r', roundLabel: 'R' },
      pairs: [],
      teams: [
        { name: 'A', playerIds: ['me'] },
        { name: 'B', playerIds: ['tm'] },
      ],
      events: [],
      status: 'finished',
    },
  ];
  d.lineups = [{ id: 'l1', name: 'A', starters: ['me'], alternates: [], createdAt: 'x', updatedAt: 'x' }];
  d.conceptCards = { 'biology.cells.membrane': { id: 'biology.cells.membrane' } as unknown as AppData['conceptCards'][string] };
  return d;
}

describe('the records behind AppData', () => {
  it("produces only the signed-in player's own user records, and never their server-written answers", () => {
    const keys = [...userRecords(sample(), 'me').keys()].sort();
    expect(keys).toEqual(['attempts/a1', 'cards/q1', 'completions/as1', 'reports/r1', 'seen/ledger']);
    // Bodies are the AppData objects themselves.
    expect(userRecords(sample(), 'me').get('cards/q1')!.body).toMatchObject({ playerId: 'me', questionId: 'q1' });
  });

  it('produces the team records', () => {
    expect([...teamRecords(sample()).keys()].sort()).toEqual(['conceptCards/biology.cells.membrane', 'games/g1', 'lineups/l1']);
  });

  it('tracks the collections a device knows, and only the one id of single-record collections', () => {
    expect(tracksUserRecord('seen', 'ledger')).toBe(true);
    expect(tracksUserRecord('seen', 'other')).toBe(false);
    expect(tracksUserRecord('plans', 'today')).toBe(true);
    expect(tracksUserRecord('plans', '2026-11-08')).toBe(false);
    expect(tracksUserRecord('answers', 'game:g1:0')).toBe(true);
    expect(tracksUserRecord('somethingNew', 'x')).toBe(false);
  });

  it("puts the player's records from the server into AppData, pinned to the player and the record id", () => {
    const d = emptyData();
    const answers = new Map<string, Outcome>();
    const incoming: RecordOut[] = [
      { c: 'attempts', id: 'a1', body: { id: 'a1', playerId: 'me', questionId: 'q1', subject: 'biology', kind: 'tossup', correct: true, interrupt: false, latencyMs: 1, overridden: false, t: 9 }, rev: 1 },
      { c: 'seen', id: 'ledger', body: { q1: 5 }, rev: 2 },
      { c: 'conceptReads', id: 'ledger', body: { 'reading:biology.genetics': 7 }, rev: 3 },
      { c: 'cards', id: 'q1', body: { ...card('someone', 'zz') }, rev: 4 },
      { c: 'plans', id: 'today', body: { playerId: 'me', day: '2026-11-08', items: [] }, rev: 5 },
      { c: 'completions', id: 'as1', body: { id: 'as1:me', assignmentId: 'as1', playerId: 'me', at: 'x' }, rev: 6 },
      { c: 'reports', id: 'r1', body: { id: 'r1', questionId: 'q9', note: 'typo', createdAt: '2026-11-07', status: 'open' }, rev: 7 },
      { c: 'answers', id: 'game:g1:0', body: { key: 'game:g1:0:t:1', playerId: 'me', questionId: 'q2', subject: 'math', kind: 'tossup', correct: false, interrupt: true, latencyMs: null, t: 3, via: 'game' }, rev: 8 },
      { c: 'answers', id: 'match:r1:0', body: { key: 'match:r1:0', playerId: 'me', questionId: 'q3', subject: 'math', kind: 'tossup', correct: true, interrupt: false, latencyMs: 500, t: 2, via: 'game' }, rev: 9 },
      { c: 'plans', id: 'other', body: { playerId: 'me' }, rev: 10 },
    ];
    applyUserRecords(d, 'me', incoming, answers);
    expect(d.attempts.map((a) => a.id)).toEqual(['a1']);
    expect(d.seen).toEqual({ me: { q1: 5 } });
    expect(d.conceptReads).toEqual({ me: { 'reading:biology.genetics': 7 } });
    // A card is the player's own whatever its body says.
    expect(d.cards['me:q1']).toMatchObject({ id: 'me:q1', playerId: 'me', questionId: 'q1' });
    expect(d.plans.me).toMatchObject({ day: '2026-11-08' });
    expect(d.completions['as1:me']).toMatchObject({ assignmentId: 'as1', playerId: 'me' });
    expect(d.reports.map((r) => r.id)).toEqual(['r1']);
    // Answers are kept by record id, oldest first.
    expect(d.answers.map((o) => o.questionId)).toEqual(['q3', 'q2']);
    expect([...answers.keys()]).toEqual(['game:g1:0', 'match:r1:0']);
    // An answer that arrives again replaces itself; a deleted record goes.
    applyUserRecords(
      d,
      'me',
      [
        { c: 'answers', id: 'game:g1:0', body: incoming[7].body, rev: 11 },
        { c: 'attempts', id: 'a1', body: null, rev: 12 },
        { c: 'cards', id: 'q1', body: null, rev: 13 },
        { c: 'seen', id: 'ledger', body: null, rev: 14 },
      ],
      answers,
    );
    expect(d.answers).toHaveLength(2);
    expect(d.attempts).toEqual([]);
    expect(d.cards).toEqual({});
    expect(d.seen).toEqual({});
  });

  it('puts team records into AppData, newest first, and deletes', () => {
    const d = emptyData();
    const game = { teams: [], events: [], pairs: [], packet: {} };
    applyTeamRecords(d, [
      { c: 'games', id: 'g1', body: { ...game, id: 'g1', createdAt: '2026-11-01' }, rev: 1 },
      { c: 'games', id: 'g2', body: { ...game, id: 'g2', createdAt: '2026-11-05' }, rev: 2 },
      { c: 'games', id: 'g3', body: { id: 'g3', note: 'not a game this version can read' }, rev: 2 },
      { c: 'lineups', id: 'l1', body: { id: 'l1', starters: [], alternates: [], updatedAt: '2026-11-02' }, rev: 3 },
      { c: 'conceptCards', id: 'biology.cells.membrane', body: { summary: 'x' }, rev: 4 },
      { c: 'players', id: 'p1', body: { id: 'p1' }, rev: 5 },
    ]);
    expect(d.games.map((g) => g.id)).toEqual(['g2', 'g1']);
    expect(d.conceptCards['biology.cells.membrane']).toMatchObject({ id: 'biology.cells.membrane', summary: 'x' });
    expect(d.players).toEqual([]);
    applyTeamRecords(d, [{ c: 'games', id: 'g2', body: null, rev: 6 }]);
    expect(d.games.map((g) => g.id)).toEqual(['g1']);
  });

  it('round-trips: records applied to empty data map back to the same records', () => {
    const d = sample();
    const mine = [...userRecords(d, 'me').values()].map((r, i) => ({ ...r, rev: i + 1 }));
    const theirs = [...teamRecords(d).values()].map((r, i) => ({ ...r, rev: i + 1 }));
    const back = emptyData();
    applyUserRecords(back, 'me', mine, new Map());
    applyTeamRecords(back, theirs);
    expect(new Map([...userRecords(back, 'me')].map(([k, r]) => [k, r.body]))).toEqual(new Map([...userRecords(d, 'me')].map(([k, r]) => [k, r.body])));
    expect(new Map([...teamRecords(back)].map(([k, r]) => [k, r.body]))).toEqual(new Map([...teamRecords(d)].map(([k, r]) => [k, r.body])));
    expect(recordKey('cards', 'q1')).toBe('cards/q1');
  });
});

describe('change batches', () => {
  const change = (id: string, size: number) => ({ c: 'visuals', id, body: { pad: 'x'.repeat(size) } });

  it('stops at the count or the byte budget, but always sends at least one change', () => {
    const changes = [change('a', 100), change('b', 100), change('c', 100)];
    expect(changeBatch(changes, 2, 1_000_000).map((c) => c.id)).toEqual(['a', 'b']);
    // Each change is about 140 bytes of JSON (100 of padding plus the rest), so two fit in 300.
    expect(changeBatch(changes, 10, 300).map((c) => c.id)).toEqual(['a', 'b']);
    expect(changeBatch([change('big', 5_000)], 10, 300).map((c) => c.id)).toEqual(['big']);
    expect(changeBatch([], 10, 300)).toEqual([]);
  });
});
