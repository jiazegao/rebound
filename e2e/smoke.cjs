/*
 * Browser smoke test for Rebound with accounts (docs/ACCOUNTS.md), each person in their own browser:
 *
 * - signed out, the home page and the public pages (Library, Rules, Try a round) work and save nothing;
 * - a new account signs up on the sign-in page with an emailed link, signs out, signs in again and deletes itself;
 * - a team of four accounts (made through the API) plays a full Reader-console game; then the game summary, team
 *   stats, a solo round, each player's own review queue (the server turns the finished game into their answers),
 *   a reload and a second device, the next competition, lineups, packets, the Finals visual round, the Visual lab,
 *   tiebreakers, concept cards (a teammate reviews), reading paths, Write (the subject owner approves),
 *   assignments, Today's plan, timed review, Library topics, My progress, solo reading and the answer timer, the
 *   Account page, the phone layout, teammates' stats, and what the service worker keeps for offline use.
 *
 * The pages use a small fixture question set (e2e/fixture-*.json); the offline check uses the real library.
 * It needs the server, with its development email outbox (server/.dev.vars), and the site built without
 * VITE_SERVER_URL (the sign-in page then asks for the server's address):
 *
 *   cd server && cp .dev.vars.example .dev.vars && npx wrangler dev --port 8787 &
 *   npm run build && npx vite preview --port 4173 --strictPort &
 *   node e2e/smoke.cjs                      # uses e2e/fixture-*.json
 *   REAL_DATA=1 node e2e/smoke.cjs          # only checks pages against the real library
 *   SHOTS_DIR=/some/dir node e2e/smoke.cjs  # also saves screenshots
 *
 * SERVER_URL and BASE_URL point it elsewhere (defaults http://localhost:8787 and http://localhost:4173/). The
 * site's origin must be one of the server's ALLOWED_ORIGINS (wrangler.toml lists http://localhost:4173; for another
 * port add, for example, --var ALLOWED_ORIGINS:http://localhost:4191 to wrangler dev). The accounts a run makes
 * are deleted at the end. Needs Playwright with Chromium installed (require('playwright')).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const A = require('./accounts.cjs');

const { SERVER, BASE } = A;
const USE_FIXTURES = process.env.REAL_DATA !== '1';
const SHOTS = process.env.SHOTS_DIR || '';
const VIEWPORT = { width: 1280, height: 900 };
/** What teammates may read of a player's own collections (TEAM_VISIBLE in src/core/accounts.ts). */
const TEAM_VISIBLE = new Set(['attempts', 'answers', 'seen', 'conceptReads', 'completions', 'reports']);
/** Google's sign-in script, replaced by a stand-in: the tests never talk to Google. */
const GOOGLE_STUB = 'window.google = { accounts: { id: { initialize() {}, renderButton(el) { el.textContent = "Sign in with Google (test stand-in)"; } } } };';

/** The fixture questions stand in for the library's files (routes cannot see requests a service worker answers). */
async function useFixtures(context) {
  const fixture = (file, name) => context.route(`**/data/doe/${file}`, (r) => r.fulfill({ path: path.join(__dirname, name), contentType: 'application/json' }));
  await fixture('index.json', 'fixture-index.json');
  await fixture('doe-hs-99.json', 'fixture-set.json');
  await fixture('catalog.json', 'fixture-catalog.json');
  await fixture('concepts.json', 'fixture-concepts.json');
}

