/**
 * Reading paths (proposal Section 4.1): for each subject, its topics in prerequisite order. Each step says what to
 * master for NSB and links one to three free readings, the most useful first; the site draws the short retrieval
 * check after each reading from library questions tagged with the step's topic.
 *
 * Licenses are as each source states them: every OpenStax book used here now gives CC BY-NC-SA 4.0 (not CC BY),
 * Physical Geology, 2nd ed. (Steven Earle, BCcampus) is CC BY 4.0, and the EIA, DOE, NOAA and USGS pages are U.S.
 * government works in the public domain.
 *
 * Every URL was fetched in November 2026 and checked for its title and topic, except the Physical Geology sections:
 * opentextbc.ca answers scripts with a bot check, so those were matched by title in a search index instead.
 * `minutes` is a rough reading time (about 170 words a minute, end-of-section exercises left out).
 */
import type { CoreSubject } from './schema';

export interface Reading {
  /** e.g. "10.2 The Cell Cycle" */
  title: string;
  /** e.g. "OpenStax Biology 2e", "NOAA JetStream", "EIA Energy Explained" */
  source: string;
  /** https, section-level where the source has sections */
  url: string;
  /** e.g. "CC BY 4.0", "CC BY-NC-SA 4.0", "Public domain (U.S. government work)" */
  license: string;
  /** Rough reading time. */
  minutes?: number;
}

export interface ReadingStep {
  /** A topic id from src/core/taxonomy.ts, e.g. "biology.genetics". */
  topic: string;
  /** One or two sentences: what to master for NSB in this topic. */
  focus: string;
  /** One to three readings, the most useful first. */
  readings: Reading[];
}

export interface ReadingPath {
  subject: CoreSubject;
  intro: string;
  steps: ReadingStep[];
}

const OPENSTAX = 'CC BY-NC-SA 4.0';
const CC_BY = 'CC BY 4.0';
const PUBLIC_DOMAIN = 'Public domain (U.S. government work)';

interface Source {
  name: string;
  license: string;
}

const BIOLOGY_2E: Source = { name: 'OpenStax Biology 2e', license: OPENSTAX };
const CONCEPTS_OF_BIOLOGY: Source = { name: 'OpenStax Concepts of Biology', license: OPENSTAX };
const MICROBIOLOGY: Source = { name: 'OpenStax Microbiology', license: OPENSTAX };
const ANATOMY_AND_PHYSIOLOGY_2E: Source = { name: 'OpenStax Anatomy and Physiology 2e', license: OPENSTAX };
const CHEMISTRY_2E: Source = { name: 'OpenStax Chemistry 2e', license: OPENSTAX };
const UNIVERSITY_PHYSICS_1: Source = { name: 'OpenStax University Physics Volume 1', license: OPENSTAX };
const UNIVERSITY_PHYSICS_2: Source = { name: 'OpenStax University Physics Volume 2', license: OPENSTAX };
const UNIVERSITY_PHYSICS_3: Source = { name: 'OpenStax University Physics Volume 3', license: OPENSTAX };
const COLLEGE_PHYSICS_2E: Source = { name: 'OpenStax College Physics 2e', license: OPENSTAX };
const ASTRONOMY_2E: Source = { name: 'OpenStax Astronomy 2e', license: OPENSTAX };
const PREALGEBRA_2E: Source = { name: 'OpenStax Prealgebra 2e', license: OPENSTAX };
const CONTEMPORARY_MATHEMATICS: Source = { name: 'OpenStax Contemporary Mathematics', license: OPENSTAX };
const PRECALCULUS_2E: Source = { name: 'OpenStax Precalculus 2e', license: OPENSTAX };
const CALCULUS_1: Source = { name: 'OpenStax Calculus Volume 1', license: OPENSTAX };
const CALCULUS_3: Source = { name: 'OpenStax Calculus Volume 3', license: OPENSTAX };
const STATISTICS_2E: Source = { name: 'OpenStax Introductory Statistics 2e', license: OPENSTAX };
const PHYSICAL_GEOLOGY: Source = { name: 'Physical Geology 2nd ed. (Steven Earle, BCcampus)', license: CC_BY };
const JETSTREAM: Source = { name: 'NOAA JetStream', license: PUBLIC_DOMAIN };
const DYNAMIC_EARTH: Source = { name: 'USGS This Dynamic Earth', license: PUBLIC_DOMAIN };
const WATER_SCIENCE_SCHOOL: Source = { name: 'USGS Water Science School', license: PUBLIC_DOMAIN };
const EIA: Source = { name: 'EIA Energy Explained', license: PUBLIC_DOMAIN };
const DOE: Source = { name: 'U.S. Department of Energy', license: PUBLIC_DOMAIN };
const DOE_EXPLAINS: Source = { name: 'DOE Office of Science, DOE Explains', license: PUBLIC_DOMAIN };

function reading(source: Source, title: string, url: string, minutes?: number): Reading {
  const r: Reading = { title, source: source.name, url, license: source.license };
  if (minutes !== undefined) r.minutes = minutes;
  return r;
}

