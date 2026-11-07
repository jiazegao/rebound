import { PageHeader } from '../components/ui';
import { href } from '../lib/router';
import { SERVER_URL } from '../lib/sync';

/** The team server's host name, when this build has one. */
function serverHost(): string | null {
  try {
    return SERVER_URL ? new URL(SERVER_URL).host : null;
  } catch {
    return null;
  }
}

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
          questions each player has heard, review schedules, daily plans, lineups, assignments, team packets, concept cards, and visual
          questions the team adds (with their pictures).
        </li>
        <li>
          All of it is kept in this browser on this device. Anyone using the same browser profile on this device can see it. You can download it
          as a file, load it on another device, or delete it, from the <a href={href('/data')}>Data</a> page.
        </li>
        <li>
          If you share the team (<a href={href('/team')}>Team</a> → Share with your team), a copy is also kept on Rebound's team server, which runs
          on Cloudflare, so players' devices stay in sync. Only the team's signed-in members can read it. Members sign in with a display name and
          a PIN, which is stored only as a salted hash; there are no emails or passwords to reset. The coach or captain can remove members, and can
          delete the whole team from the server on the Team page.
        </li>
        <li>Remote rooms pass the game, the buzzes and the team channel through the same server while the room is open; team-channel messages are not saved.</li>
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
  const host = serverHost();
  return (
    <div className="container narrow">
      <PageHeader title="For school IT staff">
        <p>What Rebound needs from the network, so it works on school devices.</p>
      </PageHeader>
      <ul>
        <li>Rebound is a static website. Allow the domain it is hosted on; it loads all of its pages, code and question files from there.</li>
        <li>It loads HTML, JavaScript, CSS and JSON question files from its own domain over standard HTTPS.</li>
        <li>
          Teams that share their data between devices, or play in remote rooms, also connect to Rebound's team server
          {host ? (
            <>
              {' '}
              at <code>{host}</code>
            </>
          ) : (
            ' (the address the team enters when it shares)'
          )}
          : HTTPS requests to keep data in sync, and a secure WebSocket (<code>wss://</code>) during a remote room. Allow that host, including
          WebSocket upgrades. Without it, everything else still works on each device.
        </li>
        <li>It uses no cookies, ads, analytics or trackers, and makes no requests to any other domain.</li>
        <li>Team data is stored in the browser's IndexedDB on the device and, for teams that share, on the team server.</li>
        <li>
          A service worker keeps a copy of the site (and, if a player chooses, the question files and the Visual lab's photos, about 12 MB) in the browser's Cache Storage
          so practice works offline. It only caches files from Rebound's own domain.
        </li>
        <li>
          Links to official DOE question PDFs and rulebooks point to <code>science.osti.gov</code>; allowing it lets students open the originals.
        </li>
      </ul>
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
        Rebound keeps your team's data in your browser on your device. If your captain shares the team, a copy is also kept on Rebound's team
        server (on Cloudflare), where only the team's signed-in members can read it. Members sign in with a display name and a PIN; the PIN is
        stored only as a salted hash, and no emails are collected. To slow down PIN guessing, the server counts sign-ins from each network
        address over the past hour, keeping only a salted hash of the address. The coach or captain can delete the team from the server on the
        Team page.
      </p>
      <p>
        Rebound does not use cookies for tracking, has no analytics and shows no ads. You can export or delete everything on a device from the{' '}
        <a href={href('/data')}>Data</a> page.
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
