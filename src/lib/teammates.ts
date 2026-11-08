/**
 * Teammates' practice, for the pages that compare players: team stats, lineups, who covers what, the scrimmage
 * builder (who has heard what), assignment progress and a teammate's progress page. Each teammate's visible
 * collections (game and match answers, practice answers, heard ledgers, what they have read, finished assignments)
 * load when such a page opens, and again after each refresh of the team (every 30 seconds while it stays open), so
 * they follow the member list just fetched. Review cards and daily plans stay private: the server never sends them.
 * Nothing here is ever sent back.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { RecordOut, TeamResponse } from '../core/accounts';
import type { Outcome } from '../core/review';
import * as api from './api';
import { getSession, refreshNow, subscribeSession, useSession } from './cloud';
import { applyUserRecords } from './records';
import { emptyData, useData, type AppData } from './store';

/** One teammate's visible practice, in AppData's shape (only their own entries are filled in). */
interface Teammate {
  cursor: number;
  view: AppData;
  answers: Map<string, Outcome>;
  loadedAt: number;
}

const cache = new Map<string, Teammate>();
let state = { version: 0, loading: false, error: null as string | null };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let sessionKey = '';

function setState(fields: Partial<typeof state>) {
  state = { ...state, ...fields };
  for (const l of listeners) l();
}

/** Signed out, or on another team now: forget what was loaded. */
subscribeSession(() => {
  const s = getSession();
  const key = `${s.user?.id ?? ''}:${s.team?.team.id ?? ''}`;
  if (key === sessionKey) return;
  sessionKey = key;
  cache.clear();
  setState({ version: state.version + 1, error: null });
});

const FRESH_MS = 25_000;

async function loadOne(teamId: string, userId: string): Promise<boolean> {
  const key = `${teamId}:${userId}`;
  const before = cache.get(key) ?? { cursor: 0, view: emptyData(), answers: new Map<string, Outcome>(), loadedAt: 0 };
  let cursor = before.cursor;
  const records: RecordOut[] = [];
  for (let i = 0; i < 1_000; i++) {
    const res = await api.getMemberRecords(teamId, userId, cursor);
    records.push(...(res.records ?? []));
    const next = Math.max(cursor, res.cursor ?? cursor);
    const done = !res.more || next === cursor;
    cursor = next;
    if (done) break;
  }
  // The session may have moved on while this was loading.
  if (`${getSession().user?.id ?? ''}:${getSession().team?.team.id ?? ''}` !== sessionKey || getSession().team?.team.id !== teamId) return false;
  if (records.length === 0) {
    cache.set(key, { ...before, cursor, loadedAt: Date.now() });
    return false;
  }
  const view = structuredClone(before.view);
  const answers = new Map(before.answers);
  applyUserRecords(view, userId, records, answers);
  cache.set(key, { cursor, view, answers, loadedAt: Date.now() });
  return true;
}

