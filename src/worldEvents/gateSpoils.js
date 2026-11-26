// @ts-check
// Template numbers start at 570, past DFU's 288, Climates & Calories' 530-541, and the Thunderlock's 560 and 561.
// `scenes/shared.js` imports this file so these rows are registered before a save that holds them loads.
import { seededRng } from '../weather/wind.js';
import { createRandomWeapon, createRandomArmor, createRandomGem, ITEM_GROUPS } from '../items/loot.js';
import { setItemFields, isAmmunition, mintCondition, registerCustomTemplates, templateByIndex } from '../items/itemTemplates.js';
import { applyRarity, rarityChances, lastPass, socketPass, weaponSocketPass, techniquePass } from '../items/lootRarity.js';
import { bossGems } from '../items/gems.js';
import { rollRegalia } from '../items/aetheric.js';
import { stacksWith, addItem } from '../items/inventory.js';
import { wearableItem } from '../characters/equip.js';
import { bossCardRoll } from '../cards/bossCards.js';
import { rollDragonfireOath } from '../items/gilded.js';

export const SPOILS_GOLD_PER_LEVEL = 250;
export const SPOILS_LEGENDARY = 0.1;
export const SPOILS_SOURCE = Object.freeze({ boss: true, tier: 21, luck: 50 });
export const SIGIL_STONE_TEMPLATE = 570;
export const SIGIL_STONE = Object.freeze({ name: 'Deadlands Ember', value: 5000 });

export const SIGIL_STONE_TEMPLATES = Object.freeze([{
  index: SIGIL_STONE_TEMPLATE,
  name: SIGIL_STONE.name,
  baseWeight: 0.25,
  hitPoints: 1000,
  basePrice: SIGIL_STONE.value,
  rarity: 20,
  worldTextureArchive: 254,
  worldTextureRecord: 0,
  stackable: true,
  bound: true,
}]);
registerCustomTemplates(SIGIL_STONE_TEMPLATES);
export const isSigilStone = (item) => item?.templateIndex === SIGIL_STONE_TEMPLATE;
export const WELKYND_SHARD_TEMPLATE = 571;
export const WELKYND_SHARD = Object.freeze({ name: 'Welkynd Shard', value: 250 });
export const WELKYND_SHARD_TEMPLATES = Object.freeze([{
  index: WELKYND_SHARD_TEMPLATE,
  name: WELKYND_SHARD.name,
  baseWeight: 0.1,
  hitPoints: 1000,
  basePrice: WELKYND_SHARD.value,
  rarity: 20,
  worldTextureArchive: 254,
  worldTextureRecord: 2,
  bound: true,
  stackable: true,
}]);
registerCustomTemplates(WELKYND_SHARD_TEMPLATES);
export const isWelkyndShard = (item) => item?.templateIndex === WELKYND_SHARD_TEMPLATE;
export function welkyndShards(n = 1) {
  return Object.assign(mintCondition(setItemFields({ group: 'Gems', templateIndex: WELKYND_SHARD_TEMPLATE })), { stackCount: Math.max(1, Math.trunc(Number(n) || 1)) });
}
// The group is `UselessItems2`, not `Gems`, because `getEquipSlot` gives every Gems item an equipment slot.
export const PORTAL_STONE_TEMPLATE = 572;
export const PORTAL_STONE_SHARDS = 5;
export const PORTAL_STONE = Object.freeze({ name: 'Portal Stone', value: PORTAL_STONE_SHARDS * WELKYND_SHARD.value });
export const PORTAL_STONE_TEMPLATES = Object.freeze([{
  index: PORTAL_STONE_TEMPLATE,
  name: PORTAL_STONE.name,
  baseWeight: 0.25,
  hitPoints: 1000,
  basePrice: PORTAL_STONE.value,
  rarity: 20,
  worldTextureArchive: 254,
  worldTextureRecord: 3,
  bound: true, stackable: true,
}]);
registerCustomTemplates(PORTAL_STONE_TEMPLATES);
export const isPortalStone = (item) => item?.templateIndex === PORTAL_STONE_TEMPLATE;
// Runs on every restore. `snapshotPlayer` always writes the `portalGift` mark, so new characters and characters
// already given the gift receive nothing.
export const PORTAL_GIFT = 1;
export const PORTAL_GIFT_STONES = 10;
let _giftNotice = 0;
export function givePortalGift(entity) {
  if (!entity || typeof entity !== 'object') return 0;
  if ((Number.isSafeInteger(entity.portalGift) ? entity.portalGift : 0) >= PORTAL_GIFT) return 0;
  entity.portalGift = PORTAL_GIFT;
  if (!Array.isArray(entity.items)) entity.items = [];
  addItem(entity.items, portalStones(PORTAL_GIFT_STONES));
  _giftNotice += PORTAL_GIFT_STONES;
  return PORTAL_GIFT_STONES;
}
export const takePortalGiftNotice = () => { const n = _giftNotice; _giftNotice = 0; return n; };
export function portalStones(n = 1) {
  const count = Math.max(1, Math.trunc(Number(n) || 1));
  return Object.assign(mintCondition(setItemFields({ group: 'UselessItems2', templateIndex: PORTAL_STONE_TEMPLATE })), { stackCount: count });
}

