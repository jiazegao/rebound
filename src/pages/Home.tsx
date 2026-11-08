import { CURRENT_SEASON } from '../core/rules/presets';
import { useSession } from '../lib/cloud';
import { href } from '../lib/router';

export function Home() {
  const session = useSession();
  const signedIn = session.status !== 'signed-out';
  return (
    <div className="container">
      <section className="hero">
        <h1>Practice like the real thing. Learn from every miss.</h1>
        <p>
          Rebound is a free practice website for National Science Bowl teams. Run practice games under the official {CURRENT_SEASON} rules, log every
          buzz automatically, and study every DOE sample question.
        </p>
        <div className="row">
          <a className="btn btn-primary btn-big" href={href('/try')}>
            Try a round
          </a>
          {signedIn ? (
            <a className="btn btn-big" href={href('/today')}>
              {session.team ? `Go to ${session.team.team.name}` : 'Go to Today'}
            </a>
          ) : (
            <a className="btn btn-big" href={href('/signin')}>
              Sign in
            </a>
          )}
        </div>
        <p className="small muted" style={{ marginTop: '0.75rem' }}>
          Nothing to install, and no account needed to try a round or browse the library. Works on Chromebooks, laptops and phones.
        </p>
      </section>

      <div className="grid">
        <div className="card">
          <h3>Run practice from one laptop</h3>
          <p>
            The Reader console shows each question in large type, runs the 5-second and 20-second clocks, and applies the {CURRENT_SEASON} scoring rules,
            including interrupts, blurts and rebounds. Two taps record every toss-up.
          </p>
        </div>
        <div className="card">
          <h3>Every official sample question</h3>
          <p>
            All of DOE's high school and middle school sample sets, cleaned up and searchable by subject, with a link back to each original PDF.
            Rebound tracks which questions each player has already heard.
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
          <h3>A plan for every player, every day</h3>
          <p>
            Today gives each player a short plan for the time they have: due reviews of the questions they missed or answered slowly, a drill
            on a weak, high-frequency topic in their subject, and a mixed round. It shifts toward game play as the next competition gets close.
          </p>
        </div>
        <div className="card">
          <h3>Your practice follows you</h3>
          <p>
            Sign in with Google and your answers, review queue and plan are saved to your account, on the school laptop, your phone or at home.
            Accounts are for players 13 and older.
          </p>
        </div>
        <div className="card">
          <h3>One team, shared stats</h3>
          <p>
            Join your team with the link your coach posts. Teammates see each other's stats; review queues and plans stay private. No ads, no
            trackers.
          </p>
        </div>
      </div>

      <h2>What's next</h2>
      <p className="muted" style={{ maxWidth: '70ch' }}>
        New in this release: accounts, so practice follows each player from device to device, and online matches open to any player with the link.
      </p>
    </div>
  );
}
