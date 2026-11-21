/**
 * Runs the house-style checks (checks.ts) on a file of questions and prints what they find.
 *
 *   npx tsx scripts/gen/check.ts <file.nsb.json> [--level hs|ms] [--old]     (npm run gen:check -- <file>)
 *   npx tsx scripts/gen/check.ts --doe                                        (npm run gen:check -- --doe)
 *
 * The file is NSB-JSON (docs/NSB-JSON.md): a question set, checked round by round, or a list of questions,
 * checked as one round. A question set says its own level; give --level for a list (high school if left out).
 * --old leaves out the checks that nothing is out of date, for material that was current when it was written.
 * --doe measures DOE's own 2019–22 questions instead: the numbers the thresholds were tuned on.
 *
 * Exits with 1 when any question or round has an error, so it can gate a later step.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNsbJson } from '../../src/core/nsbjson';
import type { Level, Question } from '../../src/core/schema';
import { checkQuestion, checkRound, hasErrors, tidy, type Finding } from './checks';
import { labsStale, loadLabs } from './labs';
import { loadLibrary, recentQuestions } from './library';
import { loadProfile } from './profile';
import type { Draft } from './types';

export function asDraft(q: Question, level: Level): Draft {
  return {
    level,
    question: { kind: q.kind, subject: q.subject, format: q.format, stem: q.stem, answer: q.answer, accept: q.accept ?? [], reject: q.reject ?? [], ...(q.choices ? { choices: q.choices } : {}), ...(q.answerLetter ? { answerLetter: q.answerLetter } : {}) },
  };
}

interface Group {
  label: string;
  level: Level;
  questions: Question[];
}

/** The rounds of an NSB-JSON file, each with its level. */
export function groupsOf(text: string, fallback: Level): Group[] {
  const doc = readNsbJson(text);
  if (doc.kind === 'game-log') throw new Error('This file is a game log, not questions.');
  if (doc.kind === 'questions') return [{ label: doc.title, level: fallback, questions: doc.questions }];
  const level = doc.set.level === 'MS' ? 'MS' : doc.set.level === 'HS' ? 'HS' : fallback;
  return doc.set.rounds.map((r) => ({ label: `${doc.set.title}, ${r.label}`, level, questions: r.pairs.flatMap((p) => (p.bonus ? [p.tossup, p.bonus] : [p.tossup])) }));
}

const line = (f: Finding) => `      ${f.level === 'error' ? 'ERROR  ' : 'warning'}  ${f.code}: ${f.message}`;

function checkFile(file: string, fallback: Level, freshness: boolean): boolean {
  const ctx = { profile: loadProfile(), labs: loadLabs() };
  if (freshness && labsStale(ctx.labs)) console.log(`Note: the lab table was last checked on ${ctx.labs.checked}. Check it against ${ctx.labs.source} (MAINTAINING.md).\n`);
  let failed = 0;
  let total = 0;
  for (const group of groupsOf(readFileSync(file, 'utf8'), fallback)) {
    console.log(`${group.label} (${group.level === 'MS' ? 'middle school' : 'high school'}, ${group.questions.length} questions)`);
    const tidied: Draft[] = [];
    for (const q of group.questions) {
      total += 1;
      const { draft, changes } = tidy(asDraft(q, group.level));
      tidied.push(draft);
      const findings = checkQuestion(draft, ctx, { freshness });
      if (hasErrors(findings)) failed += 1;
      if (findings.length === 0 && changes.length === 0) continue;
      console.log(`   ${q.id}  ${q.stem.length > 90 ? `${q.stem.slice(0, 90)}…` : q.stem}`);
      for (const c of changes) console.log(`      fixed    ${c}`);
      for (const f of findings) console.log(line(f));
    }
    const round = checkRound(tidied, ctx);
    if (round.length) console.log('   The round as a whole');
    for (const f of round) console.log(line(f));
    if (hasErrors(round)) failed += 1;
    console.log('');
  }
  console.log(failed ? `${failed} of ${total} questions (or their rounds) have errors.` : `All ${total} questions pass.`);
  return failed === 0;
}

/** DOE's own recent questions through the same checks: how often each rule fires on the real thing. */
function measureDoe(): void {
  const ctx = { profile: loadProfile(), labs: loadLabs() };
  const recent = recentQuestions(loadLibrary());
  const counts = new Map<string, { level: Finding['level']; n: number; example: string }>();
  let failed = 0;
  for (const x of recent) {
    const findings = checkQuestion(asDraft(x.question, x.level), ctx, { freshness: false });
    if (hasErrors(findings)) failed += 1;
    for (const f of new Map(findings.map((y) => [y.code, y])).values()) {
      const c = counts.get(f.code) ?? { level: f.level, n: 0, example: x.question.id };
      c.n += 1;
      counts.set(f.code, c);
    }
  }
  const pct = (n: number) => `${((100 * n) / recent.length).toFixed(2)}%`;
  console.log(`DOE's ${ctx.profile.fromYear}–22 questions: ${recent.length}. With no error: ${recent.length - failed} (${(100 - (100 * failed) / recent.length).toFixed(1)}%).\n`);
  for (const [code, c] of [...counts].sort((a, b) => Number(b[1].level === 'error') - Number(a[1].level === 'error') || b[1].n - a[1].n)) {
    console.log(`${c.level.padEnd(8)}${code.padEnd(24)}${String(c.n).padStart(5)}  ${pct(c.n).padStart(6)}   e.g. ${c.example}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const levelAt = args.indexOf('--level');
  const level: Level = levelAt >= 0 && args[levelAt + 1]?.toLowerCase() === 'ms' ? 'MS' : 'HS';
  const file = args.find((a, i) => !a.startsWith('--') && (levelAt < 0 || i !== levelAt + 1));
  if (args.includes('--doe')) measureDoe();
  else if (!file) {
    console.error('Usage: npm run gen:check -- <file.nsb.json> [--level hs|ms] [--old]\n       npm run gen:check -- --doe');
    process.exit(1);
  } else {
    try {
      if (!checkFile(file, level, !args.includes('--old'))) process.exit(1);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  }
}
