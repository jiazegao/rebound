import { describe, expect, it } from 'vitest';
import { formerLabNames, labMentions, labsStale, loadLabs, namesLabOrDoe } from './labs';
import { allowedDomains, loadSources, sourceStatus } from './sources';

const labs = loadLabs();
const sources = loadSources();

describe('the lab table', () => {
  it('lists DOE’s 17 national laboratories, each with its home page and a unique id', () => {
    expect(labs.labs).toHaveLength(17);
    expect(new Set(labs.labs.map((l) => l.id)).size).toBe(17);
    expect(new Set(labs.labs.map((l) => l.name)).size).toBe(17);
    for (const l of labs.labs) {
      expect(l.home, l.id).toMatch(/^https:\/\//);
      if (l.news) expect(l.news, l.id).toMatch(/^https:\/\//);
      for (const f of l.former ?? []) {
        expect(f.until, l.id).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
        expect(f.source, l.id).toMatch(/^https:\/\//);
      }
    }
    expect(labs.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is called stale a quarter after its last check', () => {
    expect(labsStale({ ...labs, checked: '2026-11-21' }, new Date('2026-12-31T00:00:00Z'))).toBe(false);
    expect(labsStale({ ...labs, checked: '2026-11-21' }, new Date('2027-03-15T00:00:00Z'))).toBe(true);
  });
});

describe('finding lab names', () => {
  const ids = (text: string) => labMentions(text, labs).map((m) => m.lab.id);

  it('takes the official name, Lab for Laboratory, other current names and abbreviations', () => {
    expect(ids('Scientists at Oak Ridge National Laboratory are studying neutrons.')).toEqual(['oak-ridge']);
    expect(ids('Researchers at Lawrence Berkeley National Lab and at Fermilab worked with PNNL.')).toEqual(['berkeley', 'fermilab', 'pacific-northwest']);
    expect(ids('Sandia National Labs and the Thomas Jefferson National Accelerator Facility')).toEqual(['sandia', 'jefferson']);
    expect(ids('Scientists at Ames Lab are studying rare earths.')).toEqual(['ames']);
  });

  it('does not take a word that only looks like an abbreviation, or part of a longer word', () => {
    expect(ids('The inlet valve was closed.')).toEqual([]);
    expect(ids('An island arc formed.')).toEqual([]);
    expect(ids('Slack water occurs at the turn of the tide.')).toEqual([]);
  });

  it('counts one mention for a name that holds a shorter one', () => {
    expect(labMentions('SLAC National Accelerator Laboratory', labs)).toHaveLength(1);
  });

  it('knows the names labs no longer have, and what to write instead', () => {
    expect(formerLabNames('Scientists at the National Renewable Energy Laboratory are testing perovskite cells.', labs)).toEqual([
      { found: 'National Renewable Energy Laboratory', now: 'National Laboratory of the Rockies', until: '2025-12-01' },
    ]);
    expect(formerLabNames('NREL engineers and the Stanford Linear Accelerator Center', labs).map((f) => f.now)).toEqual(['National Laboratory of the Rockies', 'SLAC National Accelerator Laboratory']);
    expect(formerLabNames('Scientists at the National Laboratory of the Rockies and at Ames Laboratory', labs)).toEqual([]);
  });

  it('can tell loosely whether a text names a lab or DOE at all', () => {
    expect(namesLabOrDoe('Fermi National Lab scientists are looking for new particles.', labs)).toBe(true);
    expect(namesLabOrDoe('DOE researchers are studying batteries.', labs)).toBe(true);
    expect(namesLabOrDoe('What property of carbon nanotubes makes them useful in electronics?', labs)).toBe(false);
  });
});

describe('source lists', () => {
  it('allows agency pages and the labs’ own sites, subdomains included', () => {
    expect(sourceStatus('https://science.nasa.gov/moon/lunar-craters/', sources, labs).status).toBe('allowed');
    expect(sourceStatus('https://www.nlr.gov/news/', sources, labs).status).toBe('allowed');
    expect(sourceStatus('https://www6.slac.stanford.edu/news-and-events/news-center', sources, labs).status).toBe('allowed');
    expect(sourceStatus('https://en.wikipedia.org/wiki/Lichen', sources, labs).status).toBe('allowed');
  });

  it('bans OpenStax, NAQT, question banks and DOE’s own question pages, with the reason', () => {
    const openstax = sourceStatus('https://openstax.org/books/chemistry-2e/pages/10-1-intermolecular-forces', sources, labs);
    expect(openstax.status).toBe('banned');
    expect(openstax.why).toMatch(/AI tools/);
    expect(sourceStatus('https://www.naqt.com/samples/', sources, labs).status).toBe('banned');
    expect(sourceStatus('https://sbreader.github.io/', sources, labs).status).toBe('banned');
    expect(sourceStatus('https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/HS-Sample-Questions', sources, labs).status).toBe('banned');
  });

  it('leaves everything else unlisted, for a person to decide', () => {
    expect(sourceStatus('https://chem.libretexts.org/Bookshelves', sources, labs).status).toBe('unlisted');
    expect(sourceStatus('https://notnasa.gov.example.com/', sources, labs).status).toBe('unlisted');
    expect(sourceStatus('not a link', sources, labs).status).toBe('unlisted');
    expect(sourceStatus('https://science.osti.gov/wdts/nsbx', sources, labs).status).toBe('unlisted');
  });

  it('gives the web search one list of allowed domains, with no banned one in it', () => {
    const domains = allowedDomains(sources, labs);
    expect(domains).toContain('nasa.gov');
    expect(domains).toContain('nlr.gov');
    expect(domains).toContain('slac.stanford.edu');
    for (const d of domains) expect(sourceStatus(`https://${d}/`, sources, labs).status, d).toBe('allowed');
  });
});
