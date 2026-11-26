// @ts-check

import { FEEL, tremble } from '../player/climbFeel.js';
import { PARKOUR_GRIP_LOW, PARKOUR_HANG_DROP, PARKOUR_LIP_FOLLOW } from '../player/parkour.js';
import { POSE, gait, shimmyGait, wallFrame } from '../player/climbPose.js';
import { decodePng } from '../render/textureReplacement.js';
import { toScreenOrder } from '../formats/color32Order.js';
import { APP_ROOT } from '../platform/appRoot.js';
import { wrapAngle } from '../world/mat4.js';
import { weaponOffsetHeight } from '../ui/hudLarge.js';
import { worldRectPx } from '../player/tapRay.js';
import { SETTINGS_DEFAULTS } from '../platform/settingsDefaults.js';

const NATIVE_W = 320;
const NATIVE_H = 200;
const DEG = Math.PI / 180;

// Both paintings show the left side, so the right fist and the right reaching arm draw mirrored.
export const GRIP_ART = Object.freeze({ file: 'art/climb-grip.png', w: 105, h: 152 });
export const REACH_ART = Object.freeze({ file: 'art/climb-reach.png', w: 183, h: 114 });

export const HANDS = Object.freeze({
  GRIP_H: 150,
  GRIP_APART: 93,
  GRIP_AT: 0.35,
  // How far the sleeve runs below the bottom edge at rest; lifts are capped at it so the end of the sleeve never shows.
  BOTTOM_SLACK: 34,
  REACH_W: 190,
  REACH_X_IN: 4,
  REACH_SLACK: 16,
  GAIT_PX: 110,
  SHIMMY_LIFT: 12,
  FROM_BELOW: 90,
  RING: 14,
  MANTLE_SINK: 45,
  MANTLE_PRESS: 22,
  MANTLE_APART: 26,
  VAULT_PLANT: 52,
  VAULT_SINK: 34,
  VAULT_APART: 12,
  LOWER_LOW: 60,
  LEAP_DROP: 70,
  LEAP_LEAD: 26,
  LEAP_FULL: 0.5,
  CORNER_REACH: 22,
  CORNER_LIFT: 12,
  WALLRUN_PUMP: 16,
  SWAY_Y: 2.2,
  SWAY_X: 1.2,
  SWAY_TAU: 0.25,
  TREMBLE: 2.4,
  LOOK_FROM_DEG: 40,
  LOOK_FULL_DEG: 75,
  LOOK_TAU: 0.09,
  LOOK_BACK_DEG: 170,
  SEARCH_X: 5,
  SEARCH_Y: 4,
  SEARCH_HZ: 0.6,
  WAY_TAU: 0.12,
  DOWN_FROM_DEG: 50,
  DOWN_FULL_DEG: 80,
});

const OUT = HANDS.GRIP_H + HANDS.BOTTOM_SLACK;
const SIDES = /** @type {const} */ (['L', 'R']);

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { const s = clamp01(x); return s * s * (3 - 2 * s); };
const bump = (x) => Math.sin(Math.PI * clamp01(x));
const lerp = (a, b, t) => a + (b - a) * t;
/** @returns {{L: number[], R: number[]}} */
const pair = (lx = 0, ly = 0, rx = 0, ry = 0) => ({ L: [lx, ly], R: [rx, ry] });
const copyPair = (p) => ({ L: [p.L[0], p.L[1]], R: [p.R[0], p.R[1]] });

export const wallYawOf = (normal) => Math.atan2(-normal[0], -normal[2]);

export function climbHandsWanted(c) {
  if (!c || c.classic) return false;
  return !!c.move || c.mode === 'hang' || c.mode === 'climb';
}

export function lookOffWall(c, viewYaw) {
  if (!c?.normal || !Number.isFinite(viewYaw)) return 0;
  return wrapAngle(viewYaw - wallYawOf(c.normal));
}

export function moveAcross(m, normal, to = m?.up ?? m?.to) {
  if (!m?.from || !normal || !to) return 0;
  const fr = wallFrame(normal);
  return (to[0] - m.from[0]) * fr.right[0] + (to[2] - m.from[2]) * fr.right[2];
}

export function moveSide(m, normal) {
  const a = moveAcross(m, normal);
  return Math.abs(a) > 1e-4 ? Math.sign(a) : 0;
}

