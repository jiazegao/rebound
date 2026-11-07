/**
 * Rule-based topic tagging (no network, no AI): subject → topic → concept, plus the discipline an
 * Energy question really tests.
 *
 * HOW A QUESTION IS SCORED
 *   Every topic of the question's own subject has a list of rules. A rule is a weight followed by
 *   the terms that earn it, e.g. [3, 'allele', 'genotype'] gives 3 points for "allele" and 3 more
 *   for "genotype". Each term counts once per question. A term found in the stem or the answer earns
 *   its full weight; a term found only in the other answer choices (the distractors) earns half.
 *   The topic with the highest total wins if it reaches MIN_TOPIC_SCORE; otherwise the question
 *   gets no topic (better untagged than wrongly tagged). On a tie, the topic whose single best term
 *   is stronger wins, then the topic listed first.
 *
 * TERM SYNTAX (matching is case-insensitive and on whole words)
 *   'allele'        also matches the plural ("alleles"; 'ovary' also matches "ovaries"), so never
 *                   list both forms: a plural listed after its singular is ignored
 *   'cell cycle'    a space or hyphen matches a space, a hyphen or nothing ("cell-cycle", "cellcycle");
 *                   "newton's" also matches "newtons" and "newton"
 *   'photosynth*'   a trailing * matches any ending (photosynthesis, photosynthetic)
 *   '*optera'       a leading * matches any beginning (Lepidoptera, Coleoptera)
 *   /regex/         anything else; it runs on the normalized text (see normalizeText: lower case,
 *                   x² → "x^2", CO₂ → "co2", pronunciation guides removed)
 *
 * WEIGHTS
 *   3 = decisive (jargon that almost always means this topic), 2 = strong, 1 = supporting,
 *   0.5 = weak hint; 4-5 only for terms that must outweigh another topic's vocabulary (an integral
 *   sign makes a question calculus however much algebra it contains). Concepts work the same way
 *   inside their topic.
 *
 * Topic and concept names live in src/core/taxonomy.ts; this file only says how to recognise them.
 * After editing rules, run `npx vitest run src/core/tagging.test.ts` (accuracy on the hand-labelled
 * sample in scripts/doe/topic-eval.json) and `npm run data:build` (re-tags the library and updates
 * the Topics section of scripts/doe/REPORT.md).
 */
import { CORE_SUBJECTS, type CoreSubject, type Question } from './schema';
import { TOPICS } from './taxonomy';

export type TaggableQuestion = Pick<Question, 'subject' | 'stem' | 'choices' | 'answer' | 'accept' | 'kind'>;

export interface TagResult {
  /** Topic id, e.g. "biology.genetics"; absent when no topic scores MIN_TOPIC_SCORE. */
  topic?: string;
  /** Up to MAX_CONCEPTS concept ids of the topic, best first. */
  concepts: string[];
  /** Energy questions only: the discipline the question really tests, when the evidence is clear. */
  crossSubject?: CoreSubject;
  /** Score of the best topic (0 when nothing matched). */
  score: number;
}

type Term = string | RegExp;
/** A weight followed by the terms that earn it. */
type Rule = readonly [weight: number, ...terms: Term[]];
type RuleTable = Readonly<Record<string, readonly Rule[]>>;

/** A topic needs at least this score. */
export const MIN_TOPIC_SCORE = 2;
/** A concept needs at least this score. */
export const MIN_CONCEPT_SCORE = 2;
export const MAX_CONCEPTS = 3;
/** Energy cross-subject: the best discipline needs this score and this lead over the runner-up. */
export const MIN_CROSS_SCORE = 3;
export const MIN_CROSS_LEAD = 2;
/** Weight of a term found only in the distractor choices. */
const CHOICE_FACTOR = 0.5;

/* ------------------------------------------------------------------ */
/* Biology                                                             */
/* ------------------------------------------------------------------ */

