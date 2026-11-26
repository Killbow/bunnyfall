import { downProbe, exteriorSurfaces, rayDistanceFor } from '../player/exteriorSurface.js';
import { FootstepMachine } from '../audio/footsteps.js';
import { isOnFoot } from '../travel/transport.js';
import { mapPixelToWorldCoords, worldCoordToMapPixel } from './streamingWorld.js';
import { TERRAIN_TILE_DIM } from './terrainSurface.js';

/** @param {any} shared */
export function createGroundStepsWorld(shared) {
  const { built, cam, collider, heightAt, player, state, walkMode } = shared;
  // A terrain tile is 256 world units and tile rows rise with z, so row 127 is north. Returns null on a pixel still
  // streaming, which callers must treat as no information.
  const TERRAIN_TILE_WORLD = 2 * TERRAIN_TILE_DIM;
  const playerGroundSample = () => groundSampleAt(walkMode ? player.pos : cam.pos);
  const groundSampleAt = (pos) => {
    const wc = state.worldCoords(pos);
    const p = worldCoordToMapPixel(wc.x, wc.z);
    const built_ = built.get(`${p.x},${p.y}`);
    if (!built_?.tilemap) return null;
    const origin = mapPixelToWorldCoords(p.x, p.y);
    const u = (wc.x - origin.x) / TERRAIN_TILE_WORLD, v = (wc.z - origin.z) / TERRAIN_TILE_WORLD;
    const tx = Math.floor(u);
    const ty = Math.floor(v);
    if (tx < 0 || ty < 0 || tx >= TERRAIN_TILE_DIM || ty >= TERRAIN_TILE_DIM) return null;
    // `feet` uses the water pass's frame, `fract(vLocalXZ / tile)`, so swimming matches the drawn surface.
    return { tile: built_.tilemap[tx + ty * TERRAIN_TILE_DIM], feet: [u - tx, v - ty] };
  };
  const playerGroundTile = () => playerGroundSample()?.tile ?? null;
  const footsteps = new FootstepMachine();

  // Matches DFU `PlayerMotor`: one downward ray from the controller center plus the tilemap index, where a null
  // tile reads as -1. The ray keeps a player on a ship or bridge from swimming above water.
  const _SURFACE_DOWN = [0, -1, 0];
  const isDeckBucket = (key) => typeof key === 'string' && key.startsWith('csaBoat:');
  const exteriorSurfaceNow = () => {
    const cy = player.pos[1] + player.height / 2;
    const rayDistance = rayDistanceFor(isOnFoot(player.transportMode));
    const _ground = playerGroundSample();
    const _down = collider.raycastHit([player.pos[0], cy, player.pos[2]], _SURFACE_DOWN, rayDistance * 2);
    const surf = exteriorSurfaces({
      inside: false,
      rawTile: _ground?.tile ?? null,
      feet: _ground?.feet ?? null,
      waterWalking: !!player.waterWalking,
      probe: downProbe({
        centreY: cy,
        // Terrain only: a carved sea cell reads as -Infinity, because the DFU ground check counts only terrain,
        // never the sea floor mesh.
        terrainY: heightAt(player.pos[0], player.pos[2], true),
        meshDist: _down.dist,
        rayDistance,
      }),
    });
    surf.deck = surf.staticGeometry && isDeckBucket(_down.key);
    return surf;
  };
  return { exteriorSurfaceNow, footsteps, groundSampleAt, playerGroundTile };
}
