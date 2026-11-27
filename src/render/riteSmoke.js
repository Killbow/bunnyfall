// @ts-check
// Rite smoke pillar pass, blended premultiplied: alpha is how much sky it hides, and the fire glow is added light.
// Each noise octave climbs a whole number of columns over SMOKE_CLOCK_PERIOD, so the clock wrap never shows.
import { FOG_FACTOR_GLSL } from './labGrass.js';
import { buildProgram } from './glProgram.js';

export const SMOKE_CLOCK_PERIOD = 120;
export const smokeClock = (seconds) => ((seconds % SMOKE_CLOCK_PERIOD) + SMOKE_CLOCK_PERIOD) % SMOKE_CLOCK_PERIOD;
export const SMOKE_HEIGHT_M = 340;
export const SMOKE_FOOT_R = 1.2;
export const SMOKE_TOP_R = 70;
export const SMOKE_SWELL = 0.9;
export const SMOKE_LEAN = Object.freeze([60, 24]);
export const SMOKE_SEGMENTS = 24;
export const SMOKE_ROWS = 40;
export const SMOKE_TILES_AROUND = 4;
export const SMOKE_TILES_UP = 10;
export const SMOKE_CLIMB_HEIGHTS = Object.freeze([2, 3, 5]);
export const SMOKE_BILLOW = 20;
export const smokeBillowOf = (h) => Math.log(1 + SMOKE_BILLOW * h) / Math.log(1 + SMOKE_BILLOW);
export const smokeHeightOf = (y) => (Math.exp(y * Math.log(1 + SMOKE_BILLOW)) - 1) / SMOKE_BILLOW;
export const SMOKE_LUMP = 0.6;
export const SMOKE_LOD_RAD = 0.003;
export const SMOKE_LOD_MEAN = 0.58;
export const SMOKE_COVER = Object.freeze([0.28, 0.7]);
export const SMOKE_COLOR = Object.freeze([0.11, 0.1, 0.095]);
export const SMOKE_ALPHA = 0.95;
export const SMOKE_FOG_FLOOR = 0.6;
export const SMOKE_WIDEN = 0.007;
export const SMOKE_FOOT_FADE_M = 1;
export const SMOKE_EMBER = Object.freeze([0.85, 0.28, 0.08]);
export const SMOKE_EMBER_M = 2.5;
export const SMOKE_GLOW = 1.4;
export const SMOKE_LIGHT_MIN = 0.06;
export const SMOKE_MAX = 2;
// The pass and worldEvents/riteHost.js share this threshold, so a pass asked to draw always draws and the host's
// foreign-pass mark always follows.
export const SMOKE_FADE_MIN = 0.001;

