/*
 * Online matches read aloud, in two browsers against a local server (start both servers as e2e/accounts.cjs says):
 *
 *   node e2e/speech.cjs                     # SERVER_URL / BASE_URL / SHOTS_DIR as for the other tests
 *
 * The host opens a team match read aloud from the Play online page. The player's device has a voice: a pretend one
 * that says nothing out loud but takes the time a voice would and records each phrase it is asked to say. The
 * player tries a sample in the lobby, then hears each question without seeing it, and sees it with its answer once
 * it is over. The host's device has no voice, so the host sees the text instead, and the player is told so.
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

/** A device with speech synthesis but no voices at all (runs in the page). */
function noVoice() {
  const synth = { getVoices: () => [], addEventListener() {}, removeEventListener() {}, speak() {}, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
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
  const said = (page) => page.evaluate(() => window.__said.map((s) => s.text));

  const accounts = [];
  try {
    const hana = await A.signUp('Hana');
    const paul = await A.signUp('Paul');
    accounts.push(hana, paul);
    const open = async (account, voice) => {
      const ctx = await A.signedInContext(browser, account);
      await ctx.addInitScript(voice);
      const page = await ctx.newPage();
      A.watchErrors(page, account.name, errors);
      page.on('dialog', (d) => d.accept());
      await fixtures(page);
      return page;
    };
    const host = await open(hana, noVoice);
    const player = await open(paul, pretendVoice);
    let roomId = '';

    await step('the host opens a team match read aloud from Play online', async () => {
      await host.goto(`${BASE}#/online`);
      await host.getByRole('heading', { name: 'Start an online match' }).waitFor({ timeout: 15000 });
      await host.getByRole('radio', { name: /Read aloud/ }).check();
      // A voice keeps to 100–300 words a minute: a faster speed is brought into range.
      await host.locator('#om-wpm').fill('600');
      await host.locator('#om-wpm').blur();
      const wpm = Number(await host.locator('#om-wpm').inputValue());
      if (wpm !== 300) throw new Error(`the reading speed should stop at 300 for a match read aloud, is ${wpm}`);
      await host.getByText(/toss-ups? from Round 1/).waitFor();
      await host.getByRole('button', { name: 'Open the match' }).click();
      await host.getByText('Waiting for the host to start the match').waitFor({ timeout: 15000 });
      roomId = (/#\/room\/([a-z2-7]{16})/.exec(host.url()) ?? [])[1] ?? '';
      if (!roomId) throw new Error(`the match did not open: ${host.url()}`);
      await host.getByRole('button', { name: 'Join Team A' }).click();
      // The host's device has no voice: the lobby says the text will show instead.
      await host.getByText('This device has no voice for reading aloud').waitFor({ timeout: 10000 });
    });

    await step('the player tries the voice in the lobby, joins, and sees that the host reads the text', async () => {
      await player.goto(`${BASE}#/room/${roomId}`);
      await player.getByRole('heading', { name: 'Read aloud' }).waitFor({ timeout: 15000 });
      await player.getByRole('button', { name: 'Play a sample' }).click();
      if (!(await said(player)).some((t) => t.startsWith('Toss-up 1. Biology.'))) throw new Error('the sample was not said');
      await player.getByRole('button', { name: 'Join Team B' }).click();
      await player.getByText('(sees the text: no voice on their device)').waitFor({ timeout: 10000 });
      await shot(player, 'speech-1-lobby');
    });

    await step('the toss-up is read aloud on the player’s device, with no text shown, while the host sees the text', async () => {
      await host.getByRole('button', { name: 'Start the match' }).click();
      await player.getByText('Listening to the question…').waitFor({ timeout: 15000 });
      await host.getByText(/What is the most common term/).waitFor({ timeout: 10000 });
      await shot(player, 'speech-2-listening');
      // While it is read, nothing of it shows on the player's screen.
      for (let i = 0; i < 6; i++) {
        if (await player.getByText(/observable|most common term/).count()) throw new Error('the question shows while it is read aloud');
        await player.waitForTimeout(500);
      }
      await player.getByText(/s left$/).waitFor({ timeout: 20000 });
      const spoken = (await said(player)).filter((t) => !t.startsWith('Toss-up 1. Biology.')).join(' ');
      if (!spoken.startsWith(TOSSUP)) throw new Error(`the voice said: ${spoken}`);
      await player.getByText('Seeing the text instead (no voice on their device): Hana.').waitFor();
    });

    await step('once the toss-up is over its text shows with the answer, and the bonus is read aloud too', async () => {
      await player.getByRole('button', { name: /Buzz/ }).click();
      await player.getByLabel(/^Your answer/).fill('phenotype');
      await player.keyboard.press('Enter');
      // The bonus begins at once; the toss-up's text and answer stay up meanwhile.
      await player.getByText(`Toss-up 1: ${TOSSUP}`).waitFor({ timeout: 10000 });
      await player.getByText('ANSWER: PHENOTYPE').waitFor();
      await shot(player, 'speech-3-tossup-over');
      await player.getByLabel(/answer for the team/).waitFor({ timeout: 20000 });
      if (await player.getByText(BONUS).count()) throw new Error('the bonus shows while it is read aloud');
      const spoken = (await said(player)).join(' ');
      if (!spoken.includes(BONUS)) throw new Error(`the voice did not say the bonus: ${spoken}`);
      await player.getByLabel(/answer for the team/).fill('bacteriophage');
      await player.keyboard.press('Enter');
      await player.getByText(BONUS).waitFor({ timeout: 10000 });
      await player.getByText(/Correct: 10 points/).waitFor();
      await shot(player, 'speech-4-bonus-over');
    });

    await step('the voice kept a pace a voice can (rates between 0.6 and 2.2)', async () => {
      const rates = await player.evaluate(() => window.__said.map((s) => s.rate));
      if (rates.some((r) => !(r >= 0.6 && r <= 2.2))) throw new Error(`rates: ${rates.join(', ')}`);
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
