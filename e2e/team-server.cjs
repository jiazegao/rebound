/*
 * End-to-end test of sharing and remote rooms against a running team server (local, or a deployed one
 * through SERVER_URL; the last step deletes the test team).
 *
 *   cd server && npx wrangler dev --port 8787 &        # the team server, locally
 *   npm run build && npx vite preview --port 4173 &    # the site
 *   node e2e/team-server.cjs
 *
 * A captain shares the team from one browser, a player joins from another with the link, data
 * syncs both ways, and the two play a toss-up in a remote room (server-timed buzz, team channel,
 * captain's answer). Uses the small fixture question set, like smoke.cjs.
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const SERVER = process.env.SERVER_URL || 'http://localhost:8787';
const SHOTS = process.env.SHOTS_DIR || '';
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: require('path').join(SHOTS, `${name}.png`), fullPage: true });
};

async function fixtures(page) {
  const f = (name) => path.join(__dirname, name);
  await page.route('**/data/doe/index.json', (r) => r.fulfill({ path: f('fixture-index.json'), contentType: 'application/json' }));
  await page.route('**/data/doe/doe-hs-99.json', (r) => r.fulfill({ path: f('fixture-set.json'), contentType: 'application/json' }));
  await page.route('**/data/doe/catalog.json', (r) => r.fulfill({ path: f('fixture-catalog.json'), contentType: 'application/json' }));
  await page.route('**/data/doe/concepts.json', (r) => r.fulfill({ path: f('fixture-concepts.json'), contentType: 'application/json' }));
}

