/**
 * Element data for the chemistry visual templates: names, symbols, positions in the periodic table
 * and ground-state electron configurations through krypton.
 */

const SYMBOLS =
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
  'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn';

const NAMES =
  'HYDROGEN HELIUM LITHIUM BERYLLIUM BORON CARBON NITROGEN OXYGEN FLUORINE NEON SODIUM MAGNESIUM ALUMINUM SILICON ' +
  'PHOSPHORUS SULFUR CHLORINE ARGON POTASSIUM CALCIUM SCANDIUM TITANIUM VANADIUM CHROMIUM MANGANESE IRON COBALT ' +
  'NICKEL COPPER ZINC GALLIUM GERMANIUM ARSENIC SELENIUM BROMINE KRYPTON RUBIDIUM STRONTIUM YTTRIUM ZIRCONIUM ' +
  'NIOBIUM MOLYBDENUM TECHNETIUM RUTHENIUM RHODIUM PALLADIUM SILVER CADMIUM INDIUM TIN ANTIMONY TELLURIUM IODINE ' +
  'XENON CESIUM BARIUM LANTHANUM CERIUM PRASEODYMIUM NEODYMIUM PROMETHIUM SAMARIUM EUROPIUM GADOLINIUM TERBIUM ' +
  'DYSPROSIUM HOLMIUM ERBIUM THULIUM YTTERBIUM LUTETIUM HAFNIUM TANTALUM TUNGSTEN RHENIUM OSMIUM IRIDIUM PLATINUM ' +
  'GOLD MERCURY THALLIUM LEAD BISMUTH POLONIUM ASTATINE RADON';

const SYMBOL_LIST = SYMBOLS.split(' ');
const NAME_LIST = NAMES.split(' ');

/** Other accepted spellings (Rule A-2 c): British and IUPAC spellings, the Latin-derived name of tungsten. */
const OTHER_NAMES: Record<number, string[]> = {
  13: ['ALUMINIUM'],
  16: ['SULPHUR'],
  55: ['CAESIUM'],
  74: ['WOLFRAM'],
};

export interface Element {
  z: number;
  symbol: string;
  /** The name in capitals, US spelling, as DOE prints it. */
  name: string;
  /** Other accepted answers: the symbol and other spellings. */
  accept: string[];
}

export const ELEMENT_COUNT = SYMBOL_LIST.length;

export function element(z: number): Element {
  if (!Number.isInteger(z) || z < 1 || z > ELEMENT_COUNT) throw new Error(`element(${z}): only 1–${ELEMENT_COUNT}`);
  const symbol = SYMBOL_LIST[z - 1];
  return { z, symbol, name: NAME_LIST[z - 1], accept: [symbol, ...(OTHER_NAMES[z] ?? [])] };
}

/**
 * Period and group (1–18) of an element in the 18-column table, or null for the lanthanides (57–71),
 * whose group-3 placement depends on the table's layout.
 */
export function tablePosition(z: number): { period: number; group: number } | null {
  if (z === 1) return { period: 1, group: 1 };
  if (z === 2) return { period: 1, group: 18 };
  if (z <= 10) return { period: 2, group: z <= 4 ? z - 2 : z + 8 };
  if (z <= 18) return { period: 3, group: z <= 12 ? z - 10 : z };
  if (z <= 36) return { period: 4, group: z - 18 };
  if (z <= 54) return { period: 5, group: z - 36 };
  if (z <= 56) return { period: 6, group: z - 54 };
  if (z <= 71) return null;
  if (z <= 86) return { period: 6, group: z - 68 };
  return null;
}

/** Subshells in filling (Aufbau) order through 4p, with their capacities. */
export const SUBSHELLS: ReadonlyArray<readonly [string, number]> = [
  ['1s', 2],
  ['2s', 2],
  ['2p', 6],
  ['3s', 2],
  ['3p', 6],
  ['4s', 2],
  ['3d', 10],
  ['4p', 6],
];

/** Ground-state configuration of a neutral atom (Z ≤ 36) in filling order, including chromium's and copper's 4s¹. */
export function groundState(z: number): Array<{ subshell: string; electrons: number }> {
  if (!Number.isInteger(z) || z < 1 || z > 36) throw new Error(`groundState(${z}): only 1–36`);
  const out: Array<{ subshell: string; electrons: number }> = [];
  let left = z;
  for (const [subshell, capacity] of SUBSHELLS) {
    if (left <= 0) break;
    const electrons = Math.min(capacity, left);
    out.push({ subshell, electrons });
    left -= electrons;
  }
  if (z === 24 || z === 29) {
    // Cr: [Ar] 4s¹ 3d⁵; Cu: [Ar] 4s¹ 3d¹⁰ (a half-filled or filled d subshell).
    out.find((s) => s.subshell === '4s')!.electrons = 1;
    out.find((s) => s.subshell === '3d')!.electrons += 1;
  }
  return out;
}
