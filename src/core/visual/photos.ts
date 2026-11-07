/**
 * Identification bonuses from the photo set (public/data/visual/photos.json, built by
 * scripts/visual/build-photos.py from public-domain photos). A question's id is "vph-<photo id>-<seed>":
 * the seed decides short answer or multiple choice and, for multiple choice, the other options.
 */
import { SUBJECT_LABELS, type CoreSubject, type Question } from '../schema';
import { multipleChoice } from './choices';
import { makeRng } from './rng';

export interface PhotoGroup {
  id: string;
  subject: CoreSubject;
  /** Topic id from taxonomy.ts. */
  topic?: string;
  /** Short-answer stem, e.g. "Identify the cloud genus shown in the photo." */
  question: string;
  /** Multiple-choice stem, e.g. "Which of the following cloud genera is shown in the photo?" */
  mcQuestion: string;
}

export interface PhotoEntry {
  id: string;
  group: string;
  /** As DOE prints answers, e.g. "CUMULONIMBUS". */
  answer: string;
  accept: string[];
  /** Path relative to data/visual/, e.g. "photos/cumulonimbus-1.webp". */
  file: string;
  width: number;
  height: number;
  alt: string;
  credit: string;
  /** The photo's page on Wikimedia Commons. */
  source: string;
  license: string;
}

export interface PhotoSet {
  generatedAt: string;
  groups: PhotoGroup[];
  photos: PhotoEntry[];
}

export const PHOTO_SET_ID = 'vph';

export function photoQuestionId(photoId: string, seed: number): string {
  return `vph-${photoId}-${seed}`;
}

export function parsePhotoQuestionId(id: string): { photoId: string; seed: number } | null {
  const m = /^vph-(.+)-(\d+)$/.exec(id);
  if (!m) return null;
  const seed = Number(m[2]);
  return Number.isSafeInteger(seed) ? { photoId: m[1]!, seed } : null;
}

/** "SHIELD VOLCANO" → "Shield volcano"; words in parentheses or with digits are left alone. */
export function sentenceCase(s: string): string {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** The question a photo id and seed stand for, or null when the photo is not in the set. */
export function photoQuestion(set: PhotoSet, photoId: string, seed: number): Question | null {
  const photo = set.photos.find((p) => p.id === photoId);
  const group = photo && set.groups.find((g) => g.id === photo.group);
  if (!photo || !group) return null;
  const rng = makeRng(seed);
  const others = [...new Set(set.photos.filter((p) => p.group === group.id && p.answer !== photo.answer).map((p) => p.answer))];
  const asChoice = others.length >= 3 && rng.chance(0.5);
  const base = {
    id: photoQuestionId(photo.id, seed),
    kind: 'bonus' as const,
    number: 1,
    subject: group.subject,
    sourceCategory: SUBJECT_LABELS[group.subject].toUpperCase(),
    reject: [],
    visual: true,
    figure: { kind: 'image' as const, src: `data/visual/${photo.file}`, alt: photo.alt, credit: `${photo.credit} (${photo.license})`, sourceUrl: photo.source },
    source: { provider: 'rebound' as const, setId: PHOTO_SET_ID, roundId: group.id, url: photo.source, credit: `Photo: ${photo.credit} (${photo.license}), via Wikimedia Commons` },
    ...(group.topic ? { topic: group.topic } : {}),
  };
  if (asChoice) {
    const correct = sentenceCase(photo.answer);
    const { choices, answerLetter } = multipleChoice(correct, others.map(sentenceCase), rng);
    return { ...base, format: 'multiple_choice', stem: group.mcQuestion, choices, answerLetter, answer: correct, accept: [], answerRaw: `${answerLetter}) ${photo.answer}` };
  }
  return {
    ...base,
    format: 'short_answer',
    stem: group.question,
    answer: photo.answer,
    accept: photo.accept,
    answerRaw: photo.accept.length ? `${photo.answer} (ACCEPT: ${photo.accept.join(', ')})` : photo.answer,
  };
}
