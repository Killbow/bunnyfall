// @ts-check

import { algebra, clamp01, clamp, smooth, RAD, wrapAngle, frac, ease, FOOT } from './bodyKit.js';

const { add, scale, dot, norm, lerp } = algebra;

const G = 9.81;

export const GAIT_STYLES = Object.freeze({
  walk: Object.freeze({
    strideMax: 2.0, duty: Object.freeze([0.62, 0.53]), frFull: 2.2,
    height: 0.975, heightFast: 0.93, bob: 0.024, sway: 0.028,
    lift: 0.085, liftFast: 0.12, land: 0.15,
    heel: 16, toeOff: 34, swingToe: 10, flat: Object.freeze([0.16, 0.56]),
    width: 0.82, hipYaw: 8, hipList: 5, hipTilt: 4, hipTiltWave: 1.5,
    chestYaw: 9, chestRoll: 2.5, lean: 5,
    arm: Object.freeze({ swing: 27, bias: 4, elbow: Object.freeze([12, 36]), abduct: 8 }),
  }),
  run: Object.freeze({
    strideMax: 4.1, duty: Object.freeze([0.42, 0.3]), frFull: 7,
    height: 0.925, heightFast: 0.9, bob: 0.035, sway: 0.012,
    lift: 0.18, liftFast: 0.29, land: 0.35,
    heel: 4, toeOff: 50, swingToe: 14, flat: Object.freeze([0.1, 0.32]),
    width: 0.42, hipYaw: 9.5, hipList: 5, hipTilt: 9, hipTiltWave: 2.5,
    chestYaw: 14, chestRoll: 3, lean: 11,
    arm: Object.freeze({ swing: 42, bias: 7, elbow: Object.freeze([74, 96]), abduct: 18 }),
  }),
  sneak: Object.freeze({
    strideMax: 1.3, duty: Object.freeze([0.72, 0.64]), frFull: 0.6,
    height: 0.8, heightFast: 0.78, bob: 0.012, sway: 0.04,
    lift: 0.09, liftFast: 0.1, land: 0.1,
    heel: 8, toeOff: 20, swingToe: 6, flat: Object.freeze([0.22, 0.6]),
    width: 1.05, hipYaw: 5, hipList: 3, hipTilt: 12, hipTiltWave: 1,
    chestYaw: 5, chestRoll: 1.5, lean: 26,
    arm: Object.freeze({ swing: 12, bias: 14, elbow: Object.freeze([40, 58]), abduct: 16 }),
  }),
});

export const STAND = Object.freeze({
  height: 0.982, width: 1.0, lead: 0.03, lean: 2, hipTilt: 4,
  breath: 4.2, breathPitch: 0.9, shift: 7.5, shiftSway: 0.012, shiftList: 1.4,
  sneak: Object.freeze({ height: 0.84, lean: 20, hipTilt: 10 }),
});

export const BODY_STYLES = Object.freeze({
  male: Object.freeze({}),
  female: Object.freeze({ width: 0.72, hipYaw: 1.3, hipList: 1.35, sway: 1.2, abduct: 0.8, swing: 0.92, chestYaw: 0.85, lean: 0.9 }),
  beast: Object.freeze({ bob: 1.25, lift: 1.15, lean: 1.2, height: 0.985, hipTilt: 1.25, footBias: -6 }),
});

export const STEER = Object.freeze({ forward: 0.68, max: 60, back: 105, hyst: 12, backShare: 0.55, backMax: 40 });

export const GAIT_EASE = Object.freeze({ moveIn: 0.09, moveOut: 0.16, style: 0.22, speed: 0.08, steer: 0.14, lean: 0.25, dir: 0.06, back: 0.12, slope: 0.25, phase: 0.25 });

export const TURN = Object.freeze({ step: 26, dist: 0.09, time: 0.26, minTime: 0.12, lift: 0.07, max: 70, snap: 90, rate: 9, quick: 0.16 });

export const GAIT_LIMITS = Object.freeze({ on: 0.2, off: 0.1, placed: 60, slope: 1.2, reverse: 150 });

export const SLOPE = Object.freeze({ shorten: 0.5, shift: 0.5, shiftMax: 0.75 });

export function strideLength(v, h, style) {
  if (!(v > 0) || !(h > 0)) return 0;
  return Math.min(2.3 * h * Math.pow((v * v) / (G * h), 0.3), style.strideMax * h);
}

export function dutyFactor(v, h, style) {
  const fr = h > 0 ? (v * v) / (G * h) : 0;
  return lerp(style.duty[0], style.duty[1], clamp01(fr / style.frFull));
}

const LIFT_A = 1, LIFT_B = 1.7;
const LIFT_MAX = Math.pow(LIFT_A / (LIFT_A + LIFT_B), LIFT_A) * Math.pow(LIFT_B / (LIFT_A + LIFT_B), LIFT_B);
export const liftProfile = (s) => (s <= 0 || s >= 1 ? 0 : (Math.pow(s, LIFT_A) * Math.pow(1 - s, LIFT_B)) / LIFT_MAX);

export const minJerk = (s) => { const x = clamp01(s); return x * x * x * (10 + x * (-15 + 6 * x)); };
export const flightPath = (s, m = 0) => { const x = clamp01(s); return x * x * (3 - m + (m - 2) * x); };
export const flightOvershoot = (o, land) => 0.09 * o * o * Math.pow(Math.max(0, 1 - land), 1.6);

