/** Loading question sets. DOE sets ship with the site as static JSON files under data/doe/. */
import { useEffect, useState } from 'react';
import type { LibraryIndex, Question, QuestionSet, Round, SetSummary } from '../core/schema';

const BASE = 'data/doe/';

let indexPromise: Promise<LibraryIndex> | null = null;
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

/** Human label for a set, e.g. "Set 17 · 2022". */
export function setLabel(s: Pick<SetSummary, 'setNumber' | 'year' | 'title'>): string {
  if (s.setNumber) return `Set ${s.setNumber}${s.year ? ` · ${s.year}` : ''}`;
  return s.title;
}
