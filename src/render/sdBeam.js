// @ts-check
// Additive beam pass for the super dungeon hour-hand sweep, plus the band it sweeps across the floor.
import { FOG_FACTOR_GLSL } from './labGrass.js';
import { buildProgram } from './glProgram.js';
import { duelClock } from './duelWall.js';

export const SD_BEAM_MAX = 3;
// SD_BEAM_RUN_HZ gives whole cycles over the duel clock's wrap period, so the light has no seam at the wrap.
export const SD_BEAM_W = Object.freeze([0.55, 1.6]);
export const SD_BEAM_MIN_RAD = 0.003;
export const SD_BEAM_RUN_HZ = 2;
export const SD_BEAM_CORE = Object.freeze([1.0, 0.92, 0.62]);
export const SD_BEAM_GLOW = Object.freeze([1.0, 0.62, 0.18]);

const HEAD = `#version 300 es
precision highp float;
`;
export const SD_BEAM_VS = HEAD + `layout(location = 0) in vec2 aP;
uniform mat4 uVP;
uniform vec3 uA;         // the hand
uniform vec3 uB;         // its far end
uniform vec2 uW;         // its width at the hand, at its end
uniform float uMinRad;
uniform vec3 uEye;
uniform int uFlat;       // AUDIT SD III (V2): 1 - the band on the floor, flat and its width whole
out vec2 vP;
out vec3 vWorld;
out float vLen;
void main() {
  vec3 along = uB - uA;
  vec3 mid = uA + along * aP.y;
  vec3 toEye = uEye - mid;
  vec3 across = cross(along, toEye);
  if (uFlat == 1) across = vec3(along.z, 0.0, -along.x);   // the band: level across the floor
  float l = length(across);
  across = l > 1e-5 ? across / l : vec3(1.0, 0.0, 0.0);   // turned about its own length to face the eye
  float w = uFlat == 1 ? mix(uW.x, uW.y, aP.y) : max(mix(uW.x, uW.y, aP.y), length(toEye) * uMinRad);
  vec3 p = mid + across * (aP.x * 0.5 * w);
  vP = aP;
  vWorld = p;
  vLen = length(along);
  gl_Position = uVP * vec4(p, 1.0);
}`;
export const SD_BEAM_FS = HEAD + `in vec2 vP;
in vec3 vWorld;
in float vLen;
uniform vec3 uCore;
uniform vec3 uGlow;
uniform float uAlpha;
uniform float uTime;     // duelClock's seconds
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
uniform highp int uFlat;   // highp: the vertex stage's own (a uniform's precision is one across the program)
out vec4 o;
${FOG_FACTOR_GLSL}
void main() {
  float x = vP.x, y = vP.y;
  if (uFlat == 1) {
    // AUDIT SD III (V2): THE BAND - a wash of its glow over the law's whole width, its thread down the middle, its two
    // rims bright (where a body is struck and where it is not), the light running out along it and flaring at its reach
    float ax = abs(x);
    float fill = 0.25 + 0.75 * exp(-x * x * 2.5);
    float rims = smoothstep(0.8, 0.95, ax) * (1.0 - smoothstep(0.95, 1.0, ax));
    float run = 0.7 + 0.3 * sin((y * vLen * 0.35 - uTime * ${SD_BEAM_RUN_HZ}.0) * 6.283185307179586);
    float strike = 1.0 + 1.0 * exp(-(1.0 - y) * 22.0);
    float ends = smoothstep(0.0, 0.04, y) * (1.0 - smoothstep(0.98, 1.0, y));
    vec3 c = (uCore * exp(-x * x * 40.0) * 0.8 + uGlow * (fill * 0.42 * run + rims * 0.9)) * strike * ends;
    o = vec4(c * uAlpha * fogFactorAt(vWorld), 1.0);
    return;
  }
  float core = exp(-x * x * 18.0);                                          // the bright thread
  float glow = exp(-x * x * 3.0);                                           // the light about it
  float run = 0.75 + 0.25 * sin((y * vLen * 0.35 - uTime * ${SD_BEAM_RUN_HZ}.0) * 6.283185307179586);   // light running out along it
  float hand = 1.0 + 1.6 * exp(-y * 18.0);                                  // brightest at the hand
  float strike = 1.0 + 1.2 * exp(-(1.0 - y) * 22.0);                        // flaring where it strikes
  float ends = smoothstep(0.0, 0.015, y) * (1.0 - smoothstep(0.985, 1.0, y));   // AUDIT SD III (V14): edges rising - reversed ones are undefined in GLSL
  vec3 c = (uCore * core * 1.4 + uGlow * glow * 0.55 * run) * hand * strike * ends;
  o = vec4(c * uAlpha * fogFactorAt(vWorld), 1.0);
}`;

