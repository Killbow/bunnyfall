// @ts-check

import { MW_WEAPON_TYPE } from '../../formats/mwFirstPerson.js';
import { rotAxisAngle, rotFromTo, rotFraction } from '../../combat/climbRig.js';
import { algebra, clamp01, apply, RAD, reflect, fromColumns, mul, transpose } from './bodyKit.js';
import { gripRequest } from './bodySolve.js';

const { sub, add, scale, dot, cross, norm, len, lerp, lerp3, inFrame } = algebra;

/** @param {{ mwType?: number, shown?: boolean, hands?: string, spell?: boolean }} [hand] */
export function carryClassOf({ mwType = MW_WEAPON_TYPE.None, shown = false, hands = 'single', spell = false } = {}) {
  if (spell) return 'clip';
  if (hands === 'fists' && shown) return 'fists';
  if (!shown) return 'free';
  if (hands === 'dual') return 'dual';
  switch (mwType) {
    case MW_WEAPON_TYPE.HandToHand: return 'fists';
    case MW_WEAPON_TYPE.ShortBladeOneHand: case MW_WEAPON_TYPE.LongBladeOneHand:
    case MW_WEAPON_TYPE.BluntOneHand: case MW_WEAPON_TYPE.AxeOneHand: return 'one';
    case MW_WEAPON_TYPE.LongBladeTwoHand: case MW_WEAPON_TYPE.BluntTwoClose: case MW_WEAPON_TYPE.AxeTwoHand: return 'two';
    case MW_WEAPON_TYPE.BluntTwoWide: return 'wide';
    case MW_WEAPON_TYPE.SpearTwoWide: return 'spear';
    case MW_WEAPON_TYPE.MarksmanBow: case MW_WEAPON_TYPE.MarksmanCrossbow: case MW_WEAPON_TYPE.MarksmanThrown: return 'clip';
    case MW_WEAPON_TYPE.None: return 'fists';
    default: return 'free';
  }
}

export const TWO_HAND_GRIP = Object.freeze({ two: -0.4, wide: 0.5, spear: 0.55 });
export const TWO_HAND_HAFT = Object.freeze({ two: Object.freeze([-0.5, -0.2]), wide: Object.freeze([0.15, 1.1]), spear: Object.freeze([0.2, 1.0]) });

const row = (flex, abduct, elbow, twist, swing, extra = {}) => Object.freeze({ flex, abduct, elbow, twist, swing, ...extra });
const dir = (...v) => Object.freeze(norm(v));

