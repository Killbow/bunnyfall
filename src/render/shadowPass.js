// @ts-check
// Enhanced Lighting shadow pass. The renderer has no scene graph, so this records each world draw and replays the
// list depth-only from the light at the start of the next frame, before its clear. The depth programs are the
// renderer's own vertex shaders, handed over at construction, so this module imports nothing of the renderer.

import { lookAt, multiply, ortho, perspective } from '../world/mat4.js';
import { spherePlanes, transformSphere, matrixScale, transformSphereScaled, recordVisible, subMeshVisible, batchVisible, sphereInPlanes, batchSphere, ZERO_ORIGIN, placementRadius, placedHalfDiagonal, placementsInCube, placementsInCubeOf, placementsInVolume, placementsInVolumeOf, volumeName } from './bounds.js';
import { billboardKey } from './billboardKey.js';
import { aabbOutside } from './frustum.js';
import { getPref } from '../ui/uiPrefs.js';
import { AIR_TUNING } from './airPass.js';
import { pageParam } from '../platform/pageQuery.js';
import { BAYER_GLSL, DISSOLVE_GLSL } from './orderedDither.js';
import { windfallLawOn, swayShare, windfallLeanMax, windfallAnchorAfterShift } from './windfallSway.js';
import { SKIN_PALETTE_UNIT } from './skinPalette.js';
import { meterFor } from './perfMeter.js';
import { spheresTouch, foldSignature, LoLampSignatures } from './shadowSignatures.js';
import { NO_LIGHT_ID } from './lightId.js';

export const SHADOW_SUN_SIZE = 2048;
export const SHADOW_POINT_SIZE = 512;
export const SHADOW_POINT_CASTERS = 12;
// Must equal enhancedLighting.js EL_MAX_LIGHTS.
export const SHADOW_CASTER_TABLE = 48;
export const SHADOW_FAR_CASCADE_EVERY = 2;
export const SHADOW_FAR_CASTER_EVERY = 3;
// The far plane is rounded up to this quantum. The matrices, the change test, and pointParams all use the rounded
// value, so the map matches the shader and a flickering range does not rebuild every cube each frame.
export const SHADOW_FAR_QUANTUM = 4;
export const shadowFarFor = (far) => Math.ceil(far / SHADOW_FAR_QUANTUM) * SHADOW_FAR_QUANTUM;
// A slot keeps the far its map was drawn to while the range stays within it and less than SHADOW_FAR_HOLD short.
// A flicker across a quantum then does not rebuild the map, and the far is never inside the lamp's reach.
export const SHADOW_FAR_HOLD = 2 * SHADOW_FAR_QUANTUM;
export const heldShadowFar = (held, range) => (held >= range && held - range < SHADOW_FAR_HOLD ? held : shadowFarFor(range));
// Caster table word: the slot in the low byte, and for a lo slot the far of its map in quanta above it. The shader
// cannot derive that far from the live range.
export const SHADOW_CASTER_FAR_SHIFT = 8;
export const casterWord = (slot, far) => slot | ((far / SHADOW_FAR_QUANTUM) << SHADOW_CASTER_FAR_SHIFT);
export const SHADOW_NEAR_CASTERS = 2;
export const SHADOW_CASCADES = Object.freeze([12, 48, 240]);
// Cascades from this index outward take one hardware PCF tap instead of the 3x3 kernel; farther ones are coarser.
export const SHADOW_PCF_CASCADES = 2;
export const SUN_FLAT_REACH_TEXELS = 2.5;
export const SUN_CASCADE_BAND = 0.2;
export const SHADOW_SUN_DEPTH = 600;
export const SHADOW_VIEW_SCALE = 4;
export const SHADOW_MIN_SUN_Y = 0.05;
export const SHADOW_POINT_NEAR = 0.1;
// A carried light is excluded from casting by its `carried` flag, never by its distance to the camera.
// A light with a range past this is a storm flash, never a caster.
export const SHADOW_CASTER_MAX_RANGE = 120;
export const SHADOW_NO_CAST_ARCHIVES = Object.freeze(new Set([216]));
export const SHADOW_FLAT_MIN_HEIGHT = 0.5;
// Measured on the sprite (the batch's `size`), not the batch sphere; four texels leaves the near cascades alone.
export const SHADOW_FLAT_MIN_TEXELS = 4;
export const SHADOW_CASCADE_MIN_RADIUS_TEXELS = 2;
// Sun bias is in ortho box depth [0,1], and lantern bias is in world units off the major axis, because cube depth
// is hyperbolic.
export const SHADOW_SUN_BIAS = 0.00005;
export const SHADOW_POINT_BIAS = 0.04;
export const SHADOW_SUN_UNIT = 13;
export const SHADOW_POINT_UNIT = 14;
// Flame flats cast from the sun, never from a lantern: drawn from their own light they shadow a wedge of the room.
export const SHADOW_LIGHT_FLATS = 210;
// Past it a frame's casters are truncated, never reallocated.
export const SHADOW_RECORD_MAX = 6000;
// Hosts re-sort their lights every frame, so slots match by light identity or position.
// A caster stays dynamic this many frames after it last moved, so a pausing door or walker does not rebuild caches.
export const SHADOW_DYNAMIC_HOLD = 60;
export const SHADOW_INSTANCE_MAX = 1024;
export const SHADOW_INSTANCE_REACH = 2;
// Past this count a mesh's placements are filed on a grid of SHADOW_INSTANCE_REACH cubes in origin space, and
// every lookup returns what a full scan would.
export const SHADOW_INSTANCE_LINEAR = 64;
const instKey = (gx, gy, gz) => ((gx & 0x3ff) << 20) | ((gy & 0x3ff) << 10) | (gz & 0x3ff);
export const SHADOW_INSTANCE_PHASE = 0.3819660112501051;
export const SHADOW_SWAY_STILL = 0.02;
export const SHADOW_SWAY_EVERY = 4;
// Steady shadows redraws every map every frame and makes caster holds stickier; off restores the cadences above.
export const SHADOW_TUNING = { steady: true, override: null, debug: false, debugForce: null, selfLamps: null, calmForce: null, facePrepass: true, sunPrepass: true, volumeMemo: true, moverDirect: true, loUnread: true };
// The player's own card casts only into the lamps nearest it, so lamps behind the player do not stack silhouettes.
export const SHADOW_SELF_LAMPS = 2;
if (typeof window !== 'undefined') /** @type {any} */ (window).__DF_SHADOW_TUNING = SHADOW_TUNING;
export const swayLean = (wl, sway, h) => wl * 1.3 * 0.0015 * sway * h;
const crownLean = (r, wl, law, b, h) => { const share = swayShare(b, law); return share > 0 ? (law ? windfallLeanMax(r.windfall, share, h) : swayLean(wl, share, h)) : 0; };
const quadRadius = (r, wl, law, b) => { const h = b.size.h; return placementRadius(placedHalfDiagonal(b), crownLean(r, wl, law, b, h < 0 ? -h : h)); };
export const SHADOW_STILL_EPS = 1e-3;
// A lo slot is SHADOW_POINT_CASTERS + j in uCasterOf; its far is shadowFarFor of the light range in JS and GLSL.
export const SHADOW_LO_SIZE = 256;
// Below the grid's units (9, 10); nothing else binds 8.
export const SHADOW_LO_UNIT = 8;
export const SHADOW_LO_STEP = 8;
export const SHADOW_LO_MAX = SHADOW_CASTER_TABLE;
export const SHADOW_EMPTY_HOLD = 30;
export const SHADOW_LO_REBUILDS = 2;
export const SHADOW_LO_REBUILDS_STEADY = 6;
export function shadowCacheOn(search = globalThis.location?.search ?? '') {
  return pageParam('shadowcache', search) !== 'off';
}
let _shId = 0;
const shId = (o) => (o._shId ??= ++_shId);

const Y_UP = [0, 1, 0];
const Z_UP = [0, 0, 1];
const ORIGIN = Object.freeze([0, 0, 0]);
const SUN_BOXES = SHADOW_CASCADES.map((r) => ortho(r, r, 0, 2 * SHADOW_SUN_DEPTH));
const SUN_BOXES_AT = new Map([[1, SUN_BOXES]]);
function sunBoxesAt(scale) {
  let b = SUN_BOXES_AT.get(scale);
  if (!b) { b = SHADOW_CASCADES.map((r) => ortho(r * scale, r * scale, 0, 2 * SHADOW_SUN_DEPTH * scale)); SUN_BOXES_AT.set(scale, b); }
  return b;
}

// The sun texel grid is snapped at an anchor beside the eye, not the world origin, so a turning sun does not crawl
// shadow edges near a standing player. The basis up is world Z because the sun path lies in the XY plane.
export const SUN_ANCHOR_STEP = 8;
export const SUN_ANCHOR_HOLD = 24;
/** @param {ArrayLike<number>} eye @param {{[i: number]: number}} anchor @returns {boolean} */
export function sunAnchorFor(eye, anchor, lightDir = null, texel = 0) {
  const dx = eye[0] - anchor[0], dy = eye[1] - anchor[1], dz = eye[2] - anchor[2];
  if (dx * dx + dy * dy + dz * dz <= SUN_ANCHOR_HOLD * SUN_ANCHOR_HOLD) return false;
  if (lightDir && texel > 0 && Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dz)) {
    // A re-anchor moves by whole far-cascade texels across the light, so the 1 : 4 : 20 cascade grid does not move.
    // Must match the basis in sunCascadeMatrices.
    const up = Math.abs(lightDir[2]) < 0.9 ? Z_UP : Y_UP;
    const zl = Math.hypot(lightDir[0], lightDir[1], lightDir[2]) || 1;
    const z0 = lightDir[0] / zl, z1 = lightDir[1] / zl, z2 = lightDir[2] / zl;
    let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
    const xl = Math.hypot(x0, x1, x2) || 1; x0 /= xl; x1 /= xl; x2 /= xl;
    const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    const ax = Math.round((dx * x0 + dy * x1 + dz * x2) / texel) * texel, ay = Math.round((dx * y0 + dy * y1 + dz * y2) / texel) * texel, az = dx * z0 + dy * z1 + dz * z2;
    anchor[0] += x0 * ax + y0 * ay + z0 * az;
    anchor[1] += x1 * ax + y1 * ay + z1 * az;
    anchor[2] += x2 * ax + y2 * ay + z2 * az;
    return true;
  }
  anchor[0] = Math.round(eye[0] / SUN_ANCHOR_STEP) * SUN_ANCHOR_STEP;
  anchor[1] = Math.round(eye[1] / SUN_ANCHOR_STEP) * SUN_ANCHOR_STEP;
  anchor[2] = Math.round(eye[2] / SUN_ANCHOR_STEP) * SUN_ANCHOR_STEP;
  return true;
}

/**
 * @param {any} eye
 * @param {any} lightDir
 * @param {any} out
 * @param {ArrayLike<number>} [anchor]
 * @param {number} [scale]
 */
export function sunCascadeMatrices(eye, lightDir, out, anchor = ORIGIN, scale = 1) {
  const boxes = sunBoxesAt(scale);
  const depth = SHADOW_SUN_DEPTH * scale;
  const up = Math.abs(lightDir[2]) < 0.9 ? Z_UP : Y_UP;
  const le = [eye[0] + lightDir[0] * depth, eye[1] + lightDir[1] * depth, eye[2] + lightDir[2] * depth];
  const view = lookAt(le, eye, up);
  for (let c = 0; c < SHADOW_CASCADES.length; c++) {
    const vp = multiply(boxes[c], view, out[c]);
    const half = SHADOW_SUN_SIZE / 2;
    const ax = (vp[0] * anchor[0] + vp[4] * anchor[1] + vp[8] * anchor[2] + vp[12]) * half;
    const ay = (vp[1] * anchor[0] + vp[5] * anchor[1] + vp[9] * anchor[2] + vp[13]) * half;
    vp[12] += (Math.round(ax) - ax) / half;
    vp[13] += (Math.round(ay) - ay) / half;
  }
  return out;
}

export function sunTexelWorld(c, scale = 1) {
  return 2 * SHADOW_CASCADES[c] * scale / SHADOW_SUN_SIZE;
}

const CUBE_FACES = Object.freeze([
  [[1, 0, 0], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]],
  [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, -1]],
  [[0, 0, 1], [0, -1, 0]], [[0, 0, -1], [0, -1, 0]],
]);

export function pointFaceMatrices(pos, far, out) {
  const proj = perspectiveInto(_faceProj, Math.PI / 2, 1, SHADOW_POINT_NEAR, far);
  for (let f = 0; f < 6; f++) {
    const d = CUBE_FACES[f][0], up = CUBE_FACES[f][1];
    multiply(proj, lookAtInto(_faceView, pos, pos[0] + d[0], pos[1] + d[1], pos[2] + d[2], up), out[f]);
  }
  return out;
}
const _faceProj = new Float32Array(16), _faceView = new Float32Array(16);
// Kept here, not in mat4.js, because mat4.js ships in the relay bundle and any change to it is a relay deploy.
export function lookAtInto(out, eye, cx, cy, cz, up) {
  const zx = eye[0] - cx, zy = eye[1] - cy, zz = eye[2] - cz;
  const zl = Math.hypot(zx, zy, zz);
  const z0 = zx / zl, z1 = zy / zl, z2 = zz / zl;
  let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
  const xl = Math.hypot(x0, x1, x2);
  x0 /= xl; x1 /= xl; x2 /= xl;
  const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
  out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
  out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
  out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
}
export function perspectiveInto(out, fovYRad, aspect, near, far) {
  const f = 1 / Math.tan(fovYRad / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

// Matches the shader's cubeDepthRef term for term; keep the two in sync.
export function cubeDepthRef(dx, dy, dz, far, near = SHADOW_POINT_NEAR) {
  return cubeDepthOfM(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)), far, near);
}
export function cubeDepthOfM(m, far, near = SHADOW_POINT_NEAR) {
  m = Math.max(m, near);
  const ndc = (far + near) / (far - near) - (2 * far * near) / ((far - near) * m);
  return ndc * 0.5 + 0.5;
}

export function faceBasis(f) {
  const [d, up] = CUBE_FACES[f];
  const z = [-d[0], -d[1], -d[2]];
  const x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return { x, y };
}

export function pickShadowCaster(lights, eye, carried = null) {
  return pickShadowCasters(lights, eye, 1, carried)[0] ?? -1;
}

