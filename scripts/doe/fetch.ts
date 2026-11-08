/**
 * Builds the manifest of one level's official DOE sample-question page and downloads every listed
 * PDF into .cache/doe/pdf/ (gitignored):
 *   --level hs (default)  "High School Sample Questions"   → scripts/doe/manifest.json
 *   --level ms            "Middle School Sample Questions" → scripts/doe/manifest-ms.json
 *
 *   npx tsx scripts/doe/fetch.ts [options]        (npm run data:fetch, npm run data:fetch:ms)
 *
 * Options (all paths are plain arguments; nothing in the download folder is ever executed):
 *   --level <hs|ms>      which page to read                   (default hs)
 *   --out <dir>          PDF cache folder                     (default .cache/doe/pdf)
 *   --manifest <file>    manifest to write                    (default scripts/doe/manifest.json, manifest-ms.json for ms)
 *   --log <file>         fetch log (JSON) to write            (default .cache/doe/fetch-log.json, fetch-log-ms.json for ms)
 *   --seed <dir>         copy already-downloaded PDFs from here before any network request
 *                        (default: the earlier research folder, when it exists)
 *   --no-seed            do not seed
 *   --links <tsv>        url<TAB>label list to cross-check the manifest against (optional)
 *   --page-html <file>   parse a saved copy of the page instead of fetching it
 *   --manifest-only      build the manifest but download nothing
 *   --limit <n>          download at most n PDFs in this run
 *   --delay <ms>         pause between requests (minimum and default 3000)
 *
 * Politeness: one request at a time, at least 3 s apart, a descriptive User-Agent, cached
 * files are never re-downloaded, and HTTP 403/429/5xx answers are recorded, followed by a
 * back-off; after 3 such answers in a row the run stops instead of hammering the server.
 */
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HS_PAGE_URL = 'https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/HS-Sample-Questions';
export const MS_PAGE_URL = 'https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/MS-Sample-Questions';
export const USER_AGENT = 'ReboundStudyImporter/0.1 (student NSB practice tool)';
const MIN_DELAY_MS = 3000;
const MAX_BLOCKS_IN_A_ROW = 3;
const REQUEST_TIMEOUT_MS = 120_000;

/** Folder where earlier research already saved some of the PDFs (only used when it exists). */
const RESEARCH_DIR = '/tmp/claude-0/-home-user/9c027786-268a-5678-a664-85e4e2994527/scratchpad/dl-official';

/** Years stated for the newer sets (verified against file names such as "2022-HS-1.pdf"). */
const KNOWN_YEARS: Record<number, string> = {
  10: '2016',
  11: '2017',
  12: '2018',
  13: '2019',
  14: '2019',
  15: '2020',
  16: '2021',
  17: '2022',
};

export type ManifestKind = 'round' | 'resource';
export type FetchLevel = 'HS' | 'MS';

export interface ManifestEntry {
  /** Sample set number (1-17), or the key of an unnumbered section of rounds ("sample-rounds"). */
  set: number | string;
  /** 1-based position among entries of the same kind within the set, in page order. */
  order: number;
  /** Link text on the official page, e.g. "Round 1" or "Sample Energy Questions". */
  label: string;
  kind: ManifestKind;
  /** Absolute URL of the PDF. */
  url: string;
  /** File name inside the PDF cache folder. */
  file: string;
  year?: string;
  /** The link printed on the page, when it points at another file than `url` (see `note`). */
  pageUrl?: string;
  /** Why the entry differs from the page, or what is odd about it. */
  note?: string;
}

export interface ManifestSet {
  /** Sample set number, or the key of an unnumbered section of rounds. */
  set: number | string;
  /** Heading text on the page, e.g. "Sample Questions Set 14" or "Sample Rounds". */
  heading?: string;
  year?: string;
  /** Where the year came from. */
  yearEvidence?: string;
  rounds: number;
  resources: number;
}

export interface Manifest {
  source: string;
  level: FetchLevel;
  /** Extra pages the main page linked to and that were scanned for PDFs. */
  subpages: string[];
  sets: ManifestSet[];
  entries: ManifestEntry[];
}

/** A link on the official page that points at the wrong file, and the file to use instead. */
export interface LinkFix {
  /** Sample set the link is listed under. */
  set: number;
  /** The link as printed on the page (absolute URL). */
  pageUrl: string;
  /** The file to download instead. */
  url: string;
  /** Why, with the evidence. */
  note: string;
}

