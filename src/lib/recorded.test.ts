import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordedReader, type MediaLike } from './recorded';

/** A pretend audio element: records what it is told; `refuse` makes play() fail as a browser would. */
function fakeMedia(refuse: () => string | null = () => null) {
  const log: string[] = [];
  const media = {
    src: '',
    currentTime: 0,
    playbackRate: 1,
    preservesPitch: false,
    paused: true,
    play() {
      const error = refuse();
      if (error) return Promise.reject(Object.assign(new Error(error), { name: error }));
      media.paused = false;
      log.push(`play ${media.src} at ${media.currentTime.toFixed(2)} x${media.playbackRate}`);
      return Promise.resolve();
    },
    pause() {
      if (!media.paused) log.push('pause');
      media.paused = true;
    },
  };
  return { media: media as MediaLike & typeof media, log };
}

const loader = (fail = new Set<string>()) => {
  const fetched: string[] = [];
  const load = async (key: string) => {
    fetched.push(key);
    if (fail.has(key)) throw new Error('not found');
    return new Blob([key]);
  };
  return { load, fetched };
};

const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

describe('playing a recording in step with the server', () => {
  it('starts when the reading starts, at the match’s speed with the pitch kept', async () => {
    const { media, log } = fakeMedia();
    const { load } = loader();
    const r = new RecordedReader(media, load, () => Date.now(), undefined, undefined, (b) => `blob:${b.size}`);
    r.follow({ key: 'q1', startedAt: Date.now() + 2000, rate: 1.25 });
    await settle();
    expect(log).toEqual([]);
    vi.advanceTimersByTime(2000);
    await settle();
    expect(log).toEqual(['play blob:2 at 0.00 x1.25']);
    expect(media.preservesPitch).toBe(true);
  });

  it('starts a late device at the right place, stops at an interrupt and goes on from there, and starts over for a re-read', async () => {
    const { media, log } = fakeMedia();
    const { load } = loader();
    const r = new RecordedReader(media, load, () => Date.now(), undefined, undefined, () => 'blob:q1');
    const startedAt = Date.now() - 3000;
    r.follow({ key: 'q1', startedAt, rate: 1 });
    await settle();
    expect(log).toEqual(['play blob:q1 at 3.00 x1']);
    // An interrupt at 4.5 s: it stops.
    vi.advanceTimersByTime(1500);
    r.follow({ key: 'q1', startedAt, rate: 1, pausedAt: Date.now() });
    expect(media.paused).toBe(true);
    // Ten seconds later the reading goes on: the server moved its start by the pause.
    vi.advanceTimersByTime(10_000);
    r.follow({ key: 'q1', startedAt: startedAt + 10_000, rate: 1 });
    await settle();
    expect(log[log.length - 1]).toBe('play blob:q1 at 4.50 x1');
    // A re-read starts from the beginning.
    r.follow({ key: 'q1', startedAt: Date.now(), rate: 1 });
    await settle();
    expect(log[log.length - 1]).toBe('play blob:q1 at 0.00 x1');
  });

  it('moves a recording that drifts back in step', async () => {
    const { media } = fakeMedia();
    const { load } = loader();
    const r = new RecordedReader(media, load, () => Date.now(), undefined, undefined, () => 'blob:q1');
    const startedAt = Date.now();
    r.follow({ key: 'q1', startedAt, rate: 1 });
    await settle();
    // The device fell behind by a second.
    vi.advanceTimersByTime(2000);
    media.currentTime = 1;
    vi.advanceTimersByTime(500);
    expect(media.currentTime).toBeCloseTo(2.5, 1);
  });

  it('waits for a tap when the browser will not play, then plays from where the reading is', async () => {
    let refuse: string | null = 'NotAllowedError';
    const { media, log } = fakeMedia(() => refuse);
    const blocked = vi.fn();
    const { load } = loader();
    const r = new RecordedReader(media, load, () => Date.now(), blocked, undefined, () => 'blob:q1');
    const startedAt = Date.now();
    r.follow({ key: 'q1', startedAt, rate: 1 });
    await settle();
    expect(blocked).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1200);
    refuse = null;
    r.unblock();
    await settle();
    expect(log).toEqual(['play blob:q1 at 1.20 x1']);
  });

  it('says when a recording cannot be fetched, so the device reads that question another way', async () => {
    const { media } = fakeMedia();
    const failed = vi.fn();
    const { load } = loader(new Set(['missing']));
    const r = new RecordedReader(media, load, () => Date.now(), undefined, failed, () => 'blob:x');
    r.follow({ key: 'missing', startedAt: Date.now(), rate: 1 });
    await settle();
    expect(failed).toHaveBeenCalledWith('missing');
  });

  it('fetches recordings ahead, a few at a time, each once', async () => {
    const { media } = fakeMedia();
    const { load, fetched } = loader();
    const r = new RecordedReader(media, load, () => Date.now(), undefined, undefined, () => 'blob:x');
    r.prefetch(['a', 'b', 'c', 'd', 'e']);
    expect(fetched).toEqual(['a', 'b', 'c']);
    await settle();
    expect(fetched).toEqual(['a', 'b', 'c', 'd', 'e']);
    r.prefetch(['a', 'e']);
    r.follow({ key: 'a', startedAt: Date.now(), rate: 1 });
    await settle();
    expect(fetched).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
