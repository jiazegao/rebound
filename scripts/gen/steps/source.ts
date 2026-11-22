/**
 * The source check (plan step 7): for a question that rests on a fact, a model with web search, limited to
 * the allowed sites (sources.ts), looks for a page that supports the answer line. It sees the question and
 * its answer, never the writer's reasons.
 *
 * What is kept as the source is the search tool's own citation: the page's address and up to 150 characters
 * taken from the page by the tool, not words the model typed. A verdict of "supported" with no citation
 * from an allowed site counts as nothing found.
 */
import type { Level, Question } from '../../../src/core/schema';
import type { LabTable } from '../labs';
import type { ModelReply, ModelRequest } from '../llm';
import { allowedDomains, sourceStatus, type SourceLists } from '../sources';
import type { NewsItem, QuestionText, SourceRef } from '../types';
import { newsText } from './ideas';
import { asReadWithAnswer, LEVEL_NAME, promptVersion } from './show';

type Shown = Pick<Question, 'kind' | 'subject' | 'format' | 'stem' | 'answer' | 'accept' | 'reject'> & Partial<Pick<Question, 'choices' | 'answerLetter'>>;

/** How many searches one check may make. Each costs a cent on top of the tokens its results take. */
export const SOURCE_SEARCHES = 3;

export type SourceVerdict = 'supported' | 'contradicted' | 'not-found';

export interface SourceCheck {
  verdict: SourceVerdict;
  /** The claim the answer line rests on, in the checker's words. */
  claim: string;
  /** The pages cited, with the search tool's own words from each. */
  sources: SourceRef[];
  /** The checker's account of what the pages say. */
  note: string;
}

export const sourceSystem = (level: Level) => `You check facts in practice questions written for the National Science Bowl, a buzzer competition in science and mathematics for ${LEVEL_NAME[level]} teams. You are given one question with its answer line. Find out whether trustworthy pages support the fact the answer line depends on.

<how_to_check>
1. Say in one sentence the claim that must be true for the answer line to be right. For "What enzyme unwinds DNA at the replication fork?" with the answer HELICASE, the claim is "Helicase is the enzyme that unwinds DNA at the replication fork."
2. Search for it. You have at most ${SOURCE_SEARCHES} searches, and the search returns only pages from an approved list: U.S. science agencies, the national laboratories, and reference works. Search for the claim's own terms, not the question's wording.
3. Judge only from what the pages say, not from what you remember. When you report what a page says, cite it, so that the passage can be shown to the person who reviews the question. A statement about a page that carries no citation counts for nothing.
4. Give a verdict:
   - supported: a page states the claim, or states facts from which it follows directly.
   - contradicted: a page states something that makes the answer line wrong, or that makes a different answer just as right.
   - not found: the searches did not settle it. Say what you searched for.
</how_to_check>

<also_notice>
- Whether the pages show the question is out of date: a laboratory or facility that has been renamed, a value since revised, a record since broken.
- For an Energy question that opens with research at a national laboratory: whether the opening sentence is true to the news item you are given, and to the laboratory's own page if a search finds it.
Report these in a sentence. They do not change the verdict unless they make the answer line wrong.
</also_notice>

<reply>
Write a short account of what you found, with citations. Then end with these two lines exactly:
CLAIM: <the claim in one sentence>
VERDICT: supported | contradicted | not found
</reply>`;

export const SOURCE_PROMPT = promptVersion(sourceSystem('HS'));

export function sourceRequest(id: string, question: Shown | QuestionText, level: Level, lists: SourceLists, labs: LabTable, model: string, news?: NewsItem): ModelRequest {
  const user = `<question>\n${asReadWithAnswer(question)}\n</question>${news ? `\n\n<news_item>\n${newsText(news)}\nPage: ${news.url}\n</news_item>` : ''}`;
  return { id, step: 'source', model, effort: 'medium', system: sourceSystem(level), user, search: { domains: allowedDomains(lists, labs), maxUses: SOURCE_SEARCHES }, maxTokens: 6000 };
}

/** The check in a reply, or null when the reply is not one. Citations from sites off the allowed list are dropped. */
export function readSourceCheck(reply: ModelReply, lists: SourceLists, labs: LabTable, today = new Date().toISOString().slice(0, 10)): SourceCheck | null {
  if (reply.outcome !== 'ok') return null;
  // The two closing lines, with or without the emphasis a model may put round them.
  const said = /^[\s*_]*VERDICT[\s*_]*:[\s*_]*(supported|contradicted|not found)\b/im.exec(reply.text)?.[1]?.toLowerCase();
  if (!said) return null;
  const claim = /^[\s*_]*CLAIM[\s*_]*:[\s*_]*(.+?)[\s*_]*$/im.exec(reply.text)?.[1]?.trim() ?? '';
  const seen = new Set<string>();
  const sources: SourceRef[] = [];
  for (const c of reply.citations) {
    if (sourceStatus(c.url, lists, labs).status !== 'allowed' || seen.has(`${c.url}\n${c.quote}`)) continue;
    seen.add(`${c.url}\n${c.quote}`);
    sources.push({ title: c.title, url: c.url, ...(c.quote ? { quote: c.quote } : {}), checked: today });
  }
  const note = reply.text.replace(/^[\s*_]*(CLAIM|VERDICT)[\s*_]*:.*$/gim, '').replace(/\n{3,}/g, '\n\n').trim();
  // "Supported" must come with a page: without one it is the model's memory, which is what this check is not.
  const verdict: SourceVerdict = said === 'contradicted' ? 'contradicted' : said === 'supported' && sources.length > 0 ? 'supported' : 'not-found';
  return { verdict, claim, sources, note };
}
