// @ts-check
import { registerCustomTemplates, setItemFields, mintCondition, registerItemUseHandler } from '../../items/itemTemplates.js';
import { addItem, removeOne } from '../../items/inventory.js';
import { registerEnemyLootExtra } from '../../items/loot.js';
import { addVendorTextures } from '../../render/textureReplacement.js';
import { SKILLS } from '../../characters/skills.js';
import { t } from '../../ui/textManager.js';
import { ENEMY_BASICS } from '../../characters/enemyBasics.js';
import { MOBILE_TYPES } from '../../characters/mobileTypes.js';
import { LOCKPICK_ART, registerLockpickArt } from './lockpickArt.js';
import { LOCKPICK_TEMPLATE, LOCKPICK_LAW_ROW } from './lockpickRow.js';

export { LOCKPICK_TEMPLATE };
export const LOCKPICK_ROW = Object.freeze({
  ...LOCKPICK_LAW_ROW, name: 'Lockpick', capacityOrTarget: 0, enchantmentPoints: 0, variants: 0, drawOrderOrEffect: 0,
  isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false,
  worldTextureArchive: LOCKPICK_ART.archive, worldTextureRecord: LOCKPICK_ART.record, playerTextureArchive: 0, playerTextureRecord: 0,
});
registerCustomTemplates([LOCKPICK_ROW]);
registerLockpickArt(addVendorTextures);

export const ENDLESS_LOCKPICK_STACK = 25;
export const LOCKPICK_KIT = 5;
export const LOCKPICK_GIFT = 1;
export const ROGUE_LOCKPICKS = Object.freeze([
  Object.freeze([MOBILE_TYPES.Burglar, 0.6, 3]), Object.freeze([MOBILE_TYPES.Thief, 0.6, 3]),
  Object.freeze([MOBILE_TYPES.Rogue, 0.3, 2]), Object.freeze([MOBILE_TYPES.Nightblade, 0.25, 2]),
  Object.freeze([MOBILE_TYPES.Acrobat, 0.25, 2]), Object.freeze([MOBILE_TYPES.Assassin, 0.25, 2]),
  Object.freeze([MOBILE_TYPES.Bard, 0.15, 1]),
]);

export const isLockpick = (/** @type {any} */ item) => item?.templateIndex === LOCKPICK_TEMPLATE && item?.group === 'UselessItems2';
export function lockpicks(n = 1) {
  return Object.assign(mintCondition(setItemFields({ group: 'UselessItems2', templateIndex: LOCKPICK_TEMPLATE })), { stackCount: Math.max(1, Math.trunc(Number(n) || 1)) });
}
export const lockpickCount = (/** @type {any} */ items) => (Array.isArray(items)
  ? items.reduce((n, it) => n + (isLockpick(it) ? Math.max(1, Math.trunc(Number(it.stackCount) || 1)) : 0), 0) : 0);
export const spendLockpick = (/** @type {any} */ entity) => (Array.isArray(entity?.items) ? removeOne(entity.items, LOCKPICK_TEMPLATE, { group: 'UselessItems2' }) : false);

export function ensureEndlessLockpicks(/** @type {any[]} */ items) {
  if (!Array.isArray(items)) return items;
  const stack = items.find(isLockpick);
  if (!stack) items.push(lockpicks(ENDLESS_LOCKPICK_STACK));
  else if ((stack.stackCount ?? 1) < ENDLESS_LOCKPICK_STACK) stack.stackCount = ENDLESS_LOCKPICK_STACK;
  return items;
}

export function restockLockpicks(/** @type {any[]} */ items, /** @type {number} */ took) {
  if (!Array.isArray(items) || !(took > 0)) return 0;
  const stack = items.find(isLockpick);
  if (!stack) { items.push(lockpicks(Math.min(ENDLESS_LOCKPICK_STACK, took))); return 1; }
  const was = stack.stackCount ?? 1;
  if (was >= ENDLESS_LOCKPICK_STACK) return 0;
  stack.stackCount = Math.min(ENDLESS_LOCKPICK_STACK, was + took);
  return 1;
}

export function careerPicksLocks(/** @type {any} */ entity) {
  const c = entity?.career;
  return !!c && [c.primarySkills, c.majorSkills, c.minorSkills].some((list) => Array.isArray(list) && list.includes(SKILLS.Lockpicking));
}
export function giveStartingLockpicks(/** @type {any} */ entity) {
  if (!careerPicksLocks(entity)) return null;
  if (!Array.isArray(entity.items)) entity.items = [];
  const stack = lockpicks(LOCKPICK_KIT);
  addItem(entity.items, stack);
  return stack;
}
export function giveLockpickGift(/** @type {any} */ entity) {
  if (!entity || typeof entity !== 'object') return 0;
  if ((Number.isSafeInteger(entity.lockpickGift) ? entity.lockpickGift : 0) >= LOCKPICK_GIFT) return 0;
  entity.lockpickGift = LOCKPICK_GIFT;
  return giveStartingLockpicks(entity) ? LOCKPICK_KIT : 0;
}

// Rows are matched by object identity because they carry no id, so a mod must edit an `ENEMY_BASICS` row in place
// for its rogue entry to apply.
const _rogueRows = new Map(ROGUE_LOCKPICKS.map(([type, chance, most]) => [ENEMY_BASICS[type], { chance, most }]));
export function rogueLockpicks(/** @type {any[]} */ items, /** @type {any} */ basics, rolls = Math.random) {
  const r = _rogueRows.get(basics);
  if (!r || !Array.isArray(items) || !(rolls() < r.chance)) return 0;
  const n = 1 + Math.min(r.most - 1, Math.floor(rolls() * r.most));
  addItem(items, lockpicks(n));
  return n;
}
registerEnemyLootExtra('lockpick', ({ items, basics, rolls }) => { rogueLockpicks(items, basics, rolls); });

export const LOCKPICK_TEXT = Object.freeze({
  card: () => [
    t('lockpick.item.what', 'A thin steel pick and a tension wrench, for locks that are not yours.'),
    t('lockpick.item.use', 'In Steal mode, activate a locked door, chest, or crate to pick it. A pick can snap.'),
  ],
  use: () => t('lockpick.item.useLine', 'Switch to Steal mode and activate a locked door, chest, or crate to pick its lock.'),
});
registerItemUseHandler(LOCKPICK_TEMPLATE, () => ({ kind: 'text', text: LOCKPICK_TEXT.use() }));
