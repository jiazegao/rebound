import { useEffect, useMemo } from 'react';
import { PageHeader } from '../components/ui';
import { MINUTES_PER_REVIEW, PLAN_LENGTHS, type DayPlan, type PlanItem } from '../core/plan';
import { daysUntil, PHASE_TEXT, practiceDay, seasonPhase } from '../core/review';
import { topicName } from '../core/taxonomy';
import type { Player } from '../core/schema';
import { dateTimeText } from '../lib/format';
import { planFor, playerCardSummary, playerDue, usePlayerModel } from '../lib/learning';
import { catalogById, useCatalog, useConceptIndex } from '../lib/library';
import { assignmentMinutes, openAssignments, type OpenAssignment } from '../core/assignments';
import type { Assignment } from '../core/schema';
import { href } from '../lib/router';
import { isLeader } from '../core/accounts';
import { useSession } from '../lib/cloud';
import { savePlan, updateSettings, useCurrentPlayer, useData } from '../lib/store';

function itemLink(item: PlanItem, plan: DayPlan, reviewCards: number): string {
  const tail = `plan=${encodeURIComponent(item.id)}&day=${plan.day}`;
  if (item.kind === 'review') return `/review?${tail}&limit=${reviewCards}`;
  if (item.kind === 'learn') return `/learn/${encodeURIComponent(item.conceptId!)}?${tail}`;
  if (item.kind === 'mixed') return `/try?mode=mixed&count=${item.count}&${tail}&go=1`;
  if (item.kind === 'visual') return `/visual?count=${item.count}&${tail}&go=1`;
  const topic = item.topic ? `&topic=${encodeURIComponent(item.topic)}` : '';
  return `/try?mode=subject&subject=${item.subject}${topic}&count=${item.count}&${tail}&go=1`;
}

/** Where an assignment's Start button goes; finishing there ticks it off. */
export function assignmentLink(a: Assignment): string {
  const tail = `assignment=${encodeURIComponent(a.id)}`;
  if (a.kind === 'drill') {
    const topic = a.topic ? `&topic=${encodeURIComponent(a.topic)}` : '';
    return `/try?mode=subject&subject=${a.subject ?? 'biology'}${topic}&count=${a.count ?? 8}&${tail}&go=1`;
  }
  if (a.kind === 'packet') return `/try?packet=${encodeURIComponent(a.packetId ?? '')}&${tail}&go=1`;
  if (a.kind === 'concept') return `/learn/${encodeURIComponent(a.conceptId ?? '')}?${tail}`;
  return `/review?${tail}`;
}

function AssignedItem({ open, by }: { open: OpenAssignment; by: string }) {
  const { assignment: a, state, days } = open;
  const when = state === 'overdue' ? `overdue by ${-days} day${days === -1 ? '' : 's'}` : state === 'today' ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'}`;
  return (
    <li className="plan-item card">
      <div className="plan-main">
        <h3>{a.title}</h3>
        <p className="why">
          <span className="why-label">Why this?</span> Assigned by {by}, {when}.{a.note ? ` ${a.note}` : ''}
        </p>
      </div>
      <div className="plan-side">
        <span className="small muted nowrap">{assignmentMinutes(a)} min</span>
        <a className="btn btn-primary" href={href(assignmentLink(a))}>
          Start
        </a>
      </div>
    </li>
  );
}

