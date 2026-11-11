// @ts-check
// CRAFTING REWORK, PHASE 1 (docs/CRAFTING.md): THE MATERIAL STATS. DRAFT DATA FOR REVIEW; NOTHING READS IT YET.
//
// Every material a craft can use has the same four visible stats, 0 to 10, so a player can read why one material
// differs from another:
//   h  Hardness   the edge or the plate: damage and armor value
//   t  Toughness  how long it lasts: condition
//   l  Lightness  higher is lighter: weight
//   a  Arcanism   how readily it takes and holds magic: enchantment points
//
// BUDGET. A material's four stats add up to 8 + 3 x its tier (a tier 1 material 11, a tier 6 one 26), so a higher
// tier is better overall. STRONG SKEW: inside a tier the stats are spread hard (a 9 beside a 0), so two materials of the
// same tier are good at different things (Dwarven is heavy and tough, Moonstone light and magical) and choosing between
// them always matters. Gems are the exception: only Arcanism counts for a gem.
//
// SUITABILITY, NOT RAW POWER. A piece's base power already comes from its DFU material (its tier), so the stats are read
// as how well the material suits the form compared with the best that tier's budget could do for it (suitabilityOf).
// A perfect iron sword is as suitable as a perfect daedric one; it is not as strong, because DFU's iron is not.
//
// Pure: no imports, no clock. The keys are the existing material keys (professionLaw.js), so old items and the Stores
// keep working.

/** The four stat ids, in the order the tables print them. */
export const STAT_IDS = Object.freeze(['h', 't', 'l', 'a']);
/** The most a stat can be. */
export const STAT_MAX = 10;

/**
 * @typedef {{ key: string, name: string, kind: 'ingot'|'plank'|'leather'|'cloth'|'metal'|'gem'|'wood'|'flux'|'binder',
 *   tier: number, h: number, t: number, l: number, a: number }} MaterialStats
 */

/** @returns {Readonly<MaterialStats>} */
const m = (key, name, kind, tier, h, t, l, a) => Object.freeze({ key, name, kind, tier, h, t, l, a });

