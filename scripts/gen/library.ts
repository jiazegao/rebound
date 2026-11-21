/**
 * Reads Rebound's question library (public/data/doe) for the pipeline's scripts: every question with its
 * level, set, season and round.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_SUBJECTS, type Catalog, type Level, type LibraryIndex, type Question, type QuestionSet } from '../../src/core/schema';
import type { Tier } from './types';

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

/** DOE's only statement of difficulty: rounds 1–10 of a set are about equally hard, and later rounds get harder. */
export const tierOf = (round: number): Tier => (round <= 10 ? 'early' : 'late');

/** The first season a model is shown or asked: the 23-pair era and after, the style closest to today's. */
export const SAMPLE_FROM_YEAR = 2014;

const NEEDS_A_FIGURE = /\b(shown|pictured|figure|diagram|illustrated|image|graph (below|above|shown))\b/i;

/** Questions a model can fairly be asked or shown: complete, unflagged, in a current category, needing no picture. */
export function eligible(library: readonly LibraryQuestion[], fromYear = SAMPLE_FROM_YEAR): LibraryQuestion[] {
  return library.filter((x) => {
    const q = x.question;
    if ((x.year ?? 0) < fromYear || !(CORE_SUBJECTS as string[]).includes(q.subject)) return false;
    if (q.flags?.length || q.visual || q.figure || NEEDS_A_FIGURE.test(q.stem) || !q.stem.trim() || !q.answer.trim()) return false;
    return q.format === 'short_answer' || (!!q.choices && !!q.answerLetter);
  });
}

/** A level's catalog: each library question's topic, and how many questions each topic has. */
export function loadCatalog(level: Level, dir = LIBRARY_DIR): Catalog {
  return JSON.parse(readFileSync(path.join(dir, level === 'MS' ? 'catalog-ms.json' : 'catalog.json'), 'utf8')) as Catalog;
}

/** The topic of each library question of a level, by question id. */
export function topicsById(level: Level, dir = LIBRARY_DIR): Map<string, string> {
  return new Map(loadCatalog(level, dir).questions.map((row) => [row[0], row[2]]));
}
