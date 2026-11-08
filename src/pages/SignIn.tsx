import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loading, Notice, PageHeader } from '../components/ui';
import { MAX_NAME_CHARS } from '../core/accounts';
import { finishEmailSignIn, loadAuthConfig, signInWithGoogle, startEmailSignIn, type SignInResult, type Signup } from '../lib/account';
import { normalizeServerUrl, SERVER_URL, serverUrl, setServerUrl } from '../lib/api';
import { useSession } from '../lib/cloud';
import { useAsync } from '../lib/library';
import { href, navigate } from '../lib/router';

/** The parts of Google Identity Services this page uses (https://developers.google.com/identity/gsi/web). */
interface GoogleId {
  initialize(options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let gsiPromise: Promise<GoogleId> | null = null;

/** Google's sign-in script, loaded on this page only (and only when the server has Google sign-in on). */
function loadGoogle(): Promise<GoogleId> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  gsiPromise ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => {
      const id = window.google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error('Google sign-in did not start.'));
    };
    script.onerror = () => {
      gsiPromise = null;
      script.remove();
      reject(new Error('Google sign-in could not load.'));
    };
    document.head.appendChild(script);
  });
  return gsiPromise;
}

function GoogleButton({ clientId, onCredential, disabled }: { clientId: string; onCredential: (credential: string) => void; disabled: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadGoogle().then(
      (id) => {
        if (!live || !box.current) return;
        id.initialize({ client_id: clientId, callback: (r) => callback.current(r.credential), ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true });
        id.renderButton(box.current, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: Math.min(320, box.current.clientWidth || 320) });
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [clientId]);
  return (
    <>
      <div ref={box} className="google-button" style={disabled ? { pointerEvents: 'none', opacity: 0.6 } : undefined} />
      {failed && (
        <Notice kind="warn">
          Google's sign-in button could not load. Check the connection; on a school network, ask your IT staff to allow{' '}
          <code>accounts.google.com</code>.
        </Notice>
      )}
    </>
  );
}

/** A new account: a name, and the confirmation that the person is 13 or older. */
function SignupForm({ email, busy, onSubmit, onCancel }: { email: string; busy: boolean; onSubmit: (s: Signup) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [over13, setOver13] = useState(false);
  const ok = name.trim().length > 0 && name.trim().length <= MAX_NAME_CHARS && over13;
  return (
    <form
      className="card stack"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (ok) onSubmit({ name: name.trim(), over13: true });
      }}
    >
      <h2 style={{ margin: 0 }}>Create your account</h2>
      <p style={{ margin: 0 }}>
        There is no Rebound account for {email ? <strong>{email}</strong> : 'this sign-in'} yet. Two things, and you are in.
      </p>
      <div className="field">
        <label htmlFor="signup-name">Your name</label>
        <input id="signup-name" type="text" value={name} maxLength={MAX_NAME_CHARS} autoComplete="name" autoFocus onChange={(e) => setName(e.target.value)} />
        <span className="hint">Your teammates see it. A first name and last initial is plenty.</span>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={over13} onChange={(e) => setOver13(e.target.checked)} /> I am 13 or older.
      </label>
      <p className="small muted" style={{ margin: 0 }}>
        Rebound accounts are for people 13 and older. Younger students can still <a href={href('/try')}>try a round</a> and use the{' '}
        <a href={href('/library')}>Library</a> without an account (nothing is saved).
      </p>
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={!ok || busy}>
          {busy ? 'Creating your account…' : 'Create my account'}
        </button>
        <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Builds without a server address ask for one (kept with the session). */
function ServerAddress({ onChange }: { onChange: (url: string) => void }) {
  const [value, setValue] = useState(serverUrl());
  const [editing, setEditing] = useState(!serverUrl());
  const url = normalizeServerUrl(value);
  if (!editing) {
    return (
      <p className="small muted">
        Server: <code>{serverUrl()}</code>{' '}
        <button className="btn btn-small btn-ghost" onClick={() => setEditing(true)}>
          Change
        </button>
      </p>
    );
  }
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (url && setServerUrl(url)) {
          setEditing(false);
          onChange(url);
        }
      }}
    >
      <div className="field">
        <label htmlFor="server-url">Rebound server address</label>
        <input id="server-url" type="url" value={value} placeholder="https://rebound-server.example.workers.dev" onChange={(e) => setValue(e.target.value)} />
        <span className="hint">This copy of Rebound was built without one. Your coach or whoever runs the site has the address.</span>
      </div>
      <div>
        <button className="btn btn-primary" type="submit" disabled={!url}>
          Use this server
        </button>
      </div>
    </form>
  );
}

