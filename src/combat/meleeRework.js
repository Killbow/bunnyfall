// @ts-check
// Melee rework tuning: every player weapon, shield, and family number lives in this file.
// Weapon rows multiply the player's blow after the strength and material modifiers, and they never go below 1.
import { registerWeaponBlowMod } from '../characters/entityMods.js';
import { registerBlowTakenMod } from './blowTaken.js';
import { registerSwingBurden } from '../characters/weaponStates.js';
import { equipTableOf, EQUIP_SLOTS } from '../characters/equip.js';
import { isShieldTemplate } from '../items/armorMaterials.js';
import { registerWeaponDamageMod } from '../characters/entityMods.js';
import { registerArmorPierce } from './armorPierce.js';
import { weaponMinDamage, weaponMaxDamage, itemMinDamage, itemMaxDamage } from '../characters/weapons.js';
import { CROSSBOW_TEMPLATE } from '../characters/crossbowIds.js';
import { BALLISTA_TEMPLATE } from '../characters/heavyGearIds.js';

export const MELEE_REWORK = { on: true };

// Template index to [blow multiplier, measured share of a longsword's damage before the rework].
export const WEAPON_POWER = Object.freeze({
  // One-handed long blades: 118 Broadsword, 119 Saber, 120 Longsword, and 121 Katana.
  118: [1.00, 0.94],
  119: [1.10, 0.95],
  120: [1.00, 1.00],
  121: [1.01, 1.03],
  // Short blades: 113 Dagger, 114 Tanto, 116 Shortsword, and 117 Wakizashi.
  113: [1.33, 0.71],
  114: [1.34, 0.75],
  116: [1.20, 0.83],
  117: [1.14, 0.88],
  // One-handed blunt and axes: 124 Mace, 127 Battle Axe, 513 Archer's Axe, and 514 Light Flail.
  124: [1.23, 0.91],
  127: [1.09, 0.90],
  513: [1.23, 0.76],
  514: [1.15, 0.80],
  // Two-handers: 122 Claymore, 123 Dai-katana, 125 Flail, 126 Warhammer, 128 War Axe, and 115 Staff.
  122: [1.10, 1.14],
  123: [1.12, 1.17],
  125: [1.03, 1.11],
  126: [1.18, 1.15],
  128: [1.05, 1.14],
  115: [1.31, 0.96],
  // Bows: 129 Short Bow and 130 Long Bow.
  129: [1.42, 0.63],
  130: [1.34, 0.67],
  [CROSSBOW_TEMPLATE]: [1.60, 0.53],
  [BALLISTA_TEMPLATE]: [1.40, 0.36],
});

export const FAMILY = Object.freeze({
  straight: Object.freeze([120, 122]),
  hewer: Object.freeze([118]),
  drawCut: Object.freeze([121, 123]),
  flow: Object.freeze([119]),
  short: Object.freeze([113, 114, 116, 117]),
  axe: Object.freeze([127, 128, 513]),
  pierce: Object.freeze([125, 126, 514, CROSSBOW_TEMPLATE, BALLISTA_TEMPLATE]),
  breaker: Object.freeze([124]),
  flail: Object.freeze([125]),
  quick: Object.freeze([514]),
  staff: Object.freeze([115]),
});
const inFamily = (fam, weapon) => !!weapon && FAMILY[fam].includes(weapon.templateIndex);
export const STRENGTH = Object.freeze({
  STEADY_FLOOR: 1 / 3,
  HEWER: 1.15,
  DRAW_CUT: 1.5,
  FLOW_STEP: 0.05,
  FLOW_MOST: 0.25,
  FLOW_SECONDS: 3,
  UNAWARE: 1.5,
  FINISHER_BELOW: 0.5,
  FINISHER: 1.25,
  PIERCE: 1 / 3,
  BREAKER: 1 / 2,
  WHIP_CHANCE: 1 / 7,
  LIGHT_FLAIL_PACE: 0.87,
  STAFF_GUARD: 10,
});
export const TWO_HANDED_CLEAVE = Object.freeze({ count: 2, metres: 3, share: 50 });
export const CLAYMORE_CLEAVE = Object.freeze({ count: 3, metres: 3, share: 60 });
export const cleaveOf = (weapon) => (weapon?.templateIndex === 122 ? CLAYMORE_CLEAVE : TWO_HANDED_CLEAVE);

