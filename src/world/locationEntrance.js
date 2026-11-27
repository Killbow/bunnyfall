import { RMB_SIDE } from './locationLayout.js';

export const RMB_TILE_SIDE = RMB_SIDE / 16;

export const EXTRA_DISTANCE = RMB_SIDE * 0.1;

// Classic editor flat record 10 is a start marker; record 8 is an enter marker.
import { EDITOR_FLATS_ARCHIVE } from './rmbFlats.js';
export { EDITOR_FLATS_ARCHIVE };
export const START_MARKER_RECORD = 10;

// Indexed in classic side order (0 north, 1 south, 2 east, 3 west), each facing back into the location. Classic yaw
// 0 looks down +z, so the degrees carry over unchanged.
export const LOCATION_SIDES = Object.freeze([
  Object.freeze({ name: 'north', dx: 0, dz: 1, facing: 180 }),
  Object.freeze({ name: 'south', dx: 0, dz: -1, facing: 0 }),
  Object.freeze({ name: 'east', dx: 1, dz: 0, facing: 270 }),
  Object.freeze({ name: 'west', dx: -1, dz: 0, facing: 90 }),
]);

/**
 * @param {Array<{originX:number,originZ:number,flats:Array<{archive:number,record:number,x:number,y:number,z:number}>}>} blocks
 * @returns {Array<[number,number,number]>}
 */
export function locationStartMarkers(blocks) {
  const out = [];
  for (const b of blocks ?? []) {
    for (const f of b.flats ?? []) {
      if (f.archive !== EDITOR_FLATS_ARCHIVE || f.record !== START_MARKER_RECORD) continue;
      out.push([f.x + (b.originX ?? 0), f.y ?? 0, f.z + (b.originZ ?? 0)]);
    }
  }
  return out;
}

/**
 * `travelStart` is the position cached before the teleport and `worldPos` is already the destination; with either
 * missing, the side is a uniform pick.
 * @returns {number}
 */
export function pickLocationSide({ travelStart = null, worldPos = null, roll = Math.random } = {}) {
  const rnd = (n) => Math.min(n - 1, Math.floor(roll() * n));
  if (travelStart?.x == null || travelStart?.z == null || worldPos?.x == null || worldPos?.z == null) {
    return rnd(4);
  }
  // Classic player world coordinates are integers, so both positions truncate before the delta.
  const worldDeltaX = Math.trunc(worldPos.x) - Math.trunc(travelStart.x);
  const worldDeltaZ = Math.trunc(worldPos.z) - Math.trunc(travelStart.z);
  if (worldDeltaX === 0 && worldDeltaZ === 0) return rnd(4);
  const px = Math.abs(worldDeltaX);
  const pz = Math.abs(worldDeltaZ);
  const random = rnd(px + pz);
  if (px > pz) {
    if (random < px) return worldDeltaX > 0 ? 3 : 2;
    return worldDeltaZ > 0 ? 1 : 0;
  }
  if (random < pz) return worldDeltaZ > 0 ? 1 : 0;
  return worldDeltaX > 0 ? 3 : 2;
}

/**
 * @param {object} opts
 * @param {number} opts.mapWidth
 * @param {number} opts.mapHeight
 * @param {[number,number,number]} [opts.origin]
 * @param {Array<[number,number,number]>} [opts.startMarkers]
 * @param {boolean} [opts.useNearestStartMarker]
 * @param {{x:number,z:number}} [opts.travelStart]
 * @param {{x:number,z:number}} [opts.worldPos]
 * @param {Function} [opts.roll]
 * @returns {{pos:[number,number,number], yaw:number, side:string, usedStartMarker:boolean, edge:[number,number,number]}}
 */
export function positionPlayerToLocation({
  mapWidth, mapHeight,
  origin = [0, 0, 0],
  startMarkers = [],
  useNearestStartMarker = false,
  travelStart = null,
  worldPos = null,
  roll = Math.random,
} = {}) {
  const side = LOCATION_SIDES[pickLocationSide({ travelStart, worldPos, roll })];

  const halfWidth = mapWidth * 0.5 * RMB_SIDE;
  const halfHeight = mapHeight * 0.5 * RMB_SIDE;
  const centre = [origin[0] + halfWidth, origin[1], origin[2] + halfHeight];

  const out = [
    centre[0] + side.dx * (halfWidth + EXTRA_DISTANCE),
    centre[1],
    centre[2] + side.dz * (halfHeight + EXTRA_DISTANCE),
  ];
  const yaw = (side.facing * Math.PI) / 180;

  // The nearest marker is measured in 3D from the outside point, not from the location center.
  if (useNearestStartMarker && startMarkers.length) {
    let best = null, bestDist = Infinity;
    for (const m of startMarkers) {
      const world = [m[0] + origin[0], m[1] + origin[1], m[2] + origin[2]];
      const d = Math.hypot(world[0] - out[0], world[1] - out[1], world[2] - out[2]);
      if (d < bestDist) { bestDist = d; best = world; }
    }
    if (best) return { pos: [best[0], best[1], best[2]], yaw, side: side.name, usedStartMarker: true, edge: out };
  }
  return { pos: out, yaw, side: side.name, usedStartMarker: false, edge: out };
}

export const LOCATION_TYPE_TOWN_CITY = 0;
export const LOCATION_TYPE_HOME_YOUR_SHIPS = 14;

export function entranceOptionsForLocationType(locationType) {
  return {
    useNearestStartMarker: locationType === LOCATION_TYPE_TOWN_CITY
      || locationType === LOCATION_TYPE_HOME_YOUR_SHIPS,
    grounded: locationType !== LOCATION_TYPE_HOME_YOUR_SHIPS,
  };
}

/**
 * @param {object} dfLocation
 * @param {object} [opts]
 * @returns {{pos:[number,number,number], yaw:number, side:string, usedStartMarker:boolean, grounded:boolean}|null}
 */
export function locationArrivalLanding(dfLocation, { origin, startMarkers = [], travelStart = null, worldPos = null, roll } = {}) {
  const ext = dfLocation?.exterior?.exteriorData;
  if (!ext) return null;
  const opts = entranceOptionsForLocationType(dfLocation.mapTableData?.locationType ?? 0);
  const at = positionPlayerToLocation({
    mapWidth: ext.width,
    mapHeight: ext.height,
    origin,
    startMarkers,
    useNearestStartMarker: opts.useNearestStartMarker,
    travelStart,
    worldPos,
    ...(roll ? { roll } : {}),
  });
  return { ...at, grounded: opts.grounded };
}