export const CARRY = Object.freeze({
  free: Object.freeze({
    idle: { R: row(3, 7, 10, 4, 0), L: row(3, 7, 10, 4, 0) },
    walk: { R: row(2, 8, 12, 6, 1, { gaitElbow: 1 }), L: row(2, 8, 12, 6, 1, { gaitElbow: 1 }) },
    run: { R: row(8, 18, 0, -4, 1, { gaitElbow: 1 }), L: row(8, 18, 0, -4, 1, { gaitElbow: 1 }) },
    sneak: { R: row(14, 16, 40, 10, 0.6), L: row(14, 16, 40, 10, 0.6) },
  }),
  one: Object.freeze({
    idle: { R: row(5, 21, 8, -7, 0, { blade: dir(0.26, 0.74, -0.62), edge: dir(-0.26, -0.56, -0.78) }), L: row(3, 8, 12, 4, 0) },
    walk: { R: row(5, 22, 3, -1, 0.3, { blade: dir(0.23, 0.81, -0.53), edge: dir(-0.39, -0.42, -0.82) }), L: row(2, 8, 12, 6, 1, { gaitElbow: 1 }) },
    run: { R: row(8, 21, 16, -4, 0.35, { blade: dir(0.2, 0.97, -0.14), edge: dir(-0.15, -0.11, -0.98) }), L: row(8, 18, 0, -4, 1, { gaitElbow: 1 }) },
    sneak: { R: row(21, 29, 54, -44, 0.2, { blade: dir(0.12, 0.98, -0.18), edge: dir(0.8, -0.2, -0.56) }), L: row(14, 16, 40, 10, 0.6) },
    stand: { feet: { L: [0, 0.05], R: [0.02, -0.03] }, hipYaw: -6 },
  }),
  two: Object.freeze({
    idle: { R: row(36, -3, 10, 52, 0, { blade: dir(-0.34, 0.89, -0.29), edge: dir(-0.41, -0.42, -0.81) }), L: row(0, 0, 0, 0, 0, { grip: true }) },
    walk: { R: row(40, -7, 11, 11, 0.12, { blade: dir(-0.34, 0.94, -0.1), edge: dir(-0.35, -0.22, -0.91) }), L: row(0, 0, 0, 0, 0, { grip: true }) },
    run: { R: row(43, 10, 0, -31, 0, { blade: dir(0.8, -0.23, -0.55), edge: dir(-0.31, 0.62, -0.72) }), L: row(0, 0, 0, 0, 0, { grip: true }) },
    sneak: { R: row(52, -2, 11, 52, 0.1, { blade: dir(-0.26, 0.95, 0.17), edge: dir(-0.21, 0.12, -0.97) }), L: row(0, 0, 0, 0, 0, { grip: true }) },
    stand: { feet: { L: [-0.02, 0.15], R: [0.04, -0.09] }, hipYaw: -16, lean: 3 },
    via: dir(0, -0.259, 0.966),
    runTurn: -32, runLean: 10,
  }),
  wide: Object.freeze({
    idle: { R: row(18, 10, 50, 34, 0, { blade: dir(-0.55, 0.42, 0.72), edge: dir(0, 1, 0) }), L: row(0, 0, 0, 0, 0, { grip: true }) },
    walk: { R: row(17, 12, 52, -8, 0.12, { blade: dir(-0.52, 0.42, 0.74), edge: dir(0.26, 0.91, -0.34) }), L: row(0, 0, 0, 0, 0, { grip: true }) },
    run: { R: row(-2, 15, 33, -49, 0.2, { blade: dir(0.44, -0.85, -0.3), edge: dir(-0.13, 0.27, -0.96) }), L: row(8, 18, 0, -4, 1, { gaitElbow: 1 }) },
    sneak: { R: row(21, 11, 57, 8, 0.1, { blade: dir(-0.52, 0.53, 0.67), edge: dir(-0.06, 0.76, -0.65) }), L: row(0, 0, 0, 0, 0, { grip: true }) },
    stand: { feet: { L: [-0.02, 0.12], R: [0.04, -0.07] }, hipYaw: -12, lean: 2 },
    via: dir(-0.259, 0, 0.966),
  }),
  spear: Object.freeze({
    idle: { R: row(11, 12, 40, 55, 0, { blade: dir(-0.33, 0.74, 0.58), edge: dir(0.26, 0.66, -0.7) }), L: row(0, 0, 0, 0, 0, { grip: true }) },
    walk: { R: row(3, 19, 62, 25, 0.12, { blade: dir(-0.54, 0.69, 0.49), edge: dir(0.05, 0.61, -0.79) }), L: row(0, 0, 0, 0, 0, { grip: true }) },
    run: { R: row(-7, 17, 35, -21, 0.2, { blade: dir(0.05, 0.97, -0.23), edge: dir(-0.09, -0.22, -0.97) }), L: row(8, 18, 0, -4, 1, { gaitElbow: 1 }) },
    sneak: { R: row(-11, 5, 67, -15, 0.1, { blade: dir(-0.29, 0.76, 0.59), edge: dir(0.03, 0.62, -0.78) }), L: row(0, 0, 0, 0, 0, { grip: true }) },
    stand: { feet: { L: [-0.02, 0.14], R: [0.04, -0.08] }, hipYaw: -14, lean: 2 },
  }),
  dual: Object.freeze({
    idle: { R: row(8, 23, 12, -34, 0, { blade: dir(0.24, 0.8, -0.55), edge: dir(-0.49, -0.39, -0.78) }), L: row(8, 23, 12, -34, 0, { blade: dir(0.24, 0.8, -0.55), edge: dir(-0.49, -0.39, -0.78), mirror: true }) },
    walk: { R: row(5, 24, 6, 28, 0.28, { blade: dir(0.31, 0.81, -0.51), edge: dir(-0.38, -0.38, -0.84) }), L: row(5, 24, 6, 28, 0.28, { blade: dir(0.31, 0.81, -0.51), edge: dir(-0.38, -0.38, -0.84), mirror: true }) },
    run: { R: row(-42, 10, 8, -60, 0.4, { blade: dir(0.55, -0.8, 0.3), edge: dir(0.3, -0.14, -0.94), gaitElbow: 0.2 }), L: row(-42, 10, 8, -60, 0.4, { blade: dir(0.55, -0.8, 0.3), edge: dir(0.3, -0.14, -0.94), gaitElbow: 0.2, mirror: true }) },
    sneak: { R: row(20, 20, 30, -44, 0.15, { blade: dir(0.12, 0.98, -0.18), edge: dir(0.26, -0.2, -0.95) }), L: row(20, 20, 30, -44, 0.15, { blade: dir(0.12, 0.98, -0.18), edge: dir(0.26, -0.2, -0.95), mirror: true }) },
    stand: { feet: { L: [-0.03, 0.06], R: [0.03, -0.04] }, hipYaw: -4 },
    runLean: 7,
    via: dir(0, 0.259, 0.966),
  }),
  fists: Object.freeze({
    idle: { R: row(34, 20, 118, 12, 0, { fist: true }), L: row(48, 18, 104, 10, 0, { fist: true }) },
    walk: { R: row(34, 20, 116, 12, 0.1, { fist: true }), L: row(48, 18, 102, 10, 0.1, { fist: true }) },
    run: { R: row(14, 18, 20, -4, 1, { fist: true, gaitElbow: 1 }), L: row(14, 18, 20, -4, 1, { fist: true, gaitElbow: 1 }) },
    sneak: { R: row(36, 20, 112, 12, 0.1, { fist: true }), L: row(46, 18, 100, 10, 0.1, { fist: true }) },
    stand: { feet: { L: [0, 0.16], R: [0.03, -0.08] }, hipYaw: -18, lean: 4 },
  }),
});