/**
 * Checked by hand (2026-11-08): DOE's middle school page links Set 15 Round 7 to the high school file of
 * the same name. The middle school file exists next to the other Set 15 rounds (same naming, same upload
 * date, 10 Dec 2024) and is printed "Middle School / Set 7"; the high school file is HS Set 16 Round 7.
 */
const MS_LINK_FIXES: LinkFix[] = [
  {
    set: 15,
    pageUrl: 'https://science.osti.gov/-/media/wdts/nsb/pdf/HS-Sample-Questions/Sample-Set-16/Set-7-HS-2021.pdf',
    url: 'https://science.osti.gov/-/media/wdts/nsb/pdf/MS-Sample-Questions/Sample-Set-15/Set-7-MS-2021.pdf',
    note:
      'The page links Set 15 Round 7 to the high school file (HS Set 16 Round 7); the middle school file ' +
      'Set-7-MS-2021.pdf sits next to the other Set 15 rounds and is printed "Middle School / Set 7".',
  },
];

/** What differs between the high school and middle school pages. */
export interface LevelConfig {
  level: FetchLevel;
  page: string;
  /** Folder of the level's PDFs in DOE's media library. */
  folder: 'HS-Sample-Questions' | 'MS-Sample-Questions';
  /** Default manifest and fetch log, relative to the repository. */
  manifest: string;
  log: string;
  /** url<TAB>label list saved by earlier research, in the research folder. */
  linksFile: string;
  knownYears: Record<number, string>;
  /** Headings of sections of unnumbered rounds, and the key their entries get as `set`. */
  groups: { heading: RegExp; key: string }[];
  linkFixes: LinkFix[];
}

export const LEVELS: Record<FetchLevel, LevelConfig> = {
  HS: {
    level: 'HS',
    page: HS_PAGE_URL,
    folder: 'HS-Sample-Questions',
    manifest: 'scripts/doe/manifest.json',
    log: '.cache/doe/fetch-log.json',
    linksFile: 'HS_links.tsv',
    knownYears: KNOWN_YEARS,
    groups: [],
    linkFixes: [],
  },
  MS: {
    level: 'MS',
    page: MS_PAGE_URL,
    folder: 'MS-Sample-Questions',
    manifest: 'scripts/doe/manifest-ms.json',
    log: '.cache/doe/fetch-log-ms.json',
    linksFile: 'MS_links.tsv',
    // Sets 1-13 have a year in the page's table of contents; 14-16 in their file names (2020-MS-Rd1.pdf).
    knownYears: {},
    groups: [{ heading: /^Sample\s+Rounds$/i, key: 'sample-rounds' }],
    linkFixes: MS_LINK_FIXES,
  },
};

interface FetchResult {
  url: string;
  file: string;
  status: 'cached' | 'seeded' | 'downloaded' | 'failed' | 'skipped';
  http?: number;
  bytes?: number;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* HTML helpers (pure)                                                 */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', reg: '®', ndash: '–', mdash: '—' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/[\s\u00a0]+/g, ' ').trim();
}

interface Link {
  href: string;
  text: string;
  index: number;
}

export function extractLinks(html: string, baseUrl: string): Link[] {
  const links: Link[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1]);
    if (!href) continue;
    const raw = decodeEntities((href[1] ?? href[2] ?? href[3] ?? '').trim());
    if (!raw || raw.startsWith('#') || /^(mailto|javascript):/i.test(raw)) continue;
    let abs: string;
    try {
      abs = new URL(raw, baseUrl).toString();
    } catch {
      continue;
    }
    links.push({ href: abs, text: htmlToText(m[2]), index: m.index });
  }
  return links;
}

/** The part of the page that holds the article (falls back to the whole page). */
export function mainContent(html: string): string {
  const start = html.search(/<article\b[^>]*class="[^"]*main-content/i);
  if (start < 0) return html;
  const end = html.indexOf('</article>', start);
  return end < 0 ? html.slice(start) : html.slice(start, end);
}

/** "Sample Questions Set 1 (from 2009)" in the page's table of contents. */
export function yearsFromToc(html: string): Map<number, string> {
  const years = new Map<number, string>();
  const text = htmlToText(html);
  const re = /Sample\s+Questions?\s+Set\s+(\d+)\s*\(\s*from\s+((?:19|20)\d\d)/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) years.set(Number(m[1]), m[2]);
  return years;
}

