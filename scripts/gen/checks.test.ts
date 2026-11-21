import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Letter, Level } from '../../src/core/schema';
import { checkQuestion, checkRound, tidy, typeset, type Finding } from './checks';
import { loadLabs } from './labs';
import { DATA_DIR, libraryBuilt, loadLibrary, recentQuestions } from './library';
import { loadProfile } from './profile';
import type { Draft, QuestionText } from './types';

const ctx = { profile: loadProfile(), labs: loadLabs() };

const short = (stem: string, answer: string, more: Partial<QuestionText> = {}): QuestionText => ({ kind: 'tossup', subject: 'biology', format: 'short_answer', stem, answer, accept: [], reject: [], ...more });
const choice = (stem: string, choices: [string, string, string, string], answerLetter: Letter, more: Partial<QuestionText> = {}): QuestionText => ({
  kind: 'tossup',
  subject: 'chemistry',
  format: 'multiple_choice',
  stem,
  choices: { W: choices[0], X: choices[1], Y: choices[2], Z: choices[3] },
  answerLetter,
  answer: choices['WXYZ'.indexOf(answerLetter)]!.toUpperCase(),
  accept: [],
  reject: [],
  ...more,
});
const draft = (question: QuestionText, more: Partial<Draft> = {}): Draft => ({ question, level: 'HS', ...more });
const codes = (findings: Finding[], level?: Finding['level']) => findings.filter((f) => !level || f.level === level).map((f) => f.code);
const check = (question: QuestionText, more: Partial<Draft> = {}) => checkQuestion(draft(question, more), ctx);

describe('automatic fixes', () => {
  it('sets apostrophes and minus signs as the library prints them, and leaves hyphens and ranges alone', () => {
    expect(typeset("Earth's  gravity")).toBe('Earth’s gravity');
    expect(typeset('x = -3 and (-2, 5)')).toBe('x = –3 and (–2, 5)');
    expect(typeset('a well-known 5-10 range, carbon-14')).toBe('a well-known 5-10 range, carbon-14');
  });

  it('puts numeric choices in rising order and moves the key with its choice', () => {
    const t = tidy(draft(choice('In ohms, what is the resistance?', ['12', '3', '8', '20'], 'Y')));
    expect(Object.values(t.draft.question.choices!)).toEqual(['3', '8', '12', '20']);
    expect(t.draft.question.answerLetter).toBe('X');
    expect(t.changes.join(' ')).toMatch(/rising order.*from Y to X/);
  });

  it('leaves numeric choices that are already in order, either way, or that mix units', () => {
    expect(tidy(draft(choice('How many?', ['20', '12', '8', '3'], 'W'))).changes).toEqual([]);
    const mixed = tidy(draft(choice('Which is closest to the size?', ['1 nanometer', '100 nanometers', '10 microns', '1 millimeter'], 'Y')));
    expect(mixed.draft.question.answerLetter).toBe('Y');
    expect(mixed.changes).toEqual([]);
  });

  it('moves the key to the letter the round plan asked for, keeping the other choices in order', () => {
    const t = tidy(draft(choice('Which of the following is a noble gas?', ['Argon', 'Chlorine', 'Sodium', 'Sulfur'], 'W'), { letter: 'Y' }));
    expect(Object.values(t.draft.question.choices!)).toEqual(['Chlorine', 'Sodium', 'Argon', 'Sulfur']);
    expect(t.draft.question.answerLetter).toBe('Y');
    const kept = tidy(draft(choice('Which planet is closest to the Sun?', ['Mercury', 'Venus', 'Earth', 'Mars'], 'W'), { letter: 'Y', keepChoiceOrder: true }));
    expect(kept.draft.question.answerLetter).toBe('W');
  });

  it('drops what a format has no use for', () => {
    const mc = tidy(draft(choice('Which of the following is a noble gas?', ['Argon', 'Chlorine', 'Sodium', 'Sulfur'], 'W', { accept: ['AR'] })));
    expect(mc.draft.question.accept).toEqual([]);
    const sa = tidy(draft({ ...short('What gas do plants take in?', 'CARBON DIOXIDE'), choices: { W: 'a', X: 'b', Y: 'c', Z: 'd' }, answerLetter: 'W' }));
    expect(sa.draft.question.choices).toBeUndefined();
    expect(sa.draft.question.answerLetter).toBeUndefined();
  });
});

