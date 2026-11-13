// @ts-check
// POI-3 (2026-10-14, bible/06-Systems/POI-Editor-Arc.md): THE EDITOR'S LINES - the gizmo's handles (poiGizmoLook.js),
// a selection's box, the cursor's mark, and the DM panel's routes, drawn over the world in one foreign pass a batch.
//
// Lines are screen-width quads (render/superDungeon/sdStepsPass.js's approach, never GL_LINES: WebGL caps those at one
// pixel, too thin on a high-DPI screen), each with its own color and width in CSS pixels and feathered edges. Filled
// triangles (the gizmo's cones, boxes, and squares), route bands, and their arrows go through a second program. Both
// buffers are dynamic, refilled each frame, grown and never shrunk, so a frame makes nothing once the largest batch has
// drawn. A batch is drawn on top (no depth test) or in the world (depth-tested, never written), straight alpha over. A
// foreign pass: it owns its programs and state and puts the state back; the host marks it (renderer.markForeignPass).
//
// Not a DFU member. Ledger A (POI).
import { buildProgram } from './glProgram.js';
import { telegraphLineW } from './gate/gateTelegraph.js';

const FLOATS = 14;   // aA xyz, aB xyz, aM (side, end), aC rgba, aW, aF
const VERTS = 6;     // two triangles a segment
const CORNERS = Object.freeze([-1, 0, 1, 0, 1, 1, -1, 0, 1, 1, -1, 1]);
export const MESH_FLOATS = 14;

export const ROUTE_BAND = Object.freeze({ width: 0.3, minPx: 8, speed: 0.8, spacing: 1.6 });
export const ARROW_VERTS = 12;
const DISC = 8;
const LINE_FEATHER = 0.35;   // sectors of the half disc at each end of a band segment
const NO_TRIS = Object.freeze([]);

const LINES_OUT = { data: /** @type {Float32Array} */ (new Float32Array(0)), count: 0 };
const MESH_OUT = { data: /** @type {Float32Array} */ (new Float32Array(0)), count: 0, arrows: 0, arrowAt: 0 };

/**
 * @param {ReadonlyArray<{ a: number[], b: number[], color: number[], w?: number, feather?: number, tube?: boolean, band?: any }>} lines
 * @param {Float32Array | null} [out] @param {number} [px]
 */
export function packLines(lines, out = null, px = 2) {
  let n = 0;
  for (let i = 0; i < lines.length; i++) if (!lines[i].band) n++;
  const need = n * VERTS * FLOATS;
  const data = out && out.length >= need ? out : new Float32Array(Math.max(need, (out?.length ?? 0) * 2, 64 * VERTS * FLOATS));
  let o = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.band) continue;
    // a tube's feather is written negative
    const a = l.a, b = l.b, color = l.color, w = l.w ?? px, f = (l.feather ?? LINE_FEATHER) * (l.tube ? -1 : 1);
    for (let k = 0; k < 12; k += 2) {
      data[o++] = a[0]; data[o++] = a[1]; data[o++] = a[2]; data[o++] = b[0]; data[o++] = b[1]; data[o++] = b[2];
      data[o++] = CORNERS[k]; data[o++] = CORNERS[k + 1];
      data[o++] = color[0]; data[o++] = color[1]; data[o++] = color[2]; data[o++] = color[3] ?? 1;
      data[o++] = w; data[o++] = f;
    }
  }
  LINES_OUT.data = data; LINES_OUT.count = n * VERTS;
  return LINES_OUT;
}

// Stage vertex floats in `VX` and use `Math.sqrt` so non-inlined calls do not box numbers every frame.
const VX = new Float64Array(MESH_FLOATS);
function emit(data, o) {
  for (let i = 0; i < MESH_FLOATS; i++) data[o + i] = VX[i];
  return o + MESH_FLOATS;
}
function setP(p) { VX[0] = p[0]; VX[1] = p[1]; VX[2] = p[2]; }
function setColor(c) { VX[8] = c[0]; VX[9] = c[1]; VX[10] = c[2]; VX[11] = c[3] ?? 1; }
const WING_ALONG = Object.freeze([0, 1, 2, 0, 2, 3]), WING_OUT = Object.freeze([0, 1, 1, 0, 1, 0]);