export function strideShape(s, input, body, P) {
  const L = body.leg, h = input.legM, U = input.unitsPerM || 1;
  const grade = s.slope[0] * s.dir[0] + s.slope[1] * s.dir[1];
  const stride = Math.min(strideLength(s.speed, h, P) * U, P.strideMax * L) / (1 + SLOPE.shorten * Math.abs(grade));
  const fr = h > 0 ? (s.speed * s.speed) / (G * h) : 0;
  const frShare = clamp01(fr / P.frFull);
  const carriage = lerp(P.height, P.heightFast, frShare);
  const reach = Math.min(body.legs?.L ?? L, body.legs?.R ?? L) * 0.992;
  const sweep = Math.sqrt(Math.max(0, reach * reach - carriage * carriage * L * L));
  let beta = dutyFactor(s.speed, h, P);
  if (stride > 1e-6) {
    const overshoot = flightOvershoot(1 - beta, P.land) * stride;
    beta = lerp(beta, clamp((2 * Math.max(0, sweep - overshoot)) / stride, 0.12, beta), P.run);
  }
  const A = (stride * beta) / 2;
  const shift = clamp(SLOPE.shift * grade * L, -SLOPE.shiftMax * A, SLOPE.shiftMax * A);
  return { stride, beta, A, frShare, carriage, reach, sweep, m: P.land * (1 - beta), grade, shift };
}

export function createGaitState() {
  return {
    phase: 0, move: 0, run: 0, sneak: 0, speed: 0, dir: [0, 1], th: 0, psi: 0, back: false, backShare: 0, along: 1,
    lean: 0, bank: 0, lastSpeed: 0, yaw: null, yawRate: 0, t: 0, walking: false, air: false, lag: 0, shown: 0,
    travel: null, carried: null, slope: [0, 0], stance: null, stepTime: null,
    feet: { L: null, R: null },
  };
}

export function blendStyle(run, sneak, kind) {
  const w = GAIT_STYLES.walk, r = GAIT_STYLES.run, k = GAIT_STYLES.sneak;
  const ws = clamp01(sneak), wr = clamp01(run) * (1 - ws), ww = 1 - wr - ws;
  const mix = (f) => f(w) * ww + f(r) * wr + f(k) * ws;
  const fam = BODY_STYLES[kind] ?? BODY_STYLES.male;
  const m = (key) => fam[key] ?? 1;
  return {
    strideMax: mix((s) => s.strideMax), duty: [mix((s) => s.duty[0]), mix((s) => s.duty[1])], frFull: mix((s) => s.frFull),
    height: mix((s) => s.height) * m('height'), heightFast: mix((s) => s.heightFast) * m('height'), bob: mix((s) => s.bob) * m('bob'), sway: mix((s) => s.sway) * m('sway'),
    lift: mix((s) => s.lift) * m('lift'), liftFast: mix((s) => s.liftFast) * m('lift'), land: mix((s) => s.land),
    heel: mix((s) => s.heel), toeOff: mix((s) => s.toeOff), swingToe: mix((s) => s.swingToe),
    flat: [mix((s) => s.flat[0]), mix((s) => s.flat[1])],
    width: mix((s) => s.width) * m('width'),
    hipYaw: mix((s) => s.hipYaw) * m('hipYaw'), hipList: mix((s) => s.hipList) * m('hipList'),
    hipTilt: mix((s) => s.hipTilt) * m('hipTilt'), hipTiltWave: mix((s) => s.hipTiltWave),
    chestYaw: mix((s) => s.chestYaw) * m('chestYaw'), chestRoll: mix((s) => s.chestRoll), lean: mix((s) => s.lean) * m('lean'),
    arm: {
      swing: mix((s) => s.arm.swing) * m('swing'), bias: mix((s) => s.arm.bias),
      elbow: [mix((s) => s.arm.elbow[0]), mix((s) => s.arm.elbow[1])],
      abduct: mix((s) => s.arm.abduct) * m('abduct'),
    },
    footBias: fam.footBias ?? 0, standHeight: m('height'), standLean: m('lean'), standTilt: m('hipTilt'),
    run: wr, sneak: ws,
  };
}

export function stancePitch(q, P) {
  if (q < P.flat[0]) return P.heel * (1 - smooth(q / P.flat[0]));
  if (q < P.flat[1]) return 0;
  return -P.toeOff * smooth((q - P.flat[1]) / (1 - P.flat[1]));
}
export function swingPitch(s, P) {
  if (s < 0.45) return lerp(-P.toeOff, P.swingToe, smooth(s / 0.45));
  return lerp(P.swingToe, P.heel, smooth((s - 0.45) / 0.55));
}

export function footPlace(flat, pitch, fwd, body) {
  const ankle = [flat[0], flat[1], body.ankle];
  const c = Math.cos(pitch), s = Math.sin(pitch);
  const toe = [fwd[0] * c, fwd[1] * c, s];
  const up = [-fwd[0] * s, -fwd[1] * s, c];
  if (pitch === 0) return { at: ankle, toe, up };
  const pivotLen = pitch > 0 ? -FOOT.heel * body.leg : FOOT.ball * body.leg;
  const pivot = [flat[0] + fwd[0] * pivotLen, flat[1] + fwd[1] * pivotLen, 0];
  const along = -pivotLen, upAmt = body.ankle;
  return { at: add(pivot, add(scale(toe, along), scale(up, upAmt))), toe, up };
}

