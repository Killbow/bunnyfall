// @ts-check
// The veil timing and its shader only; ui/gateVeil.js owns the canvas, its loop, and its sounds. Output premultiplied.
import { buildProgram } from './glProgram.js';

export const VEIL_CLOSE_S = 1.2;
export const VEIL_OPEN_S = 1.7;
export const VEIL_HOLD_MAX_S = 20;
export const VEIL_RAG_BODY = 0.5;
export const VEIL_RAG_TONGUE = 0.22;
export const VEIL_SOFT = Object.freeze([0.02, 0.16]);
export const VEIL_FRONT_OUT = 1.4;
export const VEIL_FRONT_IN = -0.55;
export const VEIL_HEAT = 0.9;
export const VEIL_BREATH_HZ = 0.8;

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function veilAt(phase, s, from = VEIL_FRONT_IN) {
  const span = VEIL_FRONT_OUT - VEIL_FRONT_IN;
  let front = VEIL_FRONT_OUT, heat = 0;
  if (phase === 'closing') {
    const u = clamp01(s / VEIL_CLOSE_S);
    front = VEIL_FRONT_OUT - span * u ** 1.6;
    heat = VEIL_HEAT * clamp01((u - 0.55) / 0.45);
  } else if (phase === 'shut') {
    front = VEIL_FRONT_IN;
    heat = VEIL_HEAT * (0.85 + 0.15 * Math.sin(Math.max(0, s) * VEIL_BREATH_HZ * 2 * Math.PI));
  } else if (phase === 'opening') {
    const u = clamp01(s / VEIL_OPEN_S);
    const f0 = Math.max(VEIL_FRONT_IN, Math.min(VEIL_FRONT_OUT, Number.isFinite(from) ? from : VEIL_FRONT_IN));
    front = f0 + (VEIL_FRONT_OUT - f0) * (1 - (1 - u) ** 2.2);
    heat = VEIL_HEAT * (1 - u) ** 2;
  }
  return { front, cover: clamp01((VEIL_FRONT_OUT - front) / span), heat };
}

