// @ts-check
import { FOG_FACTOR_GLSL } from './labGrass.js';
import { buildProgram } from './glProgram.js';
import { ARCH_PROFILE_N, ARCH_Y0, ARCH_Y1, PORTAL_CENTRE_Y, GATE_FOOT_SINK } from '../world/gateModel.js';

// Every shader rate is a whole number of cycles over this period, so the wrapped clock never shows a seam.
export const GATE_CLOCK_PERIOD = 120;
export const gateClock = (seconds) => ((seconds % GATE_CLOCK_PERIOD) + GATE_CLOCK_PERIOD) % GATE_CLOCK_PERIOD;
export const MEMBRANE_TURN_SEALED_HZ = 0.05;
export const MEMBRANE_TURN_OPEN_HZ = 0.25;
export const MEMBRANE_FLOW_HZ = 0.5;
export const MEMBRANE_ALPHA_SEALED = 0.35;
export const MEMBRANE_ALPHA_OPEN = 0.92;
export const MEMBRANE_HALF_W = 5;
// Down between the feet's sunk soles, so on a slope the ground cuts the fire and no light shows under it.
export const FIRE_FOOT_Y = ARCH_Y0 - GATE_FOOT_SINK;
export const BEACON_RADIUS_M = 1.6;
export const BEACON_BELOW_M = 400;
export const BEACON_HEIGHT_M = 1200;
// Display-encoded: foreign passes draw into the 8-bit, display-encoded frame image.
export const BEACON_COLOR = Object.freeze([1.0, 0.24, 0.07]);
export const BEACON_CLIMB_HZ = 0.25;
export const BEACON_FOG_FLOOR = 0.3;
export const BEACON_SEGMENTS = 24;
export const BEACON_WIDEN = 0.006;
export const BEACON_START_M = 15;
export const GATE_PASS_MAX = 4;
// Rounded to four places, so the uniform carries the same float the literal in the gate shader compiled to.
export const beaconFoot = (below, start, height) => Number(((below + start) / height).toFixed(4));
export const GATE_PASS_GATE = Object.freeze({
  scale: 1, tint: Object.freeze([1, 1, 1]), below: BEACON_BELOW_M, height: BEACON_HEIGHT_M, foot: beaconFoot(BEACON_BELOW_M, BEACON_START_M, BEACON_HEIGHT_M), color: BEACON_COLOR,
});
/** @param {any} g */
export function gatePassValues(g) {
  const G = GATE_PASS_GATE, b = g?.beacon ?? null;
  const fin = (v, d) => (Number.isFinite(v) && v > 0 ? v : d);
  const rgb = (v, d) => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v : d);
  if (!b && g?.scale == null && g?.tint == null) return G;
  const below = fin(b?.below, G.below), height = fin(b?.height, G.height);
  return {
    scale: fin(g?.scale, G.scale), tint: rgb(g?.tint, G.tint), below, height,
    foot: b && Number.isFinite(b.start) ? beaconFoot(below, b.start, height) : G.foot, color: rgb(b?.color, G.color),
  };
}

const HEAD = `#version 300 es
precision highp float;
`;
const FOG_UNIFORMS = `uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
`;

