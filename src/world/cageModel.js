// @ts-check
import { faces, GATE_STONE_RECORD, GATE_PLINTH_RECORD, GATE_ARCHIVE } from './gateModel.js';

export const CAGE_W = 2.2;
export const CAGE_D = 2.2;
export const CAGE_H = 2.7;
export const CAGE_FOOT = 0.5;
export const CAGE_FOOT_UNDER = 0.15;
export const CAGE_SILL = 0.08;
export const CAGE_SILL_OVER = 0.05;
export const CAGE_SILL_MAX = CAGE_H - 0.1 - 1.5;
export const CAGE_CAP = 0.04;
export const CAGE_BAR = 0.06;
export const CAGE_GAP = 0.22;
export const CAGE_POST = 0.14;
export const CAGE_BEAM = 0.1;
export const CAGE_DOOR_W = 1;
export const CAGE_DOOR_OPEN = -1.75;
export const CAGE_DOOR_MS = 1500;
export const CAGE_WALL_OUT = 0.05;
export const CAGE_WALL_IN = 0.05;

export const CAGE_LEAF_W = CAGE_DOOR_W - CAGE_BEAM;
export const cageHinge = () => [-CAGE_LEAF_W / 2, CAGE_D / 2];

function slab(f, rec, x0, y0, z0, x1, y1, z1) {
  const k = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
  const v = (y1 - y0) / 3, u = Math.max(x1 - x0, z1 - z0);
  const side = (a, b, c, d) => f.quad(rec, k[d], k[c], k[b], k[a], [0, v], [u, v], [u, 0], [0, 0]);
  const end = (a, b, c, d) => f.quad(rec, k[d], k[c], k[b], k[a], [0, 0], [u, 0], [u, u], [0, u]);
  end(4, 5, 6, 7); end(3, 2, 1, 0);
  side(0, 1, 5, 4); side(1, 2, 6, 5); side(2, 3, 7, 6); side(3, 0, 4, 7);
}
const bar = (f, foot, x, z, top, w = CAGE_BAR, rec = GATE_STONE_RECORD) => slab(f, rec, x - w / 2, -foot, z - w / 2, x + w / 2, top, z + w / 2);
function along(a, b) {
  const n = Math.max(1, Math.round(Math.abs(b - a) / CAGE_GAP));
  const out = [];
  for (let i = 1; i < n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}

function assemble(f) {
  const recs = [...f.byRec.keys()].sort((a, b) => a - b);
  const count = recs.reduce((n, r) => n + f.byRec.get(r).p.length / 3, 0);
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  const indices = new Uint32Array(count);
  const subMeshes = [];
  let v = 0;
  for (const rec of recs) {
    const g = f.byRec.get(rec), n = g.p.length / 3;
    positions.set(g.p, v * 3); normals.set(g.n, v * 3); uvs.set(g.uv, v * 2);
    for (let i = 0; i < n; i++) indices[v + i] = v + i;
    subMeshes.push({ textureArchive: GATE_ARCHIVE, textureRecord: rec, startIndex: v, primitiveCount: n / 3 });
    v += n;
  }
  return { positions, normals, uvs, indices, subMeshes };
}

/** @param {{foot?: number}} [o] */
export function buildCageModel({ foot = CAGE_FOOT } = {}) {
  const f = faces();
  const hx = CAGE_W / 2, hz = CAGE_D / 2, H = CAGE_H, dx = CAGE_DOOR_W / 2, top = H - CAGE_BEAM;
  for (const [x, z] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) bar(f, foot, x, z, H + CAGE_CAP, CAGE_POST, GATE_PLINTH_RECORD);
  for (const x of [-dx, dx]) bar(f, foot, x, hz, top, CAGE_BEAM, GATE_PLINTH_RECORD);
  for (const x of along(-hx, hx)) bar(f, foot, x, -hz, H);
  for (const z of along(-hz, hz)) { bar(f, foot, -hx, z, H); bar(f, foot, hx, z, H); }
  for (const x of [...along(-hx, -dx), ...along(dx, hx)]) bar(f, foot, x, hz, H);
  const b = CAGE_BEAM / 2;
  slab(f, GATE_PLINTH_RECORD, -hx, top, -hz - b, hx, H, -hz + b);
  slab(f, GATE_PLINTH_RECORD, -hx, top, hz - b, hx, H, hz + b);
  slab(f, GATE_PLINTH_RECORD, -hx - b, top, -hz, -hx + b, H, hz);
  slab(f, GATE_PLINTH_RECORD, hx - b, top, -hz, hx + b, H, hz);
  for (const x of along(-hx, hx)) slab(f, GATE_STONE_RECORD, x - CAGE_BAR / 2, top + 0.02, -hz, x + CAGE_BAR / 2, H - 0.02, hz);
  return assemble(f);
}

/** @param {{sill?: number}} [o] */
export function buildCageDoor({ sill = CAGE_SILL } = {}) {
  const f = faces();
  const W = CAGE_LEAF_W, H = CAGE_H - CAGE_BEAM, b = CAGE_BEAM / 2, low = Math.min(CAGE_SILL_MAX, Math.max(CAGE_SILL, sill));
  slab(f, GATE_PLINTH_RECORD, 0, low, -b, W, low + CAGE_BEAM, b);
  slab(f, GATE_PLINTH_RECORD, 0, H - CAGE_BEAM, -b, W, H, b);
  slab(f, GATE_PLINTH_RECORD, 0, low, -b, CAGE_BEAM, H, b);
  slab(f, GATE_PLINTH_RECORD, W - CAGE_BEAM, low, -b, W, H, b);
  for (const x of along(0, W)) slab(f, GATE_STONE_RECORD, x - CAGE_BAR / 2, low, -CAGE_BAR / 2, x + CAGE_BAR / 2, H, CAGE_BAR / 2);
  return assemble(f);
}

function slabTris(out, x0, y0, z0, x1, y1, z1) {
  const base = out.positions.length / 3;
  out.positions.push(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1);
  for (const i of [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]) out.indices.push(base + i);
}
const frozenMesh = (o) => Object.freeze({ positions: new Float32Array(o.positions), indices: new Uint16Array(o.indices) });

export const CAGE_WALLS = (() => {
  const out = { positions: [], indices: [] };
  const hx = CAGE_W / 2, hz = CAGE_D / 2, o = CAGE_WALL_OUT, i = CAGE_WALL_IN, dx = CAGE_DOOR_W / 2, y0 = -CAGE_FOOT, y1 = CAGE_H;
  slabTris(out, -hx - o, y0, -hz - o, hx + o, y1, -hz + i);
  slabTris(out, -hx - o, y0, -hz, -hx + i, y1, hz);
  slabTris(out, hx - i, y0, -hz, hx + o, y1, hz);
  slabTris(out, -hx - o, y0, hz - i, -dx, y1, hz + o);
  slabTris(out, dx, y0, hz - i, hx + o, y1, hz + o);
  slabTris(out, -hx - o, CAGE_H - CAGE_BEAM, -hz - o, hx + o, CAGE_H + CAGE_CAP, hz + o);
  return frozenMesh(out);
})();
export const CAGE_DOOR_WALL = (() => {
  const out = { positions: [], indices: [] };
  const hz = CAGE_D / 2, dx = CAGE_DOOR_W / 2;
  slabTris(out, -dx, -CAGE_FOOT, hz - CAGE_WALL_IN, dx, CAGE_H, hz + CAGE_WALL_OUT);
  return frozenMesh(out);
})();
