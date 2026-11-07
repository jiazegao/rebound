/**
 * Builds public/data/doe/ from the cached DOE PDFs:
 *   doe-hs-01.json ... doe-hs-17.json   one QuestionSet per sample set (compact JSON)
 *   index.json                          LibraryIndex of SetSummary entries
 *   catalog.json                        Catalog: one compact row per question, plus questions per topic
 * and writes the validation report scripts/doe/REPORT.md.
 *
 * Every question is tagged with a topic, concepts and (Energy only) a cross-subject by the rule-based
 * tagger in src/core/tagging.ts; the report's Topics section scores it against the hand-labelled
 * sample in scripts/doe/topic-eval.json.
 *
 *   npx tsx scripts/doe/build.ts [options]        (npm run data:build)
 *
 * Options (plain path arguments):
 *   --manifest <file>   default scripts/doe/manifest.json
 *   --pdf <dir>         default .cache/doe/pdf
 *   --out <dir>         default public/data/doe
 *   --report <file>     default scripts/doe/REPORT.md
 *   --fetch-log <file>  default .cache/doe/fetch-log.json (only read, for the report)
 *   --topic-eval <file> default scripts/doe/topic-eval.json (only read, for the report)
 *   --set <n>           build only this set (repeatable); the index and catalog then list only those sets
 *
 * The PDFs are untrusted input: they are only read as data by pdf.js (with eval disabled).
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  CORE_SUBJECTS,
  SUBJECT_LABELS,
  type Catalog,
  type CatalogRow,
  type CoreSubject,
  type LibraryIndex,
  type Question,
  type QuestionSet,
  type Round,
  type SetSummary,
  type Subject,
} from '../../src/core/schema';
import { tagQuestion } from '../../src/core/tagging';
import { TOPICS, topicName } from '../../src/core/taxonomy';
import {
  DOE_CREDIT,
  DOE_HS_SAMPLE_PAGE,
  DOE_LICENSE,
  doeRoundId,
  doeSetId,
  expectedPairsForYear,
  parseDoeRound,
  type ParseWarning,
} from '../../src/core/importers/doe';
import { extractTextLines } from '../../src/core/importers/pdfText';
import { applyDoeErrata, DOE_ERRATA } from '../../src/core/importers/doeErrata';

interface ManifestEntry {
  set: number;
  order: number;
  label: string;
  kind: 'round' | 'resource';
  url: string;
  file: string;
  year?: string;
}
interface ManifestSet {
  set: number;
  year?: string;
  yearEvidence?: string;
}
interface Manifest {
  source: string;
  sets: ManifestSet[];
  entries: ManifestEntry[];
}

/**
 * Questions compared by hand against `pdftotext` output of the PDF (see REPORT.md).
 * The report prints the current parse of each one so a regression is easy to spot.
 */
