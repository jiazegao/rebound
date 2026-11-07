import { describe, expect, it } from 'vitest';
import {
  allowedEvents,
  applyEvent,
  clockRemainingMs,
  createMatch,
  currentWindow,
  replay,
  RuleError,
  type EventInput,
  type MatchConfig,
  type MatchEvent,
  type MatchState,
} from './engine';
import { getPreset } from './presets';

const A = 0 as const;
const B = 1 as const;

function config(presetId = 'doe-regional-2027', pairCount = 23): MatchConfig {
  return {
    preset: getPreset(presetId),
    teams: [
      { name: 'Team A', playerIds: ['a1', 'a2', 'a3', 'a4'] },
      { name: 'Team B', playerIds: ['b1', 'b2', 'b3', 'b4'] },
    ],
    pairCount,
  };
}

/** Small helper: apply events one after another with increasing timestamps. */
function play(cfg: MatchConfig, events: Array<EventInput & { t?: number }>, start = 1_000): MatchState {
  let t = start;
  let state = createMatch(cfg);
  for (const e of events) {
    t = e.t ?? t + 1_000;
    state = applyEvent(state, { ...e, t } as MatchEvent);
  }
  return state;
}

describe('toss-ups and bonuses', () => {
  it('awards 4 for a correct toss-up and 10 for a correct bonus', () => {
    const s = play(config(), [
      { type: 'start' },
      { type: 'tossup_read' },
      { type: 'buzz', team: A, playerId: 'a1' },
      { type: 'tossup_judged', result: 'correct' },
      { type: 'bonus_read' },
      { type: 'bonus_judged', result: 'correct' },
    ]);
    expect(s.scores).toEqual([14, 0]);
    expect(s.phase).toBe('question_over');
    expect(s.readTossups).toEqual([0]);
    expect(s.readBonuses).toEqual([0]);
  });

  it('gives the other team a 5-second rebound after a wrong answer on a fully read toss-up (Rule 3-8)', () => {
    let s = play(config(), [
      { type: 'start' },
      { type: 'tossup_read' },
      { type: 'buzz', team: A, playerId: 'a2' },
      { type: 'tossup_judged', result: 'incorrect', t: 10_000 },
    ]);
    expect(s.scores).toEqual([0, 0]);
    expect(s.phase).toBe('tossup_open');
    expect(currentWindow(s)).toMatchObject({ kind: 'rebound', openedAt: 10_000, seconds: 5 });
    expect(() => applyEvent(s, { type: 'buzz', team: A, playerId: 'a3', t: 11_000 })).toThrow(RuleError);
    s = applyEvent(s, { type: 'buzz', team: B, playerId: 'b1', t: 12_000 });
    s = applyEvent(s, { type: 'tossup_judged', result: 'correct', t: 13_000 });
    expect(s.scores).toEqual([0, 4]);
    expect(s.phase).toBe('bonus_reading');
    expect(s.bonus?.team).toBe(B);
  });

  it('ends the toss-up with no bonus when nobody buzzes in time', () => {
    const s = play(config(), [{ type: 'start' }, { type: 'tossup_read' }, { type: 'tossup_dead' }]);
    expect(s.phase).toBe('question_over');
    expect(s.bonus).toBeNull();
    expect(s.log.at(-1)).toMatchObject({ kind: 'tossup_dead', pairIndex: 0 });
  });

  it('records how long after the reading a player buzzed', () => {
    const s = play(config(), [
      { type: 'start', t: 0 },
      { type: 'tossup_read', t: 10_000 },
      { type: 'buzz', team: A, playerId: 'a1', t: 11_200 },
      { type: 'tossup_judged', result: 'correct', t: 12_000 },
    ]);
    expect(s.log[0]).toMatchObject({ kind: 'tossup', latencyMs: 1_200, interrupt: false });
  });
});

