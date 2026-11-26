// @ts-check
import { FOG_FACTOR_GLSL } from './labGrass.js';
import { buildProgram } from './glProgram.js';

export const DUEL_WALL_SEGMENTS = 96;
export const DUEL_WALL_BELOW_M = 4;
export const DUEL_WALL_HEIGHT_M = 10;
// Display-encoded: foreign passes draw into the 8-bit, display-encoded frame image.
export const DUEL_WALL_COLOR = Object.freeze([0.3, 0.72, 1.0]);
export const DUEL_WALL_RINGS_MAX = 4;
// Every shader rate is a whole number of cycles over this period, so the wrapped clock never shows a seam.
export const DUEL_CLOCK_PERIOD = 120;
export const duelClock = (seconds) => ((seconds % DUEL_CLOCK_PERIOD) + DUEL_CLOCK_PERIOD) % DUEL_CLOCK_PERIOD;
export const DUEL_WALL_LINES = 72;
export const DUEL_WALL_BANDS = 14;
export const DUEL_WALL_CLIMB_HZ = 0.25;
export const DUEL_WALL_SWEEP_HZ = 0.2;
export const DUEL_WALL_SHIMMER_WAVES = 7;
export const DUEL_WALL_SHIMMER_HZ = 0.5;

const HEAD = `#version 300 es
precision highp float;
`;
export const DUEL_WALL_VS = HEAD + `layout(location = 0) in vec2 aUV;   // x: around the ring 0..1, y: up the wall 0..1
uniform mat4 uVP;
uniform vec3 uCentre;
uniform float uRadius;
uniform float uBase;     // the wall's foot, below the centre (negative)
uniform float uHeight;
out vec2 vUV;
out vec3 vWorld;
void main() {
  float a = aUV.x * 6.283185307179586;
  vec3 p = uCentre + vec3(cos(a) * uRadius, uBase + aUV.y * uHeight, sin(a) * uRadius);
  vUV = aUV;
  vWorld = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;
export const DUEL_WALL_FS = HEAD + `in vec2 vUV;
in vec3 vWorld;
uniform float uTime;     // duelClock's seconds
uniform vec3 uColor;
uniform float uAlpha;    // the ring's fade: rising in, dying away
uniform float uBelow;    // the share of the wall's height below the centre - the foot the ground mostly hides
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
out vec4 o;
${FOG_FACTOR_GLSL}
float lineOf(float x, float w) {
  float d = abs(fract(x) - 0.5);   // 0.5 on a line, 0 between two
  return smoothstep(0.5 - w, 0.5, d);
}
void main() {
  float h = vUV.y;
  float lines = lineOf(vUV.x * ${DUEL_WALL_LINES}.0, 0.035);
  float bands = lineOf(h * ${DUEL_WALL_BANDS}.0 - uTime * ${DUEL_WALL_CLIMB_HZ.toFixed(2)}, 0.06);
  float s = fract(uTime * ${DUEL_WALL_SWEEP_HZ.toFixed(2)}) * 1.2 - 0.1;
  float ds = (h - s) * 14.0;
  float sweep = exp(-ds * ds);
  float shimmer = 0.85 + 0.15 * sin(uTime * 6.283185307179586 * ${DUEL_WALL_SHIMMER_HZ.toFixed(2)} + vUV.x * 6.283185307179586 * ${DUEL_WALL_SHIMMER_WAVES}.0);
  // brightest where it meets the ground, gone toward the top
  float df = (h - uBelow) * 18.0;
  float foot = 1.0 + 0.8 * exp(-df * df);
  float top = 1.0 - smoothstep(0.5, 1.0, h);
  float light = (0.07 + 0.45 * lines + 0.22 * bands + 0.55 * sweep) * foot * top * shimmer;
  o = vec4(dwWaterFogAdd(uColor * light * uAlpha * fogFactorAt(vWorld), vWorld), 1.0);   // DW-C: an added glow's share of the carved sea's distance fog
}`;

function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function ringVertices(segments = DUEL_WALL_SEGMENTS) {
  const out = new Float32Array(segments * 6 * 2);
  let o = 0;
  for (let i = 0; i < segments; i++) {
    const a = i / segments, b = (i + 1) / segments;
    for (const [u, v] of [[a, 0], [b, 0], [b, 1], [a, 0], [b, 1], [a, 1]]) { out[o++] = u; out[o++] = v; }
  }
  return out;
}

const NO_FOG_RANGE = new Float32Array([0, 1]);
const NO_WATER_FOG = new Float32Array(20);
const NO_HAZE = new Float32Array(8);
const NO_FOCUS = new Float32Array(4);
const WHITE = new Float32Array([1, 1, 1]);

export class DuelWallRenderer {
  constructor(gl) {
    this.gl = gl;
    const prog = buildProgram(gl, DUEL_WALL_VS, DUEL_WALL_FS);
    this.program = prog;
    this.u = {};
    for (const n of ['uVP', 'uCentre', 'uRadius', 'uBase', 'uHeight', 'uTime', 'uColor', 'uAlpha', 'uBelow', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos', 'uDwFog', 'uJungleHaze', 'uFocus']) this.u[n] = gl.getUniformLocation(prog, n);
    const verts = ringVertices();
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

  draw(rings, proj, view, eye, seconds, fog = null) {
    this.drawn = 0;
    const list = (Array.isArray(rings) ? rings : []).filter((r) => r && Array.isArray(r.centre) && r.centre.length === 3 && r.centre.every(Number.isFinite) && r.radius > 0 && r.alpha > 0.001).slice(0, DUEL_WALL_RINGS_MAX);
    if (!list.length) return;
    const gl = this.gl, U = this.u;
    mat4Multiply(this._vp, proj, view);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    gl.uniform1f(U.uTime, duelClock(seconds));
    gl.uniform3fv(U.uColor, DUEL_WALL_COLOR);
    gl.uniform1f(U.uBase, -DUEL_WALL_BELOW_M);
    gl.uniform1f(U.uHeight, DUEL_WALL_HEIGHT_M);
    gl.uniform1f(U.uBelow, DUEL_WALL_BELOW_M / DUEL_WALL_HEIGHT_M);
    gl.uniform1i(U.uFogMode, fog ? fog.mode : 0);
    gl.uniform1f(U.uFogDensity, fog?.density ?? 0);
    gl.uniform2fv(U.uFogRange, fog?.range ?? NO_FOG_RANGE);
    gl.uniform3fv(U.uCamPos, fog?.camPos ?? eye ?? WHITE);
    if (U.uDwFog) gl.uniform4fv(U.uDwFog, fog?.dw ?? NO_WATER_FOG);
    if (U.uJungleHaze) gl.uniform4fv(U.uJungleHaze, fog?.haze ?? NO_HAZE);
    if (U.uFocus) gl.uniform4fv(U.uFocus, fog?.focus ?? NO_FOCUS);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    for (const r of list) {
      gl.uniform3f(U.uCentre, r.centre[0], r.centre[1], r.centre[2]);
      gl.uniform1f(U.uRadius, r.radius);
      gl.uniform1f(U.uAlpha, Math.min(1, r.alpha));
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
      this.drawn++;
    }
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
