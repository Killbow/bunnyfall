// Poses an arm, or the whole body, of a Morrowind skeleton as the mirror of the other side, after the clip and
// before any piece is placed. Counterparts are found by bone name, and no number about any skeleton is stored here.
import { mat33Mul } from '../../formats/mwNifMesh.js';
import { HELD_BONE_ALIASES } from '../heldPose.js';
import { rotAxisAngle } from '../climbRig.js';

const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const mul = (A, B) => { const t = apply(A.a, B.t); return { a: mat33Mul(A.a, B.a), t: [t[0] + A.t[0], t[1] + A.t[1], t[2] + A.t[2]] }; };
const scaleOf = (a) => Math.hypot(a[0], a[3], a[6]) || 1;
function inv(A) {
  const s2 = scaleOf(A.a) ** 2;
  const a = A.a;
  const ia = Float32Array.from([a[0] / s2, a[3] / s2, a[6] / s2, a[1] / s2, a[4] / s2, a[7] / s2, a[2] / s2, a[5] / s2, a[8] / s2]);
  const t = apply(ia, A.t);
  return { a: ia, t: [-t[0], -t[1], -t[2]] };
}
const transposed = (m) => Float32Array.from([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
function quatOf(r) {
  const tr = r[0] + r[4] + r[8];
  let x, y, z, w;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (r[7] - r[5]) / s; y = (r[2] - r[6]) / s; z = (r[3] - r[1]) / s; }
  else if (r[0] > r[4] && r[0] > r[8]) { const s = Math.sqrt(1 + r[0] - r[4] - r[8]) * 2; w = (r[7] - r[5]) / s; x = s / 4; y = (r[1] + r[3]) / s; z = (r[2] + r[6]) / s; }
  else if (r[4] > r[8]) { const s = Math.sqrt(1 + r[4] - r[0] - r[8]) * 2; w = (r[2] - r[6]) / s; x = (r[1] + r[3]) / s; y = s / 4; z = (r[5] + r[7]) / s; }
  else { const s = Math.sqrt(1 + r[8] - r[0] - r[4]) * 2; w = (r[3] - r[1]) / s; x = (r[2] + r[6]) / s; y = (r[5] + r[7]) / s; z = s / 4; }
  const n = Math.hypot(x, y, z, w) || 1;
  return [x / n, y / n, z / n, w / n];
}
function matInto(out, [x, y, z, w]) {
  out[0] = 1 - 2 * (y * y + z * z); out[1] = 2 * (x * y - z * w); out[2] = 2 * (x * z + y * w);
  out[3] = 2 * (x * y + z * w); out[4] = 1 - 2 * (x * x + z * z); out[5] = 2 * (y * z - x * w);
  out[6] = 2 * (x * z - y * w); out[7] = 2 * (y * z + x * w); out[8] = 1 - 2 * (x * x + y * y);
  return out;
}
function quatPowInto(out, q, k) {
  let [x, y, z, w] = q;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const ang = 2 * Math.acos(Math.min(1, w));
  const s = Math.sin(ang / 2);
  if (s < 1e-9) { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1; return out; }
  const h = (ang * k) / 2, sh = Math.sin(h) / s;
  out[0] = x * sh; out[1] = y * sh; out[2] = z * sh; out[3] = Math.cos(h);
  return out;
}

const scratchAffine = () => ({ a: new Float64Array(9), t: new Float64Array(3) });
// Shared scratch: the module never re-enters itself, so one set serves every rig.
const T0 = scratchAffine(), T1 = scratchAffine(), T2 = scratchAffine();
const Q = [0, 0, 0, 1], QM = new Float64Array(9);
function mulInto(out, A, B) {
  const a = A.a, b = B.a, o = out.a;
  for (let r = 0; r < 3; r++) {
    const a0 = a[r * 3], a1 = a[r * 3 + 1], a2 = a[r * 3 + 2];
    o[r * 3] = a0 * b[0] + a1 * b[3] + a2 * b[6];
    o[r * 3 + 1] = a0 * b[1] + a1 * b[4] + a2 * b[7];
    o[r * 3 + 2] = a0 * b[2] + a1 * b[5] + a2 * b[8];
    out.t[r] = a0 * B.t[0] + a1 * B.t[1] + a2 * B.t[2] + A.t[r];
  }
  return out;
}
function affineInto(out, e) {
  const s = e.scale ?? 1;
  for (let i = 0; i < 9; i++) out.a[i] = e.rotation[i] * s;
  out.t[0] = e.translation[0]; out.t[1] = e.translation[1]; out.t[2] = e.translation[2];
  return out;
}
function entryOf(m) {
  const s = scaleOf(m.a);
  const rotation = new Float32Array(9);
  for (let i = 0; i < 9; i++) rotation[i] = m.a[i] / s;
  return { rotation, translation: [m.t[0], m.t[1], m.t[2]], scale: s };
}

export function counterpartName(name) {
  const n = String(name || '').toLowerCase();
  if (n === 'weapon bone') return 'weapon bone left';
  if (n === 'weapon bone left') return 'weapon bone';
  const swap = (s, a, b) => s.replace(new RegExp(`\\b${a}\\b`, 'g'), '\u0000').replace(new RegExp(`\\b${b}\\b`, 'g'), a).replace(/\u0000/g, b);
  return swap(swap(n, 'l', 'r'), 'left', 'right');
}

const ATTACH_OF = Object.fromEntries(Object.entries(HELD_BONE_ALIASES).map(([attach, bip]) => [bip, attach]));
const CLAVICLE = { L: ['bip01 l clavicle', ATTACH_OF['bip01 l clavicle']], R: ['bip01 r clavicle', ATTACH_OF['bip01 r clavicle']] };
const UPPER = { L: ['bip01 l upperarm', ATTACH_OF['bip01 l upperarm']], R: ['bip01 r upperarm', ATTACH_OF['bip01 r upperarm']] };
const HAND = { L: ['bip01 l hand', ATTACH_OF['bip01 l hand']], R: ['bip01 r hand', ATTACH_OF['bip01 r hand']] };

function buildPlan(skeleton, root, skelMats) {
  if (!skeleton?.nodes || !skeleton.byName) return null;
  const find = (names) => { for (const n of names) { if (!n) continue; const r = skeleton.byName.get(n); if (r !== undefined) return r; } return null; };
  const rest = skelMats(skeleton, new Map(), root);
  const upL = find(UPPER.L), upR = find(UPPER.R);
  if (upL == null || upR == null || !rest.get(upL) || !rest.get(upR)) return null;
  const x0 = (rest.get(upL).t[0] + rest.get(upR).t[0]) / 2;
  const children = new Map();
  for (const [ref, node] of skeleton.nodes) {
    if (!children.has(node.parent)) children.set(node.parent, []);
    children.get(node.parent).push(ref);
  }
  const order = [];
  const walk = (ref) => { order.push(ref); for (const k of children.get(ref) ?? []) walk(k); };
  for (const [ref, node] of skeleton.nodes) if (!skeleton.nodes.has(node.parent)) walk(ref);
  const counterpart = new Map();
  for (const [ref, node] of skeleton.nodes) {
    const c = skeleton.byName.get(counterpartName(node.name));
    counterpart.set(ref, c !== undefined ? c : null);
  }
  const restOf = new Map(), restInv = new Map();
  for (const ref of order) { const m = rest.get(ref); if (m) { restOf.set(ref, m); restInv.set(ref, inv(m)); } }
  const arm = (s) => {
    const top = find(CLAVICLE[s]) ?? find(UPPER[s]);
    const set = [];
    const take = (ref) => { set.push(ref); for (const k of children.get(ref) ?? []) take(k); };
    if (top != null) take(top);
    return set;
  };
  const arms = { L: arm('L'), R: arm('R') };
  // A sideless bone inside an arm, such as the Shield Bone, has no counterpart and moves with its arm.
  for (const s of ['L', 'R']) for (const ref of arms[s]) if (counterpart.get(ref) === ref) counterpart.set(ref, null);
  const S = { a: Float32Array.from([-1, 0, 0, 0, 1, 0, 0, 0, 1]), t: [2 * x0, 0, 0] };
  const outR = Math.sign(rest.get(upR).t[0] - rest.get(upL).t[0]) || 1;
  const restLocal = (ref) => { const r = skeleton.nodes.get(ref).rest; return { a: Float32Array.from(r.rotation, (v) => v * (r.scale ?? 1)), t: [r.translation[0], r.translation[1], r.translation[2]] }; };
  const linear = (m) => ({ a: m.a, t: [0, 0, 0] });
  // Mirroring motion from rest in each bone's own frame keeps every joint on its parent:
  // L'(b) = RestL(b) . K^-1 . RestL(m)^-1 . L(m) . K, with K the 3x3 of Rest(m)^-1 . S . Rest(b).
  const link = new Map();
  for (const ref of order) {
    const m = counterpart.get(ref);
    if (m == null || !restOf.has(ref) || !restOf.has(m)) continue;
    const Kb = linear(mul(mul(restInv.get(m), S), restOf.get(ref)));
    link.set(ref, { m, A: mul(mul(restLocal(ref), inv(Kb)), inv(restLocal(m))), B: Kb });
  }
  const armSkeleton = (s) => ({ nodes: new Map(arms[s].map((ref) => [ref, skeleton.nodes.get(ref)])), byName: skeleton.byName });
  return {
    x0, order, counterpart, restOf, restInv, children, link,
    S,
    arms,
    armSkeletons: { L: armSkeleton('L'), R: armSkeleton('R') },
    hands: { L: find(HAND.L), R: find(HAND.R) },
    uppers: { L: upL, R: upR },
    outward: { L: -outR, R: outR },
    targets: new Map(),
    pictureK: new WeakMap(),
  };
}

const _plans = new WeakMap();
export function mirrorPlan(skeleton, root, skelMats) {
  if (!skeleton?.nodes || !skeleton.byName) return null;
  let per = _plans.get(skeleton);
  if (!per) { per = new Map(); _plans.set(skeleton, per); }
  if (per.has(root)) return per.get(root);
  const plan = buildPlan(skeleton, root, skelMats);
  per.set(root, plan);
  return plan;
}

export function limbSkeleton(skeleton, root, skelMats, side, l) {
  const plan = mirrorPlan(skeleton, root, skelMats);
  if (!plan || !l) return skeleton;
  const from = l.side === 'L' || l.side === 'R' ? l.side : side;
  return plan.armSkeletons[l.mirror && from !== side ? from : side];
}

function mirrorLocal(link, e) {
  affineInto(T0, e);
  mulInto(T1, T0, link.B);
  return entryOf(mulInto(T2, link.A, T1));
}
const sameLocal = (p, q) => {
  if (p === q) return true;
  if (Math.abs((p.scale ?? 1) - (q.scale ?? 1)) > 1e-6) return false;
  for (let i = 0; i < 3; i++) if (Math.abs(p.translation[i] - q.translation[i]) > 1e-6) return false;
  for (let i = 0; i < 9; i++) if (Math.abs(p.rotation[i] - q.rotation[i]) > 1e-6) return false;
  return true;
};
function carried(off, base, k) {
  matInto(QM, quatPowInto(Q, off.q, k));
  const r = base.rotation, rotation = new Float32Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rotation[i * 3 + j] = QM[i * 3] * r[j] + QM[i * 3 + 1] * r[3 + j] + QM[i * 3 + 2] * r[6 + j];
  const t = base.translation;
  return { rotation, translation: [t[0] + off.d[0] * k, t[1] + off.d[1] * k, t[2] + off.d[2] * k], scale: (base.scale ?? 1) * off.ds ** k };
}

/** @returns {number[] | null} */
export function applyMirrorRig(skeleton, pose, root, skelMats, req) {
  const c = req?.carry ?? null;
  const st = c?.state ?? null;
  const composing = !!(req && (req.full || req.limbs?.L || req.limbs?.R));
  const dipping = !!(req?.dip && (req.dip.L > 0 || req.dip.R > 0));
  const spreading = !!(req?.spread > 0);
  if (st && st.key === undefined) { st.key = c.key; st.from = null; st.k = 0; st.last = null; }
  if (st && st.key !== c.key && !st.last && !st.from && !composing && !dipping && !spreading) { st.key = c.key; return null; }
  const carrying = !!st && (!!st.from || st.key !== c.key);
  if (!req || (!composing && !carrying && !dipping && !spreading)) { if (st) st.last = null; return null; }
  const plan = mirrorPlan(skeleton, root, skelMats);
  if (!plan) { if (st) { st.key = c.key; st.from = null; st.last = null; } return null; }
  // Nothing is written into pose until the final loop, so every read before it sees the clip.
  const clip = pose;
  const clipL = (ref) => clip.get(ref) ?? skeleton.nodes.get(ref).rest;
  const targets = plan.targets;
  targets.clear();
  if (req.full) for (const ref of plan.order) { const k = plan.link.get(ref); if (k) targets.set(ref, mirrorLocal(k, clipL(k.m))); }
  let world = null;
  for (const side of /** @type {const} */ (['L', 'R'])) {
    const l = req.limbs?.[side];
    if (!l) continue;
    const src = l.pose ?? clip;
    const srcL = (ref) => src.get(ref) ?? skeleton.nodes.get(ref).rest;
    const from = l.side === 'L' || l.side === 'R' ? l.side : side;
    if (l.mirror && from !== side && req.plane) {
      world ??= chainWorld(skeleton, root, clipL);
      if (pictureMirrorArm(skeleton, plan, world, req.plane, side, from, srcL, clipL, targets)) continue;
    }
    for (const ref of plan.arms[side]) {
      if (l.mirror && from !== side) { const k = plan.link.get(ref); if (k) targets.set(ref, mirrorLocal(k, srcL(k.m))); else targets.delete(ref); }
      else targets.set(ref, srcL(ref));
    }
  }
  // The dip and the spread go into the locals before the carry, so the carry starts from what was drawn.
  if (dipping) {
    const cur = (ref) => targets.get(ref) ?? clipL(ref);
    for (const side of /** @type {const} */ (['L', 'R'])) { const e = dipArm(skeleton, cur, plan, side, req.dip[side]); if (e) targets.set(plan.uppers[side], e); }
  }
  if (spreading) {
    const cur = (ref) => targets.get(ref) ?? clipL(ref);
    for (const side of /** @type {const} */ (['L', 'R'])) {
      const top = plan.arms[side][0];
      if (top == null) continue;
      const e = cur(top);
      targets.set(top, { rotation: mat33Mul(rotAxisAngle(uprightOver(skeleton, cur, top), -plan.outward[side] * req.spread), e.rotation), translation: e.translation, scale: e.scale });
    }
  }
  // The carry eases each local offset relative to the parent bone, so children follow their carried parents.
  if (st) {
    if (st.key !== c.key) {
      const prevOf = st.last ?? clip;
      st.key = c.key;
      st.from = new Map();
      for (const ref of plan.order) {
        const prev = prevOf.get(ref) ?? clipL(ref), now = targets.get(ref) ?? clipL(ref);
        if (sameLocal(prev, now)) continue;
        st.from.set(ref, {
          q: quatOf(mat33Mul(prev.rotation, transposed(now.rotation))),
          d: [prev.translation[0] - now.translation[0], prev.translation[1] - now.translation[1], prev.translation[2] - now.translation[2]],
          ds: (prev.scale ?? 1) / (now.scale ?? 1),
        });
      }
      st.k = st.from.size ? 1 : 0;
    } else if (st.k > 0) st.k *= Math.exp(-Math.max(0, c.dt || 0) / Math.max(1e-4, c.tau || 0.06));
    if (st.k < 1e-3) { st.k = 0; st.from = null; }
  }
  const k = st?.from ? st.k : 0;
  const keep = !!st && (composing || !!st.from || dipping || spreading);
  const last = keep ? (st.drawn ??= new Map()) : null;
  if (last) last.clear();
  const wrote = [];
  for (const ref of plan.order) {
    let out = targets.get(ref);
    const off = k > 0 ? st.from.get(ref) : null;
    if (off) out = carried(off, out ?? clipL(ref), k);
    // Clip-only bones are saved too, so a bone the clip moves eases in like the bones written here.
    if (last) last.set(ref, out ?? clipL(ref));
    if (!out) continue;
    pose.set(ref, out);
    wrote.push(ref);
  }
  targets.clear();
  if (st) st.last = last;
  return wrote.length ? wrote : null;
}

// First-person clips do not pose the body about the eye, so a mirrored arm is placed through the upright plane
// at the eye instead: W'(b) = P . W(m) . K(b).
function pictureMirrorArm(skeleton, plan, world, plane, side, from, srcL, clipL, targets) {
  if (!skeleton.nodes.has(plane.ref)) return false;
  const eye = world.get(plane.ref).t;
  const P = { a: S3, t: [2 * (eye[0] + (plane.dx || 0)), 0, 0] };
  const ks = pictureKs(plan, plane.binds);
  const src = new Map(), drawn = new Map();
  const parentWorld = (ref, own) => { const p = skeleton.nodes.get(ref).parent; return own.get(p) ?? world.get(p); };
  for (const ref of plan.arms[from]) src.set(ref, mul(parentWorld(ref, src), affineOf(srcL(ref))));
  for (const ref of plan.arms[side]) {
    const m = plan.counterpart.get(ref);
    const Wm = m != null ? src.get(m) : null;
    const up = parentWorld(ref, drawn);
    if (!Wm || !plan.restOf.has(ref)) { drawn.set(ref, mul(up, affineOf(clipL(ref)))); targets.delete(ref); continue; }
    const W = mul(mul(P, Wm), pictureK(skeleton, plan, plane.binds, ks, ref, m));
    drawn.set(ref, W);
    targets.set(ref, entryOf(mul(inv(up), W)));
  }
  return true;
}

export function mirrorBindSources({ nif = null, pieces = null } = {}) {
  const out = [];
  const bindOf = (a, t) => inv({ a, t: [t[0], t[1], t[2]] });
  for (const shape of nif?.records ?? []) {
    const skin = Number.isInteger(shape?.skin) && shape.skin >= 0 ? nif.records[shape.skin] : null;
    const data = skin && Number.isInteger(skin.data) ? nif.records[skin.data] : null;
    if (!skin?.bones || !data?.bones || !unturned(data.transform) || !unturned(shape)) continue;
    const m = new Map();
    skin.bones.forEach((ref, i) => {
      const t = data.bones[i]?.transform;
      if (t && Number.isInteger(ref)) m.set(ref, bindOf(Float32Array.from(t.rotation, (v) => v * (t.scale ?? 1)), t.translation));
    });
    if (m.size) out.push(m);
  }
  for (const p of pieces ?? []) {
    const skin = p?.kind === 'skinned' ? p.batch?.skin : null;
    if (!skin?.bones || !unturned(skin.transform) || !unturned(skin.shapeTransform)) continue;
    const m = new Map();
    for (const b of skin.bones) if (b.ref != null && b.invBind) m.set(b.ref, bindOf(b.invBind.a, b.invBind.t));
    if (m.size) out.push(m);
  }
  return out;
}

const NO_BINDS = Object.freeze([]);
function pictureKs(plan, binds) {
  const key = binds ?? NO_BINDS;
  let ks = plan.pictureK.get(key);
  if (!ks) { ks = new Map(); plan.pictureK.set(key, ks); }
  return ks;
}
const turnOf = (m) => { const s = scaleOf(m.a); return Float32Array.from(m.a, (v) => v / s); };
const mirroredBinds = (b, c) => {
  const span = Math.max(1, Math.hypot(b.t[0] - c.t[0], b.t[1] - c.t[1], b.t[2] - c.t[2]));
  return Math.abs(b.t[1] - c.t[1]) <= span * 0.01 && Math.abs(b.t[2] - c.t[2]) <= span * 0.01;
};
// K comes from the skin binds, Bind(m)^-1 . S . Bind(b), because a first-person rest pose is far from symmetric.
function pictureK(skeleton, plan, binds, ks, ref, m) {
  let K = ks.get(ref);
  if (K) return K;
  const srcs = binds ?? NO_BINDS;
  let pair = srcs.map((s) => [s.get(ref), s.get(m)]).find(([b, c]) => b && c && mirroredBinds(b, c));
  if (!pair) {
    const b = srcs.find((s) => s.has(ref))?.get(ref), c = srcs.find((s) => s.has(m))?.get(m);
    if (b && c && mirroredBinds(b, c)) pair = [b, c];
  }
  if (pair) K = { a: mat33Mul(transposed(turnOf(pair[1])), mat33Mul(S3, turnOf(pair[0]))), t: [0, 0, 0] };
  // Parts on a node whose name holds Left are drawn with x negated, so an unbound one takes the plain reflection.
  else if (skeleton.nodes.get(ref).name.includes('Left') && !srcs.some((s) => s.has(ref))) K = { a: S3, t: [0, 0, 0] };
  else K = mul(mul(plan.restInv.get(m), plan.S), plan.restOf.get(ref));
  ks.set(ref, K);
  return K;
}
function chainWorld(skeleton, root, localOf) {
  const memo = new Map();
  const get = (ref) => {
    if (ref === root || ref == null || ref < 0 || !skeleton.nodes.has(ref)) return IDENT_AFFINE;
    let m = memo.get(ref);
    if (!m) { m = mul(get(skeleton.nodes.get(ref).parent), affineOf(localOf(ref))); memo.set(ref, m); }
    return m;
  };
  return { get };
}
const affineOf = (e) => { const s = e.scale ?? 1; return { a: Float32Array.from(e.rotation, (v) => v * s), t: [e.translation[0], e.translation[1], e.translation[2]] }; };

const IDENT3 = Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const IDENT_AFFINE = Object.freeze({ a: IDENT3, t: [0, 0, 0] });
function uprightOver(skeleton, loc, ref) {
  const chain = [];
  for (let r = skeleton.nodes.get(ref).parent; skeleton.nodes.has(r); r = skeleton.nodes.get(r).parent) chain.push(r);
  let Rp = IDENT3;
  for (let i = chain.length - 1; i >= 0; i--) Rp = mat33Mul(Rp, loc(chain[i]).rotation);
  return [Rp[6], Rp[7], Rp[8]];
}
function dipArm(skeleton, loc, plan, side, angle) {
  const up = plan.uppers[side], hand = plan.hands[side];
  if (!(angle > 0) || up == null || hand == null) return null;
  const upward = uprightOver(skeleton, loc, up);
  const down = [];
  for (let r = hand; r !== up; r = skeleton.nodes.get(r).parent) { if (!skeleton.nodes.has(r)) return null; down.push(r); }
  let A = { a: Float32Array.from(IDENT3), t: [0, 0, 0] };
  for (const ref of [up, ...down.reverse()]) { const e = loc(ref); A = mul(A, { a: Float32Array.from(e.rotation, (v) => v * (e.scale ?? 1)), t: e.translation }); }
  const s0 = loc(up).translation;
  const d = [A.t[0] - s0[0], A.t[1] - s0[1], A.t[2] - s0[2]];
  const n = [d[1] * upward[2] - d[2] * upward[1], d[2] * upward[0] - d[0] * upward[2], d[0] * upward[1] - d[1] * upward[0]];
  const nl = Math.hypot(n[0], n[1], n[2]);
  if (!(nl > 1e-6 * Math.hypot(d[0], d[1], d[2]))) return null;
  const e = loc(up);
  return { rotation: mat33Mul(rotAxisAngle([n[0] / nl, n[1] / nl, n[2] / nl], -angle), e.rotation), translation: e.translation, scale: e.scale };
}

export function strikingSide(skeleton, root, skelMats, poseA, poseB) {
  const plan = mirrorPlan(skeleton, root, skelMats);
  if (!plan || plan.hands.L == null || plan.hands.R == null) return null;
  const a = skelMats(skeleton, poseA, root), b = skelMats(skeleton, poseB, root);
  const travel = (h) => { const p = a.get(h)?.t, q = b.get(h)?.t; return p && q ? Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) : 0; };
  const l = travel(plan.hands.L), r = travel(plan.hands.R);
  if (!(Math.max(l, r) > 1e-6)) return null;
  return r >= l ? 'R' : 'L';
}

