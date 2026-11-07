import { useState } from 'react';
import { PageHeader } from '../components/ui';
import { PRESETS, type RulesPreset } from '../core/rules/presets';

function rows(p: RulesPreset): Array<[string, string]> {
  const t = p.timing;
  return [
    ['Scoring', `Toss-up ${p.points.tossup} points. Bonus ${p.points.bonus} points, offered only to the team that answered the toss-up correctly.`],
    [
      'Wrong interrupt',
      p.interruptFaultMode === 'opponent_gains'
        ? `If a player buzzes before the toss-up is fully read and then answers wrong, blurts, stalls or talks, the other team gets ${p.points.interruptFault} points and hears the whole question again.`
        : `If a player buzzes before the toss-up is fully read and then answers wrong, their team loses ${p.points.interruptFault} points.`,
    ],
    ['Blurt on a fully read toss-up', '0 points; that team loses the toss-up, and the other team may still answer.'],
    ['Time to buzz', `${t.tossupWindowSec} seconds after the toss-up is fully read, including all four choices.`],
    ['After a wrong answer', `The other team gets another ${t.reboundWindowSec} seconds to buzz.`],
    ['Answering a toss-up', `The player must start answering within a natural pause of up to ${t.naturalPauseSec} seconds after being recognized, or it is a stall.`],
    ['Bonus', `${t.bonusSec} seconds for the captain to begin answering, with a "5 SECONDS" warning after ${t.bonusWarningAtSec}.`],
    ...(p.official && p.visualBonus
      ? ([
          [
            'Visual bonus',
            `A figure is shown on a monitor or a worksheet. ${p.visualBonus.sec} seconds for the captain to begin answering, with the "5 SECONDS" warning after ${p.visualBonus.warningAtSec}. Figures may or may not be drawn to scale.`,
          ],
        ] as Array<[string, string]>)
      : []),
    [
      'Game length',
      p.clock
        ? `${p.clock.halves} halves of ${p.clock.halfMinutes} minutes with a ${p.clock.breakMinutes}-minute break${p.maxTossups ? `, or ${p.maxTossups} toss-ups, whichever comes first` : ''}.`
        : 'No game clock: play through the packet.',
    ],
    ['Talking during toss-ups', p.communication.tossup],
    ['Talking during bonuses', p.communication.bonus],
    ['Challenges', p.unsuccessfulChallengeLimit ? `Up to ${p.unsuccessfulChallengeLimit} unsuccessful science challenges per team per round.` : 'Not tracked.'],
    ['Ties', `In elimination games, ${p.tiebreakTossups} toss-ups with no bonuses and no clock, repeated until the tie is broken.`],
    ...(p.id === 'doe-regional-2027'
      ? ([
          [
            'Round robin ties',
            'Head-to-head record first. Two teams still tied play a 5 toss-up tiebreaker; three or more each hear the same 5 toss-ups in separate rooms, read in full, scored +1 for a right answer, −1 for a wrong one and 0 for none (Rule 9-1).',
          ],
        ] as Array<[string, string]>)
      : []),
  ];
}

export function RulesPage() {
  const official = PRESETS.filter((p) => p.official);
  const [presetId, setPresetId] = useState(official[0].id);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  return (
    <div className="container narrow">
      <PageHeader title="NSB rules at a glance">
        <p>
          A plain-language summary of the 2027 National Science Bowl rules. This page is generated from the same settings Rebound's game engine
          uses, so the two always agree. The official rulebook is the authority; regional events may adjust some rules.
        </p>
      </PageHeader>

      <div className="row" role="tablist" aria-label="Rule set" style={{ marginBottom: '1rem' }}>
        {official.map((p) => (
          <button key={p.id} role="tab" aria-selected={p.id === presetId} className={`btn ${p.id === presetId ? 'btn-primary' : ''}`} onClick={() => setPresetId(p.id)}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <tbody>
            {rows(preset).map(([label, text]) => (
              <tr key={label}>
                <th scope="row" style={{ width: '32%', whiteSpace: 'normal' }}>
                  {label}
                </th>
                <td>{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Details worth knowing</h2>
      <ul>
        {preset.notes.map((n) => (
          <li key={n.rule + n.text}>
            <strong>Rule {n.rule}:</strong> {n.text}
          </li>
        ))}
      </ul>

      <h2>Answer conventions</h2>
      <ul>
        <li>Numbers must be exact and in simplest form: integers as integers, fractions in lowest terms, radicals simplified and rationalized, π left as π.</li>
        <li>No scientific notation unless the question asks for it, and no repeating decimals (use fractions).</li>
        <li>On multiple choice, give the letter (W, X, Y or Z) or the answer text exactly; if you give both, both must be right. Most teams answer with the letter only.</li>
        <li>Questions with several answers: give them in the order asked, or say which is which.</li>
        <li>"Identify all" questions: the item numbers or names are fine, and "all" or "none" are allowed.</li>
        <li>Name the law or constant ("Newton's second law"), not its formula.</li>
        <li>Assume g = 9.8 m/s², radians for trigonometry, base-10 numbers and fair coins and dice.</li>
      </ul>

      {preset.source && (
        <p>
          Source:{' '}
          <a href={preset.source.url} target="_blank" rel="noreferrer">
            {preset.source.title} (PDF, U.S. Department of Energy)
          </a>
        </p>
      )}
    </div>
  );
}
