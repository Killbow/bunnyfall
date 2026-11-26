// @ts-check
// The pass sets its own GL state, so the caller runs renderer.markForeignPass() after a draw that returns nonzero.
import { FOG_FACTOR_GLSL } from './labGrass.js';
import { buildProgram } from './glProgram.js';
import { ringVertices } from './duelWall.js';
import { shapeBound } from '../weather/weatherMap.js';
import { CURTAIN_SHARE, CURTAIN_EXT, CURTAIN_STREAKS, CURTAIN_INTO, CELL_EDGE } from './volumetricClouds.js';

export const CURTAIN_SEGMENTS = 48;
export const CURTAINS_MAX = 8;
export const CURTAIN_REACH_M = 7000;
export const CURTAIN_BELOW_M = 300;
export const CURTAIN_FOOT_MARGIN_M = 40;
export const CURTAIN_FOOT_SAMPLES = 8;
export const CURTAIN_OWN_ALPHA = 0.35;
export const CURTAIN_MEMO_M = 32;
export const CURTAIN_RAIN_COLOR = Object.freeze([0.5, 0.54, 0.6]);
export const CURTAIN_SNOW_COLOR = Object.freeze([0.84, 0.86, 0.9]);
const _mix = new Float32Array(3);
// Returns a shared scratch array, so read it before the next call.
export function mixColor(a, b, k) {
  const t = Math.min(1, Math.max(0, Number(k) || 0));
  for (let i = 0; i < 3; i++) _mix[i] = a[i] + (b[i] - a[i]) * t;
  return _mix;
}
// The period times CURTAIN_FALL_HZ is a whole number, so the streaks do not jump when the clock wraps.
export const CURTAIN_CLOCK_PERIOD = 120;
export const CURTAIN_FALL_HZ = 0.25;
export const curtainClock = (s) => ((s % CURTAIN_CLOCK_PERIOD) + CURTAIN_CLOCK_PERIOD) % CURTAIN_CLOCK_PERIOD;

/**
 * @param {Array<any>} cells
 * @param {{ focus: number[], eye: number[], ground?: number, groundAt?: (x:number, z:number) => number, reach?: number,
 *   memo?: Map<string, number>|null }} at
 */
export function curtainsOf(cells, { focus, eye, ground = null, groundAt = null, reach = CURTAIN_REACH_M, memo = null }) {
  const far = Math.min(CURTAIN_REACH_M, Number.isFinite(reach) && reach > 0 ? reach : CURTAIN_REACH_M);
  const g = ground ?? focus?.[1] ?? 0;
  const out = [];
  for (const c of cells ?? []) {
    if (!c || !(c.fall > 0) || !Number.isFinite(c.x) || !Number.isFinite(c.z) || !(c.r > 0)) continue;
    const shape = packShape(c.shape);
    const radius = c.r * CURTAIN_SHARE;
    if (!(radius > 1)) continue;
    const reachOut = radius * shapeBound(c.shape);
    const clip = c.clip ? { x: c.clip[0], z: c.clip[1], r: c.clip[2], rim: Math.max(1, c.edge ?? c.r * CELL_EDGE), shape: packShape(c.clip[3]) } : null;
    if (clip && Math.hypot(c.x - clip.x, c.z - clip.z) - reachOut > clip.r * shapeBound(c.clip[3])) continue;
    const d = Math.hypot(c.x - focus[0], c.z - focus[2]);
    if (d - reachOut > far) continue;
    const base = (c.base ?? 600) + ((c.top ?? c.base ?? 600) - (c.base ?? 600)) * CURTAIN_INTO;
    const ramp = (dist) => Math.min(1, Math.max(0, (dist - radius * 0.85) / (radius * 0.3)));
    const alpha = ramp(Math.hypot(c.x - eye[0], c.z - eye[2])) * Math.max(CURTAIN_OWN_ALPHA, ramp(d));
    if (alpha <= 0.001) continue;
    out.push({ centre: [c.x, 0, c.z], radius, height: base, depth: CURTAIN_EXT * c.fall, kind: c.fallKind ?? 0, alpha, d, shape, clip });
  }
  out.sort((a, b) => a.d - b.d);
  const kept = [];
  // The foot sits on the lowest known land under the veil, because the sea writes no depth to cut a deeper foot.
  for (const k of out) {
    if (kept.length >= CURTAINS_MAX) break;
    // The host empties `memo` when its ground changes, so a cached lowest ground holds while the veil drifts.
    const key = memo ? `${Math.round(k.centre[0] / CURTAIN_MEMO_M)},${Math.round(k.centre[2] / CURTAIN_MEMO_M)},${Math.round(k.radius / CURTAIN_MEMO_M)}` : null;
    let lo = key !== null ? memo.get(key) : undefined;
    if (lo === undefined) {
      lo = lowestGround(groundAt, k.centre[0], k.centre[2], k.radius);
      if (key !== null) { if (memo.size >= 256) memo.clear(); memo.set(key, lo); }
    }
    const foot = Number.isFinite(lo) ? lo - CURTAIN_FOOT_MARGIN_M : g - CURTAIN_BELOW_M;
    k.centre[1] = foot;
    k.height = g + k.height - foot;
    if (k.height > 0) kept.push(k);
  }
  return kept;
}

