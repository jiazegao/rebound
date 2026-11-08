/**
 * Writes public/data/doe/fingerprints.json: a SimHash fingerprint for every library question (stem,
 * choices and answer), both levels, so the question-writing studio can warn about near-duplicates without
 * downloading the whole library. Run it after rebuilding the library data:
 *
 *   npx tsx scripts/studio/fingerprints.ts        (npm run data:fingerprints)
 *
 * The output has no timestamp, so re-running it on the same data changes nothing, and a test
 * (fingerprints.test.ts) fails when the file is out of date.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { questionText, simhash } from '../../src/core/fingerprint';
import type { LibraryIndex, QuestionSet } from '../../src/core/schema';

export const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/data/doe');

/** The file's text for the library in `dir`, in index order. */
export async function fingerprintFile(dir = DATA_DIR): Promise<{ text: string; count: number }> {
  const index = JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8')) as LibraryIndex;
  const items: Array<[string, string]> = [];
  for (const summary of index.sets) {
    const set = JSON.parse(await readFile(path.join(dir, summary.file), 'utf8')) as QuestionSet;
    for (const round of set.rounds) {
      for (const pair of round.pairs) {
        for (const q of [pair.tossup, pair.bonus]) if (q) items.push([q.id, simhash(questionText(q))]);
      }
    }
  }
  return { text: `{"count":${items.length},"items":[${items.map(([id, fp]) => `["${id}","${fp}"]`).join(',')}]}\n`, count: items.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { text, count } = await fingerprintFile();
  await writeFile(path.join(DATA_DIR, 'fingerprints.json'), text);
  console.log(`Wrote ${count} fingerprints (${Math.round(text.length / 1024)} KB) to public/data/doe/fingerprints.json`);
}
