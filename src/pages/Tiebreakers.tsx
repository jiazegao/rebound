import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Choices, QuestionMeta, RichText, AnswerBox } from '../components/QuestionView';
import { Countdown, LoadError, Loading, Notice, PageHeader, SubjectTag, useTicker } from '../components/ui';
import { pickMixed } from '../core/drill';
import { judgeAnswer, type JudgeResult } from '../core/judge/judge';
import { SHOOTOUT_POINTS, SHOOTOUT_TOSSUPS, shootoutOutcome, shootoutScore, type ShootoutMark } from '../core/rules/shootout';
import type { Question, Round } from '../core/schema';
import { loadCatalog, loadQuestions, newestSet, setGroups, setLabel, useIndex, useSet, useTeamLevel } from '../lib/library';
import { buildReading, readingDurationMs, revealedCount, splitRevealed } from '../lib/reading';
import { href } from '../lib/router';
import { beep, unlockAudio } from '../lib/sound';
import { addAttempt, markSeen, useData } from '../lib/store';

const BUZZ_WINDOW_S = 5;
const ANSWER_START_S = 2;
const ANSWER_TOTAL_S = 5;

const MARK_TEXT: Record<ShootoutMark, string> = { correct: '+1', incorrect: '−1', none: '0' };

/* ---------------- the solo shootout drill ---------------- */

type DrillStep =
  | { kind: 'reading'; startedAt: number }
  | { kind: 'window'; openedAt: number }
  | { kind: 'answering'; buzzedAt: number; typingAt: number | null }
  | { kind: 'result'; mark: ShootoutMark; response: string; result: JudgeResult | null; buzzed: boolean };

function playableTossup(q: Question | undefined): q is Question {
  return !!q && q.answer.trim() !== '' && !q.flags?.some((f) => f === 'answer-missing' || f === 'choices-missing');
}

