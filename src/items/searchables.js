// @ts-check
// Searchable dungeon objects and graveyard headstones: model ids, search rolls, finds, locks, and cooldowns.

import { DOOR_ACTIVATION_DISTANCE, RAY_DISTANCE } from '../player/activate.js';
import { isShopShelfModel } from '../trade/shopStock.js';
import { registerModSaveData } from '../saves/modSaveData.js';
import { eliteHash, eliteRng, elitesAllowed, eliteRenownOpen } from '../characters/eliteFoes.js';
import { goldStack } from './inventory.js';
import { createRandomWeapon, createRandomArmor, createRandomJewellery, createRandomReligiousItem, createRandomGem, createRandomClothing, createRandomPotion } from './loot.js';
import { createRandomBook } from './books.js';
import { setItemFields, mintCondition, isAmmunition } from './itemTemplates.js';
import { rollLootRarity, pileSource } from './lootRarity.js';
import { noteFirstUse } from '../ui/tutorials.js';
import { WATER_SPECIES } from '../characters/dungeonEnemies.js';
import { t } from '../ui/textManager.js';

export const SEARCH_REACH = DOOR_ACTIVATION_DISTANCE / 2;
/** @param {{min: number[], max: number[]}} aabb @param {number[]} feet @param {number} top */
export function searchBodyDistance(aabb, feet, top) {
  const gap = (v, lo, hi) => (v < lo ? lo - v : v > hi ? v - hi : 0);
  const dx = gap(feet[0], aabb.min[0], aabb.max[0]), dz = gap(feet[2], aabb.min[2], aabb.max[2]);
  const lo = Math.min(feet[1], top), hi = Math.max(feet[1], top);
  const dy = hi < aabb.min[1] ? aabb.min[1] - hi : lo > aabb.max[1] ? lo - aabb.max[1] : 0;
  return Math.hypot(dx, dy, dz);
}
// Within reach of the body this returns the full ray distance, so any ray hit on the object passes the reach gate.
export function searchReachFor(aabb, feet, top) {
  if (!aabb || !Array.isArray(feet) || !feet.every(Number.isFinite)) return SEARCH_REACH;
  return searchBodyDistance(aabb, feet, Number.isFinite(top) ? top : feet[1]) <= SEARCH_REACH ? RAY_DISTANCE : SEARCH_REACH;
}
export const SEARCH_COOLDOWN_MINUTES = 5 * 60;

/** @typedef {'coffin'|'sarcophagus'|'shelf'|'tombstone'|'chest'|'crate'} SearchKind */
export const SEARCH_KINDS = Object.freeze({
  coffin:      Object.freeze({ name: 'Coffin',      grave: true,  lockable: false }),
  sarcophagus: Object.freeze({ name: 'Sarcophagus', grave: true,  lockable: false }),
  shelf:       Object.freeze({ name: 'Shelf',       grave: true,  lockable: false }),
  tombstone:   Object.freeze({ name: 'Grave',       grave: true,  lockable: false }),
  chest:       Object.freeze({ name: 'Chest',       grave: false, lockable: true }),
  crate:       Object.freeze({ name: 'Crate',       grave: false, lockable: true }),
});

// Model ids are classic Daggerfall model numbers. Model 41120 shares the coffin texture but is a pipe organ.
const COFFINS = new Set([41315, 41316, 41317, 41318]);
const SARCOPHAGI = new Set([41319, 41320, 41321, 41322, 41323, 41324, 41325, 41326, 41327]);
const EXTRA_SHELVES = new Set([41010, 41025, 41027, 41043, 41045, 41807, 41809]);
const CHESTS = new Set([41811, 41812, 41816, 41817, 41826, 41829]);
const CRATES = new Set([41815, 41818, 41822, 41824, 41825, 41827, 41828, 41830, 41831, 41832, 41833, 41834]);
const TOMBSTONE_RANGES = Object.freeze([[43011, 43082], [43101, 43104], [43117, 43136], [43142, 43145]]);
export const isTombstoneModel = (id) => TOMBSTONE_RANGES.some(([a, b]) => id >= a && id <= b);

