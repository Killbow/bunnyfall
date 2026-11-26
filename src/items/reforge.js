// @ts-check
// Salvage, reforge, hone, imbue, and gem sockets for rarity-ladder loot.
// With the loot rarity row off, nothing salvages and nothing is reforged.

import { lootRarityOn, reforgeableLines, reforgeAffix, honeableLines, honeAffix, affixBand } from './lootRarity.js';
import { rarityEligible, AFFIX_KINDS, AFFIX_IDS, AFFIX_COUNTS, AFFIX_RANGES, RARE_FLAVOURS, kindParams, affixesWorth, rareEnchantWorth, isCursed, linesName, rarityName } from './lootRarity.js';
import { itemLawFindings } from './loot.js';
import { sigilFloor } from './sigil.js';
import { itemBaseValue } from './itemTemplates.js';
import { rarityOf } from './lootRarity.js';
import { ALL_GEM_IDS, SOCKET_EMPTY, gemKindOf, gemGrade, hasSocket, socketsOf, socketGem, socketGems, setGem, unsetGem, gemWorthOf } from './lootRarity.js';
import { PATRON_COUNTER_MARK, COUNTER_PAID_MARK, COUNTER_VALUE_MARK } from '../net/patronLaw.js';
import { makerMark, makerName } from '../net/recipeLaw.js';
import { mintGem } from './gems.js';
import { welkyndShards, isWelkyndShard, WELKYND_SHARD } from '../worldEvents/gateSpoils.js';
import { isBound } from './itemBound.js';
import { isLocked } from './itemLock.js';
import { isEquipped, notifyEquipChange } from '../characters/equip.js';
import { addItem, isEnchanted, isSummoned } from './inventory.js';
import { totalGoldAmount, deductGold } from '../justice/court.js';
import { itemIsIdentified } from '../trade/tradeModes.js';
import { noteAct } from '../systems/questlines/qlActs.js';

export const SALVAGE_SHARDS = Object.freeze({ magic: 1, rare: 3, legendary: 8, exalted: 15 });
export function salvageShards(item, selfName = null) {
  const t = item?.rarity;
  if (t === 'legendary') return item.exalted === true ? SALVAGE_SHARDS.exalted : SALVAGE_SHARDS.legendary;
  if (t === 'magic' || t === 'rare') return SALVAGE_SHARDS[t];
  return 0;
}
export function isSelfMade(item, selfName) {
  if (!item || typeof item.provenance !== 'string' || !selfName) return false;
  const maker = typeof item.maker === 'string' && item.maker ? item.maker : null;
  return !!maker && makerMark(maker) === makerName(selfName);
}
export function salvageRefusal(item, selfName = null) {
  if (!lootRarityOn()) return 'off';
  if (!item) return 'not';
  if (item.rarity === 'aetheric') return 'aetheric';
  if (item.rarity === 'gilded') return 'gilded';
  if (item.artifact || item.rarity === 'artifact') return 'artifact';
  if (item.questItem) return 'quest';
  if (socketGems(item).length) return 'gems';
  const made = typeof item.provenance === 'string';
  if (made && isSelfMade(item, selfName)) return 'self';
  // Shards come first: rarityOf reports a found Magic piece as magic too, so only shardless pieces are classic.
  if (salvageShards(item, selfName) <= 0) return !made && rarityOf(item) === 'magic' ? 'classic' : 'not';
  if (isBound(item)) return 'bound';
  if (isEquipped(item)) return 'worn';
  if (isLocked(item)) return 'locked';
  return null;
}
export function salvagePiece(item, { items }, selfName = null) {
  if (!Array.isArray(items) || !items.includes(item)) return { ok: false, reason: 'gone' };
  const why = salvageRefusal(item, selfName);
  if (why) return { ok: false, reason: why };
  const shards = salvageShards(item, selfName);
  items.splice(items.indexOf(item), 1);
  addItem(items, welkyndShards(shards));
  return { ok: true, shards };
}
export function salvageMany(pieces, { items }, selfName = null) {
  let count = 0, shards = 0;
  const refused = [];
  for (const it of new Set(Array.isArray(pieces) ? pieces : [])) {
    const r = salvagePiece(it, { items }, selfName);
    if (r.ok) { count++; shards += r.shards; } else refused.push({ item: it, reason: r.reason });
  }
  return { count, shards, refused };
}
export const salvageable = (items, selfName = null) => (Array.isArray(items) ? items : []).filter((it) => !salvageRefusal(it, selfName));