/** Five toss-ups, read in full, 5 seconds to buzz; +1 right, −1 wrong, 0 for no buzz (Rule 9-1 iii). */
function ShootoutDrill({ onExit }: { onExit: () => void }) {
  const data = useData();
  const player = data.players.find((p) => p.id === data.settings.soloPlayerId) ?? null;
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<DrillStep>({ kind: 'reading', startedAt: Date.now() });
  const [response, setResponse] = useState('');
  const [marks, setMarks] = useState<Array<{ q: Question; mark: ShootoutMark; response: string }>>([]);
  const input = useRef<HTMLInputElement>(null);
  const wpm = data.settings.readingWpm;

  useEffect(() => {
    let live = true;
    (async () => {
      const catalog = await loadCatalog();
      const seen = player ? (data.seen[player.id] ?? {}) : {};
      const picks = pickMixed(catalog.questions, { count: SHOOTOUT_TOSSUPS + 4, seen });
      const found = await loadQuestions(picks.map((p) => p.questionId));
      const qs = picks.map((p) => found.get(p.questionId)?.pair.tossup).filter(playableTossup).slice(0, SHOOTOUT_TOSSUPS);
      if (live) {
        if (qs.length === 0) setError(new Error('No toss-ups could be loaded. Check the connection and try again.'));
        else {
          setQuestions(qs);
          setStep({ kind: 'reading', startedAt: Date.now() });
        }
      }
    })().catch((e: unknown) => live && setError(e instanceof Error ? e : new Error(String(e))));
    return () => {
      live = false;
    };
    // Load once per drill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = questions?.[index];
  const reading = useMemo(() => (q ? buildReading(q) : null), [q]);
  const now = useTicker(!!q && step.kind !== 'result', 50);

  const finish = useCallback(
    (text: string, buzzed: boolean) => {
      if (!q) return;
      setStep((s) => {
        if (s.kind === 'result') return s;
        const typed = text.trim();
        const result = typed ? judgeAnswer(q, typed) : null;
        // Your call on a near miss counts as right here; the checker's reason says why.
        const mark: ShootoutMark = !buzzed ? 'none' : result && result.verdict !== 'incorrect' ? 'correct' : 'incorrect';
        return { kind: 'result', mark, response: typed, result, buzzed };
      });
    },
    [q],
  );

  // Reading, then the 5-second window; after a buzz, start within 2 s and finish within 5 s.
  useEffect(() => {
    if (!reading) return;
    if (step.kind === 'reading' && now - step.startedAt >= readingDurationMs(reading, wpm)) setStep({ kind: 'window', openedAt: Date.now() });
    if (step.kind === 'window' && now - step.openedAt >= BUZZ_WINDOW_S * 1000) {
      if (data.settings.sound) beep('time');
      finish('', false);
    }
    if (step.kind === 'answering') {
      const since = (now - step.buzzedAt) / 1000;
      if (step.typingAt === null && since >= ANSWER_START_S) finish('', true);
      else if (since >= ANSWER_TOTAL_S) finish(response, true);
    }
  }, [now, step, reading, wpm, finish, response, data.settings.sound]);

  const buzz = useCallback(() => {
    unlockAudio();
    setStep((s) => (s.kind === 'window' ? { kind: 'answering', buzzedAt: Date.now(), typingAt: null } : s));
  }, []);

  const next = useCallback(() => {
    if (step.kind !== 'result' || !q) return;
    if (player) {
      if (step.buzzed) {
        addAttempt({ playerId: player.id, questionId: q.id, subject: q.subject, kind: 'tossup', correct: step.mark === 'correct', interrupt: false, latencyMs: null, overridden: false, t: Date.now() });
      }
      markSeen([player.id], [q.id]);
    }
    setMarks((m) => [...m, { q, mark: step.mark, response: step.response }]);
    setResponse('');
    setIndex((i) => i + 1);
    setStep({ kind: 'reading', startedAt: Date.now() });
  }, [step, q, player]);

  useEffect(() => {
    if (step.kind === 'answering') input.current?.focus();
  }, [step.kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === 'INPUT') return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (step.kind === 'window') {
          e.preventDefault();
          buzz();
        } else if (step.kind === 'result') {
          e.preventDefault();
          next();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step.kind, buzz, next]);

  if (error) return <LoadError error={error} />;
  if (!questions) return <Loading what="Choosing five toss-ups" />;

  if (!q) {
    const total = shootoutScore(marks.map((m) => m.mark));
    const wrong = marks.filter((m) => m.mark === 'incorrect').length;
    return (
      <div className="stack">
        <h2 style={{ margin: 0 }}>Shootout score: {total > 0 ? `+${total}` : total}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Your answer</th>
                <th>Answer</th>
                <th className="num">Points</th>
              </tr>
            </thead>
            <tbody>
              {marks.map((m, i) => (
                <tr key={i}>
                  <td>
                    <SubjectTag subject={m.q.subject} />
                  </td>
                  <td>{m.mark === 'none' ? <span className="muted">no buzz</span> : m.response || <span className="muted">none</span>}</td>
                  <td>{m.q.answerLetter ? `${m.q.answerLetter}) ${m.q.answer}` : m.q.answer}</td>
                  <td className="num">{MARK_TEXT[m.mark]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">
          {wrong > 0
            ? `Each wrong answer cost a point that staying quiet would have kept. In a shootout, buzz only when you are more likely right than wrong.`
            : 'No wrong answers: in a shootout, a point kept is as good as a point won.'}
        </p>
        <div className="row">
          <button className="btn btn-primary" onClick={onExit}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const revealed = step.kind === 'reading' && reading ? splitRevealed(reading, revealedCount(reading, now - step.startedAt, wpm)) : null;
  const lines = revealed ? revealed.done.split('\n') : [];
  return (
    <div className="stack">
      <div className="row spread small muted">
        <span>
          Toss-up {index + 1} of {questions.length} · score {shootoutScore(marks.map((m) => m.mark))}
        </span>
        <button className="btn btn-small btn-ghost" onClick={onExit}>
          Stop
        </button>
      </div>
      <article className="question">
        <QuestionMeta q={q} />
        {revealed ? (
          <p className="stem" aria-live="off">
            {lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                <RichText text={line} />
                {i === lines.length - 1 && revealed.current && <span className="reading-current">{revealed.current}</span>}
              </Fragment>
            ))}
          </p>
        ) : (
          <>
            <p className="stem">
              <RichText text={q.stem} />
            </p>
            <Choices q={q} />
          </>
        )}
        {step.kind === 'result' && <AnswerBox q={q} />}
      </article>
      {step.kind === 'reading' && (
        <div className="row">
          <button className="btn" onClick={() => setStep({ kind: 'window', openedAt: Date.now() })}>
            Done reading
          </button>
          <span className="small muted">The whole question is read; you may buzz when it ends (no interrupts in a shootout).</span>
        </div>
      )}
      {step.kind === 'window' && (
        <>
          <Countdown openedAt={step.openedAt} seconds={BUZZ_WINDOW_S} now={now} label="Time to buzz" />
          <div className="row">
            <button className="btn btn-primary btn-big" onClick={buzz}>
              Buzz <span className="kbd">Space</span>
            </button>
            <button className="btn" onClick={() => finish('', false)}>
              Let it go (0)
            </button>
          </div>
        </>
      )}
      {step.kind === 'answering' && (
        <form
          className="row"
          style={{ flexWrap: 'nowrap' }}
          onSubmit={(e) => {
            e.preventDefault();
            finish(response, true);
          }}
        >
          <input
            ref={input}
            className="big-input"
            type="text"
            aria-label="Your answer"
            autoComplete="off"
            value={response}
            onChange={(e) => {
              setResponse(e.target.value);
              setStep((s) => (s.kind === 'answering' && s.typingAt === null && e.target.value.trim() ? { ...s, typingAt: Date.now() } : s));
            }}
          />
          <button className="btn btn-primary" type="submit">
            Answer
          </button>
        </form>
      )}
      {step.kind === 'result' && (
        <>
          <div className={`verdict verdict-${step.mark === 'correct' ? 'correct' : step.mark === 'incorrect' ? 'incorrect' : 'review'}`} role="status">
            <strong>
              {step.mark === 'correct' ? 'Right: +1' : step.mark === 'incorrect' ? (step.response ? 'Wrong: −1' : 'Stall: −1') : 'No buzz: 0'}
            </strong>
            {step.result && <div className="small">{step.result.reason}</div>}
          </div>
          <div>
            <button className="btn btn-primary btn-big" onClick={next}>
              {index + 1 < questions.length ? 'Next' : 'See the score'} <span className="kbd">Space</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- the console shootout (three or more groups) ---------------- */

interface Series {
  groups: string[];
  places: number;
  /** Index of the first of this series' five toss-ups in the round. */
  offset: number;
  /** marks[group][question] */
  marks: ShootoutMark[][];
}

export function ShootoutConsole() {
  const data = useData();
  const index = useIndex();
  const level = useTeamLevel();
  const [setId, setSetId] = useState<string | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const set = useSet(setId);
  const [groupText, setGroupText] = useState(() => ['Group A', 'Group B', 'Group C'].join('\n'));
  const [places, setPlaces] = useState(1);
  const [series, setSeries] = useState<Series | null>(null);
  const [cursor, setCursor] = useState<{ group: number; q: number; readAt: number | null }>({ group: 0, q: 0, readAt: null });
  const now = useTicker(cursor.readAt !== null, 100);

  useEffect(() => {
    if (!setId && index.data?.sets.length) setSetId(newestSet(index.data, level)?.id ?? null);
  }, [index.data, setId, level]);
  useEffect(() => {
    if (set.data && (!roundId || !set.data.rounds.some((r) => r.id === roundId))) setRoundId(set.data.rounds[set.data.rounds.length - 1]?.id ?? null);
  }, [set.data, roundId]);

  const round: Round | undefined = set.data?.rounds.find((r) => r.id === roundId);
  const tossups = (round?.pairs ?? []).map((p) => p.tossup).filter(playableTossup);

  const groups = groupText
    .split('\n')
    .map((g) => g.trim())
    .filter(Boolean);

  const begin = (s: Series) => {
    unlockAudio();
    setSeries(s);
    setCursor({ group: 0, q: 0, readAt: null });
  };

  if (!series) {
    return (
      <div className="container">
        <p className="small">
          <a href={href('/tiebreakers')}>Tiebreakers</a> /
        </p>
        <PageHeader title="Shootout (three or more groups)">
          <p>
            Rule 9-1: when three or more teams are tied for advancing places, each hears the same five toss-ups in a separate room, read in full,
            with 5 seconds to buzz. +1 right, −1 wrong, 0 for no answer, a blurt or talking. Run it here with groups taking turns while the others
            wait outside.
          </p>
        </PageHeader>
        <div className="grid-2">
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Questions</h2>
            {index.loading && <Loading />}
            {index.data && (
              <div className="field">
                <label htmlFor="so-set">Sample set</label>
                <select id="so-set" value={setId ?? ''} onChange={(e) => { setSetId(e.target.value); setRoundId(null); }}>
{setGroups(index.data, level).map((g) => (
                  <optgroup key={g.level} label={g.label}>
                    {g.sets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {setLabel(s)}
                      </option>
                    ))}
                  </optgroup>
                ))}
                </select>
              </div>
            )}
            {set.data && (
              <div className="field">
                <label htmlFor="so-round">Round</label>
                <select id="so-round" value={roundId ?? ''} onChange={(e) => setRoundId(e.target.value)}>
                  {set.data.rounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <span className="hint">Toss-ups only. Each series uses the next five; a round has enough for several.</span>
              </div>
            )}
          </section>
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Groups</h2>
            <div className="field">
              <label htmlFor="so-groups">One group per line</label>
              <textarea id="so-groups" rows={5} value={groupText} onChange={(e) => setGroupText(e.target.value)} />
              {data.players.length > 2 && (
                <button className="btn btn-small btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setGroupText(data.players.filter((p) => p.active).map((p) => p.name).join('\n'))}>
                  One group per player
                </button>
              )}
            </div>
            <div className="field">
              <label htmlFor="so-places">Places that advance</label>
              <input id="so-places" type="number" min={1} max={Math.max(1, groups.length - 1)} value={places} onChange={(e) => setPlaces(Math.max(1, Number(e.target.value) || 1))} style={{ width: 100 }} />
            </div>
          </section>
        </div>
        <div className="row" style={{ marginTop: '1rem' }}>
          <button
            className="btn btn-primary btn-big"
            disabled={groups.length < 3 || tossups.length < SHOOTOUT_TOSSUPS || places >= groups.length}
            onClick={() => begin({ groups, places, offset: 0, marks: groups.map(() => []) })}
          >
            Start the shootout
          </button>
          {groups.length < 3 && <span className="muted">A shootout needs three or more groups (two tied teams play a tiebreaker game instead).</span>}
        </div>
      </div>
    );
  }

  const qs = tossups.slice(series.offset, series.offset + SHOOTOUT_TOSSUPS);
  const finished = cursor.group >= series.groups.length;
  const mark = (m: ShootoutMark) => {
    const marks = series.marks.map((row, g) => (g === cursor.group ? [...row, m] : row));
    setSeries({ ...series, marks });
    if (cursor.q + 1 < SHOOTOUT_TOSSUPS) setCursor({ group: cursor.group, q: cursor.q + 1, readAt: null });
    else setCursor({ group: cursor.group + 1, q: 0, readAt: null });
  };

  if (finished) {
    const scores = series.groups.map((g, i) => ({ id: g, score: shootoutScore(series.marks[i]!) }));
    const outcome = shootoutOutcome(scores, series.places);
    const nextOffset = series.offset + SHOOTOUT_TOSSUPS;
    return (
      <div className="container">
        <PageHeader title="Shootout results" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                {qs.map((_, i) => (
                  <th key={i} className="num">
                    {i + 1}
                  </th>
                ))}
                <th className="num">Score</th>
              </tr>
            </thead>
            <tbody>
              {[...scores].sort((a, b) => b.score - a.score).map((s) => {
                const i = series.groups.indexOf(s.id);
                return (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    {series.marks[i]!.map((m, k) => (
                      <td key={k} className="num">
                        {MARK_TEXT[m]}
                      </td>
                    ))}
                    <td className="num">
                      <strong>{s.score}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="stack" style={{ marginTop: '1rem' }}>
          {outcome.advance.length > 0 && <p>Advancing: {outcome.advance.join(', ')}.</p>}
          {outcome.next === 'tiebreaker' && (
            <Notice>
              {outcome.stillTied.join(' and ')} are still tied for {outcome.placesLeft === 1 ? 'the last place' : `${outcome.placesLeft} places`}: they play a 5 toss-up
              tiebreaker game (Rule 9-1 ii).{' '}
              <a href={href(`/reader?format=tiebreak&set=${encodeURIComponent(setId ?? '')}&round=${encodeURIComponent(roundId ?? '')}`)}>Set it up in the Reader console</a>
            </Notice>
          )}
          {outcome.next === 'shootout' && (
            <Notice>
              {outcome.stillTied.join(', ')} are still tied for {outcome.placesLeft} place{outcome.placesLeft === 1 ? '' : 's'}: another shootout.{' '}
              {tossups.length >= nextOffset + SHOOTOUT_TOSSUPS ? (
                <button className="btn btn-small btn-primary" onClick={() => begin({ groups: outcome.stillTied, places: outcome.placesLeft, offset: nextOffset, marks: outcome.stillTied.map(() => []) })}>
                  Next five toss-ups
                </button>
              ) : (
                'This round has no five more toss-ups; choose another round.'
              )}
            </Notice>
          )}
          <div className="row">
            <button className="btn" onClick={() => setSeries(null)}>
              New shootout
            </button>
          </div>
        </div>
      </div>
    );
  }

  const q = qs[cursor.q]!;
  const elapsed = cursor.readAt === null ? 0 : (now - cursor.readAt) / 1000;
  return (
    <div className="container reader">
      <div className="row spread small muted" style={{ marginBottom: '0.5rem' }}>
        <span>
          Shootout · <strong>{series.groups[cursor.group]}</strong> · toss-up {cursor.q + 1} of {SHOOTOUT_TOSSUPS} · score{' '}
          {shootoutScore(series.marks[cursor.group]!)}
        </span>
        <button className="btn btn-small btn-ghost" onClick={() => { if (confirm('Stop this shootout?')) setSeries(null); }}>
          Stop
        </button>
      </div>
      {cursor.q === 0 && cursor.readAt === null && (
        <Notice>
          {series.groups[cursor.group]}: the other groups wait outside. Read each toss-up in full; there are no interrupt penalties.
        </Notice>
      )}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <article className="question">
          <QuestionMeta q={q} />
          <p className="stem">
            <RichText text={q.stem} />
          </p>
          <Choices q={q} />
          <AnswerBox q={q} />
        </article>
        <section className="stack">
          {cursor.readAt === null ? (
            <button className="btn btn-primary btn-big" onClick={() => setCursor({ ...cursor, readAt: Date.now() })}>
              Done reading
            </button>
          ) : (
            <Countdown openedAt={cursor.readAt} seconds={BUZZ_WINDOW_S} now={now} label={elapsed >= BUZZ_WINDOW_S ? 'Time' : 'Time to buzz'} />
          )}
          <div className="judge-row">
            <button className="btn btn-good btn-big" onClick={() => mark('correct')}>
              Right (+{SHOOTOUT_POINTS.correct})
            </button>
            <button className="btn btn-bad btn-big" onClick={() => mark('incorrect')}>
              Wrong ({SHOOTOUT_POINTS.incorrect})
            </button>
            <button className="btn" onClick={() => mark('none')}>
              No answer, blurt or talking (0)
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------- the page ---------------- */

export function TiebreakersPage() {
  const [drill, setDrill] = useState(false);
  const level = useTeamLevel();
  return (
    <div className="container narrow">
      <p className="small">
        <a href={href('/try')}>Practice</a> /
      </p>
      <PageHeader title="Tiebreakers">
        <p>Ties are decided by short, toss-up-only formats where one wrong buzz can end the day. Practice both kinds.</p>
      </PageHeader>
      {drill ? (
        <section className="card">
          <ShootoutDrill onExit={() => setDrill(false)} />
        </section>
      ) : (
        <div className="stack">
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Tiebreaker game: two teams (Rule 6-4)</h2>
            <p style={{ margin: 0 }}>
              An elimination game tied at the end goes to 5 toss-ups with no bonuses and no game clock; usual toss-up rules, interrupts included.
              Still tied after 5: another 5, until the tie is broken. At regionals, two teams tied for an advancing place play the same way.
            </p>
            <div>
              <a className="btn btn-primary" href={href('/reader?format=tiebreak')}>
                Play one in the Reader console
              </a>
            </div>
          </section>
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Shootout: three or more teams (Rule 9-1)</h2>
            <p style={{ margin: 0 }}>
              Each team, alone, hears the same 5 toss-ups read in full and has 5 seconds to buzz. +1 for a right answer, −1 for a wrong one, 0 for
              none. Because a wrong answer costs as much as a right one gains, buzz only when you are more likely right than wrong.
              {level === 'MS' && ' Middle school teams meet it at the National Finals too: ties for the places each round robin division sends on are broken the same way (Rule 10-2).'}
            </p>
            <div className="row">
              <button className="btn btn-primary" onClick={() => setDrill(true)}>
                Shootout drill on your own
              </button>
              <a className="btn" href={href('/shootout')}>
                Run a shootout for groups
              </a>
            </div>
          </section>
          <p className="small muted">
            High school ties for the Finals' double elimination places are decided by the Division Team Challenge (Rule 10-3), whose rules DOE has
            not published.
          </p>
        </div>
      )}
    </div>
  );
}
