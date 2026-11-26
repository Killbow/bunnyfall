// @ts-check
// Builds 3D scene lines (`toScene`) for a POI's DM content, with radii in meters (poiDmRuntime.js) and route
// `band` records for render/poiGizmoPass.js. Routes and waypoint marks rise with `groundAt` where the ground lies
// above the walker's path (poi/poiNpcs.js), and ring chords carry `prev` and `next` for mitered joins.
// `dmLines` caches its last result because edits create a new `doc` and `epoch` changes when ground changes.

export const DM_LINE_COLOR = Object.freeze({
  route: Object.freeze([0.4, 0.85, 0.55, 0.9]), encounter: Object.freeze([0.95, 0.35, 0.3, 0.85]), zone: Object.freeze([0.7, 0.5, 0.95, 0.85]),
  object: Object.freeze([0.95, 0.85, 0.4, 0.9]), open: Object.freeze([1, 0.62, 0.15, 1]),
});
const RING_STEPS = 32;
const GROUND_STEP = 1, GROUND_CHECKS = 400;
export const WAYPOINT_MARK = Object.freeze({ w: 4, post: 2, ring: 0.5 });

/**
 * @param {number[][]} pts
 * @param {boolean} closed
 */
export function walkPath(pts, closed) {
  const out = pts.map((p) => [...p]);
  if (closed && pts.length > 1) out.push([...pts[0]]);
  return out;
}

/** @typedef {{ a: number[], b: number[], color: number[], w?: number, prev?: number[], next?: number[], band?: { s: number, total: number, flow: string, d: number } }} DmLine */

const ORIGIN = [0, 0, 0];
const GROUND_RECHECK = 2;
let lastDoc = /** @type {any} */ (null), lastTab = /** @type {string | null} */ (null), lastKey = /** @type {string | null} */ (null);
let lastOut = /** @type {{ inWorld: DmLine[], onTop: DmLine[] } | null} */ (null), lastGround = /** @type {any} */ (null), lastEpoch = 0;
const originSeen = new Float64Array(3);
let groundSeen = new Float64Array(2 * 64), groundCount = 0, groundNext = 0;
function stillSame(doc, open, toScene, groundAt, epoch) {
  if (!lastOut || doc !== lastDoc || (open?.tab ?? null) !== lastTab || (open?.key ?? null) !== lastKey || groundAt !== lastGround || epoch !== lastEpoch) return false;
  const q = toScene(ORIGIN);
  if (q[0] !== originSeen[0] || q[1] !== originSeen[1] || q[2] !== originSeen[2]) return false;
  for (let k = 0; k < GROUND_RECHECK && k < groundCount; k++) {
    const i = groundNext;
    groundNext = (groundNext + 1) % groundCount;
    if (Number.isFinite(/** @type {(x: number, z: number) => number} */ (groundAt)(groundSeen[i * 2], groundSeen[i * 2 + 1]))) return false;
  }
  return true;
}

/**
 * @param {any} doc
 * @param {{ tab: string, key: string | null } | null} open
 * @param {(p: number[]) => number[]} toScene
 * @param {((x: number, z: number) => number) | null} [groundAt]
 * @param {number} [epoch]
 * @returns {{ inWorld: DmLine[], onTop: DmLine[] }}
 */
export function dmLines(doc, open, toScene, groundAt = null, epoch = 0) {
  if (stillSame(doc, open, toScene, groundAt, epoch)) return /** @type {{ inWorld: DmLine[], onTop: DmLine[] }} */ (lastOut);
  return rebuild(doc, open, toScene, groundAt, epoch);
}
/**
 * @param {any} doc
 * @param {{ tab: string, key: string | null } | null} open
 * @param {(p: number[]) => number[]} toScene
 * @param {((x: number, z: number) => number) | null} groundAt
 * @param {number} epoch
 */
function rebuild(doc, open, toScene, groundAt, epoch) {
  groundCount = 0; groundNext = 0;
  const seen = groundAt ? (/** @type {number} */ x, /** @type {number} */ z) => {
    const h = groundAt(x, z);
    if (Number.isFinite(h)) return h;
    if (groundSeen.length < (groundCount + 1) * 2) { const more = new Float64Array(groundSeen.length * 2); more.set(groundSeen); groundSeen = more; }
    groundSeen[groundCount * 2] = x; groundSeen[groundCount * 2 + 1] = z; groundCount++;
    return h;
  } : null;
  const out = linesOf(doc, open, toScene, seen);
  const q = toScene(ORIGIN);
  originSeen[0] = q[0]; originSeen[1] = q[1]; originSeen[2] = q[2];
  lastDoc = doc; lastTab = open?.tab ?? null; lastKey = open?.key ?? null; lastGround = groundAt; lastEpoch = epoch; lastOut = out;
  return out;
}

