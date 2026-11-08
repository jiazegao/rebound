import { useMemo, useState } from 'react';
import { fileSlug } from '../components/Downloads';
import { QuestionView } from '../components/QuestionView';
import { Loading, Notice, PageHeader, SubjectTag } from '../components/ui';
import { UPLOAD_LEVEL_LABEL } from '../core/levels';
import { toQuestionsDoc } from '../core/nsbjson';
import {
  CORE_SUBJECTS,
  LETTERS,
  SUBJECT_LABELS,
  type AnswerFormat,
  type CoreSubject,
  type Letter,
  type Player,
  type Question,
  type QuestionKind,
  type UploadLevel,
  type WriteStatus,
  type WrittenQuestion,
} from '../core/schema';
import { canReview, checkWritten, describeWritten, hasErrors, nearDuplicates, normalizeWritten, packetFromWritten, similarWritten } from '../core/studio';
import { AI_RESTRICTED_TEXT, aiDraftQuestions, aiRestrictedSource, MAX_AI_DRAFTS, MAX_PASSAGE_CHARS, MIN_PASSAGE_CHARS, usageText, useAiStatus } from '../lib/ai';
import { roundToDocx } from '../lib/docx';
import { dateText, downloadBlob, downloadFile, newId } from '../lib/format';
import { loadQuestions, useAsync } from '../lib/library';
import { href, navigate } from '../lib/router';
import { deleteWritten, savePacket, saveWritten, useData } from '../lib/store';

const STATUS_TEXT: Record<WriteStatus, string> = { draft: 'Draft', review: 'Waiting for review', approved: 'Approved' };

interface Fingerprints {
  count: number;
  items: Array<[string, string]>;
}

let fingerprintPromise: Promise<Fingerprints> | null = null;
function loadFingerprints(): Promise<Fingerprints> {
  fingerprintPromise ??= fetch('data/doe/fingerprints.json')
    .then((r) => (r.ok ? (r.json() as Promise<Fingerprints>) : { count: 0, items: [] }))
    .catch(() => {
      fingerprintPromise = null;
      return { count: 0, items: [] };
    });
  return fingerprintPromise;
}

function blankQuestion(id: string, subject: CoreSubject): Question {
  return {
    id,
    kind: 'tossup',
    number: 1,
    subject,
    sourceCategory: SUBJECT_LABELS[subject].toUpperCase(),
    format: 'short_answer',
    stem: '',
    answer: '',
    accept: [],
    reject: [],
    answerRaw: '',
    source: { provider: 'team', setId: 'wq', roundId: 'wq', credit: '' },
  };
}

function splitList(s: string): string[] {
  return s
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);
}

function useMe(): Player | null {
  const data = useData();
  return data.players.find((p) => p.id === data.settings.soloPlayerId) ?? null;
}

/* ---------------- the editor ---------------- */

