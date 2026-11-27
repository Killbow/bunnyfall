// @ts-check
// Rest supply templates register at import; saves/save.js imports this file so saved supplies load in every scene.
import { registerCustomTemplates, registerItemUseHandler, templateByIndex, mintCondition, setItemFields } from '../../items/itemTemplates.js';
import { REST_ITEM, REST_ITEM_GROUP, BEDROLL_NIGHTS, CANDLE_USES, SALTS_USES, REST_ITEM_ROWS, isRestItem } from './restItemRows.js';
import { isOnlinePage } from '../../platform/onlineLane.js';
import { survivalOn } from './switch.js';
import { survivalOf, sleepStage, wakingHeld, WAKING_DEBT_HOURS } from './needs.js';
import { ownMinutes } from '../../world/worldTick.js';
import { maxFatigue } from '../../characters/statMods.js';
import { registerTabledLootHandler, registerEnemyLootExtra } from '../../items/loot.js';
import { registerLootSupply } from '../../items/foeLootCap.js';
import { renownLootQuarters, lootEased } from '../../items/renownLoot.js';

// Older clients drop items with no template, so online sources stay off until a release ships the templates.
export const REST_ITEMS_ONLINE = true;
let _restItemsOnline = REST_ITEMS_ONLINE;
export const restItemsOnline = () => _restItemsOnline;
export function _setRestItemsOnlineForTests(on) { _restItemsOnline = on == null ? REST_ITEMS_ONLINE : !!on; }
export const restItemsAvailable = (online = isOnlinePage()) => (online ? restItemsOnline() : survivalOn());

export const BEDROLL_CHANNEL_SECONDS = 10;
export const EMBER_JAR_MINUTES = 180;
export const FIREWOOD_NIGHTS = 3;
export const TONIC_FATIGUE = 0.4;
export const TONIC_SLEEP_HOURS = 4;
export const CANDLE_MAGICKA = 0.5;
export const SALTS_MINUTES = 60;
export const SALTS_DEBT_HOURS = WAKING_DEBT_HOURS;
export const DRAUGHT_SPENT_MINUTES = 60;

export { REST_ITEM, REST_ITEM_GROUP, BEDROLL_NIGHTS, CANDLE_USES, SALTS_USES, REST_ITEM_ROWS };
registerCustomTemplates(REST_ITEM_ROWS);

const INDICES = new Set(Object.values(REST_ITEM));
export { isRestItem };
registerLootSupply('REST', isRestItem);
export const isBedroll = (item) => item?.templateIndex === REST_ITEM.Bedroll;
export const isEmberJar = (item) => item?.templateIndex === REST_ITEM.EmberJar;
export const isFirewood = (item) => item?.templateIndex === REST_ITEM.Firewood;

export function createRestItem(templateIndex, { stackCount = 1 } = {}) {
  const t = templateByIndex(templateIndex);
  if (!t || !INDICES.has(templateIndex)) return null;
  const it = mintCondition(setItemFields({ group: REST_ITEM_GROUP, templateIndex }));
  if (t.stackable && stackCount > 1) it.stackCount = Math.trunc(stackCount);
  return it;
}

export const REST_ITEM_TEXT = Object.freeze({
  tonic: 'You drink the tonic. Your weariness lifts.',
  tonicSleep: 'You drink the tonic. Your weariness lifts, and you will not need sleep for a while longer.',
  candleLit: 'You light the candle. Rest to kneel and meditate before it.',
  candleNotCarried: 'Carry the candle in your pack to light it.',
  meditated: 'You meditate before the candle. Your mind clears.',
  candleOut: 'The candle burns down to nothing.',
  salts: 'The salts sting your nose and you are wide awake. Your weariness will not trouble you for an hour.',
  saltsNotTired: 'You are not weary enough to need the salts.',
  saltsArcOff: 'The salts sting your nose, but you were not tired.',
  saltsEnd: 'The salts wear off, and all your weariness returns at once.',
  saltsHeld: 'The last dose of salts has not yet worn off.',
  draught: 'You drink the draught. Tonight you will sleep as well as in a bed.',
  draughtHeld: 'You have already taken a draught for tonight.',
  bedrollLaid: 'You lay out your bedroll.',
  bedrollWorn: 'Your bedroll is worn through.',
  emberLit: 'You tip out the embers and a fire catches.',
  firewoodFed: (n) => `You feed the fire. It has ${n} ${n === 1 ? 'night' : 'nights'} of fuel.`,
  firewoodFull: 'Your Campfire cannot take any more fuel.',
  firewoodNone: 'You have no Campfire to feed.',
  notOnline: 'This cannot yet be used in the realm.',
});

