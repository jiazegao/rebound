import { useMemo, useState } from 'react';
import { Notice, PageHeader, SubjectTag } from '../components/ui';
import { useTip } from '../components/VizTip';
import { bestAlternate, estimateLineup, OPPONENTS, ROUND_TOSSUPS, BONUS_POINTS, TOSSUP_POINTS, suggestLineups, type LineupEstimate, type PlayerProfile } from '../core/lineup';
import { daysUntil } from '../core/review';
import { CORE_SUBJECTS, SUBJECT_LABELS } from '../core/schema';
import { catalogById, useCatalog } from '../lib/library';
import { href } from '../lib/router';
import { deleteLineup, saveLineup, setEventLineup, useData } from '../lib/store';
import { profileFor, teamPlayers, useTeamModels } from '../lib/team';

type OpponentKey = keyof typeof OPPONENTS;
const pct = (p: number) => `${Math.round(p * 100)}%`;

function EstimateView({ estimate, name, opponent }: { estimate: LineupEstimate; name: (id: string) => string; opponent: OpponentKey }) {
  const { ref, node, handlers } = useTip();
  const [table, setTable] = useState(false);
  const max = Math.max(...CORE_SUBJECTS.map((s) => ROUND_TOSSUPS[s] * (TOSSUP_POINTS + BONUS_POINTS)));
  const uncertain = estimate.subjects.filter((s) => s.uncertain);
  return (
    <figure className="card viz" ref={ref} style={{ margin: 0 }}>
      <div className="row spread">
        <div>
          <div className="hero-figure">{Math.round(estimate.points)}</div>
          <div className="small muted">
            points a round, expected against {OPPONENTS[opponent].label} ({Math.round(estimate.tossupPoints)} from toss-ups,{' '}
            {Math.round(estimate.bonusPoints)} from bonuses)
          </div>
        </div>
        <button className="btn btn-small btn-ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <figcaption className="small muted" style={{ margin: '0.75rem 0 0.5rem' }}>
        Points by subject, with who covers it. Weakest: {SUBJECT_LABELS[estimate.weakest]}.
      </figcaption>
      {table ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Covered by</th>
                <th className="num">Their chance</th>
                <th className="num">Team knows</th>
                <th className="num">Team wins</th>
                <th className="num">Points</th>
              </tr>
            </thead>
            <tbody>
              {estimate.subjects.map((s) => (
                <tr key={s.subject}>
                  <td>{SUBJECT_LABELS[s.subject]}</td>
                  <td>{s.coveredBy ? name(s.coveredBy) : '–'}</td>
                  <td className="num">{pct(s.best)}</td>
                  <td className="num">{pct(s.know)}</td>
                  <td className="num">{pct(s.win)}</td>
                  <td className="num">{s.points.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="hbar-chart">
          {estimate.subjects.map((s) => (
            <div key={s.subject} style={{ display: 'contents' }}>
              <span className="hbar-label">{SUBJECT_LABELS[s.subject]}</span>
              <div className="hbar-track">
                <div className="hbar-area">
                  <div
                    className="hbar"
                    style={{ width: `${(s.points / max) * 100}%` }}
                    tabIndex={0}
                    role="img"
                    aria-label={`${SUBJECT_LABELS[s.subject]}: ${s.points.toFixed(1)} points, covered by ${s.coveredBy ? name(s.coveredBy) : 'nobody'}`}
                    {...handlers(
                      <>
                        <strong>{s.points.toFixed(1)} points</strong>
                        {SUBJECT_LABELS[s.subject]} · covered by {s.coveredBy ? `${name(s.coveredBy)} (${pct(s.best)} on a typical toss-up)` : 'nobody'} · the team
                        knows {pct(s.know)} and wins {pct(s.win)} of toss-ups
                      </>,
                    )}
                  />
                  <span className="hbar-value" style={{ left: `${(s.points / max) * 100}%` }}>
                    {s.points.toFixed(0)} · {s.coveredBy ? name(s.coveredBy) : 'nobody'}
                    {s.uncertain && <span className="muted"> (few answers)</span>}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {uncertain.length > 0 && (
        <p className="small muted" style={{ marginBottom: 0 }}>
          {uncertain.map((s) => SUBJECT_LABELS[s.subject]).join(', ')}: estimates lean on each player's assigned subjects until they have answered at
          least 10 questions there. Practice games and drills sharpen them.
        </p>
      )}
      {node}
    </figure>
  );
}

export function LineupsPage() {
  const data = useData();
  const catalog = useCatalog();
  const catalogMap = useMemo(() => (catalog.data ? catalogById(catalog.data) : null), [catalog.data]);
  const models = useTeamModels(data, catalogMap);
  const players = useMemo(() => teamPlayers(data), [data.players]); // eslint-disable-line react-hooks/exhaustive-deps
  const profiles = useMemo(() => players.map((p) => profileFor(p, models.get(p.id))), [players, models]);
  const byId = new Map(profiles.map((p) => [p.playerId, p]));
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Former player';

  const [opponent, setOpponent] = useState<OpponentKey>('average');
  const [starters, setStarters] = useState<string[]>([]);
  const [alternates, setAlternates] = useState<string[]>([]);
  const [lineupName, setLineupName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const suggestions = useMemo(() => (profiles.length >= 1 ? suggestLineups(profiles, OPPONENTS[opponent], 4, 5) : []), [profiles, opponent]);
  const chosen = starters.map((id) => byId.get(id)).filter((p): p is PlayerProfile => !!p);
  const estimate = chosen.length > 0 ? estimateLineup(chosen, OPPONENTS[opponent]) : null;
  const bench = profiles.filter((p) => !starters.includes(p.playerId));
  const alt = chosen.length === 4 ? bestAlternate(chosen, bench, OPPONENTS[opponent]) : null;
  const event = data.team?.nextEvent;
  const eventDays = daysUntil(event?.date, Date.now());

  if (!data.team) {
    return (
      <div className="container narrow">
        <PageHeader title="Lineups" />
        <Notice>
          Set up your team first on the <a href={href('/team')}>Team</a> page.
        </Notice>
      </div>
    );
  }

  const setRole = (id: string, role: 'starter' | 'alternate' | 'none') => {
    setStarters((s) => (role === 'starter' ? (s.includes(id) || s.length >= 4 ? s : [...s, id]) : s.filter((x) => x !== id)));
    setAlternates((a) => (role === 'alternate' ? (a.includes(id) ? a : [...a, id]) : a.filter((x) => x !== id)));
  };
  const load = (ids: string[], alts: string[] = [], lineup?: { id: string; name: string }) => {
    setStarters(ids.slice(0, 4));
    setAlternates(alts.filter((a) => !ids.includes(a)));
    setEditingId(lineup?.id ?? null);
    setLineupName(lineup?.name ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="container">
      <p className="small">
        <a href={href('/team')}>Team</a> /
      </p>
      <PageHeader title="Lineups">
        <p>
          Pick four starters and see roughly how many points they would score in a regional round, subject by subject. The estimate uses each
          player's results (difficulty-adjusted, from games and solo practice) and buzz speed. It ignores rebounds, interrupts and the clock, so use
          it to compare lineups, not to predict scores.
        </p>
      </PageHeader>

      {players.length < 2 ? (
        <Notice>
          Add players on the <a href={href('/team')}>Team</a> page first.
        </Notice>
      ) : (
        <>
          <div className="row" role="group" aria-label="Opponent" style={{ marginBottom: '1rem' }}>
            <span className="small muted">Against:</span>
            {(Object.keys(OPPONENTS) as OpponentKey[]).map((k) => (
              <button key={k} className="btn btn-small" aria-pressed={opponent === k} onClick={() => setOpponent(k)}>
                {OPPONENTS[k].label}
              </button>
            ))}
          </div>

          <div className="grid-2">
            <section className="card" aria-labelledby="builder-heading">
              <h2 id="builder-heading">{editingId ? `Edit “${lineupName}”` : 'Build a lineup'}</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Subjects</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => {
                      const role = starters.includes(p.id) ? 'starter' : alternates.includes(p.id) ? 'alternate' : 'none';
                      return (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td>
                            <div className="row" style={{ gap: '0.25rem' }}>
                              {p.primarySubject && <SubjectTag subject={p.primarySubject} />}
                              {p.secondarySubject && <SubjectTag subject={p.secondarySubject} />}
                            </div>
                          </td>
                          <td>
                            <select aria-label={`Role for ${p.name}`} value={role} onChange={(e) => setRole(p.id, e.target.value as typeof role)}>
                              <option value="none">Not playing</option>
                              <option value="starter" disabled={role !== 'starter' && starters.length >= 4}>
                                Starter
                              </option>
                              <option value="alternate">Alternate</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {alt && !alternates.includes(alt.playerId) && (
                <p className="small">
                  Suggested alternate: <strong>{name(alt.playerId)}</strong>, who would lose the fewest points stepping in (best for{' '}
                  {name(alt.replaces)}).{' '}
                  <button className="btn btn-small btn-ghost" onClick={() => setRole(alt.playerId, 'alternate')}>
                    Add as alternate
                  </button>
                </p>
              )}
              <form
                className="row"
                style={{ marginTop: '0.75rem', alignItems: 'flex-end' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const id = saveLineup({ id: editingId ?? undefined, name: lineupName, starters, alternates });
                  setEditingId(id);
                }}
              >
                <div className="field" style={{ flex: '1 1 200px' }}>
                  <label htmlFor="lineup-name">Lineup name</label>
                  <input id="lineup-name" type="text" value={lineupName} placeholder="e.g. Regional A" onChange={(e) => setLineupName(e.target.value)} />
                </div>
                <button className="btn btn-primary" type="submit" disabled={starters.length === 0}>
                  {editingId ? 'Save changes' : 'Save lineup'}
                </button>
                {editingId && (
                  <button className="btn btn-ghost" type="button" onClick={() => load([], [])}>
                    New lineup
                  </button>
                )}
              </form>
            </section>

            {estimate ? (
              <EstimateView estimate={estimate} name={name} opponent={opponent} />
            ) : (
              <section className="card">
                <h2>Estimate</h2>
                <p className="muted">Choose starters, or load one of the suggestions below.</p>
              </section>
            )}
          </div>

          <h2>Suggested lineups</h2>
          <p className="small muted">Every group of four on the roster, best first.</p>
          <ol className="plan">
            {suggestions.map((s, i) => (
              <li key={s.playerIds.join()} className="plan-item card">
                <div className="plan-main">
                  <h3>
                    {i + 1}. {s.playerIds.map(name).join(', ')}
                  </h3>
                  <p className="why">
                    About {Math.round(s.points)} points a round · weakest: {SUBJECT_LABELS[s.weakest]}
                    {s.subjects.some((x) => x.uncertain) && ' · some estimates rest on few answers'}
                  </p>
                </div>
                <div className="plan-side">
                  <button className="btn" onClick={() => load(s.playerIds)}>
                    Use
                  </button>
                </div>
              </li>
            ))}
          </ol>

          <h2>Saved lineups</h2>
          {data.lineups.length === 0 ? (
            <p className="muted">None yet. Build one above and save it.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lineup</th>
                    <th>Starters</th>
                    <th>Alternates</th>
                    <th className="num">Points</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.lineups.map((l) => {
                    const profs = l.starters.map((id) => byId.get(id)).filter((p): p is PlayerProfile => !!p);
                    const pts = profs.length ? Math.round(estimateLineup(profs, OPPONENTS[opponent]).points) : 0;
                    const forEvent = event?.lineupId === l.id;
                    return (
                      <tr key={l.id}>
                        <td>
                          {l.name}
                          {forEvent && (
                            <>
                              {' '}
                              <span className="badge">For {event!.name || 'the next competition'}</span>
                            </>
                          )}
                        </td>
                        <td>{l.starters.map(name).join(', ')}</td>
                        <td>{l.alternates.length ? l.alternates.map(name).join(', ') : '–'}</td>
                        <td className="num">{pts}</td>
                        <td>
                          <div className="row" style={{ gap: '0.25rem', flexWrap: 'nowrap' }}>
                            <button className="btn btn-small" onClick={() => load(l.starters, l.alternates, l)}>
                              Edit
                            </button>
                            {event && eventDays !== null && !forEvent && (
                              <button className="btn btn-small btn-primary" onClick={() => setEventLineup(l.id)}>
                                Use for {event.name || 'the next competition'}
                              </button>
                            )}
                            {forEvent && (
                              <button className="btn btn-small btn-ghost" onClick={() => setEventLineup(null)}>
                                Unset
                              </button>
                            )}
                            <button
                              className="btn btn-small btn-ghost"
                              onClick={() => {
                                if (confirm(`Delete the lineup “${l.name}”?`)) deleteLineup(l.id);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!event || eventDays === null ? (
            <p className="small muted">
              Enter the next competition on the <a href={href('/team')}>Team</a> page to choose its lineup here.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
