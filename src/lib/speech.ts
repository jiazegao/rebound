/**
 * Reading questions aloud with the device's own voice, for online matches read aloud (docs/SERVER.md, "Online
 * matches"). The server keeps one reading timeline for everyone (when each question's reading starts, pauses and
 * ends); this follows it phrase by phrase (src/core/speech.ts). Each phrase starts at its place on the timeline,
 * and the voice speeds up or slows down so that it ends on time, learning how fast this device's voice speaks and how
 * long it takes to start as it goes. So every player hears each phrase at about the same moment, and the end of a
 * question at about the moment the server ends the reading and opens the buzzers' answer window, whatever their voice.
 *
 * The browser's speech synthesis is reached through `SpeechPlatform`, so tests can use a pretend voice.
 */
import { MAX_RATE, MIN_RATE, rateFor, speechChunks, type SpeechChunk } from '../core/speech';
import { buildReading } from './reading';

/* ---------------- the platform ---------------- */

export interface VoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
  default: boolean;
}

export interface UtteranceLike {
  text: string;
  rate: number;
  volume: number;
  lang: string;
  voice: VoiceLike | null;
  onstart: ((event: unknown) => void) | null;
  onend: ((event: unknown) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

export interface SpeechPlatform {
  speak(u: UtteranceLike): void;
  cancel(): void;
  voices(): VoiceLike[];
  /** Calls `listener` when the device's list of voices changes; returns a function that stops it. */
  onVoicesChanged(listener: () => void): () => void;
  utterance(text: string): UtteranceLike;
  /** A clock in milliseconds, for measuring how long the voice takes. */
  now(): number;
}

/** The browser's speech synthesis, or null where there is none. */
export function browserSpeech(): SpeechPlatform | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return null;
  const synth = window.speechSynthesis;
  return {
    speak: (u) => synth.speak(u as unknown as SpeechSynthesisUtterance),
    cancel: () => synth.cancel(),
    voices: () => synth.getVoices(),
    onVoicesChanged: (listener) => {
      synth.addEventListener('voiceschanged', listener);
      return () => synth.removeEventListener('voiceschanged', listener);
    },
    utterance: (text) => new window.SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
    now: () => performance.now(),
  };
}

/* ---------------- voices ---------------- */

/** Apple's novelty voices (bells, bubbles, a robot…): fun, but not for reading questions. */
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Organ|Pipe Organ|Princess|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;
/** Apple's oldest voices, which sound robotic: still offered, after the others. */
const ROBOTIC = /^(Agnes|Bruce|Eddy|Flo|Fred|Grandma|Grandpa|Junior|Kathy|Ralph|Reed|Rocko|Sandy|Shelley|Vicki|Victoria)\b/i;

/** How good a voice sounds, when its id says (Apple's voices: "com.apple.voice.premium.en-US.Ava"). */
function quality(v: VoiceLike): 'Premium' | 'Enhanced' | 'Compact' | null {
  return /premium/i.test(v.voiceURI) ? 'Premium' : /enhanced/i.test(v.voiceURI) ? 'Enhanced' : /compact/i.test(v.voiceURI) ? 'Compact' : null;
}

/**
 * The device's English voices, best first: natural-sounding ones (Edge's "Natural" voices, Apple's Premium and
 * Enhanced ones), then US English, then Chrome's Google voices (better than the older ones built into Windows and
 * Chromebooks), then voices on the device, then its default; Apple's oldest, robotic voices come last, and its
 * novelty voices are left out.
 */
export function englishVoices(voices: VoiceLike[]): VoiceLike[] {
  const score = (v: VoiceLike) =>
    (/natural|neural|premium|enhanced|siri/i.test(`${v.name} ${v.voiceURI}`) ? 8 : 0) +
    (/^en[-_]US/i.test(v.lang) ? 4 : 0) +
    (/^Google\b/.test(v.name) ? 3 : 0) +
    (v.localService ? 1 : 0) +
    (v.default ? 1 : 0) -
    (ROBOTIC.test(v.name) || /eloquence/i.test(v.voiceURI) ? 10 : 0);
  return voices
    .filter((v) => /^en\b|^en[-_]/i.test(v.lang) && !NOVELTY.test(v.name))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

/** A voice as the voice menu shows it, with its quality when its id says (an iPad can list "Samantha" twice). */
export function voiceLabel(v: VoiceLike): string {
  const q = quality(v);
  return `${v.name} (${v.lang}${q && !v.name.includes(q) ? `, ${q}` : ''})`;
}

/**
 * The device's voices, each once: iPads list some voices twice, alike in name, language and quality, so a menu would
 * show two the same. Of two alike, the one `keep` names (the voice its player chose) stays.
 */
export function distinctVoices(voices: VoiceLike[], keep: string | null = null): VoiceLike[] {
  const seen = new Map<string, VoiceLike>();
  for (const v of voices) {
    const label = voiceLabel(v);
    const had = seen.get(label);
    if (!had || (v.voiceURI === keep && had.voiceURI !== keep)) seen.set(label, v);
  }
  return [...seen.values()];
}

/**
 * On iPads and iPhones, browsers offer websites only the voices built into the device: ones downloaded in Settings
 * (Premium and Enhanced voices, Siri's) are not available to the Web Speech API (as Apple's engineers say).
 */
export function builtInVoicesOnly(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPads ask for desktop sites, so their browsers say "Macintosh": a Mac has no touch screen.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * The device's voices, once it has them (some browsers load them a moment after the page). Resolves to an empty
 * list when the device has none after `timeoutMs`.
 */
export function loadVoices(platform: SpeechPlatform, timeoutMs = 2500): Promise<VoiceLike[]> {
  const now = platform.voices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      stop();
      clearTimeout(timer);
      resolve(platform.voices());
    };
    const stop = platform.onVoicesChanged(() => {
      if (platform.voices().length > 0) finish();
    });
    const timer = setTimeout(finish, timeoutMs);
  });
}

