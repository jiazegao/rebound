/**
 * Which workspace an organization's key is used in. A key made for one workspace needs none of this.
 *
 * The id comes from the REBOUND_ANTHROPIC_WORKSPACE_ID environment variable, or from the file where
 * `npm run gen:key` remembers the workspace it found. An id is no secret, but it names the account, so the
 * file is in the bank folder (ledger.ts), outside the repository.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BANK_DIR } from './ledger';
import { claudeApi, WORKSPACE_VARIABLE } from './llm';

export const WORKSPACE_FILE = path.join(BANK_DIR, 'workspace.json');

/** The workspace requests are made in, when one has been named or found. */
export function workspaceId(file = WORKSPACE_FILE): string | null {
  const named = process.env[WORKSPACE_VARIABLE]?.trim();
  if (named) return named;
  try {
    const id = (JSON.parse(readFileSync(file, 'utf8')) as { id?: unknown }).id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

export function rememberWorkspace(workspace: { id: string; name: string }, file = WORKSPACE_FILE): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...workspace, found: new Date().toISOString().slice(0, 10) })}\n`);
}

/** The Claude API with the key from the environment, in the workspace that was named or found. */
export function connect() {
  return claudeApi(undefined, workspaceId());
}
