/**
 * Merging two versions of a record written at the same time (one player's devices can both write), and telling
 * which records changed. The account contract (accounts.ts) says which collections merge; the site and the server
 * both use these, so they merge the same way.
 */

type SeenMap = Record<string, number>;

/** Seen ledgers merge: a question is heard if either side heard it, at the earlier time. */
export function mergeSeen(a: unknown, b: unknown): SeenMap {
  const out: SeenMap = { ...((a as SeenMap) ?? {}) };
  for (const [q, t] of Object.entries((b as SeenMap) ?? {})) {
    if (typeof t !== 'number') continue;
    out[q] = out[q] === undefined ? t : Math.min(out[q], t);
  }
  return out;
}

interface CardLike {
  log?: Array<{ t: number; via: string }>;
  sources?: string[];
}

/**
 * Review cards: keep the version that has seen more (a longer log); when both grew apart, keep the
 * one with the later last event. Sources (answers already counted) are combined either way.
 */
export function mergeCard(a: unknown, b: unknown): unknown {
  const x = a as CardLike;
  const y = b as CardLike;
  const lx = x.log ?? [];
  const ly = y.log ?? [];
  const last = (l: Array<{ t: number }>) => (l.length ? l[l.length - 1].t : 0);
  const winner = ly.length > lx.length || (ly.length === lx.length ? last(ly) >= last(lx) : last(ly) > last(lx)) ? y : x;
  const sources = [...new Set([...(x.sources ?? []), ...(y.sources ?? [])])];
  return { ...(winner as object), sources };
}

/** A short, stable fingerprint of a record body (FNV-1a over its JSON), to tell which records changed. */
export function fingerprint(body: unknown): string {
  const s = JSON.stringify(body) ?? 'undefined';
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ ch, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36);
}
