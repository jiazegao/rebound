/**
 * A tiny hash router. Hash URLs (".../#/library") work on any static host, including
 * GitHub Pages and school-filtered networks, without server configuration.
 */
import { useEffect, useState, useTransition } from 'react';

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return { path, segments: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(queryPart ?? '') };
}

/**
 * The route, and whether the page for a newer one is still loading. Pages load when they are first opened, so a
 * change of route is a transition: the page on screen stays until the next one is ready, instead of blinking to a
 * "Loading…" line for the instant its code takes to arrive.
 */
export function useRoute(): Route & { pending: boolean } {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const onChange = () => {
      const next = parseHash(window.location.hash);
      startTransition(() => {
        setRoute((prev) => {
          if (prev.path !== next.path) window.scrollTo(0, 0);
          return next;
        });
      });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return { ...route, pending };
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function href(path: string): string {
  return `#${path}`;
}