const DFU_FOV = Number(SETTINGS_DEFAULTS.Video.FieldOfView) * DEG;
export const DESIGN_LENS = Object.freeze({
  tanX: Math.tan(DFU_FOV / 2) * (NATIVE_W / NATIVE_H), tanY: Math.tan(DFU_FOV / 2),
  cx: NATIVE_W / 2, cy: NATIVE_H / 2, hx: NATIVE_W / 2, hy: NATIVE_H / 2,
});

/**
 * @param {any} canvas
 * @param {{ fov?: number, viewport?: any, aspect?: number | null, offsetHeight?: number }} [opts]
 */
export function climbLens(canvas, { fov, viewport = null, aspect = null, offsetHeight = 0 } = {}) {
  const W = canvas?.width, H = canvas?.height;
  if (!(W > 0) || !(H > 0) || !(fov > 0)) return null;
  const real = canvas.canvas ?? canvas, at = canvas.uiRect ?? { x: 0, y: 0 };
  const r = worldRectPx(viewport, real.width, real.height);
  if (!(r.w > 0) || !(r.h > 0)) return null;
  const sx = W / NATIVE_W, sy = H / NATIVE_H, tanY = Math.tan(fov / 2);
  return {
    tanX: tanY * (aspect > 0 ? aspect : r.w / r.h), tanY,
    cx: (r.x - at.x + r.w / 2) / sx, cy: (r.y - at.y + r.h / 2 + offsetHeight) / sy,
    hx: r.w / 2 / sx, hy: r.h / 2 / sy,
  };
}

// Fists stay on the wall through the view's turn and pitch; only the reaching arm is screen-space. Pitch keeps a
// point on its level-view column, unlike a true projection, so a look down does not slide the hands sideways.
export function pinToView(x, y, lens, turn, pitch) {
  const a = ((x - lens.cx) / lens.hx) * lens.tanX, b = ((lens.cy - y) / lens.hy) * lens.tanY;
  const z = a * Math.sin(turn) + Math.cos(turn);
  if (!(z > 1e-3)) return null;
  const up = Math.atan2(b, z) - pitch;
  if (!(Math.abs(up) < Math.PI / 2 - 1e-3)) return null;
  return [lens.cx + ((a * Math.cos(turn) - Math.sin(turn)) / z / lens.tanX) * lens.hx, lens.cy - (Math.tan(up) / lens.tanY) * lens.hy];
}

export class ClimbHands {
  constructor() { this.reset(); }

  reset() {
    this.present = 0;
    this.t = 0;
    this.prev = null;
    this.src = null;
    this.lipY = null;
    this.travel = 0;
    this.travelDir = [0, 1];
    this.settle = { L: { v: 0, prev: 0, cycle: null }, R: { v: 0, prev: 0, cycle: null } };
    this.moveStart = null;
    this.moveNormal = null;
    this.base = null;
    this.carry = pair();
    this.ringT = Infinity;
    this.ringA = 0;
    this.ringArmed = false;
    this.swayW = 0;
    this.drawn = pair();
    this.faceYaw = null;
    this.look = 0;
    this.side = 'R';
    this.arm = 0;
    this.letGo = { L: 0, R: 0 };
    this.out = { present: 0, grips: [], reach: null };
  }

  update(dt, c, view = {}) {
    dt = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
    this.t += dt;
    const want = climbHandsWanted(c);
    const tau = want ? POSE.IN_TAU : POSE.OUT_TAU;
    this.present += ((want ? 1 : 0) - this.present) * (1 - Math.exp(-dt / tau));
    if (Math.abs(this.present - (want ? 1 : 0)) < 0.005) this.present = want ? 1 : 0;
    if (!want && this.present <= 0) { this.reset(); return this.out; }
    const p = c?.track ?? c?.feet ?? null;
    let d = [0, 0, 0];
    if (p && this.prev) d = [p[0] - this.prev[0], p[1] - this.prev[1], p[2] - this.prev[2]];
    if (Math.hypot(d[0], d[1], d[2]) > 1) d = [0, 0, 0];
    this.prev = p ? [p[0], p[1], p[2]] : null;
    if (want) this._place(dt, c, d, view);
    return this._layout(view);
  }

