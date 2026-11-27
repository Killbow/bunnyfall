// @ts-check
import { buildProgram } from '../glProgram.js';
import { multiply } from '../../world/mat4.js';

export const ED_CRYSTAL_H = 46;
export const ED_CRYSTAL_R = 9;
export const ED_CRYSTAL_LIFT = 70;
export const ED_CRYSTAL_SPIN = 0.25;
export const ED_AURA_R = 70;
export const ED_FAR_FLOOR = 0.3;
// Display-encoded: foreign passes draw into the 8-bit, display-encoded frame image.
export const ED_CRYSTAL_COLOR = Object.freeze([0.62, 0.24, 1.0]);
export const ED_CRYSTAL_EDGE = Object.freeze([0.95, 0.8, 1.0]);

const VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform mat4 uVP;
uniform vec3 uOrigin;
uniform float uTurn;
uniform float uScale;
uniform float uMode;      // 0 the crystal, 1 the ground ring
out vec3 vN;
out vec3 vW;
out vec2 vUV;
void main() {
  float c = cos(uTurn), s = sin(uTurn);
  vec3 p = aPos;
  vec3 n = aNormal;
  if (uMode < 0.5) {
    p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
    n = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
  }
  p *= uScale;
  vec3 w = uOrigin + p;
  vN = n; vW = w; vUV = aPos.xz;
  gl_Position = uVP * vec4(w, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vN;
in vec3 vW;
in vec2 vUV;
uniform vec3 uEye;
uniform vec3 uColor;
uniform vec3 uEdge;
uniform float uFade;
uniform float uTime;
uniform float uMode;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform float uFloor;
out vec4 frag;
float fogVis(float d) {
  if (uFogMode == 1) return clamp((uFogRange.y - d) / max(1.0, uFogRange.y - uFogRange.x), 0.0, 1.0);
  if (uFogMode == 2) return exp(-uFogDensity * d);
  if (uFogMode == 3) { float k = uFogDensity * d; return exp(-k * k); }
  return 1.0;
}
void main() {
  float d = distance(uEye, vW);
  float vis = max(uFloor, fogVis(d));
  float breathe = 0.8 + 0.2 * sin(uTime * 1.7);
  vec3 col;
  if (uMode < 0.5) {
    vec3 n = normalize(vN);
    vec3 v = normalize(uEye - vW);
    float facing = abs(dot(n, v));
    float rim = pow(1.0 - facing, 2.0);
    float key = 0.5 + 0.5 * max(0.0, dot(n, normalize(vec3(0.3, 0.8, 0.5))));
    col = uColor * (0.45 + 0.55 * key) * breathe + uEdge * rim * 0.9;
  } else {
    float r = length(vUV);
    float ring = smoothstep(1.0, 0.82, r) * smoothstep(0.55, 0.8, r);
    float fill = smoothstep(1.0, 0.0, r) * 0.35;
    float wave = 0.5 + 0.5 * sin(r * 14.0 - uTime * 2.2);
    col = uColor * (ring * (0.7 + 0.3 * wave) + fill) * breathe * 0.7;
  }
  frag = vec4(col * uFade * vis, 1.0);
}`;

function crystalVertices() {
  const out = [];
  const top = [0, 0.5, 0], bot = [0, -0.5, 0], girdleY = 0.08, n = 6, rr = ED_CRYSTAL_R / ED_CRYSTAL_H;
  const g = (i) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * rr, girdleY, Math.sin(a) * rr]; };
  const tri = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) out.push(p[0], p[1], p[2], nx, ny, nz);
  };
  for (let i = 0; i < n; i++) { tri(top, g(i + 1), g(i)); tri(bot, g(i), g(i + 1)); }
  return new Float32Array(out);
}
function auraVertices() {
  const out = [], n = 48;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    for (const p of [[0, 0], [Math.cos(a0), Math.sin(a0)], [Math.cos(a1), Math.sin(a1)]]) out.push(p[0], 0, p[1], 0, 1, 0);
  }
  return new Float32Array(out);
}

const FOG_MODES = Object.freeze({ off: 0, linear: 1, exp: 2, exp2: 3 });

export class EdCrystalPassRenderer {
  /** @param {WebGL2RenderingContext} gl */
  constructor(gl) {
    this.gl = gl;
    this.program = buildProgram(gl, VS, FS, 'elite dungeon crystal');
    this.u = {};
    for (const k of ['uVP', 'uOrigin', 'uTurn', 'uScale', 'uMode', 'uEye', 'uColor', 'uEdge', 'uFade', 'uTime', 'uFogMode', 'uFogDensity', 'uFogRange', 'uFloor']) this.u[k] = gl.getUniformLocation(this.program, k);
    const mk = (verts) => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.bindVertexArray(null);
      return { vao, count: verts.length / 6 };
    };
    this.crystal = mk(crystalVertices());
    this.aura = mk(auraVertices());
    this._vp = new Float32Array(16);
    this.drawn = 0;
  }

  draw(list, proj, view, eye, seconds, fog = null) {
    this.drawn = 0;
    const items = (Array.isArray(list) ? list : []).filter((o) => o && Array.isArray(o.origin) && o.origin.every(Number.isFinite) && o.fade > 0.001);
    if (!items.length) return 0;
    const gl = this.gl, U = this.u;
    multiply(proj, view, this._vp);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    gl.uniform3fv(U.uEye, eye);
    gl.uniform3fv(U.uColor, ED_CRYSTAL_COLOR);
    gl.uniform3fv(U.uEdge, ED_CRYSTAL_EDGE);
    const t = seconds % 3600;
    gl.uniform1f(U.uTime, t);
    const fm = typeof fog?.mode === 'number' ? fog.mode : /** @type {any} */ (FOG_MODES)[fog?.mode] ?? 0;
    gl.uniform1i(U.uFogMode, fm);
    gl.uniform1f(U.uFogDensity, fog?.density ?? 0);
    gl.uniform2f(U.uFogRange, fog?.range?.[0] ?? 0, fog?.range?.[1] ?? 1);
    gl.uniform1f(U.uFloor, ED_FAR_FLOOR);
    for (const o of items) {
      gl.uniform1f(U.uFade, Math.min(1, o.fade));
      gl.uniform1f(U.uMode, 1);
      gl.uniform3f(U.uOrigin, o.origin[0], o.origin[1] + 0.6, o.origin[2]);
      gl.uniform1f(U.uTurn, 0);
      gl.uniform1f(U.uScale, ED_AURA_R);
      gl.bindVertexArray(this.aura.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.aura.count);
      gl.uniform1f(U.uMode, 0);
      const bob = Math.sin(t * 0.6 + (o.phase ?? 0)) * 3;
      gl.uniform3f(U.uOrigin, o.origin[0], o.origin[1] + ED_CRYSTAL_LIFT + bob, o.origin[2]);
      gl.uniform1f(U.uTurn, t * ED_CRYSTAL_SPIN + (o.phase ?? 0));
      gl.uniform1f(U.uScale, ED_CRYSTAL_H);
      gl.bindVertexArray(this.crystal.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.crystal.count);
      this.drawn++;
    }
    gl.bindVertexArray(null);
    gl.depthMask(true);
    return this.drawn;
  }
}
