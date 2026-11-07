/**
 * The NSB subject map: subject → topic → concept (proposal Section 3.1).
 *
 * Topic ids are "<subject>.<slug>" and concept ids "<topic id>.<slug>". Ids are stable: questions,
 * review cards and stats refer to them, so rename a topic's `name`, never its `id`.
 * Keyword rules that assign questions to topics live in src/core/tagging.ts.
 */
import type { CoreSubject } from './schema';

export interface ConceptDef {
  id: string;
  name: string;
}

export interface TopicDef {
  id: string;
  subject: CoreSubject;
  name: string;
  concepts: ConceptDef[];
}

const topic = (subject: CoreSubject, slug: string, name: string, concepts: Array<[string, string]> = []): TopicDef => ({
  id: `${subject}.${slug}`,
  subject,
  name,
  concepts: concepts.map(([c, n]) => ({ id: `${subject}.${slug}.${c}`, name: n })),
});

export const TOPICS: TopicDef[] = [
  topic('biology', 'cells-membranes', 'Cells and membranes'),
  topic('biology', 'biochemistry-metabolism', 'Biochemistry and metabolism'),
  topic('biology', 'molecular-biotech', 'Molecular biology and biotechnology'),
  topic('biology', 'genetics', 'Genetics'),
  topic('biology', 'evolution-classification', 'Evolution and classification'),
  topic('biology', 'ecology', 'Ecology'),
  topic('biology', 'animal-physiology', 'Animal physiology'),
  topic('biology', 'plant-biology', 'Plant biology'),
  topic('biology', 'microbiology-immunology', 'Microbiology and immunology'),
  topic('biology', 'development', 'Development'),
  topic('biology', 'organism-diversity', 'Organism diversity'),

  topic('chemistry', 'atomic-structure', 'Atomic structure'),
  topic('chemistry', 'periodic-trends', 'Periodic trends'),
  topic('chemistry', 'bonding-geometry', 'Bonding and geometry'),
  topic('chemistry', 'stoichiometry-solutions', 'Stoichiometry and solutions'),
  topic('chemistry', 'gases', 'Gases'),
  topic('chemistry', 'thermochemistry', 'Thermochemistry'),
  topic('chemistry', 'kinetics', 'Kinetics'),
  topic('chemistry', 'equilibrium', 'Equilibrium'),
  topic('chemistry', 'acids-bases', 'Acids and bases'),
  topic('chemistry', 'electrochemistry', 'Electrochemistry'),
  topic('chemistry', 'organic', 'Organic chemistry'),
  topic('chemistry', 'nuclear', 'Nuclear chemistry'),
  topic('chemistry', 'lab-descriptive', 'Lab and descriptive chemistry'),

  topic('physics', 'kinematics-forces', 'Kinematics and forces'),
  topic('physics', 'work-energy-momentum', 'Work, energy and momentum'),
  topic('physics', 'rotation-gravitation', 'Rotation and gravitation'),
  topic('physics', 'waves-sound', 'Oscillations, waves and sound'),
  topic('physics', 'optics', 'Optics'),
  topic('physics', 'thermodynamics', 'Thermodynamics'),
  topic('physics', 'electrostatics-circuits', 'Electrostatics and circuits'),
  topic('physics', 'magnetism-induction', 'Magnetism and induction'),
  topic('physics', 'fluids', 'Fluids'),
  topic('physics', 'relativity-quantum', 'Relativity and quantum'),
  topic('physics', 'nuclear-particle', 'Nuclear and particle physics'),

  topic('earth_space', 'minerals-rocks', 'Minerals and rocks'),
  topic('earth_space', 'tectonics-structure', 'Plate tectonics and structure'),
  topic('earth_space', 'earth-interior', "Earth's interior"),
  topic('earth_space', 'surface-hydrology', 'Surface processes and hydrology'),
  topic('earth_space', 'geologic-time-fossils', 'Geologic time and fossils'),
  topic('earth_space', 'meteorology-climate', 'Meteorology and climate'),
  topic('earth_space', 'oceanography', 'Oceanography'),
  topic('earth_space', 'solar-system', 'Solar system'),
  topic('earth_space', 'stars', 'Stars'),
  topic('earth_space', 'galaxies-cosmology', 'Galaxies and cosmology'),
  topic('earth_space', 'observational-astronomy', 'Observational astronomy'),

  topic('energy', 'conversion-efficiency', 'Energy conversion and efficiency'),
  topic('energy', 'fossil-fuels', 'Fossil fuels'),
  topic('energy', 'nuclear-energy', 'Nuclear fission and fusion'),
  topic('energy', 'solar', 'Solar'),
  topic('energy', 'renewables', 'Wind, hydro, geothermal and biomass'),
  topic('energy', 'storage-hydrogen', 'Storage, batteries and hydrogen'),
  topic('energy', 'grid-transmission', 'Grid and transmission'),
  topic('energy', 'data-units', 'Energy data and units'),
  topic('energy', 'doe-labs', 'DOE labs, facilities and research programs'),

  topic('math', 'arithmetic', 'Mental arithmetic'),
  topic('math', 'algebra', 'Algebra'),
  topic('math', 'geometry', 'Plane and solid geometry'),
  topic('math', 'trigonometry', 'Trigonometry'),
  topic('math', 'sequences-logs', 'Sequences, series and logarithms'),
  topic('math', 'vectors-matrices-complex', 'Vectors, matrices and complex numbers'),
  topic('math', 'calculus', 'Calculus'),
  topic('math', 'probability-combinatorics', 'Probability and combinatorics'),
  topic('math', 'statistics', 'Statistics'),
  topic('math', 'number-theory', 'Number theory'),
];

const BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

export function topicById(id: string | undefined): TopicDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function topicsForSubject(subject: CoreSubject): TopicDef[] {
  return TOPICS.filter((t) => t.subject === subject);
}

export function topicName(id: string | undefined): string {
  return topicById(id)?.name ?? 'Other';
}
