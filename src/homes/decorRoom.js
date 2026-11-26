// @ts-check

import { decorFlameLift } from './decorFlame.js';
import { trs } from '../world/mat4.js';
import { localAabb, transformedAabb, aabbOutside } from '../render/frustum.js';
import { RAY_DISTANCE, DEFAULT_ACTIVATION_DISTANCE } from '../player/activate.js';
import { billboardSize } from '../world/rmbFlats.js';
import { armFlatAnim } from '../render/flatAnimation.js';
import { collectInteriorLights } from '../world/interiorLights.js';
import { decorIsMount, decorIsTrophy, decorMountFrame, DECOR_MOUNT_LIFT, decorFlatMirrored, decorDrawnScale, decorIsFigure } from '../net/decorLaw.js';
import { figureLook, personActor } from '../characters/peopleBodies.js';
import { decorMountDye, decorMountDyeTarget, decorMountItem } from './decorItems.js';
import { toColor32 } from '../formats/color32Order.js';
import { preloadTextureRecord } from '../render/textureReplacement.js';
import { writeDecalQuad, clearDecalQuad, DECAL_FLOATS } from '../combat/bloodDecals.js';
import { decorIsDoor } from './decorDoorways.js';
import { drawnFlat } from '../characters/nudeFlats.js';
import { StaticBatchBuilder, keyResolver } from '../render/staticBatch.js';
import { lateSolidsOf } from '../player/lateSolid.js';
import { decorHearth } from './decorUse.js';
import { loadTrophyArt } from './trophyArt.js';

export const DECOR_REACH = DEFAULT_ACTIVATION_DISTANCE;
export const DECOR_MODEL_RETRY_MS = 2000;
// The activation key is also the model's collider bucket name, because player/activate.js compares the two.
export const decorKeyOf = (id) => `decor:${id}`;
export const decorIdOfKey = (key) => (typeof key === 'string' && key.startsWith('decor:') ? key.slice(6) : null);
export const DECOR_DRAW = 0, DECOR_SHADOW = 1, DECOR_SKIP = 2;
export function decorPieceSeen(half, dx, dy, dz, minAngle) {
  if (!(minAngle > 0)) return true;
  const d = Math.hypot(dx, dy, dz);
  return half >= d * minAngle;
}
const entrySeen = (e, eye, minAngle) => {
  if (!eye || !e.size) return true;
  const p = e.piece.pos;
  return decorPieceSeen(Math.max(Math.abs(e.size.w), e.size.h) / 2, e.o[0] + p[0] - eye[0], e.o[1] + p[1] - eye[1], e.o[2] + p[2] - eye[2], minAngle);
};
export const decorBoxSeen = (b, eye, minAngle) => decorPieceSeen(Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2,
  (b[0] + b[3]) / 2 - eye[0], (b[1] + b[4]) / 2 - eye[1], (b[2] + b[5]) / 2 - eye[2], minAngle);
export function decorCullVerdict(planes, box, reaches) {
  if (!aabbOutside(planes, box)) return DECOR_DRAW;
  return reaches(box) ? DECOR_SHADOW : DECOR_SKIP;
}
const _castOnly = new WeakMap();
export function castOnly(r) {
  let cast = _castOnly.get(r);
  if (!cast) { cast = { drawMesh: (mesh, m, remap, o) => { if (!o?.noShadow) r.recordShadowMesh?.(mesh, m, remap); } }; _castOnly.set(r, cast); }
  return cast;
}
export function drawSeen(r, cull, box, mesh, m, remap = null, o = undefined) {
  const seen = cull && box ? cull(box) : DECOR_DRAW;
  if (seen === DECOR_SKIP) return false;
  (seen === DECOR_SHADOW ? castOnly(r) : r).drawMesh(mesh, m, remap, o);
  return seen === DECOR_DRAW;
}

