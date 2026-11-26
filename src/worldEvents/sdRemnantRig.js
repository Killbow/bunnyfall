// @ts-check
import { SD_ARENA, SD_REALM_ORIGIN } from '../net/sdBrain.js';
import { SD_BLOW_BY_ID, SD_BLOWS, SD_BODY, SD_REM, SD_ECHO, SD_BREAK_MS, atkWindup, blowShape, behindPillar } from '../net/sdRemnant.js';
import { sdBodyAt } from '../net/sdFightLink.js';
import { SD_REMNANT_BODY, SD_REMNANT_DIAL } from '../world/sdRemnantModel.js';
import { SD_STRIDE_M, SD_ECHO_STRIDE_M, SD_SLIP_FRAC, SD_RELEASE_MS } from './sdRemnantVoice.js';

export const SD_REM_STATES = Object.freeze([
  'dormant', 'wake', 'still', 'walk', 'stompRaise', 'stompLand', 'handRaise', 'handSweep', 'volleyGather', 'volleyThrow',
  'pulse', 'resetRaise', 'resetSlam', 'end', 'stunned', 'rising', 'slip', 'fallen',
]);
export const SD_RIG_PARTS = Object.freeze(['legR', 'legL', 'torso', 'head', 'armR', 'armL']);
const B = SD_REMNANT_BODY;
export const SD_RIG_JOINTS = Object.freeze({
  hip: B.legH, waist: B.legH + B.hipH, neck: B.legH + B.hipH + B.cageH + B.shoulderH,
  shoulder: B.legH + B.hipH + B.cageH + B.shoulderH / 2,
});
export const SD_WAKE_MS = 1600;
export const SD_SLIP_EVERY_MS = 3200;
export const SD_SLIP_MS = 450;
export const SD_SETTLE_MS = 700;
export const SD_GEAR_FLIGHT_MS = 900;
export const SD_GEAR_FLIGHT_SHARE = 0.45;
export const SD_GEAR_ARC_M = 7;
export const SD_GEAR_SPIN = 9;
// The floor band shows the strip `handSwept` damages, the blow width across and out to its reach. `SD_BEAM_FLOOR_Y`
// lifts it just above the floor to avoid depth fighting.
export const SD_BEAM_FLOOR_Y = 0.04;
export const SD_BEAM_DROP_M = 6;
const BEAM_STEPS = 18;

const NONE = Object.freeze([]);
const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const ease = (x) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const rise = (t, a, b) => (b > a ? ease((t - a) / (b - a)) : t >= a ? 1 : 0);
const fall = (t, a, b) => 1 - rise(t, a, b);
const live = (s) => !!s && s.fi > 0 && !s.lost;
const seeded = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

export const BOB = 0, LEAN = 1, TWIST = 2, NOD = 3;
export const restRig = () => ({ state: 'still', legs: new Float64Array(2), trunk: new Float64Array(4), arms: [new Float64Array(2), new Float64Array(2)] });
const zero = (o) => { o.state = 'still'; o.legs.fill(0); o.trunk.fill(0); o.arms[0].fill(0); o.arms[1].fill(0); return o; };

const bodyOf = (s, who) => (who < 0 ? s.rem : s.ec?.[who] ?? null);
const both = (out, f, o) => { out.arms[0][0] += f; out.arms[1][0] += f; out.arms[0][1] += o; out.arms[1][1] += o; };

