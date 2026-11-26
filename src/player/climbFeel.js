// Camera effects for climbing (pitch, roll, eye offset, fov, yaw) as springs and curves.
import { PARKOUR_GRIP_LOW, PARKOUR_HAND_SPAN } from './parkour.js';
import { ClimbSounds } from './climbSounds.js';
import { stepTechniqueFx, techniqueView, resetTechniqueFx } from '../combat/technique/techniqueFx.js';

export const FEEL = Object.freeze({
  K_EYE: 140,
  K_ANGLE: 110,
  K_FOV: 60,
  DIP_BASE: 0.6,
  DIP_PER_SPEED: 0.16,
  DIP_MAX: 2.2,
  CATCH_PITCH_DEG: 4,
  SWAY_ROLL_DEG: 0.45,
  SWAY_Y: 0.006,
  SWAY_HZ: 0.16,
  TREMBLE_DEG: 0.7,
  TREMBLE_Y: 0.004,
  TREMBLE_HZ: 9,
  SHIMMY_SPAN: PARKOUR_HAND_SPAN,
  SHIMMY_ROLL_DEG: 1.6,
  SHIMMY_BOB: 0.012,
  REACH: 0.45,
  CLIMB_ROLL_DEG: 1.8,
  CLIMB_BOB: 0.02,
  MANTLE_LOOK_UP_DEG: 6,
  MANTLE_CREST_DEG: 9,
  VAULT_DIP_DEG: 7,
  LOWER_LOOK_DOWN_DEG: 14,
  LEAP_ROLL_DEG: 6,
  LEAP_UP_DEG: 7,
  WALLRUN_UP_DEG: 12,
  CORNER_ROLL_DEG: 3,
  LAUNCH_FOV: 7,
  VAULT_FOV: 3,
  WALLRUN_FOV: 4,
  TURN_TAU: 0.12,
  EJECT_TURN_S: 0.3,
});

const DEG = Math.PI / 180;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function spring(x, v, target, k, dt) {
  const w = Math.sqrt(k), y = x - target, e = Math.exp(-w * dt), c = v + w * y;
  return [target + (y + c * dt) * e, (v - w * c * dt) * e];
}

export const tremble = (t) => (Math.sin(t * 6.283) * 0.5 + Math.sin(t * 15.71 + 1.3) * 0.3 + Math.sin(t * 27.3 + 2.1) * 0.2);

const leapArrival = (e) => (e.dur > 0 ? Math.hypot(e.rise ?? 0, ...(e.way ?? [0, 0])) / e.dur : 0);

export class ClimbFeel {
  constructor() { this.reset(); }

  reset() {
    this.t = 0;
    this.eyeY = 0; this.eyeV = 0;
    this.pitchS = 0; this.pitchV = 0;
    this.rollS = 0; this.rollV = 0;
    this.fovS = 0; this.fovV = 0;
    this.turnLeft = 0; this.turnTau = FEEL.TURN_TAU;
    this.climbPhase = 0; this.shimmyPhase = 0; this.shimmySide = 0;
    this.bobS = 0; this.bobV = 0;
    this.prev = null;
    this.move = null;
    this.out = { pitch: 0, roll: 0, eye: [0, 0, 0], fov: 0, yaw: 0 };
  }

