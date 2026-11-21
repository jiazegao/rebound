/**
 * Library search: finds the questions a draft might repeat, so a judge can compare them (plan steps 3 and 6).
 * Two lookups, both plain code with no model:
 *
 *  - the same-answer list: questions whose answer is the draft's answer, contains it, is contained in it,
 *    or shares at least half its words;
 *  - a keyword search (BM25, a standard ranking that favours shared uncommon words) over each question's
 *    stem, choices and answer.
 *
 * On the 63 draft-and-DOE pairs Rebound's November 2026 pilot labelled as matches, the top 20 of the two
 * lists together hold the matching DOE question for 61, including all 55 strict duplicates (search.test.ts).
 * Wording alone finds few of them: the studio's fingerprint check flagged none of the first 41. Folding plurals
 * together ("lichens" with "lichen") was tried and did not help: it moved one more pair into the top 10 and
 * pushed another out of the top 20.
 *
 * `nearCopies` is for drafts that are close to word for word, which need no judge: 60% of three-word runs
 * shared with a library question, or the studio's fingerprint match together with 30%. The plan proposed 30%
 * alone. Measured, that is far too low: it called one in five of DOE's own 2019–22 questions a copy of another
 * library question, most of them different questions that share a stock phrase ("…is an example of what class
 * of…"), and it rejected three of the pilot's final questions that its checkers had passed. From 60% up, the
 * pairs are the same sentence with a number or a name changed. A fingerprint match alone is not enough either:
 * among the pilot's drafts it paired a question about a prism with one about planets.
 *
 *   npx tsx scripts/gen/search.ts --stem "…" --answer "…" [--choices "a|b|c|d"] [--top 20]   (npm run gen:search --)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hamming, questionText, shingles, simhash } from '../../src/core/fingerprint';
import { NEAR_DUPLICATE_BITS } from '../../src/core/studio';
import { loadLibrary } from './library';
import { contentWords, plain } from './text';

/** What search needs of a question: library questions, bank questions and drafts all have it. */
export interface Searchable {
  id: string;
  stem: string;
  choices?: Record<string, string>;
  /** The main answer: for multiple choice, the right choice's text. */
  answer: string;
}

export type Query = Omit<Searchable, 'id'>;

interface Entry {
  item: Searchable;
  /** How often each content word occurs. */
  counts: Map<string, number>;
  length: number;
  answerPlain: string;
  answerWords: Set<string>;
  fingerprint: string;
}

export interface SearchIndex {
  entries: Entry[];
  /** Word → the entries that have it. */
  postings: Map<string, number[]>;
  meanLength: number;
  /** How a text is cut into the words that are compared. */
  words: (text: string) => string[];
}

/** How many of each list `neighbours` takes: the depth the pilot's pairs were measured at. */
export const TOP = 20;
/** A draft sharing this much of its three-word runs with a question is a near copy. */
export const NEAR_COPY_SHARED = 0.6;
/** A fingerprint match counts as a near copy only with this much of the three-word runs shared as well. */
export const NEAR_COPY_WITH_FINGERPRINT = 0.3;
/** BM25's two standard settings: how fast repeats of a word stop counting, and how much length is evened out. */
const K1 = 1.2;
const B = 0.75;

export function buildIndex(items: readonly Searchable[], words: (text: string) => string[] = contentWords): SearchIndex {
  const postings = new Map<string, number[]>();
  const entries = items.map((item, i): Entry => {
    const text = questionText(item);
    const list = words(text);
    const counts = new Map<string, number>();
    for (const w of list) counts.set(w, (counts.get(w) ?? 0) + 1);
    for (const w of counts.keys()) {
      const list = postings.get(w);
      if (list) list.push(i);
      else postings.set(w, [i]);
    }
    return { item, counts, length: list.length, answerPlain: plain(item.answer), answerWords: new Set(words(item.answer)), fingerprint: simhash(text) };
  });
  const total = entries.reduce((a, e) => a + e.length, 0);
  return { entries, postings, meanLength: entries.length ? total / entries.length : 0, words };
}

