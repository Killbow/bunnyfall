// @ts-check
// Builds the four giant brass gears far below the islands, and layGear, the gear shared with the island spires.
// Pure and visual only: no gear is a collider.
import { faces } from './gateModel.js';
import { packRealmFaces } from './sdRealm.js';
import { SD_REALM_ORIGIN } from '../net/sdBrain.js';

export const SD_WORKS_RECORD = 80;
export const SD_WORKS_TIP_V = Object.freeze([0.02, 0.1]);
export const SD_WORKS_FACE_V = 0.14;
export const SD_WORKS_PITCH = 2.6;
export const worksPitchR = (teeth) => (SD_WORKS_PITCH * teeth) / (2 * Math.PI);
/** @typedef {{ out: number, in: number, rim: number, h: number, hub: number, hubProud: number, spokes: number, spokeW: number, tipW: number, rootW: number, glint: number }} GearShape */
/** @type {Readonly<GearShape>} */
export const SD_WORKS_TOOTH = Object.freeze({ out: 1.1, in: 1.3, rim: 0.16, h: 3.2, hub: 0.17, hubProud: 0.3, spokes: 6, spokeW: 0.07, tipW: 0.3, rootW: 0.52, glint: 0.3 });
export const SD_WORKS = layTrain([
  { teeth: 96, x: -42, z: 64, y: -270 },
  { teeth: 48, mesh: 0, bearing: 58, y: -270 },
  { teeth: 72, axle: 1, y: -244, lite: true },
  { teeth: 64, mesh: 2, bearing: 74, y: -244, lite: true },
]);

function layTrain(spec) {
  const out = [];
  for (const s of spec) {
    const r = worksPitchR(s.teeth);
    let x = s.x ?? 0, z = s.z ?? 0, w = (2 * Math.PI) / s.teeth, phase = 0;
    if (s.mesh != null) {
      const d = out[s.mesh], b = (s.bearing * Math.PI) / 180;
      x = d.x + Math.cos(b) * (d.r + r); z = d.z + Math.sin(b) * (d.r + r);
      w = (-d.w * d.r) / r;
      phase = b + Math.PI - (d.r * (d.phase - b) + SD_WORKS_PITCH / 2) / r;
    } else if (s.axle != null) {
      const a = out[s.axle];
      x = a.x; z = a.z; w = a.w;
    }
    out.push(Object.freeze({ teeth: s.teeth, r, x, y: s.y, z, w, phase, lite: !!s.lite, at: Object.freeze([SD_REALM_ORIGIN[0] + x, SD_REALM_ORIGIN[1] + s.y, SD_REALM_ORIGIN[2] + z]) }));
  }
  return Object.freeze(out);
}

export const worksAngle = (g, ticks) => g.phase + g.w * ticks;
export const SD_HANG_NOW = Object.freeze({ ticks: 0, swing: 1, far: 2 });

/**
 * @param {any} f
 * @param {number} rec
 * @param {{ r: number, teeth: number, at: (u: number, w: number, y: number) => number[], phase?: number, shape?: Readonly<GearShape>, under?: boolean, tipV?: ReadonlyArray<number>, uvM?: number, faceUv?: ((u: number, w: number, tipR: number) => number[]) | null, spokes?: boolean }} o
 */