  update(dt, m, yaw) {
    dt = Math.min(Math.max(dt, 0), 0.25);
    this.t += dt;
    const out = this.out;
    out.yaw = 0;
    for (const e of m.climbEvents ?? []) this._event(e, yaw, m);
    const live = m.climbMove;
    if (!live) this.move = null;
    const mv = this.move && live ? { ...this.move, t: live.t } : null;
    const p = m.climbTrackPos?.() ?? m.pos;
    let dx = 0, dy = 0, dz = 0;
    if (this.prev && (m.onWall || mv)) { dx = p[0] - this.prev[0]; dy = p[1] - this.prev[1]; dz = p[2] - this.prev[2]; }
    this.prev = [p[0], p[1], p[2]];
    if (Math.hypot(dx, dy, dz) > 1) { dx = dy = dz = 0; }
    let pitchT = 0, rollT = 0, bob = 0, fovT = 0;
    if (mv) {
      const t = mv.t;
      switch (mv.kind) {
        case 'mantle': pitchT = FEEL.MANTLE_LOOK_UP_DEG * DEG * bump(t, 0, 0.5) - FEEL.MANTLE_CREST_DEG * DEG * bump(t, 0.35, 1); break;
        case 'vault': pitchT = -FEEL.VAULT_DIP_DEG * DEG * bump(t, 0.15, 0.95); fovT = FEEL.VAULT_FOV * bump(t, 0, 1); break;
        case 'lower': pitchT = -FEEL.LOWER_LOOK_DOWN_DEG * DEG * bump(t, 0, 0.75); break;
        case 'leap': {
          const right = mv.side ?? 0;
          rollT = FEEL.LEAP_ROLL_DEG * DEG * right * bump(t, 0, 1);
          pitchT = (mv.rise > 0.3 ? FEEL.LEAP_UP_DEG : 0) * DEG * bump(t, 0, 0.8);
          break;
        }
        case 'wallrun': pitchT = FEEL.WALLRUN_UP_DEG * DEG * bump(t, 0, 1.2); fovT = FEEL.WALLRUN_FOV * bump(t, 0, 1); break;
        case 'corner': rollT = FEEL.CORNER_ROLL_DEG * DEG * Math.sign(mv.turn || 0) * bump(t, 0, 1); break;
        default: break;
      }
    } else if (m.onWall) {
      if (m.hanging) {
        const along = this._along(m, dx, dz);
        if (Math.abs(along) > 1e-5) {
          this.shimmyPhase += Math.abs(along) / FEEL.SHIMMY_SPAN;
          this.shimmySide = Math.sign(along);
          const s = Math.abs(Math.sin(Math.PI * this.shimmyPhase));
          rollT = FEEL.SHIMMY_ROLL_DEG * DEG * this.shimmySide * s;
          bob = FEEL.SHIMMY_BOB * s;
        } else {
          rollT = FEEL.SWAY_ROLL_DEG * DEG * Math.sin(2 * Math.PI * FEEL.SWAY_HZ * this.t);
          bob = FEEL.SWAY_Y * Math.sin(2 * Math.PI * FEEL.SWAY_HZ * 1.37 * this.t);
        }
      } else {
        const travel = Math.hypot(dx, dy, dz);
        if (travel > 1e-5) this.climbPhase += travel / FEEL.REACH;
        const ph = this.climbPhase;
        rollT = FEEL.CLIMB_ROLL_DEG * DEG * Math.sin(Math.PI * ph);
        bob = FEEL.CLIMB_BOB * Math.sin(2 * Math.PI * ph);
      }
    }
    let shake = 0;
    if (m.onWall && Number.isFinite(m.grip)) {
      const k = clamp01((PARKOUR_GRIP_LOW - m.grip) / PARKOUR_GRIP_LOW);
      if (k > 0) {
        shake = FEEL.TREMBLE_DEG * DEG * k * tremble(this.t * FEEL.TREMBLE_HZ);
        bob += FEEL.TREMBLE_Y * k * tremble(this.t * FEEL.TREMBLE_HZ * 1.3 + 7);
      }
    }
    [this.eyeY, this.eyeV] = spring(this.eyeY, this.eyeV, 0, FEEL.K_EYE, dt);
    [this.pitchS, this.pitchV] = spring(this.pitchS, this.pitchV, pitchT, FEEL.K_ANGLE, dt);
    [this.rollS, this.rollV] = spring(this.rollS, this.rollV, rollT, FEEL.K_ANGLE, dt);
    [this.fovS, this.fovV] = spring(this.fovS, this.fovV, fovT, FEEL.K_FOV, dt);
    if (this.turnLeft) {
      const step = Math.abs(this.turnLeft) < 1e-4 ? this.turnLeft : this.turnLeft * (1 - Math.exp(-dt / this.turnTau));
      out.yaw = step;
      this.turnLeft -= step;
    }
    out.pitch = this.pitchS;
    out.roll = this.rollS + shake;
    [this.bobS, this.bobV] = spring(this.bobS, this.bobV, bob, FEEL.K_EYE, dt);
    out.eye[0] = 0; out.eye[1] = this.eyeY + this.bobS; out.eye[2] = 0;
    out.fov = this.fovS;
    return out;
  }

  _along(m, dx, dz) {
    const n = m.wallNormal;
    return n ? -n[2] * dx + n[0] * dz : 0;
  }

