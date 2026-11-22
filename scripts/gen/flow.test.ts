import { describe, expect, it } from 'vitest';
import { chooseIdeas, draftQuery, ideaGroups, makeDrafts, type FlowContext, type ScreenedIdea, type Stage } from './flow';
import { loadLabs } from './labs';
import { libraryBuilt, loadLibrary, topicsById } from './library';
import { NO_USAGE, type ModelReply, type ModelRequest } from './llm';
import { loadProfile } from './profile';
import { buildIndex } from './search';
import { scripted, type Script } from './trials/standin';
import type { Slot } from './types';

const slot = (id: string, more: Partial<Slot> = {}): Slot => ({ id, level: 'HS', tier: 'late', kind: id.includes('t') ? 'tossup' : 'bonus', subject: 'biology', form: 'short_answer', skill: 'recall', topic: 'biology.genetics', ...more });
const idea = (answer: string, relation: ScreenedIdea['relation'], dropped?: string): ScreenedIdea => ({ idea: { answer, fact: `About ${answer}.`, cue: 'A cue.' }, relation, match: '', reason: '', ...(dropped ? { dropped } : {}) });

describe('grouping slots for ideas', () => {
  it('asks for the slots of a topic together, two at most, and for each Energy slot alone', () => {
    const groups = ideaGroups([slot('t01'), slot('b01'), slot('t02', { topic: 'biology.cells' }), slot('b02'), slot('t04', { subject: 'energy', topic: 'energy.solar' }), slot('b04', { subject: 'energy', topic: 'energy.solar' })]);
    expect(groups.map((g) => g.map((s) => s.id))).toEqual([['t01', 'b01'], ['b02'], ['t02'], ['t04'], ['b04']]);
  });
});

describe('choosing a slot’s idea', () => {
  it('takes the idea furthest from the library, in the writer’s order, and keeps the next as a spare', () => {
    const ideas = [idea('A', 'related'), idea('B', 'same', 'repeat'), idea('C', 'new'), idea('D', 'template')];
    const taken = new Set<string>();
    expect(chooseIdeas(ideas, taken)).toEqual({ chosen: ideas[2]!.idea, spare: ideas[0]!.idea });
    expect([...taken]).toEqual(['c']);
  });

  it('passes over an answer another slot has taken, and says so', () => {
    const ideas = [idea('Mitosis', 'new'), idea('Meiosis', 'related')];
    expect(chooseIdeas(ideas, new Set(['mitosis']))).toEqual({ chosen: ideas[1]!.idea });
    expect(ideas[0]!.dropped).toMatch(/same answer/);
    expect(chooseIdeas([idea('X', 'same', 'repeat')], new Set())).toEqual({});
  });
});

describe('a draft as search takes it', () => {
  it('has the stem, the answer and the choices', () => {
    expect(draftQuery({ kind: 'tossup', subject: 'biology', format: 'short_answer', stem: 'What?', answer: 'X', accept: [], reject: [] })).toEqual({ stem: 'What?', answer: 'X' });
  });
});

