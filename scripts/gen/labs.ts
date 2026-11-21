/**
 * The table of DOE's national laboratories (data/labs.json) and finding their names in a question.
 *
 * Energy questions open with a lab ("Scientists at Oak Ridge National Laboratory are studying…"), and a lab's
 * name can go out of date: the pilot wrote "National Renewable Energy Laboratory" five times, a year after
 * DOE renamed it. The house-style checks use this table to refuse a former name and to catch a lab whose
 * name contains the answer.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './library';

export interface FormerName {
  name: string;
  short?: string[];
  /** When the name ended: "YYYY-MM-DD" or "YYYY-MM". */
  until: string;
  /** Where the change is stated. */
  source: string;
}

export interface Lab {
  id: string;
  /** The official name, as DOE lists it. */
  name: string;
  /** Other names in current use ("Fermilab"). */
  also?: string[];
  /** Abbreviations, matched in capitals as written ("ORNL"). */
  short?: string[];
  former?: FormerName[];
  home: string;
  news?: string;
  note?: string;
}

export interface LabTable {
  about: string;
  /** The day the table was last checked against `source`, "YYYY-MM-DD". */
  checked: string;
  source: string;
  labs: Lab[];
}

export const LABS_FILE = path.join(DATA_DIR, 'labs.json');
/** The table is checked every quarter; past this many days it is called stale. */
export const LABS_STALE_DAYS = 100;

export function loadLabs(file = LABS_FILE): LabTable {
  return JSON.parse(readFileSync(file, 'utf8')) as LabTable;
}

/** Whether the table is overdue for its quarterly check. */
export function labsStale(table: LabTable, now = new Date()): boolean {
  return now.getTime() - Date.parse(`${table.checked}T00:00:00Z`) > LABS_STALE_DAYS * 86_400_000;
}

export interface LabMention {
  lab: Lab;
  /** The words found in the text. */
  text: string;
  index: number;
  /** Set when the words are a name the lab no longer has. */
  former?: FormerName;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A pattern for a name: any spacing, and Lab, Labs, Laboratory or Laboratories at the end count as the same word. */
function namePattern(name: string): string {
  const words = name.trim().split(/\s+/).map(escape);
  const last = words.length - 1;
  if (/^(Laboratory|Laboratories|Lab|Labs)$/i.test(words[last]!)) words[last] = '(?:Laborator(?:y|ies)|Labs?)';
  return `(?<![A-Za-z])${words.join('\\s+')}(?![A-Za-z])`;
}

const shortPattern = (short: string) => `(?<![A-Za-z0-9])${escape(short)}(?![A-Za-z0-9])`;

/** Every lab named in a text, by any current or former name, in reading order. A longer name wins over one inside it. */
export function labMentions(text: string, table: LabTable): LabMention[] {
  const found: LabMention[] = [];
  const scan = (pattern: string, flags: string, lab: Lab, former?: FormerName) => {
    for (const m of text.matchAll(new RegExp(pattern, flags))) found.push({ lab, text: m[0], index: m.index, ...(former ? { former } : {}) });
  };
  for (const lab of table.labs) {
    for (const name of [lab.name, ...(lab.also ?? [])]) scan(namePattern(name), 'gi', lab);
    for (const short of lab.short ?? []) scan(shortPattern(short), 'g', lab);
    for (const former of lab.former ?? []) {
      scan(namePattern(former.name), 'gi', lab, former);
      for (const short of former.short ?? []) scan(shortPattern(short), 'g', lab, former);
    }
  }
  found.sort((a, b) => a.index - b.index || b.text.length - a.text.length);
  const out: LabMention[] = [];
  let end = -1;
  for (const m of found) {
    if (m.index < end) continue;
    out.push(m);
    end = m.index + m.text.length;
  }
  return out;
}

/** Names in a text that a lab no longer has, with the name to use instead. */
export function formerLabNames(text: string, table: LabTable): Array<{ found: string; now: string; until: string }> {
  return labMentions(text, table)
    .filter((m) => m.former)
    .map((m) => ({ found: m.text, now: m.lab.name, until: m.former!.until }));
}

/**
 * Whether a text names a national lab or the Department of Energy at all, however loosely ("Fermi National
 * Lab", "DOE scientists"): the measure of how often DOE's Energy questions do.
 */
export function namesLabOrDoe(text: string, table: LabTable): boolean {
  return labMentions(text, table).length > 0 || /\bNational (Accelerator )?(Laborator(y|ies)|Labs?|Facility)\b|\bDepartment of Energy\b|(?<![A-Za-z])DOE(?![A-Za-z])/.test(text);
}
