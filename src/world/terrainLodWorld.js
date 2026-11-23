// The world's terrain detail and ground sets: the full and strided terrain indices with the far
// ring's stride, the travel lookahead, and the ground archive tile sets. It also holds a border
// pixel's neighbour draw and the ground archive that owns a point there.
import { buildTerrainIndices } from './terrainSurface.js';
import { createGroundSets } from './groundSets.js';
import { ecotoneOwner } from './ecotone.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { MAX_FRAME_DT } from '../player/motor.js';
import { travelLookaheadFor } from '../travel/travelAutopilot.js';

/** @param {any} shared */
export function createTerrainLodWorld(shared) {
  const {
    floorRecords, getTexture, grassRecords, groundDrawnMeans, groundMeanColour, groundPuddles, labGrass, renderer,
    snowCover,
  } = shared;
  const TERRAIN_INDICES = buildTerrainIndices();
  // EV4: the far ring's strided twin - 33x33 plus its crack skirt, a
  // 16x triangle cut per pixel. Enhanced only: the 1:1 lane keeps full
  // resolution at every distance, exactly as DFU draws it. The ring
  // test reads the LIVE player pixel, so a pixel's class follows the
  // walk (restrideTerrain below swaps a built pixel's surface).
  const LOD_STRIDE = 4;
  const LOD_NEAR = 3;   // chebyshev distance where the far ring starts
  const lodOn = isEnhanced();
  const TERRAIN_INDICES_LOD = lodOn ? buildTerrainIndices(LOD_STRIDE) : null;   // AUDIT EV: the 1:1 lane never pays for the strided twin
  const strideFor = (px, py) => ((lodOn
    && Math.max(Math.abs(px - shared.state.current.x), Math.abs(py - shared.state.current.y)) >= LOD_NEAR)
    ? LOD_STRIDE : 1);

  // AUDIT EV F-SIM1 (2026-08-31): ONE build per pixel, ever in
  // flight. EV7 stretched a build across a worker round trip, which
  // opened an old microtask-thin window wide: a teleport (or a
  // leave-and-return crossing) re-enqueues a pixel whose build is
  // already flying - state.init marks the whole destination grid
  // loaded at enqueue time, so the in-flight publish survives the
  // audit-24 recheck AND the queue entry builds it again. The second
  // built.set overwrote the first entry: its terrain VAO, tilemap
  // texture and billboard batches leaked on the GPU for the session,
  // the collider bucket and door registry doubled, and a mill's hum
  // could orphan into an unstoppable loop. The cache answers a
  // finished pixel; the in-flight map answers a flying one with the
  // SAME promise, so every caller - pump, boot, teleport - shares one
  // build.
  /** TO-FIELD: how far ahead of the traveller the ground must exist
   *  before the journey's drive goes through - about ten tiles, far less
   *  than a map pixel, so the wait is a stutter at the edge of the built
   *  world rather than a stop.
   *
   *  AUDIT-FIELD F7: A FLOOR, NOT THE WHOLE DISTANCE. The first cut
   *  called 64 "more than the fastest accelerated step", which is true
   *  of a fixed physics STEP and false of a FRAME: the motor moves
   *  `speed * min(dt, MAX_FRAME_DT) * scale` in one go (motor.js:"if (!this.levitating)"),
   *  and the frame that hitches is exactly the frame in which the
   *  streamer is behind. A horse at the shipped default limit of sixty
   *  covers ~65 units in a 10 fps frame and ~120 at the mod's ceiling of
   *  a hundred - past a 64-unit probe, off the built world, and once the
   *  motor is airborne `airControl` is false (motor.js:"a Jump-buffed player") so zeroing
   *  the drive on the NEXT frame no longer steers: the fall is already
   *  paid for. `travelLookahead` measures the frame that is about to
   *  run instead, and keeps 64 as its floor. */
  const TRAVEL_LOOKAHEAD = 64;
  const TRAVEL_LOOKAHEAD_MARGIN = 1.5;
  const travelLookahead = (dt, scale) => travelLookaheadFor({
    speed: shared.player?.speed ?? 0, dt, scale, maxFrameDt: MAX_FRAME_DT,
    floor: TRAVEL_LOOKAHEAD, margin: TRAVEL_LOOKAHEAD_MARGIN,
  });
  /** R9: A GROUND ARCHIVE'S TILE SET, ready for a pixel's draw and its grass - held by the pixel's place (`hold`, its
   *  PLACE-LRU door), uploaded once (a texture mod's set first), the ground-sharpness tier on every cached set, and the
   *  grass's three tables learned. The pixel's own archive, and ECOTONE1's neighbours' at a climate border (the sets
   *  the ground's border samples - render/ecotoneGlsl.js). OW-HITCH (HOST-SPLIT): its home is scenes/groundSets.js -
   *  a set made a record a breath, uploaded a few layers a breath, once a key. Made before the stream's build state
   *  (`inFlight`, the breather below - asked at its breaths, never at the making). */
  const { loadGroundSet } = createGroundSets({ renderer, getTexture, labGrass, breathe: () => shared.breather.breathe(), grassRecords, floorRecords, groundPuddles, groundMeanColour, groundDrawnMeans });
  const inFlight = new Map();
  /** ECOTONE1: a border pixel's neighbours for its ground's draw (renderer.drawTerrain's `eco`) - their sets as the
   *  renderer holds them now. Null for a pixel with none, and while any of them is missing (the pixel's hold keeps them,
   *  so only a set dropped under a rebuild): the ground draws its own set alone then, as before the blend. */
  const ecoDraw = (p) => {
    const e = p.eco;
    if (!e) return null;
    for (let k = 0; k < 3; k++) {
      const a = e.archives[k];
      e.tex[k] = snowCover.arrayOf(a);   // PRECIP4: a twin on the snow lane
      if (a != null && !e.tex[k]) return null;
    }
    return e;
  };
  /** ECOTONE1: the ground archive that owns a border pixel's pixel-local point (metres) - the climate the ground's border
   *  gives it (world/ecotone.js ecotoneOwner over the pixel's 3x3, `ecoGround`), so a blade grows, and takes its colour,
   *  where the ground under it is drawn from. */
  const borderGround = (p, x, z) => {
    const g = p.ecoGround;
    const [dx, dz] = ecotoneOwner(p.px, p.py, x, z, (ax, az) => g[(az + 1) * 3 + ax + 1]);
    return g[(dz + 1) * 3 + dx + 1];
  };
  return {
    TERRAIN_INDICES, TERRAIN_INDICES_LOD, borderGround, ecoDraw, inFlight, loadGroundSet, strideFor, travelLookahead,
  };
}
