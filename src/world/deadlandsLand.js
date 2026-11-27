// @ts-check
import { faces, spike, GATE_ARCHIVE, GATE_STONE_RECORD } from './gateModel.js';
import { courtToDungeon, courtSpireAxes, SPIRE_BASE_W, COURT_ARCHIVE, COURT_FLOOR_RECORD, LAVA_Y } from './gateArena.js';
import { seededRng } from '../weather/wind.js';
import { SIGIL_TOWER, DEAD_CLOCK_PERIOD } from '../render/deadlands.js';
import { COURT_R, COURTS, COURTS_HIS, WALKS, WALK_HALF_W } from '../net/gateBrain.js';

export const ISLAND_COUNT = 12;
export const ISLAND_NEAR = 75;
export const ISLAND_FAR = 235;
export const TOWER_WINDOW = 0.42;
export const SHARD_COUNT = 6;
export const SHARD_RING = Object.freeze([COURT_R + 11, COURT_R + 32]);
export const SHARD_RISE = Object.freeze([3, 16]);
export const SHARD_WINDOW = 0.8;
export const LAND_SEED = 0xdead1a;
export const SHARD_COUNT_FAR = 4;
export const LAND_CLEAR_M = 12;

export function floorGap(x, z, own = -1) {
  let g = Infinity;
  COURTS.forEach(([cx, cz], k) => { if (k !== own) g = Math.min(g, Math.hypot(x - cx, z - cz) - COURT_R); });
  for (const w of WALKS) {
    const t = Math.max(0, Math.min(w.len, (x - w.ax) * w.ux + (z - w.az) * w.uz));
    g = Math.min(g, Math.hypot(x - (w.ax + w.ux * t), z - (w.az + w.uz * t)) - WALK_HALF_W);
  }
  return g;
}

export const SHARD_REACH = 1.1;
export const SHARD_SPIRE_GAP_M = 1.6;
export function spireGap(x, z, size, k) {
  let g = Infinity;
  for (const sp of courtSpireAxes(k)) {
    const vx = sp.t[0] - sp.b[0], vz = sp.t[2] - sp.b[2], l2 = vx * vx + vz * vz;
    const h = l2 > 0 ? Math.max(0, Math.min(1, ((x - sp.b[0]) * vx + (z - sp.b[2]) * vz) / l2)) : 0;
    g = Math.min(g, Math.hypot(x - (sp.b[0] + vx * h), z - (sp.b[2] + vz * h)) - SPIRE_BASE_W * Math.SQRT2 - SHARD_REACH * size);
  }
  return g;
}

// Matches `deadAzimuth` in the Deadlands renderer, so azimuth 0 points from the arrival toward the boss.
const azOf = (x, z) => Math.atan2(x, -z);
const wrapPi = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

export function deadlandsIslands() {
  const rolls = seededRng(LAND_SEED);
  const out = [];
  for (let i = 0; i < ISLAND_COUNT; i++) {
    let az = ((i + 0.5) / ISLAND_COUNT) * Math.PI * 2 - Math.PI + (rolls() - 0.5) * 0.35;
    const off = wrapPi(az - SIGIL_TOWER.az);
    if (Math.abs(off) < TOWER_WINDOW) az = SIGIL_TOWER.az + Math.sign(off || 1) * (TOWER_WINDOW + 0.05);
    let d = ISLAND_NEAR + rolls() * (ISLAND_FAR - ISLAND_NEAR);
    const rMax = (9 + 12) * (0.6 + 0.4 + 0.35) * 1.35;
    while (floorGap(Math.sin(az) * d, -Math.cos(az) * d) < rMax + LAND_CLEAR_M && d < ISLAND_FAR + 120) d += 8;
    const x = Math.sin(az) * d, z = -Math.cos(az) * d;
    const scale = 0.6 + 0.4 * ((d - ISLAND_NEAR) / (ISLAND_FAR - ISLAND_NEAR)) + rolls() * 0.35;
    const r = (9 + rolls() * 12) * scale;
    const mound = (8 + rolls() * 10) * scale;
    const spires = [];
    const n = 3 + Math.floor(rolls() * 5);
    for (let k = 0; k < n; k++) {
      const a = rolls() * Math.PI * 2, rr = r * (0.15 + rolls() * 0.45);
      const bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr;
      const tall = (k === 0 ? 1 : 0.35 + rolls() * 0.55) * (40 + rolls() * 45) * scale;
      const lean = 0.12 + rolls() * 0.3;
      const la = a + (rolls() - 0.5) * 0.8;
      spires.push({
        base: [bx, LAVA_Y + mound * 0.35, bz],
        w: (2 + rolls() * 3) * scale * (k === 0 ? 1.4 : 1),
        tip: [bx + Math.cos(la) * tall * lean, LAVA_Y + mound * 0.35 + tall, bz + Math.sin(la) * tall * lean],
      });
    }
    out.push({ x, z, r, mound, spires });
  }
  return out;
}

