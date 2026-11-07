/**
 * Reading numeric answers: integers, decimals, fractions, mixed numbers, scientific
 * notation, and exact expressions with π and square roots ("2π", "3√2/2"), plus units.
 */
import { toPlain } from './normalize';

export type NumberKind = 'integer' | 'decimal' | 'fraction' | 'mixed' | 'scientific' | 'expression';

export interface ParsedNumber {
  value: number;
  kind: NumberKind;
  /** A fraction that is not in lowest terms (Rule A-2 a ii), e.g. 2/4. */
  unsimplified: boolean;
  /** Canonical unit, e.g. "m/s", or null when no unit was given. */
  unit: string | null;
  /** True when the unit text was recognised. */
  unitKnown: boolean;
}

const UNIT_ALIASES: Array<[RegExp, string]> = [
  [/^(meters?|metres?|m) per (seconds?|s) squared$/, 'm/s^2'],
  [/^m\/s\^?2$/, 'm/s^2'],
  [/^(meters?|metres?|m) per (seconds?|s)$|^m\/s$|^mps$/, 'm/s'],
  [/^(kilometers?|kilometres?|km) per (hours?|hr|h)$|^km\/hr?$|^kph$/, 'km/h'],
  [/^(kilometers?|kilometres?|km) per (seconds?|s)$|^km\/s$/, 'km/s'],
  [/^(miles?|mi) per (hours?|hr|h)$|^mph$|^mi\/hr?$/, 'mi/h'],
  [/^(grams?|g) per (cubic centimeters?|cm\^?3|milliliters?|ml)$|^g\/cm\^?3$|^g\/ml$/, 'g/cm^3'],
  [/^(kilograms?|kg) per (cubic meters?|m\^?3)$|^kg\/m\^?3$/, 'kg/m^3'],
  [/^(joules?|j) per (moles?|mol)$|^j\/mol$/, 'J/mol'],
  [/^(kilojoules?|kj) per (moles?|mol)$|^kj\/mol$/, 'kJ/mol'],
  [/^(newton ?meters?|n ?m|n\*m|joules? \(torque\))$/, 'N*m'],
  [/^(grams?|g) per (moles?|mol)$|^g\/mol$/, 'g/mol'],
  [/^(moles?|mol) per (liters?|litres?|l)$|^mol\/l$|^molar$|^m$/, 'M'],
  [/^(square meters?|meters? squared|m\^?2)$/, 'm^2'],
  [/^(cubic meters?|meters? cubed|m\^?3)$/, 'm^3'],
  [/^(square centimeters?|cm\^?2)$/, 'cm^2'],
  [/^(cubic centimeters?|cm\^?3|cc)$/, 'cm^3'],
  [/^(meters?|metres?)$/, 'm'],
  [/^(centimeters?|centimetres?|cm)$/, 'cm'],
  [/^(millimeters?|millimetres?|mm)$/, 'mm'],
  [/^(kilometers?|kilometres?|km)$/, 'km'],
  [/^(nanometers?|nanometres?|nm)$/, 'nm'],
  [/^(micrometers?|micrometres?|microns?|um|μm|µm)$/, 'um'],
  [/^(seconds?|secs?|s)$/, 's'],
  [/^(milliseconds?|ms)$/, 'ms'],
  [/^(minutes?|mins?)$/, 'min'],
  [/^(hours?|hrs?|h)$/, 'h'],
  [/^(days?)$/, 'day'],
  [/^(years?|yrs?)$/, 'yr'],
  [/^(kilograms?|kg)$/, 'kg'],
  [/^(grams?|g)$/, 'g'],
  [/^(milligrams?|mg)$/, 'mg'],
  [/^(newtons?|n)$/, 'N'],
  [/^(joules?|j)$/, 'J'],
  [/^(kilojoules?|kj)$/, 'kJ'],
  [/^(calories?|cal)$/, 'cal'],
  [/^(kilocalories?|kcal)$/, 'kcal'],
  [/^(electron ?volts?|ev)$/, 'eV'],
  [/^(watts?|w)$/, 'W'],
  [/^(kilowatts?|kw)$/, 'kW'],
  [/^(megawatts?|mw)$/, 'MW'],
  [/^(kilowatt ?hours?|kwh)$/, 'kWh'],
  [/^(volts?|v)$/, 'V'],
  [/^(amperes?|amps?|a)$/, 'A'],
  [/^(ohms?|ω|Ω)$/, 'ohm'],
  [/^(coulombs?|c)$/, 'C'],
  [/^(farads?|f)$/, 'F'],
  [/^(teslas?|t)$/, 'T'],
  [/^(hertz|hz)$/, 'Hz'],
  [/^(pascals?|pa)$/, 'Pa'],
  [/^(kilopascals?|kpa)$/, 'kPa'],
  [/^(atmospheres?|atm)$/, 'atm'],
  [/^(kelvins?|k)$/, 'K'],
  [/^(degrees? celsius|°c|degrees? c)$/, '°C'],
  [/^(degrees? fahrenheit|°f|degrees? f)$/, '°F'],
  [/^(degrees?|deg|°)$/, 'deg'],
  [/^(radians?|rad)$/, 'rad'],
  [/^(moles?|mol)$/, 'mol'],
  [/^(liters?|litres?|l)$/, 'L'],
  [/^(milliliters?|millilitres?|ml)$/, 'mL'],
  [/^(percent|%)$/, '%'],
  [/^(light ?years?|ly)$/, 'ly'],
  [/^(astronomical units?|au)$/, 'AU'],
  [/^(parsecs?|pc)$/, 'pc'],
  [/^(units?)$/, 'unit'],
];

