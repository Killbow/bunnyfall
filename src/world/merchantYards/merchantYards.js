// @ts-check
import { LOCATION_TYPES } from '../../formats/mapsFile.js';
import { getNameBankOfRegion, GENDERS } from '../../characters/nameHelper.js';
import { residentName } from '../../systems/livingWorld/census.js';
import { setItemFields, mintCondition, TRANSPORT_HORSE } from '../../items/itemTemplates.js';
import { WAGON_KIND_ORDER, newWagonItem, isWagonItem } from '../../travel/wagonKinds.js';
import { birthHorses } from '../../travel/horseCoats.js';
import { horseBornStats, steedValue } from '../../travel/steedCare.js';
import { UPKEEP_ITEM, newUpkeepItem, upkeepItemsAvailable } from '../../systems/upkeep/upkeepItemRows.js';
import { WORKBENCH_FEE } from '../../net/professionLaw.js';

export const YARD_KIND_ORDER = Object.freeze(['stable', 'transport']);
export const CRAFT_YARD_ORDER = Object.freeze(['carpenter']);
export const ALL_YARD_KINDS = Object.freeze([...YARD_KIND_ORDER, ...CRAFT_YARD_ORDER]);
export const YARD_KINDS = Object.freeze({
  stable: Object.freeze({ key: 'stable', title: 'Stables', sign: 'STABLES', trade: 'Horses bought and sold', keeper: 'Stablemaster', seed: 0x57ab1e }),
  transport: Object.freeze({ key: 'transport', title: 'Wagon Yard', sign: 'WAGONS', trade: 'Carts and wagons bought and sold', keeper: 'Wagonwright', seed: 0x3a90e5 }),
  carpenter: Object.freeze({ key: 'carpenter', title: 'Joinery', sign: 'JOINERY', trade: `Carpentry at the workbench: a tenth of what you make, at most ${WORKBENCH_FEE} gold`, keeper: 'Carpenter', seed: 0xca4be7 }),
});
export const validYardKind = (k) => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(YARD_KINDS, k) ? k : null);

export const YARD_QUALITY = 10;
// Every yard prices at the neutral index both ways, because a yard never sells out and a regional index would let a
// wagon bought cheap sell back dear without limit.
export const YARD_PRICE_INDEX = 1000;

export const YARD_TOWN_TYPES = Object.freeze([LOCATION_TYPES.TownCity, LOCATION_TYPES.TownHamlet]);
export const isYardTown = (loc) => YARD_TOWN_TYPES.includes(loc?.mapTableData?.locationType);

