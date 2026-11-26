import {
  DEFAULT_TERRAIN_SCALE, HEIGHTMAP_DIMENSION, STREAMING_TERRAIN_SCALE, TERRAIN_SIZE,
} from './terrainSampler.js';
import { landformLiftField } from './landforms.js';
import { MAP_HEIGHT, MAP_WIDTH } from '../formats/woodsFile.js';
import { setLocationTiles } from './terrainTiles.js';

/** @param {any} shared */
export function createLandformLiftWorld(shared) {
  const { _liftLocationAt, blocks, built, heightAt, heightCell, landform, landformsHere, maps, terrainGen } = shared;
  // For a pixel not built yet the rect comes from setLocationTiles, the same rect the build will stamp, so records
  // loaded before streaming land on leveled ground.
  const LIFT_FIELDS_KEPT = 32;
  const _liftFields = new Map();
  const _liftRects = new Map();
  const landformLiftAt = (x, z) => {
    const c = shared.state.compensation;
    const px = shared.state.mapOrigin.x + Math.floor((x - c[0]) / TERRAIN_SIZE);
    const py = shared.state.mapOrigin.y - Math.floor((z - c[2]) / TERRAIN_SIZE);
    if (!shared.woods || px < 0 || py < 0 || px >= MAP_WIDTH || py >= MAP_HEIGHT) return 0;
    const t = shared.state.pixelTranslation(px, py);
    const at = built.get(`${px},${py}`);
    let rect = at ? at.locationRect ?? null : null;
    if (!at) {
      const loc = _liftLocationAt(px, py), had = _liftRects.get(`${px},${py}`);
      if (had && had.loc === loc) rect = had.rect;
      else {
        if (loc?.exterior?.exteriorData && loc.mapTableData) rect = setLocationTiles(loc, maps, blocks, new Uint8Array(128 * 128)) ?? null;
        _liftRects.delete(`${px},${py}`);
        if (_liftRects.size >= LIFT_FIELDS_KEPT) _liftRects.delete(_liftRects.keys().next().value);
        _liftRects.set(`${px},${py}`, { loc, rect });
      }
    }
    const key = `${px},${py},${rect ? `${rect.xMin},${rect.xMax},${rect.yMin},${rect.yMax}` : '-'},${terrainGen.roads() ? 1 : 0}`;
    let field = _liftFields.get(key);
    if (field) _liftFields.delete(key);
    else {
      if (_liftFields.size >= LIFT_FIELDS_KEPT) _liftFields.delete(_liftFields.keys().next().value);
      field = landformLiftField(shared.woods, px, py, rect, HEIGHTMAP_DIMENSION, landformsHere());
    }
    _liftFields.set(key, field);
    return field((x - t[0]) / heightCell, (z - t[2]) / heightCell) * STREAMING_TERRAIN_SCALE;
  };
  // Record heights are saved without the landform lift, so builds without landforms read them unchanged;
  // restandHeight adds the lift back.
  const groundFrameHeight = (y, x, z) => (landform && Number.isFinite(y) ? y - landformLiftAt(x, z) : y);
  const groundFrameNative = (nx, nz, y) => {
    if (!landform) return y;
    const [x, z] = shared.state.localFromWorld(nx, nz);
    return groundFrameHeight(y, x, z);
  };
  // Height is linear in terrain scale, so a height saved under `was` keeps its offset: y' = y - ground'(x, z) *
  // (was / now - 1). Unbuilt ground uses y * now / was.
  const restandHeight = (y, x, z, was) => {
    if ((!(was > 0) || was === STREAMING_TERRAIN_SCALE) && !landform) return y;
    if (!Number.isFinite(y)) return y;
    const now = landform ? landformLiftAt(x, z) : 0;
    const r = was > 0 ? was / STREAMING_TERRAIN_SCALE : 1;
    const h = heightAt(x, z);
    if (Number.isFinite(h)) return y - (h - shared.state.compensation[1] - now) * (r - 1) + now;
    return y * (was > 0 ? STREAMING_TERRAIN_SCALE / was : 1) + now;
  };
  // A record without a scale stamp predates the stamp and was written under DEFAULT_TERRAIN_SCALE, not today's
  // scale.
  const scaleOf = (stamp) => (stamp > 0 ? stamp : DEFAULT_TERRAIN_SCALE);
  // Doors register in pixel-local coordinates at build and are tested against the live world translation.
  const buildingDoors = [];
  return { buildingDoors, groundFrameHeight, groundFrameNative, restandHeight, scaleOf };
}
