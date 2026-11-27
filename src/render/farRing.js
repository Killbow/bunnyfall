// @ts-check

import { SCALED_OCEAN_ELEVATION, STREAMING_TERRAIN_SCALE, TERRAIN_SIZE } from '../world/terrainSampler.js';
import { overworldTint, isWaterPixel, BASE_HEIGHT_SCALE } from '../ui/overworldModel.js';
import { reliefByteHeight, cliffFadeAt, CLIFF_REACH } from '../world/landforms.js';
import { perspective, mirrorProjectionX } from '../world/mat4.js';
import { buildProgram } from './glProgram.js';
import { RING_SEA_GLSL } from './horizonHaze.js';
import { RING_CLOUD_GLSL, cloudFarOf } from './cloudShadow.js';
import { RING_HAZE_GLSL } from './hazeGlsl.js';
import { WATER_F0, WATER_TINT } from './waterSurface.js';

export const RING_RADIUS = 48;
export const RING_REBUILD_DRIFT = 12;
export const RING_HAZE_HOLD = 0.85;
export const RING_RIM_END = (RING_RADIUS - RING_REBUILD_DRIFT) * TERRAIN_SIZE * 0.95;
export const RING_RIM_START = RING_RIM_END * 0.6;

export const ringHeight = (byte, relief = false, fade = 1) =>
  (relief ? reliefByteHeight(byte, fade) : Math.max(byte * BASE_HEIGHT_SCALE, SCALED_OCEAN_ELEVATION)) * STREAMING_TERRAIN_SCALE;
const RING_SEA_Y = ringHeight(0);

/**
 * @param {object} o
 * @param {Uint8Array} o.heightBytes
 * @param {number} o.mapWidth
 * @param {number} o.mapHeight
 * @param {(x:number,y:number)=>number} o.climateAt
 * @param {number} o.baseX
 * @param {number} o.baseY
 * @param {number} [o.radius]
 * @param {boolean} [o.relief]
 * @param {?((x: number, y: number) => number)} [o.byteAt]
 * @param {?((x: number, y: number) => number)} [o.climatePast]
 * @param {?((x: number, y: number) => boolean)} [o.pastOwn]
 */
export function buildFarRingGrid({ heightBytes, mapWidth, mapHeight, climateAt, baseX, baseY, radius = RING_RADIUS, relief = false, byteAt: byteAtPast = null, climatePast = null, pastOwn = null }) {
  const side = radius * 2 + 1;
  const positions = new Float32Array(side * side * 3);
  const normals = new Float32Array(side * side * 3);
  const colors = new Uint8Array(side * side * 3);
  const sea = new Uint8Array(side * side);
  const clampX = (x) => Math.max(0, Math.min(mapWidth - 1, x));
  const clampY = (y) => Math.max(0, Math.min(mapHeight - 1, y));
  const byteAt = byteAtPast
    ? (x, y) => (x >= 0 && y >= 0 && x < mapWidth && y < mapHeight ? heightBytes[y * mapWidth + x] : byteAtPast(x, y))
    : (x, y) => heightBytes[clampY(y) * mapWidth + clampX(x)];
  const climateOf = climatePast
    ? (x, y) => (x >= 0 && y >= 0 && x < mapWidth && y < mapHeight ? climateAt(x, y) : climatePast(x, y))
    : (x, y) => climateAt(clampX(x), clampY(y));
  let heightOf = relief ? (x, y) => ringHeight(byteAt(x, y), true, cliffFadeAt(byteAt, clampX(x), clampY(y))) : (x, y) => ringHeight(byteAt(x, y));
  if (relief && byteAtPast) {
    const pad = radius + 1 + CLIFF_REACH, gside = 2 * pad + 1, gx0 = baseX - pad, gy0 = baseY - pad;
    const grid = new Uint8Array(gside * gside);
    for (let j = 0; j < gside; j++) for (let i = 0; i < gside; i++) grid[j * gside + i] = byteAt(gx0 + i, gy0 + j);
    const gridByte = (x, y) => grid[(y - gy0) * gside + (x - gx0)];
    const own = (x, y) => (x >= 0 && y >= 0 && x < mapWidth && y < mapHeight) || !pastOwn || pastOwn(x, y);
    heightOf = (x, y) => ringHeight(gridByte(x, y), true, own(x, y) ? cliffFadeAt(gridByte, x, y) : cliffFadeAt(byteAt, clampX(x), clampY(y)));
  }
  let o = 0;
  for (let j = 0; j < side; j++) {
    const py = baseY - radius + j;
    for (let i = 0; i < side; i++) {
      const px = baseX - radius + i;
      const byte = byteAt(px, py);
      positions[o] = (px - baseX + 0.5) * TERRAIN_SIZE;
      positions[o + 1] = heightOf(px, py);
      positions[o + 2] = -(py - baseY - 0.5) * TERRAIN_SIZE;
      const nx = heightOf(px - 1, py) - heightOf(px + 1, py);
      const nz = heightOf(px, py + 1) - heightOf(px, py - 1);
      const ny = 2 * TERRAIN_SIZE;
      const l = Math.hypot(nx, ny, nz);
      normals[o] = nx / l;
      normals[o + 1] = ny / l;
      normals[o + 2] = nz / l;
      const climate = climateOf(px, py);
      const tint = overworldTint(climate, byte);
      colors[o] = tint[0]; colors[o + 1] = tint[1]; colors[o + 2] = tint[2];
      if (isWaterPixel(climate, byte) && Math.abs(positions[o + 1] - RING_SEA_Y) < 1e-3) sea[o / 3] = 255;
      o += 3;
    }
  }
  return { positions, normals, colors, sea, side };
}

