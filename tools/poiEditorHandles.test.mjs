// Tests the in-game editor host with a stub world. Run: node --test tools/poiEditorHandles.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoiEdit } from '../src/poi/poiEdit.js';
import { createPoiEditorHost } from '../src/poi/poiEditorHost.js';
import { gizmoSize } from '../src/poi/poiGizmo.js';
import { GIZMO_ARM_PX } from '../src/poi/poiGizmoLook.js';
import { lookDir } from '../src/homes/decorTool.js';
import { perspective, lookAt } from '../src/world/mat4.js';
import { projectToScreen } from '../src/player/tapRay.js';

const W = 800, H = 600, FOV = Math.PI / 3;
const rand = (b) => { for (let i = 0; i < b.length; i++) b[i] = (i * 37 + 11) & 255; return b; };

function world() {
  const edit = createPoiEdit({ rand });
  const cam = { pos: [0, 0, 0], yaw: 0, pitch: 0 };
  const frame = () => {
    const f = lookDir(cam.yaw, cam.pitch), eye = [...cam.pos];
    return { proj: perspective(FOV, W / H, 0.1, 5000), view: lookAt(eye, [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]], [0, 1, 0]), eye, fovY: FOV, w: W, h: H, canvasRect: { left: 0, top: 0 } };
  };
  const ui = createPoiEditorHost({
    edit, feed: { setOverlay() {} }, host: { pick: () => null, partOf: () => null, flatBox: () => null },
    view: frame, translation: (px, py, out = [0, 0, 0]) => { out[0] = 0; out[1] = 0; out[2] = 0; return out; },
    sceneToPixel: () => ({ px: 500, py: 250, x: 0, z: 0 }), groundHit: () => ({ point: null, dist: Infinity }), surfaceAt: () => 0,
  });
  ui.enter();
  const id = edit.create({ px: 500, py: 250, x: 0, z: 0, name: 'Mill' });
  const c = ui.pivot();
  cam.pos = [c[0] - 6, c[1] + 3, c[2] - 10];
  const to = [c[0] - cam.pos[0], c[1] - cam.pos[1], c[2] - cam.pos[2]];
  cam.yaw = Math.atan2(to[0], to[2]) + 0.35; cam.pitch = Math.asin(to[1] / Math.hypot(...to));
  const arrowAt = () => {
    const v = frame(), d = [c[0] - v.eye[0], c[1] - v.eye[1], c[2] - v.eye[2]], l = Math.hypot(...d);
    const L = gizmoSize(v.eye, d.map((k) => k / l), c, FOV, H, GIZMO_ARM_PX), p = projectToScreen([c[0] + L * 0.4, c[1], c[2]], W, H, v.proj, v.view);
    return [p.x, p.y];
  };
  return { edit, ui, cam, id, arrowAt, x: () => edit.docOf(id).place.x };
}
const at = ([x, y], button = 0) => ({ clientX: x, clientY: y, button });

test('a press grabs no handle that the camera has moved away from the cursor', () => {
  const { ui, cam, arrowAt, x } = world();
  const p = arrowAt();
  ui.pointerMove(at(p), cam);
  assert.equal(ui.hovered(), 'x', 'the cursor rests on the x arrow');
  ui.wheel({ deltaY: -1 }, cam);
  const q = arrowAt();
  assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) > 30, 'the step moves the arrow away from the cursor');
  const x0 = x();
  ui.pointerDown(at(p));
  assert.equal(ui.hovered(), null, 'the press finds no handle under it, and nothing stays lit');
  ui.pointerMove(at([p[0] + 3, p[1]]), cam);
  ui.pointerUp(at([p[0] + 3, p[1]]));
  assert.equal(x(), x0, 'the POI did not move');
});

test('a press grabs a handle that the camera has moved under the cursor', () => {
  const { ui, cam, arrowAt, x } = world();
  const p = arrowAt();
  ui.wheel({ deltaY: 1 }, cam);
  const q = arrowAt();
  ui.wheel({ deltaY: -1 }, cam);
  ui.pointerMove(at(q), cam);
  assert.equal(ui.hovered(), null, 'nothing is under the cursor before the step');
  ui.wheel({ deltaY: 1 }, cam);
  assert.ok(Math.hypot(arrowAt()[0] - q[0], arrowAt()[1] - q[1]) < 1 && Math.hypot(q[0] - p[0], q[1] - p[1]) > 30, 'the step back brings the arrow under the cursor');
  const x0 = x();
  ui.pointerDown(at(q));
  ui.pointerMove(at([q[0] + 40, q[1]]), cam);
  ui.pointerUp(at([q[0] + 40, q[1]]));
  assert.notEqual(x(), x0, 'the POI moved along x');
});

