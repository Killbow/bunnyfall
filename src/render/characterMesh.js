// @ts-check

/** @returns {Float32Array} */
export function packCharacterFaces(faces) {
  let tris = 0;
  for (const f of faces) tris += f.p.length / 3 - 2;
  const out = new Float32Array(tris * 3 * 9);
  let o = 0;
  const put = (f, vi, r, g, b) => {
    out[o++] = f.p[vi * 3];
    out[o++] = f.p[vi * 3 + 1];
    out[o++] = f.p[vi * 3 + 2];
    out[o++] = r; out[o++] = g; out[o++] = b;
    out[o++] = f.n[0]; out[o++] = f.n[1]; out[o++] = f.n[2];
  };
  for (const f of faces) {
    const r = f.c[0] / 255, g = f.c[1] / 255, b = f.c[2] / 255;
    const np = f.p.length / 3;
    for (let i = 1; i < np - 1; i++) {
      put(f, 0, r, g, b);
      put(f, i, r, g, b);
      put(f, i + 1, r, g, b);
    }
  }
  return out;
}
