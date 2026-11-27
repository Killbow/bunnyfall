// @ts-check

export const DECOR_ROOM_CELL = 1;
export const DECOR_ROOM_MAX_COLUMNS = 4096;
export const DECOR_ROOM_HEADROOM = 1.7;
export const DECOR_ROOM_CEILING = 10;
export const DECOR_ROOM_STEP = 0.75;
export const DECOR_ROOM_WAIST = 1;
export const DECOR_ROOM_MIN_CELLS = 6;
export const DECOR_ROOM_LEVELS = 8;
export const DECOR_ROOM_RAYS_A_STEP = 600;
export const DECOR_ROOM_OFFSET = 0.0173;
export const DECOR_ROOM_EYE = 1.6;

const DOWN = Object.freeze([0, -1, 0]);
const UP = Object.freeze([0, 1, 0]);

/** @param {{ raycastHit: (o: number[], d: readonly number[], max: number) => ({ dist: number }|null), box: { min: number[], max: number[] }, cell?: number }} o */
export function createDecorRooms({ raycastHit, box, cell = DECOR_ROOM_CELL }) {
  const ok = box && [0, 1, 2].every((i) => Number.isFinite(box.min?.[i]) && Number.isFinite(box.max?.[i]) && box.max[i] >= box.min[i]);
  const spanX = ok ? box.max[0] - box.min[0] : 0;
  const spanZ = ok ? box.max[2] - box.min[2] : 0;
  let size = cell > 0 ? cell : DECOR_ROOM_CELL;
  while (Math.ceil(spanX / size) * Math.ceil(spanZ / size) > DECOR_ROOM_MAX_COLUMNS) size *= 1.25;
  const nx = ok ? Math.max(1, Math.ceil(spanX / size)) : 0;
  const nz = ok ? Math.max(1, Math.ceil(spanZ / size)) : 0;
  // Samples sit a hair off the round numbers walls are built on; a sample on a wall's plane sees through it.
  const x0 = ok ? box.min[0] + (spanX - (nx - 1) * size) / 2 + DECOR_ROOM_OFFSET : 0;
  const z0 = ok ? box.min[2] + (spanZ - (nz - 1) * size) / 2 + DECOR_ROOM_OFFSET : 0;
  const top = ok ? box.max[1] + 0.5 : 0;
  const bottom = ok ? box.min[1] - 0.5 : 0;
  const cast = (o, d, max, out = null) => {
    let h = null;
    try { h = raycastHit(o, d, max); } catch { h = null; }
    if (out) out.back = h?.back === true;
    const dist = h?.dist;
    return typeof dist === 'number' && dist >= 0 ? dist : Infinity;
  };

  /** @type {{ x: number, y: number, z: number, col: number }[]} */
  const nodes = [];
  /** @type {number[][]} */
  const byCol = Array.from({ length: nx * nz }, () => []);
  let col = 0;
  let link = 0;
  const parent = [];
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); };
  /** @type {any[]|null} */
  let found = null;
  /** @type {Map<number, number>} */
  const roomOfRoot = new Map();
  const linked = [];

  const below = { back: false }, above = { back: false };
  function sample(c) {
    const x = x0 + (c % nx) * size;
    const z = z0 + Math.floor(c / nx) * size;
    let y = top;
    let rays = 0;
    for (let level = 0; level < DECOR_ROOM_LEVELS && y > bottom; level++) {
      const d = cast([x, y, z], DOWN, y - bottom, below);
      rays++;
      if (!Number.isFinite(d)) break;
      const fy = y - d;
      const head = cast([x, fy + 0.05, z], UP, DECOR_ROOM_CEILING, above);
      rays++;
      // A face met from behind both below and above (inside a wall or between floors) is outside every room.
      if (below.back && above.back) { y = fy - 0.05; continue; }
      // A floor needs headroom and a ceiling within reach, so the underside of a table or a roof is no floor.
      if (head >= DECOR_ROOM_HEADROOM && Number.isFinite(head)) {
        const i = nodes.length;
        nodes.push({ x, y: fy, z, col: c });
        parent.push(i);
        byCol[c].push(i);
      }
      y = fy - 0.05;
    }
    return rays;
  }

  function joinNode(i) {
    const a = nodes[i];
    const cx = a.col % nx;
    const cz = Math.floor(a.col / nx);
    let rays = 0;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      if (cx + dx >= nx || cz + dz >= nz) continue;
      for (const j of byCol[a.col + dx + dz * nx]) {
        const b = nodes[j];
        if (Math.abs(b.y - a.y) > DECOR_ROOM_STEP) continue;
        const from = [a.x, Math.max(a.y, b.y) + DECOR_ROOM_WAIST, a.z];
        const dir = [dx, 0, dz];
        const d = cast(from, dir, size);
        rays++;
        if (d >= size - 1e-6) { join(i, j); linked.push([i, j, dx, dz]); }
      }
    }
    return rays;
  }

  function finish() {
    /** @type {Map<number, number[]>} */
    const groups = new Map();
    for (let i = 0; i < nodes.length; i++) {
      const r = find(i);
      let g = groups.get(r);
      if (!g) { g = []; groups.set(r, g); }
      g.push(i);
    }
    const kept = [...groups.entries()].filter(([, g]) => g.length >= DECOR_ROOM_MIN_CELLS).map(([root, g]) => {
      const floor = Math.min(...g.map((i) => nodes[i].y));
      const cxm = g.reduce((s, i) => s + nodes[i].x, 0) / g.length;
      const czm = g.reduce((s, i) => s + nodes[i].z, 0) / g.length;
      let best = g[0];
      let bestD = Infinity;
      for (const i of g) {
        const n = nodes[i];
        const dd = (n.x - cxm) ** 2 + (n.z - czm) ** 2 + (n.y - floor) ** 2;
        if (dd < bestD) { bestD = dd; best = i; }
      }
      const n = nodes[best];
      return { root, cells: g.length, floor, eye: [n.x, n.y + DECOR_ROOM_EYE, n.z] };
    });
    // The order is fixed by floor, size, and position, so the same house always numbers its rooms the same way.
    kept.sort((a, b) => a.floor - b.floor || b.cells - a.cells || a.eye[0] - b.eye[0] || a.eye[2] - b.eye[2]);
    found = kept.map((r, k) => {
      roomOfRoot.set(r.root, k);
      return Object.freeze({ id: k + 1, name: `Room ${k + 1}`, cells: r.cells, floor: r.floor, eye: Object.freeze(r.eye) });
    });
  }

  function step(budget = DECOR_ROOM_RAYS_A_STEP) {
    if (found) return true;
    let spent = 0;
    while (spent < budget && col < nx * nz) spent += sample(col++);
    while (spent < budget && col >= nx * nz && link < nodes.length) spent += joinNode(link++);
    if (col >= nx * nz && link >= nodes.length) finish();
    return !!found;
  }

  function roomOf(p) {
    if (!found || !Array.isArray(p) || !nx) return null;
    const cx = Math.round((p[0] - x0) / size);
    const cz = Math.round((p[2] - z0) / size);
    let best = null;
    let bestD = Infinity;
    for (let r = 0; r <= 2 && best === null; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const gx = cx + dx, gz = cz + dz;
          if (gx < 0 || gz < 0 || gx >= nx || gz >= nz) continue;
          for (const i of byCol[gx + gz * nx]) {
            const n = nodes[i];
            const below = p[1] - n.y;
            if (below < -0.3 || below > 3.5) continue;
            const k = roomOfRoot.get(find(i));
            if (k === undefined) continue;
            const d = (n.x - p[0]) ** 2 + (n.z - p[2]) ** 2 + below * 0.01;
            if (d < bestD) { bestD = d; best = found[k]; }
          }
        }
      }
    }
    return best;
  }

  return {
    step,
    done: () => !!found,
    rooms: () => found,
    roomOf,
    links: () => (found ? linked.map(([i, j, dx, dz]) => {
      const a = nodes[i], b = nodes[j];
      return { a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], dir: [dx, 0, dz] };
    }) : null),
    progress: () => (found ? 1 : (col + link) / Math.max(1, nx * nz + nodes.length)),
  };
}
