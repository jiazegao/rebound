/**
 * Stubs for the Durable Objects, by the names they are addressed with (docs/SERVER.md, "Durable Objects"). Callers
 * check ids against ID_PATTERN first, so random paths never wake an object.
 */

export const userObject = (env: Env, userId: string) => env.USER.get(env.USER.idFromName(userId));
export const teamObject = (env: Env, teamId: string) => env.TEAMS.get(env.TEAMS.idFromName(teamId));
export const roomObject = (env: Env, roomId: string) => env.ROOM.get(env.ROOM.idFromName(roomId));
export const directoryObject = (env: Env) => env.DIRECTORY.get(env.DIRECTORY.idFromName('global'));
export const registryObject = (env: Env) => env.REGISTRY.get(env.REGISTRY.idFromName('global'));
/** The recordings for matches read aloud, shared by sixteen objects by the first character of the key. */
export const voiceObject = (env: Env, key: string) => env.VOICE.get(env.VOICE.idFromName(`voice-${key[0]}`));

/** Whether a SQLite table exists (fresh objects have none until they hold something). */
export function hasTable(sql: SqlStorage, name: string): boolean {
  return sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name).toArray().length > 0;
}

/** Meta values in a `meta (key, value)` table. */
export function getMeta(sql: SqlStorage, key: string): string | null {
  return sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0]?.value ?? null;
}

export function setMeta(sql: SqlStorage, key: string, value: string | number): void {
  sql.exec('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, String(value));
}
