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
//
// STEP 3, WHAT EACH FAMILY DOES BEST (FAMILY below; the player's blows alone):
//   longsword, claymore              STEADY: the weapon's roll never falls in its bottom third
//   broadsword                       the HEWER: a foe wearing no armour (a beast, a monster, an unarmoured man), +15%
//   katana, dai-katana               the DRAW CUT: the first blow on a foe at full health, +50%
//   saber                            the FLOW: each blow on the same foe +5% on the next, to +25%; a new foe or 3 s idle
//                                    starts it again
//   short blades (dagger, tanto, shortsword, wakizashi)  the unaware foe's blow (it had not noticed me), +50%
//   axes (battle axe, war axe, archer's axe)             the FINISHER: a foe under half its health, +25%
//   blunt (flail, warhammer, light flail) and the crossbow  PIERCE: a third of what armour or hide takes, back
//   the mace                         the ARMOUR BREAKER: half of it back
//   the flail                        the CHAIN WHIPS: one blow in seven lands twice
//   the light flail                  QUICK: its swing's frame LIGHT_FLAIL_PACE as long (about 15% more blows)
//   the staff                        the GUARD: both hands on it block as a light shield does
// STEP 4, THE TWO-HANDER'S CLEAVE: combat/meleeCleave.js, by TWO_HANDED_CLEAVE - the claymore's by CLAYMORE_CLEAVE.
// The always-on strengths (steady, pierce, the whip, the finisher over a fight) are inside each row's band - the rows were
// measured again with them on - the rest are the family's edge where it applies.
import { registerWeaponBlowMod } from '../systems/entityMods.js';
import { registerBlowTakenMod } from '../systems/blowTaken.js';
import { registerSwingBurden } from '../characters/weaponStates.js';
import { equipTableOf, EQUIP_SLOTS } from '../systems/equip.js';
import { isShieldTemplate } from '../systems/armorMaterials.js';
import { registerWeaponDamageMod } from '../systems/entityMods.js';
import { registerArmorPierce } from './armorPierce.js';
import { weaponMinDamage, weaponMaxDamage, itemMinDamage, itemMaxDamage } from '../characters/weapons.js';
import { CROSSBOW_TEMPLATE } from '../characters/crossbowIds.js';

/** The switch: off, every row reads 1, no shield blocks and no fist slows. */
export const MELEE_REWORK = { on: true };

/** Each weapon template's multiplier on the player's blow: [multiplier, measured share of a longsword before]. */
export const WEAPON_POWER = Object.freeze({
  // one-handed long blades - 1.00
  118: [1.00, 0.94],   // Broadsword (its hewer's edge on unarmoured foes keeps it in the band)
  119: [1.10, 0.95],   // Saber
  120: [1.00, 1.00],   // Longsword (the measure)
  121: [1.01, 1.03],   // Katana
  // short blades - 0.95, the dagger 0.90
  113: [1.33, 0.71],   // Dagger
  114: [1.34, 0.75],   // Tanto
  116: [1.20, 0.83],   // Shortsword
  117: [1.14, 0.88],   // Wakizashi
  // one-handed blunt and axes - 1.05 (RR Items' light pair 1.00)
  124: [1.23, 0.91],   // Mace
  127: [1.09, 0.90],   // Battle Axe
  513: [1.23, 0.76],   // Archer's Axe (RR Items)
  514: [1.15, 0.80],   // Light Flail (RR Items)
  // two-handers - 1.25 (the warhammer and the war axe 1.28, the staff 1.20)
  122: [1.10, 1.14],   // Claymore
  123: [1.12, 1.17],   // Dai-katana
  125: [1.03, 1.11],   // Flail
  126: [1.18, 1.15],   // Warhammer
  128: [1.05, 1.14],   // War Axe
  115: [1.31, 0.96],   // Staff
  // bows - 0.85
  129: [1.42, 0.63],   // Short Bow
  130: [1.34, 0.67],   // Long Bow
  [CROSSBOW_TEMPLATE]: [1.60, 0.53],   // the Crossbow: half the bow's shots, each much heavier, and it pierces
});

