import { Notice, PageHeader } from '../components/ui';
import { SUBJECT_LABELS } from '../core/schema';
import { toGameLogDoc } from '../core/nsbjson';
import { dateTimeText, downloadFile, percent, toCsv } from '../lib/format';
import { href, navigate } from '../lib/router';
import { bonusLines, gameLines, gameState, median } from '../lib/stats';
import { deleteGame, useData } from '../lib/store';

/**
 * How many review questions the game gave the signed-in player (misses, slow buzzes, dead toss-ups in their subject,
 * missed bonuses). Review queues are private, so each player sees only their own; the server writes each player's
 * answers when the game ends, and their device turns them into review questions within a minute.
 */
function ReviewNote({ gameId }: { gameId: string }) {
  const data = useData();
  const me = data.settings.soloPlayerId;
  const prefix = `game:${gameId}:`;
  // A card came from this game if the game created it (its first source).
  const n = Object.values(data.cards).filter((c) => c.playerId === me && c.sources[0]?.startsWith(prefix)).length;
  if (n === 0) return null;
  return (
    <Notice>
      This game added {n} question{n === 1 ? '' : 's'} to your <a href={href('/review')}>review queue</a>. Everyone else's misses go to their own.
    </Notice>
  );
}

export function GameSummary({ gameId }: { gameId: string }) {
  const data = useData();
  const game = data.games.find((g) => g.id === gameId);
  if (!game) {
    return (
      <div className="container narrow">
        <Notice kind="error">Game not found.</Notice>
      </div>
    );
  }
  const state = gameState(game);
  if (!state) {
    return (
      <div className="container narrow">
        <Notice kind="error">This game's record could not be read.</Notice>
      </div>
    );
  }
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Former player';
  const lines = gameLines(game, state);
  const bonuses = bonusLines(state);
  const teamOf = (id: string) => (game.teams[0].playerIds.includes(id) ? 0 : 1);

  const outcomes = game.pairs.map((pair, i) => {
    const entries = state.log.filter((e) => 'pairIndex' in e && e.pairIndex === i);
    if (entries.length === 0) return null;
    const tossupText = entries
      .filter((e) => e.kind === 'tossup')
      .map((e) => (e.kind === 'tossup' ? `${name(e.playerId)}${e.interrupt ? ' (interrupt)' : ''}: ${e.result}` : ''))
      .join('; ');
    const dead = entries.some((e) => e.kind === 'tossup_dead');
    const bonus = entries.find((e) => e.kind === 'bonus');
    const thrown = entries.find((e) => e.kind === 'throw_out');
    return {
      n: i + 1,
      subject: SUBJECT_LABELS[pair.subject],
      tossup: thrown && thrown.kind === 'throw_out' && thrown.part === 'tossup' ? 'thrown out' : tossupText || (dead ? 'no answer' : '–'),
      bonus: bonus && bonus.kind === 'bonus' ? `${game.teams[bonus.team].name}: ${bonus.result}` : '–',
    };
  });

  const exportCsv = () => {
    const rows = [
      ['player', 'team', 'tossup_attempts', 'tossup_correct', 'interrupts', 'interrupt_correct', 'wrong', 'blurts', 'stalls', 'talking', 'penalty_points', 'median_buzz_seconds'],
      ...lines.map((l) => [
        name(l.playerId),
        game.teams[teamOf(l.playerId)].name,
        l.tossupAttempts,
        l.tossupCorrect,
        l.interrupts,
        l.interruptCorrect,
        l.faults.incorrect,
        l.faults.blurt,
        l.faults.stall,
        l.faults.communication,
        l.penaltyPoints,
        median(l.correctLatencies) === null ? '' : (median(l.correctLatencies)! / 1000).toFixed(2),
      ]),
    ];
    downloadFile(`rebound-game-${game.createdAt.slice(0, 10)}.csv`, toCsv(rows), 'text/csv');
  };

  return (
    <div className="container">
      <p className="small">
        <a href={href('/today')}>Today</a> /
      </p>
      <PageHeader title={`${game.teams[0].name} ${state.scores[0]} – ${state.scores[1]} ${game.teams[1].name}`}>
        <p>
          {game.packet.setTitle}, {game.packet.roundLabel} · {dateTimeText(game.createdAt)}
          {game.online && ' · online match'}
          {game.status === 'in_progress' && ' · not finished'}
        </p>
        <div className="row">
          {game.status === 'in_progress' && (
            <a className="btn btn-primary" href={href(`/reader/${game.id}`)}>
              Resume game
            </a>
          )}
          <button className="btn" onClick={exportCsv}>
            Download player stats (CSV)
          </button>
          <button
            className="btn btn-ghost"
            title="The whole game, event by event, in NSB-JSON: other tools can re-score it"
            onClick={() => {
              try {
                const doc = toGameLogDoc(game, { players: data.players });
                downloadFile(`rebound-game-${game.createdAt.slice(0, 10)}.nsb.json`, `${JSON.stringify(doc, null, 2)}\n`);
              } catch (e) {
                alert(e instanceof Error ? e.message : 'The game log could not be made.');
              }
            }}
          >
            Download game log (NSB-JSON)
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (confirm('Delete this game and its stats? This cannot be undone.')) {
                deleteGame(game.id);
                navigate('/today');
              }
            }}
          >
            Delete game
          </button>
        </div>
      </PageHeader>

      {game.status === 'finished' && <ReviewNote gameId={game.id} />}

      <h2>Players</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Toss-ups</th>
              <th className="num">Interrupts</th>
              <th className="num">Wrong / blurt / stall / talking</th>
              <th className="num">Points given away</th>
              <th className="num">Median buzz</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.playerId}>
                <td>
                  {name(l.playerId)} <span className="muted small">({game.teams[teamOf(l.playerId)].name})</span>
                </td>
                <td className="num">
                  {l.tossupCorrect} / {l.tossupAttempts}
                </td>
                <td className="num">
                  {l.interruptCorrect} / {l.interrupts}
                </td>
                <td className="num">
                  {l.faults.incorrect} / {l.faults.blurt} / {l.faults.stall} / {l.faults.communication}
                </td>
                <td className="num">{l.penaltyPoints || '–'}</td>
                <td className="num">{median(l.correctLatencies) === null ? '–' : `${(median(l.correctLatencies)! / 1000).toFixed(1)} s`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Toss-ups and interrupts show correct / attempted. Median buzz is the time from the end of the reading to the buzz, on correct answers that
        were not interrupts.
      </p>

      <h2>Bonuses</h2>
      <div className="grid">
        {bonuses.map((b, i) => (
          <div className="card" key={i}>
            <strong>{game.teams[i].name}</strong>
            <div>
              {b.correct} of {b.heard} bonuses ({percent(b.correct, b.heard)})
            </div>
          </div>
        ))}
      </div>

      <h2>Question by question</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Subject</th>
              <th>Toss-up</th>
              <th>Bonus</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) =>
              o ? (
                <tr key={o.n}>
                  <td className="num">{o.n}</td>
                  <td>{o.subject}</td>
                  <td>{o.tossup}</td>
                  <td>{o.bonus}</td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      </div>
      {state.log.some((e) => e.kind === 'adjust') && (
        <>
          <h2>Score adjustments</h2>
          <ul>
            {state.log.map((e, i) =>
              e.kind === 'adjust' ? (
                <li key={i}>
                  {game.teams[e.team].name} {e.delta > 0 ? '+' : ''}
                  {e.delta}: {e.note}
                </li>
              ) : null,
            )}
          </ul>
        </>
      )}
    </div>
  );
}
