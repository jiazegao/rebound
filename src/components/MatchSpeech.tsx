/**
 * Online matches read aloud: this device's voice (found, chosen and tried in the lobby) and the speaker that follows
 * each question's reading on the server's timeline (src/lib/speech.ts). A device with no voice shows the text
 * instead, and tells the room, which shows the others who reads the text.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomClient, RoomView } from '../lib/room';
import { browserSpeech, chooseVoice, englishVoices, loadVoices, QuestionSpeaker, savedVoice, saveVoice, speakSample, unlockSpeech, type VoiceLike } from '../lib/speech';
import { Notice } from './ui';

/** 'checking': looking for a voice; 'ready': questions are read aloud here; 'none': this device shows the text. */
export type VoiceStatus = 'checking' | 'ready' | 'none';

export interface MatchSpeech {
  status: VoiceStatus;
  /** The voices to choose from (English ones, when the device has any). */
  voices: VoiceLike[];
  voice: VoiceLike | null;
  setVoice: (voiceURI: string) => void;
  /** Says the sample line. */
  sample: () => void;
  /** Lets the page speak from now on: call it from a click or a tap (Join, Play a sample, Buzz). */
  prime: () => void;
  /** The browser is waiting for a tap before it speaks. */
  blocked: boolean;
  allow: () => void;
}

/** Whether the question on screen is the same one (a new toss-up, its bonus, or the next one starts afresh). */
const questionKey = (view: RoomView | null) => (view ? `${view.questionId ?? ''}|${view.label}` : '');

export function useMatchSpeech(enabled: boolean, view: RoomView | null, client: RoomClient, connected: boolean): MatchSpeech {
  const platform = useMemo(() => (enabled ? browserSpeech() : null), [enabled]);
  const [status, setStatus] = useState<VoiceStatus>('checking');
  const [voices, setVoices] = useState<VoiceLike[]>([]);
  const [voice, setVoiceState] = useState<VoiceLike | null>(null);
  const [blocked, setBlocked] = useState(false);
  const speaker = useRef<QuestionSpeaker | null>(null);
  const primed = useRef(false);
  const shown = useRef('');

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
      // The voice keeps failing: this device shows the text from now on (and tells the room).
      () => setStatus('none'),
    );
    speaker.current = s;
    return () => {
      s.stop();
      speaker.current = null;
    };
    // The voice changes through setVoice, without a new speaker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, status, client]);

  // Follow the reading: a new question starts afresh; once its answer shows (it is over) the voice stops.
  useEffect(() => {
    const s = speaker.current;
    if (!s || !view) return;
    const key = questionKey(view);
    if (key !== shown.current) {
      s.stop();
      shown.current = key;
    }
    if (view.answer || !view.text) s.stop();
    else if (view.reading) s.follow({ text: view.text, startedAt: view.reading.startedAt, wpm: view.reading.wpm, pausedAt: view.reading.pausedAt });
    else s.follow(null);
  }, [view, status]);

  // Tell the room whether this device reads aloud (again after each reconnection: the room keeps it per connection).
  useEffect(() => {
    if (enabled && connected && status !== 'checking') client.voice(status === 'ready');
  }, [enabled, connected, status, client]);

  return {
    status,
    voices,
    voice,
    setVoice: (voiceURI) => {
      const next = voices.find((v) => v.voiceURI === voiceURI) ?? null;
      if (!next) return;
      saveVoice(voiceURI);
      setVoiceState(next);
      speaker.current?.setVoice(next);
    },
    sample: () => {
      if (!platform) return;
      primed.current = true;
      speakSample(platform, voice);
    },
    prime: () => {
      if (!platform || primed.current || status !== 'ready') return;
      primed.current = true;
      unlockSpeech(platform);
    },
    blocked,
    allow: () => {
      if (!platform) return;
      unlockSpeech(platform);
      setBlocked(false);
      speaker.current?.unblock();
    },
  };
}

/** The lobby's sound check for a match read aloud: the voice to use, a sample, and what to expect. */
export function SoundCheck({ speech }: { speech: MatchSpeech }) {
  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>Read aloud</h3>
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
                      {v.name} ({v.lang})
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
    </div>
  );
}