// Skips only cells fully inside the streamed footprint; the streamed grid paints over the half-pixel overlap.
export function buildFarRingIndices(hole) {
  const side = (hole.radius ?? RING_RADIUS) * 2 + 1;
  const out = new Uint32Array((side - 1) * (side - 1) * 6);
  return out.subarray(0, writeRingCells(out, hole));
}

function inHole(px, py, { holeX, holeY, holeRadius, built = null }) {
  if (px < holeX - holeRadius || px > holeX + holeRadius - 1 || py < holeY - holeRadius || py > holeY + holeRadius - 1) return false;
  if (!built) return true;
  const w = 2 * holeRadius + 1, k = (py - holeY + holeRadius) * w + (px - holeX + holeRadius);
  return !!(built[k] && built[k + 1] && built[k + w] && built[k + w + 1]);
}

// `changes` moves when a key is added or removed, never on a replace; the size alone misses a drop plus a build.
export class BuiltPixels extends Map {
  constructor(entries) {
    super();
    this.changes = 0;
    if (entries) for (const [k, v] of entries) this.set(k, v);
  }
  set(k, v) { if (!this.has(k)) this.changes++; return super.set(k, v); }
  delete(k) { const had = super.delete(k); if (had) this.changes++; return had; }
  clear() { if (this.size) this.changes++; super.clear(); }
}

export function footprintBuilt(built, holeX, holeY, holeRadius) {
  const w = 2 * holeRadius + 1, out = new Uint8Array(w * w);
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) out[j * w + i] = built.has(`${holeX - holeRadius + i},${holeY - holeRadius + j}`) ? 1 : 0;
  return out;
}

function writeRingCells(out, hole) {
  const { baseX, baseY, radius = RING_RADIUS } = hole;
  const side = radius * 2 + 1;
  let o = 0;
  for (let j = 0; j < side - 1; j++) {
    const py = baseY - radius + j;
    for (let i = 0; i < side - 1; i++) {
      const px = baseX - radius + i;
      if (inHole(px, py, hole)) continue;
      const i0 = j * side + i;
      const i1 = i0 + 1;
      const i2 = i0 + side;
      const i3 = i2 + 1;
      out[o++] = i0; out[o++] = i2; out[o++] = i3;
      out[o++] = i0; out[o++] = i3; out[o++] = i1;
    }
  }
  return o;
}

