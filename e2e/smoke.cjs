/*
 * Browser smoke test: walks through team setup, a full Reader-console game, the game
 * summary, stats and a solo round, using a small fixture question set.
 *
 *   npm run build && npx vite preview --port 4173 --strictPort &
 *   node e2e/smoke.cjs                      # uses e2e/fixture-*.json
 *   REAL_DATA=1 node e2e/smoke.cjs          # only checks pages against the real library
 *   SHOTS_DIR=/some/dir node e2e/smoke.cjs  # also saves screenshots
 *
 * Needs Playwright with Chromium installed (require('playwright')).
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const USE_FIXTURES = process.env.REAL_DATA !== '1';
const SHOTS = process.env.SHOTS_DIR || '';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('dialog', (d) => d.accept());

  if (USE_FIXTURES) {
    await page.route('**/data/doe/index.json', (r) => r.fulfill({ path: path.join(__dirname, 'fixture-index.json'), contentType: 'application/json' }));
    await page.route('**/data/doe/doe-hs-99.json', (r) => r.fulfill({ path: path.join(__dirname, 'fixture-set.json'), contentType: 'application/json' }));
  }

  let failures = 0;
  const step = async (name, fn) => {
    process.stdout.write(`- ${name} ... `);
    try {
      await fn();
      console.log('ok');
    } catch (err) {
      failures += 1;
      console.log(`FAILED\n    ${String(err && err.message ? err.message : err).split('\n')[0]}`);
    }
  };
  const see = (text) => page.getByText(text, { exact: false }).first().waitFor({ timeout: 5000 });
  const shot = async (name) => {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };
  const key = async (k) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(120);
  };
  const scores = async () => [await page.locator('.score-a .points').innerText(), await page.locator('.score-b .points').innerText()];

  await step('home page loads', async () => {
    await page.goto(BASE);
    await see('Practice like the real thing');
    await shot('01-home');
  });

  if (!USE_FIXTURES) {
    await step('library lists the real sets', async () => {
      await page.goto(`${BASE}#/library`);
      await see('Set 17');
      await page.getByRole('link', { name: /Set 17/ }).first().click();
      await see('Round 1');
      await shot('real-library-set');
      await page.getByRole('link', { name: 'Round 1', exact: true }).first().click();
      await see('TOSS-UP');
      await shot('real-library-round');
    });
  } else {
    await step('create a team', async () => {
      await page.getByRole('link', { name: 'Set up your team' }).click();
      await page.getByLabel('Team name').fill('Test High');
      await page.getByRole('button', { name: 'Create team' }).click();
      await see('Roster');
    });

    await step('add four players with subjects', async () => {
      for (const [name, subject] of [
        ['Ann', 'biology'],
        ['Abe', 'chemistry'],
        ['Bea', 'math'],
        ['Ben', 'physics'],
      ]) {
        await page.locator('#new-player').fill(name);
        await page.getByLabel('Primary subject', { exact: true }).selectOption(subject);
        await page.getByRole('button', { name: 'Add player' }).click();
      }
      await see('Who covers what');
      await shot('02-team');
    });

    await step('set up a Reader-console game', async () => {
      await page.getByRole('link', { name: 'Play' }).click();
      await see('1. Questions');
      await page.locator('#round').waitFor();
      for (const [name, team] of [
        ['Ann', 'Team A'],
        ['Abe', 'Team A'],
        ['Bea', 'Team B'],
        ['Ben', 'Team B'],
      ]) {
        await page.getByRole('radiogroup', { name: `${name} plays for` }).getByRole('radio', { name: team }).click();
      }
      await shot('03-reader-setup');
      await page.getByRole('button', { name: 'Start game' }).click();
      await see('Check the lineups');
    });

    await step('play a full game with the keyboard', async () => {
      await key('Space'); // start
      await see('Done reading');
      await key('Space'); // toss-up 1 read
      await key('1'); // Ann buzzes
      await key('c'); // correct
      await key('u'); // undo...
      await key('c'); // ...and judge again
      await key('Space'); // bonus read
      await shot('04-reader-bonus');
      await key('c'); // bonus correct
      let s = await scores();
      if (s.join() !== '14,0') throw new Error(`after toss-up 1 expected 14-0, got ${s}`);
      await key('Space'); // next
      await key('7'); // Bea interrupts toss-up 2
      await key('x'); // wrong → +4 to A and a re-read
      s = await scores();
      if (s.join() !== '18,0') throw new Error(`after the interrupt expected 18-0, got ${s}`);
      await see('Re-read the whole toss-up');
      await key('Space'); // re-read done
      await key('n'); // nobody buzzes
      await key('Space'); // next
      await key('Space'); // toss-up 3 read
      await key('2'); // Abe
      await key('x'); // wrong, rebound to B
      await see('Rebound');
      await key('8'); // Ben
      await key('c');
      await key('Space'); // bonus read
      await key('x'); // bonus wrong
      await key('Space'); // next
      await key('Space'); // toss-up 4 read
      await shot('05-reader-tossup');
      await key('n');
      await key('Space'); // next → packet over
      await see('Game over');
      s = await scores();
      if (s.join() !== '18,4') throw new Error(`final expected 18-4, got ${s}`);
    });

    await step('game summary', async () => {
      await page.getByRole('link', { name: 'See game summary' }).click();
      await see('Team A 18 – 4 Team B');
      await see('Question by question');
      await shot('06-summary');
    });

    await step('team stats', async () => {
      await page.goto(`${BASE}#/stats`);
      await see('Toss-up accuracy by subject');
      const annRow = page.getByRole('row', { name: /Ann/ }).first();
      const text = await annRow.innerText();
      if (!text.includes('1 / 1')) throw new Error(`Ann's row should show 1 / 1: ${text}`);
      await shot('07-stats');
    });

    await step('solo round with typed answers', async () => {
      await page.goto(`${BASE}#/try`);
      await page.locator('#who').selectOption({ label: 'Ann' });
      await page.locator('#set').selectOption('doe-hs-99');
      await page.locator('#round').selectOption('doe-hs-99-r01');
      await page.locator('#wpm').fill('320');
      await page.getByRole('button', { name: 'Start' }).click();
      const answers = [
        ['phenotype', 'phage'],
        ['W', '144 grams'],
        ['-1.25', '9 pi'],
        ['amplitud', 'diffraction'],
      ];
      for (const [tossup, bonus] of answers) {
        await page.getByRole('button', { name: /Buzz/ }).waitFor();
        await page.waitForTimeout(600);
        await key('Space'); // buzz
        await page.locator('#answer').fill(tossup);
        await key('Enter');
        if (tossup === 'amplitud') {
          await see('Your call');
          await shot('08-solo-review');
          await key('y');
        }
        await see('Correct');
        await key('Space'); // to the bonus
        await page.locator('#answer').fill(bonus);
        await key('Enter');
        await see('Correct');
        await key('Space');
      }
      await see('56 points');
      await shot('09-solo-done');
    });

    await step('stats include solo practice', async () => {
      await page.goto(`${BASE}#/stats`);
      const text = await page.getByRole('row', { name: /Ann/ }).first().innerText();
      if (!text.includes('8 / 8')) throw new Error(`expected solo 8 / 8 in: ${text}`);
    });

    await step('library and rules pages', async () => {
      await page.goto(`${BASE}#/library/doe-hs-99/doe-hs-99-r01`);
      await see('Heard by');
      await shot('10-library-round');
      await page.goto(`${BASE}#/rules`);
      await see('NSB rules at a glance');
      await see('5 seconds after the toss-up is fully read');
    });

    await step('backup download', async () => {
      await page.goto(`${BASE}#/data`);
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup file' }).click()]);
      if (!download.suggestedFilename().endsWith('.json')) throw new Error('backup is not a .json file');
    });

    await step('phone layout', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${BASE}#/today`);
      await see('Quick start');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) throw new Error('page scrolls sideways on a phone');
      await shot('11-phone-today');
    });
  }

  await browser.close();
  if (errors.length) {
    console.log('\nBrowser errors:');
    for (const e of errors) console.log(`  ${e}`);
  }
  if (failures || errors.length) process.exit(1);
  console.log('\nAll checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
