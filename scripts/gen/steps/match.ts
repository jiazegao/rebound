/**
 * Whether an answer is the answer on the answer line, in other words (plan step 7).
 *
 * Rebound's answer checker (src/core/judge) decides first, in code. It is strict about form, as it must be
 * for players, and a solver's right answer often fails it: "Sodium (Na+)" for SODIUM, "Bremsstrahlung" for
 * BREMSSTRAHLUNG RADIATION. On the first 48 DOE questions a solver was given, it disagreed with the key eight
 * times by the checker's count and not once in fact. So when the checker does not accept a short answer, a
 * small model is asked whether a competition judge would.
 *
 * It rules on sameness only. An answer that is different from the answer line and also right is still a
 * rejection here: whether the answer line is right is the second look's question.
 */
import type { Level, Question } from '../../../src/core/schema';
import type { ModelReply, ModelRequest } from '../llm';
import type { QuestionText } from '../types';
import { asReadWithAnswer, LEVEL_NAME, promptVersion } from './show';

type Shown = Pick<Question, 'kind' | 'subject' | 'format' | 'stem' | 'answer' | 'accept' | 'reject'> & Partial<Pick<Question, 'choices' | 'answerLetter'>>;

export const MATCH_VERDICTS = ['accept', 'reject', 'unsure'] as const;
export type MatchVerdict = (typeof MATCH_VERDICTS)[number];

export interface Match {
  verdict: MatchVerdict;
  /** The comparison the verdict rests on. */
  why: string;
}

export const matchSystem = (level: Level) => `You help judge answers in the National Science Bowl, a buzzer competition in science and mathematics for ${LEVEL_NAME[level]} teams. You are given a question, its answer line, and the answer a player gave. Decide whether a competition judge holding that answer line would accept the player's answer.

An answer line gives the main answer in capitals. In brackets after it may come other forms the judge accepts (ACCEPT) and near misses the judge refuses (DO NOT ACCEPT).

The three verdicts:
- accept: the player's answer is the same answer as the answer line's. It names the same thing another way, or by a standard abbreviation, symbol or formula; or it is the same value in another exact form; or it is the same list in the order asked; or it differs only by a harmless word, such as leaving out a word the question itself supplies (the question asks "what type of bond" and the answer line says COVALENT BOND: "covalent" is accepted).
- reject: the player's answer is a different thing; or it is less specific than the answer line requires (the class where a member of it is asked for, "an ion of copper" where the charge is needed); or it is on the DO NOT ACCEPT list; or it is a different value; or it gives the right things in the wrong order when an order is asked for.
- unsure: you cannot tell whether the two are the same thing.

The competition's conventions, which decide many close calls:
- Numerical answers are exact and in simplest form: fractions in lowest terms, radicals simplified. Scientific notation is not accepted unless the question asks for it. When the question asks for a number of decimal places or significant figures, or says how to round, the answer must be given that way, as a decimal or a whole number: the exact value in another form is then a different answer.
- A complex number is given as a + bi, and a polynomial in standard form, by decreasing degree. The same quantity with its terms in another order is not accepted.
- A unit need not be stated, but a wrong unit is wrong.
- When something has a name, the name is required, not a description of it: the name of a law, not its formula.
- A technical term is required where the question asks for one. A popular nickname, an everyday word for it, or a neighbouring term that means something slightly different is a different answer.
- For a person, the last name is enough.
- A chemical formula stands for a compound only when no other compound shares it. When the question asks for a systematic name, an older or common name is a different answer.

When you are in real doubt whether a judge would take it, say "unsure": a doubt is checked again, and a wrong "accept" is not.

Judge the player's answer against the answer line and nothing else. Do not decide whether the answer line itself is right. If the player's answer is a different answer that you think is also correct, the verdict is still "reject": say so in your comparison.

Reply with your comparison in a sentence or two, and then the verdict.`;

export const MATCH_PROMPT = promptVersion(matchSystem('HS'));

export const MATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  // The comparison comes first, so the verdict follows from it.
  required: ['compare', 'verdict'],
  properties: { compare: { type: 'string' }, verdict: { type: 'string', enum: [...MATCH_VERDICTS] } },
};

export function matchRequest(id: string, question: Shown | QuestionText, said: string, level: Level, model: string): ModelRequest {
  const user = `<question>\n${asReadWithAnswer(question)}\n</question>\n\n<player_answer>\n${said.trim()}\n</player_answer>`;
  return { id, step: 'match', model, effort: 'low', system: matchSystem(level), user, schema: MATCH_SCHEMA, maxTokens: 2000 };
}

export function readMatch(reply: ModelReply): Match | null {
  if (reply.outcome !== 'ok') return null;
  const m = reply.json as { compare?: unknown; verdict?: unknown } | undefined;
  if (!m || !(MATCH_VERDICTS as readonly string[]).includes(String(m.verdict))) return null;
  return { verdict: m.verdict as MatchVerdict, why: typeof m.compare === 'string' ? m.compare.trim() : '' };
}

/**
 * The answer checker's verdict and the model's, as one: the checker's "agrees" stands; otherwise an accepted
 * match agrees, a rejected one disagrees, and anything else is left for a person or the second look.
 */
export function settled(checker: 'agrees' | 'close' | 'disagrees', match: Match | null): 'agrees' | 'close' | 'disagrees' {
  if (checker === 'agrees') return 'agrees';
  if (!match) return checker;
  return match.verdict === 'accept' ? 'agrees' : match.verdict === 'reject' ? 'disagrees' : 'close';
}