/** Normalise a unit phrase to a canonical symbol, e.g. "meters per second" → "m/s". */
export function canonicalUnit(raw: string): { unit: string; known: boolean } {
  const u = raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
  for (const [pattern, canonical] of UNIT_ALIASES) {
    if (pattern.test(u)) return { unit: canonical, known: true };
  }
  return { unit: u.replace(/\s+/g, ''), known: false };
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/* ---------------- tiny expression parser ---------------- */

type Token = { type: 'num'; value: number } | { type: 'op'; value: string } | { type: 'pi' } | { type: 'sqrt' } | { type: 'paren'; value: '(' | ')' };

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') {
      i++;
      continue;
    }
    const num = /^(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?/.exec(src.slice(i));
    if (num) {
      tokens.push({ type: 'num', value: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    if (src.startsWith('pi', i)) {
      tokens.push({ type: 'pi' });
      i += 2;
      continue;
    }
    if (c === 'π') {
      tokens.push({ type: 'pi' });
      i++;
      continue;
    }
    if (src.startsWith('sqrt', i)) {
      tokens.push({ type: 'sqrt' });
      i += 4;
      continue;
    }
    if (src.startsWith('square root of', i)) {
      tokens.push({ type: 'sqrt' });
      i += 'square root of'.length;
      continue;
    }
    if (src.startsWith('root', i)) {
      tokens.push({ type: 'sqrt' });
      i += 4;
      continue;
    }
    if (c === '√') {
      tokens.push({ type: 'sqrt' });
      i++;
      continue;
    }
    if ('+-*/^'.includes(c)) {
      tokens.push({ type: 'op', value: c });
      i++;
      continue;
    }
    if (c === '(' || c === ')') {
      tokens.push({ type: 'paren', value: c });
      i++;
      continue;
    }
    return null;
  }
  return tokens;
}

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): number | null {
    const v = this.expr();
    if (v === null || this.i !== this.tokens.length) return null;
    return v;
  }

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }

  private expr(): number | null {
    let left = this.term();
    while (left !== null) {
      const t = this.peek();
      if (t?.type === 'op' && (t.value === '+' || t.value === '-')) {
        this.i++;
        const right = this.term();
        if (right === null) return null;
        left = t.value === '+' ? left + right : left - right;
      } else break;
    }
    return left;
  }

  private term(): number | null {
    let left = this.unary();
    while (left !== null) {
      const t = this.peek();
      if (t?.type === 'op' && (t.value === '*' || t.value === '/')) {
        this.i++;
        const right = this.unary();
        if (right === null) return null;
        left = t.value === '*' ? left * right : left / right;
      } else if (t && (t.type === 'num' || t.type === 'pi' || t.type === 'sqrt' || (t.type === 'paren' && t.value === '('))) {
        // Implicit multiplication: 2π, 3√2, 2(3)
        const right = this.unary();
        if (right === null) return null;
        left = left * right;
      } else break;
    }
    return left;
  }

  private unary(): number | null {
    const t = this.peek();
    if (t?.type === 'op' && (t.value === '-' || t.value === '+')) {
      this.i++;
      const v = this.unary();
      return v === null ? null : t.value === '-' ? -v : v;
    }
    return this.power();
  }

  private power(): number | null {
    const base = this.primary();
    if (base === null) return null;
    const t = this.peek();
    if (t?.type === 'op' && t.value === '^') {
      this.i++;
      const exp = this.unary();
      return exp === null ? null : Math.pow(base, exp);
    }
    return base;
  }

  private primary(): number | null {
    const t = this.peek();
    if (!t) return null;
    if (t.type === 'num') {
      this.i++;
      return t.value;
    }
    if (t.type === 'pi') {
      this.i++;
      return Math.PI;
    }
    if (t.type === 'sqrt') {
      this.i++;
      const v = this.power();
      return v === null || v < 0 ? null : Math.sqrt(v);
    }
    if (t.type === 'paren' && t.value === '(') {
      this.i++;
      const v = this.expr();
      const close = this.peek();
      if (v === null || close?.type !== 'paren' || close.value !== ')') return null;
      this.i++;
      return v;
    }
    return null;
  }
}

