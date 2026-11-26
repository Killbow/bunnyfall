// @ts-check
// Wind wisps: faint streaks along the wind in a box that follows the eye and wraps, so moving reveals other wisps
// and never drags the ones in view. The count and alpha follow the wind's strength, with a floor.

import { isEnhanced } from '../ui/uiSkin.js';
import { getPref } from '../ui/uiPrefs.js';
import { buildProgram } from './glProgram.js';
import { pageParam } from '../platform/pageQuery.js';

// A whole number needs a decimal point, or GLSL reads the literal as an int.
const glslF = (v) => (Number.isInteger(v) ? `${v}.0` : String(v));
// uTime is a 32-bit float, so every shader rate is a whole number of cycles over this period, and the clock
// arrives wrapped to it in double precision.
export const WISP_CLOCK_PERIOD = 400;
export const WISP_WOBBLE_CYCLES = Object.freeze([57, 45, 38]);
export const WISP_RATE_STEPS = 100;
export const wispClock = (seconds) => ((seconds % WISP_CLOCK_PERIOD) + WISP_CLOCK_PERIOD) % WISP_CLOCK_PERIOD;
// Every gust is a whole number over this divisor, so wrapping the travel at box x WISP_GUST_DIV moves every wisp
// a whole number of boxes, which the eye-box wrap removes.
export const WISP_GUST_DIV = 40;

const HEAD = `#version 300 es
precision highp float;
`;

export const WISP_VS = HEAD + `layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aSeed;      // x,y,z in the box + phase
uniform mat4 uVP; uniform vec3 uEye;
uniform float uTime, uBox, uStrength;
uniform vec2 uWindV, uWindOff, uLen;   // WEATHER2d: the look's streak length (base, spread)
out float vT; out float vLife;
void main(){
  float seed = aSeed.w;
  vec3 p = aSeed.xyz;
  // every wisp takes its own share of the wind, so the field is not one
  // rigid direction (the rain's per-drop gust, PROTO-9)
  float gust = (${glslF(WISP_GUST_DIV * 4 / 5)} + floor(fract(seed*3.7) * ${glslF(WISP_GUST_DIV * 2 / 5 + 1)})) / ${glslF(WISP_GUST_DIV)};   // AUDIT 68 S17-wisp-wrap-gust: 0.8..1.2 in whole 1/WISP_GUST_DIV steps
  p += vec3(uWindOff.x, 0.0, uWindOff.y) * gust;
  // a slow wobble across and along, phased per wisp
  p.y += sin(uTime*${glslF(2 * Math.PI * WISP_WOBBLE_CYCLES[0] / WISP_CLOCK_PERIOD)} + seed*31.0) * 0.35;   // AUDIT-VC7 (G6): whole cycles over the clock's period
  p.xz += vec2(cos(uTime*${glslF(2 * Math.PI * WISP_WOBBLE_CYCLES[1] / WISP_CLOCK_PERIOD)} + seed*17.0), sin(uTime*${glslF(2 * Math.PI * WISP_WOBBLE_CYCLES[2] / WISP_CLOCK_PERIOD)} + seed*23.0)) * 0.25;
  p = mod(p - uEye + uBox*0.5, uBox) + uEye - uBox*0.5;
  // born, brightest at half life, gone: a fade on the wisp's own clock
  float rate = 0.35 + floor(fract(seed*5.3) * ${glslF(WISP_RATE_STEPS)}) * ${glslF(0.25 / WISP_RATE_STEPS)};   // AUDIT-VC7 (G6): in steps, each a whole number of lives over the clock's period
  vLife = sin(fract(uTime*rate + seed*7.0) * 3.14159);
  // a streak along the wind's velocity, longer in a stronger wind
  vec3 drift = vec3(uWindV.x, 0.0, uWindV.y) * gust;
  float dl = length(drift);
  vec3 vel = dl > 1e-3 ? drift / dl : vec3(1.0, 0.0, 0.0);
  float len = (uLen.x + fract(seed*13.1)*uLen.y) * (0.5 + uStrength);
  float sz = 0.05 + fract(seed*11.7)*0.05;
  p += vel * (aCorner.y-0.5) * len;
  vec3 toEye = uEye - p;
  vec3 c0 = cross(vel, toEye);
  vec3 side = length(c0) > 1e-4 ? normalize(c0) : vec3(0.0, 1.0, 0.0);
  p += side * (aCorner.x-0.5) * sz;
  vT = aCorner.y;
  gl_Position = uVP * vec4(p, 1.0);
}`;
export const WISP_FS = HEAD + `in float vT; in float vLife;
uniform float uStrength;
uniform vec3 uColor;   // WEATHER2d: the look's colour
uniform vec2 uAlpha;   // WEATHER2d: the look's alpha (base, per strength)
out vec4 o;
void main(){
  // bright toward the head, faint at the tail; never more than a breath
  float a = smoothstep(0.0, 0.45, vT) * (1.0 - smoothstep(0.85, 1.0, vT));
  a *= vLife * (uAlpha.x + uAlpha.y * uStrength);
  o = vec4(uColor, a);
}`;

