// The pixel kernel: the CPU side of buildPixel as one pure function, factored out in its inline order.
// It runs on a Worker (terrainGenClient.js, terrainGenWorker.js) or on the main thread as the fallback.
// The caller runs setLocationTiles first, so the tilemap and the rect enter the job as plain data.

import { generateSamples, ghostSampler, HEIGHTMAP_DIMENSION } from './terrainSampler.js';
import { buildTerrainGrid, convertTilemap } from './terrainSurface.js';
import { assignTiles, blendLocationTerrain, calcAvgMaxHeight, generateTileData } from './terrainTiles.js';
import { layoutNature } from './terrainNature.js';
import { jungleLayout, jungleWhole } from './jungleNature.js';
import { paintJungleTrails } from './jungle/jungleTrails.js';
import { paintRoads, smoothRoadHeights, pathCorners } from './roadPainter.js';
import { MAP_W } from './roadNetwork.js';
import { applyPicks } from './wodLocationLoader.js';
import { createLandforms } from './landforms.js';
import { waterBedOf, bedHalo, bedNearEdge } from './waterBed.js';

/**
 * @param {object} job
 * @param {object} job.woods
 * @param {number} job.px
 * @param {number} job.py
 * @param {number} [job.stride]
 * @param {Uint8Array} job.tilemap
 * @param {?object} job.locationRect
 * @param {boolean} job.hasLocation
 * @param {number} job.climateType
 * @param {?{picks:Array<{flatten:boolean, rect:object}>}} [job.wod]
 * @param {?{archive:number, hidden:boolean}} [job.forests]
 * @param {boolean} [job.landform]
 * @param {?Uint8Array} [job.sites]
 * @param {?Uint8Array} [job.climates]
 * @param {?{nine:number[], hidden?:boolean}} [job.jungle]
 * @param {?{nature:number[], type:number[]}} [job.ecotone]
 * @returns {{samples: Float32Array, tilemap: Uint8Array,
 *   positions: Float32Array, normals: Float32Array,
 *   tilemapBytes: Uint8Array, avg: number, paths: ?Uint8Array,
 *   nature: Array<{record:number,x:number,y:number,z:number}>, beach: ?Float32Array,
 *   roadside: Array<any>}}
 */
