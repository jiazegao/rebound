/*
 * Online matches read aloud, in three browsers against a local server (start both servers as e2e/accounts.cjs says):
 *
 *   node e2e/speech.cjs                     # SERVER_URL / BASE_URL / SHOTS_DIR as for the other tests
 *
 * Rebound's recorded voice is a stand-in (e2e/voice.cjs): the site's index of recordings and silent MP3s from the voice
 * Workers' addresses, served to the pages with no network. The host's page finds each question's recording and sends
 * it with the match; the lobby needs no wait; both players' pages play each recording in step (a stand-in for the
 * audio element's play() records what it is told), and nothing of the question shows until it is over. The first
 * bonus has no recording, so it shows as text and says why. A third player's device cannot reach the voice: it shows
 * the text, and the others see that.
 *
 * Uses the small fixture question set, like the other tests.
 */
const { chromium } = require('playwright');
const path = require('path');
const A = require('./accounts.cjs');
const V = require('./voice.cjs');

const { BASE } = A;
const SHOTS = process.env.SHOTS_DIR || '';

/** Records what the page's audio elements are told to play (runs in the page). */
function recordPlays() {
  window.__played = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const entry = { src: String(this.src).slice(0, 5), at: this.currentTime, rate: this.playbackRate, ok: null };
    window.__played.push(entry);
    const p = play.call(this);
    p.then(
      () => (entry.ok = true),
      (e) => (entry.ok = e.name),
    );
    return p;
  };
}

async function fixtures(page) {
  const f = (name) => path.join(__dirname, name);
  await page.route('**/data/doe/index.json', (r) => r.fulfill({ path: f('fixture-index.json'), contentType: 'application/json' }));
  await page.route('**/data/doe/doe-hs-99.json', (r) => r.fulfill({ path: f('fixture-set.json'), contentType: 'application/json' }));
  await page.route('**/data/doe/catalog.json', (r) => r.fulfill({ path: f('fixture-catalog.json'), contentType: 'application/json' }));
  await page.route('**/data/doe/concepts.json', (r) => r.fulfill({ path: f('fixture-concepts.json'), contentType: 'application/json' }));
}

