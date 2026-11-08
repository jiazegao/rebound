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
/** `rebound`: questions the site generates itself (visual bonuses drawn from templates). */
export type Provider = 'doe' | 'sbreader' | 'team' | 'rebound' | 'other';

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
  /** The figure for a visual question, when the site has it (DOE PDFs' figures are not imported). */
  figure?: Figure;
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

/**
 * A visual question's figure. `svg` markup comes only from Rebound's own generators (src/core/visual),
 * never from users or the network, so it can be put into the page as is. Pictures (`image`) are shown
 * with an <img> element: a site path for the photo set, or a data: URL (JPEG, PNG or WebP) for pictures a
 * team added.
 */
export type Figure =
  | { kind: 'svg'; svg: string; alt: string }
  | { kind: 'image'; src: string; alt: string; credit?: string; sourceUrl?: string };

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

/** The library questions tagged with each concept id (public/data/doe/concepts.json). */
export interface ConceptIndex {
  generatedAt: string;
  concepts: Record<string, string[]>;
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
  /** Year the player graduates (for planning who takes over each subject). */
  gradYear?: number;
}

export interface Team {
  id: string;
  name: string;
  level: Level;
  createdAt: string;
  /** The next competition, which shapes every player's daily plan. `date` is "YYYY-MM-DD". */
  /** `finals`: it is the National Finals, so daily plans add Finals prep (visual bonuses) in the last six weeks. */
  nextEvent?: { name: string; date: string; lineupId?: string; finals?: boolean };
}

/** A saved lineup: up to four starters in seat order, and alternates. */
export interface Lineup {
  id: string;
  name: string;
  starters: string[];
  alternates: string[];
  createdAt: string;
  updatedAt: string;
}

/** A packet the team made from the library (a scrimmage) or uploaded (private questions). */
export interface TeamPacket {
  id: string;
  kind: 'scrimmage' | 'upload';
  title: string;
  createdAt: string;
  /** Scrimmage: library toss-up and bonus ids, in reading order. */
  pairs?: Array<{ tossupId: string; bonusId?: string }>;
  /** Scrimmage settings, for the packet's description. */
  options?: {
    level: DifficultyLevel | 'any';
    forPlayers: string[];
    size: number;
    /** The format it was built for (older scrimmages have none: a regional round). */
    format?: ScrimmageFormat;
    /** Visual bonuses in the packet (Finals visual rounds). */
    visualBonuses?: number;
  };
  /** Upload: the questions themselves. They stay in the team's own data and are never published. */
  set?: QuestionSet;
  /** Upload: how hard the source is, for the difficulty ladder (regional, invitational or nationals-level). */
  level?: UploadLevel;
}

/**
 * The difficulty ladder (proposal 5.6): DOE rounds 1–10, DOE rounds 11 and later, invitational and
 * nationals-level packets (from the team's uploads).
 */
export type DifficultyLevel = 'early' | 'late' | 'invitational' | 'nationals';

/** Levels a team can give an uploaded packet. */
export type UploadLevel = 'regional' | 'invitational' | 'nationals';

/** What a scrimmage packet is built for. */
export type ScrimmageFormat = 'regional' | 'finals' | 'finals-visual' | 'tiebreak';

/**
 * A visual question the team added: a picture (stored as a data: URL) and a bonus question about it.
 * Ids start with "vtm-". It stays in the team's own data and is never published.
 */
export interface TeamVisual {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Player who added it, when known. */
  authorId: string | null;
  question: Question;
}

/** Where a team-written question stands: being written, waiting for its subject owner, or approved. */
export type WriteStatus = 'draft' | 'review' | 'approved';

/**
 * A question the team writes in the studio (Team → Write). Approved questions can be made into team
 * packets. Ids start with "wq-".
 */
export interface WrittenQuestion {
  id: string;
  /** The question itself (kind, subject, format, stem, choices, answer, accept and reject lists). */
  question: Question;
  status: WriteStatus;
  /** Player who wrote it. */
  authorId: string | null;
  /** Player who approved it (the subject owner or a leader, never the author). */
  reviewerId: string | null;
  /** Where the facts come from: at least one before it can be sent for review. */
  sources: Array<{ title: string; url?: string }>;
  comments: Array<{ by: string | null; text: string; at: string }>;
  /** Present when an AI model drafted it: the question stays labeled and internal to the team. */
  /** Set when an AI model drafted it (labeled everywhere, and kept to the team's own practice). */
  ai?: {
    model: string;
    at: string;
    passageSource: string;
    /** The passage's sentence that supports the answer. */
    support?: string;
    /** A second call's answer, given without the key or the passage, and whether the checker accepted it. */
    blindAnswer?: string;
    blindAgreed?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

/** A concept card written by the team (one per concept id). */
export interface ConceptCard {
  id: string;
  /** 150 words or fewer. */
  summary: string;
  facts: string[];
  traps: string;
  sources: Array<{ title: string; url?: string }>;
  authorId: string | null;
  reviewerId: string | null;
  status: 'draft' | 'reviewed';
  updatedAt: string;
  /** Set when an AI model drafted the card from a cited passage. */
  ai?: { model: string; at: string; passageSource: string };
}

export type AssignmentKind = 'drill' | 'packet' | 'concept' | 'review';

/** Work a captain or coach assigns to players. */
export interface Assignment {
  id: string;
  kind: AssignmentKind;
  title: string;
  note?: string;
  /** Drill: subject, optional topic and number of questions. */
  subject?: CoreSubject;
  topic?: string;
  count?: number;
  /** Packet: a team packet to play solo. */
  packetId?: string;
  /** Concept: the card to read. */
  conceptId?: string;
  playerIds: string[];
  /** "YYYY-MM-DD" */
  due: string;
  createdAt: string;
  createdBy: string | null;
}

/** One player finishing one assignment (a record of its own, so players never overwrite each other). */
export interface Completion {
  /** `${assignmentId}:${playerId}` */
  id: string;
  assignmentId: string;
  playerId: string;
  at: string;
}
