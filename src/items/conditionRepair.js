// @ts-check

import { mintCondition, ITEM_TEMPLATES, templateByIndex } from './itemTemplates.js';
import { scaleFoundMark, markFound } from './foundMark.js';
import { ARROW_TEMPLATE } from './inventory.js';
import { WEAPONS, WEAPON_MATERIALS, conditionMultipliersByMaterial } from '../characters/weapons.js';
import { RRI_TEMPLATE_PATCHES } from '../mods/rriItems.js';
import { QUALITY_EFFECTS } from '../net/recipeLaw.js';

export const WEARABLE_GROUPS = Object.freeze(['Weapons', 'Armor', 'MensClothing', 'WomensClothing', 'Jewellery']);
const WEARABLE = new Set(WEARABLE_GROUPS);

export const isQuestionsDagger = (item) => item?.group === 'Weapons' && item.templateIndex === WEAPONS.Dagger && (item.material ?? 0) > WEAPON_MATERIALS.Steel;
export const QUESTIONS_DAGGER_WEAR = 0.2;

// Load-time repair: every mint writes maxCondition, so a wearable without one was built by hand and is minted here.
// Idempotent, since a minted item is never touched again.
/**
 * @param {any[]} items
 * @returns {number}
 */
export function repairUnmintedConditions(items) {
  let n = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object' || it.maxCondition != null || !WEARABLE.has(it.group) || !Object.isExtensible(it)) continue;
    const had = it.currentCondition;
    mintCondition(it);
    if (it.group === 'Weapons' && it.templateIndex === ARROW_TEMPLATE) it.currentCondition = 0;
    else if (had === 0 && isQuestionsDagger(it)) it.currentCondition = Math.trunc(it.maxCondition * QUESTIONS_DAGGER_WEAR);
    if (had === 0 && isQuestionsDagger(it)) markFound(it);
    n++;
  }
  return n;
}

const RRI_ROW_POOLS = new Map(RRI_TEMPLATE_PATCHES.map((/** @type {any} */ p) => [p.index, p.hitPoints]));

/**
 * @param {number} templateIndex
 * @returns {number[]}
 */
const rowPools = (templateIndex) => [ITEM_TEMPLATES[templateIndex]?.hitPoints, templateByIndex(templateIndex)?.hitPoints, RRI_ROW_POOLS.get(templateIndex)]
  .filter((hp) => typeof hp === 'number');

/**
 * @param {number} pool
 * @param {any} it
 * @returns {number}
 */
function mintedOn(pool, it) {
  const max = Math.trunc((pool * (conditionMultipliersByMaterial[it.material] ?? 4)) / 4);
  const made = QUALITY_EFFECTS[it.quality]?.condition;
  return made == null ? max : Math.round(max * made);
}

// Moves a weapon minted on its template row's old condition pool to the shared pool, keeping its condition share.
// Load runs it, and lowerCondition runs it before wear, so pieces from stores the load does not walk move too.
/**
 * @param {any} it
 * @returns {boolean}
 */
export function repoolWeapon(it) {
  // A magic item's condition is its uses, and a piece at a smith keeps its booked job, so neither moves.
  if (!it || it.group !== 'Weapons' || it.magic || it.artifact || it.repairData != null || !Object.isExtensible(it)
    || !Number.isFinite(it.currentCondition)) return false;
  const max = it.maxCondition;
  const pool = mintedOn(mintCondition({ group: 'Weapons', templateIndex: it.templateIndex }).maxCondition, it);
  if (pool === max || !rowPools(it.templateIndex).some((hp) => mintedOn(hp, it) === max)) return false;
  const share = (/** @type {number} */ n) => Math.round((n * pool) / max);
  it.currentCondition = share(it.currentCondition);
  scaleFoundMark(it, max, pool);
  it.maxCondition = pool;
  return true;
}

/**
 * @param {any[]} items
 * @returns {number}
 */
export function repoolWeaponConditions(items) {
  let n = 0;
  for (const it of Array.isArray(items) ? items : []) if (repoolWeapon(it)) n++;
  return n;
}
