// @ts-check

import { buildProgram } from './glProgram.js';

export const BOLT_CORE_M = 2.5;
export const BOLT_HALO = 4;
export const BOLT_MIN_PX = 1.4;
export const BOLT_SEEN_M = 45000;
export const BOLT_COLOR = Object.freeze([0.85, 0.9, 1.0]);
export const BOLT_MAX_SEGS = 2048;

const HEAD = `#version 300 es
precision highp float;
`;
export const BOLT_VS = HEAD + `layout(location = 0) in vec3 aA;
layout(location = 1) in vec3 aB;
layout(location = 2) in vec2 aCorner;   // x: along the segment 0..1, y: across it -1..1
layout(location = 3) in float aGlow;    // the strike's brightness now x the segment's weight
uniform mat4 uVP;
uniform vec3 uEye;
uniform float uPx;      // the height of a pixel at unit distance
uniform float uCore;
uniform float uHalo;
uniform float uMinPx;
uniform float uFar;     // the camera's far plane: a vertex past it is drawn along its sight line just inside
out float vAcross;
out float vGlow;
out float vDist;
out float vThin;        // how much of the drawn width is the true core (1) rather than the pixel floor (less)
void main() {
  vec3 p = mix(aA, aB, aCorner.x);
  vec3 dir = normalize(aB - aA);
  vec3 toEye = uEye - p;
  float dist = length(toEye);
  vec3 side = normalize(cross(dir, toEye / max(dist, 1e-3)));
  // the core's width, never under the pixel floor; its halo around it
  float core = max(uCore * mix(0.35, 1.0, clamp(aGlow, 0.0, 1.0)), dist * uPx * uMinPx);
  p += side * aCorner.y * core * uHalo;
  vec3 q = p - uEye;
  float l = length(q), lim = uFar * 0.97;
  if (l > lim) p = uEye + q * (lim / l);   // the same ray, the same place on the screen, the same width there
  vAcross = aCorner.y * uHalo;
  vGlow = aGlow;
  vDist = dist;
  vThin = clamp(uCore / core, 0.0, 1.0);
  gl_Position = uVP * vec4(p, 1.0);
}`;
export const BOLT_FS = HEAD + `in float vAcross;
in float vGlow;
in float vDist;
in float vThin;
uniform vec3 uColor;
uniform float uSeen;
out vec4 o;
void main() {
  // a hot core a width across, a soft halo around it; the halo carries more of a thin far line's light
  float x = vAcross;
  float core = exp(-x * x * 2.5);
  float halo = 0.25 * exp(-x * x * 0.35);
  float air = exp(-vDist / uSeen);
  float light = (core + halo) * vGlow * air * mix(0.7, 1.0, vThin);
  o = vec4(uColor * light, 1.0);
}`;

function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function farOf(proj) {
  return proj[14] / (proj[10] + 1);
}

const CORNERS = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]];
export const BOLT_STRIDE = 9;

export function boltVertices(bolts, out) {
  let v = 0;
  for (const b of bolts) {
    const s = b.segs;
    for (let i = 0; i + 7 <= s.length; i += 7) {
      if (v + 6 > BOLT_MAX_SEGS * 6) return v;
      const glow = b.bright * s[i + 6];
      for (const [al, ac] of CORNERS) {
        const o = v * BOLT_STRIDE;
        out[o] = s[i]; out[o + 1] = s[i + 1]; out[o + 2] = s[i + 2];
        out[o + 3] = s[i + 3]; out[o + 4] = s[i + 4]; out[o + 5] = s[i + 5];
        out[o + 6] = al; out[o + 7] = ac; out[o + 8] = glow;
        v++;
      }
    }
  }
  return v;
}

export function boltGroups(bolts) {
  const groups = new Map();
  for (const b of bolts) { const c = b.color ?? BOLT_COLOR; let g = groups.get(c); if (!g) groups.set(c, g = []); g.push(b); }
  return [...groups];
}

export class LightningBoltsRenderer {
  constructor(gl) {
    this.gl = gl;
    const prog = buildProgram(gl, BOLT_VS, BOLT_FS);
    this.program = prog;
    this.u = {};
    for (const n of ['uVP', 'uEye', 'uPx', 'uCore', 'uHalo', 'uMinPx', 'uFar', 'uColor', 'uSeen']) this.u[n] = gl.getUniformLocation(prog, n);
    this.data = new Float32Array(BOLT_MAX_SEGS * 6 * BOLT_STRIDE);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const F = 4, S = BOLT_STRIDE * F;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 3 * F);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, S, 6 * F);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, S, 8 * F);
    gl.bindVertexArray(null);
    this.vao = vao;
    this._vp = new Float32Array(16);
    this.drawn = 0;
  }

  // viewH is the height of the image the world pass draws into (200 in a retro frame), so the pixel floor holds there.
  draw(bolts, proj, view, eye, seen = BOLT_SEEN_M, viewH = 0) {
    this.drawn = 0;
    if (!bolts?.length) return;
    for (const [color, group] of boltGroups(bolts)) this._drawGroup(group, color, proj, view, eye, seen, viewH);
  }

  _drawGroup(bolts, color, proj, view, eye, seen, viewH) {
    const verts = boltVertices(bolts, this.data);
    if (!verts) return;
    const gl = this.gl, U = this.u;
    mat4Multiply(this._vp, proj, view);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    gl.uniform3fv(U.uEye, eye);
    gl.uniform1f(U.uPx, 2 / (proj[5] * Math.max(1, viewH || gl.drawingBufferHeight)));
    gl.uniform1f(U.uFar, farOf(proj));
    gl.uniform1f(U.uCore, BOLT_CORE_M); gl.uniform1f(U.uHalo, BOLT_HALO); gl.uniform1f(U.uMinPx, BOLT_MIN_PX);
    gl.uniform3fv(U.uColor, color); gl.uniform1f(U.uSeen, Math.max(1000, seen));
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, verts * BOLT_STRIDE));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, verts);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.drawn += verts / 6;
  }
}