describe('one question', () => {
  it('passes a plain, well-formed question of either format', () => {
    expect(check(short('What organelle is the site of the Krebs cycle?', 'MITOCHONDRION', { accept: ['MITOCHONDRIA'] }))).toEqual([]);
    expect(check(choice('Which of the following elements is a noble gas?', ['Argon', 'Chlorine', 'Sodium', 'Sulfur'], 'W'))).toEqual([]);
  });

  it('keeps the Write studio’s errors, and does not ask for a source yet', () => {
    expect(codes(check(choice('Which of the following is a compound of hydrogen and oxygen?', ['Water', 'H2O', 'Salt', 'Sugar'], 'W')), 'error')).toContain('two-right');
    expect(codes(check(short('What fraction of the sample remains?', '2/4')), 'error')).toContain('simplest');
    expect(codes(check(short('What is the term [TURM for it?', 'MITOSIS')), 'error')).toContain('brackets');
    expect(codes(check(short('What organelle is the site of the Krebs cycle?', 'MITOCHONDRION'))).includes('source')).toBe(false);
  });

  it('holds the answer line to the answer checker', () => {
    expect(codes(check(short('What particle carries a negative charge?', 'ELECTRON', { reject: ['ELECTRONS'] })), 'error')).toContain('reject-accepted');
    expect(check(short('What is the term for a dormant state some animals enter in summer?', 'ESTIVATION', { accept: ['SUMMER TORPOR'], reject: ['HIBERNATION'] }))).toEqual([]);
    const mismatch = choice('Which of the following elements is a noble gas?', ['Argon', 'Chlorine', 'Sodium', 'Sulfur'], 'W', { answer: 'CHLORINE' });
    expect(codes(check(mismatch), 'error')).toContain('letter-text-mismatch');
  });

  it('wants multiple choice as DOE writes it: a question, four answers, no reasons attached', () => {
    const colon = choice('The most abundant gas in the atmosphere is:', ['Nitrogen', 'Oxygen', 'Argon', 'Neon'], 'W');
    expect(codes(check(colon), 'error')).toEqual(['mc-ending']);
    const above = choice('Which of the following is a noble gas?', ['Argon', 'Neon', 'Chlorine', 'Both W and X'], 'Z');
    expect(codes(check(above), 'error')).toContain('refers-to-choices');
    const bosons = choice('Which of the following does the Higgs field explain?', ['Gravitational lensing', 'Proton decay', 'Dark energy', 'Mass of W and Z bosons'], 'Z');
    expect(codes(check(bosons))).not.toContain('refers-to-choices');
    const because = choice('How does the mass of the powder compare with the mass of the magnesium?', ['It is greater, because oxygen was added', 'It is the same, because mass is conserved', 'It is smaller, because gas escaped', 'It is zero, because it burned'], 'W');
    expect(codes(check(because), 'error')).toContain('because-clause');
  });

  it('fails a right choice that is much the longest, and not a long one among equals or a short one', () => {
    const long = 'The Moon lacks the weathering, erosion and plate tectonics that erase craters on Earth';
    const given = choice('Which of the following is the main reason the Moon keeps more craters than Earth?', ['The Moon is struck by more meteoroids', 'The Moon’s gravity pulls in more asteroids', 'Most lunar craters were made by volcanoes', long], 'Z');
    expect(codes(check(given), 'error')).toEqual(['right-choice-long']);
    const even = choice('Which of the following best describes the purpose of down feathers?', ['Trapping a layer of air to act as insulation', 'Shedding water from the surface of the body', 'Producing lift during the downstroke of flight', 'Attracting a mate during the breeding season'], 'W');
    expect(codes(check(even), 'error')).toEqual([]);
    expect(codes(check(choice('Which of the following is a mineral?', ['Quartz', 'Coal', 'Amber', 'Calcium carbonate rock'], 'W')), 'error')).toEqual([]);
  });

  it('holds "Identify all" and "Rank" to DOE’s wording and answer form', () => {
    const good = short('Identify all of the following three gas giants that have rings: 1) Saturn; 2) Uranus; 3) Neptune.', 'ALL', { kind: 'bonus', subject: 'earth_space' });
    expect(check(good)).toEqual([]);
    expect(check({ ...good, answer: '1, 3' })).toEqual([]);
    expect(codes(check({ ...good, answer: '1, 2, 3' }), 'error')).toEqual(['list-answer']);
    expect(codes(check({ ...good, answer: '3, 1' }), 'error')).toEqual(['list-answer']);
    expect(codes(check({ ...good, answer: 'SATURN AND URANUS' }), 'error')).toEqual(['list-answer']);
    expect(codes(check({ ...good, stem: 'Identify all of the following gas giants that have rings: 1) Saturn; 2) Uranus; 3) Neptune.' }), 'error')).toEqual(['list-form']);
    expect(codes(check({ ...good, stem: 'Identify all of the following four gas giants that have rings: 1) Saturn; 2) Uranus; 3) Neptune.' }), 'error')).toEqual(['list-form']);
    const rank = short('Rank the following three planets in order of increasing mass: 1) Earth; 2) Mars; 3) Venus.', '2, 3, 1', { kind: 'bonus', subject: 'earth_space' });
    expect(check(rank)).toEqual([]);
    expect(codes(check({ ...rank, answer: '2, 3' }), 'error')).toEqual(['list-answer']);
    // The round plan's form is checked even when the wording does not show it.
    expect(codes(check(short('Which of these planets have rings: Saturn, Uranus and Mars?', 'SATURN AND URANUS'), { form: 'identify_all' }), 'error')).toContain('list-form');
  });

  it('takes a point’s coordinates for what they are, not for list items', () => {
    const points = short('Identify all of the following three points that lie on the line y = 2x: 1) (1, 2); 2) (5, 1); 3) (3, 6).', '1, 3', { kind: 'bonus', subject: 'math' });
    expect(check(points)).toEqual([]);
  });

  it('fails a lab whose name holds the answer, and only warns when the answer is merely said in the question', () => {
    const plasma = short('Scientists at Princeton Plasma Physics Laboratory heat hydrogen to millions of degrees. In what state does matter exist at such temperatures?', 'PLASMA', { subject: 'energy', kind: 'bonus' });
    expect(codes(checkQuestion(draft(plasma), ctx, { freshness: false }), 'error')).toEqual(['answer-in-lab-name']);
    const energy = choice('Researchers at the National Energy Technology Laboratory study turbines. Which of the following do turbines convert into electricity?', ['Kinetic energy', 'Sound', 'Light', 'Mass'], 'W', { subject: 'energy' });
    expect(codes(checkQuestion(draft(energy), ctx, { freshness: false }))).not.toContain('answer-in-lab-name');
    const said = check(short('What is the main component of the gas bubbles in boiling water?', 'WATER', { accept: ['WATER VAPOR'] }));
    expect(said.map((f) => [f.level, f.code])).toEqual([['warning', 'answer-in-stem']]);
    expect(codes(check(short('Is a solution with a pH of 3 an acid or a base?', 'ACID')))).toEqual([]);
  });

  it('measures a stem against DOE’s for its level, category and kind', () => {
    const words = (n: number) => `${Array.from({ length: n - 4 }, () => 'cell').join(' ')} is what organelle named?`;
    // Nine in ten of DOE's high school biology toss-ups are 24 words or fewer.
    expect(codes(check(short(words(24), 'NUCLEUS')))).toEqual([]);
    expect(check(short(words(28), 'NUCLEUS')).map((f) => [f.level, f.code])).toEqual([['warning', 'stem-longish']]);
    expect(codes(check(short(words(31), 'NUCLEUS')), 'error')).toEqual(['stem-long']);
    // The same 31 words are an ordinary physics bonus.
    expect(codes(check(short(words(31), 'NUCLEUS', { subject: 'physics', kind: 'bonus' })))).toEqual([]);
    // Pronunciation guides are not counted.
    expect(codes(check(short(`${words(24)} [NOO-klee-us] [guide] [guide] [guide] [guide] [guide] [guide] [guide]`, 'NUCLEUS')))).toEqual([]);
  });

  it('warns about answers not in capitals, first person, and a lower-case "not"', () => {
    expect(codes(check(short('What organelle is the site of the Krebs cycle?', 'Mitochondrion')), 'warning')).toEqual(['answer-capitals']);
    expect(codes(check(short('What do we call the site of the Krebs cycle?', 'MITOCHONDRION')), 'warning')).toEqual(['first-person']);
    expect(codes(check(short('What planet in our solar system has the most moons?', 'SATURN', { subject: 'earth_space' })))).toEqual([]);
    expect(codes(check(choice('Which of the following is not a noble gas?', ['Argon', 'Neon', 'Chlorine', 'Helium'], 'Y')), 'warning')).toEqual(['not-capitals']);
  });
});

