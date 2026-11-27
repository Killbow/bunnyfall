// Whether a footprint is clear of the painted road network, in pixel-local native world units.

import { pathsDataPoint, MP_WORLD_UNITS, HALF_MP_WORLD_UNITS, P_SIZE, N, NE, E, SE, S, SW, W, NW } from './pathData.js';
import { MAP_W, MAP_H } from './roadNetwork.js';

export const PATH_HALF_WIDTH = P_SIZE / 2;
export const UNITS_PER_METRE = MP_WORLD_UNITS / 819.2;

export const WOD_PIECE_ROAD_CLEAR = 2 * UNITS_PER_METRE;
export const CAMP_ROAD_CLEAR_M = 4;

const SEGMENT_ENDS = Object.freeze([[N, 0, 1], [NE, 1, 1], [E, 1, 0], [SE, 1, -1], [S, 0, -1], [SW, -1, -1], [W, -1, 0], [NW, -1, 1]]);

export function segmentHitsRect(ax, az, bx, bz, x0, z0, x1, z1) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dz, az - z0) && clip(dz, z1 - az);
}

/**
 * @param {object} net
 */
export function boxNearPath(net, px, py, x0, z0, x1, z1, clearance = 0) {
  if (!net) return false;
  const g = PATH_HALF_WIDTH + clearance;
  const gx0 = x0 - g, gz0 = z0 - g, gx1 = x1 + g, gz1 = z1 + g;
  const ix0 = Math.max(-px, Math.floor(gx0 / MP_WORLD_UNITS)), ix1 = Math.min(MAP_W - 1 - px, Math.floor(gx1 / MP_WORLD_UNITS));
  const iz0 = Math.max(py - (MAP_H - 1), Math.floor(gz0 / MP_WORLD_UNITS)), iz1 = Math.min(py, Math.floor(gz1 / MP_WORLD_UNITS));
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const bits = pathsDataPoint(net, px + ix, py - iz);
      if (!bits) continue;
      const ox = ix * MP_WORLD_UNITS, oz = iz * MP_WORLD_UNITS;
      const cx = ox + HALF_MP_WORLD_UNITS, cz = oz + HALF_MP_WORLD_UNITS;
      for (const [bit, sx, sz] of SEGMENT_ENDS) {
        if ((bits & bit) && segmentHitsRect(cx, cz, cx + sx * HALF_MP_WORLD_UNITS, cz + sz * HALF_MP_WORLD_UNITS, gx0, gz0, gx1, gz1)) return true;
      }
    }
  }
  return false;
}

export const pointNearPath = (net, px, py, x, z, radius = 0) => boxNearPath(net, px, py, x, z, x, z, radius);

export const wodPiecewise = (prefabName) => /^WOD_(?:Rocks_(?!Cave)|Mountain_)/.test(String(prefabName ?? ''));

export const WOD_SITE_OBJECT_RADIUS_M = 8;

export function wodSiteFootprint(prefab, rect, tileMetres = 6.4) {
  let xMin = rect.x, xMax = rect.x + rect.width, yMin = rect.y, yMax = rect.y + rect.height;
  const m = WOD_SITE_OBJECT_RADIUS_M / tileMetres;
  for (const o of prefab?.obj ?? []) {
    const x = rect.x + o.pos.x / tileMetres, y = rect.y + o.pos.z / tileMetres;
    xMin = Math.min(xMin, Math.floor(x - m)); xMax = Math.max(xMax, Math.ceil(x + m));
    yMin = Math.min(yMin, Math.floor(y - m)); yMax = Math.max(yMax, Math.ceil(y + m));
  }
  return { xMin, xMax, yMin, yMax };
}

export function wodSiteClear(net, px, py, prefabName, prefab, rect, tileMetres = 6.4) {
  if (!net || wodPiecewise(prefabName)) return true;
  const r = WOD_SITE_OBJECT_RADIUS_M * UNITS_PER_METRE;
  for (const o of prefab?.obj ?? []) {
    const x = (rect.x * tileMetres + o.pos.x) * UNITS_PER_METRE;
    const z = (rect.y * tileMetres + o.pos.z) * UNITS_PER_METRE;
    if (pointNearPath(net, px, py, x, z, r)) return false;
  }
  return true;
}
