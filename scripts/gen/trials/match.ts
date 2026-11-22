/**
 * Trial: the answer matcher on alternates whose standing DOE itself printed.
 *
 *   npx tsx scripts/gen/trials/match.ts [--model claude-haiku-5-5] [--limit 40] [--mode live|batch]
 *
 * DOE's answer lines carry two kinds of alternate: ACCEPT entries, which a judge takes, and DO NOT ACCEPT
 * entries, which a judge refuses. Each is put to the matcher as a player's answer, with its own list hidden,
 * so the matcher has to tell by itself:
 *
 *  - a DO NOT ACCEPT entry it accepts is the failure that matters: the matcher would then pass a solver's
 *    near miss as agreement with the key;
 *  - an ACCEPT entry it refuses costs only a second look. Some of these DOE accepts out of leniency (a less
 *    specific name), which the matcher is told to refuse, so this share cannot reach 100%.
 *
 * In the pipeline the matcher sees both lists, so it does better there than here.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Level, Question } from '../../../src/core/schema';
import { eligible, loadLibrary, type LibraryQuestion } from '../library';
import type { ModelApi, ModelReply } from '../llm';
import { MATCH_PROMPT, matchRequest, readMatch } from '../steps/match';
import { plain } from '../text';
import { perCall, runTrial, seeded, seedOf, shuffled, trial, trialArgs, writeSummary, type TrialArgs } from './common';

export interface MatchItem {
  id: string;
  level: Level;
  /** Which of DOE's lists the answer came from. */
  from: 'accept' | 'reject';
  /** The question as the matcher is shown it: the list the answer came from is hidden. */
  question: Question;
  said: string;
}

/** `perList` alternates from each of DOE's two lists, on short-answer questions of 2014–22, the same every time. */
export function matchItems(library: readonly LibraryQuestion[], perList = 150): MatchItem[] {
  const pool = eligible(library).filter((x) => x.question.format === 'short_answer');
  const pick = (from: MatchItem['from']) => {
    const out: MatchItem[] = [];
    for (const x of shuffled(pool, seeded(seedOf(`match/${from}`)))) {
      const q = x.question;
      // An entry that says the main answer over again in other letters tests nothing.
      const entry = (from === 'accept' ? q.accept : q.reject).find((e) => e.trim() && plain(e) !== plain(q.answer));
      if (!entry) continue;
      out.push({ id: `${from}-${q.id}`, level: x.level, from, question: from === 'accept' ? { ...q, accept: [] } : { ...q, reject: [] }, said: entry });
      if (out.length >= perList) break;
    }
    return out;
  };
  return [...pick('accept'), ...pick('reject')];
}

export async function matchTrial(library: readonly LibraryQuestion[], args: TrialArgs, api?: ModelApi) {
  const items = matchItems(library, args.limit ? Math.ceil(args.limit / 2) : 150);
  const requests = items.map((it) => matchRequest(it.id, it.question, it.said, it.level, args.model));
  const replies = await runTrial(`match-${args.model}-${MATCH_PROMPT}`, requests, args, 150, api);
  const rows = items.map((it) => {
    const reply = replies.get(it.id);
    const m = reply ? readMatch(reply) : null;
    return { id: it.id, from: it.from, stem: it.question.stem, answerLine: it.question.answer, said: it.said, verdict: m?.verdict ?? null, why: m?.why ?? reply?.note ?? 'no reply' };
  });
  const count = (from: MatchItem['from']) => {
    const rs = rows.filter((r) => r.from === from);
    return { entries: rs.length, accepted: rs.filter((r) => r.verdict === 'accept').length, rejected: rs.filter((r) => r.verdict === 'reject').length, unsure: rs.filter((r) => r.verdict === 'unsure').length, unread: rs.filter((r) => !r.verdict).length };
  };
  const summary = {
    about: "The answer matcher on alternates DOE printed (scripts/gen/trials/match.ts), each put to it as a player's answer with its own list hidden. A DO NOT ACCEPT entry that it accepts is the failure that matters. An ACCEPT entry that it refuses costs a second look; DOE accepts some of these out of leniency, which the matcher is told to refuse.",
    model: args.model,
    prompt: MATCH_PROMPT,
    run: new Date().toISOString().slice(0, 10),
    acceptEntries: count('accept'),
    doNotAcceptEntries: count('reject'),
    calls: perCall(items.map((it) => replies.get(it.id)).filter((r): r is ModelReply => !!r)),
    doNotAcceptEntriesAccepted: rows.filter((r) => r.from === 'reject' && r.verdict === 'accept'),
    acceptEntriesRefused: rows.filter((r) => r.from === 'accept' && r.verdict === 'reject'),
    results: rows,
  };
  const a = summary.acceptEntries;
  const d = summary.doNotAcceptEntries;
  console.log(`\nACCEPT entries: ${a.accepted} accepted, ${a.rejected} refused, ${a.unsure} unsure (of ${a.entries}).`);
  console.log(`DO NOT ACCEPT entries: ${d.rejected} refused, ${d.accepted} accepted, ${d.unsure} unsure (of ${d.entries}).`);
  for (const r of summary.doNotAcceptEntriesAccepted) console.log(`  accepted a DO NOT ACCEPT entry  ${r.id}: "${r.said}" for ${r.answerLine}. ${r.why}`);
  console.log(`Per call: ${JSON.stringify(summary.calls.meanTokens)}, $${summary.calls.costPerCall}.`);
  if (!args.limit) console.log(`Summary: ${path.relative(process.cwd(), writeSummary(`match.${args.model}`, summary))}`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  trial(async () => {
    await matchTrial(loadLibrary(), trialArgs({ model: 'claude-haiku-5-5', mode: 'live' }));
  });
}
