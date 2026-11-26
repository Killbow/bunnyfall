// Fits the cloak over the assembled body, and stowed gear over or under the cloak, then keeps the gear clear of it
// in every pose. The cloak batch and gear sources are replaced, never written into, since a source may be the
// parsed batch's own array.
import { GRAPH_ROOT } from './mwSkin.js';
import { placeAtBone, placeNormalsAtBone } from './mwFirstPerson.js';

export const CLOAK_CLEARANCE = 1;
export const CLOAK_PUSH_LIMIT = 10;
export const CLOAK_EASE_RADIUS = 8;
export const HIP_PITCH_LIMIT = 60;
export const SLUNG_PITCH_LIMIT = 15;
export const SLUNG_MOVE_LIMIT = 15;
export const SAMPLE_STEP = 1;
export const SLUNG_UNDER = 'bip01 spine1';
export const CLOAK_FIT_POSES = Object.freeze([
  Object.freeze({}),
  Object.freeze({ 'bip01 r thigh': ['z', 35], 'bip01 l thigh': ['z', -30], 'bip01 l calf': ['z', 45], 'bip01 l upperarm': ['z', 25], 'bip01 r upperarm': ['z', -25] }),
  Object.freeze({ 'bip01 l thigh': ['z', 35], 'bip01 r thigh': ['z', -30], 'bip01 r calf': ['z', 45], 'bip01 l upperarm': ['z', 25], 'bip01 r upperarm': ['z', -25] }),
  Object.freeze({ 'bip01 spine2': ['z', -10] }),
]);
export const FOLLOW = Object.freeze({ rounds: 6, sweeps: 40, slideCost: 0.1, maxTurn: 25 * Math.PI / 180, maxSlide: 8, cell: 2 });

export const sheetCellKey = (x, z) => (Math.round(x) + 32768) * 65536 + (Math.round(z) + 32768);

export function surfaceSamples(positions, indices, step = SAMPLE_STEP, keep = null) {
  if (keep) return Float32Array.from(samplesWhere(positions, indices, step, keep));
  const edges = new Map();
  let count = positions.length / 3;
  for (let t = 0; t < indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t + e], b = indices[t + (e + 1) % 3];
      const k = a < b ? a * 1048576 + b : b * 1048576 + a;
      if (edges.has(k)) continue;
      const n = Math.floor(Math.hypot(positions[b * 3] - positions[a * 3], positions[b * 3 + 1] - positions[a * 3 + 1], positions[b * 3 + 2] - positions[a * 3 + 2]) / step);
      edges.set(k, n);
      count += n;
    }
  }
  const out = new Float32Array(count * 3);
  out.set(positions);
  let o = positions.length;
  for (const [k, n] of edges) {
    if (!n) continue;
    const a = Math.floor(k / 1048576), b = k % 1048576;
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const dx = positions[b * 3] - ax, dy = positions[b * 3 + 1] - ay, dz = positions[b * 3 + 2] - az;
    for (let i = 1; i <= n; i++) { const f = i / (n + 1); out[o++] = ax + dx * f; out[o++] = ay + dy * f; out[o++] = az + dz * f; }
  }
  return out;
}

function samplesWhere(positions, indices, step, keep, edges = edgesOf(indices)) {
  const out = [];
  for (let v = 0; v < positions.length; v += 3) if (keep(positions[v], positions[v + 1], positions[v + 2])) out.push(positions[v], positions[v + 1], positions[v + 2]);
  for (let k = 0; k < edges.length; k += 2) {
    const a = edges[k] * 3, b = edges[k + 1] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const dx = positions[b] - ax, dy = positions[b + 1] - ay, dz = positions[b + 2] - az;
    const n = Math.floor(Math.hypot(dx, dy, dz) / step);
    for (let i = 1; i <= n; i++) { const f = i / (n + 1); const x = ax + dx * f, y = ay + dy * f, z = az + dz * f; if (keep(x, y, z)) out.push(x, y, z); }
  }
  return out;
}
function edgesOf(indices) {
  const seen = new Set(); const out = [];
  for (let t = 0; t < indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t + e], b = indices[t + (e + 1) % 3];
      const k = a < b ? a * 1048576 + b : b * 1048576 + a;
      if (seen.has(k)) continue;
      seen.add(k); out.push(a, b);
    }
  }
  return Int32Array.from(out);
}

function quatOf(m) {
  const tr = m[0] + m[4] + m[8];
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [s / 4, (m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s]; }
  if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; return [(m[7] - m[5]) / s, s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s]; }
  if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; return [(m[2] - m[6]) / s, (m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s]; }
  const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
  return [(m[3] - m[1]) / s, (m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4];
}