export function footPlaceOn(flat, rocker, grade, fwd, body) {
  const P = rocker + Math.atan(grade);
  const c = Math.cos(P), s = Math.sin(P);
  const toe = [fwd[0] * c, fwd[1] * c, s];
  const up = [-fwd[0] * s, -fwd[1] * s, c];
  const pivotLen = rocker > 0 ? -FOOT.heel * body.leg : rocker < 0 ? FOOT.ball * body.leg : 0;
  const cg = 1 / Math.sqrt(1 + grade * grade), sg = grade * cg;
  const pivot = [flat[0] + fwd[0] * cg * pivotLen, flat[1] + fwd[1] * cg * pivotLen, flat[2] + sg * pivotLen];
  return { at: add(pivot, add(scale(toe, -pivotLen), scale(up, body.ankle))), toe, up };
}

const rotXY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
const lerpV = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
const wrapHalf = (x) => x - Math.round(x);
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const SIDES = /** @type {const} */ (['L', 'R']);
const OFFSET = { L: 0, R: 0.5 };
const LANE = { L: -1, R: 1 };

export function standingSpot(side, body, stance = null) {
  const sign = LANE[side];
  const w = body.hipWidth * 0.5 * STAND.width;
  let p = [body.restHip[0] + sign * w, body.restHip[1] + (side === 'L' ? STAND.lead * body.leg : 0)];
  const off = stance?.feet?.[side];
  if (off) p = [p[0] + off[0] * body.leg, p[1] + off[1] * body.leg];
  return { p, yaw: (stance?.toe?.[side] ?? 0) * RAD };
}

const groundAt = (s, x, y) => s.slope[0] * x + s.slope[1] * y;

function plantAt(s, p, yaw) {
  return { p: [p[0], p[1], groundAt(s, p[0], p[1])], yaw, swing: null, cur: null };
}

const flightProgress = (sw) => (sw.kind === 'gait' ? clamp01((sw.s - sw.s0) / Math.max(1e-3, 1 - sw.s0)) : clamp01(sw.t / Math.max(1e-3, sw.dur)));
function flightAt(sw, sp = flightProgress(sw)) {
  const k = sw.kind === 'gait' ? flightPath(sp, sw.m ?? 0) : minJerk(sp);
  const p = lerpV(sw.from, sw.to, k);
  if (sw.bow) {
    const b = 2 * Math.tan(sw.bow / 4) * k * (1 - k);
    p[0] -= (sw.to[1] - sw.from[1]) * b; p[1] += (sw.to[0] - sw.from[0]) * b;
  }
  return { p, yaw: lerpAngle(sw.fromYaw, sw.toYaw, k) };
}
function rebase(sw, to = null, stride = 0) {
  const now = flightAt(sw);
  sw.from = now.p; sw.fromYaw = now.yaw;
  if (sw.kind === 'gait') {
    if (to && stride > 1e-6) sw.s = Math.min(sw.s, Math.max(0, 1 - Math.hypot(to[0] - now.p[0], to[1] - now.p[1]) / stride));
    sw.s0 = sw.s;
  } else { sw.dur = Math.max(TURN.minTime, sw.dur - sw.t); sw.t = 0; }
}

