/**
 * Solo practice read aloud (Practice → Solo practice, "Read aloud"): each question is said instead of shown, and its
 * text appears with the answer. Signed in, when the server has Rebound's voice (docs/SERVER.md, "Read aloud"), each
 * question plays from its recording, made on the server the first time anyone hears it; otherwise this device's own
 * voice reads it (src/lib/speech.ts). Either way a question is read on a timeline that starts when it does, so the
 * page knows when the reading ends (the buzzers' window opens) and whether a buzz interrupted it. With no voice at
 * all, the question shows as text, as in the other mode.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { playbackRate } from '../core/speech';
import type { Question } from '../core/schema';
import { fetchRecording, recordQuestion, speechEnabled } from '../lib/api';
import { useSession } from '../lib/cloud';
import { buildReading, readingDurationMs, wpmFor } from '../lib/reading';
import { RecordedReader } from '../lib/recorded';
import {
  browserSpeech,
  builtInVoicesOnly,
  chooseVoice,
  distinctVoices,
  englishVoices,
  loadVoices,
  QuestionSpeaker,
  SAMPLE,
  savedPace,
  savedVoice,
  savePace,
  saveVoice,
  speakSample,
  unlockSpeech,
  voiceLabel,
  type VoiceLike,
} from '../lib/speech';
import type { VoiceStatus } from './MatchSpeech';
import { Notice } from './ui';

/** How solo practice questions are read: shown letter by letter, or said aloud. */
export type ReadingChoice = 'text' | 'speech';

/** Where this device remembers the choice (like the voice: it depends on the device and its sound). */
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

/** How one question is read: from its recording, with this device's voice, or (with neither) shown as text. */
export interface ReadingPlan {
  voice: 'recorded' | 'device' | 'text';
  /** How long the reading lasts, in ms: the recording at its playback speed, or the text at the reading speed. */
  durationMs: number;
  audio?: { key: string; rate: number };
}

/** A question being read: how, and when its reading started (this device's clock). */
export interface SoloReading {
  q: Question;
  plan: ReadingPlan;
  startedAt: number;
  wpm: number;
}

export interface SoloSpeech {
  /** Rebound's voice reads the questions (signed in, and the server has it); null while that is being checked. */
  recorded: boolean | null;
  /** This device's own voice. */
  status: VoiceStatus;
  voices: VoiceLike[];
  voice: VoiceLike | null;
  setVoice: (voiceURI: string) => void;
  /** Plays the sample line at a reading speed. */
  sample: (wpm: number) => void;
  /** Lets the page speak and play from now on: call it from a click or a tap (Start, Play a sample). */
  prime: () => void;
  /** The browser is waiting for a tap before it plays or speaks. */
  blocked: boolean;
  allow: () => void;
  /** The question being read cannot be heard after all (its recording failed, and the device has no voice). */
  unheard: boolean;
  /** Has these questions recorded (or found) ahead, a few at a time, so each is ready when its turn comes. */
  prepare: (questions: Question[]) => void;
  /** How a question will be read at `wpm`: it waits (a few seconds at most) for the question's recording. */
  plan: (q: Question, wpm: number) => Promise<ReadingPlan>;
  /** Reads a question from its start; null stops ("finish": a voice still talking says the last words). */
  read: (reading: SoloReading | null, end?: 'stop' | 'finish') => void;
}

/** Recordings asked for at once. */
const AT_ONCE = 2;
/** How long a question waits for its recording (made, then fetched) before this device reads it instead. */
const WAIT_MS = 8000;

type Recording = { key: string; ms: number };

const within = <T,>(work: Promise<T>, ms: number, otherwise: T): Promise<T> =>
  Promise.race([work, new Promise<T>((resolve) => setTimeout(() => resolve(otherwise), ms))]);

async function until(ready: () => boolean, ms: number): Promise<void> {
  for (const end = Date.now() + ms; !ready() && Date.now() < end; ) await new Promise((r) => setTimeout(r, 50));
}