async function main() {
  const browser = await chromium.launch();
  const errors = [];
  /** Accounts this run makes, deleted at the end. */
  const made = [];

  /**
   * A browser of its own: signed in as `account`, signed out but knowing the server's address (null), or brand new
   * (undefined). Its pages get the fixture questions; their errors are collected and their dialogs accepted.
   * `offline: true` collects only uncaught exceptions: there, requests that cannot reach the server are expected,
   * and the browser logs each one as a console error.
   */
  const open = async (account, label, { offline = false } = {}) => {
    const context = account === undefined ? await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'block' }) : await A.signedInContext(browser, account);
    await context.route('https://accounts.google.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: GOOGLE_STUB }));
    if (USE_FIXTURES) await useFixtures(context);
    const p = await context.newPage();
    if (offline) p.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    else A.watchErrors(p, label, errors);
    p.on('dialog', (d) => d.accept());
    return p;
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

  // Ann's browser is the main page for most steps; the helpers use it unless given another page.
  let ann = null;
  // Visible matches only: a closed menu in the bar holds hidden links whose text a page may repeat.
  const see = (text, p = ann, timeout = 5000) => p.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ timeout });
  const shot = async (name, p = ann) => {
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };
  /** Opens one of the Practice menu's pages from the bar, as a player would. */
  const practicePage = async (p, label) => {
    const bar = p.getByRole('navigation', { name: 'Main' });
    await bar.getByRole('button', { name: 'Practice' }).click();
    await bar.getByRole('link', { name: label, exact: true }).click();
  };
  const key = async (k, p = ann) => {
    await p.keyboard.press(k);
    await p.waitForTimeout(120);
  };
  const scores = async () => [await ann.locator('.score-a .points').innerText(), await ann.locator('.score-b .points').innerText()];
  /** Runs `check` until it stops throwing (pages fill in as the server answers), for at most `ms`. */
  const eventually = async (check, ms = 8000) => {
    const end = Date.now() + ms;
    for (;;) {
      try {
        return await check();
      } catch (err) {
        if (Date.now() > end) throw err;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  /** The answer was judged right ("Correct", not "Not correct", which `see` would also match). */
  const judgedRight = (p = ann) => p.locator('.verdict-correct').first().waitFor({ timeout: 5000 });
  /** Today's plan is on `p` (its heading; "Preparing your plan…" comes first while the library loads). */
  const planShown = (p = ann, timeout = 10_000) => p.getByRole('heading', { name: /^Your plan · about \d+ minutes$/ }).waitFor({ timeout });
  const tokenIn = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').token || null, A.SESSION_KEY);
  /** The cells of `name`'s row in the first table on Team stats. */
  const statsRow = (p, name) => p.getByRole('row', { name: new RegExp(name) }).first().locator('td').allInnerTexts();
  /** `p`'s Review page shows `count` questions in the player's queue (a device makes them from new answers as it loads). */
  const expectQueue = async (p, count, who) => {
    await p.goto(`${BASE}#/review`);
    const tile = p.locator('.card', { hasText: 'In your queue' }).first();
    await tile.waitFor({ timeout: 10_000 });
    await eventually(async () => {
      const n = Number((await tile.locator('div').nth(1).innerText()).trim());
      if (n !== count) throw new Error(`${who} should have ${count} review questions in the queue, has ${n}`);
    }, 4000);
  };
  /** Answers a drill that has just started: for each [toss-up, bonus], buzz, type the answer, and go on. */
  const answerDrill = async (pairs, p = ann) => {
    for (const [tossup, bonus] of pairs) {
      await p.getByRole('button', { name: /Buzz/ }).waitFor();
      await p.waitForTimeout(600);
      await key('Space', p);
      await p.locator('#answer').fill(tossup);
      await key('Enter', p);
      await judgedRight(p);
      await key('Space', p);
      await p.locator('#answer').fill(bonus);
      await key('Enter', p);
      await judgedRight(p);
      await key('Space', p);
    }
  };

  // A signed-out visitor (the site knows the server's address, as after signing out): every request their pages
  // make to the server is noted, since public pages should make none.
  const guest = await open(null, 'signed out');
  const guestCalls = [];
  guest.on('request', (r) => {
    if (r.url().startsWith(SERVER)) guestCalls.push(`${r.method()} ${r.url().slice(SERVER.length)}`);
  });
  const NOTHING_SAVED = 'signed out, nothing was saved: no calls to the server, nothing kept on the device';
  const nothingSaved = async () => {
    if (guestCalls.length) throw new Error(`signed-out pages called the server: ${guestCalls.slice(0, 3).join(', ')}`);
    const kept = await guest.evaluate(async () => ({
      keys: Object.keys(localStorage),
      databases: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [],
    }));
    if (kept.keys.some((k) => k !== A.SESSION_KEY)) throw new Error(`localStorage holds ${kept.keys.join(', ')}`);
    if (await tokenIn(guest)) throw new Error('a signed-out device holds a session');
    if (kept.databases.length) throw new Error(`IndexedDB databases on the device: ${kept.databases.join(', ')}`);
  };

  await step('signed out: the home page and the public pages work without an account', async () => {
    await guest.goto(BASE);
    await see('Practice like the real thing', guest);
    await guest.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sign in' }).waitFor();
    await shot('01-home', guest);
    if (USE_FIXTURES) {
      await guest.goto(`${BASE}#/library/doe-hs-99/doe-hs-99-r01`);
      await guest.locator('.question-kind').first().waitFor();
      if (await guest.getByRole('button', { name: 'Add to my review' }).count()) throw new Error('a signed-out visitor has no review queue to add to');
    }
    await guest.goto(`${BASE}#/rules`);
    await see('NSB rules at a glance', guest);
    await guest.goto(`${BASE}#/try`);
    await see('Just trying it: nothing is saved.', guest);
    await guest.goto(`${BASE}#/today`);
    await see('Sign in for a daily plan built from your own practice.', guest);
  });

  if (!USE_FIXTURES) {
    await step('library lists the real sets', async () => {
      await guest.goto(`${BASE}#/library`);
      await see('Set 17', guest);
      await guest.getByRole('link', { name: /Set 17/ }).first().click();
      await see('Round 1', guest);
      await shot('real-library-set', guest);
      await guest.getByRole('link', { name: 'Round 1', exact: true }).first().click();
      await see('TOSS-UP', guest);
      await shot('real-library-round', guest);
    });

    await step(NOTHING_SAVED, nothingSaved);

    await step('signed in with no team: Today builds a plan from the real library', async () => {
      const rae = await A.signUp('Rae', { primarySubject: 'biology', secondarySubject: 'chemistry' });
      made.push(rae);
      const p = await open(rae, 'Rae');
      await p.goto(`${BASE}#/today`);
      await planShown(p, 15_000);
      const items = await p.locator('.plan-item').count();
      if (items < 2) throw new Error(`expected at least 2 plan items, got ${items}`);
      if ((await p.locator('.why-label').count()) !== items) throw new Error('every plan item needs a "Why this?" line');
      await see('Biology drill', p);
      await shot('real-today', p);
      await p.goto(`${BASE}#/team`);
      await see('Start a team', p);
      await p.context().close();
    });
  } else {
    // Everyone signs up with their own address; this one through the site's own pages.
    let newbie = null;
    const newEmail = `nia+${Date.now().toString(36)}@test.example`;

    await step('sign up: a new account through the sign-in page and an emailed link (the development outbox)', async () => {
      newbie = await open(undefined, 'new account');
      await A.fromTestAddress(newbie.context());
      await newbie.goto(`${BASE}#/signin`);
      // A build without VITE_SERVER_URL asks for the server's address first.
      await newbie.locator('#server-url').fill(SERVER);
      await newbie.getByRole('button', { name: 'Use this server' }).click();
      // Google's button shows when the server has Google sign-in on (its script is a stand-in here).
      if ((await A.call('/api/auth/config')).google) await see('Sign in with Google (test stand-in)', newbie);
      await newbie.locator('#signin-email').fill(newEmail);
      await newbie.getByRole('button', { name: 'Email me a sign-in link' }).click();
      await see('Check your email', newbie);
      await newbie.getByRole('link', { name: 'Sign in (development)' }).click();
      // No account has this address yet: a name and the 13+ confirmation, then the account is made.
      await see('Create your account', newbie);
      const create = newbie.getByRole('button', { name: 'Create my account' });
      await newbie.locator('#signup-name').fill('Nia');
      if (await create.isEnabled()) throw new Error('an account cannot be made without the 13+ confirmation');
      await newbie.getByLabel('I am 13 or older.').check();
      await create.click();
      await newbie.getByRole('heading', { name: 'Today', exact: true }).waitFor({ timeout: 10_000 });
      await planShown(newbie);
      await newbie.locator('summary[aria-label="Account: Nia"]').waitFor();
      const token = await tokenIn(newbie);
      const { user, team } = await A.call('/api/me', { token });
      made.push({ token, user, email: newEmail, name: 'Nia' });
      if (user.name !== 'Nia' || user.email !== newEmail || !(user.over13At > 0)) throw new Error(`unexpected account: ${JSON.stringify(user)}`);
      if (team) throw new Error('a new account is on no team');
      // With no team, team pages say what they need.
      await newbie.goto(`${BASE}#/team`);
      await see('Start a team', newbie);
      await see('Join your team', newbie);
      await newbie.goto(`${BASE}#/reader`);
      await see("Games in the Reader console are saved to a team's stats.", newbie);
      await shot('02-signed-up', newbie);
    });

    await step('sign out, and sign in again with a new link (the account is found, no sign-up)', async () => {
      const token = await tokenIn(newbie);
      await newbie.locator('summary[aria-label="Account: Nia"]').click();
      await newbie.getByRole('button', { name: 'Sign out' }).click();
      await see('Practice like the real thing', newbie);
      await newbie.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sign in' }).waitFor();
      if (await tokenIn(newbie)) throw new Error('the session is still on the device');
      const refused = await A.call('/api/me', { token }).then(
        () => false,
        (e) => /: 401 /.test(e.message),
      );
      if (!refused) throw new Error('the server still takes the signed-out session');
      await newbie.goto(`${BASE}#/signin`);
      await newbie.locator('#signin-email').fill(newEmail);
      await newbie.getByRole('button', { name: 'Email me a sign-in link' }).click();
      await newbie.getByRole('link', { name: 'Sign in (development)' }).click();
      await newbie.getByRole('heading', { name: 'Today', exact: true }).waitFor({ timeout: 10_000 });
      await newbie.locator('summary[aria-label="Account: Nia"]').waitFor();
      if (await newbie.getByText('Create your account').count()) throw new Error('an existing account was asked to sign up again');
      made[made.length - 1].token = await tokenIn(newbie);
    });

    await step('Account: delete my account', async () => {
      const token = await tokenIn(newbie);
      await newbie.goto(`${BASE}#/account`);
      await newbie.getByRole('button', { name: 'Delete my account' }).click();
      await see('Your account and everything in it were deleted.', newbie);
      await newbie.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sign in' }).waitFor();
      const gone = await A.call('/api/me', { token }).then(
        () => false,
        (e) => /: 401 /.test(e.message),
      );
      if (!gone) throw new Error('the deleted account still signs in');
      await newbie.context().close();
    });

    let team = null;
    let gameId = null;
    const accounts = {};
    const pages = {};
    /** A teammate's own browser, opened the first time it is needed. */
    const pageOf = async (name) => (pages[name] ??= await open(accounts[name], name));

    await step('a team of four accounts (made through the API); Ann, the captain, in her own browser', async () => {
      const t = await A.makeTeamOf('Test High', [
        { name: 'Ann', primarySubject: 'biology' },
        { name: 'Abe', primarySubject: 'chemistry' },
        { name: 'Bea', primarySubject: 'math' },
        { name: 'Ben', primarySubject: 'physics' },
      ]);
      made.push(...t.accounts);
      team = t.team;
      for (const a of t.accounts) accounts[a.name] = a;
      ann = await open(accounts.Ann, 'Ann');
      await ann.goto(`${BASE}#/team`);
      await see('Members (4)', ann, 10_000);
      await see('You are a captain.');
      await see('Who covers what');
      for (const [subject, owner] of [
        ['Biology', 'Ann'],
        ['Chemistry', 'Abe'],
        ['Math', 'Bea'],
        ['Physics', 'Ben'],
      ]) {
        const row = await ann.getByRole('row', { name: new RegExp(`^${subject}`) }).first().innerText();
        if (!row.includes(owner)) throw new Error(`${owner} should cover ${subject}: ${row}`);
      }
      await shot('02-team');
    });

    await step('the bar: Today, Practice (a menu: Solo practice, Play online, Reader console), Learn, Library, Team', async () => {
      const bar = ann.getByRole('navigation', { name: 'Main' });
      const items = (await bar.locator(':scope > a, :scope > .nav-menu > button').allInnerTexts()).map((t) => t.replace('▾', '').trim());
      if (items.join() !== 'Today,Practice,Learn,Library,Team') throw new Error(`the bar shows ${items.join(', ')}`);
      const practice = bar.getByRole('button', { name: 'Practice' });
      const online = bar.getByRole('link', { name: 'Play online', exact: true });
      // A mouse opens the menu by hovering, and leaving closes it.
      await practice.hover();
      await online.waitFor();
      for (const name of ['Solo practice', 'Reader console']) await bar.getByRole('link', { name, exact: true }).waitFor();
      await shot('02b-practice-menu');
      await ann.mouse.move(600, 700);
      await online.waitFor({ state: 'hidden' });
      // A click (or a tap) opens it too, and Esc closes it.
      await practice.click();
      if ((await practice.getAttribute('aria-expanded')) !== 'true') throw new Error('a click does not open the Practice menu');
      await ann.keyboard.press('Escape');
      await online.waitFor({ state: 'hidden' });
      await practice.click();
      await online.click();
      await ann.getByRole('heading', { name: 'Play online', level: 1 }).waitFor();
      if (!(await practice.getAttribute('class')).includes('current')) throw new Error('Practice is not marked while Play online is shown');
      if (await online.isVisible()) throw new Error('the menu stays open after a choice');
    });

    await step('set up a Reader-console game', async () => {
      await practicePage(ann, 'Reader console');
      await see('1. Questions');
      await ann.locator('#round').waitFor();
      for (const [name, side] of [
        ['Ann', 'Team A'],
        ['Abe', 'Team A'],
        ['Bea', 'Team B'],
        ['Ben', 'Team B'],
      ]) {
        await ann.getByRole('radiogroup', { name: `${name} plays for` }).getByRole('radio', { name: side }).click();
      }
      await shot('03-reader-setup');
      await ann.getByRole('button', { name: 'Start game' }).click();
      await see('Check the lineups');
    });

    await step('play a full game with the keyboard', async () => {
      await key('Space'); // start
      await see('Done reading');
      // Each player's buzz key, as the console shows it (a team's players in roster order, which is by name).
      const keys = {};
      for (const name of ['Ann', 'Abe', 'Bea', 'Ben']) keys[name] = (await ann.locator('.player-btn', { hasText: name }).first().locator('.kbd').innerText()).trim();
      await key('Space'); // toss-up 1 read
      await key(keys.Ann); // Ann buzzes
      await key('c'); // correct
      await key('u'); // undo...
      await key('c'); // ...and judge again
      await key('Space'); // bonus read
      await shot('04-reader-bonus');
      await key('c'); // bonus correct
      let s = await scores();
      if (s.join() !== '14,0') throw new Error(`after toss-up 1 expected 14-0, got ${s}`);
      await key('Space'); // next
      await key(keys.Bea); // Bea interrupts toss-up 2
      await key('x'); // wrong → +4 to A and a re-read
      s = await scores();
      if (s.join() !== '18,0') throw new Error(`after the interrupt expected 18-0, got ${s}`);
      await see('Re-read the whole toss-up');
      await key('Space'); // re-read done
      await key('n'); // nobody buzzes
      await key('Space'); // next
      await key('Space'); // toss-up 3 read
      await key(keys.Abe); // Abe
      await key('x'); // wrong, rebound to B
      await see('Rebound: the other team has 5 seconds.');
      await key(keys.Ben); // Ben
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
      await ann.getByRole('link', { name: 'See game summary' }).click();
      await see('Team A 18 – 4 Team B');
      await see('Question by question');
      gameId = decodeURIComponent(ann.url().split('#/games/')[1] || '');
      // Ann missed nothing, so the game put nothing in her own review queue (each player sees only their own).
      if (await ann.getByText('This game added').count()) throw new Error('the game should add nothing to Ann’s review queue');
      await shot('06-summary');
    });

    await step('team stats', async () => {
      await ann.goto(`${BASE}#/stats`);
      await see('Toss-up accuracy by subject');
      const cells = await statsRow(ann, 'Ann');
      if (cells[2] !== '1 / 1') throw new Error(`Ann's row should show 1 / 1 toss-ups: ${cells.join(' | ')}`);
      await shot('07-stats');
    });

    await step('solo round with typed answers (saved to Ann’s account)', async () => {
      await ann.goto(`${BASE}#/try`);
      await ann.getByRole('heading', { name: 'Solo practice', level: 1 }).waitFor();
      await ann.locator('#set').selectOption('doe-hs-99');
      await ann.locator('#round').selectOption('doe-hs-99-r01');
      await ann.locator('#wpm').fill('320');
      await ann.getByRole('button', { name: 'Start' }).click();
      const answers = [
        ['phenotype', 'phage'],
        ['W', '144 grams'],
        ['-1.25', '9 pi'],
        ['amplitud', 'diffraction'],
      ];
      for (const [tossup, bonus] of answers) {
        await ann.getByRole('button', { name: /Buzz/ }).waitFor();
        await ann.waitForTimeout(600);
        await key('Space'); // buzz
        await ann.locator('#answer').fill(tossup);
        await key('Enter');
        if (tossup === 'amplitud') {
          await see('Your call');
          await shot('08-solo-review');
          await key('y');
        }
        await judgedRight();
        await key('Space'); // to the bonus
        await ann.locator('#answer').fill(bonus);
        await key('Enter');
        await judgedRight();
        await key('Space');
      }
      await see('56 points');
      await shot('09-solo-done');
    });

    await step('stats include solo practice', async () => {
      await ann.goto(`${BASE}#/stats`);
      await see('Toss-up accuracy by subject');
      const cells = await statsRow(ann, 'Ann');
      if (cells[cells.length - 1] !== '8 / 8') throw new Error(`expected solo 8 / 8 in: ${cells.join(' | ')}`);
    });

    await step("game misses, dead toss-ups and missed bonuses reach each player's own review queue (in their own browsers)", async () => {
      await A.allSaved(ann);
      const games = await A.allRecords(`/api/teams/${team.id}/records`, accounts.Ann);
      if (!games.some((r) => r.c === 'games' && r.id === gameId && r.body && r.body.status === 'finished')) throw new Error('the finished game is not in the team’s records');
      // Abe: missed toss-up 3, and owns chemistry, whose toss-up 2 nobody got. Bea: wrong interrupt, and owns math,
      // whose bonus her team missed. Ben: owns physics, whose toss-up 4 nobody got.
      for (const [name, count] of [
        ['Abe', 2],
        ['Bea', 2],
        ['Ben', 1],
      ]) {
        const answers = (await A.allRecords('/api/me/records', accounts[name])).filter((r) => r.c === 'answers' && r.body && r.id.startsWith(`game:${gameId}:`));
        if (answers.length === 0) throw new Error(`the server wrote none of the game's answers into ${name}'s account`);
        await expectQueue(await pageOf(name), count, name);
      }
      await pages.Abe.goto(`${BASE}#/games/${gameId}`);
      await see('This game added 2 questions to your review queue', pages.Abe);
      await shot('06b-summary-abe', pages.Abe);
    });

    await step('everything is kept on the server: after a reload, and on a second device, nothing is lost', async () => {
      await A.allSaved(ann);
      await ann.reload();
      await ann.goto(`${BASE}#/games/${gameId}`);
      await see('Team A 18 – 4 Team B', ann, 10_000);
      await ann.goto(`${BASE}#/stats`);
      await see('Toss-up accuracy by subject');
      const cells = await statsRow(ann, 'Ann');
      if (cells[2] !== '1 / 1' || cells[cells.length - 1] !== '8 / 8') throw new Error(`after a reload Ann's row should show 1 / 1 and solo 8 / 8: ${cells.join(' | ')}`);
      // The review questions Abe's device made from the game went to his account, with how far it had got.
      await A.allSaved(pages.Abe);
      const cards = (await A.allRecords('/api/me/records', accounts.Abe)).filter((r) => r.c === 'cards' && r.body);
      if (cards.length !== 2) throw new Error(`Abe's account should hold 2 review questions, holds ${cards.length}`);
      const { user } = await A.call('/api/me', { token: accounts.Abe.token });
      if (!(user.settings && user.settings.cardsCursor > 0)) throw new Error(`Abe's settings should record how far his answers became review questions: ${JSON.stringify(user.settings)}`);
      // On a second device, the same queue (made once, not twice).
      const second = await open(accounts.Abe, 'Abe (second device)');
      await expectQueue(second, 2, 'Abe, on a second device,');
      await second.context().close();
    });

    await step('next competition date', async () => {
      await ann.goto(`${BASE}#/team`);
      const d = new Date(Date.now() + 10 * 86400000);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await ann.locator('#event-name').fill('Regional');
      await ann.locator('#event-date').fill(iso);
      await ann.getByRole('button', { name: 'Save', exact: true }).click();
      await see('Regional is in 10 days');
      // A team setting: it reaches the server, and teammates.
      await A.allSaved(ann);
      const { team: info } = await A.call(`/api/teams/${team.id}`, { token: accounts.Bea.token });
      if (!info.nextEvent || info.nextEvent.date !== iso || info.nextEvent.name !== 'Regional') throw new Error(`the team's next competition on the server: ${JSON.stringify(info.nextEvent)}`);
    });

    await step('the captain sets a regional lineup from the Team pages', async () => {
      await ann.goto(`${BASE}#/team`);
      await ann.getByRole('link', { name: 'Lineups', exact: true }).first().click();
      await see('Suggested lineups');
      await ann.locator('.plan-item').first().getByRole('button', { name: 'Use' }).click();
      await ann.locator('.hero-figure').waitFor();
      const points = Number(await ann.locator('.hero-figure').innerText());
      if (!(points > 0 && points < 200)) throw new Error(`unexpected estimate: ${points}`);
      await ann.locator('#lineup-name').fill('Regional A');
      await ann.getByRole('button', { name: 'Save lineup' }).click();
      await ann.getByRole('button', { name: 'Use for Regional' }).click();
      await ann.getByText('For Regional', { exact: true }).waitFor();
      await shot('12a-lineups');
      await ann.goto(`${BASE}#/team`);
      await see('Lineup:');
      await see("The team's best in every topic");
    });

    await step('team packets: upload a packet, build a scrimmage, play it in the Reader console', async () => {
      await ann.goto(`${BASE}#/packets`);
      await ann.locator('#up-title').fill('Fixture upload');
      await ann.locator('#up-files').setInputFiles(path.join(__dirname, 'fixture-set.json'));
      await see('Check before saving');
      await ann.getByRole('button', { name: /Save packet \(4 toss-ups\)/ }).click();
      await ann.getByRole('link', { name: 'Play in the Reader console' }).waitFor();
      const shown = await ann.locator('.question-kind').count();
      if (shown !== 8) throw new Error(`expected 8 questions in the uploaded packet, got ${shown}`);
      await ann.goto(`${BASE}#/packets`);
      await ann.getByRole('button', { name: 'Build packet' }).click();
      await ann.getByRole('button', { name: 'Save packet' }).click();
      await ann.getByRole('link', { name: 'Play in the Reader console' }).click();
      await see('A team packet');
      if (!(await ann.locator('input[name=source]').nth(1).isChecked())) throw new Error('the Reader console should start from the packet');
      await see('4 toss-ups.');
    });

    await step('Finals visual round: a scrimmage with visual bonuses runs in the Reader console (Phase 3 done criterion)', async () => {
      await ann.goto(`${BASE}#/packets`);
      await ann.locator('#scrim-format').selectOption('finals-visual');
      await ann.locator('#scrim-visual').selectOption('1'); // every bonus that has a visual in its subject
      await ann.getByRole('button', { name: 'Build packet' }).click();
      await see('visual bonuses');
      await ann.getByRole('button', { name: 'Save packet' }).click();
      await ann.getByRole('link', { name: 'Play in the Reader console' }).click();
      await see('A team packet');
      const preset = await ann.locator('#preset').inputValue();
      if (preset !== 'doe-finals-visual-2027') throw new Error(`expected the Finals visual rules, got ${preset}`);
      await ann.getByRole('button', { name: 'Auto-split' }).click();
      await ann.getByRole('button', { name: 'Start game' }).click();
      await see('visual bonus rounds');
      await key('Space'); // start: two 12-minute halves
      const clock = await ann.locator('.clock .time').innerText();
      if (!/^1[12]:\d\d$/.test(clock)) throw new Error(`expected a 12-minute half, the clock shows ${clock}`);
      // Answer toss-ups until a visual bonus comes up.
      for (let i = 0; i < 4; i++) {
        await key('Space'); // toss-up read
        await key('1');
        await key('c');
        if (await ann.getByText('Visual bonus for').count()) break;
        await key('Space'); // a printed bonus: read
        await key('c');
        await key('Space'); // next
      }
      await see('Visual bonus for');
      await ann.locator('.qfig .qfig-art').first().waitFor();
      await shot('17-reader-visual-bonus');
      await key('Space'); // done reading: 30 seconds
      const left = Number((await ann.locator('.countdown').first().locator('xpath=..').innerText()).match(/([\d.]+) s/)?.[1]);
      if (!(left > 25 && left <= 30)) throw new Error(`expected about 30 seconds for a visual bonus, got ${left}`);
      await key('c');
    });

    await step('Visual lab: a generated visual bonus with the 30-second window', async () => {
      await ann.goto(`${BASE}#/visual?template=math-sector`);
      await see('Visual bonus 1 of 5');
      await ann.locator('.qfig svg').first().waitFor();
      await ann.getByRole('button', { name: 'Done reading' }).click();
      await see('30');
      await ann.getByRole('textbox', { name: 'Your answer' }).fill('1');
      await ann.keyboard.press('Enter');
      await see('ANSWER:');
      await ann.getByRole('button', { name: /Next/ }).click();
      await see('Visual bonus 2 of 5');
      await ann.getByRole('button', { name: 'Stop' }).click();
      await see("Your team's visual questions");
    });

    await step('Visual lab: add a team visual question with a picture', async () => {
      await ann.goto(`${BASE}#/visual`);
      await ann.getByRole('button', { name: 'Add one' }).click();
      // A small PNG made in the page (a blue square), standing in for a photo.
      const png = await ann.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 40;
        c.height = 30;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#2a78d6';
        ctx.fillRect(0, 0, 40, 30);
        return c.toDataURL('image/png').split(',')[1];
      });
      await ann.locator('#vq-picture').setInputFiles({ name: 'square.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await ann.locator('form img').first().waitFor();
      await ann.locator('#vq-alt').fill('A blue rectangle');
      await ann.locator('#vq-credit').fill('Drawn by the team');
      await ann.locator('#vq-subject').selectOption('math');
      await ann.locator('#vq-stem').fill('What color is the shape shown?');
      await ann.locator('#vq-answer').fill('blue');
      await ann.getByRole('button', { name: 'Save', exact: true }).click();
      await see("Your team's visual questions (1)");
      await see('BLUE');
    });

    await step('tiebreaker drill: a 5 toss-up tiebreaker game with no bonuses', async () => {
      await ann.goto(`${BASE}#/reader?format=tiebreak`);
      await ann.getByRole('button', { name: 'Auto-split' }).click();
      await ann.getByRole('button', { name: 'Start game' }).click();
      await see('tiebreaker drill');
      await key('Space'); // start
      await see('Tiebreaker');
      await key('Space'); // toss-up 1 read
      await key('1');
      await key('c');
      await see('Question over');
      if (await ann.getByText('Bonus for').count()) throw new Error('a tiebreaker has no bonuses');
    });

    await step('shootout drill and the Finals rules page', async () => {
      await ann.goto(`${BASE}#/tiebreakers`);
      await ann.getByRole('button', { name: 'Shootout drill on your own' }).click();
      await see('Toss-up 1 of');
      await ann.getByRole('button', { name: 'Done reading' }).click();
      await ann.getByRole('button', { name: 'Let it go (0)' }).click();
      await see('No buzz: 0');
      await ann.goto(`${BASE}#/rules`);
      await ann.getByRole('tab', { name: 'DOE National Finals 2027, visual bonus rounds' }).click();
      await see('30 seconds for the captain to begin answering');
      await see('2 halves of 12 minutes');
    });

    await step('concept cards: Ann writes one, Bea reviews it in her own browser, and Ann drills its questions', async () => {
      await ann.goto(`${BASE}#/learn`);
      await ann.getByRole('link', { name: 'Circles, arcs and chords' }).click();
      await see('How NSB asks it');
      const url = ann.url();
      await ann.getByRole('button', { name: 'Write the card' }).click();
      await ann.locator('#card-summary').fill('A circle is the set of points at distance r from a center. Area is pi r squared; circumference is 2 pi r.');
      await ann.locator('#card-facts').fill('A = πr²\nC = 2πr');
      await ann.locator('#card-sources').fill('OpenStax Precalculus 2e | https://openstax.org/details/books/precalculus-2e');
      await ann.getByRole('button', { name: 'Save card' }).click();
      await see('waiting for a second player to review');
      if (await ann.getByRole('button', { name: /mark reviewed/ }).count()) throw new Error('the author cannot review her own card');
      await A.allSaved(ann);
      const bea = await pageOf('Bea');
      await A.allSaved(bea);
      await bea.goto(url);
      await bea.reload();
      await bea.getByRole('button', { name: /mark reviewed/ }).click({ timeout: 10_000 });
      await see('reviewed by Bea', bea);
      await A.allSaved(bea);
      await ann.reload();
      await see('reviewed by Bea', ann, 10_000);
      await shot('12b-concept-card');
      await ann.getByRole('link', { name: 'Drill these' }).click();
      await see('Bonus 1 of 1');
    });

    await step('reading paths: a subject path in order, with readings, and a step marked read', async () => {
      await ann.goto(`${BASE}#/learn`);
      await ann.getByRole('link', { name: 'Reading paths' }).first().click();
      await see('the topics in the order to learn them');
      await ann.goto(`${BASE}#/learn/paths/biology`);
      await see('Biology reading path');
      await see('Up next');
      const first = ann.locator('ol > li').first();
      if ((await first.locator('a[href^="https://"]').count()) === 0) throw new Error('the first step has no reading links');
      await first.getByRole('button', { name: 'I read it' }).click();
      await first.getByText(/^Read /).waitFor({ timeout: 5000 });
      await see('1 of');
      await shot('12d-reading-path');
    });

    await step('Write: Ann writes a question, Ben (the physics owner) approves it in his own browser, and it becomes a team packet', async () => {
      await ann.goto(`${BASE}#/write`);
      await see('Strong teams write their own questions');
      await ann.getByRole('link', { name: 'New question' }).click();
      await ann.locator('#wq-subject').selectOption('physics');
      await ann.locator('#wq-stem').fill('In meters per second squared, what is the acceleration due to gravity near Earth’s surface, to two significant figures?');
      await ann.locator('#wq-answer').fill('9.8');
      // Checks run as you type: a missing source blocks sending it for review.
      await see('Cite at least one source');
      if (await ann.getByRole('button', { name: 'Send for review' }).isEnabled()) throw new Error('sending without a source should be blocked');
      await ann.getByLabel('Source 1', { exact: true }).fill('OpenStax College Physics 2e, 2.7 Falling Objects');
      await see('No problems found.');
      await ann.getByRole('button', { name: 'Send for review' }).click();
      await see('Sent to the Physics owner for review.');
      if (await ann.getByRole('button', { name: 'Approve' }).count()) throw new Error('the author cannot approve her own question');
      const url = ann.url();
      await A.allSaved(ann);
      const ben = await pageOf('Ben');
      await A.allSaved(ben);
      await ben.goto(url);
      await ben.reload();
      await ben.getByRole('button', { name: 'Approve' }).click({ timeout: 10_000 });
      await see('Approved: it can now go into team packets.', ben);
      await A.allSaved(ben);
      await ann.goto(`${BASE}#/write`);
      await ann.reload();
      await see('Approved (1)', ann, 10_000);
      await shot('12c-write');
      await ann.getByRole('button', { name: /Make the packet \(1 toss-up\)/ }).click();
      await see('Test High questions');
    });

    await step('assignments: the captain assigns a drill to herself, it shows on her Today and ticks off when done', async () => {
      await ann.goto(`${BASE}#/assignments`);
      await ann.locator('#as-subject').selectOption('biology');
      await ann.locator('#as-count').selectOption('5');
      for (const n of ['Abe', 'Bea', 'Ben']) await ann.getByRole('checkbox', { name: n }).uncheck();
      await ann.locator('#as-title').fill('Biology warm-up');
      await ann.getByRole('button', { name: 'Assign', exact: true }).click();
      await see('0 of 1 done');
      await ann.goto(`${BASE}#/today`);
      const item = ann.locator('.plan-item', { hasText: 'Biology warm-up' });
      await item.getByText('Assigned by Ann').waitFor();
      await item.getByRole('link', { name: 'Start' }).click();
      await answerDrill([['phenotype', 'bacteriophage']]);
      await ann.getByRole('link', { name: "Back to today's plan" }).click();
      await planShown();
      if (await ann.locator('.plan-item', { hasText: 'Biology warm-up' }).count()) throw new Error('the finished assignment is still on Today');
      await ann.goto(`${BASE}#/assignments`);
      await see('1 of 1 done');
    });

    await step("Today shows the player's plan with reasons", async () => {
      await ann.goto(`${BASE}#/today`);
      await planShown();
      await see('Regional in 10 days');
      const items = await ann.locator('.plan-item').count();
      if (items < 3) throw new Error(`expected at least 3 plan items, got ${items}`);
      const why = await ann.locator('.why-label').count();
      if (why !== items) throw new Error('every plan item needs a "Why this?" line');
      await see('Biology drill');
      await see('timed mixed play');
      await shot('12-today-plan');
    });

    await step('a drill started from the plan begins at once and ticks itself off', async () => {
      await ann.locator('.plan-item', { hasText: 'Biology drill' }).getByRole('link', { name: 'Start' }).click();
      await answerDrill([['phenotype', 'bacteriophage']]);
      await ann.getByRole('link', { name: "Back to today's plan" }).click();
      const drill = ann.locator('.plan-item', { hasText: 'Biology drill' });
      await drill.getByText('Done', { exact: true }).waitFor({ timeout: 5000 });
    });

    await step('add a question from the library and review it, timed', async () => {
      await ann.goto(`${BASE}#/library/doe-hs-99/doe-hs-99-r01`);
      await ann.getByRole('button', { name: 'Add to my review' }).first().click();
      await see("In Ann's review queue");
      // Reviews are at the top of Learn; Start review there begins it at once.
      await ann.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Learn', exact: true }).click();
      await ann.getByRole('heading', { name: 'Review', level: 2 }).waitFor();
      await ann.getByRole('heading', { name: 'Concept cards', level: 2 }).waitFor();
      await shot('12e-learn-reviews');
      await ann.getByRole('link', { name: 'Start review (1)' }).click();
      await ann.getByRole('button', { name: /Buzz/ }).waitFor();
      if (!ann.url().endsWith('#/review')) throw new Error(`the review should leave its start flag behind: ${ann.url()}`);
      await shot('13-review-question');
      await key('Space');
      await ann.locator('#review-answer').fill('phenotype');
      await key('Enter');
      await judgedRight();
      await see('back in');
      await shot('14-review-answer');
      await key('Space');
      await see('Reviewed 1: 1 right');
      // Her review queue is in her account: after a reload, the reviewed question is still in it, done for today.
      await A.allSaved(ann);
      await ann.reload();
      for (const [label, value] of [
        ['In your queue', '1'],
        ['Reviewed today', '1'],
        ['Due today', '0'],
      ]) {
        const tile = ann.locator('.card', { hasText: label }).first();
        await tile.waitFor({ timeout: 10_000 });
        const shown = (await tile.locator('div').nth(1).innerText()).trim();
        if (shown !== value) throw new Error(`after a reload, "${label}" should be ${value}, is ${shown}`);
      }
    });

    await step('losing the connection: a change shows "Not connected" until the server has it, then it is saved', async () => {
      // Ann on another device, whose requests to the server fail for a while.
      const p = await open(accounts.Ann, 'Ann (losing the connection)', { offline: true });
      await p.goto(`${BASE}#/library/doe-hs-99/doe-hs-99-r01`);
      const add = p.getByRole('button', { name: 'Add to my review' }).first();
      await add.waitFor({ timeout: 10_000 });
      const cards = async () => (await A.allRecords('/api/me/records', accounts.Ann)).filter((r) => r.c === 'cards' && r.body).length;
      const before = await cards();
      const unreachable = (route) => route.abort('internetdisconnected');
      await p.context().route(`${SERVER}/**`, unreachable);
      await add.click();
      // A couple of quick retries first, then the banner.
      await see('Not connected: your last change was not saved.', p, 15_000);
      await shot('19-not-connected', p);
      await p.context().unroute(`${SERVER}/**`, unreachable);
      await p.getByRole('button', { name: 'Try now' }).first().click();
      await p.getByText('Not connected: your last change was not saved.').waitFor({ state: 'detached', timeout: 10_000 });
      await A.allSaved(p);
      const after = await cards();
      if (after !== before + 1) throw new Error(`the review question added while the server was out of reach should be saved once it is back (${before} → ${after})`);
      await p.context().close();
    });

    await step('Library topics: how often each topic comes up, with links to drills', async () => {
      await ann.goto(`${BASE}#/library`);
      await ann.getByRole('link', { name: 'Browse by topic' }).click();
      await ann.getByRole('heading', { name: 'Topics', exact: true }).waitFor();
      const bars = await ann.locator('.hbar').count();
      if (bars !== 8) throw new Error(`expected 8 topic bars from the fixture catalog, got ${bars}`);
      await ann.getByRole('link', { name: 'Genetics' }).first().waitFor();
    });

    await step('My progress shows mastery by subject and the subject map', async () => {
      await ann.goto(`${BASE}#/progress`);
      await see('Mastery by subject');
      await see('Subject map');
      const bars = await ann.locator('.hbar').count();
      if (bars < 4) throw new Error(`expected bars for 4 subjects, got ${bars}`);
      const cells = await ann.locator('.heat-cell').count();
      if (cells < 60) throw new Error(`expected a cell per topic, got ${cells}`);
      await ann.locator('.hbar').first().hover();
      await ann.locator('.viz-tip').first().waitFor();
      await shot('15-progress');
      await ann.getByRole('button', { name: 'Show table' }).first().click();
      await ann.getByRole('cell', { name: 'Biology' }).first().waitFor();
    });

    // Reading and the answer timer, signed out: trying a round saves nothing.
    await step('solo reading shows letters one at a time, current word fainter (signed out)', async () => {
      await guest.goto(`${BASE}#/try`);
      await see('Try a round', guest);
      await guest.locator('#set').selectOption('doe-hs-99');
      await guest.locator('#round').selectOption('doe-hs-99-r01');
      await guest.locator('#wpm').fill('120');
      await guest.getByRole('button', { name: 'Start' }).click();
      await guest.locator('.stem').first().waitFor();
      const lengths = [];
      let sawCurrent = false;
      for (let i = 0; i < 8; i++) {
        await guest.waitForTimeout(150);
        lengths.push((await guest.locator('.stem').first().innerText()).length);
        if ((await guest.locator('.reading-current').count()) > 0) sawCurrent = true;
      }
      if (!(lengths[7] > lengths[0])) throw new Error(`text did not grow: ${lengths}`);
      // At 120 words per minute (about 83 ms per letter), each 150 ms sample adds only a letter or two.
      const steps = lengths.slice(1).map((l, i) => l - lengths[i]);
      if (!steps.some((d) => d >= 1 && d <= 3)) throw new Error(`reveal is not letter by letter: ${lengths}`);
      if (!sawCurrent) throw new Error('the word being read is never shown fainter');
      await shot('12-solo-reveal', guest);
    });

    await step('answer timer: no typing within 2 seconds is a stall', async () => {
      await key('Space', guest); // buzz (an interrupt, the question is still being read)
      await guest.locator('#answer').waitFor();
      await see('Start typing', guest);
      await guest.waitForTimeout(2400);
      await see('Stall', guest);
      await shot('13-solo-stall', guest);
      await key('Space', guest); // next toss-up
    });

    await step('answer timer: the typed answer is taken at 5 seconds', async () => {
      await guest.getByRole('button', { name: /Buzz/ }).waitFor();
      await key('Space', guest);
      await guest.locator('#answer').pressSequentially('basi');
      await see('Finish your answer', guest);
      await guest.waitForTimeout(5300);
      await see('Time: your answer was taken', guest);
    });

    await step(NOTHING_SAVED, nothingSaved);

    await step('library and rules pages', async () => {
      await ann.goto(`${BASE}#/library/doe-hs-99/doe-hs-99-r01`);
      await see('Heard by');
      await shot('10-library-round');
      await ann.goto(`${BASE}#/rules`);
      await see('NSB rules at a glance');
      await see('5 seconds after the toss-up is fully read');
    });

    await step('Account: download my data as one .json file', async () => {
      await ann.goto(`${BASE}#/account`);
      const [download] = await Promise.all([ann.waitForEvent('download'), ann.getByRole('button', { name: 'Download my data' }).click()]);
      if (!download.suggestedFilename().endsWith('.json')) throw new Error(`the download is not a .json file: ${download.suggestedFilename()}`);
      const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
      if (file.format !== 'rebound-account' || !file.user || file.user.email !== accounts.Ann.email) throw new Error('the file is not Ann’s account');
      const attempts = Object.keys((file.records && file.records.attempts) || {}).length;
      if (attempts < 8) throw new Error(`the file should hold Ann's practice answers, holds ${attempts}`);
    });

    await step('phone layout', async () => {
      await ann.setViewportSize({ width: 390, height: 844 });
      try {
        await ann.goto(`${BASE}#/today`);
        await planShown();
        const overflow = await ann.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) throw new Error('page scrolls sideways on a phone');
        await shot('11-phone-today');
      } finally {
        await ann.setViewportSize(VIEWPORT);
      }
    });

    await step("teammates' stats: Ann sees Ben's practice after a reload, never his review queue or plan", async () => {
      const ben = await pageOf('Ben');
      // Ben's own plan, then a short physics drill in his browser.
      await ben.goto(`${BASE}#/today`);
      await planShown(ben);
      await ben.goto(`${BASE}#/try?mode=subject&subject=physics&count=2&go=1`);
      await answerDrill([['amplitude', 'diffraction']], ben);
      await ben.getByRole('heading', { name: /^\d+ points$/ }).waitFor();
      await A.allSaved(ben);
      await ann.goto(`${BASE}#/stats`);
      await ann.reload();
      await see('Toss-up accuracy by subject');
      await eventually(async () => {
        const cells = await statsRow(ann, 'Ben');
        if (cells[cells.length - 1] !== '2 / 2') throw new Error(`Ben's row on Ann's Team stats should show his solo 2 / 2: ${cells.join(' | ')}`);
      });
      // Ben's progress page is open to the team: his answers, but not his review queue.
      await ann.goto(`${BASE}#/progress?player=${accounts.Ben.user.id}`);
      await ann.getByRole('heading', { name: "Ben's progress" }).waitFor();
      await see('Questions answered');
      if (await ann.getByText('Review queue', { exact: true }).count()) throw new Error("a teammate's progress page shows his review queue");
      // Ben's account holds his review questions and today's plan; what his team may read of it holds neither.
      const own = await A.allRecords('/api/me/records', accounts.Ben);
      if (!own.some((r) => r.c === 'cards' && r.body) || !own.some((r) => r.c === 'plans' && r.body)) throw new Error("Ben's account should hold his review questions and today's plan");
      const visible = await A.allRecords(`/api/teams/${team.id}/members/${accounts.Ben.user.id}/records`, accounts.Ann);
      const hidden = [...new Set(visible.filter((r) => !TEAM_VISIBLE.has(r.c)).map((r) => r.c))];
      if (hidden.length) throw new Error(`Ann can read Ben's ${hidden.join(', ')}`);
      if (!visible.some((r) => r.c === 'attempts' && r.body)) throw new Error("Ben's practice answers are not visible to his team");
      await shot('18-teammate-stats');
    });

    for (const p of Object.values(pages)) await p.context().close();
  }

  await step('offline: the app and question files seen before open with no connection; an account needs one', async () => {
    // A signed-in player's device: the service worker keeps the site and public question files, never their practice.
    let player = made.find((a) => a.name === 'Ann');
    if (!player) made.push((player = await A.signUp('Oli')));
    const ctx = await A.signedInContext(browser, player, { serviceWorkers: 'allow' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`offline pageerror: ${e.message}`));
    p.on('dialog', (d) => d.accept());
    await p.goto(BASE);
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await p.reload();
    await p.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await p.goto(`${BASE}#/library/doe-hs-17/doe-hs-17-r01`);
    await p.locator('.question-kind').first().waitFor({ timeout: 15_000 });
    await p.goto(`${BASE}#/today`);
    await p.getByRole('heading', { name: /^Your plan/ }).waitFor({ timeout: 15_000 });
    await A.allSaved(p);
    await ctx.setOffline(true);
    await p.reload();
    await p.getByRole('heading', { name: 'Today', exact: true }).waitFor({ timeout: 8000 });
    await p.getByText('Not connected.').first().waitFor({ timeout: 8000 });
    if ((await p.getByRole('heading', { name: /^Your plan/ }).count()) || (await p.locator('.plan-item').count())) throw new Error('with no connection, the plan should not show (nothing about a player is kept on the device)');
    await p.goto(`${BASE}#/library/doe-hs-17/doe-hs-17-r01`);
    await p.locator('.question-kind').first().waitFor({ timeout: 8000 });
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, '16-offline-library.png') });
    await ctx.close();
  });

  await step('clean up: the accounts this run made are deleted', async () => {
    const problems = await A.deleteAccounts(made);
    if (problems.length) throw new Error(problems.join('; '));
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