const BIOLOGY: RuleTable = {
  // Organelles, membranes and transport, the cell cycle and mitosis, cell signalling, cancer cells.
  'cells-membranes': [
    [3, 'organelle', 'golgi', 'endoplasmic reticulum', 'lysosom*', 'peroxisom*', 'cytoskelet*', 'microtubule', 'microfilament',
      'intermediate filament', 'centriole', 'centrosome', 'tubulin', 'phospholipid bilayer', 'lipid bilayer', 'plasma membrane',
      'cell membrane', 'fluid mosaic', 'osmosis', 'osmotic', 'hypertonic', 'hypotonic', 'isotonic solution', 'facilitated diffusion',
      'active transport', 'passive transport', 'sodium-potassium pump', 'symport', 'antiport', 'uniport', 'endocytosis',
      'exocytosis', 'pinocytosis', 'receptor-mediated', 'aquaporin', 'mitosis', 'mitotic', 'cytokinesis', 'cell cycle', 'interphase',
      'cyclin*', 'cdk', 'cell junction', 'tight junction', 'gap junction', 'desmosome', 'plasmodesma*', 'extracellular matrix',
      'second messenger', 'signal transduction', 'g protein', 'g-protein coupled', 'gpcr', 'tyrosine kinase', 'cyclic amp', 'camp',
      'nucleolus', 'nuclear envelope', 'nuclear pore', 'cell theory', 'cytosol', 'microvilli', 'cristae', 'cisternae', 'p53',
      'tumor suppressor', 'oncogene', 'proto-oncogene', 'metastasis', 'contact inhibition', 'checkpoint', 'kinetochore', 'spindle',
      'g0', 'g1', 'g2', 's phase', 'fibronectin', 'integrin', 'cadherin', 'glycocalyx', 'surface area to volume', 'cell size',
      'membrane protein', 'transmembrane', 'channel protein', 'carrier protein', 'cohesin', 'condensin', 'sister chromatid',
      'cell division', 'cell biology', 'organelles', 'microscop*', 'nuclear lamina', 'ion channel', 'gated', 'confocal',
      'electron microscope'],
    [2, 'mitochondri*', 'chloroplast', 'vacuole', 'ribosom*', 'diffusion', 'concentration gradient', 'prophase', 'metaphase',
      'anaphase', 'telophase', 'cytoplasm', 'vesicle', 'cilia', 'cilium', 'carcinogen*', 'apoptosis', 'phagocytosis',
      'centromere', 'chromatid'],
    [1, 'membrane', 'receptor', 'signaling', 'cancer', 'tumor', 'kinase', 'ligand', 'eukaryot*', 'prokaryot*', 'cell wall', 'nucleus', 'flagell*',
      'permeab*', 'pump', 'channel', 'lipid'],
    [0.5, 'cell', 'cellular'],
  ],
  // Macromolecules, enzymes, respiration, photosynthesis chemistry, ATP and energy metabolism.
  'biochemistry-metabolism': [
    [3, 'glycolysis', 'glycolytic', 'krebs', 'citric acid cycle', 'tca cycle', 'electron transport chain', 'oxidative phosphorylation',
      'chemiosmosis', 'atp synthase', 'fermentation', 'lactic acid', 'pyruvate', 'acetyl coa', 'nadh', 'nadph', 'nad+', 'fadh2',
      'calvin cycle', 'light reaction', 'light-dependent', 'light-independent', 'photosystem', 'rubisco', 'photorespiration', 'enzyme',
      'active site', 'allosteric', 'competitive inhibit*', 'noncompetitive', 'michaelis*', 'coenzyme', 'cofactor', 'amino acid',
      'peptide bond', 'primary structure', 'secondary structure', 'tertiary structure', 'quaternary structure', 'alpha helix',
      'beta sheet', 'beta pleated', 'disulfide', 'carbohydrate', 'monosaccharide', 'disaccharide', 'polysaccharide', 'starch',
      'glycogen', 'fatty acid', 'triglyceride', 'saturated fat', 'unsaturated fat', 'macromolecule', 'hydrolysis',
      'dehydration synthesis', 'dehydration reaction', 'condensation reaction', 'metabolism', 'catabol*', 'anabol*',
      'adenosine triphosphate', 'exergonic', 'endergonic', 'cytochrome', 'ubiquinone', 'coenzyme q', 'thylakoid', 'stroma',
      'carotenoid', 'beta oxidation', 'gluconeogenesis', 'glycogenolysis', 'urea cycle', 'electron shuttle', 'denatur*',
      'substrate-level', 'proton gradient', 'cellular respiration', 'aerobic respiration', 'anaerobic respiration', 'electron carrier',
      'lipase', 'amylase', 'protease', 'catalase', 'hexokinase', 'phosphofructokinase', 'isozyme', 'zymogen', 'hexose', 'pentose',
      'glycosidic', 'biochemi*', 'mitochondrial matrix', 'enzymat*', 'final electron acceptor', 'electron transport system',
      'carbon fixation', 'alanine', 'glycine', 'leucine', 'lysine', 'tryptophan', 'cysteine', 'methionine', 'glutamate'],
    [2, 'atp', 'adp', 'photosynthesis', 'photosynthetic', 'respiration', 'glucose', 'sucrose', 'fructose', 'lactose', 'maltose',
      'galactose', 'cellulose', 'chitin', 'lipid', 'steroid', 'phospholipid', 'substrate', 'catalyst', 'catalyze*', 'oxidation',
      'reduction', 'redox', 'inhibitor', 'metabolic', 'vitamin', 'polypeptide', 'nonpolar', 'non-polar', 'hydrophobic', 'hydrophilic',
      'heme', 'reducing agent', 'oxidative', 'chlorophyll', 'protein structure', 'quaternary'],
    [1, 'protein', 'energy', 'carbon dioxide', 'oxygen', 'sugar', 'fat', 'molecule', 'reaction', 'bond', 'polymer', 'monomer', 'ph',
      'cholesterol', 'hydrogen bond', 'functional group'],
  ],
  // DNA, RNA, replication, transcription, translation, gene regulation, biotechnology.
  'molecular-biotech': [
    [3, 'dna replication', 'mrna', 'trna', 'rrna', 'snrna', 'codon', 'anticodon', 'genetic code', 'rna polymerase', 'dna polymerase',
      'helicase', 'primase', 'ligase', 'topoisomerase', 'gyrase', 'okazaki', 'leading strand', 'lagging strand', 'replication fork',
      'origin of replication', 'promoter', 'operon', 'repressor', 'enhancer', 'tata box', 'intron', 'exon', 'splicing',
      'spliceosome', 'poly-a', 'polyadenylation', "5' cap", 'start codon', 'stop codon', 'reading frame', 'frameshift', 'pcr',
      'polymerase chain reaction', 'thermocycler', 'electrophoresis', 'restriction enzyme', 'restriction endonuclease',
      'restriction site', 'plasmid', 'cloning', 'recombinant', 'crispr', 'cas9', 'transgenic', 'genetically modified', 'gmo',
      'genetic engineering', 'sequencing', 'sanger', 'southern blot', 'northern blot', 'western blot', 'microarray', 'rt-pcr',
      'reverse transcriptase', 'cdna', 'nucleotide', 'nucleoside', 'purine', 'pyrimidine', 'adenine', 'guanine', 'cytosine',
      'thymine', 'uracil', 'base pair', 'double helix', 'antiparallel', 'phosphodiester', 'histone', 'chromatin', 'nucleosome',
      'euchromatin', 'heterochromatin', 'methylation', 'acetylation', 'epigenetic*', 'gene expression', 'rna interference', 'rnai',
      'sirna', 'microrna', 'mirna', 'ribozyme', 'telomerase', 'telomere', 'semiconservative', 'semi-conservative', 'meselson',
      'chargaff', 'hershey', 'transcription factor', 'sigma factor', 'elongation factor', 'release factor', 'aminoacyl',
      'amino acyl', 'peptidyl', 'shine-dalgarno', 'polysome', 'transcription', 'translation', 'transcribed', 'translated',
      'dna repair', 'mismatch repair', 'excision repair', 'thymine dimer', 'pyrimidine dimer', 'proofreading', 'nuclease',
      'exonuclease', 'endonuclease', 'human genome project', 'bioinformatic*', 'gene therapy', 'knockout', 'transfection', 'primer',
      'dideoxy', 'lac operon', 'trp operon', 'wobble', 'molecular biology', 'central dogma', 'reverse transcription', 'genetic material'],
    [2, 'dna', 'rna', 'genome', 'genomic', 'replication', 'strand', 'gene regulation', 'mutagen', 'point mutation', 'silent mutation',
      'missense', 'nonsense mutation', 'deletion', 'insertion', "5'", "3'", '5 prime', '3 prime', 'ribosome', 'protein synthesis',
      'biotechnology', 'clone', 'gel', 'inducer'],
    [1, 'gene', 'sequence', 'molecular', 'mutation', 'base', 'transformation', 'transduction', 'conjugation', 'vector', 'probe'],
  ],
  // Inheritance, crosses, linkage, meiosis, chromosomes and their disorders, population genetics.
  genetics: [
    [3, 'allele', 'genotype', 'genotypic', 'homozygous', 'heterozygous', 'heterozygote', 'homozygote', 'codominan*',
      'incomplete dominance', 'mendel*', 'punnett', 'monohybrid', 'dihybrid', 'trihybrid', 'testcross', 'true-breeding', 'purebred',
      'linkage', 'linked gene', 'recombination frequency', 'map unit', 'centimorgan', 'crossing over', 'crossover', 'chiasma*',
      'synapsis', 'synaptonemal', 'tetrad', 'homologous chromosome', 'homolog', 'meiosis', 'meiotic', 'nondisjunction',
      'aneuploid*', 'trisomy', 'monosomy', 'down syndrome', 'klinefelter', 'turner syndrome', 'karyotype', 'pedigree', 'sex-linked',
      'x-linked', 'y-linked', 'autosom*', 'hemophilia', 'color blind*', 'colorblind*', 'cystic fibrosis', 'huntington', 'tay-sachs',
      'phenylketonuria', 'hardy-weinberg', 'allele frequenc*', 'gene pool', 'epista*', 'pleiotrop*', 'polygenic', 'penetrance',
      'expressivity', 'barr body', 'x inactivation', 'genomic imprinting', 'dominant', 'recessive', 'phenotype', 'phenotypic',
      'inheritance', 'inherited', 'heredity', 'hereditary', 'progeny', 'f1', 'f2', 'independent assortment', 'law of segregation',
      'multiple alleles', 'blood type', 'abo', 'sex chromosome', 'sex determination', 'mitochondrial inheritance',
      'maternal inheritance', 'sickle cell', 'genetic disorder', 'chromosomal disorder', 'dominance'],
    [2, 'chromosome', 'chromosomal', 'trait', 'offspring', 'cross', 'crossed', 'gamete', 'haploid', 'diploid', 'triploid',
      'tetraploid', 'polyploid*', 'carrier', 'mated', 'mate with', 'chi square', 'chi-square', 'segregation', 'genetic variation',
      'genetic diversity', 'self-pollinat*'],
    [1, 'genetic', 'genetics', 'gene', 'mutation', 'ratio', 'breed', 'breeding', 'parent', 'generation', 'sperm', 'egg'],
  ],
  // Natural selection, speciation, phylogeny, systematics and naming, origin of life, human evolution.
  'evolution-classification': [
    [3, 'evolution', 'evolutionary', 'evolve', 'evolved', 'natural selection', 'darwin*', 'lamarck*', 'speciation', 'allopatric',
      'sympatric', 'parapatric', 'peripatric', 'reproductive isolation', 'prezygotic', 'postzygotic', 'reproductive barrier',
      'convergent evolution', 'divergent evolution', 'coevolution', 'adaptive radiation', 'homologous structure',
      'analogous structure', 'analogous', 'vestigial', 'homoplas*', 'phylogen*', 'cladistic*', 'clade', 'cladogram', 'monophyletic',
      'paraphyletic', 'polyphyletic', 'synapomorph*', 'apomorph*', 'plesiomorph*', 'outgroup', 'taxonomy', 'taxonomic', 'taxon',
      'taxa', 'binomial nomenclature', 'linnae*', 'common ancestor', 'ancestral', 'genetic drift', 'founder effect', 'bottleneck',
      'gene flow', 'sexual selection', 'directional selection', 'stabilizing selection', 'disruptive selection',
      'balancing selection', 'artificial selection', 'punctuated equilibrium', 'gradualism', 'endosymbio*', 'origin of life',
      'miller-urey', 'abiogenesis', 'rna world', 'protobiont', 'hominid', 'hominin', 'australopith*', 'homo erectus', 'homo habilis',
      'neanderthal', 'molecular clock', 'fitness', 'selective pressure', 'selection pressure', 'selective advantage',
      'microevolution', 'macroevolution', 'transitional form', 'archaeopteryx', 'tiktaalik', 'systematics', 'dichotomous key',
      'binomial name', 'scientific name', 'three-domain', 'five-kingdom', 'six-kingdom', 'eukarya', 'most closely related', 'lineage',
      'ring species', 'hybrid zone', 'heterozygote advantage', 'industrial melanism', 'peppered moth'],
    [2, 'adaptation', 'adaptive', 'classification', 'classified', 'classify', 'kingdom', 'domain', 'closely related', 'descent',
      'ancestor', 'selection', 'extinct', 'extinction', 'fossil', 'mimicry', 'divergence', 'diverged', 'genus', 'genera', 'descendant', 'descended', 'dinosaur', 'coprolite', 'linne*'],
    [1, 'species', 'population', 'variation', 'origin', 'related', 'relationship'],
  ],
  // Populations, communities, ecosystems, biomes, nutrient cycles, symbiosis, conservation and animal behaviour.
  ecology: [
    [3, 'ecology', 'ecological', 'ecologist', 'ecosystem', 'biome', 'tundra', 'taiga', 'boreal', 'savanna', 'rainforest',
      'grassland', 'chaparral', 'food web', 'food chain', 'trophic', 'primary producer', 'primary consumer', 'secondary consumer',
      'tertiary consumer', 'decomposer', 'detritivore', 'herbivore', 'carnivore', 'omnivore', 'predator', 'predation', 'prey',
      'symbiosis', 'symbiotic', 'mutualism', 'mutualistic', 'commensalism', 'commensal', 'parasitism', 'niche',
      'competitive exclusion', 'carrying capacity', 'logistic growth', 'exponential growth', 'r-selected', 'k-selected',
      'r-selection', 'k-selection', 'r-strategist', 'k-strategist', 'survivorship', 'succession', 'pioneer species',
      'climax community', 'keystone', 'invasive', 'endangered', 'threatened species', 'biodiversity', 'species richness',
      'species diversity', 'species evenness', 'nitrogen cycle', 'carbon cycle', 'phosphorus cycle', 'water cycle', 'biogeochemical',
      'nitrogen fixation', 'nitrification', 'denitrification', 'ammonification', 'eutrophication', 'eutrophic', 'oligotrophic',
      'mesotrophic', 'biomagnification', 'bioaccumulation', 'ten percent rule', 'net primary productivity',
      'gross primary productivity', 'primary productivity', 'ethology', 'ethologist', 'fixed action pattern', 'innate behavior',
      'learned behavior', 'classical conditioning', 'operant conditioning', 'habituation', 'altruism', 'altruistic', 'kin selection',
      'courtship', 'hibernation', 'hibernate', 'estivation', 'bergmann', "allen's rule", 'camouflage', 'aposematic',
      'warning coloration', 'batesian', 'mullerian', 'estuary', 'wetland', 'intertidal', 'littoral', 'benthic', 'pelagic',
      'island biogeography', 'metapopulation', 'abiotic', 'biotic', 'density-dependent', 'density-independent', 'lotka-volterra',
      'mark-recapture', 'quadrat', 'population density', 'population growth', 'population size', 'age structure',
      'zero population growth', 'interspecific', 'intraspecific', 'resource partitioning', 'character displacement', 'foraging',
      'optimal foraging', 'social behavior', 'dominance hierarchy', 'pheromone', 'circadian', 'photic zone', 'aphotic', 'limnetic',
      'profundal', 'mangrove', 'riparian', 'edge effect', 'pyramid of energy', 'pyramid of biomass', 'pyramid of numbers',
      'energy flow', 'autotroph', 'heterotroph', 'chemotroph', 'chemoautotroph', 'scavenger', 'deforestation', 'pesticide', 'ddt',
      'territoriality', 'territorial', 'home range', 'nitrogen-fixing', 'conservation biology', 'habitat fragmentation', 'food energy', 'energy transfer', 'primary production', 'demersal', 'cryptic coloration', 'countershading', 'coloration',
      'fertilizer runoff', 'runoff', 'secchi'],
    [2, 'behavior', 'behaviour', 'behavioral', 'habitat', 'consumer', 'producer', 'biomass', 'migration', 'migrate', 'imprinting',
      'coral reef', 'pollution', 'competition', 'productivity', 'population', 'community'],
    [1, 'species', 'environment', 'environmental', 'conservation', 'climate', 'drought', 'fire', 'nutrient', 'food', 'eat', 'organisms',
      'relationship', 'parasite', 'host', 'lake'],
  ],
  // Organ systems of humans and other animals: nervous, endocrine, circulatory, respiratory, digestive,
  // excretory, muscular, skeletal, sensory, reproductive; tissues, anatomy and human disease.
  'animal-physiology': [
    [3, 'hormone', 'endocrine', 'pituitary', 'hypothalamus', 'thyroid', 'adrenal', 'pancreas', 'pancreatic', 'insulin', 'glucagon',
      'cortisol', 'epinephrine', 'adrenaline', 'norepinephrine', 'testosterone', 'estrogen', 'progesterone', 'oxytocin', 'prolactin',
      'vasopressin', 'antidiuretic', 'adh', 'aldosterone', 'melatonin', 'thyroxine', 'calcitonin', 'parathyroid', 'growth hormone',
      'fsh', 'luteinizing', 'follicle-stimulating', 'corticotropin', 'acth', 'erythropoietin', 'menstrua*', 'ovulation', 'neuron',
      'nerve', 'nervous system', 'axon', 'dendrite', 'synapse', 'synaptic', 'neurotransmitter', 'acetylcholine', 'dopamine',
      'serotonin', 'gaba', 'action potential', 'resting potential', 'depolariz*', 'repolariz*', 'hyperpolariz*', 'myelin', 'schwann',
      'node of ranvier', 'nodes of ranvier', 'glial', 'glia', 'astrocyte', 'oligodendrocyte', 'cerebrum', 'cerebellum', 'cerebral',
      'medulla oblongata', 'pons', 'thalamus', 'hippocampus', 'amygdala', 'corpus callosum', 'telencephalon', 'spinal cord',
      'reflex arc', 'sympathetic', 'parasympathetic', 'autonomic', 'cardiac', 'atrioventricular', 'sinoatrial', 'aorta', 'artery',
      'arteries', 'arteriole', 'vein', 'venule', 'capillar*', 'blood pressure', 'circulatory', 'hemoglobin', 'myoglobin',
      'erythrocyte', 'red blood cell', 'platelet', 'clotting', 'fibrin', 'lung', 'alveol*', 'bronch*', 'trachea', 'larynx', 'pharynx',
      'epiglottis', 'diaphragm', 'respiratory system', 'kidney', 'nephron', 'glomerul*', 'loop of henle', 'bowman', 'renal', 'urine',
      'urinary', 'bladder', 'excretory', 'liver', 'stomach', 'intestine', 'intestinal', 'duodenum', 'jejunum', 'ileum', 'colon',
      'esophagus', 'digestive', 'digestion', 'pepsin', 'trypsin', 'bile', 'gallbladder', 'villi', 'saliva*', 'gastric',
      'skeletal muscle', 'smooth muscle', 'cardiac muscle', 'sarcomere', 'actin', 'myosin', 'tropomyosin', 'troponin', 'sarcoplasmic',
      'isometric', 'tendon', 'ligament', 'skeleton', 'cartilage', 'osteo*', 'femur', 'skull', 'temporal bone', 'retina', 'cornea',
      'rod cell', 'cone cell', 'cochlea', 'semicircular canal', 'vestibular', 'inner ear', 'eardrum', 'tympan*', 'basilar',
      'hair cell', 'organ of corti', 'olfactory', 'taste bud', 'taste', 'thermoregulation', 'homeostasis', 'blood glucose',
      'blood sugar', 'uterus', 'testis', 'testes', 'scrotum', 'prostate', 'seminiferous', 'fallopian', 'oviduct', 'menopause',
      'oxygen debt', 'tidal volume', 'vital capacity', 'heart rate', 'heartbeat', 'heart murmur', 'pacemaker', 'epithelial',
      'epithelium', 'connective tissue', 'nervous tissue', 'adipose', 'physiology', 'physiological', 'carcinoma', 'sarcoma',
      'lymphoma', 'leukemia', 'neuromuscular', 'motor neuron', 'sensory neuron', 'interneuron', 'endorphin', 'hormonal', 'brain',
      'heart', 'muscle', 'blood vessel', 'osmoregulat*', 'osmoconform*', 'cerebrospinal', 'ependymal', 'metabolic rate', 'basal metabolic', 'body temperature', 'hematocrit', 'parkinson',
      'alzheimer', 'chief cell', 'parietal cell', 'exocrine', 'paracrine', 'neural', 'neuroscience', 'vision', 'hearing', 'urea',
      'nitrogenous waste', 'glands', 'goiter', 'synovial', 'broca', 'wernicke', 'neocortex', 'stratum corneum', 'stratum lucidum',
      'lorenzini', 'electroreception', 'dental formula', 'cloaca'],
    [2, 'gland', 'sweat', 'ventricle', 'atrium', 'atria', 'valve', 'pulse', 'iris', 'pupil', 'spinal', 'vertebral', 'rib', 'pelvis',
      'tibia', 'fibula', 'humerus', 'ulna', 'clavicle', 'scapula', 'sternum', 'cranial', 'diabetes', 'anemia', 'hypertension',
      'respiratory', 'anatomy', 'anatomical', 'secrete*', 'secretion', 'excretion', 'breathing', 'ovary', 'reflex', 'medulla',
      'feedback', 'negative feedback', 'positive feedback', 'placenta', 'contraction', 'bone', 'joint', 'teeth', 'tooth', 'molar'],
    [1, 'blood', 'plasma', 'tissue', 'organ', 'eye', 'ear', 'skin', 'sensory', 'receptor', 'stimulus', 'lymph', 'calcium', 'sodium',
      'potassium', 'oxygen', 'carbon dioxide', 'body', 'fluid', 'pressure', 'cholesterol', 'stroke', 'human body'],
    [0.5, 'human', 'mammalian'],
  ],
  // Plant anatomy, tissues, transport, hormones, reproduction and life cycles; plant groups.
  'plant-biology': [
    [3, 'xylem', 'phloem', 'stomata', 'stoma', 'stomatal', 'guard cell', 'transpiration', 'tracheid', 'vessel element', 'sieve tube',
      'companion cell', 'cambium', 'meristem', 'meristematic', 'parenchyma', 'collenchyma', 'sclerenchyma', 'sclereid', 'casparian',
      'endodermis', 'pericycle', 'pith', 'root hair', 'mesophyll', 'palisade', 'auxin', 'gibberellin', 'cytokinin', 'abscisic',
      'phytochrome', 'tropism', 'phototropism', 'gravitropism', 'geotropism', 'thigmotropism', 'photoperiod*', 'short-day',
      'long-day', 'flower', 'flowering', 'petal', 'sepal', 'stamen', 'anther', 'pistil', 'carpel', 'stigma', 'ovule', 'pollen',
      'pollination', 'pollinate*', 'double fertilization', 'endosperm', 'cotyledon', 'monocot', 'dicot', 'eudicot', 'angiosperm',
      'gymnosperm', 'conifer', 'coniferous', 'fern', 'moss', 'bryophyte', 'liverwort', 'hornwort', 'lycophyte', 'lycopod*',
      'club moss', 'horsetail', 'sporophyte', 'gametophyte', 'alternation of generations', 'seed', 'germinat*', 'c4', 'c3 plant',
      'cam plant', 'cam photosynthesis', 'crassulacean', 'bundle sheath', 'vascular bundle', 'vascular plant', 'nonvascular',
      'non-vascular', 'vascular tissue', 'deciduous', 'perennial', 'turgor', 'nastic', 'bark', 'shoot', 'internode',
      'apical dominance', 'apical meristem', 'monoecious', 'dioecious', 'megaspor*', 'microspor*', 'archegoni*', 'antheridi*',
      'sporangi*', 'rhizome', 'tuber', 'stolon', 'root nodule', 'mycorrhiza*', 'plastid', 'amyloplast', 'leucoplast', 'chromoplast',
      'leaf', 'leaves', 'trichome', 'venation', 'petiole', 'taproot', 'fibrous root', 'woody', 'herbaceous', 'microphyll', 'megaphyll',
      'frond', 'sorus', 'sori', 'ginkgo', 'cycad', 'gnetophyte', 'nectar', 'tendril', 'succulent', 'cactus', 'botany', 'botanist',
      'vernalization', 'abscission', 'ethylene', 'florigen', 'statolith', 'heartwood', 'sapwood', 'growth ring', 'lenticel',
      'hydathode', 'guttation', 'cohesion-tension', 'root pressure', 'parthenocarp*', 'apomixis', 'integument', '*phyta',
      /(?<![a-z])fruits?(?![\s-]*fl(?:y|ies))(?![a-z])/, 'determinate', 'indeterminate'],
    [2, 'plant', /(?<![a-z])(?:roots?|stems?)(?![\s-]*cells?)(?![a-z])/, 'tree', 'wood', 'cone', 'spore', 'sap', 'legume', 'grass',
      'nightshade', 'seedling', 'cuticle', 'dormancy', 'senescence', '*phyte'],
    [1, 'chloroplast', 'vacuole', 'cell wall', 'cellulose', 'photosynthesis', 'photosynthetic', 'chlorophyll', 'epidermis', 'cortex',
      'node', 'vascular', 'algae', 'alga', 'growth', 'light', 'water', 'sugar', 'starch', 'crop', 'cotton', 'corn', 'wheat', 'rice',
      'orchid', 'pine', 'fir', 'oak', 'maple', 'sequoia', 'redwood', 'spruce', 'potato', 'tomato', 'bean', 'pea'],
  ],
  // Bacteria, viruses and other pathogens, disease, the immune system.
  'microbiology-immunology': [
    [3, 'bacteria', 'bacterium', 'bacterial', '*virus', 'viral', 'virion', 'capsid', 'bacteriophage', 'phage', 'lytic', 'lysogenic',
      'hiv', 'aids', 'influenza', 'prion', 'viroid', 'pathogen', 'pathogenic', 'infection', 'infectious', 'immune', 'immunity',
      'antibod*', 'antigen', 'antigenic', 'lymphocyte', 'b cell', 't cell', 'helper t', 'cytotoxic t', 'killer t', 'natural killer',
      'macrophage', 'neutrophil', 'eosinophil', 'basophil', 'monocyte', 'mast cell', 'histamine', 'leukocyte', 'white blood cell',
      'phagocyte', 'dendritic cell', 'vaccine', 'vaccination', 'immunization', 'inflammation', 'inflammatory', 'mhc',
      'histocompatibility', 'immunoglobulin', 'igg', 'ige', 'iga', 'igm', 'cytokine', 'interferon', 'interleukin',
      'complement system', 'autoimmune', 'autoimmunity', 'allergy', 'allergic', 'lymphatic', 'lymphoid', 'thymus', 'spleen', 'tonsil',
      'antibiotic', 'penicillin', 'gram stain', 'gram-positive', 'gram-negative', 'peptidoglycan', 'endospore', 'e. coli',
      'escherichia', 'salmonella', 'staphylococc*', 'streptococc*', 'bacillus', 'bacilli', 'coccus', 'cocci', 'spirill*',
      'spirochete', 'microbe', 'microbial', 'microorganism', 'microbiology', 'epidemic', 'pandemic', 'malaria', 'plasmodium',
      'tuberculosis', 'cholera', 'lyme', 'zoono*', 'koch', 'pasteur', 'sterilization', 'autoclave', 'innate immun*',
      'adaptive immun*', 'acquired immun*', 'humoral', 'cell-mediated', 'toll-like', 'tlr', 'epstein-barr', 'mononucleosis', 'herpes',
      'measles', 'polio', 'smallpox', 'rabies', 'ebola', 'hepatitis', 'sars', 'covid', 'disease-causing', 'exotoxin', 'endotoxin',
      'tetanus', 'botulism', 'clostridium', 'anthrax', 'plague', 'syphilis', 'gonorrhea', 'chlamydia', 'host cell', 'immunodeficiency',
      'vector-borne', 'mosquito-borne', 'tick-borne', 'trypanosom*', 'giardia', 'lysozyme', 'opsonization', 'antiserum',
      'herd immunity', 'virulence', 'virulent', 'nosocomial', 'antimicrobial', 'antiviral', 'antibiotic resistance', 'mrsa', 'biofilm',
      'extremophile', 'thermophile', 'halophile', 'methanogen', 'positive-sense', 'negative-sense', 'immunology', 'germ theory', 'bursa', 'fabricius'],
    [2, 'disease', 'toxin', 'fever', 'serum', 'yeast', 'parasite', 'parasitic', 'archaea', 'archaeon', 'cyanobacteri*', 'prokaryote',
      'prokaryotic', 'binary fission', 'pili', 'pilus', 'infect*', 'germ', 'bone marrow', 'agar'],
    [1, 'cancer', 'tumor', 'lymph', 'host', 'culture', 'colony', 'blood', 'mosquito', 'tick'],
  ],
  // Embryology, fertilisation, germ layers, stem cells, differentiation, metamorphosis.
  development: [
    [3, 'embryo', 'embryonic', 'embryology', 'embryogenesis', 'morula', 'blastula', 'blastocyst', 'blastocoel', 'blastopore',
      'blastoderm', 'blastomere', 'gastrula*', 'germ layer', 'ectoderm', 'mesoderm', 'endoderm', 'neurula*', 'neural tube',
      'neural crest', 'somite', 'organogenesis', 'morphogen*', 'hox', 'homeotic', 'homeobox', 'stem cell', 'pluripotent',
      'totipotent', 'multipotent', 'acrosom*', 'cortical reaction', 'implantation', 'amnion', 'chorion', 'allantois', 'yolk sac',
      'amniotic', 'metamorphosis', 'pupa', 'pupal', 'tadpole', 'gametogenesis', 'spermatogenesis', 'oogenesis', 'fetal', 'fetus',
      'gestation', 'trimester', 'spemann', 'organizer', 'bicoid', 'maternal effect', 'segmentation gene', 'pair-rule', 'gap gene',
      'pattern formation', 'regeneration', 'apical ectodermal', 'limb bud', 'teratogen', 'invagination', 'archenteron', 'cell fate',
      'fate map', 'developmental', 'oocyte', 'polar body', 'gastrulation', 'cleavage', 'induction', 'parthenogenesis', 'dedifferentiat*'],
    [2, 'notochord', 'protostome', 'deuterostome', 'zygote', 'fertilization', 'fertilized', 'differentiation', 'differentiate*',
      'larva', 'larvae', 'larval', 'yolk', 'development', 'asexual reproduction'],
    [1, 'growth', 'egg', 'sperm', 'juvenile', 'puberty', 'aging', 'drosophila'],
  ],
  // Animal phyla and classes, fungi, protists, algae: characteristics of groups of organisms.
  'organism-diversity': [
    [3, 'phylum', 'phyla', 'invertebrate', 'vertebrate', 'porifera', 'sponge', 'cnidaria*', 'jellyfish', 'hydra', 'sea anemone',
      'platyhelminth*', 'flatworm', 'planaria*', 'tapeworm', 'fluke', 'nematod*', 'roundworm', 'annelid*', 'earthworm', 'leech',
      'polychaete', 'mollus*', 'gastropod', 'bivalve', 'cephalopod', 'squid', 'octopus', 'snail', 'slug', 'clam', 'oyster', 'mussel',
      'chiton', 'arthropod*', 'insect', 'crustacean', 'arachnid', 'spider', 'scorpion', 'crab', 'lobster', 'shrimp', 'centipede',
      'millipede', 'echinoderm*', 'starfish', 'sea star', 'sea urchin', 'sand dollar', 'sea cucumber', 'chordat*', 'urochordat*',
      'cephalochordat*', 'tunicate', 'lancelet', 'amphioxus', 'amphibian*', 'frog', 'toad', 'salamander', 'newt', 'caecilian',
      'reptil*', 'snake', 'lizard', 'turtle', 'tortoise', 'crocodil*', 'alligator', 'tuatara', 'avian', 'marsupial', 'monotreme',
      'primate*', 'rodent', 'cetacean', 'whale', 'dolphin', 'ungulate', 'fungi', 'fungus', 'mushroom', 'lichen', 'ascomycet*',
      'basidiomycet*', 'zygomycet*', 'chytrid*', 'hyphae', 'hypha', 'mycelium', 'protist*', 'protozoa*', 'amoeba', 'paramecium',
      'euglena', 'diatom', 'dinoflagellate', 'kelp', 'slime mold', 'water mold', 'radiolarian', 'foraminifera*', 'apicomplexa*',
      'ciliate', 'flagellate', 'brown algae', 'red algae', 'green algae', 'cervid', 'antler', 'feather', 'exoskeleton', 'molting',
      'radial symmetry', 'bilateral symmetry', 'coelom*', 'acoelomate', 'pseudocoelom*', 'torsion', 'radula', 'tentacle', 'cnidocyte',
      'nematocyst', 'water vascular', 'tube feet', 'swim bladder', 'lateral line', 'cartilaginous', 'bony fish', 'chondrichthy*',
      'osteichthy*', 'agnatha', 'shark', 'oviparous', 'viviparous', 'ovoviviparous', 'endotherm*', 'ectotherm*', 'warm-blooded',
      'cold-blooded', 'amniote', 'tetrapod', '*optera', 'pedipalp', 'chelicera*', 'compound eye', 'malpighian', 'spiracle',
      'book lung', 'hagfish', 'lamprey', 'jawless', 'placoderm', 'lungfish', 'coelacanth', 'ray-finned', 'lobe-finned',
      'animal kingdom', 'animalia', 'protista', 'monera', 'osculum', 'ostium', 'choanocyte', 'mesoglea', 'polyp', 'medusa', 'beetle',
      'butterfly', 'moth', 'dragonfly', 'grasshopper', 'cockroach', 'termite', 'wasp', 'hornbill', 'penguin', 'platypus', 'kangaroo',
      'opossum', 'armadillo', 'sloth', 'lemur', 'gorilla', 'chimpanzee', 'orangutan', 'manatee', 'okapi', 'reindeer', 'moose', 'deer',
      'icterid*', 'polyplacophor*', 'photophore', 'trilobite', 'echinodermata', 'invertebrates', 'zoology', 'eyespot', 'contractile vacuole', 'pseudopod*', 'superorder', 'cephalization', 'echidna', 'pinniped', 'afrotheria', 'carnivora',
      'bioluminescen*', /(?:which|what) (?:mammalian |insect |taxonomic )?order\b/, '*ptera'],
    [2, 'fish', 'bird', 'mammal', 'coral', 'gill', 'shell', 'scales', 'fin', 'mantle', 'antenna', 'antennae', 'segmented', 'placental',
      'bat', 'plantae', 'owl', 'eagle', 'hawk', 'parrot', 'ape', 'monkey', 'unicellular'],
    [1, 'species', 'animal', 'class', 'family', 'genus', 'marine', 'larva', 'elephant', 'horse', 'cattle', 'goat', 'sheep', 'pig',
      'wolf', 'wolves', 'fox', 'bear', 'cat', 'dog', 'lion', 'tiger', 'fly', 'flies', 'bee', 'ant', 'cricket', 'mosquito', 'tick',
      'mite', 'algae', 'alga'],
    [0.5, 'organism'],
  ],
};

/* ------------------------------------------------------------------ */
/* Chemistry                                                           */
/* ------------------------------------------------------------------ */

const ELEMENT_NAMES =
  'hydrogen|helium|lithium|beryllium|boron|carbon|nitrogen|oxygen|fluorine|neon|sodium|magnesium|aluminum|aluminium|silicon|' +
  'phosphorus|phosphorous|sulfur|sulphur|chlorine|argon|potassium|calcium|scandium|titanium|vanadium|chromium|manganese|iron|' +
  'cobalt|nickel|copper|zinc|gallium|germanium|arsenic|selenium|bromine|krypton|rubidium|strontium|yttrium|zirconium|niobium|' +
  'molybdenum|technetium|ruthenium|rhodium|palladium|silver|cadmium|indium|tin|antimony|tellurium|iodine|xenon|cesium|caesium|' +
  'barium|lanthanum|cerium|neodymium|europium|gadolinium|hafnium|tantalum|tungsten|rhenium|osmium|iridium|platinum|gold|' +
  'mercury|thallium|lead|bismuth|polonium|astatine|radon|francium|radium|actinium|thorium|protactinium|uranium|neptunium|' +
  'plutonium|americium|curium|berkelium|californium|einsteinium|fermium|mendelevium|nobelium|lawrencium|oganesson|tennessine|' +
  'moscovium|nihonium|copernicium|flerovium|livermorium|deuterium|tritium';
/** "carbon-14", "uranium 235", "U-238": a named isotope. */
const ISOTOPE = new RegExp(`(?<![a-z0-9])(?:${ELEMENT_NAMES}|[a-z]{1,2})[\\s-]\\d{1,3}(?![a-z0-9.%])`);
/** Any element name. */
const ELEMENT = new RegExp(`(?<![a-z0-9])(?:${ELEMENT_NAMES})(?![a-z0-9])`);

