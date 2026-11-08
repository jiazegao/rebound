// Bindings from wrangler.toml. Declared on Cloudflare.Env so `import { env } from 'cloudflare:workers'` is typed too.
declare namespace Cloudflare {
  interface Env {
    /** One Durable Object per team, addressed by `idFromName(teamId)`. */
    TEAM: DurableObjectNamespace<import('./team').TeamServer>;
    /** One Durable Object (named "global") that counts new teams per day, for open sign-up. */
    REGISTRY: DurableObjectNamespace<import('./registry').Registry>;
    /** Comma-separated browser origins allowed to call the API. */
    ALLOWED_ORIGINS: string;
    /** Optional AI help: a Claude API key, set as a secret (wrangler secret put ANTHROPIC_API_KEY). Without it AI is off. */
    ANTHROPIC_API_KEY?: string;
    /** The Claude model for AI help (default claude-opus-5-5). */
    AI_MODEL?: string;
    /** The model for the blind answer check on AI drafts (default: AI_MODEL). */
    AI_CHECK_MODEL?: string;
    /** AI calls a team may make per day, counted in UTC days (default 50). */
    AI_DAILY_LIMIT?: string;
  }

  interface GlobalProps {
    mainModule: typeof import('./index');
    durableNamespaces: 'TeamServer' | 'Registry';
  }
}

type Env = Cloudflare.Env;
