
import { deref } from './mwNifFile.js';
import { affineOfTransform, affineMul } from './mwAffine.js';

const NODE_TYPES = new Set([
  'NiNode',
  'NiBSAnimationNode',
  'NiBSParticleNode',
  'NiBillboardNode',
  'AvoidNode',
  'RootCollisionNode',
  'NiSwitchNode',
  'NiLODNode',
  'NiSortAdjustNode',
  'NiCollisionSwitch',
]);

const IDENT_A = Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);

function affineInverse(m) {
  const s2 = m.a[0] * m.a[0] + m.a[3] * m.a[3] + m.a[6] * m.a[6];
  const inv = new Float32Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) inv[r * 3 + c] = m.a[c * 3 + r] / s2;
  }
  const t = [
    -(inv[0] * m.t[0] + inv[1] * m.t[1] + inv[2] * m.t[2]),
    -(inv[3] * m.t[0] + inv[4] * m.t[1] + inv[5] * m.t[2]),
    -(inv[6] * m.t[0] + inv[7] * m.t[1] + inv[8] * m.t[2]),
  ];
  return { a: inv, t };
}

export function quatToMat33(q) {
  const [w, x, y, z] = q;
  return Float32Array.from([
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ]);
}

/** @returns {{nodes: Map<number, {ref:number, name:string, parent:number, rest:{rotation:Float32Array, translation:number[], scale:number}}>, byName: Map<string, number>}} */
export function buildSkeleton(nif) {
  const nodes = new Map();
  const byName = new Map();
  function walk(ref, parent) {
    const rec = deref(nif, ref);
    if (!rec || !NODE_TYPES.has(rec.type)) return;
    nodes.set(ref, {
      ref,
      name: rec.name || '',
      parent,
      rest: { rotation: rec.rotation, translation: rec.translation, scale: rec.scale },
    });
    // Duplicate names map to the first node in traversal order, matching OpenMW's bone cache, so a duplicated
    // attach bone resolves to the first copy.
    if (rec.name) {
      const key = rec.name.toLowerCase();
      if (!byName.has(key)) byName.set(key, ref);
    }
    for (const child of rec.children) {
      if (child >= 0) walk(child, ref);
    }
  }
  for (const root of nif.roots) {
    if (root >= 0) walk(root, -1);
  }
  return { nodes, byName };
}

export const INJECTED_REF_BASE = 1 << 24;

export function hasBoneMarker(nif, rec) {
  let e = rec?.extra ?? -1;
  let guard = 0;
  while (e >= 0 && guard++ < 64) {
    const x = deref(nif, e);
    if (!x) return false;
    if (x.type === 'NiStringExtraData' && x.string === 'BONE') return true;
    e = x.next ?? -1;
  }
  return false;
}

/**
 * Matches OpenMW's custom bone loading: only nodes marked BONE are copied, under the actor node named like their
 * addon parent. A name the skeleton already has is skipped, since OpenMW never finds that copy.
 * @returns {{added:string[], skipped:string[]}}
 */
export function injectSkeletonNodes(skeleton, addonNif) {
  const added = [];
  const skipped = [];
  let next = INJECTED_REF_BASE;
  for (const [ref] of skeleton.nodes) if (ref >= next) next = ref + 1;
  function copy(ref, parentRef) {
    const rec = deref(addonNif, ref);
    if (!rec || !NODE_TYPES.has(rec.type)) return;
    const key = String(rec.name || '').toLowerCase();
    const hereRef = next++;
    skeleton.nodes.set(hereRef, {
      ref: hereRef, name: rec.name || '', parent: parentRef,
      rest: { rotation: rec.rotation, translation: rec.translation, scale: rec.scale },
      injected: true,
    });
    if (key && !skeleton.byName.has(key)) skeleton.byName.set(key, hereRef);
    added.push(rec.name || '(nameless)');
    for (const child of rec.children ?? []) if (child >= 0) copy(child, hereRef);
  }
  function walk(ref, parentRec) {
    const rec = deref(addonNif, ref);
    if (!rec || !NODE_TYPES.has(rec.type)) return;
    if (hasBoneMarker(addonNif, rec)) {
      const key = String(rec.name || '').toLowerCase();
      const parentKey = String(parentRec?.name || '').toLowerCase();
      const baseParent = parentKey ? skeleton.byName.get(parentKey) : undefined;
      if (baseParent === undefined) { skipped.push(`${rec.name || '(nameless)'} (no "${parentRec?.name ?? ''}" here)`); return; }
      if (key && skeleton.byName.has(key)) { skipped.push(`${rec.name} (already here)`); return; }
      copy(ref, baseParent);
      return;
    }
    for (const child of rec.children ?? []) if (child >= 0) walk(child, rec);
  }
  for (const root of addonNif.roots) if (root >= 0) walk(root, null);
  return { added, skipped };
}