function dormant(out) { const T = out.trunk; out.state = 'dormant'; T[NOD] += 0.45; T[LEAN] += 0.12; both(out, 0, 0.05); return out; }
function fallen(out, k) {
  const T = out.trunk;
  out.state = 'fallen';
  T[LEAN] += 0.95 * k; T[NOD] += 0.6 * k; out.legs[0] -= 0.25 * k; out.legs[1] += 0.2 * k;
  out.arms[0][0] += 0.7 * k; out.arms[1][0] += 0.5 * k; out.arms[0][1] += 0.6 * k; out.arms[1][1] += 0.75 * k;
  return out;
}
function waking(out, t, op) {
  const T = out.trunk, k = rise(t, op, op + SD_WAKE_MS), fling = Math.sin(Math.PI * k);
  out.state = t < op ? 'dormant' : 'wake';
  T[NOD] += 0.45 * (1 - k) - 0.25 * fling; T[LEAN] += 0.12 * (1 - k) - 0.1 * fling;
  both(out, 0.4 * fling, 0.05 + 0.9 * fling);
  return out;
}
function rising(out, k) { out.state = 'rising'; both(out, 2.7 * (1 - k), 0); out.trunk[NOD] -= 0.35 * (1 - k); return out; }
function stunned(out, t, su) {
  const T = out.trunk, k = rise(t, su - 8000, su - 8000 + 500) * fall(t, su - 600, su);
  out.state = 'stunned';
  T[LEAN] += 0.45 * k + 0.03 * k * Math.sin(t / 380); T[NOD] += 0.5 * k; out.arms[0][0] += 0.35 * k; out.arms[1][0] += 0.3 * k;
  return out;
}
// `stride` is the same stride length sdRemnantVoice uses for footstep sounds, so each planted leg lines up with a
// step sound.
function walking(out, m, t, stride) {
  const lx = m.tx - m.x, lz = m.tz - m.z, len = Math.sqrt(lx * lx + lz * lz), along = Math.min(len, (Math.max(0, t - m.at) / 1000) * m.v);
  if (!(len > 1e-6 && along < len)) return;
  const amp = Math.min(1, along, len - along), c = Math.cos((Math.PI * along) / stride), T = out.trunk;
  out.state = 'walk';
  out.legs[0] += 0.42 * amp * c; out.legs[1] -= 0.42 * amp * c;
  out.arms[0][0] -= 0.28 * amp * c; out.arms[1][0] += 0.28 * amp * c;
  T[BOB] -= 0.14 * amp * Math.abs(c); T[LEAN] += 0.06 * amp;
}
function slipping(out, t, fi) {
  const n = Math.floor(t / SD_SLIP_EVERY_MS), at = n * SD_SLIP_EVERY_MS + seeded(n + fi * 31) * (SD_SLIP_EVERY_MS - SD_SLIP_MS);
  if (!(t >= at && t < at + SD_SLIP_MS)) return;
  const k = Math.sin((Math.PI * (t - at)) / SD_SLIP_MS), T = out.trunk;
  out.state = 'slip';
  T[LEAN] += 0.18 * k; T[NOD] += 0.22 * k; out.arms[1][1] -= 0.25 * k; out.arms[1][0] += 0.3 * k; out.legs[1] += 0.15 * k;
}
function clockBlow(out, C, t) {
  const CA = SD_BLOW_BY_ID[C.a], T = out.trunk;
  if (CA === SD_BLOWS.pulse) {
    const k = t < C.at ? rise(t, C.at - CA.windup, C.at) : fall(t, C.at, C.at + SD_SETTLE_MS);
    if (k > 0) { out.state = 'pulse'; T[LEAN] -= 0.16 * k; T[NOD] -= 0.22 * k; both(out, 0, 0.4 * k); }
  } else if (CA === SD_BLOWS.end) {
    const k = rise(t, C.at - CA.windup, C.at - CA.windup + 600);
    if (k > 0) { out.state = 'end'; T[LEAN] -= 0.14 * k; T[NOD] -= 0.4 * k; both(out, 0.45 * k, 1.15 * k); }
  }
}
function stomping(out, A, a, t, t0, w) {
  const T = out.trunk;
  if (t < a.at) {
    const lift = t < a.at - SD_RELEASE_MS ? rise(t, t0, t0 + 0.6 * (w - SD_RELEASE_MS)) : fall(t, a.at - SD_RELEASE_MS, a.at);
    out.state = 'stompRaise';
    out.legs[0] = 0.95 * lift; T[LEAN] += -0.12 * lift + 0.22 * rise(t, a.at - SD_RELEASE_MS, a.at);
    both(out, 0.25 * lift, 0.45 * lift);
    return;
  }
  const k = fall(t, a.at, a.at + A.active * 0.4 + SD_SETTLE_MS);
  if (k > 0) { out.state = 'stompLand'; T[LEAN] += 0.22 * k; T[NOD] += 0.15 * k; both(out, 0.45 * k, 0); T[BOB] -= 0.25 * k; }
}
function sweeping(out, A, a, t, t0, w) {
  const T = out.trunk, sw = a.sw ?? 1, end = a.at + A.active, back = Math.min(A.recover, SD_SETTLE_MS);
  const arm = rise(t, t0, t0 + Math.min(700, w * 0.5)) * fall(t, end, end + back);
  if (t < a.at) { out.state = 'handRaise'; T[TWIST] += -sw * (A.arc / 2) * rise(t, t0, a.at - SD_RELEASE_MS); }
  else if (t < end) { out.state = 'handSweep'; T[TWIST] += sw * (A.arc * ((t - a.at) / A.active) - A.arc / 2); }
  else { T[TWIST] += sw * (A.arc / 2) * fall(t, end, end + back); if (arm > 0) out.state = 'handSweep'; }
  out.arms[0][0] = (Math.PI / 2) * arm; out.arms[0][1] = 0;
  out.arms[1][1] += 0.3 * arm; T[LEAN] += 0.08 * arm;
}
function throwing(out, a, t, t0, w) {
  const go = gearLaunchAt(a, w), T = out.trunk;
  if (t < go) { const k = rise(t, t0, go); out.state = 'volleyGather'; both(out, -0.7 * k, 0.3 * k); T[LEAN] -= 0.12 * k; return; }
  const k = rise(t, go, go + 250) * fall(t, a.at, a.at + SD_SETTLE_MS), back = 1 - rise(t, go, go + 250);
  out.state = 'volleyThrow'; both(out, 2.1 * k - 0.7 * back, 0); T[LEAN] += 0.15 * k;
}
function resetting(out, A, a, t, t0) {
  const T = out.trunk;
  if (t < a.at) {
    const k = rise(t, t0, t0 + 1500), shake = rise(t, t0, a.at) * 0.05 * Math.sin(t / 37);
    out.state = 'resetRaise';
    out.arms[0][0] += 2.6 * k + shake; out.arms[1][0] += 2.6 * k - shake; both(out, 0, 0.45 * k);
    T[LEAN] -= 0.2 * k + shake; T[NOD] -= 0.35 * k;
    return;
  }
  const k = fall(t, a.at, a.at + A.active + SD_SETTLE_MS);
  if (k > 0) { out.state = 'resetSlam'; both(out, 0.5 * k, 0); T[LEAN] += 0.3 * k; T[NOD] += 0.2 * k; T[BOB] -= 0.3 * k; }
}
function blowing(out, s, who, Bd, t) {
  const a = Bd.atk, A = a ? SD_BLOW_BY_ID[a.a] : null;
  if (!A || !Number.isFinite(a.at)) return;
  const w = atkWindup(a, A, s.ph, who >= 0 ? SD_BODY.gold + who : SD_BODY.remnant), t0 = a.at - w, S = blowShape(a);
  if (t < t0) return;
  if (A === SD_BLOWS.stomp) stomping(out, S, a, t, t0, w);
  else if (A === SD_BLOWS.hand) sweeping(out, S, a, t, t0, w);
  else if (A === SD_BLOWS.volley) throwing(out, a, t, t0, w);
  else if (A === SD_BLOWS.reset) resetting(out, S, a, t, t0);
}