export const WEAPON_BONE_LEFT_SOURCE = 'mirrorRig.offWeaponBoneAddon';

const S3 = Float32Array.from([-1, 0, 0, 0, 1, 0, 0, 0, 1]);
const unturned = (r) => !r?.rotation || [1, 0, 0, 0, 1, 0, 0, 0, 1].every((v, i) => Math.abs(r.rotation[i] - v) < 1e-6);
// Retail skeletons carry a hidden Tri Shadow skin bound in an exactly symmetric T-pose; their rest pose is not.
function skinHandMirror(nif, a, b) {
  for (const shape of nif?.records ?? []) {
    const skin = Number.isInteger(shape?.skin) && shape.skin >= 0 ? nif.records[shape.skin] : null;
    const data = skin && Number.isInteger(skin.data) ? nif.records[skin.data] : null;
    if (!skin?.bones || !data?.bones) continue;
    const ia = skin.bones.indexOf(a), ib = skin.bones.indexOf(b);
    if (ia < 0 || ib < 0 || !data.bones[ia]?.transform || !data.bones[ib]?.transform) continue;
    if (!unturned(data.transform) || !unturned(shape)) continue;
    const invBind = (i) => { const t = data.bones[i].transform; return { a: Float32Array.from(t.rotation, (v) => v * (t.scale ?? 1)), t: [0, 0, 0] }; };
    return mul(mul(invBind(ia), { a: S3, t: [0, 0, 0] }), inv(invBind(ib))).a;
  }
  return null;
}

