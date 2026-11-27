// @ts-check
// While the player's bout tag has kit set, no potion is drunk and no barred spell is cast. Barred effects already
// on the player are removed while the fight is live.
import { playerBoutOf } from '../characters/enemyTargets.js';
import { hasActiveEffect, cureAllOfKind } from '../magic/effects.js';
import { ARENA_TEXT } from './arenaText.js';
import { restartHeldEnchantments } from '../magic/enchantments.js';

// Invisibility, Levitate, Chameleon, Shadow, Pacify (every Calm), Charm, and Teleport (which includes Recall).
export const SAND_BARRED_EFFECTS = Object.freeze([13, 14, 23, 24, 33, 34, 43]);
export const SAND_BARRED_KINDS = Object.freeze(['invisNormal', 'invisTrue', 'levitate', 'chameleonNormal', 'chameleonTrue', 'shadeNormal', 'shadeTrue']);

// Above the highest legal jump (about 2.7 m) and below a Levitate's reach over a melee fighter.
export const SAND_CEILING_M = 4;
export const onTheSand = () => playerBoutOf()?.kit === true;
export const sandPotionRefusal = () => (onTheSand() ? ARENA_TEXT.refuse.potion : null);
export const sandSpellRefusal = (sp) => (onTheSand() && (Array.isArray(sp?.effects) ? sp.effects : []).some((e) => e && SAND_BARRED_EFFECTS.includes(e.type)) ? ARENA_TEXT.refuse.magic : null);
export function stripSandBarred(entity) {
  let n = 0;
  for (const k of SAND_BARRED_KINDS) {
    if (!hasActiveEffect(entity, k)) continue;
    // A held item's effect does not return by itself, so mark it for restoreSandHeld after the bout.
    if (entity.activeEffects.some((a) => a.kind === k && a.heldItem)) entity._sandHeld = true;
    cureAllOfKind(entity, k); n++;
  }
  return n;
}
export function restoreSandHeld(entity) {
  if (!entity?._sandHeld) return false;
  delete entity._sandHeld;
  restartHeldEnchantments(entity);
  return true;
}
