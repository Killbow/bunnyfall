// @ts-check

import { solveReach, rotFrames, rotFromTo, rotFraction, handFrame, orthonormal, rotationPart } from '../../combat/climbRig.js';
import { algebra, clamp01, clamp, transpose, apply, mul, bodyTurn, fromColumns, bodyOf, turnOf, at, RAD } from './bodyKit.js';

const { sub, add, scale, dot, cross, norm, len, lerp3 } = algebra;

const TRUNK_SHARE = Object.freeze({ 2: [0.45], 3: [0.3, 0.65] });

export function bodyFrames(body, mats) {
  const Rc = turnOf(mats, body.chest);
  const Rr = body.restRot.get(body.chest);
  if (!Rc || !Rr) return null;
  const M = mul(Rc, mul(transpose(Rr), transpose(body.chestFix)));
  return {
    chest: M,
    right: [M[0], M[3], M[6]], fwd: [M[1], M[4], M[7]], up: [M[2], M[5], M[8]],
    shoulder: { L: at(mats, body.bones.L.upper), R: at(mats, body.bones.R.upper) },
    wrist: { L: at(mats, body.bones.L.hand), R: at(mats, body.bones.R.hand) },
  };
}

export const ANKLE = Object.freeze({ dorsi: 25, plantar: 50 });

const IDENT = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const toward = (Rc, Rt, w) => (w >= 1 ? Rt : mul(rotFraction(mul(Rt, transpose(Rc)), w), Rc));

export function solveBody(skeleton, pose, rootRef, skelMats, plan) {
  const w = clamp01(plan?.w ?? 0);
  if (!(w > 0)) return null;
  const body = bodyOf(skeleton, rootRef, skelMats);
  if (!body) return null;
  const { bones } = body;
  const report = { hip: null, reach: { L: null, R: null }, feet: { L: null, R: null } };
  const decided = new Map();
  const localRot = (ref) => (pose.get(ref) ?? skeleton.nodes.get(ref).rest).rotation;
  const clipRot = new Map();
  const R0 = (ref) => {
    if (clipRot.has(ref)) return clipRot.get(ref);
    const node = skeleton.nodes.get(ref);
    if (!node) return null;
    if (ref === rootRef) return IDENT;
    const p = node.parent;
    const R = p != null && p !== rootRef && skeleton.nodes.has(p) ? mul(R0(p), localRot(ref)) : localRot(ref);
    clipRot.set(ref, R);
    return R;
  };
  const touched = (ref) => { for (let r = ref; r != null && skeleton.nodes.has(r); r = skeleton.nodes.get(r).parent) if (decided.has(r)) return true; return false; };
  const rotNow = (ref) => {
    if (decided.has(ref)) return decided.get(ref);
    const p = skeleton.nodes.get(ref)?.parent;
    return p != null && skeleton.nodes.has(p) && touched(p) ? mul(rotNow(p), localRot(ref)) : R0(ref);
  };
  const order = [];
  const decide = (ref, Rt) => { if (ref == null || !R0(ref)) return; decided.set(ref, toward(rotNow(ref), Rt, w)); order.push(ref); };
  if (plan.hip) {
    const D = mul(bodyTurn(plan.hip.yaw ?? 0, plan.hip.roll ?? 0, plan.hip.pitch ?? 0), body.hipFix);
    for (const ref of new Set([bones.pelvis, body.hipBone])) if (ref != null && body.restRot.has(ref)) decide(ref, mul(D, body.restRot.get(ref)));
  }
  const armL = clamp01(plan.armW?.L ?? 1), armR = clamp01(plan.armW?.R ?? 1), armAny = Math.max(armL, armR);
  if (plan.chest) {
    const own = mul(mul(bodyTurn(plan.chest.yaw ?? 0, plan.chest.roll ?? 0, plan.chest.pitch ?? 0), body.chestFix), body.restRot.get(body.chest));
    const Rt0 = armAny >= 1 ? own : toward(R0(body.chest), own, armAny);
    const chestNow = rotNow(body.chest);
    const Rt = toward(chestNow, Rt0, w);
    const Q = mul(Rt, transpose(chestNow));
    const shares = TRUNK_SHARE[body.trunk.length] ?? [];
    const carried = body.trunk.map((ref) => rotNow(ref));
    body.trunk.forEach((ref, i) => {
      decided.set(ref, ref === body.chest ? Rt : mul(rotFraction(Q, shares[i] ?? 0.5), carried[i]));
      order.push(ref);
    });
    for (const ref of [bones.neck, bones.L.clavicle, bones.R.clavicle]) {
      const parent = ref == null ? null : skeleton.nodes.get(ref).parent;
      const restOf = ref == null ? null : restRotOf(skeleton, body, ref), restParent = parent == null ? null : restRotOf(skeleton, body, parent);
      const share = ref === bones.L.clavicle ? armL : ref === bones.R.clavicle ? armR : armAny;
      if (restOf && restParent) decide(ref, toward(rotNow(ref), mul(rotNow(parent), mul(transpose(restParent), restOf)), share));
    }
  }
  if (plan.head && bones.head != null && body.restRot.has(bones.head)) {
    decide(bones.head, toward(rotNow(bones.head), mul(bodyTurn(plan.head.yaw ?? 0, plan.head.roll ?? 0, plan.head.pitch ?? 0), body.restRot.get(bones.head)), armAny));
  }
  for (const ref of order) {
    const node = skeleton.nodes.get(ref);
    const local = pose.get(ref) ?? node.rest;
    const p = node.parent;
    const Rp = p != null && skeleton.nodes.has(p) ? rotNow(p) : null;
    pose.set(ref, { rotation: orthonormal(Rp ? mul(transpose(Rp), decided.get(ref)) : decided.get(ref)), translation: local.translation, scale: local.scale });
  }
  const mats = skelMats(skeleton, pose, rootRef);
  if (plan.hip?.at) {
    const mid = scale(add(at(mats, bones.L.thigh), at(mats, bones.R.thigh)), 0.5);
    const dv = scale(sub(plan.hip.at, mid), w);
    if (len(dv) > 1e-6) moveSubtree(skeleton, pose, mats, bones, bones.root, dv);
    report.hip = scale(add(at(mats, bones.L.thigh), at(mats, bones.R.thigh)), 0.5);
  }
  if (plan.feet) {
    for (const side of ['L', 'R']) {
      const f = plan.feet[side];
      if (f) report.feet[side] = poseFoot(skeleton, pose, mats, body, side, f, w);
    }
  }
  if (plan.arms) {
    const frames = bodyFrames(body, mats);
    const req = frames ? plan.arms({ body, mats, frames, skeleton }) : null;
    if (req) {
      for (const side of ['L', 'R']) {
        const h = req[side];
        if (!h || !h.at) continue;
        const wr = poseHand(skeleton, pose, mats, body, side, h, w);
        if (wr) report.reach[side] = len(sub(wr, h.at));
      }
    }
  }
  report.mats = mats;
  return report;
}