export function buildSeaFillIndices(hole) {
  const cells = seaFillCells(hole);
  const indices = new Uint32Array(cells.length * 6);
  writeSeaFill(indices, 0, cells, (hole.radius ?? RING_RADIUS) * 2 + 1);
  return { indices, reach: Float32Array.from(cells, (c) => c[0]) };
}

function seaFillCells(hole) {
  const { baseX, baseY, radius = RING_RADIUS, holeX, holeY, sea } = hole;
  const side = radius * 2 + 1;
  const cells = [];
  for (let j = 0; j < side - 1; j++) {
    const py = baseY - radius + j;
    for (let i = 0; i < side - 1; i++) {
      const px = baseX - radius + i;
      if (!inHole(px, py, hole)) continue;
      const i0 = j * side + i;
      if (!(sea[i0] && sea[i0 + 1] && sea[i0 + side] && sea[i0 + side + 1])) continue;
      const ax = Math.max(Math.abs(px - holeX), Math.abs(px + 1 - holeX));
      const ay = Math.max(Math.abs(py - holeY), Math.abs(py + 1 - holeY));
      cells.push([TERRAIN_SIZE * Math.hypot(ax, ay), i0]);
    }
  }
  return cells.sort((a, b) => b[0] - a[0]);
}

function writeSeaFill(out, at, cells, side) {
  let o = at;
  for (const [, i0] of cells) {
    const i1 = i0 + 1, i2 = i0 + side, i3 = i2 + 1;
    out[o++] = i0; out[o++] = i2; out[o++] = i3;
    out[o++] = i0; out[o++] = i3; out[o++] = i1;
  }
  return o - at;
}

export function seaFillCount(reach, { far, h, offset }) {
  if (!(h > 0) || !(far > 0)) return 0;
  const bound = Math.sqrt(Math.max(0, far * far - h * h)) - offset;
  let k = 0;
  while (k < reach.length && reach[k] > bound) k++;
  return k;
}