function EmailSignIn({ next, busy }: { next: string | null; busy: boolean }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ email: string; devCode?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  if (sent) {
    const devLink = sent.devCode ? href(`/signin?code=${encodeURIComponent(sent.devCode)}${next ? `&next=${encodeURIComponent(next)}` : ''}`) : null;
    return (
      <section className="card stack" aria-live="polite">
        <h2 style={{ margin: 0 }}>Check your email</h2>
        <p style={{ margin: 0 }}>
          If <strong>{sent.email}</strong> can get email from Rebound, a sign-in link is on its way. The link works once, for 15 minutes, on any device;
          this page signs in too once you open it here.
        </p>
        {devLink && (
          <p style={{ margin: 0 }}>
            <a className="btn btn-primary" href={devLink}>
              Sign in (development)
            </a>{' '}
            <span className="small muted">This server sends no email: it is set up for development.</span>
          </p>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          Nothing after a few minutes? Check the spam folder, or{' '}
          <button className="btn btn-small btn-ghost" onClick={() => setSent(null)}>
            try again
          </button>
          .
        </p>
      </section>
    );
  }
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok) return;
        setSending(true);
        setError(null);
        try {
          const res = await startEmailSignIn(email);
          setSent({ email: email.trim(), devCode: res.devCode });
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setSending(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="signin-email">Email</label>
        <input id="signin-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <span className="hint">Rebound emails you a link that signs you in. No password.</span>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div>
        <button className="btn btn-primary" type="submit" disabled={!ok || sending || busy}>
          {sending ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </div>
    </form>
  );
}

/** Where to go after signing in: a page of this site, never another address. */
function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/signin') ? next : null;
}

export function SignInPage({ query }: { query: URLSearchParams }) {
  const session = useSession();
  const code = query.get('code');
  const next = safeNext(query.get('next'));
  const [server, setServer] = useState(serverUrl());
  const config = useAsync(server ? `auth-config|${server}` : null, loadAuthConfig);
  const [signup, setSignup] = useState<{ email: string; retry: (s: Signup) => Promise<SignInResult> } | null>(null);
  // An emailed link starts busy, so the sign-in choices don't flash up while its code is checked.
  const [busy, setBusy] = useState(() => !!code && !!serverUrl());
  const [error, setError] = useState<string | null>(null);

  // Signed in (here, or in another tab that opened the emailed link): on to the page that asked.
  useEffect(() => {
    if (session.status === 'ready') navigate(next ?? '/today');
  }, [session.status, next]);

  const run = async (attempt: () => Promise<SignInResult>, retry: (s: Signup) => Promise<SignInResult>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await attempt();
      if ('needsSignup' in result) setSignup({ email: result.email, retry });
      else setSignup(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // An emailed link: sign in with its code.
  useEffect(() => {
    if (!code || !server || session.status === 'ready' || session.status === 'loading') return;
    void run(
      () => finishEmailSignIn(code),
      (s) => finishEmailSignIn(code, s),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, server]);

  if (session.status === 'ready' || session.status === 'loading') {
    return (
      <div className="container narrow">
        <PageHeader title="Sign in" />
        <Loading what="Signing you in" />
      </div>
    );
  }

  const google = config.data?.google ?? null;
  const email = !!config.data?.email;
  return (
    <div className="container narrow">
      <PageHeader title="Sign in">
        <p>Your practice, review queue and daily plan are saved to your account, so they follow you to any device.</p>
      </PageHeader>
      {!SERVER_URL && <ServerAddress onChange={setServer} />}
      {error && <Notice kind="error">{error}</Notice>}
      {signup ? (
        <SignupForm email={signup.email} busy={busy} onSubmit={(s) => void run(() => signup.retry(s), signup.retry)} onCancel={() => setSignup(null)} />
      ) : code && busy ? (
        <Loading what="Checking your sign-in link" />
      ) : (
        server && (
          <div className="stack">
            {config.loading && <Loading what="Getting sign-in ready" />}
            {config.error && <Notice kind="error">{config.error.message}</Notice>}
            {google && (
              <section className="card stack" aria-label="Sign in with Google">
                <GoogleButton
                  clientId={google.clientId}
                  disabled={busy}
                  onCredential={(credential) =>
                    void run(
                      () => signInWithGoogle(credential),
                      (s) => signInWithGoogle(credential, s),
                    )
                  }
                />
                <p className="small muted" style={{ margin: 0 }}>
                  {email ? 'With a Google account (a school one works if your school allows it).' : 'You need a Google account (a school one works if your school allows it).'}
                </p>
              </section>
            )}
            {email && <EmailSignIn next={next} busy={busy} />}
            {config.data && !google && !email && <Notice>Signing in is turned off on this server right now. Try again later.</Notice>}
            {busy && <Loading what="Signing you in" />}
          </div>
        )
      )}
      <p className="small muted" style={{ marginTop: '1.5rem' }}>
        Accounts are for people 13 and older. See <a href={href('/about')}>privacy and terms</a> for what Rebound keeps. No account needed to{' '}
        <a href={href('/try')}>try a round</a>.
      </p>
    </div>
  );
}
