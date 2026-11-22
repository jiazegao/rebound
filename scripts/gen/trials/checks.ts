/**
 * Trial: the three checks of plan step 7 that use a tool, on questions whose right answer is known.
 *
 *   npx tsx scripts/gen/trials/checks.ts --compute [--model claude-sonnet-5-5] [--limit 60]
 *   npx tsx scripts/gen/trials/checks.ts --source  [--model claude-sonnet-5-5] [--limit 40]
 *   npx tsx scripts/gen/trials/checks.ts --second  [--model claude-opus-5-5]   [--limit 9]
 *
 *  --compute  DOE questions with numeric answers, worked again in code. DOE's keys are nearly always right, so
 *             a disagreement is a false alarm, or a right answer in a form the answer checker cannot match.
 *  --source   Does a search of the allowed sites support a right key, and contradict a wrong one? Right keys:
 *             DOE fact questions. Wrong keys: the seven answer letters DOE misprinted, shown as printed. Also
 *             the two keys the November 2026 pilot disputed, and the pilot's five questions that name a lab
 *             by a name it gave up in December 2025.
 *  --second   Does the second look overturn a wrong key and uphold a right one? The same wrong and disputed
 *             keys, each with what a solver said; right keys with a solver who was wrong; and spot checks.
 *
 * These calls use web search or code, so they go one at a time at full price, never in a batch. The numbers
 * after --limit above are the sizes used when it is left out; a run with --limit is a trial of the trial, and
 * writes no summary.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LETTERS, type Letter, type Level, type Question } from '../../../src/core/schema';
import { DOE_ERRATA } from '../../../src/core/importers/doeErrata';
import { loadLabs } from '../labs';
import { DATA_DIR, loadLibrary, type LibraryQuestion } from '../library';
import type { ModelApi, ModelReply } from '../llm';
import { loadSources } from '../sources';
import { isIdentifyAll, isNumericAnswer, isRank, withoutGuides } from '../text';
import { COMPUTE_PROMPT, computationAgrees, computeRequest, readComputation } from '../steps/compute';
import { readSecondLook, SECOND_PROMPT, secondLookRequest, type Ruling } from '../steps/second';
import { readSourceCheck, SOURCE_PROMPT, sourceRequest, type SourceVerdict } from '../steps/source';
import { perCall, runTrial, trial, trialArgs, writeSummary, type TrialArgs } from './common';
import { sampleDoe, type SampleItem } from './doe';

const share = (part: number, whole: number) => (whole ? Math.round((1000 * part) / whole) / 1000 : 0);

/** `count` of the items, spread evenly through the list (the sample is in order of level, category and tier). */
export function spread<T>(items: readonly T[], count: number): T[] {
  if (count <= 0 || count >= items.length) return [...items];
  return Array.from({ length: count }, (_, i) => items[Math.floor((i * items.length) / count)]!);
}

/* ---------------- the keys known to be wrong ---------------- */

export interface KnownCase {
  id: string;
  level: Level;
  kind: 'misprinted letter' | 'disputed key';
  /** The question with the key under test: for a misprint, the letter DOE printed. */
  question: Question;
  /** What a solver who had it right would have said. */
  solverSaid: string;
  /** The letter Rebound corrected a misprint to. */
  rightLetter?: Letter;
}

/** What the pilot's checker answered to the two keys it disputed (pilot-verification-hs.md). */
const DISPUTED: Record<string, string> = {
  'doe-hs-03-r15-t21': 'VISIBLE (OPTICAL)',
  'doe-hs-01-r11-b23': 'NEUTROPHIL, BASOPHIL AND MACROPHAGE',
};

export function knownWrong(library: readonly LibraryQuestion[]): KnownCase[] {
  const byId = new Map(library.map((x) => [x.question.id, x]));
  const out: KnownCase[] = [];
  for (const e of DOE_ERRATA) {
    const x = byId.get(e.id);
    const printed = /printed the answer as "([WXYZ])\)/.exec(e.note)?.[1] as Letter | undefined;
    const q = x?.question;
    if (!x || !q?.choices || !q.answerLetter || !printed || printed === q.answerLetter) continue;
    out.push({
      id: e.id,
      level: x.level,
      kind: 'misprinted letter',
      // The library holds the corrected letter. Here the question is as DOE printed it: the wrong letter, with that letter's choice.
      question: { ...q, answerLetter: printed, answer: withoutGuides(q.choices[printed]).toUpperCase() },
      solverSaid: `${q.answerLetter}) ${withoutGuides(q.choices[q.answerLetter])}`,
      rightLetter: q.answerLetter,
    });
  }
  for (const [id, solverSaid] of Object.entries(DISPUTED)) {
    const x = byId.get(id);
    if (x) out.push({ id, level: x.level, kind: 'disputed key', question: x.question, solverSaid });
  }
  return out;
}

