/** The signed-in user's own profile and records: merges, server-only answers, paging, export and deletion. */
import { describe, expect, it } from 'vitest';
import { MAX_RECORD_BYTES, RECORDS_PAGE_SIZE } from '../../src/core/accounts';
import { allMyRecords, call, getRecords, googleToken, join, makeTeam, putRecords, signUp } from './helpers';

const ME = '/api/me/records';

describe('profile', () => {
  it('shows the user, with no team yet', async () => {
    const user = await signUp('Pia');
    const me = await call('/api/me', { token: user.token });
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ user: user.user, team: null });
  });

  it('changes the name, subjects, graduation year and settings, checking each', async () => {
    const user = await signUp('Quinn');
    const patch = (body: unknown) => call('/api/me', { method: 'PATCH', token: user.token, body });
    const res = await patch({ name: '  Quinn   Q ', primarySubject: 'chemistry', secondarySubject: 'math', gradYear: 2028 });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Quinn Q', primarySubject: 'chemistry', secondarySubject: 'math', gradYear: 2028 });
    // null clears a field.
    const cleared = await patch({ secondarySubject: null, gradYear: null });
    expect(cleared.body.user.secondarySubject).toBeUndefined();
    expect(cleared.body.user.gradYear).toBeUndefined();
    expect(cleared.body.user.primarySubject).toBe('chemistry');

    // The site sends the whole settings object: known keys are checked and kept, unknown ones ignored.
    const settings = await patch({ settings: { sound: false, readingWpm: 250, answerTimer: false, dailyMinutes: 45, cardsCursor: 12, soloPlayerId: 'x', theme: 'dark' } });
    expect(settings.body.user.settings).toEqual({ sound: false, readingWpm: 250, answerTimer: false, dailyMinutes: 45, cardsCursor: 12 });

    const refusals: Array<[unknown, RegExp]> = [
      [{ name: '' }, /name of 1 to 40/],
      [{ name: 'x'.repeat(41) }, /name of 1 to 40/],
      [{ primarySubject: 'alchemy' }, /subject must be one of/],
      [{ gradYear: 'soon' }, /graduation year/],
      [{ settings: { readingWpm: 5000 } }, /60 to 600 words/],
      [{ settings: { dailyMinutes: 2.5 } }, /Daily minutes/],
      [{ settings: { sound: 'yes' } }, /sound must be true or false/],
      [{ settings: 'loud' }, /settings must be a JSON object/],
      // A bad field refuses the whole change.
      [{ name: 'Changed', settings: { cardsCursor: -1 } }, /cardsCursor/],
    ];
    for (const [body, error] of refusals) {
      const refused = await patch(body);
      expect(refused.status).toBe(400);
      expect(refused.body.error).toMatch(error);
    }
    expect((await call('/api/me', { token: user.token })).body.user).toMatchObject({ name: 'Quinn Q', settings: { readingWpm: 250 } });
  });
});

