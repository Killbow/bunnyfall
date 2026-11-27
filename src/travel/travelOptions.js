
import { pickNearPlaceMiddle } from './travelPathMode.js';
import { modSetting, colorKeyRgba } from '../mods/modSettings.js';
import { registerCustomGuild } from '../guilds/guildServices.js';
import {
  MAX_CIRCUMNAVIGATION_ACCEL, LOC_PAUSE_OFF, LOC_PAUSE_NEAR, LOC_PAUSE_ENTER,
  MID_LO, P_SIZE, MP_WORLD_UNITS, HALF_MP_WORLD_UNITS,
  mapPixelWorldOrigin, normalisedYaw, directionOfYaw, targetPixel, countSetBits,
  playerOnPathAt, pathsDataPoint, roadsDataPoint, nextPathDirection,
} from './travelPaths.js';
import { TravelAutopilot, rectOf, rectMinMax, rectContains, rectCentre, ARRIVAL_BUFFER } from './travelAutopilot.js';
import { TOWN_PACE_MAX } from './townWalk.js';
import { TRAVEL_OPTIONS_TEXT as T, TRAVEL_NAV_TEXT, format, localize } from './travelOptionsText.js';
import { hasPortFor } from './travelPorts.js';
import { FATIGUE_MULTIPLIER } from '../characters/statMods.js';
import { LOCATION_TYPES, CLIMATES, worldCoordToMapPixel } from '../formats/mapsFile.js';
import { joinPoint, dryLine as dryLineOf, finalRoadVia } from './travelRoute.js';
import { seaLegMark, SEA_LEG_UNBUILT, SEA_LEG_DRY } from './seaMark.js';
import { travelRateOf } from '../world/timeScale.js';

export const TRAVEL_OPTIONS_VENDOR = 'travel-options';

export const ROAD_LEG_KINDS = Object.freeze(['road', 'track']);

// One open leg between two road legs, at most one pixel from the previous leg, counts as road, because the network
// draws some bends and crossings with a one-pixel gap.
export function bridgedRoadLeg(legs, i) {
  const leg = legs?.[i], prev = legs?.[i - 1], next = legs?.[i + 1];
  if (!leg || leg.kind !== 'open' || !prev || !next) return false;
  if (!ROAD_LEG_KINDS.includes(prev.kind) || !ROAD_LEG_KINDS.includes(next.kind)) return false;
  return Math.max(Math.abs(leg.x - prev.x), Math.abs(leg.y - prev.y)) <= 1;
}

// Counted in unscaled real time, so time acceleration does not shorten it.
export const IGNORE_ENCOUNTERS_SECONDS = 15;
export const SEA_LEG_SIZE = 8192;
export const SEA_LEG_LO = (32768 - SEA_LEG_SIZE) / 2;
export const SEA_SPOT_SIZE = 2048;
const SEA_LEG_KINDS = Object.freeze(['sea', 'embark']);

// The mod's readme says 20, but its code uses 50, and the code is what runs.
export const AVOID_ENCOUNTER_OFFSET = 50;

export const LOCATION_BORDER_TILES = 1;
export const LOCATION_BORDER_TILES_CITY = 1.5;

export { LOC_PAUSE_OFF, LOC_PAUSE_NEAR, LOC_PAUSE_ENTER };

export const CLIMATE_OCEAN = CLIMATES.Ocean;

// With `boot`, the restart keys keep the values read at world load and every other key is read live, as DFU reruns
// LoadSettings on each settings change.
export const TRAVEL_OPTIONS_RESTART_KEYS = Object.freeze([
  'roadsIntegration', 'variableSizeDots', 'roadsJunctionMap', 'waterwaysEnabled', 'streamsToggle', 'teleportCost',
  'junctionMapSize', 'junctionMapX', 'junctionMapY', 'junctionMapOpaque', 'junctionMapBackground',
]);
export function readTravelOptionsSettings(read = modSetting, boot = null) {
  const get = (k) => read(TRAVEL_OPTIONS_VENDOR, k);
  const roadsModEnabled = !!read('roads-hazelnut', 'Enabled');
  const riversStreams = !!read('roads-hazelnut', 'RiversAndStreams');

  const roadsIntegration = !!get('RoadsIntegration.Enable') && roadsModEnabled;
  const variableSizeDots = roadsIntegration ? !!get('RoadsIntegration.VariableSizeDots') : false;
  const roadsJunctionMap = boot ? !!boot.roadsJunctionMap : (roadsIntegration ? !!get('RoadsJunctionMap.Enable') : false);
  const waterwaysEnabled = roadsIntegration ? (!!get('RoadsIntegration.EnableWaterways') && riversStreams) : false;
  const streamsToggle = roadsIntegration ? (!!get('RoadsIntegration.EnableStreamsToggle') && riversStreams) : false;

  const speedPenalty = get('CautiousTravel.SpeedPenalty') | 0;
  const bag = {
    targetCoordsAllowed: !!get('GeneralOptions.AllowTargetingMapCoordinates'),
    enableWeather: !!get('GeneralOptions.AllowWeather'),
    enableSounds: !!get('GeneralOptions.AllowAnnoyingSounds'),
    enableRealGrass: !!get('GeneralOptions.AllowRealGrass'),
    locationPause: get('GeneralOptions.LocationPause') | 0,
    avoidObstacles: !!get('GeneralOptions.AvoidObstacles'),
    // The speed penalty is a percentage off (20 gives x0.8), and the fatigue minimum is the setting plus one, as in
    // the mod.
    cautiousTravel: !!get('CautiousTravel.PlayerControlledCautiousTravel'),
    recklessTravelMultiplier: 1,
    cautiousTravelMultiplier: 1 - (speedPenalty / 100),
    maxAvoidChance: get('CautiousTravel.MaxChanceToAvoidEncounter') | 0,
    cautiousHealthMinPc: get('CautiousTravel.HealthMinimumPercentage') | 0,
    cautiousFatigueMin: (get('CautiousTravel.FatigueMinimumValue') | 0) + 1,
    stopAtInnsTravel: !!get('StopAtInnsTravel.PlayerControlledInnsTravel'),
    shipTravelPortsOnly: !!get('ShipTravel.OnlyFromPorts'),
    shipTravelDestinationPortsOnly: !!get('ShipTravel.OnlyToPorts'),
    teleportCost: !!get('Teleportation.EnablePaidTeleportation'),
    roadsIntegration, variableSizeDots, roadsJunctionMap, waterwaysEnabled, streamsToggle,
    markLocationColor: colorKeyRgba(get('RoadsIntegration.MarkLocationColor')),
    persistentJunctionMap: roadsJunctionMap ? !!get('RoadsJunctionMap.PersistentMap') : false,
    toggleMapOffPaths: roadsJunctionMap ? !!get('RoadsJunctionMap.ToggleMapOffPaths') : false,
    junctionMapCircular: roadsJunctionMap ? !!get('RoadsJunctionMap.Circular') : true,
    junctionMapFilterMode: roadsJunctionMap ? (get('RoadsJunctionMap.FilterMode') | 0) : 0,
    junctionMapSize: get('RoadsJunctionMap.ScreenSize') | 0,
    junctionMapX: get('RoadsJunctionMap.ScreenPositionX') | 0,
    junctionMapY: get('RoadsJunctionMap.ScreenPositionY') | 0,
    junctionMapOpaque: !!get('RoadsJunctionMap.Opaque'),
    playerColor: colorKeyRgba(get('RoadsJunctionMap.PlayerColor')),
    junctionMapBackground: colorKeyRgba(get('RoadsJunctionMap.BackgroundColor')),
    fastTravelCostScaleFactor: get('FastTravelCostScaling.FastTravelCostScaleFactor') | 0,
    shipTravelCostScaleFactor: get('FastTravelCostScaling.ShipTravelCostScaleFactor') | 0,
    // The order must match `getPixelColorIndex` in ui/travelMapWindow.js, which maps index 0 to DungeonLabyrinth
    // through 13 to TownVillage.
    locationColors: Object.freeze([
      'DungeonLabyrinth', 'DungeonKeep', 'DungeonRuin', 'Graveyard', 'Coven', 'Farm', 'WealthyHome',
      'PoorHome', 'Temple', 'Cult', 'Tavern', 'City', 'Hamlet', 'Village',
    ].map((n) => colorKeyRgba(get(`LocationColours.${n}`)))),
  };
  if (boot) for (const k of TRAVEL_OPTIONS_RESTART_KEYS) bag[k] = boot[k];
  return Object.freeze(bag);
}

