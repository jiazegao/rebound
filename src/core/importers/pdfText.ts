/**
 * Turns a pdf.js document into plain text lines (with page numbers) for the question importers.
 *
 * Browser-safe: this file has no Node imports and only a type import of pdf.js, so the same
 * code can run in a web worker or page that loaded pdf.js itself.
 *
 * How lines are rebuilt:
 * 1. Text items are grouped into rows by baseline.
 * 2. Rows are attached to the line they belong to:
 *    - a short formula row just above a line and one just below it that overlap horizontally
 *      are the numerator and denominator of a stacked fraction;
 *    - a row in a smaller font within ~0.8 of a bigger row's font size above or below it is a
 *      superscript or subscript of that row (preferring the row whose glyphs it touches); a
 *      script can carry its own scripts (an exponent of an exponent);
 *    - rows of big symbols (a tall integral sign or bracket) sit inline in the line they straddle.
 * 3. Within a line, items are sorted by x. Raised items become superscripts, lowered items
 *    subscripts and stacked groups fractions ("(x−y)/(x+y)"). Scripts are written as Unicode
 *    characters (x², 10⁻⁷, CO₃²⁻) when every character has a Unicode form (digits, + − = ( ) n i
 *    x), otherwise as ^(...) / _(...).
 * 4. Spaces come from gaps between items (relative to the font size), pdf.js space items, binary
 *    operators and font changes at the edge of an equation.
 * 5. Characters that PDF fonts expose wrongly are repaired (see normalizeMathText), and lines get
 *    hints the plain text cannot carry: 'image' (an image overlaps the line, or a stand-alone
 *    image line with empty text), 'math' (a stacked fraction, or an equation whose glyphs were
 *    drawn out of order) and 'orphan-script' (a short line of small text that could not be
 *    attached to a line, typically a piece of a stacked equation).
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export type LineHint = 'image' | 'math' | 'orphan-script';

export interface TextLine {
  /** 1-based page number. */
  page: number;
  text: string;
  /** Left edge of the line, in PDF units. */
  x: number;
  /** Baseline, in PDF units from the bottom of the page. */
  y: number;
  /** Main font size of the line. */
  size: number;
  hints?: LineHint[];
}

/** A text item with its position, as taken from pdf.js `getTextContent()`. */
export interface PositionedText {
  str: string;
  x: number;
  y: number;
  width: number;
  /** Font size (vertical scale of the text matrix). */
  size: number;
  /** pdf.js font id; a change of font helps to find word breaks around equations. */
  font?: string;
}

/** Axis-aligned box in PDF units. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ExtractOptions {
  /**
   * The pdf.js `OPS` table (`import { OPS } from 'pdfjs-dist'`). When given, images drawn on
   * each page are located and reported through the 'image' hint.
   */
  ops?: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* pdf.js glue                                                         */
/* ------------------------------------------------------------------ */

export async function extractTextLines(doc: PDFDocumentProxy, options: ExtractOptions = {}): Promise<TextLine[]> {
  const lines: TextLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    try {
      lines.push(...(await extractPageLines(page, p, options)));
    } finally {
      page.cleanup();
    }
  }
  return lines;
}

export async function extractPageLines(page: PDFPageProxy, pageNumber: number, options: ExtractOptions = {}): Promise<TextLine[]> {
  const content = await page.getTextContent();
  const items: PositionedText[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str) continue;
    const [a, b, , d, e, f] = item.transform as number[];
    // Skip rotated text (watermarks, vertical labels); keep sheared text (synthetic italics have c ≠ 0).
    if (Math.abs(b) > 0.01 * Math.abs(a) + 1e-6) continue;
    items.push({ str: item.str, x: e, y: f, width: item.width, size: Math.abs(d) || Math.abs(a), font: item.fontName });
  }
  const images = options.ops ? await imageBoxes(page, options.ops) : [];
  return buildLines(items, pageNumber, images);
}