/** Each family's templates (the crossbow's id is RR's, characters/crossbowIds.js). */
export const FAMILY = Object.freeze({
  straight: Object.freeze([120, 122]),
  hewer: Object.freeze([118]),
  drawCut: Object.freeze([121, 123]),
  flow: Object.freeze([119]),
  short: Object.freeze([113, 114, 116, 117]),
  axe: Object.freeze([127, 128, 513]),
  pierce: Object.freeze([125, 126, 514, CROSSBOW_TEMPLATE]),
  breaker: Object.freeze([124]),
  flail: Object.freeze([125]),
  quick: Object.freeze([514]),
  staff: Object.freeze([115]),
});
const inFamily = (fam, weapon) => !!weapon && FAMILY[fam].includes(weapon.templateIndex);
/** The strengths' numbers. */
export const STRENGTH = Object.freeze({
  STEADY_FLOOR: 1 / 3,      // straight swords: the roll's floor, this share up the weapon's span
  HEWER: 1.15,              // the broadsword: a foe wearing no armour
  DRAW_CUT: 1.5,            // katanas: a foe at full health
  FLOW_STEP: 0.05,          // the saber: each blow on the same foe, this more on the next...
  FLOW_MOST: 0.25,          // ...to this
  FLOW_SECONDS: 3,          // ...and gone after this long without a blow
  UNAWARE: 1.5,             // short blades: a foe that had not noticed me
  FINISHER_BELOW: 0.5,      // axes: under this share of its health...
  FINISHER: 1.25,           // ...this much harder
  PIERCE: 1 / 3,            // blunt and the crossbow: this share of the armour's take, back
  BREAKER: 1 / 2,           // the mace: this share
  WHIP_CHANCE: 1 / 7,       // the flail: a blow lands twice this often
  LIGHT_FLAIL_PACE: 0.87,   // the light flail: its swing's frame this long
  STAFF_GUARD: 10,          // the staff: per cent off a landed weapon or arrow blow, as a shield's
});
/** The two-hander's cleave (combat/meleeCleave.js): up to `count` more foes within `metres` of the one struck, each
 *  `share` per cent of the blow that landed. */
export const TWO_HANDED_CLEAVE = Object.freeze({ count: 2, metres: 3, share: 50 });
/** The claymore's own: the crowd's weapon. */
export const CLAYMORE_CLEAVE = Object.freeze({ count: 3, metres: 3, share: 60 });
/** The cleave a two-hander `weapon` swings with. */
export const cleaveOf = (weapon) => (weapon?.templateIndex === 122 ? CLAYMORE_CLEAVE : TWO_HANDED_CLEAVE);

/** The share of a landed weapon or arrow blow a held shield takes off, by its template (per cent). */
export const SHIELD_BLOCK = Object.freeze({ 109: 5, 110: 8, 111: 12, 112: 18 });   // Buckler, Round, Kite, Tower

/** Bare fists with a shield held: this times the swing's frame (about 13% fewer punches a second). The swing's pace
 *  seam (registerSwingBurden) also carries the light flail's quicker frame. */
export const FISTS_SHIELD_SLOW = 1.15;

/** The multiplier a player's blow with `weapon` takes (1 for anything not in the table, or the rework off). */
export const weaponPower = (weapon) => (MELEE_REWORK.on && weapon ? (WEAPON_POWER[weapon.templateIndex]?.[0] ?? 1) : 1);

/** The shield `entity` holds, or null. */
function heldShield(entity) {
  const it = entity ? equipTableOf(entity)?.[EQUIP_SLOTS.LeftHand] : null;
  return it && isShieldTemplate(it.templateIndex) && !(it.currentCondition <= 0) ? it : null;
}

/** The share (0..1) of a blow the player's shield - or a staff held in both hands - blocks, or 0. */
export function shieldBlockShare(entity) {
  if (!MELEE_REWORK.on || !entity?.isPlayer) return 0;
  const s = heldShield(entity);
  if (s) return (SHIELD_BLOCK[s.templateIndex] ?? 0) / 100;
  const r = equipTableOf(entity)?.[EQUIP_SLOTS.RightHand];
  return inFamily('staff', r) && !(r.currentCondition <= 0) ? STRENGTH.STAFF_GUARD / 100 : 0;
}

/** A foe's share of its health (1 when it has no number). */
const healthOf = (e) => (e && e.maxHealth > 0 ? Math.max(0, e.health ?? e.maxHealth) / e.maxHealth : 1);