// A caster that held a map last frame is measured at CASTER_KEEP_RATIO of its distance. A newcomer must be clearly
// nearer to take its map, so the set never changes on a tie.
export const CASTER_KEEP_RATIO = 0.8;
export const CASTER_KEEP_RATIO_STEADY = 0.65;
function heldAt(held, heldN, lights, i) {
  for (let k = 0; k < heldN; k++) if (samePlace(held, k * 4, lights, i * 4)) return true;
  return false;
}
// Cached copies and host lights take a floating-origin shift in different precisions, so an exact match would fail.
export const samePlace = (a, ai, b, bi) => Math.abs(a[ai] - b[bi]) <= SHADOW_STILL_EPS && Math.abs(a[ai + 1] - b[bi + 1]) <= SHADOW_STILL_EPS && Math.abs(a[ai + 2] - b[bi + 2]) <= SHADOW_STILL_EPS;
export function nearestRank(casters, lights, eye, rank, held = null, heldN = 0) {
  const keep = CASTER_KEEP_RATIO * CASTER_KEEP_RATIO;
  const d2 = (i) => { const dx = lights[i * 4] - eye[0], dy = lights[i * 4 + 1] - eye[1], dz = lights[i * 4 + 2] - eye[2]; const d = dx * dx + dy * dy + dz * dz; return held && heldAt(held, heldN, lights, i) ? d * keep : d; };
  const mine = d2(casters[rank]);
  let n = 0;
  for (let r = 0; r < casters.length; r++) if (r !== rank) { const d = d2(casters[r]); if (d < mine || (d === mine && r < rank)) n++; }
  return n;
}
export function reserveSelfCasters(casters, lights, self, n, max, carried = null, held = null, heldN = 0) {
  if (!self || !n) return casters;
  const mine = pickShadowCasters(lights, self, n, carried, held, heldN);
  for (const i of mine) {
    if (casters.includes(i)) continue;
    if (casters.length < max) { casters.push(i); continue; }
    for (let r = casters.length - 1; r >= 0; r--) if (!mine.includes(casters[r])) { casters[r] = i; break; }
  }
  return casters;
}
export function holdCasters(held, lights, casters) {
  for (let r = 0; r < casters.length; r++) { const i = casters[r]; held[r * 4] = lights[i * 4]; held[r * 4 + 1] = lights[i * 4 + 1]; held[r * 4 + 2] = lights[i * 4 + 2]; }
  return casters.length;
}

export function pickShadowCasters(lights, eye, max = SHADOW_POINT_CASTERS, carried = null, held = null, heldN = 0) {
  const n = lights.length >> 2;
  const picked = [];
  for (let i = 0; i < n; i++) {
    if (carried && carried[i]) continue;
    const dx = lights[i * 4] - eye[0], dy = lights[i * 4 + 1] - eye[1], dz = lights[i * 4 + 2] - eye[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) * (held && heldAt(held, heldN, lights, i) ? (SHADOW_TUNING.steady ? CASTER_KEEP_RATIO_STEADY : CASTER_KEEP_RATIO) : 1);
    if (!(lights[i * 4 + 3] > 0) || lights[i * 4 + 3] > SHADOW_CASTER_MAX_RANGE) continue;
    if (picked.length === max && d >= picked[max - 1][1]) continue;
    let at = picked.length;
    while (at > 0 && picked[at - 1][1] > d) at--;
    picked.splice(at, 0, [i, d]);
    if (picked.length > max) picked.pop();
  }
  return picked.map((p) => p[0]);
}

export function shadowKind(sunScale, lightDir) {
  return sunScale > 0.01 && lightDir && lightDir[1] > SHADOW_MIN_SUN_Y ? 'sun' : 'point';
}

function faceBasisGlsl() {
  const v = (a) => `vec3(${a.map((x) => x.toFixed(1)).join(', ')})`;
  const xs = [], ys = [];
  for (let f = 0; f < 6; f++) { const b = faceBasis(f); xs.push(v(b.x)); ys.push(v(b.y)); }
  return `const vec3 FACE_X[6] = vec3[6](${xs.join(', ')});\nconst vec3 FACE_Y[6] = vec3[6](${ys.join(', ')});`;
}

export const SHADOW_GLSL = `
precision highp sampler2DArrayShadow;
uniform sampler2DArrayShadow uSunShadow;
uniform mat4 uSunVP[3];
uniform vec4 uSunOrigin;          // TV1: xyz the point the cascades were rendered about, w 1 = set (0: uCamPos, the old law)
uniform vec4 uSunShadowParams;    // x y z the three cascades' radii, w 1 = on (EL7: three)
uniform vec4 uSunTexel;           // x y z the cascades' texel size (world)
uniform sampler2DArrayShadow uPointShadow;   // EL5: six face layers per caster
uniform vec4 uPointShadowParams[${SHADOW_POINT_CASTERS}];  // xyz the light, w its far plane (0 = off)
uniform int uShadowIndex[${SHADOW_POINT_CASTERS}];         // the lantern each caster's layers belong to, -1 for none
uniform int uCasterOf[${SHADOW_CASTER_TABLE}];              // EL8: light i's caster slot, -1 for none - one lookup (DISC15: SHADOW_POINT_CASTERS + j for lo slot j)
uniform sampler2DArrayShadow uPointShadowLo;                 // DISC15: the lo tier - six layers per slot, the room's static casters
${faceBasisGlsl()}
// EL5: the cube's face of direction d by its major axis (m, the distance along it), and d's uv on that face by the
// face's basis (pointFaceMatrices' own lookAt axes). AUDIT 68 S17-shadowpass-layer-dup: the four readers' one pick.
vec2 cubeFaceUv(vec3 d, out int face, out float m) {
  vec3 a = abs(d);
  if (a.x >= a.y && a.x >= a.z) { face = d.x > 0.0 ? 0 : 1; m = a.x; }
  else if (a.y >= a.z) { face = d.y > 0.0 ? 2 : 3; m = a.y; }
  else { face = d.z > 0.0 ? 4 : 5; m = a.z; }
  return vec2(dot(FACE_X[face], d), dot(FACE_Y[face], d)) / max(m, 1e-4) * 0.5 + 0.5;
}
// LA-SHADOW2: cascade c's lookup at wp - the whole of what sunShadowTap did for the one cascade it picked
float sunCascadeTap(int c, vec3 wp, vec3 n, bool soft, float h) {
  float texel = c == 0 ? uSunTexel.x : c == 1 ? uSunTexel.y : uSunTexel.z;
  mat4 vp = c == 0 ? uSunVP[0] : c == 1 ? uSunVP[1] : uSunVP[2];
  vec4 lp = vp * vec4(wp + n * texel * 1.5, 1.0);
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float ref = p.z - ${SHADOW_SUN_BIAS};   // AUDIT-EL F15: ~0.06 world units over the 1200-unit box (0.0004 was half a unit - feet floated off their shadows)
  // AUDIT FLICKER S1: A FLAT'S OWN CARD. The sun replay draws each flat as an upright card through the very base it
  // reads at (EL2), and the sun is not level: the card above the read point stands nearer the light by tan(elevation)
  // a unit up, and the kernel reaches ${SUN_FLAT_REACH_TEXELS} texels up it - past the constant bias once that reach
  // times tan(e) passes it, by a share the sun's turn slides texel by texel (a tree stepped a third of its sun in one
  // frame, and chattered on the far cascade's redraws). A flat's read is lowered by what its own card could hold over
  // it: the kernel's reach up the card (tan(e) a texel), never more than the card above the point holds (h, the
  // flat's height: sin(e) a unit up it).
  if (soft && h > 0.0) {
    vec3 zr = vec3(vp[0][2], vp[1][2], vp[2][2]);
    float zl = length(zr);
    vec3 toSun = -zr / max(zl, 1e-6);
    float sinE = max(toSun.y, 0.0);
    ref -= min(${SUN_FLAT_REACH_TEXELS} * texel * sinE / max(length(toSun.xz), 1e-3), max(h - 0.5, 0.0) * sinE) * 0.5 * zl;
  }
  float texelUv = 1.0 / ${SHADOW_SUN_SIZE}.0;   // AUDIT-EL F17: not 'step' - a built-in's name
  // PERF-SUN: the far cascade takes ONE tap, which the sampler already
  // makes a hardware 2x2 (COMPARE_REF_TO_TEXTURE + LINEAR). Its texel is
  // 23 cm - about two pixels at a hundred metres - so the eight extra
  // samples soften nothing the eye can resolve, over most of an outdoor
  // screen. The near cascades keep the kernel: that is EL7's contact
  // hairline, at a texel of 1.2 cm.
  //
  // TREES1 (2026-09-19, Mac: "there's this weird darkening effect
  // happening to trees"): UNLESS THE CALLER IS A FLAT. The trade above
  // is an ANTIALIASING one, and it only holds for a surface that shades
  // PER FRAGMENT - the terrain and the meshes, where neighbouring pixels
  // smooth a coarse filter whatever this returns. A flat is not like
  // that. It reads ONE value at its base and wears it over the whole
  // sprite (EL2: a sprite sampled at its own fragment would shadow
  // itself), so the kernel is not softening an edge there - it is the
  // only gradation the tree has. With one tap a tree whose foot sits
  // near a shadow edge flips between fully lit and fully dark, and jumps
  // again at the cascade boundary as you walk toward it. Flats keep the
  // kernel at every distance, and they are a thin slice of the frame's
  // fragments beside the ground, so nearly all of the saving stands.
  if (!soft && c >= ${SHADOW_PCF_CASCADES}) return texture(uSunShadow, vec4(p.xy, float(c), ref));
  // PERF-EXT5 (2026-09-25, the players' "fps issues in the exterior but
  // fine in the interior" and "me too my friend.. don't know why. I got a
  // RX6600"): THE 3x3 KERNEL IN FOUR TAPS, THE SAME WEIGHTS. It was nine
  // hardware 2x2s one texel apart. Per axis they weigh the four texels
  // under them [1-f, 1, 1, f] (f the sample's fraction past a texel
  // centre), and two bilinear taps give exactly that: one over the first
  // pair at weight 2-f, set 1/(2-f) of the way into it, and one over the
  // last pair at weight 1+f, set f/(1+f) in. The kernel is separable, so
  // four taps are the nine - the same texels, the same weights, equal in
  // exact arithmetic. What moves: the hardware quantises each tap's
  // sub-texel fraction (8 bits on the players' D3D11-class cards), and the
  // four taps quantise other fractions than the nine did - under a 255th
  // of the sun's light, in a penumbra only (0.93 of one at worst over the
  // provers' random maps; test/render/perfexta.test.js's twin holds it under
  // one), 2 of 518,400 pixels by one step on SwiftShader.
  // Five fetches a fragment gone: every flat by day, and every lit
  // fragment of the near cascades.
  vec2 st = p.xy * ${SHADOW_SUN_SIZE}.0 - 0.5;
  vec2 b = floor(st), f = st - b;
  vec2 wA = 2.0 - f, wB = 1.0 + f;
  vec2 tA = (b - 0.5 + 1.0 / wA) * texelUv, tB = (b + 1.5 + f / wB) * texelUv;
  float lc = float(c);
  float lit = wA.x * wA.y * texture(uSunShadow, vec4(tA.x, tA.y, lc, ref)) + wB.x * wA.y * texture(uSunShadow, vec4(tB.x, tA.y, lc, ref))
    + wA.x * wB.y * texture(uSunShadow, vec4(tA.x, tB.y, lc, ref)) + wB.x * wB.y * texture(uSunShadow, vec4(tB.x, tB.y, lc, ref));
  return lit / 9.0;
}
// LA-SHADOW2 (2026-09-27, Mac: "a deep audit on the enhanced lighting system, look for flickering issues"): THE
// CASCADES HAND OVER IN A BAND, AND THE LAST ONE FADES OUT. The pick was a hard line at nine tenths of each radius:
// a shadow crossing it changed its texel four- or fivefold, its normal offset with it (the edge stepped sideways by
// centimetres) and, at the far line, its kernel - a ring about the player that popped every shadow it swept over as
// they walked, and a tree's whole sprite with it (a flat reads one value at its foot). Past the far box the shadows
// stopped at its square edge, a line that turned with the sun. Now the last SUN_CASCADE_BAND of each cascade's reach
// mixes in the next one, which covers it whole, and the far cascade's last stretch fades to lit by distance - a
// circle, not the box's turning square. Two lookups only in the band.
float sunShadowTap(vec3 wp, vec3 n, bool soft, float h) {
  if (uSunShadowParams.w <= 0.0) return 1.0;
  float d = length(wp - (uSunOrigin.w > 0.5 ? uSunOrigin.xyz : uCamPos));   // TV1: picked about the point the cascades stand on - the travel view's traveller, else the eye
  int c = d < uSunShadowParams.x * 0.9 ? 0 : d < uSunShadowParams.y * 0.9 ? 1 : 2;
  float r = c == 0 ? uSunShadowParams.x : c == 1 ? uSunShadowParams.y : uSunShadowParams.z;
  float t = smoothstep(r * ${(0.9 - SUN_CASCADE_BAND).toFixed(2)}, r * 0.9, d);   // 0 short of the band, 1 at the handover
  if (c == 2) return t >= 1.0 ? 1.0 : mix(sunCascadeTap(2, wp, n, soft, h), 1.0, t);
  float lit = sunCascadeTap(c, wp, n, soft, h);
  return t > 0.0 ? mix(lit, sunCascadeTap(c + 1, wp, n, soft, h), t) : lit;
}
/** A surface that shades per fragment: the cheap tap past SHADOW_PCF_CASCADES. */
float sunShadowAt(vec3 wp, vec3 n) { return sunShadowTap(wp, n, false, 0.0); }
/** A FLAT, which reads once for a whole sprite: the kernel at every distance (TREES1). AUDIT FLICKER S1: h its
 *  height, whose own card the read is kept off. */
float sunShadowSoftAt(vec3 wp, vec3 n, float h) { return sunShadowTap(wp, n, true, h); }
// the face's depth of a point whose major-axis distance is m (cubeDepthRef in shadowPass.js)
float cubeDepthOfM(float m, float far) {
  float near = ${SHADOW_POINT_NEAR};
  m = max(m, near);
  float ndc = (far + near) / (far - near) - (2.0 * far * near) / ((far - near) * m);
  return ndc * 0.5 + 0.5;
}
// EL5: caster k's shadow at wp - the cube's face by the major axis, the face's
// uv by its basis (pointFaceMatrices' own lookAt axes), the layer k * 6 + face
float pointShadowAt(int k, vec3 wp, vec3 n) {
  vec4 P = uPointShadowParams[k];
  float far = P.w;
  if (far <= 0.0) return 1.0;
  vec3 d = (wp + n * 0.05) - P.xyz;
  int face; float m;
  vec2 uv = cubeFaceUv(d, face, m);
  float layer = float(k * 6 + face);
  // AUDIT-EL F15: THE BIAS IS IN WORLD UNITS - the depth is hyperbolic, and a
  // constant 0.002 off it was half a unit at five units and four at fifteen:
  // an occluder within four units of a wall cast nothing near a lantern's range
  float ref = cubeDepthOfM(m - ${SHADOW_POINT_BIAS}, far);
  float t = 1.5 / ${SHADOW_POINT_SIZE}.0;
  float lit = texture(uPointShadow, vec4(uv, layer, ref));
  lit += texture(uPointShadow, vec4(uv + vec2(t, 0.0), layer, ref)) + texture(uPointShadow, vec4(uv - vec2(t, 0.0), layer, ref))
       + texture(uPointShadow, vec4(uv + vec2(0.0, t), layer, ref)) + texture(uPointShadow, vec4(uv - vec2(0.0, t), layer, ref));
  return lit / 5.0;
}
// VOL1: caster k's shadow at a point IN THE AIR - one tap, no normal (a march has no surface to bias against, and
// the blur after it smooths what the kernel would); the face and its uv exactly as pointShadowAt finds them
float pointShadowOne(int k, vec3 wp) {
  vec4 P = uPointShadowParams[k];
  float far = P.w;
  if (far <= 0.0) return 1.0;
  vec3 d = wp - P.xyz;
  int face; float m;
  vec2 uv = cubeFaceUv(d, face, m);
  return texture(uPointShadow, vec4(uv, float(k * 6 + face), cubeDepthOfM(m - ${SHADOW_POINT_BIAS}, far)));
}
// DISC15: light L's shadow from its lo map j, drawn to far (LA-SHADOW4: the caster table's word carries it) -
// pointShadowAt's face and uv on the lo array, the normal offset and the bias held to a texel of it (a 256 face's
// texel is twice a 512's)
float pointShadowLoAt(int j, float far, vec4 L, vec3 wp, vec3 n) {
  vec3 d0 = wp - L.xyz;
  float texel = 2.0 * max(max(abs(d0.x), abs(d0.y)), abs(d0.z)) / ${SHADOW_LO_SIZE}.0;
  vec3 d = d0 + n * max(0.05, 1.5 * texel);
  int face; float m;
  vec2 uv = cubeFaceUv(d, face, m);
  float layer = float(j * 6 + face);
  float ref = cubeDepthOfM(m - max(${SHADOW_POINT_BIAS}, texel), far);
  float t = 1.5 / ${SHADOW_LO_SIZE}.0;
  float lit = texture(uPointShadowLo, vec4(uv, layer, ref));
  lit += texture(uPointShadowLo, vec4(uv + vec2(t, 0.0), layer, ref)) + texture(uPointShadowLo, vec4(uv - vec2(t, 0.0), layer, ref))
       + texture(uPointShadowLo, vec4(uv + vec2(0.0, t), layer, ref)) + texture(uPointShadowLo, vec4(uv - vec2(0.0, t), layer, ref));
  return lit / 5.0;
}
// DISC15: the same IN THE AIR - one tap, no normal (pointShadowOne's shape)
float pointShadowLoOne(int j, float far, vec4 L, vec3 wp) {
  vec3 d = wp - L.xyz;
  int face; float m;
  vec2 uv = cubeFaceUv(d, face, m);
  float texel = 2.0 * m / ${SHADOW_LO_SIZE}.0;
  return texture(uPointShadowLo, vec4(uv, float(j * 6 + face), cubeDepthOfM(m - max(${SHADOW_POINT_BIAS}, texel), far)));
}
// DISC15: caster k of the light at L (uCasterOf's word): a 512 slot below SHADOW_POINT_CASTERS, a lo slot past it;
// LA-SHADOW4: the slot is the word's low byte, and a lo map's far the quanta above it (casterWord)
float casterShadowAt(int k, vec4 L, vec3 wp, vec3 n) {
  int s = k & 255;
  return s < ${SHADOW_POINT_CASTERS} ? pointShadowAt(s, wp, n) : pointShadowLoAt(s - ${SHADOW_POINT_CASTERS}, float(k >> ${SHADOW_CASTER_FAR_SHIFT}) * ${SHADOW_FAR_QUANTUM}.0, L, wp, n);
}
float casterShadowOne(int k, vec4 L, vec3 wp) {
  int s = k & 255;
  return s < ${SHADOW_POINT_CASTERS} ? pointShadowOne(s, wp) : pointShadowLoOne(s - ${SHADOW_POINT_CASTERS}, float(k >> ${SHADOW_CASTER_FAR_SHIFT}) * ${SHADOW_FAR_QUANTUM}.0, L, wp);
}
// EL5: light i's shadow - its caster's, if it has one this frame (EL8: by the table, one lookup; DISC15: either tier)
float shadowOfLight(int i, vec4 L, vec3 wp, vec3 n) {
  int k = uCasterOf[i];
  return k >= 0 ? casterShadowAt(k, L, wp, n) : 1.0;
}
`;

