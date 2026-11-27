
import { modSetting, latchModLoaded, modLatchedOn } from '../mods/modSettings.js';
import { registerCustomFaction } from '../formats/factionFile.js';
import { registerMerchantService } from '../guilds/guildServices.js';
import { LOCATION_TYPES } from '../formats/mapsFile.js';
import { CAPITAL_MAP_IDS, LARGE_DOCK_MAP_IDS, DOCK_PIXEL_IDS } from './immersiveTravelTables.js';
import { setFlatFaceOverride } from '../characters/staticNpc.js';
import { noteFirstUse } from '../ui/tutorials.js';

export { CAPITAL_MAP_IDS, LARGE_DOCK_MAP_IDS, DOCK_PIXEL_IDS };

export const IMMERSIVE_TRAVEL_VENDOR = 'immersive-travel';

export const CARRIAGE_DRIVERS_FACTION_ID = 8642;
export const SAILORS_FACTION_ID = 8643;
export const IT_FACTIONS = Object.freeze([
  Object.freeze({ id: CARRIAGE_DRIVERS_FACTION_ID, parent: 0, type: 15, name: 'Carriage Drivers', summon: -1, region: -1, power: 100, face: -1, race: -1, sgroup: 1, ggroup: 16 }),
  Object.freeze({ id: SAILORS_FACTION_ID, parent: CARRIAGE_DRIVERS_FACTION_ID, type: 15, name: 'Sailors', summon: -1, region: -1, power: 100, face: -1, race: -1, sgroup: 1, ggroup: 16 }),
]);
export const IT_SERVICE_LABEL = 'Fast Travel';

export const IT_TEXT = Object.freeze({
  capitalOnly: 'To reach that location, you must travel to the capital of that region and take a carriage from there.',
  regionLocked: 'This carriage won\'t travel outside the region. Find a carriage in the capital or travel by sea.',
  wrongType: 'The driver won\'t take you to this type of location.',
  smallBoat: 'This small boat will only take you to locations in the same region. Travel to a major port to find a larger ship.',
  noDock: 'That location doesn\'t have a suitable dock.',
  mustTakeCarriage: 'You must take a carriage to initiate fast travel. Carriage drivers are stationed outside the gates of large cities.',
  cannotTravelType: 'You cannot travel to this type of location.',
  mustFindShip: 'You must find a ship to initiate ship travel. Ship captains can be found on docks along the coast.',
  cannotDisableShip: 'Cannot disable ship travel when travelling with a ship captain.',
  noInnsAtSea: 'There are no inns in the middle of the sea.',
  carriageNoReckless: 'This carriage rides only cautiously - the driver takes no reckless road from outside the gates.',
  carriageNoCampOut: 'This carriage rests only at inns. It will not camp out beyond the city wall.'
});

export function readImmersiveTravelSettings(get = modSetting) {
  const v = (k) => get(IMMERSIVE_TRAVEL_VENDOR, k);
  return {
    enabled: v('Enabled') === true,
    disableNormalTravel: v('General.DisableNormalTravel') === true,
    dailyCarriageFee: v('General.DailyCarriageFee') | 0,
    clearerMapDots: v('General.ClearerMapDots') === true,
    drawRoads: v('General.DrawRoads') === true,
    drawTracks: v('General.DrawTracks') === true,
    regionLockedCarriages: v('General.RegionLockedCarriages') === true,
    disableShipTravelOutsideDocks: v('ShipTravel.DisableShipTravelOutsideDocks') === true,
    dailyShipCost: v('ShipTravel.DailyShipCost') | 0,
    dailyCaptainFee: v('ShipTravel.DailyCaptainFee') | 0,
    limitedRangeInSmallDocks: v('ShipTravel.LimitedRangeInSmallDocks') === true,
    showLargerDocks: v('ShipTravel.ShowLargerDocks') === true,
    showOnlyDocks: v('ShipTravel.ShowOnlyDocks') === true,
    basicRoads: get('roads-hazelnut', 'Enabled') === true,
    allowed: Object.freeze({
      cities: v('AllowedDestinations.Cities') === true,
      covens: v('AllowedDestinations.Covens') === true,
      dungeons: v('AllowedDestinations.Dungeons') === true,
      graveyards: v('AllowedDestinations.Graveyards') === true,
      farms: v('AllowedDestinations.Farms') === true,
      hamlets: v('AllowedDestinations.Hamlets') === true,
      homes: v('AllowedDestinations.Homes') === true,
      temples: v('AllowedDestinations.Temples') === true,
      taverns: v('AllowedDestinations.Taverns') === true,
      villages: v('AllowedDestinations.Villages') === true,
    }),
  };
}

