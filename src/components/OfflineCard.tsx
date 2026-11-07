import { useEffect, useState } from 'react';
import { offlineStatus, offlineSupported, removeOffline, saveForOffline, type OfflineStatus } from '../lib/offline';

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** "Save all questions for offline use", with progress and the current state. */
export function OfflineCard() {
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = offlineSupported();

  const refresh = () => {
    offlineStatus().then(setStatus, () => setStatus(null));
  };
  useEffect(() => {
    if (supported) refresh();
  }, [supported]);

  const save = async () => {
    setError(null);
    setProgress({ done: 0, total: status?.total ?? 1 });
    try {
      await saveForOffline((done, total) => setProgress({ done, total }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving failed. Check the connection and try again.');
    } finally {
      setProgress(null);
      refresh();
    }
  };

  const complete = status !== null && status.saved === status.total;
  return (
    <section className="card stack" aria-labelledby="offline-heading">
      <h2 id="offline-heading">Offline use</h2>
      <p>
        After the first visit, Rebound opens without a connection. Save the questions too, and drills, reviews, practice rounds and the Visual
        lab keep working offline (about 12 MB, with the Visual lab's photos). Answers are saved on this device as usual.
      </p>
      {!supported ? (
        <p className="muted">This browser cannot save the site for offline use.</p>
      ) : (
        <>
          <p className="small" role="status">
            {progress
              ? `Saving… ${progress.done} of ${progress.total} files`
              : status
                ? complete
                  ? `All ${status.total} question files are saved on this device${status.bytes ? ` (Rebound is using ${mb(status.bytes)})` : ''}.`
                  : `${status.saved} of ${status.total} question files saved on this device.`
                : 'Checking what is saved…'}
          </p>
          {progress && <progress max={progress.total} value={progress.done} style={{ width: '100%' }} />}
          {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
          <div className="row">
            <button className="btn btn-primary" onClick={() => void save()} disabled={progress !== null}>
              {complete ? 'Update saved questions' : 'Save all questions for offline use'}
            </button>
            {status && status.saved > 0 && (
              <button
                className="btn btn-ghost"
                disabled={progress !== null}
                onClick={() => {
                  void removeOffline().then(refresh);
                }}
              >
                Remove saved questions
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