export const DEPTH_FS = `#version 300 es
precision highp float;
void main() {}`;
export const DEPTH_CUT_FS = `#version 300 es
precision highp float;
${BAYER_GLSL}
${DISSOLVE_GLSL}
void main() { dissolveCut(); }`;
export const DEPTH_BB_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
void main() {
  if (texture(uTex, vUV).a < 0.5) discard;
}`;
export const DEPTH_COPY_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
// Highp, the sampler most of all: a mediump fetch would round the 24-bit depth to eleven bits.
export const DEPTH_COPY_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2DArray uCache;
uniform int uLayer;
void main() {
  gl_FragDepth = texelFetch(uCache, ivec3(gl_FragCoord.xy, uLayer), 0).r;
}`;

const DYN_NONE = 0, DYN_SWAY = 1, DYN_MOVER = 2, DYN_BODY = 3;
const REC_MESH = 0, REC_TERRAIN = 1, REC_BB = 2, REC_CHAR = 3;
const REPLAY_ALL = 0, REPLAY_STATIC = 1, REPLAY_DYNAMIC = 2, REPLAY_LO = 3;
const FACES_ALL = 0x3f;
export const CUBE_REACH = 1 + Math.SQRT2;
export const cubeReach = (r) => (r > 0 ? r * CUBE_REACH : r);
export const CUBE_F32_FAR = (4 * 2 ** -24) / SHADOW_POINT_NEAR;
export const cubeSlack = (px, py, pz, far) => {
  const s = Math.abs(px) + Math.abs(py) + Math.abs(pz) + far;
  return 1e-3 + 1e-5 * s + CUBE_F32_FAR * far * s;
};
export const cubeKeeps = (lim, k, x, y, z, r) => {
  const o = k * 5, R = lim[o + 3] + cubeReach(r) + lim[o + 4];
  const d = Math.max(Math.abs(x - lim[o]), Math.abs(y - lim[o + 1]), Math.abs(z - lim[o + 2]));
  return !(d > R) || d === Infinity;
};

function _instKeyOf(s, shift) {
  const R = SHADOW_INSTANCE_REACH;
  return instKey(Math.floor((s.m[12] - shift[0]) / R + SHADOW_INSTANCE_PHASE), Math.floor((s.m[13] - shift[1]) / R + SHADOW_INSTANCE_PHASE), Math.floor((s.m[14] - shift[2]) / R + SHADOW_INSTANCE_PHASE));
}
function _file(o, s, shift) {
  const k = _instKeyOf(s, shift);
  if (s.filed && k === s.key) return;
  const grid = o._shInstGrid;
  if (s.filed) {
    const was = grid.get(s.key);
    if (was) { const i = was.indexOf(s); if (i >= 0) was.splice(i, 1); if (!was.length) grid.delete(s.key); }
  }
  let cell = grid.get(k);
  if (!cell) { cell = []; grid.set(k, cell); }
  let at = cell.length;
  while (at > 0 && cell[at - 1].ord > s.ord) at--;
  cell.splice(at, 0, s);
  s.key = k; s.filed = true;
}
function _fileAll(o, shift) {
  o._shInstGrid = new Map();
  for (const s of o._shInst) { s.filed = false; s.key = NaN; _file(o, s, shift); }
  return o._shInstGrid;
}

export class ShadowPass {
  /** @param {{ mesh: string, bb: string, terrain: string, char?: string }} vs @returns {[string, string][]} */
  static bootPrograms(vs) {
    /** @type {[string, string][]} */
    const pairs = [[vs.mesh, DEPTH_FS], [vs.terrain, DEPTH_FS], [vs.bb, DEPTH_BB_FS], [vs.mesh, DEPTH_CUT_FS], [vs.mesh, DEPTH_BB_FS], [DEPTH_COPY_VS, DEPTH_COPY_FS]];
    if (vs.char) pairs.push([vs.char, DEPTH_FS]);
    return pairs;
  }

  constructor(gl, opts) {
    this.gl = gl;
    const u = (p, n) => gl.getUniformLocation(p, n);
    const mesh = opts.build(opts.vs.mesh, DEPTH_FS);
    const terrain = opts.build(opts.vs.terrain, DEPTH_FS);
    const bb = opts.build(opts.vs.bb, DEPTH_BB_FS);
    const char = opts.vs.char ? opts.build(opts.vs.char, DEPTH_FS) : null;
    this._buildBody = opts.vs.charSkin ? () => opts.build(opts.vs.charSkin, DEPTH_FS) : null;
    this._buildBodyCut = opts.vs.charSkin ? () => opts.build(opts.vs.charSkin, DEPTH_BB_FS) : null;
    this._buildCharCut = opts.vs.char ? () => opts.build(opts.vs.char, DEPTH_BB_FS) : null;
    const meshCut = opts.build(opts.vs.mesh, DEPTH_CUT_FS);
    const meshCutout = opts.build(opts.vs.mesh, DEPTH_BB_FS);
    const copy = opts.build(DEPTH_COPY_VS, DEPTH_COPY_FS);
    this.programs = {
      copy: { p: copy, cache: u(copy, 'uCache'), layer: u(copy, 'uLayer') },
      mesh: { p: mesh, proj: u(mesh, 'uProj'), view: u(mesh, 'uView'), model: u(mesh, 'uModel') },
      meshCut: { p: meshCut, proj: u(meshCut, 'uProj'), view: u(meshCut, 'uView'), model: u(meshCut, 'uModel'), cut: u(meshCut, 'uDissolveCut') },
      meshCutout: { p: meshCutout, proj: u(meshCutout, 'uProj'), view: u(meshCutout, 'uView'), model: u(meshCutout, 'uModel'), tex: u(meshCutout, 'uTex') },
      char: char ? { p: char, proj: u(char, 'uProj'), view: u(char, 'uView'), model: u(char, 'uModel') } : null,
      terrain: { p: terrain, proj: u(terrain, 'uProj'), view: u(terrain, 'uView'), model: u(terrain, 'uModel') },
      bb: {
        p: bb, proj: u(bb, 'uProj'), view: u(bb, 'uView'), right: u(bb, 'uRight'), up: u(bb, 'uUp'), origin: u(bb, 'uOrigin'),
        size: u(bb, 'uSize'), tex: u(bb, 'uTex'), flatWind: u(bb, 'uFlatWind'), sway: u(bb, 'uSway'),
        wfSway: u(bb, 'uWindfallSway'), wfAxis: u(bb, 'uWindfallAxis'),
        face: u(bb, 'uFacePoint'),
      },
    };
    this.sunTex = this._depthArray(SHADOW_SUN_SIZE, SHADOW_CASCADES.length, gl.LINEAR);
    this.sunFbos = this._layerFbos(this.sunTex, SHADOW_CASCADES.length);
    this.pointTex = this._depthArray(SHADOW_POINT_SIZE, 6 * SHADOW_POINT_CASTERS, gl.LINEAR);
    this.pointFbos = this._layerFbos(this.pointTex, 6 * SHADOW_POINT_CASTERS);
    this.cacheTex = null;
    this.cacheFbos = [];
    this._copyVao = gl.createVertexArray();
    this.cacheOn = true;
    this._slotSig = new Int32Array(2 * SHADOW_POINT_CASTERS);
    this._slotCached = new Uint8Array(SHADOW_POINT_CASTERS);
    this._slotLiveDyn = new Uint8Array(SHADOW_POINT_CASTERS);
    this._slotBodySig = new Int32Array(2 * SHADOW_POINT_CASTERS);
    this._bodySig = new Int32Array(2);
    this._faceDyn = new Uint8Array(6 * SHADOW_POINT_CASTERS).fill(1);
    this._slotSelf = new Uint8Array(SHADOW_POINT_CASTERS);
    // Until then a one-texel array sits on SHADOW_LO_UNIT. Every lane program declares the sampler, and a shadow
    // sampler must always have a compared depth array under it.
    this.loTex = this._depthArray(1, 6, gl.LINEAR);
    this._loFbos = [];
    this._loCap = 0;
    this._loSlotLight = new Float32Array(0);
    this._loSlotSig = new Int32Array(0);
    this._loBuilt = new Uint8Array(0);
    this._loUnminded = new Uint8Array(0);
    this._loSlotOf = new Int32Array(SHADOW_CASTER_TABLE);
    this._loTaken = new Uint8Array(0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    /** @type {Array<{kind:number, mesh:any, matrix:Float32Array, texRemap:any, surface:any, arrayTex:any, tilemapTex:any, tileSize:number, batches:any, flatWind:Float32Array, windfall:Float32Array, wfSway:Float32Array|null, wfAxis:Float32Array|null, right:Float32Array, up:Float32Array, bounded:boolean, sphere:Float32Array, subSpheres:Float32Array, cellSpheres:Float32Array, dynamic:boolean, cut:number, body:boolean, anchored:boolean, look:number, matrixBits:Int32Array|null}>} */
    this.records = [];
    this.count = 0;
    this.recording = true;
    this.sunVP = SHADOW_CASCADES.map(() => new Float32Array(16));
    this.faceVP = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(16));
    this.sunParams = new Float32Array(4);
    this.sunTexel = new Float32Array(4);
    this.sunOrigin = new Float32Array(4);
    this.pointParams = new Float32Array(4 * SHADOW_POINT_CASTERS);
    this.shadowIndex = new Int32Array(SHADOW_POINT_CASTERS).fill(-1);
    this.casterOf = new Int32Array(SHADOW_CASTER_TABLE).fill(-1);
    this.casters = 0;
    this.frameNo = 0;
    this._slotLight = new Float32Array(4 * SHADOW_POINT_CASTERS).fill(NaN);
    this._slotId = new Float64Array(SHADOW_POINT_CASTERS);
    this._sunVPNew = SHADOW_CASCADES.map(() => new Float32Array(16));
    this._sunDrawn = new Uint8Array(SHADOW_CASCADES.length);
    this._sunAnchor = new Float64Array([NaN, NaN, NaN]);
    this._sunScaleK = 1;
    this.kind = null;
    this.stats = { records: 0, sunDraws: 0, pointDraws: 0, culled: 0, cascadesDrawn: 0, facesDrawn: 0, staticFaces: 0, dynFaces: 0, moverFaces: 0, blits: 0, cachedSlots: 0, loSlots: 0, loFaces: 0, selfLamps: 0 };
    this._planes = new Float32Array(24);
    this._bSphere = new Float64Array(4);
    this._cubeArgs = new Float64Array(5);
    this._selfAt = new Float64Array(3);
    this._selfCard = null;
    this._slotOfScratch = new Int32Array(SHADOW_POINT_CASTERS);
    this._slotOwnScratch = new Uint8Array(SHADOW_POINT_CASTERS);
    this._heldCasters = new Float64Array(4 * SHADOW_POINT_CASTERS);
    this._heldCasterN = 0;
    this._selfHeld = new Float64Array(4 * SHADOW_POINT_CASTERS); this._selfHeldN = 0;
    this._selfNext = new Float64Array(4 * SHADOW_POINT_CASTERS);
    this._slotTakenScratch = new Uint8Array(SHADOW_POINT_CASTERS);
    this._sigCasters = new Float64Array(4 * SHADOW_POINT_CASTERS);
    this._sigOut = new Int32Array(2 * SHADOW_POINT_CASTERS);
    this._farOf = new Float64Array(SHADOW_POINT_CASTERS);
    this._loSigs = new LoLampSignatures(SHADOW_CASTER_TABLE, heldShadowFar, shadowFarFor);
    this._cands = Array.from({ length: SHADOW_POINT_CASTERS }, () => ({ n: 0, hw: 0, rec: new Int32Array(64), bb: [] }));
    this._candOf = new Array(SHADOW_POINT_CASTERS).fill(null);
    this._candLim = new Float64Array(5 * SHADOW_POINT_CASTERS);
    this._candOpen = new Int32Array(SHADOW_POINT_CASTERS);
    this._candFill = new Int32Array(SHADOW_POINT_CASTERS);
    this._candQuads = new Uint8Array(SHADOW_POINT_CASTERS);
    this._candWalked = false;
    this._sunCands = SHADOW_CASCADES.map(() => ({ n: 0, hw: 0, rec: new Int32Array(64), bb: [] }));
    this._sunCandPlanes = SHADOW_CASCADES.map(() => new Float32Array(24));
    this._sunPlanes = SHADOW_CASCADES.map(() => new Float32Array(24));
    this._sunPlanesFrame = -1;
    this._shiftGen = 0;
    this._shiftNow = [0, 0, 0];
    this._shiftD = [0, 0, 0];
    this._identityView = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    this._right = new Float32Array(3); this._up = new Float32Array([0, 1, 0]);
    this._zeroWind = new Float32Array(4);
    this._sunVPFlat = new Float32Array(16 * SHADOW_CASCADES.length);
  }

