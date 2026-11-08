/**
 * The service worker (src/sw/sw-template.js) keeps the app itself and the public question files cached, so pages
 * open quickly. A player's practice is never kept on the device: it needs a connection to Rebound's server.
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
