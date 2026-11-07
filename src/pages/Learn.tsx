import { useState } from 'react';
import { useCurrentPlayer } from '../components/PlayerSwitch';
import { QuestionView } from '../components/QuestionView';
import { LoadError, Loading, Notice, PageHeader, SubjectTag } from '../components/ui';
import { CORE_SUBJECTS, SUBJECT_LABELS, type ConceptCard } from '../core/schema';
import { topicById, TOPICS } from '../core/taxonomy';
import { dateText } from '../lib/format';
import { loadQuestions, useAsync, useConceptIndex } from '../lib/library';
import { href } from '../lib/router';
import { completeAssignment, completePlanItem, markConceptRead, reviewConceptCard, saveConceptCard, useData } from '../lib/store';

/** The summary should stay short enough to read before a drill. */
const SUMMARY_WORDS = 150;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function conceptOf(id: string) {
  const topicId = id.split('.').slice(0, 2).join('.');
  const topic = topicById(topicId);
  const concept = topic?.concepts.find((c) => c.id === id);
  return topic && concept ? { topic, concept } : null;
}

function CardStatus({ card }: { card: ConceptCard }) {
  const data = useData();
  const name = (id: string | null) => data.players.find((p) => p.id === id)?.name ?? 'a former player';
  return (
    <span className="small muted">
      {card.status === 'reviewed' ? `Written by ${name(card.authorId)}, reviewed by ${name(card.reviewerId)}` : `Draft by ${name(card.authorId)}, waiting for a second player to review`} · updated{' '}
      {dateText(card.updatedAt)}
    </span>
  );
}

