import { describe, expect, it } from 'vitest';
import { completionId, daysBetween, defaultTitle, dueState, gapSuggestions, openAssignments, progress } from './assignments';
import type { Assignment, Player } from './schema';

const assignment = (fields: Partial<Assignment>): Assignment => ({
  id: 'a1',
  kind: 'drill',
  title: 'Drill',
  subject: 'biology',
  topic: 'biology.ecology',
  count: 8,
  playerIds: ['p1', 'p2'],
  due: '2026-11-10',
  createdAt: '2026-11-07T10:00:00.000Z',
  createdBy: 'c',
  ...fields,
});

describe('assignments', () => {
  it('counts days to the due date', () => {
    expect(daysBetween('2026-11-07', '2026-11-10')).toBe(3);
    expect(daysBetween('2026-11-07', '2026-11-07')).toBe(0);
    expect(daysBetween('2026-11-30', '2026-12-01')).toBe(1);
    expect(dueState('2026-11-07', '2026-11-06')).toBe('overdue');
    expect(dueState('2026-11-07', '2026-11-07')).toBe('today');
    expect(dueState('2026-11-07', '2026-11-09')).toBe('soon');
    expect(dueState('2026-11-07', '2026-11-20')).toBe('later');
  });

  it("lists a player's unfinished work, soonest first", () => {
    const list = [assignment({ id: 'late', due: '2026-11-20' }), assignment({ id: 'soon', due: '2026-11-08' }), assignment({ id: 'other', playerIds: ['p3'] })];
    const completions = { [completionId('late', 'p2')]: { id: completionId('late', 'p2'), assignmentId: 'late', playerId: 'p2', at: '' } };
    expect(openAssignments('p1', list, completions, '2026-11-07').map((x) => x.assignment.id)).toEqual(['soon', 'late']);
    expect(openAssignments('p2', list, completions, '2026-11-07').map((x) => x.assignment.id)).toEqual(['soon']);
    // Long overdue work drops off.
    expect(openAssignments('p1', list, {}, '2026-12-30')).toEqual([]);
    expect(progress(list[0], completions)).toEqual({ done: 1, total: 2 });
  });

  it('suggests frequent topics nobody covers, for their owners', () => {
    const players: Player[] = [
      { id: 'p1', name: 'Ann', role: 'member', active: true, primarySubject: 'biology' },
      { id: 'p2', name: 'Ben', role: 'member', active: true, secondarySubject: 'physics' },
      { id: 'c', name: 'Coach', role: 'coach', active: true },
    ];
    const coverage = [
      { topicId: 'biology.ecology', subject: 'biology' as const, best: { line: { p: 0.4 } } },
      { topicId: 'biology.genetics', subject: 'biology' as const, best: { line: { p: 0.8 } } },
      { topicId: 'physics.optics', subject: 'physics' as const, best: null },
      { topicId: 'math.algebra', subject: 'math' as const, best: null },
    ];
    const counts = { 'biology.ecology': 97, 'biology.genetics': 123, 'physics.optics': 150, 'math.algebra': 518 };
    const s = gapSuggestions(coverage, counts, players);
    expect(s.map((x) => x.topic)).toEqual(['math.algebra', 'physics.optics', 'biology.ecology']);
    expect(s.find((x) => x.topic === 'biology.ecology')!.playerIds).toEqual(['p1']);
    expect(s.find((x) => x.topic === 'physics.optics')!.playerIds).toEqual(['p2']);
    expect(s.find((x) => x.topic === 'math.algebra')!.playerIds).toEqual(['p1', 'p2']);
  });

  it('writes plain default titles', () => {
    expect(defaultTitle({ kind: 'drill', topic: 'biology.ecology', count: 8 })).toBe('Drill: Ecology (8 questions)');
    expect(defaultTitle({ kind: 'concept', conceptId: 'math.geometry.circles' })).toBe('Read: Circles, arcs and chords');
    expect(defaultTitle({ kind: 'review' })).toBe('Clear your due reviews');
    expect(defaultTitle({ kind: 'packet' }, 'Scrimmage Nov 7')).toBe('Play: Scrimmage Nov 7');
  });
});