  _depthArray(size, layers, filter) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT24, size, size, layers);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    return tex;
  }
  _layerFbos(tex, layers) {
    const gl = this.gl, fbos = [];
    for (let l = 0; l < layers; l++) {
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, tex, 0, l);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      fbos.push(fbo);
    }
    return fbos;
  }
  _ensureLo(slots) {
    const want = Math.min(SHADOW_LO_MAX, Math.ceil(slots / SHADOW_LO_STEP) * SHADOW_LO_STEP);
    if (want <= this._loCap) return;
    const gl = this.gl;
    gl.deleteTexture(this.loTex);
    for (const fb of this._loFbos) gl.deleteFramebuffer(fb);
    this.loTex = this._depthArray(SHADOW_LO_SIZE, 6 * want, gl.LINEAR);
    this._loFbos = this._layerFbos(this.loTex, 6 * want);
    this._loCap = want;
    this._loSlotLight = new Float32Array(4 * want).fill(NaN);
    this._loSlotSig = new Int32Array(2 * want);
    this._loBuilt = new Uint8Array(want);
    this._loTaken = new Uint8Array(want);
    this._loUnminded = new Uint8Array(want);
  }
  static _castsAt(L, carried, i) {
    const w = L[i * 4 + 3];
    return !(carried && carried[i]) && w > 0 && w <= SHADOW_CASTER_MAX_RANGE;
  }
  _renderLo(f, L) {
    const gl = this.gl, n = Math.min(L.length >> 2, SHADOW_CASTER_TABLE);
    let want = 0;
    for (let i = 0; i < n; i++) if (ShadowPass._castsAt(L, f.carried, i)) want++;
    if (want === 0) return;
    this._ensureLo(want);
    const cap = this._loCap, sl = this._loSlotLight, slotOf = this._loSlotOf, taken = this._loTaken, unminded = this._loUnminded;
    slotOf.fill(-1); taken.fill(0);
    const hi = (i) => SHADOW_TUNING.loUnread !== false && this.casterOf[i] >= 0 && this.casterOf[i] < SHADOW_POINT_CASTERS;
    for (let i = 0; i < n; i++) {
      if (!ShadowPass._castsAt(L, f.carried, i)) continue;
      for (let j = 0; j < cap; j++) {
        if (!taken[j] && samePlace(sl, j * 4, L, i * 4)) { slotOf[i] = j; taken[j] = 1; break; }
      }
    }
    for (let i = 0; i < n; i++) {
      if (slotOf[i] >= 0 || !ShadowPass._castsAt(L, f.carried, i) || hi(i)) continue;
      for (let j = 0; j < cap; j++) if (!taken[j]) { slotOf[i] = j; taken[j] = 1; break; }
    }
    for (let j = 0; j < cap; j++) if (!taken[j]) { sl[j * 4] = NaN; this._loBuilt[j] = 0; unminded[j] = 0; }
    let rebuilds = SHADOW_TUNING.steady ? SHADOW_LO_REBUILDS_STEADY : SHADOW_LO_REBUILDS;
    const sigs = this._loSigs;
    sigs.gather({
      lights: L, lightCount: n, slotOf, readsFullMap: hi, slotLight: sl, slotBuilt: this._loBuilt,
      walk: (cp, nC, out) => this._staticSignatures(cp, nC, out, false, true),
    });
    for (let i = 0; i < n; i++) {
      const j = slotOf[i];
      if (j < 0) continue;
      const o = j * 4;
      const pos = [L[i * 4], L[i * 4 + 1], L[i * 4 + 2]];
      const same = this._loBuilt[j] && sl[o] === pos[0] && sl[o + 1] === pos[1] && sl[o + 2] === pos[2];
      const far = same ? heldShadowFar(sl[o + 3], L[i * 4 + 3]) : shadowFarFor(L[i * 4 + 3]);
      const fresh = !same || sl[o + 3] !== far;
      if (hi(i)) {
        if (fresh) { sl[o] = NaN; this._loBuilt[j] = 0; unminded[j] = 0; } else unminded[j] = 1;
        continue;
      }
      const minded = unminded[j] === 0;
      unminded[j] = 0;
      const sigHash = sigs.hash(i), sigCount = sigs.count(i);
      let draw = fresh;
      if (!fresh && (!minded || rebuilds > 0)) {
        if (this._loSlotSig[j * 2] !== sigHash || this._loSlotSig[j * 2 + 1] !== sigCount) { draw = true; if (minded) rebuilds--; }
      }
      if (draw) {
        this._loSlotSig[j * 2] = sigHash; this._loSlotSig[j * 2 + 1] = sigCount;
        pointFaceMatrices(pos, far, this.faceVP);
        for (let face = 0; face < 6; face++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this._loFbos[j * 6 + face]);
          gl.viewport(0, 0, SHADOW_LO_SIZE, SHADOW_LO_SIZE);
          gl.clear(gl.DEPTH_BUFFER_BIT);
          this.stats.pointDraws += this.replay(f, this.faceVP[face], pos, false, 0, 0, REPLAY_LO);
        }
        this.stats.loFaces += 6;
        this._loBuilt[j] = 1;
        sl[o] = pos[0]; sl[o + 1] = pos[1]; sl[o + 2] = pos[2]; sl[o + 3] = far;
      }
      this.stats.loSlots++;
      if (this.casterOf[i] === -1) this.casterOf[i] = casterWord(SHADOW_POINT_CASTERS + j, far);
    }
  }
  _ensureCache() {
    if (this.cacheTex) return;
    const gl = this.gl;
    const cache = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, cache);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT24, SHADOW_POINT_SIZE, SHADOW_POINT_SIZE, 6 * SHADOW_POINT_CASTERS);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.cacheTex = cache;
    this.cacheFbos = this._layerFbos(cache, 6 * SHADOW_POINT_CASTERS);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  }
  _rec() {
    if (this.count >= SHADOW_RECORD_MAX) return null;
    let r = this.records[this.count];
    if (!r) {
      r = { kind: 0, mesh: null, matrix: new Float32Array(16), texRemap: null, surface: null, arrayTex: null, tilemapTex: null, tileSize: 0, batches: null, flatWind: new Float32Array(4), windfall: new Float32Array(8), wfSway: null, wfAxis: null, right: new Float32Array(3), up: new Float32Array(3),
        bounded: false, sphere: new Float32Array(4), subSpheres: new Float32Array(0), cellSpheres: new Float32Array(0), dynamic: false, cut: 0,
        body: false, anchored: false, look: 0, matrixBits: null };
      r.matrixBits = new Int32Array(r.matrix.buffer);
      r.wfSway = r.windfall.subarray(0, 4); r.wfAxis = r.windfall.subarray(4, 8);
      this.records[this.count] = r;
    }
    this.count++;
    return r;
  }
  reaches(box, ox = 0, oy = 0, oz = 0) {
    const pp = this.pointParams;
    const cx = (box[0] + box[3]) * 0.5 + ox, cy = (box[1] + box[4]) * 0.5 + oy, cz = (box[2] + box[5]) * 0.5 + oz;
    const r = Math.hypot(box[3] - box[0], box[4] - box[1], box[5] - box[2]) * 0.5;
    for (let k = 0; k < SHADOW_POINT_CASTERS; k++) {
      const far = pp[k * 4 + 3];
      if (far > 0 && spheresTouch(cx, cy, cz, r, pp[k * 4], pp[k * 4 + 1], pp[k * 4 + 2], far)) return true;
    }
    if (this.sunParams[3] > 0) {
      this._ensureSunPlanes();
      for (let c = 0; c < SHADOW_CASCADES.length; c++) if (!aabbOutside(this._sunPlanes[c], box, ox, oy, oz)) return true;
    }
    return false;
  }
  reachesSphere(x, y, z, r) {
    const pp = this.pointParams;
    for (let k = 0; k < SHADOW_POINT_CASTERS; k++) if (pp[k * 4 + 3] > 0 && spheresTouch(x, y, z, r, pp[k * 4], pp[k * 4 + 1], pp[k * 4 + 2], pp[k * 4 + 3])) return true;
    if (this.sunParams[3] > 0) {
      this._ensureSunPlanes();
      for (let c = 0; c < SHADOW_CASCADES.length; c++) if (sphereInPlanes(this._sunPlanes[c], x, y, z, r)) return true;
    }
    return false;
  }
  _ensureSunPlanes() {
    if (this._sunPlanesFrame === this.frameNo) return;
    for (let c = 0; c < SHADOW_CASCADES.length; c++) spherePlanes(this.sunVP[c], this._sunPlanes[c]);
    this._sunPlanesFrame = this.frameNo;
  }
  // Each object is rebased on its next draw by the offsets between its generation and this one.
  shiftOrigin(offset) {
    const a = this._shiftNow;
    a[0] += offset[0]; a[1] += offset[1]; a[2] += offset[2];
    this._shiftGen++;
    this._sunDrawn.fill(0);
    this._sunAnchor[0] += offset[0]; this._sunAnchor[1] += offset[1]; this._sunAnchor[2] += offset[2];
    const move = (a, n) => { for (let k = 0; k < n; k++) { a[k * 4] += offset[0]; a[k * 4 + 1] += offset[1]; a[k * 4 + 2] += offset[2]; } };
    move(this._heldCasters, this._heldCasterN);
    move(this._selfHeld, this._selfHeldN);
    move(this._slotLight, this._slotLight.length >> 2);
    move(this._loSlotLight, this._loSlotLight.length >> 2);
    // Records in hand follow the shift, because they replay at the next beginFrame against the moved lights.
    for (let i = 0; i < this.count; i++) {
      const r = this.records[i];
      if (r.kind === REC_BB) {
        if (windfallLawOn(r.windfall)) { const a = windfallAnchorAfterShift([r.windfall[6], r.windfall[7]], offset); r.windfall[6] = a[0]; r.windfall[7] = a[1]; }
        continue;
      }
      r.matrix[12] += offset[0]; r.matrix[13] += offset[1]; r.matrix[14] += offset[2];
      if (!r.bounded) continue;
      r.sphere[0] += offset[0]; r.sphere[1] += offset[1]; r.sphere[2] += offset[2];
      for (let j = 0; j + 3 < r.subSpheres.length; j += 4) if (r.subSpheres[j + 3] >= 0) { r.subSpheres[j] += offset[0]; r.subSpheres[j + 1] += offset[1]; r.subSpheres[j + 2] += offset[2]; }
      for (let j = 0; j + 3 < r.cellSpheres.length; j += 4) { r.cellSpheres[j] += offset[0]; r.cellSpheres[j + 1] += offset[1]; r.cellSpheres[j + 2] += offset[2]; }
    }
  }
  _shiftDelta(o) {
    const to = this._shiftNow, d = this._shiftD;
    const seen = Number.isFinite(o._shAx);
    d[0] = to[0] - (seen ? o._shAx : 0); d[1] = to[1] - (seen ? o._shAy : 0); d[2] = to[2] - (seen ? o._shAz : 0);
    return d;
  }
  _shiftSeen(o) {
    const n = this._shiftNow;
    o._shAx = n[0]; o._shAy = n[1]; o._shAz = n[2];
    o._shGen = this._shiftGen;
  }
  // The memory is per placement, not per mesh, because hosts draw one mesh at many matrices. A placement past
  // SHADOW_INSTANCE_MAX is dynamic, never a wrong shadow.
  _moved(o, matrix) {
    let inst = o._shInst;
    if (!inst) { inst = o._shInst = []; this._shiftSeen(o); }
    else if (o._shGen !== this._shiftGen) {
      const d = this._shiftDelta(o);
      for (const s of inst) { s.m[12] += d[0]; s.m[13] += d[1]; s.m[14] += d[2]; }
      this._shiftSeen(o);
      if (o._shInstGrid) for (const p of inst) if (_instKeyOf(p, this._shiftNow) !== p.key) _file(o, p, this._shiftNow);
    }
    if (inst.length > SHADOW_INSTANCE_LINEAR) return this._movedFiled(o, inst, matrix);
    const x = matrix[12], y = matrix[13], z = matrix[14];
    let exact = null, best = null, bestD = SHADOW_INSTANCE_REACH * SHADOW_INSTANCE_REACH;
    const eps2 = SHADOW_STILL_EPS * SHADOW_STILL_EPS;
    for (let i = 0; i < inst.length; i++) {
      const s = inst[i], m = s.m, d = (m[12] - x) * (m[12] - x) + (m[13] - y) * (m[13] - y) + (m[14] - z) * (m[14] - z);
      if (d <= eps2) { exact = s; break; }
      if (d < bestD && s.seen !== this.frameNo) { bestD = d; best = s; }
    }
    let s = exact ?? best;
    if (!s) {
      inst.push({ m: new Float32Array(matrix), at: null, seen: this.frameNo, ord: inst.length, key: NaN, filed: false });
      if (inst.length > SHADOW_INSTANCE_LINEAR) _fileAll(o, this._shiftNow);
      return false;
    }
    s.seen = this.frameNo;
    const m = s.m;
    let same = true;
    for (let i = 0; i < 16; i++) if (Math.abs(m[i] - matrix[i]) > SHADOW_STILL_EPS) { same = false; break; }
    if (!same) { m.set(matrix); s.at = this.frameNo; }
    return s.at != null && this.frameNo - s.at < SHADOW_DYNAMIC_HOLD;
  }
  _movedFiled(o, inst, matrix) {
    const shift = this._shiftNow, R = SHADOW_INSTANCE_REACH;
    const grid = o._shInstGrid ?? _fileAll(o, shift);
    const x = matrix[12], y = matrix[13], z = matrix[14];
    const eps2 = SHADOW_STILL_EPS * SHADOW_STILL_EPS;
    let exact = null, best = null, bestD = R * R;
    const fx = (x - shift[0]) / R + SHADOW_INSTANCE_PHASE, fy = (y - shift[1]) / R + SHADOW_INSTANCE_PHASE, fz = (z - shift[2]) / R + SHADOW_INSTANCE_PHASE;
    if (Number.isFinite(fx) && Number.isFinite(fy) && Number.isFinite(fz)) {
      const cx = Math.floor(fx), cy = Math.floor(fy), cz = Math.floor(fz);
      const m0 = 2 * SHADOW_STILL_EPS / R;
      const x0 = fx - cx <= m0 ? -1 : 0, x1 = cx + 1 - fx <= m0 ? 1 : 0;
      const y0 = fy - cy <= m0 ? -1 : 0, y1 = cy + 1 - fy <= m0 ? 1 : 0;
      const z0 = fz - cz <= m0 ? -1 : 0, z1 = cz + 1 - fz <= m0 ? 1 : 0;
      for (let dx = x0; dx <= x1; dx++) {
        for (let dy = y0; dy <= y1; dy++) {
          for (let dz = z0; dz <= z1; dz++) {
            const cell = grid.get(instKey(cx + dx, cy + dy, cz + dz));
            if (!cell) continue;
            for (let i = 0; i < cell.length; i++) {
              const p = cell[i], m = p.m;
              if (exact !== null && p.ord > exact.ord) break;
              if ((m[12] - x) * (m[12] - x) + (m[13] - y) * (m[13] - y) + (m[14] - z) * (m[14] - z) <= eps2) { exact = p; break; }
            }
          }
        }
      }
      if (exact === null) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              const cell = grid.get(instKey(cx + dx, cy + dy, cz + dz));
              if (!cell) continue;
              for (let i = 0; i < cell.length; i++) {
                const p = cell[i];
                if (p.seen === this.frameNo) continue;
                const m = p.m, d = (m[12] - x) * (m[12] - x) + (m[13] - y) * (m[13] - y) + (m[14] - z) * (m[14] - z);
                if (d < bestD || (d === bestD && best !== null && p.ord < best.ord)) { bestD = d; best = p; }
              }
            }
          }
        }
      }
    }
    let s = exact ?? best;
    if (!s) {
      if (inst.length >= SHADOW_INSTANCE_MAX) {
        s = this._stalest(o, inst);
        if (s === null) return true;
        s.m.set(matrix); s.at = null; s.seen = this.frameNo;
        _file(o, s, shift);
        return false;
      }
      s = { m: new Float32Array(matrix), at: null, seen: this.frameNo, ord: inst.length, key: NaN, filed: false };
      inst.push(s);
      _file(o, s, shift);
      return false;
    }
    s.seen = this.frameNo;
    const m = s.m;
    let same = true;
    for (let i = 0; i < 16; i++) if (Math.abs(m[i] - matrix[i]) > SHADOW_STILL_EPS) { same = false; break; }
    if (!same) { m.set(matrix); s.at = this.frameNo; _file(o, s, shift); }
    return s.at != null && this.frameNo - s.at < SHADOW_DYNAMIC_HOLD;
  }
  _stalest(o, inst) {
    let q = o._shInstStale;
    if (!q || q.frame !== this.frameNo) {
      const list = [], seen = [];
      for (let i = 0; i < inst.length; i++) if (this.frameNo - inst[i].seen >= SHADOW_DYNAMIC_HOLD) list.push(inst[i]);
      list.sort((a, b) => a.seen - b.seen || a.ord - b.ord);
      for (let i = 0; i < list.length; i++) seen.push(list[i].seen);
      q = o._shInstStale = { frame: this.frameNo, list, seen, at: 0 };
    }
    while (q.at < q.list.length) {
      const i = q.at++;
      if (q.list[i].seen === q.seen[i]) return q.list[i];
    }
    return null;
  }
  _reshaped(mesh) {
    const g = mesh._vertGen ?? 0;
    if (mesh._vertSeen === undefined) { mesh._vertSeen = g; return false; }
    if (mesh._vertSeen !== g) { mesh._vertSeen = g; mesh._vertMovedAt = this.frameNo; }
    return mesh._vertMovedAt !== undefined && this.frameNo - mesh._vertMovedAt < SHADOW_DYNAMIC_HOLD;
  }
  recordMesh(mesh, matrix, texRemap, cut = 0) {
    const r = this._rec(); if (!r) return;
    r.kind = REC_MESH; r.mesh = mesh; r.matrix.set(matrix); r.texRemap = texRemap;
    r.cut = cut;
    const moved = this._moved(mesh, matrix), reshaped = this._reshaped(mesh);
    r.dynamic = moved || reshaped || r.cut > 0;
    r.bounded = !!mesh.bounds;
    if (r.bounded) {
      const sc = matrixScale(matrix);
      transformSphereScaled(matrix, mesh.bounds, sc, r.sphere);
      const subs = mesh.subMeshes;
      if (r.subSpheres.length < subs.length * 4) r.subSpheres = new Float32Array(subs.length * 4);
      for (let i = 0; i < subs.length; i++) {
        const b = subs[i]._bounds;
        if (b) transformSphereScaled(matrix, b, sc, r.subSpheres, i * 4); else r.subSpheres[i * 4 + 3] = -1;
      }
      const cells = mesh.shadowCells;
      if (cells) {
        if (r.cellSpheres.length < cells.length * 4) r.cellSpheres = new Float32Array(cells.length * 4);
        for (let i = 0; i < cells.length; i++) transformSphereScaled(matrix, cells[i]._bounds, sc, r.cellSpheres, i * 4);
      }
    }
  }
  recordTerrain(surface, matrix, arrayTex, tilemapTex, tileSize) {
    const r = this._rec(); if (!r) return;
    r.kind = REC_TERRAIN; r.surface = surface; r.matrix.set(matrix); r.arrayTex = arrayTex; r.tilemapTex = tilemapTex; r.tileSize = tileSize;
    r.dynamic = this._moved(surface, matrix);
    r.bounded = !!surface.bounds;
    if (r.bounded) transformSphere(matrix, surface.bounds, r.sphere);
  }
  recordCharacter(mesh, matrix, sphere = null, body = false, anchored = false) {
    if (!mesh) return;
    const r = this._rec(); if (!r) return;
    r.kind = REC_CHAR; r.mesh = mesh; r.matrix.set(matrix);
    r.dynamic = true;
    r.body = !!body; r.anchored = r.body && !!anchored;
    if (sphere) { r.bounded = true; r.sphere[0] = sphere[0]; r.sphere[1] = sphere[1]; r.sphere[2] = sphere[2]; r.sphere[3] = sphere[3]; }
    else {
      r.bounded = !!mesh.bounds;
      if (r.bounded) transformSphere(matrix, mesh.bounds, r.sphere);
    }
    let h = Math.imul(shId(mesh) ^ 0x2f0b3e5d, 0x9e3779b1) ^ (mesh._poseGen | 0);
    const mb = r.matrixBits;
    for (let i = 0; i < 16; i++) h = (Math.imul(h ^ mb[i], 0x85ebca6b) + i) | 0;
    const ranges = mesh.ranges;
    if (ranges) for (let i = 0; i < ranges.length; i++) if (ranges[i].hidden) h = Math.imul(h ^ (i + 1), 0xc2b2ae35);
    r.look = h | 0;
    if (mesh.skin || (!this._bodyBuilt && ranges && ranges.some((rg) => rg.alphaCut > 0 && rg.tex))) this._bodyWanted = true;
  }
  _ensureBodyPrograms() {
    if (this._bodyBuilt) return;
    this._bodyBuilt = true;
    const gl = this.gl, P = this.programs;
    const u = (p, n) => gl.getUniformLocation(p, n);
    const mint = (build, cut, skinned) => {
      if (!build) return null;
      let p = null;
      try { p = build(); } catch (e) { console.warn(`[shadow] a body's depth program would not build - ${e?.message ?? e}`); return null; }
      if (!p) return null;
      gl.useProgram(p);
      if (skinned) gl.uniform1i(u(p, 'uSkinPalette'), SKIN_PALETTE_UNIT);
      if (cut) gl.uniform1i(u(p, 'uTex'), 0);
      return { p, proj: u(p, 'uProj'), view: u(p, 'uView'), model: u(p, 'uModel'), skin: skinned ? u(p, 'uSkin') : null, tex: cut ? u(p, 'uTex') : null };
    };
    P.body = mint(this._buildBody, false, true);
    P.bodyCut = mint(this._buildBodyCut, true, true);
    P.charCut = mint(this._buildCharCut, true, false);
  }
  recordBillboards(batches, flatWind, camRight, camUp, windfall = null) {
    const r = this._rec(); if (!r) return;
    r.kind = REC_BB; r.batches = batches; r.flatWind.set(flatWind ?? this._zeroWind);
    if (windfall) r.windfall.set(windfall); else r.windfall.fill(0);
    r.right.set(camRight); r.up.set(camUp);
    r.bounded = false;
    const fw = r.flatWind, wl = Math.hypot(fw[0], fw[1]), law = windfallLawOn(r.windfall);
    let anyDyn = false;
    for (const b of batches) {
      if (!b) continue;
      const o = b.origin, ox = o ? o[0] : 0, oy = o ? o[1] : 0, oz = o ? o[2] : 0;
      const fr = b.frame ?? -1, rec = b.record, flip = !!(b.size && b.size.w < 0);
      const swaying = !!b.size && crownLean(r, wl, law, b, b.size.h) > SHADOW_SWAY_STILL;
      if (b._shSeen === true && b._shGen !== this._shiftGen) { const d = this._shiftDelta(b); b._shOx += d[0]; b._shOy += d[1]; b._shOz += d[2]; }
      if (b._shGen !== this._shiftGen) this._shiftSeen(b);
      const placeChanged = b._shSeen === true && !(Math.abs(b._shOx - ox) <= SHADOW_STILL_EPS && Math.abs(b._shOy - oy) <= SHADOW_STILL_EPS && Math.abs(b._shOz - oz) <= SHADOW_STILL_EPS);
      const lookChanged = b._shSeen === true && !(b._shFrame === fr && b._shRec === rec && b._shFlip === flip);
      if (placeChanged || lookChanged) b._shMovedAt = this.frameNo;
      // A batch whose look changes in place (an idle, a 211 prop) is a mover for good, so it never enters
      // or leaves the static caches again.
      if (lookChanged && b._dyn !== true && b.selfCard !== true && !b._place && !(b.sway > 0)) b._shIdler = true;
      const moving = b._dyn === true || b.selfCard === true || b._shIdler === true || (b._shMovedAt != null && this.frameNo - b._shMovedAt < SHADOW_DYNAMIC_HOLD);
      const dyn = moving || swaying;
      const anim = moving && !swaying && b._dyn !== true && b.selfCard !== true && o == null;
      b._shSeen = true; b._shOx = ox; b._shOy = oy; b._shOz = oz; b._shFrame = fr; b._shRec = rec; b._shFlip = flip; b._shDyn = dyn; b._shSway = swaying && !moving; b._shAnim = anim;
      if (dyn) anyDyn = true;
      if (b.selfCard === true) this._selfCard = b;
    }
    r.dynamic = anyDyn;
  }
  discard() {
    for (let i = 0; i < this.count; i++) { const r = this.records[i]; r.mesh = null; r.surface = null; r.batches = null; r.texRemap = null; }
    this.count = 0;
    this._selfCard = null;
    for (const c of this._cands) { for (let j = 0; j < c.hw; j++) { const l = c.bb[j]; if (l) l.length = 0; } c.n = 0; c.hw = 0; }
    for (const c of this._sunCands) { for (let j = 0; j < c.hw; j++) { const l = c.bb[j]; if (l) l.length = 0; } c.n = 0; c.hw = 0; }
  }


  render(f) {
    const gl = this.gl;
    this.stats.records = this.count; this.stats.sunDraws = 0; this.stats.pointDraws = 0; this.stats.culled = 0;
    SHADOW_TUNING.steady = SHADOW_TUNING.override ?? !!getPref('steadyShadows');
    SHADOW_TUNING.debug = SHADOW_TUNING.debugForce ?? !!getPref('shadowDebug');
    AIR_TUNING.calm = SHADOW_TUNING.calmForce ?? !!getPref('calmEye');
    const heldKind = this.kind;
    this.kind = shadowKind(f.sunScale, f.lightDir);
    this.frameNo++;
    this.stats.cascadesDrawn = 0; this.stats.facesDrawn = 0; this.stats.staticFaces = 0; this.stats.dynFaces = 0; this.stats.moverFaces = 0; this.stats.blits = 0; this.stats.cachedSlots = 0;
    this.stats.loSlots = 0; this.stats.loFaces = 0;
    // A short run of frames with no casters keeps the last maps; only a run past SHADOW_EMPTY_HOLD clears them.
    if (this.count === 0) {
      this._emptyRun = (this._emptyRun ?? 0) + 1;
      if (!f.cut && this._emptyRun <= SHADOW_EMPTY_HOLD && this._hadMaps && heldKind !== null && heldKind === this.kind) {
        if (SHADOW_TUNING.debug) console.log(`[shadow] f${this.frameNo} empty frame held (${this._emptyRun}/${SHADOW_EMPTY_HOLD})`);
        return;
      }
      this.sunParams[3] = 0; this.pointParams.fill(0); this.shadowIndex.fill(-1); this.casterOf.fill(-1); this.casters = 0;
      this.kind = null; this._hadMaps = false; this._slotLight.fill(NaN); this._slotId.fill(NO_LIGHT_ID); this._sunDrawn.fill(0); return;
    }
    this._emptyRun = 0; this._hadMaps = true;
    if (this._bodyWanted) this._ensureBodyPrograms();
    this.sunParams[3] = 0; this.pointParams.fill(0); this.shadowIndex.fill(-1); this.casterOf.fill(-1); this.casters = 0;
    // The light projection is not mirrored, so winding is not the world's; both faces of an open model must cast.
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.colorMask(false, false, false, false);
    if (this.kind === 'sun') {
      const k = f.cascadeScale > 1 ? f.cascadeScale : 1;
      if (k !== this._sunScaleK) { this._sunScaleK = k; this._sunDrawn.fill(0); }
      sunAnchorFor(f.eye, this._sunAnchor, f.lightDir, sunTexelWorld(SHADOW_CASCADES.length - 1, k));
      sunCascadeMatrices(f.eye, f.lightDir, this._sunVPNew, this._sunAnchor, k);
      const ld = f.lightDir;
      const rl = Math.hypot(ld[2], ld[0]) || 1;
      this._right[0] = ld[2] / rl; this._right[1] = 0; this._right[2] = -ld[0] / rl;
      const last = SHADOW_CASCADES.length - 1;
      const sunCand = SHADOW_TUNING.sunPrepass !== false ? this._sunCandidates(this._sunVPNew) : null;
      for (let c = 0; c < SHADOW_CASCADES.length; c++) {
        if (c === last && this._sunDrawn[c] && !SHADOW_TUNING.steady && this.frameNo % SHADOW_FAR_CASCADE_EVERY !== 0) continue;
        this.sunVP[c].set(this._sunVPNew[c]);
        meterFor(gl)?.mark(`shadow.sun${c}`);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sunFbos[c]);
        gl.viewport(0, 0, SHADOW_SUN_SIZE, SHADOW_SUN_SIZE);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        this.stats.sunDraws += this.replay(f, this.sunVP[c], null, false, SHADOW_CASCADE_MIN_RADIUS_TEXELS * sunTexelWorld(c, k), sunTexelWorld(c, k), REPLAY_ALL, true, sunCand ? sunCand[c] : null);
        this._sunDrawn[c] = 1; this.stats.cascadesDrawn++;
      }
      for (let c = 0; c < SHADOW_CASCADES.length; c++) { this.sunParams[c] = SHADOW_CASCADES[c] * k; this.sunTexel[c] = sunTexelWorld(c, k); this._sunVPFlat.set(this.sunVP[c], c * 16); }
      this.sunParams[3] = 1;
      this.sunOrigin[0] = f.eye[0]; this.sunOrigin[1] = f.eye[1]; this.sunOrigin[2] = f.eye[2]; this.sunOrigin[3] = 1;
    } else this._sunDrawn.fill(0);
    meterFor(gl)?.mark('shadow.lamps');
    const selfAt = f.pointLights?.length ? this._selfCardAt(this._selfAt) : null;
    const selfLamps = Math.max(0, Math.min(SHADOW_POINT_CASTERS, SHADOW_TUNING.selfLamps ?? SHADOW_SELF_LAMPS));
    const casters = reserveSelfCasters(pickShadowCasters(f.pointLights, f.eye, SHADOW_POINT_CASTERS, f.carried, this._heldCasters, this._heldCasterN),
      f.pointLights, selfAt, selfLamps, SHADOW_POINT_CASTERS, f.carried, this._heldCasters, this._heldCasterN);
    this._heldCasterN = holdCasters(this._heldCasters, f.pointLights, casters);
    if (this.cacheOn && casters.length) this._ensureCache();
    const L = f.pointLights;
    // The carried light is -2 in the caster table: no slot and no contact march (enhancedLighting.js reads it too).
    if (f.carried) for (let i = 0, m = Math.min(L.length >> 2, SHADOW_CASTER_TABLE); i < m; i++) if (f.carried[i]) this.casterOf[i] = -2;
    // A picked light keeps the slot whose cache is its own, found by identity and then by place; the rest take
    // free slots nearest first.
    const ids = f.ids ?? null;
    const slotOf = this._slotOfScratch; slotOf.fill(-1);
    const taken = this._slotTakenScratch; taken.fill(0);
    const own = this._slotOwnScratch; own.fill(0);
    const sl = this._slotLight, sid = this._slotId;
    const idOf = (i) => (ids && i < ids.length ? ids[i] : NO_LIGHT_ID);
    for (let rank = 0; rank < casters.length; rank++) {
      const id = idOf(casters[rank]);
      if (id === NO_LIGHT_ID) continue;
      for (let k = 0; k < SHADOW_POINT_CASTERS; k++) {
        if (!taken[k] && sid[k] === id) { slotOf[rank] = k; taken[k] = 1; own[rank] = 1; break; }
      }
    }
    for (let rank = 0; rank < casters.length; rank++) {
      if (slotOf[rank] >= 0) continue;
      const i = casters[rank];
      for (let k = 0; k < SHADOW_POINT_CASTERS; k++) {
        if (!taken[k] && samePlace(sl, k * 4, L, i * 4)) { slotOf[rank] = k; taken[k] = 1; break; }
      }
    }
    for (let rank = 0; rank < casters.length; rank++) {
      if (slotOf[rank] >= 0) continue;
      for (let k = 0; k < SHADOW_POINT_CASTERS; k++) if (!taken[k]) { slotOf[rank] = k; taken[k] = 1; break; }
    }
    const farOf = this._farOf;
    for (let rank = 0; rank < casters.length; rank++) {
      const i = casters[rank], o = slotOf[rank] * 4;
      const same = samePlace(sl, o, L, i * 4);
      farOf[rank] = same ? heldShadowFar(sl[o + 3], L[i * 4 + 3]) : shadowFarFor(L[i * 4 + 3]);
    }
    this._candWalked = false;
    let anyDyn = false;
    for (let i = 0; i < this.count; i++) if (this.records[i].dynamic) { anyDyn = true; break; }
    if (this.cacheOn && casters.length) {
      const cp = this._sigCasters;
      for (let rank = 0; rank < casters.length; rank++) {
        const i = casters[rank];
        cp[rank * 4] = L[i * 4]; cp[rank * 4 + 1] = L[i * 4 + 1]; cp[rank * 4 + 2] = L[i * 4 + 2]; cp[rank * 4 + 3] = farOf[rank];
      }
      this._staticSignatures(cp, casters.length, this._sigOut, !f.everyLight);
    }
    let selfN = 0;
    for (let rank = 0; rank < casters.length; rank++) {
      const i = casters[rank], k = slotOf[rank];
      const pos = [L[i * 4], L[i * 4 + 1], L[i * 4 + 2]];
      // The shadow far, not the live range, so a flicker is no change; the matrices and pointParams use it.
      const far = farOf[rank];
      const o = k * 4;
      const changed = !(samePlace(sl, o, pos, 0) && sl[o + 3] === far);
      const near = nearestRank(casters, L, f.eye, rank) < SHADOW_NEAR_CASTERS;
      // The player's card casts only into maps redrawn every frame, so it never trails the player by a frame.
      const selfNear = selfAt ? (nearestRank(casters, L, selfAt, rank, this._selfHeld, this._selfHeldN) < selfLamps) : near;
      if (selfAt && selfNear && selfN < SHADOW_POINT_CASTERS) { this._selfNext[selfN * 4] = pos[0]; this._selfNext[selfN * 4 + 1] = pos[1]; this._selfNext[selfN * 4 + 2] = pos[2]; selfN++; }
      const selfWant = selfNear ? 1 : 0;
      const selfMoved = this._slotSelf[k] !== selfWant;
      const due = SHADOW_TUNING.steady || near || selfNear || (this.frameNo + k) % SHADOW_FAR_CASTER_EVERY === 0;
      // A light that moved draws its whole cube into the live layers, since its next move would discard a cache.
      const mover = own[rank] === 1 && !samePlace(sl, o, pos, 0) && SHADOW_TUNING.moverDirect !== false;
      if (!this.cacheOn || mover) {
        if (changed || due || selfMoved) {
          const cand = this._candFor(rank, L, casters, farOf);
          if (cand) this._candidateQuads(rank);
          pointFaceMatrices(pos, far, this.faceVP);
          for (let face = 0; face < 6; face++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.pointFbos[k * 6 + face]);
            gl.viewport(0, 0, SHADOW_POINT_SIZE, SHADOW_POINT_SIZE);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            this.stats.pointDraws += this.replay(f, this.faceVP[face], pos, false, 0, 0, REPLAY_ALL, selfNear, cand);
          }
          this.stats.facesDrawn += 6;
          if (mover) this.stats.moverFaces += 6;
          this._slotSelf[k] = selfWant;
        }
        this._slotCached[k] = 0; this._slotLiveDyn[k] = 0; this._faceDyn.fill(1, k * 6, k * 6 + 6);
        this._slotBodySig[k * 2 + 1] = -1;
      } else {
        const sigHash = this._sigOut[rank * 2], sigCount = this._sigOut[rank * 2 + 1];
        const staticStale = changed || !this._slotCached[k] || this._slotSig[k * 2] !== sigHash || this._slotSig[k * 2 + 1] !== sigCount;
        let matrices = false;
        if (staticStale) {
          const cand = this._candFor(rank, L, casters, farOf);
          if (cand) this._candidateQuads(rank);
          pointFaceMatrices(pos, far, this.faceVP); matrices = true;
          for (let face = 0; face < 6; face++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.cacheFbos[k * 6 + face]);
            gl.viewport(0, 0, SHADOW_POINT_SIZE, SHADOW_POINT_SIZE);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            this.stats.pointDraws += this.replay(f, this.faceVP[face], pos, false, 0, 0, REPLAY_STATIC, true, cand);
          }
          this.stats.facesDrawn += 6; this.stats.staticFaces += 6;
          this._slotCached[k] = 1; this._slotSig[k * 2] = sigHash; this._slotSig[k * 2 + 1] = sigCount;
        } else this.stats.cachedSlots++;
        const dynNear = anyDyn ? this._dynamicNear(pos, far, f.isSpectral, selfNear, this._candFor(rank, L, casters, farOf)) : DYN_NONE;
        const bodiesHeld = dynNear === DYN_BODY && this._slotBodySig[k * 2] === this._bodySig[0] && this._slotBodySig[k * 2 + 1] === this._bodySig[1];
        const dueDyn = dynNear === DYN_SWAY ? (SHADOW_TUNING.steady || (this.frameNo + k) % SHADOW_SWAY_EVERY === 0) : dynNear === DYN_BODY ? !bodiesHeld : due;
        if (dynNear && (dueDyn || staticStale || !this._slotLiveDyn[k] || selfMoved)) {
          const cand = this._candFor(rank, L, casters, farOf);
          if (cand) this._candidateQuads(rank);
          this._blitSlot(k, f.bindVao, staticStale ? FACES_ALL : this._dirtyFaces(k));
          if (!matrices) pointFaceMatrices(pos, far, this.faceVP);
          for (let face = 0; face < 6; face++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.pointFbos[k * 6 + face]);
            gl.viewport(0, 0, SHADOW_POINT_SIZE, SHADOW_POINT_SIZE);
            const drew = this.replay(f, this.faceVP[face], pos, false, 0, 0, REPLAY_DYNAMIC, selfNear, cand);
            this.stats.pointDraws += drew;
            this._faceDyn[k * 6 + face] = drew > 0 ? 1 : 0;
          }
          this.stats.facesDrawn += 6; this.stats.dynFaces += 6;
          this._slotLiveDyn[k] = 1; this._slotSelf[k] = selfWant;
          this._slotBodySig[k * 2] = this._bodySig[0]; this._slotBodySig[k * 2 + 1] = dynNear === DYN_BODY ? this._bodySig[1] : -1;
        } else if (staticStale || (!dynNear && this._slotLiveDyn[k])) {
          this._blitSlot(k, f.bindVao, staticStale ? FACES_ALL : this._dirtyFaces(k));
          this._faceDyn.fill(0, k * 6, k * 6 + 6);
          this._slotLiveDyn[k] = 0; this._slotSelf[k] = 0;
        }
      }
      sl[o] = pos[0]; sl[o + 1] = pos[1]; sl[o + 2] = pos[2]; sl[o + 3] = far;
      sid[k] = idOf(i);
      this.pointParams[k * 4] = pos[0]; this.pointParams[k * 4 + 1] = pos[1]; this.pointParams[k * 4 + 2] = pos[2]; this.pointParams[k * 4 + 3] = far;
      this.shadowIndex[k] = i;
      if (i < SHADOW_CASTER_TABLE) this.casterOf[i] = k;
    }
    for (let k = 0; k < SHADOW_POINT_CASTERS; k++) if (!taken[k]) { this._slotLight[k * 4] = NaN; this._slotId[k] = NO_LIGHT_ID; this._slotCached[k] = 0; this._slotLiveDyn[k] = 0; this._slotSelf[k] = 0; this._faceDyn.fill(1, k * 6, k * 6 + 6); }
    this._selfHeld.set(this._selfNext); this._selfHeldN = selfN;
    this.stats.selfLamps = selfN;
    if (f.everyLight) this._renderLo(f, L);
    this.casters = casters.length;
    if (SHADOW_TUNING.debug) this._debugLog(f, L, casters);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.CULL_FACE);
  }

  _debugLog(f, L, casters) {
    const key = (i) => `${L[i * 4].toFixed(1)},${L[i * 4 + 1].toFixed(1)},${L[i * 4 + 2].toFixed(1)}`;
    const now = new Set(casters.map(key));
    const prev = this._dbgSet ?? new Set();
    const gained = [...now].filter((k) => !prev.has(k)), lost = [...prev].filter((k) => !now.has(k));
    const st = this.stats;
    if (gained.length || lost.length || st.staticFaces > 0 || st.loFaces > 0) {
      console.log(`[shadow] f${this.frameNo} steady=${SHADOW_TUNING.steady} casters=${casters.length} lights=${L.length >> 2}`
        + ` +${gained.join(' | ') || '-'} -${lost.join(' | ') || '-'} staticFaces=${st.staticFaces} dynFaces=${st.dynFaces} loFaces=${st.loFaces} cascades=${st.cascadesDrawn}`
        + ` selfLamps=${st.selfLamps} calmEye=${AIR_TUNING.calm}`);
    }
    this._dbgSet = now;
    if (st.staticFaces > 0 || st.loFaces > 0) this._debugStaticDiff();
  }
  _debugStaticDiff() {
    const now = new Map();
    for (let i = 0; i < this.count; i++) {
      const r = this.records[i];
      if (r.kind === REC_BB) {
        for (const b of r.batches) {
          if (!b?.vao || b._dead || b._shDyn || b.noShadow || b.castOnly || b.conceal || b.archive === SHADOW_LIGHT_FLATS || SHADOW_NO_CAST_ARCHIVES.has(b.archive)) continue;
          const at = `${Math.round((b._shOx ?? 0) * 64)},${Math.round((b._shOz ?? 0) * 64)}`;
          now.set(`bb${shId(b)}@${at}`, `flat ${b.archive ?? '?'}-${b.record ?? '?'} n=${b.count ?? b.instances ?? '?'} at ${at} rec#${i}${r.dynamic ? ' (dyn record)' : ''}`);
        }
        continue;
      }
      if (r.dynamic) continue;
      const m = r.kind === REC_TERRAIN ? r.surface : r.mesh;
      if (!m?.vao || m._dead) continue;
      const at = `${r.matrix[12].toFixed(2)},${r.matrix[13].toFixed(2)},${r.matrix[14].toFixed(2)}`;
      now.set(`m${shId(m)}@${at}`, `${r.kind === REC_TERRAIN ? 'terrain' : 'mesh'} ${m.name ?? m.label ?? m.key ?? ''} id${shId(m)} at ${at} rec#${i}`);
    }
    const prev = this._dbgStatic;
    this._dbgStatic = now;
    if (!prev) return;
    const came = [...now.keys()].filter((k) => !prev.has(k)).map((k) => now.get(k));
    const went = [...prev.keys()].filter((k) => !now.has(k)).map((k) => prev.get(k));
    if (!came.length && !went.length) { console.log(`[shadow] f${this.frameNo} static set unchanged (${now.size}) - a rebuild for another reason (a lamp's reach, its far)`); return; }
    console.log(`[shadow] f${this.frameNo} STATIC CHANGE (${now.size}) came ${came.length}: ${came.slice(0, 6).join(' ; ') || '-'} | went ${went.length}: ${went.slice(0, 6).join(' ; ') || '-'}`);
  }
  // Folds every static record whose sphere touches the light's by identity and position, order-free; an unbounded
  // record touches everything.
  _staticSignatures(cp, nC, out, quads, anim = false) {
    for (let k = 0; k < nC; k++) { out[k * 2] = 0; out[k * 2 + 1] = 0; }
    for (let i = 0; i < this.count; i++) {
      const r = this.records[i];
      if (r.kind === REC_BB) {
        const wl = Math.hypot(r.flatWind[0], r.flatWind[1]), law = windfallLawOn(r.windfall);
        for (const b of r.batches) {
          if (!b?.vao || b._dead || (b._shDyn && !(anim && b._shAnim)) || b.noShadow || b.castOnly || b.conceal || b.archive === SHADOW_LIGHT_FLATS || SHADOW_NO_CAST_ARCHIVES.has(b.archive)) continue;
          const c = batchSphere(b, this._bSphere);
          let id = 0, at = 0, rad = -1;
          for (let k = 0; k < nC; k++) {
            const x = cp[k * 4], y = cp[k * 4 + 1], z = cp[k * 4 + 2], far = cp[k * 4 + 3];
            if (c && !spheresTouch(c[0], c[1], c[2], c[3], x, y, z, far)) continue;
            if (quads && b._place) { if (rad < 0) rad = quadRadius(r, wl, law, b); if (!placementsInCube(b, rad, x, y, z, far)) continue; }
            if (id === 0) { id = shId(b); at = Math.round(b._shOx * 64) + Math.round(b._shOz * 64) * 7919; }
            out[k * 2] = foldSignature(foldSignature(out[k * 2], id), at); out[k * 2 + 1]++;
          }
        }
        continue;
      }
      if (r.dynamic && !(anim && r.kind === REC_CHAR && r.anchored)) continue;
      const m = r.kind === REC_TERRAIN ? r.surface : r.mesh;
      if (!m?.vao || m._dead) continue;
      let id = 0, at = 0;
      for (let k = 0; k < nC; k++) {
        if (r.bounded && !spheresTouch(r.sphere[0], r.sphere[1], r.sphere[2], r.sphere[3], cp[k * 4], cp[k * 4 + 1], cp[k * 4 + 2], cp[k * 4 + 3])) continue;
        if (id === 0) { id = shId(m); at = Math.round(r.matrix[12] * 64) + Math.round(r.matrix[14] * 64) * 7919 + Math.round(r.matrix[13] * 64) * 104729; }
        out[k * 2] = foldSignature(foldSignature(out[k * 2], id), at); out[k * 2 + 1]++;
      }
    }
  }
  _selfCardAt(out) {
    const b = this._selfCard;
    if (!b || !b.vao || b._dead || b.conceal) return null;
    const c = batchSphere(b, this._bSphere);
    if (!c) return null;
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    return out;
  }
  // One walk a frame finds each ranked lantern's candidates, a superset of what any face takes, so each face draws
  // exactly what it would draw walking every record.
  /** @param {ArrayLike<number>} L @param {ArrayLike<number>} casters @param {ArrayLike<number>} farOf */
  _casterCandidates(L, casters, farOf) {
    this._candWalked = true;
    const out = this._candOf, lim = this._candLim, open = this._candOpen, fill = this._candFill, quads = this._candQuads;
    const nC = casters.length;
    let live = 0;
    for (let k = 0; k < nC; k++) {
      const i = casters[k], x = L[i * 4], y = L[i * 4 + 1], z = L[i * 4 + 2], far = farOf[k];
      const o = k * 5;
      lim[o] = x; lim[o + 1] = y; lim[o + 2] = z; lim[o + 3] = far; lim[o + 4] = cubeSlack(x, y, z, far);
      const ok = SHADOW_TUNING.facePrepass !== false && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && Number.isFinite(far);
      out[k] = ok ? this._cands[k] : null;
      quads[k] = 0;
      if (ok) { this._cands[k].n = 0; live++; }
    }
    for (let k = nC; k < out.length; k++) out[k] = null;
    if (!live) return out;
    const add = (k, i) => {
      const c = out[k];
      if (c.n === c.rec.length) { const g = new Int32Array(c.rec.length * 2); g.set(c.rec); c.rec = g; }
      c.rec[c.n] = i;
      return c.n++;
    };
    const sp = this._bSphere;
    for (let i = 0; i < this.count; i++) {
      const r = this.records[i];
      if (r.kind !== REC_BB) {
        const sx = r.sphere[0], sy = r.sphere[1], sz = r.sphere[2], sr = r.sphere[3];
        for (let k = 0; k < nC; k++) if (out[k] && (!r.bounded || cubeKeeps(lim, k, sx, sy, sz, sr))) add(k, i);
        continue;
      }
      for (let k = 0; k < nC; k++) open[k] = -1;
      for (const b of r.batches) {
        if (!b) continue;
        const c = batchSphere(b, sp);
        for (let k = 0; k < nC; k++) {
          if (!out[k] || (c && !cubeKeeps(lim, k, c[0], c[1], c[2], c[3]))) continue;
          if (b._place) quads[k] = 1;
          let j = open[k];
          if (j < 0) { j = add(k, i); open[k] = j; fill[k] = 0; out[k].bb[j] ??= []; }
          out[k].bb[j][fill[k]++] = b;
        }
      }
      for (let k = 0; k < nC; k++) if (open[k] >= 0) out[k].bb[open[k]].length = fill[k];
    }
    for (let k = 0; k < nC; k++) { const c = out[k]; if (c && c.n > c.hw) c.hw = c.n; }
    return out;
  }
  _candFor(rank, L, casters, farOf) {
    if (!this._candWalked) this._casterCandidates(L, casters, farOf);
    return this._candOf[rank];
  }
  /** @param {number} rank */
  _candidateQuads(rank) {
    const cand = this._candOf[rank];
    if (!cand || !this._candQuads[rank]) return;
    this._candQuads[rank] = 0;
    const lim = this._candLim, o = rank * 5, sp = this._bSphere, cube = this._cubeArgs;
    const rec = cand.rec, bb = cand.bb;
    let w = 0;
    for (let j = 0; j < cand.n; j++) {
      const r = this.records[rec[j]];
      if (r.kind === REC_BB) {
        const list = bb[j];
        const wl = Math.hypot(r.flatWind[0], r.flatWind[1]), law = windfallLawOn(r.windfall);
        let m = 0;
        for (let t = 0; t < list.length; t++) {
          const b = list[t];
          if (b._place) {
            const c = batchSphere(b, sp);
            if (c && c[0] === c[0] && c[1] === c[1] && c[2] === c[2] && c[3] === c[3]) {
              const rad = quadRadius(r, wl, law, b);
              if (rad === rad) {
                cube[0] = rad; cube[1] = lim[o]; cube[2] = lim[o + 1]; cube[3] = lim[o + 2]; cube[4] = lim[o + 3] + cubeReach(rad) - rad + lim[o + 4];
                if (!placementsInCubeOf(b, cube)) continue;
              }
            }
          }
          list[m++] = b;
        }
        list.length = m;
        if (m === 0) continue;
      }
      if (w !== j) { rec[w] = rec[j]; const t = bb[w]; bb[w] = bb[j]; bb[j] = t; }
      w++;
    }
    cand.n = w;
  }
  _dynamicNear(pos, far, isSpectral, self = true, cand = null) {
    let near = DYN_NONE;
    const bs = this._bodySig;
    let bodies = 0;
    bs[0] = 0; bs[1] = 0;
    const nRec = cand ? cand.n : this.count;
    for (let j = 0; j < nRec; j++) {
      const r = this.records[cand ? cand.rec[j] : j];
      if (r.kind === REC_BB) {
        if (!r.dynamic) continue;
        const wl = Math.hypot(r.flatWind[0], r.flatWind[1]), law = windfallLawOn(r.windfall);
        for (const b of (cand ? cand.bb[j] : r.batches)) {
          if (!b?._shDyn || !b.vao || b._dead || b.noShadow || b.castOnly || b.conceal) continue;
          if (b.selfCard && !self) continue;
          if (b.archive === SHADOW_LIGHT_FLATS || SHADOW_NO_CAST_ARCHIVES.has(b.archive) || (b.size && b.size.h < SHADOW_FLAT_MIN_HEIGHT) || isSpectral(b.archive) || b.ghost) continue;
          if (b._shSway && near === DYN_SWAY) continue;
          const c = batchSphere(b, this._bSphere);
          if (c && !spheresTouch(c[0], c[1], c[2], c[3], pos[0], pos[1], pos[2], far)) continue;
          if (b._place && !placementsInCube(b, quadRadius(r, wl, law, b), pos[0], pos[1], pos[2], far)) continue;
          if (!b._shSway) return DYN_MOVER;
          near = DYN_SWAY;
        }
        continue;
      }
      if (!r.dynamic) continue;
      const m = r.kind === REC_TERRAIN ? r.surface : r.mesh;
      if (!m?.vao || m._dead) continue;
      if (r.bounded && !spheresTouch(r.sphere[0], r.sphere[1], r.sphere[2], r.sphere[3], pos[0], pos[1], pos[2], far)) continue;
      if (r.kind !== REC_CHAR || !r.body) return DYN_MOVER;
      bs[0] = foldSignature(bs[0], r.look); bodies++;
    }
    bs[1] = bodies;
    if (bodies === 0) return near;
    return near === DYN_SWAY ? DYN_MOVER : DYN_BODY;
  }
  // A draw, not a blitFramebuffer: on ANGLE over Direct3D 11 a depth-only blit between array layers is not a
  // reliable copy. The triangle writes the cache texel as gl_FragDepth under DEPTH_TEST ALWAYS.
  _blitSlot(k, bindVao = null, faces = FACES_ALL) {
    if (!faces) return;
    const gl = this.gl, S = SHADOW_POINT_SIZE, C = this.programs.copy;
    gl.useProgram(C.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.cacheTex);
    gl.uniform1i(C.cache, 0);
    if (bindVao) bindVao(this._copyVao); else gl.bindVertexArray(this._copyVao);
    gl.depthFunc(gl.ALWAYS);
    for (let face = 0; face < 6; face++) {
      if (!(faces & (1 << face))) continue;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pointFbos[k * 6 + face]);
      gl.viewport(0, 0, S, S);
      gl.uniform1i(C.layer, k * 6 + face);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.stats.blits++;
    }
    gl.depthFunc(gl.LESS);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  }
  _dirtyFaces(k) {
    const fd = this._faceDyn;
    let m = 0;
    for (let face = 0; face < 6; face++) if (fd[k * 6 + face]) m |= 1 << face;
    return m;
  }

  // The cascades are nested, so a sphere outside a cascade is outside every cascade within it; each nearer list is
  // filtered from the next one out.
  /** @param {ArrayLike<Float32Array>} vps */
  _sunCandidates(vps) {
    const out = this._sunCands, planes = this._sunCandPlanes, last = SHADOW_CASCADES.length - 1;
    for (let c = 0; c <= last; c++) { spherePlanes(vps[c], planes[c]); out[c].n = 0; }
    const add = (c, i) => {
      const L = out[c];
      if (L.n === L.rec.length) { const g = new Int32Array(L.rec.length * 2); g.set(L.rec); L.rec = g; }
      L.rec[L.n] = i;
      const j = L.n++;
      L.bb[j] ??= [];
      return j;
    };
    const P = planes[last];
    for (let i = 0; i < this.count; i++) {
      const r = this.records[i];
      if (r.kind !== REC_BB) { if (recordVisible(P, r)) out[last].bb[add(last, i)].length = 0; continue; }
      let list = null, m = 0;
      for (const b of r.batches) {
        if (!b || !batchVisible(P, b)) continue;
        list ??= out[last].bb[add(last, i)];
        list[m++] = b;
      }
      if (list) list.length = m;
    }
    for (let c = last - 1; c >= 0; c--) {
      const from = out[c + 1], Q = planes[c];
      for (let t = 0; t < from.n; t++) {
        const i = from.rec[t], r = this.records[i];
        if (r.kind !== REC_BB) { if (recordVisible(Q, r)) out[c].bb[add(c, i)].length = 0; continue; }
        const list = from.bb[t];
        let to = null, m = 0;
        for (let u = 0; u < list.length; u++) {
          const b = list[u];
          if (!batchVisible(Q, b)) continue;
          to ??= out[c].bb[add(c, i)];
          to[m++] = b;
        }
        if (to) to.length = m;
      }
    }
    for (let c = 0; c <= last; c++) if (out[c].n > out[c].hw) out[c].hw = out[c].n;
    return out;
  }
  // The player's own card moves with the view. It is always a mover, casts only into maps redrawn every frame, and
  // casts in the basis it was drawn with, as Unity renders a ShadowsOnly shadow.
  replay(f, vp, lightPos, recordBasis = false, minRadius = 0, texel = 0, filter = REPLAY_ALL, self = true, cand = null) {
    // global floor, or four of this cascade's texels, whichever is more.
    const minFlatH = texel > 0 ? Math.max(SHADOW_FLAT_MIN_HEIGHT, texel * SHADOW_FLAT_MIN_TEXELS) : SHADOW_FLAT_MIN_HEIGHT;
    const gl = this.gl;
    const P = this.programs;
    const planes = spherePlanes(vp, this._planes);
    let vname = -1;
    let draws = 0;
    let bound = null;
    const use = (prog) => { if (bound !== prog) { gl.useProgram(prog.p); gl.uniformMatrix4fv(prog.proj, false, vp); gl.uniformMatrix4fv(prog.view, false, this._identityView); bound = prog; } };
    const nRec = cand ? cand.n : this.count;
    for (let j = 0; j < nRec; j++) {
      const r = this.records[cand ? cand.rec[j] : j];
      if (filter !== REPLAY_ALL && r.kind !== REC_BB && (filter === REPLAY_STATIC || filter === REPLAY_LO) === r.dynamic && !(filter === REPLAY_LO && r.kind === REC_CHAR && r.anchored)) continue;
      if (r.kind !== REC_BB && !recordVisible(planes, r)) { this.stats.culled++; continue; }
      if (minRadius > 0 && r.kind !== REC_BB && r.kind !== REC_CHAR && r.bounded && r.sphere && r.sphere[3] < minRadius) { this.stats.culled++; continue; }
      if (r.kind === REC_MESH) {
        const mesh = r.mesh;
        if (!mesh?.vao || mesh._dead || !mesh.subMeshes?.length) continue;
        let vaoBound = false;
        const cells = r.bounded && !mesh._evAnyCut ? mesh.shadowCells : null;
        const subs = cells ?? mesh.subMeshes;
        const vao = cells ? mesh.shadowVao : mesh.vao;
        // Visible sub-meshes whose ranges meet are one depth draw, since a depth replay binds nothing between them.
        let runAt = -1, runEnd = -1;
        for (let k = 0; k < subs.length; k++) {
          if (cells ? !sphereInPlanes(planes, r.cellSpheres[k * 4], r.cellSpheres[k * 4 + 1], r.cellSpheres[k * 4 + 2], r.cellSpheres[k * 4 + 3]) : !subMeshVisible(planes, r, k)) { this.stats.culled++; continue; }
          const sm = subs[k], n = sm.primitiveCount * 3;
          if (!cells && sm._evCut && sm._evTex) {
            if (runAt >= 0) { gl.drawElements(gl.TRIANGLES, runEnd - runAt, gl.UNSIGNED_INT, runAt * 4); draws++; runAt = -1; runEnd = -1; }
            use(P.meshCutout); gl.uniformMatrix4fv(P.meshCutout.model, false, r.matrix);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sm._evTex); gl.uniform1i(P.meshCutout.tex, 0);
            f.bindVao(vao);
            gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_INT, sm.startIndex * 4); draws++;
            vaoBound = false;
            continue;
          }
          if (!vaoBound) {
            const prog = r.cut > 0 ? P.meshCut : P.mesh;
            use(prog); gl.uniformMatrix4fv(prog.model, false, r.matrix);
            if (r.cut > 0) gl.uniform1f(prog.cut, r.cut);
            f.bindVao(vao); vaoBound = true;
          }
          if (sm.startIndex === runEnd) { runEnd += n; continue; }
          if (runAt >= 0) { gl.drawElements(gl.TRIANGLES, runEnd - runAt, gl.UNSIGNED_INT, runAt * 4); draws++; }
          runAt = sm.startIndex; runEnd = runAt + n;
        }
        if (runAt >= 0) { gl.drawElements(gl.TRIANGLES, runEnd - runAt, gl.UNSIGNED_INT, runAt * 4); draws++; }
      } else if (r.kind === REC_CHAR) {
        const mesh = r.mesh;
        if (!mesh?.vao || mesh._dead) continue;
        const skin = mesh.skin || null;
        if (skin && !skin.tex) continue;
        const prog = skin ? P.body : P.char;
        if (!prog) continue;
        use(prog);
        gl.uniformMatrix4fv(prog.model, false, r.matrix);
        if (skin) { gl.uniform1f(prog.skin, skin.pairs); f.holdSkin?.(skin.tex); }
        f.bindVao(mesh.vao);
        if (mesh.ranges && mesh.ranges.length) {
          const cutP = skin ? P.bodyCut : P.charCut;
          let runAt = -1, runEnd = -1;
          for (const rg of mesh.ranges) {
            if (rg.hidden || !(rg.count > 0)) continue;
            if (rg.alphaCut > 0 && rg.tex && cutP) {
              if (runAt >= 0) { gl.drawArrays(gl.TRIANGLES, runAt, runEnd - runAt); draws++; runAt = -1; runEnd = -1; }
              use(cutP);
              gl.uniformMatrix4fv(cutP.model, false, r.matrix);
              if (skin) gl.uniform1f(cutP.skin, skin.pairs);
              gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rg.tex);
              gl.drawArrays(gl.TRIANGLES, rg.first, rg.count); draws++;
              use(prog);
              continue;
            }
            if (rg.first === runEnd) { runEnd += rg.count; continue; }
            if (runAt >= 0) { gl.drawArrays(gl.TRIANGLES, runAt, runEnd - runAt); draws++; }
            runAt = rg.first; runEnd = rg.first + rg.count;
          }
          if (runAt >= 0) { gl.drawArrays(gl.TRIANGLES, runAt, runEnd - runAt); draws++; }
        } else { gl.drawArrays(gl.TRIANGLES, 0, mesh.count); draws++; }
      } else if (r.kind === REC_TERRAIN) {
        const s = r.surface;
        if (!s?.vao || s._dead) continue;
        use(P.terrain);
        gl.uniformMatrix4fv(P.terrain.model, false, r.matrix);
        f.bindVao(s.vao);
        gl.drawElements(gl.TRIANGLES, s.indexCount, gl.UNSIGNED_INT, 0);
        draws++;
      } else {
        use(P.bb);
        gl.uniform1i(P.bb.tex, 0);
        gl.uniform4fv(P.bb.flatWind, r.flatWind);
        if (P.bb.wfAxis) { gl.uniform4fv(P.bb.wfSway, r.wfSway); gl.uniform4fv(P.bb.wfAxis, r.wfAxis); }
        gl.activeTexture(gl.TEXTURE0);
        let lastSway = null;
        const perBatchRight = !recordBasis && !!lightPos;
        gl.uniform3fv(P.bb.up, recordBasis ? r.up : this._up);
        if (!perBatchRight) gl.uniform3fv(P.bb.right, recordBasis ? r.right : this._right);
        let lastTex = null;
        let faced = null;
        let lastW = NaN, lastH = NaN, lastOx = NaN, lastOy = NaN, lastOz = NaN;
        const wl = Math.hypot(r.flatWind[0], r.flatWind[1]), law = windfallLawOn(r.windfall);
        for (const b of (cand ? cand.bb[j] : r.batches)) {
          if (!b?.vao || b._dead || b.conceal || f.isSpectral(b.archive) || b.ghost) continue;
          if (filter === REPLAY_LO ? (b._shDyn && !b._shAnim) : (filter !== REPLAY_ALL && (filter === REPLAY_STATIC) === !!b._shDyn)) continue;
          if (lightPos && b.archive === SHADOW_LIGHT_FLATS) continue;
          if (lightPos && b.selfCard && !self) continue;
          if (b.noShadow || b.castOnly || SHADOW_NO_CAST_ARCHIVES.has(b.archive) || (b.size && b.size.h < minFlatH)) { this.stats.culled++; continue; }
          if (!batchVisible(planes, b)) { this.stats.culled++; continue; }
          if (b._place) {
            const rad = quadRadius(r, wl, law, b);
            if (vname < 0) vname = lightPos && SHADOW_TUNING.volumeMemo !== false ? volumeName(planes) : 0;
            if (!(vname === 0 ? placementsInVolume(b, rad, planes) : placementsInVolumeOf(b, rad, planes, vname))) { this.stats.culled++; continue; }
          }
          const key = billboardKey(b);
          const tex = f.textures.get(key);
          if (!tex) continue;
          const o = b.origin || ZERO_ORIGIN;
          const face = perBatchRight && !b.selfCard;
          if (face !== faced) {
            if (face) gl.uniform4f(P.bb.face, lightPos[0], lightPos[1], lightPos[2], 1);
            else gl.uniform4f(P.bb.face, 0, 0, 0, 0);
            faced = face;
          }
          // The camera depth image draws a flat in its drawn basis; the sun's basis would draw trees edge-on.
          if (perBatchRight && b.selfCard) {
            gl.uniform3fv(P.bb.right, r.right);
          } else if (perBatchRight) {
            const dx = lightPos[0] - o[0], dz = lightPos[2] - o[2];
            const l = Math.hypot(dx, dz) || 1;
            this._right[0] = dz / l; this._right[1] = 0; this._right[2] = -dx / l;
            gl.uniform3fv(P.bb.right, this._right);
          }
          if (o[0] !== lastOx || o[1] !== lastOy || o[2] !== lastOz) { gl.uniform3f(P.bb.origin, o[0], o[1], o[2]); lastOx = o[0]; lastOy = o[1]; lastOz = o[2]; }
          const w = b.size.w, h = b.size.h;
          if (w !== lastW || h !== lastH) { gl.uniform2f(P.bb.size, w, h); lastW = w; lastH = h; }
          const sw = swayShare(b, law);
          if (sw !== lastSway) { gl.uniform1f(P.bb.sway, sw); lastSway = sw; }
          if (tex !== lastTex) { gl.bindTexture(gl.TEXTURE_2D, tex); lastTex = tex; }
          f.bindVao(b.vao);
          gl.drawElements(gl.TRIANGLES, b.indexCount, gl.UNSIGNED_INT, b._ibOff | 0);
          draws++;
        }
      }
    }
    return draws;
  }

  upload(loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + SHADOW_SUN_UNIT);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.sunTex);
    gl.activeTexture(gl.TEXTURE0 + SHADOW_POINT_UNIT);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.pointTex);
    gl.activeTexture(gl.TEXTURE0 + SHADOW_LO_UNIT);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.loTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(loc.sunShadow, SHADOW_SUN_UNIT);
    gl.uniform1i(loc.pointShadow, SHADOW_POINT_UNIT);
    if (loc.pointShadowLo) gl.uniform1i(loc.pointShadowLo, SHADOW_LO_UNIT);
    gl.uniformMatrix4fv(loc.sunVP, false, this._sunVPFlat);
    gl.uniform4fv(loc.sunParams, this.sunParams);
    gl.uniform4fv(loc.sunTexel, this.sunTexel);
    if (loc.sunOrigin) gl.uniform4fv(loc.sunOrigin, this.sunOrigin);
    gl.uniform4fv(loc.pointParams, this.pointParams);
    gl.uniform1iv(loc.shadowIndex, this.shadowIndex);
    gl.uniform1iv(loc.casterOf, this.casterOf);
  }

}
