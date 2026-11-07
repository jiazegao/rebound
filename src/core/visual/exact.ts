/**
 * Exact answers in NSB's simplest form (Rule A-2): reduced fractions, simplified radicals with no
 * root in a denominator, and multiples of π. The answer checker compares these by value, so the
 * strings here are what the reader sees; any equal value in simplest form is accepted.
 */

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

/** A fraction in lowest terms with a positive denominator. */
export function reduce(n: number, d: number): [number, number] {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error(`reduce(${n}, ${d}): need integers and d ≠ 0`);
  const g = gcd(n, d) || 1;
  const sign = d < 0 ? -1 : 1;
  return [(sign * n) / g, (sign * d) / g];
}

/** "7/2", "-3/4" or "5" (a whole number when the denominator divides). */
export function fractionText(n: number, d = 1): string {
  const [a, b] = reduce(n, d);
  return b === 1 ? String(a) : `${a}/${b}`;
}

/** √n as k√m with m square-free: simplifyRoot(72) → [6, 2]; simplifyRoot(9) → [3, 1]. */
export function simplifyRoot(n: number): [number, number] {
  if (!Number.isInteger(n) || n < 0) throw new Error(`simplifyRoot(${n}): need a whole number`);
  let outside = 1;
  let inside = n;
  for (let f = 2; f * f <= inside; f++) {
    while (inside % (f * f) === 0) {
      inside /= f * f;
      outside *= f;
    }
  }
  return [outside, inside];
}

/**
 * (n/d)·√r in simplest form: "3√2", "√3/2", "5√7/3", "-2√5", or a fraction when r is a perfect
 * square. Only whole-number radicands; rationalize a root in a denominator before calling.
 */
export function radicalText(n: number, d: number, radicand: number): string {
  if (radicand === 0 || n === 0) return '0';
  const [out, inside] = simplifyRoot(radicand);
  const [a, b] = reduce(n * out, d);
  if (inside === 1) return fractionText(a, b);
  const sign = a < 0 ? '-' : '';
  const coef = Math.abs(a) === 1 ? '' : String(Math.abs(a));
  return `${sign}${coef}√${inside}${b === 1 ? '' : `/${b}`}`;
}

/** (n/d)·π: "π", "2π", "3π/2", "π/4", "-π/3". */
export function piText(n: number, d = 1): string {
  const [a, b] = reduce(n, d);
  if (a === 0) return '0';
  const sign = a < 0 ? '-' : '';
  const coef = Math.abs(a) === 1 ? '' : String(Math.abs(a));
  return `${sign}${coef}π${b === 1 ? '' : `/${b}`}`;
}

/** A decimal with at most `places` decimals and no trailing zeros: decimalText(2.50, 2) → "2.5". */
export function decimalText(x: number, places = 2): string {
  if (!Number.isFinite(x)) throw new Error(`decimalText(${x})`);
  const s = x.toFixed(places);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** True when x is a whole number (within floating-point noise). */
export function isWhole(x: number): boolean {
  return Math.abs(x - Math.round(x)) < 1e-9;
}
