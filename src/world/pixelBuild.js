import { ANIMAL_SOUND_BY_RECORD, ANIMALS_ARCHIVE } from '../audio/soundClips.js';
import { applyClimate, getNatureArchive, getTerrainGroundArchive, INTERIOR_SEASON, SEASON } from './climateSwaps.js';
import { SEA_LEVEL_M } from '../weather/airTemperature.js';
import { ARENA_BLOCK } from './arenaCity.js';
import { armFlatAnim, FlatAnimator } from '../render/flatAnimation.js';
import { memorialFlatsFor } from './emperorMemorial.js';
import { billboardSize, BLOCK_FLATS_OFFSET_Y, centredBase, collectBlockFlats, isNatureArchive, NATURE_FLATS_Y } from './rmbFlats.js';
import { blockHillPatch, blockHillSeat, seatNatureFlat } from './townStandIns.js';
import { blockSolids } from './flatFields.js';
import { BODY } from './windmillMesh.js';
import { boxNearGate, gateSiteTest, pointNearGate, WOD_FLAT_GATE_CLEAR_M } from './gateClearance.js';
import { boxNearPath, pointNearPath, UNITS_PER_METRE, WOD_PIECE_ROAD_CLEAR, wodPiecewise, wodSiteClear, wodSiteFootprint } from './roadClearance.js';
import { buildingKeysOfType, castleEntranceOf, siegeFieldOf } from '../worldEvents/siegeField.js';
import { buildingSummaries } from './buildingSummaries.js';
import { bunnyHallsOf } from '../guilds/bunnyHallBanners.js';
import { buildWaterIndices, waterSwitchOn } from '../render/waterSurface.js';
import { BULLETIN_BOARD_MODEL_ID, CITY_GATE_CLOSED_MODEL_ID, CITY_GATE_OPEN_MODEL_ID, isBulletinBoard, isCityGate } from './rmbLayout.js';
import { carveLefay, isLefayTown, lefayExitOf, lefaySpotOf } from './lefayMonument.js';
import { carveYards } from './merchantYards/merchantYardSites.js';
import { CityNavigation, NAV_CELL } from './cityNavigation.js';
import { collectCityLights, LIGHTS_ARCHIVE } from './cityLights.js';
import { collectExteriorNpcs, exteriorNpcRecord } from '../characters/exteriorNpcs.js';
import { coverProxies, coverProxy, FELLED, isCoverFlat } from '../ai/cover.js';
import { flatBodies, jungleBody } from './propBodies.js';
import { DOOR_TYPE, GLOBAL_SCALE } from './meshReader.js';
import { isHouseSign } from './houseSigns.js';
import { doorCornersOf, doorNormalOf } from '../guilds/hallBanners.js';
import { drawnFlat } from '../characters/nudeFlats.js';
import { dungeonEntranceLanding } from '../player/enterExit.js';
import { ecoOrigin } from './ecotone.js';
import { festivalBannerAnchors, festivalLanternsOf } from '../guilds/seatFestival.js';
import { flatBatchAabb, localAabb, transformedAabb } from '../render/frustum.js';
import { floraSwayOf } from '../weather/windDrive.js';
import { footRectsAt } from '../homes/homeYards.js';
import { FOREST_HIDDEN_LOCATION_TYPES, populatesWanderingNpcs } from '../scenes/shared.js';
import { getLocationTerrainTileOrigin, setLocationTiles } from './terrainTiles.js';
import { getNameBankOfRegion } from '../characters/nameHelper.js';
import { getStaticDoors } from './staticDoors.js';
import { getWorldClimateSettings, LOCATION_TYPES } from '../formats/mapsFile.js';
import { gothwayNorthSpots, isGothwayGarden } from './gothwayBoards.js';
import { groundOffPlane, lowestGroundUnder, surfaceHeightAt, TERRAIN_SKIRT_DEPTH, TERRAIN_TILE_DIM } from './terrainSurface.js';
import { hasPort, maskMapId } from '../travel/travelPorts.js';
import { HEIGHTMAP_DIMENSION, TERRAIN_SIZE } from './terrainSampler.js';
import { HOLD_FLATS, HOLD_MODELS, holdFireLights, holdModelMatrix, PRIVATEERS_HOLD_BLOCK } from './wodPrivateersHold.js';
import { HOME_LOOK_BUILD_WAIT_MS, homeLookRemap } from './homeLook.js';
import { homeLookSig } from '../net/homeLaw.js';
import { noteTown as noteMagicTown } from '../scenes/magicTavernRoom.js';
import { magicOutsideRemap } from '../render/magicTavernLook.js';
import { insideRocks, rockFootprint } from './terrainNature.js';
import { isClimateFreeModel, NO_CLIMATE_REMAP } from './customModels.js';
import { isDrySourceFlat, isWaterSourceFlat, WATER_SOURCE_MODELS } from '../systems/survival/items.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { isHearthFlat } from '../systems/survival/hearth.js';
import { isPortTown } from '../travel/portPlaces.js';
import { isStandFlat, standFlatId, standFlatRecord } from './standFlats.js';
import { isStandingHorseFlat } from './standingHorses.js';
import { isTombstoneModel } from '../items/searchables.js';
import { FOREST_STAMP, isTreeRecord, sinkFelled } from '../professions/treeHost.js';
import { isWardenTown } from '../travel/wagonWarden.js';
import { hangsOffCleared, isWodShrub, rockSeatDrop, supportsFirst, WOD_ROCK_SITES, wodLightPosition, wodLightProperties } from './wodLocationObjects.js';
import { isYardTown } from './merchantYards/merchantYards.js';
import { keyResolver, StaticBatchBuilder } from '../render/staticBatch.js';
import { knownCriminal } from '../justice/standing.js';
import { layoutLocation } from './locationLayout.js';
import { legalRepOf } from '../justice/court.js';
import { LivingTown } from '../systems/livingWorld/livingTown.js';
import { livingWorldOn } from '../systems/livingWorld/livingSwitch.js';
import { LPT_CROWNS, LPT_TRUNKS } from './lptCrowns.js';
import { LPT_SCALE_MAX, lptVariety } from './lowPolyTrees.js';
import { JUNGLE_ARCHIVE, JUNGLE_MEASURES, JUNGLE_SPECIES, jungleCover } from './jungle/jungleModels.js';
import { JUNGLE } from './jungleNature.js';
import { JUNGLE_SCALE_MAX, JUNGLE_SUN_LIFT } from './jungle/jungleTreesAssets.js';
import { keptPairs, standRoadside } from '../systems/livingWorld/roadsidePairs.js';
const COVER_SLICE = 2048;
import { lptFitCap, lptTrunkCap, natureReach, pathTileMask, vergeClear } from './roadVerge.js';
import { makeBuildingKey } from '../talk/talkTopics.js';
import { makeCityGate } from './cityGate.js';
import { markRemapLaw, remapAsked, remapLawOf, remapSubMeshes, reskinRemap } from './texRemap.js';
import { MobilePerson, PERSON_MOVE_SPEED, walkerRace } from '../characters/mobilePerson.js';
import { multiply, trs } from './mat4.js';
import { naturePicture, junglePicture } from './naturePicture.js';
import { onFloatingFrame } from '../player/collider.js';
import { inBay as onTheBay } from './tamrielFrame.js';
import { ownMinutes, skyMinutes, trustedWorldMinutes } from './worldTick.js';
import { palaceKeysOf, seatBannerAnchors, townCentreOf } from '../guilds/seatBanners.js';
import { playerEntity } from '../characters/playerEntity.js';
import { racialSuppressPopulationSpawns } from '../afflictions/lycanthropy.js';
import { ResidentWalker } from '../characters/residentWalker.js';
import { rotorPhase, windmillsOn } from './windmills.js';
import { archivePrefix as seasonPrefixOf } from '../mods/seasonsIliacBay.js';
import { seatAtMapId } from '../guilds/townSeats.js';
import { setLastLocationKeyTo } from './worldDataVariants.js';
import { staticBuildingBox, staticBuildingWorldAabb } from './staticBuildings.js';
import { BUILDING_TYPES as TALK_BUILDING_TYPES } from './buildingNames.js';
import { TownPopulation } from '../characters/townPopulation.js';
import { windfallResponse } from '../weather/windfall.js';
import { colliderBlocked, dryGround, witchesDressingBreathing } from './witchesDecor.js';
import { wodRockUvs } from './wodRockUv.js';
import { wodRockFloor } from './wodRockFloor.js';
import { WodSpawner } from './wodSpawner.js';
import { lateSolidsOf } from '../player/lateSolid.js';
import { cromwarkDesolateAt } from './wild/cromwarkTowns.js';
import { buildingRuinPlan, ruinBuildingMesh } from './wild/cromwarkRuins.js';
import { wasteRing, burnTilemap, treeStandsDead, deadTreeOf, wasteScorch, wasteGroundCoverStands, DEAD_TREE_RECORDS } from './wild/cromwarkWaste.js';
import { sightMarksOf } from './signSolid.js';

