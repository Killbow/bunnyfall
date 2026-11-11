// @ts-check
// CRAFTING REWORK, PHASE 1 (docs/CRAFTING.md): THE MATERIAL STATS. DRAFT DATA FOR REVIEW; NOTHING READS IT YET.
//
// Every material a craft can use has the same four visible stats, 0 to 10, so a player can read why one material
// differs from another:
//   h  Hardness   the edge or the plate: damage and armor value
//   t  Toughness  how long it lasts: condition
//   l  Lightness  higher is lighter: weight
//   a  Affinity   how well it holds magic: enchantment points
//
// BUDGET. A material's four stats add up to about 8 + 3 x its tier (a tier 1 material 11, a tier 6 one 26), so a higher
// tier is better overall and two materials of the same tier differ in WHAT they are good at (Dwarven is heavy and
// sturdy, Moonstone light and magical). Gems are the exception: only Affinity counts for a gem.
//
// Pure: no imports, no clock. The keys are the existing material keys (professionLaw.js), so old items and the Stores
// keep working.

/** The four stat ids, in the order the tables print them. */
export const STAT_IDS = Object.freeze(['h', 't', 'l', 'a']);
/** The most a stat can be. */
export const STAT_MAX = 10;

/**
 * @typedef {{ key: string, name: string, kind: 'ingot'|'plank'|'leather'|'cloth'|'metal'|'gem'|'wood', tier: number,
 *   h: number, t: number, l: number, a: number }} MaterialStats
 */

/** @returns {Readonly<MaterialStats>} */
const m = (key, name, kind, tier, h, t, l, a) => Object.freeze({ key, name, kind, tier, h, t, l, a });

/** @type {readonly Readonly<MaterialStats>[]} */
export const MATERIAL_STATS = Object.freeze([
  // INGOTS (smithing). The primary slot of a weapon, plate, shield or chain piece.
  m('ingot:iron', 'Iron', 'ingot', 1, 3, 4, 3, 1),
  m('ingot:steel', 'Steel', 'ingot', 2, 5, 5, 3, 1),
  m('ingot:silver', 'Silver', 'ingot', 3, 3, 3, 4, 7),
  m('ingot:moonstone', 'Moonstone (Elven)', 'ingot', 4, 4, 4, 7, 5),
  m('ingot:dwarven', 'Dwarven', 'ingot', 4, 7, 7, 2, 4),
  m('ingot:mithril', 'Mithril', 'ingot', 5, 6, 6, 7, 4),
  m('ingot:adamantium', 'Adamantium', 'ingot', 6, 9, 8, 3, 6),
  m('ingot:ebony', 'Ebony', 'ingot', 6, 10, 5, 4, 7),
  m('ingot:orichalcum', 'Orichalcum (Orcish)', 'ingot', 6, 8, 9, 4, 5),
  m('ingot:warforged', 'Warforged Steel', 'ingot', 6, 7, 10, 3, 6),
  m('ingot:daedric', 'Daedric', 'ingot', 7, 10, 8, 5, 6),

  // PLANKS (carpentry). Bows, staves, furniture.
  m('plank:pine', 'Pine', 'plank', 1, 2, 3, 5, 1),
  m('plank:oak', 'Oak', 'plank', 2, 4, 5, 3, 2),
  m('plank:cherry', 'Cherry', 'plank', 3, 4, 4, 5, 4),
  m('plank:teak', 'Teak', 'plank', 4, 5, 7, 3, 5),
  m('plank:mahogany', 'Mahogany', 'plank', 5, 6, 6, 5, 6),
  m('plank:ironwood', 'Ironwood', 'plank', 6, 9, 8, 4, 5),
  m('plank:ghostwood', 'Ghostwood', 'plank', 6, 5, 5, 8, 8),
  // Heartwood is a rare find from felling, used as a plank's better stand-in.
  m('wood:heartwood', 'Heartwood', 'wood', 4, 5, 6, 4, 5),

  // LEATHER (outfitting). Cured is the common one, Hardened the armorer's.
  m('leather:cured', 'Cured Leather', 'leather', 2, 3, 6, 4, 1),
  m('leather:hardened', 'Hardened Leather', 'leather', 5, 6, 9, 4, 4),

  // CLOTH (outfitting). Hardness here is only how well it turns a blow.
  m('cloth:linen', 'Linen', 'cloth', 1, 1, 3, 7, 0),
  m('cloth:wool', 'Wool', 'cloth', 2, 2, 4, 5, 3),
  m('cloth:silk', 'Silk', 'cloth', 4, 2, 4, 7, 7),
  m('cloth:standard', 'Standard Silk', 'cloth', 5, 3, 5, 8, 7),

  // JEWELRY METALS (smithing). Silver reads as the Silver Ingot above.
  m('metal:silver', 'Silver', 'metal', 3, 3, 3, 4, 7),
  m('metal:gold', 'Gold', 'metal', 4, 2, 5, 3, 10),
  m('metal:platinum', 'Platinum', 'metal', 5, 4, 6, 3, 10),

  // GEMS. Only Affinity counts: it is what a set gem adds to the piece's enchantment points. Graded gems (chipped to
  // flawless) follow their kind and add the grade; that ladder is not in this draft.
  m('gem:jade', 'Jade', 'gem', 2, 0, 0, 0, 3),
  m('gem:malachite', 'Malachite', 'gem', 3, 0, 0, 0, 4),
  m('gem:turquoise', 'Turquoise', 'gem', 3, 0, 0, 0, 4),
  m('gem:amber', 'Amber', 'gem', 4, 0, 0, 0, 5),
  m('gem:ruby', 'Ruby', 'gem', 5, 0, 0, 0, 6),
  m('gem:pearl', 'Pearl', 'gem', 5, 0, 0, 0, 6),
  m('gem:sapphire', 'Sapphire', 'gem', 6, 0, 0, 0, 7),
  m('gem:emerald', 'Emerald', 'gem', 6, 0, 0, 0, 8),
  m('gem:diamond', 'Diamond', 'gem', 6, 0, 0, 0, 9),
]);

/** @type {ReadonlyMap<string, Readonly<MaterialStats>>} */
const BY_KEY = new Map(MATERIAL_STATS.map((s) => [s.key, s]));

/** A material's stats by its key, or null for one the table does not hold (a flux, a herb, a food). */
export const statsOf = (key) => (typeof key === 'string' ? BY_KEY.get(key) ?? null : null);

/** What the budget says a material's four stats should add up to. */
export const statBudget = (tier) => 8 + 3 * tier;

/** The four stats added up. */
export const statTotal = (s) => s.h + s.t + s.l + s.a;

/**
 * A form's weights over the four stats (they add up to 1): how much each stat matters to what it makes.
 * @typedef {{ h: number, t: number, l: number, a: number }} StatWeights
 */

/** A material's score for a form: the weighted sum of its stats, 0 to 10. */
export const weightedScore = (/** @type {MaterialStats} */ s, /** @type {StatWeights} */ w) => s.h * w.h + s.t * w.t + s.l * w.l + s.a * w.a;

/**
 * How well a material suits a form compared with a material of the same total that is average at everything: 1 is
 * neutral, above 1 it is skewed toward what the form wants, below 1 away from it. This is the number Potential would be
 * read from; the thresholds that turn it into a quality name are the open question in docs/CRAFTING.md.
 */
export function fitOf(/** @type {MaterialStats} */ s, /** @type {StatWeights} */ w) {
  const mean = statTotal(s) / 4;
  return mean > 0 ? weightedScore(s, w) / mean : 0;
}
