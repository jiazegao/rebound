/*
 * End-to-end test of teams, remote rooms and online matches with accounts (docs/ACCOUNTS.md; rooms in
 * docs/SERVER.md), against a local Rebound server. Several people, each in their own signed-in browser, play the
 * small fixture question set (like smoke.cjs):
 *
 * - A captain creates a team on the Team page; a player on no team opens the invite link and joins.
 * - Data goes both ways through the server: the player's practice shows in the captain's team stats, and the
 *   captain's assignment shows on the player's Today, whose completion comes back. Review cards and daily plans
 *   stay private, members cannot write leader-only records, and the captain changes the player's role and sub-team.
 * - A Reader console game played remotely: the captain reads, the player buzzes (server-timed), writes in the team
 *   channel and gives the captain's answer, and the finished game's answers reach his account. A Finals visual
 *   round shows its figure on the player's screen.
 * - Online matches with no reader: teammates' team match goes to the team's games; a match with an outsider (on no
 *   team) goes to each player's account only; a free-for-all's close call goes to the other player. The list of
 *   open games shows only rooms opened by members of the caller's team.
 * - The player moves to another team with its invite link: his history goes with him, the old team no longer lists
 *   him, and the new team sees his stats.
 * - Last, the captain deletes the team and every test account is deleted, so a run leaves nothing behind (rooms
 *   close by themselves 6 hours after everyone has left).
 *
 * Local only: people sign up through the server's development email outbox (DEV_EMAIL_OUTBOX=1 in
 * server/.dev.vars), which a deployed server never has, so the test refuses any server but this machine's. Start
 * both servers, then run it:
 *
 *   cd server && cp .dev.vars.example .dev.vars && npx wrangler dev --port 8787 &   # the Rebound server
 *   npm run build && npx vite preview --port 4173 --strictPort &                    # the site, built without VITE_SERVER_URL
 *   node e2e/team-server.cjs
 *
 * SERVER_URL and BASE_URL point it at other ports (defaults http://localhost:8787 and http://localhost:4173/); the
 * server must allow the site's origin, e.g. `npx wrangler dev --port 8792 --var ALLOWED_ORIGINS:http://localhost:4192`
 * with SERVER_URL=http://localhost:8792 BASE_URL=http://localhost:4192/. SHOTS_DIR=/some/dir also saves
 * screenshots. A run takes a few minutes: some checks wait for the site's 30-second refresh. Needs Playwright with
 * Chromium (require('playwright')).
 */
const { chromium } = require('playwright');
const path = require('path');
const { SERVER, BASE, call, signUp, makeTeam, signedInContext, watchErrors, allRecords, deleteAccounts, allSaved } = require('./accounts.cjs');

const SHOTS = process.env.SHOTS_DIR || '';
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

/** What teammates may read of a player's collections (TEAM_VISIBLE in src/core/accounts.ts). */
const TEAM_VISIBLE = new Set(['attempts', 'answers', 'seen', 'conceptReads', 'completions', 'reports']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const secondsSince = (t) => Math.round((Date.now() - t) / 1000);

async function fixtures(page) {
  const f = (name) => path.join(__dirname, name);
  await page.route('**/data/doe/index.json', (r) => r.fulfill({ path: f('fixture-index.json'), contentType: 'application/json' }));
  await page.route('**/data/doe/doe-hs-99.json', (r) => r.fulfill({ path: f('fixture-set.json'), contentType: 'application/json' }));
  await page.route('**/data/doe/catalog.json', (r) => r.fulfill({ path: f('fixture-catalog.json'), contentType: 'application/json' }));
  await page.route('**/data/doe/concepts.json', (r) => r.fulfill({ path: f('fixture-concepts.json'), contentType: 'application/json' }));
}

/** Calls `check` every half second until it returns something truthy, and returns that; gives up after `timeout` ms. */
async function until(what, check, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    let problem = '';
    try {
      const value = await check();
      if (value) return value;
    } catch (err) {
      problem = `: ${String(err.message).split('\n')[0]}`;
    }
    if (Date.now() > end) throw new Error(`gave up after ${Math.round(timeout / 1000)} s waiting for ${what}${problem}`);
    await sleep(500);
  }
}

/** Fails unless the API call `promise` is refused with HTTP `status`. */
async function refusedWith(status, what, promise) {
  try {
    await promise;
  } catch (err) {
    if (err.message.includes(`: ${status} `)) return;
    throw new Error(`${what}: expected ${status}, got ${err.message}`);
  }
  throw new Error(`${what}: expected ${status}, but the server allowed it`);
}

