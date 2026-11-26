// @ts-check
// Model of the faithful circle, cut from the gate stone: sigil, brazier ring, altar, casket, and camp. Pure.
import { faces, GATE_ARCHIVE, GATE_STONE_RECORD, RITE_SIGIL_RECORD } from './gateModel.js';

export const RITE_SIGIL_R = 6.5;
export const RITE_SIGIL_LIFT = 0.04;
export const RITE_SIGIL_REACH = 0.5;
export const RITE_SIGIL_RINGS = 12;
export const RITE_SIGIL_SEGS = 48;
export const RITE_BRAZIERS = 6;
export const RITE_BRAZIER_R = 8.5;
export const RITE_BRAZIER_H = 1.1;
export const RITE_BRAZIER_W = 0.35;
export const RITE_ALTAR = Object.freeze({ w: 1.9, d: 0.9, h: 0.95 });
export const RITE_CASKET = Object.freeze({ w: 0.9, d: 0.55, h: 0.55, r: 1.7 });
export const RITE_RING_R = 4.6;
export const RITE_SUMMONER_R = 1.4;
export const RITE_TENT_R = 15;
export const RITE_FIRE_R = 13;

const dir = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];

/**
 * @param {number} facing
 */
export function riteLayout(facing) {
  const braziers = [];
  for (let i = 0; i < RITE_BRAZIERS; i++) braziers.push(dir(facing + ((i + 0.5) / RITE_BRAZIERS) * 2 * Math.PI, RITE_BRAZIER_R));
  const behind = facing + Math.PI;
  const [sx, sz] = dir(behind, RITE_SUMMONER_R);
  const [cx, cz] = dir(facing + Math.PI / 2, RITE_CASKET.r);
  const tents = [-0.45, 0.45].map((d) => { const [x, z] = dir(behind + d, RITE_TENT_R); return { x, z, yaw: Math.atan2(-x, -z) }; });
  return {
    braziers,
    altar: { x: 0, z: 0, yaw: facing },
    casket: { x: cx, z: cz, yaw: facing },
    tents,
    fire: dir(behind, RITE_FIRE_R),
    summoner: [sx, sz, facing],
    ring(n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = behind + ((i + 1) / (n + 1) - 0.5) * 1.75 * Math.PI;
        const [x, z] = dir(a, RITE_RING_R);
        out.push([x, z, Math.atan2(-x, -z)]);
      }
      return out;
    },
  };
}

function boxCorners(x, z, yaw, w, d, h, ground) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (u, v) => [x + c * u + s * v, z - s * u + c * v];
  const foot = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => at(u, v));
  const y0 = Math.min(...foot.map(([fx, fz]) => ground(fx, fz))) - 0.15, y1 = ground(x, z) + h;
  return [...foot.map(([fx, fz]) => [fx, y0, fz]), ...foot.map(([fx, fz]) => [fx, y1, fz])];
}
function box(f, rec, k) {
  const q = (a, b, c, d) => f.quad(rec, k[d], k[c], k[b], k[a], [0, 0], [1, 0], [1, 1], [0, 1]);
  q(4, 5, 6, 7);
  q(0, 1, 5, 4); q(1, 2, 6, 5); q(2, 3, 7, 6); q(3, 0, 4, 7);
}

/**
 * @param {number} facing
 * @param {(x: number, z: number) => number} [heightAt]
 * @param {{stone?: boolean, sigil?: boolean}} [parts]
 */
export function buildRiteModel(facing, heightAt = () => 0, { stone = true, sigil = true } = {}) {
  const h = (x, z) => { const v = heightAt(x, z); return Number.isFinite(v) ? v : 0; };
  const f = faces();
  const L = riteLayout(facing);
  const RINGS = RITE_SIGIL_RINGS, SEGS = RITE_SIGIL_SEGS, K = RITE_SIGIL_REACH, D = K * Math.SQRT1_2;
  const ride = (x, z) => Math.max(h(x, z), h(x + K, z), h(x - K, z), h(x, z + K), h(x, z - K), h(x + D, z + D), h(x - D, z + D), h(x + D, z - D), h(x - D, z - D));
  const cf = Math.cos(facing), sf = Math.sin(facing), uvOf = (x, z) => [0.5 + (x * cf - z * sf) / (2 * RITE_SIGIL_R), 0.5 + (x * sf + z * cf) / (2 * RITE_SIGIL_R)];
  if (sigil) {
    const grid = [];
    for (let ri = 0; ri <= RINGS; ri++) {
      const row = [];
      for (let si = 0; si <= SEGS; si++) {
        const r = (ri / RINGS) * RITE_SIGIL_R, a = (si / SEGS) * 2 * Math.PI;
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        row.push({ p: [x, ride(x, z) + RITE_SIGIL_LIFT, z], uv: uvOf(x, z) });
      }
      grid.push(row);
    }
    const pt = (ri, si) => grid[ri][si];
    for (let ri = 0; ri < RINGS; ri++) {
      for (let si = 0; si < SEGS; si++) {
        const a = pt(ri, si), b = pt(ri, si + 1), c = pt(ri + 1, si + 1), d = pt(ri + 1, si);
        if (ri === 0) f.tri(RITE_SIGIL_RECORD, a.p, d.p, c.p, a.uv, d.uv, c.uv);
        else f.quad(RITE_SIGIL_RECORD, a.p, d.p, c.p, b.p, a.uv, d.uv, c.uv, b.uv);
      }
    }
  }
  if (stone) {
    for (const [x, z] of L.braziers) {
      const R = RITE_BRAZIER_W;
      const rim = Array.from({ length: 6 }, (_, j) => h(x + Math.cos((j / 6) * 2 * Math.PI) * R, z + Math.sin((j / 6) * 2 * Math.PI) * R));
      const y0 = Math.min(h(x, z), ...rim) - 0.3, y1 = h(x, z) + RITE_BRAZIER_H;
      for (let j = 0; j < 6; j++) {
        const a0 = (j / 6) * 2 * Math.PI, a1 = ((j + 1) / 6) * 2 * Math.PI, u = j * 0.15;
        const p = (a, y) => [x + Math.cos(a) * R, y, z + Math.sin(a) * R];
        f.quad(GATE_STONE_RECORD, p(a0, y0), p(a0, y1), p(a1, y1), p(a1, y0), [u, 0], [u, 1.5], [u + 0.3, 1.5], [u + 0.3, 0]);
        f.tri(GATE_STONE_RECORD, [x, y1, z], p(a1, y1), p(a0, y1), [0.5, 0.5], [0.5 + Math.cos(a1) * 0.3, 0.5 + Math.sin(a1) * 0.3], [0.5 + Math.cos(a0) * 0.3, 0.5 + Math.sin(a0) * 0.3]);
      }
    }
    box(f, GATE_STONE_RECORD, boxCorners(L.altar.x, L.altar.z, L.altar.yaw, RITE_ALTAR.w, RITE_ALTAR.d, RITE_ALTAR.h, h));
    box(f, GATE_STONE_RECORD, boxCorners(L.casket.x, L.casket.z, L.casket.yaw, RITE_CASKET.w, RITE_CASKET.d, RITE_CASKET.h, h));
  }
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
