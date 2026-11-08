import { useMemo, useState, type FormEvent } from 'react';
import { Notice, PageHeader, SubjectTag } from '../components/ui';
import { useTip } from '../components/VizTip';
import { isLeader, MAX_TEAM_NAME_CHARS, type MemberRole, type TeamMember } from '../core/accounts';
import { daysUntil, FINAL_WEEKS_DAYS } from '../core/review';
import { CORE_SUBJECTS, SUBJECT_LABELS, type CoreSubject, type Level, type Player } from '../core/schema';
import { topicName, topicsForSubject } from '../core/taxonomy';
import { createTeam, deleteTeam, leaveTeam, newInviteLink, removeMember, updateMember, updateProfile, type MemberChange } from '../lib/account';
import { joinLink, parseJoinCode } from '../lib/api';
import { useSession } from '../lib/cloud';
import { dateText } from '../lib/format';
import { catalogById, useCatalog } from '../lib/library';
import { href, navigate } from '../lib/router';
import { renameTeam, setNextEvent, useData } from '../lib/store';
import { graduatingClass, MIN_TOPIC_ANSWERS, succession, teamPlayers, topicCoverage, useTeamModels } from '../lib/team';
import { useTeamData } from '../lib/teammates';

const ROLES: MemberRole[] = ['member', 'captain', 'coach'];
const ROLE_TEXT: Record<MemberRole, string> = { member: 'Member', captain: 'Captain', coach: 'Coach' };
const GRAD_YEARS = Array.from({ length: 6 }, (_, i) => graduatingClass(Date.now()) + i);
const SQUADS = ['', 'A', 'B', 'C', 'D'];

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function SubjectSelect({ value, onChange, label, disabled }: { value?: CoreSubject; onChange: (v: CoreSubject | null) => void; label: string; disabled?: boolean }) {
  return (
    <select aria-label={label} value={value ?? ''} disabled={disabled} onChange={(e) => onChange((e.target.value || null) as CoreSubject | null)}>
      <option value="">—</option>
      {CORE_SUBJECTS.map((s) => (
        <option key={s} value={s}>
          {SUBJECT_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

/* ---------------- no team yet ---------------- */

function NoTeam() {
  const [name, setName] = useState('');
  const [level, setLevel] = useState<Level>('HS');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseJoinCode(link);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createTeam(name, level);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };
  return (
    <div className="container narrow">
      <PageHeader title="Your team">
        <p>
          A team shares its Reader console games, lineups, packets, assignments and stats, and teammates see each other's practice stats (not review
          queues or daily plans). You can be on one team at a time; your own practice stays with you if you move.
        </p>
      </PageHeader>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="stack">
        <form className="card stack" onSubmit={(e) => void create(e)} aria-labelledby="create-heading">
          <h2 id="create-heading" style={{ margin: 0 }}>
            Start a team
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            For coaches and captains. You become its captain and get an invite link for your players.
          </p>
          <div className="field">
            <label htmlFor="team-name">Team name</label>
            <input id="team-name" type="text" value={name} maxLength={MAX_TEAM_NAME_CHARS} onChange={(e) => setName(e.target.value)} placeholder="e.g. Central High Science Bowl" />
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
            <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create team'}
            </button>
          </div>
        </form>

        <form
          className="card stack"
          aria-labelledby="join-heading"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed) navigate(`/join/${parsed.code}`);
          }}
        >
          <h2 id="join-heading" style={{ margin: 0 }}>
            Join your team
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            Open the invite link your coach or captain posted, or paste it here.
          </p>
          <div className="field">
            <label htmlFor="join-link">Invite link</label>
            <input id="join-link" type="text" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…#/join/…" />
          </div>
          {link.trim() && !parsed && <p className="small" style={{ color: 'var(--warn)', margin: 0 }}>That invite link does not look complete.</p>}
          <div>
            <button className="btn" type="submit" disabled={!parsed}>
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------- the next competition ---------------- */

function EventLineup() {
  const data = useData();
  const lineup = data.lineups.find((l) => l.id === data.team?.nextEvent?.lineupId);
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Former player';
  if (!lineup) {
    return (
      <p className="small">
        No lineup chosen yet. <a href={href('/lineups')}>Lineups</a>
      </p>
    );
  }
  return (
    <p className="small">
      <strong>Lineup: </strong>
      {lineup.starters.map(name).join(', ')}
      {lineup.alternates.length > 0 && ` (alternate${lineup.alternates.length > 1 ? 's' : ''}: ${lineup.alternates.map(name).join(', ')})`} ·{' '}
      <a href={href('/lineups')}>Lineups</a>
    </p>
  );
}

function NextEvent({ leader }: { leader: boolean }) {
  const data = useData();
  const saved = data.team?.nextEvent;
  const [name, setName] = useState(saved?.name ?? '');
  const [date, setDate] = useState(saved?.date ?? '');
  const [finals, setFinals] = useState(!!saved?.finals);
  const days = daysUntil(saved?.date, Date.now());
  const dirty = name !== (saved?.name ?? '') || date !== (saved?.date ?? '') || finals !== !!saved?.finals;
  const when = saved && days !== null && (
    <p className="small muted">
      {saved.name || 'The competition'} is {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}
      {saved.finals ? ' (the National Finals)' : ''}.
    </p>
  );
  const about = (
    <p className="muted small">
      In the last {FINAL_WEEKS_DAYS / 7} weeks before it, every player's daily plan shifts toward timed mixed rounds and reviews come back a little
      more often. For the National Finals, plans add visual bonuses in the last six weeks.
    </p>
  );
  if (!leader) {
    return (
      <section className="card" aria-labelledby="next-event-heading">
        <h2 id="next-event-heading">Next competition</h2>
        {about}
        {saved ? (days === null ? <p className="small muted">The last one has passed; your coach or captain enters the next.</p> : when) : <p className="small muted">Not entered yet. Your coach or captain enters it here.</p>}
        {saved && days !== null && <EventLineup />}
      </section>
    );
  }
  return (
    <form
      className="card"
      aria-labelledby="next-event-heading"
      onSubmit={(e) => {
        e.preventDefault();
        setNextEvent(date ? { name, date, finals } : null);
      }}
    >
      <h2 id="next-event-heading">Next competition</h2>
      {about}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label htmlFor="event-name">Name</label>
          <input id="event-name" type="text" value={name} placeholder="e.g. Regional" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="event-date">Date</label>
          <input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <label className="checkbox" style={{ marginBottom: '0.6rem' }}>
          <input type="checkbox" checked={finals} onChange={(e) => setFinals(e.target.checked)} /> The National Finals
        </label>
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
              setFinals(false);
            }}
          >
            Clear
          </button>
        )}
      </div>
      {saved && days === null && <p className="small" style={{ color: 'var(--warn)' }}>That date has passed. Enter the next competition.</p>}
      {when}
      {saved && days !== null && <EventLineup />}
    </form>
  );
}

