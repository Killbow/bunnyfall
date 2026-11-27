// @ts-check
// Pure rules, Gothway Garden coordinates, multi-zone walkable bounds, and two-way portal math for The Bazaar Betwixt.

import { contentOn } from '../mods/contentOff.js';

export const bazaarBetwixtOn = () => contentOn('bazaarBetwixt');

export const BAZAAR_ROOM = Object.freeze({ mapId: 4_000_000_009, buildingKey: 77_000_002 });
export const BAZAAR_ROTUNDA_MODEL_ID = -38350;
export const BAZAAR_SPACE_MODEL_ID = -38351;

export const GOTHWAY_MAP_ID = 206728581;
export const GOTHWAY_REGION_INDEX = 17;
export const GOTHWAY_PIXEL = Object.freeze({ x: 109, y: 159 });
export const GOTHWAY_ENVOY_LOC = Object.freeze([167.2, 0, 263.6]);
export const GOTHWAY_TEAR_LOC = Object.freeze([169.0, 0, 266.0]);

export const BAZAAR_PORTAL_Z = -26.8;
export const BAZAAR_ENTER = /** @type {readonly [number, number, number]} */ (Object.freeze([0, 0, -25.4]));
export const BAZAAR_BRIDGE_Z0 = -23.6;
export const BAZAAR_BRIDGE_Z1 = -13.6;
export const BAZAAR_BRIDGE_HALF_W = 1.92;
export const BAZAAR_PLATFORM_RADIUS = 12.25;
export const BAZAAR_BASIN_RADIUS = 3.68;
export const BAZAAR_CELARUS_POS = /** @type {readonly [number, number, number]} */ (Object.freeze([0.0, 0.54, 9.2]));

export const BAZAAR_TEAR_HALF_W = 1.80;
export const BAZAAR_TEAR_HALF_H = 1.78;
export const BAZAAR_TEAR_CENTER_Y = 1.72;
export const BAZAAR_TEAR_PASS_HALF_W = 1.08;

export const BAZAAR_PORTAL_TOTAL_MS = 60_000;
export const BAZAAR_PORTAL_OPEN_MS = 2_250;
export const BAZAAR_PORTAL_CLOSE_MS = 1_300;
export const BAZAAR_PORTAL_PEER_REACH = 48;

export const BAZAAR_ENVOY = Object.freeze({ name: 'Valenis', record: 0, baseArchive: 177, baseRecord: 4 });
export const BAZAAR_MYSTIC = Object.freeze({
  name: 'Master Celarus',
  record: 1,
  baseArchive: 177,
  baseRecord: 4,
  height: 2.20,
});

export const BAZAAR_CRAG_SPECS = Object.freeze([
  Object.freeze({ pos: /** @type {readonly [number, number, number]} */ (Object.freeze([-13.4, 3.8, -18.8])), yaw: 1.32, scale: 0.92, phase: 0.0 }),
  Object.freeze({ pos: /** @type {readonly [number, number, number]} */ (Object.freeze([13.8, 4.6, -18.2])), yaw: -1.36, scale: 0.96, phase: 1.7 }),
  Object.freeze({ pos: /** @type {readonly [number, number, number]} */ (Object.freeze([-24.5, 5.2, 4.8])), yaw: 1.75, scale: 1.18, phase: 3.1 }),
  Object.freeze({ pos: /** @type {readonly [number, number, number]} */ (Object.freeze([25.2, 6.0, 6.4])), yaw: -1.82, scale: 1.22, phase: 4.6 }),
]);

export const BAZAAR_CAPSTONE_SPECS = Object.freeze([
  Object.freeze({ pos: /** @type {readonly [number, number, number]} */ (Object.freeze([-2.64, 7.06, -24.11])), scale: 0.42, phase: 0.0 }),
  Object.freeze({ pos: /** @type {readonly [number, number, number]} */ (Object.freeze([2.64, 7.06, -24.11])), scale: 0.42, phase: 1.6 }),
  Object.freeze({ pos: /** @type {readonly [number, number, number]} */ (Object.freeze([-4.62, 8.10, 9.78])), scale: 0.46, phase: 3.2 }),
  Object.freeze({ pos: /** @type {readonly [number, number, number]} */ (Object.freeze([4.62, 8.10, 9.78])), scale: 0.46, phase: 4.8 }),
]);

export const BAZAAR_VISTA_POS = /** @type {readonly [number, number, number]} */ (Object.freeze([51.0, -11.5, 166.0]));
export const BAZAAR_VISTA_YAW_DEG = -16;

const ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
const clamp01 = (/** @type {number} */ v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (/** @type {number} */ t) => t * t * (3 - 2 * t);

/** @param {number[]} tearScenePos */
export const bazaarOriginFromTear = (tearScenePos) => [
  tearScenePos[0],
  tearScenePos[1],
  tearScenePos[2] - BAZAAR_PORTAL_Z,
];

/** @param {number[]} bazaarOrigin */
export const bazaarTearFromOrigin = (bazaarOrigin) => [
  bazaarOrigin[0],
  bazaarOrigin[1],
  bazaarOrigin[2] + BAZAAR_PORTAL_Z,
];

/**
 * Clamp local horizontal coordinates `(dx, dz)` across the Arrival Crag, 10 m Hard-Light Causeway,
 * and 27.2 m Grand Rotunda while guiding feet cleanly around the Sunken Scrying Basin.
 * @param {number} dx
 * @param {number} dz
 * @returns {[number, number]}
 */
export function clampBazaarLocalXZ(dx, dz) {
  let x = dx, z = dz;
  if (z < -25.4 && Math.abs(x) <= 1.35) {
    return [x, Math.max(-28.4, z)];
  }
  if (z < BAZAAR_BRIDGE_Z0) {
    z = Math.max(-28.4, z);
    const t = clamp01((z - (-26.2)) / (BAZAAR_BRIDGE_Z0 - (-26.2)));
    const maxW = 3.55 + (1.72 - 3.55) * t;
    x = Math.max(-maxW, Math.min(maxW, x));
    return [x, z];
  }
  if (z < -12.85) {
    x = Math.max(-1.72, Math.min(1.72, x));
    return [x, z];
  }
  const r = Math.hypot(x, z);
  if (r > BAZAAR_PLATFORM_RADIUS) {
    if (z < -11.4 && Math.abs(x) <= 1.72) return [x, z];
    const k = BAZAAR_PLATFORM_RADIUS / r;
    x *= k;
    z *= k;
  } else if (r < BAZAAR_BASIN_RADIUS) {
    if (r < 1e-4) {
      x = BAZAAR_BASIN_RADIUS;
      z = 0;
    } else {
      const k = BAZAAR_BASIN_RADIUS / r;
      x *= k;
      z *= k;
    }
  }
  return [x, z];
}

/**
 * @param {number} elapsedMs
 * @param {number} [totalMs]
 */
export function bazaarPortalEnvelope(elapsedMs, totalMs = BAZAAR_PORTAL_TOTAL_MS) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= totalMs) {
    return { active: false, slashProgress: 0, openProgress: 0, veilMix: 1, sealing: false };
  }
  const rem = totalMs - elapsedMs;
  if (rem <= BAZAAR_PORTAL_CLOSE_MS) {
    const slashClose = smooth(clamp01(rem / 360));
    const widthClose = smooth(clamp01((rem - 340) / Math.max(1, BAZAAR_PORTAL_CLOSE_MS - 340)));
    return { active: true, slashProgress: slashClose, openProgress: widthClose, veilMix: 0, sealing: true };
  }
  const slashProgress = smooth(clamp01(elapsedMs / 620));
  const openProgress = smooth(clamp01((elapsedMs - 520) / Math.max(1, BAZAAR_PORTAL_OPEN_MS - 520)));
  return {
    active: true,
    slashProgress: elapsedMs >= 620 ? 1 : slashProgress,
    openProgress: elapsedMs >= BAZAAR_PORTAL_OPEN_MS ? 1 : openProgress,
    veilMix: 0,
    sealing: false,
  };
}

/**
 * @param {number[] | null} prevFeet
 * @param {number[] | null} currFeet
 * @param {number[] | null} tearPos
 * @param {number} gateYaw
 * @param {boolean} armed
 */
export function bazaarStepAcross(prevFeet, currFeet, tearPos, gateYaw, armed) {
  if (!currFeet || !tearPos) return { armed: false, crossed: false, arrivalFeet: null };
  const gFwdX = Math.sin(gateYaw), gFwdZ = Math.cos(gateYaw);
  const gRightX = Math.cos(gateYaw), gRightZ = -Math.sin(gateYaw);
  const dx = currFeet[0] - tearPos[0];
  const dy = currFeet[1] - tearPos[1];
  const dz = currFeet[2] - tearPos[2];
  const currF = dx * gFwdX + dz * gFwdZ;
  const currR = dx * gRightX + dz * gRightZ;

  if (!prevFeet || Math.hypot(currFeet[0] - prevFeet[0], currFeet[2] - prevFeet[2]) > 2.2 || Math.abs(dy) > 2.4) {
    return { armed: currF <= -0.46, crossed: false, arrivalFeet: null };
  }
  const nextArmed = armed || currF <= -0.46;
  const pdx = prevFeet[0] - tearPos[0], pdz = prevFeet[2] - tearPos[2];
  const prevF = pdx * gFwdX + pdz * gFwdZ;

  if (nextArmed && prevF < -0.24 && currF >= -0.24 && Math.abs(currR) <= BAZAAR_TEAR_PASS_HALF_W) {
    const pushF = Math.max(0.52, Math.min(0.72, currF + 0.78));
    return {
      armed: false,
      crossed: true,
      arrivalFeet: [
        tearPos[0] + gRightX * currR + gFwdX * pushF,
        tearPos[1],
        tearPos[2] + gRightZ * currR + gFwdZ * pushF,
      ],
    };
  }
  return { armed: currF > 0.25 ? false : nextArmed, crossed: false, arrivalFeet: null };
}

/** @param {number} timeSec @param {number} phase @param {boolean} [still] */
export const bazaarCragBobY = (timeSec, phase, still = false) => (
  still ? 0 : Math.sin(timeSec * 0.78 + phase) * 0.34
);

/** @param {number} timeSec @param {boolean} [still] */
export const bazaarDomePose = (timeSec, still = false) => ({
  y: still ? 0 : Math.sin(timeSec * 0.95) * 0.22,
  yawDeg: still ? 0 : (timeSec * 3.8) % 360,
});

/** @param {number} timeSec @param {boolean} [still] */
export function bazaarWaterfallState(timeSec, still = false) {
  if (still) return { rate: 0.15, stasis: 0.6 };
  const u = ((timeSec / 7.0) % 1 + 1) % 1;
  let stasis = 0;
  if (u >= 0.56 && u < 0.70) stasis = smooth((u - 0.56) / 0.14);
  else if (u >= 0.70 && u < 0.86) stasis = 1;
  else if (u >= 0.86) stasis = 1 - smooth((u - 0.86) / 0.14);
  return { rate: 1 - 0.96 * stasis, stasis };
}

/** @param {any} raw */
export function validBazaarPortalWord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.i !== 'string' || !ID_RE.test(raw.i)) return null;
  if (!Number.isFinite(raw.r) || raw.r <= 0 || raw.r > BAZAAR_PORTAL_TOTAL_MS) return null;
  return { i: raw.i, r: Math.round(raw.r) };
}
