/**
 * Rebound's voice for matches and solo practice read aloud (docs/SERVER.md, "Read aloud"): Google Cloud
 * Text-to-Speech says each question once, as one natural passage, and the recording is kept (voice.ts), so every
 * later match and every player reuses it. Only the questions are sent; nothing about players.
 *
 * On when the Worker has a GOOGLE_TTS_API_KEY secret (a Google Cloud API key allowed to use the Text-to-Speech API).
 * TTS_VOICE picks the voice and TTS_MONTHLY_CHARS caps the characters sent each month (default 900,000, under
 * Google's free million a month for Chirp 3 HD voices). Without a key, each player's device reads with its own voice.
 * Development only: DEV_TTS_FAKE = "1" (server/.dev.vars or the test config) makes silent recordings of the right
 * length instead of calling Google.
 */
import { HttpError } from './http';
import { asObject } from './validate';

/** What the voice says for a question, and a recording's name (shared with scripts/voice, which records elsewhere). */
export { audioKey, spokenFor } from '../../src/core/speech';

export const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
export const DEFAULT_VOICE = 'en-US-Chirp3-HD-Charon';
export const DEFAULT_MONTHLY_CHARS = 900_000;
/** Google takes at most 5,000 bytes of text in one request. */
export const MAX_TEXT_BYTES = 5000;
/** The line players can hear in the lobby before a match. */
export const SAMPLE_TEXT = 'Toss-up 1. Biology. Short answer. What organelle makes most of the energy a cell uses?';
/** How long a request to Google may take. */
const TIMEOUT_MS = 15_000;

export interface TtsSettings {
  voice: string;
  apiKey: string | null;
  /** Silent recordings instead of Google (development and tests). */
  fake: boolean;
  monthlyChars: number;
  fetch: typeof fetch;
}

let overrides: Partial<TtsSettings> = {};

/** Tests only: a fake Google, another voice, a smaller cap. */
export function setTtsTestOverrides(o: Partial<TtsSettings>): void {
  overrides = o;
}

/** The voice's settings, or null when there is no recorded voice (each device reads with its own). */
export function ttsSettings(env: Env): TtsSettings | null {
  const o = overrides;
  const fake = o.fake ?? env.DEV_TTS_FAKE === '1';
  const apiKey = o.apiKey !== undefined ? o.apiKey : (env.GOOGLE_TTS_API_KEY ?? null);
  if (!fake && !apiKey) return null;
  const cap = Number(env.TTS_MONTHLY_CHARS);
  return {
    voice: o.voice ?? (env.TTS_VOICE || DEFAULT_VOICE),
    apiKey,
    fake,
    monthlyChars: o.monthlyChars ?? (Number.isInteger(cap) && cap > 0 ? cap : DEFAULT_MONTHLY_CHARS),
    fetch: o.fetch ?? ((input, init) => fetch(input, init)),
  };
}


/** A question to record for solo practice (POST /api/speech): its stem, and its choices if it has them. */
export function practiceQuestion(value: unknown): { stem: string; choices?: Record<'W' | 'X' | 'Y' | 'Z', string> } {
  const o = asObject(value, 'The question');
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v : null);
  const stem = text(o.stem, 3000);
  if (!stem) throw new HttpError(400, "The question's text is missing or too long.");
  if (o.choices === undefined || o.choices === null) return { stem };
  const c = asObject(o.choices, "The question's choices");
  const choices = { W: text(c.W, 500), X: text(c.X, 500), Y: text(c.Y, 500), Z: text(c.Z, 500) };
  if (!choices.W || !choices.X || !choices.Y || !choices.Z) throw new HttpError(400, 'A multiple choice question needs four choices (W to Z).');
  return { stem, choices: choices as Record<'W' | 'X' | 'Y' | 'Z', string> };
}


export const AUDIO_KEY = /^[0-9a-f]{40}$/;

/** Says `text` with the voice: MP3 audio and its length. Throws when Google refuses or cannot be reached. */
export async function synthesize(text: string, s: TtsSettings): Promise<{ mp3: Uint8Array; durationMs: number }> {
  if (new TextEncoder().encode(text).length > MAX_TEXT_BYTES) throw new Error('The question is too long to record.');
  if (s.fake) return fakeRecording(text);
  const response = await s.fetch(GOOGLE_TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': s.apiKey ?? '' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: s.voice.split('-').slice(0, 2).join('-'), name: s.voice },
      audioConfig: { audioEncoding: 'MP3' },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google text-to-speech answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = (await response.json()) as { audioContent?: unknown };
  if (typeof body.audioContent !== 'string') throw new Error('Google text-to-speech sent no audio.');
  const mp3 = Uint8Array.from(atob(body.audioContent), (c) => c.charCodeAt(0));
  const durationMs = mp3DurationMs(mp3);
  if (!durationMs) throw new Error('The audio from Google could not be read.');
  return { mp3, durationMs };
}

/* ---------------- MP3 ---------------- */

// Bit rates (kbit/s) by index: MPEG-1 Layer III, and MPEG-2 and 2.5 Layer III.
const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** The length of an MP3 (Layer III) in ms, from its frames; null when it holds no frames. */
export function mp3DurationMs(bytes: Uint8Array): number | null {
  let i = 0;
  // Skip an ID3v2 tag.
  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    i = 10 + (((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) | ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f));
  }
  let seconds = 0;
  let frames = 0;
  while (i + 4 <= bytes.length) {
    const b1 = bytes[i + 1]!;
    const b2 = bytes[i + 2]!;
    if (bytes[i] !== 0xff || (b1 & 0xe0) !== 0xe0) {
      i += 1;
      continue;
    }
    const version = (b1 >> 3) & 3; // 3: MPEG-1, 2: MPEG-2, 0: MPEG-2.5
    const layer = (b1 >> 1) & 3; // 1: Layer III
    const bitrate = (version === 3 ? BITRATES_V1 : BITRATES_V2)[(b2 >> 4) & 15];
    const rate = SAMPLE_RATES[version]?.[(b2 >> 2) & 3];
    if (layer !== 1 || version === 1 || !bitrate || !rate) {
      i += 1;
      continue;
    }
    const padding = (b2 >> 1) & 1;
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor(((samples / 8) * bitrate * 1000) / rate) + padding;
    seconds += samples / rate;
    frames += 1;
    i += length;
  }
  return frames > 0 ? Math.round(seconds * 1000) : null;
}

/** Silent MP3 frames (MPEG-1 Layer III, 32 kbit/s, 32 kHz, mono): each lasts 36 ms. */
export function silentMp3(durationMs: number): Uint8Array {
  const frames = Math.max(1, Math.round(durationMs / 36));
  const frame = new Uint8Array(144);
  frame.set([0xff, 0xfb, 0x18, 0xc0]);
  const out = new Uint8Array(frames * frame.length);
  for (let f = 0; f < frames; f++) out.set(frame, f * frame.length);
  return out;
}

/** Development: a silent recording as long as a voice would take (about 14 characters a second). */
function fakeRecording(text: string): { mp3: Uint8Array; durationMs: number } {
  const mp3 = silentMp3((text.length / 14) * 1000);
  return { mp3, durationMs: mp3DurationMs(mp3)! };
}