describe('interrupts, blurts and the double interrupt', () => {
  it('gives the opponent 4 points and a full re-read after a wrong interrupt (Rule 6-2)', () => {
    let s = play(config(), [
      { type: 'start' },
      { type: 'buzz', team: A, playerId: 'a1' },
      { type: 'tossup_judged', result: 'incorrect' },
    ]);
    expect(s.scores).toEqual([0, 4]);
    expect(s.phase).toBe('tossup_reading');
    expect(s.tossup).toMatchObject({ reread: true, readComplete: false, eligible: [false, true] });
    expect(s.log[0]).toMatchObject({ interrupt: true, latencyMs: null, points: [0, 4] });

    s = applyEvent(s, { type: 'tossup_read', t: 9_000 });
    s = applyEvent(s, { type: 'buzz', team: B, playerId: 'b2', t: 10_000 });
    s = applyEvent(s, { type: 'tossup_judged', result: 'correct', t: 11_000 });
    expect(s.scores).toEqual([0, 8]);
    expect(s.phase).toBe('bonus_reading');
  });

  it('treats a blurt on a fully read toss-up as 0 points and offers it to the other team (Rule 4-1)', () => {
    const s = play(config(), [
      { type: 'start' },
      { type: 'tossup_read' },
      { type: 'buzz', team: A, playerId: 'a1' },
      { type: 'tossup_judged', result: 'blurt' },
    ]);
    expect(s.scores).toEqual([0, 0]);
    expect(s.phase).toBe('tossup_open');
    expect(s.tossup?.windowKind).toBe('rebound');
  });

  it('treats a blurt on an interrupted toss-up like any interrupt fault', () => {
    const s = play(config(), [
      { type: 'start' },
      { type: 'buzz', team: B, playerId: 'b3' },
      { type: 'tossup_judged', result: 'blurt' },
    ]);
    expect(s.scores).toEqual([4, 0]);
    expect(s.tossup?.reread).toBe(true);
  });

  it('scores the double interrupt: both teams gain 4 and play moves on (Rule 6-3)', () => {
    const s = play(config(), [
      { type: 'start' },
      { type: 'buzz', team: A, playerId: 'a1' },
      { type: 'tossup_judged', result: 'incorrect' },
      { type: 'buzz', team: B, playerId: 'b1' }, // interrupts the re-read
      { type: 'tossup_judged', result: 'stall' },
    ]);
    expect(s.scores).toEqual([4, 4]);
    expect(s.phase).toBe('question_over');
  });

  it('uses −4 for the interrupter in the invitational variant', () => {
    const s = play(config('invitational-neg4'), [
      { type: 'start' },
      { type: 'buzz', team: A, playerId: 'a1' },
      { type: 'tossup_judged', result: 'incorrect' },
    ]);
    expect(s.scores).toEqual([-4, 0]);
  });

  it('rejects a buzz from a player who is not in the lineup', () => {
    const s = play(config(), [{ type: 'start' }]);
    expect(() => applyEvent(s, { type: 'buzz', team: A, playerId: 'b1', t: 5 })).toThrow(RuleError);
  });
});

describe('game clock, halves and game end', () => {
  it('finishes the current question, then goes to halftime, then resumes with the next toss-up (Rule 5-6)', () => {
    let s = play(config(), [
      { type: 'start', t: 0 },
      { type: 'tossup_read', t: 1_000 },
      { type: 'buzz', team: A, playerId: 'a1', t: 2_000 },
      { type: 'time_expired', t: 480_000 },
    ]);
    expect(s.clock?.expired).toBe(true);
    expect(s.phase).toBe('tossup_answering');
    s = applyEvent(s, { type: 'tossup_judged', result: 'correct', t: 481_000 });
    s = applyEvent(s, { type: 'bonus_read', t: 482_000 });
    s = applyEvent(s, { type: 'bonus_judged', result: 'incorrect', t: 483_000 });
    s = applyEvent(s, { type: 'next', t: 484_000 });
    expect(s.phase).toBe('halftime');
    expect(s.scores).toEqual([4, 0]);

    s = applyEvent(s, { type: 'start_half', t: 600_000 });
    expect(s.period).toBe(2);
    expect(s.pairIndex).toBe(1);
    expect(clockRemainingMs(s, 660_000)).toBe(8 * 60_000 - 60_000);
  });

  it('ends the game when time expires in the second half', () => {
    let s = play(config(), [{ type: 'start' }, { type: 'time_expired' }, { type: 'tossup_read' }, { type: 'tossup_dead' }, { type: 'next' }]);
    expect(s.phase).toBe('halftime');
    s = applyEvent(s, { type: 'start_half', t: 100_000 });
    s = applyEvent(s, { type: 'time_expired', t: 200_000 });
    s = applyEvent(s, { type: 'tossup_read', t: 201_000 });
    s = applyEvent(s, { type: 'tossup_dead', t: 206_000 });
    s = applyEvent(s, { type: 'next', t: 207_000 });
    expect(s.phase).toBe('game_over');
    expect(s.endedReason).toBe('time');
  });

  it('pauses and resumes the clock', () => {
    let s = play(config(), [{ type: 'start', t: 0 }]);
    expect(clockRemainingMs(s, 60_000)).toBe(420_000);
    s = applyEvent(s, { type: 'clock_pause', t: 60_000 });
    expect(clockRemainingMs(s, 300_000)).toBe(420_000);
    s = applyEvent(s, { type: 'clock_resume', t: 300_000 });
    expect(clockRemainingMs(s, 330_000)).toBe(390_000);
  });

  it('stops a virtual game after 18 toss-ups', () => {
    const events: Array<EventInput> = [{ type: 'start' }];
    for (let i = 0; i < 18; i++) {
      events.push({ type: 'tossup_read' }, { type: 'tossup_dead' }, { type: 'next' });
    }
    const s = play(config('doe-virtual-2027', 23), events);
    expect(s.phase).toBe('game_over');
    expect(s.endedReason).toBe('limit');
    expect(s.tossupsBegun).toBe(18);
  });

  it('ends the game when the packet runs out', () => {
    const s = play(config('practice-untimed', 2), [
      { type: 'start' },
      { type: 'tossup_read' },
      { type: 'tossup_dead' },
      { type: 'next' },
      { type: 'tossup_read' },
      { type: 'tossup_dead' },
      { type: 'next' },
    ]);
    expect(s.phase).toBe('game_over');
    expect(s.endedReason).toBe('packet');
  });
});