const CHEMISTRY: RuleTable = {
  // Subatomic particles, isotopes, electron configuration, orbitals and quantum numbers, atomic models, spectra and light.
  'atomic-structure': [
    [3, 'electron configuration', 'orbital diagram', 'subshell', 'sublevel', 'quantum number', 'principal quantum', 'azimuthal',
      'angular momentum quantum', 'magnetic quantum', 'spin quantum', 'aufbau', 'hund', 'pauli exclusion', 'exclusion principle',
      'unpaired electron', 'atomic number', 'mass number', 'bohr model', 'bohr', 'rutherford', 'thomson', 'gold foil', 'cathode ray',
      'plum pudding', 'millikan', 'oil drop', 'chadwick', 'emission spectrum', 'absorption spectrum', 'line spectrum',
      'spectral line', 'balmer', 'lyman', 'paschen', 'rydberg', 'de broglie', 'heisenberg', 'uncertainty principle', 'schrodinger',
      'wave function', 'wavefunction', 'nodal', 'radial node', 'angular node', 'photoelectric', 'ground state', 'excited state',
      'atomic mass unit', 'amu', 's orbital', 'p orbital', 'd orbital', 'f orbital', 'p subshell', 'd subshell', 'electron cloud',
      'energy level', 'valence shell', 'quantum mechanical model', 'subatomic', 'electron shell', 'atomic theory', 'democritus', /(?<![a-z])[spdf] electrons?(?![a-z])/, 'iso-electronic',
      'odd number of electrons',
      'average atomic mass', 'atomic structure', 'isotopic abundance',
      /(?<![a-z0-9])[1-7]\s?[spdf]\s?\^?\d{1,2}(?![a-z0-9])/, /(?<![a-z0-9])[1-7][spdf](?![a-z0-9])/],
    [2, 'isotope', 'isotopic', 'orbital', 'quantum', 'planck', 'photon', 'wavelength', 'frequency', 'speed of light',
      'electromagnetic radiation', 'paramagnetic', 'diamagnetic', 'dalton', 'valence electron', 'atomic mass', 'relative abundance',
      'configuration', 'isoelectronic'],
    [1, 'spin', 'electron', 'proton', 'neutron', 'nucleus', 'atom', 'atomic', 'light', 'spectrum', 'spectroscopy', 'charge'],
  ],
  // The periodic table, its groups and trends: radius, ionization energy, electronegativity, electron affinity.
  'periodic-trends': [
    [3, 'periodic trend', 'periodicity', 'atomic radius', 'atomic radii', 'ionic radius', 'ionic radii', 'ionization energy',
      'ionization energies', 'ionization potential', 'electronegativity', 'electronegativities', 'electron affinity',
      'electron affinities', 'effective nuclear charge', 'shielding', 'screening effect', 'metallic character', 'mendeleev',
      'moseley', 'diagonal relationship', 'lanthanide contraction', 'inert pair', 'representative element', 'most electronegative',
      'least electronegative', 'electropositive', 'ionic size', 'increasing size', 'nonmetallic'],
    [2, 'periodic table', 'alkali metal', 'alkaline earth', 'halogen', 'noble gas', 'inert gas', 'transition metal',
      'transition element', 'lanthanide', 'actinide', 'rare earth', 'metalloid', 'semimetal', 'main group', 'chalcogen', 'pnictogen',
      'group 1', 'group 2', 'group 13', 'group 14', 'group 15', 'group 16', 'group 17', 'group 18', 'group 1a', 'group 2a',
      'group 7a', 'group 8a', 'radius', 'radii', 'reactivity', 'most reactive', 'least reactive', 'larger', 'smaller', 'largest',
      'smallest'],
    [1, 'group', 'period', 'groups', 'periods'],
    [2, 'nonmetal', 'metallic'],
    [0.5, 'metal', 'element', 'ion', 'cation', 'anion'],
  ],
  // Ionic, covalent and metallic bonding, Lewis structures, VSEPR, hybridisation, polarity, intermolecular
  // forces, coordination compounds, crystal structures and symmetry.
  'bonding-geometry': [
    [3, 'vsepr', 'molecular geometry', 'electron geometry', 'electron domain', 'electron-pair geometry', 'molecular shape',
      'trigonal planar', 'trigonal pyramidal', 'trigonal bipyramidal', 'tetrahedral', 'octahedral', 'square planar',
      'square pyramidal', 'seesaw', 't-shaped', 'bond angle', 'hybridization', 'hybridized', 'hybrid orbital',
      /(?<![a-z0-9])(?:d\^?2)?sp\^?[23]?(?:d\^?2?)?(?![a-z0-9])/, 'sigma bond', 'pi bond', 'bond order', 'molecular orbital', 'antibonding', 'bonding orbital', 'lumo',
      'lewis structure', 'lewis dot', 'dot structure', 'electron dot', 'formal charge', 'resonance', 'octet', 'expanded octet',
      'incomplete octet', 'lone pair', 'bonding pair', 'covalent', 'ionic bond', 'ionic bonding', 'metallic bond', 'metallic bonding',
      'dipole moment', 'intermolecular', 'hydrogen bond', 'hydrogen bonding', 'london dispersion', 'dispersion force',
      'dipole-dipole', 'ion-dipole', 'lattice energy', 'bond length', 'coordination compound', 'coordination complex',
      'coordination number', 'ligand', 'chelate', 'chelating', 'crystal field', 'unit cell', 'crystal lattice', 'face-centered',
      'body-centered', 'simple cubic', 'close-packed', 'closest packed', 'network solid', 'covalent network', 'molecular solid',
      'ionic solid', 'metallic solid', 'point group', 'irreducible', 'c2v', 'd3h', 'electronegativity difference', 'valence bond',
      'electron sea', 'polarizability', 'three-center', 's-character', 'diatomic', 'overlap', 'ionic compound',
      'covalent*', 'denticity', '*dentate', 'edta', 'longest bond', 'shortest bond', 'vibrational mode', 'modes of vibration',
      'bond polarity', 'molecular stability'],
    [2, 'polar', 'nonpolar', 'non-polar', 'polarity', 'boiling point', 'melting point', 'ionic', 'linear', 'crystal', 'dipole', 'van der waals', 'bond energy', 'bond strength',
      'bond dissociation', 'complex ion', 'symmetry', 'bent', 'planar', 'geometry', 'delocalized', 'lattice', 'electron pair', 'sigma',
      'homo'],
    [1, 'linear', 'shape', 'double bond', 'triple bond', 'single bond', 'bond', 'bonding', 'conjugated', 'surface tension',
      'viscosity', 'freezing point', 'volatility', 'pi', 'structure', 'stability', 'lengths'],
    [0.5, 'molecule', 'solid'],
  ],
  // Moles, formulas, reactions and yields, solutions and concentration, colligative properties.
  'stoichiometry-solutions': [
    [3, 'molar mass', 'molecular weight', 'formula weight', 'formula mass', 'stoichiometr*', 'limiting reagent', 'limiting reactant',
      'excess reagent', 'excess reactant', 'theoretical yield', 'percent yield', 'actual yield', 'empirical formula',
      'molecular formula', 'percent composition', 'mass percent', 'percent by mass', 'balance the equation', 'molarity', 'molality',
      'molal', 'normality', 'dilution', 'solute', 'net ionic', 'spectator ion', 'colligative', 'freezing point depression',
      'boiling point elevation', 'osmotic pressure', 'raoult', "van't hoff factor", 'van t hoff factor', 'vapor pressure lowering',
      'parts per million', 'ppm', 'combustion analysis', 'elemental analysis', 'single replacement', 'double replacement',
      'single displacement', 'double displacement', 'synthesis reaction', 'decomposition reaction', 'combination reaction',
      'supersaturated', 'saturated solution', 'unsaturated solution', 'like dissolves like', 'nonelectrolyte', 'strong electrolyte',
      'weak electrolyte', 'how many grams', 'percent by volume', 'stock solution', 'solubility rule', 'avogadro', 'mass percentage', 'percentage by mass',
      'molecular mass', 'solvation', 'hydration shell', 'osmosis', 'micelle', 'osmolarity'],
    [2, 'mole fraction', 'balanced equation', 'balancing', 'diluted', 'precipitate', 'hydrate', 'miscible', 'immiscible',
      "henry's law", 'chemical equation', 'formula unit', 'colloid', 'solubility', 'soluble', 'insoluble', 'electrolyte'],
    [1, 'mole', 'concentration', 'dilute', 'solvent', 'solution', 'precipitation', 'anhydrous',
      'grams', 'milliliter', 'molar', 'aqueous', 'dissolve', 'dissolved', 'dissolves', 'dissolving', 'coefficient',
      'mass of', 'formula', 'suspension'],
    [0.5, 'liter', 'density', 'reactant', 'product', 'yield', 'mass', 'volume'],
  ],
  // Gas laws, partial pressures, kinetic molecular theory, effusion, real gases.
  gases: [
    [3, 'ideal gas', 'gas law', 'boyle', /(?<![a-z])charles'?s?'?\s+law/, 'gay-lussac', 'amonton', "avogadro's law", "dalton's law",
      'partial pressure', "graham's law", 'effusion', 'effuse', 'kinetic molecular theory', 'kinetic theory', 'kinetic-molecular',
      'root mean square', 'rms speed', 'real gas', 'compressibility', 'stp', 'standard temperature and pressure', 'gas constant',
      'mean free path', 'maxwell-boltzmann', 'molar volume', '22.4', 'collected over water', 'pv = nrt', 'van der waals equation'],
    [2, 'gas', 'degrees of freedom', 'torr', 'mmhg', 'manometer', 'barometer'],
    [1, 'gaseous', 'diffusion', 'pressure', 'atm', 'atmospheres', 'kilopascal', 'kpa', 'balloon', 'container', 'piston', 'volume',
      'compressed', 'expand', 'expands'],
    [0.5, 'temperature', 'kelvin'],
  ],
  // Enthalpy, Hess's law, calorimetry, entropy, free energy and spontaneity, phase changes and phase diagrams.
  thermochemistry: [
    [3, 'enthalpy', 'enthalpies', 'entropy', 'entropically', 'gibbs', 'free energy', 'spontaneous', 'spontaneity', 'nonspontaneous',
      'exothermic', 'endothermic', 'hess', 'calorimet*', 'specific heat', 'heat capacity', 'heat of fusion', 'heat of vaporization',
      'heat of formation', 'heat of combustion', 'heat of reaction', 'heat of solution', 'enthalpy of', 'standard enthalpy',
      'bond enthalp*', 'delta h', 'delta s', 'delta g', 'δh', 'δs', 'δg', 'thermodynamic', 'thermodynamics', 'state function',
      'phase diagram', 'triple point', 'critical point', 'critical temperature', 'latent heat', 'heating curve', 'cooling curve',
      'born-haber', 'thermochemical', 'thermochemistry', 'internal energy', 'clausius-clapeyron', 'adiabatic', 'isothermal', 'isobaric', 'isochoric', 'boltzmann distribution'],
    [2, 'sublimation', 'sublimes', 'phase change', 'phase transition', 'kilojoule', 'kj', 'calorie', 'heat released', 'heat absorbed'],
    [1, 'deposition', 'joule', 'first law', 'second law', 'third law', 'heat', 'standard state', 'reversible process', 'work done',
      'vapor pressure', 'vaporization', 'combustion', 'phase', 'states of matter', 'evaporation'],
    [0.5, 'boiling point', 'fusion', 'condensation', 'freezing', 'melting', 'temperature', 'energy', 'burn', 'burned', 'celsius'],
  ],
  // Reaction rates, rate laws and orders, activation energy, catalysts, mechanisms.
  kinetics: [
    [3, 'rate law', 'rate constant', 'reaction rate', 'rate of reaction', 'rate of the reaction', 'rate-determining',
      'rate determining', 'rate-limiting', 'rate limiting', 'first-order', 'second-order', 'zero-order', 'third-order',
      'first order', 'second order', 'zero order', 'third order', 'pseudo-first', 'activation energy', 'arrhenius equation',
      'catalyst', 'catalysis', 'catalyze', 'catalyzed', 'elementary step', 'elementary reaction', 'reaction intermediate',
      'transition state', 'activated complex', 'collision theory', 'frequency factor', 'pre-exponential', 'integrated rate',
      'initial rate', 'method of initial rates', 'molecularity', 'unimolecular', 'bimolecular', 'termolecular', 'kinetics',
      'kinetic isotope effect', 'reaction order', 'overall order', 'order of the reaction', 'steady-state', 'pre-equilibrium',
      'clock reaction', 'iodine clock', 'one over the concentration', 'concentration versus time', 'concentration vs time'],
    [2, 'catalytic', 'mechanism', 'half-life', 'half life', 'rate'],
    [1, 'kinetic', 'intermediate', 'enzyme', 'inhibitor', 'surface area', 'faster', 'slower', 'speed up', 'dimerization'],
    [0.5, 'time', 'concentration'],
  ],
  // Equilibrium constants, reaction quotient, Le Chatelier, solubility equilibria.
  equilibrium: [
    [3, 'equilibrium', 'equilibria', 'equilibrium constant', 'keq', 'kc', 'kp', 'ksp', 'solubility product', 'reaction quotient',
      'le chatelier', 'common ion', 'common-ion', 'dynamic equilibrium', 'reversible reaction', 'shift to the left',
      'shift to the right', 'shifts to the left', 'shifts to the right', 'shift left', 'shift right', 'forward reaction',
      'reverse reaction', 'equilibrium position', 'formation constant', 'ice table', 'q < k', 'q > k'],
    [2, 'shift', 'haber process'],
    [1, 'reversible', 'haber', 'solubility'],
  ],
  // pH, acid and base strength, Ka and Kb, buffers, titrations, acid-base theories.
  'acids-bases': [
    [3, 'acidic', 'acidity', 'basic solution', 'basicity', 'ph', 'poh', 'pka', 'pkb', 'ka', 'kb', 'kw', 'buffer', 'buffered',
      'titration', 'titrate', 'titrant', 'equivalence point', 'phenolphthalein', 'litmus', 'methyl orange', 'bromothymol',
      'bronsted', 'lowry', 'lewis acid', 'lewis base', 'conjugate acid', 'conjugate base', 'amphoteric', 'amphiprotic',
      'neutralization', 'neutralize', 'hydronium', 'strong acid', 'weak acid', 'strong base', 'weak base', 'henderson', 'polyprotic',
      'diprotic', 'triprotic', 'monoprotic', 'autoionization', 'self-ionization', 'antacid', 'proton donor', 'proton acceptor',
      'electron pair acceptor', 'electron pair donor', 'superacid', 'dissociation constant', 'acid dissociation',
      'percent ionization', 'h3o+', 'arrhenius acid', 'arrhenius base', 'deprotonat*'],
    [2, 'acid', 'base', 'end point', 'endpoint', 'indicator', 'conjugate', 'hydroxide', 'alkaline', 'arrhenius', 'oh-', 'h+', 'protonat*'],
    [1, 'alkali', 'hydrochloric acid', 'sulfuric acid', 'nitric acid', 'acetic acid', 'carbonic acid', 'phosphoric acid',
      'hydrofluoric acid', 'perchloric acid', 'hydrobromic', 'hydroiodic', 'formic acid', 'ammonia', 'sodium hydroxide',
      'potassium hydroxide', 'hydrolysis', 'salt', 'proton', 'dissociate', 'dissociation', 'ionize', 'neutral'],
  ],
  // Oxidation states, redox reactions, galvanic and electrolytic cells, potentials, Nernst, Faraday.
  electrochemistry: [
    [3, 'redox', 'oxidizing agent', 'reducing agent', 'oxidant', 'reductant', 'oxidation state', 'oxidation number', 'half-reaction',
      'half reaction', 'galvanic', 'voltaic', 'electrolytic', 'electrolysis', 'electrode', 'anode', 'cathode', 'salt bridge',
      'cell potential', 'reduction potential', 'oxidation potential', 'standard potential', 'electrode potential', 'emf',
      'electromotive', 'nernst', 'faraday', 'electroplating', 'electroplate', 'corrosion', 'corrode', 'battery', 'batteries',
      'electrochemical', 'electrochemistry', 'galvaniz*', 'sacrificial anode', 'fuel cell', 'standard hydrogen electrode',
      'cell notation', 'line notation', 'disproportionation', 'dry cell', 'lead storage', 'concentration cell', 'downs cell'],
    [2, 'oxidation', 'reduction', 'oxidizing', 'oxidized', 'oxidizes', 'rust', 'rusting', 'volt', 'voltage', 'coulomb', 'ampere',
      'electron transfer', 'electrons transferred'],
    [1, 'reducing', 'reduced', 'reduces', 'current'],
    [0.5, 'electron', 'charge', 'metal'],
  ],
  // Hydrocarbons, functional groups, nomenclature, isomers, organic reactions, polymers.
  organic: [
    [3, 'organic', 'alkane', 'alkene', 'alkyne', 'alkyl', 'aromatic', 'aromaticity', 'benzene', 'phenyl', 'phenol', 'alcohol',
      'ether', 'aldehyde', 'ketone', 'carboxylic', 'ester', 'amide', 'amine', 'nitrile', 'thiol', 'carbonyl', 'hydroxyl', 'carboxyl',
      'functional group', 'hydrocarbon', 'isomer', 'isomerism', 'isomerization', 'stereoisomer*', 'enantiomer*', 'diastereomer*',
      'chiral', 'chirality', 'racemic', 'optical activity', 'optically active', 'cis-trans', 'geometric isomer', 'structural isomer',
      'constitutional isomer', 'iupac', 'ethane', 'propane', 'butane', 'pentane', 'hexane', 'heptane', 'octane', 'nonane', 'decane',
      'methyl', 'ethyl', 'propyl', 'butyl', 'isopropyl', 'tert-butyl', 'vinyl', 'cyclo*', 'sn1', 'sn2', 'e1', 'e2', 'nucleophil*',
      'electrophil*', 'carbocation', 'carbanion', 'markovnikov', 'zaitsev', 'saytzeff', 'addition reaction', 'substitution reaction',
      'elimination reaction', 'esterification', 'saponification', 'polymer', 'polymerization', 'polymerize', 'grignard',
      'diels-alder', 'friedel-crafts', 'aldol', 'hydrogenation', 'halogenation', 'ozonolysis', 'tollens', 'benedict', 'lucas',
      'biuret', 'iodoform', 'fehling', 'hydrogen deficiency', 'degrees of unsaturation', 'degree of unsaturation', 'nylon',
      'polyethylene', 'polystyrene', 'polypropylene', 'teflon', 'pvc', 'acetone', 'formaldehyde', 'toluene', 'xylene',
      'naphthalene', 'anthracene', 'hemiacetal', 'acetal', 'hemiaminal', 'imine', 'enol', 'enamine', 'anhydride', 'acyl', 'azide',
      'epoxide', 'alkoxy', 'alkyl halide', 'haloalkane', 'carbon chain', 'skeletal formula', 'ethylene', 'ethene', 'ethyne',
      'acetylene', 'propene', 'butene', 'butadiene', 'diene', 'styrene', 'aniline', 'pyridine', 'furan', 'thiophene', 'pyrrole',
      'indole', 'heterocycl*', 'r group', 'chair conformation', 'boat conformation', 'conformation', 'newman projection',
      'fischer projection', 'r configuration', 's configuration', 'dextrorotatory', 'levorotatory', 'meso', 'leaving group',
      'primary alcohol', 'secondary alcohol', 'tertiary alcohol', 'aldol condensation', 'claisen', 'wittig', 'michael addition',
      'retrosynthesis', 'spiro*', 'norbornene', 'bicyclic', 'hexatriene', 'cyclohexadiene', 'organometallic', 'butanone',
      'propanone', 'stereocenter', 'carbocations', 'organic chemistry', 'thermoplastic', 'thermoset', '*polymer', '*amine', '*anol', '*anoic', 'glycosidic', 'monomers',
      'peptide', 'secondary structure'],
    [2, 'cis', 'trans', 'saturated', 'unsaturated', 'halide', 'nitro', 'carbons', 'ring', 'iupac name', 'nomenclature',
      'ch3', 'ch2', 'c=c', 'c=o', 'methanol', 'ethanol', 'propanol', 'butanol'],
    [1, 'ortho', 'para', 'meta', 'carbon', 'hydrogen atoms', 'chain', 'petroleum', 'methane', 'acetic acid', 'carbohydrate',
      'amino acid', 'protein', 'lipid', 'fatty acid', 'triglyceride', 'sugar', 'glucose', 'cellulose', 'starch', 'dna'],
    [0.5, 'compound', 'synthesis', 'reagent', 'name of the compound'],
  ],
  // Radioactive decay, nuclear reactions, half-life, binding energy, fission and fusion.
  nuclear: [
    [3, 'radioactive', 'radioactivity', 'radioisotope', 'radionuclide', 'nuclide', 'alpha decay', 'beta decay', 'gamma decay',
      'gamma ray', 'gamma radiation', 'alpha particle', 'beta particle', 'alpha emission', 'beta emission', 'positron',
      'electron capture', 'nuclear', 'fission', 'nuclear fusion', 'transmutation', 'binding energy', 'mass defect',
      'daughter nuclide', 'carbon dating', 'radiocarbon', 'radiometric', 'becquerel', 'geiger', 'nucleon', 'band of stability',
      'neutron-to-proton', 'neutron to proton', 'magic number', 'decay series', 'transuranium', 'transuranic', 'particle accelerator',
      'cyclotron', 'chain reaction', 'critical mass', 'beta-minus', 'beta-plus', 'radioactively'],
    [2, 'half-life', 'half life', 'decay', 'curie', 'synthetic element', 'plutonium', ISOTOPE],
    [1, 'neutron', 'isotope', 'nucleus', 'nuclei', 'uranium', 'radium', 'radon', 'polonium', 'thorium', 'alpha', 'beta', 'gamma',
      'emits', 'emitted', 'radiation', 'daughter', 'fusion'],
  ],
  // Lab equipment, technique and safety, instrumental analysis, measurement, properties and reactions of
  // specific elements and compounds, mixtures, industrial processes, history of chemistry.
  'lab-descriptive': [
    [3, 'laboratory', 'lab safety', 'beaker', 'flask', 'erlenmeyer', 'buret', 'burette', 'pipet', 'pipette', 'graduated cylinder',
      'bunsen', 'crucible', 'desiccator', 'fume hood', 'goggles', 'meniscus', 'distillation', 'chromatography', 'filtration',
      'recrystallization', 'centrifug*', 'spectrometer', 'spectrophotometer', 'spectrophotometry', 'mass spectrometry',
      'mass spectrum', 'nmr', 'nuclear magnetic resonance', 'infrared spectroscopy', 'ir spectroscopy', 'ir spectrum', 'uv-vis',
      "beer's law", 'beer-lambert', 'absorbance', 'flame test', 'qualitative analysis', 'gravimetric', 'significant figure',
      'sig figs', 'physical change', 'chemical change', 'physical property', 'chemical property', 'intensive property',
      'extensive property', 'homogeneous mixture', 'heterogeneous mixture', 'allotrope', 'fullerene', 'buckminsterfullerene',
      'graphene', 'ostwald', 'contact process', 'solvay', 'hall-heroult', 'hall process', 'blast furnace', 'smelting', 'baking soda',
      'table salt', 'quicklime', 'slaked lime', 'lavoisier', 'priestley', 'scheele', 'cavendish', 'ramsay', 'atomic spectroscopy',
      'emission spectroscopy', 'icp', 'inductively coupled', 'retention time', 'rf value', 'thin layer', 'gas chromatography', 'hplc',
      'x-ray crystallography', 'x-ray diffraction', 'polarimeter', 'percent error', 'dimensional analysis', 'liquid at room temperature',
      'latin name', 'tyndall', 'emulsion', 'nichrome', 'degassing', 'degas', 'schlenk', 'glovebox', 'freeze-pump-thaw',
      'systematic name', 'inert atmosphere', 'sonication', 'p-type', 'n-type', 'ferromagnet*', 'ferrimagnet*',
      'antiferromagnet*', 'baking soda', 'sodium bicarbonate', 'quantitative', 'qualitative', 'polarography', 'voltammetry', 'titanium dioxide', 'chemical symbol', 'aqua regia', 'noble metal', 'lab',
      'unit conversion'],
    [2, 'alloy', 'ore', 'common name', 'ozone', 'diamond', 'graphite', 'precision', 'accuracy', 'named after', 'malleable', 'ductile',
      'luster', 'most abundant', "earth's crust", 'gemstone', 'pigment', 'fertilizer', 'bleach', 'detergent', 'zeolite', 'silicone',
      'identify the gas', 'safety', 'colloid', 'gelatin', 'state of matter', 'states of matter', 'doped', 'doping', 'dopant',
      'chemical name', 'ceramic', 'experiment'],
    [1, 'accurate', 'precise', 'homogeneous', 'heterogeneous', 'mixture', 'discovered', 'discovery', 'color', 'colour', 'colored',
      'flame', 'odor', 'smell', 'toxic', 'flammable', 'explosive', 'superconductor', 'semiconductor', 'conductivity', 'abundant',
      'systematic', 'dense', 'denser', 'data',
      'mineral', 'dye', 'soap', 'industrial', 'industry', 'manufacture*', 'commercially', 'symbol', 'room temperature', 'plasma', 'nanoparticle', 'nanotube', 'silicate', 'glass', 'cement', 'limestone', 'gypsum',
      'test for', 'litmus paper', 'measurement', 'uncertainty', 'scientific notation'],
    [0.5, 'yellow', 'green', 'blue', 'violet', 'purple', 'red', 'orange', 'brown', 'white', 'black', 'magnet', 'magnetic', 'oxide',
      'reagent', ELEMENT],
  ],
};

