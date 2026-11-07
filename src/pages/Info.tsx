import { PageHeader } from '../components/ui';
import { href } from '../lib/router';

export function CoachesPage() {
  return (
    <div className="container narrow">
      <PageHeader title="For coaches">
        <p>How to set Rebound up for your team, and what it stores.</p>
      </PageHeader>

      <h2>Set up in five minutes</h2>
      <ol>
        <li>
          Open Rebound on the laptop you use at practice and go to <a href={href('/team')}>Team</a>. Name the team and choose high school or
          middle school.
        </li>
        <li>Add your players. First names or nicknames are enough. Give each player a primary and a secondary subject if you assign them.</li>
        <li>
          Go to <a href={href('/reader')}>Play</a>, pick a DOE round and the rules to use (DOE Regional 2027 is the default), and put players on
          two teams.
        </li>
        <li>
          The reader taps <strong>Done reading</strong> after each question, taps the player who buzzed, then the result. Clocks, interrupts,
          rebounds and bonuses are handled automatically.
        </li>
        <li>
          After practice, <a href={href('/stats')}>Stats</a> shows each player's accuracy by subject, interrupts and buzz speed. Export a backup
          from <a href={href('/data')}>Data</a> each week.
        </li>
        <li>
          Enter your next competition on the <a href={href('/team')}>Team</a> page. Each player then picks their name on{' '}
          <a href={href('/today')}>Today</a> and gets a daily plan: reviews of what they missed in games and drills, a topic drill in their
          subject, and a mixed round. Misses from Reader console games reach the review queue when the game ends.
        </li>
      </ol>

      <h2>What Rebound stores, and where</h2>
      <ul>
        <li>
          The team name, players' display names, roles and subjects, the next competition date, practice game records, solo answers, which
          questions each player has heard, review schedules and daily plans.
        </li>
        <li>
          In this version, everything stays in this browser on this device. Nothing is sent to a server. Anyone using the same browser profile
          on this device can see it.
        </li>
        <li>You can download all of it as a file, load it on another device, or delete it, from the Data page.</li>
        <li>No ads, no analytics, no tracking.</li>
      </ul>

      <h2>Students under 13</h2>
      <p>
        If middle school students use Rebound, keep accounts coach-managed and use first names or nicknames only, and check your school's
        policy on student data in web apps.
      </p>
    </div>
  );
}

export function ItStaffPage() {
  return (
    <div className="container narrow">
      <PageHeader title="For school IT staff">
        <p>What Rebound needs from the network, so it works on school devices.</p>
      </PageHeader>
      <ul>
        <li>Rebound is a static website. Allow the domain it is hosted on; that is the only domain it loads anything from.</li>
        <li>It loads HTML, JavaScript, CSS and JSON question files from its own domain over standard HTTPS.</li>
        <li>It makes no requests to other domains, and uses no cookies, ads, analytics or trackers.</li>
        <li>Team data is stored in the browser's IndexedDB on the device.</li>
        <li>
          A service worker keeps a copy of the site (and, if a player chooses, the question files, about 9 MB) in the browser's Cache Storage
          so practice works offline. It only caches files from Rebound's own domain.
        </li>
        <li>
          Links to official DOE question PDFs and rulebooks point to <code>science.osti.gov</code>; allowing it lets students open the originals.
        </li>
      </ul>
      <h2>Coming later</h2>
      <p>
        Online team rooms will add a live connection (WebSocket, with a fallback to ordinary HTTPS requests) and a database host. This page will
        list those hosts before that feature is turned on.
      </p>
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="container narrow">
      <PageHeader title="Privacy, terms and credits" />

      <h2>Credits</h2>
      <p>
        Sample questions come from the U.S. Department of Energy's National Science Bowl sample question sets (
        <a href="https://science.osti.gov/wdts/nsb" target="_blank" rel="noreferrer">
          science.osti.gov/wdts/nsb
        </a>
        ). They are U.S. Government works in the public domain; DOE's Office of Science asks to be credited and linked, and every round in the
        Library links to its original PDF. Rebound reformats the questions for practice; any errors introduced are Rebound's, and you can report
        them from the Library.
      </p>
      <p>
        National Science Bowl® is a registered trademark of the U.S. Department of Energy. Rebound is an unofficial study tool and is not
        affiliated with or endorsed by DOE.
      </p>

      <h2>Privacy</h2>
      <p>
        Rebound stores your team's data only in your browser on your device. It does not send that data anywhere, does not use cookies for
        tracking, and does not show ads. You can export or delete everything from the Data page.
      </p>

      <h2>Terms</h2>
      <p>
        Rebound is provided free and as is, for practice. Rule summaries are a convenience; the official DOE rulebook and your competition's
        officials have the final say.
      </p>
      <p>
        Rebound's code is open source under the MIT License. The DOE questions are public domain and are not covered by that license.
      </p>
    </div>
  );
}