describe('records', () => {
  it('stores changes and returns them oldest first, with tombstones for deletes', async () => {
    const user = await signUp('Rae');
    const attempt = { id: 'a1', playerId: user.id, questionId: 'q1', subject: 'biology', kind: 'tossup', correct: true, interrupt: false, latencyMs: 900, overridden: false, t: 1 };
    const pushed = await putRecords(ME, user.token, [
      { c: 'attempts', id: 'a1', body: attempt },
      { c: 'seen', id: 'ledger', body: { q1: 100 } },
      { c: 'reports', id: 'r1', body: { id: 'r1', questionId: 'q1', note: 'Typo', createdAt: '2026-11-08', status: 'open' } },
    ]);
    expect(pushed).toEqual({ cursor: 3, rejected: [] });
    const page = await getRecords(ME, user.token);
    expect(page).toEqual({
      cursor: 3,
      more: false,
      records: [
        { c: 'attempts', id: 'a1', body: attempt, rev: 1 },
        { c: 'seen', id: 'ledger', body: { q1: 100 }, rev: 2 },
        { c: 'reports', id: 'r1', body: expect.objectContaining({ note: 'Typo' }), rev: 3 },
      ],
    });
    // Storing the same thing again changes nothing.
    expect(await putRecords(ME, user.token, [{ c: 'seen', id: 'ledger', body: { q1: 100 } }])).toEqual({ cursor: 3, rejected: [] });

    expect(await putRecords(ME, user.token, [{ c: 'reports', id: 'r1', body: null }, { c: 'reports', id: 'never', body: null }])).toEqual({ cursor: 4, rejected: [] });
    expect((await getRecords(ME, user.token, 3)).records).toEqual([{ c: 'reports', id: 'r1', body: null, rev: 4 }]);
    expect(await getRecords(ME, user.token, 4)).toEqual({ cursor: 4, records: [], more: false });
  });

  it('merges ledgers and review cards, and never changes an answer once written', async () => {
    const user = await signUp('Sol');
    await putRecords(ME, user.token, [
      { c: 'seen', id: 'ledger', body: { q1: 100, q2: 200 } },
      { c: 'conceptReads', id: 'ledger', body: { 'reading:cells': 5 } },
      { c: 'cards', id: 'q1', body: { playerId: user.id, questionId: 'q1', log: [{ t: 1, via: 'game' }, { t: 2, via: 'review' }], sources: ['a'] } },
      { c: 'attempts', id: 'a1', body: { playerId: user.id, correct: true } },
    ]);
    // Another device that had not seen these writes.
    await putRecords(ME, user.token, [
      { c: 'seen', id: 'ledger', body: { q2: 150, q3: 300 } },
      { c: 'conceptReads', id: 'ledger', body: { c9: 7 } },
      { c: 'cards', id: 'q1', body: { playerId: user.id, questionId: 'q1', log: [{ t: 1, via: 'game' }], sources: ['b'] } },
      { c: 'attempts', id: 'a1', body: { playerId: user.id, correct: false } },
    ]);
    const records = await allMyRecords(user.token);
    const body = (c: string, id: string) => records.find((r) => r.c === c && r.id === id)?.body;
    expect(body('seen', 'ledger')).toEqual({ q1: 100, q2: 150, q3: 300 });
    expect(body('conceptReads', 'ledger')).toEqual({ 'reading:cells': 5, c9: 7 });
    expect(body('cards', 'q1')).toEqual({ playerId: user.id, questionId: 'q1', log: [{ t: 1, via: 'game' }, { t: 2, via: 'review' }], sources: ['a', 'b'] });
    expect(body('attempts', 'a1')).toEqual({ playerId: user.id, correct: true });
  });

  it('refuses answers from devices, unknown collections, and records that do not fit the rules', async () => {
    const user = await signUp('Tam');
    const result = await putRecords(ME, user.token, [
      { c: 'answers', id: 'game:g1:0:t:1', body: { key: 'game:g1:0:t:1', playerId: user.id, correct: true } },
      { c: 'games', id: 'g1', body: {} },
      { c: 'seen', id: 'other', body: {} },
      { c: 'plans', id: 'tomorrow', body: { playerId: user.id } },
      { c: 'attempts', id: 'a-x', body: { playerId: 'someoneelse12345', correct: true } },
      { c: 'attempts', id: 'a-y', body: ['not', 'an', 'object'] },
      { c: 'attempts', id: 'x'.repeat(201), body: {} },
      { c: 'attempts', id: 'deep', body: JSON.parse('{"a":'.repeat(120) + '1' + '}'.repeat(120)) },
      { c: 'reports', id: 'big', body: { note: 'x'.repeat(MAX_RECORD_BYTES) } },
      { c: 'plans', id: 'today', body: { playerId: user.id, items: [] } },
    ]);
    expect(result.rejected).toEqual([
      { c: 'answers', id: 'game:g1:0:t:1', reason: 'Game answers are recorded by the server.' },
      { c: 'games', id: 'g1', reason: "This kind of data isn't kept with your account." },
      { c: 'seen', id: 'other', reason: 'This record\'s id must be "ledger".' },
      { c: 'plans', id: 'tomorrow', reason: 'This record\'s id must be "today".' },
      { c: 'attempts', id: 'a-x', reason: 'This record belongs to another player.' },
      { c: 'attempts', id: 'a-y', reason: 'A record must be a JSON object.' },
      { c: 'attempts', id: 'x'.repeat(201), reason: 'Record ids must be 1 to 200 characters.' },
      { c: 'attempts', id: 'deep', reason: 'This record is nested too deeply to save.' },
      { c: 'reports', id: 'big', reason: expect.stringMatching(/too large to save/) },
    ]);
    expect((await allMyRecords(user.token)).map((r) => `${r.c}/${r.id}`)).toEqual(['plans/today']);

    // A malformed request fails as a whole.
    expect((await call(ME, { token: user.token, body: { changes: 'all' } })).status).toBe(400);
    expect((await call(ME, { token: user.token, body: { changes: [{ c: 'attempts', id: 'a' }] } })).body.error).toBe('Change 1 needs a body (null to delete).');
    const tooMany = Array.from({ length: RECORDS_PAGE_SIZE + 1 }, (_, i) => ({ c: 'attempts', id: `a${i}`, body: {} }));
    expect((await call(ME, { token: user.token, body: { changes: tooMany } })).status).toBe(413);
    expect((await call(`${ME}?cursor=-1`, { token: user.token })).status).toBe(400);
    expect((await call(`${ME}?cursor=abc`, { token: user.token })).status).toBe(400);
    expect((await call(ME)).status).toBe(401);
  });

  it('pages with a cursor and `more`', async () => {
    const user = await signUp('Uma');
    const total = RECORDS_PAGE_SIZE + 20;
    const ids = Array.from({ length: total }, (_, i) => `a${String(i).padStart(4, '0')}`);
    await putRecords(ME, user.token, ids.slice(0, RECORDS_PAGE_SIZE).map((id) => ({ c: 'attempts', id, body: { n: id } })));
    const last = await putRecords(ME, user.token, ids.slice(RECORDS_PAGE_SIZE).map((id) => ({ c: 'attempts', id, body: { n: id } })));
    expect(last.cursor).toBe(total);

    const first = await getRecords(ME, user.token, 0);
    expect(first.records).toHaveLength(RECORDS_PAGE_SIZE);
    expect(first.more).toBe(true);
    expect(first.cursor).toBe(RECORDS_PAGE_SIZE);
    const second = await getRecords(ME, user.token, first.cursor);
    expect(second.records.map((r: { id: string }) => r.id)).toEqual(ids.slice(RECORDS_PAGE_SIZE));
    expect(second.more).toBe(false);
    expect(second.cursor).toBe(total);
  });
});