export function sdBeamVertices(steps = 8) {
  const v = [];
  for (let i = 0; i < steps; i++) {
    const y0 = i / steps, y1 = (i + 1) / steps;
    v.push(-1, y0, 1, y0, 1, y1, -1, y0, 1, y1, -1, y1);
  }
  return new Float32Array(v);
}

export class SdBeamRenderer {
  constructor(gl) {
    this.gl = gl;
    this.program = buildProgram(gl, SD_BEAM_VS, SD_BEAM_FS, 'sd beam');
    this.u = {};
    for (const n of ['uVP', 'uA', 'uB', 'uW', 'uMinRad', 'uEye', 'uCore', 'uGlow', 'uAlpha', 'uTime', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos', 'uFlat']) this.u[n] = gl.getUniformLocation(this.program, n);
    const verts = sdBeamVertices();
    this.count = verts.length / 2;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this._vp = new Float32Array(16);
    this.drawn = 0;
  }

  draw(beams, proj, view, eye, seconds, fog = null) {
    this.drawn = 0;
    const n = Array.isArray(beams) ? beams.length : 0;
    let first = null;
    for (let i = 0; i < n && !first; i++) if (drawable(beams[i])) first = beams[i];
    if (!first) return false;
    const gl = this.gl, U = this.u;
    mat4Multiply(this._vp, proj, view);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    gl.uniform1f(U.uTime, duelClock(seconds));
    gl.uniform1f(U.uMinRad, SD_BEAM_MIN_RAD);
    gl.uniform3fv(U.uCore, SD_BEAM_CORE);
    gl.uniform3fv(U.uGlow, SD_BEAM_GLOW);
    const at = eye ?? first.a;
    gl.uniform3f(U.uEye, at[0], at[1], at[2]);
    gl.uniform1i(U.uFogMode, fog ? fog.mode : 0);
    gl.uniform1f(U.uFogDensity, fog?.density ?? 0);
    gl.uniform2fv(U.uFogRange, fog?.range ?? NO_FOG_RANGE);
    gl.uniform3fv(U.uCamPos, fog?.camPos ?? at);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    for (let i = 0; i < n && this.drawn < SD_BEAM_MAX; i++) {
      const g = beams[i];
      if (!drawable(g)) continue;
      gl.uniform1f(U.uAlpha, Math.min(1, g.alpha ?? 1));
      gl.uniform1i(U.uFlat, 0);
      gl.uniform2f(U.uW, SD_BEAM_W[0], SD_BEAM_W[1]);
      gl.uniform3f(U.uA, g.a[0], g.a[1], g.a[2]);
      gl.uniform3f(U.uB, g.b[0], g.b[1], g.b[2]);
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
      if (point3(g.f0) && point3(g.f1) && g.w > 0) {
        gl.uniform1i(U.uFlat, 1);
        gl.uniform2f(U.uW, g.w, g.w);
        gl.uniform3f(U.uA, g.f0[0], g.f0[1], g.f0[2]);
        gl.uniform3f(U.uB, g.f1[0], g.f1[1], g.f1[2]);
        gl.drawArrays(gl.TRIANGLES, 0, this.count);
      }
      this.drawn++;
    }
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    return this.drawn > 0;
  }
}

const point3 = (p) => Array.isArray(p) && p.length === 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
const drawable = (g) => !!g && point3(g.a) && point3(g.b) && !(g.alpha <= 0.001);

function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}
const NO_FOG_RANGE = new Float32Array([0, 1]);