/**
 * @param {any} s
 * @param {number} who
 * @param {number} t
 * @param {any} [out]
 */
export function remnantRig(s, who, t, out = restRig()) {
  zero(out);
  const breath = Math.sin((t / 4200) * Math.PI * 2);
  out.trunk[LEAN] += 0.025 * breath; out.trunk[NOD] += 0.02 * breath; both(out, 0.03 * breath, 0);
  const Bd = live(s) ? bodyOf(s, who) : null;
  if (!Bd) return dormant(out);
  const echo = who >= 0;
  if (echo ? !(Bd.h > 0) : !!s.fell) { const at = echo ? Bd.dn || -Infinity : s.fell.at; return fallen(out, rise(t, at, at + (echo ? 1500 : 4000))); }
  if (!echo && t < s.op + SD_WAKE_MS) return waking(out, t, s.op);
  const upAt = echo ? Bd.up : s.ou;
  if (t < upAt) return rising(out, clamp01(1 - (upAt - t) / SD_BREAK_MS));
  if (!echo && t < s.su) return stunned(out, t, s.su);
  if (Bd.mv && Bd.mv.v > 0) walking(out, Bd.mv, t, echo ? SD_ECHO_STRIDE_M : SD_STRIDE_M);
  if (!echo && s.m > 0 && s.h / s.m < SD_SLIP_FRAC) slipping(out, t, s.fi);
  if (s.clk) clockBlow(out, s.clk, t);
  blowing(out, s, who, Bd, t);
  return out;
}

