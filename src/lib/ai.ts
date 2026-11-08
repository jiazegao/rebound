/**
 * Optional AI help from the team server (server/src/ai.ts): question drafts from a cited passage, answer
 * explanations and concept card drafts. It shows up only when this device is connected to a shared team whose
 * server has AI turned on. Everything it returns is a draft for a person to check, and stays labeled.
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { CoreSubject, Letter, Question } from '../core/schema';
import { currentSession, teamRequest, useSync } from './sync';

export const MIN_PASSAGE_CHARS = 200;
export const MAX_PASSAGE_CHARS = 12_000;
export const MAX_AI_DRAFTS = 5;

export interface AiStatus {
  enabled: boolean;
  model?: string;
  dailyLimit?: number;
  usedToday?: number;
}

interface Usage {
  dailyLimit: number;
  usedToday: number;
}

export interface AiDraft {
  kind: 'tossup' | 'bonus';
  format: 'short_answer' | 'multiple_choice';
  stem: string;
  choices?: Record<Letter, string>;
  answerLetter?: Letter;
  answer: string;
  accept: string[];
  /** The passage's sentence that supports the answer. */
  support: string;
  /** A second call's answer, given without the key or the passage, and whether the checker accepts it. */
  blindAnswer?: string;
  blindAgreed?: boolean;
}

export interface AiExplanation {
  explanation: string;
  answerLooksWrong: boolean;
  model: string;
  cached: boolean;
}

export interface AiCardDraft {
  summary: string;
  facts: string[];
  traps: string;
}

/* ---------------- whether AI help is on, and today's use ---------------- */

let snapshot: { key: string; value: AiStatus | null; at: number } = { key: '', value: null, at: 0 };
let loadingKey: string | null = null;
const listeners = new Set<() => void>();

function emit(next: typeof snapshot) {
  snapshot = next;
  for (const l of listeners) l();
}

function sessionKey(): string {
  const s = currentSession();
  return s ? `${s.serverUrl}|${s.teamId}|${s.member.id}` : '';
}

/** Asks the server once per session (again a minute after a failure, for a device that was offline). */
async function ensureStatus(key: string): Promise<void> {
  if (loadingKey === key) return;
  if (snapshot.key === key && (snapshot.value?.enabled || Date.now() - snapshot.at < 60_000)) return;
  loadingKey = key;
  try {
    const value = await teamRequest<AiStatus>('/ai');
    if (sessionKey() === key) emit({ key, value: { ...value, enabled: value.enabled === true }, at: Date.now() });
  } catch {
    // An older server without AI routes, or no connection: no AI help for now.
    if (sessionKey() === key) emit({ key, value: { enabled: false }, at: Date.now() });
  } finally {
    if (loadingKey === key) loadingKey = null;
  }
}

/** AI help for this device's shared team, or null while unknown or when the device is not connected. */
export function useAiStatus(): AiStatus | null {
  const { state } = useSync();
  const key = state ? `${state.serverUrl}|${state.teamId}|${state.member.id}` : '';
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
  useEffect(() => {
    if (key) void ensureStatus(key);
  }, [key]);
  return key && snap.key === key ? snap.value : null;
}

function noteUsage(u: Usage) {
  if (snapshot.value?.enabled) emit({ ...snapshot, value: { ...snapshot.value, dailyLimit: u.dailyLimit, usedToday: u.usedToday } });
}

/** "12 of 50 AI calls used today" */
export function usageText(s: AiStatus | null): string {
  return s?.enabled && s.dailyLimit ? `${s.usedToday ?? 0} of ${s.dailyLimit} AI calls used today` : '';
}

/* ---------------- requests ---------------- */

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export async function aiDraftQuestions(input: {
  passage: string;
  source: string;
  subject: CoreSubject;
  kind: 'tossup' | 'bonus' | 'either';
  count: number;
}): Promise<{ drafts: AiDraft[]; model: string }> {
  const res = await teamRequest<{ drafts: AiDraft[]; model: string } & Usage>('/ai/draft', post(input));
  noteUsage(res);
  return res;
}

/** Whether a question can be explained: the model sees only text, so not figures or missing answers. */
export function explainable(q: Pick<Question, 'answer' | 'answerLetter' | 'figure' | 'visual' | 'stem'>): boolean {
  return !q.figure && !q.visual && q.stem.trim().length > 0 && (q.answer.trim().length > 0 || !!q.answerLetter);
}

export async function aiExplain(q: Pick<Question, 'subject' | 'stem' | 'choices' | 'answer' | 'answerLetter' | 'format'>): Promise<AiExplanation> {
  const answer = q.format === 'multiple_choice' && q.answerLetter ? `${q.answerLetter}) ${q.answer}` : q.answer;
  const choices = q.format === 'multiple_choice' && q.choices ? { choices: q.choices } : {};
  const res = await teamRequest<AiExplanation & Usage>('/ai/explain', post({ subject: q.subject, stem: q.stem, ...choices, answer }));
  noteUsage(res);
  return res;
}

export async function aiDraftCard(input: { concept: string; passage: string; source: string }): Promise<{ card: AiCardDraft; model: string }> {
  const res = await teamRequest<{ card: AiCardDraft; model: string } & Usage>('/ai/card', post(input));
  noteUsage(res);
  return res;
}
