/**
 * Rebound's recorded voice (scripts/voice/README.md): every question in the library recorded with Kokoro on a computer
 * and served as MP3 files by two small Cloudflare Workers. The site's index of them, data/voice/ (written by
 * scripts/voice/publish.py), says where they are and, set by set, each recording's length and fingerprint. A question
 * plays from its recording when its words have one; any other question (a team's own packet, say) is shown as text.
 */
import { setIdOf } from '../core/drill';
import { audioKey, RECORDED_VOICE, spokenFor } from '../core/speech';

/** A published recording: its name (a hash of the voice and the words), its length in ms, its file's fingerprint. */
export interface PublishedRecording {
  key: string;
  ms: number;
  v: string;
}

/** data/voice/index.json. */
export interface VoiceIndex {
  voice: string;
  /** The Workers that serve the files, by the first character of a recording's name (`hostOf`). */
  hosts: string[];
  recordings: number;
  questions: number;
  /** The line played to try the voice. */
  sample: PublishedRecording;
  /** Each set that has recordings, with how many. */
  sets: Record<string, number>;
}

const BASE = 'data/voice/';

/** Which of `count` Workers serves a recording, by its name's first character (as scripts/voice/publish.py, host_of). */
export function hostOf(key: string, count: number): number {
  return Math.floor((parseInt(key[0] ?? '0', 16) * count) / 16);
}

/** Where a recording is: its Worker, its name, and its fingerprint (a recording made again gets a new address). */
export function recordingUrl(index: Pick<VoiceIndex, 'hosts'>, r: { key: string; v: string }): string {
  return `${index.hosts[hostOf(r.key, index.hosts.length)]}/${r.key}.mp3?v=${r.v}`;
}

const RECORDING = (r: unknown): r is PublishedRecording =>
  !!r &&
  typeof r === 'object' &&
  /^[0-9a-f]{40}$/.test(String((r as PublishedRecording).key)) &&
  Number.isInteger((r as PublishedRecording).ms) &&
  /^[0-9a-f]{8}$/.test(String((r as PublishedRecording).v));

/** The index, if it is for this voice and says where the files are; null otherwise (questions are shown as text). */
export function usableIndex(value: unknown): VoiceIndex | null {
  if (!value || typeof value !== 'object') return null;
  const index = value as VoiceIndex;
  if (index.voice !== RECORDED_VOICE) return null;
  if (!Array.isArray(index.hosts) || index.hosts.length === 0 || !index.hosts.every((h) => typeof h === 'string' && /^https?:\/\/[^/\s]+$/.test(h))) return null;
  if (!index.sets || typeof index.sets !== 'object' || !RECORDING(index.sample)) return null;
  return index;
}

let index: Promise<VoiceIndex | null> | null = null;

/** The index (fetched once; tried again later if it could not be fetched). */
export function loadVoiceIndex(): Promise<VoiceIndex | null> {
  if (!index) {
    index = fetch(`${BASE}index.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then(usableIndex, () => null)
      .then((found) => {
        if (!found) index = null;
        return found;
      });
  }
  return index;
}

const sets = new Map<string, Promise<Map<string, [number, string]> | null>>();

/** A set's recordings by name: [length in ms, fingerprint]. */
function loadSet(setId: string): Promise<Map<string, [number, string]> | null> {
  let found = sets.get(setId);
  if (!found) {
    found = fetch(`${BASE}${encodeURIComponent(setId)}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<Record<string, [number, string]>>) : null))
      .then(
        (body) => (body ? new Map(Object.entries(body)) : null),
        () => null,
      )
      .then((map) => {
        if (!map) sets.delete(setId); // tried again next time (offline, say)
        return map;
      });
    sets.set(setId, found);
  }
  return found;
}

type Recordable = { id: string; stem: string; choices?: Record<'W' | 'X' | 'Y' | 'Z', string> };

/**
 * A question's recording; or why there is none: 'unrecorded' (a question of no set in the index, such as a team's
 * own packet, or words changed since the recordings were published), 'unreachable' (the index or the set's list
 * could not be fetched: offline, say).
 */
export async function lookupRecording(q: Recordable): Promise<PublishedRecording | 'unrecorded' | 'unreachable'> {
  const found = await loadVoiceIndex();
  if (!found) return 'unreachable';
  const setId = setIdOf(q.id);
  if (!(setId in found.sets)) return 'unrecorded';
  const set = await loadSet(setId);
  if (!set) return 'unreachable';
  const key = await audioKey(RECORDED_VOICE, spokenFor({ stem: q.stem, choices: q.choices }));
  const entry = set.get(key);
  return entry ? { key, ms: entry[0], v: entry[1] } : 'unrecorded';
}

/** A question's recording, if it has one it can be played from now. */
export async function recordingFor(q: Recordable): Promise<PublishedRecording | null> {
  const found = await lookupRecording(q);
  return typeof found === 'string' ? null : found;
}

/** A recording's MP3, from its address. */
export async function fetchRecording(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The recording answered ${res.status}.`);
  return res.blob();
}

/** Tests only: forget what was fetched. */
export function resetVoiceForTests(): void {
  index = null;
  sets.clear();
}
