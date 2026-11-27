// @ts-check
// Compass way out of a dungeon: the walked trail followed backwards from the way in.
import { TRAIL_CELL } from '../maps/automap.js';

export const WAY_PREF = 'dungeonWayOut';
export const WAY_LINE_PREF = 'dungeonWayOutLine';
export const WAY_MARK_CSS = '#efe6cf';
export const WAY_BODY_CSS = '#2b2418';
export const WAY_STEP_DY = 1;
export const WAY_SNAP_M = 2.5;
export const WAY_LOOK_CELLS = 14;
const WAY_LINE_CELLS = 24;
export const WAY_HERE_M = 3;
export const WAY_FIELD_S = 1;
export const WAY_REFIELD_S = 10;
export const WAY_STEP_ASKS = 2000;

export const cellColumn = (x, z) => (x + 0x8000) * 0x10000 + (z + 0x8000);

/**
 * @typedef {{ pts: number[][], col: Map<number, number[]>, read: number }} TrailCells
 */
/** @param {Iterable<string>|null|undefined} trail @param {TrailCells} [cells] */
export function trailCells(trail, cells = { pts: [], col: new Map(), read: 0 }) {
  let k = 0;
  for (const key of trail ?? []) {
    if (k++ < cells.read) continue;
    const [x, y, z] = String(key).split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const i = cells.pts.length;
    cells.pts.push([(x + 0.5) * TRAIL_CELL, y, (z + 0.5) * TRAIL_CELL]);
    const c = cellColumn(x, z);
    const list = cells.col.get(c);
    if (list) list.push(i); else cells.col.set(c, [i]);
  }
  cells.read = k;
  return cells;
}

/** @param {TrailCells} cells @param {number[]} p */
export function nearestCell(cells, p, snap = WAY_SNAP_M) {
  if (!p) return -1;
  const cx = Math.floor(p[0] / TRAIL_CELL), cz = Math.floor(p[2] / TRAIL_CELL), r = Math.ceil(snap / TRAIL_CELL);
  let best = -1, bestD = snap;
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      for (const i of cells.col.get(cellColumn(cx + dx, cz + dz)) ?? []) {
        const q = cells.pts[i];
        const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (d <= bestD) { bestD = d; best = i; }
      }
    }
  }
  return best;
}

// Hits within this distance of a step end belong to the end cell's wall, not one across the step.
export const WAY_STEP_END_M = 0.25;
export const stepHitCuts = (hit, len, end = WAY_STEP_END_M) => Number.isFinite(hit) && hit > end && hit < len - end;

/** WAY BACK (cave tiles): a step the player TOOK - two cells stood in one straight after the other, the trail's own order,
 *  a metre-and-a-half apart at most and within a step's climb - is no wall and is never asked of the geometry. A waist ray
 *  along a cave's rough wall, or a stair's nosing, answered "wall" for steps the body had just walked, and the way home
 *  stopped at them (the field, the ribbon). The rays are for the shortcuts between passes alone. Pure. */
export const WAY_WALKED_M = 1.8;
export const walkedStep = (cells, i, j) => {
  if (Math.abs(i - j) !== 1) return false;
  const p = cells.pts[i], q = cells.pts[j];
  return !!p && !!q && Math.hypot(p[0] - q[0], p[2] - q[2]) <= WAY_WALKED_M && Math.abs(p[1] - q[1]) <= WAY_STEP_DY;
};

export const stepKey = (i, j) => (i < j ? i * 0x1000000 + j : j * 0x1000000 + i);

/**
 * @param {TrailCells} cells @param {number} exit @param {ReadonlyArray<[number, number]>} [portals]
 * @param {(i: number, j: number) => boolean} [clear]
 */
export function wayField(cells, exit, portals = [], clear = undefined) {
  const n = cells.pts.length;
  const next = new Int32Array(n).fill(-1), jump = new Uint8Array(n);
  if (!(exit >= 0 && exit < n)) return { next, jump };
  /** @type {Map<number, number[]>} */
  const back = new Map();
  for (const [a, b] of portals) {
    if (a >= 0 && b >= 0 && a !== b) { const l = back.get(b); if (l) l.push(a); else back.set(b, [a]); }
  }
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  queue[tail++] = exit; seen[exit] = 1; next[exit] = exit;
  while (head < tail) {
    const i = queue[head++];
    const [px, py, pz] = cells.pts[i];
    const cx = Math.floor(px / TRAIL_CELL), cz = Math.floor(pz / TRAIL_CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of cells.col.get(cellColumn(cx + dx, cz + dz)) ?? []) {
          if (seen[j] || Math.abs(cells.pts[j][1] - py) > WAY_STEP_DY) continue;
          if (clear && !clear(i, j)) continue;
          seen[j] = 1; next[j] = i; queue[tail++] = j;
        }
      }
    }
    for (const j of back.get(i) ?? []) {
      if (seen[j]) continue;
      seen[j] = 1; next[j] = i; jump[j] = 1; queue[tail++] = j;
    }
  }
  return { next, jump };
}

