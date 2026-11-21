/**
 * The shapes the question pipeline passes from step to step. The plan (docs/QUESTION-PIPELINE.md on the
 * research/question-writing branch) numbers the steps; scripts/gen/README.md says which are built.
 */
import type { CoreSubject, Letter, Level, Question, QuestionKind } from '../../src/core/schema';

/** How hard a round is meant to be: like DOE's rounds 1–10 (early), or like its rounds 11–17 (late). */
export type Tier = 'early' | 'late';

/** The form of a question. "Identify all" and "Rank" are short-answer questions with DOE's fixed wording. */
export type Form = 'multiple_choice' | 'short_answer' | 'identify_all' | 'rank';

/** What a question asks of a player. */
export type Skill = 'recall' | 'application' | 'computation';

/** One place in a round, as the round plan fills it (step 1). */
export interface Slot {
  /** Place in the round, e.g. "t07" (toss-up 7) or "b07". */
  id: string;
  level: Level;
  tier: Tier;
  kind: QuestionKind;
  subject: CoreSubject;
  form: Form;
  skill: Skill;
  /** Topic id from src/core/taxonomy.ts. */
  topic: string;
  /** Multiple choice: the letter the key should land on, so keys are spread over W to Z. */
  letter?: Letter;
  /** Energy: the lab news item the question is written from. */
  newsId?: string;
}

/** A proposal for a question in three short lines (step 2), screened before anything is written (step 3). */
export interface Idea {
  answer: string;
  /** The fact being tested. */
  fact: string;
  /** How the question will point at the answer. */
  cue: string;
  /** Computation: the method and the numbers. */
  method?: string;
}

/** Where a fact comes from. */
export interface SourceRef {
  title: string;
  url: string;
  /** The supporting words, as the search tool returned them from the page. */
  quote?: string;
  /** When the page was published, "YYYY-MM-DD", when it says. */
  published?: string;
  /** When the pipeline read it. */
  checked?: string;
}

/** The fields of a question a writer supplies. Ids, numbers and the answer line are added when a round is assembled. */
export type QuestionText = Pick<Question, 'kind' | 'subject' | 'format' | 'stem' | 'answer' | 'accept' | 'reject'> & Partial<Pick<Question, 'choices' | 'answerLetter' | 'notes'>>;

/** A written question on its way through the checks (steps 4 to 9). */
export interface Draft {
  question: QuestionText;
  level: Level;
  tier?: Tier;
  /** The form the round plan asked for, when there is a plan. */
  form?: Form;
  /** Multiple choice: the letter the round plan wants the key on. */
  letter?: Letter;
  /** Choices in an order that means something (earliest to latest, smallest to largest in words): never shuffled. */
  keepChoiceOrder?: boolean;
  sources?: SourceRef[];
  /** The date on which a fact that can change was true, "YYYY-MM-DD". */
  asOf?: string;
}

/** Where a question stands. */
export type Status =
  | 'draft' // written, still in the checks
  | 'rejected' // failed a check or the reviewer
  | 'spare' // passed every check, not placed in a round
  | 'placed' // in a round that awaits sign-off
  | 'approved' // signed off by a person
  | 'released' // given to a team or published
  | 'retired'; // withdrawn after release

/** The checks a question passes through, by the plan's steps: 5, 6, 7 (four of them) and 8. */
export type CheckName = 'style' | 'original' | 'solve' | 'compute' | 'source' | 'second-look' | 'difficulty';

export interface CheckResult {
  passed: boolean;
  /** When it ran (ISO date and time). */
  at: string;
  /** What ran it: "code", or a model id. */
  by: string;
  /** The hash of the question's text at the time (ledger.ts, questionHash): a check of other words does not count. */
  textHash: string;
  /** The version of the prompt, for a model's check. */
  prompt?: string;
  tokens?: { input: number; output: number };
  /** What the check found: findings, the solver's answer, the nearest library questions, the source. */
  details?: unknown;
}

export interface Review {
  /** The person who signed off. */
  by: string;
  at: string;
  decision: 'approved' | 'edited' | 'rejected' | 'unsure';
  /** How long they looked at it. */
  seconds?: number;
  note?: string;
}

/** One line of the ledger: everything known about one question, from idea to play. */
export interface BankRecord {
  /** Permanent id, e.g. "rb-hs-000123". A corrected typo keeps it and raises `rev`; a changed question gets a new one. */
  id: string;
  rev: number;
  status: Status;
  level: Level;
  /** Why it was rejected or retired, and at which step. */
  ended?: { step: string; reason: string };
  slot?: Slot;
  idea?: Idea;
  question: QuestionText;
  sources: SourceRef[];
  asOf?: string;
  /** How it was written: the run, the time, the writer (a model id or a person) and the prompt version. */
  made: { run: string; at: string; by: string; prompt?: string };
  checks: Partial<Record<CheckName, CheckResult>>;
  review?: Review;
  /** Where it went: the packet or set, its place there ("r01-b07"), and when. */
  released: Array<{ packet: string; as: string; at: string }>;
  /** What play showed, once results are read back. */
  play?: { firstAnswers: number; correct: number; reports: number };
}
