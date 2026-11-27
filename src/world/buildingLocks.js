import { BUILDING_TYPES } from './buildingNames.js';
import { isBunnyHall } from '../guilds/bunnyGuilds.js';
import { isShop } from '../trade/shopStock.js';
import { HOLIDAYS } from './holidays.js';
import { sharedClockOn } from './worldTick.js';
import { localizedText } from '../ui/textManager.js';

// closeHours 25 means never closes; open 0 with close 0 never opens, so a House1 stays locked as in classic.
export const OPEN_HOURS = Object.freeze([7, 8, 9, 8, 0, 9, 10, 10, 9, 6, 9, 11, 9, 9, 0, 0, 10, 0, 6, 6, 6, 6, 6, 6, 0]);
export const CLOSE_HOURS = Object.freeze([22, 16, 19, 15, 25, 21, 19, 20, 18, 23, 23, 23, 20, 20, 25, 25, 16, 0, 18, 18, 18, 18, 18, 18, 25]);

export function isBuildingOpen(buildingType, hour, opts = {}) {
  return buildingHoursState(buildingType, { ...opts, hour }).open;
}

export const buildingLockValue = (quality) => Math.trunc((quality ?? 0) / 2);

export function buildingIsUnlocked(building, {
  hour = 12, holidayId = -1, online = sharedClockOn(),
  isHouseOwned = null, isActiveQuestBuilding = null,
  guildForBuilding = null, ownsShip = false,
} = {}) {
  const type = building?.buildingType ?? BUILDING_TYPES.None;
  if (isHouseOwned?.(building?.buildingKey) ?? false) return true;
  if (isActiveQuestBuilding?.(building) ?? false) return true;
  if (type === BUILDING_TYPES.GuildHall) {
    const g = guildForBuilding?.(building?.factionId ?? 0);
    // Pass `online` through so an explicit value from the caller reaches this arm.
    return (g?.hallAccessAnytime ?? false) || isBuildingOpen(type, hour, { online });
  }
  if (isBunnyHall(building)) return isBuildingOpen(BUILDING_TYPES.GuildHall, hour, { online });
  if (type === BUILDING_TYPES.House2 && (building?.factionId ?? 0) !== 0) {
    const g = guildForBuilding?.(building.factionId);
    return g?.isMember ?? false;
  }
  if (type >= BUILDING_TYPES.House1 && type <= BUILDING_TYPES.House4) {
    return isBuildingOpen(type, hour);
  }
  if (isShop(type)) {
    return buildingHoursState(type, { hour, holidayId, online }).open;
  }
  if (type <= BUILDING_TYPES.Palace && type >= 0) {
    return isBuildingOpen(type, hour, { online });
  }
  if (type === BUILDING_TYPES.Ship && ownsShip) return true;
  return false;
}

export function buildingClosedText(buildingType, { subject = null } = {}) {
  const text = subject != null ? `${subject} is closed. Open from %d1:00 to %d2:00.`
    : buildingType === BUILDING_TYPES.GuildHall ? localizedText('guildClosed', 'Guild is closed. Open from %d1:00 to %d2:00.')
      : localizedText('storeClosed', 'Store is closed. Open from %d1:00 to %d2:00.');
  return text.replaceAll('%d1', String(OPEN_HOURS[buildingType])).replaceAll('%d2', String(CLOSE_HOURS[buildingType]));
}

export const LOCKED_EXTERIOR_DOOR_TEXT = 'Locked.';
export const lockedExteriorDoorText = () => localizedText('lockedExteriorDoor', LOCKED_EXTERIOR_DOOR_TEXT);

export const onlineReliefBuilding = (type) => isShop(type) || type === BUILDING_TYPES.GuildHall
  || type === BUILDING_TYPES.Bank || type === BUILDING_TYPES.Library || type === BUILDING_TYPES.Palace;

export const SHOP_STAFFING = Object.freeze({
  CLOSED: 'closed',
  CLASSIC: 'classic',
  ONLINE_SHIFT: 'online-shift',
});

export function classicBuildingOpen(buildingType, hour) {
  return (OPEN_HOURS[buildingType] ?? 0) <= hour && (CLOSE_HOURS[buildingType] ?? 25) > hour;
}

// `classicOpen` is the untouched Daggerfall answer and `open` the running world's; they differ only online, for a
// relieved building.
export function buildingHoursState(buildingType, {
  hour = 12,
  holidayId = -1,
  // Online means the shared clock is running, not an ?online URL with no clock installed.
  online = sharedClockOn(),
} = {}) {
  const type = buildingType ?? BUILDING_TYPES.None;
  const shop = isShop(type);
  const relieved = onlineReliefBuilding(type);
  // Suns Rest closes only shops, as in DFU; a guild hall stays open on the holiday.
  const holidayClosed = shop && holidayId === HOLIDAYS.Suns_Rest;
  const classicOpen = classicBuildingOpen(type, hour) && !holidayClosed;
  if (relieved && online && !classicOpen) {
    return { open: true, classicOpen: false, staffing: SHOP_STAFFING.ONLINE_SHIFT };
  }
  return {
    open: classicOpen,
    classicOpen,
    staffing: relieved ? (classicOpen ? SHOP_STAFFING.CLASSIC : SHOP_STAFFING.CLOSED) : null,
  };
}