function poseOf(assembly, turns = {}) {
  const { fns, skeleton } = assembly;
  const rots = new Map();
  for (const [name, [axis, deg]] of Object.entries(turns)) {
    const node = skeleton.nodes.get(skeleton.byName.get(name));
    if (!node) continue;
    const rest = node.rest.rotation;
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const r = axis === 'x' ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === 'y' ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1];
    rots.set(name, quatOf(mul33(rest, r)));
  }
  const pose = rots.size
    ? fns.poseSkeleton(skeleton, new Map([...rots.keys()].map((k) => [k, k])), (k) => ({ rotation: rots.get(k) }), 0, { accumRoot: null })
    : fns.poseSkeleton(skeleton, null, null, 0, { accumRoot: null });
  const mats = fns.skelMats(skeleton, pose, GRAPH_ROOT);
  const place = (p, batch = p.batch, source = p.source) => {
    if (p.kind === 'skinned') {
      const out = new Float32Array(batch.positions.length);
      fns.skinBatch(batch, skeleton, pose, mats, out, null);
      return out;
    }
    return placeAtBone(source, fns.attachmentTransform(mats, p.attachRef), p.mirrored, new Float32Array(source.length), p.boneOffset);
  };
  return { pose, mats, place };
}

export function cloakSheet(positions, indices) {
  const cells = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    const d = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(d) < 1e-9) continue;
    for (let i = Math.ceil(Math.min(ax, bx, cx) - 0.5); i <= Math.floor(Math.max(ax, bx, cx) + 0.5); i++) {
      for (let j = Math.ceil(Math.min(az, bz, cz) - 0.5); j <= Math.floor(Math.max(az, bz, cz) + 0.5); j++) {
        const wa = ((bx - i) * (cz - j) - (cx - i) * (bz - j)) / d;
        const wb = ((cx - i) * (az - j) - (ax - i) * (cz - j)) / d;
        const wc = 1 - wa - wb;
        if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
        const y = wa * ay + wb * by + wc * cy;
        const k = (i + 32768) * 65536 + (j + 32768);
        const cell = cells.get(k);
        if (!cell) { cells.set(k, { front: y, frontTri: t, back: y, backTri: t }); continue; }
        if (y > cell.front) { cell.front = y; cell.frontTri = t; }
        if (y < cell.back) { cell.back = y; cell.backTri = t; }
      }
    }
  }
  return cells;
}

function weldOf(positions) {
  const first = new Map();
  const rep = new Int32Array(positions.length / 3);
  for (let v = 0; v < rep.length; v++) {
    const k = `${positions[v * 3].toFixed(4)},${positions[v * 3 + 1].toFixed(4)},${positions[v * 3 + 2].toFixed(4)}`;
    if (!first.has(k)) first.set(k, v);
    rep[v] = first.get(k);
  }
  return rep;
}

const det3 = (m) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
function solve3(m, v) {
  const d = det3(m);
  if (Math.abs(d) < 1e-9) return null;
  const col = (k) => { const c = m.slice(); c[k] = v[0]; c[3 + k] = v[1]; c[6 + k] = v[2]; return det3(c) / d; };
  return [col(0), col(1), col(2)];
}

