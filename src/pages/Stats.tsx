import { Notice, PageHeader } from '../components/ui';
import { CORE_SUBJECTS, SUBJECT_LABELS } from '../core/schema';
import { downloadFile, percent, toCsv } from '../lib/format';
import { href } from '../lib/router';
import { median, playerLines } from '../lib/stats';
import { useData } from '../lib/store';

export function StatsPage() {
  const data = useData();
  const lines = playerLines(data).filter((l) => l.tossupAttempts + l.soloAnswered + l.games > 0 || data.players.some((p) => p.id === l.playerId && p.active));
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Unknown player';
  const finished = data.games.filter((g) => g.status === 'finished').length;

  const exportCsv = () => {
    const rows = [
      [
        'player',
        'games',
        'tossup_attempts',
        'tossup_correct',
        'interrupts',
        'interrupt_correct',
        'wrong',
        'blurts',
        'stalls',
        'talking',
        'penalty_points',
        'median_buzz_seconds',
        'bonuses_heard',
        'bonuses_correct',
        'solo_answered',
        'solo_correct',
        ...CORE_SUBJECTS.flatMap((s) => [`${s}_attempts`, `${s}_correct`]),
      ],
      ...lines.map((l) => [
        name(l.playerId),
        l.games,
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
        l.bonusesHeard,
        l.bonusesCorrect,
        l.soloAnswered,
        l.soloCorrect,
        ...CORE_SUBJECTS.flatMap((s) => [l.bySubject[s]?.attempts ?? 0, l.bySubject[s]?.correct ?? 0]),
      ]),
    ];
    downloadFile(`rebound-stats-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), 'text/csv');
  };

  return (
    <div className="container">
      <p className="small">
        <a href={href('/team')}>Team</a> /
      </p>
      <PageHeader title="Team stats">
        <p>
          From {finished} finished game{finished === 1 ? '' : 's'} in the Reader console, plus solo practice. Numbers based on a handful of
          questions move a lot; look for trends over several practices.
        </p>
        <button className="btn" onClick={exportCsv} disabled={lines.length === 0}>
          Download (CSV)
        </button>
      </PageHeader>

      {lines.length === 0 ? (
        <Notice>
          No stats yet. Run a game in the <a href={href('/reader')}>Reader console</a>.
        </Notice>
      ) : (
        <>
          <h2>Toss-ups and interrupts</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="num">Games</th>
                  <th className="num">Toss-ups</th>
                  <th className="num">Accuracy</th>
                  <th className="num" title="Interrupts that were answered correctly">Interrupts right</th>
                  <th className="num" title="Points handed to the other team by wrong interrupts">Given away</th>
                  <th className="num">Median buzz</th>
                  <th className="num" title="Bonus conversion of the player's team">Bonuses</th>
                  <th className="num">Solo</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.playerId}>
                    <td>{name(l.playerId)}</td>
                    <td className="num">{l.games}</td>
                    <td className="num">
                      {l.tossupCorrect} / {l.tossupAttempts}
                    </td>
                    <td className="num">{percent(l.tossupCorrect, l.tossupAttempts)}</td>
                    <td className="num">
                      {l.interruptCorrect} / {l.interrupts}
                    </td>
                    <td className="num">{l.penaltyPoints || '–'}</td>
                    <td className="num">{median(l.correctLatencies) === null ? '–' : `${(median(l.correctLatencies)! / 1000).toFixed(1)} s`}</td>
                    <td className="num">{percent(l.bonusesCorrect, l.bonusesHeard)}</td>
                    <td className="num">{l.soloAnswered ? `${l.soloCorrect} / ${l.soloAnswered}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            A wrong interrupt gives the other team 4 points and a full re-read, so "given away" is worth watching alongside accuracy. "Bonuses" is the conversion rate of the player's team.
          </p>

          <h2>Toss-up accuracy by subject</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  {CORE_SUBJECTS.map((s) => (
                    <th key={s} className="num">
                      {SUBJECT_LABELS[s]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.playerId}>
                    <td>{name(l.playerId)}</td>
                    {CORE_SUBJECTS.map((s) => {
                      const line = l.bySubject[s];
                      return (
                        <td key={s} className="num" title={line ? `${line.correct} of ${line.attempts}` : 'No attempts'}>
                          {line ? `${percent(line.correct, line.attempts)} (${line.attempts})` : '–'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Each cell shows accuracy and, in brackets, how many toss-ups the player buzzed on in that subject.</p>
        </>
      )}
    </div>
  );
}
