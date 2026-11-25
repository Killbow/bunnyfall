import assert from 'node:assert/strict';
import test from 'node:test';
import { mineLayout } from '../src/net/mine/mineLayout.js';
import { buildMineModel, mineColliderTris, mineTextures, mineChamberTop } from '../src/world/mine/mineModel.js';
import { CLIMATES } from '../src/formats/mapsTables.js';

/** The nearest hit along a ray (unit `d`) from `o` over a triangle soup, or Infinity. */
function rayHit(tris, o, d) {
  let best = Infinity;
  for (let i = 0; i < tris.length; i += 9) {
    const a = [tris[i], tris[i + 1], tris[i + 2]], b = [tris[i + 3], tris[i + 4], tris[i + 5]], c = [tris[i + 6], tris[i + 7], tris[i + 8]];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-9) continue;
    const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < 0 || u + v > 1) continue;
    const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (t > 1e-6 && t < best) best = t;
  }
  return best;
}

const LAYOUTS = [[1, 0], [77, 3], [4242, 9], [12, 1], [90210, 0], [555, 7], [31337, 2], [8, 8], [600123, 4], [42, 5]].map(([m, r]) => mineLayout(m, r));

test('the collider is a triangle soup of a real size', () => {
  const tris = mineColliderTris(LAYOUTS[0]);
  assert.equal(tris.length % 9, 0);
  assert.ok(tris.length / 9 > 3000, `${tris.length / 9} triangles`);
});

test('there is floor under every chamber centre and every tunnel point', () => {
  for (const layout of LAYOUTS) {
    const tris = mineColliderTris(layout);
    for (const s of layout.sections) for (const ch of s.chambers) {
      assert.ok(rayHit(tris, [ch.c[0], ch.c[1] + 1, ch.c[2]], [0, -1, 0]) <= 1.5, `floor under ${ch.id}`);
    }
    for (const t of layout.tunnels) for (const p of t.pts) {
      assert.ok(rayHit(tris, [p[0], p[1] + 1, p[2]], [0, -1, 0]) <= 1.5, `floor under ${t.from}-${t.to} at ${p.map((x) => x.toFixed(1))}`);
    }
  }
});

test('every chamber is roofed within its height and a metre', () => {
  for (const layout of LAYOUTS) {
    const tris = mineColliderTris(layout);
    for (const s of layout.sections) for (const ch of s.chambers) {
      const up = rayHit(tris, [ch.c[0], ch.c[1] + 0.5, ch.c[2]], [0, 1, 0]);
      assert.ok(up + 0.5 <= ch.h + 1, `${ch.id}: ceiling at ${(up + 0.5).toFixed(2)} for h ${ch.h.toFixed(2)}`);
      assert.ok(mineChamberTop(layout, ch.id) <= ch.h + 1);
    }
  }
});

test('the model has a wall, a floor and a ceiling, and no NaN', () => {
  const tex = mineTextures(CLIMATES.Woodlands);
  const model = buildMineModel(LAYOUTS[1], tex);
  assert.equal(model.subMeshes.length, 3);
  for (const s of model.subMeshes) assert.equal(s.textureArchive, tex.archive);
  assert.ok(model.positions.every((x) => Number.isFinite(x)));
  assert.equal(mineTextures(CLIMATES.Mountain).archive, 322);
});