/** Where this device remembers the voice its player chose (a per-device convenience, like the theme). */
export const VOICE_KEY = 'rebound-voice';

export function savedVoice(): string | null {
  try {
    return globalThis.localStorage?.getItem(VOICE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveVoice(voiceURI: string): void {
  try {
    globalThis.localStorage?.setItem(VOICE_KEY, voiceURI);
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
}

/** How fast a voice speaks on this device, as learned in earlier matches, so the next one starts in step. */
const PACE_KEY = (voiceURI: string) => `rebound-voice-pace:${voiceURI}`;

export function savedPace(voice: VoiceLike | null): number | null {
  if (!voice) return null;
  try {
    const n = Number(globalThis.localStorage?.getItem(PACE_KEY(voice.voiceURI)));
    return Number.isFinite(n) && n >= 5 && n <= 40 ? n : null;
  } catch {
    return null;
  }
}

export function savePace(voice: VoiceLike | null, charsPerSecond: number): void {
  if (!voice) return;
  try {
    globalThis.localStorage?.setItem(PACE_KEY(voice.voiceURI), charsPerSecond.toFixed(2));
  } catch {
    /* storage blocked */
  }
}

/** The voice to use: the one this device's player chose, else the best English voice, else the device's default. */
export function chooseVoice(voices: VoiceLike[], saved: string | null): VoiceLike | null {
  return voices.find((v) => v.voiceURI === saved) ?? englishVoices(voices)[0] ?? voices.find((v) => v.default) ?? voices[0] ?? null;
}

/**
 * Lets this page speak later. Some browsers (Safari on iPhones and iPads) only allow speech that starts from a tap
 * or a click, so the page says nothing, quietly, during one: call this from a click handler.
 */
export function unlockSpeech(platform: SpeechPlatform): void {
  const u = platform.utterance(' ');
  u.volume = 0;
  platform.speak(u);
}

export const SAMPLE = 'Toss-up 1. Biology. Short answer. What organelle makes most of the energy a cell uses?';

/** Says the sample line, so a player can check their sound and voice before a match. */
export function speakSample(platform: SpeechPlatform, voice: VoiceLike | null): void {
  platform.cancel();
  const u = platform.utterance(SAMPLE);
  u.voice = voice;
  u.lang = voice?.lang ?? 'en-US';
  platform.speak(u);
}

/* ---------------- following the timeline ---------------- */

/** The reading as the view gives it: the text, and when its reading started (server time), at what pace. */
export interface ReadingClock {
  text: string;
  startedAt: number;
  wpm: number;
  /** The reading stopped here (server time) while someone answers an interrupt. */
  pausedAt?: number;
}

/** A first guess at how fast a voice speaks at its normal rate (about 165 words a minute); learned as it speaks. */
export const DEFAULT_CHARS_PER_SECOND = 15;
/** A first guess at how long a voice takes to start a phrase; learned too. */
export const DEFAULT_START_MS = 150;
/** How often the speaker checks the timeline. */
export const TICK_MS = 40;
/** A phrase whose time ended this long ago is skipped (this device joined late, or the reading went on without it). */
const STALE_MS = 400;

/**
 * Says one question at a time, in step with the server's reading timeline. Call `follow` with each view (the reading,
 * or null once the reading is over or stopped), and `stop` when the question changes or the page closes.
 */
export class QuestionSpeaker {
  private chunks: SpeechChunk[] = [];
  private key = '';
  private clock: ReadingClock | null = null;
  /** The reading has ended on the server: say what is left, quickly, and nothing new after it. */
  private ending = false;
  private next = 0;
  private speaking: UtteranceLike | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private charsPerSecond = DEFAULT_CHARS_PER_SECOND;
  private startMs = DEFAULT_START_MS;
  /** The browser refused to speak until the player taps or clicks: wait for `unblock`. */
  private blocked = false;
  /** Phrases in a row the voice failed to say. */
  private failures = 0;
  /** This device has said part of this reading: it does not skip phrases from then on, it catches up. */
  private inStep = false;

  constructor(
    private readonly platform: SpeechPlatform,
    private voice: VoiceLike | null,
    private readonly serverNow: () => number,
    /** The browser refused to speak (it waits for a tap or a click first). */
    private readonly onBlocked: () => void = () => {},
    /** The voice failed twice in a row (a network voice a school filter blocks, say). */
    private readonly onFailed: () => void = () => {},
    /** How fast this voice speaks, as learned before (characters a second at its normal rate). */
    charsPerSecond: number | null = null,
    /** Called with what has been learned about the voice's pace, to remember it for next time. */
    private readonly onPace: (charsPerSecond: number) => void = () => {},
  ) {
    if (charsPerSecond) this.charsPerSecond = charsPerSecond;
  }

  /** Another voice (the player chose one, or the last one failed): what was learned starts over, unless known. */
  setVoice(voice: VoiceLike | null, charsPerSecond: number | null = null): void {
    this.voice = voice;
    this.charsPerSecond = charsPerSecond ?? DEFAULT_CHARS_PER_SECOND;
    this.failures = 0;
  }

  /** What has been learned about this device's voice (for tests and the sound check). */
  get pace(): { charsPerSecond: number; startMs: number } {
    return { charsPerSecond: this.charsPerSecond, startMs: this.startMs };
  }

  /**
   * Follows the question's reading. `clock` null: the reading is over (the phrases still to say are said quickly)
   * or there is none. A different text or pace starts a new reading; an earlier position (the toss-up is read again)
   * starts it over; a later one (a reading resumed, or joined late) goes on from there.
   */
  follow(clock: ReadingClock | null): void {
    if (!clock) {
      if (this.clock && this.clock.pausedAt === undefined) {
        this.ending = true;
        this.clock = null;
        this.tick();
      } else if (this.clock) {
        // A reading stopped for an interrupt does not go on by itself.
        this.silence();
        this.clock = null;
      }
      return;
    }
    const key = `${clock.wpm}|${clock.text}`;
    if (key !== this.key) {
      this.reset();
      this.key = key;
      this.chunks = speechChunks(buildReading({ stem: clock.text }), clock.wpm);
    }
    const wasPaused = this.clock?.pausedAt !== undefined;
    this.clock = clock;
    this.ending = false;
    const at = this.position();
    if (clock.pausedAt !== undefined) {
      // Stopped for an interrupt: silence now; it goes on from the start of the phrase it stopped in.
      if (!wasPaused) this.silence();
      this.next = this.chunkAt(at);
      this.inStep = false;
      return;
    }
    const current = this.chunkAt(at);
    if (current < this.next - 1) {
      // The toss-up is read again from the start.
      this.silence();
      this.next = current;
      this.inStep = false;
    }
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** The player tapped to allow speech (after `onBlocked`): go on, from the phrase that was refused. */
  unblock(): void {
    this.blocked = false;
    if (this.clock && !this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** Stops speaking and forgets the reading (the question changed, or the page is closing). */
  stop(): void {
    this.reset();
    this.key = '';
    this.chunks = [];
  }

  private reset(): void {
    this.silence();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.clock = null;
    this.ending = false;
    this.inStep = false;
    this.next = 0;
  }

  private silence(): void {
    if (this.speaking) {
      const u = this.speaking;
      this.speaking = null;
      u.onend = null;
      u.onerror = null;
      u.onstart = null;
    }
    this.platform.cancel();
  }

  /** Where the reading is now, in ms after it started. */
  private position(): number {
    const c = this.clock;
    if (!c) return Infinity;
    return (c.pausedAt ?? this.serverNow()) - c.startedAt;
  }

  /** The phrase being read at `ms` (the first that has not ended yet). */
  private chunkAt(ms: number): number {
    const i = this.chunks.findIndex((c) => c.endMs > ms);
    return i < 0 ? this.chunks.length : i;
  }

  private tick(): void {
    if (this.speaking || this.blocked) return;
    if (this.next >= this.chunks.length || (!this.clock && !this.ending)) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    if (this.clock?.pausedAt !== undefined) return;
    const at = this.position();
    const chunk = this.chunks[this.next]!;
    let ms: number;
    if (this.ending) {
      ms = (chunk.endMs - chunk.startMs) / MAX_RATE;
    } else {
      // Not its time yet (allowing for the voice's start).
      if (at < chunk.startMs - this.startMs) return;
      // This device came in late (it joined, or the reading went on without it): skip what is long past. Once it
      // is in step it never skips; it speeds up instead.
      if (!this.inStep && at > chunk.endMs + STALE_MS && this.next < this.chunks.length - 1) {
        this.next = this.chunkAt(at);
        return this.tick();
      }
      ms = chunk.endMs - Math.max(at + this.startMs, chunk.startMs);
    }
    this.inStep = true;
    this.say(chunk, this.ending ? rateFor(chunk.say, ms, this.charsPerSecond) : this.rateOf(chunk, ms));
    this.next += 1;
  }

  /**
   * The rate that says this phrase in its own time on the timeline, so every device says each phrase at about the
   * same moment, whatever its voice. A voice takes a moment to start a phrase, and the next can only be asked for
   * once this one has finished: so the phrase ends half that moment early, and the next starts half of it late,
   * which keeps every word within half a start of its place. The last phrase is said a little slower: ending a
   * little late is better than early, when a quick buzz would count as an interrupt.
   */
  private rateOf(chunk: SpeechChunk, ms: number): number {
    const last = this.next === this.chunks.length - 1;
    const room = last ? 0 : Math.min(this.startMs / 2, ms * 0.3);
    return Math.min(MAX_RATE, Math.max(MIN_RATE, rateFor(chunk.say, ms - room, this.charsPerSecond) * (last ? 0.95 : 1)));
  }

  private say(chunk: SpeechChunk, rate: number): void {
    const u = this.platform.utterance(chunk.say);
    u.rate = rate;
    u.voice = this.voice;
    u.lang = this.voice?.lang ?? 'en-US';
    const asked = this.platform.now();
    let started = asked;
    u.onstart = () => {
      started = this.platform.now();
      this.startMs = learn(this.startMs, started - asked, 0, 1500);
    };
    u.onend = () => {
      if (this.speaking !== u) return;
      this.speaking = null;
      this.failures = 0;
      const seconds = (this.platform.now() - started) / 1000;
      // How fast this voice speaks at its normal rate, from how long this phrase took at the rate it was given.
      if (seconds > 0.2) {
        this.charsPerSecond = learn(this.charsPerSecond, chunk.say.length / (seconds * rate), 5, 40);
        this.onPace(this.charsPerSecond);
      }
      this.tick();
    };
    u.onerror = (event) => {
      if (this.speaking !== u) return;
      this.speaking = null;
      if (event.error === 'not-allowed') {
        // The browser waits for a tap first: say this phrase again once it is allowed.
        this.next = Math.max(0, this.next - 1);
        this.blocked = true;
        this.onBlocked();
        return;
      }
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        // Say the phrase again; if it fails twice, wait (as when blocked) for another voice: `setVoice`, then
        // `unblock`, says it with that one.
        this.next = Math.max(0, this.next - 1);
        this.failures += 1;
        if (this.failures >= 2) {
          this.blocked = true;
          this.onFailed();
          return;
        }
      }
      this.tick();
    };
    this.speaking = u;
    this.platform.speak(u);
  }
}

/** A running average that leans on recent measurements, kept within [min, max]. */
function learn(current: number, measured: number, min: number, max: number): number {
  if (!Number.isFinite(measured)) return current;
  return Math.min(max, Math.max(min, current * 0.6 + measured * 0.4));
}