const T = LOCATION_TYPES;

// The three home types check the Dungeons setting, as the mod does, so no branch reads the Homes setting.
export function isDestinationValid(locationType, allowed) {
  const a = allowed ?? {};
  if (locationType === T.Coven && a.covens) return true;
  if ((locationType === T.DungeonKeep || locationType === T.DungeonLabyrinth || locationType === T.DungeonRuin) && a.dungeons) return true;
  if (locationType === T.Graveyard && a.graveyards) return true;
  if (locationType === T.HomeFarms && a.farms) return true;
  if ((locationType === T.HomePoor || locationType === T.HomeWealthy || locationType === T.HomeYourShips) && a.dungeons) return true;
  if ((locationType === T.ReligionCult || locationType === T.ReligionTemple) && a.temples) return true;
  if (locationType === T.Tavern && a.taverns) return true;
  if (locationType === T.TownCity && a.cities) return true;
  if (locationType === T.TownHamlet && a.hamlets) return true;
  if (locationType === T.TownVillage) return !!a.villages;
  return false;
}

// The mod checks (x, y + 1) twice and never the player pixel, then the other neighbors in order. Region 0 never
// matches and region 31 (the sea coast) is skipped.
export function borderingRegionIndex(x, y, politicAt) {
  for (const [px, py] of [[x, y + 1], [x, y + 1], [x + 1, y], [x, y - 1], [x - 1, y]]) {
    const r = (politicAt(px, py) | 0) - 128;
    if (r === 31) continue;
    if (r > 0) return r;
  }
  return -1;
}

const PIXEL_MASK = 0xfffff;
export const isCapital = (mapId) => CAPITAL_MAP_IDS.some((c) => (c & PIXEL_MASK) === ((mapId | 0) & PIXEL_MASK));

export function carriageRefusal(settings, { here, dest, politicAt }) {
  if (!isDestinationValid(dest.locationType, settings.allowed)) return 'wrongType';
  if (!settings.regionLockedCarriages) return null;
  const border = borderingRegionIndex(here.x, here.y, politicAt);
  const fromCapital = isCapital(here.mapId ?? 0);
  if (fromCapital && isCapital(dest.mapId)) return null;
  if (border === dest.regionIndex) return null;
  return fromCapital ? 'capitalOnly' : 'regionLocked';
}

export const carriageLocationLarge = (locationType, settings) =>
  locationType === T.TownCity || locationType === T.TownHamlet || !settings?.clearerMapDots;

// The ship toggle bills sea days with no ocean check, as the mod does, so a land trip with the toggle on pays one
// sea day.
export function carriageTripCost(minutes, oceanPixels, { sleepModeInn = false, hasShip = false, travelShip = false, freeTavernRooms = false } = {}, settings) {
  const hours = Math.trunc(((minutes | 0) + 59) / 60);
  const ocean = oceanPixels | 0;
  let piecesCost = 0;
  if (sleepModeInn && !freeTavernRooms) {
    piecesCost = 5 * Math.trunc((hours - ocean) / 24);
    if (piecesCost < 0) piecesCost = 0;
    piecesCost += 5;
  }
  const fee = settings?.dailyCarriageFee | 0;
  let totalCost = piecesCost + fee * Math.trunc((hours - ocean) / 24) + fee;
  if (travelShip) {
    const seaDays = Math.trunc(ocean / 24) + 1;
    if (!hasShip) totalCost += (settings?.dailyShipCost | 0) * seaDays;
    totalCost += (settings?.dailyCaptainFee | 0) * seaDays;
  }
  if (totalCost < 0) totalCost = 0;
  return { piecesCost, totalCost };
}