// Splices the list, so `save.js` calls it after the relinks that refer to items by index.
export function restackStones(list) {
  if (!Array.isArray(list)) return 0;
  let folded = 0;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (!isSigilStone(it)) continue;
    const into = list.findIndex((held, j) => j < i && isSigilStone(held) && stacksWith(held, it));
    if (into < 0) continue;
    list[into].stackCount = (list[into].stackCount ?? 1) + (it.stackCount ?? 1);
    list.splice(i, 1);
    i--;
    folded++;
  }
  return folded;
}

export function nameEmbers(list) {
  if (!Array.isArray(list)) return 0;
  let renamed = 0;
  for (const it of list) if (isSigilStone(it) && it.name !== SIGIL_STONE.name) { it.name = SIGIL_STONE.name; renamed++; }
  return renamed;
}

const pick = (list, rolls) => list[Math.floor(rolls() * list.length)];

export function spoilsBase(level, rolls) {
  let item = makeBase(level, rolls);
  for (let n = 0; n < 32 && (!templateByIndex(item?.templateIndex) || !wearableItem(item)); n++) item = makeBase(level, rolls);
  return mintCondition(item);
}
function makeBase(level, rolls) {
  const k = Math.floor(rolls() * 3);
  if (k === 0) {
    let w = createRandomWeapon(level, rolls);
    for (let n = 0; n < 32 && isAmmunition(w); n++) w = createRandomWeapon(level, rolls);
    return w;
  }
  if (k === 1) return createRandomArmor(level, rolls);
  return setItemFields({ group: 'Jewellery', templateIndex: pick(ITEM_GROUPS.Jewellery, rolls) });
}

/**
 * @param {() => number} rolls
 * @param {{ kind?: string, tier?: number, boss?: boolean, luck?: number }} [source]
 */
export function magicOrBetter(rolls, source = SPOILS_SOURCE) {
  const c = rarityChances(source);
  const r = rolls() * c.magic;
  return r < c.legendary ? 'legendary' : r < c.rare ? 'rare' : 'magic';
}

export function sigilStone() {
  return mintCondition(setItemFields({ group: 'Gems', templateIndex: SIGIL_STONE_TEMPLATE }));
}

/**
 * @param {number} seed
 * @param {number} level
 * @param {number} [p]
 */
export function rollSpoils(seed, level, p = 0) {
  const rolls = seededRng(seed >>> 0);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const gold = Math.round(SPOILS_GOLD_PER_LEVEL * lv * (0.8 + 0.4 * rolls()));
  const pieces = [];
  const first = rolls() < SPOILS_LEGENDARY ? 'legendary' : 'rare';
  pieces.push(graded(spoilsBase(lv, rolls), first, rolls));
  for (let i = 0; i < 2; i++) pieces.push(graded(spoilsBase(lv, rolls), magicOrBetter(rolls), rolls));
  // Every draw after the three graded pieces is appended in a fixed order, so a seed keeps producing the same
  // earlier spoils; add new draws only at the end.
  const regalia = rollRegalia(rolls);
  if (regalia) pieces.push({ item: regalia, tier: regalia.rarity });
  lastPass(pieces.map((p) => p.item), rolls);
  const card = bossCardRoll('gate', rolls);
  socketPass(pieces.map((p) => p.item), rolls);
  weaponSocketPass(pieces.map((p) => p.item), rolls);
  const gems = bossGems('gate', rolls);
  techniquePass(pieces.map((p) => p.item), rolls);
  const oath = rollDragonfireOath(rolls);
  if (oath) pieces.push({ item: oath, tier: oath.rarity });
  const more = [];
  for (const bit of SPOILS_PORTENT_BITS) if ((p & bit) !== 0) more.push(graded(spoilsBase(lv, rolls), magicOrBetter(rolls), rolls));
  if (more.length) {
    const items = more.map((q) => q.item);
    lastPass(items, rolls); socketPass(items, rolls); weaponSocketPass(items, rolls); techniquePass(items, rolls);
    for (const q of more) { q.tier = q.item.rarity ?? q.tier; pieces.push(q); }
  }
  return { gold, pieces, sigil: sigilStone(), card, gems, portent: more.length };
}

// Must match the bits of `GATE_PORTENTS` in `net/gateMods.js`; portent pieces are drawn in this order.
export const SPOILS_PORTENT_BITS = Object.freeze([1, 2, 4]);

export const TITHE_GOLD_PER_LEVEL = 60;
export function titheList(seed, level) {
  const rolls = seededRng(((seed >>> 0) ^ 0x7177e) >>> 0);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const gold = Math.round(TITHE_GOLD_PER_LEVEL * lv * (0.8 + 0.4 * rolls()));
  return [{ kind: 'gold', gold, tier: 'common' }, { kind: 'item', item: mintCondition(setItemFields(createRandomGem(rolls))), tier: 'common' }];
}

// `applyRarity` drops a Legendary to Rare when its kind has no Legendary record, so the tier is read back from the
// item.
function graded(item, tier, rolls) {
  applyRarity(item, tier, rolls);
  item.isIdentified = true;
  return { item, tier: item.rarity ?? tier };
}
