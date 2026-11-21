/**
 * Reviewed corrections to DOE's printed answer keys.
 *
 * Each entry was checked by a person against the original PDF and the science. The build applies
 * them after parsing and stops with an error if an entry no longer fits the parsed question, so a
 * correction can never silently point at the wrong choice. The printed answer line stays in
 * `answerRaw` for provenance, and the question carries an "erratum" flag plus a note.
 */
import { LETTERS, type Letter, type Question, type Round } from '../schema';

export interface DoeErratum {
  /** Question id, e.g. "doe-hs-01-r05-t20". */
  id: string;
  /** The correct answer letter. Its choice text must match the printed answer text. */
  answerLetter: Letter;
  /** Shown under the answer, so readers know what changed and why. */
  note: string;
  /** Date the correction was reviewed. */
  reviewed: string;
}

export const DOE_ERRATA: DoeErratum[] = [
  {
    id: 'doe-hs-01-r05-t20',
    answerLetter: 'X',
    note: 'Corrected: DOE printed the answer as "W) MERCURY-OXIDE CELLS", but mercury-oxide cells is choice X.',
    reviewed: '2026-11-07',
  },
  {
    id: 'doe-hs-01-r10-t19',
    answerLetter: 'Z',
    note: 'Corrected: DOE printed the answer as "W) WINDS", but winds is choice Z.',
    reviewed: '2026-11-07',
  },
  // Middle school
  {
    id: 'doe-ms-01-r07-t07',
    answerLetter: 'Y',
    note: 'Corrected: DOE printed the answer as "X) BRAIDED", but braided is choice Y (streams below glaciers form braided patterns).',
    reviewed: '2026-11-08',
  },
  {
    id: 'doe-ms-01-r18-t07',
    answerLetter: 'W',
    note: 'Corrected: DOE printed the answer as "X) LAVA DOMES", but lava domes is choice W.',
    reviewed: '2026-11-08',
  },
  {
    id: 'doe-ms-06-r08-b08',
    answerLetter: 'W',
    note: 'Corrected: DOE printed the answer as "X) 50%", but 50% is choice W (basaltic lava is about 45-52% silica).',
    reviewed: '2026-11-08',
  },
  {
    id: 'doe-ms-08-r17-t17',
    answerLetter: 'X',
    note: 'Corrected: DOE printed the answer as "Y) 2.5", but 2.5 is choice X (one magnitude is a brightness ratio of about 2.512).',
    reviewed: '2026-11-08',
  },
  {
    id: 'doe-ms-16-r02-b17',
    answerLetter: 'X',
    note: 'Corrected: DOE printed the answer as "W) CARBON DIOXIDE", but carbon dioxide is choice X.',
    reviewed: '2026-11-08',
  },
];

/**
 * Reviewed corrections to a question's text: math symbols that DOE's PDF fonts lost in text extraction ("!" for a
 * minus sign, a missing √ or fraction bar), and equations, choices and answers the PDF draws as images, restored as
 * DOE printed them. Each was checked by a person against the original PDF. The build applies them right after
 * parsing, so topics are tagged from the corrected text, and stops with an error if one no longer fits the parsed
 * question.
 */
export interface DoeTextFix {
  /** Question id, e.g. "doe-ms-03-r11-t02". */
  id: string;
  /**
   * Exact replacements: in the stem, an answer choice, the answer (its answer, printed answer line and accepted
   * answers alike), or the accepted answers alone. An empty `from` fills a field the PDF left empty (a choice, or the
   * answer where it was an image) or adds an accepted answer. No replacements at all: the question was checked, and its
   * image holds nothing the text lacks (a blank image, or the rule between two questions).
   */
  fixes: Array<{ field: 'stem' | 'answer' | 'accept' | Letter; from: string; to: string }>;
  /** How the text was known where the PDF shows nothing (some of its images are blank), or why none was missing. */
  note?: string;
  /** Some of the question's images could not be restored, so it keeps "image-not-extracted". */
  partial?: boolean;
  /** Date the correction was checked against the PDF. */
  reviewed: string;
}

