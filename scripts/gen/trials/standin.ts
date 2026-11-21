/**
 * A stand-in for the Claude API, for the trials' tests: it answers each request from the request's own text,
 * so a trial's scoring can be proved right before any money is spent on it.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { BatchResult, Citation, ModelApi } from '../llm';

type Params = Anthropic.MessageCreateParamsNonStreaming;

/** A reply in words, as a step that searches or runs code gets: the text, the pages cited and the searches made. */
export class Said {
  constructor(
    readonly text: string,
    readonly citations: Citation[] = [],
    readonly searches = 0,
  ) {}
}

/** The tokens every stand-in reply reports. */
export const STAND_IN_USAGE = { input: 100, output: 400, thinking: 250, cacheRead: 700 };

/**
 * `answer` is given the request's user text, its system text and the whole request. What it returns becomes
 * the reply: a `Said` as it is, anything else as JSON (as a step that asks for a JSON shape gets).
 */
export function standIn(answer: (user: string, system: string, params: Params) => unknown): ModelApi & { calls: number } {
  const message = (params: Params): Anthropic.Message => {
    const made = answer(String(params.messages[0]!.content), (params.system as Array<{ text: string }>)[0]!.text, params);
    const said = made instanceof Said ? made : new Said(JSON.stringify(made));
    const citations = said.citations.map((c) => ({ type: 'web_search_result_location', url: c.url, title: c.title, cited_text: c.quote, encrypted_index: 'x' }));
    return {
      id: 'msg',
      type: 'message',
      role: 'assistant',
      model: params.model,
      content: [{ type: 'text', text: said.text, citations: citations.length ? citations : null }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: STAND_IN_USAGE.input, output_tokens: STAND_IN_USAGE.output, output_tokens_details: { thinking_tokens: STAND_IN_USAGE.thinking }, cache_creation_input_tokens: 0, cache_read_input_tokens: STAND_IN_USAGE.cacheRead, server_tool_use: said.searches ? { web_search_requests: said.searches } : null },
    } as unknown as Anthropic.Message;
  };
  let batch: Array<{ custom_id: string; params: Params }> = [];
  const api = {
    calls: 0,
    async create(params: Params) {
      api.calls += 1;
      return message(params);
    },
    async batchCreate(requests: Array<{ custom_id: string; params: Params }>) {
      batch = requests;
      api.calls += requests.length;
      return 'batch_1';
    },
    async batchEnded() {
      return { ended: true, processing: 0 };
    },
    async batchResults(): Promise<BatchResult[]> {
      return batch.map((r) => ({ id: r.custom_id, message: message(r.params) }));
    },
  };
  return api;
}

/* ------------------------------------------------------------------ */
/* A scripted pipeline: every step answered by rule                    */
/* ------------------------------------------------------------------ */

export interface Script {
  /** How the idea judge rules on a slot's n-th idea (1 to 3). By default the first repeats the library and the others do not. */
  idea?: (slot: string, n: number) => 'same' | 'reversed' | 'template' | 'related' | 'new';
  /** Slots whose first draft breaks a house rule and whose repair is sound. */
  brokenOnce?: ReadonlySet<string>;
  /** Slots whose draft and repair both break a house rule. */
  brokenTwice?: ReadonlySet<string>;
  /** Slots whose finished text the judge calls a repeat. */
  textRepeats?: ReadonlySet<string>;
  /** Slots the solver gets wrong. */
  solverWrong?: ReadonlySet<string>;
  /** Slots where the solver reports a fault in the question. */
  solverFlags?: ReadonlySet<string>;
  /** The difficulty score the rater gives. */
  rating?: number;
}

const none: ReadonlySet<string> = new Set();

/**
 * Answers every step of the flow by rule, for `standIn`: ideas, the idea screen, writing and repair, the text
 * screen, the blind solver and the rater. Each question it "writes" names its slot, so the later steps can
 * tell which slot they are looking at from the question alone.
 */