const HEAD = `#version 300 es
precision highp float;
`;
const FOG_UNIFORMS = `uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
`;
const f1 = (v) => Number(v).toFixed(4);
const v3 = (a) => `vec3(${a.map(f1).join(', ')})`;
const NOISE = `float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// value noise on a lattice that TILES: per's cells round and up, so the column's seam and the clock's wrap are seamless
float tnoise(vec2 q, vec2 per) {
  vec2 i = floor(q), f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(mod(i, per)), b = hash(mod(i + vec2(1.0, 0.0), per));
  float c = hash(mod(i + vec2(0.0, 1.0), per)), d = hash(mod(i + vec2(1.0, 1.0), per));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

export const SMOKE_VS = HEAD + `layout(location = 0) in vec2 aUV;   // x around 0..1, y up the billows' height 0..1
uniform mat4 uVP;
uniform vec3 uOrigin;   // the circle's heart, on its ground
uniform vec3 uEye;
uniform float uTime;
uniform float uScale;   // BUNNYFALL: a smaller pillar (a raid's camp, a burning house - scenes/raidMusterHost.js); the rite's is 1
out vec2 vUV;
out vec3 vWorld;
out vec3 vNormal;
out float vRad;
${NOISE}// the column's height up it (0..1) at a row's place on the billows' height: close at the fire, far apart at the top
float heightOf(float y) { return (exp(clamp(y, 0.0, 1.0) * ${f1(Math.log(1 + SMOKE_BILLOW))}) - 1.0) / ${f1(SMOKE_BILLOW)}; }
vec3 axisAt(float h) { return uOrigin + vec3(${f1(SMOKE_LEAN[0])} * h * h, h * ${f1(SMOKE_HEIGHT_M)}, ${f1(SMOKE_LEAN[1])} * h * h) * uScale; }
// its radius there: the flame's width at its foot, swelling slowly as it climbs, its biggest billows bulging out of it as
// they rise - the smoke's own first octave, so the outline swells where the smoke is thick (AUDIT WB12d G17) - and never
// thinner than a few pixels far off
float radiusAt(vec2 uv) {
  vec2 per = vec2(${f1(SMOKE_TILES_AROUND)}, ${f1(SMOKE_TILES_UP)});
  float lump = tnoise(vec2(uv.x * per.x, (clamp(uv.y, 0.0, 1.0) - uTime / ${f1(SMOKE_CLOCK_PERIOD)} * ${f1(SMOKE_CLIMB_HEIGHTS[0])}) * per.y), per);
  float r = mix(${f1(SMOKE_FOOT_R)}, ${f1(SMOKE_TOP_R)} * uScale, pow(heightOf(uv.y), ${f1(SMOKE_SWELL)})) * (1.0 + ${f1(SMOKE_LUMP)} * (lump - 0.5));
  return max(r, length(uEye.xz - uOrigin.xz) * ${f1(SMOKE_WIDEN)});
}
vec3 placeAt(vec2 uv) {
  float a = uv.x * 6.283185307179586;
  return axisAt(heightOf(uv.y)) + vec3(cos(a), 0.0, sin(a)) * radiusAt(uv);
}
void main() {
  float h = heightOf(aUV.y), a = aUV.x * 6.283185307179586, rad = radiusAt(aUV);
  vec3 p = axisAt(h) + vec3(cos(a), 0.0, sin(a)) * rad;
  // its own surface's normal, the bulges' slopes and all (AUDIT WB12d G17: the axis's outward line folded a bulge's
  // flank into a hard ring)
  vec2 e = vec2(${f1(0.25 / SMOKE_SEGMENTS)}, ${f1(0.25 / SMOKE_ROWS)});
  vNormal = cross(placeAt(aUV + vec2(0.0, e.y)) - placeAt(aUV - vec2(0.0, e.y)), placeAt(aUV + vec2(e.x, 0.0)) - placeAt(aUV - vec2(e.x, 0.0)));
  vUV = vec2(aUV.x, h);
  vWorld = p;
  vRad = rad;
  gl_Position = uVP * vec4(p, 1.0);
}`;

export const SMOKE_FS = HEAD + `in vec2 vUV;
in vec3 vWorld;
in vec3 vNormal;
in float vRad;
uniform float uTime;
uniform float uFade;
uniform float uScale;
uniform float uLight;   // the frame's light on it, 0..1
${FOG_UNIFORMS}out vec4 o;
${FOG_FACTOR_GLSL}
${NOISE}void main() {
  float h = vUV.y;
  float t = uTime / ${f1(SMOKE_CLOCK_PERIOD)};   // the clock's period, 0..1
  vec2 per = vec2(${f1(SMOKE_TILES_AROUND)}, ${f1(SMOKE_TILES_UP)});
  // the billows grow as they climb (AUDIT WB12d G17): the noise's height, and how fast it runs here
  float y = log(1.0 + ${f1(SMOKE_BILLOW)} * h) / ${f1(Math.log(1 + SMOKE_BILLOW))};
  float dy = ${f1(SMOKE_BILLOW / Math.log(1 + SMOKE_BILLOW))} / (1.0 + ${f1(SMOKE_BILLOW)} * h);
  // the coarsest billow here against the eye's few pixels at its distance (AUDIT WB12d G9)
  float big = min(6.2831853 * vRad / per.x, ${f1(SMOKE_HEIGHT_M)} * uScale / (per.y * dy)) / max(length(uCamPos - vWorld) * ${f1(SMOKE_LOD_RAD)}, 1e-4);
  // each octave its own climb, a whole number of columns a period (AUDIT WB12d G17), and its mean once too fine to see
  float n = 0.5 * mix(${f1(SMOKE_LOD_MEAN)}, tnoise(vec2(vUV.x * per.x, (y - t * ${f1(SMOKE_CLIMB_HEIGHTS[0])}) * per.y), per), smoothstep(1.0, 3.0, big))
          + 0.3 * mix(${f1(SMOKE_LOD_MEAN)}, tnoise(vec2(vUV.x * per.x * 2.0, (y - t * ${f1(SMOKE_CLIMB_HEIGHTS[1])}) * per.y * 2.0), per * 2.0), smoothstep(2.0, 6.0, big))
          + 0.2 * mix(${f1(SMOKE_LOD_MEAN)}, tnoise(vec2(vUV.x * per.x * 4.0, (y - t * ${f1(SMOKE_CLIMB_HEIGHTS[2])}) * per.y * 4.0), per * 4.0), smoothstep(4.0, 12.0, big));
  // thick where the eye looks through the plume's heart, thin where its surface turns edge on
  float core = smoothstep(0.0, 0.55, abs(dot(normalize(vNormal), normalize(uCamPos - vWorld))));
  float puff = smoothstep(${f1(SMOKE_COVER[0])}, ${f1(SMOKE_COVER[1])}, n) * core;
  float body = smoothstep(0.0, ${f1(SMOKE_FOOT_FADE_M / SMOKE_HEIGHT_M)} / uScale, h) * (1.0 - smoothstep(0.5, 1.0, h));
  float a = clamp(puff * body * ${f1(SMOKE_ALPHA)}, 0.0, 1.0);
  // the floor in a clear day's distance alone - weather's fog takes it whole (AUDIT WB12d G9)
  float f = fogFactorAt(vWorld);
  a *= (uFogMode == 1 ? max(f, ${f1(SMOKE_FOG_FLOOR)}) : f) * uFade;
  // lit as the frame is (AUDIT WB12d G8); the fire under it a glow in its first metres, light added (G3)
  vec3 glow = ${v3(SMOKE_EMBER)} * (${f1(SMOKE_GLOW)} * exp(-h * uScale * ${f1(SMOKE_HEIGHT_M / SMOKE_EMBER_M)}) * puff * f * uFade);
  o = vec4(${v3(SMOKE_COLOR)} * max(uLight, ${f1(SMOKE_LIGHT_MIN)}) * a + glow, a);
}`;

export function smokeVertices(segments = SMOKE_SEGMENTS, rows = SMOKE_ROWS) {
  const out = new Float32Array(segments * rows * 12);
  let o = 0;
  for (let j = 0; j < rows; j++) {
    const v0 = j / rows, v1 = (j + 1) / rows;
    for (let i = 0; i < segments; i++) {
      const a = i / segments, b = (i + 1) / segments;
      for (const [u, v] of [[a, v0], [b, v0], [b, v1], [a, v0], [b, v1], [a, v1]]) { out[o++] = u; out[o++] = v; }
    }
  }
  return out;
}

function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}
const NO_FOG_RANGE = new Float32Array([0, 1]);
const NO_FOCUS = new Float32Array(4);
const NO_HAZE = new Float32Array(8);
const ORIGIN = new Float32Array([0, 0, 0]);

export const RITE_SMOKE_PROGRAMS = /** @type {ReadonlyArray<readonly [string, string]>} */ (Object.freeze([[SMOKE_VS, SMOKE_FS]]));

export class RiteSmokeRenderer {
  /** @param {WebGL2RenderingContext} gl @param {{ max?: number }} [opts] */
  constructor(gl, { max = SMOKE_MAX } = {}) {
    this.gl = gl;
    this.max = max;
    const [[vs, fs]] = RITE_SMOKE_PROGRAMS;
    this.program = buildProgram(gl, vs, fs, 'rite smoke');
    this.u = {};
    for (const n of ['uVP', 'uOrigin', 'uEye', 'uTime', 'uFade', 'uLight', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos', 'uFocus', 'uJungleHaze', 'uScale']) this.u[n] = gl.getUniformLocation(this.program, n);
    const verts = smokeVertices();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this.count = verts.length / 2;
    this._vp = new Float32Array(16);
    this.drawn = 0;
  }

  draw(smokes, proj, view, eye, seconds, fog = null) {
    this.drawn = 0;
    const list = (Array.isArray(smokes) ? smokes : []).filter((s) => s && Array.isArray(s.origin) && s.origin.length === 3 && s.origin.every(Number.isFinite) && s.fade > SMOKE_FADE_MIN).slice(0, this.max);
    if (!list.length) return;
    const gl = this.gl, U = this.u;
    mat4Multiply(this._vp, proj, view);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    gl.uniform1f(U.uTime, smokeClock(seconds));
    gl.uniform1f(U.uLight, Number.isFinite(fog?.light) ? Math.max(0, Math.min(1, fog.light)) : 1);
    gl.uniform3fv(U.uEye, eye ?? fog?.camPos ?? ORIGIN);
    gl.uniform1i(U.uFogMode, fog ? fog.mode : 0);
    gl.uniform1f(U.uFogDensity, fog?.density ?? 0);
    gl.uniform2fv(U.uFogRange, fog?.range ?? NO_FOG_RANGE);
    gl.uniform3fv(U.uCamPos, fog?.camPos ?? eye ?? ORIGIN);
    if (U.uFocus) gl.uniform4fv(U.uFocus, fog?.focus ?? NO_FOCUS);
    if (U.uJungleHaze) gl.uniform4fv(U.uJungleHaze, fog?.haze ?? NO_HAZE);
    gl.bindVertexArray(this.vao);
    for (const s of list) {
      gl.uniform3f(U.uOrigin, s.origin[0], s.origin[1], s.origin[2]);
      gl.uniform1f(U.uFade, Math.min(1, s.fade));
      gl.uniform1f(U.uScale, Number.isFinite(s.scale) && s.scale > 0 ? s.scale : 1);
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
      this.drawn++;
    }
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
