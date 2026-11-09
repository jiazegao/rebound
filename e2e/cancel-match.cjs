/*
 * Cancelling an online match before it starts, in two browsers against a local server (start both servers as
 * e2e/accounts.cjs says):
 *
 *   node e2e/cancel-match.cjs               # SERVER_URL / BASE_URL / SHOTS_DIR as for the other tests
 *
 * The host cancels one match from its lobby (the player waiting in it is told, and its link then says the game has
 * closed) and another from the Open games list. Only the host sees Cancel, and only until the match starts.
 *
 * Uses the small fixture question set, like the other tests.
 */
const { chromium } = require('playwright');
const path = require('path');
const A = require('./accounts.cjs');

const { BASE } = A;
const SHOTS = process.env.SHOTS_DIR || '';

async function fixtures(page) {
  const f = (name) => path.join(__dirname, name);
  await page.route('**/data/doe/index.json', (r) => r.fulfill({ path: f('fixture-index.json'), contentType: 'application/json' }));
  await page.route('**/data/doe/doe-hs-99.json', (r) => r.fulfill({ path: f('fixture-set.json'), contentType: 'application/json' }));
  await page.route('**/data/doe/catalog.json', (r) => r.fulfill({ path: f('fixture-catalog.json'), contentType: 'application/json' }));
  await page.route('**/data/doe/concepts.json', (r) => r.fulfill({ path: f('fixture-concepts.json'), contentType: 'application/json' }));
}