type Matrix = [number, number, number, number, number, number];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** Boxes of the images painted on a page, following the graphics state like a renderer does. */
async function imageBoxes(page: PDFPageProxy, OPS: Record<string, number>): Promise<Box[]> {
  const list = await page.getOperatorList();
  const imageOps = new Set(
    [
      'paintImageXObject',
      'paintInlineImageXObject',
      'paintImageMaskXObject',
      'paintImageXObjectRepeat',
      'paintImageMaskXObjectRepeat',
      'paintInlineImageXObjectGroup',
      'paintImageMaskXObjectGroup',
      'paintSolidColorImageMask',
    ]
      .map((k) => OPS[k])
      .filter((v) => v !== undefined),
  );
  const boxes: Box[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[] | null;
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform && args) ctm = multiply(ctm, args.slice(0, 6) as Matrix);
    else if (fn === OPS.paintFormXObjectBegin && args) {
      stack.push(ctm);
      const m = args[0] as number[] | null;
      if (Array.isArray(m) && m.length === 6) ctm = multiply(ctm, m as Matrix);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (imageOps.has(fn)) {
      const pts = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      // Ignore degenerate boxes (e.g. 1-pixel rules drawn as images).
      if (box.x1 - box.x0 > 2 && box.y1 - box.y0 > 2) boxes.push(box);
    }
  }
  return boxes;
}

/* ------------------------------------------------------------------ */
/* Line building (pure)                                                */
/* ------------------------------------------------------------------ */

interface Glyph extends PositionedText {
  seq: number;
  x1: number;
  row?: Row;
}

interface Fraction {
  x0: number;
  x1: number;
}

interface Row {
  id: number;
  items: Glyph[];
  y: number;
  size: number;
  minX: number;
  maxX: number;
  chars: number;
  parent?: Row;
  children: Row[];
  fractions: Fraction[];
  /** A row of big symbols that belongs to its parent's baseline (not a script). */
  inline?: boolean;
}

type Seg = 'sup' | 'sub' | 'num' | 'den';

interface Tok {
  str: string;
  x: number;
  x1: number;
  size: number;
  path: Seg[];
  font?: string;
}

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '–': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ',
};
const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '−': '₋', '–': '₋', '=': '₌', '(': '₍', ')': '₎', n: 'ₙ', i: 'ᵢ', x: 'ₓ',
};

/**
 * Writes a superscript or subscript: Unicode when every character can be mapped,
 * otherwise "^(...)" or "_(...)". Raised ordinals and symbols ("th", "®") stay plain.
 */
export function formatScript(text: string, kind: 'sup' | 'sub', before = ''): string {
  const t = text.trim();
  if (!t) return '';
  if (kind === 'sup') {
    if (/^(st|nd|rd|th|®|™|©|°|º|\*+|†|‡)$/i.test(t)) return t;
    if (/^[oO]$/.test(t) && /\d\s*$/.test(before)) return '°';
  }
  const map = kind === 'sup' ? SUP : SUB;
  const chars = [...t.replace(/\s+/g, '')];
  if (chars.every((c) => map[c] !== undefined)) return chars.map((c) => map[c]).join('');
  return `${kind === 'sup' ? '^' : '_'}(${t})`;
}

