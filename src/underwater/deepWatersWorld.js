// Deep Waters and Ocean Holes in the world. It holds the ocean hole pits, the shared enemy
// spawning, the fish and sunken loot lanes, and the swimmer's seafloor reads. It also builds the
// sea look and distance fog each frame and draws the floors, decorations, fish, and surfaces.
import { addItem } from '../items/inventory.js';
import { BODY_CAPSULE_RADIUS } from '../magic/spellcast.js';
import { canRunHeavyRuntimeWork, onTransientReset } from '../world/deepWaterRuntime.js';
import { CAPSULE_HEIGHT, CAPSULE_RADIUS } from '../player/motor.js';
import { centroidLocal, RUBBLE_RECORDS, TREASURE_PILE_ARCHIVE } from '../world/underwaterLoot.js';
import { CONTAINER_IMAGES } from '../ui/targetIconPanel.js';
import {
  createRandomArmor, createRandomClothing, createRandomGem, createRandomJewellery, createRandomPotion,
  createRandomReligiousItem, createRandomWeapon,
} from '../items/loot.js';
import { createUnderwaterLoot } from './deepWatersLoot.js';
import {
  daylightFactor, distanceFogUniforms, horizonAmbientColor, lookSettings, sceneTint, seafloorAmbientBoost,
  surfaceLook, topSurfaceOpaqueFadeEnd, underwaterFogColor, underwaterVisionDistance,
} from '../world/deepWaterLook.js';
import { daylightScale, isNight } from '../world/worldClock.js';
import { decodedTextureTopDown, preloadTextureRecord } from '../render/textureReplacement.js';
import { DECORATION_CUTOFF, surfaceScrollAt } from '../render/deepWatersRender.js';
import {
  DEEP_WATERS_VENDOR, deepWatersEnemySettings, deepWatersLootSettings, standsTheDeep,
} from './deepWatersHost.js';
import { fieldOfView } from '../ui/viewSettings.js';
import { fishIconArchive } from './deepWatersFishItems.js';
import { FLOOR_INNER_COLOR, SURFACE_INNER_COLOR } from '../world/oceanHoles.js';
import { largeHudWorldAspect } from '../ui/hudLarge.js';
import { lookAt, mirrorProjectionX, perspective, UP_Y } from '../world/mat4.js';
import { mapPixelToWorldCoords } from '../world/streamingWorld.js';
import { mintCondition, setItemFields } from '../items/itemTemplates.js';
import { modSetting, modSettingsGeneration } from '../mods/modSettings.js';
import { playerEntity } from '../characters/playerEntity.js';
import { rayUprightCapsule } from '../world/passiveFish.js';
import { spawnRevealDistance } from '../world/underwaterEnemies.js';
import { SURFACE_RENDER_Y_OFFSET } from '../world/deepWaterSurface.js';
import { surfaceHeightAt } from '../world/terrainSurface.js';
import { TERRAIN_SIZE } from '../world/terrainSampler.js';
import { trySpawnTreasureGuards } from './deepWatersEncounters.js';
import { UNDERWATER_MURK } from '../world/underwaterLook.js';
import { timeScale as worldTimeScale } from '../world/timeScale.js';