const SPOT_CHECKS: { id: string; note: string }[] = [
  // Random sample (seeded) across all sets: stem, options, answer and alternatives match the PDF.
  { id: 'doe-hs-01-r05-t12', note: 'match (2009 format, EARTH SCIENCE, long options)' },
  { id: 'doe-hs-01-r14-t03', note: 'match' },
  { id: 'doe-hs-01-r15-t05', note: 'match (typo "intrtmix" is in the PDF)' },
  { id: 'doe-hs-02-r10-b02', note: 'match after fix: space before the leading superscript in "the ¹H"' },
  { id: 'doe-hs-03-r04-t13', note: 'match (GENERAL SCIENCE kept as a legacy subject)' },
  { id: 'doe-hs-03-r05-b21', note: 'match (ASTRONOMY → earth_space)' },
  { id: 'doe-hs-03-r05-t22', note: 'match; C₆H₆ subscripts rendered' },
  { id: 'doe-hs-03-r14-t12', note: 'match' },
  { id: 'doe-hs-04-r11-t01', note: 'match' },
  { id: 'doe-hs-04-r12-t04', note: 'match' },
  { id: 'doe-hs-05-r10-b04', note: 'match' },
  { id: 'doe-hs-05-r10-b24', note: 'match (five wrapped stem lines)' },
  { id: 'doe-hs-06-r08-t11', note: 'match; (x² + 2y³)²⁰ rendered with superscripts' },
  { id: 'doe-hs-07-r10-b17', note: 'match' },
  { id: 'doe-hs-07-r15-b04', note: 'match' },
  { id: 'doe-hs-08-r02-b01', note: 'match; bracket pronunciation kept in the stem' },
  { id: 'doe-hs-08-r09-b11', note: 'match' },
  { id: 'doe-hs-09-r01-t03', note: 'match; "Answer:" in mixed case, ALSO ACCEPT split on OR' },
  { id: 'doe-hs-09-r03-b05', note: 'match' },
  { id: 'doe-hs-09-r05-b19', note: 'match' },
  { id: 'doe-hs-10-r02-t21', note: 'match; ACCEPT split on commas' },
  { id: 'doe-hs-10-r02-t22', note: 'match' },
  { id: 'doe-hs-10-r02-t23', note: 'match' },
  { id: 'doe-hs-10-r09-b11', note: 'match' },
  { id: 'doe-hs-10-r11-b10', note: 'match' },
  { id: 'doe-hs-11-r17-t19', note: 'match' },
  { id: 'doe-hs-12-r01-b16', note: 'match' },
  { id: 'doe-hs-12-r15-b04', note: 'match' },
  { id: 'doe-hs-14-r07-b01', note: 'match' },
  { id: 'doe-hs-15-r09-t13', note: 'match' },
  { id: 'doe-hs-16-r03-t05', note: 'match (2021 narrow layout, five wrapped lines)' },
  { id: 'doe-hs-17-r05-b15', note: 'match (2022 em dash format)' },
  { id: 'doe-hs-01-r05-b01', note: 'match; CrO₄²⁻ (pdftotext splits it over three lines)' },
  { id: 'doe-hs-03-r15-b04', note: 'θ restored after fix (sheared italic glyphs were dropped); the stacked fraction is lost, flagged' },
  // Hard cases checked on purpose.
  { id: 'doe-hs-02-r01-b09', note: 'inline stacked fraction read as (x−y)/(x+y) = 2/3' },
  { id: 'doe-hs-03-r17-t18', note: 'display fractions read as (x + 1)²/16 + (y − 2)²/9 = 1 ("!" minus glyph repaired)' },
  { id: 'doe-hs-03-r17-b18', note: 'display fraction (ln x)/x; answer (1 − ln x)/x²' },
  { id: 'doe-hs-07-r16-b02', note: 'exponents of consecutive option lines kept apart: 10⁻⁷, 10⁻⁵' },
  { id: 'doe-hs-07-r14-t01', note: 'PDF misprints option letters (W, X, W, Z); read in order' },
  { id: 'doe-hs-01-r05-t20', note: 'PDF answer "W) MERCURY-OXIDE CELLS" names option X; letter corrected and flagged' },
  { id: 'doe-hs-15-r02-t21', note: 'PDF leaves subscript formatting on after H₂; ACCEPT parsed as H₂ | DIHYDROGEN' },
  { id: 'doe-hs-17-r09-b18', note: 'moderator closing script after the last answer is not part of the answer' },
  { id: 'doe-hs-04-r02-t02', note: 'answer is an image in the PDF: answer-missing + image-not-extracted' },
];

const NOTES = [
  '## Notes',
  '',
  '- **Labels and order.** Round labels are the link texts on the official page ("Round 1"); the header printed in the PDF is listed per round below (e.g. Set 2 rounds 12-15 are printed as "Double Elimination ~ Round 1-4", newer files as "ROUND 17A"). Set 13 holds 2019 rounds 1-6 and 15-17, Set 14 rounds 7-14; `order` is the position within the set.',
  '- **Years.** Sets 10-17 use the known regional years (matching the file names and, for 10-11, the page). Sets 1-9 take the year from the page\'s table of contents ("Sample Questions Set 1 (from 2009)"); Set 3\'s footers ("2007 Regional Science Bowl") agree.',
  '- **Superscripts and subscripts** are found from the text position and size in the PDF and written as Unicode when every character has a Unicode form (x², 10⁻⁷, CO₃²⁻, H₂O), otherwise as ^(...) / _(...) (a^(b²+b), NaOH_((aqueous))). Stacked fractions become a/b with parentheses where needed ((x−y)/(x+y), (x + 1)²/16).',
  '- **Pronunciations** "(read as: ...)" from older sets are rewritten as "[...]" in stems, options and answers; `answerRaw` keeps the printed text.',
  '- **Known gaps.** Equations drawn with lines or images (radical signs, fraction bars without a text baseline between the parts, Set 4/6 inline equation images, a few answers that are images) cannot be recovered from text; Set 8 (29 questions, plus a few in Sets 2 and 7) uses an equation font whose characters map to unrelated scripts (Tamil, Telugu) or to U+FFFD. Such questions carry `possible-lost-formatting` (and `image-not-extracted` / `answer-missing` where it applies). No question in these packets says a figure is shown or provided, so `visual` is never set.',
  '- **Source errors kept visible.** Misprinted option letters, an answer letter that names a different option than the answer text, and a printed type that contradicts the layout are corrected only where the PDF itself is unambiguous, and always flagged.',
];

const SUBJECT_ORDER: Subject[] = [
  'biology',
  'chemistry',
  'earth_space',
  'energy',
  'math',
  'physics',
  'general_science',
  'computer_science',
  'physical_science',
];

