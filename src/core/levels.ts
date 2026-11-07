/**
 * The difficulty ladder (proposal 5.6). DOE sample rounds 1–10 are early regional and later rounds late
 * regional (DOE notes later rounds are harder). The team's uploaded packets carry the level the team gave
 * them: regional, invitational or nationals-level. Drills and scrimmages can target one level.
 */
import type { CatalogRow, DifficultyLevel, Question, TeamPacket, UploadLevel } from './schema';
import { setIdOf } from './drill';

export const LEVEL_LABEL: Record<DifficultyLevel, string> = {
  early: 'Early regional',
  late: 'Late regional',
  invitational: 'Invitational',
  nationals: 'Nationals-level',
};

export const UPLOAD_LEVEL_LABEL: Record<UploadLevel, string> = {
  regional: 'Regional',
  invitational: 'Invitational',
  nationals: 'Nationals-level',
};

/** Uploads without a level (from before the ladder) count as invitational, the most common source. */
export function uploadDifficulty(level: UploadLevel | undefined): DifficultyLevel {
  if (level === 'regional') return 'late';
  if (level === 'nationals') return 'nationals';
  return 'invitational';
}

/**
 * A nominal DOE-style round number for an upload's questions, so the mastery model's difficulty prior
 * (which grows after round 10) ranks them: regional like round 12, invitational like round 17 (DOE's
 * hardest), nationals-level beyond anything DOE prints.
 */
export const NOMINAL_ROUND: Record<UploadLevel, number> = { regional: 12, invitational: 17, nationals: 24 };

/** The level of a DOE round, by its position in the set. */
export function roundLevel(round: number): DifficultyLevel {
  return round <= 10 ? 'early' : 'late';
}

/** Catalog rows for the questions in the team's uploaded packets, with each set's level. */
export function teamCatalog(packets: readonly TeamPacket[]): { rows: CatalogRow[]; levels: Map<string, DifficultyLevel> } {
  const rows: CatalogRow[] = [];
  const levels = new Map<string, DifficultyLevel>();
  for (const p of packets) {
    if (p.kind !== 'upload' || !p.set) continue;
    levels.set(p.set.id, uploadDifficulty(p.level));
    const round = NOMINAL_ROUND[p.level ?? 'invitational'];
    const row = (q: Question): CatalogRow => [q.id, q.subject, q.topic ?? '', q.kind === 'tossup' ? 't' : 'b', round, q.crossSubject ?? ''];
    for (const r of p.set.rounds) for (const pair of r.pairs) rows.push(row(pair.tossup), ...(pair.bonus ? [row(pair.bonus)] : []));
  }
  return { rows, levels };
}

/** The level of a catalog row: the team's level for its uploads, the round's for DOE questions. */
export function rowLevel(row: CatalogRow, teamLevels?: ReadonlyMap<string, DifficultyLevel>): DifficultyLevel {
  return teamLevels?.get(setIdOf(row[0])) ?? roundLevel(row[4]);
}
