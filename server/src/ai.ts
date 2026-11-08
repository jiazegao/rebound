/**
 * Optional AI help (docs/PROPOSAL.md sections 8 and 9), served by the team's Durable Object:
 *
 * - question drafts from a passage the member pastes and cites, each answered again blind by a second call
 *   to catch a bad key;
 * - explanations of an answer (cached per question);
 * - concept card drafts from a cited passage.
 *
 * It is off unless the Worker has an ANTHROPIC_API_KEY secret. Everything comes back to a person to
 * check: drafts stay drafts until a subject owner approves them, and AI-drafted questions are labeled and
 * kept to the team's own practice. Each team has a daily limit on AI calls (AI_DAILY_LIMIT).
 */
import Anthropic from '@anthropic-ai/sdk';
import { judgeAnswer } from '../../src/core/judge/judge';
import { LETTERS, SUBJECT_LABELS, type Letter, type Subject } from '../../src/core/schema';
import { HttpError } from './http';
import { asObject, cleanLine } from './validate';

/** The model unless AI_MODEL says otherwise (the team decides; a cheaper model is its choice to make). */
export const DEFAULT_AI_MODEL = 'claude-opus-5-5';
export const DEFAULT_DAILY_LIMIT = 50;
export const MIN_PASSAGE_CHARS = 200;
export const MAX_PASSAGE_CHARS = 12_000;
export const MAX_DRAFTS = 5;
/** AI request bodies are small: a passage and a few fields. */
export const AI_BODY_BYTES = 64 * 1024;
/** Cached explanations are asked again after this long. */
const CACHE_MS = 180 * 24 * 60 * 60 * 1000;

export type TeamLevel = 'HS' | 'MS';

export interface AiSettings {
  apiKey: string;
  /** Drafts, explanations and cards. */
  model: string;
  /** The blind answer check (AI_CHECK_MODEL; the same model unless the team picks another). */
  checkModel: string;
  dailyLimit: number;
}

type TestOverrides = { apiKey?: string; dailyLimit?: number; model?: string; fetch?: typeof fetch };
let testOverrides: TestOverrides = {};

/** Tests only: a fake key, limit, model and fetch (the SDK sends its requests through it). */
export function setAiTestOverrides(o: TestOverrides): void {
  testOverrides = o;
}

export function aiSettings(env: Env): AiSettings | null {
  const apiKey = testOverrides.apiKey ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const limit = testOverrides.dailyLimit ?? Number(env.AI_DAILY_LIMIT);
  const model = testOverrides.model ?? (env.AI_MODEL?.trim() || DEFAULT_AI_MODEL);
  return {
    apiKey,
    model,
    checkModel: env.AI_CHECK_MODEL?.trim() || model,
    dailyLimit: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_DAILY_LIMIT,
  };
}

/** The call never reached the model (the service was busy, the key failed, the network did), so it is not counted. */
export class AiUnavailable extends HttpError {}

/** Models with a server-side refusal fallback get `fallbacks: "default"`; Claude Haiku models have none. */
function supportsFallback(model: string): boolean {
  return /^claude-(opus|fable|sonnet-5-5)/.test(model);
}

type Effort = 'low' | 'medium' | 'high';

/**
 * One structured request: the reply must be JSON matching `schema`, then pass `check`. Returns the value and
 * the model that wrote it (a refusal fallback can hand the request to another model).
 */
