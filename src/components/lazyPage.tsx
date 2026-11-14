/**
 * Pages loaded when they are first opened, so a visitor downloads the page they came for and not all thirty.
 *
 * A page's file can be gone by the time it is asked for: the site was updated since this tab loaded, and the host
 * keeps only the newest files. Then the tab reloads once and gets the new version; if that does not help (no
 * connection), the page says so and offers to try again.
 */
import { Component, lazy, type ComponentType, type ReactNode } from 'react';

const RELOADED_KEY = 'rebound-reloaded-at';
/** A reload this recent did not help: say so, and do not reload in a loop. */
const RELOAD_GAP_MS = 30_000;

function reloadOnce(): boolean {
  try {
    const last = Number(globalThis.sessionStorage?.getItem(RELOADED_KEY) ?? 0);
    if (Date.now() - last < RELOAD_GAP_MS) return false;
    globalThis.sessionStorage?.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    return false;
  }
  globalThis.location?.reload();
  return true;
}

/** The component exported as `name` by a module that loads on first use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<M extends Record<string, ComponentType<any>>, K extends keyof M & string>(load: () => Promise<M>, name: K): M[K] {
  return lazy(() =>
    load().then(
      (module) => ({ default: module[name] }),
      (error: unknown) => {
        // Never resolves while the tab reloads; otherwise the error reaches PageBoundary.
        if (reloadOnce()) return new Promise<never>(() => undefined);
        throw error;
      },
    ),
  ) as unknown as M[K];
}

/**
 * Catches a page that failed to load or to draw, so the rest of the site (the header, the way to other pages)
 * stays up. Give it a `key` that changes with the page, so opening another page starts fresh.
 */
export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('A page failed:', error);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="container narrow">
        <h1>This page did not load</h1>
        <div className="notice notice-warn" role="alert">
          Rebound could not load this page. Check the internet connection, then{' '}
          <button className="btn btn-small" onClick={() => globalThis.location?.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
