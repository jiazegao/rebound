/**
 * Online matches read aloud. With Rebound's voice (docs/SERVER.md, "Read aloud"), each question was recorded on the
 * server and this device plays the recording in step with the server's clock (src/lib/recorded.ts). Without it, or
 * for a question that could not be recorded, the device's own voice reads it (src/lib/speech.ts). With neither, the
 * text shows, and the device tells the room, which shows the others who reads the text.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchRecording } from '../lib/api';
import { RecordedReader } from '../lib/recorded';
import type { RoomClient, RoomView } from '../lib/room';
import {
  browserSpeech,
  chooseVoice,
  englishVoices,
  loadVoices,
  QuestionSpeaker,
  savedPace,
  savedVoice,
  savePace,
  saveVoice,
  speakSample,
  unlockSpeech,
  voiceLabel,
  type VoiceLike,
} from '../lib/speech';
import { Notice } from './ui';

/** The device's own voice: 'checking': looking for one; 'ready': it can read; 'none': it has none that works. */
export type VoiceStatus = 'checking' | 'ready' | 'none';

export interface MatchSpeech {
  /** The match has Rebound's recorded voice (the server's), not only the devices' own. */
  recorded: boolean;
  /** Rebound's voice: how far the server is with recording the questions. */
  progress: { state: 'preparing' | 'ready'; done: number; total: number } | null;
  /** The device's own voice. */
  status: VoiceStatus;
  /** The device's voices to choose from (English ones, when it has any). */
  voices: VoiceLike[];
  voice: VoiceLike | null;
  setVoice: (voiceURI: string) => void;
  /** Plays the sample line. */
  sample: () => void;
  /** Lets the page speak and play from now on: call it from a click or a tap (Join, Play a sample, Buzz). */
  prime: () => void;
  /** The browser is waiting for a tap before it plays or speaks. */
  blocked: boolean;
  allow: () => void;
  /** This device reads the question on screen aloud: its text stays hidden until the question is over. */
  aloud: boolean;
}

/** Whether the question on screen is the same one (a new toss-up, its bonus, or the next one starts afresh). */
const questionKey = (view: RoomView | null) => (view ? `${view.questionId ?? ''}|${view.label}` : '');

