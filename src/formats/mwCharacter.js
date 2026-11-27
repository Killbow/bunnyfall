
import { deref } from './mwNifFile.js';
import { flattenNif } from './mwNifMesh.js';
import { particleSystemOf, affineInverse } from './mwParticles.js';
import { skeletonSpaceMatrices, poseSkeleton, GRAPH_ROOT } from './mwSkin.js';

/**
 * @param {object} skeleton
 * @param {{records:object[], roots:number[]}} partNif
 * @param {{attachBone?: string}} [opts]
 */
/**
 * Matches the name case-insensitively and exactly, walking depth-first in pre-order and stopping at the first
 * match, as the reference name search does.
 * @returns {{rec: any, parents: any[]}|null}
 */
export function findNodeByName(nif, name) {
  const want = String(name).toLowerCase();
  let found = null;
  const walk = (ref, parents, isRoot = false) => {
    if (found) return;
    const rec = deref(nif, ref);
    if (!rec) return;
    // Narrower than the reference, where a geometry node with the searched name still matches. Changing it moves
    // BoneOffset placement for such meshes, so it needs fixtures first.
    if (rec.type === 'NiTriShape' || rec.type === 'NiTriStrips') return;
    // Skips a non-root 'Bounding Box' subtree, the one subtree the reference loader never builds. A root with that
    // name is kept, as in the reference.
    if (!isRoot && String(rec.name || '').toLowerCase() === 'bounding box') return;
    // Collision and hidden nodes stay searchable, since the reference builds them with a nonzero mask that its name
    // search still visits.
    if (String(rec.name || '').toLowerCase() === want) { found = { rec, parents }; return; }
    if (!rec.children) return;
    const chain = [...parents, rec];
    for (const child of rec.children) if (child >= 0) walk(child, chain);
  };
  for (const root of nif.roots ?? []) {
    if (root >= 0) walk(root, [], true);
    if (found) break;
  }
  return found;
}

export function boneOffsetOf(nif) {
  const hit = findNodeByName(nif, 'BoneOffset');
  if (!hit) return null;
  const t = hit.rec.translation;
  return t ? [t[0], t[1], t[2]] : [0, 0, 0];
}

/** @returns {{a: Float32Array, t: number[]}|null} */
export function nodeTransformOf(nif, name) {
  const hit = findNodeByName(nif, name);
  if (!hit) return null;
  let m = { a: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), t: [0, 0, 0] };
  for (const node of [...hit.parents, hit.rec]) {
    const local = affineOf(node);
    m = mulAffine(m, local);
  }
  return m;
}

const affineOf = (rec) => {
  const a = new Float32Array(9);
  const s = rec.scale ?? 1;
  for (let i = 0; i < 9; i++) a[i] = (rec.rotation ? rec.rotation[i] : (i % 4 === 0 ? 1 : 0)) * s;
  const t = rec.translation || [0, 0, 0];
  return { a, t: [t[0], t[1], t[2]] };
};

const mulAffine = (p, l) => {
  const a = new Float32Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      a[r * 3 + c] = p.a[r * 3] * l.a[c] + p.a[r * 3 + 1] * l.a[3 + c] + p.a[r * 3 + 2] * l.a[6 + c];
    }
  }
  return {
    a,
    t: [
      p.a[0] * l.t[0] + p.a[1] * l.t[1] + p.a[2] * l.t[2] + p.t[0],
      p.a[3] * l.t[0] + p.a[4] * l.t[1] + p.a[5] * l.t[2] + p.t[1],
      p.a[6] * l.t[0] + p.a[7] * l.t[1] + p.a[8] * l.t[2] + p.t[2],
    ],
  };
};

export function bindPart(skeleton, partNif, opts = {}) {
  const sink = [];
  const batches = flattenNif(partNif, { underNode: opts.underNode, excludeNode: opts.excludeNode, effects: sink });
  const effects = [];
  for (const bundle of sink) {
    const d = particleSystemOf(partNif, bundle);
    if (d) effects.push(Object.assign(d, { parentRef: bundle.parentRef ?? -1 }));
  }
  const skinned = [];
  const attached = [];
  const missingBones = new Set();
  for (const batch of batches) {
    if (!batch.skinned || !batch.skin) {
      attached.push(batch);
      continue;
    }
    const skin = batch.skin;
    // A missing bone is not fatal, as in the reference: its ref is null, its influences are skipped, and its name
    // is returned in `missingBones`.
    const bones = skin.bones.map((bone) => {
      const ref = skeleton.byName.get(bone.name);
      if (ref === undefined) {
        missingBones.add(bone.name);
        return { ...bone, ref: null };
      }
      return { ...bone, ref };
    });
    // A rebound part always poses in graph space, so every part shares one bone space whatever skin root it
    // declares.
    batch.skin = { ...skin, bones, skeletonRoot: GRAPH_ROOT, rootBone: GRAPH_ROOT };
    skinned.push(batch);
  }
  let attachRef = null;
  let boneOffset = null;
  if (attached.length) {
    const name = (opts.attachBone || '').toLowerCase();
    attachRef = name ? skeleton.byName.get(name) : firstRoot(skeleton);
    if (attachRef === undefined) {
      throw new Error(`bindPart: base skeleton has no bone "${opts.attachBone}" to attach to`);
    }
    boneOffset = boneOffsetOf(partNif);
  }
  return { skinned, attached, attachRef, boneOffset, missingBones: [...missingBones], effects };
}

export const isTriBip = (name) => String(name || '').toLowerCase().startsWith('tri bip');

/**
 * Each rigid creature batch follows its parent node, with the inverse of that node's rest pose as its pre-transform,
 * so at rest it stays where the file places it.
 * @returns {{ skinned: object[], rigid: {batch: object, attachRef: number, pre: object|null}[], effects: {desc: object, attachRef: number, pre: object|null}[], missingBones: string[], dropped: string[] }}
 */
export function bindCreatureModel(skeleton, nif) {
  const bound = bindPart(skeleton, nif);
  const rest = skeletonSpaceMatrices(skeleton, poseSkeleton(skeleton, null, null, 0, {}), GRAPH_ROOT);
  const root = firstRoot(skeleton);
  const onNode = (parentRef) => {
    const ref = skeleton.nodes.has(parentRef) ? parentRef : root;
    const at = rest.get(ref);
    return { attachRef: ref, pre: at ? affineInverse(at) : null };
  };
  const dropped = [];
  const keep = (b) => { if (!isTriBip(b.name)) return true; dropped.push(b.name); return false; };
  return {
    skinned: bound.skinned.filter(keep),
    rigid: bound.attached.filter(keep).map((batch) => ({ batch, ...onNode(batch.parentRef) })),
    effects: bound.effects.map((desc) => ({ desc, ...onNode(desc.parentRef) })),
    missingBones: bound.missingBones,
    dropped,
  };
}

function firstRoot(skeleton) {
  for (const [ref, node] of skeleton.nodes) {
    if (node.parent < 0) return ref;
  }
  return -1;
}

/** @param {Map} skelMats */
export function attachmentTransform(skelMats, attachRef) {
  return skelMats.get(attachRef) ?? { a: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), t: [0, 0, 0] };
}

export { skeletonSpaceMatrices };