export const travelSpeedMultiplier = (cautious, s) => (cautious ? s.cautiousTravelMultiplier : s.recklessTravelMultiplier);

export const LOCATION_TYPE_NAMES = Object.freeze({
  [LOCATION_TYPES.TownCity]: 'city',
  [LOCATION_TYPES.TownHamlet]: 'town',
  [LOCATION_TYPES.TownVillage]: 'village',
  [LOCATION_TYPES.HomeFarms]: 'farm',
  [LOCATION_TYPES.DungeonLabyrinth]: 'labyrinth',
  [LOCATION_TYPES.ReligionTemple]: 'temple',
  [LOCATION_TYPES.Tavern]: 'tavern',
  [LOCATION_TYPES.DungeonKeep]: 'keep',
  [LOCATION_TYPES.HomeWealthy]: 'manor',
  [LOCATION_TYPES.ReligionCult]: 'shrine',
  [LOCATION_TYPES.DungeonRuin]: 'ruin',
  [LOCATION_TYPES.HomePoor]: 'farmstead',
  [LOCATION_TYPES.Graveyard]: 'graveyard',
  [LOCATION_TYPES.Coven]: 'coven',
});
export const locationTypeName = (locationType) => LOCATION_TYPE_NAMES[locationType] ?? 'place';

export function locationTypeString(locationType, macroName = '') {
  switch (locationType) {
    case LOCATION_TYPES.DungeonKeep: return localize('LocationTypeDungeonKeep');
    case LOCATION_TYPES.DungeonLabyrinth: return localize('LocationTypeDungeonLabyrinth');
    case LOCATION_TYPES.DungeonRuin: return localize('LocationTypeDungeonRuin');
    default: return macroName || locationTypeName(locationType);
  }
}

export function avoidEncounterChance(luck, stealth, maxAvoidChance) {
  return Math.min(luck + stealth - AVOID_ENCOUNTER_OFFSET, maxAvoidChance);
}

// Both rects are inset by one tile at the min edges first, then the inner rect by the border on all four sides, as
// in SetLocationRects.
export function locationRectsOf(worldOriginX, worldOriginZ, tileRect, isCity, hasCustomPosition = false) {
  const tSize = MP_WORLD_UNITS / 128;
  const locBorder = isCity ? LOCATION_BORDER_TILES_CITY : LOCATION_BORDER_TILES;
  let xMin = tileRect.x + 1, zMin = tileRect.y + 1;
  const xMax = tileRect.x + tileRect.width, zMax = tileRect.y + tileRect.height;
  const locationBorderRect = rectOf(worldOriginX + (xMin * tSize), worldOriginZ + (zMin * tSize),
    (xMax - xMin) * tSize, (zMax - zMin) * tSize);
  const ixMin = xMin + locBorder, izMin = zMin + locBorder;
  const ixMax = xMax - locBorder, izMax = zMax - locBorder;
  const locationRect = rectOf(worldOriginX + (ixMin * tSize), worldOriginZ + (izMin * tSize),
    (ixMax - ixMin) * tSize, (izMax - izMin) * tSize);
  return { locationRect, locationBorderRect, aimForCentre: !hasCustomPosition };
}

export function locBorderCornerRects(locationRect, locationBorderRect) {
  return {
    ne: rectMinMax(locationRect.xMax, locationRect.zMax, locationBorderRect.xMax, locationBorderRect.zMax),
    se: rectMinMax(locationRect.xMax, locationBorderRect.zMin, locationBorderRect.xMax, locationRect.zMin),
    sw: rectMinMax(locationBorderRect.xMin, locationBorderRect.zMin, locationRect.xMin, locationRect.zMin),
    nw: rectMinMax(locationBorderRect.xMin, locationRect.zMax, locationRect.xMin, locationBorderRect.zMax),
  };
}

// Basic Roads joins a road through a town at the pixel middle inside the walls. The painter paves a ring round the
// town instead, so a planned route walks that ring.
export const RING_ORDER = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
export function ringSideOf(dx, dy) {
  const sx = Math.sign(dx), sy = Math.sign(dy);
  return (sy < 0 ? 'n' : sy > 0 ? 's' : '') + (sx > 0 ? 'e' : sx < 0 ? 'w' : '');
}
export function ringSideAt(locationRect, p) {
  const L = locationRect;
  return (p.z > L.zMax ? 'n' : p.z < L.zMin ? 's' : '') + (p.x > L.xMax ? 'e' : p.x < L.xMin ? 'w' : '');
}
export function segmentCrossesRect(a, b, rect, pad = 0) {
  const dx = b.x - a.x, dz = b.z - a.z;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a.x - (rect.xMin - pad)], [dx, (rect.xMax + pad) - a.x], [-dz, a.z - (rect.zMin - pad)], [dz, (rect.zMax + pad) - a.z]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}
