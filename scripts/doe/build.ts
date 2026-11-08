/**
 * Builds public/data/doe/ from the cached DOE PDFs of one level.
 *
 *   --level hs (default; npm run data:build)
 *     doe-hs-01.json ... doe-hs-17.json   one QuestionSet per high school sample set (compact JSON)
 *     catalog.json                        Catalog: one compact row per question, plus questions per topic
 *     concepts.json                       ConceptIndex: the questions tagged with each concept (for the Learn pages)
 *     report scripts/doe/REPORT.md
 *   --level ms (npm run data:build:ms)
 *     doe-ms-01.json ... doe-ms-16.json   the middle school sample sets
 *     doe-ms-finals.json                  DOE's middle school "Sample Rounds" (round robin and double elimination rounds)
 *     catalog-ms.json, concepts-ms.json   the same formats as catalog.json and concepts.json
 *     report scripts/doe/REPORT-MS.md
 *   index.json                            LibraryIndex of SetSummary entries of both levels (high school first):
 *                                         a build replaces its own level's entries and keeps the other level's
 *
 * Every question is tagged with a topic, concepts and (Energy only) a cross-subject by the rule-based
 * tagger in src/core/tagging.ts; the high school report's Topics section scores it against the
 * hand-labelled sample in scripts/doe/topic-eval.json. Middle school "Physical Science" questions are
 * first moved to physics or chemistry when the evidence is clear (src/core/importers/doeSubjects.ts).
 *
 * Timestamps: the catalog and concept files carry `generatedAt`; index.json carries the high school
 * build's, which src/core/tagging.test.ts compares with catalog.json, so a middle school build leaves it
 * as it is. A build keeps the previous timestamp when its files would otherwise come out unchanged, so
 * re-running it on the same PDFs rewrites the same bytes.
 *
 *   npx tsx scripts/doe/build.ts [options]
 *
 * Options (plain path arguments):
 *   --level <hs|ms>     default hs
 *   --manifest <file>   default scripts/doe/manifest.json (manifest-ms.json for ms)
 *   --pdf <dir>         default .cache/doe/pdf
 *   --out <dir>         default public/data/doe
 *   --report <file>     default scripts/doe/REPORT.md (REPORT-MS.md for ms)
 *   --fetch-log <file>  default .cache/doe/fetch-log.json (fetch-log-ms.json for ms; only read, for the report)
 *   --topic-eval <file> default scripts/doe/topic-eval.json (high school; only read, for the report)
 *   --split-eval <file> default scripts/doe/split-eval-ms.json (middle school Physical Science labels; only read)
 *   --set <n|name>      build only this set (repeatable); the index and catalog then list only those sets
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
  type ConceptIndex,
  type CoreSubject,
  type Level,
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
  DOE_MS_SAMPLE_PAGE,
  doeRoundId,
  doeSetId,
  expectedPairsForYear,
  parseDoeRound,
  type ParseWarning,
} from '../../src/core/importers/doe';
import { extractTextLines } from '../../src/core/importers/pdfText';
import { applyDoeErrata, DOE_ERRATA } from '../../src/core/importers/doeErrata';
import { isPrintedPhysicalScience, physicalScienceEvidence, splitPhysicalScience } from '../../src/core/importers/doeSubjects';

/** A sample set number, or the key of an unnumbered section of rounds on the page ("sample-rounds"). */
type SetKey = number | string;

interface ManifestEntry {
  set: SetKey;
  order: number;
  label: string;
  kind: 'round' | 'resource';
  url: string;
  file: string;
  year?: string;
  /** The link printed on the page, when the manifest uses another file (see `note`). */
  pageUrl?: string;
  note?: string;
}
interface ManifestSet {
  set: SetKey;
  heading?: string;
  year?: string;
  yearEvidence?: string;
}
interface Manifest {
  source: string;
  level?: Level;
  sets: ManifestSet[];
  entries: ManifestEntry[];
}

interface LevelConfig {
  level: Level;
  manifest: string;
  report: string;
  fetchLog: string;
  /** Catalog and concept index file names in the output folder. */
  catalog: string;
  concepts: string;
  samplePage: string;
  /** Prefix of the cached PDF names, left out in the report's tables. */
  filePrefix: RegExp;
}

const LEVELS: Record<Level, LevelConfig> = {
  HS: {
    level: 'HS',
    manifest: 'scripts/doe/manifest.json',
    report: 'scripts/doe/REPORT.md',
    fetchLog: '.cache/doe/fetch-log.json',
    catalog: 'catalog.json',
    concepts: 'concepts.json',
    samplePage: DOE_HS_SAMPLE_PAGE,
    filePrefix: /^HS-Sample-Questions_/,
  },
  MS: {
    level: 'MS',
    manifest: 'scripts/doe/manifest-ms.json',
    report: 'scripts/doe/REPORT-MS.md',
    fetchLog: '.cache/doe/fetch-log-ms.json',
    catalog: 'catalog-ms.json',
    concepts: 'concepts-ms.json',
    samplePage: DOE_MS_SAMPLE_PAGE,
    filePrefix: /^MS-Sample-Questions_/,
  },
};

/** Order of the levels in index.json. */
const LEVEL_ORDER: Level[] = ['HS', 'MS'];

