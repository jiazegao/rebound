import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Tests run inside workerd with the real Worker and Durable Object from wrangler.toml (no Cloudflare account needed).
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.toml' } })],
  test: {
    include: ['test/**/*.test.ts'],
    // PIN hashing (100,000 PBKDF2 rounds) and the timing-based room tests take a moment.
    testTimeout: 30_000,
  },
});