export function packShape(sh) {
  return sh ? [sh[0], sh[1], sh[2], sh[3], sh[4], sh[5], sh[6], 0] : [1, 0, 0, 0, 0, 0, 0, 0];
}

export function lowestGround(groundAt, x, z, radius) {
  if (typeof groundAt !== 'function') return Infinity;
  let lo = Infinity;
  const at = (px, pz) => { const h = groundAt(px, pz); if (Number.isFinite(h) && h < lo) lo = h; };
  at(x, z);
  for (let i = 0; i < CURTAIN_FOOT_SAMPLES; i++) {
    const a = (i / CURTAIN_FOOT_SAMPLES) * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    at(x + ca * radius, z + sa * radius);
    at(x + ca * radius * 0.5, z + sa * radius * 0.5);
  }
  return lo;
}

const HEAD = `#version 300 es
precision highp float;
`;
// Must match shapeF in volumetricClouds.js.
const SHAPE_GLSL = `
float shapeF(vec4 a, vec4 b, vec2 u) {
  float c = u.x, s = u.y;
  float c2 = c * c - s * s, s2 = 2.0 * c * s, c3 = c * (4.0 * c * c - 3.0), s3 = s * (3.0 - 4.0 * s * s), c4 = 2.0 * c2 * c2 - 1.0, s4 = 2.0 * s2 * c2;
  return a.x * (1.0 + a.y * c2 + a.z * s2 + a.w * c3 + b.x * s3 + b.y * c4 + b.z * s4);
}
float shapedDist(vec2 v, vec4 a, vec4 b) { float l = length(v); return l / shapeF(a, b, v / max(l, 1e-3)); }
`;
export const CURTAIN_VS = HEAD + `layout(location = 0) in vec2 aUV;   // x: around 0..1, y: up 0..1
uniform mat4 uVP;
uniform vec3 uCentre;
uniform float uRadius;
uniform float uHeight;
uniform vec4 uShapeA;    // AUDIT DEEP2 D1: the storm's outline (WEATHER3h)
uniform vec4 uShapeB;
out vec2 vUV;
out vec3 vWorld;
out vec2 vNormal;
out float vReach;        // the outline's reach at this bearing (m)
${SHAPE_GLSL}
void main() {
  float a = aUV.x * 6.283185307179586;
  vec2 n = vec2(cos(a), sin(a));
  float r = uRadius * shapeF(uShapeA, uShapeB, n);
  vec3 p = uCentre + vec3(n.x * r, aUV.y * uHeight, n.y * r);
  vUV = aUV;
  vWorld = p;
  vNormal = n;
  vReach = r;
  gl_Position = uVP * vec4(p, 1.0);
}`;
export const CURTAIN_FS = HEAD + `in vec2 vUV;
in vec3 vWorld;
in vec2 vNormal;
in float vReach;
uniform vec3 uEye;       // the view's own eye - the chord is the line of sight's
uniform float uRadius;
uniform vec4 uClip;      // AUDIT DEEP2 D1: a storm's front: x, z, its reach (-1 none), the cell's rim
uniform vec4 uClipA;
uniform vec4 uClipB;
uniform float uHeight;
uniform float uDepth;    // extinction a metre (CURTAIN_EXT x the cell's fall)
uniform float uAlpha;
uniform float uTime;     // curtainClock's seconds
uniform vec3 uColor;
uniform float uLight;    // the frame's light on it, 0..1
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
out vec4 o;
${FOG_FACTOR_GLSL}
${SHAPE_GLSL}
float hash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
void main() {
  // THE CHORD: the line of sight through the solid cylinder from this front-face point - 2 R cos(angle to the
  // face's normal), taken on the ground plane (the veil is vertical)
  vec2 toEye = uEye.xz - vWorld.xz;
  float len = length(toEye);
  float c = len > 1e-3 ? max(0.0, dot(vNormal, toEye / len)) : 0.0;
  float chord = 2.0 * vReach * c;   // the outline's own reach here (AUDIT DEEP2 D1)
  // the streaks around its axis, sliding down with the fall, and their fibres
  float k = floor(vUV.x * ${CURTAIN_STREAKS}.0);
  float streak = 0.6 + 0.8 * hash(k);
  float fibre = 0.85 + 0.3 * hash(floor(vUV.x * ${CURTAIN_STREAKS * 3}.0) + 17.0);
  float slide = 0.9 + 0.1 * sin(6.283185307179586 * (vUV.y * 6.0 + uTime * ${CURTAIN_FALL_HZ.toFixed(2)}));
  float tau = uDepth * chord * streak * fibre * slide;
  // the top thins into the base it falls from; the foot is the ground's to cut
  float top = 1.0 - smoothstep(0.92, 1.0, vUV.y);
  // AUDIT DEEP2 D1: inside its front's core, across the cell's rim - VC7c's veilAcross, the same weight
  float clip = uClip.z > 0.0 ? 1.0 - smoothstep(uClip.z - uClip.w, uClip.z, shapedDist(vWorld.xz - uClip.xy, uClipA, uClipB)) : 1.0;
  float a = (1.0 - exp(-tau)) * top * clip * uAlpha * fogFactorAt(vWorld);
  o = vec4(uColor * uLight * a, a);   // premultiplied
}`;

