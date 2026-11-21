/**
 * Which websites the pipeline may use as sources (data/sources.json): the list the web search is limited
 * to, and the sites it may never read. What goes into a model matters more than what comes out: a source's
 * own terms can forbid it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { LabTable } from './labs';
import { DATA_DIR } from './library';

export interface SourceGroup {
  group: string;
  why: string;
  /** Bare domains ("nasa.gov"), optionally with a path ("science.osti.gov/wdts/nsb"). A domain covers its subdomains. */
  domains: string[];
}

export interface SourceLists {
  about: string;
  checked: string;
  allowed: SourceGroup[];
  banned: SourceGroup[];
}

export const SOURCES_FILE = path.join(DATA_DIR, 'sources.json');

export function loadSources(file = SOURCES_FILE): SourceLists {
  return JSON.parse(readFileSync(file, 'utf8')) as SourceLists;
}

function matches(url: URL, entry: string): boolean {
  const slash = entry.indexOf('/');
  const domain = (slash < 0 ? entry : entry.slice(0, slash)).toLowerCase();
  const prefix = slash < 0 ? '' : entry.slice(slash);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== domain && !host.endsWith(`.${domain}`)) return false;
  return prefix === '' || url.pathname === prefix || url.pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

/** The national laboratories' own sites, from the lab table. */
function labDomains(labs: LabTable): string[] {
  return labs.labs.map((l) => new URL(l.home).hostname.replace(/^www\d*\./, ''));
}

/** The domains the web search may be limited to: the allowed list plus the labs' sites. */
export function allowedDomains(lists: SourceLists, labs?: LabTable): string[] {
  return [...new Set([...lists.allowed.flatMap((g) => g.domains), ...(labs ? labDomains(labs) : [])])];
}

export interface SourceStatus {
  status: 'allowed' | 'banned' | 'unlisted';
  group?: string;
  why?: string;
}

/** Where a web address stands. A ban wins over everything else. */
export function sourceStatus(address: string, lists: SourceLists, labs?: LabTable): SourceStatus {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { status: 'unlisted', why: 'Not a web address.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { status: 'unlisted', why: 'Not a web address.' };
  for (const g of lists.banned) if (g.domains.some((d) => matches(url, d))) return { status: 'banned', group: g.group, why: g.why };
  for (const g of lists.allowed) if (g.domains.some((d) => matches(url, d))) return { status: 'allowed', group: g.group, why: g.why };
  if (labs && labDomains(labs).some((d) => matches(url, d))) return { status: 'allowed', group: 'DOE national laboratories', why: "The labs' own pages on their research: the sources for Energy questions." };
  return { status: 'unlisted' };
}