function mound(f, cx, cz, r, h, rolls) {
  const sides = 9;
  const base = [], mid = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2 + rolls() * 0.3;
    const rb = r * (0.8 + rolls() * 0.35), rm = r * (0.4 + rolls() * 0.25);
    base.push(courtToDungeon(cx + Math.cos(a) * rb, LAVA_Y - 3, cz + Math.sin(a) * rb));
    mid.push(courtToDungeon(cx + Math.cos(a) * rm, LAVA_Y + h * (0.45 + rolls() * 0.3), cz + Math.sin(a) * rm));
  }
  const peak = courtToDungeon(cx + (rolls() - 0.5) * r * 0.3, LAVA_Y + h, cz + (rolls() - 0.5) * r * 0.3);
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    f.quad(GATE_STONE_RECORD, base[k], mid[k], mid[k1], base[k1], [0, 0], [0, 1], [1, 1], [1, 0]);
    f.tri(GATE_STONE_RECORD, mid[k], peak, mid[k1], [0, 1], [0.5, 2], [1, 1]);
  }
}

function toModel(f, byArchive) {
  const recs = [...f.byRec.keys()].sort((a, b) => a - b);
  const count = recs.reduce((n, r) => n + f.byRec.get(r).p.length / 3, 0);
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  const indices = new Uint32Array(count);
  const subMeshes = [];
  let v = 0;
  for (const rec of recs) {
    const g = f.byRec.get(rec);
    const n = g.p.length / 3;
    positions.set(g.p, v * 3); normals.set(g.n, v * 3); uvs.set(g.uv, v * 2);
    for (let i = 0; i < n; i++) indices[v + i] = v + i;
    const [textureArchive, textureRecord] = byArchive.get(rec);
    subMeshes.push({ textureArchive, textureRecord, startIndex: v, primitiveCount: n / 3 });
    v += n;
  }
  return { positions, normals, uvs, indices, subMeshes };
}

export function buildDeadlandsLand() {
  const f = faces();
  const rolls = seededRng(LAND_SEED ^ 0x5a17);
  for (const isl of deadlandsIslands()) {
    mound(f, isl.x, isl.z, isl.r, isl.mound, rolls);
    for (const s of isl.spires) spike(f, courtToDungeon(...s.base), s.w, courtToDungeon(...s.tip));
  }
  return toModel(f, new Map([[GATE_STONE_RECORD, [GATE_ARCHIVE, GATE_STONE_RECORD]]]));
}

// `bobTurns` and `spinTurns` are whole numbers, so a shard shows no jump when the clock wraps at
// `DEAD_CLOCK_PERIOD`.
export function deadlandsShards() {
  const rolls = seededRng(LAND_SEED ^ 0x0b0b);
  const out = [];
  for (let i = 0; i < SHARD_COUNT; i++) {
    let az = ((i + 0.5) / SHARD_COUNT) * Math.PI * 2 - Math.PI + (rolls() - 0.5) * 0.4;
    const offTower = wrapPi(az - SIGIL_TOWER.az);
    if (Math.abs(offTower) < SHARD_WINDOW) az = SIGIL_TOWER.az + Math.sign(offTower || 1) * (SHARD_WINDOW + 0.1);
    if (Math.abs(wrapPi(az - Math.PI)) < 0.45) az += 0.6;
    const d = SHARD_RING[0] + rolls() * (SHARD_RING[1] - SHARD_RING[0]);
    const y = SHARD_RISE[0] + rolls() * (SHARD_RISE[1] - SHARD_RISE[0]);
    const size = 2.5 + rolls() * 3.5;
    const tilt = (rolls() - 0.5) * 0.35;
    const bob = 0.6 + rolls() * 1.1;
    const bobTurns = 40 + Math.floor(rolls() * 40);
    const spinTurns = (1 + Math.floor(rolls() * 3)) * (rolls() < 0.5 ? -1 : 1);
    const phase = rolls();
    const off = (a) => Math.abs(wrapPi(a - SIGIL_TOWER.az)) < SHARD_WINDOW || Math.abs(wrapPi(a - Math.PI)) < 0.45
      || floorGap(Math.sin(a) * d, -Math.cos(a) * d, 0) < LAND_CLEAR_M || (a !== az0 && spireGap(Math.sin(a) * d, -Math.cos(a) * d, size, 0) < SHARD_SPIRE_GAP_M);
    const az0 = az;
    for (let turn = 0; turn < 48 && off(az); turn++) az += 0.13;
    out.push({ x: Math.sin(az) * d, z: -Math.cos(az) * d, y, size, tilt, bob, bobTurns, spinTurns, phase });
  }
  for (let k = 1; k < COURTS_HIS; k++) {
    const far = seededRng((LAND_SEED ^ 0x0b0b ^ (k * 0x9e37)) >>> 0), [cx, cz] = COURTS[k];
    for (let i = 0; i < SHARD_COUNT_FAR; i++) {
      let az = ((i + 0.5) / SHARD_COUNT_FAR) * Math.PI * 2 + (far() - 0.5) * 0.6;
      const d = SHARD_RING[0] + far() * (SHARD_RING[1] - SHARD_RING[0]);
      const y = SHARD_RISE[0] + far() * (SHARD_RISE[1] - SHARD_RISE[0]);
      const size = 2.5 + far() * 3.5;
      const tilt = (far() - 0.5) * 0.35;
      const bob = 0.6 + far() * 1.1;
      const bobTurns = 40 + Math.floor(far() * 40);
      const spinTurns = (1 + Math.floor(far() * 3)) * (far() < 0.5 ? -1 : 1);
      const phase = far();
      const at = (a) => [cx + Math.sin(a) * d, cz - Math.cos(a) * d];
      const off = (a) => { const [x, z] = at(a); return floorGap(x, z, k) < LAND_CLEAR_M || spireGap(x, z, size, k) < SHARD_SPIRE_GAP_M; };
      for (let turn = 0; turn < 48 && off(az); turn++) az += 0.13;
      const [x, z] = at(az);
      out.push({ x, z, y, size, tilt, bob, bobTurns, spinTurns, phase });
    }
  }
  return out;
}

