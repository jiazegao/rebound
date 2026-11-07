import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnswerBox, Choices, ImportNotes, QuestionMeta, RichText } from '../components/QuestionView';
import { Countdown, LoadError, Loading, Notice, useTicker } from '../components/ui';
import {
  allowedEvents,
  applyEvent,
  clockRemainingMs,
  currentWindow,
  replay,
  RuleError,
  type EventInput,
  type LogEntry,
  type MatchEvent,
  type MatchState,
  type TeamIdx,
} from '../core/rules/engine';
import { getPreset } from '../core/rules/presets';
import type { Question, Round } from '../core/schema';
import { clockText } from '../lib/format';
import { useAsync } from '../lib/library';
import { loadGameRound } from '../lib/packets';
import { href } from '../lib/router';
import { beep, unlockAudio } from '../lib/sound';
import { appendEvent, finishGame, markSeen, undoEvent, update, useData, type GameRecord } from '../lib/store';

const TEAM_KEYS: [string[], string[]] = [
  ['1', '2', '3', '4'],
  ['7', '8', '9', '0'],
];

const RESULT_LABELS: Record<string, string> = {
  correct: 'correct',
  incorrect: 'wrong',
  blurt: 'blurt',
  stall: 'stall',
  communication: 'talking',
  timeout: 'no answer in time',
};

function describe(entry: LogEntry, game: GameRecord, names: Map<string, string>): string {
  switch (entry.kind) {
    case 'tossup': {
      const who = names.get(entry.playerId) ?? entry.playerId;
      const pts = entry.points[0] || entry.points[1] ? ` (${entry.points.map((p) => (p > 0 ? `+${p}` : p)).join(' / ')})` : '';
      return `Toss-up ${entry.pairIndex + 1}: ${who}${entry.interrupt ? ' interrupted,' : ''} ${RESULT_LABELS[entry.result]}${pts}`;
    }
    case 'tossup_dead':
      return `Toss-up ${entry.pairIndex + 1}: no correct answer`;
    case 'bonus':
      return `Bonus ${entry.pairIndex + 1} (${game.teams[entry.team].name}): ${RESULT_LABELS[entry.result]}${entry.result === 'correct' ? ' (+10)' : ''}`;
    case 'throw_out':
      return `${entry.part === 'bonus' ? 'Bonus' : 'Toss-up'} ${entry.pairIndex + 1} thrown out`;
    case 'adjust':
      return `${game.teams[entry.team].name} ${entry.delta > 0 ? '+' : ''}${entry.delta}: ${entry.note}`;
  }
}

function questionIdsRead(state: MatchState, game: GameRecord): string[] {
  const ids: string[] = [];
  for (const i of state.readTossups) if (game.pairs[i]) ids.push(game.pairs[i].tossupId);
  for (const i of state.readBonuses) {
    const b = game.pairs[i]?.bonusId;
    if (b) ids.push(b);
  }
  return ids;
}