/**
 * @param {ReadonlyArray<{ a: number[], b: number[], c: number[], color: number[], ca?: number[], cb?: number[], cc?: number[] }>} tris @param {number} t
 * @param {ReadonlyArray<{ a: number[], b: number[], color: number[], band?: { s: number, total: number, flow: string, d?: number } }>} lines @param {Float32Array | null} [out]
 */
export function packMesh(tris, lines, t, out = null) {
  const SP = ROUTE_BAND.spacing;
  let need = tris.length * 3;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], bd = l.band;
    if (!bd) continue;
    const x = l.b[0] - l.a[0], y = l.b[1] - l.a[1], z = l.b[2] - l.a[2], ln = Math.max(Math.sqrt(x * x + y * y + z * z), bd.d ?? 0);
    need += 6 + 2 * DISC * 3 + (bd.flow === 'pingpong' ? 2 : 1) * (Math.floor((1.5 * ln) / SP) + 2) * ARROW_VERTS;
  }
  need *= MESH_FLOATS;
  const data = out && out.length >= need ? out : new Float32Array(Math.max(need, (out?.length ?? 0) * 2, 256 * MESH_FLOATS));
  let o = 0;
  VX.fill(0);
  for (let i = 0; i < tris.length; i++) {
    const q = tris[i];
    setColor(q.ca ?? q.color); setP(q.a); o = emit(data, o);
    setColor(q.cb ?? q.color); setP(q.b); o = emit(data, o);
    setColor(q.cc ?? q.color); setP(q.c); o = emit(data, o);
  }
  const H = ROUTE_BAND.width / 2;
  VX[13] = 1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.band) continue;
    const a = l.a, b = l.b, x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2], ln = Math.sqrt(x * x + y * y + z * z), k = ln > 1e-9 ? 1 / ln : 0;
    VX[3] = x * k; VX[4] = y * k; VX[5] = z * k;
    setColor(l.color);
    for (let v = 0; v < 6; v++) {
      const far = v === 2 || v === 4 || v === 5, out1 = v === 1 || v === 2 || v === 4;
      setP(far ? b : a); VX[6] = 0; VX[7] = out1 ? H : -H; VX[12] = out1 ? 1 : -1;
      o = emit(data, o);
    }
    for (let end = 0; end < 2; end++) {
      setP(end ? b : a);
      for (let q = 0; q < DISC; q++) {
        VX[6] = 0; VX[7] = 0; VX[12] = 0; o = emit(data, o);
        for (let e = 0; e < 2; e++) {
          const ang = ((q + e) / DISC) * Math.PI;
          VX[6] = (end ? 1 : -1) * Math.sin(ang) * H; VX[7] = Math.cos(ang) * H; VX[12] = 1;
          o = emit(data, o);
        }
      }
    }
  }
  const arrowAt = o / MESH_FLOATS;
  let arrows = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.band) continue;
    const a = l.a, b = l.b, col = l.color, x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2], ln = Math.sqrt(x * x + y * y + z * z);
    if (ln < 1e-6) continue;
    const dx = x / ln, dy = y / ln, dz = z / ln;
    VX[3] = dx; VX[4] = dy; VX[5] = dz;
    VX[8] = col[0] + (1 - col[0]) * 0.8; VX[9] = col[1] + (1 - col[1]) * 0.8; VX[10] = col[2] + (1 - col[2]) * 0.8; VX[11] = col[3] ?? 1;
    const bd = l.band, P = bd.flow === 'loop' && bd.total > SP ? bd.total / Math.round(bd.total / SP) : SP;
    const s0 = bd.s, both = bd.flow === 'pingpong', dn = bd.d > 0 ? bd.d : ln, stretch = ln / dn;
    const phase = (((ROUTE_BAND.speed * t) % P) + P) % P;
    for (let lane = 0; lane < (both ? 2 : 1); lane++) {
      const dir = lane ? -1 : 1, c = both ? (lane ? H / 2 : -H / 2) : 0, h = both ? H * 0.45 : H * 0.75;
      const depth = h * 1.2 * dir, thick = h * 0.85 * dir, first = dir > 0 ? phase : P - phase;
      VX[13] = (0.5 * Math.abs(thick) * h) / Math.sqrt(depth * depth + h * h) / H;
      for (let s = first + Math.ceil((s0 - first) / P) * P; s < s0 + dn; s += P) {
        const at = (s - s0) * stretch;
        VX[0] = a[0] + dx * at; VX[1] = a[1] + dy * at; VX[2] = a[2] + dz * at;
        for (let side = -1; side <= 1; side += 2) {
          for (let v = 0; v < 6; v++) {
            const w = WING_ALONG[v];
            VX[6] = w === 0 ? 0 : w === 1 ? -depth : w === 2 ? -depth - thick : -thick;
            VX[7] = WING_OUT[v] ? c + side * h : c;
            VX[12] = w < 2 ? 1 : -1;
            o = emit(data, o);
          }
        }
        arrows++;
      }
    }
  }
  MESH_OUT.data = data; MESH_OUT.count = o / MESH_FLOATS; MESH_OUT.arrows = arrows; MESH_OUT.arrowAt = arrowAt;
  return MESH_OUT;
}

