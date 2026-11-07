import { useMemo, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import { PlayerSwitch, useCurrentPlayer } from '../components/PlayerSwitch';
import { Notice, PageHeader, Stat } from '../components/ui';
import type { Observation, PlayerModel, SkillLine } from '../core/mastery';
import { endOfPracticeDay } from '../core/review';
import { CORE_SUBJECTS, SUBJECT_LABELS } from '../core/schema';
import { topicById, topicName, topicsForSubject } from '../core/taxonomy';
import { percent } from '../lib/format';
import { disputedQuestions, playerCardSummary, playerObservations, usePlayerModel } from '../lib/learning';
import { catalogById, useCatalog } from '../lib/library';
import { href } from '../lib/router';
import { useData, type AppData } from '../lib/store';

const DAY_MS = 86_400_000;
/** Topics need this many answers before they are colored: fewer is mostly guesswork. */
const MIN_ANSWERS = 3;
/** Mastery bins for the heat map (chance on a typical regional toss-up). */
const BINS = [
  { min: 0, label: 'under 35%' },
  { min: 0.35, label: '35–50%' },
  { min: 0.5, label: '50–65%' },
  { min: 0.65, label: '65–80%' },
  { min: 0.8, label: '80% and up' },
];

function binOf(line: SkillLine | undefined): number {
  if (!line || line.n < MIN_ANSWERS) return 0;
  let b = 1;
  for (const [i, bin] of BINS.entries()) if (line.p >= bin.min) b = i + 1;
  return b;
}

const seconds = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);

/* ---------------- tooltip ---------------- */

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

/** One tooltip per chart; marks call show() on hover and focus. Values also appear in each chart's table view. */
function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (target: Element, content: ReactNode) => {
    const box = ref.current?.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    if (!box) return;
    const x = Math.min(Math.max(r.left + r.width / 2 - box.left, 120), box.width - 120);
    setTip({ x, y: r.top - box.top, content });
  };
  const hide = () => setTip(null);
  const node = tip ? (
    <div className="viz-tip" role="presentation" style={{ left: tip.x, top: tip.y }}>
      {tip.content}
    </div>
  ) : null;
  const handlers = (content: ReactNode) => ({
    onPointerEnter: (e: PointerEvent) => show(e.currentTarget, content),
    onPointerLeave: hide,
    onFocus: (e: FocusEvent) => show(e.currentTarget, content),
    onBlur: hide,
  });
  return { ref, node, handlers };
}

/* ---------------- subject bars ---------------- */

