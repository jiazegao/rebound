/**
 * Offline use. The service worker (src/sw/sw-template.js) keeps the app itself cached after the
 * first visit; this module lets a player save every question file ahead of time, so drills and
 * reviews work on a bus or on a school network that drops out.
 */
import { levelFile, loadIndex, setsOfLevel, teamLevel } from './library';
import { loadPhotoSet } from './visuals';

/** Must match DATA in the service worker. */
export const DATA_CACHE = 'rebound-data-v1';
const DATA_BASE = 'data/doe/';

/** Register the service worker in the published site (not in the dev server, where it would cache stale code). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional; the site works without it */
    });
  });
}

export function offlineSupported(): boolean {
  return typeof caches !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export interface OfflineStatus {
  /** Question files saved on this device. */
  saved: number;
  /** Question files in the library (sets plus the index and catalog). */
  total: number;
  /** Bytes saved, when the browser reports it. */
  bytes: number | null;
}

/**
 * Every data file a device can save: the DOE library of the team's level and, when the site has one, the photo
 * set for the Visual lab.
 */
async function dataUrls(): Promise<string[]> {
  const index = await loadIndex();
  const photos = await loadPhotoSet();
  const level = teamLevel();
  const doe = ['index.json', levelFile('catalog', level), levelFile('concepts', level), ...setsOfLevel(index, level).map((s) => s.file)].map(
    (f) => `${DATA_BASE}${f}`,
  );
  const visual = photos.photos.length ? ['data/visual/photos.json', ...photos.photos.map((p) => `data/visual/${p.file}`)] : [];
  return [...doe, ...visual].map((f) => new URL(f, document.baseURI).href);
}

export async function offlineStatus(): Promise<OfflineStatus> {
  const urls = await dataUrls();
  const cache = await caches.open(DATA_CACHE);
  let saved = 0;
  for (const url of urls) if (await cache.match(url)) saved += 1;
  let bytes: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    bytes = estimate?.usage ?? null;
  } catch {
    bytes = null;
  }
  return { saved, total: urls.length, bytes };
}

/** Download every question file into the offline cache. Calls `onProgress` after each file. */
export async function saveForOffline(onProgress: (done: number, total: number) => void): Promise<void> {
  // Ask the browser not to clear Rebound's storage when space runs low (some browsers ask the user).
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
  const urls = await dataUrls();
  const cache = await caches.open(DATA_CACHE);
  let done = 0;
  for (const url of urls) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Could not download ${url.split('/').pop()} (HTTP ${response.status}).`);
    await cache.put(url, response);
    done += 1;
    onProgress(done, urls.length);
  }
}

export async function removeOffline(): Promise<void> {
  await caches.delete(DATA_CACHE);
}
