import { useMemo, useState } from 'react';
import { PageHeader, SubjectTag } from '../components/ui';
import { completionId, daysBetween, defaultTitle, dueState, gapSuggestions, progress } from '../core/assignments';
import { practiceDay } from '../core/review';
import { CORE_SUBJECTS, SUBJECT_LABELS, type AssignmentKind, type CoreSubject } from '../core/schema';
import { TOPICS, topicName, topicsForSubject } from '../core/taxonomy';
import { isLeader } from '../core/accounts';
import { useSession } from '../lib/cloud';
import { catalogById, useCatalog } from '../lib/library';
import { href } from '../lib/router';
import { createAssignment, deleteAssignment } from '../lib/store';
import { teamPlayers, topicCoverage, useTeamModels } from '../lib/team';
import { useTeamData } from '../lib/teammates';

const KIND_TEXT: Record<AssignmentKind, string> = {
  drill: 'A drill',
  packet: 'A team packet, played solo',
  concept: 'A concept card to read',
  review: 'Clear their due reviews',
};

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AssignmentsPage() {
  // Progress counts each player's own completions, and gap suggestions use everyone's answers: load teammates too.
  const { data } = useTeamData();
  const session = useSession();
  const leader = isLeader(session.team?.you.role);
  const catalog = useCatalog();
  const catalogMap = useMemo(() => (catalog.data ? catalogById(catalog.data) : null), [catalog.data]);
  const models = useTeamModels(data, catalogMap);
  const players = teamPlayers(data);
  const today = practiceDay(Date.now());
  const name = (id: string | null) => data.players.find((p) => p.id === id)?.name ?? 'Former player';

  const [kind, setKind] = useState<AssignmentKind>('drill');
  const [subject, setSubject] = useState<CoreSubject>('biology');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(8);
  const [packetId, setPacketId] = useState(data.packets[0]?.id ?? '');
  const [conceptId, setConceptId] = useState(Object.keys(data.conceptCards)[0] ?? '');
  const [assignees, setAssignees] = useState<Set<string>>(() => new Set(players.map((p) => p.id)));
  const [due, setDue] = useState(addDays(today, 3));
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  // Only coaches and captains give assignments (the server refuses anyone else).
  const creator = leader ? data.settings.soloPlayerId : null;

  const coverage = topicCoverage(models);
  const suggestions = catalog.data ? gapSuggestions(coverage, catalog.data.topicCounts, data.players) : [];
  const packetTitle = data.packets.find((p) => p.id === packetId)?.title;
  const draft = { kind, subject, topic: topic || undefined, count, conceptId, packetId };
  const ready = assignees.size > 0 && (kind !== 'packet' || !!packetId) && (kind !== 'concept' || !!conceptId);

  const create = () => {
    createAssignment({
      kind,
      title: title.trim() || defaultTitle(draft, packetTitle),
      note: note.trim() || undefined,
      subject: kind === 'drill' ? subject : undefined,
      topic: kind === 'drill' && topic ? topic : undefined,
      count: kind === 'drill' ? count : undefined,
      packetId: kind === 'packet' ? packetId : undefined,
      conceptId: kind === 'concept' ? conceptId : undefined,
      playerIds: [...assignees],
      due,
      createdBy: creator,
    });
    setTitle('');
    setNote('');
  };

  return (
    <div className="container">
      <p className="small">
        <a href={href('/team')}>Team</a> /
      </p>
      <PageHeader title="Assignments">
        <p>
          Give players a drill, a packet, a concept card or their reviews, with a due date. It shows on each player's Today page, and ticks
          itself off when they finish.
        </p>
      </PageHeader>

      {leader && suggestions.length > 0 && (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2>Suggested from coverage gaps</h2>
          <p className="small muted">Frequent topics where nobody on the team is above 60% yet. Each goes to the subject's owners.</p>
          <ul className="check-list">
            {suggestions.map((g) => (
              <li key={g.topic}>
                <SubjectTag subject={g.subject} />
                <span>
                  <strong>{topicName(g.topic)}</strong>{' '}
                  <span className="small muted">
                    {g.best === null ? 'nobody has enough answers yet' : `best on the team ${Math.round(g.best * 100)}%`} · {g.questions} questions ·
                    for {g.playerIds.map(name).join(', ')}
                  </span>{' '}
                  <button
                    className="btn btn-small"
                    onClick={() =>
                      createAssignment({
                        kind: 'drill',
                        title: defaultTitle({ kind: 'drill', topic: g.topic, count: 8 }),
                        subject: g.subject,
                        topic: g.topic,
                        count: 8,
                        playerIds: g.playerIds,
                        due: addDays(today, 7),
                        createdBy: creator,
                      })
                    }
                  >
                    Assign a drill
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid-2">
        {leader ? (
          <form
            className="card stack"
            aria-labelledby="new-assignment"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) create();
            }}
          >
            <h2 id="new-assignment">New assignment</h2>
            <div className="field">
              <label htmlFor="as-kind">What</label>
              <select id="as-kind" value={kind} onChange={(e) => setKind(e.target.value as AssignmentKind)}>
                {(Object.keys(KIND_TEXT) as AssignmentKind[]).map((k) => (
                  <option key={k} value={k} disabled={(k === 'packet' && data.packets.length === 0) || (k === 'concept' && Object.keys(data.conceptCards).length === 0)}>
                    {KIND_TEXT[k]}
                  </option>
                ))}
              </select>
            </div>
            {kind === 'drill' && (
              <div className="grid">
                <div className="field">
                  <label htmlFor="as-subject">Subject</label>
                  <select id="as-subject" value={subject} onChange={(e) => { setSubject(e.target.value as CoreSubject); setTopic(''); }}>
                    {CORE_SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {SUBJECT_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="as-topic">Topic</label>
                  <select id="as-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
                    <option value="">All of {SUBJECT_LABELS[subject]}</option>
                    {topicsForSubject(subject).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="as-count">Questions</label>
                  <select id="as-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                    {[5, 8, 10, 15, 20].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {kind === 'packet' && (
              <div className="field">
                <label htmlFor="as-packet">Packet</label>
                <select id="as-packet" value={packetId} onChange={(e) => setPacketId(e.target.value)}>
                  {data.packets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {kind === 'concept' && (
              <div className="field">
                <label htmlFor="as-concept">Concept card</label>
                <select id="as-concept" value={conceptId} onChange={(e) => setConceptId(e.target.value)}>
                  {TOPICS.flatMap((t) => t.concepts)
                    .filter((c) => data.conceptCards[c.id])
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">For</legend>
              <div className="row" style={{ gap: '0.25rem 1rem' }}>
                {players.map((p) => (
                  <label key={p.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={assignees.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(assignees);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setAssignees(next);
                      }}
                    />{' '}
                    {p.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid">
              <div className="field">
                <label htmlFor="as-due">Due</label>
                <input id="as-due" type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="as-title">Title</label>
                <input id="as-title" type="text" value={title} placeholder={defaultTitle(draft, packetTitle)} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="as-note">Note (optional)</label>
              <input id="as-note" type="text" value={note} placeholder="e.g. Before Saturday's scrimmage" onChange={(e) => setNote(e.target.value)} />
            </div>
            <div>
              <button className="btn btn-primary" type="submit" disabled={!ready}>
                Assign
              </button>
            </div>
          </form>
        ) : (
          <section className="card stack" aria-labelledby="new-assignment">
            <h2 id="new-assignment" style={{ margin: 0 }}>
              Your assignments
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              Coaches and captains give assignments. Yours show on your <a href={href('/today')}>Today</a> page and tick themselves off when you
              finish.
            </p>
          </section>
        )}

        <section className="card" aria-labelledby="current-assignments">
          <h2 id="current-assignments">Current assignments</h2>
          {data.assignments.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <ul className="check-list" style={{ gap: '0.9rem' }}>
              {data.assignments.map((a) => {
                const pr = progress(a, data.completions);
                const state = dueState(today, a.due);
                const days = daysBetween(today, a.due);
                return (
                  <li key={a.id} style={{ display: 'block' }}>
                    <div className="row spread">
                      <strong>{a.title}</strong>
                      <span className="small muted">
                        {pr.done} of {pr.total} done · {state === 'overdue' ? `overdue by ${-days} d` : state === 'today' ? 'due today' : `due in ${days} d`}
                      </span>
                    </div>
                    <div className="small">
                      {a.playerIds.map((p, i) => (
                        <span key={p}>
                          {i > 0 && ', '}
                          {data.completions[completionId(a.id, p)] ? '✓ ' : ''}
                          {name(p)}
                        </span>
                      ))}
                      {a.topic && <span className="muted"> · {topicName(a.topic)}</span>}{' '}
                      {leader && (
                        <button
                          className="btn btn-small btn-ghost"
                          onClick={() => {
                            if (confirm(`Delete “${a.title}”?`)) deleteAssignment(a.id);
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