/** @returns {SearchKind|null} */
export function searchableKind(modelIdNum) {
  const id = Number(modelIdNum);
  if (!Number.isInteger(id)) return null;
  if (COFFINS.has(id)) return 'coffin';
  if (SARCOPHAGI.has(id)) return 'sarcophagus';
  if (CHESTS.has(id)) return 'chest';
  if (CRATES.has(id)) return 'crate';
  if (isShopShelfModel(id) || EXTRA_SHELVES.has(id)) return 'shelf';
  if (isTombstoneModel(id)) return 'tombstone';
  return null;
}
export const searchName = (kind, locked = false) => `${locked ? 'Locked ' : ''}${SEARCH_KINDS[kind]?.name ?? 'Object'}`;

/** @typedef {'foe'|'loot'|'nothing'} SearchOutcome */
let _graveSearch = null;
export function registerGraveSearchListener(fn) { _graveSearch = typeof fn === 'function' ? fn : null; }
export function rollSearchOutcome({ graveyard = false, rolls = Math.random, kind = graveyard ? 'tombstone' : null } = {}) {
  noteFirstUse('searchables');
  if (kind && kind !== 'shelf' && SEARCH_KINDS[kind]?.grave) { try { _graveSearch?.(kind); } catch (e) { console.warn('[search] a grave listener threw', e?.message ?? e); } }
  const r = rolls();
  if (graveyard) return r < 2 / 3 ? 'nothing' : (r < 5 / 6 ? 'loot' : 'foe');
  return r < 1 / 3 ? 'foe' : (r < 2 / 3 ? 'loot' : 'nothing');
}

export const SEARCH_UNDEAD = Object.freeze([
  Object.freeze({ type: 15, level: 9 }), Object.freeze({ type: 17, level: 10 }), Object.freeze({ type: 18, level: 11 }),
  Object.freeze({ type: 19, level: 11 }), Object.freeze({ type: 23, level: 15 }), Object.freeze({ type: 28, level: 19 }),
  Object.freeze({ type: 30, level: 20 }), Object.freeze({ type: 32, level: 20 }), Object.freeze({ type: 33, level: 21 }),
]);
export const SEARCH_UNDEAD_LEVEL_SLACK = 3;
export const SEARCH_UNDEAD_FLOOR_LEVEL = 11;
export function pickSearchUndead(level = 1, rolls = Math.random) {
  const top = Math.max(SEARCH_UNDEAD_FLOOR_LEVEL, (level | 0) + SEARCH_UNDEAD_LEVEL_SLACK);
  const pool = SEARCH_UNDEAD.filter((u) => u.level <= top);
  return pool[Math.min(pool.length - 1, Math.floor(rolls() * pool.length))].type;
}
export function pickRosterFoe(roster, level = 1, rolls = Math.random) {
  const pool = [...new Set((roster ?? []).filter((t) => Number.isInteger(t) && t >= 0 && !WATER_SPECIES.has(t)))];
  if (!pool.length) return pickSearchUndead(level, rolls);
  return pool[Math.min(pool.length - 1, Math.floor(rolls() * pool.length))];
}
export const SEARCH_ELITE_CHANCE = 0.5;
export const SEARCH_FOES_PER_PLAYER = 2;
export const SEARCH_FOE_SPACING = 0.9;
export const SEARCH_DOOR_REACH_M = 30;
// The roll is drawn before the elite gates, so the dice sequence is the same whether elites are allowed or not.
export const rollSearchElite = (rolls = Math.random) => rolls() < SEARCH_ELITE_CHANCE && elitesAllowed() && eliteRenownOpen();

export const SEARCH_LOOT_MIN = 1;
export const SEARCH_LOOT_MAX = 4;
export const SEARCH_GOLD_PER_LEVEL = Object.freeze([6, 18]);
export const SEARCH_GOODS = Object.freeze({
  coffin:      Object.freeze(['jewellery', 'religious', 'gem', 'weapon']),
  sarcophagus: Object.freeze(['jewellery', 'religious', 'gem', 'armor', 'weapon']),
  tombstone:   Object.freeze(['jewellery', 'religious', 'gem']),
  shelf:       Object.freeze(['book', 'potion', 'potion', 'gem']),
  chest:       Object.freeze(['weapon', 'armor', 'clothing', 'gem', 'potion', 'jewellery']),
  crate:       Object.freeze(['clothing', 'potion', 'weapon', 'armor']),
});
export function rollSearchLoot(kind, level = 1, mint = {}, rolls = Math.random) {
  const lv = Math.max(1, level | 0);
  const count = SEARCH_LOOT_MIN + Math.floor(rolls() * (SEARCH_LOOT_MAX - SEARCH_LOOT_MIN + 1));
  const [lo, hi] = SEARCH_GOLD_PER_LEVEL;
  const items = [goldStack(Math.max(1, Math.round(lv * (lo + rolls() * (hi - lo)))))];
  const goods = SEARCH_GOODS[kind] ?? SEARCH_GOODS.chest;
  for (let n = 1; n < count; n++) {
    for (let tries = 0; tries < 4; tries++) {
      const fn = mint[goods[Math.floor(rolls() * goods.length)]];
      const it = typeof fn === 'function' ? fn(lv, rolls) : null;
      if (it) { items.push(it); break; }
    }
  }
  return items;
}

