/**
 * From slots to checked drafts: plan steps 2 to 8, as far as one blind solver and the difficulty rating. Each
 * stage sends every slot's request together, so a stage can go as one batch, and what a stage finds decides
 * what the next one asks.
 *
 *   ideas → idea screen → write → house-style checks (one repair) → text screen → blind solve → answer match → rating
 *
 * A slot's draft either falls out at a stage, with the reason, or comes through. One that comes through with
 * a doubt on it (the solver gave another form of the answer, named a second answer, or reported a fault) is
 * marked for the second look: only a failed check rejects a question.
 *
 * Not here yet: the second solver, the recomputation, the source check and the second look itself (their
 * steps are built and tried on their own), and the assembly of a round. Stage C joins them up.
 */
import type { Question } from '../../src/core/schema';
import { checkQuestion, hasErrors, tidy, type CheckContext, type Finding } from './checks';
import type { LibraryQuestion } from './library';
import { addUsage, NO_USAGE, type ModelReply, type ModelRequest, type Usage } from './llm';
import { nearCopies, neighbours, TOP, type Query, type SearchIndex } from './search';
import { levelExamples, stemLengths, takenAnswers } from './steps/brief';
import { ideaQuery, IDEAS_PROMPT, ideasRequest, readIdeas } from './steps/ideas';
import { isRepeat, JUDGE_PROMPT, judgeRequest, readJudgment, type Judgment, type Listed, type Relation } from './steps/judge';
import { RATE_PROMPT, rateRequest, readRating, type Anchors } from './steps/rate';
import { onOneLine } from './steps/show';
import { MATCH_PROMPT, matchRequest, readMatch, settled, type Match } from './steps/match';
import { compare, readSolution, SOLVE_PROMPT, solveRequest, unacceptedAnswers, type Solution } from './steps/solve';
import { readWritten, repairRequest, WRITE_PROMPT, writeRequest, type WriteContext, type Written } from './steps/write';
import { plain } from './text';
import type { Idea, QuestionText, Slot } from './types';

export interface FlowModels {
  /** Proposes the ideas and writes the questions. */
  writer: string;
  /** Screens the ideas: a small model, since the text screen catches what it misses. */
  ideaJudge: string;
  /** Rules on whether a solver's answer is the answer line's, where the answer checker cannot tell: a small model. */
  matcher: string;
  /** Screens the finished text, solves blind and rates. Never the writer's model. */
  checker: string;
}

export type Stage = 'ideas' | 'idea-screen' | 'write' | 'repair' | 'text-screen' | 'solve' | 'match' | 'rate';

export interface FlowContext {
  library: readonly LibraryQuestion[];
  /** What drafts are screened against: the library, and whatever else has been kept. */
  index: SearchIndex;
  /** The questions in `index`, by id, to show a judge. */
  byId: ReadonlyMap<string, Pick<Question, 'stem' | 'answer'> & Partial<Pick<Question, 'choices' | 'answerLetter'>>>;
  /** Each library question's topic (library.ts, topicsById). */
  topicOf: ReadonlyMap<string, string>;
  checks: CheckContext;
  /** DOE questions of each tier for the rater, by category. Leave out to skip the rating. */
  anchors?: (slot: Slot) => Anchors;
  /** Sends one stage's requests and returns the replies by request id. `prompt` is the version of the stage's prompt. */
  send: (stage: Stage, model: string, prompt: string, requests: ModelRequest[], expectedOutputTokens: number) => Promise<Map<string, ModelReply>>;
  /** Varies the DOE examples the writer is shown from run to run. */
  salt: string;
  /** Library questions never shown to the writer: those held back as tests. */
  exclude?: ReadonlySet<string>;
}

/** How many of the library questions near an idea the writer is shown as cues already used. */
export const NEAR_SHOWN = 12;

export interface ScreenedIdea {
  idea: Idea;
  relation: Relation | null;
  match: string;
  reason: string;
  /** Why it was not used, when it was not. */
  dropped?: string;
}

