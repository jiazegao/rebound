/**
 * The site's data layer against a stand-in server (fakeServer.ts, installed as fetch): loading an account into
 * AppData, which records go where (and that a teammate's never do), merging with changes from elsewhere, review
 * cards from the server's answers, settings, refusals, signing out on a 401, and retrying without a connection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Change } from '../core/accounts';
import type { Outcome } from '../core/review';
import { FakeServer } from './fakeServer';

type Modules = {
  api: typeof import('./api');
  cloud: typeof import('./cloud');
  store: typeof import('./store');
  teammates: typeof import('./teammates');
};

const ME = 'aaaaaaaaaaaaaaaa';
const TM = 'bbbbbbbbbbbbbbbb';
const TEAM = 'tttttttttttttttt';
const T = new Date(2026, 10, 8, 16).getTime();

let server: FakeServer;
let m: Modules;
let meToken: string;
let tmToken: string;

const keys = (changes: Change[]) => changes.map((c) => `${c.c}/${c.id}`).sort();

function answer(questionId: string, correct: boolean, t: number, playerId = ME): Outcome {
  return { key: `game:g1:${questionId}:t:${t}`, playerId, questionId, subject: 'math', kind: 'tossup', correct, interrupt: !correct, latencyMs: correct ? 900 : null, t, via: 'game' };
}

function attempt(id: string, playerId: string, questionId: string, correct = false) {
  return { id, playerId, questionId, subject: 'chemistry' as const, kind: 'tossup' as const, correct, interrupt: false, latencyMs: 1500, overridden: false, t: T - 60_000 };
}

/** A team with the signed-in player (captain) and a teammate, and some practice on the server already. */
function seed(cardsCursor?: number) {
  meToken = server.addUser(ME, 'Ann', { primarySubject: 'math', settings: { sound: true, readingWpm: 220, answerTimer: true, dailyMinutes: 30, ...(cardsCursor ? { cardsCursor } : {}) } });
  tmToken = server.addUser(TM, 'Ben', { primarySubject: 'biology' });
  server.addTeam(TEAM, 'Central', [
    { userId: ME, role: 'captain' },
    { userId: TM, role: 'member' },
  ]);
  server.writeUser(ME, 'attempts', 'a1', attempt('a1', ME, 'doe-hs-17-r02-t04'));
  server.writeUser(ME, 'seen', 'ledger', { 'doe-hs-17-r02-t04': T - 60_000 });
  server.writeUser(ME, 'answers', 'game:g1:0', answer('doe-hs-17-r01-t02', false, T - 30_000));
  server.writeUser(ME, 'answers', 'game:g1:1', answer('doe-hs-17-r01-t05', true, T - 20_000));
  server.writeUser(TM, 'attempts', 'b1', attempt('b1', TM, 'doe-hs-17-r03-t01', true));
  server.writeUser(TM, 'seen', 'ledger', { 'doe-hs-17-r03-t01': T - 50_000 });
  server.writeUser(TM, 'answers', 'game:g1:0', answer('doe-hs-17-r01-t02', true, T - 30_000, TM));
  server.writeUser(TM, 'cards', 'doe-hs-17-r03-t09', { secret: true });
  server.writeUser(TM, 'plans', 'today', { secret: true });
  server.writeTeam(TEAM, 'games', 'g1', { id: 'g1', createdAt: '2026-11-08T10:00:00.000Z', updatedAt: '2026-11-08T11:00:00.000Z', teams: [{ name: 'A', playerIds: [ME] }, { name: 'B', playerIds: [TM] }], pairs: [], events: [], status: 'finished', presetId: 'doe-regional-2027', packet: { setId: 'doe-hs-17', setTitle: 'Set 17', roundId: 'doe-hs-17-r01', roundLabel: 'Round 1' } });
  server.writeTeam(TEAM, 'lineups', 'l1', { id: 'l1', name: 'Regional A', starters: [ME, TM], alternates: [], createdAt: 'x', updatedAt: '2026-11-07' });
}

async function signIn(token: string) {
  await m.cloud.beginSession(token);
  await m.cloud.settled();
}

