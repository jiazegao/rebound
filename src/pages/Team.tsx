import { useState, type FormEvent } from 'react';
import { PageHeader, SubjectTag, Notice } from '../components/ui';
import { CORE_SUBJECTS, SUBJECT_LABELS, type CoreSubject, type Level, type Player, type Role } from '../core/schema';
import { href } from '../lib/router';
import { addPlayer, createTeam, removePlayer, renameTeam, updatePlayer, useData } from '../lib/store';

const ROLES: Role[] = ['member', 'captain', 'coach'];
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

function Coverage({ players }: { players: Player[] }) {
  const active = players.filter((p) => p.active && p.role !== 'coach');
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Primary</th>
            <th>Secondary</th>
          </tr>
        </thead>
        <tbody>
          {CORE_SUBJECTS.map((s) => {
            const primary = active.filter((p) => p.primarySubject === s);
            const secondary = active.filter((p) => p.secondarySubject === s);
            return (
              <tr key={s}>
                <td>
                  <SubjectTag subject={s} />
                </td>
                <td>{primary.length ? primary.map((p) => p.name).join(', ') : <span style={{ color: 'var(--bad)' }}>Nobody yet</span>}</td>
                <td>{secondary.length ? secondary.map((p) => p.name).join(', ') : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
      <p className="muted">Each subject should have a primary owner. Strong teams also give every starter a secondary subject so coverage overlaps.</p>
      <Coverage players={data.players} />
    </div>
  );
}