/* ---------------- --compute ---------------- */

export async function computeTrial(sample: readonly SampleItem[], args: TrialArgs, api?: ModelApi) {
  const numeric = sample.filter((s) => isNumericAnswer(s.question) && !isIdentifyAll(s.question.stem) && !isRank(s.question.stem));
  const chosen = spread(numeric, args.limit || 60);
  const requests = chosen.map((s) => computeRequest(s.id, s.question, s.level, args.model));
  const replies = await runTrial(`compute-${args.model}-${COMPUTE_PROMPT}`, requests, args, 1500, api);
  const rows = chosen.map((s) => {
    const reply = replies.get(s.id);
    const c = reply ? readComputation(reply) : null;
    const allowed = s.kind === 'tossup' ? 5 : 20;
    return { id: s.id, level: s.level, subject: s.subject, kind: s.kind, format: s.question.format, outcome: reply?.outcome ?? 'none', verdict: c ? computationAgrees(s.question, c) : null, key: s.question.answerRaw, answer: c ? (c.letter ? `${c.letter}) ${c.answer}` : c.answer) : '', consistent: c?.consistent ?? null, problems: c?.problems ?? [], seconds: c?.seconds ?? null, overTime: c ? c.seconds > allowed : null, ranCode: c?.ranCode ?? null };
  });
  const read = rows.filter((r) => r.verdict);
  const count = (v: string) => read.filter((r) => r.verdict === v).length;
  const summary = {
    about: 'Recomputing in code (scripts/gen/trials/checks.ts --compute) on DOE questions with numeric answers, 2014–22. DOE\'s keys are nearly always right, so a disagreement is almost always a false alarm.',
    model: args.model,
    prompt: COMPUTE_PROMPT,
    run: new Date().toISOString().slice(0, 10),
    questions: chosen.length,
    read: read.length,
    agrees: share(count('agrees'), read.length),
    close: share(count('close'), read.length),
    disagrees: share(count('disagrees'), read.length),
    ranCode: read.filter((r) => r.ranCode).length,
    calledInconsistent: read.filter((r) => r.consistent === false).length,
    withProblems: read.filter((r) => r.problems.length).length,
    overTheTimeAllowed: { tossups: read.filter((r) => r.kind === 'tossup' && r.overTime).length, ofTossups: read.filter((r) => r.kind === 'tossup').length, bonuses: read.filter((r) => r.kind === 'bonus' && r.overTime).length, ofBonuses: read.filter((r) => r.kind === 'bonus').length },
    calls: perCall(chosen.map((s) => replies.get(s.id)).filter((r): r is ModelReply => !!r)),
    disagreements: rows.filter((r) => r.verdict === 'disagrees' || r.verdict === 'close'),
    results: rows,
  };
  console.log(`\nRead ${read.length} of ${chosen.length}. Agrees with DOE's key: ${count('agrees')}; same value in another form: ${count('close')}; disagrees: ${count('disagrees')}.`);
  console.log(`Ran code: ${summary.ranCode} of ${read.length}. Called inconsistent: ${summary.calledInconsistent}. Over the time allowed: ${summary.overTheTimeAllowed.tossups} of ${summary.overTheTimeAllowed.ofTossups} toss-ups, ${summary.overTheTimeAllowed.bonuses} of ${summary.overTheTimeAllowed.ofBonuses} bonuses.`);
  for (const r of summary.disagreements) console.log(`  ${r.verdict}  ${r.id}: key ${r.key}; computed ${r.answer}`);
  console.log(`Per call: ${JSON.stringify(summary.calls.meanTokens)}, $${summary.calls.costPerCall}.`);
  if (!args.limit) console.log(`Summary: ${path.relative(process.cwd(), writeSummary(`compute.${args.model}`, summary))}`);
  return summary;
}

/* ---------------- --source ---------------- */

interface PilotFault {
  expect: string;
  question: Pick<Question, 'id' | 'kind' | 'subject' | 'format' | 'stem' | 'answer' | 'accept' | 'reject'> & Partial<Pick<Question, 'choices' | 'answerLetter'>> & { level: Level };
}

/** The pilot's questions that name a lab by a name it has given up. */
export function renamedLabQuestions(): PilotFault['question'][] {
  const file = JSON.parse(readFileSync(path.join(DATA_DIR, 'eval', 'pilot-faults.json'), 'utf8')) as { questions: PilotFault[] };
  return file.questions.filter((f) => f.expect === 'former-lab-name').map((f) => f.question);
}

