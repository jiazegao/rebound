/**
 * Reading a question aloud (online matches in speech mode): what to say, and when. It works on the text the reveal
 * uses (src/lib/reading.ts), so the spoken question keeps the server's timeline, the same one text players see.
 *
 * - Pronunciation guides ("[SU-doe-POH-dee-ah]") are skipped: the voice says the word itself.
 * - Reading guides, the notes DOE writes for moderators ("y = √x² − 3x [y equals the square root of x squared
 *   minus 3x]"), are said in place of the math before them.
 * - Other symbols are said in words: x² "x squared", 10⁻³ "10 to the power of negative 3", SO₄²⁻ "SO4, 2 minus",
 *   π "pi", √ "the square root of", 25 – 9 "25 minus 9", 125/343 "125 over 343", and so on.
 * - The question is said in short phrases, each with its place on the timeline, so every device stays in step.
 */
import { msPerChar, type Reading } from '../lib/reading';

/* ---------------- brackets ---------------- */

export type BracketKind = 'pronunciation' | 'reading' | 'notation';

/** Words that mark a bracket as a reading guide for the math before it. */
const READING_WORDS =
  /(^|[\s(])(equals?|plus|minus|times|over|squared|cubed|root|power|raised|quantity|fraction|sub|naught|theta|delta|alpha|beta|gamma|lambda|omega|sigma|phi|pi|sine|cosine|tangent|secant|cosecant|cotangent|log|logarithm|natural|absolute|function|divided|integral|derivative|degrees?|less|greater|approximately|infinity|limit|sum|vector|matrix|determinant|inverse|prime|of [a-z]|to the)(?=$|[\s),.])/i;
/** Math or chemistry written inside the brackets: concentrations [NH₄⁺], intervals [π/6 (x + π/12)]. */
const NOTATION = /[=+×÷^√π<>≤≥⁺⁻₀-₉⁰¹²³⁴-⁹/]/u;

/**
 * What a bracket holds: a pronunciation guide or a note to the moderator (skipped), a reading guide (said instead
 * of what comes before it), or math notation (said like the rest of the text). Pronunciation guides are the common
 * case: hyphenated syllables with the stressed one in capitals, "[ves-TIB-u-lar]", "[TALL – you – een]", or one
 * syllable in capitals, "[SHIST]". Reading guides say how to read math, symbols or letters: "[y equals x squared]",
 * "[theta]", "[A, A, A]", "[little b]", "[one <pause> s]".
 */
export function bracketKind(content: string): BracketKind {
  const c = content.trim();
  if (/[-–_]/.test(c) && /\p{Lu}{2,}/u.test(c)) return 'pronunciation';
  if (/^\p{Lu}{2,}$/u.test(c) || /^[\p{Ll}'’]+(-[\p{Ll}'’]+)+$/u.test(c)) return 'pronunciation';
  if (/^(read|pause|say|note|emphasi[sz]e|spell|do not)\b/i.test(c)) return 'pronunciation';
  if (/<pause>/i.test(c) || READING_WORDS.test(c)) return 'reading';
  if (NOTATION.test(c)) return 'notation';
  return /\p{L}|\d/u.test(c) ? 'reading' : 'pronunciation';
}

/* ---------------- symbols in words ---------------- */

const SUPER: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-', '⁽': '(', '⁾': ')',
  ˣ: 'x', ⁿ: 'n', ⁱ: 'i', ʸ: 'y',
};
const SUB: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-', '₍': '(', '₎': ')',
  ₐ: 'a', ₑ: 'e', ₒ: 'o', ₓ: 'x', ₕ: 'h', ₖ: 'k', ₗ: 'l', ₘ: 'm', ₙ: 'n', ₚ: 'p', ₛ: 's', ₜ: 't', ᵢ: 'i', ⱼ: 'j',
};
const SUPER_RUN = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ˣⁿⁱʸ⁽⁾]+/gu;
const SUB_RUN = /[₀₁₂₃₄₅₆₇₈₉₊₋₍₎ₐₑₒₓₕₖₗₘₙₚₛₜᵢⱼ]+/gu;

/**
 * A superscript after `before`: an electron count (1s²), an ion's charge (Fe³⁺, OH⁻, N⁺², e⁻) or an exponent (x²,
 * 10⁻³, 2ˣ⁺¹). Element symbols start with a capital letter; variables are lowercase.
 */
