/**
 * Word (.docx) packets for running practice tournaments, laid out like DOE's sample packets:
 *
 *   TOSS-UP
 *   1) BIOLOGY  Short Answer    What structure ...?
 *   ANSWER: SEMICIRCULAR CANALS (ACCEPT: SEMICIRCULAR DUCTS)
 *
 * with W–Z choices on their own lines and the bonus the same way. Spacing follows the official format
 * as NSB Toolbox applies it: the question type in italics, four spaces before the stem, a blank line
 * before the answer line, Times New Roman 12 pt.
 *
 * The `docx` library is large, so it is imported inside the functions and loads only when someone
 * exports; it never enters the main bundle.
 */
import { LETTERS, SUBJECT_LABELS, type Question, type Round } from '../core/schema';

type DocxLib = typeof import('docx');
type Paragraph = InstanceType<DocxLib['Paragraph']>;
type TextRun = InstanceType<DocxLib['TextRun']>;

export interface DocxOptions {
  /** Shown at the top of the first page and in the footer, e.g. "DOE High School Sample Set 17, Round 1". */
  title: string;
  /** Credit line under the title, e.g. where the questions come from. */
  credit?: string;
  /** Include the ANSWER lines (the moderator's copy). */
  answers: boolean;
}

/** Shown above a question that has a figure: the players get the figure on the printed worksheet. */
export const FIGURE_NOTE = '(visual bonus: see the worksheet)';

const FONT = 'Times New Roman';
/** Half-points. */
const SIZE = 24;
/** US Letter, 1-inch margins, in twips (1/1440 inch). */
const LETTER = { width: 12240, height: 15840 };
const MARGIN = 1440;
const SEPARATOR = '~'.repeat(40);

/** Characters XML 1.0 does not allow: Word refuses a file that has them. */
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Runs for a piece of text: characters Word cannot store are dropped, and line breaks stay line breaks. */
function runs(d: DocxLib, text: string, style: { bold?: boolean; italics?: boolean; size?: number } = {}): TextRun[] {
  return text
    .replace(NOT_XML, '')
    .replace(/\t/g, ' ')
    .split(/\r\n?|\n/)
    .map((line, i) => new d.TextRun({ ...style, text: line, ...(i > 0 ? { break: 1 } : {}) }));
}

/** The category as DOE prints it: "BIOLOGY", "EARTH AND SPACE" (legacy categories without "(legacy)"). */
function category(q: Question): string {
  return SUBJECT_LABELS[q.subject].replace(/\s*\(legacy\)$/, '').toUpperCase();
}

function typeName(q: Question): string {
  return q.format === 'multiple_choice' ? 'Multiple Choice' : 'Short Answer';
}

function heading(q: Question): string {
  if (q.kind === 'tossup') return 'TOSS-UP';
  return q.figure ? 'VISUAL BONUS' : 'BONUS';
}

/** The answer line after "ANSWER: ": as printed when known, otherwise built from the answer fields. */
function answerText(q: Question): string {
  if (q.answerRaw.trim()) return q.answerRaw.trim();
  const main = `${q.answerLetter ? `${q.answerLetter}) ` : ''}${q.answer.trim()}`.trim();
  if (!main) return `(not available${q.source.url ? `; see the original${q.source.page ? `, page ${q.source.page}` : ''}` : ''})`;
  const accept = q.accept.length ? ` (ACCEPT: ${q.accept.join('; ')})` : '';
  const reject = q.reject.length ? ` (DO NOT ACCEPT: ${q.reject.join('; ')})` : '';
  return `${main}${accept}${reject}`;
}

/** One question's lines. Every line but the last keeps with the next, so a question never splits across pages. */
function questionParagraphs(d: DocxLib, q: Question, number: number, answers: boolean): Paragraph[] {
  const lines: Array<{ runs: TextRun[]; center?: boolean }> = [{ runs: runs(d, heading(q), { bold: true }), center: true }, { runs: [] }];
  if (q.figure) lines.push({ runs: runs(d, FIGURE_NOTE, { italics: true }) });
  lines.push({ runs: [...runs(d, `${number}) ${category(q)}  `), ...runs(d, typeName(q), { italics: true }), ...runs(d, `    ${q.stem.trim()}`)] });
  if (q.choices) for (const L of LETTERS) lines.push({ runs: runs(d, `${L}) ${q.choices[L]}`) });
  if (answers) lines.push({ runs: [] }, { runs: runs(d, `ANSWER: ${answerText(q)}`) });
  // Notes (an AI-drafted label, an erratum) go on the moderator's copy only.
  if (answers && q.notes?.length) lines.push({ runs: runs(d, q.notes.join(' · '), { italics: true }) });
  return lines.map(
    (line, i) =>
      new d.Paragraph({
        children: line.runs,
        keepLines: true,
        keepNext: i < lines.length - 1,
        ...(line.center ? { alignment: d.AlignmentType.CENTER } : {}),
      }),
  );
}

const blank = (d: DocxLib) => new d.Paragraph({});

const separator = (d: DocxLib) => new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: runs(d, SEPARATOR) });

function titleBlock(d: DocxLib, opts: DocxOptions): Paragraph[] {
  const center = d.AlignmentType.CENTER;
  const out = [new d.Paragraph({ alignment: center, children: runs(d, opts.title, { bold: true, size: 28 }) })];
  if (opts.credit) out.push(new d.Paragraph({ alignment: center, children: runs(d, opts.credit, { italics: true, size: 20 }) }));
  out.push(blank(d));
  return out;
}