export const WISP_BOX = 90;
export const WISP_MAX = 120;
// The share of WISP_MAX drawn in a dead calm, so the direction stays readable.
export const WISP_FLOOR = 0.08;

export const WISP_LOOK = Object.freeze({ color: Object.freeze([0.86, 0.89, 0.94]), alpha: Object.freeze([0.09, 0.11]), len: Object.freeze([1.2, 1.8]), count: WISP_MAX, floor: WISP_FLOOR, box: WISP_BOX });
export const SAND_LOOK = Object.freeze({ color: Object.freeze([0.80, 0.64, 0.40]), alpha: Object.freeze([0.28, 0.30]), len: Object.freeze([0.8, 1.2]), count: 7000, floor: 0, box: 70 });

export function wispCount(strength01, look = WISP_LOOK) {
  const s = Math.max(0, Math.min(1, strength01));
  const u = Math.max(0, Math.min(1, (s - 0.05) / 0.85));
  const ss = u * u * (3 - 2 * u);
  return Math.round(look.count * (look.floor + (1 - look.floor) * ss));
}

export function wispsOn(search = globalThis.location?.search ?? '') {
  return isEnhanced() && !!getPref('windWisps') && pageParam('wisps', search) !== 'off';
}

function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export class WindWispsRenderer {
  constructor(gl, look = WISP_LOOK) {
    this.gl = gl;
    this.look = look;
    const prog = buildProgram(gl, WISP_VS, WISP_FS);
    this.program = prog;
    this.u = {};
    for (const n of ['uVP', 'uEye', 'uTime', 'uBox', 'uStrength', 'uWindV', 'uWindOff', 'uLen', 'uColor', 'uAlpha']) this.u[n] = gl.getUniformLocation(prog, n);
    const n = look.count, box = look.box;
    const inst = new Float32Array(n * 4);
    let s = 0x7a3d9f1b;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    for (let i = 0; i < n; i++) { inst[i * 4] = rnd() * box; inst[i * 4 + 1] = rnd() * box; inst[i * 4 + 2] = rnd() * box; inst[i * 4 + 3] = rnd(); }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const q = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, q, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    this.vao = vao;
    this.windOff = new Float32Array(2);
    this._vp = new Float32Array(16);
    this.drawn = 0;
  }

  advance(step) {
    const period = this.look.box * WISP_GUST_DIV;
    for (let i = 0; i < 2; i++) {
      let v = this.windOff[i] + (step?.[i] ?? 0);
      v = ((v % period) + period) % period;
      this.windOff[i] = v;
    }
  }

  draw(wd, proj, view, eye, timeSeconds) {
    this.drawn = 0;
    if (!wd?.on) return;
    this.advance(wd.step);
    const count = wispCount(wd.strength01, this.look);
    if (count <= 0) return;
    const gl = this.gl, U = this.u, look = this.look;
    mat4Multiply(this._vp, proj, view);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    gl.uniform3fv(U.uEye, eye);
    gl.uniform1f(U.uTime, wispClock(timeSeconds));
    gl.uniform1f(U.uBox, look.box);
    gl.uniform1f(U.uStrength, wd.strength01);
    gl.uniform2f(U.uLen, look.len[0], look.len[1]); gl.uniform3fv(U.uColor, look.color); gl.uniform2f(U.uAlpha, look.alpha[0], look.alpha[1]);
    gl.uniform2f(U.uWindV, wd.windV[0], wd.windV[1]);
    gl.uniform2fv(U.uWindOff, this.windOff);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.drawn = count;
  }
}