export function fitCloakOver(assembly, { isCloak, isUnder, clearance = CLOAK_CLEARANCE, limit = CLOAK_PUSH_LIMIT, radius = CLOAK_EASE_RADIUS, poses = CLOAK_FIT_POSES }) {
  const cloaks = assembly.pieces.filter((p) => p.kind === 'skinned' && isCloak(p));
  if (!cloaks.length) return null;
  const underPieces = assembly.pieces.filter((p) => !cloaks.includes(p) && isUnder(p)).map((p) => ({ p, edges: edgesOf(p.indices) }));
  const sets = poses.map((turns) => ({ ...poseOf(assembly, turns), under: null, jac: null }));
  let pushed = 0; let most = 0; let deep = 0;
  for (const cloak of cloaks) {
    const bind = Float32Array.from(cloak.batch.positions);
    const n = bind.length / 3;
    const rep = weldOf(bind);
    const total = new Float64Array(n);
    const deepSeen = new Set();
    for (let pass = 0; pass < 12; pass++) {
      let moved = false;
      for (const set of sets) {
        // Skinning is affine in the bind position (J v + t per vertex), so each pose is measured once from the
        // origin and the unit axes, and later passes are arithmetic.
        if (!set.jac || set.jac.cloak !== cloak) {
          const at0 = set.place(cloak, { ...cloak.batch, positions: new Float32Array(bind.length) });
          const axes = [0, 1, 2].map((k) => { const q = new Float32Array(bind.length); for (let v = 0; v < n; v++) q[v * 3 + k] = 1; return set.place(cloak, { ...cloak.batch, positions: q }); });
          const J = new Float64Array(n * 9);
          for (let v = 0; v < n; v++) for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) J[v * 9 + r * 3 + k] = axes[k][v * 3 + r] - at0[v * 3 + r];
          set.jac = { cloak, J, t: at0 };
        }
        const { J, t: t0 } = set.jac;
        const posed = new Float64Array(bind.length);
        for (let v = 0; v < n; v++) {
          const x = bind[v * 3], y = bind[v * 3 + 1], z = bind[v * 3 + 2], o = v * 9;
          posed[v * 3] = J[o] * x + J[o + 1] * y + J[o + 2] * z + t0[v * 3];
          posed[v * 3 + 1] = J[o + 3] * x + J[o + 4] * y + J[o + 5] * z + t0[v * 3 + 1];
          posed[v * 3 + 2] = J[o + 6] * x + J[o + 7] * y + J[o + 8] * z + t0[v * 3 + 2];
        }
        if (!set.under) {
          let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity;
          for (let v = 0; v < posed.length; v += 3) {
            x0 = Math.min(x0, posed[v]); x1 = Math.max(x1, posed[v]); y1 = Math.max(y1, posed[v + 1]);
            z0 = Math.min(z0, posed[v + 2]); z1 = Math.max(z1, posed[v + 2]);
          }
          const inside = (x, y, z) => x > x0 - 1 && x < x1 + 1 && z > z0 - 1 && z < z1 + 1 && y < y1 + clearance;
          set.under = [];
          for (const { p, edges } of underPieces) {
            const placed = set.place(p);
            let lx = Infinity, hx = -Infinity, lz = Infinity, hz = -Infinity, ly = Infinity;
            for (let v = 0; v < placed.length; v += 3) {
              lx = Math.min(lx, placed[v]); hx = Math.max(hx, placed[v]); ly = Math.min(ly, placed[v + 1]);
              lz = Math.min(lz, placed[v + 2]); hz = Math.max(hz, placed[v + 2]);
            }
            if (hx < x0 - 1 || lx > x1 + 1 || hz < z0 - 1 || lz > z1 + 1 || ly > y1 + clearance) continue;
            set.under.push(samplesWhere(placed, p.indices, SAMPLE_STEP, inside, edges));
          }
        }
        const sheet = cloakSheet(posed, cloak.indices);
        const need = new Float64Array(n);
        const through = [];
        const deepest = new Map();
        for (const u of set.under) {
          for (let v = 0; v < u.length; v += 3) {
            const cell = sheet.get(sheetCellKey(u[v], u[v + 2]));
            if (!cell) continue;
            const over = cell.front - (u[v + 1] - clearance);
            if (over <= 1e-4) continue;
            // A point deeper than the remaining room is left through and recorded, not chased; chasing it creeps
            // the ring around it up to the limit.
            let room = Infinity;
            for (let k = 0; k < 3; k++) room = Math.min(room, limit - total[rep[cloak.indices[cell.frontTri + k]]]);
            if (over > room + 1e-6) { deepSeen.add(sheetCellKey(u[v], u[v + 2])); continue; }
            const ck = sheetCellKey(u[v], u[v + 2]);
            const at = deepest.get(ck);
            if (at == null) { deepest.set(ck, through.length); through.push(u[v], u[v + 2], over); } else if (over > through[at + 2]) { through[at] = u[v]; through[at + 1] = u[v + 2]; through[at + 2] = over; }
            for (let k = 0; k < 3; k++) { const w = rep[cloak.indices[cell.frontTri + k]]; if (over > need[w]) need[w] = over; }
          }
        }
        if (!through.length) continue;
        const buckets = new Map();
        for (let k = 0; k < through.length; k += 3) {
          const b = (Math.floor(through[k] / radius) + 32768) * 65536 + (Math.floor(through[k + 1] / radius) + 32768);
          const list = buckets.get(b);
          if (list) list.push(k); else buckets.set(b, [k]);
        }
        const r2 = radius * radius;
        for (let v = 0; v < n; v++) {
          if (rep[v] !== v) continue;
          const x = posed[v * 3], z = posed[v * 3 + 2];
          const bx = Math.floor(x / radius), bz = Math.floor(z / radius);
          for (let i = bx - 1; i <= bx + 1; i++) {
            for (let j = bz - 1; j <= bz + 1; j++) {
              const list = buckets.get((i + 32768) * 65536 + (j + 32768));
              if (!list) continue;
              for (const k of list) {
                const d2 = ((x - through[k]) ** 2 + (z - through[k + 1]) ** 2) / r2;
                if (d2 >= 1) continue;
                const ease = through[k + 2] * (1 - d2) ** 2;
                if (ease > need[v]) need[v] = ease;
              }
            }
          }
        }
        for (let v = 0; v < n; v++) {
          const step = Math.min(need[rep[v]], limit - total[rep[v]]);
          if (step <= 0) continue;
          const d = solve3(Array.from(J.subarray(v * 9, v * 9 + 9)), [0, -step, 0]);
          if (!d) continue;
          bind[v * 3] += d[0]; bind[v * 3 + 1] += d[1]; bind[v * 3 + 2] += d[2];
          moved = true;
        }
        for (let v = 0; v < n; v++) if (rep[v] === v) total[v] += Math.min(need[v], Math.max(0, limit - total[v]));
      }
      if (!moved) break;
    }
    deep += deepSeen.size;
    for (let v = 0; v < n; v++) if (rep[v] === v && total[v] > 0) { pushed += 1; most = Math.max(most, total[v]); }
    if (total.some((t) => t > 0)) {
      const normals = cloak.batch.normals ? faceAs(vertexNormals(bind, cloak.indices, rep), cloak.batch.normals) : cloak.batch.normals;
      cloak.batch = { ...cloak.batch, positions: bind, normals };
      if (assembly.pose && assembly.mats) assembly.fns.skinBatch(cloak.batch, assembly.skeleton, assembly.pose, assembly.mats, cloak.positions, cloak.normals ?? null);
    }
  }
  return { pushed, most, deep };
}

