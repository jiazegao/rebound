import { useEffect, useState } from 'react';
import { Notice, PageHeader } from '../components/ui';
import { downloadFile } from '../lib/format';
import { href, navigate } from '../lib/router';
import { exportData, updateSettings, useData } from '../lib/store';
import { choosePlayer, joinSharedTeam, parseJoinCode, SERVER_URL, useSync } from '../lib/sync';

export function JoinPage({ code }: { code?: string }) {
  const data = useData();
  const { state } = useSync();
  const [joinCode, setJoinCode] = useState(code ?? '');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [server, setServer] = useState(SERVER_URL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ name: string; pin: string } | null>(null);

  const parsed = parseJoinCode(joinCode);
  const hasLocalTeam = !!data.team && !state;
  const linkedPlayer = state && joined ? state.member.playerId : null;

  // Linked to a roster player (by name, or after choosing): straight to today's plan.
  useEffect(() => {
    if (!linkedPlayer) return;
    updateSettings({ soloPlayerId: linkedPlayer });
    navigate('/today');
  }, [linkedPlayer]);

  // Step 2: after joining, a member who is not linked yet says which roster player they are.
  if (state && joined && !state.member.playerId) {
    const unclaimed = data.players.filter((p) => p.active);
    return (
      <div className="container narrow">
        <PageHeader title={`Welcome to ${data.team?.name ?? state.teamName}`} />
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Which player are you?</h2>
          <p className="small muted">Your answers, reviews and plan are saved under your player.</p>
          <div className="row">
            {unclaimed.map((p) => (
              <button
                key={p.id}
                className="btn btn-big"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  // Sign in again with the chosen player; the server links a member who has no player yet.
                  choosePlayer(joined.name, joined.pin, p.id).then(
                    () => {
                      updateSettings({ soloPlayerId: p.id });
                      navigate('/today');
                    },
                    (err: Error) => {
                      setError(err.message);
                      setBusy(false);
                    },
                  );
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          <p className="small muted">
            Not on the list? Ask your captain to add you on the Team page, or <a href={href('/today')}>continue without choosing</a>.
          </p>
          {error && <Notice kind="error">{error}</Notice>}
        </section>
      </div>
    );
  }

  if (state && !joined) {
    return (
      <div className="container narrow">
        <PageHeader title="Join a team" />
        <Notice>
          This device is already signed in to <strong>{state.teamName || data.team?.name}</strong> as {state.member.name}. To join a different team,
          sign out first on the <a href={href('/team')}>Team</a> page.
        </Notice>
      </div>
    );
  }

  const ok = !!parsed && name.trim().length > 0 && pin.length >= 4 && /^https?:\/\//.test(server);
  return (
    <div className="container narrow">
      <PageHeader title="Join your team">
        <p>Your captain shared a link. Choose a display name and a PIN; use the same name and PIN to sign in on your other devices.</p>
      </PageHeader>
      {hasLocalTeam && (
        <Notice kind="warn">
          This device already has team data for <strong>{data.team!.name}</strong>. Joining replaces it with the shared team's data.{' '}
          <button
            className="btn btn-small"
            onClick={() => downloadFile(`rebound-backup-${new Date().toISOString().slice(0, 10)}.json`, exportData())}
          >
            Download a backup first
          </button>
        </Notice>
      )}
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          setError(null);
          joinSharedTeam(server.replace(/\/$/, ''), joinCode, name.trim(), pin).then(
            () => {
              setJoined({ name: name.trim(), pin });
              setBusy(false);
            },
            (err: Error) => {
              setError(err.message);
              setBusy(false);
            },
          );
        }}
      >
        {!code && (
          <div className="field">
            <label htmlFor="join-code">Join link</label>
            <input id="join-code" type="text" value={joinCode} placeholder="Paste the link your captain posted" onChange={(e) => setJoinCode(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="join-name">Display name</label>
          <input id="join-name" type="text" value={name} maxLength={40} placeholder="First name or nickname" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="join-pin">PIN (4–8 digits)</label>
          <input id="join-pin" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
          <span className="hint">New here? This sets your PIN. Already joined on another device? Use the same name and PIN.</span>
        </div>
        {!SERVER_URL && (
          <div className="field">
            <label htmlFor="join-server">Team server address</label>
            <input id="join-server" type="url" value={server} onChange={(e) => setServer(e.target.value)} />
          </div>
        )}
        {joinCode && !parsed && <p className="small" style={{ color: 'var(--warn)' }}>That join link does not look complete.</p>}
        {error && <Notice kind="error">{error}</Notice>}
        <div>
          <button className="btn btn-primary btn-big" type="submit" disabled={!ok || busy}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        </div>
      </form>
    </div>
  );
}