/** Unnumbered sections of rounds on a sample-question page (manifest key → Rebound set). */
const NAMED_SETS: Record<string, { id: string; title: string; expectedPairs: number }> = {
  // The middle school page's "Sample Rounds": tournament rounds (no year or event printed; see REPORT-MS.md).
  'sample-rounds': { id: 'doe-ms-finals', title: 'DOE Middle School Sample Rounds (round robin and double elimination)', expectedPairs: 25 },
};

/** Rebound id, title and set number of a manifest set. */
function setIdentity(cfg: LevelConfig, key: SetKey): { id: string; title: string; setNumber?: number } {
  if (typeof key === 'number') {
    return { id: doeSetId(key, cfg.level), title: `DOE ${cfg.level === 'HS' ? 'High School' : 'Middle School'} Sample Set ${key}`, setNumber: key };
  }
  const named = NAMED_SETS[key];
  if (!named) throw new Error(`manifest set "${key}" has no entry in NAMED_SETS (scripts/doe/build.ts)`);
  return { id: named.id, title: named.title };
}

/** Toss-ups (and bonuses) a round of the set should have. */
function expectedPairs(cfg: LevelConfig, key: SetKey, year: string | undefined): number | undefined {
  if (typeof key === 'string') return NAMED_SETS[key]?.expectedPairs;
  return expectedPairsForYear(year ? Number(year) : undefined, cfg.level);
}