/** Symbol-font characters that some PDFs expose as Private Use Area code points (U+F0xx). */
const SYMBOL_PUA: Record<number, string> = {
  0x20: ' ', 0x28: '(', 0x29: ')', 0x2b: '+', 0x2c: ',', 0x2d: '−', 0x2e: '.', 0x3d: '=', 0x5b: '[', 0x5d: ']',
  0x7b: '{', 0x7c: '|', 0x7d: '}', 0x44: 'Δ', 0x46: 'Φ', 0x47: 'Γ', 0x4c: 'Λ', 0x50: 'Π', 0x51: 'Θ', 0x53: 'Σ',
  0x57: 'Ω', 0x58: 'Ξ', 0x59: 'Ψ', 0x61: 'α', 0x62: 'β', 0x63: 'χ', 0x64: 'δ', 0x65: 'ε', 0x66: 'φ', 0x67: 'γ',
  0x68: 'η', 0x69: 'ι', 0x6a: 'ϕ', 0x6b: 'κ', 0x6c: 'λ', 0x6d: 'μ', 0x6e: 'ν', 0x6f: 'ο', 0x70: 'π', 0x71: 'θ',
  0x72: 'ρ', 0x73: 'σ', 0x74: 'τ', 0x75: 'υ', 0x77: 'ω', 0x78: 'ξ', 0x79: 'ψ', 0x7a: 'ζ', 0xa2: '′', 0xa3: '≤',
  0xa5: '∞', 0xab: '↔', 0xac: '←', 0xad: '↑', 0xae: '→', 0xaf: '↓', 0xb0: '°', 0xb1: '±', 0xb2: '″', 0xb3: '≥',
  0xb4: '×', 0xb5: '∝', 0xb6: '∂', 0xb7: '•', 0xb8: '÷', 0xb9: '≠', 0xba: '≡', 0xbb: '≈', 0xd5: '∏', 0xd6: '√',
  0xd7: '·', 0xdb: '⇔', 0xde: '⇒', 0xe0: '→', 0xe5: '∑', 0xf2: '∫',
};
/** Pieces of tall brackets (Apple PUA): keep the top piece as the bracket, drop the rest. */
const BRACKET_PIECES: Record<number, string> = { 0xf8eb: '(', 0xf8ee: '[', 0xf8f1: '{', 0xf8f6: ')', 0xf8f9: ']', 0xf8fc: '}' };

/**
 * Repairs characters that come out of PDF fonts wrongly:
 * - mathematical letters (U+1D400–U+1D7FF, ℎ) become plain letters, undoing the doubling some
 *   PDFs produce for them ("𝑥𝑥−𝑦𝑦" for x−y);
 * - Symbol/Wingdings characters exposed as Private Use Area code points become real symbols
 *   (the Wingdings arrow often arrives as "à" plus U+F0E0);
 * - a NUL character, which the equation fonts in some older sets use for the minus sign,
 *   becomes "−".
 */