export function stepGait(state, input, body, dt) {
  const s = state;
  // A NaN dt would poison the state permanently.
  if (!finite(dt) || dt < 0) dt = 0;
  const L = body.leg;
  const uH = finite(input.unitsPerM) && input.unitsPerM > 0 ? input.unitsPerM : 1;
  const uV = finite(input.unitsPerMz) && input.unitsPerMz > 0 ? input.unitsPerMz : uH;
  const grounded = input.grounded !== false;
  s.stance = input.stance ?? null;
  s.stepTime = finite(input.stepTime) ? input.stepTime : null;
  const yaw = finite(input.yaw) ? input.yaw : (s.yaw ?? 0);
  const carried = finite(input.carriedYaw) ? input.carriedYaw : 0;
  const fresh = s.yaw == null;
  const dYaw = fresh ? 0 : wrapAngle(wrapAngle(yaw - s.yaw) - (s.carried == null ? 0 : carried - s.carried));
  const snap = fresh || Math.abs(dYaw) > TURN.snap * RAD || (dt > 0 && Math.abs(dYaw) / dt > TURN.rate);
  let dx = 0, dy = 0, dz = 0, dist = 0, placed = false;
  const tr = input.travel;
  if (tr && finite(tr[0]) && finite(tr[1]) && finite(tr[2])) {
    if (s.travel) {
      const wx = tr[0] - s.travel[0], wy = tr[1] - s.travel[1], wz = tr[2] - s.travel[2];
      const h = Math.hypot(wx, wz);
      if (!(h <= GAIT_LIMITS.placed * Math.max(dt, 1 / 240) + 0.05)) placed = true;
      else {
        const y0 = s.yaw ?? yaw, c = Math.cos(y0), sn = Math.sin(y0);
        dx = (wx * c - wz * sn) * uH; dy = (wx * sn + wz * c) * uH; dz = wy * uV; dist = h;
      }
    }
    s.travel = [tr[0], tr[1], tr[2]];
  } else {
    s.travel = null;
    const fwd = Number(input.forward) || 0, side = Number(input.strafe) || 0, v = Number(input.speed) || 0;
    if (Math.hypot(fwd, side) > 1e-3 && v > 0.05 && grounded && finite(v)) {
      const d = norm([side, fwd, 0]);
      dist = Math.min(v, GAIT_LIMITS.placed) * dt;
      dx = d[0] * dist * uH; dy = d[1] * dist * uH;
    }
  }
  s.speed = ease(s.speed, dt > 0 ? dist / dt : s.speed, GAIT_EASE.speed, dt);
  if (!finite(s.speed)) s.speed = 0;
  const was = s.walking;
  s.walking = grounded && (s.walking ? s.speed > GAIT_LIMITS.off : s.speed > GAIT_LIMITS.on);
  if (dist > 1e-6 && (dx || dy)) {
    const thT = Math.atan2(dx, dy);
    const off = wrapAngle(thT - s.th);
    s.th = !was || Math.abs(off) > GAIT_LIMITS.reverse * RAD ? thT : wrapAngle(s.th + off * (1 - Math.exp(-dt / GAIT_EASE.dir)));
  }
  s.dir = [Math.sin(s.th), Math.cos(s.th)];
  s.move = ease(s.move, s.walking ? 1 : 0, s.walking ? GAIT_EASE.moveIn : GAIT_EASE.moveOut, dt);
  if (!s.walking && s.move < 1e-3) s.move = 0;
  s.run = ease(s.run, s.walking && input.running && !input.sneaking ? 1 : 0, GAIT_EASE.style, dt);
  s.sneak = ease(s.sneak, input.sneaking ? 1 : 0, GAIT_EASE.style, dt);
  const P = blendStyle(s.run, s.sneak, input.kind);
  const shape = strideShape(s, input, body, P);
  const { stride, beta } = shape;
  s.dPhase = s.walking && stride > 1e-6 ? (dist * uH) / stride : 0;
  s.phase = frac(s.phase + s.dPhase);
  const offDeg = Math.abs(s.th) / RAD;
  if (s.back) { if (offDeg < STEER.back - STEER.hyst) s.back = false; } else if (offDeg > STEER.back + STEER.hyst) s.back = true;
  const psiWant = !s.walking ? 0 : s.back
    ? -clamp(wrapAngle(s.th - Math.PI) * STEER.backShare, -STEER.backMax * RAD, STEER.backMax * RAD)
    : -clamp(s.th * STEER.forward, -STEER.max * RAD, STEER.max * RAD);
  s.psi = ease(s.psi, psiWant, GAIT_EASE.steer, dt);
  s.backShare = ease(s.backShare, s.walking && s.back ? 1 : 0, GAIT_EASE.back, dt);
  s.along = ease(s.along, Math.cos(s.th + s.psi), GAIT_EASE.back, dt);
  const accel = dt > 0 ? (s.speed - s.lastSpeed) / dt : 0;
  s.lastSpeed = s.speed;
  if (snap) s.yawRate = 0;
  else if (dt > 0) s.yawRate = ease(s.yawRate, dYaw / dt, 0.1, dt);
  s.lean = ease(s.lean, clamp(accel * 0.012, -0.12, 0.16) * s.move, GAIT_EASE.lean, dt);
  s.bank = ease(s.bank, clamp(s.yawRate * s.speed * 0.022, -0.2, 0.2) * s.move, GAIT_EASE.lean, dt);
  s.t += dt;
  if (placed || snap) s.slope = [0, 0];
  else {
    if (dYaw) s.slope = rotXY(s.slope, dYaw);
    const run = Math.hypot(dx, dy);
    if (grounded && run > 1e-4) {
      const along = clamp(dz / run, -GAIT_LIMITS.slope, GAIT_LIMITS.slope);
      const ux = dx / run, uy = dy / run;
      const g = s.slope[0] * ux + s.slope[1] * uy;
      const k = 1 - Math.exp(-dt / GAIT_EASE.slope);
      const ng = g + (along - g) * k;
      s.slope = [s.slope[0] + ux * (ng - g), s.slope[1] + uy * (ng - g)];
    }
  }
  s.yaw = yaw;
  s.carried = carried;
  stepFeet(s, input, body, P, shape, { dt, dx, dy, dz, dYaw, snap: snap || placed || s.air, was });
  s.air = !grounded;
  const catchUp = s.lag * (1 - Math.exp(-s.dPhase / GAIT_EASE.phase));
  s.lag -= clamp(catchUp, -0.5 * s.dPhase, 0.5 * s.dPhase);
  if (!s.walking && s.move === 0) s.lag = 0;
  s.shown = frac(s.phase + s.lag);
  return s;
}

