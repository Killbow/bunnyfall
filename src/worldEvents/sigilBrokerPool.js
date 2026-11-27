// @ts-check
import { bossFrame } from '../world/gateBoss.js';
import { IDLE_ANIMS, IDLE_ANIM_SPEED } from '../characters/mobileUnit.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { mobileBillboardSize } from '../world/rmbFlats.js';
import { RAY_DISTANCE, STATIC_NPC_ACTIVATION_DISTANCE, presentNpcInfoText } from '../player/activate.js';
import { trs } from '../world/mat4.js';
import { CAPSULE_RADIUS, CAPSULE_HEIGHT } from '../player/motor.js';
import { riteLocalOf, riteWindow, cageStands, RITE_GRACE_MS } from '../net/gateRite.js';
import { gateSpotLocal } from '../net/gateLaw.js';
import {
  buildCageModel, buildCageDoor, cageHinge, CAGE_WALLS, CAGE_DOOR_WALL, CAGE_W, CAGE_D, CAGE_H, CAGE_CAP, CAGE_FOOT, CAGE_FOOT_UNDER, CAGE_POST,
  CAGE_SILL, CAGE_SILL_OVER, CAGE_SILL_MAX, CAGE_LEAF_W, CAGE_WALL_OUT, CAGE_DOOR_OPEN, CAGE_DOOR_MS,
} from '../world/cageModel.js';
import { gateArt, GATE_ARCHIVE } from '../world/gateArt.js';

export const BROKER_MOBILE = 29;
// `CAGE_R` keeps the cage outside the rite braziers (`RITE_BRAZIER_R`, 8.5 m) and inside the rock clearing
// (`RITE_CLEAR_M`, 20 m), measured from the circle center.
export const CAGE_R = 11.5;
export const CAGE_TURN = -Math.PI / 3;
export const BROKER_REACH = STATIC_NPC_ACTIVATION_DISTANCE;
export const BROKER_NOTICE_M = 12;
export const BROKER_TURN_RATE = 2.4;
export const BROKER_TEXT = Object.freeze({
  name: 'Sigil Broker',
  trade: 'Trades in Deadlands Embers',
  caged: 'Caged by Dagon\'s Faithful',
  get info() { return presentNpcInfoText('the Sigil Broker'); },
  steal: 'The Broker\'s eyes never leave her embers.',
  held: 'Kill all of Dagon\'s Faithful to free her.',
  lost: 'She stays caged tonight.',
  freed: 'The Sigil Broker is free.',
  gone: 'The Sigil Broker leaves for the night.',
});
export const BROKER_FREED_SAY_M = 60;
export const BROKER_SHUT_SEEN_MS = 3000;
export const BROKER_CAGE_BUCKET = 'cage:broker';
export const BROKER_DOOR_BUCKET = 'cage:door';
// The pick box is the cage's oriented box, just outside its walls, so the ray hits it before any bar. An
// axis-aligned box would enclose the camera of a player standing at the bars.
export const BROKER_BOX_HX = CAGE_W / 2 + CAGE_WALL_OUT + 0.05;
export const BROKER_BOX_HZ = CAGE_D / 2 + CAGE_WALL_OUT + 0.05;
export const BROKER_BOX_H = CAGE_H + CAGE_CAP + 0.06;
export const BROKER_GROUND_EVERY = 15;
const NONE = Object.freeze([]);
export const BROKER_BUCKET = 'set7:broker';
export const BROKER_BODY_R = 0.3;
export const BROKER_BODY_H = 1.9;
export const BROKER_POST = Object.freeze((() => {
  const r = BROKER_BODY_R, h = BROKER_BODY_H;
  const positions = new Float32Array([-r, 0, -r, r, 0, -r, r, 0, r, -r, 0, r, -r, h, -r, r, h, -r, r, h, r, -r, h, r]);
  const indices = new Uint16Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  return { positions, indices };
})());

export function cageSpotLocal(day) {
  const [e, n] = riteLocalOf(day), [gx, gz] = gateSpotLocal(day);
  const facing = Math.atan2(gx - e, gz - n), a = facing + CAGE_TURN;
  return { x: e + Math.sin(a) * CAGE_R, z: n + Math.cos(a) * CAGE_R, facing };
}

/**
 * @param {{day: number, px: number, py: number}|null} site
 * @param {number} nowMs
 * @param {(px: number, py: number) => number[]} pixelTranslation
 * @param {(x: number, z: number) => number} heightAt
 */