export function generatePixelTerrain({ woods, px, py, stride = 1, tilemap, locationRect = null, hasLocation = false, climateType, roads = null, sites = null, climates = null, wod = null, forests = null, landform = false, ecotone = null, bed = false, jungle = null }) {
  const landforms = landform ? createLandforms({ woods, roads, sites, climates }) : null;
  // Tiles are classified on DFU's own samples through DFU's own blend: landforms move the ground, never a tile.
  const classic = landforms && hasLocation ? new Float32Array(HEIGHTMAP_DIMENSION * HEIGHTMAP_DIMENSION) : null;
  const samples = generateSamples(woods, px, py, HEIGHTMAP_DIMENSION, landforms, classic);
  let avg = 0;
  if (hasLocation) {
    [avg] = calcAvgMaxHeight(samples);
    blendLocationTerrain(samples, avg, locationRect);
    if (classic) blendLocationTerrain(classic, calcAvgMaxHeight(classic)[0], locationRect);
  }
  // Roads paint after the ground is classified and before the marching squares run.
  const tileData = generateTileData(classic ?? samples, px, py);
  let paths = null;
  if (roads) {
    paths = new Uint8Array(tilemap.length);
    const i = py * MAP_W + px;
    const c = (m) => (m ? pathCorners(m, px, py, MAP_W) : 0);
    paintRoads(tileData, tilemap, roads.roads[i], roads.tracks[i], hasLocation ? locationRect : null, 129, {
      river: roads.rivers ? roads.rivers[i] : 0, stream: roads.streams ? roads.streams[i] : 0, water: !!roads.water,
      corners: { road: c(roads.roads), track: c(roads.tracks), river: c(roads.rivers), stream: c(roads.streams) },
      paths,
    });
    // Road smoothing runs after the paint and before the grid is built from the samples.
    if (roads.smooth !== false) smoothRoadHeights(samples, tilemap, 129, hasLocation ? locationRect : null);
    if (roads.smooth !== false && classic) smoothRoadHeights(classic, tilemap, 129, locationRect);
  }
  if (jungle) paths = paintJungleTrails(tileData, tilemap, paths, { px, py, nine: jungle.nine, whole: jungleWhole(jungle.nine), rect: hasLocation ? locationRect : null });
  assignTiles(tileData, tilemap, true);
  // World of Daggerfall smoothing runs after the tiles are assigned and before the nature layout.
  // Tiles keep the unflattened slope pattern; the grid, collision floor, and nature read the leveled ground.
  const wodResult = wod && wod.picks.length ? applyPicks(samples, wod.picks, hasLocation ? avg : 0) : null;
  if (classic && wodResult) applyPicks(classic, wod.picks);
  const tilemapBytes = convertTilemap(tilemap);
  const grid = restrideGrid({ woods, px, py, stride, samples, landforms, bed: bed ? tilemapBytes : null });
  const placesFor = (hidden) => [
    ...(hasLocation && locationRect ? [{ ...locationRect, hide: !!hidden }] : []),
    ...(wod?.picks ?? []).filter((p) => p.hide !== false).map(({ rect: r, bounds: b }) => (b
      ? { xMin: b.xMin, xMax: b.xMax, yMin: b.yMin, yMax: b.yMax, hide: true }
      : { xMin: r.x, xMax: r.x + r.width, yMin: r.y, yMax: r.y + r.height, hide: true })),
  ];
  const natureOpts = {
    mapPixelX: px,
    mapPixelY: py,
    rawWorldHeight: woods.getHeightMapValue(px, py),
    climateType,
    locationRect: wodResult?.locationRect ?? locationRect,
    forests: forests ? { archive: forests.archive, pois: placesFor(forests.hidden), paths } : null,
    ecotone,
    beach: classic,
  };
  const { flats: nature, pairs: roadside } = jungleLayout(jungle && jungleWhole(jungle.nine) ? [] : layoutNature(samples, tilemap, natureOpts), samples, tilemap,
    { ...natureOpts, jungle: jungle ? { nine: jungle.nine, pois: placesFor(jungle.hidden), paths, net: roads } : null });
  return { samples, tilemap, positions: grid.positions, normals: grid.normals, bed: grid.bed, tilemapBytes, avg, nature,
    paths,
    roadside,
    withRoads: !!roads,
    wodAverages: wodResult ? wodResult.averages : null,
    beach: classic,
  };
}

/**
 * @param {{ woods: object, px: number, py: number, stride?: number, samples: Float32Array, landform?: boolean, roads?: ?object, sites?: ?Uint8Array, climates?: ?Uint8Array, landforms?: ?object, bed?: ?Uint8Array }} job
 * @returns {{ positions: Float32Array, normals: Float32Array, bed: ?{depths: Float32Array, sheetDepths: Float32Array, positions: Float32Array, normals: Float32Array} }}
 */
export function restrideGrid({ woods, px, py, stride = 1, samples, landform = false, roads = null, sites = null, climates = null, landforms = null, bed = null }) {
  const lf = landforms ?? (landform ? createLandforms({ woods, roads, sites, climates }) : null);
  const ghost = ghostSampler(woods, px, py, HEIGHTMAP_DIMENSION, lf);
  const grid = buildTerrainGrid(samples, stride, ghost);
  const halo = bed && stride === 1 && bedNearEdge(bed) ? bedHalo(ghost, px, py) : null;
  return { positions: grid.positions, normals: grid.normals, bed: bed ? gridBed(grid, bed, stride, halo) : null };
}

export function gridBed(grid, bytes, stride = 1, halo = null) {
  const carved = waterBedOf(grid, bytes, { stride, halo });
  return carved ? { depths: carved.depths, sheetDepths: carved.sheetDepths, positions: carved.ground.positions, normals: carved.ground.normals, halo } : null;
}