export function normalizeMathText(s: string): string {
  let out = s;
  if (/[\u{1D400}-\u{1D7FF}\u210E]/u.test(out)) {
    out = out
      .replace(/([\u{1D400}-\u{1D7FF}\u210E])\1/gu, '$1')
      .replace(/[\u{1D400}-\u{1D7FF}\u210E]/gu, (c) => c.normalize('NFKC'));
  }
  if (/[\uf000-\uf0ff\uf8e0-\uf8ff\u0000]/.test(out)) {
    out = out
      .replace(/à?\uf0e0/g, '→')
      .replace(/[\uf020-\uf0ff]/g, (c) => SYMBOL_PUA[c.charCodeAt(0) - 0xf000] ?? c)
      .replace(/[\uf8e0-\uf8ff]/g, (c) => BRACKET_PIECES[c.charCodeAt(0)] ?? '')
      .replace(/\u0000/g, '−');
  }
  return out;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Character-weighted median font size. */
function dominantSize(items: Glyph[]): number {
  const sizes: number[] = [];
  for (const it of items) for (let i = 0; i < Math.max(1, it.str.trim().length); i++) sizes.push(it.size);
  return median(sizes);
}

function makeRow(id: number, items: Glyph[]): Row {
  const size = dominantSize(items);
  const main = items.filter((it) => it.size >= size * 0.9);
  return {
    id,
    items,
    y: median((main.length ? main : items).map((it) => it.y)),
    size,
    minX: Math.min(...items.map((it) => it.x)),
    maxX: Math.max(...items.map((it) => it.x1)),
    chars: items.reduce((n, it) => n + it.str.trim().length, 0),
    children: [],
    fractions: [],
  };
}

/** Group glyphs that share a baseline. */
function groupRows(glyphs: Glyph[]): Row[] {
  const sorted = [...glyphs].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: Glyph[][] = [];
  let firstY = NaN;
  let maxSize = 0;
  for (const g of sorted) {
    const current = groups[groups.length - 1];
    const tol = Math.max(0.6, 0.1 * Math.min(maxSize, g.size));
    if (current && Math.abs(g.y - firstY) <= tol) {
      current.push(g);
      maxSize = Math.max(maxSize, g.size);
    } else {
      groups.push([g]);
      firstY = g.y;
      maxSize = g.size;
    }
  }
  return groups.map((items, i) => {
    const row = makeRow(i, items);
    for (const it of items) it.row = row;
    return row;
  });
}

/** Rows made only of math symbols (an integral sign, a tall bracket, a lone "!" glyph). */
const BIG_SYMBOLS = /^[\s∫∬∭∮∑∏√∛()[\]{}|‖⌈⌉⌊⌋〈〉⟨⟩]+$/;
const isSymbolRow = (r: Row) => r.chars <= 4 && r.items.every((g) => BIG_SYMBOLS.test(g.str) || /^[^\p{L}\p{N}\s]{1,2}$/u.test(g.str.trim()));

/** True when a row reads like a formula rather than prose (no long words). */
function isMathLike(r: Row): boolean {
  const words = r.items.map((g) => g.str).join(' ').match(/\p{L}{4,}/gu) ?? [];
  return words.every((w) => /^(sqrt|sinh|cosh|tanh|log|arcsin|arccos|arctan|csc|sec|cot)$/i.test(w));
}

const near = (r: Row, q: Row, slack: number) => r.minX <= q.maxX + slack && r.maxX >= q.minX - slack;

function attach(r: Row, q: Row, inline = false) {
  r.parent = q;
  q.children.push(r);
  if (inline) r.inline = true;
}

/**
 * A row that is an ordinary superscript or subscript of some bigger row: it touches one of that
 * row's glyphs and sits at a usual script height. Such rows never form stacked fractions (this
 * keeps "W) 10⁻⁷" over "X) 10⁻⁵" from being read as a fraction).
 */
function isGluedScript(r: Row, rows: Row[]): boolean {
  return rows.some((p) => {
    if (p === r || isSymbolRow(p) || p.size < 1.08 * r.size) return false;
    const d = (r.y - p.y) / p.size;
    if (!((d >= 0.1 && d <= 0.5) || (d <= -0.05 && d >= -0.35))) return false;
    return p.items.some((g) => Math.abs(r.minX - g.x1) <= 0.3 * p.size || Math.abs(g.x - r.maxX) <= 0.3 * p.size);
  });
}

/**
 * Stacked fractions: a short formula row just above a line (numerator) and one just below it
 * (denominator) that overlap horizontally. With `withChildren`, rows that already hang from the
 * line (e.g. a denominator in a smaller font taken as a subscript) can complete a pair.
 */
function pairFractions(rows: Row[], withChildren: boolean): void {
  const lines = rows.filter((q) => !q.parent && !isSymbolRow(q)).sort((a, b) => b.chars - a.chars || b.size - a.size);
  const glued = new Set(rows.filter((r) => isGluedScript(r, rows)));
  for (const q of lines) {
    if (q.parent) continue;
    const S = q.size;
    const parts = rows.filter((r) => {
      if (r === q || r.parent || glued.has(r) || isSymbolRow(r) || !isMathLike(r)) return false;
      const d = r.y - q.y;
      return (
        r.chars <= 30 &&
        r.chars < q.chars + 10 &&
        r.size <= 1.15 * S &&
        (d >= 0.5 * S || d <= -0.35 * S) &&
        Math.abs(d) <= 0.95 * S &&
        r.minX >= q.minX - S &&
        r.minX <= q.maxX + 4 * S
      );
    });
    const partners = withChildren
      ? [...parts, ...q.children.filter((c) => !c.inline && !glued.has(c) && Math.abs(c.y - q.y) >= 0.35 * S)]
      : parts;
    const ups = partners.filter((r) => r.y > q.y);
    const downs = partners.filter((r) => r.y < q.y);
    for (const u of ups) {
      for (const d of downs) {
        if (!near(u, d, 0)) continue;
        for (const r of [u, d]) if (!r.parent) attach(r, q);
      }
    }
  }
}

/**
 * Builds the row tree and returns the rows that start a line:
 * 1. stacked fractions are bound to the line they belong to;
 * 2. smaller rows become scripts of the bigger row they sit on (preferring the row whose glyphs
 *    are right next to them);
 * 3. rows of math symbols (a tall integral sign or bracket) join the line whose baseline they
 *    straddle, as ordinary text of that line.
 */
function attachRows(rows: Row[]): Row[] {
  pairFractions(rows, false);

  const order = [...rows].sort((a, b) => b.size - a.size || b.chars - a.chars || b.y - a.y);
  const done: Row[] = [];
  for (const r of order) {
    if (!r.parent) {
      let best: Row | undefined;
      let bestScore = Infinity;
      for (const q of done) {
        if (isSymbolRow(q) || q.size < r.size * 1.08) continue;
        const d = r.y - q.y;
        if (Math.abs(d) > 0.8 * q.size) continue;
        // A long row is a line of its own, not a script of a shorter row or of a row in nearly the same font.
        if (r.chars > Math.max(10, 2 * q.chars)) continue;
        if (r.chars > 20 && r.size > 0.85 * q.size) continue;
        if (!near(r, q, 0.6 * q.size)) continue;
        // Prefer the row whose glyphs are right next to the script (its base), then the closest baseline.
        const gapX = Math.min(...q.items.map((g) => Math.max(0, g.x - r.maxX, r.minX - g.x1)));
        const score = Math.abs(d) / q.size + (0.5 * gapX) / q.size;
        if (score < bestScore) {
          bestScore = score;
          best = q;
        }
      }
      if (best) attach(r, best);
    }
    done.push(r);
  }

  pairFractions(rows, true);

  for (const r of rows.filter((x) => !x.parent && isSymbolRow(x))) {
    let best: Row | undefined;
    let bestDist = Infinity;
    for (const q of rows) {
      if (q === r || q.parent || isSymbolRow(q)) continue;
      const dist = Math.abs(r.y - q.y);
      if (dist > 0.6 * Math.max(r.size, q.size) || !near(r, q, q.size)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = q;
      }
    }
    if (!best) continue;
    attach(r, best, true);
    // Equation fonts in some older sets draw the integral sign with the code of "!".
    for (const g of r.items) if (g.str.trim() === '!' && g.size >= 1.3 * best.size) g.str = '∫';
  }
  return rows.filter((r) => !r.parent);
}

const LARGE_OPERATOR = /[∫∬∭∮∑∏⋃⋂]\s*$|\blim\s*$/;

/** All glyphs of a row and the rows hanging from it. */
function subtreeGlyphs(r: Row): Glyph[] {
  return [...r.items, ...r.children.flatMap(subtreeGlyphs)];
}

/** Find stacked fractions among the rows hanging directly from a row. */
function findFractions(row: Row): void {
  const S = row.size;
  const high: Glyph[] = [];
  const low: Glyph[] = [];
  for (const child of row.children) {
    if (child.inline) continue;
    const d = child.y - row.y;
    if (d >= 0.5 * S) high.push(...subtreeGlyphs(child));
    else if (d <= -0.35 * S) low.push(...subtreeGlyphs(child));
  }
  if (!high.length || !low.length) return;
  const clusters = (gs: Glyph[]) => {
    const out: { x0: number; x1: number }[] = [];
    for (const g of [...gs].sort((a, b) => a.x - b.x)) {
      const last = out[out.length - 1];
      if (last && g.x <= last.x1 + 0.3 * S) last.x1 = Math.max(last.x1, g.x1);
      else out.push({ x0: g.x, x1: g.x1 });
    }
    return out;
  };
  const highs = clusters(high);
  for (const lo of clusters(low)) {
    for (const hi of highs) {
      const overlap = Math.min(hi.x1, lo.x1) - Math.max(hi.x0, lo.x0);
      const narrow = Math.min(hi.x1 - hi.x0, lo.x1 - lo.x0);
      if (overlap < 0.3 * narrow) continue;
      const x0 = Math.min(hi.x0, lo.x0);
      // Limits of an integral or sum are written as sub/superscripts, not as a fraction.
      const inlineItems = [...row.items, ...row.children.filter((c) => c.inline).flatMap((c) => c.items)];
      const left = inlineItems.filter((g) => g.x1 <= x0 + 1).sort((a, b) => b.x1 - a.x1)[0];
      if (left && LARGE_OPERATOR.test(left.str) && x0 - left.x1 < S) continue;
      row.fractions.push({ x0, x1: Math.max(hi.x1, lo.x1) });
    }
  }
}

function levelOf(parent: Row, y: number, xc: number): Seg | null {
  const d = y - parent.y;
  const S = parent.size;
  for (const f of parent.fractions) {
    if (xc >= f.x0 - 0.5 && xc <= f.x1 + 0.5) {
      if (d > 0.15 * S) return 'num';
      if (d < -0.15 * S) return 'den';
    }
  }
  if (d > 0.1 * S) return 'sup';
  if (d < -0.08 * S) return 'sub';
  return null;
}

/** Path of script levels from the line anchor down to a glyph. */
function pathOf(g: Glyph, anchor: Row): Seg[] {
  const chain: Row[] = [];
  for (let r: Row | undefined = g.row; r && r !== anchor; r = r.parent) chain.unshift(r);
  const path: Seg[] = [];
  const xc = (g.x + g.x1) / 2;
  let parent = anchor;
  chain.forEach((r, i) => {
    const y = i === chain.length - 1 ? g.y : r.y;
    const seg = r.inline ? null : levelOf(parent, y, xc);
    if (seg) path.push(seg);
    parent = r;
  });
  if (!chain.length) {
    // Glyph in the anchor row itself, but possibly on a raised/lowered baseline.
    const seg = levelOf(anchor, g.y, xc);
    if (seg === 'sup' || seg === 'sub') {
      if (g.size < anchor.size * 0.92) path.push(seg);
    }
  }
  return path;
}

const OPENERS = /[([{‘“$/]$/;
const OPERATOR_END = /[×÷±=<>≤≥≈≠·+−]$/;
const OPERATOR_START = /^[×÷±=<>≤≥≈≠·+−]/;
/** A function name written before its argument ("sin x", "ln x"). */
const FUNCTION_END = /(?:^|[^\p{L}])(?:sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|ln|log|exp|lim|arcsin|arccos|arctan)$/u;
/** A sign at the end of the text with no operand before it is unary ("(−5)", "= −4"). */
const isUnarySign = (out: string) => /[+−±]$/.test(out) && !/[\p{L}\p{N})\]|!%°′'⁰¹²³⁴⁵⁶⁷⁸⁹ⁿˣ₀₁₂₃₄₅₆₇₈₉]\s*[+−±]$/u.test(out);
const CLOSERS = /^[)\]},.;:!?%’”/]/;

