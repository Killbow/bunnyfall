// Hand, foot, elbow, knee, and lean targets for the body on a climb, in world meters.
import { PARKOUR_BODY_RADIUS, PARKOUR_HANG_GAP, PARKOUR_UP_GAP, PARKOUR_HANG_DROP, PARKOUR_GRIP_LOW, PARKOUR_LIP_FOLLOW } from './parkour.js';
import { FEEL } from './climbFeel.js';

export const POSE = Object.freeze({
  FACE_BACK: PARKOUR_BODY_RADIUS + PARKOUR_HANG_GAP,
  IN_TAU: 0.05,
  OUT_TAU: 0.12,
  LIMB_TAU: 0.06,
  HANDS_APART: 0.42,
  WRIST_OVER: 0.025,
  WRIST_OUT: 0.035,
  FINGER_DIP: 0.18,
  LIP_CURL: 0.35,
  FACE_CURL: 0.75,
  SHRUG_HANG: 0.4,
  SHRUG_CLIMB: 0.25,
  SHIMMY_REACH: 0.8,
  SHIMMY_FOOT_REACH: 0.6,
  HAND_LIFT: 0.06,
  HAND_AWAY: 0.05,
  HANG_IN: 0.07,
  HANG_FIT_DOWN: 0.16,
  FLOOR_CLEAR: 0.02,
  HANG_FIT_UP: 0.06,
  HANG_LEAN: 0.06,
  HANG_LEG: 0.96,
  HANG_FOOT_UP: 0.14,
  HANG_FOOT_OFF: 0.11,
  FEET_APART: 0.24,
  SWAY_PITCH: 0.025,
  SWAY_ROLL: 0.02,
  SWING_BASE: 0.05,
  SWING_PER_SPEED: 0.035,
  SWING_MAX: 0.32,
  SWING_HZ: 0.9,
  SWING_DAMP: 2.4,
  CLIMB_DUTY: 0.62,
  CLIMB_HAND_UP: 1.88,
  CLIMB_HAND_APART: 0.46,
  CLIMB_FOOT_UP: 0.34,
  CLIMB_FOOT_APART: 0.28,
  CLIMB_FOOT_OFF: 0.1,
  CLIMB_IN: 0.13,
  CLIMB_LEAN: 0.1,
  SETTLE_S: 0.18,
  MANTLE_PRESS_IN: 0.07,
  MANTLE_KNEE_IN: 0.22,
  MANTLE_LEAN: 0.5,
  VAULT_TUCK: 0.12,
  LEAP_REACH_FIT: 0.12,
  FLIGHT_REACH: 0.55,
  FLIGHT_RISE: 0.45,
  WALLRUN_STEP: 0.45,
  LOWER_SQUAT: 0.35,
  TREMBLE: 0.012,
  TREMBLE_HZ: 9,
  SCRABBLE: 0.09,
  SCRABBLE_HZ: 1.7,
});

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => { const u = clamp01(t); return u * u * (3 - 2 * u); };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));
const ease = (v, target, tau, dt) => (tau > 0 ? v + (target - v) * (1 - Math.exp(-dt / tau)) : target);
const UP = Object.freeze([0, 1, 0]);

export function wallFrame(normal) {
  const n = norm([normal[0], 0, normal[2]]);
  return { n, into: [-n[0], 0, -n[2]], right: [-n[2], 0, n[0]] };
}

export function gait(travel, stride, phase, duty) {
  const u = travel / stride - phase;
  const k = Math.floor(u), f = u - k;
  const centre = (k + duty / 2 + phase) * stride;
  if (f < duty) return { anchor: centre, next: centre, swing: 0, cycle: k };
  return { anchor: centre, next: centre + stride, swing: (f - duty) / (1 - duty), cycle: k };
}

export function shimmyGait(travel, stride, centre, width) {
  const v = (travel - (centre - width / 2)) / stride;
  const j = Math.floor(v), f = (v - j) * stride;
  if (f < width) return { anchor: j * stride, next: (j + 1) * stride, swing: f / width, cycle: j };
  return { anchor: (j + 1) * stride, next: (j + 1) * stride, swing: 0, cycle: j };
}

const limb = () => ({ at: null, fingers: null, palm: null, toe: null, w: 0, pole: null, curl: 0, shrug: 0, hang: 0, releaseAtReach: false });

export class ClimbPose {
  constructor() { this.reset(); }

