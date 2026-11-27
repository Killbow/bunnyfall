import { GLOBAL_SCALE } from '../world/meshReader.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { isShop } from '../trade/shopStock.js';
import { isBuildingOpen } from '../world/buildingLocks.js';
import { isBunnyHall } from '../guilds/bunnyGuilds.js';

/**
 * @param recordData
 * @returns {Array<{x,y,z,textureArchive,textureRecord,factionID,flags, rawX,rawY,rawZ}>}
 */
export function collectInteriorPeople(recordData) {
  const out = [];
  for (const obj of recordData.interior.blockPeopleRecords) {
    out.push({
      x: obj.xPos * GLOBAL_SCALE,
      y: -obj.yPos * GLOBAL_SCALE,
      z: obj.zPos * GLOBAL_SCALE,
      textureArchive: obj.textureArchive,
      textureRecord: obj.textureRecord,
      factionID: obj.factionID,
      flags: obj.flags,
      rawX: obj.xPos, rawY: obj.yPos, rawZ: obj.zPos,
      position: obj.position,
    });
  }
  return out;
}

/**
 * @param building
 * @param ctx.hour
 * @param ctx.insideOpenShop
 * @param ctx.isHouseOwned
 * @param ctx.guildForBuilding
 * @returns
 */
export function peopleAreVisible(building, {
  hour = 12, insideOpenShop = false,
  isHouseOwned = null, guildForBuilding = null,
} = {}) {
  const type = isBunnyHall(building) ? BUILDING_TYPES.GuildHall : building?.buildingType ?? BUILDING_TYPES.None;
  const factionId = building?.factionId ?? 0;
  const g = guildForBuilding?.(factionId) ?? null;

  if (isHouseOwned?.(building?.buildingKey) ?? false) return false;

  if (isShop(type)) return insideOpenShop;

  const isTGDBHouseMember = type === BUILDING_TYPES.House2
    && factionId !== 0 && (g?.isMember ?? false);
  if (type <= BUILDING_TYPES.House4
    && !isBuildingOpen(type, hour)
    && !(type === BUILDING_TYPES.GuildHall && (g?.hallAccessAnytime ?? false))
    && !isTGDBHouseMember) return false;

  return true;
}

/**
 * @param buildingType
 * @param ctx.hour
 * @param ctx.insideOpenShop
 */
export function updateNpcPresence(buildingType, { hour = 12, insideOpenShop = false } = {}) {
  const type = buildingType ?? BUILDING_TYPES.None;
  const gate = (isShop(type) && !insideOpenShop)
    || (!isShop(type) && type <= BUILDING_TYPES.House4 && type !== BUILDING_TYPES.HouseForSale);
  if (!gate) return false;
  return isBuildingOpen(type, hour);
}
