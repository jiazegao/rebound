/**
 * Reads Rebound's question library (public/data/doe) for the pipeline's scripts: every question with its
 * level, set, season and round.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Level, LibraryIndex, Question, QuestionSet } from '../../src/core/schema';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LIBRARY_DIR = path.resolve(HERE, '../../public/data/doe');
export const DATA_DIR = path.resolve(HERE, 'data');

export interface LibraryQuestion {
  question: Question;
  level: Level;
  setId: string;
  /** The regional season the set comes from, when DOE says. */
  year?: number;
  roundId: string;
  /** The round's place in its set (1-based): DOE's only statement of difficulty. */
  round: number;
}

/** Whether the library has been built (the tests that need it are skipped when it has not). */
export function libraryBuilt(dir = LIBRARY_DIR): boolean {
  return existsSync(path.join(dir, 'index.json'));
}

/** Every question of every set, in the index's order. */
export function loadLibrary(dir = LIBRARY_DIR): LibraryQuestion[] {
  const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')) as LibraryIndex;
  const out: LibraryQuestion[] = [];
  for (const summary of index.sets) {
    const set = JSON.parse(readFileSync(path.join(dir, summary.file), 'utf8')) as QuestionSet;
    const year = set.year && /^\d{4}$/.test(set.year) ? Number(set.year) : undefined;
    for (const round of set.rounds) {
      for (const pair of round.pairs) {
        for (const question of [pair.tossup, pair.bonus]) {
          if (question) out.push({ question, level: set.level, setId: set.id, ...(year ? { year } : {}), roundId: round.id, round: round.order });
        }
      }
    }
  }
  return out;
}

/** Flags that mean a question's category, type or answer did not come through the import. */
const INCOMPLETE = new Set(['category-unknown', 'type-unknown', 'answer-missing', 'choices-missing']);

/**
 * The questions the style profile is measured on and the checks are tuned against: DOE's sets from
 * `fromYear` on (2019–22: the style students know as official), in the six current categories, complete.
 */
export function recentQuestions(library: readonly LibraryQuestion[], fromYear = 2019): LibraryQuestion[] {
  return library.filter((x) => (x.year ?? 0) >= fromYear && !x.question.flags?.some((f) => INCOMPLETE.has(f)) && x.question.stem.trim() !== '');
}