// Float32 storage costs this about a part in a thousand, so callers pass 99% of it.
export const perspectiveFar = (m) => m[14] / (m[10] + 1);

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in float aSea;   // FAR-SEA1: 1 at the sea's vertices
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uOrigin;
uniform highp sampler2DArray uSeaTiles;   // AUDIT FAR-SEA1 L1: the camera climate's ground tiles - record 0 is its water
uniform vec3 uSeaTint;                    // the water's tint (and Iliac Puddle No More's over its open sea)
uniform vec4 uHazeFrom;   // OW-HORIZON: the point the haze is measured from (w 1: the travel view's traveller, the world fog's focus); w 0: the eye
out vec3 vNormal;
out vec3 vColor;
out float vDist;
out float vSea;
out vec3 vWorld;     // the sea's point, for its facing to the eye (world space: the frame's light directions are too)
out vec3 vSeaBody;   // the water's own body: its texel averaged by the mip chain, tinted - waterSurface.js's body, one fetch a vertex
void main() {
  vec3 world = aPos + uOrigin;
  vNormal = aNormal;
  vColor = aColor;
  vSea = aSea;
  vWorld = world;
  vSeaBody = textureLod(uSeaTiles, vec3(0.5, 0.5, 0.0), 8.0).rgb * uSeaTint;
  vec4 view = uView * vec4(world, 1.0);
  vDist = uHazeFrom.w > 0.5 ? length(world - uHazeFrom.xyz) : length(view.xyz);   // OW-HORIZON: from where the world's fog is
  gl_Position = uProj * view;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
in float vDist;
uniform vec3 uLightDir;
uniform vec3 uAmbient;
uniform float uSunScale;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;    // AUDIT EV F-R4: the moonlit night reaches the horizon too
uniform float uMoonScale;
uniform vec3 uMoonColor;
uniform vec3 uFogColor;
uniform float uFogStart; // the WORLD fog's start (0 for DFU's rows; Dynamic Skies' Sunny starts at 2000 - AUDIT 61)
uniform float uFogEnd;   // the WORLD fog's end - the ramp the seam must match
uniform float uRimStart; // where the hold starts closing into the sky
uniform float uRimEnd;   // the mesh rim - fully sky by here
uniform float uHazeHold;
${RING_SEA_GLSL}
${RING_CLOUD_GLSL}
${RING_HAZE_GLSL}
out vec4 outColor;
void main() {
  // PERF2: at the far plane - under LEQUAL it draws only where the streamed world did not, and over the sky. AUDIT
  // FAR-SEA1 P1: placed there by the pass's depthRange(1, 1), not written here - a shader that writes its depth runs
  // before its depth test, for every fragment the streamed world already covers
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, uLightDir), 0.0);
  float mdiff = max(dot(n, uMoonDir), 0.0);
  float sun = ringSun();   // OW-HORIZON: the clouds' shadow where their map knows the ground, the far law past it
  vec3 lit = vColor * (uAmbient + uSunColor * (sun * diff) + uMoonColor * (uMoonScale * mdiff));
  // FAR-SEA1: the sea is the water's own (AUDIT FAR-SEA1 L1/L2: its body, its light, its glints) - the land pays nothing for it
  float sea = vSea * uSeaLook;
  if (sea > 0.0) lit = mix(lit, ringSea(uAmbient, uSunColor, uMoonColor, sun), sea);
  // the world fog's own ramp, capped at the hold - silhouettes read
  // through the haze - then closed to 1 at the rim (FAR-SEA1: the horizon's one law)
  outColor = vec4(mix(lit, uFogColor, ringHaze(horizonHaze(vDist, uFogStart, uFogEnd, uRimStart, uRimEnd, uHazeHold))), 1.0);   // BANTHA1: and the jungle's haze
}`;

const FLAT_UP = new Float32Array([0, 1, 0]);
const NO_SKY = new Float32Array(3);
export const RING_SEA_UNIT = 12;
const FLAT_WHITE = new Float32Array([1, 1, 1]);
const NO_HAZE = new Float32Array(8);
const NO_FOCUS = new Float32Array(4);
const NO_RECT = new Float32Array(4);
// Same unit and map as the renderer CLOUD_SHADOW_UNIT, so the renderer record of that unit stays true.
export const RING_CLOUD_UNIT = 15;

export function ringDisabled(search = globalThis.location?.search) {
  try { return /[?&]ring=off\b/.test(search ?? ''); }
  catch { return false; }
}

export class FarRingRenderer {
  /** @param {any} [lane] @returns {[string, string][]} */
  static bootPrograms(lane = null) { return [[VS, lane ? lane.farRingFs : FS]]; }

  constructor(gl, opts = {}) {
    this.gl = gl;
    this.renderer = opts.renderer ?? null;
    this.lane = opts.lane ?? this.renderer?.lightingLane ?? null;
    this._dec = new Float32Array(3);
    const p = buildProgram(gl, VS, this.lane ? this.lane.farRingFs : FS, 'far ring');
    this.program = p;
    this.u = {};
    for (const name of ['uProj', 'uView', 'uOrigin', 'uLightDir', 'uAmbient', 'uSunScale', 'uSunColor',
      'uMoonDir', 'uMoonScale', 'uMoonColor',
      'uFogColor', 'uFogStart', 'uFogEnd', 'uRimStart', 'uRimEnd', 'uHazeHold',
      'uSkyZenith', 'uSkyHorizon', 'uSeaF0', 'uSeaLook',
      'uEye', 'uSeaTiles', 'uSeaTint', 'uSeaAmbient', 'uSeaSunColor', 'uSeaMoonColor',
      'uELExposure', 'uAdapt', 'uJungleHaze', 'uHazeEye',
      'uHazeFrom', 'uCloudShadowMap', 'uCloudShadowRect', 'uCloudShadowFar', 'uCloudFar']) {
      this.u[name] = gl.getUniformLocation(p, name);
    }
    this.vao = null;
    this.buffers = [];
    this.indexCount = 0;
    this.ringCount = 0;
    this._sea = null;
    this._fillReach = new Float32Array(0);
    this._holeX = 0; this._holeY = 0;
    this._seaTint = new Float32Array(3);
    this.baseX = 0; this.baseY = 0;
    this._holeKey = '';
    this._proj = null;
    this._projKey = '';
    this._built = false;
  }

  build(gridInputs, holeX, holeY, holeRadius, built = null) {
    const gl = this.gl;
    const { positions, normals, colors, sea } = buildFarRingGrid(gridInputs);
    this.baseX = gridInputs.baseX; this.baseY = gridInputs.baseY;
    this.dispose(false);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = (data, loc, type, normalized, size = 3) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, type, normalized, 0, 0);
      this.buffers.push(b);
    };
    buf(positions, 0, gl.FLOAT, false);
    buf(normals, 1, gl.FLOAT, false);
    buf(colors, 2, gl.UNSIGNED_BYTE, true);
    buf(sea, 3, gl.UNSIGNED_BYTE, true, 1);
    this._sea = sea;
    this._indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
    this.buffers.push(this._indexBuffer);
    gl.bindVertexArray(null);
    this.vao = vao;
    this._built = true;
    this._holeKey = '';
    this.punchHole(holeX, holeY, holeRadius, built);
  }

  punchHole(holeX, holeY, holeRadius, built = null) {
    const key = `${holeX},${holeY},${holeRadius},${built ? (built.changes ?? built.size) : -1}`;
    if (!this._built || key === this._holeKey) return;
    const gl = this.gl;
    const hole = { baseX: this.baseX, baseY: this.baseY, holeX, holeY, holeRadius, built: built ? footprintBuilt(built, holeX, holeY, holeRadius) : null };
    const side = RING_RADIUS * 2 + 1;
    const out = new Uint32Array((side - 1) * (side - 1) * 6);
    const ringN = writeRingCells(out, hole);
    const cells = seaFillCells({ ...hole, sea: this._sea });
    const fillN = writeSeaFill(out, ringN, cells, side);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, out.subarray(0, ringN + fillN), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    this.ringCount = ringN;
    this.indexCount = ringN + fillN;
    this._fillReach = Float32Array.from(cells, (c) => c[0]);
    this._holeX = holeX; this._holeY = holeY;
    this._holeKey = key;
  }

  _adaptOne() {
    if (this._one) return this._one;
    const gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return (this._one = tex);
  }

  needsRebuild(px, py) {
    return !this._built
      || Math.max(Math.abs(px - this.baseX), Math.abs(py - this.baseY)) > RING_REBUILD_DRIFT;
  }

  draw(view, { origin, lightDir, ambient, sunScale, sunColor, moonDir, moonScale = 0, moonColor, fogColor, fogStart = 0, fogEnd, fovY, aspect, exposure = 1, adaptTex = null,
    skyZenith = null, skyHorizon = null, eye = null, worldProj = null, seaTiles = null, seaTint = null, haze = null, hazeEye = null }) {
    if (!this._built || !this.indexCount) return;
    const gl = this.gl;
    const far = (RING_RADIUS + 1) * TERRAIN_SIZE * 1.5;
    const projKey = `${fovY},${aspect}`;
    if (projKey !== this._projKey) {
      this._proj = mirrorProjectionX(perspective(fovY, aspect, 40, far));
      this._projKey = projKey;
    }
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.u.uProj, false, this._proj);
    gl.uniformMatrix4fv(this.u.uView, false, view);
    gl.uniform3f(this.u.uOrigin, origin[0], origin[1], origin[2]);
    gl.uniform3fv(this.u.uLightDir, lightDir);
    const c3 = (c) => (this.lane ? this.lane.decode3(c, this._dec) : c);
    gl.uniform3fv(this.u.uAmbient, c3(ambient));
    gl.uniform1f(this.u.uSunScale, sunScale);
    gl.uniform3fv(this.u.uSunColor, c3(sunColor));
    gl.uniform3fv(this.u.uMoonDir, moonDir ?? FLAT_UP);
    gl.uniform1f(this.u.uMoonScale, moonScale);
    gl.uniform3fv(this.u.uMoonColor, c3(moonColor ?? FLAT_WHITE));
    if (this.lane) {
      gl.uniform1f(this.u.uELExposure, exposure);
      // Without the air pass the shader would read the texture default 0 (a quarter), so a 1x1 holding 1 is bound.
      gl.activeTexture(gl.TEXTURE0 + 11);
      gl.bindTexture(gl.TEXTURE_2D, adaptTex ?? this._adaptOne());
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(this.u.uAdapt, 11);
    }
    gl.uniform3fv(this.u.uFogColor, fogColor);
    gl.uniform1f(this.u.uFogStart, fogStart);
    gl.uniform1f(this.u.uFogEnd, fogEnd);
    gl.uniform1f(this.u.uRimStart, RING_RIM_START);
    gl.uniform1f(this.u.uRimEnd, RING_RIM_END);
    gl.uniform1f(this.u.uHazeHold, RING_HAZE_HOLD);
    gl.uniform4fv(this.u.uJungleHaze, haze ?? NO_HAZE);
    gl.uniform3fv(this.u.uHazeEye, hazeEye ?? eye ?? FLAT_UP);
    gl.uniform4fv(this.u.uHazeFrom, this.renderer?.focus ?? NO_FOCUS);
    const deck = this.renderer?.cloudShadow ?? null, farSun = cloudFarOf(deck);
    gl.uniform1f(this.u.uCloudFar, farSun);
    gl.uniform2f(this.u.uCloudShadowFar, farSun, 1);
    gl.uniform4fv(this.u.uCloudShadowRect, deck?.map ? deck.rect : NO_RECT);
    if (deck?.map) { gl.activeTexture(gl.TEXTURE0 + RING_CLOUD_UNIT); gl.bindTexture(gl.TEXTURE_2D, deck.map); gl.activeTexture(gl.TEXTURE0); }
    gl.uniform1i(this.u.uCloudShadowMap, RING_CLOUD_UNIT);
    const look = !!(skyZenith && skyHorizon && seaTiles && eye);
    gl.uniform3fv(this.u.uSkyZenith, skyZenith ?? NO_SKY);
    gl.uniform3fv(this.u.uSkyHorizon, skyHorizon ?? NO_SKY);
    gl.uniform1f(this.u.uSeaF0, WATER_F0);
    gl.uniform1f(this.u.uSeaLook, look ? 1 : 0);
    gl.uniform3fv(this.u.uEye, eye ?? FLAT_UP);
    const t = seaTint ?? FLAT_WHITE;
    for (let c = 0; c < 3; c++) this._seaTint[c] = WATER_TINT[c] * t[c];
    gl.uniform3fv(this.u.uSeaTint, this._seaTint);
    // The sea takes the undecoded colors, as the water surface does, even under the lane.
    gl.uniform3fv(this.u.uSeaAmbient, ambient);
    gl.uniform3fv(this.u.uSeaSunColor, sunColor);
    gl.uniform3fv(this.u.uSeaMoonColor, moonColor ?? FLAT_WHITE);
    gl.activeTexture(gl.TEXTURE0 + RING_SEA_UNIT);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, look ? seaTiles : null);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.u.uSeaTiles, RING_SEA_UNIT);
    let fill = 0;
    if (eye && worldProj && this._fillReach.length) {
      const cx = origin[0] + (this._holeX - this.baseX + 0.5) * TERRAIN_SIZE;
      const cz = origin[2] - (this._holeY - this.baseY - 0.5) * TERRAIN_SIZE;
      fill = seaFillCount(this._fillReach, {
        far: perspectiveFar(worldProj) * 0.99, h: eye[1] - (origin[1] + RING_SEA_Y), offset: Math.hypot(eye[0] - cx, eye[2] - cz),
      });
    }
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.depthRange(1, 1);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.ringCount + 6 * fill, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.depthRange(0, 1);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
  }

  dispose(whole = true) {
    const gl = this.gl;
    for (const b of this.buffers) gl.deleteBuffer(b);
    this.buffers = [];
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.vao = null;
    this._built = false;
    this.indexCount = 0;
    this.ringCount = 0;
    if (whole && this.program) { gl.deleteProgram(this.program); this.program = null; }
  }
}
