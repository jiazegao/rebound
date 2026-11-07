import { Notice, PageHeader } from '../components/ui';
import { CORE_SUBJECTS, SUBJECT_LABELS } from '../core/schema';
import { downloadFile, percent, toCsv } from '../lib/format';
import { href } from '../lib/router';
import { fewAnswers, median, netPerInterrupt, playerLines, weeklyTrend } from '../lib/stats';
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
        'rebound_attempts',
        'rebound_correct',
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
        l.rebounds.attempts,
        l.rebounds.correct,
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
                  <th className="num" title="Average points per interrupt: +4 for a right one, −4 for a wrong one">Net per interrupt</th>
                  <th className="num" title="Points handed to the other team by wrong interrupts">Given away</th>
                  <th className="num" title="Toss-ups answered after the other team got them wrong">Rebounds</th>
                  <th className="num">Median buzz</th>
                  <th className="num" title="Bonus conversion of the player's team">Bonuses</th>
                  <th className="num">Solo</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.playerId}>
                    <td>
                      <a href={href(`/progress?player=${encodeURIComponent(l.playerId)}`)}>{name(l.playerId)}</a>
                    </td>
                    <td className="num">{l.games}</td>
                    <td className="num">
                      {l.tossupCorrect} / {l.tossupAttempts}
                    </td>
                    <td className={`num${fewAnswers(l.tossupAttempts) ? ' muted' : ''}`} title={fewAnswers(l.tossupAttempts) ? 'Fewer than 10 toss-ups: too few to compare' : undefined}>
                      {percent(l.tossupCorrect, l.tossupAttempts)}
                      {l.tossupAttempts > 0 && fewAnswers(l.tossupAttempts) && ' *'}
                    </td>
                    <td className="num">
                      {l.interruptCorrect} / {l.interrupts}
                    </td>
                    <td className="num">{netPerInterrupt(l) === null ? '–' : `${netPerInterrupt(l)! > 0 ? '+' : ''}${netPerInterrupt(l)!.toFixed(1)}`}</td>
                    <td className="num">{l.penaltyPoints || '–'}</td>
                    <td className="num">{l.rebounds.attempts ? `${l.rebounds.correct} / ${l.rebounds.attempts}` : '–'}</td>
                    <td className="num">{median(l.correctLatencies) === null ? '–' : `${(median(l.correctLatencies)! / 1000).toFixed(1)} s`}</td>
                    <td className="num">{percent(l.bonusesCorrect, l.bonusesHeard)}</td>
                    <td className="num">{l.soloAnswered ? `${l.soloCorrect} / ${l.soloAnswered}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            * fewer than 10 toss-ups, too few to compare players. A wrong interrupt gives the other team 4 points and a full re-read, so an interrupt
            only pays when a player is well over 50% sure: "net per interrupt" above zero means a player's interrupts are paying off. "Bonuses" is
            the conversion rate of the player's team. Select a name for that player's topics and progress.
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
                        <td key={s} className={`num${line && fewAnswers(line.attempts) ? ' muted' : ''}`} title={line ? `${line.correct} of ${line.attempts}` : 'No attempts'}>
                          {line ? `${percent(line.correct, line.attempts)} (${line.attempts})` : '–'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            Each cell shows accuracy and, in brackets, how many toss-ups the player buzzed on in that subject (grey: fewer than 10).
          </p>

          <WeekByWeek />
        </>
      )}
    </div>
  );
}

function WeekByWeek() {
  const data = useData();
  const weeks = weeklyTrend(data);
  if (weeks.length === 0) return null;
  return (
    <>
      <h2>Practice games, week by week</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Week of</th>
              <th className="num">Games</th>
              <th className="num" title="Toss-ups someone answered correctly, out of those read">Toss-ups answered</th>
              <th className="num">Bonus conversion</th>
              <th className="num">Wrong interrupts</th>
              <th className="num" title="Both sides together">Points per game</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week}>
                <td>{new Date(`${w.week}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td className="num">{w.games}</td>
                <td className="num">
                  {percent(w.tossupsAnswered, w.tossupsRead)} ({w.tossupsAnswered} / {w.tossupsRead})
                </td>
                <td className="num">
                  {percent(w.bonusesCorrect, w.bonusesHeard)} ({w.bonusesCorrect} / {w.bonusesHeard})
                </td>
                <td className="num">{w.wrongInterrupts}</td>
                <td className="num">{Math.round(w.points / w.games)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Newest first. More toss-ups answered and fewer wrong interrupts over the weeks are the trends to look for.</p>
    </>
  );
}