function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

const NO_FOG_RANGE = new Float32Array([0, 1]);
const NO_WATER_FOG = new Float32Array(20);
const NO_HAZE = new Float32Array(8);
const NO_FOCUS = new Float32Array(4);
const CIRCLE = packShape(null);

export class RainCurtainsRenderer {
  constructor(gl) {
    this.gl = gl;
    const prog = buildProgram(gl, CURTAIN_VS, CURTAIN_FS);
    this.program = prog;
    this.u = {};
    for (const n of ['uVP', 'uCentre', 'uRadius', 'uHeight', 'uEye', 'uDepth', 'uAlpha', 'uTime', 'uColor', 'uLight', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos', 'uDwFog', 'uJungleHaze', 'uFocus', 'uShapeA', 'uShapeB', 'uClip', 'uClipA', 'uClipB']) this.u[n] = gl.getUniformLocation(prog, n);
    const verts = ringVertices(CURTAIN_SEGMENTS);
    this.count = verts.length / 2;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this.vao = vao;
    this._vp = new Float32Array(16);
    this.drawn = 0;
  }

  draw(curtains, proj, view, eye, seconds, { light = 1, fog = null, fade = 1 } = {}) {
    this.drawn = 0;
    const k = Math.max(0, Math.min(1, fade));
    const list = k > 0.001 ? (curtains ?? []).filter((c) => c && c.alpha > 0.001 && c.radius > 0 && c.height > 0).slice(0, CURTAINS_MAX) : [];
    if (!list.length) return 0;
    const gl = this.gl, U = this.u;
    mat4Multiply(this._vp, proj, view);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    gl.uniform3f(U.uEye, eye[0], eye[1], eye[2]);
    gl.uniform1f(U.uTime, curtainClock(seconds));
    gl.uniform1f(U.uLight, Math.max(0, Math.min(1, light)));
    gl.uniform1i(U.uFogMode, fog ? fog.mode : 0);
    gl.uniform1f(U.uFogDensity, fog?.density ?? 0);
    gl.uniform2fv(U.uFogRange, fog?.range ?? NO_FOG_RANGE);
    gl.uniform3fv(U.uCamPos, fog?.camPos ?? eye);
    if (U.uFocus) gl.uniform4fv(U.uFocus, fog?.focus ?? NO_FOCUS);
    if (U.uDwFog) gl.uniform4fv(U.uDwFog, fog?.dw ?? NO_WATER_FOG);
    if (U.uJungleHaze) gl.uniform4fv(U.uJungleHaze, fog?.haze ?? NO_HAZE);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    for (const c of list) {
      gl.uniform3f(U.uCentre, c.centre[0], c.centre[1], c.centre[2]);
      gl.uniform1f(U.uRadius, c.radius);
      gl.uniform1f(U.uHeight, c.height);
      const sh = c.shape ?? CIRCLE, cl = c.clip;
      gl.uniform4f(U.uShapeA, sh[0], sh[1], sh[2], sh[3]); gl.uniform4f(U.uShapeB, sh[4], sh[5], sh[6], sh[7]);
      if (cl) { gl.uniform4f(U.uClip, cl.x, cl.z, cl.r, cl.rim); const ks = cl.shape ?? CIRCLE; gl.uniform4f(U.uClipA, ks[0], ks[1], ks[2], ks[3]); gl.uniform4f(U.uClipB, ks[4], ks[5], ks[6], ks[7]); } else gl.uniform4f(U.uClip, 0, 0, -1, 1);
      gl.uniform1f(U.uDepth, c.depth);
      gl.uniform1f(U.uAlpha, Math.min(1, c.alpha) * k);
      gl.uniform3fv(U.uColor, mixColor(CURTAIN_RAIN_COLOR, CURTAIN_SNOW_COLOR, c.kind));
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
      this.drawn++;
    }
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    return this.drawn;
  }
}