/** The text of the first element `locator` finds, or '' while there is none. */
async function textOf(locator) {
  return (await locator.count()) ? locator.first().innerText() : '';
}

/** A link the site showed (an invite or a room), opened on this test's site. */
const onSite = (link) => link.replace(/^.*#/, `${BASE}#`);
const roomIdOf = (url) => /#\/room\/([a-z2-7]{16})/.exec(url)?.[1] ?? '';
const present = (records) => records.filter((r) => r.body !== null);

/** The Team page's member list. */
const members = (page) => page.locator('section[aria-labelledby="members-heading"]');
/** A player's row in the first table of Team stats (the one whose names link to their progress). */
const statsRow = (page, name) => page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
/** The value of a figure tile, e.g. "Questions answered" on My progress. */
async function tileValue(page, label) {
  const lines = (await textOf(page.locator('.card', { hasText: label }))).split('\n').map((s) => s.trim());
  return lines.filter(Boolean)[1] ?? '';
}

async function main() {
  // The deployed server never runs the development email outbox, and signing up there would send real email.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(SERVER).hostname)) {
    console.error(`This test signs people up through a local server's development email outbox; SERVER_URL is ${SERVER}. See the top of e2e/team-server.cjs.`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const contexts = [];
  const errors = [];
  let failures = 0;
  let notes = [];
  const note = (text) => notes.push(text);
  const step = async (name, fn) => {
    process.stdout.write(`- ${name} ... `);
    notes = [];
    try {
      await fn();
      console.log('ok');
    } catch (err) {
      failures += 1;
      console.log(`FAILED\n    ${String(err && err.message ? err.message : err).split('\n')[0]}`);
    }
    for (const n of notes) console.log(`    note: ${n}`);
  };
  /** A browser of its own for `account`, already signed in, with the fixture questions. */
  const open = async (label, account) => {
    const context = await signedInContext(browser, account);
    contexts.push(context);
    const page = await context.newPage();
    watchErrors(page, label, errors);
    page.on('dialog', (d) => d.accept());
    await fixtures(page);
    return page;
  };

  // Cara captains Server High; Ben is the player who joins it and later moves to Rex's Rival High; Olga is on no
  // team and plays an online match from its link.
  let cara = null;
  let ben = null;
  let olga = null;
  let rex = null;
  let rival = null;

  try {
    await step('four people sign up through the email outbox; one of them makes another team through the API', async () => {
      cara = await signUp('Cara', { primarySubject: 'biology' });
      ben = await signUp('Ben', { primarySubject: 'chemistry' });
      olga = await signUp('Olga', { primarySubject: 'physics' });
      rex = await signUp('Rex', { primarySubject: 'math' });
      rival = await makeTeam(rex, 'Rival High');
    });
    if (!cara || !ben || !olga || !rex || !rival) throw new Error('The test cannot go on without its accounts.');

    const captain = await open('captain', cara);
    const player = await open('player', ben);
    const outsider = await open('outsider', olga);
    let joinLink = '';
    let teamId = '';

    /* ---------------- making and joining the team ---------------- */

    await step('the captain creates a team on the Team page; the invite link shows', async () => {
      await captain.goto(`${BASE}#/team`);
      await captain.getByLabel('Team name').fill('Server High');
      await captain.getByRole('button', { name: 'Create team' }).click();
      await captain.getByRole('heading', { name: 'Server High', level: 1 }).waitFor({ timeout: 15000 });
      await captain.getByText('You are a captain.').waitFor();
      joinLink = await captain.getByRole('textbox', { name: 'Invite link' }).inputValue();
      teamId = /#\/join\/([a-z2-7]{16})\.[a-z2-7]{12}$/.exec(joinLink)?.[1] ?? '';
      if (!teamId) throw new Error(`no invite link: ${joinLink}`);
      const me = await call('/api/me', { token: cara.token });
      if (me.team?.id !== teamId || me.team.role !== 'captain') throw new Error(`the server has the captain on ${JSON.stringify(me.team)}`);
      await shot(captain, 'team-1-created');
    });

    await step('a player on no team opens the invite link and joins; both see each other in Members', async () => {
      await player.goto(onSite(joinLink));
      await player.getByText('Signed in as').waitFor({ timeout: 15000 });
      await player.getByRole('button', { name: 'Join the team' }).click();
      await player.getByRole('heading', { name: 'Server High', level: 1 }).waitFor({ timeout: 15000 });
      const joined = Date.now();
      await player.getByText('You are a member.').waitFor();
      await members(player).getByRole('heading', { name: 'Members (2)' }).waitFor();
      await members(player).getByRole('cell', { name: 'Cara', exact: true }).waitFor();
      await members(player).getByRole('cell', { name: 'Ben (you)', exact: true }).waitFor();
      // The captain's Team page stayed open: the site refreshes the team every 30 seconds.
      try {
        await members(captain).getByRole('cell', { name: 'Ben', exact: true }).waitFor({ timeout: 40000 });
      } catch {
        await captain.reload();
        await members(captain).getByRole('cell', { name: 'Ben', exact: true }).waitFor({ timeout: 15000 });
        throw new Error("the captain's member list did not show the player within 40 s without a reload (it did after a reload)");
      }
      note(`the captain's member list showed the player ${secondsSince(joined)} s after he joined, without a reload (the 30-second refresh)`);
      await members(captain).getByRole('heading', { name: 'Members (2)' }).waitFor();
      await shot(captain, 'team-2-members');
    });

    /* ---------------- data both ways ---------------- */

    await step("the player's solo round on Try a round reaches the captain's team stats", async () => {
      await player.goto(`${BASE}#/try`);
      await player.locator('#set').selectOption('doe-hs-99');
      await player.locator('#round').selectOption('doe-hs-99-r01');
      await player.locator('#wpm').fill('320');
      await player.getByRole('button', { name: 'Start' }).click();
      const answers = [
        ['phenotype', 'phage'],
        ['W', '144 grams'],
        ['-1.25', '9 pi'],
        ['amplitud', 'diffraction'],
      ];
      for (const [tossup, bonus] of answers) {
        await player.getByRole('button', { name: /Buzz/ }).waitFor();
        await player.waitForTimeout(600);
        await player.keyboard.press('Space'); // buzz while it is read: a (right) interrupt
        await player.locator('#answer').fill(tossup);
        await player.keyboard.press('Enter');
        if (tossup === 'amplitud') {
          await player.getByText('Your call').waitFor();
          await player.keyboard.press('y');
        }
        await player.getByText('Correct').first().waitFor();
        await player.keyboard.press('Space'); // to the bonus
        await player.locator('#answer').fill(bonus);
        await player.keyboard.press('Enter');
        await player.getByText('Correct').first().waitFor();
        await player.keyboard.press('Space');
      }
      await player.getByText('56 points').waitFor();
      await allSaved(player);
      const attempts = present(await allRecords('/api/me/records', ben)).filter((r) => r.c === 'attempts');
      if (attempts.length !== 8) throw new Error(`expected the player's 8 practice answers on the server, found ${attempts.length}`);
      await captain.goto(`${BASE}#/stats`);
      const solo = statsRow(captain, 'Ben').locator('td').last();
      const opened = Date.now();
      await until("the player's solo practice (8 / 8) in the captain's team stats", async () => (await textOf(solo)) === '8 / 8', 45000);
      note(`the captain's team stats showed it ${secondsSince(opened)} s after the page opened`);
      await shot(captain, 'team-3-stats');
    });

    await step("the captain's assignment shows on the player's Today; when he finishes it, the captain sees it done", async () => {
      await captain.goto(`${BASE}#/assignments`);
      await captain.locator('#as-subject').selectOption('biology');
      await captain.locator('#as-count').selectOption('5');
      await captain.getByRole('checkbox', { name: 'Ben', exact: true }).check();
      await captain.getByRole('checkbox', { name: 'Cara', exact: true }).uncheck();
      await captain.locator('#as-title').fill('Biology warm-up');
      await captain.getByRole('button', { name: 'Assign', exact: true }).click();
      await captain.getByText('0 of 1 done').waitFor();
      await allSaved(captain);
      const assigned = Date.now();
      // The player's page has been open all along: Today shows the team's new assignment after the 30-second refresh.
      await player.goto(`${BASE}#/today`);
      const item = player.locator('.plan-item', { hasText: 'Biology warm-up' });
      await item.getByText('Assigned by Cara').waitFor({ timeout: 40000 });
      note(`the player's Today showed the assignment ${secondsSince(assigned)} s after it was made, without a reload`);
      await item.getByRole('link', { name: 'Start' }).click();
      await player.getByRole('button', { name: /Buzz/ }).waitFor();
      await player.waitForTimeout(600);
      await player.keyboard.press('Space');
      await player.locator('#answer').fill('phenotype');
      await player.keyboard.press('Enter');
      await player.getByText('Correct').first().waitFor();
      await player.keyboard.press('Space');
      await player.locator('#answer').fill('bacteriophage');
      await player.keyboard.press('Enter');
      await player.getByText('Correct').first().waitFor();
      await player.keyboard.press('Space');
      await player.getByRole('link', { name: "Back to today's plan" }).click();
      await player.getByText('Your plan').waitFor();
      if (await player.locator('.plan-item', { hasText: 'Biology warm-up' }).count()) throw new Error('the finished assignment is still on Today');
      await allSaved(player);
      const done = Date.now();
      // The completion is the player's own record; the captain's Assignments page reads teammates' every 30 seconds.
      await captain.getByText('1 of 1 done').waitFor({ timeout: 40000 });
      note(`the captain's Assignments page showed it done ${secondsSince(done)} s later, without a reload`);
    });

    await step("the player's review cards and daily plan stay private: a teammate reads only the visible collections", async () => {
      await player.goto(`${BASE}#/library/doe-hs-99/doe-hs-99-r01`);
      await player.getByRole('button', { name: 'Add to my review' }).first().click();
      await allSaved(player);
      const own = new Set(present(await allRecords('/api/me/records', ben)).map((r) => r.c));
      for (const c of ['cards', 'plans']) if (!own.has(c)) throw new Error(`the player's own records have no ${c} (${[...own].join(', ')})`);
      const seen = new Set(present(await allRecords(`/api/teams/${teamId}/members/${ben.user.id}/records`, cara)).map((r) => r.c));
      const hidden = [...seen].filter((c) => !TEAM_VISIBLE.has(c));
      if (hidden.length) throw new Error(`a teammate can read the player's ${hidden.join(', ')}`);
      for (const c of ['attempts', 'completions', 'seen']) if (!seen.has(c)) throw new Error(`a teammate should see the player's ${c} (saw ${[...seen].join(', ')})`);
      await refusedWith(403, "someone on no team reading the player's records", call(`/api/teams/${teamId}/members/${ben.user.id}/records`, { token: olga.token }));
    });

    await step('a member cannot write the leader-only collections (lineups, assignments): the server refuses', async () => {
      const now = new Date().toISOString();
      const changes = [
        { c: 'lineups', id: 'e2e-lineup', body: { id: 'e2e-lineup', name: 'My lineup', starters: [ben.user.id], alternates: [], createdAt: now, updatedAt: now } },
        {
          c: 'assignments',
          id: 'e2e-assignment',
          body: { id: 'e2e-assignment', kind: 'review', title: 'Reviews', playerIds: [ben.user.id], due: now.slice(0, 10), createdBy: ben.user.id, createdAt: now },
        },
      ];
      const res = await call(`/api/teams/${teamId}/records`, { token: ben.token, body: { changes } });
      const refused = res.rejected.filter((r) => /coaches and captains/i.test(r.reason)).map((r) => r.c);
      if (refused.sort().join() !== 'assignments,lineups') throw new Error(`expected both changes refused for a member, got ${JSON.stringify(res.rejected)}`);
      const stored = (await allRecords(`/api/teams/${teamId}/records`, cara)).filter((r) => r.id.startsWith('e2e-'));
      if (stored.length) throw new Error(`the refused records were stored: ${stored.map((r) => r.c).join(', ')}`);
    });

    await step("the captain makes the player a captain and puts him on sub-team B; it shows on the player's Team page", async () => {
      await captain.goto(`${BASE}#/team`);
      await captain.getByLabel('Role for Ben', { exact: true }).selectOption('captain');
      await captain.getByLabel('Sub-team for Ben', { exact: true }).selectOption('B');
      const member = async () => (await call(`/api/teams/${teamId}`, { token: cara.token })).members.find((m) => m.userId === ben.user.id);
      await until('the server to have the player as a captain on sub-team B', async () => {
        const m = await member();
        return m?.role === 'captain' && m.squad === 'B';
      });
      await player.goto(`${BASE}#/team`);
      await player.reload();
      await player.getByText('You are a captain.').waitFor({ timeout: 15000 });
      const squad = await player.getByLabel('Sub-team for Ben', { exact: true }).inputValue();
      if (squad !== 'B') throw new Error(`the player's Team page shows sub-team ${squad || '(none)'}`);
      // A captain can invite people too.
      await player.getByRole('textbox', { name: 'Invite link' }).waitFor();
      note("checked on the player's Team page after a reload");
      // Back to a member for the games below.
      await captain.getByLabel('Role for Ben', { exact: true }).selectOption('member');
      await until('the player to be a member again', async () => (await member())?.role === 'member');
    });

    /* ---------------- a Reader console game in a remote room ---------------- */

    let roomLink = '';
    let readerGame = '';
    await step('the captain opens a remote room for a Reader console game', async () => {
      await captain.goto(`${BASE}#/reader`);
      await captain.getByRole('radiogroup', { name: 'Cara plays for' }).getByRole('radio', { name: 'Team A' }).click();
      await captain.getByRole('radiogroup', { name: 'Ben plays for' }).getByRole('radio', { name: 'Team B' }).click();
      await captain.getByRole('button', { name: 'Start game' }).click();
      await captain.getByRole('button', { name: 'Open a remote room' }).click();
      roomLink = await captain.getByRole('textbox', { name: 'Room link' }).inputValue();
      await captain.getByText('Remote room · connected').waitFor({ timeout: 15000 });
      readerGame = /#\/reader\/([^/?]+)/.exec(captain.url())?.[1] ?? '';
      if (!roomIdOf(roomLink) || !readerGame) throw new Error(`no room link (${roomLink}) or game (${captain.url()})`);
    });

    await step('the player joins the room and buzzes; the server times the buzz and the console records it', async () => {
      await player.goto(onSite(roomLink));
      await player.getByText('connected').first().waitFor({ timeout: 15000 });
      await captain.getByText(/Ben \(Team B/).waitFor({ timeout: 15000 });
      await captain.keyboard.press('Space'); // start the game: toss-up 1 is being read
      await player.waitForFunction(() => !document.querySelector('.room-buzz')?.hasAttribute('disabled'), null, { timeout: 10000 });
      await player.getByRole('button', { name: /Buzz/ }).click();
      await player.getByText('Ben buzzed').waitFor({ timeout: 10000 });
      await captain.getByText('Ben (Team B) interrupted').waitFor({ timeout: 10000 });
      await captain.keyboard.press('c'); // correct: Team B gets the bonus
      await player.getByText(/Bonus for/).waitFor({ timeout: 10000 });
    });

    await step("team channel and captain's answer during the bonus; the finished game's answers reach the player's account", async () => {
      await player.getByRole('textbox', { name: 'Message to your team' }).fill('I think it is a phage');
      await player.getByRole('button', { name: 'Send' }).click();
      await player.getByText('I think it is a phage').waitFor({ timeout: 10000 });
      await player.locator('#captain-answer').fill('bacteriophage');
      await player.getByRole('button', { name: 'Answer', exact: true }).click();
      await captain.getByText('Ben answers:').waitFor({ timeout: 10000 });
      // The reader never sees the team channel.
      if (await captain.getByText('I think it is a phage').count()) throw new Error('the team channel leaked to the reader');
      await captain.keyboard.press('Space'); // done reading the bonus
      await captain.keyboard.press('c'); // correct
      await captain.getByRole('button', { name: 'End game' }).click(); // the confirm is accepted
      await captain.getByRole('link', { name: 'See game summary' }).waitFor();
      // The team turns the finished game into each player's answers.
      const answers = await until("the game's answers in the player's account", async () => {
        const mine = present(await allRecords('/api/me/records', ben)).filter((r) => r.c === 'answers' && r.id.startsWith(`game:${readerGame}:`));
        return mine.length ? mine : null;
      });
      const tossup = answers.find((r) => r.body.kind === 'tossup');
      if (!tossup || !tossup.body.correct || !tossup.body.interrupt) throw new Error(`expected a right interrupt, got ${JSON.stringify(answers.map((r) => r.body))}`);
    });

    await step("a Finals visual round in a remote room: the figure shows on the player's screen", async () => {
      await captain.goto(`${BASE}#/packets`);
      await captain.locator('#scrim-format').selectOption('finals-visual');
      await captain.locator('#scrim-visual').selectOption('1');
      await captain.getByRole('button', { name: 'Build packet' }).click();
      await captain.getByRole('button', { name: 'Save packet' }).click();
      await captain.getByRole('link', { name: 'Play in the Reader console' }).click();
      await captain.getByRole('radiogroup', { name: 'Cara plays for' }).getByRole('radio', { name: 'Team A' }).click();
      await captain.getByRole('radiogroup', { name: 'Ben plays for' }).getByRole('radio', { name: 'Team B' }).click();
      await captain.getByRole('button', { name: 'Start game' }).click();
      await captain.getByRole('button', { name: 'Open a remote room' }).click();
      const link = await captain.getByRole('textbox', { name: 'Room link' }).inputValue();
      await captain.getByText('Remote room · connected').waitFor({ timeout: 15000 });
      await player.goto(onSite(link));
      await player.getByText('connected').first().waitFor({ timeout: 15000 });
      await captain.getByText(/Ben \(Team B/).waitFor({ timeout: 15000 });
      const key = async (k) => {
        await captain.keyboard.press(k);
        await captain.waitForTimeout(250);
      };
      await key('Space'); // start
      // Team A answers toss-ups (Cara is key 1) until a visual bonus comes up.
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
      await shot(player, 'room-visual-bonus');
    });

    /* ---------------- online matches with no reader ---------------- */

    /** Opens a team match on the captain's Online page (600 words a minute) and puts the captain on side A. */
    const openTeamMatch = async () => {
      await captain.goto(`${BASE}#/online`);
      await captain.getByRole('heading', { name: 'Start an online match' }).waitFor({ timeout: 15000 });
      await captain.locator('#om-wpm').fill('600');
      await captain.getByText(/toss-ups? from Round 1/).waitFor();
      await captain.getByRole('button', { name: 'Open the match' }).click();
      await captain.getByText('Waiting for the host to start the match').waitFor({ timeout: 15000 });
      const roomId = roomIdOf(captain.url());
      if (!roomId) throw new Error(`the match did not open: ${captain.url()}`);
      await captain.getByRole('button', { name: 'Join Team A' }).click();
      return roomId;
    };
    /** `page`'s player (`name`), alone on side B, answers toss-up 1 and its bonus; then the captain ends the match. */
    const playTossupAndBonus = async (page, name, shots = '') => {
      await captain.getByRole('button', { name: 'Start the match' }).click();
      // Buzz once the reading has finished (the answer window counts down).
      await page.getByText(/s left$/).waitFor({ timeout: 15000 });
      await page.getByRole('button', { name: /Buzz/ }).click();
      await page.getByLabel(/^Your answer/).fill('phenotype');
      if (shots) await shot(page, `${shots}-answering`);
      await page.keyboard.press('Enter');
      await captain.getByText(`${name}: “phenotype”. Correct.`).waitFor({ timeout: 10000 });
      // Alone on side B, they are its captain, so they answer the bonus once it has been read.
      await page.getByLabel(/answer for the team/).fill('bacteriophage', { timeout: 15000 });
      if (shots) await shot(page, `${shots}-bonus`);
      await page.keyboard.press('Enter');
      await captain.getByText(/Correct: 10 points/).waitFor({ timeout: 10000 });
      await captain.getByRole('button', { name: 'End the match' }).click(); // the confirm is accepted
      await page.getByText('The match is over.').waitFor({ timeout: 10000 });
    };
    const teamGames = async () => present(await allRecords(`/api/teams/${teamId}/records`, cara)).filter((r) => r.c === 'games').map((r) => r.id);
    const matchAnswers = async (account, roomId) =>
      present(await allRecords('/api/me/records', account)).filter((r) => r.c === 'answers' && r.id.startsWith(`game:g-online-${roomId}:`));
    const listed = async (account) => (await call('/api/rooms', { token: account.token })).rooms.map((r) => r.roomId);

    let teammatesMatch = '';
    await step("an online team match between teammates: the server judges typed answers; the game goes to the team's games", async () => {
      teammatesMatch = await openTeamMatch();
      // The player finds it under Play online, with his team's other open games.
      await player.goto(`${BASE}#/online`);
      await player.locator(`a[href="#/room/${teammatesMatch}"]`).click({ timeout: 20000 });
      await player.getByRole('button', { name: 'Join Team B' }).click();
      await shot(captain, 'online-1-lobby');
      await playTossupAndBonus(player, 'Ben', 'online-2');
      // The room wrote the game to the team before it said the match was over; the captain's page then fetches it.
      await captain.getByRole('link', { name: 'See the game summary' }).click({ timeout: 20000 });
      await captain.getByRole('heading', { name: 'Team A 0 – 14 Team B' }).waitFor({ timeout: 10000 });
      if (!(await teamGames()).includes(`g-online-${teammatesMatch}`)) throw new Error("the match is not in the team's games");
      const answers = await matchAnswers(ben, teammatesMatch);
      if (!answers.some((r) => r.body.kind === 'tossup' && r.body.correct)) throw new Error(`the player's answers from the match: ${JSON.stringify(answers.map((r) => r.body))}`);
    });

    await step("GET /api/rooms lists only the open rooms opened by members of the caller's team", async () => {
      const outsiders = (await call('/api/rooms', { token: olga.token, body: { name: 'Olga plays' } })).roomId;
      const others = (await call('/api/rooms', { token: rex.token, body: { name: 'Rival practice' } })).roomId;
      const forCaptain = await listed(cara);
      const forPlayer = await listed(ben);
      if (!forPlayer.includes(roomIdOf(roomLink)) || !forCaptain.includes(roomIdOf(roomLink))) throw new Error("the team's reader room is not listed for its members");
      if (forCaptain.includes(outsiders) || forCaptain.includes(others)) throw new Error('rooms opened by people on no team or another team are listed for this team');
      if ((await listed(olga)).length) throw new Error('someone on no team was given a list of rooms');
      const forRival = await listed(rex);
      if (!forRival.includes(others) || forRival.some((id) => forCaptain.includes(id))) throw new Error(`another team's list: ${forRival.join(', ')}`);
    });

    let outsiderMatch = '';
    await step("an outsider on no team plays a team match from its link: the answers go to each player's account, not to the host team's games", async () => {
      outsiderMatch = await openTeamMatch();
      if ((await listed(olga)).includes(outsiderMatch) || (await listed(rex)).includes(outsiderMatch)) throw new Error('the match is listed for people off the team');
      await outsider.goto(`${BASE}#/online`);
      await outsider.getByText('Games your teammates open show up here once you are on a team').waitFor({ timeout: 15000 });
      await outsider.goto(`${BASE}#/room/${outsiderMatch}`);
      await outsider.getByRole('button', { name: 'Join Team B' }).click();
      await playTossupAndBonus(outsider, 'Olga');
      // Not everyone in it is on the host's team: no team game, no summary link.
      await captain.getByText("When everyone in it is on the host's team").waitFor();
      const answers = await matchAnswers(olga, outsiderMatch);
      if (!answers.some((r) => r.body.kind === 'tossup' && r.body.correct)) throw new Error(`the outsider's answers from the match: ${JSON.stringify(answers.map((r) => r.body))}`);
      const games = await teamGames();
      if (games.includes(`g-online-${outsiderMatch}`)) throw new Error("a match with someone off the team was written to the host team's games");
      if (!games.includes(`g-online-${teammatesMatch}`)) throw new Error("the teammates' match left the team's games");
      if (await captain.getByRole('link', { name: 'See the game summary' }).count()) throw new Error('the match offers a game summary');
      // The outsider's own My progress counts her answer.
      await outsider.goto(`${BASE}#/progress`);
      await until("the outsider's answer on her My progress page", async () => (await tileValue(outsider, 'Questions answered')) === '1');
      await shot(outsider, 'online-3-outsider-progress');
    });

    await step("a free-for-all: a close call goes to the other player, who rejects it; the answer is in the answering player's account", async () => {
      await captain.goto(`${BASE}#/online`);
      await captain.getByRole('radio', { name: /Everyone for themselves/ }).check();
      await captain.locator('#om-count').fill('1');
      await captain.locator('#om-wpm').fill('600');
      await captain.getByRole('button', { name: 'Open the match' }).click();
      await captain.getByRole('button', { name: 'Join the game' }).click();
      const roomId = roomIdOf(captain.url());
      await player.goto(`${BASE}#/room/${roomId}`);
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
      const id = `match:${roomId}:doe-hs-99-r01-t01`;
      const answer = present(await allRecords('/api/me/records', cara)).find((r) => r.c === 'answers' && r.id === id);
      if (!answer || answer.body.correct !== false) throw new Error(`expected the rejected answer in the captain's account as ${id}, got ${JSON.stringify(answer?.body)}`);
    });

    /* ---------------- moving to another team ---------------- */

    await step('the player joins another team with its invite link: his history goes with him, the old team drops him, the new team sees his stats', async () => {
      const history = (records) =>
        present(records)
          .filter((r) => r.c === 'attempts' || r.c === 'answers')
          .map((r) => `${r.c}/${r.id}`)
          .sort()
          .join();
      await player.goto(`${BASE}#/progress`);
      await player.reload();
      const answeredBefore = await until("the player's My progress page", () => tileValue(player, 'Questions answered'));
      const before = await allRecords('/api/me/records', ben);
      const hisRoom = (await call('/api/rooms', { token: ben.token, body: { name: 'Ben practices' } })).roomId;
      if (!(await listed(cara)).includes(hisRoom)) throw new Error('a room the player opened is not listed for his team');
      // The captain's Team page (which also loads teammates' practice) stays open while he moves. He moves just after
      // it has fetched the team and his practice (it does so every 30 seconds), so its next refresh is the one that
      // drops him. (Someone who leaves during a refresh is asked for once more: the page takes the server's 404 in
      // stride, but the browser logs it.)
      await captain.goto(`${BASE}#/team`);
      await members(captain).getByRole('cell', { name: 'Ben', exact: true }).waitFor({ timeout: 15000 });
      await captain.waitForResponse((r) => r.url() === `${SERVER}/api/teams/${teamId}` && r.request().method() === 'GET', { timeout: 40000 });
      await captain.waitForResponse((r) => r.url().startsWith(`${SERVER}/api/teams/${teamId}/members/${ben.user.id}/records`), { timeout: 5000 }).catch(() => {});
      await player.goto(`${BASE}#/join/${rival.joinCode}`);
      await player.getByText('You can be on one team at a time, so joining leaves it.').waitFor({ timeout: 15000 });
      await player.getByRole('button', { name: 'Leave Server High and join' }).click(); // the confirm is accepted
      await player.getByRole('heading', { name: 'Rival High', level: 1 }).waitFor({ timeout: 15000 });
      const moved = Date.now();
      const me = await call('/api/me', { token: ben.token });
      if (me.team?.id !== rival.team.id) throw new Error(`the server has the player on ${JSON.stringify(me.team)}`);
      // His history is still his.
      const after = await allRecords('/api/me/records', ben);
      if (history(after) !== history(before)) throw new Error('the move changed the practice answers and game answers in his account');
      await player.goto(`${BASE}#/progress`);
      await until(`My progress to show the same ${answeredBefore} questions answered`, async () => (await tileValue(player, 'Questions answered')) === answeredBefore);
      // The old team no longer lists him: the server at once, the captain's open page with its next refresh.
      const old = await call(`/api/teams/${teamId}`, { token: cara.token });
      if (old.members.some((m) => m.userId === ben.user.id)) throw new Error('the old team still lists the player');
      if ((await listed(cara)).includes(hisRoom)) throw new Error('the room he opened is still listed for the team he left');
      await members(captain).getByRole('heading', { name: 'Members (1)' }).waitFor({ timeout: 40000 });
      if (await members(captain).getByRole('cell', { name: 'Ben', exact: true }).count()) throw new Error("the old team's Team page still lists the player");
      note(`the captain's open Team page dropped him ${secondsSince(moved)} s after he moved, without a reload`);
      // His new team sees his practice in its stats, and his game answers on his progress page.
      const attempts = present(after).filter((r) => r.c === 'attempts');
      const solo = `${attempts.filter((r) => r.body.correct).length} / ${attempts.length}`;
      const newCaptain = await open('new captain', rex);
      await newCaptain.goto(`${BASE}#/stats`);
      await until(`the player's practice (${solo}) in his new team's stats`, async () => (await textOf(statsRow(newCaptain, 'Ben').locator('td').last())) === solo, 45000);
      await shot(newCaptain, 'team-4-new-team-stats');
      await statsRow(newCaptain, 'Ben').getByRole('link', { name: 'Ben', exact: true }).click();
      await newCaptain.getByRole('heading', { name: "Ben's progress" }).waitFor();
      await until(`his new team's view of his progress (${answeredBefore} questions answered)`, async () => (await tileValue(newCaptain, 'Questions answered')) === answeredBefore);
    });

    /* ---------------- leaving nothing behind ---------------- */

    await step('the captain deletes the team; every test account is deleted', async () => {
      await captain.goto(`${BASE}#/team`);
      await captain.getByRole('button', { name: 'Delete the team' }).click(); // the confirm is accepted
      await captain.getByRole('heading', { name: 'Start a team' }).waitFor({ timeout: 15000 });
      await refusedWith(404, 'the deleted team', call(`/api/teams/${teamId}`, { token: cara.token }));
      // Close the browsers first: their pages would go on asking the server about accounts that are gone.
      for (const context of contexts.splice(0)) await context.close();
      const problems = await deleteAccounts([cara, ben, olga, rex]);
      if (problems.length) throw new Error(problems.join('; '));
      for (const a of [cara, ben, olga, rex]) await refusedWith(401, `${a.name}'s deleted account`, call('/api/me', { token: a.token }));
    });
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    await browser.close();
    // Whatever an earlier failure left behind goes too (accounts already deleted are skipped).
    const left = await deleteAccounts([cara, ben, olga, rex]).catch((err) => [err.message]);
    if (left.length) {
      failures += 1;
      console.log(`\nCould not delete every test account: ${left.join('; ')}`);
    }
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