// A worn shard is never spent, or the equip table would keep a record the pack no longer holds.
const spendable = (it) => isWelkyndShard(it) && !isLocked(it) && !isEquipped(it);
export const shardsHeld = (items) => (Array.isArray(items) ? items : []).reduce((n, it) => n + (spendable(it) ? (it.stackCount ?? 1) : 0), 0);
export function spendShards(items, n) {
  if (!(n > 0)) return true;
  if (shardsHeld(items) < n) return false;
  let owed = n;
  for (let i = items.length - 1; i >= 0 && owed > 0; i--) {
    const it = items[i];
    if (!spendable(it)) continue;
    const have = it.stackCount ?? 1;
    if (have <= owed) { items.splice(i, 1); owed -= have; } else { it.stackCount = have - owed; owed = 0; }
  }
  return true;
}
export const shardsText = (n) => `${n} ${WELKYND_SHARD.name}${n === 1 ? '' : 's'}`;

export const REFORGE_PRICE = Object.freeze({
  magic: Object.freeze({ shards: 12, gold: 3000 }),
  rare: Object.freeze({ shards: 25, gold: 10000 }),
  exalted: Object.freeze({ shards: 50, gold: 30000 }),
});
export function reforgePrice(item) {
  return item?.rarity === 'magic' || item?.rarity === 'rare' ? REFORGE_PRICE[item.rarity]
    : item?.rarity === 'legendary' && item.exalted === true ? REFORGE_PRICE.exalted : null;
}

export function reforgeRefusal(item, index, player) {
  if (!lootRarityOn()) return 'off';
  const price = reforgePrice(item);
  const lines = reforgeableLines(item);
  if (!price || !lines.length) return 'not';
  if (!itemIsIdentified(item)) return 'unknown';
  if (isEquipped(item)) return 'worn';
  if (!lines.includes(index)) return 'line';
  if (shardsHeld(player?.items) < price.shards) return 'shards';
  if (totalGoldAmount(player) < price.gold) return 'gold';
  return null;
}
const HONE_PRICE_PER_POINT = Object.freeze({
  magic: { shards: 2, gold: 300 },
  rare: { shards: 3, gold: 800 },
  exalted: { shards: 5, gold: 2000 },
});

export function honePrice(item, index) {
  if (!honeableLines(item).includes(index)) return null;
  const unit = HONE_PRICE_PER_POINT[item.exalted ? 'exalted' : item.rarity];
  const gain = affixBand(item, index)[1] - item.affixes[index].value;
  return { shards: unit.shards * gain, gold: unit.gold * gain };
}
export function honeRefusal(item, index, player) {
  if (!lootRarityOn()) return 'off';
  if (!reforgePrice(item)) return 'not';
  const known = itemIsIdentified(item);
  if (!known) return 'unknown';
  if (isEquipped(item)) return 'worn';
  if (!honeableLines(item).includes(index)) return affixBand(item, index) ? 'top' : 'line';
  const price = honePrice(item, index);
  const purse = { shards: shardsHeld(player?.items), gold: totalGoldAmount(player) };
  if (purse.shards < price.shards) return 'shards';
  if (purse.gold < price.gold) return 'gold';
  return null;
}
export function honePiece(item, index, player) {
  if (!player || !Array.isArray(player.items) || !player.items.includes(item)) return { ok: false, reason: 'gone' };
  const why = honeRefusal(item, index, player);
  if (why) return { ok: false, reason: why };
  const price = /** @type {{ shards: number, gold: number }} */ (honePrice(item, index));
  const line = honeAffix(item, index);
  if (!line) return { ok: false, reason: 'not' };
  const { shards, gold } = price;
  spendShards(player.items, shards);
  deductGold(player, gold);
  return { ok: true, line, price };
}
export const IMBUE_PRICE = Object.freeze({
  magic: Object.freeze({ shards: 10, gold: 10000 }),
  rare: Object.freeze({ shards: 30, gold: 50000 }),
});
const shortOf = (player, p) => (shardsHeld(player?.items) < p.shards ? 'shards' : totalGoldAmount(player) < p.gold ? 'gold' : null);
const payFor = (player, p) => { spendShards(player.items, p.shards); deductGold(player, p.gold); };

