/** Loading question sets. DOE sets ship with the site as static JSON files under data/doe/. */
import { useEffect, useState } from 'react';
import { setIdOf } from '../core/drill';
import type { Catalog, CatalogRow, LibraryIndex, Question, QuestionPair, QuestionSet, Round, SetSummary } from '../core/schema';

const BASE = 'data/doe/';

let indexPromise: Promise<LibraryIndex> | null = null;
let catalogPromise: Promise<Catalog> | null = null;
const setPromises = new Map<string, Promise<QuestionSet>>();

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

/** One compact row per question (subject, topic, round), for choosing drill questions without loading every set. */
export function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= fetchJson<Catalog>(`${BASE}catalog.json`).catch((err) => {
    catalogPromise = null;
    throw err;
  });
  return catalogPromise;
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
export async function loadQuestions(ids: string[]): Promise<Map<string, Located>> {
  const setIds = [...new Set(ids.map(setIdOf))];
  const index = await loadIndex();
  const sets = await Promise.all(
    setIds.filter((id) => index.sets.some((s) => s.id === id)).map((id) => loadSetById(id)),
  );
  const out = new Map<string, Located>();
  for (const set of sets) {
    const m = locate(set);
    for (const id of ids) {
      const found = m.get(id);
      if (found) out.set(id, found);
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

export function useCatalog(): AsyncState<Catalog> {
  return useAsync('catalog', loadCatalog);
}

/** Human label for a set, e.g. "Set 17 · 2022". */
export function setLabel(s: Pick<SetSummary, 'setNumber' | 'year' | 'title'>): string {
  if (s.setNumber) return `Set ${s.setNumber}${s.year ? ` · ${s.year}` : ''}`;
  return s.title;
}