/** Numbered sets in order, then named ones in manifest order. */
function orderedKeys(manifest: Manifest): SetKey[] {
  const keys = [...new Set(manifest.entries.map((e) => e.set))];
  const numbers = keys.filter((k): k is number => typeof k === 'number').sort((a, b) => a - b);
  return [...numbers, ...keys.filter((k) => typeof k === 'string')];
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

/** Middle school notes (written by hand, like NOTES). */
const MS_NOTES = [
  '## Notes',
  '',
  "- **What the sets are.** DOE's page lists Sample Questions Sets 1-16 (\"used at the regional competitions in previous years\") and a section \"Sample Rounds\". Most sets print regional headers or footers (see \"Where the sets come from\"). Set 2's footers name the \"Junior National Science Bowl\" (round robin and single elimination rounds), and its PDFs were made in February 2004 although the page says \"from 2008\"; the year is kept as DOE gives it.",
  '- **Sample Rounds (`doe-ms-finals`).** Four tournament rounds, titled as on the page: Round Robin Rounds 2 and 5 and Double Elimination Rounds 1 and 3 (printed "ROUND ROBIN 2", "DOUBLE ELIMINATION ROUND 1", ...), 25 toss-ups and bonuses each, in the 2000s middle school categories (General Science, Earth Science, Mathematics, Life Science, Physical Science). No year or event is printed; the PDFs were made in October 2006. The National Middle School Science Bowl website listed them in 2008 as new round robin and double elimination samples next to "Sample Rounds 1-10" (seen in a search-engine summary of the archived page, which could not be opened from here), so they are most likely rounds of the national middle school event from about 2006. The set has no year and no set number, and its rounds have order 1-4 in page order.',
  '- **Years.** Sets 1-13 take the year from the page\'s table of contents ("Sample Questions Set 1 (from 2009)", "Sample Questions 10 (from 2016)"), which matches the file names where they carry one (Sets 10 and 13); Sets 14-16 take it from the file names (2020-MS-Rd1.pdf, Set-1-MS-2021.pdf, 2022-MS-1.pdf).',
  '- **Packet sizes.** 25 toss-ups and bonuses per round through 2013 and in the Sample Rounds, 23 for 2014-2020, 15 in the 2021 virtual set (Set 15) and 18 in 2022 (Set 16). Set 3 Round 7 has 24: DOE printed "The toss-up and bonus for Question 8 have been omitted."',
  '- **Subjects.** Life Science → biology, Earth Science and Earth and Space → earth_space, Mathematics → math. Physical Science is split between physics and chemistry where the evidence is clear (see "Physical Science split"). General Science (1,384 questions in Sets 1-10 and the Sample Rounds) stays the legacy subject `general_science`, as in the high school sets: it mixes every subject with units, lab practice and the history of science, so those questions get no topic.',
  '- **Source problems handled** (each is flagged on the question or listed under Warnings): the page links Set 15 Round 7 to the high school file, so the middle school file next to the other Set 15 rounds is used (see the manifest note); numbers printed with an asterisk ("*1)", Set 2; the asterisk is not explained); headers without the parenthesis ("17 LIFE SCIENCE Short Answer", "46 MATH", Sets 2 and 4); "Mutliple Choice"; "ANWER:"; a category printed twice ("MATH Math"); options printed in lower case ("w) light"); a bonus printed under a second TOSS-UP marker (Set 10 Round 14, flag `kind-corrected`); questions 21 and 20 printed in that order (Set 11 Round 14, numbered by position, flag `number-mismatch`); other misprinted numbers (Set 2, `number-mismatch`); a toss-up with neither category nor type (Sample Rounds, Round Robin 5 #16: `category-unknown`, `type-unknown`); an answer printed without its letter (Set 11 Round 1 bonus 13; the letter of the one option it names is used); mixed numbers printed as a whole number and a stacked fraction (3 ½), now read as "3 1/2".',
  '- **Duplicates, kept as DOE publishes them.** Set 16 Round 7 has the same 36 questions as high school Set 17 Round 10 (the two PDFs, made from "2022 MS 7.docx" and "2022 HS 10.docx" on the same day, differ only in one ACCEPT list and the moderator\'s closing lines); a team using both libraries will meet them twice. Set 2 Round 2 repeats toss-ups and bonuses 7-19 of Set 2 Round 1. Apart from those, 57 question texts appear in more than one middle school round and 24 also appear in the high school library.',
  '- **Known gaps.** As in the high school sets, equations drawn with lines or images (radicals, some fractions) and answers that are images (Set 4 Round 11 toss-up 4, Round 17 bonuses 16 and 20; Set 4 Round 4 toss-up 21 lost two of its options) cannot be recovered from text; Sets 6-8 have 15 questions in an equation font whose characters map to unrelated scripts. Such questions carry `possible-lost-formatting` (and `image-not-extracted`, `answer-missing` or `choices-missing` where it applies).',
  "- **Fetch.** DOE's page answered HTTP 403 to the fetch script (as it did on the last high school run), so the manifest was built from the copy of the page saved on 2026-11-06 by earlier research (`--page-html`) and cross-checked against the link list saved then (251 of 251 links). Of the 251 PDFs, 39 were copied from the research folder and 212 downloaded one at a time, at least 3 s apart, with the importer's User-Agent.",
];

/** Middle school questions compared by hand against `pdftotext` output of the PDF (like SPOT_CHECKS). */
const MS_SPOT_CHECKS: { id: string; note: string }[] = [
  // Random sample (mulberry32, seed 20261111) across all sets: stem, options, answer and alternatives match the PDF.
  { id: 'doe-ms-09-r10-t04', note: 'match' },
  { id: 'doe-ms-14-r15-t15', note: 'match (Physical Science → physics)' },
  { id: 'doe-ms-11-r02-t19', note: 'match; ACCEPT parsed' },
  { id: 'doe-ms-11-r02-t21', note: 'match' },
  { id: 'doe-ms-01-r13-t18', note: 'match; stacked fractions read as (15x + 5y)/15 and y/3' },
  { id: 'doe-ms-06-r11-b07', note: 'match; bracket pronunciation kept' },
  { id: 'doe-ms-04-r08-t20', note: 'match (Physical Science → chemistry)' },
  { id: 'doe-ms-09-r08-b02', note: 'match' },
  { id: 'doe-ms-11-r06-b17', note: 'match' },
  { id: 'doe-ms-13-r17-t20', note: 'match' },
  { id: 'doe-ms-13-r15-b23', note: 'match' },
  { id: 'doe-ms-06-r15-t21', note: 'match' },
  { id: 'doe-ms-04-r09-t02', note: 'match' },
  { id: 'doe-ms-06-r16-t12', note: 'match; tanθ = 3/4 and the answer 5/3 are stacked fractions in the PDF' },
  { id: 'doe-ms-02-r01-b15', note: 'match' },
  { id: 'doe-ms-04-r15-b08', note: 'match; "(read as: ...)" pronunciations in the options become [...]' },
  { id: 'doe-ms-11-r09-b04', note: 'match; x² from the raised 2' },
  { id: 'doe-ms-16-r04-t05', note: 'match (2022 em dash format)' },
  { id: 'doe-ms-12-r15-t05', note: 'match; ACCEPT NH₃ and DO NOT ACCEPT in one parenthesis' },
  { id: 'doe-ms-14-r17-t19', note: 'match' },
  { id: 'doe-ms-07-r15-t07', note: 'match (General Science kept as a legacy subject)' },
  { id: 'doe-ms-05-r09-t08', note: 'match' },
  { id: 'doe-ms-11-r05-b09', note: 'match' },
  { id: 'doe-ms-12-r08-b20', note: 'match' },
  { id: 'doe-ms-15-r01-t15', note: 'match (2021 narrow layout)' },
  { id: 'doe-ms-12-r11-t22', note: 'match' },
  { id: 'doe-ms-08-r11-t03', note: 'match' },
  { id: 'doe-ms-06-r13-t13', note: 'match' },
  { id: 'doe-ms-12-r12-t13', note: 'match' },
  { id: 'doe-ms-01-r06-t13', note: 'match' },
  { id: 'doe-ms-08-r03-t08', note: 'match' },
  { id: 'doe-ms-16-r06-b09', note: 'match' },
  // Hard cases checked on purpose.
  { id: 'doe-ms-02-r10-t01', note: 'number printed "*1)"; asterisk dropped' },
  { id: 'doe-ms-02-r06-b04', note: 'header printed "46 MATH Multiple Choice" (no parenthesis, wrong number): read as bonus 4, number-mismatch' },
  { id: 'doe-ms-04-r06-b17', note: 'header printed "17 LIFE SCIENCE Short Answer" (no parenthesis)' },
  { id: 'doe-ms-02-r06-b03', note: 'options printed "w) x) y) z)"' },
  { id: 'doe-ms-02-r10-b09', note: 'first option printed "w) plasma cells"' },
  { id: 'doe-ms-10-r14-b16', note: 'bonus printed under a TOSS-UP marker: kind-corrected; the round keeps 23 pairs and its numbering' },
  { id: 'doe-ms-11-r14-t20', note: 'printed "21)" before "20)": numbered by position, number-mismatch' },
  { id: 'doe-ms-09-r09-t10', note: 'answer line printed "ANWER: X) OAK TREE"' },
  { id: 'doe-ms-02-r10-t16', note: 'mixed numbers printed as whole number + stacked fraction: 3 1/2 + 2 1/3 + 1 1/12, answer 6 11/12' },
  { id: 'doe-ms-finals-r02-t16', note: 'toss-up printed with neither category nor type: category-unknown, type-unknown' },
  { id: 'doe-ms-11-r01-b13', note: 'answer printed "IT INCREASES" without a letter: W, the one option it names' },
  { id: 'doe-ms-07-r07-b17', note: 'type printed "Mutliple Choice"' },
  { id: 'doe-ms-08-r17-t18', note: 'category printed "MATH Math"' },
  { id: 'doe-ms-08-r17-t17', note: 'erratum: DOE printed "Y) 2.5"; 2.5 is X' },
  { id: 'doe-ms-15-r07-t01', note: 'from the middle school file Set-7-MS-2021.pdf, not the high school file the page links to' },
  { id: 'doe-ms-03-r07-t09', note: 'Round 7 skips question 8 as printed ("omitted"); toss-up 9 keeps its number' },
];

/** How the Physical Science split was checked (written by hand). */
const SPLIT_EVAL_NOTES = [
  'Checked against hand labels in `scripts/doe/split-eval-ms.json`: random printed Physical Science questions (mulberry32 with a partial Fisher-Yates shuffle), each labelled physics, chemistry or "either" (gas laws, heat and phase changes, temperature scales, nuclear fission, measurement) by reading the question without seeing the result.',
  '',
  '- **Sample A** (80 questions, seed 20261108) and **sample B** (60, seed 20261109) were used to choose the rule: the topic scores alone put wave questions under chemistry (2 errors on A), topic plus the full cross-subject score put Gibbs energy, chirality and "physical change" under physics (4 errors on B); topic plus half the cross-subject score did best on both.',
  '- **Sample C** (50 questions, seed 20261110) was drawn and labelled after the rule was fixed and scored once: it is the fair estimate.',
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
  /** Lines printed on most pages (running headers and footers), digits as "#". */
  repeated?: string[];
  /** The PDF's own creation date (YYYY-MM-DD), when it has one (middle school report). */
  pdfInfo?: { created?: string };
  /** Physical Science questions moved to physics or chemistry, or kept (middle school). */
  split?: { physics: number; chemistry: number; kept: number };
}

function parseArgs(root: string) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--level');
  const levelArg = at >= 0 ? argv[at + 1] : 'hs';
  const level = (levelArg ?? '').toUpperCase();
  if (level !== 'HS' && level !== 'MS') throw new Error(`unknown level ${levelArg ?? '(missing)'} (use hs or ms)`);
  const cfg = LEVELS[level];
  const opts = {
    cfg,
    manifest: path.join(root, cfg.manifest),
    pdf: path.join(root, '.cache/doe/pdf'),
    out: path.join(root, 'public/data/doe'),
    report: path.join(root, cfg.report),
    fetchLog: path.join(root, cfg.fetchLog),
    topicEval: path.join(root, 'scripts/doe/topic-eval.json'),
    splitEval: path.join(root, 'scripts/doe/split-eval-ms.json'),
    sets: [] as string[],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[++i];
    if (v === undefined) throw new Error(`missing value for ${a}`);
    if (a === '--level') continue;
    else if (a === '--manifest') opts.manifest = path.resolve(v);
    else if (a === '--pdf') opts.pdf = path.resolve(v);
    else if (a === '--out') opts.out = path.resolve(v);
    else if (a === '--report') opts.report = path.resolve(v);
    else if (a === '--fetch-log') opts.fetchLog = path.resolve(v);
    else if (a === '--topic-eval') opts.topicEval = path.resolve(v);
    else if (a === '--split-eval') opts.splitEval = path.resolve(v);
    else if (a === '--set') opts.sets.push(v);
    else throw new Error(`unknown option ${a}`);
  }
  return opts;
}

