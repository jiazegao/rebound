/**
 * Renders generated visual questions to PNG files, to look at figures while writing templates.
 *
 *   npx tsx scripts/checks/visual-gallery.ts <out dir> [template id prefix] [samples per template]
 *
 * Writes one PNG per template: the samples in light mode, plus the first sample in dark mode (figures
 * must read well in both). Needs Playwright with Chromium.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateVisual, VISUAL_TEMPLATES } from '../../src/core/visual/index';
import type { Question } from '../../src/core/schema';

const require = createRequire(import.meta.url);
// Playwright is installed with the browser, not as a project dependency, so its types are spelled out here.
interface Page {
  goto(url: string): Promise<unknown>;
  screenshot(opts: { path: string; fullPage: boolean }): Promise<unknown>;
}
const { chromium } = require('playwright') as {
  chromium: { launch(): Promise<{ newPage(opts: object): Promise<Page>; close(): Promise<void> }> };
};

const [outArg, prefix = '', samplesArg = '4'] = process.argv.slice(2);
if (!outArg) {
  console.error('Usage: npx tsx scripts/checks/visual-gallery.ts <out dir> [template id prefix] [samples per template]');
  process.exit(1);
}
const out = resolve(outArg);
const samples = Number(samplesArg);
mkdirSync(out, { recursive: true });

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function card(q: Question, dark: boolean): string {
  const fig = q.figure?.kind === 'svg' ? q.figure.svg : '';
  const choices = q.choices ? `<ol type="A" class="choices">${(['W', 'X', 'Y', 'Z'] as const).map((l) => `<li><b>${l})</b> ${escape(q.choices![l])}</li>`).join('')}</ol>` : '';
  return `<section class="${dark ? 'dark' : 'light'}"><div class="fig">${fig}</div>
    <p class="stem"><b>${escape(q.id)}</b><br>${escape(q.stem)}</p>${choices}
    <p class="ans">ANSWER: ${q.answerLetter ? `${q.answerLetter}) ` : ''}${escape(q.answer)}${q.accept.length ? ` (ACCEPT: ${escape(q.accept.join('; '))})` : ''}</p>
    <p class="alt">alt: ${escape(q.figure?.alt ?? '')}</p></section>`;
}

const css = `body{margin:0;font-family:system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:12px;padding:12px;background:#ddd;width:1540px}
section{width:490px;padding:10px;border-radius:8px;box-sizing:border-box}
.light{background:#fff;color:#1b1f24;--figure-bg:#fff;--figure-accent:#2a78d6}
.dark{background:#16191d;color:#e6e8eb;--figure-bg:#16191d;--figure-accent:#3987e5}
.fig svg{width:100%;height:auto;max-height:420px;display:block}
.stem{font-size:14px}.choices{font-size:13px;margin:0 0 6px 0;padding-left:18px;list-style:none}.ans{font-size:13px;color:#0a7d36}.dark .ans{color:#5fd38d}.alt{font-size:11px;opacity:.7}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1564, height: 900 }, deviceScaleFactor: 1 });
let count = 0;
for (const t of VISUAL_TEMPLATES.filter((x) => x.id.startsWith(prefix))) {
  const qs: Question[] = [];
  for (let seed = 1; seed <= samples; seed++) {
    const q = generateVisual(t.id, seed * 7919);
    if (q) qs.push(q);
  }
  const body = [...qs.map((q) => card(q, false)), card(qs[0]!, true)].join('');
  const htmlPath = join(out, `${t.id}.html`);
  writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><style>${css}</style><body>${body}</body>`);
  await page.goto(`file://${htmlPath}`);
  await page.screenshot({ path: join(out, `${t.id}.png`), fullPage: true });
  count += 1;
}
await browser.close();
console.log(`Rendered ${count} template(s) to ${out}`);
