// The world's ground under the player: the terrain tile and foot position at a scene point, and
// the footstep machine. It also reads the exterior surface and whether that ground is a deck.
import { downProbe, exteriorSurfaces, rayDistanceFor } from '../player/exteriorSurface.js';
import { FootstepMachine } from '../audio/footsteps.js';
import { isOnFoot } from '../travel/transport.js';
import { mapPixelToWorldCoords, worldCoordToMapPixel } from './streamingWorld.js';
import { TERRAIN_TILE_DIM } from './terrainSurface.js';

/** @param {any} shared */
export function createGroundStepsWorld(shared) {
  const { built, cam, collider, heightAt, player, state, walkMode } = shared;
  /** FS1 (2026-08-28) - THE TILE UNDER THE PLAYER, which this host has
   *  wanted since the FS-slice: the footstep block's own comment says
   *  "the path/water tile arms ride the tile-under-player flag", and
   *  there was no flag to ride.
   *
   *  A terrain tile is 2 x WorldMapTileDim = 256 world units - the same
   *  step locationWorldRect walks when it shifts a pixel corner by the
   *  location's tile origin (streamingWorld.js:"const minX = origin.x"). Tile ROWS rise
   *  with z, which is why row 127 is north and row 0 south, derived
   *  from generateTileData.
   *
   *  Answers null off the built world - a pixel still streaming has no
   *  tilemap, and a caller must read that as "no information" rather
   *  than as any particular tile. */
  const TERRAIN_TILE_WORLD = 2 * TERRAIN_TILE_DIM;
  const playerGroundSample = () => groundSampleAt(walkMode ? player.pos : cam.pos);
  /** FIELD BUGS 2026-10-05 SHORE-CAST: playerGroundSample's own read at any scene point - the fishing cast's. */
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
    // MAC2: the feet's fraction inside the tile, the water pass's own frame (fract(vLocalXZ / tile))
    return { tile: built_.tilemap[tx + ty * TERRAIN_TILE_DIM], feet: [u - tx, v - ty] };
  };
  const playerGroundTile = () => playerGroundSample()?.tile ?? null;
  const footsteps = new FootstepMachine();   // FS-slice

  /** ROAD-B (b3): PlayerMotor.Update's three exterior surface reads,
   *  run together the way DFU runs them (:367-369) - one downward
   *  raycast from the controller centre plus one PlayerTileMapIndex.
   *
   *  The raycast is what stops a ship, a bridge or a levitating player
   *  from swimming while merely ABOVE water (:501-503), and the port's
   *  two surfaces map onto Unity's two straight across: the terrain is
   *  this host's `heightAt` floor (DaggerfallTerrain, no triangles),
   *  and every building and model is a collider mesh bucket (the
   *  StaticGeometry tag, GameObjectHelper.cs:430-435).
   *
   *  playerGroundTile above is the tilemap half and already carries
   *  the floating origin; it answers null off a built pixel, which
   *  playerTileMapIndex reads as DFU's -1. */
  const _SURFACE_DOWN = [0, -1, 0];
  /** SHIP-DECK: a collider bucket of a boat's or a sea ship's hull (csaSyncColliders' keys). */
  const isDeckBucket = (key) => typeof key === 'string' && key.startsWith('csaBoat:');
  const exteriorSurfaceNow = () => {
    const cy = player.pos[1] + player.height / 2;   // transform.position on a CharacterController
    const rayDistance = rayDistanceFor(isOnFoot(player.transportMode));
    const _ground = playerGroundSample();
    const _down = collider.raycastHit([player.pos[0], cy, player.pos[2]], _SURFACE_DOWN, rayDistance * 2);
    const surf = exteriorSurfaces({
      inside: false,
      rawTile: _ground?.tile ?? null,
      feet: _ground?.feet ?? null,   // MAC2: the player swims where the surface is drawn under the feet
      waterWalking: !!player.waterWalking,   // PlayerEntity.IsWaterWalking (:590)
      probe: downProbe({
        centreY: cy,
        terrainY: heightAt(player.pos[0], player.pos[2], true),   // DW-D: GetOnExteriorGroundMethod wants a DaggerfallTerrain - never the carved sea's floor (and the mod gates the terrain collider off over it)
        meshDist: _down.dist,
        rayDistance,
      }),
    });
    // SHIP-DECK: the model the feet stand on is a hull - a boat's or a sea ship's deck (the footsteps' wooden floor)
    surf.deck = surf.staticGeometry && isDeckBucket(_down.key);
    return surf;
  };
  return { exteriorSurfaceNow, footsteps, groundSampleAt, playerGroundTile };
}