export const gearFlightOf = (w) => Math.min(SD_GEAR_FLIGHT_MS, w * SD_GEAR_FLIGHT_SHARE);
const gearLaunchAt = (a, w) => a.at - gearFlightOf(w);

export function mul4(out, a, b) {
  const t = _m;
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) t[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  for (let i = 0; i < 16; i++) out[i] = t[i];
  return out;
}
const _m = new Float64Array(16);
// The right leg and right arm sit at +x in the body frame.
const PIVOT = new Float64Array([B.legX, SD_RIG_JOINTS.hip, -B.legX, SD_RIG_JOINTS.hip, 0, SD_RIG_JOINTS.waist, 0, SD_RIG_JOINTS.neck, B.armX, SD_RIG_JOINTS.shoulder, -B.armX, SD_RIG_JOINTS.shoulder]);
const ANG = new Float64Array(3);
// Applies pitch about x, then roll about z, then twist about y. A positive pitch swings a hanging limb backward, so
// a forward swing uses a negative pitch.
function joint(out, k) {
  const px = PIVOT[2 * k], py = PIVOT[2 * k + 1];
  const cp = Math.cos(ANG[0]), sp = Math.sin(ANG[0]), cr = Math.cos(ANG[1]), sr = Math.sin(ANG[1]), cy = Math.cos(ANG[2]), sy = Math.sin(ANG[2]);
  const R = _r3;
  R[0] = cy * cr; R[1] = sr; R[2] = -sy * cr;
  R[3] = -cy * sr * cp + sy * sp; R[4] = cr * cp; R[5] = sy * sr * cp + cy * sp;
  R[6] = cy * sr * sp + sy * cp; R[7] = -cr * sp; R[8] = -sy * sr * sp + cy * cp;
  out[0] = R[0]; out[1] = R[1]; out[2] = R[2]; out[3] = 0;
  out[4] = R[3]; out[5] = R[4]; out[6] = R[5]; out[7] = 0;
  out[8] = R[6]; out[9] = R[7]; out[10] = R[8]; out[11] = 0;
  out[12] = px - (R[0] * px + R[3] * py); out[13] = py - (R[1] * px + R[4] * py); out[14] = -(R[2] * px + R[5] * py); out[15] = 1;
  return out;
}
const _j = new Float64Array(16), _torso = new Float64Array(16), _r3 = new Float64Array(9);
export function rigMatrices(base, rig, out = SD_RIG_PARTS.map(() => new Float32Array(16))) {
  const L = rig.legs, T = rig.trunk, A = rig.arms;
  ANG[0] = -L[0]; ANG[1] = 0; ANG[2] = 0; joint(_j, 0); mul4(out[0], base, _j);
  ANG[0] = -L[1]; joint(_j, 1); mul4(out[1], base, _j);
  ANG[0] = T[LEAN]; ANG[2] = T[TWIST]; joint(_torso, 2); _torso[13] += T[BOB];
  mul4(out[2], base, _torso);
  ANG[0] = T[NOD]; ANG[2] = 0; joint(_j, 3); mul4(_j, _torso, _j); mul4(out[3], base, _j);
  ANG[0] = -A[0][0]; ANG[1] = A[0][1]; joint(_j, 4); mul4(_j, _torso, _j); mul4(out[4], base, _j);
  ANG[0] = -A[1][0]; ANG[1] = -A[1][1]; joint(_j, 5); mul4(_j, _torso, _j); mul4(out[5], base, _j);
  return out;
}
export const apply4 = (m, p, out = null) => {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
  if (!out) return [x, y, z];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
};
export const SD_REM_HAND = Object.freeze([Object.freeze([B.armX, B.armBot, 0]), Object.freeze([-B.armX, B.armBot, 0])]);