/** Every entry that shares a content word with `text`, best first: [entry number, score]. */
function ranked(index: SearchIndex, text: string): Array<[number, number]> {
  const n = index.entries.length;
  const scores = new Map<number, number>();
  for (const word of new Set(index.words(text))) {
    const list = index.postings.get(word);
    if (!list) continue;
    const rarity = Math.log(1 + (n - list.length + 0.5) / (list.length + 0.5));
    for (const i of list) {
      const e = index.entries[i]!;
      const count = e.counts.get(word)!;
      scores.set(i, (scores.get(i) ?? 0) + (rarity * count * (K1 + 1)) / (count + K1 * (1 - B + (B * e.length) / index.meanLength)));
    }
  }
  return [...scores].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

/** The questions that share the most telling words with `text`, best first. */
export function keywordSearch(index: SearchIndex, text: string, limit = TOP): Array<{ id: string; score: number }> {
  return ranked(index, text)
    .slice(0, limit)
    .map(([i, score]) => ({ id: index.entries[i]!.item.id, score }));
}

/** Whether two answers are the same for search: equal, one inside the other, or half their words shared. */
function answersMatch(aPlain: string, a: Set<string>, e: Entry): boolean {
  if (a.size === 0 || e.answerWords.size === 0) return false;
  if (aPlain === e.answerPlain) return true;
  let shared = 0;
  for (const w of a) if (e.answerWords.has(w)) shared += 1;
  return shared === a.size || shared === e.answerWords.size || shared * 2 >= Math.max(a.size, e.answerWords.size);
}

/** The entry numbers of the questions with the same answer, in the index's order. */
function sameAnswerEntries(index: SearchIndex, answer: string): number[] {
  const a = new Set(index.words(answer));
  const aPlain = plain(answer);
  const out: number[] = [];
  index.entries.forEach((e, i) => {
    if (answersMatch(aPlain, a, e)) out.push(i);
  });
  return out;
}

/** The ids of the questions with the same answer. */
export function sameAnswer(index: SearchIndex, answer: string): string[] {
  return sameAnswerEntries(index, answer).map((i) => index.entries[i]!.item.id);
}

export interface Neighbour {
  id: string;
  /** Place in the keyword search (1 is best), when it is in that list's top. */
  keywordRank?: number;
  /** Place in the same-answer list, which is put in the keyword search's order. */
  sameAnswerRank?: number;
}

/**
 * The questions to show a judge beside a draft: the top of the keyword search and the top of the
 * same-answer list, without repeats, closest first. `perList` questions are taken from each.
 */
export function neighbours(index: SearchIndex, q: Query, perList = TOP): Neighbour[] {
  const order = ranked(index, questionText(q));
  const place = new Map(order.map(([i], rank) => [i, rank]));
  const out = new Map<number, Neighbour>();
  order.slice(0, perList).forEach(([i], rank) => out.set(i, { id: index.entries[i]!.item.id, keywordRank: rank + 1 }));
  sameAnswerEntries(index, q.answer)
    .sort((x, y) => (place.get(x) ?? Infinity) - (place.get(y) ?? Infinity) || x - y)
    .slice(0, perList)
    .forEach((i, rank) => out.set(i, { ...(out.get(i) ?? { id: index.entries[i]!.item.id }), sameAnswerRank: rank + 1 }));
  const best = (n: Neighbour) => Math.min(n.keywordRank ?? Infinity, n.sameAnswerRank ?? Infinity);
  return [...out.values()].sort((a, b) => best(a) - best(b) || a.id.localeCompare(b.id));
}

export interface NearCopy {
  id: string;
  /** Bits of 64 by which the fingerprints differ (the Write studio flags 9 or fewer). */
  bits: number;
  /** Share of three-word runs the two texts have in common (0–1). */
  shared: number;
}

function sharedRuns(a: Set<string>, text: string): number {
  const b = new Set(shingles(text));
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const x of a) if (b.has(x)) both += 1;
  return both / (a.size + b.size - both);
}

/**
 * Questions the draft all but copies: 60% of three-word runs shared, or a fingerprint within the studio's
 * 9 bits together with 30%. These are rejected without asking a judge.
 */
export function nearCopies(index: SearchIndex, q: Query): NearCopy[] {
  const text = questionText(q);
  const fingerprint = simhash(text);
  const runs = new Set(shingles(text));
  // A copy shares most of its words, so it is among the best keyword matches; fingerprints are cheap enough to compare with all.
  const candidates = new Set(ranked(index, text).slice(0, 50).map(([i]) => i));
  const longEnough = text.trim().split(/\s+/).length >= 6;
  index.entries.forEach((e, i) => {
    if (longEnough && hamming(fingerprint, e.fingerprint) <= NEAR_DUPLICATE_BITS) candidates.add(i);
  });
  const out: NearCopy[] = [];
  for (const i of candidates) {
    const e = index.entries[i]!;
    const bits = hamming(fingerprint, e.fingerprint);
    const shared = sharedRuns(runs, questionText(e.item));
    if (shared >= NEAR_COPY_SHARED || (longEnough && bits <= NEAR_DUPLICATE_BITS && shared >= NEAR_COPY_WITH_FINGERPRINT)) out.push({ id: e.item.id, bits, shared: Math.round(1000 * shared) / 1000 });
  }
  return out.sort((a, b) => b.shared - a.shared || a.bits - b.bits || a.id.localeCompare(b.id));
}

/** The whole library as an index. */
export function libraryIndex(): SearchIndex {
  return buildIndex(loadLibrary().map((x) => x.question));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const stem = arg('stem');
  if (!stem) {
    console.error('Usage: npm run gen:search -- --stem "the question" --answer "its answer" [--choices "W text|X text|Y text|Z text"] [--top 20]');
    process.exit(1);
  }
  const letters = ['W', 'X', 'Y', 'Z'];
  const choices = arg('choices')?.split('|').map((c) => c.trim());
  const query: Query = { stem, answer: arg('answer') ?? '', ...(choices ? { choices: Object.fromEntries(choices.map((c, i) => [letters[i] ?? String(i), c])) } : {}) };
  const index = libraryIndex();
  const byId = new Map(index.entries.map((e) => [e.item.id, e.item]));
  const show = (id: string) => `${id}  ${byId.get(id)!.stem.slice(0, 110)}  →  ${byId.get(id)!.answer}`;
  const copies = nearCopies(index, query);
  if (copies.length) {
    console.log('Near copies (rejected without a judge):');
    for (const c of copies) console.log(`  ${show(c.id)}   [${Math.round(100 * c.shared)}% of three-word runs shared, ${c.bits} bits apart]`);
  }
  console.log(`Closest of ${index.entries.length} library questions (k: place in the keyword search, a: place in the same-answer list):`);
  for (const n of neighbours(index, query, Number(arg('top') ?? TOP))) {
    console.log(`  ${n.keywordRank ? `k${n.keywordRank}` : '   '} ${n.sameAnswerRank ? `a${n.sameAnswerRank}` : '   '}  ${show(n.id)}`);
  }
}
