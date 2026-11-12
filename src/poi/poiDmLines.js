// @ts-check

// The DM content of one POI as lines in the world, for the in-game editor while its DM panel is open: each route as a
// smooth path through its waypoints with a ring and a post at every waypoint, each encounter's area and spawn points,
// each trigger zone's ring, and each object's ring and post. Points are in the POI's own frame and go to the scene
// through `toScene` (the editor host's place of the POI); rings are drawn level in the scene with their radius in meters,
// as the game measures zones and encounter areas (poiDmRuntime.js). The row the panel has open is drawn in orange.
// Pure: no DOM, no GL (scenes/poiEditorHost.js hands the lines to poiGizmoPass.js).

/** Colors by kind, and the open row's. */
export const DM_LINE_COLOR = Object.freeze({
  route: Object.freeze([0.4, 0.85, 0.55, 0.9]), encounter: Object.freeze([0.95, 0.35, 0.3, 0.85]), zone: Object.freeze([0.7, 0.5, 0.95, 0.85]),
  object: Object.freeze([0.95, 0.85, 0.4, 0.9]), open: Object.freeze([1, 0.62, 0.15, 1]),
});
const RING_STEPS = 32;

/**
 * A smooth path through points: Catmull-Rom through each (the uniform form, enough for a preview), closed for a loop.
 * @param {number[][]} pts @param {boolean} closed @param {number} [steps] segments per span
 */
export function splinePoints(pts, closed, steps = 10) {
  const n = pts.length;
  if (n < 2) return pts.map((p) => [...p]);
  const at = (/** @type {number} */ i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const spans = closed ? n : n - 1, out = [];
  for (let i = 0; i < spans; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < steps; s++) {
      const u = s / steps, u2 = u * u, u3 = u2 * u;
      out.push([0, 1, 2].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3)));
    }
  }
  out.push([...at(closed ? 0 : n - 1)]);
  return out;
}

/**
 * The lines for a document. `open` names the row the panel shows (`{ tab, key }`), drawn in orange.
 * @param {any} doc @param {{ tab: string, key: string | null } | null} open @param {(p: number[]) => number[]} toScene
 * @returns {{ inWorld: { a: number[], b: number[], color: number[] }[], onTop: { a: number[], b: number[], color: number[] }[] }}
 */
export function dmLines(doc, open, toScene) {
  /** @type {{ a: number[], b: number[], color: number[] }[]} */
  const inWorld = [], onTop = [];
  if (!doc || doc.v !== 2) return { inWorld, onTop };
  const isOpen = (/** @type {string} */ tab, /** @type {string} */ key) => open?.tab === tab && open?.key === key;
  const seg = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {readonly number[]} */ color) => {
    inWorld.push({ a, b, color: [...color] });
    // faint through what stands in front
    onTop.push({ a, b, color: [color[0], color[1], color[2], 0.25] });
  };
  const ring = (/** @type {number[]} */ c, /** @type {number} */ r, /** @type {readonly number[]} */ color) => {
    let prev = null;
    for (let i = 0; i <= RING_STEPS; i++) {
      const a = (i / RING_STEPS) * Math.PI * 2, p = [c[0] + Math.cos(a) * r, c[1] + 0.05, c[2] + Math.sin(a) * r];
      if (prev) seg(prev, p, color);
      prev = p;
    }
  };
  const post = (/** @type {number[]} */ c, /** @type {number} */ h, /** @type {readonly number[]} */ color) => seg(c, [c[0], c[1] + h, c[2]], color);

  for (const r of doc.routes ?? []) {
    const color = isOpen('routes', r.key) ? DM_LINE_COLOR.open : DM_LINE_COLOR.route;
    const pts = (r.waypoints ?? []).map((/** @type {any} */ w) => toScene(w.t));
    const path = splinePoints(pts, r.mode === 'loop', 10);
    for (let i = 0; i + 1 < path.length; i++) seg(path[i], path[i + 1], color);
    pts.forEach((/** @type {number[]} */ p, /** @type {number} */ i) => { ring(p, Math.max(0.3, r.waypoints[i].radius ?? 0.5), color); post(p, 1.2, color); });
  }
  for (const e of doc.encounters ?? []) {
    const color = isOpen('encounters', e.key) ? DM_LINE_COLOR.open : DM_LINE_COLOR.encounter;
    if (Array.isArray(e.center)) { const c = toScene(e.center); ring(c, e.radius ?? 1, color); post(c, 2, color); }
    for (const s of e.spawns ?? []) { const c = toScene(s.at); ring(c, Math.max(0.4, s.spread ?? 0), color); post(c, 1.8, color); }
  }
  for (const o of doc.interactives ?? []) {
    const zone = o.kind === 'trigger';
    const color = isOpen('interactives', o.key) ? DM_LINE_COLOR.open : zone ? DM_LINE_COLOR.zone : DM_LINE_COLOR.object;
    const c = toScene(o.t);
    ring(c, o.radius ?? 1, color);
    if (!zone) post(c, 1.5, color);
  }
  return { inWorld, onTop };
}
