// `Mathf.RoundToInt` sends a .5 tie to the nearest even integer, unlike `Math.round`. The orientation snap in
// eotbBillboard.js hits exact ties when the player is side-on.
export function roundToInt(v) {
  const f = Math.floor(v);
  const d = v - f;
  if (d !== 0.5) return Math.round(v);
  return f % 2 === 0 ? f : f + 1;
}

// Single precision like the C#, each step rounded with `Math.fround`, so mod arithmetic matches the original bit
// for bit.
export const lerpF = (a, b, t) => Math.fround(a + Math.fround(Math.fround(b - a) * (t < 0 ? 0 : t > 1 ? 1 : t)));

/**
 * Clamps t to [0, 1] and computes every channel in single precision; fadeLayer.js has its own double-precision
 * form.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @param {number} t
 * @returns {number[]}
 */
export function colorLerp(a, b, t) {
  const f = Math.fround;
  const k = t < 0 ? 0 : t > 1 ? 1 : f(t);
  return [f(a[0] + f(f(b[0] - a[0]) * k)), f(a[1] + f(f(b[1] - a[1]) * k)),
    f(a[2] + f(f(b[2] - a[2]) * k)), f(a[3] + f(f(b[3] - a[3]) * k))];
}

// Must match GLSL `smoothstep` exactly, because the grass hosts predict the vertex shader fade with it.
export function smoothstep(a, b, x) {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
}
