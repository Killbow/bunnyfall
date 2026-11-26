import { amGroupRollOwner, rollGroupComposition } from '../../characters/campEncounters.js';
import { areEnemiesNearby, chooseRandomEnemy } from '../../characters/encounters.js';
import { BAND_KEEP_M, bandChest, createHideoutBook, createHideouts } from './hideouts.js';
import { bandTrouble, hideoutsOf, outlawBandAt } from './outlaws.js';
import { berthOf, crewsAshore, portPackets, sailorAt } from './portCrews.js';
import { BODY_BUILD_GATE, PeerBodies } from '../../net/peerBodies.js';
import { REGULAR_HEAD_M as CARD_REGULAR_HEAD_M } from '../../world/cardRegulars.js';
import { chapterBandOf, hallPosterName } from '../../net/npcChapterLaw.js';
import { chapterFactionOf } from '../../net/npcHallBook.js';
import { ChoiceWindow } from '../../ui/talkWindow.js';
import { CLASSIC_MINUTES_PER_SECOND, ownMinutes, skyMinutes, trustedWorldMinutes } from '../../world/worldTick.js';
import { classLookOf, createTravellerSprites } from '../../world/travellerSprites.js';
import { createDeepRemains, apartOf as deepRemainsApartOf } from '../../underwater/deepRemains.js';
import { createDryGround } from '../../world/dryGround.js';
import { createDungeonDivers } from './dungeonDivers.js';
import { createFamilyBodies, familyRoomSprites } from '../../world/familyBodies.js';
import { createLivingIndoors } from './livingIndoors.js';
import { createLivingRoads } from './livingRoads.js';
import { createRoadFights, LIVE_M } from './roadFights.js';
import { createRoadStands, FIGHT_NEAR_M } from './roadStands.js';
import { createRoadTeams } from '../../world/roadTeams.js';
import { createWayBook } from './ways.js';
import { CREW_SAY_RANGE, drawCrewLines } from '../../ui/navalHud.js';
import {
  cycleOf, diversAt, divesIn, fallenIn, handsOn, INN_TYPE, innGuestsOf, LIVING_NEAR_KEPT, livingNearKey, nativeDry,
  NEWS_DAYS, newsOf, paceScale, patrolCover, placeCycle, placeName, setsOut, townTrips, TRIP_REACH_PX,
  awayOf as tripAwayOf, townTrips as tripsOfTown, visitorsOf as tripVisitorsOf,
} from './trips.js';
import { clearedOf as deepClearedOf, routeOf as deepRouteOf, DIVE_CLEAR_MIN, stopOfMinute } from './deepRoute.js';
import { enemyDisplayName, enemyLevelOf } from '../../characters/enemyBasics.js';
import { enhancedHudScale } from '../../ui/enhancedHud.js';
import { fetchBytes, populatesWanderingNpcs } from '../../scenes/shared.js';
import { firstNameOf, foeWord, PATROL_HALT_LINES } from './lines.js';
import { getWorldClimateSettings, LOCATION_TYPES, longitudeLatitudeToMapPixel } from '../../formats/mapsFile.js';
import { goldStack } from '../../items/inventory.js';
import { hasPort, maskMapId } from '../../travel/travelPorts.js';
import { isEnhanced } from '../../ui/uiSkin.js';
import { isFamilyRes } from '../legacy/household.js';
import { LANE_DWELL_S, laneWay, packetAt, packetsAt } from '../naval/seaLanes.js';
import { LINE_HEAD_M as LIVING_HEAD_M, LivingTown } from './livingTown.js';
import { livingRemainsLay } from './remainsGoods.js';
import { livingWorldOn } from './livingSwitch.js';
import { lwSeed, textSeed } from './seed.js';
import { makeQuarry } from './quarry.js';
import { mintResident, travellerRoster } from './census.js';
import { morrowindDataCount, morrowindDataGeneration } from '../../scenes/dataSource.js';
import { mwViewHorseRig } from '../../player/mwView.js';
import { patrolHalts } from '../../justice/standing.js';
import { patronWords } from './patrons.js';
import { PERSON_MOVE_SPEED } from '../../characters/mobilePerson.js';
import { placeAt, turnKey } from './lives.js';
import { playerEntity } from '../../characters/playerEntity.js';
import { projectToScreen } from '../../player/tapRay.js';
import { RemotePlayers } from '../../net/remotePlayers.js';
import { routeGround } from '../../travel/travelRoute.js';
import { skyClassicMinutes, skyMinutesPerMsAt } from '../../net/skyLaw.js';
import { stockShopShelf } from '../../trade/shopStock.js';
import { BUILDING_TYPES as TALK_BUILDING_TYPES } from '../../world/buildingNames.js';
import { travellerOf } from '../../travel/caravanHost.js';
import { TREASURE_PILE_ARCHIVE } from '../../world/underwaterLoot.js';
import { troubledTrip, troubleOf } from './trouble.js';
import { watchStep } from './livingWatch.js';
import { WATER_BYTE } from '../../world/roadsProducer.js';
import { timeScale as worldTimeScale } from '../../world/timeScale.js';
import { worldViewportRect } from '../../ui/hudLarge.js';

