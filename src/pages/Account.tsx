import { useState } from 'react';
import { Notice, PageHeader } from '../components/ui';
import { MAX_NAME_CHARS } from '../core/accounts';
import { CORE_SUBJECTS, SUBJECT_LABELS, type CoreSubject } from '../core/schema';
import { deleteAccount, downloadMyData, signOut, updateProfile } from '../lib/account';
import { SERVER_URL, serverUrl } from '../lib/api';
import { flushNow, getConnection, useSession } from '../lib/cloud';
import { dateText, dateTimeText } from '../lib/format';
import { navigate } from '../lib/router';
import { setReportStatus, updateSettings, useData } from '../lib/store';
import { graduatingClass } from '../lib/team';

const GRAD_YEARS = Array.from({ length: 7 }, (_, i) => graduatingClass(Date.now()) + i);

function Profile() {
  const { user } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'good' | 'error'; text: string } | null>(null);
  if (!user) return null;
  const save = async (fields: Parameters<typeof updateProfile>[0], done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await updateProfile(fields);
      setMessage({ kind: 'good', text: done });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };
  const subject = (label: string, value: CoreSubject | undefined, field: 'primarySubject' | 'secondarySubject') => (
    <div className="field">
      <label htmlFor={`account-${field}`}>{label}</label>
      <select
        id={`account-${field}`}
        value={value ?? ''}
        disabled={busy}
        onChange={(e) => void save({ [field]: (e.target.value || null) as CoreSubject | null }, 'Subjects saved.')}
      >
        <option value="">—</option>
        {CORE_SUBJECTS.map((s) => (
          <option key={s} value={s}>
            {SUBJECT_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <section className="card stack" aria-labelledby="profile-heading">
      <h2 id="profile-heading" style={{ margin: 0 }}>
        You
      </h2>
      <form
        className="row"
        style={{ alignItems: 'flex-end' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== user.name) void save({ name: name.trim() }, 'Name saved.');
        }}
      >
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label htmlFor="account-name">Name</label>
          <input id="account-name" type="text" value={name} maxLength={MAX_NAME_CHARS} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={busy || !name.trim() || name.trim() === user.name}>
          Save name
        </button>
      </form>
      <div className="grid">
        {subject('Primary subject', user.primarySubject, 'primarySubject')}
        {subject('Secondary subject', user.secondarySubject, 'secondarySubject')}
        <div className="field">
          <label htmlFor="account-grad">Graduates</label>
          <select
            id="account-grad"
            value={user.gradYear ?? ''}
            disabled={busy}
            onChange={(e) => void save({ gradYear: e.target.value ? Number(e.target.value) : null }, 'Graduation year saved.')}
          >
            <option value="">—</option>
            {[...new Set([...(user.gradYear ? [user.gradYear] : []), ...GRAD_YEARS])].sort().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Your subjects shape your daily plan and show on your team's page. Signed in as {user.email} since {dateText(new Date(user.createdAt).toISOString())}.
      </p>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
    </section>
  );
}

function Reports() {
  const data = useData();
  const open = data.reports.filter((r) => r.status === 'open');
  return (
    <section className="card stack" aria-labelledby="reports-heading">
      <h2 id="reports-heading" style={{ margin: 0 }}>
        Your problem reports ({open.length} open)
      </h2>
      {data.reports.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          None. Use "Report a problem" under any question in the Library. While a report is open, that question stays out of your reviews.
        </p>
      ) : (
        <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
          {data.reports.map((r) => (
            <li key={r.id} style={{ marginBottom: '0.4rem' }}>
              <code className="small">{r.questionId}</code>: {r.note} <span className="muted small">({dateTimeText(r.createdAt)})</span>{' '}
              <button className="btn btn-small" onClick={() => setReportStatus(r.id, r.status === 'open' ? 'resolved' : 'open')}>
                {r.status === 'open' ? 'Mark resolved' : 'Reopen'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AccountPage() {
  const data = useData();
  const { user, team } = useSession();
  const [busy, setBusy] = useState<'download' | 'delete' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  const act = async (what: 'download' | 'delete' | 'signout', fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container narrow">
      <PageHeader title="Account">
        <p>
          Everything you practice is saved to your account on Rebound's server, not on this device, so it follows you to any device you sign in on.
          {team ? ` You are on ${team.team.name}; your teammates see your stats, but not your review queue or daily plan.` : ''}
        </p>
      </PageHeader>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="stack">
        <Profile />

        <section className="card stack" aria-labelledby="settings-heading">
          <h2 id="settings-heading" style={{ margin: 0 }}>
            Settings
          </h2>
          <label className="checkbox">
            <input type="checkbox" checked={data.settings.sound} onChange={(e) => updateSettings({ sound: e.target.checked })} /> Beep for the clocks (the
            5-second warning and time)
          </label>
          <p className="small muted" style={{ margin: 0 }}>
            Reading speed and the answer timer are set when you start a practice round; the length of your daily plan on Today.
          </p>
        </section>

        <Reports />

        <section className="card stack" aria-labelledby="data-heading">
          <h2 id="data-heading" style={{ margin: 0 }}>
            Your data
          </h2>
          <p style={{ margin: 0 }}>
            Download everything your account holds (your profile, practice answers, game answers, review queue, plans and reports) as one file.
          </p>
          <div>
            <button className="btn" disabled={busy !== null} onClick={() => void act('download', downloadMyData)}>
              {busy === 'download' ? 'Preparing…' : 'Download my data'}
            </button>
          </div>
          {!SERVER_URL && (
            <p className="small muted" style={{ margin: 0 }}>
              Server: <code>{serverUrl()}</code>
            </p>
          )}
        </section>

        <section className="card stack" aria-labelledby="signout-heading">
          <h2 id="signout-heading" style={{ margin: 0 }}>
            Sign out
          </h2>
          <p style={{ margin: 0 }}>Signs out on this device. Your practice stays in your account.</p>
          <div>
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() =>
                void act('signout', async () => {
                  if (getConnection().unsaved && !(await flushNow()) && !confirm('Your last change was not saved: Rebound cannot reach its server. Sign out anyway and lose it?')) return;
                  await signOut();
                  navigate('/');
                })
              }
            >
              {busy === 'signout' ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </section>

        <section className="card stack" aria-labelledby="delete-heading">
          <h2 id="delete-heading" style={{ margin: 0 }}>
            Delete my account
          </h2>
          <p style={{ margin: 0 }}>
            Deletes your account and all your practice for good: answers, review queue, plans and reports.
            {team ? ` You also leave ${team.team.name}; games you played stay in its records, under "Former player".` : ''} Download your data first if
            you might want it.
          </p>
          <div>
            <button
              className="btn btn-bad"
              disabled={busy !== null}
              onClick={() => {
                if (!confirm(`Delete the Rebound account for ${user.email} and everything in it? This cannot be undone.`)) return;
                void act('delete', async () => {
                  await deleteAccount();
                  navigate('/');
                });
              }}
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
