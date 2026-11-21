/**
 * The second look (plan step 7): a stronger model rules on a question the other checks could not agree
 * about: a solver that disagrees with the key, a second answer someone called defensible, a recomputation
 * that came out differently, a fact no source supported. It is told what each check found, never what the
 * writer said. One question in ten that passed everything is sent here too, to measure how often the
 * checkers are wrong together.
 *
 * It rules that the key is right, that the key is wrong, or that the question is ambiguous. Only an ambiguous
 * question can be mended (an ACCEPT entry, a tighter stem), once, after which it is checked again from step 5.
 *
 * A question with a numeric answer is given the code tool; any other, web search on the allowed sites. A
 * reply that uses a tool cannot be held to a JSON shape, so the ruling is read from the end of its text.
 */
import type { Level, Question } from '../../../src/core/schema';
import type { LabTable } from '../labs';
import { lastJsonObject, type ModelReply, type ModelRequest } from '../llm';
import { allowedDomains, sourceStatus, type SourceLists } from '../sources';
import { isNumericAnswer } from '../text';
import type { QuestionText, SourceRef } from '../types';
import { asReadWithAnswer, LEVEL_NAME, promptVersion } from './show';

type Shown = Pick<Question, 'kind' | 'subject' | 'format' | 'stem' | 'answer' | 'accept' | 'reject'> & Partial<Pick<Question, 'choices' | 'answerLetter'>>;

export const RULINGS = ['key right', 'key wrong', 'ambiguous'] as const;
export type Ruling = (typeof RULINGS)[number];

/** How many searches a second look may make. */
export const SECOND_SEARCHES = 4;

export interface SecondLook {
  ruling: Ruling;
  /** The answer the model holds to be right, in the competition's form. */
  answer: string;
  reason: string;
  /** For an ambiguous question: what would mend it. Empty fields mean no change. */
  fix: { stem: string; accept: string[]; reject: string[] };
  sources: SourceRef[];
}

export const secondSystem = (level: Level) => `You are the last check on practice questions written for the National Science Bowl, a buzzer competition in science and mathematics for ${LEVEL_NAME[level]} teams. You are given one question with its answer line, and what earlier checks found: usually a solver who answered differently, a second answer someone thought defensible, a calculation that came out differently, or a fact for which no source was found. Sometimes the earlier checks found nothing and the question is here as a spot check. Decide whether the question can be used.

<how_to_rule>
Work the question out for yourself before you weigh what the checks said. They are evidence, not verdicts: a solver can be wrong, and so can an answer line. Use your tool: for a calculation, do the arithmetic in code; for a fact, search, and rely on what the pages say over what you remember.

Then give one ruling:
- key right: the answer line is correct, and no other answer a knowledgeable player might give is correct. Where a check disagreed, say why the check was wrong.
- key wrong: the answer line is incorrect, or no answer is correct as the question is worded. Give the right answer if there is one.
- ambiguous: the answer line is correct, but the wording lets a knowledgeable player give a different answer that is also correct, or the same answer in a form the answer line would reject. Say exactly what the other answer is.

The standard is the competition's. A multiple-choice question needs one best choice, and an answer line needs the one answer a judge can hold a player to. Numerical answers are exact and in simplest form unless the question says how to round. An answer line may accept other forms of the same answer. Do not call a question ambiguous for a reading no careful player would take.
</how_to_rule>

<mending>
Only an ambiguous question can be mended. Offer the smallest change that leaves one answer: an entry for the ACCEPT list when the other answer is another form of the same thing, an entry for the DO NOT ACCEPT list when it is a near miss that must be ruled out, or a reworded stem that pins the answer down. Keep the stem's length and style. If no small change would do it, leave the fix empty and say so.
</mending>

<reply>
Explain your ruling briefly. Then end your reply with one JSON object and nothing after it:
{"ruling": "key right" | "key wrong" | "ambiguous", "answer": "the right answer in the competition's form (for multiple choice, the letter and the text)", "reason": "one or two sentences", "fix": {"stem": "a reworded stem, or an empty string", "accept": ["entries to add"], "reject": ["entries to add"]}}
</reply>`;

export const SECOND_PROMPT = promptVersion(secondSystem('HS'));

/**
 * `findings` are the earlier checks' results in plain sentences ("A solver answered X) Mitochondrion, with
 * confidence 4."), and must not carry the writer's reasons. An empty list makes it a spot check.
 */
export function secondLookRequest(id: string, question: Shown | QuestionText, level: Level, findings: readonly string[], lists: SourceLists, labs: LabTable, model: string): ModelRequest {
  const found = findings.length ? findings.map((f) => `- ${f}`).join('\n') : 'Nothing: every earlier check passed. This is a spot check.';
  const user = `<question>\n${asReadWithAnswer(question)}\n</question>\n\n<what_the_checks_found>\n${found}\n</what_the_checks_found>`;
  const tool = isNumericAnswer(question) ? { code: true } : { search: { domains: allowedDomains(lists, labs), maxUses: SECOND_SEARCHES } };
  return { id, step: 'second-look', model, effort: 'high', system: secondSystem(level), user, ...tool, maxTokens: 12000 };
}

export function readSecondLook(reply: ModelReply, lists: SourceLists, labs: LabTable, today = new Date().toISOString().slice(0, 10)): SecondLook | null {
  if (reply.outcome !== 'ok') return null;
  const r = lastJsonObject(reply.text) as Record<string, unknown> | undefined;
  if (!r || !(RULINGS as readonly string[]).includes(String(r.ruling))) return null;
  const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const list = (v: unknown) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);
  const fix = (r.fix ?? {}) as Record<string, unknown>;
  const ruling = r.ruling as Ruling;
  const seen = new Set<string>();
  const sources: SourceRef[] = [];
  for (const c of reply.citations) {
    if (sourceStatus(c.url, lists, labs).status !== 'allowed' || seen.has(`${c.url}\n${c.quote}`)) continue;
    seen.add(`${c.url}\n${c.quote}`);
    sources.push({ title: c.title, url: c.url, ...(c.quote ? { quote: c.quote } : {}), checked: today });
  }
  return {
    ruling,
    answer: text(r.answer),
    reason: text(r.reason),
    // Only an ambiguous question is mended: a fix offered with any other ruling is not used.
    fix: ruling === 'ambiguous' ? { stem: text(fix.stem), accept: list(fix.accept), reject: list(fix.reject) } : { stem: '', accept: [], reject: [] },
    sources,
  };
}
