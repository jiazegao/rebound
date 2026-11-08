import { useState, type ReactNode } from 'react';
import { AccountFailed, AccountLoading, SignInNeeded, TeamNeeded } from './components/Gates';
import { Notice } from './components/ui';
import { signOut } from './lib/account';
import { clearSessionMessage, dismissRefused, flushNow, getConnection, reloadAccount, useConnection, useSession } from './lib/cloud';
import { href, navigate, useRoute } from './lib/router';
import { useData } from './lib/store';
import { Home } from './pages/Home';
import { RulesPage } from './pages/Rules';
import { CoachesPage, ItStaffPage, AboutPage } from './pages/Info';
import { TodayPage } from './pages/Today';
import { ReviewPage } from './pages/Review';
import { ProgressPage } from './pages/Progress';
import { TopicsPage } from './pages/Topics';
import { LineupsPage } from './pages/Lineups';
import { PacketsPage, PacketView } from './pages/Packets';
import { ConceptPage, LearnPage } from './pages/Learn';
import { ReadingPathsPage } from './pages/ReadingPaths';
import { AssignmentsPage } from './pages/Assignments';
import { RoomPage } from './pages/Room';
import { JoinPage } from './pages/Join';
import { TeamPage } from './pages/Team';
import { LibraryPage } from './pages/Library';
import { ReaderSetup } from './pages/ReaderSetup';
import { ReaderLive } from './pages/ReaderLive';
import { GameSummary } from './pages/GameSummary';
import { TryRound } from './pages/TryRound';
import { StatsPage } from './pages/Stats';
import { AccountPage } from './pages/Account';
import { SignInPage } from './pages/SignIn';
import { VisualLabPage } from './pages/VisualLab';
import { ShootoutConsole, TiebreakersPage } from './pages/Tiebreakers';
import { WritePage } from './pages/Write';
import { OnlinePage } from './pages/Online';

interface NavItem {
  label: string;
  path: string;
  section: string;
}

const SIGNED_IN_NAV: NavItem[] = [
  { label: 'Today', path: '/today', section: 'today' },
  { label: 'Practice', path: '/try', section: 'try' },
  { label: 'Review', path: '/review', section: 'review' },
  { label: 'Learn', path: '/learn', section: 'learn' },
  { label: 'Library', path: '/library', section: 'library' },
  { label: 'Play online', path: '/online', section: 'online' },
  { label: 'Reader console', path: '/reader', section: 'reader' },
  { label: 'Team', path: '/team', section: 'team' },
];

const PUBLIC_NAV: NavItem[] = [
  { label: 'Try a round', path: '/try', section: 'try' },
  { label: 'Library', path: '/library', section: 'library' },
  { label: 'Rules', path: '/rules', section: 'rules' },
  { label: 'Sign in', path: '/signin', section: 'signin' },
];

/**
 * Pages that need an account, or a team as well, and what they say to someone who has neither. Every other page is
 * public: it works signed out and saves nothing.
 */
const NEEDS: Record<string, { need: 'account' | 'team'; title: string; why?: string }> = {
  today: { need: 'account', title: 'Today', why: 'Sign in for a daily plan built from your own practice.' },
  review: { need: 'account', title: 'Review', why: 'Sign in, and the questions you miss or answer slowly come back here as timed reviews.' },
  progress: { need: 'account', title: 'My progress', why: 'Sign in to see your mastery by subject and topic.' },
  team: { need: 'account', title: 'Team', why: 'Sign in to create a team or join yours.' },
  account: { need: 'account', title: 'Account' },
  data: { need: 'account', title: 'Account' },
  online: { need: 'account', title: 'Play online', why: 'Sign in to play online matches.' },
  room: { need: 'account', title: 'Remote room', why: 'Sign in to join this room, then open its link again.' },
  reader: { need: 'team', title: 'Reader console', why: "Games in the Reader console are saved to a team's stats." },
  games: { need: 'team', title: 'Game summary', why: 'Games belong to a team.' },
  stats: { need: 'team', title: 'Team stats', why: 'Team stats compare the players on a team.' },
  lineups: { need: 'team', title: 'Lineups', why: 'Lineups are built from a team’s players.' },
  assignments: { need: 'team', title: 'Assignments', why: 'Coaches and captains give assignments to their team.' },
  packets: { need: 'team', title: 'Team packets', why: 'Scrimmages and uploaded packets are kept by a team.' },
  write: { need: 'team', title: 'Write', why: 'Teams write their own questions here.' },
};