/* ------------------------------------------------------------------ */
/* Physics                                                             */
/* ------------------------------------------------------------------ */

const PHYSICS: RuleTable = {
  // Motion in one and two dimensions, projectiles, Newton's laws, friction, tension, inclines, statics, elasticity.
  'kinematics-forces': [
    [3, 'kinematic*', 'projectile', 'free fall', 'free-fall', 'freely falling', 'trajectory', "newton's first law",
      "newton's second law", "newton's third law", "newton's laws", 'first law of motion', 'second law of motion',
      'third law of motion', 'net force', 'normal force', 'friction', 'frictional', 'frictionless', 'coefficient of friction',
      'static friction', 'kinetic friction', 'incline', 'inclined', 'free-body', 'free body', 'terminal velocity', 'terminal speed',
      'air resistance', 'relative velocity', 'meters per second squared', 'm/s^2', "young's modulus", 'elastic limit',
      'modulus of elasticity', 'bulk modulus', 'apparent weight', 'atwood', 'average velocity', 'instantaneous velocity',
      'horizontal component', 'vertical component', 'statics', 'tension in', 'kinematics'],
    [2, 'tension', 'pulley', 'ramp', 'reference frame', 'frame of reference', 'stress', 'strain', 'ductile', 'tensile', 'shear',
      "hooke's law", 'elevator', 'acceleration', 'accelerates', 'accelerating', 'decelerat*', 'displacement', 'launched', 'thrown',
      'tossed', 'average speed', 'distance traveled', 'inertia', 'rope', 'ropes', 'plastic deformation', 'elongation', 'hit the ground', 'ductility', 'brittle', 'vector'],
    [1, 'velocity', 'speed', 'dropped', 'drop', 'how tall', 'how high', 'position', 'how far', 'components', 'si unit', 'force', 'newton', 'weight', 'equilibrium',
      'motion', 'falls', 'falling', 'horizontal', 'horizontally', 'vertical', 'vertically', 'push', 'pull', 'box', 'block', 'cliff'],
    [0.5, 'mass', 'height', 'second', 'meter', 'object', 'gravity', 'ball', 'car'],
  ],
  // Work, kinetic and potential energy, power, conservation of energy, momentum, impulse, collisions, centre of mass,
  // simple machines.
  'work-energy-momentum': [
    [3, 'work done', 'work-energy', 'mechanical energy', 'conservation of energy', 'energy conservation', 'momentum',
      'linear momentum', 'impulse', 'collision', 'collide', 'collides', 'elastic collision', 'inelastic', 'perfectly inelastic',
      'coefficient of restitution', 'recoil', 'center of mass', 'centre of mass', 'conservation of momentum', 'elastic potential',
      'simple machine', 'mechanical advantage', 'ballistic pendulum', 'conservative force', 'nonconservative', 'non-conservative',
      'wheel and axle', 'block and tackle'],
    [2, 'kinetic energy', 'potential energy', 'spring constant', 'horsepower', 'lever', 'thrust', 'work'],
    [1, 'rocket', 'power', 'watt', 'kilowatt', 'joule', 'efficiency', 'explosion', 'explodes', 'bounces', 'rebound', 'jet'],
    [0.5, 'energy', 'efficient', 'spring', 'height', 'speed', 'mass'],
  ],
  // Torque, rotational motion and inertia, angular momentum, circular motion, gravitation, orbits, Kepler, rotating frames.
  'rotation-gravitation': [
    [3, 'torque', 'angular momentum', 'angular velocity', 'angular speed', 'angular acceleration', 'angular displacement',
      'moment of inertia', 'moments of inertia', 'rotational inertia', 'centripetal', 'centrifugal', 'circular motion',
      'uniform circular', 'radius of gyration', 'parallel axis', 'gravitation*', 'universal gravitation', 'gravitational constant',
      'kepler', 'escape velocity', 'escape speed', 'geosynchronous', 'geostationary', 'gyroscope', 'merry-go-round', 'lever arm',
      'moment arm', 'figure skater', 'coriolis', 'rotating frame', 'rotational kinetic', 'rolling without slipping', 'horizontal circle',
      'vertical circle', 'closest to the sun', 'farthest from the sun'],
    [2, 'rotational', 'rpm', 'radians per second', 'circular path', 'rolling', 'orbit', 'orbiting', 'satellite', 'weightless*',
      'precession', 'flywheel', 'arc length', 'pivot', 'hoop', 'turntable', 'gravitational field', 'gravitational force',
      'gravitational potential', 'tidal force', 'rotating', 'rotation', 'circle', 'perihelion', 'aphelion'],
    [1, 'rotates', 'rotate', 'revolution', 'orbital', 'planet', 'moon', 'radian', 'axis', 'axle', 'wheel', 'disk', 'disc', 'spinning',
      'spins', 'tides', 'black hole', 'gravity', 'angular', 'rolls'],
    [0.5, 'radius', 'period'],
  ],
  // Simple harmonic motion, pendulums, mechanical waves, superposition, standing waves, sound, Doppler.
  'waves-sound': [
    [3, 'simple harmonic', 'harmonic motion', 'pendulum', 'mass-spring', 'acoustic*', 'decibel', 'intensity level', 'doppler',
      'standing wave', 'antinode', 'overtone', 'fundamental frequency', 'beat frequency', 'open pipe', 'closed pipe', 'organ pipe',
      'speed of sound', 'timbre', 'loudness', 'ultrasound', 'ultrasonic', 'infrasound', 'sonic boom', 'tuning fork',
      'oscillation', 'oscillat*', 'sound wave', 'redshift', 'blueshift', 'red shift'],
    [2, 'amplitude', 'sound', 'resonance', 'resonant', 'resonate', 'harmonic', 'transverse', 'longitudinal', 'pitch', 'shock wave',
      'mach', 'damping', 'damped', 'wave speed', 'musical', 'echo', 'vibrat*', 'spring'],
    [1, 'node', 'superposition', 'string', 'wave', 'wavelength', 'frequency', 'period', 'hertz', 'interference', 'constructive',
      'destructive', 'crest', 'trough', 'medium', 'cycle'],
  ],
  // Reflection, refraction, lenses and mirrors, interference and diffraction of light, polarisation, optical
  // instruments, photometry.
  optics: [
    [3, 'lens', 'lenses', 'mirror', 'focal length', 'focal point', 'real image', 'virtual image', 'magnification', 'refraction',
      'refract', 'refracted', 'refractive', 'index of refraction', 'indices of refraction', 'snell', 'total internal reflection',
      'critical angle', 'diffraction', 'diffraction grating', 'single slit', 'double slit', 'thin film', 'polariz*', 'brewster',
      'malus', 'optics', 'eyepiece', 'objective lens', 'aberration', 'myopia', 'hyperopia', 'nearsighted', 'farsighted', 'diopter',
      'fiber optic', 'optical fiber', 'interferometer', 'interferometry', 'angle of incidence', 'angle of refraction', 'lumen',
      'candela', 'illuminance', 'luminous intensity', 'luminous flux', 'primary color', 'color triangle', 'subtractive',
      'electromagnetic spectrum', 'rayleigh scattering', 'charge-coupled'],
    [2, 'concave', 'convex', 'converging', 'diverging', 'image', 'magnified', 'reflection', 'grating', 'slit', "young's double", "young's experiment",
      'dispersion', 'prism', 'rainbow', 'optical', 'huygens', 'fermat', 'michelson', 'coherent', 'monochromatic', 'light ray',
      'telescope', 'microscope', 'camera', 'pinhole', 'umbra', 'penumbra', 'luminous', 'scattering', 'paint', 'pigment',
      'electromagnetic radiation'],
    [1, 'reflected', 'reflect', 'reflects', 'incident', 'ray', 'shadow', 'glass', 'rayleigh', 'resolution', 'resolving', 'light',
      'color', 'visible light', 'laser', 'beam', 'electromagnetic wave'],
    [0.5, 'water', 'spectrum', 'angle', 'intensity'],
  ],
  // Heat and temperature, calorimetry, laws of thermodynamics, entropy, heat engines, gases, heat transfer.
  thermodynamics: [
    [3, 'thermodynamic*', 'specific heat', 'heat capacity', 'calorimet*', 'latent heat', 'heat of fusion', 'heat of vaporization',
      'entropy', 'carnot', 'heat engine', 'heat pump', 'coefficient of performance', 'first law of thermodynamics',
      'second law of thermodynamics', 'third law of thermodynamics', 'zeroth law', 'internal energy', 'isothermal', 'adiabatic',
      'isobaric', 'isochoric', 'isovolumetric', 'isentropic', 'pv = nrt', 'kinetic theory', 'thermal expansion',
      'coefficient of linear expansion', 'linear expansion', 'thermal conductivity', 'stefan-boltzmann', 'absolute zero',
      'equipartition', 'otto cycle', 'diesel cycle', 'pv diagram', 'pressure-volume', 'maxwell-boltzmann', 'thermal equilibrium',
      'heat transfer', 'heat flow', 'heat death'],
    [2, 'ideal gas', 'boltzmann', 'conduction', 'convection', 'fahrenheit', 'calorie', 'kilocalorie', 'thermometer',
      'degrees of freedom', 'reservoir', 'liquefaction', 'liquefy', 'phase change', 'cryogen*', 'superfluid', 'heat', 'thermal',
      'compressor', 'refrigerator', 'temperature', 'kelvin'],
    [1, 'celsius', 'boiling', 'melting', 'freezing', 'evaporation', 'condensation', 'heated', 'heating', 'gas', 'insulation', 'cools',
      'expand', 'expands', 'expansion',
      'cooling', 'ice', 'steam', 'boils', 'blackbody', 'efficiency', 'engine', 'compression'],
    [0.5, 'insulator', 'warm', 'hot', 'cold', 'pressure', 'volume', 'energy', 'radiation'],
  ],
  // Charge, Coulomb's law, electric fields and potential, capacitors, current, resistance, DC and AC circuits.
  'electrostatics-circuits': [
    [3, 'coulomb', 'electric field', 'electric potential', 'electric force', 'electrostatic*', 'potential difference', 'capacitor',
      'capacitance', 'dielectric', 'farad', 'microfarad', 'resistor', 'resistivity', 'ohm', "ohm's law", 'kirchhoff', 'junction rule',
      'loop rule', 'electromotive', 'internal resistance', 'rc circuit', "gauss's law", 'electric flux', 'equipotential',
      'electroscope', 'van de graaff', 'point charge', 'test charge', 'ammeter', 'voltmeter', 'wheatstone', 'potentiometer',
      'short circuit', 'equivalent resistance', 'equivalent capacitance', 'permittivity', 'p-n junction', 'pn junction',
      'charge density', 'electric dipole', 'electrostatics', 'triboelectric', 'millikan', 'oil drop', 'oil-drop',
      'charge of the electron', 'charging by friction', 'charge separation', 'dry cell'],
    [2, 'voltage', 'volt', 'ampere', 'amp', 'milliamp*', 'resistance', 'circuit', 'battery', 'batteries', 'emf', 'time constant',
      'grounded', 'power dissipated', 'rms', 'diode', 'transistor', 'galvanometer', 'fuse', 'dipole', 'static electricity',
      'net charge', 'rubbed', 'recharge*', 'anode', 'cathode', 'electrode', 'electrochemical', 'voltaic'],
    [1, 'current', 'conductor', 'insulator', 'electron volt', 'charge', 'charged', 'electric', 'electrical', 'dissipate*',
      'root mean square', 'alternating current', 'direct current', 'dc', 'semiconductor', 'series', 'parallel', 'kilowatt-hour',
      'wire', 'light bulb', 'bulb', 'lightning', 'spark', 'potential', 'static'],
    [0.5, 'ac', 'electron', 'proton', 'positive', 'negative', 'power', 'watt', 'field'],
  ],
  // Magnetic fields and forces, electromagnets, Faraday's and Lenz's laws, inductance, transformers, motors, AC circuits.
  'magnetism-induction': [
    [3, 'magnetic field', 'magnetism', 'magnetization', 'tesla', 'weber', 'magnetic flux', 'lenz', 'induction', 'inductor',
      'inductance', 'henry', 'henries', 'self-inductance', 'mutual inductance', 'electromagnet', 'electromagnetic induction',
      'solenoid', 'toroid', "ampere's law", 'biot-savart', 'lorentz force', 'right-hand rule', 'right hand rule', 'cyclotron',
      'hall effect', 'transformer', 'eddy current', 'back emf', 'ferromagnet*', 'magnetic dipole', 'magnetic moment', 'rl circuit',
      'lc circuit', 'rlc', 'reactance', 'magnetic force', 'displacement current', 'current-carrying', 'velocity selector'],
    [2, 'magnetic', 'magnet', 'magnetized', 'faraday', 'induced', 'induce', 'induces', 'mass spectrometer', 'generator', 'motor',
      'paramagnet*', 'diamagnet*', 'curie temperature', 'compass', 'impedance', 'coil', 'permeability', 'moving charge'],
    [1, 'gauss', 'flux', 'resonant frequency', 'north pole', 'south pole', 'loop', 'turns', 'electromagnetic', 'maxwell', 'wire'],
    [0.5, 'current', 'charge', 'proton', 'electron', 'velocity'],
  ],
  // Pressure, buoyancy, Archimedes, Pascal, Bernoulli, continuity, viscosity, surface tension.
  fluids: [
    [3, 'fluid', 'buoyan*', 'archimedes', "pascal's principle", 'bernoulli', 'continuity equation', 'equation of continuity',
      'viscosity', 'viscous', 'laminar', 'reynolds', 'poiseuille', 'surface tension', 'capillar*', 'hydrostatic', 'float',
      'floating', 'submerged', 'hydraulic', 'gauge pressure', 'absolute pressure', 'manometer', 'flow rate', 'venturi', 'pitot',
      'torricelli', 'specific gravity', 'airfoil', 'siphon', 'fluid dynamics', 'water tank'],
    [2, 'turbulent', 'turbulence', 'stokes', 'immersed', 'sink', 'sinks', 'atmospheric pressure', 'barometer', 'pipe', 'nozzle', 'hose',
      'aerodynamic', 'density', 'densities', 'vortex', 'vortices', 'blood flow', 'kilograms per cubic meter', 'displaced'],
    [1, 'pascal', 'lift', 'wing', 'pressure', 'liquid', 'depth', 'dam', 'flow', 'flows'],
    [0.5, 'water', 'volume', 'area', 'air'],
  ],
  // Special and general relativity, photons and the photoelectric effect, quantum mechanics, atomic physics, lasers.
  'relativity-quantum': [
    [3, 'relativity', 'relativistic', 'special relativity', 'general relativity', 'time dilation', 'length contraction',
      'lorentz factor', 'lorentz contraction', 'gamma factor', 'e = mc', 'e=mc', 'mass-energy', 'rest mass', 'rest energy',
      'simultaneity', 'twin paradox', 'spacetime', 'space-time', 'photoelectric', 'work function', 'threshold frequency', 'planck',
      'de broglie', 'matter wave', 'wave-particle', 'uncertainty principle', 'heisenberg', 'schrodinger', 'wave function',
      'wavefunction', 'tunneling', 'compton', 'bohr', 'stimulated emission', 'zero-point', 'quantum mechanics', 'bose-einstein',
      'hamiltonian', 'rydberg', 'balmer', 'lyman', 'paschen', 'ultraviolet catastrophe', 'michelson-morley', 'aether',
      'gravitational redshift', 'equivalence principle', 'proper time', 'proper length', 'davisson', 'stern-gerlach', 'qubit',
      'entangle*', 'photon', 'quantum', 'aufbau', 'roentgen', 'emission of light', /(?<![a-z0-9])\d?\.\d+\s?c(?![a-z0-9])/, /\(\d\/\d\)\s?c(?![a-z0-9])/],
    [2, 'lorentz', 'inertial frame', 'speed of light', 'quanta', 'quantized', 'blackbody', 'black body', 'energy level',
      'hydrogen atom', 'pauli', 'laser', 'fermion', 'superconduct*', 'band gap', 'eigen*', 'emission spectrum', 'absorption spectrum',
      'spectral line', 'wien', 'ether', 'event horizon', 'atomic physics', 'ground state', 'excited state', 'electron microscope',
      'velocity of light', 'einstein'],
    [1, 'spin', 'boson', 'electron volt', 'ev', 'x-ray', 'wavelength', 'observer', 'frame', 'clock'],
    [0.5, 'electron', 'atom', 'energy', 'frequency', 'momentum', 'mass'],
  ],
  // Nuclei, radioactivity, fission and fusion, elementary particles, fundamental forces, accelerators.
  'nuclear-particle': [
    [3, 'nuclear', 'nucleon', 'radioactive', 'radioactivity', 'alpha decay', 'beta decay', 'gamma decay', 'alpha particle',
      'beta particle', 'half-life', 'half life', 'half-lives', 'fission', 'fusion', 'binding energy', 'mass defect',
      'chain reaction', 'critical mass', 'quark', 'lepton', 'hadron', 'baryon', 'meson', 'pion', 'muon', 'neutrino', 'positron',
      'antimatter', 'antiparticle', 'antiproton', 'antineutrino', 'gluon', 'higgs', 'w boson', 'z boson', 'standard model',
      'strong force', 'strong nuclear', 'weak force', 'weak nuclear', 'weak interaction', 'strong interaction',
      'fundamental force', 'color charge', 'color confinement', 'particle accelerator', 'collider', 'cern', 'lhc', 'fermilab',
      'cloud chamber', 'bubble chamber', 'geiger', 'feynman diagram', 'baryon number', 'lepton number', 'strangeness', 'isospin',
      'becquerel', 'sievert', 'dosimetry', 'radiation dose', 'deuteron', 'elementary particle', 'nuclide', 'transmutation',
      'electron capture', 'pair production', 'atomic bomb', 'particle physics', 'supersymmetry', 'superpartner',
      'pet scan', 'positron emission', 'bremsstrahlung'],
    [2, 'nucleus', 'nuclei', 'decay', 'gamma ray', 'isotope', 'tau', 'confinement', 'flavor', 'accelerator', 'charm', 'curie',
      'neutron', 'deuterium', 'tritium', 'uranium', 'plutonium', 'subatomic', 'mev', 'gev', 'tev', 'annihilation', 'cosmic ray',
      'boson', ISOTOPE],
    [1, 'proton', 'alpha', 'beta', 'gamma', 'particle'],
    [0.5, 'electron', 'mass', 'energy', 'charge', 'spin'],
  ],
};

/* ------------------------------------------------------------------ */
/* Earth and space                                                     */
/* ------------------------------------------------------------------ */