/**
 * @param {any} doc
 * @param {{ tab: string, key: string | null } | null} open
 * @param {(p: number[]) => number[]} toScene
 * @param {((x: number, z: number) => number) | null} groundAt
 */
function linesOf(doc, open, toScene, groundAt) {
  /** @type {DmLine[]} */
  const inWorld = [], onTop = [];
  if (!doc || doc.v !== 2) return { inWorld, onTop };
  const isOpen = (/** @type {string} */ tab, /** @type {string} */ key) => open?.tab === tab && open?.key === key;
  /**
   * @param {number[]} a
   * @param {number[]} b
   * @param {readonly number[]} color
   * @param {object | null} [more]
   */
  const seg = (a, b, color, more = null, route = false) => {
    inWorld.push({ a, b, color: [...color], ...more });
    onTop.push({ a, b, color: [color[0], color[1], color[2], route ? 0.6 : 0.25], ...more });
  };
  /** @param {number[]} p */
  const lift = (p) => { const g = groundAt ? groundAt(p[0], p[2]) : NaN; return Number.isFinite(g) && g > p[1] ? [p[0], g, p[2]] : p; };
  /**
   * @param {number[]} c
   * @param {number} r
   * @param {readonly number[]} color
   * @param {object | null} [more]
   * @param {boolean} [onGround]
   */
  const ring = (c, r, color, more = null, onGround = false, route = false) => {
    const pts = [];
    for (let i = 0; i < RING_STEPS; i++) {
      const a = (i / RING_STEPS) * Math.PI * 2, q = [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r], g = onGround ? lift(q) : q;
      pts.push([g[0], g[1] + 0.05, g[2]]);
    }
    const n = pts.length;
    for (let i = 0; i < n; i++) seg(pts[i], pts[(i + 1) % n], color, { ...more, prev: pts[(i + n - 1) % n], next: pts[(i + 2) % n] }, route);
  };
  /**
   * @param {number[]} c
   * @param {number} h
   * @param {readonly number[]} color
   * @param {object | null} [more]
   */
  const post = (c, h, color, more = null, route = false) => seg(c, [c[0], c[1] + h, c[2]], color, more, route);

  for (const r of doc.routes ?? []) {
    const color = isOpen('routes', r.key) ? DM_LINE_COLOR.open : DM_LINE_COLOR.route;
    const pts = (r.waypoints ?? []).map((/** @type {any} */ w) => toScene(w.t));
    const path = walkPath(pts, r.mode === 'loop');
    const gap = (/** @type {number} */ i) => Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1], path[i + 1][2] - path[i][2]);
    let total = 0;
    for (let i = 0; i + 1 < path.length; i++) total += gap(i);
    const flow = r.mode === 'loop' || r.mode === 'pingpong' ? r.mode : 'once';
    for (let i = 0, s = 0; i + 1 < path.length; s += gap(i), i++) {
      for (const [k0, k1, a, b] of groundPieces(path[i], path[i + 1], lift)) seg(a, b, color, { band: { s: s + gap(i) * k0, total, flow, d: gap(i) * (k1 - k0) } }, true);
    }
    const mark = { w: WAYPOINT_MARK.w };
    pts.forEach((/** @type {number[]} */ p, /** @type {number} */ i) => { ring(p, Math.max(WAYPOINT_MARK.ring, r.waypoints[i].radius ?? 0.5), color, mark, true, true); post(lift(p), WAYPOINT_MARK.post, color, mark, true); });
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

/**
 * @param {number[]} a
 * @param {number[]} b
 * @param {(p: number[]) => number[]} lift
 * @returns {[number, number, number[], number[]][]}
 */
export function groundPieces(a, b, lift) {
  const n = Math.min(GROUND_CHECKS, Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / GROUND_STEP)));
  const at = (/** @type {number} */ k) => (k === 0 ? a : k === n ? b : [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * (k / n)));
  const pts = [], up = [];
  for (let k = 0; k <= n; k++) { const p = at(k), q = lift(p); pts.push(q); up.push(q !== p); }
  const kept = [];
  for (let k = 0; k <= n; k++) if (k === 0 || k === n || up[k] || up[k - 1] || up[k + 1]) kept.push(k);
  /** @type {[number, number, number[], number[]][]} */
  const out = [];
  for (let i = 0; i + 1 < kept.length; i++) out.push([kept[i] / n, kept[i + 1] / n, pts[kept[i]], pts[kept[i + 1]]]);
  return out;
}
