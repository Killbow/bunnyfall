// @ts-check
import { ketchVoyageAt, KT_SIGHT_MS } from '../../net/ketch/ketchLaw.js';
import { KT_ANCHOR_LIFT, deckToDungeon } from '../../net/ketch/ketchDeck.js';
import { buildKetchShip, buildKetchAnchorLift, KT_STATION, KT_SKY_CHAIN, KT_GROUND, KT_LIFT_CROWN } from '../../world/ketch/ketchModel.js';
import { packKetchHit } from '../../world/ketch/ketchKit.js';
import { ketchArtUp } from './ketchDeckHost.js';
import { t } from '../../ui/textManager.js';

export const KT_SKY = Object.freeze({ centre: 118, approach: 6000, high: 90, turnFrom: 0.955, lower: 40_000, turnWest: 60_000, accel: 0.012, climb: 0.05, bob: 0.6, bobMs: 9000, far: 6500 });
export const KT_BOARD_HOLD_MS = 2500;
export const KT_LIFT_NEAR_M = 14;
export const KT_SKY_BUCKET = 'kt:sky';
export const KT_SKY_TEXT = Object.freeze({
  get near() { return t('ketch.sky.near', 'Stand in the anchor-lift to ride it up.'); },
  rising: (s) => t('ketch.sky.rising', 'The anchor-lift rises in {s}...', { s }),
  get up() { return t('ketch.sky.up', 'The anchor-lift is drawn up.'); },
});

const smooth = (k) => { const u = Math.max(0, Math.min(1, k)); return u * u * (3 - 2 * u); };

/** @param {number} now */
export function ketchSkyPose(now) {
  const v = ketchVoyageAt(now), S = KT_SKY;
  if (v.phase === 'away') return null;
  if (v.phase === 'sighted') {
    const u = Math.max(0, Math.min(1, (now - v.sightAt) / KT_SIGHT_MS)), s = (1 - u) ** 2;
    const bob = S.bob * Math.sin((2 * Math.PI * now) / S.bobMs);
    return { v, phase: v.phase, dx: S.approach * s, dy: S.high * s + bob, dz: 0, yaw: (Math.PI / 2) * (1 - smooth((u - S.turnFrom) / (1 - S.turnFrom))), lift: 0, moving: true };
  }
  if (v.phase === 'docked') return { v, phase: v.phase, dx: 0, dy: 0, dz: 0, yaw: 0, lift: smooth((now - v.at) / S.lower), moving: false };
  const e = now - v.departAt, go = Math.max(0, e - S.lower - S.turnWest) / 1000, dx = -0.5 * S.accel * go * go;
  if (-dx > S.far) return null;
  return { v, phase: v.phase, dx, dy: S.climb * go, dz: 0, yaw: (Math.PI / 2) * smooth((e - S.lower) / S.turnWest), lift: 1 - smooth(e / S.lower), moving: e >= S.lower };
}

export const KT_STATION_MID = Object.freeze({ x: KT_STATION.x, z: KT_STATION.z + KT_SKY.centre });
export const KT_LIFT_AT = Object.freeze({ x: KT_STATION.x + KT_ANCHOR_LIFT.x, z: KT_STATION.z + KT_ANCHOR_LIFT.z });

export function ketchSkyMatrix(out, mid, pose) {
  const O = deckToDungeon(0, 0, 0), c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const ox = O[0], oy = O[1], oz = O[2] + KT_SKY.centre;
  out.fill(0);
  out[0] = c; out[2] = -s; out[5] = 1; out[8] = s; out[10] = c; out[15] = 1;
  out[12] = mid[0] + pose.dx - (c * ox + s * oz);
  out[13] = mid[1] + pose.dy - oy;
  out[14] = mid[2] + pose.dz - (-s * ox + c * oz);
  return out;
}