export const DOE_TEXT_FIXES: DoeTextFix[] = [
  {
    id: 'doe-hs-01-r01-b04',
    fixes: [{ field: 'stem', from: '8 ×10⁷ 1 (4 ×10⁴)²', to: '(8 × 10⁷)/(4 × 10⁴)^(1/2)' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-02-r14-b12',
    fixes: [{ field: 'stem', from: 'Find dd/(dd) at', to: 'Find dy/(dx) at' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-03-r06-b11',
    fixes: [
      { field: 'stem', from: '! 2 (80a²b⁴c³)', to: '−2√(80a²b⁴c³)' },
      { field: 'answer', from: '!8ab²c 5c', to: '−8ab²c√(5c)' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-03-r07-t11',
    fixes: [{ field: 'stem', from: '(2x²y^(!1)z³)⁰/((2x^(!3)y^(!4)z^(!5)))', to: '(2x²y⁻¹z³)⁰/(2x⁻³y⁻⁴z⁻⁵)' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-03-r08-t04',
    fixes: [
      { field: 'stem', from: 'θ =! 3/4', to: 'θ = −3/4' },
      { field: 'answer', from: '3/5 AND! 3/5', to: '3/5 AND −3/5' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-03-r08-b04',
    fixes: [{ field: 'stem', from: '(x³ − 8) (x − 2)', to: '(x³ − 8)/(x − 2)' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-03-r13-t11',
    fixes: [{ field: 'stem', from: 'form:!144/49', to: 'form: √(−144/49)' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-03-r13-b11',
    fixes: [
      { field: 'stem', from: '(2 + i 2)(3 – i 2)', to: '(2 + i√2)(3 – i√2)' },
      { field: 'answer', from: '8 + 2 i', to: '8 + √2 i' },
      { field: 'answer', from: '8 + i 2', to: '8 + i√2' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r02-t02',
    fixes: [{ field: 'answer', from: '', to: '1/4' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r03-t06',
    fixes: [{ field: 'stem', from: 'y = 36 7ˣ [', to: 'y = 36 × 7ˣ [' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r03-b06',
    fixes: [],
    note: 'Checked: the image is blank, and nothing is missing.',
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r04-t17',
    fixes: [{ field: 'answer', from: '', to: '2π/3' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r05-t23',
    fixes: [
      { field: 'stem', from: 'What is + (-) as', to: 'What is 3/4 + (−5/6) as' },
      { field: 'answer', from: '', to: '−1/12' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r06-b18',
    fixes: [
      { field: 'stem', from: 'tan a) (1 – cos² a) [', to: 'tan a) × (1 – cos² a) [' },
      { field: 'X', from: 'cos² a sin a', to: 'cos² a × sin a' },
      { field: 'Y', from: 'sin² a cos² a', to: 'sin² a × cos² a' },
      { field: 'answer', from: 'cos² a sin a', to: 'cos² a × sin a' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r06-t23',
    fixes: [{ field: 'stem', from: 'not equal to [5 squared', to: 'not equal to (5²)³ [5 squared' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r06-b23',
    fixes: [
      { field: 'stem', from: 'graph of cross', to: 'graph of y = 2x² − 5x − 1 cross' },
      { field: 'answer', from: 'AND', to: '(5 + √33)/4 AND (5 − √33)/4' },
      { field: 'answer', from: '(ACCEPT:)', to: '(ACCEPT: (5 ± √33)/4)' },
      { field: 'accept', from: '', to: '(5 ± √33)/4' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r07-t09',
    fixes: [
      { field: 'stem', from: '5.71 10⁻⁷', to: '5.71 × 10⁻⁷' },
      { field: 'W', from: '3.26 10⁻¹³', to: '3.26 × 10⁻¹³' },
      { field: 'X', from: '5.71 10⁻⁷', to: '5.71 × 10⁻⁷' },
      { field: 'Y', from: '1.14 10⁻⁶', to: '1.14 × 10⁻⁶' },
      { field: 'Z', from: '2.14 10⁻⁴', to: '2.14 × 10⁻⁴' },
      { field: 'answer', from: '3.26 10⁻¹³', to: '3.26 × 10⁻¹³' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r07-t13',
    fixes: [{ field: 'stem', from: 'Given the function, what', to: 'Given the function y = 4x − x², what' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r07-b13',
    fixes: [
      { field: 'stem', from: 'form: [the quantity', to: 'form: (3x + 2)³ [the quantity' },
      { field: 'answer', from: '', to: '27x³ + 54x² + 36x + 8' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r08-t12',
    fixes: [
      { field: 'W', from: '3x +', to: '3x + 7/(4 − 2y)' },
      { field: 'Z', from: 'x +', to: 'x + (y − 4)/2' },
      { field: 'answer', from: '3x +', to: '3x + 7/(4 − 2y)' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r08-b12',
    fixes: [
      { field: 'W', from: '', to: '(x + 1)/(x³ + 1)' },
      { field: 'X', from: '', to: '15/(x + 1)' },
      { field: 'Y', from: '', to: '(x² + 3x + 5)/(x² + 3x − 4)' },
      { field: 'Z', from: '', to: '35x/(x² − 2x − 3)' },
      { field: 'answer', from: '', to: '(x² + 3x + 5)/(x² + 3x − 4)' },
      { field: 'answer', from: 'Y)', to: 'Y) (x² + 3x + 5)/(x² + 3x − 4)' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r08-t14',
    fixes: [{ field: 'answer', from: '6', to: '6√2' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r09-t01',
    fixes: [
      { field: 'stem', from: 'angle [theta], if 0 ≤ ≤ 2π, sin = and cos =.', to: 'angle θ [theta], if 0 ≤ θ ≤ 2π, sin θ = 1/2 and cos θ = −√3/2.' },
      { field: 'answer', from: '', to: '5π/6' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r09-b01',
    fixes: [
      { field: 'answer', from: '(ACCEPT:)', to: '(ACCEPT: (6π + π²)/3)' },
      { field: 'accept', from: '', to: '(6π + π²)/3' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r09-b06',
    fixes: [
      { field: 'stem', from: 'equal to 3 - [3 times', to: 'equal to 3(−2, 1; 0, 5) − (4, 0; −4, 1) [3 times' },
      { field: 'answer', from: '', to: '(−10, 3; 4, 14)' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r09-b13',
    fixes: [{ field: 'answer', from: '3', to: '3√3' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r09-t19',
    fixes: [{ field: 'stem', from: 'AC = 15 centimeters', to: 'AC = 15√3 centimeters' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r10-b03',
    fixes: [
      { field: 'stem', from: '2 by 2 matrix [row 1', to: '2 by 2 matrix (3, 1; 5, 2) [row 1' },
      { field: 'answer', from: '', to: '(2, −1; −5, 3)' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r10-b12',
    fixes: [
      { field: 'answer', from: '(−1±)/3 ⁷', to: '(−1 ± √7)/3' },
      { field: 'answer', from: '-1/3 ±/3', to: '-1/3 ± √7/3' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r10-t14',
    fixes: [
      { field: 'stem', from: 'integers:', to: 'integers: a³ − 8.' },
      { field: 'answer', from: '(a – 2)(', to: '(a – 2)(a² + 2a + 4)' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r10-b14',
    fixes: [
      { field: 'stem', from: 'integers: .', to: 'integers: a⁵ + 32.' },
      { field: 'answer', from: '(a + 2)', to: '(a + 2)(a⁴ − 2a³ + 4a² − 8a + 16)' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r11-t07',
    fixes: [{ field: 'stem', from: 'expression: [the quantity', to: 'expression: (n − 2)!/(n − 3)! [the quantity' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r11-t09',
    fixes: [{ field: 'stem', from: 'diagonal is?', to: 'diagonal is 7√2?' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r11-b09',
    fixes: [{ field: 'stem', from: 'multiplication of by [the', to: 'multiplication of (x; y) by (1, 0; 0, −1) [the' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r12-b02',
    fixes: [
      { field: 'stem', from: 'integers:', to: 'integers: 16a⁴ − 81b⁴' },
      { field: 'answer', from: '', to: '(4a² + 9b²)(2a + 3b)(2a − 3b)' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r12-b09',
    fixes: [{ field: 'stem', from: '2 H₂O_((g)) [in equilibrium with]', to: '2 H₂O_((g)) ⇌ [in equilibrium with]' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r12-b18',
    fixes: [{ field: 'stem', from: 'equation for x:', to: 'equation for x: 2√x = x − 15.' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r13-t13',
    fixes: [
      { field: 'W', from: '[the square root of 31 over 3]', to: '√31/3 [the square root of 31 over 3]' },
      { field: 'X', from: '-5 [negative', to: '-5√175 [negative' },
      { field: 'Y', from: '6 [6 times', to: '6√(x²/4) [6 times' },
      { field: 'Z', from: '– [the negative', to: '–√(153x) [the negative' },
      { field: 'answer', from: '[the square root of 31 over 3]', to: '√31/3 [the square root of 31 over 3]' },
      { field: 'answer', from: 'W)', to: 'W) √31/3' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r13-b13',
    fixes: [{ field: 'stem', from: 'simplify [7 times', to: 'simplify 7√(5x) × √(180x⁵) [7 times' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r13-t22',
    fixes: [
      { field: 'stem', from: 'angle for?', to: 'angle for 7π/6?' },
      { field: 'answer', from: '', to: 'π/6' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r13-b22',
    fixes: [
      { field: 'stem', from: 'between and.', to: 'between vector AB and vector CD.' },
      { field: 'answer', from: '', to: '90°' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r14-b13',
    fixes: [{ field: 'stem', from: 'cos (+w) [', to: 'cos (π/2 + w) [' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r15-t03',
    fixes: [{ field: 'stem', from: 'Express [the summation', to: 'Express Σ_(x=1)^(n) log x [the summation' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r15-t06',
    fixes: [{ field: 'Z', from: 'f(x) = [f of x', to: 'f(x) = 1/x² [f of x' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r15-b06',
    fixes: [{ field: 'answer', from: '10', to: '10√3' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r15-t12',
    fixes: [
      { field: 'stem', from: '6x² + – 25 [', to: '6x² + 3/x⁵ – 25 [' },
      { field: 'answer', from: '36x² –12x -', to: '36x² –12x - 15/x⁶' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r15-t14',
    fixes: [
      { field: 'stem', from: 'What is tan + sin?', to: 'What is tan(5π/4) + sin(π/6)?' },
      { field: 'answer', from: '', to: '3/2' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r16-b07',
    fixes: [{ field: 'stem', from: 'expression: [the summation', to: 'expression: Σ_(−1)^(4) 3k² [the summation' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r16-t18',
    fixes: [
      { field: 'stem', from: 'evaluate [sine', to: 'evaluate sin(7π/4) [sine' },
      { field: 'answer', from: '', to: '−√2/2' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r16-t23',
    fixes: [{ field: 'stem', from: 'Evaluate log [log of', to: 'Evaluate log((10ˣ × 100)/10,000) [log of' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r17-t02',
    fixes: [{ field: 'stem', from: 'Find [the limit', to: 'Find lim_(x→∞) (x² + 10)/(7x² − 5) [the limit' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r17-t04',
    fixes: [{ field: 'stem', from: 'Find [the limit', to: 'Find lim_(x→∞) e⁻ˣ [the limit' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-04-r17-b18',
    fixes: [
      { field: 'answer', from: '', to: '(√2 + √6)/4' },
      { field: 'answer', from: '(ACCEPT:)', to: '(√2 + √6)/4 (ACCEPT: (√6 + √2)/4)' },
      { field: 'accept', from: '', to: '(√6 + √2)/4' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-05-r02-b11',
    fixes: [
      { field: 'stem', from: 'xⁿ ∞ _(n!)', to: '∑_(n=0)^(∞) xⁿ/n!' },
      { field: 'stem', from: 'over n n=0 factorial', to: 'over n factorial' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-05-r09-t16',
    fixes: [{ field: 'stem', from: 'r =! [', to: 'r = θ [' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r01-t04',
    fixes: [
      { field: 'stem', from: 'expression [the square root', to: 'expression √(x² − 4x + 4) [the square root' },
      { field: 'W', from: 'x 2', to: 'x − 2' },
      { field: 'X', from: 'x 2x + 2', to: 'x − 2x + 2' },
      { field: 'Y', from: '|x 2|', to: '|x − 2|' },
      { field: 'answer', from: '|x 2|', to: '|x − 2|' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r03-t19',
    fixes: [{ field: 'stem', from: 'f(x)= [f of x', to: 'f(x) = x²/(x² − 4x + 4) [f of x' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r03-t25',
    fixes: [
      { field: 'stem', from: 'If ln [natural log', to: 'If ln(x³) = 6 [natural log' },
      { field: 'stem', from: 'what is ln [the natural', to: 'what is ln(x²) [the natural' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r04-t06',
    fixes: [{ field: 'stem', from: 'the equation [y equals', to: 'the equation y = R(1/2)^(x/300) [y equals' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r05-b14',
    fixes: [
      { field: 'stem', from: 'graph of y = over', to: 'graph of y = √x over' },
      { field: 'answer', from: 'y =', to: 'y = √(−(x + 3))' },
      { field: 'answer', from: '(ACCEPT: y = √(−(x + 3)))', to: '(ACCEPT: y = √(−x − 3))' },
      { field: 'accept', from: 'y = √(−(x + 3))', to: 'y = √(−x − 3)' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r05-t20',
    fixes: [{ field: 'answer', from: '7/3', to: '7π/3' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r05-t24',
    fixes: [{ field: 'stem', from: 'Cu [yields]', to: 'Cu → [yields]' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r07-b22',
    fixes: [
      { field: 'stem', from: 'with equation = 1', to: 'with equation y²/25 − x²/36 = 1' },
      { field: 'W', from: 'y = x and y = x', to: 'y = (5/6)x and y = −(5/6)x' },
      { field: 'X', from: 'y = x and y = x', to: 'y = (5/6)x and y = −(5/6)x' },
      { field: 'Y', from: 'y = x and y = x', to: 'y = (6/5)x and y = −(6/5)x' },
      { field: 'Z', from: 'y = x and y = x', to: 'y = (6/5)x and y = −(6/5)x' },
      { field: 'answer', from: 'y = x AND y = x', to: 'y = (5/6)x AND y = −(5/6)x' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r08-t05',
    fixes: [{ field: 'stem', from: 'g(u) = [g of u', to: 'g(u) = ∫_(0)^(u) sec²t dt [g of u' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r08-b13',
    fixes: [
      { field: 'answer', from: '8b + 1 –)', to: '8b + 1 – 4/b²)' },
      { field: 'accept', from: '18b² – 8b + 1 –', to: '18b² – 8b + 1 – 4/b²' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r09-t06',
    fixes: [
      { field: 'stem', from: 'matrix, [such that', to: 'matrix, (−2, 2, 0; 4, 1, −5; 8, 3, 7) [such that' },
      { field: 'stem', from: 'which is the [x sub 2, 3]', to: 'which is the x_(2,3) [x sub 2, 3]' },
      { field: 'answer', from: '5', to: '−5' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r09-b12',
    fixes: [{ field: 'stem', from: 'x³ 9x² + 11x 4?', to: 'x³ − 9x² + 11x − 4?' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r09-t20',
    fixes: [
      { field: 'stem', from: 'line 3 x + 2by', to: 'line 3ax + 2by' },
      { field: 'answer', from: '3/2b', to: '−3a/2b' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r09-b25',
    fixes: [
      { field: 'stem', from: 'following: [the integral', to: 'following: ∫_(0)^(2) (1/t)e^(ln t) dt [the integral' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r10-t01',
    fixes: [{ field: 'stem', from: 'f(x) = sin () [', to: 'f(x) = (3/2) sin (x/2) [' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r10-b01',
    fixes: [
      { field: 'stem', from: 'solve [the absolute', to: 'solve |2r − 13/4| < 5/2 [the absolute' },
      { field: 'answer', from: '3/8 < r <', to: '3/8 < r < 2 7/8' },
      { field: 'answer', from: '(ACCEPT: 3/8 < r < 2 7/8)', to: '(ACCEPT: 3/8 < r < 23/8)' },
      { field: 'accept', from: '3/8 < r < 2 7/8', to: '3/8 < r < 23/8' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r10-t06',
    fixes: [
      { field: 'stem', from: 'such that the [limit', to: 'such that the lim_(x→∞) (ax⁵ − x³ + x)/(x − x³ + 2x⁵) = 3 [limit' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r10-b20',
    fixes: [
      { field: 'stem', from: 'remainder when is divided by?', to: 'remainder when 2x³ − x² + 3x − 4 is divided by x + 3?' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r10-b25',
    fixes: [{ field: 'stem', from: 'CaCO_(3 (s)) [yields]', to: 'CaCO_(3 (s)) → [yields]' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r11-b04',
    fixes: [{ field: 'stem', from: 'Solve for x: 5 + = x + 7 [', to: 'Solve for x: 5 + √(x + 14) = x + 7 [' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r11-t22',
    fixes: [
      { field: 'stem', from: 'AC equal to,', to: 'AC equal to 3√3,' },
      { field: 'X', from: '6', to: '6√3' },
      { field: 'Y', from: '9', to: '9√3' },
      { field: 'Z', from: '12', to: '12√3' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r12-b10',
    fixes: [{ field: 'stem', from: 'Express [the quantity', to: 'Express (1 + 2i)/(4 − 5i) [the quantity' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r12-b16',
    fixes: [
      { field: 'stem', from: 'Solve for x in standard form.', to: 'Solve 3x − 2ix = 5 for x in standard a + bi form.' },
      { field: 'answer', from: 'i', to: '15/13 + (10/13)i' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r13-t11',
    fixes: [{ field: 'stem', from: 'is [the limit', to: 'is lim_(x→0) |x|/x [the limit' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r13-b19',
    fixes: [{ field: 'stem', from: 'solve [negative 7', to: 'solve −7 + |3 − 2x| = 15 [negative 7' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r13-b22',
    fixes: [
      { field: 'W', from: '', to: '√3' },
      { field: 'X', from: '/2', to: '√3/2' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r14-t04',
    fixes: [{ field: 'stem', from: '2 by 2 matrix [such that', to: '2 by 2 matrix (2, −3; −8, −4) [such that' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r14-t06',
    fixes: [{ field: 'stem', from: 'limit of as x', to: 'limit of xˣ as x' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r14-b12',
    fixes: [{ field: 'stem', from: 'of y = [the fraction', to: 'of y = (x³ − 8)/(x − 2) [the fraction' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r14-b20',
    fixes: [{ field: 'stem', from: 'semicircle [y equals', to: 'semicircle y = √(16 − (x − 4)²) [y equals' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r15-b06',
    fixes: [
      { field: 'stem', from: 'Evaluate [the integral', to: 'Evaluate ∫_(√2)^(3√2) (3x² + 6) dx [the integral' },
      { field: 'answer', from: '', to: '64√2' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r15-t14',
    fixes: [{ field: 'stem', from: 'y² 8y 11= 0', to: 'y² − 8y − 11 = 0' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r15-b14',
    fixes: [
      { field: 'stem', from: 'real numbers: [9 to the power', to: 'real numbers: 9^(2x) = 27^(3x − 4) [9 to the power' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-hs-06-r15-b20',
    fixes: [{ field: 'stem', from: 'x = 4 and y =?', to: 'x = 4 and y = √x?' }],
    reviewed: '2026-11-20',
  },
  // Middle school
  {
    id: 'doe-ms-01-r16-t09',
    fixes: [
      { field: 'Y', from: 'x', to: '√x' },
      { field: 'answer', from: 'x', to: '√x' },
    ],
    reviewed: '2026-11-21',
  },
  {
    id: 'doe-ms-03-r03-b07',
    fixes: [
      { field: 'stem', from: '4/8! 14/12', to: '4/8 − 14/12' },
      { field: 'answer', from: '! 2/3', to: '−2/3' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-03-r04-t06',
    fixes: [{ field: 'stem', from: '(! 5/6)"(!6/11)', to: '(−5/6) × (−6/11)' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-03-r04-b06',
    fixes: [{ field: 'stem', from: '(8/9! 1/9) − (5/9!12/9)', to: '(8/9 − 1/9) − (5/9 − 12/9)' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-03-r11-t02',
    fixes: [{ field: 'stem', from: '(!3x³ + 9x!10x²)', to: '(−3x³ + 9x − 10x²)' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-03-r11-t12',
    fixes: [
      { field: 'X', from: 'to the third power 1 !', to: 'to the third power' },
      { field: 'Y', from: '(k) ³ Read as', to: '(k)^(−1/3) Read as' },
      { field: 'Z', from: '− k³ Read as', to: '−|k|³ Read as' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-03-r13-b25',
    fixes: [{ field: 'stem', from: '1 !(16x⁴)⁴', to: '−(16x⁴)^(1/4)' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r02-t16',
    fixes: [{ field: 'stem', from: 'Simplify:', to: 'Simplify: 3f + 7 − 2f − 3.' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r02-b16',
    fixes: [
      { field: 'answer', from: '[one, one thousand', to: '1/1075 [one, one thousand' },
      { field: 'answer', from: '(read as: one', to: '1/1075 (read as: one' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r04-t21',
    fixes: [
      { field: 'Y', from: '', to: '20' },
      { field: 'answer', from: '0', to: '20' },
    ],
    note: 'The images in the PDF for choices X and Y and the answer’s first digit are blank. Y is 20: the answer line ends in 0 with one digit missing before it, and DOE’s high school version of this question (doe-hs-04-r07-b24) gives 20 degrees Celsius. Choice X is unknown.',
    partial: true,
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r06-t02',
    fixes: [{ field: 'stem', from: 'form: 0.99 - [', to: 'form: 0.99 − 3/4 [' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r07-t20',
    fixes: [{ field: 'stem', from: 'Simplify [one third', to: 'Simplify (1/3) ÷ (1/6) [one third' }],
    note: 'The image in the PDF is blank; the expression is DOE’s own guide, one third divided by one sixth.',
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r08-t05',
    fixes: [{ field: 'answer', from: '9.3 x', to: '9.3 x 10⁷' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r08-b05',
    fixes: [{ field: 'answer', from: '9.10', to: '9.10 × 10¹¹' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r08-b11',
    fixes: [{ field: 'stem', from: 'shape of + = 1?', to: 'shape of x²/3 + y²/5 = 1?' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r11-t04',
    fixes: [{ field: 'answer', from: '', to: '8¹⁰' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r11-b04',
    fixes: [
      { field: 'stem', from: 'form: () (3 +2)³ () [', to: 'form: (6⁴) (3 +2)³ (6³) [' },
      { field: 'accept', from: '(2⁷)(3⁷)(5³', to: '(2⁷)(3⁷)(5³)' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r11-b25',
    fixes: [
      { field: 'stem', from: '(x² + 2) - 3 + 3x(x²) + 6 - 8 [', to: '(x² + 2) - 3π + 3x(x²) + 6π - 8 [' },
      { field: 'answer', from: '- 20 + 3', to: '- 20 + 3π' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r12-b10',
    fixes: [
      { field: 'X', from: '8', to: '8√3' },
      { field: 'answer', from: '8', to: '8√3' },
    ],
    note: 'The image in the PDF after choice X’s 8 is blank. The area of ACBD, two equilateral triangles of side 4, is 8√3, and DOE’s answer is X.',
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r12-b13',
    fixes: [
      { field: 'answer', from: '', to: 'h = 6 + n/6' },
      { field: 'answer', from: '(ACCEPT: 6h', to: 'h = 6 + n/6 (ACCEPT: 6h' },
    ],
    note: 'The image in the PDF for the answer is blank. The answer is worked out from the question (2 inches is 1/6 foot a day), and is the same equation as DOE’s accepted 6h = 36 + n.',
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r12-t20',
    fixes: [{ field: 'W', from: 'a b = b a', to: 'a × b = b × a' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r13-b05',
    fixes: [
      { field: 'answer', from: '(ACCEPT: y = x + 5)', to: '(ACCEPT: y = (−1/3)x + 5 1/3)' },
      { field: 'answer', from: 'y = x + (ACCEPT', to: 'y = (−1/3)x + 16/3 (ACCEPT' },
      { field: 'accept', from: 'y = x + 5', to: 'y = (−1/3)x + 5 1/3' },
      { field: 'answer', from: 'y = x +', to: 'y = (−1/3)x + 16/3' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r13-t15',
    fixes: [{ field: 'answer', from: '5, -5', to: '5√2, -5√2' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r13-t18',
    fixes: [{ field: 'stem', from: 'smaller than?', to: 'smaller than √150?' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r14-t14',
    fixes: [{ field: 'stem', from: 'What is!⁴3⁴ [', to: 'What is ⁴√(3⁴) [' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r16-t15',
    fixes: [{ field: 'Y', from: '|!100|', to: '|√100|' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r16-t24',
    fixes: [
      { field: 'stem', from: 'hyperbola [the quantity', to: 'hyperbola (x − 3)²/25 − (y + 1)²/49 = 1 [the quantity' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r16-b24',
    fixes: [
      { field: 'stem', from: 'hyperbola ⁽ˣ (-‐ 3)²)/25 -‐ (y + 1)²/49 = 1 read as: the quantity x minus 3 squared over 25 minus the quantity y plus 1 squared over 49 equals 1)?', to: 'hyperbola (x − 3)²/25 − (y + 1)²/49 = 1 [the quantity x minus 3 squared over 25 minus the quantity y plus 1 squared over 49 equals 1]?' },
      { field: 'answer', from: 'y = OR y =', to: 'y = (7/5)x − 26/5 OR y = (−7/5)x + 16/5' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r17-b16',
    fixes: [{ field: 'answer', from: '', to: '5√3' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r17-b20',
    fixes: [
      { field: 'stem', from: 'angle A =', to: 'angle A = 21π/8' },
      { field: 'answer', from: '', to: '3π/8' },
    ],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-06-r07-b19',
    fixes: [],
    note: 'Checked: the image is the rule between two questions, and nothing is missing.',
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-06-r07-t20',
    fixes: [],
    note: 'Checked: the image is the rule between two questions, and nothing is missing.',
    reviewed: '2026-11-20',
  },
];

/**
 * Apply reviewed text corrections to one parsed round. Returns the ids corrected; throws if a correction no longer
 * finds the text it replaces (or the empty field it fills). A corrected question is flagged "text-corrected" in place
 * of "possible-lost-formatting", and loses "image-not-extracted" (unless the correction is partial), "answer-missing"
 * once it has an answer, and "choices-missing" once it has all four choices. A question checked with nothing to
 * restore just loses the warnings.
 */
export function applyDoeTextFixes(round: Round, corrections: DoeTextFix[] = DOE_TEXT_FIXES): string[] {
  const byId = new Map(corrections.map((c) => [c.id, c]));
  const applied: string[] = [];
  const fix = (q: Question) => {
    const c = byId.get(q.id);
    if (!c) return;
    for (const { field, from, to } of c.fixes) {
      // An empty `from` fills a field that is empty; any other replaces every occurrence.
      const replace = (text: string) => (from === '' ? (text === '' ? to : text) : text.split(from).join(to));
      const fits = (text: string) => (from === '' ? text === '' : text.includes(from));
      let found = false;
      if (field === 'stem') {
        found = fits(q.stem);
        q.stem = replace(q.stem);
      } else if (field === 'answer') {
        found = [q.answer, q.answerRaw, ...q.accept].some(fits);
        q.answer = replace(q.answer);
        q.answerRaw = replace(q.answerRaw);
        q.accept = q.accept.map(replace);
      } else if (field === 'accept') {
        found = from === '' ? !q.accept.includes(to) : q.accept.some(fits);
        q.accept = from === '' ? (found ? [...q.accept, to] : q.accept) : q.accept.map(replace);
      } else if (q.choices?.[field] !== undefined) {
        found = fits(q.choices[field]);
        q.choices[field] = replace(q.choices[field]);
      }
      if (!found) throw new Error(`Text correction for ${q.id} no longer fits: its ${field} ${from === '' ? `is not empty (for "${to}")` : `has no "${from}"`}`);
    }
    const settled = new Set(['possible-lost-formatting', 'text-corrected']);
    if (!c.partial) settled.add('image-not-extracted');
    if (q.answer.trim()) settled.add('answer-missing');
    if (q.choices && LETTERS.every((l) => q.choices![l].trim())) settled.add('choices-missing');
    const flags = [...(q.flags ?? []).filter((f) => !settled.has(f)), ...(c.fixes.length ? ['text-corrected'] : [])];
    if (flags.length) q.flags = flags;
    else delete q.flags;
    applied.push(q.id);
  };
  for (const pair of round.pairs) {
    fix(pair.tossup);
    if (pair.bonus) fix(pair.bonus);
  }
  return applied;
}

const compact = (s: string) =>
  s
    .toUpperCase()
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Apply reviewed corrections to one parsed round. Returns the ids corrected; throws if an erratum does not fit. */
export function applyDoeErrata(round: Round, errata: DoeErratum[] = DOE_ERRATA): string[] {
  const byId = new Map(errata.map((e) => [e.id, e]));
  const applied: string[] = [];
  const fix = (q: Question) => {
    const e = byId.get(q.id);
    if (!e) return;
    const choice = q.choices?.[e.answerLetter];
    if (q.format !== 'multiple_choice' || !choice || compact(choice) !== compact(q.answer)) {
      throw new Error(`Erratum for ${q.id} no longer fits: choice ${e.answerLetter} is "${choice ?? ''}", answer is "${q.answer}"`);
    }
    q.answerLetter = e.answerLetter;
    q.flags = [...(q.flags ?? []).filter((f) => f !== 'answer-letter-corrected' && f !== 'mc-answer-mismatch'), 'erratum'];
    q.notes = [...(q.notes ?? []).filter((n) => n !== e.note), e.note];
    applied.push(q.id);
  };
  for (const pair of round.pairs) {
    fix(pair.tossup);
    if (pair.bonus) fix(pair.bonus);
  }
  return applied;
}