describe('export and deletion', () => {
  it('exports everything as one file', async () => {
    const user = await signUp('Vic Torres');
    await putRecords(ME, user.token, [
      { c: 'attempts', id: 'a1', body: { playerId: user.id, correct: true } },
      { c: 'attempts', id: 'gone', body: { playerId: user.id } },
      { c: 'seen', id: 'ledger', body: { q1: 1 } },
    ]);
    await putRecords(ME, user.token, [{ c: 'attempts', id: 'gone', body: null }]);
    const res = await call('/api/me/export', { token: user.token });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="rebound-vic-torres.json"');
    expect(res.body).toEqual({
      format: 'rebound-account',
      version: 1,
      exportedAt: expect.any(String),
      user: user.user,
      team: null,
      records: { attempts: { a1: { playerId: user.id, correct: true } }, seen: { ledger: { q1: 1 } } },
    });
  });

  it('deletes the account and everything in it', async () => {
    const user = await signUp('Wren');
    await putRecords(ME, user.token, [{ c: 'attempts', id: 'a1', body: { playerId: user.id } }]);
    const team = await makeTeam(user);
    expect((await call('/api/me', { method: 'DELETE', token: user.token })).body).toEqual({ ok: true });
    expect((await call('/api/me', { token: user.token })).status).toBe(401);
    // The team had only this member, so it is gone too.
    const other = await signUp('Xan');
    expect((await join(team, other)).status).toBe(404);
    // The same Google account now starts over as a new person.
    const again = await call('/api/auth/google', { body: { credential: await googleToken({ sub: user.sub, email: user.email }) } });
    expect(again.status).toBe(403);
    expect(again.body.needsSignup).toBe(true);
    const fresh = await call('/api/auth/google', { body: { credential: await googleToken({ sub: user.sub, email: user.email }), over13: true, name: 'Wren' } });
    expect(fresh.body.user.id).not.toBe(user.id);
    expect(await allMyRecords(fresh.body.token)).toEqual([]);
  });

  it("will not delete a team's last coach or captain while others remain", async () => {
    const captain = await signUp('Yara');
    const team = await makeTeam(captain);
    const member = await signUp('Zed');
    expect((await join(team, member)).status).toBe(200);
    const refused = await call('/api/me', { method: 'DELETE', token: captain.token });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('A team needs at least one coach or captain. Make someone else a coach or captain first.');
    expect((await call('/api/me', { token: captain.token })).status).toBe(200);
    // A member can always delete their account; they leave the team.
    expect((await call('/api/me', { method: 'DELETE', token: member.token })).status).toBe(200);
    const members = (await call(`/api/teams/${team.teamId}`, { token: captain.token })).body.members;
    expect(members.map((m: { name: string }) => m.name)).toEqual(['Yara']);
  });
});
