/**
 * The generated DOE library in public/data/doe (skipped if it has not been built):
 *  - index.json lists the high school sets, then the middle school sets, and every summary matches its set file;
 *  - the middle school files are in sync with the code that built them: topic tags (src/core/tagging.ts),
 *    the Physical Science split (doeSubjects.ts) and the reviewed errata (doeErrata.ts); rebuild with
 *    `npm run data:build:ms` after editing any of them;
 *  - catalog-ms.json and concepts-ms.json list exactly the middle school questions (catalog.json, the high school
 *    one, is checked in src/core/tagging.test.ts).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Catalog, type ConceptIndex, type LibraryIndex, type Question, type QuestionSet } from '../schema';
import { tagQuestion } from '../tagging';
import { TOPICS } from '../taxonomy';
import { DOE_ERRATA } from './doeErrata';
import { isPrintedPhysicalScience, physicalScienceEvidence } from './doeSubjects';
import { catalogRound } from '../levels';

const dir = join(process.cwd(), 'public/data/doe');
const read = <T,>(file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as T;
const built = ['index.json', 'catalog-ms.json', 'concepts-ms.json'].every((f) => existsSync(join(dir, f)));

const questionsOf = (set: QuestionSet) =>
  set.rounds.flatMap((r) => r.pairs.flatMap((p) => (p.bonus ? [p.tossup, p.bonus] : [p.tossup])).map((q) => ({ q, round: catalogRound(set.id, r.order) })));

describe.skipIf(!built)('the DOE library index', () => {
  const index = built ? read<LibraryIndex>('index.json') : { generatedAt: '', sets: [] };

  it('lists the high school sets first, then the middle school sets, each with its own id prefix', () => {
    const levels = index.sets.map((s) => s.level);
    expect(levels.indexOf('MS')).toBeGreaterThan(0);
    expect(levels.slice(levels.indexOf('MS')).every((l) => l === 'MS')).toBe(true);
    for (const s of index.sets) expect(s.id.startsWith(s.level === 'HS' ? 'doe-hs-' : 'doe-ms-'), s.id).toBe(true);
    expect(new Set(index.sets.map((s) => s.id)).size).toBe(index.sets.length);
  });

  it('has the 16 middle school sample sets and the Sample Rounds', () => {
    const ms = index.sets.filter((s) => s.level === 'MS');
    expect(ms.map((s) => s.id)).toEqual([...Array.from({ length: 16 }, (_, i) => `doe-ms-${String(i + 1).padStart(2, '0')}`), 'doe-ms-finals']);
    expect(ms.filter((s) => s.setNumber).map((s) => s.setNumber)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(ms.find((s) => s.id === 'doe-ms-finals')?.rounds.map((r) => r.label)).toEqual([
      'Round Robin Round 2',
      'Round Robin Round 5',
      'Double Elimination Round 1',
      'Double Elimination Round 3',
    ]);
  });

  it('matches every set file', () => {
    for (const summary of index.sets) {
      const set = read<QuestionSet>(summary.file);
      expect(summary.file).toBe(`${summary.id}.json`);
      expect({ id: set.id, level: set.level, title: set.title, year: set.year, setNumber: set.setNumber }).toEqual({
        id: summary.id,
        level: summary.level,
        title: summary.title,
        year: summary.year,
        setNumber: summary.setNumber,
      });
      expect(summary.rounds).toEqual(
        set.rounds.map((r) => ({ id: r.id, label: r.label, order: r.order, ...(r.sourceUrl ? { sourceUrl: r.sourceUrl } : {}), pairs: r.pairs.length })),
      );
      const qs = questionsOf(set).map((x) => x.q);
      expect(summary.questionCount).toBe(qs.length);
      const counts: Record<string, number> = {};
      for (const q of qs) counts[q.subject] = (counts[q.subject] ?? 0) + 1;
      expect(summary.subjectCounts).toEqual(counts);
      for (const r of set.rounds) {
        expect(r.id.startsWith(`${set.id}-r`)).toBe(true);
        for (const p of r.pairs) {
          for (const q of [p.tossup, p.bonus]) {
            if (!q) continue;
            expect(q.id.startsWith(`${r.id}-`), q.id).toBe(true);
            expect(q.source).toMatchObject({ provider: 'doe', setId: set.id, roundId: r.id });
          }
        }
      }
    }
  });
});

describe.skipIf(!built)('the middle school library', () => {
  const index = built ? read<LibraryIndex>('index.json') : { generatedAt: '', sets: [] };
  const sets = index.sets.filter((s) => s.level === 'MS').map((s) => read<QuestionSet>(s.file));
  const rows = sets.flatMap(questionsOf);
  const questions: Question[] = rows.map((r) => r.q);

  it('has about 11,700 questions, every toss-up with its bonus', () => {
    expect(questions.length).toBeGreaterThan(11_000);
    for (const set of sets) for (const r of set.rounds) for (const p of r.pairs) expect(p.bonus, p.tossup.id).toBeDefined();
  });

  it('stores tags that match the current rules', () => {
    const stale = questions.filter((q) => {
      const t = tagQuestion(q);
      return q.topic !== t.topic || JSON.stringify(q.concepts ?? []) !== JSON.stringify(t.concepts) || q.crossSubject !== t.crossSubject;
    });
    expect(stale.map((q) => q.id).slice(0, 10)).toEqual([]);
  });

  it('stores Physical Science subjects that match the current split', () => {
    const printed = questions.filter(isPrintedPhysicalScience);
    expect(printed.length).toBeGreaterThan(2000);
    const stale = printed.filter((q) => q.subject !== (physicalScienceEvidence(q).subject ?? 'physical_science'));
    expect(stale.map((q) => q.id).slice(0, 10)).toEqual([]);
    // Most of them get a 2027 subject.
    expect(printed.filter((q) => q.subject === 'physical_science').length / printed.length).toBeLessThan(0.15);
  });

  it('applies every middle school erratum', () => {
    const byId = new Map(questions.map((q) => [q.id, q]));
    for (const e of DOE_ERRATA.filter((x) => x.id.startsWith('doe-ms-'))) {
      const q = byId.get(e.id);
      expect(q?.answerLetter, e.id).toBe(e.answerLetter);
      expect(q?.flags).toContain('erratum');
      expect(q?.notes).toContain(e.note);
    }
  });

  it('writes a catalog row for every middle school question in library order', () => {
    const raw = readFileSync(join(dir, 'catalog-ms.json'), 'utf8');
    const catalog = JSON.parse(raw) as Catalog;
    expect(raw.trimEnd()).not.toContain('\n');
    expect(catalog.questions).toEqual(rows.map(({ q, round }) => [q.id, q.subject, q.topic ?? '', q.kind === 'tossup' ? 't' : 'b', round, q.crossSubject ?? '']));
    expect(Object.keys(catalog.topicCounts)).toEqual(TOPICS.map((t) => t.id));
    for (const t of TOPICS) expect(catalog.topicCounts[t.id]).toBe(questions.filter((q) => q.topic === t.id).length);
  });

  it('writes the questions of each concept to concepts-ms.json', () => {
    const raw = readFileSync(join(dir, 'concepts-ms.json'), 'utf8');
    const concepts = JSON.parse(raw) as ConceptIndex;
    expect(raw.trimEnd()).not.toContain('\n');
    expect(concepts.generatedAt).toBe(read<Catalog>('catalog-ms.json').generatedAt);
    const expected: Record<string, string[]> = {};
    for (const q of questions) for (const c of q.concepts ?? []) (expected[c] ??= []).push(q.id);
    expect(concepts.concepts).toEqual(expected);
  });

  it('keeps the high school catalog and concept files to the high school questions', () => {
    const msIds = new Set(questions.map((q) => q.id));
    expect(read<Catalog>('catalog.json').questions.some((r) => msIds.has(r[0]))).toBe(false);
    expect(Object.values(read<ConceptIndex>('concepts.json').concepts).flat().some((id) => msIds.has(id))).toBe(false);
  });
});