/** Let the debounced send (and anything after it) run. */
async function sendNow() {
  await vi.advanceTimersByTimeAsync(500);
  await m.cloud.settled();
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(T);
  server = new FakeServer();
  vi.stubGlobal('fetch', server.fetch);
  // Fresh modules for every test: the store and the session live in module state.
  vi.resetModules();
  m = {
    api: await import('./api'),
    cloud: await import('./cloud'),
    store: await import('./store'),
    teammates: await import('./teammates'),
  };
  m.api.setServerUrl('https://rebound.test');
  m.cloud.startCloud();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('loading an account', () => {
  it("fills AppData from the profile, the player's records and the team's", async () => {
    seed(99);
    expect(m.cloud.getSession().status).toBe('signed-out');
    await signIn(meToken);
    const d = m.store.getData();
    expect(m.cloud.getSession()).toMatchObject({ status: 'ready', user: { id: ME }, team: { team: { id: TEAM }, you: { role: 'captain' }, joinCode: `${TEAM}.aaaaaaaaaaaa` } });
    expect(d.settings).toMatchObject({ soloPlayerId: ME, readingWpm: 220, cardsCursor: 99 });
    // Players are the team's members, with their user ids; the player's own entry comes from their profile.
    expect(d.players.map((p) => [p.id, p.name, p.role, p.primarySubject])).toEqual([
      [ME, 'Ann', 'captain', 'math'],
      [TM, 'Ben', 'member', 'biology'],
    ]);
    expect(d.team).toMatchObject({ id: TEAM, name: 'Central', level: 'HS' });
    expect(d.attempts.map((a) => a.id)).toEqual(['a1']);
    expect(d.seen).toEqual({ [ME]: { 'doe-hs-17-r02-t04': T - 60_000 } });
    expect(d.answers.map((o) => o.questionId)).toEqual(['doe-hs-17-r01-t02', 'doe-hs-17-r01-t05']);
    expect(d.games.map((g) => g.id)).toEqual(['g1']);
    expect(d.lineups.map((l) => l.id)).toEqual(['l1']);
    // Teammates' practice is not in the store.
    expect(d.attempts.some((a) => a.playerId === TM)).toBe(false);
    // The answers were already turned into cards (the cursor says so): loading sends nothing back.
    expect(d.cards).toEqual({});
    await sendNow();
    expect(server.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('with no team, the player is the only player', async () => {
    const token = server.addUser(ME, 'Ann');
    await signIn(token);
    expect(m.store.getData().team).toBeNull();
    expect(m.store.getData().players).toEqual([{ id: ME, name: 'Ann', role: 'member', active: true }]);
    expect(server.calls.map((c) => c.path)).toEqual(['/api/me', '/api/me/records']);
  });

  it('leaves a record it cannot read alone: not in AppData, and never deleted', async () => {
    seed(99);
    server.writeUser(ME, 'cards', 'doe-hs-17-r01-t07', { fromANewerVersion: true });
    await signIn(meToken);
    expect(m.cloud.getSession().status).toBe('ready');
    expect(m.store.getData().cards).toEqual({});
    m.store.updateSettings({ sound: false });
    await sendNow();
    expect(server.sentChanges('/api/me/records')).toEqual([]);
    expect(server.userRecord(ME, 'cards', 'doe-hs-17-r01-t07')).toEqual({ fromANewerVersion: true });
  });

  it('reads every page of records', async () => {
    seed(99);
    server.pageSize = 2;
    await signIn(meToken);
    expect(m.store.getData().answers).toHaveLength(2);
    expect(m.store.getData().lineups).toHaveLength(1);
    expect(server.calls.filter((c) => c.path === '/api/me/records').length).toBeGreaterThan(1);
  });
});

describe('review cards from game and match answers', () => {
  it('turns answers above the cursor into cards once, moves the cursor, and saves both', async () => {
    seed();
    await signIn(meToken);
    const d = m.store.getData();
    // The wrong interrupt became a card; the right, quick answer did not.
    expect(Object.keys(d.cards)).toEqual([`${ME}:doe-hs-17-r01-t02`]);
    const cursor = d.settings.cardsCursor!;
    expect(cursor).toBeGreaterThan(0);
    await sendNow();
    expect(keys(server.sentChanges('/api/me/records'))).toEqual(['cards/doe-hs-17-r01-t02']);
    expect(server.users.get(ME)!.profile.settings.cardsCursor).toBe(cursor);

    // A match ends: the server writes a new answer, and the next refresh makes its card.
    server.writeUser(ME, 'answers', 'match:r9:0', { ...answer('doe-hs-17-r04-t01', false, T), key: 'match:r9:0' });
    await m.cloud.refreshNow();
    expect(Object.keys(m.store.getData().cards).sort()).toEqual([`${ME}:doe-hs-17-r01-t02`, `${ME}:doe-hs-17-r04-t01`]);
    expect(m.store.getData().settings.cardsCursor).toBeGreaterThan(cursor);
    // Answers are never sent back: only the server writes them.
    await sendNow();
    expect(server.sentChanges('/api/me/records').some((c) => c.c === 'answers')).toBe(false);
  });
});

describe('sending changes', () => {
  it("sends the player's records to their account and team records to the team, never a teammate's", async () => {
    seed(99);
    await signIn(meToken);
    const { store } = m;
    store.addAttempt(attempt('x', ME, 'doe-hs-17-r05-t01'));
    store.addAttempt(attempt('x', TM, 'doe-hs-17-r05-t02'));
    store.markSeen([ME, TM], ['doe-hs-17-r05-t01'], T);
    store.addToReview(TM, { id: 'doe-hs-17-r05-t03', subject: 'math', kind: 'tossup' });
    // A page that wrote a teammate's practice straight into the data: still never sent.
    store.update((d) => {
      d.seen[TM] = { 'doe-hs-17-r05-t09': 1 };
      d.attempts.push(attempt('stray', TM, 'doe-hs-17-r05-t09'));
      d.plans[TM] = { playerId: TM } as never;
    });
    const gameId = store.createGame({
      presetId: 'doe-regional-2027',
      packet: { setId: 'doe-hs-17', setTitle: 'Set 17', roundId: 'doe-hs-17-r02', roundLabel: 'Round 2' },
      pairs: [],
      teams: [
        { name: 'A', playerIds: [ME] },
        { name: 'B', playerIds: [TM] },
      ],
    });
    const lineupId = store.saveLineup({ name: 'Regional B', starters: [ME], alternates: [] });
    await sendNow();

    const mine = server.sentChanges('/api/me/records');
    const attemptId = store.getData().attempts.find((a) => a.questionId === 'doe-hs-17-r05-t01')!.id;
    // The attempt and the heard ledger; the missed practice answer became a review card too.
    expect(keys(mine)).toEqual([`attempts/${attemptId}`, 'cards/doe-hs-17-r05-t01', 'seen/ledger']);
    expect(mine.find((c) => c.c === 'seen')!.body).toEqual({ 'doe-hs-17-r02-t04': T - 60_000, 'doe-hs-17-r05-t01': T });
    expect(JSON.stringify(mine)).not.toContain(TM);
    expect(keys(server.sentChanges(`/api/teams/${TEAM}/records`))).toEqual([`games/${gameId}`, `lineups/${lineupId}`]);
    // Nothing reached the teammate's account.
    expect(server.calls.some((c) => c.method === 'POST' && c.path.includes(TM))).toBe(false);
    expect(server.users.get(TM)!.store.rev).toBe(5);
  });

  it('sends deletions', async () => {
    seed();
    await signIn(meToken);
    await sendNow();
    server.calls = [];
    m.store.removeFromReview(`${ME}:doe-hs-17-r01-t02`);
    m.store.deleteGame('g1');
    await sendNow();
    expect(server.sentChanges('/api/me/records')).toEqual([{ c: 'cards', id: 'doe-hs-17-r01-t02', body: null }]);
    expect(server.sentChanges(`/api/teams/${TEAM}/records`)).toEqual([{ c: 'games', id: 'g1', body: null }]);
  });

  it("sends settings to the profile and the team's settings to the team", async () => {
    seed(99);
    await signIn(meToken);
    m.store.updateSettings({ dailyMinutes: 45 });
    m.store.setNextEvent({ name: 'Regional', date: '2027-02-06' });
    await sendNow();
    const patches = server.calls.filter((c) => c.method === 'PATCH');
    expect(patches).toEqual([
      { method: 'PATCH', path: '/api/me', body: { settings: { sound: true, readingWpm: 220, answerTimer: true, dailyMinutes: 45, cardsCursor: 99 } } },
      { method: 'PATCH', path: `/api/teams/${TEAM}`, body: { name: 'Central', level: 'HS', nextEvent: { name: 'Regional', date: '2027-02-06' } } },
    ]);
    expect(server.teams.get(TEAM)!.info.nextEvent).toEqual({ name: 'Regional', date: '2027-02-06' });
    // Clearing it sends null.
    m.store.setNextEvent(null);
    await sendNow();
    expect(server.calls.filter((c) => c.method === 'PATCH').pop()!.body).toMatchObject({ nextEvent: null });
    expect(server.teams.get(TEAM)!.info.nextEvent).toBeUndefined();
  });

  it('keeps a refused change here, says why, and does not send it again', async () => {
    seed();
    await signIn(tmToken);
    await sendNow();
    // A member may not change lineups or the team's settings.
    m.store.saveLineup({ name: 'Mine', starters: [TM], alternates: [] });
    m.store.setNextEvent({ name: 'Regional', date: '2027-02-06' });
    await sendNow();
    const refused = m.cloud.getConnection().refused.map((r) => r.what);
    expect(refused).toEqual(expect.arrayContaining(['a lineup', "the team's settings"]));
    // The team's settings went back to the team's own; the lineup stays here but is not sent again.
    expect(m.store.getData().team?.nextEvent).toBeUndefined();
    const posts = server.calls.filter((c) => c.method === 'POST').length;
    m.store.updateSettings({ sound: false });
    await sendNow();
    expect(server.calls.filter((c) => c.method === 'POST').length).toBe(posts);
  });
});

describe('changes from elsewhere', () => {
  it('takes the server’s changes, but a change made here and not yet sent wins', async () => {
    seed(99);
    await signIn(meToken);
    const plan = { playerId: ME, day: '2026-11-08', minutes: 30, phase: 'season', items: [] } as never;
    m.store.savePlan(plan);
    // Before this device sends its plan, another device of the player's sends an older one, and a teammate
    // saves a lineup.
    server.writeUser(ME, 'plans', 'today', { playerId: ME, day: '2026-11-07', minutes: 15, phase: 'season', items: [] });
    server.writeTeam(TEAM, 'lineups', 'l2', { id: 'l2', name: 'Regional B', starters: [TM], alternates: [], createdAt: 'y', updatedAt: '2026-11-08' });
    await m.cloud.refreshNow();
    expect(m.store.getData().plans[ME]).toMatchObject({ day: '2026-11-08' });
    expect(m.store.getData().lineups.map((l) => l.id)).toEqual(['l2', 'l1']);
    await sendNow();
    expect(server.userRecord(ME, 'plans', 'today')).toMatchObject({ day: '2026-11-08' });
  });

  it('merges heard ledgers on the server and brings the union back', async () => {
    seed(99);
    await signIn(meToken);
    server.writeUser(ME, 'seen', 'ledger', { 'doe-hs-17-r02-t04': T - 60_000, 'doe-hs-17-r08-t08': T - 10 });
    m.store.markSeen([ME], ['doe-hs-17-r07-t07'], T);
    await sendNow();
    await m.cloud.refreshNow();
    expect(Object.keys(m.store.getData().seen[ME]).sort()).toEqual(['doe-hs-17-r02-t04', 'doe-hs-17-r07-t07', 'doe-hs-17-r08-t08']);
  });

  it('refreshes the team and its members', async () => {
    seed(99);
    await signIn(meToken);
    server.teams.get(TEAM)!.members[1].role = 'captain';
    server.teams.get(TEAM)!.info.name = 'Central High';
    await m.cloud.refreshNow();
    expect(m.store.getData().team?.name).toBe('Central High');
    expect(m.store.getData().players.find((p) => p.id === TM)?.role).toBe('captain');
  });

  it("never sends one player's changes under another account's session", async () => {
    seed(99);
    await signIn(meToken);
    m.store.addAttempt(attempt('x', ME, 'doe-hs-17-r05-t01', true));
    // Another tab signs in as the teammate before this one has sent the change.
    m.api.setSessionToken(tmToken);
    await sendNow();
    expect(server.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it("sends the player's own changes before loading again for a new team", async () => {
    seed(99);
    await signIn(meToken);
    m.store.addAttempt(attempt('x', ME, 'doe-hs-17-r05-t01', true));
    const team = server.teams.get(TEAM)!;
    team.members = team.members.filter((x) => x.userId !== ME);
    server.users.get(ME)!.teamId = null;
    await m.cloud.refreshNow();
    await m.cloud.settled();
    expect(m.store.getData().team).toBeNull();
    expect(m.store.getData().attempts.map((a) => a.questionId)).toEqual(['doe-hs-17-r02-t04', 'doe-hs-17-r05-t01']);
  });

  it('notices when the player is no longer on the team', async () => {
    seed(99);
    await signIn(meToken);
    const team = server.teams.get(TEAM)!;
    team.members = team.members.filter((x) => x.userId !== ME);
    server.users.get(ME)!.teamId = null;
    await m.cloud.refreshNow();
    await m.cloud.settled();
    expect(m.store.getData().team).toBeNull();
    expect(m.store.getData().players.map((p) => p.id)).toEqual([ME]);
    expect(m.store.getData().attempts.map((a) => a.id)).toEqual(['a1']);
    expect(m.cloud.getSession().message).toMatch(/no longer on that team/);
  });
});

describe("teammates' practice", () => {
  it('loads what teammates may see, and adds it to a team view only', async () => {
    seed(99);
    await signIn(meToken);
    await m.teammates.loadTeammates();
    const view = m.teammates.teamDataFrom(m.store.getData(), TEAM, [ME, TM]);
    expect(view.attempts.map((a) => `${a.playerId}:${a.id}`).sort()).toEqual([`${ME}:a1`, `${TM}:b1`]);
    expect(view.answers.filter((o) => o.playerId === TM).map((o) => o.questionId)).toEqual(['doe-hs-17-r01-t02']);
    expect(Object.keys(view.seen).sort()).toEqual([ME, TM].sort());
    // Review cards and plans stay private (the server never sends them), and the store itself is unchanged.
    expect(Object.keys(view.cards).some((id) => id.startsWith(TM))).toBe(false);
    expect(view.plans[TM]).toBeUndefined();
    expect(m.store.getData().attempts.map((a) => a.id)).toEqual(['a1']);
    expect(server.calls.filter((c) => c.path.includes('/members/')).map((c) => c.path)).toEqual([`/api/teams/${TEAM}/members/${TM}/records`]);
    // Nothing of theirs is ever sent.
    await sendNow();
    expect(server.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('a teammate who has just left is no error: their practice drops out, and the team is fetched again', async () => {
    seed(99);
    await signIn(meToken);
    await m.teammates.loadTeammates();
    // The teammate leaves, and their practice gets old enough to load again before this page has fetched the team.
    const team = server.teams.get(TEAM)!;
    team.members = team.members.filter((x) => x.userId !== TM);
    server.users.get(TM)!.teamId = null;
    vi.setSystemTime(T + 26_000);
    await m.teammates.loadTeammates();
    await m.cloud.settled();
    expect(m.teammates.teammatesStatus().error).toBeNull();
    expect(m.teammates.teamDataFrom(m.store.getData(), TEAM, [ME, TM]).attempts.some((a) => a.playerId === TM)).toBe(false);
    expect(m.cloud.getSession().team!.members.map((x) => x.userId)).toEqual([ME]);
  });
});

describe('the connection', () => {
  it('signs out when the server no longer knows the session', async () => {
    seed(99);
    await signIn(meToken);
    server.tokens.delete(meToken);
    await m.cloud.refreshNow();
    expect(m.cloud.getSession()).toMatchObject({ status: 'signed-out', user: null });
    expect(m.api.sessionToken()).toBeNull();
    expect(m.store.getData().attempts).toEqual([]);
    expect(m.store.getData().settings.soloPlayerId).toBeNull();
  });

  it('keeps trying while the server cannot be reached, and says the last change was not saved', async () => {
    seed(99);
    await signIn(meToken);
    server.down = true;
    m.store.addAttempt(attempt('x', ME, 'doe-hs-17-r05-t01', true));
    expect(m.cloud.getConnection().unsaved).toBe(true);
    await vi.advanceTimersByTimeAsync(500); // first try
    await vi.advanceTimersByTimeAsync(1_000); // quick retry
    expect(m.cloud.getConnection().failing).toBe(false);
    await vi.advanceTimersByTimeAsync(3_000); // and another: now it says so
    expect(m.cloud.getConnection()).toMatchObject({ failing: true, unsaved: true });
    server.down = false;
    await vi.advanceTimersByTimeAsync(10_000);
    await m.cloud.settled();
    expect(m.cloud.getConnection()).toMatchObject({ failing: false, unsaved: false });
    expect(server.users.get(ME)!.store.records.size).toBe(5);
    expect(keys(server.sentChanges('/api/me/records'))).toContain(`attempts/${m.store.getData().attempts.at(-1)!.id}`);
  });

  it('a failed load says so and tries again', async () => {
    seed(99);
    server.down = true;
    await signIn(meToken);
    expect(m.cloud.getSession().status).toBe('failed');
    expect(m.cloud.getSession().message).toMatch(/Can't reach/);
    server.down = false;
    await vi.advanceTimersByTimeAsync(15_000);
    await m.cloud.settled();
    expect(m.cloud.getSession().status).toBe('ready');
  });
});
