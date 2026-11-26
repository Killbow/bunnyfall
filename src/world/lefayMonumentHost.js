// @ts-check
import {
  LEFAY_KEY, LEFAY_TEXT, LEFAY_ROWS, LEFAY_ARCHIVE, MONUMENT_BOXES, MONUMENT_STEPS, MONUMENT_FOOT, OBELISK, LEFAY_FLOWERS, FLOWER_SCALE,
  TOSS_MS, TOSS_EVERY_MS, buildLefayModel, tossRest, flowerPlace, tossPoint, normalTribute, layFlower,
} from './lefayMonument.js';
import { lefayArt } from './lefayArt.js';
import { dfLook, lookSeed } from './dfLook.js';
import { wearPainted } from '../systems/studioArt/studioArt.js';
import { RAY_DISTANCE, STATIC_NPC_ACTIVATION_DISTANCE } from '../player/activate.js';
import { CAPSULE_RADIUS, CAPSULE_HEIGHT } from '../player/motor.js';
import { trs } from './mat4.js';

export const LEFAY_GROUND_EVERY = 30;
export const LEFAY_REACH = STATIC_NPC_ACTIVATION_DISTANCE;
export const TOSS_HAND_DROP = 0.35;
const NONE = Object.freeze([]);

// Tests the whole footprint, including the steps, because the step tops are higher than the motor's `STEP_OFFSET`
// and would wall in a body.
export function bodyTrapped(at, f) {
  if (!at || !f) return false;
  return Math.hypot(f[0] - at[0], f[2] - at[2]) < MONUMENT_STEPS[0].r + CAPSULE_RADIUS
    && f[1] < at[1] + OBELISK.apex && f[1] + CAPSULE_HEIGHT > at[1] - MONUMENT_FOOT;
}

