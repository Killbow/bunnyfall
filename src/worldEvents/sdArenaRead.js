// @ts-check
import { SD_ARENA } from '../net/sdBrain.js';
import { SD_BLOW_BY_ID, SD_BLOWS, SD_BODY, SD_PILLARS, atkWindup, blowShape, sdProfileOf, stompFrontAt, SD_ECHO_PAIR_MS } from '../net/sdRemnant.js';
import { SD_PILLAR_W } from '../net/sdBrain.js';
import { TELEGRAPH_NOW_MS } from '../render/gateTelegraph.js';
import { screenBearing } from './gateCourt.js';
import { SD_ELEMENT_COLOR, SD_ELEMENT_GROUND, sdTint } from './sdRemnantBlows.js';
import { sdEndingOf } from '../net/sdMarks.js';
import { TITLE_HOLD_MS, TITLE_IN_MS, TITLE_OUT_MS } from '../ui/gateTitleCard.js';
import { groundViewModel } from '../ui/gateGroundView.js';

export const SD_PERIL_BEARINGS = 24;
export const SD_PERIL_STEP_M = 0.25;
export const SD_PERIL_REACH_M = 20;
export const SD_PERIL_RIM_M = 1;
export const SD_JUMP_CALL_M = 3;
export const SD_BEAT_LATE_MS = 1500;
export const SD_BEAT_LAST_MS = 60 * 1000;
export const sdBreakSub = (ms) => `Fell Gold and Silver within ${Math.round(ms / 1000)} seconds of each other`;
export const sdWakeText = (mk) => { const E = sdEndingOf(mk); return E ? { ...SD_BEAT_TEXT.wake, sub: `${E.sig}: the Ending of ${E.stone}` } : SD_BEAT_TEXT.wake; };
export const SD_BEAT_TEXT = Object.freeze({
  wake: Object.freeze({ kicker: 'The Shattered Hour', main: 'The Brass Remnant', sub: 'What the Warp kept of the Numidium' }),
  break: Object.freeze({ kicker: 'II', main: 'The Dragon Break', sub: sdBreakSub(SD_ECHO_PAIR_MS) }),
  moment: Object.freeze({ kicker: 'III', main: 'The Last Moment', sub: 'Break its Hearts before the Reset lands' }),
  last: Object.freeze({ kicker: 'The Hour', main: 'Ends in 1 minute', sub: '' }),
  fell: Object.freeze({ kicker: 'The Brass Remnant', main: 'Undone', sub: '' }),
});
export const SD_JUMP_TEXT = (name) => `${name}. Jump!`;

export function sdWayOut(inside, fx, fz) {
  const R = SD_ARENA.r - SD_PERIL_RIM_M;
  let best = null;
  for (let b = 0; b < SD_PERIL_BEARINGS; b++) {
    const a = (b / SD_PERIL_BEARINGS) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    for (let m = SD_PERIL_STEP_M; m <= SD_PERIL_REACH_M && (!best || m < best.m); m += SD_PERIL_STEP_M) {
      const x = fx + dx * m, z = fz + dz * m;
      if (Math.hypot(x, z) > R) break;
      if (!inside(x, z)) { best = { dx, dz, m }; break; }
    }
  }
  return best ? { dir: [best.dx, best.dz], m: best.m } : null;
}