async function ask<T>(
  s: AiSettings,
  model: string,
  req: { system: string; user: string; schema: Record<string, unknown>; effort: Effort },
  check: (value: unknown) => T | null,
): Promise<{ value: T; model: string }> {
  const client = new Anthropic({ apiKey: s.apiKey, maxRetries: 2, ...(testOverrides.fetch ? { fetch: testOverrides.fetch } : {}) });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      ...(supportsFallback(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      output_config: { effort: req.effort, format: { type: 'json_schema', schema: req.schema } },
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new AiUnavailable(429, 'The AI service is busy right now. Try again in a minute.', 60);
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new AiUnavailable(503, "The team server's AI key is not working. Ask whoever runs the server to check it.");
    }
    if (err instanceof Anthropic.BadRequestError) throw new AiUnavailable(502, 'The AI service could not take that request.');
    if (err instanceof Anthropic.APIError) throw new AiUnavailable(502, 'The AI service had a problem. Try again in a moment.');
    throw new AiUnavailable(502, 'The team server could not reach the AI service.');
  }
  if (response.stop_reason === 'refusal') throw new HttpError(422, 'The AI model declined this request.');
  if (response.stop_reason === 'max_tokens') throw new HttpError(502, 'The AI reply was cut off. Try fewer questions or a shorter passage.');
  const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(502, 'The AI reply was not in the expected form. Try again.');
  }
  const checked = check(parsed);
  if (checked === null) throw new HttpError(502, 'The AI reply was not in the expected form. Try again.');
  return { value: checked, model: response.model };
}

const str = (v: unknown, max = 2000): string | null => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);
const strList = (v: unknown, maxItems = 10): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 300)
        .slice(0, maxItems)
        .map((x) => x.trim())
    : [];

const players = (level: TeamLevel) => (level === 'MS' ? 'middle school' : 'high school');

/* ---------------- request checks ---------------- */

function passage(v: unknown): string {
  const text = typeof v === 'string' ? v.normalize('NFC').trim() : '';
  if (text.length < MIN_PASSAGE_CHARS || text.length > MAX_PASSAGE_CHARS) {
    throw new HttpError(400, `Paste a passage of ${MIN_PASSAGE_CHARS} to ${MAX_PASSAGE_CHARS.toLocaleString('en-US')} characters: a few paragraphs to a couple of pages.`);
  }
  return text;
}

function source(v: unknown): string {
  const s = cleanLine(v, 300);
  if (s === null) throw new HttpError(400, 'Say where the passage comes from: the book and section, or the web page.');
  return s;
}

function subjectLabel(v: unknown, required: boolean): string {
  if (typeof v === 'string' && Object.hasOwn(SUBJECT_LABELS, v)) return SUBJECT_LABELS[v as Subject];
  if (required) throw new HttpError(400, 'Choose a subject.');
  return 'Science';
}

function text(v: unknown, max: number, message: string): string {
  const t = typeof v === 'string' ? v.normalize('NFC').trim() : '';
  if (!t || t.length > max) throw new HttpError(400, message);
  return t;
}

/* ---------------- question drafts ---------------- */

export interface DraftInput {
  level: TeamLevel;
  passage: string;
  source: string;
  subjectLabel: string;
  kind: 'tossup' | 'bonus' | 'either';
  count: number;
}

export function parseDraftInput(body: unknown, level: TeamLevel): DraftInput {
  const o = asObject(body);
  const kind = o.kind === undefined ? 'either' : o.kind;
  if (kind !== 'tossup' && kind !== 'bonus' && kind !== 'either') throw new HttpError(400, 'Choose toss-ups, bonuses or either.');
  const count = o.count === undefined ? 3 : o.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_DRAFTS) throw new HttpError(400, `Ask for 1 to ${MAX_DRAFTS} questions.`);
  return { level, passage: passage(o.passage), source: source(o.source), subjectLabel: subjectLabel(o.subject, true), kind, count };
}

export interface DraftedQuestion {
  kind: 'tossup' | 'bonus';
  format: 'short_answer' | 'multiple_choice';
  stem: string;
  choices?: Record<Letter, string>;
  answerLetter?: Letter;
  answer: string;
  accept: string[];
  /** The passage's sentence that supports the answer. */
  support: string;
  /** What a second, blind call answered, and whether the answer checker accepts it for the key. */
  blindAnswer?: string;
  blindAgreed?: boolean;
}

