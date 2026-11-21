import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioKey, RECORDED_VOICE, spokenFor, VOICE_SAMPLE } from '../core/speech';
import type { LibraryIndex, QuestionSet } from '../core/schema';
import { hostOf, lookupRecording, recordingFor, recordingUrl, resetVoiceForTests, usableIndex, type VoiceIndex } from './voice';

const HOSTS = ['https://rebound-voice-1.example.workers.dev', 'https://rebound-voice-2.example.workers.dev'];

describe('where a recording is', () => {
  it('goes to a Worker by the first character of its name, as publish.py puts it there', () => {
    // The same cases as scripts/voice/test_publish.py (Names.test_which_worker).
    expect([...'0123456789abcdef'].map((c) => hostOf(c.repeat(40), 2))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect([...'056abf'].map((c) => hostOf(c.repeat(40), 3))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(hostOf('f'.repeat(40), 1)).toBe(0);
  });

  it('carries the file’s fingerprint, so a recording made again has a new address', () => {
    expect(recordingUrl({ hosts: HOSTS }, { key: `9${'0'.repeat(39)}`, v: 'a1b2c3d4' })).toBe(`${HOSTS[1]}/9${'0'.repeat(39)}.mp3?v=a1b2c3d4`);
    expect(recordingUrl({ hosts: HOSTS }, { key: `7${'0'.repeat(39)}`, v: '00000000' })).toBe(`${HOSTS[0]}/7${'0'.repeat(39)}.mp3?v=00000000`);
  });

  it('takes an index only for this voice, with addresses and a sample line', () => {
    const good = { voice: RECORDED_VOICE, hosts: HOSTS, recordings: 2, questions: 1, sample: { key: 'a'.repeat(40), ms: 4000, v: '12345678' }, sets: {} };
    expect(usableIndex(good)).toEqual(good);
    expect(usableIndex({ ...good, voice: 'kokoro:am_michael' })).toBeNull();
    expect(usableIndex({ ...good, hosts: [] })).toBeNull();
    expect(usableIndex({ ...good, hosts: ['javascript:alert(1)'] })).toBeNull();
    expect(usableIndex({ ...good, hosts: ['https://a.example/path'] })).toBeNull();
    expect(usableIndex({ ...good, sample: { key: 'nope', ms: 1, v: '1' } })).toBeNull();
    expect(usableIndex(null)).toBeNull();
  });
});

describe('a question’s recording', () => {
  const q = { id: 'doe-hs-01-r01-t01', stem: 'What organelle makes ATP?' };
  let key = '';
  let index: VoiceIndex;
  let files: Record<string, unknown>;

  beforeEach(async () => {
    resetVoiceForTests();
    key = await audioKey(RECORDED_VOICE, spokenFor(q));
    index = { voice: RECORDED_VOICE, hosts: HOSTS, recordings: 2, questions: 1, sample: { key: 'a'.repeat(40), ms: 4000, v: '12345678' }, sets: { 'doe-hs-01': 1 } };
    files = { 'data/voice/index.json': index, 'data/voice/doe-hs-01.json': { [key]: [1750, 'a1b2c3d4'] } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url in files ? Response.json(files[url]) : new Response('Not found', { status: 404 }))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetVoiceForTests();
  });

  it('is found by the question’s words, in its set’s list', async () => {
    expect(await recordingFor(q)).toEqual({ key, ms: 1750, v: 'a1b2c3d4' });
  });

  it('is missing for words that have none, and for a question of no set in the index (a team’s packet)', async () => {
    expect(await lookupRecording({ ...q, stem: 'What organelle makes ATP? (changed since)' })).toBe('unrecorded');
    expect(await lookupRecording({ id: 'pkt-123-r01-t01', stem: 'A team question?' })).toBe('unrecorded');
    expect(await lookupRecording({ id: 'doe-hs-02-r01-t01', stem: 'What organelle makes ATP?' })).toBe('unrecorded');
  });

  it('cannot be reached without the index, or the set’s list, and is looked for again later', async () => {
    delete files['data/voice/doe-hs-01.json'];
    expect(await lookupRecording(q)).toBe('unreachable');
    files['data/voice/doe-hs-01.json'] = { [key]: [1750, 'a1b2c3d4'] };
    expect(await recordingFor(q)).toEqual({ key, ms: 1750, v: 'a1b2c3d4' });

    resetVoiceForTests();
    delete files['data/voice/index.json'];
    expect(await lookupRecording(q)).toBe('unreachable');
  });
});

const PUBLISHED = fileURLToPath(new URL('../../public/data/voice/', import.meta.url));
const LIBRARY = fileURLToPath(new URL('../../public/data/doe/', import.meta.url));
const read = <T,>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;

// The published recordings (scripts/voice/publish.py writes this index): it must list every question of the library
// by its words now. A change to the library or to how questions are said needs them recorded and published again.
describe.skipIf(!existsSync(`${PUBLISHED}index.json`))('the published recordings', () => {
  it('are of the site’s voice, with the Workers’ addresses and the sample line', async () => {
    const index = usableIndex(read(`${PUBLISHED}index.json`));
    expect(index).not.toBeNull();
    expect(index!.hosts.every((h) => h.startsWith('https://'))).toBe(true);
    expect(index!.sample.key).toBe(await audioKey(RECORDED_VOICE, spokenFor({ stem: VOICE_SAMPLE })));
  });

  it('cover every question in the library, by its words now', async () => {
    const index = read<VoiceIndex>(`${PUBLISHED}index.json`);
    const library = read<LibraryIndex>(`${LIBRARY}index.json`);
    const missing: string[] = [];
    let questions = 0;
    for (const entry of library.sets) {
      const set = read<QuestionSet>(`${LIBRARY}${entry.file}`);
      const listed = existsSync(`${PUBLISHED}${set.id}.json`) ? read<Record<string, [number, string]>>(`${PUBLISHED}${set.id}.json`) : {};
      expect(Object.keys(listed).length, `${set.id}: the index's count`).toBe(index.sets[set.id] ?? 0);
      for (const round of set.rounds) {
        for (const pair of round.pairs) {
          for (const q of [pair.tossup, pair.bonus]) {
            if (!q?.stem?.trim()) continue;
            questions += 1;
            const key = await audioKey(RECORDED_VOICE, spokenFor({ stem: q.stem, choices: q.choices }));
            const found = listed[key];
            if (!found || !(found[0] > 0) || !/^[0-9a-f]{8}$/.test(found[1])) missing.push(q.id);
          }
        }
      }
    }
    expect(
      missing,
      `${missing.length} questions have no published recording of their words: export, generate and publish them again (scripts/voice/README.md)`,
    ).toEqual([]);
    expect(index.questions).toBe(questions);
  }, 120_000);
});