export function restItemLines(item) {
  const n = item?.currentCondition ?? 0;
  switch (item?.templateIndex) {
    case REST_ITEM.Bedroll: return [`${n} ${n === 1 ? 'night' : 'nights'} left`, 'A rough night\'s sleep anywhere you could camp.'];
    case REST_ITEM.EmberJar: return ['Makes a fire for one night. The fire cannot be carried.'];
    case REST_ITEM.Firewood: return [`Adds ${FIREWOOD_NIGHTS} nights of fuel to a Campfire.`];
    case REST_ITEM.Tonic: return [`Restores ${Math.round(TONIC_FATIGUE * 100)}% of your fatigue.`, `With Climates & Calories, sleep can wait ${TONIC_SLEEP_HOURS} hours more.`];
    case REST_ITEM.Candle: return [`${n} ${n === 1 ? 'use' : 'uses'} left`, `Meditate by it to restore ${Math.round(CANDLE_MAGICKA * 100)}% of your magicka.`];
    case REST_ITEM.Salts: return [`${n} ${n === 1 ? 'use' : 'uses'} left`, 'Keeps weariness away for an hour, then it returns all at once.'];
    case REST_ITEM.Draught: return ['Your next night counts as sleeping in a bed.'];
    default: return [];
  }
}

function takeOne(item, list) {
  if ((item.stackCount ?? 1) > 1) { item.stackCount -= 1; return; }
  const i = Array.isArray(list) ? list.indexOf(item) : -1;
  if (i >= 0) list.splice(i, 1);
}
export function spendCharge(item, list) {
  item.currentCondition = Math.max(0, (item.currentCondition ?? 1) - 1);
  if (item.currentCondition > 0) return false;
  const i = Array.isArray(list) ? list.indexOf(item) : -1;
  if (i >= 0) list.splice(i, 1);
  return true;
}

export function useTonic(item, list, entity, now = ownMinutes()) {
  if (!entity) return { kind: 'text', text: REST_ITEM_TEXT.tonic };
  const max = maxFatigue(entity);
  entity.fatigue = Math.min(max, (entity.fatigue ?? 0) + Math.round(max * TONIC_FATIGUE));
  let sleep = false;
  if (survivalOn()) {
    const s = survivalOf(entity, now);
    sleep = (s.sleepDebt ?? 0) > 0;
    s.sleepDebt = Math.max(0, (s.sleepDebt ?? 0) - TONIC_SLEEP_HOURS);
  }
  takeOne(item, list);
  return { kind: 'text', text: sleep ? REST_ITEM_TEXT.tonicSleep : REST_ITEM_TEXT.tonic };
}

export function useSalts(item, list, entity, now = ownMinutes()) {
  if (!survivalOn() || !entity) return { kind: 'text', text: REST_ITEM_TEXT.saltsArcOff };
  const s = survivalOf(entity, now);
  if (sleepStage(s.sleepDebt ?? 0) === 'rested') return { kind: 'text', text: REST_ITEM_TEXT.saltsNotTired };
  // Refuse a second dose while one holds: the sleep debt lands only once when the hold ends.
  if (wakingHeld(s, now)) return { kind: 'text', text: REST_ITEM_TEXT.saltsHeld };
  s.wakingUntil = Math.max(s.wakingUntil ?? 0, now) + SALTS_MINUTES;
  spendCharge(item, list);
  return { kind: 'text', text: REST_ITEM_TEXT.salts };
}
export function useDraught(item, list, entity, now = ownMinutes()) {
  if (!entity) return { kind: 'text', text: REST_ITEM_TEXT.draught };
  const s = survivalOf(entity, now);
  if (s.draught) return { kind: 'text', text: REST_ITEM_TEXT.draughtHeld };
  s.draught = true;
  takeOne(item, list);
  return { kind: 'text', text: REST_ITEM_TEXT.draught };
}
export const draughtTaken = (entity) => !!entity?.survival?.draught;
export const spendDraught = (entity) => { if (entity?.survival) entity.survival.draught = false; };

let _candle = null;
export const litCandle = (entity = null) => (_candle && (!entity || (entity.items ?? []).includes(_candle.item)) ? _candle : null);
export function useCandle(item, list, entity = null) {
  if (entity && !(entity.items ?? []).includes(item)) return { kind: 'text', text: REST_ITEM_TEXT.candleNotCarried };
  _candle = { item, list };
  return { kind: 'text', text: REST_ITEM_TEXT.candleLit, closesWindow: true };
}
export function meditate(entity) {
  const c = litCandle(entity);
  _candle = null;
  if (!c || !entity) return null;
  const max = entity.maxMagicka ?? 0;
  entity.magicka = Math.min(max, (entity.magicka ?? 0) + Math.round(max * CANDLE_MAGICKA));
  const gone = spendCharge(c.item, c.list);
  return gone ? `${REST_ITEM_TEXT.meditated} ${REST_ITEM_TEXT.candleOut}` : REST_ITEM_TEXT.meditated;
}
export const snuffCandle = () => { _candle = null; };

