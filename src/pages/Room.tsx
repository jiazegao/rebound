import { Fragment, useEffect, useState } from 'react';
import { FigureView } from '../components/Figure';
import { RichText } from '../components/QuestionView';
import { loadQuestions, useAsync } from '../lib/library';
import { Notice, PageHeader, useTicker } from '../components/ui';
import { buildReading, revealedCount, splitRevealed } from '../lib/reading';
import { RoomClient, useRoom, type RoomView, type Side } from '../lib/room';
import { href } from '../lib/router';
import { currentSession, useSync } from '../lib/sync';

/** The question as revealed so far on this screen (same pace on every device). */
function RevealedText({ view, serverNow }: { view: RoomView; serverNow: number }) {
  if (!view.text) return null;
  if (!view.reading) {
    return (
      <p className="stem">
        {view.text.split('\n').map((line, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            <RichText text={line} />
          </Fragment>
        ))}
      </p>
    );
  }
  const reading = buildReading({ stem: view.text });
  const { done, current } = splitRevealed(reading, revealedCount(reading, serverNow - view.reading.startedAt, view.reading.wpm));
  const lines = done.split('\n');
  return (
    <p className="stem" aria-live="off">
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          <RichText text={line} />
          {i === lines.length - 1 && current && <span className="reading-current">{current}</span>}
        </Fragment>
      ))}
    </p>
  );
}

/** A visual bonus's figure, looked up on this device (generated, photo set, or the team's synced data). */
function RoomFigure({ questionId }: { questionId: string }) {
  const found = useAsync(questionId, async () => (await loadQuestions([questionId])).get(questionId)?.question ?? null);
  if (found.loading) return <p className="small muted">Loading the figure…</p>;
  if (!found.data) return <p className="small muted">This figure is not on this device yet. Sync on the Team page, then come back.</p>;
  return <FigureView q={found.data} large />;
}

function TeamChannel({ client, side, lines, canAnswer }: { client: RoomClient; side: Side; lines: { from: { name: string }; text: string; at: number }[]; canAnswer: boolean }) {
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  return (
    <section className="card stack" aria-labelledby="channel-heading">
      <h2 id="channel-heading" style={{ margin: 0 }}>
        Team channel <span className="small muted">(only side {side} sees this)</span>
      </h2>
      <div className="room-chat" aria-live="polite">
        {lines.length === 0 ? (
          <p className="small muted">Confer here during bonuses, as you would at the table.</p>
        ) : (
          lines.map((l, i) => (
            <p key={i} className="small" style={{ margin: '0.15rem 0' }}>
              <strong>{l.from.name}:</strong> {l.text}
            </p>
          ))
        )}
      </div>
      <form
        className="row"
        style={{ flexWrap: 'nowrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) client.chat(text.trim());
          setText('');
        }}
      >
        <input aria-label="Message to your team" type="text" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
        <button className="btn" type="submit">
          Send
        </button>
      </form>
      {canAnswer && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (answer.trim()) client.answer(answer.trim());
            setAnswer('');
          }}
        >
          <label htmlFor="captain-answer" className="label">
            Captain's answer to the reader
          </label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="captain-answer" className="big-input" type="text" value={answer} maxLength={200} onChange={(e) => setAnswer(e.target.value)} />
            <button className="btn btn-primary" type="submit">
              Answer
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function RoomPage({ roomId }: { roomId: string }) {
  useSync();
  const session = currentSession();
  const url = session ? RoomClient.url(session.serverUrl, session.teamId, roomId, session.token) : null;
  const { client, snapshot } = useRoom(url);
  const view = snapshot?.view ?? null;
  const ticking = !!view && (!!view.reading || !!view.window);
  const now = useTicker(ticking, 50);
  const serverNow = client ? client.serverNow() : now;
  const me = snapshot?.members.find((m) => m.memberId === snapshot.you?.memberId);
  const side = me?.side ?? null;
  const buzz = snapshot?.buzz;
  const canBuzz = !!buzz && buzz.open && !!side && buzz.sides[side] && !buzz.winner;

  // Space buzzes (unless typing in the team channel).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === ' ' && canBuzz) {
        e.preventDefault();
        client?.buzz();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canBuzz, client]);

  if (!session) {
    return (
      <div className="container narrow">
        <PageHeader title="Remote room" />
        <Notice>
          To join a room, this device needs to be signed in to your team's shared space. Open the join link your captain posted (or go to{' '}
          <a href={href('/team')}>Team</a> → Share with your team), then open this room link again.
        </Notice>
      </div>
    );
  }

  const winnerName = buzz?.winner ? snapshot?.members.find((m) => m.memberId === buzz.winner!.memberId)?.name ?? 'Someone' : null;
  const windowLeft = view?.window ? Math.max(0, view.window.seconds - (serverNow - view.window.openedAt) / 1000) : null;
  const sideLines = side ? (snapshot?.chat ?? []).filter((c) => c.side === side) : [];
  const isCaptain = !!me?.captain;

  return (
    <div className="container narrow">
      <div className="row spread" style={{ marginBottom: '0.5rem' }}>
        <span className="small muted">
          {snapshot?.roomName || 'Remote room'} · {snapshot?.connected ? 'connected' : 'connecting…'}
        </span>
        {view && (
          <span className="row small" style={{ gap: '1rem' }}>
            <strong>
              {view.teams[0]} {view.scores[0]}
            </strong>
            <strong>
              {view.teams[1]} {view.scores[1]}
            </strong>
          </span>
        )}
      </div>
      {snapshot?.error && <Notice kind="warn">{snapshot.error}</Notice>}

      {!side && (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>Which side are you on?</h2>
          <p className="small muted">The reader may also place you.</p>
          <div className="row">
            <button className="btn btn-big" onClick={() => client?.chooseSide('A')}>
              {view?.teams[0] ?? 'Team A'}
            </button>
            <button className="btn btn-big" onClick={() => client?.chooseSide('B')}>
              {view?.teams[1] ?? 'Team B'}
            </button>
          </div>
        </section>
      )}

      <article className="question" aria-live="polite">
        {view ? (
          <>
            <div className="question-meta">
              <span className="question-kind">{view.label}</span>
              {view.subject && <span className="muted">{view.subject}</span>}
            </div>
            {view.figure && <RoomFigure questionId={view.figure.questionId} />}
            <RevealedText view={view} serverNow={serverNow} />
            {view.status && <p className="status-line">{view.status}</p>}
            {view.answer && (
              <div className="answer-box">
                <span className="muted small">ANSWER: </span>
                <strong>{view.answer}</strong>
              </div>
            )}
          </>
        ) : (
          <p className="muted">Waiting for the reader to start.</p>
        )}
      </article>

      <div className="stack" style={{ marginTop: '1rem' }}>
        {windowLeft !== null && <p className="small">{windowLeft > 0 ? `${windowLeft.toFixed(1)} s left` : 'Time'}</p>}
        {winnerName && !view?.status?.includes('buzzed') && <p className="status-line">{winnerName} buzzed</p>}
        <button className="btn btn-primary btn-big room-buzz" onClick={() => client?.buzz()} disabled={!canBuzz} aria-disabled={!canBuzz}>
          Buzz <span className="kbd">Space</span>
        </button>
        {side && client && <TeamChannel client={client} side={side} lines={sideLines} canAnswer={isCaptain && view?.bonusTeam === (side === 'A' ? 0 : 1)} />}
      </div>
    </div>
  );
}
