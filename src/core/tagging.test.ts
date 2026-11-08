/**
 * Tests for the rule-based topic tagger (src/core/tagging.ts):
 *  - real DOE questions (short ones, none of them in the labelled samples) for every subject,
 *    Energy cross-subjects and concepts;
 *  - the rule engine (term syntax, text normalization) and the rule tables against the taxonomy;
 *  - the generated library, skipped if it has not been built: coverage, accuracy on the hand-labelled
 *    sample in scripts/doe/topic-eval.json, the data matching the current rules, and catalog.json.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_SUBJECTS, type Catalog, type CoreSubject, type LibraryIndex, type Question, type QuestionSet, type Subject } from './schema';
import { compileTerm, explainTopics, MAX_CONCEPTS, MIN_TOPIC_SCORE, normalizeText, ruleIds, tagQuestion, type TaggableQuestion } from './tagging';
import { TOPICS, topicById, topicsForSubject } from './taxonomy';

type Choices = [w: string, x: string, y: string, z: string];

function question(subject: Subject, stem: string, answer: string, choices?: Choices): TaggableQuestion {
  return {
    subject,
    stem,
    answer,
    accept: [],
    kind: 'tossup',
    ...(choices ? { choices: { W: choices[0], X: choices[1], Y: choices[2], Z: choices[3] } } : {}),
  };
}

/** Real DOE questions by subject: [stem, answer, expected topic, choices?]. */
const EXAMPLES: Record<CoreSubject, [string, string, string, Choices?][]> = {
  biology: [
    ['What enzyme, found in the human stomach, is activated by hydrochloric acid and breaks down proteins?', 'PEPSIN', 'animal-physiology'],
    ['What type of RNA carries amino acids to the ribosomes?', 'tRNA', 'molecular-biotech'],
    ['A plant that is heterozygous [hetero-ZYE-gus] for flower color is self-pollinated. What percentage of the offspring will be true-breeding?', '50', 'genetics'],
    ['To which phylum [FYE-lum] do sea urchins belong?', 'ECHINODERMATA', 'organism-diversity'],
    ['Secondary xylem [ZYE-lum] is derived from what specific meristem tissue?', 'VASCULAR CAMBIUM', 'plant-biology'],
    ['What type of white blood cell differentiates to form antibody secreting cells and memory cells?', 'B LYMPHOCYTE', 'microbiology-immunology'],
  ],
  chemistry: [
    ['What principle states that two electrons cannot have the same quantum numbers?', 'PAULI EXCLUSION PRINCIPLE', 'atomic-structure'],
    ['What class of organic molecules has the formula R-COOH and can react with alcohols to produce esters?', 'CARBOXYLIC ACID', 'organic'],
    ['What is the chemical formula for the conjugate base of HNO₂?', 'NO₂⁻', 'acids-bases'],
    ['In general, what is the name for each individual step in a mechanism?', 'ELEMENTARY REACTION', 'kinetics'],
  ],
  earth_space: [
    ['The Moho separates what two compositional layers of the Earth?', 'CRUST AND MANTLE', 'earth-interior'],
    ['What is the term for areas of the ocean floor that are relatively flat and found 5 to 6 kilometers below sea level?', 'ABYSSAL PLAINS', 'oceanography'],
    ['Saturn’s rings are mostly composed of which of the following materials?', 'ICE', 'solar-system', ['Ice', 'Silicates', 'Carbonates', 'Iron']],
    ['Which of the following is a cloud type that, by definition, produces precipitation?', 'NIMBOSTRATUS', 'meteorology-climate', ['Stratocumulus', 'Altostratus', 'Nimbostratus', 'Altocumulus']],
  ],
  energy: [
    ['What are the coolant and the moderator, respectively, in pressurized heavy water reactors?', 'HEAVY WATER AND HEAVY WATER', 'nuclear-energy'],
    ['What is the most commonly used material for the anode in commercial lithium-ion batteries?', 'GRAPHITE', 'storage-hydrogen'],
    ['What refinery process is used to separate components of petroleum based on their boiling points?', 'DISTILLATION', 'fossil-fuels'],
    [
      'Which of the following policies allows users with renewable energy sources to sell excess electricity generated to the utility grid and receive compensation?',
      'NET METERING AGREEMENT',
      'grid-transmission',
      ['Renewable portfolio standard', 'Feed-in tariff', 'Net metering agreement', 'Production tax credit'],
    ],
    ['Scientists at Argonne National Lab are studying a quasiparticle that is the collective excitation of electron spin in a lattice. What is the term for this quasiparticle?', 'MAGNON', 'doe-labs'],
  ],
  math: [
    ['What is the discriminant of the quadratic function y = x² – 6x + 7?', '8', 'algebra'],
    ['What is the area of a triangle with sides of length 17, 12, and 11?', '12√30', 'geometry'],
    ['In degrees, what is the least positive angle that is coterminal with 650°?', '290°', 'trigonometry'],
    ['What is the sum from n = 1 to 6 of 3n²?', '273', 'sequences-logs'],
    ['What is the sum of the two vectors 8i + 3j and –6i – 7j?', '2i – 4j', 'vectors-matrices-complex'],
    ['What is the limit as x approaches 0 of the fraction with numerator x + sine x and denominator e to the x power minus 1?', '2', 'calculus'],
    ['If two 6-sided fair dice are rolled, providing your answer as a fraction in lowest terms, what is the probability that both numbers will be even?', '1/4', 'probability-combinatorics'],
    ['A set of test scores is normally distributed with mean 72 and standard deviation 6. What score corresponds to a Z-score of –1.5?', '63', 'statistics'],
    ['In the integers mod 12, what is 7 times 11?', '5', 'number-theory'],
  ],
  physics: [
    ['What force carrying particle holds quarks together inside of hadrons?', 'GLUONS', 'nuclear-particle'],
    ['A circuit contains a 6-volt battery and a 2-ohm resistor. What is the power, in watts, of this circuit?', '18', 'electrostatics-circuits'],
    ['What is the name of the principle that states that an object, partly or completely, submerged in a fluid will experience a buoyant force equal to the weight of the fluid it displaces?', 'ARCHIMEDES', 'fluids'],
    ['What law states that a planetary orbit sweeps out area around its star at a constant rate?', 'KEPLER’S SECOND LAW', 'rotation-gravitation'],
  ],
};