export function spotOffTown(locationRect, locationBorderRect, p) {
  const L = locationRect, B = locationBorderRect;
  if (!(p.x > L.xMin && p.x < L.xMax && p.z > L.zMin && p.z < L.zMax)) return { x: p.x, z: p.z };
  const wx = (B.xMin + L.xMin) / 2, ex = (L.xMax + B.xMax) / 2, nz = (L.zMax + B.zMax) / 2, sz = (B.zMin + L.zMin) / 2;
  const d = { w: p.x - L.xMin, e: L.xMax - p.x, s: p.z - L.zMin, n: L.zMax - p.z };
  const side = Object.keys(d).reduce((m, k) => (d[k] < d[m] ? k : m), 'w');
  if (side === 'w') return { x: wx, z: p.z };
  if (side === 'e') return { x: ex, z: p.z };
  return { x: p.x, z: side === 'n' ? nz : sz };
}
export function spotOffTownFor(p, rects, me) {
  if (!rects?.locationRect || !rects.locationBorderRect) return p;
  const L = rects.locationRect;
  if (me && me.x >= L.xMin && me.x <= L.xMax && me.z >= L.zMin && me.z <= L.zMax) return p;
  if (pickNearPlaceMiddle(p, { minX: L.xMin, maxX: L.xMax, minZ: L.zMin, maxZ: L.zMax, cx: (L.xMin + L.xMax) / 2, cz: (L.zMin + L.zMax) / 2 })) return p;
  return { ...p, ...spotOffTown(L, rects.locationBorderRect, p) };
}
export function ringPassPoints(locationRect, locationBorderRect, from, to, mid) {
  const L = locationRect, B = locationBorderRect;
  const pointy = (v) => !Array.isArray(v) && v && Number.isFinite(v.x) && Number.isFinite(v.z);
  if (pointy(from) || pointy(to)) {
    // A step is scaled by its own length, because a taut free plan can step several pixels and its sign alone would
    // aim the test at the diagonal neighbor.
    const stepPt = (v) => (pointy(v) ? v : { x: mid.x + v[0] * MP_WORLD_UNITS, z: mid.z - v[1] * MP_WORLD_UNITS });
    const a = stepPt(from), b = stepPt(to);
    const sa = pointy(from) ? ringSideAt(L, from) : ringSideOf(from[0], from[1]), sb = pointy(to) ? ringSideAt(L, to) : ringSideOf(to[0], to[1]);
    if (!sa || !sb || !segmentCrossesRect(a, b, L)) return [];
    return ringWalk(L, B, sa, sb, mid, { a: pointy(from) ? from : null, b: pointy(to) ? to : null });
  }
  return ringWalk(L, B, ringSideOf(from[0], from[1]), ringSideOf(to[0], to[1]), mid, null);
}
function ringWalk(L, B, sA, sB, mid, ends) {
  const wx = (B.xMin + L.xMin) / 2, ex = (L.xMax + B.xMax) / 2, nz = (L.zMax + B.zMax) / 2, sz = (B.zMin + L.zMin) / 2;
  const cx = Math.min(L.xMax, Math.max(L.xMin, mid.x)), cz = Math.min(L.zMax, Math.max(L.zMin, mid.z));
  const at = { n: { x: cx, z: nz }, ne: { x: ex, z: nz }, e: { x: ex, z: cz }, se: { x: ex, z: sz }, s: { x: cx, z: sz }, sw: { x: wx, z: sz }, w: { x: wx, z: cz }, nw: { x: wx, z: nz } };
  // A diagonal road meets the ring where its diagonal through the pixel middle crosses the band. The corner square
  // middle lies off the road for any town that is not square.
  const road = (side) => {
    const sx = side.includes('e') ? 1 : -1, sz2 = side.includes('n') ? 1 : -1;
    const sIn = Math.max(0, Math.min(sx > 0 ? L.xMax - mid.x : mid.x - L.xMin, sz2 > 0 ? L.zMax - mid.z : mid.z - L.zMin));
    const sOut = Math.max(sIn, Math.min(sx > 0 ? B.xMax - mid.x : mid.x - B.xMin, sz2 > 0 ? B.zMax - mid.z : mid.z - B.zMin));
    const q = { x: mid.x + sx * (sIn + sOut) / 2, z: mid.z + sz2 * (sIn + sOut) / 2 };
    const band = q.x > L.xMin && q.x < L.xMax ? (sz2 > 0 ? 'n' : 's') : q.z > L.zMin && q.z < L.zMax ? (sx > 0 ? 'e' : 'w') : side;
    return { q, band };
  };
  const a = RING_ORDER.indexOf(sA), b = RING_ORDER.indexOf(sB);
  if (a < 0 || b < 0) return [];
  const sideA = RING_ORDER[a], sideB = RING_ORDER[b];
  const level = (side, p) => (side.length === 2 ? at[side] : side === 'n' || side === 's'
    ? { x: Math.min(L.xMax, Math.max(L.xMin, p.x)), z: at[side].z } : { x: at[side].x, z: Math.min(L.zMax, Math.max(L.zMin, p.z)) });
  const endOf = (side, p) => ({ q: level(side, p), band: side });
  const inA = ends?.a ? endOf(sideA, ends.a) : sideA.length === 2 ? road(sideA) : { q: at[sideA], band: sideA };
  const outB = ends?.b ? endOf(sideB, ends.b) : sideB.length === 2 ? road(sideB) : { q: at[sideB], band: sideB };
  if (a === b) return ends ? [] : [inA.q];
  const walk = (step) => {
    const out = [inA.q];
    if (inA.band !== sideA && (RING_ORDER.indexOf(inA.band) + step + 8) % 8 === a) out.push(at[sideA]);
    for (let i = (a + step + 8) % 8; i !== b; i = (i + step + 8) % 8) if (RING_ORDER[i].length === 2) out.push(at[RING_ORDER[i]]);
    if (outB.band !== sideB && (RING_ORDER.indexOf(outB.band) - step + 8) % 8 === b) out.push(at[sideB]);
    out.push(outB.q);
    return out;
  };
  const cw = (b - a + 8) % 8, step = cw <= 4 ? 1 : -1;
  if (!ends) return walk(step);
  const len = (pts) => pts.reduce((m, q, k) => m + (k ? Math.hypot(q.x - pts[k - 1].x, q.z - pts[k - 1].z) : 0), 0);
  const one = walk(1), other = walk(-1);
  return len(one) <= len(other) ? one : other;
}

export function circumnavigateTarget(worldX, worldZ, yaw, locationRect, locationBorderRect, corners) {
  if (rectContains(corners.ne, worldX, worldZ)) return (yaw > 45 && yaw < 225) ? 'se' : 'nw';
  if (rectContains(corners.se, worldX, worldZ)) return (yaw > 135 && yaw < 315) ? 'sw' : 'ne';
  if (rectContains(corners.sw, worldX, worldZ)) return (yaw > 45 && yaw < 225) ? 'se' : 'nw';
  if (rectContains(corners.nw, worldX, worldZ)) return (yaw > 135 && yaw < 315) ? 'sw' : 'ne';
  if (worldZ > locationRect.zMax && worldZ < locationBorderRect.zMax) return (yaw > 180 && yaw < 360) ? 'nw' : 'ne';
  if (worldZ > locationBorderRect.zMin && worldZ < locationRect.zMin) return (yaw > 180 && yaw < 360) ? 'sw' : 'se';
  if (worldX > locationRect.xMax && worldX < locationBorderRect.xMax) return (yaw > 90 && yaw < 270) ? 'se' : 'ne';
  if (worldX > locationBorderRect.xMin && worldX < locationRect.xMin) return (yaw > 90 && yaw < 270) ? 'sw' : 'nw';
  return null;
}

