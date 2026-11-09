import { Fragment, useEffect, useRef, useState } from 'react';
import { SoundCheck, useMatchSpeech, type MatchSpeech } from '../components/MatchSpeech';
import { RichText } from '../components/QuestionView';
import { Notice, useTicker } from '../components/ui';
import { cancelRoom } from '../lib/api';
import { refreshNow, useSession } from '../lib/cloud';
import { type RoomClient, type RoomMember, type RoomSnapshot, type Side } from '../lib/room';
import { href } from '../lib/router';
import { markSeen, useData } from '../lib/store';
import { RevealedText, RoomFigure, TeamChannel } from './Room';

const seconds = (ms: number) => `${Math.max(0, ms / 1000).toFixed(1)} s`;

function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * An online match with no reader (server/src/match.ts): the server reveals each question, runs the buzzers and
 * judges typed answers; close calls go to the opponents. This is each player's screen; the host also starts,
 * pauses and ends the match.
 */
export function MatchRoom({ client, snapshot, roomId }: { client: RoomClient; snapshot: RoomSnapshot; roomId: string }) {
  const data = useData();
  const session = useSession();
  const view = snapshot.view;
  const match = view?.match;
  const myId = snapshot.you?.memberId ?? null;
  const me = snapshot.members.find((m) => m.memberId === myId);
  const isHost = !!myId && snapshot.hostId === myId;
  const side = me?.side ?? null;
  const ticking = !!view && (!!view.reading || !!view.window || !!match?.answering || !!match?.review || match?.clock?.runningSince != null);
  useTicker(ticking, 100);
  const serverNow = client.serverNow();
  const buzz = snapshot.buzz;
  const canBuzz = match?.status === 'playing' && buzz.open && !!side && buzz.sides[side] && !buzz.winner;
  // A match read aloud: this device says each question (or, with no voice, shows it as text).
  const speech = useMatchSpeech(match?.mode === 'speech', view ?? null, client, snapshot.connected);

  // The server writes every player's answers to their account (and a team match's game to the team). This device
  // only notes what its player heard, then fetches the answers, which become review cards.
  useEffect(() => {
    const memberId = snapshot.you?.memberId;
    client.onMatchOver = (m) => {
      const mine = m.players.find((p) => p.memberId === memberId);
      if (mine) markSeen([mine.playerId], m.heard);
      void refreshNow();
    };
    return () => {
      client.onMatchOver = null;
    };
  }, [client, snapshot.you?.memberId]);

  // Refusals ("It isn't your turn to answer") show for a few seconds.
  useEffect(() => {
    if (!snapshot.error) return;
    const t = setTimeout(() => client.clearError(), 4000);
    return () => clearTimeout(t);
  }, [snapshot.error, client]);

  // Space buzzes, unless typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === ' ' && canBuzz) {
        e.preventDefault();
        client.buzz();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canBuzz, client]);

  if (!view || !match) return <p className="muted">Connecting to the match…</p>;

  const format = match.format;
  const bonusSide: Side | null = view.bonusTeam === 0 ? 'A' : view.bonusTeam === 1 ? 'B' : null;
  const bonusCaptain = snapshot.members.find((m) => m.side === bonusSide && m.captain);
  const answeringTossup = match.answering?.kind === 'tossup' && match.answering.memberId === myId;
  const answeringBonus = format === 'teams' && view.phase === 'bonus_open' && !!side && side === bonusSide && (!!me?.captain || !bonusCaptain || !bonusCaptain.connected);
  const iDecide = !!match.review && match.review.memberId !== myId && (match.review.deciders === 'others' ? !!side : side === match.review.deciders);
  const clockMs = match.clock ? (match.clock.runningSince !== null ? match.clock.remainingMs - (serverNow - match.clock.runningSince) : match.clock.remainingMs) : null;
  const sideLines = side ? snapshot.chat.filter((c) => c.side === side) : [];
  const readsText = snapshot.members.filter((m) => m.side !== null && m.readsText);

  return (
    <div className="container narrow">
      <div className="row spread" style={{ marginBottom: '0.5rem' }}>
        <span className="small muted">
          {snapshot.roomName || 'Online match'} · {format === 'teams' ? 'team vs team' : 'everyone for themselves'} · {snapshot.connected ? 'connected' : 'connecting…'}
        </span>
        {format === 'teams' ? (
          <span className="row small" style={{ gap: '1rem' }}>
            <strong>
              {view.teams[0]} {view.scores[0]}
            </strong>
            <strong>
              {view.teams[1]} {view.scores[1]}
            </strong>
            {clockMs !== null && match.status === 'playing' && <span className="muted">{clockText(clockMs)}</span>}
          </span>
        ) : (
          match.progress && match.status !== 'lobby' && <span className="small muted">Toss-up {match.progress.n} of {match.progress.of}</span>
        )}
      </div>
      {snapshot.error && <Notice kind="warn">{snapshot.error}</Notice>}

      {match.status === 'lobby' ? (
        <Lobby client={client} snapshot={snapshot} isHost={isHost} roomId={roomId} speech={match.mode === 'speech' ? speech : null} />
      ) : (
        <>
          <article className="question" aria-live="polite">
            <div className="question-meta">
              <span className="question-kind">{view.label}</span>
              {view.subject && <span className="muted">{view.subject}</span>}
              {match.paused && match.status === 'playing' && <span className="badge">Paused before the next question</span>}
            </div>
            {match.previous &&
              (match.previous.text ? (
                <div className="small muted" style={{ marginBottom: '0.5rem' }}>
                  <p style={{ margin: 0 }}>
                    {match.previous.label}:{' '}
                    {match.previous.text.split('\n').map((line, i) => (
                      <Fragment key={i}>
                        {i > 0 && <br />}
                        <RichText text={line} />
                      </Fragment>
                    ))}
                  </p>
                  <p style={{ margin: 0 }}>ANSWER: {match.previous.answer}</p>
                </div>
              ) : (
                <p className="small muted" style={{ marginTop: 0 }}>
                  {match.previous.label}: {match.previous.answer}
                </p>
              ))}
            {view.figure && <RoomFigure questionId={view.figure.questionId} />}
            {match.mode === 'speech' && speech.aloud ? (
              view.text && (
                <p className="listening" aria-live="off">
                  <span aria-hidden="true">🔊 </span>Listening to the question…
                </p>
              )
            ) : (
              <RevealedText view={view} serverNow={serverNow} />
            )}
            {match.mode === 'speech' && !speech.aloud && !view.answer && view.text && (
              <p className="small muted">This device can’t read this question aloud, so you see it as text.</p>
            )}
            {match.mode === 'speech' && speech.blocked && (
              <button className="btn btn-primary" onClick={speech.allow}>
                Turn on the voice
              </button>
            )}
            {view.status && <p className="status-line">{view.status}</p>}
            {view.answer && (
              <div className="answer-box">
                <span className="muted small">ANSWER: </span>
                <strong>{view.answer}</strong>
              </div>
            )}
          </article>

          <div className="stack" style={{ marginTop: '1rem' }}>
            {view.window && !match.answering && (
              <p className="small">{view.window.seconds - (serverNow - view.window.openedAt) / 1000 > 0 ? `${seconds(view.window.seconds * 1000 - (serverNow - view.window.openedAt))} left` : 'Time'}</p>
            )}
            {match.answering && match.answering.memberId !== myId && (
              <p className="status-line">
                {match.answering.name} is answering · {seconds(match.answering.deadline - serverNow)}
              </p>
            )}

            {match.review && (
              <section className="card stack" aria-live="assertive">
                <p style={{ margin: 0 }}>
                  <strong>Close call.</strong> {match.review.name} answered “{match.review.response}”; the answer is <strong>{view.answer}</strong>.{' '}
                  {iDecide ? 'Does it match?' : match.review.memberId === myId ? 'Your opponents decide whether it matches.' : 'The other side decides.'} No ruling in{' '}
                  {seconds(match.review.deadline - serverNow)} counts as accepted.
                </p>
                {iDecide && (
                  <div className="row">
                    <button className="btn btn-good" onClick={() => client.ruling(true)}>
                      Accept
                    </button>
                    <button className="btn btn-bad" onClick={() => client.ruling(false)}>
                      Reject
                    </button>
                  </div>
                )}
              </section>
            )}

            {(answeringTossup || answeringBonus) && !match.review && (
              <AnswerForm
                client={client}
                label={answeringTossup ? 'Your answer' : `${view.teams[side === 'A' ? 0 : 1]}'s answer (you answer for the team)`}
                deadline={answeringTossup ? match.answering!.deadline : null}
                serverNow={serverNow}
              />
            )}
            {format === 'teams' && view.phase === 'bonus_open' && side === bonusSide && !answeringBonus && (
              <p className="small muted">Confer in the team channel; {bonusCaptain?.name ?? 'your captain'} types the team's answer.</p>
            )}

            {match.mode === 'speech' && readsText.length > 0 && match.status === 'playing' && (
              <p className="small muted">Seeing the text instead (no voice on their device): {readsText.map((m) => m.name).join(', ')}.</p>
            )}
            {match.status === 'playing' && (
              <button
                className="btn btn-primary btn-big room-buzz"
                onClick={() => {
                  speech.prime();
                  client.buzz();
                }}
                disabled={!canBuzz}
                aria-disabled={!canBuzz}
              >
                Buzz <span className="kbd">Space</span>
              </button>
            )}
            {!side && match.status === 'playing' && <p className="small muted">You are watching this match.</p>}

            {format === 'ffa' && match.standings && <Standings standings={match.standings} myId={myId} />}

            {match.status === 'finished' && (
              <Finished
                gameId={match.gameId}
                hasGame={!!match.gameId && data.games.some((g) => g.id === match.gameId)}
                forTeam={forTeam(snapshot, session.team?.members.map((m) => m.userId) ?? [])}
                format={format}
              />
            )}

            {isHost && match.status === 'playing' && (
              <section className="card row">
                <span className="small muted">Host:</span>
                {view.phase === 'halftime' ? (
                  <button className="btn" onClick={() => client.resume()}>
                    Start the second half
                  </button>
                ) : match.paused ? (
                  <button className="btn btn-primary" onClick={() => client.resume()}>
                    Go on
                  </button>
                ) : (
                  <button className="btn" onClick={() => client.pause()}>
                    Pause after this question
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    if (confirm('End the match now? The scores so far stand.')) client.end();
                  }}
                >
                  End the match
                </button>
              </section>
            )}

            {side && (format === 'teams' || match.status !== 'finished') && (
              <TeamChannel
                client={client}
                side={side}
                lines={sideLines}
                canAnswer={false}
                title={format === 'teams' ? 'Team channel' : 'Chat'}
                hint={format === 'teams' ? 'Confer here during your bonuses, as you would at the table.' : 'Everyone in the game sees this.'}
                privateToSide={format === 'teams'}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AnswerForm({ client, label, deadline, serverNow }: { client: RoomClient; label: string; deadline: number | null; serverNow: number }) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        client.answer(text.trim());
        setText('');
      }}
    >
      <label htmlFor="match-answer" className="label">
        {label}
        {deadline !== null && ` · ${seconds(deadline - serverNow)}`}
      </label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input id="match-answer" ref={input} className="big-input" type="text" autoComplete="off" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" type="submit">
          Answer <span className="kbd">Enter</span>
        </button>
      </div>
    </form>
  );
}

function Standings({ standings, myId }: { standings: NonNullable<import('../lib/room').MatchInfo['standings']>; myId: string | null }) {
  return (
    <section className="card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Points</th>
              <th>Right</th>
              <th>Wrong interrupts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.memberId} style={s.memberId === myId ? { fontWeight: 600 } : undefined}>
                <td>{s.name}</td>
                <td>{s.score}</td>
                <td>{s.correct}</td>
                <td>{s.negs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Whether a finished team match counts for this player's team: the server keeps it in the host's team's games only
 * when every player is on that team. 'mine': it does, and this player is on that team; 'not-all': this player is on
 * the host's team, but not everyone who played is; 'other': the host's team is not this player's.
 */
function forTeam(snapshot: RoomSnapshot, teamMemberIds: string[]): 'mine' | 'not-all' | 'other' {
  const team = new Set(teamMemberIds);
  if (!snapshot.hostId || !team.has(snapshot.hostId)) return 'other';
  return snapshot.members.every((m) => m.side === null || team.has(m.memberId)) ? 'mine' : 'not-all';
}

function Finished({ gameId, hasGame, forTeam, format }: { gameId?: string; hasGame: boolean; forTeam: 'mine' | 'not-all' | 'other'; format: 'teams' | 'ffa' }) {
  return (
    <Notice kind="good">
      {format === 'teams' ? (
        <>
          The match is over. Each player's answers go to their account, and misses to their review queue.{' '}
          {gameId && hasGame ? (
            <a href={href(`/games/${gameId}`)}>See the game summary</a>
          ) : gameId && forTeam === 'mine' ? (
            'Everyone in it is on your team, so it counts in Team stats too; its summary shows up here in a moment.'
          ) : forTeam === 'not-all' ? (
            "Not everyone in it is on your team, so it doesn't count in Team stats."
          ) : null}
        </>
      ) : (
        <>The game is over. Each player's answers go to their account, and misses to their review queue.</>
      )}{' '}
      <a href={href('/online')}>Back to online play</a>
    </Notice>
  );
}

function Lobby({ client, snapshot, isHost, roomId, speech }: { client: RoomClient; snapshot: RoomSnapshot; isHost: boolean; roomId: string; speech: MatchSpeech | null }) {
  const view = snapshot.view!;
  const match = view.match!;
  const myId = snapshot.you?.memberId;
  const me = snapshot.members.find((m) => m.memberId === myId);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const bySide = (s: Side | null) => snapshot.members.filter((m) => m.side === s);
  const players = snapshot.members.filter((m) => m.side !== null);
  const ready = match.format === 'teams' ? bySide('A').length > 0 && bySide('B').length > 0 : players.length > 0;
  // Rebound's voice records the questions first (quick when they were recorded before).
  const recording = match.voice?.state === 'preparing';
  const link = `${location.origin}${location.pathname}#/room/${roomId}`;

  const join = (s: Side | null) => {
    speech?.prime();
    client.chooseSide(s);
  };
  const readsText = (m: RoomMember) => speech && m.readsText && <span className="small muted"> (sees the text: no voice on their device)</span>;

  const cancel = async () => {
    if (!confirm('Cancel this match? It closes for everyone in it, and its link stops working.')) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelRoom(roomId);
      client.endHere({ title: 'Match cancelled', message: 'You cancelled this match. Anyone who was waiting in it has been told.' });
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : String(e));
      setCancelling(false);
    }
  };

  const person = (m: RoomMember, s: Side) => (
    <li key={m.memberId}>
      {m.name}
      {m.captain && <span className="badge" style={{ marginLeft: '0.35rem' }}>captain</span>}
      {!m.connected && <span className="small muted"> (away)</span>}
      {readsText(m)}
      {isHost && match.format === 'teams' && !m.captain && (
        <button className="btn btn-small btn-ghost" style={{ marginLeft: '0.35rem' }} onClick={() => client.assign(m.memberId, s, true)}>
          Make captain
        </button>
      )}
    </li>
  );

  return (
    <section className="stack">
      <div className="card stack">
        <h2 style={{ margin: 0 }}>{view.label}</h2>
        <p className="small muted" style={{ margin: 0 }}>
          {match.format === 'teams'
            ? `Team vs team under the NSB rules, with no reader: ${speech ? 'each question is read aloud on everyone’s device at the same pace' : 'the questions appear on everyone’s screen at the same pace'}, you buzz and type your answer, and the answer checker judges it. On bonuses the captain types the team’s answer after you confer. Close calls go to the other side to accept or reject.`
            : `Everyone for themselves, toss-ups only${speech ? ', read aloud on everyone’s device' : ''}: +4 for a right answer, −4 for a wrong interrupt. One buzz each per toss-up. Close calls go to the other players to accept or reject.`}
        </p>
        <div className="row">
          <button
            className="btn btn-small"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            {copied ? 'Link copied' : 'Copy the invite link'}
          </button>
          <span className="small muted">Anyone signed in can join with the link; your teammates also find it under Play online.</span>
        </div>
      </div>

      {match.format === 'teams' ? (
        <div className="grid-2">
          {(['A', 'B'] as const).map((s, i) => (
            <div key={s} className="card stack">
              <h3 style={{ margin: 0 }}>{view.teams[i]}</h3>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>{bySide(s).map((m) => person(m, s))}</ul>
              {bySide(s).length === 0 && <p className="small muted" style={{ margin: 0 }}>Nobody yet.</p>}
              <button className="btn" disabled={me?.side === s} onClick={() => join(s)}>
                {me?.side === s ? 'You are on this side' : `Join ${view.teams[i]}`}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Players ({players.length})</h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {players.map((m) => (
              <li key={m.memberId}>
                {m.name}
                {!m.connected && <span className="small muted"> (away)</span>}
                {readsText(m)}
              </li>
            ))}
          </ul>
          {me?.side ? null : (
            <button className="btn btn-primary" onClick={() => join('A')}>
              Join the game
            </button>
          )}
        </div>
      )}

      {speech && <SoundCheck speech={speech} />}

      <div className="row">
        {me?.side && (
          <button className="btn btn-ghost" onClick={() => client.chooseSide(null)}>
            Just watch
          </button>
        )}
        <span className="small muted">Watching: {bySide(null).map((m) => m.name).join(', ') || 'nobody'}</span>
      </div>

      {isHost ? (
        <>
          <div className="row">
            <button className="btn btn-primary btn-big" disabled={!ready || recording || cancelling} onClick={() => client.start()}>
              Start the match
            </button>
            {!ready && <span className="small muted">{match.format === 'teams' ? 'Each side needs at least one player.' : 'Someone needs to join the game.'}</span>}
            {ready && recording && (
              <span className="small muted">
                Recording the questions ({match.voice!.done} of {match.voice!.total}); the match can start once they are ready.
              </span>
            )}
          </div>
          {cancelError && <Notice kind="error">{cancelError}</Notice>}
          <div className="row">
            <button className="btn btn-small btn-ghost" disabled={cancelling} onClick={() => void cancel()}>
              {cancelling ? 'Cancelling…' : 'Cancel the match'}
            </button>
          </div>
        </>
      ) : (
        <p className="small muted">The host ({snapshot.members.find((m) => m.memberId === snapshot.hostId)?.name ?? 'the person who made the match'}) starts it.</p>
      )}
    </section>
  );
}
