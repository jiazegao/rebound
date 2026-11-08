import { useState } from 'react';
import { signInHref } from '../components/Gates';
import { Loading, Notice, PageHeader } from '../components/ui';
import { joinTeam } from '../lib/account';
import { parseJoinCode } from '../lib/api';
import { useSession } from '../lib/cloud';
import { href, navigate } from '../lib/router';

/** An invite link (`#/join/<code>`): sign in first, then join (leaving the current team, if any, after a confirmation). */
export function JoinPage({ code }: { code?: string }) {
  const session = useSession();
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = code ? parseJoinCode(code) : null;

  if (!code) {
    const fromPaste = parseJoinCode(pasted);
    return (
      <div className="container narrow">
        <PageHeader title="Join a team">
          <p>Open the invite link your coach or captain posted, or paste it here.</p>
        </PageHeader>
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (fromPaste) navigate(`/join/${fromPaste.code}`);
          }}
        >
          <div className="field">
            <label htmlFor="join-code">Invite link</label>
            <input id="join-code" type="text" value={pasted} placeholder="https://…#/join/…" onChange={(e) => setPasted(e.target.value)} />
          </div>
          {pasted.trim() && !fromPaste && <p className="small" style={{ color: 'var(--warn)', margin: 0 }}>That invite link does not look complete.</p>}
          <div>
            <button className="btn btn-primary" type="submit" disabled={!fromPaste}>
              Continue
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className="container narrow">
        <PageHeader title="Join a team" />
        <Notice kind="error">
          That invite link does not look complete. Ask your coach or captain to send it again, or copy the whole link.
        </Notice>
      </div>
    );
  }

  if (session.status === 'signed-out') {
    return (
      <div className="container narrow">
        <PageHeader title="Join your team">
          <p>Your coach or captain invited you. Sign in first (or create your account); then you join with one more click.</p>
        </PageHeader>
        <a className="btn btn-primary btn-big" href={signInHref(`/join/${parsed.code}`)}>
          Sign in to join
        </a>
      </div>
    );
  }

  if (session.status !== 'ready' || !session.user) {
    return (
      <div className="container narrow">
        <PageHeader title="Join your team" />
        {session.status === 'failed' ? <Notice kind="warn">{session.message ?? "Rebound can't reach its server."} Rebound keeps trying.</Notice> : <Loading what="Loading your account" />}
      </div>
    );
  }

  const current = session.team;
  if (current?.team.id === parsed.teamId) {
    return (
      <div className="container narrow">
        <PageHeader title="Join your team" />
        <Notice kind="good">
          You are already on <strong>{current.team.name}</strong>. <a href={href('/team')}>Go to the team</a>
        </Notice>
      </div>
    );
  }

  const join = async () => {
    if (current && !confirm(`Leave ${current.team.name} and join the new team? Your practice history stays in your account and goes with you.`)) return;
    setBusy(true);
    setError(null);
    try {
      await joinTeam(parsed.code, !!current);
      navigate('/team');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="container narrow">
      <PageHeader title="Join your team">
        <p>
          Signed in as <strong>{session.user.name}</strong>. Teammates see your practice stats (answers and accuracy, not your review queue or daily
          plan), and you see theirs.
        </p>
      </PageHeader>
      {current && (
        <Notice kind="warn">
          You are on <strong>{current.team.name}</strong>. You can be on one team at a time, so joining leaves it. Your own practice goes with you;
          {` ${current.team.name}`} keeps its games, lineups and packets.
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="btn btn-primary btn-big" disabled={busy} onClick={() => void join()}>
          {busy ? 'Joining…' : current ? `Leave ${current.team.name} and join` : 'Join the team'}
        </button>
        <a className="btn btn-ghost" href={href(current ? '/team' : '/today')}>
          Not now
        </a>
      </div>
    </div>
  );
}