// `handSweepOf` and `handSweepHas` repeat `handSwept` and `behindPillar` from `net/sdRemnant.js` without
// allocating, so a change to either must be made in both places.
const _sweep = { ax: 0, az: 0, yw: 0, sw: 1, len: 0, w2: 0, arc: 0, a0: 0, a1: 0, over: false };
export function handSweepOf(atk, S, t, over = false, out = _sweep) {
  const t0 = Math.max(t, atk.at), t1 = atk.at + S.active;
  out.ax = atk.x; out.az = atk.z; out.yw = atk.yw; out.sw = atk.sw ?? 1; out.len = S.len; out.w2 = S.width / 2; out.arc = S.arc;
  out.a0 = S.arc * Math.max(0, (t0 - atk.at) / S.active); out.a1 = S.arc * Math.min(1, (t1 - atk.at) / S.active); out.over = !!over;
  return out;
}
export function handSweepHas(H, x, z) {
  const dx = x - H.ax, dz = z - H.az, d = Math.sqrt(dx * dx + dz * dz);
  if (d > H.len || !(H.a1 >= H.a0)) return false;
  const half = d > H.w2 ? Math.asin(H.w2 / d) : Math.PI;
  let r = (Math.atan2(dx, dz) - H.yw + Math.PI) % (2 * Math.PI);
  if (r < 0) r += 2 * Math.PI;
  const u = H.sw * (r - Math.PI) + H.arc / 2;
  if (!(u + half >= H.a0 && u - half <= H.a1)) return false;
  if (H.over) return true;
  const w = SD_PILLAR_W / 2;
  for (let i = 0; i < SD_PILLARS.length; i++) {
    const px = SD_PILLARS[i][0], pz = SD_PILLARS[i][1];
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (H.ax < px - w || H.ax > px + w) continue; } else {
      const a = (px - w - H.ax) / dx, b = (px + w - H.ax) / dx;
      t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (H.az < pz - w || H.az > pz + w) continue; } else {
      const a = (pz - w - H.az) / dz, b = (pz + w - H.az) / dz;
      t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
      if (t0 > t1) continue;
    }
    if (t0 < 1) return false;
  }
  return true;
}
const isPlace = (A) => A === SD_BLOWS.stomp || A === SD_BLOWS.hand || A === SD_BLOWS.volley;
function insideAt(A, atk, S, t, over, x, z) {
  if (A === SD_BLOWS.stomp) { const dx = x - atk.x, dz = z - atk.z; return dx * dx + dz * dz <= S.r * S.r; }
  if (A === SD_BLOWS.hand) return handSweepHas(handSweepOf(atk, S, t, over), x, z);
  const tg = atk.tg;
  if (!tg) return false;
  for (let i = 0; i < tg.length; i++) { const dx = x - tg[i][0], dz = z - tg[i][1]; if (dx * dx + dz * dz <= S.r * S.r) return true; }
  return false;
}
function wayOutOf(A, atk, S, t, over, fx, fz) {
  if (A === SD_BLOWS.stomp) return discWay(atk.x, atk.z, S.r, fx, fz);
  if (A === SD_BLOWS.hand) return sweepWay(handSweepOf(atk, S, t, over), fx, fz);
  return marksWay(atk.tg ?? NO_MARKS, S.r, fx, fz);
}
const NO_MARKS = Object.freeze([]);
const PERIL_STEPS = Math.floor(SD_PERIL_REACH_M / SD_PERIL_STEP_M + 1e-9);
const wayOf = (bm, bx, bz) => (bm < Infinity ? { dir: [bx, bz], m: bm } : null);
function discWay(ax, az, r, fx, fz) {
  const R2 = (SD_ARENA.r - SD_PERIL_RIM_M) ** 2, r2 = r * r;
  let bm = Infinity, bx = 0, bz = 0;
  for (let b = 0; b < SD_PERIL_BEARINGS; b++) {
    const a = (b / SD_PERIL_BEARINGS) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    for (let k = 1; k <= PERIL_STEPS; k++) {
      const m = k * SD_PERIL_STEP_M;
      if (m >= bm) break;
      const x = fx + dx * m, z = fz + dz * m;
      if (x * x + z * z > R2) break;
      if ((x - ax) * (x - ax) + (z - az) * (z - az) > r2) { bm = m; bx = dx; bz = dz; break; }
    }
  }
  return wayOf(bm, bx, bz);
}
function marksWay(tg, r, fx, fz) {
  const R2 = (SD_ARENA.r - SD_PERIL_RIM_M) ** 2, r2 = r * r;
  let bm = Infinity, bx = 0, bz = 0;
  for (let b = 0; b < SD_PERIL_BEARINGS; b++) {
    const a = (b / SD_PERIL_BEARINGS) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    for (let k = 1; k <= PERIL_STEPS; k++) {
      const m = k * SD_PERIL_STEP_M;
      if (m >= bm) break;
      const x = fx + dx * m, z = fz + dz * m;
      if (x * x + z * z > R2) break;
      let inside = false;
      for (let i = 0; i < tg.length && !inside; i++) inside = (x - tg[i][0]) * (x - tg[i][0]) + (z - tg[i][1]) * (z - tg[i][1]) <= r2;
      if (!inside) { bm = m; bx = dx; bz = dz; break; }
    }
  }
  return wayOf(bm, bx, bz);
}
// This repeats the `handSweepHas` test inside the walk and must give the same result as `sdWayOut` over
// `handSweepHas`.
function sweepWay(H, fx, fz) {
  const R2 = (SD_ARENA.r - SD_PERIL_RIM_M) ** 2, w = SD_PILLAR_W / 2, ax = H.ax, az = H.az;
  if (!(H.a1 >= H.a0)) return null;
  let bm = Infinity, bx = 0, bz = 0;
  for (let b = 0; b < SD_PERIL_BEARINGS; b++) {
    const a = (b / SD_PERIL_BEARINGS) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
    for (let k = 1; k <= PERIL_STEPS; k++) {
      const m = k * SD_PERIL_STEP_M;
      if (m >= bm) break;
      const x = fx + sx * m, z = fz + sz * m;
      if (x * x + z * z > R2) break;
      const dx = x - ax, dz = z - az, d = Math.sqrt(dx * dx + dz * dz);
      let inside = d <= H.len;
      if (inside) {
        const half = d > H.w2 ? Math.asin(H.w2 / d) : Math.PI;
        let r = (Math.atan2(dx, dz) - H.yw + Math.PI) % (2 * Math.PI);
        if (r < 0) r += 2 * Math.PI;
        const u = H.sw * (r - Math.PI) + H.arc / 2;
        inside = u + half >= H.a0 && u - half <= H.a1;
      }
      if (inside && !H.over) {
        for (let i = 0; i < SD_PILLARS.length && inside; i++) {
          const px = SD_PILLARS[i][0], pz = SD_PILLARS[i][1];
          let t0 = 0, t1 = 1, cut = true;
          if (Math.abs(dx) < 1e-9) { if (ax < px - w || ax > px + w) cut = false; } else {
            const p = (px - w - ax) / dx, q = (px + w - ax) / dx;
            t0 = Math.max(t0, Math.min(p, q)); t1 = Math.min(t1, Math.max(p, q));
            if (t0 > t1) cut = false;
          }
          if (cut) {
            if (Math.abs(dz) < 1e-9) { if (az < pz - w || az > pz + w) cut = false; } else {
              const p = (pz - w - az) / dz, q = (pz + w - az) / dz;
              t0 = Math.max(t0, Math.min(p, q)); t1 = Math.min(t1, Math.max(p, q));
              if (t0 > t1) cut = false;
            }
          }
          if (cut && t0 < 1) inside = false;
        }
      }
      if (!inside) { bm = m; bx = sx; bz = sz; break; }
    }
  }
  return wayOf(bm, bx, bz);
}

