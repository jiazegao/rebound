/** Text clean-up shared by the answer checker. */

const SUPERSCRIPT: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ⁱ': 'i', 'ˣ': 'x',
};
const SUBSCRIPT: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
};
const VULGAR_FRACTIONS: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
  '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

/**
 * Convert typographic characters to plain ASCII-ish text without losing meaning:
 * superscripts become "^…", subscripts become plain digits, "1¼" becomes "1 1/4",
 * dashes and minus signs become "-", "×" becomes "x".
 */
export function toPlain(input: string): string {
  let s = input;
  // Superscript runs → ^(...) or ^d
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣ]+/g, (run) => {
    const plain = [...run].map((c) => SUPERSCRIPT[c] ?? c).join('');
    return plain.length === 1 ? `^${plain}` : `^(${plain})`;
  });
  s = s.replace(/[₀-₎]/g, (c) => SUBSCRIPT[c] ?? c);
  s = s.replace(/(\d)?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_m, whole: string | undefined, frac: string) =>
    whole ? `${whole} ${VULGAR_FRACTIONS[frac]}` : VULGAR_FRACTIONS[frac],
  );
  s = s.replace(/⁄/g, '/'); // fraction slash
  s = s.replace(/[‐-―−﹣－]/g, '-'); // dashes and minus signs
  s = s.replace(/×/g, 'x').replace(/[·⋅∙]/g, '*');
  s = s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
  return s;
}

/**
 * Pronunciation or reading guides like "[sigh-toe-kines]" or "[the square root of 31 over 3]":
 * bracketed words, but not math such as the interval "[-π/2, π/2]".
 */
export const PRONUNCIATION = /\[[\p{L}\p{N}\s'’.,:;()-]*\p{L}[\p{L}\p{N}\s'’.,:;()-]*\]/gu;

/** Remove pronunciation guides. */
export function stripPronunciation(s: string): string {
  return s.replace(PRONUNCIATION, ' ');
}

/**
 * Normalise free text for comparison: plain characters, lower case, no accents,
 * no punctuation (except characters that carry meaning in formulas), single spaces,
 * and no leading article.
 */
export function normalizeText(input: string): string {
  let s = toPlain(stripPronunciation(input));
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.toLowerCase();
  s = s.replace(/(\p{L})-(?=\p{L})/gu, '$1'); // "semi-circular" → "semicircular"
  s = s.replace(/['’]/g, '');
  s = s.replace(/[^\p{L}\p{N}+\-/.^%π√\s]/gu, ' ');
  // Players cannot type superscripts, so "Rb⁺" (→ "Rb^+") must match "Rb+", and "x²" match "x^2".
  s = s.replace(/\^/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*\.+$/, '').trim();
  s = s.replace(/^(the|a|an)\s+/, '');
  return s;
}

/** Levenshtein distance, capped for speed. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > cap) return cap + 1;
    prev = curr;
  }
  return prev[b.length];
}

const PLURAL_RULES: Array<[RegExp, string]> = [
  [/ies$/, 'y'],
  [/ia$/, 'ium'], // bacteria → bacterium
  [/a$/, 'um'], // data → datum
  [/a$/, 'on'], // mitochondria → mitochondrion, phenomena → phenomenon
  [/i$/, 'us'], // nuclei → nucleus, fungi → fungus
  [/ae$/, 'a'], // larvae → larva
  [/ices$/, 'ex'], // vertices → vertex
  [/ices$/, 'ix'], // matrices → matrix
  [/es$/, 'is'], // axes → axis, analyses → analysis
  [/es$/, ''],
  [/s$/, ''],
];

/** True when two words are the same apart from a regular or scientific plural ending. */
export function samePluralWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  for (const [pattern, singular] of PLURAL_RULES) {
    if (pattern.test(a) && a.replace(pattern, singular) === b) return true;
    if (pattern.test(b) && b.replace(pattern, singular) === a) return true;
  }
  return false;
}

/** True when two normalised phrases match word for word, allowing plural/singular differences. */
export function samePhrase(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.replace(/\s+/g, '') === b.replace(/\s+/g, '')) return true;
  const ta = a.split(' ');
  const tb = b.split(' ');
  if (ta.length !== tb.length) return false;
  return ta.every((w, i) => samePluralWord(w, tb[i]));
}
