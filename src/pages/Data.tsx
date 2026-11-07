import { useState } from 'react';
import { Notice, PageHeader } from '../components/ui';
import { dateTimeText, downloadFile } from '../lib/format';
import { href, navigate } from '../lib/router';
import { exportData, importData, resetAll, setReportStatus, useData, useStoreStatus } from '../lib/store';

export function DataPage() {
  const data = useData();
  const status = useStoreStatus();
  const [message, setMessage] = useState<{ kind: 'good' | 'error'; text: string } | null>(null);

  const doExport = () => {
    const json = exportData();
    const slug = (data.team?.name ?? 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadFile(`rebound-${slug}-${new Date().toISOString().slice(0, 10)}.json`, json);
    setMessage({ kind: 'good', text: 'Backup downloaded. Keep it somewhere safe, like your team drive.' });
  };

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      if (!confirm('Replace all of this browser’s Rebound data with the file? Export a backup first if you are not sure.')) return;
      importData(text);
      setMessage({ kind: 'good', text: 'Data loaded from the file.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Could not read that file.' });
    }
  };

  const open = data.reports.filter((r) => r.status === 'open');

  return (
    <div className="container narrow">
      <p className="small">
        <a href={href('/team')}>Team</a> /
      </p>
      <PageHeader title="Data and backup">
        <p>
          In this version, Rebound keeps your team's data in this browser on this device. Export a backup regularly, and use it to move the data to
          another device.
        </p>
      </PageHeader>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      {!status.persistent && <Notice kind="warn">This browser is not saving data between visits. Export before you close it.</Notice>}

      <section className="card stack" style={{ marginTop: '1rem' }}>
        <h2>Back up</h2>
        <p>
          {data.players.length} players, {data.games.length} games, {data.attempts.length} solo answers.{' '}
          {data.lastExportAt ? `Last backup: ${dateTimeText(data.lastExportAt)}.` : 'Never backed up.'}
        </p>
        <div>
          <button className="btn btn-primary" onClick={doExport}>
            Download backup file
          </button>
        </div>
      </section>

      <section className="card stack" style={{ marginTop: '1rem' }}>
        <h2>Restore or move</h2>
        <p>Load a backup file. This replaces everything currently stored in this browser.</p>
        <input
          type="file"
          accept="application/json,.json"
          aria-label="Backup file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void doImport(file);
            e.target.value = '';
          }}
        />
      </section>

      <section className="card stack" style={{ marginTop: '1rem' }}>
        <h2>Problem reports ({open.length} open)</h2>
        {data.reports.length === 0 ? (
          <p className="muted">No reports. Use "Report a problem" under any question in the Library.</p>
        ) : (
          <ul style={{ paddingLeft: '1.1rem' }}>
            {data.reports.map((r) => (
              <li key={r.id} style={{ marginBottom: '0.4rem' }}>
                <code className="small">{r.questionId}</code>: {r.note}{' '}
                <span className="muted small">({dateTimeText(r.createdAt)})</span>{' '}
                <button className="btn btn-small" onClick={() => setReportStatus(r.id, r.status === 'open' ? 'resolved' : 'open')}>
                  {r.status === 'open' ? 'Mark resolved' : 'Reopen'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack" style={{ marginTop: '1rem' }}>
        <h2>Delete everything</h2>
        <p>Removes the team, players, games and stats from this browser. Download a backup first if you might want them back.</p>
        <div>
          <button
            className="btn btn-bad"
            onClick={async () => {
              if (confirm('Delete all Rebound data in this browser? This cannot be undone.')) {
                await resetAll();
                navigate('/');
              }
            }}
          >
            Delete all data
          </button>
        </div>
      </section>
    </div>
  );
}