/**
 * @param {TrailCells} cells @param {{ next: Int32Array, jump: Uint8Array }} field @param {number} from
 * @param {(p: number[]) => boolean} sees
 */
export function wayPoint(cells, field, from, sees, look = WAY_LOOK_CELLS) {
  if (!(from >= 0) || !(from < field.next.length) || field.next[from] < 0) return null;
  let i = from, best = null, first = null;
  for (let s = 0; s < look; s++) {
    if (field.jump[i] === 1) { first ??= cells.pts[i]; break; }
    const j = field.next[i];
    if (j < 0 || j === i) break;
    const p = cells.pts[j];
    first ??= p;
    if (sees(p)) best = p;
    i = j;
  }
  return best ?? first ?? cells.pts[from];
}

export const WAY_ASK_MS = 2;

/**
 * @param {TrailCells} cells @param {{ next: Int32Array, jump: Uint8Array }} field @param {number} from
 * @param {(i: number, j: number) => boolean} [clear] */
export function attachCells(cells, field, from, clear = undefined) {
  const n = cells.pts.length;
  if (field.next.length < n) {
    const cap = Math.max(n, 2 * field.next.length);
    const next = new Int32Array(cap).fill(-1), jump = new Uint8Array(cap);
    next.set(field.next); jump.set(field.jump);
    field.next = next; field.jump = jump;
  }
  for (let j = from; j < n; j++) {
    const [px, py, pz] = cells.pts[j];
    const cx = Math.floor(px / TRAIL_CELL), cz = Math.floor(pz / TRAIL_CELL);
    let to = -1;
    for (let dx = -1; dx <= 1 && to < 0; dx++) {
      for (let dz = -1; dz <= 1 && to < 0; dz++) {
        for (const i of cells.col.get(cellColumn(cx + dx, cz + dz)) ?? []) {
          if (i === j || field.next[i] < 0 || Math.abs(cells.pts[i][1] - py) > WAY_STEP_DY) continue;
          if (clear && !clear(i, j)) continue;
          to = i;
          break;
        }
      }
    }
    if (to >= 0) { field.next[j] = to; field.jump[j] = 0; }
  }
  return field;
}