export const SEARCH_LOCKED_SHARE = 1 / 3;
export const SEARCH_LOCK_MAX = 15;
// The lock is a hash of the location and object keys, so every client and every visit sees the same lock.
export function searchLockValue(kind, locationKey, objectKey) {
  if (!SEARCH_KINDS[kind]?.lockable) return 0;
  const r = eliteRng(eliteHash('search-lock', locationKey, objectKey));
  return r() < SEARCH_LOCKED_SHARE ? 1 + Math.floor(r() * SEARCH_LOCK_MAX) : 0;
}

const _ledger = new Map();
export const searchKey = (locationKey, objectKey) => `${locationKey}|${objectKey}`;
export function searchCooldownLeft(key, nowMinutes) {
  const e = _ledger.get(key);
  if (!e || !Number.isFinite(e.t)) return 0;
  return Math.max(0, SEARCH_COOLDOWN_MINUTES - (nowMinutes - e.t));
}
export const SEARCH_WHO_MAX = 32;
// The later search holds the cooldown: a report of an earlier search never shortens one already marked.
export function markSearched(key, nowMinutes, who = null) {
  const e = _ledger.get(key);
  if (e && Number.isFinite(e.t) && e.t > nowMinutes) return;
  _ledger.set(key, { ...(e ?? { u: false }), t: nowMinutes, w: typeof who === 'string' && who ? who.slice(0, SEARCH_WHO_MAX) : null });
}
export const isPicked = (key) => !!_ledger.get(key)?.u;
export const markPicked = (key) => { _ledger.set(key, { t: -Infinity, w: null, ...(_ledger.get(key) ?? {}), u: true }); };
export const SEARCHED_TEXT = 'You have already searched here.';
export const searchedBy = (key) => _ledger.get(key)?.w ?? null;
export const searchedText = (key) => { const w = searchedBy(key); return w ? t('search.searchedBy', 'Already searched by {name}.', { name: w }) : SEARCHED_TEXT; };

export const SEARCH_LEDGER_MAX = 4000;
export const SEARCH_SAVE_VENDOR = 'Searchables';
export function searchLedgerRecord(nowMinutes = Infinity) {
  const rows = [];
  for (const [k, e] of _ledger) {
    const live = Number.isFinite(e.t) && (!Number.isFinite(nowMinutes) || nowMinutes - e.t < SEARCH_COOLDOWN_MINUTES);
    if (live || e.u) rows.push(e.w ? [k, Number.isFinite(e.t) ? e.t : null, e.u ? 1 : 0, e.w] : [k, Number.isFinite(e.t) ? e.t : null, e.u ? 1 : 0]);
  }
  rows.sort((a, b) => (b[1] ?? -Infinity) - (a[1] ?? -Infinity));
  return { rows: rows.slice(0, SEARCH_LEDGER_MAX) };
}
export function restoreSearchLedger(record) {
  _ledger.clear();
  for (const r of Array.isArray(record?.rows) ? record.rows.slice(0, SEARCH_LEDGER_MAX) : []) {
    if (!Array.isArray(r) || typeof r[0] !== 'string' || r[0].length > 200) continue;
    const t = Number.isFinite(r[1]) ? r[1] : -Infinity;
    _ledger.set(r[0], { t, u: r[2] === 1, w: typeof r[3] === 'string' && r[3] ? r[3].slice(0, SEARCH_WHO_MAX) : null });
  }
}
let _clock = () => Infinity;
export const setSearchClock = (fn) => { _clock = typeof fn === 'function' ? fn : () => Infinity; };
registerModSaveData(SEARCH_SAVE_VENDOR, {
  newSaveData: () => ({ rows: [] }),
  getSaveData: () => searchLedgerRecord(_clock()),
  restoreSaveData: (r) => restoreSearchLedger(r),
});
export const _resetSearchLedgerForTests = () => _ledger.clear();

