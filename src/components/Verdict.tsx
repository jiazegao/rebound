import type { JudgeResult } from '../core/judge/judge';

/** The checker's verdict, with buttons for "your call" and for overriding it. */
export function Verdict({ result, decided, onDecide }: { result: JudgeResult | null; decided: boolean | null; onDecide: (right: boolean) => void }) {
  if (!result) {
    return <div className="verdict">No answer in time.</div>;
  }
  const final = decided ?? (result.verdict === 'correct' ? true : result.verdict === 'incorrect' ? false : null);
  const kind = final === null ? 'review' : final ? 'correct' : 'incorrect';
  return (
    <div className={`verdict verdict-${kind}`} role="status">
      <strong>{final === null ? 'Your call' : final ? 'Correct' : 'Not correct'}</strong>
      {decided !== null && decided !== (result.verdict === 'correct') ? ' (your call)' : ''}
      <div className="small">{result.reason}</div>
      {final === null ? (
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <button className="btn btn-good" onClick={() => onDecide(true)}>
            I was right <span className="kbd">Y</span>
          </button>
          <button className="btn btn-bad" onClick={() => onDecide(false)}>
            I was wrong <span className="kbd">N</span>
          </button>
        </div>
      ) : (
        <button className="btn btn-small btn-ghost" style={{ marginTop: '0.25rem' }} onClick={() => onDecide(!final)}>
          {final ? 'Actually, I was wrong' : 'Actually, I was right'}
        </button>
      )}
    </div>
  );
}
