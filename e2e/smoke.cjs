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
    await page.route('**/data/doe/concepts.json', (r) => r.fulfill({ path: path.join(__dirname, 'fixture-concepts.json'), contentType: 'application/json' }));
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
      await see('This game added questions to review queues');
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

    await step('the captain sets a regional lineup from the Team pages', async () => {
      await page.goto(`${BASE}#/team`);
      await page.getByRole('link', { name: 'Lineups', exact: true }).click();
      await see('Suggested lineups');
      await page.locator('.plan-item').first().getByRole('button', { name: 'Use' }).click();
      await page.locator('.hero-figure').waitFor();
      const points = Number(await page.locator('.hero-figure').innerText());
      if (!(points > 0 && points < 200)) throw new Error(`unexpected estimate: ${points}`);
      await page.locator('#lineup-name').fill('Regional A');
      await page.getByRole('button', { name: 'Save lineup' }).click();
      await page.getByRole('button', { name: 'Use for Regional' }).click();
      await page.getByText('For Regional', { exact: true }).waitFor();
      await shot('12a-lineups');
      await page.goto(`${BASE}#/team`);
      await see('Lineup:');
      await see("The team's best in every topic");
    });

    await step('team packets: upload a packet, build a scrimmage, play it in the Reader console', async () => {
      await page.goto(`${BASE}#/packets`);
      await page.locator('#up-title').fill('Fixture upload');
      await page.locator('#up-files').setInputFiles(path.join(__dirname, 'fixture-set.json'));
      await see('Check before saving');
      await page.getByRole('button', { name: /Save packet \(4 toss-ups\)/ }).click();
      await page.getByRole('link', { name: 'Play in the Reader console' }).waitFor();
      const shown = await page.locator('.question-kind').count();
      if (shown !== 8) throw new Error(`expected 8 questions in the uploaded packet, got ${shown}`);
      await page.goto(`${BASE}#/packets`);
      await page.getByRole('button', { name: 'Build packet' }).click();
      await page.getByRole('button', { name: 'Save packet' }).click();
      await page.getByRole('link', { name: 'Play in the Reader console' }).click();
      await see('A team packet');
      if (!(await page.locator('input[name=source]').nth(1).isChecked())) throw new Error('the Reader console should start from the packet');
      await see('4 toss-ups.');
    });

    await step('Finals visual round: a scrimmage with visual bonuses runs in the Reader console (Phase 3 done criterion)', async () => {
      await page.goto(`${BASE}#/packets`);
      await page.locator('#scrim-format').selectOption('finals-visual');
      await page.locator('#scrim-visual').selectOption('1'); // every bonus that has a visual in its subject
      await page.getByRole('button', { name: 'Build packet' }).click();
      await see('visual bonuses');
      await page.getByRole('button', { name: 'Save packet' }).click();
      await page.getByRole('link', { name: 'Play in the Reader console' }).click();
      await see('A team packet');
      const preset = await page.locator('#preset').inputValue();
      if (preset !== 'doe-finals-visual-2027') throw new Error(`expected the Finals visual rules, got ${preset}`);
      await page.getByRole('button', { name: 'Auto-split' }).click();
      await page.getByRole('button', { name: 'Start game' }).click();
      await see('visual bonus rounds');
      await key('Space'); // start: two 12-minute halves
      const clock = await page.locator('.clock .time').innerText();
      if (!/^1[12]:\d\d$/.test(clock)) throw new Error(`expected a 12-minute half, the clock shows ${clock}`);
      // Answer toss-ups until a visual bonus comes up.
      for (let i = 0; i < 4; i++) {
        await key('Space'); // toss-up read
        await key('1');
        await key('c');
        if (await page.getByText('Visual bonus for').count()) break;
        await key('Space'); // a printed bonus: read
        await key('c');
        await key('Space'); // next
      }
      await see('Visual bonus for');
      await page.locator('.qfig .qfig-art').first().waitFor();
      await shot('17-reader-visual-bonus');
      await key('Space'); // done reading: 30 seconds
      const left = Number((await page.locator('.countdown').first().locator('xpath=..').innerText()).match(/([\d.]+) s/)?.[1]);
      if (!(left > 25 && left <= 30)) throw new Error(`expected about 30 seconds for a visual bonus, got ${left}`);
      await key('c');
    });

    await step('Visual lab: a generated visual bonus with the 30-second window', async () => {
      await page.goto(`${BASE}#/visual?template=math-sector`);
      await see('Visual bonus 1 of 5');
      await page.locator('.qfig svg').first().waitFor();
      await page.getByRole('button', { name: 'Done reading' }).click();
      await see('30');
      await page.getByRole('textbox', { name: 'Your answer' }).fill('1');
      await page.keyboard.press('Enter');
      await see('ANSWER:');
      await page.getByRole('button', { name: /Next/ }).click();
      await see('Visual bonus 2 of 5');
      await page.getByRole('button', { name: 'Stop' }).click();
      await see("Your team's visual questions");
    });

    await step('Visual lab: add a team visual question with a picture', async () => {
      await page.goto(`${BASE}#/visual`);
      await page.getByRole('button', { name: 'Add one' }).click();
      // A small PNG made in the page (a blue square), standing in for a photo.
      const png = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 40;
        c.height = 30;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#2a78d6';
        ctx.fillRect(0, 0, 40, 30);
        return c.toDataURL('image/png').split(',')[1];
      });
      await page.locator('#vq-picture').setInputFiles({ name: 'square.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await page.locator('form img').first().waitFor();
      await page.locator('#vq-alt').fill('A blue rectangle');
      await page.locator('#vq-credit').fill('Drawn by the team');
      await page.locator('#vq-subject').selectOption('math');
      await page.locator('#vq-stem').fill('What color is the shape shown?');
      await page.locator('#vq-answer').fill('blue');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await see("Your team's visual questions (1)");
      await see('BLUE');
    });

    await step('tiebreaker drill: a 5 toss-up tiebreaker game with no bonuses', async () => {
      await page.goto(`${BASE}#/reader?format=tiebreak`);
      await page.getByRole('button', { name: 'Auto-split' }).click();
      await page.getByRole('button', { name: 'Start game' }).click();
      await see('tiebreaker drill');
      await key('Space'); // start
      await see('Tiebreaker');
      await key('Space'); // toss-up 1 read
      await key('1');
      await key('c');
      await see('Question over');
      if (await page.getByText('Bonus for').count()) throw new Error('a tiebreaker has no bonuses');
    });

    await step('shootout drill and the Finals rules page', async () => {
      await page.goto(`${BASE}#/tiebreakers`);
      await page.getByRole('button', { name: 'Shootout drill on your own' }).click();
      await see('Toss-up 1 of');
      await page.getByRole('button', { name: 'Done reading' }).click();
      await page.getByRole('button', { name: 'Let it go (0)' }).click();
      await see('No buzz: 0');
      await page.goto(`${BASE}#/rules`);
      await page.getByRole('tab', { name: 'DOE National Finals 2027, visual bonus rounds' }).click();
      await see('30 seconds for the captain to begin answering');
      await see('2 halves of 12 minutes');
    });

    await step('concept cards: write one, a second player reviews it, drill its questions', async () => {
      await page.goto(`${BASE}#/learn`);
      await page.getByRole('link', { name: 'Circles, arcs and chords' }).click();
      await see('How NSB asks it');
      await page.getByRole('button', { name: 'Write the card' }).click();
      await page.locator('#card-summary').fill('A circle is the set of points at distance r from a center. Area is pi r squared; circumference is 2 pi r.');
      await page.locator('#card-facts').fill('A = πr²\nC = 2πr');
      await page.locator('#card-sources').fill('OpenStax Precalculus 2e | https://openstax.org/details/books/precalculus-2e');
      await page.getByRole('button', { name: 'Save card' }).click();
      await see('waiting for a second player to review');
      // Ann wrote it (she is practicing on this device); Bea reviews it.
      await page.evaluate(() => {
        location.hash = '#/today';
      });
      await page.locator('#player-switch').selectOption({ label: 'Bea' });
      await page.goBack();
      await page.getByRole('button', { name: /mark reviewed/ }).click();
      await see('reviewed by Bea');
      await shot('12b-concept-card');
      await page.getByRole('link', { name: 'Drill these' }).click();
      await see('Bonus 1 of 1');
      await page.goto(`${BASE}#/today`);
      await page.locator('#player-switch').selectOption({ label: 'Ann' });
    });

    await step('Write: a question passes the checks, the subject owner approves it, and it becomes a team packet', async () => {
      await page.goto(`${BASE}#/write`);
      await see('Strong teams write their own questions');
      await page.getByRole('link', { name: 'New question' }).click();
      await page.locator('#wq-subject').selectOption('physics');
      await page.locator('#wq-stem').fill('In meters per second squared, what is the acceleration due to gravity near Earth’s surface, to two significant figures?');
      await page.locator('#wq-answer').fill('9.8');
      // Checks run as you type: a missing source blocks sending it for review.
      await see('Cite at least one source');
      if (await page.getByRole('button', { name: 'Send for review' }).isEnabled()) throw new Error('sending without a source should be blocked');
      await page.getByLabel('Source 1', { exact: true }).fill('OpenStax College Physics 2e, 2.7 Falling Objects');
      await see('No problems found.');
      await page.getByRole('button', { name: 'Send for review' }).click();
      await see('Sent to the Physics owner for review.');
      const url = page.url();
      // Ann wrote it; Ben owns physics and approves it.
      await page.goto(`${BASE}#/today`);
      await page.locator('#player-switch').selectOption({ label: 'Ben' });
      await page.goto(url);
      await page.getByRole('button', { name: 'Approve' }).click();
      await see('Approved: it can now go into team packets.');
      await page.goto(`${BASE}#/write`);
      await see('Approved (1)');
      await shot('12c-write');
      await page.getByRole('button', { name: /Make the packet \(1 toss-up\)/ }).click();
      await see('Test High questions');
      await page.goto(`${BASE}#/today`);
      await page.locator('#player-switch').selectOption({ label: 'Ann' });
    });

    await step('assignments: the captain assigns a drill, it shows on Today and ticks off when done', async () => {
      await page.goto(`${BASE}#/assignments`);
      await page.locator('#as-subject').selectOption('biology');
      await page.locator('#as-count').selectOption('5');
      for (const n of ['Abe', 'Bea', 'Ben']) await page.getByRole('checkbox', { name: n }).uncheck();
      await page.locator('#as-title').fill('Biology warm-up');
      await page.getByRole('button', { name: 'Assign', exact: true }).click();
      await see('0 of 1 done');
      await page.goto(`${BASE}#/today`);
      const item = page.locator('.plan-item', { hasText: 'Biology warm-up' });
      await item.getByText('Assigned by').waitFor();
      await item.getByRole('link', { name: 'Start' }).click();
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
      await see("Ann's plan");
      if (await page.locator('.plan-item', { hasText: 'Biology warm-up' }).count()) throw new Error('the finished assignment is still on Today');
      await page.goto(`${BASE}#/assignments`);
      await see('1 of 1 done');
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

    await step('Library topics: how often each topic comes up, with links to drills', async () => {
      await page.goto(`${BASE}#/library`);
      await page.getByRole('link', { name: 'Browse by topic' }).click();
      await page.getByRole('heading', { name: 'Topics', exact: true }).waitFor();
      const bars = await page.locator('.hbar').count();
      if (bars !== 8) throw new Error(`expected 8 topic bars from the fixture catalog, got ${bars}`);
      await page.getByRole('link', { name: 'Genetics' }).first().waitFor();
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