export function arenaBase(x, z, yw, scale = 1, out = new Float64Array(16)) {
  const c = Math.cos(yw) * scale, s = Math.sin(yw) * scale;
  out.fill(0);
  out[0] = c; out[2] = -s; out[5] = scale; out[8] = s; out[10] = c; out[12] = x; out[13] = 0; out[14] = z; out[15] = 1;
  return out;
}
const _base = new Float64Array(16), _parts = SD_RIG_PARTS.map(() => new Float64Array(16)), _rig = restRig(), _handBody = [0, 0];
export function handAt(s, who, h, t, out = null) {
  const Bd = who < 0 ? s.rem : s.ec?.[who];
  if (!Bd) return null;
  const at = sdBodyAt(Bd, t, _handBody);
  arenaBase(at[0], at[1], Bd.yw ?? 0, who < 0 ? 1 : SD_ECHO.h / SD_REM.h, _base);
  rigMatrices(_base, remnantRig(s, who, t, _rig), /** @type {any} */ (_parts));
  return apply4(_parts[4 + h], SD_REM_HAND[h], out);
}

// Records are reused in place each frame, so a caller must copy any record it needs past the current frame.
export const sdKeptList = () => Object.defineProperty([], 'pool', { value: [] });
function keptNext(list, make) {
  let o = list.pool[list.length];
  if (!o) { o = make(); list.pool[list.length] = o; }
  list.push(o);
  return o;
}
const newGear = () => ({ x: 0, y: 0, z: 0, spin: 0, who: 0, k: 0, yaw: 0 });
const newBeam = () => ({ a: [0, 0, 0], b: [0, 0, 0], f0: [0, 0, 0], f1: [0, 0, 0], w: 0, k: 0, who: 0, bearing: 0, reach: 0, active: 0 });
const _gearR = [0, 0, 0], _gearL = [0, 0, 0];

export function sdGearsAt(s, t, out = null) {
  /** @type {any[]} */ let list = /** @type {any} */ (NONE);
  if (out) out.length = 0;
  if (!live(s) || s.fell) return list;
  for (let who = -1; who < (s.ec?.length ?? 0); who++) {
    const Bd = who < 0 ? s.rem : s.ec[who], a = Bd?.atk;
    if (!a || a.a !== SD_BLOWS.volley.id || (who >= 0 && !(Bd.h > 0))) continue;
    const w = atkWindup(a, SD_BLOWS.volley, s.ph, who < 0 ? SD_BODY.remnant : SD_BODY.gold + who), fl = gearFlightOf(w), go = a.at - fl;
    if (!(t >= go && t < a.at)) continue;
    const r = handAt(s, who, 0, go, _gearR), l = handAt(s, who, 1, go, _gearL);
    if (!r || !l) continue;
    const fx = (r[0] + l[0]) / 2, fy = (r[1] + l[1]) / 2, fz = (r[2] + l[2]) / 2, k = (t - go) / fl, tg = a.tg;
    if (!tg) continue;
    for (let i = 0; i < tg.length; i++) {
      const q = tg[i];
      if (list === NONE) list = out ?? sdKeptList();
      const g = keptNext(list, newGear);
      g.x = fx + (q[0] - fx) * k; g.y = fy + (0.4 - fy) * k + SD_GEAR_ARC_M * 4 * k * (1 - k); g.z = fz + (q[1] - fz) * k;
      g.spin = (t / 1000) * SD_GEAR_SPIN + i; g.who = who; g.k = k;
      g.yaw = Math.atan2(q[0] - fx, q[1] - fz);
    }
  }
  return list;
}

const newGather = () => ({ x: 0, y: 0, z: 0, spin: 0, who: 0, h: 0, k: 0, yaw: 0 });
export function sdGatherGearsAt(s, t, out = null) {
  /** @type {any[]} */ let list = /** @type {any} */ (NONE);
  if (out) out.length = 0;
  if (!live(s) || s.fell) return list;
  for (let who = -1; who < (s.ec?.length ?? 0); who++) {
    const Bd = who < 0 ? s.rem : s.ec[who], a = Bd?.atk;
    if (!a || a.a !== SD_BLOWS.volley.id || (who >= 0 && !(Bd.h > 0)) || (who < 0 && (s.ph === 2 || t < s.su))) continue;
    const w = atkWindup(a, SD_BLOWS.volley, s.ph, who < 0 ? SD_BODY.remnant : SD_BODY.gold + who), t0 = a.at - w, go = a.at - gearFlightOf(w);
    if (!(t >= t0 && t < go)) continue;
    for (let h = 0; h < 2; h++) {
      if (list === NONE) list = out ?? sdKeptList();
      const g = keptNext(list, newGather);
      g.who = who; g.h = h; g.k = (t - t0) / (go - t0); g.spin = (t / 1000) * SD_GEAR_SPIN * (h ? -1 : 1); g.yaw = (Bd.yw ?? 0) + Math.PI / 2;
    }
  }
  return list;
}
// Unlike `gearMatrix`, the record's `x, y, z` are already in the dungeon frame, so the translation is written
// directly.
export function gatherGearMatrix(q, out) {
  gearMatrix(0, 0, 0, q.spin, out, q.yaw);
  const k = q.k;
  for (let i = 0; i < 11; i++) out[i] *= k;
  out[12] = q.x; out[13] = q.y; out[14] = q.z;
  return out;
}