function stepFeet(s, input, body, P, shape, { dt, dx, dy, dz, dYaw, snap, was }) {
  const L = body.leg;
  const { beta, stride, shift, m, frShare } = shape;
  const spots = { L: standingSpot('L', body, s.stance), R: standingSpot('R', body, s.stance) };
  if (snap || !s.feet.L || !s.feet.R) {
    for (const side of SIDES) s.feet[side] = plantAt(s, spots[side].p, spots[side].yaw);
  } else {
    const carry = (p) => { const q = rotXY([p[0] - dx, p[1] - dy], dYaw); return [q[0], q[1], p[2] - dz]; };
    for (const side of SIDES) {
      const f = s.feet[side];
      if (!f.swing) { f.p = carry(f.p); f.yaw += dYaw; continue; }
      f.swing.from = carry(f.swing.from); f.swing.fromYaw += dYaw;
      if (f.swing.kind === 'gait') { f.swing.to = carry(f.swing.to); f.swing.toYaw += dYaw; }
    }
  }
  const A = (stride * beta) / 2;
  const hf = [-Math.sin(s.psi), Math.cos(s.psi)], hr = [Math.cos(s.psi), Math.sin(s.psi)];
  const d = s.dir;
  const hd = hr[0] * d[0] + hr[1] * d[1];
  const across = 1 / Math.max(0.5, Math.sqrt(Math.max(0, 1 - hd * hd)));
  const perp = [(hr[0] - hd * d[0]) * across, (hr[1] - hd * d[1]) * across];
  const laneW = body.hipWidth * 0.5 * Math.max(P.width, 0.24);
  const gaitTarget = (side, sw, rate = 1) => {
    const n = [body.restHip[0] + perp[0] * LANE[side] * laneW, body.restHip[1] + perp[1] * LANE[side] * laneW];
    const ahead = ((1 - sw) * (1 - beta) * stride) / rate;
    const turn = s.speed > 0.05 ? -s.yawRate * (ahead / ((s.speed || 1) * (input.unitsPerM || 1))) : 0;
    let ox = 0, oy = 0;
    const N = Math.abs(turn) > 1e-3 ? 6 : 1;
    for (let k = 0; k < N; k++) { const r = rotXY(d, (turn * (k + 0.5)) / N); ox += (r[0] * ahead) / N; oy += (r[1] * ahead) / N; }
    const land = rotXY([n[0] + d[0] * (A + shift) - body.restHip[0], n[1] + d[1] * (A + shift) - body.restHip[1]], turn);
    const x = body.restHip[0] + ox + land[0], y = body.restHip[1] + oy + land[1];
    return { p: [x, y, groundAt(s, x, y)], yaw: s.psi + turn };
  };
  const alongOf = (side, p) => {
    const nx = body.restHip[0] + perp[0] * LANE[side] * laneW, ny = body.restHip[1] + perp[1] * LANE[side] * laneW;
    return (p[0] - nx) * d[0] + (p[1] - ny) * d[1];
  };
  const holdZ = hipPlan(s, body, P, shape).low - 0.06 * L - body.ankle;
  const outOfPlan = (side, p) => {
    const r = (body.legs?.[side] ?? L) * 0.992, h = holdZ - p[2];
    const jx = body.restHip[0] + hr[0] * LANE[side] * body.hipWidth * 0.5, jy = body.restHip[1] + hr[1] * LANE[side] * body.hipWidth * 0.5;
    return Math.hypot(p[0] - jx, p[1] - jy) > Math.sqrt(Math.max(0, r * r - h * h));
  };
  const reachMin = Math.min(body.legs?.L ?? L, body.legs?.R ?? L) * 0.992;
  const farReach = Math.sqrt(Math.max(0, reachMin * reachMin - (HIP_FLOOR * L) ** 2));
  const standTarget = (side) => ({ p: [spots[side].p[0], spots[side].p[1], groundAt(s, spots[side].p[0], spots[side].p[1])], yaw: spots[side].yaw });
  const stepTime = () => s.stepTime ?? clamp(TURN.time / (1 + Math.abs(s.yawRate) / 3), TURN.minTime, TURN.time);
  const fly = (f, kind, s0 = 0, dur = 0) => {
    const prior = f.swing;
    const here = prior ? flightAt(prior) : { p: f.p, yaw: f.yaw };
    const carry = !f.cur ? null : { pitch: f.cur.pitch, lift: f.swing || kind === 'step' ? f.cur.lift : null, s: s0 };
    f.swing = { kind, from: here.p, fromYaw: here.yaw, to: here.p, toYaw: here.yaw, s0, s: s0, t: 0, dur: dur || stepTime(), carry };
    if (kind === 'gait') f.swing.held = prior?.held ?? [here.p[0], here.p[1]];
  };
  const resync = (to) => { s.lag = wrapHalf(s.lag + s.phase - to); s.phase = to; };
  if (s.walking && !was) {
    const back = (side) => { const f = s.feet[side], p = f.swing ? flightAt(f.swing).p : f.p; return (p[0] - body.restHip[0]) * d[0] + (p[1] - body.restHip[1]) * d[1]; };
    const lead = back('L') <= back('R') ? 'L' : 'R';
    s.phase = frac(0.5 * beta + OFFSET[lead === 'L' ? 'R' : 'L']);
    s.lag = 0;
  }
  const swingTime = s.speed > 0.05 && stride > 0 ? ((1 - beta) * stride) / (s.speed * (input.unitsPerM || 1)) : TURN.time;
  for (const side of SIDES) {
    const f = s.feet[side];
    const clock = frac(s.phase - OFFSET[side]);
    if (!f.swing) f.u = s.walking && was && f.u != null ? frac(f.u + s.dPhase) : clock;
    const u = f.swing ? clock : f.u;
    const prevU = f.lastU ?? u;
    f.lastU = u;
    if (s.walking) {
      if (!f.swing && u < beta) f.armed = true;
      if (!was) f.armed = true;
      const along = !f.swing && s.walking ? alongOf(side, f.p) : 0;
      const behind = !f.swing && s.walking && (along < shift - (A + 0.1 * L) || (along < 0 && outOfPlan(side, f.p)) || Math.hypot(f.p[0] - body.restHip[0], f.p[1] - body.restHip[1]) > farReach);
      if (behind) {
        const other = s.feet[side === 'L' ? 'R' : 'L'];
        if (!other.swing) resync(frac(beta + OFFSET[side] + 1e-4));
        f.armed = true;
      }
      const lifts = !f.swing && f.armed && (u >= beta || behind);
      let lifted = false;
      if (lifts || (f.swing && f.swing.kind === 'step' && u >= beta)) {
        const late = u >= beta && !(prevU < beta);
        fly(f, 'gait', late ? clamp01((u - beta) / Math.max(1e-3, 1 - beta)) : 0);
        if (!late) f.swing.s = u >= beta ? clamp01((u - beta) / Math.max(1e-3, 1 - beta)) : 0;
        f.armed = false;
        lifted = true;
      }
      if (f.swing && f.swing.kind === 'gait') {
        const sw = f.swing;
        const byGround = s.dPhase / Math.max(1e-3, 1 - beta), byClock = dt / FLIGHT_MAX;
        const gap = wrapHalf(u - (beta + (sw.s + (lifted ? 0 : byGround)) * (1 - beta)));
        sw.rate = byGround > byClock ? 1 + clamp(4 * gap, -0.25, 0.25) : 1;
        const inc = lifted ? 0 : Math.max(byGround * sw.rate, byClock);
        let t = gaitTarget(side, Math.min(1, sw.s + inc), sw.rate);
        const here = flightAt(sw).p;
        const leap = Math.max(LEAP * L, 0.3 * Math.hypot(t.p[0] - here[0], t.p[1] - here[1]));
        const leapt = Math.hypot(t.p[0] - sw.to[0], t.p[1] - sw.to[1]) > leap && sw.s + inc > sw.s0;
        if (leapt) { rebase(sw, t.p, stride); if (f.cur) sw.carry = { pitch: f.cur.pitch, lift: f.cur.lift, s: sw.s }; }
        const sRaw = sw.s + inc;
        sw.s = Math.min(1, sRaw);
        if (leapt) { t = gaitTarget(side, sw.s, sw.rate); sw.to = t.p; sw.toYaw = t.yaw; }
        if (sw.s >= 1) {
          const past = inc > 0 ? (clamp01((sRaw - 1) / inc) * s.dPhase) : 0;
          const n = plantAt(s, sw.to, sw.toYaw);
          n.p = [sw.to[0], sw.to[1], sw.to[2]]; n.lastU = past; n.u = past;
          s.feet[side] = n;
          continue;
        }
        sw.to = t.p; sw.toYaw = t.yaw; sw.m = m;
        sw.bow = clamp(s.yawRate * Math.min(swingTime, FLIGHT_MAX) * (1 - sw.s0), -2.4, 2.4);
      }
    } else if (f.swing && f.swing.kind === 'gait') {
      fly(f, 'step', 0, clamp((1 - flightProgress(f.swing)) * swingTime, 0.08, TURN.time));
    }
  }
  if (!s.walking) settle(s, body, spots, fly);
  for (const side of SIDES) {
    const sw = s.feet[side].swing;
    if (!sw || sw.kind !== 'step') continue;
    const t = standTarget(side);
    if (Math.hypot(t.p[0] - sw.to[0], t.p[1] - sw.to[1]) > LEAP * L && sw.t > 0) rebase(sw);
    sw.to = t.p; sw.toYaw = t.yaw;
    sw.t += dt;
    if (sw.t >= sw.dur) { const n = plantAt(s, t.p, t.yaw); n.p = t.p; s.feet[side] = n; }
  }
  const hfv = [hf[0], hf[1], 0];
  const c = clamp(s.along, -1, 1);
  const bias = P.footBias * RAD;
  const gaitLift = (sg) => lerp(P.lift, P.liftFast, frShare) * L * Math.min(1, stride / (L * 0.6)) * liftProfile(sg);
  const gradeAlong = (yaw) => -s.slope[0] * Math.sin(yaw) + s.slope[1] * Math.cos(yaw);
  const level = (g, push, strike) => -Math.atan(g) * Math.abs(c) * (c * g > 0 ? push : strike);
  const back = c < 0, ac = Math.abs(c);
  const toeEnd = (qe) => (qe > P.flat[1] ? smooth((qe - P.flat[1]) / (1 - P.flat[1])) : 0), heelEnd = (qe) => (qe < P.flat[0] ? 1 - smooth(qe / P.flat[0]) : 0);
  const leaveEnd = (se) => (se < 0.45 ? 1 - smooth(se / 0.45) : 0), landEnd = (se) => (se >= 0.45 ? smooth((se - 0.45) / 0.55) : 0);
  for (const side of SIDES) {
    const f = s.feet[side];
    const sw = f.swing;
    if (!sw) {
      const u = f.u ?? frac(s.phase - OFFSET[side]);
      const q = s.walking ? Math.min(1, u / Math.max(1e-3, beta)) : null;
      const g = gradeAlong(f.yaw);
      const qe = q == null ? 0 : back ? 1 - q : q;
      const ends = q == null ? 0 : back ? level(g, heelEnd(qe), toeEnd(qe)) : level(g, toeEnd(qe), heelEnd(qe));
      f.cur = { p: f.p, yaw: f.yaw, planted: true, sp: 0, kind: null, pitch: (q != null ? stancePitch(qe, P) * ac * RAD + ends : 0) * s.move + bias, grade: g, lift: 0 };
      continue;
    }
    const sp = flightProgress(sw);
    const at = flightAt(sw, sp);
    let pitch, lift;
    const g = gradeAlong(at.yaw);
    if (sw.kind === 'gait') {
      const se = back ? 1 - sw.s : sw.s;
      const ends = back ? level(g, landEnd(se), leaveEnd(se)) : level(g, leaveEnd(se), landEnd(se));
      pitch = (swingPitch(se, P) * ac * RAD + ends) + bias;
      lift = gaitLift(sw.s);
      if (sw.carry) {
        const k = smooth(clamp01(((sw.s - sw.carry.s) / Math.max(1e-3, 1 - sw.carry.s)) * 2));
        pitch = lerp(sw.carry.pitch, pitch, k);
        if (sw.carry.lift != null) lift = lerp(sw.carry.lift, lift, k);
      }
    } else {
      const k = minJerk(sp);
      const own = TURN.lift * L * Math.sin(Math.PI * sp);
      pitch = sw.carry ? lerp(sw.carry.pitch, bias, k) : bias;
      lift = sw.carry?.lift != null ? Math.max(sw.carry.lift * (1 - k), own) : own;
    }
    f.cur = { p: at.p, yaw: at.yaw, planted: false, sp, kind: sw.kind, pitch, grade: g, lift, held: sw.held ?? null };
  }
}

