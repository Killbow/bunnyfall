// Caps a mesh's holes with fans wound like the surrounding faces; each cap has its own flat-normal vertices.
// Positions are welded by value only to find the boundary loops, never in the output.
const keyOf = (P, i) => `${P[i * 3]},${P[i * 3 + 1]},${P[i * 3 + 2]}`;

export function boundaryLoops(mesh) {
  const P = mesh.positions, I = mesh.indices;
  const id = new Map();
  const pid = new Array(P.length / 3);
  for (let i = 0; i < pid.length; i++) { const k = keyOf(P, i); if (!id.has(k)) id.set(k, id.size); pid[i] = id.get(k); }
  const count = new Map();
  for (let t = 0; t < I.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = pid[I[t + e]], b = pid[I[t + (e + 1) % 3]];
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  const next = new Map(), firstVertex = new Map(), order = [];
  for (let t = 0; t < I.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const va = I[t + e], vb = I[t + (e + 1) % 3];
      const a = pid[va], b = pid[vb];
      if (count.get(a < b ? `${a}_${b}` : `${b}_${a}`) !== 1) continue;
      if (next.has(a)) throw new Error(`boundary vertex ${a} starts two boundary edges - the mesh is not manifold there`);
      next.set(a, b);
      firstVertex.set(a, va);
      order.push(a);
    }
  }
  const used = new Set(), loops = [];
  for (const start of order) {
    if (used.has(start)) continue;
    const loop = [];
    let at = start;
    while (!used.has(at)) {
      used.add(at);
      loop.push(firstVertex.get(at));
      at = next.get(at);
      if (at === undefined) throw new Error('a boundary that does not close');
    }
    loops.push(loop);
  }
  return loops;
}

export function capHoles(mesh) {
  const loops = boundaryLoops(mesh);
  const P = [...mesh.positions], N = mesh.normals ? [...mesh.normals] : null, U = mesh.uvs ? [...mesh.uvs] : null, I = [...mesh.indices];
  let triangles = 0;
  for (const loop of loops) {
    const pts = loop.map((v) => [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]]);
    const c = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
    let n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], w = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      n = [n[0] + u[1] * w[2] - u[2] * w[1], n[1] + u[2] * w[0] - u[0] * w[2], n[2] + u[0] * w[1] - u[1] * w[0]];
    }
    const len = Math.hypot(...n) || 1;
    n = n.map((v) => +(v / len).toFixed(6));
    const base = P.length / 3;
    const push = (p) => { P.push(...p.map((v) => +v.toFixed(6))); if (N) N.push(...n); if (U) U.push(0, 0); };
    push(c);
    for (const p of pts) push(p);
    for (let i = 0; i < pts.length; i++) {
      const a = base + 1 + i, b = base + 1 + (i + 1) % pts.length;
      I.push(b, a, base);
      triangles++;
    }
  }
  return { ...mesh, positions: P, normals: N, uvs: U, indices: I, bake: { ...(mesh.bake ?? {}), capped: { loops: loops.length, triangles } } };
}
