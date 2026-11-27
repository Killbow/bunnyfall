// @ts-check
// Editor lines draw as screen-width quads because WebGL caps GL_LINES at 1 px. Batches never write depth and restore
// GL state for the foreign-pass check.
import { buildProgram } from './glProgram.js';
import { telegraphLineW } from './gateTelegraph.js';

const FLOATS = 20;
const VERTS = 6;
const CORNERS = Object.freeze([-1, 0, 1, 0, 1, 1, -1, 0, 1, 1, -1, 1]);
export const MESH_FLOATS = 19;

export const ROUTE_BAND = Object.freeze({ width: 0.3, minPx: 8, speed: 0.6, spacing: 0.6 });
export const ARROW_VERTS = 12;
const DISC = 8;
const LINE_FEATHER = 0.35;
const CHEVRON_SPAN = 0.92;
const NO_TRIS = Object.freeze([]);
/** Caps decoded sRGB luminance below AIR_BRIGHT_THRESHOLD (0.85 in render/airPass.js) so white handles do not bloom. */
export const NO_BLOOM = 0.83;
const NO_BLOOM_GLSL = `
vec3 noBloom(vec3 c) {
  vec3 lin = mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, step(c, vec3(0.04045)));
  float y = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  if (y <= ${NO_BLOOM.toFixed(2)}) return c;
  lin *= ${NO_BLOOM.toFixed(2)} / y;
  return mix(1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, lin * 12.92, step(lin, vec3(0.0031308)));
}`;
const OPEN = 1e9;

const LINES_OUT = { data: /** @type {Float32Array} */ (new Float32Array(0)), count: 0 };
const MESH_OUT = { data: /** @type {Float32Array} */ (new Float32Array(0)), count: 0, arrows: 0, arrowAt: 0 };

/**
 * @param {ReadonlyArray<{ a: number[], b: number[], color: number[], w?: number, feather?: number, prev?: number[] | null, next?: number[] | null, band?: any }>} lines
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
    const a = l.a, b = l.b, color = l.color, w = l.w ?? px, f = /** @type {number} */ (l.feather) > 0 ? /** @type {number} */ (l.feather) : LINE_FEATHER;
    const pa = l.prev ?? a, nb = l.next ?? b;
    for (let k = 0; k < 12; k += 2) {
      data[o++] = a[0]; data[o++] = a[1]; data[o++] = a[2]; data[o++] = b[0]; data[o++] = b[1]; data[o++] = b[2];
      data[o++] = CORNERS[k]; data[o++] = CORNERS[k + 1];
      data[o++] = color[0]; data[o++] = color[1]; data[o++] = color[2]; data[o++] = color[3] ?? 1;
      data[o++] = w; data[o++] = f;
      data[o++] = pa[0]; data[o++] = pa[1]; data[o++] = pa[2]; data[o++] = nb[0]; data[o++] = nb[1]; data[o++] = nb[2];
    }
  }
  LINES_OUT.data = data; LINES_OUT.count = n * VERTS;
  return LINES_OUT;
}

// Stage vertex floats in `VX` (and `J` below) and use `Math.sqrt` so non-inlined calls do not box numbers every frame.
const VX = new Float64Array(MESH_FLOATS);
function emit(data, o) {
  for (let i = 0; i < MESH_FLOATS; i++) data[o + i] = VX[i];
  return o + MESH_FLOATS;
}
function setP(p) { VX[0] = p[0]; VX[1] = p[1]; VX[2] = p[2]; }
function setColor(c) { VX[8] = c[0]; VX[9] = c[1]; VX[10] = c[2]; VX[11] = c[3] ?? 1; }
function setN(n) { if (n) { VX[14] = n[0]; VX[15] = n[1]; VX[16] = n[2]; } else { VX[14] = 0; VX[15] = 0; VX[16] = 0; } }
const WING_ALONG = Object.freeze([0, 1, 2, 0, 2, 3]), WING_OUT = Object.freeze([0, 1, 1, 0, 1, 0]);

