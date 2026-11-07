import { useMemo, useState } from 'react';
import { LoadError, Loading, PageHeader } from '../components/ui';
import { useTip } from '../components/VizTip';
import { CORE_SUBJECTS, SUBJECT_LABELS, type Catalog, type CoreSubject } from '../core/schema';
import { topicsForSubject } from '../core/taxonomy';
import { useCatalog } from '../lib/library';
import { href } from '../lib/router';

interface TopicRow {
  id: string;
  name: string;
  subject: CoreSubject;
  total: number;
  tossups: number;
  bonuses: number;
}

interface SubjectBlock {
  subject: CoreSubject;
  total: number;
  untagged: number;
  topics: TopicRow[];
}

function summarize(catalog: Catalog): SubjectBlock[] {
  return CORE_SUBJECTS.map((subject) => {
    const rows = catalog.questions.filter((r) => r[1] === subject);
    const topics = topicsForSubject(subject)
      .map((t) => {
        const mine = rows.filter((r) => r[2] === t.id);
        return { id: t.id, name: t.name, subject, total: mine.length, tossups: mine.filter((r) => r[3] === 't').length, bonuses: mine.filter((r) => r[3] === 'b').length };
      })
      .filter((t) => t.total > 0)
      .sort((a, b) => b.total - a.total);
    return { subject, total: rows.length, untagged: rows.filter((r) => !r[2]).length, topics };
  });
}

/** Energy questions by the discipline they really test. */
function energyCross(catalog: Catalog): Array<{ subject: CoreSubject; n: number }> {
  const counts = new Map<CoreSubject, number>();
  for (const r of catalog.questions) if (r[1] === 'energy' && r[5]) counts.set(r[5], (counts.get(r[5]) ?? 0) + 1);
  return [...counts.entries()].map(([subject, n]) => ({ subject, n })).sort((a, b) => b.n - a.n);
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');

function SubjectBars({ block, max }: { block: SubjectBlock; max: number }) {
  const { ref, node, handlers } = useTip();
  return (
    <figure className="card viz" ref={ref} style={{ marginInline: 0, marginBottom: 0 }}>
      <h2 style={{ margin: 0 }}>{SUBJECT_LABELS[block.subject]}</h2>
      <figcaption className="small muted" style={{ margin: '0.25rem 0 0.75rem' }}>
        {block.total.toLocaleString()} questions
        {block.untagged > 0 && ` · ${block.untagged.toLocaleString()} (${pct(block.untagged, block.total)}) not matched to a topic`}
      </figcaption>
      {/* One label width for every subject, so equal counts draw equal bars across the page. */}
      <div className="hbar-chart fixed-labels">
        {block.topics.map((t) => (
          <div key={t.id} style={{ display: 'contents' }}>
            <a className="hbar-label" href={href(`/try?mode=subject&subject=${t.subject}&topic=${encodeURIComponent(t.id)}&count=8`)}>
              {t.name}
            </a>
            <div className="hbar-track">
              <div className="hbar-area">
                <div
                  className="hbar"
                  style={{ width: `${(t.total / max) * 100}%` }}
                  tabIndex={0}
                  role="img"
                  aria-label={`${t.name}: ${t.total} questions, ${pct(t.total, block.total)} of ${SUBJECT_LABELS[t.subject]}`}
                  {...handlers(
                    <>
                      <strong>{t.total.toLocaleString()}</strong>
                      {t.name} · {pct(t.total, block.total)} of {SUBJECT_LABELS[t.subject]} · {t.tossups} toss-ups, {t.bonuses} bonuses
                    </>,
                  )}
                />
                <span className="hbar-value" style={{ left: `${(t.total / max) * 100}%` }}>
                  {t.total} · {pct(t.total, block.total)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {node}
    </figure>
  );
}

export function TopicsPage() {
  const catalog = useCatalog();
  const [table, setTable] = useState(false);
  const blocks = useMemo(() => (catalog.data ? summarize(catalog.data) : []), [catalog.data]);
  const cross = useMemo(() => (catalog.data ? energyCross(catalog.data) : []), [catalog.data]);
  const max = Math.max(1, ...blocks.flatMap((b) => b.topics.map((t) => t.total)));
  const energyTotal = blocks.find((b) => b.subject === 'energy')?.total ?? 0;

  return (
    <div className="container">
      <p className="small">
        <a href={href('/library')}>Library</a> /
      </p>
      <PageHeader title="Topics">
        <p>
          How often each topic comes up across the DOE sample sets, toss-ups and bonuses together, so you can see what to learn first. Topics come
          from keyword rules, so a few questions sit in a neighboring topic. Select a topic to drill it.
        </p>
      </PageHeader>
      {catalog.loading && <Loading what="Loading the topic list" />}
      {catalog.error && <LoadError error={catalog.error} />}
      {catalog.data && (
        <>
          <div className="row" style={{ marginBottom: '1rem' }}>
            <button className="btn btn-small btn-ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>
              {table ? 'Show charts' : 'Show as a table'}
            </button>
          </div>
          {cross.length > 0 && (
            <p className="small" style={{ maxWidth: '75ch' }}>
              <strong>Energy is tagged twice.</strong> Its questions really test other subjects:{' '}
              {cross.map((c, i) => (
                <span key={c.subject}>
                  {i > 0 && ', '}
                  {SUBJECT_LABELS[c.subject].toLowerCase()} {pct(c.n, energyTotal)}
                </span>
              ))}
              . Drills in those subjects can include them (Practice → subject drill).
            </p>
          )}
          {table ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Topic</th>
                    <th className="num">Questions</th>
                    <th className="num">Share of subject</th>
                    <th className="num">Toss-ups</th>
                    <th className="num">Bonuses</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.flatMap((b) =>
                    b.topics.map((t) => (
                      <tr key={t.id}>
                        <td>{SUBJECT_LABELS[b.subject]}</td>
                        <td>
                          <a href={href(`/try?mode=subject&subject=${t.subject}&topic=${encodeURIComponent(t.id)}&count=8`)}>{t.name}</a>
                        </td>
                        <td className="num">{t.total}</td>
                        <td className="num">{pct(t.total, b.total)}</td>
                        <td className="num">{t.tossups}</td>
                        <td className="num">{t.bonuses}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="stack">
              {blocks.map((b) => (
                <SubjectBars key={b.subject} block={b} max={max} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