describe('tagQuestion: topics', () => {
  for (const subject of CORE_SUBJECTS) {
    it.each(EXAMPLES[subject])(`${subject}: %s`, (stem, answer, slug, choices) => {
      const result = tagQuestion(question(subject, stem, answer, choices));
      expect(result.topic).toBe(`${subject}.${slug}`);
      expect(result.score).toBeGreaterThanOrEqual(MIN_TOPIC_SCORE);
    });
  }

  it('only returns topics of the question’s own subject', () => {
    for (const subject of CORE_SUBJECTS) {
      for (const [stem, answer, , choices] of Object.values(EXAMPLES).flat()) {
        const topic = tagQuestion(question(subject, stem, answer, choices)).topic;
        if (topic) expect(topicById(topic)?.subject).toBe(subject);
      }
    }
  });

  it('gives legacy subjects no topic, concepts or cross-subject', () => {
    const result = tagQuestion(question('general_science', 'What enzyme, found in the human stomach, breaks down proteins?', 'PEPSIN'));
    expect(result).toEqual({ concepts: [], score: 0 });
  });

  it('leaves a question untagged rather than guessing', () => {
    const offMap: [Subject, string, string, Choices?][] = [
      ['physics', 'Name the two things that together constitute about 95% of the universe.', 'DARK MATTER AND DARK ENERGY'],
      ['energy', 'Which acidic compound is the major product of fermentation in skeletal muscle?', 'LACTIC ACID'],
      ['math', 'Which of the following is the contrapositive of the conditional statement: If p, then q?', 'IF NOT Q, THEN NOT P',
        ['If q, then p', 'If not p, then q', 'If not p, then not q', 'If not q, then not p']],
    ];
    for (const [subject, stem, answer, choices] of offMap) {
      const result = tagQuestion(question(subject, stem, answer, choices));
      expect(result.topic).toBeUndefined();
      expect(result.concepts).toEqual([]);
      expect(result.score).toBeLessThan(MIN_TOPIC_SCORE);
    }
  });

  it('is deterministic', () => {
    const q = question('chemistry', 'What is the chemical formula for the conjugate base of HNO₂?', 'NO₂⁻');
    expect(tagQuestion(q)).toEqual(tagQuestion(q));
  });
});

