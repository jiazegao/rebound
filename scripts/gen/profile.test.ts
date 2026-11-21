import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { libraryBuilt, loadLibrary } from './library';
import { loadProfile, PROFILE_FILE, profileText } from './profile';

describe.skipIf(!libraryBuilt())('the style profile', () => {
  it('scripts/gen/data/style-profile.json matches the library (if not, run npm run gen:profile)', () => {
    // Compared as a boolean: printing a diff of the whole file helps nobody.
    expect(readFileSync(PROFILE_FILE, 'utf8') === profileText(loadLibrary())).toBe(true);
  }, 30_000);

  it('is measured on DOE’s 2019–22 sets, both levels, every category', () => {
    const p = loadProfile();
    expect(p.fromYear).toBe(2019);
    expect(p.sets).toEqual(['doe-hs-13', 'doe-hs-14', 'doe-hs-15', 'doe-hs-16', 'doe-hs-17', 'doe-ms-13', 'doe-ms-14', 'doe-ms-15', 'doe-ms-16']);
    for (const level of ['HS', 'MS'] as const) {
      for (const cells of Object.values(p.levels[level].cells)) {
        expect(cells.tossup.questions).toBeGreaterThan(90);
        // Not always equal: middle school Physical Science questions were split into Physics and Chemistry one by one.
        expect(cells.bonus.questions).toBeGreaterThan(90);
      }
    }
  });

  // The research note's own measurements of the same sets (nsb_format_and_style.md, Table D), as a cross-check.
  it('agrees with what the research measured', () => {
    const hs = loadProfile().levels.HS;
    expect(hs.questions).toBe(2464);
    expect(hs.cells.math.tossup.multipleChoice).toBeCloseTo(0.161, 2);
    expect(hs.cells.math.bonus.multipleChoice).toBeCloseTo(0.024, 2);
    expect(hs.cells.physics.bonus.numeric).toBeGreaterThan(0.6);
    expect(hs.cells.energy.tossup.stemWords.median).toBe(30);
    expect(hs.cells.biology.tossup.stemWords).toEqual({ median: 16, p90: 24 });
    expect(hs.all.bonus.identifyAll).toBeGreaterThan(0.17);
    expect(hs.all.tossup.identifyAll).toBeLessThan(0.05);
    expect(hs.cells.energy.tossup.namesLab).toBeGreaterThan(0.9);
    expect(hs.cells.biology.tossup.namesLab).toBeLessThan(0.02);
    // Keys are spread evenly and multiple-choice stems are questions.
    for (const share of Object.values(hs.choices.letters)) expect(share).toBeGreaterThan(0.23);
    expect(hs.choices.endsWithQuestionMark).toBeGreaterThan(0.99);
    expect(hs.choices.words).toEqual({ median: 2, p90: 8 });
  });
});
