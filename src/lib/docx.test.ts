/**
 * Word export: build real .docx files and read word/document.xml back (jszip comes with docx 9.14; docx
 * 9.15 and later use fflate instead, so switch this import if docx is upgraded).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { Question, Round } from '../core/schema';
import { FIGURE_NOTE, questionsToDocx, roundToDocx } from './docx';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function q(fields: Partial<Question> & Pick<Question, 'id' | 'kind' | 'stem'>): Question {
  return {
    number: 1,
    subject: 'biology',
    sourceCategory: 'Biology',
    format: 'short_answer',
    answer: '',
    accept: [],
    reject: [],
    answerRaw: '',
    source: { provider: 'doe', setId: 'doe-hs-17', roundId: 'doe-hs-17-r01', credit: 'DOE' },
    ...fields,
  };
}

const round: Round = {
  id: 'doe-hs-17-r01',
  label: 'Round 1',
  order: 1,
  pairs: [
    {
      number: 1,
      tossup: q({
        id: 't1',
        kind: 'tossup',
        stem: 'Rotational accelerations are detected by the mammalian vestibular [ves-TIB-u-lar] system through what structure?',
        answer: 'SEMICIRCULAR CANALS',
        accept: ['SEMICIRCULAR DUCTS'],
        answerRaw: 'SEMICIRCULAR CANALS (ACCEPT: SEMICIRCULAR DUCTS)',
      }),
      bonus: q({
        id: 'b1',
        kind: 'bonus',
        subject: 'chemistry',
        format: 'multiple_choice',
        stem: 'Which of the following is a noble gas?',
        choices: { W: 'Nitrogen', X: 'Argon', Y: 'Chlorine', Z: 'Sodium & potassium <alloy>' },
        answer: 'ARGON',
        answerLetter: 'X',
        answerRaw: 'X) ARGON',
      }),
    },
    {
      number: 2,
      tossup: q({
        id: 't2',
        kind: 'tossup',
        number: 2,
        subject: 'earth_space',
        format: 'multiple_choice',
        stem: 'In the North Atlantic, what is the precursor of a hurricane?',
        choices: { W: 'Tropical depression', X: 'Tropical storm', Y: 'Monsoon', Z: 'Typhoon' },
        answer: 'TROPICAL DEPRESSION',
        answerLetter: 'W',
        answerRaw: 'W) TROPICAL DEPRESSION',
      }),
      bonus: q({
        id: 'vis-math-sector-7',
        kind: 'bonus',
        number: 2,
        subject: 'math',
        stem: 'What is the area of the shaded sector?',
        answer: '12π',
        accept: ['12 PI'],
        reject: ['37.7'],
        visual: true,
        figure: { kind: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>', alt: 'A circle with a shaded sector' },
      }),
    },
  ],
};

/** The text of each paragraph of word/document.xml (table cells included), in order. */
async function paragraphs(blob: Blob): Promise<{ texts: string[]; xml: string }> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const decode = (s: string) =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
      .replace(/&amp;/g, '&');
  const texts = [...xml.matchAll(/<w:p\/>|<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) =>
    [...m[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:br\/>/g)].map((t) => (t[1] === undefined ? '\n' : decode(t[1]))).join(''),
  );
  return { texts, xml };
}

/** Each expected line appears, in this order (other lines may come between). */
function expectInOrder(texts: string[], expected: string[]) {
  let from = 0;
  for (const line of expected) {
    const at = texts.indexOf(line, from);
    expect(at, `"${line}" after line ${from}\n${texts.join('\n')}`).toBeGreaterThanOrEqual(0);
    from = at + 1;
  }
}

describe('roundToDocx', () => {
  it('lays a round out like a DOE packet', async () => {
    const blob = await roundToDocx(round, { title: 'Sample Set 17, Round 1', credit: 'Questions: U.S. Department of Energy', answers: true });
    expect(blob.type).toBe(DOCX_TYPE);
    const { texts, xml } = await paragraphs(blob);
    expectInOrder(texts, [
      'Sample Set 17, Round 1',
      'Questions: U.S. Department of Energy',
      'TOSS-UP',
      '1) BIOLOGY  Short Answer    Rotational accelerations are detected by the mammalian vestibular [ves-TIB-u-lar] system through what structure?',
      'ANSWER: SEMICIRCULAR CANALS (ACCEPT: SEMICIRCULAR DUCTS)',
      'BONUS',
      '1) CHEMISTRY  Multiple Choice    Which of the following is a noble gas?',
      'W) Nitrogen',
      'X) Argon',
      'Y) Chlorine',
      'Z) Sodium & potassium <alloy>',
      'ANSWER: X) ARGON',
      '~'.repeat(40),
      'TOSS-UP',
      '2) EARTH AND SPACE  Multiple Choice    In the North Atlantic, what is the precursor of a hurricane?',
      'W) Tropical depression',
      'X) Tropical storm',
      'Y) Monsoon',
      'Z) Typhoon',
      'ANSWER: W) TROPICAL DEPRESSION',
      'VISUAL BONUS',
      FIGURE_NOTE,
      '2) MATH  Short Answer    What is the area of the shaded sector?',
      'ANSWER: 12π (ACCEPT: 12 PI) (DO NOT ACCEPT: 37.7)',
    ]);
    // A blank line before each answer line, the question type in italics, and no figure markup in the file.
    const answerAt = texts.indexOf('ANSWER: X) ARGON');
    expect(texts[answerAt - 1]).toBe('');
    expect(texts[answerAt - 2]).toBe('Z) Sodium & potassium <alloy>');
    expect(xml).toMatch(/<w:i\/>(?:(?!<\/w:r>)[\s\S])*<w:t[^>]*>Short Answer<\/w:t>/);
    expect(xml).not.toContain('circle');
    expect(texts.filter((t) => t === FIGURE_NOTE)).toHaveLength(1);
  });

  it('leaves the answer lines out of a players’ copy', async () => {
    const { texts } = await paragraphs(await roundToDocx(round, { title: 'Round 1', answers: false }));
    expect(texts.some((t) => t.startsWith('ANSWER'))).toBe(false);
    expectInOrder(texts, ['Round 1', 'TOSS-UP', 'BONUS', 'Z) Sodium & potassium <alloy>', 'TOSS-UP', 'Z) Typhoon', 'VISUAL BONUS', '2) MATH  Short Answer    What is the area of the shaded sector?']);
  });
});