const restItemsShut = () => isOnlinePage() && !restItemsOnline();
const offlineUse = (fn) => {
  const h = (item, list, ctx) => (restItemsShut() ? { kind: 'text', text: REST_ITEM_TEXT.notOnline } : fn(item, list, ctx));
  h.usable = () => !restItemsShut();
  return h;
};
registerItemUseHandler(REST_ITEM.Bedroll, offlineUse((item) => ({ kind: 'pitchCamp', item })));
registerItemUseHandler(REST_ITEM.EmberJar, offlineUse((item) => ({ kind: 'placeFire', item })));
registerItemUseHandler(REST_ITEM.Firewood, offlineUse((item) => ({ kind: 'placeFire', item })));
registerItemUseHandler(REST_ITEM.Tonic, offlineUse((item, list, ctx) => useTonic(item, list, ctx?.entity)));
registerItemUseHandler(REST_ITEM.Candle, offlineUse((item, list, ctx) => useCandle(item, list, ctx?.entity)));
registerItemUseHandler(REST_ITEM.Salts, offlineUse((item, list, ctx) => useSalts(item, list, ctx?.entity)));
registerItemUseHandler(REST_ITEM.Draught, offlineUse((item, list, ctx) => useDraught(item, list, ctx?.entity)));

export const REST_SHELVES = Object.freeze({
  GeneralStore: Object.freeze([[REST_ITEM.Bedroll, 0, 1], [REST_ITEM.EmberJar, 1, 3], [REST_ITEM.Firewood, 2, 5], [REST_ITEM.Tonic, 0, 2]]),
  Alchemist: Object.freeze([[REST_ITEM.Tonic, 1, 3], [REST_ITEM.Salts, 0, 2], [REST_ITEM.Draught, 1, 2], [REST_ITEM.Candle, 1, 2]]),
});
export function restItemsStock(kind, quality = 10, rolls = Math.random, { online = isOnlinePage() } = {}) {
  if (!restItemsAvailable(online)) return [];
  const out = [];
  for (const [t, lo, hi] of REST_SHELVES[kind] ?? []) {
    const n = lo + Math.floor(rolls() * (hi - lo + 1)) + (quality >= 15 && hi > 0 ? 1 : 0);
    // The Bedroll count is still drawn offline so the other shelf draws keep their rolls.
    if (t === REST_ITEM.Bedroll && !online) continue;
    for (let i = 0; i < n; i++) { const it = createRestItem(t); if (it) out.push(it); }
  }
  return out;
}
export const REST_PILE_CHANCES = Object.freeze([[REST_ITEM.EmberJar, 6], [REST_ITEM.Tonic, 6], [REST_ITEM.Firewood, 4], [REST_ITEM.Candle, 2], [REST_ITEM.Salts, 2], [REST_ITEM.Draught, 2]]);
export const REST_FOE_CHANCES = Object.freeze([[REST_ITEM.EmberJar, 3], [REST_ITEM.Tonic, 3], [REST_ITEM.Candle, 1], [REST_ITEM.Salts, 1], [REST_ITEM.Draught, 1]]);
export const restLootChances = (chances, quarters = renownLootQuarters()) =>
  quarters === 4 ? chances : chances.map(([t, pct]) => [t, lootEased(0, pct, quarters)]);
// Every item draws its roll even at a zero chance, so the draw sequence never shifts.
export function rollRestLoot(items, chances, rolls = Math.random, { online = isOnlinePage() } = {}) {
  if (!Array.isArray(items) || !restItemsAvailable(online)) return items;
  for (const [t, pct] of chances) if (rolls() * 100 < pct) { const it = createRestItem(t); if (it) items.push(it); }
  return items;
}
export const isDeepPileKey = (key) => { const a = String(key ?? '').charCodeAt(0) - 64; return a >= 10 && a <= 15; };
// Install after the other loot subscribers so these draws never shift theirs.
export function installRestItemLoot() {
  registerTabledLootHandler('REST', ({ key, items, rolls, quarters }) => { if (isDeepPileKey(key)) rollRestLoot(items, restLootChances(REST_PILE_CHANCES, quarters), rolls); });
  registerEnemyLootExtra('REST', ({ items, rolls, quarters }) => { rollRestLoot(items, restLootChances(REST_FOE_CHANCES, quarters), rolls); });
}