function Lineups({ state, game, names, allowEdit, dispatch }: { state: MatchState; game: GameRecord; names: Map<string, string>; allowEdit: boolean; dispatch: (e: EventInput) => void }) {
  const data = useData();
  const roster = data.players.filter((p) => p.active && p.role !== 'coach');
  const [editing, setEditing] = useState<TeamIdx | null>(null);
  return (
    <div className="grid-2">
      {([0, 1] as TeamIdx[]).map((team) => (
        <div key={team} className="card">
          <div className="row spread">
            <strong style={{ color: team === 0 ? 'var(--team-a)' : 'var(--team-b)' }}>{game.teams[team].name}</strong>
            {allowEdit && (
              <button className="btn btn-small" onClick={() => setEditing(editing === team ? null : team)}>
                {editing === team ? 'Done' : 'Substitute'}
              </button>
            )}
          </div>
          {editing === team ? (
            <div style={{ display: 'grid', gap: '0.25rem', marginTop: '0.5rem' }}>
              {roster.map((p) => {
                const inLineup = state.lineups[team].includes(p.id);
                const onOther = state.lineups[team === 0 ? 1 : 0].includes(p.id);
                return (
                  <label key={p.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={inLineup}
                      disabled={onOther || (!inLineup && state.lineups[team].length >= 4)}
                      onChange={() => {
                        const next = inLineup ? state.lineups[team].filter((id) => id !== p.id) : [...state.lineups[team], p.id];
                        if (next.length >= 1) dispatch({ type: 'set_lineup', team, playerIds: next });
                      }}
                    />
                    {p.name}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="muted" style={{ margin: '0.4rem 0 0' }}>
              {state.lineups[team].map((id) => names.get(id) ?? id).join(', ')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ReaderGame({ game, round }: { game: GameRecord; round: Round }) {
  const data = useData();
  const [toast, setToast] = useState<string | null>(null);
  const [hideAnswer, setHideAnswer] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustTeam, setAdjustTeam] = useState<TeamIdx>(0);
  const [adjustDelta, setAdjustDelta] = useState(4);
  const [adjustNote, setAdjustNote] = useState('Challenge upheld');

  const config = useMemo(() => ({ preset: getPreset(game.presetId), teams: game.teams, pairCount: game.pairs.length }), [game.presetId, game.teams, game.pairs.length]);
  const state = useMemo(() => replay(config, game.events), [config, game.events]);
  const allowed = allowedEvents(state);
  const names = useMemo(() => new Map(data.players.map((p) => [p.id, p.name])), [data.players]);
  const pair = state.pairIndex >= 0 ? round.pairs[state.pairIndex] : undefined;
  const win = currentWindow(state);
  const clockRunning = state.clock !== null && state.clock.runningSince !== null && !state.clock.expired;
  const now = useTicker(clockRunning || win !== null, 100);
  const remaining = clockRemainingMs(state, now);
  const sound = data.settings.sound;

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3_000);
  }, []);

  const dispatch = useCallback(
    (input: EventInput) => {
      const event = { ...input, t: Date.now() } as MatchEvent;
      let next: MatchState;
      try {
        next = applyEvent(state, event);
      } catch (err) {
        flash(err instanceof RuleError ? err.message : 'That action is not available right now.');
        return;
      }
      appendEvent(game.id, event);
      markSeen([...next.lineups[0], ...next.lineups[1]], questionIdsRead(next, game));
      if (next.phase === 'game_over') finishGame(game.id, next.scores);
      else if (game.status === 'finished') {
        update((d) => {
          const g = d.games.find((x) => x.id === game.id);
          if (g) g.status = 'in_progress';
        });
      }
    },
    [state, game, flash],
  );

  // The game clock: when it reaches zero, the half ends after the current question (Rule 5-6).
  const expiredFor = useRef<string | null>(null);
  useEffect(() => {
    if (remaining === 0 && allowed.has('time_expired')) {
      const key = `${state.period}`;
      if (expiredFor.current !== key) {
        expiredFor.current = key;
        if (sound) beep('time');
        dispatch({ type: 'time_expired' });
      }
    }
  }, [remaining, allowed, state.period, dispatch, sound]);

  // Beeps for the answer windows: "5 SECONDS" on bonuses and "TIME" at the end.
  const fired = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!win || !sound) return;
    const elapsed = (now - win.openedAt) / 1000;
    const key = `${win.kind}-${win.openedAt}`;
    if (win.warningAt !== undefined && elapsed >= win.warningAt && !fired.current.has(`${key}-w`)) {
      fired.current.add(`${key}-w`);
      beep('warning');
    }
    if (elapsed >= win.seconds && !fired.current.has(`${key}-t`)) {
      fired.current.add(`${key}-t`);
      beep('time');
    }
  }, [now, win, sound]);

  const judgeKeys = useCallback(
    (key: string) => {
      const tossupResults: Record<string, EventInput> = {
        c: { type: 'tossup_judged', result: 'correct' },
        x: { type: 'tossup_judged', result: 'incorrect' },
        b: { type: 'tossup_judged', result: 'blurt' },
        s: { type: 'tossup_judged', result: 'stall' },
        t: { type: 'tossup_judged', result: 'communication' },
      };
      const bonusResults: Record<string, EventInput> = {
        c: { type: 'bonus_judged', result: 'correct' },
        x: { type: 'bonus_judged', result: 'incorrect' },
        n: { type: 'bonus_judged', result: 'timeout' },
      };
      if (allowed.has('tossup_judged') && tossupResults[key]) return tossupResults[key];
      if (allowed.has('bonus_judged') && bonusResults[key]) return bonusResults[key];
      if (key === 'n' && allowed.has('tossup_dead')) return { type: 'tossup_dead' } as EventInput;
      return null;
    },
    [allowed],
  );

  const primaryAction = useCallback((): EventInput | null => {
    if (allowed.has('start')) return { type: 'start' };
    if (allowed.has('tossup_read')) return { type: 'tossup_read' };
    if (allowed.has('bonus_read')) return { type: 'bonus_read' };
    if (allowed.has('next')) return { type: 'next' };
    if (allowed.has('start_half')) return { type: 'start_half' };
    return null;
  }, [allowed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          undoEvent(game.id);
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'enter') {
        if (target && target.tagName === 'BUTTON' && key === 'enter') return;
        const action = primaryAction();
        if (action) {
          e.preventDefault();
          unlockAudio();
          dispatch(action);
        }
        return;
      }
      for (const team of [0, 1] as TeamIdx[]) {
        const i = TEAM_KEYS[team].indexOf(key);
        if (i >= 0 && allowed.has('buzz') && state.tossup?.eligible[team]) {
          const playerId = state.lineups[team][i];
          if (playerId) {
            e.preventDefault();
            dispatch({ type: 'buzz', team, playerId });
          }
          return;
        }
      }
      const judged = judgeKeys(key);
      if (judged) {
        e.preventDefault();
        dispatch(judged);
        return;
      }
      if (key === 'u') undoEvent(game.id);
      else if (key === 'p') {
        if (allowed.has('clock_pause')) dispatch({ type: 'clock_pause' });
        else if (allowed.has('clock_resume')) dispatch({ type: 'clock_resume' });
      } else if (key === 'h') setHideAnswer((v) => !v);
      else if (key === '?') setShowHelp((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allowed, dispatch, game.id, judgeKeys, primaryAction, state.lineups, state.tossup]);

  const phase = state.phase;
  const showingBonus = phase === 'bonus_reading' || phase === 'bonus_open';
  const question: Question | undefined = showingBonus ? pair?.bonus : pair?.tossup;
  const buzz = state.tossup?.buzz;
  const periodLabel = state.period === 'tiebreak' ? 'Tiebreaker' : state.period === 1 ? 'First half' : 'Second half';
  const pairLog = state.log.filter((e) => 'pairIndex' in e && e.pairIndex === state.pairIndex);

  const playerButtons = (team: TeamIdx) => {
    const eligible = allowed.has('buzz') && state.tossup?.eligible[team];
    return (
      <div className={`player-col ${team === 0 ? 'team-a' : 'team-b'}`}>
        <h3 style={{ color: team === 0 ? 'var(--team-a)' : 'var(--team-b)' }}>{game.teams[team].name}</h3>
        {state.lineups[team].map((pid, i) => (
          <button
            key={pid}
            className="btn player-btn"
            disabled={!eligible}
            aria-pressed={buzz?.playerId === pid}
            onClick={() => {
              unlockAudio();
              dispatch({ type: 'buzz', team, playerId: pid });
            }}
          >
            <span>{names.get(pid) ?? pid}</span>
            <span className="kbd">{TEAM_KEYS[team][i]}</span>
          </button>
        ))}
        {state.tossup && !state.tossup.eligible[team] && <span className="small muted">Already had its chance</span>}
      </div>
    );
  };

  let instructions = '';
  let controls: ReactNode = null;
  switch (phase) {
    case 'not_started':
      instructions = 'Check the lineups, then start. The game clock starts with the first toss-up.';
      controls = (
        <button className="btn btn-primary btn-big" onClick={() => { unlockAudio(); dispatch({ type: 'start' }); }}>
          Start game <span className="kbd">Space</span>
        </button>
      );
      break;
    case 'tossup_reading':
      instructions = state.tossup?.reread
        ? `Re-read the whole toss-up for ${game.teams[state.tossup.eligible[0] ? 0 : 1].name}. A buzz before you finish is another interrupt.`
        : 'Read the toss-up. Tap "Done reading" after the last word, including the choices. A buzz before that is an interrupt.';
      controls = (
        <>
          <button className="btn btn-primary btn-big" onClick={() => dispatch({ type: 'tossup_read' })}>
            Done reading <span className="kbd">Space</span>
          </button>
          <p className="small muted">Buzz now = interrupt. Tap the player who buzzed.</p>
          <div className="player-grid">
            {playerButtons(0)}
            {playerButtons(1)}
          </div>
        </>
      );
      break;
    case 'tossup_open':
      instructions = state.tossup?.windowKind === 'rebound' ? 'Rebound: the other team has 5 seconds.' : 'Both teams have 5 seconds to buzz.';
      controls = (
        <>
          {win && <Countdown openedAt={win.openedAt} seconds={win.seconds} now={now} label={win.kind === 'rebound' ? 'Rebound' : 'Time to buzz'} />}
          <div className="player-grid">
            {playerButtons(0)}
            {playerButtons(1)}
          </div>
          <button className="btn" onClick={() => dispatch({ type: 'tossup_dead' })}>
            No buzz, time <span className="kbd">N</span>
          </button>
        </>
      );
      break;
    case 'tossup_answering':
      instructions = buzz
        ? `${names.get(buzz.playerId) ?? buzz.playerId} (${game.teams[buzz.team].name})${buzz.interrupt ? ' interrupted' : ' buzzed'}. Recognize them; they must start within about 2 seconds.`
        : '';
      controls = (
        <div className="judge-row">
          <button className="btn btn-good btn-big" onClick={() => dispatch({ type: 'tossup_judged', result: 'correct' })}>
            Correct <span className="kbd">C</span>
          </button>
          <button className="btn btn-bad btn-big" onClick={() => dispatch({ type: 'tossup_judged', result: 'incorrect' })}>
            Wrong <span className="kbd">X</span>
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'tossup_judged', result: 'blurt' })}>
            Blurt <span className="kbd">B</span>
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'tossup_judged', result: 'stall' })}>
            Stall <span className="kbd">S</span>
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'tossup_judged', result: 'communication' })}>
            Talking <span className="kbd">T</span>
          </button>
        </div>
      );
      break;
    case 'bonus_reading':
      instructions = `Bonus for ${game.teams[state.bonus!.team].name}. Read it, then tap "Done reading"; the 20 seconds start then.`;
      controls = (
        <button className="btn btn-primary btn-big" onClick={() => dispatch({ type: 'bonus_read' })}>
          Done reading <span className="kbd">Space</span>
        </button>
      );
      break;
    case 'bonus_open':
      instructions = `${game.teams[state.bonus!.team].name} may confer; only the captain answers.`;
      controls = (
        <>
          {win && <Countdown openedAt={win.openedAt} seconds={win.seconds} warningAt={win.warningAt} now={now} label="Bonus" />}
          <div className="judge-row">
            <button className="btn btn-good btn-big" onClick={() => dispatch({ type: 'bonus_judged', result: 'correct' })}>
              Correct <span className="kbd">C</span>
            </button>
            <button className="btn btn-bad btn-big" onClick={() => dispatch({ type: 'bonus_judged', result: 'incorrect' })}>
              Wrong <span className="kbd">X</span>
            </button>
            <button className="btn" onClick={() => dispatch({ type: 'bonus_judged', result: 'timeout' })}>
              No answer <span className="kbd">N</span>
            </button>
          </div>
        </>
      );
      break;
    case 'question_over':
      instructions = state.clock?.expired
        ? state.period === 1
          ? 'Time. "Next" ends the first half.'
          : 'Time. "Next" ends the game.'
        : 'Question over.';
      controls = (
        <>
          <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {pairLog.map((entry, i) => (
              <li key={i}>{describe(entry, game, names)}</li>
            ))}
          </ul>
          <button className="btn btn-primary btn-big" onClick={() => dispatch({ type: 'next' })}>
            Next <span className="kbd">Space</span>
          </button>
        </>
      );
      break;
    case 'halftime':
      instructions = 'Halftime. Substitutions are allowed now (Rule 8-1).';
      controls = (
        <button className="btn btn-primary btn-big" onClick={() => dispatch({ type: 'start_half' })}>
          Start second half <span className="kbd">Space</span>
        </button>
      );
      break;
    case 'game_over': {
      const tied = state.scores[0] === state.scores[1];
      instructions = tied ? 'Tied. In elimination games, play a 5-toss-up tiebreaker.' : 'Game over.';
      controls = (
        <div className="row">
          {allowed.has('start_tiebreak') && (
            <button className="btn btn-primary" onClick={() => dispatch({ type: 'start_tiebreak' })}>
              Start tiebreaker
            </button>
          )}
          <a className="btn btn-primary" href={href(`/games/${game.id}`)}>
            See game summary
          </a>
          <a className="btn" href={href('/reader')}>
            New game
          </a>
        </div>
      );
      break;
    }
  }

  return (
    <div className="container reader">
      <div className="row spread no-print" style={{ marginBottom: '0.75rem' }}>
        <div className="small muted">
          <a href={href('/reader')}>Reader console</a> · {game.packet.setTitle}, {game.packet.roundLabel} · {config.preset.name}
        </div>
        <div className="toolbar">
          <button className="btn btn-small" onClick={() => setHideAnswer((v) => !v)} aria-pressed={hideAnswer}>
            {hideAnswer ? 'Show answer' : 'Hide answer'} <span className="kbd">H</span>
          </button>
          <button className="btn btn-small" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>
            Keys <span className="kbd">?</span>
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="card small" style={{ marginBottom: '0.75rem' }}>
          <strong>Keyboard:</strong> Space or Enter = the main button (start, done reading, next). Players: {game.teams[0].name} 1–4,{' '}
          {game.teams[1].name} 7, 8, 9, 0. Then C = correct, X = wrong, B = blurt, S = stall, T = talking, N = no buzz / no answer. U or Ctrl+Z =
          undo. P = pause the clock. H = hide the answer (for projecting).
        </div>
      )}

      <div className="scorebar" aria-live="polite">
        <div className="score score-a">
          <span className="team-name">{game.teams[0].name}</span>
          <span className="points">{state.scores[0]}</span>
        </div>
        <div className="clock">
          <div className="small muted">{periodLabel}</div>
          {remaining !== null ? (
            <div className={`time ${state.clock?.expired ? 'expired' : ''}`}>{state.clock?.expired ? 'TIME' : clockText(remaining)}</div>
          ) : (
            <div className="time">—</div>
          )}
          {state.clock && !state.clock.expired && state.clock.runningSince === null && phase !== 'not_started' && phase !== 'halftime' && phase !== 'game_over' && (
            <div className="small" style={{ color: 'var(--warn)' }}>Clock paused</div>
          )}
        </div>
        <div className="score score-b">
          <span className="team-name">{game.teams[1].name}</span>
          <span className="points">{state.scores[1]}</span>
        </div>
      </div>

      <p className="status-line" style={{ margin: '0.75rem 0' }}>
        {state.pairIndex >= 0 && phase !== 'game_over' && phase !== 'halftime' && (
          <span className="muted">
            {showingBonus ? 'Bonus' : 'Toss-up'} {state.pairIndex + 1} of {game.pairs.length} ·{' '}
          </span>
        )}
        {instructions}
      </p>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section aria-label="Question">
          {question && phase !== 'game_over' && phase !== 'halftime' ? (
            <article className="question">
              <QuestionMeta q={question} />
              <p className="stem">
                <RichText text={question.stem} />
              </p>
              <Choices q={question} />
              {!hideAnswer && <AnswerBox q={question} />}
              <ImportNotes q={question} />
            </article>
          ) : (
            <Lineups state={state} game={game} names={names} allowEdit={allowed.has('set_lineup')} dispatch={dispatch} />
          )}
          {phase === 'question_over' && pair?.bonus && state.bonus === null && pairLog.some((e) => e.kind === 'bonus') && (
            <p className="small muted">Bonus answer: {pair.bonus.answerLetter ? `${pair.bonus.answerLetter}) ` : ''}{pair.bonus.answer}</p>
          )}
        </section>
        <section className="stack" aria-label="Controls">
          {controls}
        </section>
      </div>

      <div className="toolbar no-print" style={{ marginTop: '1.25rem' }}>
        <button className="btn btn-small" onClick={() => undoEvent(game.id)} disabled={game.events.length === 0}>
          Undo <span className="kbd">U</span>
        </button>
        {(allowed.has('clock_pause') || allowed.has('clock_resume')) && (
          <button className="btn btn-small" onClick={() => dispatch({ type: allowed.has('clock_pause') ? 'clock_pause' : 'clock_resume' })}>
            {allowed.has('clock_pause') ? 'Pause clock' : 'Resume clock'} <span className="kbd">P</span>
          </button>
        )}
        {allowed.has('throw_out') && (
          <button
            className="btn btn-small"
            onClick={() => {
              if (confirm('Throw out this question? No points are awarded for it.')) dispatch({ type: 'throw_out', note: 'Thrown out by reader' });
            }}
          >
            Throw out question
          </button>
        )}
        {allowed.has('adjust_score') && (
          <button className="btn btn-small" onClick={() => setAdjusting((v) => !v)} aria-expanded={adjusting}>
            Adjust score
          </button>
        )}
        {allowed.has('end_game') && (
          <button
            className="btn btn-small btn-ghost"
            onClick={() => {
              if (confirm('End the game now?')) dispatch({ type: 'end_game' });
            }}
          >
            End game
          </button>
        )}
      </div>

      {adjusting && (
        <form
          className="card row"
          style={{ marginTop: '0.75rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!adjustDelta) return;
            dispatch({ type: 'adjust_score', team: adjustTeam, delta: adjustDelta, note: adjustNote || 'Score correction' });
            setAdjusting(false);
          }}
        >
          <select aria-label="Team" value={adjustTeam} onChange={(e) => setAdjustTeam(Number(e.target.value) as TeamIdx)} style={{ width: 'auto' }}>
            <option value={0}>{game.teams[0].name}</option>
            <option value={1}>{game.teams[1].name}</option>
          </select>
          <input type="number" aria-label="Points" value={adjustDelta} onChange={(e) => setAdjustDelta(Number(e.target.value))} style={{ width: 100 }} />
          <input type="text" aria-label="Reason" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} style={{ maxWidth: 260 }} />
          <button className="btn btn-primary" type="submit">
            Apply
          </button>
        </form>
      )}

      {state.log.length > 0 && (
        <details style={{ marginTop: '1.25rem' }}>
          <summary>Game log ({state.log.length})</summary>
          <ol className="small">
            {state.log.map((entry, i) => (
              <li key={i}>{describe(entry, game, names)}</li>
            ))}
          </ol>
        </details>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

export function ReaderLive({ gameId }: { gameId: string }) {
  const data = useData();
  const game = data.games.find((g) => g.id === gameId);
  const round = useAsync(game ? `${game.packet.setId}|${game.packet.roundId}` : null, () => loadGameRound(game!.packet));
  if (!game) {
    return (
      <div className="container narrow">
        <Notice kind="error">
          Game not found. It may have been deleted, or it was played in another browser. <a href={href('/reader')}>Start a new game</a>.
        </Notice>
      </div>
    );
  }
  if (round.loading) return <div className="container"><Loading what="Loading the questions" /></div>;
  if (round.error || !round.data) return <div className="container"><LoadError error={round.error ?? new Error('Round not found')} /></div>;
  return <ReaderGame game={game} round={round.data} />;
}