describe.skipIf(!libraryBuilt())('the flow from slots to checked drafts', () => {
  const library = loadLibrary();
  const questions = library.map((x) => x.question);
  const index = buildIndex(questions);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const base = { library, index, byId, topicOf: topicsById('HS'), checks: { profile: loadProfile(), labs: loadLabs() }, salt: 'test' };

  /** A `send` that answers by the scripted pipeline, and keeps what each stage was asked. */
  function sender(script: Script) {
    const answer = scripted(script);
    const asked: Partial<Record<Stage, ModelRequest[]>> = {};
    const send: FlowContext['send'] = async (stage, _model, _prompt, requests) => {
      asked[stage] = requests;
      return new Map(requests.map((r): [string, ModelReply] => {
        const json = answer(r.user, r.system);
        return [r.id, { id: r.id, step: r.step, model: r.model, at: '2026-11-21T00:00:00.000Z', outcome: 'ok', text: JSON.stringify(json), json, citations: [], codeRuns: 0, usage: { ...NO_USAGE, input: 1000, output: 100 }, batch: false, cost: 0.01 }];
      }));
    };
    return { send, asked };
  }

  const slots = [
    slot('t01', { form: 'multiple_choice', letter: 'Y' }),
    slot('b01'),
    slot('t02', { topic: 'biology.cells', form: 'multiple_choice', letter: 'X' }),
    slot('b02', { topic: 'biology.cells', form: 'identify_all' }),
    slot('t03', { subject: 'chemistry', topic: 'chemistry.organic' }),
    slot('b03', { subject: 'chemistry', topic: 'chemistry.organic', form: 'rank' }),
    slot('t05', { subject: 'physics', topic: 'physics.fluids', form: 'multiple_choice', letter: 'Z' }),
    slot('b05', { subject: 'physics', topic: 'physics.fluids' }),
  ];
  const models = { writer: 'claude-opus-5-5', ideaJudge: 'claude-haiku-5-5', matcher: 'claude-haiku-5-5', checker: 'claude-sonnet-5-5' };

  it('takes every slot from ideas to a solved draft when nothing goes wrong', async () => {
    const { send, asked } = sender({});
    const { runs, costs } = await makeDrafts(slots, models, { ...base, send });
    expect(runs.map((r) => r.outcome)).toEqual(Array(8).fill('passed'));
    // Four topics, so four idea requests; three ideas a slot, each screened; the first of each repeats the library.
    expect(asked.ideas).toHaveLength(4);
    expect(asked['idea-screen']).toHaveLength(24);
    expect(runs.every((r) => r.ideas[0]!.dropped && r.chosen === r.ideas[2]!.idea && r.spare === r.ideas[1]!.idea)).toBe(true);
    // The writer is shown library questions near its idea, and the checkers only the question.
    expect(asked.write![0]!.user).toMatch(/<library_questions_near_this_idea>\n\[doe-/);
    expect(asked.solve![0]!.user).not.toContain('ANSWER');
    expect(asked.repair).toBeUndefined();
    // The key is moved to the letter the plan asked for.
    expect(runs[0]!.written!.draft.question.answerLetter).toBe('Y');
    expect(runs[0]!.written!.draft.question.choices!.Y).toBe('Rightname');
    expect(runs[3]!.written!.draft.question.answer).toBe('1, 3');
    expect(runs.every((r) => r.judgment?.relation === 'new' && r.doubts.length === 0)).toBe(true);
    // No anchors were given, so nothing was rated.
    expect(asked.rate).toBeUndefined();
    expect(runs[0]!.rating).toBeUndefined();
    expect(costs.ideas).toMatchObject({ model: 'claude-opus-5-5', calls: 4 });
    expect(costs.ideas!.cost).toBeCloseTo(0.04, 6);
    expect(costs.solve).toMatchObject({ model: 'claude-sonnet-5-5', calls: 8 });
    expect(costs['idea-screen']!.usage.input).toBe(24_000);
  }, 60_000);

  it('drops a slot at the stage that fails it, and sends a doubt to the second look', async () => {
    const { send, asked } = sender({
      idea: (s, n) => (s === 'b01' ? 'reversed' : n === 1 ? 'same' : 'new'),
      brokenOnce: new Set(['t02']),
      brokenTwice: new Set(['b02']),
      textRepeats: new Set(['t03']),
      solverWrong: new Set(['b03', 'b05']),
      solverFlags: new Set(['t05']),
      rating: 2,
    });
    const anchors = { early: [], late: [] };
    const { runs } = await makeDrafts(slots, models, { ...base, send, anchors: () => anchors });
    const by = Object.fromEntries(runs.map((r) => [r.slot.id, r]));
    expect(by.t01!.outcome).toBe('passed');
    expect(by.b01!.ended).toEqual({ stage: 'idea-screen', reason: 'Every idea repeats the library, or another slot’s idea.' });
    expect(by.b01!.written).toBeUndefined();
    // One repair fixed t02; b02 failed twice and is dropped with the rules it broke.
    expect(asked.repair!.map((r) => r.id)).toEqual(['repair-t02', 'repair-b02']);
    expect(by.t02!).toMatchObject({ outcome: 'passed', repaired: true });
    expect(by.b02!.ended!.stage).toBe('style');
    expect(by.b02!.ended!.reason).toContain('list-answer');
    expect(by.t03!.ended!.stage).toBe('text-screen');
    expect(by.t03!.ended!.reason).toMatch(/^The library already asks it \(same with doe-/);
    // A solver who disagrees, or reports a fault, raises a doubt; it does not reject.
    expect(by.b03!.outcome).toBe('second-look');
    expect(by.b03!.doubts[0]).toBe('A solver who saw only the question answered 1, 2, 3, with confidence 3 of 5.');
    expect(by.t05!.outcome).toBe('second-look');
    expect(by.t05!.doubts).toEqual(['A solver reported a fault (ambiguous): Two readings.']);
    // A short answer the checker refuses goes to the matcher, which here rules it a different answer.
    // (A "Rank" question is a short answer too, so its wrong list is asked about as well.)
    expect(asked.match!.map((r) => r.id)).toEqual(['match-b03', 'match-b05']);
    expect(asked.match![1]!.user).toContain('<player_answer>\nsomething else\n</player_answer>');
    expect(by.b05!.match).toEqual({ verdict: 'reject', why: 'By rule.' });
    expect(by.b05!.outcome).toBe('second-look');
    expect(by.b05!.doubts).toEqual(['A solver who saw only the question answered something else, with confidence 3 of 5.']);
    // Only what came through is solved and rated.
    expect(asked.solve!.map((r) => r.id)).toEqual(['solve-t01', 'solve-t02', 'solve-b03', 'solve-t05', 'solve-b05']);
    expect(asked.rate).toHaveLength(5);
    expect(by.t01!.rating).toBe(2);
    expect(by.b02!.rating).toBeUndefined();
  }, 60_000);

  it('refuses a checker that is the writer’s own model, and slots that share an id', async () => {
    const { send } = sender({});
    await expect(makeDrafts(slots, { ...models, checker: 'claude-opus-5-5' }, { ...base, send })).rejects.toThrow(/writer’s model/);
    await expect(makeDrafts([slot('t01'), slot('t01')], models, { ...base, send })).rejects.toThrow(/same id/);
  });
});