export function sdPerilAt(s, t, fx, fz, yaw = null, over = false) {
  if (!s || !(s.fi > 0) || s.fell || s.lost || s.ended > 0 || !Number.isFinite(fx) || !Number.isFinite(fz)) return null;
  let bestAtk = null, bestA = null, bestW = 0, jumpAtk = null;
  const ec = s.ec, n = ec ? ec.length : 0;
  for (let i = -1; i < n; i++) {
    const atk = i < 0 ? s.rem?.atk : ec[i].h > 0 ? ec[i].atk : null;
    if (!atk) continue;
    const A = SD_BLOW_BY_ID[atk.a];
    if (!A || !Number.isFinite(atk.at)) continue;
    const S = blowShape(atk) ?? A, w = atkWindup(atk, A, s.ph, i < 0 ? SD_BODY.remnant : SD_BODY.gold + i), end = atk.at + Math.max(S.active, 0);
    if (A === SD_BLOWS.stomp && t >= atk.at && t <= end) {
      const ddx = fx - atk.x, ddz = fz - atk.z, d = Math.sqrt(ddx * ddx + ddz * ddz), front = stompFrontAt(atk, t);
      if (d > front && d - front <= SD_JUMP_CALL_M && (!jumpAtk || atk.at < jumpAtk.at)) jumpAtk = atk;
      continue;
    }
    const live = A === SD_BLOWS.hand ? t < end : t < atk.at;
    if (!live || t < atk.at - w || (bestAtk && bestAtk.at <= atk.at) || !isPlace(A) || !insideAt(A, atk, S, t, over, fx, fz)) continue;
    bestAtk = atk; bestA = A; bestW = w;
  }
  if (bestAtk && bestA) {
    const S = blowShape(bestAtk) ?? bestA, way = Number.isFinite(yaw) ? wayOutOf(bestA, bestAtk, S, t, over, fx, fz) : null;
    const tt = bestW > 0 ? Math.max(0, Math.min(1, (t - (bestAtk.at - bestW)) / bestW)) : 1;
    return { name: bestA.name, t: tt, now: bestAtk.at - t <= TELEGRAPH_NOW_MS, color: sdTint(bestA.key, S.el), arrow: way ? screenBearing(way.dir, /** @type {number} */ (yaw)) : null, way, jump: false };
  }
  if (jumpAtk) return { name: SD_BLOWS.stomp.name, t: 1, now: true, color: sdTint('stomp', blowShape(jumpAtk)?.el), arrow: null, way: null, jump: true };
  return null;
}