// Retail skeletons have no Weapon Bone Left, so one is made: F^-1 . local(Weapon Bone) . X, with no translation.
// X undoes the x negation applied to parts on a node named with Left.
export function offWeaponBoneAddon(skeleton, root, skelMats, nif = null) {
  const wb = skeleton?.byName?.get('weapon bone');
  if (wb === undefined || skeleton.byName.has(counterpartName('weapon bone'))) return null;
  const pr = skeleton.nodes.get(wb).parent;
  const pl = skeleton.nodes.has(pr) ? skeleton.byName.get(counterpartName(skeleton.nodes.get(pr).name)) : undefined;
  if (pl === undefined || pl === pr) return null;
  let F = skinHandMirror(nif, pr, pl);
  if (!F) {
    const rest = skelMats(skeleton, new Map(), root);
    if (!rest.get(pr) || !rest.get(pl)) return null;
    F = mul(mul(inv({ a: rest.get(pr).a, t: [0, 0, 0] }), { a: S3, t: [0, 0, 0] }), { a: rest.get(pl).a, t: [0, 0, 0] }).a;
  }
  const e = skeleton.nodes.get(wb).rest;
  const local = mul(mul(inv({ a: F, t: [0, 0, 0] }), { a: Float32Array.from(e.rotation, (v) => v * (e.scale ?? 1)), t: [e.translation[0], e.translation[1], e.translation[2]] }), { a: S3, t: [0, 0, 0] });
  const s = scaleOf(local.a);
  return {
    roots: [0],
    records: [
      { type: 'NiNode', name: skeleton.nodes.get(pl).name, rotation: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), translation: [0, 0, 0], scale: 1, children: [1], extra: -1 },
      { type: 'NiNode', name: `${skeleton.nodes.get(wb).name} Left`, rotation: Float32Array.from(local.a, (v) => v / s), translation: [local.t[0], local.t[1], local.t[2]], scale: s, children: [], extra: 2 },
      { type: 'NiStringExtraData', string: 'BONE', next: -1 },
    ],
  };
}
