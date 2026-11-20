/**
 * Reviewed corrections to DOE's printed answer keys.
 *
 * Each entry was checked by a person against the original PDF and the science. The build applies
 * them after parsing and stops with an error if an entry no longer fits the parsed question, so a
 * correction can never silently point at the wrong choice. The printed answer line stays in
 * `answerRaw` for provenance, and the question carries an "erratum" flag plus a note.
 */
import type { Letter, Question, Round } from '../schema';

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
 * minus sign, a missing √ or fraction bar), restored as DOE printed them. Each was checked by a person against the
 * original PDF. The build applies them right after parsing, so topics are tagged from the corrected text, and stops
 * with an error if one no longer fits the parsed question.
 */
export interface DoeTextFix {
  /** Question id, e.g. "doe-ms-03-r11-t02". */
  id: string;
  /**
   * Exact replacements: in the stem, an answer choice, or the answer (its answer, printed answer line and accepted
   * answers alike).
   */
  fixes: Array<{ field: 'stem' | 'answer' | Letter; from: string; to: string }>;
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
  // Middle school
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
    id: 'doe-ms-04-r14-t14',
    fixes: [{ field: 'stem', from: 'What is!⁴3⁴ [', to: 'What is ⁴√(3⁴) [' }],
    reviewed: '2026-11-20',
  },
  {
    id: 'doe-ms-04-r16-t15',
    fixes: [{ field: 'Y', from: '|!100|', to: '|√100|' }],
    reviewed: '2026-11-20',
  },
];

/**
 * Apply reviewed text corrections to one parsed round. Returns the ids corrected; throws if a correction no longer
 * finds the text it replaces. A corrected question is flagged "text-corrected" in place of "possible-lost-formatting".
 */
export function applyDoeTextFixes(round: Round, corrections: DoeTextFix[] = DOE_TEXT_FIXES): string[] {
  const byId = new Map(corrections.map((c) => [c.id, c]));
  const applied: string[] = [];
  const fix = (q: Question) => {
    const c = byId.get(q.id);
    if (!c) return;
    for (const { field, from, to } of c.fixes) {
      const replace = (text: string) => text.split(from).join(to);
      let found = false;
      if (field === 'stem') {
        found = q.stem.includes(from);
        q.stem = replace(q.stem);
      } else if (field === 'answer') {
        found = [q.answer, q.answerRaw, ...q.accept].some((t) => t.includes(from));
        q.answer = replace(q.answer);
        q.answerRaw = replace(q.answerRaw);
        q.accept = q.accept.map(replace);
      } else if (q.choices?.[field] !== undefined) {
        found = q.choices[field].includes(from);
        q.choices[field] = replace(q.choices[field]);
      }
      if (!found) throw new Error(`Text correction for ${q.id} no longer fits: its ${field} has no "${from}"`);
    }
    q.flags = [...(q.flags ?? []).filter((f) => f !== 'possible-lost-formatting' && f !== 'text-corrected'), 'text-corrected'];
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
