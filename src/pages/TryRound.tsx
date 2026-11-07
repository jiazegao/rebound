import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnswerBox, Choices, QuestionMeta, RichText } from '../components/QuestionView';
import { Countdown, LoadError, Loading, Notice, PageHeader, useTicker } from '../components/ui';
import { judgeAnswer, type JudgeResult } from '../core/judge/judge';
import { CORE_SUBJECTS, LETTERS, SUBJECT_LABELS, type CoreSubject, type Question, type QuestionPair, type QuestionSet } from '../core/schema';
import { loadSetById, setLabel, useIndex } from '../lib/library';
import { href } from '../lib/router';
import { addAttempt, markSeen, updateSettings, useData } from '../lib/store';

const TOSSUP_WINDOW_S = 5;
const BONUS_WINDOW_S = 20;
const BONUS_WARNING_S = 15;

interface Item {
  pair: QuestionPair;
  where: string;
}

type Step =
  | { kind: 'tossup_reading'; startedAt: number }
  | { kind: 'tossup_open'; openedAt: number }
  | { kind: 'tossup_answering'; interrupt: boolean; latencyMs: number | null; shownWords: number }
  | { kind: 'tossup_result'; response: string; result: JudgeResult | null; interrupt: boolean; latencyMs: number | null; decided: boolean | null }
  | { kind: 'bonus_reading'; startedAt: number }
  | { kind: 'bonus_open'; openedAt: number }
  | { kind: 'bonus_result'; response: string; result: JudgeResult | null; decided: boolean | null };

interface Tally {
  tossupsHeard: number;
  tossupsCorrect: number;
  interrupts: number;
  interruptsWrong: number;
  bonusesHeard: number;
  bonusesCorrect: number;
  points: number;
  missed: Question[];
}

const emptyTally = (): Tally => ({ tossupsHeard: 0, tossupsCorrect: 0, interrupts: 0, interruptsWrong: 0, bonusesHeard: 0, bonusesCorrect: 0, points: 0, missed: [] });

function words(q: Question): string[] {
  const out = q.stem.split(/\s+/).filter(Boolean);
  if (q.choices) {
    for (const L of LETTERS) {
      out.push('\n', `${L})`, ...q.choices[L].split(/\s+/).filter(Boolean));
    }
  }
  return out;
}

function Revealed({ list, count }: { list: string[]; count: number }) {
  const shown = list.slice(0, count);
  const parts: ReactNode[] = [];
  let line: string[] = [];
  shown.forEach((w) => {
    if (w === '\n') {
      parts.push(<RichText key={parts.length} text={line.join(' ')} />, <br key={`br${parts.length}`} />);
      line = [];
    } else line.push(w);
  });
  parts.push(<RichText key={parts.length} text={line.join(' ')} />);
  return <p className="stem" aria-live="off">{parts}</p>;
}

const UNGRADABLE = ['answer-missing', 'choices-missing'];

