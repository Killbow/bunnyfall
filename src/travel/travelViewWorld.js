// The travel view in the world: its routes and walks, sea crossings and raiders, wilderness bands
// and their chases, dungeon finds, places, and camps, and the journey's pace. It also holds the sea
// lanes' ships and the view's ground and water.
import { areEnemiesNearby, foeAlerted, foeHostile } from '../characters/encounters.js';
import {
  BAND_CHASE_MPS, BAND_CONTACT_M, BAND_LIFE_MS, BAND_STAND_M, BAND_STAND_MIN_M, BAND_STAND_RETRY_MS, BAND_STAND_TRIES,
  BAND_WORD_MS, bandChaseStep, bandLevelOf, bandLifeOf, bandMakeSeed, bandNearMe, bandPixelOf, BANDS_WIRE_MAX,
  bandSight, bandSizeOf, bandsNear, bandWordOf, chaseYields, validBandWord, wanderAt,
} from './travelBands.js';
import { bandTrailLine } from './bandTrail.js';
import { loneMember, noticedFoes } from './travelBlocker.js';
import { canvasPoint, classifyPick } from '../player/travelPick.js';
import { cliffFadeAt } from '../world/landforms.js';
import { CLIMATES, LOCATION_TYPES } from '../formats/mapsFile.js';
import { concealmentFlags } from '../magic/effects.js';
import { createBandSprites } from '../world/bandSprites.js';
import {
  createSeaHelm, headingOf as seaHeadingOf, seaHelmLook, seaHelmStep, squareOnly as seaSquareOnly,
} from '../systems/naval/seaHelm.js';
import { createWildAlert } from '../ai/wildAlert.js';
import {
  crossesWater, dryLine, joinPoint, planRoute, roadShare, routeDrawPoints, routeGround, routeLegs, SEA_KINDS,
} from './travelRoute.js';
import {
  BOAT_ACTIONS as CSA_BOAT_ACTIONS, hullFromMessage as csaHullFromMessage,
} from '../systems/naval/comeSailAway.js';
import { BOAT_PARTS_TEMPLATE as CSA_PARTS_TEMPLATE } from '../systems/naval/comeSailAwayItems.js';
import { quatRotate as csaQuatRotate } from '../world/quat.js';
import { CURTAIN_FOOT_MARGIN_M } from '../render/rainCurtains.js';
import { discoverLocation, discoveryGeneration, hasDiscoveredLocationId } from '../maps/discovery.js';
import {
  dungeonApproach, dungeonFoundText, dungeonRows, dungeonToFind, filedSpawns, lastLegStart, NATIVE_PER_M,
  nearDungeons, pixelBox, spawnedPixels,
} from './travelDungeons.js';
import { dungeonTierLabel } from '../world/dungeonLabel.js';
import { enemyDisplayName } from '../characters/enemyBasics.js';
import { ETHER_SEA_NAME, inEther, onBayOrEther } from '../world/ethericSea.js';
import { etherPlaceIsle, etherPlaceRows } from '../world/etherPlaces.js';
import { etherWildRingAt } from '../world/wild/etherWild.js';
import { farDistanceText, farPlaces, PIXEL_KM, settlementPixels, TV_FAR_RANGE } from './travelFarPlaces.js';
import { fareText } from '../party/partyTravelLaw.js';
import {
  fineMoveHeld, pickNearPlaceMiddle, pickTakesPlace, TRAVEL_PATH_TEXT, travelPathMode, travelPathUsesRoads,
} from './travelPathMode.js';
import { foeRate, threatCap } from './travelThreat.js';
import { freePull } from './freePull.js';
import { getPref } from '../ui/uiPrefs.js';
import { giveOffer } from '../ui/pendingOffer.js';
import { groupCamps } from '../world/campShared.js';
import { hasCarriageGate } from '../world/immersiveTravelGates.js';
import { hasCustomLocationPosition } from '../world/locationLayout.js';
import { held } from '../ui/input.js';
import { hideTravelViewConfirm, showTravelViewConfirm, travelViewConfirmOpen } from '../ui/travelViewHud.js';
import { horizonHit } from './travelHorizon.js';
import { immersiveTravelLoaded } from './immersiveTravel.js';
import { isBoatEffectBundle } from '../world/deepWaterSwim.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { isLocalPlayerTarget } from '../characters/enemyTargets.js';
import { isNight } from '../world/worldClock.js';
import {
  isWaypointFollowed, mapPointToNative, nativeToMapPoint, shownWaypoints, waypointById,
} from '../maps/mapWaypoints.js';
import { LANE_PATH_PX, laneWay, packetsAt } from '../systems/naval/seaLanes.js';
import { locationRectsOf, ringPassPoints, spotOffTownFor, TRAVEL_OPTIONS_VENDOR } from './travelOptions.js';
import { locationWorldRect, mapPixelToWorldCoords, worldCoordToMapPixel } from '../world/streamingWorld.js';
import { markShown } from './travelViewFilters.js';
import { modSetting } from '../mods/modSettings.js';
import { openWaypointMenu } from '../ui/waypointMenu.js';
import { PACK_ALERT_RADIUS, PACK_SPACING, rollGroupComposition } from '../characters/campEncounters.js';
import {
  pixelOfNative, NATIVE_PIXEL as RAID_NATIVE_PIXEL, RAIDER_CHASE_MPS, RAIDER_CONTACT_M, RAIDER_CONTACT_PLAY_M,
  RAIDER_LIFE_MS, RAIDER_WORD_MS, raiderAt, chaseStep as raiderChaseStep, raiderLifeOf, raiderNearMe,
  RAIDERS_WIRE_MAX, raiderSight, raidersNear, raiderWordOf, validRaiderWord,
} from '../systems/naval/seaRaiders.js';
import { playerEntity } from '../characters/playerEntity.js';
import { RAIDER_LEAD_S } from '../systems/naval/navalRaiders.js';
import { rayDirFromScreen } from '../player/tapRay.js';
import {
  resetTimeScale, setTimeScale as setWorldTimeScale, timeScale as worldTimeScale,
} from '../world/timeScale.js';
import { ringHeight } from '../render/farRing.js';
import { RITE_TEXT } from '../worldEvents/riteHost.js';
import { seededRng } from '../weather/wind.js';
import { setLocationTiles } from '../world/terrainTiles.js';
import { sharedClockOn, skyMinutes } from '../world/worldTick.js';
import {
  shipPassageRows, TRAVEL_VIEW_TEXT, travelTripLine, travelViewLine, travelWalkRate, TV_MOVE_ACTIONS,
} from './travelView.js';
import { SIGHT_RADIUS } from '../characters/enemyMotor.js';
import { SKILLS, skillValue } from '../characters/skills.js';
import { skyClassicMinutes } from '../net/skyLaw.js';
import { spawnedHallMapId } from '../net/wire.js';
import { t } from '../ui/textManager.js';
import { spawnedMapId, spawnsDungeon } from '../world/spawnedDungeons.js';
import { tierPhrase } from '../world/dungeonTier.js';
import { TOWN_PACE_MAX } from './townWalk.js';
import { checkLocationDiscovered as travelCheckDiscovered } from '../ui/travelMapWindow.js';
import { travelDays } from './travel.js';
import { travellerPace, unbuiltAround } from './travelGovernor.js';
import { locationSummaryAt as travelLocationSummaryAt } from '../maps/mapDirectory.js';
import { travelMapPopUpState } from './travelMapState.js';
import { voyageSails } from '../systems/naval/passage.js';
import {
  warmAshesOn, raidAtSea as warmAshesRaidAtSea, raidRefusal as warmAshesRaidRefusal,
} from '../systems/naval/warmAshesShips.js';
import { WATER_BYTE } from '../world/roadsProducer.js';
import { WILD_PACK_MULT } from '../characters/exteriorFoes.js';
import { WILD_STRANGER_SLOW_M, WILD_TEXT, wildInside, wildMaskOf } from '../world/wildZone.js';
import { wildHallAt } from '../world/wildDungeons.js';
import { worldViewportRect } from '../ui/hudLarge.js';
import { YesNoBoxWindow } from '../ui/yesNoBox.js';