export function scripted(script: Script = {}): (user: string, system: string) => unknown {
  const slotIn = (text: string) => /\bslot ([0-9]*[tb][0-9]+)\b/.exec(text)?.[1] ?? '';
  return (user, system) => {
    if (system.includes('proposing ideas')) {
      const block = /<slots>\n([\s\S]*?)\n<\/slots>/.exec(user)![1]!;
      const slots = block.split('\n').map((line) => line.split(':')[0]!);
      return { ideas: slots.flatMap((slot) => [1, 2, 3].map((n) => ({ slot, answer: `Answer ${n} of slot ${slot}`, fact: `Fact ${n} about slot ${slot}.`, cue: `Cue ${n}.`, method: '' }))) };
    }
    if (system.includes('You check draft questions')) {
      const first = /<library>\n\[([^\]]+)\]/.exec(user)?.[1] ?? '';
      const idea = /Answer: Answer (\d) of slot (\S+)/.exec(user);
      const relation = idea ? (script.idea ?? ((_s: string, n: number) => (n === 1 ? 'same' : n === 2 ? 'related' : 'new')))(idea[2]!, Number(idea[1])) : (script.textRepeats ?? none).has(slotIn(user)) ? 'same' : 'new';
      return { tests: 'By rule.', closest: relation === 'new' ? [] : [{ id: first, tests: 'By rule.', compare: 'By rule.', relation }] };
    }
    if (system.includes('you write the question out in full')) {
      const line = /<slot>\n(.+)/.exec(user)![1]!;
      const slot = line.split(':')[0]!;
      const repair = user.includes('<your_draft>');
      const broken = (script.brokenTwice ?? none).has(slot) || (!repair && (script.brokenOnce ?? none).has(slot));
      const base = { choices: { W: '', X: '', Y: '', Z: '' }, letter: '', answer: '', accept: [], reject: [], why: 'By rule.', whyNot: [], working: '', choicesInOrder: false, timeTied: false, problem: '' };
      if (line.includes('"Identify all"')) return { ...base, stem: `Identify all of the following three statements that are true of slot ${slot}: 1) It is first; 2) It is second${broken ? ', all of the following' : ''}; 3) It is third.`, answer: broken ? '3, 1' : '1, 3' };
      if (line.includes('"Rank"')) return { ...base, stem: `Rank the following three parts of slot ${slot} in order of increasing size: 1) The large part; 2) The small part; 3) The middle part.`, answer: broken ? '2, 3' : '2, 3, 1' };
      if (line.includes('multiple choice')) return { ...base, stem: `Which of the following is the right name for slot ${slot}${broken ? ':' : '?'}`, choices: { W: 'Rightname', X: 'Wrongname', Y: 'Othername', Z: 'Lastname' }, letter: 'W', whyNot: ['X: no.', 'Y: no.', 'Z: no.'] };
      return { ...base, stem: `What single word is the test answer for slot ${slot}?`, answer: broken ? '' : `ZED${slot.toUpperCase()}` };
    }
    if (system.includes('Answer it as a strong, careful player would')) {
      const slot = slotIn(user);
      const wrong = (script.solverWrong ?? none).has(slot);
      const problems = (script.solverFlags ?? none).has(slot) ? [{ kind: 'ambiguous', note: 'Two readings.' }] : [];
      const more = { confidence: wrong ? 3 : 5, otherAnswers: [], problems, seconds: 4, difficulty: 3 };
      if (user.includes('Identify all')) return { answer: wrong ? '2' : '1, 3', letter: '', ...more };
      if (user.includes('Rank the following')) return { answer: wrong ? '1, 2, 3' : '2, 3, 1', letter: '', ...more };
      const right = /^([WXYZ])\) Rightname$/m.exec(user)?.[1];
      if (right) return wrong ? { answer: 'Wrongname', letter: /^([WXYZ])\) Wrongname$/m.exec(user)![1], ...more } : { answer: 'Rightname', letter: right, ...more };
      return { answer: wrong ? 'something else' : `ZED${slot.toUpperCase()}`, letter: '', ...more };
    }
    if (system.includes('You rate how hard a question is')) return { score: script.rating ?? 4, reason: 'By rule.' };
    throw new Error(`The scripted pipeline does not know this step: ${system.slice(0, 60)}`);
  };
}
