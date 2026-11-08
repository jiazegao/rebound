import { useEffect, useMemo, useRef, useState } from 'react';
import { AiExplain } from '../components/AiExplain';
import { AnswerBox, Choices, Concepts, ImportNotes, QuestionMeta, RichText } from '../components/QuestionView';
import { Countdown, LoadError, Loading, Notice, PageHeader, Stat, useTicker } from '../components/ui';
import { Verdict } from '../components/Verdict';
import { judgeAnswer, type JudgeResult } from '../core/judge/judge';
import {
  cardStage,
  gradeCard,
  LEARNED_DAYS,
  newCardsPerDay,
  Rating,
  REASON_TEXT,
  reviewGrade,
  reviewTiming,
  type CardEvent,
  type Grade,
  type ReviewCard,
  type ReviewTiming,
} from '../core/review';
import { SUBJECT_LABELS, type Question } from '../core/schema';
import { dateText } from '../lib/format';
import { playerCardSummary, playerDue } from '../lib/learning';
import { loadQuestions } from '../lib/library';
import { buildReading } from '../lib/reading';
import { href } from '../lib/router';
import { completeAssignment, completePlanItem, getData, recordReview, removeFromReview, retentionAt, useCurrentPlayer, useData } from '../lib/store';

const DAY_MS = 86_400_000;
/** After buzzing in a review, the same answer timer as solo practice: start within 2 s, finish within 5 s. */
const ANSWER_START_MS = 2_000;
const ANSWER_TOTAL_MS = 5_000;
const DEFAULT_SESSION = 20;

const GRADE_TEXT: Record<Grade, string> = {
  [Rating.Again]: 'Missed',
  [Rating.Hard]: 'Right, but slow',
  [Rating.Good]: 'Good',
  [Rating.Easy]: 'Easy',
};