const DOCKS = new Set(DOCK_PIXEL_IDS);
// Dock table entries are pixel ids (y * 1000 + x), so only the map id is masked and `nearDock` steps one row with
// 1000.
export const hasDock = (mapId) => DOCKS.has((mapId | 0) & PIXEL_MASK);
export function nearDock(mapId) {
  const id = (mapId | 0) & PIXEL_MASK;
  return hasDock(id) || hasDock(id - 1000) || hasDock(id + 1) || hasDock(id + 1000) || hasDock(id - 1);
}
export function isPlayerInTownForShips(gps) {
  if (gps.locationType === T.TownCity || gps.locationType === T.TownHamlet) return true;
  const here = (gps.mapId | 0) & PIXEL_MASK;
  if (LARGE_DOCK_MAP_IDS.some((d) => (d & PIXEL_MASK) === here)) return true;
  return gps.regionIndex === 31;
}

export function seafarerRefusal(settings, { here, gps, dest, politicAt }) {
  if (!nearDock(dest.mapId)) return 'noDock';
  if (!settings.limitedRangeInSmallDocks) return null;
  if (isPlayerInTownForShips(gps)) return null;
  const border = borderingRegionIndex(here.x, here.y, politicAt);
  if (border === dest.regionIndex || border === -1) return null;
  return 'smallBoat';
}

export const seafarerLocationLarge = (summary, settings) =>
  (settings?.showLargerDocks ? nearDock(summary.mapID ?? summary.mapId) : carriageLocationLarge(summary.locationType, settings));
export const seafarerDiscovered = (summary, discovered, settings) =>
  !!discovered && (!settings?.showOnlyDocks || nearDock(summary.id ?? summary.mapID ?? summary.mapId));

// Every step costs 51 minutes whatever the terrain, and the ocean pixel count is always 0, as in the mod.
export function seafarerTravelTime(start, end, { speedCautious = false } = {}) {
  const steps = Math.max(Math.abs((end.x | 0) - (start.x | 0)), Math.abs((end.y | 0) - (start.y | 0)));
  let minutes = 51 * steps;
  if (!speedCautious) minutes >>= 1;
  return { minutes, oceanPixels: 0 };
}

export function seafarerTripCost(minutes, { hasShip = false } = {}, settings) {
  const days = Math.trunc(Math.trunc(((minutes | 0) + 59) / 60) / 24) + 1;
  let totalCost = 0;
  if (!hasShip) totalCost += (settings?.dailyShipCost | 0) * days;
  totalCost += (settings?.dailyCaptainFee | 0) * days;
  if (totalCost < 0) totalCost = 0;
  return { piecesCost: 0, totalCost };
}

export function itMapRefusal(kind, settings, { here, summary, politicAt }) {
  const dest = { locationType: summary.locationType, mapId: summary.mapID ?? summary.mapId, regionIndex: summary.regionIndex };
  if (kind === IT_POPUP.seafarer) return seafarerRefusal(settings, { here, gps: here, dest, politicAt });
  return carriageRefusal(settings, { here, dest, politicAt });
}

export const itMapPaths = (settings) => [!!(settings?.basicRoads && settings.drawRoads), !!(settings?.basicRoads && settings.drawTracks), false, false];

export const IT_POPUP = Object.freeze({ carriage: 'carriage', seafarer: 'seafarer', player: 'player' });

export function itPopUpDefaults(kind, settings) {
  if (kind === IT_POPUP.seafarer) return { speedCautious: true, travelShip: true, sleepModeInn: false };
  return { speedCautious: true, travelShip: !settings?.disableShipTravelOutsideDocks, sleepModeInn: true };
}

export function playerPopUpRefusal(settings, destLocationType) {
  if (!settings?.enabled || !settings.disableNormalTravel) return null;
  if (destLocationType == null) return null;
  return isDestinationValid(destLocationType, settings.allowed) ? 'mustTakeCarriage' : 'cannotTravelType';
}

