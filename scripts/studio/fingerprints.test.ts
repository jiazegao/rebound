import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_DIR, fingerprintFile } from './fingerprints';

describe('library fingerprints', () => {
  it('public/data/doe/fingerprints.json matches the library (if not, run npm run data:fingerprints)', async () => {
    const { text } = await fingerprintFile();
    // Compared as a boolean: printing a 500 KB diff helps nobody.
    expect(readFileSync(path.join(DATA_DIR, 'fingerprints.json'), 'utf8') === text).toBe(true);
  }, 30_000);
});
