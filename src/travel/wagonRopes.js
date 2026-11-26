// @ts-check

export const ROPE = Object.freeze({
  points: 9, sides: 4, gravity: 9.81, damping: 0.97, iterations: 10, maxStep: 1 / 60, maxSteps: 4, leap: 3,
  trace: Object.freeze({ slack: 1.02, radius: 0.022 }),
  rein: Object.freeze({ slack: 1.06, radius: 0.011 }),
});

export function newRope(kind = 'trace') {
  const n = ROPE.points;
  return { kind, n, p: new Float64Array(n * 3), q: new Float64Array(n * 3), a: [0, 0, 0], b: [0, 0, 0], laid: false };
}

export const restSag = (d, slack) => Math.sqrt(Math.max(0, (3 * d * (slack * d - d)) / 8));

export function layRope(rope, a, b) {
  const { n, p, q } = rope;
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const sag = restSag(d, ROPE[rope.kind]?.slack ?? ROPE.trace.slack);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), drop = 4 * sag * t * (1 - t);
    for (let k = 0; k < 3; k++) p[i * 3 + k] = a[k] + (b[k] - a[k]) * t;
    p[i * 3 + 1] -= drop;
  }
  q.set(p);
  rope.a = [a[0], a[1], a[2]]; rope.b = [b[0], b[1], b[2]]; rope.laid = true;
}

// A frame longer than `ROPE.maxSteps * ROPE.maxStep` drops the remainder instead of catching up. `scale` multiplies
// gravity and the leap distance, so a grown rig hangs the same.
const _ea = [0, 0, 0], _eb = [0, 0, 0];
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const keep3 = (to, v) => { to[0] = v[0]; to[1] = v[1]; to[2] = v[2]; };

export function stepRope(rope, a, b, dt, scale = 1) {
  const s = scale > 0 ? scale : 1;
  const leapt = !rope.laid || len3(a[0] - rope.a[0], a[1] - rope.a[1], a[2] - rope.a[2]) > ROPE.leap * s || len3(b[0] - rope.b[0], b[1] - rope.b[1], b[2] - rope.b[2]) > ROPE.leap * s;
  if (leapt || !(dt > 0)) { if (leapt) layRope(rope, a, b); else { pinEnds(rope, a, b); keep3(rope.a, a); keep3(rope.b, b); } return rope; }
  const steps = Math.min(ROPE.maxSteps, Math.max(1, Math.ceil(dt / ROPE.maxStep)));
  const h = Math.min(dt, ROPE.maxStep * steps) / steps;
  const { n, p, q } = rope;
  const span = len3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const link = (span * (ROPE[rope.kind]?.slack ?? ROPE.trace.slack)) / (n - 1);
  const a0 = rope.a, b0 = rope.b;
  for (let st = 1; st <= steps; st++) {
    const t = st / steps;
    const ea = _ea, eb = _eb;
    for (let k = 0; k < 3; k++) { ea[k] = a0[k] + (a[k] - a0[k]) * t; eb[k] = b0[k] + (b[k] - b0[k]) * t; }
    for (let i = 1; i < n - 1; i++) {
      for (let k = 0; k < 3; k++) {
        const o = i * 3 + k, v = (p[o] - q[o]) * ROPE.damping;
        q[o] = p[o];
        p[o] += v + (k === 1 ? -ROPE.gravity * s * h * h : 0);
      }
    }
    pinEnds(rope, ea, eb);
    for (let it = 0; it < ROPE.iterations; it++) {
      for (let i = 0; i < n - 1; i++) {
        const o = i * 3, u = o + 3;
        const dx = p[u] - p[o], dy = p[u + 1] - p[o + 1], dz = p[u + 2] - p[o + 2];
        const len = len3(dx, dy, dz);
        if (!(len > 1e-9)) continue;
        const wa = i === 0 ? 0 : 1, wb = i + 1 === n - 1 ? 0 : 1;
        if (!(wa + wb)) continue;
        const f = (len - link) / len / (wa + wb);
        p[o] += dx * f * wa; p[o + 1] += dy * f * wa; p[o + 2] += dz * f * wa;
        p[u] -= dx * f * wb; p[u + 1] -= dy * f * wb; p[u + 2] -= dz * f * wb;
      }
    }
  }
  keep3(rope.a, a); keep3(rope.b, b);
  return rope;
}
function pinEnds(rope, a, b) {
  const { n, p, q } = rope, e = (n - 1) * 3;
  for (let k = 0; k < 3; k++) { p[k] = q[k] = a[k]; p[e + k] = q[e + k] = b[k]; }
}

// Each ring repeats its seam vertex so the strap texture wraps.
export const tubeVertexCount = (ropes) => ropes * ROPE.points * (ROPE.sides + 1);

/**
 * @param {number} count
 * @param {number} archive
 * @param {number} record
 */
export function tubeModel(count, archive, record) {
  const S = ROPE.sides, n = ROPE.points, ring = S + 1;
  const verts = tubeVertexCount(count);
  const uvs = new Float32Array(verts * 2);
  const idx = [];
  for (let r = 0; r < count; r++) {
    const base = r * n * ring;
    for (let i = 0; i < n; i++) for (let k = 0; k <= S; k++) { const v = base + i * ring + k; uvs[v * 2] = k / S; uvs[v * 2 + 1] = i * 0.5; }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < S; k++) {
      const a = base + i * ring + k, b = base + (i + 1) * ring + k, c = a + 1, d = b + 1;
      // Both windings are emitted so the strap shows from either side under any face culling.
      idx.push(a, b, c, c, b, d);
      idx.push(a, c, b, c, d, b);
    }
  }
  const indices = Uint32Array.from(idx);
  return { name: 'WagonHarness', positions: new Float32Array(verts * 3), normals: new Float32Array(verts * 3), uvs, indices, subMeshes: [{ textureArchive: archive, textureRecord: record, startIndex: 0, primitiveCount: indices.length / 3 }], doors: [] };
}

export function tubeInto(rope, r, radius, positions, normals) {
  const S = ROPE.sides, n = rope.n, ring = S + 1, p = rope.p;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(n - 1, i + 1) * 3;
    let tx = p[i1] - p[i0], ty = p[i1 + 1] - p[i0 + 1], tz = p[i1 + 2] - p[i0 + 2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let sx = -tz, sy = 0, sz = tx;
    let sl = Math.hypot(sx, sy, sz);
    if (sl < 1e-6) { sx = 1; sy = 0; sz = 0; sl = 1; }
    sx /= sl; sy /= sl; sz /= sl;
    const ux = sy * tz - sz * ty, uy = sz * tx - sx * tz, uz = sx * ty - sy * tx;
    for (let k = 0; k <= S; k++) {
      const th = (k / S) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      const nx = c * sx + sn * ux, ny = c * sy + sn * uy, nz = c * sz + sn * uz;
      const v = ((r * n + i) * ring + k) * 3;
      positions[v] = p[i * 3] + nx * radius; positions[v + 1] = p[i * 3 + 1] + ny * radius; positions[v + 2] = p[i * 3 + 2] + nz * radius;
      normals[v] = nx; normals[v + 1] = ny; normals[v + 2] = nz;
    }
  }
}