export function createTravelOptions(deps = {}) {
  const s0 = deps.settings ?? readTravelOptionsSettings(deps.read ?? modSetting);
  const st = {
    settings: s0,
    destinationName: null,
    destinationSummary: null,
    destinationCautious: false,
    autopilot: null,
    lastLocation: null,
    locationRect: null,
    locationBorderRect: null,
    corners: null,
    ignoreEncounters: false,
    ignoreEncountersTime: 0,
    diseaseCount: 0,
    beginTime: 0,
    estimateMinutes: null,
    // After the first interruption the mod unsubscribes the enter-location stop and never subscribes again, so that
    // stop fires once per session.
    enterRectDetached: false,
    circumnavigatePathsDataPt: 0,
    lastCrossed: 0,
    road: false,
    uiCloseWhenTop: false,
    lastPlayerFacing: 0,
    junctionMapOn: false,
    steeredBy: null,
    shutStop: false,
    route: null,
    // Hosts read this count to tell the end of a journey from a stop, because a stop on a spot also clears `route`.
    cleared: 0,
    walk: null,
    rate: 0,
    rateOnRoad: false,
  };

  // With paid teleportation on, a Mages Guild member of any rank reaches the teleport service and pays the
  // rank-scaled fee. Every other service declines and keeps the DFU rules.
  registerCustomGuild('MagesGuild', s0.teleportCost
    ? (_membership, service) => (service === 'Teleport' ? true : undefined)
    : null);

  const ui = deps.ui;
  const say = (text) => deps.say?.(text);
  const messageBox = (text) => deps.messageBox?.(text);
  const now = () => deps.now?.() ?? 0;
  const roads = () => deps.roads?.() ?? null;
  const pixel = () => deps.mapPixel?.() ?? { x: 0, y: 0 };
  const pos = () => deps.worldPos?.() ?? { x: 0, z: 0 };
  // On a frame the steering turned the body round an obstacle, the mod reads the autopilot bearing as the facing,
  // because leg and corner picks depend on it.
  const yawDeg = (invert = false) => normalisedYaw(
    st.autopilot && st.steeredBy === st.autopilot ? st.autopilot.yaw : (deps.yaw?.() ?? 0), invert);

  const setTimeScale = (n) => deps.setTimeScale?.(n);

  function clearTravelDestination() {
    st.cleared++;
    st.destinationName = null;
    st.autopilot = null;
    st.route = null;
    st.estimateMinutes = null;
    if (ui?.isShowing) ui.closeWindow();
  }

  function beginTravel(summary, speedCautious = false, estimateMinutes = null) {
    const name = deps.localizedLocationName?.(summary) ?? summary?.name ?? null;
    if (name == null) throw new Error('TravelOptions: destination not found!');
    st.route = null;
    st.destinationName = name;
    ui?.setDestinationName(name);
    st.destinationSummary = summary;
    st.destinationCautious = speedCautious;
    resumeTravel();
    st.beginTime = deps.worldTimeNow?.() ?? 0;
    st.estimateMinutes = Number.isFinite(estimateMinutes) && estimateMinutes > 0 ? estimateMinutes : null;
  }

  function minutesLeft() {
    if (st.estimateMinutes == null || !st.autopilot || st.destinationName == null) return null;
    const elapsed = (deps.worldTimeNow?.() ?? 0) - st.beginTime;
    return Math.max(0, st.estimateMinutes - elapsed);
  }

  function resumeTravel() {
    if (st.route) { resumeRoute(); return; }
    if (!st.destinationName) return;
    const rect = deps.locationWorldRect?.(st.destinationSummary);
    if (!rect) return;
    st.walk = null;
    st.autopilot = new TravelAutopilot(st.destinationSummary.pixel, rect,
      travelSpeedMultiplier(st.destinationCautious, st.settings), { grow: true, isLocation: true, edgeArrival: st.settings.avoidObstacles });
    st.autopilot.onArrival = () => {
      ui?.closeWindow();
      clearTravelDestination();
      messageBox(T.MsgArrived);
    };
    st.lastLocation = deps.currentLocation?.() ?? null;
    initTravelUI();
  }

  // The speed follows `st.road`, left by the last followed path, and not `speedCautious`, as in the mod.
  function beginTravelToCoords(target, speedCautious = false) {
    st.route = null;
    const targetName = format(T.MsgTargetCoords, target.x, target.y);
    ui?.setDestinationName(targetName);
    st.destinationCautious = speedCautious;
    st.walk = null;
    const origin = mapPixelWorldOrigin(target.x, target.y);
    const targetRect = rectOf(origin.x + MID_LO, origin.z + MID_LO, P_SIZE, P_SIZE);
    st.autopilot = new TravelAutopilot({ x: target.x, y: target.y }, targetRect,
      st.road ? st.settings.recklessTravelMultiplier : st.settings.cautiousTravelMultiplier);
    st.autopilot.onArrival = () => {
      ui?.closeWindow();
      clearTravelDestination();
      messageBox(T.MsgArrived);
    };
    st.lastLocation = deps.currentLocation?.() ?? null;
    initTravelUI();
  }

  function arriveRoute(quiet) {
    ui?.closeWindow();
    clearTravelDestination();
    // `quiet` is evaluated at arrival, so a journey the player left the view during ends in the message box.
    if (typeof quiet === 'function' ? quiet() : quiet) say(T.MsgArrived);
    else messageBox(T.MsgArrived);
  }
  function routeLegSpeed(kind) {
    return !st.destinationCautious && kind === 'road' ? st.settings.recklessTravelMultiplier : st.settings.cautiousTravelMultiplier;
  }
  const spotRect = (pt, afloat = false) => { const w = afloat ? SEA_SPOT_SIZE : P_SIZE; return rectOf(pt.x - w / 2, pt.z - w / 2, w, w); };

  const STREET_END_SIZE = 192;
  // Aims at least a cell and a half (2.4 m) ahead, so a corner is turned at the corner and never cut across the
  // building beside it.
  const STREET_LOOK = 96;
  function routeAim(r) {
    if (r.join) return r.join;
    const final = r.i >= r.legs.length - 1;
    if (final && r.summary) { const rect = deps.locationWorldRect?.(r.summary); if (rect) return rectCentre(rect); }
    if (final && r.point) return { x: r.point.x, z: r.point.z };
    const leg = r.legs[Math.min(r.i, r.legs.length - 1)];
    return leg ? (leg.at ?? legMiddle(leg)) : null;
  }
  function streetRun(r) {
    r.townAt = deps.townKey?.(pos()) ?? null;
    const leg = r.legs[Math.min(r.i, r.legs.length - 1)];
    const key = `${r.i}|${r.townAt}`;
    if (!r.townAt || !deps.townWay || leg?.ring || SEA_LEG_KINDS.includes(leg?.kind) || deps.atSea?.() || r.streetFor === key) return null;
    if (r.summary && r.i >= r.legs.length - 1 && arrivedAtPlace(r)) return null;
    r.streetFor = key;
    const aim = routeAim(r);
    const way = aim ? deps.townWay(pos(), aim) : null;
    if (way?.shut) st.shutStop = true;
    return way?.pts?.length ? { pts: way.pts.map((q) => ({ x: q.x, z: q.z })) } : null;
  }
  function arrivedAtPlace(r) {
    const rect = deps.locationWorldRect?.(r.summary), p = pos();
    return !!rect && p.x >= rect.xMin - ARRIVAL_BUFFER && p.x < rect.xMax + ARRIVAL_BUFFER && p.z >= rect.zMin - ARRIVAL_BUFFER && p.z < rect.zMax + ARRIVAL_BUFFER;
  }
  function routeLane(r, i) {
    const leg = r.legs[i], prev = r.legs[i - 1];
    if (!leg || !prev || !ROAD_LEG_KINDS.includes(leg.kind) || (leg.at && !leg.ring) || (leg.ring && prev.ring)) return null;
    const a = prev.ring ? prev.at : legMiddle(prev), b = leg.ring ? leg.at : legMiddle(leg);
    return { ax: a.x, az: a.z, bx: b.x, bz: b.z };
  }
  function finalPath(r, end, place) {
    const n = r.legs.length, lane = routeLane(r, n - 1);
    const via = lane ? finalRoadVia(r.legs, end, legMiddle, { place }) : null;
    if (!via) return null;
    const pts = [[lane.ax, lane.az], [via.x, via.z], [end.x, end.z]].filter((q, k, a) => k === 0 || Math.hypot(q[0] - a[k - 1][0], q[1] - a[k - 1][1]) > 1);
    return pts.length >= 2 ? pts : null;
  }
  const seaLegBuilt = (leg) => {
    if (!leg || typeof deps.seaWaterAt !== 'function') return false;
    const m = legMiddle(leg);
    return deps.seaWaterAt(m.x, m.z) !== null;
  };
  function startRouteLeg() {
    const r = st.route;
    if (!r) return;
    r.street ??= streetRun(r);
    if (r.street) {
      const pts = r.street.pts, end = pts[pts.length - 1], me = pos(), ep = worldCoordToMapPixel(end.x, end.z);
      const rect = rectOf(end.x - STREET_END_SIZE / 2, end.z - STREET_END_SIZE / 2, STREET_END_SIZE, STREET_END_SIZE);
      const path = [[me.x, me.z], ...pts.map((q) => [q.x, q.z])];
      if (st.autopilot == null) st.autopilot = new TravelAutopilot(ep, rect, routeLegSpeed('road'), { path, lookMin: STREET_LOOK, lookMax: STREET_LOOK });
      else st.autopilot.initTargetRect(ep, rect, routeLegSpeed('road'), { path, lookMin: STREET_LOOK, lookMax: STREET_LOOK });
      st.autopilot.onArrival = () => { if (st.route !== r) return; r.street = null; startRouteLeg(); };
      return;
    }
    // The join is aimed in its own pixel, because the autopilot checks for arrival only in the target pixel.
    if (r.join) {
      const j = r.join, jp = worldCoordToMapPixel(j.x, j.z);
      if (st.autopilot == null) st.autopilot = new TravelAutopilot(jp, spotRect(j), routeLegSpeed('open'));
      else st.autopilot.initTargetRect(jp, spotRect(j), routeLegSpeed('open'));
      st.autopilot.onArrival = () => { if (st.route !== r) return; r.join = null; startRouteLeg(); };
      return;
    }
    const final = r.i >= r.legs.length - 1;
    if (final && r.summary) {
      const rect = deps.locationWorldRect?.(r.summary);
      if (rect) {
        st.autopilot = new TravelAutopilot(r.summary.pixel, rect, routeLegSpeed(r.legs.at(-1)?.kind ?? 'road'),
          { grow: true, isLocation: true, edgeArrival: st.settings.avoidObstacles, path: finalPath(r, rectCentre(rect), true) });
        st.autopilot.onArrival = () => arriveRoute(r.quiet);
        return;
      }
    }
    if (final && r.point) {
      st.autopilot = new TravelAutopilot(r.point.pixel, spotRect(r.point, SEA_LEG_KINDS.includes(r.legs.at(-1)?.kind)), routeLegSpeed(r.legs.at(-1)?.kind ?? 'open'),
        { path: finalPath(r, r.point, false) });
      st.autopilot.onArrival = () => arriveRoute(r.quiet);
      return;
    }
    const leg = r.legs[Math.min(r.i, r.legs.length - 1)];
    if (!leg) { arriveRoute(r.quiet); return; }
    const o = mapPixelWorldOrigin(leg.x, leg.y);
    const read = leg.kind === 'sea' ? seaLegMark(o, deps.seaWaterAt) : null;
    if (read === SEA_LEG_DRY && r.i < r.legs.length - 1) { r.i++; startRouteLeg(); return; }
    r.seaUnbuilt = read === SEA_LEG_UNBUILT ? r.i : null;
    const mark = read === SEA_LEG_DRY || read === SEA_LEG_UNBUILT ? null : read;
    const rect = mark ? rectOf(mark.x - SEA_LEG_SIZE / 2, mark.z - SEA_LEG_SIZE / 2, SEA_LEG_SIZE, SEA_LEG_SIZE)
      : leg.kind === 'sea' || leg.kind === 'embark' ? rectOf(o.x + SEA_LEG_LO, o.z + SEA_LEG_LO, SEA_LEG_SIZE, SEA_LEG_SIZE) : leg.at ? spotRect(leg.at) : rectOf(o.x + MID_LO, o.z + MID_LO, P_SIZE, P_SIZE);
    const lane = routeLane(r, Math.min(r.i, r.legs.length - 1));
    if (st.autopilot == null) st.autopilot = new TravelAutopilot(leg, rect, routeLegSpeed(leg.kind), { lane });
    else st.autopilot.initTargetRect(leg, rect, routeLegSpeed(leg.kind), { lane });
    st.autopilot.onArrival = () => {
      if (st.route !== r) return;
      r.i++;
      if (r.i >= r.legs.length) { arriveRoute(r.quiet); return; }
      startRouteLeg();
    };
  }

  function dryLine(a, b) {
    if (typeof deps.isWater !== 'function') return true;
    return dryLineOf(a, b, deps.isWater);
  }
  const legMiddle = (l) => { const o = mapPixelWorldOrigin(l.x, l.y); return { x: o.x + HALF_MP_WORLD_UNITS, z: o.z + HALF_MP_WORLD_UNITS }; };
  function rejoinPoint(r) {
    const leg = r.legs[r.i], prev = r.legs[r.i - 1];
    if (!leg || !prev || leg.kind === 'open' || leg.ring || prev.ring) return null;
    const me = pos(), end = legMiddle(leg);
    const j = joinPoint(me, legMiddle(prev), end);
    return Math.hypot(j.x - me.x, j.z - me.z) > P_SIZE / 2 && Math.hypot(j.x - end.x, j.z - end.z) > P_SIZE / 2 ? j : null;
  }
  function resumeRoute() {
    const r = st.route;
    const mp = pixel();
    // A later leg counts only when the straight line to it is dry, because a road folded round a bay puts a later
    // leg nearer across the water.
    const cur = r.legs[r.i];
    let best = r.i;
    // Ring points are never skipped, because the whole ring sits in the town pixel and skipping one cuts across the
    // town.
    if (cur && !cur.ring && cur.x === mp.x && cur.y === mp.y) best = r.i + 1;
    else if (cur) {
      let bestD = Math.hypot(cur.x - mp.x, cur.y - mp.y);
      for (let k = r.i + 1; k < r.legs.length; k++) {
        const d = Math.hypot(r.legs[k].x - mp.x, r.legs[k].y - mp.y);
        if (d < bestD && dryLine(mp, r.legs[k])) { bestD = d; best = k; }
      }
    }
    if (r.legs[best]?.at && !r.legs[best].ring && best + 1 < r.legs.length) best++;
    r.i = best;
    r.join = rejoinPoint(r);
    r.street = null; r.streetFor = null;
    st.shutStop = false;
    st.autopilot = null;
    st.walk = null;
    startRouteLeg();
    st.lastLocation = deps.currentLocation?.() ?? null;
    initTravelUI();
  }

  function beginTravelAlongRoute(plan, speedCautious = false, { quiet = false } = {}) {
    if (!plan || (!plan.summary && !plan.point)) return false;
    const legs = (plan.legs ?? []).map((l) => ({ x: l.x, y: l.y, kind: l.kind ?? 'open', ...(l.at ? { at: { x: l.at.x, z: l.at.z } } : {}), ...(l.ring ? { ring: true } : {}) }));
    const name = plan.summary ? (deps.localizedLocationName?.(plan.summary) ?? plan.summary.name ?? plan.name ?? '') : (plan.name ?? '');
    st.route = { legs, i: 0, summary: plan.summary ?? null, point: plan.point ?? null, quiet: typeof quiet === 'function' ? quiet : !!quiet, join: null, street: null, streetFor: null, townAt: null };
    // Clears the ring walk state, whose path-crossing check would otherwise stop this journey at the first pixel
    // middle.
    st.circumnavigatePathsDataPt = 0;
    st.lastCrossed = 0;
    st.destinationName = plan.summary ? name : null;
    st.destinationSummary = plan.summary ?? null;
    st.destinationCautious = speedCautious;
    st.estimateMinutes = null;
    ui?.setDestinationName(name);
    st.walk = null;
    st.autopilot = null;
    st.shutStop = false;
    startRouteLeg();
    st.beginTime = deps.worldTimeNow?.() ?? 0;
    st.lastLocation = deps.currentLocation?.() ?? null;
    initTravelUI();
    return true;
  }

  function beginTravelToPoint(point, speedCautious = false, { quiet = false, name = '' } = {}) {
    return beginTravelAlongRoute({ legs: [], point, name }, speedCautious, { quiet });
  }

  function journeyOnRoad() {
    const r = st.route;
    if (r) {
      if (r.join) return false;
      if (r.point && r.i >= r.legs.length - 1) return !!deps.onRoad?.();
      const at = Math.min(r.i, r.legs.length - 1);
      const leg = r.legs[at];
      return !!leg && (ROAD_LEG_KINDS.includes(leg.kind) || bridgedRoadLeg(r.legs, at));
    }
    if (st.walk === 'path' || st.walk === 'ring') return true;
    return !!deps.onRoad?.();
  }
  function wayPace(of) {
    const r = st.route;
    if (!r) return null;
    if (of === 'street') return { fwd: routeLegSpeed('road'), rate: Math.min(TOWN_PACE_MAX, travelRateOf(true)), sea: false };
    if (of === 'join') return { fwd: routeLegSpeed('open'), rate: travelRateOf(false), sea: false };
    const leg = r.legs[of];
    return leg ? { fwd: routeLegSpeed(leg.kind), rate: travelRateOf(ROAD_LEG_KINDS.includes(leg.kind) || bridgedRoadLeg(r.legs, of)), sea: SEA_LEG_KINDS.includes(leg.kind) } : null;
  }
  function applyRate(force = false) {
    const street = !!st.route?.street;
    const onRoad = street || journeyOnRoad();
    const rate = street ? Math.min(TOWN_PACE_MAX, travelRateOf(true)) : st.walk === 'ring' ? Math.min(MAX_CIRCUMNAVIGATION_ACCEL, travelRateOf(onRoad)) : travelRateOf(onRoad);
    if (!force && rate === st.rate && onRoad === st.rateOnRoad) return;
    st.rate = rate;
    st.rateOnRoad = onRoad;
    ui?.setRate?.(rate, onRoad);
    setTimeScale(rate);
  }

  function initTravelUI() {
    disableJunctionMap(true);
    if (ui && !ui.isShowing) deps.pushWindow?.(ui);
    applyRate(true);
    disableWeatherAndSound();
    st.diseaseCount = deps.diseaseCount?.() ?? 0;
  }

  function initLocationRects(mapPixel = pixel()) {
    if (!(st.settings.roadsIntegration && (st.autopilot == null || st.destinationName != null))) return;
    setLocationRects(mapPixel);
  }

  function setLocationRects(mapPixel) {
    const info = deps.locationTileRect?.(mapPixel);
    if (!info) {
      st.locationRect = null; st.locationBorderRect = null;
      return false;
    }
    const origin = mapPixelWorldOrigin(mapPixel.x, mapPixel.y);
    const r = locationRectsOf(origin.x, origin.z, info.tileRect, info.locationType === LOCATION_TYPES.TownCity, info.hasCustomPosition);
    st.locationRect = r.locationRect;
    st.locationBorderRect = r.locationBorderRect;
    return r.aimForCentre;
  }

  function followPath() {
    const p = pos(), mp = pixel();
    const inLoc = !!st.locationRect && rectContains(st.locationRect, p.x, p.z);
    const net = roads();
    const pathsDataPt = pathsDataPoint(net, mp.x, mp.y);
    const onPath = playerOnPathAt(pathsDataPt, p.x, p.z, mp.x, mp.y);

    if (onPath !== 0) {
      const playerDirection = directionOfYaw(yawDeg());
      const roadDataPt = roadsDataPoint(net, mp.x, mp.y);
      if ((inLoc && (pathsDataPt & playerDirection) !== 0) || (pathsDataPt & playerDirection & onPath) !== 0) {
        st.road = (roadDataPt & playerDirection) !== 0;
        st.destinationName = null;
        beginPathTravel(targetPixel(playerDirection, mp.x, mp.y));
        return true;
      }
      const fromDirection = directionOfYaw(yawDeg(true));
      if ((inLoc && (pathsDataPt & fromDirection) !== 0) || (pathsDataPt & fromDirection & onPath) !== 0) {
        st.road = (roadDataPt & fromDirection) !== 0;
        st.destinationName = null;
        // `targetPixel(0, ...)` returns the current pixel, as GetTargetPixel(0) does in the mod.
        beginPathTravel(targetPixel(0, mp.x, mp.y));
        return true;
      }
    }
    if (!inLoc && st.locationBorderRect && rectContains(st.locationBorderRect, p.x, p.z)) {
      // The ring walk clears the named destination, because with a name set the location rects refresh on every
      // pixel change and can go null mid-walk.
      st.destinationName = null;
      st.corners = locBorderCornerRects(st.locationRect, st.locationBorderRect);
      circumnavigateLocation();
      return true;
    }
    if (st.settings.roadsJunctionMap && st.settings.toggleMapOffPaths) {
      st.junctionMapOn = !st.junctionMapOn;
      if (st.junctionMapOn) {
        drawJunctionMap(mp);
        say(T.MsgNoPath);
      }
    } else {
      say(T.MsgNoPath);
    }
    return false;
  }

  function beginPathTravel(target, starting = true) {
    if (!target) return;
    if (starting) st.route = null;
    st.lastCrossed = 0;
    ui?.setDestinationName(st.road ? T.MsgFollowRoad : T.MsgFollowTrack);
    const origin = mapPixelWorldOrigin(target.x, target.y);
    const aimed = setLocationRects(target);
    const targetRect = aimed ? st.locationBorderRect : rectOf(origin.x + MID_LO, origin.z + MID_LO, P_SIZE, P_SIZE);

    st.destinationCautious = true;
    st.walk = 'path';

    const speed = st.road ? st.settings.recklessTravelMultiplier : st.settings.cautiousTravelMultiplier;
    if (st.autopilot == null) {
      st.autopilot = new TravelAutopilot(target, targetRect, speed);
      st.autopilot.onArrival = selectNextPath;
    } else {
      st.autopilot.initTargetRect(target, targetRect, speed);
    }
    initTravelUI();
    if (st.settings.roadsJunctionMap && st.settings.persistentJunctionMap) {
      drawJunctionMap(pixel());
      st.junctionMapOn = true;
    }
  }

  function selectNextPath() {
    if (!deps.hasCurrentLocation?.()) {
      const mp = pixel();
      const net = roads();
      const pathsDataPt = pathsDataPoint(net, mp.x, mp.y);
      if (countSetBits(pathsDataPt) === 2) {
        const dir = nextPathDirection(pathsDataPt, directionOfYaw(yawDeg()), directionOfYaw(yawDeg(true)));
        // A pick with more or fewer than one bit is treated as a junction, because the raw leftover can name the
        // current pixel and loop on arrival forever.
        if (countSetBits(dir) === 1) {
          const roadDataPt = roadsDataPoint(net, mp.x, mp.y);
          st.road = (roadDataPt & dir) !== 0;
          beginPathTravel(targetPixel(dir, mp.x, mp.y), false);
          return;
        }
      }
      say(T.MsgArrivedJunc);
      if (st.settings.roadsJunctionMap) {
        drawJunctionMap(mp);
        st.junctionMapOn = true;
      }
    } else {
      st.lastCrossed = directionOfYaw(yawDeg(true));
    }
    ui?.closeWindow();
  }

  function circumnavigateLocation() {
    // Missing rects end the walk instead of dereferencing null, which would stop the frame loop.
    if (!st.locationRect || !st.locationBorderRect) {
      ui?.closeWindow();
      if (st.autopilot) interruptTravel();
      return;
    }
    st.route = null;
    const p = pos(), mp = pixel();
    if (st.circumnavigatePathsDataPt === 0) st.circumnavigatePathsDataPt = pathsDataPoint(roads(), mp.x, mp.y);
    const yaw = Math.trunc(yawDeg());
    if (!st.corners) st.corners = locBorderCornerRects(st.locationRect, st.locationBorderRect);
    const which = circumnavigateTarget(p.x, p.z, yaw, st.locationRect, st.locationBorderRect, st.corners);
    if (!which) return;
    const targetRect = st.corners[which];

    ui?.setDestinationName(format(T.MsgCircumnavigate, deps.localizedCurrentLocationName?.() ?? ''));
    st.destinationCautious = false;
    st.walk = 'ring';

    st.autopilot = new TravelAutopilot(mp, targetRect, travelSpeedMultiplier(st.destinationCautious, st.settings));
    st.autopilot.onArrival = () => circumnavigateLocation();
    initTravelUI();
    if (st.settings.roadsJunctionMap && st.settings.persistentJunctionMap) {
      drawJunctionMap(mp, directionOfYaw(yawDeg()));
      st.junctionMapOn = true;
    }
  }

  function drawJunctionMap(mapPixel, playerDirection = 0) {
    if (!deps.junctionMap) return;
    const dir = playerDirection === 0 ? directionOfYaw(yawDeg()) : playerDirection;
    deps.junctionMap.draw(mapPixel, dir);
    st.lastPlayerFacing = dir;
  }
  function updateJunctionMap(mapPixel) {
    const dir = directionOfYaw(yawDeg());
    if (st.lastPlayerFacing !== dir) drawJunctionMap(mapPixel, dir);
  }
  function disableJunctionMap(force = false) {
    if (force || (st.settings.roadsJunctionMap && !st.settings.persistentJunctionMap && !st.settings.toggleMapOffPaths)) {
      st.junctionMapOn = false;
    }
  }

  function interruptTravel() {
    setTimeScale(1);
    st.circumnavigatePathsDataPt = 0;
    st.shutStop = false;
    if (st.route && !st.route.summary) st.route = null;
    deps.setMouseLookEnabled?.(true);
    if (st.autopilot) {
      const f = st.autopilot.mouseLookAtDestination();
      deps.setFacing?.(f.yaw, f.pitch);
    }
    st.autopilot = null;
    enableWeatherAndSound();
    if (st.settings.locationPause === LOC_PAUSE_ENTER) st.enterRectDetached = true;
    if (st.settings.roadsJunctionMap && st.settings.persistentJunctionMap && st.junctionMapOn) {
      drawJunctionMap(pixel());
    }
  }

  function stopTravelWithMessage(message) {
    if (ui?.isShowing) ui.closeWindow();
    messageBox(message);
  }

  function attemptAvoidEncounter(route = null) {
    const e = deps.entity?.() ?? {};
    const chance = avoidEncounterChance(e.luck ?? 50, e.stealth ?? 0, st.settings.maxAvoidChance);
    if ((deps.roll100?.() ?? 100) <= chance) {
      st.ignoreEncounters = true;
      st.ignoreEncountersTime = Math.trunc(now()) + IGNORE_ENCOUNTERS_SECONDS;
      st.lastPlayerFacing = 0;
      if (route) { st.route = route; resumeRoute(); }
      else if (st.destinationName != null) resumeTravel();
      else followPath();
      ui?.showMessage(T.MsgAvoidSuccess);
      return true;
    }
    messageBox(T.MsgAvoidFail);
    return false;
  }

  function ignoringEncounters() {
    if (st.ignoreEncounters && now() >= st.ignoreEncountersTime) st.ignoreEncounters = false;
    return st.ignoreEncounters;
  }

  function enemiesStop() {
    // The route is read before the panel closes, because closing interrupts the journey and drops a spot route.
    const route = st.route;
    ui?.closeWindow();
    if (st.destinationCautious) return attemptAvoidEncounter(route);
    messageBox(T.MsgEnemies);
    return false;
  }

  // Hosts call this the frame an encounter meets the journey, because enemies load and sense on their own real-time
  // tick and the accelerated traveller would run past them.
  function encounter() {
    if (!st.autopilot || !ui?.isShowing) return null;
    if (ignoringEncounters()) return 'ignored';
    return enemiesStop() ? 'avoided' : 'stopped';
  }

  function disableWeatherAndSound() {
    if (!st.settings.enableWeather) deps.setWeatherEnabled?.(false);
    if (!st.settings.enableSounds) deps.setTravelSoundsEnabled?.(false);
    if (!st.settings.enableRealGrass) deps.setRealGrassEnabled?.(false);
  }
  function enableWeatherAndSound() {
    if (!st.settings.enableWeather) deps.setWeatherEnabled?.(true);
    if (!st.settings.enableSounds) deps.setTravelSoundsEnabled?.(true);
    if (!st.settings.enableRealGrass) deps.setRealGrassEnabled?.(true);
  }

  function helpText() {
    return format(localize('HelpInfoSDF'), deps.binding?.('FollowPaths') || 'None',
      deps.binding?.('TravelExit') ?? 'V', deps.binding?.('TravelMap') ?? 'M');
  }

  const messages = {
    pauseTravel: () => { if (ui?.isShowing) ui.closeWindow(); },
    isTravelActive: () => !!ui?.isShowing,
    isPathFollowing: () => !!ui?.isShowing && st.destinationName == null,
    isFollowingRoad: () => st.road,
    showMessage: (msg) => { if (msg) ui?.showMessage(msg); },
    hasPort: (mapId) => hasPortFor(mapId),
  };

  // The steps run in the mod's Update order, and each stop returns before the later ones run.
  function update(frame = {}) {
    if (st.uiCloseWhenTop && frame.topWindowIsTravelUI) {
      st.uiCloseWhenTop = false;
      ui?.closeWindow();
      return { handled: true };
    }
    const mp = pixel();
    if (frame.topWindowIsTravelUI && frame.helpKeyDown) messageBox(helpText());

    let drive = null;
    if (st.autopilot && st.route && !st.route.street && deps.townKey) {
      const k = deps.townKey(pos());
      if (k !== st.route.townAt) { st.route.townAt = k; if (k) { startRouteLeg(); applyRate(); } else st.route.streetFor = null; }
    }
    if (st.autopilot && st.route && st.route.seaUnbuilt === st.route.i && seaLegBuilt(st.route.legs[st.route.i])) startRouteLeg();
    if (st.autopilot && st.shutStop) {
      st.shutStop = false;
      stopTravelWithMessage(TRAVEL_NAV_TEXT.MsgGatesShut);
      if (st.autopilot) interruptTravel();
      return { handled: true, stopped: 'shut' };
    }
    if (st.autopilot) {
      const p = pos();
      drive = st.autopilot.update({ worldX: p.x, worldZ: p.z, mapPixelX: mp.x, mapPixelY: mp.y });
      // The autopilot runs while the game is paused, because the travel map opens over the journey, but no stop is
      // checked.
      if (frame.gamePaused) return { drive, handled: true };

      if (frame.isPlayerOnHUD || !(frame.topWindowIsTravelUI || frame.topWindowAllowsTravel)) {
        interruptTravel();
        st.uiCloseWhenTop = !!ui?.isShowing;
        return { drive, handled: true, interrupted: true };
      }
      if (st.destinationName == null && st.settings.roadsIntegration && !frame.inputPaused && frame.followKeyDown) {
        if (ui?.isShowing) ui.closeWindow();
      }
      if (st.circumnavigatePathsDataPt !== 0) {
        const crossed = playerOnPathAt(st.circumnavigatePathsDataPt, p.x, p.z, mp.x, mp.y);
        if (crossed !== 0 && crossed !== st.lastCrossed) {
          st.lastCrossed = crossed;
          if (ui?.isShowing) ui.closeWindow();
          return { drive, handled: true, crossedPath: crossed };
        }
        st.lastCrossed = crossed;
      }
      if (st.destinationCautious) {
        const e = deps.entity?.() ?? {};
        const healthPc = (e.health ?? 1) / (e.maxHealth ?? 1) * 100;
        if (healthPc < st.settings.cautiousHealthMinPc) { stopTravelWithMessage(T.MsgLowHealth); return { drive, handled: true, stopped: 'health' }; }
        if ((e.fatigue ?? 0) < FATIGUE_MULTIPLIER * st.settings.cautiousFatigueMin) { stopTravelWithMessage(T.MsgLowFatigue); return { drive, handled: true, stopped: 'fatigue' }; }
      }
      const loc = deps.currentLocation?.() ?? null;
      if (st.settings.locationPause === LOC_PAUSE_NEAR && st.destinationName != null && deps.hasCurrentLocation?.()
        && !sameLocation(loc, st.lastLocation) && (deps.localizedCurrentLocationName?.() ?? '') !== st.destinationName) {
        st.lastLocation = loc;
        deps.discoverLocation?.(loc);
        stopTravelWithMessage(format(T.MsgNearLocation,
          locationTypeString(loc?.locationType, deps.locationTypeName?.() ?? ''), deps.localizedCurrentLocationName?.() ?? ''));
        return { drive, handled: true, stopped: 'location' };
      }
      if ((deps.climateIndex?.() ?? 0) === CLIMATE_OCEAN && !deps.atSea?.()) { stopTravelWithMessage(T.MsgOcean); return { drive, handled: true, stopped: 'ocean' }; }
      if (!ignoringEncounters() && deps.enemiesNearby?.()) {
        enemiesStop();
        return { drive, handled: true, stopped: 'enemies' };
      }
      // The panel closes first, as for every other stop, so the journey never reads as active with no autopilot.
      const dc = deps.diseaseCount?.() ?? 0;
      if (dc !== st.diseaseCount) {
        if (dc > st.diseaseCount) { if (ui?.isShowing) ui.closeWindow(); if (st.autopilot) interruptTravel(); deps.showHealthStatus?.(); }
        st.diseaseCount = dc;
      }
      // The steering step runs last, so each stop of the mod is checked first and shows its own message.
      if (st.autopilot && drive && !drive.arrived && st.settings.avoidObstacles && deps.steer && !deps.atSea?.()) {
        const stop = deps.steer(drive, p.x, p.z, st.autopilot);
        st.steeredBy = drive.yaw !== st.autopilot.yaw ? st.autopilot : null;
        if (stop) {
          stopTravelWithMessage(stop === 'stuck' ? TRAVEL_NAV_TEXT.MsgStuck : TRAVEL_NAV_TEXT.MsgBlocked);
          if (st.autopilot) interruptTravel();
          return { drive, handled: true, stopped: stop };
        }
      }
      if (st.autopilot && ui?.isShowing) applyRate();
    } else if (st.settings.roadsIntegration && !frame.inputPaused && frame.followKeyDown && frame.isPlayerOnHUD) {
      if (frame.isPlayerInside) return { handled: true };
      if (deps.enemiesNearby?.()) messageBox(deps.text?.('cannotTravelWithEnemiesNearby') ?? 'You cannot travel with enemies nearby.');
      else followPath();
    }
    if (st.settings.roadsJunctionMap && st.junctionMapOn) {
      if (deps.enemiesNearby?.()) {
        st.junctionMapOn = false;
      } else if (!ui?.isShowing) {
        const pathsDataPt = pathsDataPoint(roads(), mp.x, mp.y);
        const p = pos();
        if (!st.settings.toggleMapOffPaths && playerOnPathAt(pathsDataPt, p.x, p.z, mp.x, mp.y) === 0) st.junctionMapOn = false;
        else updateJunctionMap(mp);
      } else if (st.settings.persistentJunctionMap) {
        updateJunctionMap(mp);
      }
    }
    return { drive, handled: !!st.autopilot };
  }

  const sameLocation = (a, b) => (a == null && b == null) || (!!a && !!b && a.mapId === b.mapId);

  function onEncounter() {
    if (ui?.isShowing && !st.ignoreEncounters) {
      setTimeScale(1);
      ui.closeWindow();
      messageBox(T.MsgEnemies);
    }
  }

  function onEnterLocationRect(location) {
    if (st.enterRectDetached) return;
    if (st.destinationName && st.settings.locationPause === LOC_PAUSE_ENTER) {
      if (ui?.isShowing) ui.closeWindow();
      messageBox(format(T.MsgEnterLocation, deps.locationTypeName?.() ?? '',
        deps.localizedLocationName?.(location) ?? location?.name ?? ''));
    }
  }

  function onMapPixelChanged(mapPixel) {
    disableJunctionMap();
    initLocationRects(mapPixel);
  }

  function onRegionIndexChanged() {
    if (ui?.isShowing) ui.showMessage(format(T.MsgNewRegion, deps.regionName?.() ?? ''));
  }

  return {
    state: st,
    get settings() { return st.settings; },
    set settings(v) { st.settings = v; },
    get destinationName() { return st.destinationName; },
    get cleared() { return st.cleared; },
    get road() { return st.road; },
    get isTravelActive() { return !!ui?.isShowing; },
    get isPathFollowing() { return !!ui?.isShowing && st.destinationName == null; },
    get junctionMapOn() { return st.junctionMapOn; },
    get minutesLeft() { return minutesLeft(); },
    beginTravel, resumeTravel, beginTravelToCoords, clearTravelDestination,
    beginTravelAlongRoute, beginTravelToPoint,
    get route() { return st.route; },
    followPath, beginPathTravel, selectNextPath, circumnavigateLocation,
    interruptTravel, update, helpText, messages,
    followKeyText: () => deps.binding?.('FollowPaths') || null,
    initLocationRects, setLocationRects,
    onEncounter, onEnterLocationRect, onMapPixelChanged, onRegionIndexChanged,
    drawJunctionMap, updateJunctionMap, disableJunctionMap,
    attemptAvoidEncounter,
    encounter,
    reapplyRate: () => { if (st.autopilot && ui?.isShowing) applyRate(true); },
    wayPace,
    get paceNow() { return st.autopilot ? { fwd: st.autopilot.speedMultiplier, sea: SEA_LEG_KINDS.includes(st.route?.legs?.[Math.min(st.route.i, st.route.legs.length - 1)]?.kind) } : null; },
  };
}