// Matches OpenMW's addAnimSource: try `bip01`, then `root bone`, and accept a name only when this source animates
// it. Callers with several sources keep the first non-null answer.
export const ACCUM_ROOT_NAMES = Object.freeze(['bip01', 'root bone']);

export function accumRootRef(skeleton, tracks) {
  const byName = skeleton && skeleton.byName;
  if (!byName) return null;
  for (const name of ACCUM_ROOT_NAMES) {
    if (!byName.has(name)) continue;
    if (!tracks || !tracks.has(name)) continue;
    return byName.get(name);
  }
  return null;
}

/**
 * On the accumulation root, X and Y translation are zeroed rather than reset to rest, as OpenMW's
 * ResetAccumRootCallback does, and Z stays animated.
 * @returns {Map<number, {rotation:Float32Array, translation:number[], scale:number}>}
 */
export function poseSkeleton(skeleton, tracks, sampleTrack, time, opts = {}) {
  const pose = new Map();
  for (const [ref, node] of skeleton.nodes) {
    const track = tracks && tracks.get(node.name.toLowerCase());
    if (!track) {
      pose.set(ref, node.rest);
      continue;
    }
    const s = sampleTrack(track, time);
    let translation = s.translation ?? node.rest.translation;
    if (ref === opts.accumRoot) {
      translation = [0, 0, translation[2]];
    }
    pose.set(ref, {
      rotation: s.rotation ? quatToMat33(s.rotation) : node.rest.rotation,
      translation,
      scale: s.scale ?? node.rest.scale,
    });
  }
  return pose;
}

// Pass as `skeletonRoot` to include the file root's own transform in every bone matrix, as OpenMW's skeleton space
// does, since a Bip01 root can carry a real transform.
export const GRAPH_ROOT = -1;

export function skeletonSpaceMatrices(skeleton, pose, skeletonRoot) {
  const out = new Map();
  function matOf(ref) {
    if (out.has(ref)) return out.get(ref);
    let m;
    if (ref === skeletonRoot || ref < 0 || !skeleton.nodes.has(ref)) {
      m = { a: IDENT_A, t: [0, 0, 0] };
    } else {
      const node = skeleton.nodes.get(ref);
      const local = pose.get(ref) ?? node.rest;
      m = affineMul(matOf(node.parent), affineOfTransform(local));
    }
    out.set(ref, m);
    return m;
  }
  for (const ref of skeleton.nodes.keys()) matOf(ref);
  return out;
}

export function skinToSkelMatrix(skeleton, pose, skeletonRoot, rootBone) {
  const chain = [];
  let ref = rootBone;
  while (ref >= 0 && ref !== skeletonRoot && skeleton.nodes.has(ref)) {
    chain.unshift(ref);
    ref = skeleton.nodes.get(ref).parent;
  }
  if (ref !== skeletonRoot || !chain.length) return { a: IDENT_A, t: [0, 0, 0] };
  let m = { a: IDENT_A, t: [0, 0, 0] };
  for (const r of chain) {
    const local = pose.get(r) ?? skeleton.nodes.get(r).rest;
    m = affineMul(m, affineOfTransform(local));
  }
  return affineInverse(m);
}

function skinScratch(batch, n) {
  const sc = batch._skinScratch;
  if (sc && sc.n === n) return sc;
  const fresh = {
    n,
    acc: new Float32Array(n * 12),
    wsum: new Float32Array(n),
    touched: new Uint8Array(n),
    collapse: new Float32Array(12),
    composed: new Float32Array(12),
    boneMat: { a: new Float32Array(9), t: [0, 0, 0] },
  };
  batch._skinScratch = fresh;
  return fresh;
}

// Must stay bit-identical to `affineMul`; mwGpuSkin.js builds its bone palette through this function so the CPU and
// GPU skins agree.
export function affineMulInto(p, l, out) {
  const a = out.a;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      a[r * 3 + c] =
        p.a[r * 3] * l.a[c] + p.a[r * 3 + 1] * l.a[3 + c] + p.a[r * 3 + 2] * l.a[6 + c];
    }
  }
  out.t[0] = p.a[0] * l.t[0] + p.a[1] * l.t[1] + p.a[2] * l.t[2] + p.t[0];
  out.t[1] = p.a[3] * l.t[0] + p.a[4] * l.t[1] + p.a[5] * l.t[2] + p.t[1];
  out.t[2] = p.a[6] * l.t[0] + p.a[7] * l.t[1] + p.a[8] * l.t[2] + p.t[2];
  return out;
}

// NiSkinData's root transform follows the skin-to-skeleton cancel, then the shape's own transform, which OpenMW
// never cancels. mwGpuSkin.js applies this same affine.
export function skinPost(skin, skeleton, pose) {
  let post = affineMul(
    affineOfTransform(skin.transform),
    skinToSkelMatrix(skeleton, pose, skin.skeletonRoot, skin.rootBone),
  );
  if (skin.shapeTransform) post = affineMul(affineOfTransform(skin.shapeTransform), post);
  return post;
}

