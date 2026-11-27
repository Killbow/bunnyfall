// Draws Morrowind spell effects when Morrowind data is attached: casting effects, bolts, hits, and area bursts.
// Actor effects sit unturned at the feet, and an area burst is scaled to twice the area.

import { fpArm, mwSpellPlan, loadMwEffectMesh, loadMwEffectTextures } from '../combat/fpArm.js';
import { createVfx, vfxCapacity, vfxTextures } from '../formats/mwVfx.js';
import { boltAttitude, boltSpin, areaVisualScale, actorFxTransform } from '../formats/mwSpellFx.js';
import { MW_UNITS_PER_METER } from '../formats/mwFirstPerson.js';
import { createVfxGpu } from '../render/vfxGpu.js';
import { getPref } from '../ui/uiPrefs.js';

const U = 1 / MW_UNITS_PER_METER;
// Morrowind world to pass space under the mirrored third-person scale: (x, y, z) -> (-u x, u z, -u y).
export const MW_TO_PASS = Object.freeze({ a: Float32Array.from([-U, 0, 0, 0, 0, U, 0, -U, 0]), t: Object.freeze([0, 0, 0]) });
export const passToMw = (p) => [-p[0] / U, -p[2] / U, p[1] / U];
export const passDirToMw = (d) => [-d[0], -d[2], d[1]];

const translate = (t, k = 1) => ({ a: Float32Array.from([k, 0, 0, 0, k, 0, 0, 0, k]), t });
const compose = (a3, t) => ({ a: a3, t });
const mul3 = (a, b) => {
  const o = new Float32Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
};

function eyeOf(renderer) {
  const v = renderer?._view; const p = renderer?._camPos;
  if (!v || !p) return null;
  return { position: [p[0], p[1], p[2]], look: [-v[2], -v[6], -v[10]], up: [v[1], v[5], v[9]] };
}

export function createMwMagicFx({
  renderer,
  catalog = () => fpArm.mwMagicCatalog?.() ?? null,
  enabled = () => getPref('mwSpellEffects') !== false,
  hands = (sp) => fpArm.castHands?.(sp),
} = {}) {
  const live = [];
  const assets = new Map();
  const plans = new WeakMap();
  let clock = 0;
  let dead = false;
  const drawable = () => !!renderer?.gl;

  function catalogNow() {
    if (dead || !drawable() || !enabled()) return null;
    try { return catalog() ?? null; } catch { return null; }
  }
  function planOf(cat, sp) {
    if (!sp) return null;
    const memo = plans.get(sp);
    if (memo && memo.cat === cat) return memo.plan;
    const plan = mwSpellPlan(cat, sp);
    if (typeof sp === 'object') plans.set(sp, { cat, plan });
    return plan;
  }
  function load(cat, visual) {
    const key = `${cat.gen}|${visual.model}|${visual.texture ?? ''}`;
    let job = assets.get(key);
    if (!job) {
      job = (async () => {
        const desc = await loadMwEffectMesh(cat, visual.model);
        if (!desc) return null;
        const textures = await loadMwEffectTextures(cat, [...vfxTextures(desc), visual.texture]);
        return { desc, textures };
      })().catch(() => null);
      assets.set(key, job);
      job.then((a) => { if (!a) assets.delete(key); });
    }
    return job;
  }

  function spawn(visual, place, { loop = false, alpha = 1 } = {}) {
    const cat = catalogNow();
    let state = cat && visual ? 'pending' : 'failed';
    const handle = { state: () => state, end() { if (state === 'pending' || state === 'live') state = 'ended'; } };
    if (state === 'failed') return handle;
    load(cat, visual).then((a) => {
      if (state !== 'pending') return;
      if (!a || dead) { state = 'failed'; return; }
      state = 'live';
      live.push({ visual, fx: createVfx(a.desc, { textureOverride: visual.texture, loop }), place, gpu: createVfxGpu(renderer, a.textures, vfxCapacity(a.desc)), handle, alpha });
    });
    return handle;
  }
  function atActor(visual, feet, body = null, alpha = 1) {
    if (!visual || !Array.isArray(feet)) return null;
    const p = passToMw(feet);
    let place = translate(p);
    if (body) {
      const { scale, offset } = actorFxTransform(body.height, body.radius, MW_UNITS_PER_METER);
      place = translate([p[0], p[1], p[2] + offset], scale);
    }
    return spawn(visual, () => place, { alpha });
  }

  return {
    prepare(sp) {
      const cat = catalogNow();
      const plan = cat ? planOf(cat, sp) : null;
      if (!plan) return;
      for (const v of [...plan.cast, plan.bolt, ...plan.hit, ...plan.area]) if (v) load(cat, v);
    },
    cast(sp, feet, { player = false, body = null, alpha = 1 } = {}) {
      const cat = catalogNow();
      const plan = cat ? planOf(cat, sp) : null;
      if (!plan) return 0;
      for (const v of plan.cast) atActor(v, feet, body, alpha);
      if (player) hands(sp);
      return plan.cast.length;
    },
    bolt(sp, { alpha = 1 } = {}) {
      const cat = catalogNow();
      const plan = cat ? planOf(cat, sp) : null;
      const where = { pos: null, dir: [0, 0, -1] };
      if (!plan?.bolt) return { state: () => 'failed', at() {}, end() {} };
      const h = spawn(plan.bolt, () => {
        if (!where.pos) return null;
        const r = mul3(boltAttitude(passDirToMw(where.dir)), boltSpin(clock));
        return compose(r, passToMw(where.pos));
      }, { loop: true, alpha });
      return {
        state: h.state,
        at(pos, dir) { where.pos = [pos[0], pos[1], pos[2]]; if (dir) where.dir = [dir[0], dir[1], dir[2]]; },
        end: h.end,
      };
    },
    hit(sp, feet, { body = null } = {}) {
      const cat = catalogNow();
      const plan = cat ? planOf(cat, sp) : null;
      if (!plan) return 0;
      for (const v of plan.hit) atActor(v, feet, body);
      return plan.hit.length;
    },
    area(sp, at, radius) {
      const cat = catalogNow();
      const plan = cat ? planOf(cat, sp) : null;
      if (!plan || !Array.isArray(at)) return 0;
      const place = translate(passToMw(at), areaVisualScale(radius, MW_UNITS_PER_METER));
      for (const v of plan.area) spawn(v, () => place);
      return plan.area.length;
    },
    update(dt) {
      if (dead) return;
      clock += dt;
      if (!enabled()) { this.clear(); return; }
      if (!live.length) return;
      const eye = eyeOf(renderer);
      for (let i = live.length - 1; i >= 0; i--) {
        const e = live[i];
        const place = e.handle.state() === 'live' ? e.place() : null;
        const r = place ? e.fx.update(dt, { place, view: MW_TO_PASS, eye }) : { done: true };
        if (r.done) { e.handle.end(); e.gpu.release(); live.splice(i, 1); continue; }
        e.gpu.sync(r.streams, e.alpha);
      }
    },
    draw() {
      if (dead || !live.length || !drawable() || !renderer._proj || !renderer._view) return false;
      const list = live.flatMap((e) => e.gpu.effects()).filter((g) => !g.hidden && g.count);
      if (!list.length) return false;
      renderer.drawWorldParticleEffects(list);
      return true;
    },
    clear() {
      for (const e of live) { e.handle.end(); e.gpu.release(); }
      live.length = 0;
    },
    destroy() { this.clear(); dead = true; },
    count: () => live.length,
  };
}