  reset() {
    this.t = 0;
    this.w = 0;
    this.prevFeet = null;
    this.travel = 0;
    this.travelDir = [0, 1];
    this.still = 0;
    this.swingAmp = 0; this.swingT = 0;
    this.moveRef = null;
    this.moveStart = null;
    this.lastNormal = null;
    this.settle = { L: { v: 0, prev: 0, cycle: null }, R: { v: 0, prev: 0, cycle: null }, FL: { v: 0, prev: 0, cycle: null }, FR: { v: 0, prev: 0, cycle: null } };
    this.hangLip = null;
    this.prevMode = null;
    this.cur = { L: null, R: null, FL: null, FR: null };
    this.out = {
      w: 0, offset: [0, 0, 0], fit: { up: 0, down: 0 }, swing: { pitch: 0, roll: 0 }, lean: { pitch: 0, roll: 0 },
      hands: { L: limb(), R: limb() }, feet: { L: limb(), R: limb() }, look: { at: null, w: 0 }, frame: null,
    };
  }

  update(dt, c) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.t += dt;
    const out = this.out;
    const on = !!(c && (c.mode || c.move || c.flight));
    this.w = ease(this.w, on ? 1 : 0, on ? POSE.IN_TAU : POSE.OUT_TAU, dt);
    if (this.w < 1e-3 && !on) { this.reset(); return this.out; }
    out.w = this.w;
    if (!on) {
      if (this.moveRef?.kind === 'vault' && this.moveRef.t >= 1) {
        out.hands.L.w = 0;
        out.hands.R.w = 0;
      }
      return out;
    }
    const feet = c.track ?? c.feet;
    let d = [0, 0, 0];
    if (this.prevFeet) d = sub(feet, this.prevFeet);
    if (Math.hypot(d[0], d[1], d[2]) > 1) d = [0, 0, 0];
    this.prevFeet = [feet[0], feet[1], feet[2]];
    for (const s of ['L', 'R']) { Object.assign(out.hands[s], limb()); Object.assign(out.feet[s], limb()); }
    out.offset = [0, 0, 0]; out.fit = { up: 0, down: 0 }; out.swing = { pitch: 0, roll: 0 }; out.lean = { pitch: 0, roll: 0 };
    out.look = { at: null, w: 0 };
    this.swingT += dt;
    const ring = this.swingAmp * Math.exp(-POSE.SWING_DAMP * this.swingT) * Math.cos(2 * Math.PI * POSE.SWING_HZ * this.swingT);
    const mode = c.move ? 'move' : c.mode ?? (c.flight ? 'flight' : null);
    if (c.move) this._move(dt, c, d);
    else if (c.mode === 'hang') this._hang(dt, c, d);
    else if (c.mode === 'climb') this._climb(dt, c, d);
    else if (c.flight) this._flight(dt, c);
    if (c.mode === 'hang' || c.move?.hang) out.swing.pitch += ring;
    const fail = c.mode && Number.isFinite(c.grip) ? clamp01((PARKOUR_GRIP_LOW - c.grip) / PARKOUR_GRIP_LOW) : 0;
    if (fail > 0) this._failing(fail);
    this._ease(dt);
    if (!c.move) { this.moveRef = null; this.moveStart = null; }
    if (out.frame) this.lastNormal = out.frame.n;
    this.prevMode = mode;
    return out;
  }

  _lipPoint(c, fr, lipY, along) {
    const back = POSE.FACE_BACK;
    return [c.feet[0] + fr.into[0] * back + fr.right[0] * along, lipY, c.feet[2] + fr.into[2] * back + fr.right[2] * along];
  }

  _handOnLip(h, c, fr, lipY, along, side, lift = 0) {
    const p = this._lipPoint(c, fr, lipY, along);
    h.at = add(p, add(scale(UP, POSE.WRIST_OVER + lift * POSE.HAND_LIFT), scale(fr.n, POSE.WRIST_OUT + lift * POSE.HAND_AWAY)));
    h.fingers = norm(add(fr.into, scale(UP, -POSE.FINGER_DIP)));
    h.palm = [0, -1, 0];
    h.curl = POSE.LIP_CURL * (1 - lift);
    h.shrug = POSE.SHRUG_HANG;
    h.w = 1;
    const lat = side === 'R' ? 1 : -1;
    h.pole = norm(add(add(scale(fr.right, 0.75 * lat), scale(fr.n, 0.45)), scale(UP, -0.25)));
  }

  _hang(dt, c, d) {
    const out = this.out, fr = wallFrame(c.normal);
    out.frame = fr;
    let along = d[0] * fr.right[0] + d[2] * fr.right[2];
    if (this.prevMode !== 'hang' || !(Math.abs(c.lipY - this.hangLip) <= PARKOUR_LIP_FOLLOW)) {
      this.travel = 0; along = 0;
      for (const k of ['L', 'R', 'FL', 'FR']) this.settle[k] = { v: 0, prev: 0, cycle: null };
    }
    this.hangLip = c.lipY;
    this.travel += along;
    const moving = Math.abs(along) > 1e-5;
    this.still = moving ? 0 : this.still + dt;
    const span = FEEL.SHIMMY_SPAN, stride = 2 * span;
    const half = POSE.HANDS_APART / 2;
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      const g = shimmyGait(this.travel, stride, s === 'R' ? span / 2 : 1.5 * span, POSE.SHIMMY_REACH * span);
      const sw = this._settled(s, g, moving, dt);
      const at = lerp(g.anchor, g.next, smooth(sw)) - this.travel;
      this._handOnLip(out.hands[s], c, fr, c.lipY, at + lat * half, s, bump(sw, 0, 1));
    }
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      const g = shimmyGait(this.travel, stride, s === 'R' ? 0.65 * span : 1.65 * span, POSE.SHIMMY_FOOT_REACH * span);
      const sw = this._settled('F' + s, g, moving, dt);
      const at = lerp(g.anchor, g.next, smooth(sw)) - this.travel + lat * POSE.FEET_APART / 2;
      this._footOnFace(out.feet[s], c, fr, at, c.feet[1] + POSE.HANG_FOOT_UP + 0.05 * bump(sw, 0, 1), POSE.HANG_FOOT_OFF + 0.06 * bump(sw, 0, 1), lat);
      out.feet[s].hang = POSE.HANG_LEG - 0.06 * bump(sw, 0, 1);
    }
    out.offset = scale(fr.into, POSE.HANG_IN);
    out.fit = { up: POSE.HANG_FIT_UP, down: this._fitDown(c) };
    out.lean.pitch = POSE.HANG_LEAN;
    if (!moving) {
      out.swing.pitch += POSE.SWAY_PITCH * Math.sin(2 * Math.PI * FEEL.SWAY_HZ * 1.37 * this.t);
      out.swing.roll += POSE.SWAY_ROLL * Math.sin(2 * Math.PI * FEEL.SWAY_HZ * this.t);
    } else {
      out.swing.roll += 0.04 * Math.sign(along) * Math.abs(Math.sin(Math.PI * this.travel / FEEL.SHIMMY_SPAN));
    }
    out.look = { at: this._lipPoint(c, fr, c.lipY, 0), w: 0.6 };
  }

  _fitDown(c, most = POSE.HANG_FIT_DOWN) {
    const gap = Number.isFinite(c.floorGap) ? c.floorGap - POSE.FLOOR_CLEAR : Infinity;
    return Math.max(0, Math.min(most, gap));
  }

  _settled(key, g, moving, dt) {
    const st = this.settle[key], sw = g.swing;
    if (sw <= 0) { st.v = 0; st.cycle = null; return 0; }
    if (st.cycle !== g.cycle) { st.cycle = g.cycle; st.v = sw; st.prev = sw; }
    if (!moving) st.v = st.v >= 0.5 ? Math.min(1, st.v + dt / POSE.SETTLE_S) : Math.max(0, st.v - dt / POSE.SETTLE_S);
    else if (sw >= st.prev) st.v = st.prev < 1 ? st.v + (1 - st.v) * (sw - st.prev) / (1 - st.prev) : sw;
    else st.v = st.prev > 0 ? st.v * sw / st.prev : sw;
    st.prev = sw;
    return st.v;
  }

  _footOnFace(f, c, fr, along, y, off, lat) {
    const back = POSE.FACE_BACK;
    f.at = [c.feet[0] + fr.into[0] * back + fr.right[0] * along + fr.n[0] * off, y, c.feet[2] + fr.into[2] * back + fr.right[2] * along + fr.n[2] * off];
    f.toe = norm(add(fr.into, scale(UP, -0.45)));
    f.pole = norm(add(add(scale(fr.into, 0.9), scale(fr.right, 0.3 * lat)), scale(UP, 0.1)));
    f.hang = 0;
    f.w = 1;
  }

  _climb(dt, c, d) {
    const out = this.out, fr = wallFrame(c.normal);
    out.frame = fr;
    const a = d[0] * fr.right[0] + d[2] * fr.right[2], u = d[1];
    const step = Math.hypot(a, u);
    if (step > 1e-5) { this.travel += step; this.travelDir = [a / step, u / step]; }
    const moving = step > 1e-5;
    this.still = moving ? 0 : this.still + dt;
    const stride = 2 * FEEL.REACH;
    const [ta, tu] = this.travelDir;
    const back = POSE.FACE_BACK;
    const onFace = (alongR, y, off) => [c.feet[0] + fr.into[0] * back + fr.right[0] * alongR + fr.n[0] * off, y, c.feet[2] + fr.into[2] * back + fr.right[2] * alongR + fr.n[2] * off];
    const place = (key, phase, duty, restA, restY) => {
      const g = gait(this.travel, stride, phase, duty);
      const sw = this._settled(key, g, moving, dt);
      const from = g.anchor - this.travel, to = g.next - this.travel;
      const k = smooth(sw);
      const rel = lerp(from, to, k);
      return { along: restA + ta * rel, y: c.feet[1] + restY + tu * rel, lift: bump(sw, 0, 1) };
    };
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      const p = place(s, s === 'R' ? 0 : 0.5, POSE.CLIMB_DUTY, lat * POSE.CLIMB_HAND_APART / 2, POSE.CLIMB_HAND_UP);
      const h = out.hands[s];
      h.at = onFace(p.along, p.y, 0.05 + POSE.HAND_AWAY * 1.6 * p.lift);
      h.fingers = norm(add(UP, scale(fr.into, 0.35)));
      h.palm = fr.into;
      h.curl = POSE.FACE_CURL * (1 - 0.7 * p.lift);
      h.shrug = POSE.SHRUG_CLIMB;
      h.w = 1;
      h.pole = norm(add(add(scale(fr.right, 0.6 * lat), scale(UP, -0.65)), scale(fr.n, 0.3)));
    }
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      const p = place('F' + s, s === 'R' ? 0.75 : 0.25, POSE.CLIMB_DUTY, lat * POSE.CLIMB_FOOT_APART / 2, POSE.CLIMB_FOOT_UP);
      this._footOnFace(out.feet[s], c, fr, p.along, p.y + 0.06 * p.lift, POSE.CLIMB_FOOT_OFF + 0.08 * p.lift, lat);
      out.feet[s].pole = norm(add(add(scale(fr.into, 0.25), scale(fr.right, 0.9 * lat)), scale(UP, 0.25)));
    }
    out.offset = scale(fr.into, POSE.CLIMB_IN);
    out.lean.pitch = POSE.CLIMB_LEAN;
    out.swing.roll = 0.035 * Math.sin(Math.PI * this.travel / FEEL.REACH);
    const hi = out.hands.L.at[1] > out.hands.R.at[1] ? out.hands.L.at : out.hands.R.at;
    out.look = { at: hi, w: 0.5 };
  }

  _move(dt, c, d) {
    const m = c.move, out = this.out;
    if (m !== this.moveRef) {
      this.moveRef = m;
      this.moveStart = { L: this.cur.L?.slice() ?? null, R: this.cur.R?.slice() ?? null, normal: this.lastNormal };
      if (m.kind === 'catch' || m.kind === 'reach' || m.kind === 'leap') {
        this.swingAmp = Math.min(POSE.SWING_MAX, POSE.SWING_BASE + POSE.SWING_PER_SPEED * (m.speed ?? 0));
        this.swingT = 0;
      }
    }
    const t = clamp01(m.t ?? 0);
    switch (m.kind) {
      case 'catch': case 'reach': return this._toHang(c, m, t, 0.45);
      case 'leap': return this._leap(c, m, t);
      case 'corner': return this._corner(c, m, t);
      case 'lower': return this._lower(c, m, t);
      case 'vault': return this._vault(c, m, t);
      case 'wallrun': return this._wallrun(c, m, t);
      case 'mantle': default: return this._mantle(c, m, t);
    }
  }

  _toHang(c, m, t, reach) {
    const out = this.out, fr = wallFrame(m.hang?.normal ?? c.normal ?? [0, 0, 1]);
    out.frame = fr;
    const lipY = m.hang?.lipY ?? c.lipY;
    const end = { ...c, feet: m.to ?? c.feet };
    for (const s of ['L', 'R']) {
      this._handOnLip(out.hands[s], end, fr, lipY, (s === 'R' ? 1 : -1) * POSE.HANDS_APART / 2, s);
      out.hands[s].w = smooth(t / reach) * 0.5 + 0.5;
    }
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      this._footOnFace(out.feet[s], end, fr, lat * POSE.FEET_APART / 2, c.feet[1] + POSE.HANG_FOOT_UP, POSE.HANG_FOOT_OFF + 0.15 * (1 - t), lat);
      out.feet[s].w = smooth(t);
    }
    out.offset = scale(fr.into, POSE.HANG_IN * t);
    out.fit = { up: POSE.HANG_FIT_UP, down: this._fitDown(c) };
    out.lean.pitch = POSE.HANG_LEAN;
    out.look = { at: this._lipPoint(end, fr, lipY, 0), w: 0.6 };
  }

  _edgeOf(m) {
    const into = norm([m.to[0] - m.up[0], 0, m.to[2] - m.up[2]]);
    const n = [-into[0], 0, -into[2]];
    const back = PARKOUR_BODY_RADIUS + PARKOUR_UP_GAP;
    const y = m.up[1] - PARKOUR_UP_GAP;
    return { fr: wallFrame(n), y, at: [m.up[0] + into[0] * back, y, m.up[2] + into[2] * back] };
  }

  _mantle(c, m, t) {
    const out = this.out;
    if (!m.up || !m.to) return;
    const { fr, y, at: edge } = this._edgeOf(m);
    out.frame = fr;
    const split = clamp01(m.split ?? 0.5);
    const over = t <= split ? 0 : (t - split) / Math.max(1e-6, 1 - split);
    const clamber = !!m.exit;
    const half = POSE.HANDS_APART / 2;
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      const h = out.hands[s];
      const grip = add(edge, scale(fr.right, lat * half));
      const press = add(add(edge, scale(fr.into, POSE.MANTLE_PRESS_IN)), scale(fr.right, lat * half * 1.1));
      const k = smooth(over / 0.35);
      h.at = add(lerp3(add(grip, scale(fr.n, POSE.WRIST_OUT)), press, k), scale(UP, POSE.WRIST_OVER));
      h.fingers = norm(add(fr.into, scale(UP, -POSE.FINGER_DIP * (1 - k))));
      h.palm = [0, -1, 0];
      h.curl = POSE.LIP_CURL * (1 - k);
      h.shrug = POSE.SHRUG_HANG * (1 - smooth(over));
      h.pole = norm(add(add(scale(fr.right, 0.7 * lat), scale(fr.n, 0.5 + 0.4 * k)), scale(UP, 0.2 * k - 0.2)));
      const take = this.moveStart?.[s] ? 1 : smooth(t / Math.max(0.08, split * 0.4));
      const letGo = clamber ? 1 - smooth((over - 0.45) / 0.3) : 1 - smooth((over - 0.6) / 0.35);
      h.w = take * letGo;
    }
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1, lead = s === 'R';
      const f = out.feet[s];
      if (t <= split) {
        const rise = t / Math.max(1e-6, split);
        const step = Math.abs(Math.sin(Math.PI * (rise * 2 + (lead ? 0 : 0.5))));
        this._footOnFace(f, c, fr, lat * POSE.FEET_APART / 2, c.feet[1] + 0.25 + 0.15 * step, POSE.HANG_FOOT_OFF + 0.05 * step, lat);
        f.w = 0.85;
      } else {
        const k = smooth((over - (lead ? 0.05 : 0.45)) / 0.4);
        const onTop = add(add(edge, scale(fr.into, POSE.MANTLE_KNEE_IN + (lead ? 0 : 0.1))), add(scale(fr.right, lat * POSE.FEET_APART / 2), scale(UP, 0.1)));
        this._footOnFace(f, c, fr, lat * POSE.FEET_APART / 2, c.feet[1] + 0.25, POSE.HANG_FOOT_OFF, lat);
        f.at = lerp3(f.at, onTop, k);
        f.toe = norm(lerp3(f.toe, add(fr.into, scale(UP, -0.1)), k));
        f.pole = norm(lerp3(f.pole, add(fr.into, scale(UP, 0.6)), k));
        f.w = (1 - smooth((over - 0.75) / 0.25)) * 0.9;
      }
    }
    out.offset = scale(fr.into, POSE.HANG_IN * (1 - smooth(over)));
    out.fit = { up: 0.04, down: t < split ? this._fitDown(c) * (1 - t / split) : 0 };
    const crest = t <= split ? smooth((t / Math.max(1e-6, split) - 0.6) / 0.4) * 0.5 : 0.5 + 0.5 * bump(over, 0, 1.15);
    out.lean.pitch = POSE.HANG_LEAN + POSE.MANTLE_LEAN * crest * (1 - smooth((over - 0.7) / 0.3));
    out.look = { at: add(edge, scale(fr.into, 0.6 * smooth(over))), w: 0.5 * (1 - smooth(over)) };
  }

  _vault(c, m, t) {
    const out = this.out;
    if (!m.up || !m.to) return;
    const { fr, y, at: edge } = this._edgeOf(m);
    out.frame = fr;
    const half = POSE.HANDS_APART / 2 * 0.9;
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      const h = out.hands[s];
      h.at = add(add(edge, scale(fr.into, 0.08)), add(scale(fr.right, lat * half), scale(UP, POSE.WRIST_OVER)));
      h.fingers = norm(add(fr.into, scale(fr.right, 0.2 * lat)));
      h.palm = [0, -1, 0];
      h.curl = 0.15;
      h.pole = norm(add(scale(fr.n, 0.8), scale(fr.right, 0.3 * lat)));
      h.w = smooth(t / 0.12) * (1 - smooth((t - 0.55) / 0.25));
      h.releaseAtReach = true;
    }
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      const f = out.feet[s];
      const tuck = bump(t, 0.12, 0.92);
      f.at = add(c.feet, add(add(scale(fr.into, 0.18 * tuck), scale(fr.right, lat * 0.13)), scale(UP, 0.12 + POSE.VAULT_TUCK * 4 * tuck)));
      f.toe = norm(add(fr.into, scale(UP, -0.35)));
      f.pole = norm(add(fr.into, scale(UP, 0.9)));
      f.w = tuck;
    }
    out.lean.pitch = 0.45 * bump(t, 0, 1);
    out.look = { at: add(edge, scale(fr.into, 1.2)), w: 0.4 };
  }

  _lower(c, m, t) {
    const out = this.out;
    const fr = wallFrame(m.hang?.normal ?? c.normal ?? [0, 0, 1]);
    out.frame = fr;
    const lipY = m.hang?.lipY ?? c.lipY;
    const end = { ...c, feet: m.to ?? c.feet };
    const from = m.from ?? c.feet, to = m.to ?? c.feet;
    const k = smooth(t);
    const drawnY = lerp(from[1], to[1], k) - POSE.LOWER_SQUAT * bump(t, 0, 0.55);
    out.offset = add([0, drawnY - c.feet[1], 0], scale(fr.into, POSE.HANG_IN * smooth((t - 0.5) / 0.5)));
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      this._handOnLip(out.hands[s], end, fr, lipY, lat * POSE.HANDS_APART / 2, s);
      out.hands[s].w = smooth((t - 0.04) / 0.22);
      out.hands[s].shrug = POSE.SHRUG_HANG * smooth((t - 0.4) / 0.4);
    }
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      const f = out.feet[s];
      const planted = add(from, add(scale(fr.right, lat * POSE.FEET_APART / 2), scale(fr.into, 0.05)));
      this._footOnFace(f, { ...c, feet: [c.feet[0], drawnY, c.feet[2]] }, fr, lat * POSE.FEET_APART / 2, drawnY + POSE.HANG_FOOT_UP, POSE.HANG_FOOT_OFF, lat);
      const over = smooth((t - 0.32) / 0.3);
      f.at = lerp3(planted, f.at, over);
      f.toe = norm(lerp3(fr.into, f.toe, over));
      f.pole = norm(lerp3(add(fr.into, scale(UP, 0.4)), f.pole, over));
      f.hang = over >= 1 ? POSE.HANG_LEG : 0;
      f.w = 1;
    }
    out.fit = { up: 0, down: this._fitDown(c) * smooth((t - 0.6) / 0.4) };
    out.lean.pitch = 0.3 * bump(t, 0, 0.7) + POSE.HANG_LEAN * smooth((t - 0.6) / 0.4);
    out.look = { at: add(this._lipPoint(end, fr, lipY, 0), scale(UP, -1.2 * bump(t, 0, 0.8))), w: 0.6 };
  }

  _corner(c, m, t) {
    const out = this.out;
    const was = wallFrame(this.moveStart?.normal ?? c.normal ?? m.hang?.normal ?? [0, 0, 1]);
    const now = wallFrame(m.hang?.normal ?? c.normal ?? [0, 0, 1]);
    out.frame = now;
    const lipY = m.hang?.lipY ?? c.lipY;
    const toward = m.up ?? m.to;
    const way = toward && m.from ? Math.sign((toward[0] - m.from[0]) * was.right[0] + (toward[2] - m.from[2]) * was.right[2]) || 1 : 1;
    const startC = { ...c, feet: m.from ?? c.feet }, endC = { ...c, feet: m.to ?? c.feet };
    const half = POSE.HANDS_APART / 2;
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      const lead = lat === way;
      const k = smooth(lead ? t / 0.55 : (t - 0.4) / 0.6);
      const a = {}, b = {};
      this._handOnLip(Object.assign(a, limb()), startC, was, lipY, lat * half, s);
      this._handOnLip(Object.assign(b, limb()), endC, now, lipY, lat * half, s);
      const h = out.hands[s];
      Object.assign(h, b);
      h.at = add(lerp3(a.at, b.at, k), add(scale(UP, POSE.HAND_LIFT * bump(k, 0, 1)), scale(norm(add(was.n, now.n)), POSE.HAND_AWAY * bump(k, 0, 1))));
      h.fingers = norm(lerp3(a.fingers, b.fingers, k));
      h.pole = norm(lerp3(a.pole, b.pole, k));
      h.w = 1;
    }
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      this._footOnFace(out.feet[s], { ...c, feet: c.feet }, t < 0.5 ? was : now, lat * POSE.FEET_APART / 2, c.feet[1] + POSE.HANG_FOOT_UP, POSE.HANG_FOOT_OFF + 0.06 * bump(t, 0, 1), lat);
    }
    out.offset = scale(norm(lerp3(was.into, now.into, t)), POSE.HANG_IN);
    out.fit = { up: POSE.HANG_FIT_UP, down: this._fitDown(c) };
    out.lean.pitch = POSE.HANG_LEAN;
    out.look = { at: this._lipPoint(endC, now, lipY, 0), w: 0.6 };
  }

  _leap(c, m, t) {
    const out = this.out;
    const fr = wallFrame(m.hang?.normal ?? c.normal ?? [0, 0, 1]);
    out.frame = fr;
    const lipY = m.hang?.lipY ?? c.lipY;
    const end = { ...c, feet: m.to ?? c.feet };
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      this._handOnLip(out.hands[s], end, fr, lipY, lat * POSE.HANDS_APART / 2, s);
      const h = out.hands[s];
      h.w = t < 0.18 ? 1 - 0.6 * smooth(t / 0.18) : 0.4 + 0.6 * smooth((t - 0.18) / 0.62);
      h.curl = POSE.LIP_CURL * smooth((t - 0.8) / 0.2);
    }
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      this._footOnFace(out.feet[s], c, fr, lat * POSE.FEET_APART / 2, c.feet[1] + POSE.HANG_FOOT_UP, POSE.HANG_FOOT_OFF + 0.25 * bump(t, 0.1, 0.9), lat);
      out.feet[s].w = 1 - 0.7 * bump(t, 0.1, 0.9);
    }
    out.fit = { up: POSE.LEAP_REACH_FIT * bump(t, 0.2, 1.2), down: this._fitDown(c) * smooth((t - 0.8) / 0.2) };
    out.lean.pitch = POSE.HANG_LEAN;
    out.look = { at: this._lipPoint(end, fr, lipY, 0), w: 0.7 };
  }

  _wallrun(c, m, t) {
    const out = this.out;
    const n = m.hang?.normal ?? m.wall?.normal ?? c.normal ?? [0, 0, 1];
    const fr = wallFrame(n);
    out.frame = fr;
    const rise = (c.feet[1] - (m.from?.[1] ?? c.feet[1]));
    const ph = rise / POSE.WALLRUN_STEP;
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      const g = gait(rise, 2 * POSE.WALLRUN_STEP, s === 'R' ? 0 : 0.5, 0.5);
      const k = smooth(g.swing);
      const y = (m.from?.[1] ?? c.feet[1]) + lerp(g.anchor, g.next, k) + 0.3;
      this._footOnFace(out.feet[s], c, fr, lat * POSE.FEET_APART / 2, y, 0.08 + 0.12 * bump(k, 0, 1), lat);
      out.feet[s].w = 1 - smooth((t - 0.75) / 0.25) * (m.hang ? 0.6 : 0);
    }
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      const h = out.hands[s];
      if (m.hang) {
        const end = { ...c, feet: m.to ?? c.feet };
        this._handOnLip(h, end, fr, m.hang.lipY, lat * POSE.HANDS_APART / 2, s);
      } else {
        const back = POSE.FACE_BACK;
        h.at = [c.feet[0] + fr.into[0] * back + fr.right[0] * lat * POSE.CLIMB_HAND_APART / 2 + fr.n[0] * 0.05, c.feet[1] + POSE.CLIMB_HAND_UP, c.feet[2] + fr.into[2] * back + fr.right[2] * lat * POSE.CLIMB_HAND_APART / 2 + fr.n[2] * 0.05];
        h.fingers = norm(add(UP, scale(fr.into, 0.35))); h.palm = fr.into; h.curl = POSE.FACE_CURL;
        h.pole = norm(add(scale(fr.right, 0.6 * lat), scale(UP, -0.6)));
      }
      h.w = 0.2 * Math.abs(Math.sin(Math.PI * (ph + (lat > 0 ? 0 : 0.5)))) * (1 - smooth((t - 0.55) / 0.3)) + smooth((t - 0.55) / 0.4);
    }
    out.offset = scale(fr.into, 0.06);
    out.lean.pitch = -0.08 + 0.15 * smooth((t - 0.6) / 0.4);
    out.fit = { up: m.hang ? POSE.LEAP_REACH_FIT : 0, down: 0 };
    out.look = { at: add(c.feet, add(scale(fr.into, 0.6), scale(UP, 2.4))), w: 0.5 };
  }

  _flight(dt, c) {
    const out = this.out;
    const dir = c.flight?.dir ? norm([c.flight.dir[0], 0, c.flight.dir[2]]) : null;
    if (!dir) return;
    const fr = wallFrame([-dir[0], 0, -dir[2]]);
    out.frame = fr;
    const descending = c.flight.vy != null ? smooth(-c.flight.vy / 3) : 0.5;
    for (const s of ['L', 'R']) {
      const lat = s === 'R' ? 1 : -1;
      const h = out.hands[s];
      h.at = add(c.feet, add(add(scale(dir, POSE.FLIGHT_REACH), scale(fr.right, lat * 0.24)), scale(UP, 1.45 + POSE.FLIGHT_RISE)));
      h.fingers = norm(add(dir, scale(UP, 0.4)));
      h.palm = norm(add(scale(dir, 1), scale(UP, -0.3)));
      h.curl = 0.25;
      h.pole = norm(add(scale(fr.right, 0.6 * lat), scale(UP, -0.7)));
      h.w = 0.35 + 0.45 * descending;
    }
    out.look = { at: add(c.feet, add(scale(dir, 2), scale(UP, 1.2))), w: 0.4 };
  }

  _failing(k) {
    const out = this.out, t = this.t;
    const tr = (ph) => (Math.sin(t * POSE.TREMBLE_HZ * 6.283 + ph) * 0.6 + Math.sin(t * POSE.TREMBLE_HZ * 15.7 + ph * 2.3) * 0.4);
    for (const s of ['L', 'R']) {
      const h = out.hands[s];
      if (h.at) h.at = add(h.at, [POSE.TREMBLE * k * tr(s === 'R' ? 0 : 1.7), POSE.TREMBLE * k * tr(s === 'R' ? 2.1 : 3.3), POSE.TREMBLE * k * tr(s === 'R' ? 4.2 : 0.6)]);
      const f = out.feet[s];
      if (f.at) {
        const slip = Math.max(0, Math.sin(2 * Math.PI * POSE.SCRABBLE_HZ * t + (s === 'R' ? 0 : Math.PI)));
        f.at = add(f.at, [0, -POSE.SCRABBLE * k * slip * slip, 0]);
      }
    }
  }

  _ease(dt) {
    const out = this.out;
    for (const [key, slot] of [['L', out.hands.L], ['R', out.hands.R], ['FL', out.feet.L], ['FR', out.feet.R]]) {
      if (!slot.at) { this.cur[key] = null; continue; }
      const prev = this.cur[key];
      if (prev && Math.hypot(prev[0] - slot.at[0], prev[1] - slot.at[1], prev[2] - slot.at[2]) > 0.15) {
        const k = 1 - Math.exp(-dt / POSE.LIMB_TAU);
        slot.at = lerp3(prev, slot.at, k);
      }
      this.cur[key] = slot.at.slice();
    }
  }
}

