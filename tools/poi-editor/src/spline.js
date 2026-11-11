// @ts-check

// A smooth path through waypoints, for drawing a route in the viewport. Catmull-Rom through every point (centripetal
// parameterisation would suit uneven spacing; the uniform form is enough for a preview), closed for a loop.

/** @param {number[][]} pts @param {boolean} closed @param {number} [steps] segments per span */
export function splinePoints(pts, closed, steps = 10) {
  const n = pts.length;
  if (n < 2) return pts.map((p) => [...p]);
  const at = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const spans = closed ? n : n - 1, out = [];
  for (let i = 0; i < spans; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push([...at(closed ? 0 : n - 1)]);
  return out;
}

/** Consecutive points as line-segment pairs, flat, for a GL line list. */
export const segments = (pts) => { const o = []; for (let i = 0; i + 1 < pts.length; i++) o.push(...pts[i], ...pts[i + 1]); return o; };