export const DECOR_MERGE_SETTLE_MS = 500;
export const DECOR_MERGE_MIN = 2;
const RAW_KEY = keyResolver(null);
export function decorMergeable(e, o) {
  const cpu = e?.mesh;
  return !!(e.gpu && !e.door && cpu?.positions && cpu.indices && cpu.normals && cpu.uvs && cpu.subMeshes?.length
    && e.o[0] === o[0] && e.o[1] === o[1] && e.o[2] === o[2]);
}
export function mergeDecorModels(entries, o) {
  const b = new StaticBatchBuilder();
  for (const e of entries) {
    const local = Float32Array.from(e.matrix);
    local[12] -= o[0]; local[13] -= o[1]; local[14] -= o[2];
    b.add(e.mesh, local, RAW_KEY);
  }
  return b.finish();
}
export const decorMergeMatrix = (o) => trs(o[0], o[1], o[2], 0, 0, 0);
const FLAT_ALONE = ['frame', 'lptProto', 'tint', 'dye', 'conceal', 'hitFlash', 'glint', 'dissolve', 'noShadow', 'selfCard', 'castOnly', 'tip', 'eliteGlow', 'dwColumn'];
export function decorFlatMergeKey(e, o) {
  const b = e?.batch;
  if (!b || e.anims || e.mount || decorIsFigure(e.piece)) return null;
  if (b._quads !== 1 || b._dyn || b._scales) return null;
  for (const k of FLAT_ALONE) if (b[k] != null) return null;
  if (e.o[0] !== o[0] || e.o[1] !== o[1] || e.o[2] !== o[2]) return null;
  return `${b.archive}|${b.record}|${b.size.w}|${b.size.h}|${b.sway ?? 0}|${b.windfall ?? 0}`;
}

export function decorLightLift(piece, size) {
  if (!piece.flat) return 0;
  if (!size) return null;
  const flame = piece.flat[0] === 210 ? decorFlameLift(piece.flat[1], size.h) : null;
  if (flame != null) return flame;
  const [own] = collectInteriorLights([{ archive: piece.flat[0], record: piece.flat[1], x: 0, y: 0, z: 0 }], () => size);
  return own ? own.y : size.h / 2;
}

export function decorMountQuad(piece, origin, size) {
  const f = decorMountFrame(piece.rot);
  const centre = [origin[0] + piece.pos[0], origin[1] + piece.pos[1], origin[2] + piece.pos[2]];
  const hw = size.w / 2;
  const hh = size.h / 2;
  const at = (sx, sy) => [0, 1, 2].map((i) => centre[i] + f.right[i] * sx * hw + f.up[i] * sy * hh);
  return { centre, ...f, w: size.w, h: size.h, corners: [at(-1, -1), at(-1, 1), at(1, 1), at(1, -1)] };
}

export function decorMountFloats(quad) {
  const out = new Float32Array(DECAL_FLOATS);
  if (!quad || !(quad.w > 0) || !(quad.h > 0)) { clearDecalQuad(out, 0); return out; }
  writeDecalQuad(out, 0, { pos: quad.centre, size: quad.h, stretch: quad.w / quad.h, right: quad.right, up: quad.up, wet: 0 });
  return out;
}

export function loadMountArt({ getTexture, uploadRecord, renderer }, a, r, dye, dyeTarget = null) {
  return Promise.resolve(getTexture?.(a)).then(async (t) => {
    if (!t || !(r < t.recordCount)) return null;
    await preloadTextureRecord(a, r, 0, 'Albedo', dye);
    const variant = uploadRecord?.(a, r, { mips: false, removeMask: true, dye, dyeTarget });
    const tex = renderer?.textures?.get?.(`${a}_${r}${variant ?? '#ui'}`) ?? null;
    if (!tex) return null;
    const { w, h } = billboardSize(t, r);
    return { tex, w, h };
  }).catch(() => null);
}

export function loadMwMountArt({ mwPicture, renderer }, item, archive = 'mw-mount') {
  if (typeof mwPicture !== 'function' || !item) return Promise.resolve(null);
  return Promise.resolve().then(() => mwPicture(item)).then((pic) => {
    if (!pic?.image?.width || !pic.key) return null;
    const tex = renderer?.uploadTexture?.(archive, pic.key, toColor32(pic.image), { mips: false, variant: '' }) ?? null;
    return tex ? { tex, w: pic.w, h: pic.h, key: pic.key } : null;
  }).catch(() => null);
}

export const MW_STAND_ARCHIVE = 'mw-stand';
export const decorStandsOwn = (piece) => !!piece?.item && piece.model == null && Array.isArray(piece.flat) && !decorIsMount(piece);

