// Bindings from wrangler.toml. Declared on Cloudflare.Env so `import { env } from 'cloudflare:workers'` is typed too.
declare namespace Cloudflare {
  interface Env {
    /** One Durable Object per team, addressed by `idFromName(teamId)`. */
    TEAM: DurableObjectNamespace<import('./team').TeamServer>;
    /** Comma-separated browser origins allowed to call the API. */
    ALLOWED_ORIGINS: string;
  }

  interface GlobalProps {
    mainModule: typeof import('./index');
    durableNamespaces: 'TeamServer';
  }
}

type Env = Cloudflare.Env;