/**
 * Equation editors in the older PDFs map the minus sign to "!" (e.g. "(y ! 2)" for y − 2).
 * A lone "!" with space on both sides, between two operands, is read as a minus sign.
 */
function fixSymbolMinus(toks: Tok[]): void {
  toks.forEach((t, i) => {
    if (t.str.trim() !== '!') return;
    const key = t.path.join();
    const prev = toks.slice(0, i).reverse().find((u) => u.path.join() === key);
    const next = toks.slice(i + 1).find((u) => u.path.join() === key);
    if (!prev || !next) return;
    if (t.x - prev.x1 > 0.1 * t.size && next.x - t.x1 > 0.1 * t.size && /[\p{L}\p{N})²³¹⁰-⁹]\s*$/u.test(prev.str)) {
      t.str = '−';
    }
  });
}

/** A denominator stays bare only when it is one number, one letter or one bracketed group ("16", "x²", "(x + 1)²"). */
function wrapDenominator(s: string): string {
  return /^(?:\d+(?:[.,]\d+)?|\p{L}|\([^()]*\)|\[[^\]]*\])[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱˣ₀₁₂₃₄₅₆₇₈₉₊₋ₙᵢₓ]*$/u.test(s) ? s : `(${s})`;
}

/** Parenthesise a numerator unless it is a single term such as "16", "x²", "10π" or "(x + 1)²". */
function wrapFraction(s: string): string {
  let depth = 0;
  for (const c of s) {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && /[\s+\-−–×÷·=/<>]/.test(c)) return `(${s})`;
  }
  return s;
}