function vertexNormals(positions, indices, rep) {
  const N = new Float64Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const e1x = positions[b] - positions[a], e1y = positions[b + 1] - positions[a + 1], e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a], e2y = positions[c + 1] - positions[a + 1], e2z = positions[c + 2] - positions[a + 2];
    const f = [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x];
    for (const v of [indices[t], indices[t + 1], indices[t + 2]]) { const w = rep[v] * 3; N[w] += f[0]; N[w + 1] += f[1]; N[w + 2] += f[2]; }
  }
  const out = new Float32Array(positions.length);
  for (let v = 0; v < rep.length; v++) {
    const w = rep[v] * 3; const l = Math.hypot(N[w], N[w + 1], N[w + 2]) || 1;
    out[v * 3] = N[w] / l; out[v * 3 + 1] = N[w + 1] / l; out[v * 3 + 2] = N[w + 2] / l;
  }
  return out;
}
function faceAs(fresh, old) {
  let s = 0;
  for (let k = 0; k < fresh.length; k++) s += fresh[k] * old[k];
  if (s < 0) for (let k = 0; k < fresh.length; k++) fresh[k] = -fresh[k];
  return fresh;
}

function under(skeleton, ref, name) {
  for (let at = skeleton.nodes.get(ref)?.parent; at != null && at >= 0; at = skeleton.nodes.get(at)?.parent) {
    if (String(skeleton.nodes.get(at)?.name ?? '').toLowerCase() === name) return true;
  }
  return false;
}

function pitch(deg) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
const mul3v = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
function mul33(p, q) { return [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => p[r * 3] * q[c] + p[r * 3 + 1] * q[3 + c] + p[r * 3 + 2] * q[6 + c])); }
function inv3(m) {
  const d = det3(m);
  return [
    (m[4] * m[8] - m[5] * m[7]) / d, (m[2] * m[7] - m[1] * m[8]) / d, (m[1] * m[5] - m[2] * m[4]) / d,
    (m[5] * m[6] - m[3] * m[8]) / d, (m[0] * m[8] - m[2] * m[6]) / d, (m[2] * m[3] - m[0] * m[5]) / d,
    (m[3] * m[7] - m[4] * m[6]) / d, (m[1] * m[6] - m[0] * m[7]) / d, (m[0] * m[4] - m[1] * m[3]) / d,
  ];
}

function gearGroups(assembly, isGear) {
  const groups = new Map();
  for (const p of assembly.pieces) {
    if (p.kind !== 'rigid' || p.mirrored || p.hang || !isGear(p)) continue;
    if (!groups.has(p.attachRef)) groups.set(p.attachRef, []);
    groups.get(p.attachRef).push(p);
  }
  return groups;
}