describe('tagQuestion: Energy cross-subjects', () => {
  const energy = (stem: string, answer: string, choices?: Choices) => tagQuestion(question('energy', stem, answer, choices)).crossSubject;

  it('recognises calculations as math', () => {
    expect(
      energy(
        'A water heater uses 4 kilowatts of electricity for 8 hours. To the nearest cent, how much does it cost to operate if the cost of electricity in your area is 10 cents per kilowatt-hour?',
        '$3.20',
      ),
    ).toBe('math');
  });

  it('recognises chemistry, physics, biology and earth and space', () => {
    expect(
      energy(
        'Researchers at Argonne National Lab are modeling the properties of hafnia, which has chemical formula HfO₂. In this compound, what is the oxidation state of hafnium [HALF-nee-um]?',
        '+4',
      ),
    ).toBe('chemistry');
    expect(
      energy('Scientists at Argonne National Lab are studying a quasiparticle that is the collective excitation of electron spin in a lattice. What is the term for this quasiparticle?', 'MAGNON'),
    ).toBe('physics');
    expect(
      energy('Scientists supported by the Department of Energy are studying the enzyme hexokinase [hexo-KYE-nayse]. This enzyme catalyzes the first step of what respiration pathway?', 'GLYCOLYSIS'),
    ).toBe('biology');
    expect(
      energy(
        'Scientists at Argonne National Lab are studying supernova nucleosynthesis. Which of the following elements on Earth primarily originates from supernova nucleosynthesis?',
        'ARSENIC',
        ['Hydrogen', 'Helium', 'Carbon', 'Arsenic'],
      ),
    ).toBe('earth_space');
  });

  it('leaves the cross-subject unset when no discipline stands out', () => {
    expect(
      energy(
        'Which of the following policies allows users with renewable energy sources to sell excess electricity generated to the utility grid and receive compensation?',
        'NET METERING AGREEMENT',
        ['Renewable portfolio standard', 'Feed-in tariff', 'Net metering agreement', 'Production tax credit'],
      ),
    ).toBeUndefined();
  });

  it('never sets a cross-subject outside Energy', () => {
    expect(tagQuestion(question('chemistry', 'What is the chemical formula for the conjugate base of HNO₂?', 'NO₂⁻')).crossSubject).toBeUndefined();
  });
});

describe('tagQuestion: concepts', () => {
  const concepts = (subject: Subject, stem: string, answer: string, choices?: Choices) => tagQuestion(question(subject, stem, answer, choices)).concepts;

  it('assigns concepts of the most frequent topics', () => {
    expect(concepts('biology', 'What enzyme, found in the human stomach, is activated by hydrochloric acid and breaks down proteins?', 'PEPSIN')).toContain(
      'biology.animal-physiology.digestion',
    );
    expect(concepts('biology', 'To which phylum [FYE-lum] do sea urchins belong?', 'ECHINODERMATA')).toEqual(['biology.organism-diversity.echinoderms-chordates']);
    expect(concepts('chemistry', 'What class of organic molecules has the formula R-COOH and can react with alcohols to produce esters?', 'CARBOXYLIC ACID')).toContain(
      'chemistry.organic.functional-groups',
    );
    expect(concepts('energy', 'What refinery process is used to separate components of petroleum based on their boiling points?', 'DISTILLATION')).toEqual([
      'energy.fossil-fuels.petroleum-refining',
    ]);
    expect(
      concepts('earth_space', 'Which of the following is a cloud type that, by definition, produces precipitation?', 'NIMBOSTRATUS', [
        'Stratocumulus',
        'Altostratus',
        'Nimbostratus',
        'Altocumulus',
      ]),
    ).toContain('earth_space.meteorology-climate.clouds-precipitation');
    expect(concepts('math', 'What is the discriminant of the quadratic function y = x² – 6x + 7?', '8')).toContain('math.algebra.quadratics');
    expect(concepts('math', 'What is the area of a triangle with sides of length 17, 12, and 11?', '12√30')).toEqual(
      expect.arrayContaining(['math.geometry.triangles', 'math.geometry.area-perimeter']),
    );
    expect(concepts('physics', 'A circuit contains a 6-volt battery and a 2-ohm resistor. What is the power, in watts, of this circuit?', '18')).toContain(
      'physics.electrostatics-circuits.electric-power',
    );
  });

  it('gives no concepts to topics without a concept list', () => {
    expect(concepts('chemistry', 'What principle states that two electrons cannot have the same quantum numbers?', 'PAULI EXCLUSION PRINCIPLE')).toEqual([]);
  });

  it('only gives concepts of the question’s topic, at most MAX_CONCEPTS of them', () => {
    for (const [subject, list] of Object.entries(EXAMPLES) as [CoreSubject, [string, string, string, Choices?][]][]) {
      for (const [stem, answer, , choices] of list) {
        const result = tagQuestion(question(subject, stem, answer, choices));
        expect(result.concepts.length).toBeLessThanOrEqual(MAX_CONCEPTS);
        const known = new Set(topicById(result.topic)?.concepts.map((c) => c.id) ?? []);
        for (const c of result.concepts) expect(known.has(c)).toBe(true);
      }
    }
  });
});