const MITER_MAX = 2;
const J = new Float64Array(4);
function miterOf(p, q) {
  J[3] = 0;
  if (!p || !q) return;
  const a = p.b, b = q.a;
  if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 1e-6) return;
  let ux = p.b[0] - p.a[0], uy = p.b[1] - p.a[1], uz = p.b[2] - p.a[2], vx = q.b[0] - q.a[0], vy = q.b[1] - q.a[1], vz = q.b[2] - q.a[2];
  const lu = Math.sqrt(ux * ux + uy * uy + uz * uz), lv = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (!(lu > 1e-9) || !(lv > 1e-9)) return;
  ux /= lu; uy /= lu; uz /= lu; vx /= lv; vy /= lv; vz /= lv;
  const half = Math.sqrt(Math.max(0, (1 + ux * vx + uy * vy + uz * vz) / 2));
  if (half * MITER_MAX < 1) return;
  const jx = ux + vx, jy = uy + vy, jz = uz + vz, jl = Math.sqrt(jx * jx + jy * jy + jz * jz);
  J[0] = jx / jl; J[1] = jy / jl; J[2] = jz / jl; J[3] = 1 / half;
}

/**
 * @param {ReadonlyArray<{ a: number[], b: number[], c: number[], color: number[], n?: number[][] }>} tris
 * @param {ReadonlyArray<{ a: number[], b: number[], color: number[], band?: { s: number, total: number, flow: string, d?: number } }>} lines @param {number} t @param {Float32Array | null} [out]
 */
