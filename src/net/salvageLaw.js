// @ts-check
// BUNNYFALL CRAFTING REWORK, PHASE 1: SALVAGE ANYTHING.
// Every piece of found gear breaks into the materials of the recipe that makes it: about 40% of each input, rounded at
// random so the average holds. A worn piece gives less. Shared by the game (the preview) and the account service (the
// roll that counts). Crafted pieces (a `provenance`) keep their own door: the Enchanting Station's disenchant.
import { CARPENTRY_RECIPES } from './recipeLaw.js';
import { temperRecipeOf } from './temperLaw.js';
import { trackOf } from './professionLaw.js';

/** The share of a recipe's inputs a salvage gives back. Always under 1, so craft-then-salvage never profits. */
export const SALVAGE_SHARE = 0.4;
/** The XP a salvage pays its craft's track, per tier of the piece's recipe. */
export const SALVAGE_XP_PER_TIER = 3;
/** The most pieces one salvage request breaks. */
export const SALVAGE_BATCH_MAX = 40;

/** Group names as the save writes them. */
const WEAPONS = 'Weapons', ARMOR = 'Armor';
/** DFU's staff and bows (recipeLaw.js), their wood read off the item's material. */
const WOOD_TEMPLATES = Object.freeze([115, 129, 130]);

/**
 * The recipe a piece breaks back into, or null. A smith's weapon, plate, shield or chain, a tailor's leather or garment
 * (temperLaw.js temperRecipeOf), or a carpenter's staff or bow in its wood.
 * @param {{ templateIndex?: number, material?: number, group?: string, recipe?: string } | null | undefined} item
 */
export function salvageRecipeOf(item) {
  if (!item || typeof item.templateIndex !== 'number') return null;
  const r = temperRecipeOf(item);
  if (r) return r;
  if (item.group === WEAPONS && WOOD_TEMPLATES.includes(item.templateIndex)) {
    const m = item.material ?? 0;
    return CARPENTRY_RECIPES.find((c) => c.templateIndex === item.templateIndex && c.material === m) ?? null;
  }
  return null;
}

/** A piece as the service is told it: template, material, group and condition (0..1). */
export function salvageDescriptor(item) {
  const max = Number(item?.maxCondition) || 0, cur = Number(item?.currentCondition);
  const c = max > 0 && Number.isFinite(cur) ? Math.max(0, Math.min(1, cur / max)) : 1;
  return { t: item?.templateIndex, m: item?.material ?? 0, g: item?.group ?? '', c: Math.round(c * 100) / 100 };
}

/** A descriptor back as the item shape the recipe readers take. */
export const descriptorItem = (d) => ({ templateIndex: d?.t, material: d?.m, group: d?.g });

/** Whether a descriptor is well formed. */
export function descriptorOk(d) {
  return !!d && Number.isInteger(d.t) && d.t >= 0 && d.t < 4096 && Number.isInteger(d.m) && d.m >= 0 && d.m < 65536
    && typeof d.g === 'string' && d.g.length <= 32 && typeof d.c === 'number' && d.c >= 0 && d.c <= 1;
}

/** A worn piece gives less: half at broken, all at full condition. */
export const conditionShare = (c) => 0.5 + 0.5 * Math.max(0, Math.min(1, Number.isFinite(c) ? c : 1));

/**
 * The average yield of one piece, before the random rounding: `[{ key, n }]` with fractional n. Empty for a piece
 * that breaks into nothing.
 * @param {any} r a recipe @param {number} [c] the piece's condition, 0..1
 */
export function expectedYield(r, c = 1) {
  if (!r?.inputs) return [];
  const k = SALVAGE_SHARE * conditionShare(c);
  return r.inputs.map((i) => ({ key: i.key, n: i.n * k })).filter((y) => y.n > 0);
}

/** One random rounding: 1.2 is 1 four times in five and 2 once. */
export const roundAtRandom = (x, u) => Math.floor(x) + (u < x - Math.floor(x) ? 1 : 0);

/**
 * THE ROLL THAT COUNTS (the service's): every piece's yield, rounded at random, summed by material. `rand` answers 0..1.
 * @param {any[]} descriptors @param {() => number} rand
 * @returns {{ yields: { key: string, n: number }[], xp: Record<string, number>, broken: number }}
 */
export function rollSalvage(descriptors, rand) {
  const total = new Map();
  /** @type {Record<string, number>} */
  const xp = {};
  let broken = 0;
  for (const d of descriptors) {
    const r = salvageRecipeOf(descriptorItem(d));
    if (!r) continue;
    broken++;
    for (const y of expectedYield(r, d.c)) {
      const n = roundAtRandom(y.n, rand());
      if (n > 0) total.set(y.key, (total.get(y.key) ?? 0) + n);
    }
    const track = trackOf(r.profession);
    xp[track] = (xp[track] ?? 0) + SALVAGE_XP_PER_TIER * Math.max(1, r.tier ?? 1);
  }
  return { yields: [...total].map(([key, n]) => ({ key, n })), xp, broken };
}

/** The preview the pack shows: each material's average over the pieces, to one decimal. */
export function previewSalvage(items) {
  const total = new Map();
  for (const it of items) {
    const r = salvageRecipeOf(it);
    if (!r) continue;
    for (const y of expectedYield(r, salvageDescriptor(it).c)) total.set(y.key, (total.get(y.key) ?? 0) + y.n);
  }
  return [...total].map(([key, n]) => ({ key, n: Math.round(n * 10) / 10 }));
}

