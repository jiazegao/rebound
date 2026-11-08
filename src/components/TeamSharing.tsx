import { useEffect, useState } from 'react';
import type { MemberRole } from '../core/sync';
import { dateTimeText } from '../lib/format';
import { href } from '../lib/router';
import { useData } from '../lib/store';
import {
  createSharedTeam,
  deleteSharedTeam,
  leaveSharedTeam,
  listMembers,
  newJoinCode,
  removeMember,
  SERVER_URL,
  syncNow,
  updateMember,
  useSync,
  type MemberListing,
} from '../lib/sync';

const STATUS_TEXT: Record<string, string> = {
  off: 'Not connected',
  syncing: 'Syncing…',
  ok: 'Up to date',
  offline: 'Offline: changes wait on this device',
  error: 'Sync problem',
  'signed-out': 'Signed out',
};

export function joinLink(code: string): string {
  return `${location.origin}${location.pathname}#/join/${code}`;
}

function PinFields({ pin, setPin, pin2, setPin2 }: { pin: string; setPin: (v: string) => void; pin2?: string; setPin2?: (v: string) => void }) {
  return (
    <>
      <div className="field">
        <label htmlFor="share-pin">PIN (4–8 digits)</label>
        <input id="share-pin" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
      </div>
      {setPin2 && (
        <div className="field">
          <label htmlFor="share-pin2">PIN again</label>
          <input id="share-pin2" type="password" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 8))} />
        </div>
      )}
    </>
  );
}

