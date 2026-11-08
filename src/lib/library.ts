/**
 * Loading question sets. DOE sets ship with the site as static JSON files under data/doe/. One index lists the
 * sets of both levels; the catalog and concept files are per level (catalog.json and catalog-ms.json, …), and a
 * team's level picks which ones drills, plans and the Learn pages use.
 */
import { useEffect, useState } from 'react';
import { setIdOf } from '../core/drill';
import { getData, useData } from './store';
import { isVisualId, loadVisualQuestions, VISUAL_SET, visualRound } from './visuals';
import type { Catalog, CatalogRow, ConceptIndex, Level, LibraryIndex, Question, QuestionPair, QuestionSet, Round, SetSummary } from '../core/schema';

const BASE = 'data/doe/';

let indexPromise: Promise<LibraryIndex> | null = null;
const catalogPromises = new Map<Level, Promise<Catalog>>();
const conceptPromises = new Map<Level, Promise<ConceptIndex>>();
const setPromises = new Map<string, Promise<QuestionSet>>();

/** The level this device's team plays at (high school until a team says otherwise). */
export function teamLevel(): Level {
  return getData().team?.level === 'MS' ? 'MS' : 'HS';
}

export function useTeamLevel(): Level {
  return useData().team?.level === 'MS' ? 'MS' : 'HS';
}

/** "catalog.json" for high school, "catalog-ms.json" for middle school. */
export function levelFile(name: 'catalog' | 'concepts', level: Level): string {
  return `${name}${level === 'MS' ? '-ms' : ''}.json`;
}

/** The sets of one level, in index order. */
export function setsOfLevel(index: LibraryIndex, level: Level): SetSummary[] {
  return index.sets.filter((s) => (s.level ?? 'HS') === level);
}

export const LEVEL_NAME: Record<Level, string> = { HS: 'high school', MS: 'middle school' };

const newestFirst = (a: SetSummary, b: SetSummary) => (b.setNumber ?? 0) - (a.setNumber ?? 0);

/** Sets for choosers: the team's level first, newest first, then the other level's (middle school teams often practice up). */
export function setGroups(index: LibraryIndex, level: Level): Array<{ level: Level; label: string; sets: SetSummary[] }> {
  const other: Level = level === 'HS' ? 'MS' : 'HS';
  return [level, other]
    .map((l) => ({ level: l, label: l === 'HS' ? 'High school' : 'Middle school', sets: setsOfLevel(index, l).sort(newestFirst) }))
    .filter((g) => g.sets.length > 0);
}

