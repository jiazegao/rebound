/**
 * Checks every visual template must pass (used by templates/*.test.ts). A template is only as good
 * as its worst seed, so each check runs over many seeds.
 */
import { judgeAnswer } from '../judge/judge';
import { LETTERS } from '../schema';
import { topicById } from '../taxonomy';
import { draftToQuestion } from './index';
import { makeRng } from './rng';
import type { VisualTemplate } from './types';

/** Tags must open and close in order; self-closing tags are fine. Catches most broken markup. */
export function checkSvgMarkup(svg: string): string | null {
  if (!svg.startsWith('<svg ') || !svg.endsWith('</svg>')) return 'the figure must be one <svg>…</svg> element';
  if (!/viewBox="0 0 [\d.]+ [\d.]+"/.test(svg)) return 'the figure needs a viewBox';
  if (/\b(width|height)="[\d.]+(px)?"\s/.test(svg.slice(0, svg.indexOf('>')))) return 'the <svg> element must not set width or height (the page sizes figures)';
  if (/NaN|undefined|Infinity|null|\[object/.test(svg)) return 'the figure contains NaN, undefined, Infinity, null or [object …]';
  if (/<script|on[a-z]+=|javascript:|<foreignObject|xlink:href|href=/i.test(svg)) return 'the figure must not contain scripts, event handlers, links or foreignObject';
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      const open = stack.pop();
      if (open !== name) return `</${name}> closes <${open ?? 'nothing'}>`;
    } else stack.push(name!);
  }
  return stack.length ? `<${stack.join('>, <')}> never closed` : null;
}

export function checkTemplate(t: VisualTemplate, seeds = 80): void {
  const fail = (seed: number, msg: string): never => {
    throw new Error(`${t.id} (seed ${seed}): ${msg}`);
  };
  if (!new RegExp(`^${t.subject}-[a-z0-9]+(-[a-z0-9]+)*$`).test(t.id)) throw new Error(`${t.id}: id must be "${t.subject}-<name>" in lowercase with hyphens`);
  if (!t.title.trim() || !t.description.trim()) throw new Error(`${t.id}: needs a title and a description`);
  const answers = new Set<string>();
  for (let seed = 1; seed <= seeds; seed++) {
    const draft = t.make(makeRng(seed));
    const again = t.make(makeRng(seed));
    if (JSON.stringify(draft) !== JSON.stringify(again)) fail(seed, 'the same seed must give the same question (use only rng for randomness)');
    const q = draftToQuestion(t, seed, draft);
    if (!/\S/.test(q.stem) || !/[?.]$/.test(q.stem.trim())) fail(seed, `the stem must be a sentence ending in "?" or ".": ${q.stem}`);
    if (q.stem.length > 400) fail(seed, 'the stem is too long for a 30-second bonus (400 characters at most)');
    if (q.format === 'multiple_choice') {
      if (!q.choices || !q.answerLetter) fail(seed, 'multiple choice needs choices and answerLetter');
      const texts = LETTERS.map((l) => q.choices![l]);
      if (texts.some((c) => !c || !c.trim())) fail(seed, 'every choice needs text');
      if (new Set(texts.map((c) => c.trim().toLowerCase())).size !== 4) fail(seed, `choices must all differ: ${texts.join(' | ')}`);
      if (q.choices![q.answerLetter!] !== q.answer) fail(seed, 'answer must be the text of the correct choice');
      const byLetter = judgeAnswer(q, q.answerLetter!);
      if (byLetter.verdict !== 'correct') fail(seed, `the letter ${q.answerLetter} is not judged correct (${byLetter.verdict}: ${byLetter.reason})`);
    } else {
      if (q.choices || q.answerLetter) fail(seed, 'short answer questions have no choices');
      const res = judgeAnswer(q, q.answer);
      if (res.verdict !== 'correct') fail(seed, `the printed answer "${q.answer}" is not judged correct (${res.verdict}: ${res.reason})`);
      for (const a of q.accept) {
        const r = judgeAnswer(q, a);
        if (r.verdict !== 'correct') fail(seed, `accepted answer "${a}" is not judged correct (${r.verdict}: ${r.reason})`);
      }
    }
    const fig = q.figure;
    if (fig?.kind !== 'svg') return fail(seed, 'generated questions need an svg figure');
    const markup = checkSvgMarkup(fig.svg);
    if (markup) fail(seed, markup);
    if (fig.svg.length > 40_000) fail(seed, 'the figure is over 40 KB; simplify it');
    if (!fig.alt.trim()) fail(seed, 'the figure needs alt text');
    if (/[a-z]/i.test(q.answer) && q.answer.length >= 4 && fig.alt.toLowerCase().includes(q.answer.toLowerCase())) fail(seed, 'the alt text gives the answer away');
    if (draft.topic) {
      const topic = topicById(draft.topic);
      if (!topic || topic.subject !== t.subject) fail(seed, `topic ${draft.topic} is not a ${t.subject} topic in taxonomy.ts`);
    }
    answers.add(q.answer);
  }
  const wanted = Math.min(6, Math.floor(seeds / 6));
  if (answers.size < wanted) throw new Error(`${t.id}: only ${answers.size} different answers over ${seeds} seeds; vary the questions more`);
}