// The cooldown of a search binds only the party of the searcher. It syncs through the `srch:<i>` room word
// underground and through cell grave stamps above ground.
export const SEARCH_ACCT_MAX = 128;
const acctOk = (a) => typeof a === 'string' && a.length > 0 && a.length <= SEARCH_ACCT_MAX;
let _party = null;
export const setSearchParty = (lens) => { _party = lens && typeof lens === 'object' ? lens : null; };
export const searchPartyLens = () => _party;
export const searchSelfAcct = () => { const a = _party?.self?.(); return acctOk(a) ? a : null; };
export function searchKinOf(acct) {
  if (!acctOk(acct) || !_party) return null;
  if (acct === searchSelfAcct()) return 'me';
  return _party.inParty?.(acct) ? 'party' : null;
}
export const searchAcctOfPeer = (id) => { const a = typeof id === 'string' && id ? _party?.acctOfPeer?.(id) : null; return acctOk(a) ? a : null; };
export function searchWhoOf(acct, fallback = null) {
  if (searchKinOf(acct) !== 'party') return null;
  const n = _party?.nameOf?.(acct);
  const name = typeof n === 'string' && n ? n : (typeof fallback === 'string' && fallback ? fallback : t('search.yourParty', 'your party'));
  return name.slice(0, SEARCH_WHO_MAX);
}
export const searchSelfName = () => { const n = _party?.selfName?.(); return typeof n === 'string' && n ? n.slice(0, SEARCH_WHO_MAX) : null; };
// The cooldown is per account, so a search by another character on my account names that character.
export function searchToldBy(acct, name = null) {
  const kin = searchKinOf(acct);
  if (kin === 'party') return searchWhoOf(acct, name);
  if (kin !== 'me' || typeof name !== 'string' || !name) return null;
  const n = name.slice(0, SEARCH_WHO_MAX), mine = searchSelfName();
  return mine && n !== mine ? n : null;
}

