/*
 * Middle school mode against the real library: a middle school team (made through the API; Mia, its captain, in
 * her own signed-in browser) sees its own sets first, and its drills, plans and Learn pages use only the middle
 * school catalog and concept files.
 *
 * It needs the server, with its development email outbox (server/.dev.vars), and the site built without
 * VITE_SERVER_URL:
 *
 *   cd server && cp .dev.vars.example .dev.vars && npx wrangler dev --port 8787 &
 *   npm run build && npx vite preview --port 4173 --strictPort &
 *   node e2e/middle-school.cjs
 *
 * SERVER_URL and BASE_URL point it elsewhere (defaults http://localhost:8787 and http://localhost:4173/; see
 * e2e/smoke.cjs about ALLOWED_ORIGINS). The account it makes is deleted at the end.
 * Needs Playwright with Chromium installed (require('playwright')).
 */
const { chromium } = require('playwright');
const A = require('./accounts.cjs');

const { BASE } = A;
(async () => {
  const browser = await chromium.launch();
  const check = (ok, what) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) process.exitCode = 1;
  };

  const { team, accounts } = await A.makeTeamOf('Lakeside Middle', [{ name: 'Mia', primarySubject: 'biology' }], 'MS');
  const page = await (await A.signedInContext(browser, accounts[0])).newPage();
  const errors = [];
  A.watchErrors(page, 'Mia', errors);
  const fetched = [];
  const all = [];
  page.on('request', (r) => {
    if (r.url().includes('/data/doe/')) {
      const f = r.url().split('/data/doe/')[1];
      fetched.push(f);
      all.push(f);
    }
  });

  try {
    await page.goto(`${BASE}#/team`);
    await page.getByRole('heading', { name: 'Lakeside Middle' }).waitFor({ timeout: 15000 });
    check(team.level === 'MS' && (await page.getByText('Middle school', { exact: true }).count()) > 0, 'The team is a middle school team');

    // Today's plan is built from the middle school catalog (checked below with everything the run loaded).
    await page.goto(`${BASE}#/today`);
    await page.getByRole('heading', { name: /^Your plan/ }).waitFor({ timeout: 15000 });
    check((await page.locator('.plan-item', { hasText: 'Biology drill' }).count()) > 0, "Today's plan has a drill in Mia's subject");

    await page.goto(`${BASE}#/library`);
    await page.getByText('Every DOE middle school sample set').waitFor();
    const firstCard = await page.locator('.grid .card h3').first().innerText();
    check(/Set 16/.test(firstCard), `Library lists middle school sets first (${firstCard})`);
    check((await page.getByText('High school sets').count()) > 0, 'High school sets are further down');

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

    // Today's plan may have loaded the concept file already (it is kept for the visit): whichever page loads it,
    // only the middle school one may ever be loaded.
    await page.goto(`${BASE}#/learn`);
    await page.waitForTimeout(1500);
    check(all.includes('concepts-ms.json') && !all.includes('concepts.json'), `Learn uses concepts-ms.json (${[...new Set(all)].filter((f) => f.startsWith('concepts')).join(', ')})`);

    await page.goto(`${BASE}#/tiebreakers`);
    check((await page.getByText('Rule 10-2').count()) > 0, 'Tiebreakers page notes the middle school Finals rule');

    await page.goto(`${BASE}#/library/doe-ms-finals`);
    await page.waitForTimeout(800);
    check((await page.locator('h1').innerText()).includes('Sample Rounds'), 'The national sample rounds open in the Library');
  } finally {
    check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
    const problems = await A.deleteAccounts(accounts);
    check(problems.length === 0, `the test account is deleted${problems.length ? `: ${problems.join('; ')}` : ''}`);
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