function render(toks: Tok[], spaceAt: (x0: number, x1: number) => boolean, depth = 0): string {
  let out = '';
  let prevEnd = -Infinity;
  let prevFont: string | undefined;
  const size = Math.max(...toks.map((t) => t.size));
  let i = 0;
  while (i < toks.length) {
    const head = toks[i].path[0];
    let j = i + 1;
    let piece: string;
    let isScript = false;
    if (head === undefined) {
      piece = toks[i].str;
    } else if (head === 'num' || head === 'den') {
      while (j < toks.length && (toks[j].path[0] === 'num' || toks[j].path[0] === 'den')) j++;
      const group = toks.slice(i, j);
      const part = (seg: Seg) => {
        const ts = group.filter((t) => t.path[0] === seg).map((t) => ({ ...t, path: t.path.slice(1) }));
        return ts.length ? render(ts, spaceAt, depth).trim() : '';
      };
      const num = part('num');
      const den = part('den');
      piece = num && den ? `${wrapFraction(num)}/${wrapDenominator(den)}` : num || den;
    } else {
      while (j < toks.length && toks[j].path[0] === head) j++;
      const group = toks.slice(i, j).map((t) => ({ ...t, path: t.path.slice(1) }));
      const inner = render(group, spaceAt, depth + 1);
      // Some PDFs leave script formatting on after the script ("H" "2, DIHYDROGEN)"): only the
      // first token is the script when words follow it.
      const spill = /^([^\s,;]+)([,;]?\s+.*)$/.exec(inner);
      if (spill && /\p{L}{4,}/u.test(spill[2])) piece = formatScript(spill[1], head as 'sup' | 'sub', out) + spill[2];
      else piece = formatScript(inner, head as 'sup' | 'sub', out);
      isScript = true;
    }
    const x0 = toks[i].x;
    const x1 = Math.max(...toks.slice(i, j).map((t) => t.x1));
    if (out && piece && !/\s$/.test(out) && !/^\s/.test(piece)) {
      const gap = x0 - prevEnd;
      // Scripts and the text inside them are compact: only a clear gap makes a space there.
      const wide = gap > (isScript || depth > 0 ? 0.3 : 0.2) * size;
      const hinted = depth === 0 && !isScript && gap > 0.08 * size && spaceAt(prevEnd, x0);
      // A script that touches the letter after it and follows a word gap is a pre-script ("the ¹H").
      const next = toks[j];
      const preScript =
        depth === 0 && isScript && gap > 0.15 * size && !!next && next.path.length === 0 && next.x - x1 < 0.05 * size && /^[\p{L}/⁄]/u.test(next.str);
      // Spaces around binary operators; none after a unary minus ("(−5)", "= −4" keeps one before).
      const operator =
        depth === 0 && !isScript && gap > 0.08 * size && ((OPERATOR_END.test(out) && !isUnarySign(out)) || OPERATOR_START.test(piece));
      // An equation set in its own font often ends right before the next word.
      const fontChange =
        depth === 0 && !isScript && head === undefined && gap > 0.1 * size && !!prevFont && !!toks[i].font && prevFont !== toks[i].font && /[\p{L}\p{N}]$/u.test(out) && (/^\p{L}{2}/u.test(piece) || FUNCTION_END.test(out));
      // A stacked fraction right after a whole number is a mixed number ("3 1/2", not "31/2").
      const mixed = (head === 'num' || head === 'den') && /\d$/.test(out) && /^\d/.test(piece);
      const unary = isUnarySign(out);
      if ((wide || hinted || operator || fontChange || preScript || mixed) && !unary && !OPENERS.test(out) && !CLOSERS.test(piece)) out += ' ';
    }
    out += piece;
    prevFont = head === undefined ? toks[i].font : undefined;
    prevEnd = Math.max(prevEnd, x1);
    i = j;
  }
  return out;
}

