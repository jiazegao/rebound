import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { speechChunks } from '../core/speech';
import { buildReading, readingDurationMs } from './reading';
import { chooseVoice, englishVoices, loadVoices, QuestionSpeaker, type SpeechPlatform, type UtteranceLike, type VoiceLike } from './speech';

/**
 * A pretend voice: it starts `startMs` after it is asked to and says `charsPerSecond` characters a second at its
 * normal rate, faster or slower with the rate it is given. It records what it said and when.
 */
function fakeVoice(options: { charsPerSecond: number; startMs: number; refuse?: () => boolean }) {
  const said: Array<{ text: string; rate: number; start: number; end: number }> = [];
  let current: { u: UtteranceLike; timers: Array<ReturnType<typeof setTimeout>> } | null = null;
  let cancels = 0;
  const platform: SpeechPlatform = {
    speak(u) {
      if (options.refuse?.()) {
        setTimeout(() => u.onerror?.({ error: 'not-allowed' }), 0);
        return;
      }
      const start = Date.now() + options.startMs;
      const end = start + (u.text.length / (options.charsPerSecond * u.rate)) * 1000;
      const entry = { text: u.text, rate: u.rate, start, end };
      current = {
        u,
        timers: [
          setTimeout(() => u.onstart?.({}), options.startMs),
          setTimeout(() => {
            said.push(entry);
            current = null;
            u.onend?.({});
          }, end - Date.now()),
        ],
      };
    },
    cancel() {
      cancels += 1;
      if (!current) return;
      for (const t of current.timers) clearTimeout(t);
      current.u.onerror?.({ error: 'interrupted' });
      current = null;
    },
    voices: () => [],
    onVoicesChanged: () => () => {},
    utterance: (text) => ({ text, rate: 1, volume: 1, lang: 'en-US', voice: null, onstart: null, onend: null, onerror: null }),
    now: () => Date.now(),
  };
  return { platform, said, cancels: () => cancels };
}

const STEM =
  'An aqueous solution in which the concentration of hydroxide ions is greater than that of hydrogen ions, at 25 degrees Celsius and one atmosphere of pressure, is called what?';
const CHOICES = { W: 'basic', X: 'acidic', Y: 'neutral', Z: 'in equilibrium' };
const TEXT = buildReading({ stem: STEM, choices: CHOICES }).text;
const WPM = 180;
const DURATION = readingDurationMs(buildReading({ stem: TEXT }), WPM);
const CHUNKS = speechChunks(buildReading({ stem: TEXT }), WPM);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

