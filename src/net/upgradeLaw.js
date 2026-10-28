// @ts-check
// BUNNYFALL CRAFTING REWORK, PHASE 2: THE MATERIAL UPGRADE.
// A found metal weapon, plate piece or shield moves one metal up Daggerfall's own ladder (Iron, Steel, Silver, Elven,
// Dwarven, Mithril, Adamantium, Ebony, Orcish, Daedric), keeping its magic lines, sockets, quality and wear. It costs
// 80% of the new metal's recipe (its main input) from the Stores and gold at the station, and asks the new recipe's rank.
// Shared by the game and the account service.
import { RECIPES, recipeById, ARMOR_PLATE, craftXp } from './recipeLaw.js';
import { temperRecipeOf, TEMPER_SHUT } from './temperLaw.js';

/** The kinds a material upgrade takes: the smith's metal pieces. Chain is Steel's alone, leather and cloth have no metal. */
export const UPGRADE_KINDS = Object.freeze(['weapon', 'plate', 'shield']);
/** The share of the new metal's recipe (its main input) an upgrade takes. */
export const UPGRADE_SHARE = 0.8;
/** The gold an upgrade costs at the station, per tier of the new metal. */
export const UPGRADE_GOLD_PER_TIER = 200;
/** Daggerfall's last metal. */
export const DAEDRIC = 9;

/** The metal index of a recipe's piece (a weapon's material, plate's and shields' past ARMOR_PLATE). */
const metalOf = (r) => (r.kind === 'weapon' ? r.material : r.material - ARMOR_PLATE);

/**
 * The recipe a piece upgrades INTO, or null: the same pattern, one metal up.
 * @param {any} item
 */
export function upgradeRecipeOf(item) {
  const r = temperRecipeOf(item);
  if (!r || !UPGRADE_KINDS.includes(r.kind) || r.metal === 'ingot:warforged') return null;
  const next = metalOf(r) + 1;
  if (next > DAEDRIC) return null;
  const want = r.kind === 'weapon' ? next : ARMOR_PLATE + next;
  return RECIPES.find((x) => x.kind === r.kind && x.templateIndex === r.templateIndex && x.material === want && x.metal !== 'ingot:warforged') ?? null;
}

/**
 * Why a piece may not be upgraded, or null: 'not' (no metal ladder takes it), 'made' (a crafted piece - its record names
 * its metal), 'top' (Daedric), 'rarity' (Legendary and above), 'sigil'.
 * @param {any} item
 */
export function upgradeRefusal(item) {
  const r = temperRecipeOf(item);
  if (!r || !UPGRADE_KINDS.includes(r.kind)) return 'not';
  if (typeof item.provenance === 'string') return 'made';
  if (item.sigil != null) return 'sigil';
  if (TEMPER_SHUT.includes(item.rarity) || item.artifact) return 'rarity';
  if (!upgradeRecipeOf(item)) return 'top';
  return null;
}

/** What an upgrade into recipe `next` spends from the Stores. @param {any} next */
export const metalUpgradeCost = (next) => ({ key: next.inputs[0].key, n: Math.max(1, Math.ceil(next.inputs[0].n * UPGRADE_SHARE)) });
/** The gold an upgrade into recipe `next` costs. @param {any} next */
export const upgradeGold = (next) => UPGRADE_GOLD_PER_TIER * Math.max(1, next?.tier ?? 1);
/** The XP an upgrade pays: the craft's, at the new metal's tier. @param {any} next @param {number} rank */
export const upgradeXp = (next, rank) => craftXp(next.tier, rank);
/** Whether a recipe id is one an upgrade may make (the service's door). */
export function upgradeTarget(id) {
  const r = recipeById(id);
  return !!r && UPGRADE_KINDS.includes(r.kind) && r.metal !== 'ingot:warforged' && metalOf(r) > 0 ? r : null;
}