export interface SlotRun {
  slot: Slot;
  ideas: ScreenedIdea[];
  chosen?: Idea;
  /** The next best idea, kept in case the first fails later. */
  spare?: Idea;
  /** The question after the automatic fixes, and after the repair when there was one. */
  written?: Written;
  repaired: boolean;
  /** What the house-style checks said of the final text. */
  findings: Finding[];
  judgment?: Judgment | null;
  solution?: Solution | null;
  /** The matcher's ruling, when the answer checker did not accept the solver's short answer. */
  match?: Match | null;
  rating?: number | null;
  /** 'passed': through every stage clean. 'second-look': through, with a doubt to settle. 'ended': fell out. */
  outcome: 'passed' | 'second-look' | 'ended';
  ended?: { stage: Stage | 'style'; reason: string };
  /** The doubts a second look would be asked to settle. */
  doubts: string[];
}

export interface StageCost {
  model: string;
  calls: number;
  usage: Usage;
  cost: number;
}

export interface FlowResult {
  runs: SlotRun[];
  costs: Partial<Record<Stage, StageCost>>;
}

const RANK: Record<Relation, number> = { new: 0, related: 1, template: 2, reversed: 3, same: 3 };

const list = (ctx: FlowContext, q: Query): Listed[] => neighbours(ctx.index, q, TOP).map((n) => ({ id: n.id, line: onOneLine(n.id, ctx.byId.get(n.id)!) }));

/** A written question as search takes it. */
export function draftQuery(q: QuestionText): Query {
  return { stem: q.stem, answer: q.answer, ...(q.choices ? { choices: q.choices } : {}) };
}

/** The slots of one ideas request: those of a round that share a category and a topic, and each Energy slot alone. */
export function ideaGroups(slots: readonly Slot[]): Slot[][] {
  const groups = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = slot.subject === 'energy' ? `energy/${slot.id}` : `${slot.level}/${slot.tier}/${slot.subject}/${slot.topic}`;
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  // Two at a time: a topic with more slots than that (several rounds made at once) is asked in turns.
  return [...groups.values()].flatMap((g) => Array.from({ length: Math.ceil(g.length / 2) }, (_, i) => g.slice(2 * i, 2 * i + 2)));
}

/**
 * The idea a slot goes on with, and its spare: the furthest from the library first ("new", then "related",
 * then "template"), in the writer's own order. An idea whose answer another slot has already taken is passed over.
 */
export function chooseIdeas(ideas: ScreenedIdea[], taken: Set<string>): { chosen?: Idea; spare?: Idea } {
  const open = ideas
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !s.dropped)
    .sort((a, b) => RANK[a.s.relation!] - RANK[b.s.relation!] || a.i - b.i);
  const picked: Idea[] = [];
  for (const { s } of open) {
    const answer = plain(s.idea.answer);
    if (taken.has(answer)) {
      s.dropped = 'Another slot of this run has an idea with the same answer.';
      continue;
    }
    if (picked.length < 2) picked.push(s.idea);
    if (picked.length === 1) taken.add(answer);
  }
  return { ...(picked[0] ? { chosen: picked[0] } : {}), ...(picked[1] ? { spare: picked[1] } : {}) };
}

/** How many of a solver's other answers are put to the matcher: a solver that lists more is listing forms. */
export const OTHER_ANSWERS_ASKED = 3;

/**
 * The other answers of a solver that the matcher is asked about. A solver names "another answer that could be
 * defended" for one DOE question in five, and a third of those are the answer line's own answer in other
 * words. For a short answer, each one the answer checker refuses goes to the matcher, and only those it does
 * not accept are counted. For multiple choice another answer is another choice, and is counted as it stands.
 */
export function otherAnswersToAsk(question: QuestionText, solution: Solution): string[] {
  return question.format === 'short_answer' ? unacceptedAnswers(question, solution).slice(0, OTHER_ANSWERS_ASKED) : [];
}

/**
 * The doubts a blind solver's reply raises about a question, each in a sentence the second look can be shown:
 * an answer that is not the key's, another answer it thinks defensible, a fault it reports, or far too long
 * a working for the time allowed. `others` are the other answers to count: by default every one the answer
 * checker would mark wrong, and in the flow only those the matcher too finds different (`otherAnswersToAsk`).
 */