function PlanList({ player }: { player: Player }) {
  const data = useData();
  const catalog = useCatalog();
  const conceptIndex = useConceptIndex();
  const catalogMap = useMemo(() => (catalog.data ? catalogById(catalog.data) : null), [catalog.data]);
  const model = usePlayerModel(data, player.id, catalogMap);
  const minutes = data.settings.dailyMinutes;
  const ready = !catalog.loading && !conceptIndex.loading;
  const result = useMemo(
    () =>
      ready
        ? planFor(data, player, minutes, model, catalog.data ? { rows: catalog.data.questions, topicCounts: catalog.data.topicCounts } : null, Date.now(), conceptIndex.data ?? null)
        : null,
    // The plan only needs rebuilding when the player, day, length, catalog or saved plan changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, player, minutes, catalog.data, conceptIndex.data, data.plans[player.id], model],
  );

  useEffect(() => {
    if (result?.changed) savePlan(result.plan);
  }, [result]);

  if (!result) return <p className="muted">Preparing your plan…</p>;
  const plan = result.plan;
  const due = playerDue(data, player.id).length;
  const tomorrow = due === 0 ? playerCardSummary(data, player.id).startingTomorrow : 0;
  const reviewCap = Math.max(1, Math.floor(plan.minutes / 3 / MINUTES_PER_REVIEW));
  const reviewCards = Math.min(due, reviewCap);
  const assigned = openAssignments(player.id, data.assignments, data.completions, plan.day);
  const byName = (id: string | null) => data.players.find((p) => p.id === id)?.name ?? 'your captain';
  const total =
    plan.items.reduce((s, i) => s + (i.kind === 'review' ? reviewCards * MINUTES_PER_REVIEW : i.minutes), 0) +
    assigned.reduce((s, x) => s + assignmentMinutes(x.assignment), 0);

  return (
    <section aria-labelledby="plan-heading">
      <div className="row spread" style={{ marginTop: '1rem' }}>
        <h2 id="plan-heading" style={{ margin: 0 }}>
          Your plan · about {Math.round(total)} minutes
        </h2>
        <div className="row" role="group" aria-label="Time today">
          <span className="small muted">Time today:</span>
          {PLAN_LENGTHS.map((m) => (
            <button key={m} className="btn btn-small" aria-pressed={minutes === m} onClick={() => updateSettings({ dailyMinutes: m })}>
              {m} min
            </button>
          ))}
        </div>
      </div>
      {catalog.error && <p className="small muted">The topic list could not be loaded, so drills cover whole subjects today.</p>}
      <ol className="plan">
        {plan.items.map((item, index) => {
          const isReview = item.kind === 'review';
          const done = item.done || (isReview && due === 0 && item.cards !== undefined && item.cards > 0);
          const empty = isReview && due === 0 && !done;
          const title = isReview ? (reviewCards > 0 ? `Review ${reviewCards} question${reviewCards === 1 ? '' : 's'}` : 'Review') : item.title;
          const mins = isReview ? reviewCards * MINUTES_PER_REVIEW : item.minutes;
          // Work the captain assigned comes right after the reviews.
          const after =
            index === 0
              ? assigned.map((x) => <AssignedItem key={x.assignment.id} open={x} by={byName(x.assignment.createdBy)} />)
              : null;
          return [
            <li key={item.id} className={`plan-item card${done ? ' done' : ''}`}>
              <div className="plan-main">
                <h3>
                  {done && <span aria-hidden="true">✓ </span>}
                  {title}
                  {item.topic && <span className="plan-topic"> · {topicName(item.topic)}</span>}
                </h3>
                <p className="why">
                  <span className="why-label">Why this?</span>{' '}
                  {isReview && due === 0
                    ? tomorrow > 0
                      ? `Nothing due right now. ${tomorrow} question${tomorrow === 1 ? '' : 's'} you missed or answered slowly today come${tomorrow === 1 ? 's' : ''} back tomorrow.`
                      : 'Nothing due right now. Questions you miss or answer slowly come back here.'
                    : item.why}
                </p>
              </div>
              <div className="plan-side">
                {!empty && <span className="small muted nowrap">{mins < 1 ? '<1' : Math.round(mins)} min</span>}
                {done ? (
                  <span className="badge">Done</span>
                ) : empty ? (
                  <span className="badge">All caught up</span>
                ) : (
                  <a className="btn btn-primary" href={href(itemLink(item, plan, reviewCards))}>
                    Start
                  </a>
                )}
              </div>
            </li>,
            after,
          ];
        })}
      </ol>
      <p className="small muted">
        Plans use your subjects (set on your <a href={href('/account')}>Account</a> page), how you have been doing by topic (see{' '}
        <a href={href('/progress')}>My progress</a>){data.team ? " and the team's next competition" : ''}. Practice that is not in the plan counts
        too.
      </p>
    </section>
  );
}

