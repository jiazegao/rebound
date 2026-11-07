/*
 * Browser smoke test: walks through team setup, a full Reader-console game, the game
 * summary, stats, a solo round, the review queue, today's plan, a drill, My progress and
 * offline use, using a small fixture question set (the offline check uses the real library).
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
  // Routes cannot see requests a service worker answers, so the fixture run blocks it; the offline check allows it.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
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
    await page.route('**/data/doe/catalog.json', (r) => r.fulfill({ path: path.join(__dirname, 'fixture-catalog.json'), contentType: 'application/json' }));
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

    await step('game misses, dead toss-ups and missed bonuses go to the review queue', async () => {
      await page.goto(`${BASE}#/review`);
      // Abe: missed toss-up 3, and owns chemistry, whose toss-up 2 nobody got. Bea: wrong interrupt, and owns math, whose bonus her team missed.
      for (const [name, count] of [
        ['Abe', '2'],
        ['Bea', '2'],
        ['Ben', '1'],
      ]) {
        await page.locator('#player-switch').selectOption({ label: name });
        const tile = page.locator('.card', { hasText: 'In your queue' }).first();
        await tile.waitFor();
        const text = await tile.innerText();
        if (!text.includes(count)) throw new Error(`${name} should have ${count} review questions: ${text}`);
      }
      await page.locator('#player-switch').selectOption({ label: 'Ann' });
    });

    await step('next competition date', async () => {
      await page.goto(`${BASE}#/team`);
      const d = new Date(Date.now() + 10 * 86400000);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await page.locator('#event-name').fill('Regional');
      await page.locator('#event-date').fill(iso);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await see('Regional is in 10 days');
    });

    await step("Today shows each player's plan with reasons", async () => {
      await page.goto(`${BASE}#/today`);
      await see("Ann's plan");
      await see('Regional in 10 days');
      const items = await page.locator('.plan-item').count();
      if (items < 3) throw new Error(`expected at least 3 plan items, got ${items}`);
      const why = await page.locator('.why-label').count();
      if (why !== items) throw new Error('every plan item needs a "Why this?" line');
      await see('Biology drill');
      await see('timed mixed play');
      await shot('12-today-plan');
    });

    await step('a drill started from the plan begins at once and ticks itself off', async () => {
      await page.locator('.plan-item', { hasText: 'Biology drill' }).getByRole('link', { name: 'Start' }).click();
      await page.getByRole('button', { name: /Buzz/ }).waitFor();
      await page.waitForTimeout(600);
      await key('Space');
      await page.locator('#answer').fill('phenotype');
      await key('Enter');
      await see('Correct');
      await key('Space');
      await page.locator('#answer').fill('bacteriophage');
      await key('Enter');
      await see('Correct');
      await key('Space');
      await page.getByRole('link', { name: "Back to today's plan" }).click();
      const drill = page.locator('.plan-item', { hasText: 'Biology drill' });
      await drill.getByText('Done', { exact: true }).waitFor({ timeout: 5000 });
    });

    await step('add a question from the library and review it, timed', async () => {
      await page.goto(`${BASE}#/library/doe-hs-99/doe-hs-99-r01`);
      await page.getByRole('button', { name: 'Add to my review' }).first().click();
      await see("In Ann's review queue");
      await page.goto(`${BASE}#/review`);
      await page.getByRole('button', { name: /Start review \(1\)/ }).click();
      await page.getByRole('button', { name: /Buzz/ }).waitFor();
      await shot('13-review-question');
      await key('Space');
      await page.locator('#review-answer').fill('phenotype');
      await key('Enter');
      await see('Correct');
      await see('back in');
      await shot('14-review-answer');
      await key('Space');
      await see('Reviewed 1: 1 right');
    });

    await step('My progress shows mastery by subject and the subject map', async () => {
      await page.goto(`${BASE}#/progress`);
      await see('Mastery by subject');
      await see('Subject map');
      const bars = await page.locator('.hbar').count();
      if (bars < 4) throw new Error(`expected bars for 4 subjects, got ${bars}`);
      const cells = await page.locator('.heat-cell').count();
      if (cells < 60) throw new Error(`expected a cell per topic, got ${cells}`);
      await page.locator('.hbar').first().hover();
      await page.locator('.viz-tip').first().waitFor();
      await shot('15-progress');
      await page.getByRole('button', { name: 'Show table' }).first().click();
      await page.getByRole('cell', { name: 'Biology' }).first().waitFor();
    });

    await step('solo reading shows letters one at a time, current word fainter', async () => {
      await page.goto(`${BASE}#/try`);
      await page.locator('#who').selectOption('');
      await page.locator('#set').selectOption('doe-hs-99');
      await page.locator('#round').selectOption('doe-hs-99-r01');
      await page.locator('#wpm').fill('120');
      await page.getByRole('button', { name: 'Start' }).click();
      await page.locator('.stem').first().waitFor();
      const lengths = [];
      let sawCurrent = false;
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(150);
        lengths.push((await page.locator('.stem').first().innerText()).length);
        if ((await page.locator('.reading-current').count()) > 0) sawCurrent = true;
      }
      if (!(lengths[7] > lengths[0])) throw new Error(`text did not grow: ${lengths}`);
      // At 120 words per minute (about 83 ms per letter), each 150 ms sample adds only a letter or two.
      const steps = lengths.slice(1).map((l, i) => l - lengths[i]);
      if (!steps.some((d) => d >= 1 && d <= 3)) throw new Error(`reveal is not letter by letter: ${lengths}`);
      if (!sawCurrent) throw new Error('the word being read is never shown fainter');
      await shot('12-solo-reveal');
    });

    await step('answer timer: no typing within 2 seconds is a stall', async () => {
      await key('Space'); // buzz (an interrupt, the question is still being read)
      await page.locator('#answer').waitFor();
      await see('Start typing');
      await page.waitForTimeout(2400);
      await see('Stall');
      await shot('13-solo-stall');
      await key('Space'); // next toss-up
    });

    await step('answer timer: the typed answer is taken at 5 seconds', async () => {
      await page.getByRole('button', { name: /Buzz/ }).waitFor();
      await key('Space');
      await page.locator('#answer').pressSequentially('basi');
      await see('Finish your answer');
      await page.waitForTimeout(5300);
      await see('Time: your answer was taken');
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
      await see("Who's practicing?");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) throw new Error('page scrolls sideways on a phone');
      await shot('11-phone-today');
    });
  }

  await step('offline: the site opens with no connection, and saved questions work', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`offline pageerror: ${e.message}`));
    await p.goto(BASE);
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await p.reload();
    await p.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await ctx.setOffline(true);
    await p.reload();
    await p.getByText('Practice like the real thing').first().waitFor({ timeout: 8000 });
    await ctx.setOffline(false);
    await p.goto(`${BASE}#/data`);
    await p.getByRole('button', { name: 'Save all questions for offline use' }).click();
    await p.getByText(/All \d+ question files are saved/).first().waitFor({ timeout: 30000 });
    await ctx.setOffline(true);
    await p.goto(`${BASE}#/library/doe-hs-17/doe-hs-17-r01`);
    await p.locator('.question-kind').first().waitFor({ timeout: 8000 });
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, '16-offline-library.png') });
    await ctx.close();
  });

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
