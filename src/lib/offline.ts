/**
 * The service worker (src/sw/sw-template.js) keeps the app itself and the public question files cached, so pages
 * open quickly. It keeps nothing about a player: their practice is on Rebound's server, with a copy in the browser's
 * own storage while they are signed in (lib/deviceCopy.ts), which the service worker never touches.
 */

/** Register the service worker in the published site (not in the dev server, where it would cache stale code). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* the cache only speeds things up; the site works without it */
    });
  });
}
