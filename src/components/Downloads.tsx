import { useState } from 'react';
import { toQuestionSetDoc } from '../core/nsbjson';
import type { QuestionSet, Round } from '../core/schema';
import { roundToDocx } from '../lib/docx';
import { downloadBlob, downloadFile } from '../lib/format';

/** A file name from a title: "Set 17, Round 1" → "set-17-round-1". */
export function fileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'rebound'
  );
}

/**
 * Downloads for one round: a Word packet (the moderator's copy with answers, or the players' copy without) for
 * running a practice tournament, and the whole set as NSB-JSON (docs/NSB-JSON.md) for other tools.
 */
export function RoundDownloads({ set, round, title }: { set: QuestionSet; round: Round; title: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const word = async (answers: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const blob = await roundToDocx(round, { title, credit: set.credit, answers });
      downloadBlob(`${fileSlug(title)}${answers ? '' : '-no-answers'}.docx`, blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The Word file could not be made.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row no-print" style={{ gap: '0.5rem', alignItems: 'center' }}>
      <span className="small muted">Download:</span>
      <button type="button" className="btn btn-small" disabled={busy} onClick={() => void word(true)}>
        Word, with answers
      </button>
      <button type="button" className="btn btn-small" disabled={busy} onClick={() => void word(false)}>
        Word, without answers
      </button>
      <button
        type="button"
        className="btn btn-small btn-ghost"
        onClick={() => downloadFile(`${fileSlug(set.title)}.nsb.json`, `${JSON.stringify(toQuestionSetDoc(set), null, 2)}\n`)}
        title="The whole set in NSB-JSON, an open format other tools can read"
      >
        NSB-JSON (whole set)
      </button>
      {busy && <span className="small muted">Making the file…</span>}
      {error && (
        <span className="small" style={{ color: 'var(--bad)' }}>
          {error}
        </span>
      )}
    </div>
  );
}