function SubjectBars({ model }: { model: PlayerModel }) {
  const { ref, node, handlers } = useTip();
  const [table, setTable] = useState(false);
  return (
    <figure className="card viz" ref={ref} style={{ marginInline: 0, marginBottom: 0 }}>
      <div className="row spread">
        <h2 style={{ margin: 0 }}>Mastery by subject</h2>
        <button className="btn btn-small btn-ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <figcaption className="small muted" style={{ margin: '0.25rem 0 0.75rem' }}>
        Estimated chance of answering a typical regional toss-up (rounds 1–10) correctly, from your first answer to each question, adjusted for
        how hard it was.
      </figcaption>
      {table ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th className="num">Mastery</th>
                <th className="num">Answers</th>
                <th className="num">Right</th>
                <th className="num">Median buzz</th>
              </tr>
            </thead>
            <tbody>
              {CORE_SUBJECTS.map((s) => {
                const line = model.subjects[s];
                return (
                  <tr key={s}>
                    <td>{SUBJECT_LABELS[s]}</td>
                    <td className="num">{line ? percent(line.p, 1) : '–'}</td>
                    <td className="num">{line?.n ?? 0}</td>
                    <td className="num">{line ? percent(line.correct, line.n) : '–'}</td>
                    <td className="num">{seconds(line?.medianBuzzMs ?? null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="hbar-chart">
            {CORE_SUBJECTS.map((s) => {
              const line = model.subjects[s];
              const width = line ? line.p * 100 : 0;
              const label = line
                ? `${SUBJECT_LABELS[s]}: ${percent(line.p, 1)} mastery from ${line.n} answer${line.n === 1 ? '' : 's'}, ${line.correct} right`
                : `${SUBJECT_LABELS[s]}: no answers yet`;
              return (
                <div key={s} style={{ display: 'contents' }}>
                  <span className="hbar-label">{SUBJECT_LABELS[s]}</span>
                  <div className="hbar-track">
                    <div className="hbar-area">
                      {line ? (
                        <>
                          <div
                            className="hbar"
                            style={{ width: `${width}%` }}
                            tabIndex={0}
                            role="img"
                            aria-label={label}
                            {...handlers(
                              <>
                                <strong>{percent(line.p, 1)}</strong>
                                {SUBJECT_LABELS[s]} · {line.n} answer{line.n === 1 ? '' : 's'}, {line.correct} right · median buzz {seconds(line.medianBuzzMs)}
                              </>,
                            )}
                          />
                          <span className="hbar-value" style={{ left: `${width}%` }}>
                            {percent(line.p, 1)}
                            {line.n < MIN_ANSWERS && <span className="muted"> · {line.n} answer{line.n === 1 ? '' : 's'}</span>}
                          </span>
                        </>
                      ) : (
                        <span className="hbar-value muted" style={{ left: 0 }}>
                          No answers yet
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <span />
            <div className="hbar-axis" aria-hidden="true">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>
          {node}
        </>
      )}
    </figure>
  );
}

/* ---------------- topic heat map ---------------- */

function TopicHeatMap({ model, due }: { model: PlayerModel; due: Map<string, number> }) {
  const { ref, node, handlers } = useTip();
  const [table, setTable] = useState(false);
  const rows = CORE_SUBJECTS.map((s) => ({ subject: s, topics: topicsForSubject(s) }));
  return (
    <figure className="card viz" ref={ref} style={{ marginInline: 0, marginBottom: 0 }}>
      <div className="row spread">
        <h2 style={{ margin: 0 }}>Subject map</h2>
        <button className="btn btn-small btn-ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Show map' : 'Show table'}
        </button>
      </div>
      <figcaption className="small muted" style={{ margin: '0.25rem 0 0' }}>
        Each topic colored by mastery, once you have answered at least {MIN_ANSWERS} of its questions. Darker is stronger. Due reviews are marked.
      </figcaption>
      {table ? (
        <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Topic</th>
                <th className="num">Mastery</th>
                <th className="num">Answers</th>
                <th className="num">Right</th>
                <th className="num">Median buzz</th>
                <th className="num">Due reviews</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap(({ subject, topics }) =>
                topics.map((t) => {
                  const line = model.topics[t.id];
                  return (
                    <tr key={t.id}>
                      <td>{SUBJECT_LABELS[subject]}</td>
                      <td>{t.name}</td>
                      <td className="num">{line && line.n >= MIN_ANSWERS ? percent(line.p, 1) : '–'}</td>
                      <td className="num">{line?.n ?? 0}</td>
                      <td className="num">{line ? line.correct : 0}</td>
                      <td className="num">{seconds(line?.medianBuzzMs ?? null)}</td>
                      <td className="num">{due.get(t.id) ?? 0}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="scale-legend" aria-label="Color scale">
            {BINS.map((b, i) => (
              <span key={b.label}>
                <i style={{ background: `var(--viz-seq-${i + 1})` }} aria-hidden="true" />
                {b.label}
              </span>
            ))}
            <span>
              <i style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }} aria-hidden="true" />
              Fewer than {MIN_ANSWERS} answers
            </span>
          </div>
          {rows.map(({ subject, topics }) => (
            <section key={subject} className="heat-subject" aria-label={SUBJECT_LABELS[subject]}>
              <h3>{SUBJECT_LABELS[subject]}</h3>
              <div className="heat-grid">
                {topics.map((t) => {
                  const line = model.topics[t.id];
                  const bin = binOf(line);
                  const dueHere = due.get(t.id) ?? 0;
                  const summary =
                    line && line.n >= MIN_ANSWERS
                      ? `${percent(line.p, 1)} mastery · ${line.n} answers, ${line.correct} right · median buzz ${seconds(line.medianBuzzMs)}`
                      : `${line?.n ?? 0} answer${line?.n === 1 ? '' : 's'} so far`;
                  return (
                    <div
                      key={t.id}
                      className="heat-cell"
                      data-bin={bin}
                      tabIndex={0}
                      role="img"
                      aria-label={`${t.name}: ${summary}${dueHere ? `, ${dueHere} due for review` : ''}`}
                      {...handlers(
                        <>
                          <strong>{line && line.n >= MIN_ANSWERS ? percent(line.p, 1) : 'Not enough answers'}</strong>
                          {t.name} · {summary}
                          {dueHere > 0 && ` · ${dueHere} due for review`}
                        </>,
                      )}
                    >
                      <span>{t.name}</span>
                      {dueHere > 0 && <span className="due">{dueHere} due</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {node}
        </>
      )}
    </figure>
  );
}

/* ---------------- activity ---------------- */

interface DayCount {
  start: number;
  answers: number;
  right: number;
  reviews: number;
}

/** Every practice and game answer (not just first answers) and every review, per practice day. */
function activity(data: AppData, playerId: string, answers: Observation[], days: number, now: number): DayCount[] {
  const end = endOfPracticeDay(now);
  const out: DayCount[] = Array.from({ length: days }, (_, i) => ({ start: end - (days - i) * DAY_MS, answers: 0, right: 0, reviews: 0 }));
  const slot = (t: number) => Math.floor((t - (end - days * DAY_MS)) / DAY_MS);
  for (const o of answers) {
    const i = slot(o.t);
    if (i >= 0 && i < days) {
      out[i].answers += 1;
      if (o.correct) out[i].right += 1;
    }
  }
  for (const c of Object.values(data.cards)) {
    if (c.playerId !== playerId) continue;
    for (const e of c.log) {
      if (e.via !== 'review') continue;
      const i = slot(e.t);
      if (i >= 0 && i < days) out[i].reviews += 1;
    }
  }
  return out;
}

const dayLabel = (t: number) => new Date(t + DAY_MS / 2).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function ActivityChart({ days }: { days: DayCount[] }) {
  const { ref, node, handlers } = useTip();
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...days.map((d) => d.answers + d.reviews));
  const top = max <= 10 ? 10 : Math.ceil(max / 10) * 10;
  const active = days.filter((d) => d.answers + d.reviews > 0).length;
  return (
    <figure className="card viz" ref={ref} style={{ marginInline: 0, marginBottom: 0 }}>
      <div className="row spread">
        <h2 style={{ margin: 0 }}>Questions per day</h2>
        <button className="btn btn-small btn-ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <figcaption className="small muted" style={{ margin: '0.25rem 0 0.75rem' }}>
        Practice answers and reviews over the last {days.length} days · practiced on {active} of them.
      </figcaption>
      {table ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">Answered</th>
                <th className="num">Right</th>
                <th className="num">Reviews</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.start}>
                  <td>{dayLabel(d.start)}</td>
                  <td className="num">{d.answers}</td>
                  <td className="num">{d.right}</td>
                  <td className="num">{d.reviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="row" style={{ alignItems: 'stretch', gap: '0.5rem', flexWrap: 'nowrap' }}>
            <div className="cols-axis" style={{ flexDirection: 'column-reverse', justifyContent: 'space-between', height: 120 }} aria-hidden="true">
              <span>0</span>
              <span>{top / 2}</span>
              <span>{top}</span>
            </div>
            <div className="cols" style={{ flex: 1 }}>
              {days.map((d) => {
                const total = d.answers + d.reviews;
                const text = `${dayLabel(d.start)}: ${d.answers} answered (${d.right} right), ${d.reviews} reviews`;
                return (
                  <div
                    key={d.start}
                    className="col"
                    tabIndex={0}
                    role="img"
                    aria-label={text}
                    {...handlers(
                      <>
                        <strong>{total}</strong>
                        {dayLabel(d.start)} · {d.answers} answered ({d.right} right) · {d.reviews} reviews
                      </>,
                    )}
                  >
                    {total > 0 && <div style={{ height: `${(total / top) * 100}%` }} />}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="cols-axis" style={{ marginLeft: '1.6rem' }} aria-hidden="true">
            <span>{dayLabel(days[0].start)}</span>
            <span>Today</span>
          </div>
          {node}
        </>
      )}
    </figure>
  );
}

/* ---------------- page ---------------- */

export function ProgressPage() {
  const data = useData();
  const player = useCurrentPlayer();
  const catalog = useCatalog();
  const catalogMap = useMemo(() => (catalog.data ? catalogById(catalog.data) : null), [catalog.data]);
  const model = usePlayerModel(data, player?.id ?? null, catalogMap);

  if (!data.team) {
    return (
      <div className="container narrow">
        <PageHeader title="My progress" />
        <Notice>
          Set up your team first on the <a href={href('/team')}>Team</a> page.
        </Notice>
      </div>
    );
  }

  const now = Date.now();
  const summary = player ? playerCardSummary(data, player.id, now) : null;
  const obs = model?.observations ?? [];
  const recent = obs.filter((o) => o.t >= now - 30 * DAY_MS);
  const buzzes = obs.filter((o) => o.correct && !o.interrupt && o.kind === 'tossup' && o.latencyMs !== null).map((o) => o.latencyMs!);
  const medianBuzz = buzzes.length ? [...buzzes].sort((a, b) => a - b)[Math.floor(buzzes.length / 2)] : null;

  // Due reviews per topic, for the map.
  const due = new Map<string, number>();
  if (player && catalogMap) {
    const disputed = disputedQuestions(data);
    const end = endOfPracticeDay(now);
    for (const c of Object.values(data.cards)) {
      if (c.playerId !== player.id || c.fsrs.due >= end || disputed.has(c.questionId)) continue;
      const topic = catalogMap.get(c.questionId)?.[2];
      if (topic) due.set(topic, (due.get(topic) ?? 0) + 1);
    }
  }

  // Focus next: frequent topics with enough answers where mastery is lowest.
  const focus =
    model && catalog.data
      ? Object.entries(model.topics)
          .filter(([, line]) => line.n >= MIN_ANSWERS && line.p < 0.65)
          .map(([id, line]) => ({ id, line, score: Math.sqrt(catalog.data!.topicCounts[id] ?? 0) * (1 - line.p) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
      : [];

  return (
    <div className="container">
      <PageHeader title="My progress">
        <p>
          How you are doing by subject and topic, from your practice rounds, drills and Reader console games. Reviews are tracked separately: they
          show memory of a question you have already seen.
        </p>
      </PageHeader>
      <PlayerSwitch label="Progress for" />
      {!player && <Notice>Choose your name to see your progress.</Notice>}
      {player && model && summary && (
        <div className="stack" style={{ marginTop: '1rem' }}>
          <div className="grid">
            <Stat label="Questions answered" value={obs.length.toLocaleString()} hint="First answers in practice and games" />
            <Stat label="Right in the last 30 days" value={percent(recent.filter((o) => o.correct).length, recent.length)} hint={`${recent.length} answers`} />
            <Stat label="Median buzz on right answers" value={seconds(medianBuzz)} hint="After the reading ends" />
            <Stat
              label="Review queue"
              value={`${summary.dueToday} due`}
              hint={`${summary.total} question${summary.total === 1 ? '' : 's'} in all${summary.mature ? `, ${summary.mature} remembered for 3+ weeks` : ''}`}
            />
          </div>
          {obs.length === 0 ? (
            <Notice>
              No answers yet. Start with today's plan on the <a href={href('/today')}>Today</a> page, a <a href={href('/try')}>practice round</a>, or a
              game in the <a href={href('/reader')}>Reader console</a>.
            </Notice>
          ) : (
            <>
              {focus.length > 0 && (
                <section className="card">
                  <h2>Focus next</h2>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {focus.map((f) => {
                      const subject = topicById(f.id)?.subject;
                      return (
                        <li key={f.id}>
                          <a href={href(`/try?mode=subject&subject=${subject ?? 'biology'}&topic=${encodeURIComponent(f.id)}&count=8`)}>{topicName(f.id)}</a>{' '}
                          <span className="muted small">
                            {percent(f.line.p, 1)} mastery from {f.line.n} answers · {catalog.data!.topicCounts[f.id] ?? 0} questions in the library
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              <SubjectBars model={model} />
              {catalog.data ? <TopicHeatMap model={model} due={due} /> : <p className="muted small">Loading the subject map…</p>}
              <ActivityChart days={activity(data, player.id, playerObservations(data, player.id, null), 28, now)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