export function layGear(f, rec, { r, teeth, at, phase = 0, shape = SD_WORKS_TOOTH, under = false, tipV = SD_WORKS_TIP_V, uvM = 2, faceUv = null, spokes = true }) {
  const S = shape, pitch = (2 * Math.PI) / teeth, mod = (2 * r) / teeth;
  const rt = r + S.out * mod, rr = r - S.in * mod, ri = rr - S.rim * r, rh = S.hub * r, top = S.h / 2, bot = -S.h / 2;
  const hubTop = top * (1 + S.hubProud), hubBot = bot * (1 + S.hubProud);
  const P = (rad, a, y) => at(Math.cos(a) * rad, Math.sin(a) * rad, y);
  const uv = (rad, a) => (faceUv ? faceUv(Math.cos(a) * rad, Math.sin(a) * rad, rt) : [(Math.cos(a) * rad) / uvM, (Math.sin(a) * rad) / uvM]);
  const above = at(0, 0, 1e4), below = at(0, 0, -1e4);
  const away = (a, b, c, d, ua, ub, uc, ud, from) => {
    const n = cross(sub(b, a), sub(c, a)), m = sub([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], from);
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= 0) f.quad(rec, a, b, c, d, ua, ub, uc, ud);
    else f.quad(rec, d, c, b, a, ud, uc, ub, ua);
  };
  const sidesOf = (t, b) => (under ? [{ y: t, from: below }, { y: b, from: above }] : [{ y: t, from: below }]);
  const sides = sidesOf(top, bot);
  for (let k = 0; k < teeth; k++) {
    const c = phase + k * pitch, a0 = c - pitch / 2, a1 = c + pitch / 2;
    const t0 = c - (pitch * S.tipW) / 2, t1 = c + (pitch * S.tipW) / 2, q0 = c - (pitch * S.rootW) / 2, q1 = c + (pitch * S.rootW) / 2, next = q0 + pitch;
    const inRim = P((ri + rr) / 2, c, 0), inTooth = P((rr + rt) / 2, c, 0);
    for (const { y, from } of sides) {
      away(P(ri, a0, y), P(ri, a1, y), P(rr, a1, y), P(rr, a0, y), uv(ri, a0), uv(ri, a1), uv(rr, a1), uv(rr, a0), from);
      const g = 1 - S.glint, rg = rr + (rt - rr) * g, g0 = q0 + (t0 - q0) * g, g1 = q1 + (t1 - q1) * g;
      away(P(rr, q0, y), P(rr, q1, y), P(rg, g1, y), P(rg, g0, y), uv(rr, q0), uv(rr, q1), uv(rg, g1), uv(rg, g0), from);
      away(P(rg, g0, y), P(rg, g1, y), P(rt, t1, y), P(rt, t0, y), [0, tipV[0]], [1, tipV[0]], [1, tipV[1]], [0, tipV[1]], from);
    }
    away(P(rt, t0, bot), P(rt, t1, bot), P(rt, t1, top), P(rt, t0, top), [0, tipV[0]], [1, tipV[0]], [1, tipV[1]], [0, tipV[1]], inTooth);
    away(P(rr, q0, bot), P(rt, t0, bot), P(rt, t0, top), P(rr, q0, top), [0, 0.2], [0.1, 0.2], [0.1, 0.3], [0, 0.3], inTooth);
    away(P(rr, q1, bot), P(rt, t1, bot), P(rt, t1, top), P(rr, q1, top), [0, 0.2], [0.1, 0.2], [0.1, 0.3], [0, 0.3], inTooth);
    away(P(rr, q1, bot), P(rr, next, bot), P(rr, next, top), P(rr, q1, top), [0, 0.4], [0.2, 0.4], [0.2, 0.5], [0, 0.5], inRim);
    away(P(ri, a0, bot), P(ri, a1, bot), P(ri, a1, top), P(ri, a0, top), [0, 0.6], [0.2, 0.6], [0.2, 0.7], [0, 0.7], P(rr, c, 0));
  }
  const H = 16, mid = at(0, 0, 0);
  for (let k = 0; k < H; k++) {
    const a0 = (k / H) * 2 * Math.PI, a1 = ((k + 1) / H) * 2 * Math.PI;
    for (const { y, from } of sidesOf(hubTop, hubBot)) {
      const ctr = at(0, 0, y), p0 = P(rh, a0, y), p1 = P(rh, a1, y), n = cross(sub(p0, ctr), sub(p1, ctr)), m = sub(ctr, from);
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= 0) f.tri(rec, ctr, p0, p1, [0, 0.5], uv(rh, a0), uv(rh, a1));
      else f.tri(rec, ctr, p1, p0, [0, 0.5], uv(rh, a1), uv(rh, a0));
    }
    away(P(rh, a0, hubBot), P(rh, a1, hubBot), P(rh, a1, hubTop), P(rh, a0, hubTop), [0, 0.8], [0.1, 0.8], [0.1, 0.9], [0, 0.9], mid);
  }
  if (spokes) {
    for (let k = 0; k < S.spokes; k++) {
      const a = phase + (k / S.spokes) * 2 * Math.PI + pitch / 2, hw = S.spokeW * r, ca = Math.cos(a), sa = Math.sin(a);
      const Q = (rad, side, y) => at(ca * rad - sa * side, sa * rad + ca * side, y);
      const ty = top * 0.7, by = bot * 0.7, inside = Q((rh + ri) / 2, 0, 0);
      for (const { y, from } of sidesOf(ty, by)) away(Q(rh, -hw, y), Q(ri, -hw, y), Q(ri, hw, y), Q(rh, hw, y), [0, 0.3], [0.6, 0.3], [0.6, 0.35], [0, 0.35], from);
      for (const sd of [-1, 1]) away(Q(rh, sd * hw, by), Q(ri, sd * hw, by), Q(ri, sd * hw, ty), Q(rh, sd * hw, ty), [0, 0.4], [0.6, 0.4], [0.6, 0.45], [0, 0.45], inside);
    }
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

const worksFaceUv = (u, w, tipR) => [0.5 + u / (2 * tipR), SD_WORKS_FACE_V + (1 - SD_WORKS_FACE_V) * (0.5 + w / (2 * tipR))];
export function buildWorksGear(g) {
  const f = faces(), h = SD_WORKS_TOOTH.h / 2;
  layGear(f, SD_WORKS_RECORD, { r: g.r, teeth: g.teeth, at: (u, w, y) => [u, y - h, w], faceUv: worksFaceUv });
  return packRealmFaces(f);
}

export function worksMatrix(g, now, out) {
  const a = worksAngle(g, now[SD_HANG_NOW.ticks]), c = Math.cos(a), s = Math.sin(a);
  out[0] = c; out[1] = 0; out[2] = s; out[3] = 0;
  out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
  out[8] = -s; out[9] = 0; out[10] = c; out[11] = 0;
  out[12] = g.at[0]; out[13] = g.at[1]; out[14] = g.at[2]; out[15] = 1;
  return out;
}
