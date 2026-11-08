import { useState } from 'react';
import type { Question } from '../core/schema';
import { aiExplain, explainable, useAiStatus, type AiExplanation } from '../lib/ai';
import { Notice } from './ui';

/** "Explain this answer (AI)" under a revealed answer, for signed-in players when the server has AI help turned on. */
export function AiExplain({ q }: { q: Question }) {
  const ai = useAiStatus();
  if (!ai?.enabled || !explainable(q)) return null;
  return <Explain key={q.id} q={q} />;
}

function Explain({ q }: { q: Question }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (result) {
    return (
      <div className="notice small" role="note" style={{ marginTop: '0.5rem' }}>
        <strong>AI explanation</strong>{' '}
        <span className="muted">
          ({result.model}
          {result.cached ? ', asked before by your team' : ''}; check it against your notes)
        </span>
        <p style={{ margin: '0.25rem 0 0' }}>{result.explanation}</p>
        {result.answerLooksWrong && (
          <p style={{ margin: '0.25rem 0 0', color: 'var(--warn)' }}>
            The AI thinks this answer key may be wrong. Check the original before you count on it.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="row small" style={{ marginTop: '0.5rem' }}>
      <button
        type="button"
        className="btn btn-small btn-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            setResult(await aiExplain(q));
          } catch (e) {
            setError(e instanceof Error ? e.message : 'The explanation could not be loaded.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Asking…' : 'Explain this answer (AI)'}
      </button>
      {error && <Notice kind="error">{error}</Notice>}
    </div>
  );
}