const draftSystem = (level: TeamLevel) => `You write practice questions for the U.S. Department of Energy National Science Bowl, at the ${players(level)} level, for one team's internal practice.

Write only from the passage the user gives: every answer must be stated in the passage or follow directly from it. Follow NSB conventions:
- A toss-up is short (under 40 words) and has exactly one unambiguous answer. A bonus may need a short calculation or two steps.
- Multiple-choice questions have four parallel choices, exactly one right. Give the four choice texts in order (W, X, Y, Z) without the letters, and the right letter as answerLetter. For short-answer questions, leave choices empty and answerLetter "".
- Numeric answers are exact and in simplest form (reduced fractions, simplified radicals, multiples of pi), and the question names the unit.
- Write answers in capital letters as DOE prints them, and list other correct forms (a symbol, a synonym) as accepted answers.
- Do not copy sentences from the passage into the question word for word.
For each question, quote the sentence from the passage that supports the answer.`;

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'format', 'stem', 'choices', 'answerLetter', 'answer', 'accept', 'support'],
        properties: {
          kind: { type: 'string', enum: ['tossup', 'bonus'] },
          format: { type: 'string', enum: ['short_answer', 'multiple_choice'] },
          stem: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          answerLetter: { type: 'string', enum: ['W', 'X', 'Y', 'Z', ''] },
          answer: { type: 'string' },
          accept: { type: 'array', items: { type: 'string' } },
          support: { type: 'string' },
        },
      },
    },
  },
};

function checkDrafts(value: unknown, max: number): DraftedQuestion[] | null {
  const list = (value as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return null;
  const out: DraftedQuestion[] = [];
  for (const raw of list.slice(0, max)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const stem = str(r.stem, 1200);
    const support = str(r.support, 2000) ?? '';
    const kind = r.kind === 'bonus' ? 'bonus' : 'tossup';
    if (!stem) continue;
    if (r.format === 'multiple_choice') {
      const choices = strList(r.choices, 4);
      const letter = LETTERS.find((l) => l === r.answerLetter);
      if (choices.length !== 4 || !letter) continue;
      const record = Object.fromEntries(LETTERS.map((l, i) => [l, choices[i]!])) as Record<Letter, string>;
      out.push({ kind, format: 'multiple_choice', stem, choices: record, answerLetter: letter, answer: record[letter], accept: [], support });
    } else {
      const answer = str(r.answer, 300);
      if (!answer) continue;
      out.push({ kind, format: 'short_answer', stem, answer, accept: strList(r.accept, 6), support });
    }
  }
  return out.length ? out : null;
}

const SOLVE_SYSTEM = `You are a strong National Science Bowl player. Answer the question as you would in a match: give only the answer, as briefly as possible. For multiple choice, give the letter and the choice. If you are unsure, give your best answer.`;

const SOLVE_SCHEMA = { type: 'object', additionalProperties: false, required: ['answer'], properties: { answer: { type: 'string' } } };

function questionText(q: Pick<DraftedQuestion, 'stem' | 'choices'>): string {
  return q.choices ? `${q.stem}\n${LETTERS.map((l) => `${l}) ${q.choices![l]}`).join('\n')}` : q.stem;
}

/** Answer a drafted question without seeing its key or the passage, and check that answer against the key. */
export async function blindSolve(s: AiSettings, q: DraftedQuestion): Promise<{ blindAnswer: string; blindAgreed: boolean }> {
  const { value } = await ask(s, s.checkModel, { system: SOLVE_SYSTEM, user: questionText(q), schema: SOLVE_SCHEMA, effort: 'medium' }, (v) =>
    str((v as { answer?: unknown } | null)?.answer, 300),
  );
  const verdict = judgeAnswer({ format: q.format, stem: q.stem, answer: q.answer, accept: q.accept, reject: [], choices: q.choices, answerLetter: q.answerLetter }, value).verdict;
  return { blindAnswer: value, blindAgreed: verdict === 'correct' };
}

