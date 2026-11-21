/**
 * Checks the Claude API key before any paid step runs.
 *
 *   npx tsx scripts/gen/key.ts        (npm run gen:key)
 *
 * It looks for the key in the REBOUND_ANTHROPIC_API_KEY environment variable (then ANTHROPIC_API_KEY), asks
 * the API which models the key can use (free), and makes one very small paid call, to show that the account
 * can pay. It prints what it found and never the key itself. Exits with 1 when the key is missing or does
 * not work.
 *
 * A key made for a whole organization must name a workspace with every request. When the API says so, this
 * finds the organization's workspace and remembers it for the other scripts (llm.ts, WORKSPACE_FILE).
 */
import Anthropic from '@anthropic-ai/sdk';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, claudeApi, KEY_VARIABLES, KeyError, keyVariable, needsWorkspace, PRICES, rememberWorkspace, WORKSPACE_VARIABLE } from './llm';

/**
 * The workspace an organization's key should use: the only one there is, or the organization's default one
 * when there are several. Null when that cannot be told.
 */
export async function findWorkspace(client: Anthropic, log: (line: string) => void): Promise<{ id: string; name: string } | null> {
  const active = async (includeDefault: boolean) => {
    const out: Array<{ id: string; name: string }> = [];
    for await (const w of client.beta.organization.workspaces.list({ include_default: includeDefault })) if (!w.archived_at) out.push({ id: w.id, name: w.name });
    return out;
  };
  const all = await active(true);
  if (all.length === 1) return all[0]!;
  if (all.length === 0) {
    log('The key is for a whole organization, and it can list no workspace to use.');
    return null;
  }
  // The default workspace is the one the list leaves out when asked to.
  const others = new Set((await active(false)).map((w) => w.id));
  const defaults = all.filter((w) => !others.has(w.id));
  if (defaults.length === 1) {
    log(`The organization has ${all.length} workspaces; using its default one. Set ${WORKSPACE_VARIABLE} to another's id to change that.`);
    return defaults[0]!;
  }
  log(`The organization has ${all.length} workspaces (${all.map((w) => w.name).join(', ')}). Set ${WORKSPACE_VARIABLE} to the id of the one to use.`);
  return null;
}

export async function checkKey(log: (line: string) => void = console.log): Promise<boolean> {
  const variable = keyVariable();
  if (!variable) {
    log(`No key: neither ${KEY_VARIABLES.join(' nor ')} is set in this session.`);
    log(`In a Claude Code cloud session, save the key on the environment as ${KEY_VARIABLES[0]}: a variable called ${KEY_VARIABLES[1]} is kept from the commands a session runs.`);
    log('A variable reaches a session when it starts; one that is already running gets it when its machine next restarts.');
    return false;
  }
  log(`Found a key in ${variable}.`);
  try {
    let api = claudeApi();
    const available = new Set<string>();
    const listModels = async () => {
      for await (const model of api.client.models.list()) available.add(model.id);
    };
    try {
      await listModels();
    } catch (err) {
      if (!needsWorkspace(err)) throw err;
      let workspace: { id: string; name: string } | null;
      try {
        workspace = await findWorkspace(api.client, log);
      } catch (inner) {
        if (!(inner instanceof Anthropic.PermissionDeniedError)) throw inner;
        log('The key is accepted. It is a key for a whole organization, so each request must name a workspace, and this key may not list the organization’s workspaces.');
        log(`Find the workspace’s ID in the Claude Console (Settings, Workspaces, the ID column; it starts with "wrkspc_") and set ${WORKSPACE_VARIABLE} to it. Or use a key made for one workspace, which needs no ID.`);
        return false;
      }
      if (!workspace) return false;
      rememberWorkspace(workspace);
      log(`The key is for a whole organization, so each request names a workspace: using "${workspace.name}", remembered for the other scripts.`);
      api = claudeApi();
      await listModels();
    }
    const wanted = Object.keys(PRICES);
    const missing = wanted.filter((m) => !available.has(m) && ![...available].some((id) => id.startsWith(`${m}-`)));
    log(`The key is accepted. It can use ${available.size} models${missing.length ? `, but not: ${missing.join(', ')}` : `, including the pipeline's ${wanted.length}`}.`);
    const reply = await ask(api, { id: 'key-check', step: 'key-check', model: 'claude-haiku-5-5', effort: 'low', system: 'Reply with the one word you are asked for and nothing else.', user: 'Say the word: ready', maxTokens: 300 });
    if (reply.outcome !== 'ok') {
      log(`A small paid call did not go through: ${reply.note ?? reply.outcome}`);
      return false;
    }
    log(`A small paid call worked: ${reply.usage.input} tokens in, ${reply.usage.output} out, $${reply.cost.toFixed(6)}.`);
    return missing.length === 0;
  } catch (err) {
    if (err instanceof KeyError) log(err.message);
    else log(`The check failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit((await checkKey()) ? 0 : 1);
}