export function fitStowedGear(assembly, { isCloak, isGear, clearance = CLOAK_CLEARANCE, pitchLimit = HIP_PITCH_LIMIT, slungLimit = SLUNG_PITCH_LIMIT, moveLimit = SLUNG_MOVE_LIMIT }) {
  const cloaks = assembly.pieces.filter((p) => p.kind === 'skinned' && isCloak(p));
  if (!cloaks.length) return null;
  const rest = poseOf(assembly);
  const sheets = cloaks.map((c) => cloakSheet(rest.place(c), c.indices));
  const front = (x, z) => { let y = null; for (const s of sheets) { const c = s.get(sheetCellKey(x, z)); if (c && (y == null || c.front > y)) y = c.front; } return y; };
  const back = (x, z) => { let y = null; for (const s of sheets) { const c = s.get(sheetCellKey(x, z)); if (c && (y == null || c.back < y)) y = c.back; } return y; };
  const rows = [];
  for (const [ref, pieces] of gearGroups(assembly, isGear)) {
    const at = assembly.fns.attachmentTransform(rest.mats, ref);
    const corners = pieces.map((p) => rest.place(p));
    const posed = corners.map((q, i) => surfaceSamples(q, pieces[i].indices));
    const slung = under(assembly.skeleton, ref, SLUNG_UNDER);
    const bone = pieces[0].bone;
    const t = at.t;
    let reached = false;
    const each = (set, deg, visit) => {
      const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      for (const q of set) for (let v = 0; v < q.length; v += 3) {
        const dy = q[v + 1] - t[1], dz = q[v + 2] - t[2];
        if (visit(q[v], c * dy - s * dz + t[1], s * dy + c * dz + t[2]) === false) return false;
      }
      return true;
    };
    let move = null;
    if (slung) {
      const needAt = (set, deg) => {
        let need = 0; let here = false;
        each(set, deg, (x, y, z) => { const s = back(x, z); if (s == null) return; here = true; need = Math.max(need, y - (s - clearance)); });
        return here ? need : null;
      };
      const turns = [];
      for (let k = 0; k <= 2 * slungLimit; k++) {
        const deg = k % 2 ? (k + 1) / 2 : -k / 2;
        const need = needAt(corners, deg);
        turns.push({ deg, k, low: need ?? -Infinity });
      }
      turns.sort((a, b) => a.low - b.low || a.k - b.k);
      let least = Infinity;
      const held = [];
      for (const turn of turns) {
        if (turn.low > least + 1e-4) break;
        const need = needAt(posed, turn.deg);
        if (need == null) continue;
        held.push({ deg: turn.deg, k: turn.k, need });
        least = Math.min(least, need);
      }
      if (!held.length) continue;
      reached = true;
      const best = held.filter((h) => h.need <= least + 1e-4).sort((a, b) => a.k - b.k)[0];
      if (best.need > moveLimit) { rows.push({ bone, slung, how: 'unresolved', by: 0 }); continue; }
      if (best.need > 1e-4 || best.deg) move = { rot: best.deg ? pitch(best.deg) : null, d: [0, -best.need, 0], how: 'over', by: best.need, deg: best.deg };
    } else {
      const clearAt = (set, deg) => each(set, deg, (x, y, z) => { const s = front(x, z); if (s == null) return; reached = true; if (y < s + clearance) return false; });
      let deg = 0;
      while (deg <= pitchLimit && !clearAt(corners, deg)) deg++;
      while (deg <= pitchLimit && !clearAt(posed, deg)) deg++;
      if (deg > pitchLimit) { rows.push({ bone, slung, how: 'unresolved', by: 0 }); continue; }
      if (deg === 0) { if (reached) rows.push({ bone, slung, how: 'clear', by: 0 }); continue; }
      move = { rot: pitch(deg), d: [0, 0, 0], how: 'pitched', by: deg };
    }
    if (!move) { rows.push({ bone, slung, how: 'clear', by: 0 }); continue; }
    const ai = inv3(at.a);
    const lin = move.rot ? mul33(ai, mul33(move.rot, at.a)) : null;
    const dl = mul3v(ai, ...move.d);
    for (const p of pieces) {
      const o = p.boneOffset ?? [0, 0, 0];
      const src = new Float32Array(p.source.length);
      for (let v = 0; v < src.length; v += 3) {
        const w = [p.source[v] + o[0], p.source[v + 1] + o[1], p.source[v + 2] + o[2]];
        const r = lin ? mul3v(lin, ...w) : w;
        src[v] = r[0] + dl[0] - o[0]; src[v + 1] = r[1] + dl[1] - o[1]; src[v + 2] = r[2] + dl[2] - o[2];
      }
      p.source = src;
      // Bumping `sourceGen` makes the GPU skin stream (mwGpuSkin.js) rebuild from the new source.
      p.sourceGen = (p.sourceGen | 0) + 1;
      if (lin && p.sourceNormals) {
        const nrm = new Float32Array(p.sourceNormals.length);
        for (let v = 0; v < nrm.length; v += 3) {
          const r = mul3v(lin, p.sourceNormals[v], p.sourceNormals[v + 1], p.sourceNormals[v + 2]);
          const l = Math.hypot(r[0], r[1], r[2]) || 1;
          nrm[v] = r[0] / l; nrm[v + 1] = r[1] / l; nrm[v + 2] = r[2] / l;
        }
        p.sourceNormals = nrm;
      }
      if (assembly.mats) {
        const live = assembly.fns.attachmentTransform(assembly.mats, p.attachRef);
        placeAtBone(p.source, live, p.mirrored, p.positions, p.boneOffset);
        if (p.normals && p.sourceNormals) placeNormalsAtBone(p.sourceNormals, live, p.mirrored, p.normals);
      }
    }
    rows.push({ bone, slung, how: move.how, by: move.by, ...(move.how === 'over' ? { deg: move.deg } : {}) });
  }
  return rows;
}

