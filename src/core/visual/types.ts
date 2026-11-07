import type { AnswerFormat, CoreSubject, Letter } from '../schema';
import type { Rng } from './rng';

/** What a template makes: a figure (SVG) and a bonus question about it. */
export interface VisualDraft {
  /** The question as the moderator reads it, without the choices, e.g. "What is the area of the shaded region?". */
  stem: string;
  format: AnswerFormat;
  /** Multiple choice only: the four choices (build them with multipleChoice() in choices.ts). */
  choices?: Record<Letter, string>;
  answerLetter?: Letter;
  /** The answer as printed. Multiple choice: the text of the correct choice. Short answer: simplest exact form. */
  answer: string;
  /** Other acceptable answers (another name, the symbol, an equivalent form). */
  accept?: string[];
  /** Answers to refuse even if they look close (the answer checker's look-alike guard). */
  reject?: string[];
  /** The figure: build it with figure() in svg.ts. */
  svg: string;
  /** What the figure shows, for screen readers. It must not give the answer away. */
  alt: string;
  /** Topic id from src/core/taxonomy.ts with the template's subject, when one fits. */
  topic?: string;
}

export interface VisualTemplate {
  /**
   * Stable id "<subject>-<name>", e.g. "math-triangle-area" or "earth_space-moon-phase". Question ids
   * contain it and review cards keep them, so never rename or reuse one.
   */
  id: string;
  subject: CoreSubject;
  /** Short title for the Visual lab, e.g. "Area of a triangle". */
  title: string;
  /** One line on what the figure shows and what is asked. */
  description: string;
  /**
   * Make one question. Use only `rng` for randomness, so the same seed gives the same question on every
   * device and in later versions of the site: change a template's output only by adding a new template.
   */
  make(rng: Rng): VisualDraft;
}
