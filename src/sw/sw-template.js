/*
 * Rebound service worker. The build (vite.config.ts) fills in VERSION and PRECACHE.
 *
 * - The app itself (HTML, script, styles, icons) is cached at install, so the site opens offline
 *   after the first visit.
 * - Pages: network first, so a new version shows up on the next visit; the cached copy when offline.
 * - Question files: kept in their own cache. Set files are served from the cache when present and
 *   refreshed in the background; the index and catalog are fetched fresh when the network allows.
 *   "Save all questions for offline use" (Data page) fills this cache ahead of time.
 */
const VERSION = '__VERSION__';
const SHELL = `rebound-shell-${VERSION}`;
const DATA = 'rebound-data-v1';
const PRECACHE = __PRECACHE__;
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new Request(new URL(path, self.registration.scope), { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rebound-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function page(request) {
  const cache = await caches.open(SHELL);
  const home = new URL('./', self.registration.scope).href;
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) await cache.put(home, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(home)) || (await cache.match(new URL('index.html', self.registration.scope).href));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request).then(async (response) => {
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const path = url.href.slice(self.registration.scope.length);

  if (request.mode === 'navigate') event.respondWith(page(request));
  else if (path.startsWith('assets/')) event.respondWith(cacheFirst(request, SHELL));
  else if (/^data\/.+\/(index|catalog|catalog-ms)\.json$/.test(path)) event.respondWith(networkFirst(request, DATA));
  else if (path.startsWith('data/')) event.respondWith(staleWhileRevalidate(event, DATA));
  else event.respondWith(cacheFirst(request, SHELL));
});