function Editor({ existing }: { existing: WrittenQuestion | null }) {
  const data = useData();
  const me = useMe();
  const names = new Map(data.players.map((p) => [p.id, p.name]));
  const [id] = useState(() => existing?.id ?? `wq-${newId('w')}`);
  const [q, setQ] = useState<Question>(() => existing?.question ?? blankQuestion(id, (me?.primarySubject as CoreSubject | undefined) ?? 'biology'));
  const [acceptText, setAcceptText] = useState((existing?.question.accept ?? []).join('; '));
  const [rejectText, setRejectText] = useState((existing?.question.reject ?? []).join('; '));
  const [sources, setSources] = useState(existing?.sources.length ? existing.sources : [{ title: '', url: '' }]);
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const question = useMemo(
    () => normalizeWritten({ ...q, id, sourceCategory: SUBJECT_LABELS[q.subject as CoreSubject].toUpperCase(), accept: splitList(acceptText), reject: splitList(rejectText) }),
    [q, id, acceptText, rejectText],
  );
  const cleanSources = sources.map((s) => ({ title: s.title.trim(), ...(s.url?.trim() ? { url: s.url.trim() } : {}) })).filter((s) => s.title);
  const checks = checkWritten({ question, sources: cleanSources });
  const errors = hasErrors(checks);
  const fingerprints = useAsync('fingerprints', loadFingerprints);
  const dupes = useMemo(() => (fingerprints.data ? nearDuplicates(question, fingerprints.data.items) : []), [fingerprints.data, question]);
  const dupeQuestions = useAsync(dupes.length ? dupes.map((d) => d.id).join(',') : null, () => loadQuestions(dupes.map((d) => d.id)));
  const similar = similarWritten(question, data.written, id);
  const status: WriteStatus = existing?.status ?? 'draft';
  const reviewer = existing ? canReview(existing, me) : false;

  const store = (next: Partial<WrittenQuestion>, message: string) => {
    const now = new Date().toISOString();
    saveWritten({
      id,
      question,
      status,
      authorId: existing?.authorId ?? me?.id ?? null,
      reviewerId: existing?.reviewerId ?? null,
      sources: cleanSources,
      comments: existing?.comments ?? [],
      ...(existing?.ai ? { ai: existing.ai } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...next,
    });
    setSaved(message);
    if (!existing) navigate(`/write/${id}`);
  };

  // Editing an approved question sends it back for review: the approval was for the old wording.
  const edited = existing && JSON.stringify(existing.question) !== JSON.stringify(question);
  const setField = <K extends keyof Question>(key: K, value: Question[K]) => setQ((cur) => ({ ...cur, [key]: value }));

  return (
    <div className="container">
      <p className="small">
        <a href={href('/write')}>Write</a> /
      </p>
      <PageHeader title={existing ? 'Edit a question' : 'New question'}>
        <p>
          {existing ? (
            <>
              {STATUS_TEXT[status]}
              {existing.authorId && ` · written by ${names.get(existing.authorId) ?? 'a former member'}`}
              {existing.reviewerId && ` · approved by ${names.get(existing.reviewerId) ?? 'a former member'}`}
              {existing.ai && ' · AI-drafted'}
            </>
          ) : (
            "Write it the way DOE does: the subject, the question, then the answer line. Checks run as you type."
          )}
        </p>
      </PageHeader>
      {existing?.ai && (
        <Notice kind={existing.ai.blindAgreed === false ? 'warn' : 'info'}>
          An AI model ({existing.ai.model}) drafted this from {existing.ai.passageSource || 'a cited passage'}
          {existing.ai.blindAnswer === undefined
            ? '; the blind answer check did not run'
            : existing.ai.blindAgreed
              ? `; a second call, answering without the key, agreed ("${existing.ai.blindAnswer}")`
              : `; a second call, answering without the key, said "${existing.ai.blindAnswer}" instead, so check the key`}
          . Check every fact against the source before approving. AI-drafted questions stay in your team's practice.
          {existing.ai.support && (
            <>
              <br />
              <span className="small">The passage says: “{existing.ai.support}”</span>
            </>
          )}
        </Notice>
      )}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card stack" aria-label="Question">
          <div className="grid">
            <div className="field">
              <label htmlFor="wq-kind">Kind</label>
              <select id="wq-kind" value={q.kind} onChange={(e) => setField('kind', e.target.value as QuestionKind)}>
                <option value="tossup">Toss-up</option>
                <option value="bonus">Bonus</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="wq-subject">Subject</label>
              <select id="wq-subject" value={q.subject} onChange={(e) => setField('subject', e.target.value as CoreSubject)}>
                {CORE_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {SUBJECT_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="wq-format">Type</label>
              <select
                id="wq-format"
                value={q.format}
                onChange={(e) => {
                  const format = e.target.value as AnswerFormat;
                  setQ((cur) => ({ ...cur, format, ...(format === 'multiple_choice' ? { choices: cur.choices ?? { W: '', X: '', Y: '', Z: '' }, answerLetter: cur.answerLetter ?? 'W' } : {}) }));
                }}
              >
                <option value="short_answer">Short answer</option>
                <option value="multiple_choice">Multiple choice</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="wq-stem">Question</label>
            <textarea id="wq-stem" rows={4} value={q.stem} maxLength={1200} onChange={(e) => setField('stem', e.target.value)} />
            <span className="hint">Put pronunciation guides in brackets: [sigh-toe-kines]. Name the unit in the question ("In meters per second, …").</span>
          </div>
          {q.format === 'multiple_choice' ? (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">Choices (mark the right one)</legend>
              {LETTERS.map((L: Letter) => (
                <div key={L} className="row" style={{ flexWrap: 'nowrap' }}>
                  <label className="checkbox">
                    <input type="radio" name="wq-letter" checked={q.answerLetter === L} onChange={() => setField('answerLetter', L)} aria-label={`${L} is right`} /> {L})
                  </label>
                  <input
                    type="text"
                    aria-label={`Choice ${L}`}
                    value={q.choices?.[L] ?? ''}
                    maxLength={300}
                    onChange={(e) => setQ((cur) => ({ ...cur, choices: { ...(cur.choices ?? { W: '', X: '', Y: '', Z: '' }), [L]: e.target.value } }))}
                  />
                </div>
              ))}
            </fieldset>
          ) : (
            <>
              <div className="field">
                <label htmlFor="wq-answer">Answer</label>
                <input id="wq-answer" type="text" value={q.answer} maxLength={300} onChange={(e) => setField('answer', e.target.value)} />
                <span className="hint">As DOE prints it: words in capitals, numbers in exact simplest form.</span>
              </div>
              <div className="field">
                <label htmlFor="wq-accept">Also accept</label>
                <input id="wq-accept" type="text" value={acceptText} placeholder="Separate with semicolons" onChange={(e) => setAcceptText(e.target.value)} />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="wq-reject">Do not accept</label>
            <input id="wq-reject" type="text" value={rejectText} placeholder="Close answers that are wrong, separated with semicolons" onChange={(e) => setRejectText(e.target.value)} />
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">Sources</legend>
            {sources.map((s, i) => (
              <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
                <input type="text" aria-label={`Source ${i + 1}`} placeholder="e.g. OpenStax Biology 2e, 10.2 The Cell Cycle" value={s.title} onChange={(e) => setSources(sources.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
                <input type="url" aria-label={`Source ${i + 1} link`} placeholder="https://…" value={s.url ?? ''} onChange={(e) => setSources(sources.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))} />
                {sources.length > 1 && (
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => setSources(sources.filter((_, k) => k !== i))} aria-label={`Remove source ${i + 1}`}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn btn-small btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setSources([...sources, { title: '', url: '' }])}>
              Add a source
            </button>
          </fieldset>
        </section>

        <section className="stack" aria-label="Preview and checks">
          <div className="card stack">
            <h2 style={{ margin: 0 }}>Checks</h2>
            {checks.length === 0 ? (
              <p className="small" style={{ margin: 0, color: 'var(--good)' }}>
                No problems found.
              </p>
            ) : (
              <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {checks.map((c) => (
                  <li key={c.code} style={{ color: c.level === 'error' ? 'var(--bad)' : 'var(--warn)' }}>
                    {c.level === 'error' ? 'Fix: ' : 'Consider: '}
                    {c.message}
                  </li>
                ))}
              </ul>
            )}
            {fingerprints.loading && <Loading what="Checking the library for duplicates" />}
            {dupes.length > 0 && (
              <div className="small">
                <strong>Possible duplicates in the library:</strong>
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {dupes.map((d) => {
                    const loc = dupeQuestions.data?.get(d.id);
                    return (
                      <li key={d.id}>
                        {loc ? (
                          <a href={href(`/library/${loc.set.id}/${loc.round.id}`)}>
                            {loc.set.title}, {loc.round.label}
                          </a>
                        ) : (
                          d.id
                        )}
                        {loc && `: ${loc.question.stem.slice(0, 120)}${loc.question.stem.length > 120 ? '…' : ''}`}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {similar.length > 0 && (
              <div className="small">
                <strong>Similar to your team's:</strong>{' '}
                {similar.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && ', '}
                    <a href={href(`/write/${s.id}`)}>{data.written.find((w) => w.id === s.id)?.question.stem.slice(0, 60)}…</a>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="small muted" style={{ margin: '0 0 0.25rem' }}>
              {describeWritten(question)}
            </p>
            <QuestionView q={question} />
          </div>
        </section>
      </div>

      {saved && <Notice>{saved}</Notice>}
      <div className="row" style={{ marginTop: '1rem' }}>
        {(status === 'draft' || !existing) && (
          <>
            <button className="btn" onClick={() => store({ status: 'draft' }, 'Draft saved.')} disabled={!question.stem.trim()}>
              Save draft
            </button>
            <button
              className="btn btn-primary"
              disabled={errors}
              onClick={() => store({ status: 'review', reviewerId: null }, `Sent to the ${SUBJECT_LABELS[question.subject as CoreSubject]} owner for review.`)}
            >
              Send for review
            </button>
          </>
        )}
        {status === 'review' && existing && (
          <>
            {edited && (
              <button className="btn" onClick={() => store({ status: 'review' }, 'Changes saved; still waiting for review.')}>
                Save changes
              </button>
            )}
            {reviewer && !edited && (
              <button className="btn btn-good" disabled={errors} onClick={() => store({ status: 'approved', reviewerId: me!.id }, 'Approved: it can now go into team packets.')}>
                Approve
              </button>
            )}
            {!reviewer && <span className="small muted">Waiting for the subject owner (or a captain or coach) to review it.</span>}
          </>
        )}
        {status === 'approved' && existing && edited && (
          <button className="btn btn-primary" disabled={errors} onClick={() => store({ status: 'review', reviewerId: null }, 'Changes saved and sent back for review.')}>
            Save and send back for review
          </button>
        )}
        {existing && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (confirm('Delete this question for the whole team?')) {
                deleteWritten(existing.id);
                navigate('/write');
              }
            }}
          >
            Delete
          </button>
        )}
      </div>

      {existing && (
        <section className="card stack" style={{ marginTop: '1rem' }} aria-labelledby="wq-comments">
          <h2 id="wq-comments" style={{ margin: 0 }}>
            Review notes
          </h2>
          {existing.comments.length === 0 && <p className="small muted" style={{ margin: 0 }}>No notes yet.</p>}
          {existing.comments.map((c, i) => (
            <p key={i} className="small" style={{ margin: 0 }}>
              <strong>{c.by ? (names.get(c.by) ?? 'A former member') : 'Someone'}</strong> ({dateText(c.at)}): {c.text}
            </p>
          ))}
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!comment.trim()) return;
              const note = { by: me?.id ?? null, text: comment.trim(), at: new Date().toISOString() };
              const askChanges = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-action') === 'changes';
              saveWritten({ ...existing, comments: [...existing.comments, note], ...(askChanges ? { status: 'draft', reviewerId: null } : {}) });
              setComment('');
              setSaved(askChanges ? 'Sent back to the author with your note.' : 'Note added.');
            }}
          >
            <label htmlFor="wq-comment" className="label">
              Add a note
            </label>
            <textarea id="wq-comment" rows={2} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
            <div className="row">
              <button className="btn btn-small" type="submit" data-action="note" disabled={!comment.trim()}>
                Add note
              </button>
              {status === 'review' && reviewer && (
                <button className="btn btn-small btn-bad" type="submit" data-action="changes" disabled={!comment.trim()}>
                  Ask for changes
                </button>
              )}
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

/* ---------------- AI drafts (optional) ---------------- */

type DraftKind = 'either' | 'tossup' | 'bonus';

/** Drafts from a pasted, cited passage, when the team server has AI help. They land in "Your drafts", labeled. */
function AiDrafts() {
  const ai = useAiStatus();
  const me = useMe();
  const [subject, setSubject] = useState<CoreSubject>(() => (CORE_SUBJECTS as string[]).includes(me?.primarySubject ?? '') ? (me!.primarySubject as CoreSubject) : 'biology');
  const [kind, setKind] = useState<DraftKind>('either');
  const [count, setCount] = useState(3);
  const [source, setSource] = useState('');
  const [url, setUrl] = useState('');
  const [passage, setPassage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<number | null>(null);
  if (!ai?.enabled) return null;
  const left = Math.max(0, (ai.dailyLimit ?? 0) - (ai.usedToday ?? 0));
  const calls = count + 1;
  const length = passage.trim().length;
  const restricted = aiRestrictedSource(`${source} ${url}`);
  const ready = length >= MIN_PASSAGE_CHARS && length <= MAX_PASSAGE_CHARS && source.trim().length > 0 && calls <= left && !busy && !restricted;
  return (
    <details className="card" style={{ marginBottom: '1rem' }}>
      <summary>
        <strong>Draft from a passage (AI)</strong>
      </summary>
      <form
        className="stack"
        style={{ marginTop: '0.75rem' }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready) return;
          setBusy(true);
          setError(null);
          setMade(null);
          try {
            const res = await aiDraftQuestions({ passage: passage.trim(), source: source.trim(), subject, kind, count });
            const now = new Date().toISOString();
            for (const d of res.drafts) {
              const id = `wq-${newId('w')}`;
              const question = normalizeWritten({
                ...blankQuestion(id, subject),
                kind: d.kind,
                format: d.format,
                stem: d.stem,
                answer: d.answer,
                accept: d.accept,
                ...(d.format === 'multiple_choice' && d.choices && d.answerLetter ? { choices: d.choices, answerLetter: d.answerLetter } : {}),
              });
              saveWritten({
                id,
                question,
                status: 'draft',
                authorId: me?.id ?? null,
                reviewerId: null,
                sources: [{ title: source.trim(), ...(url.trim() ? { url: url.trim() } : {}) }],
                comments: [],
                ai: {
                  model: res.model,
                  at: now,
                  passageSource: source.trim(),
                  ...(d.support ? { support: d.support } : {}),
                  ...(d.blindAnswer !== undefined ? { blindAnswer: d.blindAnswer, blindAgreed: d.blindAgreed === true } : {}),
                },
                createdAt: now,
                updatedAt: now,
              });
            }
            setMade(res.drafts.length);
            setPassage('');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'The drafts could not be made.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="small muted" style={{ margin: 0 }}>
          Paste a passage whose terms allow it, such as a U.S. government page (NASA, NOAA, USGS, EIA, DOE: public domain), and say where it is
          from. Not OpenStax: its license does not allow putting the books into AI tools. An AI model drafts questions from the passage, and a
          second call answers each one without the key, to catch a wrong answer line. The drafts land in Your drafts, labeled AI-drafted: check
          every fact against the source, then send them for review like any question. They stay in your team's practice.
        </p>
        <div className="grid">
          <div className="field">
            <label htmlFor="ai-subject">Subject</label>
            <select id="ai-subject" value={subject} onChange={(e) => setSubject(e.target.value as CoreSubject)}>
              {CORE_SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ai-kind">Kind</label>
            <select id="ai-kind" value={kind} onChange={(e) => setKind(e.target.value as DraftKind)}>
              <option value="either">Toss-ups and bonuses</option>
              <option value="tossup">Toss-ups</option>
              <option value="bonus">Bonuses</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="ai-count">How many</label>
            <select id="ai-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {Array.from({ length: MAX_AI_DRAFTS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="ai-source">Source</label>
            <input id="ai-source" type="text" maxLength={300} placeholder="e.g. EIA Energy Explained: Nuclear explained" value={source} onChange={(e) => setSource(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ai-url">Link (optional)</label>
            <input id="ai-url" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
        </div>
        {restricted && <Notice kind="warn">{AI_RESTRICTED_TEXT}</Notice>}
        <div className="field">
          <label htmlFor="ai-passage">
            Passage ({length.toLocaleString()} of {MAX_PASSAGE_CHARS.toLocaleString()} characters)
          </label>
          <textarea id="ai-passage" rows={8} value={passage} onChange={(e) => setPassage(e.target.value)} />
          {length > 0 && length < MIN_PASSAGE_CHARS && <span className="hint">Paste at least {MIN_PASSAGE_CHARS} characters: a few paragraphs works best.</span>}
          {length > MAX_PASSAGE_CHARS && <span className="hint" style={{ color: 'var(--warn)' }}>That is longer than {MAX_PASSAGE_CHARS.toLocaleString()} characters; paste one section.</span>}
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={!ready}>
            {busy ? 'Drafting… (this can take a minute)' : `Draft ${count} question${count === 1 ? '' : 's'}`}
          </button>
          <span className="small muted">
            Uses {calls} AI calls. {usageText(ai)}.{calls > left ? ' Not enough left today.' : ''}
          </span>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        {made !== null && (
          <Notice kind="good">
            {made} draft{made === 1 ? '' : 's'} added to Your drafts below. Open each one, check it against the source, and send it for review.
          </Notice>
        )}
      </form>
    </details>
  );
}

/* ---------------- the list ---------------- */

function Row({ w, names }: { w: WrittenQuestion; names: Map<string, string> }) {
  const errors = hasErrors(checkWritten(w));
  return (
    <tr>
      <td>
        <SubjectTag subject={w.question.subject} />
      </td>
      <td className="small">{w.question.kind === 'tossup' ? 'Toss-up' : 'Bonus'}</td>
      <td>
        <a href={href(`/write/${w.id}`)}>{w.question.stem.trim().slice(0, 90) || '(no question yet)'}</a>
        {w.ai && <span className="badge" style={{ marginLeft: '0.4rem' }}>AI-drafted</span>}
        {errors && w.status === 'draft' && <span className="small" style={{ color: 'var(--warn)', marginLeft: '0.4rem' }}>needs fixes</span>}
      </td>
      <td className="small">{STATUS_TEXT[w.status]}</td>
      <td className="small">{w.authorId ? (names.get(w.authorId) ?? '') : ''}</td>
    </tr>
  );
}

function Table({ list, names, empty }: { list: WrittenQuestion[]; names: Map<string, string>; empty: string }) {
  if (list.length === 0) return <p className="small muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Kind</th>
            <th>Question</th>
            <th>Status</th>
            <th>Writer</th>
          </tr>
        </thead>
        <tbody>
          {list.map((w) => (
            <Row key={w.id} w={w} names={names} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MakePacket({ approved }: { approved: WrittenQuestion[] }) {
  const data = useData();
  const [title, setTitle] = useState(`${data.team?.name ?? 'Team'} questions ${dateText(new Date().toISOString())}`);
  const [level, setLevel] = useState<UploadLevel>('regional');
  const [subjects, setSubjects] = useState<Set<CoreSubject>>(() => new Set(CORE_SUBJECTS));
  const chosen = approved.filter((w) => subjects.has(w.question.subject as CoreSubject));
  const tossups = chosen.filter((w) => w.question.kind === 'tossup').length;
  const credit = `Written by ${data.team?.name ?? 'the team'}`;
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (tossups === 0) return;
        const packetId = newId('pk');
        const set = packetFromWritten(chosen, { packetId, title: title.trim() || 'Team questions', credit });
        savePacket({ id: packetId, kind: 'upload', title: set.title, set, level });
        navigate(`/packets/${packetId}`);
      }}
    >
      <h2 style={{ margin: 0 }}>Make a packet from approved questions</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Toss-ups in rotating subjects, each with an approved bonus in its subject when there is one. The packet works like an uploaded one: play
        it in the Reader console, print it, or aim drills and scrimmages at its level.
      </p>
      <div className="row" style={{ gap: '0.25rem 1rem' }}>
        {CORE_SUBJECTS.map((s) => (
          <label key={s} className="checkbox">
            <input
              type="checkbox"
              checked={subjects.has(s)}
              onChange={(e) => {
                const next = new Set(subjects);
                if (e.target.checked) next.add(s);
                else next.delete(s);
                setSubjects(next);
              }}
            />{' '}
            {SUBJECT_LABELS[s]}
          </label>
        ))}
      </div>
      <div className="grid">
        <div className="field">
          <label htmlFor="mp-title">Packet name</label>
          <input id="mp-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="mp-level">How hard is it?</label>
          <select id="mp-level" value={level} onChange={(e) => setLevel(e.target.value as UploadLevel)}>
            {(Object.keys(UPLOAD_LEVEL_LABEL) as UploadLevel[]).map((l) => (
              <option key={l} value={l}>
                {UPLOAD_LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={tossups === 0}>
          Make the packet ({tossups} toss-up{tossups === 1 ? '' : 's'})
        </button>
        <span className="small muted">or download them:</span>
        <button
          type="button"
          className="btn btn-small"
          disabled={tossups === 0 || busy}
          onClick={async () => {
            setBusy(true);
            try {
              // One round with every pair, as the moderator's copy (AI-drafted questions keep their label).
              const set = packetFromWritten(chosen, { packetId: 'export', title: title.trim() || 'Team questions', credit, pairsPerRound: 10_000 });
              downloadBlob(`${fileSlug(set.title)}.docx`, await roundToDocx(set.rounds[0]!, { title: set.title, credit, answers: true }));
            } finally {
              setBusy(false);
            }
          }}
        >
          Word (.docx)
        </button>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          disabled={chosen.length === 0}
          title="Every chosen approved question in NSB-JSON, an open format other tools can read"
          onClick={() => {
            const questions = chosen.map((w) => ({ ...w.question, notes: [...(w.question.notes ?? []), ...(w.ai ? ['AI-drafted (internal practice only)'] : [])] }));
            const doc = toQuestionsDoc(questions, { title: title.trim() || 'Team questions', credit, license: 'Written by the team for its own practice.', level: data.team?.level });
            downloadFile(`${fileSlug(doc.title)}.nsb.json`, `${JSON.stringify(doc, null, 2)}\n`);
          }}
        >
          NSB-JSON
        </button>
      </div>
    </form>
  );
}

function WriteList() {
  const data = useData();
  const me = useMe();
  const names = new Map(data.players.map((p) => [p.id, p.name]));
  const toReview = data.written.filter((w) => w.status === 'review' && canReview(w, me));
  const mine = data.written.filter((w) => w.status === 'draft' && me && w.authorId === me.id);
  const inReview = data.written.filter((w) => w.status === 'review' && !toReview.includes(w));
  const approved = data.written.filter((w) => w.status === 'approved');
  const otherDrafts = data.written.filter((w) => w.status === 'draft' && !mine.includes(w));
  return (
    <div className="container">
      <p className="small">
        <a href={href('/team')}>Team</a> /
      </p>
      <PageHeader title="Write">
        <p>
          Strong teams write their own questions from their study materials. Write in DOE's format with automatic checks; the subject owner (or a
          captain or coach) reviews each one; approved questions become team packets.
        </p>
      </PageHeader>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <a className="btn btn-primary" href={href('/write/new')}>
          New question
        </a>
      </div>
      <AiDrafts />
      {toReview.length > 0 && (
        <>
          <h2>Waiting for your review ({toReview.length})</h2>
          <Table list={toReview} names={names} empty="" />
        </>
      )}
      <h2>Your drafts</h2>
      <Table list={mine} names={names} empty='No drafts. Start one with "New question".' />
      <h2>In review</h2>
      <Table list={inReview} names={names} empty="Nothing waiting for review." />
      <h2>Approved ({approved.length})</h2>
      <Table list={approved} names={names} empty="No approved questions yet." />
      {approved.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <MakePacket approved={approved} />
        </div>
      )}
      {otherDrafts.length > 0 && (
        <details style={{ marginTop: '1rem' }}>
          <summary>Other members' drafts ({otherDrafts.length})</summary>
          <Table list={otherDrafts} names={names} empty="" />
        </details>
      )}
    </div>
  );
}

export function WritePage({ id }: { id?: string }) {
  const data = useData();
  if (!data.team) {
    return (
      <div className="container narrow">
        <PageHeader title="Write" />
        <Notice>
          Teams write their own questions here. <a href={href('/team')}>Create or join a team</a> first.
        </Notice>
      </div>
    );
  }
  if (id === 'new') return <Editor key="new" existing={null} />;
  if (id) {
    const existing = data.written.find((w) => w.id === id);
    if (!existing) {
      return (
        <div className="container narrow">
          <Notice kind="error">That question is not in your team's questions (it may have been deleted).</Notice>
          <a href={href('/write')}>Back to Write</a>
        </div>
      );
    }
    return <Editor key={id} existing={existing} />;
  }
  return <WriteList />;
}