const TOSSUP = 'What is the most common term used in genetics to describe the observable physical characteristics of an organism?';
const BONUS = 'What is the term for a virus that attacks bacteria?';

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
  const plays = (page) => page.evaluate(() => window.__played.filter((p) => p.src === 'blob:'));

  const accounts = [];
  try {
    const hana = await A.signUp('Hana');
    const paul = await A.signUp('Paul');
    const owen = await A.signUp('Owen');
    accounts.push(hana, paul, owen);
    // The first bonus has no recording: it shows as text for everyone.
    const voice = V.standInVoice({ unrecorded: ['doe-hs-99-r01-b01'] });
    const open = async (account, reachable = true) => {
      const ctx = await A.signedInContext(browser, account);
      await ctx.addInitScript(recordPlays);
      await V.useStandInVoice(ctx, voice, { reachable });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${account.name} pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        // A device that cannot reach the voice: the browser reports the index it could not fetch, as expected.
        if (!reachable && /\/data\/voice\/index\.json$/.test(m.location().url || '')) return;
        errors.push(`${account.name} console: ${m.text()}`);
      });
      page.on('dialog', (d) => d.accept());
      await fixtures(page);
      return page;
    };
    const host = await open(hana);
    const player = await open(paul);
    // Owen's device cannot reach Rebound's voice (offline, or a network that blocks it).
    const offline = await open(owen, false);
    let roomId = '';

    await step('the host opens a team match read aloud from Play online, with each question’s recording', async () => {
      await host.goto(`${BASE}#/online`);
      await host.getByRole('heading', { name: 'Start an online match' }).waitFor({ timeout: 15000 });
      await host.getByRole('radio', { name: /Read aloud/ }).check();
      // The recordings play at 120 to 240 words a minute: a faster speed is brought into range.
      await host.locator('#om-wpm').fill('600');
      await host.locator('#om-wpm').blur();
      const wpm = Number(await host.locator('#om-wpm').inputValue());
      if (wpm !== 240) throw new Error(`the reading speed should stop at 240 for a match read aloud, is ${wpm}`);
      await host.getByText(/toss-ups? from Round 1/).waitFor();
      await host.getByText('Rebound’s voice reads 7 of the 8 questions; the others show as text.').waitFor({ timeout: 10000 });
      await host.getByRole('button', { name: 'Open the match' }).click();
      await host.getByText('Waiting for the host to start the match').waitFor({ timeout: 15000 });
      roomId = (/#\/room\/([a-z2-7]{16})/.exec(host.url()) ?? [])[1] ?? '';
      if (!roomId) throw new Error(`the match did not open: ${host.url()}`);
      await host.getByRole('button', { name: 'Join Team A' }).click();
    });

    await step('the lobby needs no wait: it offers a sample at once, and says which questions show as text', async () => {
      await host.getByText('7 of the 8 questions have a recording; the others show as text.').waitFor({ timeout: 10000 });
      await player.goto(`${BASE}#/room/${roomId}`);
      await player.getByRole('button', { name: 'Join Team B' }).click();
      await player.getByRole('button', { name: 'Play a sample' }).click();
      await player.waitForFunction(() => window.__played.some((p) => p.src === 'blob:' && p.ok === true), null, { timeout: 10000 });
      if (await player.getByText('(sees the text').count()) throw new Error('with Rebound’s voice, nobody needs the text');
      await shot(player, 'recorded-1-lobby');
    });

    await step('a device that cannot reach the voice says so, and the others see that it reads the text', async () => {
      await offline.goto(`${BASE}#/room/${roomId}`);
      await offline.getByText(/Rebound’s voice can’t be reached on this device/).waitFor({ timeout: 15000 });
      await offline.getByRole('button', { name: 'Join Team B' }).click();
      await host.getByText('(sees the text: Rebound’s voice can’t play on their device)').waitFor({ timeout: 10000 });
      await host.getByRole('button', { name: 'Start the match' }).and(host.locator(':enabled')).waitFor({ timeout: 10000 });
    });

    await step('the toss-up’s recording plays on both devices at the match’s speed, with no text shown', async () => {
      await host.getByRole('button', { name: 'Start the match' }).click();
      for (const page of [player, host]) await page.getByText('Listening to the question…').waitFor({ timeout: 15000 });
      await shot(player, 'recorded-2-listening');
      for (let i = 0; i < 4; i++) {
        for (const page of [player, host]) if (await page.getByText(/observable|most common term/).count()) throw new Error('the question shows while it is read');
        await player.waitForTimeout(400);
      }
      for (const page of [player, host]) {
        const played = (await plays(page)).filter((p) => p.ok === true);
        // 240 words a minute against the voice's own 150: the fastest playback, 1.6.
        if (!played.some((p) => Math.abs(p.rate - 1.6) < 0.01)) throw new Error(`plays: ${JSON.stringify(played)}`);
      }
      // The device without the voice sees the text as it is read, and is told why.
      await offline.getByText(/most common term/).waitFor({ timeout: 10000 });
      await offline.getByText('This device can’t play this question’s recording, so you see it as text.').waitFor();
      await player.getByText('Seeing the text instead (Rebound’s voice can’t play on their device): Owen.').waitFor();
    });

    await step('once it is over, the toss-up’s text shows with its answer; the bonus has no recording, so it shows as text', async () => {
      await player.getByText(/s left$/).waitFor({ timeout: 30000 });
      await player.getByRole('button', { name: /Buzz/ }).click();
      await player.getByLabel(/^Your answer/).fill('phenotype');
      await player.keyboard.press('Enter');
      await player.getByText(`Toss-up 1: ${TOSSUP}`).waitFor({ timeout: 10000 });
      await player.getByText('ANSWER: PHENOTYPE').waitFor();
      await player.getByLabel(/answer for the team/).waitFor({ timeout: 30000 });
      await player.getByText(/virus that attacks/).waitFor({ timeout: 10000 });
      await player.getByText('This question has no recording, so it shows as text.').waitFor();
      await player.getByLabel(/answer for the team/).fill('bacteriophage');
      await player.keyboard.press('Enter');
      await player.getByText(BONUS).waitFor({ timeout: 10000 });
      await shot(player, 'recorded-3-bonus-over');
      await host.getByRole('button', { name: 'End the match' }).click(); // the confirm is accepted
      await player.getByText('The match is over.').waitFor({ timeout: 10000 });
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
