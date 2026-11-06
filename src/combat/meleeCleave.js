// @ts-check
// BUNNYFALL (2026-11-06, the melee rework - combat/meleeRework.js): A TWO-HANDER'S SWING CLEAVES. A melee blow of mine with
// a two-handed weapon that LANDED (formulas.js registerPlayerStrikeListener: the final damage, after the armour) carries
// on into up to cleaveOf(weapon).count more foes near the one struck, each taking its share of it - by
// Ruhn's Cleave's own rules (systems/sigil/sigilSetPowers.js cleaveNear: never an ally or a foe at peace, never through a
// wall, never one the weapon's metal cannot bite). A bow is two-handed and never cleaves. Imported by the sigil sets'
// module (which the play hosts load), so it needs no host of its own; it loads the rework's other registrations too.
import { registerPlayerStrikeListener } from './formulas.js';
import { getItemHands, ITEM_HANDS } from '../characters/equipTable.js';
import { weaponSkillUsed } from '../characters/weapons.js';
import { SKILLS } from '../systems/skills.js';
import { cleaveNear } from '../systems/sigil/sigilSetPowers.js';
import { MELEE_REWORK, cleaveOf } from './meleeRework.js';   // and the whole rework registers through this import (never from formulas.js: entityMods.js is mid-load there)

/** Does `weapon` cleave: a two-handed melee weapon (never a bow). */
export function cleaves(weapon) {
  if (!MELEE_REWORK.on || !weapon || !Number.isInteger(weapon.templateIndex)) return false;
  if (weaponSkillUsed(weapon.templateIndex) === SKILLS.Archery) return false;
  try { return getItemHands(weapon) === ITEM_HANDS.Both; } catch { return false; }
}

registerPlayerStrikeListener('melee-cleave', (attacker, target, damage, weapon) => {
  if (!(damage > 0) || !cleaves(weapon) || target?.warded || target?.isPlayer) return;
  const c = cleaveOf(weapon);   // the claymore's reaches further (meleeRework.js CLAYMORE_CLEAVE)
  cleaveNear(target, (damage * c.share) / 100, weapon, { count: c.count, metres: c.metres });
});
