import { useEffect, useMemo, useState } from 'react';
import { LoadError, Loading, Notice, PageHeader, SubjectTag } from '../components/ui';
import { DEFAULT_PRESET_ID, PRESETS } from '../core/rules/presets';
import { CORE_SUBJECTS } from '../core/schema';
import { dateTimeText } from '../lib/format';
import { roundQuestions, setLabel, useAsync, useIndex, useSet } from '../lib/library';
import { packetRound, packetRounds, teamSetId } from '../lib/packets';
import { href, navigate } from '../lib/router';
import { addPlayer, createGame, useData } from '../lib/store';

type Side = 0 | 1 | null;

export function ReaderSetup({ query }: { query: URLSearchParams }) {
  const data = useData();
  const index = useIndex();
  const [source, setSource] = useState<'doe' | 'packet'>(query.get('packet') ? 'packet' : 'doe');
  const [packetId, setPacketId] = useState<string | null>(query.get('packet') ?? data.packets[0]?.id ?? null);
  const [packetRoundId, setPacketRoundId] = useState<string | null>(null);
  const [setId, setSetId] = useState<string | null>(query.get('set'));
  const [roundId, setRoundId] = useState<string | null>(query.get('round'));
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
  const [names, setNames] = useState<[string, string]>(['Team A', 'Team B']);
  const [sides, setSides] = useState<Record<string, Side>>({});
  const [quickName, setQuickName] = useState('');
  const set = useSet(setId);

  // Default to the newest set once the index loads.
  useEffect(() => {
    if (!setId && index.data?.sets.length) {
      const newest = [...index.data.sets].sort((a, b) => (b.setNumber ?? 0) - (a.setNumber ?? 0))[0];
      setSetId(newest.id);
    }
  }, [index.data, setId]);

  // Default to the first round of the chosen set.
  useEffect(() => {
    if (set.data && (!roundId || !set.data.rounds.some((r) => r.id === roundId))) setRoundId(set.data.rounds[0]?.id ?? null);
  }, [set.data, roundId]);

  const players = data.players.filter((p) => p.active && p.role !== 'coach');
  const team = (side: 0 | 1) => players.filter((p) => sides[p.id] === side).map((p) => p.id);
  const teamA = team(0);
  const teamB = team(1);
  const packet = data.packets.find((p) => p.id === packetId) ?? null;
  const packetChoice = packet ? (packetRounds(packet).find((r) => r.id === packetRoundId) ?? packetRounds(packet)[0]) : null;
  const fromPacket = useAsync(source === 'packet' && packet && packetChoice ? `${packet.id}|${packetChoice.id}` : null, () => packetRound(packet!, packetChoice!.id));
  const round = source === 'packet' ? fromPacket.data : set.data?.rounds.find((r) => r.id === roundId);
  const preset = PRESETS.find((p) => p.id === presetId)!;

  const heardCounts = useMemo(() => {
    if (!round) return [];
    const ids = roundQuestions(round).map((q) => q.id);
    return [...teamA, ...teamB].map((pid) => ({
      pid,
      name: data.players.find((p) => p.id === pid)?.name ?? pid,
      heard: ids.filter((q) => data.seen[pid]?.[q]).length,
      total: ids.length,
    }));
  }, [round, teamA, teamB, data.players, data.seen]);

  if (!data.team) {
    return (
      <div className="container narrow">
        <PageHeader title="Reader console" />
        <Notice>
          Set up your team and add players first (it takes a minute): <a href={href('/team')}>Team</a>.
        </Notice>
      </div>
    );
  }

  const problems: string[] = [];
  if (!round) problems.push('Choose a round.');
  if (teamA.length < 1 || teamB.length < 1) problems.push('Put at least one player on each team.');
  if (teamA.length > 4 || teamB.length > 4) problems.push('A team plays at most four players at a time.');

  const autoSplit = () => {
    const next: Record<string, Side> = {};
    const bySquad = players.some((p) => p.squad === 'A') && players.some((p) => p.squad === 'B');
    players.forEach((p, i) => {
      next[p.id] = bySquad ? (p.squad === 'A' ? 0 : p.squad === 'B' ? 1 : null) : ((i % 2) as 0 | 1);
    });
    setSides(next);
  };

  const start = () => {
    if (!round || problems.length) return;
    const info =
      source === 'packet' && packet
        ? { setId: teamSetId(packet.id), setTitle: packet.title, roundId: round.id, roundLabel: round.label }
        : set.data
          ? { setId: set.data.id, setTitle: set.data.title, roundId: round.id, roundLabel: round.label, sourceUrl: round.sourceUrl }
          : null;
    if (!info) return;
    const id = createGame({
      presetId,
      packet: info,
      pairs: round.pairs.map((p) => ({ tossupId: p.tossup.id, bonusId: p.bonus?.id, subject: p.tossup.subject })),
      teams: [
        { name: names[0].trim() || 'Team A', playerIds: teamA },
        { name: names[1].trim() || 'Team B', playerIds: teamB },
      ],
    });
    navigate(`/reader/${id}`);
  };

  const unfinished = data.games.filter((g) => g.status === 'in_progress');

  return (
    <div className="container">
      <PageHeader title="Reader console">
        <p>Set up a practice game. The reader runs it from this device; every toss-up is logged to each player's stats.</p>
      </PageHeader>

      {unfinished.length > 0 && (
        <Notice>
          <strong>Unfinished:</strong>{' '}
          {unfinished.map((g, i) => (
            <span key={g.id}>
              {i > 0 && ' · '}
              <a href={href(`/reader/${g.id}`)}>
                {g.teams[0].name} vs {g.teams[1].name} ({dateTimeText(g.createdAt)})
              </a>
            </span>
          ))}
        </Notice>
      )}

      <div className="grid-2" style={{ marginTop: '1rem' }}>
        <section className="card stack">
          <h2>1. Questions</h2>
          {data.packets.length > 0 && (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">From</legend>
              <label className="checkbox">
                <input type="radio" name="source" checked={source === 'doe'} onChange={() => setSource('doe')} /> A DOE sample round
              </label>
              <label className="checkbox">
                <input type="radio" name="source" checked={source === 'packet'} onChange={() => setSource('packet')} /> A team packet (scrimmage or upload)
              </label>
            </fieldset>
          )}
          {source === 'packet' && packet && (
            <>
              <div className="field">
                <label htmlFor="packet">Packet</label>
                <select id="packet" value={packet.id} onChange={(e) => { setPacketId(e.target.value); setPacketRoundId(null); }}>
                  {data.packets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              {packetRounds(packet).length > 1 && (
                <div className="field">
                  <label htmlFor="packet-round">Round</label>
                  <select id="packet-round" value={packetChoice?.id ?? ''} onChange={(e) => setPacketRoundId(e.target.value)}>
                    {packetRounds(packet).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {fromPacket.loading && <Loading what="Loading the packet" />}
              {fromPacket.error && <Notice kind="error">{fromPacket.error.message}</Notice>}
              {round && <p className="small muted">{round.pairs.length} toss-ups. <a href={href(`/packets/${packet.id}`)}>See or print the packet</a></p>}
            </>
          )}
          {source === 'doe' && index.loading && <Loading />}
          {source === 'doe' && index.error && <LoadError error={index.error} />}
          {source === 'doe' && index.data && (
            <div className="field">
              <label htmlFor="set">Sample set</label>
              <select id="set" value={setId ?? ''} onChange={(e) => { setSetId(e.target.value); setRoundId(null); }}>
                {[...index.data.sets]
                  .sort((a, b) => (b.setNumber ?? 0) - (a.setNumber ?? 0))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {setLabel(s)}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {source === 'doe' && set.data && (
            <div className="field">
              <label htmlFor="round">Round</label>
              <select id="round" value={roundId ?? ''} onChange={(e) => setRoundId(e.target.value)}>
                {set.data.rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.pairs.length} toss-ups)
                  </option>
                ))}
              </select>
              <span className="hint">Rounds 1–10 are about equal in difficulty; later rounds get harder.</span>
            </div>
          )}
          {round && (
            <div className="row" style={{ gap: '0.3rem' }}>
              {CORE_SUBJECTS.filter((s) => round.pairs.some((p) => p.tossup.subject === s)).map((s) => (
                <SubjectTag key={s} subject={s} />
              ))}
            </div>
          )}
          {source === 'doe' && round && (
            <a className="small" href={href(`/library/${setId}/${round.id}?print=1`)} target="_blank" rel="noreferrer">
              Print this packet
            </a>
          )}
          {heardCounts.some((h) => h.heard > 0) && (
            <Notice kind="warn">
              Some players have heard these questions:{' '}
              {heardCounts
                .filter((h) => h.heard > 0)
                .map((h) => `${h.name} ${h.heard}/${h.total}`)
                .join(', ')}
              . Pick another round for a fresh game.
            </Notice>
          )}
        </section>

        <section className="card stack">
          <h2>2. Rules</h2>
          <div className="field">
            <label htmlFor="preset">Rules</label>
            <select id="preset" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="hint">{preset.summary}</span>
          </div>
          <a className="small" href={href('/rules')}>
            Rules at a glance
          </a>
        </section>
      </div>

      <section className="card stack" style={{ marginTop: '1rem' }}>
        <div className="row spread">
          <h2 style={{ margin: 0 }}>3. Teams</h2>
          <div className="row" style={{ gap: '0.5rem' }}>
            {data.lineups.length > 0 && (
              <select
                aria-label="Put a saved lineup on Team A"
                value=""
                onChange={(e) => {
                  const lineup = data.lineups.find((l) => l.id === e.target.value);
                  if (!lineup) return;
                  // The lineup's starters play as Team A; everyone else who was on Team A moves to Team B.
                  const next: Record<string, Side> = {};
                  for (const p of players) next[p.id] = lineup.starters.includes(p.id) ? 0 : sides[p.id] === 0 ? 1 : sides[p.id] ?? null;
                  setSides(next);
                  setNames((n) => [lineup.name, n[1]]);
                }}
                style={{ width: 'auto' }}
              >
                <option value="">Team A from a lineup…</option>
                {data.lineups.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
            <button className="btn btn-small" onClick={autoSplit} disabled={players.length < 2}>
              Auto-split
            </button>
          </div>
        </div>
        <div className="grid-2">
          {[0, 1].map((side) => (
            <div className="field" key={side}>
              <label htmlFor={`team-${side}`}>Team {side === 0 ? 'A' : 'B'} name</label>
              <input
                id={`team-${side}`}
                type="text"
                value={names[side]}
                onChange={(e) => setNames((n) => (side === 0 ? [e.target.value, n[1]] : [n[0], e.target.value]))}
              />
              <span className="hint">
                {(side === 0 ? teamA : teamB).length} of 4 players
              </span>
            </div>
          ))}
        </div>
        {players.length === 0 ? (
          <Notice>No players yet. Add some below or on the Team page.</Notice>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Plays for</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name} {p.squad && <span className="muted small">({p.squad})</span>}
                    </td>
                    <td>
                      <div className="row" role="radiogroup" aria-label={`${p.name} plays for`} style={{ gap: '0.3rem' }}>
                        {([0, 1, null] as Side[]).map((s) => (
                          <button
                            key={String(s)}
                            role="radio"
                            aria-checked={(sides[p.id] ?? null) === s}
                            className={`btn btn-small ${(sides[p.id] ?? null) === s ? 'btn-primary' : ''}`}
                            onClick={() => setSides((cur) => ({ ...cur, [p.id]: s }))}
                          >
                            {s === 0 ? names[0] || 'Team A' : s === 1 ? names[1] || 'Team B' : 'Sitting out'}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (quickName.trim()) {
              addPlayer({ name: quickName, role: 'member' });
              setQuickName('');
            }
          }}
        >
          <input type="text" aria-label="New player name" placeholder="Add a player" value={quickName} onChange={(e) => setQuickName(e.target.value)} style={{ maxWidth: 260 }} />
          <button className="btn" type="submit" disabled={!quickName.trim()}>
            Add
          </button>
        </form>
      </section>

      <div className="row" style={{ marginTop: '1.25rem' }}>
        <button className="btn btn-primary btn-big" onClick={start} disabled={problems.length > 0}>
          Start game
        </button>
        {problems.length > 0 && <span className="muted">{problems.join(' ')}</span>}
      </div>
      {set.loading && <Loading what="Loading rounds" />}
    </div>
  );
}
