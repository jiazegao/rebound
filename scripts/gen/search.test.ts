import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_DIR, libraryBuilt, loadLibrary } from './library';
import { buildIndex, keywordSearch, nearCopies, neighbours, sameAnswer, TOP, type Query, type Searchable } from './search';

const q = (id: string, stem: string, answer: string, choices?: string[]): Searchable => ({
  id,
  stem,
  answer,
  ...(choices ? { choices: Object.fromEntries(choices.map((c, i) => ['WXYZ'[i]!, c])) } : {}),
});

const SMALL = [
  q('a', 'What layer of Earth is liquid and lies between the mantle and the inner core?', 'OUTER CORE'),
  q('b', 'What is the most abundant gas in Earth’s atmosphere?', 'NITROGEN'),
  q('c', 'Lichens are a symbiotic relationship of what 2 general types of organisms?', 'GREEN ALGAE AND FUNGI'),
  q('d', 'Which of the following is the term for resistance to flow in a liquid?', 'VISCOSITY', ['Viscosity', 'Surface tension', 'Malleability', 'Vapor pressure']),
  q('e', 'What is the third most abundant gas in Earth’s atmosphere?', 'ARGON'),
  q('f', 'In meters, how far does an object fall from rest in 2 seconds, taking g as 10 meters per second squared?', '20'),
];

describe('keyword search', () => {
  const index = buildIndex(SMALL);

  it('puts the question that shares the telling words first', () => {
    expect(keywordSearch(index, 'Which layer of Earth, between the mantle and the inner core, is a liquid?')[0]?.id).toBe('a');
    expect(keywordSearch(index, 'Which gas is the third most abundant in the atmosphere of Earth?')[0]?.id).toBe('e');
  });

  it('compares words as written, so a plural does not meet its singular (the same-answer list covers that)', () => {
    const found = keywordSearch(index, 'A lichen is a partnership between a fungus and what other kind of organism?').map((r) => r.id);
    expect(found).not.toContain('c');
  });

  it('ignores pronunciation guides, case and filler words', () => {
    expect(keywordSearch(index, 'VISCOSITY [vis-KOSS-ih-tee] of the liquid')[0]?.id).toBe('d');
    expect(keywordSearch(index, 'which of the following is the what')).toEqual([]);
  });
});

describe('the same-answer list', () => {
  const index = buildIndex(SMALL);

  it('takes equal answers, one answer inside the other, and half the words shared', () => {
    expect(sameAnswer(index, 'outer core')).toEqual(['a']);
    expect(sameAnswer(index, 'ALGAE')).toEqual(['c']);
    expect(sameAnswer(index, 'the liquid outer core of Earth')).toEqual(['a']);
    expect(sameAnswer(index, 'ARGON GAS')).toEqual(['e']);
  });

  it('matches nothing for an empty answer or an unrelated one', () => {
    expect(sameAnswer(index, '')).toEqual([]);
    expect(sameAnswer(index, 'HELIUM')).toEqual([]);
  });
});

describe('neighbours', () => {
  const index = buildIndex(SMALL);

  it('joins the two lists without repeats and says where each question came from', () => {
    const found = neighbours(index, { stem: 'A lichen is a partnership between a fungus and what photosynthetic organism?', answer: 'ALGAE' });
    const lichen = found.find((n) => n.id === 'c')!;
    expect(lichen.sameAnswerRank).toBe(1);
    expect(lichen.keywordRank).toBeGreaterThan(0);
    expect(new Set(found.map((n) => n.id)).size).toBe(found.length);
  });

  it('finds a question by its answer when the wording shares nothing', () => {
    const found = neighbours(index, { stem: 'Which noble element makes up just under one percent of the air?', answer: 'ARGON' });
    expect(found.find((n) => n.id === 'e')?.sameAnswerRank).toBe(1);
  });
});

describe('near copies', () => {
  const index = buildIndex(SMALL);

  it('flags a question reworded only slightly, and not one that merely shares a topic', () => {
    const copy: Query = { stem: 'What layer of Earth is liquid and lies between the mantle and the solid inner core?', answer: 'OUTER CORE' };
    expect(nearCopies(index, copy).map((c) => c.id)).toEqual(['a']);
    expect(nearCopies(index, { stem: 'Seismic S waves cannot pass through which layer of Earth?', answer: 'OUTER CORE' })).toEqual([]);
  });
});

interface LabelledPair {
  id: string;
  group: string;
  label: 'same' | 'template';
  stem: string;
  choices?: Record<string, string>;
  answer: string;
  matches: string[];
}

// The pilot's labelled matches against the real library: the measurement the plan's duplicate screen rests on.
describe.skipIf(!libraryBuilt())('the pilot’s labelled duplicates', () => {
  it('have their matching library question in the top 20 of the two lists', () => {
    const { pairs } = JSON.parse(readFileSync(path.join(DATA_DIR, 'eval/duplicate-pairs.json'), 'utf8')) as { pairs: LabelledPair[] };
    const index = buildIndex(loadLibrary().map((x) => x.question));
    expect(index.entries.length).toBeGreaterThan(23_000);
    const missed: string[] = [];
    const found = { same: 0, template: 0 };
    for (const pair of pairs) {
      const ids = new Set(neighbours(index, pair, TOP).map((n) => n.id));
      if (pair.matches.some((m) => ids.has(m))) found[pair.label] += 1;
      else missed.push(`${pair.id} (${pair.label})`);
    }
    expect(pairs.length).toBe(63);
    // All 55 strict duplicates, and 6 of the 8 template matches: the two misses share a fact but no telling words.
    expect(found.same).toBe(55);
    expect(found.template).toBeGreaterThanOrEqual(6);
    expect(missed.every((m) => m.endsWith('(template)'))).toBe(true);
  }, 60_000);
});
