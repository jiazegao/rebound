import { href } from '../lib/router';
import { useData } from '../lib/store';

export function Home() {
  const data = useData();
  return (
    <div className="container">
      <section className="hero">
        <h1>Practice like the real thing. Learn from every miss.</h1>
        <p>
          Rebound is a free practice website for National Science Bowl teams. Run practice games under the official 2027 rules, log every
          buzz automatically, and study every DOE sample question.
        </p>
        <div className="row">
          <a className="btn btn-primary btn-big" href={href('/try')}>
            Try a round
          </a>
          <a className="btn btn-big" href={href(data.team ? '/today' : '/team')}>
            {data.team ? `Go to ${data.team.name}` : 'Set up your team'}
          </a>
        </div>
        <p className="small muted" style={{ marginTop: '0.75rem' }}>
          Nothing to install. No account needed. Works on Chromebooks, laptops and phones.
        </p>
      </section>

      <div className="grid">
        <div className="card">
          <h3>Run practice from one laptop</h3>
          <p>
            The Reader console shows each question in large type, runs the 5-second and 20-second clocks, and applies the 2027 scoring rules,
            including interrupts, blurts and rebounds. Two taps record every toss-up.
          </p>
        </div>
        <div className="card">
          <h3>Every official sample question</h3>
          <p>
            All of DOE's high school sample sets, cleaned up and searchable by subject, with a link back to each original PDF. Rebound tracks
            which questions each player has already heard.
          </p>
        </div>
        <div className="card">
          <h3>Stats that match the game</h3>
          <p>
            See each player's toss-up accuracy by subject, how often their interrupts pay off, and how fast they buzz, so the team knows who
            covers what.
          </p>
        </div>
        <div className="card">
          <h3>Your team's data stays with you</h3>
          <p>
            In this version everything is stored in your browser, on your device. Export a backup file at any time. No ads, no trackers.
          </p>
        </div>
      </div>

      <h2>What's next</h2>
      <p className="muted" style={{ maxWidth: '70ch' }}>
        This is the first release. Coming next: a personal daily plan for each player, timed review of missed questions, concept cards for
        every subject, lineup suggestions, and online team rooms.
      </p>
    </div>
  );
}