export function createWayOut({ fieldEvery = WAY_FIELD_S, refieldEvery = WAY_REFIELD_S, stepAsks = WAY_STEP_ASKS, askMs = WAY_ASK_MS, clock = () => performance.now() } = {}) {
  let size = -1, builtAt = -Infinity, exitKey = '', portalCount = -1, covered = 0, offWait = fieldEvery, walled = false, builds = 0;
  /** @type {TrailCells|null} */ let cells = null;
  /** @type {{ next: Int32Array, jump: Uint8Array }|null} */ let field = null;
  /** @type {Map<number, boolean>} */ let asked = new Map();
  let pending = [], pendingAt = 0;
  const reset = () => {
    size = -1; builtAt = -Infinity; exitKey = ''; portalCount = -1; covered = 0; offWait = fieldEvery; walled = false;
    cells = null; field = null; asked = new Map(); pending = []; pendingAt = 0;
  };
  return {
    /**
     * @param {Set<string>|null|undefined} trail @param {Iterable<any>|null|undefined} portals @param {number[]|null} exitAt
     * @param {number[]|null} feet @param {(p: number[]) => boolean} sees @param {number} nowS
     * @param {((p: number[], q: number[]) => boolean)|null} [stepClear]
     * @returns {number[]|null}
     */
    aim(trail, portals, exitAt, feet, sees, nowS, stepClear = null) {
      if (!exitAt || !feet) return null;
      if (Math.hypot(exitAt[0] - feet[0], exitAt[2] - feet[2]) <= WAY_HERE_M && Math.abs(exitAt[1] - feet[1]) <= WAY_STEP_DY * 2) return null;
      const n = trail?.size ?? 0;
      const ek = `${exitAt[0]},${exitAt[1]},${exitAt[2]}`;
      const tps = portals ? [...portals] : [];
      // A trail only grows within one run, so a smaller one is another run's record and is read again whole.
      if (!cells || n < size || ek !== exitKey) { reset(); cells = trailCells(trail); }
      else if (n !== size) trailCells(trail, cells);
      const c = /** @type {TrailCells} */ (cells);
      let left = stepAsks;
      const until = clock() + askMs;
      const spend = () => left-- > 0 && clock() < until;
      const clear = stepClear ? (/** @type {number} */ i, /** @type {number} */ j) => {
        const k = stepKey(i, j);
        const known = asked.get(k);
        if (known !== undefined) return known;
        if (walkedStep(c, i, j)) { asked.set(k, true); return true; }   // a step the player took is no wall: never asked
        // A step past the ask budget is taken as clear and asked in later aims.
        if (!spend()) { pending.push(i, j); return true; }
        const ok = stepClear(c.pts[i], c.pts[j]) !== false;
        asked.set(k, ok);
        return ok;
      } : undefined;
      const build = () => {
        size = n; builtAt = nowS; exitKey = ek; portalCount = tps.length; walled = false; pending = []; pendingAt = 0; builds++;
        /** @type {[number, number][]} */ const ends = [];
        for (const t of tps) {
          const a = nearestCell(c, t?.entrance?.pos), b = nearestCell(c, t?.exit?.pos);
          if (a >= 0 && b >= 0) ends.push([a, b]);
        }
        field = wayField(c, nearestCell(c, exitAt), ends, clear);
        covered = c.pts.length;
      };
      const onField = (/** @type {number} */ i) => !!field && i >= 0 && i < field.next.length && field.next[i] >= 0;
      if (!field || tps.length !== portalCount) build();
      else if (covered < c.pts.length) { attachCells(c, field, covered, clear); covered = c.pts.length; }
      let from = nearestCell(c, feet);
      const grown = n !== size;
      if ((walled && nowS - builtAt >= fieldEvery) || (grown && nowS - builtAt >= refieldEvery) || (!onField(from) && nowS - builtAt >= offWait)) {
        build();
        from = nearestCell(c, feet);
        offWait = onField(from) ? fieldEvery : Math.min(refieldEvery, offWait * 2);
      } else if (onField(from)) offWait = fieldEvery;
      if (stepClear && field) {
        const f = /** @type {{ next: Int32Array, jump: Uint8Array }} */ (field);
        const verify = (/** @type {number} */ i, /** @type {number} */ j) => {
          const k = stepKey(i, j);
          const known = asked.get(k);
          if (known !== undefined) return known;
          const ok = walkedStep(c, i, j) || stepClear(c.pts[i], c.pts[j]) !== false;
          asked.set(k, ok);
          if (!ok && (f.next[j] === i || f.next[i] === j)) walled = true;
          return ok;
        };
        let local = from;
        const localUntil = clock() + WAY_ASK_MS;
        for (let step = 0; step < WAY_LINE_CELLS && local >= 0 && local < f.next.length; step++) {
          const next = f.next[local];
          if (next < 0 || next === local || f.jump[local]) break;
          if (!asked.has(stepKey(local, next)) && clock() >= localUntil && step > 0) break;
          if (!verify(local, next)) break;
          local = next;
        }
        while (pendingAt < pending.length && spend()) {
          const i = pending[pendingAt], j = pending[pendingAt + 1];
          pendingAt += 2;
          verify(i, j);
        }
        if (pendingAt >= pending.length) { pending = []; pendingAt = 0; }
      }
      const p = field && from >= 0 ? wayPoint(c, field, from, sees) : null;
      return p ? [p[0], p[2]] : [exitAt[0], exitAt[2]];
    },
    line(feet) {
      if (!cells || !field || !feet) return [];
      let from = nearestCell(cells, feet);
      if (from < 0 || field.next[from] < 0) return [];
      const points = [cells.pts[from]];
      for (let step = 0; step < WAY_LINE_CELLS; step++) {
        const next = field.next[from];
        if (next < 0 || next === from || field.jump[from] || asked.get(stepKey(from, next)) !== true) break;
        points.push(cells.pts[next]);
        from = next;
      }
      return points;
    },
    reset,
    builds: () => builds,
  };
}
