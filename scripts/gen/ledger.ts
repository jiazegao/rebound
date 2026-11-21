/**
 * The ledger: one line per question the pipeline has written, with everything known about it (types.ts,
 * BankRecord). It is a JSON Lines file, so it can be read by eye, compared between versions and appended to.
 *
 * Unreleased questions must not be published before they are played, and this repository is public. So the
 * ledger lives outside it: by default in private-data/gen/ (ignored by git), which can be a checkout of a
 * private repository. Set REBOUND_BANK to keep it somewhere else.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LETTERS, type Level } from '../../src/core/schema';
import { isNumericAnswer } from './text';
import type { BankRecord, CheckName, QuestionText } from './types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Where runs, the ledger and unreleased rounds are kept. */
export const BANK_DIR = process.env.REBOUND_BANK ? path.resolve(process.env.REBOUND_BANK) : path.join(ROOT, 'private-data', 'gen');
export const LEDGER_FILE = path.join(BANK_DIR, 'bank', 'ledger.jsonl');

const BANK_ID = /^rb-(hs|ms)-(\d{6})$/;

/** "rb-hs-000123" */
export function bankId(level: Level, n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999_999) throw new Error(`A bank number must be a whole number from 1 to 999999, not ${n}.`);
  return `rb-${level.toLowerCase()}-${String(n).padStart(6, '0')}`;
}

export function parseBankId(id: string): { level: Level; n: number } | null {
  const m = BANK_ID.exec(id);
  return m ? { level: m[1] === 'ms' ? 'MS' : 'HS', n: Number(m[2]) } : null;
}

/** The next unused number for a level. Numbers are never reused, whatever became of the question. */
export function nextNumber(records: readonly BankRecord[], level: Level): number {
  let max = 0;
  for (const r of records) {
    const id = parseBankId(r.id);
    if (id && id.level === level) max = Math.max(max, id.n);
  }
  return max + 1;
}

const squeeze = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * A short fingerprint of the words a player hears and is judged against: the stem, the choices, the answer
 * and its ACCEPT and DO NOT ACCEPT lists. Every check records it, so a check made on other words is known
 * to be out of date. Notes and spacing do not change it; any change of wording does.
 */
export function questionHash(q: QuestionText): string {
  const parts = [
    squeeze(q.stem),
    q.format === 'multiple_choice' ? LETTERS.map((l) => squeeze(q.choices?.[l] ?? '')) : null,
    squeeze(q.answer),
    q.format === 'multiple_choice' ? (q.answerLetter ?? null) : null,
    q.accept.map(squeeze),
    q.reject.map(squeeze),
  ];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

/** Read a ledger file; a file that does not exist yet is an empty ledger. */
export function readLedger(file = LEDGER_FILE): BankRecord[] {
  if (!existsSync(file)) return [];
  const out: BankRecord[] = [];
  const seen = new Set<string>();
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (!line.trim()) return;
      let record: BankRecord;
      try {
        record = JSON.parse(line) as BankRecord;
      } catch {
        throw new Error(`${file}, line ${i + 1}: not valid JSON.`);
      }
      if (!parseBankId(record.id)) throw new Error(`${file}, line ${i + 1}: "${record.id}" is not a bank id (like rb-hs-000123).`);
      if (seen.has(record.id)) throw new Error(`${file}, line ${i + 1}: ${record.id} appears twice.`);
      seen.add(record.id);
      out.push(record);
    });
  return out;
}

/** Write the whole ledger, one question per line in id order. The old file is replaced only once the new one is complete. */
export function writeLedger(records: readonly BankRecord[], file = LEDGER_FILE): void {
  const ids = new Set<string>();
  for (const r of records) {
    if (!parseBankId(r.id)) throw new Error(`"${r.id}" is not a bank id (like rb-hs-000123).`);
    if (ids.has(r.id)) throw new Error(`${r.id} appears twice.`);
    ids.add(r.id);
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id));
  const temporary = `${file}.writing`;
  writeFileSync(temporary, sorted.map((r) => JSON.stringify(r)).join('\n') + (sorted.length ? '\n' : ''));
  renameSync(temporary, file);
}

/** A new record for a freshly written question, with the next id of its level. Add it to `records` to keep the number taken. */
export function newRecord(records: readonly BankRecord[], input: Pick<BankRecord, 'level' | 'question' | 'made'> & Partial<Pick<BankRecord, 'slot' | 'idea' | 'sources' | 'asOf'>>): BankRecord {
  return {
    id: bankId(input.level, nextNumber(records, input.level)),
    rev: 1,
    status: 'draft',
    level: input.level,
    ...(input.slot ? { slot: input.slot } : {}),
    ...(input.idea ? { idea: input.idea } : {}),
    question: input.question,
    sources: input.sources ?? [],
    ...(input.asOf ? { asOf: input.asOf } : {}),
    made: input.made,
    checks: {},
    released: [],
  };
}

/** The checks that ran on words the question no longer has. */
export function staleChecks(record: BankRecord): CheckName[] {
  const now = questionHash(record.question);
  return (Object.keys(record.checks) as CheckName[]).filter((name) => record.checks[name]!.textHash !== now);
}

/** The checks every question needs before release; a numeric answer also needs "compute", any other "source". */
const ALWAYS: CheckName[] = ['style', 'original', 'solve'];

/**
 * Why a question may not be released yet (an empty list means it may): a check that is missing, failed or
 * made on earlier wording, or no person's approval of the words as they stand.
 */
export function releaseBlockers(record: BankRecord): string[] {
  const out: string[] = [];
  const hash = questionHash(record.question);
  const needed = [...ALWAYS, isNumericAnswer(record.question) ? ('compute' as const) : ('source' as const)];
  for (const name of needed) {
    const check = record.checks[name];
    if (!check) out.push(`The "${name}" check has not run.`);
    else if (check.textHash !== hash) out.push(`The "${name}" check ran on earlier wording.`);
    else if (!check.passed) out.push(`The "${name}" check failed.`);
  }
  for (const name of Object.keys(record.checks) as CheckName[]) {
    if (!needed.includes(name) && record.checks[name]!.textHash === hash && !record.checks[name]!.passed) out.push(`The "${name}" check failed.`);
  }
  if (!record.review || (record.review.decision !== 'approved' && record.review.decision !== 'edited')) out.push('No person has approved it.');
  if (record.status === 'rejected' || record.status === 'retired') out.push(`It is ${record.status}${record.ended ? `: ${record.ended.reason}` : ''}.`);
  return out;
}