async function main() {
  const browser = await chromium.launch();
  const errors = [];
  const make = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('dialog', (d) => d.accept());
    await fixtures(page);
    return page;
  };
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

  const captain = await make();
  const player = await make();
  let joinLink = '';
  let roomLink = '';

  await step('the captain sets up the team and shares it', async () => {
    await captain.goto(`${BASE}#/team`);
    await captain.getByLabel('Team name').fill('Server High');
    await captain.getByRole('button', { name: 'Create team' }).click();
    for (const [name, subject] of [
      ['Ann', 'biology'],
      ['Ben', 'chemistry'],
    ]) {
      await captain.locator('#new-player').fill(name);
      await captain.getByLabel('Primary subject', { exact: true }).selectOption(subject);
      await captain.getByRole('button', { name: 'Add player' }).click();
    }
    await captain.getByRole('combobox', { name: 'Role' }).first().selectOption('captain');
    await captain.goto(`${BASE}#/today`);
    await captain.getByRole('button', { name: 'Ann' }).click();
    await captain.goto(`${BASE}#/team`);
    await captain.locator('#share-pin').fill('1234');
    await captain.locator('#share-pin2').fill('1234');
    if (await captain.locator('#share-server').count()) await captain.locator('#share-server').fill(SERVER);
    await captain.getByRole('button', { name: 'Share this team' }).click();
    await captain.getByText('This device is signed in as').waitFor({ timeout: 15000 });
    joinLink = await captain.getByRole('textbox', { name: 'Join link' }).inputValue();
    if (!/#\/join\//.test(joinLink)) throw new Error(`no join link: ${joinLink}`);
  });

  await step('a player joins from another device and picks their name', async () => {
    await player.goto(joinLink.replace(/^.*#/, `${BASE}#`));
    await player.locator('#join-name').fill('Ben');
    await player.locator('#join-pin').fill('5678');
    if (await player.locator('#join-server').count()) await player.locator('#join-server').fill(SERVER);
    await player.getByRole('button', { name: 'Join', exact: true }).click();
    // The server links "Ben" to the roster player of the same name; otherwise the page asks.
    const chooser = player.getByText('Which player are you?');
    const plan = player.getByText("Ben's plan");
    await chooser.or(plan).first().waitFor({ timeout: 15000 });
    if (await chooser.count()) await player.getByRole('button', { name: 'Ben' }).click();
    await plan.waitFor({ timeout: 15000 });
    await player.getByText('Server High').first().waitFor();
  });

  await step("the player's practice reaches the captain's device", async () => {
    await player.goto(`${BASE}#/library/doe-hs-99/doe-hs-99-r01`);
    await player.getByRole('button', { name: 'Add to my review' }).first().click();
    await player.getByText("In Ben's review queue").waitFor();
    await player.goto(`${BASE}#/team`);
    await player.getByRole('button', { name: 'Sync now' }).click();
    await player.getByText('Up to date').waitFor({ timeout: 15000 });
    await captain.goto(`${BASE}#/team`);
    await captain.getByRole('button', { name: 'Sync now' }).click();
    await captain.getByText('Up to date').waitFor({ timeout: 15000 });
    await captain.goto(`${BASE}#/review`);
    await captain.locator('#player-switch').selectOption({ label: 'Ben' });
    const tile = await captain.locator('.card', { hasText: 'In your queue' }).first().innerText();
    if (!tile.includes('1')) throw new Error(`Ben's review card did not sync: ${tile}`);
    await captain.locator('#player-switch').selectOption({ label: 'Ann' });
  });

  await step("a visual question the captain adds reaches the player's device", async () => {
    await captain.goto(`${BASE}#/visual`);
    await captain.getByRole('button', { name: 'Add one' }).click();
    const png = await captain.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 60;
      c.height = 40;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#3987e5';
      ctx.fillRect(0, 0, 60, 40);
      return c.toDataURL('image/png').split(',')[1];
    });
    await captain.locator('#vq-picture').setInputFiles({ name: 'figure.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await captain.locator('form img').first().waitFor();
    await captain.locator('#vq-alt').fill('A blue rectangle');
    await captain.locator('#vq-credit').fill('Drawn by the team');
    await captain.locator('#vq-stem').fill('What color is the shape shown?');
    await captain.locator('#vq-answer').fill('blue');
    await captain.getByRole('button', { name: 'Save', exact: true }).click();
    await captain.getByText("Your team's visual questions (1)").waitFor();
    await captain.goto(`${BASE}#/team`);
    await captain.getByRole('button', { name: 'Sync now' }).click();
    await captain.getByText('Up to date').waitFor({ timeout: 15000 });
    await player.goto(`${BASE}#/team`);
    await player.getByRole('button', { name: 'Sync now' }).click();
    await player.getByText('Up to date').waitFor({ timeout: 15000 });
    await player.goto(`${BASE}#/visual`);
    await player.getByText("Your team's visual questions (1)").waitFor({ timeout: 10000 });
    await player.getByText('BLUE').first().waitFor();
  });

  await step('the captain opens a remote room for a Reader console game', async () => {
    await captain.goto(`${BASE}#/reader`);
    await captain.getByRole('radiogroup', { name: 'Ann plays for' }).getByRole('radio', { name: 'Team A' }).click();
    await captain.getByRole('radiogroup', { name: 'Ben plays for' }).getByRole('radio', { name: 'Team B' }).click();
    await captain.getByRole('button', { name: 'Start game' }).click();
    await captain.getByRole('button', { name: 'Open a remote room' }).click();
    roomLink = await captain.getByRole('textbox', { name: 'Room link' }).inputValue();
    await captain.getByText('Remote room · connected').waitFor({ timeout: 15000 });
  });

  await step('the player joins the room and buzzes; the console records the buzz', async () => {
    await player.goto(roomLink.replace(/^.*#/, `${BASE}#`));
    await player.getByText('connected').first().waitFor({ timeout: 15000 });
    await captain.getByText(/Ben \(Team B/).waitFor({ timeout: 15000 });
    await captain.keyboard.press('Space'); // start the game: toss-up 1 is being read
    await captain.waitForTimeout(400);
    await player.getByRole('button', { name: /Buzz/ }).waitFor();
    await player.waitForFunction(() => !document.querySelector('.room-buzz')?.hasAttribute('disabled'), null, { timeout: 10000 });
    await player.getByRole('button', { name: /Buzz/ }).click();
    await player.getByText('Ben buzzed').waitFor({ timeout: 10000 });
    await captain.getByText(/Ben/).first().waitFor();
    await captain.keyboard.press('c'); // correct: Team B gets the bonus
    await player.getByText(/Bonus for/).waitFor({ timeout: 10000 });
  });

  await step('team channel and captain answer during the bonus', async () => {
    await player.getByRole('textbox', { name: 'Message to your team' }).fill('I think it is a phage');
    await player.getByRole('button', { name: 'Send' }).click();
    await player.getByText('I think it is a phage').waitFor({ timeout: 10000 });
    await player.locator('#captain-answer').fill('bacteriophage');
    await player.getByRole('button', { name: 'Answer', exact: true }).click();
    await captain.getByText('Ben answers:').waitFor({ timeout: 10000 });
    // The reader never sees the team channel.
    if (await captain.getByText('I think it is a phage').count()) throw new Error('the team channel leaked to the reader');
  });

  await step("a Finals visual round in a remote room: the figure shows on the player's screen", async () => {
    await captain.goto(`${BASE}#/packets`);
    await captain.locator('#scrim-format').selectOption('finals-visual');
    await captain.locator('#scrim-visual').selectOption('1');
    await captain.getByRole('button', { name: 'Build packet' }).click();
    await captain.getByRole('button', { name: 'Save packet' }).click();
    await captain.getByRole('link', { name: 'Play in the Reader console' }).click();
    await captain.getByRole('radiogroup', { name: 'Ann plays for' }).getByRole('radio', { name: 'Team A' }).click();
    await captain.getByRole('radiogroup', { name: 'Ben plays for' }).getByRole('radio', { name: 'Team B' }).click();
    await captain.getByRole('button', { name: 'Start game' }).click();
    await captain.getByRole('button', { name: 'Open a remote room' }).click();
    const link = await captain.getByRole('textbox', { name: 'Room link' }).inputValue();
    await captain.getByText('Remote room · connected').waitFor({ timeout: 15000 });
    await player.goto(link.replace(/^.*#/, `${BASE}#`));
    await player.getByText('connected').first().waitFor({ timeout: 15000 });
    await captain.getByText(/Ben \(Team B/).waitFor({ timeout: 15000 });
    const key = async (k) => {
      await captain.keyboard.press(k);
      await captain.waitForTimeout(250);
    };
    await key('Space'); // start
    // Team A answers toss-ups (Ann is key 1) until a visual bonus comes up.
    for (let i = 0; i < 4; i++) {
      await key('Space');
      await key('1');
      await key('c');
      if (await captain.getByText('Visual bonus for').count()) break;
      await key('Space');
      await key('c');
      await key('Space');
    }
    await captain.getByText('Visual bonus for').waitFor();
    await player.locator('.qfig .qfig-art').first().waitFor({ timeout: 15000 });
  });

  await step('an online match with no reader: both buzz and type answers, the server judges, the game reaches the stats', async () => {
    await captain.goto(`${BASE}#/online`);
    await captain.getByRole('heading', { name: 'Start an online match' }).waitFor({ timeout: 15000 });
    await captain.locator('#om-wpm').fill('600');
    await captain.getByText(/toss-ups? from Round 1/).waitFor();
    await captain.getByRole('button', { name: 'Open the match' }).click();
    await captain.getByText('Waiting for the host to start the match').waitFor({ timeout: 15000 });
    await captain.getByRole('button', { name: 'Join Team A' }).click();
    // The player finds it under Play online.
    await player.goto(`${BASE}#/online`);
    await player.getByRole('link', { name: 'Join' }).first().click();
    await player.getByRole('button', { name: 'Join Team B' }).click();
    await player.getByText('Ben').first().waitFor();
    await shot(captain, 'online-1-lobby');
    await captain.getByRole('button', { name: 'Start the match' }).click();
    // Buzz once the reading has finished (the answer window counts down).
    await player.getByText(/s left$/).waitFor({ timeout: 15000 });
    await player.getByRole('button', { name: /Buzz/ }).click();
    await player.getByLabel(/^Your answer/).fill('phenotype');
    await shot(player, 'online-2-answering');
    await player.keyboard.press('Enter');
    await captain.getByText('Ben: “phenotype”. Correct.').waitFor({ timeout: 10000 });
    // Ben is Team B's captain, so he answers the bonus when it has been read.
    await player.getByLabel(/answer for the team/).fill('bacteriophage', { timeout: 15000 });
    await shot(player, 'online-3-bonus');
    await player.keyboard.press('Enter');
    await captain.getByText(/Correct: 10 points/).waitFor({ timeout: 10000 });
    await captain.getByRole('button', { name: 'End the match' }).click();
    await player.getByText('The match is over.').waitFor({ timeout: 10000 });
    // The server wrote the game record; it reaches the captain's device with the next sync.
    await captain.getByRole('link', { name: 'See the game summary' }).click({ timeout: 20000 });
    await captain.getByRole('heading', { name: 'Team A 0 – 14 Team B' }).waitFor({ timeout: 10000 });
  });

  await step('a free-for-all: a close call goes to the other player, who rejects it', async () => {
    await captain.goto(`${BASE}#/online`);
    await captain.getByText('Everyone for themselves').click();
    await captain.locator('#om-count').fill('1');
    await captain.locator('#om-wpm').fill('600');
    await captain.getByRole('button', { name: 'Open the match' }).click();
    await captain.getByRole('button', { name: 'Join the game' }).click();
    const roomUrl = captain.url();
    await player.goto(roomUrl);
    await player.getByRole('button', { name: 'Join the game' }).click();
    await captain.getByText('Players (2)').waitFor({ timeout: 10000 });
    await captain.getByRole('button', { name: 'Start the match' }).click();
    await captain.getByText(/s left$/).waitFor({ timeout: 15000 });
    await captain.getByRole('button', { name: /Buzz/ }).click();
    await captain.getByLabel(/^Your answer/).fill('phenotipe');
    await captain.keyboard.press('Enter');
    await player.getByText('Close call.').waitFor({ timeout: 10000 });
    await shot(player, 'online-4-close-call');
    await player.getByRole('button', { name: 'Reject' }).click();
    await captain.getByText(/Nobody else may answer this one/).waitFor({ timeout: 10000 });
    await player.getByText('The game is over.').waitFor({ timeout: 15000 });
    await shot(player, 'online-5-ffa-final');
  });

  // Last, so a run against a deployed server leaves nothing behind.
  await step('the captain deletes the team from the server; each device keeps its data', async () => {
    await captain.goto(`${BASE}#/team`);
    await captain.getByRole('button', { name: 'Delete the team from the server' }).click(); // the confirm is accepted
    await captain.getByRole('heading', { name: 'Share with your team' }).waitFor({ timeout: 15000 });
    await captain.getByText('Ann').first().waitFor();
    await player.goto(`${BASE}#/team`);
    await player.getByRole('button', { name: 'Sync now' }).click();
    await player.getByText('This team is no longer on the team server').waitFor({ timeout: 15000 });
    await player.getByText('Signed out').first().waitFor();
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
