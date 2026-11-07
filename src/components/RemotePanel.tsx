import { useEffect, useMemo, useRef, useState } from 'react';
import type { EventInput, MatchState } from '../core/rules/engine';
import { currentWindow } from '../core/rules/engine';
import { SUBJECT_LABELS, type Round } from '../core/schema';
import { buildReading, readingDurationMs } from '../lib/reading';
import { RoomClient, useRoom, type RoomView } from '../lib/room';
import { href } from '../lib/router';
import { setGameRoom, useData, type GameRecord } from '../lib/store';
import { createRoom, currentSession, useSync } from '../lib/sync';

/**
 * The reader's side of a remote room: open a room for this game, see who is in it, and keep their
 * screens in step. The rules engine stays here; the room only relays the view, opens and closes the
 * buzzers for the sides that may buzz, and reports who buzzed first.
 */
export function RemotePanel({
  game,
  state,
  round,
  dispatch,
  names,
}: {
  game: GameRecord;
  state: MatchState;
  round: Round;
  dispatch: (input: EventInput, at?: number) => void;
  names: Map<string, string>;
}) {
  useSync();
  const data = useData();
  const session = currentSession();
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = session && game.roomId ? RoomClient.url(session.serverUrl, session.teamId, game.roomId, session.token) : null;
  const { client, snapshot } = useRoom(url);
  const wpm = data.settings.readingWpm;

  const pair = state.pairIndex >= 0 ? round.pairs[state.pairIndex] : undefined;
  const onBonus = state.phase === 'bonus_reading' || state.phase === 'bonus_open' || (state.phase === 'question_over' && state.bonus !== null);
  const q = onBonus ? pair?.bonus : pair?.tossup;

  // Place members on the side of the game team their player is on; a team's captain gets the answer box.
  useEffect(() => {
    if (!client || !snapshot) return;
    for (const m of snapshot.members) {
      if (m.memberId === snapshot.hostId || !m.playerId) continue;
      const side = game.teams[0].playerIds.includes(m.playerId) ? 'A' : game.teams[1].playerIds.includes(m.playerId) ? 'B' : null;
      if (!side) continue;
      const teamIds = game.teams[side === 'A' ? 0 : 1].playerIds;
      const captainId = teamIds.find((id) => data.players.find((p) => p.id === id)?.role === 'captain') ?? teamIds[0];
      const captain = m.playerId === captainId;
      if (m.side !== side || m.captain !== captain) client.assign(m.memberId, side, captain);
    }
  }, [client, snapshot, game.teams, data.players]);

  // The first buzz the server picks is the buzz in the game, at the moment it was pressed.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  useEffect(() => {
    if (!client) return;
    client.onWinner = (w) => {
      if (!w.playerId) {
        setError(`A member who is not linked to a roster player buzzed. Link members on the Team page.`);
        return;
      }
      const offset = client.serverNow() - Date.now();
      dispatchRef.current({ type: 'buzz', team: w.side === 'A' ? 0 : 1, playerId: w.playerId }, w.pressedAt - offset);
    };
    return () => {
      client.onWinner = null;
    };
  }, [client]);

  // Buzzers are open while the toss-up is read and during its window, for the sides that may still answer.
  const tossup = state.tossup;
  const canBuzz = (state.phase === 'tossup_reading' || state.phase === 'tossup_open') && !!tossup && !tossup.buzz;
  const eligibleA = !!tossup?.eligible[0];
  const eligibleB = !!tossup?.eligible[1];
  useEffect(() => {
    if (!client || !snapshot?.connected) return;
    if (canBuzz) client.open({ A: eligibleA, B: eligibleB });
    else client.closeBuzzers();
  }, [client, snapshot?.connected, canBuzz, eligibleA, eligibleB, state.pairIndex, tossup?.reread]);

  // Text reveal: the reading starts when the phase does, and finishes by itself.
  const readingKey = `${state.pairIndex}:${state.phase}:${tossup?.reread ? 1 : 0}`;
  const reading = useRef<{ key: string; startedAt: number } | null>(null);
  const isReading = state.phase === 'tossup_reading' || state.phase === 'bonus_reading';
  if (client && mode === 'text' && isReading && reading.current?.key !== readingKey) reading.current = { key: readingKey, startedAt: client.serverNow() };
  useEffect(() => {
    if (!client || mode !== 'text' || !isReading || !q || !reading.current) return;
    const duration = readingDurationMs(buildReading(q), wpm);
    const endsIn = reading.current.startedAt + duration - client.serverNow();
    const t = setTimeout(() => dispatchRef.current({ type: state.phase === 'tossup_reading' ? 'tossup_read' : 'bonus_read' }), Math.max(0, endsIn));
    return () => clearTimeout(t);
  }, [client, mode, isReading, readingKey, q, wpm, state.phase]);

  // What the players see.
  const win = currentWindow(state);
  const view: RoomView | null = useMemo(() => {
    if (!client) return null;
    const offset = client.serverNow() - Date.now();
    const readComplete = onBonus ? !!state.bonus?.readComplete : !!tossup?.readComplete;
    const lastLog = state.log[state.log.length - 1];
    let status: string | undefined;
    if (state.phase === 'tossup_answering' && tossup?.buzz) status = `${names.get(tossup.buzz.playerId) ?? 'A player'} buzzed${tossup.buzz.interrupt ? ' (interrupt)' : ''}`;
    else if (state.phase === 'question_over' && lastLog?.kind === 'tossup_dead') status = 'Nobody got it.';
    else if (state.phase === 'bonus_open' || state.phase === 'bonus_reading') status = `Bonus for ${game.teams[state.bonus?.team ?? 0].name}: confer in your team channel, the captain answers.`;
    else if (state.phase === 'halftime') status = 'Halftime.';
    else if (state.phase === 'game_over') status = 'Game over.';
    return {
      phase: state.phase,
      label: !pair ? (state.phase === 'game_over' ? 'Game over' : 'Get ready') : onBonus ? `Bonus ${state.pairIndex + 1}` : `Toss-up ${state.pairIndex + 1} of ${game.pairs.length}`,
      subject: q ? SUBJECT_LABELS[q.subject] : undefined,
      text: q && (mode === 'text' ? isReading || readComplete || state.phase === 'question_over' : readComplete || state.phase === 'question_over') ? buildReading(q).text : undefined,
      reading: mode === 'text' && isReading && reading.current ? { startedAt: reading.current.startedAt, wpm } : undefined,
      window: win ? { openedAt: win.openedAt + offset, seconds: win.seconds } : undefined,
      teams: [game.teams[0].name, game.teams[1].name],
      scores: state.scores,
      bonusTeam: state.bonus?.team,
      status,
      answer: state.phase === 'question_over' && q ? (q.answerLetter ? `${q.answerLetter}) ${q.answer}` : q.answer) : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, state, mode, readingKey, wpm, round, names]);
  const viewJson = JSON.stringify(view);
  useEffect(() => {
    if (client && view && snapshot?.connected) client.publish(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, viewJson, snapshot?.connected]);

  if (!session) {
    return (
      <p className="small muted no-print">
        Remote players? Share the team first (<a href={href('/team')}>Team</a> → Share with your team), then open a room here.
      </p>
    );
  }

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const roomId = await createRoom(`${game.teams[0].name} vs ${game.teams[1].name}`);
      setGameRoom(game.id, roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!game.roomId) {
    return (
      <div className="row small no-print" style={{ marginBottom: '0.75rem' }}>
        <button className="btn btn-small" onClick={() => void open()} disabled={busy}>
          {busy ? 'Opening…' : 'Open a remote room'}
        </button>
        <span className="muted">Players on their own devices buzz from the room link, with server-timed buzzing and a team channel for bonuses.</span>
        {error && <span style={{ color: 'var(--bad)' }}>{error}</span>}
      </div>
    );
  }

  const link = `${location.origin}${location.pathname}#/room/${game.roomId}`;
  const players = (snapshot?.members ?? []).filter((m) => m.memberId !== snapshot?.hostId);
  const answers = snapshot?.answers ?? [];
  const lastAnswer = state.phase === 'bonus_open' || state.phase === 'bonus_reading' ? answers[answers.length - 1] : undefined;

  return (
    <section className="card small no-print stack" style={{ marginBottom: '0.75rem' }} aria-label="Remote room">
      <div className="row spread">
        <strong>Remote room {snapshot?.connected ? '· connected' : '· connecting…'}</strong>
        <div className="row" style={{ gap: '0.4rem' }}>
          <label className="checkbox">
            <input type="radio" name="room-mode" checked={mode === 'voice'} onChange={() => setMode('voice')} /> Read aloud (on a call)
          </label>
          <label className="checkbox">
            <input type="radio" name="room-mode" checked={mode === 'text'} onChange={() => setMode('text')} /> Text reveal ({wpm} wpm)
          </label>
          <button className="btn btn-small btn-ghost" onClick={() => setGameRoom(game.id, undefined)}>
            Close room
          </button>
        </div>
      </div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input aria-label="Room link" type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
        <button
          className="btn btn-small"
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <div>
        In the room:{' '}
        {players.length === 0
          ? 'nobody yet'
          : players.map((m, i) => (
              <span key={m.memberId}>
                {i > 0 && ', '}
                {m.name}
                {m.side ? ` (${m.side === 'A' ? game.teams[0].name : game.teams[1].name}${m.captain ? ', captain' : ''})` : ' (no side yet)'}
                {!m.connected && ' · away'}
              </span>
            ))}
      </div>
      {lastAnswer && (
        <div className="notice">
          <strong>{lastAnswer.from.name} answers:</strong> {lastAnswer.text}
        </div>
      )}
      {(error || snapshot?.error) && <div style={{ color: 'var(--bad)' }}>{error ?? snapshot?.error}</div>}
    </section>
  );
}
