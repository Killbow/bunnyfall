// @ts-check
// BUNNY-GUILDS (Phase 0a, 2026-10-30, the owner: "start on phase 0"): BUNNYFALL'S OWN GUILDS - who they are, and which
// house in a town is each one's hall.
//
// Seven guilds Daggerfall never had, online only (offline stays classic Daggerfall). Each is a faction of its own,
// numbered past every FACTION.TXT id so no record of the game's can be taken for one.
//
// A HALL IS A CONVERTED HOUSE (the owner's call): Daggerfall's towns have no building type for these guilds, so each
// town gives one of its ordinary houses (House1-House4, no faction, a room inside) to each guild it is big enough for,
// the Adventurers Guild first. The pick is the town's own: the same houses, in the same order, seeded by the town, so
// every client names the same door. A town keeps HOUSES_LEFT houses at least for its people, so a hamlet holds fewer
// guilds, or none.
//
// The hall is stamped where Daggerfall stamps a guild on a building: its record's `factionId`, at the one merge every
// building list is drawn from (talkTopics.js drawNamedBuildings). Daggerfall does the same for the Thieves Guild's and
// the Dark Brotherhood's hideouts, which are ordinary House2 residences carrying their guild's faction.
//
// Pure: no DOM, no network. `isOnlinePage` is read once a call, from the page's own address.

import { isOnlinePage } from '../online/onlineLane.js';
import { t } from '../textManager.js';

/** The first of Bunnyfall's faction ids, past every FACTION.TXT id. */
export const BUNNY_FACTION_BASE = 2001;
/** Houses a town keeps for its people after its guilds take theirs. */
export const HOUSES_LEFT = 6;

/**
 * The guilds, in the order a town gives out its houses. `ranks` are the titles of ranks 0 to 9, lowest first (ranks 8
 * and 9 are a chapter's seats once the guild joins the Chapters).
 */
export const BUNNY_GUILDS = Object.freeze([
  Object.freeze({ key: 'adventurers', factionId: 2001, get name() { return t('bguild.adventurers.name', 'Adventurers Guild'); },
    ranks: Object.freeze(['Wanderer', 'Sellsword', 'Pathfinder', 'Delver', 'Trailblazer', 'Veteran', 'Vanguard', 'Champion', 'Warden', 'Guildmaster']) }),
  Object.freeze({ key: 'bards', factionId: 2002, get name() { return t('bguild.bards.name', "Bards' College"); },
    ranks: Object.freeze(['Busker', 'Minstrel', 'Troubadour', 'Balladeer', 'Lyricist', 'Skald', 'Virtuoso', 'Maestro', 'Loremaster', 'Archbard']) }),
  Object.freeze({ key: 'cartographers', factionId: 2003, get name() { return t('bguild.cartographers.name', "Cartographers' Society"); },
    ranks: Object.freeze(['Scribe', 'Surveyor', 'Draughtsman', 'Wayfinder', 'Chartmaker', 'Navigator', 'Geographer', 'Explorer', 'Master Cartographer', 'Grand Cartographer']) }),
  Object.freeze({ key: 'merchants', factionId: 2004, get name() { return t('bguild.merchants.name', "Merchants' League"); },
    ranks: Object.freeze(['Peddler', 'Hawker', 'Trader', 'Broker', 'Factor', 'Merchant', 'Financier', 'Magnate', 'Trade Lord', 'Guildmaster']) }),
  Object.freeze({ key: 'hunters', factionId: 2005, get name() { return t('bguild.hunters.name', "Hunters' Lodge"); },
    ranks: Object.freeze(['Beater', 'Tracker', 'Trapper', 'Stalker', 'Hunter', 'Huntsman', 'Slayer', 'Beastmaster', 'Master of the Hunt', 'Lodgemaster']) }),
  Object.freeze({ key: 'apothecaries', factionId: 2006, get name() { return t('bguild.apothecaries.name', "Apothecaries' Guild"); },
    ranks: Object.freeze(['Herb Gatherer', 'Mortar Hand', 'Mixer', 'Brewer', 'Distiller', 'Apothecary', 'Physician', 'Alchemist', 'Master Apothecary', 'Grand Apothecary']) }),
  Object.freeze({ key: 'artisans', factionId: 2007, get name() { return t('bguild.artisans.name', "Artisans' Guild"); },
    ranks: Object.freeze(['Apprentice', 'Journeyman', 'Craftsman', 'Fabricator', 'Artificer', 'Artisan', 'Master Craftsman', 'Mastersmith', 'Grandmaster', 'Guildmaster']) }),
]);

