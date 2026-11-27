// @ts-check
import { FOG_FACTOR_GLSL } from './labGrass.js';
import { buildProgram } from './glProgram.js';
import { nodeMarkRgb } from '../ui/nodeMarks.js';

export const NODE_GLOW_M = 120;
export const NODE_GLOW_FADE_M = 80;
export const NODE_GLOW_MAX = 16;
export const NODE_GLOW_PULL = 0.6;
export const NODE_GLOW_KINDLE_S = 0.6;
// Every rate repeats a whole number of times in the wrapped clock, so nothing jumps when the clock wraps.
export const NODE_GLOW_PERIOD = 60;
export const NODE_GLOW_RATES = Object.freeze({ breath: 0.25, shimmer: 0.2, mote: 0.3, moteStep: 0.05, twinkle: 1.5 });
export const NODE_GLOW_MOTES = 6;
export const NODE_GLOW_MOTE_R = 0.045;
export const NODE_GLOW_GAIN = Object.freeze({ halo: 0.3, shimmer: 0.14, mote: 0.85 });
export const NODE_GLOW_FORM = Object.freeze([1, 1, 1]);

export const nodeGlowClock = (seconds) => ((seconds % NODE_GLOW_PERIOD) + NODE_GLOW_PERIOD) % NODE_GLOW_PERIOD;
export const nodeGlowRatesWhole = () => [
  NODE_GLOW_RATES.breath, NODE_GLOW_RATES.shimmer, NODE_GLOW_RATES.twinkle,
  ...Array.from({ length: NODE_GLOW_MOTES }, (_, i) => NODE_GLOW_RATES.mote + i * NODE_GLOW_RATES.moteStep),
].every((r) => Math.abs(r * NODE_GLOW_PERIOD - Math.round(r * NODE_GLOW_PERIOD)) < 1e-9);

export function nodeGlowSeed(key) {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1009) / 1009;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// The renderer's camera is a Float32Array, which Array.isArray rejects.
const isVec3 = (v) => v != null && typeof v === 'object' && v.length >= 3;

/**
 * @typedef {{ at: number[], w: number, h: number, rgb: readonly number[], alpha: number, seed: number, form: readonly number[], pull?: number, mark?: any }} NodeGlow
 * @typedef {{ nodes: Map<string, { kindle: number, seen: number, seed: number }>, frame: number, lastS: number|null, pool: NodeGlow[] }} NodeGlowState
 */
export const createNodeGlowState = () => /** @type {NodeGlowState} */ ({ nodes: new Map(), frame: 0, lastS: null, pool: [] });

/**
 * @param {ReadonlyArray<{ key: string, profession?: string, at: number[], w: number, h: number, rgb?: readonly number[], gain?: number, form?: readonly number[], quiet?: boolean }>|null|undefined} marks
 * @param {number[]|null|undefined} eye @param {number} nowS @param {NodeGlowState} state @param {NodeGlow[]} out
 */
export function nodeGlows(marks, eye, nowS, state, out) {
  out.length = 0;
  const dt = state.lastS === null ? 0 : Math.min(0.25, Math.max(0, nowS - state.lastS));
  state.lastS = nowS;
  const frame = ++state.frame;
  if (Array.isArray(marks) && isVec3(eye)) {
    for (const m of marks) {
      if (out.length >= NODE_GLOW_MAX) break;
      if (!m || !isVec3(m.at) || !(m.w > 0) || !(m.h > 0)) continue;
      const d = Math.hypot(m.at[0] - eye[0], m.at[1] - eye[1], m.at[2] - eye[2]);
      if (!(d <= NODE_GLOW_M)) continue;
      let n = state.nodes.get(m.key);
      if (!n) { n = { kindle: 0, seen: frame, seed: nodeGlowSeed(m.key) }; state.nodes.set(m.key, n); } else n.kindle = m.quiet === true ? Math.max(0, n.kindle - dt / NODE_GLOW_KINDLE_S) : Math.min(1, n.kindle + dt / NODE_GLOW_KINDLE_S);
      n.seen = frame;
      const alpha = n.kindle * (1 - smooth(NODE_GLOW_FADE_M, NODE_GLOW_M, d)) * (Number.isFinite(m.gain) ? Math.min(1, Math.max(0, m.gain)) : 1);
      if (!(alpha > 0.001)) continue;
      const rgb = m.rgb ?? nodeMarkRgb(m.profession);
      const g = state.pool[out.length] ??= { at: m.at, w: 0, h: 0, rgb, alpha: 0, seed: 0, form: NODE_GLOW_FORM, pull: NODE_GLOW_PULL, mark: m };
      g.at = m.at; g.w = m.w; g.h = m.h; g.rgb = rgb; g.alpha = alpha; g.seed = n.seed;
      g.mark = m;
      g.pull = Number.isFinite(m.pull) ? m.pull : NODE_GLOW_PULL;
      g.form = m.form ?? NODE_GLOW_FORM;
      out.push(g);
    }
  }
  for (const [key, n] of state.nodes) if (n.seen !== frame) state.nodes.delete(key);
  return out;
}

