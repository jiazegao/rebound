import { useEffect, useMemo, useState } from 'react';
import { LoadError, Loading, Notice, PageHeader } from '../components/ui';
import { currentPresets, DEFAULT_PRESET_ID } from '../core/rules/presets';
import { LETTERS, type Question, type Round } from '../core/schema';
import { dateTimeText } from '../lib/format';
import { setGroups, setLabel, useAsync, useIndex, useSet, useTeamLevel } from '../lib/library';
import { createRoom, listRooms, type RoomListing } from '../lib/api';
import { useSession } from '../lib/cloud';
import { packetRound, packetRounds } from '../lib/packets';
import { href, navigate } from '../lib/router';
import { useData } from '../lib/store';

/** The most questions one match carries (server/src/match.ts, MAX_MATCH_PAIRS). */
const MAX_PAIRS = 40;

/** A question the server can judge: an answer to compare with, and for multiple choice all four choices. */
function playable(q: Question | undefined): q is Question {
  if (!q || !q.stem.trim() || (!q.answer.trim() && !q.answerLetter)) return false;
  return q.format !== 'multiple_choice' || (!!q.choices && LETTERS.every((l) => !!q.choices![l]?.trim()));
}

function forMatch(q: Question) {
  return {
    id: q.id,
    subject: q.subject,
    format: q.format,
    stem: q.stem,
    ...(q.choices ? { choices: q.choices } : {}),
    ...(q.answerLetter ? { answerLetter: q.answerLetter } : {}),
    answer: q.answer,
    accept: q.accept.slice(0, 30),
    reject: q.reject.slice(0, 30),
    answerRaw: q.answerRaw,
    figure: !!q.figure || !!q.visual,
  };
}

/** The round's pairs a match can use: playable toss-ups, each with its bonus when that is playable too. */
function matchPairs(round: Round) {
  return round.pairs
    .filter((p) => playable(p.tossup))
    .slice(0, MAX_PAIRS)
    .map((p) => (playable(p.bonus) ? { tossup: forMatch(p.tossup), bonus: forMatch(p.bonus) } : { tossup: forMatch(p.tossup) }));
}