function CardEditor({ id, existing, onDone }: { id: string; existing?: ConceptCard; onDone: () => void }) {
  const player = useCurrentPlayer();
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [facts, setFacts] = useState((existing?.facts ?? []).join('\n'));
  const [traps, setTraps] = useState(existing?.traps ?? '');
  const [sources, setSources] = useState((existing?.sources ?? []).map((s) => (s.url ? `${s.title} | ${s.url}` : s.title)).join('\n'));
  const count = words(summary);
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        saveConceptCard({
          id,
          summary: summary.trim(),
          facts: facts.split('\n').map((f) => f.trim()).filter(Boolean),
          traps: traps.trim(),
          sources: sources
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [title, url] = line.split('|').map((x) => x.trim());
              return url && /^https?:\/\//i.test(url) ? { title, url } : { title: line };
            }),
          // Editing a card makes it a draft again until someone else reviews the change.
          authorId: player?.id ?? existing?.authorId ?? null,
          reviewerId: null,
          status: 'draft',
        });
        onDone();
      }}
    >
      <div className="field">
        <label htmlFor="card-summary">Summary ({count} of {SUMMARY_WORDS} words)</label>
        <textarea id="card-summary" rows={6} value={summary} onChange={(e) => setSummary(e.target.value)} />
        {count > SUMMARY_WORDS && <span className="hint" style={{ color: 'var(--warn)' }}>Keep it under {SUMMARY_WORDS} words: cut to what NSB asks.</span>}
      </div>
      <div className="field">
        <label htmlFor="card-facts">Key facts, formulas and units (one per line)</label>
        <textarea id="card-facts" rows={5} value={facts} onChange={(e) => setFacts(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="card-traps">Traps and look-alikes</label>
        <textarea id="card-traps" rows={3} value={traps} onChange={(e) => setTraps(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="card-sources">Sources (one per line: title | link)</label>
        <textarea id="card-sources" rows={3} value={sources} placeholder="OpenStax Biology 2e, 12.3 | https://openstax.org/…" onChange={(e) => setSources(e.target.value)} />
        <span className="hint">Use sources the team may quote: OpenStax textbooks, U.S. agency pages (DOE, NASA, USGS, NOAA, EIA).</span>
      </div>
      {!player && <Notice kind="warn">Choose your name (on Today) so the card shows who wrote it.</Notice>}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={!summary.trim()}>
          Save card
        </button>
        <button className="btn btn-ghost" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ConceptPage({ id, query }: { id: string; query?: URLSearchParams }) {
  const data = useData();
  const player = useCurrentPlayer();
  const planItem = query?.get('plan');
  const planDay = query?.get('day');
  const assignment = query?.get('assignment');
  const read = player ? !!data.conceptReads[player.id]?.[id] : false;
  const index = useConceptIndex();
  const found = conceptOf(id);
  const card = data.conceptCards[id];
  const [editing, setEditing] = useState(false);
  const questionIds = index.data?.concepts[id] ?? [];
  const examples = useAsync(questionIds.length ? `${id}|${questionIds.length}` : null, () => loadQuestions(questionIds.slice(0, 12)));

  if (!found) {
    return (
      <div className="container narrow">
        <Notice kind="error">
          Concept not found. <a href={href('/learn')}>Concept cards</a>
        </Notice>
      </div>
    );
  }
  const { topic, concept } = found;
  const owners = data.players.filter((p) => p.active && p.primarySubject === topic.subject);
  const examplesList = examples.data ? questionIds.slice(0, 12).map((qid) => examples.data!.get(qid)).filter((x) => !!x) : [];

  return (
    <div className="container narrow">
      <p className="small">
        <a href={href('/learn')}>Concept cards</a> / {SUBJECT_LABELS[topic.subject]} / {topic.name} /
      </p>
      <PageHeader title={concept.name}>
        <div className="row">
          <SubjectTag subject={topic.subject} />
          <span className="muted small">
            {topic.name} · {index.loading ? '…' : questionIds.length} question{questionIds.length === 1 ? '' : 's'} in the library
          </span>
          {questionIds.length > 0 && (
            <a className="btn btn-small" href={href(`/try?mode=subject&subject=${topic.subject}&concept=${encodeURIComponent(id)}&count=8&go=1`)}>
              Drill these
            </a>
          )}
        </div>
      </PageHeader>

      {editing ? (
        <CardEditor id={id} existing={card} onDone={() => setEditing(false)} />
      ) : card ? (
        <article className="card stack concept-card">
          <p style={{ margin: 0 }}>{card.summary}</p>
          {card.facts.length > 0 && (
            <>
              <h3 style={{ marginBottom: 0 }}>Key facts</h3>
              <ul style={{ margin: 0 }}>
                {card.facts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </>
          )}
          {card.traps && (
            <>
              <h3 style={{ marginBottom: 0 }}>Traps and look-alikes</h3>
              <p style={{ margin: 0 }}>{card.traps}</p>
            </>
          )}
          {card.sources.length > 0 && (
            <p className="small" style={{ margin: 0 }}>
              Sources:{' '}
              {card.sources.map((s, i) => (
                <span key={i}>
                  {i > 0 && '; '}
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}
                </span>
              ))}
            </p>
          )}
          <CardStatus card={card} />
          <div className="row">
            {player &&
              (read ? (
                <span className="badge">Read</span>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    markConceptRead(player.id, id);
                    if (planItem && planDay) completePlanItem(player.id, planDay, planItem);
                    if (assignment) completeAssignment(assignment, player.id);
                  }}
                >
                  Got it
                </button>
              ))}
            {(planItem || assignment) && read && <a href={href('/today')}>Back to today's plan</a>}
            <button className="btn btn-small" onClick={() => setEditing(true)}>
              Edit
            </button>
            {card.status === 'draft' && player && player.id !== card.authorId && (
              <button className="btn btn-small btn-primary" onClick={() => reviewConceptCard(id, player.id)}>
                I checked it: mark reviewed
              </button>
            )}
          </div>
        </article>
      ) : (
        <Notice>
          No card yet.{' '}
          {owners.length > 0 ? `${owners.map((o) => o.name).join(' and ')} own${owners.length === 1 ? 's' : ''} ${SUBJECT_LABELS[topic.subject]}.` : ''}{' '}
          <button className="btn btn-small btn-primary" onClick={() => setEditing(true)}>
            Write the card
          </button>
        </Notice>
      )}

      <h2>How NSB asks it</h2>
      {index.loading && <Loading what="Finding questions" />}
      {index.error && <LoadError error={index.error} />}
      {examples.loading && <Loading what="Loading questions" />}
      {questionIds.length === 0 && !index.loading && <p className="muted">No library questions are tagged with this concept yet.</p>}
      <div className="stack">
        {examplesList.slice(0, 3).map((x) => (
          <QuestionView key={x!.question.id} q={x!.question} />
        ))}
      </div>
      {examplesList.length > 3 && (
        <details style={{ marginTop: '1rem' }}>
          <summary>More questions on this concept ({examplesList.length - 3} more shown, of {questionIds.length - 3})</summary>
          <div className="stack" style={{ marginTop: '0.75rem' }}>
            {examplesList.slice(3).map((x) => (
              <QuestionView key={x!.question.id} q={x!.question} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function LearnPage() {
  const data = useData();
  const index = useConceptIndex();
  const withConcepts = TOPICS.filter((t) => t.concepts.length > 0);
  const total = withConcepts.reduce((n, t) => n + t.concepts.length, 0);
  const written = Object.keys(data.conceptCards).length;
  return (
    <div className="container">
      <PageHeader title="Concept cards">
        <p>
          Short notes on the ideas NSB asks about most: a summary, key facts, traps and sources, next to the questions that test each idea. Each
          subject's owner writes the cards and a second player reviews them, so writing them is good study too. {written} of {total} written so
          far.
        </p>
      </PageHeader>
      {index.error && <LoadError error={index.error} />}
      {CORE_SUBJECTS.map((subject) => {
        const topics = withConcepts.filter((t) => t.subject === subject);
        if (topics.length === 0) return null;
        return (
          <section key={subject} style={{ marginBottom: '1.5rem' }}>
            <h2>
              <SubjectTag subject={subject} />
            </h2>
            <div className="grid">
              {topics.map((t) => (
                <section key={t.id} className="card">
                  <h3 style={{ marginTop: 0 }}>{t.name}</h3>
                  <ul className="concept-list">
                    {t.concepts.map((c) => {
                      const card = data.conceptCards[c.id];
                      const n = index.data?.concepts[c.id]?.length;
                      return (
                        <li key={c.id}>
                          <a href={href(`/learn/${encodeURIComponent(c.id)}`)}>{c.name}</a>{' '}
                          <span className="small muted">
                            {n !== undefined ? `${n} q` : ''}
                            {card ? (card.status === 'reviewed' ? ' · card ✓' : ' · draft') : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        );
      })}
      <p className="small muted">Concepts exist for the most frequent topics so far; more are added as subject owners map their subjects.</p>
    </div>
  );
}