/**
 * Years in the middle school page's table of contents, which is written less regularly:
 * "Sample Questions Set 1 (from 2009)", "Sample Questions 10 (from 2016)", "Sample Questions12* (from 2018)".
 * Keeps the text as printed, for the manifest's evidence.
 */
export function tocYearsLenient(html: string): Map<number, { year: string; text: string }> {
  const years = new Map<number, { year: string; text: string }>();
  const text = htmlToText(html);
  const re = /Sample\s+Questions?\s*(?:Set\s*)?(\d+)\s*\**\s*\(\s*from\s+((?:19|20)\d\d)\s*\)/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) if (!years.has(Number(m[1]))) years.set(Number(m[1]), { year: m[2], text: m[0] });
  return years;
}

/**
 * Headings such as `<a name="set14"><strong>Sample Questions Set 14*</strong></a>`, by position; with
 * `groups`, also headings of unnumbered sections such as `<a name="sr">Sample Rounds</a>`.
 */
function setHeadings(html: string, groups: LevelConfig['groups'] = []): { index: number; set: number | string; text: string }[] {
  const out: { index: number; set: number | string; text: string }[] = [];
  const re = /<a\b[^>]*\bname\s*=\s*["'][^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const text = htmlToText(m[1]).replace(/\*+$/, '').trim();
    const n = /Set\s+(\d+)/i.exec(text);
    const group = groups.find((g) => g.heading.test(text));
    if (n) out.push({ index: m.index, set: Number(n[1]), text });
    else if (group) out.push({ index: m.index, set: group.key, text });
  }
  return out;
}

export function cacheFileName(url: string): string {
  const u = new URL(url);
  const p = decodeURIComponent(u.pathname);
  const marker = '/pdf/';
  const at = p.toLowerCase().indexOf(marker);
  const rel = at >= 0 ? p.slice(at + marker.length) : p.replace(/^\/+/, '');
  return rel.replace(/[\\/]+/g, '_').replace(/[^A-Za-z0-9._-]+/g, '_');
}

/** "Round 1", "Round 17A", and the tournament rounds of the middle school page ("Round Robin Round 2", "Double Elimination Round 1"). */
const ROUND_LABEL = /^(?:(?:round\s+robin|double\s+elimination|single\s+elimination)\s+)?round\s+\d+\s*[a-z]?$/i;

interface PageLink {
  set: number | string;
  label: string;
  url: string;
  heading?: string;
  pageUrl?: string;
  note?: string;
}