export function skinBatch(batch, skeleton, pose, skelMats, positionsOut, normalsOut) {
  const skin = batch.skin;
  const post = skinPost(skin, skeleton, pose);
  const n = batch.positions.length / 3;
  const sc = skinScratch(batch, n);
  const acc = sc.acc; acc.fill(0);
  const wsum = sc.wsum; wsum.fill(0);
  const touched = sc.touched; touched.fill(0);
  const boneMat = sc.boneMat;
  // As in OpenMW, `post` applies once to the blended affine, never per bone, and weights are not renormalized.
  // Influences on missing bones are skipped but still mark the vertex touched.
  for (const bone of skin.bones) {
    if (bone.ref == null) {
      for (let k = 0; k < bone.indices.length; k++) touched[bone.indices[k]] = 1;
      continue;
    }
    const m = affineMulInto(skelMats.get(bone.ref), bone.invBind, boneMat);
    for (let k = 0; k < bone.indices.length; k++) {
      const v = bone.indices[k];
      const w = bone.weights[k];
      const o = v * 12;
      for (let i = 0; i < 9; i++) acc[o + i] += m.a[i] * w;
      acc[o + 9] += m.t[0] * w;
      acc[o + 10] += m.t[1] * w;
      acc[o + 11] += m.t[2] * w;
      wsum[v] += w;
      touched[v] = 1;
    }
  }
  const collapse = sc.collapse;
  collapse[9] = post.t[0];
  collapse[10] = post.t[1];
  collapse[11] = post.t[2];
  const composed = sc.composed;
  const pa = post.a;
  const pt = post.t;
  const composePost = (o) => {
    for (let c = 0; c < 3; c++) {
      const x = acc[o + c]; const y = acc[o + 3 + c]; const z = acc[o + 6 + c];
      composed[c] = pa[0] * x + pa[1] * y + pa[2] * z;
      composed[3 + c] = pa[3] * x + pa[4] * y + pa[5] * z;
      composed[6 + c] = pa[6] * x + pa[7] * y + pa[8] * z;
    }
    const tx = acc[o + 9]; const ty = acc[o + 10]; const tz = acc[o + 11];
    composed[9] = pa[0] * tx + pa[1] * ty + pa[2] * tz + pt[0];
    composed[10] = pa[3] * tx + pa[4] * ty + pa[5] * tz + pt[1];
    composed[11] = pa[6] * tx + pa[7] * ty + pa[8] * tz + pt[2];
    return composed;
  };
  for (let v = 0; v < n; v++) {
    const o = v * 12;
    const a = wsum[v] > 0 ? composePost(o) : touched[v] ? collapse : null;
    const x = batch.positions[v * 3];
    const y = batch.positions[v * 3 + 1];
    const z = batch.positions[v * 3 + 2];
    if (a) {
      positionsOut[v * 3] = a[0] * x + a[1] * y + a[2] * z + a[9];
      positionsOut[v * 3 + 1] = a[3] * x + a[4] * y + a[5] * z + a[10];
      positionsOut[v * 3 + 2] = a[6] * x + a[7] * y + a[8] * z + a[11];
    } else {
      positionsOut[v * 3] = x;
      positionsOut[v * 3 + 1] = y;
      positionsOut[v * 3 + 2] = z;
    }
    if (normalsOut && batch.normals) {
      const nx = batch.normals[v * 3];
      const ny = batch.normals[v * 3 + 1];
      const nz = batch.normals[v * 3 + 2];
      let ox = nx;
      let oy = ny;
      let oz = nz;
      if (a) {
        ox = a[0] * nx + a[1] * ny + a[2] * nz;
        oy = a[3] * nx + a[4] * ny + a[5] * nz;
        oz = a[6] * nx + a[7] * ny + a[8] * nz;
      }
      const len = Math.hypot(ox, oy, oz) || 1;
      normalsOut[v * 3] = ox / len;
      normalsOut[v * 3 + 1] = oy / len;
      normalsOut[v * 3 + 2] = oz / len;
    }
  }
}

/**
 * Uses the same lowercase name match as `poseSkeleton`. Keep the two in sync, because a clip that matches no bone
 * silently poses everything at rest.
 * @returns {{matched:{bone:string, ref:number}[], unmatchedTracks:string[], untrackedBones:string[]}}
 */
export function trackBinding(skeleton, tracks) {
  const matched = [];
  const untrackedBones = [];
  const hit = new Set();
  for (const [ref, node] of skeleton?.nodes ?? []) {
    const key = node.name.toLowerCase();
    if (tracks && tracks.has(key)) {
      matched.push({ bone: node.name, ref });
      hit.add(key);
    } else {
      untrackedBones.push(node.name);
    }
  }
  const unmatchedTracks = [...(tracks?.keys() ?? [])].filter((k) => !hit.has(k));
  return { matched, unmatchedTracks, untrackedBones };
}