function moveSubtree(skeleton, pose, mats, bones, ref, dv) {
  const node = skeleton.nodes.get(ref);
  const local = pose.get(ref) ?? node.rest;
  const parent = mats.get(node.parent);
  let lv = dv;
  if (parent) {
    const sp = Math.hypot(parent.a[0], parent.a[3], parent.a[6]) || 1;
    lv = scale(apply(transpose(rotationPart(parent.a)), dv), 1 / sp);
  }
  pose.set(ref, { rotation: local.rotation, translation: [local.translation[0] + lv[0], local.translation[1] + lv[1], local.translation[2] + lv[2]], scale: local.scale });
  const stack = [ref];
  while (stack.length) {
    const r = stack.pop();
    const t = mats.get(r)?.t;
    if (t) { t[0] += dv[0]; t[1] += dv[1]; t[2] += dv[2]; }
    for (const k of bones.children.get(r) ?? []) stack.push(k);
  }
}
const _restRots = new WeakMap();
function restRotOf(skeleton, body, ref) {
  if (body.restRot.has(ref)) return body.restRot.get(ref);
  let per = _restRots.get(skeleton);
  if (!per) { per = new Map(); _restRots.set(skeleton, per); }
  if (per.has(ref)) return per.get(ref);
  const chain = [];
  for (let r = ref; r != null && r >= 0 && skeleton.nodes.has(r); r = skeleton.nodes.get(r).parent) chain.push(skeleton.nodes.get(r));
  if (!chain.length) return null;
  /** @type {ArrayLike<number>} */
  let R = IDENT;
  for (let i = chain.length - 1; i >= 0; i--) R = mul(R, chain[i].rest.rotation);
  per.set(ref, R);
  return R;
}

function reachLimb(skeleton, pose, mats, a, b, c, target, pole, end) {
  const nb = skeleton.nodes.get(b), nc = skeleton.nodes.get(c);
  if (!nb || !nc || nb.parent !== a || nc.parent !== b) return null;
  const S = at(mats, a), E = at(mats, b), W = at(mats, c);
  const Ra = turnOf(mats, a), Rb = turnOf(mats, b), Rc = turnOf(mats, c), Rp = turnOf(mats, skeleton.nodes.get(a).parent);
  if (!S || !E || !W || !Ra || !Rb || !Rc) return null;
  const sol = solveReach(S, len(sub(E, S)), len(sub(W, E)), target, pole, 0.999);
  const Da = rotFromTo(norm(sub(E, S)), norm(sub(sol.mid, S)));
  const Db = rotFromTo(norm(apply(Da, sub(W, E))), norm(sub(sol.end, sol.mid)));
  const Ra1 = mul(Da, Ra), Rb1 = mul(Db, mul(Da, Rb)), Rc0 = mul(Db, mul(Da, Rc));
  const Rc1 = (end && end(Rc0, mul(Db, Da), sol)) || Rc0;
  const write = (ref, Rparent, R) => {
    const local = pose.get(ref) ?? skeleton.nodes.get(ref).rest;
    pose.set(ref, { rotation: orthonormal(Rparent ? mul(transpose(Rparent), R) : R), translation: local.translation, scale: local.scale });
  };
  write(a, Rp, Ra1);
  write(b, Ra1, Rb1);
  write(c, Rb1, Rc1);
  return sol.end;
}

