// @ts-check
import { FOG_FACTOR_GLSL } from './labGrass.js';
import { buildProgram } from './glProgram.js';
import { duelClock } from './duelWall.js';
import { seededRng } from '../weather/wind.js';
import { CRYSTAL_R, CRYSTAL_H } from '../net/gateBrain.js';

export const CRYSTAL_GROW_MS = 1400;
export const CRYSTAL_SHATTER_MS = 900;
export const CRYSTAL_FLASH_MS = 220;
// This must cover the most crystals RECKON_CRYSTALS grows in src/net/gateBrain.js.
export const CRYSTALS_DRAW_MAX = 8;
export const CRYSTAL_POOL_R = 2.6;
export const CRYSTAL_BEAM_W = 0.45;
// The beam flow is a whole number of cycles over DUEL_CLOCK_PERIOD, so the wrapped clock never makes it jump.
export const CRYSTAL_FLOW_HZ = 2;

export const crystalGrowth = (since) => (since <= 0 ? 0 : since >= CRYSTAL_GROW_MS ? 1 : 1 - Math.pow(1 - since / CRYSTAL_GROW_MS, 3));

export function crystalCluster() {
  const rolls = seededRng(0xc7157a1);
  const pos = [], nrm = [], pc = [];
  const tri = (a, b, c, piece) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1;
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nrm.push(n[0] / l, n[1] / l, n[2] / l); pc.push(piece[0], piece[1], piece[2], piece[3]); }
  };
  const prism = (foot, dir, r, h, tip, sides, seed) => {
    const l = Math.hypot(...dir), d = dir.map((x) => x / l);
    const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let e1 = [d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]];
    const l1 = Math.hypot(...e1); e1 = e1.map((x) => x / l1);
    const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
    const at = (s, k, rr) => { const a = (k / sides) * Math.PI * 2 + seed; return [foot[0] + d[0] * s + (e1[0] * Math.cos(a) + e2[0] * Math.sin(a)) * rr, foot[1] + d[1] * s + (e1[1] * Math.cos(a) + e2[1] * Math.sin(a)) * rr, foot[2] + d[2] * s + (e1[2] * Math.cos(a) + e2[2] * Math.sin(a)) * rr]; };
    const centre = [foot[0] + d[0] * (h + tip) * 0.45, foot[1] + d[1] * (h + tip) * 0.45, foot[2] + d[2] * (h + tip) * 0.45];
    const piece = [centre[0], centre[1], centre[2], seed];
    const point = [foot[0] + d[0] * (h + tip), foot[1] + d[1] * (h + tip), foot[2] + d[2] * (h + tip)];
    for (let k = 0; k < sides; k++) {
      const b0 = at(-0.25, k, r * 0.9), b1 = at(-0.25, k + 1, r * 0.9), s0 = at(h, k, r), s1 = at(h, k + 1, r);
      tri(b0, b1, s1, piece); tri(b0, s1, s0, piece);
      tri(s0, s1, point, piece);
    }
  };
  prism([0, 0, 0], [0.08, 1, 0.05], CRYSTAL_R * 0.55, CRYSTAL_H * 0.72, CRYSTAL_H * 0.28, 6, 0.3);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rolls() * 0.6;
    const out = 0.35 + rolls() * 0.3, lean = 0.45 + rolls() * 0.45;
    const foot = [Math.cos(a) * CRYSTAL_R * out, 0, Math.sin(a) * CRYSTAL_R * out];
    const h = CRYSTAL_H * (0.28 + rolls() * 0.3);
    prism(foot, [Math.cos(a) * lean, 1, Math.sin(a) * lean], CRYSTAL_R * (0.18 + rolls() * 0.14), h * 0.72, h * 0.28, 5 + (i % 2), 1 + i * 1.7 + rolls());
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), pieces: new Float32Array(pc), count: pos.length / 3 };
}

