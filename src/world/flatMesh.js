// @ts-check
// Builds flat-shaded meshes in code, one picture each. It also exports seededRandom, a repeatable random series.

export function flatMesh(tile, uvOf = null) {
  const p = [], n = [], uv = [];
  /** cross(b - a, c - a) must point along `out`: the renderer draws gl.frontFace(CW) through a mirrored projection. */
  const tri = (a, b, c, out, ownUv = uvOf) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz);
    if (!(l > 1e-9)) return;
    nx /= l; ny /= l; nz /= l;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { const s = b; b = c; c = s; nx = -nx; ny = -ny; nz = -nz; }
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    for (const v of [a, b, c]) {
      p.push(v[0], v[1], v[2]);
      n.push(nx, ny, nz);
      if (ownUv) uv.push(...ownUv(v));
      else if (ay >= ax && ay >= az) uv.push(v[0] / tile, v[2] / tile);
      else if (az >= ax) uv.push(v[0] / tile, v[1] / tile);
      else uv.push(v[2] / tile, v[1] / tile);
    }
  };
  const quad = (a, b, c, d, out) => { tri(a, b, c, out); tri(a, c, d, out); };
  return { p, n, uv, tri, quad };
}

export function flatModel(b, art) {
  const indices = new Uint32Array(b.p.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  return { positions: new Float32Array(b.p), normals: new Float32Array(b.n), uvs: new Float32Array(b.uv), indices,
    subMeshes: [{ textureArchive: art.archive, textureRecord: art.record, startIndex: 0, primitiveCount: indices.length / 3 }] };
}

export function seededRandom(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) / 16777216; };
}
