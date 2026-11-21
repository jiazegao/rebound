/**
 * Reading a question aloud: the words Rebound's recorded voice says for it (scripts/voice records them), and the
 * recording's name. It works on the text the reveal uses (src/lib/reading.ts).
 *
 * - Pronunciation guides ("[SU-doe-POH-dee-ah]") are skipped: the voice says the word itself.
 * - Reading guides, the notes DOE writes for moderators ("y = √x² − 3x [y equals the square root of x squared
 *   minus 3x]"), are said in place of the math before them.
 * - Other symbols are said in words: x² "x squared", 10⁻³ "10 to the power of negative 3", SO₄²⁻ "SO4, 2 minus",
 *   π "pi", √ "the square root of", 25 – 9 "25 minus 9", 125/343 "125 over 343", 5! "5 factorial", and so on.
 * - The brackets of math are said, as DOE's guides say them: (x + 5)² "open parenthesis x plus 5 close parenthesis
 *   squared", (6 + 3i)(4 + i) with "times" between the two.
 * A change here changes the words of the questions it touches, and so the names of their recordings: they must be
 * recorded and published again (scripts/voice/README.md), which src/lib/voice.test.ts checks.
 */
import { buildReading } from '../lib/reading';

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
  // A noble-gas core ("[Ar]4s²3d⁹") is part of the configuration, which DOE's guide after it reads whole.
  if (/^(He|Ne|Ar|Kr|Xe|Rn)$/.test(c)) return 'notation';
  if (/[-–_]/.test(c) && /\p{Lu}{2,}/u.test(c)) return 'pronunciation';
  if (/^\p{Lu}{2,}$/u.test(c) || /^[\p{Ll}'’]+(-[\p{Ll}'’]+)+$/u.test(c)) return 'pronunciation';
  // Syllables with a one-letter stressed one, "dy-E-thi-leen"; not a spelling ("A-R-4-s-2"), or a reading with one
  // word in it ("X-big-B", "S-eye").
  const syllables = c.split('-');
  if (
    syllables.length > 2 &&
    syllables.every((s) => /^[\p{L}'’]+$/u.test(s)) &&
    syllables.some((s) => /^\p{Lu}+$/u.test(s)) &&
    syllables.filter((s) => /^\p{Ll}{2,}$/u.test(s)).length >= 2 &&
    !syllables.some((s) => /^(?:big|little|small|capital|sub|plus|minus|prime|bar|naught|dot|star|double|single|triple|bond)$/i.test(s))
  ) {
    return 'pronunciation';
  }
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

/** States of matter after a formula, as DOE writes them: "(g)", "(aq)". */
const STATES: Record<string, string> = {
  g: 'gas', l: 'liquid', s: 'solid', aq: 'aqueous', cr: 'crystal', gas: 'gas', liquid: 'liquid', solid: 'solid', aqueous: 'aqueous',
};
/** A subscript the import could not write in Unicode, "_(...)" (src/core/importers/pdfText.ts), and a limit's. */
const SCRIPT = /_\(((?:[^()]|\([^()]*\))*)\)/gu;
const LIMIT = /\blim\s*_\(\s*([a-zA-Z])\s*→\s*((?:[^()]|\([^()]*\))*)\)/gu;

/**
 * A "_(...)" subscript in words: its digits join the formula and its state is said ("H_(2(g))" "H2 gas",
 * "NaOH_((aq))" "NaOH aqueous"); letters are said "sub" ("K_(eq)" "K sub eq", "t_(1/2)" "t sub one half").
 */
function scriptWords(inner: string): string {
  const t = inner.trim();
  const state = /^(\d*)\s*\((g|l|s|aq|cr|gas|liquid|solid|aqueous)\)$/.exec(t);
  if (state) return `${state[1]} ${STATES[state[2]!]} `;
  if (/^\d+([A-Z]|$)/.test(t)) return t; // the rest of a formula ("Fe_(3O4)")
  return ` sub ${t === '1/2' ? 'one half' : t} `;
}

/**
 * A slash between numbers is said "over" for a fraction ("125/343", "14π/3", "1/x") and "divided by" for a quantity in
 * brackets ("x/(x + 2)"); between letters it is left for "per" (units: "m/s").
 */
function slashWords(match: string, left: string, right: string): string {
  if (/^[A-Za-z]$/.test(left) && /^[A-Za-z]$/.test(right)) return match;
  return `${left} ${left === ')' || right === '(' ? 'divided by' : 'over'} `;
}

const UNIT_WORD =
  /^(?:(?:kilo|centi|milli|micro|nano)?(?:meter|metre|gram|liter|litre|second|joule|watt|newton|volt|ampere|amp|mole|coulomb|pascal|calorie)s?|minutes?|hours?|days?|weeks?|years?|miles?|feet|foot|inch(?:es)?|gallons?|pounds?|ohms?|kelvin|hertz|Celsius|Fahrenheit|degrees?)$/i;
const UNIT_SYMBOL = /^(?:m|s|km|kg|g|mg|L|mL|mol|J|kJ|K|N|W|kW|V|A|C|h|hr|min|cm|mm|nm|[µμ][mgs]|Hz|Pa|kPa|atm|lb|ft|mi|yr)$/;

/**
 * A slash between short words: units are "per" ("m/s"), the same abbreviation twice a range ("DC/DC" "DC to DC"), two
 * names a pair ("UV/Vis", "Oil/Gas"), and variables a ratio ("x/y" "x over y", "mg/Q" "mg over Q").
 */
function shortSlash(_match: string, left: string, right: string): string {
  if (UNIT_SYMBOL.test(left) && UNIT_SYMBOL.test(right)) return `${left} per ${right}`;
  if (/^[A-Z]{2,}$/.test(left) && /^[A-Z]{2,}$/.test(right)) return left === right ? `${left} to ${right}` : `${left} ${right}`;
  if (/^[A-Z][a-z]{2,}$/.test(left) || /^[A-Z][a-z]{2,}$/.test(right)) return `${left} ${right}`;
  return `${left} over ${right}`;
}
const QUANTITY_WORD = /^(?:work|force|power|mass|energy|distance|time|velocity|speed|volume|area|density|pressure|charge|momentum|acceleration|displacement|length|weight)$/i;

/**
 * A slash between words: units are "per" ("meters/second"), a ratio of two quantities or variables is "over"
 * ("Force/mass", "m2/m1"), and two names or alternatives are said as a pair, without the slash ("CRISPR/Cas9",
 * "true/false").
 */
function wordSlash(_match: string, left: string, right: string): string {
  const unit = (w: string) => UNIT_WORD.test(w) || UNIT_SYMBOL.test(w);
  if (unit(left) && unit(right)) return `${left} per ${right}`;
  const variable = (w: string) => /^[A-Za-z]\d+$/.test(w);
  const quantity = (w: string) => QUANTITY_WORD.test(w) || /^(?:sin|cos|tan|sec|csc|cot)[a-z]$/.test(w);
  if ((variable(left) && variable(right)) || (quantity(left) && (quantity(right) || /^surface$/i.test(right)))) return `${left} over ${right}`;
  return `${left} ${right}`;
}

/** Symbol words, applied after superscripts and subscripts. Longer and more specific ones first. */
const WORDS: Array<[RegExp, string | ((...groups: string[]) => string)]> = [
  // Some sets write the degree sign as the ordinal sign: "20ºC".
  [/[°º]\s?C\b/gu, ' degrees Celsius'],
  [/[°º]\s?F\b/gu, ' degrees Fahrenheit'],
  [/[°º]/gu, ' degrees'],
  // A minus sign right before a root is its sign, as DOE's guides say it: "cos θ = −√3/2" is "cos theta equals the
  // negative square root of 3 over 2".
  [/(^|[\s(=])[−–]√/gu, '$1the negative square root of '],
  // A root multiplied by what is written right before it: "−2√5" is "negative 2 times the square root of 5".
  [/(?<=[\w)²³])√/gu, ' times the square root of '],
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
  // An antibonding orbital is "sigma star"; an asterisk after a word is a footnote mark ("a fungus*").
  [/(?<=\b(?:sigma|pi)\s?)\*/gu, ' star '],
  [/(?<=[A-Za-z]{2})\*(?=$|[\s.,;:?!])/gu, ''],
  [/<pause>/giu, ', '],
  // An x between numbers is a times sign: "1.6 x 10⁻¹⁹" is "1.6 times 10 to the power of negative 19".
  [/(?<=[\d)]|\bpi) x (?=[\d(]|pi\b)/gu, ' times '],
  // The cell cycle's checkpoints are named by a pair of phases: "G1/S" is "G1 S", not "G1 over S".
  [/\b(G[012]|S|M)\/(G[012]|S|M)\b/gu, '$1 $2'],
  [/([\d)]|\b(?:pi|e|squared|cubed)|(?<![A-Za-z_-])[A-Za-z])\s*\/\s*(?=([\d(]|(?:pi|e)\b|[A-Za-z](?![\w-])))/gu, slashWords],
  [/\band\/or\b/gu, 'and or'],
  [/\bK\/T\b/gu, 'K T'], // the Cretaceous–Tertiary boundary (said a word at a time, so "boundary" is not in sight)
  [/(?<![\w/])([a-zA-Zµμ]{1,3})\/([a-zA-Z]{1,3})(?![\w/])/gu, shortSlash],
  [/(?<![\w/])([A-Za-z][\w'’-]*)\/([A-Za-z][\w'’-]*)(?![\w/])/gu, wordSlash],
  [/=/gu, ' equals '],
  [/<(?!=)/gu, ' less than '],
  [/>/gu, ' greater than '],
  [/(?<=\d)\s?[–—](?=\d)/gu, ' to '],
  // A plain hyphen between two numbers is a range ("5-10%", "2008-2017"), not three ("a 30-60-90 triangle").
  [/(?<![\w.,-])(\d+(?:,\d{3})*(?:\.\d+)?)-(\d+(?:,\d{3})*(?:\.\d+)?)(?![\w-]|[.,]\d)/gu, '$1 to $2'],
  [/(^|[\s(=])[−–](?=[\d.a-zA-Z(√π])/gu, '$1negative '],
  [/[−–]/gu, ' minus '],
  [/\+/gu, ' plus '],
  // f(x) "f of x", V(r) "V of r", g'(2) "g prime of 2".
  [/(?<![A-Za-z])([A-Za-z])(['’]?)\(([^()\s]{1,8})\)/gu, (_m: string, f: string, prime: string, x: string) => `${f}${prime ? ' prime' : ''} of ${x}`],
  // A function of a function, "f(g(x))": "f of g of x".
  [/(?<![A-Za-z])([fgh])\(([fgh] of [^()\s]{1,8})\)/gu, '$1 of $2'],
  // A plain hyphen before a number at the start of a word is a minus sign: "-10", "(-8, 6)", "f of -1".
  [/(^|[\s(=,:;])-(?=\.?\d)/gu, '$1negative '],
  // A factorial follows a number, a single letter or a bracket ("25!", "n!", "(n + 1)!"); "snow!" is an exclamation.
  [/(?<=[\d)]|(?<![A-Za-z])[A-Za-z])!/gu, ' factorial '],
  // An initial stuck to the word after it: "E.coli" is "E. coli".
  [/\b([A-Z])\.(?=[a-z]{3,})/gu, '$1. '],
  [/[|_]/gu, ' '],
  [/[[\]{}]/gu, ' '],
];

const ROOTS: Record<string, string> = { '³': 'cube', '⁴': 'fourth', '⁵': 'fifth', '⁶': 'sixth', '⁷': 'seventh', '⁸': 'eighth', '⁹': 'ninth' };

/** A piece of question text in words a voice can say. */
export function spokenText(text: string): string {
  let s = text
    // A statement's number written against its first word ("2)They have"), and a plural in brackets ("capacitor(s)").
    .replace(/^(\d{1,2}\))(?=\p{L})/u, '$1 ')
    .replace(/(?<=[a-z]{3})\((e?s)\)/g, '$1')
    // A derivative, which the import writes as a fraction ("dy/(dx)"): "d y over d x".
    .replace(/(?<![A-Za-z])d([A-Za-zθ])\s*\/\s*\(?d([A-Za-zθ])\)?(?![A-Za-z])/gu, ' d $1 over d $2 ')
    // A function named in full, as in "cosine(x)": "cosine of x".
    .replace(/\b(sine|cosine|tangent|secant|cosecant|cotangent)\(([^()\s]{1,8})\)/g, '$1 of $2');
  s = s.replace(LIMIT, ' the limit as $1 approaches $2 ').replace(SCRIPT, (_m, inner: string) => scriptWords(inner));
  // A logarithm's base: "log₂ 8" is "log base 2 of 8", not "log 2 8".
  s = s.replace(/\blog([₀₁₂₃₄₅₆₇₈₉]+)\s*/gu, (_m, base: string) => `log base ${[...base].map((ch) => SUB[ch]).join('')} of `);
  // A root's index: "⁴√81" is "the fourth root of 81".
  s = s.replace(/(?<![\w)])([³⁴⁵⁶⁷⁸⁹])√/gu, (_m, n: string) => ` the ${ROOTS[n]} root of `);
  // A mass number before an element symbol is said after it, as for "H-1": "¹H-NMR" is "H 1 NMR".
  s = s.replace(/(?<![\w)⁰¹²³⁴⁵⁶⁷⁸⁹])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)([A-Z][a-z]?)(?![a-z])-?/gu, (_m, mass: string, symbol: string) => `${symbol} ${[...mass].map((ch) => SUPER[ch]).join('')} `);
  s = s.replace(SUPER_RUN, (run, offset: number, all: string) => superscript(run, all.slice(0, offset)));
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
    .replace(/\b(alpha|beta|gamma|delta|sigma|omega|lambda|theta|kappa|epsilon|mu|pi|phi) -(?=[A-Za-z])/g, '$1-') // "α-Defensin"
    .trim();
}

/** How a number ends, and how one starts (π and e are numbers too; a minus sign starts one only joined to it). */
const NUMBER_END = /(?:[\d)π²³]|\bpi|\be)$/u;
const NUMBER_START = /^(?:[\d(π]|[−–](?=\d)|pi\b|e\b)/u;
/** An answer choice's letter at the start of its line ("X) x − 2"): its bracket does not end a number. */
const CHOICE_LABEL = /(?:^|\n)[WXYZ]\)$/;

/**
 * A word said by what is around it, as the text is said a word at a time: an "x" between numbers is a times sign
 * ("1.6 x 10⁻¹⁹"), and a slash on its own after a number ("(x + 1)² / 16") is "over", or "divided by" with a
 * quantity in brackets. Null for any other word.
 */
function wordInContext(word: string, before: string, after: string): string | null {
  const b = before.trimEnd();
  const a = after.trimStart();
  if (word === 'x' && NUMBER_END.test(b) && !CHOICE_LABEL.test(b) && NUMBER_START.test(a)) return 'times';
  // A minus sign said before a bracket on its own: "y = −(25 − x²)" is "y equals negative open parenthesis ...".
  if (/^[−–]$/.test(word) && after.startsWith('(')) return /(?:^|[\s(=])$/.test(before) ? 'negative' : 'minus';
  // A plain hyphen standing alone: between two terms it is "minus" ("0.99 - 0.0099"); before a number it is a minus
  // sign ("( - 8"); between a name and a number it joins them ("Uranium - 238", said "Uranium 238").
  // Variables are lowercase letters: "U- 235" and "(S)- 2-bromobutane" are not subtractions.
  const operandBefore = /(?:^|\s)(?:[\d.,]+|\(?[\d.]*[a-z]|[\d.]*[a-z]?\))$/.test(b);
  const operandAfter = /^(?:[\d.(]|[a-z](?![A-Za-z]))/.test(a);
  if (word === '-' && /^[\d.]/.test(a) && /\b[A-Z][a-z]{2,}$/.test(b)) return '';
  // An answer choice that is two numbers is a range: "W) 0.1 - 0.4" is "0.1 to 0.4".
  if (word === '-' && /(?:^|\n)[WXYZ]\)\s*[\d.,]+$/.test(b) && /^[\d.,]+\s*(?:\n|$)/.test(a)) return 'to';
  if (word === '-' && operandBefore && operandAfter) return 'minus';
  if (word === '-' && /(?:^|[(=,:;])$/.test(b) && /^[\d.]/.test(a)) return 'negative';
  // A hyphen ending a term, with the next term after a space: "3- 2i" is "3 minus 2i"; between two numbers it is a
  // range ("4500- 7000 feet").
  const ending = /^(-?\(?(?:[\d.,]+|[\d.]*[a-z]|[\d.]*[a-z]?\)))-$/.exec(word);
  if (ending && operandAfter) {
    const range = /^\(?[\d.,]+$/.test(ending[1]!) && /^[\d.,]+(?![\w(])/.test(a);
    return `${spokenText(ending[1]!)} ${range ? 'to' : 'minus'}`;
  }
  // A slash left between two names when a guide reads the first ("CRISPR[crisper]/Cas9"): the pair, without it.
  if (/^\/[A-Za-z]/.test(word) && /[A-Za-z]{2,}$/.test(b)) return spokenText(word.slice(1));
  if (word.startsWith('/') && (NUMBER_END.test(b) || /(?<![A-Za-z])[A-Za-z]$/.test(b))) {
    const rest = word.slice(1);
    const next = rest || a;
    if (!NUMBER_START.test(next) && !/^[A-Za-z](?![\w-])/.test(next)) return null;
    const bracket = /\)$/.test(b) || next.startsWith('(');
    return `${bracket ? 'divided by' : 'over'} ${rest ? spokenText(rest) : ''}`.trim();
  }
  return null;
}

/* ---------------- brackets in math ---------------- */

/**
 * How a bracket in math is said. Science Bowl reads the brackets of a group ("open parenthesis x plus 5 close
 * parenthesis squared") and says "times" between two groups multiplied, as DOE's own reading guides do. Otherwise
 * "(6 + 3i)(4 + i)" would be heard as "6 plus 3i 4 plus i".
 */
interface BracketMark {
  /** Said "open parenthesis" or "close parenthesis"; otherwise only `before` is said ("(−2)(−5)" "negative 2 times negative 5"). */
  said: boolean;
  open: boolean;
  /** Said before an opening bracket: "times" for a product ("3(x + 1)"), "of" after a function ("f(x + 1)"). */
  before: '' | 'times' | 'of';
}

/** A function before a bracket: "f(x + 1)" is "f of ...", "log₂(x + 5)" "log base 2 of ...". */
const FUNCTION_BEFORE = /(?:(?<![A-Za-z])[fghFGHP]['’]?|\b(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp)[₀-₉]*)\s*$/u;
/** What multiplies a bracket written right after it: a number, a variable, a power ("3(x + 1)", "x²(x − 1)"). */
const MULTIPLIER = /[\dA-Za-z²³¹⁰⁴⁵⁶⁷⁸⁹]$/u;
/** A power right after a closing bracket: "(x + 2)⁵", "(−3)²", "(a + b)^(n)". */
const POWER_AFTER = /^[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ˣⁿ^]/u;
/**
 * An operator between two terms ("x + 1", "4x − x²", "1/3", "x-3"), not a sign in front of one ("−3"), nor the
 * hyphens of a spelling ("K-A-T").
 */
const BETWEEN = /[^\s+−–×÷=<>≤≥±·*/(-]\s*(?:[+−–×÷=<>≤≥±·*/]|\s-|-\s|(?<=[\w)²³])-(?=\d))/u;
/**
 * Brackets that are not math: a chemical group ("Ca(OH)₂"), a state ("(aq)"), words ("(read as ...)"), and a value
 * given in passing ("from air (n = 1.00) to the cornea").
 */
const FORMULA_GROUP = /^(?:[A-Z][a-z]?[\d₀-₉]*)+$/u;
const STATE_GROUP = /^(?:s|l|g|aq|cr|gas|liquid|solid|aqueous)$/;
const WORDS_INSIDE = /(?!(?:sin|cos|tan|sec|csc|cot|log|sinh|cosh|tanh|arcsin|arccos|arctan)\b)\b[A-Za-z]{4,}/;
const VALUE_GIVEN = /^\s*\w[\w₀-₉]*\s*=\s*[−–-]?[\d.]+\s*[A-Za-z]{0,3}\s*$/u;

/**
 * The brackets of the math in `text` and how each is said, by its place in the text. Brackets inside `skip` (the
 * math a reading guide reads) are left to the guide.
 */
function mathBrackets(text: string, skip: ReadonlyArray<{ start: number; end: number }>): Map<number, BracketMark> {
  const marks = new Map<number, BracketMark>();
  const skipped = (i: number) => skip.some((r) => i >= r.start && i < r.end);
  const pairs: Array<[number, number]> = [];
  let open: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') open = [];
    else if (text[i] === '(') open.push(i);
    else if (text[i] === ')' && open.length) pairs.push([open.pop()!, i]);
  }
  // The import's notation for a sub- or superscript ("x^(2)", "H_(2(g))"), and everything inside it.
  const scripts = pairs.filter(([start]) => /[_^]/.test(text[start - 1] ?? ''));
  for (const [start, end] of pairs) {
    if (skipped(start) || skipped(end) || scripts.some(([s, e]) => start >= s && end <= e)) continue;
    let inner = text.slice(start + 1, end);
    while (/\([^()]*\)/.test(inner)) inner = inner.replace(/\([^()]*\)/g, '1'); // what is inside at the top level
    const line = text.slice(text.lastIndexOf('\n', start - 1) + 1, start);
    // A point or a list ("(3, −5)"), a chemical group, a state, words, a value given in passing.
    if (inner.includes(',') || FORMULA_GROUP.test(inner) || STATE_GROUP.test(inner) || WORDS_INSIDE.test(inner) || VALUE_GIVEN.test(inner)) continue;
    // A choice's letter or a statement's number before the bracket ("W) (x − 5)³", "1) (x + 1)²") multiplies nothing.
    const label = /^[WXYZ]\)\s*$|(?:^|[:;]\s?)\d{1,2}\)\s*$/.test(line);
    const said = BETWEEN.test(inner) || (POWER_AFTER.test(text.slice(end + 1)) && /\S/.test(inner));
    let before: BracketMark['before'] = '';
    if (!label && FUNCTION_BEFORE.test(line)) before = 'of';
    else if (!label && (/\)$/.test(line) || MULTIPLIER.test(line))) before = 'times';
    if (said) {
      marks.set(start, { said: true, open: true, before });
      marks.set(end, { said: true, open: false, before: '' });
    } else if (before === 'times' && /[\d)²³¹⁰⁴⁵⁶⁷⁸⁹]$/u.test(line)) {
      // A bracket that needs no words, multiplied by a number or a bracket before it: "(−2)(−5)", "2(abc)".
      marks.set(start, { said: false, open: true, before });
    }
  }
  return marks;
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
  return { pause: (mark !== undefined && !initial) || last, stop: (mark !== undefined && /[.?!\n]/.test(mark) && !initial) || last, lineEnd: after === '\n' || last };
}

const MATHY = /[\d=+×÷^√∛π<>≤≥|²³¹⁰⁴⁵⁶⁷⁸⁹⁻⁺ˣ₀-₉θ∆Δ−–/·*()]|[^\x00-\x7F]/u;
const FUNCTION_WORD = /^\(?(sin|cos|tan|sec|csc|cot|log|ln|exp|lim)\b/i;
/** An operator on its own, and the words a reading guide uses for it. */
const OPERATORS: Array<[RegExp, RegExp]> = [
  [/^[=≈≠]$/u, /equal|approximately/i],
  [/^\+$/u, /plus|add|and/i],
  [/^[−–-]$/u, /minus|negative|subtract/i],
  [/^[×*·]$/u, /times|multipl|by|star/i],
  [/^[÷/]$/u, /over|divided|per/i],
  [/^[→⇌↔⇄]$/u, /yield|to\b|arrow|equilibrium|produc|gives|form/i],
  [/^[<>≤≥]$/u, /less|greater|than|equal/i],
  [/^\^$/u, /power|raised/i],
  [/^±$/u, /plus or minus/i],
];

/** A genotype ("AaBb", "bb"), and a guide that says its letters' sizes ("big A, little a"), which reads it whole. */
const GENOTYPE = /^(?:([a-z])\1)+$/i;
const SIZES = /\b(big|little|small|capital|upper ?case|lower ?case)\b/i;
/**
 * A guide that only names an operator: "[yields]" after "→", or "[in equilibrium with]" where the arrow was lost from
 * the PDF. It reads that symbol, not the math before it ("3 Zn + Fe₂O₃ → [yields] 2Fe").
 */
const OPERATOR_GUIDE = /^(?:is )?(?:in equilibrium with|yields?|produces?|reacts? to (?:form|produce|yield)|forms?|gives?)$/i;
/** Notes to the moderator inside a guide ("A-R-4-s-2-short pause-3-d-9", "He 2 [pause] 2 plus"): a pause. */
const GUIDE_PAUSE = /-?\[?(?<!<)\b(?:(?:short|long|brief|slight) )?pause\b(?!>)\]?-?/gi;
/** A factorial at the end of a word ("25!", "n!", "(n + 1)!"), not an exclamation ("snow!"). */
const FACTORIAL = /(?:\d|\)|(?<![A-Za-z])[A-Za-z])!$/;
/** Short words that are not a product of variables. */
const SHORT_WORDS = /^(?:an|as|at|be|by|do|go|he|if|in|is|it|me|my|no|of|on|or|so|to|up|us|we|and|are|but|can|for|has|its|may|not|the|was|who|how|why|all|any)$/;
const NUMBER_WORDS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };
/** Letters and digits only, with numbers in words as digits: "He-two" and "H-E-2" are both "he2". */
function squashed(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(?:one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => NUMBER_WORDS[w]!)
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Whether a word before a reading guide is part of what the guide reads (`first`: the word right before it).
 * Numbers, symbols and single letters are; an operator is if the guide says it; a word is if the guide says it,
 * and so is a code in capitals right before the guide ("AAA [A, A, A]").
 */
function readByGuide(raw: string, guide: string, first: boolean): boolean {
  // A comma ends the math a guide reads, unless the guide reads across one ("Given f(x) = tanx/secx, find f′(2π/3)
  // [Given f of x equals tangent of x over secant of x, find f prime of 2 pi over 3]"); a matrix written in rows,
  // "(3, 1; 5, 2) [row 1: 3, 1; row 2: 5, 2]", is read across its commas and semicolons.
  const matrix = /[,;]$/.test(raw) && /\b(?:matri(?:x|ces)|rows?)\b/i.test(guide);
  const token = (raw.endsWith(',') && guide.includes(',')) || matrix ? raw.slice(0, -1) : raw;
  if (/[:;,.?]$/.test(token) || (/!$/.test(token) && !(FACTORIAL.test(token) && /factorial/i.test(guide))) || /^[WXYZ]\)$/.test(token)) return false;
  if (GENOTYPE.test(token) && SIZES.test(guide)) return true;
  const operator = OPERATORS.find(([op]) => op.test(token));
  if (operator) return operator[1].test(guide);
  if (/^[A-Za-z]$/.test(token) || FUNCTION_WORD.test(token)) return true;
  // A product of variables ("ab" for "a times b"): each of its letters is in the guide on its own.
  if (/^[a-z]{2,3}$/.test(token) && !SHORT_WORDS.test(token) && [...token].every((c) => new RegExp(`(^|[^A-Za-z])${c}([^A-Za-z]|$)`).test(guide))) return true;
  // A formula spelled in words ("He-two" before [H-E-2]).
  if (/^[A-Z][a-z]?(?:-[A-Za-z0-9]+)+$/.test(token) && squashed(guide).startsWith(squashed(token))) return true;
  const word = /^[A-Za-z'’]{2,}$/.test(token);
  if (word || /^[A-Za-z0-9-]{2,}$/.test(token)) {
    if (new RegExp(`(^|[^A-Za-z])${token.replace(/[^A-Za-z0-9]/g, '')}([^A-Za-z]|$)`, 'i').test(guide)) return true;
    if (first && /[A-Z]/.test(token.slice(1)) && token.length <= 8) return true;
    if (word) return false;
  }
  return MATHY.test(token);
}

/**
 * DOE's guides, in order: in square brackets, and in a few sets written out, "(read as the quantity 1 plus i to the
 * twelfth)", "Fibrinogen (read as; fy-BRI-noh-jehn)", or "Read as: ..." to the end of the line. Each match's group 1 is
 * what the guide says; the separators of a written-out reading ("negative - open parenthesis - k") are pauses.
 */
function guidesIn(text: string): RegExpExecArray[] {
  const found = [
    ...text.matchAll(/\[([^\]\n]*)\]/g),
    ...text.matchAll(/\([Rr]ead as[:;]?\s*((?:[^()\n]|\([^()\n]*\))*)\)/g),
    ...text.matchAll(/\(?\b[Rr]ead as:\s*([^\n]*?)(?=\??$)/gm),
  ].sort((a, b) => a.index - b.index);
  const guides: RegExpExecArray[] = [];
  for (const m of found) {
    const last = guides[guides.length - 1];
    if (last && m.index < last.index + last[0].length) continue; // a guide inside one already found
    if (!m[0].startsWith('[')) m[1] = m[1]!.replace(/\s+-\s+/g, ', ');
    guides.push(m);
  }
  return guides;
}

/**
 * The reading's text as pieces to say, in order: words (with symbols in words), reading guides in place of their
 * math, and nothing for pronunciation guides. Each piece keeps its place in the text, for its time on the timeline.
 */
export function speechPieces(text: string): Piece[] {
  // Brackets first: their kind decides what is said around them.
  const replaced: Array<{ start: number; end: number; say: string }> = [];
  for (const m of guidesIn(text)) {
    const kind = bracketKind(m[1]!);
    if (kind === 'notation') continue;
    const end = m.index + m[0].length;
    if (kind === 'pronunciation') {
      // Skipped, but a note to pause ("He 2 [pause] 2 plus") is a pause.
      replaced.push({ start: m.index, end, say: /^(?:(?:short|long|brief|slight) )?pause$/i.test(m[1]!.trim()) ? ',' : '' });
      continue;
    }
    // A reading guide: back over what it reads (in the same line), which it replaces.
    const guide = m[1]!.trim();
    let start = m.index;
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    const before = text.slice(lineStart, m.index);
    if (OPERATOR_GUIDE.test(guide)) {
      // It reads the operator right before it, if that is the one it names, and nothing more.
      const last = /\S+(?=\s*$)/.exec(before);
      if (last && OPERATORS.some(([op, says]) => op.test(last[0]) && says.test(guide))) start = lineStart + last.index;
    } else {
      // Text joined to the bracket ("4ˣ⁺³[...]") is part of the math.
      const joined = /\S+$/.exec(before);
      if (joined && !/[:;,.?!]$/.test(joined[0])) start = lineStart + joined.index;
      const words = [...text.slice(lineStart, start).matchAll(/\S+/g)];
      for (let i = words.length - 1; i >= 0; i--) {
        const word = words[i]![0];
        // A statement's number ("1) H-two [H-2]; 2) ...") is not part of the math.
        if (/^\d{1,2}\)$/.test(word) && (i === 0 || /[:;]$/.test(words[i - 1]![0]))) break;
        if (!readByGuide(word, guide, start === m.index && i === words.length - 1)) break;
        start = lineStart + words[i]!.index;
        if (GENOTYPE.test(word) && SIZES.test(guide)) break; // a genotype is all its guide reads ("a bb [little b little b]")
      }
    }
    const previous = replaced[replaced.length - 1];
    if (previous && previous.end > start) start = previous.end;
    replaced.push({ start, end, say: spokenText(guide.replace(GUIDE_PAUSE, ', ')) });
  }
  const brackets = mathBrackets(text, replaced);

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
  /** Part of a word, said by itself: "3i" of "3i)(4". */
  const part = (start: number, end: number, before: string) => {
    if (end <= start) return;
    // A slash before a bracket that is said is said with it ("2/(n + 6)" "2 divided by open parenthesis").
    if (end - start > 1 && text[end - 1] === '/' && brackets.get(end)?.said) {
      part(start, end - 1, before);
      part(end - 1, end, '');
      return;
    }
    const said = wordInContext(text.slice(start, end), text.slice(0, start), text.slice(end)) ?? spokenText(text.slice(start, end));
    add(start, end, before && said ? `${before} ${said}` : said);
  };
  const words = (from: number, to: number) => {
    for (const w of text.slice(from, to).matchAll(/\S+/g)) {
      const start = from + w.index;
      const end = start + w[0].length;
      // A choice letter at the start of a line ("W) ...") is said as its own short beat.
      const choice = /^([WXYZ])\)$/.exec(w[0]);
      if (choice && (start === 0 || text[start - 1] === '\n')) {
        add(start, end, `${choice[1]},`);
        continue;
      }
      // Brackets in math are said on their own ("3i)(4" "3i close parenthesis times open parenthesis 4").
      let rest = start;
      let before = '';
      for (let i = start; i < end; i++) {
        const mark = brackets.get(i);
        if (!mark) continue;
        part(rest, i, before);
        before = '';
        if (mark.said) {
          // "log₂(x + 5)" "log base 2 of open parenthesis": the "of" is said once.
          const of = mark.before === 'of' && /\bof$/.test(pieces[pieces.length - 1]?.say ?? '');
          add(i, i + 1, `${mark.before && !of ? `${mark.before} ` : ''}${mark.open ? 'open' : 'close'} parenthesis`);
          rest = i + 1;
        } else {
          rest = i;
          before = mark.before;
        }
      }
      part(rest, end, before);
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
  const pieces = speechPieces(text).filter((p) => p.say);
  const choice = (p: Piece | undefined) => p !== undefined && /^[WXYZ],$/.test(p.say);
  let lineStart = 0;
  return pieces
    .map((p, i) => {
      const first = pieces[lineStart];
      if (p.lineEnd) lineStart = i + 1;
      if (!p.lineEnd || /[.?!]$/.test(p.say)) return p.say;
      // A stem the answer choices complete ("Most of the energy is lost as:") pauses before them, without the fall
      // of a full stop; any other line, an answer choice included, ends as a sentence.
      const completed = !choice(first) && choice(pieces[i + 1]);
      return `${p.say.replace(/[,;:]$/, '')}${completed ? ':' : '.'}`;
    })
    .join(' ');
}

/* ---------------- recordings of the questions ---------------- */

/**
 * What a recorded voice says for a question: the reading's text (its stem, then a line per answer choice) as one
 * passage. scripts/voice records it, and the site and the server name the recording by it (audioKey).
 */
export function spokenFor(question: { stem: string; choices?: Record<'W' | 'X' | 'Y' | 'Z', string> }): string {
  return spokenQuestion(buildReading(question).text);
}

/**
 * Rebound's recorded voice (scripts/voice): Kokoro's af_heart, recorded on a computer and published with
 * scripts/voice/publish.py. It is part of every recording's name, so another voice is a new set of recordings.
 */
export const RECORDED_VOICE = 'kokoro:af_heart';

/** The line played to try the voice ("Play a sample"), recorded and published with the questions. */
export const VOICE_SAMPLE = 'Toss-up 1. Biology. Short answer. What organelle makes most of the energy a cell uses?';

/** A recording's name: the voice and the words, hashed (40 hex characters), so the same words in the same voice are one recording. */
export async function audioKey(voice: string, spoken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${voice}|${spoken}`));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 40);
}

/* ---------------- reading speeds read aloud ---------------- */

/**
 * Rebound's recorded voice says the library at this many words a minute, counted as the site counts reading speed
 * (6 characters a word of the text on screen): 76 hours of recordings for 4.1 million characters. The reading speed
 * read aloud sets how fast the recordings play.
 */
export const NATURAL_WPM = 150;
/** Recordings play at most this much slower or faster than the voice's own pace (the pitch is kept). */
export const MIN_PLAYBACK_RATE = 0.75;
export const MAX_PLAYBACK_RATE = 1.6;
/**
 * Read aloud: the reading speeds the recordings can play at (120 is 0.8 times the voice's pace, 240 is 1.6 times).
 * Both are whole tens, as the speed inputs step by 10 from their lowest.
 */
export const MIN_SPEECH_WPM = 120;
export const MAX_SPEECH_WPM = 240;

/** How fast recordings play for a reading speed of `wpm` (pitch is kept). */
export function playbackRate(wpm: number): number {
  return Math.round(Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, wpm / NATURAL_WPM)) * 100) / 100;
}