/**
 * Drafts from the passage, then the blind check on each draft. `calls` is how many calls reached the model
 * (one for the drafts and one per blind check that ran), so the rest of the reservation can be given back.
 */
export async function draftQuestions(s: AiSettings, input: DraftInput): Promise<{ drafts: DraftedQuestion[]; model: string; calls: number }> {
  const kinds = input.kind === 'either' ? 'toss-ups or bonuses (a mix)' : input.kind === 'tossup' ? 'toss-ups' : 'bonuses';
  const user = `Subject: ${input.subjectLabel}\nWrite ${input.count} ${kinds}.\nSource: ${input.source}\n\nPassage:\n"""\n${input.passage}\n"""`;
  const { value: drafts, model } = await ask(s, s.model, { system: draftSystem(input.level), user, schema: DRAFT_SCHEMA, effort: 'high' }, (v) =>
    checkDrafts(v, input.count),
  );
  let calls = 1;
  const solved = await Promise.all(
    drafts.map(async (d) => {
      try {
        const result = await blindSolve(s, d);
        calls++;
        return result;
      } catch (error) {
        if (!(error instanceof AiUnavailable)) calls++;
        return null;
      }
    }),
  );
  return { drafts: drafts.map((d, i) => (solved[i] ? { ...d, ...solved[i] } : d)), model, calls };
}

/* ---------------- explanations ---------------- */

export interface ExplainInput {
  level: TeamLevel;
  subjectLabel: string;
  stem: string;
  choices?: Record<Letter, string>;
  answer: string;
}

export function parseExplainInput(body: unknown, level: TeamLevel): ExplainInput {
  const o = asObject(body);
  const stem = text(o.stem, 3000, 'Send the question (up to 3,000 characters).');
  const answer = text(o.answer, 500, 'Send the answer (up to 500 characters).');
  let choices: Record<Letter, string> | undefined;
  if (o.choices !== undefined && o.choices !== null) {
    const c = asObject(o.choices, 'The choices');
    choices = Object.fromEntries(LETTERS.map((l) => [l, text(c[l], 500, 'Each choice must be 1 to 500 characters.')])) as Record<Letter, string>;
  }
  return { level, subjectLabel: subjectLabel(o.subject, false), stem, ...(choices ? { choices } : {}), answer };
}

export interface Explanation {
  explanation: string;
  answerLooksWrong: boolean;
}

const explainSystem = (level: TeamLevel) =>
  `You explain National Science Bowl answers to ${players(level)} players. In at most 120 words: why the given answer is right, the key idea to remember, and one common confusion to avoid. Use standard textbook knowledge only. If you believe the given answer is wrong, say so plainly and set answerLooksWrong to true.`;

const EXPLAIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['explanation', 'answerLooksWrong'],
  properties: { explanation: { type: 'string' }, answerLooksWrong: { type: 'boolean' } },
};

export function checkExplanation(v: unknown): Explanation | null {
  const r = (v ?? {}) as { explanation?: unknown; answerLooksWrong?: unknown };
  const explanation = str(r.explanation, 2000);
  return explanation ? { explanation, answerLooksWrong: r.answerLooksWrong === true } : null;
}

export async function explainAnswer(s: AiSettings, input: ExplainInput): Promise<Explanation & { model: string }> {
  const choices = input.choices ? `\n${LETTERS.map((l) => `${l}) ${input.choices![l]}`).join('\n')}` : '';
  const user = `Subject: ${input.subjectLabel}\nQuestion: ${input.stem}${choices}\nGiven answer: ${input.answer}`;
  const { value, model } = await ask(s, s.model, { system: explainSystem(input.level), user, schema: EXPLAIN_SCHEMA, effort: 'medium' }, checkExplanation);
  return { ...value, model };
}

/* ---------------- concept card drafts ---------------- */

export interface CardInput {
  concept: string;
  passage: string;
  source: string;
}

