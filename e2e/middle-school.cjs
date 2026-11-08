/*
 * Middle school mode against the real library: a middle school team sees its own sets first and its drills,
 * plans and Learn pages use only the middle school catalog and concept files.
 *
 *   npm run build && npx vite preview --port 4173 --strictPort &
 *   node e2e/middle-school.cjs
 *
 * Needs Playwright with Chromium installed (require('playwright')).
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const fetched = [];
  const all = [];
  page.on('request', (r) => { if (r.url().includes('/data/doe/')) { const f = r.url().split('/data/doe/')[1]; fetched.push(f); all.push(f); } });
  const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) process.exitCode = 1; };

  await page.goto(`${BASE}#/team`);
  await page.getByLabel('Team name').fill('Lakeside Middle');
  await page.getByLabel('Middle school').check();
  await page.getByRole('button', { name: 'Create team' }).click();
  await page.getByText('Roster').first().waitFor();
  await page.locator('#new-player').fill('Mia');
  await page.getByLabel('Primary subject', { exact: true }).selectOption('biology');
  await page.getByRole('button', { name: 'Add player' }).click();

  await page.goto(`${BASE}#/library`);
  await page.getByText('Every DOE middle school sample set').waitFor();
  const firstCard = await page.locator('.grid .card h3').first().innerText();
  check(/Set 16/.test(firstCard), `Library lists middle school sets first (${firstCard})`);
  check(await page.getByText('High school sets').count() > 0, 'High school sets are further down');

  await page.goto(`${BASE}#/reader`);
  await page.locator('#set').waitFor();
  const setValue = await page.locator('#set').inputValue();
  check(setValue.startsWith('doe-ms-'), `Reader console defaults to a middle school set (${setValue})`);

  fetched.length = 0;
  await page.goto(`${BASE}#/try?mode=subject&subject=biology&count=3&go=1`);
  await page.getByText(/Toss-up 1 of|Bonus 1 of|Question 1 of/).first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  check(all.includes('catalog-ms.json') && !all.includes('catalog.json'), `Only the middle school catalog is loaded (${[...new Set(all)].filter((f) => f.startsWith('catalog')).join(', ')})`);
  check(fetched.some((f) => /^doe-ms-\d+\.json$/.test(f)) && !fetched.some((f) => /^doe-hs-/.test(f)), 'Drill questions come from middle school sets');

  await page.goto(`${BASE}#/try?mode=subject&subject=biology`);
  await page.locator('#level').waitFor({ timeout: 10000 }).catch(() => {});
  const levelOptions = await page.locator('#level option').allInnerTexts().catch(() => []);
  check(levelOptions.some((t) => /Nationals-level \(DOE national rounds\)/.test(t)), `Nationals-level offered from DOE national rounds (${levelOptions.join(' | ')})`);

  fetched.length = 0;
  await page.goto(`${BASE}#/learn`);
  await page.waitForTimeout(1500);
  check(fetched.includes('concepts-ms.json'), `Learn uses concepts-ms.json (${[...new Set(fetched)].join(', ')})`);

  await page.goto(`${BASE}#/tiebreakers`);
  check(await page.getByText('Rule 10-2').count() > 0, 'Tiebreakers page notes the middle school Finals rule');

  await page.goto(`${BASE}#/library/doe-ms-finals`);
  await page.waitForTimeout(800);
  check((await page.locator('h1').innerText()).includes('Sample Rounds'), 'The national sample rounds open in the Library');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  await browser.close();
})();
