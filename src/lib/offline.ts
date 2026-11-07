/**
 * Offline use. The service worker (src/sw/sw-template.js) keeps the app itself cached after the
 * first visit; this module lets a player save every question file ahead of time, so drills and
 * reviews work on a bus or on a school network that drops out.
 */
import { loadIndex } from './library';

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

function dataUrls(files: string[]): string[] {
  return ['index.json', 'catalog.json', ...files].map((f) => new URL(`${DATA_BASE}${f}`, document.baseURI).href);
}

export async function offlineStatus(): Promise<OfflineStatus> {
  const index = await loadIndex();
  const urls = dataUrls(index.sets.map((s) => s.file));
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
  const index = await loadIndex();
  const urls = dataUrls(index.sets.map((s) => s.file));
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