const BY_FACTION = new Map(BUNNY_GUILDS.map((g) => [g.factionId, g]));
const BY_KEY = new Map(BUNNY_GUILDS.map((g) => [g.key, g]));

/** The guild a faction id is, or null. */
export const bunnyGuildOfFaction = (/** @type {unknown} */ factionId) => BY_FACTION.get(/** @type {number} */ (factionId)) ?? null;
/** The guild of a key ('adventurers'), or null. */
export const bunnyGuildOfKey = (/** @type {unknown} */ key) => BY_KEY.get(/** @type {string} */ (key)) ?? null;
/** Whether a building is one of these guilds' halls - its record carries a Bunnyfall faction. */
export const isBunnyHall = (/** @type {{ factionId?: number } | null | undefined} */ bd) => BY_FACTION.has(bd?.factionId ?? 0);

/** Whether the guilds stand on this page: online only. */
export const bunnyGuildsOn = (search = undefined) => isOnlinePage(search);

/** DFLocation.BuildingTypes House1-House4 (world/buildingNames.js BUILDING_TYPES; written here because that module
 *  names halls through this one). */
const HOUSE1 = 17, HOUSE4 = 20;
/** A house a hall can be: a residence with no guild of its own already, and a room inside. */
const hallCandidate = (/** @type {{ buildingType: number, factionId?: number }} */ d, /** @type {boolean} */ hasRoom) =>
  hasRoom && d.buildingType >= HOUSE1 && d.buildingType <= HOUSE4 && (d.factionId ?? 0) === 0;

/** A small, steady hash (FNV-1a over the numbers), so the pick is the same on every client. */
function seedOf(/** @type {number[]} */ nums) {
  let h = 0x811c9dc5;
  for (const n of nums) {
    let v = n >>> 0;
    for (let i = 0; i < 4; i++) { h ^= v & 0xff; h = Math.imul(h, 0x01000193) >>> 0; v >>>= 8; }
  }
  return h >>> 0;
}

/**
 * Which guild each candidate house gets, as `buildingKey -> factionId`. `houses` is the town's candidate houses, each
 * `{ buildingKey }`, in any order; the town is named by `locationIndex` and its own houses, so two towns with the same
 * index in different regions still differ.
 *
 * @param {{ buildingKey: number }[]} houses
 * @param {number} locationIndex
 * @returns {Map<number, number>}
 */
export function bunnyHallPick(houses, locationIndex) {
  const out = new Map();
  const free = [...new Set(houses.map((h) => h.buildingKey))].sort((a, b) => a - b);
  const room = free.length - HOUSES_LEFT;
  if (room <= 0) return out;
  const seed = seedOf([locationIndex, free.length, free[0], free[free.length - 1]]);
  for (let i = 0; i < BUNNY_GUILDS.length && i < room; i++) {
    const at = seedOf([seed, BUNNY_GUILDS[i].factionId]) % free.length;
    out.set(free[at], BUNNY_GUILDS[i].factionId);
    free.splice(at, 1);
  }
  return out;
}

/**
 * Stamp the halls onto a location's merged building lists (talkTopics.js drawNamedBuildings's `out`, one list per block
 * instance), in place. Online only; offline the lists are left as Daggerfall drew them.
 *
 * @param {Map<any, Array<{ buildingType: number, factionId?: number }>>} merged block instance -> its merged list
 * @param {Array<{ x?: number, y?: number, dfBlock: any }>} blocks the location's block instances, in order
 * @param {object} opts
 * @param {number} [opts.locationIndex]
 * @param {(block: any, recordIndex: number) => number} opts.keyOf the building key of a block's record
 * @param {(block: any, recordIndex: number) => boolean} opts.hasRoom whether that record has a room inside
 * @param {(block: any) => number} opts.countOf how many records of the block are buildings
 * @param {string} [opts.search] the page's query, for tests
 */
export function stampBunnyHalls(merged, blocks, { locationIndex = 0, keyOf, hasRoom, countOf, search = undefined }) {
  if (!bunnyGuildsOn(search)) return 0;
  /** @type {{ buildingKey: number, rec: { factionId?: number } }[]} */
  const houses = [];
  for (const b of blocks) {
    const list = merged.get(b) ?? [];
    const count = Math.min(list.length, countOf(b));
    for (let i = 0; i < count; i++) {
      const d = list[i];
      if (d && hallCandidate(d, hasRoom(b, i))) houses.push({ buildingKey: keyOf(b, i), rec: d });
    }
  }
  const pick = bunnyHallPick(houses, locationIndex);
  for (const h of houses) {
    const f = pick.get(h.buildingKey);
    if (f) h.rec.factionId = f;
  }
  return pick.size;
}