export function TodayPage() {
  const data = useData();
  const session = useSession();
  const player = useCurrentPlayer();
  const now = Date.now();
  const team = data.team;
  const unfinished = data.games.filter((g) => g.status === 'in_progress');
  const recent = data.games.filter((g) => g.status === 'finished').slice(0, 5);
  const event = team?.nextEvent;
  const days = daysUntil(event?.date, now);
  const phase = seasonPhase(now, event?.date);
  const leader = isLeader(session.team?.you.role);
  const checklist = team
    ? [
        { done: !!player?.primarySubject, text: 'Choose your subjects', link: '/account' },
        { done: data.players.length >= 2, text: leader ? 'Invite your players' : 'See who is on the team', link: '/team' },
        { done: days !== null, text: leader ? 'Enter your next competition date' : 'Check the next competition date', link: '/team' },
        { done: data.games.some((g) => g.status === 'finished'), text: 'Run a practice game in the Reader console', link: '/reader' },
      ]
    : [
        { done: !!player?.primarySubject, text: 'Choose your subjects', link: '/account' },
        { done: data.attempts.length > 0, text: 'Play a practice round', link: '/try' },
        { done: false, text: 'Create or join your team', link: '/team' },
      ];
  const dateLabel = new Date(`${practiceDay(now)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="container">
      <PageHeader title="Today">
        <p>
          {dateLabel} · {PHASE_TEXT[phase]}
          {event && days !== null && (
            <>
              {' '}
              · <strong>{event.name || 'Next competition'}</strong> {days === 0 ? 'is today' : days === 1 ? 'is tomorrow' : `in ${days} days`}
            </>
          )}
        </p>
      </PageHeader>

      {player && <PlanList player={player} />}

      <h2 style={{ marginTop: '2rem' }}>{team ? 'Team' : 'More practice'}</h2>
      <div className="grid">
        {team && (
          <a className="card" href={href('/reader')}>
            <h3>Run a practice game</h3>
            <p className="muted">Open the Reader console on the practice laptop. Every toss-up is logged, and misses go to each player's review.</p>
          </a>
        )}
        <a className="card" href={href('/try')}>
          <h3>Practice solo</h3>
          <p className="muted">Whole rounds, subject and topic drills, or mixed toss-ups at reading speed.</p>
        </a>
        <a className="card" href={href('/progress')}>
          <h3>My progress</h3>
          <p className="muted">Mastery by subject and topic, buzz speed, and what is coming up for review.</p>
        </a>
        {team ? (
          <a className="card" href={href('/stats')}>
            <h3>Team stats</h3>
            <p className="muted">Accuracy by subject, interrupts and buzz speed for each player.</p>
          </a>
        ) : (
          <a className="card" href={href('/online')}>
            <h3>Play online</h3>
            <p className="muted">Matches against other players from their own devices, with no reader needed.</p>
          </a>
        )}
      </div>

      {unfinished.length > 0 && (
        <>
          <h2>Unfinished games</h2>
          <ul>
            {unfinished.map((g) => (
              <li key={g.id}>
                <a href={href(`/reader/${g.id}`)}>
                  {g.teams[0].name} vs {g.teams[1].name} · {g.packet.setTitle}, {g.packet.roundLabel}
                </a>{' '}
                <span className="muted small">started {dateTimeText(g.createdAt)}. Finish it so misses reach everyone's review queue.</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="grid-2" style={{ marginTop: '1.5rem' }}>
        <section className="card">
          <h2>Getting started</h2>
          <ul className="check-list">
            {checklist.map((item) => (
              <li key={item.text}>
                <span aria-hidden="true" style={{ color: item.done ? 'var(--good)' : 'var(--muted)', fontWeight: 800 }}>
                  {item.done ? '✓' : '○'}
                </span>
                <span className="sr-only">{item.done ? 'Done:' : 'To do:'}</span>
                <a href={href(item.link)}>{item.text}</a>
              </li>
            ))}
          </ul>
        </section>
        {team && (
          <section className="card">
            <h2>Recent games</h2>
            {recent.length === 0 ? (
              <p className="muted">No finished games yet.</p>
            ) : (
              <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
                {recent.map((g) => (
                  <li key={g.id}>
                    <a href={href(`/games/${g.id}`)}>
                      {g.teams[0].name} {g.finalScores?.[0]} – {g.finalScores?.[1]} {g.teams[1].name}
                    </a>{' '}
                    <span className="muted small">{dateTimeText(g.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