// Both glow stages read the int uniform uKind, so both declare highp int: a fragment stage defaults to mediump.
const HEAD = `#version 300 es
precision highp float;
precision highp int;
`;
const NOISE_GLSL = `
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}`;
export const CRYSTAL_VS = HEAD + `layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
layout(location = 2) in vec4 aPiece;   // the piece's centre (its local frame) and its seed
uniform mat4 uVP;
uniform vec3 uAt;       // the crystal's foot in the scene
uniform float uYaw;
uniform float uGrow;    // how far grown, 0..1
uniform float uBroke;   // seconds since it broke, < 0 standing
out vec3 vNrm;
out vec3 vLocal;
out vec3 vWorld;
void main() {
  vec3 p = aPos;
  // grown up out of the stone: its height with the growth, its girth fuller than its height, its foot under the floor
  p.xz *= 0.35 + 0.65 * uGrow;
  p.y = p.y * uGrow - (1.0 - uGrow) * 0.4;
  if (uBroke >= 0.0) {
    // shattered: each piece flies out from the heart along its own bearing, tumbling and shrinking to nothing
    vec3 c = aPiece.xyz * vec3(0.35 + 0.65 * uGrow, uGrow, 0.35 + 0.65 * uGrow);
    float seed = aPiece.w, t = uBroke;
    vec3 dir = normalize(vec3(c.x + 0.3 * sin(seed * 5.1), 0.7 + 0.6 * fract(seed * 7.1), c.z + 0.3 * cos(seed * 3.7)));
    float speed = 5.5 + 4.5 * fract(seed * 3.3);
    vec3 off = dir * speed * t + vec3(0.0, -6.0 * t * t, 0.0);
    float sh = clamp(1.0 - t / ${(CRYSTAL_SHATTER_MS / 1000).toFixed(3)}, 0.0, 1.0);
    float a = t * (5.0 + 7.0 * fract(seed * 5.7));
    vec3 lp = p - c;
    lp = vec3(lp.x * cos(a) - lp.y * sin(a), lp.x * sin(a) + lp.y * cos(a), lp.z) * sh;
    p = c + lp + off;
  }
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 w = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  vNrm = vec3(aNrm.x * cy + aNrm.z * sy, aNrm.y, -aNrm.x * sy + aNrm.z * cy);
  vLocal = aPos;
  vWorld = uAt + w;
  gl_Position = uVP * vec4(vWorld, 1.0);
}`;
export const CRYSTAL_FS = HEAD + `in vec3 vNrm;
in vec3 vLocal;
in vec3 vWorld;
uniform vec3 uEye;
uniform vec3 uColor;    // his aspect's colour (world/gate/gateBoss.js crystalColor)
uniform float uHp;      // its health's share, 0..1
uniform float uFlash;   // struck: 1 at the blow, falling
uniform float uSeed;
uniform float uTime;    // duelClock's seconds
uniform vec3 uFogColor;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
out vec4 o;
${FOG_FACTOR_GLSL}
${NOISE_GLSL}
void main() {
  vec3 N = normalize(vNrm), V = normalize(uEye - vWorld);
  if (dot(N, V) < 0.0) N = -N;   // a facet seen from inside a broken piece lights as its outside does
  float facing = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - facing, 2.5);
  float h = clamp(vLocal.y / ${CRYSTAL_H.toFixed(2)}, 0.0, 1.0);
  // its heart: white-hot low in the cluster, his colour toward the points, breathing, dimming as it is broken down
  float breathe = 0.8 + 0.2 * sin(uTime * 6.283185307179586 + uSeed * 6.0);
  vec3 core = mix(uColor, vec3(1.0, 0.86, 0.92), 0.45 * (1.0 - h));
  vec3 heart = core * (0.75 + 0.6 * (1.0 - h)) * breathe * (0.3 + 0.7 * uHp);
  // the facets: a key light from above catching each one, the heart's light scattering out through the thin edges
  float lam = 0.3 + 0.7 * max(dot(N, normalize(vec3(0.25, 1.0, 0.35))), 0.0);
  float spec = pow(max(dot(reflect(-V, N), normalize(vec3(0.25, 1.0, 0.35))), 0.0), 24.0);
  float shimmer = smoothstep(0.8, 1.0, vnoise(vec2(vLocal.x * 2.3 + vLocal.z * 1.7, vLocal.y * 1.5 - uTime * 0.8)));
  // cracks spreading through it as its health goes, burning white
  float crackAmt = clamp((1.0 - uHp) * 1.3, 0.0, 1.0);
  float crack = crackAmt * (1.0 - smoothstep(0.0, 0.05, abs(vnoise(vec2(vLocal.x * 3.3 + vLocal.y * 1.9, vLocal.z * 3.1 - vLocal.y * 0.7)) - 0.5)));
  vec3 c = uColor * 0.22 * lam + heart * (0.55 + 0.6 * (1.0 - facing)) + uColor * fres * 1.4 + vec3(1.0, 0.94, 0.97) * spec * 0.7
    + core * shimmer * 0.35 + mix(uColor, vec3(1.0), 0.6) * crack * 1.8;
  c += vec3(1.0, 0.95, 0.9) * uFlash * 0.9;
  float f = fogFactorAt(vWorld);
  o = vec4(mix(uFogColor, c, f), 1.0);
}`;
export const CRYSTAL_GLOW_VS = HEAD + `layout(location = 0) in vec2 aP;   // x across -1..1, y 0..1
uniform mat4 uVP;
uniform int uKind;
uniform vec3 uA;        // the pool's centre, or the beam's foot (the crystal's crown)
uniform vec3 uB;        // the beam's head (his chest)
uniform float uW;       // the pool's radius, or the beam's width
uniform vec3 uEye;
out vec2 vUv;
out vec3 vWorld;
void main() {
  vUv = aP;
  vec3 w;
  if (uKind == 0) {
    w = uA + vec3(aP.x * uW, 0.06, (aP.y * 2.0 - 1.0) * uW);
  } else {
    vec3 d = uB - uA, mid = uA + d * aP.y;
    vec3 side = normalize(cross(d, uEye - mid));
    w = mid + side * aP.x * uW * 0.5;
  }
  vWorld = w;
  gl_Position = uVP * vec4(w, 1.0);
}`;
export const CRYSTAL_GLOW_FS = HEAD + `in vec2 vUv;
in vec3 vWorld;
uniform int uKind;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
out vec4 o;
${FOG_FACTOR_GLSL}
void main() {
  float light;
  if (uKind == 0) {
    float r = length(vec2(vUv.x, vUv.y * 2.0 - 1.0));
    if (r > 1.0) discard;
    float ring = exp(-pow((r - 0.55) * 5.0, 2.0)) * (0.6 + 0.4 * sin(uTime * 6.283185307179586 * 1.0 - r * 6.0));
    light = (1.0 - r) * (1.0 - r) * 0.55 + ring * 0.35;
  } else {
    float across = 1.0 - abs(vUv.x);
    float flow = 0.55 + 0.45 * sin((vUv.y * 9.0 - uTime * ${CRYSTAL_FLOW_HZ}.0) * 6.283185307179586);
    light = (across * across * (0.5 + 0.7 * flow) + pow(across, 8.0) * 0.8) * (0.7 + 0.5 * vUv.y);   // a white-hot thread down its middle
  }
  vec3 col = mix(uColor, vec3(1.0, 0.9, 0.95), uKind == 1 ? 0.25 : 0.0);
  o = vec4(col * light * uAlpha * fogFactorAt(vWorld), 1.0);
}`;