const EARTH_SPACE: RuleTable = {
  // Minerals and their properties, rock types, the rock cycle.
  'minerals-rocks': [
    [3, 'mineral', 'mineralogy', 'mohs', 'hardness', 'cleavage', 'luster', 'lustre', 'streak', 'crystal habit', 'crystal form',
      'crystal system', 'silicate', 'quartz', 'feldspar', 'plagioclase', 'orthoclase', 'microcline', 'mica', 'biotite', 'muscovite',
      'olivine', 'pyroxene', 'amphibole', 'hornblende', 'augite', 'anorthite', 'albite', 'calcite', 'aragonite', 'dolomite',
      'gypsum', 'halite', 'talc', 'corundum', 'diamond', 'topaz', 'fluorite', 'apatite', 'garnet', 'magnetite', 'hematite', 'pyrite',
      'galena', 'sphalerite', 'chalcopyrite', 'bauxite', 'kaolinite', 'clay mineral', 'zircon', 'beryl', 'tourmaline', 'serpentine',
      'chlorite', 'kyanite', 'sillimanite', 'andalusite', 'staurolite', 'igneous', 'sedimentary rock', 'metamorphic', 'metamorphism',
      'metamorphosed', 'rock cycle', 'intrusive', 'extrusive', 'plutonic', 'volcanic rock', 'granite', 'basalt', 'basaltic',
      'andesite', 'andesitic', 'rhyolite', 'rhyolitic', 'obsidian', 'pumice', 'scoria', 'tuff', 'gabbro', 'diorite', 'peridotite',
      'komatiite', 'porphyr*', 'phaneritic', 'aphanitic', 'vesicular', 'felsic', 'mafic', 'ultramafic', 'bowen', 'sandstone',
      'shale', 'conglomerate', 'breccia', 'siltstone', 'mudstone', 'claystone', 'chert', 'flint', 'evaporite', 'travertine', 'chalk',
      'coquina', 'clastic', 'detrital', 'lithification', 'cementation', 'compaction', 'slate', 'phyllite', 'schist', 'gneiss',
      'marble', 'quartzite', 'hornfels', 'foliat*', 'nonfoliated', 'non-foliated', 'contact metamorphism', 'regional metamorphism',
      'index mineral', 'gemstone', 'polymorph', 'tetragonal', 'monoclinic', 'triclinic', 'orthorhombic', 'rhombohedral',
      'birefringence', 'double refraction', 'effervesce*', 'geode', 'pegmatite', 'phenocryst', 'grain size', 'migmatite', 'eclogite',
      'blueschist', 'greenschist', 'amphibolite', 'granulite', 'mineralogist', 'petrology', 'crystallize', 'crystallization', 'native element', 'placer', 'azurite', 'malachite',
      'cinnabar', 'graphite', 'sulfur', 'barite', 'turquoise', 'opal', 'jade', 'jadeite', 'nephrite', 'ruby', 'sapphire', 'emerald',
      'spinel', 'rutile', 'ilmenite', 'cassiterite', 'wolframite', 'chromite', 'limonite', 'goethite', 'siderite', 'magnesite',
      'smithsonite', 'anhydrite', 'celestite', 'olivine group', 'allotrope'],
    [2, 'sedimentary', 'fracture', 'crystal', 'crystalline', 'texture', 'coal', 'anthracite', 'bituminous', 'lignite', 'ore', 'gem',
      'hexagonal', 'specific gravity', 'fizz*', 'glassy', 'sorting', 'bedding', 'limestone', 'rock', 'cross-bedding', 'ripple marks',
      'mud cracks'],
    [1, 'magma', 'lava', 'sediment', 'silica', 'carbonate', 'grain', 'sedimentation'],
    [0.5, 'iron'],
  ],
  // Plate tectonics, plate boundaries, earthquakes, faults and folds, volcanoes, mountain building.
  'tectonics-structure': [
    [3, 'plate tectonic*', 'tectonic', 'tectonics', 'plate boundary', 'plate boundaries', 'divergent', 'convergent', 'transform fault',
      'transform boundary', 'subduction', 'subduct*', 'rift', 'rifting', 'rift valley', 'mid-ocean ridge', 'mid-atlantic ridge',
      'seafloor spreading', 'sea-floor spreading', 'continental drift', 'wegener', 'pangaea', 'pangea', 'gondwana', 'laurasia',
      'rodinia', 'supercontinent', 'earthquake', 'richter', 'moment magnitude', 'mercalli', 'epicenter', 'hypocenter', 'fault',
      'faulting', 'normal fault', 'reverse fault', 'thrust fault', 'strike-slip', 'san andreas', 'horst', 'graben', 'fold', 'folding',
      'anticline', 'syncline', 'monocline', 'volcano', 'volcanism', 'eruption', 'erupt', 'erupted', 'shield volcano', 'stratovolcano',
      'composite volcano', 'cinder cone', 'caldera', 'hot spot', 'hotspot', 'mantle plume', 'island arc', 'volcanic arc', 'orogeny',
      'orogenic', 'mountain building', 'himalaya*', 'appalachian', 'ring of fire', 'strombolian', 'plinian', 'hawaiian eruption',
      'pelean', 'vulcanian', 'pyroclastic', 'tephra', 'lahar', 'magnetic striping', 'magnetic stripes', 'accretionary', 'ophiolite',
      'terrane', 'craton', 'aftershock', 'foreshock', 'seismic gap', 'flood basalt', 'large igneous province', 'yellowstone',
      'kilauea', 'mauna loa', 'st. helens', 'krakatoa', 'vesuvius', 'pinatubo', 'lithospheric plate', 'pacific plate',
      'north american plate', 'nazca', 'magma chamber', 'batholith', 'laccolith', 'pluton', 'fumarole', 'deccan', 'block mountain',
      'fault-block', 'structural geology', 'volcanology', 'volcanologist', 'lava flow', 'pahoehoe', "a'a", 'lava tube'],
    [2, 'volcanic', 'plate', 'trench', 'andes', 'transform', 'deformation', 'compression', 'compressional', 'tensional',
      'shear stress', 'dike', 'sill', 'fissure', 'uplift', 'traps', 'continental crust', 'oceanic crust', 'tsunami', 'seismic',
      'liquefaction'],
    [1, 'magma', 'lava', 'mountain', 'crust', 'stress', 'collision', 'dome', 'basin', 'shield', 'dip', 'strike', 'geyser'],
  ],
  // Core, mantle and crust, discontinuities, seismic waves as probes of the interior, the geodynamo, isostasy.
  'earth-interior': [
    [3, 'inner core', 'outer core', 'mantle', 'lower mantle', 'upper mantle', 'lithosphere', 'asthenosphere', 'moho*', 'gutenberg',
      'lehmann', 'discontinuity', 'p wave', 'p-wave', 's wave', 's-wave', 'primary wave', 'secondary wave', 'seismic wave',
      'shadow zone', 'body wave', 'surface wave', 'love wave', 'rayleigh wave', 'seismograph', 'seismometer', 'seismogram',
      'seismology', 'seismologist', 'geomagnetic', 'geomagnetism', 'dynamo', 'geothermal gradient', 'geotherm', 'isostasy',
      'isostatic', 'mantle convection', "earth's interior", 'interior of the earth', 'transition zone', 'bridgmanite', 'heat flow',
      'magnetic reversal', 'polarity reversal', 'paleomagnetism', 'paleomagnetic', 'radiogenic heat', 'internal heat',
      'layers of the earth', 'layer of the earth', 'ulvz', 'xenolith', 'kimberlite', 'magnetic pole', 'magnetic north'],
    [2, 'core', 'interior', 'magnetic field', 'convection current', 'crust', 'crustal', 'perovskite', 'mesosphere'],
    [1, 'iron', 'nickel', 'seismic', 'convection', 'density', 'depth', 'magnetic', 'layer', 'slab', 'plume'],
    [0.5, 'pressure'],
  ],
  // Weathering, erosion and deposition, soils, rivers, groundwater, glaciers, deserts and wind, coasts, mass wasting.
  'surface-hydrology': [
    [3, 'weathering', 'weathered', 'erosion', 'eroded', 'erode', 'erodes', 'erosional', 'deposition', 'depositional', 'soil',
      'soil horizon', 'regolith', 'humus', 'laterite', 'meander', 'oxbow', 'floodplain', 'flood plain', 'levee', 'alluvial',
      'alluvium', 'drainage', 'watershed', 'drainage basin', 'discharge', 'tributary', 'base level', 'groundwater', 'ground water',
      'aquifer', 'aquitard', 'water table', 'porosity', 'permeability', 'permeable', 'impermeable', 'artesian', 'karst', 'sinkhole',
      'cave', 'cavern', 'stalactite', 'stalagmite', 'speleothem', 'glacier', 'glacial', 'glaciated', 'moraine', 'esker', 'drumlin',
      'kame', 'kettle', 'cirque', 'arete', 'fjord', 'till', 'outwash', 'erratic', 'striation', 'u-shaped', 'v-shaped',
      'hanging valley', 'tarn', 'ice sheet', 'ice cap', 'continental glacier', 'valley glacier', 'alpine glacier', 'mass wasting',
      'mass movement', 'landslide', 'creep', 'slump', 'mudflow', 'debris flow', 'rockfall', 'rock fall', 'rockslide', 'talus',
      'scree', 'solifluction', 'dune', 'loess', 'deflation', 'ventifact', 'desert pavement', 'yardang', 'playa', 'alluvial fan',
      'bajada', 'pediment', 'inselberg', 'mesa', 'butte', 'arroyo', 'wadi', 'longshore', 'spit', 'barrier island', 'sandbar',
      'tombolo', 'sea stack', 'sea arch', 'wave-cut', 'hydrologic cycle', 'water cycle', 'infiltration', 'runoff',
      'evapotranspiration', 'frost wedging', 'frost action', 'exfoliation', 'chemical weathering', 'mechanical weathering',
      'physical weathering', 'abrasion', 'landform', 'geomorphology', 'periglacial', 'sediment transport', 'bed load',
      'suspended load', 'dissolved load', 'stream gradient', 'headwaters', 'cone of depression', 'hydrology', 'hydrologic',
      'saturated zone', 'unsaturated zone', 'zone of aeration', 'braided', 'waterfall', 'gorge', 'cation exchange', 'topsoil',
      'subsoil', 'hardpan', 'caliche', 'podzol', 'fresh water', 'freshwater', 'glaciation'],
    [2, 'river', 'stream', 'delta', 'lake', 'flood', 'flooding', 'beach', 'canyon', 'topography', 'wetland', 'swamp', 'marsh', 'bog',
      'gravel', 'silt', 'desert', 'permafrost', 'well', 'horn'],
    [1, 'sediment', 'sand', 'clay', 'valley', 'ice', 'coast', 'coastal', 'shoreline', 'limestone', 'spring', 'mouth', 'estuary'],
    [0.5, 'water', 'wind'],
  ],
  // Geologic time scale, relative and absolute dating, fossils, extinctions, Earth's history.
  'geologic-time-fossils': [
    [4, 'unconformity', 'disconformity', 'nonconformity', 'angular unconformity'],
    [3, 'fossil', 'fossilized', 'fossilization', 'petrified', 'trace fossil', 'index fossil', 'paleontolog*', 'dinosaur', 'trilobite',
      'ammonite', 'brachiopod', 'graptolite', 'geologic time', 'geologic time scale', 'geological time', 'eon', 'precambrian',
      'hadean', 'archean', 'proterozoic', 'phanerozoic', 'paleozoic', 'mesozoic', 'cenozoic', 'cambrian', 'ordovician', 'silurian',
      'devonian', 'carboniferous', 'mississippian', 'pennsylvanian', 'permian', 'triassic', 'jurassic', 'cretaceous', 'paleogene',
      'neogene', 'tertiary', 'quaternary', 'pleistocene', 'holocene', 'eocene', 'oligocene', 'miocene', 'pliocene', 'paleocene',
      'ediacaran', 'burgess shale', 'mass extinction', 'extinction', 'extinct', 'k-t', 'k-pg', 'chicxulub', 'radiometric',
      'radioactive dating', 'radiometric dating', 'absolute dating', 'absolute age', 'relative dating', 'relative age',
      'uranium-lead', 'potassium-argon', 'argon-argon', 'rubidium-strontium', 'carbon-14', 'radiocarbon', 'carbon dating',
      'stratigraph*', 'superposition', 'original horizontality', 'lateral continuity', 'cross-cutting', 'cross cutting', 'faunal succession',
      'uniformitarianism', 'catastrophism', 'hutton', 'lyell', 'steno', 'strata', 'stratum', 'billion years ago', 'million years ago',
      'banded iron', 'great oxidation', 'oxygen catastrophe', 'stromatolite', 'snowball earth', 'varve', 'dendrochronology',
      'parent isotope', 'daughter isotope', 'age of the earth', 'cambrian explosion', 'end-permian', 'end-cretaceous',
      'geologic history', 'history of the earth', 'early earth', 'principle of inclusions', 'inclusions', 'ichnofossil',
      'coprolite', 'time of appearance'],
    [2, 'era', 'epoch', 'years ago', 'half-life', 'oldest', 'earliest', 'first appeared', 'dating', 'dated', 'rock layers', 'age'],
    [1, 'isotope', 'ice age', 'pangaea', 'ma', 'ga', 'mya', 'bya', 'layer', 'sedimentary', 'shells', 'bones', 'species', 'evolution',
      'evolved', 'organisms'],
  ],
  // Atmosphere structure and composition, weather, clouds, storms, fronts, global circulation, climate and climate change.
  'meteorology-climate': [
    [3, 'troposphere', 'stratosphere', 'thermosphere', 'exosphere', 'ionosphere', 'tropopause', 'stratopause', 'ozone',
      'ozone layer', 'weather', 'meteorolog*', 'climate', 'climatic', 'climatolog*', 'cloud', 'cumulus', 'cumulonimbus', 'stratus',
      'cirrus', 'nimbostratus', 'altocumulus', 'altostratus', 'cirrostratus', 'cirrocumulus', 'stratocumulus', 'lenticular',
      'mammatus', 'incus', 'fog', 'precipitation', 'rainfall', 'snowfall', 'hail', 'hailstone', 'sleet', 'freezing rain', 'drizzle',
      'humidity', 'relative humidity', 'dew point', 'dewpoint', 'lapse rate', 'adiabatic', 'cold front', 'warm front', 'occluded',
      'stationary front', 'air mass', 'jet stream', 'trade wind', 'westerlies', 'easterlies', 'hadley', 'ferrel', 'polar cell',
      'polar front', 'monsoon', 'coriolis', 'pressure gradient', 'high pressure', 'low pressure', 'cyclone', 'anticyclone',
      'hurricane', 'typhoon', 'tropical storm', 'tropical cyclone', 'tornado', 'thunderstorm', 'lightning', 'thunder', 'supercell',
      'mesocyclone', 'fujita', 'saffir-simpson', 'sea breeze', 'land breeze', 'chinook', 'foehn', 'santa ana', 'katabatic',
      'barometric', 'isobar', 'millibar', 'greenhouse effect', 'greenhouse gas', 'global warming', 'climate change', 'el nino',
      'la nina', 'enso', 'southern oscillation', 'albedo', 'insolation', 'milankovitch', 'milankovich', 'koppen', 'aerosol', 'smog',
      'acid rain', 'air pollution', 'temperature inversion', 'virga', 'cfc', 'chlorofluorocarbon*', 'radiosonde', 'doppler radar',
      'nexrad', 'beaufort', 'anemometer', 'hygrometer', 'psychrometer', 'air pressure', 'atmospheric pressure', 'blizzard',
      'heat wave', "nor'easter", 'derecho', 'squall line', 'polar vortex', 'arctic oscillation', 'north atlantic oscillation',
      'weather map', 'forecast', 'forecasting', 'meteorologist', 'storm surge', 'eye wall', 'eyewall', 'radiative forcing',
      'urban heat island', 'microclimate', 'mediterranean climate', 'continental climate', 'orographic', 'rain shadow',
      'stable air', 'unstable air', 'air parcel', 'mixing ratio', 'specific humidity', 'precipitable', 'stratospheric', 'rime',
      'interglacial', 'glacial period', 'paleoclimate', 'ice core', 'climate model', 'atmospheric circulation', 'global circulation', 'atmosphere', 'isotherm', 'radiational cooling', 'radiative equilibrium', 'carbon sink',
      'oxygen-18', 'oxygen isotope', 'driest', 'wettest', 'tundra'],
    [2, 'atmospheric', 'front', 'storm', 'tropical', 'temperate', 'arid', 'semiarid', 'steppe', 'maritime', 'convective',
      'saturated', 'saturation', 'water vapor', 'halo', 'rainbow', 'drought', 'wind', 'rain', 'snow', 'latent heat', 'humid',
      'inversion', 'dew', 'frost', 'ice age', 'condensation'],
    [1, 'air', 'season', 'polar', 'carbon dioxide', 'methane', 'nitrous oxide', 'sulfur dioxide', 'ultraviolet', 'uv', 'corona'],
    [0.5, 'temperature', 'pressure', 'latitude', 'nitrogen', 'oxygen', 'argon', 'gas', 'layer'],
  ],
  // Ocean water properties, currents and circulation, tides, waves, the sea floor, marine sediments.
  oceanography: [
    [3, 'ocean', 'oceanic', 'oceanograph*', 'gulf stream', 'kuroshio', 'gyre', 'thermohaline', 'upwelling', 'downwelling', 'ekman',
      'salinity', 'saline', 'halocline', 'thermocline', 'pycnocline', 'tide', 'tidal', 'spring tide', 'neap tide', 'high tide',
      'low tide', 'tidal range', 'swell', 'rogue wave', 'continental shelf', 'continental slope', 'continental rise',
      'continental margin', 'abyssal', 'abyssal plain', 'seamount', 'guyot', 'mariana', 'hydrothermal vent', 'black smoker', 'atoll',
      'seawater', 'sea water', 'sea level', 'sea ice', 'iceberg', 'brine', 'phytoplankton', 'zooplankton', 'ooze',
      'carbonate compensation', 'labrador current', 'california current', 'humboldt', 'peru current', 'canary current', 'benguela',
      'brazil current', 'antarctic circumpolar', 'loop current', 'agulhas', 'sargasso', 'bathymetr*', 'longshore current',
      'rip current', 'north atlantic deep water', 'antarctic bottom water', 'deep water', 'bottom water', 'indian ocean',
      'arctic ocean', 'southern ocean', 'surface current', 'deep current', 'western boundary', 'eastern boundary', 'wave height',
      'wave base', 'sea floor', 'seafloor', 'ocean floor', 'ocean basin', 'manganese nodule', 'turbidity current', 'turbidite',
      'submarine canyon', 'dead zone', 'hypoxia', 'hypoxic', 'mixed layer', 'sea surface temperature', 'euphotic', 'coccolith*',
      'marine sediment', 'oceanographer', 'tsunami', 'transpolar drift', 'arctic basin', 'desalination', 'organic carbon'],
    [2, 'sea', 'marine', 'current', 'wave', 'coral reef', 'reef', 'lagoon', 'calcareous', 'siliceous', 'benthic', 'pelagic',
      'plankton', 'trench', 'estuary', 'fetch', 'gulf of mexico', 'caribbean', 'mid-ocean ridge', 'sonar', 'photic zone', 'aphotic'],
    [1, 'atlantic', 'pacific', 'beach', 'shore', 'coast', 'coastal', 'ridge', 'bay', 'gulf', 'strait', 'kelp', 'whale', 'fish', 'shell',
      'diatom', 'foraminifera', 'radiolarian', 'el nino', 'la nina', 'salt', 'deep', 'depth', 'dissolved oxygen'],
    [0.5, 'water', 'warm', 'cold'],
  ],
  // The Sun's family: planets, moons, dwarf planets, asteroids, comets, meteors, eclipses and lunar phases,
  // space missions, the solar wind at Earth (aurora, magnetosphere), Earth's orbit and seasons.
  'solar-system': [
    [3, 'planet', 'planetary', 'mercury', 'venus', 'venusian', 'mars', 'martian', 'jupiter', 'jovian', 'saturn', 'uranus', 'neptune',
      'pluto', 'dwarf planet', 'ceres', 'eris', 'haumea', 'makemake', 'sedna', 'moon', 'lunar', 'io', 'europa', 'ganymede', 'callisto',
      'titan', 'enceladus', 'triton', 'phobos', 'deimos', 'charon', 'miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'puck',
      'portia', 'mimas', 'iapetus', 'hyperion', 'rhea', 'dione', 'tethys', 'nereid', 'proteus', 'amalthea', 'asteroid',
      'asteroid belt', 'kuiper', 'oort', 'comet', 'cometary', 'meteor', 'meteoroid', 'meteorite', 'meteor shower', 'tunguska',
      'impact crater', 'solar system', 'terrestrial planet', 'gas giant', 'ice giant', 'great red spot', 'perihelion', 'aphelion',
      'astronomical unit', 'eclipse', 'solar eclipse', 'lunar eclipse', 'phases of the moon', 'moon phase', 'waxing', 'waning',
      'gibbous', 'crescent', 'new moon', 'full moon', 'first quarter', 'third quarter', 'nebular hypothesis', 'protoplanetary',
      'planetesimal', 'voyager', 'cassini', 'new horizons', 'mariner', 'curiosity rover', 'perseverance', 'spirit rover', 'rover',
      'lander', 'orbiter', 'spacecraft', 'space probe', 'osiris-rex', 'rosetta', 'heliosphere', 'heliopause', 'termination shock',
      'magnetosphere', 'van allen', 'aurora', 'aurora borealis', 'northern lights', 'trojan', 'lagrange', 'lagrangian point', 'roche',
      'tidal locking', 'tidally locked', 'synchronous rotation', 'equinox', 'solstice', 'obliquity', 'axial tilt', 'kirkwood',
      'centaur', 'near-earth', 'bolide', 'fireball', 'chondrite', 'achondrite', 'tektite', 'shepherd moon', 'cassini division',
      'olympus mons', 'valles marineris', "kepler's laws", 'orbital period', 'orbital eccentricity', 'synodic period',
      'sidereal period', 'retrograde motion', 'cryovolcan*', 'exoplanet', 'habitable zone', 'goldilocks', 'planets', 'orbital debris', 'space debris', 'explorer i', 'sputnik',
      'tilt of the earth', 'earth\'s axis'],
    [2, 'crater', 'ring', 'retrograde', 'au', 'conjunction', 'opposition', 'elongation', 'occultation', 'apollo', 'juno', 'mission',
      'viking', 'curiosity', 'maria', 'mare', 'kepler', 'orbit', 'seasons'],
    [1, 'orbital', 'sun', 'solar', 'atmosphere', 'nasa', 'probe', 'transit', 'regolith', 'magellan', 'pioneer', 'messenger', 'dawn',
      'galileo'],
    [0.5, 'earth', 'surface', 'space'],
  ],
  // Stellar properties and evolution, the H-R diagram, the Sun's structure and activity, stellar remnants.
  stars: [
    [3, 'stellar', 'main sequence', 'main-sequence', 'hertzsprung', 'h-r diagram', 'hr diagram', 'red giant', 'giant star',
      'supergiant', 'white dwarf', 'brown dwarf', 'red dwarf', 'neutron star', 'pulsar', 'magnetar', 'supernova', 'supernovae', 'nova',
      'novae', 'planetary nebula', 'protostar', 't tauri', 'cepheid', 'rr lyrae', 'variable star', 'binary star', 'eclipsing binary',
      'spectroscopic binary', 'visual binary', 'spectral class', 'spectral type', 'obafgkm', 'luminosity', 'chandrasekhar',
      'degeneracy pressure', 'electron degeneracy', 'neutron degeneracy', 'proton-proton', 'cno cycle', 'triple-alpha',
      'triple alpha', 'helium flash', 'helium fusion', 'hydrogen fusion', 'hydrogen burning', 'helium burning', 'shell burning',
      'photosphere', 'chromosphere', 'coronal', 'coronal mass ejection', 'convective zone', 'convection zone', 'radiative zone',
      'radiation zone', 'sunspot', 'solar flare', 'prominence', 'spicule', 'granulation', 'solar cycle', 'sunspot cycle', 'maunder',
      'solar wind', 'solar radius', 'solar luminosity', "sun's core", 'core of the sun', 'betelgeuse', 'rigel',
      'sirius', 'vega', 'proxima', 'alpha centauri', 'antares', 'aldebaran', 'arcturus', 'deneb', 'altair', 'spica', 'capella',
      'procyon', 'wolf-rayet', 'blue giant', 'red supergiant', 'stellar evolution', 'star cluster', 'open cluster', 'globular cluster',
      'pleiades', 'stellar wind', 'schwarzschild', 'hawking radiation', 'crab nebula', 'orion nebula', 'eagle nebula',
      'mass-luminosity', 'eddington', 'hydrostatic equilibrium', 'stellar core', 'iron core', 'core collapse', 'type ia', 'type ii',
      'standard candle', 'period-luminosity', 'subgiant', 'horizontal branch', 'asymptotic giant', 'accretion disk', 'x-ray binary',
      'gamma-ray burst', 'kilonova', 'solar neutrino', 'star', 'event horizon', 'black hole'],
    [2, 'nebula', 'luminous', 'flare', 'corona', 'solar mass', 'absolute magnitude', 'spectral lines', 'effective temperature', 'blackbody', 'wien',
      'stefan-boltzmann', 'neutrino', 'fusion', 'nucleosynthesis', 'sun', 'surface temperature'],
    [1, 'solar', 'hydrogen', 'helium', 'magnitude', 'spectrum', 'spectra', 'gravitational wave'],
    [0.5, 'temperature', 'mass', 'carbon', 'iron', 'radius'],
  ],
  // Galaxies, the Milky Way, interstellar medium, quasars, the expanding universe, the Big Bang, dark matter and dark energy.
  'galaxies-cosmology': [
    [5, 'sagittarius a'],
    [3, 'galaxy', 'galactic', 'milky way', 'andromeda', 'spiral galaxy', 'elliptical galaxy', 'irregular galaxy',
      'lenticular galaxy', 'barred spiral', "hubble's law", 'hubble constant', 'hubble flow', 'redshift', 'red shift', 'red-shift',
      'blueshift', 'cosmolog*', 'big bang', 'cosmic microwave background', 'microwave background', 'cmb', 'cmbr', 'inflation',
      'inflationary', 'dark matter', 'dark energy', 'expanding universe', 'expansion of the universe', 'quasar', 'active galactic',
      'agn', 'blazar', 'seyfert', 'radio galaxy', 'galaxy cluster', 'cluster of galaxies', 'supercluster', 'local group',
      'virgo cluster', 'gravitational lens*', 'magellanic', 'olbers', 'critical density', 'hubble time', 'age of the universe',
      'big crunch', 'big rip', 'heat death', 'multiverse', 'supermassive black hole', 'supermassive',
      'galactic center', 'galactic nucleus', 'galactic halo', 'galactic disk', 'spiral arm', 'hubble sequence', 'hubble tuning fork',
      'cosmic web', 'large-scale structure', 'lyman-alpha forest', 'baryon acoustic', 'wmap', 'cobe', 'planck satellite',
      'cosmological constant', 'scale factor', 'friedmann', 'lemaitre', 'gamow', 'penzias', 'shapley', 'great debate',
      'interstellar medium', 'intergalactic', 'rotation curve', 'big bang nucleosynthesis', '21-centimeter', '21 centimeter', '21-cm', 'universe', 'microlensing', 'vacuum energy'],
    [2, 'cosmic', 'interstellar', 'primordial', 'recombination', 'bulge', 'baryonic', 'wimp', 'axion', 'mond', 'steady state',
      'tuning fork', 'void'],
    [1, 'hubble', 'expansion', 'expanding', 'distant', 'billion light-years', 'cluster', 'halo', 'nucleosynthesis', 'black hole'],
  ],
  // Telescopes and instruments, the celestial sphere and coordinates, constellations, magnitudes, parallax, timekeeping.
  'observational-astronomy': [
    [3, 'telescope', 'refracting', 'reflecting telescope', 'refractor', 'reflector', 'aperture', 'focal ratio', 'f-ratio',
      'eyepiece', 'magnification', 'resolving power', 'angular resolution', 'light-gathering', 'light gathering', 'adaptive optics',
      'interferometr*', 'radio telescope', 'spectrograph', 'photometr*', 'charge-coupled', 'observatory', 'hubble space telescope',
      'james webb', 'jwst', 'chandra', 'spitzer', 'kepler space telescope', 'kepler mission', 'tess', 'gaia', 'hipparcos', 'arecibo',
      'keck', 'very large array', 'alma', 'altazimuth', 'alt-azimuth', 'equatorial mount', 'celestial sphere', 'celestial equator',
      'celestial pole', 'north celestial pole', 'south celestial pole', 'right ascension', 'declination', 'ecliptic', 'zenith',
      'nadir', 'azimuth', 'constellation', 'asterism', 'zodiac', 'zodiacal', 'circumpolar', 'sidereal', 'synodic', 'solar day',
      'sidereal day', 'parallax', 'parsec', 'arcsecond', 'arcsec', 'arcminute', 'apparent magnitude', 'distance modulus',
      'naked eye', 'messier', 'ngc', 'big dipper', 'little dipper', 'cassiopeia', 'ursa major', 'ursa minor', 'north star',
      'pole star', 'polaris', 'astrolabe', 'sextant', 'schmidt', 'cassegrain', 'newtonian telescope', 'atmospheric window',
      'light pollution', 'airmass', 'local noon', 'culminat*', 'analemma', 'equation of time', 'great circle', 'vernal equinox',
      'first point of aries', 'hour angle', 'local sidereal', 'amateur astronomer', 'coronagraph', 'bolometer', 'celestial',
      'night sky', 'stargazer', 'kirchhoff', 'time zone', /earth (?:rotates?|turns?)/, 'rotation of the earth'],
    [2, 'mount', 'horizon', 'altitude', 'meridian', 'magnitude', 'light-year', 'light year', 'precession', 'newtonian', 'galilean',
      'spectroscop*', 'spectrometer', 'detector', 'calendar', 'julian', 'mirror', 'lens', 'sky', 'orion', 'faintest', 'brightest'],
    [1, 'observer', 'observe', 'observed', 'observing', 'observation', 'latitude', 'transit', 'astronomer', 'radio waves', 'infrared',
      'x-ray', 'gamma-ray', 'ultraviolet', 'wavelength', 'photograph', 'image', 'imaging', 'objective', 'diameter', 'brightness',
      'brighter', 'faint', 'fainter', 'seeing', 'distance', 'astronomy', 'time zone', 'leap year'],
    [0.5, 'visible', 'see', 'astronomical', 'star'],
  ],
};

