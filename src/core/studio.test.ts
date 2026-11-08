import { describe, expect, it } from 'vitest';
import { hamming, jaccard, questionText, simhash } from './fingerprint';
import type { Question, WrittenQuestion } from './schema';
import { answerLine, canReview, checkWritten, hasErrors, nearDuplicates, normalizeWritten, packetFromWritten, similarWritten } from './studio';

const base = (over: Partial<Question> = {}): Question => ({
  id: 'wq-1',
  kind: 'tossup',
  number: 1,
  subject: 'physics',
  sourceCategory: 'PHYSICS',
  format: 'short_answer',
  stem: 'In meters per second, what is the speed of sound assumed in NSB questions?',
  answer: '340',
  accept: [],
  reject: [],
  answerRaw: '340',
  source: { provider: 'team', setId: 'wq', roundId: 'wq', credit: '' },
  ...over,
});

const written = (q: Question, over: Partial<WrittenQuestion> = {}): WrittenQuestion => ({
  id: q.id,
  question: q,
  status: 'draft',
  authorId: 'ann',
  reviewerId: null,
  sources: [{ title: '2027 NSB Rules, Appendix A-1 b' }],
  comments: [],
  createdAt: '2026-11-08',
  updatedAt: '2026-11-08',
  ...over,
});

const codes = (q: Question, sources = [{ title: 'OpenStax Physics' }]) => checkWritten({ question: q, sources }).map((c) => c.code);

describe('studio checks', () => {
  it('a clean question passes', () => {
    expect(checkWritten(written(base()))).toEqual([]);
  });

  it('needs a source', () => {
    expect(codes(base(), [])).toContain('source');
    expect(hasErrors(checkWritten({ question: base(), sources: [{ title: '  ' }] }))).toBe(true);
  });

  it('answers in simplest form (Rule A-2)', () => {
    expect(codes(base({ answer: '4/6' }))).toContain('simplest');
    expect(codes(base({ answer: '√8' }))).toContain('simplest');
    expect(codes(base({ answer: '1/√2' }))).toContain('simplest');
    expect(codes(base({ answer: '2√2' }))).not.toContain('simplest');
    expect(codes(base({ answer: '0.3333' }))).toContain('repeating');
    expect(codes(base({ answer: '3.4 × 10^2' }))).toContain('scientific');
  });

  it('multiple choice: four different choices, one right, parallel', () => {
    const mc = (choices: Record<'W' | 'X' | 'Y' | 'Z', string>, answerLetter: 'W' | 'X' | 'Y' | 'Z' = 'W') =>
      base({ format: 'multiple_choice', choices, answerLetter, answer: choices[answerLetter] });
    expect(codes(mc({ W: 'Mitochondrion', X: 'Ribosome', Y: 'Nucleus', Z: 'Golgi apparatus' }))).toEqual([]);
    expect(codes(mc({ W: 'Mitochondrion', X: '', Y: 'Nucleus', Z: 'Golgi apparatus' }))).toContain('choices');
    expect(codes(mc({ W: 'Nucleus', X: 'nucleus', Y: 'Ribosome', Z: 'Golgi apparatus' }))).toContain('choices-same');
    expect(codes(mc({ W: 'Water', X: 'H2O', Y: 'Methane', Z: 'Ammonia' }))).toContain('two-right');
    expect(codes(mc({ W: '4', X: '8', Y: 'sixteen squared', Z: '2' }))).toContain('parallel-kind');
    expect(codes(mc({ W: 'All of the above', X: 'A', Y: 'B', Z: 'C' }, 'X'))).toContain('aota');
  });

  it('style: long toss-ups, brackets, first person', () => {
    expect(codes(base({ stem: `${'word '.repeat(80)}?` }))).toContain('long');
    expect(codes(base({ stem: 'What enzyme [EN-zime does this?' }))).toContain('brackets');
    expect(codes(base({ stem: 'What do we call the powerhouse of the cell?' }))).toContain('voice');
  });

  it('normalizes the answer line and the multiple-choice answer', () => {
    const q = normalizeWritten(base({ format: 'multiple_choice', choices: { W: ' A ', X: 'B', Y: 'C', Z: 'D' }, answerLetter: 'X', answer: 'stale', accept: ['x'] }));
    expect(q.answer).toBe('B');
    expect(q.accept).toEqual([]);
    expect(q.answerRaw).toBe('X) B');
    expect(answerLine({ format: 'short_answer', answer: 'RUBISCO', accept: ['RIBULOSE BISPHOSPHATE CARBOXYLASE'], reject: ['RUBP'] })).toBe(
      'RUBISCO (ACCEPT: RIBULOSE BISPHOSPHATE CARBOXYLASE) (DO NOT ACCEPT: RUBP)',
    );
  });
});