function settle(s, body, spots, fly) {
  const L = body.leg;
  const off = (side) => {
    const f = s.feet[side];
    if (f.swing) return { d: 0, a: 0 };
    const t = spots[side];
    return { d: Math.hypot(f.p[0] - t.p[0], f.p[1] - t.p[1]) / L, a: Math.abs(wrapAngle(f.yaw - t.yaw)) / RAD };
  };
  const need = (o, k = 1) => o.d > TURN.dist * k || o.a > TURN.step * k;
  const o = { L: off('L'), R: off('R') };
  const flying = SIDES.filter((side) => s.feet[side].swing);
  if (flying.length) {
    for (const side of SIDES) if (!s.feet[side].swing && o[side].a > TURN.max) fly(s.feet[side], 'step');
    return;
  }
  const score = (side) => o[side].d / TURN.dist + o[side].a / TURN.step;
  const turnSide = s.yawRate > 0.05 ? 'R' : s.yawRate < -0.05 ? 'L' : null;
  let pick = null;
  if (need(o.L) || need(o.R)) pick = turnSide && need(o[turnSide]) ? turnSide : score('L') >= score('R') ? 'L' : 'R';
  else {
    const last = s.lastStepped;
    const other = last === 'L' ? 'R' : last === 'R' ? 'L' : null;
    if (other && need(o[other], 0.5)) pick = other;
  }
  if (pick) { fly(s.feet[pick], 'step'); s.lastStepped = pick; }
  else if (!need(o.L, 0.5) && !need(o.R, 0.5)) s.lastStepped = null;
}

