// @ts-check
// Caches each guild hall plan in the building frame, keyed by building, its place, guild, and room layout, so a hall
// entered again is furnished without walking the room again. The key holds the room's whole matrix. In a symmetric
// room the plan breaks ties by float noise, so the same house elsewhere could come out mirrored; it is planned anew.
import { multiply, transformPoint } from '../world/mat4.js';

const PLAN_CACHE_MAX = 16;
/** @type {Map<string, any>} */
const plans = new Map();

/** The room's matrix and its inverse when it is a turn and a shift (a building's door); null when it is not, and
 *  `{ o: null, inv: null }` with no matrix. */
export function hallFrame(o) {
  if (!o) return { o: null, inv: null };
  const col = (i) => [o[i], o[i + 1], o[i + 2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const [a, b, c] = [col(0), col(4), col(8)];
  const near = (v, w) => Math.abs(v - w) < 1e-5;
  if (!near(dot(a, a), 1) || !near(dot(b, b), 1) || !near(dot(c, c), 1) || !near(dot(a, b), 0) || !near(dot(a, c), 0) || !near(dot(b, c), 0)) return null;
  if (!near(o[3], 0) || !near(o[7], 0) || !near(o[11], 0) || !near(o[15], 1)) return null;
  const t = [o[12], o[13], o[14]];
  const inv = new Float64Array([a[0], b[0], c[0], 0, a[1], b[1], c[1], 0, a[2], b[2], c[2], 0, -dot(a, t), -dot(b, t), -dot(c, t), 1]);
  return { o, inv };
}

const at = (m, p) => (m ? transformPoint(m, p[0], p[1], p[2]) : [p[0], p[1], p[2]]);
const mm = (v) => Math.round(v * 1000);

/** What the plan reads: the room's matrix, and in its frame the placed models, the clerk, the doors, and the way in. */
export function hallLayoutOf(frame, { stood = '', clerk = null, avoid = [], way = [] }) {
  const p = (q) => at(frame.inv, q).map(mm).join(':');
  const place = frame.o ? Array.from(frame.o, (v) => Math.round(v * 1e6)).join(':') : '-';
  return [place, stood, clerk ? p([clerk.x, clerk.y, clerk.z]) : '-', avoid.map((a) => `${p(a)}:${mm(a[3])}`).join(','), way.map(p).join(',')].join('|');
}

/** The plan in the building's frame. `trs` builds a piece's matrix as the room does. */
export function hallPlanToLocal(plan, frame, trs) {
  const pt = (f) => { const [x, y, z] = at(frame.inv, [f.x, f.y, f.z]); return { ...f, x, y, z }; };
  return {
    braziers: plan.braziers.map(pt), flats: plan.flats.map(pt),
    pieces: plan.pieces.map((p) => {
      const m = p.matrix ?? trs(p.pos[0], p.pos[1], p.pos[2], 0, p.yawDeg, 0);
      return { model: p.model, k: p.k, local: frame.inv ? multiply(frame.inv, m, /** @type {any} */ (new Float64Array(16))) : m };
    }),
  };
}

/** A cached plan placed in the room's frame; each piece carries its matrix. */
export function hallPlanFromLocal(local, frame) {
  const pt = (f) => { const [x, y, z] = at(frame.o, [f.x, f.y, f.z]); return { ...f, x, y, z }; };
  return {
    braziers: local.braziers.map(pt), flats: local.flats.map(pt),
    pieces: local.pieces.map((p) => ({ model: p.model, k: p.k, matrix: frame.o ? multiply(frame.o, p.local) : p.local })),
  };
}

export function keptHallPlan(key) {
  const got = plans.get(key);
  if (got) { plans.delete(key); plans.set(key, got); }
  return got ?? null;
}

export function keepHallPlan(key, local) {
  plans.set(key, local);
  while (plans.size > PLAN_CACHE_MAX) plans.delete(plans.keys().next().value);
}
