// Recall, boarding, and teleports in the world: the recall anchor and the recall to it, boarding
// and leaving a ship and its scenes, and the teleport prompt. It also holds the arrival landing,
// the restride spending, the sea level the travel view reads, and the loading place's line.
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
  /** How many stride-1 grids the frame loop will build in one frame. One
   *  is 3.12 ms; two would be most of a 60 Hz budget on its own. */
  const RESTRIDE_PER_FRAME = 1;

  /** STREAM1: spend the queue, nearest pixel first - the near ring is
   *  what the player is walking into. A pixel whose class changed back
   *  while it waited is dropped without building anything. */
  function spendRestrides() {
    if (!restridePending.size) return;
    // PERF-EXT26 (2026-09-25, the players: "fps issues in the exterior but
    // fine in the interior", "me too my friend.. don't know why. I got a
    // RX6600"): WITH THE TERRAIN WORKER UP, EVERY PROMOTION GOES TO IT AT
    // ONCE. A crossing promotes five pixels, and this queue paid them one a
    // frame here - ~1.8 ms of grid a frame for five frames, for every
    // enhanced-skin player. The worker already runs this very grid for
    // every build (terrainGen.js restrideGrid), so it answers the same
    // bytes; the surface swaps when the reply lands. Without a worker (none
    // in the host, `?terrainthread=off`, one that died) the queue below is
    // what it always was.
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
      if (!built.has(`${p.px},${p.py}`)) continue;        // evicted while it waited
      const s = strideFor(p.px, p.py);
      if (s === p._stride) continue;                       // walked back out of the near ring
      restrideTerrain(p, s);
      budget--;
    }
  }

  /** PERF-EXT26: a promotion's grid, built on the terrain worker. The
   *  reply swaps the surface only if the pixel it was asked for still
   *  stands and still wants stride 1 - an eviction, a rebuild or a walk
   *  back out while it was away drops it, and a pixel already promoted
   *  keeps what it has. Nothing is made for a dropped reply, so nothing
   *  is left to free. */
  function promoteOffThread(p) {
    const key = `${p.px},${p.py}`;
    if (built.get(key) !== p) return;                  // evicted while it waited
    if (strideFor(p.px, p.py) === p._stride) return;   // walked back out of the near ring
    const bedBytes = waterOn ? bedBytesOf(p) : null;   // AUDIT WATER-NEXT P1: the bed carved on the worker with the grid
    terrainGen.grid({ px: p.px, py: p.py, stride: 1, samples: p.samples, landform, bed: bedBytes }).then((grid) => {   // LANDFORM1-3: the ghost rows the build took
      if (built.get(key) !== p) return;                              // evicted, or rebuilt, while the worker built it
      if (strideFor(p.px, p.py) !== 1 || p._stride === 1) return;   // walked back out, or promoted meanwhile
      if (waterOn && bedBytesOf(p) !== bedBytes) grid = { ...grid, bed: gridBed(grid, bedBytesOf(p), 1, grid.bed?.halo ?? null) };   // the cap's TileMap moved meanwhile: carved by the one that stands
      restrideTerrain(p, 1, grid);
    }).catch((e) => console.error(`[terrain] promotion of ${key} failed:`, e));
  }

  const _tvSeaT = [0, 0, 0];
  /** The sea's surface in the scene (y) - Deep Waters' own, or the ground's clamp at OceanElevation; one for every pixel.
   *  FIELD BUGS 2026-10-08 (UNSTUCK-OUT's audit): declared here, beside `state`, not with the travel view far below - a
   *  fast-travel landing held in a rock asks it (its open ground is above the sea), and the boot's own load lands before
   *  that line ran: a const read in its dead zone threw. */
  const tvSeaY = () => (deepWaters?.oceanLocalY ?? SCALED_OCEAN_ELEVATION * STREAMING_TERRAIN_SCALE) + state.pixelTranslation(state.current.x, state.current.y, _tvSeaT)[1];

  // TL1: how far an ARRIVAL looks for its floor - up and down - against
  // the ten units an ordinary door step uses. A location's flat and the
  // terrain ten units past its edge can differ by far more on a steep site.
  const ARRIVAL_LIFT = 40;
  const ARRIVAL_REACH = 240;

  // TL2: a floor this far ABOVE the location's flat is a roof, not the
  // ground - a step or a doorsill is under a unit; a house is many.
  const OBSTRUCTED_ABOVE = 3;

  /** AUDIT CAPTAIN'S SEA G2/P7: A PIXEL THE WORLD DOES NOT STREAM - a save made past the Veil loaded under the sea's kill
   *  door, a continent's loaded with its land off - lands where the world stands: past the Veil at the way home (the last
   *  crossing out's waters, else the open Abecean), else the Bay's own nearest pixel; said once it stands
   *  (`_unstreamedLanding`). Its load list held no pixel, and the build threw on it (the start menu's Load: "boot
   *  failed"). The pixel to land at instead, or null where `px`,`py` streams. */
  const _streamedLanding = (px, py) => {
    if (StreamingWorldState.streams(px, py)) return null;
    const home = inEther(px, py) ? crossingTarget('home', shared.captainLedger.crossedFrom()) : { px: Math.max(0, Math.min(999, Math.floor(px) || 0)), py: Math.max(0, Math.min(499, Math.floor(py) || 0)) };
    console.warn(`[world] pixel ${px},${py} does not stream in this game - landed at ${home.px},${home.py}`);
    shared._unstreamedLanding = inEther(px, py) ? 'ether' : 'edge';
    return home;
  };

  /**
   * DaggerfallCourtWindow.PositionPlayerAtLocationEntrance (:452-463) -
   * where the court puts you down.
   *
   *     DFPosition mapPixel = PlayerGPS.CurrentMapPixel;
   *     if (ContentReader.HasLocation(mapPixel.X, mapPixel.Y, out _))
   *         StreamingWorld.TeleportToCoordinates(x, y, RandomStartMarker);
   *
   * Three things are load-bearing and all three were missing. The
   * HasLocation guard: arrested in the wilderness (a guard chased you
   * out of the rect), the release moves you nowhere at all rather than
   * dumping you at a terrain origin. The TELEPORT, to the SAME pixel:
   * DFU re-initialises the world around you, which is this host's
   * _teleportToPixel - the guards, the missiles and the loose foes go
   * with it. And RandomStartMarker, which is StreamingWorld's
   * PositionPlayerToLocation (world/locationEntrance.js): a random side
   * of the town's rectangle, facing in, snapped to the nearest start
   * marker for a city.
   *
   * The markers are the location's own archive-199 record-10 editor
   * flats - the same flats buildPixel already collects for the exterior
   * NPCs - read in the LOCATION frame and handed the law with the
   * location origin, so the arithmetic below is entirely DFU's.
   */
  function positionPlayerAtLocationEntrance() {
    if (worldMoveBusy()) return;   // AUDIT 68 S22: a load in flight moves the prisoner itself
    const px = playerTravelPixel();
    const dfLoc = locationIndex.get(`${px.x},${px.y}`);
    if (!dfLoc?.exterior?.exteriorData) return;   // HasLocation false - DFU teleports nowhere
    // JAIL1 (2026-09-15, a player through Mac: "twice once I served my
    // sentence the game loaded me outside of a room and falling into the
    // void!"). YOU CAN BE ARRESTED INDOORS, and this is where that ended.
    //
    // The indoor watch does not carry its own court flow: it asks the
    // WORLD host for one through the `onGuardHit` seam, on purpose
    // (worldModes.js, onPlayerHurt - "the arrest interception is the
    // WORLD host's ... rather than growing a second copy"). So the whole
    // sentence can be served with `modes.mode` still 'interior' - which
    // is exactly what happens when the crime was stealing, because
    // stealing is something you do inside a shop.
    //
    // The release then teleported to the town's start marker with the
    // INTERIOR still standing: the player landed at the exterior's
    // coordinates inside a building's scene, outside its geometry, and
    // fell. Every other `_teleportToPixel` caller that can be reached
    // from indoors leaves first - teleportTo says so in as many words
    // ("you cannot teleport out of a building", G5's own note on
    // TransitionExterior) - and this one alone did not.
    //
    // It is not a departure to add it: DFU cannot be inside here at all.
    // PlayerEnterExit re-parents the player on the transition its own
    // teleport raises, so the C# has no separate line to port; the port's
    // mode machine is a seam DFU does not have, and a seam has to be
    // told. `forceExitToExterior` no-ops when already outside (its own
    // `wasInside` guard), so the wilderness and open-street arrests are
    // untouched.
    shared.modes?.forceExitToExterior();
    _teleportToPixel(px.x, px.y, null, { reposition: REPOSITION.RandomStartMarker })
      .catch((e) => console.error('[court] reposition failed:', e));
  }

  /** A10 - THE EXTERIOR SCENE, cached and restored by name.
   *
   *  SaveLoadManager.CacheScene(StreamingWorld.SceneName) and its
   *  partner RestoreCachedScene: the pair the ship arm wraps its
   *  teleport in (TransportManager.cs:382-398) and the pair the
   *  Teleport effect takes on the outside arms of its own
   *  cross-context flow (Teleport.cs:147, :250). One definition, so
   *  the two callers cannot key the same scene two different ways.
   *
   *  The port's exterior scene state is the loose piles, carried as
   *  DFU carries them - LootContainerData_v1 entries stamped
   *  LootContainerTypes.DroppedLoot (:558-566) - in NATIVE
   *  coordinates, because a pile that came back in local ones would
   *  land wherever the floating origin happened to be. Without the
   *  pair, _teleportToPixel's teardown takes every pile with the
   *  pixel and only a save could bring one back. */
  const _sceneCache = () => (playerEntity.sceneCache ??= createSceneCache());

  /** A scene never cached answers null and the arrival stands as the
   *  streamer built it - which is every first visit. */
  function restoreExteriorScene(pixel) {
    const arrived = restoreCachedScene(_sceneCache(), worldSceneName(pixel.x, pixel.y));
    if (!arrived) return false;
    // TERRAIN-SCALE1: an entry a save carried from before the stamp stood on the prefab's 1.5 - stood again on today's
    // ground, which the arrival has just built
    const was = scaleOf(arrived.terrainScale);
    const restand = (nx, nz, y) => { const [x, z] = state.localFromWorld(nx, nz); return restandHeight(y, x, z, was); };   // LANDFORM1: the row's lift put back on
    shared.droppedLoot.restoreWorld(arrived.lootContainers.map((c) => ({ ...c, y: restand(c.nativeX, c.nativeZ, c.y) })),
      (nx, nz) => state.localFromWorld(nx, nz), state.compensation[1]);
    shared.droppedTorches.restore(arrived.droppedTorches.map((t) => { const p = t.position; return { ...t, position: [p[0], restand(p[0], p[2], p[1]), p[2]] }; }), (p) => { const [lx, lz] = state.localFromWorld(p[0], p[2]); return [lx, p[1] + state.compensation[1], lz]; });   // HT1
    // AUDIT SURV B: no camps here - the pool never lost them (the sweep spares a placed camp), and a cache entry
    // written before a tent was packed would have stood it again
    return true;
  }
  /** TR4: TransportManager's ship arm (:360-402). The decision is
   *  systems/ship.js; this is the host half - the teleport, the
   *  remembered position, and the fade DFU smashes to black. */
  /** AssignShipToPlayer's two permanent scenes (DaggerfallBankManager.cs:494-495) - the deck's and the hold's. */
  const shipPermanentScenes = (s) => {   // CSA-G: through the lazy cache - a fresh character has none until its first scene (Come Sail Away's helm borrows a ship on the street, the probe's first crewed boat threw here)
    addPermanentScene(_sceneCache(), worldSceneName(SHIP_COORDS[s].x, SHIP_COORDS[s].y));
    addPermanentScene(_sceneCache(), interiorSceneName(SHIP_INTERIOR_MAP_IDS[s], BUILDING_KEY_0));
  };
  /** WA1: `TransportManager.TransportMode = Ship` from CODE - Warm Ashes' ambush boards you, its "Leave Ship" puts you
   *  ashore. The picker's Ship row is outdoors-only, so this door was only ever knocked on from the street; a quest
   *  action can run below decks. DFU's UpdateMode would teleport the streaming world out from under a player still
   *  inside - the port leaves the building first, as every teleport here does (forceExitToExterior), then sails. */
  function shipTransportMode() {
    if ((shared.modes?.mode ?? 'exterior') !== 'exterior') shared.modes?.forceExitToExterior();
    return boardOrDisembark();
  }

  async function boardOrDisembark() {
    if (worldMoveBusy()) return;   // AUDIT 68 S22
    if (await enterLinkedBankCabin()) return;
    const here = playerTravelPixel();
    const t = shipTransition(playerEntity, {
      boardShipPosition: playerEntity.boardShipPosition ?? null,
      mapPixel: here,
      position: shipMemory({ mapPixel: here, pos: [shared.player.pos[0], groundFrameHeight(shared.player.pos[1] - state.compensation[1], shared.player.pos[0], shared.player.pos[2]) + state.compensation[1], shared.player.pos[2]], yaw: shared.cam.yaw, terrainScale: STREAMING_TERRAIN_SCALE }, state.compensation[1]),   // AUDIT LANDFORMS C1: its height in DFU's frame   // TERRAIN-SCALE1 (audit): the ground `pos` stood on; AUDIT 68 S22: its height without the streamer's compensation
    });
    if (!t) return;
    // AUDIT ETHER-OW C2-3 (AUDIT CAPTAIN'S SEA P6's law): NO BOARDING ACROSS THE VEIL - "Your Ship" is the Bay's (its two
    // pixels in region 31), and the board is a teleport: from past the Veil the transport's Ship row and Warm Ashes' raid
    // carried a captain over and home again without the crossing, the boat left behind. Leaving the ship always goes
    // back where it was boarded (`boardShipPosition`), whichever side that is
    if (!playerEntity.boardShipPosition && shared.veilRefused(t.go)) return;
    // TR-AUDIT F-F1: READ the reposition rather than infer it from
    // `restore`. StreamingWorld's RandomStartMarker is
    // PositionPlayerToLocation, which puts you at a random SIDE of the
    // location at that pixel and falls back to the terrain origin only
    // when the pixel has none (:1437-1447).
    //
    // MEASURED, 2026-09-03, against the owner's real MAPS.BSA: the two
    // ship pixels are NOT open sea. Map pixel (2,2) carries region 31
    // ("High Rock sea coast") location index 1, "Your Ship", mapId
    // 1050578, LocationTypes.HomeYourShips (14), 1x1, block
    // SHIPAA00.RMB; map pixel (5,5) carries region 31 index 2, "Your
    // Ship", mapId 2102157, block SHIPAA01.RMB - and those two mapIds
    // are systems/banking.js SHIP_INTERIOR_MAP_IDS exactly. Nothing
    // else in the 62 regions stands on either pixel.
    //
    // So the fallback never runs and this arrival is an ORDINARY
    // location arrival: `reposition` rides into the teleport core, the
    // core runs the location arm once the destination pixel is built,
    // and HomeYourShips' own two booleans (useNearestStartMarker true,
    // grounded false - :1462-1464) put the player on the deck at a
    // random side of the ship's block rather than at a terrain origin
    // dropped to sea level. The pin is tr4_ship.test.js's data gate.
    // AUDIT 68 S22: the height is stood in the arrival's frame (compensation[1] survives state.init); a memory
    // written raw, before the flag, cannot be recovered and is GROUNDED.
    const legacy = t.reposition === REPOSITION.None && !t.restore.compensationFree;
    const localPos = t.reposition === REPOSITION.None ? (shipRestorePos(t.restore, state.compensation[1]) ?? t.restore.pos) : null;
    // A10 - THE SCENE CACHE ROUND THE TELEPORT (:382-388, :393-398).
    // BOTH arms of the ship do the same three things in the same
    // order: CacheScene(world.SceneName) with SceneName still naming
    // the pixel you are LEAVING, the teleport, then
    // RestoreCachedScene(world.SceneName) with SceneName now naming
    // the pixel you have ARRIVED at. DFU's own comment says why the
    // pair is safe here - "ship is special case, cache will not be
    // cleared" - and the port already carries that half at the
    // map-pixel seam below (the to/from-ship exception on
    // clearSceneCache).
    //
    // Without it the port DECIDED but never CACHED: _teleportToPixel
    // destroys every built pixel and collectPixel takes the loose
    // piles with it, so a chest dropped on the dock was gone the
    // moment you boarded and gone again when you came back. The pair
    // makes the two pixels a hand-off - the departure's piles wait in
    // the cache until the return, and the ship's own deck likewise.
    //
    // The port's exterior scene state is the loose piles, carried as
    // DFU carries them: LootContainerData_v1 entries with
    // LootContainerTypes.DroppedLoot (:558-566). NATIVE coordinates,
    // because a pile that came back in local ones would land wherever
    // the floating origin happened to be.
    hudFade.smashHUDToBlack();   // WA1: UpdateMode's ship arm opens black (TransportManager.cs:364) - and the quest machine holds while it fades back (QuestMachine.Update)
    cacheExteriorScene(here);
    await _teleportToPixel(t.go.x, t.go.y, localPos, { reposition: t.reposition, grounded: legacy });
    // TERRAIN-SCALE1 (audit): a deck remembered by a save from before the stamp stood on the prefab's 1.5 - the
    // teleport stood the player on it verbatim (not grounded); stood again now, over the pixel just built
    if (localPos && !legacy && (scaleOf(t.restore?.terrainScale) !== STREAMING_TERRAIN_SCALE || landform)) {   // LANDFORM1: or with the row's lift to put back on
      const c = state.compensation[1];
      const y = restandHeight(localPos[1] - c, localPos[0], localPos[2], scaleOf(t.restore.terrainScale)) + c;
      if (shared.walkMode) shared.player.spawn(localPos[0], y, localPos[2]);
      shared.cam.pos = [localPos[0], y + (shared.walkMode ? 0 : 40), localPos[2]];
    }
    restoreExteriorScene(t.go);
    if (t.restore) shared.cam.yaw = t.restore.yaw;
    playerEntity.boardShipPosition = t.boardShipPosition;
    shared.setTransportModeHere(t.mode);
    hudFade.fadeHUDFromBlack();   // WA1: ...and closes on FadeHUDFromBlack (:401), the arrival awaited, as teleportTo's is
  }

  /** SetAnchor (:100-117): the outer host's world half, the mounted
   *  mode's inside half, one record. */
  function setRecallAnchor(key = 'anchorPosition') {
    if (madeRuleHere('mark') === 'refused') { madeSay('mark'); return; }   // WB3b: a mark in a place that ends with the day; SD5a: nor in the Hour; EG-PLAY: nor in the Spire - EG-H2: the made level's law, each in its own words
    if (shared.modes?.dungeonLocation?.superTier) { shared.sdSay(SD_NO_MARK); return; }   // AUDIT SD IV (F2): nor in a Hollow - a later one may stand on its pixel
    const inside = shared.modes?.anchorContext?.() ?? { worldContext: WORLD_CONTEXT.Exterior, local: null, buildingKey: 0, interior: null };
    const pf = shared.walkMode && shared.playerSpawned ? shared.player.pos : shared.cam.pos;
    // A DUNGEON's local frame is its own, so its world coordinates
    // come from the streamer's pixel rather than the player's feet -
    // "only one dungeon per map pixel allowed" (:211) makes the pixel
    // the whole identity. Outside and inside a BUILDING the frame is
    // the exterior's (P8's unified frame), so the feet answer.
    const inDungeon = inside.worldContext === WORLD_CONTEXT.Dungeon;
    const wc = inDungeon ? null : state.worldCoords(pf);
    const pixel = inDungeon ? { x: state.current.x, y: state.current.y } : playerTravelPixel();
    const corner = mapPixelToWorldCoords(pixel.x, pixel.y);
    playerEntity[key] = makeAnchor({
      worldContext: inside.worldContext,
      pixel,
      nativeX: wc ? wc.x : corner.x,
      nativeZ: wc ? wc.z : corner.z,
      // ROAD-Ar (R2): the height goes in COMPENSATION-FREE, and
      // anchorLanding re-adds the live compensation on the way out.
      // That encoding IS this port's RestoreWorldCompensationHeight
      // (:137-143): DFU stores the raw Unity height and must put the
      // streaming world back to the offset it was measured against
      // before InitWorld, while an anchor stated in the compensation-
      // free frame survives any recenter between the set and the cast.
      // So there is no restore call here and no compensation on the
      // anchor - see makeAnchor's note, which is where the law lives.
      // AUDIT LANDFORMS C1: DFU's frame - outside, and in a building (the exterior's frame); a dungeon's feet are its own
      // frame's, and its anchor lands on `local` alone (AUDIT LANDFORMS II F4: they were asked the lift as a scene point)
      y: inDungeon ? pf[1] - state.compensation[1] : groundFrameHeight(pf[1] - state.compensation[1], pf[0], pf[2]),
      terrainScale: STREAMING_TERRAIN_SCALE,   // TERRAIN-SCALE1: the ground that height stands on
      local: inside.local,
      yaw: shared.cam.yaw, pitch: shared.cam.pitch,
      buildingKey: inside.buildingKey,
      interior: inside.interior, dungeon: inside.dungeon ?? null,   // INSTANCES (the audit): a dungeon's room and layout, which the Recall hands back
    });
    return true;
  }

  /** RestorePosition's landing, in the frame the arrival speaks.
   *
   *  A DUNGEON anchor's `local` IS the landing: a dungeon's frame is
   *  its own, built at the same origin every mount, so the transform
   *  written at anchor time is still valid at recall time.
   *
   *  EVERYTHING ELSE - outside and inside a building alike, because
   *  P8's unified frame makes an interior position a plain world
   *  position - lands off the NATIVE coordinates through the arrival
   *  origin, which is the quickload's own law and the only shape that
   *  survives a floating-origin recenter between the anchor and the
   *  cast. */
  const anchorLanding = (a) => {
    if (a.insideDungeon && a.local) return [...a.local];
    const [lx, lz] = state.localFromWorld(a.nativeX, a.nativeZ);
    return [lx, restandHeight(a.y ?? 2, lx, lz, scaleOf(a.terrainScale)) + state.compensation[1], lz];   // TERRAIN-SCALE1: an anchor set before the stamp stood on the prefab's 1.5; LANDFORM1: and the row's lift put back on
  };

  /** TeleportPlayer (:119-164) + the respawner's tail (:228-256). */
  async function recallToAnchor(key = 'anchorPosition') {
    if (worldMoveBusy()) return;   // AUDIT 68 S22
    if (shared._recalling) return;
    // AUDIT ARENA-LADDER A5: NO RECALL OFF THE SAND - my bout holds me as its doors do (the duel's law: no door, no rest, no
    // travel). Recall tore the floor down under a losing bout, which went unsaid: no loss, no run lost, the climb untouched.
    if (shared.arenaBouts.holds()) { shared.townTalk.say(ARENA_TEXT.refuse.travel); return; }
    if (madeRuleHere('recall') === 'refused') { madeSay('recall'); return; }   // SD5a (Super-Dungeons.md section 7): nothing answers a Recall in the Hour - its ways are the Rift's; EG-PLAY: the Spire holds you - EG-H2: the made level's law (the court refuses the Mark alone)
    const anchor = playerEntity[key];
    const plan = teleportPlan(anchor, {
      ...(shared.modes?.insideContext?.() ?? { insideBuilding: false, insideDungeon: false, buildingKey: 0 }),
      pixel: playerTravelPixel(),
    });
    // "Anchor must be set" - the 4001 box (:268-275). The cast is
    // spent either way; DFU refunds nothing.
    if (!plan) { shared.townTalk.say('You must set an anchor first.'); return; }
    if (plan.kind !== 'same-interior' && (shared.wildTeleportRefused(plan.anchor?.pixel ?? null) || shared.veilRefused(plan.anchor?.pixel ?? null))) return;   // PVPDUNGEONS: no Recall into, out of or inside the zone - AUDIT CAPTAIN'S SEA P6: nor across the Veil
    const wildTrip = plan.kind === 'same-interior' ? { ok: true, fee: 0 } : shared.wildTravelGate(plan.anchor.pixel);   // WILD3: Recall is a fast journey too
    if (!wildTrip.ok) return;
    shared.wildTravelPaid(wildTrip);
    shared._recalling = true;
    try {
      if (plan.kind === 'same-interior') {
        // ":129-134 - Just need to move player." Nothing is torn down
        // and nothing is loaded: the room you are standing in IS the
        // anchor's room.
        shared.modes?.setPlayerLocalPosition?.(anchorLanding(anchor));
        shared.cam.yaw = plan.yaw; shared.cam.pitch = plan.pitch;
        playerEntity.playerTeleportedIntoDungeon = plan.teleportedIntoDungeon;   // :216, the dungeon arm alone
        playerEntity[key] = null;   // consumed on arrival, both DFU arms (:133)
        surfacePlayer();
        return;
      }
      // "Cache scene before departing" (:145-151), the three-way arm.
      // Outside: the streaming scene by name. Inside a building:
      // the interior, which forceExitToExterior's own cacheScene arm
      // writes (PlayerEnterExit.cs:860, the same write the real door
      // makes). Inside a dungeon: NOTHING, because DFU takes
      // TransitionDungeonExteriorImmediate there and dungeons are not
      // scene-cached at all.
      routByJump();   // RVN10 (21.2): out of a fight - the pool I leave asked before a mode's teardown takes it (a dungeon's, a building's)
      if (plan.cacheScene === 'exterior') cacheExteriorScene(playerTravelPixel());
      if ((shared.modes?.mode ?? 'exterior') !== 'exterior') {
        shared.modes?.forceExitToExterior({ cacheScene: plan.cacheScene === 'building' });
      }
      const a = plan.anchor;
      shared._wodInside = plan.arrive === 'dungeon' || plan.arrive === 'building';   // WOD6: an arrival that lands inside
      await _teleportToPixel(a.pixel.x, a.pixel.y);
      // RestorePositionHelper's three arms (PlayerEnterExit.cs
      // :622-655), in its own order: dungeon first, then building
      // with doors, then outside.
      let landed = false, outOfCaravan = null;
      if (plan.arrive === 'dungeon') {
        // The dungeon mount - StartDungeonInterior through the ONE
        // door the quest respawner uses (:626-630 RespawnPlayer with
        // insideDungeon true). The anchor's local transform lands
        // after it, which is the respawner's RestorePosition (:242).
        landed = !!(await shared.modes?.startInDungeon?.({ recorded: a.dungeon ?? {} }));   // INSTANCES (the audit): the room and layout the anchor was set in - an anchor from before records the public room
        if (landed) {
          // `landed` implies modes existed, but the wave-37 law is the
          // GUARD ON THE OBJECT above its declaration - hold the shape.
          shared.modes?.setPlayerLocalPosition(anchorLanding(a));
        } else {
          // No entrance at the anchor's pixel: DFU's "all else fails"
          // exterior landing (:645-655), the same fallback the quest
          // respawner takes.
          shared.townTalk.say('The way underground is closed. Repositioning player.');
        }
      } else if (plan.arrive === 'building') {
        // ":632-643 - Start in building", off the anchor's own
        // exteriorDoors, through the identical seam the quickload
        // re-entry uses. A door that cannot be found is DFU's
        // reposition arm (:615-620) - say the line and keep the
        // teleport's landing, never the inside position on the
        // outside collider.
        landed = !!(await shared.modes?.restoreInterior?.(a.interior ? { ...a.interior, layout: a.layout } : a.interior, anchorLanding(a)));   // WD3 (AUDIT WD3 S5): with the layout the anchor was set in
        if (!landed && !(outOfCaravan = shared.caravanDoorLanding(a.interior))) shared.townTalk.say('Building has no exterior doors. Repositioning player.');
        else if (!landed) shared.townTalk.say(CARAVAN_TEXT.outside);
      }
      if (!landed) shared._wodInside = false;   // WOD6: it landed outside after all
      if (landed) {
        shared.cam.pos = shared.player.eyeAt();   // EV1: the interpolated render eye
      } else if (plan.arrive !== 'dungeon') {
        // The exterior landing: the anchor's native coordinates back
        // through the arrival origin, the quickload's own shape - or,
        // an anchor set in a caravan, the ground behind its rear door
        // (the native point is inside the wagon's body)
        const [lx, ly, lz] = outOfCaravan?.position ?? anchorLanding(a);
        if (shared.walkMode) { shared.player.spawn(lx, ly, lz); shared.playerSpawned = true; }
        shared.cam.pos = [lx, ly + (shared.walkMode ? 0 : 40), lz];
      }
      // A dungeon anchor whose entrance could not be found keeps
      // _teleportToPixel's own landing: its stored height is in the
      // DUNGEON's frame and means nothing on the terrain, so writing
      // it here would drop the player through the world. DFU's
      // "all else fails" arm respawns at the world coordinates and
      // FixStanding snaps it; the pixel teleport already did both.
      shared.ohAbyss?.onRespawnerComplete();   // OH-D: RaiseOnRespawnerCompleteEvent - the mod subscribed at its Install, before this cast's own handler below
      // "Restore final position and unwire event" (:242) - the pose
      // rides the transform, exactly as RestorePosition sets it.
      shared.cam.yaw = a.yaw ?? shared.cam.yaw; shared.cam.pitch = a.pitch ?? shared.cam.pitch;
      // ":246 - Set 'teleported into dungeon' flag when anchor is
      // inside a dungeon." The flag lives on the entity beside the
      // anchor; its save-envelope field is the import lane's.
      playerEntity.playerTeleportedIntoDungeon = plan.teleportedIntoDungeon;
      // "Restore scene cache on arrival" (:248-252). The condition is
      // the LANDING, not the anchor - `if
      // (!playerEnterExit.IsPlayerInside)` - so a building or dungeon
      // arm that repositioned outside restores the exterior scene
      // too, which is right: that is where the player ended up. That
      // is also why teleportPlan carries no field for it; only this
      // side knows. The building arm needs nothing here anyway:
      // restoreInterior runs RestoreCachedScene itself, at the moment
      // the building's key is known (PlayerEnterExit.cs:804).
      if (!landed) restoreExteriorScene(a.pixel);
      playerEntity[key] = null;   // consumed on arrival, both DFU arms
      surfacePlayer();
    } finally {
      shared._recalling = false;
    }
  }

  /** PromptPlayer (:81-98): the 4000 anchor/teleport box, with
   *  AllowCancel - DFU's own QoL, and its own comment says the cast
   *  is not refunded. Every host routes its Recall arrival here.
   *  `teleportOrSetAnchor` is a TEXT.RSC ID (:32), not a localization
   *  key, so the box's line is record 4000 verbatim - Internal_RSC.csv
   *  :4819, whose one [/center] is the centring ChoiceWindow does. */
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
    if (worldMoveBusy()) return;   // AUDIT 68 S22
    if (shared._teleporting) return;
    if (shared.wildTeleportRefused(pick.pixel) || shared.veilRefused(pick.pixel)) return;   // PVPDUNGEONS: the guild's teleport never into, out of or inside the zone - AUDIT CAPTAIN'S SEA P6: nor across the Veil
    const wildTrip = shared.wildTravelGate(pick.pixel);   // WILD3: the guild's teleport is a fast journey too
    if (!wildTrip.ok) return;
    shared.wildTravelPaid(wildTrip);
    shared._teleporting = true;
    try {
      shared.modes?.forceExitToExterior();
      // AUDIT 64 F19: TeleportAway names the reposition EXPLICITLY -
      // `TeleportToCoordinates((int)destinationPos.X, (int)destinationPos.Y,
      // RepositionMethods.RandomStartMarker)` (:143), where the overload's
      // own default is Origin (StreamingWorld.cs:368) - so this is the
      // third caller of PositionPlayerToLocation the port has a host for,
      // not a landing choice of the port's. Without it the guild teleport
      // put the player down at the terrain tile's dead centre, which for a
      // city is inside its block grid.
      await _teleportToPixel(pick.pixel.x, pick.pixel.y, null,
        { reposition: REPOSITION.RandomStartMarker });
      if (!weatherOverride) {
        applyClimateWeather(maps.getClimateIndex(pick.pixel.x, pick.pixel.y), Math.floor(shared.playerTicker.classicMinutes), fieldXZ(), climateAt);   // WEATHER2a: over the ground the arrival lands on; WEATHER2b: the field's word there
        if (weatherStale()) applyWeather(shownWeather());
      }
      surfacePlayer();
      // D4 - TeleportAway's last line (:150). The window smashed the
      // screen to black before it handed the destination over
      // (ui/teleportPopUp.js's `_yes`, :137), so the black has covered
      // the streamer's whole rebuild; this lifts it. DFU raises the
      // fade immediately after CloseWindow because
      // TeleportToCoordinates has already returned - here the arrival
      // is awaited, which is the same instant.
      hudFade.fadeHUDFromBlack();
      shared.townTalk.say(`You arrive at ${getLocalizedLocationName(pick.mapId, pick.name)}.`);   // L10N3e: the place as shown, by its MapId - the pick keeps the canonical name the journey is keyed by
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