/** "D:20061004124807-04'00'" → "2006-10-04". */
const pdfDate = (d: unknown) => (typeof d === 'string' ? /^D:(\d{4})(\d{2})(\d{2})/.exec(d)?.slice(1).join('-') : undefined);

async function parseRound(cfg: LevelConfig, setId: string, entry: ManifestEntry, file: string): Promise<RoundResult> {
  const meta = { setId, roundId: doeRoundId(setId, entry.order), label: entry.label, order: entry.order, sourceUrl: entry.url, credit: DOE_CREDIT };
  const data = new Uint8Array(await readFile(file));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  try {
    const lines = await extractTextLines(doc, { ops: pdfjs.OPS as unknown as Record<string, number> });
    const result = parseDoeRound(lines, meta);
    applyDoeErrata(result.round);
    const split = cfg.level === 'MS' ? splitPhysicalScience(result.round) : undefined;
    tagRound(result.round);
    let pdfInfo: RoundResult['pdfInfo'];
    if (cfg.level === 'MS') pdfInfo = { created: pdfDate(((await doc.getMetadata()).info as Record<string, unknown>).CreationDate) };
    return {
      entry,
      round: result.round,
      printedLabel: result.printedLabel,
      warnings: result.warnings,
      pages: doc.numPages,
      stray: result.strayLines.length,
      repeated: result.repeated,
      ...(pdfInfo ? { pdfInfo } : {}),
      ...(split ? { split } : {}),
    };
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
  const { cfg } = opts;
  const t0 = Date.now();
  const manifest = JSON.parse(await readFile(opts.manifest, 'utf8')) as Manifest;
  if (manifest.level && manifest.level !== cfg.level) throw new Error(`${opts.manifest} is a ${manifest.level} manifest; use --level ${manifest.level.toLowerCase()}`);
  const fetchLog = existsSync(opts.fetchLog) ? JSON.parse(await readFile(opts.fetchLog, 'utf8')) : undefined;
  const setKeys = orderedKeys(manifest).filter((k) => !opts.sets.length || opts.sets.includes(String(k)) || opts.sets.includes(setIdentity(cfg, k).id));

  await mkdir(opts.out, { recursive: true });
  const summaries: SetSummary[] = [];
  const results = new Map<SetKey, RoundResult[]>();
  const resources: ManifestEntry[] = [];
  const catalogRows: CatalogRow[] = [];
  const conceptQuestions: Record<string, string[]> = {};

  for (const n of setKeys) {
    const setInfo = manifest.sets.find((s) => s.set === n);
    const { id, title, setNumber } = setIdentity(cfg, n);
    const entries = manifest.entries.filter((e) => e.set === n).sort((a, b) => a.order - b.order);
    resources.push(...entries.filter((e) => e.kind === 'resource'));
    const roundResults: RoundResult[] = [];
    for (const entry of entries.filter((e) => e.kind === 'round')) {
      const file = path.join(opts.pdf, entry.file);
      if (!existsSync(file)) {
        roundResults.push({ entry, warnings: [], error: `PDF not in cache (run npm run data:fetch${cfg.level === 'HS' ? '' : ':ms'})`, stray: 0 });
        continue;
      }
      try {
        roundResults.push(await parseRound(cfg, id, entry, file));
      } catch (err) {
        roundResults.push({ entry, warnings: [], error: `parse failed: ${err instanceof Error ? err.message : String(err)}`, stray: 0 });
      }
    }
    results.set(n, roundResults);

    const rounds = roundResults.filter((r) => r.round).map((r) => r.round!);
    const set: QuestionSet = {
      id,
      provider: 'doe',
      level: cfg.level,
      title,
      ...(setInfo?.year ? { year: setInfo.year } : {}),
      ...(setNumber ? { setNumber } : {}),
      sourcePage: cfg.samplePage,
      credit: DOE_CREDIT,
      license: DOE_LICENSE,
      rounds,
    };
    const fileName = `${id}.json`;
    await writeFile(path.join(opts.out, fileName), JSON.stringify(set));
    for (const r of rounds) {
      for (const q of questionsOf(r)) {
        catalogRows.push([q.id, q.subject, q.topic ?? '', q.kind === 'tossup' ? 't' : 'b', r.order, q.crossSubject ?? '']);
        for (const c of q.concepts ?? []) (conceptQuestions[c] ??= []).push(q.id);
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
      level: cfg.level,
      title: set.title,
      ...(set.year ? { year: set.year } : {}),
      ...(setNumber ? { setNumber } : {}),
      file: fileName,
      sourcePage: cfg.samplePage,
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

  // index.json: this level's sets replace the previous ones; the other level's are kept as they are.
  const indexFile = path.join(opts.out, 'index.json');
  const previousIndex = existsSync(indexFile) ? (JSON.parse(await readFile(indexFile, 'utf8')) as LibraryIndex) : undefined;
  const others = (previousIndex?.sets ?? []).filter((s) => s.level !== cfg.level);
  const indexSets = [
    ...LEVEL_ORDER.flatMap((l) => (l === cfg.level ? summaries : others.filter((s) => s.level === l))),
    ...others.filter((s) => !LEVEL_ORDER.includes(s.level)),
  ];
  const renderIndex = (generatedAt: string) => JSON.stringify({ generatedAt, sets: indexSets } satisfies LibraryIndex, null, 1) + '\n';

  // Every topic id in taxonomy order (0 when no question has it), so the file is complete and stable.
  const topicCounts: Record<string, number> = Object.fromEntries(TOPICS.map((t) => [t.id, 0]));
  for (const row of catalogRows) if (row[2]) topicCounts[row[2]] = (topicCounts[row[2]] ?? 0) + 1;
  const renderCatalog = (generatedAt: string) => JSON.stringify({ generatedAt, questions: catalogRows, topicCounts } satisfies Catalog) + '\n';
  const renderConcepts = (generatedAt: string) => JSON.stringify({ generatedAt, concepts: conceptQuestions } satisfies ConceptIndex) + '\n';
  const catalogFile = path.join(opts.out, cfg.catalog);
  const conceptsFile = path.join(opts.out, cfg.concepts);
  const timestamped = [
    { file: catalogFile, render: renderCatalog },
    { file: conceptsFile, render: renderConcepts },
    // index.json carries the high school timestamp (see the header).
    ...(cfg.level === 'HS' ? [{ file: indexFile, render: renderIndex }] : []),
  ];
  const generatedAt = await stableTimestamp(timestamped);
  const indexAt = cfg.level === 'HS' ? generatedAt : (previousIndex?.generatedAt ?? generatedAt);
  await writeFile(indexFile, renderIndex(indexAt));
  await writeFile(catalogFile, renderCatalog(generatedAt));
  await writeFile(conceptsFile, renderConcepts(generatedAt));

  const topicEval = cfg.level === 'HS' && existsSync(opts.topicEval) ? (JSON.parse(await readFile(opts.topicEval, 'utf8')) as TopicLabel[]) : undefined;
  const splitEval = cfg.level === 'MS' && existsSync(opts.splitEval) ? (JSON.parse(await readFile(opts.splitEval, 'utf8')) as SplitLabel[]) : undefined;
  const report = buildReport(cfg, manifest, results, resources, fetchLog, topicEval, splitEval);
  await writeFile(opts.report, report);
  console.log(
    `wrote ${summaries.length} set files + index.json + ${cfg.catalog} (${catalogRows.length} questions) + ${cfg.concepts} to ${path.relative(root, opts.out)}; ` +
      `report ${path.relative(root, opts.report)} (${Math.round((Date.now() - t0) / 1000)}s)`,
  );
}

/**
 * The previous build's timestamp when every timestamped file would come out exactly as it is now (so an
 * unchanged rebuild rewrites the same bytes); otherwise the current time.
 */
async function stableTimestamp(outputs: { file: string; render: (generatedAt: string) => string }[]): Promise<string> {
  const now = new Date().toISOString();
  let previous: string | undefined;
  for (const o of outputs) {
    if (!existsSync(o.file)) return now;
    const old = await readFile(o.file, 'utf8');
    let at: unknown;
    try {
      at = (JSON.parse(old) as { generatedAt?: unknown }).generatedAt;
    } catch {
      return now;
    }
    if (typeof at !== 'string' || (previous !== undefined && at !== previous) || o.render(at) !== old) return now;
    previous = at;
  }
  return previous ?? now;
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
function topicsReport(cfg: LevelConfig, questions: Question[], labels: TopicLabel[] | undefined): string[] {
  const out: string[] = [];
  const core = questions.filter((q) => (CORE_SUBJECTS as Subject[]).includes(q.subject));
  const tagged = core.filter((q) => q.topic);
  const legacy = (['general_science', 'computer_science', 'physical_science'] as Subject[])
    .map((s) => [s, questions.filter((q) => q.subject === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${SUBJECT_LABELS[s].replace(/ \(legacy\)$/, '')}`);
  out.push('## Topics', '');
  out.push(
    'Topics, concepts and Energy cross-subjects come from the rule-based tagger in `src/core/tagging.ts` (weighted keyword rules per topic; ' +
      'no network, no AI) and the subject map in `src/core/taxonomy.ts`. A question gets no topic rather than a guess when no rule scores high enough; ' +
      `legacy subjects (${legacy.join(' and ') || 'none'} questions) get none. Questions per topic are also in \`public/data/doe/${cfg.catalog}\`.`,
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
  if (cfg.level !== 'HS') {
    out.push(
      'The hand-labelled samples in `scripts/doe/topic-eval.json` are high school questions (see REPORT.md); the same rules tag the middle school questions, ' +
        'and no separate middle school topic sample has been labelled yet.',
      '',
    );
    return out;
  }
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
  cfg: LevelConfig,
  manifest: Manifest,
  results: Map<SetKey, RoundResult[]>,
  resources: ManifestEntry[],
  fetchLog: { totals?: Record<string, number>; seconds?: number; crossCheck?: Record<string, unknown>; results?: { file: string; status: string; error?: string }[] } | undefined,
  topicEval: TopicLabel[] | undefined,
  splitEval?: SplitLabel[],
): string {
  const out: string[] = [];
  const hs = cfg.level === 'HS';
  const all = [...results.values()].flat();
  const allQuestions = all.flatMap((r) => (r.round ? questionsOf(r.round) : []));
  const flagCounts = new Map<string, number>();
  for (const q of allQuestions) for (const f of q.flags ?? []) flagCounts.set(f, (flagCounts.get(f) ?? 0) + 1);
  const setId = (n: SetKey) => setIdentity(cfg, n).id;
  const shortFile = (f: string) => f.replace(cfg.filePrefix, '');

  out.push(`# DOE ${hs ? 'high' : 'middle'} school sample questions: import report`, '');
  out.push('## Reviewed corrections', '', 'Answer-key fixes from `src/core/importers/doeErrata.ts`, applied after parsing:', '');
  const errata = DOE_ERRATA.filter((e) => e.id.startsWith(`doe-${cfg.level.toLowerCase()}-`));
  for (const e of errata) {
    const q = allQuestions.find((x) => x.id === e.id);
    out.push(`- \`${e.id}\` → ${e.answerLetter}${q?.flags?.includes('erratum') ? '' : ' (NOT APPLIED: question missing)'}: ${esc(e.note)} (reviewed ${e.reviewed})`);
  }
  if (!errata.length) out.push('- none');
  out.push('');
  out.push(
    (hs
      ? 'Generated by `npm run data:build` (scripts/doe/build.ts) from the PDFs listed in `scripts/doe/manifest.json` '
      : 'Generated by `npm run data:build:ms` (scripts/doe/build.ts --level ms) from the PDFs listed in `scripts/doe/manifest-ms.json` ') +
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
    (hs
      ? '"Expected" assumes the packet size of the year: 25 toss-ups/bonuses per round through 2013, 23 for 2014-2020 and 18 for the 2021-2022 virtual sets. '
      : '"Expected" assumes the packet size of the year: 25 toss-ups/bonuses per round through 2013 (and in the Sample Rounds), 23 for 2014-2020, 15 for the 2021 virtual set and 18 for 2022. ') +
      '"Complete" counts questions that have a mapped category, a printed type and an answer, as a share of the expected number.',
    '',
  );

  // Per-set summary.
  out.push('## Sets', '');
  out.push('| Set | Year | Rounds | Toss-ups (parsed/expected) | Bonuses (parsed/expected) | Complete | Flagged questions | Warnings |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const [n, rs] of results) {
    const year = manifest.sets.find((s) => s.set === n)?.year;
    const exp = expectedPairs(cfg, n, year);
    const ok = rs.filter((r) => r.round);
    const qs = ok.flatMap((r) => questionsOf(r.round!));
    const tu = qs.filter((q) => q.kind === 'tossup').length;
    const bo = qs.filter((q) => q.kind === 'bonus').length;
    const expected = exp ? exp * rs.length : undefined;
    const warnings = rs.reduce((a, r) => a + r.warnings.length, 0);
    out.push(
      `| ${setId(n)} | ${year ?? '–'} | ${ok.length}/${rs.length} | ${tu}/${expected ?? '?'} | ${bo}/${expected ?? '?'} | ` +
        `${pct(qs.filter(isComplete).length, (expected ?? qs.length / 2) * 2)} | ${qs.filter((q) => q.flags?.length).length} | ${warnings} |`,
    );
  }
  out.push('');
  if (!hs) out.push(...msSetsReport(cfg, manifest, results));

  // Subjects.
  out.push('## Questions by subject', '');
  out.push(`| Set | ${SUBJECT_ORDER.join(' | ')} |`);
  out.push(`|---|${SUBJECT_ORDER.map(() => '---').join('|')}|`);
  for (const [n, rs] of results) {
    const qs = rs.filter((r) => r.round).flatMap((r) => questionsOf(r.round!));
    out.push(`| ${setId(n)} | ${SUBJECT_ORDER.map((s) => qs.filter((q) => q.subject === s).length || '').join(' | ')} |`);
  }
  out.push('');
  const printed = new Map<string, number>();
  for (const q of allQuestions) printed.set(`${q.sourceCategory || '(none)'} → ${q.subject}`, (printed.get(`${q.sourceCategory || '(none)'} → ${q.subject}`) ?? 0) + 1);
  out.push('Printed categories and where they were mapped:', '');
  for (const [k, v] of [...printed.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) out.push(`- ${k}: ${v}`);
  out.push('');
  if (!hs) out.push(...splitReport(results, allQuestions, splitEval));

  out.push(...topicsReport(cfg, allQuestions, topicEval));

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
    'answer-letter-inferred': 'the answer line printed only the text of an option; the letter is the option with that text',
    'number-mismatch': 'printed question number out of sequence',
    'kind-corrected': 'a bonus printed under a TOSS-UP marker (same number as the toss-up before it); read as that bonus',
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
  for (const r of parseFailures) out.push(`- ${setId(r.entry.set)} ${r.entry.label} (${r.entry.file}): ${r.error}`);
  out.push('', `Resources listed on the page but not parsed as rounds: ${resources.map((r) => `${r.label} (${r.file})`).join(', ') || 'none'}.`, '');
  if (!hs) {
    const fixed = manifest.entries.filter((e) => e.note);
    out.push(fixed.length ? 'Entries that differ from the page:' : 'Every manifest entry is the file the page links to.');
    for (const e of fixed) out.push(`- ${setId(e.set)} ${e.label}: ${esc(e.note!)}${e.pageUrl ? ` (page link: ${e.pageUrl}; used: ${e.url})` : ''}`);
    out.push('');
  }

  out.push(...(hs ? NOTES : MS_NOTES), '');

  // Spot checks.
  const spotChecks = hs ? SPOT_CHECKS : MS_SPOT_CHECKS;
  if (spotChecks.length) {
    out.push('## Spot checks', '');
    out.push('Questions compared by hand with `pdftotext` output of the PDF. Current parse shown for each.', '');
    const byId = new Map(allQuestions.map((q) => [q.id, q]));
    for (const c of spotChecks) {
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
    const exp = expectedPairs(cfg, n, year);
    out.push(`### ${setId(n)}${year ? ` (${year})` : ''}`, '');
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
        `| ${r.entry.label} | ${esc(r.printedLabel ?? '')} | ${shortFile(r.entry.file)} | ${r.pages ?? ''} | ${tu}/${exp ?? '?'} | ${bo}/${exp ?? '?'} | ${qs.filter((q) => q.flags?.length).length} | ${notes.join('; ')} |`,
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
      out.push(`**${setId(n)} ${r.entry.label}** (${shortFile(r.entry.file)})`, '');
      for (const w of r.warnings) out.push(`- ${w.questionId ?? ''}${w.page ? ` (p. ${w.page})` : ''} \`${w.code}\`: ${esc(w.message)}`);
      out.push('');
    }
  }
  return out.join('\n');
}

/** Middle school: where each set comes from (the page's year, the PDFs' own dates and running footers). */
function msSetsReport(cfg: LevelConfig, manifest: Manifest, results: Map<SetKey, RoundResult[]>): string[] {
  const out: string[] = ['### Where the sets come from', ''];
  out.push(
    "DOE's page says the questions were \"used at the regional competitions in previous years\". The year is the page's (or the file names'); " +
      "the PDFs' own creation dates and the lines printed on every page are listed as a check.",
    '',
  );
  out.push('| Set | Title | Year (evidence) | PDFs created | Running header or footer |', '|---|---|---|---|---|');
  for (const [n, rs] of results) {
    const info = manifest.sets.find((s) => s.set === n);
    const dates = rs.map((r) => r.pdfInfo?.created).filter((d): d is string => !!d).sort();
    const footers = new Map<string, number>();
    for (const r of rs) for (const f of r.repeated ?? []) footers.set(f, (footers.get(f) ?? 0) + 1);
    const common = [...footers.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([f]) => `"${esc(f)}"`);
    const range = dates.length ? (dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`) : '–';
    out.push(
      `| ${setIdentity(cfg, n).id} | ${esc(setIdentity(cfg, n).title)} | ${info?.year ? `${info.year} (${esc(info.yearEvidence ?? '')})` : 'none printed'} | ${range} | ${common.join('; ') || '–'} |`,
    );
  }
  out.push('');
  return out;
}

/** One hand label from scripts/doe/split-eval-ms.json. */
interface SplitLabel {
  id: string;
  subject: 'physics' | 'chemistry' | 'either';
  sample: string;
}

/** Middle school: how the printed Physical Science questions were split between physics and chemistry. */
function splitReport(results: Map<SetKey, RoundResult[]>, questions: Question[], labels: SplitLabel[] | undefined): string[] {
  const out: string[] = ['### Physical Science split', ''];
  const printed = questions.filter(isPrintedPhysicalScience);
  const n = (s: Subject) => printed.filter((q) => q.subject === s).length;
  out.push(
    'The 2027 rules split middle school Physical Science into Physics and Chemistry. Each question printed as Physical Science goes to the subject whose ' +
      'topic rules fit it clearly better (`src/core/importers/doeSubjects.ts`: best topic score at least 2 and ahead of the other subject by at least 1); ' +
      'otherwise it keeps the legacy subject `physical_science`. `sourceCategory` keeps the printed category.',
    '',
    `Result: ${printed.length} Physical Science questions → ${n('physics')} physics (${pct(n('physics'), printed.length)}), ` +
      `${n('chemistry')} chemistry (${pct(n('chemistry'), printed.length)}), ${n('physical_science')} kept as physical_science (${pct(n('physical_science'), printed.length)}).`,
    '',
  );
  const perSet = [...results.entries()].filter(([, rs]) => rs.some((r) => r.split && r.split.physics + r.split.chemistry + r.split.kept > 0));
  if (perSet.length) {
    out.push('| Set | Physics | Chemistry | Kept |', '|---|---|---|---|');
    for (const [k, rs] of perSet) {
      const sum = (f: 'physics' | 'chemistry' | 'kept') => rs.reduce((a, r) => a + (r.split?.[f] ?? 0), 0);
      out.push(`| ${typeof k === 'number' ? `Set ${k}` : k} | ${sum('physics')} | ${sum('chemistry')} | ${sum('kept')} |`);
    }
    out.push('');
  }
  if (!labels?.length) {
    out.push('No hand labels found (scripts/doe/split-eval-ms.json).', '');
    return out;
  }
  out.push(...SPLIT_EVAL_NOTES, '');
  const byId = new Map(questions.map((q) => [q.id, q]));
  out.push('| Sample | Labelled | "Either" | Clear | Moved | To the labelled subject | Kept as physical_science |', '|---|---|---|---|---|---|---|');
  const wrong: string[] = [];
  for (const sample of [...new Set(labels.map((l) => l.sample))]) {
    const group = labels.filter((l) => l.sample === sample && byId.has(l.id));
    const clear = group.filter((l) => l.subject !== 'either');
    const moved = clear.filter((l) => byId.get(l.id)!.subject !== 'physical_science');
    const right = moved.filter((l) => byId.get(l.id)!.subject === l.subject);
    out.push(`| ${sample} | ${group.length} | ${group.length - clear.length} | ${clear.length} | ${moved.length} | ${right.length} (${pct(right.length, moved.length)}) | ${clear.length - moved.length} |`);
    for (const l of moved.filter((x) => byId.get(x.id)!.subject !== x.subject)) {
      const q = byId.get(l.id)!;
      const e = physicalScienceEvidence(q);
      wrong.push(`- sample ${sample} \`${l.id}\`: labelled ${l.subject}, moved to ${q.subject} (physics ${e.physics}, chemistry ${e.chemistry}) — ${esc(q.stem.slice(0, 110))}${q.stem.length > 110 ? '…' : ''}`);
    }
  }
  out.push('');
  if (wrong.length) out.push('Moved to the other subject than the label:', '', ...wrong, '');
  return out;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