/* ------------------------------------------------------------------ */
/* Energy                                                              */
/* ------------------------------------------------------------------ */

/** A DOE national lab, user facility or program named in the question. */
const DOE_LABS =
  /(?<![a-z])(?:national lab|national laboratory|national laboratories|national accelerator|argonne|oak ridge|brookhaven|fermilab|fermi national|slac|lawrence berkeley|berkeley lab|lawrence livermore|livermore|los alamos|sandia|pacific northwest|pnnl|nrel|national renewable energy lab|idaho national|ames lab|ames laboratory|jefferson lab|thomas jefferson|princeton plasma|pppl|savannah river|national energy technology|netl|joint bioenergy|jbei|bioenergy research center|joint genome institute|bioenergy science center|great lakes bioenergy|advanced light source|advanced photon source|spallation neutron source|national synchrotron|linac coherent|lcls|nersc|diii-d|d3d|arpa-e|office of science|energy frontier research|relativistic heavy ion collider|rhic|electron-ion collider|national spherical torus|nstx|deep underground neutrino|sanford underground|desi|lsst|atlas experiment|cms detector|cms experiment|national ignition|z machine|titan supercomputer|summit supercomputer|frontier supercomputer)(?![a-z])/;

const ENERGY: RuleTable = {
  // Energy forms and conversions, efficiency, thermodynamics of engines and heat pumps, lighting, buildings,
  // appliances and vehicles.
  'conversion-efficiency': [
    [3, 'efficiency', 'energy conversion', 'conversion efficiency', 'carnot', 'heat engine', 'thermal efficiency', 'heat pump',
      'coefficient of performance', 'heat rate', 'cogeneration', 'combined heat and power', 'chp', 'combined cycle',
      'combined-cycle', 'waste heat', 'incandescent', 'fluorescent', 'cfl', 'led', 'light-emitting diode', 'light bulb', 'lumen',
      'luminous efficacy', 'insulation', 'r-value', 'u-value', 'energy star', 'weatherization', 'weatherstrip*', 'caulk*',
      'energy audit', 'thermostat', 'hvac', 'standby power', 'phantom load', 'vampire', 'energy-efficient', 'energy efficient',
      'energy efficiency', 'otto cycle', 'diesel cycle', 'rankine', 'brayton', 'energy transformation', 'forms of energy',
      'form of energy', 'thermoelectric', 'seebeck', 'peltier', 'hybrid vehicle', 'fuel economy', 'mpg', 'miles per gallon',
      'regenerative braking', 'joule heating', 'heat loss', 'passive house', 'absorption refrigeration',
      'first law of thermodynamics', 'second law of thermodynamics', 'perpetual motion', 'double-pane', 'low-e',
      'geothermal heat pump', 'smart thermostat', 'energy saving', 'energy savings', 'conservation of energy', 'leed',
      'green building', 'induction cooktop', 'evaporative cooling', 'cooktop',
      'secondary energy source', 'energy carrier', 'useful energy', 'mechanical energy', 'isobaric',
      'isothermal', 'adiabatic', 'isochoric'],
    [2, 'lighting', 'insulate', 'insulating', 'air conditioner', 'air conditioning', 'furnace', 'boiler', 'water heater',
      'appliance', 'electric motor', 'engine', 'internal combustion', 'steam turbine', 'gas turbine', 'kinetic energy',
      'potential energy', 'chemical energy', 'electrical energy', 'thermal energy', 'radiant energy', 'converts', 'converted',
      'conversion', 'heat transfer', 'conduction', 'convection', 'energy loss', 'refrigerator', 'refrigeration', 'heat exchanger',
      'thermodynamics', 'entropy', 'efficient', 'ground-source', 'law of conservation', 'power output', 'work done', 'ideal gas'],
    [1, 'motor', 'convert', 'hybrid', 'losses', 'building', 'cooling', 'heating', 'windows', 'work', 'heat', 'input', 'output',
      'thermal', 'mechanical', 'spring'],
    [0.5, 'energy', 'temperature', 'electricity'],
  ],
  // Coal, oil and natural gas: formation, extraction, refining, products, combustion, emissions control, carbon capture.
  'fossil-fuels': [
    [3, 'fossil fuel', 'coal', 'anthracite', 'bituminous', 'subbituminous', 'sub-bituminous', 'lignite', 'peat', 'petroleum',
      'crude oil', 'oil well', 'drilling', 'refinery', 'refineries', 'refining', 'cracking', 'catalytic cracking', 'hydrocracking',
      'reforming', 'kerosene', 'jet fuel', 'octane rating', 'natural gas', 'lng', 'liquefied natural gas', 'shale gas', 'shale oil',
      'oil shale', 'tar sand', 'oil sand', 'bitumen', 'fracking', 'hydraulic fracturing', 'fracturing', 'horizontal drilling',
      'enhanced oil recovery', 'oil recovery', 'oil reservoir', 'reservoir rock', 'cap rock', 'source rock', 'kerogen', 'pipeline',
      'opec', 'strategic petroleum reserve', 'flue gas', 'scrubber', 'flue gas desulfurization', 'carbon capture',
      'carbon sequestration', 'sequestration', 'sequester*', 'ccs', 'clean coal', 'coal gasification', 'gasification', 'syngas',
      'synthesis gas', 'coke', 'coal gas', 'methane hydrate', 'methane clathrate', 'clathrate', 'gas hydrate', 'hydrocarbon',
      'marcellus', 'bakken', 'offshore drilling', 'deepwater horizon', 'oil spill', 'fuel oil', 'heating oil', 'fly ash',
      'mountaintop removal', 'strip mining', 'longwall', 'coal mine', 'coal mining', 'fractional distillation', 'fractionating',
      'sour gas', 'sweet crude', 'sour crude', 'api gravity', 'oil field', 'oilfield', 'gas field', 'tetraethyl lead', 'knocking',
      'antiknock', 'mtbe', 'catalytic converter', 'smokestack', 'mercury emissions', 'saline aquifer', 'saline reservoir',
      'drake well', 'edwin drake', 'oil', 'gasoline', 'diesel', 'desulfuriz*', 'claus', 'capture carbon', 'co2 capture',
      'carbon dioxide capture'],
    [2, 'crude', 'methane', 'propane', 'butane', 'octane', 'distillation', 'well', 'rig', 'mine', 'mining', 'combustion',
      'sulfur dioxide', 'nitrogen oxides', 'nox', 'sox', 'particulate', 'soot', 'black carbon', 'barrel'],
    [1, 'burning', 'burn', 'burned', 'emissions', 'pollutant', 'acid rain', 'carbon dioxide', 'fuel', 'gas', 'sulfur', 'mercury',
      'greenhouse'],
  ],
  // Fission reactors and their fuel cycle, radiation and safety, waste, fusion research.
  'nuclear-energy': [
    [3, 'nuclear reactor', 'reactor', 'nuclear power', 'nuclear plant', 'nuclear energy', 'nuclear fuel', 'fission', 'fissile',
      'fissionable', 'chain reaction', 'critical mass', 'criticality', 'supercritical', 'subcritical', 'uranium', 'u-235', 'u-238',
      'u-233', 'pu-239', 'plutonium', 'thorium', 'enrichment', 'enriched', 'yellowcake', 'fuel rod', 'fuel pellet', 'fuel assembly',
      'control rod', 'moderator', 'coolant', 'heavy water', 'light water', 'pressurized water', 'boiling water reactor', 'pwr', 'bwr',
      'candu', 'breeder', 'fast reactor', 'fast neutron', 'spent fuel', 'nuclear waste', 'radioactive waste', 'high-level waste',
      'yucca', 'decommission*', 'meltdown', 'chernobyl', 'fukushima', 'three mile island', 'fusion', 'tokamak', 'stellarator', 'iter',
      'nif', 'inertial confinement', 'magnetic confinement', 'deuterium', 'tritium', 'rem', 'millirem', 'sievert', 'millisievert',
      'dosimeter', 'background radiation', 'radiation exposure', 'radiation dose', 'small modular reactor', 'smr', 'nrc',
      'nuclear regulatory', 'decay heat', 'xenon poisoning', 'neutron economy', 'binding energy', 'nuclear', 'containment',
      'reprocessing', 'mox', 'mixed oxide', 'zircaloy', 'cherenkov', 'neutron flux', 'scram', 'loss of coolant',
      'high-temperature gas', 'gas-cooled', 'molten salt reactor', 'pebble bed', 'sodium-cooled', 'lead-cooled', 'lawson',
      'iron-56', 'nuclear fusion', 'nuclear fission'],
    [2, 'fertile', 'centrifuge', 'plasma', 'neutron', 'radiation', 'radioactive', 'radioactivity', 'half-life', 'half life',
      'isotope', 'alpha decay', 'beta decay', 'gamma ray', 'alpha particle', 'beta particle', 'ignition', 'nucleosynthesis', 'mev',
      ISOTOPE],
    [1, 'nucleus', 'nuclei', 'fuel', 'atom', 'energy released'],
  ],
  // Photovoltaics and solar thermal: semiconductors, cell types, the solar resource, concentrating solar power.
  solar: [
    [3, 'solar', 'photovoltaic', 'pv', 'solar cell', 'solar panel', 'solar module', 'solar array', 'solar thermal',
      'concentrating solar', 'concentrated solar', 'csp', 'heliostat', 'power tower', 'parabolic trough', 'solar collector',
      'solar water heater', 'passive solar', 'insolation', 'irradiance', 'solar radiation', 'polysilicon', 'monocrystalline',
      'polycrystalline', 'multicrystalline', 'amorphous silicon', 'thin film', 'thin-film', 'cadmium telluride', 'cdte', 'cigs',
      'copper indium', 'perovskite', 'dye-sensitized', 'gallium arsenide', 'band gap', 'bandgap', 'p-n junction', 'pn junction',
      'pn-junction', 'p-type', 'n-type', 'shockley-queisser', 'net metering', 'solar tracking', 'multijunction', 'multi-junction',
      'tandem cell', 'organic photovoltaic', 'photoelectrochemical', 'artificial photosynthesis', 'solar fuel', 'ivanpah',
      'electron-hole', 'solar energy', 'solar power'],
    [2, 'sunlight', 'inverter', 'doping', 'dopant', 'doped', 'quantum dot', 'molten salt', 'silicon', 'semiconductor', 'exciton',
      'photoelectric', 'rooftop', 'panel'],
    [1, 'sun', 'photon', 'light', 'cell'],
  ],
  // Wind, hydro, geothermal, biomass and biofuels, ocean energy (tides, waves, thermal gradients).
  renewables: [
    [3, 'wind', 'wind turbine', 'wind farm', 'wind power', 'wind energy', 'nacelle', 'betz', 'offshore wind', 'vertical axis',
      'horizontal axis', 'hydroelectric', 'hydroelectricity', 'hydropower', 'hydro', 'dam', 'penstock', 'run-of-river',
      'water wheel', 'kaplan', 'francis turbine', 'pelton', 'geothermal', 'hot dry rock', 'enhanced geothermal', 'binary cycle',
      'flash steam', 'dry steam', 'the geysers', 'biomass', 'biofuel', 'bioenergy', 'biodiesel', 'bio-diesel', 'ethanol',
      'cellulosic', 'corn ethanol', 'biogas', 'landfill gas', 'anaerobic digest*', 'digester', 'switchgrass', 'miscanthus', 'algal',
      'microalgae', 'feedstock', 'transesterification', 'glycerin', 'glycerine', 'glycerol', 'firewood', 'tidal power',
      'tidal energy', 'tidal', 'tide', 'wave power', 'wave energy', 'ocean thermal', 'otec', 'renewable', 'butanol', 'e85', 'e10',
      'flex fuel', 'flex-fuel', 'cellulase', 'lignocellulos*', 'lignin', 'hemicellulose', 'sugarcane', 'vegetable oil', 'cooking oil',
      'animal fat', 'jatropha', 'camelina', 'stover', 'bagasse', 'biorefinery', 'pyrolysis', 'bio-oil', 'renewable diesel',
      'green diesel', 'biojet', 'hydrokinetic', 'salinity gradient', 'osmotic power', 'cut-in speed', 'cut-out speed', 'tip speed',
      'water power', 'cetane', 'bioplastic', 'essential oil', 'soybean', 'biosolids'],
    [2, 'turbine', 'blade', 'rotor', 'yaw', 'anemometer', 'landfill', 'wood', 'pellets', 'charcoal',
      'algae', 'corn', 'cellulose', 'river', 'capacity factor'],
    [1, 'crop', 'waste', 'ocean', 'reservoir', 'water', 'fermentation', 'ferment'],
    [0.5, 'plant', 'fuel'],
  ],
  // Batteries, capacitors, pumped hydro and other storage, hydrogen production and storage, fuel cells, electric vehicles.
  'storage-hydrogen': [
    [3, 'battery', 'batteries', 'lithium-ion', 'li-ion', 'lead-acid', 'lead acid', 'nickel-metal hydride', 'nimh',
      'nickel-cadmium', 'nicad', 'nicd', 'flow battery', 'redox flow', 'anode', 'cathode', 'electrolyte', 'separator',
      'solid-state battery', 'state of charge', 'supercapacitor', 'ultracapacitor', 'flywheel', 'pumped hydro', 'pumped storage',
      'pumped-storage', 'compressed air', 'caes', 'thermal storage', 'energy storage', 'fuel cell', 'pem', 'proton exchange',
      'solid oxide', 'alkaline fuel cell', 'molten carbonate', 'phosphoric acid fuel cell', 'direct methanol', 'direct-methanol',
      'electrolysis', 'electrolyzer', 'water splitting', 'steam methane reforming', 'steam reforming', 'hydrogen storage',
      'metal hydride', 'electric vehicle', 'electric car', 'rechargeable', 'lithium iron phosphate', 'solid electrolyte',
      'sodium-ion', 'zinc-air', 'lithium-sulfur', 'lithium-air', 'hydrogen economy', 'hydrogen fuel', 'cycle life', 'amp-hour',
      'ampere-hour', 'mah', 'daniell', 'voltaic pile', 'leclanche', 'dry cell', 'alkaline battery', 'storage'],
    [2, 'energy density', 'capacitor', 'hydrogen', 'hydride', 'plug-in', 'recharge', 'graphite', 'cobalt', 'lithium', 'vanadium',
      'dendrite', 'electrochemical', 'electrode', 'store', 'stored', 'storing'],
    [1, 'charging', 'discharge', 'redox', 'oxidation', 'reduction', 'platinum', 'catalyst', 'ammonia', 'reversible', 'voltage',
      'chemical energy', 'membrane'],
    [0.5, 'cell', 'charge'],
  ],
  // The electric grid: transmission and distribution, transformers, AC and DC, load and demand, pricing, smart grid.
  'grid-transmission': [
    [3, 'grid', 'smart grid', 'power grid', 'electric grid', 'electrical grid', 'transmission line', 'substation', 'transformer',
      'step-up', 'step-down', 'high voltage', 'high-voltage', 'hvdc', 'alternating current', 'direct current', 'war of the currents',
      'war of currents', 'westinghouse', 'power line', 'blackout', 'brownout', 'peak load', 'peak demand', 'base load', 'baseload',
      'peaking', 'peaker', 'demand response', 'demand side', 'demand-side', 'time of use', 'time-of-use', 'real-time pricing',
      'interconnection', 'ferc', 'nerc', 'balancing authority', 'dispatchable', 'frequency regulation', 'reactive power',
      'power factor', 'harmonic distortion', 'line loss', 'transmission loss', 'superconducting cable', 'smart meter',
      'advanced metering', 'metering', 'microgrid', 'phasor', 'synchrophasor', 'kilovolt', 'conservation voltage',
      'substation automation', 'distributed generation', 'curtailment', 'three-phase', 'electric utility', 'transmission',
      'distribution system'],
    [2, 'ac', 'dc', 'load', 'utility', 'interconnect', 'dispatch', 'distribution', 'waveform', '60 hertz', '50 hertz',
      'generating capacity', 'nameplate capacity', 'electricity demand', 'power plant', 'generator', 'frequency modulation'],
    [1, 'frequency', 'hertz', 'sinusoidal', 'ohmic', 'tesla', 'edison', 'electricity', 'voltage', 'current', 'resistance', 'wire',
      'conductor', 'capacity'],
    [0.5, 'electric', 'electrical', 'power'],
  ],
  // Units and conversions (Btu, kWh, quads), energy calculations and costs, energy statistics and rankings, emissions data.
  'data-units': [
    [3, 'btu', 'british thermal unit', 'therm', 'quad', 'quadrillion', 'kilowatt-hour', 'kilowatt hour', 'kwh', 'megawatt-hour',
      'megawatt hour', 'mwh', 'gigawatt-hour', 'gwh', 'terawatt-hour', 'twh', 'tonne of oil equivalent', 'barrel of oil equivalent',
      'si unit', 'eia', 'energy information administration', 'largest producer', 'largest consumer', 'global warming potential',
      'warming potential', 'carbon footprint', 'heating value', 'heat content', 'energy content', 'conversion factor', 'per capita',
      'electric bill', 'megajoule', 'gigajoule', 'levelized cost', 'payback', 'energy consumption', 'energy use', 'variable cost', 'fixed cost', 'operating cost', 'capital cost', 'consumes the most', 'net electricity', 'net generation',
      'energy subsidies', 'subsidies', 'international energy agency', 'iea'],
    [2, 'gigawatt', 'terawatt', 'joule', 'calorie', 'kilocalorie', 'kilowatt', 'megawatt', 'horsepower', 'unit', 'consumption',
      'price', 'cents', 'dollar', 'top three', 'top five', 'sector', 'residential', 'emitting', 'emitter', 'co2 emissions',
      'specific gravity', 'dimensionless', 'statistic*', 'bill', 'kilojoule', 'investment', 'cost per', 'installed capacity',
      'energy density'],
    [1, 'watt', 'consumes', 'consumed', 'consume', 'cost', 'per year', 'annual', 'annually', 'country', 'countries', 'nation',
      'percentage', 'percent', 'share', 'commercial', 'industrial', 'transportation', 'emission', 'greenhouse gas', 'global warming',
      'climate change', 'world', 'worldwide', 'united states', 'u.s.', 'china', 'india', 'russia', 'germany', 'japan', 'canada',
      'data', 'ranked', 'gallon', 'pounds', 'fahrenheit', 'hours', 'hour', 'carbon dioxide', 'methane', 'nitrous oxide'],
    [0.5, 'how many', 'how much', 'global', 'rank', 'largest', 'fraction', 'degrees', 'days', 'year', 'month', 'rate', 'power',
      'energy', 'electricity', 'state'],
  ],
  // DOE national labs, user facilities and research programs, and research framed around them.
  'doe-labs': [
    [4, DOE_LABS],
    [3, 'department of energy', 'doe', 'doe-funded', 'supercomputer', 'synchrotron', 'light source', 'neutron source',
      'user facility', 'manhattan project', 'national lab'],
    [1, 'scientists', 'researchers', 'studying', 'are studying'],
    [0.5, 'are developing', 'research', 'recently'],
  ],
};