function hipPlan(s, body, P, shape) {
  const L = body.leg;
  const { stride, beta, frShare, carriage, reach, sweep, grade, shift } = shape;
  const standH = lerp(STAND.height, STAND.sneak.height, s.sneak) * P.standHeight;
  const hipH0 = body.ankle + lerp(standH, carriage, s.move) * L;
  const halfStance = (stride * beta) / 2 + flightOvershoot(1 - beta, P.land) * stride;
  const ac = Math.min(1, Math.abs(s.along)) * s.move, way = s.along < 0 ? -1 : 1;
  const strikeP = (way > 0 ? P.heel : -P.toeOff) * ac * RAD, pushP = (way > 0 ? -P.toeOff : P.heel) * ac * RAD;
  const top = (x, z, pitch) => {
    const pl = footPlace([0, x * way], pitch, [0, 1], body);
    return z + pl.at[2] + Math.sqrt(Math.max(0, reach * reach - Math.min(reach * 0.98, Math.abs(pl.at[1])) ** 2));
  };
  const ends = (half) => Math.min(top(half + shift, grade * (half + shift), strikeP), top(shift - half, grade * (shift - half), pushP));
  const need = Math.max(0, hipH0 - ends(halfStance));
  const sink = P.bob * L * Math.min(1, frShare * 2 + 0.3);
  const dip = Math.max(sink, need * 1.04);
  const runH = Math.min(hipH0, ends(Math.min(sweep, (stride * beta) / 2)));
  const low = lerp(hipH0 - s.move * dip, lerp(hipH0, runH, s.move) - s.move * sink, P.run);
  return { hipH0, dip, sink, runH, low };
}

