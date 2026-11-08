import { PageHeader } from '../components/ui';
import { serverUrl } from '../lib/api';
import { href } from '../lib/router';

/** The server's host name, when this build has one (or one was entered on the sign-in page). */
function serverHost(): string | null {
  try {
    const url = serverUrl();
    return url ? new URL(url).host : null;
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
          <a href={href('/signin')}>Sign in</a> with your Google account, then go to <a href={href('/team')}>Team</a> and create the team: its name, and
          high school or middle school. You become its captain.
        </li>
        <li>
          Post the team's invite link where only your players see it (your team chat). Each player signs in with their own account and opens the
          link to join. You can make a new link at any time; the old one stops working.
        </li>
        <li>
          On the Team page, make your assistant coaches coaches and your captains captains, and give players their sub-team and subjects (players
          can set their own subjects too).
        </li>
        <li>
          Open the <a href={href('/reader')}>Reader console</a>, pick a DOE round and the rules to use (DOE Regional 2027 is the default), and put players on two
          teams. The reader taps <strong>Done reading</strong> after each question, taps the player who buzzed, then the result. Clocks,
          interrupts, rebounds and bonuses are handled automatically.
        </li>
        <li>
          When the game ends, each player's answers go to their own account: misses and slow buzzes reach their review queue, and{' '}
          <a href={href('/stats')}>Stats</a> shows each player's accuracy by subject, interrupts and buzz speed.
        </li>
        <li>
          Enter your next competition on the Team page. Each player gets a daily plan on <a href={href('/today')}>Today</a>: reviews of what they
          missed, a topic drill in their subject and a mixed round, shifting toward game play as the date gets close.
        </li>
      </ol>

      <h2>What Rebound stores, and where</h2>
      <ul>
        <li>
          <strong>Each player's account:</strong> their email address, name, when they confirmed they are 13 or older, subjects, graduation year and
          settings, and all their practice: practice and game answers, review queue, daily plan, which questions they have heard and which concept
          cards and readings they have read, finished assignments and problem reports. It belongs to the player and goes with them if they change
          teams.
        </li>
        <li>
          <strong>The team:</strong> its name, level and next competition, its members and their roles, the invite link, Reader console games,
          lineups, assignments, packets, written questions, concept cards and visual questions.
        </li>
        <li>
          All of it is kept on Rebound's server, which runs on Cloudflare, not on the device: a laptop or phone keeps only a sign-in token. So
          practice needs an internet connection, and a shared laptop shows nothing of anyone's once they sign out.
        </li>
        <li>
          Teammates see each other's stats: game results, accuracy and practice activity. A player's review queue and daily plan stay private.
          Coaches and captains manage members and roles, set lineups and assignments, and can delete the team (members keep their own practice).
        </li>
        <li>
          Any player can download everything in their account, or delete the account and everything in it, from their{' '}
          <a href={href('/account')}>Account</a> page.
        </li>
        <li>
          Online matches are open to anyone signed in who has the link, whatever their team. Each player's results go to their own account; a team
          match whose players are all on the host's team also counts in that team's stats. Team-channel messages are not saved.
        </li>
        <li>
          If the server has AI help turned on, a passage a player pastes for AI drafts, or a question they ask to have explained, is sent to
          Anthropic's Claude API to write the reply. Nothing else is sent, and every AI draft stays labeled and needs a person's approval.
        </li>
        <li>No ads, no analytics, no tracking.</li>
      </ul>

      <h2>Students under 13</h2>
      <p>
        Rebound accounts are for people 13 and older, as U.S. law on children's privacy (COPPA) expects of a free service like this; personal
        Google accounts start at 13 too. Everyone confirms their age when they create an account. Middle school players who are younger can still
        practice with <a href={href('/try')}>Try a round</a> and the <a href={href('/library')}>Library</a> without an account (nothing is saved),
        and coaches can print any round from the Library to read aloud.
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
        <li>Rebound is a static website. Allow the domain it is hosted on; it loads all of its pages, code and question files from there over HTTPS.</li>
        <li>
          Players sign in to an account. Everything about their practice is kept on Rebound's server
          {host ? (
            <>
              {' '}
              at <code>{host}</code>
            </>
          ) : (
            ''
          )}
          : HTTPS requests for accounts and practice, and a secure WebSocket (<code>wss://</code>) during remote rooms and online matches. Allow that
          host, including WebSocket upgrades. Practice needs this connection: nothing about a player is kept on the device.
        </li>
        <li>
          Sign-in uses Google: the sign-in page (and only that page) loads Google's sign-in script from <code>accounts.google.com</code> and opens
          Google's sign-in window from there. Allow <code>accounts.google.com</code>. With school Google accounts, your Google Workspace admin may
          need to allow Rebound as a third-party app before students can sign in (Google can block sign-in to apps an admin has not allowed,
          especially for student accounts).
        </li>
        <li>
          Where the server has email sign-in turned on, players can instead get a one-time sign-in link by email; it comes from Rebound's email
          sender (through Resend), so make sure those messages are not filtered out.
        </li>
        <li>
          On the device, Rebound keeps only a sign-in token (in the browser's local storage). It uses no cookies, ads, analytics or trackers.
        </li>
        <li>
          A service worker keeps a copy of the site and of the public question files in the browser's Cache Storage, so pages open quickly. It only
          caches files from Rebound's own domain, never a player's data.
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
        You can try a round and use the Library without an account; then Rebound saves nothing. To keep your practice, you sign in. Accounts are
        for people 13 and older, and you confirm your age when you create one.
      </p>
      <p>
        <strong>Signing in.</strong> With Google, the sign-in page loads Google's sign-in script from accounts.google.com, and Google gives Rebound
        a signed note with your email address (which Google has checked), your Google account number and your Google profile name. Rebound keeps
        the email address and the account number to recognize you, uses the name you choose, and never sees your Google password. With an email
        link (where it is turned on), Rebound sends a one-time link to your address through its email service, Resend. There are no Rebound
        passwords. To slow down abuse, the server counts sign-in emails and new accounts from each network address for a day.
      </p>
      <p>
        <strong>What is kept.</strong> Your account holds your email address, the name you choose, when you confirmed you are 13 or older, your
        subjects, graduation year and settings, and your practice: answers, review queue, daily plan, which questions you have heard and what you
        have read, finished assignments and problem reports. It is kept on Rebound's server (on Cloudflare), not on your device; your device keeps
        only a sign-in token, which lasts until you sign out or for 180 days of not using it. Your team keeps its own games, lineups, packets and
        other shared work, and a copy of each member's name and subjects.
      </p>
      <p>
        <strong>Who sees it.</strong> Your teammates see your stats (game results, accuracy and practice activity), and you see theirs. Your review
        queue and daily plan are only yours. In an online match, the other players see your name and your answers during the match.
      </p>
      <p>
        <strong>Your choices.</strong> On your <a href={href('/account')}>Account</a> page you can download everything in your account, or delete
        the account and everything in it. Leaving a team takes your practice history with you. Coaches and captains can delete their team.
      </p>
      <p>
        AI help is optional and off unless the server has it turned on. When you ask for AI drafts or an explanation, the passage or question you
        send goes to Anthropic's Claude API to write the reply; nothing else about you is sent.
      </p>
      <p>Rebound does not use cookies for tracking, has no analytics and shows no ads.</p>

      <h2>Terms</h2>
      <p>
        Rebound is provided free and as is, for practice. Rule summaries are a convenience; the official DOE rulebook and your competition's
        officials have the final say.
      </p>
      <p>
        Any school's Science Bowl team may use Rebound and its server, with accounts for people 13 and older. Keep to practice material, and
        download your data from your Account page now and then: the server is run by volunteers and may be unavailable at times. Questions a team
        writes or uploads stay with that team; do not upload packets you are not allowed to share. Accounts or teams that abuse the service may be
        removed.
      </p>
      <p>
        AI-drafted questions and explanations can be wrong. They are labeled, need a person's approval, and are for a team's own practice, not
        for publishing or for competitions. Paste only text whose license allows it into AI drafts: U.S. government pages are public domain, but
        OpenStax's books may not be put into AI tools.
      </p>
      <p>
        Rebound's code is open source under the MIT License. The DOE questions are public domain and are not covered by that license.
      </p>
    </div>
  );
}