describe('nothing out of date', () => {
  const dated = [{ title: 'Lab news', url: 'https://www.nlr.gov/news/', published: '2026-10-02' }];
  const perovskite = (lab: string) => short(`Scientists at ${lab} are testing solar cells made of perovskite. Perovskite is named after a mineral of what element combined with titanium and oxygen?`, 'CALCIUM', { subject: 'energy' });

  it('refuses a name a lab no longer has, and says what to write', () => {
    const found = check(perovskite('the National Renewable Energy Laboratory'), { sources: dated });
    expect(codes(found, 'error')).toEqual(['former-lab-name']);
    expect(found[0]!.message).toMatch(/National Laboratory of the Rockies since 2025-12-01/);
    expect(check(perovskite('the National Laboratory of the Rockies'), { sources: dated })).toEqual([]);
  });

  it('wants the dated news item behind an Energy question that names a lab', () => {
    expect(codes(check(perovskite('the National Laboratory of the Rockies')), 'error')).toEqual(['energy-source']);
    expect(codes(check(perovskite('the National Laboratory of the Rockies'), { sources: [{ title: 'Lab news', url: 'https://www.nlr.gov/news/' }] }), 'error')).toEqual(['energy-source']);
  });

  it('wants a date recorded for wording that will not stay true', () => {
    const newest = short('What is the newest named element in the periodic table?', 'TENNESSINE', { subject: 'chemistry' });
    expect(codes(check(newest), 'error')).toEqual(['time-tied']);
    expect(check(newest, { asOf: '2026-11-21' })).toEqual([]);
    // A year in a calculation or in history is not a date the answer depends on.
    expect(check(short('What is the remainder when 2025 is divided by 7?', '2', { subject: 'math' }))).toEqual([]);
    expect(check(short('In 1953, Watson and Crick described the structure of what molecule?', 'DNA'))).toEqual([]);
  });

  it('can be switched off, to measure old questions that were current when written', () => {
    expect(checkQuestion(draft(perovskite('the National Renewable Energy Laboratory')), ctx, { freshness: false })).toEqual([]);
  });
});

