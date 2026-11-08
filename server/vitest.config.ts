import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Tests run inside workerd with the real Worker and Durable Objects from wrangler.toml (no Cloudflare account needed).
// Sign-in for tests: email codes come back from the development outbox, and Google ID tokens are signed with a test
// key for this client id (test/helpers.ts). These bindings exist only here, never in wrangler.toml.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: { bindings: { DEV_EMAIL_OUTBOX: '1', GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com' } },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    // The timing-based room and match tests take a moment.
    testTimeout: 30_000,
  },
});
