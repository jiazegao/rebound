import { useState } from 'react';
import { QuestionView } from '../components/QuestionView';
import { LoadError, Loading, Notice, PageHeader, SubjectTag } from '../components/ui';
import { CORE_SUBJECTS, SUBJECT_LABELS, type ConceptCard } from '../core/schema';
import { topicById, TOPICS } from '../core/taxonomy';
import { AI_RESTRICTED_TEXT, aiDraftCard, aiRestrictedSource, MAX_PASSAGE_CHARS, MIN_PASSAGE_CHARS, usageText, useAiStatus } from '../lib/ai';
import { dateText } from '../lib/format';
import { loadQuestions, useAsync, useConceptIndex } from '../lib/library';
import { href } from '../lib/router';
import { completeAssignment, completePlanItem, markConceptRead, reviewConceptCard, saveConceptCard, useCurrentPlayer, useData } from '../lib/store';
import { ReviewAtAGlance } from './Review';

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
      {card.ai && ` · AI-drafted from ${card.ai.passageSource}`}
    </span>
  );
}

/** Fills the card editor from a pasted, cited passage, when Rebound's server has AI help. */
function AiCardDraft({ concept, onDraft }: { concept: string; onDraft: (d: { summary: string; facts: string[]; traps: string; source: string; model: string }) => void }) {
  const ai = useAiStatus();
  const [source, setSource] = useState('');
  const [passage, setPassage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ai?.enabled) return null;
  const length = passage.trim().length;
  const left = Math.max(0, (ai.dailyLimit ?? 0) - (ai.usedToday ?? 0));
  const restricted = aiRestrictedSource(source);
  const ready = length >= MIN_PASSAGE_CHARS && length <= MAX_PASSAGE_CHARS && source.trim().length > 0 && left > 0 && !busy && !restricted;
  return (
    <details className="card">
      <summary>
        <strong>Draft from a passage (AI)</strong>
      </summary>
      <div className="stack" style={{ marginTop: '0.75rem' }}>
        <p className="small muted" style={{ margin: 0 }}>
          Paste a section whose terms allow it, such as a U.S. government page (public domain), and say where it is from; not OpenStax, whose
          license does not allow putting the books into AI tools. An AI model drafts the card below from it; edit it, and a second player reviews
          it as usual. The card stays labeled AI-drafted.
        </p>
        <div className="field">
          <label htmlFor="ai-card-source">Source</label>
          <input id="ai-card-source" type="text" maxLength={300} placeholder="e.g. NOAA JetStream: Air Masses" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        {restricted && <Notice kind="warn">{AI_RESTRICTED_TEXT}</Notice>}
        <div className="field">
          <label htmlFor="ai-card-passage">
            Passage ({length.toLocaleString()} of {MAX_PASSAGE_CHARS.toLocaleString()} characters)
          </label>
          <textarea id="ai-card-passage" rows={6} value={passage} onChange={(e) => setPassage(e.target.value)} />
        </div>
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={!ready}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await aiDraftCard({ concept, passage: passage.trim(), source: source.trim() });
                onDraft({ ...res.card, source: source.trim(), model: res.model });
                setPassage('');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'The card could not be drafted.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Drafting…' : 'Draft the card'}
          </button>
          <span className="small muted">Uses 1 AI call. {usageText(ai)}.</span>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </details>
  );
}

function CardEditor({ id, concept, existing, onDone }: { id: string; concept: string; existing?: ConceptCard; onDone: () => void }) {
  const player = useCurrentPlayer();
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [facts, setFacts] = useState((existing?.facts ?? []).join('\n'));
  const [traps, setTraps] = useState(existing?.traps ?? '');
  const [sources, setSources] = useState((existing?.sources ?? []).map((s) => (s.url ? `${s.title} | ${s.url}` : s.title)).join('\n'));
  const [ai, setAi] = useState(existing?.ai);
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
          ...(ai ? { ai } : {}),
        });
        onDone();
      }}
    >
      <AiCardDraft
        concept={concept}
        onDraft={(d) => {
          setSummary(d.summary);
          setFacts(d.facts.join('\n'));
          setTraps(d.traps);
          setSources((cur) => [cur.trim(), d.source].filter(Boolean).join('\n'));
          setAi({ model: d.model, at: new Date().toISOString(), passageSource: d.source });
        }}
      />
      {ai && <Notice>AI-drafted from {ai.passageSource} ({ai.model}). Check each fact against the source before saving.</Notice>}
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

      {!data.team ? (
        <Notice>
          Concept cards are notes a team writes for itself: each subject's owner writes them and a teammate checks them.{' '}
          {player ? <a href={href('/team')}>Create or join a team</a> : 'Sign in and join your team'} to read and write your team's cards. The questions
          below are open to everyone.
        </Notice>
      ) : editing ? (
        <CardEditor id={id} concept={`${concept.name} (${topic.name})`} existing={card} onDone={() => setEditing(false)} />
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
      <PageHeader title="Learn">
        <p>Your reviews first, then the ideas NSB asks about most.</p>
      </PageHeader>
      <ReviewAtAGlance />
      <h2>Concept cards</h2>
      <p>
        Short notes on the ideas NSB asks about most: a summary, key facts, traps and sources, next to the questions that test each idea. Each
        subject's owner writes the cards and a second player reviews them, so writing them is good study too.
        {data.team ? ` ${written} of ${total} written so far.` : ' Cards belong to a team: join yours to read and write them; the questions on each concept are open to everyone.'}
      </p>
      <p>
        <a href={href('/learn/paths')}>Reading paths</a>: each subject's topics in the order to learn them, with free readings and a short check after
        each.
      </p>
      {index.error && <LoadError error={index.error} />}
      {CORE_SUBJECTS.map((subject) => {
        const topics = withConcepts.filter((t) => t.subject === subject);
        if (topics.length === 0) return null;
        return (
          <section key={subject} style={{ marginBottom: '1.5rem' }}>
            <h3>
              <SubjectTag subject={subject} />
            </h3>
            <div className="grid">
              {topics.map((t) => (
                <section key={t.id} className="card">
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', lineHeight: 1.25 }}>{t.name}</h4>
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