function Members({ isLeader }: { isLeader: boolean }) {
  const data = useData();
  const [members, setMembers] = useState<MemberListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => listMembers().then(setMembers, (e: Error) => setError(e.message));
  useEffect(() => {
    if (isLeader) void load();
  }, [isLeader]);
  if (!isLeader) return null;
  if (error) return <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>;
  if (!members) return <p className="small muted">Loading members…</p>;
  const act = (p: Promise<unknown>) => p.then(load, (e: Error) => setError(e.message));
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th>Plays as</th>
            <th>Last seen</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>
                <select aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => void act(updateMember(m.id, { role: e.target.value as MemberRole }))}>
                  <option value="member">Member</option>
                  <option value="captain">Captain</option>
                  <option value="coach">Coach</option>
                </select>
              </td>
              <td>
                <select aria-label={`Roster player for ${m.name}`} value={m.playerId ?? ''} onChange={(e) => void act(updateMember(m.id, { playerId: e.target.value || null }))}>
                  <option value="">—</option>
                  {data.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="small">{m.lastSeen ? dateTimeText(new Date(m.lastSeen).toISOString()) : '–'}</td>
              <td>
                <button
                  className="btn btn-small btn-ghost"
                  onClick={() => {
                    if (confirm(`Remove ${m.name}? Their devices stop syncing.`)) void act(removeMember(m.id));
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Team page card: share the team through the team server, or manage the shared team. */
export function TeamSharing() {
  const data = useData();
  const { state, status } = useSync();
  const player = data.players.find((p) => p.id === data.settings.soloPlayerId);
  const [server, setServer] = useState(SERVER_URL);
  const [name, setName] = useState(player?.name ?? '');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (state) {
    const isLeader = state.member.role === 'coach' || state.member.role === 'captain';
    const link = state.joinCode ? joinLink(state.joinCode) : null;
    return (
      <section className="card stack" aria-labelledby="sharing-heading">
        <h2 id="sharing-heading" style={{ margin: 0 }}>
          Shared team
        </h2>
        <p className="small" style={{ margin: 0 }}>
          This device is signed in as <strong>{state.member.name}</strong> ({state.member.role}) · {STATUS_TEXT[status] ?? status}
          {state.lastSyncAt && ` · last synced ${dateTimeText(new Date(state.lastSyncAt).toISOString())}`}{' '}
          <button className="btn btn-small" onClick={() => void syncNow()} disabled={status === 'syncing'}>
            Sync now
          </button>
        </p>
        {state.lastError && status !== 'ok' && <p className="small" style={{ color: 'var(--bad)', margin: 0 }}>{state.lastError}</p>}
        {state.rejected.length > 0 && (
          <details className="small">
            <summary>{state.rejected.length} change{state.rejected.length === 1 ? ' was' : 's were'} not accepted by the server</summary>
            <ul>
              {state.rejected.map((r, i) => (
                <li key={i}>
                  {r.key}: {r.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
        {isLeader && (
          <div className="stack">
            {link ? (
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input aria-label="Join link" type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
                <button
                  className="btn btn-small"
                  onClick={() =>
                    void navigator.clipboard?.writeText(link).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    })
                  }
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : null}
            <p className="small muted" style={{ margin: 0 }}>
              Post the join link where only your team can see it (your team chat). Anyone with it can join.{' '}
              <button
                className="btn btn-small btn-ghost"
                onClick={() => {
                  if (link === null || confirm('Make a new join link? The old one stops working.')) void newJoinCode().catch((e: Error) => setError(e.message));
                }}
              >
                {link ? 'New join link' : 'Show a join link'}
              </button>
            </p>
            <Members isLeader={isLeader} />
          </div>
        )}
        {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
        <div className="row">
          <button
            className="btn btn-small btn-ghost"
            onClick={() => {
              if (confirm('Stop syncing on this device? The team data stays here and on the server.')) void leaveSharedTeam();
            }}
          >
            Sign out on this device
          </button>
          {isLeader && (
            <button
              className="btn btn-small btn-bad"
              disabled={busy}
              onClick={() => {
                const name = state.teamName || data.team?.name || 'the team';
                if (!confirm(`Delete ${name} from the team server? Everything stored there is deleted for good and every member's devices stop syncing. Each device keeps its own copy.`)) return;
                setBusy(true);
                setError(null);
                deleteSharedTeam().then(
                  () => setBusy(false),
                  (e: Error) => {
                    setError(e.message);
                    setBusy(false);
                  },
                );
              }}
            >
              Delete the team from the server
            </button>
          )}
        </div>
      </section>
    );
  }

  const ok = name.trim().length > 0 && pin.length >= 4 && pin === pin2 && /^https?:\/\//.test(server);
  return (
    <section className="card stack" aria-labelledby="sharing-heading">
      <h2 id="sharing-heading" style={{ margin: 0 }}>
        Share with your team
      </h2>
      <p className="small muted" style={{ margin: 0 }}>
        Right now everything is kept on this device. Sharing puts the team on Rebound's team server, so players see their plans, reviews and
        assignments on their own phones and Chromebooks, and can join remote rooms. Members sign in with a name and a PIN; no emails.
      </p>
      <form
        className="grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          setError(null);
          createSharedTeam(server.replace(/\/$/, ''), name.trim(), pin).then(
            () => setBusy(false),
            (err: Error) => {
              setError(err.message);
              setBusy(false);
            },
          );
        }}
      >
        <div className="field">
          <label htmlFor="share-name">Your name</label>
          <input id="share-name" type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </div>
        <PinFields pin={pin} setPin={setPin} pin2={pin2} setPin2={setPin2} />
        {!SERVER_URL && (
          <div className="field">
            <label htmlFor="share-server">Team server address</label>
            <input id="share-server" type="url" value={server} placeholder="https://rebound-server.example.workers.dev" onChange={(e) => setServer(e.target.value)} />
          </div>
        )}
        <div style={{ alignSelf: 'end' }}>
          <button className="btn btn-primary" type="submit" disabled={!ok || busy}>
            {busy ? 'Sharing…' : 'Share this team'}
          </button>
        </div>
      </form>
      {pin2 && pin !== pin2 && <p className="small" style={{ color: 'var(--warn)', margin: 0 }}>The PINs don't match.</p>}
      {error && <p className="small" style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
      <p className="small muted" style={{ margin: 0 }}>
        Any school's team can share. Use first names or nicknames; see <a href={href('/about')}>privacy and terms</a> for what the server keeps.
      </p>
      <p className="small muted" style={{ margin: 0 }}>
        Joining a team someone else shared? Open the join link they posted, or <a href={href('/join')}>enter it here</a>.
      </p>
    </section>
  );
}