export function beamReach(x, z, b, len) {
  const sx = Math.sin(b), cz = Math.cos(b);
  if (!behindPillar(x, z, x + sx * len, z + cz * len)) return len;
  let lo = 0, hi = len;
  for (let i = 0; i < BEAM_STEPS; i++) { const m = (lo + hi) / 2; if (behindPillar(x, z, x + sx * m, z + cz * m)) hi = m; else lo = m; }
  return hi;
}
function onFloor(out, x, z, sx, cz, m) { out[0] = x + sx * m; out[1] = SD_BEAM_FLOOR_Y; out[2] = z + cz * m; return out; }
export function sdBeamsAt(s, t, out = null) {
  /** @type {any[]} */ let list = /** @type {any} */ (NONE);
  if (out) out.length = 0;
  if (!live(s) || s.fell) return list;
  const A = SD_BLOWS.hand;
  for (let who = -1; who < (s.ec?.length ?? 0); who++) {
    const Bd = who < 0 ? s.rem : s.ec[who], a = Bd?.atk;
    if (!a || a.a !== A.id) continue;
    const S = blowShape(a);
    if (!(t >= a.at && t < a.at + S.active) || (who >= 0 && !(Bd.h > 0))) continue;
    const k = (t - a.at) / S.active, bearing = a.yw + (a.sw ?? 1) * (S.arc * k - S.arc / 2);
    if (list === NONE) list = out ?? sdKeptList();
    const g = keptNext(list, newBeam), hand = handAt(s, who, 0, t, g.a);
    if (!hand) { list.length--; continue; }
    const reach = beamReach(a.x, a.z, bearing, A.len), sx = Math.sin(bearing), cz = Math.cos(bearing);
    const rim = Math.min(reach, who < 0 ? SD_REM.r : SD_ECHO.r), fwd = (hand[0] - a.x) * sx + (hand[2] - a.z) * cz;
    onFloor(g.b, a.x, a.z, sx, cz, Math.min(reach, Math.max(rim, fwd) + SD_BEAM_DROP_M));
    onFloor(g.f0, a.x, a.z, sx, cz, rim); onFloor(g.f1, a.x, a.z, sx, cz, reach);
    g.w = S.width; g.k = k; g.who = who; g.bearing = bearing; g.reach = reach; g.active = S.active;
  }
  return list.length ? list : NONE;
}

export const SD_BEAM_FADE_MS = Object.freeze([120, 220]);
function toDungeon(out, p) { out[0] = SD_REALM_ORIGIN[0] + SD_ARENA.x + p[0]; out[1] = SD_REALM_ORIGIN[1] + p[1]; out[2] = SD_REALM_ORIGIN[2] + SD_ARENA.z + p[2]; return out; }
const newDraw = () => ({ a: [0, 0, 0], b: [0, 0, 0], f0: [0, 0, 0], f1: [0, 0, 0], w: 0, alpha: 0 });
const _beamsAt = sdKeptList();
export function sdBeamDraws(s, t, out = null) {
  if (out) out.length = 0;
  const beams = sdBeamsAt(s, t, out ? _beamsAt : null);
  if (!beams.length) return NONE;
  const list = out ?? sdKeptList();
  for (let i = 0; i < beams.length; i++) {
    const g = beams[i], d = keptNext(list, newDraw), ms = g.k * g.active, alpha = Math.min(1, ms / SD_BEAM_FADE_MS[0], (g.active - ms) / SD_BEAM_FADE_MS[1]);
    toDungeon(d.a, g.a); toDungeon(d.b, g.b); toDungeon(d.f0, g.f0); toDungeon(d.f1, g.f1); d.w = g.w; d.alpha = Math.max(0, alpha);
  }
  return list;
}