export function useSoloSpeech(enabled: boolean): SoloSpeech {
  const signedIn = !!useSession().user;
  const platform = useMemo(() => (enabled ? browserSpeech() : null), [enabled]);
  const [status, setStatus] = useState<VoiceStatus>('checking');
  const [voices, setVoices] = useState<VoiceLike[]>([]);
  const [voice, setVoiceState] = useState<VoiceLike | null>(null);
  const [recorded, setRecorded] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [unheard, setUnheard] = useState(false);
  const speaker = useRef<QuestionSpeaker | null>(null);
  const player = useRef<RecordedReader | null>(null);
  const recordings = useRef(new Map<string, Promise<Recording | null>>());
  const waiting = useRef<Array<{ q: Question; done: (r: Recording | null) => void }>>([]);
  const asking = useRef(0);
  const active = useRef<SoloReading | null>(null);
  const failedVoices = useRef(new Set<string>());
  const current = useRef<VoiceLike | null>(null);
  current.current = voice;
  const now = useRef({ status, recorded });
  now.current = { status, recorded };

  // This device's own voices (for questions without a recording, and when Rebound's voice is not there).
  useEffect(() => {
    if (!enabled) return;
    if (!platform) {
      setStatus('none');
      return;
    }
    let live = true;
    void loadVoices(platform).then((loaded) => {
      if (!live) return;
      const all = distinctVoices(loaded, savedVoice());
      const english = englishVoices(all);
      setVoices(english.length ? english : all);
      const chosen = chooseVoice(all, savedVoice());
      setVoiceState(chosen);
      setStatus(chosen ? 'ready' : 'none');
    });
    return () => {
      live = false;
    };
  }, [enabled, platform]);

  useEffect(() => {
    if (!platform || status !== 'ready') return;
    const s = new QuestionSpeaker(
      platform,
      voice,
      () => Date.now(),
      () => setBlocked(true),
      () => {
        // The voice keeps failing: try the next one; with none left, the question shows as text.
        const gone = current.current;
        if (gone) failedVoices.current.add(gone.voiceURI);
        const next = voices.find((v) => !failedVoices.current.has(v.voiceURI));
        if (!next) {
          setStatus('none');
          setUnheard(true);
          return;
        }
        setVoiceState(next);
        s.setVoice(next, savedPace(next));
        s.unblock();
      },
      savedPace(voice),
      (cps) => savePace(current.current, cps),
    );
    speaker.current = s;
    return () => {
      s.stop();
      speaker.current = null;
    };
    // The voice changes through setVoice, without a new speaker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, status]);

  // Rebound's voice: for a signed-in player, when the server has it.
  useEffect(() => {
    if (!enabled) return;
    if (!signedIn) {
      setRecorded(false);
      return;
    }
    let live = true;
    setRecorded(null);
    speechEnabled().then(
      (on) => live && setRecorded(on),
      () => live && setRecorded(false),
    );
    return () => {
      live = false;
    };
  }, [enabled, signedIn]);

  /** A question whose recording would not play: this device's voice reads the rest of it, or it shows as text. */
  const fallBack = (r: SoloReading) => {
    const s = speaker.current;
    if (!s) {
      setUnheard(true);
      return;
    }
    const reading = buildReading(r.q);
    s.follow({ text: reading.text, startedAt: r.startedAt, wpm: wpmFor(reading, r.plan.durationMs) });
  };

  useEffect(() => {
    if (!recorded || typeof Audio === 'undefined') return;
    const r = new RecordedReader(
      new Audio(),
      fetchRecording,
      () => Date.now(),
      () => setBlocked(true),
      (key) => {
        if (active.current?.plan.audio?.key === key) fallBack(active.current);
      },
    );
    player.current = r;
    return () => {
      r.stop();
      player.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorded]);

  const pump = () => {
    while (asking.current < AT_ONCE && waiting.current.length) {
      const { q, done } = waiting.current.shift()!;
      asking.current += 1;
      recordQuestion(q)
        .then(
          (r) => (r.enabled && r.key && r.ms ? { key: r.key, ms: r.ms } : null),
          () => null,
        )
        .then((rec) => {
          if (rec) player.current?.prefetch([rec.key]);
          done(rec);
        })
        .finally(() => {
          asking.current -= 1;
          pump();
        });
    }
  };

  const recording = (q: Question): Promise<Recording | null> => {
    let made = recordings.current.get(q.id);
    if (!made) {
      made = new Promise((done) => waiting.current.push({ q, done }));
      recordings.current.set(q.id, made);
      pump();
    }
    return made;
  };

  return {
    recorded,
    status,
    voices,
    voice,
    setVoice: (voiceURI) => {
      const next = voices.find((v) => v.voiceURI === voiceURI) ?? null;
      if (!next) return;
      saveVoice(voiceURI);
      setVoiceState(next);
      speaker.current?.setVoice(next, savedPace(next));
    },
    sample: (wpm) => {
      const p = player.current;
      if (now.current.recorded && p) {
        // Unlock the player during the click: the recording arrives after it.
        p.prime();
        void recordQuestion({ stem: SAMPLE })
          .then((r) => {
            if (!r.key) throw new Error('No recording');
            return p.playOnce(r.key, playbackRate(wpm));
          })
          .catch(() => platform && speakSample(platform, voice));
        return;
      }
      if (platform) speakSample(platform, voice);
    },
    prime: () => {
      player.current?.prime();
      if (platform && now.current.status === 'ready') unlockSpeech(platform);
    },
    blocked,
    allow: () => {
      setBlocked(false);
      if (platform) unlockSpeech(platform);
      player.current?.unblock();
      speaker.current?.unblock();
    },
    unheard,
    prepare: (questions) => {
      if (now.current.recorded) for (const q of questions) void recording(q);
    },
    plan: async (q, wpm) => {
      await until(() => now.current.status !== 'checking' && now.current.recorded !== null, 4000);
      const own: ReadingPlan = { voice: now.current.status === 'ready' ? 'device' : 'text', durationMs: readingDurationMs(buildReading(q), wpm) };
      if (!now.current.recorded) return own;
      const rec = await within(recording(q), WAIT_MS, null);
      const p = player.current;
      if (!rec || !p) return own;
      const here = await within(
        p.ready(rec.key).then(
          () => true,
          () => false,
        ),
        WAIT_MS,
        false,
      );
      if (!here) return own;
      const rate = playbackRate(wpm);
      return { voice: 'recorded', durationMs: rec.ms / rate, audio: { key: rec.key, rate } };
    },
    read: (r, end = 'stop') => {
      if (!r) {
        active.current = null;
        if (end === 'finish') {
          speaker.current?.follow(null);
          player.current?.follow(null);
        } else {
          speaker.current?.stop();
          player.current?.stop();
        }
        return;
      }
      const was = active.current;
      if (was && was.q.id === r.q.id && was.startedAt === r.startedAt) return;
      active.current = r;
      setUnheard(false);
      if (r.plan.voice === 'recorded' && r.plan.audio && player.current) {
        speaker.current?.stop();
        player.current.follow({ key: r.plan.audio.key, startedAt: r.startedAt, rate: r.plan.audio.rate });
      } else if (r.plan.voice === 'device' && speaker.current) {
        player.current?.stop();
        speaker.current.follow({ text: buildReading(r.q).text, startedAt: r.startedAt, wpm: r.wpm });
      } else if (r.plan.voice !== 'text') setUnheard(true);
    },
  };
}

/** The setup's sound check for solo practice read aloud: which voice reads, and a sample to try it. */
export function SoloSoundCheck({ speech, wpm }: { speech: SoloSpeech; wpm: number }) {
  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>Read aloud</h3>
      {speech.recorded ? (
        <>
          <p className="small" style={{ margin: 0 }}>
            Rebound’s voice reads each question, and its text appears with the answer. Turn your sound on, and try it:
          </p>
          <div className="row">
            <button className="btn btn-small" onClick={() => speech.sample(wpm)}>
              Play a sample
            </button>
          </div>
        </>
      ) : speech.recorded === null || speech.status === 'checking' ? (
        <p className="small muted" style={{ margin: 0 }}>
          Looking for a voice…
        </p>
      ) : speech.status === 'none' ? (
        <Notice kind="warn">This device has no voice for reading aloud, so you will see each question as text instead.</Notice>
      ) : (
        <>
          <p className="small" style={{ margin: 0 }}>
            Each question is read aloud with this device’s voice, and its text appears with the answer. Turn your sound on, and try it:
          </p>
          <div className="row">
            {speech.voices.length > 1 && (
              <label className="row small" style={{ gap: '0.4rem' }}>
                Voice
                <select value={speech.voice?.voiceURI ?? ''} onChange={(e) => speech.setVoice(e.target.value)}>
                  {speech.voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {voiceLabel(v)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="btn btn-small" onClick={() => speech.sample(wpm)}>
              Play a sample
            </button>
          </div>
          {builtInVoicesOnly() && (
            <p className="small muted" style={{ margin: 0 }}>
              iPads and iPhones let websites use only their built-in voices, so voices downloaded in Settings (such as Premium ones) don’t
              appear here.
            </p>
          )}
        </>
      )}
    </div>
  );
}