export const POI_LINES_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aA;
layout(location = 1) in vec3 aB;
layout(location = 2) in vec2 aM;   // its side (-1, 1), its end (0, 1)
layout(location = 3) in vec4 aC;
layout(location = 4) in float aW;  // CSS px
layout(location = 5) in float aF;  // the share of the half-width faded at each edge, negative for a tube
uniform mat4 uVP;
uniform vec2 uViewport;   // px
uniform float uScale;     // px a CSS px
uniform float uAlpha;
uniform vec3 uEye;
uniform float uToEye;     // meters each end is moved toward the eye along its own ray, for the depth test alone
out vec4 vC;
out float vSide;   // -1 to 1 across the line: its edges feathered (a handle's line reads smooth at any angle)
out float vF;
out float vTube;
vec3 nearer(vec3 p) { vec3 e = uEye - p; float l = length(e); return l > 1e-6 ? p + e / l * min(uToEye, l * 0.5) : p; }
void main() {
  vec4 ca = uVP * vec4(nearer(aA), 1.0), cb = uVP * vec4(nearer(aB), 1.0);
  const float E = 0.01;   // an end behind the eye: the segment cut at the near side
  vC = vec4(aC.rgb, aC.a * uAlpha);
  vSide = aM.x;
  vF = max(abs(aF), 1e-3);
  vTube = aF < 0.0 ? 1.0 : 0.0;
  if (ca.w < E && cb.w < E) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  if (ca.w < E) ca = mix(ca, cb, (E - ca.w) / (cb.w - ca.w));
  else if (cb.w < E) cb = mix(cb, ca, (E - cb.w) / (ca.w - cb.w));
  vec2 h = uViewport * 0.5, sa = ca.xy / ca.w * h, sb = cb.xy / cb.w * h, d = sb - sa;
  float L = length(d);
  d = L > 1e-4 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  bool far = aM.y > 0.5;
  vec4 c = far ? cb : ca;
  c.xy += (n * aM.x + d * (far ? 1.0 : -1.0)) * (max(aW * uScale, 1.5) * 0.5) / h * c.w;
  gl_Position = c;
}`;
export const POI_LINES_FS = `#version 300 es
precision highp float;
in vec4 vC;
in float vSide;
in float vF;
in float vTube;
layout(location = 0) out vec4 o;
// a tube is lit across its width as a round bar seen side on: brightest along its middle, darker toward its edges
void main() {
  float k = vTube > 0.5 ? 0.62 + 0.38 * sqrt(max(0.0, 1.0 - vSide * vSide)) : 1.0;
  o = vec4(vC.rgb * k, vC.a * clamp((1.0 - abs(vSide)) / vF, 0.0, 1.0));
}`;

export const POI_MESH_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aP;
layout(location = 1) in vec3 aD;
layout(location = 2) in vec2 aO;
layout(location = 3) in vec4 aC;
layout(location = 4) in float aE;
layout(location = 5) in float aK;
uniform mat4 uVP;
uniform vec3 uEye;
uniform float uFocal;     // px a meter at one meter
uniform float uHalf;      // the band's half-width, meters
uniform float uMinHalf;   // its floor, px
uniform float uAlpha;
uniform float uToEye;
out vec4 vC;
out float vE;
out float vK;
out float vHalfPx;   // the band's half-width on screen here, px
void main() {
  vec3 side = cross(aD, uEye - aP);
  float sl = length(side);
  side = sl > 1e-6 ? side / sl : vec3(0.0);
  vec4 cp = uVP * vec4(aP, 1.0);
  float px = uHalf * uFocal / max(cp.w, 1e-3), k = max(1.0, uMinHalf / max(px, 1e-6));
  vHalfPx = max(px * k, 1.0);
  vec3 p = aP + (aD * aO.x + side * aO.y) * k, e = uEye - p;
  float el = length(e);
  gl_Position = uVP * vec4(el > 1e-6 ? p + e / el * min(uToEye, el * 0.5) : p, 1.0);
  vC = vec4(aC.rgb, aC.a * uAlpha);
  vE = aE;
  vK = aK;
}`;
export const POI_MESH_FS = `#version 300 es
precision highp float;
in vec4 vC;
in float vE;
in float vK;
in float vHalfPx;
layout(location = 0) out vec4 o;
void main() {
  float d = (1.0 - abs(vE)) * vK * vHalfPx;
  o = vec4(vC.rgb, vC.a * (vK > 0.0 ? clamp(d + 0.5, 0.0, 1.0) : 1.0));
}`;