/** Open games made by members of the player's team (anyone else's need their link). */
function RoomList() {
  const [refresh, setRefresh] = useState(0);
  const rooms = useAsync(`rooms-${refresh}`, listRooms);
  useEffect(() => {
    const t = setInterval(() => setRefresh((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  const describe = (r: RoomListing) =>
    r.kind === 'match' && r.match
      ? `${r.match.format === 'teams' ? 'Team vs team' : 'Everyone for themselves'} · ${r.match.status === 'lobby' ? 'waiting to start' : r.match.status === 'playing' ? 'playing' : 'finished'}`
      : 'Reader room (a member reads)';
  const open = (rooms.data ?? []).filter((r) => r.kind !== 'match' || r.match?.status !== 'finished');
  return (
    <section className="card stack" aria-labelledby="open-rooms">
      <div className="row spread">
        <h2 id="open-rooms" style={{ margin: 0 }}>
          Open games
        </h2>
        <button className="btn btn-small btn-ghost" onClick={() => setRefresh((n) => n + 1)}>
          Refresh
        </button>
      </div>
      {rooms.loading && !rooms.data && <Loading what="Looking for games" />}
      {rooms.error && <Notice kind="error">{rooms.error.message}</Notice>}
      {rooms.data && open.length === 0 && <p className="small muted" style={{ margin: 0 }}>No games open right now. Start one below.</p>}
      {open.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th>Kind</th>
                <th>Host</th>
                <th>Here now</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {open.map((r) => (
                <tr key={r.roomId}>
                  <td>
                    {r.name}
                    <div className="small muted">{dateTimeText(new Date(r.createdAt).toISOString())}</div>
                  </td>
                  <td className="small">{describe(r)}</td>
                  <td className="small">{r.host.name}</td>
                  <td className="small">{r.players}</td>
                  <td>
                    <a className="btn btn-small btn-primary" href={href(`/room/${r.roomId}`)}>
                      Join
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NewMatch() {
  const data = useData();
  const index = useIndex();
  const level = useTeamLevel();
  const [format, setFormat] = useState<'teams' | 'ffa'>('teams');
  const [source, setSource] = useState<'doe' | 'packet'>('doe');
  const [setId, setSetId] = useState<string | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [packetId, setPacketId] = useState<string>(data.packets[0]?.id ?? '');
  const [packetRoundId, setPacketRoundId] = useState<string>('');
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
  const [teamNames, setTeamNames] = useState<[string, string]>(['Team A', 'Team B']);
  const [wpm, setWpm] = useState(data.settings.readingWpm || 200);
  const [count, setCount] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = useSet(source === 'doe' ? setId : null);

  // Start from the newest set of the team's level and its first round.
  useEffect(() => {
    if (!setId && index.data) setSetId(setGroups(index.data, level)[0]?.sets[0]?.id ?? null);
  }, [index.data, setId, level]);
  useEffect(() => {
    if (set.data && (!roundId || !set.data.rounds.some((r) => r.id === roundId))) setRoundId(set.data.rounds[0]?.id ?? null);
  }, [set.data, roundId]);

  const packet = data.packets.find((p) => p.id === packetId);
  const pRounds = packet ? packetRounds(packet) : [];
  const round = useAsync<Round | null>(
    source === 'doe' ? (set.data && roundId ? `doe|${roundId}` : null) : packet ? `packet|${packet.id}|${packetRoundId}` : null,
    async () => (source === 'doe' ? (set.data?.rounds.find((r) => r.id === roundId) ?? null) : packet ? packetRound(packet, packetRoundId || undefined) : null),
  );
  const pairs = useMemo(() => (round.data ? matchPairs(round.data) : []), [round.data]);
  const presets = currentPresets();

  const packetInfo = () => {
    if (source === 'doe' && set.data && round.data) {
      return { setId: set.data.id, setTitle: set.data.title, roundId: round.data.id, roundLabel: round.data.label, ...(round.data.sourceUrl ? { sourceUrl: round.data.sourceUrl } : {}) };
    }
    if (packet && round.data) return { setId: packet.set?.id ?? `team-${packet.id}`, setTitle: packet.title, roundId: round.data.id, roundLabel: round.data.label };
    return null;
  };

  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const info = packetInfo();
        if (!info || pairs.length === 0) return;
        setBusy(true);
        setError(null);
        try {
          const name = `${format === 'teams' ? `${teamNames[0]} vs ${teamNames[1]}` : 'Free-for-all'}: ${info.roundLabel}`;
          const roomId = await createRoom(name.slice(0, 60), {
            format,
            presetId,
            wpm,
            teamNames,
            packet: info,
            pairs,
            tossupCount: Math.min(count, pairs.length),
          });
          navigate(`/room/${roomId}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'The match could not be started.');
          setBusy(false);
        }
      }}
    >
      <h2 style={{ margin: 0 }}>Start an online match</h2>
      <p className="small muted" style={{ margin: 0 }}>
        No reader needed: the question appears on everyone’s screen at the same pace, you buzz and type your answer, and Rebound’s answer checker
        judges it. Close calls go to the opponents. You host the match and play in it too.
      </p>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Format</legend>
        <label className="checkbox">
          <input type="radio" name="format" checked={format === 'teams'} onChange={() => setFormat('teams')} /> Team vs team, under the NSB rules (toss-ups and
          bonuses; captains answer bonuses)
        </label>
        <label className="checkbox">
          <input type="radio" name="format" checked={format === 'ffa'} onChange={() => setFormat('ffa')} /> Everyone for themselves (toss-ups only: +4 right, −4 for a
          wrong interrupt)
        </label>
      </fieldset>

      <div className="grid">
        <div className="field">
          <label htmlFor="om-source">Questions</label>
          <select id="om-source" value={source} onChange={(e) => setSource(e.target.value as 'doe' | 'packet')}>
            <option value="doe">A DOE round</option>
            <option value="packet" disabled={data.packets.length === 0}>
              A team packet{data.packets.length === 0 ? ' (none yet)' : ''}
            </option>
          </select>
        </div>
        {source === 'doe' ? (
          <>
            <div className="field">
              <label htmlFor="om-set">Sample set</label>
              <select
                id="om-set"
                value={setId ?? ''}
                onChange={(e) => {
                  setSetId(e.target.value);
                  setRoundId(null);
                }}
              >
                {index.data &&
                  setGroups(index.data, level).map((g) => (
                    <optgroup key={g.level} label={g.label}>
                      {g.sets.map((s) => (
                        <option key={s.id} value={s.id}>
                          {setLabel(s)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="om-round">Round</label>
              <select id="om-round" value={roundId ?? ''} onChange={(e) => setRoundId(e.target.value)}>
                {set.data?.rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="om-packet">Packet</label>
              <select
                id="om-packet"
                value={packetId}
                onChange={(e) => {
                  setPacketId(e.target.value);
                  setPacketRoundId('');
                }}
              >
                {data.packets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            {pRounds.length > 1 && (
              <div className="field">
                <label htmlFor="om-packet-round">Round</label>
                <select id="om-packet-round" value={packetRoundId || pRounds[0]!.id} onChange={(e) => setPacketRoundId(e.target.value)}>
                  {pRounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid">
        {format === 'teams' ? (
          <>
            <div className="field">
              <label htmlFor="om-rules">Rules</label>
              <select id="om-rules" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="om-team-a">Side A</label>
              <input id="om-team-a" type="text" maxLength={40} value={teamNames[0]} onChange={(e) => setTeamNames([e.target.value, teamNames[1]])} />
            </div>
            <div className="field">
              <label htmlFor="om-team-b">Side B</label>
              <input id="om-team-b" type="text" maxLength={40} value={teamNames[1]} onChange={(e) => setTeamNames([teamNames[0], e.target.value])} />
            </div>
          </>
        ) : (
          <div className="field">
            <label htmlFor="om-count">Toss-ups</label>
            <input id="om-count" type="number" min={1} max={MAX_PAIRS} value={count} onChange={(e) => setCount(Math.max(1, Math.min(MAX_PAIRS, Number(e.target.value) || 1)))} />
          </div>
        )}
        <div className="field">
          <label htmlFor="om-wpm">Reading speed (words a minute)</label>
          <input id="om-wpm" type="number" min={60} max={600} step={10} value={wpm} onChange={(e) => setWpm(Math.max(60, Math.min(600, Number(e.target.value) || 200)))} />
        </div>
      </div>

      {round.loading && <Loading what="Loading the round" />}
      {round.error && <LoadError error={round.error} />}
      {round.data && (
        <p className="small muted" style={{ margin: 0 }}>
          {pairs.length} toss-up{pairs.length === 1 ? '' : 's'} from {round.data.label}
          {format === 'teams' ? `, ${pairs.filter((p) => 'bonus' in p).length} with bonuses` : `; the game uses the first ${Math.min(count, pairs.length)}`}.
          {round.data.pairs.length > pairs.length && ' Questions whose answers could not be read from the PDF are left out.'}
        </p>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <div>
        <button className="btn btn-primary" type="submit" disabled={busy || pairs.length === 0}>
          {busy ? 'Starting…' : 'Open the match'}
        </button>
      </div>
    </form>
  );
}

/** Play online: join an open game, or start an online match with no reader. Open to any signed-in player. */
export function OnlinePage() {
  const session = useSession();
  return (
    <div className="container">
      <PageHeader title="Play online">
        <p>
          Play from your own devices: teammates, or anyone with a Rebound account you send the link to. In an online match nobody needs to read:
          Rebound reveals each question, times the buzzers fairly, and judges typed answers. Everyone's answers go to their own account. For a game
          with a reader, open a <a href={href('/reader')}>Reader console</a> game and share its room.
        </p>
      </PageHeader>
      <div className="stack">
        {session.team ? (
          <RoomList />
        ) : (
          <Notice>
            Games your teammates open show up here once you are on a team (<a href={href('/team')}>Team</a>). Without one, start a match below and
            send its link, or open a link someone sent you.
          </Notice>
        )}
        <NewMatch />
      </div>
    </div>
  );
}