export function useMatchSpeech(enabled: boolean, view: RoomView | null, client: RoomClient, connected: boolean): MatchSpeech {
  const platform = useMemo(() => (enabled ? browserSpeech() : null), [enabled]);
  const recordedVoice = enabled ? (view?.match?.voice ?? null) : null;
  const [status, setStatus] = useState<VoiceStatus>('checking');
  const [voices, setVoices] = useState<VoiceLike[]>([]);
  const [voice, setVoiceState] = useState<VoiceLike | null>(null);
  const [blocked, setBlocked] = useState(false);
  // Recordings this device could not fetch or play: it reads those questions another way.
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const speaker = useRef<QuestionSpeaker | null>(null);
  const player = useRef<RecordedReader | null>(null);
  const primed = useRef(false);
  const shown = useRef('');
  // Whether each question was read aloud here, remembered from its reading for the time after it.
  const aloudFor = useRef(new Map<string, boolean>());
  const failedVoices = useRef(new Set<string>());
  const current = useRef<VoiceLike | null>(null);
  current.current = voice;

  // The device's own voices (for questions without a recording, and matches without Rebound's voice).
  useEffect(() => {
    if (!enabled) return;
    if (!platform) {
      setStatus('none');
      return;
    }
    let live = true;
    void loadVoices(platform).then((all) => {
      if (!live) return;
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
      () => client.serverNow(),
      () => setBlocked(true),
      () => {
        // The voice keeps failing: try the next one; with none left, this device shows the text (and tells the room).
        const gone = current.current;
        if (gone) failedVoices.current.add(gone.voiceURI);
        const next = voices.find((v) => !failedVoices.current.has(v.voiceURI));
        if (!next) {
          setStatus('none');
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
  }, [platform, status, client]);

  // Rebound's recordings: one audio element for the page, kept in step with the server.
  const hasRecordings = !!recordedVoice;
  useEffect(() => {
    if (!hasRecordings || typeof Audio === 'undefined') return;
    const r = new RecordedReader(
      new Audio(),
      fetchRecording,
      () => client.serverNow(),
      () => setBlocked(true),
      (key) => setFailed((f) => new Set(f).add(key)),
    );
    player.current = r;
    return () => {
      r.stop();
      player.current = null;
    };
  }, [hasRecordings, client]);

  // Fetch every recording ahead once the server has them all.
  const keys = recordedVoice?.keys?.join(',') ?? '';
  useEffect(() => {
    if (keys) player.current?.prefetch(keys.split(','));
  }, [keys, hasRecordings]);

  // Follow the reading: a new question starts afresh; once its answer shows (it is over) the voice stops.
  const key = questionKey(view);
  const audio = view?.reading?.audio;
  const recordedNow = !!audio && !failed.has(audio.key);
  useEffect(() => {
    if (!view) return;
    if (key !== shown.current) {
      speaker.current?.stop();
      player.current?.stop();
      shown.current = key;
    }
    const over = !!view.answer || !view.text;
    const r = view.reading;
    if (over) {
      speaker.current?.stop();
      if (view.answer) player.current?.stop();
      else player.current?.follow(null);
      return;
    }
    if (r?.audio && recordedNow) {
      speaker.current?.stop();
      player.current?.follow({ key: r.audio.key, startedAt: r.startedAt, rate: r.audio.rate, pausedAt: r.pausedAt });
    } else if (r) {
      player.current?.follow(null);
      speaker.current?.follow({ text: view.text!, startedAt: r.startedAt, wpm: r.wpm, pausedAt: r.pausedAt });
    } else {
      player.current?.follow(null);
      speaker.current?.follow(null);
    }
  }, [view, status, recordedNow, key]);

  // Tell the room whether this device reads aloud (again after each reconnection: the room keeps it per connection).
  const readsAloud = hasRecordings || status === 'ready';
  useEffect(() => {
    if (enabled && connected && (hasRecordings || status !== 'checking')) client.voice(readsAloud);
  }, [enabled, connected, status, hasRecordings, readsAloud, client]);

  // Whether this question is read aloud here: decided while it is read, and remembered until it is over.
  let aloud = false;
  if (enabled && view && !view.answer) {
    if (view.reading) {
      aloud = recordedNow || status === 'ready';
      aloudFor.current.set(key, aloud);
    } else aloud = aloudFor.current.get(key) ?? readsAloud;
  }

  return {
    recorded: hasRecordings,
    progress: recordedVoice ? { state: recordedVoice.state, done: recordedVoice.done, total: recordedVoice.total } : null,
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
    sample: () => {
      primed.current = true;
      if (recordedVoice?.sample && player.current) {
        void player.current.playOnce(recordedVoice.sample, recordedVoice.rate).catch(() => {});
        return;
      }
      if (platform) speakSample(platform, voice);
    },
    prime: () => {
      if (primed.current) return;
      primed.current = true;
      player.current?.prime();
      if (platform && status === 'ready') unlockSpeech(platform);
    },
    blocked,
    allow: () => {
      setBlocked(false);
      if (platform) unlockSpeech(platform);
      player.current?.unblock();
      speaker.current?.unblock();
    },
    aloud,
  };
}

/** The lobby's sound check for a match read aloud: Rebound's voice (or the device's), a sample, what to expect. */
export function SoundCheck({ speech }: { speech: MatchSpeech }) {
  const progress = speech.progress;
  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>Read aloud</h3>
      {speech.recorded ? (
        <>
          <p className="small" style={{ margin: 0 }}>
            Rebound’s voice reads each question on every device at the same moment, and nothing shows until it is over; then the question and its
            answer appear. Turn your sound on, and try it:
          </p>
          {progress?.state === 'preparing' && (
            <p className="small muted" style={{ margin: 0 }} aria-live="polite">
              Recording the questions: {progress.done} of {progress.total}…
            </p>
          )}
          <div className="row">
            <button className="btn btn-small" onClick={speech.sample} disabled={progress?.state === 'preparing'}>
              Play a sample
            </button>
          </div>
        </>
      ) : (
        <>
          {speech.status === 'checking' && <p className="small muted" style={{ margin: 0 }}>Looking for this device’s voice…</p>}
          {speech.status === 'none' && (
            <Notice kind="warn">
              This device has no voice for reading aloud, so you will see each question as text instead, revealed at the same pace. The other players
              will see that you read the text.
            </Notice>
          )}
          {speech.status === 'ready' && (
            <>
              <p className="small" style={{ margin: 0 }}>
                Each question is read aloud on your device, and nothing shows until it is over; then the question and its answer appear. Turn your
                sound on, and try it:
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
                <button className="btn btn-small" onClick={speech.sample}>
                  Play a sample
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
