/*
 * A stand-in for Rebound's published voice in the browser tests (scripts/voice/README.md, "6. Publish"): the site's
 * index of the recordings and the voice Workers, served to the test's pages without any network. Each recording is
 * silent, as long as e2e/voice-fixture.mts says, with the headers the real Workers send.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const HOSTS = ['https://voice-1.rebound.test', 'https://voice-2.rebound.test'];

/** The index and recordings for the fixture set; `unrecorded`: question ids left without a recording. */
function standInVoice({ unrecorded = [] } = {}) {
  const tsx = path.join(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const out = execFileSync(process.execPath, [tsx, path.join(__dirname, 'voice-fixture.mts'), JSON.stringify({ hosts: HOSTS, unrecorded })], {
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

/** Silent MPEG-1 Layer III frames (32 kbit/s, 32 kHz, mono), 36 ms each. */
function silentMp3(ms) {
  const frame = Buffer.alloc(144);
  Buffer.from([0xff, 0xfb, 0x18, 0xc0]).copy(frame);
  return Buffer.concat(new Array(Math.max(1, Math.round(ms / 36))).fill(frame));
}

/**
 * Serves the stand-in to every page of `context`. `reachable: false` makes the voice unreachable instead (the index
 * cannot be fetched), as on a device that is offline or whose network blocks the voice.
 */
async function useStandInVoice(context, voice, { reachable = true } = {}) {
  const served = [];
  await context.route('**/data/voice/index.json', (r) => (reachable ? r.fulfill({ json: voice.index }) : r.fulfill({ status: 404, body: 'Not found' })));
  await context.route('**/data/voice/doe-hs-99.json', (r) => r.fulfill({ json: voice.set }));
  for (const host of HOSTS) {
    await context.route(`${host}/**`, (r) => {
      const key = (/\/([0-9a-f]{40})\.mp3/.exec(r.request().url()) || [])[1];
      const ms = key && voice.lengths[key];
      served.push(r.request().url());
      if (!ms) return r.fulfill({ status: 404, body: 'Not found', headers: { 'Access-Control-Allow-Origin': '*' } });
      return r.fulfill({
        status: 200,
        body: silentMp3(ms),
        headers: { 'Content-Type': 'audio/mpeg', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=31536000, immutable' },
      });
    });
  }
  return served;
}

module.exports = { HOSTS, standInVoice, useStandInVoice };