export const rideOf = (r) => (r.blade ? 0 : clamp01(r.swing));

export function strideRide(cls, shares, armWL = 1) {
  return 1 - clamp01(blendRow(cls, 'L', shares).grip) * clamp01(armWL);
}

export function gaitShares(gp) {
  const m = clamp01(gp.move), sn = clamp01(gp.sneak), rn = clamp01(gp.run);
  const sneak = sn;
  const moving = (1 - sn) * m;
  return { idle: (1 - sn) * (1 - m), walk: moving * (1 - rn), run: moving * rn, sneak };
}

function slerpV(a, b, t) {
  const c = Math.min(1, Math.max(-1, dot(a, b))), th = Math.acos(c);
  if (th < 1e-6) return a;
  return norm(add(scale(a, Math.sin((1 - t) * th) / Math.sin(th)), scale(b, Math.sin(t * th) / Math.sin(th))));
}

export function blendRow(cls, side, shares) {
  const table = CARRY[cls] ?? CARRY.free;
  const out = { flex: 0, abduct: 0, elbow: 0, twist: 0, swing: 0, gaitElbow: 0, blade: null, edge: null, grip: 0, fist: false, mirror: false };
  let bw = 0, aw = 0;
  const still = [0, 0, 0], stillEdge = [0, 0, 0];
  for (const g of ['idle', 'walk', 'run', 'sneak']) {
    const k = shares[g];
    if (!(k > 0)) continue;
    const r = table[g][side];
    if (r.grip) { out.grip += k; continue; }
    aw += k;
    out.flex += r.flex * k; out.abduct += r.abduct * k; out.elbow += r.elbow * k; out.twist += r.twist * k;
    out.swing += r.swing * k; out.gaitElbow += (r.gaitElbow ?? 0) * k;
    if (r.blade) {
      bw += k;
      if (g !== 'run') for (let i = 0; i < 3; i++) { still[i] += r.blade[i] * k; stillEdge[i] += r.edge[i] * k; }
    }
    if (r.fist) out.fist = true;
    if (r.mirror) out.mirror = true;
  }
  if (aw > 0 && aw < 1) for (const key of ['flex', 'abduct', 'elbow', 'twist', 'swing', 'gaitElbow']) out[key] /= aw;
  if (bw > 0) {
    const run = table.run?.[side]?.blade ? (shares.run > 0 ? shares.run : 0) : 0;
    const s = run / bw;
    if (s <= 0) { out.blade = norm(still); out.edge = norm(stillEdge); }
    else if (s >= 1) { out.blade = table.run[side].blade; out.edge = table.run[side].edge; }
    else {
      const A0 = norm(still), A1 = table.run[side].blade, V = table.via ?? null;
      if (V) {
        const t1 = Math.acos(Math.min(1, dot(A0, V))), t2 = Math.acos(Math.min(1, dot(V, A1))), u = s * (t1 + t2);
        out.blade = u < t1 ? slerpV(A0, V, t1 > 0 ? u / t1 : 1) : slerpV(V, A1, t2 > 0 ? (u - t1) / t2 : 1);
      } else out.blade = slerpV(A0, A1, s);
      out.edge = norm(lerp3(norm(stillEdge), table.run[side].edge, s));
    }
  }
  return out;
}

