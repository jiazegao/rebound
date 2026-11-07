/**
 * Shared data types for Rebound ("NSB-JSON").
 *
 * Every question source (DOE sample PDFs, SB Reader files, team-written questions)
 * is converted into these shapes, so the rest of the site never needs to know
 * where a question came from.
 */

/** The six categories used by the 2027 rules, for both high school and middle school. */
export type CoreSubject = 'biology' | 'chemistry' | 'earth_space' | 'energy' | 'math' | 'physics';

/** Categories that only appear in older sets and have no clean 2027 equivalent. */
export type LegacySubject = 'general_science' | 'computer_science' | 'physical_science';

export type Subject = CoreSubject | LegacySubject;

export const CORE_SUBJECTS: CoreSubject[] = ['biology', 'chemistry', 'earth_space', 'energy', 'math', 'physics'];

export const SUBJECT_LABELS: Record<Subject, string> = {
  biology: 'Biology',
  chemistry: 'Chemistry',
  earth_space: 'Earth and Space',
  energy: 'Energy',
  math: 'Math',
  physics: 'Physics',
  general_science: 'General Science (legacy)',
  computer_science: 'Computer Science (legacy)',
  physical_science: 'Physical Science (legacy)',
};

export type QuestionKind = 'tossup' | 'bonus';
export type AnswerFormat = 'short_answer' | 'multiple_choice';
export type Letter = 'W' | 'X' | 'Y' | 'Z';
export const LETTERS: Letter[] = ['W', 'X', 'Y', 'Z'];

export type Level = 'HS' | 'MS';
export type Provider = 'doe' | 'sbreader' | 'team' | 'other';

export interface QuestionSource {
  provider: Provider;
  /** e.g. "doe-hs-17" */
  setId: string;
  /** e.g. "doe-hs-17-r01" */
  roundId: string;
  /** Link to the original file (for DOE: the official PDF). */
  url?: string;
  /** 1-based page in the original PDF, when known. */
  page?: number;
  /** Human-readable credit line shown next to the question. */
  credit: string;
}

export interface Question {
  /** Stable id, e.g. "doe-hs-17-r01-t01" (toss-up 1) or "doe-hs-17-r01-b01" (bonus 1). */
  id: string;
  kind: QuestionKind;
  /** Question number within its round (1-based). */
  number: number;
  /** Category mapped to the 2027 categories (legacy categories kept separate). */
  subject: Subject;
  /** Category exactly as printed in the source, e.g. "EARTH SCIENCE", "Earth and Space". */
  sourceCategory: string;
  format: AnswerFormat;
  /** Question text without the answer choices. Pronunciation guides are kept in [brackets]. */
  stem: string;
  /** Present for multiple choice questions. */
  choices?: Record<Letter, string>;
  /** Main answer as printed. For multiple choice: the text of the correct choice. */
  answer: string;
  /** For multiple choice: the correct letter. */
  answerLetter?: Letter;
  /** Alternate acceptable answers ("ACCEPT: ...", "ALSO ACCEPT ..."). */
  accept: string[];
  /** Answers that must be rejected ("DO NOT ACCEPT: ..."). */
  reject: string[];
  /** The complete answer line(s) as printed, for the reader to see. */
  answerRaw: string;
  /** Other notes from the answer line, e.g. "MUST GIVE BOTH". */
  notes?: string[];
  /** True when the question depends on a picture or figure. */
  visual?: boolean;
  source: QuestionSource;
  /** Warnings raised while importing, e.g. "choices-missing". Empty or absent when clean. */
  flags?: string[];
  /** Topic id from src/core/taxonomy.ts, e.g. "biology.genetics" (absent when no topic fits). */
  topic?: string;
  /** Concept ids within the topic, e.g. "biology.genetics.hardy-weinberg". */
  concepts?: string[];
  /** For Energy questions: the discipline the question really tests ("energy (chemistry)"). */
  crossSubject?: CoreSubject;
}

/** A toss-up and the bonus that goes with it. */
export interface QuestionPair {
  number: number;
  tossup: Question;
  bonus?: Question;
}

export interface Round {
  /** e.g. "doe-hs-17-r01" */
  id: string;
  /** e.g. "Round 1" or "Round 1A" */
  label: string;
  /** Position of the round within its set, used for ordering and difficulty (1-based). */
  order: number;
  sourceUrl?: string;
  pairs: QuestionPair[];
}

export interface QuestionSet {
  /** e.g. "doe-hs-17" */
  id: string;
  provider: Provider;
  level: Level;
  /** e.g. "DOE High School Sample Set 17" */
  title: string;
  /** e.g. "2022" when the set is known to come from a given year's regionals. */
  year?: string;
  setNumber?: number;
  /** Page the set was published on. */
  sourcePage?: string;
  credit: string;
  license: string;
  rounds: Round[];
}

/** Summary of one set, stored in a small index file so the site can list sets without loading them. */
export interface SetSummary {
  id: string;
  provider: Provider;
  level: Level;
  title: string;
  year?: string;
  setNumber?: number;
  /** File name of the full set, relative to the index file. */
  file: string;
  sourcePage?: string;
  credit: string;
  license: string;
  rounds: { id: string; label: string; order: number; sourceUrl?: string; pairs: number }[];
  questionCount: number;
  subjectCounts: Partial<Record<Subject, number>>;
}

export interface LibraryIndex {
  generatedAt: string;
  sets: SetSummary[];
}

/**
 * One compact row per question in the library, so drills and plans can choose questions
 * without downloading every set: [id, subject, topic id or "", "t" | "b", round order, cross-subject or ""].
 * The set id is the id's prefix (e.g. "doe-hs-17" in "doe-hs-17-r01-t01").
 */
export type CatalogRow = [id: string, subject: Subject, topic: string, kind: 't' | 'b', round: number, crossSubject: CoreSubject | ''];

export interface Catalog {
  generatedAt: string;
  questions: CatalogRow[];
  /** How many questions each topic id has, for frequency-weighted planning. */
  topicCounts: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Team data                                                           */
/* ------------------------------------------------------------------ */

export type Role = 'coach' | 'captain' | 'member';

export interface Player {
  id: string;
  name: string;
  role: Role;
  /** Sub-team label, e.g. "A". */
  squad?: string;
  primarySubject?: CoreSubject;
  secondarySubject?: CoreSubject;
  active: boolean;
}

export interface Team {
  id: string;
  name: string;
  level: Level;
  createdAt: string;
  /** The next competition, which shapes every player's daily plan. `date` is "YYYY-MM-DD". */
  nextEvent?: { name: string; date: string };
}
