/**
 * Rule presets. Every number the game engine uses comes from here, and the public
 * "NSB rules at a glance" page is generated from the same data, so the two can't drift.
 *
 * Source: 2027 National Science Bowl Competition Rules (in person, dated 10-04-2026)
 * and 2027 Virtual NSB Rules. Update these each October when DOE posts new rules,
 * then run `npm test`.
 */

export const RULES_2027_URL = 'https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027.pdf';
export const RULES_2027_VIRTUAL_URL = 'https://science.osti.gov/-/media/wdts/nsb/pdf/NSB-Resources/Rules2027_Virtual_NSB.pdf';

export type InterruptFaultMode =
  /** DOE rule 6-2: the opposing team gains 4 points and hears the full question. */
  | 'opponent_gains'
  /** Common invitational variant: the interrupting team loses 4 points ("neg"). */
  | 'interrupter_loses';

export interface RulesPreset {
  id: string;
  name: string;
  /** Short description shown when choosing a preset. */
  summary: string;
  season: string;
  /** True for the official DOE presets; false for variants teams may choose. */
  official: boolean;
  points: {
    tossup: number;
    bonus: number;
    /** Points involved when a player faults on an interrupted toss-up. */
    interruptFault: number;
  };
  interruptFaultMode: InterruptFaultMode;
  timing: {
    /** Seconds both teams have to buzz after the toss-up is fully read (Rule 5-2). */
    tossupWindowSec: number;
    /** Seconds the other team has after a wrong answer on a fully read toss-up (Rule 3-8). */
    reboundWindowSec: number;
    /** Seconds for the captain to begin a bonus answer (Rule 5-4). */
    bonusSec: number;
    /** When the "5 SECONDS" warning is given (Rule 5-5). */
    bonusWarningAtSec: number;
    /** Natural pause allowed before a recognized player must answer (Rule 5-3). */
    naturalPauseSec: number;
  };
  /**
   * Visual bonuses (Finals rounds that use them): seconds for the captain to begin, and when the warning is
   * given (Rules 5-4, 5-5). Null for events without visual bonuses.
   */
  visualBonus: { sec: number; warningAtSec: number } | null;
  /** Game clock; null means untimed practice. */
  clock: { halves: number; halfMinutes: number; breakMinutes: number } | null;
  /** Maximum toss-ups in a game (virtual events stop at 18); null means play the whole packet. */
  maxTossups: number | null;
  /** Number of toss-ups in a tiebreaker series (no bonuses, no clock). */
  tiebreakTossups: number;
  /** Unsuccessful science challenges allowed per team per round (Rule 7-3). */
  unsuccessfulChallengeLimit: number | null;
  communication: { tossup: string; bonus: string };
  /** Rule references shown on the rules page. */
  notes: { rule: string; text: string }[];
  source: { title: string; url: string } | null;
}

/** Visual bonus timing at the 2027 Finals (Rules 5-4, 5-5). */
export const FINALS_VISUAL_BONUS = { sec: 30, warningAtSec: 25 } as const;

/**
 * The answer window for a visual bonus under `preset`: the preset's own, or the Finals timing when a team
 * practices visual bonuses under rules that have none.
 */
export function visualBonusTiming(preset: RulesPreset): { sec: number; warningAtSec: number } {
  return preset.visualBonus ?? FINALS_VISUAL_BONUS;
}

/** Round-robin ties among several teams at regionals (Rule 9-1 iii); shown with the regional presets. */
const SHOOTOUT_NOTE = {
  rule: '9-1',
  text: 'Round robin ties for advancing places: head-to-head record first; two teams still tied play a 5 toss-up tiebreaker; three or more each hear the same 5 toss-ups separately, scored +1 right, −1 wrong, 0 no answer.',
};

const COMMON_NOTES: RulesPreset['notes'] = [
  { rule: '3-5', text: 'Nobody may buzz until the moderator has read the subject area. An early buzz is ignored and the player stays eligible.' },
  { rule: '3-7', text: 'Only the first response counts. On multiple choice, a player may give the letter or the answer text; if they give both, both must be right.' },
  { rule: '3-2', text: 'Each team gets at most one chance at a toss-up.' },
  { rule: '4-1', text: 'Answering before being recognized is a blurt: no points, and that team loses the toss-up.' },
  { rule: '5-6', text: 'A toss-up begun before time expires is finished, including its bonus. The second half starts with the first toss-up not read in the first half.' },
  { rule: '6-3', text: 'Double interrupt: if the other team also faults while interrupting the re-read, the first team gets 4 points and play moves on.' },
  { rule: 'A-2', text: 'Numerical answers must be exact and in simplest form. Units are optional, but if given they must be correct. A last name alone is enough for a person.' },
];

