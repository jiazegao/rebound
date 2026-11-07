import { useEffect, useMemo } from 'react';
import { PlayerSwitch, useCurrentPlayer } from '../components/PlayerSwitch';
import { Notice, PageHeader } from '../components/ui';
import { MINUTES_PER_REVIEW, PLAN_LENGTHS, type DayPlan, type PlanItem } from '../core/plan';
import { daysUntil, PHASE_TEXT, practiceDay, seasonPhase } from '../core/review';
import { topicName } from '../core/taxonomy';
import type { Player } from '../core/schema';
import { dateTimeText } from '../lib/format';
import { planFor, playerDue, usePlayerModel } from '../lib/learning';
import { catalogById, useCatalog } from '../lib/library';
import { href } from '../lib/router';
import { savePlan, updateSettings, useData } from '../lib/store';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function itemLink(item: PlanItem, plan: DayPlan, reviewCards: number): string {
  const tail = `plan=${encodeURIComponent(item.id)}&day=${plan.day}`;
  if (item.kind === 'review') return `/review?${tail}&limit=${reviewCards}`;
  if (item.kind === 'mixed') return `/try?mode=mixed&count=${item.count}&${tail}&go=1`;
  const topic = item.topic ? `&topic=${encodeURIComponent(item.topic)}` : '';
  return `/try?mode=subject&subject=${item.subject}${topic}&count=${item.count}&${tail}&go=1`;
}

function PlanList({ player }: { player: Player }) {
  const data = useData();
  const catalog = useCatalog();
  const catalogMap = useMemo(() => (catalog.data ? catalogById(catalog.data) : null), [catalog.data]);
  const model = usePlayerModel(data, player.id, catalogMap);
  const minutes = data.settings.dailyMinutes;
  const ready = !catalog.loading;
  const result = useMemo(
    () =>
      ready
        ? planFor(data, player, minutes, model, catalog.data ? { rows: catalog.data.questions, topicCounts: catalog.data.topicCounts } : null)
        : null,
    // The plan only needs rebuilding when the player, day, length, catalog or saved plan changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, player, minutes, catalog.data, data.plans[player.id], model],
  );

  useEffect(() => {
    if (result?.changed) savePlan(result.plan);
  }, [result]);

  if (!result) return <p className="muted">Preparing your plan…</p>;
  const plan = result.plan;
  const due = playerDue(data, player.id).length;
  const reviewCap = Math.max(1, Math.floor(plan.minutes / 3 / MINUTES_PER_REVIEW));
  const reviewCards = Math.min(due, reviewCap);
  const total = plan.items.reduce((s, i) => s + (i.kind === 'review' ? reviewCards * MINUTES_PER_REVIEW : i.minutes), 0);

  return (
    <section aria-labelledby="plan-heading">
      <div className="row spread" style={{ marginTop: '1rem' }}>
        <h2 id="plan-heading" style={{ margin: 0 }}>
          {player.name}'s plan · about {Math.round(total)} minutes
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
      {catalog.error && (
        <p className="small muted">The topic list could not be loaded (offline?), so drills cover whole subjects today.</p>
      )}
      <ol className="plan">
        {plan.items.map((item) => {
          const isReview = item.kind === 'review';
          const done = item.done || (isReview && due === 0 && item.cards !== undefined && item.cards > 0);
          const empty = isReview && due === 0 && !done;
          const title = isReview ? (reviewCards > 0 ? `Review ${reviewCards} question${reviewCards === 1 ? '' : 's'}` : 'Review') : item.title;
          const mins = isReview ? reviewCards * MINUTES_PER_REVIEW : item.minutes;
          return (
            <li key={item.id} className={`plan-item card${done ? ' done' : ''}`}>
              <div className="plan-main">
                <h3>
                  {done && <span aria-hidden="true">✓ </span>}
                  {title}
                  {item.topic && <span className="plan-topic"> · {topicName(item.topic)}</span>}
                </h3>
                <p className="why">
                  <span className="why-label">Why this?</span> {isReview && due === 0 ? 'Nothing due right now. Questions you miss or answer slowly come back here.' : item.why}
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
            </li>
          );
        })}
      </ol>
      <p className="small muted">
        Plans use {player.name}'s subjects (set on the <a href={href('/team')}>Team</a> page), how they have been doing by topic (see{' '}
        <a href={href('/progress')}>My progress</a>) and the team's next competition. Practice that is not in the plan counts too.
      </p>
    </section>
  );
}

function ChoosePlayer({ players }: { players: Player[] }) {
  return (
    <section className="card">
      <h2>Who's practicing?</h2>
      <div className="row">
        {players.map((p) => (
          <button key={p.id} className="btn btn-big" onClick={() => updateSettings({ soloPlayerId: p.id })}>
            {p.name}
          </button>
        ))}
      </div>
      <p className="small muted">Rebound remembers the choice on this device. Switch any time at the top of this page.</p>
    </section>
  );
}

export function TodayPage() {
  const data = useData();
  const player = useCurrentPlayer();
  if (!data.team) {
    return (
      <div className="container narrow">
        <PageHeader title="Today" />
        <Notice>
          Set up your team first: <a href={href('/team')}>Team</a>. Or <a href={href('/try')}>try a round</a> on your own.
        </Notice>
      </div>
    );
  }

  const now = Date.now();
  const unfinished = data.games.filter((g) => g.status === 'in_progress');
  const recent = data.games.filter((g) => g.status === 'finished').slice(0, 5);
  const activePlayers = data.players.filter((p) => p.active);
  const exportedRecently = data.lastExportAt !== null && now - new Date(data.lastExportAt).getTime() < WEEK_MS;
  const event = data.team.nextEvent;
  const days = daysUntil(event?.date, now);
  const phase = seasonPhase(now, event?.date);
  const checklist = [
    { done: activePlayers.length >= 2, text: 'Add your players', link: '/team' },
    { done: data.players.some((p) => p.primarySubject), text: 'Give players their subjects', link: '/team' },
    { done: days !== null, text: 'Enter your next competition date', link: '/team' },
    { done: data.games.some((g) => g.status === 'finished'), text: 'Run a practice game in the Reader console', link: '/reader' },
    { done: exportedRecently, text: 'Export a backup this week', link: '/data' },
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

      {activePlayers.length === 0 ? (
        <Notice>
          Add your players on the <a href={href('/team')}>Team</a> page, and each one gets a daily plan here.
        </Notice>
      ) : player ? (
        <>
          <div className="row spread">
            <PlayerSwitch label="Practicing as" />
          </div>
          <PlanList player={player} />
        </>
      ) : (
        <ChoosePlayer players={activePlayers} />
      )}

      <h2 style={{ marginTop: '2rem' }}>Team</h2>
      <div className="grid">
        <a className="card" href={href('/reader')}>
          <h3>Run a practice game</h3>
          <p className="muted">Open the Reader console on the practice laptop. Every toss-up is logged, and misses go to review.</p>
        </a>
        <a className="card" href={href('/try')}>
          <h3>Practice solo</h3>
          <p className="muted">Whole rounds, subject and topic drills, or mixed toss-ups at reading speed.</p>
        </a>
        <a className="card" href={href('/progress')}>
          <h3>My progress</h3>
          <p className="muted">Mastery by subject and topic, buzz speed, and what is coming up for review.</p>
        </a>
        <a className="card" href={href('/stats')}>
          <h3>Team stats</h3>
          <p className="muted">Accuracy by subject, interrupts and buzz speed for each player.</p>
        </a>
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
                <span className="muted small">started {dateTimeText(g.createdAt)}. Finish it so misses reach the review queue.</span>
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
      </div>
    </div>
  );
}
