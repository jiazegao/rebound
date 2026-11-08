/**
 * Deliveries to other Durable Objects that must not be lost: a game's answers for each player's account, and a
 * finished online match for its team. Each is stored in the same transaction as the change that makes it, sent at
 * once, and retried from the object's alarm while the other object cannot be reached. Delivering twice is harmless
 * (answers and games are stored by their ids), so a delivery is removed only after it arrived.
 */

export const OUTBOX_SCHEMA = `
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  payload TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL
);
`;

/** Waits before each retry; after the last one the delivery is dropped (and logged). */
const RETRY_MS = [30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];

export type Delivery = {
  id: number;
  kind: string;
  target: string;
  payload: string;
  tries: number;
};

export class Outbox {
  /** Deliveries being sent right now, so the alarm and a request never send the same one at once. */
  private readonly sending = new Set<number>();

  constructor(private readonly sql: SqlStorage) {}

  /** Adds a delivery. It is sent by the next `flush`; the alarm picks it up if that never happens. */
  add(kind: string, target: string, payload: unknown, now: number): void {
    this.sql.exec('INSERT INTO outbox (kind, target, payload, tries, next_at) VALUES (?, ?, ?, 0, ?)', kind, target, JSON.stringify(payload), now + RETRY_MS[0]!);
  }

  /** When the alarm should next try (the earliest pending delivery), or null when nothing is pending. */
  nextAt(): number | null {
    return this.sql.exec<{ at: number | null }>('SELECT MIN(next_at) AS at FROM outbox').one().at;
  }

  pending(): number {
    return this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM outbox').one().n;
  }

  /**
   * Sends deliveries with `send`: every pending one (`all`, right after adding them), or those whose retry time has
   * come. A failed delivery waits longer before each retry.
   */
  async flush(send: (d: Delivery) => Promise<void>, now: number, all = false): Promise<void> {
    const rows = this.sql
      .exec<Delivery>(`SELECT id, kind, target, payload, tries FROM outbox${all ? '' : ' WHERE next_at <= ?'} ORDER BY id`, ...(all ? [] : [now]))
      .toArray()
      .filter((d) => !this.sending.has(d.id));
    await Promise.all(
      rows.map(async (d) => {
        this.sending.add(d.id);
        let failure: unknown = null;
        try {
          await send(d);
        } catch (error) {
          failure = error ?? 'failed';
        }
        this.sending.delete(d.id);
        try {
          const tries = d.tries + 1;
          if (failure === null) {
            this.sql.exec('DELETE FROM outbox WHERE id = ?', d.id);
          } else if (tries >= RETRY_MS.length) {
            console.error(`Dropping a ${d.kind} delivery after ${tries} tries:`, failure instanceof Error ? failure.message : String(failure));
            this.sql.exec('DELETE FROM outbox WHERE id = ?', d.id);
          } else {
            console.error(`A ${d.kind} delivery failed (it will be retried):`, failure instanceof Error ? failure.message : String(failure));
            this.sql.exec('UPDATE outbox SET tries = ?, next_at = ? WHERE id = ?', tries, Date.now() + RETRY_MS[tries]!, d.id);
          }
        } catch {
          // The object's storage was deleted meanwhile (a deleted team or a closed room): nothing is left to track.
        }
      }),
    );
  }
}
