import { useMemo, useState, type FormEvent } from 'react';
import { PageHeader, SubjectTag, Notice } from '../components/ui';
import { useTip } from '../components/VizTip';
import { topicName, topicsForSubject } from '../core/taxonomy';
import { catalogById, useCatalog } from '../lib/library';
import { graduatingClass, MIN_TOPIC_ANSWERS, succession, teamPlayers, topicCoverage, useTeamModels } from '../lib/team';
import { daysUntil, FINAL_WEEKS_DAYS } from '../core/review';
import { CORE_SUBJECTS, SUBJECT_LABELS, type CoreSubject, type Level, type Player, type Role } from '../core/schema';
import { href } from '../lib/router';
import { addPlayer, createTeam, removePlayer, renameTeam, setNextEvent, updatePlayer, useData } from '../lib/store';

const ROLES: Role[] = ['member', 'captain', 'coach'];
const GRAD_YEARS = Array.from({ length: 6 }, (_, i) => graduatingClass(Date.now()) + i);
const SQUADS = ['', 'A', 'B', 'C', 'D'];

function SubjectSelect({ value, onChange, label }: { value?: CoreSubject; onChange: (v?: CoreSubject) => void; label: string }) {
  return (
    <select aria-label={label} value={value ?? ''} onChange={(e) => onChange((e.target.value || undefined) as CoreSubject | undefined)}>
      <option value="">—</option>
      {CORE_SUBJECTS.map((s) => (
        <option key={s} value={s}>
          {SUBJECT_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

function CreateTeam() {
  const [name, setName] = useState('');
  const [level, setLevel] = useState<Level>('HS');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    createTeam(name, level);
  };
  return (
    <div className="container narrow">
      <PageHeader title="Set up your team">
        <p>Two quick choices, then add your players. Everything is saved in this browser; you can export it at any time.</p>
      </PageHeader>
      <form className="card stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="team-name">Team name</label>
          <input id="team-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Central High Science Bowl" autoFocus />
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Level</legend>
          <label className="checkbox">
            <input type="radio" name="level" checked={level === 'HS'} onChange={() => setLevel('HS')} /> High school
          </label>
          <label className="checkbox">
            <input type="radio" name="level" checked={level === 'MS'} onChange={() => setLevel('MS')} /> Middle school
          </label>
        </fieldset>
        <div>
          <button className="btn btn-primary" type="submit">
            Create team
          </button>
        </div>
      </form>
    </div>
  );
}

function AddPlayerForm() {
  const [name, setName] = useState('');
  const [primary, setPrimary] = useState<CoreSubject | undefined>();
  const [secondary, setSecondary] = useState<CoreSubject | undefined>();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addPlayer({ name, role: 'member', primarySubject: primary, secondarySubject: secondary });
    setName('');
    setPrimary(undefined);
    setSecondary(undefined);
  };
  return (
    <form className="card" onSubmit={submit} aria-label="Add a player">
      <h3>Add a player</h3>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
        <div className="field">
          <label htmlFor="new-player">Name</label>
          <input id="new-player" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="First name or nickname" />
        </div>
        <div className="field">
          <span className="label">Primary subject</span>
          <SubjectSelect value={primary} onChange={setPrimary} label="Primary subject" />
        </div>
        <div className="field">
          <span className="label">Secondary subject</span>
          <SubjectSelect value={secondary} onChange={setSecondary} label="Secondary subject" />
        </div>
      </div>
      <div style={{ marginTop: '0.75rem' }}>
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
          Add player
        </button>
      </div>
    </form>
  );
}

function PlayerRow({ p }: { p: Player }) {
  return (
    <tr>
      <td>
        <input type="text" aria-label="Name" value={p.name} onChange={(e) => updatePlayer(p.id, { name: e.target.value })} />
      </td>
      <td>
        <select aria-label="Role" value={p.role} onChange={(e) => updatePlayer(p.id, { role: e.target.value as Role })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r[0].toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select aria-label="Sub-team" value={p.squad ?? ''} onChange={(e) => updatePlayer(p.id, { squad: e.target.value || undefined })}>
          {SQUADS.map((s) => (
            <option key={s} value={s}>
              {s || '—'}
            </option>
          ))}
        </select>
      </td>
      <td>
        <SubjectSelect value={p.primarySubject} onChange={(v) => updatePlayer(p.id, { primarySubject: v })} label={`Primary subject for ${p.name}`} />
      </td>
      <td>
        <SubjectSelect value={p.secondarySubject} onChange={(v) => updatePlayer(p.id, { secondarySubject: v })} label={`Secondary subject for ${p.name}`} />
      </td>
      <td>
        <select aria-label={`Graduation year for ${p.name}`} value={p.gradYear ?? ''} onChange={(e) => updatePlayer(p.id, { gradYear: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">—</option>
          {GRAD_YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </td>
      <td className="center">
        <input type="checkbox" aria-label={`${p.name} is active`} checked={p.active} onChange={(e) => updatePlayer(p.id, { active: e.target.checked })} />
      </td>
      <td>
        <button
          className="btn btn-small btn-ghost"
          onClick={() => {
            if (confirm(`Remove ${p.name}? Players who appear in past games are kept as inactive so old stats still make sense.`)) removePlayer(p.id);
          }}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

function EventLineup() {
  const data = useData();
  const lineup = data.lineups.find((l) => l.id === data.team?.nextEvent?.lineupId);
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Former player';
  if (!lineup) {
    return (
      <p className="small">
        No lineup chosen yet. <a href={href('/lineups')}>Choose one on the Lineups page</a>.
      </p>
    );
  }
  return (
    <p className="small">
      <strong>Lineup: </strong>
      {lineup.starters.map(name).join(', ')}
      {lineup.alternates.length > 0 && ` (alternate${lineup.alternates.length > 1 ? 's' : ''}: ${lineup.alternates.map(name).join(', ')})`} ·{' '}
      <a href={href('/lineups')}>Change</a>
    </p>
  );
}

function NextEvent() {
  const data = useData();
  const saved = data.team?.nextEvent;
  const [name, setName] = useState(saved?.name ?? '');
  const [date, setDate] = useState(saved?.date ?? '');
  const days = daysUntil(saved?.date, Date.now());
  const dirty = name !== (saved?.name ?? '') || date !== (saved?.date ?? '');
  return (
    <form
      className="card"
      aria-labelledby="next-event-heading"
      onSubmit={(e) => {
        e.preventDefault();
        setNextEvent(date ? { name, date } : null);
      }}
    >
      <h2 id="next-event-heading">Next competition</h2>
      <p className="muted small">
        In the last {FINAL_WEEKS_DAYS / 7} weeks before it, every player's daily plan shifts toward timed mixed rounds and reviews come back a
        little more often.
      </p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label htmlFor="event-name">Name</label>
          <input id="event-name" type="text" value={name} placeholder="e.g. Regional" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="event-date">Date</label>
          <input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={!dirty}>
          Save
        </button>
        {saved && (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setNextEvent(null);
              setName('');
              setDate('');
            }}
          >
            Clear
          </button>
        )}
      </div>
      {saved && days === null && <p className="small" style={{ color: 'var(--warn)' }}>That date has passed. Enter the next competition.</p>}
      {saved && days !== null && (
        <p className="small muted">
          {saved.name || 'The competition'} is {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}.
        </p>
      )}
      {saved && days !== null && <EventLineup />}
    </form>
  );
}

function Coverage({ players }: { players: Player[] }) {
  const data = useData();
  const catalog = useCatalog();
  const catalogMap = useMemo(() => (catalog.data ? catalogById(catalog.data) : null), [catalog.data]);
  const models = useTeamModels(data, catalogMap);
  const playing = teamPlayers(data);
  const plan = succession(playing, models, Date.now());
  const year = graduatingClass(Date.now());
  const active = players.filter((p) => p.active && p.role !== 'coach');
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Primary</th>
            <th>Secondary</th>
            <th>Next season</th>
          </tr>
        </thead>
        <tbody>
          {CORE_SUBJECTS.map((s) => {
            const primary = active.filter((p) => p.primarySubject === s);
            const secondary = active.filter((p) => p.secondarySubject === s);
            const next = plan.find((x) => x.subject === s)!;
            return (
              <tr key={s}>
                <td>
                  <SubjectTag subject={s} />
                </td>
                <td>{primary.length ? primary.map((p) => p.name).join(', ') : <span style={{ color: 'var(--bad)' }}>Nobody yet</span>}</td>
                <td>{secondary.length ? secondary.map((p) => p.name).join(', ') : <span className="muted">—</span>}</td>
                <td>
                  {next.owners.length > 0 && next.leaving.length < next.owners.length ? (
                    <span className="muted">Covered</span>
                  ) : next.successor ? (
                    <>
                      {next.leaving.length > 0 && <>{next.leaving.map((p) => p.name).join(', ')} graduates in {year}. </>}
                      Best placed to take over: <strong>{next.successor.player.name}</strong>
                    </>
                  ) : (
                    <span style={{ color: 'var(--bad)' }}>Nobody to take over</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The team's best mastery in every topic, so gaps stand out ("nobody is above 60% on optics"). */
function TopicCoverageMap() {
  const data = useData();
  const catalog = useCatalog();
  const catalogMap = useMemo(() => (catalog.data ? catalogById(catalog.data) : null), [catalog.data]);
  const models = useTeamModels(data, catalogMap);
  const coverage = topicCoverage(models);
  const { ref, node, handlers } = useTip();
  const [table, setTable] = useState(false);
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Former player';
  const bin = (p: number) => (p >= 0.8 ? 5 : p >= 0.65 ? 4 : p >= 0.5 ? 3 : p >= 0.35 ? 2 : 1);
  const gaps = coverage.filter((c) => !c.best || c.best.line.p < 0.6);
  return (
    <figure className="card viz" ref={ref} style={{ marginInline: 0, marginBottom: 0 }}>
      <div className="row spread">
        <h3 style={{ margin: 0 }}>The team's best in every topic</h3>
        <button className="btn btn-small btn-ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Show map' : 'Show table'}
        </button>
      </div>
      <figcaption className="small muted" style={{ margin: '0.25rem 0 0.5rem' }}>
        Each topic shows the player with the highest mastery there, once they have answered at least {MIN_TOPIC_ANSWERS} of its questions.{' '}
        {gaps.length} of {coverage.length} topics have nobody above 60% yet.
      </figcaption>
      {table ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Topic</th>
                <th>Best player</th>
                <th className="num">Mastery</th>
                <th className="num">Players with data</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map((c) => (
                <tr key={c.topicId}>
                  <td>{SUBJECT_LABELS[c.subject]}</td>
                  <td>{topicName(c.topicId)}</td>
                  <td>{c.best ? name(c.best.playerId) : '–'}</td>
                  <td className="num">{c.best ? `${Math.round(c.best.line.p * 100)}%` : '–'}</td>
                  <td className="num">{c.players}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="scale-legend" aria-label="Color scale">
            {['under 35%', '35–50%', '50–65%', '65–80%', '80% and up'].map((label, i) => (
              <span key={label}>
                <i style={{ background: `var(--viz-seq-${i + 1})` }} aria-hidden="true" />
                {label}
              </span>
            ))}
            <span>
              <i style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }} aria-hidden="true" />
              No data yet
            </span>
          </div>
          {CORE_SUBJECTS.map((s) => (
            <section key={s} className="heat-subject" aria-label={SUBJECT_LABELS[s]}>
              <h4 style={{ margin: '0 0 0.4rem' }}>{SUBJECT_LABELS[s]}</h4>
              <div className="heat-grid">
                {topicsForSubject(s).map((t) => {
                  const c = coverage.find((x) => x.topicId === t.id)!;
                  const text = c.best
                    ? `${name(c.best.playerId)}: ${Math.round(c.best.line.p * 100)}% from ${c.best.line.n} answers`
                    : 'Nobody has answered enough questions here yet';
                  return (
                    <div
                      key={t.id}
                      className="heat-cell"
                      data-bin={c.best ? bin(c.best.line.p) : 0}
                      tabIndex={0}
                      role="img"
                      aria-label={`${t.name}: ${text}`}
                      {...handlers(
                        <>
                          <strong>{c.best ? `${Math.round(c.best.line.p * 100)}%` : 'No data'}</strong>
                          {t.name} · {text}
                        </>,
                      )}
                    >
                      <span>{t.name}</span>
                      <span className="due">{c.best ? name(c.best.playerId) : ''}</span>
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

export function TeamPage() {
  const data = useData();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.team?.name ?? '');
  const [level, setLevel] = useState<Level>(data.team?.level ?? 'HS');
  if (!data.team) return <CreateTeam />;

  const players = [...data.players].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return (
    <div className="container">
      <PageHeader title={data.team.name}>
        <div className="row">
          <span className="badge">{data.team.level === 'HS' ? 'High school' : 'Middle school'}</span>
          <button
            className="btn btn-small"
            onClick={() => {
              setName(data.team!.name);
              setLevel(data.team!.level);
              setEditing((v) => !v);
            }}
          >
            {editing ? 'Close' : 'Edit team'}
          </button>
          <a className="btn btn-small" href={href('/lineups')}>
            Lineups
          </a>
          <a className="btn btn-small" href={href('/stats')}>
            Stats
          </a>
          <a className="btn btn-small" href={href('/data')}>
            Data and backup
          </a>
        </div>
      </PageHeader>

      {editing && (
        <form
          className="card row"
          style={{ marginBottom: '1rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            renameTeam(name, level);
            setEditing(false);
          }}
        >
          <div className="field" style={{ flex: '1 1 240px' }}>
            <label htmlFor="rename">Team name</label>
            <input id="rename" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="level">Level</label>
            <select id="level" value={level} onChange={(e) => setLevel(e.target.value as Level)}>
              <option value="HS">High school</option>
              <option value="MS">Middle school</option>
            </select>
          </div>
          <button className="btn btn-primary" type="submit" style={{ alignSelf: 'flex-end' }}>
            Save
          </button>
        </form>
      )}

      <NextEvent />

      <h2>Roster</h2>
      {players.length === 0 ? (
        <Notice>No players yet. Add them below; first names or nicknames are enough.</Notice>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Sub-team</th>
                <th>Primary subject</th>
                <th>Secondary subject</th>
                <th>Graduates</th>
                <th>Active</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <PlayerRow key={p.id} p={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: '1rem' }}>
        <AddPlayerForm />
      </div>

      <h2>Who covers what</h2>
      <p className="muted">
        Each subject should have a primary owner. Strong teams also give every starter a secondary subject so coverage overlaps. Add graduation
        years to the roster to see who takes over each subject next season.
      </p>
      <Coverage players={data.players} />
      <div style={{ marginTop: '1rem' }}>
        <TopicCoverageMap />
      </div>
    </div>
  );
}
