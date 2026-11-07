/**
 * Assignments: work a captain or coach gives players (a drill, a packet to play solo, a concept card
 * to read, or their reviews), with a due date. Each player's completion is its own record.
 */
import type { Assignment, Completion, CoreSubject, Player } from './schema';
import { topicById } from './taxonomy';

export function completionId(assignmentId: string, playerId: string): string {
  return `${assignmentId}:${playerId}`;
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

/** Days from `today` ("YYYY-MM-DD") to `due` ("YYYY-MM-DD"); negative when past. */
export function daysBetween(today: string, due: string): number {
  const a = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  const b = Date.UTC(Number(due.slice(0, 4)), Number(due.slice(5, 7)) - 1, Number(due.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

export function dueState(today: string, due: string): DueState {
  const d = daysBetween(today, due);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 3) return 'soon';
  return 'later';
}

export interface OpenAssignment {
  assignment: Assignment;
  state: DueState;
  days: number;
}

/** A player's unfinished assignments, soonest due first. Finished ones and ones past by more than two weeks drop off. */
export function openAssignments(playerId: string, assignments: Assignment[], completions: Record<string, Completion>, today: string): OpenAssignment[] {
  return assignments
    .filter((a) => a.playerIds.includes(playerId) && !completions[completionId(a.id, playerId)])
    .map((a) => ({ assignment: a, days: daysBetween(today, a.due), state: dueState(today, a.due) }))
    .filter((x) => x.days >= -14)
    .sort((a, b) => a.days - b.days || a.assignment.createdAt.localeCompare(b.assignment.createdAt));
}

/** How many of an assignment's players have finished it. */
export function progress(a: Assignment, completions: Record<string, Completion>): { done: number; total: number } {
  return { done: a.playerIds.filter((p) => completions[completionId(a.id, p)]).length, total: a.playerIds.length };
}

/** Minutes an assignment takes, for the daily plan. */
export function assignmentMinutes(a: Assignment): number {
  if (a.kind === 'drill') return a.count ?? 8;
  if (a.kind === 'concept') return 3;
  if (a.kind === 'review') return 10;
  return 20;
}

export interface GapSuggestion {
  subject: CoreSubject;
  topic: string;
  /** Best mastery on the team in the topic, or null when nobody has enough answers. */
  best: number | null;
  /** Library questions in the topic. */
  questions: number;
  /** Who should take it: the subject's primary owners, else its secondary owners, else everyone. */
  playerIds: string[];
}

/**
 * Topics worth assigning: frequent topics where nobody on the team is above 60% yet (or nobody has
 * answered enough), most frequent first.
 */
export function gapSuggestions(
  coverage: Array<{ topicId: string; subject: CoreSubject; best: { line: { p: number } } | null }>,
  topicCounts: Record<string, number>,
  players: Player[],
  limit = 5,
): GapSuggestion[] {
  const playing = players.filter((p) => p.active && p.role !== 'coach');
  return coverage
    .filter((c) => (c.best === null || c.best.line.p < 0.6) && (topicCounts[c.topicId] ?? 0) > 0)
    .sort((a, b) => (topicCounts[b.topicId] ?? 0) - (topicCounts[a.topicId] ?? 0))
    .slice(0, limit)
    .map((c) => {
      const primary = playing.filter((p) => p.primarySubject === c.subject).map((p) => p.id);
      const secondary = playing.filter((p) => p.secondarySubject === c.subject).map((p) => p.id);
      return {
        subject: c.subject,
        topic: c.topicId,
        best: c.best ? c.best.line.p : null,
        questions: topicCounts[c.topicId] ?? 0,
        playerIds: primary.length ? primary : secondary.length ? secondary : playing.map((p) => p.id),
      };
    });
}

/** A short default title for an assignment. */
export function defaultTitle(a: Pick<Assignment, 'kind' | 'subject' | 'topic' | 'count' | 'conceptId'>, packetTitle?: string): string {
  if (a.kind === 'drill') {
    const topic = topicById(a.topic);
    return `Drill: ${topic ? topic.name : a.subject ?? 'mixed'} (${a.count ?? 8} questions)`;
  }
  if (a.kind === 'concept') {
    const topic = topicById(a.conceptId?.split('.').slice(0, 2).join('.'));
    const concept = topic?.concepts.find((c) => c.id === a.conceptId);
    return `Read: ${concept?.name ?? 'a concept card'}`;
  }
  if (a.kind === 'review') return 'Clear your due reviews';
  return `Play: ${packetTitle ?? 'a team packet'}`;
}
