import type { ReactNode } from 'react';
import { signOut } from '../lib/account';
import { reloadAccount } from '../lib/cloud';
import { href } from '../lib/router';
import { Notice, PageHeader } from './ui';

/** The sign-in page, coming back to `next` (the current page by default) afterwards. */
export function signInHref(next = currentPath()): string {
  return href(`/signin${next && next !== '/' && !next.startsWith('/signin') ? `?next=${encodeURIComponent(next)}` : ''}`);
}

function currentPath(): string {
  return typeof window === 'undefined' ? '/' : window.location.hash.replace(/^#/, '') || '/';
}

/** In place of a page that needs an account. */
export function SignInNeeded({ title, why }: { title: string; why?: ReactNode }) {
  return (
    <div className="container narrow">
      <PageHeader title={title} />
      <Notice>
        {why ?? 'This page is for signed-in players.'}{' '}
        <a className="btn btn-small btn-primary" href={signInHref()}>
          Sign in
        </a>
      </Notice>
      <p className="small muted">
        Without an account you can still <a href={href('/try')}>try a round</a>, browse the <a href={href('/library')}>Library</a> and read the{' '}
        <a href={href('/rules')}>rules</a>; nothing is saved.
      </p>
    </div>
  );
}

/** In place of a page that needs a team. */
export function TeamNeeded({ title, why }: { title: string; why?: ReactNode }) {
  return (
    <div className="container narrow">
      <PageHeader title={title} />
      <Notice>
        {why ?? 'This page is for teams.'} <a href={href('/team')}>Create or join a team</a> first.
      </Notice>
    </div>
  );
}

export function AccountLoading({ title }: { title: string }) {
  return (
    <div className="container narrow">
      <PageHeader title={title} />
      <p className="muted" role="status">
        Loading your account…
      </p>
    </div>
  );
}

/** Loading the account failed (no connection, or the server is down); it retries by itself too. */
export function AccountFailed({ title, message }: { title: string; message: string | null }) {
  return (
    <div className="container narrow">
      <PageHeader title={title} />
      <Notice kind="warn">
        <strong>Not connected.</strong> {message ?? "Rebound can't reach its server."} Your practice lives on Rebound's server, so this page needs a
        connection. Rebound keeps trying.{' '}
        <button className="btn btn-small" onClick={() => void reloadAccount()}>
          Try now
        </button>{' '}
        <button className="btn btn-small btn-ghost" onClick={() => void signOut()}>
          Sign out on this device
        </button>
      </Notice>
    </div>
  );
}