/** @param {{ renderer?: any, collider?: () => any, city?: () => ([number, number]|null), groundAt?: (x: number, z: number) => number, frameY?: () => number, now: () => number, feet?: () => (number[]|null), say?: (text: string) => void, onBoard?: () => void, mayBoard?: () => boolean, }} deps */
export function createKetchSky({ renderer = null, collider = () => null, city = () => null, groundAt = () => NaN, frameY = () => 0, now, feet = () => null, say = () => {}, onBoard = () => {}, mayBoard = () => true }) {
  let ship = null, lamps = null, lift = null, chain = null, hit = null, built = false;
  let groundLocal = null;
  const M = new Float32Array(16), CAGE = new Float32Array(16), CHAIN = new Float32Array(16);
  let colliderAt = null, standAt = -1, nearSaid = false, lastCount = -1, shown = false;
  // Set after boarding is requested or a body is lowered in the lift, so the body must step out and back in before
  // the lift asks again.
  let needOut = false;
  let place = null;
  function build() {
    if (built || !renderer?.createMesh) return;
    built = true;
    try {
      ketchArtUp(renderer);
      const s = buildKetchShip();
      ship = renderer.createMesh(s.model);
      lamps = renderer.createMesh(s.lamps);
      hit = packKetchHit(s.hit);
      const a = buildKetchAnchorLift();
      lift = renderer.createMesh(a.cage); chain = renderer.createMesh(a.chain);
    } catch (e) { console.warn('[kt] the Ketch would not build in the sky', e?.message ?? e); ship = null; }
  }
  const same = (a, b) => { if (!a || !b) return false; for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-3) return false; return true; };
  function standCollider(want) {
    const col = collider();
    if (!col?.addMesh) return;
    if (want ? same(M, colliderAt) : colliderAt === null) return;
    col.removeBucket?.(KT_SKY_BUCKET);
    colliderAt = null;
    if (!want || !hit) return;
    try { col.addMesh(KT_SKY_BUCKET, hit.positions, hit.indices, M); colliderAt = new Float32Array(M); } catch (e) { console.warn('[kt] her collider', e?.message ?? e); }
  }
  return {
    frame() {
      const t = now(), pose = ketchSkyPose(t), c = pose ? city() : null;
      if (!pose || !c) { place = null; standCollider(false); standAt = -1; shown = false; return null; }
      build();
      const ax = c[0] + KT_LIFT_AT.x, az = c[1] + KT_LIFT_AT.z, fy = frameY();
      if (groundLocal == null) { const g = groundAt(ax, az); if (Number.isFinite(g)) groundLocal = g - fy; }
      const ground = (groundLocal ?? 0) + fy, deck = ground - KT_GROUND.y;
      const mid = [c[0] + KT_STATION_MID.x, deck, c[1] + KT_STATION_MID.z];
      ketchSkyMatrix(M, mid, pose);
      const cageY = ground + (1 - pose.lift) * KT_SKY_CHAIN;
      place = { pose, ground, deck, lift: [ax, cageY, az], let: Math.max(0, deck - (cageY + KT_LIFT_CROWN)), still: !pose.moving && groundLocal != null };
      CAGE.fill(0); CAGE[0] = CAGE[5] = CAGE[10] = CAGE[15] = 1; CAGE[12] = ax; CAGE[13] = cageY; CAGE[14] = az;
      CHAIN.fill(0); CHAIN[0] = CHAIN[10] = CHAIN[15] = 1; CHAIN[5] = place.let; CHAIN[12] = ax; CHAIN[13] = deck; CHAIN[14] = az;
      shown = true;
      standCollider(place.still && pose.phase === 'docked');
      const f = feet();
      const lowered = pose.phase === 'docked' && pose.lift >= 0.999 && groundLocal != null;
      const inLift = !!f && lowered && Math.hypot(f[0] - ax, f[2] - az) <= KT_ANCHOR_LIFT.r - 0.2 && Math.abs(f[1] - cageY) <= 1.6;
      const near = !!f && Math.hypot(f[0] - ax, f[2] - az) <= KT_LIFT_NEAR_M;
      if (near && !nearSaid) { nearSaid = true; say(lowered ? KT_SKY_TEXT.near : KT_SKY_TEXT.up); }
      if (!near) nearSaid = false;
      if (needOut && !inLift) needOut = false;
      if (inLift && !needOut && mayBoard()) {
        if (standAt < 0) { standAt = t; lastCount = -1; }
        const left = Math.ceil((KT_BOARD_HOLD_MS - (t - standAt)) / 1000);
        if (left > 0 && left !== lastCount) { lastCount = left; say(KT_SKY_TEXT.rising(left)); }
        if (t - standAt >= KT_BOARD_HOLD_MS) { standAt = -1; needOut = true; onBoard(); }
      } else standAt = -1;
      return place;
    },
    draw(r = renderer) {
      if (!shown || !ship || !place || !r?.drawMesh) return 0;
      r.drawMesh(ship, M, null, { noShadow: true });
      if (lamps) r.drawMesh(lamps, M, null, { noShadow: true });
      if (place.pose.lift > 0.01 && lift && chain) { r.drawMesh(chain, CHAIN, null, { noShadow: true }); r.drawMesh(lift, CAGE, null, { noShadow: true }); }
      return 1;
    },
    place: () => place,
    hold() { needOut = true; standAt = -1; },
    away() { standCollider(false); standAt = -1; shown = false; },
    destroy() {
      standCollider(false);
      for (const m of [ship, lamps, lift, chain]) if (m) { try { renderer?.destroyMesh?.(m); } catch { } }
      ship = lamps = lift = chain = null; built = false; shown = false;
    },
  };
}
