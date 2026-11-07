import { useEffect, useMemo, useState } from 'react';
import { LoadError, Loading, Notice, PageHeader, SubjectTag } from '../components/ui';
import { QuestionView } from '../components/QuestionView';
import { CORE_SUBJECTS, SUBJECT_LABELS, type Question, type QuestionSet, type Subject } from '../core/schema';
import { findRound, roundQuestions, setLabel, useIndex, useSet } from '../lib/library';
import { href } from '../lib/router';
import { addToReview, reportProblem, useData } from '../lib/store';
import { cardId } from '../core/review';
import { dateText } from '../lib/format';

function SetList() {
  const index = useIndex();
  return (
    <div className="container">
      <PageHeader title="Library">
        <p>
          Every DOE high school sample set, newest first. These are retired regional rounds that DOE publishes for practice; each round links to
          its original PDF.
        </p>
        <p>
          <a href={href('/library/topics')}>Browse by topic</a>: which topics come up most often in each subject.
        </p>
      </PageHeader>
      {index.loading && <Loading what="Loading the library" />}
      {index.error && <LoadError error={index.error} />}
      {index.data && (
        <div className="grid">
          {[...index.data.sets]
            .sort((a, b) => (b.setNumber ?? 0) - (a.setNumber ?? 0))
            .map((s) => (
              <a key={s.id} className="card" href={href(`/library/${s.id}`)}>
                <h3>{setLabel(s)}</h3>
                <p className="muted small" style={{ marginBottom: '0.5rem' }}>
                  {s.rounds.length} rounds · {s.questionCount.toLocaleString()} questions
                </p>
                <div className="row" style={{ gap: '0.3rem' }}>
                  {CORE_SUBJECTS.filter((sub) => s.subjectCounts[sub]).map((sub) => (
                    <SubjectTag key={sub} subject={sub} />
                  ))}
                </div>
              </a>
            ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: '1.5rem' }}>
        Source: U.S. Department of Energy, National Science Bowl sample questions. Public domain; DOE asks to be credited and linked.
      </p>
    </div>
  );
}

function useSeenByTeam(): Set<string> {
  const data = useData();
  return useMemo(() => {
    const seen = new Set<string>();
    for (const p of data.players) {
      if (!p.active) continue;
      for (const q of Object.keys(data.seen[p.id] ?? {})) seen.add(q);
    }
    return seen;
  }, [data.players, data.seen]);
}

function SetView({ set }: { set: QuestionSet }) {
  const [search, setSearch] = useState('');
  const seen = useSeenByTeam();
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term.length < 3) return [];
    const out: Array<{ q: Question; roundId: string; roundLabel: string }> = [];
    for (const r of set.rounds) {
      for (const q of roundQuestions(r)) {
        if (`${q.stem} ${q.answer} ${q.accept.join(' ')}`.toLowerCase().includes(term)) out.push({ q, roundId: r.id, roundLabel: r.label });
      }
    }
    return out.slice(0, 100);
  }, [search, set]);

  return (
    <div className="container">
      <p className="small">
        <a href={href('/library')}>Library</a> /
      </p>
      <PageHeader title={`${set.title}${set.year ? ` (${set.year})` : ''}`}>
        <p>
          {set.rounds.length} rounds. Per DOE, rounds 1–10 of a set are about equal in difficulty and later rounds get harder.
          {set.sourcePage && (
            <>
              {' '}
              <a href={set.sourcePage} target="_blank" rel="noreferrer">
                Official page
              </a>
            </>
          )}
        </p>
      </PageHeader>

      <div className="field" style={{ maxWidth: 420, marginBottom: '1rem' }}>
        <label htmlFor="search">Search this set</label>
        <input id="search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="A word from a question or answer" />
      </div>
      {search.trim().length >= 3 && (
        <section style={{ marginBottom: '1.5rem' }}>
          <h2>
            {results.length} match{results.length === 1 ? '' : 'es'}
            {results.length === 100 ? ' (first 100)' : ''}
          </h2>
          <div className="stack">
            {results.map(({ q, roundId, roundLabel }) => (
              <QuestionView key={q.id} q={q} extra={<a href={href(`/library/${set.id}/${roundId}`)}>{roundLabel}</a>} />
            ))}
          </div>
        </section>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Round</th>
              <th className="num">Toss-ups</th>
              <th>Subjects</th>
              <th className="num">Heard by team</th>
              <th>Original</th>
            </tr>
          </thead>
          <tbody>
            {set.rounds.map((r) => {
              const qs = roundQuestions(r);
              const heard = qs.filter((q) => seen.has(q.id)).length;
              const subjects = [...new Set(r.pairs.map((p) => p.tossup.subject))];
              return (
                <tr key={r.id}>
                  <td>
                    <a href={href(`/library/${set.id}/${r.id}`)}>{r.label}</a>
                  </td>
                  <td className="num">{r.pairs.length}</td>
                  <td>
                    <div className="row" style={{ gap: '0.25rem' }}>
                      {subjects.map((s) => (
                        <SubjectTag key={s} subject={s} />
                      ))}
                    </div>
                  </td>
                  <td className="num">{heard ? `${heard} / ${qs.length}` : '–'}</td>
                  <td>
                    {r.sourceUrl ? (
                      <a href={r.sourceUrl} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    ) : (
                      '–'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Put a question in the selected player's review queue. */
function ReviewButton({ q }: { q: Question }) {
  const data = useData();
  const player = data.players.find((p) => p.active && p.id === data.settings.soloPlayerId);
  if (!player) return null;
  const card = data.cards[cardId(player.id, q.id)];
  if (card) {
    const due = card.fsrs.due <= Date.now() ? 'due now' : `next ${dateText(new Date(card.fsrs.due).toISOString())}`;
    return (
      <span className="small muted no-print">
        In {player.name}'s review queue ({due})
      </span>
    );
  }
  return (
    <button className="btn btn-small btn-ghost no-print" onClick={() => addToReview(player.id, q)} title={`Add to ${player.name}'s review queue`}>
      Add to my review
    </button>
  );
}

function ReportButton({ q }: { q: Question }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  if (sent) return <span className="small muted">Thanks, saved to Data → Problem reports.</span>;
  if (!open)
    return (
      <button className="btn btn-small btn-ghost no-print" onClick={() => setOpen(true)}>
        Report a problem
      </button>
    );
  return (
    <form
      className="no-print"
      onSubmit={(e) => {
        e.preventDefault();
        reportProblem(q.id, note || 'Problem with this question');
        setSent(true);
      }}
      style={{ display: 'grid', gap: '0.4rem', marginTop: '0.4rem' }}
    >
      <label className="small" htmlFor={`report-${q.id}`}>
        What's wrong? (wrong answer, missing text, bad formatting…)
      </label>
      <textarea id={`report-${q.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row">
        <button className="btn btn-small btn-primary" type="submit">
          Save report
        </button>
        <button className="btn btn-small" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RoundView({ set, roundId, autoPrint }: { set: QuestionSet; roundId: string; autoPrint: boolean }) {
  const round = findRound(set, roundId);
  const [subject, setSubject] = useState<Subject | 'all'>('all');
  const [kind, setKind] = useState<'both' | 'tossup' | 'bonus'>('both');
  const [showAnswers, setShowAnswers] = useState(true);
  const data = useData();

  useEffect(() => {
    if (autoPrint && round) setTimeout(() => window.print(), 300);
  }, [autoPrint, round]);

  if (!round) return <div className="container"><Notice kind="error">Round not found.</Notice></div>;
  const subjects = [...new Set(round.pairs.map((p) => p.tossup.subject))];
  const pairs = round.pairs.filter((p) => subject === 'all' || p.tossup.subject === subject);
  const heardBy = (q: Question) => data.players.filter((p) => p.active && data.seen[p.id]?.[q.id]).map((p) => p.name);

  return (
    <div className="container">
      <p className="small no-print">
        <a href={href('/library')}>Library</a> / <a href={href(`/library/${set.id}`)}>{set.title}</a> /
      </p>
      <PageHeader title={`${set.title}, ${round.label}`}>
        <div className="row no-print">
          <a className="btn btn-primary" href={href(`/reader?set=${set.id}&round=${round.id}`)}>
            Play this round in the Reader console
          </a>
          <a className="btn" href={href(`/try?set=${set.id}&round=${round.id}`)}>
            Practice it solo
          </a>
          <button className="btn" onClick={() => window.print()}>
            Print
          </button>
          {round.sourceUrl && (
            <a className="btn btn-ghost" href={round.sourceUrl} target="_blank" rel="noreferrer">
              Original PDF
            </a>
          )}
        </div>
      </PageHeader>

      <div className="row no-print" style={{ marginBottom: '1rem' }}>
        <select aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value as Subject | 'all')} style={{ width: 'auto' }}>
          <option value="all">All subjects</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {SUBJECT_LABELS[s]}
            </option>
          ))}
        </select>
        <select aria-label="Question type" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} style={{ width: 'auto' }}>
          <option value="both">Toss-ups and bonuses</option>
          <option value="tossup">Toss-ups only</option>
          <option value="bonus">Bonuses only</option>
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} /> Show answers
        </label>
      </div>

      <div className="stack">
        {pairs.map((p) => {
          const qs = [kind !== 'bonus' ? p.tossup : null, kind !== 'tossup' ? p.bonus : null].filter(Boolean) as Question[];
          return qs.map((q) => {
            const heard = heardBy(q);
            return (
              <div key={q.id}>
                <QuestionView
                  q={q}
                  showAnswer={showAnswers}
                  extra={heard.length > 0 ? <span className="muted small no-print">Heard by {heard.join(', ')}</span> : undefined}
                />
                <div className="row" style={{ gap: '0.25rem' }}>
                  <ReviewButton q={q} />
                  <ReportButton q={q} />
                </div>
              </div>
            );
          });
        })}
      </div>
      <p className="small muted" style={{ marginTop: '1.5rem' }}>
        {set.credit}
      </p>
    </div>
  );
}

export function LibraryPage({ setId, roundId, print }: { setId?: string; roundId?: string; print: boolean }) {
  const set = useSet(setId ?? null);
  if (!setId) return <SetList />;
  if (set.loading) return <div className="container"><Loading what="Loading the set" /></div>;
  if (set.error || !set.data) return <div className="container"><LoadError error={set.error ?? new Error('Set not found')} /></div>;
  if (!roundId) return <SetView set={set.data} />;
  return <RoundView set={set.data} roundId={roundId} autoPrint={print} />;
}