export function armByAngles(side, S, F, a, b, { flex = 0, abduct = 0, elbow = 0, twist = 0 }) {
  const sgn = side === 'R' ? 1 : -1;
  const down = scale(F.up, -1);
  const Rf = rotAxisAngle(F.right, flex * RAD);
  const Ra = rotAxisAngle(F.fwd, -sgn * abduct * RAD);
  const upper = apply(Ra, apply(Rf, down));
  let hinge = apply(Ra, apply(Rf, F.right));
  hinge = apply(rotAxisAngle(scale(upper, -1), sgn * twist * RAD), hinge);
  const fore = apply(rotAxisAngle(hinge, Math.max(0, elbow) * RAD), upper);
  const E = add(S, scale(upper, a)), W = add(E, scale(fore, b));
  const sw = sub(W, S);
  const ls = len(sw);
  const along = ls > 1e-9 ? scale(sw, dot(sub(E, S), sw) / (ls * ls)) : [0, 0, 0];
  const pole = norm(sub(sub(E, S), along));
  return { wrist: W, elbow: E, upper, fore, hinge, pole: len(pole) > 0.5 ? pole : norm(scale(F.fwd, -1)) };
}

function freeHand(side, arm, F, fist) {
  const sgn = side === 'R' ? 1 : -1;
  const fingers = fist ? norm(add(arm.fore, scale(F.fwd, 0.15))) : norm(add(arm.fore, scale(F.fwd, 0.08)));
  const inward = scale(F.right, -sgn);
  const palm = norm(sub(inward, scale(fingers, dot(inward, fingers))));
  return { fingers, palm };
}

