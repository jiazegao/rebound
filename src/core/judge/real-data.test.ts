/**
 * Regression check against the real DOE library (skipped if the data has not been built):
 * each question's own printed answer, its ACCEPT alternatives and, for multiple choice, its
 * letter and choice text must be judged correct. Run for the high school and the middle school sets.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Question, QuestionSet } from '../schema';
import { judgeAnswer } from './judge';

const dir = join(process.cwd(), 'public/data/doe');
const filesOf = (re: RegExp) => (existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)) : []);

const LEVELS = [
  { name: 'high school', files: filesOf(/^doe-hs-\d+\.json$/), minChecked: 15_000 },
  // doe-ms-01.json ... doe-ms-16.json and doe-ms-finals.json
  { name: 'middle school', files: filesOf(/^doe-ms-[a-z0-9-]+\.json$/), minChecked: 15_000 },
];

for (const level of LEVELS) {
  describe.skipIf(level.files.length === 0)(`answer checker on the real DOE ${level.name} library`, () => {
    it('accepts at least 99.9% of printed answers', () => {
      let checked = 0;
      const failures: string[] = [];
      const check = (q: Question, response: string) => {
        if (!response.trim()) return;
        checked++;
        if (judgeAnswer(q, response).verdict !== 'correct') failures.push(`${q.id}: ${response}`);
      };
      for (const file of level.files) {
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
                q.accept.forEach((a) => check(q, a));
              }
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(level.minChecked);
      expect(failures.length / checked).toBeLessThan(0.001);
    });
  });
}