export function imbueTarget(item) {
  if (!item || typeof item.provenance === 'string' || item.questItem || item.artifact || isSummoned(item)) return null;
  // Clears equipSlot so a worn piece still gets a target; imbueRefusal reports it as worn.
  if (item.rarity == null) return rarityEligible({ ...item, equipSlot: null }) ? 'magic' : null;
  if (item.magic) return null;
  if (makerRows(item)) return null;
  return item.rarity === 'magic' ? 'rare' : null;
}
// A found Magic piece rolls no enchantment rows besides its curse, so any other row came from the Item Maker.
const makerRows = (item) => (Array.isArray(item.enchantments) ? item.enchantments : [])
  .some((e) => !(item.cursed && e?.type === item.cursed.type && e?.param === item.cursed.param));
export function imbuePrice(item) {
  const t = imbueTarget(item);
  return t ? { ...IMBUE_PRICE[t] } : null;
}
export function imbueRefusal(item, player) {
  if (!lootRarityOn()) return 'off';
  const target = imbueTarget(item);
  if (!target) return 'not';
  if (item.rarity && !itemIsIdentified(item)) return 'unknown';
  if (isLocked(item)) return 'locked';
  if (isEquipped(item)) return 'worn';
  if (isCursed(item)) return 'cursed';
  if (socketGems(item).length) return 'set';
  return shortOf(player, /** @type {{ shards: number, gold: number }} */ (imbuePrice(item)));
}
export function imbueFlavours(item) {
  return imbueTarget(item) === 'rare'
    ? (RARE_FLAVOURS[item.group] ?? RARE_FLAVOURS.Jewellery).filter((f) => !f.retired)
    : [];
}

export function imbueBonusCount(item) {
  const target = imbueTarget(item);
  const existing = (item.affixes ?? []).filter((a) => !AFFIX_KINDS[a.id]?.technique && !AFFIX_KINDS[a.id]?.proc && AFFIX_RANGES[a.id]?.[target]);
  return Math.max(0, (AFFIX_COUNTS[target]?.[0] ?? 0) - existing.length);
}

export function imbueBonusChoices(item, chosen = []) {
  const tier = imbueTarget(item);
  if (!tier) return [];
  const used = [...(item.affixes ?? []), ...chosen];
  return AFFIX_IDS.flatMap((id) => {
    const kind = AFFIX_KINDS[id];
    if (kind.proc || !kind.groups.includes(item.group)) return [];
    const value = AFFIX_RANGES[id][tier][0];
    const params = kind.params ? kindParams(id, item) : [undefined];
    return params.filter((param) => !used.some((a) => a.id === id && a.param === param))
      .map((param) => param === undefined ? { id, value } : { id, param, value });
  });
}

export function imbueKeptBonuses(item) {
  const tier = imbueTarget(item);
  return (item.affixes ?? []).filter((a) => AFFIX_RANGES[a.id]?.[tier]).map((a) => {
    const [low, high] = AFFIX_RANGES[a.id][tier];
    return { ...a, value: Math.max(low, Math.min(high, a.value)) };
  });
}