export function gaitPose(state, input, body) {
  const s = state;
  const P = blendStyle(s.run, s.sneak, input.kind);
  const L = body.leg;
  const shape = strideShape(s, input, body, P);
  const { stride, beta, frShare } = shape;
  const move = s.move;
  const phi = s.shown;
  const psi = s.psi;
  const hf = [-Math.sin(psi), Math.cos(psi), 0];
  const hr = [Math.cos(psi), Math.sin(psi), 0];
  const d = [s.dir[0], s.dir[1], 0];
  const c = clamp(s.along, -1, 1);
  const stance = s.stance;
  const feet = {};
  let twist = 0;
  for (const side of SIDES) {
    const cur = s.feet[side]?.cur;
    if (!cur) { feet[side] = null; continue; }
    const pl = footPlaceOn(cur.p, cur.pitch, cur.grade, [-Math.sin(cur.yaw), Math.cos(cur.yaw)], body);
    feet[side] = { at: [pl.at[0], pl.at[1], pl.at[2] + cur.lift], toe: pl.toe, up: pl.up, stance: cur.planted, lift: cur.lift, sp: cur.sp, kind: cur.kind, held: cur.held ?? null };
    twist += cur.yaw - (stance?.toe?.[side] ?? 0) * RAD;
  }
  const idle = 1 - move;
  const sway = P.sway * L * move;
  const midL = beta / 2;
  const swayWave = -Math.cos(2 * Math.PI * (phi - midL));
  const listWave = Math.cos(2 * Math.PI * (phi - midL));
  const walkBob = (1 - Math.cos(4 * Math.PI * (phi - midL))) / 2;
  const { hipH0, dip, sink, runH } = hipPlan(s, body, P, shape);
  const walkDip = dip * walkBob;
  let runZ = 0;
  if (beta < 0.5) {
    const u = (side) => frac(phi - OFFSET[side]);
    const standing = SIDES.find((side) => u(side) < beta);
    if (standing) runZ = -sink * Math.sin((Math.PI * u(standing)) / beta);
    else {
      const flight = 0.5 - beta, tau = clamp01((frac(phi - beta) % 0.5) / flight);
      runZ = ((Math.PI * sink * flight) / (4 * beta)) * 4 * tau * (1 - tau);
    }
  } else runZ = -sink * (1 + Math.cos(4 * Math.PI * (phi - midL))) / 2;
  const hipH = lerp(hipH0 - move * walkDip, lerp(hipH0, runH, move) + move * runZ, P.run);
  const breathT = (2 * Math.PI * s.t) / STAND.breath, shiftT = (2 * Math.PI * s.t) / STAND.shift;
  const hipShift = stance?.hipShift ? [stance.hipShift[0] * L, stance.hipShift[1] * L] : [0, 0];
  const hipXY = [
    body.restHip[0] + hr[0] * sway * swayWave + idle * STAND.shiftSway * L * Math.sin(shiftT) + hipShift[0] * idle,
    body.restHip[1] + hr[1] * sway * swayWave + hipShift[1] * idle,
  ];
  const hipYaw = psi * move + (twist * 0.25 + (stance?.hipYaw ?? 0) * RAD) * idle - P.hipYaw * RAD * Math.cos(2 * Math.PI * phi) * move * c;
  const hipRoll = P.hipList * RAD * listWave * move + idle * STAND.shiftList * RAD * Math.sin(shiftT);
  const standTilt = lerp(STAND.hipTilt, STAND.sneak.hipTilt, s.sneak) * P.standTilt;
  const hipPitch = lerp(standTilt, P.hipTilt, move) * RAD + P.hipTiltWave * RAD * Math.cos(4 * Math.PI * (phi - midL)) * move;
  let hipZ = hipH;
  const limits = { planned: hipH, L: Infinity, R: Infinity };
  for (const side of SIDES) {
    const f = feet[side];
    if (!f) continue;
    const sign = LANE[side];
    const jx = hipXY[0] + Math.cos(hipYaw) * sign * body.hipWidth * 0.5, jy = hipXY[1] + Math.sin(hipYaw) * sign * body.hipWidth * 0.5;
    const dz = -sign * Math.sin(hipRoll) * body.hipWidth * 0.5;
    const reach = (body.legs?.[side] ?? L) * 0.992;
    const leaving = !f.stance && f.kind === 'gait' && f.sp < 0.35;
    const dxy = Math.min(Math.hypot(f.at[0] - jx, f.at[1] - jy), leaving && f.held ? Math.hypot(f.held[0] - jx, f.held[1] - jy) : Infinity);
    const inReach = f.stance || leaving ? 1 : smooth(clamp01((Math.sqrt(Math.max(0, reach * reach - (HIP_FLOOR * L) ** 2)) - dxy) / (0.2 * L)));
    const top = Math.max(f.at[2] - (leaving ? 0 : f.lift) + Math.sqrt(Math.max(0, reach * reach - dxy * dxy)) - dz, body.ankle + HIP_FLOOR * L);
    const holds = inReach * (f.stance || f.kind !== 'gait' ? 1 : Math.max(1 - smooth(clamp01(f.sp / 0.25)), smooth(clamp01((f.sp - 0.45) / 0.45))));
    if (!(holds > 0)) continue;
    limits[side] = top;
    hipZ = lerp(hipZ, smin(hipZ, top, L * 0.04), holds);
  }
  const breath = Math.sin(breathT) * STAND.breathPitch * RAD * idle;
  const chestYaw = P.chestYaw * RAD * Math.cos(2 * Math.PI * phi) * move * c;
  const counterDrop = -P.chestRoll * RAD * listWave * move;
  const chestRoll = counterDrop + s.bank;
  const standLean = lerp(STAND.lean, STAND.sneak.lean, s.sneak) * P.standLean;
  const chestPitch = lerp(standLean, P.lean, move) * RAD + s.lean - breath + (stance?.lean ?? 0) * RAD * idle;
  const swing = (P.arm.swing * RAD * Math.cos(2 * Math.PI * phi)) * move * (1 - 2 * s.backShare);
  return {
    move, phase: phi, duty: beta, stride, frShare, run: P.run, sneak: P.sneak, back: s.back, speed: s.speed,
    hip: { at: [hipXY[0], hipXY[1], hipZ], yaw: hipYaw, roll: hipRoll, pitch: hipPitch, limits },
    chest: { yaw: chestYaw, roll: chestRoll, pitch: chestPitch, breath: Math.sin(breathT) * idle, wave: { yaw: chestYaw, roll: counterDrop } },
    feet,
    arm: { swing, bias: P.arm.bias * RAD * move, elbow: P.arm.elbow, abduct: P.arm.abduct * RAD, phase: phi },
  };
}

const LEAP = 0.12;

const FLIGHT_MAX = 0.45;

const HIP_FLOOR = 0.62;

function smin(a, b, k) {
  const hh = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - hh * hh * k * 0.25;
}
