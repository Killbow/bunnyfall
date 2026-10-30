// @ts-check
// BUNNY-SPELLS (2026-10-30, the owner: "add some magical effects"): BUNNYFALL'S OWN EFFECTS, and the spells made of them.
//
// Eight effects Daggerfall never had, keyed past every classic type (45 and 46 are the port's own already):
//   47 Meteor        Destruction  An Area at Range spell carrying it falls from the sky on the spot aimed at, and its
//                                 burst throws the foes in it back.
//   48 Slow          Destruction  Duration. A foe under it moves at half its speed (characters/enemy/enemyMotor.js).
//   49 Clairvoyance  Mysticism    Duration, on the caster. While it lasts, the quest guide shows its Exact tier: where
//                                 each quest's people, things and foes stand (systems/quest/questGuidance.js).
//   50 Rescue        Mysticism    Pulls a party member, a companion or an allied creature the caster can SEE to the
//                                 caster's side (scenes/bunnySpellEngine.js; another player through their party pose).
//   51 Featherweight Alteration   Duration, on the caster. What they carry weighs half (systems/inventory.js).
//   52 Wall of Earth Alteration   Duration, on the caster. A wall of earth rises where they look, blocking the way.
//   53 Decoy         Illusion     Duration, on the caster. A double appears where they look: the foes about it lose
//                                 the caster and go to it.
//   54 Gravity Well  Thaumaturgy  Duration. Where an area spell carrying it bursts, a well opens that pulls the foes
//                                 about it to its centre.
// The ready-made spells (one each, Slow ridden by Frost Nova) are sold online at the spell shop, as Resurrection is.

import { buildCustomSpell } from './spellMaker.js';

export * from './bunnySpellLaw.js';
import { METEOR_TYPE, SLOW_TYPE, CLAIRVOYANCE_TYPE, RESCUE_TYPE, FEATHERWEIGHT_TYPE, WALL_TYPE, DECOY_TYPE, WELL_TYPE } from './bunnySpellLaw.js';

/** The ready-made spells' indices: below the ready-made ceiling (spellMaker.js READY_MADE_INDEX_CEILING), their own band. */
export const BUNNY_SPELL_INDEX = Object.freeze({
  meteor: -47001, frostNova: -47002, clairvoyance: -47003, rescue: -47004,
  featherweight: -47005, wallOfEarth: -47006, decoy: -47007, gravityWell: -47008,
});

const dur = (base, mod = 2, per = 1) => ({ durationBase: base, durationMod: mod, durationPerLevel: per });
const dmg = (lo, hi, per = 2) => ({ magnitudeBaseLow: lo, magnitudeBaseHigh: hi, magnitudeLevelBase: 1, magnitudeLevelHigh: 3, magnitudePerLevel: per });
const fx = (/** @type {number} */ type, settings = {}) => ({ type, subType: 255, settings });
const DAMAGE_HEALTH = (settings) => ({ type: 4, subType: 0, settings });

/** The ready-made spells, made fresh each call (a record is the player's once bought). Elements: 0 fire, 1 frost,
 *  4 magic; range types: 0 caster, 1 touch, 2 single at range, 3 area around the caster, 4 area at range. */
export function bunnySpells() {
  return [
    buildCustomSpell({ name: 'Meteor', element: 0, rangeType: 4, icon: 70, index: BUNNY_SPELL_INDEX.meteor,
      slots: [DAMAGE_HEALTH(dmg(15, 30, 3)), fx(METEOR_TYPE)] }),
    buildCustomSpell({ name: 'Frost Nova', element: 1, rangeType: 3, icon: 72, index: BUNNY_SPELL_INDEX.frostNova,
      slots: [DAMAGE_HEALTH(dmg(8, 16, 2)), fx(SLOW_TYPE, dur(5, 1, 2))] }),
    buildCustomSpell({ name: 'Clairvoyance', element: 4, rangeType: 0, icon: 75, index: BUNNY_SPELL_INDEX.clairvoyance,
      slots: [fx(CLAIRVOYANCE_TYPE, dur(30, 3, 1))] }),
    buildCustomSpell({ name: 'Rescue', element: 4, rangeType: 2, icon: 77, index: BUNNY_SPELL_INDEX.rescue,
      slots: [fx(RESCUE_TYPE)] }),
    buildCustomSpell({ name: 'Featherweight', element: 4, rangeType: 0, icon: 81, index: BUNNY_SPELL_INDEX.featherweight,
      slots: [fx(FEATHERWEIGHT_TYPE, dur(20, 2, 1))] }),
    buildCustomSpell({ name: 'Wall of Earth', element: 4, rangeType: 0, icon: 84, index: BUNNY_SPELL_INDEX.wallOfEarth,
      slots: [fx(WALL_TYPE, dur(8, 1, 3))] }),
    buildCustomSpell({ name: 'Decoy', element: 4, rangeType: 0, icon: 88, index: BUNNY_SPELL_INDEX.decoy,
      slots: [fx(DECOY_TYPE, dur(6, 1, 3))] }),
    buildCustomSpell({ name: 'Gravity Well', element: 4, rangeType: 4, icon: 91, index: BUNNY_SPELL_INDEX.gravityWell,
      slots: [fx(WELL_TYPE, dur(4, 1, 3))] }),
  ];
}
