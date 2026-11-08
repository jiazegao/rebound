/**
 * Adding a packet the team has (an invitational's PDF, or questions as JSON) to the team's own data.
 *
 * PDFs are read in the browser with pdf.js and parsed with the same importer as the DOE sets, so
 * packets formatted like DOE's (TOSS-UP / BONUS, the category, W–Z choices, ANSWER lines) come in
 * cleanly; anything that did not parse is flagged on the review screen. Nothing leaves the device
 * except through the team's own sync: community packets carry no open license.
 */
import { readNsbJson, type NsbJsonDoc } from '../core/nsbjson';
import { doeRoundId, parseDoeRound, type ParseWarning } from '../core/importers/doe';
import { extractTextLines } from '../core/importers/pdfText';
import type { Question, QuestionSet, Round } from '../core/schema';
import { teamSetId } from './packets';
import { isSafeImageSrc } from './visuals';

export const UPLOAD_LICENSE = 'Private to the team. Community packets carry no open license: do not redistribute.';

export interface ParsedRound {
  fileName: string;
  round: Round;
  warnings: ParseWarning[];
  printedLabel?: string;
}

async function tagAll(rounds: Round[]): Promise<void> {
  // The tagger is large, so it loads only when someone uploads.
  const { tagQuestion } = await import('../core/tagging');
  for (const r of rounds) {
    for (const p of r.pairs) {
      for (const q of [p.tossup, p.bonus]) {
        if (!q) continue;
        const tags = tagQuestion(q);
        if (tags.topic) q.topic = tags.topic;
        if (tags.concepts.length) q.concepts = tags.concepts;
        if (tags.crossSubject) q.crossSubject = tags.crossSubject;
      }
    }
  }
}

function markTeam(q: Question, credit: string): void {
  q.source = { ...q.source, provider: 'team', credit };
}

/** Read one PDF as one round of the packet. */
export async function parsePdf(file: File, packetId: string, order: number, credit: string): Promise<ParsedRound> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  // Uploaded files are untrusted: no eval, no embedded fonts.
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  try {
    const lines = await extractTextLines(doc, { ops: pdfjs.OPS as unknown as Record<string, number> });
    const setId = teamSetId(packetId);
    const label = file.name.replace(/\.pdf$/i, '');
    const result = parseDoeRound(lines, { setId, roundId: doeRoundId(setId, order), label, order, credit });
    for (const p of result.round.pairs) for (const q of [p.tossup, p.bonus]) if (q) markTeam(q, credit);
    if (result.printedLabel) result.round.label = result.printedLabel;
    await tagAll([result.round]);
    return { fileName: file.name, round: result.round, warnings: result.warnings, printedLabel: result.printedLabel };
  } finally {
    await doc.destroy();
  }
}

/**
 * Read a JSON file: a QuestionSet in Rebound's format (NSB-JSON), or `{ rounds: [...] }`. Ids are
 * rewritten so they cannot collide with the library or another packet.
 */
export async function parseJson(file: File, packetId: string, credit: string): Promise<ParsedRound[]> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error(`${file.name} is not valid JSON.`);
  }
  let rounds = (parsed as { rounds?: unknown })?.rounds;
  if (parsed && typeof parsed === 'object' && 'nsbjson' in parsed) rounds = nsbJsonRounds(text, file.name);
  if (!Array.isArray(rounds) || rounds.length === 0) throw new Error(`${file.name} has no "rounds" list (Rebound's question-set format).`);
  const setId = teamSetId(packetId);
  const out: ParsedRound[] = [];
  rounds.forEach((raw, i) => {
    const r = raw as Partial<Round>;
    if (!Array.isArray(r.pairs)) throw new Error(`Round ${i + 1} in ${file.name} has no "pairs" list.`);
    const roundId = doeRoundId(setId, i + 1);
    const warnings: ParseWarning[] = [];
    const pairs = r.pairs.map((pair, j) => {
      const fix = (q: Question | undefined, kind: 'tossup' | 'bonus'): Question | undefined => {
        if (!q) return undefined;
        if (typeof q.stem !== 'string' || typeof q.answer !== 'string') {
          warnings.push({ code: 'bad-question', message: `Pair ${j + 1}: a ${kind} is missing its text or answer.` });
          return undefined;
        }
        const id = `${roundId}-${kind === 'tossup' ? 't' : 'b'}${String(j + 1).padStart(2, '0')}`;
        // Keep a figure only if it is an ordinary picture (a data: URL of a JPEG, PNG or WebP). Drawing
        // markup (SVG) is never taken from a file: the site only shows figures its own code draws.
        const { figure: raw, ...rest } = q;
        const figure = raw?.kind === 'image' && typeof raw.src === 'string' && isSafeImageSrc(raw.src) ? { kind: 'image' as const, src: raw.src, alt: String(raw.alt ?? ''), ...(raw.credit ? { credit: String(raw.credit) } : {}) } : undefined;
        if (raw && !figure) warnings.push({ code: 'figure-dropped', message: `Pair ${j + 1}: the ${kind}'s figure was left out (only JPEG, PNG or WebP pictures embedded as data URLs are kept).` });
        return {
          ...rest,
          ...(figure ? { figure, visual: true } : {}),
          id,
          kind,
          number: j + 1,
          accept: Array.isArray(q.accept) ? q.accept : [],
          reject: Array.isArray(q.reject) ? q.reject : [],
          answerRaw: q.answerRaw ?? q.answer,
          source: { provider: 'team', setId, roundId, credit },
        };
      };
      const tossup = fix(pair.tossup, 'tossup');
      return tossup ? { number: j + 1, tossup, bonus: fix(pair.bonus, 'bonus') } : null;
    });
    out.push({
      fileName: file.name,
      round: { id: roundId, label: r.label ?? `Round ${i + 1}`, order: i + 1, pairs: pairs.filter((p): p is NonNullable<typeof p> => p !== null) },
      warnings,
    });
  });
  await tagAll(out.map((o) => o.round));
  return out;
}

/**
 * The rounds in an NSB-JSON file (docs/NSB-JSON.md): a question set's rounds, or a question list as one round,
 * each toss-up followed by the bonus after it. A game log has no questions to upload.
 */
function nsbJsonRounds(text: string, fileName: string): Array<Partial<Round>> {
  let doc: NsbJsonDoc;
  try {
    doc = readNsbJson(text);
  } catch (e) {
    throw new Error(`${fileName}: ${e instanceof Error ? e.message : 'not a readable NSB-JSON file.'}`);
  }
  if (doc.kind === 'question-set') return doc.set.rounds;
  if (doc.kind === 'game-log') throw new Error(`${fileName} is a game log, not a packet of questions.`);
  const pairs: Array<{ number: number; tossup: Question; bonus?: Question }> = [];
  for (const q of doc.questions) {
    const last = pairs[pairs.length - 1];
    if (q.kind === 'bonus') {
      // A bonus goes with the toss-up just before it; one without a toss-up cannot be played, so it is left out.
      if (last && !last.bonus) last.bonus = q;
    } else {
      pairs.push({ number: pairs.length + 1, tossup: q });
    }
  }
  return [{ label: doc.title, pairs }];
}

/** The packet's question set, from the rounds the captain kept. */
export function uploadSet(packetId: string, title: string, credit: string, rounds: Round[]): QuestionSet {
  return {
    id: teamSetId(packetId),
    provider: 'team',
    level: 'HS',
    title,
    credit,
    license: UPLOAD_LICENSE,
    rounds: rounds.map((r, i) => ({ ...r, order: i + 1 })),
  };
}