describe('a round', () => {
  const mc = (letter: Letter, i: number, choices: [string, string, string, string] = ['Alpha', 'Beta', 'Gamma', 'Delta']): Draft =>
    draft(choice(`Which of the following is the right answer to practice question number ${i} of this set of example questions, all told?`, choices, letter));
  const spread = (letters: string) => [...letters].map((l, i) => mc(l as Letter, i));

  it('fails keys bunched on one letter, and passes an even spread', () => {
    expect(codes(checkRound(spread('WXYZWXYZWXYZWXYZ'), ctx))).toEqual([]);
    const bunched = checkRound(spread('XZWYXXYYYXXZXWXX'), ctx);
    expect(codes(bunched, 'error')).toEqual(['key-letters']);
    expect(bunched[0]!.message).toMatch(/8 of the 16 multiple-choice keys are X/);
    // Too few keys to judge.
    expect(checkRound(spread('XXXX'), ctx)).toEqual([]);
  });

  it('fails a round whose right choice is usually the longest', () => {
    const longRight = (i: number) => mc('WXYZ'[i % 4] as Letter, i, ['Alpha', 'Beta', 'Gamma', 'Delta'].map((c, k) => (k === i % 4 ? `${c} particle` : c)) as [string, string, string, string]);
    expect(codes(checkRound(Array.from({ length: 8 }, (_, i) => longRight(i)), ctx), 'error')).toEqual(['right-longest-share']);
  });

  it('fails more than one NOT question', () => {
    const not = (i: number) => draft(choice(`Which of the following is NOT one of the right answers to practice question number ${i} of this set of example questions?`, ['Alpha', 'Beta', 'Gamma', 'Delta'], 'WXYZ'[i % 4] as Letter));
    expect(codes(checkRound([...spread('WXYZWXYZ'), not(0), not(1)], ctx), 'error')).toEqual(['not-count']);
    expect(codes(checkRound([...spread('WXYZWXYZ'), not(0)], ctx), 'error')).toEqual([]);
  });

  it('warns when the round’s stems run shorter or longer than DOE’s rounds do', () => {
    const terse = Array.from({ length: 8 }, (_, i) => draft(short(`What is item ${i}?`, 'ANSWER')));
    expect(checkRound(terse, ctx).map((f) => [f.level, f.code])).toEqual([['warning', 'round-stem-length']]);
  });
});

interface Fault {
  expect: string;
  why: string;
  question: QuestionText & { id: string; level: Level };
}