export class PoiGizmoPass {
  /** @param {WebGL2RenderingContext} gl */
  constructor(gl) {
    this.gl = gl;
    this.program = buildProgram(gl, POI_LINES_VS, POI_LINES_FS, 'poi editor lines');
    this.meshProgram = buildProgram(gl, POI_MESH_VS, POI_MESH_FS, 'poi editor shapes');
    this.u = {};
    for (const n of ['uVP', 'uViewport', 'uScale', 'uAlpha', 'uEye', 'uToEye']) this.u[n] = gl.getUniformLocation(this.program, n);
    this.mu = {};
    for (const n of ['uVP', 'uEye', 'uFocal', 'uHalf', 'uMinHalf', 'uAlpha', 'uToEye']) this.mu[n] = gl.getUniformLocation(this.meshProgram, n);
    const S = FLOATS * 4;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, S, 32);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, S, 48);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.FLOAT, false, S, 52);
    const M = MESH_FLOATS * 4;
    this.meshVao = gl.createVertexArray();
    gl.bindVertexArray(this.meshVao);
    this.meshVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, M, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, M, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, M, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, M, 32);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, M, 48);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.FLOAT, false, M, 52);
    gl.bindVertexArray(null);
    /** @type {Float32Array | null} */
    this.data = null;
    /** @type {Float32Array | null} */
    this.meshData = null;
    this.capacity = 0;       // bytes the line buffer holds
    this.meshCapacity = 0;   // bytes the shape buffer holds
    this._vp = new Float32Array(16);
    this._viewport = new Float32Array(2);
    this._eye = new Float32Array(3);
  }
  /**
   * @param {Float32Array} proj @param {Float32Array} view @param {ReadonlyArray<{ a: number[], b: number[], color: number[], w?: number, band?: any }>} lines
   * @param {{ onTop?: boolean, px?: number, vw?: number, vh?: number, scale?: number, alpha?: number, toEye?: number, time?: number, tris?: ReadonlyArray<{ a: number[], b: number[], c: number[], color: number[] }> }} [opts]
   */
  draw(proj, view, lines, { onTop = true, px = 2, vw = 0, vh = 0, scale = 0, alpha = 1, toEye = 0, time = -1, tris = NO_TRIS } = {}) {
    if (!lines.length && !tris.length) return false;
    const gl = this.gl, V = this._vp;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) V[c * 4 + r] = proj[r] * view[c * 4] + proj[4 + r] * view[c * 4 + 1] + proj[8 + r] * view[c * 4 + 2] + proj[12 + r] * view[c * 4 + 3];
    const h = vh || gl.drawingBufferHeight;
    this._viewport[0] = vw || gl.drawingBufferWidth; this._viewport[1] = h;
    const k = scale > 0 ? scale : telegraphLineW(h), E = this._eye;
    for (let c = 0; c < 3; c++) E[c] = -(view[c * 4] * view[12] + view[c * 4 + 1] * view[13] + view[c * 4 + 2] * view[14]);
    if (onTop) gl.disable(gl.DEPTH_TEST); else gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const lp = packLines(lines, this.data, px);
    this.data = lp.data;
    if (lp.count) {
      const U = this.u;
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(U.uVP, false, V);
      gl.uniform2fv(U.uViewport, this._viewport);
      gl.uniform1f(U.uScale, k);
      gl.uniform1f(U.uAlpha, alpha);
      gl.uniform3fv(U.uEye, E);
      gl.uniform1f(U.uToEye, toEye);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      if (lp.count * FLOATS * 4 > this.capacity) { gl.bufferData(gl.ARRAY_BUFFER, lp.data.byteLength, gl.DYNAMIC_DRAW); this.capacity = lp.data.byteLength; }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, lp.data, 0, lp.count * FLOATS);
      gl.drawArrays(gl.TRIANGLES, 0, lp.count);
    }
    const mp = packMesh(tris, lines, time >= 0 ? time : (globalThis.performance?.now?.() ?? 0) / 1000, this.meshData);
    this.meshData = mp.data;
    if (mp.count) {
      const U = this.mu;
      gl.useProgram(this.meshProgram);
      gl.uniformMatrix4fv(U.uVP, false, V);
      gl.uniform3fv(U.uEye, E);
      gl.uniform1f(U.uFocal, proj[5] * h * 0.5);
      gl.uniform1f(U.uHalf, ROUTE_BAND.width / 2);
      gl.uniform1f(U.uMinHalf, ROUTE_BAND.minPx * k * 0.5);
      gl.uniform1f(U.uAlpha, alpha);
      gl.uniform1f(U.uToEye, toEye);
      gl.bindVertexArray(this.meshVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVbo);
      if (mp.count * MESH_FLOATS * 4 > this.meshCapacity) { gl.bufferData(gl.ARRAY_BUFFER, mp.data.byteLength, gl.DYNAMIC_DRAW); this.meshCapacity = mp.data.byteLength; }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mp.data, 0, mp.count * MESH_FLOATS);
      gl.drawArrays(gl.TRIANGLES, 0, mp.count);
    }
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    return lp.count > 0 || mp.count > 0;
  }
  destroy() {
    const gl = this.gl;
    gl.deleteBuffer(this.vbo); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program);
    gl.deleteBuffer(this.meshVbo); gl.deleteVertexArray(this.meshVao); gl.deleteProgram(this.meshProgram);
  }
}
