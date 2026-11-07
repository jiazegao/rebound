import { Fragment, type ReactNode } from 'react';
import { PRONUNCIATION } from '../core/judge/normalize';
import { LETTERS, type Question } from '../core/schema';
import { topicById, topicName } from '../core/taxonomy';
import { SubjectTag } from './ui';

const GUIDE_SPLIT = new RegExp(`(${PRONUNCIATION.source})`, 'gu');
const GUIDE_ONLY = new RegExp(`^${PRONUNCIATION.source}$`, 'u');

/** Show pronunciation guides like "[sigh-toe-kines]" in a quieter style. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(GUIDE_SPLIT);
  return (
    <>
      {parts.map((part, i) =>
        GUIDE_ONLY.test(part) ? (
          <span key={i} className="pron">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function QuestionMeta({ q, extra }: { q: Question; extra?: ReactNode }) {
  return (
    <div className="question-meta">
      <span className="question-kind">{q.kind === 'tossup' ? 'TOSS-UP' : 'BONUS'}</span>
      <span>{q.number}</span>
      <SubjectTag subject={q.subject} />
      {q.topic && <span className="muted question-topic">{topicName(q.topic)}</span>}
      <span className="muted">{q.format === 'multiple_choice' ? 'Multiple choice' : 'Short answer'}</span>
      {q.visual && <span className="badge">Visual</span>}
      {extra}
    </div>
  );
}

export function Choices({ q }: { q: Question }) {
  if (!q.choices) return null;
  return (
    <ol className="choices" aria-label="Choices">
      {LETTERS.map((L) => (
        <li key={L}>
          <span className="choice-letter">{L})</span>
          <span>
            <RichText text={q.choices![L]} />
          </span>
        </li>
      ))}
    </ol>
  );
}

export function AnswerBox({ q }: { q: Question }) {
  return (
    <div className="answer-box">
      <div>
        <span className="muted small">ANSWER: </span>
        {q.answer.trim() || q.answerLetter ? (
          <strong>
            {q.answerLetter ? `${q.answerLetter}) ` : ''}
            <RichText text={q.answer} />
          </strong>
        ) : (
          <em>see the original PDF</em>
        )}
      </div>
      {q.accept.length > 0 && <div className="small">Also accept: {q.accept.join('; ')}</div>}
      {q.reject.length > 0 && <div className="small">Do not accept: {q.reject.join('; ')}</div>}
      {q.notes && q.notes.length > 0 && <div className="small muted">{q.notes.join(' · ')}</div>}
    </div>
  );
}

const FLAG_TEXT: Record<string, string> = {
  'possible-lost-formatting': 'Some math or symbols may not have come through from the PDF.',
  'image-not-extracted': 'Part of this question is an image in the original PDF.',
  'answer-missing': 'The answer is an image in the original PDF.',
  'choices-missing': 'The answer choices could not be read from the PDF.',
  'answer-letter-corrected': 'The printed answer letter did not match the printed answer, so Rebound corrected the letter.',
  'choice-letters-fixed': 'The choice letters were repaired during import.',
  'choices-reordered': 'The PDF printed the choices out of letter order; they are listed here in W, X, Y, Z order with DOE’s letters.',
  erratum: 'Rebound corrected a misprint in DOE’s answer line after review; see the note under the answer.',
  'mc-answer-mismatch': 'The printed answer does not exactly match any of the choices.',
  'type-mismatch': 'The printed question type did not match its format.',
  'kind-inferred': 'The toss-up or bonus label was missing and was inferred.',
};

/** Plain-language notes for questions the importer flagged, with a link to the original. */
export function ImportNotes({ q }: { q: Question }) {
  if (!q.flags || q.flags.length === 0) return null;
  return (
    <p className="small muted" style={{ marginTop: '0.5rem' }}>
      {q.flags.map((f) => FLAG_TEXT[f] ?? f).join(' ')}{' '}
      {q.source.url && (
        <a href={q.source.url} target="_blank" rel="noreferrer">
          Check the original{q.source.page ? ` (page ${q.source.page})` : ''}
        </a>
      )}
    </p>
  );
}

/** Name of a concept id ("biology.genetics.hardy-weinberg"), or null if the taxonomy does not list it. */
function conceptName(id: string): string | null {
  const topicId = id.split('.').slice(0, 2).join('.');
  return topicById(topicId)?.concepts.find((c) => c.id === id)?.name ?? null;
}

/** The concepts a question tests, when tagged. */
export function Concepts({ q }: { q: Question }) {
  const names = (q.concepts ?? []).map(conceptName).filter((n): n is string => n !== null);
  if (names.length === 0) return null;
  return <div className="small muted concepts">Concepts: {names.join(' · ')}</div>;
}

/** A full question for reading: meta line, stem, choices and (optionally) the answer. */
export function QuestionView({ q, showAnswer = true, extra }: { q: Question; showAnswer?: boolean; extra?: ReactNode }) {
  return (
    <article className="question">
      <QuestionMeta q={q} extra={extra} />
      <p className="stem">
        <RichText text={q.stem} />
      </p>
      <Choices q={q} />
      {showAnswer && <AnswerBox q={q} />}
      {showAnswer && <Concepts q={q} />}
      <ImportNotes q={q} />
    </article>
  );
}
