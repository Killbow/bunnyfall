// Recall, boarding, and teleports in the world: the recall anchor and the recall to it, boarding and leaving
// a ship, and the teleport prompt. It also holds the arrival landing, the restride spending, and the sea level.
import {
  addPermanentScene, createSceneCache, interiorSceneName, restoreCachedScene, worldSceneName,
} from './sceneCache.js';
import { applyClimateWeather } from '../weather/weatherSim.js';
import { ARENA_TEXT } from '../arena/arenaText.js';
import { BUILDING_KEY_0 } from '../talk/talkTopics.js';
import { CARAVAN_TEXT } from '../travel/caravanRoom.js';
import { ChoiceWindow } from '../ui/talkWindow.js';
import { crossingTarget } from '../systems/naval/etherCrossing.js';
import { getLocalizedLocationName } from '../ui/textManager.js';
import { gridBed } from './terrainGen.js';
import { hudFade } from '../ui/fadeLayer.js';
import { inEther } from './ethericSea.js';
import { loadingPlaceOf } from '../ui/loadingScreen.js';
import { madeRuleHere } from '../characters/madeLevel.js';
import { makeAnchor, teleportPlan, WORLD_CONTEXT } from '../travel/teleportAnchor.js';
import { mapPixelToWorldCoords, StreamingWorldState } from './streamingWorld.js';
import { playerEntity, surfacePlayer } from '../characters/playerEntity.js';
import { REPOSITION, shipMemory, shipRestorePos, shipTransition } from '../systems/naval/ship.js';
import { SCALED_OCEAN_ELEVATION, STREAMING_TERRAIN_SCALE } from './terrainSampler.js';
import { SD_NO_MARK } from './sdDungeon.js';
import { SHIP_COORDS, SHIP_INTERIOR_MAP_IDS } from '../trade/banking.js';

