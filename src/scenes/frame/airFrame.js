// The frame's air phase: the rain, the snow, the sand, the wisps, and the bolts outdoors.
import { createGrassField, LAB_GRASS, pieceIndex } from '../../render/labGrass.js';
import { curtainsOf } from '../../render/rainCurtains.js';
import { floraSwayOn } from '../../weather/windDrive.js';
import { getPref } from '../../ui/uiPrefs.js';
import { hazeFrameSettings } from '../../weather/heatHaze.js';
import { meterFor } from '../../render/perfMeter.js';
import { PUDDLE_RECORDS, puddleWetAt } from '../../world/puddleMask.js';
import { SCALED_OCEAN_ELEVATION, STREAMING_TERRAIN_SCALE, TERRAIN_SIZE } from '../../world/terrainSampler.js';
import { SEASON } from '../../world/climateSwaps.js';
import { surfaceHeightAt, surfaceNormalAt, TERRAIN_TILE_DIM } from '../../world/terrainSurface.js';
import { WATER_DRAW_MASK_TABLE, waterCorners } from '../../world/waterCorners.js';
import { wispsOn } from '../../render/windWisps.js';
import { timeScale as worldTimeScale } from '../../world/timeScale.js';
import { wasteGroundCoverStands } from '../../world/wild/cromwarkWaste.js';