export function solverDoubts(slot: Pick<Slot, 'kind'>, question: QuestionText, solution: Solution, match: Match | null, others: readonly string[] = unacceptedAnswers(question, solution)): string[] {
  const doubts: string[] = [];
  const said = question.format === 'multiple_choice' ? `${solution.letter}) ${solution.answer}` : solution.answer;
  const verdict = settled(compare(question, solution), match);
  if (verdict === 'disagrees') doubts.push(`A solver who saw only the question answered ${said}, with confidence ${solution.confidence} of 5.`);
  if (verdict === 'close') doubts.push(`A solver answered ${said}, which could not be matched to the answer line for certain.`);
  for (const other of others) doubts.push(`A solver thought "${other}" could also be defended.`);
  for (const p of solution.problems) doubts.push(`A solver reported a fault (${p.kind}): ${p.note}`);
  const allowed = slot.kind === 'tossup' ? 5 : 20;
  if (solution.seconds > 2 * allowed) doubts.push(`A solver thought it needs about ${Math.round(solution.seconds)} seconds; ${allowed} are allowed.`);
  return doubts;
}

export async function makeDrafts(slots: readonly Slot[], models: FlowModels, ctx: FlowContext): Promise<FlowResult> {
  if (models.checker === models.writer) throw new Error('The checker must not be the writer’s model: a model shares its own blind spots.');
  if (new Set(slots.map((s) => s.id)).size !== slots.length) throw new Error('Two slots have the same id.');
  const runs: SlotRun[] = slots.map((slot) => ({ slot, ideas: [], repaired: false, findings: [], outcome: 'ended', doubts: [] }));
  const bySlot = new Map(runs.map((r) => [r.slot.id, r]));
  const costs: FlowResult['costs'] = {};
  const send = async (stage: Stage, model: string, prompt: string, requests: ModelRequest[], expected: number) => {
    if (requests.length === 0) return new Map<string, ModelReply>();
    const replies = await ctx.send(stage, model, prompt, requests, expected);
    const mine = requests.map((r) => replies.get(r.id)).filter((r): r is ModelReply => !!r);
    costs[stage] = { model, calls: mine.length, usage: mine.reduce((u, r) => addUsage(u, r.usage), NO_USAGE), cost: mine.reduce((c, r) => c + r.cost, 0) };
    return replies;
  };
  const end = (run: SlotRun, stage: NonNullable<SlotRun['ended']>['stage'], reason: string) => {
    run.outcome = 'ended';
    run.ended = { stage, reason };
  };
  const failed = (reply: ModelReply | undefined) => (reply ? `${reply.outcome}${reply.note ? `: ${reply.note}` : ''}` : 'no reply');

  /* Step 2: ideas. */
  const examples = (slot: Slot, count: number) => levelExamples(ctx.library, slot, count, ctx.salt, ctx.exclude);
  const groups = ideaGroups(slots);
  const ideaRequests = groups.map((group) => {
    const kinds = [...new Map(group.map((s) => [s.kind, s])).values()];
    const shown = kinds.flatMap((s) => examples(s, kinds.length === 1 ? 4 : 2));
    return ideasRequest(`ideas-${group.map((s) => s.id).join('-')}`, group, { examples: shown, taken: takenAnswers(ctx.library, ctx.topicOf, group[0]!.level, group[0]!.topic) }, models.writer);
  });
  const ideaReplies = await send('ideas', models.writer, IDEAS_PROMPT, ideaRequests, 2500);
  groups.forEach((group, g) => {
    const reply = ideaReplies.get(ideaRequests[g]!.id);
    const ideas = reply ? readIdeas(reply, group) : null;
    for (const slot of group) {
      const run = bySlot.get(slot.id)!;
      const mine = ideas?.get(slot.id) ?? [];
      run.ideas = mine.map((idea) => ({ idea, relation: null, match: '', reason: '' }));
      if (mine.length === 0) end(run, 'ideas', ideas ? 'The writer gave no idea for this slot.' : failed(reply));
    }
  });

  /* Step 3: screen the ideas against the library, and against each other. */
  const screens = runs.flatMap((run) => run.ideas.map((screened, n) => ({ run, screened, listed: list(ctx, ideaQuery(screened.idea)), id: `ij-${run.slot.id}-${n + 1}` })));
  const screenReplies = await send('idea-screen', models.ideaJudge, JUDGE_PROMPT, screens.map((s) => judgeRequest(s.id, s.screened.idea, s.listed, models.ideaJudge)), 400);
  for (const s of screens) {
    const reply = screenReplies.get(s.id);
    const judgment = reply ? readJudgment(reply, s.listed) : null;
    if (!judgment) {
      s.screened.dropped = `No judgment (${failed(reply)}).`;
      continue;
    }
    Object.assign(s.screened, { relation: judgment.relation, match: judgment.match, reason: judgment.reason });
    if (isRepeat(judgment.relation)) s.screened.dropped = `The library already asks it (${judgment.relation}${judgment.match ? ` with ${judgment.match}` : ''}).`;
  }
  const answersTaken = new Set<string>();
  const nearIdea = new Map<string, Listed[]>();
  for (const run of runs) {
    if (run.ended) continue;
    const { chosen, spare } = chooseIdeas(run.ideas, answersTaken);
    if (!chosen) {
      end(run, 'idea-screen', 'Every idea repeats the library, or another slot’s idea.');
      continue;
    }
    run.chosen = chosen;
    if (spare) run.spare = spare;
    nearIdea.set(run.slot.id, screens.find((s) => s.run === run && s.screened.idea === chosen)!.listed.slice(0, NEAR_SHOWN));
  }

  /* Step 4: write. Step 5: the house-style checks, with one repair. */
  const writing = runs.filter((r) => r.chosen);
  const contextOf = (run: SlotRun): WriteContext => ({ examples: examples(run.slot, 3), near: nearIdea.get(run.slot.id) ?? [], lengths: stemLengths(ctx.checks.profile, run.slot) });
  const take = (run: SlotRun, reply: ModelReply | undefined): boolean => {
    const written = reply ? readWritten(reply, run.slot) : null;
    if (!written) {
      if (!run.written) end(run, 'write', failed(reply));
      return false;
    }
    const tidied = tidy(written.draft);
    run.written = { ...written, draft: tidied.draft };
    run.findings = checkQuestion(tidied.draft, ctx.checks);
    return true;
  };
  const writeReplies = await send('write', models.writer, WRITE_PROMPT, writing.map((run) => writeRequest(`write-${run.slot.id}`, run.slot, run.chosen!, contextOf(run), models.writer)), 2500);
  for (const run of writing) take(run, writeReplies.get(`write-${run.slot.id}`));
  const toRepair = writing.filter((run) => run.written && hasErrors(run.findings));
  const repairReplies = await send('repair', models.writer, WRITE_PROMPT, toRepair.map((run) => repairRequest(`repair-${run.slot.id}`, run.slot, run.chosen!, contextOf(run), run.written!, run.findings, models.writer)), 2500);
  for (const run of toRepair) {
    run.repaired = true;
    // A repair that cannot be read leaves the first draft, and its errors, standing.
    take(run, repairReplies.get(`repair-${run.slot.id}`));
  }
  for (const run of writing) {
    if (!run.written || run.ended) continue;
    if (run.written.timeTied) end(run, 'write', 'The writer says the answer may change with time.');
    else if (hasErrors(run.findings)) end(run, 'style', run.findings.filter((f) => f.level === 'error').map((f) => f.code).join(', '));
  }

  /* Step 6: screen the finished text. */
  const written = runs.filter((r) => r.written && !r.ended);
  const textScreens: Array<{ run: SlotRun; listed: Listed[] }> = [];
  for (const run of written) {
    const query = draftQuery(run.written!.draft.question);
    const copies = nearCopies(ctx.index, query);
    if (copies.length) end(run, 'text-screen', `Nearly a copy of ${copies[0]!.id}.`);
    else textScreens.push({ run, listed: list(ctx, query) });
  }
  const textReplies = await send('text-screen', models.checker, JUDGE_PROMPT, textScreens.map((s) => judgeRequest(`tj-${s.run.slot.id}`, s.run.written!.draft.question, s.listed, models.checker)), 500);
  for (const s of textScreens) {
    const reply = textReplies.get(`tj-${s.run.slot.id}`);
    s.run.judgment = reply ? readJudgment(reply, s.listed) : null;
    if (!s.run.judgment) end(s.run, 'text-screen', `No judgment (${failed(reply)}).`);
    else if (isRepeat(s.run.judgment.relation)) end(s.run, 'text-screen', `The library already asks it (${s.run.judgment.relation}${s.run.judgment.match ? ` with ${s.run.judgment.match}` : ''}): ${s.run.judgment.reason}`);
  }

  /* Step 7, first part: one blind solver. */
  const screened = runs.filter((r) => r.judgment && !r.ended);
  const solveReplies = await send('solve', models.checker, SOLVE_PROMPT, screened.map((run) => solveRequest(`solve-${run.slot.id}`, run.written!.draft.question, run.slot.level, models.checker)), 900);
  for (const run of screened) {
    const reply = solveReplies.get(`solve-${run.slot.id}`);
    run.solution = reply ? readSolution(reply) : null;
    if (run.solution) continue;
    // A solver that gave no answer has not found a fault: the question goes on, with the doubt recorded.
    run.doubts.push(`A solver gave no answer (${failed(reply)}).`);
    run.outcome = 'second-look';
  }
  const solved = screened.filter((r) => r.solution);
  // Where the answer checker does not accept a short answer, a small model says whether a judge would.
  const disputed = solved.filter((run) => run.written!.draft.question.format === 'short_answer' && compare(run.written!.draft.question, run.solution!) !== 'agrees');
  // The same model says whether another answer the solver names is only the answer line's in other words.
  const asked = solved.flatMap((run) => otherAnswersToAsk(run.written!.draft.question, run.solution!).map((answer, i) => ({ run, answer, id: `other-${run.slot.id}-${i + 1}` })));
  const matchReplies = await send(
    'match',
    models.matcher,
    MATCH_PROMPT,
    [...disputed.map((run) => matchRequest(`match-${run.slot.id}`, run.written!.draft.question, run.solution!.answer, run.slot.level, models.matcher)), ...asked.map((a) => matchRequest(a.id, a.run.written!.draft.question, a.answer, a.run.slot.level, models.matcher))],
    150,
  );
  for (const run of disputed) {
    const reply = matchReplies.get(`match-${run.slot.id}`);
    run.match = reply ? readMatch(reply) : null;
  }
  for (const run of solved) {
    const question = run.written!.draft.question;
    // An other answer stays a doubt unless the matcher accepts it as the answer line's own.
    const others = question.format === 'short_answer' ? asked.filter((a) => a.run === run && (matchReplies.get(a.id) ? readMatch(matchReplies.get(a.id)!) : null)?.verdict !== 'accept').map((a) => a.answer) : unacceptedAnswers(question, run.solution!);
    run.doubts.push(...solverDoubts(run.slot, question, run.solution!, run.match ?? null, others));
    run.outcome = run.doubts.length ? 'second-look' : 'passed';
  }

  /* Step 8: rate the difficulty of what came through. */
  if (ctx.anchors) {
    const through = runs.filter((r) => r.outcome !== 'ended');
    const rateReplies = await send('rate', models.checker, RATE_PROMPT, through.map((run) => rateRequest(`rate-${run.slot.id}`, run.written!.draft.question, run.slot.level, ctx.anchors!(run.slot), models.checker)), 300);
    for (const run of through) {
      const reply = rateReplies.get(`rate-${run.slot.id}`);
      run.rating = (reply && readRating(reply)?.score) ?? null;
    }
  }
  return { runs, costs };
}