function withSwing(side, r, gp) {
  const sgn = side === 'R' ? 1 : -1;
  const swing = (gp.arm.swing ?? 0) * sgn * r.swing;
  const fwdShare = (Math.cos(2 * Math.PI * gp.arm.phase) * sgn + 1) / 2;
  const gaitElbow = lerp(gp.arm.elbow[0], gp.arm.elbow[1], fwdShare);
  const k = clamp01(r.gaitElbow);
  return {
    ...r,
    flex: r.flex + swing / RAD + (gp.arm.bias / RAD) * r.swing,
    elbow: lerp(r.elbow, gaitElbow, k),
    abduct: lerp(r.abduct, gp.arm.abduct / RAD, k),
  };
}

export function turnAbout(h, S, R) {
  if (!h) return h;
  const pt = (p) => add(S, apply(R, sub(p, S)));
  const way = (d) => (d ? apply(R, d) : d);
  return {
    ...h, at: pt(h.at), fingers: way(h.fingers), palm: way(h.palm), pole: way(h.pole),
    ...(h.grip ? { grip: pt(h.grip) } : {}),
    ...(h.frame ? { frame: { blade: apply(R, h.frame.blade), edge: apply(R, h.frame.edge), flat: apply(R, h.frame.flat) } } : {}),
  };
}

export function mirrorRequest(h, C, n) {
  if (!h) return null;
  const pt = (p) => add(C, reflect(sub(p, C), n));
  return { ...h, at: pt(h.at), fingers: h.fingers && reflect(h.fingers, n), palm: h.palm && reflect(h.palm, n), pole: h.pole && reflect(h.pole, n) };
}

export function hafHand(rightReq, rightGrip, Rblade, along, arm, slide = null) {
  if (!rightReq) return null;
  const b = norm(Rblade.blade), n = norm(Rblade.flat);
  const req = mirrorRequest(rightReq, rightGrip, n);
  let a = along;
  if (slide && arm > 0) {
    const [lo, hi] = slide.range, R = slide.reach * 0.98, d = sub(req.at, slide.shoulder);
    const bd = dot(b, d), disc = bd * bd - (dot(d, d) - R * R);
    const clampTo = (x) => Math.min(hi, Math.max(lo, x));
    if (disc >= 0) {
      const x1 = (-bd - Math.sqrt(disc)) / arm, x2 = (-bd + Math.sqrt(disc)) / arm;
      const inLo = Math.max(lo, x1), inHi = Math.min(hi, x2);
      a = inLo <= inHi ? Math.min(inHi, Math.max(inLo, along)) : clampTo(-bd / arm);
    } else a = clampTo(-bd / arm);
  }
  return { ...req, at: add(req.at, scale(b, a * arm)), along: a };
}

export function trunkPush(at, a, c, fwd, clear) {
  const ab = sub(c, a), u = norm(ab);
  const t = Math.max(0, Math.min(1, dot(sub(at, a), ab) / dot(ab, ab)));
  const v = sub(at, add(a, scale(ab, t)));
  if (len(v) >= clear) return 0;
  const f = sub(fwd, scale(u, dot(fwd, u))), ff = dot(f, f), vf = dot(v, f);
  if (ff < 1e-9) return 0;
  return Math.max(0, (-vf + Math.sqrt(Math.max(0, vf * vf - ff * (dot(v, v) - clear * clear)))) / ff);
}

