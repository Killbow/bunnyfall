// @ts-check
// BUNNYFALL (2026-11-06, the owner: "consider this a rework of melee combat"; "two handers should sit above one handers";
// "buff the weakest ones instead of nerfing"; "slower h2h with a shield for damage reduction"): THE MELEE REWORK, step 1
// and 2 - every number in one table, so tuning it is this file.
//
// THE WEAPON'S POWER: a player's weapon blow (bows too) is multiplied by its template's row, after the strength, the
// material and the blow modifiers' place in the formula and before the armour (combat/entityMods.js
// registerWeaponBlowMod - it asks no room under the power ceiling: this is the weapon itself, not a power on it). The rows
// were set from tools/styleMeasure.mjs: each weapon alone, Rare gear, against DFU's level band, its damage a second over
// a longsword's averaged at levels 10, 20 and 30 (the "was" column), lifted to its family's band:
//   one-handed long blades 1.00, short blades 0.95 (the dagger 0.90: they swing fastest), one-handed blunt and axes 1.05
//   (RR Items' light pair 1.00), two-handers 1.25 (the warhammer and the war axe 1.28, the staff 1.20), bows 0.85 (the
//   range is the rest). Nothing is below 1: the rework buffs, it never nerfs. Dual wield, the dai-katana and the bare hand
//   were the measure's top and keep their place (a pair's weapons take their rows, so a pair of maces rises with the mace).
//
// THE SHIELD'S BLOCK: a player holding a shield takes that share less of every weapon or arrow blow that lands
// (systems/blowTaken.js, after the armour), by its size - spells pass a shield by. The armour a shield already gave (its
// parts' armour value) stays.
//
// THE FISTS' SHIELD: bare hands with a shield on the other arm swing FISTS_SHIELD_SLOW as long a frame (one fist works, the
// other holds the shield) - the block is kept, the punches slow (characters/weaponStates.js registerSwingBurden).
import { registerWeaponBlowMod } from '../systems/entityMods.js';
import { registerBlowTakenMod } from '../systems/blowTaken.js';
import { registerSwingBurden } from '../characters/weaponStates.js';
import { equipTableOf, EQUIP_SLOTS } from '../systems/equip.js';
import { isShieldTemplate } from '../systems/armorMaterials.js';

/** The switch: off, every row reads 1, no shield blocks and no fist slows. */
export const MELEE_REWORK = { on: true };

/** Each weapon template's multiplier on the player's blow: [multiplier, measured share of a longsword before]. */
export const WEAPON_POWER = Object.freeze({
  // one-handed long blades - 1.00
  118: [1.07, 0.94],   // Broadsword
  119: [1.05, 0.95],   // Saber
  120: [1.00, 1.00],   // Longsword (the measure)
  121: [1.00, 1.03],   // Katana
  // short blades - 0.95, the dagger 0.90
  113: [1.27, 0.71],   // Dagger
  114: [1.24, 0.75],   // Tanto
  116: [1.14, 0.83],   // Shortsword
  117: [1.08, 0.88],   // Wakizashi
  // one-handed blunt and axes - 1.05 (RR Items' light pair 1.00)
  124: [1.16, 0.91],   // Mace
  127: [1.16, 0.90],   // Battle Axe
  513: [1.31, 0.76],   // Archer's Axe (RR Items)
  514: [1.26, 0.80],   // Light Flail (RR Items)
  // two-handers - 1.25 (the warhammer and the war axe 1.28, the staff 1.20)
  122: [1.09, 1.14],   // Claymore
  123: [1.07, 1.17],   // Dai-katana
  125: [1.12, 1.11],   // Flail
  126: [1.12, 1.15],   // Warhammer
  128: [1.12, 1.14],   // War Axe
  115: [1.25, 0.96],   // Staff
  // bows - 0.85
  129: [1.29, 0.63],   // Short Bow
  130: [1.31, 0.67],   // Long Bow
});

/** The share of a landed weapon or arrow blow a held shield takes off, by its template (per cent). */
export const SHIELD_BLOCK = Object.freeze({ 109: 5, 110: 8, 111: 12, 112: 18 });   // Buckler, Round, Kite, Tower

/** Bare fists with a shield held: this times the swing's frame (about 13% fewer punches a second). */
export const FISTS_SHIELD_SLOW = 1.15;

/** The multiplier a player's blow with `weapon` takes (1 for anything not in the table, or the rework off). */
export const weaponPower = (weapon) => (MELEE_REWORK.on && weapon ? (WEAPON_POWER[weapon.templateIndex]?.[0] ?? 1) : 1);

/** The shield `entity` holds, or null. */
function heldShield(entity) {
  const it = entity ? equipTableOf(entity)?.[EQUIP_SLOTS.LeftHand] : null;
  return it && isShieldTemplate(it.templateIndex) && !(it.currentCondition <= 0) ? it : null;
}

/** The share (0..1) of a blow the player's shield blocks, or 0. */
export function shieldBlockShare(entity) {
  if (!MELEE_REWORK.on || !entity?.isPlayer) return 0;
  const s = heldShield(entity);
  return s ? (SHIELD_BLOCK[s.templateIndex] ?? 0) / 100 : 0;
}

registerWeaponBlowMod('melee-rework', (weapon, damage, attacker) => (attacker?.isPlayer && weapon ? damage * weaponPower(weapon) : damage));
registerBlowTakenMod('shield-block', (_attacker, target, _weapon, info) => (info?.kind === 'spell' ? 1 : 1 - shieldBlockShare(target)));
registerSwingBurden((ctx) => {
  if (!MELEE_REWORK.on || !ctx?.entity?.isPlayer || ctx.weaponType !== 15) return 1;   // 15: WeaponTypes.Melee, the bare hand
  return heldShield(ctx.entity) ? FISTS_SHIELD_SLOW : 1;
});