test('the selection boxes are made once and remade when a box, the selection, or the POI changes', async () => {
  const { newPart } = await import('../src/poi/poiEdit.js');
  const edit = createPoiEdit({ rand });
  const id = edit.create({ px: 500, py: 250, x: 0, z: 0, name: 'Yard' }, (d) => { for (let i = 0; i < 3; i++) d.parts.push(newPart(d, { mesh: 'a'.repeat(64), submeshes: 1 })); });
  const boxes = new Map(edit.docOf(id).parts.map((p, i) => [p.key, [i * 3, 0, 0, i * 3 + 2, 1, 2]]));
  const eye = [3, 6, -12];
  const ui = createPoiEditorHost({
    edit, feed: { setOverlay() {} }, host: { pick: () => null, partOf: (_, k) => ({ scene: null, box: boxes.get(k), min: null, max: null }), flatBox: () => null },
    view: () => ({ proj: perspective(FOV, W / H, 0.1, 5000), view: lookAt(eye, [3, 0, 1], [0, 1, 0]), eye, fovY: FOV, w: W, h: H, canvasRect: { left: 0, top: 0 } }),
    translation: (px, py, out = [0, 0, 0]) => { out[0] = 0; out[1] = 0; out[2] = 0; return out; },
    sceneToPixel: () => ({ px: 500, py: 250, x: 0, z: 0 }), groundHit: () => ({ point: null, dist: Infinity }), surfaceAt: () => 0,
  });
  ui.enter();
  const first = ui.lineSets().inWorld;
  assert.equal(first.length, 36, 'three boxes of twelve edges');
  assert.equal(ui.lineSets().inWorld[0], first[0], 'nothing changed: the same lines');
  const [k0, k1] = [...boxes.keys()];
  boxes.get(k0)[3] = 2.5;
  assert.ok(ui.lineSets().inWorld.some((l) => l.a[0] === 2.5 || l.b[0] === 2.5), 'a box refilled in place is drawn where it is now');
  edit.select({ id, items: [`part:${k1}`] });
  assert.equal(ui.lineSets().inWorld.length, 12, 'a part selected: its box alone');
  edit.edit(id, 'hide', (d) => { d.parts.find((p) => p.key === k1).visible = false; });
  assert.equal(ui.lineSets().inWorld.length, 0, 'the part hidden: no box');
});

test('a DM spot picked on snow lands under the cursor, and one picked on a model keeps the model\'s point', async () => {
  const { groundHit } = await import('../src/player/travelPick.js');
  const edit = createPoiEdit({ rand });
  const id = edit.create({ px: 500, py: 250, x: 0, z: 0, name: 'Camp' });
  const eye = [0, 3.6, -10], RISE = 0.5;
  const roofHit = (o, d) => { const t = (4 - o[1]) / d[1], x = o[0] + d[0] * t; return t > 0 && x > 6 && x < 10 ? { point: [x, 4, o[2] + d[2] * t], dist: t } : null; };
  const frame = () => ({ proj: perspective(FOV, W / H, 0.1, 5000), view: lookAt(eye, [0, 0, 0], [0, 1, 0]), eye, fovY: FOV, w: W, h: H, canvasRect: { left: 0, top: 0 } });
  const ui = createPoiEditorHost({
    edit, feed: { setOverlay() {} }, host: { pick: () => null, partOf: () => null, flatBox: () => null }, view: frame,
    translation: (px, py, out = [0, 0, 0]) => { out[0] = 0; out[1] = 0; out[2] = 0; return out; },
    sceneToPixel: () => ({ px: 500, py: 250, x: 0, z: 0 }), surfaceAt: () => 0, snowRise: () => RISE,
    groundHit: (o, d) => { const g = groundHit(o, d, () => 0), m = roofHit(o, d); return m && m.dist < g.dist ? m : g; },
  });
  ui.enter();
  const v = frame(), screen = (p) => { const q = projectToScreen(p, W, H, v.proj, v.view); return [q.x, q.y]; };
  let got = null;
  ui.pickSpot(id, (p) => { got = p; });
  ui.pointerMove(at(screen([1, RISE, 0])), {});
  ui.pointerDown(at(screen([1, RISE, 0])));
  assert.ok(got && Math.abs(got[0] - 1) < 0.02 && Math.abs(got[2]) < 0.02 && Math.abs(got[1]) < 1e-6, `spot ${JSON.stringify(got)}, want (1, 0, 0)`);
  ui.pickSpot(id, (p) => { got = p; });
  ui.pointerDown(at(screen([8, 4, 2])));
  assert.ok(got && Math.abs(got[0] - 8) < 0.02 && Math.abs(got[1] - 4) < 1e-6 && Math.abs(got[2] - 2) < 0.02, `roof spot ${JSON.stringify(got)}, want (8, 4, 2)`);
});