export function climbRigInput(player, viewYaw) {
  if (!player) return null;
  const move = player.climbMove ?? null;
  const onWall = !!player.onWall;
  const classic = !onWall && !move && !!player.climb?.isClimbing;
  const flight = !onWall && !move && player.climbFlight ? { dir: player.climbFlight.dir, vy: player.velY ?? null } : null;
  if (!onWall && !move && !classic && !flight) return null;
  const feet = typeof player.bodyFeetAt === 'function' ? player.bodyFeetAt() : player.pos;
  const yaw = typeof player.bodyYawFor === 'function' ? player.bodyYawFor(viewYaw) : viewYaw;
  const normal = player.wallNormal ?? (classic ? [-Math.sin(yaw), 0, -Math.cos(yaw)] : null);
  return {
    feet: [feet[0], feet[1], feet[2]], yaw,
    track: typeof player.climbTrackPos === 'function' ? player.climbTrackPos() : null,
    floorGap: floorGapAt(player.collider, feet),
    mode: onWall ? (player.hanging ? 'hang' : 'climb') : (classic ? 'climb' : null),
    classic,
    normal, lipY: player.climbHold?.lipY ?? null,
    move,
    grip: Number.isFinite(player.grip) ? player.grip : 1,
    flight,
  };
}

export function floorGapAt(collider, feet) {
  if (!collider?.surfaceHit || !feet) return Infinity;
  const hit = collider.surfaceHit([feet[0], feet[1] + 0.05, feet[2]], [0, -1, 0], 1.05);
  return Number.isFinite(hit?.dist) ? Math.max(0, hit.dist - 0.05) : Infinity;
}

export const peerLipY = (feetY) => feetY + PARKOUR_HANG_DROP;