// The faults Rebound's November 2026 pilot found by hand (data/eval/pilot-faults.json): each must now be caught by code.
describe('the pilot’s faults', () => {
  const faults = JSON.parse(readFileSync(path.join(DATA_DIR, 'eval/pilot-faults.json'), 'utf8')) as { questions: Fault[]; firstDraftKeys: Record<Level, Letter[]> };

  it('are each caught as an error: the answer in a lab’s name, a long right choice, "because" clauses, a renamed lab', () => {
    expect(faults.questions).toHaveLength(8);
    for (const fault of faults.questions) {
      const { id, level, ...question } = fault.question;
      expect(codes(checkQuestion({ question, level }, ctx), 'error'), id).toContain(fault.expect);
    }
  });

  it('include first drafts with half their keys on X, which fail as a round', () => {
    for (const level of ['HS', 'MS'] as const) {
      const drafts = faults.firstDraftKeys[level].map((letter, i): Draft => ({ level, question: choice(`Which of the following is the answer to practice question number ${i} of this pilot round, as first drafted?`, ['Alpha', 'Beta', 'Gamma', 'Delta'], letter) }));
      const found = checkRound(drafts, ctx).filter((f) => f.code === 'key-letters');
      expect(found.length, level).toBeGreaterThan(0);
      expect(found[0]!.message, level).toMatch(/^8 of the 1[67] multiple-choice keys are X/);
    }
  });
});

// The thresholds are set so DOE's own recent questions pass: the plan's bar is at least 95%.
describe.skipIf(!libraryBuilt())('DOE’s 2019–22 questions', () => {
  const recent = recentQuestions(loadLibrary());
  const asDraft = (x: (typeof recent)[number]): Draft => {
    const q = x.question;
    return { level: x.level, question: { kind: q.kind, subject: q.subject, format: q.format, stem: q.stem, answer: q.answer, accept: q.accept, reject: q.reject, ...(q.choices ? { choices: q.choices } : {}), ...(q.answerLetter ? { answerLetter: q.answerLetter } : {}) } };
  };

  it('pass the checks at least 95% of the time, and no rule but stem length fails more than 1 in 200', () => {
    const failedBy = new Map<string, number>();
    let failed = 0;
    for (const x of recent) {
      const errors = new Set(codes(checkQuestion(asDraft(x), ctx, { freshness: false }), 'error'));
      if (errors.size) failed += 1;
      for (const code of errors) failedBy.set(code, (failedBy.get(code) ?? 0) + 1);
    }
    expect(recent.length).toBeGreaterThan(4500);
    expect(failed / recent.length).toBeLessThan(0.05);
    for (const [code, n] of failedBy) if (code !== 'stem-long') expect(n / recent.length, code).toBeLessThan(0.005);
    // DOE itself twice named Princeton Plasma Physics Lab in a question whose answer is "plasma".
    expect(failedBy.get('answer-in-lab-name')).toBe(2);
  }, 120_000);

  it('are left alone by the automatic fixes, apart from typography and two sets of unordered numbers', () => {
    const reordered: string[] = [];
    for (const x of recent) {
      const t = tidy(asDraft(x));
      if (t.changes.some((c) => !c.startsWith('Spacing'))) reordered.push(x.question.id);
      if (x.question.format === 'multiple_choice' && x.question.answerLetter) {
        // Whatever moved, the key still points at the same choice.
        expect(t.draft.question.choices![t.draft.question.answerLetter!], x.question.id).toBe(typeset(x.question.choices![x.question.answerLetter]));
      }
    }
    expect(reordered).toEqual(['doe-hs-13-r01-t03', 'doe-ms-13-r06-t05']);
  }, 120_000);

  // DOE spreads its keys evenly over a set, not within each round, so about a third of its rounds would fail the
  // key-letter rule. That rule is kept because a generated round meets it for free; the other two are DOE's own habits.
  it('have rounds that seldom trip the round checks, the key-letter rule apart', () => {
    const rounds = new Map<string, Draft[]>();
    for (const x of recent) rounds.set(x.roundId, [...(rounds.get(x.roundId) ?? []), asDraft(x)]);
    const tripped = (code: string) => [...rounds.values()].filter((drafts) => codes(checkRound(drafts, ctx), 'error').includes(code)).length / rounds.size;
    expect(rounds.size).toBe(112);
    expect(tripped('right-longest-share')).toBeLessThan(0.1);
    expect(tripped('not-count')).toBeLessThan(0.1);
    expect(tripped('key-letters')).toBeGreaterThan(0.2);
  }, 120_000);
});
