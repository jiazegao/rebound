/**
 * The question-writing studio (Team → Write, proposal section 8): automatic checks on a draft, the
 * peer-review rules, near-duplicate search, and turning approved questions into a team packet.
 * Pure functions; the page and the store do the rest.
 */
import { hamming, jaccard, questionText, simhash } from './fingerprint';
import { judgeAnswer } from './judge/judge';
import { parseNumber } from './judge/numbers';
import { LETTERS, SUBJECT_LABELS, type CoreSubject, type Player, type Question, type QuestionPair, type QuestionSet, type WrittenQuestion } from './schema';

export type CheckLevel = 'error' | 'warning';

export interface StudioCheck {
  level: CheckLevel;
  code: string;
  message: string;
}

/** Fingerprints this close (in bits of 64) mark a likely duplicate of a library question. */
export const NEAR_DUPLICATE_BITS = 9;
/** Team-written questions sharing this much of their wording are flagged as similar. */
export const SIMILAR_JACCARD = 0.5;
/** Toss-ups longer than this are hard to buzz on (DOE toss-ups are usually well under 50 words). */
export const TOSSUP_WORDS_WARN = 70;

/** The answer line as a reader sees it: "W) …" or "…", then ACCEPT and DO NOT ACCEPT. */
export function answerLine(q: Pick<Question, 'format' | 'answer' | 'answerLetter' | 'accept' | 'reject'>): string {
  const main = q.format === 'multiple_choice' && q.answerLetter ? `${q.answerLetter}) ${q.answer}` : q.answer;
  const parts = [main];
  if (q.accept.length) parts.push(`(ACCEPT: ${q.accept.join(', ')})`);
  if (q.reject.length) parts.push(`(DO NOT ACCEPT: ${q.reject.join(', ')})`);
  return parts.join(' ');
}