/**
 * Builds the text lines of one page from positioned text items (pure; exported for tests).
 * `images` are boxes of images drawn on the page.
 */
export function buildLines(items: PositionedText[], page: number, images: Box[] = []): TextLine[] {
  const spaces = items.filter((it) => !it.str.trim());
  const glyphs: Glyph[] = items
    .map((it, seq) => ({ ...it, str: normalizeMathText(it.str), seq, x1: it.x + Math.max(0, it.width) }))
    .filter((it) => it.str.trim() !== '');
  if (!glyphs.length && !images.length) return [];

  const rows = groupRows(glyphs);
  const anchors = attachRows(rows);
  for (const r of rows) findFractions(r);
  const bodySize = dominantSize(glyphs);

  const lines: (TextLine & { top: number })[] = [];
  const usedImages = new Set<Box>();
  for (const anchor of anchors) {
    const subtree: Glyph[] = [];
    const visit = (r: Row) => {
      subtree.push(...r.items);
      r.children.forEach(visit);
    };
    visit(anchor);
    // Drop exact duplicates (text drawn twice for a bold effect).
    const sorted = subtree.sort((a, b) => a.x - b.x || b.y - a.y);
    const unique = sorted.filter(
      (g, i) => !sorted.slice(Math.max(0, i - 3), i).some((h) => h.str === g.str && Math.abs(h.x - g.x) < 0.5 && Math.abs(h.y - g.y) < 0.5),
    );
    const toks: Tok[] = unique.map((g) => ({ str: g.str, x: g.x, x1: g.x1, size: g.size, path: pathOf(g, anchor), font: g.font }));
    fixSymbolMinus(toks);
    const S = anchor.size;
    const lineSpaces = spaces.filter((s) => Math.abs(s.y - anchor.y) <= 0.75 * S);
    const spaceAt = (x0: number, x1: number) => lineSpaces.some((s) => s.x >= x0 - 1 && s.x <= x1 + 1);
    const text = normalizeMathText(render(toks, spaceAt)).replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const hints = new Set<LineHint>();
    if (anchor.fractions.length || anchor.children.some((c) => c.fractions.length)) hints.add('math');
    const own = [...anchor.items].sort((a, b) => a.x - b.x);
    for (let k = 1; k < own.length; k++) {
      if (own[k].seq < own[k - 1].seq && own[k].x - own[k - 1].x1 < 0.5 * S && own[k].x > own[k - 1].x + 1) {
        hints.add('math');
        break;
      }
    }
    if (S < 0.8 * bodySize && text.length <= 15) hints.add('orphan-script');
    const top = anchor.y + 0.9 * S;
    const bottom = anchor.y - 0.3 * S;
    for (const box of images) {
      if (box.y0 < top && box.y1 > bottom) {
        hints.add('image');
        usedImages.add(box);
      }
    }
    lines.push({ page, text, x: round(anchor.minX), y: round(anchor.y), size: round(S), ...(hints.size ? { hints: [...hints].sort() } : {}), top });
  }
  for (const box of images) {
    if (usedImages.has(box)) continue;
    lines.push({ page, text: '', x: round(box.x0), y: round(box.y0), size: round(box.y1 - box.y0), hints: ['image'], top: box.y1 });
  }
  lines.sort((a, b) => b.top - a.top || a.x - b.x);
  return lines.map(({ top: _top, ...line }) => line);
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Plain text of lines, one per line (handy for debugging and fixtures). */
export function linesToText(lines: TextLine[]): string {
  return lines.map((l) => l.text).join('\n');
}
