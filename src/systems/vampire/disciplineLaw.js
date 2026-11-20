// @ts-check
// BUNNYFALL VAMPIRE EXPANSION: THE DISCIPLINES' LAW (2026-11-20, the owner: "lets work on that, i want them to cast via
// hotkey"; asked, "3 shared + 2 per clan based on their style", "Vitae + cooldown", breaches "only the obvious ones").
// Pure data and numbers; the casting is disciplines.js, the key and its wheel ui/vampire/disciplineWheel.js.
//
// EACH DISCIPLINE IS A SPELL of the game's own effects (systems/spell/spellEffects.js: `type,subType`), built once by the
// Spell Maker's own builder and cast FREE through the cast engine, as a scroll's is: one on the caster goes off at once,
// one aimed is readied and the next swing or click looses it. It is paid in VITAE (`vitae`) and waits its COOLDOWN
// (`cooldownS`, real seconds). A VISIBLE one (`visible`) cast where townsfolk can see is a Masquerade breach.
// No Discipline is cast while Starving.
//
// Effect settings are DFU's: duration = durBase + durMod x (level / durPer); magnitude = rand(magLo..magHi) +
// rand(lvLo..lvHi) x (level / magPer); chance = chBase + chMod x (level / chPer).

import { VAMPIRE_CLANS } from '../infection.js';
import { t } from '../textManager.js';

const C = VAMPIRE_CLANS;
/** Spell targets and elements (DFU's TargetTypes and ElementTypes as the spell records carry them). */
export const RANGE = Object.freeze({ Self: 0, Touch: 1, Target: 2, AroundCaster: 3, AtRange: 4 });
export const ELEMENT = Object.freeze({ Fire: 0, Frost: 1, Poison: 2, Shock: 3, Magic: 4 });

/** An effect slot: `[type, subType]` and its numbers. */
const fx = (type, subType, { dur = [1, 1, 1], mag = [1, 1, 1, 1, 1], ch = [1, 1, 1] } = {}) => Object.freeze({
  type, subType,
  settings: Object.freeze({
    durationBase: dur[0], durationMod: dur[1], durationPerLevel: dur[2],
    magnitudeBaseLow: mag[0], magnitudeBaseHigh: mag[1], magnitudeLevelBase: mag[2], magnitudeLevelHigh: mag[3], magnitudePerLevel: mag[4],
    chanceBase: ch[0], chanceMod: ch[1], chancePerLevel: ch[2],
  }),
});
/** Classic effect keys used below. */
const E = Object.freeze({
  Paralyze: [0, 255], DamageHealth: [4, 0], ResistFire: [8, 0], ResistFrost: [8, 1], ResistShock: [8, 3],
  FortifyStr: [9, 0], FortifyAgi: [9, 3], FortifySpd: [9, 6], HealHealth: [10, 8], TransferHealth: [11, 8],
  Invisibility: [13, 0], TrueInvisibility: [13, 1], Regenerate: [18, 255], Silence: [19, 255], SpellAbsorption: [20, 255],
  SpellReflection: [21, 255], Shadow: [24, 0], Slowfall: [25, 255], Jumping: [27, 255], PacifyHumanoid: [33, 2],
  Charm: [34, 255], Shield: [35, 255], DetectEnemy: [39, 1],
});

/**
 * @typedef {{ id: string, clan: number|null, name: () => string, words: () => string, vitae: number, cooldownS: number,
 *   visible: boolean, range: number, element: number, icon: number, slots: ReadonlyArray<any> }} Discipline
 */
/** @param {Omit<Discipline, 'name'|'words'> & { en: string, say: string }} d @returns {Readonly<Discipline>} */
const D = (d) => {
  const { en, say, ...rest } = d;
  return Object.freeze({ ...rest, name: () => t(`discipline.${d.id}.name`, en), words: () => t(`discipline.${d.id}.words`, say) });
};