const DIAL = SD_REMNANT_DIAL;
export const SD_FALL_DECOR = Object.freeze({ g: 9.8, pop: 0.6, roll: 3, rollS: 2, toppleS: 0.5, sink: 1.2, sinkS: 4, rise: 3, riseS: 1.2, spin: 2.5 });
// `hand[0]` turns clockwise from XII as seen from behind the dial, so a shrinking turn runs the hand backward.
export function dialHandMatrix(torso, hand, out) {
  const turn = hand[0], c = Math.cos(-turn), s = Math.sin(-turn), y = DIAL.y, R = _hm;
  R.fill(0);
  R[0] = c; R[1] = s; R[4] = -s; R[5] = c; R[10] = 1; R[15] = 1;
  R[12] = y * s; R[13] = y - y * c;
  return mul4(out, torso, R);
}
const _hm = new Float64Array(16), _fm = new Float64Array(16);
export function dialFallMatrix(base, fell, t, out) {
  const F = SD_FALL_DECOR, tau = Math.max(0, t - fell.at) / 1000;
  if (tau >= F.sinkS) return null;
  const v0 = (2 * F.roll) / F.rollS, tr = Math.min(tau, F.rollS), dx = v0 * tr - (v0 / (2 * F.rollS)) * tr * tr;
  const cy = Math.max(DIAL.r, DIAL.y - 0.5 * F.g * tau * tau), dz = -F.pop * Math.min(1, tau / 0.5);
  const phi = -dx / DIAL.r;
  const q = Math.min(1, Math.max(0, (tau - F.rollS) / F.toppleS)), psi = (Math.PI / 2) * q * q * (3 - 2 * q);
  const sink = F.sink * Math.min(1, Math.max(0, (tau - F.rollS - F.toppleS) / (F.sinkS - F.rollS - F.toppleS)));
  const cp = Math.cos(phi), sp = Math.sin(phi), cs = Math.cos(psi), ss = Math.sin(psi), R = _fm, r = DIAL.r;
  R[0] = cp; R[1] = cs * sp; R[2] = ss * sp; R[3] = 0;
  R[4] = -sp; R[5] = cs * cp; R[6] = ss * cp; R[7] = 0;
  R[8] = 0; R[9] = -ss; R[10] = cs; R[11] = 0;
  const px = dx, py = cy - r - (-r * cs) - sink, pz = DIAL.z + dz - (-r * ss);
  R[12] = px - (R[0] * 0 + R[4] * DIAL.y + R[8] * DIAL.z); R[13] = py - (R[1] * 0 + R[5] * DIAL.y + R[9] * DIAL.z); R[14] = pz - (R[2] * 0 + R[6] * DIAL.y + R[10] * DIAL.z); R[15] = 1;
  return mul4(out, base, R);
}
export function heartFallMatrix(base, fell, t, out) {
  const F = SD_FALL_DECOR, tau = Math.max(0, t - fell.at) / 1000;
  if (tau >= F.riseS) return null;
  const k = tau / F.riseS, y = SD_REMNANT_BODY.heartY + F.rise * (1 - (1 - k) * (1 - k)), a = Math.PI * 2 * F.spin * k * k, c = Math.cos(a), s = Math.sin(a), R = _fm;
  R.fill(0);
  R[0] = c; R[2] = -s; R[5] = 1; R[8] = s; R[10] = c; R[13] = y; R[15] = 1;
  return mul4(out, base, R);
}

export function gearMatrix(x, y, z, spin, out = new Float32Array(16), yaw = 0) {
  const c = Math.cos(-spin), s = Math.sin(-spin), ct = Math.cos(yaw - Math.PI / 2), st = Math.sin(yaw - Math.PI / 2);
  out[0] = ct * c; out[1] = s; out[2] = -st * c; out[3] = 0;
  out[4] = -ct * s; out[5] = c; out[6] = st * s; out[7] = 0;
  out[8] = st; out[9] = 0; out[10] = ct; out[11] = 0;
  out[12] = SD_REALM_ORIGIN[0] + SD_ARENA.x + x; out[13] = SD_REALM_ORIGIN[1] + y; out[14] = SD_REALM_ORIGIN[2] + SD_ARENA.z + z; out[15] = 1;
  return out;
}