interface RoundResult {
  entry: ManifestEntry;
  round?: Round;
  printedLabel?: string;
  warnings: ParseWarning[];
  pages?: number;
  error?: string;
  stray: number;
}

function parseArgs(root: string) {
  const opts = {
    manifest: path.join(root, 'scripts/doe/manifest.json'),
    pdf: path.join(root, '.cache/doe/pdf'),
    out: path.join(root, 'public/data/doe'),
    report: path.join(root, 'scripts/doe/REPORT.md'),
    fetchLog: path.join(root, '.cache/doe/fetch-log.json'),
    topicEval: path.join(root, 'scripts/doe/topic-eval.json'),
    sets: [] as number[],
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[++i];
    if (v === undefined) throw new Error(`missing value for ${a}`);
    if (a === '--manifest') opts.manifest = path.resolve(v);
    else if (a === '--pdf') opts.pdf = path.resolve(v);
    else if (a === '--out') opts.out = path.resolve(v);
    else if (a === '--report') opts.report = path.resolve(v);
    else if (a === '--fetch-log') opts.fetchLog = path.resolve(v);
    else if (a === '--topic-eval') opts.topicEval = path.resolve(v);
    else if (a === '--set') opts.sets.push(Number(v));
    else throw new Error(`unknown option ${a}`);
  }
  return opts;
}

async function parseRound(entry: ManifestEntry, file: string): Promise<RoundResult> {
  const setId = doeSetId(entry.set);
  const meta = { setId, roundId: doeRoundId(setId, entry.order), label: entry.label, order: entry.order, sourceUrl: entry.url, credit: DOE_CREDIT };
  const data = new Uint8Array(await readFile(file));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  try {
    const lines = await extractTextLines(doc, { ops: pdfjs.OPS as unknown as Record<string, number> });
    const result = parseDoeRound(lines, meta);
    applyDoeErrata(result.round);
    tagRound(result.round);
    return { entry, round: result.round, printedLabel: result.printedLabel, warnings: result.warnings, pages: doc.numPages, stray: result.strayLines.length };
  } finally {
    await doc.destroy();
  }
}

/** Topic, concepts and (Energy only) cross-subject from the rule-based tagger; absent fields are omitted. */
function tagRound(round: Round): void {
  for (const q of questionsOf(round)) {
    const tags = tagQuestion(q);
    if (tags.topic) q.topic = tags.topic;
    if (tags.concepts.length) q.concepts = tags.concepts;
    if (tags.crossSubject) q.crossSubject = tags.crossSubject;
  }
}