/** "tomorrow", "in 4 days", "in 3 weeks"… */
function untilText(due: number, now: number): string {
  const days = Math.round((due - now) / DAY_MS);
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

interface QueueItem {
  card: ReviewCard;
  q: Question;
  where: string;
}

/* ---------------- the timer bar ---------------- */

function ReviewClock({ timing, elapsed, kind }: { timing: ReviewTiming; elapsed: number; kind: Question['kind'] }) {
  const total = timing.limitMs;
  const zones =
    kind === 'tossup'
      ? [
          { name: 'Reading: buzz now for Easy', until: timing.easyMs, cls: 'easy' },
          { name: 'Buzz window', until: timing.goodMs, cls: 'good' },
          { name: 'Slow', until: timing.limitMs, cls: 'slow' },
        ]
      : [
          { name: 'Fast', until: timing.easyMs, cls: 'easy' },
          { name: 'Within the 20 s bonus time', until: timing.goodMs, cls: 'good' },
          { name: 'Over time', until: timing.limitMs, cls: 'slow' },
        ];
  const current = zones.find((z) => elapsed < z.until) ?? zones[zones.length - 1];
  let from = 0;
  return (
    <div>
      <div className="row spread small">
        <span>{current.name}</span>
        <span className="nowrap">{(elapsed / 1000).toFixed(1)} s</span>
      </div>
      <div className="review-clock" role="progressbar" aria-label="Review time" aria-valuemin={0} aria-valuemax={Math.round(total / 1000)} aria-valuenow={Math.round(elapsed / 1000)}>
        {zones.map((z) => {
          const width = ((z.until - from) / total) * 100;
          from = z.until;
          return <div key={z.cls} className={`zone ${z.cls}`} style={{ width: `${width}%` }} />;
        })}
        <div className="needle" style={{ left: `${Math.min(100, (elapsed / total) * 100)}%` }} />
      </div>
    </div>
  );
}

/* ---------------- one review ---------------- */

type Phase =
  | { kind: 'question'; shownAt: number }
  | { kind: 'answering'; shownAt: number; buzzMs: number; buzzedAt: number; typingAt: number | null }
  | { kind: 'result'; ms: number | null; response: string; result: JudgeResult | null; decided: boolean | null; note: string | null };

function ReviewItem({
  item,
  position,
  total,
  answerTimer,
  onDone,
  onQuit,
}: {
  item: QueueItem;
  position: number;
  total: number;
  answerTimer: boolean;
  onDone: (event: CardEvent) => void;
  onQuit: () => void;
}) {
  const { card, q } = item;
  const timing = useMemo(() => reviewTiming(q.kind, buildReading(q).totalUnits), [q]);
  const [phase, setPhase] = useState<Phase>(() => ({ kind: 'question', shownAt: Date.now() }));
  const [response, setResponse] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const now = useTicker(phase.kind !== 'result', 50);

  useEffect(() => {
    if (q.kind === 'bonus') inputRef.current?.focus();
  }, [q.kind]);

  const finish = (text: string, ms: number | null, note: string | null = null) => {
    const result = text.trim() ? judgeAnswer(q, text) : null;
    const decided = !result ? false : result.verdict === 'review' ? null : result.verdict === 'correct';
    setPhase({ kind: 'result', ms, response: text, result, decided, note });
  };

  const buzz = () => {
    if (phase.kind !== 'question' || q.kind !== 'tossup') return;
    const t = Date.now();
    setPhase({ kind: 'answering', shownAt: phase.shownAt, buzzMs: t - phase.shownAt, buzzedAt: t, typingAt: null });
    setResponse('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const giveUp = () => {
    if (phase.kind === 'result') return;
    setPhase({ kind: 'result', ms: null, response: '', result: null, decided: false, note: 'You chose to see the answer.' });
  };

  const submit = () => {
    if (phase.kind === 'answering') finish(response, phase.buzzMs);
    else if (phase.kind === 'question' && q.kind === 'bonus') finish(response, Date.now() - phase.shownAt);
  };

  // Time limits.
  useEffect(() => {
    if (phase.kind === 'question' && now - phase.shownAt >= timing.limitMs) {
      if (q.kind === 'bonus' && response.trim()) finish(response, timing.limitMs, 'Time: your answer was taken when the time ran out.');
      else setPhase({ kind: 'result', ms: null, response: '', result: null, decided: false, note: q.kind === 'tossup' ? 'No buzz in time.' : 'No answer in time.' });
    } else if (phase.kind === 'answering' && answerTimer) {
      const elapsed = now - phase.buzzedAt;
      if (phase.typingAt === null && !response.trim() && elapsed >= ANSWER_START_MS) {
        setPhase({ kind: 'result', ms: phase.buzzMs, response: '', result: null, decided: false, note: 'Stall: start answering within 2 seconds of buzzing.' });
      } else if (elapsed >= ANSWER_TOTAL_MS) finish(response, phase.buzzMs, 'Time: your answer was taken 5 seconds after the buzz.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, phase]);

  const final = phase.kind === 'result' ? phase.decided : null;
  const grade = phase.kind === 'result' && final !== null ? reviewGrade(final, phase.ms, timing) : null;
  const event: CardEvent | null =
    phase.kind === 'result' && grade !== null ? { t: Date.now(), grade, via: 'review', correct: final === true, ms: phase.ms } : null;
  const preview = useMemo(() => (event ? gradeCard(card, event, retentionAt(getData(), event.t)) : null), [card, event?.grade]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = (right: boolean) => {
    if (phase.kind !== 'result' || !phase.result) return;
    setPhase({ ...phase, decided: right });
  };

  const next = () => {
    if (event) onDone(event);
  };

  // Keyboard: Space buzzes and continues; Y/N decide; Escape shows the answer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      const key = e.key.toLowerCase();
      if (key === 'escape' && phase.kind !== 'result') {
        e.preventDefault();
        giveUp();
        return;
      }
      if (typing) return;
      if (key === ' ' && phase.kind === 'question' && q.kind === 'tossup') {
        e.preventDefault();
        buzz();
      } else if ((key === ' ' || key === 'enter') && phase.kind === 'result' && event) {
        if (target?.tagName === 'BUTTON' && key === 'enter') return;
        e.preventDefault();
        next();
      } else if ((key === 'y' || key === 'n') && phase.kind === 'result' && phase.result && phase.decided === null) {
        decide(key === 'y');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const elapsed = phase.kind === 'result' ? 0 : now - phase.shownAt;

  return (
    <div className="container narrow">
      <div className="row spread" style={{ marginBottom: '0.5rem' }}>
        <span className="muted small">
          Review {position} of {total} · {REASON_TEXT[card.reason]}
          {cardStage(card) === 'new' && ' · first review'}
        </span>
        <button className="btn btn-small btn-ghost" onClick={onQuit}>
          Stop
        </button>
      </div>
      <article className="question">
        <QuestionMeta q={q} />
        <p className="stem">
          <RichText text={q.stem} />
        </p>
        <Choices q={q} />
        {phase.kind === 'result' && <ImportNotes q={q} />}
      </article>

      <div className="stack" style={{ marginTop: '1rem' }}>
        {phase.kind === 'question' && <ReviewClock timing={timing} elapsed={elapsed} kind={q.kind} />}
        {phase.kind === 'question' && q.kind === 'tossup' && (
          <div className="row">
            <button className="btn btn-primary btn-big" onClick={buzz}>
              Buzz <span className="kbd">Space</span>
            </button>
            <button className="btn btn-ghost" onClick={giveUp}>
              I don't know <span className="kbd">Esc</span>
            </button>
          </div>
        )}
        {(phase.kind === 'answering' || (phase.kind === 'question' && q.kind === 'bonus')) && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {phase.kind === 'answering' &&
              answerTimer &&
              (phase.typingAt === null ? (
                <Countdown openedAt={phase.buzzedAt} seconds={ANSWER_START_MS / 1000} now={now} label="Start typing" />
              ) : (
                <Countdown openedAt={phase.buzzedAt} seconds={ANSWER_TOTAL_MS / 1000} now={now} label="Finish your answer" />
              ))}
            <label htmlFor="review-answer" className="label">
              {q.kind === 'bonus' ? 'Your answer (the clock is running)' : 'Your answer'}
            </label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                id="review-answer"
                ref={inputRef}
                className="big-input"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={response}
                onChange={(e) => {
                  setResponse(e.target.value);
                  if (phase.kind === 'answering' && phase.typingAt === null && e.target.value.trim()) setPhase({ ...phase, typingAt: Date.now() });
                }}
              />
              <button className="btn btn-primary" type="submit">
                Answer
              </button>
            </div>
            {q.kind === 'bonus' && (
              <div>
                <button type="button" className="btn btn-ghost btn-small" onClick={giveUp}>
                  I don't know <span className="kbd">Esc</span>
                </button>
              </div>
            )}
          </form>
        )}
        {phase.kind === 'result' && (
          <>
            {phase.response && <p className="small muted">You answered: “{phase.response}”</p>}
            {phase.note && <p className="small">{phase.note}</p>}
            {phase.result ? <Verdict result={phase.result} decided={phase.decided} onDecide={decide} /> : <div className="verdict verdict-incorrect">Not this time.</div>}
            <AnswerBox q={q} />
            <AiExplain q={q} />
            <Concepts q={q} />
            {grade !== null && (
              <p className="small">
                <strong>{GRADE_TEXT[grade]}</strong>
                {phase.ms !== null && grade !== Rating.Again && ` · ${q.kind === 'tossup' ? 'buzzed' : 'answered'} after ${(phase.ms / 1000).toFixed(1)} s`}
                {preview !== null &&
                  (cardStage(preview) === 'learned' ? ' · learned: it leaves your review queue' : ` · back ${untilText(preview.fsrs.due, Date.now())}`)}
              </p>
            )}
            {event && (
              <button className="btn btn-primary btn-big" onClick={next}>
                {position >= total ? 'Finish' : 'Next'} <span className="kbd">Space</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** "Set 17 · Round 1 · Toss-up 5" for "doe-hs-17-r01-t05". */
function questionLabel(id: string): string {
  const m = /^doe-hs-(\d+)-r(\d+)([a-z]*)-([tb])(\d+)$/i.exec(id);
  if (!m) return id;
  return `Set ${Number(m[1])} · Round ${Number(m[2])}${m[3].toUpperCase()} · ${m[4] === 't' ? 'Toss-up' : 'Bonus'} ${Number(m[5])}`;
}

/* ---------------- the page ---------------- */

interface SessionResult {
  cardId: string;
  grade: Grade;
}

function CardList({ playerId }: { playerId: string }) {
  const data = useData();
  const cards = Object.values(data.cards)
    .filter((c) => c.playerId === playerId)
    .sort((a, b) => a.fsrs.due - b.fsrs.due);
  const disputed = new Set(data.reports.filter((r) => r.status === 'open').map((r) => r.questionId));
  if (cards.length === 0) return null;
  const now = Date.now();
  return (
    <details className="card" style={{ marginTop: '1.5rem' }}>
      <summary>
        <strong>All {cards.length} review questions</strong>
      </summary>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Subject</th>
              <th>Why</th>
              <th>Status</th>
              <th>Reviews</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => {
              const roundId = c.questionId.replace(/-[tb]\d+$/, '');
              const setId = roundId.replace(/-r\d+[a-z]*$/i, '');
              return (
                <tr key={c.id}>
                  <td>
                    <a href={href(`/library/${setId}/${roundId}`)}>{questionLabel(c.questionId)}</a>
                  </td>
                  <td>{SUBJECT_LABELS[c.subject]}</td>
                  <td>{REASON_TEXT[c.reason]}</td>
                  <td>
                    {disputed.has(c.questionId)
                      ? 'Paused: problem reported'
                      : cardStage(c) === 'learned'
                        ? 'Learned'
                        : cardStage(c) === 'new'
                          ? 'New, waiting'
                          : c.fsrs.due <= now
                            ? 'Due'
                            : `Next: ${dateText(new Date(c.fsrs.due).toISOString())}`}
                  </td>
                  <td>{c.log.filter((e) => e.via === 'review').length}</td>
                  <td>
                    <button className="btn btn-small btn-ghost" onClick={() => removeFromReview(c.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * The review queue at a glance, at the top of Learn: what is due, and a button that starts the review at once (the
 * Review page with `start=1`). Signed out, it says what reviews are.
 */
export function ReviewAtAGlance() {
  const data = useData();
  const player = useCurrentPlayer();
  const summary = player ? playerCardSummary(data, player.id) : null;
  return (
    <section aria-labelledby="review-glance" style={{ marginBottom: '2rem' }}>
      <div className="row spread">
        <h2 id="review-glance" style={{ margin: 0 }}>
          Review
        </h2>
        {summary && <a href={href('/review')}>Your review queue</a>}
      </div>
      {!summary ? (
        <p className="muted">
          <a href={href('/signin')}>Sign in</a>, and the questions you miss or answer slowly come back here as timed reviews.
        </p>
      ) : (
        <>
          <div className="grid" style={{ marginTop: '0.75rem' }}>
            <Stat label="Due today" value={summary.dueToday} />
            <Stat label="Reviewed today" value={summary.reviewedToday} />
            <Stat label="In your queue" value={summary.total} />
          </div>
          <div className="row" style={{ marginTop: '0.75rem' }}>
            {summary.dueToday > 0 ? (
              <a className="btn btn-primary" href={href('/review?start=1')}>
                {summary.dueToday > DEFAULT_SESSION ? `Review ${DEFAULT_SESSION} of ${summary.dueToday}` : `Start review (${summary.dueToday})`}
              </a>
            ) : (
              <span className="muted">
                {summary.total === 0 ? 'Nothing to review yet: misses and slow answers from practice and games land here.' : 'All caught up for today.'}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function ReviewPage({ query }: { query: URLSearchParams }) {
  const data = useData();
  const player = useCurrentPlayer();
  const [stage, setStage] = useState<'overview' | 'loading' | 'session' | 'done'>('overview');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [position, setPosition] = useState(0);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const limit = Math.max(1, Number(query.get('limit')) || DEFAULT_SESSION);
  const planItem = query.get('plan');
  const planDay = query.get('day');
  const assignment = query.get('assignment');

  // An assignment to clear due reviews is done once nothing is due.
  useEffect(() => {
    if (!assignment || !player || stage === 'session') return;
    if (playerCardSummary(getData(), player.id).dueToday === 0) completeAssignment(assignment, player.id);
  }, [assignment, player, stage, data.cards]);

  const start = async () => {
    if (!player) return;
    setStage('loading');
    setError(null);
    try {
      const due = playerDue(getData(), player.id).slice(0, limit + 5);
      const found = await loadQuestions(due.map((c) => c.questionId));
      const items: QueueItem[] = [];
      for (const card of due) {
        const loc = found.get(card.questionId);
        if (!loc || !loc.question.answer.trim() || loc.question.flags?.includes('choices-missing')) continue;
        items.push({ card, q: loc.question, where: `${loc.set.title}, ${loc.round.label}` });
      }
      if (items.length === 0) throw new Error('None of the due questions could be loaded.');
      setQueue(items.slice(0, limit));
      setPosition(0);
      setResults([]);
      setStage('session');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setStage('overview');
    }
  };

  // Opened by Start review on Learn: begin at once. The flag leaves the address, so going back or reloading shows the
  // overview instead of starting again.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (query.get('start') !== '1' || autoStarted.current || stage !== 'overview' || !player) return;
    if (playerCardSummary(getData(), player.id).dueToday === 0) return;
    autoStarted.current = true;
    const rest = new URLSearchParams(query);
    rest.delete('start');
    history.replaceState(null, '', `#/review${rest.size ? `?${rest}` : ''}`);
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, player, stage, data.cards]);

  if (stage === 'session' && player && queue[position]) {
    const item = queue[position];
    return (
      <ReviewItem
        key={item.card.id}
        item={item}
        position={position + 1}
        total={queue.length}
        answerTimer={data.settings.answerTimer}
        onQuit={() => setStage(results.length > 0 ? 'done' : 'overview')}
        onDone={(event) => {
          recordReview(item.card.id, event);
          const nextResults = [...results, { cardId: item.card.id, grade: event.grade }];
          setResults(nextResults);
          if (position + 1 >= queue.length) {
            setStage('done');
            if (planItem && planDay) completePlanItem(player.id, planDay, planItem);
            if (assignment && playerDue(getData(), player.id).length === 0) completeAssignment(assignment, player.id);
          } else setPosition(position + 1);
        }}
      />
    );
  }

  const summary = player ? playerCardSummary(data, player.id) : null;
  const now = Date.now();

  return (
    <div className="container narrow">
      <PageHeader title="Review">
        <p>Questions you missed, gave away on an interrupt, or answered too slowly come back here, spaced out over days and weeks. Every review is timed.</p>
        <details className="small">
          <summary>How review works</summary>
          <p>
            Rebound schedules reviews with FSRS, the scheduler Anki uses: soon after a miss, then days and weeks apart. The question appears in
            full and the clock starts. Buzz while you are still reading for "Easy", within the 5-second window after that for "Good"; a slow
            right answer counts as "Hard" and comes back sooner.
          </p>
          <p>
            A few new questions join each day ({newCardsPerDay(data.settings.dailyMinutes)} with a {data.settings.dailyMinutes}-minute plan):
            questions you added, wrong interrupts and your own subjects first. New questions left waiting for two weeks are dropped. Once a
            right answer earns a gap of {LEARNED_DAYS} days, the question is learned and leaves the queue; missing it again in a drill or a
            game brings it back.
          </p>
        </details>
      </PageHeader>
      {error && <LoadError error={error} />}
      {stage === 'loading' && <Loading what="Loading your review questions" />}

      {stage === 'done' && (
        <Notice kind="good">
          Reviewed {results.length}: {results.filter((r) => r.grade !== Rating.Again).length} right
          {results.some((r) => r.grade === Rating.Hard) && `, ${results.filter((r) => r.grade === Rating.Hard).length} slow`}.{' '}
          {(planItem || assignment) && <a href={href('/today')}>Back to today's plan</a>}
        </Notice>
      )}

      {player && summary && stage !== 'loading' && (
        <>
          <div className="grid" style={{ marginTop: '1rem' }}>
            <Stat label="Due today" value={summary.dueToday} hint={summary.dueToday === 0 && summary.nextDue ? `Next: ${untilText(summary.nextDue, now)}` : undefined} />
            <Stat label="Reviewed today" value={summary.reviewedToday} />
            <Stat
              label="In your queue"
              value={summary.total}
              hint={[summary.waiting > 0 ? `${summary.waiting} new ones waiting` : '', summary.learned > 0 ? `${summary.learned} learned` : '']
                .filter(Boolean)
                .join(' · ') || undefined}
            />
          </div>
          {summary.suspended > 0 && (
            <p className="small muted">
              {summary.suspended} paused while your problem report on the question is open (see <a href={href('/account')}>Account</a>).
            </p>
          )}
          <div className="row" style={{ marginTop: '1rem' }}>
            {summary.dueToday > 0 ? (
              <button className="btn btn-primary btn-big" onClick={() => void start()}>
                {summary.dueToday > limit ? `Review ${limit} of ${summary.dueToday}` : `Start review (${summary.dueToday})`}
              </button>
            ) : (
              <Notice>
                {summary.total === 0 ? (
                  <>
                    Nothing to review yet. Play a <a href={href('/try')}>practice round</a> or a game in the <a href={href('/reader')}>Reader console</a>:
                    misses and slow answers land here. You can also add any question from the <a href={href('/library')}>Library</a>.
                  </>
                ) : (
                  <>
                    All caught up for today.
                    {summary.startingTomorrow > 0 &&
                      ` ${summary.startingTomorrow} question${summary.startingTomorrow === 1 ? '' : 's'} from today's practice start${summary.startingTomorrow === 1 ? 's' : ''} tomorrow.`}
                  </>
                )}
              </Notice>
            )}
          </div>
          <CardList playerId={player.id} />
        </>
      )}
    </div>
  );
}