/** Does `e` wear no armour at all (a beast or a monster: no worn piece in any armour slot). */
function unarmoured(e) {
  if (!e || e.isPlayer) return false;
  const slots = equipTableOf(e) ?? [];
  for (const it of slots) if (it && it.group === 'Armor') return false;
  return true;
}
/** The saber's flow: the foe it is on, its stacks, the last blow's time. */
const _flow = { target: null, n: 0, at: -Infinity };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
function flowBlow(target, estimate) {
  const t = now();
  if (_flow.target !== target || t - _flow.at > STRENGTH.FLOW_SECONDS) { if (estimate) return 1; _flow.target = target; _flow.n = 0; }
  const k = 1 + Math.min(STRENGTH.FLOW_MOST, _flow.n * STRENGTH.FLOW_STEP);
  if (!estimate) { _flow.n++; _flow.at = t; }
  return k;
}
/** Tests and the measure: the saber's flow forgotten. */
export function resetFlow() { _flow.target = null; _flow.n = 0; _flow.at = -Infinity; }

/** The family strengths over a player's whole blow (registered with the weapon's row): the hewer, the draw cut, the flow,
 *  the unaware blow, the finisher, the whip. `info.estimate` (the Stats page) reads the whip as its mean, the flow as it
 *  stands, and rolls and keeps nothing. */
export function familyBlow(weapon, damage, target, info) {
  let d = damage;
  if (inFamily('hewer', weapon) && unarmoured(target)) d *= STRENGTH.HEWER;
  if (inFamily('drawCut', weapon) && target && !target.isPlayer && healthOf(target) >= 1) d *= STRENGTH.DRAW_CUT;
  if (inFamily('flow', weapon) && target && !target.isPlayer) d *= flowBlow(target, !!info?.estimate);
  if (inFamily('short', weapon) && info?.unaware) d *= STRENGTH.UNAWARE;
  if (inFamily('axe', weapon) && target && healthOf(target) < STRENGTH.FINISHER_BELOW) d *= STRENGTH.FINISHER;
  if (inFamily('flail', weapon)) d *= info?.estimate ? 1 + STRENGTH.WHIP_CHANCE : (Math.random() < STRENGTH.WHIP_CHANCE ? 2 : 1);
  return d;
}

registerWeaponBlowMod('melee-rework', (weapon, damage, attacker, target, info) => {
  if (!MELEE_REWORK.on || !attacker?.isPlayer || !weapon) return damage;
  return familyBlow(weapon, damage * weaponPower(weapon), target, info);
});
// STEADY: the straight sword's roll, lifted to its floor (the roll's own seam - entityMods.js weaponDamageMods)
registerWeaponDamageMod('melee-steady', (weapon, roll, attacker) => {
  if (!MELEE_REWORK.on || !attacker?.isPlayer || !inFamily('straight', weapon)) return roll;
  const lo = itemMinDamage(weapon), hi = itemMaxDamage(weapon);
  return Math.max(roll, Math.floor(lo + (hi - lo) * STRENGTH.STEADY_FLOOR));
});
// PIERCE: blunt and the crossbow take back a share of what the struck foe's armour or hide took (combat/pcaao.js)
registerArmorPierce((attacker, _target, weapon) => {
  if (!MELEE_REWORK.on || !attacker?.isPlayer) return 0;
  return inFamily('breaker', weapon) ? STRENGTH.BREAKER : inFamily('pierce', weapon) ? STRENGTH.PIERCE : 0;
});
registerBlowTakenMod('shield-block', (_attacker, target, _weapon, info) => (info?.kind === 'spell' ? 1 : 1 - shieldBlockShare(target)));
registerSwingBurden((ctx) => {
  if (!MELEE_REWORK.on || !ctx?.entity?.isPlayer) return 1;
  if (ctx.weaponType === 15) return heldShield(ctx.entity) ? FISTS_SHIELD_SLOW : 1;   // 15: WeaponTypes.Melee, the bare hand
  const held = equipTableOf(ctx.entity)?.[ctx.usingRightHand === false ? EQUIP_SLOTS.LeftHand : EQUIP_SLOTS.RightHand];
  return inFamily('quick', held) ? STRENGTH.LIGHT_FLAIL_PACE : 1;   // the light flail's quicker swing
});