/** @param {any} shared */
export function createStreamWorld(shared) {
  const {
    _teleportToPixel, applyWeather, bedBytesOf, built, cacheExteriorScene, climateAt, deepWaters,
    enterLinkedBankCabin, fieldXZ, groundFrameHeight, landform, locationIndex, madeSay, maps, placeAtPixel,
    playerTravelPixel, restandHeight, restridePending, restrideTerrain, routByJump, scaleOf, shownWeather, state,
    strideFor, terrainGen, waterOn, weatherOverride, weatherStale, worldMoveBusy,
  } = shared;
  const RESTRIDE_PER_FRAME = 1;

  function spendRestrides() {
    if (!restridePending.size) return;
    if (terrainGen.threaded) {
      for (const p of restridePending.values()) promoteOffThread(p);
      restridePending.clear();
      return;
    }
    let budget = RESTRIDE_PER_FRAME;
    const want = [...restridePending.values()]
      .sort((a, b) => (Math.abs(a.px - state.current.x) + Math.abs(a.py - state.current.y))
        - (Math.abs(b.px - state.current.x) + Math.abs(b.py - state.current.y)));
    for (const p of want) {
      if (budget <= 0) break;
      restridePending.delete(`${p.px},${p.py}`);
      if (!built.has(`${p.px},${p.py}`)) continue;
      const s = strideFor(p.px, p.py);
      if (s === p._stride) continue;
      restrideTerrain(p, s);
      budget--;
    }
  }

  function promoteOffThread(p) {
    const key = `${p.px},${p.py}`;
    if (built.get(key) !== p) return;
    if (strideFor(p.px, p.py) === p._stride) return;
    const bedBytes = waterOn ? bedBytesOf(p) : null;
    terrainGen.grid({ px: p.px, py: p.py, stride: 1, samples: p.samples, landform, bed: bedBytes }).then((grid) => {
      if (built.get(key) !== p) return;
      if (strideFor(p.px, p.py) !== 1 || p._stride === 1) return;
      if (waterOn && bedBytesOf(p) !== bedBytes) grid = { ...grid, bed: gridBed(grid, bedBytesOf(p), 1, grid.bed?.halo ?? null) };
      restrideTerrain(p, 1, grid);
    }).catch((e) => console.error(`[terrain] promotion of ${key} failed:`, e));
  }

  const _tvSeaT = [0, 0, 0];
  const tvSeaY = () => (deepWaters?.oceanLocalY ?? SCALED_OCEAN_ELEVATION * STREAMING_TERRAIN_SCALE) + state.pixelTranslation(state.current.x, state.current.y, _tvSeaT)[1];

  const ARRIVAL_LIFT = 40;
  const ARRIVAL_REACH = 240;

  const OBSTRUCTED_ABOVE = 3;

  const _streamedLanding = (px, py) => {
    if (StreamingWorldState.streams(px, py)) return null;
    const home = inEther(px, py) ? crossingTarget('home', shared.captainLedger.crossedFrom()) : { px: Math.max(0, Math.min(999, Math.floor(px) || 0)), py: Math.max(0, Math.min(499, Math.floor(py) || 0)) };
    console.warn(`[world] pixel ${px},${py} does not stream in this game - landed at ${home.px},${home.py}`);
    shared._unstreamedLanding = inEther(px, py) ? 'ether' : 'edge';
    return home;
  };

  function positionPlayerAtLocationEntrance() {
    if (worldMoveBusy()) return;
    const px = playerTravelPixel();
    const dfLoc = locationIndex.get(`${px.x},${px.y}`);
    if (!dfLoc?.exterior?.exteriorData) return;
    // An arrest served indoors leaves the mode as 'interior', so exit to the exterior before the release teleport.
    shared.modes?.forceExitToExterior();
    _teleportToPixel(px.x, px.y, null, { reposition: REPOSITION.RandomStartMarker })
      .catch((e) => console.error('[court] reposition failed:', e));
  }

  const _sceneCache = () => (playerEntity.sceneCache ??= createSceneCache());

  function restoreExteriorScene(pixel) {
    const arrived = restoreCachedScene(_sceneCache(), worldSceneName(pixel.x, pixel.y));
    if (!arrived) return false;
    const was = scaleOf(arrived.terrainScale);
    const restand = (nx, nz, y) => { const [x, z] = state.localFromWorld(nx, nz); return restandHeight(y, x, z, was); };
    shared.droppedLoot.restoreWorld(arrived.lootContainers.map((c) => ({ ...c, y: restand(c.nativeX, c.nativeZ, c.y) })),
      (nx, nz) => state.localFromWorld(nx, nz), state.compensation[1]);
    shared.droppedTorches.restore(arrived.droppedTorches.map((t) => { const p = t.position; return { ...t, position: [p[0], restand(p[0], p[2], p[1]), p[2]] }; }), (p) => { const [lx, lz] = state.localFromWorld(p[0], p[2]); return [lx, p[1] + state.compensation[1], lz]; });
    return true;
  }
  const shipPermanentScenes = (s) => {
    addPermanentScene(_sceneCache(), worldSceneName(SHIP_COORDS[s].x, SHIP_COORDS[s].y));
    addPermanentScene(_sceneCache(), interiorSceneName(SHIP_INTERIOR_MAP_IDS[s], BUILDING_KEY_0));
  };
  function shipTransportMode() {
    if ((shared.modes?.mode ?? 'exterior') !== 'exterior') shared.modes?.forceExitToExterior();
    return boardOrDisembark();
  }

  async function boardOrDisembark() {
    if (worldMoveBusy()) return;
    if (await enterLinkedBankCabin()) return;
    const here = playerTravelPixel();
    const t = shipTransition(playerEntity, {
      boardShipPosition: playerEntity.boardShipPosition ?? null,
      mapPixel: here,
      position: shipMemory({ mapPixel: here, pos: [shared.player.pos[0], groundFrameHeight(shared.player.pos[1] - state.compensation[1], shared.player.pos[0], shared.player.pos[2]) + state.compensation[1], shared.player.pos[2]], yaw: shared.cam.yaw, terrainScale: STREAMING_TERRAIN_SCALE }, state.compensation[1]),
    });
    if (!t) return;
    // Boarding across the Veil is refused; leaving a ship returns to boardShipPosition, whichever side that is.
    if (!playerEntity.boardShipPosition && shared.veilRefused(t.go)) return;
    // A ship memory written raw, before the compensationFree flag, cannot be recovered and is grounded.
    const legacy = t.reposition === REPOSITION.None && !t.restore.compensationFree;
    const localPos = t.reposition === REPOSITION.None ? (shipRestorePos(t.restore, state.compensation[1]) ?? t.restore.pos) : null;
    // Cache the scene being left before the teleport, so loose piles wait for the return.
    hudFade.smashHUDToBlack();
    cacheExteriorScene(here);
    await _teleportToPixel(t.go.x, t.go.y, localPos, { reposition: t.reposition, grounded: legacy });
    if (localPos && !legacy && (scaleOf(t.restore?.terrainScale) !== STREAMING_TERRAIN_SCALE || landform)) {
      const c = state.compensation[1];
      const y = restandHeight(localPos[1] - c, localPos[0], localPos[2], scaleOf(t.restore.terrainScale)) + c;
      if (shared.walkMode) shared.player.spawn(localPos[0], y, localPos[2]);
      shared.cam.pos = [localPos[0], y + (shared.walkMode ? 0 : 40), localPos[2]];
    }
    restoreExteriorScene(t.go);
    if (t.restore) shared.cam.yaw = t.restore.yaw;
    playerEntity.boardShipPosition = t.boardShipPosition;
    shared.setTransportModeHere(t.mode);
    hudFade.fadeHUDFromBlack();
  }

  function setRecallAnchor(key = 'anchorPosition') {
    if (madeRuleHere('mark') === 'refused') { madeSay('mark'); return; }
    if (shared.modes?.dungeonLocation?.superTier) { shared.sdSay(SD_NO_MARK); return; }
    const inside = shared.modes?.anchorContext?.() ?? { worldContext: WORLD_CONTEXT.Exterior, local: null, buildingKey: 0, interior: null };
    const pf = shared.walkMode && shared.playerSpawned ? shared.player.pos : shared.cam.pos;
    // A dungeon frame is its own, so its world coordinates come from the streamer pixel.
    // Outside and inside a building the frame is the exterior one, so the feet position gives them.
    const inDungeon = inside.worldContext === WORLD_CONTEXT.Dungeon;
    const wc = inDungeon ? null : state.worldCoords(pf);
    const pixel = inDungeon ? { x: state.current.x, y: state.current.y } : playerTravelPixel();
    const corner = mapPixelToWorldCoords(pixel.x, pixel.y);
    playerEntity[key] = makeAnchor({
      worldContext: inside.worldContext,
      pixel,
      nativeX: wc ? wc.x : corner.x,
      nativeZ: wc ? wc.z : corner.z,
      // The height goes in compensation-free; anchorLanding re-adds the live compensation on the way out.
      y: inDungeon ? pf[1] - state.compensation[1] : groundFrameHeight(pf[1] - state.compensation[1], pf[0], pf[2]),
      terrainScale: STREAMING_TERRAIN_SCALE,
      local: inside.local,
      yaw: shared.cam.yaw, pitch: shared.cam.pitch,
      buildingKey: inside.buildingKey,
      interior: inside.interior, dungeon: inside.dungeon ?? null,
    });
    return true;
  }

  const anchorLanding = (a) => {
    if (a.insideDungeon && a.local) return [...a.local];
    const [lx, lz] = state.localFromWorld(a.nativeX, a.nativeZ);
    return [lx, restandHeight(a.y ?? 2, lx, lz, scaleOf(a.terrainScale)) + state.compensation[1], lz];
  };

  async function recallToAnchor(key = 'anchorPosition') {
    if (worldMoveBusy()) return;
    if (shared._recalling) return;
    if (shared.arenaBouts.holds()) { shared.townTalk.say(ARENA_TEXT.refuse.travel); return; }
    if (madeRuleHere('recall') === 'refused') { madeSay('recall'); return; }
    const anchor = playerEntity[key];
    const plan = teleportPlan(anchor, {
      ...(shared.modes?.insideContext?.() ?? { insideBuilding: false, insideDungeon: false, buildingKey: 0 }),
      pixel: playerTravelPixel(),
    });
    if (!plan) { shared.townTalk.say('You must set an anchor first.'); return; }
    if (plan.kind !== 'same-interior' && (shared.wildTeleportRefused(plan.anchor?.pixel ?? null) || shared.veilRefused(plan.anchor?.pixel ?? null))) return;
    const wildTrip = plan.kind === 'same-interior' ? { ok: true, fee: 0 } : shared.wildTravelGate(plan.anchor.pixel);
    if (!wildTrip.ok) return;
    shared.wildTravelPaid(wildTrip);
    shared._recalling = true;
    try {
      if (plan.kind === 'same-interior') {
        shared.modes?.setPlayerLocalPosition?.(anchorLanding(anchor));
        shared.cam.yaw = plan.yaw; shared.cam.pitch = plan.pitch;
        playerEntity.playerTeleportedIntoDungeon = plan.teleportedIntoDungeon;
        playerEntity[key] = null;
        surfacePlayer();
        return;
      }
      // Cache before departing: the streaming scene outside, the interior in a building, nothing in a dungeon.
      routByJump();
      if (plan.cacheScene === 'exterior') cacheExteriorScene(playerTravelPixel());
      if ((shared.modes?.mode ?? 'exterior') !== 'exterior') {
        shared.modes?.forceExitToExterior({ cacheScene: plan.cacheScene === 'building' });
      }
      const a = plan.anchor;
      shared._wodInside = plan.arrive === 'dungeon' || plan.arrive === 'building';
      await _teleportToPixel(a.pixel.x, a.pixel.y);
      // Landing arms in order: dungeon first, then a building with doors, then outside.
      let landed = false, outOfCaravan = null;
      if (plan.arrive === 'dungeon') {
        landed = !!(await shared.modes?.startInDungeon?.({ recorded: a.dungeon ?? {} }));
        if (landed) {
          shared.modes?.setPlayerLocalPosition(anchorLanding(a));
        } else {
          shared.townTalk.say('The way underground is closed. Repositioning player.');
        }
      } else if (plan.arrive === 'building') {
        landed = !!(await shared.modes?.restoreInterior?.(a.interior ? { ...a.interior, layout: a.layout } : a.interior, anchorLanding(a)));
        if (!landed && !(outOfCaravan = shared.caravanDoorLanding(a.interior))) shared.townTalk.say('Building has no exterior doors. Repositioning player.');
        else if (!landed) shared.townTalk.say(CARAVAN_TEXT.outside);
      }
      if (!landed) shared._wodInside = false;
      if (landed) {
        shared.cam.pos = shared.player.eyeAt();
      } else if (plan.arrive !== 'dungeon') {
        const [lx, ly, lz] = outOfCaravan?.position ?? anchorLanding(a);
        if (shared.walkMode) { shared.player.spawn(lx, ly, lz); shared.playerSpawned = true; }
        shared.cam.pos = [lx, ly + (shared.walkMode ? 0 : 40), lz];
      }
      // A dungeon anchor with no entrance keeps the pixel teleport landing; its stored height is in dungeon frame.
      shared.ohAbyss?.onRespawnerComplete();
      shared.cam.yaw = a.yaw ?? shared.cam.yaw; shared.cam.pitch = a.pitch ?? shared.cam.pitch;
      playerEntity.playerTeleportedIntoDungeon = plan.teleportedIntoDungeon;
      if (!landed) restoreExteriorScene(a.pixel);
      playerEntity[key] = null;
      surfacePlayer();
    } finally {
      shared._recalling = false;
    }
  }

  function teleportPrompt(action) {
    if (action === 'mark' || action === 'recall') {
      if (worldMoveBusy() || shared._recalling || shared.arenaBouts.holds()) { shared.townTalk.say('Travel is already in progress.'); return false; }
      if (action === 'recall') {
        if (!playerEntity.wayfarerAnchor) { shared.townTalk.say('Set a Wayfarer’s Anchor first.'); return false; }
        return recallToAnchor('wayfarerAnchor');
      }
      const marked = setRecallAnchor('wayfarerAnchor');
      if (marked) shared.townTalk.say('Wayfarer’s Anchor set.');
      return !!marked;
    }
    shared.townTalk.showOverlay(new ChoiceWindow({
      lines: ['Do you want to Teleport or Set an Anchor?'],
      options: [
        { code: 'KeyA', label: 'A: set anchor', action: () => setRecallAnchor() },
        { code: 'KeyT', label: 'T: teleport', action: () => { recallToAnchor(); } },
        { code: 'Escape', label: 'Esc: cancel', action: () => {} },
      ],
    }));
  }

  async function teleportTo(pick) {
    if (worldMoveBusy()) return;
    if (shared._teleporting) return;
    if (shared.wildTeleportRefused(pick.pixel) || shared.veilRefused(pick.pixel)) return;
    const wildTrip = shared.wildTravelGate(pick.pixel);
    if (!wildTrip.ok) return;
    shared.wildTravelPaid(wildTrip);
    shared._teleporting = true;
    try {
      shared.modes?.forceExitToExterior();
      // The guild teleport asks for RandomStartMarker; the Origin default lands inside a city's block grid.
      await _teleportToPixel(pick.pixel.x, pick.pixel.y, null,
        { reposition: REPOSITION.RandomStartMarker });
      if (!weatherOverride) {
        applyClimateWeather(maps.getClimateIndex(pick.pixel.x, pick.pixel.y), Math.floor(shared.playerTicker.classicMinutes), fieldXZ(), climateAt);
        if (weatherStale()) applyWeather(shownWeather());
      }
      surfacePlayer();
      hudFade.fadeHUDFromBlack();
      shared.townTalk.say(`You arrive at ${getLocalizedLocationName(pick.mapId, pick.name)}.`);
    } catch (e) {
      hudFade.clearFade();
      throw e;
    } finally {
      shared._teleporting = false;
    }
  }

  function placeHere() {
    const px = playerTravelPixel();
    return shared._questLoc()?.name || placeAtPixel(px.x, px.y);
  }

  const loadingPlaceNow = () => loadingPlaceOf({ dest: shared._loadingDest, moving: worldMoveBusy(), placeAt: placeAtPixel, here: placeHere });
  const loadingLineNow = () => (shared._loading ? 'Loading the saved game' : shared._traveling ? (shared._partyWaitLine || 'Travelling') : shared._recalling ? 'Recalling'
    : shared._respawning ? 'Returning' : shared._teleporting ? 'Teleporting' : shared.modes?.transitioning ? 'Entering' : 'Loading');
  return {
    ARRIVAL_LIFT, ARRIVAL_REACH, OBSTRUCTED_ABOVE, _sceneCache, _streamedLanding, anchorLanding, boardOrDisembark,
    loadingLineNow, loadingPlaceNow, placeHere, positionPlayerAtLocationEntrance, shipPermanentScenes,
    shipTransportMode, spendRestrides, teleportPrompt, teleportTo, tvSeaY,
  };
}