const FOE_GRAVE = Object.freeze({
  coffin: [
    ['You pry the warped lid aside.', 'The stench of the grave rolls out,', 'and something within draws breath', 'it has no right to.', '', 'A %s rises to meet you!'],
    ['The coffin is not empty.', 'Bony fingers close about your wrist', 'before you can pull it back.', '', 'A %s stirs from its rest!'],
  ],
  sarcophagus: [
    ['Stone grinds on stone as the lid gives.', 'Within, the wrappings shift and tear,', 'and dead eyes open in the dark.', '', 'A %s wakes, and it is not pleased.'],
    ['Old wards crumble beneath your hands.', 'Whatever they kept in has been', 'waiting a long time for this.', '', 'A %s claws its way out!'],
  ],
  shelf: [
    ['Behind the moldering tomes your hand', 'finds a skull - and the skull turns', 'to look at you.', '', 'A %s answers the disturbance!'],
    ['A brittle scroll crumbles at your touch.', 'The words upon it were a binding,', 'and you have just broken it.', '', 'A %s is loosed upon you!'],
  ],
  tombstone: [
    ['The earth before the stone is soft.', 'Too soft. It heaves, and a hand', 'breaks through the sod.', '', 'A %s rises from the grave!'],
    ['As you brush the moss from the name,', 'the ground beneath you groans.', 'The dead do not care to be read.', '', 'A %s claws free of its grave!'],
  ],
});
const FOE_PLACE = Object.freeze({
  chest: [
    ['The hinges shriek like a dying man.', 'Somewhere in the dark, footsteps', 'quicken toward the sound.', '', 'A %s has heard you!'],
    ['You have barely raised the lid when', 'you hear it - the scrape of claws', 'and the breathing behind you.', '', 'A %s comes to guard its hoard!'],
  ],
  crate: [
    ['The boards split with a crack that', 'echoes down every passage.', 'You are no longer alone.', '', 'A %s comes looking!'],
    ['Splinters fly as the crate gives way.', 'The din carries far, and something', 'that lairs here answers it.', '', 'A %s is upon you!'],
  ],
});
const ELITE_ROW = 'It burns with a cold, unholy light...';
const MANY_ROW_GRAVE = 'And it does not rise alone.';
const MANY_ROW_PLACE = 'And it has brought company.';
const ELITE_ROW_PLACE = 'It moves with a terrible purpose...';
const LOOT = Object.freeze({
  coffin: [['Beneath the rotted shroud, the dead', 'still clutch what they could not', 'take with them.'], ['The departed were buried with', 'more than their names. You do not', 'think they will miss it.']],
  sarcophagus: [['Grave goods glint amid the wrappings -', 'offerings for a journey', 'their owner never took.'], ['The noble dead keep their wealth', 'close. Not close enough.']],
  shelf: [['Among the dust and the cobwebs,', 'a few things of worth have', 'escaped the years.'], ['Someone hid their valuables', 'behind these old books, and', 'never came back for them.']],
  tombstone: [['Something is buried at the foot of', 'the stone - a mourner\'s offering,', 'or a thief\'s cache.'], ['The earth here was disturbed once', 'before. Whoever dug it left', 'something behind.']],
  chest: [['The chest yields its contents.', 'Whoever stocked it will not', 'be pleased.'], ['Inside, wrapped in oilcloth,', 'lies a small fortune.']],
  crate: [['Amid straw and splinters you', 'find more than provisions.'], ['The crate holds a few things', 'worth the carrying.']],
});
const NOTHING = Object.freeze({
  coffin: [['Nothing but bones and dust.', 'The grave-robbers came before you.'], ['The coffin holds only the dead,', 'and the dead hold nothing of value.']],
  sarcophagus: [['The sarcophagus was plundered long ago.', 'Only scraps of linen remain.'], ['Dust, bone and silence.', 'Nothing worth the taking.']],
  shelf: [['Rotten parchment and empty jars.', 'Nothing of value.'], ['The books crumble at your touch.', 'Whatever was here is long gone.']],
  tombstone: [['The grave keeps its own counsel.', 'You find nothing of value.'], ['Only moss, earth and a name', 'time has nearly taken.'], ['The stone is cold, the ground undisturbed.', 'There is nothing here for you.'], ['Here lies one who took', 'everything with them.']],
  chest: [['The chest is empty.', 'Someone was here before you.'], ['Nothing but cobwebs', 'and the smell of old rope.']],
  crate: [['Rotten straw and broken pottery.', 'Nothing of value.'], ['The crate holds nothing', 'worth carrying.']],
});
const pickRows = (pool, rolls) => [...pool[Math.min(pool.length - 1, Math.floor(rolls() * pool.length))]];
export function searchMessage(kind, outcome, { foeName = 'creature', elite = false, count = 1, rolls = Math.random } = {}) {
  const k = SEARCH_KINDS[kind] ? kind : 'chest';
  if (outcome === 'foe') {
    const grave = SEARCH_KINDS[k].grave;
    const rows = pickRows((grave ? FOE_GRAVE : FOE_PLACE)[k] ?? FOE_PLACE.chest, rolls).map((r) => r.replace('%s', foeName));
    if (elite) rows.push(grave ? ELITE_ROW : ELITE_ROW_PLACE);
    if (count > 1) rows.push(grave ? MANY_ROW_GRAVE : MANY_ROW_PLACE);
    return rows;
  }
  if (outcome === 'loot') return pickRows(LOOT[k], rolls);
  return pickRows(NOTHING[k], rolls);
}

const finish = (raw) => (raw ? mintCondition(setItemFields(raw)) : null);
export function searchMinters(gender = 'male') {
  return {
    weapon: (lv, r) => { const w = createRandomWeapon(lv, r); return w && !isAmmunition(w) ? finish(w) : null; },
    armor: (lv, r) => finish(createRandomArmor(lv, r)),
    jewellery: (lv, r) => finish(createRandomJewellery(r)),
    religious: (lv, r) => finish(createRandomReligiousItem(r)),
    gem: (lv, r) => finish(createRandomGem(r)),
    clothing: (lv, r) => finish(createRandomClothing(gender, r)),
    potion: (lv, r) => createRandomPotion(r),
    book: (lv, r) => { try { return createRandomBook(r); } catch { return null; } },
  };
}
export function mintSearchFind(kind, { level = 1, gender = 'male', tier = 0, family = null, luck = 50, rolls = Math.random, mint = null } = {}) {
  const items = rollSearchLoot(kind, level, mint ?? searchMinters(gender), rolls);
  rollLootRarity(items, { ...pileSource(tier), family }, { rolls, luck });
  return items;
}
