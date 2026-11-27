// Poses the climb by inverse kinematics on any skeleton, reading every bone length and axis off the frame being
// posed. Requests are in rig space: Morrowind units, Z up, the actor facing +Y, and its right +X.
// Untracked bones share the skeleton's node.rest entry, so every write goes through pose.set as a new entry.
import { mat33Mul } from '../formats/mwNifMesh.js';
import { HELD_BONE_ALIASES } from './heldPose.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const IDENT = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const transpose = (m) => Float32Array.from([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
export function rotationPart(a) {
  const s = Math.hypot(a[0], a[3], a[6]);
  if (!(s > 1e-8) || Math.abs(s - 1) < 1e-7) return a;
  const out = new Float32Array(9);
  for (let i = 0; i < 9; i++) out[i] = a[i] / s;
  return out;
}

export function rotAxisAngle(axis, ang) {
  const [x, y, z] = axis, c = Math.cos(ang), s = Math.sin(ang), k = 1 - c;
  return Float32Array.from([
    c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k,
  ]);
}
export function rotFromTo(a, b) {
  const c = dot(a, b);
  if (c > 1 - 1e-12) return Float32Array.from(IDENT);
  if (c < -1 + 1e-9) {
    let ax = cross([1, 0, 0], a);
    if (len(ax) < 1e-6) ax = cross([0, 1, 0], a);
    return rotAxisAngle(norm(ax), Math.PI);
  }
  return rotAxisAngle(norm(cross(a, b)), Math.acos(Math.min(1, Math.max(-1, c))));
}
export function rotFrames(f0, u0, f1, u1) {
  const r = rotFromTo(f0, f1);
  const u = apply(r, u0);
  const p0 = sub(u, scale(f1, dot(u, f1))), p1 = sub(u1, scale(f1, dot(u1, f1)));
  if (len(p0) < 1e-9 || len(p1) < 1e-9) return r;
  const n0 = norm(p0), n1 = norm(p1);
  return mat33Mul(rotAxisAngle(f1, Math.atan2(dot(cross(n0, n1), f1), dot(n0, n1))), r);
}
export function rotFraction(m, t) {
  if (t >= 1) return m;
  const ang = Math.acos(Math.min(1, Math.max(-1, (m[0] + m[4] + m[8] - 1) / 2)));
  if (ang < 1e-9 || t <= 0) return Float32Array.from(IDENT);
  const s = 2 * Math.sin(ang);
  let axis = [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s];
  if (!(len(axis) > 1e-6)) {
    const xx = Math.sqrt(Math.max(0, (m[0] + 1) / 2)), yy = Math.sqrt(Math.max(0, (m[4] + 1) / 2)), zz = Math.sqrt(Math.max(0, (m[8] + 1) / 2));
    axis = xx >= yy && xx >= zz ? [xx, m[1] / (2 * xx), m[2] / (2 * xx)] : yy >= zz ? [m[1] / (2 * yy), yy, m[5] / (2 * yy)] : [m[2] / (2 * zz), m[5] / (2 * zz), zz];
  }
  return rotAxisAngle(norm(axis), ang * t);
}

