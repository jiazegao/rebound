/**
 * Online matches read aloud. Each question plays from its recording in Rebound's voice (src/lib/voice.ts) on every
 * device at the same moment: the device fetches the match's recordings in the lobby and plays each in step with the
 * server's clock (src/lib/recorded.ts). A question with no recording (a team's own packet, say), or a device that
 * cannot fetch or play the recordings, shows the text instead, revealed at the same pace; the device tells the room,
 * which shows the others who sees the text.
 */
import { useEffect, useRef, useState } from 'react';
import { RecordedReader } from '../lib/recorded';
import type { RoomClient, RoomView } from '../lib/room';
import { fetchRecording, loadVoiceIndex, recordingUrl, type VoiceIndex } from '../lib/voice';
import { Notice } from './ui';

export interface MatchSpeech {
  /** This device can play the recordings (it has their addresses); null while it is finding out. */
  canPlay: boolean | null;
  /** How many of the match's questions have a recording (the others show as text). */
  coverage: { recorded: number; total: number } | null;
  /** Plays the sample line. */
  sample: () => void;
  /** Lets the page play from now on: call it from a click or a tap (Join, Play a sample, Buzz). */
  prime: () => void;
  /** The browser is waiting for a tap before it plays. */
  blocked: boolean;
  allow: () => void;
  /** This device plays the question on screen: its text stays hidden until the question is over. */
  aloud: boolean;
  /** The question on screen has no recording (it shows as text for everyone). */
  unrecorded: boolean;
}

/** Whether the question on screen is the same one (a new toss-up, its bonus, or the next one starts afresh). */
const questionKey = (view: RoomView | null) => (view ? `${view.questionId ?? ''}|${view.label}` : '');

export function useMatchSpeech(enabled: boolean, view: RoomView | null, client: RoomClient, connected: boolean): MatchSpeech {
  const voice = enabled ? (view?.match?.voice ?? null) : null;
  // undefined: still looking for the index of recordings; null: it could not be fetched.
  const [index, setIndex] = useState<VoiceIndex | null | undefined>(undefined);
  const [blocked, setBlocked] = useState(false);
  // Recordings this device could not fetch or play: it shows those questions as text.
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const player = useRef<RecordedReader | null>(null);
  const primed = useRef(false);
  const shown = useRef('');
  // Whether each question was read aloud here, and whether it had a recording, remembered from its reading for the
  // time after it (its answer window).
  const aloudFor = useRef(new Map<string, boolean>());
  const unrecordedFor = useRef(new Map<string, boolean>());

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void loadVoiceIndex().then((found) => live && setIndex(found));
    return () => {
      live = false;
    };
  }, [enabled]);

  const canPlay = !enabled || index === undefined ? null : !!index && typeof Audio !== 'undefined';

  // One audio element for the page, kept in step with the server.
  useEffect(() => {
    if (!canPlay) return;
    const r = new RecordedReader(
      new Audio(),
      fetchRecording,
      () => client.serverNow(),
      () => setBlocked(true),
      (url) => setFailed((f) => new Set(f).add(url)),
    );
    player.current = r;
    return () => {
      r.stop();
      player.current = null;
    };
  }, [canPlay, client]);

  // Fetch the match's recordings ahead, a few at a time.
  const ahead = voice && index ? voice.recordings.map((r) => recordingUrl(index, r)).join(' ') : '';
  useEffect(() => {
    if (ahead) player.current?.prefetch(ahead.split(' '));
  }, [ahead, canPlay]);

  // Follow the reading: a new question starts afresh; once its answer shows (it is over) the recording stops.
  const key = questionKey(view);
  const audio = view?.reading?.audio;
  const url = audio && index ? recordingUrl(index, audio) : null;
  const playable = !!canPlay && !!url && !failed.has(url);
  useEffect(() => {
    if (!view) return;
    if (key !== shown.current) {
      player.current?.stop();
      shown.current = key;
    }
    const over = !!view.answer || !view.text;
    const r = view.reading;
    if (over) {
      if (view.answer) player.current?.stop();
      else player.current?.follow(null);
      return;
    }
    if (r?.audio && playable && url) player.current?.follow({ key: url, startedAt: r.startedAt, rate: r.audio.rate, pausedAt: r.pausedAt });
    else player.current?.follow(null);
  }, [view, playable, url, key]);

  // Tell the room whether this device plays the recordings (again after each reconnection: the room keeps it per connection).
  useEffect(() => {
    if (enabled && connected && canPlay !== null) client.voice(canPlay);
  }, [enabled, connected, canPlay, client]);

  // Whether this question is read aloud here: decided while it is read, and remembered until it is over.
  let aloud = false;
  let unrecorded = false;
  if (enabled && view && !view.answer) {
    if (view.reading) {
      aloud = playable;
      unrecorded = !view.reading.audio;
      aloudFor.current.set(key, aloud);
      unrecordedFor.current.set(key, unrecorded);
    } else {
      aloud = aloudFor.current.get(key) ?? (!!canPlay && !!voice && voice.recorded > 0);
      unrecorded = unrecordedFor.current.get(key) ?? false;
    }
  }

  return {
    canPlay,
    coverage: voice ? { recorded: voice.recorded, total: voice.total } : null,
    sample: () => {
      primed.current = true;
      const p = player.current;
      if (!p || !index) return;
      p.prime();
      void p.playOnce(recordingUrl(index, index.sample), voice?.rate ?? 1).catch(() => {});
    },
    prime: () => {
      if (primed.current) return;
      primed.current = true;
      player.current?.prime();
    },
    blocked,
    allow: () => {
      setBlocked(false);
      player.current?.unblock();
    },
    aloud,
    unrecorded,
  };
}

/** The lobby's sound check for a match read aloud: Rebound's voice, a sample, and what to expect. */
export function SoundCheck({ speech }: { speech: MatchSpeech }) {
  const coverage = speech.coverage;
  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>Read aloud</h3>
      {speech.canPlay === null ? (
        <p className="small muted" style={{ margin: 0 }}>
          Looking for Rebound’s voice…
        </p>
      ) : !speech.canPlay ? (
        <Notice kind="warn">
          Rebound’s voice can’t be reached on this device right now (is it offline?), so you will see each question as text instead, revealed at the same
          pace. The other players will see that you read the text.
        </Notice>
      ) : (
        <>
          <p className="small" style={{ margin: 0 }}>
            Rebound’s voice reads each question on every device at the same moment, and nothing shows until it is over; then the question and its answer
            appear. Turn your sound on, and try it:
          </p>
          <div className="row">
            <button className="btn btn-small" onClick={speech.sample}>
              Play a sample
            </button>
          </div>
        </>
      )}
      {coverage && coverage.recorded < coverage.total && (
        <p className="small muted" style={{ margin: 0 }}>
          {coverage.recorded === 0
            ? 'This round has no recordings (a team’s own packet, say), so its questions show as text.'
            : `${coverage.recorded} of the ${coverage.total} questions have a recording; the others show as text.`}
        </p>
      )}
    </div>
  );
}