export function carryHands(cls, gp, ctx, { armW = { L: 1, R: 1 }, shares: given = null, steady = null } = {}) {
  if (cls === 'clip') return { L: null, R: null };
  const { body, mats, frames } = ctx;
  const F = { right: frames.right, fwd: frames.fwd, up: frames.up };
  const shares = given ?? gaitShares(gp);
  const out = { L: null, R: null, grip: { L: null, R: null } };
  const C = scale(add(frames.shoulder.L, frames.shoulder.R), 0.5);
  const held = (req, S, r) => {
    const k = steady && steady.ride > 1e-6 ? clamp01(1 - rideOf(r) / steady.ride) : 0;
    return req && k > 1e-6 ? turnAbout(req, S, k < 1 - 1e-9 ? rotFraction(steady.turn, k) : steady.turn) : req;
  };
  for (const side of ['R', 'L']) {
    if (!(armW[side] > 0)) continue;
    const r = withSwing(side, blendRow(cls, side, shares), gp);
    if (r.grip >= 1 - 1e-9) continue;
    const S = frames.shoulder[side];
    const limb = body.bones[side];
    const a = len(sub(at(mats, limb.fore), at(mats, limb.upper))), b = len(sub(at(mats, limb.hand), at(mats, limb.fore)));
    if (r.blade && r.mirror && side === 'L') {
      const arm = armByAngles('R', add(C, reflect(sub(S, C), F.right)), F, a, b, r);
      const req = gripRequest(mats, body, 'R', body.wb, { wrist: arm.wrist, blade: inFrame(frames.chest, r.blade), edge: inFrame(frames.chest, r.edge), pole: arm.pole, w: armW.L });
      out.L = held(req && mirrorRequest(req, C, F.right), S, r);
      continue;
    }
    const arm = armByAngles(side, S, F, a, b, r);
    if (r.blade && side === 'R') {
      const req = held(gripRequest(mats, body, 'R', body.wb, { wrist: arm.wrist, blade: inFrame(frames.chest, r.blade), edge: inFrame(frames.chest, r.edge), pole: arm.pole, w: armW.R }), S, r);
      out.R = req;
      if (req) out.grip.R = req.grip;
      continue;
    }
    const hand = freeHand(side, arm, F, r.fist);
    out[side] = held({ at: arm.wrist, fingers: hand.fingers, palm: hand.palm, pole: arm.pole, w: armW[side] }, S, r);
  }
  const lRow = blendRow(cls, 'L', shares);
  if (lRow.grip > 0 && out.R && out.grip.R && TWO_HAND_GRIP[cls] != null && armW.L > 0) {
    const haf = hafHand(out.R, out.grip.R, out.R.frame, TWO_HAND_GRIP[cls], body.arm, { shoulder: frames.shoulder.L, reach: body.arms.L, range: TWO_HAND_HAFT[cls] });
    if (haf) {
      haf.w = armW.L;
      haf.pole = norm(add(scale(F.right, -0.55), add(scale(F.up, -0.75), scale(F.fwd, 0.45))));
      const k = clamp01(lRow.grip);
      out.L = k >= 1 - 1e-9 || !out.L ? haf : blendHand(out.L, haf, k * k * (3 - 2 * k));
    }
  }
  return out;
}

export function blendHand(a, b, t) {
  if (!a) return b && t > 0 ? { ...b, w: (b.w ?? 1) * t } : null;
  if (!b || !(t > 0)) return a;
  if (t >= 1) return b;
  let fingers = b.fingers ?? a.fingers, palm = b.palm ?? a.palm;
  if (a.fingers && b.fingers && a.palm && b.palm) {
    const frame = (f, p) => { const x = norm(f), z = norm(cross(x, p)); return fromColumns(x, cross(z, x), z); };
    const Ra = frame(a.fingers, a.palm), Q = rotFraction(mul(frame(b.fingers, b.palm), transpose(Ra)), t);
    fingers = apply(Q, norm(a.fingers)); palm = apply(Q, norm(sub(a.palm, scale(norm(a.fingers), dot(a.palm, norm(a.fingers))))));
  } else if (a.fingers && b.fingers) fingers = apply(rotFraction(rotFromTo(norm(a.fingers), norm(b.fingers)), t), norm(a.fingers));
  const pole = a.pole && b.pole ? apply(rotFraction(rotFromTo(norm(a.pole), norm(b.pole)), t), norm(a.pole)) : (b.pole ?? a.pole);
  return { ...a, at: lerp3(a.at, b.at, t), fingers, palm, pole, w: lerp(a.w ?? 1, b.w ?? 1, t) };
}

const at = (mats, ref) => mats.get(ref)?.t ?? [0, 0, 0];
