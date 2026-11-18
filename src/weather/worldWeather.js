// Weather and seasons in the world: the rain, wind, sand, heat haze, windfall, atmosphere, and
// snowfall renderers, and the lab grass. It also holds the ripple field, weather changes, and the
// season turn that re-skins the streamed ground.
import { aabbOutside } from '../render/frustum.js';
import { afterFirstFrame } from '../systems/afterFirstFrame.js';
import { altitudeOfWorldY } from './airTemperature.js';
import { authoredTiles, createSnowfallHost, settlementsIn, snowfallNetwork } from './snowfallHost.js';
import { BOAT_STIR, BOAT_WAKE_SPEED, RIPPLE_CELLS, RIPPLE_SPAN } from '../world/waterRipples.js';
import { BODY_CAPSULE_RADIUS } from '../magic/spellcast.js';
import { carvedFloorLocalY } from '../underwater/deepWatersHost.js';
import { cellOfField } from '../render/volumetricClouds.js';
import { climateSeasonFromMinutes, SEASON } from '../world/climateSwaps.js';
import { createAtmosphereHost } from './atmosphereHost.js';
import { createHeatHaze } from './heatHaze.js';
import { createWindAudio } from './windAudio.js';
import { createWindfallHost } from './windfallHost.js';
import {
  currentFieldCells, currentWeather, systemWordOf, weatherPhaseFlip, weatherSystemStamp,
} from './weatherSim.js';
import { dateFromClassicMinutes, MINUTES_PER_DAY, seasonValue } from '../world/gameDate.js';
import { fieldFromNative, nativeFromField } from './weatherField.js';
import { getPref } from '../ui/uiPrefs.js';
import { gridValueAt, surfaceHeightAt, surfaceNormalAt, surfaceNormalFromSamples } from '../world/terrainSurface.js';
import { HeatHazeRenderer } from '../render/heatHaze.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { LAB_DIM, LAB_GRASS, LabGrassRenderer } from '../render/labGrass.js';
import {
  LightningPlayer, precipitationForWeather, skyOffsetForWeather, weatherSunlightScale,
} from '../world/weather.js';
import { liveSeasonPin, takeSeasonViewDirty } from '../world/seasonView.js';
import { nearestFirstFrom } from '../world/streamingWorld.js';
import { pageParam } from '../platform/pageQuery.js';
import { phaseTerms } from './weatherFront.js';
import { PrecipitationRenderer } from '../render/precipitation.js';
import { SAND_LOOK, WindWispsRenderer } from '../render/windWisps.js';
import { seaStormShown } from '../systems/naval/seaVenturesHost.js';
import { skyMinutes } from '../world/worldTick.js';
import { startPrograms } from '../render/glProgram.js';
import { SUNBABY_WEATHER } from '../world/sunbabySky.js';
import { TERRAIN_SIZE } from '../world/terrainSampler.js';
import { warmPrograms } from '../render/warmPrograms.js';

