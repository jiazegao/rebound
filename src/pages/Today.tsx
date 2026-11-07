import { PageHeader, Notice } from '../components/ui';
import { dateTimeText } from '../lib/format';
import { href } from '../lib/router';
import { useData } from '../lib/store';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function TodayPage() {
  const data = useData();
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

  const unfinished = data.games.filter((g) => g.status === 'in_progress');
  const recent = data.games.filter((g) => g.status === 'finished').slice(0, 5);
  const activePlayers = data.players.filter((p) => p.active);
  const exportedRecently = data.lastExportAt !== null && Date.now() - new Date(data.lastExportAt).getTime() < WEEK_MS;
  const checklist = [
    { done: activePlayers.length >= 2, text: 'Add your players', link: '/team' },
    { done: data.players.some((p) => p.primarySubject), text: 'Give players their subjects', link: '/team' },
    { done: data.games.some((g) => g.status === 'finished'), text: 'Run a practice game in the Reader console', link: '/reader' },
    { done: exportedRecently, text: 'Export a backup this week', link: '/data' },
  ];

  return (
    <div className="container">
      <PageHeader title="Today">
        <p>Quick start for {data.team.name}. Personal daily plans for each player arrive in the next release.</p>
      </PageHeader>

      <div className="grid">
        <a className="card" href={href('/reader')}>
          <h3>Run a practice game</h3>
          <p className="muted">Open the Reader console on the practice laptop. Every toss-up is logged.</p>
        </a>
        <a className="card" href={href('/try')}>
          <h3>Practice solo</h3>
          <p className="muted">Questions revealed at reading speed; buzz, type, and see how you did.</p>
        </a>
        <a className="card" href={href('/library')}>
          <h3>Browse the library</h3>
          <p className="muted">Every DOE high school sample set, by round and subject.</p>
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
                <span className="muted small">started {dateTimeText(g.createdAt)}</span>
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