export function itTogglePress(kind, st, settings, press, { ship = false, inn = false, campOutButton = false } = {}) {
  const disableShip = !!settings?.disableShipTravelOutsideDocks;
  const transport = press === 'transportClick' || press === 'transportToggle';
  const sleep = press === 'sleepClick' || press === 'sleepToggle';
  if (!transport && !sleep) return null;
  if (kind === IT_POPUP.seafarer) {
    if (transport && st.travelShip) { st.travelShip = true; return 'cannotDisableShip'; }
    if (sleep && !st.sleepModeInn) { st.sleepModeInn = false; return 'noInnsAtSea'; }
  } else if (kind === IT_POPUP.carriage && sleep) {
    const wantsCampOut = press === 'sleepClick' ? !inn : st.sleepModeInn;
    if (wantsCampOut) { st.sleepModeInn = true; return 'carriageNoCampOut'; }
  } else if (transport) {
    if (!st.travelShip && disableShip) { st.travelShip = false; return 'mustFindShip'; }
  } else if ((press === 'sleepClick' ? !inn : campOutButton) && disableShip) {
    st.travelShip = false;
  }
  if (press === 'transportClick') st.travelShip = !!ship;
  else if (press === 'transportToggle') st.travelShip = !st.travelShip;
  else if (press === 'sleepClick') st.sleepModeInn = !!inn;
  else if (press === 'sleepToggle') st.sleepModeInn = !st.sleepModeInn;
  return null;
}

// The fare is the mod's own calculator, not the Travel Options scaled fare or the online half-price fare.
export function itTrip(kind, settings, { start, end, opts, hasHorse = false, hasCart = false, hasShip = false, freeTavernRooms = false, getClimateIndex, playerEntity = null, calc }) {
  const t = kind === IT_POPUP.seafarer
    ? seafarerTravelTime(start, end, { speedCautious: opts.speedCautious })
    : calc.calculateTravelTime(start, end, { speedCautious: opts.speedCautious, sleepModeInn: opts.sleepModeInn, travelShip: opts.travelShip, hasHorse, hasCart }, getClimateIndex);
  const minutes = calc.guildFastTravel(playerEntity, t.minutes);
  const cost = kind === IT_POPUP.seafarer
    ? seafarerTripCost(minutes, { hasShip }, settings)
    : carriageTripCost(minutes, t.oceanPixels, { sleepModeInn: opts.sleepModeInn, hasShip, travelShip: opts.travelShip, freeTavernRooms }, settings);
  return { minutes, oceanPixels: t.oceanPixels, ...cost };
}

let _installed = false;
// The loaded state latches at Init once per page load, so changing the switch mid-game takes effect only at the
// next game start.
export const immersiveTravelLoaded = () => modLatchedOn(IMMERSIVE_TRAVEL_VENDOR) ?? (modSetting(IMMERSIVE_TRAVEL_VENDOR, 'Enabled') === true);
// Flat 357 record 3 (the WALLAA09 driver) has no FLATS.CFG row and would show the placeholder face, so it gets face
// 429, the face of classic's bearded man 182.3.
export const IT_DRIVER_FACE = Object.freeze({ archive: 357, record: 3, faceIndex: 429 });

export function installImmersiveTravel() {
  if (_installed) return false;
  _installed = true;
  if (!latchModLoaded(IMMERSIVE_TRAVEL_VENDOR, modSetting(IMMERSIVE_TRAVEL_VENDOR, 'Enabled') === true)) return true;
  const [drivers, sailors] = IT_FACTIONS;
  if (!(registerCustomFaction(drivers.id, drivers) && registerCustomFaction(sailors.id, sailors))) {
    console.warn('[ImmersiveTravel] Error: could not register custom factions!');
    return true;
  }
  setFlatFaceOverride(IT_DRIVER_FACE.archive, IT_DRIVER_FACE.record, IT_DRIVER_FACE.faceIndex);
  registerMerchantService(CARRIAGE_DRIVERS_FACTION_ID, (door) => immersiveTravelService(door, IT_POPUP.carriage), IT_SERVICE_LABEL, immersiveTravelLoaded);
  registerMerchantService(SAILORS_FACTION_ID, (door) => immersiveTravelService(door, IT_POPUP.seafarer), IT_SERVICE_LABEL, immersiveTravelLoaded);
  return true;
}
export function immersiveTravelService(door, kind) {
  noteFirstUse('carriages');
  if (door?.enemiesNearby?.()) { door.messageBox?.(door.enemiesText ?? 'You cannot travel with enemies nearby.'); return false; }
  return !!door?.openImmersiveMap?.(kind);
}
export function _resetImmersiveTravel() { _installed = false; }