/** @param {any} shared */
export function createDeepWatersWorld(shared) {
  const {
    _dwRubble, _ohDungeons, built, canvas, collider, deepWaters, dwDecor, dwEnemies, dwFish, dwFishPictures,
    dwFreeRubble, dwRender, dwStandFoe, heightAt, ohRender, playerTravelPixel, renderer, snowCover, waterOn,
  } = shared;
  const dwPlaying = () => !shared._dwOverlayUp();

  const _ohOrigin = [0, 0, 0];

  const ohGpsWorld = () => {
    if (shared.modes?.mode === 'dungeon') return mapPixelToWorldCoords(shared.state.current.x, shared.state.current.y);
    const wc = shared.state.worldCoords(shared.walkMode && shared.playerSpawned ? shared.player.pos : shared.cam.pos);
    return { x: Math.trunc(wc.x), z: Math.trunc(wc.z) };
  };

  const ohDungeonOf = (ctx) => {
    if (!ctx?.abyss) return null;
    let d = _ohDungeons.get(ctx);
    if (!d) { d = { ...ctx.abyss, ctx, removeQuestResources: () => shared.modes?.removeDungeonQuestResources?.() }; _ohDungeons.set(ctx, d); }
    return d;
  };
  const ohLayingOutOf = (loc) => {
    if (!loc) return null;
    let d = _ohDungeons.get(loc);
    if (!d) {
      d = { location: () => ({ regionIndex: loc.regionIndex ?? -1, locationIndex: loc.locationIndex ?? -1 }), summaryName: () => loc.name, summaryId: () => loc.mapTableData?.mapId };
      _ohDungeons.set(loc, d);
    }
    return d;
  };

  const OH_CONTACT_SKIN = 0.08;
  function ohFrame(dt) {
    const gdt = shared.gamePaused() ? 0 : dt * worldTimeScale();
    shared.oceanHoles.processOneTerrain();
    for (const p of built.values()) { const h = p._ohPit?.handle; if (h?.miasma) h.miasma.step(gdt); }
    if (!shared.walkMode || !shared.playerSpawned) return;
    const e = built.get(`${shared.state.current.x},${shared.state.current.y}`);
    const at = e ? shared.oceanHoles.entranceOf(e) : null;
    if (!at) return;
    const r = CAPSULE_RADIUS + OH_CONTACT_SKIN, [cx, cy, cz] = at.position;
    const hx = at.size[0] / 2, hz = at.size[2] / 2, hy = at.size[1] / 2;
    const dx = Math.max(0, Math.abs(shared.player.pos[0] - cx) - hx), dz = Math.max(0, Math.abs(shared.player.pos[2] - cz) - hz);
    const touching = dx * dx + dz * dz <= r * r && shared.player.pos[1] <= cy + hy + OH_CONTACT_SKIN && shared.player.pos[1] + shared.player.height >= cy - hy - OH_CONTACT_SKIN;
    if (touching) shared.oceanHoles.characterCollided(e, { inside: false, swimming: !!shared.player.isPlayerSwimming });
  }
  const _ohDiscs = [];
  function drawOceanHolesOpaque(visible) {
    const f = shared._dwFrame;
    if (!f) return;
    _ohDiscs.length = 0;
    for (const p of visible) {
      const pit = p._ohPit;
      if (!pit) continue;
      const t = shared.state.pixelTranslation(p.px, p.py, _ohOrigin);
      _ohDiscs.push({ centre: [t[0] + pit.marker.localX, t[1] + pit.black.y, t[2] + pit.marker.localZ], radius: pit.black.radius, color: FLOOR_INNER_COLOR, origin: [...t] });
      _ohDiscs.push({ centre: [t[0] + pit.marker.localX, t[1] + pit.underside.y, t[2] + pit.marker.localZ], radius: pit.underside.radius, color: SURFACE_INNER_COLOR, origin: [...t] });
    }
    if (_ohDiscs.length) ohRender.drawDiscs(_ohDiscs, dwColumnFrame(f));
  }
  const _ohParts = [];
  function drawOceanHolesTransparent() {
    const f = shared._dwFrame;
    if (!f) return;
    _ohDiscs.length = 0;
    _ohParts.length = 0;
    for (const p of built.values()) {
      const pit = p._ohPit;
      if (!p._visible || !pit) continue;
      const t = shared.state.pixelTranslation(p.px, p.py, _ohOrigin);
      _ohDiscs.push({ centre: [t[0] + pit.marker.localX, t[1] + pit.core.y, t[2] + pit.marker.localZ], radius: pit.core.radius, color: SURFACE_INNER_COLOR, origin: [...t] });
      const m = pit.handle?.miasma;
      if (!m) continue;
      const mx = t[0] + pit.marker.localX, my = t[1] + pit.miasma.y, mz = t[2] + pit.marker.localZ;
      for (const q of m.particles) _ohParts.push({ centre: [mx + q.p[0], my + q.p[1], mz + q.p[2]], size: m.sizeOf(q), rot: q.rot });
    }
    if (_ohDiscs.length) ohRender.drawDiscs(_ohDiscs, dwColumnFrame(f));
    if (_ohParts.length) ohRender.drawMiasma(_ohParts);
    renderer.markForeignPass();
  }

  // Online, the lowest id near other players spawns the deep; losing that drops pending spawns.
  let _deepStanding = true;
  const _standsTheDeep = () => {
    const now = standsTheDeep(shared.online?.id ?? null, shared.player.feetAt(), shared.peersNear(), _deepStanding);
    if (_deepStanding && !now) dwEnemies?.dropPending?.();
    _deepStanding = now;
    return now;
  };

  const _dwFishT = [0, 0, 0];
  const dwPlayerObjectPosition = () => (shared.walkMode ? [shared.player.pos[0], shared.player.pos[1] + (shared.player.height ?? CAPSULE_HEIGHT) / 2, shared.player.pos[2]] : shared.cam.pos);
  function dwFishFrame(dt) {
    const gdt = shared.gamePaused() ? 0 : dt * worldTimeScale();
    shared._dwFishTime += gdt;
    shared._dwFishFrameCount++;
    const look = lookSettings((k) => modSetting(DEEP_WATERS_VENDOR, k));
    const vision = underwaterVisionDistance(look.fogDistance);
    const seaY = deepWaters.oceanLocalY + shared.state.pixelTranslation(shared.state.current.x, shared.state.current.y, _dwFishT)[1];
    return {
      time: shared._dwFishTime, dt: gdt, frame: shared._dwFishFrameCount, roll: Math.random,
      playerPos: dwPlayerObjectPosition(),
      column: (x, z) => shared.dwPlayer?.rawColumnAt(x, z) ?? null,
      renderedSeafloorY: (col, x, z) => dwRenderedSeafloorY(col, x, z),
      visibleDistance: shared.cam.pos[1] < seaY - 0.05 ? vision * 1.1 : topSurfaceOpaqueFadeEnd(vision),
      raycast: (o, d, reach) => dwFishRay(o, d, reach),
    };
  }
  function dwFishRay(o, d, reach) {
    let best = null;
    const h = collider.raycastHit(o, d, reach);
    if (Number.isFinite(h.dist)) best = { dist: h.dist, normal: h.normal };
    const steps = Math.max(2, Math.ceil(reach / 0.05));
    for (let i = 1; i <= steps; i++) {
      const t = (reach * i) / steps;
      if (best && t >= best.dist) break;
      const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
      const g = heightAt(x, z);
      if (Number.isFinite(g) && y < g) { best = { dist: t, normal: collider.groundNormal(x, z) }; break; }
    }
    if (shared.walkMode) {
      const c = rayUprightCapsule(o, d, reach, shared.player.pos, CAPSULE_RADIUS, shared.player.height ?? CAPSULE_HEIGHT);
      if (c && (!best || c.dist < best.dist)) best = c;
    }
    for (const pool of [shared.exteriorFoes.foes, shared.cityGuards.guards]) {
      for (const f of pool) {
        const feet = f.dead ? null : f.ai?.feet;
        if (!feet || Math.abs(feet[0] - o[0]) > reach + 4 || Math.abs(feet[2] - o[2]) > reach + 4) continue;
        const c = rayUprightCapsule(o, d, reach, feet, BODY_CAPSULE_RADIUS, f.ai.height ?? CAPSULE_HEIGHT);
        if (c && (!best || c.dist < best.dist)) best = c;
      }
    }
    return best ? { normal: best.normal } : null;
  }
  const DW_LOOT_OWNER = 'deepWaters';
  const _dwLootT = [0, 0, 0];
  // A recenter or a door moves the player without velocity, so the track restarts there.
  const _dwLootVel = { last: null, v: [0, 0, 0] };
  const _dwEyeOffset = [0, 0, 0];
  // The spawn pump runs before the frame's matrices, so this view is built here.
  function dwSpawnView() {
    const y = shared.cam.yaw, p = shared.cam.pitch;
    const forward = [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
    const eye = [shared.cam.pos[0] + _dwEyeOffset[0], shared.cam.pos[1] + _dwEyeOffset[1], shared.cam.pos[2] + _dwEyeOffset[2]];
    const V = lookAt(eye, [eye[0] + forward[0], eye[1] + forward[1], eye[2] + forward[2]], UP_Y);
    const worldAspect = largeHudWorldAspect(canvas.clientWidth, canvas.clientHeight);
    const P = mirrorProjectionX(perspective(fieldOfView() + shared.climbFeel.fovRad(), worldAspect, 0.2, 6000));
    const viewport = (q) => {
      const ex = V[0] * q[0] + V[4] * q[1] + V[8] * q[2] + V[12], ey = V[1] * q[0] + V[5] * q[1] + V[9] * q[2] + V[13];
      const ez = V[2] * q[0] + V[6] * q[1] + V[10] * q[2] + V[14], ew = V[3] * q[0] + V[7] * q[1] + V[11] * q[2] + V[15];
      const cx = P[0] * ex + P[4] * ey + P[8] * ez + P[12] * ew, cy = P[1] * ex + P[5] * ey + P[9] * ez + P[13] * ew;
      const cw = P[3] * ex + P[7] * ey + P[11] * ez + P[15] * ew;
      const w = Math.abs(cw) > 1e-9 ? cw : 1e-9;
      return [(cx / w + 1) / 2, (cy / w + 1) / 2, -ez];
    };
    const vision = underwaterVisionDistance(lookSettings((k) => modSetting(DEEP_WATERS_VENDOR, k)).fogDistance);
    return { forward, viewport, revealDistance: spawnRevealDistance(vision, _dwLootVel.v) };
  }
  function dwLootTrackVelocity(dt) {
    const now = dwPlayerObjectPosition();
    if (_dwLootVel.last && dt > 0) for (let i = 0; i < 3; i++) _dwLootVel.v[i] = (now[i] - _dwLootVel.last[i]) / dt;
    _dwLootVel.last = [now[0], now[1], now[2]];
  }
  const dwLootLetGoVelocity = () => { _dwLootVel.last = null; };
  function dwLootItem(kind) {
    const level = Math.max(1, playerEntity.level | 0), gender = playerEntity.gender ?? 'male', roll = Math.random;
    const item = kind === 'religious' ? createRandomReligiousItem(roll) : kind === 'potion' ? createRandomPotion(roll)
      : kind === 'jewellery' ? createRandomJewellery(roll) : kind === 'gem' ? createRandomGem(roll)
        : kind === 'clothing' ? createRandomClothing(gender, roll) : kind === 'weapon' ? createRandomWeapon(level, roll) : createRandomArmor(level, roll);
    return item ? mintCondition(setItemFields(item)) : null;
  }
  function dwSpawnLootContainer({ pos, record, entry }) {
    const pile = shared.droppedLoot.seedPile([], pos, { archive: TREASURE_PILE_ARCHIVE, record }, null, `${entry.px},${entry.py}`, { unsaved: true, drawn: false, owner: DW_LOOT_OWNER });
    dwLootPictureWarm(record);
    return {
      destroyed: () => !!pile.dead,
      position: () => pile.pos,
      destroy: () => shared.droppedLoot.removePile(pile),
      add: (item) => addItem(pile.items, item),
    };
  }
  function dwLootPictureWarm(record) {
    dwDecor.textures.warm({ positions: [{ archive: TREASURE_PILE_ARCHIVE, record }], warm: 0 });
  }

  function dwSpawnRubble(entry, placements) {
    const kept = dwDecor.filter(entry, placements);
    if (!kept.length) return null;
    const r = { entry, positions: kept, centroid: centroidLocal(kept), h: null, warm: 0, gone: false };
    let list = _dwRubble.get(entry);
    if (!list) { list = []; _dwRubble.set(entry, list); }
    list.push(r);
    dwStandRubble(r);
    return {
      count: kept.length,
      anchor: {
        destroyed: () => r.gone,
        position: () => { const t = shared.state.pixelTranslation(entry.px, entry.py, _dwLootT); return [t[0] + r.centroid[0], t[1] + r.centroid[1], t[2] + r.centroid[2]]; },
        destroy: () => dwFreeRubble(r),
      },
    };
  }
  function dwStandRubble(r) {
    if (r.gone || r.h || dwDecor.textures.warm(r)) return;
    r.h = dwDecor.stand(r.entry, r.positions);
  }

  const _dwGuards = new Map();
  function dwStandGuard(req) {
    const h = dwStandFoe(req);
    if (h && req.entry) {
      const k = `${req.entry.px},${req.entry.py}`;
      const list = (_dwGuards.get(k) ?? []).filter((g) => !g.destroyed());
      list.push(h);
      _dwGuards.set(k, list);
    }
    return h;
  }
  const dwLootColumns = { column: (x, z) => shared.dwPlayer?.rawColumnAt(x, z) ?? null, renderedSeafloorY: (col, x, z) => dwRenderedSeafloorY(col, x, z), roll: Math.random };
  const dwLoot = deepWaters ? createUnderwaterLoot({
    settings: deepWatersLootSettings,
    canRunHeavy: () => canRunHeavyRuntimeWork(performance.now() / 1000, dwPlaying()),
    exteriorWaterContext: () => dwPlaying() && !shared._dwFishInside,
    playerPosition: () => (dwPlaying() ? dwPlayerObjectPosition() : null),
    column: (x, z) => shared.dwPlayer?.rawColumnAt(x, z) ?? null,
    hasNearbyColumn: (x, z, near, far, n, depth) => !!shared.dwPlayer?.hasNearbyColumn(x, z, near, far, n, depth),
    inOrAboveDeepWater: (depth) => !!shared.dwPlayer?.inOrAboveDeepWater(dwPlayerObjectPosition(), shared.cam.pos[1], depth),
    view: () => dwSpawnView(),
    playerForward: () => [Math.sin(shared.cam.yaw), 0, Math.cos(shared.cam.yaw)],
    vision: () => underwaterVisionDistance(lookSettings((k) => modSetting(DEEP_WATERS_VENDOR, k)).fogDistance),
    pixelOrigin: (e) => shared.state.pixelTranslation(e.px, e.py, [0, 0, 0]),
    spawnContainer: (o) => dwSpawnLootContainer(o),
    spawnRubble: (e, placements) => dwSpawnRubble(e, placements),
    spawnGuards: (centre) => trySpawnTreasureGuards({
      f: dwLootColumns, centre, settings: deepWatersEnemySettings(), canRunHeavy: canRunHeavyRuntimeWork(performance.now() / 1000, dwPlaying()),
      playerPos: dwPlaying() ? dwPlayerObjectPosition() : null, vision: underwaterVisionDistance(lookSettings((k) => modSetting(DEEP_WATERS_VENDOR, k)).fogDistance),
      view: dwSpawnView(), spawnGuard: (req) => dwStandGuard(req),
    }),
    makeItem: (kind) => dwLootItem(kind),
  }) : null;
  if (dwLoot) {
    onTransientReset(() => { dwLoot.reset(); dwLootLetGoVelocity(); });
    for (const rec of RUBBLE_RECORDS) dwDecor.textures.warm({ positions: [rec], warm: 0 });
  }
  function pumpDeepWatersLoot(f, dt) {
    dwLootTrackVelocity(dt);
    for (const list of _dwRubble.values()) for (const r of list) if (!r.h) dwStandRubble(r);
    dwLoot.pump(f);
  }
  function dwRenderedSeafloorY(col, x, z) {
    const e = col?.entry;
    if (!e) return col?.seafloorY ?? 0;
    const t = shared.state.pixelTranslation(e.px, e.py, _dwFishT);
    const y = deepWaters.renderedFloorLocalY(e, x - t[0], z - t[2]);
    return y == null ? col.seafloorY : t[1] + y;
  }

  function hostBed(grid, bed) { return bed ? { sheet: grid.positions, normals: grid.normals, depths: bed.depths, sheetDepths: bed.sheetDepths, halo: bed.halo ?? null } : null; }

  function dwClipLast(a, b) { return (a._dwBytes ? 1 : 0) - (b._dwBytes ? 1 : 0); }
  let _dwLookGen = -1, _dwLook = null;

  const _dwT = [0, 0, 0];
  function dwFrameLook(minute) {
    const g = modSettingsGeneration();
    if (g !== _dwLookGen) { _dwLookGen = g; _dwLook = lookSettings((k) => modSetting(DEEP_WATERS_VENDOR, k)); shared._dwUnderFogLatch = null; }
    const daylight = daylightFactor({ night: isNight(minute), daylightScale: daylightScale(minute), weatherScale: shared.wxNow.sun });
    if (!shared._dwUnderFogLatch || shared._dwSurfaceBuilt) { shared._dwUnderFogLatch = underwaterFogColor(daylight); shared._dwSurfaceBuilt = false; }
    const seaY = deepWaters.oceanLocalY + shared.state.pixelTranslation(shared.state.current.x, shared.state.current.y, _dwT)[1];
    const camY = shared.cam.pos[1];
    const underwater = !!shared._dwFogP?.under;
    const col = shared.walkMode && shared.dwPlayer ? shared.dwPlayer.rawColumnAt(shared.player.pos[0], shared.player.pos[2]) : null;
    const look = surfaceLook(_dwLook, { daylight, columnDepth: col ? col.depth : null, undersideFogColor: shared._dwUnderFogLatch });
    if (underwater) look.horizonColor = horizonAmbientColor(_dwLook, { daylight, cameraY: camY, oceanY: shared._dwFogP.oceanY });
    return { s: _dwLook, daylight, seaY, camY, underwater, look };
  }

  const _underLook = { keep: [0, 0, 0], body: [0, 0, 0], sunW: [0, 0, 0], shaft: [0, 0, 0] };
  function beginDeepWatersFrame(minute) {
    const f = shared._dwFrame = dwFrameLook(minute);
    if (f.underwater) renderer.setWaterFog(distanceFogUniforms(f.s, { daylight: f.daylight, cameraY: f.camY, oceanY: shared._dwFogP.oceanY, murk: UNDERWATER_MURK }, shared._dwFogU));
    const cf = dwColumnFrame(f);
    _dwColumnNow = cf.columnOn && cf.surfaceTexture ? { seaY: cf.seaY, topColor: cf.topColor, topVision: cf.topVision, surfaceScroll: cf.surfaceScroll, surfaceTexture: cf.surfaceTexture, origin: shared.state.pixelTranslation(shared.state.current.x, shared.state.current.y, _dwColumnOrigin) } : null;
    renderer.setWaterColumn(_dwColumnNow);
  }
  let _dwColumnNow = null;
  const _dwColumnOrigin = [0, 0, 0];
  function dwFlagColumnFlats(list) {
    const c = _dwColumnNow;
    for (const b of list) {
      let on = false;
      if (c && shared.dwPlayer && b._quads === 1) {
        const o = b.origin, x = b.bounds[0] + (o ? o[0] : 0), y = b.bounds[1] + (o ? o[1] : 0), z = b.bounds[2] + (o ? o[2] : 0);
        on = y < c.seaY && !!shared.dwPlayer.rawColumnAt(x, z);
      }
      b.dwColumn = on;
    }
  }
  const _dwFloorList = [];
  function drawDeepWatersFloors(visible) {
    const f = shared._dwFrame;
    if (!f) return;
    _dwFloorList.length = 0;
    const boost = seafloorAmbientBoost(f.daylight);
    for (const p of visible) {
      const h = p.deepWaters?.gpu;
      if (!h?.floor) continue;
      h.material.ambientBoost = boost;
      _dwFloorList.push({ h, model: p._pixelMatrix, origin: shared.state.pixelTranslation(p.px, p.py, h.origin ??= [0, 0, 0]), material: h.material });
    }
    if (!_dwFloorList.length) return;
    dwRender.drawFloors(_dwFloorList, dwColumnFrame(f));
  }
  function dwColumnFrame(f) {
    return {
      sceneTint: sceneTint(f.s.darker, f.daylight, f.camY > f.seaY),
      columnOn: f.s.spawnSurfaces && !f.underwater && !waterOn,
      seaY: f.seaY + SURFACE_RENDER_Y_OFFSET,
      topColor: f.look.topColor, topVision: f.look.topVision,
      surfaceScroll: surfaceScrollAt(shared._dwNowMs / 1000),
      surfaceTexture: shared._dwSurfaceTex,
      seconds: shared._dwNowMs / 1000,
    };
  }
  const _dwDecorList = [];
  function drawDeepWatersDecorations(visible) {
    const f = shared._dwFrame;
    if (!f) return;
    _dwDecorList.length = 0;
    for (const p of visible) {
      const h = dwDecor.batchOf(p);
      if (h?.groups?.length) _dwDecorList.push({ h, model: p._pixelMatrix, origin: shared.state.pixelTranslation(p.px, p.py, h.origin ??= [0, 0, 0]) });
      for (const r of _dwRubble.get(p) ?? []) {
        if (r.h?.groups?.length) _dwDecorList.push({ h: r.h, model: p._pixelMatrix, origin: shared.state.pixelTranslation(p.px, p.py, r.h.origin ??= [0, 0, 0]) });
      }
    }
    if (!_dwDecorList.length) return;
    dwRender.drawDecorations(_dwDecorList, dwColumnFrame(f));
  }

  const _dwFishOrigin = [0, 0, 0];
  function dwLootTargets() {
    const piles = shared.droppedLoot.lootTargets();
    if (!dwFish?.count) return piles;
    const y = shared.cam.yaw, pch = shared.cam.pitch;
    const right = [Math.cos(y), 0, -Math.sin(y)];
    const back = [-Math.sin(y) * Math.cos(pch), -Math.sin(pch), -Math.cos(y) * Math.cos(pch)];
    const up = [back[1] * right[2] - back[2] * right[1], back[2] * right[0] - back[0] * right[2], back[0] * right[1] - back[1] * right[0]].map((c) => -c);
    return [...piles, ...dwFish.lootTargets(right, up, back)];
  }

  function dwFishLootHooks(o) {
    return dwFish.lootHooks(o, {
      containerImage: () => CONTAINER_IMAGES.Chest,
      iconImage: (sp) => {
        const a = fishIconArchive(sp.templateIndex);
        if (shared._dwFishIcons.has(a)) return shared._dwFishIcons.get(a);
        // UI art uploads top-down, while the texture door holds its rows bottom-up.
        const td = decodedTextureTopDown(a, 0);
        if (!td) { preloadTextureRecord(a, 0); return null; }
        const img = { tex: renderer.uploadTexture('img', `dwfish:${a}`, { width: td.width, height: td.height, colors: td.rgba }), w: td.width, h: td.height };
        shared._dwFishIcons.set(a, img);
        return img;
      },
    });
  }
  function drawDeepWatersFish() {
    const f = shared._dwFrame;
    if (!f) return;
    const groups = dwFish.drawGroups((s) => dwFishPictures.texture(s));
    if (!groups.length) return;
    const h = dwRender.streamDecorations(groups);
    dwRender.drawDecorations([{ h, model: shared._dwIdentity, origin: shared.state.pixelTranslation(shared.state.current.x, shared.state.current.y, _dwFishOrigin) }], dwColumnFrame(f));
  }
  function drawDeepWatersLoot() {
    const f = shared._dwFrame;
    if (!f) return;
    const groups = new Map();
    for (const pile of shared.droppedLoot.undrawnPiles()) {
      if (pile.owner !== DW_LOOT_OWNER) continue;
      const rec = { archive: pile.archive, record: pile.record };
      const kind = dwDecor.textures.kindOf(rec);
      const tex = dwDecor.textures.texture(rec, kind);
      const size = kind === 'archive' ? dwDecor.textures.scaledSize(rec) : dwDecor.textures.replacement(rec)?.size;
      if (!tex || !size) { dwLootPictureWarm(rec.record); continue; }
      const k = `${rec.archive}_${rec.record}:${kind}`;
      let g = groups.get(k);
      if (!g) { g = { texture: tex, fps: 0, born: 0, facing: 1, cutoff: DECORATION_CUTOFF, billboards: [] }; groups.set(k, g); }
      g.billboards.push({ centre: [pile.pos[0], pile.pos[1] + size.h / 2, pile.pos[2]], width: size.w, height: size.h, start: 0 });
    }
    if (!groups.size) return;
    const h = dwRender.streamDecorations([...groups.values()]);
    dwRender.drawDecorations([{ h, model: shared._dwIdentity, origin: shared.state.pixelTranslation(shared.state.current.x, shared.state.current.y, _dwFishOrigin) }], dwColumnFrame(f));
  }

  const _dwLocT = [0, 0, 0];
  function dwLocate(x, z) {
    const c = shared.state.compensation;
    const px = shared.state.mapOrigin.x + Math.floor((x - c[0]) / TERRAIN_SIZE);
    const py = shared.state.mapOrigin.y - Math.floor((z - c[2]) / TERRAIN_SIZE);
    const p = built.get(`${px},${py}`);
    if (!p) return null;
    const t = shared.state.pixelTranslation(p.px, p.py, _dwLocT);
    const lx = x - t[0], lz = z - t[2];
    if (lx < 0 || lz < 0 || lx >= TERRAIN_SIZE || lz >= TERRAIN_SIZE) return null;
    return { entry: p, lx, lz, baseY: t[1] };
  }
  let _dwSettingsGen = -1, _dwSettings = null;
  const dwSettings = () => {
    const g = modSettingsGeneration();
    if (g !== _dwSettingsGen) {
      _dwSettingsGen = g;
      const get = (k) => modSetting(DEEP_WATERS_VENDOR, k);
      _dwSettings = { ...lookSettings(get), swimSpeedMultiplier: Number(get('General.SwimSpeedMultiplier')), enableSwimStroke: get('General.EnableSwimStroke') === true, argonianInfiniteBreath: get('General.ArgonianInfiniteBreath') === true };
    }
    return _dwSettings;
  };

  const _overDeepWater = (x, z) => { const c = shared.dwPlayer?.rawColumnAt?.(x, z); return !!c && c.depth >= 0.25; };
  const _inRock = (x, y, z) => !!collider?.insideSolid?.([x, y + 0.5, z]);
  const _deepSuppressesSpawns = () => !!shared.dwPlayer?.inOrAboveDeepWater(shared.walkMode && shared.playerSpawned ? shared.player.pos : shared.cam.pos, shared.cam.pos[1], 0.25);

  const dwSwimmableSeafloorY = (x, z) => { const at = dwLocate(x, z); return at && deepWaters ? deepWaters.swimmableSeafloorY(at.entry, at.lx, at.lz, at.baseY) : null; };
  const dwVanillaGroundY = (x, z) => {
    const at = dwLocate(x, z);
    if (!at || !deepWaters?.tileOf(at.entry)?.hasDistanceField) return null;
    return surfaceHeightAt(at.entry.samples, at.lx, at.lz, at.entry._stride ?? 1) + at.baseY;
  };

  const _dwBreathState = { tally: 0 };
  const _dwSurfaceList = [];

  function seaGroundArchive() {
    const here = playerTravelPixel();
    let ga = here ? built.get(`${here.x},${here.y}`)?.groundArchive : null;
    if (ga == null) for (const p of built.values()) if (p.groundArchive != null) { ga = p.groundArchive; break; }
    return ga;
  }
  function drawDeepWatersSurfaces(nowMs, cells = null) {
    const f = shared._dwFrame;
    if (!f || !f.s.spawnSurfaces) return;
    _dwSurfaceList.length = 0;
    for (const p of cells ?? built.values()) {
      const h = p.deepWaters?.gpu;
      if ((cells || p._visible) && h?.surface) _dwSurfaceList.push({ h, model: p._pixelMatrix });
    }
    if (!_dwSurfaceList.length) return;
    if (waterOn && !f.underwater && shared._waterU) {
      renderer.drawSeaSurfaces(_dwSurfaceList, deepWaters.oceanLocalY + SURFACE_RENDER_Y_OFFSET, shared._waterU, f.look.topColor, snowCover.arrayOf(seaGroundArchive()));
      return;
    }
    dwRender.drawSurfaces(_dwSurfaceList, { ...f.look, underwater: f.underwater, liftY: deepWaters.oceanLocalY + SURFACE_RENDER_Y_OFFSET, surfaceScroll: surfaceScrollAt(nowMs / 1000), surfaceTexture: shared._dwSurfaceTex });
    renderer.markForeignPass();
  }
  return {
    _deepSuppressesSpawns, _dwBreathState, _dwEyeOffset, _dwGuards, _dwLootVel, _dwT, _inRock, _overDeepWater,
    _standsTheDeep, _underLook, beginDeepWatersFrame, drawDeepWatersDecorations, drawDeepWatersFish,
    drawDeepWatersFloors, drawDeepWatersLoot, drawDeepWatersSurfaces, drawOceanHolesOpaque, drawOceanHolesTransparent,
    dwClipLast, dwFishFrame, dwFishLootHooks, dwFlagColumnFlats, dwLocate, dwLoot, dwLootLetGoVelocity, dwLootTargets,
    dwPlayerObjectPosition, dwPlaying, dwSettings, dwSwimmableSeafloorY, dwVanillaGroundY, hostBed, ohDungeonOf,
    ohFrame, ohGpsWorld, ohLayingOutOf, pumpDeepWatersLoot, seaGroundArchive,
  };
}
