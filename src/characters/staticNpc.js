// Static NPC identity from DFU's StaticNPC.cs (MIT, Daggerfall Workshop): data for people in shops and halls.

import { srand } from '../formats/dfRandom.js';
import { fullName, monsterName, getNameBankOfRegion, BANK_TYPES, GENDERS } from './nameHelper.js';
import { RACES } from './races.js';
import { FACTION_TYPES } from '../formats/factionFile.js';
import { getLocalizedFactionName } from '../ui/textManager.js';

const _faceOverrides = new Map();
export function setFlatFaceOverride(archive, record, faceIndex) { if (faceIndex == null) _faceOverrides.delete(`${archive}:${record}`); else _faceOverrides.set(`${archive}:${record}`, faceIndex | 0); }
export const flatFaceOverride = (archive, record) => _faceOverrides.get(`${archive}:${record}`) ?? null;
export function _resetFlatFaceOverrides() { _faceOverrides.clear(); }

export const NPC_CONTEXT = Object.freeze({ Custom: 0, Dungeon: 1, Building: 2 });

export const ZERO_NPC_DATA = Object.freeze({
  hash: 0,
  flags: 0,
  factionID: 0,
  nameSeed: 0,
  gender: 0,
  race: 0,
  context: NPC_CONTEXT.Custom,
  mapID: 0,
  locationID: 0,
  buildingKey: 0,
  nameBank: 0,
  billboardArchiveIndex: 0,
  billboardRecordIndex: 0,
});

export const positionHash = (x, y, z) => ((x ^ (y << 2) ^ (z >> 2)) | 0);

export function staticNpcData(pn, {
  mapId = 0, locationIndex = 0, buildingKey = 0,
  getFaction = null, raceOfCurrentRegion = null,
  context = NPC_CONTEXT.Building,
} = {}) {
  const factionID = pn.factionID ?? 0;
  return {
    ...ZERO_NPC_DATA,
    hash: positionHash(pn.rawX ?? 0, pn.rawY ?? 0, pn.rawZ ?? 0),
    flags: pn.flags ?? 0,
    factionID,
    billboardArchiveIndex: pn.textureArchive ?? 0,
    billboardRecordIndex: pn.textureRecord ?? 0,
    nameSeed: (((pn.position ?? 0) ^ (buildingKey + locationIndex)) | 0),
    gender: ((pn.flags ?? 0) & 32) === 32 ? GENDERS.Female : GENDERS.Male,
    race: raceFromFaction(factionID, getFaction, raceOfCurrentRegion ?? (() => 0)),
    context,
    buildingKey,
    mapID: mapId,
    ...(Number.isInteger(pn.flatNameBank) ? { nameBank: pn.flatNameBank, nameBankFixed: true } : {}),
  };
}

/**
 * @param {number} flags
 * @param {?object} flatData
 */
export function exteriorNpcFlags(flags, flatData) {
  if (!flatData) return flags;
  return String(flatData.gender ?? '').includes('2') ? (flags | 32) : (flags & 223);
}

export function layoutNpcData({
  hash, gender, factionID = 0, nameSeed = -1,
  getFaction = null, raceOfCurrentRegion = null, ...rest
}) {
  return {
    ...ZERO_NPC_DATA,
    hash,
    flags: gender === GENDERS.Male ? 0 : 32,
    factionID,
    nameSeed: nameSeed === -1 ? hash : nameSeed,
    gender,
    race: raceFromFaction(factionID, getFaction, raceOfCurrentRegion ?? (() => 0)),
    context: NPC_CONTEXT.Custom,
    ...rest,
  };
}

/**
 * @param {number} factionId
 * @param {function(number):object|null} getFaction
 * @param {function():number} raceOfCurrentRegion
 */
export function raceFromFaction(factionId, getFaction, raceOfCurrentRegion) {
  if (factionId !== 0) {
    const fd = getFaction?.(factionId) ?? null;
    const race = raceFromFactionRace(fd?.race ?? 0);
    if (race !== null) return race;
  }
  return raceOfCurrentRegion();
}

export function factionRaceFromRace(race) {
  switch (race) {
    case RACES.Nord: return 0;
    case RACES.Khajiit: return 1;
    case RACES.Redguard: return 2;
    case RACES.Breton: return 3;
    case RACES.Argonian: return 4;
    case RACES.WoodElf: return 5;
    case RACES.HighElf: return 6;
    case RACES.DarkElf: return 7;
    default: return -1;
  }
}

export function raceFromFactionRace(factionRace) {
  switch (factionRace) {
    case 0: return RACES.Nord;
    case 1: return RACES.Khajiit;
    case 2: return RACES.Redguard;
    case 3: return RACES.Breton;
    case 4: return RACES.Argonian;
    case 5: return RACES.WoodElf;
    case 6: return RACES.HighElf;
    case 7: return RACES.DarkElf;
    default: return null;
  }
}

/**
 * @param {object} data
 * @param {object} [deps]
 * @param {function(number):object|null} [deps.getFaction]
 * @param {number} [deps.nameBank]
 */
export function staticNpcName(data, { getFaction = null, nameBank = null } = {}) {
  const fd = getFaction?.(data.factionID) ?? null;
  if (fd && fd.type === FACTION_TYPES.Individual) return fd.name;
  srand(data.nameSeed);
  const bank = data.nameBankFixed ? data.nameBank : nameBank ?? BANK_TYPES.Breton;
  const drawn = bank >= BANK_TYPES.Monster1 ? monsterName(data.gender, Math.random, bank) : fullName(bank, data.gender);
  return data.personName || drawn;
}

export function staticNpcShownName(data, deps = {}) {
  const name = staticNpcName(data, deps);
  const fd = deps.getFaction?.(data.factionID) ?? null;
  return fd && fd.type === FACTION_TYPES.Individual ? getLocalizedFactionName(data.factionID, name) : name;
}

const CHILD_NPC_TEXTURES = Object.freeze({
  181: Object.freeze(new Set([3])),
  182: Object.freeze(new Set([4, 5, 6, 18, 36, 37, 38, 42, 43, 52, 53])),
  184: Object.freeze(new Set([15])),
  186: Object.freeze(new Set([4, 5, 6, 7, 19, 37, 38, 39, 43, 44, 53, 54])),
  197: Object.freeze(new Set([3])),
  334: Object.freeze(new Set([2, 3, 6, 9, 12])),
  346: Object.freeze(new Set([2, 3, 12, 15, 16, 18])),
  357: Object.freeze(new Set([5, 6, 7, 8])),
});
export const isChildNPCTexture = (archive, record) => !!CHILD_NPC_TEXTURES[archive]?.has(record);

export const CHILDREN_FACTION_ID = 514;
export function isChildNPCData(data) {
  if (!data) return false;
  return isChildNPCTexture(data.billboardArchiveIndex, data.billboardRecordIndex)
    || data.factionID === CHILDREN_FACTION_ID;
}

export { getNameBankOfRegion };