export function buildShardModel() {
  const f = faces();
  const rolls = seededRng(LAND_SEED ^ 0x51ab);
  const sides = 8, ring = [], edge = [], core = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2 + (rolls() - 0.5) * 0.45;
    const r = 0.7 + rolls() * 0.45;
    ring.push([Math.cos(a) * r, (rolls() - 0.5) * 0.08, Math.sin(a) * r]);
    edge.push([Math.cos(a) * r * (0.88 + rolls() * 0.1), -0.35 - rolls() * 0.15, Math.sin(a) * r * (0.88 + rolls() * 0.1)]);
    core.push([Math.cos(a + 0.2) * r * (0.45 + rolls() * 0.2), -0.95 - rolls() * 0.3, Math.sin(a + 0.2) * r * (0.45 + rolls() * 0.2)]);
  }
  const tip = [(rolls() - 0.5) * 0.3, -2.1 - rolls() * 0.8, (rolls() - 0.5) * 0.3];
  const c = [0, 0.02, 0];
  const uv = (p) => [p[0] * 0.5 + 0.5, p[2] * 0.5 + 0.5];
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    f.tri(COURT_FLOOR_RECORD + 1000, c, ring[k1], ring[k], uv(c), uv(ring[k1]), uv(ring[k]));
    f.quad(GATE_STONE_RECORD, edge[k], ring[k], ring[k1], edge[k1], [0, 0], [0, 0.3], [1, 0.3], [1, 0]);
    f.quad(GATE_STONE_RECORD, core[k], edge[k], edge[k1], core[k1], [0, 0], [0, 0.5], [1, 0.5], [1, 0]);
    f.tri(GATE_STONE_RECORD, core[k], core[k1], tip, [0, 0], [1, 0], [0.5, 1.5]);
  }
  for (let k = 0; k < 3; k++) {
    const b = core[(k * 3) % sides];
    spike(f, b, 0.16 + rolls() * 0.1, [b[0] * 1.2 + (rolls() - 0.5) * 0.4, b[1] - 0.9 - rolls() * 1.1, b[2] * 1.2 + (rolls() - 0.5) * 0.4]);
  }
  return toModel(f, new Map([[GATE_STONE_RECORD, [GATE_ARCHIVE, GATE_STONE_RECORD]], [COURT_FLOOR_RECORD + 1000, [COURT_ARCHIVE, COURT_FLOOR_RECORD]]]));
}

export function shardMatrix(s, seconds, out = new Float32Array(16)) {
  const t = ((seconds % DEAD_CLOCK_PERIOD) + DEAD_CLOCK_PERIOD) % DEAD_CLOCK_PERIOD;
  const bob = Math.sin((t / DEAD_CLOCK_PERIOD) * s.bobTurns * 2 * Math.PI + s.phase * 2 * Math.PI) * s.bob;
  const yaw = (t / DEAD_CLOCK_PERIOD) * s.spinTurns * 2 * Math.PI + s.phase * 7;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(s.tilt ?? 0), st = Math.sin(s.tilt ?? 0);
  const k = s.size;
  const [px, py, pz] = courtToDungeon(s.x, s.y + bob, s.z);
  out.set([cy * k, 0, -sy * k, 0, sy * st * k, ct * k, cy * st * k, 0, sy * ct * k, -st * k, cy * ct * k, 0, px, py, pz, 1]);
  return out;
}
