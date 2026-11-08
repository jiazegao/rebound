import type { ReactNode } from 'react';
import { href, useRoute } from './lib/router';
import { useData, useStoreStatus } from './lib/store';
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
import { DataPage } from './pages/Data';
import { VisualLabPage } from './pages/VisualLab';
import { ShootoutConsole, TiebreakersPage } from './pages/Tiebreakers';
import { WritePage } from './pages/Write';
import { OnlinePage } from './pages/Online';

interface NavItem {
  label: string;
  path: string;
  section: string;
}

const TEAM_NAV: NavItem[] = [
  { label: 'Today', path: '/today', section: 'today' },
  { label: 'Practice', path: '/try', section: 'try' },
  { label: 'Review', path: '/review', section: 'review' },
  { label: 'Learn', path: '/learn', section: 'learn' },
  { label: 'Library', path: '/library', section: 'library' },
  { label: 'Play', path: '/reader', section: 'reader' },
  { label: 'Team', path: '/team', section: 'team' },
];

const PUBLIC_NAV: NavItem[] = [
  { label: 'Try a round', path: '/try', section: 'try' },
  { label: 'Library', path: '/library', section: 'library' },
  { label: 'Rules', path: '/rules', section: 'rules' },
  { label: 'Start a team', path: '/team', section: 'team' },
];

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

export function App() {
  const route = useRoute();
  const data = useData();
  const status = useStoreStatus();
  const [first, second, third] = route.segments;

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
    case 'data':
      page = <DataPage />;
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

  const nav = data.team ? TEAM_NAV : PUBLIC_NAV;
  const section = first ?? '';
  const sectionAliases: Record<string, string> = { games: 'reader', stats: 'team', data: 'team', progress: 'today', lineups: 'team', packets: 'library', assignments: 'team', room: 'reader', visual: 'try', tiebreakers: 'try', shootout: 'reader', write: 'team', online: 'reader' };
  const activeSection = sectionAliases[section] ?? section;

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <header className="app-header no-print">
        <div className="app-header-inner">
          <a className="brand" href={href(data.team ? '/today' : '/')}>
            <span className="brand-mark" aria-hidden="true">R</span>
            Rebound
            {data.team && <span className="muted small" style={{ fontWeight: 600 }}>· {data.team.name}</span>}
          </a>
          <nav className="nav" aria-label="Main">
            {nav.map((item) => (
              <a key={item.path} href={href(item.path)} aria-current={activeSection === item.section ? 'page' : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      {status.loaded && !status.persistent && (
        <div className="container no-print" style={{ paddingBottom: 0 }}>
          <div className="notice notice-warn">
            This browser is not saving Rebound's data (it may be in private mode). Use <a href={href('/data')}>Data</a> to export a backup before you close it.
          </div>
        </div>
      )}
      <main id="main" tabIndex={-1} style={{ outline: 'none' }}>
        {page}
      </main>
      <footer className="app-footer no-print">
        <nav aria-label="Footer">
          <a href={href('/rules')}>NSB rules at a glance</a>
          <a href={href('/coaches')}>For coaches</a>
          <a href={href('/it')}>For school IT staff</a>
          <a href={href('/about')}>Privacy, terms and credits</a>
          {data.team && <a href={href('/data')}>Data and backup</a>}
        </nav>
        <p>
          Rebound is an unofficial study tool, not affiliated with or endorsed by the U.S. Department of Energy. Sample questions courtesy of the
          DOE National Science Bowl.
        </p>
      </footer>
    </>
  );
}