  _place(dt, c, d, view) {
    const m = c.move ?? null;
    const lip = Number.isFinite(c.lipY) ? c.lipY : null;
    const lipJump = !m && lip != null && this.lipY != null && Math.abs(lip - this.lipY) > PARKOUR_LIP_FOLLOW;
    this.lipY = lip;
    const src = m ?? c.mode;
    const changed = src !== this.src || lipJump;
    if (changed) {
      this.src = src;
      if (m) {
        this.moveStart = this.present >= 0.5 && this.base ? copyPair(this.base) : null;
        this.moveNormal = c.normal ?? m.hang?.normal ?? null;
        this.ringArmed = false;
      } else {
        this.travel = 0;
        this.travelDir = [0, 1];
        for (const s of SIDES) this.settle[s] = { v: 0, prev: 0, cycle: null };
        d = [0, 0, 0];
      }
    }
    const base = m ? this._move(m, c) : c.mode === 'hang' ? this._hang(dt, c, d) : this._climb(dt, c, d);
    const k = Math.exp(-dt / POSE.LIMB_TAU);
    for (const s of SIDES) {
      for (const i of [0, 1]) {
        this.carry[s][i] = changed ? (this.base && this.present > 0 ? this.base[s][i] - base[s][i] : 0) : this.carry[s][i] * k;
        base[s][i] += this.carry[s][i];
      }
    }
    this.base = base;
    const off = copyPair(base);
    if (Number.isFinite(this.ringT)) {
      this.ringT += dt;
      const ring = -HANDS.RING * this.ringA * Math.exp(-POSE.SWING_DAMP * this.ringT) * Math.sin(2 * Math.PI * POSE.SWING_HZ * this.ringT);
      for (const s of SIDES) off[s][1] += ring;
      if (this.ringT > 4) this.ringT = Infinity;
    }
    const still = !m && c.mode === 'hang' && Math.hypot(d[0], d[2]) < 1e-5;
    this.swayW += ((still ? 1 : 0) - this.swayW) * (1 - Math.exp(-dt / HANDS.SWAY_TAU));
    if (this.swayW > 1e-4) {
      const swayX = this.swayW * HANDS.SWAY_X * Math.sin(2 * Math.PI * FEEL.SWAY_HZ * this.t);
      const swayY = this.swayW * HANDS.SWAY_Y * Math.sin(2 * Math.PI * FEEL.SWAY_HZ * 1.37 * this.t);
      for (const s of SIDES) { off[s][0] += swayX; off[s][1] += swayY; }
    }
    const fail = c.mode && Number.isFinite(c.grip) ? clamp01((PARKOUR_GRIP_LOW - c.grip) / PARKOUR_GRIP_LOW) : 0;
    if (fail > 0) {
      const ft = this.t * POSE.TREMBLE_HZ;
      off.L[0] += HANDS.TREMBLE * fail * tremble(ft); off.L[1] += HANDS.TREMBLE * fail * tremble(ft * 1.3 + 7);
      off.R[0] += HANDS.TREMBLE * fail * tremble(ft + 3.1); off.R[1] += HANDS.TREMBLE * fail * tremble(ft * 1.3 + 11);
    }
    this.drawn = off;
    const wall = c.normal ?? m?.hang?.normal ?? m?.wall?.normal ?? null;
    this.faceYaw = Number.isFinite(c.yaw) ? c.yaw : wall ? wallYawOf(wall) : null;
    const turn = lookOffWall(c, view.yaw);
    const deep = !m ? smooth((Math.abs(turn) / DEG - HANDS.LOOK_FROM_DEG) / (HANDS.LOOK_FULL_DEG - HANDS.LOOK_FROM_DEG)) : 0;
    const kl = 1 - Math.exp(-dt / HANDS.LOOK_TAU);
    this.look += (deep - this.look) * kl;
    if (Math.abs(this.look - deep) < 0.002) this.look = deep;
    // Past LOOK_BACK_DEG the arm keeps its side, since the turn's sign flips at 180 degrees.
    const toSide = Math.abs(turn) > HANDS.LOOK_BACK_DEG * DEG ? this.side : turn >= 0 ? 'R' : 'L';
    if (toSide !== this.side && this.arm < 0.2) this.side = toSide;
    const armT = toSide === this.side ? this.look : 0;
    this.arm += (armT - this.arm) * kl;
    if (Math.abs(this.arm - armT) < 0.002) this.arm = armT;
    for (const s of SIDES) {
      const t = s === this.side ? this.look : 0;
      this.letGo[s] += (t - this.letGo[s]) * kl;
      if (Math.abs(this.letGo[s] - t) < 0.002) this.letGo[s] = t;
    }
  }