describe('tiebreakers (Rule 6-4)', () => {
  it('plays 5 toss-ups without bonuses, and another 5 if still tied', () => {
    let s = play(config('practice-untimed', 20), [{ type: 'start' }, { type: 'end_game' }]);
    expect(s.scores).toEqual([0, 0]);
    expect(allowedEvents(s).has('start_tiebreak')).toBe(true);
    s = applyEvent(s, { type: 'start_tiebreak', t: 50_000 });
    expect(s.period).toBe('tiebreak');
    expect(s.clock).toBeNull();

    let t = 60_000;
    const step = (e: EventInput) => {
      t += 1_000;
      s = applyEvent(s, { ...e, t } as MatchEvent);
    };
    // First series: nobody scores.
    for (let i = 0; i < 5; i++) {
      step({ type: 'tossup_read' });
      step({ type: 'tossup_dead' });
      step({ type: 'next' });
    }
    expect(s.phase).toBe('tossup_reading'); // second series started
    // Team B wins a toss-up; no bonus follows.
    step({ type: 'tossup_read' });
    step({ type: 'buzz', team: B, playerId: 'b4' });
    step({ type: 'tossup_judged', result: 'correct' });
    expect(s.phase).toBe('question_over');
    expect(s.bonus).toBeNull();
    step({ type: 'next' });
    for (let i = 0; i < 4; i++) {
      step({ type: 'tossup_read' });
      step({ type: 'tossup_dead' });
      step({ type: 'next' });
    }
    expect(s.phase).toBe('game_over');
    expect(s.endedReason).toBe('tiebreak');
    expect(s.scores).toEqual([0, 4]);
  });
});

describe('undo and validation', () => {
  it('undoes by replaying all but the last event', () => {
    const events: MatchEvent[] = [
      { type: 'start', t: 1 },
      { type: 'tossup_read', t: 2 },
      { type: 'buzz', team: A, playerId: 'a1', t: 3 },
      { type: 'tossup_judged', result: 'correct', t: 4 },
    ];
    const cfg = config();
    expect(replay(cfg, events).scores).toEqual([4, 0]);
    const undone = replay(cfg, events.slice(0, -1));
    expect(undone.scores).toEqual([0, 0]);
    expect(undone.phase).toBe('tossup_answering');
  });

  it('rejects events that do not fit the current phase', () => {
    const s = createMatch(config());
    expect(() => applyEvent(s, { type: 'buzz', team: A, playerId: 'a1', t: 1 })).toThrow(RuleError);
    expect(allowedEvents(s)).toEqual(new Set(['start', 'set_lineup']));
  });

  it('allows substitutions only before the game, at halftime or before a tiebreaker', () => {
    let s = play(config(), [{ type: 'start' }]);
    expect(allowedEvents(s).has('set_lineup')).toBe(false);
    s = play(config(), [{ type: 'set_lineup', team: A, playerIds: ['a1', 'a2', 'a3', 'a5'] }, { type: 'start' }]);
    expect(s.lineups[A]).toEqual(['a1', 'a2', 'a3', 'a5']);
    expect(() => play(config(), [{ type: 'set_lineup', team: A, playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] }])).toThrow(RuleError);
  });

  it('records manual score adjustments in the log', () => {
    const s = play(config(), [{ type: 'start' }, { type: 'adjust_score', team: B, delta: 4, note: 'Challenge upheld' }]);
    expect(s.scores).toEqual([0, 4]);
    expect(s.log.at(-1)).toMatchObject({ kind: 'adjust', note: 'Challenge upheld' });
  });
});
