import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FigureView } from '../components/Figure';
import { AnswerBox, Choices, QuestionMeta, RichText } from '../components/QuestionView';
import { Countdown, Notice, PageHeader, SubjectTag, useTicker } from '../components/ui';
import { Verdict } from '../components/Verdict';
import { judgeAnswer, type JudgeResult } from '../core/judge/judge';
import { FINALS_VISUAL_BONUS } from '../core/rules/presets';
import { CORE_SUBJECTS, LETTERS, SUBJECT_LABELS, type AnswerFormat, type CoreSubject, type Letter, type Question, type TeamVisual } from '../core/schema';
import { randomVisual, VISUAL_TEMPLATES, visualTemplate, type VisualTemplate } from '../core/visual';
import { photoQuestion, type PhotoSet } from '../core/visual/photos';
import { newSeed } from '../core/visual/rng';
import { newId } from '../lib/format';
import { pictureFromFile } from '../lib/images';
import { useAsync } from '../lib/library';
import { buildReading, readingDurationMs, revealedCount, splitRevealed } from '../lib/reading';
import { href } from '../lib/router';
import { beep, unlockAudio } from '../lib/sound';
import { addAttempt, completePlanItem, deleteVisual, markSeen, saveVisual, useData } from '../lib/store';
import { isSafeImageSrc, loadPhotoSet, teamVisualQuestion } from '../lib/visuals';

type Source = 'generated' | 'photo' | 'team';

const SOURCE_TEXT: Record<Source, string> = {
  generated: 'Figures Rebound draws (graphs, circuits, diagrams)',
  photo: 'Photos (clouds, rocks, planets, organisms…)',
  team: "Your team's own visual questions",
};

/** Answers may be finished this long after the 30 seconds if the captain began in time (Rule 5-5). */
const FINISH_GRACE_S = 10;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

/** A practice session: `count` questions from the chosen subjects and sources, varied. */
function buildSession(opts: { count: number; subjects: Set<CoreSubject>; sources: Set<Source>; photos: PhotoSet; team: TeamVisual[]; template?: VisualTemplate }): Question[] {
  if (opts.template) return Array.from({ length: opts.count }, () => randomVisual([opts.template!]));
  const templates = VISUAL_TEMPLATES.filter((t) => opts.subjects.has(t.subject));
  const groups = new Map(opts.photos.groups.map((g) => [g.id, g]));
  const photos = opts.photos.photos.filter((p) => {
    const g = groups.get(p.group);
    return !!g && opts.subjects.has(g.subject);
  });
  const team = opts.team.filter((v) => opts.subjects.has(v.question.subject as CoreSubject));
  const usedPhotos = new Set<string>();
  const usedTeam = new Set<string>();
  let lastTemplate = '';
  const out: Question[] = [];
  for (let i = 0; i < opts.count; i++) {
    const available: Source[] = [];
    if (opts.sources.has('generated') && templates.length) available.push('generated');
    if (opts.sources.has('photo') && photos.some((p) => !usedPhotos.has(p.id))) available.push('photo');
    if (opts.sources.has('team') && team.some((v) => !usedTeam.has(v.id))) available.push('team');
    if (available.length === 0) break;
    const source = pick(available);
    if (source === 'photo') {
      const p = pick(photos.filter((x) => !usedPhotos.has(x.id)));
      usedPhotos.add(p.id);
      const q = photoQuestion(opts.photos, p.id, newSeed());
      if (q) out.push(q);
    } else if (source === 'team') {
      const v = pick(team.filter((x) => !usedTeam.has(x.id)));
      usedTeam.add(v.id);
      out.push(teamVisualQuestion(v));
    } else {
      const choices = templates.length > 1 ? templates.filter((t) => t.id !== lastTemplate) : templates;
      const q = randomVisual(choices);
      lastTemplate = q.id.replace(/^vis-(.+)-\d+$/, '$1');
      out.push(q);
    }
  }
  return out;
}

/* ---------------- practice ---------------- */

type Step =
  | { kind: 'reading'; startedAt: number }
  | { kind: 'open'; openedAt: number; typingAt: number | null }
  | { kind: 'result'; response: string; result: JudgeResult | null; decided: boolean | null; latencyMs: number | null };

interface Done {
  q: Question;
  response: string;
  correct: boolean;
}

function finalOf(step: Extract<Step, { kind: 'result' }>): boolean {
  if (step.decided !== null) return step.decided;
  return step.result?.verdict === 'correct';
}