function poseFoot(skeleton, pose, mats, body, side, f, w) {
  const limb = body.bones[side];
  const k = clamp01((f.w ?? 1) * w);
  const A = at(mats, limb.foot);
  if (!(k > 0) || !f.at || !A) return null;
  const toe = f.toe ?? [0, 1, 0];
  const out = side === 'R' ? 1 : -1;
  const pole = norm(add([toe[0], toe[1], 0], [out * 0.12, 0, 0.02]));
  const ax = body.footAxes[side];
  return reachLimb(skeleton, pose, mats, limb.thigh, limb.calf, limb.foot, lerp3(A, f.at, k), pole, (Rf, _D, sol) => {
    if (!ax || !f.toe) return null;
    const curToe = norm(apply(Rf, ax.fwd)), curUp = norm(apply(Rf, ax.up));
    let toeTo = norm(lerp3(curToe, f.toe, k)), upTo = norm(lerp3(curUp, f.up ?? [0, 0, 1], k));
    if (f.stance === false && sol) {
      const shin = norm(sub(sol.mid, sol.end));
      const a = Math.acos(clamp(dot(shin, toeTo), -1, 1)), rest = body.ankleRest?.[side] ?? Math.PI / 2;
      const want = clamp(a, rest - ANKLE.dorsi * RAD, rest + ANKLE.plantar * RAD);
      const across = sub(toeTo, scale(shin, dot(toeTo, shin)));
      if (want !== a && len(across) > 1e-6) {
        const t2 = add(scale(shin, Math.cos(want)), scale(norm(across), Math.sin(want)));
        upTo = norm(apply(rotFromTo(toeTo, t2), upTo));
        toeTo = t2;
      }
    }
    return mul(rotFrames(curToe, curUp, toeTo, upTo), Rf);
  });
}

function poseHand(skeleton, pose, mats, body, side, h, w) {
  const limb = body.bones[side];
  const k = clamp01((h.w ?? 1) * w);
  const S = at(mats, limb.upper), E = at(mats, limb.fore), W = at(mats, limb.hand);
  if (!(k > 0) || !h.at || !S || !E || !W) return null;
  const sw = norm(sub(W, S));
  const clipElbow = norm(sub(E, add(S, scale(sw, dot(sub(E, S), sw)))));
  const pole = h.pole ? norm(lerp3(len(clipElbow) > 0.5 ? clipElbow : h.pole, h.pole, k)) : clipElbow;
  const fr = h.fingers ? handFrame(mats, limb, side) : null;
  return reachLimb(skeleton, pose, mats, limb.upper, limb.fore, limb.hand, lerp3(W, h.at, k), pole, (Rh, D) => {
    if (!fr) return null;
    const f0 = norm(apply(D, fr.fingers)), p0 = fr.palm ? norm(apply(D, fr.palm)) : null;
    const want = norm(lerp3(f0, h.fingers, k));
    return mul(p0 && h.palm ? rotFrames(f0, p0, want, norm(lerp3(p0, h.palm, k))) : rotFromTo(f0, want), Rh);
  });
}

export function gripRequest(mats, body, side, wbRef, { grip = null, wrist = null, blade, edge, pole = null, w = 1 }) {
  const limb = body.bones[side];
  const hand = mats.get(limb.hand), wb = wbRef == null ? null : mats.get(wbRef);
  if (!hand || !wb) return null;
  const fr = handFrame(mats, limb, side);
  if (!fr || !fr.palm) return null;
  const b = norm(blade);
  let e = sub(edge, scale(b, dot(edge, b)));
  if (len(e) < 1e-4) e = sub([0, 0, -1], scale(b, -b[2]));
  e = norm(e);
  const Rwb = fromColumns(e, b, cross(e, b));
  const Rh = turnOf(mats, limb.hand), Rb = turnOf(mats, wbRef);
  const relR = mul(transpose(Rh), Rb), relT = apply(transpose(Rh), sub(wb.t, hand.t));
  const RhWant = mul(Rwb, transpose(relR));
  const inHand = (v) => norm(apply(RhWant, apply(transpose(Rh), v)));
  const off = apply(RhWant, relT);
  const wristAt = wrist ?? sub(grip, off);
  return {
    at: wristAt, fingers: inHand(fr.fingers), palm: inHand(fr.palm), pole, w,
    grip: grip ?? add(wristAt, off), frame: { blade: b, edge: e, flat: cross(e, b) },
  };
}

export function weaponFrame(mats, wbRef) {
  const m = wbRef == null ? null : mats.get(wbRef);
  if (!m) return null;
  const R = turnOf(mats, wbRef);
  return { grip: m.t, blade: [R[1], R[4], R[7]], edge: [R[0], R[3], R[6]], flat: [R[2], R[5], R[8]] };
}
