// Windmill turn: what makes the blades go round.

import { getPref } from '../ui/uiPrefs.js';
import { WINDMILLS_KEY } from '../mods/features.js';

export const windmillsOn = () => !!getPref(WINDMILLS_KEY);

import { BODY, CLIMATE_SKINS, SKIN_SLOTS } from './windmillMesh.js';
import { WIND_ROW_CALM, WIND_ROW_FAIR } from '../weather/wind.js';
import { multiply, trs, quatToMat4, transformPoint } from './mat4.js';
import { SOUND } from '../audio/soundClips.js';

export const ROTOR_AXIS = 'z';
export const ROTOR_SIGN = -1;

export const MILL_SOUND = Object.freeze({
  clip: SOUND.ArenaFireDaemon,
  volume: 1,
  refDistance: 1,
  maxDistance: 500,
  distanceModel: 'inverse',
});

export function millSoundPosition(modelMatrix) {
  return transformPoint(modelMatrix, ROTOR_HUB[0], ROTOR_HUB[1], ROTOR_HUB[2]);
}

export const CALM_ROTOR_DEG_PER_SEC = 13;

export const STALL_WIND = WIND_ROW_CALM;
export const FURL_DEG_PER_SEC = 40;

export function windSpeed(wind) {
  if (!wind) return 0;
  return Math.hypot(wind[0], wind[1]);
}

export const ROTOR_GAIN =
  CALM_ROTOR_DEG_PER_SEC / (WIND_ROW_FAIR - STALL_WIND);

export function rotorRate(wind) {
  const over = windSpeed(wind) - STALL_WIND;
  if (over <= 0) return 0;
  return Math.min(over * ROTOR_GAIN, FURL_DEG_PER_SEC);
}

export function rotorPhase(x, z) {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return (h - Math.floor(h)) * 360;
}

/**
 * @param {{angle: number}} state
 * @param {number} dt
 * @param {number[]} wind
 * @returns {number}
 */
export function advanceRotor(state, dt, wind) {
  const step = rotorRate(wind) * Math.max(0, dt || 0);
  const next = (state.angle + step) % 360;
  state.angle = next < 0 ? next + 360 : next;
  return state.angle;
}

export const ROTOR_HUB = Object.freeze([3.96, 6.01, -5.5]);

export function mountRotor(modelMatrix, hub, angleDeg, axis = ROTOR_AXIS) {
  const a = ROTOR_SIGN * angleDeg;
  const rot = axis === 'x' ? trs(0, 0, 0, a, 0, 0)
    : axis === 'y' ? trs(0, 0, 0, 0, a, 0)
      : trs(0, 0, 0, 0, 0, a);
  return multiply(modelMatrix, multiply(trs(hub[0], hub[1], hub[2], 0, 0, 0), rot));
}

/**
 * @param {Float32Array} modelMatrix
 * @param {number[]} hub
 * @param {number} angleDeg
 * @param {string} [axis]
 */
export function rotorMatrix(modelMatrix, hub, angleDeg, axis = ROTOR_AXIS) {
  const a = ROTOR_SIGN * angleDeg;
  const rot = axis === 'x' ? trs(0, 0, 0, a, 0, 0)
    : axis === 'y' ? trs(0, 0, 0, 0, a, 0)
      : trs(0, 0, 0, 0, 0, a);
  const [hx, hy, hz] = hub;
  const spin = multiply(trs(hx, hy, hz, 0, 0, 0),
    multiply(rot, trs(-hx, -hy, -hz, 0, 0, 0)));
  return multiply(modelMatrix, spin);
}

/**
 * @param {Float32Array} parentMatrix
 * @param {{position: number[], rotation: number[], axis: string}} child
 * @param {number} angleDeg
 */
export function mountMachineryChild(parentMatrix, child, angleDeg) {
  const [px, py, pz] = child.position;
  const rot = child.axis === 'x' ? trs(0, 0, 0, angleDeg, 0, 0)
    : child.axis === 'y' ? trs(0, 0, 0, 0, angleDeg, 0)
      : trs(0, 0, 0, 0, 0, angleDeg);
  const stand = quatToMat4(child.rotation);
  stand[12] = px; stand[13] = py; stand[14] = pz;
  return multiply(parentMatrix, multiply(stand, rot));
}

export function machineryChildPos(parentMatrix, child) {
  return transformPoint(parentMatrix, child.position[0], child.position[1], child.position[2]);
}

/**
 * @param {{angle: number}} state
 * @param {number} dt
 * @param {{degPerSec: number}} child
 */
export function advanceMachinery(state, dt, child) {
  state.angle = ((state.angle + child.degPerSec * dt) % 360 + 360) % 360;
  return state.angle;
}

/**
 * @param {number} climateBase
 * @param {boolean} isWinter
 */
export function skinnedBody(climateBase, isWinter) {
  const skin = CLIMATE_SKINS.get(climateBase);
  if (!skin) return BODY;
  const walls = isWinter ? skin.winterWalls : skin.walls;
  const roof = isWinter ? skin.winterRoof : skin.roof;
  const subMeshes = BODY.subMeshes.map((sm, i) => {
    const swap = i === SKIN_SLOTS.walls ? walls : i === SKIN_SLOTS.roof ? roof : null;
    return swap ? { ...sm, textureArchive: swap[0], textureRecord: swap[1] } : sm;
  });
  return { ...BODY, subMeshes };
}
