// @ts-check
// Held map pose: deltas over the Morrowind first-person idle, plus a parchment quad the hands hold.
// ui/quadMap.js draws the map itself as a DOM canvas over the quad's projected corners.

import { transformPoint } from '../world/mat4.js';

// Rounded from MW_UNITS_PER_METER in mwFirstPerson.js.
const UNITS_PER_METRE = 69.99;

// Bone deltas are degrees about each bone's own axes, applied after the idle, because retail and fixture skeletons
// have different rest frames. Paper sizes are meters from the eye and tilt is degrees.
export const HELD_POSE_DEFAULT = Object.freeze({
  bones: Object.freeze({
    'left upper arm': Object.freeze([0, 0, 0]),
    'left forearm': Object.freeze([0, 0, 0]),
    'left hand': Object.freeze([0, 0, 0]),
    'right upper arm': Object.freeze([0, 0, 0]),
    'right forearm': Object.freeze([0, 0, 0]),
    'right hand': Object.freeze([0, 0, 0]),
  }),
  paper: Object.freeze({
    width: 0.46,
    forward: 0.42,
    drop: 0.14,
    tilt: 22,
    colour: Object.freeze([0.80, 0.68, 0.47]),
  }),
});

export const HELD_BONES = Object.freeze([
  'left clavicle', 'left upper arm', 'left forearm', 'left wrist', 'left hand',
  'right clavicle', 'right upper arm', 'right forearm', 'right wrist', 'right hand',
]);
// Retail clips key the Bip01 bones and never the attach nodes; posing an attach node would leave the hand behind.
export const HELD_BONE_ALIASES = Object.freeze({
  'left clavicle': 'bip01 l clavicle', 'left upper arm': 'bip01 l upperarm', 'left forearm': 'bip01 l forearm', 'left hand': 'bip01 l hand',
  'right clavicle': 'bip01 r clavicle', 'right upper arm': 'bip01 r upperarm', 'right forearm': 'bip01 r forearm', 'right hand': 'bip01 r hand',
});
export function resolveHeldBone(name, base, skeleton) {
  const key = String(name).toLowerCase();
  const alias = HELD_BONE_ALIASES[key];
  const names = alias ? [key, alias] : [key];
  const has = (n) => skeleton?.byName?.get(n) != null;
  return names.find((n) => base?.has?.(n) && has(n)) ?? names.find(has) ?? null;
}

// Quaternions are [w, x, y, z] because mwAnim.js and mwSkin.js quatToMat33 read that packing.
export const QUAT_IDENTITY = Object.freeze([1, 0, 0, 0]);
export function quatMul(a, b) {
  const [aw, ax, ay, az] = a, [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}
export function quatAxis(axis, deg) {
  const h = deg * Math.PI / 360;
  const s = Math.sin(h), c = Math.cos(h);
  return axis === 0 ? [c, s, 0, 0] : axis === 1 ? [c, 0, s, 0] : [c, 0, 0, s];
}
/** @param {number[]} e */
export function quatFromEulerDeg(e) {
  return quatMul(quatMul(quatAxis(0, e[0] ?? 0), quatAxis(1, e[1] ?? 0)), quatAxis(2, e[2] ?? 0));
}
export function mat33ToQuat(m) {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
  }
  return [w, x, y, z];
}
const isZero = (e) => !e || (Math.abs(e[0]) < 1e-9 && Math.abs(e[1]) < 1e-9 && Math.abs(e[2]) < 1e-9);

// The caller memoizes the returned map per (base, spec, skeleton), so a frame allocates nothing.
/**
 * @param {Map<string, any>|null} base
 * @param {{bones?: Record<string, number[]>}} spec
 * @param {{byName?: Map<string, any>, nodes?: Map<any, any>}|null} skeleton
 */
export function deltaTracks(base, spec, skeleton) {
  const out = new Map(base ?? []);
  const bones = spec?.bones ?? {};
  for (const name of Object.keys(bones)) {
    if (isZero(bones[name])) continue;
    const key = resolveHeldBone(name, base, skeleton);
    const ref = key != null ? skeleton?.byName?.get(key) : null;
    const node = ref != null ? skeleton?.nodes?.get(ref) : null;
    if (!node) continue;
    out.set(key, {
      __delta: quatFromEulerDeg(bones[name]),
      __base: base?.get(key) ?? null,
      __rest: node.rest?.rotation ? mat33ToQuat(node.rest.rotation) : [...QUAT_IDENTITY],
    });
  }
  return out;
}

