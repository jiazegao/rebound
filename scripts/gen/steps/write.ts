/**
 * Writing the question (plan step 4): the writer turns one screened idea into a full question in the slot's
 * form. Its reply is data, not prose: the stem, the choices or the answer with its ACCEPT and DO NOT ACCEPT
 * lists, and its reasons, which the reviewer reads and the checkers never see.
 *
 * The house style in the prompt is DOE's as measured from its 2019–22 sets (profile.ts) and is the same list
 * the code checks at step 5 enforce, so a question that follows the prompt passes them. A question that
 * fails them goes back once, with the messages (`repairRequest`).
 *
 * The writer has no code tool: its calls can then go in a half-price batch, and every numeric key is worked
 * again in code, blind, at step 7 (compute.ts), which is where a wrong one is caught either way.
 */
import { LETTERS, type Letter, type Level, type Question } from '../../../src/core/schema';
import type { Finding } from '../checks';
import type { ModelReply, ModelRequest } from '../llm';
import { withoutGuides } from '../text';
import type { Draft, Idea, NewsItem, QuestionText, Slot } from '../types';
import { SKILL_MEANING, slotLine, tierBrief } from './brief';
import { examplesText, newsText } from './ideas';
import type { Listed } from './judge';
import { asReadWithAnswer, LEVEL_NAME, promptVersion } from './show';

type Shown = Pick<Question, 'kind' | 'subject' | 'format' | 'stem' | 'answer' | 'accept' | 'reject'> & Partial<Pick<Question, 'choices' | 'answerLetter'>>;

export interface WriteContext {
  /** A few of DOE's questions at the slot's level, tier and category. */
  examples: Shown[];
  /** The library questions the idea screen found nearest the idea: cues already used. */
  near: Listed[];
  /** How long DOE's stems of this kind run, in words (brief.ts, stemLengths). */
  lengths: { usual: number; most: number };
  /** An Energy slot: the lab news item the question opens with. */
  news?: NewsItem;
}