export function solveReach(root, a, b, target, pole, maxFrac = 0.995) {
  const d = sub(target, root);
  let dist = len(d);
  const dir = dist > 1e-9 ? scale(d, 1 / dist) : norm(pole.length ? cross(pole, [0, 0, 1]) : [0, 0, -1]);
  const most = (a + b) * maxFrac, least = Math.abs(a - b) * 1.001 + 1e-6;
  dist = Math.min(Math.max(dist, least), most);
  const cosA = Math.min(1, Math.max(-1, (a * a + dist * dist - b * b) / (2 * a * dist)));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  let side = sub(pole, scale(dir, dot(pole, dir)));
  if (len(side) < 1e-9) side = cross(dir, Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
  side = norm(side);
  return { mid: add(root, add(scale(dir, a * cosA), scale(side, a * sinA))), end: add(root, scale(dir, dist)) };
}

const ATTACH_OF = Object.fromEntries(Object.entries(HELD_BONE_ALIASES).map(([attach, bip]) => [bip, attach]));
const named = (bip) => (ATTACH_OF[bip] ? [bip, ATTACH_OF[bip]] : [bip]);
const LIMB_NAMES = Object.freeze({
  L: { clavicle: named('bip01 l clavicle'), upper: named('bip01 l upperarm'), fore: named('bip01 l forearm'), hand: named('bip01 l hand'),
    thigh: ['bip01 l thigh', 'left upper leg'], calf: ['bip01 l calf', 'left knee'], foot: ['bip01 l foot', 'left foot'], toe: ['bip01 l toe0'] },
  R: { clavicle: named('bip01 r clavicle'), upper: named('bip01 r upperarm'), fore: named('bip01 r forearm'), hand: named('bip01 r hand'),
    thigh: ['bip01 r thigh', 'right upper leg'], calf: ['bip01 r calf', 'right knee'], foot: ['bip01 r foot', 'right foot'], toe: ['bip01 r toe0'] },
});
const SPINE_NAMES = Object.freeze(['bip01 spine', 'bip01 spine1', 'bip01 spine2']);
const THUMB_RE = /(finger0|thumb)\d*$/;
const FINGER_RE = /(finger[1-9]|pointer|middle|ring|pinky|index)\d*$/;

const _bones = new WeakMap();
export function climbBones(skeleton) {
  if (!skeleton || !skeleton.byName) return null;
  const hit = _bones.get(skeleton);
  if (hit) return hit;
  const find = (names) => { for (const n of names) { const r = skeleton.byName.get(n); if (r !== undefined) return r; } return null; };
  const children = new Map();
  for (const [ref, node] of skeleton.nodes) {
    if (!children.has(node.parent)) children.set(node.parent, []);
    children.get(node.parent).push(ref);
  }
  const nameOf = (ref) => (skeleton.nodes.get(ref)?.name || '').toLowerCase();
  const chainFrom = (ref) => { const out = [ref]; let at = ref; for (;;) { const kids = (children.get(at) ?? []).filter((k) => FINGER_RE.test(nameOf(k)) || THUMB_RE.test(nameOf(k))); if (kids.length !== 1) break; at = kids[0]; out.push(at); } return out; };
  const side = (s) => {
    const n = LIMB_NAMES[s];
    const hand = find(n.hand);
    const digits = hand == null ? [] : (children.get(hand) ?? []).filter((k) => FINGER_RE.test(nameOf(k)) || THUMB_RE.test(nameOf(k)));
    return {
      clavicle: find(n.clavicle), upper: find(n.upper), fore: find(n.fore), hand,
      fingers: digits.filter((k) => !THUMB_RE.test(nameOf(k))).map(chainFrom),
      thumb: digits.filter((k) => THUMB_RE.test(nameOf(k))).map(chainFrom)[0] ?? null,
      thigh: find(n.thigh), calf: find(n.calf), foot: find(n.foot), toe: find(n.toe),
    };
  };
  let root = find(['bip01']);
  if (root == null) for (const [ref, node] of skeleton.nodes) { if (node.parent < 0 || !skeleton.nodes.has(node.parent)) { root = ref; break; } }
  const out = {
    L: side('L'), R: side('R'),
    spine: SPINE_NAMES.map((n) => skeleton.byName.get(n)).filter((r) => r !== undefined),
    neck: find(['bip01 neck', 'neck']), head: find(['bip01 head', 'head']),
    pelvis: find(['bip01 pelvis']), root,
    children,
  };
  _bones.set(skeleton, out);
  return out;
}

function refresh(skeleton, pose, mats, bones, ref) {
  const node = skeleton.nodes.get(ref);
  if (!node) return;
  const parent = mats.get(node.parent);
  const local = pose.get(ref) ?? node.rest;
  const la = new Float32Array(9);
  for (let i = 0; i < 9; i++) la[i] = local.rotation[i] * local.scale;
  const lt = local.translation;
  let m;
  if (parent) {
    const pt = apply(parent.a, lt);
    m = { a: mat33Mul(parent.a, la), t: [parent.t[0] + pt[0], parent.t[1] + pt[1], parent.t[2] + pt[2]] };
  } else {
    m = { a: la, t: [lt[0], lt[1], lt[2]] };
  }
  mats.set(ref, m);
  for (const k of bones.children.get(ref) ?? []) refresh(skeleton, pose, mats, bones, k);
}
// Re-orthonormalizes each written local so float32 skew does not compound down a chain of turns; the original
// handedness is kept so a mirrored bone stays mirrored.
export function orthonormal(m) {
  let x = [m[0], m[3], m[6]], y = [m[1], m[4], m[7]];
  const zIn = [m[2], m[5], m[8]];
  x = norm(x);
  y = norm(sub(y, scale(x, dot(x, y))));
  let z = cross(x, y);
  if (dot(z, zIn) < 0) z = scale(z, -1);
  return Float32Array.from([x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]);
}
function turn(skeleton, pose, mats, bones, ref, D) {
  const node = skeleton.nodes.get(ref);
  if (!node) return;
  const local = pose.get(ref) ?? node.rest;
  const parent = mats.get(node.parent);
  const Rp = parent ? rotationPart(parent.a) : IDENT;
  const rotation = orthonormal(mat33Mul(mat33Mul(mat33Mul(transpose(Rp), D), Rp), local.rotation));
  pose.set(ref, { rotation, translation: local.translation, scale: local.scale });
  refresh(skeleton, pose, mats, bones, ref);
}
function shift(skeleton, pose, mats, bones, ref, dv) {
  const node = skeleton.nodes.get(ref);
  if (!node) return;
  const local = pose.get(ref) ?? node.rest;
  const parent = mats.get(node.parent);
  let lv = dv;
  if (parent) {
    const s = Math.hypot(parent.a[0], parent.a[3], parent.a[6]) || 1;
    lv = scale(apply(transpose(rotationPart(parent.a)), dv), 1 / s);
  }
  pose.set(ref, { rotation: local.rotation, translation: [local.translation[0] + lv[0], local.translation[1] + lv[1], local.translation[2] + lv[2]], scale: local.scale });
  refresh(skeleton, pose, mats, bones, ref);
}
const at = (mats, ref) => mats.get(ref)?.t ?? null;

export function handFrame(mats, limb, side) {
  const wrist = at(mats, limb.hand);
  if (!wrist) return null;
  let f = null;
  const bases = limb.fingers.map((ch) => at(mats, ch[0])).filter(Boolean);
  if (bases.length) f = norm(sub(scale(bases.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / bases.length), wrist));
  const elbow = at(mats, limb.fore);
  if (!f || len(f) < 0.5) f = elbow ? norm(sub(wrist, elbow)) : null;
  if (!f) return null;
  let palm = null;
  const thumb = limb.thumb ? at(mats, limb.thumb[0]) : null;
  if (thumb) {
    const t = sub(thumb, wrist);
    const lateral = sub(t, scale(f, dot(t, f)));
    if (len(lateral) > 1e-6) palm = scale(norm(cross(f, norm(lateral))), side === 'R' ? -1 : 1);
  }
  return { wrist, fingers: f, palm };
}

const _restAxes = new WeakMap();
export function restAxes(skeleton, ref) {
  let per = _restAxes.get(skeleton);
  if (!per) { per = new Map(); _restAxes.set(skeleton, per); }
  if (per.has(ref)) return per.get(ref);
  const chain = [];
  for (let r = ref; r != null && r >= 0 && skeleton.nodes.has(r); r = skeleton.nodes.get(r).parent) chain.push(skeleton.nodes.get(r));
  let R = IDENT;
  for (let i = chain.length - 1; i >= 0; i--) R = mat33Mul(R, chain[i].rest.rotation);
  const Rt = transpose(R);
  const out = { fwd: apply(Rt, [0, 1, 0]), up: apply(Rt, [0, 0, 1]) };
  per.set(ref, out);
  return out;
}

function poseArm(skeleton, pose, mats, bones, limb, side, h, w) {
  let k = clamp01((h.w ?? 1) * w);
  if (!(k > 0) || limb.upper == null || limb.fore == null || limb.hand == null || !(h.at || h.ray)) return;
  if (h.ray) h = { ...h, at: onRay(at(mats, limb.upper), limbReach(mats, limb) * RAY_REACH, h.ray) };
  const S = at(mats, limb.upper), E = at(mats, limb.fore), W = at(mats, limb.hand);
  const a = len(sub(E, S)), b = len(sub(W, E));
  if (!(a > 1e-6 && b > 1e-6)) return;
  // Vault release is measured on the posed bones, after the lean and fit, so each race uses its own reach.
  if (h.releaseAtReach) {
    const t = clamp01((len(sub(h.reachAt ?? h.at, S)) / (a + b) - 0.8) / 0.18);
    k *= 1 - t * t * (3 - 2 * t);
    if (!(k > 0)) return;
  }
  const target = lerp3(W, h.at, k);
  const clipElbow = norm(sub(E, add(S, scale(norm(sub(W, S)), dot(sub(E, S), norm(sub(W, S)))))));
  const pole = h.pole ? norm(lerp3(len(clipElbow) > 0.5 ? clipElbow : h.pole, h.pole, k)) : clipElbow;
  const sol = solveReach(S, a, b, target, pole);
  turn(skeleton, pose, mats, bones, limb.upper, rotFromTo(norm(sub(E, S)), norm(sub(sol.mid, S))));
  const E2 = at(mats, limb.fore), W2 = at(mats, limb.hand);
  turn(skeleton, pose, mats, bones, limb.fore, rotFromTo(norm(sub(W2, E2)), norm(sub(sol.end, E2))));
  if (h.fingers) {
    const fr = handFrame(mats, limb, side);
    if (fr) {
      const want = norm(lerp3(fr.fingers, h.fingers, k));
      const D = fr.palm && h.palm ? rotFrames(fr.fingers, fr.palm, want, norm(lerp3(fr.palm, h.palm, k))) : rotFromTo(fr.fingers, want);
      turn(skeleton, pose, mats, bones, limb.hand, D);
    }
  }
  const curl = (h.curl ?? 0) * k;
  if (curl > 1e-4) {
    const fr = handFrame(mats, limb, side);
    if (fr && fr.palm) {
      for (const ch of limb.fingers) curlChain(skeleton, pose, mats, bones, ch, fr.palm, curl);
      if (limb.thumb) curlChain(skeleton, pose, mats, bones, limb.thumb, fr.palm, curl * 0.6);
    }
  }
}
function curlChain(skeleton, pose, mats, bones, chain, palm, curl) {
  const shares = [0.45, 0.35, 0.2];
  for (let i = 0; i < chain.length; i++) {
    const p = at(mats, chain[i]);
    const next = i + 1 < chain.length ? at(mats, chain[i + 1]) : null;
    const prev = i > 0 ? at(mats, chain[i - 1]) : null;
    const dir = next ? norm(sub(next, p)) : prev ? norm(sub(p, prev)) : null;
    if (!dir) continue;
    const axis = norm(cross(dir, palm));
    if (len(axis) < 0.5) continue;
    turn(skeleton, pose, mats, bones, chain[i], rotAxisAngle(axis, curl * (shares[i] ?? 0.15) * 2));
  }
}
export const RAY_REACH = 0.9;
const limbReach = (mats, limb) => len(sub(at(mats, limb.fore), at(mats, limb.upper))) + len(sub(at(mats, limb.hand), at(mats, limb.fore)));
export function onRay(p, dist, ray) {
  const o = sub(ray.from, p), b = dot(ray.dir, o), c = dot(o, o) - dist * dist;
  const disc = b * b - c;
  const s = disc >= 0 ? -b + Math.sqrt(disc) : -b;
  return add(ray.from, scale(ray.dir, Math.max(0, s)));
}
function shrug(skeleton, pose, mats, bones, limb, h, w) {
  const k = clamp01((h.w ?? 1) * w) * clamp01(h.shrug ?? 0);
  if (!(k > 0) || limb.clavicle == null || limb.upper == null || !h.at) return;
  const c = at(mats, limb.clavicle), u = at(mats, limb.upper);
  if (c && u) turn(skeleton, pose, mats, bones, limb.clavicle, rotFraction(rotFromTo(norm(sub(u, c)), norm(sub(h.at, c))), k));
}
function poseLeg(skeleton, pose, mats, bones, limb, f, w) {
  const k = clamp01((f.w ?? 1) * w);
  if (!(k > 0) || limb.thigh == null || limb.calf == null || limb.foot == null || !f.at) return;
  const H = at(mats, limb.thigh), K = at(mats, limb.calf), A = at(mats, limb.foot);
  const a = len(sub(K, H)), b = len(sub(A, K));
  if (!(a > 1e-6 && b > 1e-6)) return;
  let goal = f.at;
  if (f.hang > 0) {
    const L = (a + b) * Math.min(0.999, f.hang), dh = Math.hypot(goal[0] - H[0], goal[1] - H[1]);
    if (dh < L) goal = [goal[0], goal[1], H[2] - Math.sqrt(L * L - dh * dh)];
  }
  const target = lerp3(A, goal, k);
  const clipKnee = norm(sub(K, add(H, scale(norm(sub(A, H)), dot(sub(K, H), norm(sub(A, H)))))));
  const pole = f.pole ? norm(lerp3(len(clipKnee) > 0.5 ? clipKnee : f.pole, f.pole, k)) : clipKnee;
  const sol = solveReach(H, a, b, target, pole);
  turn(skeleton, pose, mats, bones, limb.thigh, rotFromTo(norm(sub(K, H)), norm(sub(sol.mid, H))));
  const K2 = at(mats, limb.calf), A2 = at(mats, limb.foot);
  turn(skeleton, pose, mats, bones, limb.calf, rotFromTo(norm(sub(A2, K2)), norm(sub(sol.end, K2))));
  if (f.toe) {
    const footM = mats.get(limb.foot);
    let toeDir = null;
    const toe = limb.toe != null ? at(mats, limb.toe) : null;
    if (toe) toeDir = norm(sub(toe, footM.t));
    else toeDir = norm(apply(rotationPart(footM.a), restAxes(skeleton, limb.foot).fwd));
    if (len(toeDir) > 0.5) turn(skeleton, pose, mats, bones, limb.foot, rotFromTo(toeDir, norm(lerp3(toeDir, f.toe, k))));
  }
}

export function applyClimbRig(skeleton, pose, rootRef, skelMats, req) {
  const w = clamp01(req?.w ?? 0);
  if (!(w > 0)) return null;
  const bones = climbBones(skeleton);
  if (!bones) return null;
  const mats = skelMats(skeleton, pose, rootRef);
  const out = { fit: 0, reach: { L: null, R: null } };
  if (req.hands) for (const s of ['L', 'R']) {
    const h = req.hands[s], limb = bones[s];
    if (h?.ray && !h.at && limb.upper != null && limb.fore != null && limb.hand != null) req = { ...req, hands: { ...req.hands, [s]: { ...h, at: onRay(at(mats, limb.upper), limbReach(mats, limb) * RAY_REACH, h.ray), ray: null } } };
  }
  if (bones.root != null && req.offset) {
    const off = scale(req.offset, w);
    if (len(off) > 1e-9) shift(skeleton, pose, mats, bones, bones.root, off);
  }
  if (req.swing && bones.root != null) {
    const { pitch = 0, roll = 0 } = req.swing;
    const holds = ['L', 'R'].map((s) => req.hands?.[s]?.at).filter(Boolean);
    const root = at(mats, bones.root);
    if ((pitch || roll) && holds.length && root) {
      const pivot = scale(holds.reduce((acc, p) => add(acc, p), [0, 0, 0]), 1 / holds.length);
      const D = mat33Mul(rotAxisAngle([1, 0, 0], pitch * w), rotAxisAngle([0, 1, 0], roll * w));
      turn(skeleton, pose, mats, bones, bones.root, D);
      const moved = add(pivot, apply(D, sub(root, pivot)));
      shift(skeleton, pose, mats, bones, bones.root, sub(moved, root));
    }
  }
  if (req.lean && bones.spine.length) {
    const { pitch = 0, roll = 0 } = req.lean;
    const n = bones.spine.length;
    for (const ref of bones.spine) {
      if (pitch) turn(skeleton, pose, mats, bones, ref, rotAxisAngle([-1, 0, 0], (pitch * w) / n));
      if (roll) turn(skeleton, pose, mats, bones, ref, rotAxisAngle([0, 1, 0], (roll * w) / n));
    }
  }
  // The shrug runs before the fit because raising the shoulder changes how far the hand must reach.
  if (req.hands) for (const s of ['L', 'R']) if (req.hands[s]) shrug(skeleton, pose, mats, bones, bones[s], req.hands[s], w);
  if (bones.root != null && req.fit && req.hands) {
    let need = null;
    for (const s of ['L', 'R']) {
      const h = req.hands[s], limb = bones[s];
      if (!h?.at || !((h.w ?? 1) > 0) || limb.upper == null || limb.fore == null || limb.hand == null) continue;
      const S = at(mats, limb.upper), E = at(mats, limb.fore), Wr = at(mats, limb.hand);
      const reach = (len(sub(E, S)) + len(sub(Wr, E))) * 0.97;
      const dh = Math.hypot(h.at[0] - S[0], h.at[1] - S[1]);
      if (dh >= reach) continue;
      const rise = (h.at[2] - Math.sqrt(reach * reach - dh * dh)) - S[2];
      need = need == null ? rise : Math.max(need, rise);
    }
    if (need != null) {
      const up = Math.max(0, req.fit.up ?? 0), down = Math.max(0, req.fit.down ?? 0);
      const dz = Math.min(up, Math.max(-down, need)) * w;
      if (Math.abs(dz) > 1e-9) { shift(skeleton, pose, mats, bones, bones.root, [0, 0, dz]); out.fit = dz; }
    }
  }
  if (req.hands) {
    for (const s of ['L', 'R']) {
      const h = req.hands[s];
      if (!h) continue;
      poseArm(skeleton, pose, mats, bones, bones[s], s, h, w);
      const wr = at(mats, bones[s].hand);
      if (wr && h.at) out.reach[s] = len(sub(wr, h.at));
    }
  }
  if (req.feet) for (const s of ['L', 'R']) if (req.feet[s]) poseLeg(skeleton, pose, mats, bones, bones[s], req.feet[s], w);
  if (req.look?.at && bones.head != null) {
    const k = clamp01((req.look.w ?? 1) * w);
    const head = mats.get(bones.head);
    if (head && k > 0) {
      const fwd = norm(apply(rotationPart(head.a), restAxes(skeleton, bones.head).fwd));
      let want = norm(sub(req.look.at, head.t));
      const ang = Math.acos(Math.min(1, Math.max(-1, dot(fwd, want))));
      const most = (70 * Math.PI) / 180;
      if (ang > most) want = norm(lerp3(fwd, want, most / ang));
      const D = rotFraction(rotFromTo(fwd, want), k);
      if (bones.neck != null) {
        turn(skeleton, pose, mats, bones, bones.neck, rotFraction(D, 1 / 3));
        const head2 = mats.get(bones.head);
        const fwd2 = norm(apply(rotationPart(head2.a), restAxes(skeleton, bones.head).fwd));
        turn(skeleton, pose, mats, bones, bones.head, rotFraction(rotFromTo(fwd2, norm(lerp3(fwd2, want, k))), 1));
      } else {
        turn(skeleton, pose, mats, bones, bones.head, D);
      }
    }
  }
  return out;
}

export function climbRequestToRig(wq, { feet, yaw, unitsPerMetre, weight = 1, height = 1 }) {
  if (!wq || !(wq.w > 0) || !feet) return null;
  const U = unitsPerMetre, r = [Math.cos(yaw), 0, -Math.sin(yaw)], f = [Math.sin(yaw), 0, Math.cos(yaw)];
  const vec = (v) => [(v[0] * r[0] + v[2] * r[2]) * U / weight, (v[0] * f[0] + v[2] * f[2]) * U / weight, v[1] * U / height];
  const pt = (p) => vec(sub(p, feet));
  const dir = (v) => (v ? norm(vec(v)) : null);
  const limbOf = (h) => (h && h.at && h.w > 0 ? { at: pt(h.at), fingers: dir(h.fingers), palm: dir(h.palm), toe: dir(h.toe), pole: dir(h.pole), w: h.w, curl: h.curl, shrug: h.shrug, hang: h.hang, releaseAtReach: h.releaseAtReach } : null);
  return {
    w: wq.w,
    offset: wq.offset ? vec(wq.offset) : null,
    fit: wq.fit ? { up: (wq.fit.up ?? 0) * U / height, down: (wq.fit.down ?? 0) * U / height } : null,
    swing: wq.swing ?? null, lean: wq.lean ?? null,
    hands: { L: limbOf(wq.hands?.L), R: limbOf(wq.hands?.R) },
    feet: { L: limbOf(wq.feet?.L), R: limbOf(wq.feet?.R) },
    look: wq.look?.at ? { at: pt(wq.look.at), w: wq.look.w } : null,
  };
}

export function climbRequestToFirstPerson(wq, { eye, yaw, pitch = 0, fov, lensFov, lensPitch = 0, rigEye, unitsPerMetre }) {
  if (!wq || !(wq.w > 0) || !eye || !rigEye) return null;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const fw = [sy * cp, sp, cy * cp], rw = [cy, 0, -sy], uw = [-sy * sp, cp, -cy * sp];
  const k = Math.tan(lensFov / 2) / Math.tan(fov / 2);
  const cl = Math.cos(lensPitch), sl = Math.sin(lensPitch);
  const R = [1, 0, 0], F = [0, cl, sl], Up = [0, -sl, cl];
  const lensVec = (v, ratio = k) => { const x = dot(v, rw) * ratio, y = dot(v, uw) * ratio, z = dot(v, fw); return add(add(scale(R, x), scale(Up, y)), scale(F, z)); };
  const limbOf = (h) => {
    if (!(h && h.at && h.w > 0)) return null;
    const d = sub(h.at, eye);
    const ahead = dot(d, fw);
    if (ahead <= 0.05) return null;
    const approach = h.releaseAtReach ? clamp01((ahead - 0.05) / 0.2) : 1;
    const grip = approach * approach * (3 - 2 * approach);
    return { ray: { from: rigEye.slice(), dir: norm(lensVec(d)) }, fingers: h.fingers ? norm(lensVec(h.fingers)) : null, palm: h.palm ? norm(lensVec(h.palm)) : null, pole: h.pole ? norm(lensVec(h.pole)) : null, w: h.w * grip, curl: h.curl, shrug: 0,
      // A ray discards distance, so vaults also carry the real hold in rig units for the release test.
      ...(h.releaseAtReach && unitsPerMetre > 0 ? { releaseAtReach: true, reachAt: add(rigEye, scale(lensVec(d, 1), unitsPerMetre)) } : {}),
    };
  };
  const hands = { L: limbOf(wq.hands?.L), R: limbOf(wq.hands?.R) };
  return hands.L || hands.R ? { w: wq.w, hands } : null;
}