export function loadMountPicture(deps, flat, d) {
  if (decorIsTrophy({ model: null, flat, item: d })) return loadTrophyArt(deps, flat[0]);
  return loadMwMountArt(deps, decorMountItem(d))
    .then((mw) => mw ?? loadMountArt(deps, flat[0], flat[1], decorMountDye(d), decorMountDyeTarget(d)));
}

// A piece's pos is relative to the building origin, so every client and visit places it alike.
export function decorMatrix(piece, origin) {
  const [x, y, z] = piece.pos;
  const [yaw, pitch, roll] = piece.rot;
  return trs(origin[0] + x, origin[1] + y, origin[2] + z, pitch, yaw, roll, piece.scale, piece.scale, piece.scale);
}

export function createDecorRoom({
  meshes, renderer, getTexture, uploadRecord, uploadRecordFrame, flatAnims = () => null, collider, origin, roomLights = () => null,
  mwPicture = null, later = setTimeout, doors = null, prepareModel = null, standFlat = null, lampOf = null, merge = null, body = undefined,
}) {
  const late = () => lateSolidsOf(collider?.());
  /** @type {Map<string, {piece: any, o: number[], gpu: any, box: any, wbox?: number[] | null, cpu: any, mesh?: any, merged?: boolean, matrix: Float32Array, batch: any, anims: any, size: any, light: any, mount: any, door: any, release?: any, quiet?: boolean}>} */
  const standing = new Map();
  /** @type {{gpu: any, matrix: Float32Array, box: number[], wbox: number[] | null, n: number} | null} */
  let merged = null;
  /** @type {{batch: any, members: any[]}[]} */
  let flatGroups = [];
  let mergedAt = [0, 0, 0];
  let mergeDue = false;
  let changedAt = 0;
  const changed = () => { if (merge) { mergeDue = true; changedAt = merge.now(); } };
  function unmerge() {
    if (!merged && !flatGroups.length) return;
    for (const e of standing.values()) e.merged = false;
    if (merged) renderer?.destroyMesh?.(merged.gpu);
    for (const g of flatGroups) renderer?.destroyBillboardBatch?.(g.batch);
    merged = null;
    flatGroups = [];
  }
  function remerge() {
    mergeDue = false;
    unmerge();
    const o = origin?.() ?? [0, 0, 0];
    mergedAt = [o[0], o[1], o[2]];
    const into = [];
    /** @type {Map<string, any[]>} */
    const keyed = new Map();
    for (const e of standing.values()) {
      if (decorMergeable(e, o)) { into.push(e); continue; }
      const k = decorFlatMergeKey(e, o);
      if (k == null) continue;
      const g = keyed.get(k);
      if (g) g.push(e); else keyed.set(k, [e]);
    }
    if (into.length >= DECOR_MERGE_MIN && renderer?.createMesh) {
      const mesh = mergeDecorModels(into, o);
      if (mesh) {
        merged = { gpu: renderer.createMesh(mesh), matrix: decorMergeMatrix(o), box: localAabb(mesh.positions), wbox: null, n: into.length };
        for (const e of into) e.merged = true;
      }
    }
    if (!renderer?.createBillboardBatch) return;
    for (const members of keyed.values()) {
      if (members.length < 2) continue;
      const b0 = members[0].batch;
      const batch = renderer.createBillboardBatch(b0.archive, b0.record, b0.size, members.map((e) => [o[0] + e.piece.pos[0], o[1] + e.piece.pos[1], o[2] + e.piece.pos[2]]));
      if (b0.sway != null) batch.sway = b0.sway;
      if (b0.windfall != null) batch.windfall = b0.windfall;
      flatGroups.push({ batch, members });
      for (const e of members) e.merged = true;
    }
  }
  const figs = new Set();
  const models = new Map();
  const flats = new Map();
  const arts = new Map();
  // Resolved pictures let put() build a loaded piece in the same call, so a piece dragged every frame still draws.
  const flatsDone = new Map();
  const artsDone = new Map();
  const mwKeys = new Set();
  const mwAsk = typeof mwPicture === 'function'
    ? async (item) => { const pic = await mwPicture(item); if (pic?.key) mwKeys.add(pic.key); return pic; }
    : null;
  const borrowers = new Set();
  const stands = new Map();
  const standKeys = new Set();
  const standAsk = typeof mwPicture === 'function'
    ? async (item) => { const pic = await mwPicture(item); if (pic?.key) standKeys.add(pic.key); return pic; }
    : null;
  const standArtOf = (item) => {
    if (!standAsk || !item) return Promise.resolve(null);
    const k = `${item.t}.${item.g}.${item.m}.${item.v}.${item.a}`;
    if (!stands.has(k)) {
      const got = loadMwMountArt({ mwPicture: standAsk, renderer }, decorMountItem(item), MW_STAND_ARCHIVE);
      stands.set(k, got);
      got.then((art) => { if (!art && stands.get(k) === got) stands.delete(k); });
    }
    return stands.get(k);
  };
  const artKey = (piece) => { const it = piece.item ?? {}; return `${piece.flat[0]}.${piece.flat[1]}|${it.t}.${it.g}.${it.m}.${it.v}.${it.a}`; };
  const artOf = (piece) => {
    const k = artKey(piece);
    if (!arts.has(k)) {
      const got = loadMountPicture({ getTexture, uploadRecord, renderer, mwPicture: mwAsk }, piece.flat, piece.item);
      arts.set(k, got);
      got.then((art) => { if (!art) { if (arts.get(k) === got) arts.delete(k); } else if (arts.get(k) === got) artsDone.set(k, art); });
    }
    return arts.get(k);
  };

  function modelOf(id) {
    if (!models.has(id)) {
      const got = Promise.resolve(meshes?.getGpuMesh?.(id)).then((gpu) => {
        const cpu = meshes?.cpuModels?.get?.(id) ?? null;
        return { gpu: gpu ?? null, cpu, box: cpu?.positions ? localAabb(cpu.positions) : null };
      }).catch(() => ({ gpu: null, cpu: null, box: null }));
      models.set(id, got);
      got.then((m) => { if (!m.gpu && models.get(id) === got) models.delete(id); });
    }
    return models.get(id);
  }
  function flatOf(a, r) {
    const k = `${a}.${r}`;
    if (!flats.has(k)) {
      flats.set(k, Promise.resolve(getTexture?.(a)).then((t) => {
        if (!t || !(r < t.recordCount)) return null;
        uploadRecord?.(a, r);
        const { w, h } = billboardSize(t, r);
        return { t, w, h };
      }).catch(() => null).then((f) => { flatsDone.set(k, f); return f; }));
    }
    return flats.get(k);
  }

  function mountLight(entry, o, lift) {
    const { piece } = entry;
    const law = lampOf ? lampOf(piece, entry.size) : { light: piece.light, lift };
    if (!law?.light || law.lift == null) return;
    entry.light = {
      ...law.light,
      x: o[0] + piece.pos[0], y: o[1] + piece.pos[1] + law.lift, z: o[2] + piece.pos[2],
      range: law.light.range, intensity: law.light.intensity, color: [...law.light.color], decor: piece.id,
    };
    roomLights?.()?.push(entry.light);
  }
  function unmount(entry) {
    if (!entry) return;
    if (entry.merged) unmerge();
    if (entry.gpu || entry.batch) changed();
    figs.delete(entry);
    if (entry.door) { doors?.remove?.(entry.piece.id); entry.door = null; }
    late()?.remove(decorKeyOf(entry.piece.id));
    if (entry.mount) { renderer?.destroyDecalBatch?.(entry.mount.batch); entry.mount = null; }
    if (entry.batch) {
      entry.anims?.remove?.(entry.batch);
      renderer?.destroyBillboardBatch?.(entry.batch);
      entry.batch = null;
    }
    if (entry.release) { const r = entry.release; entry.release = null; r(); }
    const lights = roomLights?.();
    if (lights && entry.light) {
      const i = lights.indexOf(entry.light);
      if (i >= 0) lights.splice(i, 1);
    }
    entry.light = null;
  }

  function standOwn(entry) {
    const { piece } = entry;
    const live = () => standing.get(piece.id) === entry;
    const at = entry.o;
    const asked = standFlat ? standFlat(piece, at, live) : null;
    if (!asked) return false;
    Promise.resolve(asked).then((got) => {
      if (!got) return;
      if (!live()) { renderer?.destroyBillboardBatch?.(got.batch); got.release?.(); return; }
      // An answer that lands after a restand() is moved by the recenter it missed.
      const d = [entry.o[0] - at[0], entry.o[1] - at[1], entry.o[2] - at[2]];
      if (d[0] || d[1] || d[2]) { const b = got.batch.origin ?? [0, 0, 0]; got.batch.origin = [b[0] + d[0], b[1] + d[1], b[2] + d[2]]; }
      entry.batch = got.batch;
      entry.size = got.size;
      entry.release = got.release ?? null;
      changed();
    }, () => {});
    return true;
  }

  function put(piece) {
    unmount(standing.get(piece.id));
    const o = origin?.() ?? [0, 0, 0];
    const entry = { piece, o: [o[0], o[1], o[2]], gpu: null, box: null, cpu: null, matrix: decorMatrix(piece, o), batch: null, anims: null, size: null, light: null, mount: null, door: null };
    standing.set(piece.id, entry);
    if (decorIsFigure(piece)) figs.add(entry);
    if (decorIsMount(piece)) {
      const hang = (art) => {
        if (standing.get(piece.id) !== entry || !art || !renderer?.createDecalBatch) return;
        entry.size = { w: art.w * piece.scale, h: art.h * piece.scale };
        const quad = decorMountQuad(piece, o, entry.size);
        entry.mount = { batch: renderer.createDecalBatch(1), tex: art.tex, quad };
        renderer.writeDecalSlot?.(entry.mount.batch, 0, decorMountFloats(quad));
        mountLight(entry, o, 0);
      };
      const known = artsDone.get(artKey(piece));
      if (known) hang(known); else artOf(piece).then(hang);
    } else if (piece.model != null) {
      mountLight(entry, o, decorLightLift(piece, null));
      const stand = (wait = DECOR_MODEL_RETRY_MS) => modelOf(piece.model).then((m) => {
        if (standing.get(piece.id) !== entry) return;
        if (!m.gpu) { /** @type {any} */ (later(() => stand(Math.min(2 * wait, DECOR_LIST_RETRY_MAX_MS)), wait))?.unref?.(); return; }
        entry.box = m.box;
        if (decorIsDoor(piece) && doors && m.cpu?.positions && m.cpu?.indices) { entry.door = doors.add(piece, m, entry.matrix) ?? null; if (entry.door) return; }
        const solid = () => {
          entry.gpu = m.gpu;
          entry.mesh = m.cpu;
          changed();
          if (m.cpu?.positions && m.cpu?.indices) { entry.cpu = m.cpu; late()?.add(decorKeyOf(piece.id), m.cpu.positions, m.cpu.indices, entry.matrix, { body }); }
        };
        if (!prepareModel) { solid(); return; }
        Promise.resolve().then(() => prepareModel(m.gpu)).catch(() => {}).then(() => { if (standing.get(piece.id) === entry) solid(); });
      });
      stand();
    } else if (!standOwn(entry)) {
      const [a, r] = drawnFlat(piece.flat[0], piece.flat[1]);
      const ownPic = decorStandsOwn(piece) && !!standAsk;
      const stand = ([f, pic]) => {
        if (standing.get(piece.id) !== entry || !f || !renderer?.createBillboardBatch) return;
        const [da, dr, seen] = pic ? [MW_STAND_ARCHIVE, pic.key, pic] : [a, r, f];
        const k = decorDrawnScale(piece);
        entry.size = { w: seen.w * k, h: seen.h * k };
        // The renderer mirrors a flat by the sign of its drawn width; the size the eye's box reads stays positive.
        const drawn = decorFlatMirrored(piece) ? { w: -entry.size.w, h: entry.size.h } : entry.size;
        const at = entry.o;
        entry.batch = renderer.createBillboardBatch(da, dr, drawn, [[at[0] + piece.pos[0], at[1] + piece.pos[1], at[2] + piece.pos[2]]]);
        const anims = flatAnims?.() ?? null;
        if (!pic && armFlatAnim(entry.batch, f.t, a, r, anims, uploadRecordFrame ?? null)) entry.anims = anims;
        changed();
        mountLight(entry, at, decorLightLift(piece, entry.size));
      };
      const fk = `${a}.${r}`;
      if (!ownPic && flatsDone.has(fk)) stand([flatsDone.get(fk), null]);
      else Promise.all([flatOf(a, r), ownPic ? standArtOf(piece.item) : null]).then(stand);
    }
    return entry;
  }

  function remove(id) {
    const e = standing.get(id);
    unmount(e);
    standing.delete(id);
    return e?.piece ?? null;
  }

  function hold(id, on) {
    const e = standing.get(id);
    if (e) e.quiet = !!on;
  }

  // Moves every piece in place at once; putting them again would leave each model undrawn for a frame.
  function restand() {
    const o = origin?.() ?? [0, 0, 0];
    for (const e of [...standing.values()]) {
      const d = [o[0] - e.o[0], o[1] - e.o[1], o[2] - e.o[2]];
      if (!d[0] && !d[1] && !d[2]) continue;
      if (e.mount || e.door || decorIsMount(e.piece)) { put(e.piece); continue; }
      e.o = [o[0], o[1], o[2]];
      e.matrix = decorMatrix(e.piece, o);
      e.wbox = null;
      if (e.batch) { const b = e.batch.origin ?? [0, 0, 0]; e.batch.origin = [b[0] + d[0], b[1] + d[1], b[2] + d[2]]; }
      if (e.light) { e.light.x += d[0]; e.light.y += d[1]; e.light.z += d[2]; }
      // Replacing through the gate keeps a withheld bucket withheld; removeBucket on the collider would forget it.
      if (e.cpu) late()?.replace(decorKeyOf(e.piece.id), e.cpu.positions, e.cpu.indices, e.matrix);
    }
    if (merged) { merged.matrix = decorMergeMatrix(o); merged.wbox = null; }
    const d = [o[0] - mergedAt[0], o[1] - mergedAt[1], o[2] - mergedAt[2]];
    if (d[0] || d[1] || d[2]) for (const g of flatGroups) { const b = g.batch.origin ?? [0, 0, 0]; g.batch.origin = [b[0] + d[0], b[1] + d[1], b[2] + d[2]]; }
    mergedAt = [o[0], o[1], o[2]];
  }

  function set(pieces) {
    for (const e of standing.values()) unmount(e);
    standing.clear();
    for (const p of pieces ?? []) put(p);
  }

  function destroyAll() { set([]); held = new Map(); own = new Map(); kept = []; }

  function draw(r = renderer, texRemap = null, cull = null) {
    let n = 0;
    if (body) late()?.settle(body);
    if (mergeDue && merge && merge.now() - changedAt >= DECOR_MERGE_SETTLE_MS && merge.take()) remerge();
    if (merged) {
      const seen = cull ? cull(merged.wbox ??= transformedAabb(merged.box, merged.matrix)) : DECOR_DRAW;
      if (seen === DECOR_SHADOW) r?.recordShadowMesh?.(merged.gpu, merged.matrix, texRemap);
      else if (seen === DECOR_DRAW) { r?.drawMesh?.(merged.gpu, merged.matrix, texRemap); n += merged.n; }
    }
    for (const e of standing.values()) {
      if (e.quiet || !e.gpu || e.merged) continue;
      const seen = cull && e.box ? cull(e.wbox ??= transformedAabb(e.box, e.matrix)) : DECOR_DRAW;
      if (seen === DECOR_SKIP) continue;
      if (seen === DECOR_SHADOW) { r?.recordShadowMesh?.(e.gpu, e.matrix, texRemap); continue; }
      r?.drawMesh?.(e.gpu, e.matrix, texRemap); n++;
    }
    return n;
  }
  const batches = () => batchesSeen([]);
  const figOut = [];
  const figures = () => { figOut.length = 0; for (const e of figs) if (e.batch && !e.quiet) figOut.push(e); return figOut; };
  function batchesSeen(out, eye = null, minAngle = 0) {
    for (const g of flatGroups) {
      for (let i = 0; i < g.members.length; i++) if (entrySeen(g.members[i], eye, minAngle)) { out.push(g.batch); break; }
    }
    for (const e of standing.values()) {
      if (e.quiet || !e.batch || e.merged || !entrySeen(e, eye, minAngle)) continue;
      out.push(e.batch);
    }
    return out;
  }
  function drawMounts(r = renderer) {
    let n = 0;
    for (const e of standing.values()) if (!e.quiet && e.mount) { (r?.drawDecalPicture ?? r?.drawDecals)?.call(r, e.mount.batch, e.mount.tex); n++; }
    return n;
  }

  const lights = () => [...standing.values()].filter((e) => !e.quiet).map((e) => e.light).filter(Boolean);
  function pushLights(out, max = Infinity) {
    let n = 0;
    for (const e of standing.values()) {
      if (n >= max) break;
      if (e.quiet) continue;
      if (e.light) { out.push(e.light); n++; }
    }
    return n;
  }

  function targets() {
    const out = [];
    const o = origin?.() ?? [0, 0, 0];
    for (const e of standing.values()) {
      if (e.quiet) continue;
      const key = decorKeyOf(e.piece.id);
      if (e.door) continue;
      if (e.piece.model != null) {
        if (!e.box) continue;
        const b = transformedAabb(e.box, e.matrix);
        out.push({ key, aabb: { min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]] }, distance: RAY_DISTANCE, reach: DECOR_REACH, meshCollider: true });
      } else if (e.mount) {
        const cs = e.mount.quad.corners;
        const min = [0, 1, 2].map((i) => Math.min(...cs.map((c) => c[i])) - DECOR_MOUNT_LIFT);
        const max = [0, 1, 2].map((i) => Math.max(...cs.map((c) => c[i])) + DECOR_MOUNT_LIFT);
        out.push({ key, aabb: { min, max }, distance: RAY_DISTANCE, reach: DECOR_REACH, noSurface: true });
      } else if (e.size) {
        const p = [o[0] + e.piece.pos[0], o[1] + e.piece.pos[1], o[2] + e.piece.pos[2]];
        const hw = e.size.w / 2;
        out.push({ key, aabb: { min: [p[0] - hw, p[1], p[2] - hw], max: [p[0] + hw, p[1] + e.size.h, p[2] + hw] }, distance: RAY_DISTANCE, reach: DECOR_REACH, noSurface: true });
      }
    }
    return out;
  }

  /** @type {Map<string, any[]>} */
  let held = new Map();
  function itemsOf(id) {
    let list = held.get(id);
    if (!list) { list = []; held.set(id, list); }
    return list;
  }
  const holdsAny = (id) => (held.get(id)?.length ?? 0) > 0;
  function itemsSnapshot() {
    const out = {};
    for (const [id, list] of held) if (list.length) out[id] = list.map((it) => ({ ...it }));
    return out;
  }
  function takeUnserved(served) {
    const standing = new Set((served ?? []).map((p) => p?.id).filter((id) => typeof id === 'string'));
    const out = [];
    for (const [id, list] of [...held]) {
      if (standing.has(id) || !list.length) continue;
      held.delete(id);
      out.push(...list);
    }
    return out;
  }
  function setItems(record) {
    held = new Map();
    if (!record || typeof record !== 'object') return;
    for (const [id, list] of Object.entries(record)) if (Array.isArray(list)) held.set(id, list.map((it) => ({ ...it })));
  }

  /** @type {Map<string, any>} */
  let own = new Map();
  const ownOf = (id) => own.get(id) ?? null;
  function keepOwn(id, item) { if (item) own.set(id, item); }
  function takeOwn(id) {
    const item = own.get(id) ?? null;
    own.delete(id);
    return item;
  }
  function ownSnapshot() {
    const out = {};
    for (const [id, item] of own) out[id] = { ...item };
    return out;
  }
  function setOwn(record) {
    own = new Map();
    if (!record || typeof record !== 'object') return;
    for (const [id, item] of Object.entries(record)) if (item && typeof item === 'object') own.set(id, { ...item });
  }
  const ownIds = () => [...own.keys()];

  // An online home can sit over an offline house in the same save. The offline pieces are kept untouched and
  // written back as they came, so a visit never wipes them.
  let kept = [];
  const keep = (pieces) => { kept = [...(pieces ?? [])]; };
  // Before a wagon's Confirm, the save and the relay read the last saved list while the moved pieces stay placed.
  let savedList = null;
  const live = () => [...standing.values()].map((e) => e.piece);
  const showSaved = (fn) => { savedList = typeof fn === 'function' ? fn : null; };

  const pieceOf = (id) => standing.get(id)?.piece ?? null;
  const list = () => (savedList ? savedList() : live());
  function hearths() {
    const out = [];
    const o = origin?.() ?? [0, 0, 0];
    for (const e of standing.values()) {
      if (!decorHearth(e.piece)) continue;
      if (e.piece.model != null) {
        if (!e.box || !e.matrix) continue;
        const b = transformedAabb(e.box, e.matrix);
        out.push({ x: (b[0] + b[3]) / 2, y: (b[1] + b[4]) / 2, z: (b[2] + b[5]) / 2 });
      } else if (e.size) {
        const p = [o[0] + e.piece.pos[0], o[1] + e.piece.pos[1], o[2] + e.piece.pos[2]];
        out.push({ x: p[0], y: p[1] + e.size.h / 2, z: p[2] });
      }
    }
    return out;
  }

  function refreshMounts() {
    const was = [...mwKeys];
    const wasStand = [...standKeys];
    mwKeys.clear();
    standKeys.clear();
    arts.clear();
    artsDone.clear();
    stands.clear();
    for (const e of [...standing.values()]) if (decorIsMount(e.piece) || decorStandsOwn(e.piece)) put(e.piece);
    for (const k of was) renderer?.releaseTexture?.('mw-mount', k);
    for (const k of wasStand) renderer?.releaseTexture?.(MW_STAND_ARCHIVE, k);
    for (const fn of [...borrowers]) fn();
  }

  const mountPicture = (flat, item) => artOf({ flat, item });
  const standPicture = (item) => standArtOf(item);
  function onRefresh(fn) {
    borrowers.add(fn);
    return () => borrowers.delete(fn);
  }

  return {
    put, remove, hold, set, restand, destroyAll, draw, batches, batchesSeen, figures, drawMounts, lights, pushLights, targets, pieceOf, list, live, showSaved, hearths, size: () => standing.size,
    itemsOf, holdsAny, itemsSnapshot, setItems, takeUnserved, keep, kept: () => kept,
    ownOf, keepOwn, takeOwn, ownSnapshot, setOwn, ownIds, refreshMounts, mountPicture, standPicture, onRefresh,
  };
}

