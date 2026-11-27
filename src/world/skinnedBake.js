// @ts-check
// Bakes a skinned mesh as Unity BakeMesh and RecalculateNormals do on FixDeformations' 0.1 s timer.
// The bake is in the renderer frame with its scale kept, as BakeMesh does in Unity 2019.4.

import { multiply } from './mat4.js';
import { mat4FromQuatPos } from './quat.js';

export const FIX_DEFORMATIONS_INTERVAL = Math.fround(0.1);

/**
 * @param {{ timer:number, interval?:number }} script
 * @param {number} deltaTime
 */
export function fixDeformationsTick(script, deltaTime) {
  const interval = script.interval != null ? Math.fround(script.interval) : FIX_DEFORMATIONS_INTERVAL;
  if (Math.fround(script.timer) > interval) { script.timer = 0; return true; }
  script.timer = Math.fround(Math.fround(script.timer) + Math.fround(deltaTime));
  return false;
}

function invertRigid(m) {
  const o = new Float32Array(16);
  o[0] = m[0]; o[1] = m[4]; o[2] = m[8];
  o[4] = m[1]; o[5] = m[5]; o[6] = m[9];
  o[8] = m[2]; o[9] = m[6]; o[10] = m[10];
  o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]);
  o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]);
  o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
  o[15] = 1;
  return o;
}

/**
 * @param {{ positions: Float32Array, blendIndices: Uint16Array|null, vertexCount:number }} geometry
 * @param {Float32Array[]} boneWorld
 * @param {Float32Array[]} bindPoses
 * @param {{ position:number[], rotation:number[] }} renderer
 * @param {Float32Array} [out]
 */
export function bakeSkinnedMesh(geometry, boneWorld, bindPoses, renderer, out = new Float32Array(geometry.vertexCount * 3)) {
  const toLocal = invertRigid(mat4FromQuatPos(renderer.rotation, renderer.position));
  const skin = boneWorld.map((b, i) => multiply(toLocal, multiply(b, bindPoses[i], new Float32Array(16)), new Float32Array(16)));
  const p = geometry.positions, bi = geometry.blendIndices;
  for (let v = 0; v < geometry.vertexCount; v++) {
    const m = skin[bi ? bi[v] : 0];
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
    // A bone the rig lacks leaves the vertex at zero, as Unity skins with no matrix.
    if (!m) { out[v * 3] = 0; out[v * 3 + 1] = 0; out[v * 3 + 2] = 0; continue; }
    out[v * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[v * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return out;
}

/**
 * @param {Float32Array} positions
 * @param {Uint32Array} indices
 * @param {{ startIndex:number, primitiveCount:number }[]} subMeshes
 * @param {Float32Array} [out]
 */
export function recalculateNormals(positions, indices, subMeshes, out = new Float32Array(positions.length)) {
  const acc = new Float64Array(positions.length);
  for (const sm of subMeshes) {
    for (let t = 0; t < sm.primitiveCount; t++) {
      const i0 = indices[sm.startIndex + t * 3], i1 = indices[sm.startIndex + t * 3 + 1], i2 = indices[sm.startIndex + t * 3 + 2];
      const ax = positions[i0 * 3], ay = positions[i0 * 3 + 1], az = positions[i0 * 3 + 2];
      const ux = positions[i1 * 3] - ax, uy = positions[i1 * 3 + 1] - ay, uz = positions[i1 * 3 + 2] - az;
      const vx = positions[i2 * 3] - ax, vy = positions[i2 * 3 + 1] - ay, vz = positions[i2 * 3 + 2] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const i of [i0, i1, i2]) { acc[i * 3] += nx; acc[i * 3 + 1] += ny; acc[i * 3 + 2] += nz; }
    }
  }
  for (let v = 0; v < positions.length; v += 3) {
    const l = Math.hypot(acc[v], acc[v + 1], acc[v + 2]);
    if (l > 0) { out[v] = acc[v] / l; out[v + 1] = acc[v + 1] / l; out[v + 2] = acc[v + 2] / l; }
    else { out[v] = 0; out[v + 1] = 0; out[v + 2] = 0; }
  }
  return out;
}