/** @param {any} shared */
export function createAirFrame(shared) {
  const {
    _fr, _tvFootMemo, atmosphere, bannerPass, bannersHung, boltsGl, borderGround, built, cam, cityGuards,
    drawVeiledPeerBodies, droppedLoot, duelRingsNow, duelWall, eliteDungeonPresence, eventPillar, exteriorFoes, fieldCellsHere,
    floorRecords, folkStreet, gamePaused, gatePool, grassDensity, grassNormalScratch, grassRecords, groundMeanColour,
    groundPuddles, hallBanners, hazeGl, hcc, heatHaze, jungleFloor, labGrass, lootLines, maps, navalCrew, npcMarks,
    player, playerTravelPixel, raidSmoke, rainCurtains, renderer, riteHost, sand, sdHost, sdOmenNow, sdOmenPassOf,
    seatBanners, shipFlagPass, shipFlags, sky, snowCover, starfall, state, streetPeople, tvGroundAt, tvGroundGenNow,
    walkMode, windfall, wisps, worldAddons, wxEye32, yardCull,
  } = shared;
  function frameAirPhase(now, dt) {
    const { tvf, mwv, proj, view, minute, enhancedFront, fx, wd, windClock, bbUp, camRight } = _fr;
    // DW-C: under the distance fog the air's own effects - the sand, the wisps, the bolts, none of which writes a depth
    // the mod's post effect would fog it by, so all of which it closes to the fog colour - are the fog's. PUDDLE-RAIN
    // (FIELD BUGS 2026-10-01 #1): and so is what falls. DW-D stood the rain, the snow and the sand down for any swimmer
    // outdoors (UnderwaterPresentationEffects.UpdateWeatherParticles, IsPlayerSwimming && !IsWaterWalking) - and the
    // port swims wherever the drawn water is under the feet (MAC2), a puddle's whole tile among it, so a body sunk in a
    // puddle with its eye over the water lost the rain while the rain loop played on. The water over the EYE hides it.
    const _dwAirOff = !!shared._dwFogP?.under;
    const _dwPrecipOff = _dwAirOff;
    // OW-WEATHER (FIELD BUGS 2026-10-01 #9, "in the overworld, weather is weird, it only happens around the player at
    // small scale"): the sand, the rain, the snow and the wisps wrap their boxes (42 to 90 m) round the eye handed in,
    // and under the Overworld cam.pos stays on the traveller's head (player/travelCamera.js) while the view stands
    // 150-450 m up and back - so the weather was a small cube round the sprite, seen from outside it. They wrap round
    // the eye the view is drawn from: the air in front of the camera is full of it, as it is when you stand in it.
    // RPT1026-WORLD RAIN-EYE (a private report, 2026-10-20: at sea in a storm, the camera scrolled out, the rain fell in a
    // small box round the ship and nowhere else): on the ground too - a camera drawn from behind the head (the third person's, a
    // helm's scrolled out over her stern, the broadside's aim) stood outside the box round the head, a cube of rain round
    // the ship; the head's eye and the view's are one in the first person, as they always were.
    const wxEye = mwv.eye;
    // WX2: what falls is what the front SHOWS - under the enhanced sky the
    // outgoing rain tapers after the sim has cleared and the incoming
    // holds off until the deck is in. Classic: the sim's mode, as W1.
    // RAIN-OVER-GRASS (Mac: "the rain, rains behind the grass texture"): what falls - the rain, the snow, the sand and
    // the wisps - writes no depth, so every pass drawn AFTER it painted over it: the grass field and the halls' banners
    // stood in front of rain falling nearer the eye. It is drawn once the opaque world is whole (below, after the banners).
    const drawFalling = () => {
      wxEye32[0] = wxEye[0]; wxEye32[1] = wxEye[1]; wxEye32[2] = wxEye[2];   // RAIN-LEAK: filled here, not in the frame - PERF-V8's bytecode ceiling
      const precipShown = enhancedFront ? fx.shown : shared.precipMode;
      if (precipShown === 'sand') {
        // WEATHER2d: THE SANDSTORM'S SAND - the wisps' program in the sand's look, the front's intensity its
        // strength, on the one wind's rate and travel; the rain program never draws it
        if (sand && !_dwPrecipOff) {
          sand.draw({ on: true, strength01: fx.intensity, windV: wd.windV, step: wd.step, gust: wd.gust }, proj, view, wxEye32, now / 1000);
          renderer.markForeignPass();
        }
      } else if (precipShown && shared.precip) {   // W1 review: the gate is the MODE, never the object - the renderer outlives a clear-up
        // EE8: the enhanced profile rides the switch, and the wind that drives
        // its rain is the SKY'S OWN - the deck's wind from the eased weather
        // row - INTEGRATED here as travel, so a change in the wind moves what
        // falls next and never what has already fallen.
        shared.precip.enhanced = !!sky?.cloudShadow;
        if (shared.precip.enhanced) {
          shared.precip.intensity = fx.intensity; shared.precip.snowShare = fx.snow ?? null;   // WX2: the front's share of the profile; PRECIP1: and its snow share
          // WX1: THE LAB'S WIND LAW, term for term - the rate handed to the
          // shader is the lab's metres a second WITHOUT the gust, and the
          // travel integrated on the CPU carries it, as grass-proto.html's
          // frame() does. WIND3: both come from the ONE mapping now
          // (systems/wind/windDrive.js, `wd` above) - the same rate the grass,
          // the wisps and the flats take, and WIND1's gust in place of the
          // fixed three-sine stack this block had kept.
          shared.precip.windV[0] = wd.windV[0]; shared.precip.windV[1] = wd.windV[1];
          shared.precip.windOff[0] += wd.step[0]; shared.precip.windOff[1] += wd.step[1];
        }
        // AUDIT-TO1 J1: DisableWeatherAndSound stops the rain/snow PARTICLES
        // for the journey (:1218-1223) and restores them at its end; the sim,
        // the front and the wind carry on underneath, which is what the mod's
        // `PlayerWeather` disable leaves running too.
        // OW-RAIN (Mac: "it stops raining (you can still hear it) ... when you move on the overworld map"): the Overworld's
        // click is a Travel Options journey, whose DisableWeatherAndSound stood the particles down while the rain loop
        // played on - but the Overworld's journey is SEEN, the world going on under it, so what falls keeps falling there
        if ((!shared._travelWeatherOff || tvf) && !_dwPrecipOff) {
          shared.precip.drawFall(precipShown, proj, view, wxEye32, camRight, now / 1000);   // PRECIP1: at the air's snow share
          renderer.markForeignPass();   // EV6: so did the rain
        }
      }
      // WIND3: THE WISPS - the wind, seen (render/windWisps.js). After the
      // rain and before the grass, on the same integrated wind; a foreign
      // pass like the rain. Their row is read every frame.
      if (wisps && wd.on && wispsOn() && !_dwAirOff) {
        wisps.draw(wd, proj, view, wxEye32, now / 1000);
        renderer.markForeignPass();
      }
    };
    // BOLT: the burning channels, over what the world drew and behind what stands in front of them - from the eye the
    // view was built from (mwv.eye: a third-person camera stands metres off the head, cam.pos)
    if (boltsGl && shared.boltFrame.bolts.length && !_dwAirOff) {
      boltsGl.draw(shared.boltFrame.bolts, proj, view, new Float32Array(mwv.eye), undefined, renderer.worldViewportPx?.[3]);   // RETRO1: the world image's own pixel
      renderer.markForeignPass();
    }
    // GR1: THE LAB'S GRASS. The scatter is the lab's 1,200,000 candidates
    // over a 420m square around the eye, kept where they land on a GRASS
    // tile of a near-ring pixel - never on a road record, never on a tile
    // the road painter wrote (GRASS-PATH1), never on water (a water
    // record, a tile with ANY water corner - GRASS-WET1 - or under the
    // sea plane), never in winter - each
    // rooted at the real ground under it. Rebuilt when the eye is more
    // than 60m from the scatter's centre. Drawn with the lab's own draw:
    // the game's sun, ambient and colour in the lab's uniforms, the same
    // integrated wind the rain reads, and the lab's weather dim.
    const frameGrass = () => {   // PERF-V8
    if (labGrass && !tvf) {   // TV1: from 150 m up a blade is under a pixel - the field waits for the traveller's eye
      const ex = cam.pos[0]; const ez = cam.pos[2];
      // GR5: THE FIELD IS ANCHORED TO THE WORLD. GR2's walk placed every
      // blade relative to the eye and swapped the whole field when the
      // eye moved 60m - the switch, and the hitch of one 60MB upload.
      // Now each world cell keeps its own blades whoever is looking;
      // walking fills cells at the leading edge and frees them at the
      // trailing one, a couple a frame, inside the range fade. The
      // keep()/ground() closures below only capture the near pieces and
      // cost nothing to rebuild; the cells they answer for are the ones
      // being filled this frame.
      const sea = SCALED_OCEAN_ELEVATION * STREAMING_TERRAIN_SCALE + 0.5;
      // PERF10 (2026-09-19, Mac: "further out in the wilderniss it loaded
      // many chunks and grass the performance still degrades"): THE
      // INDEX IS BUILT ONLY WHEN A CELL IS ACTUALLY FILLED. `near` spread
      // every streamed pixel into an array, mapped it into a second one
      // (a fresh translation triple apiece) and built a Map over it -
      // EVERY FRAME, whether or not the field had a cell to place. The
      // further out you walk the more pixels are streamed and the longer
      // that costs, and on a standing field it is spent for nothing at
      // all: `keep`/`ground` are called only from placeLabGrassCell.
      // One lazy memo per frame, so a frame that fills nothing allocates
      // nothing and a frame that fills two cells pays exactly what it
      // paid before.
      let _pieceAt = null;
      let _near = null;
      const nearPieces = () => (_near ??= [...built.values()].filter((p) => p._stride === 1 && p.tilemapBytes && (snowCover.on || p.season !== SEASON.Winter)));   // PRECIP4: on the snow lane every pixel, each blade asked (keep)
      const pieceAt = (x, z) => (_pieceAt ??= pieceIndex(   // PERF8: one Map read per blade instead of a scan of every near pixel
        nearPieces().map((p) => ({ p, t: state.pixelTranslation(p.px, p.py, [0, 0, 0]), grass: grassRecords.get(p.groundArchive) })),
        TERRAIN_SIZE))(x, z);
      // GRASS4 measured this pair and left it alone, which is worth
      // recording so nobody "fixes" it again: `ground` repeats the
      // lookup `keep` just did, and caching the answer across the two
      // saves NOTHING once pieceIndex's key is a number rather than a
      // string (labGrass.js pieceKey). The duplicate was only ever
      // expensive because of the string it built; the arithmetic it
      // repeats is free. A stash here would be mutable state and a
      // coordinate guard bought for no measured gain.
      const _bare = riteHost?.clearing() ?? starfall?.clearing() ?? null;   // AUDIT WB12d (G2): the faithful's burned earth, this frame; STAR4: or a star's crater (a star never falls beside the gate)
      const keep = (x, z, floor = false) => {   // BANTHA2: `floor` the jungle floor's keep - its records (grass and dirt), and the meadow kept out of every point it claims
        const hit = pieceAt(x, z);
        if (!hit) return null;
        const { p, t, grass } = hit;
        const lx = x - t[0]; const lz = z - t[2];
        if (p.wasteR && !wasteGroundCoverStands(p.wasteR, p.px, p.py, lx, lz)) return null;
        const tx = Math.floor(lx / 6.4); const tz = Math.floor(lz / 6.4);
        const ti = tz * TERRAIN_TILE_DIM + tx;
        const byte = p.tilemapBytes[ti];
        const rec = byte >> 2;
        // ECOTONE1: at a climate border the root stands in the climate the ground's border gives it - its grass, its puddles
        const ga = p.ecoGround ? borderGround(p, lx, lz) : p.groundArchive;
        const g = ga === p.groundArchive ? grass : grassRecords.get(ga);
        if (rec === 0 || !(floor ? floorRecords.get(ga) : g)?.has(rec) || (!floor && jungleFloor?.claims(x, z))) return null;
        // GRASS-PATH1 (2026-09-19, Mac: "Grass shouldnt be on dirt
        // paths"): the road painter's own mask. A track across grass
        // writes 10/11/12/51 - the SAME records the natural dirt-grass
        // marching squares write - so the record cannot tell a path from
        // a field's edge and the placer grew a lawn straight down every
        // track. The painter knows, and now says (world/road/roadPainter.js).
        if (p.paths?.[ti]) return null;
        // WOD2: and not across a World of Daggerfall site - DFU keeps its
        // nature off the loader's locationRect, and the grass is this
        // lane's nature underfoot; a camp's floor or a rock field's
        // stones would otherwise stand in a lawn.
        if (p.wodSite && tx >= p.wodSite.xMin && tx < p.wodSite.xMax && tz >= p.wodSite.yMin && tz < p.wodSite.yMax) return null;
        // AUDIT WB12d (G2): nor through the faithful's sigil - the rite's circle is burned earth (scenes/riteHost.js)
        if (_bare && (x - _bare.x) * (x - _bare.x) + (z - _bare.z) * (z - _bare.z) <= _bare.r * _bare.r) return null;
        // GRASS-WET1 (2026-09-19, Mac: "some textures not taking the
        // water tile"): NOT A CORNER OF IT IN WATER. `rec === 0` above
        // rejects only tiles that are water WHOLE; the water-grass shore
        // records (20-22, 49) a stream or a town's own ground tiles
        // write are mostly-grass by texel count, so grassRecordsOf takes
        // them and blades grew out of the water - a green mottled patch
        // in the middle of a pond, which is the water tile not reading
        // as water. The corner table (world/water/waterCorners.js) is the one
        // law for that question; the water pass and the player's feet
        // already read it, and now the grass does too.
        // WATER-PUDDLE (2026-09-25): a puddle record is wet only where
        // its own art is water - the pass draws it so now, and a blade
        // refused the whole tile left its dry ground bald.
        if (waterCorners(byte, WATER_DRAW_MASK_TABLE)) {
          const puddle = PUDDLE_RECORDS.includes(rec) ? groundPuddles.get(ga)?.[rec] : null;
          if (!puddle || puddleWetAt(puddle, byte, lx / 6.4 - tx, lz / 6.4 - tz)) return null;
        }
        // GRASS3: the height of the surface that is DRAWN, not a
        // bilinear patch over the same samples - the terrain is cut into
        // triangles and bilinear is a different surface. On real grades
        // the two are under 0.08 world units apart against a blade of
        // 0.25-0.72, so this is correctness rather than a fix anyone
        // would see; it is also the exact law a GPU-placed field has to
        // run, where there is no baked height to fall back on.
        // `p._stride` is the ring class this pixel is drawn at, and the
        // grass only stands on the stride-1 ring anyway.
        const h = surfaceHeightAt(p.samples, lx, lz, p._stride ?? 1);
        if (h <= sea) return null;
        if (snowCover.on && snowCover.buries(p, lx, lz, h + t[1])) return null;   // PRECIP4: no blade through the snow the ground shows there (AUDIT PRECIP HOST-9: at the blade's own height)
        return h + t[1];
      };
      // GR4: the SAME lookup keep makes, answering with the tile's mean
      // colour instead of its height - so the root under a blade takes
      // the colour of the very tile keep let it stand on.
      const ground = (x, z) => {
        const hit = pieceAt(x, z);   // PERF8
        if (!hit) return null;
        const { p, t } = hit;
        const lx = x - t[0]; const lz = z - t[2];
        const tx = Math.floor(lx / 6.4); const tz = Math.floor(lz / 6.4);
        const rec = p.tilemapBytes[tz * TERRAIN_TILE_DIM + tx] >> 2;
        return groundMeanColour.get(p.ecoGround ? borderGround(p, lx, lz) : p.groundArchive)?.[rec] ?? null;   // ECOTONE1: the border's
      };
      // GRASS-LIT2: the ground's normal under a blade - the drawn surface's own (the near grid's vertex normals over the
      // triangle the root stands in), so a field on a hillside is lit as the hillside is. Written into one scratch; the
      // placer copies it before it asks again.
      const slope = (x, z) => {
        const hit = pieceAt(x, z);   // PERF8
        if (!hit?.p.groundNormals) return null;
        const { p, t } = hit;
        return surfaceNormalAt(p.groundNormals, x - t[0], z - t[2], grassNormalScratch);
      };
      if (!shared.labGrassField) shared.labGrassField = jungleFloor ? jungleFloor.pair(createGrassField(labGrass, { keep, ground, slope, density: grassDensity })) : createGrassField(labGrass, { keep, ground, slope, density: grassDensity });   // PERF1: the pref's fraction of the lab's field; BANTHA2: the floor's paired with it
      shared.labGrassField.update(ex, ez, keep, ground, slope);
      jungleFloor?.update(ex, ez, (x, z) => keep(x, z, true), ground, slope);   // BANTHA2: the jungle's floor, where it claims
      window.__grassStats = () => ({ blades: labGrass.count, drawn: labGrass.drawn, vertsPerBlade: labGrass._meadow ? labGrass.vertsCards : labGrass._oneQuad ? labGrass.vertsFar : labGrass.verts, nearPixels: nearPieces().length, cells: shared.labGrassField?.live.size ?? 0, slots: shared.labGrassField?.slots ?? 0,   // GRASS AUDIT 1: `verts` below is the near blade's; `vertsPerBlade` is the frame's (MEADOW1: a near tuft's cards in the meadow). PERF-URL: `cells` and `slots` had been swallowed by this comment - the hook answered without them
        perCell: labGrass.perCell, range: LAB_GRASS.range, height: LAB_GRASS.height, verts: labGrass.verts,
        // GRASS2: what the field HOLDS, against what a slot-sized draw
        // would have submitted - the pad, measured rather than assumed.
        held: labGrass.slotCount ? labGrass.slotCount.reduce((a, b) => a + b, 0) : null, floor: jungleFloor && { on: jungleFloor.on, cells: jungleFloor.field?.live.size ?? 0, blades: jungleFloor.renderer?.count ?? 0, drawn: jungleFloor.renderer?.drawn ?? null } });   // BANTHA2: the jungle floor's field
      // GR2: the sky's row on the lab's slider - a sunny day is the lab's
      // 70. AUDIT 49 F4: the lab's uWind is WIND.speed, which carries the
      // gust; uWindV is the rate without it - the same pair the rain is
      // fed. WIND1: the gust envelope is the WIND'S, shaped by its
      // strength. WIND3: all of it off the one mapping (`wd`, systems/
      // windDrive.js) - the grass, the rain, the wisps and the flats read
      // the same numbers by construction.
      meterFor(renderer.gl)?.mark('grass');   // GRASS2
      renderer.snapshotAoDepth();   // GRASS-LIT: the AO reads the world without the field (render/airPass.js snapshotAoDepth)
      labGrass.draw(proj, view, new Float32Array(cam.pos), windClock,
        // WIND4 (Mac: "grass doesnt get darker at night"): the WHOLE of
        // the scene's light, not three of its five terms - the sun's
        // SCALE is what sets with the sun, and the moon is what is left
        // when it has. The same fields render/renderer.js hands its own
        // programs.
        { fog: { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, color: renderer._fogColor, camPos: renderer._camPos, dw: renderer._dwFog, haze: renderer._haze },   // DISC20-A: the fog the ground took this frame, from the view's own eye; DW-C: and the sea's
          sunDir: renderer._lightDir, amb: renderer._ambient, sunCol: renderer._sunColor,
          // GRASS-LIT (render/labGrass.js): no weather dim - the ambient and the sun above are weathered already
          // (exteriorAmbient, the sun's scale x wxNow.sun), and the lab's LAB_DIM on top darkened a rainy field a
          // third past the ground it stood in. And the rest of the ground's light: the lane and its eye, the deck's
          // shadow, the sun map, the player's light.
          dim: 1, lane: renderer.lightingLane, exposure: renderer.exposure, adaptTex: renderer.adaptTexture,
          cloud: renderer._cloudShadow, shadows: renderer._shadows, indirect: renderer._indirect, indirectColor: renderer._indirectColor,
          sunScale: renderer._sunScale, moonDir: renderer._moonDir, moonScale: renderer._moonScale, moonCol: renderer._moonColor,   // WX2: the dim crossed on the front until GRASS-LIT
          // GRASS-LIT2: the frame's lanterns, torches and candles - the list the ground took, its display colours (the
          // grass decodes them under the lane, as the rest)
          points: renderer._pointLights, pointColors: renderer._pointColorData(renderer._pointLights.length >> 2, true) },
        { dir: wd.dir, speed: wd.slider * wd.gust, windV: wd.windV, sway: floraSwayOn() && wd.on },   // AUDIT MEADOW1: the trees' sway switch - the meadow sways while they do
        LAB_GRASS.range, getPref('grassStyle'));   // GRASS-PX: the row's word, read live - the style is a uniform, so it flips without a reload
      jungleFloor?.drawBeside(labGrass);   // BANTHA2: the jungle's floor, under the meadow's light and wind
      // GRASS2: the field had been inside the WORLD's span, which is the
      // one number that cannot say whether the grass is worth what it
      // costs. It marks its own now, and hands the frame straight back.
      meterFor(renderer.gl)?.mark('world');
      renderer.markForeignPass();   // EV6: the grass changed programs behind the shadows' back
    }
    };
    frameGrass();
    // GUILD1d: THE HALLS' BANNERS - opaque cloth after the grass, from the view's own eye, lit by the frame's sun and
    // fogged as the ground is, swaying on the weather's wind (render/bannerPass.js). AUDIT GUILD1d R3: BEFORE the veiled
    // bodies, the duel walls and the gate's fire - an opaque pass that writes depth drawn after them painted over every
    // glow in front of it. AUDIT GUILD1d R1: the wind's own 0..1 (`strength01`), never the lab's 0..200 slider
    const frameBanners = () => {   // PERF-V8
    if (hallBanners || seatBanners) {
      const hung = bannersHung();   // SEAT1a: the seats' banners with the halls'
      if (hung.length && bannerPass.draw(hung, proj, view, new Float32Array(mwv.eye), now / 1000, {
        light: { sunDir: renderer._lightDir, amb: renderer._ambient, sunCol: renderer._sunColor, sunScale: renderer._sunScale, moonDir: renderer._moonDir, moonScale: renderer._moonScale, moonCol: renderer._moonColor },   // AUDIT GUILD1d R9: and the moon, as the grass takes it
        wind: Math.min(1, wd.strength01 * wd.gust),
        fog: { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, color: renderer._fogColor, camPos: renderer._camPos, dw: renderer._dwFog, haze: renderer._haze, focus: renderer._focus },
      })) renderer.markForeignPass();
    }
    };
    frameBanners();
    const frameShipFlags = () => {   // PERF-V8
    // SHIP-COLOURS: and the ships' flags, cloth as the banners are (render/shipFlagPass.js), on the same light and wind - a
    // foreign seam of its own (the banners' program left bound under it)
    if (shipFlagPass && shipFlagPass.draw(shipFlags.draws(), proj, view, new Float32Array(mwv.eye), now / 1000, {   // none to draw: its idle textures pruned, no pass
      light: { sunDir: renderer._lightDir, amb: renderer._ambient, sunCol: renderer._sunColor, sunScale: renderer._sunScale, moonDir: renderer._moonDir, moonScale: renderer._moonScale, moonCol: renderer._moonColor },
      wind: Math.min(1, wd.strength01 * wd.gust),
      fog: { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, color: renderer._fogColor, camPos: renderer._camPos, dw: renderer._dwFog, haze: renderer._haze, focus: renderer._focus },
    })) renderer.markForeignPass();
    };
    frameShipFlags();
    // HAZE1: HEAT HAZE - the mod's GrabPass at Transparent-100: the opaque world whole (the ground, the models, the flats,
    // the grass and the banners), what falls and every translucent thing still to come. Not under the travel view's
    // camera: the ring stands round the player's feet, and that eye is hundreds of metres over them.
    // WINDFALL1: WINDFALL's LEAVES AND SNOW - cutouts that write depth, so with the opaque world and before the haze grabs
    // it; lit as the flats round the player are. Not under the travel view's camera (they ride the player's place).
    if (windfall.particles && !tvf && windfall.draw(proj, view, renderer.flatLightAt(walkMode && shared.playerSpawned ? player.pos : cam.pos))) renderer.markForeignPass();
    if (!tvf && atmosphere.draw(proj, view, renderer.flatLightAt(walkMode && shared.playerSpawned ? player.pos : cam.pos))) renderer.markForeignPass();   // ATMO1: after Windfall's leaves, with the opaque world
    const frameHaze = () => {   // PERF-V8
    if (hazeGl) {
      const _hzFoot = walkMode && shared.playerSpawned ? player.pos : cam.pos;
      const _hzPx = playerTravelPixel();
      const hz = heatHaze.tick({ dt, time: gamePaused() ? 0 : dt * worldTimeScale(), exterior: true, climate: maps.getClimateIndex(_hzPx.x, _hzPx.y), weather: shared.weather, minuteOfDay: minute,
        foot: _hzFoot, grounded: !walkMode || !!player.grounded, settings: hazeFrameSettings() });   // AUDIT ENVIRONS W4: the ease on the real clock (unscaledDeltaTime), the shimmer on the game's (_Time.y)
      if (hz.visible && !tvf && hazeGl.draw(hz, proj, view, renderer.worldViewportPx ?? [0, 0, renderer.gl.drawingBufferWidth, renderer.gl.drawingBufferHeight], hz.seconds)) renderer.markForeignPass();
    }
    };
    frameHaze();
    renderer.drawHeld(camRight, bbUp);   // GRASS-PORTAL: the street's blended flats, over the grass behind them
    shared.poiHost?.drawTranslucent(renderer, mwv.eye, yardCull);   // POI-2: a POI's glass and its like, after every opaque thing and the sea's top, the farthest first; AUDIT POI R4: and after the grass, the banners, the Windfall and the haze, which write depth its glass does not (RAIN-OVER-GRASS's law) - and R14: the farthest from the view's own eye
    if (shared.poiEditor?.drawLines(proj, view)) renderer.markForeignPass();   // POI-3: the editor's boxes where the models stand, then its handles over everything (AUDIT POI R4: over the glass too, moved with it)
    drawFalling();   // RAIN-OVER-GRASS: after the grass and the banners, before the translucent bodies and the fires
    exteriorFoes.drawVeiledBodies();   // MWNPC5c: the concealed foes' bodies, beside the peers'
    cityGuards.drawVeiledBodies();   // MWNPC6: and the watch's
    navalCrew.drawVeiledBodies();   // MWNPC10: and a concealed owner's crew
    shared.livingRoads?.drawVeiledBodies();   // MWNPC13: and a road's ghosts
    folkStreet.drawVeiled();   // MWNPC7: and the walkers'
    drawVeiledPeerBodies();   // INVIS-LOOK: the concealed peers' bodies, translucent - after the opaque world, the flats and the grass
    hcc.drawVeiled3d();   // AUDIT COATS3D A5: and a concealed owner's 3D horses beside them
    // DUEL1: THE RINGS' WALLS - my own duel's, rising in and dying away, and every duel the cells around me say stands
    // (each once: both duellists say it). After the grass, from the view's own eye (mwv.eye, the bolts' law), fogged as
    // the ground is; a foreign pass.
    worldAddons.run('translucentDraw', proj, view, mwv.eye, now);
    if (duelWall) {
      const rings = duelRingsNow(dt);
      if (rings.length) {
        duelWall.draw(rings, proj, view, new Float32Array(mwv.eye), now / 1000,
          { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, color: renderer._fogColor, camPos: renderer._camPos, dw: renderer._dwFog, haze: renderer._haze, focus: renderer._focus });   // DW-C: the sea's fog with the frame's; AUDIT DEEP R-1: and the travel view's focus
        renderer.markForeignPass();
      }
    }
    // WB2: THE GATE'S FIRE AND BEACON - after the duel wall, the same eye and fog; the stone went in the world pass, so
    // the pillars in front of the fire hide it
    if (gatePool?.stands() && gatePool.drawPass(proj, view, new Float32Array(mwv.eye), now / 1000,   // AUDIT WB C7: its arguments built only when a gate stands
      { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, color: renderer._fogColor, camPos: renderer._camPos, focus: renderer._focus, haze: renderer._haze })) renderer.markForeignPass();   // AUDIT DEEP R-1: the travel view's focus
    // WB12d: the rite's pillar of smoke, the gate's fire's eye and fog - from the omen, before the gate stands
    if (riteHost?.smoking() && riteHost.drawSmoke(proj, view, new Float32Array(mwv.eye), now / 1000,   // AUDIT WB C7: its arguments built only while it shows
      { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, color: renderer._fogColor, camPos: renderer._camPos, focus: renderer._focus, haze: renderer._haze, light: (renderer._ambient[0] + renderer._ambient[1] + renderer._ambient[2]) / 3 + 0.6 * renderer._sunScale })) renderer.markForeignPass();   // AUDIT WB12d (G8): lit as the rain's curtains are
    // BUNNYFALL: a raid's smoke over its camps and the houses burning by them (scenes/raidMusterHost.js), the rite's eye and fog
    if (raidSmoke?.smoking() && raidSmoke.draw(proj, view, new Float32Array(mwv.eye), now / 1000,
      { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, color: renderer._fogColor, camPos: renderer._camPos, focus: renderer._focus, haze: renderer._haze, light: (renderer._ambient[0] + renderer._ambient[1] + renderer._ambient[2]) / 3 + 0.6 * renderer._sunScale })) renderer.markForeignPass();
    // BUNNYFALL: a staff event's pillar of purple light over its town (scenes/eventPillarHost.js), the same eye and fog
    if (eventPillar.showing() && eventPillar.draw(proj, view, new Float32Array(mwv.eye), now / 1000,
      { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, color: renderer._fogColor, camPos: renderer._camPos, focus: renderer._focus, haze: renderer._haze, light: (renderer._ambient[0] + renderer._ambient[1] + renderer._ambient[2]) / 3 + 0.6 * renderer._sunScale })) renderer.markForeignPass();
    // BUNNYFALL: the daily elite dungeons' crystals and glow (scenes/eliteDungeonHost.js), the same eye and fog
    if (eliteDungeonPresence.showing() && eliteDungeonPresence.draw(proj, view, new Float32Array(mwv.eye), now / 1000,
      { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, color: renderer._fogColor, camPos: renderer._camPos, focus: renderer._focus, haze: renderer._haze })) renderer.markForeignPass();
    // SD2c: THE HOLLOW'S OMEN - a Super dungeon's column of brass-gold light, after the gate's fire, the same eye and fog
    const sdo = sdHost ? sdOmenNow() : null;
    if (sdo && sdOmenPassOf()?.draw([sdo], proj, view, new Float32Array(mwv.eye), now / 1000,
      { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, color: renderer._fogColor, camPos: renderer._camPos, focus: renderer._focus, haze: renderer._haze })) renderer.markForeignPass();
    // STAR4: THE STARFALL'S SKY - the omens, the falls, the flashes and their rings, the beacons - the same eye and fog
    if (starfall?.showing() && starfall.drawSky(proj, view, new Float32Array(mwv.eye), now / 1000)) renderer.markForeignPass();
    // LOOT11 (the Loot arc): THE LINES OF LIGHT over my bodies and the street's piles holding a Rare or better - after the
    // gate's fire, the same eye and fog (scenes/lootLines.js: the nearest eight within 40 m)
    if (lootLines.draw(() => [...exteriorFoes.lootFinds(), ...droppedLoot.lootFinds()], proj, view, new Float32Array(mwv.eye), now / 1000,
      { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, color: renderer._fogColor, camPos: renderer._camPos, focus: renderer._focus, haze: renderer._haze })) renderer.markForeignPass();
    if (npcMarks.draw(proj, view, mwv.eye, streetPeople, now / 1000)) renderer.markForeignPass();   // NPC-MARKS: the marks over the street's people, after its flats
    // TV4 (bible/06-Systems/Travel-View.md): THE CURTAINS FROM ABOVE - the weather map's falling cells as veils stood in
    // the world, under the travel view alone (at the eye the sky map's own curtains stand on the horizon); the same
    // cells the clouds draw, at the shared minute (render/rainCurtains.js)
    const frameCurtains = () => {   // PERF-V8
    if (tvf && rainCurtains) {
      if (_tvFootMemo.gen !== tvGroundGenNow()) { _tvFootMemo.gen = shared.tvGroundGen; _tvFootMemo.map.clear(); }   // PERF-TV: the veils' lowest land, kept while the ground holds
      const curtains = curtainsOf(sky.drawnCells?.() ?? fieldCellsHere(), {   // AUDIT DEEP2 D3: the cells the sky DRAWS (picked, by quality) - never a veil under a clear sky
         focus: cam.pos, eye: mwv.eye, ground: player.feetAt()[1], groundAt: tvGroundAt, reach: renderer._fogMode === 1 ? renderer._fogRange[1] : undefined, memo: _tvFootMemo.map });   // AUDIT TV D3: the foot under the lowest land about the veil
      const lit = (renderer._ambient[0] + renderer._ambient[1] + renderer._ambient[2]) / 3 + 0.6 * renderer._sunScale;
      if (curtains.length && rainCurtains.draw(curtains, proj, view, mwv.eye, now / 1000,
        { light: lit, fade: Math.min(1, tvf.blend * 1.5), fog: { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, camPos: renderer._camPos, focus: renderer._focus, dw: renderer._dwFog, haze: renderer._haze } })) renderer.markForeignPass();
    }
    };
    frameCurtains();
  }
  return { frameAirPhase };
}