export function packMesh(tris, lines, t, out = null) {
  const SP = ROUTE_BAND.spacing, H = ROUTE_BAND.width / 2;
  let need = tris.length * 3;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], bd = l.band;
    if (!bd) continue;
    const x = l.b[0] - l.a[0], y = l.b[1] - l.a[1], z = l.b[2] - l.a[2], ln = Math.max(Math.sqrt(x * x + y * y + z * z), bd.d ?? 0);
    need += 6 + 2 * DISC * 3 + (bd.flow === 'pingpong' ? 2 : 1) * (Math.floor((ln + 8 * H) / SP) + 2) * ARROW_VERTS;
  }
  need *= MESH_FLOATS;
  const data = out && out.length >= need ? out : new Float32Array(Math.max(need, (out?.length ?? 0) * 2, 256 * MESH_FLOATS));
  let o = 0;
  VX.fill(0);
  VX[17] = -OPEN; VX[18] = OPEN;
  for (let i = 0; i < tris.length; i++) {
    const q = tris[i], n = q.n;
    setColor(q.color);
    setN(n ? n[0] : null); setP(q.a); o = emit(data, o);
    setN(n ? n[1] : null); setP(q.b); o = emit(data, o);
    setN(n ? n[2] : null); setP(q.c); o = emit(data, o);
  }
  setN(null);
  VX[13] = 1;
  let runStart = -1, runEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.band) continue;
    if (i > runEnd) { runStart = i; runEnd = i; while (runEnd + 1 < lines.length && lines[runEnd + 1].band) runEnd++; }
    const before = lines[i > runStart ? i - 1 : runEnd], after = lines[i < runEnd ? i + 1 : runStart];
    const a = l.a, b = l.b, x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2], ln = Math.sqrt(x * x + y * y + z * z), k = ln > 1e-9 ? 1 / ln : 0;
    miterOf(before, l);
    const wa = J[3], ax = J[0], ay = J[1], az = J[2];
    miterOf(l, after);
    const wb = J[3];
    setColor(l.color);
    for (let v = 0; v < 6; v++) {
      const far = v === 2 || v === 4 || v === 5, out1 = v === 1 || v === 2 || v === 4, w = far ? wb : wa;
      if (w > 0 && far) { VX[3] = J[0]; VX[4] = J[1]; VX[5] = J[2]; } else if (w > 0) { VX[3] = ax; VX[4] = ay; VX[5] = az; } else { VX[3] = x * k; VX[4] = y * k; VX[5] = z * k; }
      setP(far ? b : a); VX[6] = 0; VX[7] = (out1 ? H : -H) * (w > 0 ? w : 1); VX[12] = out1 ? 1 : -1;
      o = emit(data, o);
    }
    VX[3] = x * k; VX[4] = y * k; VX[5] = z * k;
    for (let end = 0; end < 2; end++) {
      if ((end ? wb : wa) > 0) continue;
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
      const dir = lane ? -1 : 1, c = both ? (lane ? H / 2 : -H / 2) : 0, w = both ? H / 2 : H, h = w * CHEVRON_SPAN;
      const depth = w * dir, thick = w * dir, reach = (2 * w) / stretch, first = dir > 0 ? phase : P - phase;
      // Negative `aK` (`VX[13]`) marks a chevron for a dark outline in `POI_MESH_FS`; `|aK|` is the wing's
      // half-thickness ratio.
      VX[13] = -((0.5 * w * h) / Math.sqrt(w * w + h * h) / H);
      for (let s = first + Math.ceil((s0 - reach - first) / P) * P; s < s0 + dn + reach; s += P) {
        const lo = dir > 0 ? s - reach : s, hi = dir > 0 ? s : s + reach;
        if (hi <= s0 || lo >= s0 + dn) continue;
        const at = (s - s0) * stretch;
        VX[0] = a[0] + dx * at; VX[1] = a[1] + dy * at; VX[2] = a[2] + dz * at;
        VX[17] = -at; VX[18] = ln - at;
        for (let side = -1; side <= 1; side += 2) {
          for (let v = 0; v < 6; v++) {
            const wv = WING_ALONG[v];
            VX[6] = wv === 0 ? 0 : wv === 1 ? -depth : wv === 2 ? -depth - thick : -thick;
            VX[7] = WING_OUT[v] ? c + side * h : c;
            VX[12] = wv < 2 ? 1 : -1;
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
layout(location = 2) in vec2 aM;
layout(location = 3) in vec4 aC;
layout(location = 4) in float aW;
layout(location = 5) in float aF;
layout(location = 6) in vec3 aP;
layout(location = 7) in vec3 aN;
uniform mat4 uVP;
uniform vec2 uViewport;
uniform float uScale;
uniform float uAlpha;
uniform vec3 uEye;
uniform float uToEye;
uniform float uLift;
out vec4 vC;
out float vSide;
out float vF;
vec3 nearer(vec3 p) { p.y += uLift; vec3 e = uEye - p; float l = length(e); return l > 1e-6 ? p + e / l * min(uToEye, l * 0.5) : p; }
void main() {
  vec4 ca = uVP * vec4(nearer(aA), 1.0), cb = uVP * vec4(nearer(aB), 1.0);
  const float E = 0.01;
  vC = vec4(aC.rgb, aC.a * uAlpha);
  vSide = aM.x;
  vF = max(aF, 1e-3);
  if (ca.w < E && cb.w < E) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  bool cut = ca.w < E || cb.w < E;
  if (ca.w < E) ca = mix(ca, cb, (E - ca.w) / (cb.w - ca.w));
  else if (cb.w < E) cb = mix(cb, ca, (E - cb.w) / (ca.w - cb.w));
  vec2 h = uViewport * 0.5, sa = ca.xy / ca.w * h, sb = cb.xy / cb.w * h, d = sb - sa;
  float L = length(d);
  d = L > 1e-4 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  bool far = aM.y > 0.5;
  vec4 c = far ? cb : ca;
  float hw = max(aW * uScale, 1.5) * 0.5;
  vec2 off = (n * aM.x + d * (far ? 1.0 : -1.0)) * hw;
  vec3 o = far ? aN : aP, e = far ? aB : aA;
  if (!cut && L > 1e-4 && distance(o, e) > 1e-9) {
    vec4 co = uVP * vec4(nearer(o), 1.0);
    if (co.w >= E) {
      vec2 so = co.xy / co.w * h, dn = far ? so - sb : sa - so;
      float ln = length(dn);
      vec2 t = ln > 1e-4 ? d + dn / ln : vec2(0.0);
      if (dot(t, t) > 1e-6) {
        t = normalize(t);
        vec2 m = vec2(-t.y, t.x);
        off = m * aM.x * hw / max(dot(m, n), 0.25);
      }
    }
  }
  c.xy += off / h * c.w;
  gl_Position = c;
}`;
export const POI_LINES_FS = `#version 300 es
precision highp float;
in vec4 vC;
in float vSide;
in float vF;
layout(location = 0) out vec4 o;
${NO_BLOOM_GLSL}
void main() {
  o = vec4(noBloom(vC.rgb), vC.a * clamp((1.0 - abs(vSide)) / vF, 0.0, 1.0));
}`;

export const POI_MESH_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aP;
layout(location = 1) in vec3 aD;
layout(location = 2) in vec2 aO;
layout(location = 3) in vec4 aC;
layout(location = 4) in float aE;
layout(location = 5) in float aK;
layout(location = 6) in vec3 aN;
layout(location = 7) in vec2 aR;
uniform mat4 uVP;
uniform vec3 uEye;
uniform float uFocal;
uniform float uHalf;
uniform float uMinHalf;
uniform float uAlpha;
uniform float uToEye;
uniform float uLift;
out vec4 vC;
out float vE;
out float vK;
out float vHalfPx;
out vec3 vN;
out vec3 vW;
out float vAl;
out vec2 vR;
void main() {
  vec3 q = vec3(aP.x, aP.y + uLift, aP.z), side = cross(aD, uEye - q);
  float sl = length(side);
  side = sl > 1e-6 ? side / sl : vec3(0.0);
  vec4 cp = uVP * vec4(q, 1.0);
  float px = uHalf * uFocal / max(cp.w, 1e-3), k = max(1.0, uMinHalf / max(px, 1e-6));
  vHalfPx = max(px * k, 1.0);
  vec3 p = q + (aD * aO.x + side * aO.y) * k, e = uEye - p;
  float el = length(e);
  gl_Position = uVP * vec4(el > 1e-6 ? p + e / el * min(uToEye, el * 0.5) : p, 1.0);
  vC = vec4(aC.rgb, aC.a * uAlpha);
  vE = aE;
  vK = aK;
  vN = aN;
  vW = p;
  vAl = aO.x * k;
  vR = aR;
}`;
export const POI_MESH_FS = `#version 300 es
precision highp float;
in vec4 vC;
in float vE;
in float vK;
in float vHalfPx;
in vec3 vN;
in vec3 vW;
in float vAl;
in vec2 vR;
uniform vec3 uEye;
uniform vec3 uLight;
layout(location = 0) out vec4 o;
${NO_BLOOM_GLSL}
void main() {
  if (vAl < vR.x || vAl > vR.y) discard;
  float k = abs(vK), d = (1.0 - abs(vE)) * k * vHalfPx;
  vec3 rgb = vC.rgb;
  if (vK < 0.0) rgb = mix(rgb * 0.3, rgb, clamp(d - 1.0, 0.0, 1.0));
  float nl = length(vN);
  if (nl > 0.5) {
    vec3 n = vN / nl, h = normalize(uLight + normalize(uEye - vW));
    rgb = rgb * (0.42 + 0.58 * max(dot(n, uLight), 0.0)) + vec3(0.3 * pow(max(dot(n, h), 0.0), 32.0));
  }
  o = vec4(noBloom(rgb), vC.a * (k > 0.0 ? clamp(d + 0.5, 0.0, 1.0) : 1.0));
}`;

export class PoiGizmoPass {
  /** @param {WebGL2RenderingContext} gl */
  constructor(gl) {
    this.gl = gl;
    this.program = buildProgram(gl, POI_LINES_VS, POI_LINES_FS, 'poi editor lines');
    this.meshProgram = buildProgram(gl, POI_MESH_VS, POI_MESH_FS, 'poi editor shapes');
    this.u = {};
    for (const n of ['uVP', 'uViewport', 'uScale', 'uAlpha', 'uEye', 'uToEye', 'uLift']) this.u[n] = gl.getUniformLocation(this.program, n);
    this.mu = {};
    for (const n of ['uVP', 'uEye', 'uFocal', 'uHalf', 'uMinHalf', 'uAlpha', 'uToEye', 'uLift', 'uLight']) this.mu[n] = gl.getUniformLocation(this.meshProgram, n);
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
    gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 3, gl.FLOAT, false, S, 56);
    gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 3, gl.FLOAT, false, S, 68);
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
    gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 3, gl.FLOAT, false, M, 56);
    gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 2, gl.FLOAT, false, M, 68);
    gl.bindVertexArray(null);
    /** @type {Float32Array | null} */
    this.data = null;
    /** @type {Float32Array | null} */
    this.meshData = null;
    this.capacity = 0;
    this.meshCapacity = 0;
    this._vp = new Float32Array(16);
    this._viewport = new Float32Array(2);
    this._eye = new Float32Array(3);
    this._light = new Float32Array(3);
  }
  /**
   * @param {Float32Array} proj @param {Float32Array} view @param {ReadonlyArray<{ a: number[], b: number[], color: number[], w?: number, band?: any }>} lines
   * @param {{ onTop?: boolean, hidden?: boolean, px?: number, vw?: number, vh?: number, scale?: number, alpha?: number, toEye?: number, lift?: number, time?: number, tris?: ReadonlyArray<{ a: number[], b: number[], c: number[], color: number[], n?: number[][] }> }} [opts]
   */
  draw(proj, view, lines, { onTop = true, hidden = false, px = 2, vw = 0, vh = 0, scale = 0, alpha = 1, toEye = 0, lift = 0, time = -1, tris = NO_TRIS } = {}) {
    if (!lines.length && !tris.length) return false;
    const gl = this.gl, V = this._vp;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) V[c * 4 + r] = proj[r] * view[c * 4] + proj[4 + r] * view[c * 4 + 1] + proj[8 + r] * view[c * 4 + 2] + proj[12 + r] * view[c * 4 + 3];
    const h = vh || gl.drawingBufferHeight;
    this._viewport[0] = vw || gl.drawingBufferWidth; this._viewport[1] = h;
    const k = scale > 0 ? scale : telegraphLineW(h), E = this._eye;
    for (let c = 0; c < 3; c++) E[c] = -(view[c * 4] * view[12] + view[c * 4 + 1] * view[13] + view[c * 4 + 2] * view[14]);
    if (onTop && !hidden) gl.disable(gl.DEPTH_TEST); else gl.enable(gl.DEPTH_TEST);
    if (hidden) gl.depthFunc(gl.GEQUAL);
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
      gl.uniform1f(U.uToEye, toEye); gl.uniform1f(U.uLift, lift);
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
      gl.uniform1f(U.uToEye, toEye); gl.uniform1f(U.uLift, lift);
      const Lt = this._light;
      for (let c = 0; c < 3; c++) Lt[c] = -0.45 * view[c * 4] + 0.75 * view[c * 4 + 1] + 0.8 * view[c * 4 + 2];
      const ll = Math.sqrt(Lt[0] * Lt[0] + Lt[1] * Lt[1] + Lt[2] * Lt[2]) || 1;
      Lt[0] /= ll; Lt[1] /= ll; Lt[2] /= ll;
      gl.uniform3fv(U.uLight, Lt);
      gl.bindVertexArray(this.meshVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVbo);
      if (mp.count * MESH_FLOATS * 4 > this.meshCapacity) { gl.bufferData(gl.ARRAY_BUFFER, mp.data.byteLength, gl.DYNAMIC_DRAW); this.meshCapacity = mp.data.byteLength; }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mp.data, 0, mp.count * MESH_FLOATS);
      gl.drawArrays(gl.TRIANGLES, 0, mp.count);
    }
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    if (hidden) gl.depthFunc(gl.LESS);
    return lp.count > 0 || mp.count > 0;
  }
  destroy() {
    const gl = this.gl;
    gl.deleteBuffer(this.vbo); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program);
    gl.deleteBuffer(this.meshVbo); gl.deleteVertexArray(this.meshVao); gl.deleteProgram(this.meshProgram);
  }
}
