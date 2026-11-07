/// <reference types="vitest" />
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Writes sw.js (from src/sw/sw-template.js) next to the built site, with the list of files to
 * cache at install and a version that changes whenever any of them does.
 */
function serviceWorker(): Plugin {
  return {
    name: 'rebound-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const icons = existsSync('public/icons') ? readdirSync('public/icons').map((f) => `icons/${f}`) : [];
      const extra = existsSync('public/manifest.webmanifest') ? ['manifest.webmanifest'] : [];
      const precache = ['./', ...built.filter((f) => f !== 'index.html'), ...extra, ...icons].sort();
      const hash = createHash('sha256');
      for (const f of built) {
        const item = bundle[f];
        hash.update(f);
        hash.update(item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : Buffer.from(item.source));
      }
      for (const f of [...extra, ...icons]) hash.update(readFileSync(join('public', f)));
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync('src/sw/sw-template.js', 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// `base: './'` keeps every asset path relative, so the built site works from any
// folder or static host (GitHub Pages project sites, Netlify, Cloudflare Pages).
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
