// @ts-check
import { KT_ARRIVE, deckToDungeon } from '../../net/ketch/ketchDeck.js';
import { ketchRoomKey } from '../../net/ketch/ketchLaw.js';
import { KT_WORDS } from '../../systems/ketch/ketchWords.js';

// Each made level needs its own location id and block index; the other made levels use 0x7ffff000 to 0x7ffff300 and
// 0x7ffff500.
export const KT_SHIP_BLOCK = 'SKYKETCH.RDB';
export const KT_SHIP_BLOCK_INDEX = 900400;
export const KT_SHIP_LOCATION_ID = 0x7ffff400;
// Classic Daggerfall units per meter, the inverse of MeshReader.GlobalScale.
const UNITS_PER_M = 40;

/** @param {{ n: number, owner: string, regionIndex?: number, regionName?: string, climate?: { worldClimate: number, climateType: number } }} o */
export function ketchShipLocation({ n, owner, regionIndex = 17, regionName = 'Daggerfall', climate = { worldClimate: 231, climateType: 2 } }) {
  const key = ketchRoomKey(n, owner);
  return {
    name: KT_WORDS.name, regionIndex, regionName, locationIndex: -1, hasDungeon: true,
    climate: { worldClimate: climate.worldClimate, climateType: climate.climateType },
    mapTableData: { mapId: 0, locationType: -1, dungeonType: 0, longitude: 0, latitude: 0 },
    exterior: { exteriorData: { locationId: KT_SHIP_LOCATION_ID } },
    dungeon: {
      recordElement: { header: { locationId: KT_SHIP_LOCATION_ID, unknown: 0 } },
      blocks: [{ x: 0, z: 0, blockName: KT_SHIP_BLOCK, isStartingBlock: true, blockIndex: 0, blockNumber: 0, blockNumberStartIndexBitfield: 0 }],
    },
    ketch: key ? { n, owner, key } : null,
  };
}

export const isKetchShip = (loc) => typeof loc?.ketch?.key === 'string' && loc?.dungeon?.recordElement?.header?.locationId === KT_SHIP_LOCATION_ID;

// rdbLayout reads the start marker's soundIndex 0 as no water and its magnitude 0 as no castle.
export function ketchShipBlock() {
  const [x, , z] = deckToDungeon(KT_ARRIVE.x, KT_ARRIVE.y, KT_ARRIVE.z);
  const marker = {
    type: 0x03, position: 1, index: 0,
    xPos: Math.round(x * UNITS_PER_M), yPos: 0, zPos: Math.round(z * UNITS_PER_M),
    resources: { flatResource: { textureArchive: 199, textureRecord: 10, flags: 0, magnitude: 0, soundIndex: 0, factionOrMobileId: 0, nextObjectOffset: -1, action: 0, position: 0 } },
  };
  return { name: KT_SHIP_BLOCK, position: 0, rdbBlock: { modelReferenceList: [], objectRootList: [{ rdbObjects: [marker] }] } };
}

export function ketchShipBlocks(real) {
  const block = ketchShipBlock();
  return {
    getBlockIndex: (name) => (name === KT_SHIP_BLOCK ? KT_SHIP_BLOCK_INDEX : real ? real.getBlockIndex(name) : -1),
    getBlock: (i) => (i === KT_SHIP_BLOCK_INDEX ? block : real ? real.getBlock(i) : null),
  };
}

export const KT_AIR_FOG = Object.freeze({ mode: 'exp', density: 0.0016, color: Object.freeze([0.62, 0.7, 0.8]) });
export const KT_BELOW_FOG = Object.freeze({ mode: 'exp', density: 0.012, color: Object.freeze([0.16, 0.12, 0.08]) });
export const KT_LIGHT = Object.freeze({
  noon: Object.freeze([0.52, 0.54, 0.58]),
  sun: Object.freeze([1.0, 0.95, 0.84]), sunScale: 0.8,
});