const HEAD = `#version 300 es
precision highp float;
precision highp int;
`;
const f = (x) => x.toFixed(4);
export const NODE_GLOW_VS = HEAD + `layout(location = 0) in vec2 aP;
uniform mat4 uVP;
uniform vec3 uAt;       // the node's base
uniform vec2 uSize;     // across, up (m)
uniform vec3 uEye;
uniform float uPull;    // how far toward the eye the card stands
out vec2 vM;            // metres on the card: across, up from the base
out vec3 vWorld;
void main() {
  vec3 toEye = uEye - uAt;
  vec2 fl2 = vec2(toEye.x, toEye.z);
  float fl = length(fl2);
  vec2 dir = fl > 1e-4 ? fl2 / fl : vec2(0.0, 1.0);
  vec3 across = vec3(dir.y, 0.0, -dir.x);                  // turned about the upright to face the eye
  vec3 base = uAt + vec3(dir.x, 0.0, dir.y) * min(uPull, fl * 0.5);   // stood toward it, never past half its way
  vM = vec2(aP.x * 0.5 * uSize.x, aP.y * uSize.y);
  vec3 p = base + across * vM.x + vec3(0.0, vM.y, 0.0);
  vWorld = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;
export const NODE_GLOW_FS = HEAD + `in vec2 vM;
in vec3 vWorld;
uniform vec2 uSize;
uniform vec3 uColor;
uniform float uAlpha;   // its kindling and its distance's fade
uniform float uSeed;
uniform float uTime;    // nodeGlowClock's seconds
uniform float uStill;   // AUDIT NODE-MARKS: 1 under reduced motion - the halo steady, no shimmer, the motes held
uniform vec3 uForm;     // AUDIT DELVE D6: each part's share - the halo, the shimmer, the motes
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
out vec4 o;
${FOG_FACTOR_GLSL}
const float TAU = 6.283185307179586;
float hash11(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
void main() {
  float hw = 0.5 * uSize.x, h = uSize.y;
  float qx = vM.x / hw, qy = vM.y / h;
  float tm = uTime * (1.0 - uStill);   // still: every moving part held at its seed's own place
  // THE HALO: soft across, narrowing as it climbs (a teardrop, not a column), and to nothing at the card's sides (no
  // edge shows); out of nothing at the ground, its body low on the node, thinning to its crown; breathing
  float across = exp(-qx * qx * (2.4 + 3.0 * qy)) * (1.0 - smoothstep(0.6, 1.0, abs(qx)));
  float up = smoothstep(0.0, 0.22, qy) * pow(max(1.0 - qy, 0.0), 1.5);
  float breath = mix(0.8 + 0.2 * sin(TAU * (tm * ${f(NODE_GLOW_RATES.breath)} + uSeed)), 0.9, uStill);
  float halo = across * up * breath;
  // THE SHIMMER: a soft band climbing it
  float bq = (fract(qy - tm * ${f(NODE_GLOW_RATES.shimmer)} + uSeed) - 0.5) * 8.0;   // AUDIT GATHER F10: squared by hand - pow of a negative base is undefined in GLSL ES 3.00 (8.2), NaN where a driver takes exp2(y log2 x)
  float band = exp(-bq * bq) * across * up * (1.0 - uStill);
  // THE MOTES: each its own place, pace and twinkle, born and gone dark (so its leap from the crown to the root is unseen)
  float motes = 0.0;
  for (int i = 0; i < ${NODE_GLOW_MOTES}; i++) {
    float fi = float(i);
    float s = hash11(fi + uSeed * 31.0);
    float life = fract(tm * (${f(NODE_GLOW_RATES.mote)} + fi * ${f(NODE_GLOW_RATES.moteStep)}) + s);
    float mx = ((hash11(fi * 7.0 + uSeed * 13.0) * 2.0 - 1.0) * 0.6 + 0.08 * sin(life * TAU + fi * 2.3)) * hw;
    float my = (0.05 + 0.9 * life) * h;
    vec2 d = vM - vec2(mx, my);
    float r = ${f(NODE_GLOW_MOTE_R)} * (0.75 + 0.5 * s);
    float twinkle = 0.65 + 0.35 * sin(TAU * (tm * ${f(NODE_GLOW_RATES.twinkle)} + s));
    motes += exp(-dot(d, d) / (r * r)) * sin(life * 3.141592653589793) * twinkle;
  }
  float light = uForm.x * ${f(NODE_GLOW_GAIN.halo)} * halo + uForm.y * ${f(NODE_GLOW_GAIN.shimmer)} * band + uForm.z * ${f(NODE_GLOW_GAIN.mote)} * motes;
  o = vec4(uColor * light * uAlpha * fogFactorAt(vWorld), 1.0);
}`;

export function nodeGlowVertices() {
  return new Float32Array([-1, 0, 1, 0, 1, 1, -1, 0, 1, 1, -1, 1]);
}

const NO_FOG_RANGE = new Float32Array([0, 1]);
const NO_FOCUS = new Float32Array(4);
const NO_HAZE = new Float32Array(8);
function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return out;
}

export class NodeGlowRenderer {
  constructor(gl) {
    this.gl = gl;
    this.program = buildProgram(gl, NODE_GLOW_VS, NODE_GLOW_FS, 'node glow');
    this.u = {};
    for (const n of ['uVP', 'uAt', 'uSize', 'uEye', 'uPull', 'uColor', 'uAlpha', 'uSeed', 'uTime', 'uStill', 'uForm', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos', 'uFocus', 'uJungleHaze']) this.u[n] = gl.getUniformLocation(this.program, n);
    const verts = nodeGlowVertices();
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

  /** @param {ReadonlyArray<NodeGlow>} list */
  draw(list, proj, view, eye, seconds, fog = null, still = false) {
    this.drawn = 0;
    if (!Array.isArray(list) || !list.length || !eye) return;
    const gl = this.gl, U = this.u;
    mat4Multiply(this._vp, proj, view);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    gl.uniform1f(U.uTime, nodeGlowClock(seconds));
    gl.uniform1f(U.uStill, still ? 1 : 0);
    gl.uniform3f(U.uEye, eye[0], eye[1], eye[2]);
    let pull = NaN;
    gl.uniform1i(U.uFogMode, fog ? fog.mode : 0);
    gl.uniform1f(U.uFogDensity, fog?.density ?? 0);
    gl.uniform2fv(U.uFogRange, fog?.range ?? NO_FOG_RANGE);
    gl.uniform3fv(U.uCamPos, fog?.camPos ?? eye);
    if (U.uFocus) gl.uniform4fv(U.uFocus, fog?.focus ?? NO_FOCUS);
    if (U.uJungleHaze) gl.uniform4fv(U.uJungleHaze, fog?.haze ?? NO_HAZE);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    for (const g of list) {
      if (this.drawn >= NODE_GLOW_MAX) break;
      if (!g || !isVec3(g.at) || !(g.alpha > 0.001)) continue;
      gl.uniform3f(U.uAt, g.at[0], g.at[1], g.at[2]);
      gl.uniform2f(U.uSize, g.w, g.h);
      if (g.pull !== pull) { pull = g.pull ?? NODE_GLOW_PULL; gl.uniform1f(U.uPull, pull); }
      gl.uniform3f(U.uColor, g.rgb[0], g.rgb[1], g.rgb[2]);
      gl.uniform1f(U.uAlpha, Math.min(1, g.alpha));
      gl.uniform1f(U.uSeed, Number.isFinite(g.seed) ? g.seed : 0);
      const form = g.form ?? NODE_GLOW_FORM;
      gl.uniform3f(U.uForm, form[0], form[1], form[2]);
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
      this.drawn++;
    }
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.program); gl.deleteVertexArray(this.vao); gl.deleteBuffer(this.vbo);
    this.program = null; this.vao = null; this.vbo = null;
  }
}

function reducedMotionReader() {
  let at = -Infinity, reduced = false;
  return (nowS) => {
    if (nowS - at > 1) { at = nowS; try { reduced = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { reduced = false; } }
    return reduced;
  };
}
const idleCall = (fn) => (globalThis.requestIdleCallback ? globalThis.requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 0));

// The program builds at idle once a node is first marked; the kindle fade hides the wait, and a failed build is
// never retried.
/**
 * @param {any} renderer
 * @param {{ now?: () => number, build?: (gl: any) => NodeGlowRenderer, idle?: (fn: () => void) => void, reduced?: (nowS: number) => boolean }} [o]
 */
export function createNodeGlowPass(renderer, { now = () => performance.now() / 1000, build = (gl) => new NodeGlowRenderer(gl), idle = idleCall, reduced = reducedMotionReader() } = {}) {
  const state = createNodeGlowState(), list = /** @type {NodeGlow[]} */ ([]);
  let pass = /** @type {NodeGlowRenderer|null} */ (null), asked = false, dead = false;
  const make = () => { if (dead) return; try { pass = build(renderer.gl); } catch (e) { console.warn('[prof] the nodes\' glow would not build', e?.message ?? e); pass = null; } };
  return {
    /** @param {Parameters<typeof nodeGlows>[0]} marks */
    draw(marks) {
      const proj = renderer._proj, view = renderer._view, eye = renderer._camPos;
      const t = now();
      if (!asked && marks?.length) { asked = true; idle(make); }
      if (!nodeGlows(marks, eye, t, state, list).length || !proj || !view || !pass) return 0;
      pass.draw(list, proj, view, eye, t, { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, camPos: renderer._camPos, focus: renderer._focus, haze: renderer._haze }, reduced(t));
      renderer.markForeignPass();
      return pass.drawn;
    },
    dispose() { dead = true; asked = true; pass?.dispose?.(); pass = null; },
  };
}