const HEAD = `#version 300 es
precision highp float;
`;
export const GATE_VEIL_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
export const GATE_VEIL_FS = HEAD + `uniform vec2 uRes;      // the canvas, pixels
uniform float uTime;    // seconds since the veil began - the whirl's own clock
uniform float uFront;   // the fire's inner edge, screen radii
uniform float uCover;   // how much the fire has taken - the tint on what it has not
uniform float uHeat;    // the eye's heat
uniform float uTheme;   // AUDIT SD II (L6 F8): 0 Dagon's fire, 1 the Shattered Hour's brass (the Mantella's green its eye)
out vec4 o;
float vh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// value noise tiled every per cells in x - round the circle, with no seam where the angle wraps
float pn(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  return mix(mix(vh(vec2(x0, i.y)), vh(vec2(x1, i.y)), u.x), mix(vh(vec2(x0, i.y + 1.0)), vh(vec2(x1, i.y + 1.0)), u.x), u.y);
}
float pfbm(vec2 p, float per) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 5; k++) { v += a * pn(p, per); p = p * 2.0 + vec2(0.0, 17.31); per *= 2.0; a *= 0.5; }
  return v;
}
void main() {
  vec2 q = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * length(uRes));   // screen radii: the corners at 1
  float r = length(q);
  float a = atan(q.y, q.x) / 6.2831853;
  float lr = log(max(r, 1e-3));
  float turn = a + lr * 0.32 + uTime * 0.11;   // the arms: a log spiral, turning
  const float ARMS = 6.0;
  float f1 = pfbm(vec2(turn * ARMS, lr * 2.6 - uTime * 1.9), ARMS);   // pouring inward
  float f2 = pfbm(vec2((turn + 0.37) * ARMS * 2.0, lr * 5.1 - uTime * 3.3), ARMS * 2.0);
  float flame = clamp((f1 * 0.72 + f2 * 0.48 - 0.24) * 1.75, 0.0, 1.0);
  float tongue = pn(vec2(turn * ARMS * 4.0, lr * 7.0 - uTime * 4.5), ARMS * 4.0);
  float edge = uFront + (f1 - 0.5) * ${VEIL_RAG_BODY.toFixed(2)} + (tongue - 0.5) * ${VEIL_RAG_TONGUE.toFixed(2)};   // the front, ragged with tongues of flame
  float fire = smoothstep(edge - ${VEIL_SOFT[0].toFixed(2)}, edge + ${VEIL_SOFT[1].toFixed(2)}, r);
  float th = clamp(uTheme, 0.0, 1.0);
  vec3 col = mix(mix(vec3(0.04, 0.003, 0.0), vec3(0.03, 0.022, 0.004), th), mix(vec3(0.42, 0.04, 0.006), vec3(0.34, 0.21, 0.04), th), smoothstep(0.1, 0.42, flame));   // soot to ember (to dark brass)
  col = mix(col, mix(vec3(0.98, 0.3, 0.03), vec3(0.94, 0.7, 0.24), th), smoothstep(0.42, 0.74, flame));                          // to flame (to brass)
  col = mix(col, mix(vec3(1.0, 0.72, 0.34), vec3(1.0, 0.94, 0.72), th), smoothstep(0.84, 1.0, flame));                           // to the white of it
  col += mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.8, 0.38), th) * exp(-abs(r - edge - 0.05) * 16.0) * 0.9 * fire;                 // the burning front
  col *= 1.0 - 0.5 * exp(-(r - 0.3) * (r - 0.3) * 30.25) * uHeat;                               // the throat (AUDIT SD II: squared, never a pow of a negative - 5.5 squared)
  col += mix(vec3(1.0, 0.84, 0.56), vec3(0.5, 1.0, 0.66), th) * exp(-r * 6.0) * uHeat * 1.7;                                    // the eye (the Mantella's green)
  vec2 sc = vec2(turn * 200.0, lr * 26.0 - uTime * 22.0);
  float spark = step(0.993, vh(floor(sc))) * (1.0 - smoothstep(0.15, 0.5, abs(fract(sc.x) - 0.5))) * (1.0 - smoothstep(0.25, 0.5, abs(fract(sc.y) - 0.5))) * smoothstep(0.05, 0.3, r);
  col += mix(vec3(1.0, 0.76, 0.38), vec3(1.0, 0.9, 0.58), th) * spark * fire * 2.2;                                             // embers streaking in
  col *= 1.0 - 0.35 * smoothstep(0.75, 1.05, r);                                                 // darker at the corners
  float tint = clamp(uCover, 0.0, 1.0) * 0.5;
  o = vec4(col * fire + mix(vec3(0.3, 0.03, 0.0), vec3(0.22, 0.15, 0.03), th) * tint * (1.0 - fire), fire + tint * (1.0 - fire));   // premultiplied
}`;

export const GATE_VEIL_PROGRAMS = /** @type {ReadonlyArray<readonly [string, string]>} */ (Object.freeze([[GATE_VEIL_VS, GATE_VEIL_FS]]));

export class GateVeilRenderer {
  constructor(gl) {
    this.gl = gl;
    const [[vs, fs]] = GATE_VEIL_PROGRAMS;
    this.prog = buildProgram(gl, vs, fs, 'gate veil');
    this.u = {};
    for (const n of ['uRes', 'uTime', 'uFront', 'uCover', 'uHeat', 'uTheme']) this.u[n] = gl.getUniformLocation(this.prog, n);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
  }

  draw(w, h, t, v, theme = 0) {
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uRes, w, h);
    gl.uniform1f(this.u.uTime, t);
    gl.uniform1f(this.u.uFront, v.front);
    gl.uniform1f(this.u.uCover, v.cover);
    gl.uniform1f(this.u.uHeat, v.heat);
    gl.uniform1f(this.u.uTheme, theme);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  destroy() {
    const gl = this.gl;
    gl.deleteBuffer(this.vbo); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.prog);
  }
}
