// @ts-check

// The DM content of one POI as lines in the world, while the in-game editor's DM panel is open: each route along the
// straight path a person walks, with a ring and a post at every waypoint (its segments carry `band`, which
// render/poiGizmoPass.js draws as a band with moving arrows), each encounter's area and spawn points, each trigger
// zone's ring, and each object's ring and post. Points are in the POI's frame and reach the scene through `toScene`;
// rings lie level with their radius in meters, as poiDmRuntime.js measures zones and areas. The open row is drawn in
// orange. Pure module with no DOM or WebGL dependencies (scenes/poiEditorHost.js passes the lines to poiGizmoPass.js).

/** Colors by kind, and the open row's. */
export const DM_LINE_COLOR = Object.freeze({
  route: Object.freeze([0.4, 0.85, 0.55, 0.9]), encounter: Object.freeze([0.95, 0.35, 0.3, 0.85]), zone: Object.freeze([0.7, 0.5, 0.95, 0.85]),
  object: Object.freeze([0.95, 0.85, 0.4, 0.9]), open: Object.freeze([1, 0.62, 0.15, 1]),
});
const RING_STEPS = 32;
export const WAYPOINT_MARK = Object.freeze({ w: 4, post: 2, ring: 0.5 });

/**
 * Returns the polyline a person walks along a route: straight from each waypoint to the next (poiDmCore.js stepWalker),
 * and from the last back to the first for a loop. A ping-pong route retraces the same segments.
 * @param {number[][]} pts @param {boolean} closed
 */
export function walkPath(pts, closed) {
  const out = pts.map((p) => [...p]);
  if (closed && pts.length > 1) out.push([...pts[0]]);
  return out;
}

/**
 * @param {any} doc @param {{ tab: string, key: string | null } | null} open @param {(p: number[]) => number[]} toScene
 * @returns {{ inWorld: { a: number[], b: number[], color: number[], w?: number, band?: { s: number, total: number, flow: string } }[], onTop: { a: number[], b: number[], color: number[], w?: number, band?: { s: number, total: number, flow: string } }[] }}
 */
export function dmLines(doc, open, toScene) {
  /** @type {{ a: number[], b: number[], color: number[], w?: number, band?: { s: number, total: number, flow: string } }[]} */
  const inWorld = [], onTop = [];
  if (!doc || doc.v !== 2) return { inWorld, onTop };
  const isOpen = (/** @type {string} */ tab, /** @type {string} */ key) => open?.tab === tab && open?.key === key;
  /** @param {number[]} a @param {number[]} b @param {readonly number[]} color @param {object | null} [more] a width or a band */
  const seg = (a, b, color, more = null) => {
    inWorld.push({ a, b, color: [...color], ...more });
    onTop.push({ a, b, color: [color[0], color[1], color[2], more ? 0.6 : 0.25], ...more });
  };
  /** @param {number[]} c @param {number} r @param {readonly number[]} color @param {object | null} [more] */
  const ring = (c, r, color, more = null) => {
    let prev = null;
    for (let i = 0; i <= RING_STEPS; i++) {
      const a = (i / RING_STEPS) * Math.PI * 2, p = [c[0] + Math.cos(a) * r, c[1] + 0.05, c[2] + Math.sin(a) * r];
      if (prev) seg(prev, p, color, more);
      prev = p;
    }
  };
  /** @param {number[]} c @param {number} h @param {readonly number[]} color @param {object | null} [more] */
  const post = (c, h, color, more = null) => seg(c, [c[0], c[1] + h, c[2]], color, more);

  for (const r of doc.routes ?? []) {
    const color = isOpen('routes', r.key) ? DM_LINE_COLOR.open : DM_LINE_COLOR.route;
    const pts = (r.waypoints ?? []).map((/** @type {any} */ w) => toScene(w.t));
    const path = walkPath(pts, r.mode === 'loop');
    const gap = (/** @type {number} */ i) => Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1], path[i + 1][2] - path[i][2]);
    let total = 0;
    for (let i = 0; i + 1 < path.length; i++) total += gap(i);
    const flow = r.mode === 'loop' || r.mode === 'pingpong' ? r.mode : 'once';
    for (let i = 0, s = 0; i + 1 < path.length; s += gap(i), i++) seg(path[i], path[i + 1], color, { band: { s, total, flow } });
    const mark = { w: WAYPOINT_MARK.w };
    pts.forEach((/** @type {number[]} */ p, /** @type {number} */ i) => { ring(p, Math.max(WAYPOINT_MARK.ring, r.waypoints[i].radius ?? 0.5), color, mark); post(p, WAYPOINT_MARK.post, color, mark); });
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
