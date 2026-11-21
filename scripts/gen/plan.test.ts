import { describe, expect, it } from 'vitest';
import { CORE_SUBJECTS, LETTERS } from '../../src/core/schema';
import { libraryBuilt } from './library';
import { describeSlot, loadTopicCounts, pairSubjects, planRound, TOPIC_LIMIT, topicWeights } from './plan';
import { loadProfile } from './profile';

describe('a round’s categories', () => {
  it('run the six-category cycle, with three Energy pairs in a 23-pair round', () => {
    const in23 = pairSubjects(23);
    expect(in23).toHaveLength(23);
    expect(in23.slice(0, 6)).toEqual(['biology', 'chemistry', 'earth_space', 'energy', 'math', 'physics']);
    for (const s of CORE_SUBJECTS) expect(in23.filter((x) => x === s)).toHaveLength(s === 'energy' ? 3 : 4);
    // The first 18 pairs are a whole virtual-format round.
    expect(in23.slice(0, 18)).toEqual(pairSubjects(18));
    expect(() => pairSubjects(25)).toThrow();
  });
});

describe('topic weights', () => {
  it('follow how often DOE asks a topic, with half as much again where the library is thin but the topic belongs', () => {
    const w = Object.fromEntries(topicWeights('chemistry', { 'chemistry.organic': 400, 'chemistry.kinetics': 60, 'chemistry.nuclear': 6, 'chemistry.gases': 0 }).map((t) => [t.topic, t.weight]));
    expect(w['chemistry.organic']).toBe(400);
    expect(w['chemistry.kinetics']).toBe(90);
    // Six questions at a level means the topic is mostly above it: no boost.
    expect(w['chemistry.nuclear']).toBe(6);
    expect(w['chemistry.gases']).toBeUndefined();
  });
});

describe.skipIf(!libraryBuilt())('a round plan', () => {
  const profile = loadProfile();
  const plan = (level: 'HS' | 'MS', tier: 'early' | 'late', seed: number, pairs: 23 | 18 = 23) => planRound({ level, tier, pairs, seed, profile, topicCounts: loadTopicCounts(level) });

  it('has a toss-up and a bonus for each pair, in the pair’s category, and is the same for the same seed', () => {
    const p = plan('HS', 'late', 3);
    expect(p.slots).toHaveLength(46);
    expect(p.slots.map((s) => s.id).slice(0, 4)).toEqual(['t01', 'b01', 't02', 'b02']);
    pairSubjects(23).forEach((subject, i) => {
      expect(p.slots[2 * i]).toMatchObject({ kind: 'tossup', subject, level: 'HS', tier: 'late' });
      expect(p.slots[2 * i + 1]).toMatchObject({ kind: 'bonus', subject });
    });
    expect(plan('HS', 'late', 3)).toEqual(p);
    expect(plan('HS', 'late', 4).slots.map((s) => s.topic)).not.toEqual(p.slots.map((s) => s.topic));
    expect(plan('MS', 'early', 3, 18).slots).toHaveLength(36);
  });

  it('keeps every round inside DOE’s range of multiple choice, with keys spread over the four letters', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const level of ['HS', 'MS'] as const) {
        const p = plan(level, seed % 2 ? 'early' : 'late', seed);
        const band = profile.levels[level].perRound.multipleChoice;
        const choice = p.slots.filter((s) => s.form === 'multiple_choice');
        expect(choice.length / p.slots.length).toBeGreaterThanOrEqual(band.low);
        expect(choice.length / p.slots.length).toBeLessThanOrEqual(band.high);
        const counts = LETTERS.map((l) => choice.filter((s) => s.letter === l).length);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        expect(p.slots.filter((s) => s.form !== 'multiple_choice').every((s) => s.letter === undefined)).toBe(true);
      }
    }
  });

  it('draws topics of the slot’s own category, none more than twice a round', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = plan('HS', 'early', seed);
      const used = new Map<string, number>();
      for (const s of p.slots) {
        expect(s.topic.startsWith(`${s.subject}.`)).toBe(true);
        used.set(s.topic, (used.get(s.topic) ?? 0) + 1);
      }
      expect(Math.max(...used.values())).toBeLessThanOrEqual(TOPIC_LIMIT);
    }
  });

  it('gives DOE’s mix over many rounds: calculations in math and physics, lists mostly in bonuses', () => {
    const slots = Array.from({ length: 60 }, (_, i) => plan('HS', 'late', i + 1).slots).flat();
    const share = (test: (s: (typeof slots)[number]) => boolean, of: (s: (typeof slots)[number]) => boolean) => slots.filter((s) => of(s) && test(s)).length / slots.filter(of).length;
    expect(share((s) => s.skill === 'computation', (s) => s.subject === 'math')).toBeGreaterThan(0.95);
    expect(share((s) => s.skill === 'computation', (s) => s.subject === 'physics' && s.kind === 'bonus')).toBeGreaterThan(0.5);
    expect(share((s) => s.skill === 'computation', (s) => s.subject === 'biology')).toBeLessThan(0.1);
    expect(share((s) => s.form === 'identify_all', (s) => s.kind === 'bonus')).toBeGreaterThan(0.13);
    expect(share((s) => s.form === 'identify_all', (s) => s.kind === 'tossup')).toBeLessThan(0.06);
    expect(share((s) => s.form === 'multiple_choice', (s) => s.subject === 'math' && s.kind === 'bonus')).toBeLessThan(0.08);
    // Half the questions that are not calculations ask for application in a late round.
    const applied = share((s) => s.skill === 'application', (s) => s.skill !== 'computation');
    expect(applied).toBeGreaterThan(0.4);
    expect(applied).toBeLessThan(0.6);
  });

  it('can say a slot in words', () => {
    expect(describeSlot({ id: 't07', level: 'HS', tier: 'late', kind: 'tossup', subject: 'biology', form: 'multiple_choice', skill: 'recall', topic: 'biology.genetics', letter: 'X' })).toBe('t07 biology toss-up, multiple choice (key on X), recall: Genetics');
  });
});