export function parseCardInput(body: unknown): CardInput {
  const o = asObject(body);
  const concept = cleanLine(o.concept, 120);
  if (concept === null) throw new HttpError(400, 'Name the concept (up to 120 characters).');
  return { concept, passage: passage(o.passage), source: source(o.source) };
}

export interface CardDraft {
  summary: string;
  facts: string[];
  traps: string;
}

const CARD_SYSTEM = `You draft concept cards for a National Science Bowl team from a passage the user gives and cites. Use only the passage. A card has: a summary of at most 150 words in plain language; three to six key facts, one line each, the kind NSB questions test; and a short note on traps (look-alike terms or common misconceptions). Do not copy long sentences from the passage word for word.`;

const CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'facts', 'traps'],
  properties: { summary: { type: 'string' }, facts: { type: 'array', items: { type: 'string' } }, traps: { type: 'string' } },
};

export async function draftCard(s: AiSettings, input: CardInput): Promise<{ card: CardDraft; model: string }> {
  const user = `Concept: ${input.concept}\nSource: ${input.source}\n\nPassage:\n"""\n${input.passage}\n"""`;
  const { value, model } = await ask(s, s.model, { system: CARD_SYSTEM, user, schema: CARD_SCHEMA, effort: 'high' }, (v) => {
    const r = (v ?? {}) as { summary?: unknown; facts?: unknown; traps?: unknown };
    const summary = str(r.summary, 2000);
    const facts = strList(r.facts, 6);
    return summary && facts.length ? { summary, facts, traps: str(r.traps, 1000) ?? '' } : null;
  });
  return { card: value, model };
}

/* ---------------- per-team storage: the daily limit and the explanation cache ---------------- */

export function ensureAiTables(sql: SqlStorage): void {
  sql.exec('CREATE TABLE IF NOT EXISTS ai_usage (day TEXT PRIMARY KEY, count INTEGER NOT NULL)');
  sql.exec('CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL)');
}

const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

export function usedToday(sql: SqlStorage, now: number): number {
  return sql.exec<{ count: number }>('SELECT count FROM ai_usage WHERE day = ?', dayOf(now)).toArray()[0]?.count ?? 0;
}

/** Counts `calls` against today's limit (UTC days), or refuses them all. Returns the day they were counted on. */
export function reserveAiCalls(sql: SqlStorage, limit: number, calls: number, now: number): string {
  const day = dayOf(now);
  const used = usedToday(sql, now);
  if (used + calls > limit) {
    const d = new Date(now);
    const wait = Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now) / 1000);
    const left = Math.max(0, limit - used);
    const message =
      left === 0
        ? `Your team has used today's ${limit} AI calls. They start again at midnight UTC.`
        : `That needs ${calls} AI calls, and your team has ${left} left today. Ask for fewer, or wait until midnight UTC.`;
    throw new HttpError(429, message, wait);
  }
  sql.exec('DELETE FROM ai_usage WHERE day < ?', day);
  sql.exec('INSERT INTO ai_usage (day, count) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET count = count + ?', day, calls, calls);
  return day;
}

/** Gives back calls that were counted but never reached the model. */
export function refundAiCalls(sql: SqlStorage, day: string, calls: number): void {
  if (calls > 0) sql.exec('UPDATE ai_usage SET count = MAX(count - ?, 0) WHERE day = ?', calls, day);
}

export function cachedValue(sql: SqlStorage, key: string, now: number): unknown {
  const row = sql.exec<{ value: string; created_at: number }>('SELECT value, created_at FROM ai_cache WHERE key = ?', key).toArray()[0];
  if (!row || row.created_at <= now - CACHE_MS) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export function cacheValue(sql: SqlStorage, key: string, value: unknown, now: number): void {
  sql.exec('DELETE FROM ai_cache WHERE created_at <= ?', now - CACHE_MS);
  sql.exec(
    'INSERT INTO ai_cache (key, value, created_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, created_at = excluded.created_at',
    key,
    JSON.stringify(value),
    now,
  );
}