export async function sourceTrial(library: readonly LibraryQuestion[], sample: readonly SampleItem[], args: TrialArgs, api?: ModelApi) {
  const lists = loadSources();
  const labs = loadLabs();
  const facts = sample.filter((s) => !isNumericAnswer(s.question) && !isIdentifyAll(s.question.stem) && !isRank(s.question.stem));
  const items = [
    ...spread(facts, args.limit || 40).map((s) => ({ id: `right-${s.id}`, group: 'right key' as const, level: s.level, question: s.question as PilotFault['question'] | Question })),
    ...knownWrong(library).map((k) => ({ id: `${k.kind === 'disputed key' ? 'disputed' : 'wrong'}-${k.id}`, group: k.kind === 'disputed key' ? ('disputed key' as const) : ('wrong key' as const), level: k.level, question: k.question as PilotFault['question'] | Question })),
    ...renamedLabQuestions().map((q) => ({ id: `renamed-${q.id}`, group: 'renamed lab' as const, level: q.level, question: q as PilotFault['question'] | Question })),
  ];
  const requests = items.map((it) => sourceRequest(it.id, it.question, it.level, lists, labs, args.model));
  const replies = await runTrial(`source-${args.model}-${SOURCE_PROMPT}`, requests, args, 1500, api);
  const rows = items.map((it) => {
    const reply = replies.get(it.id);
    const c = reply ? readSourceCheck(reply, lists, labs) : null;
    return { id: it.id, group: it.group, outcome: reply?.outcome ?? 'none', verdict: (c?.verdict ?? null) as SourceVerdict | null, claim: c?.claim ?? '', sources: c?.sources.map((s) => s.url) ?? [], searches: reply?.usage.searches ?? 0, noticedTheNewName: it.group === 'renamed lab' ? /Rockies/i.test(c?.note ?? '') : undefined, note: c?.note.slice(0, 600) ?? reply?.note ?? '' };
  });
  const of = (group: string) => rows.filter((r) => r.group === group);
  const verdicts = (rs: typeof rows) => ({ questions: rs.length, supported: rs.filter((r) => r.verdict === 'supported').length, contradicted: rs.filter((r) => r.verdict === 'contradicted').length, notFound: rs.filter((r) => r.verdict === 'not-found').length, unread: rs.filter((r) => !r.verdict).length });
  const summary = {
    about: 'The source check (scripts/gen/trials/checks.ts --source): a search of the allowed sites for support of an answer line. Right keys are DOE fact questions; wrong keys are the answer letters DOE misprinted, shown as printed; disputed keys are the two the November 2026 pilot questioned; the renamed-lab questions are the pilot\'s own, naming a lab by a name it gave up in December 2025.',
    model: args.model,
    prompt: SOURCE_PROMPT,
    run: new Date().toISOString().slice(0, 10),
    rightKeys: verdicts(of('right key')),
    wrongKeys: verdicts(of('wrong key')),
    disputedKeys: verdicts(of('disputed key')),
    renamedLab: { ...verdicts(of('renamed lab')), noticedTheNewName: of('renamed lab').filter((r) => r.noticedTheNewName).length },
    calls: perCall(items.map((it) => replies.get(it.id)).filter((r): r is ModelReply => !!r)),
    results: rows,
  };
  const line = (name: string, v: ReturnType<typeof verdicts>) => `${name}: ${v.supported} supported, ${v.contradicted} contradicted, ${v.notFound} not found${v.unread ? `, ${v.unread} unread` : ''} (of ${v.questions})`;
  console.log(`\n${line('Right keys', summary.rightKeys)}`);
  console.log(line('Wrong keys', summary.wrongKeys));
  console.log(line('Disputed keys', summary.disputedKeys));
  console.log(`${line('Renamed lab', summary.renamedLab)}; the new name noticed in ${summary.renamedLab.noticedTheNewName}.`);
  console.log(`Per call: ${JSON.stringify(summary.calls.meanTokens)}, ${summary.calls.searches} searches in all, $${summary.calls.costPerCall}.`);
  if (!args.limit) console.log(`Summary: ${path.relative(process.cwd(), writeSummary(`source.${args.model}`, summary))}`);
  return summary;
}

/* ---------------- --second ---------------- */

