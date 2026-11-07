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
  topic('biology', 'biochemistry-metabolism', 'Biochemistry and metabolism', [
    ['carbohydrates', 'Carbohydrates'],
    ['lipids', 'Lipids'],
    ['amino-acids-proteins', 'Amino acids and protein structure'],
    ['enzymes', 'Enzymes and their regulation'],
    ['glycolysis-fermentation', 'Glycolysis and fermentation'],
    ['krebs-oxidative-phosphorylation', 'Krebs cycle and oxidative phosphorylation'],
    ['light-reactions', 'Light reactions of photosynthesis'],
    ['calvin-cycle', 'Calvin cycle and carbon fixation'],
    ['atp-bioenergetics', 'ATP and bioenergetics'],
    ['vitamins-cofactors', 'Vitamins and cofactors'],
  ]),
  topic('biology', 'molecular-biotech', 'Molecular biology and biotechnology'),
  topic('biology', 'genetics', 'Genetics'),
  topic('biology', 'evolution-classification', 'Evolution and classification'),
  topic('biology', 'ecology', 'Ecology'),
  topic('biology', 'animal-physiology', 'Animal physiology', [
    ['nervous-system', 'Neurons and the nervous system'],
    ['endocrine', 'Hormones and the endocrine system'],
    ['circulation', 'Heart, blood and circulation'],
    ['respiration', 'Lungs and gas exchange'],
    ['digestion', 'Digestion and nutrition'],
    ['excretion', 'Kidneys and osmoregulation'],
    ['muscles-skeleton', 'Muscles, bones and joints'],
    ['senses', 'Sense organs'],
    ['reproduction', 'Reproductive physiology'],
    ['homeostasis', 'Homeostasis and thermoregulation'],
    ['tissues-disease', 'Tissues, skin and human disease'],
  ]),
  topic('biology', 'plant-biology', 'Plant biology'),
  topic('biology', 'microbiology-immunology', 'Microbiology and immunology'),
  topic('biology', 'development', 'Development'),
  topic('biology', 'organism-diversity', 'Organism diversity', [
    ['sponges-cnidarians', 'Sponges and cnidarians'],
    ['worms', 'Flatworms, roundworms and annelids'],
    ['mollusks', 'Mollusks'],
    ['arthropods', 'Arthropods and insects'],
    ['echinoderms-chordates', 'Echinoderms and invertebrate chordates'],
    ['fishes', 'Fishes'],
    ['amphibians-reptiles', 'Amphibians and reptiles'],
    ['birds', 'Birds'],
    ['mammals', 'Mammals'],
    ['fungi', 'Fungi and lichens'],
    ['protists-algae', 'Protists and algae'],
    ['body-plans', 'Symmetry, body cavities and body plans'],
  ]),

  topic('chemistry', 'atomic-structure', 'Atomic structure'),
  topic('chemistry', 'periodic-trends', 'Periodic trends'),
  topic('chemistry', 'bonding-geometry', 'Bonding and geometry', [
    ['lewis-structures', 'Lewis structures, octets and formal charge'],
    ['vsepr', 'VSEPR and molecular geometry'],
    ['hybridization', 'Hybridization and sigma and pi bonds'],
    ['polarity', 'Bond and molecular polarity'],
    ['intermolecular-forces', 'Intermolecular forces'],
    ['ionic-metallic', 'Ionic and metallic bonding'],
    ['molecular-orbitals', 'Molecular orbitals and bond order'],
    ['solids-crystals', 'Crystal structures and solids'],
    ['coordination', 'Coordination compounds'],
  ]),
  topic('chemistry', 'stoichiometry-solutions', 'Stoichiometry and solutions'),
  topic('chemistry', 'gases', 'Gases'),
  topic('chemistry', 'thermochemistry', 'Thermochemistry'),
  topic('chemistry', 'kinetics', 'Kinetics'),
  topic('chemistry', 'equilibrium', 'Equilibrium'),
  topic('chemistry', 'acids-bases', 'Acids and bases'),
  topic('chemistry', 'electrochemistry', 'Electrochemistry'),
  topic('chemistry', 'organic', 'Organic chemistry', [
    ['hydrocarbons', 'Alkanes, alkenes and alkynes'],
    ['aromatics', 'Aromatic compounds'],
    ['functional-groups', 'Functional groups'],
    ['nomenclature', 'Naming organic compounds'],
    ['isomers-stereochemistry', 'Isomers and stereochemistry'],
    ['substitution-elimination', 'Substitution and elimination reactions'],
    ['addition-named-reactions', 'Addition and named reactions'],
    ['polymers', 'Polymers'],
    ['biomolecules', 'Biomolecules'],
    ['identification-tests', 'Identification tests and spectra'],
  ]),
  topic('chemistry', 'nuclear', 'Nuclear chemistry'),
  topic('chemistry', 'lab-descriptive', 'Lab and descriptive chemistry'),

  topic('physics', 'kinematics-forces', 'Kinematics and forces', [
    ['one-dimensional-motion', 'Motion in one dimension'],
    ['projectiles', 'Projectile motion'],
    ['vectors-relative-motion', 'Vectors and relative motion'],
    ['newtons-laws', "Newton's laws"],
    ['friction', 'Friction'],
    ['inclines-tension', 'Inclines, pulleys and tension'],
    ['statics', 'Static equilibrium'],
    ['elasticity-materials', 'Elasticity and materials'],
  ]),
  topic('physics', 'work-energy-momentum', 'Work, energy and momentum'),
  topic('physics', 'rotation-gravitation', 'Rotation and gravitation'),
  topic('physics', 'waves-sound', 'Oscillations, waves and sound'),
  topic('physics', 'optics', 'Optics'),
  topic('physics', 'thermodynamics', 'Thermodynamics'),
  topic('physics', 'electrostatics-circuits', 'Electrostatics and circuits', [
    ['charge-coulomb', "Charge and Coulomb's law"],
    ['electric-fields', "Electric fields and Gauss's law"],
    ['potential', 'Electric potential and potential energy'],
    ['capacitors', 'Capacitors and dielectrics'],
    ['current-resistance', "Current, resistance and Ohm's law"],
    ['series-parallel', 'Series and parallel circuits'],
    ['electric-power', 'Electric power and energy'],
    ['rc-ac-circuits', 'RC and AC circuits'],
    ['instruments-components', 'Meters, batteries and circuit components'],
  ]),
  topic('physics', 'magnetism-induction', 'Magnetism and induction'),
  topic('physics', 'fluids', 'Fluids'),
  topic('physics', 'relativity-quantum', 'Relativity and quantum'),
  topic('physics', 'nuclear-particle', 'Nuclear and particle physics'),

  topic('earth_space', 'minerals-rocks', 'Minerals and rocks', [
    ['mineral-identification', 'Mineral identification'],
    ['silicates', 'Silicate minerals'],
    ['non-silicates', 'Carbonates, oxides and other non-silicates'],
    ['igneous', 'Igneous rocks'],
    ['sedimentary', 'Sedimentary rocks'],
    ['metamorphic', 'Metamorphic rocks'],
    ['rock-cycle', 'The rock cycle'],
    ['crystals', 'Crystal systems and structure'],
    ['ores-gems', 'Ores and gems'],
  ]),
  topic('earth_space', 'tectonics-structure', 'Plate tectonics and structure'),
  topic('earth_space', 'earth-interior', "Earth's interior"),
  topic('earth_space', 'surface-hydrology', 'Surface processes and hydrology'),
  topic('earth_space', 'geologic-time-fossils', 'Geologic time and fossils'),
  topic('earth_space', 'meteorology-climate', 'Meteorology and climate', [
    ['atmosphere-structure', 'Layers and composition of the atmosphere'],
    ['clouds-precipitation', 'Clouds and precipitation'],
    ['humidity-stability', 'Humidity, lapse rates and stability'],
    ['air-masses-fronts', 'Air masses and fronts'],
    ['severe-weather', 'Thunderstorms, tornadoes and hurricanes'],
    ['winds-circulation', 'Winds and global circulation'],
    ['greenhouse-climate-change', 'Greenhouse effect and climate change'],
    ['climate-zones', 'Climate zones and classification'],
    ['enso', 'El Niño and climate oscillations'],
    ['instruments-forecasting', 'Weather instruments and forecasting'],
    ['paleoclimate', 'Ice ages and past climates'],
  ]),
  topic('earth_space', 'oceanography', 'Oceanography'),
  topic('earth_space', 'solar-system', 'Solar system', [
    ['terrestrial-planets', 'Terrestrial planets'],
    ['giant-planets', 'Giant planets and rings'],
    ['moons', 'Moons of the planets'],
    ['earth-moon', "Earth's Moon, phases and eclipses"],
    ['small-bodies', 'Asteroids, comets and meteors'],
    ['dwarf-planets', 'Pluto and dwarf planets'],
    ['orbits', "Orbits and Kepler's laws"],
    ['formation', 'Formation of the solar system'],
    ['missions', 'Space missions'],
    ['seasons', "Seasons and Earth's motions"],
    ['magnetospheres', 'Magnetospheres and aurorae'],
  ]),
  topic('earth_space', 'stars', 'Stars'),
  topic('earth_space', 'galaxies-cosmology', 'Galaxies and cosmology'),
  topic('earth_space', 'observational-astronomy', 'Observational astronomy'),

  topic('energy', 'conversion-efficiency', 'Energy conversion and efficiency'),
  topic('energy', 'fossil-fuels', 'Fossil fuels', [
    ['coal', 'Coal'],
    ['petroleum-refining', 'Crude oil and refining'],
    ['natural-gas', 'Natural gas and methane hydrates'],
    ['unconventional', 'Fracking, shale and oil sands'],
    ['formation-reservoirs', 'Formation, reservoirs and extraction'],
    ['fuel-properties', 'Gasoline, diesel and fuel properties'],
    ['emissions-control', 'Emissions and pollution control'],
    ['carbon-capture', 'Carbon capture and sequestration'],
  ]),
  topic('energy', 'nuclear-energy', 'Nuclear fission and fusion'),
  topic('energy', 'solar', 'Solar'),
  topic('energy', 'renewables', 'Wind, hydro, geothermal and biomass'),
  topic('energy', 'storage-hydrogen', 'Storage, batteries and hydrogen'),
  topic('energy', 'grid-transmission', 'Grid and transmission'),
  topic('energy', 'data-units', 'Energy data and units'),
  topic('energy', 'doe-labs', 'DOE labs, facilities and research programs', [
    ['particle-nuclear', 'Particle and nuclear physics research'],
    ['materials', 'Materials and condensed matter research'],
    ['chemistry-catalysis', 'Chemistry and catalysis research'],
    ['biology-genomics', 'Biology, genomics and bioenergy research'],
    ['earth-environment', 'Earth, environment and climate research'],
    ['astrophysics-cosmology', 'Astrophysics and cosmology research'],
    ['fusion-plasma', 'Fusion and plasma research'],
    ['computing', 'Supercomputing and quantum computing'],
    ['light-neutron-sources', 'Light sources, neutron sources and accelerators'],
    ['labs-history', 'The national labs and their history'],
  ]),

  topic('math', 'arithmetic', 'Mental arithmetic'),
  topic('math', 'algebra', 'Algebra', [
    ['linear-equations', 'Linear equations and systems'],
    ['lines-slope', 'Lines, slopes and intercepts'],
    ['quadratics', 'Quadratics'],
    ['polynomials', 'Polynomials and their roots'],
    ['factoring-simplifying', 'Factoring and simplifying expressions'],
    ['inequalities-absolute-value', 'Inequalities and absolute value'],
    ['functions', 'Functions, composition and inverses'],
    ['rational-functions', 'Rational functions and asymptotes'],
    ['exponents-radicals', 'Exponents and radicals'],
    ['word-problems', 'Word problems'],
    ['graph-transformations', 'Graph transformations and symmetry'],
  ]),
  topic('math', 'geometry', 'Plane and solid geometry', [
    ['triangles', 'Triangles and the Pythagorean theorem'],
    ['similarity-congruence', 'Similarity and congruence'],
    ['circles', 'Circles, arcs and chords'],
    ['polygons', 'Polygons and their angles'],
    ['area-perimeter', 'Area and perimeter'],
    ['solids', 'Volume and surface area of solids'],
    ['coordinate-geometry', 'Coordinate geometry'],
    ['transformations', 'Transformations'],
    ['conics', 'Conic sections'],
    ['angles-lines', 'Angles and parallel lines'],
  ]),
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