/** @param {any} shared */
export function createTravelViewWorld(shared) {
  const {
    _announcedSpawnPixels, _bandPlacePixels, _locationToBuild, _spawnSalt, _tvBountyHold, blocks, built, canvas,
    duelEnemyNear, etherPlaceClone, etherSea, getTexture, landform, laneNet, locationIndex, mapDict, maps, minuteNow,
    owSaySpent, params, partyTravelRefusal, partyTripFare, partyWalkBegin, playerTravelPixel, renderer, terrainGen,
    tvSay, tvSpawnAt, tvSpawnGone, uploadRecordFrame, waypointCtx, wod, worldMoveBusy,
  } = shared;
  const _tvVendorHold = {};

  const TV_FIND_REACH = 4;

  const _bandChase = new Map();
  const wildBands = createWildAlert();
  const _bandSpent = new Set();
  const _bandMake = new Map();
  const _bandPos = new Map();
  const _bandPeer = new Map();
  const _bandSpentAt = [];

  const travellerSent = { room: null, last: null, at: 0 };

  const _travelUIHolder = { ui: null };

  function dungeonTierSay() {
    if (!params.has('online')) return;
    const line = tierPhrase(dungeonTierLabel(shared.modes?.dungeonLocation ?? null));
    if (line) shared.townTalk.say(line, 4);
  }
  function tvOwnsJourneys() { return !!shared.travelOptions && !modSetting(TRAVEL_OPTIONS_VENDOR, 'GeneralOptions.FirstPersonTravel') && isEnhanced() && !!shared.travelView; }
  function tvRoutesJourneys() { return tvOwnsJourneys() || (!!shared.travelOptions && !!modSetting(TRAVEL_OPTIONS_VENDOR, 'GeneralOptions.FirstPersonTravelFollowsRoads') && isEnhanced() && !!shared.travelView); }
  function tvMapForcesRoads() { return !tvOwnsJourneys() && tvRoutesJourneys(); }
  function travelViewResume() {
    const r = shared.travelOptions?.route;
    if (!r || !isEnhanced() || !shared.travelView) { shared.travelOptions?.resumeTravel(); return; }
    const why = travelViewAllowed();
    if (!why.ok) { if (why.why) tvSay(why.why); return; }
    if (!travelViewCanGo()) return;
    const roads = tvMapForcesRoads();
    if (r.summary) travelViewRouteTo(r.summary, { roads });
    else if (r.point) travelViewWalkTo(tvSceneOf(r.point.x, r.point.z, 0), r.point.pixel, { door: r.point.door ?? null, roads });
  }

  const travelViewAllowed = () => {
    if (shared.farmingMode?.active) return { ok: false, why: t('farm.mode.finishFirst', 'Leave Farming Mode before opening the travel view.') };
    if (!isEnhanced()) return { ok: false, why: TRAVEL_VIEW_TEXT.enhancedOnly };
    if (params.has('fly') || !shared.walkMode || !shared.playerSpawned) return { ok: false };
    if ((shared.modes?.mode ?? 'exterior') !== 'exterior') return { ok: false, why: TRAVEL_VIEW_TEXT.indoors };
    if (!((playerEntity.health ?? 0) > 0)) return { ok: false };
    if (shared.dwPlayer?.submerged) return { ok: false, why: TRAVEL_VIEW_TEXT.underwater };
    return { ok: true };
  };
  const travelViewWhere = () => {
    const px = playerTravelPixel();
    const region = (etherSea && inEther(px.x, px.y) ? ETHER_SEA_NAME : maps.getRegionName(maps.getRegionIndexAt(px.x, px.y))) || '';
    const loc = locationIndex.get(`${px.x},${px.y}`);
    const inside = loc?.name && shared._inAnyLocationRect(shared.walkMode ? shared.player.pos : shared.cam.pos);
    return travelViewLine({ place: inside ? loc.name : null, near: !inside && loc?.name ? loc.name : null, region });
  };
  const TV_PLACE_GROW = 6144;

  const TV_PLACE_LIFT = 24;
  const TV_SEA_EPS_M = 0.25;
  const tvCautious = () => !!travelMapPopUpState().speedCautious;

  const tvQuiet = () => !!shared.travelView?.active;
  const tvTrip = { plan: null, natives: [], end: null, line: '' };
  const tvSceneOf = (nx, nz, lift = 0) => {
    const [x, z] = shared.state.localFromWorld(nx, nz);
    const h = shared.heightAt(x, z);
    if (Number.isFinite(h)) return [x, h + lift, z];
    const px = worldCoordToMapPixel(nx, nz);
    const ground = (px.x >= 0 && px.y >= 0 && px.x < 1000 && px.y < 500) || !!shared.woods.isTamrielGround || !!shared.woods.etherLaw?.(px.x, px.y);
    const byte = ground ? shared.woods.getHeightMapValue(px.x, px.y) : 0;
    const fade = landform && ground ? cliffFadeAt((bx, by) => shared.woods.getHeightMapValue(bx, by), px.x, px.y) : 1;
    return [x, ringHeight(byte, !!landform, fade) + shared.state.pixelTranslation(px.x, px.y)[1] + lift, z];
  };
  const tvGroundAt = (x, z, sea = true) => {
    const n = shared.state.worldCoords([x, 0, z]);
    const g = tvSceneOf(n.x, n.z)[1];
    if (!shared.deepWaters || !sea) return g;
    return Math.max(g, shared.tvSeaY() + CURTAIN_FOOT_MARGIN_M);
  };

  let _carriageGen = -1;
  const carriageTown = (mapId) => {
    if (!immersiveTravelLoaded() || !Number.isFinite(mapId)) return false;
    if (_carriageGen !== shared._locIndexGen) { shared._carriageOf.clear(); _carriageGen = shared._locIndexGen; }
    const id = mapId & 0xfffff;
    let on = shared._carriageOf.get(id);
    if (on === undefined) { on = hasCarriageGate(locationIndex.get(`${id % 1000},${Math.floor(id / 1000)}`)); shared._carriageOf.set(id, on); }
    return on;
  };
  const tvEtherPlace = (px, py) => { const isle = etherPlaceIsle(px, py); return isle ? (locationIndex.get(`${px},${py}`) ?? etherPlaceClone(isle)) : null; };
  const tvEtherKnown = (loc) => shared.captainLedger.isCharted(loc.ether) || hasDiscoveredLocationId(loc.mapTableData.mapId);
  const tvKnownGen = () => `${discoveryGeneration()}:${shared.captainLedger.chartedCount()}`;
  const tvPlaceSummary = (px, py) => {
    if (etherSea && inEther(px, py)) {
      const loc = tvEtherPlace(px, py);
      return loc && tvEtherKnown(loc) ? { pixel: { x: px, y: py }, name: loc.name, mapId: loc.mapTableData.mapId, regionIndex: loc.regionIndex, locationIndex: loc.locationIndex, loc } : null;
    }
    const hall = wildHallAt(shared.wildActiveNow(), px, py) ? shared.wildHallStand(px, py) : null;
    if (hall) return { pixel: { x: px, y: py }, name: hall.name, mapId: spawnedHallMapId(px, py), regionIndex: maps.getRegionIndexAt(px, py), locationIndex: -1, loc: hall };
    const loc = locationIndex.get(`${px},${py}`);
    const row = loc?.name ? travelLocationSummaryAt(mapDict, px, py) : null;
    if (!row || !travelCheckDiscovered(row)) return null;
    return { pixel: { x: px, y: py }, name: loc.name, mapId: row.mapID, regionIndex: row.regionIndex, locationIndex: row.mapIndex, loc };
  };
  const tvPlaceRect = (summary) => {
    const r = locationWorldRect(summary.loc, summary.pixel.x, summary.pixel.y);
    return { minX: r.minX - TV_PLACE_GROW, maxX: r.maxX + TV_PLACE_GROW, minZ: r.minZ - TV_PLACE_GROW, maxZ: r.maxZ + TV_PLACE_GROW, cx: (r.minX + r.maxX) / 2, cz: (r.minZ + r.maxZ) / 2 };
  };
  const tvWater = (px, py) => (!shared.woods.isTamrielGround && !shared.woods.etherLaw?.(px, py) && (px < 0 || py < 0 || px >= 1000 || py >= 500)) || shared.woods.getHeightMapValue(px, py) <= WATER_BYTE;
  const tvTripLive = () => !!tvTrip.plan && !!shared.travelOptions?.route && shared.travelOptions.route === tvTrip.plan.route;
  function travelViewRouteTo(summary, { roads = false, voyage = false, noWay = null } = {}) {
    const from = playerTravelPixel();
    let means = tvSeaMeans();
    const raw = terrainGen.roads();
    const roadNet = raw?.source === 'basic-roads' ? raw : null;
    let net = (roads || travelPathUsesRoads()) ? roadNet : null;
    let plan = planRoute(from, summary.pixel, { roads: net?.roads ?? null, tracks: net?.tracks ?? null, ...tvRouteGround(), sea: tvSeaAsk(means, 'land') });
    if (!plan && !net && roadNet) { net = roadNet; plan = planRoute(from, summary.pixel, { roads: net.roads ?? null, tracks: net.tracks ?? null, ...tvRouteGround(), sea: tvSeaAsk(means, 'land') }); if (plan) shared.townTalk.say(TRAVEL_PATH_TEXT.fellBack); }
    const dry = tvMooredDry(means, plan, () => planRoute(from, summary.pixel, { roads: net?.roads ?? null, tracks: net?.tracks ?? null, ...tvRouteGround() }));
    if (dry) { plan = dry; means = null; }
    if (voyage && !voyageSails(from, summary.pixel, plan)) { noWay?.(); return false; }
    if (!plan) { tvSeaNoWay(from, summary.pixel, means, net, 'land', summary); return false; }
    const legs = tvJoinedLegs(from, plan, roads);
    const ok = shared.travelOptions.beginTravelAlongRoute({ legs, summary, name: summary.name }, tvCautious(), { quiet: tvQuiet });
    if (!ok) return false;
    partyWalkBegin({ pixel: summary.pixel });
    shared.travelGovernor.reset();
    tvSeaBegin(means, plan.kinds);
    const rect = tvPlaceRect(summary);
    tvTrip.plan = { route: shared.travelOptions.route, summary, kinds: plan.kinds };
    tvTrip.natives = routeDrawPoints(shared.state.worldCoords(shared.player.pos), legs, { x: rect.cx, z: rect.cz }, tvLegMid);
    tvTrip.end = { x: rect.cx, z: rect.cz, label: summary.name, kind: 'dest' };
    tvTrip.line = travelTripLine({ name: summary.name, share: roadShare(plan.kinds), sea: crossesWater(plan.kinds) });
    return true;
  }
  const tvLegMid = (p) => { const o = mapPixelToWorldCoords(p.x, p.y); return [o.x + 16384, o.z + 16384]; };

  let _tvRouteGround = null;
  let _tvRocksFrom = null, _tvRocksRoads = null, _tvRocks = null;
  let _tvRocksMask = null;
  function tvWodRocks() {
    const src = wod ? wod.mountainPixels() : null;
    const net = terrainGen.roads();
    const wm = shared.wildMapMask();
    if (src === _tvRocksFrom && net === _tvRocksRoads && wm === _tvRocksMask && _tvRocks) return _tvRocks;
    const n = src?.length || (wm?.region?.length ?? 0);
    if (!n) return null;
    const out = new Uint8Array(n);
    const onRoad = (i) => ((net?.roads?.[i] ?? 0) | (net?.tracks?.[i] ?? 0));
    if (src) for (let i = 0; i < n; i++) if (src[i] && !onRoad(i)) out[i] = 1;
    _tvRocksFrom = src; _tvRocksRoads = net; _tvRocksMask = wm; _tvRocks = out;
    return out;
  }
  const tvWildFree = (x, y) => { const m = shared.wildMapMask(); return !!m && wildInside(m, x, y); };
  let _tvGroundWild = false;
  const tvRouteGround = () => {
    const wildOn = !!shared.wildMapMask();
    if (wildOn !== _tvGroundWild) { _tvGroundWild = wildOn; _tvRouteGround = null; }
    (_tvRouteGround ??= routeGround(
      (x, y) => (tvWildFree(x, y) && shared.woods.getHeightMapValue(x, y) > WATER_BYTE ? 0 : maps.getClimateIndex(x, y)),
      (x, y) => { const h = shared.woods.getHeightMapValue(x, y); return tvWildFree(x, y) && h > WATER_BYTE ? WATER_BYTE + 8 : h; },
      WATER_BYTE, 1000, 500, (x, y) => !tvWater(x, y))).setRocks(tvWodRocks());
    return _tvRouteGround;
  };
  function tvFreePull(plan, roads = false) { return roads || travelPathUsesRoads() ? plan : freePull(plan, tvRouteGround); }

  function tvTownRects(x, y) {
    const key = `${x},${y}`;
    const loc = _locationToBuild(x, y) || null;
    const had = shared._tvTownRects.get(key);
    if (had && had.loc === loc) return had.rects;
    let rects = null;
    if (loc?.exterior?.exteriorData && loc.mapTableData) {
      const r = built.get(key)?.locationRect ?? setLocationTiles(loc, maps, blocks, new Uint8Array(128 * 128));
      if (r && Number.isFinite(r.xMin + r.xMax + r.yMin + r.yMax)) {
        const o = mapPixelToWorldCoords(x, y);
        rects = locationRectsOf(o.x, o.z, { x: r.xMin, y: r.yMin, width: r.xMax - r.xMin, height: r.yMax - r.yMin }, loc.mapTableData.locationType === LOCATION_TYPES.TownCity, hasCustomLocationPosition(loc));
      }
    }
    shared._tvTownRects.set(key, { loc, rects });
    return rects;
  }
  function tvRingAt(x, y, from, to) {
    const r = tvTownRects(x, y);
    if (!r) return null;
    const o = mapPixelToWorldCoords(x, y);
    return ringPassPoints(r.locationRect, r.locationBorderRect, from, to, { x: o.x + 16384, z: o.z + 16384 });
  }
  function tvJoinedLegs(from, plan, roads = false, end = null) {
    plan = tvFreePull(plan, roads);
    const legs = routeLegs(plan.pixels, plan.kinds, { ringAt: tvRingAt }, end && [shared.state.worldCoords(shared.player.pos), end]);
    if (!legs.length || (legs[0].ring && legs[0].x === from.x && legs[0].y === from.y) || (plan.kinds[0] !== 'road' && plan.kinds[0] !== 'track')) return legs;
    const c = (p) => { const o = mapPixelToWorldCoords(p.x, p.y); return { x: o.x + 16384, z: o.z + 16384 }; };
    return [{ x: from.x, y: from.y, kind: 'open', at: joinPoint(shared.state.worldCoords(shared.player.pos), c(from), legs[0].at ?? c(legs[0])) }, ...legs];
  }
  function travelViewWalkTo(point, pix, { door = null, water = false, roads = false, outside = false } = {}) {
    let n = outside && !water ? spotOffTownFor(shared.state.worldCoords(point), tvTownRects(pix.x, pix.y), shared.state.worldCoords(shared.player.pos)) : shared.state.worldCoords(point);
    if (!door && !water && tvRouteGround().peakAt(pix.x, pix.y)) { tvSay(TRAVEL_VIEW_TEXT.mountains); return false; }
    const from = playerTravelPixel();
    const roadsRaw = terrainGen.roads(), roadNet = roadsRaw?.source === 'basic-roads' ? roadsRaw : null;
    let wnet = (roads || travelPathUsesRoads()) ? roadNet : null;
    const means = tvSeaMeans();
    let seaAsk = means && (water || means.start === 'sea' || !dryLine(from, pix, tvWater)) ? tvSeaAsk(means, water ? 'sea' : 'land') : null;
    if (water && !seaAsk) { tvSeaNoWay(from, pix, null, null, 'sea'); return false; }
    let plan = planRoute(from, pix, { roads: wnet?.roads ?? null, tracks: wnet?.tracks ?? null, ...tvRouteGround(), goalExempt: !!door, sea: seaAsk });
    if (!plan && !wnet && roadNet) { wnet = roadNet; plan = planRoute(from, pix, { roads: wnet.roads ?? null, tracks: wnet.tracks ?? null, ...tvRouteGround(), goalExempt: !!door, sea: seaAsk }); if (plan) shared.townTalk.say(TRAVEL_PATH_TEXT.fellBack); }
    if (!plan) { tvSeaNoWay(from, pix, seaAsk ? means : null, wnet, water ? 'sea' : 'land'); return false; }
    const dry = water ? null : tvMooredDry(seaAsk ? means : null, plan, () => planRoute(from, pix, { roads: wnet?.roads ?? null, tracks: wnet?.tracks ?? null, ...tvRouteGround(), goalExempt: !!door }));
    if (dry) { plan = dry; seaAsk = null; }
    let legs = tvJoinedLegs(from, plan, roads, door || water ? null : n);
    if (!legs.length && seaAsk?.goal === 'sea') { legs = [{ x: pix.x, y: pix.y, kind: 'sea' }]; plan = { ...plan, kinds: ['sea'] }; }
    if (door) n = dungeonApproach(door, lastLegStart(legs, shared.state.worldCoords(shared.player.pos), tvLegMid), undefined, pixelBox(pix.x, pix.y));
    const ok = shared.travelOptions.beginTravelAlongRoute({ legs, point: { pixel: pix, x: n.x, z: n.z, door }, name: TRAVEL_VIEW_TEXT.spot }, tvCautious(), { quiet: tvQuiet });
    if (!ok) return false;
    partyWalkBegin({ pixel: pix, point: { x: n.x, z: n.z } });
    shared.travelGovernor.reset();
    tvSeaBegin(seaAsk ? means : null, plan.kinds);
    tvTrip.plan = { route: shared.travelOptions.route, summary: null, kinds: plan.kinds };
    tvTrip.natives = routeDrawPoints(shared.state.worldCoords(shared.player.pos), legs, { x: n.x, z: n.z }, tvLegMid);
    tvTrip.end = { x: n.x, z: n.z, label: '', kind: 'target' };
    tvTrip.line = travelTripLine({ spot: true, sea: !!plan && crossesWater(plan.kinds) });
    return true;
  }
  function tvJourneyUp() {
    if (!tvOwnsJourneys() || shared.travelView.state !== 'off' || !shared.travelOptions.isTravelActive || !shared.travelOptions.state?.autopilot) return;
    if (shared.gamePaused() || (shared.modes?.modalWindowUp?.() ?? false) || duelEnemyNear() || areEnemiesNearby(wildSeen(shared.exteriorFoePool())) || shared.navalHostileNear() || !travelViewAllowed().ok) return;
    shared.travelView.enter();
  }
  const TV_SEA_MOORED_M = 60;
  const TV_SEA_LAUNCH_M = 40;
  const TV_SEA_PROBE_S = 0.25;
  const TV_SEA_AHEAD_M = 150;
  const TV_SEA_LANE_M = 5;
  const TV_SEA_ASHORE_M = 60;
  const TV_SEA_BEACH_M = 10;
  const TV_SEA_NO_WAY_S = 180;
  function tvSeaWaterAt(x, z) {
    const t = shared.csaTerrainOf(shared.csaPixelAt(x, z));
    if (!t) return null;
    if (!shared.deepWaters && !t.tileMap) return false;
    let w = false;
    shared.csaCall(() => { w = shared.csaRuntime.nodeReadingAt([x, shared.tvSeaY(), z], t) === 0; });
    return w;
  }
  const tvSeaCrosses = (rig) => !!rig && (rig.sails > 0 || rig.crewed) && (rig.cargo > 0 || !!shared.csaRuntime?.helmResponsive());
  const tvSeaRig = (b) => ({ sails: b.Sails.length, crewed: !!b.crewed, cargo: b.modifierCargoThreshold });
  const tvSeaParts = () => (playerEntity.items ?? []).find((it) => it?.templateIndex === CSA_PARTS_TEMPLATE && tvSeaCrosses(shared.csa.hullRig?.(csaHullFromMessage(it.message ?? 0)))) ?? null;
  function tvSeaMeans() {
    if (!shared.csaRuntime || !shared.csaOn()) return null;
    if (shared.csaRuntime.isSailing()) {
      const b = shared.csaRuntime.state.CurrentBoat;
      return tvSeaCrosses(tvSeaRig(b)) ? { start: 'sea', again: !!b.packable, boat: b, how: 'helm', voyage: !!b.charter } : null;
    }
    const feet = shared.player.pos;
    for (const b of shared.csaRuntime.AllBoats) {
      if (!b.GameObject?.activeSelf || b.inside || b.charter || !tvSeaCrosses(tvSeaRig(b))) continue;
      const p = b.GameObject.position;
      if (Math.hypot(p[0] - feet[0], p[2] - feet[2]) <= TV_SEA_MOORED_M) return { start: 'sea', again: !!b.packable, boat: b, how: 'moored' };
    }
    return tvSeaParts() ? { start: 'land', again: true, boat: null, how: 'parts' } : null;
  }
  function tvMooredDry(means, plan, replan) {
    if (means?.how !== 'moored' || !plan || plan.kinds.includes('sea')) return null;
    return replan();
  }
  const tvSeaAsk = (means, goal) => (means ? { ...means, again: means.again && !means.voyage, goal } : null);
  function tvOfferPassage(place) {
    const fare = partyTripFare(place.pixel, { ...travelMapPopUpState(), travelShip: true });
    if (!fare.opts.travelShip) return false;
    const refused = partyTravelRefusal();
    if (refused) { tvSay(refused); return true; }
    if (giveOffer()) return true;
    if (!fare.afford) { tvSay(`${TRAVEL_VIEW_TEXT.noWay} ${fareText(fare.computed, false, fare.coinsShort)}`); return true; }
    const pick = { pixel: place.pixel, name: place.name, mapId: place.mapId, regionIndex: place.regionIndex, locationIndex: place.locationIndex };
    const days = travelDays(fare.computed.minutes);
    const viewUp = !!shared.travelView && shared.travelView.state !== 'off';
    let sailed = false;
    shared.townTalk.showOverlay(new YesNoBoxWindow({
      rows: shipPassageRows(place.name, fareText(fare.computed), days, fare.unwell, sharedClockOn()),
      onYes: () => {
        sailed = true;
        shared.travelOptions?.clearTravelDestination();
        if (!shared.partyTravel?.propose(pick, fare.opts, fare.computed)) shared.partyTravelJourney(pick, fare.opts, fare.computed);
      },
    }), () => { if (viewUp && !sailed) shared.travelView?.enter(); });
    return true;
  }
  function tvSeaNoWay(from, to, means, net, goal, place = null) {
    const sea = !means && !!planRoute(from, to, { roads: net?.roads ?? null, tracks: net?.tracks ?? null, ...tvRouteGround(), sea: { start: 'land', again: true, goal } });
    if (sea && place && tvOfferPassage(place)) return;
    const boat = sea && !!shared.csaRuntime && shared.csaOn();
    tvSay(boat ? TRAVEL_VIEW_TEXT.needBoat : goal === 'sea' ? TRAVEL_VIEW_TEXT.water : TRAVEL_VIEW_TEXT.noWay);
  }
  function tvSeaRelease() { shared.csaJourneyHelm.held.clear(); shared.csaJourneyHelm.row = false; }
  function tvSeaBegin(means, kinds) {
    tvSeaRelease();
    shared.tvSea.phase = null; shared.tvSea.boat = null; shared.tvSea.best = Infinity; shared.tvSea.bestS = 0; shared.tvSea.legAt = -1;
    shared.tvSea.helm = createSeaHelm();
    shared.tvSea.means = means && (crossesWater(kinds) || means.start === 'sea') ? means : null;
    if (shared.tvSea.means?.how === 'moored') shared.csaCall(() => shared.csaRuntime.StartSailing(shared.tvSea.means.boat));
  }
  function tvSeaStop(line) {
    tvSeaRelease();
    shared.tvSea.means = null;
    shared.travelControlUI?.closeWindow?.();
    tvSay(line);
  }
  function tvSeaMark() {
    const c = shared.travelOptions?.state?.autopilot?.destinationCentre;
    if (!c) return null;
    const [x, z] = shared.state.localFromWorld(c.x, c.z);
    return [x, shared.tvSeaY(), z];
  }
  function tvSeaLaunchSpot(hull, mark) {
    const rig = shared.csa.hullRig?.(hull);
    if (!rig?.nodes || !mark) return null;
    const feet = shared.player.pos;
    const reach = Math.max(...rig.nodes.map((q) => Math.hypot(q[0], q[2])));
    const base = Math.atan2(mark[0] - feet[0], mark[2] - feet[2]);
    for (const off of [0, -0.5, 0.5, -1, 1]) {
      const yaw = base + off, sx = Math.sin(yaw), sz = Math.cos(yaw);
      for (let d = 2; d <= TV_SEA_LAUNCH_M; d += 2) {
        if (!tvSeaWaterAt(feet[0] + sx * d, feet[2] + sz * d)) continue;
        const cx = feet[0] + sx * (d + reach + 1), cz = feet[2] + sz * (d + reach + 1);
        const floats = rig.nodes.every((q) => tvSeaWaterAt(cx + q[0] * sz + q[2] * sx, cz - q[0] * sx + q[2] * sz));
        if (floats) return { at: [cx, shared.tvSeaY(), cz], dir: [sx, 0, sz] };
        break;
      }
    }
    return null;
  }
  function tvSeaLaunch() {
    const parts = tvSeaParts();
    if (!parts) { tvSeaStop(TRAVEL_VIEW_TEXT.noBoat); return; }
    const spot = tvSeaLaunchSpot(csaHullFromMessage(parts.message ?? 0), tvSeaMark());
    if (!spot) return;
    let boat = null;
    shared.csaCall(() => { boat = shared.csaRuntime.LaunchFromParts(parts, () => playerEntity.items, spot.at, spot.dir, shared.csaTerrainOf(shared.csaPixelAt(spot.at[0], spot.at[2]))); });
    if (boat) shared.csaCall(() => shared.csaRuntime.StartSailing(boat));
  }
  function tvSeaLandAlong(p, dx, dz, far = TV_SEA_AHEAD_M, hulls = false) {
    let d = 5;
    while (hulls !== 'only' && d <= far && tvSeaWaterAt(p[0] + dx * d, p[2] + dz * d)) d += 5;
    return Math.min(hulls !== 'only' && d <= far ? d : Infinity, (hulls && shared.naval?.hullAlong(p, dx, dz, far)) || Infinity, (hulls && shared.quays?.pierAlong(p, dx, dz, far)) || Infinity);
  }
  function tvSeaFreer(p, fw, far) {
    const c = Math.SQRT1_2;
    const right = tvSeaLandAlong(p, (fw[0] + fw[2]) * c, (fw[2] - fw[0]) * c, far, true);
    const left = tvSeaLandAlong(p, (fw[0] - fw[2]) * c, (fw[2] + fw[0]) * c, far, true);
    return left > right ? -1 : 1;
  }
  function tvSeaLand(boat) {
    if (shared.tvSea.phase === 'landing') return;
    tvSeaRelease();
    shared.tvSea.phase = 'landing'; shared.tvSea.boat = boat;
    shared.csaJourneyHelm.press(CSA_BOAT_ACTIONS.disembark);
  }
  function tvSeaAshore() {
    const boat = shared.tvSea.boat;
    shared.tvSea.phase = null; shared.tvSea.boat = null;
    if (!boat || !shared.csaRuntime.AllBoats.includes(boat)) return;
    const p = boat.GameObject.position, fw = csaQuatRotate(boat.GameObject.rotation, [0, 0, 1]);
    const base = Math.atan2(fw[0], fw[2]);
    let placedAshore = false;
    ashore: for (let r = 2; r <= TV_SEA_ASHORE_M; r += 2) {
      for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.6, -1.6, Math.PI]) {
        const x = p[0] + Math.sin(base + off) * r, z = p[2] + Math.cos(base + off) * r;
        if (tvSeaWaterAt(x, z)) continue;
        const h = shared.heightAt(x, z);
        if (!Number.isFinite(h) || h < shared.tvSeaY() + 0.2) continue;
        shared.player.spawn(x, h + 0.05, z);
        placedAshore = true;
        break ashore;
      }
    }
    if (!placedAshore) { tvSeaStop(TRAVEL_VIEW_TEXT.noShore); return; }
    if (shared.tvSea.means?.again && boat.packable && shared.csaPassengersOn(boat) === 0 && !shared.csaRuntime.deedMissing(boat) && !shared.csaRuntime.partsTooHeavy(boat)) shared.csaCall(() => shared.csaRuntime.PackBoat(boat, true));
    else {
      if (!boat.charter) tvSay(TRAVEL_VIEW_TEXT.leftMoored);
      if (shared.tvSea.means) shared.tvSea.means = { ...shared.tvSea.means, again: false };
    }
  }
  function tvSeaSail(boat, kind, dt) {
    const s = shared.csaRuntime.state;
    const mark = tvSeaMark();
    if (!mark) return;
    const p = boat.GameObject.position, fw = csaQuatRotate(boat.GameObject.rotation, [0, 0, 1]);
    const v = s.velocityCurrent ?? [0, 0, 0];
    const landfall = kind === 'landfall';
    const far = Math.max(TV_SEA_AHEAD_M, seaHelmLook(shared.tvSea.helm, v[2]));
    const landAhead = tvSeaLandAlong(p, fw[0], fw[2], far);
    if (landfall && (shared.csaRuntime.IsBeached(boat) || (landAhead <= TV_SEA_BEACH_M && Math.abs(v[2]) < 0.6))) { tvSeaLand(boat); return; }
    if (!landfall && shared.csaRuntime.IsBeached(boat)) { tvSeaStop(TRAVEL_VIEW_TEXT.aground); return; }
    const gs = dt * worldTimeScale();
    const dist = Math.hypot(mark[0] - p[0], mark[2] - p[2]);
    if (dist < shared.tvSea.best - 20) { shared.tvSea.best = dist; shared.tvSea.bestS = 0; } else if ((shared.tvSea.bestS += gs) > TV_SEA_NO_WAY_S) { tvSeaStop(TRAVEL_VIEW_TEXT.noWayAtSea); return; }
    const w = s.windVectorCurrent ?? [0, 0, 0];
    let lane = landAhead, hulls = Infinity;
    for (const j of [1, 3, 4]) { const n = boat.Nodes?.[j]; if (n) { lane = Math.min(lane, tvSeaLandAlong(n.position, fw[0], fw[2], far)); hulls = Math.min(hulls, tvSeaLandAlong(n.position, fw[0], fw[2], far, 'only')); } }
    let markAhead = Infinity;
    if (dist >= 1) {
      const mx = (mark[0] - p[0]) / dist, mz = (mark[2] - p[2]) / dist, sb = boat.Nodes?.[3]?.position, pt = boat.Nodes?.[4]?.position;
      const half = (sb && pt ? Math.hypot(sb[0] - pt[0], sb[2] - pt[2]) / 2 : 0) + TV_SEA_LANE_M;
      for (const k of [-1, 0, 1]) markAhead = Math.min(markAhead, tvSeaLandAlong([p[0] + mz * half * k, p[1], p[2] - mx * half * k], mx, mz, Math.min(far, dist), landfall ? 'only' : true));
    }
    const cmd = seaHelmStep(shared.tvSea.helm, {
      heading: seaHeadingOf(fw[0], fw[2]), bearing: seaHeadingOf(mark[0] - p[0], mark[2] - p[2]), wind: [w[0], w[2]],
      hasSails: boat.Sails.length > 0, squareOnly: seaSquareOnly(boat), sailsUp: s.sailPosition > 0, canSail: shared.csaRuntime.CanSail(boat),
      way: v[2], dt: gs, landfall, landAhead: lane, markAhead, hullAhead: hulls, freer: Math.min(lane, hulls) <= far ? tvSeaFreer(p, fw, far) : 1,
      crewed: !!boat.crewed, oarWay: shared.csaRuntime.oarWayOf(boat),
      sailWay: shared.csaRuntime.sailWayOf(boat), free: !!shared.csaRuntime.helmResponsive(),
    });
    shared.csaJourneyHelm.held.clear();
    if (cmd.turn > 0) shared.csaJourneyHelm.held.add('MoveRight');
    else if (cmd.turn < 0) shared.csaJourneyHelm.held.add('MoveLeft');
    shared.csaJourneyHelm.row = cmd.row;
    if (cmd.sails) shared.csaJourneyHelm.press(CSA_BOAT_ACTIONS.toggleSail);
  }
  // Runs before Travel Options' frame, so its stops see a launch or landfall made this frame.
  function tvSeaFrame(dt) {
    const route = shared.travelOptions?.route;
    const live = !!shared.tvSea.means && !!shared.csaRuntime && !!route && !!shared.travelControlUI?.isShowing && !!shared.travelOptions?.state?.autopilot;
    if (!live) {
      if (shared.tvSea.wasLive) {
        tvSeaRelease();
        if (shared.csaRuntime?.isSailing() && shared.csaRuntime.state.sailPosition > 0) shared.csaJourneyHelm.press(CSA_BOAT_ACTIONS.toggleSail);
      }
      shared.tvSea.wasLive = shared.csaJourneyHelm.live = false;
      shared.tvSea.phase = null; shared.tvSea.boat = null;
      if (!route) shared.tvSea.means = null;
      return;
    }
    shared.tvSea.wasLive = shared.csaJourneyHelm.live = true;
    if (!shared.travelView?.active && !tvOwnsJourneys() && !shared.csaHoldsTimeScale() && worldTimeScale() !== (shared.tvHeld ?? shared.travelAsked)) setWorldTimeScale(shared.tvHeld ?? shared.travelAsked);
    const leg = route.legs[Math.min(route.i, route.legs.length - 1)] ?? null;
    const kind = leg?.kind ?? 'open';
    if (route.i !== shared.tvSea.legAt) { shared.tvSea.legAt = route.i; shared.tvSea.best = Infinity; shared.tvSea.bestS = 0; }
    if (shared.tvSea.phase === 'landing') {
      if (shared.csaRuntime.state.disembarking == null && !shared.csaRuntime.isSailing()) tvSeaAshore();
      return;
    }
    if (!shared.csaRuntime.isSailing()) {
      tvSeaRelease();
      const now = performance.now() / 1000;
      if (SEA_KINDS.includes(kind) && kind !== 'landfall' && now >= shared.tvSea.probeAt) { shared.tvSea.probeAt = now + TV_SEA_PROBE_S; tvSeaLaunch(); }
      return;
    }
    const boat = shared.csaRuntime.state.CurrentBoat;
    if (!SEA_KINDS.includes(kind)) { tvSeaLand(boat); return; }
    tvSeaSail(boat, kind, dt);
  }
  const climbingNow = () => !!(shared.player.climb?.isClimbing || shared.player.mantling || shared.player.onWall || shared.player.holdPending);
  function travelViewCanGo() {
    if (!shared.travelOptions) { tvSay(TRAVEL_VIEW_TEXT.noJourneys); return false; }
    if (climbingNow()) { tvSay(TRAVEL_VIEW_TEXT.climbing); return false; }
    if (duelEnemyNear() || areEnemiesNearby(shared.exteriorFoePool()) || shared.navalHostileNear()) { tvSay(TRAVEL_VIEW_TEXT.enemies); return false; }
    if (shared.csaAboard.aboard) { tvSay(TRAVEL_VIEW_TEXT.passenger); return false; }
    if (shared.wagonRiders?.seated()) { tvSay(TRAVEL_VIEW_TEXT.rider); return false; }
    return true;
  }
  const tvNearPlace = (summary) => {
    const r = locationWorldRect(summary.loc, summary.pixel.x, summary.pixel.y);
    const me = shared.state.worldCoords(shared.player.pos);
    return me.x >= r.minX - shared.TV_NEAR_REACH && me.x <= r.maxX + shared.TV_NEAR_REACH && me.z >= r.minZ - shared.TV_NEAR_REACH && me.z <= r.maxZ + shared.TV_NEAR_REACH;
  };
  function travelViewKey() {
    const st = shared.travelView?.state;
    if (st === 'up' || st === 'rising') shared.travelView.exit('key'); else shared.travelView?.enter();
  }
  function onTravelViewPick(clientX, clientY, e = null) {
    if (travelViewConfirmOpen()) { hideTravelViewConfirm(false); return; }
    shared._tvAttack = null;
    if (!shared.travelView?.eye || !shared._lastProj || !shared._lastView) return;
    if (!travelViewCanGo()) return;
    const [sx, sy] = canvasPoint(clientX, clientY, canvas.getBoundingClientRect());
    const dir = rayDirFromScreen(sx, sy, canvas.clientWidth, canvas.clientHeight, shared._lastProj, shared._lastView, shared.travelView.eye, worldViewportRect(canvas.clientWidth, canvas.clientHeight));
    if (!dir) return;
    const hit = horizonHit(shared.travelView.eye, dir, (x, z) => tvGroundAt(x, z, false));
    let pix = null, place = null, water = false, middle = false;
    if (hit.point) {
      const n = shared.state.worldCoords(hit.point);
      pix = worldCoordToMapPixel(n.x, n.z);
      let best = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const summary = tvPlaceSummary(pix.x + dx, pix.y + dy);
          if (!summary) continue;
          const r = tvPlaceRect(summary);
          if (!(n.x >= r.minX && n.x <= r.maxX && n.z >= r.minZ && n.z <= r.maxZ)) continue;
          const d = Math.hypot(n.x - r.cx, n.z - r.cz);
          if (d < best) { best = d; place = summary; }
        }
      }
      if (place && shared.travelOptions?.settings?.targetCoordsAllowed !== false && !pickTakesPlace({ hit: (middle = pickNearPlaceMiddle(n, tvPlaceRect(place), TV_PLACE_GROW)), nearby: tvNearPlace(place), fine: fineMoveHeld(e), mode: travelPathMode() })) place = null;
      water = !place && hit.point[1] <= shared.tvSeaY() + TV_SEA_EPS_M;
    }
    const what = classifyPick({ hit, place, water });
    if (what.kind === 'place') travelViewRouteTo(what.place);
    else if (what.kind === 'ground') { if (shared.travelOptions?.settings?.targetCoordsAllowed === false) tvSay(TRAVEL_VIEW_TEXT.placesOnly); else travelViewWalkTo(hit.point, pix, { outside: !middle && !fineMoveHeld(e) }); }
    else if (what.kind === 'water') { if (shared.travelOptions?.settings?.targetCoordsAllowed === false) tvSay(TRAVEL_VIEW_TEXT.placesOnly); else travelViewWalkTo(hit.point, pix, { water: true }); }
    else if (what.kind === 'far') tvSay(TRAVEL_VIEW_TEXT.far);
  }
  const TV_DOUBLE_CLICK_MS = 450;
  let _tvEnemyClick = null;

  const tvEnemyMarkKey = (key) => key.startsWith('band:') || key.startsWith('camp:') || (key.startsWith('peer:') && shared._wildStrangerIds.has(key.slice(5)));
  const foeCampKey = (f) => (f?.site && f.site === shared.riteHost?.siteNow() ? `rite:${f.site}` : f?.puppet ? (f._pupCamp ? `${f.puppet}:${f._pupCamp.id}` : null) : f?.campId != null ? `me:${f.campId}` : null);
  function tvAttackTarget(key) {
    if (key.startsWith('peer:')) {
      const id = key.slice(5), g = shared._wildStrangers.find((o) => o.id === id);
      if (!g) return null;
      const n = shared.state.worldCoords(g.feet);
      return { kind: 'peer', id, label: WILD_TEXT.stranger, point: g.feet, pix: worldCoordToMapPixel(n.x, n.z) };
    }
    if (key.startsWith('band:')) {
      const id = key.slice(5);
      const b = travelViewBands().find((o) => o.id === id) ?? [..._bandChase.values()].find((c) => c.band.id === id)?.band;
      const mk = b && !_bandSpent.has(b.id) ? bandMake(b) : null;
      if (!mk) return null;
      const p = bandPlace(b, bandNowMs());
      const n = mk.mobileTypes.length;
      return { kind: 'band', id, label: n > 1 ? `the ${mk.name} band (${n})` : `the ${mk.name}`, point: tvSceneOf(p.x, p.z, 0), pix: worldCoordToMapPixel(p.x, p.z) };
    }
    const id = key.slice(5), c = travelViewCamps().find((o) => o.key === id);
    if (!c) return null;
    const n = shared.state.worldCoords(c.at);
    const m = /^(.*), (\d+)$/.exec(c.label ?? '');
    const label = c.kind === 'rite' ? RITE_TEXT.markAsk(c.n) : m ? `the ${m[1]} (${m[2]})` : `the ${c.label}`;
    return { kind: 'camp', id, label, point: c.at, pix: worldCoordToMapPixel(n.x, n.z) };
  }
  function tvEnemyClick(key, e) {
    const t = performance.now();
    if (_tvEnemyClick?.key === key && t - _tvEnemyClick.t <= TV_DOUBLE_CLICK_MS) { _tvEnemyClick = null; tvAskAttack(key); return; }
    _tvEnemyClick = { key, t };
    if (e) onTravelViewPick(e.clientX, e.clientY, e);
  }
  function tvAskAttack(key) {
    const target = tvAttackTarget(key);
    if (!target || !travelViewCanGo()) return;
    showTravelViewConfirm({ rows: TRAVEL_VIEW_TEXT.attackAsk(target.label), yes: 'Yes', no: 'No', onYes: () => {
      const now = tvAttackTarget(key) ?? target;
      if (!travelViewCanGo()) return;
      shared._tvAttack = { kind: now.kind, id: now.id };
      travelViewWalkTo(now.point, now.pix);
    } });
  }
  function onTravelViewMark(key, e = null) {
    if (travelViewConfirmOpen()) { hideTravelViewConfirm(false); return; }
    if (tvEnemyMarkKey(key)) { tvEnemyClick(key, e); return; }
    shared._tvAttack = null;
    if (key.startsWith('bounty:')) { travelViewBountyWalk(key.slice(7)); return; }
    if (key.startsWith('wp:')) { travelViewWaypointWalk(key.slice(3)); return; }
    if (key === 'dest') { const summary = tvTripLive() ? tvTrip.plan?.summary : null; if (summary && travelViewCanGo()) travelViewRouteTo(summary); return; }
    if (key.startsWith('spawn:')) { travelViewSpawnWalk(key); return; }
    const qp = /^quest:(\d+),(\d+)$/.exec(key);
    const plate = qp ? { summary: tvPlaceSummary(Number(qp[1]), Number(qp[2])) } : shared.tvPlates.list.find((p) => p.key === key) ?? shared.tvFar.list.find((p) => p.key === key) ?? shared.tvDng.list.find((p) => p.key === key && p.summary);
    if (plate?.summary && travelViewCanGo()) travelViewRouteTo(plate.summary);
  }
  function travelViewPlaces() {
    const at = playerTravelPixel();
    const dg = tvKnownGen();
    if (shared.tvPlates.at && shared.tvPlates.at.x === at.x && shared.tvPlates.at.y === at.y && shared.tvPlates.dg === dg) return shared.tvPlates.list;
    const r = Math.max(1, shared.state.terrainDistance ?? 3);
    const list = [];
    for (let y = at.y - r; y <= at.y + r; y++) {
      for (let x = at.x - r; x <= at.x + r; x++) {
        const summary = tvPlaceSummary(x, y);
        if (!summary || summary.loc?.wildHall) continue;
        const rect = tvPlaceRect(summary);
        list.push({ key: `place:${summary.mapId}`, summary, x: rect.cx, z: rect.cz });
      }
    }
    shared.tvPlates = { at, dg, list };
    return list;
  }
  let _tvSettlements = null;
  function travelViewFarPlaces() {
    const at = playerTravelPixel();
    const near = Math.max(1, shared.state.terrainDistance ?? 3);
    const dg = tvKnownGen();
    if (shared.tvFar.at && shared.tvFar.at.x === at.x && shared.tvFar.at.y === at.y && shared.tvFar.near === near && shared.tvFar.dg === dg) return shared.tvFar.list;
    const settlements = (_tvSettlements ??= settlementPixels(locationIndex).filter((t) => !t.loc.ether));
    const list = farPlaces({ at, near, settlements: etherSea && inEther(at.x, at.y) ? [...settlements, ...etherPlaceRows(at, TV_FAR_RANGE, 'port')] : settlements, summaryOf: tvPlaceSummary })
      .map((f) => { const rect = tvPlaceRect(f.summary); return { key: f.key, summary: f.summary, x: rect.cx, z: rect.cz }; });
    shared.tvFar = { at, near, dg, list };
    return list;
  }
  let _tvDungeonRows = null;
  const tvDungeonRowsAt = (at, range = TV_FAR_RANGE) => {
    const bay = (_tvDungeonRows ??= dungeonRows(mapDict));
    return etherSea && inEther(at.x, at.y) ? [...bay, ...etherPlaceRows(at, range, 'ruin')] : bay;
  };
  const tvDungeonAt = (x, y) => locationIndex.get(`${x},${y}`) ?? (etherSea && inEther(x, y) ? tvEtherPlace(x, y) : null);
  const tvSpawnFound = (s) => hasDiscoveredLocationId(s.loc.mapTableData.mapId);
  const tvSpawnKnown = (s) => tvSpawnFound(s) || _announcedSpawnPixels.has(`${s.x},${s.y}`);
  const tvFiledSpawns = (at) => (params.has('online') ? filedSpawns({ at, rolls: (x, y) => spawnsDungeon(_spawnSalt, x, y),
    filed: (x, y) => hasDiscoveredLocationId(spawnedMapId(_spawnSalt, x, y)), indexed: (x, y) => locationIndex.has(`${x},${y}`), stand: tvSpawnAt }) : []);
  function travelViewDungeons() {
    if (typeof shared._tvListsReady !== 'undefined' && !shared._tvListsReady) return [];
    const at = playerTravelPixel();
    const dg = tvKnownGen();
    const grid = Math.max(1, shared.state.terrainDistance ?? 3), n = shared._locIndexGen;
    if (shared.tvDng.list.some((g) => g.spawn && tvSpawnGone(g.px, g.py))) shared.tvDng.at = null;
    if (shared.tvDng.at && shared.tvDng.at.x === at.x && shared.tvDng.at.y === at.y && shared.tvDng.dg === dg && shared.tvDng.grid === grid && shared.tvDng.n === n) return shared.tvDng.list;
    const dungeons = tvDungeonRowsAt(at), locAt = tvDungeonAt, isFound = (x, y) => !!tvPlaceSummary(x, y);
    const placed = (g) => {
      const r = locationWorldRect(g.loc, g.x, g.y);
      return { key: g.key, row: g.row, loc: g.loc, found: g.found, spawn: g.spawn, summary: g.found && !g.spawn ? tvPlaceSummary(g.x, g.y) : null,
        px: g.x, py: g.y, x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, rect: r };
    };
    const list = nearDungeons({ at, grid, dungeons, locAt, isFound, spawns: [...spawnedPixels(locationIndex), ...tvFiledSpawns(at)], spawnKnown: tvSpawnKnown,
      spawnFound: tvSpawnFound, spawnGone: (s) => tvSpawnGone(s.x, s.y) }).map(placed);
    shared.tvDng = { at, dg, grid, n, list };
    return list;
  }

  function travelViewFindList() {
    if (typeof shared._tvListsReady !== 'undefined' && !shared._tvListsReady) return [];
    const at = playerTravelPixel(), dg = tvKnownGen(), n = shared._locIndexGen;
    if (shared.tvFind.at && shared.tvFind.at.x === at.x && shared.tvFind.at.y === at.y && shared.tvFind.dg === dg && shared.tvFind.n === n) return shared.tvFind.list;
    const list = nearDungeons({ at, range: TV_FIND_REACH, max: Infinity, dungeons: tvDungeonRowsAt(at, TV_FIND_REACH),
      locAt: tvDungeonAt, isFound: (x, y) => !!tvPlaceSummary(x, y) }).filter((g) => !g.found).map((g) => {
      const r = locationWorldRect(g.loc, g.x, g.y);
      return { key: g.key, row: g.row, loc: g.loc, found: false, spawn: false, x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
    });
    shared.tvFind = { at, dg, n, list };
    return list;
  }

  const BOUNTY_SNAP_YARD_M = 20;
  function travelViewBountyWalk(id) {
    const s = _tvBountyHold.get(id)?.snap;
    if (!s || !travelViewCanGo()) return false;
    const pix = { x: s.px, y: s.py };
    if (s.place) {
      const loc = locationIndex.get(`${s.px},${s.py}`);
      if (loc) {
        const r = locationWorldRect(loc, s.px, s.py);
        return travelViewWalkTo(tvSceneOf((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, 0), pix, { door: r });
      }
    }
    const house = s.farmKey ? (shared.bountyFarms?.anchorFor?.(s.farmKey) ?? null) : null;
    if (house) {
      const feet = shared.player.feetAt();
      const d = Math.hypot(feet[0] - house[0], feet[2] - house[2]) || 1;
      const k = Math.min(1, BOUNTY_SNAP_YARD_M / d);
      return travelViewWalkTo([house[0] + (feet[0] - house[0]) * k, house[1], house[2] + (feet[2] - house[2]) * k], pix);
    }
    return travelViewWalkTo(tvSceneOf(s.x, s.z, 0), pix);
  }
  function travelViewWaypointWalk(id) {
    const w = waypointById(id);
    if (!w || !shared.travelView?.active || !travelViewCanGo()) return false;
    const n = mapPointToNative(w.mx, w.my);
    return travelViewWalkTo(tvSceneOf(n.x, n.z, 0), worldCoordToMapPixel(n.x, n.z));
  }
  function travelViewFollowDist() {
    const here = shared.state.worldCoords(shared.player.pos), out = {};
    for (const w of shownWaypoints()) {
      if (!isWaypointFollowed(w.id)) continue;
      const n = mapPointToNative(w.mx, w.my);
      out[w.id] = farDistanceText((Math.hypot(n.x - here.x, n.z - here.z) / 32768) * PIXEL_KM);
    }
    return out;
  }
  function onTravelViewContext(clientX, clientY, key) {
    if (travelViewConfirmOpen()) { hideTravelViewConfirm(false); return; }
    const ctx = waypointCtx();
    const say = (t) => { if (t) tvSay(t, 4); };
    if (key?.startsWith('wp:') && waypointById(key.slice(3))) {
      openWaypointMenu({ x: clientX, y: clientY, id: key.slice(3), by: ctx.by, canKind: ctx.canKind, onNote: say, owner: 'overworld',
        onTravel: (w) => travelViewWaypointWalk(w.id) });
      return;
    }
    if (!shared.travelView?.eye || !shared._lastProj || !shared._lastView) return;
    const [sx, sy] = canvasPoint(clientX, clientY, canvas.getBoundingClientRect());
    const dir = rayDirFromScreen(sx, sy, canvas.clientWidth, canvas.clientHeight, shared._lastProj, shared._lastView, shared.travelView.eye, worldViewportRect(canvas.clientWidth, canvas.clientHeight));
    if (!dir) return;
    const hit = horizonHit(shared.travelView.eye, dir, (x, z) => tvGroundAt(x, z, false));
    if (!hit.point) { tvSay(TRAVEL_VIEW_TEXT.far); return; }
    const n = shared.state.worldCoords(hit.point);
    openWaypointMenu({ x: clientX, y: clientY, point: nativeToMapPoint(n.x, n.z), by: ctx.by, canKind: ctx.canKind, onNote: say, owner: 'overworld' });
  }
  function travelViewSpawnWalk(key) {
    const g = travelViewDungeons().find((p) => p.key === key && p.found);
    if (!g || tvSpawnGone(g.px, g.py) || !travelViewCanGo()) return false;
    return travelViewWalkTo(tvSceneOf(g.x, g.z, 0), { x: g.px, y: g.py }, { door: g.rect });
  }
  let _tvFindAt = 0;
  function dungeonFindFrame(now) {
    if (now - _tvFindAt < 250) return;
    _tvFindAt = now;
    if (!isEnhanced() || (shared.modes?.mode ?? 'exterior') !== 'exterior' || !shared.walkMode || !shared.playerSpawned) return;
    if (worldMoveBusy()) return;
    const n = shared.state.worldCoords(shared.player.pos);
    const g = dungeonToFind({ feet: { x: n.x, z: n.z }, list: travelViewFindList(), mid: (d) => d });
    if (!g) return;
    if (discoverLocation(g.row.mapID, { regionName: maps.getRegionName(g.row.regionIndex), locationName: g.loc.name })) tvSay(dungeonFoundText(g.loc.name), 5);
  }
  const bandNowMs = () => Date.now() + (shared.online ? shared._sharedOffsetMs : 0);

  const wildStealth = () => skillValue(playerEntity, SKILLS.Stealth);
  const wildTravelling = () => (!!shared.travelControlUI?.isShowing && !!shared.travelOptions?.state?.autopilot) || shared.tvWalking > 0;
  const travellingOutdoors = () => wildTravelling() && (shared.modes?.mode ?? 'exterior') === 'exterior';
  const wildGated = (f) => shared._wildGate && !f.puppet && !shared.wildFoes.alerted(f) && !!f.ai?.feet && !shared._inAnyLocationRect(f.ai.feet);
  const wildSeen = (foes) => (shared._wildGate ? foes.filter((f) => !wildGated(f)) : foes);
  const viewSeen = (foes) => (shared._wildGate ? wildSeen(foes) : noticedFoes(foes, shared._inAnyLocationRect));
  function wildFoesFrame(dt) {
    shared._wildGate = wildTravelling() && (shared.modes?.mode ?? 'exterior') === 'exterior' && shared.walkMode && shared.playerSpawned;
    if (!shared._wildGate) return;
    const fx = shared.player.feetAt(), stealth = wildStealth(), hid = concealmentFlags(playerEntity), sdt = shared.gamePaused() ? 0 : dt * worldTimeScale(), now = performance.now() / 1000;
    for (const f of shared.exteriorFoes.foes) {
      if (f.dead || f.puppet || !f.ai?.feet || !foeHostile(f)) continue;
      if (isLocalPlayerTarget(f.ai.target)) { shared.wildFoes.alert(f, now); continue; }
      if (shared._inAnyLocationRect(f.ai.feet)) continue;
      const s = shared.wildFoes.step(f, { distM: Math.hypot(f.ai.feet[0] - fx[0], f.ai.feet[2] - fx[2]), reachM: f.ai.sightRadius ?? SIGHT_RADIUS, stealth, scaledDt: sdt, now, seesThrough: !!f.ai.seesThroughInvisibility, concealment: hid });
      if (s.noticed) shared.exteriorFoes.noticedPlayer?.(f, fx);
    }
  }
  const bandNight = (ms) => { const m = ((shared.online ? skyClassicMinutes(ms) : skyMinutes()) % 1440 + 1440) % 1440; return m < 360 || m > 1080; };
  const bandOk = (x, z) => {
    const px = Math.floor(x / 32768), py = 499 - Math.floor(z / 32768);
    return onBayOrEther(px, py) && !tvWater(px, py) && !_bandPlacePixels.has(`${px},${py}`) && !etherPlaceIsle(px, py);
  };
  function travelViewBands() {
    const at = bandPixelOf(playerTravelPixel()), ms = bandNowMs(), life = Math.floor(ms / BAND_LIFE_MS);
    if (!(shared.tvBandSeen.at && shared.tvBandSeen.at.x === at.x && shared.tvBandSeen.at.y === at.y && shared.tvBandSeen.life === life)) {
      if (shared.tvBandSeen.life !== life) bandPrune(life);
      const night = shared.tvBandSeen.life === life ? shared.tvBandSeen.night : bandNight(life * BAND_LIFE_MS + BAND_LIFE_MS / 2);
      shared.tvBandSeen = { at, life, night, list: bandsNear({ at, ms, night, ok: bandOk }) };
    }
    return shared.tvBandSeen.list;
  }
  function bandPrune(life) {
    for (const m of [_bandMake, _bandPos, _bandPeer]) for (const id of m.keys()) if (bandLifeOf(id) < life - 1 && !_bandChase.has(id)) m.delete(id);
    wildBands.prune((id) => bandLifeOf(id) >= life - 1 || _bandChase.has(id));
    for (const id of _bandSpent) if (bandLifeOf(id) < life - 1) _bandSpent.delete(id);
    for (let i = _bandSpentAt.length - 1; i >= 0; i--) if (bandLifeOf(_bandSpentAt[i]) < life - 1) _bandSpentAt.splice(i, 1);
  }
  function wildBornHere(px, py) { const m = wildMaskOf(maps); return (!!m && wildInside(m, px, py)) || (etherSea && shared._onlineWorldSession() && etherWildRingAt(px, py) > 0); }
  function bandMake(b) {
    if (_bandMake.has(b.id)) return _bandMake.get(b.id);
    const px = Math.floor(b.born.x / 32768), py = 499 - Math.floor(b.born.z / 32768);
    const hit = rollGroupComposition({ climateIndex: maps.getClimateIndex(px, py), playerLevel: shared.online ? bandLevelOf(b) : playerEntity.level, inLocationRect: false,
      gameMinutes: b.night ? 0 : 720, size: bandSizeOf(b) * (wildBornHere(px, py) ? WILD_PACK_MULT : 1) }, seededRng(bandMakeSeed(b)));
    const mk = hit?.mobileTypes?.length ? { mobileTypes: hit.mobileTypes, name: enemyDisplayName(hit.mobileTypes[0]) } : null;
    _bandMake.set(b.id, mk);
    return mk;
  }
  function bandPlace(b, ms) {
    const c = _bandChase.get(b.id);
    if (c) return c.pos;
    const pc = bandPeerChase(b.id);
    if (pc) return pc;
    const k = _bandPos.get(b.id);
    if (k && ms - k.ms < 250) return k;
    const p = wanderAt(b, ms, bandOk);
    const v = { ms, x: p.x, z: p.z };
    _bandPos.set(b.id, v);
    return v;
  }

  function tvBandSpritesStep(dt, tvf, eye) {
    const off = !tvf || !(tvf.blend > 0) || getPref('wildernessCamps') === false || playerEntity.preventEnemySpawns;
    if (off) { if (shared.bandSprites?.size) shared.bandSprites.clear(); shared._bandFeetHold.clear(); return; }
    shared.bandSprites ??= createBandSprites({ renderer, getTexture, uploadRecordFrame });
    const bms = bandNowMs(), here = shared.state.worldCoords(shared.player.pos);
    const list = [...travelViewBands()];
    for (const c of _bandChase.values()) if (!list.some((o) => o.id === c.band.id)) list.push(c.band);
    const out = [], keep = new Set();
    for (const b of list) {
      if (_bandSpent.has(b.id)) continue;
      const chasing = _bandChase.has(b.id);
      if (!markShown({ kind: chasing ? 'band chase' : 'band' })) continue;
      const mk = bandMake(b);
      if (!mk?.mobileTypes?.length) continue;
      const p = bandPlace(b, bms);
      const distM = Math.hypot(p.x - here.x, p.z - here.z) / NATIVE_PER_M;
      if (distM > 520) continue;
      let h = shared._bandFeetHold.get(b.id);
      if (!h) { h = {}; shared._bandFeetHold.set(b.id, h); }
      keep.add(b.id);
      out.push({ id: b.id, mobileType: mk.mobileTypes[0], feet: tvSceneKept(h, p.x, p.z, 0), distM });
    }
    for (const id of [...shared._bandFeetHold.keys()]) if (!keep.has(id)) shared._bandFeetHold.delete(id);
    shared.bandSprites.sync(out, { dt, eye, grow: tvf.grow, fade: tvf.blend });
  }
  function bandRoom(mk) { return shared.campMembers(mk.mobileTypes, 'band').length <= (shared.exteriorFoes.encounterRoom?.() ?? Infinity); }
  function bandStand(mk, yaw, dist) {
    if (!bandRoom(mk)) return false;
    const fx = shared.player.feetAt();
    const near = Math.min(dist, BAND_CONTACT_M);
    const minDistance = Math.max(BAND_STAND_MIN_M, near - PACK_SPACING), maxDistance = Math.max(BAND_STAND_MIN_M, near) + PACK_SPACING;
    for (const roadOk of [false, true]) for (const turn of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const stood = shared._standCampEncounter({ kind: 'band', mobileTypes: mk.mobileTypes, spacing: PACK_SPACING, alertRadius: PACK_ALERT_RADIUS,
        minDistance, maxDistance, bearingDegrees: 0, yawRad: yaw + turn, roadOk }, fx);
      if (!stood) continue;
      stood.foes.then((fs) => { for (const f of fs) if (f && !f.dead) { shared.wildFoes.alert(f, performance.now() / 1000); shared.exteriorFoes.noticedPlayer?.(f, shared.player.feetAt()); } }).catch(() => {});
      return true;
    }
    return false;
  }
  function bandYaw(pos) {
    const fx = shared.player.feetAt(), sp = tvSceneOf(pos.x, pos.z, 0);
    return Math.atan2(sp[0] - fx[0], sp[2] - fx[2]);
  }
  function bandDrop() { for (const id of _bandChase.keys()) bandSpend(id); _bandChase.clear(); }
  const bandTrailSay = (mk) => { const line = bandTrailLine(mk?.mobileTypes, enemyDisplayName); tvSay(line); shared.chatNotice(line); };
  function bandPeerChase(id) {
    const p = _bandPeer.get(id);
    if (!p) return null;
    if (performance.now() - p.at > p.hold) { _bandPeer.delete(id); return null; }
    return p;
  }
  function bandSpend(id) {
    _bandSpent.add(id);
    owSaySpent(id);
    const k = _bandSpentAt.indexOf(id);
    if (k >= 0) _bandSpentAt.splice(k, 1);
    _bandSpentAt.unshift(id);
    if (_bandSpentAt.length > BANDS_WIRE_MAX) _bandSpentAt.length = BANDS_WIRE_MAX;
  }
  function bandHear(from, raw, hold = BAND_WORD_MS, aged = 0) {
    const now = performance.now(), at = bandPixelOf(playerTravelPixel()), life = Math.floor(bandNowMs() / BAND_LIFE_MS);
    for (const [id, x, z, flag] of validBandWord(raw)) {
      if (!bandNearMe(id, at, life)) continue;
      if (flag === 2) { _bandSpent.add(id); _bandChase.delete(id); _bandPeer.delete(id); continue; }
      const cur = _bandPeer.get(id);
      if (hold > BAND_WORD_MS && cur && cur.hold <= BAND_WORD_MS && now - cur.at < cur.hold) continue;
      _bandPeer.set(id, { x, z, at: now - aged, from, hold });
      if (_bandChase.has(id) && chaseYields(shared.online?.id ?? '', from)) { _bandChase.delete(id); wildBands.forget(id); }
    }
  }

  let _bandWordKey = '';
  function bandWord(frame, full) {
    if (!_bandChase.size && !_bandSpentAt.length) { if (!_bandWordKey) return false; if (frame) { frame.bd = []; _bandWordKey = ''; } return true; }
    const word = bandWordOf(_bandChase, _bandSpentAt);
    const key = JSON.stringify(word);
    if (!full && !_bandChase.size && key === _bandWordKey) return false;
    if (frame) { frame.bd = word; _bandWordKey = key; }
    return true;
  }
  let _bandClock = 0;
  function bandFrame(now, dt) {
    if (worldMoveBusy()) return;
    const up = !!shared.travelView?.active;
    if (!up && !_bandChase.size) return;
    if (playerEntity.health <= 0 || shared.modes?.deathUp?.() || shared.gamePaused()) return;
    const aboard = shared.playerAfloat();
    if (!isEnhanced() || (shared.modes?.mode ?? 'exterior') !== 'exterior' || !shared.walkMode || !shared.playerSpawned || getPref('wildernessCamps') === false
      || playerEntity.preventEnemySpawns || shared.player.isPlayerSwimming || aboard
      || shared._inAnyLocationRect(shared.player.feetAt())) { bandDrop(); return; }
    const ms = bandNowMs(), n = shared.state.worldCoords(shared.player.pos), feet = { x: n.x, z: n.z };
    // A chase waits on its own clock: the shared clock keeps running while a hold pauses the chase.
    _bandClock += dt * 1000;
    const listed = travelViewBands(), sight = bandSight(shared.tvBandSeen.night);
    for (const [id, c] of _bandChase) {
      const s = bandChaseStep({ pos: c.pos, feet, dt, scale: worldTimeScale(), contact: up ? BAND_CONTACT_M : BAND_STAND_M, gainAt: c.gainAt, now: _bandClock, best: c.best });
      c.pos = s.pos; c.best = s.best; c.gainAt = s.gainAt; c.dist = s.dist;
      if (s.what === 'lost') { _bandChase.delete(id); bandSpend(id); bandTrailSay(bandMake(c.band)); }
      else if (s.what === 'contact' && !(c.retryAt > now)) {
        const mk = bandMake(c.band);
        if (!bandRoom(mk)) { c.retryAt = now + BAND_STAND_RETRY_MS; continue; }
        const met = shared.journeyMet();
        if (met === 'avoided') { _bandChase.delete(id); bandSpend(id); bandTrailSay(mk); continue; }
        if (met === 'ignored') { c.retryAt = now + BAND_STAND_RETRY_MS; continue; }
        c.yaw ??= bandYaw(c.pos);
        const stood = bandStand(mk, c.yaw, c.dist);
        if (stood || ++c.tries >= BAND_STAND_TRIES) { _bandChase.delete(id); bandSpend(id); if (!stood) bandTrailSay(mk); }
        else c.retryAt = now + BAND_STAND_RETRY_MS;
      }
    }
    const sdt = dt * worldTimeScale(), stealth = wildStealth();
    for (const b of listed) {
      if (_bandSpent.has(b.id) || _bandChase.has(b.id)) continue;
      if (!up || _bandChase.size >= 2 || bandPeerChase(b.id)) continue;
      const p = bandPlace(b, ms);
      const d = Math.hypot(p.x - feet.x, p.z - feet.z) / NATIVE_PER_M;
      if (!wildBands.step(b.id, { distM: d, reachM: sight, stealth, scaledDt: sdt, now: now / 1000 }).alerted) continue;
      const mk = bandMake(b);
      if (!mk) { _bandSpent.add(b.id); continue; }
      _bandChase.set(b.id, { band: b, pos: { x: p.x, z: p.z }, gainAt: _bandClock, best: d, dist: d, tries: 0, retryAt: 0 });
    }
  }
  function wildCampKeys() {
    const out = new Set();
    for (const f of shared.exteriorFoes.foes) {
      if (f.dead || !foeAlerted(f)) continue;
      if (f.puppet) { if (f._pupCamp) out.add(`${f.puppet}:${f._pupCamp.id}`); } else if (f.campId != null) out.add(`me:${f.campId}`);
    }
    return out;
  }
  function travelViewCamps() {
    const members = [];
    const rite = shared.riteHost?.siteNow() ?? null;
    for (const f of shared.exteriorFoes.foes) {
      if (f.dead || !f.ai?.feet) continue;
      if (rite && f.site === rite) members.push({ camp: `rite:${rite}`, kind: 'rite', type: f.mobileType, feet: f.ai.feet });
      else if (f.puppet) { if (f._pupCamp) members.push({ camp: `${f.puppet}:${f._pupCamp.id}`, kind: f._pupCamp.kind, type: f.mobileType, feet: f.ai.feet }); }
      else if (f.campId != null) members.push({ camp: `me:${f.campId}`, kind: f.campKind ?? 'pack', type: f.mobileType, feet: f.ai.feet });
      else if (loneMember(f)) members.push(loneMember(f));
    }
    return groupCamps(members, enemyDisplayName).map((c) => (c.kind === 'rite' ? { ...c, label: RITE_TEXT.mark(c.n) } : c));
  }

  function tvGroundGenNow() {
    const k = shared._tvGround, c = shared.state.compensation, t = performance.now();
    if (k[0] !== built.size || k[1] !== shared.state.mapOrigin.x || k[2] !== shared.state.mapOrigin.y || k[3] !== c[0] || k[4] !== c[1] || k[5] !== c[2] || t - k[6] > 500) {
      k[0] = built.size; k[1] = shared.state.mapOrigin.x; k[2] = shared.state.mapOrigin.y; k[3] = c[0]; k[4] = c[1]; k[5] = c[2]; k[6] = t;
      shared.tvGroundGen += 1;
    }
    return shared.tvGroundGen;
  }
  function tvSceneKept(holder, nx, nz, lift, onSea = false) {
    const gen = tvGroundGenNow();
    if (holder._tvGen !== gen || holder._tvNx !== nx || holder._tvNz !== nz || holder._tvSea !== onSea) {
      holder._tvAt = tvSceneOf(nx, nz, lift); holder._tvGen = gen; holder._tvNx = nx; holder._tvNz = nz; holder._tvSea = onSea;
      if (onSea) holder._tvAt[1] = Math.max(holder._tvAt[1], shared.tvSeaY() + lift);
    }
    return holder._tvAt;
  }

  const TV_RAID_LIST_MS = 500;
  const raidNowMs = () => Date.now() + shared._sharedOffsetMs;
  const tvRaidOpen = (px, py) => {
    if (!onBayOrEther(px, py) || maps.getClimateIndex(px, py) !== CLIMATES.Ocean) return false;
    if (inEther(px, py) && !navalRaidersOn()) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!tvWater(px + dx, py + dy)) return false;
    return true;
  };
  const tvRaidSea = (x, z) => {
    const px = Math.floor(x / RAID_NATIVE_PIXEL), py = 499 - Math.floor(z / RAID_NATIVE_PIXEL);
    return onBayOrEther(px, py) && tvWater(px, py);
  };
  function travelViewRaiders() {
    const t = performance.now();
    if (t - shared.tvRaid.at < TV_RAID_LIST_MS) return shared.tvRaid.list;
    shared.tvRaid.at = t;
    const ms = raidNowMs(), life = Math.floor(ms / RAIDER_LIFE_MS);
    if (life !== shared.tvRaid.life) {
      shared.tvRaid.life = life; for (const id of shared.tvRaid.spent) if (!shared.tvRaid.chase.has(id)) shared.tvRaid.spent.delete(id);
      for (let i = shared.tvRaid.spentAt.length - 1; i >= 0; i--) if (raiderLifeOf(shared.tvRaid.spentAt[i]) < life - 1) shared.tvRaid.spentAt.splice(i, 1);
      for (const id of shared.tvRaid.peer.keys()) if (raiderLifeOf(id) < life - 1) shared.tvRaid.peer.delete(id);
    }
    shared.tvRaid.list = raidersNear({ at: playerTravelPixel(), ms, open: tvRaidOpen, sea: tvRaidSea });
    return shared.tvRaid.list;
  }
  function raidContact() {
    if (warmAshesRaidRefusal()) return;
    // The raid teleport is no load: let go of the helm first, or the next sail returns you to it.
    if (shared.csaRuntime?.isSailing()) shared.csaCall(() => shared.csaRuntime.StopSailing());
    tvSeaRelease();
    const said = warmAshesRaidAtSea();
    if (said !== 'raid' && said !== 'raid-lent') return;
    shared.travelControlUI?.closeWindow?.();
    tvSay(TRAVEL_VIEW_TEXT.raidersAlongside);
  }
  const raidQuarry = () => !!shared.csaRuntime?.isSailing() || (playerEntity.activeEffects ?? []).some((e) => isBoatEffectBundle(e?.bundleName));
  function seaRaidSpend(id) {
    shared.tvRaid.spent.add(id);
    owSaySpent(id);
    const k = shared.tvRaid.spentAt.indexOf(id);
    if (k >= 0) shared.tvRaid.spentAt.splice(k, 1);
    shared.tvRaid.spentAt.unshift(id);
    if (shared.tvRaid.spentAt.length > RAIDERS_WIRE_MAX) shared.tvRaid.spentAt.length = RAIDERS_WIRE_MAX;
  }
  function seaRaidPeerChase(id) {
    const p = shared.tvRaid.peer.get(id);
    if (!p) return null;
    if (performance.now() - p.at > p.hold) { shared.tvRaid.peer.delete(id); return null; }
    return p;
  }
  function seaRaidHear(from, raw, hold = RAIDER_WORD_MS, aged = 0) {
    const now = performance.now(), at = playerTravelPixel(), life = Math.floor(raidNowMs() / RAIDER_LIFE_MS);
    for (const [id, x, z, flag] of validRaiderWord(raw)) {
      if (!raiderNearMe(id, at, life)) continue;
      if (flag === 2) { shared.tvRaid.spent.add(id); shared.tvRaid.chase.delete(id); shared.tvRaid.peer.delete(id); continue; }
      const cur = shared.tvRaid.peer.get(id);
      if (hold > RAIDER_WORD_MS && cur && cur.hold <= RAIDER_WORD_MS && now - cur.at < cur.hold) continue;
      shared.tvRaid.peer.set(id, { x, z, at: now - aged, from, hold });
      if (shared.tvRaid.chase.has(id) && chaseYields(shared.online?.id ?? '', from)) shared.tvRaid.chase.delete(id);
    }
  }
  function seaRaidHeld() {
    if (!navalRaidersOn()) return shared.tvRaid.chase;
    const out = new Map();
    for (const h of shared.naval.raiderHeld()) { const w = shared.state.worldCoords(h.pos); out.set(h.id, { pos: { x: w.x, z: w.z } }); }
    return out;
  }
  let _seaRaidWordKey = '';
  function seaRaidWord(frame, full) {
    const held = seaRaidHeld();
    if (!held.size && !shared.tvRaid.spentAt.length) { if (!_seaRaidWordKey) return false; if (frame) { frame.sr = []; _seaRaidWordKey = ''; } return true; }
    const word = raiderWordOf(held, shared.tvRaid.spentAt);
    const key = JSON.stringify(word);
    if (!full && !held.size && key === _seaRaidWordKey) return false;
    if (frame) { frame.sr = word; _seaRaidWordKey = key; }
    return true;
  }
  function raidFrame(dt) {
    if (playerEntity.health <= 0 || shared.modes?.deathUp?.() || shared.gamePaused() || worldMoveBusy()) return;
    const at = warmAshesOn() && isEnhanced() && shared.walkMode && shared.playerSpawned && (shared.modes?.mode ?? 'exterior') === 'exterior' && raidQuarry();
    if (navalRaidersOn()) { shared.tvRaid.chase.clear(); raidShips(!!at); return; }
    if (!at) { for (const id of shared.tvRaid.chase.keys()) seaRaidSpend(id); shared.tvRaid.chase.clear(); return; }
    const scale = worldTimeScale();
    shared.tvRaid.clock += dt * 1000 * Math.max(1, scale);
    const up = !!shared.travelView?.active;
    const here = shared.state.worldCoords(shared.player.pos);
    const perM = RAID_NATIVE_PIXEL / 819.2;
    if (up && shared.tvRaid.chase.size < 1) {
      const sight = raiderSight(isNight(minuteNow()));
      for (const r of travelViewRaiders()) {
        if (shared.tvRaid.spent.has(r.id) || shared.tvRaid.chase.has(r.id) || seaRaidPeerChase(r.id)) continue;
        if (Math.hypot(r.x - here.x, r.z - here.z) / perM > sight) continue;
        shared.tvRaid.chase.set(r.id, { raider: r, pos: { x: r.x, z: r.z }, best: Infinity, bestAt: shared.tvRaid.clock });
        break;
      }
    }
    for (const [id, c] of shared.tvRaid.chase) {
      const step = raiderChaseStep({ pos: c.pos, quarry: here, dt, scale, contact: up ? RAIDER_CONTACT_M : RAIDER_CONTACT_PLAY_M, now: shared.tvRaid.clock, best: c.best, bestAt: c.bestAt, sea: tvRaidSea });
      c.pos = step.pos; c.best = step.best; c.bestAt = step.bestAt;
      if (step.state === 'chase') continue;
      shared.tvRaid.chase.delete(id); seaRaidSpend(id);
      if (step.state === 'contact') raidContact();
    }
  }
  const LANE_LIST_MS = 2000, LANE_NEAR_PX = 4;

  const laneOpen = (px, py) => px >= 0 && py >= 0 && px < 1000 && py < 500 && tvWater(px, py) && maps.getClimateIndex(px, py) === CLIMATES.Ocean;
  const laneOpenNative = (x, z) => { if (!(x >= 0 && z >= 0 && x < 1000 * RAID_NATIVE_PIXEL && z < 500 * RAID_NATIVE_PIXEL)) return false; const p = pixelOfNative(x, z); return laneOpen(p.x, p.y); };

  function laneShips() {
    const t = performance.now();
    if (t - shared._laneAt < LANE_LIST_MS || !shared.naval?.enabled || !mapDict) return;
    shared._laneAt = t;
    const here = playerTravelPixel(), ms = raidNowMs();
    const list = [];
    const portOf = (p) => (p ? { key: `port:${p.id}`, name: p.name } : null);
    for (const lane of laneNet()) {
      const near = (p) => Math.hypot(p.road.x - here.x, p.road.y - here.y) <= LANE_PATH_PX / 2 + LANE_NEAR_PX;
      if (!near(lane.a) && !near(lane.b)) continue;
      let way = shared._laneWays.get(lane.key);
      if (way === undefined) { way = laneWay(lane, laneOpen, laneOpenNative); shared._laneWays.set(lane.key, way); }
      if (!way) continue;
      const out = way.pts.map((q) => shared.state.localFromWorld(q.x, q.z)), home = [...out].reverse();
      for (const p of packetsAt(lane, way, ms)) {
        const [x, z] = shared.state.localFromWorld(p.at.x, p.at.z);
        const [dx, dz] = shared.state.localFromWorld(p.at.x + p.dir.x, p.at.z + p.dir.z);
        list.push({ id: p.id, seed: p.seed, seeds: p.seeds, classId: p.cls.id, region: p.region, phase: p.phase, pos: [x, 0, z], yaw: Math.atan2(dx - x, dz - z),
          leg: p.leg === way.pts ? out : home, port: portOf(p.port), to: portOf(p.to), from: portOf(p.from) });
      }
    }
    shared.naval.liners(list);
  }
  const navalRaidersOn = () => shared.navalOn() && !!shared.naval?.enabled && warmAshesOn();

  function raidShips(atSea) {
    const t = performance.now();
    if (t - shared._raidShipsAt < TV_RAID_LIST_MS) return;
    shared._raidShipsAt = t;
    const list = [], held = new Map();
    if (atSea) {
      const ms = raidNowMs();
      for (const r of travelViewRaiders()) {
        if (shared.tvRaid.spent.has(r.id)) continue;
        const p = seaRaidPeerChase(r.id);
        if (p) held.set(r.id, p.from);
        const [x, z] = shared.state.localFromWorld(r.x, r.z);
        const a = raiderAt(r, ms + RAIDER_LEAD_S * 1000, tvRaidSea);
        const [ax, az] = shared.state.localFromWorld(a.x, a.z);
        list.push({ id: r.id, seed: r.seed, pos: [x, 0, z], yaw: Math.atan2(ax - x, az - z), ahead: [ax, 0, az] });
      }
    }
    shared.naval.raiders(list, { sight: raiderSight(isNight(minuteNow())), spent: shared.tvRaid.spent, held });
  }
  function travelViewRoute() {
    if (!tvTripLive() || tvTrip.natives.length < 2) return [];
    const pts = [shared.player.feetAt()];
    const me = shared.state.worldCoords(pts[0]);
    const n = tvTrip.natives;
    const from = shared.travelOptions.route?.i ?? 0;
    const start = Math.min(n.length - 1, from + 1);
    const leg = (ax, az, bx, bz, out) => { for (let k = 1; k <= 4; k++) { const q = tvSceneOf(ax + (bx - ax) * (k / 4), az + (bz - az) * (k / 4), 1); if (shared.deepWaters) q[1] = Math.max(q[1], shared.tvSeaY() + 1); out.push(q); } };
    const j = shared.travelOptions.route?.join, sw = shared.travelOptions.route?.street?.pts.slice(shared.travelOptions.state?.autopilot?.seg ?? 0) ?? [];
    let at = me;
    for (const q of j ? [...sw, j] : sw) { leg(at.x, at.z, q.x, q.z, pts); at = q; }
    leg(at.x, at.z, n[start][0], n[start][1], pts);
    const gen = tvGroundGenNow(), kept = tvTrip._tail;
    let tail = kept && kept.gen === gen && kept.start === start && kept.n === n ? kept.pts : null;
    if (!tail) {
      tail = [];
      for (let i = start + 1; i < n.length; i++) leg(n[i - 1][0], n[i - 1][1], n[i][0], n[i][1], tail);
      tvTrip._tail = { gen, start, n, pts: tail };
    }
    for (const p of tail) pts.push(p);
    return pts;
  }
  function journeyThreats(up) {
    const out = [], fx = shared.player.feetAt();
    const rel = (nx, nz) => { const [x, z] = shared.state.localFromWorld(nx, nz); return [x - fx[0], z - fx[2]]; };
    if (up && getPref('wildernessCamps') !== false && !playerEntity.preventEnemySpawns) {
      for (const c of _bandChase.values()) { if (shared._tvAttack?.kind === 'band' && shared._tvAttack.id === c.band.id) continue; const [dx, dz] = rel(c.pos.x, c.pos.z); out.push({ dx, dz, reach: BAND_CONTACT_M, chasing: true, mps: BAND_CHASE_MPS }); }
    }
    if (up && warmAshesOn() && shared.csaOn() && raidQuarry()) {
      const sight = raiderSight(isNight(minuteNow()));
      for (const r of travelViewRaiders()) {
        if (shared.tvRaid.spent.has(r.id) || shared.tvRaid.chase.has(r.id)) continue;
        if (navalRaidersOn() && shared.naval.raiderShipOf(r.seed)) continue;
        const at = seaRaidPeerChase(r.id) ?? r, [dx, dz] = rel(at.x, at.z);
        out.push({ dx, dz, reach: sight });
      }
      for (const c of shared.tvRaid.chase.values()) { const [dx, dz] = rel(c.pos.x, c.pos.z); out.push({ dx, dz, reach: RAIDER_CONTACT_M, chasing: true, mps: RAIDER_CHASE_MPS }); }
    }
    for (const f of shared.exteriorFoes.foes) {
      if (!foeAlerted(f) || !f.ai.feet || f.ai.unreachable) continue;
      if (shared._tvAttack?.kind === 'camp' && foeCampKey(f) === shared._tvAttack.id) continue;
      out.push({ dx: f.ai.feet[0] - fx[0], dz: f.ai.feet[2] - fx[2], reach: f.ai.sightRadius ?? SIGHT_RADIUS });
    }
    for (const t of shared.naval?.threats() ?? []) out.push({ dx: t.pos[0] - fx[0], dz: t.pos[2] - fx[2], reach: t.reach, holds: t.holds, ...(t.chasing ? { chasing: true, mps: t.mps } : {}) });
    for (const g of shared._wildStrangers) if (!(shared._tvAttack?.kind === 'peer' && shared._tvAttack.id === g.id)) out.push({ dx: g.feet[0] - fx[0], dz: g.feet[2] - fx[2], reach: WILD_STRANGER_SLOW_M });
    return out;
  }
  function journeyThreatCap(up, keys = false) {
    const yaw = shared._travelDrive ? (shared._travelDrive.yaw * Math.PI) / 180 : keys ? shared._tvWalkYaw : null;
    const r = threatCap({ threats: journeyThreats(up), heading: yaw == null ? null : { x: Math.sin(yaw), z: Math.cos(yaw) }, speedMps: travellerPace(shared.player, shared.csaBoatUnderMe()) });
    let sr = 0;
    for (const g of shared._wildStrangers) {
      if (shared._tvAttack?.kind === 'peer' && shared._tvAttack.id === g.id) continue;
      const rate = g.dist <= 100 ? 1 : g.dist <= 200 ? 3 : g.dist <= 300 ? 5 : g.dist <= 600 ? 10 : 0;
      if (rate && (!sr || rate < sr)) sr = rate;
    }
    shared._strangerRateNow = sr;
    return sr ? { ...r, strangerRate: sr } : r;
  }

  const JOURNEY_SLOW_SAY_MS = 20000;
  function journeySlowSaid(why) {
    const t = performance.now();
    if (why === 'foes' && shared._slowWas !== 'foes' && t - shared._slowSaidAt >= JOURNEY_SLOW_SAY_MS) { tvSay(TRAVEL_VIEW_TEXT.enemiesSlow, 3); shared._slowSaidAt = t; }
    shared._slowWas = why;
  }

  const tvWalkHoldsTimeScale = () => shared.tvWalking > 0 && !!shared.travelView?.active;

  function travelViewGovern(dt) {
    const journey = !!shared.travelControlUI?.isShowing && !!shared.travelOptions?.state?.autopilot;
    if (journey && !shared.travelView?.active && tvOwnsJourneys()) {
      if (worldTimeScale() !== 1) setWorldTimeScale(1);
      shared.tvHeld = shared.travelAsked > 1 ? 1 : null;
      shared.tvHeldWhy = shared.tvHeld != null ? 'ground' : null;
      shared.tvWalking = 0;
      shared.travelGovernor.reset();
      return;
    }
    const walk = travelWalkRate({
      viewUp: shared.travelView?.state === 'up', journey,
      // A key held as the page loses focus never sends its keyup, so only count it with focus.
      moving: TV_MOVE_ACTIONS.some((a) => held(shared.keys, a)) && (typeof document === 'undefined' || document.hasFocus?.() !== false),
      onFoot: shared.walkMode && shared.playerSpawned && !shared.player.isPlayerSwimming && !shared.csaBoatUnderMe() && !(shared.player.climb?.isClimbing || shared.player.mantling || shared.player.onWall || shared.player.holdPending),
      paused: shared.gamePaused(),
      travels: !!shared.travelControlUI, onRoad: !journey && shared.travelView?.state === 'up' && shared.travellerOnRoad(),
    });
    const foes = journey || walk ? journeyThreatCap(!!shared.travelView?.active, !journey) : null;
    if (journey && !shared.travelView?.active) {
      const rate = shared.csaHoldsTimeScale() ? null : (foes.strangerRate ? Math.min(foeRate(foes, shared.travelAsked), foes.strangerRate) : foeRate(foes, shared.travelAsked));
      if (rate != null && worldTimeScale() !== rate) setWorldTimeScale(rate);
      shared.tvHeld = rate != null && rate < shared.travelAsked ? rate : null;
      shared.tvHeldWhy = shared.tvHeld != null ? 'foes' : null;
      journeySlowSaid(shared.tvHeldWhy);
      shared.tvWalking = 0;
      shared.travelGovernor.reset();
      return;
    }
    if (!shared.travelView?.active || !(journey || walk)) {
      if (shared.tvHeld != null) { shared.tvHeld = null; if (journey) setWorldTimeScale(shared.travelAsked); }
      shared.tvHeldWhy = null; journeySlowSaid(null);
      if (shared.tvWalking) { shared.tvWalking = 0; if (!shared.travelControlUI?.isShowing && !shared.csaHoldsTimeScale() && worldTimeScale() !== 1) resetTimeScale(); }
      shared.travelGovernor.reset();
      return;
    }
    const grid = Math.max(1, shared.state.terrainDistance ?? 3);
    // The outermost ring is unbuilt for a moment after every crossing, so it is never counted.
    const radius = Math.max(1, grid - 1);
    const px = playerTravelPixel(), gen = tvGroundGenNow(), uc = shared._tvUnbuilt;
    if (uc.gen !== gen || uc.x !== px.x || uc.y !== px.y || uc.r !== radius) {
      uc.n = unbuiltAround(px, radius, (x, y) => built.has(`${x},${y}`) || !shared.state.loaded.has(`${x},${y}`), uc.owed);
      uc.gen = gen; uc.x = px.x; uc.y = px.y; uc.r = radius;
    }
    const unbuilt = uc.n;
    const want = journey ? shared.travelAsked : walk;
    const load = shared.travelGovernor.step(dt, { unbuilt, requested: want, owed: uc.owed, feet: unbuilt ? shared.state.worldCoords(shared.player.feetAt()) : null, speedMps: travellerPace(shared.player, shared.csaBoatUnderMe()) });
    const foeCap = foes.strangerRate ? Math.min(foeRate(foes, want), foes.strangerRate) : foeRate(foes, want);
    const town = shared.tvInTown() ? TOWN_PACE_MAX : Infinity;
    const rate = Math.min(load, foeCap, town);
    if (worldTimeScale() !== rate) setWorldTimeScale(rate);
    shared.tvHeld = rate < want ? rate : null;
    shared.tvHeldWhy = shared.tvHeld == null ? null : town < Math.min(load, foeCap) ? 'town' : foeCap < load ? 'foes' : 'load';
    journeySlowSaid(shared.tvHeldWhy);
    shared.tvWalking = journey ? 0 : walk;
  }
  return {
    TV_PLACE_GROW, TV_PLACE_LIFT, TV_SEA_EPS_M, _bandChase, _bandMake, _bandPeer, _bandPos, _bandSpent, _bandSpentAt,
    _travelUIHolder, _tvVendorHold, bandDrop, bandFrame, bandHear, bandMake, bandNowMs, bandPlace, bandWord,
    carriageTown, climbingNow, dungeonFindFrame, dungeonTierSay, laneOpen, laneOpenNative, laneShips, navalRaidersOn,
    onTravelViewContext, onTravelViewMark, onTravelViewPick, raidFrame, raidNowMs, seaRaidHear, seaRaidHeld,
    seaRaidPeerChase, seaRaidSpend, seaRaidWord, travelViewAllowed, travelViewBands, travelViewCamps, travelViewCanGo,
    travelViewDungeons, travelViewFarPlaces, travelViewFollowDist, travelViewGovern, travelViewKey, travelViewPlaces,
    travelViewRaiders, travelViewResume, travelViewRoute, travelViewRouteTo, travelViewWalkTo, travelViewWaypointWalk,
    travelViewWhere, travellerSent, travellingOutdoors, tvBandSpritesStep, tvDungeonAt, tvDungeonRowsAt,
    tvFiledSpawns, tvGroundAt, tvGroundGenNow, tvJourneyUp, tvKnownGen, tvLegMid, tvMapForcesRoads, tvOwnsJourneys,
    tvPlaceRect, tvPlaceSummary, tvRoutesJourneys, tvSceneKept, tvSceneOf, tvSeaCrosses, tvSeaFrame, tvSeaLandAlong,
    tvSeaWaterAt, tvSpawnFound, tvSpawnKnown, tvTrip, tvTripLive, tvWalkHoldsTimeScale, tvWater, viewSeen, wildBands,
    wildCampKeys, wildFoesFrame, wildGated, wildSeen, wildStealth, wildTravelling,
  };
}