describe('questionsToDocx', () => {
  const list = [round.pairs[1].bonus!, round.pairs[0].tossup, q({ id: 'x', kind: 'tossup', stem: 'Missing answer?', subject: 'general_science', source: { provider: 'doe', setId: 's', roundId: 'r', url: 'https://example.org/a.pdf', page: 4, credit: 'DOE' } })];

  it('numbers a flat list in list order', async () => {
    const { texts } = await paragraphs(await questionsToDocx(list, { title: 'Written questions', answers: true }));
    expectInOrder(texts, [
      'Written questions',
      'VISUAL BONUS',
      FIGURE_NOTE,
      '1) MATH  Short Answer    What is the area of the shaded sector?',
      'TOSS-UP',
      '2) BIOLOGY  Short Answer    Rotational accelerations are detected by the mammalian vestibular [ves-TIB-u-lar] system through what structure?',
      'ANSWER: SEMICIRCULAR CANALS (ACCEPT: SEMICIRCULAR DUCTS)',
      'TOSS-UP',
      '3) GENERAL SCIENCE  Short Answer    Missing answer?',
      'ANSWER: (not available; see the original, page 4)',
    ]);
  });

  it('keeps line breaks and drops characters Word cannot store', async () => {
    const stem = 'Consider the list:\n1) rocking\r\n2) rolling\u0001 Which\tone?';
    const { texts, xml } = await paragraphs(await questionsToDocx([q({ id: 'w1', kind: 'tossup', stem, answer: 'ROCKING', answerRaw: 'ROCKING' })], { title: 'Line\nbreaks\u0002', answers: true }));
    expect(xml).not.toMatch(/[\u0001\u0002\t]/);
    expect(texts).toContain('1) BIOLOGY  Short Answer    Consider the list:\n1) rocking\n2) rolling Which one?');
    expect(texts).toContain('Line\nbreaks');
  });

  it("writes NSB Toolbox's question table", async () => {
    const { texts, xml } = await paragraphs(await questionsToDocx([round.pairs[0].bonus!, round.pairs[1].bonus!], { title: 'For NSB Toolbox', answers: true, layout: 'table' }));
    expect(xml.match(/<w:tbl>/g)).toHaveLength(1);
    expectInOrder(texts, [
      'For NSB Toolbox',
      ...['TUB', 'Subj', 'Ques', 'LOD', 'LOD-A', 'Set', 'Rd', 'Q Letter', 'Author', 'ID', 'Source', 'Comments', 'Subcat'],
      'BONUS',
      'Chemistry',
      'Multiple Choice    Which of the following is a noble gas?',
      'W) Nitrogen',
      'X) Argon',
      'Y) Chlorine',
      'Z) Sodium & potassium <alloy>',
      '',
      'ANSWER: X) ARGON',
      'b1',
      'DOE',
      'VISUAL BONUS',
      'Math',
      'Short Answer    What is the area of the shaded sector?',
      'ANSWER: 12π (ACCEPT: 12 PI) (DO NOT ACCEPT: 37.7)',
      'vis-math-sector-7',
      'DOE',
      FIGURE_NOTE,
    ]);
    // The toolbox reads the question type from the cell's first run (italic) and the stem from the second.
    expect(xml).toMatch(/<w:r><w:rPr><w:i\/>(?:<w:iCs\/>)?<\/w:rPr><w:t[^>]*>Multiple Choice<\/w:t><\/w:r><w:r>(?:<w:rPr\/>)?<w:t xml:space="preserve">    Which/);
  });
});

it('loads the docx library only when exporting', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/docx.ts'), 'utf8');
  expect(source).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+'docx'/m);
  expect(source).toContain("await import('docx')");
});