/** @param {any} shared */
export function createWorldWeather(shared) {
  const {
    _reskin, blocks, destroyPixel, locationIndex, maps, params, precipOpts, renderer, seasonPin, seasons, sky,
    terrainGen, weatherFogRow, weatherSeed,
  } = shared;
  const wxEye32 = new Float32Array(3);
  // The rain renderer can exist early; the precipitation mode, not the renderer, gates its draw.
  afterFirstFrame(() => void warmPrograms([
    ...renderer.warmSteps(),
    ...(renderer.lazyWarmSteps?.() ?? []),
    { start: () => startPrograms(renderer.gl, PrecipitationRenderer.PROGRAMS), run: () => { if (!shared.precip) shared.precip = new PrecipitationRenderer(renderer.gl, precipOpts); }, need: () => !shared.precip },
  ]));
  const wisps = sky.enhanced ? new WindWispsRenderer(renderer.gl) : null;
  const windAudio = createWindAudio();
  const sand = sky.enhanced ? new WindWispsRenderer(renderer.gl, SAND_LOOK) : null;
  const hazeGl = sky.enhanced ? new HeatHazeRenderer(renderer.gl) : null;
  const heatHaze = createHeatHaze();
  const windfall = createWindfallHost({ gl: renderer.gl, enhanced: !!sky.enhanced });
  const atmosphere = createAtmosphereHost({ gl: renderer.gl, enhanced: !!sky.enhanced, heightAt: (x, z) => shared.heightAt(x, z) });
  // Cleared each frame: a pixel publish lands between frames.
  const _snowPixels = new Map();
  const _snowIds = new WeakMap();
  let _snowNextId = 0;
  const snowIdOf = (o) => { if (!o) return 0; let id = _snowIds.get(o); if (id === undefined) { id = ++_snowNextId; _snowIds.set(o, id); } return id; };
  const _snowG = [0, 0];
  const snowGround = {
    size: TERRAIN_SIZE,
    get terrainDistance() { return shared.state.terrainDistance; },
    pixelAt(x, z) {
      const c = shared.state.compensation;
      return snowGround.pixelOn(shared.state.mapOrigin.x + Math.floor((x - c[0]) / TERRAIN_SIZE), shared.state.mapOrigin.y - Math.floor((z - c[2]) / TERRAIN_SIZE));
    },
    pixelOn(px, py) {
      if (px < 0 || px >= 1000 || py < 0 || py >= 500) return null;
      const k = px * 1000 + py;
      let p = _snowPixels.get(k);
      if (p === undefined) { p = shared.built.get(`${px},${py}`) ?? null; if (p && !(p.samples && p.tilemapBytes)) p = null; _snowPixels.set(k, p); }
      return p;
    },
    pixelsNear(ring) {
      const cur = shared.state.current, out = [];
      for (const p of shared.built.values()) if (p.samples && p.tilemapBytes && Math.max(Math.abs(p.px - cur.x), Math.abs(p.py - cur.y)) <= ring) out.push(p);
      return out.sort(nearestFirstFrom(cur));
    },
    translation: (p, out) => shared.state.pixelTranslation(p.px, p.py, out),
    height(p, lx, lz) {
      if (p.deepWaters && shared.deepWaters) { const f = shared.deepWaters.floorLocalY(p, lx, lz); if (f != null) return f; }
      const stride = p._stride ?? 1, h = surfaceHeightAt(p.samples, lx, lz, stride), d = p._bed?.depths, g = 128 / stride + 1;
      return d ? h - gridValueAt(d, g, g, shared.tileSide * stride, lx, lz) : h;
    },
    normal: (p, lx, lz, out) => (p.groundNormals && (p._stride ?? 1) === 1 ? surfaceNormalAt(p.groundNormals, lx, lz, out) : surfaceNormalFromSamples(p.samples, lx, lz, p._stride ?? 1, out)),
    tileMap: (p) => p._dwBytes ?? p.tilemapBytes,
    climate: (p) => maps.getClimateIndex(p.px, p.py),
    mapPixel: (p) => ({ x: p.px, y: p.py }),
    stamp: (p) => `${p._stride ?? 1}/${snowIdOf(p._dwBytes ?? p.tilemapBytes)}/${snowIdOf(p.deepWaters)}/${snowIdOf(p._bed?.depths)}`,
    bare: (p, lx, lz) => !!p.deepWaters && carvedFloorLocalY(p.deepWaters, lx, lz) != null,
    roads(p) {
      const raw = terrainGen.roads();
      const net = raw?.source === 'basic-roads' ? snowfallNetwork(raw, p.px, p.py) : null;
      if (!net) return null;
      const loc = p.locationRect ? locationIndex.get(`${p.px},${p.py}`) : null;
      const authored = loc?.exterior?.exteriorData && (net.roads | net.roadCorners | net.paths | net.pathCorners) !== 0 ? authoredTiles(loc, maps, blocks) : new Uint8Array(16384);
      return { ...net, authored, rect: p.locationRect ?? { xMin: 0, xMax: 0, yMin: 0, yMax: 0 } };
    },
    toGlobal(x, z) {
      const c = shared.state.compensation;
      _snowG[0] = shared.state.mapOrigin.x * TERRAIN_SIZE + (x - c[0]);
      _snowG[1] = (499 - shared.state.mapOrigin.y) * TERRAIN_SIZE + (z - c[2]);
      return _snowG;
    },
    settlements: (minX, minZ, maxX, maxZ) => settlementsIn((x, y) => locationIndex.get(`${x},${y}`) ?? null, minX, minZ, maxX, maxZ),
  };
  const snowfall = createSnowfallHost({ gl: renderer.gl, renderer, enhanced: !!sky.enhanced, ground: snowGround });
  const snowPlayer = () => (shared.walkMode && shared.playerSpawned
    ? { x: shared.player.pos[0], y: shared.player.pos[1], z: shared.player.pos[2], grounded: !!shared.player.grounded, swimming: !!shared.player.swimming, levitating: !!shared.player.levitating }
    : { x: shared.cam.pos[0], y: shared.cam.pos[1], z: shared.cam.pos[2], grounded: false, swimming: false, levitating: true });
  const snowNpcs = () => {
    const out = [];
    for (const f of shared.exteriorFoes.foes) if (!f.dead && f.ai?.feet) out.push({ id: f, x: f.ai.feet[0], z: f.ai.feet[2], active: true, grounded: !!f.ai.isGrounded, radius: BODY_CAPSULE_RADIUS, citizen: false });
    for (const g of shared.cityGuards.guards) if (!g.dead && g.ai?.feet) out.push({ id: g, x: g.ai.feet[0], z: g.ai.feet[2], active: true, grounded: !!g.ai.isGrounded, radius: BODY_CAPSULE_RADIUS, citizen: false });
    for (const seat of shared._livePersons) out.push({ id: seat.person, x: seat.pos[0], z: seat.pos[2], active: true, grounded: true, radius: 0, citizen: true });
    return out;
  };
  const snowBodies = () => shared.exteriorFoes.physicalCorpses().concat(shared.cityGuards.physicalCorpses());
  const grassRecords = new Map(), floorRecords = new Map();
  const groundPuddles = new Map();
  const groundMeanColour = new Map();
  const groundDrawnMeans = new Map();
  const grassDensity = Math.max(0, Math.min(1, Number(getPref('grassDensity')) || 0)) * LAB_GRASS.density;
  const labGrass = isEnhanced() && getPref('enhancedEnvironments') && grassDensity > 0 && pageParam('grass') !== 'off'
    ? new LabGrassRenderer(renderer.gl, { provoke: pageParam('provoke') !== 'last' }) : null;

  const grassNormalScratch = [0, 1, 0];

  function stirRipples(dt, nowMs) {
    if (!shared.ripples) return;
    shared.ripples.begin(dt, shared.cam.pos[0], shared.cam.pos[2]);
    if (shared._rippleOnWater) shared.ripples.stir(shared.player, shared.player.pos, !!(shared.player.isPlayerSwimming || shared.player.swimming), nowMs);
    for (const boat of shared.csaRuntime?.AllBoats ?? []) {
      const g = boat.GameObject;
      if (g?.activeSelf && g.position) shared.ripples.stir(boat, g.position, true, nowMs, BOAT_STIR, BOAT_WAKE_SPEED);
    }
    shared.ripples.end(dt);
    renderer.setWaterRipples(shared.ripples.field, RIPPLE_SPAN, RIPPLE_CELLS);
  }

  const shownWeather = () => (shared.sunbaby.on ? SUNBABY_WEATHER : seaStormShown() ?? currentWeather());

  const sunbabyGround = (x, z) => { const h = shared.heightAt(x, z); return Number.isFinite(h) ? h : shared.player.pos[1]; };

  const _gateSkyT = [0, 0, 0], _gateStormC = [0, 0, 0];
  const gateSkyTranslate = (px, py) => shared.state.pixelTranslation(px, py, _gateSkyT);

  const weatherTerms = (snowShare = null) => phaseTerms({ sun: shared.weatherSun, dim: LAB_DIM[shared.weather] ?? 1, fog: shared.weatherFog }, shared.weather, (w) => ({ sun: weatherSunlightScale(w, shared.season === SEASON.Winter), dim: LAB_DIM[w] ?? 1, fog: weatherFogRow(w) }), snowShare);

  const fieldXZ = () => { const p = shared.walkMode ? shared.player.pos : shared.cam.pos, wc = shared.state.worldCoords(p); return [...fieldFromNative(wc.x, wc.z), altitudeOfWorldY(p[1] - shared.state.compensation[1])]; };

  const fieldCellsHere = () => currentFieldCells().map((c) => cellOfField(c, (x, z) => { const n = nativeFromField(x, z); return shared.state.localFromWorld(n[0], n[1]); })).filter(Boolean);

  function applyWeather(w) {
    // A phase flip of one system is no change; a new system is, even under the same weather.
    const sys = weatherSystemStamp(), changed = w !== shared.weather ? !(w === currentWeather() && weatherPhaseFlip()) : sys !== shared.seenSystem;
    shared.seenSystem = sys;
    shared.weather = w;
    shared.weatherFog = weatherFogRow(w);
    shared.weatherSkyOffset = skyOffsetForWeather(w, weatherSeed);
    shared.weatherSun = weatherSunlightScale(w, shared.season === SEASON.Winter);
    shared.precipMode = precipitationForWeather(w);
    if (shared.precipMode && shared.precipMode !== 'sand' && !shared.precip) shared.precip = new PrecipitationRenderer(renderer.gl, precipOpts);
    shared.lightning = systemWordOf(w) === 'thunder'
      ? (shared.lightning ?? new LightningPlayer(Number(params.get('wseed')) || 1)) : null;
    if (changed) shared._onWeatherChange?.(w);
  }

  function seasonsMonthTurn(atMinutes) {
    const four = seasonValue(dateFromClassicMinutes(atMinutes));
    if (four === shared._fourSeason) return;
    shared._fourSeason = four;
    if (shared.seasonsActive) seasons.onNewMonth().catch((e) => console.warn('[seasons] month turn:', e?.message ?? e));
  }
  function refreshSeason(atMinutes = skyMinutes()) {
    const day = Math.floor(atMinutes / MINUTES_PER_DAY);
    const picked = takeSeasonViewDirty();
    if (day === shared._seasonDay && !picked) return false;
    shared._seasonDay = day;
    seasonsMonthTurn(atMinutes);
    const want = liveSeasonPin() ?? seasonPin ?? climateSeasonFromMinutes(atMinutes);
    if (want === shared.season) return false;
    shared.season = want;
    shared.weatherSun = weatherSunlightScale(shared.weather, shared.season === SEASON.Winter);
    return true;
  }

  function tickSeason() {
    if (shared._seasonStraightening) return;
    if (refreshSeason() && !shared.snowCover.on) _reskin.markAll();
    // A building pixel must publish before its key is torn down, so the flip waits out any build.
    if (!_reskin.pending || shared.building) return;
    const keys = _reskin.take(shared.built);
    const skin = keys.length ? null : _reskin.runSkin(shared.built, shared.state.current);
    if (skin) { shared.building = true; skin.finally(() => { shared.building = false; }); }
    if (!keys.length) return;
    if (shared.walkMode && shared.playerSpawned && keys.includes(`${shared.state.current.x},${shared.state.current.y}`)) shared._seasonHoldKey = `${shared.state.current.x},${shared.state.current.y}`;
    for (const key of keys) {
      const [bx, by] = key.split(',').map(Number);
      destroyPixel(bx, by, { collectLoose: false });
    }
    const rebuild = keys.map((key) => {
      const [px, py] = key.split(',').map(Number);
      return { px, py };
    }).sort(nearestFirstFrom(shared.state.current));
    shared.queue.push(...rebuild);
    console.log(`[season] ${shared.season === SEASON.Winter ? 'winter' : 'summer'} - re-skinning ${rebuild.length} pixels`);
  }

  const snowOutside = (box, x, y, z) => aabbOutside(shared._planes, box, x, y, z);
  return {
    _gateStormC, _snowPixels, applyWeather, atmosphere, fieldCellsHere, fieldXZ, floorRecords, gateSkyTranslate,
    grassDensity, grassNormalScratch, grassRecords, groundDrawnMeans, groundMeanColour, groundPuddles, hazeGl,
    heatHaze, labGrass, refreshSeason, sand, shownWeather, snowBodies, snowNpcs, snowOutside, snowPlayer, snowfall,
    stirRipples, sunbabyGround, tickSeason, weatherTerms, windAudio, windfall, wisps, wxEye32,
  };
}