/** Collect the PDF links of one page (main content only), assigning each to a sample set. */
export function pdfLinksOfPage(html: string, pageUrl: string, cfg: LevelConfig = LEVELS.HS): PageLink[] {
  const content = mainContent(html);
  const headings = setHeadings(content, cfg.groups);
  const inFolder = new RegExp(`/${cfg.folder}/Sample-Set-(\\d+)/`, 'i');
  const out: PageLink[] = [];
  for (const link of extractLinks(content, pageUrl)) {
    if (!/\.pdf(?:$|[?#])/i.test(link.href)) continue;
    const fromUrl = inFolder.exec(link.href);
    const heading = [...headings].reverse().find((h) => h.index < link.index);
    const set = fromUrl ? Number(fromUrl[1]) : heading?.set;
    if (!set) continue;
    const item: PageLink = { set, label: link.text.replace(/\s+/g, ' ').trim(), url: link.href, heading: headings.find((h) => h.set === set)?.text };
    const fix = cfg.linkFixes.find((f) => f.pageUrl === link.href && f.set === set);
    if (fix) Object.assign(item, { url: fix.url, pageUrl: link.href, note: fix.note });
    else if (!new RegExp(`/${cfg.folder}/`, 'i').test(link.href)) item.note = `links outside the ${cfg.folder} folder`;
    out.push(item);
  }
  return out;
}

/** Links from the main content to deeper pages below the sample-questions page. */
export function subpageLinks(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const prefix = base.pathname.replace(/\/+$/, '').toLowerCase() + '/';
  const seen = new Set<string>();
  for (const link of extractLinks(mainContent(html), pageUrl)) {
    const u = new URL(link.href);
    if (u.host !== base.host || /\.pdf$/i.test(u.pathname)) continue;
    if (!u.pathname.toLowerCase().startsWith(prefix)) continue;
    u.hash = '';
    seen.add(u.toString());
  }
  return [...seen].sort();
}

/** Numbered sets in order, then unnumbered sections in page order. */
function compareSets(order: (number | string)[]) {
  return (a: number | string, b: number | string) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'number') return -1;
    if (typeof b === 'number') return 1;
    return order.indexOf(a) - order.indexOf(b);
  };
}

/**
 * `tocYears`: the years in the page's table of contents (yearsFromToc for the high school page,
 * tocYearsLenient for the middle school page, whose evidence quotes the printed text).
 */
export function buildManifest(
  pages: { url: string; html: string }[],
  tocYears: Map<number, string> | Map<number, { year: string; text: string }>,
  cfg: LevelConfig = LEVELS.HS,
): Manifest {
  const bySet = new Map<number | string, PageLink[]>();
  const seenUrls = new Set<string>();
  for (const page of pages) {
    for (const link of pdfLinksOfPage(page.html, page.url, cfg)) {
      if (seenUrls.has(link.url)) continue;
      seenUrls.add(link.url);
      const list = bySet.get(link.set) ?? [];
      list.push(link);
      bySet.set(link.set, list);
    }
  }
  const tocYear = (set: number | string) => {
    const t = typeof set === 'number' ? tocYears.get(set) : undefined;
    return typeof t === 'string' ? { year: t, text: `Sample Questions Set ${set} (from ${t})` } : t;
  };
  const filePrefix = new RegExp(`^${cfg.folder}_Sample-Set-\\d+_`, cfg.level === 'HS' ? '' : 'i');
  const entries: ManifestEntry[] = [];
  const sets: ManifestSet[] = [];
  for (const set of [...bySet.keys()].sort(compareSets([...bySet.keys()]))) {
    const links = bySet.get(set)!;
    let year: string | undefined;
    let yearEvidence: string | undefined;
    const fileYears = new Set(
      links.map((l) => /(?:^|[^0-9])((?:19|20)\d\d)(?:[^0-9]|$)/.exec(cacheFileName(l.url).replace(filePrefix, ''))?.[1]).filter(Boolean),
    );
    const known = typeof set === 'number' ? cfg.knownYears[set] : undefined;
    const toc = tocYear(set);
    if (known) {
      year = known;
      const agree = [
        fileYears.size === 1 && fileYears.has(year) ? 'file names' : '',
        toc?.year === year ? `page text "${toc.text}"` : '',
      ].filter(Boolean);
      yearEvidence = agree.length ? `known year; matches ${agree.join(' and ')}` : 'known year (project brief)';
    } else if (toc) {
      year = toc.year;
      yearEvidence = `page text "${toc.text}"`;
      // The high school manifest only ever quoted the page; the middle school one also compares the file names.
      if (cfg.level !== 'HS' && fileYears.size) {
        yearEvidence += fileYears.size === 1 && fileYears.has(year) ? '; matches file names' : `; file names say ${[...fileYears].sort().join(', ')}`;
      }
    } else if (fileYears.size === 1) {
      year = [...fileYears][0];
      yearEvidence = 'file names';
    }
    let rounds = 0;
    let resources = 0;
    for (const link of links) {
      const kind: ManifestKind = ROUND_LABEL.test(link.label) ? 'round' : 'resource';
      const order = kind === 'round' ? ++rounds : ++resources;
      entries.push({
        set,
        order,
        label: link.label,
        kind,
        url: link.url,
        file: cacheFileName(link.url),
        ...(year ? { year } : {}),
        ...(link.pageUrl ? { pageUrl: link.pageUrl } : {}),
        ...(link.note ? { note: link.note } : {}),
      });
    }
    sets.push({ set, heading: links[0]?.heading, ...(year ? { year, yearEvidence } : {}), rounds, resources });
  }
  return { source: cfg.page, level: cfg.level, subpages: pages.slice(1).map((p) => p.url), sets, entries };
}

/* ------------------------------------------------------------------ */
/* Network                                                             */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;

async function politeGet(url: string, delayMs: number): Promise<{ status: number; body: Uint8Array; retryAfter?: number; error?: string }> {
  const wait = lastRequestAt + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf,text/html;q=0.9,*/*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = new Uint8Array(await res.arrayBuffer());
    const ra = Number(res.headers.get('retry-after'));
    return { status: res.status, body, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : undefined };
  } catch (err) {
    return { status: 0, body: new Uint8Array(), error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  } finally {
    lastRequestAt = Date.now();
  }
}

const isBlocking = (status: number) => status === 403 || status === 429 || status >= 500 || status === 0;

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
}

async function isCachedPdf(file: string): Promise<boolean> {
  try {
    const s = await stat(file);
    if (!s.isFile() || s.size < 100) return false;
    return isPdf(new Uint8Array((await readFile(file)).subarray(0, 8)));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

interface Options {
  level: FetchLevel;
  out: string;
  manifest: string;
  log: string;
  seed?: string;
  links?: string;
  pageHtml?: string;
  manifestOnly: boolean;
  limit: number;
  delay: number;
}

function parseLevel(v: string): FetchLevel {
  const level = v.toUpperCase();
  if (level !== 'HS' && level !== 'MS') throw new Error(`unknown level ${v} (use hs or ms)`);
  return level;
}

function parseOptions(argv: string[], root: string): Options {
  // The level decides the defaults, so read it first.
  const at = argv.indexOf('--level');
  const level = at >= 0 && argv[at + 1] !== undefined ? parseLevel(argv[at + 1]) : 'HS';
  const cfg = LEVELS[level];
  const opts: Options = {
    level,
    out: path.join(root, '.cache/doe/pdf'),
    manifest: path.join(root, cfg.manifest),
    log: path.join(root, cfg.log),
    seed: existsSync(path.join(RESEARCH_DIR, 'samples')) ? path.join(RESEARCH_DIR, 'samples') : undefined,
    links: existsSync(path.join(RESEARCH_DIR, cfg.linksFile)) ? path.join(RESEARCH_DIR, cfg.linksFile) : undefined,
    manifestOnly: false,
    limit: Infinity,
    delay: MIN_DELAY_MS,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    if (a === '--level') next();
    else if (a === '--out') opts.out = path.resolve(next());
    else if (a === '--manifest') opts.manifest = path.resolve(next());
    else if (a === '--log') opts.log = path.resolve(next());
    else if (a === '--seed') opts.seed = path.resolve(next());
    else if (a === '--no-seed') opts.seed = undefined;
    else if (a === '--links') opts.links = path.resolve(next());
    else if (a === '--page-html') opts.pageHtml = path.resolve(next());
    else if (a === '--manifest-only') opts.manifestOnly = true;
    else if (a === '--limit') opts.limit = Math.max(0, Number(next()));
    else if (a === '--delay') opts.delay = Math.max(MIN_DELAY_MS, Number(next()) || MIN_DELAY_MS);
    else throw new Error(`unknown option ${a}`);
  }
  if (argv.includes('--level') && at + 1 >= argv.length) throw new Error('missing value for --level');
  return opts;
}

/** Copy valid PDFs of one level ("HS-Sample-Questions_*.pdf") saved by earlier research into the cache (never overwrites). */
async function seedCache(seedDir: string, outDir: string, folder: LevelConfig['folder']): Promise<{ copied: string[]; rejected: string[] }> {
  const copied: string[] = [];
  const rejected: string[] = [];
  const mine = new RegExp(`^${folder}_.*\\.pdf$`, 'i');
  for (const name of (await readdir(seedDir)).sort()) {
    if (!mine.test(name)) continue; // skips .hdr files and the other level's files
    const dest = path.join(outDir, name.replace(/[^A-Za-z0-9._-]+/g, '_'));
    if (await isCachedPdf(dest)) continue;
    if (!(await isCachedPdf(path.join(seedDir, name)))) {
      rejected.push(name); // e.g. an HTML error page saved under a .pdf name
      continue;
    }
    await copyFile(path.join(seedDir, name), dest);
    copied.push(name);
  }
  return { copied, rejected };
}

async function crossCheck(manifest: Manifest, tsvFile: string) {
  const rows = (await readFile(tsvFile, 'utf8'))
    .split(/\r?\n/)
    .map((l) => l.split('\t'))
    .filter((r) => /\.pdf$/i.test(r[0] ?? ''));
  const listed = new Map(rows.map((r) => [r[0].trim(), (r[1] ?? '').trim()]));
  // Compare with the links as printed on the page (an entry whose link was corrected keeps it in `pageUrl`).
  const inManifest = new Map(manifest.entries.map((e) => [e.pageUrl ?? e.url, e.label]));
  const missingFromManifest = [...listed.keys()].filter((u) => !inManifest.has(u)).sort();
  const notInList = [...inManifest.keys()].filter((u) => !listed.has(u)).sort();
  const labelDiffs = [...listed.entries()]
    .filter(([u, l]) => inManifest.has(u) && inManifest.get(u) !== l)
    .map(([u, l]) => `${u}: list "${l}" vs page "${inManifest.get(u)}"`);
  return { listFile: tsvFile, listed: listed.size, manifest: inManifest.size, missingFromManifest, notInList, labelDiffs };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const opts = parseOptions(process.argv.slice(2), root);
  const cfg = LEVELS[opts.level];
  const pageUrl = cfg.page;
  await mkdir(opts.out, { recursive: true });
  await mkdir(path.dirname(opts.log), { recursive: true });
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  // 1. Seed the cache before any network request.
  let seed: { copied: string[]; rejected: string[] } = { copied: [], rejected: [] };
  if (opts.seed && existsSync(opts.seed)) {
    seed = await seedCache(opts.seed, opts.out, cfg.folder);
    console.log(`seeded ${seed.copied.length} PDF(s) from ${opts.seed}; rejected ${seed.rejected.length} non-PDF file(s)`);
  }

  // 2. Read the official page (and any sample-question subpages it links).
  const pages: { url: string; html: string }[] = [];
  let pageStatus: string;
  let pageBlocked = false;
  if (opts.pageHtml) {
    pages.push({ url: pageUrl, html: await readFile(opts.pageHtml, 'utf8') });
    pageStatus = `read from ${opts.pageHtml}`;
  } else {
    const res = await politeGet(pageUrl, opts.delay);
    pageStatus = `HTTP ${res.status}${res.error ? ` (${res.error})` : ''}`;
    pageBlocked = isBlocking(res.status);
    if (res.status !== 200) {
      if (existsSync(opts.manifest)) {
        console.warn(`could not load ${pageUrl} (${pageStatus}); keeping the existing manifest`);
      } else {
        throw new Error(`could not load ${pageUrl} (${pageStatus}) and no manifest exists yet`);
      }
    } else {
      pages.push({ url: pageUrl, html: new TextDecoder().decode(res.body) });
      for (const sub of subpageLinks(pages[0].html, pageUrl)) {
        const r = await politeGet(sub, opts.delay);
        if (r.status === 200) pages.push({ url: sub, html: new TextDecoder().decode(r.body) });
        else console.warn(`subpage ${sub}: HTTP ${r.status}`);
      }
    }
  }

  let manifest: Manifest;
  if (pages.length) {
    manifest = buildManifest(pages, opts.level === 'HS' ? yearsFromToc(pages[0].html) : tocYearsLenient(pages[0].html), cfg);
    if (!manifest.entries.length) throw new Error('no PDF links found on the page; the page layout may have changed');
    for (const e of manifest.entries.filter((x) => x.note)) console.warn(`  note: set ${e.set} ${e.label}: ${e.note}`);
    await writeFile(opts.manifest, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`manifest: ${manifest.entries.length} PDFs (${manifest.entries.filter((e) => e.kind === 'round').length} rounds) in ${manifest.sets.length} sets -> ${path.relative(root, opts.manifest)}`);
  } else {
    manifest = JSON.parse(await readFile(opts.manifest, 'utf8')) as Manifest;
  }

  const check = opts.links && existsSync(opts.links) ? await crossCheck(manifest, opts.links) : undefined;
  if (check) {
    console.log(`cross-check with ${check.listFile}: ${check.listed} listed, ${check.manifest} in manifest, ` +
      `${check.missingFromManifest.length} missing from manifest, ${check.notInList.length} not in list, ${check.labelDiffs.length} label differences`);
    for (const u of check.missingFromManifest) console.log(`  missing from manifest: ${u}`);
    for (const u of check.notInList) console.log(`  not in list: ${u}`);
  }

  // 3. Download what is not cached yet.
  const results: FetchResult[] = [];
  let downloads = 0;
  // A blocked page request counts towards the back-off before the first download.
  let blocksInARow = pageBlocked ? 1 : 0;
  let backoffBeforeNext = pageBlocked;
  let stopReason: string | undefined;
  for (const entry of manifest.entries) {
    const dest = path.join(opts.out, entry.file);
    if (await isCachedPdf(dest)) {
      results.push({ url: entry.url, file: entry.file, status: seed.copied.includes(entry.file) ? 'seeded' : 'cached' });
      continue;
    }
    if (opts.manifestOnly || stopReason || downloads >= opts.limit) {
      results.push({ url: entry.url, file: entry.file, status: 'skipped', error: stopReason ?? (opts.manifestOnly ? 'manifest only' : 'download limit reached') });
      continue;
    }
    downloads++;
    if (backoffBeforeNext) {
      backoffBeforeNext = false;
      console.warn('  the page request was blocked; backing off 30s before downloading');
      await sleep(30_000);
    }
    let res = await politeGet(entry.url, opts.delay);
    if ((res.status === 429 || res.status === 503) && res.retryAfter && res.retryAfter <= 300) {
      console.warn(`  ${entry.file}: HTTP ${res.status}; waiting ${res.retryAfter}s as asked, then one retry`);
      await sleep(res.retryAfter * 1000);
      res = await politeGet(entry.url, opts.delay);
    }
    if (res.status === 200 && isPdf(res.body)) {
      await writeFile(dest + '.part', res.body);
      await rename(dest + '.part', dest);
      blocksInARow = 0;
      results.push({ url: entry.url, file: entry.file, status: 'downloaded', http: 200, bytes: res.body.length });
      console.log(`  downloaded ${entry.file} (${res.body.length} bytes)`);
      continue;
    }
    const error = res.error ?? (res.status === 200 ? 'response is not a PDF' : `HTTP ${res.status}`);
    results.push({ url: entry.url, file: entry.file, status: 'failed', http: res.status || undefined, error });
    console.warn(`  FAILED ${entry.file}: ${error}`);
    if (isBlocking(res.status)) {
      blocksInARow++;
      if (blocksInARow >= MAX_BLOCKS_IN_A_ROW) {
        stopReason = `stopped after ${blocksInARow} blocked/failed requests in a row`;
        console.warn(stopReason);
      } else {
        const backoff = Math.min(300, 30 * 2 ** (blocksInARow - 1));
        console.warn(`  backing off ${backoff}s`);
        await sleep(backoff * 1000);
      }
    }
  }

  const count = (s: FetchResult['status']) => results.filter((r) => r.status === s).length;
  const totals = { entries: results.length, cached: count('cached'), seeded: count('seeded'), downloaded: count('downloaded'), failed: count('failed'), skipped: count('skipped') };
  // Keep a short history so a later run that finds everything cached does not hide earlier downloads.
  let history: { startedAt: string; seconds: number; totals: typeof totals }[] = [];
  try {
    const previous = JSON.parse(await readFile(opts.log, 'utf8'));
    history = Array.isArray(previous.history) ? previous.history : [];
  } catch {
    // no previous log
  }
  const seconds = Math.round((Date.now() - t0) / 1000);
  history = [...history, { startedAt, seconds, totals }].slice(-10);
  const log = {
    startedAt,
    finishedAt: new Date().toISOString(),
    seconds,
    level: opts.level,
    page: pageUrl,
    pageStatus,
    userAgent: USER_AGENT,
    delayMs: opts.delay,
    seeded: seed.copied,
    seedRejected: seed.rejected,
    crossCheck: check,
    stopReason,
    totals,
    history,
    results,
  };
  await writeFile(opts.log, JSON.stringify(log, null, 2) + '\n');
  console.log(`done in ${log.seconds}s: ${JSON.stringify(log.totals)}; log -> ${path.relative(root, opts.log)}`);
  if (count('failed')) process.exitCode = 2;
}

/**
 * Node's built-in fetch() ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 is set at start-up
 * (Node >= 22.21). When a proxy is configured, run this script again with that switch.
 */
function needsProxyRelaunch(): boolean {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  return Boolean(proxy) && process.env.NODE_USE_ENV_PROXY !== '1';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (needsProxyRelaunch()) {
    const r = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...process.execArgv, ...process.argv.slice(1)], {
      stdio: 'inherit',
      env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
    });
    process.exit(r.status ?? 1);
  }
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