  _layout(view) {
    const out = this.out;
    out.present = this.present;
    out.grips = [];
    out.reach = null;
    const side = this.side;
    const pitch = Number.isFinite(view.pitch) ? view.pitch : 0;
    const gone = smooth((-pitch / DEG - HANDS.DOWN_FROM_DEG) / (HANDS.DOWN_FULL_DEG - HANDS.DOWN_FROM_DEG)) * OUT;
    const gh = HANDS.GRIP_H, gw = gh * GRIP_ART.w / GRIP_ART.h;
    const enter = (1 - smooth(this.present)) * OUT;
    const pinned = this.faceYaw != null && Number.isFinite(view.yaw);
    const turn = pinned ? wrapAngle(view.yaw - this.faceYaw) : 0, tilt = pinned ? pitch : 0;
    const lens = view.lens ?? DESIGN_LENS;
    const gripY = NATIVE_H - gh + HANDS.BOTTOM_SLACK + HANDS.GRIP_AT * gh;
    for (const s of SIDES) {
      const lat = s === 'R' ? 1 : -1;
      const gripX = NATIVE_W / 2 + lat * HANDS.GRIP_APART + this.drawn[s][0];
      const at = turn || tilt ? pinToView(gripX, gripY, lens, turn, tilt) : [gripX, gripY];
      if (!at) continue;
      const x = at[0] - gw / 2;
      let y = NATIVE_H - gh + HANDS.BOTTOM_SLACK + this.drawn[s][1] + Math.max(at[1] - gripY, -HANDS.BOTTOM_SLACK);
      y = Math.max(y, NATIVE_H - gh);
      y += enter + gone + smooth(this.letGo[s]) * OUT;
      if (y >= NATIVE_H || x >= NATIVE_W || x + gw <= 0) continue;
      out.grips.push({ side: s, x, y, w: gw, h: gh, flip: s === 'R' });
    }
    if (this.arm > 0.001) {
      const rw = HANDS.REACH_W, rh = rw * REACH_ART.h / REACH_ART.w;
      const sx = HANDS.SEARCH_X * Math.sin(2 * Math.PI * HANDS.SEARCH_HZ * this.t);
      const sy = HANDS.SEARCH_Y * Math.sin(2 * Math.PI * HANDS.SEARCH_HZ * 1.6 * this.t + 0.7);
      const xl = HANDS.REACH_X_IN + sx;
      const x = side === 'R' ? NATIVE_W - xl - rw : xl;
      const y = Math.max(NATIVE_H - rh, NATIVE_H - rh + HANDS.REACH_SLACK + sy + (1 - smooth(this.arm)) * (rh + HANDS.REACH_SLACK) + enter + gone);
      if (y < NATIVE_H) out.reach = { side, x, y, w: rw, h: rh, flip: side === 'R' };
    }
    return out;
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

  _hang(dt, c, d) {
    const fr = wallFrame(c.normal ?? [0, 0, 1]);
    const along = d[0] * fr.right[0] + d[2] * fr.right[2];
    this.travel += along;
    const moving = Math.abs(along) > 1e-5;
    const span = FEEL.SHIMMY_SPAN, stride = 2 * span;
    const out = pair();
    for (const s of SIDES) {
      const g = shimmyGait(this.travel, stride, s === 'R' ? span / 2 : 1.5 * span, POSE.SHIMMY_REACH * span);
      const sw = this._settled(s, g, moving, dt);
      const atLip = lerp(g.anchor, g.next, smooth(sw)) - this.travel;
      out[s] = [atLip * HANDS.GAIT_PX, -HANDS.SHIMMY_LIFT * bump(sw)];
    }
    return out;
  }

  _climb(dt, c, d) {
    const fr = wallFrame(c.normal ?? [0, 0, 1]);
    const a = d[0] * fr.right[0] + d[2] * fr.right[2], u = d[1];
    const step = Math.hypot(a, u);
    if (step > 1e-5) {
      // The way is eased rather than treated as a change of state, so per-frame wobble cannot pin the fists.
      const k = 1 - Math.exp(-dt / HANDS.WAY_TAU);
      this.travelDir = [this.travelDir[0] + (a / step - this.travelDir[0]) * k, this.travelDir[1] + (u / step - this.travelDir[1]) * k];
      this.travel += step;
    }
    const moving = step > 1e-5;
    const [ta, tu] = this.travelDir;
    const out = pair();
    for (const s of SIDES) {
      const g = gait(this.travel, 2 * FEEL.REACH, s === 'R' ? 0 : 0.5, POSE.CLIMB_DUTY);
      const sw = this._settled(s, g, moving, dt);
      const rel = lerp(g.anchor - this.travel, g.next - this.travel, smooth(sw));
      out[s] = [ta * rel * HANDS.GAIT_PX, -tu * rel * HANDS.GAIT_PX];
    }
    return out;
  }

  _land(speed) {
    if (this.ringArmed) return;
    this.ringArmed = true;
    this.ringT = 0;
    this.ringA = 0.5 + 0.5 * clamp01((POSE.SWING_BASE + POSE.SWING_PER_SPEED * speed) / POSE.SWING_MAX);
  }

  _move(m, c) {
    const t = clamp01(m.t ?? 0);
    const start = this.moveStart;
    const from = (s) => start?.[s] ?? [0, HANDS.FROM_BELOW];
    const out = pair();
    switch (m.kind) {
      case 'catch': case 'reach': {
        const k = smooth(t / 0.45);
        for (const s of SIDES) out[s] = [lerp(from(s)[0], 0, k), lerp(from(s)[1], 0, k)];
        if (t >= 0.45) this._land(m.speed ?? 0);
        break;
      }
      case 'leap': {
        const across = Math.max(-1, Math.min(1, moveAcross(m, this.moveNormal, m.to) / HANDS.LEAP_FULL));
        const push = smooth(t / 0.18), reach = smooth((t - 0.18) / 0.62);
        const lead = across * HANDS.LEAP_LEAD * bump((t - 0.18) / 0.62);
        for (const s of SIDES) {
          const f = from(s);
          out[s] = t < 0.18 ? [lerp(f[0], 0, push), lerp(f[1], HANDS.LEAP_DROP, push)] : [lead, lerp(HANDS.LEAP_DROP, 0, reach)];
        }
        if (t >= 0.8) {
          const way = m.to && m.from ? Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1], m.to[2] - m.from[2]) : 0;
          this._land(m.dur > 0 ? way / m.dur : 0);
        }
        break;
      }
      case 'mantle': {
        const split = clamp01(m.split ?? 0.5);
        const over = t <= split ? 0 : (t - split) / Math.max(1e-6, 1 - split);
        const rise = m.to && m.from ? m.to[1] - m.from[1] : PARKOUR_HANG_DROP;
        const edge = HANDS.MANTLE_SINK * clamp01((PARKOUR_HANG_DROP - rise) / 1.2);
        const sink = HANDS.MANTLE_SINK * clamp01(rise / PARKOUR_HANG_DROP) * smooth(t / Math.max(1e-6, split));
        const take = start ? 1 : smooth(t / Math.max(0.08, split * 0.4));
        const press = smooth(over / 0.35);
        const letGo = m.exit ? smooth((over - 0.45) / 0.3) : smooth((over - 0.6) / 0.35);
        for (const s of SIDES) {
          const lat = s === 'R' ? 1 : -1, f = from(s);
          const y0 = start ? f[1] : lerp(f[1], edge, take);
          const x0 = start ? f[0] * (1 - smooth(t / Math.max(1e-6, split))) : 0;
          out[s] = [x0 + lat * HANDS.MANTLE_APART * press, y0 + sink + HANDS.MANTLE_PRESS * press + OUT * letGo];
        }
        break;
      }
      case 'vault': {
        const plant = smooth(t / 0.12), pass = smooth((t - 0.12) / 0.43), letGo = smooth((t - 0.55) / 0.25);
        for (const s of SIDES) {
          const lat = s === 'R' ? 1 : -1, f = from(s);
          out[s] = [lerp(f[0], 0, plant) + lat * HANDS.VAULT_APART * pass, lerp(f[1], HANDS.VAULT_PLANT, plant) + HANDS.VAULT_SINK * pass + OUT * letGo];
        }
        break;
      }
      case 'lower': {
        const onEdge = smooth((t - 0.04) / 0.22), drop = smooth((t - 0.32) / 0.68);
        for (const s of SIDES) {
          const f = from(s);
          out[s] = [lerp(f[0], 0, onEdge) * (1 - drop), lerp(lerp(f[1], HANDS.LOWER_LOW, onEdge), 0, drop)];
        }
        break;
      }
      case 'corner': {
        const way = moveSide(m, this.moveNormal) || 1;
        for (const s of SIDES) {
          const lead = (s === 'R' ? 1 : -1) === way;
          const k = lead ? smooth(t / 0.55) : smooth((t - 0.4) / 0.6), f = from(s);
          out[s] = [lerp(f[0], 0, k) + way * HANDS.CORNER_REACH * bump(k), lerp(f[1], 0, k) - HANDS.CORNER_LIFT * bump(k)];
        }
        break;
      }
      case 'wallrun': {
        const rose = (c.feet?.[1] ?? 0) - (m.from?.[1] ?? c.feet?.[1] ?? 0);
        const up = smooth((t - 0.55) / 0.4), pumping = 1 - smooth((t - 0.55) / 0.3);
        for (const s of SIDES) {
          const f = from(s);
          const pump = Math.abs(Math.sin(Math.PI * (rose / POSE.WALLRUN_STEP + (s === 'R' ? 0 : 0.5)))) * pumping;
          out[s] = [lerp(f[0], 0, up), lerp(f[1], 0, up) - HANDS.WALLRUN_PUMP * pump];
        }
        break;
      }
      default:
        for (const s of SIDES) out[s] = [...from(s)];
        break;
    }
    return out;
  }
}

