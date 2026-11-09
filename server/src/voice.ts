/**
 * VoiceCache: Rebound's recordings for matches and solo practice read aloud (tts.ts), kept so each question is
 * recorded once and reused by every later match and every player. Sixteen objects share them, by the first character of each recording's key (a hash
 * of the voice and the words), so no one object serves every request.
 */
import { DurableObject } from 'cloudflare:workers';
import { registryObject } from './objects';
import { synthesize, ttsSettings } from './tts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS audio (
  key TEXT PRIMARY KEY,
  mp3 BLOB NOT NULL,
  duration_ms INTEGER NOT NULL,
  chars INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`;

const monthOf = (now: number) => new Date(now).toISOString().slice(0, 7);

export class VoiceCache extends DurableObject<Env> {
  /** Recordings being made right now, so two matches asking at once share one request to Google. */
  private readonly making = new Map<string, Promise<number | null>>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(SCHEMA);
  }

  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }

  /** The recording's length in ms, if it is kept here. */
  async lookup(key: string): Promise<number | null> {
    return this.sql.exec<{ duration_ms: number }>('SELECT duration_ms FROM audio WHERE key = ?', key).toArray()[0]?.duration_ms ?? null;
  }

  /**
   * The recording of `text` under `key`, made now unless it is kept: its length in ms, or null when it cannot be
   * made (no voice set up, this month's characters used up, or Google failed). `share`: the part of the month's
   * characters this request may use (solo practice keeps some for matches).
   */
  async ensure(key: string, text: string, share = 1): Promise<number | null> {
    const kept = await this.lookup(key);
    if (kept !== null) return kept;
    let made = this.making.get(key);
    if (!made) {
      made = this.make(key, text, share).finally(() => this.making.delete(key));
      this.making.set(key, made);
    }
    return made;
  }

  private async make(key: string, text: string, share: number): Promise<number | null> {
    const settings = ttsSettings(this.env);
    if (!settings) return null;
    const month = monthOf(Date.now());
    const registry = registryObject(this.env);
    if (!settings.fake && !(await registry.reserveTtsChars(month, text.length, Math.floor(settings.monthlyChars * share)))) return null;
    try {
      const { mp3, durationMs } = await synthesize(text, settings);
      const bytes = mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength);
      this.sql.exec(
        'INSERT OR REPLACE INTO audio (key, mp3, duration_ms, chars, created_at) VALUES (?, ?, ?, ?, ?)',
        key,
        bytes,
        durationMs,
        text.length,
        Date.now(),
      );
      return durationMs;
    } catch (error) {
      console.error('Recording a question failed:', error instanceof Error ? error.message : String(error));
      if (!settings.fake) await registry.refundTtsChars(month, text.length);
      return null;
    }
  }

  /** The recording (MP3), or null. */
  async read(key: string): Promise<ArrayBuffer | null> {
    return this.sql.exec<{ mp3: ArrayBuffer }>('SELECT mp3 FROM audio WHERE key = ?', key).toArray()[0]?.mp3 ?? null;
  }
}