export function imbuePiece(item, player, choices = [], flavour = null) {
  if (!player || !Array.isArray(player.items) || !player.items.includes(item)) return { ok: false, reason: 'gone' };
  const why = imbueRefusal(item, player);
  if (why) return { ok: false, reason: why };
  const tier = imbueTarget(item);
  const price = imbuePrice(item);
  const enchantment = imbueFlavours(item).find((f) => f.type === flavour?.type && f.param === flavour?.param);
  if (!Array.isArray(choices) || choices.length !== imbueBonusCount(item) || (tier === 'rare' && !enchantment)) return { ok: false, reason: 'choice' };
  const selected = [];
  for (const choice of choices) {
    const bonus = imbueBonusChoices(item, selected).find((a) => a.id === choice?.id && a.param === choice?.param);
    if (!bonus) return { ok: false, reason: 'choice' };
    selected.push(bonus);
  }
  // The piece is restored and nothing is paid when the roll throws or the item law would flag the result.
  const was = structuredClone(item);
  const lawBefore = new Set(itemLawFindings(item));
  const base = itemBaseValue(item);
  const before = Number.isFinite(item.value) ? item.value : base;
  const putBack = () => { for (const k of Object.keys(item)) delete item[k]; Object.assign(item, was); };
  try {
    const kept = imbueKeptBonuses(item);
    const techniques = kept.filter((a) => AFFIX_KINDS[a.id].technique);
    item.rarity = tier;
    item.affixes = [...kept.filter((a) => !AFFIX_KINDS[a.id].technique), ...selected, ...techniques];
    item.name = was.rarity ? linesName(item, tier, was) : (was.name || rarityName(item, tier, item.affixes));
    item.value = base + affixesWorth(item.affixes, item) + (enchantment ? rareEnchantWorth(item) : 0);
    if (enchantment) item.enchantments = [{ type: enchantment.type, param: enchantment.param }];
    if (item.rarity === tier && Number.isFinite(item.sigil?.power)) item.sigil = { ...item.sigil, power: Math.max(item.sigil.power, sigilFloor(tier, item.sigil.party)) };
    item.imbued = true;
    item.imbueWorth = (Number.isInteger(was.imbueWorth) ? Math.max(0, was.imbueWorth) : 0) + Math.max(0, Math.round((Number.isFinite(item.value) ? item.value : before) - before));
    item.isIdentified = true;
    if (item.rarity !== tier || itemLawFindings(item).some((f) => !lawBefore.has(f))) { putBack(); return { ok: false, reason: 'not' }; }
  } catch (err) { putBack(); throw err; }
  payFor(player, price);
  return { ok: true, tier, price };
}

