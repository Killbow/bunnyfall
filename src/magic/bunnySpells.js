// @ts-check
// Bunnyfall's eight spell effects, typed past every classic type (45 and 46 are already the game's own), and the
// ready-made spells built from them.

import { buildCustomSpell } from './spellMaker.js';

export * from './bunnySpellLaw.js';
import { METEOR_TYPE, SLOW_TYPE, CLAIRVOYANCE_TYPE, RESCUE_TYPE, FEATHERWEIGHT_TYPE, WALL_TYPE, DECOY_TYPE, WELL_TYPE } from './bunnySpellLaw.js';

// The ready-made indices sit below READY_MADE_INDEX_CEILING (spellMaker.js), in their own band.
export const BUNNY_SPELL_INDEX = Object.freeze({
  meteor: -47001, frostNova: -47002, clairvoyance: -47003, rescue: -47004,
  featherweight: -47005, wallOfEarth: -47006, decoy: -47007, gravityWell: -47008,
});

const dur = (base, mod = 2, per = 1) => ({ durationBase: base, durationMod: mod, durationPerLevel: per });
const dmg = (lo, hi, per = 2) => ({ magnitudeBaseLow: lo, magnitudeBaseHigh: hi, magnitudeLevelBase: 1, magnitudeLevelHigh: 3, magnitudePerLevel: per });
const fx = (/** @type {number} */ type, settings = {}) => ({ type, subType: 255, settings });
const DAMAGE_HEALTH = (settings) => ({ type: 4, subType: 0, settings });

// Made fresh each call, because a bought record becomes the player's. Elements: 0 fire, 1 frost, and 4 magic.
// Range types: 0 caster, 1 touch, 2 single at range, 3 area around the caster, and 4 area at range.
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