const isComplete = (q: Question) => !q.flags?.some((f) => f === 'category-unknown' || f === 'type-unknown' || f === 'answer-missing');
const questionsOf = (r: Round) => r.pairs.flatMap((p) => (p.bonus ? [p.tossup, p.bonus] : [p.tossup]));
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '–');
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const opts = parseArgs(root);
  const t0 = Date.now();
  const manifest = JSON.parse(await readFile(opts.manifest, 'utf8')) as Manifest;
  const fetchLog = existsSync(opts.fetchLog) ? JSON.parse(await readFile(opts.fetchLog, 'utf8')) : undefined;
  const setNumbers = [...new Set(manifest.entries.map((e) => e.set))]
    .filter((n) => !opts.sets.length || opts.sets.includes(n))
    .sort((a, b) => a - b);

  await mkdir(opts.out, { recursive: true });
  const summaries: SetSummary[] = [];
  const results = new Map<number, RoundResult[]>();
  const resources: ManifestEntry[] = [];
  const catalogRows: CatalogRow[] = [];

  for (const n of setNumbers) {
    const setInfo = manifest.sets.find((s) => s.set === n);
    const entries = manifest.entries.filter((e) => e.set === n).sort((a, b) => a.order - b.order);
    resources.push(...entries.filter((e) => e.kind === 'resource'));
    const roundResults: RoundResult[] = [];
    for (const entry of entries.filter((e) => e.kind === 'round')) {
      const file = path.join(opts.pdf, entry.file);
      if (!existsSync(file)) {
        roundResults.push({ entry, warnings: [], error: 'PDF not in cache (run npm run data:fetch)', stray: 0 });
        continue;
      }
      try {
        roundResults.push(await parseRound(entry, file));
      } catch (err) {
        roundResults.push({ entry, warnings: [], error: `parse failed: ${err instanceof Error ? err.message : String(err)}`, stray: 0 });
      }
    }
    results.set(n, roundResults);

    const rounds = roundResults.filter((r) => r.round).map((r) => r.round!);
    const id = doeSetId(n);
    const set: QuestionSet = {
      id,
      provider: 'doe',
      level: 'HS',
      title: `DOE High School Sample Set ${n}`,
      ...(setInfo?.year ? { year: setInfo.year } : {}),
      setNumber: n,
      sourcePage: DOE_HS_SAMPLE_PAGE,
      credit: DOE_CREDIT,
      license: DOE_LICENSE,
      rounds,
    };
    const fileName = `${id}.json`;
    await writeFile(path.join(opts.out, fileName), JSON.stringify(set));
    for (const r of rounds) {
      for (const q of questionsOf(r)) {
        catalogRows.push([q.id, q.subject, q.topic ?? '', q.kind === 'tossup' ? 't' : 'b', r.order, q.crossSubject ?? '']);
      }
    }

    const subjectCounts: Partial<Record<Subject, number>> = {};
    let questionCount = 0;
    for (const q of rounds.flatMap(questionsOf)) {
      questionCount++;
      subjectCounts[q.subject] = (subjectCounts[q.subject] ?? 0) + 1;
    }
    const orderedCounts: Partial<Record<Subject, number>> = {};
    for (const s of SUBJECT_ORDER) if (subjectCounts[s]) orderedCounts[s] = subjectCounts[s];
    summaries.push({
      id,
      provider: 'doe',
      level: 'HS',
      title: set.title,
      ...(set.year ? { year: set.year } : {}),
      setNumber: n,
      file: fileName,
      sourcePage: DOE_HS_SAMPLE_PAGE,
      credit: DOE_CREDIT,
      license: DOE_LICENSE,
      rounds: rounds.map((r) => ({ id: r.id, label: r.label, order: r.order, ...(r.sourceUrl ? { sourceUrl: r.sourceUrl } : {}), pairs: r.pairs.length })),
      questionCount,
      subjectCounts: orderedCounts,
    });
    const tu = rounds.reduce((a, r) => a + r.pairs.length, 0);
    const bo = rounds.reduce((a, r) => a + r.pairs.filter((p) => p.bonus).length, 0);
    console.log(`${id}: ${rounds.length}/${roundResults.length} rounds, ${tu} toss-ups, ${bo} bonuses`);
  }

  const index: LibraryIndex = { generatedAt: new Date().toISOString(), sets: summaries };
  await writeFile(path.join(opts.out, 'index.json'), JSON.stringify(index, null, 1) + '\n');

  // Every topic id in taxonomy order (0 when no question has it), so the file is complete and stable.
  const topicCounts: Record<string, number> = Object.fromEntries(TOPICS.map((t) => [t.id, 0]));
  for (const row of catalogRows) if (row[2]) topicCounts[row[2]] = (topicCounts[row[2]] ?? 0) + 1;
  const catalog: Catalog = { generatedAt: index.generatedAt, questions: catalogRows, topicCounts };
  await writeFile(path.join(opts.out, 'catalog.json'), JSON.stringify(catalog) + '\n');

  const topicEval = existsSync(opts.topicEval) ? (JSON.parse(await readFile(opts.topicEval, 'utf8')) as TopicLabel[]) : undefined;
  const report = buildReport(manifest, results, resources, fetchLog, topicEval);
  await writeFile(opts.report, report);
  console.log(
    `wrote ${summaries.length} set files + index.json + catalog.json (${catalogRows.length} questions) to ${path.relative(root, opts.out)}; ` +
      `report ${path.relative(root, opts.report)} (${Math.round((Date.now() - t0) / 1000)}s)`,
  );
}

/** How the labelled samples in scripts/doe/topic-eval.json were drawn and used (written by hand, like SPOT_CHECKS). */
const TOPIC_EVAL_NOTES = [
  '- **Main sample** (156 questions, 26 per core subject, seed 20261107): labelled by reading each question before any rule was written. The rules were developed on other, randomly chosen library questions; this sample was only used to measure them.',
  '- **holdout-1** (60 questions, 10 per subject, seed 20261108, excluding the main sample): labelled blind. The tagger scored 43 of 60 (71.7%) on it; a last round of general fixes (short terms whose automatic plural matched other words, such as "doe" in "does"; missing vocabulary such as "piezoelectric") was prompted partly by its errors, so its score below is no longer a blind estimate.',
  '- **holdout-2** (60 questions, seed 20261109, excluding both): drawn and labelled blind after the rules were frozen, then scored once. It is the fairest estimate for unseen questions.',
  '- Samples are drawn per subject in library order with mulberry32(seed) and a partial Fisher-Yates shuffle. Many disagreements are boundary cases between neighbouring topics (is the optimum pH of pepsin biochemistry or physiology?), where a second labeller might side with the tagger.',
];