const NO_FOG_RANGE = new Float32Array([0, 1]);
const NO_ITEMS = Object.freeze([]);
export const crystalDrawn = (q) => !!q && Array.isArray(q.at) && Number.isFinite(q.at[0]) && Number.isFinite(q.at[1]) && Number.isFinite(q.at[2])
  && q.grow > 0.001 && !(q.broke >= CRYSTAL_SHATTER_MS / 1000);
function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return out;
}

export const CRYSTAL_PROGRAMS = /** @type {ReadonlyArray<readonly [string, string]>} */ (Object.freeze([[CRYSTAL_VS, CRYSTAL_FS], [CRYSTAL_GLOW_VS, CRYSTAL_GLOW_FS]]));

export class CourtCrystalRenderer {
  constructor(gl) {
    this.gl = gl;
    const [crystal, glow] = CRYSTAL_PROGRAMS;
    this.program = buildProgram(gl, crystal[0], crystal[1], 'crystal');
    this.glowProgram = buildProgram(gl, glow[0], glow[1], 'crystal glow');
    this.u = {}; this.g = {};
    for (const n of ['uVP', 'uAt', 'uYaw', 'uGrow', 'uBroke', 'uEye', 'uColor', 'uHp', 'uFlash', 'uSeed', 'uTime', 'uFogColor', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos']) this.u[n] = gl.getUniformLocation(this.program, n);
    for (const n of ['uVP', 'uKind', 'uA', 'uB', 'uW', 'uEye', 'uColor', 'uAlpha', 'uTime', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos']) this.g[n] = gl.getUniformLocation(this.glowProgram, n);
    const m = crystalCluster();
    this.count = m.count;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.bufs = [[m.positions, 0, 3], [m.normals, 1, 3], [m.pieces, 2, 4]].map(([a, loc, k]) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, k, gl.FLOAT, false, 0, 0);
      return b;
    });
    this.glowVao = gl.createVertexArray();
    gl.bindVertexArray(this.glowVao);
    this.glowBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.glowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 0, 1, 0, 1, 1, -1, 0, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this._vp = new Float32Array(16);
    /** @type {any[]} */
    this._items = [];
    this.drawn = 0;
    this.glowed = 0;
  }

  draw(list, proj, view, eye, seconds, fog = null) {
    this.drawn = 0; this.glowed = 0;
    if (!this.gl) return;
    const items = this._items;
    items.length = 0;
    for (const q of Array.isArray(list) ? list : NO_ITEMS) if (items.length < CRYSTALS_DRAW_MAX && crystalDrawn(q)) items.push(q);
    if (!items.length) return;
    const gl = this.gl, U = this.u, G = this.g, time = duelClock(seconds), at = eye ?? items[0].at;
    mat4Multiply(this._vp, proj, view);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    gl.uniform3f(U.uEye, at[0], at[1], at[2]);
    gl.uniform1f(U.uTime, time);
    gl.uniform3fv(U.uFogColor, fog?.color ?? [0.32, 0.05, 0.02]);
    gl.uniform1i(U.uFogMode, fog ? fog.mode : 0);
    gl.uniform1f(U.uFogDensity, fog?.density ?? 0);
    gl.uniform2fv(U.uFogRange, fog?.range ?? NO_FOG_RANGE);
    gl.uniform3fv(U.uCamPos, fog?.camPos ?? at);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    for (const q of items) {
      gl.uniform3f(U.uAt, q.at[0], q.at[1], q.at[2]);
      gl.uniform1f(U.uYaw, q.yaw ?? 0);
      gl.uniform1f(U.uGrow, Math.min(1, q.grow));
      gl.uniform1f(U.uBroke, Number.isFinite(q.broke) ? q.broke : -1);
      gl.uniform3fv(U.uColor, q.color);
      gl.uniform1f(U.uHp, Math.max(0, Math.min(1, q.hp ?? 1)));
      gl.uniform1f(U.uFlash, Math.max(0, Math.min(1, q.flash ?? 0)));
      gl.uniform1f(U.uSeed, q.seed ?? 0);
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
      this.drawn++;
    }
    gl.useProgram(this.glowProgram);
    gl.uniformMatrix4fv(G.uVP, false, this._vp);
    gl.uniform3f(G.uEye, at[0], at[1], at[2]);
    gl.uniform1f(G.uTime, time);
    gl.uniform1i(G.uFogMode, fog ? fog.mode : 0);
    gl.uniform1f(G.uFogDensity, fog?.density ?? 0);
    gl.uniform2fv(G.uFogRange, fog?.range ?? NO_FOG_RANGE);
    gl.uniform3fv(G.uCamPos, fog?.camPos ?? at);
    gl.bindVertexArray(this.glowVao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    for (const q of items) {
      if (q.broke >= 0) continue;
      const k = Math.min(1, q.grow) * (0.35 + 0.65 * Math.max(0, Math.min(1, q.hp ?? 1)));
      gl.uniform3fv(G.uColor, q.color);
      gl.uniform1i(G.uKind, 0); gl.uniform3f(G.uA, q.at[0], q.at[1], q.at[2]); gl.uniform1f(G.uW, CRYSTAL_POOL_R); gl.uniform1f(G.uAlpha, k);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.glowed++;
      if (Array.isArray(q.beam) && q.beam.every(Number.isFinite)) {
        gl.uniform1i(G.uKind, 1); gl.uniform3f(G.uA, q.at[0], q.at[1] + CRYSTAL_H * 0.9 * Math.min(1, q.grow), q.at[2]); gl.uniform3f(G.uB, q.beam[0], q.beam[1], q.beam[2]);
        gl.uniform1f(G.uW, CRYSTAL_BEAM_W); gl.uniform1f(G.uAlpha, k * 0.9);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.glowed++;
      }
    }
    gl.bindVertexArray(null);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  }

  destroy() {
    const gl = this.gl;
    if (!gl) return;
    this.gl = null;
    for (const v of [this.vao, this.glowVao]) if (v) gl.deleteVertexArray(v);
    for (const b of [...(this.bufs ?? []), this.glowBuf]) if (b) gl.deleteBuffer(b);
    for (const p of [this.program, this.glowProgram]) if (p) gl.deleteProgram(p);
    this.vao = null; this.glowVao = null; this.bufs = []; this.glowBuf = null; this.program = null; this.glowProgram = null;
  }
}