export const PRESETS: RulesPreset[] = [
  {
    id: 'doe-regional-2027',
    name: 'DOE Regional 2027 (in person)',
    summary: 'Official 2027 rules for in-person regionals: two 8-minute halves, +4 to the opponent on a wrong interrupt.',
    season: '2027',
    official: true,
    points: { tossup: 4, bonus: 10, interruptFault: 4 },
    interruptFaultMode: 'opponent_gains',
    timing: { tossupWindowSec: 5, reboundWindowSec: 5, bonusSec: 20, bonusWarningAtSec: 15, naturalPauseSec: 2 },
    visualBonus: null,
    clock: { halves: 2, halfMinutes: 8, breakMinutes: 2 },
    maxTossups: null,
    tiebreakTossups: 5,
    unsuccessfulChallengeLimit: 2,
    communication: {
      tossup: 'Teammates may communicate quietly and non-verbally, for example in writing or by hand signals (Rule 4-2).',
      bonus: 'Open discussion; only the captain gives the answer (Rule 3-9).',
    },
    notes: [...COMMON_NOTES, SHOOTOUT_NOTE],
    source: { title: '2027 National Science Bowl Competition Rules', url: RULES_2027_URL },
  },
  {
    id: 'doe-virtual-2027',
    name: 'DOE Virtual 2027',
    summary: 'Official 2027 virtual rules: 18 toss-ups or two 8-minute halves, hand signals only.',
    season: '2027',
    official: true,
    points: { tossup: 4, bonus: 10, interruptFault: 4 },
    interruptFaultMode: 'opponent_gains',
    timing: { tossupWindowSec: 5, reboundWindowSec: 5, bonusSec: 20, bonusWarningAtSec: 15, naturalPauseSec: 2 },
    visualBonus: null,
    clock: { halves: 2, halfMinutes: 8, breakMinutes: 2 },
    maxTossups: 18,
    tiebreakTossups: 5,
    unsuccessfulChallengeLimit: 2,
    communication: {
      tossup: 'Hand signals only; no writing or Zoom chat (Virtual Rule 4-2).',
      bonus: 'Open discussion; the captain raises a hand and gives the answer (Virtual Rule 3-9).',
    },
    notes: [
      ...COMMON_NOTES,
      { rule: 'V 5-1', text: 'The game ends when time expires or all 18 toss-ups (and earned bonuses) have been read.' },
      { rule: 'V 5-6', text: 'A question counts as begun once its subject area has been completely read.' },
    ],
    source: { title: '2027 Virtual National Science Bowl Rules', url: RULES_2027_VIRTUAL_URL },
  },
  {
    id: 'doe-finals-2027',
    name: 'DOE National Finals 2027',
    summary: 'Official 2027 Finals rules for round robin and double elimination rounds without visual bonuses: two 10-minute halves.',
    season: '2027',
    official: true,
    points: { tossup: 4, bonus: 10, interruptFault: 4 },
    interruptFaultMode: 'opponent_gains',
    timing: { tossupWindowSec: 5, reboundWindowSec: 5, bonusSec: 20, bonusWarningAtSec: 15, naturalPauseSec: 2 },
    visualBonus: null,
    clock: { halves: 2, halfMinutes: 10, breakMinutes: 2 },
    maxTossups: null,
    tiebreakTossups: 5,
    unsuccessfulChallengeLimit: 2,
    communication: {
      tossup: 'Teammates may communicate quietly and non-verbally (Rule 4-2).',
      bonus: 'Open discussion; only the captain gives the answer (Rule 3-9).',
    },
    notes: [
      ...COMMON_NOTES,
      { rule: '6-4', text: 'Elimination games tied at the end go to a tiebreaker: 5 toss-ups, no bonuses and no game clock, repeated until the tie is broken.' },
      { rule: '5-1', text: 'Some double elimination rounds use visual bonuses; those rounds have two 12-minute halves (see the visual bonus preset). Double Elimination Rounds Ten and Eleven have 5-minute breaks.' },
    ],
    source: { title: '2027 National Science Bowl Competition Rules', url: RULES_2027_URL },
  },
  {
    id: 'doe-finals-visual-2027',
    name: 'DOE National Finals 2027, visual bonus rounds',
    summary: 'Official 2027 Finals rules for double elimination rounds with visual bonuses: two 12-minute halves; a visual bonus allows 30 seconds, with the warning at 25.',
    season: '2027',
    official: true,
    points: { tossup: 4, bonus: 10, interruptFault: 4 },
    interruptFaultMode: 'opponent_gains',
    timing: { tossupWindowSec: 5, reboundWindowSec: 5, bonusSec: 20, bonusWarningAtSec: 15, naturalPauseSec: 2 },
    visualBonus: FINALS_VISUAL_BONUS,
    clock: { halves: 2, halfMinutes: 12, breakMinutes: 2 },
    maxTossups: null,
    tiebreakTossups: 5,
    unsuccessfulChallengeLimit: 2,
    communication: {
      tossup: 'Teammates may communicate quietly and non-verbally (Rule 4-2).',
      bonus: 'Open discussion; only the captain gives the answer (Rule 3-9). A visual bonus is shown on a monitor or on a worksheet.',
    },
    notes: [
      ...COMMON_NOTES,
      { rule: '5-4', text: 'On a visual bonus the captain has 30 seconds to begin the answer, counted from the end of the reading; "5 SECONDS" is called at 25 seconds (Rule 5-5). Other bonuses keep 20 seconds.' },
      { rule: 'A-1 g', text: 'Figures in visual bonuses may or may not be drawn to scale.' },
      { rule: '6-4', text: 'Elimination games tied at the end go to a tiebreaker: 5 toss-ups, no bonuses and no game clock, repeated until the tie is broken.' },
      { rule: '5-1', text: 'Double Elimination Rounds Ten and Eleven have 5-minute breaks.' },
    ],
    source: { title: '2027 National Science Bowl Competition Rules', url: RULES_2027_URL },
  },
  {
    id: 'invitational-neg4',
    name: 'Invitational (−4 interrupt)',
    summary: 'A common invitational variant: a wrong interrupt costs the interrupting team 4 points instead of giving them to the opponent.',
    season: '2027',
    official: false,
    points: { tossup: 4, bonus: 10, interruptFault: 4 },
    interruptFaultMode: 'interrupter_loses',
    timing: { tossupWindowSec: 5, reboundWindowSec: 5, bonusSec: 20, bonusWarningAtSec: 15, naturalPauseSec: 2 },
    visualBonus: null,
    clock: { halves: 2, halfMinutes: 8, breakMinutes: 2 },
    maxTossups: null,
    tiebreakTossups: 5,
    unsuccessfulChallengeLimit: 2,
    communication: {
      tossup: 'Check the tournament’s rules.',
      bonus: 'Check the tournament’s rules.',
    },
    notes: COMMON_NOTES,
    source: null,
  },
  {
    id: 'practice-untimed',
    name: 'Practice (no game clock)',
    summary: 'DOE scoring and answer windows, but no game clock: play the whole packet at your own pace.',
    season: '2027',
    official: false,
    points: { tossup: 4, bonus: 10, interruptFault: 4 },
    interruptFaultMode: 'opponent_gains',
    timing: { tossupWindowSec: 5, reboundWindowSec: 5, bonusSec: 20, bonusWarningAtSec: 15, naturalPauseSec: 2 },
    visualBonus: FINALS_VISUAL_BONUS,
    clock: null,
    maxTossups: null,
    tiebreakTossups: 5,
    unsuccessfulChallengeLimit: null,
    communication: {
      tossup: 'Teammates may communicate quietly and non-verbally (Rule 4-2).',
      bonus: 'Open discussion; only the captain gives the answer (Rule 3-9).',
    },
    notes: COMMON_NOTES,
    source: null,
  },
];

/**
 * The season whose DOE rules are current, and its official presets. Each fall's update (MAINTAINING.md, "New
 * rules each season") adds the new season's presets above, keeps the old ones (saved games refer to them), and
 * points these at the new ones.
 */
export const CURRENT_SEASON = '2027';
export const CURRENT_PRESET_IDS = {
  regional: 'doe-regional-2027',
  virtual: 'doe-virtual-2027',
  finals: 'doe-finals-2027',
  finalsVisual: 'doe-finals-visual-2027',
} as const;
export const CURRENT_RULES_URL = RULES_2027_URL;

export const DEFAULT_PRESET_ID: string = CURRENT_PRESET_IDS.regional;

/** The presets to offer: this season's. Older seasons' stay in PRESETS so saved games still replay. */
export function currentPresets(): RulesPreset[] {
  return PRESETS.filter((p) => p.season === CURRENT_SEASON);
}

export function getPreset(id: string): RulesPreset {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown rules preset: ${id}`);
  return preset;
}
