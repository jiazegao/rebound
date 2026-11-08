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