export function followCloak(assembly, { isCloak, isGear, clearance = CLOAK_CLEARANCE }) {
  const cloak = assembly.pieces.find((p) => p.kind === 'skinned' && isCloak(p));
  assembly.afterPose = null;
  for (const p of assembly.pieces) if (p.followAt) p.followAt = null;
  if (!cloak) return null;
  const rest = poseOf(assembly);
  const C = rest.place(cloak); const T = cloak.indices;
  const B = 2; const bucket = (i, j) => (i + 32768) * 65536 + (j + 32768);
  const buckets = new Map();
  for (let t = 0; t < T.length; t += 3) {
    const xs = [C[T[t] * 3], C[T[t + 1] * 3], C[T[t + 2] * 3]], zs = [C[T[t] * 3 + 2], C[T[t + 1] * 3 + 2], C[T[t + 2] * 3 + 2]];
    for (let i = Math.floor(Math.min(...xs) / B); i <= Math.floor(Math.max(...xs) / B); i++) {
      for (let j = Math.floor(Math.min(...zs) / B); j <= Math.floor(Math.max(...zs) / B); j++) {
        const k = bucket(i, j); const list = buckets.get(k);
        if (list) list.push(t); else buckets.set(k, [t]);
      }
    }
  }
  const groups = [];
  for (const [ref, pieces] of gearGroups(assembly, isGear)) {
    const at = assembly.fns.attachmentTransform(rest.mats, ref);
    const ai = inv3(at.a);
    const cells = new Map();
    const cell = FOLLOW.cell;
    let side = 0;
    for (const p of pieces) {
      const S = surfaceSamples(rest.place(p), p.indices, cell);
      for (let v = 0; v < S.length; v += 3) {
        const x = S[v], y = S[v + 1], z = S[v + 2];
        let bt = -1, ba = 0, bb = 0, bc = 0, by = 0;
        for (const t of buckets.get(bucket(Math.floor(x / B), Math.floor(z / B))) ?? []) {
          const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
          const d = (C[b] - C[a]) * (C[c + 2] - C[a + 2]) - (C[c] - C[a]) * (C[b + 2] - C[a + 2]);
          if (Math.abs(d) < 1e-9) continue;
          const wa = ((C[b] - x) * (C[c + 2] - z) - (C[c] - x) * (C[b + 2] - z)) / d;
          const wb = ((C[c] - x) * (C[a + 2] - z) - (C[a] - x) * (C[c + 2] - z)) / d;
          const wc = 1 - wa - wb;
          if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
          const cy = wa * C[a + 1] + wb * C[b + 1] + wc * C[c + 1];
          if (bt < 0 || Math.abs(cy - y) < Math.abs(by - y)) { bt = t; ba = wa; bb = wb; bc = wc; by = cy; }
        }
        if (bt < 0) continue;
        side += y - by;
        const k = (Math.floor(x / cell) + 32768) * 65536 + (Math.floor(z / cell) + 32768);
        const prev = cells.get(k);
        if (!prev || Math.abs(by - y) < prev.gap) cells.set(k, { t: bt, wa: ba, wb: bb, wc: bc, g: mul3v(ai, x - at.t[0], y - at.t[1], z - at.t[2]), gap: Math.abs(by - y), x, y, z });
      }
    }
    if (!cells.size) continue;
    const n = cells.size;
    const group = {
      ref, pieces, slide: side < 0,
      contacts: n, tri: new Int32Array(n), w: new Float32Array(n * 3), g: new Float32Array(n * 3), s: new Int8Array(n), need: new Float32Array(n),
      cons: new Float64Array(n * 7), R: new Float64Array(9), tr: new Float64Array(3), A: new Float64Array(9), t: new Float64Array(3),
      at: { a: null, t: null }, step: new Float64Array(9), tmp: new Float64Array(9),
    };
    group.at.a = group.A; group.at.t = group.t;
    let i = 0;
    for (const k of cells.values()) {
      group.tri[i] = k.t; group.w[i * 3] = k.wa; group.w[i * 3 + 1] = k.wb; group.w[i * 3 + 2] = k.wc;
      group.g[i * 3] = k.g[0]; group.g[i * 3 + 1] = k.g[1]; group.g[i * 3 + 2] = k.g[2];
      const a = T[k.t] * 3, b = T[k.t + 1] * 3, c = T[k.t + 2] * 3;
      const e1 = [C[b] - C[a], C[b + 1] - C[a + 1], C[b + 2] - C[a + 2]], e2 = [C[c] - C[a], C[c + 1] - C[a + 1], C[c + 2] - C[a + 2]];
      const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
      const px = k.wa * C[a] + k.wb * C[b] + k.wc * C[c], py = k.wa * C[a + 1] + k.wb * C[b + 1] + k.wc * C[c + 1], pz = k.wa * C[a + 2] + k.wb * C[b + 2] + k.wc * C[c + 2];
      const gap = ((k.x - px) * nn[0] + (k.y - py) * nn[1] + (k.z - pz) * nn[2]) / l;
      group.s[i] = gap >= 0 ? 1 : -1;
      group.need[i] = Math.min(clearance, Math.abs(gap));
      i++;
    }
    groups.push(group);
  }
  if (!groups.length) return null;
  const follow = { cloak, groups };
  assembly.afterPose = (a) => applyCloakFollow(a, follow);
  if (assembly.mats) applyCloakFollow(assembly, follow);
  return follow;
}