export const climbArtUrl = (file) => new URL(file, APP_ROOT ?? globalThis.document?.baseURI ?? 'https://invalid.invalid/').href;

/**
 * @param {{ renderer?: any, fetchBytes?: ((file: string) => Promise<any>) | null, decode?: (bytes: any) => Promise<any> }} [opts]
 */
export function createClimbHands({ renderer, fetchBytes = null, decode = decodePng } = {}) {
  const law = new ClimbHands();
  /** @type {Map<string, any>} */
  const tex = new Map();
  const load = (art) => {
    if (tex.has(art.file) || !renderer) return tex.get(art.file) ?? null;
    tex.set(art.file, null);
    (async () => {
      const bytes = fetchBytes ? await fetchBytes(art.file) : await (async () => {
        const r = await fetch(climbArtUrl(art.file));
        if (!r.ok) throw new Error(`${art.file}: ${r.status}`);
        return new Uint8Array(await r.arrayBuffer());
      })();
      const img = await decode(bytes);
      if (img?.width) tex.set(art.file, renderer.uploadTexture('img', `climbhands:${art.file}`, toScreenOrder(img)));
    })().catch((e) => console.warn('[climb hands] texture load failed', art.file, e));
    return null;
  };
  return {
    law,
    update(dt, climb, view) { return law.update(dt, climb, view); },
    showing() { return law.out.present > 0 && (law.out.grips.length > 0 || !!law.out.reach); },
    draw(canvas, { tint = null, offsetHeight = weaponOffsetHeight() } = {}) {
      const out = law.out;
      if (!canvas || !renderer || out.present <= 0) return false;
      const sx = canvas.width / NATIVE_W, sy = canvas.height / NATIVE_H;
      const quad = (t, b) => renderer.drawScreenQuad(t, { x: b.x * sx, y: b.y * sy - offsetHeight, w: b.w * sx, h: b.h * sy },
        b.flip ? { u0: 1, v0: 0, u1: 0, v1: 1 } : undefined, tint ?? undefined);
      let drew = false;
      if (out.reach) { const t = load(REACH_ART); if (t) { quad(t, out.reach); drew = true; } }
      if (out.grips.length) { const t = load(GRIP_ART); if (t) { for (const g of out.grips) quad(t, g); drew = true; } }
      return drew;
    },
  };
}