/** @type {readonly Readonly<MaterialStats>[]} */
export const MATERIAL_STATS = Object.freeze([
  // INGOTS (smithing). The primary slot of a weapon, plate, shield or chain piece.
  m('ingot:iron', 'Iron', 'ingot', 1, 3, 7, 1, 0),
  m('ingot:steel', 'Steel', 'ingot', 2, 7, 6, 1, 0),
  m('ingot:silver', 'Silver', 'ingot', 3, 2, 2, 5, 8),
  m('ingot:moonstone', 'Moonstone (Elven)', 'ingot', 4, 3, 2, 9, 6),
  m('ingot:dwarven', 'Dwarven', 'ingot', 4, 8, 9, 0, 3),
  m('ingot:mithril', 'Mithril', 'ingot', 5, 5, 6, 8, 4),
  m('ingot:adamantium', 'Adamantium', 'ingot', 6, 10, 9, 2, 5),
  m('ingot:ebony', 'Ebony', 'ingot', 6, 10, 3, 5, 8),
  m('ingot:orichalcum', 'Orichalcum (Orcish)', 'ingot', 6, 8, 10, 3, 5),
  m('ingot:warforged', 'Warforged Steel', 'ingot', 6, 6, 10, 6, 4),
  m('ingot:daedric', 'Daedric', 'ingot', 7, 10, 9, 4, 6),

  // PLANKS (carpentry). Bows, staves, furniture, and the hafts of axes, hammers and tools.
  m('plank:pine', 'Pine', 'plank', 1, 1, 2, 7, 1),
  m('plank:oak', 'Oak', 'plank', 2, 4, 7, 2, 1),
  m('plank:cherry', 'Cherry', 'plank', 3, 3, 3, 7, 4),
  m('plank:teak', 'Teak', 'plank', 4, 4, 10, 2, 4),
  m('plank:mahogany', 'Mahogany', 'plank', 5, 4, 6, 5, 8),
  m('plank:ironwood', 'Ironwood', 'plank', 6, 10, 10, 1, 5),
  m('plank:ghostwood', 'Ghostwood', 'plank', 6, 3, 4, 9, 10),
  // Heartwood is a rare find from felling, used as a plank's better stand-in.
  m('wood:heartwood', 'Heartwood', 'wood', 4, 6, 4, 2, 8),

  // LEATHER (outfitting). Cured is the common one, Hardened the armorer's.
  m('leather:cured', 'Cured Leather', 'leather', 2, 3, 8, 3, 0),
  m('leather:hardened', 'Hardened Leather', 'leather', 5, 8, 10, 2, 3),

  // CLOTH (outfitting). Hardness here is only how well it turns a blow.
  m('cloth:linen', 'Linen', 'cloth', 1, 0, 4, 7, 0),
  m('cloth:wool', 'Wool', 'cloth', 2, 1, 5, 4, 4),
  m('cloth:silk', 'Silk', 'cloth', 4, 0, 3, 9, 8),
  m('cloth:standard', 'Standard Silk', 'cloth', 5, 2, 4, 9, 8),

  // JEWELRY METALS (smithing). Silver reads as the Silver Ingot above.
  m('metal:silver', 'Silver', 'metal', 3, 2, 2, 5, 8),
  m('metal:gold', 'Gold', 'metal', 4, 1, 6, 3, 10),
  m('metal:platinum', 'Platinum', 'metal', 5, 3, 8, 2, 10),

  // FLUXES AND ALLOYS (smithing). The small additions to a weapon or armor piece: they tilt it, they do not carry it.
  m('metal:tin', 'Tin', 'flux', 1, 1, 3, 6, 1),
  m('metal:copper', 'Copper', 'flux', 1, 2, 3, 1, 5),
  m('metal:lead', 'Lead', 'flux', 1, 0, 7, 0, 4),
  m('metal:sulphur', 'Sulphur', 'flux', 1, 6, 0, 3, 2),
  m('metal:brass', 'Brass', 'flux', 2, 4, 5, 2, 3),
  m('metal:lodestone', 'Lodestone', 'flux', 2, 1, 2, 1, 10),
  m('metal:mercury', 'Mercury', 'flux', 2, 0, 1, 7, 6),

  // BINDERS (carpentry). What holds a bow together; leather and linen also serve (see forms.js GROUPS).
  m('wood:resin', 'Resin', 'binder', 1, 1, 4, 2, 4),

  // GEMS. Only Arcanism counts: it is what a set gem adds to the piece's enchantment points. Graded gems (chipped to
  // flawless) follow their kind and add the grade; that ladder is not in this draft, and gathered-material grades are
  // left out of the first version altogether.
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

/** A material's stats by its key, or null for one the table does not hold (a herb, a food, a stone). */
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
 * The best score a budget could buy for a form: the budget laid into the stats in order of weight, ten at most in each.
 * It is what a perfectly suited material of that tier would score.
 */
export function idealScore(/** @type {StatWeights} */ w, /** @type {number} */ budget) {
  let left = budget, score = 0;
  for (const wt of [w.h, w.t, w.l, w.a].sort((x, y) => y - x)) {
    const put = Math.min(STAT_MAX, left);
    score += put * wt;
    left -= put;
  }
  return score;
}

/**
 * HOW WELL A MATERIAL SUITS A FORM, 0 to 1: its score over the ideal score of its own tier. 1 is as suited as its tier
 * allows. This is the number Potential is read from; the bands that turn it into a quality name are POTENTIAL_BANDS in
 * forms.js.
 */
export function suitabilityOf(/** @type {MaterialStats} */ s, /** @type {StatWeights} */ w) {
  const ideal = idealScore(w, statBudget(s.tier));
  return ideal > 0 ? weightedScore(s, w) / ideal : 0;
}