const membraneVs = (decl, scale) => HEAD + `layout(location = 0) in vec2 aXY;   // the quad: x across the arch (metres), y up it (metres, the gate's frame)
uniform mat4 uVP;
uniform vec3 uOrigin;   // the gate's foot in the scene (its rise already in y)
uniform float uYaw;     // the gate's turn about y
${decl}out vec2 vLocal;
out vec3 vWorld;
void main() {
  float c = cos(uYaw), s = sin(uYaw);
  vec3 p = uOrigin + vec3(aXY.x * c, aXY.y, -aXY.x * s)${scale};
  vLocal = aXY;
  vWorld = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;
export const MEMBRANE_VS = membraneVs('', '');
export const MEMBRANE_SCALE_DECL = 'uniform float uScale;   // EG-F: the stone\'s scale, per draw\n';
export const MEMBRANE_DRAW_VS = membraneVs(MEMBRANE_SCALE_DECL, ' * uScale');
const membraneFs = (decl, tint) => HEAD + `in vec2 vLocal;
in vec3 vWorld;
uniform float uProfile[${ARCH_PROFILE_N}];
uniform float uTime;    // gateClock's seconds
uniform float uOpen;    // 0 sealed .. 1 open
uniform float uFade;    // 0 gone .. 1 standing (the rise and the collapse)
uniform float uSpin;    // AUDIT WB C6: the vortex's turn, in turns - accumulated by the host at the open's own rate
uniform vec3 uFogColor; // AUDIT WB C2: the frame's fog colour - a fogged membrane becomes the fog, not a hole in it
${decl}${FOG_UNIFORMS}out vec4 o;
${FOG_FACTOR_GLSL}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }
float halfW(float y) {
  float t = clamp((y - ${ARCH_Y0.toFixed(4)}) / ${(ARCH_Y1 - ARCH_Y0).toFixed(4)}, 0.0, 1.0) * ${(ARCH_PROFILE_N - 1).toFixed(1)};
  int i = int(floor(t));
  int j = min(i + 1, ${ARCH_PROFILE_N - 1});
  return mix(uProfile[i], uProfile[j], fract(t));
}
void main() {
  if (vLocal.y < ${FIRE_FOOT_Y.toFixed(4)} || vLocal.y > ${ARCH_Y1.toFixed(4)}) discard;   // AUDIT GATE-FBX E5: down to the soles - the ground cuts it
  float inside = halfW(vLocal.y) - abs(vLocal.x);   // metres from the stone, inward
  if (inside <= 0.0) discard;
  // THE VORTEX WITHOUT AN ANGLE: the point is turned about the centre by an angle that grows inward and with time,
  // and the noise read at the turned point - an atan's branch cut would stand in the fire as a seam
  vec2 c = (vLocal - vec2(0.0, ${PORTAL_CENTRE_Y.toFixed(4)})) / vec2(1.0, 1.7);
  float r = length(c);
  float ang = -uSpin * 6.283185307179586 + 2.2 / (0.6 + r);   // AUDIT WB C6: never time x a rate that moves - the rate's change would spin it through turns at once
  vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * c;
  float n = fbm(q * 1.35 + vec2(0.0, -uTime * ${MEMBRANE_FLOW_HZ.toFixed(2)}));
  float rim = 1.0 - smoothstep(0.0, 1.1, inside);
  vec3 dark = vec3(0.16, 0.015, 0.01), mid = vec3(0.92, 0.22, 0.05), hot = vec3(1.0, 0.72, 0.3);
  vec3 col = mix(dark, mid, smoothstep(0.25, 0.75, n));
  col = mix(col, hot, pow(clamp(n, 0.0, 1.0), 3.0) * (0.35 + 0.65 * uOpen));
  col += hot * rim * (0.35 + 0.5 * uOpen);
${tint}  float glow = mix(0.45, 1.25, uOpen);
  float alpha = mix(${MEMBRANE_ALPHA_SEALED.toFixed(2)}, ${MEMBRANE_ALPHA_OPEN.toFixed(2)}, uOpen) * (0.75 + 0.25 * n) * smoothstep(0.0, 0.25, inside);
  float f = fogFactorAt(vWorld);
  // AUDIT WB C2: premultiplied, the fog takes the colour AND stands in for it - fading the colour alone left the alpha
  // hiding the fogged world behind it, a black hole in a fog bank
  o = vec4(mix(uFogColor * alpha, col * glow, f) * uFade, alpha * uFade);
}`;
export const MEMBRANE_FS = membraneFs('', '');
export const MEMBRANE_TINT_DECL = 'uniform vec3 uTint;     // EG-F: the fire\'s colour, per draw\n';
export const MEMBRANE_TINT_LINE = '  col *= uTint;   // EG-F\n';
export const MEMBRANE_DRAW_FS = membraneFs(MEMBRANE_TINT_DECL, MEMBRANE_TINT_LINE);

const beaconVs = (decl, below, height) => HEAD + `layout(location = 0) in vec2 aUV;   // x around 0..1, y up 0..1
uniform mat4 uVP;
uniform vec3 uOrigin;
uniform vec3 uEye;
uniform float uRadius;
${decl}out vec2 vUV;
out vec3 vWorld;
void main() {
  float a = aUV.x * 6.283185307179586;
  // never thinner than a few pixels: far off, the column widens with its distance, so a gate kilometres away is
  // still a line on the sky and not a hair the screen cannot hold
  float rad = max(uRadius, length(uEye.xz - uOrigin.xz) * ${BEACON_WIDEN.toFixed(4)});
  vec3 p = uOrigin + vec3(cos(a) * rad, -${below} + aUV.y * ${height}, sin(a) * rad);
  vUV = aUV;
  vWorld = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;
export const BEACON_VS = beaconVs('', BEACON_BELOW_M.toFixed(1), BEACON_HEIGHT_M.toFixed(1));
export const BEACON_COLUMN_DECL = 'uniform float uBelow;   // EG-F: per draw\nuniform float uHeight;  // EG-F: per draw\n';
export const BEACON_DRAW_VS = beaconVs(BEACON_COLUMN_DECL, 'uBelow', 'uHeight');
const beaconFs = (decl, foot) => HEAD + `in vec2 vUV;
in vec3 vWorld;
uniform vec3 uOrigin;
uniform float uTime;
uniform float uFade;
uniform vec3 uColor;
${decl}${FOG_UNIFORMS}out vec4 o;
${FOG_FACTOR_GLSL}
void main() {
  float h = vUV.y;
  float foot = ${foot};   // the column leaves the gate from its crown
  float above = clamp((h - foot) / (1.0 - foot), 0.0, 1.0);
  float bands = 0.6 + 0.4 * sin((above * 38.0 - uTime * ${BEACON_CLIMB_HZ.toFixed(2)}) * 6.283185307179586);
  float fall = pow(1.0 - above, 1.6);            // brightest over the gate, gone toward the top
  float rise = smoothstep(foot, foot + 0.01, h); // it grows out of the crown rather than starting on a line
  // soft across its width: brightest where the eye looks through the column's heart, faint at its edge
  vec3 axis = vec3(uOrigin.x, vWorld.y, uOrigin.z);
  float core = abs(dot(normalize(vWorld - axis), normalize(uCamPos - vWorld)));
  float light = (0.25 + 0.75 * fall) * bands * rise * core * core;
  float f = max(fogFactorAt(vWorld), ${BEACON_FOG_FLOOR.toFixed(2)});
  o = vec4(uColor * light * f * uFade, 1.0);
}`;
export const BEACON_FS = beaconFs('', ((BEACON_BELOW_M + BEACON_START_M) / BEACON_HEIGHT_M).toFixed(4));
export const BEACON_FOOT_DECL = 'uniform float uFoot;    // EG-F: per draw\n';
export const BEACON_DRAW_FS = beaconFs(BEACON_FOOT_DECL, 'uFoot');
export const GATE_PASS_PROGRAMS = /** @type {ReadonlyArray<readonly [string, string]>} */ (Object.freeze([[MEMBRANE_DRAW_VS, MEMBRANE_DRAW_FS], [BEACON_DRAW_VS, BEACON_DRAW_FS]]));

function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function membraneVertices() {
  const x0 = -MEMBRANE_HALF_W, x1 = MEMBRANE_HALF_W, y0 = FIRE_FOOT_Y, y1 = ARCH_Y1;
  return new Float32Array([x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1]);
}
export function beaconVertices(segments = BEACON_SEGMENTS) {
  const out = new Float32Array(segments * 12);
  let o = 0;
  for (let i = 0; i < segments; i++) {
    const a = i / segments, b = (i + 1) / segments;
    for (const [u, v] of [[a, 0], [b, 0], [b, 1], [a, 0], [b, 1], [a, 1]]) { out[o++] = u; out[o++] = v; }
  }
  return out;
}

const NO_FOG_RANGE = new Float32Array([0, 1]);
const NO_FOCUS = new Float32Array(4);
const NO_HAZE = new Float32Array(8);
// Each shader is written once, its per-draw values as parameters; the gate's literals give the exported sources
// sdOmenPass.js builds from. With the gate's values, a per-draw source must match those byte for byte.
const WHITE = new Float32Array([1, 1, 1]);
const NO_FOG_COLOR = new Float32Array([0, 0, 0]);
export const gateSpinRate = (open) => MEMBRANE_TURN_SEALED_HZ + (MEMBRANE_TURN_OPEN_HZ - MEMBRANE_TURN_SEALED_HZ) * Math.max(0, Math.min(1, open));
// For a host with no spin of its own; a host that eases `open` accumulates gateSpinRate instead.
export const gateSpinAt = (t, open) => { const v = t * gateSpinRate(open); return v - Math.floor(v); };

export class GatePassRenderer {
  /** @param {WebGL2RenderingContext} gl @param {Float32Array} profile */
  constructor(gl, profile) {
    this.gl = gl;
    const [membrane, beacon] = GATE_PASS_PROGRAMS;
    this.membrane = buildProgram(gl, membrane[0], membrane[1], 'gate membrane');
    this.beacon = buildProgram(gl, beacon[0], beacon[1], 'gate beacon');
    const names = ['uVP', 'uOrigin', 'uEye', 'uYaw', 'uRadius', 'uProfile', 'uTime', 'uOpen', 'uFade', 'uSpin', 'uFogColor', 'uColor', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos', 'uFocus', 'uJungleHaze',
      'uScale', 'uTint', 'uBelow', 'uHeight', 'uFoot'];
    this.mu = {}; this.bu = {};
    for (const n of names) { this.mu[n] = gl.getUniformLocation(this.membrane, n); this.bu[n] = gl.getUniformLocation(this.beacon, n); }
    const vao = (verts) => {
      const v = gl.createVertexArray();
      gl.bindVertexArray(v);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      gl.bindVertexArray(null);
      return { vao: v, count: verts.length / 2 };
    };
    this.quad = vao(membraneVertices());
    this.column = vao(beaconVertices());
    this.profile = Float32Array.from(profile ?? new Float32Array(ARCH_PROFILE_N));
    this._vp = new Float32Array(16);
    this.drawn = 0;
  }

  _fog(U, fog, eye) {
    const gl = this.gl;
    gl.uniform1i(U.uFogMode, fog ? fog.mode : 0);
    gl.uniform1f(U.uFogDensity, fog?.density ?? 0);
    gl.uniform2fv(U.uFogRange, fog?.range ?? NO_FOG_RANGE);
    gl.uniform3fv(U.uCamPos, fog?.camPos ?? eye ?? WHITE);
    if (U.uFocus) gl.uniform4fv(U.uFocus, fog?.focus ?? NO_FOCUS);
    if (U.uJungleHaze) gl.uniform4fv(U.uJungleHaze, fog?.haze ?? NO_HAZE);
  }

  draw(gates, proj, view, eye, seconds, fog = null) {
    this.drawn = 0;
    const list = (Array.isArray(gates) ? gates : []).filter((g) => g && Array.isArray(g.origin) && g.origin.length === 3 && g.origin.every(Number.isFinite) && Number.isFinite(g.yaw) && g.fade > 0.001).slice(0, GATE_PASS_MAX);
    if (!list.length) return;
    const gl = this.gl;
    mat4Multiply(this._vp, proj, view);
    const t = gateClock(seconds);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    // Beacons first, added, so light behind a membrane shows through its sealed ember.
    gl.useProgram(this.beacon);
    gl.uniformMatrix4fv(this.bu.uVP, false, this._vp);
    gl.uniform1f(this.bu.uTime, t);
    gl.uniform1f(this.bu.uRadius, BEACON_RADIUS_M);
    gl.uniform3fv(this.bu.uEye, eye ?? fog?.camPos ?? WHITE);
    this._fog(this.bu, fog, eye);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.column.vao);
    for (const g of list) {
      if (g.fireOnly) continue;
      const v = gatePassValues(g);
      gl.uniform3fv(this.bu.uColor, v.color);
      gl.uniform1f(this.bu.uBelow, v.below);
      gl.uniform1f(this.bu.uHeight, v.height);
      gl.uniform1f(this.bu.uFoot, v.foot);
      gl.uniform3f(this.bu.uOrigin, g.origin[0], g.origin[1], g.origin[2]);
      gl.uniform1f(this.bu.uFade, Math.min(1, g.fade));
      gl.drawArrays(gl.TRIANGLES, 0, this.column.count);
      this.drawn++;
    }
    gl.useProgram(this.membrane);
    gl.uniformMatrix4fv(this.mu.uVP, false, this._vp);
    gl.uniform1f(this.mu.uTime, t);
    gl.uniform1fv(this.mu.uProfile, this.profile);
    this._fog(this.mu, fog, eye);
    gl.uniform3fv(this.mu.uFogColor, fog?.color ?? NO_FOG_COLOR);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.quad.vao);
    for (const g of list) {
      if (g.beaconOnly) continue;
      const v = gatePassValues(g);
      gl.uniform1f(this.mu.uScale, v.scale);
      gl.uniform3fv(this.mu.uTint, v.tint);
      gl.uniform3f(this.mu.uOrigin, g.origin[0], g.origin[1], g.origin[2]);
      gl.uniform1f(this.mu.uYaw, g.yaw);
      gl.uniform1f(this.mu.uOpen, Math.max(0, Math.min(1, g.open ?? 0)));
      gl.uniform1f(this.mu.uFade, Math.min(1, g.fade));
      gl.uniform1f(this.mu.uSpin, Number.isFinite(g.spin) ? g.spin : gateSpinAt(t, g.open ?? 0));
      gl.drawArrays(gl.TRIANGLES, 0, this.quad.count);
      if (g.fireOnly) this.drawn++;
    }
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