function NotFound() {
  return (
    <div className="container narrow">
      <h1>Page not found</h1>
      <p>
        <a href={href('/')}>Go to the home page</a>
      </p>
    </div>
  );
}

/** The signed-in player's name, with their account page and signing out. */
function AccountMenu({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const out = async () => {
    setBusy(true);
    try {
      if (getConnection().unsaved && !(await flushNow()) && !confirm('Your last change was not saved: Rebound cannot reach its server. Sign out anyway and lose it?')) return;
      await signOut();
      navigate('/');
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="account-menu">
      <summary aria-label={`Account: ${name}`}>{name}</summary>
      <div className="account-menu-panel">
        <a href={href('/account')}>Account</a>
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => void out()}>
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </details>
  );
}

/** Problems the player needs to know about: unsaved changes, refused changes, why they were signed out. */
function Banners() {
  const session = useSession();
  const connection = useConnection();
  const items: ReactNode[] = [];
  if (connection.failing) {
    items.push(
      <Notice key="failing" kind="error">
        <strong>Not connected: your last change was not saved.</strong> Rebound keeps trying; keep this page open until this message goes away.
        {connection.error && <span className="muted"> ({connection.error})</span>}{' '}
        <button className="btn btn-small" onClick={() => void flushNow()}>
          Try now
        </button>
      </Notice>,
    );
  }
  if (connection.refused.length > 0) {
    items.push(
      <Notice key="refused" kind="warn">
        Rebound's server did not save {connection.refused.length === 1 ? 'a change' : `${connection.refused.length} changes`}:{' '}
        {connection.refused.map((r, i) => (
          <span key={i}>
            {i > 0 && '; '}
            {r.what} ({r.reason})
          </span>
        ))}
        .{' '}
        <button className="btn btn-small btn-ghost" onClick={dismissRefused}>
          Dismiss
        </button>
      </Notice>,
    );
  }
  if (session.message && session.status !== 'failed') {
    items.push(
      <Notice key="message">
        {session.message}{' '}
        <button className="btn btn-small btn-ghost" onClick={clearSessionMessage}>
          Dismiss
        </button>
      </Notice>,
    );
  }
  if (items.length === 0) return null;
  return (
    <div className="container no-print banners" style={{ paddingBottom: 0 }}>
      {items}
    </div>
  );
}

export function App() {
  const route = useRoute();
  const data = useData();
  const session = useSession();
  const [first, second, third] = route.segments;
  const signedIn = session.status !== 'signed-out';

  let page: ReactNode;
  switch (first) {
    case undefined:
      page = <Home />;
      break;
    case 'try':
      page = <TryRound query={route.query} />;
      break;
    case 'rules':
      page = <RulesPage />;
      break;
    case 'coaches':
      page = <CoachesPage />;
      break;
    case 'it':
      page = <ItStaffPage />;
      break;
    case 'about':
      page = <AboutPage />;
      break;
    case 'signin':
      page = <SignInPage query={route.query} />;
      break;
    case 'today':
      page = <TodayPage />;
      break;
    case 'review':
      page = <ReviewPage query={route.query} />;
      break;
    case 'progress':
      page = <ProgressPage query={route.query} />;
      break;
    case 'library':
      page = second === 'topics' ? <TopicsPage /> : <LibraryPage setId={second} roundId={third} print={route.query.get('print') === '1'} />;
      break;
    case 'reader':
      page = second ? <ReaderLive gameId={second} /> : <ReaderSetup query={route.query} />;
      break;
    case 'games':
      page = second ? <GameSummary gameId={second} /> : <NotFound />;
      break;
    case 'team':
      page = <TeamPage />;
      break;
    case 'lineups':
      page = <LineupsPage />;
      break;
    case 'join':
      page = <JoinPage code={second} />;
      break;
    case 'room':
      page = second ? <RoomPage roomId={second} /> : <NotFound />;
      break;
    case 'assignments':
      page = <AssignmentsPage />;
      break;
    case 'learn':
      page = second === 'paths' ? <ReadingPathsPage subject={third} /> : second ? <ConceptPage id={second} query={route.query} /> : <LearnPage />;
      break;
    case 'packets':
      page = second ? <PacketView id={second} print={route.query.get('print') === '1'} /> : <PacketsPage />;
      break;
    case 'stats':
      page = <StatsPage />;
      break;
    case 'account':
    case 'data':
      page = <AccountPage />;
      break;
    case 'visual':
      page = <VisualLabPage query={route.query} />;
      break;
    case 'tiebreakers':
      page = <TiebreakersPage />;
      break;
    case 'shootout':
      page = <ShootoutConsole />;
      break;
    case 'write':
      page = <WritePage id={second} />;
      break;
    case 'online':
      page = <OnlinePage />;
      break;
    default:
      page = <NotFound />;
  }

  // Pages for signed-in players (and teams) wait for the account, or say what they need.
  const need = first ? NEEDS[first] : undefined;
  if (need) {
    if (session.status === 'starting' || session.status === 'loading') page = <AccountLoading title={need.title} />;
    else if (session.status === 'failed') page = <AccountFailed title={need.title} message={session.message} />;
    else if (session.status === 'signed-out') page = <SignInNeeded title={need.title} why={need.why} />;
    else if (need.need === 'team' && !data.team) page = <TeamNeeded title={need.title} why={need.why} />;
  }

  const nav = signedIn ? SIGNED_IN_NAV : PUBLIC_NAV;
  const section = first ?? '';
  const sectionAliases: Record<string, string> = {
    games: 'reader',
    stats: 'team',
    join: 'team',
    progress: 'today',
    lineups: 'team',
    packets: 'library',
    assignments: 'team',
    // A room's link is for the players on their own devices (a remote Reader game or an online match).
    room: 'online',
    visual: 'try',
    tiebreakers: 'try',
    shootout: 'reader',
    write: 'team',
  };
  const activeSection = sectionAliases[section] ?? section;

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <header className="app-header no-print">
        <div className="app-header-inner">
          <a className="brand" href={href(signedIn ? '/today' : '/')}>
            <span className="brand-mark" aria-hidden="true">R</span>
            Rebound
            {data.team && (
              <span className="brand-team muted small" title={data.team.name}>
                · {data.team.name}
              </span>
            )}
          </a>
          {/* The bar and the account menu stay together: when the header runs out of room they move to a second row. */}
          <div className="header-end">
            <nav className="nav" aria-label="Main">
              {nav.map((item) => (
                <a key={item.path} href={href(item.path)} aria-current={activeSection === item.section ? 'page' : undefined}>
                  {item.label}
                </a>
              ))}
            </nav>
            {session.user && <AccountMenu key={route.path} name={session.user.name} />}
          </div>
        </div>
      </header>
      {session.status === 'failed' && !need && (
        <div className="container no-print" style={{ paddingBottom: 0 }}>
          <Notice kind="warn">
            <strong>Not connected.</strong> {session.message ?? "Rebound can't reach its server."} Your account loads once the connection is back;
            Rebound keeps trying.{' '}
            <button className="btn btn-small" onClick={() => void reloadAccount()}>
              Try now
            </button>
          </Notice>
        </div>
      )}
      <Banners />
      <main id="main" tabIndex={-1} style={{ outline: 'none' }}>
        {page}
      </main>
      <footer className="app-footer no-print">
        <nav aria-label="Footer">
          <a href={href('/rules')}>NSB rules at a glance</a>
          <a href={href('/coaches')}>For coaches</a>
          <a href={href('/it')}>For school IT staff</a>
          <a href={href('/about')}>Privacy, terms and credits</a>
          {session.user && <a href={href('/account')}>Account</a>}
        </nav>
        <p>
          Rebound is an unofficial study tool, not affiliated with or endorsed by the U.S. Department of Energy. Sample questions courtesy of the
          DOE National Science Bowl.
        </p>
      </footer>
    </>
  );
}