/** EVERY DISCIPLINE: the three every awakened vampire has, then each clan's two. */
export const DISCIPLINES = Object.freeze([
  // ── the shared three ──
  D({ id: 'bloodHeal', clan: null, en: 'Blood Heal', say: 'Vitae knits your wounds closed.', vitae: 10, cooldownS: 20, visible: false, range: RANGE.Self, element: ELEMENT.Magic, icon: 7,
    slots: [fx(...E.HealHealth, { mag: [20, 30, 3, 5, 2] })] }),
  D({ id: 'beastFury', clan: null, en: "Beast's Fury", say: 'You let the Beast into your arms and legs.', vitae: 12, cooldownS: 60, visible: true, range: RANGE.Self, element: ELEMENT.Magic, icon: 20,
    slots: [fx(...E.FortifyStr, { dur: [20, 2, 2], mag: [12, 15, 1, 2, 2] }), fx(...E.FortifySpd, { dur: [20, 2, 2], mag: [12, 15, 1, 2, 2] })] }),
  D({ id: 'mistForm', clan: null, en: 'Mist Form', say: 'You thin to a grey mist.', vitae: 15, cooldownS: 90, visible: false, range: RANGE.Self, element: ELEMENT.Magic, icon: 33,
    slots: [fx(...E.Invisibility, { dur: [8, 1, 3] }), fx(...E.Slowfall, { dur: [12, 1, 3] })] }),
  // ── Anthotis: occultists of the blood ──
  D({ id: 'bloodSiphon', clan: C.Anthotis, en: 'Blood Siphon', say: 'You pull their blood across the air into you.', vitae: 10, cooldownS: 25, visible: true, range: RANGE.Target, element: ELEMENT.Magic, icon: 52,
    slots: [fx(...E.TransferHealth, { mag: [15, 25, 2, 4, 2] })] }),
  D({ id: 'arcaneWard', clan: C.Anthotis, en: 'Arcane Ward', say: 'Your blood drinks the next spell meant for you.', vitae: 14, cooldownS: 120, visible: false, range: RANGE.Self, element: ELEMENT.Magic, icon: 44,
    slots: [fx(...E.SpellAbsorption, { dur: [30, 2, 2], ch: [40, 2, 2] })] }),
  // ── Garlythi: ward-keepers of the north ──
  D({ id: 'bastion', clan: C.Garlythi, en: 'Bastion', say: 'A ward of old blood stands about you.', vitae: 12, cooldownS: 60, visible: false, range: RANGE.Self, element: ELEMENT.Magic, icon: 16,
    slots: [fx(...E.Shield, { dur: [30, 2, 2], mag: [25, 35, 2, 4, 2] })] }),
  D({ id: 'northernMirror', clan: C.Garlythi, en: 'Northern Mirror', say: 'Magic turns back on whoever sends it.', vitae: 15, cooldownS: 120, visible: false, range: RANGE.Self, element: ELEMENT.Magic, icon: 45,
    slots: [fx(...E.SpellReflection, { dur: [20, 2, 2], ch: [35, 2, 2] })] }),
  // ── Haarvenu: frost and fire through the Vitae ──
  D({ id: 'bloodFire', clan: C.Haarvenu, en: 'Blood Fire', say: 'Your blood leaves your hand as fire.', vitae: 12, cooldownS: 20, visible: true, range: RANGE.Target, element: ELEMENT.Fire, icon: 2,
    slots: [fx(...E.DamageHealth, { mag: [25, 40, 3, 5, 2] })] }),
  D({ id: 'frostVeins', clan: C.Haarvenu, en: 'Frost Veins', say: 'The cold in your veins bursts out around you.', vitae: 15, cooldownS: 45, visible: true, range: RANGE.AroundCaster, element: ELEMENT.Frost, icon: 9,
    slots: [fx(...E.DamageHealth, { mag: [15, 25, 2, 4, 2] })] }),
  // ── Khulari: patient mountain predators ──
  D({ id: 'frozenGaze', clan: C.Khulari, en: 'Frozen Gaze', say: 'Your eyes hold them where they stand.', vitae: 14, cooldownS: 45, visible: true, range: RANGE.Target, element: ELEMENT.Magic, icon: 30,
    slots: [fx(...E.Paralyze, { dur: [5, 1, 4], ch: [55, 3, 2] })] }),
  D({ id: 'stalker', clan: C.Khulari, en: 'Stalker', say: 'You fade into the dark and your steps make no sound.', vitae: 10, cooldownS: 60, visible: false, range: RANGE.Self, element: ELEMENT.Magic, icon: 34,
    slots: [fx(...E.Shadow, { dur: [30, 2, 2] }), fx(...E.Jumping, { dur: [30, 2, 2] })] }),
  // ── Lyrezi: whisper-brokers behind silence ──
  D({ id: 'hush', clan: C.Lyrezi, en: 'Hush', say: 'Their words die in their throat.', vitae: 12, cooldownS: 40, visible: false, range: RANGE.Target, element: ELEMENT.Magic, icon: 37,
    slots: [fx(...E.Silence, { dur: [10, 1, 3], ch: [55, 3, 2] })] }),
  D({ id: 'unseen', clan: C.Lyrezi, en: 'Unseen', say: 'No eye can find you now.', vitae: 18, cooldownS: 120, visible: false, range: RANGE.Self, element: ELEMENT.Magic, icon: 33,
    slots: [fx(...E.TrueInvisibility, { dur: [15, 1, 3] })] }),
  // ── Montalion: movers of Wayrest's halls ──
  D({ id: 'courtCommand', clan: C.Montalion, en: 'Court Command', say: 'They forget why they were angry with you.', vitae: 12, cooldownS: 45, visible: false, range: RANGE.Target, element: ELEMENT.Magic, icon: 41,
    slots: [fx(...E.PacifyHumanoid, { ch: [50, 3, 2] })] }),
  D({ id: 'exitStage', clan: C.Montalion, en: 'Exit Stage Left', say: 'You are gone before they turn round.', vitae: 15, cooldownS: 90, visible: false, range: RANGE.Self, element: ELEMENT.Magic, icon: 33,
    slots: [fx(...E.Invisibility, { dur: [10, 1, 3] }), fx(...E.FortifySpd, { dur: [10, 1, 3], mag: [20, 25, 1, 2, 2] })] }),
  // ── Selenu: hardened coastal survivors ──
  D({ id: 'weatheredHide', clan: C.Selenu, en: 'Weathered Hide', say: 'Fire, frost and storm slide off your skin.', vitae: 12, cooldownS: 90, visible: false, range: RANGE.Self, element: ELEMENT.Magic, icon: 12,
    slots: [fx(...E.ResistFire, { dur: [60, 3, 2], ch: [60, 2, 2] }), fx(...E.ResistFrost, { dur: [60, 3, 2], ch: [60, 2, 2] }), fx(...E.ResistShock, { dur: [60, 3, 2], ch: [60, 2, 2] })] }),
  D({ id: 'predator', clan: C.Selenu, en: 'Predator', say: 'You move like the beasts you hunt.', vitae: 12, cooldownS: 60, visible: true, range: RANGE.Self, element: ELEMENT.Magic, icon: 21,
    slots: [fx(...E.FortifyStr, { dur: [30, 2, 2], mag: [10, 12, 1, 2, 2] }), fx(...E.FortifyAgi, { dur: [30, 2, 2], mag: [10, 12, 1, 2, 2] })] }),
  // ── Thrafey: restorative caretakers ──
  D({ id: 'mendingBlood', clan: C.Thrafey, en: 'Mending Blood', say: 'Your blood keeps mending you, a little at a time.', vitae: 12, cooldownS: 60, visible: false, range: RANGE.Self, element: ELEMENT.Magic, icon: 7,
    slots: [fx(...E.Regenerate, { dur: [30, 2, 2], mag: [3, 5, 1, 1, 3] })] }),
  D({ id: 'lure', clan: C.Thrafey, en: 'Lure', say: 'They find you charming, and come closer.', vitae: 10, cooldownS: 45, visible: false, range: RANGE.Target, element: ELEMENT.Magic, icon: 40,
    slots: [fx(...E.Charm, { ch: [55, 3, 2] })] }),
  // ── Vraseth: city-bred rooftop hunters ──
  D({ id: 'rooftopLeap', clan: C.Vraseth, en: 'Rooftop Leap', say: 'Your legs coil like a cat\'s.', vitae: 10, cooldownS: 45, visible: true, range: RANGE.Self, element: ELEMENT.Magic, icon: 22,
    slots: [fx(...E.Jumping, { dur: [30, 2, 2] }), fx(...E.Slowfall, { dur: [30, 2, 2] }), fx(...E.FortifySpd, { dur: [30, 2, 2], mag: [10, 15, 1, 2, 2] })] }),
  D({ id: 'huntersSense', clan: C.Vraseth, en: "Hunter's Sense", say: 'You smell every living thing that means you harm.', vitae: 8, cooldownS: 60, visible: false, range: RANGE.Self, element: ELEMENT.Magic, icon: 39,
    slots: [fx(...E.DetectEnemy, { dur: [60, 3, 2] }), fx(...E.FortifyAgi, { dur: [60, 3, 2], mag: [8, 10, 1, 1, 3] })] }),
]);

/** A Discipline by its id, or null. @param {string} id */
export const disciplineById = (id) => DISCIPLINES.find((d) => d.id === id) ?? null;
/** The Disciplines a clan's vampire knows: the shared three, then the clan's two (none while `withhold`). */
export function disciplinesFor(clan, { withhold = false } = {}) {
  return DISCIPLINES.filter((d) => d.clan == null || (!withhold && d.clan === clan));
}
