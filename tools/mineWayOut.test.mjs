import assert from 'node:assert/strict';
import test from 'node:test';
import { mineWayOutModel, mineWayOutPicture, MINE_WAY_OUT } from '../src/world/mine/mineWayOut.js';
import { mineLayout } from '../src/net/mine/mineLayout.js';

test('the way out hangs square across the mouth tunnel, behind its door', () => {
  const L = mineLayout(398616, 0);
  const m = mineWayOutModel(L), p = m.positions, pts = L.tunnels.find((t) => t.from === 'mouth').pts;
  const leg = [pts[1][0] - pts[0][0], pts[1][2] - pts[0][2]], across = [p[3] - p[0], p[5] - p[2]];
  assert.ok(Math.abs(leg[0] * across[0] + leg[1] * across[1]) < 1e-3);   // square to the tunnel's own first leg
  const mid = [(p[0] + p[3]) / 2, (p[2] + p[5]) / 2];
  assert.ok(mid[0] * leg[0] + mid[1] * leg[1] < 0);   // behind the door, toward the closing wall
  assert.ok(Math.abs(Math.hypot(...across) - MINE_WAY_OUT.w) < 1e-3);
  assert.equal(m.subMeshes[0].primitiveCount, 4);
});

test('the daylight glows and the timbers do not', () => {
  const { picture, glow } = mineWayOutPicture();
  const at = (img, x, y) => img.colors[(y * img.width + x) * 4];
  assert.equal(at(glow, 0, 10), 0);   // a post
  assert.equal(at(glow, 16, 0), 0);   // the lintel
  assert.ok(at(glow, 16, 16) > 200 && at(picture, 16, 16) === at(glow, 16, 16));
});