function evaluate(expression: string): number | null {
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) return null;
  const value = new Parser(tokens).parse();
  return value === null || !Number.isFinite(value) ? null : value;
}

/**
 * Read a numeric answer with an optional unit. Returns null when the text is not a number.
 * Leading phrases such as "x =" or "at x =" are ignored.
 */
export function parseNumber(input: string): ParsedNumber | null {
  let s = toPlain(input).toLowerCase().trim();
  s = s.replace(/^(at|about|approximately)\s+/, '');
  s = s.replace(/^[a-z]\s*=\s*/, '');
  s = s.replace(/^negative\s+/, '-');
  s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d{3})(?!\d)/g, '$1$2'); // 5,300 → 5300
  // Scientific notation written with x/×/* 10^n
  s = s.replace(/(\d)\s*(?:x|\*)\s*10\s*\^\s*\(?\s*([+-]?\d+)\s*\)?/g, '$1e$2');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return null;

  // Split off a trailing unit: the longest suffix of letters/units that is not part of the number.
  const m = /^([0-9.+\-*/^()πe√ ]|pi|sqrt|root|square root of)+/.exec(s);
  if (!m) return null;
  let numberPart = m[0].trim();
  let unitPart = s.slice(m[0].length).trim();
  // "e" at the end of the number part belongs to the unit (e.g. "5 eV" → number "5", unit "eV").
  if (/e$/.test(numberPart) && !/\de[+-]?\d/.test(numberPart.slice(-3))) {
    numberPart = numberPart.slice(0, -1).trim();
    unitPart = `e${unitPart}`;
  }
  if (!numberPart) return null;
  // Whatever follows the number must look like a unit, not more answer ("1 and 3", "2 or 5").
  if (unitPart && (/\s\d/.test(unitPart) || /\b(and|or)\b|[,;]/.test(unitPart) || unitPart.split(' ').length > 5)) return null;

  let kind: NumberKind;
  let unsimplified = false;
  let value: number | null;
  const mixed = /^([+-]?)(\d+) (\d+)\/(\d+)$/.exec(numberPart);
  const fraction = /^([+-]?)(\d+)\/(\d+)$/.exec(numberPart);
  if (/^[+-]?\d+$/.test(numberPart)) {
    kind = 'integer';
    value = Number(numberPart);
  } else if (/^[+-]?(\d+\.\d*|\.\d+)$/.test(numberPart)) {
    kind = 'decimal';
    value = Number(numberPart);
  } else if (/^[+-]?(\d+(\.\d*)?|\.\d+)e[+-]?\d+$/.test(numberPart)) {
    kind = 'scientific';
    value = Number(numberPart);
  } else if (mixed) {
    kind = 'mixed';
    const [, sign, whole, num, den] = mixed;
    if (Number(den) === 0) return null;
    value = (Number(whole) + Number(num) / Number(den)) * (sign === '-' ? -1 : 1);
    unsimplified = gcd(Number(num), Number(den)) > 1 || Number(num) >= Number(den);
  } else if (fraction) {
    kind = 'fraction';
    const [, sign, num, den] = fraction;
    if (Number(den) === 0) return null;
    value = (Number(num) / Number(den)) * (sign === '-' ? -1 : 1);
    unsimplified = gcd(Number(num), Number(den)) > 1 || Number(den) === 1;
  } else {
    kind = 'expression';
    value = evaluate(numberPart);
    unsimplified = hasUnsimplifiedRadical(numberPart);
  }
  if (value === null || !Number.isFinite(value)) return null;

  let unit: string | null = null;
  let unitKnown = true;
  if (unitPart) {
    const canonical = canonicalUnit(unitPart);
    unit = canonical.unit;
    unitKnown = canonical.known;
  }
  return { value, kind, unsimplified, unit, unitKnown };
}

/**
 * Radicals must be in simplest rationalised form (Rule A-2 a iv): no square factor
 * under the root (√8 → 2√2) and no root in a denominator (1/√2 → √2/2).
 */
function hasUnsimplifiedRadical(expression: string): boolean {
  if (/\/\s*\(?\s*(√|sqrt|root)/.test(expression)) return true;
  const radicands = [...expression.matchAll(/(?:√|sqrt|root)\s*\(?\s*(\d+)/g)].map((m) => Number(m[1]));
  return radicands.some((n) => {
    for (let k = 2; k * k <= n; k++) if (n % (k * k) === 0) return true;
    return false;
  });
}

export function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Read "1, 3, 2" or "1 and 3" style answers into a list of integers; null if not a list. */
export function parseIntegerList(input: string): number[] | null {
  const s = toPlain(input).toLowerCase().replace(/\bonly\b/g, '').trim();
  if (!/^\d+(\s*(,|;|and|&|\s)\s*\d+)+$/.test(s)) return null;
  return s.split(/\s*(?:,|;|and|&|\s)\s*/).filter(Boolean).map(Number);
}
