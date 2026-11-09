/**
 * Lists the library's questions for Rebound's voice made on your own computer (scripts/voice/README.md): the words
 * each question is read with, exactly as the server reads them, and the name its recording goes under.
 *
 *   npx tsx scripts/voice/export-library.ts [--voice kokoro:af_heart] [--level hs|ms] [--sample 50] [--out voice/jobs.jsonl]
 *
 * --voice   The Kokoro voice, and optionally its speed (kokoro:af_heart@0.95). It is part of every recording's name.
 * --level   Only high school (hs) or middle school (ms) sets; both by default.
 * --sample  Only this many of the hardest questions to say (long science words, math, chemistry, reading guides),
 *           spread over the subjects: generate these first and listen to them.
 * --out     Where to write the list (one JSON object a line, after a first "meta" line).
 *
 * A recording's name is the server's (src/core/speech.ts, audioKey): a hash of the voice and the words. The same
 * question in the same voice always has the same name, so the server finds it; new words or another voice make a
 * new one. Questions with the same words share one recording.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Question, QuestionSet } from '../../src/core/schema';
import { audioKey, spokenFor } from '../../src/core/speech';
import { buildReading } from '../../src/lib/reading';

// The recording's name is hashed with Web Crypto, which older versions of Node keep out of the global scope.
if (!globalThis.crypto?.subtle) Object.assign(globalThis, { crypto: webcrypto });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIBRARY = join(ROOT, 'public', 'data', 'doe');

function option(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const voice = option('voice', 'kokoro:af_heart');
const level = option('level', 'all');
const sample = Number(option('sample', '0'));
const out = option('out', join('voice', 'jobs.jsonl'));
if (!/^kokoro:[a-z]{2}_[a-z0-9]+(@\d+(\.\d+)?)?$/.test(voice)) {
  console.error(`Unknown voice "${voice}": use kokoro:<voice>, or kokoro:<voice>@<speed> (for example kokoro:af_heart or kokoro:am_michael@0.95).`);
  process.exit(1);
}
if (!['all', 'hs', 'ms'].includes(level) || !Number.isInteger(sample) || sample < 0) {
  console.error('Use --level hs, ms or all, and --sample with a whole number.');
  process.exit(1);
}

interface Entry {
  q: Question;
  hardness: number;
}

/** How hard a question is to say: long words, math and chemistry, reading guides. */
function hardness(q: Question): number {
  const text = buildReading(q).text;
  const longWords = text.split(/\s+/).filter((w) => w.replace(/[^A-Za-z]/g, '').length >= 11).length;
  const guides = (text.match(/\[[^\]\n]+\]/g) ?? []).length;
  const symbols = (text.match(/[=+×÷^√∛π<>≤≥±→⇌°µΔθλαβγσω⁰-⁹⁺⁻₀-₉]/gu) ?? []).length;
  return longWords + 2 * guides + Math.min(symbols, 10);
}

const files = readdirSync(LIBRARY)
  .filter((f) => /^doe-(hs|ms)-\d+\.json$/.test(f) && (level === 'all' || f.startsWith(`doe-${level}-`)))
  .sort();
const entries: Entry[] = [];
for (const file of files) {
  const set = JSON.parse(readFileSync(join(LIBRARY, file), 'utf8')) as QuestionSet;
  for (const round of set.rounds) {
    for (const pair of round.pairs) {
      for (const q of [pair.tossup, pair.bonus]) if (q?.stem?.trim()) entries.push({ q, hardness: hardness(q) });
    }
  }
}

/** The hardest questions, taken in turn from each subject so every subject is heard. */
function hardest(list: Entry[], count: number): Entry[] {
  const bySubject = new Map<string, Entry[]>();
  for (const e of list) bySubject.set(e.q.subject, [...(bySubject.get(e.q.subject) ?? []), e]);
  const queues = [...bySubject.values()].map((l) => l.sort((a, b) => b.hardness - a.hardness));
  const picked: Entry[] = [];
  while (picked.length < count && queues.some((l) => l.length)) for (const l of queues) if (l.length && picked.length < count) picked.push(l.shift()!);
  return picked;
}

const chosen = sample > 0 ? hardest(entries, sample) : entries;
const jobs = new Map<string, { key: string; text: string; ids: string[] }>();
for (const { q } of chosen) {
  const text = spokenFor({ stem: q.stem, choices: q.choices });
  const key = await audioKey(voice, text);
  const job = jobs.get(key);
  if (job) job.ids.push(q.id);
  else jobs.set(key, { key, text, ids: [q.id] });
}

const chars = [...jobs.values()].reduce((n, j) => n + j.text.length, 0);
const meta = { voice, level, sample: sample || null, questions: chosen.length, recordings: jobs.size, chars, created: new Date().toISOString() };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, [JSON.stringify({ meta }), ...[...jobs.values()].map((j) => JSON.stringify(j))].join('\n') + '\n');
console.log(
  `${out}: ${jobs.size.toLocaleString()} recordings for ${chosen.length.toLocaleString()} questions from ${files.length} sets, ` +
    `${chars.toLocaleString()} characters (about ${(chars / 16 / 3600).toFixed(1)} hours of speech), voice ${voice}.`,
);