  _event(e, yaw, m) {
    switch (e.type) {
      case 'move': {
        const way = e.way ?? [0, 0], n = e.normal;
        const side = n ? Math.sign(-n[2] * way[0] + n[0] * way[1]) : 0;
        this.move = { kind: e.kind, dur: e.dur, rise: e.rise ?? 0, turn: e.turn ?? 0, side, speed: e.kind === 'leap' ? leapArrival(e) : 0 };
        if (e.kind === 'catch' || e.kind === 'reach') {
          this._dip(e.speed ?? 0);
        }
        if (e.kind === 'lower' && n) this._turnTo(Math.atan2(-n[0], -n[2]), yaw, Math.max(0.05, e.dur / 5));
        if (e.kind === 'corner' && e.turn) { this.turnLeft += e.turn; this.turnTau = Math.max(0.04, e.dur / 5); }
        if (e.kind === 'leap' || e.kind === 'wallrun') this.fovV += FEEL.LAUNCH_FOV * 6;
        if (e.kind === 'vault') this.fovV += FEEL.VAULT_FOV * 6;
        break;
      }
      case 'launch': {
        this.fovV += FEEL.LAUNCH_FOV * 8;
        const d = e.dir;
        if (d) this._turnTo(Math.atan2(d[0], d[2]), yaw, FEEL.EJECT_TURN_S / 3);
        break;
      }
      case 'hold':
        this.climbPhase = 0; this.shimmyPhase = 0;
        if (this.move?.kind === 'leap') this._dip(this.move.speed ?? 0);
        break;
      default: break;
    }
  }

  _dip(speed) {
    const v = Math.min(FEEL.DIP_MAX, FEEL.DIP_BASE + FEEL.DIP_PER_SPEED * speed);
    this.eyeV -= v;
    this.pitchV -= FEEL.CATCH_PITCH_DEG * DEG * 8 * (v / FEEL.DIP_MAX);
  }

  _turnTo(target, yaw, tau) {
    this.turnLeft += wrap(target - (yaw + this.turnLeft));
    this.turnTau = tau;
  }
}

const S = new Float32Array(16);
export function applyClimbView(view, fx) {
  if (!fx || (!fx.pitch && !fx.roll && !fx.eye[0] && !fx.eye[1] && !fx.eye[2])) return view;
  const e = fx.eye, ex = e[0], ey = e[1], ez = e[2];
  view[12] -= view[0] * ex + view[4] * ey + view[8] * ez;
  view[13] -= view[1] * ex + view[5] * ey + view[9] * ez;
  view[14] -= view[2] * ex + view[6] * ey + view[10] * ez;
  const cp = Math.cos(fx.pitch), sp = Math.sin(fx.pitch), cr = Math.cos(fx.roll), sr = Math.sin(fx.roll);
  const e00 = cr, e01 = -sr * cp, e02 = -sr * sp;
  const e10 = sr, e11 = cr * cp, e12 = cr * sp;
  const e20 = 0, e21 = -sp, e22 = cp;
  S.set(view);
  for (let c = 0; c < 4; c++) {
    const r0 = S[c * 4], r1 = S[c * 4 + 1], r2 = S[c * 4 + 2];
    view[c * 4] = e00 * r0 + e01 * r1 + e02 * r2;
    view[c * 4 + 1] = e10 * r0 + e11 * r1 + e12 * r2;
    view[c * 4 + 2] = e20 * r0 + e21 * r1 + e22 * r2;
  }
  return view;
}

export function createClimbFeelHost(player, cam, lookFilter, { audio = null, strain = null } = {}) {
  const law = new ClimbFeel();
  const sounds = audio ? new ClimbSounds({ audio, strain }) : null;
  return {
    law,
    sounds,
    fx: null,
    applied: null,
    tech: null,
    frame(dt, held = false) {
      stepTechniqueFx(dt);
      const m = player();
      if (!m || held) return;
      this.fx = law.update(dt, m, cam.yaw);
      if (this.fx.yaw) lookFilter?.turn?.(this.fx.yaw);
      sounds?.update(dt, m);
    },
    view(view, firstPerson) {
      this.applied = firstPerson && this.fx ? this.fx : null;
      if (this.applied) applyClimbView(view, this.applied);
      this.tech = firstPerson ? techniqueView() : null;
      if (this.tech) applyClimbView(view, this.tech);
      return view;
    },
    fovRad() { return (((this.fx?.fov ?? 0) + techniqueView().fov) * Math.PI) / 180; },
    pitch() { return (this.applied?.pitch ?? 0) + (this.tech?.pitch ?? 0); },
    reset() { law.reset(); sounds?.reset(); resetTechniqueFx(); this.fx = null; this.applied = null; this.tech = null; },
  };
}
