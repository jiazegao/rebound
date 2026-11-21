/**
 * Solo practice read aloud (Practice → Solo practice, "Read aloud"): each question is said instead of shown, and its
 * text appears with the answer. It plays from its recording in Rebound's voice (src/lib/voice.ts), fetched a few
 * questions ahead, on a timeline that starts when the question does, so the page knows when the reading ends (the
 * buzzers' window opens) and whether a buzz interrupted it. A question with no recording (a team's own packet, say),
 * or one that cannot be fetched (offline), shows as text, as in the other mode. Signing in is not needed.
 */
import { useEffect, useRef, useState } from 'react';
import { playbackRate } from '../core/speech';
import type { Question } from '../core/schema';
import { buildReading, readingDurationMs } from '../lib/reading';
import { RecordedReader } from '../lib/recorded';
import { fetchRecording, loadVoiceIndex, lookupRecording, recordingUrl, type VoiceIndex } from '../lib/voice';
import { Notice } from './ui';

/** How solo practice questions are read: shown letter by letter, or said aloud. */
export type ReadingChoice = 'text' | 'speech';

/** Where this device remembers the choice (it depends on the device and its sound). */
const READING_KEY = 'rebound-solo-reading';

export function savedReading(): ReadingChoice {
  try {
    return globalThis.localStorage?.getItem(READING_KEY) === 'speech' ? 'speech' : 'text';
  } catch {
    return 'text';
  }
}

