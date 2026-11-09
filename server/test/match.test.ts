/** The online match director (src/match.ts): pure state, driven by explicit times. */
import { describe, expect, it } from 'vitest';
import {
  BONUS_GRACE_MS,
  BONUS_LEAD_MS,
  FFA_WINDOW_MS,
  HALFTIME_MS,
  LEAD_MS,
  MatchDirector,
  newMatchData,
  NEXT_DELAY_MS,
  parseMatchSetup,
  RESUME_LEAD_MS,
  REVIEW_MS,
  TOSSUP_ANSWER_MS,
  type MatchPlayer,
  type MatchQuestion,
  type MatchSetup,
} from '../src/match';

const q = (id: string, kind: 'tossup' | 'bonus', stem: string, answer: string, accept: string[] = []): MatchQuestion => ({
  id,
  kind,
  subject: 'biology',
  format: 'short_answer',
  stem,
  answer,
  accept,
  reject: [],
  answerRaw: accept.length ? `${answer} (ACCEPT: ${accept.join(', ')})` : answer,
  figure: false,
});

const PAIRS = [
  {
    tossup: q('t1', 'tossup', 'What organelle makes most of the ATP in eukaryotic cells?', 'MITOCHONDRION', ['MITOCHONDRIA']),
    bonus: q('b1', 'bonus', 'What gas do plants take in for photosynthesis?', 'CARBON DIOXIDE', ['CO2']),
  },
  { tossup: q('t2', 'tossup', 'What molecule carries amino acids to the ribosome?', 'TRANSFER RNA', ['TRNA']), bonus: q('b2', 'bonus', 'What is the powerhouse of the cell?', 'MITOCHONDRION') },
  { tossup: q('t3', 'tossup', 'What process makes two identical daughter cells?', 'MITOSIS'), bonus: q('b3', 'bonus', 'What is the site of photosynthesis?', 'CHLOROPLAST') },
];

const setup = (over: Partial<MatchSetup> = {}): MatchSetup => ({
  format: 'teams',
  presetId: 'doe-regional-2027',
  wpm: 300,
  teamNames: ['Red', 'Blue'],
  packet: { setId: 'doe-hs-17', setTitle: 'Set 17', roundId: 'doe-hs-17-r01', roundLabel: 'Round 1' },
  pairs: PAIRS,
  tossupCount: PAIRS.length,
  ...over,
});

const ann: MatchPlayer = { memberId: 'm-ann', playerId: 'p-ann', name: 'Ann', side: 'A', captain: false };
const abe: MatchPlayer = { memberId: 'm-abe', playerId: 'p-abe', name: 'Abe', side: 'A', captain: true };
const bea: MatchPlayer = { memberId: 'm-bea', playerId: 'p-bea', name: 'Bea', side: 'B', captain: false };
const anyone = () => true;

/** A started team match and the moment its first reading begins. */
function teamMatch(over: Partial<MatchSetup> = {}) {
  const d = new MatchDirector(newMatchData(setup(over)));
  expect(d.start([ann, abe, bea], 0)).toBeNull();
  d.advance(LEAD_MS);
  return d;
}

const readingEnd = (d: MatchDirector) => d.data.q!.reading.startedAt + d.data.q!.reading.durationMs;
const scores = (d: MatchDirector) => d.view().scores;

