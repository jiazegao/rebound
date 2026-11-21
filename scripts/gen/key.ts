/**
 * Checks the Claude API key before any paid step runs.
 *
 *   npx tsx scripts/gen/key.ts        (npm run gen:key)
 *
 * It looks for the key in the ANTHROPIC_API_KEY environment variable, asks the API which models the key can
 * use (free), and makes one very small paid call, to show that the account can pay. It prints what it found
 * and never the key itself. Exits with 1 when the key is missing or does not work.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, claudeApi, hasKey, KEY_VARIABLE, KeyError, PRICES } from './llm';

export async function checkKey(log: (line: string) => void = console.log): Promise<boolean> {
  if (!hasKey()) {
    log(`No key: the ${KEY_VARIABLE} environment variable is not set in this session.`);
    log('In a Claude Code cloud session, a variable added to the environment reaches a session when it starts, or when it next wakes after being idle.');
    return false;
  }
  try {
    const api = claudeApi();
    const available = new Set<string>();
    for await (const model of api.client.models.list()) available.add(model.id);
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