export function saveReading(choice: ReadingChoice): void {
  try {
    globalThis.localStorage?.setItem(READING_KEY, choice);
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
}

/** Why a question read aloud shows as text: it has no recording, or Rebound's voice cannot be reached now. */
export type TextReason = 'unrecorded' | 'unreachable';

/** How one question is read: from its recording, or (with none) shown as text. */
export interface ReadingPlan {
  voice: 'recorded' | 'text';
  /** How long the reading lasts, in ms: the recording at its playback speed, or the text at the reading speed. */
  durationMs: number;
  /** The recording's address and how fast it plays. */
  audio?: { key: string; rate: number };
  why?: TextReason;
}

/** A question being read: how, and when its reading started (this device's clock). */
export interface SoloReading {
  q: Question;
  plan: ReadingPlan;
  startedAt: number;
  wpm: number;
}

export interface SoloSpeech {
  /** Rebound's voice can be reached (its index of recordings loaded); null while that is being checked. */
  available: boolean | null;
  /** Plays the sample line at a reading speed. */
  sample: (wpm: number) => void;
  /** Lets the page play from now on: call it from a click or a tap (Start, Play a sample). */
  prime: () => void;
  /** The browser is waiting for a tap before it plays. */
  blocked: boolean;
  allow: () => void;
  /** The question being read cannot be heard after all (its recording would not play): it shows as text. */
  unheard: boolean;
  /** Fetches these questions' recordings ahead, so each is here when its turn comes. */
  prepare: (questions: Question[]) => void;
  /** How a question will be read at `wpm`: it waits (a few seconds at most) for the question's recording. */
  plan: (q: Question, wpm: number) => Promise<ReadingPlan>;
  /** Reads a question from its start; null stops ("finish": a recording still playing says the last words). */
  read: (reading: SoloReading | null, end?: 'stop' | 'finish') => void;
}

/** How long a question waits for its recording before it shows as text instead. */
const WAIT_MS = 8000;

type Found = { url: string; ms: number } | TextReason;

const within = <T,>(work: Promise<T>, ms: number, otherwise: T): Promise<T> =>
  Promise.race([work, new Promise<T>((resolve) => setTimeout(() => resolve(otherwise), ms))]);

async function until(ready: () => boolean, ms: number): Promise<void> {
  for (const end = Date.now() + ms; !ready() && Date.now() < end; ) await new Promise((r) => setTimeout(r, 50));
}

export function useSoloSpeech(enabled: boolean): SoloSpeech {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [unheard, setUnheard] = useState(false);
  const voice = useRef<VoiceIndex | null>(null);
  const player = useRef<RecordedReader | null>(null);
  const found = useRef(new Map<string, Promise<Found>>());
  const active = useRef<SoloReading | null>(null);
  const now = useRef(available);
  now.current = available;

  // Rebound's voice: its index says where the recordings are.
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void loadVoiceIndex().then((index) => {
      if (!live) return;
      voice.current = index;
      setAvailable(!!index && typeof Audio !== 'undefined');
    });
    return () => {
      live = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!available) return;
    const r = new RecordedReader(
      new Audio(),
      fetchRecording,
      () => Date.now(),
      () => setBlocked(true),
      (url) => {
        if (active.current?.plan.audio?.key === url) setUnheard(true);
      },
    );
    player.current = r;
    return () => {
      r.stop();
      player.current = null;
    };
  }, [available]);

  /** A question's recording (its address and length), or why there is none. */
  const recording = (q: Question): Promise<Found> => {
    let f = found.current.get(q.id);
    if (!f) {
      f = lookupRecording(q).then(
        (r) => (typeof r === 'string' ? r : voice.current ? { url: recordingUrl(voice.current, r), ms: r.ms } : 'unreachable'),
        () => 'unreachable' as const,
      );
      // An unreachable one is looked for again next time.
      void f.then((r) => r === 'unreachable' && found.current.delete(q.id));
      found.current.set(q.id, f);
    }
    return f;
  };

  return {
    available,
    sample: (wpm) => {
      const p = player.current;
      const index = voice.current;
      if (!p || !index) return;
      // Unlock the player during the click: the recording arrives after it.
      p.prime();
      void p.playOnce(recordingUrl(index, index.sample), playbackRate(wpm)).catch(() => {});
    },
    prime: () => player.current?.prime(),
    blocked,
    allow: () => {
      setBlocked(false);
      player.current?.unblock();
    },
    unheard,
    prepare: (questions) => {
      if (!now.current) return;
      for (const q of questions) {
        void recording(q).then((r) => {
          if (typeof r !== 'string') player.current?.prefetch([r.url]);
        });
      }
    },
    plan: async (q, wpm) => {
      await until(() => now.current !== null, 4000);
      const asText = (why: TextReason): ReadingPlan => ({ voice: 'text', durationMs: readingDurationMs(buildReading(q), wpm), why });
      if (!now.current) return asText('unreachable');
      const r = await within(recording(q), WAIT_MS, 'unreachable' as const);
      if (typeof r === 'string') return asText(r);
      const p = player.current;
      if (!p) return asText('unreachable');
      const here = await within(
        p.ready(r.url).then(
          () => true,
          () => false,
        ),
        WAIT_MS,
        false,
      );
      if (!here) return asText('unreachable');
      const rate = playbackRate(wpm);
      return { voice: 'recorded', durationMs: r.ms / rate, audio: { key: r.url, rate } };
    },
    read: (r, end = 'stop') => {
      if (!r) {
        active.current = null;
        if (end === 'finish') player.current?.follow(null);
        else player.current?.stop();
        return;
      }
      const was = active.current;
      if (was && was.q.id === r.q.id && was.startedAt === r.startedAt) return;
      active.current = r;
      setUnheard(false);
      if (r.plan.voice === 'recorded' && r.plan.audio && player.current) {
        player.current.follow({ key: r.plan.audio.key, startedAt: r.startedAt, rate: r.plan.audio.rate });
      } else player.current?.stop();
    },
  };
}

/** The setup's sound check for solo practice read aloud: whether Rebound's voice can be reached, and a sample. */
export function SoloSoundCheck({ speech, wpm, teamPacket }: { speech: SoloSpeech; wpm: number; teamPacket: boolean }) {
  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>Read aloud</h3>
      {speech.available === null ? (
        <p className="small muted" style={{ margin: 0 }}>
          Looking for Rebound’s voice…
        </p>
      ) : !speech.available ? (
        <Notice kind="warn">Rebound’s voice can’t be reached right now (are you offline?), so you will see each question as text instead.</Notice>
      ) : (
        <>
          <p className="small" style={{ margin: 0 }}>
            Rebound’s voice reads each question, and its text appears with the answer. Turn your sound on, and try it:
          </p>
          <div className="row">
            <button className="btn btn-small" onClick={() => speech.sample(wpm)}>
              Play a sample
            </button>
          </div>
          {teamPacket && (
            <p className="small muted" style={{ margin: 0 }}>
              A team’s own packet has no recordings, so its questions show as text.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Why a question read aloud shows as text, said on the play screen. */
export function textReason(why: TextReason | undefined): string {
  return why === 'unrecorded'
    ? 'This question has no recording, so it shows as text.'
    : 'Rebound’s voice can’t be reached right now, so this question shows as text.';
}