/** @param {any} host */
export function createPixelBuild(host) {
  const {
    MILL_SAIL_PAD, TERRAIN_INDICES, TERRAIN_INDICES_LOD, _building, _dwRubble, _dwRubbleCarry, _groundBefore,
    _livingPatrons, _locationToBuild, spawnGroundPlace, _lptSway, _lptWindfall, _reskin, adoptWodCarry, archAabb, blocks, boardSplitOf,
    breather, buildingDoors, built, chapterSheet, climates3x3, collider, cpuModels, deepWaters, destroyPixel,
    dfMeshSize, dwDecor, ecotones, ensurePersonTex, forests, gateClearSweep, getTexture, getWindmillMeshes,
    halfWidthsOf, heightAt, heightCell, holdPixel, hostBed, jungle, labGrass, landform, livingArmOf, livingAshore,
    livingBaseRate, livingCarriedOf, livingChapterOf, livingCrews, livingCycleOf, livingDeadAt, livingFlatOf,
    livingKilled, livingPlaceOf, livingRate, livingSlay, livingTownsIndex, livingTripsOf, loadGroundSet, lookOfHome,
    lowPolyTrees, maps, modelFeetOf, onlineHomes, personTex, playerTravelPixel, portOnSea, renderer, restrideTerrain,
    seasons, siegeFieldsByTown, snowCover, snowfall, standPixelNpcs, standWodPile, strideFor, terrainGen, tileSide,
    townEcon, townPlacesFor, townSeats, verges, waterOn, waterSheetOf, wod, wodForgetPeerSites, wodOpened, wodPathsPoint,
    worldHeight
  } = host;
  const late = lateSolidsOf(collider);
  /**
   * @param {{ px: number, py: number, groups: Map<string, number[][]>, wild: Set<string>, natureSet: Set<number>,
   *   natureBase: (a: number) => number|undefined, tilemap: any, paths: any, vergeNet: any, uploadRecord: Function,
   *   uploadRecordFrame: Function, flatAnims: any, unionBox: (b: number[]) => void }} g
   * @param {{ batches: any[], forestGroups: Map<string, any>, coverItems: any[], lptHandles: any[], lptGroups: any[] }} out
   */
  async function standFlatGroups(g, { batches, forestGroups, coverItems, lptHandles, lptGroups }) {
    let lptPathMask = null;
    for (const a of new Set([...g.groups.keys()].map((k) => Number(k.split('_')[0])))) getTexture(a).catch(() => {});
    const solids = [];
    for (const [k, centers] of g.groups) {
      const [archive, record] = k.split('_').map(Number);
      if (isNatureArchive(archive)) continue;
      const t = await getTexture(archive);
      if (record < t.recordCount) solids.push(...flatBodies(t, archive, record, billboardSize(t, record), centers));
    }
    for (const [k, centers] of g.groups) {
      await breather.breathe();
      const [archive, record] = k.split('_').map(Number);
      const t = await getTexture(archive);
      if (record >= t.recordCount) continue;
      const { sib, proto: lpt, far, plain, key: rkey } = await naturePicture({ door: lowPolyTrees, seasons: host.seasonsActive ? seasons : null, renderer, uploadRecord: g.uploadRecord }, t, archive, record);
      coverItems.push(...flatBodies(t, archive, record, plain, centers, { tree: g.natureSet.has(archive) && isTreeRecord(g.natureBase(archive), record) }));
      if (far) {
        lowPolyTrees.acquire(far); lptHandles.push(far);
        const scales = new Float32Array(centers.length), wild = new Uint8Array(centers.length);
        const crown = verges ? (LPT_CROWNS[lpt.key] ?? 0) : 0;
        if (crown > 0 && !lptPathMask) lptPathMask = pathTileMask(g.tilemap, g.paths);
        const trunk = LPT_TRUNKS[lpt.key] ?? 0;
        const fit = crown > 0 || (trunk > 0 && solids.length) ? new Float32Array(centers.length) : null;
        centers.forEach((c, i) => {
          wild[i] = g.wild.has(`${k}#${i}`) ? 1 : 0;
          const v = lptVariety(g.px, g.py, c[0], c[2], !wild[i]).scale;
          if (fit) fit[i] = lptFitCap(lptPathMask, g.vergeNet, g.px, g.py, c[0], c[2], crown, v);
          if (fit && !wild[i]) fit[i] = Math.min(fit[i], lptTrunkCap(solids, c[0], c[2], trunk, v));
          scales[i] = (fit ? Math.min(v, fit[i]) : v) / LPT_SCALE_MAX;
        });
        lptGroups.push({ h: lptHandles.length - 1, centers, wild, fit });
        const batch = renderer.createBillboardBatch(archive, far.record, far.size, centers, { scales });
        batch.lptProto = far;
        batch.farH = plain.h;
        batch._box = flatBatchAabb(centers, far.size);
        batch.sway = floraSwayOf(archive, g.natureSet, plain.h);
        _lptSway.set(lpt, Math.max(_lptSway.get(lpt) ?? 0, batch.sway));
        batch.windfall = windfallResponse(archive, record);
        _lptWindfall.set(lpt, Math.max(_lptWindfall.get(lpt) ?? 0, batch.windfall));
        g.unionBox(batch._box);
        batches.push(batch);
        if (g.natureSet.has(archive)) forestGroups.set(k, { batch, centers, size: far.size, scales });
        if (isCoverFlat(archive, record, plain)) for (const c of centers) coverItems.push(...coverProxies(c, plain, { tree: g.natureSet.has(archive) && isTreeRecord(g.natureBase(archive), record) }));
        continue;
      }
      if (sib) {
        const batch = renderer.createBillboardBatch(archive, rkey, sib.size, centers);
        batch._box = flatBatchAabb(centers, sib.size);
        batch.sway = floraSwayOf(archive, g.natureSet, sib.size.h);
        batch.windfall = windfallResponse(archive, record, seasonPrefixOf(seasons.installedSeason, archive));
        g.unionBox(batch._box);
        batches.push(batch);
        if (g.natureSet.has(archive)) forestGroups.set(k, { batch, centers, size: sib.size });
        if (isCoverFlat(archive, record, sib.size)) for (const c of centers) coverItems.push(...coverProxies(c, sib.size, { tree: g.natureSet.has(archive) && isTreeRecord(g.natureBase(archive), record) }));
        continue;
      }
      const size = plain;
      const batch = renderer.createBillboardBatch(archive, record, size, centers);
      batch._box = flatBatchAabb(centers, size);
      batch.sway = floraSwayOf(archive, g.natureSet, size.h);
      batch.windfall = windfallResponse(archive, record);
      g.unionBox(batch._box);
      armFlatAnim(batch, t, archive, record, g.flatAnims, g.uploadRecordFrame);
      batches.push(batch);
      if (g.natureSet.has(archive) || archive === 301) forestGroups.set(k, { batch, centers, size });
      if (isCoverFlat(archive, record, size)) for (const c of centers) coverItems.push(...coverProxies(c, size, { tree: g.natureSet.has(archive) && isTreeRecord(g.natureBase(archive), record) }));
    }
  }
  async function buildPixelNow(px, py, { roadsRetry = false } = {}) {
    breather.reset();
    const key = `${px},${py}`, pipeline = holdPixel(key), { getGpuMesh, uploadRecord, uploadRecordFrame } = pipeline;
    const made = {};
    _building.set(key, made);
    const dfLocation = _locationToBuild(px, py) || null;
    const groundLocation = spawnGroundPlace.groundLocationAt(px, py, dfLocation);
    const seedTilemap = new Uint8Array(128 * 128); made.placeHold = pipeline;
    let locationRect = null;
    if (groundLocation) locationRect = setLocationTiles(groundLocation, maps, blocks, seedTilemap);
    let wodPicks = null;
    let wodHeld = null;
    const gateClear = host._gateClearNow();
    const gateLedger = { refused: false, reach: [] };
    const gateSite = gateSiteTest(gateClear, px, py, gateLedger);
    if (wod && onTheBay(px, py) && await wodOpened) {
      try {
        const here = host.state.current ?? { x: px, y: py };
        wod.noteRegion(maps.getRegionIndexAt(here.x, here.y));
        await wod.settle();
        const picks = wod.picksFor({
          mapPixelX: px, mapPixelY: py, hasLocation: !!groundLocation,
          worldHeight: host.woods.getHeightMapValue(px, py),
          regionIndex: maps.getRegionIndexAt(px, py),
        }, wodPathsPoint, (name, prefab, rect) => wodSiteClear(terrainGen.roads(), px, py, name, prefab, rect));
        if (picks.length && onTheBay(px, py)) { wodPicks = picks; wodHeld = picks.map((p) => !gateSite(p.prefabName, p.prefab, p.rect)); }
      } catch (e) {
        console.warn(`[wod] pixel ${key}: the loader failed here, and the pixel stands without its site: ${e?.message ?? e}`);
        wodPicks = null;
      }
    }
    const climate = getWorldClimateSettings(maps.getClimateIndex(px, py));
    const climateBase = climate.climateType;
    const near = ecotones ? climates3x3(px, py, climate) : null;
    const natureBorder = near && near.some((c) => c.natureArchive !== climate.natureArchive || c.climateType !== climateBase)
      ? { nature: near.map((c) => c.natureArchive), type: near.map((c) => c.climateType) } : null;
    const stride = strideFor(px, py);
    const { samples, tilemap, positions, normals, bed: carved, tilemapBytes, avg, nature, withRoads, paths, wodAverages, beach, roadside } = await terrainGen.generate({
      px, py, stride, tilemap: seedTilemap, locationRect, hasLocation: !!groundLocation, climateType: climateBase,
      bed: waterOn,
      wod: wodPicks ? { picks: wodPicks.map((p) => ({ flatten: p.flatten, rect: p.rect, hide: !wodPiecewise(p.prefabName), bounds: forests || jungle ? wodSiteFootprint(p.prefab, p.rect) : null })) } : null,
      forests: forests ? { archive: climate.natureArchive, hidden: FOREST_HIDDEN_LOCATION_TYPES.has(groundLocation?.mapTableData?.locationType) } : null,
      ecotone: natureBorder,
      jungle: jungle ? jungle.job(px, py, FOREST_HIDDEN_LOCATION_TYPES.has(groundLocation?.mapTableData?.locationType)) : null,
      landform,
    });
    const dwNear = deepWaters ? deepWaters.promoteNear({ px, py, samples, tilemap, tilemapBytes }) : null;
    let groundLo = Infinity, groundHi = -Infinity;
    for (let i = 1; i < positions.length; i += 3) { if (positions[i] < groundLo) groundLo = positions[i]; if (positions[i] > groundHi) groundHi = positions[i]; }
    const groundMid = dfLocation ? avg * worldHeight : (groundLo + groundHi) / 2;
    if (snowCover?.on) await snowCover.settle(breather);
    const snowRec = snowCover?.recorder(px, py) ?? null;
    const pixelSeason = snowRec ? snowRec.pixel(groundMid - SEA_LEVEL_M, host.season) : host.season;
    const climateArchive = (archive, record) => applyClimate(archive, record, climateBase, pixelSeason);
    const townClimateBase = dfLocation?.climate?.climateType ?? climateBase;
    const townClimateArchive = townClimateBase === climateBase ? climateArchive : (archive, record) => applyClimate(archive, record, townClimateBase, pixelSeason);
    const groundArchive = snowCover ? snowCover.groundArchive(climate, pixelSeason) : getTerrainGroundArchive(climate, pixelSeason);
    const natureArchive = getNatureArchive(climate.natureArchive, pixelSeason);
    const vergeNet = verges && withRoads ? terrainGen.roads() : null;
    const vergeHalf = new Map();
    if (vergeNet) for (const a of new Set([climate.natureArchive, ...nature.map((f) => f.archive).filter((a) => a != null)])) vergeHalf.set(a, await halfWidthsOf(a));
    let vergeOff = 0;

    await loadGroundSet(groundArchive, pipeline, snowCover?.winterOf(climate) ?? null);
    const groundNear = near ? near.map((c) => (snowCover ? snowCover.groundArchive(c, pixelSeason) : getTerrainGroundArchive(c, pixelSeason))) : null;
    let eco = null;
    if (groundNear?.some((a) => a !== groundArchive)) {
      const archives = [...new Set(groundNear.filter((a) => a !== groundArchive))];
      for (const a of archives) await loadGroundSet(a, pipeline, snowCover?.winterOf(near[groundNear.indexOf(a)]) ?? null);
      const slot = (k) => (groundNear[k] === groundArchive ? 0 : archives.indexOf(groundNear[k]) + 1);
      const [ox, oz] = ecoOrigin(px, py);
      eco = {
        archives: [archives[0] ?? null, archives[1] ?? null, archives[2] ?? null], tex: [null, null, null],
        side: Int32Array.of(slot(3), slot(5), slot(1), slot(7)),
        corner: Int32Array.of(slot(0), slot(2), slot(6), slot(8)),
        origin: Int32Array.of(ox, oz, 1),
      };
    }
    const bed = hostBed({ positions, normals }, carved);
    const terrain = renderer.createTerrainSurface(carved?.positions ?? positions, carved?.normals ?? normals,
      stride === 1 ? TERRAIN_INDICES : TERRAIN_INDICES_LOD);
    const wasteR = wasteRing(maps, px, py);
    if (wasteR) { burnTilemap(tilemapBytes, px, py, wasteR); terrain.scorch = wasteScorch(wasteR); }
    const waterIndices = waterOn ? buildWaterIndices(tilemapBytes, stride) : null;
    const water = waterIndices ? renderer.createWaterSheet(waterIndices, waterSheetOf(bed, terrain)) : null;
    made.terrain = terrain; made.water = water;
    const bounds = localAabb(carved?.positions ?? positions);
    bounds[1] -= TERRAIN_SKIRT_DEPTH;
    const unionBox = (b) => {
      for (let i = 0; i < 3; i++) {
        if (b[i] < bounds[i]) bounds[i] = b[i];
        if (b[3 + i] > bounds[3 + i]) bounds[3 + i] = b[3 + i];
      }
    };
    const tilemapTex = renderer.uploadTilemapTexture(tilemapBytes, TERRAIN_TILE_DIM);
    made.tilemapTex = tilemapTex;

    const flatLog = [], skinBlocks = [];
    const pixelLights = [];
    const pixelHearths = [];
    const pixelAnimals = [];
    const pixelSprings = [];
    const pixelNpcFlats = [];
    const pixelStandFlats = [];
    const pixelBoards = [];
    const pixelGraves = [];
    const light210 = await getTexture(LIGHTS_ARCHIVE);
    const lightSize = (record) =>
      billboardSize(light210, record);
    const borderNature = new Map();
    const wasteTreeAt = (x, z) => treeStandsDead(wasteR, px * TERRAIN_SIZE + x, (499 - py) * TERRAIN_SIZE + z);
    const addFlat = (archive, record, x, y, z, skin = null) => {
      if (wasteR && isNatureArchive(archive)) {
        const base = archive >= 505 && (archive & 1) ? archive - 1 : archive;
        if (!isTreeRecord(base, record) && !wasteGroundCoverStands(wasteR, px, py, x, z)) return;
        if ((base !== 508 || !DEAD_TREE_RECORDS.includes(record)) && isTreeRecord(base, record) && wasteTreeAt(x, z)) {
          const dead = deadTreeOf(px * TERRAIN_SIZE + x, (499 - py) * TERRAIN_SIZE + z);
          archive = getNatureArchive(dead.base, pixelSeason); record = dead.record;
          borderNature.set(archive, dead.base);
          skin = { ...skin, block: undefined, n: undefined, wild: dead.base, ...(skin?.tree ? { tree: { ...skin.tree, base: dead.base, archive } } : {}) };
        }
      }
      flatLog.push({ archive, record, c: [x, y, z], ...skin });
    };
    const scaledGroups = new Map();
    const addScaledFlat = (archive, record, scale, x, y, z) => {
      if (wasteR && isNatureArchive(archive)) {
        const base = archive >= 505 && (archive & 1) ? archive - 1 : archive;
        if (!isTreeRecord(base, record) && !wasteGroundCoverStands(wasteR, px, py, x, z)) return;
        if ((base !== 508 || !DEAD_TREE_RECORDS.includes(record)) && isTreeRecord(base, record) && wasteTreeAt(x, z)) {
          const dead = deadTreeOf(px * TERRAIN_SIZE + x, (499 - py) * TERRAIN_SIZE + z);
          archive = getNatureArchive(dead.base, pixelSeason); record = dead.record;
        }
      }
      const k = `${archive}_${record}_${scale.x}_${scale.y}`;
      if (!scaledGroups.has(k)) scaledGroups.set(k, { archive, record, scale, centers: [] });
      scaledGroups.get(k).centers.push([x, y, z]);
    };

    const texRemap = markRemapLaw(new Map(), `climate:${townClimateBase}.${pixelSeason}`);
    const cromwarkDamage = { roofless: 0, breached: 0, collapsed: 0 };
    const pixelRuinKeys = new Set();
    const models = [];
    const staticBuilder = new StaticBatchBuilder();
    const resolveTexKey = keyResolver(texRemap);
    const ownTexKey = keyResolver(NO_CLIMATE_REMAP);
    const statics = [];
    const addStatic = (cpu, local, own, nm = null) => { statics.push([cpu, local, own, nm]); staticBuilder.add(cpu, local, own ? ownTexKey : resolveTexKey, nm); };
    const pixelGates = [];
    made.cityGates = pixelGates;
    const pixelBuildings = [];
    const windmills = [];
    made.windmills = windmills;
    const holdBlocks = [];
    let arenaOrigin = null;
    let population = null;
    let locOrigin = null;
    let lefaySpot = null;
    let yardSites = null;
    let portSites = null;
    let personBatches = null;
    let locBlocks = null;
    let witchFloor = null;
    let homeTown = 0;
    let homeLookRead = -1;
    /** @type {Map<number, any>|null} */
    let townHomes = null;
    const pixelHomeKeys = new Set();
    const pixelBuildingKeys = new Set();
    /** @type {Map<number, {at: number[], box: number[], rects: number[][]}>} */
    const pixelHomeFrames = new Map();
    const pixelDungeonDoors = [];
    if (dfLocation) {
      setLastLocationKeyTo(dfLocation.regionIndex, dfLocation.locationIndex ?? 0);
      const loc = layoutLocation(dfLocation, maps, blocks, { enhanced: isEnhanced(), windmills: windmillsOn() });
      locBlocks = loc.blocks;
      const lefayExitDoors = [];
      const yardTown = isYardTown(dfLocation), portTown = isPortTown(dfLocation, portOnSea(dfLocation));
      const places = yardTown || portTown ? townPlacesFor(dfLocation, lefaySpot, climate?.people, loc) : null;
      if (yardTown) yardSites = places.yards;
      if (portTown) portSites = places.ports;
      const tilePos = getLocationTerrainTileOrigin(dfLocation);
      const locLocal = [tilePos.x * tileSide, avg * worldHeight + 2.0 * 0.025, tilePos.y * tileSide];
      witchFloor = locLocal[1] + BLOCK_FLATS_OFFSET_Y * GLOBAL_SCALE;
      locOrigin = [locLocal[0], locLocal[1], locLocal[2]];
      homeTown = (dfLocation.mapTableData?.mapId ?? 0) >>> 0;
      if (onlineHomes && homeTown) {
        if (onlineHomes.known(homeTown)) onlineHomes.ensure(homeTown).catch(() => {});
        else { try { await onlineHomes.waitFor(homeTown, HOME_LOOK_BUILD_WAIT_MS); } catch { } }
        townHomes = onlineHomes.homesIn(homeTown);
        homeLookRead = onlineHomes.version() * 1024 + host._lookPreviewGen;
      }
      const magicTavernKey = noteMagicTown(homeTown, loc.blocks);
      for (const b of loc.blocks) {
        const originMatrix = trs(
          locLocal[0] + b.originX, locLocal[1], locLocal[2] + b.originZ, 0, 0, 0);
        if (wod && b.blockName === PRIVATEERS_HOLD_BLOCK) holdBlocks.push(originMatrix);
        if (b.blockName === ARENA_BLOCK) arenaOrigin = [originMatrix[12], originMatrix[13], originMatrix[14]];
        const pixelFirstModel = new Set();
        if (b.layout.windmills.length && isEnhanced()) {
          const parts = await getWindmillMeshes(townClimateBase, pixelSeason === SEASON.Winter);
          if (!host.millParts) {
            host.millParts = parts;
            console.log(`[windmills] first mill streamed in (${b.blockName})`);
          }
          for (const w of b.layout.windmills) {
            const local = multiply(originMatrix, w.matrix);
            const box = transformedAabb(archAabb('millBody', BODY.positions), local);
            for (let i = 0; i < 3; i++) { box[i] -= MILL_SAIL_PAD; box[3 + i] += MILL_SAIL_PAD; }
            unionBox(box);
            models.push({ gpu: parts.body, local, _box: box, _order: -1, _mill: true });
            late.add(key, BODY.positions, BODY.indices, local,
              { translation: onFloatingFrame(host.state, ((o) => () => host.state.pixelTranslation(px, py, o))([0, 0, 0])) });
            if (!wasteR) windmills.push({ local, state: { angle: rotorPhase(px + local[12], py + local[14]) } });
          }
        }
        for (const placed of b.layout.models) {
          if (placed.enhancedOnly && !isEnhanced()) continue;
          if (isHouseSign(placed, b, (id) => cpuModels.get(id)?.doors)) continue;
          const gpu = await getGpuMesh(placed.modelIdNum, () => breather.breathe());
          if (!gpu) continue;
          const climateFree = isClimateFreeModel(placed.modelIdNum);
          if (!climateFree) await remapSubMeshes(gpu.subMeshes, texRemap, townClimateArchive, pipeline, townClimateBase);
          const local = multiply(originMatrix, placed.matrix);
          if (WATER_SOURCE_MODELS.includes(placed.modelIdNum)) pixelSprings.push({ pos: [local[12], local[13], local[14]], dry: false });
          const originalCpu = cpuModels.get(placed.modelIdNum);
          const ruinPlan = wasteR && placed.recordIndex != null && !isCityGate(placed.modelIdNum)
            ? buildingRuinPlan(wasteR, homeTown, b.x, b.y, placed.recordIndex) : null;
          const ruined = ruinPlan ? ruinBuildingMesh(originalCpu, ruinPlan) : null;
          const cpu = ruined ?? originalCpu;
          if (ruined) cromwarkDamage[ruined.ruin]++;
          const box = transformedAabb(ruined ? localAabb(cpu.positions) : archAabb(placed.modelIdNum, cpu.positions), local);
          unionBox(box);
          const entry = { gpu, local, _box: box, _order: placed.modelIdNum, _ruin: ruined?.ruin ?? null };
          if (climateFree) entry.texRemap = NO_CLIMATE_REMAP;
          const homeKey = Number.isSafeInteger(placed.recordIndex) ? makeBuildingKey(b.x, b.y, placed.recordIndex) : null;
          if (homeKey != null) {
            if (ruinPlan) pixelRuinKeys.add(homeKey);
            pixelBuildingKeys.add(homeKey);
            const at = Array.isArray(placed.recordAt) ? [locLocal[0] + b.originX + placed.recordAt[0], locLocal[1] + placed.recordAt[1], locLocal[2] + b.originZ + placed.recordAt[2]] : null;
            const bd = b.dfBlock?.rmbBlock?.fldHeader?.buildingDataList?.[placed.recordIndex] ?? null;
            const rects = footRectsAt(modelFeetOf(placed.modelIdNum, originalCpu), local);
            const f = pixelHomeFrames.get(homeKey);
            if (!f && at) pixelHomeFrames.set(homeKey, { at, box: [...box], rects, type: bd?.buildingType ?? null, faction: bd?.factionId ?? 0, parts: [[cpu, local]] });
            else if (f) { for (let i = 0; i < 3; i++) { f.box[i] = Math.min(f.box[i], box[i]); f.box[i + 3] = Math.max(f.box[i + 3], box[i + 3]); } f.rects.push(...rects); f.parts?.push([cpu, local]); }
          }
          const homeRow = homeKey != null ? townHomes?.get(homeKey) ?? null : null;
          const homeLook = homeRow ? lookOfHome(homeTown, homeKey, homeRow) : null;
          if (!ruinPlan && homeRow && (homeLook || homeRow.mine || homeRow.keeper)) {
            entry._home = { bk: homeKey, sig: homeLookSig(homeLook), seq: 0 };
            entry.texRemap = homeLook ? await homeLookRemap(gpu.subMeshes, texRemap, homeLook, pixelSeason, pipeline) : null;
            pixelHomeKeys.add(homeKey);
          }
          if (magicTavernKey != null && homeKey === magicTavernKey && !entry._home && !ruinPlan) {
            entry._magic = true;
            entry.texRemap = await magicOutsideRemap(gpu.subMeshes, texRemap, { getTexture: pipeline.getTexture, renderer });
          }
          models.push(entry);
          if (!entry._home && !entry._magic && !isCityGate(placed.modelIdNum) && cpu.normals && cpu.uvs) { addStatic(cpu, local, climateFree); entry._batched = true; }
          await breather.breathe();
          if (placed.recordIndex != null) {
            const rk = placed.recordIndex;
            if (!pixelFirstModel.has(rk)) {
              pixelFirstModel.add(rk);
              const sbox = staticBuildingBox(dfMeshSize(placed.modelIdNum));
              pixelBuildings.push({
                recordIndex: placed.recordIndex, dfBlock: b.dfBlock, matrix: local,
                aabb: staticBuildingWorldAabb(sbox, local),
              });
            }
          }
          const gateKey = isCityGate(placed.modelIdNum) ? `${key}:gate:${pixelGates.length}` : key;
          late.add(gateKey, cpu.positions, cpu.indices, local,
            { translation: onFloatingFrame(host.state, ((o) => () => host.state.pixelTranslation(px, py, o))([0, 0, 0])), sight: ruined ? undefined : sightMarksOf(placed.modelIdNum, cpu) });
          if (isBulletinBoard(placed.modelIdNum)) pixelBoards.push({ box, local });
          if (dfLocation?.mapTableData?.locationType === LOCATION_TYPES.Graveyard && isTombstoneModel(placed.modelIdNum)) pixelGraves.push({ box, n: pixelGraves.length });
          // Both city gate variants must be resident and climate-remapped before the first swap.
          // A mid-frame fetch cannot swap in place.
          if (isCityGate(placed.modelIdNum)) {
            const otherId = placed.modelIdNum === CITY_GATE_OPEN_MODEL_ID
              ? CITY_GATE_CLOSED_MODEL_ID : CITY_GATE_OPEN_MODEL_ID;
            const otherGpu = await getGpuMesh(otherId);
            const otherCpu = cpuModels.get(otherId);
            if (otherGpu && otherCpu) {
              await remapSubMeshes(otherGpu.subMeshes, texRemap, townClimateArchive, pipeline, townClimateBase);
              unionBox(transformedAabb(archAabb(otherId, otherCpu.positions), local));
            }
            pixelGates.push({
              gate: makeCityGate(placed.modelIdNum), entry, local, bucketKey: gateKey,
              meshes: new Map([
                [placed.modelIdNum, { gpu, cpu }],
                [otherId, otherGpu && otherCpu ? { gpu: otherGpu, cpu: otherCpu } : null],
              ]),
              translation: onFloatingFrame(host.state, ((o) => () => host.state.pixelTranslation(px, py, o))([0, 0, 0])),
            });
          }
          if (cpu.doors && cpu.doors.length) {
            const staticDoors = getStaticDoors(cpu, b.dfBlock.index, placed.recordIndex, local);
            if (isLefayTown(dfLocation)) for (const sd of staticDoors) if (sd.doorType === DOOR_TYPE.DUNGEON_ENTRANCE) lefayExitDoors.push(sd);
            const hf = homeKey != null ? pixelHomeFrames.get(homeKey) : null;
            if (hf && !hf.door) { hf.door = doorCornersOf(cpu.doors[0], local); hf.normal = doorNormalOf(cpu.doors[0], local); }
            if (dfLocation.hasDungeon) for (const d of cpu.doors) if (d.type === DOOR_TYPE.DUNGEON_ENTRANCE) pixelDungeonDoors.push({ door: doorCornersOf(d, local), box, normal: doorNormalOf(d, local), arena: b.blockName === ARENA_BLOCK });
            for (const door of staticDoors) {
              host.doorGeneration += 1;
              buildingDoors.push({
                door, pixelKey: key, dfBlock: b.dfBlock, blockX: b.x, blockY: b.y,
                recordIndex: placed.recordIndex, climateBase: townClimateBase, season: INTERIOR_SEASON,
              });
            }
          }
        }
        const hillSeat = blockHillSeat(b.layout.models);
        const hillPatch = blockHillPatch(hillSeat, b.layout.models, (m) => (m.enhancedOnly && !isEnhanced() ? null : cpuModels.get(m.modelIdNum)));
        if (hillPatch) { addStatic(hillPatch, originMatrix, false); collider.addMesh(key, hillPatch.positions, hillPatch.indices, originMatrix, onFloatingFrame(host.state, ((o) => () => host.state.pixelTranslation(px, py, o))([0, 0, 0]))); unionBox(transformedAabb(localAabb(hillPatch.positions), originMatrix)); }
        const flatOpts = { extra: memorialFlatsFor(dfLocation, b), climateIndex: maps.getClimateIndex(px, py), solid: blockSolids(b.layout.models, (m) => (m.enhancedOnly && !isEnhanced() ? null : cpuModels.get(m.modelIdNum))) };
        const blockFlats = collectBlockFlats(b.dfBlock, natureArchive, flatOpts);
        const block = skinBlocks.push({ dfBlock: b.dfBlock, opts: flatOpts }) - 1;
        const npcFlats = collectExteriorNpcs(blockFlats);
        const desolate = cromwarkDesolateAt(maps, px, py);
        const npcFlatSet = new Set(npcFlats);
        for (const npc of npcFlats) {
          if (desolate) continue;
          pixelNpcFlats.push({
            ...npc,
            x: locLocal[0] + b.originX + npc.x,
            y: locLocal[1] + npc.y,
            z: locLocal[2] + b.originZ + npc.z,
          });
        }
        for (const [n, flat] of blockFlats.entries()) {
          if (desolate && (isStandFlat(flat.archive, flat.record) || flat.archive === ANIMALS_ARCHIVE || flat.archive === LIGHTS_ARCHIVE || flat.archive === 301)) continue;
          if (flat.archive === ANIMALS_ARCHIVE && ANIMAL_SOUND_BY_RECORD[flat.record] != null) {
            pixelAnimals.push({
              pos: [locLocal[0] + b.originX + flat.x, locLocal[1] + flat.y, locLocal[2] + b.originZ + flat.z],
              sound: ANIMAL_SOUND_BY_RECORD[flat.record],
            });
          }
          if (isWaterSourceFlat(flat.archive, flat.record) || isDrySourceFlat(flat.archive, flat.record)) {
            pixelSprings.push({ pos: [locLocal[0] + b.originX + flat.x, locLocal[1] + flat.y, locLocal[2] + b.originZ + flat.z], dry: isDrySourceFlat(flat.archive, flat.record) });
          }
          if (npcFlatSet.has(flat)) continue;
          if (flat.editor) continue;
          const fx = locLocal[0] + b.originX + flat.x, fz = locLocal[2] + b.originZ + flat.z;
          if (isStandFlat(flat.archive, flat.record)) { pixelStandFlats.push({ archive: flat.archive, record: flat.record, x: fx, y: locLocal[1] + flat.y, z: fz }); continue; }
          const lift = flat.archive === natureArchive ? groundOffPlane(samples, avg, fx, fz) : 0;
          addFlat(flat.archive, flat.record, fx, locLocal[1] + (hillSeat && isNatureArchive(flat.archive) ? seatNatureFlat(hillSeat, flat.x, flat.z, NATURE_FLATS_Y + groundOffPlane(samples, avg, fx, fz)) : flat.y + lift), fz, { block, n });
        }
        for (const light of desolate ? [] : collectCityLights(b.dfBlock, lightSize)) {
          const lp = [
            locLocal[0] + b.originX + light.x,
            locLocal[1] + light.y,
            locLocal[2] + b.originZ + light.z,
          ];
          pixelLights.push(lp);
          if (isHearthFlat(LIGHTS_ARCHIVE, light.record)) pixelHearths.push([lp[0], lp[1], lp[2], locLocal[1] + light.foot, light.w, light.h]);
        }
      }
      if (isLefayTown(dfLocation)) lefaySpot = lefaySpotOf(loc, { camp: { block: PRIVATEERS_HOLD_BLOCK, models: HOLD_MODELS }, exit: lefayExitOf(dungeonEntranceLanding(lefayExitDoors), locLocal) });
      if (isLefayTown(dfLocation) && !lefaySpot) console.warn('[lefay] no open ground for the monument outside Privateer\'s Hold');
      if (isGothwayGarden(dfLocation.name)) {
        const gpuB = await getGpuMesh(BULLETIN_BOARD_MODEL_ID, () => breather.breathe());
        const cpuB = cpuModels.get(BULLETIN_BOARD_MODEL_ID);
        if (gpuB && cpuB) {
          await remapSubMeshes(gpuB.subMeshes, texRemap, townClimateArchive, pipeline, townClimateBase);
          const navB = new CityNavigation(loc.width, loc.height);
          for (const b of loc.blocks) {
            const srcTiles = b.dfBlock.rmbBlock.fldHeader.groundData.groundTiles;
            navB.setBlockData(b.x, b.y, b.dfBlock.rmbBlock.fldHeader.autoMapData, (tx, ty) => srcTiles[tx][ty].textureRecord, { enhancedWater: waterSwitchOn() });
          }
          const spots = gothwayNorthSpots((gx, gy) => navB.weightAt(gx, gy), navB.width, navB.height, NAV_CELL) ?? [];
          for (const sp of spots) {
            const lift = -archAabb(BULLETIN_BOARD_MODEL_ID, cpuB.positions)[1] + 0.02;
            const local = trs(locLocal[0] + sp.x, locLocal[1] + lift, locLocal[2] + sp.z, 0, sp.yawDeg, 0);
            const box = transformedAabb(archAabb(BULLETIN_BOARD_MODEL_ID, cpuB.positions), local);
            unionBox(box);
            const entry = { gpu: gpuB, local, _box: box, _order: BULLETIN_BOARD_MODEL_ID };
            models.push(entry);
            if (cpuB.normals && cpuB.uvs) { addStatic(cpuB, local, false); entry._batched = true; }
            late.add(key, cpuB.positions, cpuB.indices, local, { translation: onFloatingFrame(host.state, ((o) => () => host.state.pixelTranslation(px, py, o))([0, 0, 0])) });
            pixelBoards.push({ box, local, extra: true });
          }
        }
      }

      if (populatesWanderingNpcs(dfLocation.mapTableData.locationType) && !cromwarkDesolateAt(maps, px, py)) {
        await ensurePersonTex();
        const nav = new CityNavigation(loc.width, loc.height);
        for (const b of loc.blocks) {
          const srcTiles = b.dfBlock.rmbBlock.fldHeader.groundData.groundTiles;
          nav.setBlockData(b.x, b.y, b.dfBlock.rmbBlock.fldHeader.autoMapData,
            (tx, ty) => srcTiles[tx][ty].textureRecord, { enhancedWater: waterSwitchOn() });
        }
        if (lefaySpot) carveLefay(nav, lefaySpot);
        if (yardSites?.length) carveYards(nav, yardSites);
        if (portSites?.length) carveYards(nav, portSites);
        personBatches = new Map();
        made.personBatches = personBatches;
        const personCollider = {
          raycast: (from, dir, l) => {
            const t = host.state.pixelTranslation(px, py);
            return collider.raycast(
              [from[0] + locOrigin[0] + t[0], from[1] + t[1], from[2] + locOrigin[2] + t[2]], dir, l);
          },
        };
        const personGroundY = (x, z) => {
          const t = host.state.pixelTranslation(px, py);
          const h = heightAt(x + locOrigin[0] + t[0], z + locOrigin[2] + t[2]);
          return Number.isFinite(h) ? h - t[1] + 2.0 * 0.025 : locOrigin[1];
        };
        const livingTown = livingTownsIndex().get(py * 1000 + px) ?? {
          mapId: (dfLocation.mapTableData?.mapId ?? 0) >>> 0, name: dfLocation.name, px, py,
          type: dfLocation.mapTableData?.locationType, region: dfLocation.regionIndex, people: climate?.people,
          blocks: loc.width * loc.height, port: hasPort(dfLocation.mapTableData?.mapId),
        };
        population = livingWorldOn() ? new LivingTown(nav, {
          town: livingTown,
          buildings: buildingSummaries(dfLocation.exterior?.buildings ?? [], loc.blocks, { locationIndex: dfLocation.locationIndex ?? 0, locationName: dfLocation.name })
            .map((b) => ({ key: b.buildingKey, type: b.buildingType, quality: b.quality, factionId: b.factionId })),
          doors: buildingDoors.filter((d) => d.pixelKey === key && d.blockX != null).map((d) => {
            const m = d.door.matrix, c = d.door.centre, n = d.door.normal;
            return {
              key: makeBuildingKey(d.blockX, d.blockY, d.recordIndex),
              x: m[0] * c.x + m[4] * c.y + m[8] * c.z + m[12] - locOrigin[0], z: m[2] * c.x + m[6] * c.y + m[10] * c.z + m[14] - locOrigin[2],
              nx: m[0] * n.x + m[4] * n.y + m[8] * n.z, nz: m[2] * n.x + m[6] * n.y + m[10] * n.z,
            };
          }),
          makePerson: (archive, guard) => {
            const person = new ResidentWalker(nav, { archive, guard, frameCount: (rec, a) => personTex.get(a).getFrameCount(rec), collider: personCollider, groundY: personGroundY });
            personBatches.set(person, renderer.createBillboardBatch(archive, 0, { w: 1, h: 1 }, [[0, 0, 0]]));
            return person;
          },
          clock: skyMinutes, rate: livingRate, mpm: PERSON_MOVE_SPEED / livingBaseRate(),
          suppressSpawns: () => racialSuppressPopulationSpawns(playerEntity),
          relations: () => host.livingRelations, playerName: () => playerEntity.name ?? '', weather: () => host.weather,
          townName: dfLocation.name, regionName: dfLocation.regionName ?? '',
          patronsOf: () => _livingPatrons.get(livingTown.mapId >>> 0) ?? null,
          carriedOf: (day) => livingCarriedOf(livingTown, day),
          tripsOf: (day) => livingTripsOf(livingTown, day), armOf: livingArmOf, flatOf: livingFlatOf,
          familyNews: (t) => host.legacyHost?.newsFor(livingTown.mapId, t) ?? null,
          chapterOf: chapterSheet ? (faction) => livingChapterOf(faction, px, py) : undefined,
          econBandOf: () => townEcon.bandOf(livingTown.mapId),
          extraPeople: (day, town) => host.legacyHost?.residentsOf(livingTown.mapId, (seed) => town.homeFor(seed), (id) => town.residents.find((r) => r.id === id) ?? null) ?? null,
          ashore: (res) => livingAshore(livingTown, res), crews: () => livingCrews(livingTown),
          holderOf: (res, day) => (host.legacyHost?.holdsResident(res.id) ? null : livingPlaceOf(res, livingCycleOf(res, day)).holder), deadAt: livingDeadAt, slay: livingSlay, killed: livingKilled,
          legalStanding: (region) => ({ rep: legalRepOf(playerEntity, region), known: knownCriminal(playerEntity, region, { ownNow: ownMinutes(), worldNow: trustedWorldMinutes() }) }),
          dangers: () => host.livingDangers(px, py, locOrigin),
          sees: (a, b) => {
            const tr = host.state.pixelTranslation(px, py);
            const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
            if (len < 1e-3) return true;
            const hit = collider.raycast([a[0] + locOrigin[0] + tr[0], a[1] + tr[1], a[2] + locOrigin[2] + tr[2]], [d[0] / len, d[1] / len, d[2] / len], len);
            return !(Number.isFinite(hit) && hit < len - 0.25);
          },
          harbour: () => {
            const b = host.harbourBook.get(`port:${maskMapId(livingTown.mapId)}`)?.harbour?.berths?.[0];
            if (!b) return null;
            const tr = host.state.pixelTranslation(px, py);
            return { x: b.pos[0] - locOrigin[0] - tr[0], z: b.pos[1] - locOrigin[2] - tr[2] };
          },
          keepsakes: () => playerEntity.items ?? [],
          takeKeepsake: (item) => { const i = playerEntity.items?.indexOf(item) ?? -1; if (i >= 0) playerEntity.items.splice(i, 1); },
        }) : new TownPopulation(nav, {
          suppressSpawns: () => racialSuppressPopulationSpawns(playerEntity),
          totalBlocks: loc.width * loc.height,
          race: walkerRace(climate?.people, dfLocation.regionIndex),
          nameBank: getNameBankOfRegion(dfLocation.regionIndex),
          makePerson: (archive, guard) => {
            const person = new MobilePerson(nav, {
              archive, guard,
              frameCount: (rec, a) => personTex.get(a).getFrameCount(rec),
              collider: personCollider,
              groundY: personGroundY,
            });
            personBatches.set(person, renderer.createBillboardBatch(archive, 0, { w: 1, h: 1 }, [[0, 0, 0]]));
            return person;
          },
        });
      }
    }

    const pixelWodLights = [];
    let wodSite = null;
    let wodSpawners = null;
    const pixelRocks = [];
    if (wodPicks && wodAverages) {
      const stood = wodPicks.filter((_, i) => !wodHeld[i]);
      const place = wod.placements(stood, wodAverages.filter((_, i) => !wodHeld[i]));
      const rockPick = (i) => WOD_ROCK_SITES.includes(stood[i]?.name);
      const _roadsNow = terrainGen.roads();
      let _wodOffRoad = 0, _wodOffGate = wodPicks.length - stood.length, _wodCleared = [];
      if (place.stopped) console.warn(`[wod] pixel ${key}: a negative model name stopped the loader here, as uint.Parse throws in the C#`);
      const wodBucket = onFloatingFrame(host.state, ((o) => () => host.state.pixelTranslation(px, py, o))([0, 0, 0]));
      const groundAt = (x, z) => surfaceHeightAt(samples, Math.max(0, Math.min(TERRAIN_SIZE, x)), Math.max(0, Math.min(TERRAIN_SIZE, z)));
      for (const m of supportsFirst(place.models)) {
        const gpu = await getGpuMesh(m.modelId);
        if (!gpu) continue;
        const cpu = wodRockUvs(wodRockFloor(cpuModels.get(m.modelId), m.modelId), m.matrix, m.modelId);
        const box = transformedAabb(archAabb(m.modelId, cpu.positions), m.matrix);
        if (isWodShrub(m.modelId, stood[m.pick]?.name)) {
          const dy = lowestGroundUnder(samples, box) - box[1];
          m.matrix[13] += dy; box[1] += dy; box[4] += dy;
        }
        if (rockPick(m.pick) && box[1] < surfaceHeightAt(samples, Math.max(0, Math.min(TERRAIN_SIZE, (box[0] + box[3]) / 2)), Math.max(0, Math.min(TERRAIN_SIZE, (box[2] + box[5]) / 2)))) { const dy = rockSeatDrop(lowestGroundUnder(samples, box), box[1]); if (dy < 0) { m.matrix[13] += dy; box[1] += dy; box[4] += dy; } }
        if (boxNearPath(_roadsNow, px, py, box[0] * UNITS_PER_METRE, box[2] * UNITS_PER_METRE, box[3] * UNITS_PER_METRE, box[5] * UNITS_PER_METRE, WOD_PIECE_ROAD_CLEAR) || (rockPick(m.pick) && hangsOffCleared(box, cpu, m.matrix, groundAt, _wodCleared, TERRAIN_SIZE))) { _wodOffRoad++; _wodCleared.push(box); continue; }
        if (boxNearGate(gateClear, px, py, box[0], box[2], box[3], box[5])) { gateLedger.refused = true; _wodOffGate++; _wodCleared.push(box); continue; }
        gateLedger.reach.push(box[0], box[2], box[3], box[5], 0);
        unionBox(box);
        if (rockPick(m.pick)) { const foot = rockFootprint(cpu.positions, cpu.indices, m.matrix, samples); if (foot) pixelRocks.push(foot); }
        const entry = { gpu, local: m.matrix, _box: box, _order: m.modelId };
        models.push(entry);
        if (cpu.normals && cpu.uvs) { addStatic(cpu, m.matrix, false, m.normalMatrix); entry._batched = true; }
        late.add(key, cpu.positions, cpu.indices, m.matrix, { translation: wodBucket });
        await breather.breathe();
      }
      for (const f of place.flats) {
        if (wasteR && (isStandFlat(f.archive, f.record) || f.archive === ANIMALS_ARCHIVE || f.archive === LIGHTS_ARCHIVE || f.archive === 301)) continue;
        if (pointNearPath(_roadsNow, px, py, f.base[0] * UNITS_PER_METRE, f.base[2] * UNITS_PER_METRE, WOD_PIECE_ROAD_CLEAR)) { _wodOffRoad++; continue; }
        if (vergeNet && !vergeClear(vergeNet, px, py, f.base[0], f.base[2], WOD_PIECE_ROAD_CLEAR / UNITS_PER_METRE + ((await halfWidthsOf(f.archive))[f.record] ?? 0) * f.scale.x)) { _wodOffRoad++; continue; }
        if (pointNearGate(gateClear, px, py, f.base[0], f.base[2], WOD_FLAT_GATE_CLEAR_M)) { gateLedger.refused = true; _wodOffGate++; continue; }
        gateLedger.reach.push(f.base[0], f.base[2], f.base[0], f.base[2], WOD_FLAT_GATE_CLEAR_M);
        if (f.scale.x === 1 && f.scale.y === 1 && isStandFlat(f.archive, f.record)) pixelStandFlats.push({ archive: f.archive, record: f.record, x: f.base[0], y: f.base[1], z: f.base[2] });
        else if (f.scale.x === 1 && f.scale.y === 1) addFlat(f.archive, f.record, f.base[0], f.base[1], f.base[2]);
        else addScaledFlat(f.archive, f.record, f.scale, f.base[0], f.base[1], f.base[2]);
      }
      for (const f of wasteR ? [] : place.lights) {
        const pos = wodLightPosition(f.base, f.record, lightSize(f.record), f.scale.y);
        const light = wodLightProperties(f.record);
        pixelWodLights.push({
          x: pos[0], y: pos[1], z: pos[2], range: light.range,
          color: [light.color[0] * light.intensity, light.color[1] * light.intensity, light.color[2] * light.intensity],
        });
      }
      for (const f of wasteR ? [] : place.animals) {
        const sound = ANIMAL_SOUND_BY_RECORD[f.record];
        if (sound != null) pixelAnimals.push({ pos: [f.base[0], f.base[1], f.base[2]], sound });
      }
      if (place.spawners.length) {
        wodSpawners = [];
        const oidSeen = new Map();
        for (const s of place.spawners) {
          const t = await getTexture(s.archive);
          const h = s.record < t.recordCount ? billboardSize(t, s.record).h : 0;
          const centre = [s.base[0], s.base[1] + (h * s.scaleY) / 2, s.base[2]];
          const n = oidSeen.get(s.objectID) ?? 0; oidSeen.set(s.objectID, n + 1);
          wodSpawners.push({ spawner: new WodSpawner(s), centre, flat: null, restand: false, oid: s.objectID, oidN: n });
        }
      }
      if (_wodOffRoad) console.log(`[wod] pixel ${key}: ${_wodOffRoad} piece(s) kept off the road`);
      if (_wodOffGate) console.log(`[wod] pixel ${key}: ${_wodOffGate} piece(s) or site(s) kept off a breach's clearing`);
      const site = [...wodPicks].reverse().find((p) => p.flatten);
      if (site) wodSite = { xMin: site.rect.x, xMax: site.rect.x + site.rect.width, yMin: site.rect.y, yMax: site.rect.y + site.rect.height };
    }

    const pixelTrees = [];
    const jungleGroups = new Map();
    const jungleOk = !!jungle && nature.some((f) => f.jungle != null) && !!(await jungle.door.load());
    for (const f of nature) {
      if (pointNearGate(gateClear, px, py, f.x, f.z, WOD_FLAT_GATE_CLEAR_M)) continue;
      if ((forests || (jungle && f.archive === JUNGLE_ARCHIVE)) && insideRocks(pixelRocks, f.x, f.z)) continue;
      const base = f.archive ?? climate.natureArchive;
      const jungleTree = jungleOk && f.jungle != null;
      if (vergeNet && !vergeClear(vergeNet, px, py, f.x, f.z, f.jungle != null ? JUNGLE_MEASURES[f.jungle].foot * f.js : natureReach(vergeHalf.get(base)[f.record] ?? 0, base, f.record, px, py, f.x, f.z))) { vergeOff++; continue; }
      if (jungleTree && !wasteTreeAt(f.x, f.z)) {
        const young = f.js <= JUNGLE.underScale[1], gk = young ? `J${f.jungle}y` : `J${f.jungle}`;
        let g = jungleGroups.get(gk);
        if (!g) jungleGroups.set(gk, (g = { species: f.jungle, young, centers: [], own: [] }));
        g.centers.push([f.x, f.y, f.z]); g.own.push(f.js);
        pixelTrees.push({ id: pixelTrees.length, group: gk, i: g.centers.length - 1, x: f.x, y: f.y, z: f.z, wood: f.wood ?? 1, base, archive: getNatureArchive(base, pixelSeason), jungle: f.jungle, js: f.js });
        continue;
      }
      const fSeason = snowRec ? snowRec.flat(f.x, f.z, f.y - SEA_LEVEL_M, pixelSeason) : pixelSeason;
      const dead = wasteR && isTreeRecord(base, f.record) && wasteTreeAt(f.x, f.z) ? deadTreeOf(px * TERRAIN_SIZE + f.x, (499 - py) * TERRAIN_SIZE + f.z) : null;
      const wBase = dead ? dead.base : base, wRecord = dead ? dead.record : f.record;
      const archive = getNatureArchive(wBase, fSeason);
      if (archive !== natureArchive) borderNature.set(archive, wBase);
      const tree = isTreeRecord(wBase, wRecord) ? { id: pixelTrees.length, group: '', i: 0, x: f.x, y: f.y, z: f.z, wood: f.wood ?? 0, base: wBase, archive } : null;
      if (tree) pixelTrees.push(tree);
      addFlat(archive, wRecord, f.x, f.y, f.z, { wild: wBase, tree });
    }
    const allPairs = keptPairs(roadside, (x, z) => !pointNearGate(gateClear, px, py, x, z, WOD_FLAT_GATE_CLEAR_M) && !insideRocks(pixelRocks, x, z));
    const pairs = allPairs.filter((p) => !wasteR || !p.trees.some((t) => wasteTreeAt(t.x, t.z)));
    for (const p of allPairs) if (!pairs.includes(p)) for (const t of p.trees) {
      const archive = getNatureArchive(JUNGLE_ARCHIVE, pixelSeason);
      if (archive !== natureArchive) borderNature.set(archive, JUNGLE_ARCHIVE);
      addFlat(archive, t.record, t.x, surfaceHeightAt(samples, t.x, t.z), t.z, { wild: JUNGLE_ARCHIVE });
    }
    if (!jungleOk) {
      for (const t of pairs.flatMap((p) => p.trees)) {
        const archive = getNatureArchive(JUNGLE_ARCHIVE, pixelSeason);
        if (archive !== natureArchive) borderNature.set(archive, JUNGLE_ARCHIVE);
        addFlat(archive, t.record, t.x, surfaceHeightAt(samples, t.x, t.z), t.z, { wild: JUNGLE_ARCHIVE });
      }
    }
    let privateersHold = null;
    if (holdBlocks.length) {
      const holdBucket = onFloatingFrame(host.state, ((o) => () => host.state.pixelTranslation(px, py, o))([0, 0, 0]));
      for (const origin of holdBlocks) {
        for (const hm of HOLD_MODELS) {
          const gpu = await getGpuMesh(hm.modelId);
          if (!gpu) continue;
          await remapSubMeshes(gpu.subMeshes, texRemap, townClimateArchive, pipeline, townClimateBase);
          const local = multiply(origin, holdModelMatrix(hm));
          const cpu = cpuModels.get(hm.modelId);
          const box = transformedAabb(archAabb(hm.modelId, cpu.positions), local);
          unionBox(box);
          const entry = { gpu, local, _box: box, _order: hm.modelId };
          models.push(entry);
          if (cpu.normals && cpu.uvs) { addStatic(cpu, local, false); entry._batched = true; }
          late.add(key, cpu.positions, cpu.indices, local, { translation: holdBucket });
          await breather.breathe();
        }
        for (const hf of HOLD_FLATS) {
          const t = await getTexture(hf.archive);
          if (hf.record >= t.recordCount) continue;
          addFlat(hf.archive, hf.record, ...centredBase([origin[12] + hf.pos[0], origin[13] + hf.pos[1], origin[14] + hf.pos[2]], billboardSize(t, hf.record)));
        }
        for (const l of holdFireLights()) pixelWodLights.push({ x: origin[12] + l.pos[0], y: origin[13] + l.pos[1], z: origin[14] + l.pos[2], range: l.range, color: l.color });
      }
      privateersHold = { origins: holdBlocks.map((o) => [o[12], o[13], o[14]]), state: { rolled: false, foes: [], gone: false } };
    }

    collider.settle(key);
    await breather.breathe();

    if (await host.seasonsReady) await seasons.onTerrainInstantiated();
    const seasonsGen = seasons?.generation ?? 0;
    const flatAnims = new FlatAnimator();
    const batches = [];
    made.batches = batches;
    const forestGroups = new Map();
    const coverItems = [];
    const lptHandles = [], lptGroups = [];
    made.lptHandles = lptHandles;
    const natureSet = new Set([natureArchive, ...borderNature.keys()]);
    const natureBase = (a) => (a === natureArchive ? climate.natureArchive : borderNature.get(a));
    const witchDress = !wasteR && witchFloor != null && locBlocks ? await witchesDressingBreathing({
      frames: pixelHomeFrames, taverns: buildingKeysOfType(locBlocks, makeBuildingKey, TALK_BUILDING_TYPES.Tavern), temples: buildingKeysOfType(locBlocks, makeBuildingKey, TALK_BUILDING_TYPES.Temple),
      mapId: dfLocation?.mapTableData?.mapId ?? 0, climateIndex: maps.getClimateIndex(px, py), region: dfLocation?.regionIndex ?? null, floorY: witchFloor,
      blocked: colliderBlocked(collider, host.state, px, py), ground: dryGround(locBlocks, locOrigin), taken: [...flatLog.map((f) => f.c), ...[...pixelNpcFlats, ...pixelStandFlats].map((n) => [n.x, n.y, n.z])],
    }, () => breather.breathe()) : null;
    for (const f of witchDress?.flats ?? []) {
      addFlat(f.archive, f.record, ...f.c);
      if (f.archive !== LIGHTS_ARCHIVE) continue;
      const s = lightSize(f.record);
      pixelLights.push([f.c[0], f.c[1] + s.h, f.c[2]]);
      if (isHearthFlat(LIGHTS_ARCHIVE, f.record)) pixelHearths.push([f.c[0], f.c[1] + s.h, f.c[2], f.c[1], s.w, s.h]);
    }
    pixelNpcFlats.push(...(witchDress?.sisters ?? []));
    const { groups, wild: wildFlats, places } = groupFlats(flatLog, flatLog.map((f) => [f.archive, f.record]));
    placeTrees(flatLog, flatLog.map((f) => f.archive), places);
    await standFlatGroups({ px, py, groups, wild: wildFlats, natureSet, natureBase, tilemap, paths, vergeNet, uploadRecord, uploadRecordFrame, flatAnims, unionBox },
      { batches, forestGroups, coverItems, lptHandles, lptGroups });
    const groupBatches = batches.slice(), groupForest = new Set(forestGroups.keys()), groupCover = coverItems.length;
    const jungleHandles = [], jungleSet = [];
    made.jungleHandles = jungleHandles;
    const junglePics = new Map();
    const speciesPic = async (species) => {
      if (!junglePics.has(species)) junglePics.set(species, await junglePicture(jungle.door, species));
      return junglePics.get(species);
    };
    if (jungleOk && pairs.length) {
      await standRoadside({
        door: jungle.door, pairs, speciesPic, groups: jungleGroups, handles: jungleHandles, set: jungleSet,
        sway: (proto, record) => {
          _lptSway.set(proto, Math.max(_lptSway.get(proto) ?? 0, floraSwayOf(JUNGLE_ARCHIVE, natureSet, proto.size.h)));
          _lptWindfall.set(proto, Math.max(_lptWindfall.get(proto) ?? 0, windfallResponse(JUNGLE_ARCHIVE, record)));
        },
      });
    }
    for (const [gk, g] of jungleGroups) {
      await breather.breathe();
      const species = g.species, record = JUNGLE_SPECIES[species].record;
      g.centers.forEach((c, i) => coverItems.push(jungleBody(c, species, g.own[i])));
      const pic = await speciesPic(species);
      if (!pic) {
        const t = await getTexture(JUNGLE_ARCHIVE);
        if (record >= t.recordCount) continue;
        uploadRecord(JUNGLE_ARCHIVE, record);
        const size = billboardSize(t, record);
        const batch = renderer.createBillboardBatch(JUNGLE_ARCHIVE, record, size, g.centers);
        batch._box = flatBatchAabb(g.centers, size);
        batch.sway = floraSwayOf(JUNGLE_ARCHIVE, natureSet, size.h);
        batch.windfall = windfallResponse(JUNGLE_ARCHIVE, record);
        if (g.young) batch.farH = 0;
        unionBox(batch._box);
        batches.push(batch);
        forestGroups.set(gk, { batch, centers: g.centers, size });
        if (isCoverFlat(JUNGLE_ARCHIVE, record, size)) for (const c of g.centers) coverItems.push(...coverProxies(c, size, { tree: true }));
        continue;
      }
      const { proto, far } = pic;
      if (pic.h == null) { jungle.door.acquire(far); jungleHandles.push(far); pic.h = jungleHandles.length - 1; }
      const own = Float32Array.from(g.own), scales = Float32Array.from(g.own, (v) => v / JUNGLE_SCALE_MAX);
      const near = g.spanned ? g.centers.map((c) => !g.spanned.has(c)) : null;
      jungleSet.push({ h: pic.h, centers: near ? g.centers.filter((_, i) => near[i]) : g.centers, wild: null, own: near ? own.filter((_, i) => near[i]) : own, fit: null });
      const batch = renderer.createBillboardBatch(JUNGLE_ARCHIVE, far.record, far.size, g.centers, { scales });
      batch.lptProto = g.spans ? [far, ...g.spans] : far;
      batch.sunLift = JUNGLE_SUN_LIFT;
      batch.farH = g.young ? 0 : proto.size.h;
      batch._box = flatBatchAabb(g.centers, far.size);
      batch.sway = floraSwayOf(JUNGLE_ARCHIVE, natureSet, proto.size.h);
      _lptSway.set(proto, Math.max(_lptSway.get(proto) ?? 0, batch.sway));
      batch.windfall = windfallResponse(JUNGLE_ARCHIVE, record);
      _lptWindfall.set(proto, Math.max(_lptWindfall.get(proto) ?? 0, batch.windfall));
      unionBox(batch._box);
      batches.push(batch);
      forestGroups.set(gk, { batch, centers: g.centers, size: far.size, scales });
      g.centers.forEach((c, i) => coverItems.push(...jungleCover(c, species, own[i])));
    }
    for (const { archive, record, scale, centers } of scaledGroups.values()) {
      const t = await getTexture(archive);
      if (record >= t.recordCount) continue;
      uploadRecord(archive, record);
      const base = billboardSize(t, record);
      const size = { w: base.w * scale.x, h: base.h * scale.y };
      const batch = renderer.createBillboardBatch(archive, record, size, centers);
      batch._box = flatBatchAabb(centers, size);
      unionBox(batch._box);
      armFlatAnim(batch, t, archive, record, flatAnims, uploadRecordFrame);
      batches.push(batch);
      if (isCoverFlat(archive, record, size)) for (const c of centers) coverItems.push(coverProxy(c, size));
      coverItems.push(...flatBodies(t, archive, record, size, centers, { tree: natureSet.has(archive) && isTreeRecord(natureBase(archive), record) }));
    }
    const standFlats = [];
    for (const sf of pixelStandFlats) {
      const horse = isStandingHorseFlat(sf.archive, sf.record);
      const [archive, record] = horse ? [sf.archive, sf.record] : drawnFlat(sf.archive, sf.record);
      const t = await getTexture(archive);
      if (!t || record >= t.recordCount) continue;
      uploadRecord(archive, record);
      const size = billboardSize(t, record);
      const centers = [[sf.x, sf.y, sf.z]];
      const batch = renderer.createBillboardBatch(archive, record, size, centers);
      batch._box = flatBatchAabb(centers, size);
      unionBox(batch._box);
      armFlatAnim(batch, t, archive, record, flatAnims, uploadRecordFrame);
      batches.push(batch);
      standFlats.push(standFlatRecord(sf, batch, standFlatId(`${px},${py}`, sf.x, sf.z)));
    }
    collider.cover.remove(key);
    const coverT = ((o) => () => host.state.pixelTranslation(px, py, o))([0, 0, 0]);
    for (let i = 0; i < coverItems.length; i += COVER_SLICE) {
      if (i) await breather.breathe();
      collider.cover.add(key, coverItems.slice(i, i + COVER_SLICE), coverT);
    }

    await pipeline.loadFlats();
    const pixelNpcs = [];
    for (const flat of pixelNpcFlats) {
      const [drawArchive, drawRecord] = drawnFlat(flat.archive, flat.record);
      const t = await getTexture(drawArchive);
      if (!t || drawRecord >= t.recordCount) continue;
      const size = billboardSize(t, drawRecord);
      const pn = exteriorNpcRecord(flat, pipeline.flatsFile()?.getFlatData(flat.archive, flat.record) ?? null);
      pixelNpcs.push({ ...pn, drawArchive, drawRecord, width: size.w, height: size.h, active: true, questBehaviour: null, host: null, witch: flat.witch ?? null, ...(flat.witch ? { _mwLook: null } : {}) });
      unionBox(flatBatchAabb([[flat.x, flat.y, flat.z]], size));
    }

    models.sort((a, b) => a._order - b._order);
    const staticMerged = await staticBuilder.finishSliced(() => breather.breathe());
    const staticBatch = staticMerged ? renderer.createMesh(staticMerged, { bounds: staticMerged.bounds }) : null;
    made.staticBatch = staticBatch;

    const dwResult = dwNear ? await dwNear.catch(() => null) : undefined;
    publishBuilt({
      dfLocation, locBlocks, pixelBoards, pixelDungeonDoors, pixelHomeFrames, pixelGates, key, px, py, snowRec,
      models, wodSpawners, privateersHold, made, staticBatch, locationRect, seasonsGen, homeTown, pixelHomeKeys,
      pixelBuildingKeys, homeLookRead, witchDress, witchFloor, beach, terrain, water, tilemapTex, tilemap,
      groundArchive, windmills, batches, flatAnims, texRemap, pixelLights, pixelHearths, pixelAnimals, pixelSprings,
      climate, samples, nature, tilemapBytes, pixelSeason, flatLog, skinBlocks, statics, groupBatches, groupForest,
      coverItems, groupCover, pixelTrees, vergeNet, groundMid, coverT, townClimateBase, paths, withRoads, bounds,
      stride, bed, normals, population, locOrigin, personBatches, lefaySpot, yardSites, portSites, pixelNpcs,
      standFlats, pixelGraves, pixelBuildings, pixelWodLights, wodSite, pixelRocks, vergeOff, eco, groundNear,
      natureArchive, forestGroups, lptGroups, lptHandles, jungleSet, jungleHandles, arenaOrigin, gateClear,
      gateLedger, pipeline, avg, dwResult, wasteR, pixelRuinKeys, cromwarkDamage
    });
    if (!withRoads && terrainGen.hasRoads) {
      if (!roadsRetry) {
        destroyPixel(px, py, { collectLoose: false });
        return buildPixelNow(px, py, { roadsRetry: true });
      }
      console.warn(`[roads] pixel ${key} painted without the network twice - kept as painted`);
    }
    const entry = built.get(key); pipeline.settle();
    const wantStride = strideFor(px, py);
    if (wantStride !== entry._stride) {
      if (wantStride === 1) host.restridePending.set(key, entry);
      else restrideTerrain(entry, wantStride);
    }
    await standPixelNpcs(entry);
    return entry;
  }
  // Keep the publish synchronous: no await between the deep-water result and the re-skin mark.
  function publishBuilt({
    dfLocation, locBlocks, pixelBoards, pixelDungeonDoors, pixelHomeFrames, pixelGates, key, px, py, snowRec, models,
    wodSpawners, privateersHold, made, staticBatch, locationRect, seasonsGen, homeTown, pixelHomeKeys,
    pixelBuildingKeys, homeLookRead, witchDress, witchFloor, beach, terrain, water, tilemapTex, tilemap,
    groundArchive, windmills, batches, flatAnims, texRemap, pixelLights, pixelHearths, pixelAnimals, pixelSprings,
    climate, samples, nature, tilemapBytes, pixelSeason, flatLog, skinBlocks, statics, groupBatches, groupForest,
    coverItems, groupCover, pixelTrees, vergeNet, groundMid, coverT, townClimateBase, paths, withRoads, bounds,
    stride, bed, normals, population, locOrigin, personBatches, lefaySpot, yardSites, portSites, pixelNpcs,
    standFlats, pixelGraves, pixelBuildings, pixelWodLights, wodSite, pixelRocks, vergeOff, eco, groundNear,
    natureArchive, forestGroups, lptGroups, lptHandles, jungleSet, jungleHandles, arenaOrigin, gateClear, gateLedger,
    pipeline, avg, dwResult, wasteR, pixelRuinKeys, cromwarkDamage
  }) {
    const pixelBoardSplit = dfLocation && locBlocks && seatAtMapId(townSeats, dfLocation.mapTableData?.mapId) ? boardSplitOf({ boards: pixelBoards }) : null;
    const seatPalaceKeys = pixelBoardSplit ? palaceKeysOf(locBlocks, makeBuildingKey) : [];
    const seatTier = dfLocation ? seatAtMapId(townSeats, dfLocation.mapTableData?.mapId)?.tier ?? 'palace' : 'palace';
    const castleGate = seatTier === 'crown' ? castleEntranceOf(pixelDungeonDoors) : null;
    const seatAnchors = pixelBoardSplit ? seatBannerAnchors({
      frames: pixelHomeFrames, palaceKeys: seatPalaceKeys, castle: castleGate,
      gates: pixelGates.map((g) => ({ local: g.local, box: g.entry?._box })), boards: pixelBoards, bounty: pixelBoardSplit,
      centre: townCentreOf(pixelHomeFrames),
    }) : null;
    const festivalAnchors = !wasteR && pixelBoardSplit ? festivalBannerAnchors({ frames: pixelHomeFrames, tavernKeys: buildingKeysOfType(locBlocks, makeBuildingKey, TALK_BUILDING_TYPES.Tavern), boards: pixelBoards, bounty: pixelBoardSplit }) : null;
    const festivalLanterns = festivalAnchors ? festivalLanternsOf([...(seatAnchors ?? []), ...festivalAnchors]) : null;
    const pixelChapterHalls = new Map(chapterSheet && dfLocation && locBlocks ? buildingSummaries(dfLocation.exterior?.buildings ?? [], locBlocks, { locationIndex: dfLocation.locationIndex ?? 0, locationName: dfLocation.name })
      .filter((b) => (b.buildingType === TALK_BUILDING_TYPES.GuildHall || b.buildingType === TALK_BUILDING_TYPES.Temple) && b.factionId > 0)
      .map((b) => [b.buildingKey, b.factionId]) : []);
    const siegeField = pixelBoardSplit ? siegeFieldOf({
      frames: pixelHomeFrames, palaceKeys: seatPalaceKeys,
      templeKeys: buildingKeysOfType(locBlocks, makeBuildingKey, TALK_BUILDING_TYPES.Temple), hallKeys: buildingKeysOfType(locBlocks, makeBuildingKey, TALK_BUILDING_TYPES.GuildHall),
      gates: pixelGates.map((g) => ({ box: g.entry?._box })), boards: pixelBoards, bounty: pixelBoardSplit, centre: townCentreOf(pixelHomeFrames),
      tier: seatTier, castle: castleGate,
    }) : null;
    if (siegeField) siegeFieldsByTown.set(dfLocation.mapTableData?.mapId, { key, px, py, field: siegeField });
    const snowSeen = snowRec?.done(models.length > 0 || dfLocation != null) ?? null;
    const wodKept = adoptWodCarry(key, wodSpawners, privateersHold);
    const wodLife = wodKept.life ?? {};
    if (!wodKept.life) wodForgetPeerSites(key);
    if (_building.get(key) === made) _building.delete(key);
    built.set(key, {
      staticBatch,
      locationRect,
      _seasonsGen: seasonsGen,
      homeTown, homeKeys: pixelHomeKeys, buildingKeys: pixelBuildingKeys,
      _lookV: homeLookRead,
      homeFrames: pixelHomeFrames, homeRegion: dfLocation?.regionIndex ?? 0,
      seatAnchors, _boardSplit: pixelBoardSplit, festivalAnchors, festivalLanterns,
      witchHomes: witchDress?.homes ?? null, witchFloor,
      chapterHalls: pixelChapterHalls,
      bunnyHalls: bunnyHallsOf(dfLocation, locBlocks),
      beach: beach ?? null,
      ruinKeys: pixelRuinKeys, cromwarkDamage, wasteR, px, py, terrain, water, tilemapTex, tilemap, groundArchive, models, windmills, batches, flatAnims, texRemap, lights: pixelLights, hearths: pixelHearths, animals: pixelAnimals, springs: pixelSprings, skyBase: climate.skyBase, samples, natureCount: nature.length,
      tilemapBytes, season: pixelSeason,
      _snow: snowSeen,
      _skin: snowSeen ? { log: flatLog, blocks: skinBlocks, statics: remapAsked(texRemap) ? statics : null, batches: groupBatches, forest: groupForest, cover: coverItems.slice(groupCover), trees: pixelTrees, vergeNet, groundMid, usesSeason: models.length > 0 || dfLocation != null, climate, coverT } : null,
      _skinGen: 0,
      townClimate: townClimateBase,
      paths,
      withRoads,
      _box: bounds,
      _stride: stride,
      _bed: bed,
      groundNormals: labGrass && stride === 1 ? normals : null,
      population, locOrigin, personBatches,
      lefay: lefaySpot,
      merchantYards: yardSites,
      portSites,
      wardenTown: dfLocation && isWardenTown(dfLocation.mapTableData?.locationType) ? (dfLocation.mapTableData?.mapId ?? 0) >>> 0 : null,
      npcs: pixelNpcs,
      standFlats,
      npcBatches: [], npcQuestPass: false,
      boards: pixelBoards,
      graves: pixelGraves,
      cityGates: pixelGates,
      buildings: pixelBuildings,
      locBlocks,
      wodLights: pixelWodLights,
      wodSite,
      rocks: pixelRocks,
      verge: vergeNet ? (x, z, reach) => vergeClear(vergeNet, px, py, x, z, reach) : null,
      vergeOff,
      eco, ecoGround: eco ? groundNear : null,
      forest: { base: climate.natureArchive, archive: natureArchive, trees: pixelTrees.filter((t) => forestGroups.has(t.group)), groups: forestGroups },
      lowPolyTrees: lptGroups.length ? { px, py, ox: 0, oy: 0, oz: 0, handles: lptHandles, groups: lptGroups, trees: null, centers: null } : null,
      jungleTrees: jungleSet.length ? { px, py, ox: 0, oy: 0, oz: 0, handles: jungleHandles, groups: jungleSet, trees: null, centers: null } : null,
      wodSpawners,
      privateersHold,
      arena: arenaOrigin,
      wodLife,
      gateClearKey: gateClear?.key ?? null,
      gateRefused: gateLedger.refused,
      wodReach: gateLedger.reach.length ? Float32Array.from(gateLedger.reach) : null,
      placeHold: pipeline,
      location: dfLocation ? dfLocation.name : null,
      centerHeight: samples[64 * HEIGHTMAP_DIMENSION + 64] * worldHeight,
      avgY: dfLocation ? avg * worldHeight : 0,
    });
    if (deepWaters) deepWaters.published(built.get(key), dwResult);
    if (dwDecor) dwDecor.onPromote(built.get(key));
    if (host.oceanHoles) host.oceanHoles.promoted(built.get(key));
    snowfall.promoted(built.get(key));
    const dwRubbleKept = _dwRubbleCarry.get(key);
    if (dwRubbleKept) { _dwRubbleCarry.delete(key); const e = built.get(key); for (const r of dwRubbleKept) r.entry = e; _dwRubble.set(e, dwRubbleKept); }
    host.gatherHost?.onBuilt(built.get(key));
    for (const pile of wodKept.piles ?? []) standWodPile(key, wodLife, pile);
    gateClearSweep.published(key, gateClear?.key);
    if (host.labGrassField) {
      const t = host.state.pixelTranslation(px, py);
      host.labGrassField.invalidate(t[0], t[2], t[0] + TERRAIN_SIZE, t[2] + TERRAIN_SIZE);
    }
    if (host.hccGroundMoved) {
      const t = host.state.pixelTranslation(px, py);
      host.hccGroundMoved(t[0], t[2], t[0] + TERRAIN_SIZE, t[2] + TERRAIN_SIZE);
    }
    const groundWas = _groundBefore.get(key);
    if (groundWas) {
      _groundBefore.delete(key);
      const now = built.get(key).samples, t = host.state.pixelTranslation(px, py);
      const groundIn = (smp, x, z) => {
        const fx = Math.max(0, Math.min(TERRAIN_SIZE, x - t[0])) / heightCell, fz = Math.max(0, Math.min(TERRAIN_SIZE, z - t[2])) / heightCell;
        const ix = Math.min(HEIGHTMAP_DIMENSION - 2, Math.floor(fx)), iz = Math.min(HEIGHTMAP_DIMENSION - 2, Math.floor(fz)), sx = fx - ix, sz = fz - iz;
        const at = (a, b) => smp[a * HEIGHTMAP_DIMENSION + b];
        return (at(ix, iz) * (1 - sx) * (1 - sz) + at(ix + 1, iz) * sx * (1 - sz) + at(ix, iz + 1) * (1 - sx) * sz + at(ix + 1, iz + 1) * sx * sz) * worldHeight;
      };
      const moved = (x, z) => groundIn(now, x, z) - groundIn(groundWas, x, z);
      host.rideGround?.(t, key, moved);
    }
    if (homeTown) host._homeLookV = -1;
    if (host.travelOptions && dfLocation) {
      const here = playerTravelPixel();
      if (px === here.x && py === here.y) host.travelOptions.initLocationRects(here);
    }
    if (seasons && seasonsGen !== seasons.generation) _reskin.mark(key);
  }
  /**
   * @param {string} key
   */
  async function reskinPixelNow(key) {
    breather.reset();
    const p = built.get(key), sk = p?._skin;
    if (!sk || !snowCover?.on) return false;
    await snowCover.settle(breather);
    if (built.get(key) !== p) return false;
    const { px, py } = p, pipeline = p.placeHold;
    const rec = snowCover.recorder(px, py);
    const pixelSeason = rec.pixel(sk.groundMid - SEA_LEVEL_M, host.season);
    const natureArchive = getNatureArchive(sk.climate.natureArchive, pixelSeason);
    const lists = new Map();
    const pics = sk.log.map((f) => {
      if (f.block != null) {
        let list = lists.get(f.block);
        if (!list) lists.set(f.block, (list = collectBlockFlats(sk.blocks[f.block].dfBlock, natureArchive, sk.blocks[f.block].opts)));
        return [list[f.n].archive, list[f.n].record];
      }
      if (f.wild != null) return [getNatureArchive(f.wild, rec.flat(f.c[0], f.c[2], f.c[1] - SEA_LEVEL_M, pixelSeason)), f.record];
      return [f.archive, f.record];
    });
    const flatsTurn = pics.some((pic, j) => pic[0] !== sk.log[j].archive || pic[1] !== sk.log[j].record);
    const law = `climate:${p.townClimate}.${pixelSeason}`, turns = remapLawOf(p.texRemap) !== law;
    const lawOf = (c) => (a, r) => applyClimate(a, r, c, pixelSeason);
    const made = { mesh: undefined, batches: [], forestGroups: new Map(), coverItems: [], lptHandles: [], lptGroups: [] };
    let traded = false;
    try {
      let table = turns ? await reskinRemap(p.texRemap, law, lawOf, pipeline) : p.texRemap;
      if (table !== p.texRemap && sameTable(table, p.texRemap)) table = p.texRemap;
      if (table !== p.texRemap && sk.statics) {
        const merge = new StaticBatchBuilder(), resolve = keyResolver(table), own = keyResolver(NO_CLIMATE_REMAP);
        for (const [cpu, local, isOwn, nm] of sk.statics) { merge.add(cpu, local, isOwn ? own : resolve, nm); await breather.breathe(); }
        const merged = await merge.finishSliced(() => breather.breathe());
        made.mesh = merged ? renderer.createMesh(merged, { bounds: merged.bounds }) : null;
      }
      const homes = [];
      if (turns) {
        for (const m of p.models) {
          if (!m._home) continue;
          const look = onlineHomes && p.homeTown ? lookOfHome(p.homeTown, m._home.bk, onlineHomes.homesIn(p.homeTown)?.get(m._home.bk) ?? null) : null;
          homes.push([m, look ? await homeLookRemap(m.gpu.subMeshes, table, look, pixelSeason, pipeline) : null]);
        }
        for (const m of p.models) if (m._magic) homes.push([m, await magicOutsideRemap(m.gpu.subMeshes, table, { getTexture: pipeline.getTexture, renderer })]);
      }
      const mill = turns && p.models.some((m) => m._mill) ? (await getWindmillMeshes(p.townClimate, pixelSeason === SEASON.Winter)).body : null;
      let flats = null;
      if (flatsTurn) {
        const { groups, wild, places } = groupFlats(sk.log, pics);
        const borderNature = new Map();
        sk.log.forEach((f, j) => { if (f.wild != null && pics[j][0] !== natureArchive) borderNature.set(pics[j][0], f.wild); });
        const natureSet = new Set([natureArchive, ...borderNature.keys()]);
        const natureBase = (a) => (a === natureArchive ? sk.climate.natureArchive : borderNature.get(a));
        if (await host.seasonsReady) await seasons.onTerrainInstantiated();
        const seasonsGen = seasons?.generation ?? 0;
        const box = [...p._box];
        const unionBox = (b) => { for (let i = 0; i < 3; i++) { if (b[i] < box[i]) box[i] = b[i]; if (b[3 + i] > box[3 + i]) box[3 + i] = b[3 + i]; } };
        await standFlatGroups({ px, py, groups, wild, natureSet, natureBase, tilemap: p.tilemap, paths: p.paths, vergeNet: sk.vergeNet, uploadRecord: pipeline.uploadRecord, uploadRecordFrame: pipeline.uploadRecordFrame, flatAnims: p.flatAnims, unionBox }, made);
        const cover = collider.cover.staged(sk.coverT);
        const items = [...made.coverItems, ...sk.cover];
        for (let i = 0; i < items.length; i += COVER_SLICE) {
          if (i) await breather.breathe();
          collider.cover.fill(cover, items.slice(i, i + COVER_SLICE));
        }
        flats = { places, seasonsGen, box, cover };
      }
      if (table !== p.texRemap) table = await reskinRemap(p.texRemap, law, lawOf, pipeline, table);
      if (built.get(key) !== p) return false;
      traded = true;
      if (p.season !== pixelSeason) p._skinGen++;
      p.season = pixelSeason;
      p._snow = rec.done(sk.usesSeason);
      p.texRemap = table;
      if (made.mesh !== undefined) { if (p.staticBatch) renderer.destroyMesh(p.staticBatch); p.staticBatch = made.mesh; }
      for (const [m, map] of homes) { if (m._home) m._home.seq++; m.texRemap = map; }
      if (mill) for (const m of p.models) if (m._mill) m.gpu = mill;
      if (flats) {
        for (const b of sk.batches) {
          p.flatAnims.remove(b);
          renderer.destroyBatch(b);
          const i = p.batches.indexOf(b);
          if (i >= 0) p.batches.splice(i, 1);
        }
        p.batches.unshift(...made.batches);
        const forestGroups = new Map();
        for (const [k, g] of p.forest.groups) if (!sk.forest.has(k)) forestGroups.set(k, g);
        for (const [k, g] of made.forestGroups) forestGroups.set(k, g);
        placeTrees(sk.log, pics.map((pic) => pic[0]), flats.places);
        p.forest = { base: sk.climate.natureArchive, archive: natureArchive, trees: sk.trees.filter((t) => forestGroups.has(t.group)), groups: forestGroups };
        const sunk = new Set();
        for (const [k, g] of made.forestGroups) g.centers.forEach((c, i) => { if (FELLED.has(c)) sunk.add(`${k}#${i}`); });
        sinkFelled({ groups: made.forestGroups }, sunk, renderer);
        const was = p.lowPolyTrees?.handles ?? [];
        p.lowPolyTrees = made.lptGroups.length ? { px, py, ox: 0, oy: 0, oz: 0, handles: made.lptHandles, groups: made.lptGroups, trees: null, centers: null } : null;
        for (const h of was) lowPolyTrees?.release(h);
        FOREST_STAMP.n++;
        collider.cover.place(key, flats.cover);
        for (let i = 0; i < 6; i++) p._box[i] = flats.box[i];
        p._seasonsGen = flats.seasonsGen;
        sk.batches = made.batches;
        sk.forest = new Set(made.forestGroups.keys());
      }
      sk.log.forEach((f, j) => { f.archive = pics[j][0]; f.record = pics[j][1]; });
      host.gatherHost?.restandAt(px, py);
      return true;
    } finally {
      if (!traded) {
        for (const b of made.batches) { p.flatAnims?.remove(b); renderer.destroyBatch(b); }
        for (const h of made.lptHandles) lowPolyTrees?.release(h);
        if (made.mesh) renderer.destroyMesh(made.mesh);
      }
    }
  }
  _reskin.skinWith(reskinPixelNow);
  return { buildPixelNow };
}

/**
 * @param {Array<{ c: number[], wild?: number }>} log
 * @param {Array<number[]>} pics
 */
export function groupFlats(log, pics) {
  const groups = new Map(), wild = new Set(), places = new Array(log.length);
  for (let j = 0; j < log.length; j++) {
    const [archive, record] = drawnFlat(pics[j][0], pics[j][1]);
    const k = `${archive}_${record}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    places[j] = [k, g.length];
    if (log[j].wild != null) wild.add(`${k}#${g.length}`);
    g.push(log[j].c);
  }
  return { groups, wild, places };
}
/**
 * @param {Array<{ tree?: any }>} log
 * @param {number[]} archives
 * @param {Array<[string, number]>} places
 */
export function placeTrees(log, archives, places) {
  for (let j = 0; j < log.length; j++) {
    const t = log[j].tree;
    if (t) { t.group = places[j][0]; t.i = places[j][1]; t.archive = archives[j]; }
  }
}
const sameTable = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
