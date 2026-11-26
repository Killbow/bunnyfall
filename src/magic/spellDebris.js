// @ts-check
// Small stones a spell throws: they fly, bounce once on a hard landing, rest, then shrink into the ground.
// They land on the collider surface, or on the `base` height where there is none.
import { groundAt } from '../player/groundRay.js';
import { flatMesh, flatModel, seededRandom } from '../world/flatMesh.js';

const G = 13, REST_S = 1.2, SHRINK_S = 0.4, SHAPES = 4;
export const MAX_STONES = 60;
let born = 0;

function stoneModel(seed, art) {
  const rnd = seededRandom(seed);
  const b = flatMesh(0.5);
  const v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(([x, y, z]) => {
    const k = 0.4 + rnd() * 0.15;
    return [x * k * (0.8 + rnd() * 0.4), y * k * (0.6 + rnd() * 0.3), z * k * (0.8 + rnd() * 0.4)];
  });
  for (const sx of [0, 1]) for (const sy of [2, 3]) for (const sz of [4, 5]) {
    const a = v[sx], c = v[sy], d = v[sz];
    b.tri(a, c, d, [a[0] + c[0] + d[0], a[1] + c[1] + d[1], a[2] + c[2] + d[2]]);
  }
  return flatModel(b, art);
}

export function createSpellDebris({ collider }) {
  const stones = [];
  let meshes = null, gpu = null, artKey = null;
  const unit = (d) => { const l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
  const rand = (a, b) => a + Math.random() * (b - a);
  function free() {
    for (const m of meshes ?? []) { try { gpu?.destroyMesh?.(m); } catch {} }
    meshes = null; gpu = null;
  }
  return {
    get count() { return stones.length; },
    get first() { return stones.length ? stones[0].n : Infinity; },
    drop() { stones.shift(); },
    throw(p, v, size, base) {
      if (stones.length >= MAX_STONES) stones.shift();
      const ax = unit([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
      stones.push({ p, v, size, axis: ax, ang: Math.random() * 6.28, spin: rand(4, 12), floor: base, rest: -1, bounced: false, n: ++born,
        shape: Math.floor(Math.random() * SHAPES), mat: new Float32Array(16) });
    },
    step(dt) {
      for (let i = stones.length - 1; i >= 0; i--) {
        const st = stones[i];
        if (st.rest >= 0) {
          st.rest += dt;
          if (st.rest >= REST_S + SHRINK_S) stones.splice(i, 1);
          continue;
        }
        st.v[1] -= G * dt;
        for (let k = 0; k < 3; k++) st.p[k] += st.v[k] * dt;
        st.ang += st.spin * dt;
        const g = groundAt(collider, st.p[0], st.p[2]), floor = (Number.isFinite(g) ? g : st.floor) + st.size * 0.3;
        if (st.p[1] > floor) continue;
        st.p[1] = floor;
        if (!st.bounced && st.v[1] < -2) { st.bounced = true; st.v[1] *= -0.3; st.v[0] *= 0.5; st.v[2] *= 0.5; st.spin *= 0.5; }
        else st.rest = 0;
      }
    },
    draw(r, key, art) {
      if (!stones.length) return false;
      if (!meshes || gpu !== r || artKey !== key) {
        free();
        try { meshes = Array.from({ length: SHAPES }, (_, i) => r.createMesh(stoneModel(i + 1, art))); gpu = r; artKey = key; }
        catch (e) { console.warn('[spells] Failed to build spell debris meshes', e?.message ?? e); meshes = null; return false; }
      }
      for (const st of stones) {
        const s = st.size * (st.rest > REST_S ? Math.max(0, 1 - (st.rest - REST_S) / SHRINK_S) : 1);
        const [x, y, z] = st.axis, c = Math.cos(st.ang), sn = Math.sin(st.ang), t = 1 - c;
        st.mat.set([
          (t * x * x + c) * s, (t * x * y + sn * z) * s, (t * x * z - sn * y) * s, 0,
          (t * x * y - sn * z) * s, (t * y * y + c) * s, (t * y * z + sn * x) * s, 0,
          (t * x * z + sn * y) * s, (t * y * z - sn * x) * s, (t * z * z + c) * s, 0,
          st.p[0], st.p[1], st.p[2], 1]);
        r.drawMesh(meshes[st.shape], st.mat);
      }
      return true;
    },
    shift(o) {
      for (const st of stones) { st.p[0] += o[0]; st.p[1] += o[1]; st.p[2] += o[2]; st.floor += o[1]; }
    },
    free,
    clear() { free(); stones.length = 0; },
  };
}