function rotationOf(wx, wy, wz, out) {
  const t = Math.hypot(wx, wy, wz);
  if (t < 1e-12) { out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0; out[4] = 1; out[5] = 0; out[6] = 0; out[7] = 0; out[8] = 1; return out; }
  const x = wx / t, y = wy / t, z = wz / t, c = Math.cos(t), s = Math.sin(t), v = 1 - c;
  out[0] = c + x * x * v; out[1] = x * y * v - z * s; out[2] = x * z * v + y * s;
  out[3] = y * x * v + z * s; out[4] = c + y * y * v; out[5] = y * z * v - x * s;
  out[6] = z * x * v - y * s; out[7] = z * y * v + x * s; out[8] = c + z * z * v;
  return out;
}
function mulInto(p, q, out) {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = p[r * 3] * q[c] + p[r * 3 + 1] * q[3 + c] + p[r * 3 + 2] * q[6 + c];
  return out;
}

// When the GPU skins the pose, only the cloak is skinned here for the contacts. Each turned piece leaves its
// placement in `followAt` for the skin palette instead of placing vertices.
export function applyCloakFollow(assembly, follow) {
  const gpu = assembly.cpuSkinned === false;
  if (gpu) assembly.fns.skinBatch(follow.cloak.batch, assembly.skeleton, assembly.pose, assembly.mats, follow.cloak.positions, null);
  const C = follow.cloak.positions; const T = follow.cloak.indices;
  const { rounds, sweeps, slideCost, maxTurn, maxSlide } = FOLLOW;
  for (const g of follow.groups) {
    const at = assembly.fns.attachmentTransform(assembly.mats, g.ref);
    const R = g.R; R[0] = 1; R[1] = 0; R[2] = 0; R[3] = 0; R[4] = 1; R[5] = 0; R[6] = 0; R[7] = 0; R[8] = 1;
    const tr = g.tr; tr[0] = 0; tr[1] = 0; tr[2] = 0;
    for (let round = 0; round < rounds; round++) {
      mulInto(R, at.a, g.A);
      const A = g.A; const cons = g.cons;
      let m = 0;
      for (let i = 0; i < g.contacts; i++) {
        const gx = g.g[i * 3], gy = g.g[i * 3 + 1], gz = g.g[i * 3 + 2];
        const rx = A[0] * gx + A[1] * gy + A[2] * gz, ry = A[3] * gx + A[4] * gy + A[5] * gz, rz = A[6] * gx + A[7] * gy + A[8] * gz;
        const px0 = rx + at.t[0] + tr[0], py0 = ry + at.t[1] + tr[1], pz0 = rz + at.t[2] + tr[2];
        const t = g.tri[i]; const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
        const wa = g.w[i * 3], wb = g.w[i * 3 + 1], wc = g.w[i * 3 + 2];
        const cx = wa * C[a] + wb * C[b] + wc * C[c], cy = wa * C[a + 1] + wb * C[b + 1] + wc * C[c + 1], cz = wa * C[a + 2] + wb * C[b + 2] + wc * C[c + 2];
        const e1x = C[b] - C[a], e1y = C[b + 1] - C[a + 1], e1z = C[b + 2] - C[a + 2];
        const e2x = C[c] - C[a], e2y = C[c + 1] - C[a + 1], e2z = C[c + 2] - C[a + 2];
        let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        const l = Math.hypot(nx, ny, nz) || 1;
        const s = g.s[i] / l; nx *= s; ny *= s; nz *= s;
        const e = g.need[i] - ((px0 - cx) * nx + (py0 - cy) * ny + (pz0 - cz) * nz);
        if (e <= 1e-4) continue;
        cons[m * 7] = ry * nz - rz * ny; cons[m * 7 + 1] = rz * nx - rx * nz; cons[m * 7 + 2] = rx * ny - ry * nx;
        cons[m * 7 + 3] = g.slide ? nx / slideCost : 0; cons[m * 7 + 4] = g.slide ? ny / slideCost : 0; cons[m * 7 + 5] = g.slide ? nz / slideCost : 0;
        cons[m * 7 + 6] = e;
        m++;
      }
      if (!m) break;
      let w0 = 0, w1 = 0, w2 = 0, u0 = 0, u1 = 0, u2 = 0;
      for (let it = 0; it < sweeps; it++) {
        let moved = false;
        for (let k = 0; k < m; k++) {
          const o = k * 7;
          const have = w0 * cons[o] + w1 * cons[o + 1] + w2 * cons[o + 2] + u0 * cons[o + 3] + u1 * cons[o + 4] + u2 * cons[o + 5];
          if (have >= cons[o + 6]) continue;
          const len = cons[o] * cons[o] + cons[o + 1] * cons[o + 1] + cons[o + 2] * cons[o + 2] + cons[o + 3] * cons[o + 3] + cons[o + 4] * cons[o + 4] + cons[o + 5] * cons[o + 5];
          if (len < 1e-12) continue;
          const f = (cons[o + 6] - have) / len;
          w0 += f * cons[o]; w1 += f * cons[o + 1]; w2 += f * cons[o + 2]; u0 += f * cons[o + 3]; u1 += f * cons[o + 4]; u2 += f * cons[o + 5];
          moved = true;
        }
        if (!moved) break;
      }
      // Each round's step is capped to its share of the limits, since the linear model holds only near where it was
      // taken.
      const wt = Math.hypot(w0, w1, w2), wl = maxTurn / rounds;
      if (wt > wl) { w0 *= wl / wt; w1 *= wl / wt; w2 *= wl / wt; }
      const ut = Math.hypot(u0, u1, u2) / slideCost, ul = maxSlide / rounds;
      if (ut > ul) { u0 *= ul / ut; u1 *= ul / ut; u2 *= ul / ut; }
      rotationOf(w0, w1, w2, g.step);
      tr[0] += u0 / slideCost; tr[1] += u1 / slideCost; tr[2] += u2 / slideCost;
      mulInto(g.step, R, g.tmp); R.set(g.tmp);
    }
    mulInto(R, at.a, g.A);
    g.t[0] = at.t[0] + tr[0]; g.t[1] = at.t[1] + tr[1]; g.t[2] = at.t[2] + tr[2];
    for (const p of g.pieces) {
      p.followAt = g.at;
      if (gpu) continue;
      placeAtBone(p.source, g.at, p.mirrored, p.positions, p.boneOffset);
      if (p.normals && p.sourceNormals) placeNormalsAtBone(p.sourceNormals, g.at, p.mirrored, p.normals);
    }
  }
}