/** @param {any} shared */
export function createLivingWorldHost(shared) {
  const {
    _hubRows, canvas, chapterSheet, cpuModels, duelEnemyNear, getGpuMesh, getTexture, laneNet, mapDict, maps,
    marketBook, palette, params, personTex, playerTravelPixel, renderer, terrainGen, townEcon, uploadRecordFrame,
  } = shared;
  const livingChapterOf = (/** @type {number} */ faction, /** @type {number} */ x, /** @type {number} */ y) => {
    const f = chapterFactionOf(faction, shared.townTalk?.factionDict ?? null) ?? faction;
    const region = (() => { try { return maps.getRegionIndexAt(x, y); } catch { return null; } })();
    const c = Number.isInteger(region) ? chapterSheet?.chapterOf(f, region) ?? null : null;
    return c == null ? null : { band: chapterBandOf(c.strength).band, name: `the ${hallPosterName(f)}`, event: c.event ?? null, shut: c.shut === true };
  };

  const livingBaseRate = () => (params.has('online') ? skyMinutesPerMsAt(Date.now() + shared._sharedOffsetMs) * 1000 : CLASSIC_MINUTES_PER_SECOND);
  const livingRate = () => (params.has('online') ? livingBaseRate() : CLASSIC_MINUTES_PER_SECOND * worldTimeScale());

  let _livingTowns = null;
  const releaseHubRows = () => { if (_livingTowns && _livingDungeons) _hubRows.length = 0; };
  /** @type {Map<number, any[]> | null} */
  let _livingByRegion = null;
  const livingTownsOfRegion = (region) => {
    if (!_livingByRegion) {
      _livingByRegion = new Map();
      for (const t of livingTownsIndex().values()) { const k = t.region | 0; if (!_livingByRegion.has(k)) _livingByRegion.set(k, []); _livingByRegion.get(k)?.push(t); }
    }
    return _livingByRegion.get(region | 0) ?? [];
  };
  const livingTownsIndex = () => {
    if (_livingTowns) return _livingTowns;
    _livingTowns = new Map();
    for (const loc of _hubRows) {
      const md = loc.mapTableData;
      if (!md || !populatesWanderingNpcs(md.locationType)) continue;
      const p = longitudeLatitudeToMapPixel(md.longitude, md.latitude);
      const ed = loc.exterior?.exteriorData;
      _livingTowns.set(p.y * 1000 + p.x, {
        mapId: md.mapId >>> 0, name: String(loc.name ?? ''), px: p.x, py: p.y, type: md.locationType, region: loc.regionIndex,
        people: getWorldClimateSettings(maps.getClimateIndex(p.x, p.y))?.people, blocks: Math.max(1, (ed?.width ?? 1) * (ed?.height ?? 1)),
        w: Math.max(1, ed?.width ?? 1), h: Math.max(1, ed?.height ?? 1),
        port: hasPort(md.mapId),
      });
    }
    releaseHubRows();
    return _livingTowns;
  };
  const LIVING_DIVE_TYPES = new Set([LOCATION_TYPES.DungeonLabyrinth, LOCATION_TYPES.DungeonKeep, LOCATION_TYPES.DungeonRuin, LOCATION_TYPES.Graveyard]);
  let _livingDungeons = null, _livingDungeonById = null;
  const livingDungeonsIndex = () => {
    if (_livingDungeons) return _livingDungeons;
    _livingDungeons = new Map(); _livingDungeonById = new Map();
    for (const loc of _hubRows) {
      const md = loc.mapTableData;
      if (!md || !LIVING_DIVE_TYPES.has(md.locationType)) continue;
      const p = longitudeLatitudeToMapPixel(md.longitude, md.latitude);
      const d = { mapId: md.mapId >>> 0, name: String(loc.name ?? ''), px: p.x, py: p.y, type: md.locationType, region: loc.regionIndex, blocks: 1, dungeon: true, dungeonType: md.dungeonType ?? 0 };
      _livingDungeons.set(p.y * 1000 + p.x, d); _livingDungeonById.set(d.mapId, d);
    }
    releaseHubRows();
    return _livingDungeons;
  };
  const _livingDungeonsNear = new Map();
  const livingDungeonsNear = (px, py, r) => {
    const key = livingNearKey(px, py, r);
    let got = _livingDungeonsNear.get(key);
    if (got) return got;
    got = [];
    const idx = livingDungeonsIndex();
    for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++) { const d = idx.get(y * 1000 + x); if (d) got.push(d); }
    got.sort((a, b) => a.mapId - b.mapId);
    if (_livingDungeonsNear.size > LIVING_NEAR_KEPT) _livingDungeonsNear.clear();
    _livingDungeonsNear.set(key, got);
    return got;
  };
  const _livingNear = new Map();
  const livingTownsNear = (px, py, r) => {
    const key = livingNearKey(px, py, r);
    let got = _livingNear.get(key);
    if (got) return got;
    got = [];
    const idx = livingTownsIndex();
    for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++) { const t = idx.get(y * 1000 + x); if (t) got.push(t); }
    got.sort((a, b) => a.mapId - b.mapId);
    if (_livingNear.size > LIVING_NEAR_KEPT) _livingNear.clear();
    _livingNear.set(key, got);
    return got;
  };
  let _livingGround = null;
  const livingWays = createWayBook({
    roads: () => terrainGen.roads(),
    ground: () => (_livingGround ??= routeGround((px, py) => maps.getClimateIndex(px, py), (px, py) => shared.woods.getHeightMapValue(px, py), WATER_BYTE)),
  });
  const livingRouteOf = (a, b) => livingWays.wayOf(a, b);
  const _livingRosters = new Map();
  /** @type {((nx: number, nz: number) => boolean) | null} */
  let _livingDry = null;
  const livingTripWorld = {
    townsNear: livingTownsNear,
    routeOf: livingRouteOf,
    rosterOf: (t) => { let r = _livingRosters.get(t.mapId); if (!r) { r = travellerRoster(t); _livingRosters.set(t.mapId, r); } return r; },
    templeTown: (t) => t.type === LOCATION_TYPES.ReligionTemple || t.blocks >= 9,
    dungeonsNear: livingDungeonsNear,
    dryAt: (nx, nz) => (_livingDry ??= nativeDry(createDryGround(shared.woods)))(nx, nz),
    townsIn: (region) => livingTownsOfRegion(region), marketBandOf: townEcon.marketBandOf,
  };
  const _livingTripMemo = new Map();
  let _livingWaysSeen = 0;
  const livingMemoFresh = () => { if (_livingTripMemo.size > 40000 || livingWays.generation !== _livingWaysSeen) { _livingTripMemo.clear(); _livingWaysSeen = livingWays.generation; } };
  const _livingTownById = new Map();
  const livingTownOfId = (id) => { if (!_livingTownById.size) for (const t of livingTownsIndex().values()) _livingTownById.set(t.mapId, t); return _livingTownById.get(id) ?? null; };
  const _livingPlaces = new Map();
  const _livingFates = new Map();
  let _livingTurnsRel = null, _livingTurnsV = -1;
  const livingTurnsFresh = () => {
    const v = shared.livingRelations.turnsVersion();
    if (_livingTurnsRel === shared.livingRelations && _livingTurnsV === v) return;
    _livingTurnsRel = shared.livingRelations; _livingTurnsV = v;
    _livingPlaces.clear(); _livingFates.clear(); _livingTripMemo.clear();
  };
  const livingPlaceOf = (res, k) => {
    const key = turnKey(res, k);
    let got = _livingPlaces.get(key);
    if (!got) {
      const pl = placeAt(res, k, shared.livingRelations.turns());
      const town = pl.vacant || pl.holder == null ? null : livingTownOfId(res.town);
      const holder = pl.vacant ? null : pl.holder == null ? res
        : (town ? mintResident(town, res.roll ?? 't', res.slot, res.job, { gen: pl.holder, home: res.home, work: res.work, faction: res.faction }) : res);
      got = { holder, dies: !pl.vacant && pl.dies, hand: pl.hand };
      if (_livingPlaces.size > 30000) _livingPlaces.clear();
      _livingPlaces.set(key, got);
    }
    return got;
  };
  const livingScale = () => paceScale(PERSON_MOVE_SPEED / livingBaseRate());
  const livingCycleOf = (res, day) => {
    if (res.roll !== 't') return cycleOf(res, day, livingScale()).k;
    const town = livingTownOfId(res.town);
    const roster = town ? livingTripWorld.rosterOf(town) : [];
    return placeCycle(roster.find((r) => r.slot === res.slot) ?? res, roster, day, livingScale());
  };
  const livingDeadAt = (res, t) => {
    if (isFamilyRes(res)) return false;
    const turns = shared.livingRelations.turns();
    if (!turns.slain.size && !turns.died.size && !turns.killed.size) return false;
    const h = livingPlaceOf(res, livingCycleOf(res, Math.floor((t - 240) / 1440))).hand;
    return h != null && h <= t;
  };
  const livingSlay = (res, t, seen) => {
    if (isFamilyRes(res)) { shared.legacyHost?.kinSlain(res); return; }
    shared.legacyHost?.residentDied(res.id);
    shared.livingRelations.turn('slain', turnKey(res, livingCycleOf(res, Math.floor((t - 240) / 1440))), { t, seen, who: res.name });
  };
  const livingDied = (res, t) => { shared.legacyHost?.residentDied(res.id); shared.livingRelations.turn('died', turnKey(res, livingCycleOf(res, Math.floor((t - 240) / 1440))), { t, who: res.name }); };
  const livingKilled = (res, t) => {
    if (isFamilyRes(res)) { shared.legacyHost?.kinKilled(res); return; }
    shared.legacyHost?.residentDied(res.id);
    shared.livingRelations.turn('killed', turnKey(res, livingCycleOf(res, Math.floor((t - 240) / 1440))), { t, who: res.name });
  };
  const livingTripPlace = (res, trip) => {
    const town = livingTownOfId(res.town);
    const roster = town ? livingTripWorld.rosterOf(town) : [];
    const place = roster.find((r) => r.slot === res.slot) ?? res;
    return livingPlaceOf(place, placeCycle(place, roster, Math.floor(trip.outT0 / 1440), livingScale()));
  };
  const livingHideoutsOf = createHideoutBook({
    of: (region) => hideoutsOf(region, livingTripWorld),
    generation: () => livingWays.generation,
    resolved: () => { _livingFates.clear(); _livingTripMemo.clear(); _livingToldKept.clear(); _livingVisitorsKept.clear(); for (const x of _livingCarried.values()) if (x.visits) _livingCarriedLast.set(x.map, x.visits); _livingCarried.clear(); },
  });
  const livingRouts = () => shared.livingRelations.turns().routed;
  const livingHideoutsNear = (x, z) => {
    const px = Math.floor(x / 32768), py = 499 - Math.floor(z / 32768);
    const regions = new Set(livingTripWorld.townsNear(px, py, 8).map((t) => t.region | 0));
    return [...regions].flatMap((r) => livingHideoutsOf(r));
  };
  let _livingCoverPending = false;
  const livingCovered = (c) => { if (c === undefined) _livingCoverPending = true; return !!c; };
  const livingTroubleWorld = {
    climateAt: (px, py) => maps.getClimateIndex(px, py),
    foesOf: ({ climateIndex, dungeonType, minute, level, size, rolls }) => (dungeonType != null
      ? Array.from({ length: size }, () => chooseRandomEnemy({ dungeonType, playerLevel: level }, rolls)).filter((m) => m >= 0)
      : rollGroupComposition({ climateIndex, skyMinutes: minute, inLocationRect: false, playerLevel: level, size }, rolls)?.mobileTypes ?? null),
    foeLevel: enemyLevelOf,
    dies: (res, trip) => { const pl = livingTripPlace(res, trip); return pl.dies && pl.hand == null; },
    diced: (res, trip) => livingTripPlace(res, trip).diced,
    turnOf: (id) => { const t = shared.livingRelations.turns(); return t.won.has(id) ? 'won' : t.lost.has(id) ? 'lost' : null; },
    covered: (trip) => livingCovered(patrolCover(trip, livingTripWorld, { mpm: PERSON_MOVE_SPEED / livingBaseRate(), memo: _livingTripMemo })),
    bandAt: (trip, px, py, t) => bandTrouble(trip, px, py, t, [...livingHideoutsOf(trip.from?.region), ...(trip.to?.region != null && trip.to.region !== trip.from?.region ? livingHideoutsOf(trip.to.region) : [])], livingRouts()),
  };
  livingTripWorld.holderOf = (res, k) => livingPlaceOf(res, k).holder;
  livingTripWorld.fated = (res, k) => livingPlaceOf(res, k).diced;
  livingTripWorld.fate = (trip) => {
    const key = `${trip.id}|${trip.party.map((m) => m.id).join(',')}`;
    let f = _livingFates.get(key);
    if (!f) {
      const was = _livingCoverPending;
      _livingCoverPending = false;
      const enc = troubleOf(trip, livingTroubleWorld);
      const waits = _livingCoverPending;
      _livingCoverPending = was;
      if (waits) return undefined;
      f = troubledTrip(trip, enc);
      f = handsOn(f, (m) => livingPlaceOf(m, livingCycleOf(m, Math.floor((trip.outT0 - 240) / 1440))).hand);
      if (_livingFates.size > 20000) _livingFates.clear();
      _livingFates.set(key, f);
    }
    return f;
  };
  const livingFoeWord = (type, n) => foeWord(enemyDisplayName(type) ?? '', n);
  const livingTripsOf = (town, day) => {
    livingMemoFresh();
    livingTurnsFresh();
    livingWordFresh();
    const o = { mpm: PERSON_MOVE_SPEED / livingBaseRate(), memo: _livingTripMemo };
    const noon = day * 1440 + 240 + 720;
    const trips = townTrips(town, noon, livingTripWorld, o);
    const roadVisitors = tripVisitorsOf(town, day, livingTripWorld, o);
    const guests = town.type === INN_TYPE ? innGuestsOf(town, day, livingTripWorld, o) : [];
    if (trips === undefined || roadVisitors === undefined || guests === undefined) return undefined;
    const visitors = roadVisitors.concat(guests.filter((g) => !roadVisitors.some((v) => v.res.id === g.res.id)));
    const roster = livingTripWorld.rosterOf(town);
    const scale = paceScale(o.mpm);
    const holders = new Map(), away = new Map();
    for (const res of roster) {
      const k = placeCycle(res, roster, day, scale);
      const pl = livingPlaceOf(res, k);
      const h = pl.holder && pl.dies && setsOut(pl.holder, town, k, livingTripWorld, o) === false ? null : pl.holder;
      holders.set(res.id, h);
      if (!h) continue;
      const w = tripAwayOf(h, trips);
      if (w.length) away.set(h.id, w);
    }
    const { told, news } = livingRoadNewsAt(town, noon, o);
    const places = [...new Set([...trips, ...told].map((tr) => placeName(tr.to)).filter(Boolean))].sort();
    return { away, visitors, holders, news, places };
  };
  const livingRoadNewsAt = (town, t, o) => {
    const noon = Math.floor((t - 240) / 1440) * 1440 + 240 + 720;
    const k = `${town.mapId >>> 0}:${noon}`;
    let told = _livingToldKept.get(k);
    if (!told) {
      told = [];
      let whole = true;
      for (let d = 0; d <= NEWS_DAYS; d++) { const tr = townTrips(town, noon - d * 1440, livingTripWorld, o); if (tr) told.push(...tr); else whole = false; }
      if (whole) { if (_livingToldKept.size > 2000) _livingToldKept.clear(); _livingToldKept.set(k, told); }
    }
    const won = shared.livingRelations.turns().won;
    return { told, whole: _livingToldKept.get(k) === told, news: newsOf(told, t).map((n) => ({ ...n, foe: n.band ?? (n.foe != null ? livingFoeWord(n.foe, 2) : ''), helped: won.has(n.enc) })) };
  };
  /**
   * @param {any} town
   * @param {number} day
   * @param {any} o
   * @param {boolean} relay
   */
  function* livingVisitsGen(town, day, o, relay) {
    /** @type {any[] & { partial?: boolean }} */
    const out = [];
    const seen = new Set();
    for (let d = 0; d <= NEWS_DAYS; d++) {
      const noon = (day - d) * 1440 + 240 + 720;
      for (const near of livingTripWorld.townsNear(town.px ?? 0, town.py ?? 0, TRIP_REACH_PX)) { if (townTrips(near, noon, livingTripWorld, o) === undefined) out.partial = true; yield; }
      const vs = livingVisitorsCached(town, day - d, o);
      if (vs === undefined) out.partial = true;
      yield;
      for (const v of vs ?? []) {
        const tr = v.trip;
        if (!tr?.from || seen.has(tr.id)) continue;
        seen.add(tr.id);
        const courier = tr.party.some((m) => m.job === 'courier');
        const from = { mapId: tr.from.mapId, region: tr.from.region, name: tr.from.name ?? '' };
        const heard = relay && courier ? yield* livingVisitsGen(tr.from, Math.floor((tr.outT0 - 240) / 1440), o, false) : [];
        if (heard.partial) out.partial = true;
        const fromNoon = Math.floor((tr.outT0 - 240) / 1440) * 1440 + 240 + 720;
        for (let b = 0; b <= NEWS_DAYS; b++) { townTrips(tr.from, fromNoon - b * 1440, livingTripWorld, o); yield; }
        const said = livingRoadNewsAt(tr.from, tr.outT0, o);
        if (!said.whole) out.partial = true;
        out.push({ id: tr.id, from, inT: tr.outT1, outT0: tr.outT0, courier, news: said.news, ...(heard.length ? { relay: heard } : {}) });
        yield;
      }
    }
    return out;
  }
  const _livingVisitorsKept = new Map(), _livingToldKept = new Map();
  const livingVisitorsCached = (town, day, o) => {
    const k = `${town.mapId >>> 0}:${day}`;
    if (_livingVisitorsKept.has(k)) return _livingVisitorsKept.get(k);
    const vs = tripVisitorsOf(town, day, livingTripWorld, o);
    if (vs !== undefined) { if (_livingVisitorsKept.size > 2000) _livingVisitorsKept.clear(); _livingVisitorsKept.set(k, vs); }
    return vs;
  };
  const _livingCarried = new Map();
  const livingCarriedOf = (town, day) => {
    livingWordFresh();
    const k = `${town.mapId >>> 0}:${day}`;
    let e = _livingCarried.get(k);
    if (e?.visits?.partial && performance.now() - e.at > LIVING_CARRIED_RETRY_MS) e = null;
    if (!e) {
      if (_livingCarried.size > 16) { for (const x of _livingCarried.values()) if (x.visits) _livingCarriedLast.set(x.map, x.visits); _livingCarried.clear(); }
      const was = _livingCarried.get(k)?.visits;
      if (was) _livingCarriedLast.set(town.mapId >>> 0, was);
      e = { gen: livingVisitsGen(town, day, { mpm: PERSON_MOVE_SPEED / livingBaseRate(), memo: _livingTripMemo }, true), visits: null, at: 0, map: town.mapId >>> 0 };
      _livingCarried.set(k, e);
    }
    return e.visits ?? _livingCarriedLast.get(town.mapId >>> 0) ?? null;
  };
  const _livingCarriedLast = new Map();
  const LIVING_CARRIED_RETRY_MS = 5000;
  let _livingWordV = null;
  const livingWordFresh = () => {
    livingMemoFresh();
    livingTurnsFresh();
    const v = `${livingWays.generation}|${shared.livingRelations.turnsVersion()}`;
    if (_livingWordV === v && _livingWordRel === shared.livingRelations) return;
    if (_livingWordRel !== shared.livingRelations) _livingCarriedLast.clear();
    else for (const x of _livingCarried.values()) if (x.visits) _livingCarriedLast.set(x.map, x.visits);
    _livingWordV = v; _livingWordRel = shared.livingRelations;
    _livingCarried.clear(); _livingVisitorsKept.clear(); _livingToldKept.clear();
  };
  let _livingWordRel = null;
  const LIVING_CARRIED_SLICE_MS = 3;
  /** @param {number} budgetMs */
  const livingCarriedStep = (budgetMs) => {
    const t0 = performance.now();
    for (const e of _livingCarried.values()) {
      while (!e.visits) {
        if (performance.now() - t0 >= budgetMs) return;
        let r;
        try { r = e.gen.next(); } catch (err) { console.warn('[living] the carried word', /** @type {any} */ (err)?.message ?? err); r = { done: true, value: null }; }
        if (r.done) { e.visits = r.value ?? Object.assign([], { partial: true }); e.at = performance.now(); _livingCarriedLast.set(e.map, e.visits); }
      }
    }
  };

  const livingLaneWay = (lane) => { let way = shared._laneWays.get(lane.key); if (way === undefined) { way = laneWay(lane, shared.laneOpen, shared.laneOpenNative); shared._laneWays.set(lane.key, way); } return way; };
  const livingLaneCount = (lane) => {
    let n = shared._livingLaneCounts.get(lane.key);
    if (n === undefined) { const way = livingLaneWay(lane); n = way ? packetsAt(lane, way, 0).length : 0; shared._livingLaneCounts.set(lane.key, n); }
    return n;
  };
  const livingPacketAt = (b) => { const way = livingLaneWay(b.lane); return way ? packetAt(b.lane, way, shared.raidNowMs(), b.k, b.count) : null; };
  const livingSailing = () => !!shared.naval?.enabled && !!mapDict;
  let _livingTownByPort = null;
  const livingTownOfPort = (portId) => {
    if (!_livingTownByPort) { _livingTownByPort = new Map(); for (const t of livingTownsIndex().values()) if (t.port) _livingTownByPort.set(maskMapId(t.mapId), t); }
    return _livingTownByPort.get(portId) ?? null;
  };
  const livingSailorsOf = (portId) => {
    const town = livingTownOfPort(portId);
    return town ? livingTripWorld.rosterOf(town).filter((r) => r.job === 'sailor') : [];
  };

  const livingAshore = (town, res) => {
    if ((typeof shared._lanesReady !== 'undefined' && !shared._lanesReady) || res.job !== 'sailor' || res.town !== town?.mapId || !town?.port || !livingSailing()) return null;
    const portId = maskMapId(town.mapId);
    let book = shared._livingBerths.get(portId);
    if (!book) { book = { packets: portPackets(laneNet(), portId, livingLaneCount), sailors: livingSailorsOf(portId) }; shared._livingBerths.set(portId, book); }
    return sailorAt(berthOf(res, book.sailors, book.packets), portId, livingPacketAt).at;
  };
  const livingCrews = (town) => {
    if ((typeof shared._lanesReady !== 'undefined' && !shared._lanesReady) || !town?.port || !livingSailing()) return [];
    const nowS = shared.raidNowMs() / 1000, t = skyMinutes(), rate = livingBaseRate();
    const day = Math.floor((t - 240) / 1440);
    return crewsAshore(maskMapId(town.mapId), laneNet(), livingLaneCount, livingPacketAt, livingSailorsOf).flatMap((c) => {
      const res = livingPlaceOf(c.res, livingCycleOf(c.res, day)).holder;
      return res ? [{ res: res.id === c.res.id ? c.res : res, berth: c.berth, inT: t - Math.max(0, nowS - (c.until - LANE_DWELL_S)) * rate, outT: t + Math.max(0, c.until - nowS) * rate }] : [];
    });
  };
  const livingTripTurnKey = (res, trip) => {
    const town = livingTownOfId(res.town);
    const roster = town ? livingTripWorld.rosterOf(town) : [];
    const place = roster.find((r) => r.slot === res.slot) ?? res;
    return turnKey(place, placeCycle(place, roster, Math.floor(trip.outT0 / 1440), livingScale()));
  };

  const livingDungeonHere = () => {
    const loc = shared.modes?.dungeonCtx?.abyss?.location?.();
    if (!loc) return null;
    const row = maps.getLocation(loc.regionIndex, loc.locationIndex);
    livingDungeonsIndex();
    return row?.mapTableData ? _livingDungeonById.get(row.mapTableData.mapId >>> 0) ?? null : null;
  };

  const livingDeepRoute = (trip) => {
    const d = shared._dungeonPool();
    const stops = d?.deepStops?.() ?? [];
    if (!stops.length || !trip?.dive) return null;
    if (shared._deepRoutesPool !== d) { shared._deepRoutes = new Map(); shared._deepRoutesPool = d; }
    let r = shared._deepRoutes.get(trip.id);
    if (r === undefined) { const e = d.deepEntry?.(); r = deepRouteOf(stops, e ? { x: e.x, y: e.y, z: e.z } : { x: stops[0].x, z: stops[0].z }, trip); shared._deepRoutes.set(trip.id, r); }
    return r;
  };
  const livingDeepCleared = (loc, stops, entry) => {
    // Online the room's stream owns the dungeon; a read here would differ between players.
    if (!livingWorldOn() || params.has('online') || !stops?.length || !loc?.mapTableData) return null;
    // An Ocean Holes abyss copies the map table of its template, so this id is the template id.
    if (shared.ohAbyss?.shouldUpgradeLoot()) return null;
    livingDungeonsIndex();
    const here = _livingDungeonById.get(loc.mapTableData.mapId >>> 0);
    if (!here) return null;
    const tBuild = skyMinutes();
    const from = entry ? { x: entry.x, y: entry.y, z: entry.z } : { x: stops[0].x, z: stops[0].z };
    const dives = divesIn(here, tBuild - DIVE_CLEAR_MIN, tBuild, livingTripWorld, { mpm: PERSON_MOVE_SPEED / livingBaseRate(), memo: _livingTripMemo }).dives;
    return deepClearedOf(dives.map((tr) => deepRouteOf(stops, from, tr)), tBuild);
  };
  const livingDiversStep = (now) => {
    const d = shared._dungeonPool();
    if (!d?.spawnLooseFoe || !livingWorldOn()) { if (shared.livingDivers) { shared.livingDivers.clear(); shared.livingDivers = null; } return; }
    if (shared.livingDivers?.pool !== d) {
      shared.livingDivers?.clear();
      shared.livingDivers = Object.assign(createDungeonDivers({
        spawn: (type, feet, o) => d.spawnLooseFoe(type, feet, { yawRad: o.yaw, allied: true, gender: o.gender, level: o.level }),
        remove: (f) => d.removeLooseFoe(f),
        inPool: (f) => d.foes.includes(f),
        leader: () => (shared.playerSpawned ? { feet: [shared.player.pos[0], shared.player.pos[1], shared.player.pos[2]], yaw: shared.cam.yaw } : null),
        spot: (from, dx, dz) => { const q = [from[0], from[1], from[2]]; try { d.collider?.move(q, dx, 0, dz, 1.8); } catch {} return [q[0], q[1], q[2]]; },
        owner: () => amGroupRollOwner(shared.online?.id ?? null, shared.player.feetAt(), shared.peersNear() ?? [], 200),
        relations: () => shared.livingRelations,
        turnKeyOf: livingTripTurnKey,
        dies: (res, trip) => livingTroubleWorld.dies(res, trip),
        day: () => Math.floor((skyMinutes() - 240) / 1440),
        say: (text) => d.hudSay?.(text),
        door: _livingRoadsDoor,
        spawnFoe: (type, feet, o) => d.spawnLooseFoe(type, feet, { yawRad: o.yaw, allied: false, gender: o.gender, level: o.level }),
        slay: livingSlay,
        died: livingDied,
        route: livingDeepRoute,
        floor: (x, y, z) => d.floorAt?.(x, y, z) ?? [x, y, z],
        clearLine: (a, b) => d.clearLine?.(a, b) ?? false,
        ring: (feet) => d.ringAt?.(feet),
        choose: (lines, options) => shared.modes?.dungeonCtx?.showOverlay?.(new ChoiceWindow({ lines, options })),
        stopPile: (key) => d.stopPile?.(key) ?? null,
      }), { pool: d });
      shared._livingDiversAt = -Infinity;
    }
    if (now - shared._livingDiversAt >= 1000) {
      shared._livingDiversAt = now;
      const here = livingDungeonHere();
      livingTurnsFresh();
      livingMemoFresh();
      shared._livingDiversList = here ? diversAt(here, skyMinutes(), livingTripWorld, { mpm: PERSON_MOVE_SPEED / livingBaseRate(), memo: _livingTripMemo }).divers : [];
    }
    shared.livingDivers.frame(shared._livingDiversList, skyMinutes());
  };

  const livingRemainsStep = (now) => {
    const d = shared._dungeonPool();
    if (!d?.layRemains || !livingWorldOn()) { if (shared.livingRemains) { shared.livingRemains.clear(); shared.livingRemains = null; } return; }
    if (shared.livingRemains?.pool !== d) {
      shared.livingRemains?.clear();
      shared._livingRemainsPlace.clear();
      shared.livingRemains = Object.assign(createDeepRemains({
        spots: () => d.restingSpots(),
        laid: (key) => shared.livingRelations.turns().laid.has(key),
        mark: (key) => shared.livingRelations.turn('laid', key),
        lay: (res, feet, key) => livingRemainsLay(d, res, feet, key),
        pileOf: (key) => d.remainsPile?.(key) ?? null,
        there: (feet) => d.pileNear(feet, 0.6),
        count: (pile) => pile?.items?.length ?? 0,
        feet: () => (shared.playerSpawned ? [shared.player.pos[0], shared.player.pos[1], shared.player.pos[2]] : null),
        say: (text) => d.hudSay?.(text),
        townName: (res) => livingTownOfId(res.town)?.name ?? '',
        placeOf: (r) => {
          if (shared._livingRemainsPlace.has(r.key)) return shared._livingRemainsPlace.get(r.key);
          const s = stopOfMinute(livingDeepRoute(r.trip), r.t);
          const at = s ? d.floorAt?.(s.x, s.y, s.z) ?? null : null;
          const dx = at ? deepRemainsApartOf(r) : 0;
          if (dx) { try { d.collider?.move(at, dx, 0, 0, 1.8); } catch {} }
          if (shared._livingRemainsPlace.size > 256) shared._livingRemainsPlace.clear();
          shared._livingRemainsPlace.set(r.key, at);
          return at;
        },
      }), { pool: d });
      shared._livingRemainsAt = -Infinity;
    }
    if (now - shared._livingRemainsAt >= 1000) {
      shared._livingRemainsAt = now;
      const here = livingDungeonHere();
      livingTurnsFresh();
      livingMemoFresh();
      const turns = shared.livingRelations.turns();
      shared._livingRemainsList = here ? fallenIn(here, skyMinutes(), livingTripWorld, { mpm: PERSON_MOVE_SPEED / livingBaseRate(), memo: _livingTripMemo }).remains.filter((r) => {
        const key = livingTripTurnKey(r.res, r.trip);
        return !turns.fallen.has(key) && !turns.spared.has(key) && !turns.slain.has(key) && !turns.died.has(key) && !shared.livingDivers?.stood(r.trip.id, r.res.id);
      }) : [];
    }
    shared.livingRemains.frame(shared._livingRemainsList);
  };

  const makeFamilyBodies = () => createFamilyBodies({
    dolls: new RemotePlayers({ renderer, deps: { fetchBytes, palette, getTexture, uploadRecordFrame } }),
    bodies: new PeerBodies({ renderer, enabled: () => isEnhanced() && morrowindDataCount() > 0, generation: morrowindDataGeneration, collider: () => shared.collider, gate: BODY_BUILD_GATE }),
  });
  const _livingIndoorsDoor = {
    refuses: (p) => shared.livingIndoors?.town()?.refuses(p) ?? null,
    talked: (p) => shared.livingIndoors?.town()?.talked(p) ?? null,
    caught: (p) => shared.livingIndoors?.caught(p) ?? null,
    toned: (p, taste) => shared.livingIndoors?.town()?.toned(p, taste) ?? null,
    moment: (p) => shared.livingIndoors?.town()?.moment?.(p) ?? null,
    regardCard: (p) => shared.livingIndoors?.town()?.regardCard?.(p) ?? null,
  };
  const livingTownOfMap = (mapId) => {
    for (const p of shared.built.values()) if (p.population instanceof LivingTown && (p.population.o.town.mapId >>> 0) === (mapId >>> 0)) return p.population;
    return null;
  };
  const livingIndoorsStep = (dt) => {
    if (!livingWorldOn() || shared._mode() !== 'interior') { if (shared.livingIndoors?.size || shared.livingIndoors?.spots().length) shared.livingIndoors.clear(); return; }
    shared.livingIndoors ??= createLivingIndoors({
      sprites: familyRoomSprites(createTravellerSprites({ renderer, getTexture, uploadRecordFrame, living: _livingIndoorsDoor, laneName: 'room' }), (shared.familyRoom ??= makeFamilyBodies()), _livingIndoorsDoor),
      building: () => {
        const b = shared.modes?.interiorBuilding;
        const town = b ? livingTownOfMap(b.townMapId ?? 0) : null;
        if (!b || !town) return null;
        if (shared.legacyHost?.isFamilyHouse({ mapId: b.townMapId ?? 0, buildingKey: b.buildingKey })) return { key: b.buildingKey, town, only: isFamilyRes };
        return shared.modes?.interiorCtx?.ownedRoom ? null : { key: b.buildingKey, town };
      },
      collider: () => shared.modes?.interiorCollider ?? null,
      floorAt: (x, y, z) => { const d = shared.modes?.interiorCollider?.raycast([x, y, z], [0, -1, 0], 3); return Number.isFinite(d) ? y - d : null; },
      origin: () => shared.modes?.interiorCtx?.landing ?? null,
      waysIn: () => shared.modes?.interiorCtx?.waysIn ?? [],
      staticFeet: () => (shared.modes?.interiorCtx?.people ?? []).map((p) => [p.x, p.y, p.z]),
      questFeet: () => shared.modes?.interiorQuestFeet?.() ?? [],
      doorsShut: (fn) => ((actions) => (actions?.withDoorsShut ? actions.withDoorsShut(fn) : fn()))(shared.modes?.interiorCtx?.actions),
      clock: skyMinutes,
      ready: () => !shared._loading && !shared.modes?.transitioning,
      beds: () => shared.modes?.interiorBeds ?? [],
      rented: () => shared.modes?.rentedBedHere ?? -1,
    });
    shared.livingIndoors.frame(dt, shared.player.pos, shared.cam.yaw, shared.cam.pos);
  };

  const livingArmOf = (res) => {
    const look = classLookOf(res);
    if (!look) return null;
    const tex = personTex.get(look.archive);
    if (!tex) {
      if (!shared._livingClassLoading.has(look.archive)) { shared._livingClassLoading.add(look.archive); getTexture(look.archive).then((t) => { if (t) personTex.set(look.archive, t); }).catch(() => {}); }
      return null;
    }
    return { ...look, frameCount: (rec) => tex.getFrameCount(rec), sex: res.sex };
  };
  const livingFlatOf = (flat) => {
    const tex = personTex.get(flat.archive);
    if (!tex) {
      if (!shared._livingClassLoading.has(flat.archive)) { shared._livingClassLoading.add(flat.archive); getTexture(flat.archive).then((t) => { if (t) personTex.set(flat.archive, t); }).catch(() => {}); }
      return null;
    }
    return { archive: flat.archive, record: flat.record, frameCount: Math.max(1, tex.getFrameCount(flat.record)) };
  };
  const _livingRoadsDoor = { refuses: (p) => shared.livingRoads?.refuses(p) ?? null, talked: (p) => shared.livingRoads?.talked(p) ?? null, caught: (p) => livingRoadCaught(p), roadside: true };

  const livingTripO = () => ({ mpm: PERSON_MOVE_SPEED / livingBaseRate(), memo: _livingTripMemo });
  const livingTravellerOf = (id) => travellerOf(id, livingTownOfId, livingTripWorld.rosterOf);
  const livingSlainAt = (res, t) => {
    const slain = shared.livingRelations.turns().slain;
    if (!slain.size) return false;
    const h = slain.get(turnKey(res, livingCycleOf(res, Math.floor((t - 240) / 1440))));
    return h != null && h.t <= t;
  };
  const livingTripLedBy = (res, t) => {
    const town = res ? livingTownOfId(res.town) : null;
    return town ? (tripsOfTown(town, t, livingTripWorld, livingTripO()) ?? []).find((tr) => tr.leader?.id === res.id && t < tr.backT1) ?? null : null;
  };

  const livingTravelEnemies = () => duelEnemyNear() || areEnemiesNearby([...shared.cityGuards.guards, ...shared.exteriorFoes.foes]) || shared.navalHostileNear();
  const caravanStep = (dt) => { if (livingWorldOn() && (shared._caravanT -= dt) <= 0) { shared._caravanT = 1; shared.caravanHostOf().step(); } };

  const PATRON_READ_S = 600;
  const PATRON_RETRY_S = 60;

  let _livingPatronsV = 0, _livingPatronsBusy = false, _livingPatronsNow = 0;
  /** @type {number|null} */
  let _livingPatronsWant = null;
  const livingPatronsDue = (region, nowS) => { const r = shared._livingPatronsRead.get(region); return !r || nowS - r.at >= (r.failed ? Math.min(PATRON_READ_S, PATRON_RETRY_S * 2 ** (r.fails - 1)) : PATRON_READ_S); };
  const livingPatronsRegion = () => {
    for (const b of shared.built.values()) if (b.population instanceof LivingTown) { const p = playerTravelPixel(); return p ? maps.getRegionIndexAt(p.x, p.y) : null; }
    return null;
  };
  const livingPatronsStep = (nowS, regionOf) => {
    if (!params.has('online') || !marketBook) return;
    _livingPatronsNow = nowS;
    const region = regionOf();
    if (region == null || region < 0 || !livingPatronsDue(region, nowS)) return;
    if (_livingPatronsBusy) { _livingPatronsWant = region; return; }
    livingPatronsRead(region, nowS);
  };
  const livingPatronsRead = (region, nowS) => {
    _livingPatronsBusy = true;
    const was = shared._livingPatronsRead.get(region);
    const mark = { at: nowS, failed: false, fails: was?.failed ? was.fails : 0 };
    shared._livingPatronsRead.set(region, mark);
    Promise.resolve(marketBook.vendors(region)).then((r) => {
      if (!r?.ok) { mark.failed = true; mark.fails++; return; }
      const rows = r.data?.rows ?? [];
      const byMap = new Map();
      for (const row of rows) {
        if (row.home?.entry !== 'public') continue;
        if (!byMap.has(row.map)) byMap.set(row.map, { told: [], traders: new Set() });
        byMap.get(row.map).traders.add(Number(row.buildingKey));
      }
      for (const p of r.data?.patrons ?? []) {
        const door = p.buildingKey;
        if (!Number.isSafeInteger(door)) continue;
        if (!byMap.has(p.map)) byMap.set(p.map, { told: [], traders: new Set() });
        // The sale time is the service's UTC; adding this machine's relay offset shifts its day.
        byMap.get(p.map).told.push({ door, t: skyClassicMinutes((p.hour * 3600 + p.minute * 60) * 1000), seed: p.seed });
      }
      for (const [map, e] of byMap) {
        const told = e.told.sort((a, b) => a.t - b.t || a.seed - b.seed || a.door - b.door);
        const traders = [...e.traders].sort((a, b) => a - b);
        const sig = JSON.stringify([told, traders]);
        if (shared._livingPatrons.get(map)?.sig === sig) continue;
        shared._livingPatrons.set(map, { v: ++_livingPatronsV, told, traders, region, sig });
      }
      for (const [map, e] of shared._livingPatrons) if (e.region === region && !byMap.has(map)) shared._livingPatrons.delete(map);
    }).catch(() => { mark.failed = true; mark.fails++; }).finally(() => {
      _livingPatronsBusy = false;
      const want = _livingPatronsWant;
      _livingPatronsWant = null;
      if (want != null && livingPatronsDue(want, _livingPatronsNow)) livingPatronsRead(want, _livingPatronsNow);
    });
  };
  /** @param {{ map: number, seed: number, hour: number, minute: number }} pt */
  const livingPatronName = (pt) => {
    const lt = livingTownOfMap(pt.map);
    const t = skyClassicMinutes((pt.hour * 3600 + pt.minute * 60) * 1000);
    return patronWords(lt ? lt.patronOfSale(pt.seed, t) : null, livingTownOfId(pt.map >>> 0)?.name ?? '');
  };
  const livingRoadSlay = (res, t, seen) => { livingSlay(res, t, seen); shared.caravanHostOf().slain(res, t); };
  const livingRoadCaught = (p) => {
    const id = shared.livingRoads?.caught(p) ?? null;
    if (p?.living?.res) shared.caravanHostOf().caught(p.living.res, skyMinutes());
    return id;
  };

  const livingBandChest = (band, t) => bandChest(band, t, {
    townOf: (id) => livingTownOfId(id),
    tripsOf: (town, at) => tripsOfTown(town, at, livingTripWorld, livingTripO()),
    shelf: (o) => stockShopShelf({ buildingType: TALK_BUILDING_TYPES.GeneralStore, quality: 10 }, playerEntity, o),
    gold: (n) => goldStack(n),
  });
  const livingHideoutOwner = (feet) => amGroupRollOwner(shared.online?.id ?? null, shared.player.feetAt(), (shared.peersNear() ?? []).filter((p) => Math.hypot(p.feet[0] - feet[0], p.feet[2] - feet[2]) <= BAND_KEEP_M), Infinity);
  const livingHideoutsHostOf = () => (shared._livingHideoutsHost ??= createHideouts({
    hideoutsNear: livingHideoutsNear,
    bandAt: (h, t) => outlawBandAt(h, t, livingRouts()),
    clock: () => skyMinutes(),
    here: () => (shared.playerSpawned ? shared.state.worldCoords(shared.walkMode ? shared.player.pos : shared.cam.pos) : null),
    ready: () => !!shared.walkMode && !!shared.playerSpawned && !shared._loading && !shared.modes?.transitioning && shared._mode() === 'exterior' && !shared.playerAfloat(),
    owner: livingHideoutOwner,
    sceneOf: (nx, nz) => shared.tvSceneOf(nx, nz, 0),
    spawn: (type, feet, o) => shared.exteriorFoes.spawnFoe(type, feet, { yaw: o.yaw, gender: o.gender, level: o.level, allied: false, loose: true, transient: true, managed: true }),
    remove: (f) => shared.exteriorFoes.removeFoe(f),
    inPool: (f) => shared.exteriorFoes.foes.includes(f),
    relations: () => shared.livingRelations,
    say: (text) => shared.townTalk.say(text),
    chest: livingBandChest,
    dropPile: (items, feet) => shared.droppedLoot.seedPile(items, feet, { archive: TREASURE_PILE_ARCHIVE, record: 0 }, null, null, { unsaved: true, owner: 'lw-hideout' }),
    removePile: (pile) => shared.droppedLoot.removePile(pile),
    engaged: (f) => !!f.ai?.detected && f.ai.targetIsLocalPlayer !== false,
    renderer, meshes: { getGpuMesh, cpuModels }, getTexture, uploadRecordFrame,
  }));
  const livingRoadsOf = () => (shared.livingRoads ??= createLivingRoads({
    world: livingTripWorld, mpm: PERSON_MOVE_SPEED / livingBaseRate(), clock: skyMinutes, baseRate: livingBaseRate,
    sceneOf: (nx, nz) => shared.tvSceneOf(nx, nz, 0),
    here: () => (shared.playerSpawned ? shared.state.worldCoords(shared.walkMode ? shared.player.pos : shared.cam.pos) : null),
    sprites: createTravellerSprites({ renderer, getTexture, uploadRecordFrame, living: _livingRoadsDoor }),
    teams: createRoadTeams({ renderer, presentation: () => shared.hcc.presentation, collider: () => shared.collider, horses3d: mwViewHorseRig }),
    memo: _livingTripMemo, relations: () => shared.livingRelations, playerName: () => playerEntity.name ?? '', weather: () => shared.weather,
    foeName: livingFoeWord,
    slay: livingRoadSlay,
    robbed: (tripId) => shared.caravanHostOf().robbed(tripId),
    unheard: (t) => { const h = livingHideoutsHostOf(), here = shared.playerSpawned ? shared.state.worldCoords(shared.player.pos) : null; return here ? h.unheardNear(here.x, here.z, t) : null; },
    heard: (band) => livingHideoutsHostOf().heard(band),
    fights: createRoadFights({
      spawn: (type, feet, o) => shared.exteriorFoes.spawnFoe(type, feet, { yaw: o.yaw, gender: o.gender, level: o.level, allied: o.allied, loose: true, transient: true, managed: true }),
      remove: (f) => shared.exteriorFoes.removeFoe(f),
      inPool: (f) => shared.exteriorFoes.foes.includes(f),
      // Elect among the players within LIVE_M of the fight, not of each player.
      owner: (feet) => amGroupRollOwner(shared.online?.id ?? null, shared.player.feetAt(), (shared.peersNear() ?? []).filter((p) => Math.hypot(p.feet[0] - feet[0], p.feet[2] - feet[2]) <= LIVE_M), Infinity),
      ready: () => !!shared.walkMode && !!shared.playerSpawned && !shared._loading && !shared.modes?.transitioning && shared._mode() === 'exterior' && !shared.playerAfloat(),
      sceneOf: (nx, nz) => shared.tvSceneOf(nx, nz, 0),
      clock: skyMinutes,
      relations: () => shared.livingRelations,
      turnKeyOf: livingTripTurnKey,
      dies: (res, trip) => livingTroubleWorld.dies(res, trip),
      died: livingDied,
      door: _livingRoadsDoor,
    }),
    stands: createRoadStands({
      spawn: (type, feet, o) => shared.exteriorFoes.spawnFoe(type, feet, { allied: o.allied, yaw: o.yaw, gender: o.gender, level: o.level, loose: true, transient: true, managed: true }),
      remove: (f) => shared.exteriorFoes.removeFoe(f),
      inPool: (f) => shared.exteriorFoes.foes.includes(f),
      ready: () => !!shared.walkMode && !!shared.playerSpawned && !shared._loading && !shared.modes?.transitioning && shared._mode() === 'exterior' && !shared.playerAfloat(),
      sceneOf: (nx, nz) => shared.tvSceneOf(nx, nz, 0),
      relations: () => shared.livingRelations,
      slay: livingRoadSlay, killed: livingKilled, died: livingDied,
      deadAt: livingDeadAt,
      fighting: () => shared.hccThreats().some((q) => Math.hypot(q[0] - shared.player.pos[0], q[2] - shared.player.pos[2]) <= FIGHT_NEAR_M),
      say: (text) => shared.townTalk.say(text),
      door: _livingRoadsDoor,
      wanted: (res, trip) => (res.job === 'patrol' && trip?.from?.region != null && patrolHalts(playerEntity, trip.from.region, { ownNow: ownMinutes(), worldNow: trustedWorldMinutes() })
        ? PATROL_HALT_LINES[lwSeed(textSeed(res.id)) % PATROL_HALT_LINES.length] : null),
    }),
  }));
  const _talkPersons = () => (shared.livingRoads && livingWorldOn() ? shared._livePersons.concat(shared.livingRoads.talkSeats()) : shared._livePersons);

  function livingLinePoints(points, w, h, rect, proj, view, eye) {
    for (const p of shared.built.values()) {
      const pop = p.population;
      if (typeof pop?.speech !== 'function' || !p.locOrigin) continue;
      const t = shared.state.pixelTranslation(p.px, p.py);
      const local = [eye[0] - t[0] - p.locOrigin[0], eye[1] - t[1], eye[2] - t[2] - p.locOrigin[2]];
      for (const l of pop.speech(local)) {
        const id = l.person.living?.id;
        if (!id) continue;
        const over = [l.person.pos[0] + p.locOrigin[0] + t[0], l.person.pos[1] + t[1] + LIVING_HEAD_M, l.person.pos[2] + p.locOrigin[2] + t[2]];
        const d = Math.hypot(over[0] - eye[0], over[1] - eye[1], over[2] - eye[2]);
        if (d > CREW_SAY_RANGE) continue;
        const at = projectToScreen(over, w, h, proj, view, rect);
        if (!at.front || at.x < -80 || at.x > w + 80 || at.y < -40 || at.y > h + 40) continue;
        const key = `live:${id}`;
        if (shared.crewSight.blocked(shared.player.collider, eye, key, over)) continue;
        points.push({ x: at.x, y: at.y, text: l.text, name: shared.livingRelations.known(id) ? firstNameOf(l.person.nameNPC) : null, who: key, kind: l.kind ?? 'talk', distance: d });
      }
    }
    if (!shared.livingRoads || !livingWorldOn()) return;
    for (const l of shared.livingRoads.speech(eye)) {
      const id = l.person.living?.id;
      if (!id || !l.person.pos) continue;
      const over = [l.person.pos[0], l.person.pos[1] + LIVING_HEAD_M, l.person.pos[2]];
      const d = Math.hypot(over[0] - eye[0], over[1] - eye[1], over[2] - eye[2]);
      if (d > CREW_SAY_RANGE) continue;
      const at = projectToScreen(over, w, h, proj, view, rect);
      if (!at.front || at.x < -80 || at.x > w + 80 || at.y < -40 || at.y > h + 40) continue;
      const key = `road:${id}`;
      if (shared.crewSight.blocked(shared.player.collider, eye, key, over)) continue;
      points.push({ x: at.x, y: at.y, text: l.text, name: shared.livingRelations.known(id) ? firstNameOf(l.person.nameNPC) : null, who: key, kind: 'talk', distance: d });
    }
  }
  function cardBarkPoints(proj, view, eye, w, h, rect) {
    const points = [];
    for (const b of shared._cardBarks) {
      const over = [b.feet[0], b.feet[1] + CARD_REGULAR_HEAD_M, b.feet[2]];
      const d = Math.hypot(over[0] - eye[0], over[1] - eye[1], over[2] - eye[2]);
      const at = projectToScreen(over, w, h, proj, view, rect);
      if (d > CREW_SAY_RANGE || !at.front) continue;
      points.push({ x: at.x, y: at.y, text: b.text, who: `card:${b.id}`, kind: 'talk', distance: d, name: firstNameOf(b.name) });
    }
    return points;
  }
  let _cardBarksShown = false;
  function cardBarkLines(proj, view, eye, dt) {
    if (!shared._cardBarks.length && !_cardBarksShown) return;
    _cardBarksShown = shared._cardBarks.length > 0;
    const covered = shared.townTalk.overlayActive || shared.gamePaused() || !!shared.townTalk.hudHidden || shared._mode() !== 'interior';
    const { w, h } = shared._canvasSize();
    drawCrewLines(covered ? [] : cardBarkPoints(proj, view, eye, w, h, worldViewportRect(w, h)), { covered, dt: shared.gamePaused() ? 0 : dt, scale: enhancedHudScale() });
  }
  function livingRoomLines(proj, view, eye, dt = 0) {
    if (!shared.livingIndoors && typeof document !== 'undefined') { cardBarkLines(proj, view, eye, dt); return; }
    if (!shared.livingIndoors || typeof document === 'undefined') return;
    const covered = shared.townTalk.overlayActive || shared.gamePaused() || !!shared.townTalk.hudHidden || shared._mode() !== 'interior';
    const points = [];
    if (!covered) {
      const { w, h } = shared._canvasSize(), rect = worldViewportRect(w, h);
      points.push(...cardBarkPoints(proj, view, eye, w, h, rect));
      for (const l of shared.livingIndoors.speech(eye)) {
        const id = l.person.living?.id;
        if (!id || !l.person.pos) continue;
        const over = [l.person.pos[0], l.person.pos[1] + LIVING_HEAD_M, l.person.pos[2]];
        const d = Math.hypot(over[0] - eye[0], over[1] - eye[1], over[2] - eye[2]);
        if (d > CREW_SAY_RANGE) continue;
        const at = projectToScreen(over, w, h, proj, view, rect);
        if (!at.front || at.x < -80 || at.x > w + 80 || at.y < -40 || at.y > h + 40) continue;
        const key = `in:${id}`;
        if (shared.crewSight.blocked(shared.player.collider, eye, key, over)) continue;
        points.push({ x: at.x, y: at.y, text: l.text, who: key, kind: 'talk', distance: d, name: shared.livingRelations.known(id) ? firstNameOf(l.person.nameNPC) : null });
      }
    }
    drawCrewLines(points, { covered, dt: shared.gamePaused() ? 0 : dt, scale: enhancedHudScale() });
  }

  const _livingWatchTurned = [];
  const livingDeedOf = (person, near = null) => {
    const town = livingWorldOn() ? person?.living?.town : null;
    if (!town?.slain) return;
    if (!person.guard) { town.slain(person); return; }
    town.struck(person);
  };
  const livingStruckPool = (pool) => (livingWorldOn() ? pool.map((e) => ({ ...e, disable: () => { livingDeedOf(e.person, e.pos); e.disable(); } })) : pool);
  const livingResidentOf = (id) => {
    for (const p of shared.built.values()) {
      const town = p.population;
      const res = town?.residentOf?.(id) ?? null;
      if (res) return { town, res };
    }
    return null;
  };
  const livingLocalOf = (town, feet) => {
    if (!feet) return null;
    for (const p of shared.built.values()) {
      if (p.population !== town) continue;
      const t = shared.state.pixelTranslation(p.px, p.py);
      return [feet[0] - t[0] - p.locOrigin[0], feet[1] - t[1], feet[2] - t[2] - p.locOrigin[2]];
    }
    return null;
  };
  const livingWatchStep = () => watchStep(_livingWatchTurned, shared.cityGuards.guards, { resolve: livingResidentOf, localOf: livingLocalOf });

  const livingPeerWatchStep = () => {
    shared._livingPeerWatch.clear();
    for (const f of shared.exteriorFoes.foes) if (f.puppet && typeof f.livingId === 'string') shared._livingPeerWatch.add(f.livingId);
    for (const p of shared.built.values()) p.population?.peerLend?.(shared._livingPeerWatch);
  };

  const livingQuarry = () => {
    if (!livingWorldOn() || shared._mode() !== 'exterior') return [];
    const out = [];
    for (const seat of shared._livePersons) {
      const p = seat.person, living = p?.living;
      if (!living?.town || p.guard) continue;
      let q = shared._quarryOf.get(p);
      if (!q || q.living !== living) { q = makeQuarry(p, (body) => body.living.town.killed(body.person)); shared._quarryOf.set(p, q); }
      if (q.entity.health <= 0) continue;
      q.ai.feet[0] = seat.pos[0]; q.ai.feet[1] = seat.pos[1]; q.ai.feet[2] = seat.pos[2]; q.ai.yaw = p.yaw;
      out.push(q);
    }
    return out;
  };
  const livingDangers = (px, py, locOrigin) => {
    const tr = shared.state.pixelTranslation(px, py), out = [];
    for (const f of shared.exteriorFoes.foes) {
      if (f.dead || !f.ai?.isHostile || f.companion != null || f.entity?.team === 'PlayerAlly') continue;
      out.push([f.ai.feet[0] - locOrigin[0] - tr[0], f.ai.feet[2] - locOrigin[2] - tr[2]]);
    }
    return out;
  };
  return {
    LIVING_CARRIED_SLICE_MS, _livingRoadsDoor, _livingTripMemo, _talkPersons, caravanStep, livingArmOf, livingAshore,
    livingBaseRate, livingCarriedOf, livingCarriedStep, livingChapterOf, livingCrews, livingCycleOf, livingDangers,
    livingDeadAt, livingDeedOf, livingDeepCleared, livingDiversStep, livingFlatOf, livingHideoutsHostOf,
    livingIndoorsStep, livingKilled, livingLaneWay, livingLinePoints, livingMemoFresh, livingPatronName,
    livingPatronsRegion, livingPatronsStep, livingPeerWatchStep, livingPlaceOf, livingQuarry, livingRate,
    livingRemainsStep, livingRoadsOf, livingRoomLines, livingSlainAt, livingSlay, livingStruckPool, livingTownOfId,
    livingTownOfMap, livingTownOfPort, livingTownsIndex, livingTravelEnemies, livingTravellerOf, livingTripLedBy,
    livingTripO, livingTripWorld, livingTripsOf, livingTurnsFresh, livingWatchStep, livingWays, makeFamilyBodies,
  };
}