export const STABLE_HORSES_OFFERED = 3;
export const YARD_OATS_STACK = 20;
export const YARD_KITS_STACK = 5;
const mix3 = (a, b, c) => {
  let h = Math.imul((a >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b >>> 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul((c >>> 0) + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
};
const stream = (seed) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/**
 * @param {number} mapId
 * @param {number} day
 * @param {{ owned?: Set<number>|number[], priced?: boolean }} [o]
 */
export function stableHorses(mapId, day, { owned = [], priced = false } = {}) {
  const have = new Set(owned);
  const out = [];
  for (let i = 0; i < STABLE_HORSES_OFFERED; i++) {
    const h = mintCondition(setItemFields({ group: 'Transportation', templateIndex: TRANSPORT_HORSE }));
    birthHorses([h], stream(mix3(mapId | 0, day | 0, i)));
    if (have.has(h.horseSeed)) continue;
    if (priced) h.value = steedValue(horseBornStats(h));
    out.push(h);
  }
  return out;
}
/**
 * @param {string} kind
 * @param {{ mapId?: number, day?: number, online?: boolean, owned?: Set<number>|number[], priced?: boolean }} [o]
 */
export function yardStock(kind, { mapId = 0, day = 0, online = false, owned = [], priced = false } = {}) {
  const mint = (it) => mintCondition(setItemFields(it));
  const upkeep = upkeepItemsAvailable(online);
  if (validYardKind(kind) === 'stable') return [...stableHorses(mapId, day, { owned, priced }), ...(upkeep ? [mint(newUpkeepItem(UPKEEP_ITEM.Oats, YARD_OATS_STACK))] : [])];
  if (validYardKind(kind) === 'transport') return [...WAGON_KIND_ORDER.map((k) => mint(newWagonItem(k))), ...(upkeep ? [mint(newUpkeepItem(UPKEEP_ITEM.WagonKit, YARD_KITS_STACK))] : [])];
  return [];
}
export function yardBuysItem(kind, item) {
  if (!item) return false;
  if (validYardKind(kind) === 'stable') return item.templateIndex === TRANSPORT_HORSE;
  if (validYardKind(kind) === 'transport') return isWagonItem(item);
  return false;
}

export const townSeed = (mapId, salt) => (Math.imul((mapId >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ (salt >>> 0)) >>> 0;
export const yardSeed = (mapId, kind) => townSeed(mapId, YARD_KINDS[validYardKind(kind) ?? 'stable'].seed);

/**
 * @param {number} seed
 * @param {number} regionIndex
 */
export function townKeeper(seed, regionIndex) {
  const female = ((seed >>> 7) & 1) === 1;
  const gender = female ? GENDERS.Female : GENDERS.Male;
  const name = residentName(seed, getNameBankOfRegion(Number.isInteger(regionIndex) ? regionIndex : -1), gender);
  return { name, gender, sex: female ? 'female' : 'male', variant: (seed >>> 11) & 3 };
}
/**
 * @param {number} mapId
 * @param {string} kind
 * @param {number} regionIndex
 */
export const yardKeeper = (mapId, kind, regionIndex) => townKeeper(yardSeed(mapId, kind), regionIndex);

export function namedAfter(keeperName, title) {
  const parts = String(keeperName ?? '').trim().split(/\s+/).filter(Boolean);
  const who = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? '';
  return who ? `${who}'s ${title}` : `The ${title}`;
}
export const yardName = (kind, keeperName) => namedAfter(keeperName, YARD_KINDS[validYardKind(kind) ?? 'stable'].title);

export function yardCounter(kind, regionIndex, name = '') {
  const k = validYardKind(kind) ?? 'stable';
  return {
    buildingType: `yard:${k}`, quality: YARD_QUALITY, regionIndex: regionIndex ?? 0, buildingKey: 0, yard: k,
    name: (typeof name === 'string' && name.trim()) || `The ${YARD_KINDS[k].title}`, priceIndex: YARD_PRICE_INDEX, noSteal: YARD_TEXT.steal,
    accepts: (/** @type {any} */ it) => yardBuysItem(k, it),
  };
}

export const YARD_TEXT = Object.freeze({
  steal: 'The keeper never takes an eye off the stock.',
  ask: (keeper) => `Ask the ${keeper.toLowerCase()} to buy.`,
  shut: 'The yard\'s counter will not open here.',
});
export const YARD_ROWS = Object.freeze([
  Object.freeze({ id: 'buy', label: 'Buy' }),
  Object.freeze({ id: 'sell', label: 'Sell' }),
]);
export const YARD_MEND_ROW = Object.freeze({ id: 'mend', label: 'Mend' });
export const YARD_BENCH = Object.freeze({ kind: 'shop', fee: WORKBENCH_FEE, who: 'carpenter', yard: true });
export const YARD_BENCH_ROW = Object.freeze({ id: 'bench', label: 'Workbench' });
export const yardRowsFor = (kind) => (validYardKind(kind) === 'carpenter' ? [YARD_BENCH_ROW]
  : validYardKind(kind) === 'transport' ? [...YARD_ROWS, YARD_MEND_ROW] : [...YARD_ROWS]);
export const CARPENTER_STEAL_TEXT = 'The carpenter never takes an eye off the tools.';

// Yard keys start at `YARD_KEY_BASE` (1 << 25), above every building key and `BUILDING_KEY_0` (1 << 24), so no
// Daggerfall building can hold one.
export const YARD_KEY_BASE = 1 << 25;
// Must match the indexes in `FOUND_KIND_ORDER` (portPlaces.js); the joinery slot follows the four port places, so
// keys saved in discovery never point to another place.
export const YARD_KEY_SLOT = Object.freeze({ stable: 0, transport: 1, carpenter: 6 });
export const yardBuildingKey = (kind) => YARD_KEY_BASE + YARD_KEY_SLOT[validYardKind(kind) ?? 'stable'];
export const YARD_TALK_GROUPS = Object.freeze({ stable: 'Stables', transport: 'Wagon yards', carpenter: 'Carpenters' });
/** @param {Array<any>|null|undefined} sites */
export function yardDirectoryRows(sites) {
  const out = [];
  for (const s of sites ?? []) {
    const kind = validYardKind(s?.kind);
    if (!kind || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    out.push({
      name: yardName(kind, s.keeper?.name), buildingType: `yard:${kind}`, factionId: 0, quality: YARD_QUALITY,
      position: [s.x, 0, s.z], buildingKey: yardBuildingKey(kind), yard: kind,
    });
  }
  return out;
}