/* ---------------- the invite link ---------------- */

function InviteLink({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = code ? joinLink(code) : null;
  const rotate = async () => {
    if (link && !confirm('Make a new invite link? The old one stops working (people already on the team stay).')) return;
    setBusy(true);
    setError(null);
    try {
      await newInviteLink();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card stack" aria-labelledby="invite-heading">
      <h2 id="invite-heading" style={{ margin: 0 }}>
        Invite link
      </h2>
      <p className="small muted" style={{ margin: 0 }}>
        Post it where only your team can see it (your team chat). Anyone with a Rebound account who opens it can join, so make a new one if it gets
        around.
      </p>
      {link && (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input aria-label="Invite link" type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button
            className="btn btn-small"
            onClick={() =>
              void navigator.clipboard?.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              })
            }
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      <div>
        <button className={link ? 'btn btn-small btn-ghost' : 'btn btn-small'} disabled={busy} onClick={() => void rotate()}>
          {busy ? 'Making a link…' : link ? 'New invite link' : 'Make an invite link'}
        </button>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
    </section>
  );
}

/* ---------------- members ---------------- */

function MemberRow({ m, player, me, leader, busy, run }: { m: TeamMember; player: Player | undefined; me: string; leader: boolean; busy: boolean; run: (p: Promise<void>) => void }) {
  const own = m.userId === me;
  const name = player?.name ?? m.name;
  // Players set their own subjects (on their profile; the server copies them to the team); leaders set anyone else's.
  const change = (fields: MemberChange) => run(updateMember(m.userId, fields));
  const subjects = (fields: { primarySubject?: CoreSubject | null; secondarySubject?: CoreSubject | null; gradYear?: number | null }) =>
    own ? run(updateProfile(fields)) : change(fields);
  const canEdit = own || leader;
  const primary = player?.primarySubject ?? m.primarySubject;
  const secondary = player?.secondarySubject ?? m.secondarySubject;
  const grad = player?.gradYear ?? m.gradYear;
  return (
    <tr>
      <td>
        {name}
        {own && <span className="muted small"> (you)</span>}
      </td>
      <td>
        {leader ? (
          <select aria-label={`Role for ${name}`} value={m.role} disabled={busy} onChange={(e) => change({ role: e.target.value as MemberRole })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_TEXT[r]}
              </option>
            ))}
          </select>
        ) : (
          ROLE_TEXT[m.role]
        )}
      </td>
      <td>
        {leader ? (
          <select aria-label={`Sub-team for ${name}`} value={m.squad ?? ''} disabled={busy} onChange={(e) => change({ squad: e.target.value || null })}>
            {SQUADS.map((s) => (
              <option key={s} value={s}>
                {s || '—'}
              </option>
            ))}
          </select>
        ) : (
          m.squad ?? '—'
        )}
      </td>
      <td>
        {canEdit ? (
          <SubjectSelect value={primary} disabled={busy} onChange={(v) => subjects({ primarySubject: v })} label={`Primary subject for ${name}`} />
        ) : primary ? (
          <SubjectTag subject={primary} />
        ) : (
          '—'
        )}
      </td>
      <td>
        {canEdit ? (
          <SubjectSelect value={secondary} disabled={busy} onChange={(v) => subjects({ secondarySubject: v })} label={`Secondary subject for ${name}`} />
        ) : secondary ? (
          <SubjectTag subject={secondary} />
        ) : (
          '—'
        )}
      </td>
      <td>
        {canEdit ? (
          <select aria-label={`Graduation year for ${name}`} value={grad ?? ''} disabled={busy} onChange={(e) => subjects({ gradYear: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>
            {[...new Set([...(grad ? [grad] : []), ...GRAD_YEARS])].sort().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        ) : (
          grad ?? '—'
        )}
      </td>
      <td className="small">{m.lastSeen ? dateText(new Date(m.lastSeen).toISOString()) : '–'}</td>
      <td>
        {leader && !own && (
          <button
            className="btn btn-small btn-ghost"
            disabled={busy}
            onClick={() => {
              if (confirm(`Take ${name} off the team? Their practice stays in their account; games they played stay with the team.`)) run(removeMember(m.userId));
            }}
          >
            Remove
          </button>
        )}
      </td>
    </tr>
  );
}

function Members({ leader }: { leader: boolean }) {
  const data = useData();
  const { team, user } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!team || !user) return null;
  const run = (p: Promise<void>) => {
    setBusy(true);
    setError(null);
    p.catch((err: unknown) => setError(errorText(err))).finally(() => setBusy(false));
  };
  const order: Record<MemberRole, number> = { coach: 0, captain: 1, member: 2 };
  const members = [...team.members].sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
  return (
    <section aria-labelledby="members-heading">
      <h2 id="members-heading">Members ({members.length})</h2>
      <p className="small muted">
        {leader
          ? 'You can change anyone’s role, sub-team and subjects. Each player can set their own subjects too.'
          : 'Set your own subjects here (or on your Account page); your coach or captain sets roles and sub-teams.'}
      </p>
      {error && <Notice kind="error">{error}</Notice>}
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
              <th>Last seen</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <MemberRow key={m.userId} m={m} player={data.players.find((p) => p.id === m.userId)} me={user.id} leader={leader} busy={busy} run={run} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- who covers what ---------------- */

function Coverage({ data }: { data: ReturnType<typeof useTeamData>['data'] }) {
  const catalog = useCatalog();
  const catalogMap = useMemo(() => (catalog.data ? catalogById(catalog.data) : null), [catalog.data]);
  const models = useTeamModels(data, catalogMap);
  const playing = teamPlayers(data);
  const plan = succession(playing, models, Date.now());
  const year = graduatingClass(Date.now());
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
            const primary = playing.filter((p) => p.primarySubject === s);
            const secondary = playing.filter((p) => p.secondarySubject === s);
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
function TopicCoverageMap({ data }: { data: ReturnType<typeof useTeamData>['data'] }) {
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
                  const text = c.best ? `${name(c.best.playerId)}: ${Math.round(c.best.line.p * 100)}% from ${c.best.line.n} answers` : 'Nobody has answered enough questions here yet';
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

/* ---------------- leaving and deleting ---------------- */

function LeaveOrDelete({ leader, teamName }: { leader: boolean; teamName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card stack" aria-labelledby="leave-heading" style={{ marginTop: '1.5rem' }}>
      <h2 id="leave-heading" style={{ margin: 0 }}>
        Leave {leader ? 'or delete ' : ''}the team
      </h2>
      <p className="small muted" style={{ margin: 0 }}>
        Leaving takes you off {teamName}. Your own practice (answers, review queue, plans) is in your account and goes with you; the team keeps its
        games, lineups and packets.{leader ? ' If you are the last coach or captain, make someone else one first.' : ''}
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="row">
        <button
          className="btn"
          disabled={busy}
          onClick={() => {
            if (confirm(`Leave ${teamName}? Your practice history stays in your account and goes with you.`)) void run(leaveTeam);
          }}
        >
          Leave the team
        </button>
        {leader && (
          <button
            className="btn btn-bad"
            disabled={busy}
            onClick={() => {
              if (!confirm(`Delete ${teamName} for everyone? Its games, lineups, assignments, packets, written questions and concept cards are deleted for good. Each member keeps their own practice.`)) return;
              void run(deleteTeam);
            }}
          >
            Delete the team
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------------- the page ---------------- */

export function TeamPage() {
  const data = useData();
  const session = useSession();
  const { data: teamData, loading } = useTeamData();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.team?.name ?? '');
  const [level, setLevel] = useState<Level>(data.team?.level ?? 'HS');
  if (!data.team || !session.team) return <NoTeam />;
  const leader = isLeader(session.team.you.role);

  return (
    <div className="container">
      <PageHeader title={data.team.name}>
        <div className="row">
          <span className="badge">{data.team.level === 'HS' ? 'High school' : 'Middle school'}</span>
          <span className="small muted">You are {session.team.you.role === 'member' ? 'a member' : `a ${session.team.you.role}`}.</span>
          {leader && (
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
          )}
          <a className="btn btn-small" href={href('/lineups')}>
            Lineups
          </a>
          <a className="btn btn-small" href={href('/assignments')}>
            Assignments
          </a>
          <a className="btn btn-small" href={href('/packets')}>
            Packets
          </a>
          <a className="btn btn-small" href={href('/write')}>
            Write
          </a>
          <a className="btn btn-small" href={href('/stats')}>
            Stats
          </a>
        </div>
      </PageHeader>

      {editing && leader && (
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
            <input id="rename" type="text" value={name} maxLength={MAX_TEAM_NAME_CHARS} onChange={(e) => setName(e.target.value)} />
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

      <div className="grid-2">
        <NextEvent leader={leader} />
        {leader ? (
          <InviteLink code={session.team.joinCode ?? null} />
        ) : (
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Invite someone</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Ask your coach or captain for the team's invite link.
            </p>
          </section>
        )}
      </div>

      <Members leader={leader} />

      <h2>Who covers what</h2>
      <p className="muted">
        Each subject should have a primary owner. Strong teams also give every starter a secondary subject so coverage overlaps. Add graduation
        years to see who takes over each subject next season.
        {loading && ' Loading teammates’ practice…'}
      </p>
      <Coverage data={teamData} />
      <div style={{ marginTop: '1rem' }}>
        <TopicCoverageMap data={teamData} />
      </div>

      <LeaveOrDelete leader={leader} teamName={data.team.name} />
    </div>
  );
}