export const writeSystem = (level: Level) => `You write practice questions for the National Science Bowl, a buzzer competition in science and mathematics that the U.S. Department of Energy runs for ${LEVEL_NAME[level]} teams. You are given one slot of a round and the idea chosen for it, and you write the question out in full, in the competition's house style.

<how_a_question_is_used>
A moderator reads the question aloud once, quickly. Players never see it. A toss-up is answered by one player, without conferring, within 5 seconds of the end of the reading; a bonus by a team within 20 seconds. Players have scratch paper and no calculator. A judge then compares what was said with the answer line. So a question must be easy to follow by ear, must leave no doubt about what is being asked, and must have one answer.
</how_a_question_is_used>

<house_style>
These rules describe the Department of Energy's own recent questions. Code checks most of them after you write.

The stem
- Plain and compact. Most questions are one sentence, a direct question beginning "What…" or "Which of the following…". Add a second sentence only when the question needs a setting. No scene-setting for its own sake.
- You are told the usual length for this kind of question and the longest it may be. Count the words.
- Impersonal: no "we", "you" or "my".
- Everything needed to answer is in the stem, and nothing depends on seeing it: no tables, no "shown below", no formatting.
- Write so it can be read aloud without ambiguity. Spell out units ("meters per second squared"). Read mathematics as a moderator would say it: "x squared plus 3x", "the fraction with numerator 3 and denominator x plus 1", "open parenthesis … close parenthesis", "f of x".
- After a word a moderator may stumble on, give a pronunciation guide in square brackets with the stressed syllable in capitals: "lysosome [LYE-soh-sohm]".
- Do not tie the wording to the present: no "currently", "recently", "the largest known", no year.
- The answer, or a word that gives it away, must not appear in the stem.

Multiple choice
- Exactly four choices, W, X, Y and Z, and exactly one of them right. The stem ends with a question mark.
- Choices are short and parallel: usually one to three words, the same kind of thing, in the same grammatical form and of similar length. The right choice must not be the longest or the most detailed.
- Each wrong choice is a real thing of the same kind as the right one: tempting to a player who half knows the material, and clearly wrong to one who knows it. Never two choices that could both be defended.
- Never "all of the above", "none of the above", "both W and X" or "neither". No "because" clause inside a choice: ask for the reason in the stem instead.
- Numerical choices go in increasing order. Other choices go in any order, with the right one on the letter the slot names.
- Avoid asking for the exception ("Which of the following is NOT…"). If the idea requires it, print NOT in capitals.

Short answer
- The answer is one or two words wherever it can be, or a number. The stem must pin down that one answer: ask for "what element", "what type of bond", "what organelle", not "what is…" in the open.
- Print the answer in capitals, as official answer lines do (ESTIVATION), leaving symbols and formulas as they are written (pH, NaCl, mRNA).
- accept: other forms of the same answer that a judge should take, such as a true synonym, an alternate name or a formula. Do not list spellings, plurals or changes of word order. Most questions need none.
- reject: an answer a player is likely to give that is close but wrong or not specific enough. Most questions need none.
- If a knowledgeable player could give a right answer that is not on the answer line, the stem is too loose. Tighten the stem first; use accept only for forms of the same answer.

Numerical answers
- Exact and in simplest form: whole numbers as whole numbers, fractions in lowest terms, radicals simplified, multiples of pi left as pi, no scientific notation unless the stem asks for it, no repeating decimals.
- Name the unit in the stem ("In joules, what is…"), so that the answer is a bare number. If the answer must be rounded, the stem says how ("to the nearest whole number", "to two significant figures").
- Unless the stem gives other values, g is 9.8 meters per second squared, the speed of light is 3 × 10^8 meters per second and the speed of sound is 340 meters per second. Friction and air resistance are ignored unless stated.
- The arithmetic must be possible by hand in the time. Choose numbers that come out exactly. Every value given must be physically possible, and consistent with the others.

"Identify all"
- Fixed wording: "Identify all of the following three <things> that <have the property>: 1) <item>; 2) <item>; 3) <item>." Items are separated by semicolons and the list ends with a period.
- The answer is the numbers of the items that qualify, in increasing order ("1, 3"), or ALL, or NONE. Each item must be clearly in or clearly out.

"Rank"
- Fixed wording: "Rank the following three <things> in order of increasing <quantity>: 1) <item>; 2) <item>; 3) <item>."
- The answer is all three numbers in the order asked ("2, 1, 3"). The three values must be clearly apart, with no ties.

Energy
- Open with one sentence on the research in the news item, naming the laboratory exactly as the news item does: "Scientists at <laboratory> are studying…". Then ask the science question.
- The opening must be true to the news item and must not contain the answer or a word of it. A student who has not read the news must be able to answer from science alone.
</house_style>

<what_matters_most>
Correctness. Write only what you are sure of. Before you finish, answer your own stem as a strong player who has not seen your answer line would. If that player could defend a different answer, change the stem. For a computation, work it a second way.

Originality. You are shown library questions near this idea, with their answers. Their cues are used up. Your question must not ask for the same answer from the same fact as any of them, in any wording, and must not turn one of them around. Do not borrow their phrasing. If the idea cannot be written without repeating one of them, say so in "problem" and still give your best attempt.

Level. Keep to the level described. Do not make the question easier than its idea by adding hints, and do not make it harder by making it longer.
</what_matters_most>

<reply>
- stem: the question as it will be read.
- choices: for multiple choice, the four choices under W, X, Y and Z. Otherwise four empty strings.
- letter: for multiple choice, the letter of the right choice. Otherwise an empty string.
- answer: for short answer, the answer line's main answer. For multiple choice, an empty string.
- accept, reject: lists for short answer, usually empty. Always empty for multiple choice.
- why: one sentence on why the answer is right.
- whyNot: for multiple choice, one sentence for each wrong choice saying why it is wrong, each beginning with its letter. Otherwise empty.
- working: for a computation, the worked steps from the given values to the answer. Otherwise an empty string.
- choicesInOrder: true when the choices are in an order that means something and must not be rearranged (earliest to latest, smallest to largest in words). Otherwise false.
- timeTied: true if the answer could change with time. It should be false: prefer facts that do not.
- problem: an empty string, or one sentence if you could not meet a rule or doubt the idea.
</reply>`;

export const WRITE_PROMPT = promptVersion(writeSystem('HS'));

export const WRITE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stem', 'choices', 'letter', 'answer', 'accept', 'reject', 'why', 'whyNot', 'working', 'choicesInOrder', 'timeTied', 'problem'],
  properties: {
    stem: { type: 'string' },
    choices: { type: 'object', additionalProperties: false, required: ['W', 'X', 'Y', 'Z'], properties: { W: { type: 'string' }, X: { type: 'string' }, Y: { type: 'string' }, Z: { type: 'string' } } },
    letter: { type: 'string', enum: ['W', 'X', 'Y', 'Z', ''] },
    answer: { type: 'string' },
    accept: { type: 'array', items: { type: 'string' } },
    reject: { type: 'array', items: { type: 'string' } },
    why: { type: 'string' },
    whyNot: { type: 'array', items: { type: 'string' } },
    working: { type: 'string' },
    choicesInOrder: { type: 'boolean' },
    timeTied: { type: 'boolean' },
    problem: { type: 'string' },
  },
};