/** One hand-labelled question from scripts/doe/topic-eval.json. */
interface TopicLabel {
  id: string;
  /** Topic id, or "none" when no topic of the question's subject fits. */
  topic: string;
  /** Energy only: the discipline the question really tests, or "none". */
  crossSubject?: string;
  /** "holdout" for the fresh samples checked after the rules were tuned; absent for the main sample. */
  sample?: string;
}

/** The "Topics" section of the report: coverage, topic and concept counts, cross-subjects, and accuracy on the labelled samples. */
function topicsReport(questions: Question[], labels: TopicLabel[] | undefined): string[] {
  const out: string[] = [];
  const core = questions.filter((q) => (CORE_SUBJECTS as Subject[]).includes(q.subject));
  const tagged = core.filter((q) => q.topic);
  out.push('## Topics', '');
  out.push(
    'Topics, concepts and Energy cross-subjects come from the rule-based tagger in `src/core/tagging.ts` (weighted keyword rules per topic; ' +
      'no network, no AI) and the subject map in `src/core/taxonomy.ts`. A question gets no topic rather than a guess when no rule scores high enough; ' +
      `legacy subjects (${questions.length - core.length} General Science questions) get none. Questions per topic are also in \`public/data/doe/catalog.json\`.`,
    '',
  );
  out.push(`Coverage: ${tagged.length} of ${core.length} core-subject questions have a topic (${pct(tagged.length, core.length)}).`, '');
  out.push('| Subject | Questions | With a topic | Untagged | Coverage |', '|---|---|---|---|---|');
  for (const s of CORE_SUBJECTS) {
    const qs = core.filter((q) => q.subject === s);
    const n = qs.filter((q) => q.topic).length;
    out.push(`| ${SUBJECT_LABELS[s]} | ${qs.length} | ${n} | ${qs.length - n} | ${pct(n, qs.length)} |`);
  }
  out.push('');

  out.push('### Questions per topic', '');
  out.push('| Subject | Topic | Questions | Share of subject | With concepts |', '|---|---|---|---|---|');
  for (const s of CORE_SUBJECTS) {
    const inSubject = core.filter((q) => q.subject === s).length;
    for (const t of TOPICS.filter((x) => x.subject === s)) {
      const qs = core.filter((q) => q.topic === t.id);
      const withConcepts = t.concepts.length ? String(qs.filter((q) => q.concepts?.length).length) : '–';
      out.push(`| ${SUBJECT_LABELS[s]} | ${t.name} (\`${t.id}\`) | ${qs.length} | ${pct(qs.length, inSubject)} | ${withConcepts} |`);
    }
  }
  out.push('');

  out.push('### Concepts', '');
  out.push(
    'Concept lists exist for the most frequent topics of each subject; a question gets up to three concepts of its own topic. ' +
      'Counts are questions per concept (a question can count for several).',
    '',
  );
  for (const t of TOPICS.filter((x) => x.concepts.length)) {
    const qs = core.filter((q) => q.topic === t.id);
    const counts = t.concepts.map((c) => `${c.name} ${qs.filter((q) => q.concepts?.includes(c.id)).length}`);
    out.push(`- **${t.name}** (${qs.filter((q) => q.concepts?.length).length} of ${qs.length} questions with a concept): ${counts.join('; ')}`);
  }
  out.push('');

  out.push('### Energy cross-subjects', '');
  const energy = core.filter((q) => q.subject === 'energy');
  out.push('The discipline an Energy question really tests, set only when the evidence is clear (as at the 2025 Finals: "energy (chemistry)").', '');
  out.push('| Cross-subject | Questions | Share of Energy |', '|---|---|---|');
  for (const s of [...CORE_SUBJECTS.filter((x) => x !== 'energy'), undefined] as (CoreSubject | undefined)[]) {
    const n = energy.filter((q) => q.crossSubject === s).length;
    out.push(`| ${s ? SUBJECT_LABELS[s] : 'not set'} | ${n} | ${pct(n, energy.length)} |`);
  }
  out.push('');

  out.push('### Evaluation', '');
  if (!labels?.length) {
    out.push('No labelled sample found (scripts/doe/topic-eval.json).', '');
    return out;
  }
  const byId = new Map(questions.map((q) => [q.id, q]));
  const groups: [string, TopicLabel[]][] = [
    ['Main sample', labels.filter((l) => !l.sample)],
    ...[...new Set(labels.filter((l) => l.sample).map((l) => l.sample!))].map((s) => [`Fresh sample "${s}"`, labels.filter((l) => l.sample === s)] as [string, TopicLabel[]]),
  ];
  out.push(
    'Hand-labelled stratified random samples (seeded, equal numbers per core subject), stored in `scripts/doe/topic-eval.json`. ' +
      'A question counts as correct when the tagger gives the labelled topic, or no topic when the label is "none"; an untagged question with a labelled topic counts as wrong. ' +
      'The fresh samples were drawn and labelled after the rules were written and are reported separately.',
    '',
    ...TOPIC_EVAL_NOTES,
    '',
  );
  out.push(`| Sample | Questions | Correct | Accuracy | ${CORE_SUBJECTS.map((s) => SUBJECT_LABELS[s]).join(' | ')} |`);
  out.push(`|---|---|---|---|${CORE_SUBJECTS.map(() => '---').join('|')}|`);
  const misses: string[] = [];
  for (const [name, group] of groups) {
    const present = group.filter((l) => byId.has(l.id));
    const ok = (l: TopicLabel) => (byId.get(l.id)!.topic ?? 'none') === l.topic;
    const perSubject = CORE_SUBJECTS.map((s) => {
      const g = present.filter((l) => byId.get(l.id)!.subject === s);
      return g.length ? `${g.filter(ok).length}/${g.length}` : '–';
    });
    const correct = present.filter(ok).length;
    out.push(`| ${name} | ${present.length} | ${correct} | ${pct(correct, present.length)} | ${perSubject.join(' | ')} |`);
    for (const l of present.filter((x) => !ok(x))) {
      const q = byId.get(l.id)!;
      misses.push(`- ${name.toLowerCase()} \`${l.id}\`: labelled ${l.topic === 'none' ? 'none' : `${topicName(l.topic)} (\`${l.topic}\`)`}, tagged ${q.topic ? `${topicName(q.topic)} (\`${q.topic}\`)` : 'none'} — ${esc(q.stem.slice(0, 110))}${q.stem.length > 110 ? '…' : ''}`);
    }
  }
  out.push('');
  const crossLabels = labels.filter((l) => l.crossSubject && byId.get(l.id)?.subject === 'energy');
  if (crossLabels.length) {
    const agree = crossLabels.filter((l) => (byId.get(l.id)!.crossSubject ?? 'none') === l.crossSubject).length;
    out.push(`Energy cross-subject agreement on the labelled Energy questions: ${agree} of ${crossLabels.length} (${pct(agree, crossLabels.length)}).`, '');
  }
  if (misses.length) out.push('Disagreements (worth a look when editing the rules):', '', ...misses, '');
  return out;
}

function buildReport(
  manifest: Manifest,
  results: Map<number, RoundResult[]>,
  resources: ManifestEntry[],
  fetchLog: { totals?: Record<string, number>; seconds?: number; crossCheck?: Record<string, unknown>; results?: { file: string; status: string; error?: string }[] } | undefined,
  topicEval: TopicLabel[] | undefined,
): string {
  const out: string[] = [];
  const all = [...results.values()].flat();
  const allQuestions = all.flatMap((r) => (r.round ? questionsOf(r.round) : []));
  const flagCounts = new Map<string, number>();
  for (const q of allQuestions) for (const f of q.flags ?? []) flagCounts.set(f, (flagCounts.get(f) ?? 0) + 1);

  out.push('# DOE high school sample questions: import report', '');
  out.push('## Reviewed corrections', '', 'Answer-key fixes from `src/core/importers/doeErrata.ts`, applied after parsing:', '');
  for (const e of DOE_ERRATA) {
    const q = allQuestions.find((x) => x.id === e.id);
    out.push(`- \`${e.id}\` → ${e.answerLetter}${q?.flags?.includes('erratum') ? '' : ' (NOT APPLIED: question missing)'}: ${esc(e.note)} (reviewed ${e.reviewed})`);
  }
  out.push('');
  out.push(
    'Generated by `npm run data:build` (scripts/doe/build.ts) from the PDFs listed in `scripts/doe/manifest.json` ' +
      `(source page: ${manifest.source}). Questions: U.S. Department of Energy, public domain; credit and link the DOE Office of Science.`,
    '',
  );
  out.push(
    `Totals: ${all.filter((r) => r.round).length} of ${all.length} round PDFs parsed, ` +
      `${allQuestions.filter((q) => q.kind === 'tossup').length} toss-ups, ${allQuestions.filter((q) => q.kind === 'bonus').length} bonuses, ` +
      `${allQuestions.filter(isComplete).length} questions with category, type and answer (${pct(allQuestions.filter(isComplete).length, allQuestions.length)}).`,
    '',
  );
  out.push(
    '"Expected" assumes the packet size of the year: 25 toss-ups/bonuses per round through 2013, 23 for 2014-2020 and 18 for the 2021-2022 virtual sets. ' +
      '"Complete" counts questions that have a mapped category, a printed type and an answer, as a share of the expected number.',
    '',
  );

  // Per-set summary.
  out.push('## Sets', '');
  out.push('| Set | Year | Rounds | Toss-ups (parsed/expected) | Bonuses (parsed/expected) | Complete | Flagged questions | Warnings |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const [n, rs] of results) {
    const year = manifest.sets.find((s) => s.set === n)?.year;
    const exp = expectedPairsForYear(year ? Number(year) : undefined);
    const ok = rs.filter((r) => r.round);
    const qs = ok.flatMap((r) => questionsOf(r.round!));
    const tu = qs.filter((q) => q.kind === 'tossup').length;
    const bo = qs.filter((q) => q.kind === 'bonus').length;
    const expected = exp ? exp * rs.length : undefined;
    const warnings = rs.reduce((a, r) => a + r.warnings.length, 0);
    out.push(
      `| ${doeSetId(n)} | ${year ?? '–'} | ${ok.length}/${rs.length} | ${tu}/${expected ?? '?'} | ${bo}/${expected ?? '?'} | ` +
        `${pct(qs.filter(isComplete).length, (expected ?? qs.length / 2) * 2)} | ${qs.filter((q) => q.flags?.length).length} | ${warnings} |`,
    );
  }
  out.push('');

  // Subjects.
  out.push('## Questions by subject', '');
  out.push(`| Set | ${SUBJECT_ORDER.join(' | ')} |`);
  out.push(`|---|${SUBJECT_ORDER.map(() => '---').join('|')}|`);
  for (const [n, rs] of results) {
    const qs = rs.filter((r) => r.round).flatMap((r) => questionsOf(r.round!));
    out.push(`| ${doeSetId(n)} | ${SUBJECT_ORDER.map((s) => qs.filter((q) => q.subject === s).length || '').join(' | ')} |`);
  }
  out.push('');
  const printed = new Map<string, number>();
  for (const q of allQuestions) printed.set(`${q.sourceCategory || '(none)'} → ${q.subject}`, (printed.get(`${q.sourceCategory || '(none)'} → ${q.subject}`) ?? 0) + 1);
  out.push('Printed categories and where they were mapped:', '');
  for (const [k, v] of [...printed.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) out.push(`- ${k}: ${v}`);
  out.push('');

  out.push(...topicsReport(allQuestions, topicEval));

  // Flags.
  out.push('## Flags', '');
  out.push('| Flag | Questions | Meaning |', '|---|---|---|');
  const meaning: Record<string, string> = {
    'possible-lost-formatting': 'an equation, special symbol or inline image may not have survived text extraction; check the PDF',
    'image-not-extracted': 'the PDF draws an image (often an equation) inside the question',
    'mc-answer-mismatch': 'the answer text differs from the option it names',
    'choices-missing': 'multiple choice without all four options',
    'answer-missing': 'no ANSWER line',
    'category-unknown': 'category missing or not recognised (subject set to general_science)',
    'type-unknown': 'Short Answer / Multiple Choice not printed (format guessed)',
    'type-mismatch': 'printed type contradicts the layout (format follows the layout)',
    'kind-inferred': 'TOSS-UP/BONUS marker missing',
    'choice-letters-fixed': 'option letters misprinted in the PDF (read as W, X, Y, Z in order)',
    'choices-reordered': "options printed out of letter order; listed W, X, Y, Z with DOE's letters so the answer key still matches",
    erratum: 'a reviewed correction from src/core/importers/doeErrata.ts was applied (see the note on the question)',
    'answer-letter-corrected': 'printed answer letter named a different option than the printed answer text; letter follows the text',
    'number-mismatch': 'printed question number out of sequence',
  };
  for (const [f, c] of [...flagCounts.entries()].sort((a, b) => b[1] - a[1])) out.push(`| ${f} | ${c} | ${meaning[f] ?? ''} |`);
  out.push('');

  // Downloads.
  out.push('## Downloads and failures', '');
  if (fetchLog) {
    const pageStatus = (fetchLog as { pageStatus?: string }).pageStatus;
    out.push(`Last fetch: ${JSON.stringify(fetchLog.totals ?? {})} in ${fetchLog.seconds ?? '?'}s; official page: ${pageStatus ?? 'unknown'}${pageStatus && !/200|read from/.test(pageStatus) ? ' (the manifest from the previous successful run was kept)' : ''}.`);
    const runs = (fetchLog as { history?: { startedAt: string; seconds: number; totals: Record<string, number> }[] }).history ?? [];
    if (runs.length > 1) {
      out.push('', 'Fetch runs (most recent last):');
      for (const r of runs) out.push(`- ${r.startedAt.slice(0, 10)}: ${r.seconds}s, downloaded ${r.totals.downloaded ?? 0}, seeded ${r.totals.seeded ?? 0}, cached ${r.totals.cached ?? 0}, failed ${r.totals.failed ?? 0}`);
      out.push('');
    }
    const cc = fetchLog.crossCheck as { listed?: number; manifest?: number; missingFromManifest?: string[]; notInList?: string[]; labelDiffs?: string[] } | undefined;
    if (cc) {
      out.push(
        `Manifest cross-check against the earlier link list: ${cc.listed} listed, ${cc.manifest} in manifest, ` +
          `${cc.missingFromManifest?.length ?? 0} missing, ${cc.notInList?.length ?? 0} extra, ${cc.labelDiffs?.length ?? 0} label differences.`,
      );
    }
    const failed = (fetchLog.results ?? []).filter((r) => r.status === 'failed' || r.status === 'skipped');
    out.push('', failed.length ? 'Download failures:' : 'No download failures.');
    for (const f of failed) out.push(`- ${f.file}: ${f.status} (${f.error ?? ''})`);
  } else out.push('No fetch log found.');
  const parseFailures = all.filter((r) => r.error);
  out.push('', parseFailures.length ? 'Rounds not built:' : 'Every round PDF in the manifest was parsed.');
  for (const r of parseFailures) out.push(`- ${doeSetId(r.entry.set)} ${r.entry.label} (${r.entry.file}): ${r.error}`);
  out.push('', `Resources listed on the page but not parsed as rounds: ${resources.map((r) => `${r.label} (${r.file})`).join(', ') || 'none'}.`, '');

  out.push(...NOTES, '');

  // Spot checks.
  if (SPOT_CHECKS.length) {
    out.push('## Spot checks', '');
    out.push('Questions compared by hand with `pdftotext` output of the PDF. Current parse shown for each.', '');
    const byId = new Map(allQuestions.map((q) => [q.id, q]));
    for (const c of SPOT_CHECKS) {
      const q = byId.get(c.id);
      out.push(`- **${c.id}**: ${c.note}`);
      if (q) {
        out.push(`  - ${q.sourceCategory} / ${q.format}: ${esc(q.stem.slice(0, 160))}${q.stem.length > 160 ? '…' : ''}`);
        if (q.choices) out.push(`  - choices: ${(['W', 'X', 'Y', 'Z'] as const).map((l) => `${l}) ${esc(q.choices![l])}`).join(' · ')}`);
        out.push(`  - answer: ${esc(q.answer)}${q.answerLetter ? ` [${q.answerLetter}]` : ''}${q.accept.length ? `; accept: ${esc(q.accept.join(' | '))}` : ''}${q.reject.length ? `; reject: ${esc(q.reject.join(' | '))}` : ''}${q.flags?.length ? `; flags: ${q.flags.join(', ')}` : ''}`);
      } else out.push('  - (question not found in this build)');
    }
    out.push('');
  }

  // Per round.
  out.push('## Rounds', '');
  for (const [n, rs] of results) {
    const year = manifest.sets.find((s) => s.set === n)?.year;
    const exp = expectedPairsForYear(year ? Number(year) : undefined);
    out.push(`### ${doeSetId(n)}${year ? ` (${year})` : ''}`, '');
    out.push('| Round | Printed header | File | Pages | Toss-ups | Bonuses | Flagged | Note |');
    out.push('|---|---|---|---|---|---|---|---|');
    for (const r of rs) {
      const qs = r.round ? questionsOf(r.round) : [];
      const tu = qs.filter((q) => q.kind === 'tossup').length;
      const bo = qs.filter((q) => q.kind === 'bonus').length;
      const notes: string[] = [];
      if (r.error) notes.push(r.error);
      else if (exp && (tu !== exp || bo !== exp)) notes.push(`**expected ${exp}**`);
      if (r.stray) notes.push(`${r.stray} stray line(s)`);
      out.push(
        `| ${r.entry.label} | ${esc(r.printedLabel ?? '')} | ${r.entry.file.replace(/^HS-Sample-Questions_/, '')} | ${r.pages ?? ''} | ${tu}/${exp ?? '?'} | ${bo}/${exp ?? '?'} | ${qs.filter((q) => q.flags?.length).length} | ${notes.join('; ')} |`,
      );
    }
    out.push('');
  }

  // Warnings.
  out.push('## Warnings', '');
  out.push('Every warning raised while parsing, by round. Question flags are listed with the question id and the PDF page.', '');
  for (const [n, rs] of results) {
    for (const r of rs) {
      if (!r.warnings.length) continue;
      out.push(`**${doeSetId(n)} ${r.entry.label}** (${r.entry.file.replace(/^HS-Sample-Questions_/, '')})`, '');
      for (const w of r.warnings) out.push(`- ${w.questionId ?? ''}${w.page ? ` (p. ${w.page})` : ''} \`${w.code}\`: ${esc(w.message)}`);
      out.push('');
    }
  }
  return out.join('\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