/** Load (or bring up to date) the practice of every teammate not loaded in the last `olderThanMs`, a few at a time. */
export function loadTeammates(olderThanMs = FRESH_MS): Promise<void> {
  if (inFlight) return inFlight;
  const s = getSession();
  const teamId = s.team?.team.id;
  const me = s.user?.id;
  if (!teamId || !me || s.status !== 'ready') return Promise.resolve();
  const ids = s.team!.members.map((m) => m.userId).filter((id) => id !== me && Date.now() - (cache.get(`${teamId}:${id}`)?.loadedAt ?? 0) > olderThanMs);
  if (ids.length === 0) return Promise.resolve();
  setState({ loading: true });
  inFlight = (async () => {
    let error: string | null = null;
    let changed = false;
    let left = false;
    const waiting = [...ids];
    const worker = async () => {
      for (let id = waiting.shift(); id !== undefined; id = waiting.shift()) {
        try {
          if (await loadOne(teamId, id)) changed = true;
        } catch (e) {
          if (e instanceof api.ApiError && (e.status === 403 || e.status === 404)) {
            // Not teammates any more (they left or were removed, or this player was, since the member list was
            // fetched): no error. Their practice stops showing, and the team is fetched again below.
            if (getSession().team?.team.id === teamId) cache.set(`${teamId}:${id}`, { cursor: 0, view: emptyData(), answers: new Map(), loadedAt: Date.now() });
            changed = true;
            left = true;
          } else error ??= e instanceof Error ? e.message : String(e);
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setState({ loading: false, error, ...(changed ? { version: state.version + 1 } : {}) });
    if (left) void refreshNow();
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * AppData with teammates' visible practice added to the player's own (attempts, answers, heard ledgers, what they
 * read, finished assignments). Only current members are included. Review cards and plans are the player's own.
 */
export function withTeammates(d: AppData, me: string | null, teammates: Array<{ id: string; view: AppData }>): AppData {
  if (teammates.length === 0) return d;
  const out: AppData = {
    ...d,
    attempts: d.attempts.filter((a) => a.playerId === me),
    answers: d.answers.filter((o) => o.playerId === me),
    seen: me && d.seen[me] ? { [me]: d.seen[me] } : {},
    conceptReads: me && d.conceptReads[me] ? { [me]: d.conceptReads[me] } : {},
    completions: Object.fromEntries(Object.entries(d.completions).filter(([, c]) => c.playerId === me)),
  };
  for (const { id, view } of teammates) {
    if (id === me) continue;
    out.attempts.push(...view.attempts.filter((a) => a.playerId === id));
    out.answers.push(...view.answers.filter((o) => o.playerId === id));
    if (view.seen[id]) out.seen[id] = view.seen[id];
    if (view.conceptReads[id]) out.conceptReads[id] = view.conceptReads[id];
    for (const c of Object.values(view.completions)) if (c.playerId === id) out.completions[c.id] = c;
  }
  out.attempts.sort((a, b) => a.t - b.t);
  out.answers.sort((a, b) => a.t - b.t);
  return out;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** For tests: whether teammates are loading, and the last load's error. */
export function teammatesStatus(): { loading: boolean; error: string | null } {
  return { loading: state.loading, error: state.error };
}

/** `d` (the store's data) with the teammates loaded so far, for the current team's members. */
export function teamDataFrom(d: AppData, teamId: string | null, memberIds: string[]): AppData {
  if (!teamId) return d;
  const me = d.settings.soloPlayerId;
  const teammates = memberIds
    .filter((id) => id && id !== me)
    .map((id) => ({ id, view: cache.get(`${teamId}:${id}`)?.view }))
    .filter((t): t is { id: string; view: AppData } => !!t.view);
  return withTeammates(d, me, teammates);
}

/**
 * The store's data plus every teammate's visible practice, for team pages. Loads teammates on first use and after
 * each refresh of the team (every 30 seconds while the page is open and visible). `loading` is true until the first
 * load finishes.
 */
export function useTeamData(): { data: AppData; loading: boolean; error: string | null } {
  const data = useData();
  const snap = useSyncExternalStore(subscribe, () => state);
  const s = useSession();
  const teamId = s.team?.team.id ?? null;
  const memberIds = (s.team?.members ?? []).map((m) => m.userId).join(',');

  // On opening, what is not fresh loads (going from one team page to another does not load it all again). After each
  // later refresh of the team (cloud.ts fetches it every 30 seconds while the page is visible; each fetch is a new
  // object), everyone's practice is brought up to date, so the members asked for are the ones the team just listed.
  const team = s.team;
  const opened = useRef<TeamResponse | null>(null);
  useEffect(() => {
    if (!teamId) return;
    void loadTeammates(opened.current ? 0 : FRESH_MS);
    opened.current = team;
  }, [teamId, team]);

  const merged = useMemo(
    () => teamDataFrom(data, teamId, memberIds.split(',')),
    // `snap.version` changes whenever a teammate's practice does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, teamId, memberIds, snap.version],
  );

  const pending = !!teamId && memberIds.split(',').some((id) => id && id !== data.settings.soloPlayerId && !cache.has(`${teamId}:${id}`));
  return { data: merged, loading: pending && (snap.loading || !snap.error), error: snap.error };
}