function ideaText(idea: Idea): string {
  return [`Answer: ${idea.answer}`, `Fact tested: ${idea.fact}`, `How the question points to it: ${idea.cue}`, ...(idea.method ? [`Method and numbers: ${idea.method}`] : [])].join('\n');
}

function userText(slot: Slot, idea: Idea, context: WriteContext): string {
  const form = slot.form === 'multiple_choice' ? ` Put the right choice on ${slot.letter ?? 'any letter'}, unless the choices are numbers.` : '';
  return [
    `<level>\n${tierBrief(slot.level, slot.tier)}\n</level>`,
    `<slot>\n${slotLine(slot)}\nSkill: ${SKILL_MEANING[slot.skill]}.${form}\nStem length: usually about ${context.lengths.usual} words; never more than ${context.lengths.most}.\n</slot>`,
    `<idea>\n${ideaText(idea)}\n</idea>`,
    ...(context.news ? [`<news_item>\n${newsText(context.news)}\n</news_item>`] : []),
    `<official_questions_at_this_level>\n${examplesText(context.examples)}\n</official_questions_at_this_level>`,
    `<library_questions_near_this_idea>\n${context.near.length ? context.near.map((l) => l.line).join('\n') : '(the search found none)'}\n</library_questions_near_this_idea>`,
  ].join('\n\n');
}

export function writeRequest(id: string, slot: Slot, idea: Idea, context: WriteContext, model: string): ModelRequest {
  return { id, step: 'write', model, effort: 'medium', system: writeSystem(slot.level), user: userText(slot, idea, context), schema: WRITE_SCHEMA, maxTokens: 8000 };
}

/** What the writer returned: the draft, and its reasons for the reviewer. */
export interface Written {
  draft: Draft;
  why: string;
  /** Multiple choice: why each wrong choice is wrong. */
  whyNot: string[];
  /** A computation's worked steps. */
  working: string;
  /** The writer says the answer could change with time: such a question is not kept. */
  timeTied: boolean;
  /** What the writer could not do, in its own words. */
  problem: string;
}

/** The question in a reply, shaped for the slot, or null when the reply is not one. */
export function readWritten(reply: ModelReply, slot: Slot, news?: NewsItem): Written | null {
  if (reply.outcome !== 'ok') return null;
  const r = reply.json as Record<string, unknown> | undefined;
  const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const list = (v: unknown) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);
  if (!r || !text(r.stem)) return null;
  let question: QuestionText;
  if (slot.form === 'multiple_choice') {
    const given = (r.choices ?? {}) as Record<string, unknown>;
    const choices = Object.fromEntries(LETTERS.map((l) => [l, text(given[l])])) as Record<Letter, string>;
    const letter = text(r.letter) as Letter;
    if (!LETTERS.includes(letter) || LETTERS.some((l) => !choices[l])) return null;
    question = { kind: slot.kind, subject: slot.subject, format: 'multiple_choice', stem: text(r.stem), choices, answerLetter: letter, answer: withoutGuides(choices[letter]), accept: [], reject: [] };
  } else {
    if (!text(r.answer)) return null;
    question = { kind: slot.kind, subject: slot.subject, format: 'short_answer', stem: text(r.stem), answer: text(r.answer), accept: list(r.accept), reject: list(r.reject) };
  }
  const draft: Draft = {
    question,
    level: slot.level,
    tier: slot.tier,
    form: slot.form,
    ...(slot.letter ? { letter: slot.letter } : {}),
    ...(r.choicesInOrder === true ? { keepChoiceOrder: true } : {}),
    // An Energy question's opening is as true as its news item, and as old.
    ...(news ? { sources: [{ title: news.title, url: news.url, published: news.date }], asOf: news.date } : {}),
  };
  return { draft, why: text(r.why), whyNot: list(r.whyNot), working: text(r.working), timeTied: r.timeTied === true, problem: text(r.problem) };
}

/**
 * The second and last try for a question the code checks failed: the same slot, idea and context, the draft
 * as it stands, and what the checks said.
 */
export function repairRequest(id: string, slot: Slot, idea: Idea, context: WriteContext, written: Written, findings: readonly Finding[], model: string): ModelRequest {
  const problems = findings.filter((f) => f.level === 'error').map((f) => `- ${f.message}`);
  const user = `${userText(slot, idea, context)}\n\n<your_draft>\n${asReadWithAnswer(written.draft.question)}\n</your_draft>\n\n<what_the_checks_found>\n${problems.join('\n')}\n</what_the_checks_found>\n\nWrite the question again so that every one of these is fixed and nothing else gets worse. Keep the idea, and keep what was right about the draft.`;
  return { id, step: 'repair', model, effort: 'medium', system: writeSystem(slot.level), user, schema: WRITE_SCHEMA, maxTokens: 8000 };
}