/** The newest set of the team's level (or of any level when it has none). */
export function newestSet(index: LibraryIndex, level: Level): SetSummary | undefined {
  return setGroups(index, level)[0]?.sets[0];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

export function loadIndex(): Promise<LibraryIndex> {
  indexPromise ??= fetchJson<LibraryIndex>(`${BASE}index.json`).catch((err) => {
    indexPromise = null;
    throw err;
  });
  return indexPromise;
}

export function loadSet(summary: SetSummary): Promise<QuestionSet> {
  let p = setPromises.get(summary.id);
  if (!p) {
    p = fetchJson<QuestionSet>(`${BASE}${summary.file}`).catch((err) => {
      setPromises.delete(summary.id);
      throw err;
    });
    setPromises.set(summary.id, p);
  }
  return p;
}

export async function loadSetById(setId: string): Promise<QuestionSet> {
  const index = await loadIndex();
  const summary = index.sets.find((s) => s.id === setId);
  if (!summary) throw new Error(`Unknown question set: ${setId}`);
  return loadSet(summary);
}

function cached<T>(cache: Map<Level, Promise<T>>, level: Level, url: string): Promise<T> {
  let p = cache.get(level);
  if (!p) {
    p = fetchJson<T>(url).catch((err) => {
      cache.delete(level);
      throw err;
    });
    cache.set(level, p);
  }
  return p;
}

/**
 * One compact row per question (subject, topic, round) of one level, for choosing drill questions without
 * loading every set. Defaults to the team's level.
 */
export function loadCatalog(level: Level = teamLevel()): Promise<Catalog> {
  return cached(catalogPromises, level, `${BASE}${levelFile('catalog', level)}`);
}

/** The library questions of one level tagged with each concept (for the Learn pages and concept drills). */
export function loadConceptIndex(level: Level = teamLevel()): Promise<ConceptIndex> {
  return cached(conceptPromises, level, `${BASE}${levelFile('concepts', level)}`);
}

const catalogMaps = new WeakMap<Catalog, Map<string, CatalogRow>>();

/** Catalog rows by question id. */
export function catalogById(catalog: Catalog): Map<string, CatalogRow> {
  let m = catalogMaps.get(catalog);
  if (!m) {
    m = new Map(catalog.questions.map((r) => [r[0], r]));
    catalogMaps.set(catalog, m);
  }
  return m;
}

export interface Located {
  question: Question;
  pair: QuestionPair;
  round: Round;
  set: QuestionSet;
}

const locatedBySet = new WeakMap<QuestionSet, Map<string, Located>>();

function locate(set: QuestionSet): Map<string, Located> {
  let m = locatedBySet.get(set);
  if (!m) {
    m = new Map();
    for (const round of set.rounds) {
      for (const pair of round.pairs) {
        m.set(pair.tossup.id, { question: pair.tossup, pair, round, set });
        if (pair.bonus) m.set(pair.bonus.id, { question: pair.bonus, pair, round, set });
      }
    }
    locatedBySet.set(set, m);
  }
  return m;
}

/** Find questions by id, loading only the sets they come from. Unknown ids are left out. */
export async function loadQuestions(allIds: string[]): Promise<Map<string, Located>> {
  const ids = allIds.filter((id) => !isVisualId(id));
  const visualIds = allIds.filter(isVisualId);
  const setIds = [...new Set(ids.map(setIdOf))];
  // Questions from packets the team uploaded live in the team's own data, not in the library files.
  const teamSets = getData()
    .packets.filter((p) => p.kind === 'upload' && p.set && setIds.includes(p.set.id))
    .map((p) => p.set!);
  const librarySetIds = setIds.filter((id) => !id.startsWith('team-'));
  const index = librarySetIds.length ? await loadIndex() : { sets: [] };
  const sets = [
    ...teamSets,
    ...(await Promise.all(librarySetIds.filter((id) => index.sets.some((s) => s.id === id)).map((id) => loadSetById(id)))),
  ];
  const out = new Map<string, Located>();
  for (const set of sets) {
    const m = locate(set);
    for (const id of ids) {
      const found = m.get(id);
      if (found) out.set(id, found);
    }
  }
  // Visual questions (generated, photo set, the team's own) stand alone: a bonus with no toss-up.
  if (visualIds.length) {
    for (const [id, question] of await loadVisualQuestions(visualIds)) {
      out.set(id, { question, pair: { number: 1, tossup: question, bonus: question }, round: visualRound(id), set: VISUAL_SET });
    }
  }
  return out;
}

export function findRound(set: QuestionSet, roundId: string): Round | undefined {
  return set.rounds.find((r) => r.id === roundId);
}

export function roundQuestions(round: Round): Question[] {
  return round.pairs.flatMap((p) => (p.bonus ? [p.tossup, p.bonus] : [p.tossup]));
}

export interface AsyncState<T> {
  data?: T;
  error?: Error;
  loading: boolean;
}

/** Run a loader when its key changes. Pass key null to skip. */
export function useAsync<T>(key: string | null, loader: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: key !== null });
  useEffect(() => {
    if (key === null) {
      setState({ loading: false });
      return;
    }
    let live = true;
    setState({ loading: true });
    loader().then(
      (data) => live && setState({ data, loading: false }),
      (error: unknown) => live && setState({ error: error instanceof Error ? error : new Error(String(error)), loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function useIndex(): AsyncState<LibraryIndex> {
  return useAsync('index', loadIndex);
}

export function useSet(setId: string | null): AsyncState<QuestionSet> {
  return useAsync(setId, () => loadSetById(setId!));
}

/** The catalog of the team's level (reloads if the team changes level). */
export function useCatalog(): AsyncState<Catalog> {
  const level = useTeamLevel();
  return useAsync(`catalog-${level}`, () => loadCatalog(level));
}

export function useConceptIndex(): AsyncState<ConceptIndex> {
  const level = useTeamLevel();
  return useAsync(`concepts-${level}`, () => loadConceptIndex(level));
}

/** Human label for a set, e.g. "Set 17 · 2022". */
export function setLabel(s: Pick<SetSummary, 'setNumber' | 'year' | 'title'>): string {
  if (s.setNumber) return `Set ${s.setNumber}${s.year ? ` · ${s.year}` : ''}`;
  return s.title;
}