/** @param {{ renderer?: any, getTexture?: ((archive: number) => Promise<any>)|null, uploadRecord?: ((archive: number, record: number) => void)|null, billboardSize?: ((tex: any, record: number) => {w: number, h: number})|null, site: () => (number[]|null), groundAt: (x: number, z: number) => number, collider?: () => any, eye?: () => (number[]|null), feet?: () => (number[]|null), tribute?: () => any, keep?: (next: {count: number, laid: number[][]}) => void, say?: (text: string) => void, midText?: (text: string) => void, sound?: () => void, now?: () => number, rand?: () => number, restores?: () => number, }} deps */
export function createLefayMonument({
  renderer = null, getTexture = null, uploadRecord = null, billboardSize = null, site, groundAt, collider = () => null,
  eye = () => null, feet = () => null, tribute = () => null, keep = () => {},
  say = () => {}, midText = () => {}, sound = () => {}, now = () => Date.now(), rand = Math.random, restores = () => 0,
}) {
  let at = null, matrix = null;
  let groundY = NaN, frameN = 0;
  const groundAtXZ = [NaN, NaN, -Infinity, NaN];
  let colAt = null;
  const model = buildLefayModel();
  let mesh = null, meshTried = false;
  let flowers = null, flowerLoad = null;
  /** @type {Map<number, any>} */
  const laidBatches = new Map();
  let laidFrom = null;
  /** @type {Array<{entry: number[], from: number[], to: number[], at: number, batch: any, pos: number[], landed?: boolean, gen: number}>} */
  let tosses = [];
  let lastToss = -Infinity;
  const _batches = [];
  let box = null;

  function loadFlowers() {
    if (flowers || flowerLoad || !getTexture || !renderer?.createBillboardBatch) return;
    const archive = LEFAY_FLOWERS[0][0];
    flowerLoad = Promise.resolve().then(() => getTexture(archive)).then((tex) => {
      try {
        const sizes = LEFAY_FLOWERS.map(([a, r]) => {
          uploadRecord?.(a, r);
          const s = billboardSize ? billboardSize(tex, r) : { w: 0.5, h: 0.5 };
          return { w: s.w * FLOWER_SCALE, h: s.h * FLOWER_SCALE };
        });
        flowers = { tex, sizes };
      } catch (e) { flowers = { failed: true }; console.warn('[lefay] the flowers would not load', e?.message ?? e); }
    }, (e) => { flowers = { failed: true }; console.warn('[lefay] the flowers', e?.message ?? e); });
  }
  const flowerBatch = (kind, centers) => {
    const [a, r] = LEFAY_FLOWERS[kind];
    const b = renderer.createBillboardBatch(a, r, flowers.sizes[kind], centers);
    b.origin = [0, 0, 0];
    return b;
  };
  function tendPile() {
    if (!flowers?.sizes) return;
    const t = tribute();
    const laid = t?.laid ?? NONE;
    if (laidFrom === laid) return;
    laidFrom = laid;
    for (const b of laidBatches.values()) renderer.destroyBillboardBatch?.(b);
    laidBatches.clear();
    const byKind = new Map();
    for (const e of normalTribute(t).laid) {
      if (!byKind.has(e[1])) byKind.set(e[1], []);
      byKind.get(e[1]).push(flowerPlace(e));
    }
    for (const [kind, centers] of byKind) laidBatches.set(kind, flowerBatch(kind, centers));
  }
  // A flower thrown before a save restore lands nowhere, because the pile then belongs to the loaded character.
  function land(f) {
    if (f.landed) return;
    f.landed = true;
    if (f.batch) renderer?.destroyBillboardBatch?.(f.batch);
    f.batch = null;
    if (f.gen === restores()) keep(layFlower(tribute(), f.entry));
  }
  function ensureMesh() {
    if (meshTried || !renderer?.createMesh) return;
    meshTried = true;
    try {
      for (const [rec, art] of lefayArt()) wearPainted(LEFAY_ARCHIVE, rec, () => dfLook(art, lookSeed(LEFAY_ARCHIVE, rec)), (pic, { late }) => { if (late) renderer.releaseTexture?.(LEFAY_ARCHIVE, rec); renderer.uploadTexture?.(LEFAY_ARCHIVE, rec, pic); }, { topDown: true });
      mesh = renderer.createMesh(model);
    } catch (e) { console.warn('[lefay] the monument would not build', e?.message ?? e); }
  }
  function standCollider() {
    const col = collider();
    if (!col?.addMesh) return;
    if (colAt && at && colAt[0] === at[0] && colAt[1] === at[1] && colAt[2] === at[2]) return;
    const moved = colAt !== null;
    if (colAt) { col.removeBucket?.(LEFAY_KEY); colAt = null; }
    // The collider waits while a body is inside the footprint, but only on first placement; holding it back on a
    // move would drop a body standing on the steps.
    if (!at || (!moved && bodyTrapped(at, feet()))) return;
    col.addMesh(LEFAY_KEY, model.positions, model.indices, matrix);
    colAt = [at[0], at[1], at[2]];
  }
  function throwFlower() {
    const t = now();
    if (t - lastToss < TOSS_EVERY_MS) return false;
    lastToss = t;
    const e = eye();
    const b = e ? Math.atan2(e[0] - at[0], e[2] - at[2]) : 0, bearing = Number.isFinite(b) ? b : 0;
    const entry = tossRest(bearing, rand);
    const to = flowerPlace(entry);
    const from = e ? [e[0] - at[0], e[1] - TOSS_HAND_DROP - at[1], e[2] - at[2]] : [to[0] * 1.6, to[1] + 1.5, to[2] * 1.6];
    const f = { entry, from, to, at: t, batch: null, pos: [0, 0, 0], landed: false, gen: restores() };
    if (flowers?.sizes) { f.batch = flowerBatch(entry[1], [[0, 0, 0]]); }
    tosses.push(f);
    sound();
    midText(LEFAY_TEXT.laid);
    return true;
  }
  const ours = (key) => key === LEFAY_KEY && !!at;
  function destroyAll() {
    collider()?.removeBucket?.(LEFAY_KEY);
    colAt = null; at = null; box = null;
    for (const f of tosses) land(f);
    tosses = [];
  }

  return {
    frame() {
      frameN++;
      const s = site?.() ?? null;
      if (!s) {
        groundY = NaN;
        if (at) { at = null; standCollider(); for (const f of tosses) land(f); tosses = []; }
        return null;
      }
      // A vertical recenter changes `comp` without changing x or z, so it must also trigger a ground read.
      const comp = s[2] ?? 0;
      if (s[0] !== groundAtXZ[0] || s[1] !== groundAtXZ[1] || comp !== groundAtXZ[3] || !Number.isFinite(groundY) || frameN - groundAtXZ[2] >= LEFAY_GROUND_EVERY) {
        groundY = groundAt(s[0], s[1]); groundAtXZ[0] = s[0]; groundAtXZ[1] = s[1]; groundAtXZ[2] = frameN; groundAtXZ[3] = comp;
      }
      if (!Number.isFinite(groundY)) { at = null; standCollider(); return null; }
      if (!at || at[0] !== s[0] || at[1] !== groundY || at[2] !== s[1]) {
        at = [s[0], groundY, s[1]];
        matrix = trs(at[0], at[1], at[2], 0, 0, 0);
        box = null;
      }
      standCollider();
      ensureMesh();
      loadFlowers();
      tendPile();
      const t = now();
      let landed = 0;
      for (const f of tosses) {
        const k = (t - f.at) / TOSS_MS;
        if (k >= 1 || t < f.at) { land(f); landed++; continue; }
        tossPoint(f.from, f.to, k, f.pos);
        if (f.batch) { f.batch.origin[0] = at[0] + f.pos[0]; f.batch.origin[1] = at[1] + f.pos[1]; f.batch.origin[2] = at[2] + f.pos[2]; }
      }
      if (landed) { tosses = tosses.filter((f) => !f.landed); tendPile(); }
      // Origins are set after the pile is rebuilt, so a new batch never draws a frame at the scene origin.
      for (const b of laidBatches.values()) { b.origin[0] = at[0]; b.origin[1] = at[1]; b.origin[2] = at[2]; }
      return at;
    },
    draw(r = renderer) {
      if (!at || !mesh || !matrix || !r?.drawMesh) return 0;
      r.drawMesh(mesh, matrix, null);
      return 1;
    },
    batches() {
      _batches.length = 0;
      if (!at) return _batches;
      for (const b of laidBatches.values()) _batches.push(b);
      for (const f of tosses) if (f.batch) _batches.push(f.batch);
      return _batches;
    },
    targets() {
      if (!at) return NONE;
      box ??= MONUMENT_BOXES.map((B) => ({
        key: LEFAY_KEY, aabb: { min: [at[0] + B[0], at[1] + B[1], at[2] + B[2]], max: [at[0] + B[3], at[1] + B[4], at[2] + B[5]] },
        distance: RAY_DISTANCE, reach: LEFAY_REACH, meshCollider: true,
      }));
      return box;
    },
    hoverName(key) {
      if (!ours(key)) return null;
      const n = normalTribute(tribute()).count;
      return { title: LEFAY_TEXT.title, subs: [LEFAY_TEXT.years, LEFAY_TEXT.epithet, ...(n > 0 ? [LEFAY_TEXT.count(n)] : [])], actions: LEFAY_ROWS.map((r) => ({ id: r.id, label: r.label })) };
    },
    activate(key, mode = 'grab', verb = null) {
      if (!ours(key)) return false;
      if (verb === 'read' || (verb == null && mode === 'info')) { for (const line of LEFAY_TEXT.read) say(line); return true; }
      if (verb == null && mode === 'steal') { midText(LEFAY_TEXT.steal); return true; }
      throwFlower();
      return true;
    },
    state: () => ({ at, collider: colAt !== null, mesh: !!mesh, flowers: flowers ? (flowers.sizes ? 'loaded' : 'failed') : (flowerLoad ? 'loading' : null), laid: [...laidBatches.keys()], tosses: tosses.length }),
    destroyAll,
    dispose() {
      destroyAll();
      for (const b of laidBatches.values()) renderer?.destroyBillboardBatch?.(b);
      laidBatches.clear(); laidFrom = null;
      if (mesh) renderer?.destroyMesh?.(mesh);
      mesh = null; meshTried = false;
    },
  };
}