export function heldSampler(sampleTrack) {
  return (track, time) => {
    if (!track || !track.__delta) return sampleTrack(track, time);
    const base = track.__base ? sampleTrack(track.__base, time) : null;
    const q = base?.rotation ?? track.__rest;
    return { rotation: quatMul(q, track.__delta), translation: base?.translation ?? null, scale: base?.scale ?? null };
  };
}

// Rig space is Z up with the actor facing +Y. Corners run top-left, top-right, bottom-right, bottom-left.
/**
 * @param {number[]} eye
 * @param {{width: number, forward: number, drop: number, tilt: number}} paper
 * @param {number} aspect
 */
export function paperCornersRig(eye, paper, aspect) {
  const w = paper.width * UNITS_PER_METRE;
  const h = w / (aspect > 0 ? aspect : 1.6);
  const t = (paper.tilt ?? 0) * Math.PI / 180;
  const cx = eye[0], cy = eye[1] + paper.forward * UNITS_PER_METRE, cz = eye[2] - paper.drop * UNITS_PER_METRE;
  const uy = Math.sin(t), uz = Math.cos(t);
  const at = (sx, sv) => [cx + sx * w / 2, cy + sv * (h / 2) * uy, cz + sv * (h / 2) * uz];
  return [at(-1, 1), at(1, 1), at(1, -1), at(-1, -1)];
}

// One winding only: the character pass draws with culling off, so a second winding would fight for depth.
export function paperPiece(eye, paper, aspect) {
  const c = paperCornersRig(eye, paper, aspect);
  const source = new Float32Array(12);
  c.forEach((p, i) => { source[i * 3] = p[0]; source[i * 3 + 1] = p[1]; source[i * 3 + 2] = p[2]; });
  return {
    slot: 'paper', bone: null, kind: 'rigid', mirrored: false, tag: null,
    batch: null, source, attachRef: null, boneOffset: null,
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    colors: null,
    indices: new Uint16Array([0, 2, 1, 0, 3, 2]),
    material: { diffuse: [...(paper.colour ?? HELD_POSE_DEFAULT.paper.colour)], vertexColorMode: 0, textureFile: null, clampMode: 3, alphaTest: false },
    positions: new Float32Array(12),
  };
}

/** @returns {number} */
export function refreshPaperSource(piece, eye, paper, aspect) {
  const c = paperCornersRig(eye, paper, aspect);
  let far = 0;
  c.forEach((p, i) => {
    piece.source[i * 3] = p[0]; piece.source[i * 3 + 1] = p[1]; piece.source[i * 3 + 2] = p[2];
    const d = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
    if (d > far) far = d;
  });
  return far;
}

/**
 * @param {Float32Array} positions
 * @param {{model: Float32Array, view: Float32Array, proj: Float32Array}} cam
 * @param {{x: number, y: number, w: number, h: number}} rect
 */
export function projectPaperCorners(positions, cam, rect) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const [x, y, z] = transformPoint(cam.model, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    const v = cam.view, p = cam.proj;
    const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
    const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
    const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
    const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
    if (!(cw > 1e-6)) return null;
    const cx = (p[0] * vx + p[4] * vy + p[8] * vz + p[12]) / cw;
    const cy = (p[1] * vx + p[5] * vy + p[9] * vz + p[13]) / cw;
    out.push([rect.x + (cx * 0.5 + 0.5) * rect.w, rect.y + (1 - (cy * 0.5 + 0.5)) * rect.h]);
  }
  return out;
}

export function normaliseHeldPose(spec, base = HELD_POSE_DEFAULT) {
  const bones = {};
  for (const name of HELD_BONES) {
    const e = spec?.bones?.[name] ?? base?.bones?.[name] ?? HELD_POSE_DEFAULT.bones[name];
    if (!e) continue;
    bones[name] = [0, 1, 2].map((i) => (Number.isFinite(+e[i]) ? +e[i] : 0));
  }
  const d = { ...HELD_POSE_DEFAULT.paper, ...(base?.paper ?? {}) };
  const p = spec?.paper ?? {};
  const num = (v, fb) => (Number.isFinite(+v) ? +v : fb);
  const colour = Array.isArray(p.colour) && p.colour.length === 3 ? p.colour.map((v, i) => num(v, d.colour[i])) : [...d.colour];
  return {
    bones,
    paper: { width: num(p.width, d.width), forward: num(p.forward, d.forward), drop: num(p.drop, d.drop), tilt: num(p.tilt, d.tilt), colour },
  };
}