/** Make the stored fields consistent before saving: the multiple-choice answer text and the answer line. */
export function normalizeWritten(q: Question): Question {
  const out: Question = { ...q, stem: q.stem.trim(), accept: q.accept.map((a) => a.trim()).filter(Boolean), reject: q.reject.map((a) => a.trim()).filter(Boolean) };
  if (out.format === 'multiple_choice' && out.choices && out.answerLetter) {
    out.choices = Object.fromEntries(LETTERS.map((l) => [l, (out.choices![l] ?? '').trim()])) as Record<(typeof LETTERS)[number], string>;
    out.answer = out.choices[out.answerLetter];
    out.accept = [];
  } else if (out.format === 'short_answer') {
    delete out.choices;
    delete out.answerLetter;
    out.answer = out.answer.trim();
  }
  out.answerRaw = answerLine(out);
  return out;
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Everything the studio checks on a question. Errors block sending it for review; warnings do not. */
export function checkWritten(w: Pick<WrittenQuestion, 'question' | 'sources'>): StudioCheck[] {
  const q = w.question;
  const out: StudioCheck[] = [];
  const error = (code: string, message: string) => out.push({ level: 'error', code, message });
  const warning = (code: string, message: string) => out.push({ level: 'warning', code, message });

  if (!q.stem.trim()) error('stem', 'Write the question.');
  if (q.format === 'multiple_choice') {
    const texts = LETTERS.map((l) => (q.choices?.[l] ?? '').trim());
    if (texts.some((t) => !t)) error('choices', 'Multiple choice needs all four choices, W to Z.');
    else {
      if (new Set(texts.map((t) => t.toLowerCase())).size < 4) error('choices-same', 'Two choices are the same.');
      if (!q.answerLetter) error('letter', 'Mark the right choice.');
      else {
        // Only one choice may be right: no other choice should be accepted for the right one's text.
        const right = q.choices![q.answerLetter];
        const asShort = { format: 'short_answer' as const, stem: q.stem, answer: right, accept: [], reject: [] };
        const alsoRight = LETTERS.filter((l) => l !== q.answerLetter && judgeAnswer(asShort, q.choices![l]).verdict === 'correct');
        if (alsoRight.length) error('two-right', `Choice ${alsoRight.join(' and ')} would also be accepted as the answer; only one choice may be right.`);
      }
      const numeric = texts.map((t) => parseNumber(t) !== null);
      if (numeric.some(Boolean) && !numeric.every(Boolean)) warning('parallel-kind', 'Some choices are numbers and some are not. NSB choices are parallel: all of the same kind.');
      const lengths = texts.map((t) => t.length);
      if (Math.max(...lengths) > 25 && Math.max(...lengths) > 3 * Math.min(...lengths)) {
        warning('parallel-length', 'One choice is much longer than the others; a long, careful choice is often the right one, which gives it away.');
      }
      if (texts.some((t) => /^(all|none|both|neither) of the (above|these)\b/i.test(t))) warning('aota', '"All of the above" and "none of the above" are rare in NSB; four parallel options work better.');
    }
  } else {
    if (!q.answer.trim()) error('answer', 'Write the answer.');
    const n = parseNumber(q.answer);
    if (n?.unsimplified) error('simplest', 'The answer is not in simplest form (Rule A-2): reduce fractions, simplify radicals, and keep roots out of denominators.');
    if (n?.unit && !n.unitKnown) warning('unit', `The answer checker does not know the unit "${n.unit}", so a player who says it may be marked wrong. Put the unit in the question instead ("in meters").`);
    if (n?.kind === 'scientific' && !/scientific notation/i.test(q.stem)) warning('scientific', 'Answers are not given in scientific notation unless the question asks for it (Rule A-2 xii).');
    if (/\.\d*?(\d{1,3})\1{2,}/.test(q.answer)) warning('repeating', 'That looks like a repeating decimal: NSB answers give those as fractions (Rule A-2 xii).');
    if (/^-?\d+\.\d+$/.test(q.answer.trim()) && !/\b(decimal|nearest|round|tenth|hundredth|significant)/i.test(q.stem)) {
      warning('decimal', 'A decimal answer: say in the question how to round, or ask for an exact form.');
    }
  }
  if (!w.sources.some((s) => s.title.trim())) error('source', 'Cite at least one source (a textbook section, agency page or article) for the facts.');
  const n = words(q.stem);
  if (q.kind === 'tossup' && n > TOSSUP_WORDS_WARN) warning('long', `${n} words is long for a toss-up; DOE's are usually well under 50, so players can buzz on them.`);
  if ((q.stem.match(/\[/g) ?? []).length !== (q.stem.match(/\]/g) ?? []).length) error('brackets', 'A pronunciation guide is missing a bracket: write it like [sigh-toe-kines].');
  if (/\b(I|we|our|my)\b/.test(q.stem)) warning('voice', 'NSB questions are written impersonally; avoid "I", "we" and "our".');
  return out;
}

export function hasErrors(checks: StudioCheck[]): boolean {
  return checks.some((c) => c.level === 'error');
}

/** Library questions whose fingerprints are close to this question's, closest first. */
export function nearDuplicates(q: Pick<Question, 'stem' | 'choices' | 'answer'>, fingerprints: ReadonlyArray<readonly [string, string]>, limit = 5): Array<{ id: string; distance: number }> {
  const text = questionText(q);
  if (text.trim().split(/\s+/).length < 6) return [];
  const fp = simhash(text);
  const out: Array<{ id: string; distance: number }> = [];
  for (const [id, other] of fingerprints) {
    const d = hamming(fp, other);
    if (d <= NEAR_DUPLICATE_BITS) out.push({ id, distance: d });
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, limit);
}

/** Other team-written questions with much the same wording. */
export function similarWritten(q: Pick<Question, 'stem' | 'choices' | 'answer'>, others: readonly WrittenQuestion[], selfId?: string): Array<{ id: string; similarity: number }> {
  const text = questionText(q);
  return others
    .filter((o) => o.id !== selfId)
    .map((o) => ({ id: o.id, similarity: jaccard(text, questionText(o.question)) }))
    .filter((x) => x.similarity >= SIMILAR_JACCARD)
    .sort((a, b) => b.similarity - a.similarity);
}

/** Who may approve a question: anyone but its author who owns its subject, or a coach or captain. */
export function canReview(w: Pick<WrittenQuestion, 'authorId' | 'question'>, reviewer: Pick<Player, 'id' | 'role' | 'primarySubject'> | null): boolean {
  if (!reviewer || reviewer.id === w.authorId) return false;
  return reviewer.role === 'coach' || reviewer.role === 'captain' || reviewer.primarySubject === w.question.subject;
}

/**
 * A team packet from approved questions: toss-ups in rotating subject order, each with an approved bonus
 * in the same subject when there is one. Questions get packet ids, as uploads do.
 */
export function packetFromWritten(
  approved: readonly WrittenQuestion[],
  opts: { packetId: string; title: string; credit: string; pairsPerRound?: number },
): QuestionSet {
  const setId = `team-${opts.packetId}`;
  const tossups = approved.filter((w) => w.question.kind === 'tossup');
  const bonuses = approved.filter((w) => w.question.kind === 'bonus');
  const bySubject = new Map<string, WrittenQuestion[]>();
  for (const t of tossups) bySubject.set(t.question.subject, [...(bySubject.get(t.question.subject) ?? []), t]);
  const order: WrittenQuestion[] = [];
  while ([...bySubject.values()].some((l) => l.length)) for (const l of bySubject.values()) if (l.length) order.push(l.shift()!);
  const usedBonus = new Set<string>();
  const perRound = opts.pairsPerRound ?? 25;
  const rounds: QuestionSet['rounds'] = [];
  order.forEach((t, i) => {
    const r = Math.floor(i / perRound);
    const roundId = `${setId}-r${String(r + 1).padStart(2, '0')}`;
    if (!rounds[r]) rounds[r] = { id: roundId, label: `Round ${r + 1}`, order: r + 1, pairs: [] };
    const n = rounds[r]!.pairs.length + 1;
    const num = String(n).padStart(2, '0');
    const asQuestion = (w: WrittenQuestion, kind: 'tossup' | 'bonus', id: string): Question => ({
      ...w.question,
      id,
      kind,
      number: n,
      source: { provider: 'team', setId, roundId, credit: opts.credit },
      notes: [...(w.question.notes ?? []), ...(w.ai ? ['AI-drafted (internal practice only)'] : [])],
    });
    const bonus = bonuses.find((b) => !usedBonus.has(b.id) && b.question.subject === t.question.subject);
    if (bonus) usedBonus.add(bonus.id);
    const pair: QuestionPair = {
      number: n,
      tossup: asQuestion(t, 'tossup', `${roundId}-t${num}`),
      ...(bonus ? { bonus: asQuestion(bonus, 'bonus', `${roundId}-b${num}`) } : {}),
    };
    rounds[r]!.pairs.push(pair);
  });
  return {
    id: setId,
    provider: 'team',
    level: 'HS',
    title: opts.title,
    credit: opts.credit,
    license: 'Written by the team for its own practice.',
    rounds,
  };
}

/** "Physics toss-up, short answer" */
export function describeWritten(q: Pick<Question, 'kind' | 'subject' | 'format'>): string {
  return `${SUBJECT_LABELS[q.subject as CoreSubject] ?? q.subject} ${q.kind === 'tossup' ? 'toss-up' : 'bonus'}, ${q.format === 'multiple_choice' ? 'multiple choice' : 'short answer'}`;
}
