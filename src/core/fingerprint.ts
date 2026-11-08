/**
 * Near-duplicate detection for questions: a 64-bit SimHash over word 3-shingles of a question's
 * normalized text (stem, choices and answer). Questions reworded slightly keep most shingles, so their
 * fingerprints differ in only a few of the 64 bits. Integer arithmetic only, so every device and the
 * build script compute the same fingerprint.
 */

/** Lower case, pronunciation guides and punctuation removed, words separated by single spaces. */
export function normalizeForFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Word 3-shingles (or the words themselves for very short texts). */
export function shingles(text: string): string[] {
  const words = normalizeForFingerprint(text).split(' ').filter(Boolean);
  if (words.length < 3) return words;
  const out: string[] = [];
  for (let i = 0; i + 2 < words.length; i++) out.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}

function fnv1a(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The fingerprint of a text: 16 hex digits. */
export function simhash(text: string): string {
  const weights = new Array<number>(64).fill(0);
  for (const sh of shingles(text)) {
    const lo = fnv1a(sh, 0x811c9dc5);
    const hi = fnv1a(sh, 0x9e3779b1);
    for (let b = 0; b < 32; b++) {
      weights[b]! += (lo >>> b) & 1 ? 1 : -1;
      weights[b + 32]! += (hi >>> b) & 1 ? 1 : -1;
    }
  }
  let lo = 0;
  let hi = 0;
  for (let b = 0; b < 32; b++) {
    if (weights[b]! > 0) lo |= 1 << b;
    if (weights[b + 32]! > 0) hi |= 1 << b;
  }
  return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
}

function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** How many of the 64 bits differ between two fingerprints. */
export function hamming(a: string, b: string): number {
  const x = (parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) >>> 0;
  const y = (parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16)) >>> 0;
  return popcount32(x) + popcount32(y);
}

/** Share of 3-shingles two texts have in common (0–1). */
export function jaccard(a: string, b: string): number {
  const A = new Set(shingles(a));
  const B = new Set(shingles(b));
  if (A.size === 0 || B.size === 0) return 0;
  let both = 0;
  for (const x of A) if (B.has(x)) both += 1;
  return both / (A.size + B.size - both);
}

/** The text a question's fingerprint is taken over. */
export function questionText(q: { stem: string; choices?: Record<string, string>; answer: string }): string {
  return [q.stem, ...(q.choices ? Object.values(q.choices) : []), q.answer].join(' ');
}
