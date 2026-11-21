import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { bankId, newRecord, nextNumber, parseBankId, questionHash, readLedger, releaseBlockers, staleChecks, writeLedger } from './ledger';
import type { BankRecord, CheckResult, QuestionText } from './types';

const question: QuestionText = {
  kind: 'tossup',
  subject: 'chemistry',
  format: 'short_answer',
  stem: 'What is the term for a redox reaction in which one element is both oxidized and reduced?',
  answer: 'DISPROPORTIONATION',
  accept: ['DISMUTATION'],
  reject: [],
};
const made = { run: '2026-12-01-hs-01', at: '2026-12-01T10:00:00.000Z', by: 'test' };
const passed = (q: QuestionText, more: Partial<CheckResult> = {}): CheckResult => ({ passed: true, at: '2026-12-01T10:05:00.000Z', by: 'code', textHash: questionHash(q), ...more });

describe('bank ids', () => {
  it('are permanent, six digits, by level', () => {
    expect(bankId('HS', 123)).toBe('rb-hs-000123');
    expect(parseBankId('rb-ms-000007')).toEqual({ level: 'MS', n: 7 });
    expect(parseBankId('rb-hs-123')).toBeNull();
    expect(() => bankId('HS', 0)).toThrow();
  });

  it('are never reused, even after a question is rejected', () => {
    const first = newRecord([], { level: 'HS', question, made });
    const second = newRecord([{ ...first, status: 'rejected' }], { level: 'HS', question, made });
    expect([first.id, second.id]).toEqual(['rb-hs-000001', 'rb-hs-000002']);
    expect(nextNumber([first, second], 'MS')).toBe(1);
  });
});

describe('the text hash', () => {
  it('changes with any wording a player hears or is judged against, and with nothing else', () => {
    const h = questionHash(question);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(questionHash({ ...question, stem: `${question.stem}  ` })).toBe(h);
    expect(questionHash({ ...question, notes: ['checked'] })).toBe(h);
    expect(questionHash({ ...question, stem: question.stem.replace('both', 'at once') })).not.toBe(h);
    expect(questionHash({ ...question, accept: [] })).not.toBe(h);
    expect(questionHash({ ...question, reject: ['OXIDATION'] })).not.toBe(h);
  });

  it('follows the choices and the letter of a multiple-choice question', () => {
    const mc: QuestionText = { ...question, format: 'multiple_choice', choices: { W: 'Combustion', X: 'Disproportionation', Y: 'Neutralization', Z: 'Hydrolysis' }, answerLetter: 'X', answer: 'DISPROPORTIONATION', accept: [] };
    expect(questionHash({ ...mc, answerLetter: 'Y' })).not.toBe(questionHash(mc));
    expect(questionHash({ ...mc, choices: { ...mc.choices!, Z: 'Hydration' } })).not.toBe(questionHash(mc));
  });
});

describe('the ledger file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rebound-ledger-'));
  const file = path.join(dir, 'bank', 'ledger.jsonl');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('is empty before anything is written, and reads back what was written, in id order', () => {
    expect(readLedger(file)).toEqual([]);
    const a = newRecord([], { level: 'HS', question, made });
    const b = newRecord([a], { level: 'MS', question, made, sources: [{ title: 'A page', url: 'https://www.nist.gov/' }] });
    writeLedger([b, a], file);
    expect(readLedger(file)).toEqual([a, b]);
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('refuses a damaged line, a bad id and a repeated id', () => {
    const a = newRecord([], { level: 'HS', question, made });
    expect(() => writeLedger([a, a], file)).toThrow(/twice/);
    expect(() => writeLedger([{ ...a, id: 'pilot-1' }], file)).toThrow(/bank id/);
    writeFileSync(file, `${JSON.stringify(a)}\n{not json\n`);
    expect(() => readLedger(file)).toThrow(/line 2/);
  });
});

describe('release', () => {
  const base = (): BankRecord => ({ ...newRecord([], { level: 'HS', question, made }), status: 'approved' });
  const review = { by: 'A reviewer', at: '2026-12-02T09:00:00.000Z', decision: 'approved' as const, seconds: 70 };

  it('needs the style, originality and solver checks, a source for a fact, and a person', () => {
    const r = base();
    expect(releaseBlockers(r)).toHaveLength(5);
    r.checks = { style: passed(question), original: passed(question), solve: passed(question), source: passed(question) };
    expect(releaseBlockers(r)).toEqual(['No person has approved it.']);
    r.review = review;
    expect(releaseBlockers(r)).toEqual([]);
  });

  it('needs a recomputation instead of a source when the answer is a number', () => {
    const numeric: QuestionText = { ...question, stem: 'In joules, what is the kinetic energy of a 2-kilogram mass moving at 3 meters per second?', answer: '9', accept: [] };
    const r: BankRecord = { ...base(), question: numeric, review, checks: { style: passed(numeric), original: passed(numeric), solve: passed(numeric) } };
    expect(releaseBlockers(r)).toEqual(['The "compute" check has not run.']);
  });

  it('does not count a check made on earlier wording, or a failed one', () => {
    const r = base();
    r.review = review;
    r.checks = { style: passed(question), original: passed(question), solve: passed(question), source: passed(question), difficulty: passed(question, { passed: false }) };
    expect(releaseBlockers(r)).toEqual(['The "difficulty" check failed.']);
    r.checks.difficulty = passed(question);
    r.question = { ...question, stem: question.stem.replace('redox reaction', 'reaction') };
    expect(staleChecks(r).sort()).toEqual(['difficulty', 'original', 'solve', 'source', 'style']);
    expect(releaseBlockers(r).filter((b) => b.includes('earlier wording'))).toHaveLength(4);
  });

  it('never releases a rejected question', () => {
    const r: BankRecord = { ...base(), status: 'rejected', ended: { step: 'original', reason: 'the same answer and cue as doe-hs-02-r09-b08' } };
    expect(releaseBlockers(r).at(-1)).toMatch(/rejected: the same answer and cue/);
  });
});
