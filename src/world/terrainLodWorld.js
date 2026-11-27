// Terrain detail and ground sets for the world: the full and strided terrain indices with the far ring stride,
// the travel lookahead, and the ground archive tile sets. It also holds the neighbor draw of a border pixel,
// and the ground archive that owns a point there.
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
  const LOD_STRIDE = 4;
  const LOD_NEAR = 3;
  const lodOn = isEnhanced();
  const TERRAIN_INDICES_LOD = lodOn ? buildTerrainIndices(LOD_STRIDE) : null;
  const strideFor = (px, py) => ((lodOn
    && Math.max(Math.abs(px - shared.state.current.x), Math.abs(py - shared.state.current.y)) >= LOD_NEAR)
    ? LOD_STRIDE : 1);

  const TRAVEL_LOOKAHEAD = 64;
  const TRAVEL_LOOKAHEAD_MARGIN = 1.5;
  const travelLookahead = (dt, scale) => travelLookaheadFor({
    speed: shared.player?.speed ?? 0, dt, scale, maxFrameDt: MAX_FRAME_DT,
    floor: TRAVEL_LOOKAHEAD, margin: TRAVEL_LOOKAHEAD_MARGIN,
  });
  const { loadGroundSet } = createGroundSets({ renderer, getTexture, labGrass, breathe: () => shared.breather.breathe(), grassRecords, floorRecords, groundPuddles, groundMeanColour, groundDrawnMeans });
  // One build per pixel at a time: the in-flight map hands every caller the same promise.
  const inFlight = new Map();
  const ecoDraw = (p) => {
    const e = p.eco;
    if (!e) return null;
    for (let k = 0; k < 3; k++) {
      const a = e.archives[k];
      e.tex[k] = snowCover.arrayOf(a);
      if (a != null && !e.tex[k]) return null;
    }
    return e;
  };
  const borderGround = (p, x, z) => {
    const g = p.ecoGround;
    const [dx, dz] = ecotoneOwner(p.px, p.py, x, z, (ax, az) => g[(az + 1) * 3 + ax + 1]);
    return g[(dz + 1) * 3 + dx + 1];
  };
  return {
    TERRAIN_INDICES, TERRAIN_INDICES_LOD, borderGround, ecoDraw, inFlight, loadGroundSet, strideFor, travelLookahead,
  };
}