describe('rule engine', () => {
  it('matches whole words, plurals and the documented wildcards', () => {
    expect(compileTerm('allele').test('two alleles')).toBe(true);
    expect(compileTerm('ovary').test('the ovaries')).toBe(true);
    expect(compileTerm('ion').test('ionization energy')).toBe(false);
    expect(compileTerm('cell cycle').test('the cell-cycle checkpoint')).toBe(true);
    expect(compileTerm('photosynth*').test('photosynthetic bacteria')).toBe(true);
    expect(compileTerm('*optera').test('lepidoptera')).toBe(true);
    expect(compileTerm("newton's second law").test('newtons second law')).toBe(true);
  });

  it('normalizes text: case, pronunciations, superscripts, subscripts and dashes', () => {
    expect(normalizeText('A mutation that produces a dominant allele [ah-LEEL]')).toBe('a mutation that produces a dominant allele  ');
    expect(normalizeText('[f of x equals x squared]')).toContain('f of x equals x squared');
    expect(normalizeText('x² + 10⁻⁷ CO₂ – Schrödinger')).toBe('x^2 + 10^-7 co2 - schrodinger');
  });

  it('counts a term found only in the distractors at half weight', () => {
    const [best] = explainTopics(question('biology', 'Which of the following is correct?', 'NONE OF THESE', ['Xylem', 'Phloem', 'Stomata', 'None of these']));
    expect(best.id).toBe('biology.plant-biology');
    expect(best.terms.every((t) => t.endsWith('(choice)'))).toBe(true);
    expect(best.score).toBe(4.5);
  });

  it('has rules for every topic and concept in the taxonomy, and nothing else', () => {
    const ids = ruleIds();
    expect(ids.topics.sort()).toEqual(TOPICS.map((t) => t.id).sort());
    expect(ids.concepts.sort()).toEqual(TOPICS.flatMap((t) => t.concepts.map((c) => c.id)).sort());
    for (const subject of CORE_SUBJECTS) {
      expect(explainTopics(question(subject, 'x', 'y')).map((t) => t.id).sort()).toEqual(topicsForSubject(subject).map((t) => t.id).sort());
    }
  });

  it('keeps concept lists between 6 and 15 concepts', () => {
    for (const t of TOPICS.filter((x) => x.concepts.length)) {
      expect(t.concepts.length).toBeGreaterThanOrEqual(6);
      expect(t.concepts.length).toBeLessThanOrEqual(15);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The generated library                                               */
/* ------------------------------------------------------------------ */

const dir = join(process.cwd(), 'public/data/doe');
const evalFile = join(process.cwd(), 'scripts/doe/topic-eval.json');
const built = existsSync(join(dir, 'index.json')) && existsSync(join(dir, 'catalog.json'));

interface TopicLabel {
  id: string;
  topic: string;
  crossSubject?: string;
  sample?: string;
}

describe.skipIf(!built)('topics in the generated library', () => {
  const index = built ? (JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as LibraryIndex) : { generatedAt: '', sets: [] };
  const sets = index.sets.map((s) => JSON.parse(readFileSync(join(dir, s.file), 'utf8')) as QuestionSet);
  const rows = sets.flatMap((set) => set.rounds.flatMap((r) => r.pairs.flatMap((p) => (p.bonus ? [p.tossup, p.bonus] : [p.tossup])).map((q) => ({ q, round: r.order }))));
  const questions: Question[] = rows.map((r) => r.q);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const core = questions.filter((q) => (CORE_SUBJECTS as Subject[]).includes(q.subject));

  it('gives at least 90% of core-subject questions a topic', () => {
    const coverage = core.filter((q) => q.topic).length / core.length;
    console.log(`topic coverage: ${(100 * coverage).toFixed(1)}% of ${core.length} core-subject questions`);
    expect(coverage).toBeGreaterThanOrEqual(0.9);
  });

  it('is at least 85% accurate on the hand-labelled sample', () => {
    const labels = JSON.parse(readFileSync(evalFile, 'utf8')) as TopicLabel[];
    const main = labels.filter((l) => !l.sample);
    expect(main.length).toBeGreaterThanOrEqual(150);
    const accuracy = (group: TopicLabel[]) => group.filter((l) => (byId.get(l.id)?.topic ?? 'none') === l.topic).length / group.length;
    for (const l of labels) {
      expect(byId.has(l.id), `${l.id} is in the library`).toBe(true);
      expect(l.topic === 'none' || topicById(l.topic)?.subject === byId.get(l.id)?.subject, `${l.id} label fits its subject`).toBe(true);
    }
    for (const sample of [...new Set(labels.map((l) => l.sample))]) {
      const group = labels.filter((l) => l.sample === sample);
      console.log(`accuracy on ${sample ?? 'main'} sample: ${(100 * accuracy(group)).toFixed(1)}% of ${group.length}`);
    }
    expect(accuracy(main)).toBeGreaterThanOrEqual(0.85);
  });

  it('stores tags that match the current rules (rebuild with npm run data:build after editing them)', () => {
    const stale: string[] = [];
    for (const q of questions) {
      const t = tagQuestion(q);
      const same = q.topic === t.topic && JSON.stringify(q.concepts ?? []) === JSON.stringify(t.concepts) && q.crossSubject === t.crossSubject;
      if (!same) stale.push(q.id);
    }
    expect(stale.slice(0, 10)).toEqual([]);
  });

  it('keeps topics, concepts and cross-subjects consistent', () => {
    for (const q of questions) {
      if (q.topic) expect(topicById(q.topic)?.subject).toBe(q.subject);
      if (!(CORE_SUBJECTS as Subject[]).includes(q.subject)) expect(q.topic).toBeUndefined();
      if (q.concepts) {
        expect(q.concepts.length).toBeGreaterThan(0);
        for (const c of q.concepts) expect(c.startsWith(`${q.topic}.`)).toBe(true);
      }
      if (q.crossSubject) expect(q.subject).toBe('energy');
    }
  });

  it('writes a catalog row for every question in library order', () => {
    const raw = readFileSync(join(dir, 'catalog.json'), 'utf8');
    const catalog = JSON.parse(raw) as Catalog;
    // catalog.json covers the high school sets only (middle school: catalog-ms.json, checked in src/core/importers/doe-library.test.ts).
    const hs = new Set(index.sets.filter((s) => s.level === 'HS').map((s) => s.id));
    const hsRows = rows.filter(({ q }) => hs.has(q.source.setId));
    expect(raw.trimEnd()).not.toContain('\n');
    expect(catalog.generatedAt).toBe(index.generatedAt);
    expect(catalog.questions).toEqual(
      hsRows.map(({ q, round }) => [q.id, q.subject, q.topic ?? '', q.kind === 'tossup' ? 't' : 'b', round, q.crossSubject ?? '']),
    );
    expect(Object.keys(catalog.topicCounts)).toEqual(TOPICS.map((t) => t.id));
    for (const t of TOPICS) expect(catalog.topicCounts[t.id]).toBe(hsRows.filter(({ q }) => q.topic === t.id).length);
  });
});
