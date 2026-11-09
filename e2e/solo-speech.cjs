/*
 * Solo practice read aloud, in a browser against a local server (start both servers as e2e/accounts.cjs says):
 *
 *   node e2e/solo-speech.cjs                # SERVER_URL / BASE_URL / SHOTS_DIR as for the other tests
 *
 * It tests whichever voice the server has:
 *
 * - Rebound's recorded voice, when the server runs with DEV_TTS_FAKE=1 (npx wrangler dev --var DEV_TTS_FAKE:1),
 *   which records silent stand-ins instead of calling Google; a stand-in for the audio element's play() and pause()
 *   records what it is told.
 * - Otherwise the device's own voice: a pretend one that says nothing out loud but takes the time a voice would and
 *   records each phrase it is asked to say.
 *
 * Either way nothing of a question shows while it is read, the buzzers open when the reading ends, a buzz during the
 * reading is an interrupt and stops the voice, and the question's text shows with its answer.
 *
 * Uses the small fixture question set, like the other tests.
 */
const { chromium } = require('playwright');
const path = require('path');
const A = require('./accounts.cjs');

const { BASE } = A;
const SHOTS = process.env.SHOTS_DIR || '';

/** A pretend voice (runs in the page): 15 characters a second at its normal rate; records what it is asked to say. */
function pretendVoice() {
  const said = [];
  let timers = [];
  window.__cancels = 0;
  const voice = { name: 'Test Voice', lang: 'en-US', voiceURI: 'test-voice', localService: true, default: true };
  const synth = {
    getVoices: () => [voice],
    addEventListener() {},
    removeEventListener() {},
    speak(u) {
      if (u.volume === 0) return;
      said.push({ text: u.text, rate: u.rate, at: Date.now() });
      const ms = (u.text.length / (15 * (u.rate || 1))) * 1000;
      timers.push(setTimeout(() => u.onstart && u.onstart({}), 80));
      timers.push(setTimeout(() => u.onend && u.onend({}), 80 + ms));
    },
    cancel() {
      window.__cancels += 1;
      for (const t of timers) clearTimeout(t);
      timers = [];
    },
  };
  class Utterance {
    constructor(text) {
      Object.assign(this, { text, rate: 1, volume: 1, lang: '', voice: null, onstart: null, onend: null, onerror: null });
    }
  }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true, writable: true });
  window.__said = said;
}

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
    const ctx = await A.signedInContext(browser, sol);
    await ctx.addInitScript(pretendVoice);
    await ctx.addInitScript(recordPlays);
    const page = await ctx.newPage();
    A.watchErrors(page, 'Sol', errors);
    await fixtures(page);
    const shot = async (name) => {
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
    };
    const said = () => page.evaluate(() => window.__said.map((s) => s.text));
    const plays = () => page.evaluate(() => window.__played.filter((p) => p.src === 'blob:'));
    let recorded = false;
    /** How many times the voice has started something: phrases said, or recordings played. */
    const voiced = async () => (recorded ? (await plays()).length : (await said()).length);

    await step('the setup offers reading aloud, with a voice to try', async () => {
      await page.goto(`${BASE}#/try`);
      await page.getByRole('heading', { name: 'Solo practice', level: 1 }).waitFor({ timeout: 15000 });
      await page.getByRole('radio', { name: /Read aloud/ }).check();
      await page.getByText(/Rebound’s voice reads each question|read aloud with this device’s voice/).waitFor({ timeout: 10000 });
      recorded = (await page.getByText('Rebound’s voice reads each question').count()) > 0;
      console.log(`\n  (testing ${recorded ? 'Rebound’s recorded voice' : 'the device’s own voice'})`);
      await page.getByRole('button', { name: 'Play a sample' }).click();
      if (recorded) await page.waitForFunction(() => window.__played.some((p) => p.src === 'blob:' && p.ok === true), null, { timeout: 10000 });
      else await page.waitForFunction(() => window.__said.some((s) => /organelle/.test(s.text)), null, { timeout: 5000 });
      await shot('solo-speech-1-setup');
    });

    await step('a toss-up is heard, not shown; the buzzers open when it ends, and its text comes with the answer', async () => {
      await page.locator('#set').selectOption('doe-hs-99');
      await page.locator('#round').selectOption('doe-hs-99-r01');
      await page.locator('#wpm').fill('300');
      const before = await voiced();
      await page.getByRole('button', { name: 'Start' }).click();
      await page.getByText('Listening to the question…').waitFor({ timeout: 15000 });
      await shot('solo-speech-2-listening');
      await page.waitForFunction(
        ([n, rec]) => (rec ? window.__played.filter((p) => p.src === 'blob:').length : window.__said.length) > n,
        [before, recorded],
        { timeout: 10000 },
      );
      for (let i = 0; i < 4; i++) {
        if (await page.getByText(/observable|most common term/).count()) throw new Error('the toss-up shows while it is read');
        await page.waitForTimeout(300);
      }
      if (recorded) {
        // 300 words a minute against the voice's natural 160: the fastest playback, 1.6.
        const p = (await plays()).filter((x) => x.ok === true);
        if (!p.some((x) => Math.abs(x.rate - 1.6) < 0.01)) throw new Error(`plays: ${JSON.stringify(p)}`);
      } else {
        const phrases = await said();
        if (!phrases.some((t) => /most common term/.test(t))) throw new Error(`said: ${JSON.stringify(phrases)}`);
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

    await step('the bonus is read aloud too, and can be answered while it is read, which stops the voice', async () => {
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
      if ((await voiced()) !== after) throw new Error('the voice went on after the bonus was answered');
    });

    await step('a buzz during the reading is an interrupt, and stops the voice', async () => {
      const before = await voiced();
      const pausedBefore = await page.evaluate(() => window.__paused);
      const cancelsBefore = await page.evaluate(() => window.__cancels);
      await page.keyboard.press('Space');
      await page.getByText('Listening to the question…').waitFor({ timeout: 15000 });
      await page.waitForFunction(
        ([n, rec]) => (rec ? window.__played.filter((p) => p.src === 'blob:').length : window.__said.length) > n,
        [before, recorded],
        { timeout: 10000 },
      );
      await page.waitForTimeout(400);
      await page.keyboard.press('Space');
      await page.getByText(/^Interrupt/).waitFor({ timeout: 5000 });
      if (recorded) {
        await page.waitForFunction((n) => window.__paused > n, pausedBefore, { timeout: 3000 });
      } else {
        await page.waitForFunction((n) => window.__cancels > n, cancelsBefore, { timeout: 3000 });
        const spoken = (await said()).length;
        await page.waitForTimeout(1500);
        if ((await said()).length !== spoken) throw new Error('the voice went on after the buzz');
      }
      await page.locator('#answer').fill('W');
      await page.keyboard.press('Enter');
      await page.getByText(/aqueous solution/).waitFor({ timeout: 5000 });
      await shot('solo-speech-4-interrupt');
    });

    await step('the choice is remembered on this device', async () => {
      await page.goto(`${BASE}#/today`);
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