describe('reading a question aloud on the timeline', () => {
  it.each([
    ['a voice slower than the first guess', 11],
    ['a voice faster than the first guess', 20],
  ])('with %s, says every phrase in order and finishes close to the end of the reading', (_label, charsPerSecond) => {
    const voice = fakeVoice({ charsPerSecond, startMs: 120 });
    const speaker = new QuestionSpeaker(voice.platform, null, () => Date.now());
    const startedAt = Date.now() + 500;
    speaker.follow({ text: TEXT, startedAt, wpm: WPM });
    vi.advanceTimersByTime(DURATION + 3000);
    expect(voice.said.map((s) => s.text)).toEqual(CHUNKS.map((c) => c.say));
    // No phrase starts before its place on the timeline (a little early only to allow for the voice's start).
    voice.said.forEach((s, i) => expect(s.start).toBeGreaterThanOrEqual(startedAt + CHUNKS[i]!.startMs - 200));
    // It ends within half a second of the server's end of the reading, early or late.
    const last = voice.said[voice.said.length - 1]!;
    expect(Math.abs(last.end - (startedAt + DURATION))).toBeLessThan(500);
    // It has learned roughly how fast this voice speaks.
    expect(Math.abs(speaker.pace.charsPerSecond - charsPerSecond)).toBeLessThan(charsPerSecond * 0.3);
  });

  it('stops at an interrupt and goes on from the start of the phrase it stopped in', () => {
    const voice = fakeVoice({ charsPerSecond: 15, startMs: 100 });
    const speaker = new QuestionSpeaker(voice.platform, null, () => Date.now());
    const startedAt = Date.now();
    speaker.follow({ text: TEXT, startedAt, wpm: WPM });
    // Someone buzzes in the middle of the second phrase.
    const pausedAt = startedAt + (CHUNKS[1]!.startMs + CHUNKS[1]!.endMs) / 2;
    vi.setSystemTime(pausedAt - 1);
    vi.advanceTimersByTime(1);
    speaker.follow({ text: TEXT, startedAt, wpm: WPM, pausedAt });
    const before = voice.said.length;
    vi.advanceTimersByTime(8000);
    expect(voice.said.length).toBe(before);
    expect(voice.cancels()).toBeGreaterThan(0);
    // The reading goes on: the server shifts its start by the pause.
    const resumedAt = Date.now();
    speaker.follow({ text: TEXT, startedAt: startedAt + (resumedAt - pausedAt), wpm: WPM });
    vi.advanceTimersByTime(DURATION + 2000);
    const after = voice.said.slice(before).map((s) => s.text);
    expect(after).toEqual(CHUNKS.slice(1).map((c) => c.say));
  });

  it('starts again when the toss-up is read again, and says what is left quickly when the reading ends first', () => {
    const voice = fakeVoice({ charsPerSecond: 15, startMs: 100 });
    const speaker = new QuestionSpeaker(voice.platform, null, () => Date.now());
    speaker.follow({ text: TEXT, startedAt: Date.now(), wpm: WPM });
    vi.advanceTimersByTime(DURATION + 1000);
    const once = voice.said.length;
    // The same toss-up, read again for the other side.
    speaker.follow({ text: TEXT, startedAt: Date.now() + 200, wpm: WPM });
    vi.advanceTimersByTime(1500);
    // The server ends the reading while this device is still near the start: the rest is said at once, fast.
    speaker.follow(null);
    vi.advanceTimersByTime(DURATION);
    const again = voice.said.slice(once);
    expect(again.map((s) => s.text)).toEqual(CHUNKS.map((c) => c.say));
    expect(again[again.length - 1]!.rate).toBeGreaterThan(1.9);
  });

  it('waits for a tap when the browser refuses to speak, then says the refused phrase', () => {
    let refuse = true;
    const voice = fakeVoice({ charsPerSecond: 15, startMs: 100, refuse: () => refuse });
    const blocked = vi.fn();
    const speaker = new QuestionSpeaker(voice.platform, null, () => Date.now(), blocked);
    speaker.follow({ text: TEXT, startedAt: Date.now(), wpm: WPM });
    vi.advanceTimersByTime(1000);
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(voice.said).toEqual([]);
    refuse = false;
    speaker.unblock();
    vi.advanceTimersByTime(DURATION + 2000);
    expect(voice.said[0]!.text).toBe(CHUNKS[0]!.say);
    expect(voice.said.length).toBeGreaterThan(1);
  });

  it('gives up on a voice that keeps failing, so the device can show the text instead', () => {
    const voice = fakeVoice({ charsPerSecond: 15, startMs: 100 });
    const failing: SpeechPlatform = { ...voice.platform, speak: (u) => setTimeout(() => u.onerror?.({ error: 'synthesis-failed' }), 50) };
    const failed = vi.fn();
    const speaker = new QuestionSpeaker(failing, null, () => Date.now(), () => {}, failed);
    speaker.follow({ text: TEXT, startedAt: Date.now(), wpm: WPM });
    vi.advanceTimersByTime(DURATION + 2000);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('is silent after stop', () => {
    const voice = fakeVoice({ charsPerSecond: 15, startMs: 100 });
    const speaker = new QuestionSpeaker(voice.platform, null, () => Date.now());
    speaker.follow({ text: TEXT, startedAt: Date.now(), wpm: WPM });
    vi.advanceTimersByTime(300);
    speaker.stop();
    vi.advanceTimersByTime(DURATION + 1000);
    expect(voice.said).toEqual([]);
  });
});

describe('voices', () => {
  const v = (name: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({ name, lang, voiceURI: name, localService: false, default: false, ...extra });

  it('puts US English and on-device voices first, and keeps a voice the player chose', () => {
    const voices = [v('Amelie', 'fr-FR', { default: true }), v('Daniel', 'en-GB', { localService: true }), v('Google US English', 'en-US'), v('Samantha', 'en-US', { localService: true })];
    expect(englishVoices(voices).map((x) => x.name)).toEqual(['Samantha', 'Google US English', 'Daniel']);
    expect(chooseVoice(voices, null)?.name).toBe('Samantha');
    expect(chooseVoice(voices, 'Daniel')?.name).toBe('Daniel');
    expect(chooseVoice([v('Amelie', 'fr-FR', { default: true })], null)?.name).toBe('Amelie');
    expect(chooseVoice([], null)).toBeNull();
  });

  it('waits for voices that load late, and gives up on a device with none', async () => {
    let list: VoiceLike[] = [];
    let changed = () => {};
    const platform = { voices: () => list, onVoicesChanged: (l: () => void) => ((changed = l), () => {}) } as unknown as SpeechPlatform;
    const late = loadVoices(platform, 2000);
    list = [v('Samantha', 'en-US')];
    changed();
    await expect(late).resolves.toHaveLength(1);
    list = [];
    const none = loadVoices(platform, 2000);
    vi.advanceTimersByTime(2000);
    await expect(none).resolves.toEqual([]);
  });
});