export const EXTRACT_PRICE = Object.freeze({ chipped: 50, flawed: 100, plain: 200, flawless: 400, perfect: 800 });
// Quest gems stay out of sockets so their quests can finish, and enchanted gems would lose their powers.
const looseGem = (it, gem) => gemKindOf(it) === gem && !it.questItem && !isLocked(it) && !isEquipped(it) && !isEnchanted(it);
export const gemsHeld = (items) => Object.fromEntries(ALL_GEM_IDS.map((g) => [g, (Array.isArray(items) ? items : []).reduce((n, it) => n + (looseGem(it, g) ? (it.stackCount ?? 1) : 0), 0)]));
export function takeGem(items, gem, prefer = null) {
  const at = prefer && looseGem(prefer, gem) ? items.indexOf(prefer) : -1;
  if (at >= 0) { if ((prefer.stackCount ?? 1) > 1) prefer.stackCount -= 1; else items.splice(at, 1); return prefer; }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!looseGem(it, gem)) continue;
    if ((it.stackCount ?? 1) > 1) it.stackCount -= 1; else items.splice(i, 1);
    return it;
  }
  return false;
}
const unbought = (/** @type {any} */ item, /** @type {number} */ i) => {
  const left = (Array.isArray(item.socketBought) ? item.socketBought : []).filter(([j]) => j !== i);
  if (left.length) item.socketBought = left; else delete item.socketBought;
};
function socketWork(item) {
  if (!lootRarityOn()) return 'off';
  if (!hasSocket(item)) return 'not';
  return !itemIsIdentified(item) ? 'unknown' : null;
}
const refold = (item, player) => { if (isEquipped(item)) notifyEquipChange(player); };
export function setGemRefusal(item, gem, player, at = null) {
  const work = socketWork(item);
  if (work) return work;
  const list = socketsOf(item);
  if (list[at == null ? list.indexOf(SOCKET_EMPTY) : at] !== SOCKET_EMPTY) return 'set';
  if (!ALL_GEM_IDS.includes(gem) || !(gemsHeld(player?.items)[gem] > 0)) return 'nogem';
  return null;
}
export function setGemPiece(item, gem, player, at = null, { from = null } = {}) {
  if (!player || !Array.isArray(player.items) || !player.items.includes(item)) return { ok: false, reason: 'gone' };
  const why = setGemRefusal(item, gem, player, at);
  if (why) return { ok: false, reason: why };
  const i = at == null ? socketsOf(item).indexOf(SOCKET_EMPTY) : at;
  const stone = takeGem(player.items, gem, from);
  const line = setGem(item, gem, at);
  unbought(item, i);
  // A gem bought at a counter keeps its sale mark on the socket, so extracting it returns the same marked stone.
  if (stone?.[PATRON_COUNTER_MARK] === true) item.socketBought = [...(item.socketBought ?? []), [i, Number.isInteger(stone[COUNTER_PAID_MARK]) ? stone[COUNTER_PAID_MARK] : null]];
  refold(item, player);
  noteAct('gem-socketed');
  return { ok: true, line };
}
export function unsetGemRefusal(item, at = null) {
  return socketWork(item) ?? (socketGem(item, at) ? null : 'empty');
}
export function unsetGemPiece(item, player, at = null) {
  if (!player || !Array.isArray(player.items) || !player.items.includes(item)) return { ok: false, reason: 'gone' };
  const why = unsetGemRefusal(item, at);
  if (why) return { ok: false, reason: why };
  const i = at == null ? socketsOf(item).findIndex((v) => ALL_GEM_IDS.includes(v)) : at;
  const gem = unsetGem(item, at);
  unbought(item, i);
  refold(item, player);
  return { ok: true, gem };
}
export const extractPrice = (item, at = null) => { const g = socketGem(item, at); return g ? EXTRACT_PRICE[gemGrade(g) ?? 'plain'] : null; };
export function extractGemRefusal(item, player, at = null) {
  return unsetGemRefusal(item, at) ?? (totalGoldAmount(player) < (extractPrice(item, at) ?? 0) ? 'gold' : null);
}
export function extractGemPiece(item, player, at = null) {
  if (!player || !Array.isArray(player.items) || !player.items.includes(item)) return { ok: false, reason: 'gone' };
  const why = extractGemRefusal(item, player, at);
  if (why) return { ok: false, reason: why };
  const price = /** @type {number} */ (extractPrice(item, at));
  const i = at == null ? socketsOf(item).findIndex((v) => ALL_GEM_IDS.includes(v)) : at;
  const bought = (Array.isArray(item.socketBought) ? item.socketBought : []).find(([j]) => j === i) ?? null;
  const gem = /** @type {string} */ (unsetGem(item, at));
  deductGold(player, price);
  const stone = /** @type {any} */ (mintGem(gem));
  if (bought) { stone[PATRON_COUNTER_MARK] = true; if (bought[1] != null) stone[COUNTER_PAID_MARK] = bought[1]; stone[COUNTER_VALUE_MARK] = gemWorthOf(gem); }
  unbought(item, i);
  addItem(player.items, stone);
  refold(item, player);
  return { ok: true, gem, price };
}
export function reforgePiece(item, index, player, choice, { preview = false } = {}) {
  if (!player || !Array.isArray(player.items) || !player.items.includes(item)) return { ok: false, reason: 'gone' };
  const why = reforgeRefusal(item, index, player);
  if (why) return { ok: false, reason: why };
  const price = /** @type {{ shards: number, gold: number }} */ (reforgePrice(item));
  const before = { affixes: item.affixes, name: item.name, value: item.value, reforged: item.reforged, reforges: item.reforges };
  const line = reforgeAffix(item, index, choice);
  if (!line) {
    Object.assign(item, before);
    for (const k of /** @type {const} */ (['reforged', 'reforges'])) if (before[k] === undefined) delete item[k];
    return { ok: false, reason: 'choice' };
  }
  spendShards(player.items, price.shards);
  deductGold(player, price.gold);
  if (!preview) noteAct('piece-reforged');
  return { ok: true, line, price };
}
