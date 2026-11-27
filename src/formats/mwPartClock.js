// A Morrowind bow mesh carries its draw motion, including the ArrowBone the arrow hangs from, in its own
// controllers. As in OpenMW, they run on the weapon group's time since that group started, while controllers under
// an AutoPlay node run on frame time.
import { deref } from './mwNifFile.js';
import { composeTransform, mat33Apply, GEOMETRY_TYPES } from './mwNifMesh.js';
import { findNodeByName } from './mwCharacter.js';
import { quatToMat33 } from './mwSkin.js';
import { trackFromController, sampleTrack } from './mwAnim.js';
import { sampleKeyGroup } from './mwKeys.js';
import { controllerTime, PARTICLE_FLAG_AUTOPLAY } from './mwParticles.js';
import { activeControllers, timingOf } from './mwVfx.js';

const REST_IDENTITY = Object.freeze({ rotation: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]), translation: Object.freeze([0, 0, 0]), scale: 1 });

export const ANIM_FLAG_AUTOPLAY = PARTICLE_FLAG_AUTOPLAY;

const CLOCKS = new WeakMap();

export function partClockOf(nif) {
  let pc = CLOCKS.get(nif);
  if (pc) return pc;
  const tracks = new Map();
  const morphs = new Map();
  for (const rec of nif.records ?? []) {
    if (!rec || !(rec.controller >= 0)) continue;
    for (const c of activeControllers(nif, rec)) {
      if (c.type === 'NiKeyframeController' && !tracks.has(rec)) {
        const track = trackFromController(nif, c);
        if (track) tracks.set(rec, { ...track, timing: timingOf(c) });
      } else if (c.type === 'NiGeomMorpherController' && !morphs.has(rec) && GEOMETRY_TYPES.has(rec.type) && !(rec.skin >= 0)) {
        const md = deref(nif, c.data);
        const shapeData = deref(nif, rec.data);
        const list = md?.morphs ?? [];
        if (list.length > 1 && shapeData?.vertices && list[0].vectors.length === shapeData.vertices.length) {
          morphs.set(rec, { base: list[0].vectors, targets: list.slice(1).map((m) => ({ vectors: m.vectors, keys: m.keys })), timing: timingOf(c) });
        }
      }
    }
  }
  pc = { tracks, morphs, animated: tracks.size > 0 || morphs.size > 0 };
  CLOCKS.set(nif, pc);
  return pc;
}

function localAt(pc, rec, value) {
  const rest = { rotation: rec.rotation ?? REST_IDENTITY.rotation, translation: rec.translation ?? REST_IDENTITY.translation, scale: rec.scale ?? 1 };
  const track = pc.tracks.get(rec);
  if (!track) return rest;
  const s = sampleTrack(track, controllerTime(track.timing, value));
  return {
    rotation: s.rotation ? quatToMat33(s.rotation) : rest.rotation,
    translation: s.translation ?? rest.translation,
    scale: s.scale ?? rest.scale,
  };
}

export function chainAt(pc, chain, value) {
  let w = REST_IDENTITY;
  for (const rec of chain) w = composeTransform(w, localAt(pc, rec, value));
  return w;
}

export function morphedAt(pc, shape, value) {
  const m = pc.morphs.get(shape);
  if (!m) return null;
  const t = controllerTime(m.timing, value);
  const out = Float32Array.from(m.base);
  for (const target of m.targets) {
    const w = target.keys?.keys?.length ? sampleKeyGroup(target.keys, 1, t) : 0;
    if (!w) continue;
    const v = target.vectors;
    for (let i = 0; i < out.length; i++) out[i] += v[i] * w;
  }
  return out;
}

export const clockFor = (animFlags, value, frameTime) => ((animFlags & ANIM_FLAG_AUTOPLAY) !== 0 ? frameTime : value);

export function batchMoves(nif, batch) {
  if (!batch?.chain) return false;
  const pc = partClockOf(nif);
  return pc.animated && (pc.morphs.has(batch.ref) || batch.chain.some((r) => pc.tracks.has(r)));
}

export function posePartBatch(nif, batch, value, out, outNormals = null, frameTime = value) {
  if (!batchMoves(nif, batch)) return false;
  const pc = partClockOf(nif);
  const t = clockFor(batch.animFlags | 0, value, frameTime);
  const w = chainAt(pc, batch.chain, t);
  const verts = morphedAt(pc, batch.ref, t) ?? batch.local;
  for (let i = 0; i + 2 < verts.length && i + 2 < out.length; i += 3) {
    const [x, y, z] = mat33Apply(w.rotation, verts[i] * w.scale, verts[i + 1] * w.scale, verts[i + 2] * w.scale);
    out[i] = x + w.translation[0]; out[i + 1] = y + w.translation[1]; out[i + 2] = z + w.translation[2];
  }
  if (outNormals && batch.localNormals) {
    const n = batch.localNormals;
    for (let i = 0; i + 2 < n.length && i + 2 < outNormals.length; i += 3) {
      const [x, y, z] = mat33Apply(w.rotation, n[i], n[i + 1], n[i + 2]);
      outNormals[i] = x; outNormals[i + 1] = y; outNormals[i + 2] = z;
    }
  }
  return true;
}

const CHAINS = new WeakMap();
function chainTo(nif, name) {
  let byName = CHAINS.get(nif);
  if (!byName) CHAINS.set(nif, (byName = new Map()));
  const key = String(name).toLowerCase();
  if (!byName.has(key)) {
    const hit = findNodeByName(nif, name);
    byName.set(key, hit ? [...hit.parents, hit.rec] : null);
  }
  return byName.get(key);
}

export function nodeClockAt(nif, name, value, frameTime = value) {
  const pc = partClockOf(nif);
  if (!pc.animated) return null;
  const chain = chainTo(nif, name);
  if (!chain || !chain.some((r) => pc.tracks.has(r))) return null;
  let flags = 0;
  for (const r of chain) if (r.type === 'NiBSAnimationNode' || r.type === 'NiBSParticleNode') flags = r.flags | 0;
  return clockFor(flags, value, frameTime);
}

export function nodeAffineAt(nif, name, value, frameTime = value) {
  const t = nodeClockAt(nif, name, value, frameTime);
  if (t === null) return null;
  const w = chainAt(partClockOf(nif), chainTo(nif, name), t);
  const a = new Float32Array(9);
  for (let i = 0; i < 9; i++) a[i] = w.rotation[i] * w.scale;
  return { a, t: [w.translation[0], w.translation[1], w.translation[2]] };
}