describe('peer review', () => {
  const w = written(base({ subject: 'biology' }));
  it('the subject owner or a leader approves, never the author', () => {
    expect(canReview(w, { id: 'ben', role: 'member', primarySubject: 'biology' })).toBe(true);
    expect(canReview(w, { id: 'cal', role: 'member', primarySubject: 'physics' })).toBe(false);
    expect(canReview(w, { id: 'dee', role: 'captain', primarySubject: 'math' })).toBe(true);
    expect(canReview(w, { id: 'ann', role: 'captain', primarySubject: 'biology' })).toBe(false);
    expect(canReview(w, null)).toBe(false);
  });
});

describe('duplicates', () => {
  const stem = 'What organelle is the site of aerobic respiration and has its own circular DNA in eukaryotic cells?';
  it('fingerprints are stable and close for rewordings, far for different questions', () => {
    const a = questionText({ stem, answer: 'MITOCHONDRION' });
    const b = questionText({ stem: stem.replace('What organelle', 'Which organelle'), answer: 'MITOCHONDRION' });
    const c = questionText({ stem: 'In kelvins, what is the boiling point of liquid nitrogen at one atmosphere?', answer: '77' });
    expect(simhash(a)).toBe(simhash(a));
    expect(simhash(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(hamming(simhash(a), simhash(b))).toBeLessThanOrEqual(9);
    expect(hamming(simhash(a), simhash(c))).toBeGreaterThan(9);
    expect(jaccard(a, b)).toBeGreaterThan(0.5);
  });

  it('finds library near-duplicates and similar team questions', () => {
    const fp = simhash(questionText({ stem, answer: 'MITOCHONDRION' }));
    const found = nearDuplicates({ stem: stem.replace('What organelle', 'Which organelle'), answer: 'MITOCHONDRION' }, [['doe-hs-01-r01-t01', fp], ['doe-hs-01-r01-t02', '0000000000000000']]);
    expect(found.map((f) => f.id)).toEqual(['doe-hs-01-r01-t01']);
    const other = written(base({ id: 'wq-2', stem, answer: 'MITOCHONDRION' }), { id: 'wq-2' });
    expect(similarWritten({ stem, answer: 'MITOCHONDRION' }, [other], 'wq-1').map((x) => x.id)).toEqual(['wq-2']);
    expect(similarWritten({ stem, answer: 'MITOCHONDRION' }, [other], 'wq-2')).toEqual([]);
  });
});

describe('packets from approved questions', () => {
  it('pairs toss-ups with bonuses of the same subject and gives packet ids', () => {
    const t1 = written(base({ id: 'wq-t1', subject: 'physics' }), { id: 'wq-t1', status: 'approved' });
    const t2 = written(base({ id: 'wq-t2', subject: 'biology', stem: 'What organelle makes ATP?', answer: 'MITOCHONDRION' }), { id: 'wq-t2', status: 'approved' });
    const b1 = written(base({ id: 'wq-b1', kind: 'bonus', subject: 'biology', stem: 'Name the three stages of cellular respiration.', answer: 'GLYCOLYSIS, KREBS CYCLE, ELECTRON TRANSPORT' }), {
      id: 'wq-b1',
      status: 'approved',
      ai: { model: 'claude', at: '2026-11-08', passageSource: 'OpenStax' },
    });
    const set = packetFromWritten([t1, t2, b1], { packetId: 'pk1', title: 'Team questions', credit: 'Written by Test HS' });
    expect(set.id).toBe('team-pk1');
    const pairs = set.rounds[0]!.pairs;
    expect(pairs).toHaveLength(2);
    expect(pairs.map((p) => p.tossup.id)).toEqual(['team-pk1-r01-t01', 'team-pk1-r01-t02']);
    const bio = pairs.find((p) => p.tossup.subject === 'biology')!;
    expect(bio.bonus?.subject).toBe('biology');
    expect(bio.bonus?.notes).toContain('AI-drafted (internal practice only)');
    expect(pairs.find((p) => p.tossup.subject === 'physics')!.bonus).toBeUndefined();
  });
});