/** `page` is given upright (width < height); `landscape` turns it. */
async function pack(
  d: DocxLib,
  opts: DocxOptions,
  children: Array<Paragraph | InstanceType<DocxLib['Table']>>,
  page: { width: number; height: number; landscape?: boolean } = LETTER,
  margin = MARGIN,
): Promise<Blob> {
  const { Document, Footer, Packer, Paragraph, TextRun, AlignmentType, PageNumber, PageOrientation } = d;
  const size = { width: page.width, height: page.height, ...(page.landscape ? { orientation: PageOrientation.LANDSCAPE } : {}) };
  const title = opts.title.replace(NOT_XML, '').replace(/\s+/g, ' ');
  const doc = new Document({
    creator: 'Rebound',
    title,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: { page: { size, margin: { top: margin, right: margin, bottom: margin, left: margin } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [`${title}    Page `, PageNumber.CURRENT], size: 18 })] })],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}

/** A round as a Word packet: each toss-up and its bonus, numbered as in the round, with `~~~` lines between pairs. */
export async function roundToDocx(round: Round, opts: DocxOptions): Promise<Blob> {
  const d = await import('docx');
  const children: Paragraph[] = titleBlock(d, opts);
  round.pairs.forEach((pair, i) => {
    if (i > 0) children.push(blank(d), separator(d), blank(d));
    children.push(...questionParagraphs(d, pair.tossup, pair.number, opts.answers));
    if (pair.bonus) children.push(blank(d), ...questionParagraphs(d, pair.bonus, pair.number, opts.answers));
  });
  return pack(d, opts, children);
}

/**
 * A flat list of questions (e.g. a team's written questions), numbered 1, 2, 3... in list order.
 *
 * `layout: 'table'` writes NSB Toolbox's question table instead (one row per question with the columns
 * TUB, Subj, Ques, LOD, LOD-A, Set, Rd, Q Letter, Author, ID, Source, Comments, Subcat), which
 * `nsb format` checks and `nsb assign` sorts into rounds. The ID column holds the question's id.
 */
export async function questionsToDocx(questions: Question[], opts: DocxOptions & { layout?: 'packet' | 'table' }): Promise<Blob> {
  const d = await import('docx');
  if (opts.layout === 'table') return toolboxTable(d, questions, opts);
  const children: Paragraph[] = titleBlock(d, opts);
  questions.forEach((q, i) => {
    if (i > 0) children.push(blank(d), separator(d), blank(d));
    children.push(...questionParagraphs(d, q, i + 1, opts.answers));
  });
  return pack(d, opts, children);
}

/* NSB Toolbox's table: columns and widths (inches) as `nsb make` writes them (nsb-toolbox 0.6). */
const TOOLBOX_COLUMNS: Array<[name: string, inches: number]> = [
  ['TUB', 0.72],
  ['Subj', 0.61],
  ['Ques', 4.71],
  ['LOD', 0.58],
  ['LOD-A', 0.68],
  ['Set', 0.68],
  ['Rd', 0.68],
  ['Q Letter', 0.68],
  ['Author', 0.81],
  ['ID', 0.64],
  ['Source', 4.71],
  ['Comments', 1.51],
  ['Subcat', 1.44],
];

/** The toolbox's subject names (title case); legacy categories keep their own names. */
function toolboxSubject(q: Question): string {
  return SUBJECT_LABELS[q.subject].replace(/\s*\(legacy\)$/, '');
}

/**
 * The question cell, as `nsb format` reads it: the type in italics as the first run and the stem after four
 * spaces as the second; one paragraph per choice; a blank paragraph; the answer line.
 */
function toolboxQuestionCell(d: DocxLib, q: Question, answers: boolean): Paragraph[] {
  const out = [new d.Paragraph({ children: [...runs(d, typeName(q), { italics: true }), ...runs(d, `    ${q.stem.trim()}`)] })];
  if (q.choices) for (const L of LETTERS) out.push(new d.Paragraph({ children: runs(d, `${L}) ${q.choices[L]}`) }));
  if (answers) out.push(blank(d), new d.Paragraph({ children: runs(d, `ANSWER: ${answerText(q)}`) }));
  return out;
}

function toolboxTable(d: DocxLib, questions: Question[], opts: DocxOptions): Promise<Blob> {
  const { Table, TableRow, TableCell, Paragraph, WidthType, TableLayoutType } = d;
  const widths = TOOLBOX_COLUMNS.map(([, inches]) => Math.round(inches * 1440));
  const cell = (i: number, children: Paragraph[]) => new TableCell({ width: { size: widths[i], type: WidthType.DXA }, children });
  const text = (s: string) => [new Paragraph({ children: s ? runs(d, s) : [] })];
  const header = new TableRow({
    tableHeader: true,
    children: TOOLBOX_COLUMNS.map(([name], i) => cell(i, [new Paragraph({ children: runs(d, name, name === 'Ques' ? { italics: true } : {}) })])),
  });
  const rows = questions.map((q) => {
    const values: Record<string, Paragraph[]> = {
      TUB: text(heading(q)),
      Subj: text(toolboxSubject(q)),
      Ques: toolboxQuestionCell(d, q, opts.answers),
      ID: text(q.id),
      Source: text([q.source.credit, q.source.url].filter(Boolean).join(' ')),
      Comments: text(q.figure ? FIGURE_NOTE : ''),
    };
    return new TableRow({ children: TOOLBOX_COLUMNS.map(([name], i) => cell(i, values[name] ?? text(''))) });
  });
  const table = new Table({ layout: TableLayoutType.FIXED, columnWidths: widths, rows: [header, ...rows] });
  // The table is about 18.7 inches wide (the toolbox's own widths): a long landscape page with half-inch margins holds it.
  const length = widths.reduce((a, b) => a + b, 0) + 720 * 2;
  return pack(d, opts, [...titleBlock(d, opts), table], { width: LETTER.width, height: length, landscape: true }, 720);
}