function superscript(run: string, before: string): string {
  const plain = [...run].map((ch) => SUPER[ch] ?? ch).join('');
  if (/\d[spdf]$/.test(before) && /^\d+$/.test(plain)) return ` ${plain} `;
  const sign = /^[+-]$/.test(plain);
  const element = /([A-Z][a-z]?|[)\]₀₁₂₃₄₅₆₇₈₉])$/u.test(before);
  const charge = /^(\d*)([+-])$/.exec(plain) ?? (/^([+-])(\d+)$/.exec(plain) ? [plain, plain.slice(1), plain[0]!] : null);
  if (charge && (sign || element)) return `${charge[1] ? ` ${charge[1]}` : ''} ${charge[2] === '+' ? 'plus' : 'minus'} `;
  if (plain === '2') return ' squared ';
  if (plain === '3') return ' cubed ';
  const spoken = plain.replace(/^-/, 'negative ').replace(/\+/g, ' plus ').replace(/(?<=\w)-/g, ' minus ');
  return ` to the power of ${spoken} `;
}

/** Symbol words, applied after superscripts and subscripts. Longer and more specific ones first. */
const WORDS: Array<[RegExp, string | ((...groups: string[]) => string)]> = [
  [/°\s?C\b/gu, ' degrees Celsius'],
  [/°\s?F\b/gu, ' degrees Fahrenheit'],
  [/[°º]/gu, ' degrees'],
  [/√/gu, ' the square root of '],
  [/∛/gu, ' the cube root of '],
  [/½/gu, ' one half'],
  [/¼/gu, ' one quarter'],
  [/¾/gu, ' three quarters'],
  [/≤/gu, ' less than or equal to '],
  [/≥/gu, ' greater than or equal to '],
  [/≠/gu, ' not equal to '],
  [/≈/gu, ' approximately '],
  [/±/gu, ' plus or minus '],
  [/[↔⇌⇄]/gu, ' is in equilibrium with '],
  [/→/gu, ' yields '],
  [/∞/gu, ' infinity'],
  [/×/gu, ' times '],
  [/÷/gu, ' divided by '],
  [/\^/gu, ' to the power of '],
  [/π/gu, ' pi '],
  [/θ/gu, ' theta '],
  [/[∆Δ]/gu, ' delta '],
  [/λ/gu, ' lambda '],
  [/[µμ](?=[a-zA-Z])/gu, ' micro'],
  [/[µμ]/gu, ' mu '],
  [/Ω/gu, ' ohms'],
  [/α/gu, ' alpha '],
  [/β/gu, ' beta '],
  [/γ/gu, ' gamma '],
  [/σ/gu, ' sigma '],
  [/[φϕ]/gu, ' phi '],
  [/ω/gu, ' omega '],
  [/ε/gu, ' epsilon '],
  [/<pause>/giu, ', '],
  [/(?<=[\d)])\s*\/\s*(?=[\d(])/gu, ' over '],
  [/\band\/or\b/gu, 'and or'],
  [/(?<=\b[a-zA-Zµμ]{1,3})\/(?=[a-zA-Z]{1,3}\b)/gu, ' per '],
  [/=/gu, ' equals '],
  [/<(?!=)/gu, ' less than '],
  [/>/gu, ' greater than '],
  [/(?<=\d)\s?[–—](?=\d)/gu, ' to '],
  [/(^|[\s(=])[−–](?=[\d.a-zA-Z(√π])/gu, '$1negative '],
  [/[−–]/gu, ' minus '],
  [/\+/gu, ' plus '],
  // f(x) "f of x", V(r) "V of r", g'(2) "g prime of 2".
  [/(?<![A-Za-z])([A-Za-z])(['’]?)\(([^()\s]{1,8})\)/gu, (_m: string, f: string, prime: string, x: string) => `${f}${prime ? ' prime' : ''} of ${x}`],
  [/[|_]/gu, ' '],
  [/[[\]{}]/gu, ' '],
];

/** A piece of question text in words a voice can say. */
export function spokenText(text: string): string {
  let s = text.replace(SUPER_RUN, (run, offset: number, all: string) => superscript(run, all.slice(0, offset)));
  // Subscript numbers join the formula (H₂O "H2O"); subscript letters are said "sub" (aₙ "a sub n").
  s = s.replace(SUB_RUN, (run) => {
    const plain = [...run].map((ch) => SUB[ch] ?? ch).join('');
    return /[a-z]/.test(plain) ? ` sub ${plain} ` : plain;
  });
  for (const [pattern, words] of WORDS) s = s.replace(pattern, words as string);
  // Characters no voice can say (damaged equations in some older sets) are left out.
  s = s.replace(/[^\p{Script=Latin}\p{Script=Greek}\p{N}\p{P}\s$%&@#*+]/gu, ' ');
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:?!)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();
}

/* ---------------- what to say, piece by piece ---------------- */

interface Piece {
  /** Characters [start, end) of the reading's text. */
  start: number;
  end: number;
  say: string;
  /** The text pauses after it (punctuation, or the end of a line). */
  pause: boolean;
  /** It ends a sentence (., ? or !, or the end of a line). */
  stop: boolean;
  /** The last piece of a line: the next one starts a new phrase. */
  lineEnd: boolean;
}

/** The pause after a piece: punctuation just after it, or at the end of its own words ("organism?"). */
function pauseAfter(text: string, end: number, say: string): { pause: boolean; stop: boolean; lineEnd: boolean } {
  const after = text.slice(end).match(/^[^\S\n]*(\n|[,.;:?!])?/)?.[1];
  const own = /([,.;:?!])["'’”)\]]*$/.exec(say)?.[1];
  const mark = after ?? own;
  const last = end >= text.length;
  // "E. coli": a single capital before a period is an initial, not the end of a sentence.
  const initial = mark === '.' && /(^|\s)[A-Z]\.$/.test(say);
  return { pause: mark !== undefined || last, stop: (mark !== undefined && /[.?!\n]/.test(mark) && !initial) || last, lineEnd: after === '\n' || last };
}

const MATHY = /[\d=+×÷^√∛π<>≤≥|²³¹⁰⁴⁵⁶⁷⁸⁹⁻⁺ˣ₀-₉θ∆Δ−–/·*()]|[^\x00-\x7F]/u;
const FUNCTION_WORD = /^\(?(sin|cos|tan|sec|csc|cot|log|ln|exp|lim)\b/i;
/** An operator on its own, and the words a reading guide uses for it. */
const OPERATORS: Array<[RegExp, RegExp]> = [
  [/^[=≈≠]$/u, /equal|approximately/i],
  [/^\+$/u, /plus|add|and/i],
  [/^[−–-]$/u, /minus|negative|subtract/i],
  [/^[×*·]$/u, /times|multipl|by/i],
  [/^[÷/]$/u, /over|divided|per/i],
  [/^[→⇌↔⇄]$/u, /yield|to\b|arrow|equilibrium|produc|gives|form/i],
  [/^[<>≤≥]$/u, /less|greater|than|equal/i],
  [/^\^$/u, /power|raised/i],
  [/^±$/u, /plus or minus/i],
];

/**
 * Whether a word before a reading guide is part of what the guide reads (`first`: the word right before it).
 * Numbers, symbols and single letters are; an operator is if the guide says it; a word is if the guide says it,
 * and so is a code in capitals right before the guide ("AAA [A, A, A]").
 */
function readByGuide(token: string, guide: string, first: boolean): boolean {
  if (/[:;,.?!]$/.test(token) || /^[WXYZ]\)$/.test(token)) return false;
  const operator = OPERATORS.find(([op]) => op.test(token));
  if (operator) return operator[1].test(guide);
  if (/^[A-Za-z]$/.test(token) || FUNCTION_WORD.test(token)) return true;
  const word = /^[A-Za-z'’]{2,}$/.test(token);
  if (word || /^[A-Za-z0-9-]{2,}$/.test(token)) {
    if (new RegExp(`(^|[^A-Za-z])${token.replace(/[^A-Za-z0-9]/g, '')}([^A-Za-z]|$)`, 'i').test(guide)) return true;
    if (first && /[A-Z]/.test(token.slice(1)) && token.length <= 8) return true;
    if (word) return false;
  }
  return MATHY.test(token);
}

/**
 * The reading's text as pieces to say, in order: words (with symbols in words), reading guides in place of their
 * math, and nothing for pronunciation guides. Each piece keeps its place in the text, for its time on the timeline.
 */
export function speechPieces(text: string): Piece[] {
  // Brackets first: their kind decides what is said around them.
  const replaced: Array<{ start: number; end: number; say: string }> = [];
  for (const m of text.matchAll(/\[([^\]\n]*)\]/g)) {
    const kind = bracketKind(m[1]!);
    if (kind === 'notation') continue;
    const end = m.index + m[0].length;
    if (kind === 'pronunciation') {
      replaced.push({ start: m.index, end, say: '' });
      continue;
    }
    // A reading guide: back over what it reads (in the same line), which it replaces.
    const guide = m[1]!.trim();
    let start = m.index;
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    const before = text.slice(lineStart, m.index);
    // Text joined to the bracket ("4ˣ⁺³[...]") is part of the math.
    const joined = /\S+$/.exec(before);
    if (joined && !/[:;,.?!]$/.test(joined[0])) start = lineStart + joined.index;
    const words = [...text.slice(lineStart, start).matchAll(/\S+/g)];
    for (let i = words.length - 1; i >= 0; i--) {
      if (!readByGuide(words[i]![0], guide, start === m.index && i === words.length - 1)) break;
      start = lineStart + words[i]!.index;
    }
    const previous = replaced[replaced.length - 1];
    if (previous && previous.end > start) start = previous.end;
    replaced.push({ start, end, say: spokenText(guide) });
  }

  const pieces: Piece[] = [];
  const add = (start: number, end: number, say: string) => {
    // Punctuation on its own ("?" after a guide) belongs to the piece before it, on the same line.
    const last = pieces[pieces.length - 1];
    if (/^\p{P}+$/u.test(say) && last && !text.slice(last.end, start).includes('\n')) {
      const joined = `${last.say}${say}`;
      Object.assign(last, { end, say: joined, ...pauseAfter(text, end, joined) });
      return;
    }
    pieces.push({ start, end, say, ...pauseAfter(text, end, say) });
  };
  let at = 0;
  const words = (from: number, to: number) => {
    for (const w of text.slice(from, to).matchAll(/\S+/g)) {
      const start = from + w.index;
      const end = start + w[0].length;
      // A choice letter at the start of a line ("W) ...") is said as its own short beat.
      const choice = /^([WXYZ])\)$/.exec(w[0]);
      const say = choice && (start === 0 || text[start - 1] === '\n') ? `${choice[1]},` : spokenText(w[0]);
      add(start, end, say);
    }
  };
  for (const r of replaced) {
    words(at, r.start);
    if (r.say) add(r.start, r.end, r.say);
    else if (pieces.length) {
      // A skipped guide: the word before it keeps its pause, if the guide had one after it.
      const last = pieces[pieces.length - 1]!;
      const skipped = pauseAfter(text, r.end, '');
      if (skipped.pause) last.pause = true;
      if (skipped.stop) last.stop = true;
      if (skipped.lineEnd) last.lineEnd = true;
    }
    at = r.end;
  }
  words(at, text.length);
  return pieces.filter((p) => p.say.length > 0 || p.lineEnd);
}

/**
 * The whole question as one passage for a recorded voice (docs/SERVER.md, "Read aloud"): its sentences in order,
 * each answer choice its own short sentence ("W, basic.").
 */
export function spokenQuestion(text: string): string {
  const out: string[] = [];
  for (const p of speechPieces(text)) {
    if (!p.say) continue;
    out.push(p.lineEnd && !/[.?!]$/.test(p.say) ? `${p.say.replace(/[,;:]$/, '')}.` : p.say);
  }
  return out.join(' ');
}

/* ---------------- phrases on the timeline ---------------- */

export interface SpeechChunk {
  /** What to say. */
  say: string;
  /** When to start and finish saying it, in ms after the reading started (the server's timeline). */
  startMs: number;
  endMs: number;
  /** Characters [start, end) of the reading's text it covers. */
  start: number;
  end: number;
}

/**
 * A phrase is a sentence, so the voice keeps its natural rise and fall: it ends at the end of a sentence or a line
 * (each answer choice is its own phrase); a long sentence also ends at a comma once it has this many words, and
 * always by this many.
 */
export const COMMA_PHRASE_WORDS = 14;
export const MAX_PHRASE_WORDS = 25;

/**
 * The reading as phrases to say, each with its start and end on the reading's timeline (the time the reveal would
 * take to show those characters at `wpm`).
 */
export function speechChunks(reading: Reading, wpm: number): SpeechChunk[] {
  const per = msPerChar(wpm);
  const time = (index: number) => (index <= 0 ? 0 : reading.cumulative[Math.min(index, reading.cumulative.length) - 1]!) * per;
  const chunks: SpeechChunk[] = [];
  let group: Piece[] = [];
  const flush = () => {
    const said = group.filter((p) => p.say);
    if (said.length) {
      const start = group[0]!.start;
      const end = group[group.length - 1]!.end;
      chunks.push({ say: said.map((p) => p.say).join(' '), startMs: time(start), endMs: time(end), start, end });
    }
    group = [];
  };
  for (const piece of speechPieces(reading.text)) {
    group.push(piece);
    const words = group.reduce((n, p) => n + (p.say ? p.say.split(' ').length : 0), 0);
    if (piece.lineEnd || piece.stop || words >= MAX_PHRASE_WORDS || (piece.pause && words >= COMMA_PHRASE_WORDS)) flush();
  }
  flush();
  return chunks;
}

/* ---------------- how fast to say a phrase ---------------- */

/** The slowest and fastest a voice is asked to speak (1 is its normal pace); beyond them most voices distort. */
export const MIN_RATE = 0.6;
export const MAX_RATE = 2.2;

/**
 * The speaking rate that fits `say` into `ms`, for a voice that says `charsPerSecond` characters a second at its
 * normal rate.
 */
export function rateFor(say: string, ms: number, charsPerSecond: number): number {
  return rateForChars(say.length, ms, charsPerSecond);
}

export function rateForChars(chars: number, ms: number, charsPerSecond: number): number {
  if (ms <= 0) return MAX_RATE;
  const rate = chars / (ms / 1000) / charsPerSecond;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}
