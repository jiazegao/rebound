/*
 * Solo practice read aloud, in a browser against a local server (start both servers as e2e/accounts.cjs says):
 *
 *   node e2e/solo-speech.cjs                # SERVER_URL / BASE_URL / SHOTS_DIR as for the other tests
 *
 * Rebound's recorded voice is a stand-in (e2e/voice.cjs): the site's index of recordings and silent MP3s from the voice
 * Workers' addresses, served to the page with no network. A stand-in for the audio element's play() and pause()
 * records what it is told. Nothing of a question shows while it is read, the buzzers open when the reading ends, a
 * buzz during the reading is an interrupt and stops the recording, the question's text shows with its answer, and a
 * question with no recording shows as text and says why.
 *
 * Uses the small fixture question set, like the other tests.
 */
const { chromium } = require('playwright');
const path = require('path');
const A = require('./accounts.cjs');
const V = require('./voice.cjs');

const { BASE } = A;
const SHOTS = process.env.SHOTS_DIR || '';

/** Records what the page's audio elements are told to play and when they are paused (runs in the page). */
function recordPlays() {
  window.__played = [];
  window.__paused = 0;
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
  const pause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function () {
    if (String(this.src).startsWith('blob:') && !this.paused) window.__paused += 1;
    return pause.call(this);
  };
}

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
  const accounts = [];
  try {
    const sol = await A.signUp('Sol');
    accounts.push(sol);
    // The second bonus has no recording: it shows as text.
    const voice = V.standInVoice({ unrecorded: ['doe-hs-99-r01-b02'] });
    const ctx = await A.signedInContext(browser, sol);
    await ctx.addInitScript(recordPlays);
    const served = await V.useStandInVoice(ctx, voice);
    const page = await ctx.newPage();
    A.watchErrors(page, 'Sol', errors);
    await fixtures(page);
    const shot = async (name) => {
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
    };
    const plays = () => page.evaluate(() => window.__played.filter((p) => p.src === 'blob:'));
    /** How many times a recording has started playing. */
    const voiced = async () => (await plays()).length;

    await step('the setup offers reading aloud, with Rebound’s voice to try', async () => {
      await page.goto(`${BASE}#/try`);
      await page.getByRole('heading', { name: 'Solo practice', level: 1 }).waitFor({ timeout: 15000 });
      await page.getByRole('radio', { name: /Read aloud/ }).check();
      await page.getByText('Rebound’s voice reads each question').waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: 'Play a sample' }).click();
      await page.waitForFunction(() => window.__played.some((p) => p.src === 'blob:' && p.ok === true), null, { timeout: 10000 });
      if (!served.some((u) => u.includes(voice.index.sample.key))) throw new Error(`the sample came from: ${served.join(', ')}`);
      await shot('solo-speech-1-setup');
    });

    await step('a toss-up is heard, not shown; the buzzers open when it ends, and its text comes with the answer', async () => {
      await page.locator('#set').selectOption('doe-hs-99');
      await page.locator('#round').selectOption('doe-hs-99-r01');
      await page.locator('#wpm').fill('240');
      const before = await voiced();
      await page.getByRole('button', { name: 'Start' }).click();
      await page.getByText('Listening to the question…').waitFor({ timeout: 15000 });
      await shot('solo-speech-2-listening');
      await page.waitForFunction((n) => window.__played.filter((p) => p.src === 'blob:').length > n, before, { timeout: 10000 });
      for (let i = 0; i < 4; i++) {
        if (await page.getByText(/observable|most common term/).count()) throw new Error('the toss-up shows while it is read');
        await page.waitForTimeout(300);
      }
      // 240 words a minute against the voice's own 150: the fastest playback, 1.6.
      const p = (await plays()).filter((x) => x.ok === true);
      if (!p.some((x) => Math.abs(x.rate - 1.6) < 0.01)) throw new Error(`plays: ${JSON.stringify(p)}`);
      // Each recording comes from its Worker, by the first character of its name, with its fingerprint.
      const urls = served.filter((u) => !u.includes(voice.index.sample.key));
      if (!urls.length || !urls.every((u) => /^https:\/\/voice-[12]\.rebound\.test\/[0-9a-f]{40}\.mp3\?v=[0-9a-f]{8}$/.test(u))) {
        throw new Error(`fetched: ${urls.join(', ')}`);
      }
      for (const u of urls) {
        const key = /\/([0-9a-f]{40})\.mp3/.exec(u)[1];
        const host = parseInt(key[0], 16) < 8 ? 'voice-1' : 'voice-2';
        if (!u.includes(host)) throw new Error(`${key} came from the wrong Worker: ${u}`);
      }
      await page.getByText('Time to buzz').waitFor({ timeout: 20000 });
      if (await page.getByText(/observable/).count()) throw new Error('the toss-up shows once its reading is over');
      await page.keyboard.press('Space');
      await page.locator('#answer').fill('phenotype');
      await page.keyboard.press('Enter');
      await page.getByText(/observable physical characteristics/).waitFor({ timeout: 5000 });
      await page.getByText(/PHENOTYPE/).first().waitFor();
      await shot('solo-speech-3-answer');
    });

    await step('the bonus is read aloud too, and can be answered while it is read, which stops the recording', async () => {
      await page.keyboard.press('Space');
      await page.getByText('Listening to the question…').waitFor({ timeout: 15000 });
      await page.locator('#answer').waitFor();
      if (await page.getByText(/virus that attacks bacteria/).count()) throw new Error('the bonus shows while it is read');
      await page.waitForTimeout(500);
      await page.locator('#answer').fill('bacteriophage');
      await page.keyboard.press('Enter');
      await page.getByText(/virus that attacks bacteria/).waitFor({ timeout: 5000 });
      const after = await voiced();
      await page.waitForTimeout(1500);
      if ((await voiced()) !== after) throw new Error('the recording went on after the bonus was answered');
    });

    await step('a buzz during the reading is an interrupt, and stops the recording', async () => {
      const before = await voiced();
      const pausedBefore = await page.evaluate(() => window.__paused);
      await page.keyboard.press('Space');
      await page.getByText('Listening to the question…').waitFor({ timeout: 15000 });
      await page.waitForFunction((n) => window.__played.filter((p) => p.src === 'blob:').length > n, before, { timeout: 10000 });
      await page.waitForTimeout(400);
      await page.keyboard.press('Space');
      await page.getByText(/^Interrupt/).waitFor({ timeout: 5000 });
      await page.waitForFunction((n) => window.__paused > n, pausedBefore, { timeout: 3000 });
      await page.locator('#answer').fill('W');
      await page.keyboard.press('Enter');
      await page.getByText(/aqueous solution/).waitFor({ timeout: 5000 });
      await shot('solo-speech-4-interrupt');
    });

    await step('a question with no recording shows as text, and says why', async () => {
      // The interrupt was right (W, basic): its bonus, which has no recording, comes next.
      const before = await voiced();
      await page.keyboard.press('Space');
      await page.getByText('This question has no recording, so it shows as text.').waitFor({ timeout: 15000 });
      await page.getByText(/cuprous oxide/).waitFor({ timeout: 10000 });
      if ((await voiced()) !== before) throw new Error('a recording played for a question that has none');
      await shot('solo-speech-5-unrecorded');
      await page.locator('#answer').fill('144');
      await page.keyboard.press('Enter');
      await page.getByText(/ANSWER/).first().waitFor({ timeout: 5000 });
    });

    await step('Stop shows the summary so far, and keeps the answer just judged', async () => {
      const attempts = async () => (await A.allRecords('/api/me/records', sol)).filter((r) => r.c === 'attempts' && r.body).length;
      await A.allSaved(page);
      const before = await attempts();
      await page.getByRole('button', { name: 'Stop' }).click();
      await page.getByRole('heading', { level: 1, name: /points$/ }).waitFor({ timeout: 5000 });
      await page.getByRole('button', { name: 'Play again' }).waitFor({ timeout: 5000 });
      await A.allSaved(page);
      const after = await attempts();
      if (after !== before + 1) throw new Error(`stopping on a judged answer should save it (${before} practice answers before, ${after} after)`);
    });

    await step('the choice is remembered on this device', async () => {
      // Away to another page and back (waiting for it: a page that never showed would leave this one as it was).
      await page.goto(`${BASE}#/today`);
      await page.getByRole('heading', { name: 'Today', exact: true }).waitFor({ timeout: 15000 });
      await page.goto(`${BASE}#/try`);
      await page.getByRole('heading', { name: 'Solo practice', level: 1 }).waitFor({ timeout: 15000 });
      if (!(await page.getByRole('radio', { name: /Read aloud/ }).isChecked())) throw new Error('Read aloud is not chosen any more');
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
