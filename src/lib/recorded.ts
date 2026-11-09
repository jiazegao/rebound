/**
 * Playing Rebound's recorded voice in a match read aloud (docs/SERVER.md, "Read aloud"): each question was recorded
 * once on the server, and every device plays the recording from the moment the server starts the reading, at the
 * match's playback speed (the pitch is kept). The server times the reading by the recording, so the voice never has
 * to hurry or slow down; this only keeps the player in step with the server's clock (it starts late joiners at the
 * right place, stops for an interrupt, goes on after one, and starts again for a re-read).
 *
 * The audio element and the fetch are passed in, so tests can use pretend ones.
 */

export interface MediaLike {
  src: string;
  currentTime: number;
  playbackRate: number;
  preservesPitch?: boolean;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
}

/** A reading with a recording, as the view gives it: which recording, when it started (server time), how fast. */
export interface RecordedClock {
  key: string;
  startedAt: number;
  rate: number;
  /** The reading stopped here (server time) while someone answers an interrupt. */
  pausedAt?: number;
}

/** How far the recording may drift from the server's clock before it is moved back in step. */
export const DRIFT_S = 0.25;
const CHECK_MS = 500;
/** Recordings fetched at once when fetching ahead. */
const AHEAD = 3;

/** A short silent MP3: playing it from a tap lets the page play recordings later (Safari on iPhones and iPads). */
export const SILENT_MP3 = `data:audio/mpeg;base64,${btoa(String.fromCharCode(...[0xff, 0xfb, 0x18, 0xc0], ...new Array(140).fill(0)))}`;

export class RecordedReader {
  private readonly urls = new Map<string, Promise<string>>();
  private queue: string[] = [];
  private loading = 0;
  private key: string | null = null;
  private clock: RecordedClock | null = null;
  private wait: ReturnType<typeof setTimeout> | null = null;
  private check: ReturnType<typeof setInterval> | null = null;
  private blocked = false;

  constructor(
    private readonly media: MediaLike,
    private readonly load: (key: string) => Promise<Blob>,
    private readonly serverNow: () => number,
    /** The browser will not play until the player taps or clicks. */
    private readonly onBlocked: () => void = () => {},
    /** A recording could not be fetched or played: the device reads that question another way. */
    private readonly onFailed: (key: string) => void = () => {},
    private readonly toUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
  ) {}

  /** Fetches recordings ahead, a few at a time, so each is here before its question. */
  prefetch(keys: string[]): void {
    for (const key of keys) if (!this.urls.has(key) && !this.queue.includes(key)) this.queue.push(key);
    this.pump();
  }

  private pump(): void {
    while (this.loading < AHEAD && this.queue.length) {
      const key = this.queue.shift()!;
      this.loading += 1;
      this.url(key)
        .catch(() => {})
        .finally(() => {
          this.loading -= 1;
          this.pump();
        });
    }
  }

  private url(key: string): Promise<string> {
    let url = this.urls.get(key);
    if (!url) {
      url = this.load(key).then(this.toUrl);
      // A failed fetch can be tried again later.
      url.catch(() => this.urls.delete(key));
      this.urls.set(key, url);
    }
    return url;
  }

  /**
   * Follows the reading: `clock` null once it is over (a recording still playing ends by itself) or stopped. A new
   * recording, a later start (the reading goes on after an interrupt) or an earlier one (a re-read) all come down to
   * the same thing: play from where the server's clock says.
   */
  follow(clock: RecordedClock | null): void {
    if (!clock) {
      if (this.clock?.pausedAt !== undefined) this.media.pause();
      this.clock = null;
      this.clearTimers();
      return;
    }
    const same = this.clock && this.clock.key === clock.key && this.clock.startedAt === clock.startedAt && this.clock.pausedAt === clock.pausedAt && this.clock.rate === clock.rate;
    if (same) return;
    this.clock = clock;
    this.clearTimers();
    if (clock.pausedAt !== undefined) {
      this.media.pause();
      return;
    }
    void this.start(clock);
  }

  private async start(clock: RecordedClock): Promise<void> {
    let url: string;
    try {
      url = await this.url(clock.key);
    } catch {
      if (this.clock === clock) this.onFailed(clock.key);
      return;
    }
    if (this.clock !== clock) return;
    if (this.key !== clock.key) {
      this.media.src = url;
      this.key = clock.key;
    }
    this.media.playbackRate = clock.rate;
    this.media.preservesPitch = true;
    const wait = clock.startedAt - this.serverNow();
    if (wait > 0) {
      this.media.pause();
      this.media.currentTime = 0;
      this.wait = setTimeout(() => this.play(clock), wait);
      return;
    }
    this.play(clock);
  }

  /** Where the recording should be now, in seconds. */
  private position(clock: RecordedClock): number {
    return Math.max(0, ((this.serverNow() - clock.startedAt) * clock.rate) / 1000);
  }

  private play(clock: RecordedClock): void {
    if (this.clock !== clock || this.blocked) return;
    this.media.currentTime = this.position(clock);
    this.media.play().then(
      () => {
        if (this.clock !== clock) return;
        // Keep in step: a device that falls behind (a busy laptop) is moved back to the server's clock.
        this.check = setInterval(() => {
          if (this.clock !== clock || this.media.paused) return;
          const target = this.position(clock);
          if (Math.abs(this.media.currentTime - target) > DRIFT_S) this.media.currentTime = target;
        }, CHECK_MS);
      },
      (error: unknown) => {
        if (this.clock !== clock) return;
        if ((error as { name?: string } | null)?.name === 'NotAllowedError') {
          this.blocked = true;
          this.onBlocked();
        } else this.onFailed(clock.key);
      },
    );
  }

  /** The player tapped to allow sound (after `onBlocked`): play from where the reading is now. */
  unblock(): void {
    this.blocked = false;
    if (this.clock && this.clock.pausedAt === undefined) this.play(this.clock);
  }

  /** Lets the page play recordings later: call from a tap or a click. */
  prime(): void {
    if (this.key !== null || !this.media.paused) return;
    this.media.src = SILENT_MP3;
    this.media.play().then(
      () => this.media.pause(),
      () => {},
    );
  }

  /** Plays one recording from its start (the lobby's sample). */
  async playOnce(key: string, rate = 1): Promise<void> {
    this.stop();
    const url = await this.url(key);
    this.media.src = url;
    this.key = key;
    this.media.playbackRate = rate;
    this.media.preservesPitch = true;
    this.media.currentTime = 0;
    await this.media.play();
  }

  /** Silence, and forget the reading (the question changed, or the page is closing). */
  stop(): void {
    this.clearTimers();
    this.clock = null;
    this.media.pause();
  }

  private clearTimers(): void {
    if (this.wait) clearTimeout(this.wait);
    if (this.check) clearInterval(this.check);
    this.wait = null;
    this.check = null;
  }
}
