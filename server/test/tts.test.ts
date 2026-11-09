/** Rebound's recorded voice: Google's request, MP3 lengths, silent recordings for development. */
import { afterEach, describe, expect, it } from 'vitest';
import { audioKey, GOOGLE_TTS_URL, mp3DurationMs, setTtsTestOverrides, silentMp3, spokenFor, synthesize, ttsSettings } from '../src/tts';

const settings = (fetcher: typeof fetch) => ({ voice: 'en-US-Chirp3-HD-Charon', apiKey: 'test-key', fake: false, monthlyChars: 1000, fetch: fetcher });
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

afterEach(() => setTtsTestOverrides({}));

describe('the recorded voice', () => {
  it('reads the length of an MP3 from its frames', () => {
    expect(mp3DurationMs(silentMp3(3600))).toBe(3600);
    expect(mp3DurationMs(silentMp3(1000))).toBe(1008);
    // An ID3 tag in front is skipped.
    const tagged = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 2, 0, 0, ...silentMp3(360)]);
    expect(mp3DurationMs(tagged)).toBe(360);
    expect(mp3DurationMs(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });

  it('asks Google for the voice with the API key, and keeps the MP3 it sends with its length', async () => {
    const asked: Array<{ url: string; init: RequestInit }> = [];
    const google = (async (url: string, init: RequestInit) => {
      asked.push({ url, init });
      return Response.json({ audioContent: base64(silentMp3(2016)) });
    }) as unknown as typeof fetch;
    const made = await synthesize('What organelle makes ATP?', settings(google));
    expect(made.durationMs).toBe(2016);
    expect(asked[0]!.url).toBe(GOOGLE_TTS_URL);
    expect(new Headers(asked[0]!.init.headers).get('X-Goog-Api-Key')).toBe('test-key');
    expect(JSON.parse(String(asked[0]!.init.body))).toEqual({
      input: { text: 'What organelle makes ATP?' },
      voice: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Charon' },
      audioConfig: { audioEncoding: 'MP3' },
    });
  });

  it('fails plainly when Google refuses, sends no audio, or the text is too long', async () => {
    const refusing = (async () => new Response('API key not valid', { status: 400 })) as unknown as typeof fetch;
    await expect(synthesize('Hi', settings(refusing))).rejects.toThrow('Google text-to-speech answered 400: API key not valid');
    const empty = (async () => Response.json({})) as unknown as typeof fetch;
    await expect(synthesize('Hi', settings(empty))).rejects.toThrow('sent no audio');
    await expect(synthesize('x'.repeat(5001), settings(empty))).rejects.toThrow('too long');
  });

  it('is off without a key, and makes silent recordings of a voice’s length in development', async () => {
    const env = {} as Env;
    expect(ttsSettings(env)).toBeNull();
    expect(ttsSettings({ GOOGLE_TTS_API_KEY: 'k', TTS_MONTHLY_CHARS: '5000' } as Env)).toMatchObject({ apiKey: 'k', voice: 'en-US-Chirp3-HD-Charon', monthlyChars: 5000 });
    const dev = ttsSettings({ DEV_TTS_FAKE: '1' } as Env)!;
    const made = await synthesize('a'.repeat(140), dev);
    expect(made.durationMs).toBeGreaterThan(9500);
    expect(made.durationMs).toBeLessThan(10500);
  });

  it('says a whole question as one passage, each answer choice its own sentence, under a key for voice and words', async () => {
    expect(spokenFor({ stem: 'Which is a base?', choices: { W: 'NaOH', X: 'HCl', Y: 'H₂O', Z: 'CO₂' } })).toBe('Which is a base? W, NaOH. X, HCl. Y, H2O. Z, CO2.');
    const a = await audioKey('voice-1', 'Hello.');
    // Recordings are kept, and made elsewhere (scripts/voice), under these names: they must never change.
    expect(a).toBe('51873d2ca5026182810a512ce20b8a298c1d62d3');
    expect(await audioKey('voice-2', 'Hello.')).not.toBe(a);
  });
});