/**
 * @param {any[]} figs
 * @param {{ offer: Function }} lane
 * @param {boolean} on
 * @param {{ flats?: any, race?: any } | null} ctx
 * @param {number[]} eye
 * @param {number} dt
 * @returns {number}
 */
export function offerDecorFigures(figs, lane, on, ctx, eye, dt) {
  let n = 0;
  for (const e of figs) {
    const look = on ? figureLook(e, ctx) : null;
    if (!look) { e.batch.castOnly = false; continue; }
    const f = e._mwFeet ??= [0, 0, 0];
    f[0] = e.o[0] + e.piece.pos[0]; f[1] = e.o[1] + e.piece.pos[1]; f[2] = e.o[2] + e.piece.pos[2];
    lane.offer(personActor(e, look, f, eye, dt), e.batch);
    n++;
  }
  return n;
}

export const DECOR_LIST_RETRY_MS = 2_000;
export const DECOR_LIST_RETRY_MAX_MS = 30_000;

let decorAhead = null;
export const decorListKey = (mapId, buildingKey, seat) => `${mapId >>> 0}:${buildingKey >>> 0}:${seat ? 1 : 0}`;
export function primeDecorList(key, ask) {
  if (key == null || typeof ask !== 'function') return;
  const p = Promise.resolve().then(ask);
  p.catch(() => {});
  decorAhead = { key, p };
}
export function primedDecorList(key) {
  if (!decorAhead || decorAhead.key !== key) return null;
  const p = decorAhead.p;
  decorAhead = null;
  return p;
}

// Only an answer that holds pieces places the room. On a refusal or no answer, a first removal would write an empty
// list over the service's, so the list is asked again with a doubling wait.
/**
 * @param {{ ask: () => any, live: () => boolean, stand: (r: any) => void, later?: (f: () => void, ms: number) => any, wait?: number }} _spec
 */
export function askDecorList({ ask, live, stand, later = setTimeout, wait = DECOR_LIST_RETRY_MS }) {
  const again = () => {
    if (live()) later(() => { if (live()) askDecorList({ ask, live, stand, later, wait: Math.min(2 * wait, DECOR_LIST_RETRY_MAX_MS) }); }, wait)?.unref?.();
  };
  return Promise.resolve().then(ask).then((r) => {
    if (!live()) return;
    if (r?.ok && Array.isArray(r.data?.pieces)) stand(r); else again();
  }).catch(again);
}