/* ------------------------------------------------------------------ */
/* Math                                                                */
/* ------------------------------------------------------------------ */

const MATH: RuleTable = {
  // Mental arithmetic: fractions, decimals, percents, ratios, rates, unit conversions, money, order of operations.
  arithmetic: [
    [3, 'mixed number', 'improper fraction', 'simple interest', 'discount', 'sales tax', 'markup', 'unit conversion',
      'order of operations', 'least common denominator', 'common denominator', 'hour hand', 'minute hand', 'miles per hour', 'mph'],
    [2, 'percent', 'percentage', /\d\s*%/, 'reciprocal', 'tax', 'profit', 'commission', 'scientific notation', /\d\s*[×÷]\s*\d/,
      /\d+\s+(?:times|divided by|multiplied by)\s+\d/, /\$\s?\d/, 'dollars', 'cents', 'budget', 'average speed', 'divided by'],
    [1, 'cost', 'price', 'pays', 'paid', 'earns', 'decimal', 'fraction', 'lowest terms', 'estimate', 'ratio', 'proportion', 'feet',
      'inches', 'yards', 'miles', 'ounces', 'pounds', 'gallons', 'quarts', 'cups', 'minutes', 'hours', 'seconds', 'liters', 'grams',
      'speed', 'clock', 'multiplied', 'quotient', 'compute', 'calculate', 'tip'],
        [3, /^(?:what is|evaluate|compute|calculate|find)\s+[-\d][\d\s^+\-x*\/().,]*\??\s*\|/],
    [0.5, 'rounded', 'round', 'nearest whole', 'meters', 'kilometers', 'centimeters', 'times', 'product of', 'sum of', 'difference',
      'evaluate', 'what is', 'how many', 'how much', 'total', 'each', 'half', 'third', 'quarter'],
  ],
  // Equations and inequalities, polynomials and factoring, functions and graphs, lines and slope, exponents
  // and radicals, word problems.
  algebra: [
    [3, 'quadratic', 'polynomial', 'factor completely', 'factoring', 'factorization', 'inequality', 'inequalities',
      'system of equations', 'systems of equations', 'linear equation', 'slope-intercept', 'point-slope', 'y-intercept',
      'x-intercept', 'discriminant', 'quadratic formula', 'completing the square', 'trinomial', 'monomial', 'leading coefficient',
      'rational expression', 'rational function', 'synthetic division', 'remainder theorem', 'factor theorem', 'rational root',
      'vieta', 'sum of the roots', 'product of the roots', 'varies directly', 'varies inversely', 'composition', 'composite function',
      'inverse function', 'one-to-one', 'even function', 'odd function', 'piecewise', 'greatest integer', 'floor function',
      'difference of squares', 'foil', 'rationalize', 'end behavior', 'simplest radical form', 'radicand', 'work together',
      'years older', 'equations in', 'unknowns', 'function', 'of a number', 'how old',
      /(?:\d+\/\d+|\d+(?:st|nd|rd|th)|negative \w+|-\d+\/\d+) power of/, 'times as large'],
    [2, 'solve', 'solving', 'equation', 'expression', 'variable', 'absolute value', 'domain', 'slope', 'vertex', 'parabola',
      'asymptote', 'radical', 'exponent', 'consecutive integers', 'directly proportional', 'inversely proportional', 'parametric',
      'simplify', 'simplified', 'expand', 'factored', 'nth root', 'mixture', 'g of x', 'f of x', 'f(x)', 'g(x)', 'h(x)', 'g of f',
      'f of g'],
    [1, 'range', 'root', 'zero', 'zeroes', 'coefficient', 'degree', 'together', 'age', 'years old', 'graph of', 'graph', 'linear',
      'x =', 'y =', 'solution', 'unknown', 'conjugate', 'cube root', 'square root', 'intersection', 'intersect', 'system',
      'translated', 'shifted', 'value of x', 'value of y', 'values of x', 'x and y', /(?<![a-z0-9])\d*[a-z]\^\d/,
      /(?<![a-z])\d+\s?[xy](?![a-z])/],
    [0.5, 'line', 'increasing', 'decreasing', 'x-axis', 'y-axis', 'x', 'y'],
  ],
  // Plane and solid geometry, coordinate geometry, transformations, conic sections.
  geometry: [
    [3, 'triangle', /(?<![a-z])triangular(?![\s-]*numbers?)(?![a-z])/, 'rectangle', 'circle', 'circumference', 'chord', 'sector', 'secant line', 'inscribed',
      'circumscribed', 'polygon', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'nonagon', 'decagon', 'dodecagon', 'quadrilateral',
      'parallelogram', 'rhombus', 'trapezoid', 'kite', 'right triangle', 'pythagorean', 'isosceles', 'equilateral', 'scalene',
      'congruent', 'congruence', 'similarity', 'perimeter', 'surface area', 'sphere', 'hemisphere', 'pyramid', 'prism',
      'polyhedron', 'polyhedra', 'platonic', 'tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron', 'midpoint',
      'distance formula', 'dilation', 'transversal', 'bisector', 'bisects', 'perpendicular bisector', 'angle bisector', 'centroid',
      'incenter', 'circumcenter', 'orthocenter', 'euler line', 'apothem', 'interior angle', 'exterior angle', 'regular polygon',
      'heron', 'inscribed angle', 'central angle', 'ellipse', 'hyperbola', 'conic', 'conic section', 'foci', 'eccentricity',
      'directrix', 'major axis', 'minor axis', 'semi-major', 'straightedge', 'euclid*', 'line segment', 'collinear', 'coplanar',
      'shaded region', 'square units', 'cubic units', 'side length', 'tessellat*', 'cross section', 'cross-section',
      'complementary', 'supplementary', 'vertical angles', 'slant height', 'inradius', 'circumradius', 'semicircle', 'annulus',
      'torus', 'frustum', 'trapezoidal', 'hexadecagon', 'measure of angle', 'ladder', 'shadow', 'arc', 'radius', 'diameter'],
    [2, 'circular', 'area', 'volume', 'cube', 'cylinder', 'cone', 'faces', 'edges', 'vertices', 'diagonal',
      'reflection', 'reflected', 'rotation', 'rotated', 'translation', 'transformation', 'symmetry', 'symmetric', 'altitude',
      'acute', 'obtuse', 'right angle', 'hypotenuse', 'similar', 'distance between', 'tangent line', 'grid', 'lattice points',
      'segment', 'angle', /(?<![a-z])squares?(?![\s-]*roots?)(?![a-z])/],
    [1, 'rectangular', 'degree measure', 'coordinate', 'side', 'ray', 'parallel', 'perpendicular', 'plane', 'solid', 'edge', 'face', 'height', 'lateral', 'pi', 'π',
      'shape', 'figure', 'convex', 'width', 'center', 'focus', 'quadrant'],
    [0.5, 'length', 'units', 'distance', 'point', 'base', 'origin', 'region', 'concave', 'net'],
  ],
  // Trigonometric functions and identities, solving triangles, radians, graphs of trig functions, polar coordinates.
  trigonometry: [
    [3, 'sine', 'cosine', 'cotangent', 'cosecant', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
      'inverse sine', 'inverse cosine', 'inverse tangent', 'trigonometr*', 'unit circle', 'law of sines', 'law of cosines',
      'double angle', 'double-angle', 'half angle', 'half-angle', 'sum formula', 'phase shift', 'polar', 'polar coordinates',
      'polar equation', 'polar form', 'reference angle', 'coterminal', 'standard position', 'sinusoid*', 'rose curve', 'cardioid',
      'limacon', 'lemniscate', 'angle of elevation', 'angle of depression'],
    [2, 'tangent', 'secant', 'radian', 'identity', 'theta', 'θ', 'periodic', 'amplitude', 'cis', 'bearing', 'quadrant'],
    [2, 'rectangular coordinates'],
    [1, 'period', 'arc length', 'π/', 'pi over', 'angle', 'hypotenuse'],
    [0.5, 'degrees', 'minutes', 'triangle', 'opposite', 'adjacent'],
  ],
  // Sequences and series, logarithms and exponential functions, growth and decay, compound interest.
  'sequences-logs': [
    [3, 'sequence', 'series', 'arithmetic sequence', 'geometric sequence', 'arithmetic series', 'geometric series',
      'arithmetic progression', 'geometric progression', 'nth term', 'common difference', 'common ratio', 'infinite series',
      'infinite geometric', 'sum of the first', 'fibonacci', 'recursive', 'recursion', 'recursively', 'logarithm', 'logarithmic', /(?<![a-z])log(?=\s*(?:base|_|\(|\d|of\b|[a-z]\b))/, 'ln', 'natural log', 'natural logarithm', 'compound interest', 'compounded', 'continuously compounded', 'log base',
      'base 10 log', 'partial sum', 'summation', 'sigma notation', 'sum from', /(?<![a-z])a_?\(?n\s*[-+]\s*1/],
    [2, 'exponential', 'exponentially', 'exponential growth', 'exponential decay', 'half-life', 'doubling', 'doubles', 'e to the',
      'interest rate', 'first term', 'each successive', 'radioactive', 'one half to the power'],
    [1, 'terms', 'growth', 'decay', 'each day', 'each year', 'after n', 'pattern', 'successive', 'e^', 'base e'],
    [0.5, 'term', 'sum', 'base', 'power', 'per year'],
  ],
  // Vectors, dot and cross products, matrices and determinants, complex numbers.
  'vectors-matrices-complex': [
    [3, 'vector', 'dot product', 'cross product', 'scalar product', 'vector product', 'unit vector', 'matrix', 'matrices',
      'determinant', 'inverse matrix', 'identity matrix', 'transpose', 'eigenvalue', 'eigenvector', 'row 1', 'row 2', '2 by 2',
      '3 by 3', '2x2', '3x3', 'complex number', 'imaginary', 'real part', 'imaginary part', 'complex conjugate', 'argand',
      'de moivre', 'roots of unity', 'magnitude and direction', /(?<![a-z])\d*\s*i\s*[+-]\s*\d*\s*j(?![a-z])/,
      /(?<![a-z0-9])\d+\s*[+-]\s*\d*\s*i(?![a-z0-9])/, /(?<![a-z])i\^\d/, 'gaussian integer', 'linear transformation',
      'row reduction', 'augmented matrix', 'cramer'],
    [2, 'complex', 'orthogonal', 'projection', 'modulus'],
    [1, 'magnitude', 'direction', 'component'],
    [0.5, 'i', 'j'],
  ],
  // Limits, derivatives and their applications, integrals and their applications, differential equations, series tests.
  calculus: [
    [5, 'derivative', 'differentiate', 'differentiable', 'differentiation', 'integral', 'integrate', 'integration',
      'antiderivative', 'definite integral', 'indefinite integral', 'lim', 'dy/dx', 'd/dx', "f'(x)", "f''(x)", 'f prime',
      'f double prime', 'second derivative', 'first derivative', '∫', "l'hopital", 'lhopital', 'related rates',
      'fundamental theorem of calculus', 'chain rule', 'product rule', 'quotient rule', 'mean value theorem', 'riemann',
      'trapezoidal rule', 'area under', 'area between', 'volume of revolution', 'solid of revolution', 'disk method',
      'washer method', 'shell method', 'taylor', 'maclaurin', 'differential equation', 'radius of convergence',
      'interval of convergence', 'catenary'],
    [4, 'limit', 'slope of the tangent', 'instantaneous rate', 'tangent line', 'line tangent', 'normal to the graph', 'normal line',
      /tangent to the (?:graph|curve)/],
    [3, 'continuity', 'discontinuity', 'discontinuous', 'concave up', 'concave down', 'concavity', 'inflection', 'critical point',
      'critical number', 'local maximum', 'local minimum', 'relative maximum', 'relative minimum', 'extrema', 'extremum',
      'optimization', 'implicit', 'implicitly', 'power series', 'ratio test', 'integral test', 'comparison test', 'calculus', 'dx',
      'rate of change', 'average value'],
    [2, 'approaches', 'continuous', 'converge', 'converges', 'convergent', 'diverge', 'diverges', 'divergent', 'infinity',
      'absolute maximum', 'absolute minimum', 'maximize', 'minimize', 'epsilon'],
    [1, 'velocity', 'acceleration', 'curve'],
    [0.5, 'maximum', 'minimum', 'increasing', 'decreasing', 'slope', 'area', 'rate'],
  ],
  // Probability, counting, permutations and combinations, expected value, binomial coefficients.
  'probability-combinatorics': [
    [3, 'probability', 'probable', 'at random', 'dice', 'coin', 'marble', 'urn', 'permutation', 'combinations', 'how many ways',
      'expected value', 'mutually exclusive', 'conditional probability', 'binomial coefficient', "pascal's triangle",
      'pigeonhole', 'sample space', 'license plate', 'spinner', 'different ways', 'bernoulli trial',
      'without replacement', 'with replacement', 'counting principle', 'venn', 'inclusion-exclusion', 'take both',
      'handshake'],
    [2, 'odds', 'chance', 'random', 'randomly', 'die', 'flip', 'flipped', 'toss', 'tossed', 'heads', 'tails', 'cards', 'deck',
      'combination', 'choose', 'arrange', 'arranged', 'arrangement', 'factorial', 'outcome', 'committee', 'lottery', 'rolled',
      'roll', 'seated', 'seating', 'different orders', 'subset', 'binomial expansion', 'binomial theorem', 'term in the expansion',
      'favorable', 'best-of', 'replacement'],
    [1, 'card', 'bag', 'ways', 'counting', 'expected', 'independent', 'event', 'selected', 'select', 'selecting', 'drawn', 'draw',
      'expansion', 'likely', 'fair', 'win', 'girls', 'boys', 'number of'],
    [0.5, 'distinct', 'games', 'team', 'children', 'many'],
  ],
  // Descriptive statistics, distributions, normal curves and z-scores, regression, sampling, hypothesis tests.
  statistics: [
    [3, 'mean', 'median', 'mode', 'arithmetic mean', 'geometric mean', 'harmonic mean', 'standard deviation', 'variance',
      'interquartile', 'quartile', 'percentile', 'outlier', 'box plot', 'box-and-whisker', 'histogram', 'stem-and-leaf',
      'stem and leaf', 'scatter plot', 'scatterplot', 'correlation', 'correlation coefficient', 'regression', 'least squares',
      'line of best fit', 'best fit', 'normal distribution', 'normally distributed', 'bell curve', 'bell-shaped', 'z-score',
      'z score', 'standard normal', 'hypothesis test', 'null hypothesis', 'alternative hypothesis', 'p-value',
      'confidence interval', 'margin of error', 'chi-square', 'chi square', 't-test', 'data set', 'dataset', 'statistic',
      'statistics', 'statistical', 'empirical rule', '68-95-99.7', 'significance', 'control group', 'random sample', 'stratified',
      'residual', 'r-squared', 'coefficient of determination', 'categorical', 'quantitative', 'five-number', 'weighted average',
      'class average', 'test scores', 'repeated-measures', 'independent-measures', 'experimental design'],
    [2, 'average', 'data', 'sample', 'sampling', 'survey', 'surveyed', 'bias', 'biased', 'distribution', 'skew', 'skewed', 'deviation',
      'frequency', 'experiment', 'experimental', 'observational', 'score', 'grade'],
    [1, 'population', 'set of numbers', 'list of numbers'],
    [0.5, 'range', 'values', 'numbers'],
  ],
  // Primes, divisibility, GCD and LCM, modular arithmetic, digits and number bases, integer properties.
  'number-theory': [
    [3, 'prime', 'prime factor', 'prime factorization', 'prime number', 'composite', 'divisible', 'divisibility', 'divisor',
      'factors of', 'positive factors', 'number of factors', 'greatest common', 'gcd', 'gcf', 'least common multiple', 'lcm',
      'relatively prime', 'coprime', 'modulo', 'mod', 'modular', 'units digit', 'ones digit', 'tens digit', 'last digit', 'base 2',
      'base 3', 'base 5', 'base 8', 'base 10', 'base 16', 'base two', 'base ten', 'base eight', 'base five', 'binary', 'octal',
      'hexadecimal', 'perfect number', 'perfect square', 'perfect cube', 'parity', 'euclidean algorithm', 'diophantine', 'totient',
      'palindrome', 'palindromic', 'trailing zero', 'trailing zeroes', 'number theory', 'twin prime', 'mersenne', 'goldbach',
      'fundamental theorem of arithmetic', 'sieve', 'abundant number', 'deficient number', 'square number', 'sum of the digits',
      'digit', 'evenly divisible', 'triangular number', 'day of the week', /(?<![a-z])base \d+/, 'leap year'],
    [2, 'multiple', 'remainder', 'natural number', 'positive integer', 'integer', 'whole number', 'irrational', 'rational number',
      'even', 'odd'],
    [1, 'factor', 'consecutive', 'triangular', 'real number'],
    [0.5, 'number', 'product', 'sum'],
  ],
};

/* ------------------------------------------------------------------ */
/* Energy cross-subject                                                */
/* ------------------------------------------------------------------ */

/** "cell(s)" that are not electrochemical or photovoltaic cells. */
const LIVING_CELL = /(?<![a-z])(?<!(?:solar|fuel|unit|dry|electrochemical|galvanic|voltaic|photovoltaic|battery|tandem|flow|daniell|downs|perovskite) )cells?(?![a-z])/;
/** "plant(s)" that are not power plants. */
const LIVING_PLANT = /(?<![a-z])(?<!(?:power|nuclear|coal|gas|solar|geothermal|treatment|chemical|manufacturing|fired|generating|ethanol|biodiesel|wind|hydroelectric) )plants?(?![a-z])/;

/**
 * Evidence for the discipline an Energy question really tests. Math is decided separately (a numeric
 * answer worked out from numbers in the stem, with little discipline-specific vocabulary).
 */
const CROSS: Readonly<Record<Exclude<CoreSubject, 'energy' | 'math'>, readonly Rule[]>> = {
  chemistry: [
    [3, 'redox', 'oxidizing agent', 'reducing agent', 'oxidation state', 'oxidation number', 'electrochemical', 'catalyst',
      'catalysis', 'chemical bond', 'covalent', 'ionic bond', 'mole', 'molar', 'stoichiometr*', 'ph', 'polymer', 'alkane',
      'alkene', 'functional group', 'isomer', 'enthalpy', 'exothermic', 'endothermic', 'chemical reaction', 'chemical formula',
      'chemistry', 'organic compound', 'electronegativity', 'electron configuration', 'oxide', 'hydroxide', 'carbonate', 'sulfate',
      'nitrate', 'chloride', 'sulfide', 'nitride', 'carbide', 'metal-organic', 'mof', 'zeolite', 'radical', 'photoredox', 'halide',
      'cyano', 'nitrile', 'amine', 'alcohol', 'ester', 'transesterification', 'heteroatom', 'thiol', 'ligand', 'perovskite',
      'hybridization', 'sp2', 'sp3', 'molecular orbital', 'acid', 'base', 'solvent', 'electrolyte', 'electrolysis', 'anode',
      'cathode', 'reduction potential', 'cetane', 'octane', 'combustion'],
    [2, 'oxidation', 'reduction', 'molecule', 'molecular', 'compound', 'reaction', 'react', 'reactant', 'chemical', 'chemically',
      'ion', 'cation', 'anion', 'bond', 'bonding', 'synthesis', 'crystal structure', 'element', 'hydrocarbon', 'methanol', 'ethanol',
      'formula', 'nanoparticle', 'alloy', 'solution', 'dissolve', 'corrosion', 'electrode', 'spectroscopy'],
    [1, 'atom', 'hydrogen', 'oxygen', 'carbon', 'nitrogen', 'sulfur', 'lithium', 'sodium', 'metal', ELEMENT],
  ],
  physics: [
    [3, 'force', 'velocity', 'acceleration', 'momentum', 'kinetic energy', 'potential energy', 'gravitational', 'gravity', 'torque',
      'friction', 'newton', 'ohm', 'ampere', 'circuit', 'capacitor', 'magnetic', 'magnet', 'electric field', 'induction',
      'solenoid', 'photon', 'wavelength', 'laser', 'x-ray', 'diffraction', 'quantum', 'tunneling', 'superconduct*', 'semiconductor',
      'band gap', 'spin', 'magnon', 'phonon', 'quasiparticle', 'quark', 'lepton', 'hadron', 'meson', 'pion', 'muon', 'neutrino',
      'positron', 'antimatter', 'boson', 'higgs', 'gluon', 'particle', 'accelerator', 'collider', 'detector', 'plasma', 'fusion',
      'fission', 'neutron', 'proton', 'nucleus', 'nuclei', 'nuclear', 'radiation', 'radioactive', 'decay', 'half-life', 'isotope',
      'binding energy', 'carnot', 'entropy', 'thermodynamic*', 'heat engine', 'blackbody', 'stefan-boltzmann', 'relativity',
      'speed of light', 'electromagnetic', 'dark matter', 'standard model', 'strong force', 'weak force', 'fundamental force',
      'transformer', 'alternating current', 'direct current', 'impedance', 'mev', 'gev', 'tev', 'electron volt', 'tokamak',
      'spallation', 'neutron scattering', 'synchrotron', 'optics', 'lens', 'mirror', 'electron microscope', 'qubit', 'entangle*',
      'decibel', 'sound', 'frequency', 'oscillat*', 'resonance', 'turbine', 'betz', 'fluid', 'pressure', 'buoyan*', 'voltage',
      'current', 'resistance', 'electron', 'ideal gas', 'isobaric', 'isothermal', 'adiabatic', 'spring', 'heat transfer',
      'conduction', 'convection', 'thermal conductivity', 'specific heat'],
    [1, 'joule', 'watt', 'power', 'work', 'temperature', 'heat', 'thermal', 'kelvin', 'conductivity', 'light', 'mass', 'charge',
      'atom', 'energy level'],
  ],
  biology: [
    [3, 'enzyme', 'protein', 'dna', 'rna', 'gene', 'genome', 'genomic', 'genetic', LIVING_CELL, 'cellular', 'bacteria', 'bacterium',
      'bacterial', 'microbe', 'microbial', 'microorganism', 'algae', 'algal', 'photosynthesis', 'photosynthetic', 'chlorophyll',
      LIVING_PLANT, 'organism', 'species', 'virus', 'pathogen', 'disease', 'neurotransmitter', 'neuron', 'brain', 'atp',
      'metabolism', 'metabolic', 'respiration', 'glucose', 'glycogen', 'cellulase', 'fermentation', 'yeast', 'fungi', 'fungus',
      'extremophile', 'thermophile', 'biology', 'biological', 'biomolecule', 'trophic', 'ecosystem', 'food web', 'animal', 'human',
      'insect', 'leaf', 'leaves', 'root', 'crop', 'nightshade', 'tissue', 'blood', 'liver', 'immune', 'cancer', 'tumor',
      'mitochondri*', 'chloroplast', 'chemiosmosis', 'amino acid', 'peptide', 'antibiotic', 'vaccine', 'sars', 'covid', 'hormone',
      'acetylcholine', 'nerve', 'muscle', 'biofilm', 'symbiosis', 'nitrogen fixation', 'poplar', 'krebs', 'glycolysis', 'calvin',
      'photosystem', 'brown fat', 'mammal', 'canopy', 'tree', 'forest', 'cattle', 'enteric'],
    [1, 'cellulose', 'lignin', 'biomass', 'sugar', 'starch', 'organic'],
  ],
  earth_space: [
    [3, 'atmosphere', 'atmospheric', 'climate', 'weather', 'ocean', 'sea level', 'rock', 'sediment', 'sedimentary', 'mineral',
      'geologic', 'geological', 'geology', 'earthquake', 'volcano', 'volcanic', 'aquifer', 'groundwater', 'permafrost', 'glacier',
      'ice sheet', 'ice core', 'galaxy', 'galaxies', 'star', 'stellar', 'black hole', 'universe', 'cosmic', 'cosmology', 'big bang',
      'dark energy', 'supernova', 'planet', 'planetary', 'asteroid', 'comet', 'meteorite', 'moon', 'mars', 'jupiter', 'saturn',
      'solar system', 'telescope', 'gravitational lensing', 'active galactic', 'quasar', 'nucleosynthesis', 'crust', 'mantle',
      'plate tectonics', 'fault', 'soil', 'erosion', 'carbon cycle', 'greenhouse effect', 'global warming', 'ozone', 'aerosol',
      'cloud', 'precipitation', 'hurricane', 'drought', 'snowpack', 'watershed', 'shale', 'sandstone', 'reservoir rock', 'basalt',
      'granite', 'magma', 'geothermal gradient', 'tides', 'lunar', 'solar wind', 'cosmic ray', 'astrophysic*', 'astronomical',
      'interstellar', 'supernovae', 'sn1987a', 'lightyear', 'light-year', 'formation', 'fracture', 'geologic formation'],
    [1, 'earth', 'sun', 'river', 'silica', 'greenhouse gas'],
  ],
};

/* ------------------------------------------------------------------ */
/* Concepts (high-frequency topics only)                               */
/* ------------------------------------------------------------------ */

/** Concept rules per topic id; concept slugs must match src/core/taxonomy.ts. */
const CONCEPTS: Readonly<Record<string, RuleTable>> = {};

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ˣ': 'x',
};

/** Bracketed pronunciation guides like "[ah-LEEL]" are dropped; spoken math like "[f of x equals ...]" is kept. */
function isPronunciation(inner: string): boolean {
  if (/\p{Lu}{2}/u.test(inner) && inner.includes('-')) return true;
  return !/\d/.test(inner) && (inner.match(/-/g)?.length ?? 0) >= 2;
}

/**
 * Text as the rules see it: lower case, accents removed, typographic quotes and dashes made plain,
 * superscripts written as "^2" (x² → x^2, 10⁻⁷ → 10^-7), subscripts as plain digits (CO₂ → co2),
 * pronunciation guides removed.
 */
export function normalizeText(s: string): string {
  return s
    .replace(/\[([^\]]*)\]/g, (_, inner: string) => (isPronunciation(inner) ? ' ' : ` ${inner} `))
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿˣ]+/g, (m) => '^' + [...m].map((c) => SUPERSCRIPTS[c] ?? c).join(''))
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[‘’ʼ′`´]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/⁄/g, '/')
    .toLowerCase();
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface CompiledTerm {
  /** The term as written, for explanations. */
  term: string;
  re: RegExp;
  /** A literal that every match contains, checked first because it is much faster than the regex ('' = none). */
  anchor: string;
  /** Singular form used to drop a plural listed after its singular ('' for wildcards and regexes). */
  key: string;
}

/** The singular form of a plain term: "alleles" → "allele", "ovaries" → "ovary", "gases" → "gas". */
function singularKey(t: string): string {
  if (/[*]/.test(t)) return '';
  const words = t.split(/[\s-]+/);
  let last = words.pop() ?? '';
  if (/[^aeiou]ies$/.test(last)) last = `${last.slice(0, -3)}y`;
  else if (/(?:ss|x|z|ch|sh)es$/.test(last) || /[^s]ses$/.test(last)) last = last.slice(0, -2);
  else if (/[^su]s$/.test(last) && last.length > 3) last = last.slice(0, -1);
  return [...words, last].join(' ');
}

/** The regular expression for one term (see TERM SYNTAX above). */
export function compileTerm(term: Term): RegExp {
  return compile(term).re;
}

function compile(term: Term): CompiledTerm {
  if (term instanceof RegExp) {
    const label = term.source.length > 40 ? `/${term.source.slice(0, 37)}…/` : `/${term.source}/`;
    return { term: label, re: term, anchor: '', key: '' };
  }
  let t = normalizeText(term).trim();
  const prefix = t.endsWith('*');
  if (prefix) t = t.slice(0, -1);
  const suffix = t.startsWith('*');
  if (suffix) t = t.slice(1);
  const words = t.split(/[\s-]+/).filter(Boolean);
  let src = words.map((w) => escapeRegex(w).replace(/'s$/, "(?:'?s)?")).join('[\\s\\-]*');
  const last = words[words.length - 1] ?? '';
  if (!prefix && !/'s$/.test(last)) {
    if (/[^aeiou]y$/.test(last)) src = `${src.slice(0, -1)}(?:y|ies)`;
    else if (/(?:s|x|z|ch|sh)$/.test(last)) src += '(?:es)?';
    else if (/[a-z]$/.test(last)) src += '(?:s|es)?';
  }
  const lead = suffix ? '[a-z0-9]*' : '';
  const tail = prefix ? '[a-z0-9]*' : '';
  // The longest word, minus anything a plural or possessive can change, appears literally in every match.
  const anchor = words
    .map((w, i) => (i === words.length - 1 && !prefix && /[^aeiou]y$/.test(w) ? w.slice(0, -1) : w).replace(/'s$/, ''))
    .reduce((a, b) => (b.length > a.length ? b : a), '');
  return {
    term,
    re: new RegExp(`(?<![a-z0-9])${lead}${src}${tail}(?![a-z0-9])`),
    anchor,
    key: prefix || suffix ? '' : singularKey(words.join(' ')),
  };
}

interface CompiledRule {
  weight: number;
  patterns: CompiledTerm[];
}

/** Compile a rule list; a plain term whose singular form appeared earlier in the list is dropped. */
function compileRules(rules: readonly Rule[]): CompiledRule[] {
  const seen = new Set<string>();
  return rules.map(([weight, ...terms]) => ({
    weight,
    patterns: terms.map(compile).filter((c) => {
      if (!c.key) return true;
      if (seen.has(c.key)) return false;
      seen.add(c.key);
      return true;
    }),
  }));
}

interface Fields {
  /** Stem, answer and accepted alternatives. */
  main: string;
  /** The other answer choices. */
  choices: string;
}

function fieldsOf(q: TaggableQuestion): Fields {
  const answers = [q.answer, ...(q.accept ?? [])];
  const answerSet = new Set(answers.map((a) => normalizeText(a).trim()));
  const choices = q.choices ? Object.values(q.choices).filter((c) => !answerSet.has(normalizeText(c).trim())) : [];
  return {
    main: normalizeText([q.stem, ...answers].join(' | ')),
    choices: normalizeText(choices.join(' | ')),
  };
}

interface Scored {
  id: string;
  score: number;
  /** The largest contribution of a single term, used to break ties. */
  top: number;
  terms: string[];
}

function scoreRules(rules: CompiledRule[], f: Fields, withTerms = false): Omit<Scored, 'id'> {
  let score = 0;
  let top = 0;
  const terms: string[] = [];
  for (const r of rules) {
    for (const p of r.patterns) {
      const inMain = !p.anchor || f.main.includes(p.anchor);
      const inChoices = f.choices !== '' && (!p.anchor || f.choices.includes(p.anchor));
      const factor = inMain && p.re.test(f.main) ? 1 : inChoices && p.re.test(f.choices) ? CHOICE_FACTOR : 0;
      if (!factor) continue;
      const points = r.weight * factor;
      score += points;
      if (points > top) top = points;
      if (withTerms) terms.push(factor === 1 ? `${p.term} ${r.weight}` : `${p.term} ${points} (choice)`);
    }
  }
  return { score, top, terms };
}

const better = (a: Scored, b: Scored | undefined) => !b || a.score > b.score || (a.score === b.score && a.top > b.top);

const TABLES: Record<CoreSubject, RuleTable> = {
  biology: BIOLOGY,
  chemistry: CHEMISTRY,
  earth_space: EARTH_SPACE,
  energy: ENERGY,
  math: MATH,
  physics: PHYSICS,
};

const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));
const CONCEPT_IDS = new Set(TOPICS.flatMap((t) => t.concepts.map((c) => c.id)));

type Compiled = { id: string; rules: CompiledRule[] }[];

/** Compiled topic rules per subject, in table order. Throws at load time if a slug is not in the taxonomy. */
const COMPILED = Object.fromEntries(
  CORE_SUBJECTS.map((subject) => [
    subject,
    Object.entries(TABLES[subject]).map(([slug, rules]) => {
      const id = `${subject}.${slug}`;
      if (!TOPIC_IDS.has(id)) throw new Error(`tagging.ts: unknown topic ${id}`);
      return { id, rules: compileRules(rules) };
    }),
  ]),
) as Record<CoreSubject, Compiled>;

const COMPILED_CONCEPTS: Record<string, Compiled> = Object.fromEntries(
  Object.entries(CONCEPTS).map(([topicId, table]) => [
    topicId,
    Object.entries(table).map(([slug, rules]) => {
      const id = `${topicId}.${slug}`;
      if (!CONCEPT_IDS.has(id)) throw new Error(`tagging.ts: unknown concept ${id}`);
      return { id, rules: compileRules(rules) };
    }),
  ]),
);

const COMPILED_CROSS: Compiled = Object.entries(CROSS).map(([subject, rules]) => ({ id: subject, rules: compileRules(rules) }));

const isCore = (s: string): s is CoreSubject => (CORE_SUBJECTS as string[]).includes(s);

function rank(candidates: Compiled, f: Fields, withTerms = false): Scored[] {
  const scored = candidates.map((c) => ({ id: c.id, ...scoreRules(c.rules, f, withTerms) }));
  // Stable sort: equal candidates keep table order.
  return scored.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
}

/** Every topic of the question's subject with its score and the terms that matched, best first (for debugging rules). */
export function explainTopics(q: TaggableQuestion): Scored[] {
  if (!isCore(q.subject)) return [];
  return rank(COMPILED[q.subject], fieldsOf(q), true);
}

/** Cross-subject evidence for an Energy question, best first, plus the calculation score (for debugging rules). */
export function explainCrossSubject(q: TaggableQuestion): { disciplines: Scored[]; math: number } {
  const f = fieldsOf(q);
  return { disciplines: rank(COMPILED_CROSS, f, true), math: mathEvidence(q, f) };
}

const NUMBER = /(?<![a-z])\d+(?:[.,]\d+)?/g;
const NUMERIC_ANSWER =
  /^(?:about |approximately )?[-+]?\$?\d[\d,]*(?:\.\d+)?(?:\s*(?:x|×)\s*10\^?-?\d+)?\s*(?:%|percent|times|fold|[a-z]{1,12}(?: per [a-z]+)?)?$|^[-+]?\d+\s*\/\s*\d+$/;

/** How strongly an Energy question looks like a calculation (0 when the answer is not a number). */
function mathEvidence(q: TaggableQuestion, f: Fields): number {
  if (!NUMERIC_ANSWER.test(normalizeText(q.answer).trim())) return 0;
  let score = 2;
  if ((normalizeText(q.stem).match(NUMBER) ?? []).length >= 2) score += 1;
  if (/\b(?:how many|how much|calculate|compute|to the nearest|by what factor|what percentage|what is the (?:total|cost|percent))\b/.test(f.main)) score += 1;
  return score;
}

function crossSubjectOf(q: TaggableQuestion, f: Fields): CoreSubject | undefined {
  const [first, second] = rank(COMPILED_CROSS, f);
  const math = mathEvidence(q, f);
  // A calculation counts as math unless one discipline's vocabulary clearly dominates it.
  if (math >= 3 && first.score < 6) return 'math';
  if (first.score >= MIN_CROSS_SCORE && first.score - (second?.score ?? 0) >= MIN_CROSS_LEAD) return first.id as CoreSubject;
  return undefined;
}

/** Tag one question: topic (if any rule scores high enough), its concepts and, for Energy, the cross-subject. */
export function tagQuestion(q: TaggableQuestion): TagResult {
  if (!isCore(q.subject)) return { concepts: [], score: 0 };
  const f = fieldsOf(q);
  const [best] = rank(COMPILED[q.subject], f);
  const score = best?.score ?? 0;
  const topic = best && score >= MIN_TOPIC_SCORE ? best.id : undefined;
  const concepts =
    topic && COMPILED_CONCEPTS[topic]
      ? rank(COMPILED_CONCEPTS[topic], f)
          .filter((c) => c.score >= MIN_CONCEPT_SCORE)
          .slice(0, MAX_CONCEPTS)
          .map((c) => c.id)
      : [];
  const crossSubject = q.subject === 'energy' ? crossSubjectOf(q, f) : undefined;
  return { ...(topic ? { topic } : {}), concepts, ...(crossSubject ? { crossSubject } : {}), score };
}
