/**
 * Sanity check for the answer checker against the real question library: every question's own
 * printed answer (and each ACCEPT alternative, and the letter for multiple choice) should be
 * judged correct. Run: npx tsx scripts/checks/judge-self-check.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { judgeAnswer } from '../../src/core/judge/judge';
import type { Question, QuestionSet } from '../../src/core/schema';

const dir = join(process.cwd(), 'public/data/doe');
const files = readdirSync(dir).filter((f) => /^doe-hs-\d+\.json$/.test(f));
let checked = 0;
const problems: Array<{ id: string; response: string; verdict: string; reason: string; answer: string }> = [];

function check(q: Question, response: string) {
  if (!response.trim()) return;
  checked++;
  const r = judgeAnswer(q, response);
  if (r.verdict !== 'correct') problems.push({ id: q.id, response, verdict: r.verdict, reason: r.reason, answer: q.answerRaw });
}

for (const file of files) {
  const set = JSON.parse(readFileSync(join(dir, file), 'utf8')) as QuestionSet;
  for (const round of set.rounds) {
    for (const pair of round.pairs) {
      for (const q of [pair.tossup, pair.bonus]) {
        if (!q || q.flags?.includes('answer-missing') || q.flags?.includes('choices-missing')) continue;
        if (q.format === 'multiple_choice' && q.answerLetter && q.choices) {
          check(q, q.answerLetter);
          check(q, q.choices[q.answerLetter]);
        } else {
          check(q, q.answer);
          for (const a of q.accept) check(q, a);
        }
      }
    }
  }
}
console.log(`checked ${checked} answers; ${problems.length} not judged correct (${((problems.length / checked) * 100).toFixed(2)}%)`);
const byVerdict = problems.reduce<Record<string, number>>((acc, p) => ((acc[p.verdict] = (acc[p.verdict] ?? 0) + 1), acc), {});
console.log(byVerdict);
for (const p of problems.slice(0, Number(process.argv[2] ?? 40))) console.log(JSON.stringify(p));