function VisualPractice({ questions, timed, onExit, onFinish, fromPlan }: { questions: Question[]; timed: boolean; onExit: () => void; onFinish?: () => void; fromPlan?: boolean }) {
  const data = useData();
  const player = data.players.find((p) => p.id === data.settings.soloPlayerId) ?? null;
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>({ kind: 'reading', startedAt: Date.now() });
  const [response, setResponse] = useState('');
  const [done, setDone] = useState<Done[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const q = questions[index];
  const reading = useMemo(() => (q ? buildReading(q) : null), [q]);
  const wpm = data.settings.readingWpm;
  const now = useTicker(step.kind !== 'result', 50);
  const fired = useRef<Set<string>>(new Set());
  const finished = useRef(false);
  const sound = data.settings.sound;
  const windowSec = FINALS_VISUAL_BONUS.sec;

  const open = useCallback(() => setStep((s) => (s.kind === 'reading' ? { kind: 'open', openedAt: Date.now(), typingAt: null } : s)), []);

  const submit = useCallback(
    (text: string) => {
      if (!q) return;
      setStep((s) => {
        if (s.kind === 'result') return s;
        const typed = text.trim();
        const typingAt = s.kind === 'open' ? s.typingAt : null;
        const openedAt = s.kind === 'open' ? s.openedAt : Date.now();
        return {
          kind: 'result',
          response: typed,
          result: typed ? judgeAnswer(q, typed) : null,
          decided: null,
          latencyMs: typed ? Math.max(0, (typingAt ?? Date.now()) - openedAt) : null,
        };
      });
    },
    [q],
  );

  // Reading → open, when the text has been "read" at the chosen pace.
  useEffect(() => {
    if (step.kind !== 'reading' || !reading) return;
    if (now - step.startedAt >= readingDurationMs(reading, wpm)) open();
  }, [now, step, reading, wpm, open]);

  // The 30 seconds: "5 SECONDS" at 25, "TIME" at 30. An answer begun in time may be finished (no stalling).
  useEffect(() => {
    if (step.kind !== 'open' || !timed) return;
    const elapsed = (now - step.openedAt) / 1000;
    const key = `${index}-${step.openedAt}`;
    if (elapsed >= FINALS_VISUAL_BONUS.warningAtSec && !fired.current.has(`${key}w`)) {
      fired.current.add(`${key}w`);
      if (sound) beep('warning');
    }
    if (elapsed >= windowSec && !fired.current.has(`${key}t`)) {
      fired.current.add(`${key}t`);
      if (sound) beep('time');
      if (step.typingAt === null) submit('');
    }
    if (step.typingAt !== null && elapsed >= windowSec + FINISH_GRACE_S) submit(response);
  }, [now, step, timed, index, sound, windowSec, submit, response]);

  useEffect(() => {
    if (step.kind !== 'result') input.current?.focus();
  }, [step.kind, index]);

  const next = useCallback(() => {
    if (step.kind !== 'result' || !q) return;
    const correct = finalOf(step);
    const entry = { q, response: step.response, correct };
    if (player) {
      addAttempt({
        playerId: player.id,
        questionId: q.id,
        subject: q.subject,
        kind: 'bonus',
        correct,
        interrupt: false,
        latencyMs: step.latencyMs,
        overridden: step.decided !== null && step.decided !== (step.result?.verdict === 'correct'),
        t: Date.now(),
      });
      markSeen([player.id], [q.id]);
    }
    setDone((d) => [...d, entry]);
    setResponse('');
    setIndex((i) => i + 1);
    setStep({ kind: 'reading', startedAt: Date.now() });
  }, [step, q, player]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (step.kind === 'result' && (e.key === 'Enter' || (e.key === ' ' && !typing))) {
        e.preventDefault();
        next();
      } else if (step.kind === 'result' && step.result?.verdict === 'review' && step.decided === null && !typing) {
        if (e.key.toLowerCase() === 'y') setStep({ ...step, decided: true });
        if (e.key.toLowerCase() === 'n') setStep({ ...step, decided: false });
      } else if (step.kind === 'reading' && e.key === ' ' && !typing) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, next, open]);

  if (!q) {
    const right = done.filter((d) => d.correct).length;
    if (!finished.current) {
      finished.current = true;
      // Ticking off the plan item touches the store, so it waits until after this render.
      setTimeout(() => onFinish?.(), 0);
    }
    return (
      <div className="container narrow">
        <PageHeader title="Visual lab: done" />
        <p style={{ fontSize: '1.2rem' }}>
          <strong>
            {right} of {done.length}
          </strong>{' '}
          right{player ? '' : '. Pick your name on Today to save results'}.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Question</th>
                <th>Your answer</th>
                <th>Answer</th>
              </tr>
            </thead>
            <tbody>
              {done.map((d, i) => (
                <tr key={i}>
                  <td>
                    <SubjectTag subject={d.q.subject} />
                  </td>
                  <td className="small">{d.q.stem.slice(0, 80)}</td>
                  <td>
                    {d.response || <span className="muted">none</span>} {d.correct ? '✓' : '✗'}
                  </td>
                  <td>{d.q.answerLetter ? `${d.q.answerLetter}) ${d.q.answer}` : d.q.answer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: '1rem' }}>
          {fromPlan && (
            <a className="btn btn-primary" href={href('/today')}>
              Back to today's plan
            </a>
          )}
          <button className={fromPlan ? 'btn' : 'btn btn-primary'} onClick={onExit}>
            Back to the Visual lab
          </button>
        </div>
      </div>
    );
  }

  const revealed = step.kind === 'reading' && reading ? splitRevealed(reading, revealedCount(reading, now - step.startedAt, wpm)) : null;
  const lines = revealed ? revealed.done.split('\n') : [];
  return (
    <div className="container narrow">
      <div className="row spread small muted" style={{ marginBottom: '0.5rem' }}>
        <span>
          Visual bonus {index + 1} of {questions.length}
        </span>
        <button className="btn btn-small btn-ghost" onClick={onExit}>
          Stop
        </button>
      </div>
      <article className="question">
        <QuestionMeta q={q} />
        <FigureView q={q} large />
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

      <div className="stack" style={{ marginTop: '1rem' }}>
        {step.kind === 'reading' && (
          <button className="btn" onClick={open}>
            Done reading <span className="kbd">Space</span>
          </button>
        )}
        {step.kind === 'open' && timed && (
          <Countdown openedAt={step.openedAt} seconds={windowSec} warningAt={FINALS_VISUAL_BONUS.warningAtSec} now={now} label="Visual bonus" />
        )}
        {step.kind !== 'result' && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              unlockAudio();
              submit(response);
            }}
          >
            {q.format === 'multiple_choice' && (
              <div className="row" role="group" aria-label="Choose a letter">
                {LETTERS.map((L: Letter) => (
                  <button key={L} type="button" className="btn btn-big" onClick={() => submit(L)} disabled={step.kind === 'reading'}>
                    {L}
                  </button>
                ))}
              </div>
            )}
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                ref={input}
                className="big-input"
                type="text"
                aria-label="Your answer"
                autoComplete="off"
                value={response}
                placeholder={step.kind === 'reading' ? 'Answer when the reading ends' : 'Type the answer, then Enter'}
                onChange={(e) => {
                  setResponse(e.target.value);
                  setStep((s) => (s.kind === 'open' && s.typingAt === null && e.target.value.trim() ? { ...s, typingAt: Date.now() } : s));
                }}
              />
              <button className="btn btn-primary" type="submit" disabled={step.kind === 'reading'}>
                Answer
              </button>
            </div>
          </form>
        )}
        {step.kind === 'result' && (
          <>
            {step.response && (
              <p className="small">
                You said: <strong>{step.response}</strong>
              </p>
            )}
            <Verdict result={step.result} decided={step.decided} onDecide={(right) => setStep({ ...step, decided: right })} />
            <div>
              <button className="btn btn-primary btn-big" onClick={next} disabled={step.result?.verdict === 'review' && step.decided === null}>
                {index + 1 < questions.length ? 'Next' : 'Finish'} <span className="kbd">Enter</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- the team's own visual questions ---------------- */

function splitList(s: string): string[] {
  return s
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function emptyChoices(): Record<Letter, string> {
  return { W: '', X: '', Y: '', Z: '' };
}

function VisualEditor({ editing, onClose }: { editing: TeamVisual | null; onClose: () => void }) {
  const data = useData();
  const base = editing?.question;
  const [picture, setPicture] = useState<string | null>(base?.figure?.kind === 'image' ? base.figure.src : null);
  const [alt, setAlt] = useState(base?.figure?.alt ?? '');
  const [credit, setCredit] = useState(base?.figure?.kind === 'image' ? (base.figure.credit ?? '') : '');
  const [subject, setSubject] = useState<CoreSubject>((base?.subject as CoreSubject) ?? 'earth_space');
  const [format, setFormat] = useState<AnswerFormat>(base?.format ?? 'short_answer');
  const [stem, setStem] = useState(base?.stem ?? '');
  const [choices, setChoices] = useState<Record<Letter, string>>(base?.choices ?? emptyChoices());
  const [letter, setLetter] = useState<Letter>(base?.answerLetter ?? 'W');
  const [answer, setAnswer] = useState(base && base.format === 'short_answer' ? base.answer : '');
  const [accept, setAccept] = useState((base?.accept ?? []).join('; '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mcReady = format === 'multiple_choice' && LETTERS.every((L) => choices[L].trim());
  const ok = !!picture && alt.trim() && credit.trim() && stem.trim() && (format === 'short_answer' ? answer.trim() : mcReady);

  const save = () => {
    if (!ok || !picture) return;
    const id = editing?.id ?? `vtm-${newId('v')}`;
    const isMc = format === 'multiple_choice';
    const answerText = isMc ? choices[letter].trim() : answer.trim().toUpperCase();
    const accepts = isMc ? [] : splitList(accept);
    const question: Question = {
      id,
      kind: 'bonus',
      number: 1,
      subject,
      sourceCategory: SUBJECT_LABELS[subject].toUpperCase(),
      format,
      stem: stem.trim(),
      ...(isMc ? { choices: Object.fromEntries(LETTERS.map((L) => [L, choices[L].trim()])) as Record<Letter, string>, answerLetter: letter } : {}),
      answer: answerText,
      accept: accepts,
      reject: [],
      answerRaw: isMc ? `${letter}) ${answerText}` : accepts.length ? `${answerText} (ACCEPT: ${accepts.join(', ')})` : answerText,
      visual: true,
      figure: { kind: 'image', src: picture, alt: alt.trim(), credit: credit.trim() },
      source: { provider: 'team', setId: 'vtm', roundId: 'vtm', credit: credit.trim() },
    };
    saveVisual({ id, authorId: editing?.authorId ?? data.settings.soloPlayerId ?? null, question });
    onClose();
  };

  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h3 style={{ margin: 0 }}>{editing ? 'Edit visual question' : 'Add a visual question'}</h3>
      <div className="field">
        <label htmlFor="vq-picture">Picture</label>
        <input
          id="vq-picture"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError(null);
            pictureFromFile(file).then(
              (p) => {
                setPicture(p.dataUrl);
                setBusy(false);
              },
              (err: Error) => {
                setError(err.message);
                setBusy(false);
              },
            );
          }}
        />
        <span className="hint">A photo or a scan of a figure. It is shrunk to about 250 KB and stays in your team's data.</span>
      </div>
      {picture && <img src={picture} alt="" style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', alignSelf: 'flex-start' }} />}
      <div className="grid">
        <div className="field">
          <label htmlFor="vq-alt">What the picture shows</label>
          <input id="vq-alt" type="text" value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} />
          <span className="hint">For screen readers. Do not give the answer away.</span>
        </div>
        <div className="field">
          <label htmlFor="vq-credit">Where the picture is from</label>
          <input id="vq-credit" type="text" value={credit} maxLength={200} placeholder="e.g. NOAA Photo Library, public domain; or drawn by Ann" onChange={(e) => setCredit(e.target.value)} />
        </div>
      </div>
      <div className="grid">
        <div className="field">
          <label htmlFor="vq-subject">Subject</label>
          <select id="vq-subject" value={subject} onChange={(e) => setSubject(e.target.value as CoreSubject)}>
            {CORE_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {SUBJECT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="vq-format">Type</label>
          <select id="vq-format" value={format} onChange={(e) => setFormat(e.target.value as AnswerFormat)}>
            <option value="short_answer">Short answer</option>
            <option value="multiple_choice">Multiple choice</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="vq-stem">Question</label>
        <textarea id="vq-stem" rows={3} value={stem} maxLength={600} placeholder="e.g. Identify the cloud genus shown in the photo." onChange={(e) => setStem(e.target.value)} />
      </div>
      {format === 'multiple_choice' ? (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Choices (mark the right one)</legend>
          {LETTERS.map((L) => (
            <div key={L} className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="checkbox">
                <input type="radio" name="vq-letter" checked={letter === L} onChange={() => setLetter(L)} aria-label={`${L} is right`} /> {L})
              </label>
              <input type="text" aria-label={`Choice ${L}`} value={choices[L]} maxLength={200} onChange={(e) => setChoices({ ...choices, [L]: e.target.value })} />
            </div>
          ))}
        </fieldset>
      ) : (
        <div className="grid">
          <div className="field">
            <label htmlFor="vq-answer">Answer</label>
            <input id="vq-answer" type="text" value={answer} maxLength={200} onChange={(e) => setAnswer(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="vq-accept">Also accept</label>
            <input id="vq-accept" type="text" value={accept} maxLength={400} placeholder="Separate with semicolons" onChange={(e) => setAccept(e.target.value)} />
          </div>
        </div>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={!ok || busy}>
          Save
        </button>
        <button className="btn btn-ghost" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

interface ImportedVisual {
  subject?: string;
  format?: string;
  stem?: string;
  choices?: Record<string, string>;
  answerLetter?: string;
  answer?: string;
  accept?: string[];
  image?: string;
  alt?: string;
  credit?: string;
}

/** Read a JSON file of visual questions: { "visuals": [ { subject, format, stem, choices?, answerLetter?, answer, accept?, image, alt, credit } ] }. */
async function importVisuals(file: File, authorId: string | null): Promise<{ added: number; skipped: number }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} is not valid JSON.`);
  }
  const list = (parsed as { visuals?: unknown })?.visuals;
  if (!Array.isArray(list)) throw new Error(`${file.name} has no "visuals" list.`);
  let added = 0;
  let skipped = 0;
  for (const raw of list as ImportedVisual[]) {
    const subject = CORE_SUBJECTS.find((s) => s === raw.subject);
    const mc = raw.format === 'multiple_choice';
    const letter = LETTERS.find((L) => L === raw.answerLetter);
    const choices = mc && raw.choices && LETTERS.every((L) => typeof raw.choices![L] === 'string' && raw.choices![L]!.trim()) ? (raw.choices as Record<Letter, string>) : null;
    const image = typeof raw.image === 'string' && isSafeImageSrc(raw.image) && raw.image.length <= 600_000 ? raw.image : null;
    if (!subject || !image || typeof raw.stem !== 'string' || !raw.stem.trim() || (mc ? !choices || !letter : typeof raw.answer !== 'string' || !raw.answer.trim())) {
      skipped += 1;
      continue;
    }
    const id = `vtm-${newId('v')}`;
    const answer = mc ? choices![letter!] : String(raw.answer).trim();
    const accept = mc ? [] : (Array.isArray(raw.accept) ? raw.accept : []).filter((a): a is string => typeof a === 'string');
    saveVisual({
      id,
      authorId,
      question: {
        id,
        kind: 'bonus',
        number: 1,
        subject,
        sourceCategory: SUBJECT_LABELS[subject].toUpperCase(),
        format: mc ? 'multiple_choice' : 'short_answer',
        stem: raw.stem.trim(),
        ...(mc ? { choices: choices!, answerLetter: letter! } : {}),
        answer,
        accept,
        reject: [],
        answerRaw: mc ? `${letter}) ${answer}` : answer,
        visual: true,
        figure: { kind: 'image', src: image, alt: String(raw.alt ?? ''), credit: String(raw.credit ?? '') },
        source: { provider: 'team', setId: 'vtm', roundId: 'vtm', credit: String(raw.credit ?? '') },
      },
    });
    added += 1;
  }
  return { added, skipped };
}

function exportVisuals(visuals: TeamVisual[]): void {
  const out = {
    visuals: visuals.map((v) => {
      const q = v.question;
      return {
        subject: q.subject,
        format: q.format,
        stem: q.stem,
        ...(q.choices ? { choices: q.choices, answerLetter: q.answerLetter } : {}),
        answer: q.answer,
        accept: q.accept,
        image: q.figure?.kind === 'image' ? q.figure.src : undefined,
        alt: q.figure?.alt,
        credit: q.figure?.kind === 'image' ? q.figure.credit : undefined,
      };
    }),
  };
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rebound-visual-questions-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function TeamVisuals() {
  const data = useData();
  const [editing, setEditing] = useState<TeamVisual | null | 'new'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const names = new Map(data.players.map((p) => [p.id, p.name]));
  if (!data.team) return null;
  return (
    <section className="card stack" aria-labelledby="team-visuals">
      <div className="row spread">
        <h2 id="team-visuals" style={{ margin: 0 }}>
          Your team's visual questions ({data.visuals.length})
        </h2>
        <div className="row">
          <button className="btn btn-primary btn-small" onClick={() => setEditing('new')}>
            Add one
          </button>
          <label className="btn btn-small">
            Import JSON
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                importVisuals(file, data.settings.soloPlayerId ?? null).then(
                  (r) => setMessage(`Added ${r.added}${r.skipped ? `; skipped ${r.skipped} that were incomplete or had no usable picture` : ''}.`),
                  (err: Error) => setMessage(err.message),
                );
                e.target.value = '';
              }}
            />
          </label>
          {data.visuals.length > 0 && (
            <button className="btn btn-small btn-ghost" onClick={() => exportVisuals(data.visuals)}>
              Download as JSON
            </button>
          )}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Figures and photos your team collects (from your invitationals, textbooks you may use, or drawn yourselves) as visual bonuses. They sync
        to every member, appear in the Visual lab and in Finals visual scrimmages, and are never published.
      </p>
      {message && <Notice>{message}</Notice>}
      {editing && <VisualEditor editing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {data.visuals.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Picture</th>
                <th>Subject</th>
                <th>Question</th>
                <th>Answer</th>
                <th>Added by</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.visuals.map((v) => {
                const q = v.question;
                const src = q.figure?.kind === 'image' && isSafeImageSrc(q.figure.src) ? q.figure.src : null;
                return (
                  <tr key={v.id}>
                    <td>{src && <img src={src} alt={q.figure?.alt ?? ''} style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 4 }} />}</td>
                    <td>
                      <SubjectTag subject={q.subject} />
                    </td>
                    <td className="small">{q.stem.slice(0, 90)}</td>
                    <td className="small">{q.answerLetter ? `${q.answerLetter}) ${q.answer}` : q.answer}</td>
                    <td className="small">{v.authorId ? (names.get(v.authorId) ?? '') : ''}</td>
                    <td className="nowrap">
                      <button className="btn btn-small" onClick={() => setEditing(v)}>
                        Edit
                      </button>{' '}
                      <button
                        className="btn btn-small btn-ghost"
                        onClick={() => {
                          if (confirm('Delete this visual question for the whole team?')) deleteVisual(v.id);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------------- the page ---------------- */

export function VisualLabPage({ query }: { query: URLSearchParams }) {
  const data = useData();
  const photos = useAsync('photos', loadPhotoSet);
  const template = visualTemplate(query.get('template') ?? '');
  // From today's plan: start at once with the planned number, and tick the item off at the end.
  const planItem = query.get('plan');
  const planDay = query.get('day');
  const go = query.get('go') === '1';
  const plannedCount = Math.max(1, Math.min(30, Number(query.get('count')) || 0));
  const [subjects, setSubjects] = useState<Set<CoreSubject>>(() => new Set(CORE_SUBJECTS));
  const [sources, setSources] = useState<Set<Source>>(() => new Set<Source>(['generated', 'photo', 'team']));
  const [count, setCount] = useState(10);
  const [timed, setTimed] = useState(true);
  const [session, setSession] = useState<Question[] | null>(null);
  const autoStarted = useRef(false);

  const photoCount = photos.data?.photos.length ?? 0;
  const counts: Record<Source, number> = { generated: VISUAL_TEMPLATES.length, photo: photoCount, team: data.visuals.length };

  const start = useCallback(
    (only?: VisualTemplate, n?: number) => {
      unlockAudio();
      const qs = buildSession({
        count: only ? 5 : (n ?? count),
        subjects,
        sources,
        photos: photos.data ?? { generatedAt: '', groups: [], photos: [] },
        team: data.visuals,
        template: only,
      });
      if (qs.length) setSession(qs);
    },
    [count, subjects, sources, photos.data, data.visuals],
  );

  // "Try one" links open the lab with one template; plan links start a session at once.
  useEffect(() => {
    if ((template || go) && !autoStarted.current && !photos.loading) {
      autoStarted.current = true;
      if (template) start(template);
      else start(undefined, plannedCount || count);
    }
  }, [template, go, plannedCount, count, photos.loading, start]);

  if (session) {
    const playerId = data.settings.soloPlayerId;
    return (
      <VisualPractice
        questions={session}
        timed={timed}
        onExit={() => setSession(null)}
        fromPlan={!!planItem}
        onFinish={() => {
          if (planItem && planDay && playerId) completePlanItem(playerId, planDay, planItem);
        }}
      />
    );
  }

  const toggle = <T,>(set: Set<T>, x: T, on: boolean): Set<T> => {
    const next = new Set(set);
    if (on) next.add(x);
    else next.delete(x);
    return next;
  };
  const bySubject = CORE_SUBJECTS.map((s) => ({ s, list: VISUAL_TEMPLATES.filter((t) => t.subject === s) })).filter((x) => x.list.length);

  return (
    <div className="container">
      <p className="small">
        <a href={href('/try')}>Practice</a> /
      </p>
      <PageHeader title="Visual lab">
        <p>
          At the Finals, some double elimination rounds use visual bonuses: a figure on a monitor or a worksheet, and{' '}
          {FINALS_VISUAL_BONUS.sec} seconds (the warning at {FINALS_VISUAL_BONUS.warningAtSec}) for the captain to begin the answer. DOE publishes no
          samples, so practice here with figures Rebound draws, public-domain photos, and your team's own.
        </p>
      </PageHeader>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card stack" aria-labelledby="vl-practice">
          <h2 id="vl-practice" style={{ margin: 0 }}>
            Practice
          </h2>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">Subjects</legend>
            <div className="row" style={{ gap: '0.25rem 1rem' }}>
              {CORE_SUBJECTS.map((s) => (
                <label key={s} className="checkbox">
                  <input type="checkbox" checked={subjects.has(s)} onChange={(e) => setSubjects(toggle(subjects, s, e.target.checked))} /> {SUBJECT_LABELS[s]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">From</legend>
            {(Object.keys(SOURCE_TEXT) as Source[]).map((src) => (
              <label key={src} className="checkbox">
                <input type="checkbox" checked={sources.has(src) && counts[src] > 0} disabled={counts[src] === 0} onChange={(e) => setSources(toggle(sources, src, e.target.checked))} />{' '}
                {SOURCE_TEXT[src]} <span className="muted small">({src === 'generated' ? `${counts[src]} kinds` : counts[src]})</span>
              </label>
            ))}
          </fieldset>
          <div className="grid">
            <div className="field">
              <label htmlFor="vl-count">Questions</label>
              <select id="vl-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="vl-timed">Clock</label>
              <select id="vl-timed" value={timed ? 'yes' : 'no'} onChange={(e) => setTimed(e.target.value === 'yes')}>
                <option value="yes">Finals timing: {FINALS_VISUAL_BONUS.sec} seconds</option>
                <option value="no">No clock</option>
              </select>
            </div>
          </div>
          <div>
            <button className="btn btn-primary btn-big" onClick={() => start()} disabled={subjects.size === 0 || ![...sources].some((s) => counts[s] > 0)}>
              Start
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            The question is read at your reading speed while the figure shows; the {FINALS_VISUAL_BONUS.sec} seconds start when the reading ends.
            Start typing before time; you may then finish your answer. Results count toward review (photos and your team's questions), not your
            mastery map.
          </p>
        </section>

        <section className="card stack" aria-labelledby="vl-kinds">
          <h2 id="vl-kinds" style={{ margin: 0 }}>
            What Rebound draws
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            Each kind makes new numbers every time; the answer is worked out exactly by the site.
          </p>
          {bySubject.map(({ s, list }) => (
            <details key={s}>
              <summary>
                <SubjectTag subject={s} /> {list.length} kind{list.length === 1 ? '' : 's'}
              </summary>
              <ul className="small" style={{ paddingLeft: '1.1rem' }}>
                {list.map((t) => (
                  <li key={t.id}>
                    <strong>{t.title}</strong>: {t.description}{' '}
                    <button className="btn btn-small btn-ghost" onClick={() => start(t)}>
                      Try 5
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <TeamVisuals />
      </div>
      <p className="small muted" style={{ marginTop: '1rem' }}>
        Photos are public-domain images from U.S. government agencies and others, via Wikimedia Commons; each figure credits its source. To use
        visual bonuses in a game, build a <a href={href('/packets')}>Finals visual bonus round</a> scrimmage.
      </p>
    </div>
  );
}
