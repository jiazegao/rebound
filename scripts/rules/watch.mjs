/**
 * Has DOE posted next season's NSB rules? Run weekly in the fall by .github/workflows/rules-watch.yml.
 *
 * It reads the current season from src/core/rules/presets.ts, then (politely: a few requests, 3 s apart) looks
 * for next season's rulebook PDF and for a link to it on DOE's NSB pages. DOE's site sometimes refuses
 * automated requests, so from October 1 before the season it also asks for a reminder issue regardless.
 *
 * Writes GitHub Actions outputs (`action`: open or none, `title`, `found`) and the issue body to
 * rules-issue.md. Run locally with `node scripts/rules/watch.mjs`.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const USER_AGENT = 'ReboundRulesWatch/1.0 (+https://github.com/jiazegao/rebound; student NSB practice tool)';
const PDF_BASE = 'https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources';
const PAGES = ['https://science.osti.gov/wdts/nsb', 'https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/Tips-and-Resources'];

const presets = readFileSync(new URL('../../src/core/rules/presets.ts', import.meta.url), 'utf8');
const season = Number(/CURRENT_SEASON = '(\d{4})'/.exec(presets)?.[1]);
if (!season) throw new Error('CURRENT_SEASON not found in src/core/rules/presets.ts');
const next = season + 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 'yes', 'no' or 'blocked' (refused, failed or unreachable). */
async function pdfExists(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Range: 'bytes=0-1023', Accept: 'application/pdf' }, redirect: 'follow' });
    await res.body?.cancel();
    if (res.status === 404) return 'no';
    if ((res.status === 200 || res.status === 206) && /pdf/i.test(res.headers.get('content-type') ?? '')) return 'yes';
    return res.ok ? 'no' : 'blocked';
  } catch {
    return 'blocked';
  }
}

/** Links on a page that mention next season's rules, or null if the page could not be read. */
async function linksOn(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } });
    if (!res.ok) return null;
    const html = await res.text();
    const links = [...html.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
    return links.filter((h) => new RegExp(`rules[^"]*${next}|${next}[^"]*rules`, 'i').test(h)).map((h) => new URL(h, url).href);
  } catch {
    return null;
  }
}

const found = [];
let blocked = 0;
const pdf = `${PDF_BASE}/Rules${next}.pdf`;
const pdfStatus = await pdfExists(pdf);
if (pdfStatus === 'yes') found.push(pdf);
if (pdfStatus === 'blocked') blocked++;
for (const page of PAGES) {
  await sleep(3000);
  const links = await linksOn(page);
  if (links === null) blocked++;
  else found.push(...links);
}
const unique = [...new Set(found)];
const now = new Date();
const remindFrom = new Date(Date.UTC(next - 1, 9, 1)); // October 1 before the season
const action = unique.length > 0 || now >= remindFrom ? 'open' : 'none';
const title = `Rules update for the ${next} season`;

const body = `${
  unique.length
    ? `DOE appears to have posted the ${next} National Science Bowl rules:\n\n${unique.map((u) => `- ${u}`).join('\n')}\n`
    : `It is time to check whether DOE has posted the ${next} National Science Bowl rules (this check could ${blocked ? 'not reach every DOE page' : 'not find them yet'}). Look on https://science.osti.gov/wdts/nsb and expect a file like ${pdf}.\n`
}
Follow "New rules each season" in MAINTAINING.md:

- [ ] Read the new rulebook (in person and virtual) and list what changed from ${season}: points, clocks, timing windows, tiebreakers, challenge limits, the answer conventions in Appendix A, and the subject categories.
- [ ] Add \`doe-regional-${next}\`, \`doe-virtual-${next}\`, \`doe-finals-${next}\` and \`doe-finals-visual-${next}\` to \`src/core/rules/presets.ts\` (copy the ${season} ones, change what changed, update rule references), and keep the ${season} presets.
- [ ] Set \`CURRENT_SEASON\`, \`CURRENT_PRESET_IDS\` and \`CURRENT_RULES_URL\` to the new season; move the variant presets (\`invitational-neg4\`, \`practice-untimed\`) to season ${next}.
- [ ] If answer conventions changed, update \`src/core/judge/\` and its tests; if categories changed, \`src/core/importers/doeSubjects.ts\`.
- [ ] Update the engine tests and \`e2e/smoke.cjs\` for any changed numbers; run \`npm test\` and the browser smoke test (\`node e2e/smoke.cjs\` against \`npx vite preview --port 4173\`; see its header).
- [ ] Check the Rules page and the Reader console, then merge to main (the site deploys itself).
`;

writeFileSync('rules-issue.md', body);
const out = process.env.GITHUB_OUTPUT;
if (out) appendFileSync(out, `action=${action}\ntitle=${title}\nfound=${unique.length > 0}\n`);
console.log(JSON.stringify({ season, next, found: unique, blocked, action, title }, null, 2));
