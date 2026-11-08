/**
 * Middle school sets printed "PHYSICAL SCIENCE" until 2021; the 2027 rules split that category into Physics
 * and Chemistry, for middle school as for high school. At import, each Physical Science question goes to the
 * subject whose topic rules (src/core/tagging.ts) fit it clearly better. When neither does, it stays in the
 * legacy subject `physical_science`. The printed category stays in `sourceCategory`.
 *
 * Measured against a hand-labelled sample in scripts/doe/REPORT-MS.md ("Physical Science split").
 */
import type { Question, Round } from '../schema';
import { explainCrossSubject, tagQuestion, type TaggableQuestion } from '../tagging';

/** The winning subject needs evidence of at least this... */
export const SPLIT_MIN_SCORE = 2;
/** ...and this much more than the other subject. */
export const SPLIT_MIN_LEAD = 1;

export interface SplitEvidence {
  physics: number;
  chemistry: number;
  subject?: 'physics' | 'chemistry';
}

/**
 * Evidence for each subject: the best topic score under that subject plus half the cross-subject score the
 * tagger gives Energy questions. The topic rules alone favour chemistry for wave questions (its atomic-structure
 * rules weigh "wavelength" and "frequency" more than the physics wave rules do); the cross-subject rules alone
 * favour physics for thermochemistry ("pressure", "work") and chirality ("mirror").
 */
export function physicalScienceEvidence(q: TaggableQuestion): SplitEvidence {
  const cross = explainCrossSubject(q).disciplines;
  const crossScore = (id: string) => (cross.find((d) => d.id === id)?.score ?? 0) / 2;
  const physics = tagQuestion({ ...q, subject: 'physics' }).score + crossScore('physics');
  const chemistry = tagQuestion({ ...q, subject: 'chemistry' }).score + crossScore('chemistry');
  const [best, other, subject] = physics >= chemistry ? [physics, chemistry, 'physics' as const] : [chemistry, physics, 'chemistry' as const];
  return { physics, chemistry, ...(best >= SPLIT_MIN_SCORE && best - other >= SPLIT_MIN_LEAD ? { subject } : {}) };
}

/** True for a question printed as Physical Science (whatever subject it has now). */
export const isPrintedPhysicalScience = (q: Pick<Question, 'sourceCategory'>) => /^physical\s+science$/i.test(q.sourceCategory.trim());

/**
 * Moves the round's Physical Science questions to physics or chemistry when the evidence is clear. Returns how
 * many went where. Run it before tagging topics (the topic depends on the subject).
 */
export function splitPhysicalScience(round: Round): { physics: number; chemistry: number; kept: number } {
  const counts = { physics: 0, chemistry: 0, kept: 0 };
  for (const pair of round.pairs) {
    for (const q of [pair.tossup, pair.bonus]) {
      if (!q || q.subject !== 'physical_science' || !isPrintedPhysicalScience(q)) continue;
      const { subject } = physicalScienceEvidence(q);
      if (subject) {
        q.subject = subject;
        counts[subject]++;
      } else counts.kept++;
    }
  }
  return counts;
}