export const READING_PATHS: Record<CoreSubject, ReadingPath> = {
  biology: {
    subject: 'biology',
    intro: 'Start with the cell and its chemistry, follow information from DNA to inheritance to evolution, then survey the organisms and finish with how they live together. Biology rewards recognition speed, so read for the vocabulary and drill until the term comes to you before the question ends.',
    steps: [
      {
        topic: 'biology.cells-membranes',
        focus: 'Know each organelle by its job (rough ER makes secreted and membrane proteins, smooth ER makes lipids and detoxifies, lysosomes digest, peroxisomes break down hydrogen peroxide) and which way water moves in hypertonic, hypotonic and isotonic solutions, plus what the sodium-potassium pump moves (3 Na⁺ out, 2 K⁺ in). Know the mitosis phases by what the chromosomes are doing; NSB likes to ask which phase a description matches.',
        readings: [
          reading(BIOLOGY_2E, '4.3 Eukaryotic Cells', 'https://openstax.org/books/biology-2e/pages/4-3-eukaryotic-cells', 15),
          reading(BIOLOGY_2E, '5.2 Passive Transport', 'https://openstax.org/books/biology-2e/pages/5-2-passive-transport', 25),
          reading(BIOLOGY_2E, '10.2 The Cell Cycle', 'https://openstax.org/books/biology-2e/pages/10-2-the-cell-cycle', 15),
        ],
      },
      {
        topic: 'biology.biochemistry-metabolism',
        focus: 'Know the four macromolecule families by monomer and linkage (glycosidic, ester, peptide, phosphodiester), how enzymes and their inhibitors work, and where each stage of respiration happens (glycolysis in the cytosol, the Krebs cycle in the matrix, the electron transport chain on the inner membrane with O₂ as final acceptor). Photosynthesis is asked here too (photosystem II splits water, RuBisCO fixes CO₂), so add Biology 2e chapter 8 if you have time.',
        readings: [
          reading(CONCEPTS_OF_BIOLOGY, '2.3 Biological Molecules', 'https://openstax.org/books/concepts-biology/pages/2-3-biological-molecules', 30),
          reading(MICROBIOLOGY, '8.1 Energy, Matter, and Enzymes', 'https://openstax.org/books/microbiology/pages/8-1-energy-matter-and-enzymes', 15),
          reading(ANATOMY_AND_PHYSIOLOGY_2E, '24.2 Carbohydrate Metabolism', 'https://openstax.org/books/anatomy-and-physiology-2e/pages/24-2-carbohydrate-metabolism', 20),
        ],
      },
      {
        topic: 'biology.molecular-biotech',
        focus: 'Know the replication enzymes by job (helicase unwinds, primase lays the RNA primer, DNA polymerase builds 5′ to 3′, ligase joins Okazaki fragments), the genetic code (AUG start; UAA, UAG and UGA stop; tRNA carries the anticodon) and the classic experiments (Griffith, Hershey–Chase, Meselson–Stahl). For biotechnology, know what PCR, restriction enzymes, gel electrophoresis (DNA runs toward the positive electrode), cloning vectors and the lac operon each do.',
        readings: [
          reading(CONCEPTS_OF_BIOLOGY, '9.2 DNA Replication', 'https://openstax.org/books/concepts-biology/pages/9-2-dna-replication', 10),
          reading(BIOLOGY_2E, '17.1 Biotechnology', 'https://openstax.org/books/biology-2e/pages/17-1-biotechnology', 25),
        ],
      },
      {
        topic: 'biology.genetics',
        focus: 'Be fast with cross ratios (3:1, 1:2:1, 9:3:3:1, test crosses, probability of a genotype in a multi-gene cross) and with incomplete dominance, codominance, multiple alleles such as ABO blood types, and X-linked inheritance. Know meiosis by its landmarks (synapsis and crossing over in prophase I, homologs separate in anaphase I), nondisjunction syndromes, and Hardy–Weinberg: p + q = 1 and p² + 2pq + q² = 1.',
        readings: [
          reading(BIOLOGY_2E, '12.2 Characteristics and Traits', 'https://openstax.org/books/biology-2e/pages/12-2-characteristics-and-traits', 30),
          reading(BIOLOGY_2E, '11.1 The Process of Meiosis', 'https://openstax.org/books/biology-2e/pages/11-1-the-process-of-meiosis', 25),
        ],
      },
      {
        topic: 'biology.evolution-classification',
        focus: 'Know how species form (allopatric versus sympatric speciation, prezygotic versus postzygotic barriers) and how to read a cladogram: homologous versus analogous structures, shared derived characters, outgroups and monophyletic groups. Memorize the ranks in order (domain, kingdom, phylum, class, order, family, genus, species) and the three domains, and know the kinds of natural selection and genetic drift (bottleneck and founder effects).',
        readings: [
          reading(BIOLOGY_2E, '18.2 Formation of New Species', 'https://openstax.org/books/biology-2e/pages/18-2-formation-of-new-species', 20),
          reading(BIOLOGY_2E, '20.2 Determining Evolutionary Relationships', 'https://openstax.org/books/biology-2e/pages/20-2-determining-evolutionary-relationships', 10),
        ],
      },
      {
        topic: 'biology.organism-diversity',
        focus: 'Know each animal phylum by its signature traits (cnidocytes in cnidarians, a water vascular system in echinoderms, jointed legs and a chitin exoskeleton in arthropods) and the body-plan terms: symmetry, coelom type, protostome versus deuterostome. Know which vertebrate classes lay amniotic eggs and their heart chambers (two in fish, three in amphibians and most reptiles, four in crocodilians, birds and mammals); fungi and protists also appear.',
        readings: [
          reading(CONCEPTS_OF_BIOLOGY, '15.6 Vertebrates', 'https://openstax.org/books/concepts-biology/pages/15-6-vertebrates', 30),
          reading(CONCEPTS_OF_BIOLOGY, '15.3 Flatworms, Nematodes, and Arthropods', 'https://openstax.org/books/concepts-biology/pages/15-3-flatworms-nematodes-and-arthropods', 15),
          reading(CONCEPTS_OF_BIOLOGY, '15.1 Features of the Animal Kingdom', 'https://openstax.org/books/concepts-biology/pages/15-1-features-of-the-animal-kingdom', 10),
        ],
      },
      {
        topic: 'biology.plant-biology',
        focus: 'Know the plant tissues (parenchyma, collenchyma and sclerenchyma; xylem carries water up, phloem carries sugars) and how woody stems thicken from the vascular cambium and cork cambium. Know flower anatomy and its terms (stamen is anther plus filament; carpel is stigma, style and ovary; complete versus incomplete, perfect versus imperfect, monoecious versus dioecious) and the hormones by effect (auxin, gibberellin, cytokinin, abscisic acid, ethylene).',
        readings: [
          reading(BIOLOGY_2E, '30.2 Stems', 'https://openstax.org/books/biology-2e/pages/30-2-stems', 15),
          reading(BIOLOGY_2E, '32.1 Reproductive Development and Structure', 'https://openstax.org/books/biology-2e/pages/32-1-reproductive-development-and-structure', 15),
        ],
      },
      {
        topic: 'biology.animal-physiology',
        focus: 'Trace blood through the four-chambered heart and the gas-exchange surfaces, know which gland makes which hormone and what it does (ADH released by the posterior pituitary, insulin and glucagon from the pancreas), and know how an action potential travels (Na⁺ in to depolarize, K⁺ out to repolarize, saltatory conduction along myelinated axons). Muscles and bones, digestion and the kidneys are asked just as often, so read the rest of the same chapter when you can.',
        readings: [
          reading(CONCEPTS_OF_BIOLOGY, '16.3 Circulatory and Respiratory Systems', 'https://openstax.org/books/concepts-biology/pages/16-3-circulatory-and-respiratory-systems', 15),
          reading(CONCEPTS_OF_BIOLOGY, '16.4 Endocrine System', 'https://openstax.org/books/concepts-biology/pages/16-4-endocrine-system', 15),
          reading(CONCEPTS_OF_BIOLOGY, '16.6 Nervous System', 'https://openstax.org/books/concepts-biology/pages/16-6-nervous-system', 25),
        ],
      },
      {
        topic: 'biology.microbiology-immunology',
        focus: 'Know the cells of adaptive immunity (B cells and plasma cells make antibodies; helper T cells are CD4⁺ and cytotoxic T cells CD8⁺; MHC I is on all nucleated cells, MHC II on antigen-presenting cells) and the five antibody classes. For microbes, know Gram-positive versus Gram-negative walls, bacterial shapes and structures, how genes move between bacteria (transformation, transduction, conjugation), and the lytic versus lysogenic cycles of viruses.',
        readings: [
          reading(CONCEPTS_OF_BIOLOGY, '17.3 Adaptive Immunity', 'https://openstax.org/books/concepts-biology/pages/17-3-adaptive-immunity', 25),
          reading(BIOLOGY_2E, '22.2 Structure of Prokaryotes: Bacteria and Archaea', 'https://openstax.org/books/biology-2e/pages/22-2-structure-of-prokaryotes-bacteria-and-archaea', 15),
        ],
      },
      {
        topic: 'biology.development',
        focus: 'Know the sequence fertilization, cleavage, blastula (blastocyst in mammals), gastrulation, neurulation; what decides holoblastic versus meroblastic cleavage (the amount of yolk); and what each germ layer becomes (ectoderm: skin and nervous system; mesoderm: muscle, bone and blood; endoderm: gut lining and lungs). The amniotic-egg membranes (amnion, chorion, allantois, yolk sac), stem cells and metamorphosis also come up.',
        readings: [
          reading(BIOLOGY_2E, '43.6 Fertilization and Early Embryonic Development', 'https://openstax.org/books/biology-2e/pages/43-6-fertilization-and-early-embryonic-development', 10),
        ],
      },
      {
        topic: 'biology.ecology',
        focus: 'Know the community interactions (mutualism, commensalism, parasitism, competition, predation, keystone species, primary versus secondary succession) and energy flow: trophic levels, roughly 10% transfer between levels, gross versus net primary productivity, and biomagnification. Also expect biomes by climate and vegetation, the nitrogen cycle, logistic growth and carrying capacity, and animal behavior.',
        readings: [
          reading(BIOLOGY_2E, '45.6 Community Ecology', 'https://openstax.org/books/biology-2e/pages/45-6-community-ecology', 25),
          reading(BIOLOGY_2E, '46.2 Energy Flow through Ecosystems', 'https://openstax.org/books/biology-2e/pages/46-2-energy-flow-through-ecosystems', 15),
        ],
      },
    ],
  },
  chemistry: {
    subject: 'chemistry',
    intro: 'Build outward from the atom: electron structure explains the periodic trends, which explain bonding and shape, and then you can quantify reactions through stoichiometry, gases, energy, rates and equilibrium. Acids, redox and nuclear chemistry follow, and organic and lab chemistry come last because they draw on everything before them.',
    steps: [
      {
        topic: 'chemistry.atomic-structure',
        focus: "Write electron configurations quickly, including the chromium and copper exceptions and ions (transition metals lose 4s electrons first), and know the four quantum numbers and what they allow (an l = 0 subshell has one orbital). Expect Bohr energy levels and line spectra, Hund's rule and the Pauli principle, unpaired electrons and paramagnetism, and the scientists behind each atomic model.",
        readings: [
          reading(CHEMISTRY_2E, '6.4 Electronic Structure of Atoms (Electron Configurations)', 'https://openstax.org/books/chemistry-2e/pages/6-4-electronic-structure-of-atoms-electron-configurations', 25),
          reading(CHEMISTRY_2E, '6.3 Development of Quantum Theory', 'https://openstax.org/books/chemistry-2e/pages/6-3-development-of-quantum-theory', 30),
        ],
      },
      {
        topic: 'chemistry.periodic-trends',
        focus: 'Rank elements by atomic radius, ionization energy, electron affinity and electronegativity (radius grows down and to the left, the others grow up and to the right, and fluorine is the most electronegative element) and know the exceptions, such as the dips in first ionization energy from group 2 to 13 and from group 15 to 16. Know the group names and where the metals, nonmetals and metalloids sit.',
        readings: [
          reading(CHEMISTRY_2E, '6.5 Periodic Variations in Element Properties', 'https://openstax.org/books/chemistry-2e/pages/6-5-periodic-variations-in-element-properties', 20),
          reading(CHEMISTRY_2E, '2.5 The Periodic Table', 'https://openstax.org/books/chemistry-2e/pages/2-5-the-periodic-table', 10),
        ],
      },
      {
        topic: 'chemistry.bonding-geometry',
        focus: 'Draw Lewis structures with formal charges, then name the VSEPR shape and hybridization from the electron domains (SF₄ is seesaw and sp³d; XeF₄ is square planar) and decide whether the molecule is polar. Rank boiling points by intermolecular forces (dispersion, dipole-dipole, hydrogen bonding), and know bond order and magnetism from molecular orbitals (O₂ is paramagnetic) and the common crystal lattices.',
        readings: [
          reading(CHEMISTRY_2E, '7.6 Molecular Structure and Polarity', 'https://openstax.org/books/chemistry-2e/pages/7-6-molecular-structure-and-polarity', 30),
          reading(CHEMISTRY_2E, '8.2 Hybrid Atomic Orbitals', 'https://openstax.org/books/chemistry-2e/pages/8-2-hybrid-atomic-orbitals', 20),
          reading(CHEMISTRY_2E, '10.1 Intermolecular Forces', 'https://openstax.org/books/chemistry-2e/pages/10-1-intermolecular-forces', 25),
        ],
      },
      {
        topic: 'chemistry.stoichiometry-solutions',
        focus: "Do mole conversions, limiting reactant, theoretical and percent yield, molarity and dilution (M₁V₁ = M₂V₂) quickly. For colligative properties, freezing-point depression, boiling-point elevation and osmotic pressure depend on the number of dissolved particles, so the van 't Hoff factor matters (1 m CaCl₂ counts about three times as much as 1 m sugar).",
        readings: [
          reading(CHEMISTRY_2E, '4.4 Reaction Yields', 'https://openstax.org/books/chemistry-2e/pages/4-4-reaction-yields', 8),
          reading(CHEMISTRY_2E, '11.4 Colligative Properties', 'https://openstax.org/books/chemistry-2e/pages/11-4-colligative-properties', 35),
        ],
      },
      {
        topic: 'chemistry.gases',
        focus: "Know the gas laws (Boyle, Charles, Gay-Lussac, Avogadro, and PV = nRT with STP values), Dalton's law of partial pressures and Graham's law (effusion rate is proportional to 1/√M). Know the kinetic-molecular theory assumptions, root-mean-square speed, and when real gases deviate from ideal behavior (high pressure, low temperature).",
        readings: [
          reading(CHEMISTRY_2E, '9.2 Relating Pressure, Volume, Amount, and Temperature: The Ideal Gas Law', 'https://openstax.org/books/chemistry-2e/pages/9-2-relating-pressure-volume-amount-and-temperature-the-ideal-gas-law', 25),
          reading(CHEMISTRY_2E, '9.5 The Kinetic-Molecular Theory', 'https://openstax.org/books/chemistry-2e/pages/9-5-the-kinetic-molecular-theory', 10),
        ],
      },
      {
        topic: 'chemistry.thermochemistry',
        focus: "Use Hess's law and standard enthalpies of formation, and read spontaneity from ΔG = ΔH − TΔS: know all four sign combinations and the crossover temperature T = ΔH/ΔS. Also expect calorimetry (q = mcΔT), the sign of ΔS for phase changes and reactions, and phase-diagram features such as the triple point and critical point.",
        readings: [
          reading(CHEMISTRY_2E, '16.4 Free Energy', 'https://openstax.org/books/chemistry-2e/pages/16-4-free-energy', 20),
          reading(CHEMISTRY_2E, '5.3 Enthalpy', 'https://openstax.org/books/chemistry-2e/pages/5-3-enthalpy', 30),
        ],
      },
      {
        topic: 'chemistry.kinetics',
        focus: 'Know how reaction order shows up: units of the rate constant, which plot is linear (zero order: [A] against t; first order: ln[A] against t; second order: 1/[A] against t) and how half-life depends on concentration (constant only for first order). Know activation energy and the Arrhenius equation, transition states and rate-determining steps, and how catalysts speed reactions.',
        readings: [
          reading(CHEMISTRY_2E, '12.4 Integrated Rate Laws', 'https://openstax.org/books/chemistry-2e/pages/12-4-integrated-rate-laws', 15),
        ],
      },
      {
        topic: 'chemistry.equilibrium',
        focus: "Write K and Q expressions (leave out pure solids and liquids), compare Q with K to predict the direction of change, and apply Le Châtelier's principle to changes in concentration, pressure and temperature; only temperature changes the value of K. Solubility products and the common-ion effect are asked here too.",
        readings: [
          reading(CHEMISTRY_2E, '13.3 Shifting Equilibria: Le Châtelier’s Principle', 'https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle', 15),
        ],
      },
      {
        topic: 'chemistry.acids-bases',
        focus: 'Know the strong acids and bases by name, compute pH and pOH quickly, relate Ka, Kb and Kw (Ka × Kb = Kw), and predict whether a salt solution is acidic, basic or neutral. For titrations, know the pH at the equivalence point for each strong and weak pairing, how to choose an indicator, and the Henderson–Hasselbalch equation for buffers (pH = pKa at half-equivalence).',
        readings: [
          reading(CHEMISTRY_2E, '14.3 Relative Strengths of Acids and Bases', 'https://openstax.org/books/chemistry-2e/pages/14-3-relative-strengths-of-acids-and-bases', 20),
          reading(CHEMISTRY_2E, '14.7 Acid-Base Titrations', 'https://openstax.org/books/chemistry-2e/pages/14-7-acid-base-titrations', 15),
        ],
      },
      {
        topic: 'chemistry.electrochemistry',
        focus: 'Assign oxidation numbers quickly and name what is oxidized and reduced and which species are the oxidizing and reducing agents. In any cell oxidation happens at the anode and reduction at the cathode; compute E°cell = E°cathode − E°anode from a table of reduction potentials, link it to spontaneity (ΔG° = −nFE°), and use the Faraday constant for electrolysis.',
        readings: [
          reading(CHEMISTRY_2E, '17.1 Review of Redox Chemistry', 'https://openstax.org/books/chemistry-2e/pages/17-1-review-of-redox-chemistry', 8),
          reading(CHEMISTRY_2E, '17.3 Electrode and Cell Potentials', 'https://openstax.org/books/chemistry-2e/pages/17-3-electrode-and-cell-potentials', 9),
        ],
      },
      {
        topic: 'chemistry.nuclear',
        focus: 'Balance nuclear equations for alpha, beta-minus, positron, electron-capture and gamma decay, and do half-life arithmetic quickly (after n half-lives, (1/2)ⁿ remains). Know which decay moves a nucleus toward stability (too many neutrons: beta-minus; too many protons: positron emission or electron capture) and what mass defect and binding energy mean.',
        readings: [
          reading(CHEMISTRY_2E, '21.3 Radioactive Decay', 'https://openstax.org/books/chemistry-2e/pages/21-3-radioactive-decay', 25),
        ],
      },
      {
        topic: 'chemistry.organic',
        focus: 'Name and recognize hydrocarbons (prefixes meth- through dec-, the -ane, -ene and -yne endings, cis and trans) and the functional groups at a glance (alcohol, ether, aldehyde, ketone, carboxylic acid, ester, amine, amide). Know the isomer types and the reactions NSB names: addition to alkenes, SN1 and SN2 substitution, elimination, esterification and polymerization.',
        readings: [
          reading(CHEMISTRY_2E, '20.1 Hydrocarbons', 'https://openstax.org/books/chemistry-2e/pages/20-1-hydrocarbons', 30),
          reading(CHEMISTRY_2E, '20.2 Alcohols and Ethers', 'https://openstax.org/books/chemistry-2e/pages/20-2-alcohols-and-ethers', 9),
          reading(CHEMISTRY_2E, '20.3 Aldehydes, Ketones, Carboxylic Acids, and Esters', 'https://openstax.org/books/chemistry-2e/pages/20-3-aldehydes-ketones-carboxylic-acids-and-esters', 10),
        ],
      },
      {
        topic: 'chemistry.lab-descriptive',
        focus: 'Name inorganic compounds systematically (polyatomic ions and Greek prefixes: N₂O₄ is dinitrogen tetroxide, NaOCl is sodium hypochlorite) and know the allotropes and properties of the common nonmetals (carbon, phosphorus, sulfur, oxygen and ozone). Also expect lab technique and instruments: separations (distillation, chromatography, filtration), flame-test colors, and what mass spectrometry, IR and NMR measure.',
        readings: [
          reading(CHEMISTRY_2E, '2.7 Chemical Nomenclature', 'https://openstax.org/books/chemistry-2e/pages/2-7-chemical-nomenclature', 15),
          reading(CHEMISTRY_2E, '18.4 Structure and General Properties of the Nonmetals', 'https://openstax.org/books/chemistry-2e/pages/18-4-structure-and-general-properties-of-the-nonmetals', 20),
        ],
      },
    ],
  },
  physics: {
    subject: 'physics',
    intro: 'Mechanics comes first (motion, forces, energy, momentum, rotation and gravity), then fluids, waves, heat, electricity and magnetism, light, and modern physics last. NSB physics rewards fast setups, so after each reading practice short problems with g = 9.8 m/s² and SI units.',
    steps: [
      {
        topic: 'physics.kinematics-forces',
        focus: "Solve constant-acceleration problems with the kinematic equations, and projectiles by treating horizontal and vertical motion separately (on level ground the range is greatest at 45°). Draw free-body diagrams for inclines, pulleys, tension and elevators, and know static friction (up to μsN) and kinetic friction (μkN), static equilibrium and Young's modulus.",
        readings: [
          reading(UNIVERSITY_PHYSICS_1, '3.4 Motion with Constant Acceleration', 'https://openstax.org/books/university-physics-volume-1/pages/3-4-motion-with-constant-acceleration', 25),
          reading(UNIVERSITY_PHYSICS_1, '6.1 Solving Problems with Newton’s Laws', 'https://openstax.org/books/university-physics-volume-1/pages/6-1-solving-problems-with-newtons-laws', 30),
          reading(UNIVERSITY_PHYSICS_1, '6.2 Friction', 'https://openstax.org/books/university-physics-volume-1/pages/6-2-friction', 25),
        ],
      },
      {
        topic: 'physics.work-energy-momentum',
        focus: 'Know work, kinetic and potential energy, power, and conservation of mechanical energy, plus impulse as the change in momentum. Momentum is conserved in every collision but kinetic energy only in elastic ones (perfectly inelastic objects stick together); also expect center of mass and the mechanical advantage of simple machines.',
        readings: [
          reading(UNIVERSITY_PHYSICS_1, '8.3 Conservation of Energy', 'https://openstax.org/books/university-physics-volume-1/pages/8-3-conservation-of-energy', 15),
          reading(UNIVERSITY_PHYSICS_1, '9.4 Types of Collisions', 'https://openstax.org/books/university-physics-volume-1/pages/9-4-types-of-collisions', 15),
        ],
      },
      {
        topic: 'physics.rotation-gravitation',
        focus: "Know the rotational analogues (torque, moment of inertia, angular momentum, rotational kinetic energy), the standard moments of inertia (a hoop MR², a solid disk ½MR², a solid sphere ⅖MR²) and conservation of angular momentum (a skater pulling in her arms spins faster). For gravity, use F = Gm₁m₂/r², orbital speed √(GM/r), escape speed √(2GM/r), Kepler's laws and geosynchronous orbits.",
        readings: [
          reading(UNIVERSITY_PHYSICS_1, '10.4 Moment of Inertia and Rotational Kinetic Energy', 'https://openstax.org/books/university-physics-volume-1/pages/10-4-moment-of-inertia-and-rotational-kinetic-energy', 15),
          reading(UNIVERSITY_PHYSICS_1, '13.4 Satellite Orbits and Energy', 'https://openstax.org/books/university-physics-volume-1/pages/13-4-satellite-orbits-and-energy', 15),
        ],
      },
      {
        topic: 'physics.fluids',
        focus: "Know pressure with depth (P = P₀ + ρgh), Pascal's principle and hydraulics, buoyancy (the buoyant force equals the weight of fluid displaced, so a floating object displaces its own weight) and continuity (A₁v₁ = A₂v₂). Use Bernoulli's equation to explain why faster flow means lower pressure in Venturi tubes, wings and atomizers.",
        readings: [
          reading(UNIVERSITY_PHYSICS_1, '14.6 Bernoulli’s Equation', 'https://openstax.org/books/university-physics-volume-1/pages/14-6-bernoullis-equation', 10),
          reading(UNIVERSITY_PHYSICS_1, '14.4 Archimedes’ Principle and Buoyancy', 'https://openstax.org/books/university-physics-volume-1/pages/14-4-archimedes-principle-and-buoyancy', 9),
        ],
      },
      {
        topic: 'physics.waves-sound',
        focus: 'For simple harmonic motion, know T = 2π√(m/k) for a spring and T = 2π√(L/g) for a pendulum and how energy trades between kinetic and potential. For waves and sound, use v = fλ, find the harmonics of strings and of open and closed pipes, convert decibels (each 10 dB is a factor of 10 in intensity), and apply the Doppler effect and beats.',
        readings: [
          reading(UNIVERSITY_PHYSICS_1, '15.1 Simple Harmonic Motion', 'https://openstax.org/books/university-physics-volume-1/pages/15-1-simple-harmonic-motion', 20),
          reading(UNIVERSITY_PHYSICS_1, '16.6 Standing Waves and Resonance', 'https://openstax.org/books/university-physics-volume-1/pages/16-6-standing-waves-and-resonance', 20),
        ],
      },
      {
        topic: 'physics.thermodynamics',
        focus: 'Do calorimetry with q = mcΔT and latent heats, and know thermal expansion, conduction, convection and radiation (Stefan–Boltzmann). Know the laws of thermodynamics, the ideal-gas processes (isothermal, adiabatic, isobaric, isochoric), Carnot efficiency 1 − Tc/Th with temperatures in kelvins, and the coefficient of performance of refrigerators and heat pumps.',
        readings: [
          reading(UNIVERSITY_PHYSICS_2, '1.4 Heat Transfer, Specific Heat, and Calorimetry', 'https://openstax.org/books/university-physics-volume-2/pages/1-4-heat-transfer-specific-heat-and-calorimetry', 20),
          reading(UNIVERSITY_PHYSICS_2, '4.5 The Carnot Cycle', 'https://openstax.org/books/university-physics-volume-2/pages/4-5-the-carnot-cycle', 10),
        ],
      },
      {
        topic: 'physics.electrostatics-circuits',
        focus: "Use Coulomb's law and the field and potential of point charges, and reduce resistor and capacitor networks quickly (resistors add in series, capacitors add in parallel). Know Ohm's law, power P = IV = I²R = V²/R, capacitor energy ½CV², the RC time constant, and how ammeters (in series) and voltmeters (in parallel) are connected.",
        readings: [
          reading(UNIVERSITY_PHYSICS_2, '10.2 Resistors in Series and Parallel', 'https://openstax.org/books/university-physics-volume-2/pages/10-2-resistors-in-series-and-parallel', 25),
          reading(UNIVERSITY_PHYSICS_2, '8.2 Capacitors in Series and in Parallel', 'https://openstax.org/books/university-physics-volume-2/pages/8-2-capacitors-in-series-and-in-parallel', 9),
          reading(UNIVERSITY_PHYSICS_2, "5.3 Coulomb's Law", 'https://openstax.org/books/university-physics-volume-2/pages/5-3-coulombs-law', 10),
        ],
      },
      {
        topic: 'physics.magnetism-induction',
        focus: "Know the force on a moving charge (F = qvB sin θ with the right-hand rule) and the circle it follows (r = mv/qB), the fields of a straight wire and a solenoid, and ferromagnetism, paramagnetism and diamagnetism. Use Faraday's law (emf = −ΔΦ/Δt) with Lenz's law for direction, and know how generators, motors and transformers work.",
        readings: [
          reading(UNIVERSITY_PHYSICS_2, '13.1 Faraday’s Law', 'https://openstax.org/books/university-physics-volume-2/pages/13-1-faradays-law', 7),
          reading(UNIVERSITY_PHYSICS_2, '11.3 Motion of a Charged Particle in a Magnetic Field', 'https://openstax.org/books/university-physics-volume-2/pages/11-3-motion-of-a-charged-particle-in-a-magnetic-field', 10),
        ],
      },
      {
        topic: 'physics.optics',
        focus: "Use Snell's law, the critical angle for total internal reflection, and the thin-lens and mirror equation 1/f = 1/do + 1/di with magnification and sign conventions (real images are inverted). Also know double-slit and grating interference (d sin θ = mλ), diffraction, polarization, dispersion, and how telescopes and microscopes magnify.",
        readings: [
          reading(UNIVERSITY_PHYSICS_3, '2.4 Thin Lenses', 'https://openstax.org/books/university-physics-volume-3/pages/2-4-thin-lenses', 25),
          reading(UNIVERSITY_PHYSICS_3, '1.3 Refraction', 'https://openstax.org/books/university-physics-volume-3/pages/1-3-refraction', 7),
        ],
      },
      {
        topic: 'physics.relativity-quantum',
        focus: "Know the photoelectric effect (KEmax = hf − φ, photon energy E = hf = hc/λ), de Broglie wavelengths and the Bohr model of hydrogen, and which experiments show light's particle or wave nature. For relativity, apply time dilation and length contraction with γ = 1/√(1 − v²/c²) and know E = mc².",
        readings: [
          reading(UNIVERSITY_PHYSICS_3, '6.2 Photoelectric Effect', 'https://openstax.org/books/university-physics-volume-3/pages/6-2-photoelectric-effect', 15),
          reading(UNIVERSITY_PHYSICS_3, '5.3 Time Dilation', 'https://openstax.org/books/university-physics-volume-3/pages/5-3-time-dilation', 20),
        ],
      },
      {
        topic: 'physics.nuclear-particle',
        focus: 'Know alpha, beta and gamma decay, half-life and activity, binding energy and why fission of heavy nuclei and fusion of light ones both release energy. Classify particles (quarks and leptons; baryons have three quarks and mesons a quark-antiquark pair; fermions versus bosons), know the four forces and their carriers, and recognize the major accelerators and detectors.',
        readings: [
          reading(UNIVERSITY_PHYSICS_3, '10.3 Radioactive Decay', 'https://openstax.org/books/university-physics-volume-3/pages/10-3-radioactive-decay', 10),
          reading(UNIVERSITY_PHYSICS_3, '11.1 Introduction to Particle Physics', 'https://openstax.org/books/university-physics-volume-3/pages/11-1-introduction-to-particle-physics', 15),
        ],
      },
    ],
  },
  earth_space: {
    subject: 'earth_space',
    intro: "Start with Earth's materials and the processes that shape the planet, move up through the atmosphere and oceans, then look outward from the sky to the Solar System, stars and galaxies. Much of this subject is identification, so pair the readings with pictures of minerals, rocks, clouds and star types.",
    steps: [
      {
        topic: 'earth_space.minerals-rocks',
        focus: 'Identify minerals by hardness (know the ten Mohs minerals in order), streak, luster, cleavage versus fracture and reaction to acid, and know the silicate structures from isolated tetrahedra (olivine) to frameworks (quartz, feldspar). Classify igneous rocks by texture and composition (granite and rhyolite, diorite and andesite, gabbro and basalt), and know the common sedimentary and metamorphic rocks and what they form from (limestone to marble, shale to slate).',
        readings: [
          reading(PHYSICAL_GEOLOGY, '3.4 Classification of Igneous Rock', 'https://opentextbc.ca/physicalgeology2ed/chapter/3-4-classification-of-igneous-rock/'),
          reading(PHYSICAL_GEOLOGY, '2.6 Mineral Properties', 'https://opentextbc.ca/physicalgeology2ed/chapter/2-6-mineral-properties/'),
          reading(PHYSICAL_GEOLOGY, '2.4 Silicate Minerals', 'https://opentextbc.ca/physicalgeology2ed/chapter/2-4-silicate-minerals/'),
        ],
      },
      {
        topic: 'earth_space.earth-interior',
        focus: "Know the layers (crust, mantle, liquid outer core, solid inner core), their composition, and the lithosphere-asthenosphere distinction, and how seismic waves revealed them: S waves cannot cross the liquid outer core, which creates the shadow zone. Know the Moho, Gutenberg and Lehmann discontinuities, isostasy, and the geodynamo behind Earth's magnetic field.",
        readings: [
          reading(ASTRONOMY_2E, '8.1 The Global Perspective', 'https://openstax.org/books/astronomy-2e/pages/8-1-the-global-perspective', 9),
        ],
      },
      {
        topic: 'earth_space.tectonics-structure',
        focus: 'Know the three plate-boundary types with examples (divergent: Mid-Atlantic Ridge, East African Rift; convergent: Andes, Himalayas, Japan; transform: San Andreas) and hotspots such as Hawaii, where the islands get older to the northwest. Know fault types by stress (normal from tension, reverse and thrust from compression, strike-slip from shear), folds, volcano types, and earthquake size: each step in magnitude releases about 32 times more energy.',
        readings: [
          reading(DYNAMIC_EARTH, 'Understanding plate motions', 'https://pubs.usgs.gov/gip/dynamic/understanding.html', 15),
          reading(PHYSICAL_GEOLOGY, '12.3 Fracturing and Faulting', 'https://opentextbc.ca/physicalgeology2ed/chapter/12-3-fracturing-and-faulting/'),
        ],
      },
      {
        topic: 'earth_space.surface-hydrology',
        focus: 'Know how glaciers form, flow and leave landforms (till is unsorted; moraines, drumlins, eskers, cirques), how soil forms with its O, A, B and C horizons, and mechanical versus chemical weathering. Know the groundwater terms (aquifer, water table, porosity versus permeability, recharge, artesian wells) plus stream patterns, deserts and the kinds of mass wasting.',
        readings: [
          reading(PHYSICAL_GEOLOGY, '16.2 How Glaciers Work', 'https://opentextbc.ca/physicalgeology2ed/chapter/16-2-how-glaciers-work/'),
          reading(PHYSICAL_GEOLOGY, '5.4 Weathering and the Formation of Soil', 'https://opentextbc.ca/physicalgeology2ed/chapter/5-4-weathering-and-the-formation-of-soil/'),
          reading(WATER_SCIENCE_SCHOOL, 'Aquifers and Groundwater', 'https://www.usgs.gov/water-science-school/science/aquifers-and-groundwater', 8),
        ],
      },
      {
        topic: 'earth_space.geologic-time-fossils',
        focus: 'Memorize the eons, the Paleozoic, Mesozoic and Cenozoic eras with their periods in order, and the major mass extinctions (end-Permian, end-Cretaceous) with the life that came before and after. Know the principles of relative dating (superposition, original horizontality, cross-cutting relationships, inclusions, unconformities), index fossils, and half-life arithmetic for radiometric dating.',
        readings: [
          reading(BIOLOGY_2E, '27.4 The Evolutionary History of the Animal Kingdom', 'https://openstax.org/books/biology-2e/pages/27-4-the-evolutionary-history-of-the-animal-kingdom', 15),
          reading(PHYSICAL_GEOLOGY, '8.2 Relative Dating Methods', 'https://opentextbc.ca/physicalgeology2ed/chapter/8-2-relative-dating-methods/'),
        ],
      },
      {
        topic: 'earth_space.meteorology-climate',
        focus: "Know the atmosphere's layers by how temperature changes with height (falling through the troposphere, rising in the ozone-rich stratosphere), the ten cloud types by height and shape, and the three-cell circulation (Hadley, Ferrel, polar) with the trade winds, westerlies and jet streams. Also expect air masses and fronts, lapse rates and stability, severe storms and their scales (Enhanced Fujita, Saffir–Simpson), and the greenhouse effect.",
        readings: [
          reading(JETSTREAM, 'Ten Basic Clouds', 'https://www.noaa.gov/jetstream/clouds/ten-basic-clouds', 8),
          reading(JETSTREAM, 'Global Atmospheric Circulations', 'https://www.noaa.gov/jetstream/global/global-atmospheric-circulations', 4),
          reading(JETSTREAM, 'Layers of the Atmosphere', 'https://www.noaa.gov/jetstream/atmosphere/layers-of-atmosphere', 4),
        ],
      },
      {
        topic: 'earth_space.oceanography',
        focus: 'Know surface currents and gyres (driven by wind and turned by the Coriolis effect; the Gulf Stream is a western boundary current), Ekman transport and upwelling, and the thermohaline conveyor belt. Know the sea floor from continental shelf to abyssal plain, ridges and trenches, plus salinity, the thermocline, tides (spring versus neap) and waves, including tsunamis.',
        readings: [
          reading(JETSTREAM, 'Ocean Circulations', 'https://www.noaa.gov/jetstream/ocean/circulations', 4),
          reading(PHYSICAL_GEOLOGY, '18.1 The Topography of the Sea Floor', 'https://opentextbc.ca/physicalgeology2ed/chapter/18-1-the-topography-of-the-sea-floor/'),
        ],
      },
      {
        topic: 'earth_space.observational-astronomy',
        focus: 'Know the celestial sphere and its coordinates (right ascension and declination, altitude and azimuth, zenith, circumpolar stars) and how telescopes work: refractors versus reflectors, aperture and light-gathering power, chromatic aberration, and why X-ray and ultraviolet telescopes must fly in space. Know the magnitude scale (5 magnitudes is a factor of 100; smaller is brighter) and parallax (d in parsecs = 1/p in arcseconds).',
        readings: [
          reading(ASTRONOMY_2E, '6.1 Telescopes', 'https://openstax.org/books/astronomy-2e/pages/6-1-telescopes', 20),
          reading(ASTRONOMY_2E, '2.1 The Sky Above', 'https://openstax.org/books/astronomy-2e/pages/2-1-the-sky-above', 25),
        ],
      },
      {
        topic: 'earth_space.solar-system',
        focus: "Know each planet's defining facts (size, moons, rings, atmosphere, oddities such as Venus's retrograde rotation and Uranus's sideways tilt) and Kepler's three laws (P² = a³ with P in years and a in AU). Know the Moon's phases and when each rises, eclipses, the seasons, the small bodies (asteroid belt, Kuiper belt, Oort cloud, meteor showers) and the major missions.",
        readings: [
          reading(ASTRONOMY_2E, '7.1 Overview of Our Planetary System', 'https://openstax.org/books/astronomy-2e/pages/7-1-overview-of-our-planetary-system', 25),
          reading(ASTRONOMY_2E, '3.1 The Laws of Planetary Motion', 'https://openstax.org/books/astronomy-2e/pages/3-1-the-laws-of-planetary-motion', 15),
          reading(ASTRONOMY_2E, '4.5 Phases and Motions of the Moon', 'https://openstax.org/books/astronomy-2e/pages/4-5-phases-and-motions-of-the-moon', 15),
        ],
      },
      {
        topic: 'earth_space.stars',
        focus: "Read the H–R diagram: spectral classes O, B, A, F, G, K, M from hottest to coolest, the main sequence, giants and white dwarfs, and how mass sets luminosity and lifetime. Know the Sun's layers from core to corona and its proton-proton chain, and how stars end: low-mass stars as planetary nebulae and white dwarfs (below the 1.4-solar-mass Chandrasekhar limit), massive stars by core collapse into a type II supernova and a neutron star or black hole.",
        readings: [
          reading(ASTRONOMY_2E, '18.4 The H–R Diagram', 'https://openstax.org/books/astronomy-2e/pages/18-4-the-h-r-diagram', 25),
          reading(ASTRONOMY_2E, '15.1 The Structure and Composition of the Sun', 'https://openstax.org/books/astronomy-2e/pages/15-1-the-structure-and-composition-of-the-sun', 25),
          reading(ASTRONOMY_2E, '23.2 Evolution of Massive Stars: An Explosive Finish', 'https://openstax.org/books/astronomy-2e/pages/23-2-evolution-of-massive-stars-an-explosive-finish', 20),
        ],
      },
      {
        topic: 'earth_space.galaxies-cosmology',
        focus: "Classify galaxies on the Hubble scheme (ellipticals E0 to E7, spirals Sa to Sc, barred SBa to SBc, irregulars) and know the Milky Way's structure and the Local Group. Use Hubble's law v = H₀d (H₀ is about 70 km/s per megaparsec, and 1/H₀ approximates the age of the universe) and know the evidence for the Big Bang (redshifts, the 2.7 K cosmic microwave background, light-element abundances) and for dark matter and dark energy.",
        readings: [
          reading(ASTRONOMY_2E, '26.2 Types of Galaxies', 'https://openstax.org/books/astronomy-2e/pages/26-2-types-of-galaxies', 15),
          reading(ASTRONOMY_2E, '26.5 The Expanding Universe', 'https://openstax.org/books/astronomy-2e/pages/26-5-the-expanding-universe', 20),
        ],
      },
    ],
  },
  energy: {
    subject: 'energy',
    intro: 'Learn the language of energy first (forms, efficiency and units), then each source, then how electricity is moved and stored, and finish with the DOE national laboratories. Energy questions often test physics, chemistry or biology in an energy setting, so read for the science behind each technology.',
    steps: [
      {
        topic: 'energy.conversion-efficiency',
        focus: 'Name the energy conversions in everyday devices and compute efficiency as useful output divided by input. Know heat engines and heat pumps (Carnot limit 1 − Tc/Th; coefficient of performance is heat moved divided by work in, so a COP of 4 moves 4 J of heat per joule of electricity) and efficiency in lighting, buildings and appliances (LED versus incandescent bulbs, R-values, ENERGY STAR).',
        readings: [
          reading(EIA, 'Forms of energy', 'https://www.eia.gov/energyexplained/what-is-energy/forms-of-energy.php', 6),
          reading(COLLEGE_PHYSICS_2E, '15.5 Applications of Thermodynamics: Heat Pumps and Refrigerators', 'https://openstax.org/books/college-physics-2e/pages/15-5-applications-of-thermodynamics-heat-pumps-and-refrigerators', 15),
        ],
      },
      {
        topic: 'energy.data-units',
        focus: 'Convert fluently among joules, calories, Btu, kilowatt-hours, therms and quads (1 kWh = 3.6 MJ ≈ 3,412 Btu; 1 quad = 10¹⁵ Btu), and keep power (kW) distinct from energy (kWh). Expect cost and consumption arithmetic (watts × hours × price per kWh) and rankings from EIA data, such as which sources supply the most U.S. energy and electricity.',
        readings: [
          reading(EIA, 'British thermal units (Btu)', 'https://www.eia.gov/energyexplained/units-and-calculators/british-thermal-units.php', 6),
          reading(EIA, 'Measuring electricity', 'https://www.eia.gov/energyexplained/electricity/measuring-electricity.php', 6),
        ],
      },
      {
        topic: 'energy.fossil-fuels',
        focus: 'Know the coal ranks (lignite, subbituminous, bituminous, anthracite, rising in carbon and energy content), how distillation, cracking and reforming turn crude oil into products (a 42-gallon barrel yields about 19 to 20 gallons of gasoline), and natural gas basics (mostly methane; shale gas from hydraulic fracturing; LNG; methane hydrates). Also know octane ratings, emissions controls and carbon capture.',
        readings: [
          reading(EIA, 'Natural gas explained', 'https://www.eia.gov/energyexplained/natural-gas/', 10),
          reading(EIA, 'Refining crude oil: the refining process', 'https://www.eia.gov/energyexplained/oil-and-petroleum-products/refining-crude-oil-the-refining-process.php', 7),
          reading(EIA, 'Coal explained', 'https://www.eia.gov/energyexplained/coal/', 3),
        ],
      },
      {
        topic: 'energy.nuclear-energy',
        focus: 'Know the fuel cycle from mining and milling (yellowcake) through conversion to UF₆, enrichment to about 3 to 5% U-235, fuel fabrication and spent fuel, and how a reactor works (fission, moderator, control rods, coolant; pressurized-water versus boiling-water reactors). Know fissile versus fertile isotopes (U-238 breeds Pu-239), radiation safety and waste, and fusion research (deuterium-tritium fuel, tokamaks).',
        readings: [
          reading(EIA, 'The nuclear fuel cycle', 'https://www.eia.gov/energyexplained/nuclear/the-nuclear-fuel-cycle.php', 8),
          reading(EIA, 'Nuclear power plants', 'https://www.eia.gov/energyexplained/nuclear/nuclear-power-plants.php', 3),
        ],
      },
      {
        topic: 'energy.solar',
        focus: 'Know how a photovoltaic cell works (absorbed photons free electrons that the p-n junction turns into current), the cell types (crystalline silicon, thin films such as CdTe, multijunction, perovskite) and typical efficiency (about 20% for commercial panels). Know the solar resource (about 1,361 W/m² above the atmosphere, roughly 1,000 W/m² at the surface at noon), passive solar design and concentrating solar power.',
        readings: [
          reading(EIA, 'Photovoltaics and electricity', 'https://www.eia.gov/energyexplained/solar/photovoltaics-and-electricity.php', 10),
          reading(DOE, 'Solar Photovoltaic Cell Basics', 'https://www.energy.gov/cmei/systems/solar-photovoltaic-cell-basics', 7),
        ],
      },
      {
        topic: 'energy.renewables',
        focus: 'Know how wind turbines work (power grows with the cube of wind speed and with swept area; the Betz limit is 59.3%) and the biofuels: ethanol by fermentation (corn in the U.S., sugarcane in Brazil), biodiesel by transesterification of vegetable oils and fats, and biogas. Also know hydropower (dams, run-of-river, pumped storage; Francis, Kaplan and Pelton turbines), geothermal plant types (dry steam, flash steam, binary cycle) and ocean energy.',
        readings: [
          reading(EIA, 'Electricity generation from wind', 'https://www.eia.gov/energyexplained/wind/electricity-generation-from-wind.php', 5),
          reading(EIA, 'Biofuels explained', 'https://www.eia.gov/energyexplained/biofuels/', 4),
        ],
      },
      {
        topic: 'energy.grid-transmission',
        focus: 'Follow electricity from the generator through a step-up transformer, high-voltage transmission lines and substations to step-down distribution, and explain why high voltage cuts I²R losses. Use the transformer ratio Vs/Vp = Ns/Np, and know AC versus DC (U.S. outlets supply 120 V at 60 Hz), base versus peak load, and smart-grid terms.',
        readings: [
          reading(EIA, 'Delivery to consumers', 'https://www.eia.gov/energyexplained/electricity/delivery-to-consumers.php', 10),
          reading(COLLEGE_PHYSICS_2E, '23.7 Transformers', 'https://openstax.org/books/college-physics-2e/pages/23-7-transformers', 9),
        ],
      },
      {
        topic: 'energy.storage-hydrogen',
        focus: 'Know how a battery works (oxidation at the anode, reduction at the cathode, ions moving through the electrolyte) and the common chemistries: lead-acid (both plates turn to lead sulfate on discharge), NiCd, NiMH and lithium-ion. Know fuel cells (a PEM cell uses a platinum catalyst and makes only electricity, water and heat from hydrogen and oxygen), hydrogen production (steam methane reforming, electrolysis) and grid storage such as pumped hydro.',
        readings: [
          reading(DOE_EXPLAINS, 'DOE Explains...Batteries', 'https://www.energy.gov/science/doe-explainsbatteries', 4),
          reading(DOE, 'Fuel Cells', 'https://www.energy.gov/cmei/fuels/fuel-cells', 3),
        ],
      },
      {
        topic: 'energy.doe-labs',
        focus: "These questions usually wrap a core-science question in a lab's research (“Scientists at Argonne are studying…”), so the science is what is tested. Still, know the 17 national labs and their flagship facilities (Fermilab's accelerators, RHIC at Brookhaven, CEBAF at Jefferson Lab, the Spallation Neutron Source at Oak Ridge, light sources such as Argonne's Advanced Photon Source and SLAC's LCLS) and what each kind of facility is used for.",
        readings: [
          reading(DOE, 'National Laboratories', 'https://www.energy.gov/national-laboratories', 9),
          reading(DOE_EXPLAINS, 'DOE Explains...Particle Accelerators', 'https://www.energy.gov/science/doe-explainsparticle-accelerators', 5),
          reading(DOE_EXPLAINS, 'DOE Explains...Light Sources', 'https://www.energy.gov/science/doe-explainslight-sources', 6),
        ],
      },
    ],
  },
  math: {
    subject: 'math',
    intro: 'Go from number sense through algebra and geometry to trigonometry, logarithms and series, vectors and complex numbers, and finish with probability, statistics and calculus. NSB math is about speed and exact answers, so after each reading drill short computations in your head and give answers in simplest form.',
    steps: [
      {
        topic: 'math.arithmetic',
        focus: 'Work with fractions, decimals and percents in your head: turn repeating decimals into fractions (0.3181818... = 7/22), find percent changes and discounts, and use ratios, rates and unit conversions. Learn the shortcuts NSB rewards, such as (a − b)(a + b) = a² − b² for products like 48 × 52, squaring numbers that end in 5, and clock-hand angles (the hour hand moves 0.5° per minute, the minute hand 6°).',
        readings: [
          reading(CONTEMPORARY_MATHEMATICS, '3.4 Rational Numbers', 'https://openstax.org/books/contemporary-mathematics/pages/3-4-rational-numbers', 45),
          reading(CONTEMPORARY_MATHEMATICS, '6.1 Understanding Percent', 'https://openstax.org/books/contemporary-mathematics/pages/6-1-understanding-percent', 15),
        ],
      },
      {
        topic: 'math.number-theory',
        focus: 'Know divisibility rules, prime factorization and how to count divisors (2ᵃ·3ᵇ·… has (a + 1)(b + 1)… divisors), GCD and LCM (for two numbers, GCD × LCM = their product), and modular arithmetic for remainders and last digits. Convert between bases fluently (101101 in base 2 is 45).',
        readings: [
          reading(CONTEMPORARY_MATHEMATICS, '3.1 Prime and Composite Numbers', 'https://openstax.org/books/contemporary-mathematics/pages/3-1-prime-and-composite-numbers', 40),
          reading(CONTEMPORARY_MATHEMATICS, '4.3 Converting with Base Systems', 'https://openstax.org/books/contemporary-mathematics/pages/4-3-converting-with-base-systems', 25),
        ],
      },
      {
        topic: 'math.algebra',
        focus: "Compose and invert functions (find f(g(x)) and f⁻¹(x), and check that f(f⁻¹(x)) = x), and use the polynomial tools NSB asks about: the remainder and factor theorems, the rational root theorem, Descartes' rule of signs, and Vieta's formulas for the sum and product of roots. Also expect lines and slopes, absolute-value equations and inequalities, exponents and radicals, and graph transformations.",
        readings: [
          reading(PRECALCULUS_2E, '1.4 Composition of Functions', 'https://openstax.org/books/precalculus-2e/pages/1-4-composition-of-functions', 20),
          reading(PRECALCULUS_2E, '1.7 Inverse Functions', 'https://openstax.org/books/precalculus-2e/pages/1-7-inverse-functions', 20),
          reading(PRECALCULUS_2E, '3.6 Zeros of Polynomial Functions', 'https://openstax.org/books/precalculus-2e/pages/3-6-zeros-of-polynomial-functions', 20),
        ],
      },
      {
        topic: 'math.geometry',
        focus: 'Know triangle facts (Pythagorean triples, 30-60-90 and 45-45-90 ratios, similar triangles), polygon angle sums ((n − 2) × 180°, and each exterior angle of a regular n-gon is 360°/n) and the area, surface-area and volume formulas for prisms, cylinders, cones, pyramids and spheres. Circles are the most-asked geometry concept and these readings only touch them, so also learn inscribed angles, chords, tangents, arc length and sector area.',
        readings: [
          reading(PREALGEBRA_2E, '9.3 Use Properties of Angles, Triangles, and the Pythagorean Theorem', 'https://openstax.org/books/prealgebra-2e/pages/9-3-use-properties-of-angles-triangles-and-the-pythagorean-theorem', 15),
          reading(CONTEMPORARY_MATHEMATICS, '10.4 Polygons, Perimeter, and Circumference', 'https://openstax.org/books/contemporary-mathematics/pages/10-4-polygons-perimeter-and-circumference', 15),
          reading(PREALGEBRA_2E, '9.6 Solve Geometry Applications: Volume and Surface Area', 'https://openstax.org/books/prealgebra-2e/pages/9-6-solve-geometry-applications-volume-and-surface-area', 20),
        ],
      },
      {
        topic: 'math.trigonometry',
        focus: 'Know unit-circle values in degrees and radians, the signs in each quadrant, and the identities (Pythagorean, double-angle, half-angle, sum and difference). Solve triangles with the laws of sines and cosines, and know amplitude, period and phase shift of sinusoids and how to convert between polar and rectangular coordinates.',
        readings: [
          reading(PRECALCULUS_2E, '5.2 Unit Circle: Sine and Cosine Functions', 'https://openstax.org/books/precalculus-2e/pages/5-2-unit-circle-sine-and-cosine-functions', 20),
          reading(PRECALCULUS_2E, '7.3 Double-Angle, Half-Angle, and Reduction Formulas', 'https://openstax.org/books/precalculus-2e/pages/7-3-double-angle-half-angle-and-reduction-formulas', 10),
        ],
      },
      {
        topic: 'math.sequences-logs',
        focus: 'Use the logarithm rules (product, quotient, power, change of base) to solve exponential equations, including growth, decay, half-life and compound interest (A = P(1 + r/n)^(nt), or Pe^(rt) when continuous). For sequences, know the nth-term and sum formulas for arithmetic and geometric series, including the infinite geometric sum a/(1 − r) for |r| < 1.',
        readings: [
          reading(PRECALCULUS_2E, '4.5 Logarithmic Properties', 'https://openstax.org/books/precalculus-2e/pages/4-5-logarithmic-properties', 15),
          reading(PRECALCULUS_2E, '11.4 Series and Their Notations', 'https://openstax.org/books/precalculus-2e/pages/11-4-series-and-their-notations', 20),
        ],
      },
      {
        topic: 'math.vectors-matrices-complex',
        focus: "Compute with complex numbers quickly: powers of i repeat every four, |a + bi| = √(a² + b²), and in polar form you multiply by multiplying moduli and adding angles (De Moivre's theorem for powers and roots). Know dot and cross products (a cross product is a 3 × 3 determinant whose magnitude is the parallelogram's area), 2 × 2 and 3 × 3 determinants, and matrix multiplication.",
        readings: [
          reading(PRECALCULUS_2E, '8.5 Polar Form of Complex Numbers', 'https://openstax.org/books/precalculus-2e/pages/8-5-polar-form-of-complex-numbers', 9),
          reading(CALCULUS_3, '2.4 The Cross Product', 'https://openstax.org/books/calculus-volume-3/pages/2-4-the-cross-product', 20),
        ],
      },
      {
        topic: 'math.probability-combinatorics',
        focus: "Use the multiplication principle, permutations and combinations (nPr, nCr) and arrangements with repeated letters, and compute probabilities with complements, unions and independent events. Know expected value and binomial probabilities, with coefficients from Pascal's triangle and the binomial theorem.",
        readings: [
          reading(PRECALCULUS_2E, '11.5 Counting Principles', 'https://openstax.org/books/precalculus-2e/pages/11-5-counting-principles', 15),
          reading(PRECALCULUS_2E, '11.7 Probability', 'https://openstax.org/books/precalculus-2e/pages/11-7-probability', 15),
        ],
      },
      {
        topic: 'math.statistics',
        focus: 'Compute mean, median, mode and weighted means quickly, plus range, quartiles and standard deviation, and know which way skew pulls the mean relative to the median. Use z-scores and the 68-95-99.7 rule for normal distributions, and know what correlation and the least-squares regression line tell you.',
        readings: [
          reading(STATISTICS_2E, '2.5 Measures of the Center of the Data', 'https://openstax.org/books/introductory-statistics-2e/pages/2-5-measures-of-the-center-of-the-data', 10),
          reading(STATISTICS_2E, '2.7 Measures of the Spread of the Data', 'https://openstax.org/books/introductory-statistics-2e/pages/2-7-measures-of-the-spread-of-the-data', 25),
        ],
      },
      {
        topic: 'math.calculus',
        focus: "Differentiate with the power, product, quotient and chain rules (including trigonometric, exponential and logarithmic functions) and use derivatives for tangent lines, extrema and concavity. Evaluate limits (factoring, sin x/x → 1, L'Hôpital's rule) and definite integrals with the Fundamental Theorem of Calculus, including areas under curves.",
        readings: [
          reading(CALCULUS_1, '3.3 Differentiation Rules', 'https://openstax.org/books/calculus-volume-1/pages/3-3-differentiation-rules', 15),
          reading(CALCULUS_1, '5.3 The Fundamental Theorem of Calculus', 'https://openstax.org/books/calculus-volume-1/pages/5-3-the-fundamental-theorem-of-calculus', 15),
        ],
      },
    ],
  },
};
