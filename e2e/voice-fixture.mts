/**
 * A stand-in for Rebound's published voice (scripts/voice/publish.py), for the browser tests: the site's index and the
 * fixture set's list of recordings, named as the site names them, each a silent recording about as long as a voice
 * would take. Printed as JSON; e2e/voice.cjs serves it.
 *
 *   npx tsx e2e/voice-fixture.mts '{"hosts": ["https://voice-1.rebound.test"], "unrecorded": ["doe-hs-99-r01-b01"]}'
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audioKey, RECORDED_VOICE, spokenFor, VOICE_SAMPLE } from '../src/core/speech';
import type { QuestionSet } from '../src/core/schema';

const here = dirname(fileURLToPath(import.meta.url));
const { hosts, unrecorded = [] } = JSON.parse(process.argv[2] ?? '{}') as { hosts: string[]; unrecorded?: string[] };
const set = JSON.parse(readFileSync(join(here, 'fixture-set.json'), 'utf8')) as QuestionSet;
/** A silent recording's length: whole 36 ms frames (e2e/voice.cjs makes them), about 15 characters a second. */
const lengthOf = (text: string) => Math.max(1, Math.round(((text.length / 15) * 1000) / 36)) * 36;
const fingerprint = (key: string) => key.slice(-8);

const recordings: Record<string, [number, string]> = {};
const lengths: Record<string, number> = {};
let questions = 0;
for (const round of set.rounds) {
  for (const pair of round.pairs) {
    for (const q of [pair.tossup, pair.bonus]) {
      if (!q?.stem?.trim()) continue;
      questions += 1;
      if (unrecorded.includes(q.id)) continue;
      const text = spokenFor({ stem: q.stem, choices: q.choices });
      const key = await audioKey(RECORDED_VOICE, text);
      recordings[key] = [lengthOf(text), fingerprint(key)];
      lengths[key] = lengthOf(text);
    }
  }
}
const sampleText = spokenFor({ stem: VOICE_SAMPLE });
const sampleKey = await audioKey(RECORDED_VOICE, sampleText);
lengths[sampleKey] = lengthOf(sampleText);
const index = {
  voice: RECORDED_VOICE,
  hosts,
  recordings: Object.keys(lengths).length,
  questions,
  sample: { key: sampleKey, ms: lengths[sampleKey], v: fingerprint(sampleKey) },
  sets: { [set.id]: Object.keys(recordings).length },
};
process.stdout.write(JSON.stringify({ index, set: recordings, lengths }));