// Percent blocked by shield template: 109 Buckler, 110 Round, 111 Kite, and 112 Tower.
export const SHIELD_BLOCK = Object.freeze({ 109: 5, 110: 8, 111: 12, 112: 18 });

export const FISTS_SHIELD_SLOW = 1.15;

export const weaponPower = (weapon) => (MELEE_REWORK.on && weapon ? (WEAPON_POWER[weapon.templateIndex]?.[0] ?? 1) : 1);

function heldShield(entity) {
  const it = entity ? equipTableOf(entity)?.[EQUIP_SLOTS.LeftHand] : null;
  return it && isShieldTemplate(it.templateIndex) && !(it.currentCondition <= 0) ? it : null;
}

export function shieldBlockShare(entity) {
  if (!MELEE_REWORK.on || !entity?.isPlayer) return 0;
  const s = heldShield(entity);
  if (s) return (SHIELD_BLOCK[s.templateIndex] ?? 0) / 100;
  const r = equipTableOf(entity)?.[EQUIP_SLOTS.RightHand];
  return inFamily('staff', r) && !(r.currentCondition <= 0) ? STRENGTH.STAFF_GUARD / 100 : 0;
}

const healthOf = (e) => (e && e.maxHealth > 0 ? Math.max(0, e.health ?? e.maxHealth) / e.maxHealth : 1);

function unarmoured(e) {
  if (!e || e.isPlayer) return false;
  const slots = equipTableOf(e) ?? [];
  for (const it of slots) if (it && it.group === 'Armor') return false;
  return true;
}
const _flow = { target: null, n: 0, at: -Infinity };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
function flowBlow(target, estimate) {
  const t = now();
  if (_flow.target !== target || t - _flow.at > STRENGTH.FLOW_SECONDS) { if (estimate) return 1; _flow.target = target; _flow.n = 0; }
  const k = 1 + Math.min(STRENGTH.FLOW_MOST, _flow.n * STRENGTH.FLOW_STEP);
  if (!estimate) { _flow.n++; _flow.at = t; }
  return k;
}
export function resetFlow() { _flow.target = null; _flow.n = 0; _flow.at = -Infinity; }

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
registerWeaponDamageMod('melee-steady', (weapon, roll, attacker) => {
  if (!MELEE_REWORK.on || !attacker?.isPlayer || !inFamily('straight', weapon)) return roll;
  const lo = itemMinDamage(weapon), hi = itemMaxDamage(weapon);
  return Math.max(roll, Math.floor(lo + (hi - lo) * STRENGTH.STEADY_FLOOR));
});
registerArmorPierce((attacker, _target, weapon) => {
  if (!MELEE_REWORK.on || !attacker?.isPlayer) return 0;
  return inFamily('breaker', weapon) ? STRENGTH.BREAKER : inFamily('pierce', weapon) ? STRENGTH.PIERCE : 0;
});
registerBlowTakenMod('shield-block', (_attacker, target, _weapon, info) => (info?.kind === 'spell' ? 1 : 1 - shieldBlockShare(target)));
registerSwingBurden((ctx) => {
  if (!MELEE_REWORK.on || !ctx?.entity?.isPlayer) return 1;
  // Weapon type 15 is the bare hand.
  if (ctx.weaponType === 15) return heldShield(ctx.entity) ? FISTS_SHIELD_SLOW : 1;
  const held = equipTableOf(ctx.entity)?.[ctx.usingRightHand === false ? EQUIP_SLOTS.LeftHand : EQUIP_SLOTS.RightHand];
  return inFamily('quick', held) ? STRENGTH.LIGHT_FLAIL_PACE : 1;
});