export function createSdBeats() {
  let k = null, beat = null;
  const show = (kind, at, words, color = null) => { beat = { kind, at, until: at + TITLE_IN_MS + TITLE_HOLD_MS + TITLE_OUT_MS, ...words, color }; };
  return {
    frame(s, t) {
      if (!s || !(s.fi > 0) || !Number.isFinite(t)) { k = null; beat = null; return null; }
      if (!k || k.fi !== s.fi) {
        k = { fi: s.fi, awake: t >= s.op, ph: s.ph, last: Number.isFinite(s.ends) && s.ends - t <= SD_BEAT_LAST_MS, fell: !!s.fell };
        beat = null;
        return null;
      }
      const awake = t >= s.op;
      if (awake && !k.awake && t - s.op < SD_BEAT_LATE_MS) show('wake', s.op, sdWakeText(s.mk));
      k.awake = awake;
      if (s.ph !== k.ph) {
        if (s.ph === 2) show('break', t, { ...SD_BEAT_TEXT.break, sub: sdBreakSub(sdProfileOf(s).pairMs) }, '#e8c060');
        else if (s.ph === 3) show('moment', t, SD_BEAT_TEXT.moment, '#9cffc8');
        k.ph = s.ph;
      }
      const last = Number.isFinite(s.ends) && s.ends - t <= SD_BEAT_LAST_MS && t < s.ends && !s.fell && !s.lost;
      if (last && !k.last) show('last', t, SD_BEAT_TEXT.last, '#ff6a5a');
      k.last = k.last || last;
      if (s.fell && !k.fell) { k.fell = true; if (t - s.fell.at < SD_BEAT_LATE_MS) show('fell', s.fell.at, SD_BEAT_TEXT.fell); }
      if (beat && t >= beat.until) beat = null;
      return beat;
    },
    leave() { k = null; beat = null; },
  };
}

export const SD_BURNING_GROUND = 'Burning brass';
// Matches `SD_POOL_COLOR` in `sdRemnantBlows.js`.
const POOL_RGB = Object.freeze([1.0, 0.45, 0.16]);
export function sdGroundModel({ burning = false, el = null, now, peril = null }) {
  const m = groundViewModel({ inside: !!burning, ground: (el && SD_ELEMENT_GROUND[el]) || SD_BURNING_GROUND, color: (el && SD_ELEMENT_COLOR[el]) || POOL_RGB, now, peril });
  return m && peril?.jump ? { ...m, warn: SD_JUMP_TEXT(peril.name) } : m;
}
