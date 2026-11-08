// Bindings from wrangler.toml. Declared on Cloudflare.Env so `import { env } from 'cloudflare:workers'` is typed too.
declare namespace Cloudflare {
  interface Env {
    /** One Durable Object per user, addressed by `idFromName(userId)`: profile, sessions, the user's own records. */
    USER: DurableObjectNamespace<import('./user').UserServer>;
    /** One Durable Object per team, addressed by `idFromName(teamId)`: settings, members, team records. */
    TEAM: DurableObjectNamespace<import('./team').Team>;
    /** One Durable Object per live room or online match, addressed by `idFromName(roomId)`. */
    ROOM: DurableObjectNamespace<import('./room').RoomServer>;
    /** One Durable Object (named "global"): email and Google account → user, email codes, sign-in limits. */
    DIRECTORY: DurableObjectNamespace<import('./directory').Directory>;
    /** One Durable Object (named "global") that counts new teams per day, for open sign-up. */
    REGISTRY: DurableObjectNamespace<import('./registry').Registry>;
    /** Comma-separated browser origins allowed to call the API. */
    ALLOWED_ORIGINS: string;
    /** The site's address; email sign-in links are `<SITE_URL>#/signin?code=...`. */
    SITE_URL?: string;
    /** Google sign-in: the OAuth client id (public). Without it Google sign-in is off. */
    GOOGLE_CLIENT_ID?: string;
    /** Email sign-in: a Resend API key, set as a secret (wrangler secret put RESEND_API_KEY). */
    RESEND_API_KEY?: string;
    /** Email sign-in: the sender, e.g. "Rebound <signin@example.org>" (a domain verified with Resend). */
    EMAIL_FROM?: string;
    /** Sign-in emails per UTC day in all (default 90, under Resend's free 100). */
    EMAIL_DAILY_LIMIT?: string;
    /** Development only ("1", in server/.dev.vars or the test config, never in wrangler.toml): send no email and return the code. */
    DEV_EMAIL_OUTBOX?: string;
    /** Optional AI help: a Claude API key, set as a secret (wrangler secret put ANTHROPIC_API_KEY). Without it AI is off. */
    ANTHROPIC_API_KEY?: string;
    /** The Claude model for AI help (default claude-opus-5-5). */
    AI_MODEL?: string;
    /** The model for the blind answer check on AI drafts (default: AI_MODEL). */
    AI_CHECK_MODEL?: string;
    /** AI calls each user may make per day, counted in UTC days (default 50). */
    AI_DAILY_LIMIT?: string;
  }

  interface GlobalProps {
    mainModule: typeof import('./index');
    durableNamespaces: 'Directory' | 'UserServer' | 'Team' | 'RoomServer' | 'Registry';
  }
}

type Env = Cloudflare.Env;