async function main() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(A.SERVER).hostname)) throw new Error('This test runs against a local server only (SERVER_URL).');
  const browser = await chromium.launch();
  const errors = [];
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
  const shot = async (page, name) => {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };

  const accounts = [];
  try {
    const made = await A.makeTeamOf(`Cancel test ${Date.now().toString(36)}`, [{ name: 'Hana' }, { name: 'Paul' }]);
    accounts.push(...made.accounts);
    const [hana, paul] = made.accounts;
    const open = async (account) => {
      const ctx = await A.signedInContext(browser, account);
      const page = await ctx.newPage();
      A.watchErrors(page, account.name, errors);
      page.on('dialog', (d) => d.accept());
      await fixtures(page);
      return page;
    };
    const host = await open(hana);
    const player = await open(paul);

    /** The host opens a team match from Play online and lands in its lobby: its room id. */
    const openMatch = async () => {
      await host.goto(`${BASE}#/online`);
      await host.getByRole('heading', { name: 'Start an online match' }).waitFor({ timeout: 15000 });
      await host.getByText(/toss-ups? from Round 1/).waitFor();
      await host.getByRole('button', { name: 'Open the match' }).click();
      await host.getByText('Waiting for the host to start the match').waitFor({ timeout: 15000 });
      const id = (/#\/room\/([a-z2-7]{16})/.exec(host.url()) ?? [])[1] ?? '';
      if (!id) throw new Error(`the match did not open: ${host.url()}`);
      return id;
    };
    /** The Open games row of a room on Play online (the page must be open there). */
    const row = (page, id) => page.locator('tr', { has: page.locator(`a[href$="/room/${id}"]`) });
    const openGames = async (page) => {
      await page.goto(`${BASE}#/online`);
      await page.getByRole('heading', { name: 'Open games' }).waitFor({ timeout: 15000 });
    };

    let first = '';
    await step('the host cancels a match from its lobby, and the player waiting in it is told', async () => {
      first = await openMatch();
      await player.goto(`${BASE}#/room/${first}`);
      await player.getByRole('button', { name: 'Join Team B' }).click();
      await host.getByText('Paul').waitFor({ timeout: 10000 });
      if (await player.getByRole('button', { name: 'Cancel the match' }).count()) throw new Error('a player who is not the host can cancel');
      await shot(host, 'cancel-1-lobby');
      await host.getByRole('button', { name: 'Cancel the match' }).click();
      await host.getByRole('heading', { name: 'Match cancelled' }).waitFor({ timeout: 10000 });
      await host.getByText('You cancelled this match.').waitFor();
      await player.getByRole('heading', { name: 'Match cancelled' }).waitFor({ timeout: 10000 });
      await player.getByText('The host cancelled this match before it started.').waitFor();
      await shot(player, 'cancel-2-player-told');
    });

    await step('its link then says the game has closed, and Open games no longer lists it', async () => {
      await player.goto(`${BASE}#/today`);
      await player.goto(`${BASE}#/room/${first}`);
      await player.getByRole('heading', { name: 'This game has closed' }).waitFor({ timeout: 10000 });
      await shot(player, 'cancel-3-closed-link');
      await player.getByRole('link', { name: 'Back to Play online' }).click();
      await player.getByRole('heading', { name: 'Open games' }).waitFor({ timeout: 15000 });
      await player.getByText(/No games open right now|Join/).first().waitFor({ timeout: 15000 });
      if (await row(player, first).count()) throw new Error('the cancelled match is still listed');
    });

    await step('only the host sees Cancel in Open games, and cancelling there tells the player waiting in it', async () => {
      const second = await openMatch();
      await openGames(player);
      await row(player, second).waitFor({ timeout: 15000 });
      if (await row(player, second).getByRole('button', { name: 'Cancel' }).count()) throw new Error('a teammate can cancel the host’s match');
      await row(player, second).getByRole('link', { name: 'Join' }).click();
      await player.getByRole('button', { name: 'Join Team B' }).click();
      await openGames(host);
      const mine = row(host, second);
      await mine.waitFor({ timeout: 15000 });
      await shot(host, 'cancel-4-open-games');
      await mine.getByRole('button', { name: 'Cancel' }).click();
      await mine.waitFor({ state: 'detached', timeout: 10000 });
      await player.getByText('The host cancelled this match before it started.').waitFor({ timeout: 10000 });
    });

    await step('a match that has started can no longer be cancelled', async () => {
      const third = await openMatch();
      await host.getByRole('button', { name: 'Join Team A' }).click();
      await player.goto(`${BASE}#/room/${third}`);
      await player.getByRole('button', { name: 'Join Team B' }).click();
      await host.getByRole('button', { name: 'Start the match' }).and(host.locator(':enabled')).waitFor({ timeout: 10000 });
      await host.getByRole('button', { name: 'Start the match' }).click();
      await host.getByText(/Toss-up 1/).first().waitFor({ timeout: 15000 });
      if (await host.getByRole('button', { name: 'Cancel the match' }).count()) throw new Error('Cancel the match shows once the match has started');
      await openGames(host);
      const started = row(host, third);
      await started.waitFor({ timeout: 15000 });
      await started.getByText('playing').waitFor();
      if (await started.getByRole('button', { name: 'Cancel' }).count()) throw new Error('a started match can be cancelled from the list');
    });

    await step('on a phone the list fits, Join and Cancel included', async () => {
      const fourth = await openMatch();
      await host.setViewportSize({ width: 390, height: 800 });
      await openGames(host);
      const listed = row(host, fourth);
      await listed.waitFor({ timeout: 15000 });
      const wide = await host.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (wide) throw new Error('the page scrolls sideways at 390 px');
      const box = await host.locator('.table-wrap').first().boundingBox();
      for (const control of [listed.getByRole('link', { name: 'Join' }), listed.getByRole('button', { name: 'Cancel' })]) {
        const b = await control.boundingBox();
        if (!b || !box || b.x < box.x || b.x + b.width > box.x + box.width + 0.5) throw new Error(`a button is cut off: ${JSON.stringify(b)} in ${JSON.stringify(box)}`);
      }
      await listed.getByText('Hana hosts').waitFor();
      await shot(host, 'cancel-5-phone');
    });
  } finally {
    // Close the pages first: a page whose account is gone would see its next request refused.
    await browser.close();
    const problems = await A.deleteAccounts(accounts);
    if (problems.length) errors.push(`clean up: ${problems.join('; ')}`);
  }
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
