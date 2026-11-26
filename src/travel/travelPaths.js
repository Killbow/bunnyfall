
import { DIR as NETWORK_DIR, MAP_W, MAP_H } from '../world/roadNetwork.js';
import {
  PATH_ROADS, PATH_TRACKS, N, NE, E, SE, S, SW, W, NW, MP_WORLD_UNITS, HALF_MP_WORLD_UNITS, T_SIZE, P_SIZE,
} from '../world/pathData.js';
export {
  PATH_ROADS, PATH_TRACKS, PATH_RIVERS, PATH_STREAMS, PATH_KEYS, N, NE, E, SE, S, SW, W, NW, DIRECTIONS, MP_WORLD_UNITS,
  HALF_MP_WORLD_UNITS, T_SIZE, P_SIZE, pathsDataPoint, roadsDataPoint, dataPoint,
} from '../world/pathData.js';

export function sameCompass() {
  return NETWORK_DIR.N === N && NETWORK_DIR.NE === NE && NETWORK_DIR.E === E && NETWORK_DIR.SE === SE
    && NETWORK_DIR.S === S && NETWORK_DIR.SW === SW && NETWORK_DIR.W === W && NETWORK_DIR.NW === NW;
}

export const MID_LO = HALF_MP_WORLD_UNITS - T_SIZE;
export const MID_HI = HALF_MP_WORLD_UNITS + T_SIZE;
export const ANG_UNIT = 22.5;

export const LOC_PAUSE_OFF = 0;
export const LOC_PAUSE_NEAR = 1;
export const LOC_PAUSE_ENTER = 2;

export const MAX_CIRCUMNAVIGATION_ACCEL = 15;

// Mirrors `mapPixelToWorldCoords` in world/streamingWorld.js, which this module cannot import because it reaches
// the renderer; keep the two mappings equal.
export function mapPixelWorldOrigin(mapPixelX, mapPixelY) {
  return { x: mapPixelX * MP_WORLD_UNITS, z: (MAP_H - 1 - mapPixelY) * MP_WORLD_UNITS };
}

export function normalisedYaw(yawDegrees, invert = false) {
  let yaw = (yawDegrees + (invert ? 180 : 0)) % 360;
  if (yaw < 0) yaw += 360;
  return yaw;
}

// Cardinal bands are inclusive and diagonal bands exclusive, as in the Travel Options mod, so exactly 22.5 degrees
// is N and not NE.
export function directionOfYaw(yaw) {
  if ((yaw >= 360 - ANG_UNIT && yaw <= 360) || (yaw >= 0 && yaw <= ANG_UNIT)) return N;
  if (yaw >= 90 - ANG_UNIT && yaw <= 90 + ANG_UNIT) return E;
  if (yaw >= 180 - ANG_UNIT && yaw <= 180 + ANG_UNIT) return S;
  if (yaw >= 270 - ANG_UNIT && yaw <= 270 + ANG_UNIT) return W;
  if (yaw > 45 - ANG_UNIT && yaw < 45 + ANG_UNIT) return NE;
  if (yaw > 135 - ANG_UNIT && yaw < 135 + ANG_UNIT) return SE;
  if (yaw > 225 - ANG_UNIT && yaw < 225 + ANG_UNIT) return SW;
  if (yaw > 315 - ANG_UNIT && yaw < 315 + ANG_UNIT) return NW;
  return 0;
}

export function targetPixel(direction, mapPixelX, mapPixelY) {
  switch (direction) {
    case N: return { x: mapPixelX, y: mapPixelY - 1 };
    case NE: return { x: mapPixelX + 1, y: mapPixelY - 1 };
    case E: return { x: mapPixelX + 1, y: mapPixelY };
    case SE: return { x: mapPixelX + 1, y: mapPixelY + 1 };
    case S: return { x: mapPixelX, y: mapPixelY + 1 };
    case SW: return { x: mapPixelX - 1, y: mapPixelY + 1 };
    case W: return { x: mapPixelX - 1, y: mapPixelY };
    case NW: return { x: mapPixelX - 1, y: mapPixelY - 1 };
    default: return { x: mapPixelX, y: mapPixelY };
  }
}

export function countSetBits(n) {
  let count = 0;
  let v = n & 0xff;
  while (v > 0) { count += v & 1; v >>= 1; }
  return count;
}

// N and S each test only the near edge of the middle band, as the Travel Options mod does, so a player inside the
// band is on both. `posInMpZ` is DFU's `posInMp.Y`.
export function playerOnPath(pathsDataPt, posInMpX, posInMpZ) {
  const data = pathsDataPt & 0xff;
  if (data === 0) return 0;
  let onPath = 0;
  if ((data & N) !== 0 && posInMpX > MID_LO && posInMpX < MID_HI && posInMpZ > MID_LO) onPath |= N;
  if ((data & E) !== 0 && posInMpZ > MID_LO && posInMpZ < MID_HI && posInMpX > MID_LO) onPath |= E;
  if ((data & S) !== 0 && posInMpX > MID_LO && posInMpX < MID_HI && posInMpZ < MID_HI) onPath |= S;
  if ((data & W) !== 0 && posInMpZ > MID_LO && posInMpZ < MID_HI && posInMpX < MID_HI) onPath |= W;
  if ((data & NE) !== 0 && Math.abs(posInMpX - posInMpZ) < P_SIZE && posInMpX > MID_LO) onPath |= NE;
  if ((data & SW) !== 0 && Math.abs(posInMpX - posInMpZ) < P_SIZE && posInMpX < MID_HI) onPath |= SW;
  if ((data & NW) !== 0 && Math.abs(posInMpX - (MP_WORLD_UNITS - posInMpZ)) < P_SIZE && posInMpX < MID_HI) onPath |= NW;
  if ((data & SE) !== 0 && Math.abs(posInMpX - (MP_WORLD_UNITS - posInMpZ)) < P_SIZE && posInMpX > MID_LO) onPath |= SE;
  return onPath;
}

export function playerOnPathAt(pathsDataPt, worldX, worldZ, mapPixelX, mapPixelY) {
  const origin = mapPixelWorldOrigin(mapPixelX, mapPixelY);
  return playerOnPath(pathsDataPt, worldX - origin.x, worldZ - origin.z);
}

// Copies the mod's junction search as written: the shift grows with the counter, so it skips directions. The result
// is the raw mask and can hold two bits when the search gives up.
export function nextPathDirection(pathsDataPt, playerDirection, fromDirection) {
  const data = pathsDataPt & 0xff;
  let dir = data & playerDirection;
  if (dir !== 0) return dir;
  let from = fromDirection & 0xff;
  let sc = 1;
  let clockwise = sc % 2 === 0;
  dir = (data ^ from) & 0xff;
  while (countSetBits(dir) !== 1 && sc < 9) {
    from = (clockwise ? from >> sc : from << sc) & 0xff;
    if (from === 0) from = clockwise ? 128 : 1;
    sc++;
    clockwise = sc % 2 === 0;
    dir = (data ^ from) & 0xff;
  }
  return dir;
}
