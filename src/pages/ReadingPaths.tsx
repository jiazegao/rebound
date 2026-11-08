import { signInHref } from '../components/Gates';
import { LoadError, Notice, PageHeader, SubjectTag } from '../components/ui';
import { READING_PATHS, type ReadingPath } from '../core/readingPaths';
import { CORE_SUBJECTS, SUBJECT_LABELS, type CoreSubject } from '../core/schema';
import { topicById } from '../core/taxonomy';
import { dateText } from '../lib/format';
import { useCatalog } from '../lib/library';
import { href } from '../lib/router';
import { markReadingDone, readingKey, useCurrentPlayer, useData } from '../lib/store';

function stepsRead(read: Record<string, number> | undefined, path: ReadingPath): number {
  return path.steps.filter((s) => read?.[readingKey(s.topic)]).length;
}

/** Reading paths (proposal 4.1): each subject's topics in prerequisite order, with free readings and a check after each. */
export function ReadingPathsPage({ subject }: { subject?: string }) {
  if (subject && (CORE_SUBJECTS as string[]).includes(subject)) return <PathView subject={subject as CoreSubject} />;
  return <PathList />;
}

function PathList() {
  const data = useData();
  const player = useCurrentPlayer();
  const read = player ? data.conceptReads[player.id] : undefined;
  return (
    <div className="container">
      <p className="small">
        <a href={href('/learn')}>Learn</a> /
      </p>
      <PageHeader title="Reading paths">
        <p>
          For each subject, the topics in the order to learn them. Each step says what NSB asks about, links to a free textbook section or agency
          page, and ends with a short check drawn from real DOE questions on that topic.
        </p>
      </PageHeader>
      {!player && (
        <Notice>
          <a href={signInHref()}>Sign in</a> to keep track of what you have read.
        </Notice>
      )}
      <div className="grid">
        {CORE_SUBJECTS.map((s) => {
          const path = READING_PATHS[s];
          return (
            <a key={s} className="card" href={href(`/learn/paths/${s}`)}>
              <h3 style={{ marginTop: 0 }}>
                <SubjectTag subject={s} />
              </h3>
              <p className="small" style={{ margin: 0 }}>
                {path.intro}
              </p>
              <p className="small muted" style={{ marginBottom: 0 }}>
                {path.steps.length} steps{player ? ` · ${stepsRead(read, path)} read` : ''}
              </p>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function PathView({ subject }: { subject: CoreSubject }) {
  const data = useData();
  const player = useCurrentPlayer();
  const catalog = useCatalog();
  const path = READING_PATHS[subject];
  const read = player ? (data.conceptReads[player.id] ?? {}) : {};
  const next = player ? path.steps.find((s) => !read[readingKey(s.topic)]) : undefined;
  const done = stepsRead(read, path);
  return (
    <div className="container narrow">
      <p className="small">
        <a href={href('/learn')}>Learn</a> / <a href={href('/learn/paths')}>Reading paths</a> /
      </p>
      <PageHeader title={`${SUBJECT_LABELS[subject]} reading path`}>
        <p>{path.intro}</p>
        {player && (
          <p className="small muted">
            {player.name}: {done} of {path.steps.length} steps read{done === path.steps.length ? '. The whole path: well done.' : '.'}
          </p>
        )}
      </PageHeader>
      {catalog.error && <LoadError error={catalog.error} />}
      <ol className="stack" style={{ paddingLeft: 0, listStyle: 'none' }}>
        {path.steps.map((step, i) => {
          const topic = topicById(step.topic);
          const doneAt = read[readingKey(step.topic)];
          const questions = catalog.data?.topicCounts[step.topic] ?? 0;
          return (
            <li key={step.topic} className="card stack" style={next === step ? { borderColor: 'var(--accent)', borderWidth: 2 } : undefined}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                  {i + 1}. {topic?.name ?? step.topic}
                </h2>
                {doneAt ? <span className="badge">Read {dateText(new Date(doneAt).toISOString())}</span> : next === step ? <span className="badge">Up next</span> : null}
              </div>
              <p style={{ margin: 0 }}>{step.focus}</p>
              <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {step.readings.map((r) => (
                  <li key={r.url}>
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.title}
                    </a>{' '}
                    · {r.source}
                    {r.minutes ? ` · about ${r.minutes} min` : ''} <span className="muted">({r.license})</span>
                  </li>
                ))}
              </ul>
              <div className="row">
                {questions > 0 ? (
                  <a className="btn btn-small btn-primary" href={href(`/try?mode=subject&subject=${subject}&topic=${encodeURIComponent(step.topic)}&count=5&go=1`)}>
                    Check yourself: 5 questions
                  </a>
                ) : (
                  catalog.data && <span className="small muted">No library questions on this topic yet.</span>
                )}
                {player && !doneAt && (
                  <button className="btn btn-small" onClick={() => markReadingDone(player.id, step.topic)}>
                    I read it
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="small muted">
        The readings are free to read online; each link shows its license. The OpenStax books are CC BY-NC-SA 4.0, Physical Geology (Steven
        Earle, BCcampus) is CC BY 4.0, and the U.S. agency pages (EIA, DOE, NOAA, USGS) are public domain.
      </p>
    </div>
  );
}
