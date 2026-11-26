// @ts-check
// Windfall's vertex wind for the nature billboards. BB_VS in renderer.js uses this lean or the WIND3 lean, never both.
// While Windfall is on, uSway holds the Windfall mask of the batch; otherwise it holds the batch sway share.
// Each flat hashes its land position with sums of sines instead of the mod's fract(sin) hash. A rounding difference
// between a tree and its far picture, or across an origin shift, then cannot change its phase.

// 4096 of the mod's 12 m cells. Every hash repeats over it, and each wavenumber is whole turns over it,
// so wrapping the anchor moves no flat.
export const WINDFALL_ANCHOR_PERIOD = 49152;
export const WINDFALL_TURNS = Object.freeze({ own: Object.freeze([[10248, 16976], [-21357, 7588]]), shiver: Object.freeze([[18853, -8840], [6493, 24016]]) });
/** @param {readonly number[]} t */
const k = (t) => `vec2(${(t[0] * 2 * Math.PI / WINDFALL_ANCHOR_PERIOD).toPrecision(9)}, ${(t[1] * 2 * Math.PI / WINDFALL_ANCHOR_PERIOD).toPrecision(9)})`;
export const WINDFALL_SCALE_MAX = 1.2;

export const WINDFALL_SWAY_GLSL = `
uniform vec4 uWindfallSway;   // WINDFALL1: sway amplitude x min(S, 2), shiver amplitude x saturate(S) x min(S, 2), the sway's phase, the shiver's
uniform vec4 uWindfallAxis;   // WINDFALL1: the wind's heading x, z (zero while the mod's law is off) and the land's anchor
vec3 windfallLean(vec2 root, vec3 right) {
  vec2 w = root + uWindfallAxis.zw;
  float cell = fract(sin(dot(mod(floor(w * 0.0833333358), 4096.0) * 12.0, vec2(12.9898, 78.233))) * 43758.5469);
  float own = 0.5 + 0.25 * (sin(dot(w, ${k(WINDFALL_TURNS.own[0])})) + sin(dot(w, ${k(WINDFALL_TURNS.own[1])})));
  float shiv = 0.5 + 0.25 * (sin(dot(w, ${k(WINDFALL_TURNS.shiver[0])})) + sin(dot(w, ${k(WINDFALL_TURNS.shiver[1])})));
  float sway = sin((cell + (own - cell) * 0.2) * 6.28318548 + uWindfallSway.z);
  float shiver = sin(shiv * 6.28318548 + uWindfallSway.w);
  vec3 d = vec3(uWindfallAxis.x, 0.0, uWindfallAxis.y);
  return (d * 0.15 + right * (dot(d, right) * 0.85)) * (uWindfallSway.x * sway + uWindfallSway.y * shiver) * (shiv * 0.400000036 + 0.8);
}
bool windfallLaw() { return dot(uWindfallAxis.xy, uWindfallAxis.xy) > 0.5; }
`;

export function windfallUniforms(wf, anchor, out = new Float32Array(8)) {
  if (!wf || !wf.on || !wf.outside) { out.fill(0); return out; }
  const s = Math.max(0, wf.strength), cap = Math.min(s, 2), sat = Math.min(1, s);
  out[0] = wf.profile.swayAmplitude * cap;
  out[1] = wf.profile.shiverAmplitude * sat * cap;
  out[2] = wf.swayPhase; out[3] = wf.shiverPhase;
  const [dx, dz] = wf.direction, l = Math.hypot(dx, dz) || 1;
  out[4] = dx / l; out[5] = dz / l;
  out[6] = anchor?.[0] ?? 0; out[7] = anchor?.[1] ?? 0;
  return out;
}
export const windfallLawOn = (wf) => !!wf && (wf[4] !== 0 || wf[5] !== 0);
export const swayShare = (b, lawOn) => (lawOn ? b.windfall : b.sway) || 0;
export const windfallLeanMax = (wf, share, h) => (Math.abs(wf[0]) + Math.abs(wf[1])) * WINDFALL_SCALE_MAX * share * h;
export function windfallAnchorAfterShift(anchor, offset) {
  const P = WINDFALL_ANCHOR_PERIOD;
  const wrap = (v) => { const r = v % P; return r < 0 ? r + P : r; };
  return [wrap(anchor[0] - offset[0]), wrap(anchor[1] - offset[2])];
}