export function brokerPlace(site, nowMs, pixelTranslation, heightAt) {
  if (!site || !Number.isSafeInteger(site.day) || !cageStands(site.day, nowMs)) return null;
  const sp = cageSpotLocal(site.day), t = pixelTranslation(site.px, site.py);
  const x = t[0] + sp.x, z = t[2] + sp.z, h = heightAt(x, z);
  return Number.isFinite(h) ? { day: site.day, px: site.px, py: site.py, feet: [x, h, z], rest: sp.facing } : null;
}

export function cageTraps(at, rest, f) {
  if (!at || !f) return false;
  const c = Math.cos(rest), s = Math.sin(rest), dx = f[0] - at[0], dz = f[2] - at[2];
  const lx = c * dx - s * dz, lz = s * dx + c * dz, reach = CAGE_WALL_OUT + CAPSULE_RADIUS;
  return Math.abs(lx) < CAGE_W / 2 + reach && Math.abs(lz) < CAGE_D / 2 + reach && f[1] < at[1] + CAGE_H && f[1] + CAPSULE_HEIGHT > at[1] - CAGE_FOOT;
}

// The post is narrower than the player capsule, so its four walls push a capsule centered on it equally and trap
// the player. The post is not added while a body overlaps it.
export function postTraps(at, f) {
  if (!at || !f) return false;
  const reach = BROKER_BODY_R + CAPSULE_RADIUS;
  return Math.abs(f[0] - at[0]) < reach && Math.abs(f[2] - at[2]) < reach && f[1] < at[1] + BROKER_BODY_H && f[1] + CAPSULE_HEIGHT > at[1];
}

export function brokerFacing(at, rest, feet) {
  if (!feet) return rest;
  const dx = feet[0] - at[0], dz = feet[2] - at[2];
  const d = Math.hypot(dx, dz);
  return d > 1e-6 && d <= BROKER_NOTICE_M ? Math.atan2(dx, dz) : rest;
}