describe('team matches', () => {
  it('needs a player on each side, and makes a captain for each', () => {
    const d = new MatchDirector(newMatchData(setup()));
    expect(d.start([ann, abe], 0)).toBe('Each side needs at least one player.');
    expect(d.start([ann, abe, bea], 0)).toBeNull();
    expect(d.captainOf('A')?.memberId).toBe('m-abe');
    expect(d.captainOf('B')?.memberId).toBe('m-bea');
    expect(d.start([ann, bea], 5)).toBe('The match has already started.');
  });

  it('reveals the text only when the reading starts, and the answer only at the end', () => {
    const d = new MatchDirector(newMatchData(setup()));
    d.start([ann, bea], 0);
    expect(d.view().text).toBeUndefined();
    expect(d.buzzers().open).toBe(false);
    d.advance(LEAD_MS);
    const v = d.view();
    expect(v.label).toBe('Toss-up 1');
    expect(v.text).toContain('What organelle');
    expect(v.reading).toEqual({ startedAt: LEAD_MS, wpm: 300 });
    expect(v.answer).toBeUndefined();
    expect(d.buzzers()).toEqual({ open: true, sides: { A: true, B: true }, exclude: [] });
  });

  it('plays a toss-up and its bonus: a buzz after the reading, then the captain answers the bonus', () => {
    const d = teamMatch();
    const end = readingEnd(d);
    expect(d.buzz('m-ann', end + 500, end + 600)).toBeNull();
    expect(d.view().match.answering).toMatchObject({ memberId: 'm-ann', kind: 'tossup' });
    expect(d.buzzers().open).toBe(false);
    expect(d.answer('m-bea', 'mitochondrion', end + 700, anyone)).toBe("It isn't your turn to answer.");
    expect(d.answer('m-ann', 'Mitochondria', end + 1000, anyone)).toBeNull();
    expect(scores(d)).toEqual([4, 0]);
    // The bonus: Abe is Red's captain.
    expect(d.view().label).toBe('Bonus 1');
    expect(d.view().match.previous).toEqual({ label: 'Toss-up 1', answer: 'MITOCHONDRION (ACCEPT: MITOCHONDRIA)' });
    d.advance(end + 1000 + BONUS_LEAD_MS);
    expect(d.answer('m-ann', 'co2', end + 1100 + BONUS_LEAD_MS, (m) => m === 'm-abe')).toBe("Your captain gives the team's answer.");
    expect(d.answer('m-bea', 'co2', end + 1100 + BONUS_LEAD_MS, anyone)).toBe('Only the team playing the bonus answers it.');
    expect(d.answer('m-abe', 'co2', end + 1100 + BONUS_LEAD_MS, (m) => m === 'm-abe')).toBe('Wait until the whole bonus has been read.');
    d.advance(readingEnd(d));
    expect(d.answer('m-abe', 'CO2', readingEnd(d) + 3000, (m) => m === 'm-abe')).toBeNull();
    expect(scores(d)).toEqual([14, 0]);
    expect(d.view().answer).toBe('CARBON DIOXIDE (ACCEPT: CO2)');
    // The next toss-up after the answer has been up for a few seconds.
    const over = d.data.q!.overAt!;
    d.advance(over + NEXT_DELAY_MS + LEAD_MS);
    expect(d.view().label).toBe('Toss-up 2');
  });

  it('a wrong interrupt gives the other side 4 points and a full re-read (Rule 6-2)', () => {
    const d = teamMatch();
    const start = d.data.q!.reading.startedAt;
    d.buzz('m-ann', start + 300, start + 400);
    expect(d.view().reading?.pausedAt).toBe(start + 300);
    d.answer('m-ann', 'ribosome', start + 2000, anyone);
    expect(scores(d)).toEqual([0, 4]);
    expect(d.view().status).toContain('It is read again for Blue.');
    // Only Blue may buzz on the re-read.
    d.advance(start + 2000 + 1500);
    expect(d.buzzers().sides).toEqual({ A: false, B: true });
    const end = readingEnd(d);
    d.buzz('m-bea', end + 1000, end + 1100);
    d.answer('m-bea', 'mitochondrion', end + 2000, anyone);
    expect(scores(d)).toEqual([0, 8]);
    expect(d.view().bonusTeam).toBe(1);
  });

  it('after a wrong answer at the end of the reading, the other side gets the rebound window', () => {
    const d = teamMatch();
    const end = readingEnd(d);
    d.buzz('m-ann', end + 200, end + 300);
    d.answer('m-ann', 'ribosome', end + 2000, anyone);
    expect(d.view().status).toContain('Blue may buzz.');
    expect(d.buzzers().sides).toEqual({ A: false, B: true });
    // Nobody buzzes in the 5 seconds: the toss-up is dead.
    d.advance(end + 2000 + 5000);
    expect(d.view().phase).toBe('question_over');
    expect(d.view().answer).toContain('MITOCHONDRION');
  });

  it('a player who does not answer in time stalls', () => {
    const d = teamMatch();
    const end = readingEnd(d);
    d.buzz('m-bea', end + 100, end + 200);
    d.advance(end + 200 + TOSSUP_ANSWER_MS);
    expect(d.view().status).toContain('Bea ran out of time to answer.');
    expect(d.buzzers().sides).toEqual({ A: true, B: false });
  });

  it('close calls go to the other side; a rejected one ends the toss-up', () => {
    const d = teamMatch();
    const end = readingEnd(d);
    d.buzz('m-ann', end + 100, end + 200);
    expect(d.answer('m-ann', 'mitocondrion', end + 1000, anyone)).toBeNull();
    const review = d.view().match.review!;
    expect(review).toMatchObject({ memberId: 'm-ann', response: 'mitocondrion', deciders: 'B' });
    // Everyone sees the official answer while it is decided.
    expect(d.view().answer).toContain('MITOCHONDRION');
    expect(d.deciders()).toEqual(['m-bea']);
    expect(d.ruling('m-abe', false, end + 2000)).toBe('The other side decides this close call.');
    expect(d.ruling('m-bea', false, end + 2000)).toBeNull();
    // Not correct, and Blue may not answer it now.
    expect(scores(d)).toEqual([0, 0]);
    expect(d.view().phase).toBe('question_over');
    expect(d.view().status).toContain('Nobody else may answer this one.');
  });

  it('a close call nobody rules on in time counts', () => {
    const d = teamMatch();
    const end = readingEnd(d);
    d.buzz('m-ann', end + 100, end + 200);
    d.answer('m-ann', 'mitocondrion', end + 1000, anyone);
    d.advance(end + 1000 + REVIEW_MS);
    expect(scores(d)).toEqual([4, 0]);
    expect(d.view().label).toBe('Bonus 1');
  });

  it('a bonus with no answer times out after the window and the typing grace', () => {
    const d = teamMatch();
    const end = readingEnd(d);
    d.buzz('m-ann', end + 100, end + 200);
    d.answer('m-ann', 'mitochondrion', end + 500, anyone);
    d.advance(end + 500 + BONUS_LEAD_MS);
    const bonusEnd = readingEnd(d);
    d.advance(bonusEnd + 20_000 + BONUS_GRACE_MS - 1);
    expect(d.view().phase).toBe('bonus_open');
    d.advance(bonusEnd + 20_000 + BONUS_GRACE_MS);
    expect(d.view().status).toBe('Time: no answer to the bonus.');
    expect(scores(d)).toEqual([4, 0]);
  });

  it('runs the game clock: the half ends after the question in play, then halftime and the second half', () => {
    // Forty toss-ups nobody answers take longer than an 8-minute half.
    const many = Array.from({ length: 40 }, (_, i) => ({
      tossup: q(`t${i}`, 'tossup', 'What organelle makes most of the ATP in eukaryotic cells?', 'MITOCHONDRION'),
      bonus: q(`b${i}`, 'bonus', 'What gas do plants take in?', 'CARBON DIOXIDE'),
    }));
    const d = teamMatch({ pairs: many, tossupCount: 40 });
    const expiry = 8 * 60_000;
    d.advance(expiry - 1);
    expect(d.data.events.some((e) => e.type === 'time_expired')).toBe(false);
    d.advance(expiry);
    expect(d.data.events.at(-1)).toEqual({ type: 'time_expired', t: expiry });
    // The toss-up in play is finished (Rule 5-6); then halftime.
    expect(d.view().label).toMatch(/^Toss-up \d+$/);
    d.advance(expiry + 30_000);
    expect(d.view().label).toBe('Halftime');
    d.advance(d.data.halftimeAt! + HALFTIME_MS + LEAD_MS);
    expect(d.data.events.some((e) => e.type === 'start_half')).toBe(true);
    expect(d.view().label).toMatch(/^Toss-up \d+$/);
  });

  it('pauses before the next question until the host goes on', () => {
    const d = teamMatch();
    d.pause(LEAD_MS + 10);
    const end = readingEnd(d);
    d.advance(end + 5000);
    expect(d.view().phase).toBe('question_over');
    expect(d.nextDue()).toBeNull();
    expect(d.data.events.at(-1)?.type).toBe('clock_pause');
    d.resume(end + 60_000);
    d.advance(end + 60_000 + LEAD_MS);
    expect(d.view().label).toBe('Toss-up 2');
  });

  it('ends with a game record in the site format', () => {
    const d = teamMatch();
    const end = readingEnd(d);
    d.buzz('m-ann', end + 100, end + 200);
    d.answer('m-ann', 'mitochondrion', end + 500, anyone);
    d.end(end + 1000);
    expect(d.data.status).toBe('finished');
    const g = d.gameRecord('g-online-1')!;
    expect(g).toMatchObject({ id: 'g-online-1', presetId: 'doe-regional-2027', status: 'finished', finalScores: [4, 0], online: true, format: 'game' });
    expect(g.teams).toEqual([
      { name: 'Red', playerIds: ['p-ann', 'p-abe'] },
      { name: 'Blue', playerIds: ['p-bea'] },
    ]);
    expect(g.pairs[0]).toEqual({ tossupId: 't1', bonusId: 'b1', subject: 'biology' });
    expect(g.events.map((e) => e.type)).toEqual(['start', 'tossup_read', 'buzz', 'tossup_judged', 'end_game']);
    expect(d.heardQuestionIds()).toEqual(['t1', 'b1']);
    expect(d.view().label).toBe('Final');
  });

  it('survives a reload: a director rebuilt from its stored data goes on the same way', () => {
    const d = teamMatch();
    const end = readingEnd(d);
    d.buzz('m-ann', end + 100, end + 200);
    const again = new MatchDirector(JSON.parse(JSON.stringify(d.data)));
    expect(again.answer('m-ann', 'mitochondrion', end + 500, anyone)).toBeNull();
    expect(again.view().scores).toEqual([4, 0]);
  });
  it('read aloud, a toss-up answered right shows its text with its answer while the bonus is on (it never showed)', () => {
    const d = teamMatch({ mode: 'speech', wpm: 200 });
    const end = readingEnd(d);
    expect(d.buzz('m-ann', end + 500, end + 600)).toBeNull();
    expect(d.answer('m-ann', 'Mitochondria', end + 1000, anyone)).toBeNull();
    expect(d.view().label).toBe('Bonus 1');
    expect(d.view().match.previous).toEqual({ label: 'Toss-up 1', answer: 'MITOCHONDRION (ACCEPT: MITOCHONDRIA)', text: 'What organelle makes most of the ATP in eukaryotic cells?' });
  });
});