export async function secondTrial(library: readonly LibraryQuestion[], sample: readonly SampleItem[], args: TrialArgs, api?: ModelApi) {
  const lists = loadSources();
  const labs = loadLabs();
  const known = knownWrong(library);
  // Right keys, each with a solver who was wrong: the next choice after the right one.
  const choice = sample.filter((s) => s.question.format === 'multiple_choice' && s.question.choices && s.question.answerLetter && !isNumericAnswer(s.question));
  const falseAlarms = spread(choice, args.limit || 9).map((s) => {
    const wrong = LETTERS[(LETTERS.indexOf(s.question.answerLetter!) + 1) % 4]!;
    return { id: `alarm-${s.id}`, group: 'right key, wrong solver' as const, level: s.level, question: s.question, findings: [`A solver who saw only the question answered ${wrong}) ${withoutGuides(s.question.choices![wrong])}, with confidence 4 of 5.`], expect: 'key right' as Ruling };
  });
  const open = sample.filter((s) => s.question.format === 'short_answer' && !isNumericAnswer(s.question) && !isIdentifyAll(s.question.stem) && !isRank(s.question.stem));
  const spot = spread(open, Math.max(2, Math.round((args.limit || 9) / 2))).map((s) => ({ id: `spot-${s.id}`, group: 'spot check' as const, level: s.level, question: s.question, findings: [] as string[], expect: 'key right' as Ruling }));
  const items = [
    ...known.map((k) => ({ id: `${k.kind === 'disputed key' ? 'disputed' : 'wrong'}-${k.id}`, group: k.kind, level: k.level, question: k.question, findings: [`A solver who saw only the question answered ${k.solverSaid}, with confidence 4 of 5.`], expect: 'key wrong' as Ruling })),
    ...falseAlarms,
    ...spot,
  ];
  const requests = items.map((it) => secondLookRequest(it.id, it.question, it.level, it.findings, lists, labs, args.model));
  const replies = await runTrial(`second-${args.model}-${SECOND_PROMPT}`, requests, args, 3000, api);
  const rows = items.map((it) => {
    const reply = replies.get(it.id);
    const s = reply ? readSecondLook(reply, lists, labs) : null;
    return { id: it.id, group: it.group, outcome: reply?.outcome ?? 'none', expected: it.expect, ruling: (s?.ruling ?? null) as Ruling | null, key: it.question.answerRaw || it.question.answer, answer: s?.answer ?? '', reason: s?.reason ?? reply?.note ?? '', fix: s?.fix ?? null, sources: s?.sources.map((x) => x.url) ?? [] };
  });
  const of = (group: string) => rows.filter((r) => r.group === group);
  const rulings = (rs: typeof rows) => ({ questions: rs.length, keyRight: rs.filter((r) => r.ruling === 'key right').length, keyWrong: rs.filter((r) => r.ruling === 'key wrong').length, ambiguous: rs.filter((r) => r.ruling === 'ambiguous').length, unread: rs.filter((r) => !r.ruling).length });
  const summary = {
    about: 'The second look (scripts/gen/trials/checks.ts --second): does it overturn a wrong key and uphold a right one? Wrong keys are the answer letters DOE misprinted, shown as printed, each with the answer a solver gave; disputed keys are the two the November 2026 pilot questioned; "right key, wrong solver" is a DOE question with a made-up solver who chose another choice; spot checks have no finding at all.',
    model: args.model,
    prompt: SECOND_PROMPT,
    run: new Date().toISOString().slice(0, 10),
    wrongKeys: rulings(of('misprinted letter')),
    disputedKeys: rulings(of('disputed key')),
    rightKeysWithAWrongSolver: rulings(of('right key, wrong solver')),
    spotChecks: rulings(of('spot check')),
    calls: perCall(items.map((it) => replies.get(it.id)).filter((r): r is ModelReply => !!r)),
    results: rows,
  };
  const line = (name: string, v: ReturnType<typeof rulings>) => `${name}: ${v.keyRight} key right, ${v.keyWrong} key wrong, ${v.ambiguous} ambiguous${v.unread ? `, ${v.unread} unread` : ''} (of ${v.questions})`;
  console.log(`\n${line('Wrong keys', summary.wrongKeys)}`);
  console.log(line('Disputed keys', summary.disputedKeys));
  console.log(line('Right keys with a wrong solver', summary.rightKeysWithAWrongSolver));
  console.log(line('Spot checks', summary.spotChecks));
  for (const r of rows.filter((x) => x.ruling && x.ruling !== x.expected && x.group !== 'disputed key')) console.log(`  unexpected  ${r.id}: ruled "${r.ruling}". ${r.reason}`);
  console.log(`Per call: ${JSON.stringify(summary.calls.meanTokens)}, ${summary.calls.searches} searches in all, $${summary.calls.costPerCall}.`);
  if (!args.limit) console.log(`Summary: ${path.relative(process.cwd(), writeSummary(`second.${args.model}`, summary))}`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  trial(async () => {
    const flags = new Set(process.argv.slice(2));
    const args = trialArgs({ model: flags.has('--second') ? 'claude-opus-5-5' : 'claude-sonnet-5-5', mode: 'live' });
    if (args.mode !== 'live') throw new Error('These checks use web search or code, which cannot go in a batch: leave --mode out.');
    const library = loadLibrary();
    const sample = sampleDoe(library);
    if (args.flags.has('compute')) await computeTrial(sample, args);
    else if (args.flags.has('source')) await sourceTrial(library, sample, args);
    else if (args.flags.has('second')) await secondTrial(library, sample, args);
    else console.error('Say which: --compute, --source or --second.');
  });
}
