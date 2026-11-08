import { describe, expect, it } from 'vitest';
import { READING_PATHS } from './readingPaths';
import { CORE_SUBJECTS, type CoreSubject } from './schema';
import { topicById, topicsForSubject } from './taxonomy';

const allSteps = CORE_SUBJECTS.flatMap((subject) => READING_PATHS[subject].steps);
const allReadings = allSteps.flatMap((step) => step.readings);

describe('reading paths', () => {
  it('has one path per core subject, labelled with that subject and introduced', () => {
    expect(Object.keys(READING_PATHS).sort()).toEqual([...CORE_SUBJECTS].sort());
    for (const subject of CORE_SUBJECTS) {
      expect(READING_PATHS[subject].subject).toBe(subject);
      expect(READING_PATHS[subject].intro.trim(), subject).not.toBe('');
    }
  });

  it('lists every taxonomy topic exactly once, in its own subject', () => {
    for (const subject of CORE_SUBJECTS) {
      const topics = READING_PATHS[subject].steps.map((step) => step.topic);
      expect(new Set(topics).size, subject).toBe(topics.length);
      expect([...topics].sort(), subject).toEqual(topicsForSubject(subject).map((t) => t.id).sort());
      for (const id of topics) expect(topicById(id)?.subject, id).toBe(subject);
    }
  });

  it('puts prerequisites first', () => {
    const chains: Array<[CoreSubject, string[]]> = [
      ['biology', ['cells-membranes', 'biochemistry-metabolism', 'molecular-biotech', 'genetics', 'evolution-classification', 'ecology']],
      ['chemistry', ['atomic-structure', 'periodic-trends', 'bonding-geometry', 'stoichiometry-solutions', 'equilibrium', 'acids-bases']],
      ['physics', ['kinematics-forces', 'work-energy-momentum', 'rotation-gravitation', 'electrostatics-circuits', 'magnetism-induction']],
      ['earth_space', ['minerals-rocks', 'tectonics-structure', 'geologic-time-fossils', 'observational-astronomy', 'stars', 'galaxies-cosmology']],
      ['energy', ['conversion-efficiency', 'data-units', 'fossil-fuels', 'grid-transmission', 'storage-hydrogen']],
      ['math', ['arithmetic', 'algebra', 'trigonometry', 'calculus']],
      ['math', ['probability-combinatorics', 'statistics']],
    ];
    for (const [subject, chain] of chains) {
      const order = READING_PATHS[subject].steps.map((step) => step.topic);
      const positions = chain.map((slug) => order.indexOf(`${subject}.${slug}`));
      expect(positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1])), `${subject}: ${chain.join(' < ')}`).toBe(true);
    }
  });

  it('gives every step a focus and one to three readings', () => {
    for (const step of allSteps) {
      expect(step.focus.trim(), step.topic).not.toBe('');
      expect(step.readings.length, step.topic).toBeGreaterThanOrEqual(1);
      expect(step.readings.length, step.topic).toBeLessThanOrEqual(3);
    }
  });

  it('links each reading over https, and no URL twice in the whole file', () => {
    for (const { url } of allReadings) expect(new URL(url).protocol, url).toBe('https:');
    const seen = new Set<string>();
    const duplicates = allReadings.map((r) => r.url).filter((url) => seen.has(url) || !seen.add(url));
    expect(duplicates).toEqual([]);
  });

  it('gives every reading a title, source and license, and a positive whole reading time when it has one', () => {
    for (const r of allReadings) {
      expect(r.title.trim(), r.url).not.toBe('');
      expect(r.source.trim(), r.url).not.toBe('');
      expect(r.license.trim(), r.url).not.toBe('');
      if (r.minutes !== undefined) expect(Number.isInteger(r.minutes) && r.minutes > 0, r.url).toBe(true);
    }
  });
});
