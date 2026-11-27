import test from 'node:test';
import assert from 'node:assert/strict';
import { gizmoSize } from '../src/poi/poiGizmo.js';
import { gizmoParts, GIZMO_ARM_PX } from '../src/poi/poiGizmoLook.js';
import { beginHandleDrag, handleDragResult } from '../src/poi/poiGizmoBox.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const C = [0, 0, 0];

function gizmoFrom(eye, box) {
  const viewDir = norm(sub(C, eye)), L = gizmoSize(eye, viewDir, C, Math.PI / 3, 800, GIZMO_ARM_PX);
  return { mode: 'size', c: C, axes: AXES, L, viewDir, pxWorld: L / GIZMO_ARM_PX, eye, fwd: viewDir, box };
}
function shown(g) {
  return gizmoParts('size', g.c, g.axes, g.L, g.viewDir, { box: g.box, eye: g.eye })
    .filter((p) => !p.hidden)
    .map((p) => ({ key: p.key, at: mul(p.mesh.v.reduce((s, v) => add(s, v), [0, 0, 0]), 1 / 8) }));
}
const ray = (eye, p) => norm(sub(p, eye));
const factorOf = (r) => r.size.find((f) => f !== 1) ?? 1;

test('dragging the top face up makes a part with its origin at one end taller', () => {
  const g = gizmoFrom([10, 20, 0], { lo: [0, 0, -1], hi: [4, 3, 1] });
  const top = shown(g).find((h) => h.key === 'y+');
  assert.ok(top, 'the top face handle is shown');
  const s = beginHandleDrag(g, 'y+', g.eye, ray(g.eye, top.at));
  assert.ok(s);
  for (const k of [0.2, 0.5, 1]) {
    const f = factorOf(handleDragResult(s, g.eye, ray(g.eye, add(top.at, [0, k, 0]))));
    assert.ok(Math.abs(f - (3 + k) / 3) < 1e-6, `moved ${k} m up: factor ${f}, want ${(3 + k) / 3}`);
  }
});

test('every face handle grows its side when dragged outward, from any raised view', () => {
  const box = { lo: [-2, 0, -1], hi: [2, 3, 1] };
  const bad = [];
  let grabs = 0;
  for (let h = 0; h < 24; h++) for (const up of [10, 25, 40, 55, 70]) {
    const a = (h / 24) * 2 * Math.PI, e = (up * Math.PI) / 180;
    const g = gizmoFrom([15 * Math.cos(e) * Math.sin(a), 15 * Math.sin(e), 15 * Math.cos(e) * Math.cos(a)], box);
    for (const { key, at } of shown(g)) {
      if (key.startsWith('corner')) continue;
      const i = 'xyz'.indexOf(key[0]), sgn = key[1] === '+' ? 1 : -1, along = sgn > 0 ? box.hi[i] : box.lo[i];
      const s = beginHandleDrag(g, key, g.eye, ray(g.eye, at));
      if (!s) continue;
      grabs++;
      const f = factorOf(handleDragResult(s, g.eye, ray(g.eye, add(at, mul(AXES[i], sgn * 0.5)))));
      const want = (Math.abs(along) + 0.5) / Math.abs(along);
      if (!(Math.abs(f - want) < 1e-3)) bad.push({ h, up, key, f: +f.toFixed(3), want: +want.toFixed(3) });
    }
  }
  assert.ok(grabs > 500, `grabs ${grabs}`);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} of ${grabs} grabs read wrong`);
});

test('a corner handle never sizes the selection several times over in a few pixels', () => {
  const cases = [
    { name: 'origin at a corner', eye: [6, 8, 9], box: { lo: [0, 0, 0], hi: [2, 1, 2] } },
    { name: 'thin floor tile from above', eye: [0.01, 12, 0.02], box: { lo: [0, 0, 0], hi: [2, 0.002, 2] } },
    { name: 'centered cube along its diagonal', eye: [8, 8, 8], box: { lo: [-1, -1, -1], hi: [1, 1, 1] } },
    { name: '12 m beam seen end-on from its near end', eye: [0, 0.1, 4], box: { lo: [-0.1, 0, -12], hi: [0.1, 0.2, 0] } },
  ];
  for (const { name, eye, box } of cases) {
    const g = gizmoFrom(eye, box);
    for (const p of gizmoParts('size', g.c, g.axes, g.L, g.viewDir, { box, eye })) {
      if (!p.hidden || !p.key.startsWith('corner')) continue;
      const at = mul(p.mesh.v.reduce((s, v) => add(s, v), [0, 0, 0]), 1 / 8);
      assert.equal(beginHandleDrag(g, p.key, eye, ray(eye, at)), null, `${name}, ${p.key}: a hidden corner is refused`);
    }
    for (const { key, at } of shown(g)) {
      if (!key.startsWith('corner')) continue;
      const px = (g.pxWorld * dot(sub(at, eye), g.viewDir)) / dot(sub(C, eye), g.viewDir), right = norm([g.viewDir[2], 0, -g.viewDir[0]]);
      const p0 = add(at, mul(right, 2 * px)), off = sub(p0, C), outDir = norm(sub(off, mul(g.viewDir, dot(off, g.viewDir))));
      const s = beginHandleDrag(g, key, g.eye, ray(g.eye, p0));
      if (!s) continue;
      const f = factorOf(handleDragResult(s, g.eye, ray(g.eye, add(p0, mul(outDir, 10 * px)))));
      assert.ok(f > 1 && f < 1.5, `${name}, ${key}: factor ${f.toFixed(3)} after 10 px`);
    }
  }
});