/** Solo practice needs a readable answer to grade, so skip pairs the importer could not fully read. */
function playable(pair: QuestionPair): boolean {
  return [pair.tossup, pair.bonus].every((q) => !q || (q.answer.trim() !== '' && !q.flags?.some((f) => UNGRADABLE.includes(f))));
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------- setup ---------------- */

interface Settings {
  mode: 'round' | 'subject';
  setId: string;
  roundId: string;
  subject: CoreSubject;
  count: number;
  wpm: number;
}

function Setup({ onStart, initial }: { onStart: (items: Item[], s: Settings) => void; initial: Partial<Settings> }) {
  const data = useData();
  const index = useIndex();
  const [s, setS] = useState<Settings>({ mode: 'round', setId: '', roundId: '', subject: 'biology', count: 10, wpm: data.settings.readingWpm, ...initial });
  const [set, setSet] = useState<QuestionSet | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const playerId = data.team ? data.settings.soloPlayerId : null;

  const sets = useMemo(() => [...(index.data?.sets ?? [])].sort((a, b) => (b.setNumber ?? 0) - (a.setNumber ?? 0)), [index.data]);

  useEffect(() => {
    if (!s.setId) return;
    let live = true;
    loadSetById(s.setId).then(
      (loaded) => live && setSet(loaded),
      (err: Error) => live && setError(err),
    );
    return () => {
      live = false;
    };
  }, [s.setId]);

  const start = async () => {
    setBusy(true);
    try {
      let chosen = set;
      let settings = s;
      if (!chosen || !s.setId) {
        // Random: one of the eight newest sets.
        const pick = sets.slice(0, 8)[Math.floor(Math.random() * Math.min(8, sets.length))];
        chosen = await loadSetById(pick.id);
        settings = { ...s, setId: pick.id };
      }
      const seen = playerId ? data.seen[playerId] ?? {} : {};
      let items: Item[];
      if (settings.mode === 'round') {
        const round = chosen.rounds.find((r) => r.id === settings.roundId) ?? chosen.rounds[Math.floor(Math.random() * chosen.rounds.length)];
        items = round.pairs.filter(playable).map((pair) => ({ pair, where: `${chosen!.title}, ${round.label}` }));
      } else {
        const pool = chosen.rounds.flatMap((r) =>
          r.pairs.filter((p) => p.tossup.subject === settings.subject && playable(p)).map((pair) => ({ pair, where: `${chosen!.title}, ${r.label}` })),
        );
        const fresh = pool.filter((i) => !seen[i.pair.tossup.id]);
        items = shuffle(fresh.length >= settings.count ? fresh : pool).slice(0, settings.count);
      }
      updateSettings({ readingWpm: settings.wpm });
      onStart(items, settings);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container narrow">
      <PageHeader title={data.team ? 'Solo practice' : 'Try a round'}>
        <p>
          Questions appear word by word, the way a moderator reads them. Press <span className="kbd">Space</span> to buzz, type your answer, and
          press <span className="kbd">Enter</span>. You get {TOSSUP_WINDOW_S} seconds after the reading to buzz, and {BONUS_WINDOW_S} seconds on
          bonuses.
        </p>
      </PageHeader>
      {index.loading && <Loading what="Loading the library" />}
      {index.error && <LoadError error={index.error} />}
      {error && <LoadError error={error} />}
      {index.data && (
        <div className="card stack">
          {data.team && (
            <div className="field">
              <label htmlFor="who">Who is practicing?</label>
              <select id="who" value={playerId ?? ''} onChange={(e) => updateSettings({ soloPlayerId: e.target.value || null })}>
                <option value="">Just trying it (not saved)</option>
                {data.players
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <span className="hint">Saving lets Rebound skip questions you've heard and count your answers in Stats.</span>
            </div>
          )}
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">Practice</legend>
            <label className="checkbox">
              <input type="radio" name="mode" checked={s.mode === 'round'} onChange={() => setS({ ...s, mode: 'round' })} /> A whole round, all subjects
            </label>
            <label className="checkbox">
              <input type="radio" name="mode" checked={s.mode === 'subject'} onChange={() => setS({ ...s, mode: 'subject' })} /> One subject
            </label>
          </fieldset>
          <div className="grid">
            <div className="field">
              <label htmlFor="set">Sample set</label>
              <select id="set" value={s.setId} onChange={(e) => setS({ ...s, setId: e.target.value, roundId: '' })}>
                <option value="">Surprise me (recent sets)</option>
                {sets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {setLabel(x)}
                  </option>
                ))}
              </select>
            </div>
            {s.mode === 'round' ? (
              <div className="field">
                <label htmlFor="round">Round</label>
                <select id="round" value={s.roundId} onChange={(e) => setS({ ...s, roundId: e.target.value })} disabled={!set || !s.setId}>
                  <option value="">Random round</option>
                  {s.setId &&
                    set?.rounds.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="subject">Subject</label>
                  <select id="subject" value={s.subject} onChange={(e) => setS({ ...s, subject: e.target.value as CoreSubject })}>
                    {CORE_SUBJECTS.map((sub) => (
                      <option key={sub} value={sub}>
                        {SUBJECT_LABELS[sub]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="count">Toss-ups</label>
                  <select id="count" value={s.count} onChange={(e) => setS({ ...s, count: Number(e.target.value) })}>
                    {[5, 10, 15, 20].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          <div className="field">
            <label htmlFor="wpm">Reading speed: {s.wpm} words per minute</label>
            <input id="wpm" type="range" min={120} max={320} step={10} value={s.wpm} onChange={(e) => setS({ ...s, wpm: Number(e.target.value) })} />
            <span className="hint">Moderators usually read at roughly 160–220 words per minute.</span>
          </div>
          <div>
            <button className="btn btn-primary btn-big" onClick={() => void start()} disabled={busy}>
              {busy ? 'Loading…' : 'Start'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- play ---------------- */

function Verdict({ result, decided, onDecide }: { result: JudgeResult | null; decided: boolean | null; onDecide: (right: boolean) => void }) {
  if (!result) {
    return <div className="verdict">No answer in time.</div>;
  }
  const final = decided ?? (result.verdict === 'correct' ? true : result.verdict === 'incorrect' ? false : null);
  const kind = final === null ? 'review' : final ? 'correct' : 'incorrect';
  return (
    <div className={`verdict verdict-${kind}`} role="status">
      <strong>{final === null ? 'Your call' : final ? 'Correct' : 'Not correct'}</strong>
      {decided !== null && decided !== (result.verdict === 'correct') ? ' (your call)' : ''}
      <div className="small">{result.reason}</div>
      {final === null ? (
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <button className="btn btn-good" onClick={() => onDecide(true)}>
            I was right <span className="kbd">Y</span>
          </button>
          <button className="btn btn-bad" onClick={() => onDecide(false)}>
            I was wrong <span className="kbd">N</span>
          </button>
        </div>
      ) : (
        <button className="btn btn-small btn-ghost" style={{ marginTop: '0.25rem' }} onClick={() => onDecide(!final)}>
          {final ? 'Actually, I was wrong' : 'Actually, I was right'}
        </button>
      )}
    </div>
  );
}

function Play({ items, wpm, onDone, onQuit }: { items: Item[]; wpm: number; onDone: (t: Tally) => void; onQuit: () => void }) {
  const data = useData();
  const playerId = data.team ? data.settings.soloPlayerId : null;
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>(() => ({ kind: 'tossup_reading', startedAt: Date.now() }));
  const [tally, setTally] = useState<Tally>(emptyTally);
  const [response, setResponse] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const item = items[index];
  const tossup = item.pair.tossup;
  const bonus = item.pair.bonus;
  const msPerWord = 60_000 / wpm;
  const tossupWords = useMemo(() => words(tossup), [tossup]);
  const bonusWords = useMemo(() => (bonus ? words(bonus) : []), [bonus]);
  const timed = step.kind === 'tossup_reading' || step.kind === 'tossup_open' || step.kind === 'bonus_reading' || step.kind === 'bonus_open';
  const now = useTicker(timed, 50);

  // Record that the player has heard the questions.
  useEffect(() => {
    if (playerId) markSeen([playerId], [tossup.id]);
  }, [playerId, tossup.id]);

  const record = useCallback(
    (q: Question, correct: boolean, interrupt: boolean, latencyMs: number | null, overridden: boolean) => {
      if (!playerId) return;
      addAttempt({ playerId, questionId: q.id, subject: q.subject, kind: q.kind, correct, interrupt, latencyMs, overridden, t: Date.now() });
    },
    [playerId],
  );

  const shownTossupWords =
    step.kind === 'tossup_reading' ? Math.min(tossupWords.length, Math.floor((now - step.startedAt) / msPerWord) + 1) : step.kind === 'tossup_answering' ? step.shownWords : tossupWords.length;
  const shownBonusWords = step.kind === 'bonus_reading' ? Math.min(bonusWords.length, Math.floor((now - step.startedAt) / msPerWord) + 1) : bonusWords.length;

  // Automatic transitions: end of reading opens the window; windows time out.
  useEffect(() => {
    if (step.kind === 'tossup_reading' && shownTossupWords >= tossupWords.length) {
      setStep({ kind: 'tossup_open', openedAt: step.startedAt + tossupWords.length * msPerWord });
    } else if (step.kind === 'tossup_open' && now - step.openedAt >= TOSSUP_WINDOW_S * 1000) {
      setTally((t) => ({ ...t, tossupsHeard: t.tossupsHeard + 1, missed: [...t.missed, tossup] }));
      setStep({ kind: 'tossup_result', response: '', result: null, interrupt: false, latencyMs: null, decided: false });
    } else if (step.kind === 'bonus_reading' && shownBonusWords >= bonusWords.length) {
      setStep({ kind: 'bonus_open', openedAt: step.startedAt + bonusWords.length * msPerWord });
    } else if (step.kind === 'bonus_open' && now - step.openedAt >= BONUS_WINDOW_S * 1000) {
      submitBonus(response);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, step]);

  const buzz = useCallback(() => {
    if (step.kind === 'tossup_reading') {
      setStep({ kind: 'tossup_answering', interrupt: true, latencyMs: null, shownWords: shownTossupWords });
    } else if (step.kind === 'tossup_open') {
      setStep({ kind: 'tossup_answering', interrupt: false, latencyMs: Date.now() - step.openedAt, shownWords: tossupWords.length });
    } else return;
    setResponse('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [step, shownTossupWords, tossupWords.length]);

  const submitTossup = (text: string) => {
    if (step.kind !== 'tossup_answering') return;
    const result = judgeAnswer(tossup, text);
    const decided = result.verdict === 'review' ? null : result.verdict === 'correct';
    setStep({ kind: 'tossup_result', response: text, result, interrupt: step.interrupt, latencyMs: step.latencyMs, decided });
    if (decided !== null) applyTossup(decided, step.interrupt);
  };

  /** Update the running tally; `undoPrevious` reverses an earlier decision on the same question first. */
  const applyTossup = (correct: boolean, interrupt: boolean, undoPrevious?: boolean) => {
    setTally((t) => {
      const n = { ...t, missed: [...t.missed] };
      if (undoPrevious) {
        // Reverse the earlier decision before applying the new one.
        if (correct) {
          n.tossupsCorrect += 1;
          n.points += 4 + (interrupt ? 4 : 0);
          n.interruptsWrong -= interrupt ? 1 : 0;
          n.missed = n.missed.filter((q) => q.id !== tossup.id);
        } else {
          n.tossupsCorrect -= 1;
          n.points -= 4 + (interrupt ? 4 : 0);
          n.interruptsWrong += interrupt ? 1 : 0;
          n.missed.push(tossup);
        }
        return n;
      }
      n.tossupsHeard += 1;
      if (interrupt) n.interrupts += 1;
      if (correct) {
        n.tossupsCorrect += 1;
        n.points += 4;
      } else {
        n.missed.push(tossup);
        if (interrupt) {
          n.interruptsWrong += 1;
          n.points -= 4;
        }
      }
      return n;
    });
  };

  const decideTossup = (right: boolean) => {
    if (step.kind !== 'tossup_result' || !step.result) return;
    const previous = step.decided;
    if (previous === right) return;
    setStep({ ...step, decided: right });
    applyTossup(right, step.interrupt, previous !== null);
  };

  const submitBonus = (text: string) => {
    if (!bonus || (step.kind !== 'bonus_open' && step.kind !== 'bonus_reading')) return;
    const result = text.trim() ? judgeAnswer(bonus, text) : null;
    const decided = !result ? false : result.verdict === 'review' ? null : result.verdict === 'correct';
    setStep({ kind: 'bonus_result', response: text, result, decided });
    setTally((t) => ({ ...t, bonusesHeard: t.bonusesHeard + 1 }));
    if (playerId) markSeen([playerId], [bonus.id]);
    if (decided !== null) applyBonus(decided, false);
  };

  const applyBonus = (correct: boolean, undoPrevious: boolean) => {
    if (!bonus) return;
    setTally((t) => {
      const n = { ...t, missed: [...t.missed] };
      if (undoPrevious) {
        n.bonusesCorrect += correct ? 1 : -1;
        n.points += correct ? 10 : -10;
        n.missed = correct ? n.missed.filter((q) => q.id !== bonus.id) : [...n.missed, bonus];
        return n;
      }
      if (correct) {
        n.bonusesCorrect += 1;
        n.points += 10;
      } else n.missed.push(bonus);
      return n;
    });
  };

  const decideBonus = (right: boolean) => {
    if (step.kind !== 'bonus_result' || !step.result) return;
    const previous = step.decided;
    if (previous === right) return;
    setStep({ ...step, decided: right });
    applyBonus(right, previous !== null);
  };

  const canContinue = (step.kind === 'tossup_result' && (step.result === null || step.decided !== null)) || (step.kind === 'bonus_result' && (step.result === null || step.decided !== null));
  const goesToBonus = step.kind === 'tossup_result' && step.decided === true && !!bonus;

  const next = () => {
    if (!canContinue) return;
    // Save the final decision once, when the player moves on (so overrides never double-count).
    if (step.kind === 'tossup_result' && step.result && step.decided !== null) {
      record(tossup, step.decided, step.interrupt, step.latencyMs, step.result.verdict !== (step.decided ? 'correct' : 'incorrect'));
    }
    if (step.kind === 'bonus_result' && bonus && step.result && step.decided !== null) {
      record(bonus, step.decided, false, null, step.result.verdict !== (step.decided ? 'correct' : 'incorrect'));
    }
    setResponse('');
    if (goesToBonus) {
      setStep({ kind: 'bonus_reading', startedAt: Date.now() });
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    if (index + 1 >= items.length) {
      onDone(tally);
      return;
    }
    setIndex(index + 1);
    setStep({ kind: 'tossup_reading', startedAt: Date.now() });
  };

  // Keyboard: Space buzzes; Space/Enter continues; Y/N decide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (typing) return;
      const key = e.key.toLowerCase();
      if (key === ' ' && (step.kind === 'tossup_reading' || step.kind === 'tossup_open')) {
        e.preventDefault();
        buzz();
      } else if ((key === ' ' || key === 'enter') && canContinue) {
        if (target?.tagName === 'BUTTON' && key === 'enter') return;
        e.preventDefault();
        next();
      } else if (key === 'y' || key === 'n') {
        if (step.kind === 'tossup_result' && step.result && step.decided === null) decideTossup(key === 'y');
        if (step.kind === 'bonus_result' && step.result && step.decided === null) decideBonus(key === 'y');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onBonus = step.kind === 'bonus_reading' || step.kind === 'bonus_open' || step.kind === 'bonus_result';

  return (
    <div className="container narrow">
      <div className="row spread" style={{ marginBottom: '0.5rem' }}>
        <span className="muted small">
          Toss-up {index + 1} of {items.length} · {item.where}
        </span>
        <span className="row small">
          <strong>{tally.points} points</strong>
          <button className="btn btn-small btn-ghost" onClick={onQuit}>
            Stop
          </button>
        </span>
      </div>

      {!onBonus ? (
        <article className="question">
          <QuestionMeta q={tossup} />
          {step.kind === 'tossup_result' ? (
            <>
              <p className="stem">
                <RichText text={tossup.stem} />
              </p>
              <Choices q={tossup} />
            </>
          ) : (
            <Revealed list={tossupWords} count={shownTossupWords} />
          )}
        </article>
      ) : (
        bonus && (
          <article className="question">
            <QuestionMeta q={bonus} />
            {step.kind === 'bonus_result' ? (
              <>
                <p className="stem">
                  <RichText text={bonus.stem} />
                </p>
                <Choices q={bonus} />
              </>
            ) : (
              <Revealed list={bonusWords} count={shownBonusWords} />
            )}
          </article>
        )
      )}

      <div className="stack" style={{ marginTop: '1rem' }}>
        {step.kind === 'tossup_reading' && (
          <button className="btn btn-primary btn-big" onClick={buzz}>
            Buzz <span className="kbd">Space</span>
          </button>
        )}
        {step.kind === 'tossup_open' && (
          <>
            <Countdown openedAt={step.openedAt} seconds={TOSSUP_WINDOW_S} now={now} label="Time to buzz" />
            <button className="btn btn-primary btn-big" onClick={buzz}>
              Buzz <span className="kbd">Space</span>
            </button>
          </>
        )}
        {(step.kind === 'tossup_answering' || step.kind === 'bonus_reading' || step.kind === 'bonus_open') && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step.kind === 'tossup_answering') submitTossup(response);
              else submitBonus(response);
            }}
            className="stack"
          >
            {step.kind === 'tossup_answering' && step.interrupt && <span className="badge">Interrupt: a wrong answer gives the other team 4 points</span>}
            {step.kind === 'bonus_open' && <Countdown openedAt={step.openedAt} seconds={BONUS_WINDOW_S} warningAt={BONUS_WARNING_S} now={now} label="Bonus" />}
            <label htmlFor="answer" className="label">
              {step.kind === 'tossup_answering' ? 'Your answer' : 'Bonus answer (you can start typing while it is read)'}
            </label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                id="answer"
                ref={inputRef}
                className="big-input"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                autoFocus
              />
              <button className="btn btn-primary" type="submit">
                Answer
              </button>
            </div>
          </form>
        )}
        {step.kind === 'tossup_result' && (
          <>
            {step.response && <p className="small muted">You answered: “{step.response}”</p>}
            <Verdict result={step.result} decided={step.decided} onDecide={decideTossup} />
            <AnswerBox q={tossup} />
          </>
        )}
        {step.kind === 'bonus_result' && bonus && (
          <>
            {step.response && <p className="small muted">You answered: “{step.response}”</p>}
            <Verdict result={step.result} decided={step.decided} onDecide={decideBonus} />
            <AnswerBox q={bonus} />
          </>
        )}
        {canContinue && (
          <button className="btn btn-primary btn-big" onClick={next}>
            {goesToBonus ? 'Bonus' : index + 1 >= items.length && !goesToBonus ? 'Finish' : 'Next toss-up'} <span className="kbd">Space</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Done({ tally, onAgain, onSetup }: { tally: Tally; onAgain: () => void; onSetup: () => void }) {
  const data = useData();
  return (
    <div className="container narrow">
      <PageHeader title={`${tally.points} points`}>
        <p>
          Toss-ups: {tally.tossupsCorrect} of {tally.tossupsHeard} · Interrupts: {tally.interrupts} ({tally.interruptsWrong} wrong) · Bonuses:{' '}
          {tally.bonusesCorrect} of {tally.bonusesHeard}
        </p>
        <div className="row">
          <button className="btn btn-primary" onClick={onAgain}>
            Play again
          </button>
          <button className="btn" onClick={onSetup}>
            Change settings
          </button>
          {!data.team && (
            <a className="btn btn-ghost" href={href('/team')}>
              Set up a team to save progress
            </a>
          )}
        </div>
      </PageHeader>
      {tally.missed.length > 0 ? (
        <>
          <h2>Review what you missed</h2>
          <p className="muted small">Saved players will get these back as timed reviews in the next release.</p>
          <div className="stack">
            {tally.missed.map((q) => (
              <article className="question" key={q.id}>
                <QuestionMeta q={q} />
                <p className="stem">
                  <RichText text={q.stem} />
                </p>
                <Choices q={q} />
                <AnswerBox q={q} />
              </article>
            ))}
          </div>
        </>
      ) : (
        <Notice kind="good">Nothing missed. Try a harder round or a faster reading speed.</Notice>
      )}
    </div>
  );
}

export function TryRound({ query }: { query: URLSearchParams }) {
  const [stage, setStage] = useState<'setup' | 'play' | 'done'>('setup');
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tally, setTally] = useState<Tally>(emptyTally);
  const [runKey, setRunKey] = useState(0);
  const initial: Partial<Settings> = { setId: query.get('set') ?? '', roundId: query.get('round') ?? '' };

  if (stage === 'play' && settings) {
    return (
      <Play
        key={runKey}
        items={items}
        wpm={settings.wpm}
        onDone={(t) => {
          setTally(t);
          setStage('done');
        }}
        onQuit={() => setStage('setup')}
      />
    );
  }
  if (stage === 'done') {
    return (
      <Done
        tally={tally}
        onAgain={() => {
          setItems(shuffle(items));
          setRunKey((k) => k + 1);
          setStage('play');
        }}
        onSetup={() => setStage('setup')}
      />
    );
  }
  return (
    <Setup
      initial={settings ?? initial}
      onStart={(list, s) => {
        if (list.length === 0) return;
        setItems(list);
        setSettings(s);
        setRunKey((k) => k + 1);
        setStage('play');
      }}
    />
  );
}