describe('free-for-all', () => {
  const cy: MatchPlayer = { memberId: 'm-cy', playerId: 'p-cy', name: 'Cy', side: 'B', captain: false };
  function ffa(count = 2) {
    const d = new MatchDirector(newMatchData(setup({ format: 'ffa', tossupCount: count })));
    expect(d.start([ann, bea, cy], 0)).toBeNull();
    d.advance(LEAD_MS);
    return d;
  }

  it('scores +4 for a right answer and −4 for a wrong interrupt, and the reading goes on after a neg', () => {
    const d = ffa();
    const start = d.data.q!.reading.startedAt;
    expect(d.buzzers()).toEqual({ open: true, sides: { A: true, B: true }, exclude: [] });
    d.buzz('m-ann', start + 300, start + 350);
    d.answer('m-ann', 'ribosome', start + 1000, anyone);
    expect(d.view().match.standings!.find((s) => s.memberId === 'm-ann')).toMatchObject({ score: -4, negs: 1 });
    expect(d.view().status).toContain('The reading goes on.');
    expect(d.buzzers().open).toBe(false);
    d.advance(start + 1000 + RESUME_LEAD_MS);
    expect(d.buzzers()).toEqual({ open: true, sides: { A: true, B: true }, exclude: ['m-ann'] });
    // The reading picks up where it stopped: its end moved by the length of the pause.
    expect(readingEnd(d)).toBe(start + d.data.q!.reading.durationMs + (1000 + RESUME_LEAD_MS - 300));
    const end = readingEnd(d);
    d.buzz('m-bea', end + 500, end + 600);
    d.answer('m-bea', 'transfer rna', end + 1500, anyone);
    // A wrong answer after the reading costs nothing; the window opens again for Cy.
    expect(d.view().match.standings!.find((s) => s.memberId === 'm-bea')!.score).toBe(0);
    d.buzz('m-cy', end + 1600, end + 1700);
    d.answer('m-cy', 'Mitochondria', end + 2500, anyone);
    const standings = d.view().match.standings!;
    expect(standings.map((s) => [s.name, s.score])).toEqual([
      ['Cy', 4],
      ['Bea', 0],
      ['Ann', -4],
    ]);
    // Each answer goes out for the player's own device to record as practice.
    expect(d.data.outbox.map((r) => [r.memberId, r.correct, r.interrupt])).toEqual([
      ['m-ann', false, true],
      ['m-bea', false, false],
      ['m-cy', true, false],
    ]);
    expect(d.data.outbox[1]!.latencyMs).toBe(500);
  });

  it('ends a toss-up when everyone has buzzed, or when its window runs out', () => {
    const d = ffa();
    const end = readingEnd(d);
    for (const [m, t] of [
      ['m-ann', 100],
      ['m-bea', 2000],
      ['m-cy', 4000],
    ] as const) {
      d.buzz(m, end + t, end + t + 50);
      d.answer(m, 'nucleus', end + t + 500, anyone);
    }
    expect(d.view().phase).toBe('ffa');
    expect(d.data.q!.overAt).not.toBeNull();
    // Next toss-up, which nobody answers.
    d.advance(d.data.q!.overAt! + NEXT_DELAY_MS + LEAD_MS);
    const end2 = readingEnd(d);
    d.advance(end2 + FFA_WINDOW_MS);
    expect(d.view().status).toBe('Time: nobody answered.');
    // Two toss-ups asked for: the game is over.
    d.advance(end2 + FFA_WINDOW_MS + NEXT_DELAY_MS);
    expect(d.data.status).toBe('finished');
    expect(d.view().label).toBe('Final');
    expect(d.heardQuestionIds()).toEqual(['t1', 't2']);
  });

  it('close calls go to the other players, never the one who answered', () => {
    const d = ffa();
    const end = readingEnd(d);
    d.buzz('m-ann', end + 100, end + 150);
    d.answer('m-ann', 'mitocondrion', end + 1000, anyone);
    expect(d.view().match.review).toMatchObject({ deciders: 'others', response: 'mitocondrion' });
    expect(d.deciders()).toEqual(['m-bea', 'm-cy']);
    expect(d.ruling('m-ann', true, end + 1100)).toBe("You can't rule on your own answer.");
    expect(d.ruling('m-cy', false, end + 1200)).toBeNull();
    expect(d.data.q!.overAt).toBe(end + 1200);
    expect(d.view().status).toContain('Nobody else may answer this one.');
  });

  it('checks the setup a member sends', () => {
    expect(() => parseMatchSetup({ format: 'chess' })).toThrow('Choose a match format');
    const body = { format: 'ffa', wpm: 250, packet: setup().packet, pairs: PAIRS, tossupCount: 2 };
    const parsed = parseMatchSetup(body);
    expect(parsed).toMatchObject({ format: 'ffa', wpm: 250, tossupCount: 2, teamNames: ['Team A', 'Team B'] });
    // Free-for-all games are toss-ups only.
    expect(parsed.pairs[0]!.bonus).toBeUndefined();
    expect(() => parseMatchSetup({ ...body, wpm: 20 })).toThrow('reading speed');
    expect(() => parseMatchSetup({ ...body, format: 'teams', presetId: 'nope' })).toThrow('Choose the rules');
    expect(() => parseMatchSetup({ ...body, pairs: [{ tossup: { ...PAIRS[0]!.tossup, subject: 'alchemy' } }] })).toThrow('unknown subject');
    expect(() => parseMatchSetup({ ...body, tossupCount: 9 })).toThrow('Choose 1 to 3 toss-ups.');
  });

  it('reads questions on screen unless the host chooses to have them read aloud, at a pace a voice can keep', () => {
    const body = { format: 'ffa', wpm: 250, packet: setup().packet, pairs: PAIRS, tossupCount: 2 };
    expect(parseMatchSetup(body).mode).toBe('text');
    expect(parseMatchSetup({ ...body, mode: 'speech' }).mode).toBe('speech');
    expect(() => parseMatchSetup({ ...body, mode: 'radio' })).toThrow('Choose how questions are read');
    expect(() => parseMatchSetup({ ...body, mode: 'speech', wpm: 400 })).toThrow('Choose a reading speed of 100 to 300 words per minute to read aloud.');
    expect(parseMatchSetup({ ...body, wpm: 400 }).wpm).toBe(400);
    // The view says which, so players' devices know whether to show the text or say it.
    const d = new MatchDirector(newMatchData(parseMatchSetup({ ...body, mode: 'speech' })));
    expect(d.view().match.mode).toBe('speech');
    // A match stored before speech mode reads on screen.
    const old = newMatchData(parseMatchSetup(body));
    delete old.setup.mode;
    expect(new MatchDirector(old).view().match.mode).toBe('text');
  });
});