export function turnToward(yaw, want, dt, rate = BROKER_TURN_RATE) {
  let d = (want - yaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  const step = rate * Math.max(0, dt);
  return Math.abs(d) <= step ? want : yaw + Math.sign(d) * step;
}

/** @param {{ renderer?: any, getTexture?: ((archive: number) => Promise<any>)|null, uploadRecordFrame?: ((archive: number, record: number, frame: number) => void)|null, site: () => ({day: number, px: number, py: number}|null), pixelTranslation: (px: number, py: number, out?: number[]) => number[], heightAt: (x: number, z: number) => number, now?: () => number, freed?: (day: number, px: number, py: number) => boolean, freedAt?: (day: number, px: number, py: number) => number, feet?: () => (number[]|null), cam?: () => (number[]|null), say?: (text: string) => void, open?: () => void, gone?: () => boolean, collider?: () => any, }} deps */
export function createSigilBroker({
  renderer = null, getTexture = null, uploadRecordFrame = null, site, pixelTranslation, heightAt, now = () => Date.now(), freed = () => false, freedAt = () => NaN,
  feet = () => null, cam = () => null, say = () => {}, open = () => {}, gone = () => false, collider = () => null,
}) {
  let at = null, spot = null, spotDay = null;
  const T3 = [0, 0, 0];
  let groundY = NaN, groundAt = [NaN, NaN, NaN, NaN], frameN = 0;
  let postAt = null;
  let doorOpen = false, openedAt = -Infinity, shutSince = null, cageDay = null;
  let cageAt = null, cageMat = null, doorUp = false;
  let cageMesh = null, doorMesh = null, meshTried = false, artUp = false;
  let shapeAt = null, foot = CAGE_FOOT, sill = CAGE_SILL, meshFoot = NaN, meshSill = NaN;
  let drawnAt = null, drawMat = null, doorAngle = NaN, doorMat = null;
  let yaw = null;
  let body = null, loading = null;
  let batch = null;
  let box = null;
  const boxAt = [NaN, NaN, NaN, NaN, NaN];
  const _batches = [];
  const act = /** @type {any} */ ({ act: 'idle', anims: IDLE_ANIMS, frame: 0, loop: true });
  const frameKeys = new Map();
  const keysOf = (archive, record, frame) => {
    const k = record * 256 + frame;
    let e = frameKeys.get(k);
    if (!e) { const rkey = `${record}#${frame}`; e = { rkey, texKey: `${archive}_${rkey}` }; frameKeys.set(k, e); }
    return e;
  };

  // A texture that fails to parse is still cached with a header and no records, and `getFrameCount` then throws, so
  // this check returns false instead.
  const readable = (tex) => {
    try { return !!tex && IDLE_ANIMS.every((a) => tex.getFrameCount(a.record) > 0); } catch { return false; }
  };
  function loadBody() {
    if (body || loading || !getTexture || !uploadRecordFrame || !renderer?.createBillboardBatch) return;
    const archive = ENEMY_BASICS[BROKER_MOBILE]?.maleTexture;
    if (!archive) return;
    loading = Promise.resolve().then(() => getTexture(archive)).then((tex) => {
      body = readable(tex) ? { tex, archive } : { failed: true };
      if (body.failed) console.warn(`[broker] her sprite (archive ${archive}) would not load`);
    }, (e) => { body = { failed: true }; console.warn('[broker] her sprite', e?.message ?? e); });
  }
  function drawBody() {
    if (!at || !body?.tex) return false;
    const eye = cam() ?? at.feet;
    act.frame = Math.floor((now() / 1000) * IDLE_ANIM_SPEED);
    const fr = bossFrame(act, yaw ?? at.rest, at.feet, eye, (rec) => body.tex.getFrameCount?.(rec) ?? 1);
    const { rkey, texKey } = keysOf(body.archive, fr.record, fr.frame);
    if (!renderer.textures?.has?.(texKey)) uploadRecordFrame(body.archive, fr.record, fr.frame);
    // `mobileBillboardSize` returns a shared cached object, so copy its fields and never write to it.
    const sz = mobileBillboardSize(body.tex, fr.record);
    if (!batch) {
      batch = renderer.createBillboardBatch(body.archive, rkey, { w: sz.w, h: sz.h }, [[0, 0, 0]]);
      batch.origin = [0, 0, 0];
      batch.size = { w: sz.w, h: sz.h };
    }
    batch.record = rkey;
    batch.size.w = fr.flip ? -sz.w : sz.w; batch.size.h = sz.h;
    if (batch.bounds) batch.bounds[3] = Math.hypot(sz.w, sz.h) * 0.5;
    batch.origin[0] = at.feet[0]; batch.origin[1] = at.feet[1]; batch.origin[2] = at.feet[2];
    return true;
  }
  function standPost() {
    const col = collider();
    if (!col?.addMesh) return;
    const f = at?.feet ?? null;
    if (postAt && f && postAt[0] === f[0] && postAt[1] === f[1] && postAt[2] === f[2]) return;
    if (postAt) { col.removeBucket?.(BROKER_BUCKET); postAt = null; }
    if (!f || postTraps(f, feet())) return;
    col.addMesh(BROKER_BUCKET, BROKER_POST.positions, BROKER_POST.indices, trs(f[0], f[1], f[2], 0, 0, 0));
    postAt = [f[0], f[1], f[2]];
  }
  function standCage() {
    const col = collider();
    if (!col?.addMesh) return;
    const f = at?.feet ?? null;
    if (!(cageAt && f && cageAt[0] === f[0] && cageAt[1] === f[1] && cageAt[2] === f[2] && cageAt[3] === at.rest)) {
      if (cageAt) { col.removeBucket?.(BROKER_CAGE_BUCKET); cageAt = null; }
      if (doorUp) { col.removeBucket?.(BROKER_DOOR_BUCKET); doorUp = false; }
      if (!f || cageTraps(f, at.rest, feet())) return;
      cageMat = trs(f[0], f[1], f[2], 0, (at.rest * 180) / Math.PI, 0);
      col.addMesh(BROKER_CAGE_BUCKET, CAGE_WALLS.positions, CAGE_WALLS.indices, cageMat);
      cageAt = [f[0], f[1], f[2], at.rest];
    }
    if (!doorOpen && !doorUp) { col.addMesh(BROKER_DOOR_BUCKET, CAGE_DOOR_WALL.positions, CAGE_DOOR_WALL.indices, cageMat); doorUp = true; }
    else if (doorOpen && doorUp) { col.removeBucket?.(BROKER_DOOR_BUCKET); doorUp = false; }
  }
  function tendCage(t) {
    if (cageDay !== at.day) { cageDay = at.day; doorOpen = false; openedAt = -Infinity; shutSince = null; }
    if (doorOpen) return;
    if (!freed(at.day, at.px, at.py)) { shutSince ??= t; return; }
    doorOpen = true;
    // A cage freed before this page first saw it shut, or seen shut for less than `BROKER_SHUT_SEEN_MS`, opens with
    // no swing and no message.
    const when = freedAt(at.day, at.px, at.py);
    const saw = shutSince != null && t - shutSince >= BROKER_SHUT_SEEN_MS && !(when < shutSince);
    openedAt = saw ? t : -Infinity;
    const f = feet();
    if (saw && f && Math.hypot(f[0] - at.feet[0], f[2] - at.feet[2]) <= BROKER_FREED_SAY_M) say(BROKER_TEXT.freed);
  }
  function swing(t) {
    if (!doorOpen) return 0;
    // If the shared clock steps back mid-swing, the door snaps fully open rather than closing.
    if (t < openedAt) openedAt = -Infinity;
    const k = Math.min(1, (t - openedAt) / CAGE_DOOR_MS);
    return k > 0 ? CAGE_DOOR_OPEN * k * k * (3 - 2 * k) : 0;
  }
  function ensureCageMesh() {
    if (!renderer?.createMesh) return;
    if (meshTried && foot === meshFoot && sill === meshSill) return;
    meshTried = true; meshFoot = foot; meshSill = sill;
    try {
      if (!artUp) { for (const [rec, art] of gateArt()) { renderer.uploadTexture?.(GATE_ARCHIVE, rec, art.albedo); renderer.uploadEmissionTexture?.(GATE_ARCHIVE, rec, art.emission, { white: true }); } artUp = true; }
      const nextCage = renderer.createMesh(buildCageModel({ foot })), nextDoor = renderer.createMesh(buildCageDoor({ sill }));
      if (cageMesh) renderer.destroyMesh?.(cageMesh);
      if (doorMesh) renderer.destroyMesh?.(doorMesh);
      cageMesh = nextCage; doorMesh = nextDoor;
    } catch (e) { console.warn('[broker] her cage would not build', e?.message ?? e); }
  }
  function shapeOf() {
    if (shapeAt === at) return;
    shapeAt = at;
    const c = Math.cos(at.rest), s = Math.sin(at.rest), f = at.feet;
    const rise = (lx, lz) => { const h = heightAt(f[0] + c * lx + s * lz, f[2] - s * lx + c * lz); return Number.isFinite(h) ? h - f[1] : 0; };
    const hx = CAGE_W / 2 + CAGE_POST / 2, hz = CAGE_D / 2 + CAGE_POST / 2;
    const low = Math.min(rise(-hx, -hz), rise(hx, -hz), rise(hx, hz), rise(-hx, hz));
    const [jx, jz] = cageHinge();
    let high = -Infinity;
    for (let i = 0; i <= 4; i++) {
      const a = (CAGE_DOOR_OPEN * i) / 4, ca = Math.cos(a), sa = Math.sin(a);
      for (const u of [CAGE_LEAF_W / 3, (2 * CAGE_LEAF_W) / 3, CAGE_LEAF_W]) high = Math.max(high, rise(jx + ca * u, jz - sa * u));
    }
    foot = Math.round(Math.max(CAGE_FOOT, CAGE_FOOT_UNDER - low) * 100) / 100;
    sill = Math.round(Math.min(CAGE_SILL_MAX, Math.max(CAGE_SILL, high + CAGE_SILL_OVER)) * 100) / 100;
  }
  function cageMatrices(t) {
    if (drawnAt !== at) {
      drawnAt = at; doorAngle = NaN;
      drawMat = trs(at.feet[0], at.feet[1], at.feet[2], 0, (at.rest * 180) / Math.PI, 0);
    }
    const a = swing(t);
    if (a !== doorAngle) {
      doorAngle = a;
      const [hx, hz] = cageHinge(), c = Math.cos(at.rest), s = Math.sin(at.rest);
      doorMat = trs(at.feet[0] + c * hx + s * hz, at.feet[1], at.feet[2] - s * hx + c * hz, 0, ((at.rest + a) * 180) / Math.PI, 0);
    }
  }
  const keyOf = () => (at ? `broker:${at.day}` : null);
  const ours = (key) => typeof key === 'string' && key.startsWith('broker:') && key === keyOf();

  return {
    // A frame with no ground height, such as during a terrain rebuild, hides the broker without calling `gone`.
    // Only leaving her hours or a new day closes an open window.
    frame(dt = 0) {
      const was = at, t = now();
      frameN++;
      const s = site?.() ?? null;
      const due = !!s && Number.isSafeInteger(s.day) && cageStands(s.day, t);
      if (!due) at = null;
      else {
        if (spotDay !== s.day) { spot = cageSpotLocal(s.day); spotDay = s.day; }
        const tr = pixelTranslation(s.px, s.py, T3), x = tr[0] + spot.x, z = tr[2] + spot.z;
        if (x !== groundAt[0] || z !== groundAt[1] || s.day !== groundAt[2] || !Number.isFinite(groundY) || frameN - groundAt[3] >= BROKER_GROUND_EVERY) {
          groundY = heightAt(x, z); groundAt[0] = x; groundAt[1] = z; groundAt[2] = s.day; groundAt[3] = frameN;
        }
        const h = groundY;
        if (!Number.isFinite(h)) at = null;
        else if (!at || at.day !== s.day || at.px !== s.px || at.py !== s.py || at.feet[0] !== x || at.feet[1] !== h || at.feet[2] !== z || at.rest !== spot.facing) {
          at = { day: s.day, px: s.px, py: s.py, feet: [x, h, z], rest: spot.facing };
        }
      }
      if (at) tendCage(t);
      standPost();
      standCage();
      if (was && (!due || s.day !== was.day) && gone()) say(BROKER_TEXT.gone);
      if (!at) { yaw = null; return null; }
      shapeOf();
      loadBody();
      ensureCageMesh();
      cageMatrices(t);
      yaw = turnToward(yaw ?? at.rest, brokerFacing(at.feet, at.rest, feet()), dt);
      drawBody();
      return at;
    },
    batches() {
      _batches.length = 0;
      if (at && batch && body?.tex) _batches.push(batch);
      return _batches;
    },
    draw(r = renderer) {
      if (!at || !cageMesh || !drawMat || !r?.drawMesh) return 0;
      r.drawMesh(cageMesh, drawMat, null);
      if (doorMesh && doorMat) { r.drawMesh(doorMesh, doorMat, null); return 2; }
      return 1;
    },
    targets() {
      if (!at) return NONE;
      const f = at.feet;
      if (!box || boxAt[0] !== f[0] || boxAt[1] !== f[1] || boxAt[2] !== f[2] || boxAt[3] !== at.day || boxAt[4] !== at.rest) {
        boxAt[0] = f[0]; boxAt[1] = f[1]; boxAt[2] = f[2]; boxAt[3] = at.day; boxAt[4] = at.rest;
        const c = Math.abs(Math.cos(at.rest)), sn = Math.abs(Math.sin(at.rest));
        const hw = BROKER_BOX_HX * c + BROKER_BOX_HZ * sn, hd = BROKER_BOX_HX * sn + BROKER_BOX_HZ * c;
        box = [{
          key: `broker:${at.day}`, aabb: { min: [f[0] - hw, f[1], f[2] - hd], max: [f[0] + hw, f[1] + BROKER_BOX_H, f[2] + hd] },
          obb: { m: trs(f[0], f[1], f[2], 0, (at.rest * 180) / Math.PI, 0), box: [-BROKER_BOX_HX, 0, -BROKER_BOX_HZ, BROKER_BOX_HX, BROKER_BOX_H, BROKER_BOX_HZ] },
          distance: RAY_DISTANCE, reach: BROKER_REACH, noSurface: false,
        }];
      }
      return box;
    },
    hoverName(key) { return ours(key) ? { title: BROKER_TEXT.name, subs: [doorOpen ? BROKER_TEXT.trade : BROKER_TEXT.caged] } : null; },
    activate(key, mode = 'grab') {
      if (!ours(key)) return false;
      if (mode === 'info') say(BROKER_TEXT.info);
      else if (mode === 'steal') say(BROKER_TEXT.steal);
      // The relay still accepts the last kill up to `RITE_GRACE_MS` after the rite window ends, so the held message
      // applies until then.
      else if (!doorOpen) say(now() < riteWindow(at.day).to + RITE_GRACE_MS ? BROKER_TEXT.held : BROKER_TEXT.lost);
      else open();
      return true;
    },
    stands: () => !!at && doorOpen,
    caged: () => !!at && !doorOpen,
    state: () => ({ at, yaw, body: body ? (body.tex ? 'loaded' : 'failed') : (loading ? 'loading' : null), batch: !!batch, post: postAt !== null, caged: !!at && !doorOpen, door: doorOpen ? swing(now()) : 0, cage: cageAt !== null, doorUp, mesh: !!cageMesh, foot, sill, matrices: { cage: drawMat, door: doorMat } }),
    destroyAll() {
      const col = collider();
      col?.removeBucket?.(BROKER_BUCKET);
      col?.removeBucket?.(BROKER_CAGE_BUCKET);
      col?.removeBucket?.(BROKER_DOOR_BUCKET);
      postAt = null; cageAt = null; doorUp = false; at = null; yaw = null;
    },
  };
}
