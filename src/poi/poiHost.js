// @ts-check

import { decodePoiMeshSteps } from './poiMesh.js';
import { POI_SHA_RE } from './poiLaw.js';
import {
  POI_TEXTURE_ARCHIVE, materialLook, samplerOf, emits, createTextureBook, bakeAlbedoSteps, bakeEmissionSteps, poiPartModelSteps,
  placeMatrix, partMatrix, boxThrough, lightsOf, npcsOf,
} from './poiRuntime.js';
import { createPoiNpcs } from './poiNpcs.js';
import { createPoiFlats } from './poiFlats.js';
import { samplerKey } from '../render/meshAlpha.js';
import { drawSeen, DECOR_DRAW } from '../homes/decorRoom.js';
import { invert4 } from '../player/tapRay.js';

export const POI_GROUND_EVERY = 30;
export const POI_RETRY_MS = 60_000;
export const POI_STAND_BUDGET_MS = 4;
export const POI_Y_EPS = 1e-4;
export const POI_DECODED_KEEP_BYTES = 32 * 1024 * 1024;
const FLICKER_HZ = 12, FLICKER_DEPTH = 0.25;

const ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const NO_SHADOW = Object.freeze({ noShadow: true }), TRANSLUCENT = Object.freeze({ translucent: 1 });
const mirrors = (s) => s[0] * s[1] * s[2] < 0;

export function rayBox(o, d, b, max) {
  let lo = 0, hi = max;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < b[a] || o[a] > b[a + 3]) return false; continue; }
    let t0 = (b[a] - o[a]) / d[a], t1 = (b[a + 3] - o[a]) / d[a];
    if (t0 > t1) { const k = t0; t0 = t1; t1 = k; }
    lo = Math.max(lo, t0); hi = Math.min(hi, t1);
    if (lo > hi) return false;
  }
  return true;
}
export function rayTriangles(o, d, pos, idx, max) {
  let best = null;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = o[0] - pos[a], ty = o[1] - pos[a + 1], tz = o[2] - pos[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 1e-6 && t < (best ?? max)) best = t;
  }
  return best;
}
/** @param {any} part */
export function poiPartUnloadable(part) {
  if (part?.arch3d !== undefined) return 'a Daggerfall model (not stood by the game yet)';
  if (typeof part?.mesh !== 'string' || !POI_SHA_RE.test(part.mesh)) return 'no uploaded model';
  if (!Array.isArray(part.materials)) return 'no materials';
  return '';
}
/** @param {any} e */
const unreadable = (e) => { const err = e instanceof Error ? e : new Error(String(e)); /** @type {any} */ (err).poiUnreadable = true; return err; };
/**
 * @param {any} e
 * @returns {'unreadable' | 'missing' | 'retry'}
 */
export function poiLoadFailure(e) {
  if (e?.poiUnreadable) return 'unreadable';
  const status = /: (\d{3})$/.exec(String(e?.message ?? ''));
  return status && (status[1] === '404' || status[1] === '410') ? 'missing' : 'retry';
}
const xformPoint = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const xformDir = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
const _inv = new Float32Array(16);

export function sameBuild(a, b) {
  const build = (d) => JSON.stringify(d.parts.map((p) => [p.key, p.mesh, p.materials, p.collide, p.shadow]));
  return a.parts.length === b.parts.length && build(a) === build(b);
}
export function sameStand(a, b) {
  const at = (d) => JSON.stringify([d.place, d.parts.map((p) => [p.t, p.r, p.s]), d.lights ?? []]);
  return at(a) === at(b);
}

/** @param {{
 *   renderer: any, feed: any,
 *   decodeImage: (bytes: Uint8Array) => any,
 *   pixels: () => Iterable<{ px: number, py: number }>,
 *   translation: (px: number, py: number, out?: number[]) => number[],
 *   groundAt: (x: number, z: number) => number,
 *   collider?: () => any, riding?: (px: number, py: number) => any,
 *   feet?: () => (number[] | null), auth?: () => (string | null), collideDrafts?: () => boolean,
 *   now?: () => number, clock?: () => number, keepDecodedBytes?: number, log?: any, dmTest?: ((id: string) => any) |
 * null, dmHeld?: () => boolean, uploadRecord?: any, flatAnims?: ((px: number, py: number) => any) | null, getTexture?: any, uploadRecordFrame?: any, say?: any, dm?: any, }} deps */
export function createPoiHost({
  renderer, feed, decodeImage, pixels, translation, groundAt, collider = () => null, riding = () => null, collideDrafts = () => true,
  feet = () => null, auth = () => null, now = () => Date.now(), clock = () => performance.now(), keepDecodedBytes = POI_DECODED_KEEP_BYTES, log = console,
  getTexture = null, uploadRecordFrame = null, say = null,
  uploadRecord = null, flatAnims = null,
  dm = null,
  dmTest = null,
  dmHeld = () => false,
}) {
  const npcs = createPoiNpcs({ renderer, getTexture, uploadRecordFrame, asset: (sha, o) => feed.asset(sha, o), auth, say, feet, groundAt, talk: (id, key) => (dmTest?.(id) ?? (dmHeld() ? null : dmRt))?.talk(id, key) ?? false });
  const flats = createPoiFlats({ renderer, getTexture, uploadRecord, uploadRecordFrame, flatAnims, now });
  let dmRt = null, dmAsked = false, wasHeld = false;
  const dmContent = (doc) => doc?.v === 2 && (['events', 'dialogues', 'trades', 'routes', 'encounters', 'interactives'].some((k) => doc[k]?.length) || doc.npcs?.some((n) => n?.showWhen));
  function dmOf(s) {
    if (s.draft) return dmContent(s.doc) ? dmTest?.(s.id) ?? null : null;
    if (!dm || dmHeld() || !dmContent(s.doc)) return null;
    if (!dmRt && !dmAsked) { dmAsked = true; dm().then((rt) => { dmRt = rt; }, (e) => { if (log) console.warn('[poi] the DM runtime', e?.message ?? e); }); }
    return dmRt;
  }
  const standing = new Map();
  const stood = [];
  const want = new Map();
  const book = createTextureBook();
  const recordOf = (m) => book.recordOf(materialLook(m));
  const looks = new Map();
  const decoded = new Map();
  let decodedBytes = 0;
  let frameN = 0;
  const skipsSaid = new Set();

  const work = [];
  let until = 0, units = 0;
  function turn() {
    if (units > 0 && clock() >= until) return false;
    units++;
    return true;
  }
  function spawn(it) {
    const job = { it, value: undefined, threw: false, over: false, resolve: null, reject: null, promise: null };
    job.promise = new Promise((res, rej) => { job.resolve = res; job.reject = rej; });
    job.promise.catch(() => {});
    work.push(job);
    return job;
  }
  function cancel(job) {
    if (!job || job.over) return;
    job.over = true;
    const i = work.indexOf(job);
    if (i >= 0) work.splice(i, 1);
    try { job.it.return(undefined); } catch (e) { if (log) console.warn('[poi] a job would not stop', e?.message ?? e); }
  }
  function wake(job, threw) {
    return (v) => { if (job.over) return; job.value = v; job.threw = threw; work.push(job); };
  }
  function stepWork() {
    while (work.length && turn()) {
      const job = work[0];
      let r;
      try { r = job.threw ? job.it.throw(job.value) : job.it.next(job.value); } catch (e) {
        if (job.over) continue;
        job.over = true; work.shift(); job.reject(e); continue;
      }
      if (job.over) continue;
      job.value = undefined; job.threw = false;
      if (r.done) { job.over = true; work.shift(); job.resolve(r.value); continue; }
      const v = r.value;
      if (v && typeof v.then === 'function') { work.shift(); v.then(wake(job, false), wake(job, true)); }
    }
  }

  function decode(sha) {
    const kept = decoded.get(sha);
    if (kept) return kept.ready;
    const entry = { ready: spawn(decodeSteps(sha)).promise, bytes: 0 };
    decoded.set(sha, entry);
    entry.ready.then((img) => {
      if (decoded.get(sha) !== entry) return;
      entry.bytes = img?.data?.byteLength ?? 0;
      decodedBytes += entry.bytes;
      for (const [k, e] of decoded) {
        if (decodedBytes <= keepDecodedBytes) break;
        decoded.delete(k);
        decodedBytes -= e.bytes;
      }
    }, () => { if (decoded.get(sha) === entry) decoded.delete(sha); });
    return entry.ready;
  }
  function* decodeSteps(sha) {
    const bytes = yield feed.asset(sha, { auth: auth() });
    try {
      const r = decodeImage(bytes);
      if (r && typeof r.next === 'function') return yield* r;
      return r && typeof r.then === 'function' ? yield r : r;
    } catch (e) { throw unreadable(e); }
  }

  function holdLook(m) {
    const look = materialLook(m);
    let l = looks.get(look);
    if (l) { l.refs++; return l; }
    const record = book.recordOf(look);
    l = { look, record, sampler: samplerOf(m), refs: 1, emits: emits(m), ready: null, job: null };
    l.job = spawn(lookSteps(l, m));
    l.ready = l.job.promise;
    looks.set(look, l);
    return l;
  }
  function* lookSteps(l, m) {
    try {
      const image = m.texture ? yield decode(m.texture) : null;
      const albedo = yield* bakeAlbedoSteps(image, m);
      const glowImage = l.emits && m.emissive ? yield decode(m.emissive) : null;
      const glow = l.emits ? yield* bakeEmissionSteps(glowImage, m, albedo) : null;
      yield null;
      renderer.uploadTexture?.(POI_TEXTURE_ARCHIVE, l.record, albedo, { sampler: l.sampler, cutout: m.alpha === 'cutout' });
      if (glow) renderer.uploadEmissionTexture?.(POI_TEXTURE_ARCHIVE, l.record, glow, { white: true, sampler: l.sampler });
    } catch (e) {
      if (looks.get(l.look) === l) looks.delete(l.look);
      throw e;
    }
  }
  function dropLook(l) {
    if (--l.refs > 0) return;
    cancel(l.job);
    if (looks.get(l.look) !== l) return;
    looks.delete(l.look);
    renderer.releaseTexture?.(POI_TEXTURE_ARCHIVE, l.record);
    if (l.emits) renderer.evictEmissionTexture?.(`${POI_TEXTURE_ARCHIVE}_${l.record}${samplerKey(l.sampler)}`);
  }

  function* modelSteps(mesh, materials, scale) {
    const models = yield* poiPartModelSteps(mesh, materials, recordOf, { scale });
    yield null;
    return {
      opaque: models.opaque ? renderer.createMesh(models.opaque) : null,
      translucent: models.translucent ? renderer.createMesh(models.translucent) : null,
    };
  }

  function skipPart(s, part, why) {
    const said = `${s.id} r${s.rev} ${part.key}`;
    if (skipsSaid.has(said)) return;
    skipsSaid.add(said);
    if (log) console.warn(`[poi] ${s.id} r${s.rev} stands without part ${part.key}`, why);
  }

  function* partSteps(s, i) {
    const part = s.doc.parts[i];
    const held = [];
    let d;
    try {
      const bytes = yield feed.asset(part.mesh, { auth: auth() });
      try { d = yield* decodePoiMeshSteps(bytes); } catch (e) { throw unreadable(e); }
      if ('error' in d) throw unreadable(new Error(`part ${part.key}: ${d.error}`));
      for (const m of part.materials) { const l = holdLook(m); held.push(l); s.held.push(l); }
      yield Promise.all(held.map((l) => l.ready));
    } catch (e) {
      for (const l of held) { dropLook(l); s.held.splice(s.held.indexOf(l), 1); }
      throw e;
    }
    const remap = new Map();
    for (const m of part.materials) {
      const rec = recordOf(m);
      remap.set(`${POI_TEXTURE_ARCHIVE}_${rec}`, `${POI_TEXTURE_ARCHIVE}_${rec}${samplerKey(samplerOf(m))}`);
    }
    const scale = part.s.slice();
    const models = yield* modelSteps(d.mesh, part.materials, scale);
    return {
      index: i, key: part.key, part, remap, mesh: d.mesh, opaque: models.opaque, translucent: models.translucent,
      baked: scale, wound: true, remodel: null,
      positions: d.mesh.positions, indices: d.mesh.indices, min: d.mesh.boundsMin, max: d.mesh.boundsMax,
      collide: part.collide === 'mesh', shadow: part.shadow, local: null, localBox: null, scene: new Float32Array(16), drawn: new Float32Array(16), box: null,
      bucket: `poi:${s.id}:${i}`, stood: false, carry: false,
    };
  }

  function* loadSteps(s) {
    const parts = [];
    let made = false;
    try {
      for (let i = 0; i < s.doc.parts.length; i++) {
        const part = s.doc.parts[i];
        const without = poiPartUnloadable(part);
        if (without) { skipPart(s, part, without); continue; }
        try { parts.push(yield* partSteps(s, i)); } catch (e) {
          const how = poiLoadFailure(e);
          if (how === 'retry') throw e;
          skipPart(s, part, e?.message ?? e);
          s.skipped.push(i);
          if (how === 'missing') s.missing.push(i);
        }
      }
      s.parts = parts;
      s.missingAt = now();
      s.status = 'ready';
      made = true;
    } catch (e) {
      s.status = 'failed';
      s.failedAt = now();
      if (log) console.warn(`[poi] ${s.id} r${s.rev} would not stand`, e?.message ?? e);
    } finally {
      if (!made) for (const p of parts) freePart(p);
      s.job = null;
    }
  }
  function* missingSteps(s) {
    const got = [];
    const asked = s.missing;
    s.missing = [];
    s.missingAt = now();
    try {
      const still = [];
      for (const i of asked) {
        try { got.push(yield* partSteps(s, i)); } catch (e) { if (poiLoadFailure(e) !== 'unreadable') still.push(i); }
      }
      const joined = new Set(got.map((p) => p.index));
      s.missing = [...new Set([...still, ...s.missing])].filter((i) => !joined.has(i));
      s.skipped = s.skipped.filter((i) => !joined.has(i));
      if (s.missingAt !== -Infinity) s.missingAt = now();
      s.joining.push(...got);
      got.length = 0;
    } finally {
      for (const p of got) freePart(p);
      s.partJob = null;
    }
  }

  function* remodelSteps(p) {
    const scale = p.part.s.slice();
    let made = null;
    try {
      made = yield* modelSteps(p.mesh, p.part.materials, scale);
      freePart(p);
      p.opaque = made.opaque; p.translucent = made.translucent; p.baked = scale;
      made = null;
      drawnOf(p);
    } finally {
      if (made) freePart(made);
      p.remodel = null;
    }
  }

  function freePart(p) {
    if (p.opaque) renderer.destroyMesh?.(p.opaque);
    if (p.translucent) renderer.destroyMesh?.(p.translucent);
    p.opaque = p.translucent = null;
  }
  function unstand(s) {
    const col = collider(), f = feet();
    for (const p of s.parts) if (p.stood) { p.carry = inside(p.localBox, f, s.t); col?.removeBucket?.(p.bucket); p.stood = false; }
  }
  function takeDown(s) {
    s.gone = true;
    cancel(s.job);
    const col = collider();
    cancel(s.partJob);
    for (const p of s.parts) { cancel(p.remodel); if (p.stood) col?.removeBucket?.(p.bucket); freePart(p); }
    for (const p of s.joining) freePart(p);
    s.joining = [];
    for (const l of s.held) dropLook(l);
    s.parts = []; s.held = [];
    npcs.drop(s.id);
    flats.drop(s.id);
    npcs.setExtras(s.id, null); dmRt?.drop(s.id);
    if (s.draft) dmTest?.(s.id)?.drop(s.id);
    standing.delete(s.id);
    const i = stood.indexOf(s);
    if (i >= 0) stood.splice(i, 1);
  }

  function stand(e) {
    const s = { id: e.id, rev: e.rev, doc: e.doc, draft: !!e.draft, px: e.doc.place.px, py: e.doc.place.py, status: 'loading', failedAt: 0, gone: false,
      parts: [], held: [], skipped: [], missing: [], missingAt: 0, partJob: null, joining: [], y: NaN, groundRead: [NaN, NaN, -Infinity, NaN], t: [0, 0, 0], place: null, lights: [], rows: [], job: null, visible: false };
    standing.set(e.id, s);
    stood.push(s);
    s.job = spawn(loadSteps(s));
    return s;
  }

  function heightOf(s, t) {
    const pl = s.doc.place;
    if (pl.ground === 'absolute') return pl.y;
    const x = t[0] + pl.x, z = t[2] + pl.z;
    const g = s.groundRead;
    if (x !== g[0] || z !== g[1] || t[1] !== g[3] || !Number.isFinite(s.ground) || frameN - g[2] >= POI_GROUND_EVERY) {
      s.ground = groundAt(x, z);
      g[0] = x; g[1] = z; g[2] = frameN; g[3] = t[1];
    }
    return Number.isFinite(s.ground) ? s.ground - t[1] + pl.y : NaN;
  }

  function drawnOf(p) {
    const d = p.drawn, sk = p.baked;
    d.set(p.scene);
    for (let c = 0; c < 3; c++) { const k = 1 / sk[c]; d[c * 4] *= k; d[c * 4 + 1] *= k; d[c * 4 + 2] *= k; }
    p.wound = mirrors(p.part.s) === mirrors(sk);
  }

  const inside = (b, f, t) => !!f && !!b && f[0] > b[0] + t[0] - 0.5 && f[0] < b[3] + t[0] + 0.5 && f[2] > b[2] + t[2] - 0.5 && f[2] < b[5] + t[2] + 0.5 && f[1] + 1.8 > b[1] + t[1] && f[1] < b[4] + t[1];

  function placeLocal(s, p) {
    p.local = partMatrix(s.place, p.part);
    const b = boxThrough(p.local, p.min, p.max);
    const lb = p.localBox ??= [0, 0, 0, 0, 0, 0];
    lb[0] = b.min[0]; lb[1] = b.min[1]; lb[2] = b.min[2]; lb[3] = b.max[0]; lb[4] = b.max[1]; lb[5] = b.max[2];
  }

  function place(s) {
    const t = translation(s.px, s.py, s.t);
    const y = heightOf(s, t);
    if (!Number.isFinite(y)) { s.visible = false; return; }
    const col = collider();
    const f = feet();
    if (!s.place || !(Math.abs(y - s.y) <= POI_Y_EPS)) {
      s.y = y;
      s.place = placeMatrix(s.doc.place, y);
      s.lights = lightsOf(s.doc, s.place);
      s.npcs = null;
      s.rows = s.lights.map((l) => ({ x: 0, y: 0, z: 0, range: 0, color: new Float32Array(l.color) }));
      for (const p of s.parts) {
        if (p.stood) { p.carry = inside(p.localBox, f, t); col?.removeBucket?.(p.bucket); p.stood = false; }
        placeLocal(s, p);
      }
    }
    if (s.joining.length) {
      for (const p of s.joining) { p.part = s.doc.parts[p.index]; placeLocal(s, p); }
      s.parts = [...s.parts, ...s.joining].sort((a, b) => a.index - b.index);
      s.joining = [];
    }
    s.visible = true;
    flats.sync(s, t);
    const rt = dmOf(s);
    const people = s.doc.npcs?.length ? (s.npcs ??= npcsOf(s.doc, s.place)) : null;
    const shown = rt ? rt.frame(s, t, people) : people;
    npcs.setExtras(s.id, rt ? rt.extras(s.id) : null);
    const off = rt?.off?.(s.id) ?? null;
    if (shown?.length || people?.length) { npcs.sync(s.id, shown ?? [], t); s.hadNpcs = true; }
    else if (s.hadNpcs) { npcs.drop(s.id); s.hadNpcs = false; }
    const parts = s.parts;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.off = !!off?.size && off.has(p.part.key);
      if (p.off && p.stood) { col?.removeBucket?.(p.bucket); p.stood = false; }
      p.scene.set(p.local);
      p.scene[12] += t[0]; p.scene[13] += t[1]; p.scene[14] += t[2];
      drawnOf(p);
      const sk = p.baked;
      const lb = p.localBox, bx = p.box ??= [0, 0, 0, 0, 0, 0];
      bx[0] = lb[0] + t[0]; bx[1] = lb[1] + t[1]; bx[2] = lb[2] + t[2]; bx[3] = lb[3] + t[0]; bx[4] = lb[4] + t[1]; bx[5] = lb[5] + t[2];
      if (p.collide && !p.stood && !p.off && col?.addMesh && (p.carry || !inside(p.localBox, f, t)) && (!s.draft || collideDrafts())) {
        if (p.carry || turn()) {
          col.addMesh(p.bucket, p.positions, p.indices, p.local, riding(s.px, s.py));
          p.stood = true; p.carry = false;
        }
      }
      if (!p.remodel && (p.part.s[0] !== sk[0] || p.part.s[1] !== sk[1] || p.part.s[2] !== sk[2]) && (collideDrafts() || !s.draft)) p.remodel = spawn(remodelSteps(p));
    }
  }

  function standWanted(e, id) {
    let s = standing.get(id);
    if (!s) s = stand(e);
    if (s.status === 'failed' && now() - s.failedAt >= POI_RETRY_MS) { takeDown(s); s = stand(e); }
    if (s.status === 'ready') {
      if (s.missing.length && !s.partJob && now() - s.missingAt >= POI_RETRY_MS) s.partJob = spawn(missingSteps(s));
      place(s);
    }
  }

  const _far = [];

  return {
    frame() {
      frameN++;
      until = clock() + POI_STAND_BUDGET_MS; units = 0;
      flats.frame();
      feed.tick?.();
      want.clear();
      for (const px of pixels()) {
        const at = feed.atPixel(px.px, px.py);
        for (let i = 0; i < at.length; i++) want.set(at[i].id, at[i]);
      }
      for (let k = stood.length - 1; k >= 0; k--) {
        const s = stood[k];
        const e = want.get(s.id);
        if (!e || !!e.draft !== s.draft) { takeDown(s); continue; }
        if (e.doc === s.doc) continue;
        if (s.status === 'ready' && sameBuild(s.doc, e.doc)) {
          if (!sameStand(s.doc, e.doc)) s.place = null;
          if (e.rev !== s.rev && s.skipped.length) { s.missing = [...s.skipped]; s.missingAt = -Infinity; }
          s.doc = e.doc; s.rev = e.rev; s.npcs = null;
          for (let i = 0; i < s.parts.length; i++) s.parts[i].part = e.doc.parts[s.parts[i].index];
          if (e.doc.place.px !== s.px || e.doc.place.py !== s.py) { unstand(s); s.px = e.doc.place.px; s.py = e.doc.place.py; s.ground = NaN; s.place = null; }
        } else takeDown(s);
      }
      const held = dmHeld();
      if (held && !wasHeld) dmRt?.close?.();
      wasHeld = held;
      if (!held) dmRt?.tick?.();
      want.forEach(standWanted);
      stepWork();
      npcs.frame();
    },
    npcs,
    draw(r, cull = null) {
      for (let k = 0; k < stood.length; k++) {
        const s = stood[k];
        if (s.status !== 'ready' || !s.visible) continue;
        for (let i = 0; i < s.parts.length; i++) {
          const p = s.parts[i];
          if (p.opaque && p.wound && !p.off) drawSeen(r, cull, p.box, p.opaque, p.drawn, p.remap, p.shadow ? undefined : NO_SHADOW);
        }
      }
    },
    drawTranslucent(r, eye = null, cull = null) {
      let n = 0;
      for (let k = 0; k < stood.length; k++) {
        const s = stood[k];
        if (s.status !== 'ready' || !s.visible) continue;
        for (let i = 0; i < s.parts.length; i++) {
          const p = s.parts[i];
          if (!p.translucent || !p.wound || p.off || (cull && cull(p.box) !== DECOR_DRAW)) continue;
          const b = p.box, e = _far[n] ?? (_far[n] = { p: null, d: 0 });
          n++;
          e.p = p;
          e.d = eye ? ((b[0] + b[3]) / 2 - eye[0]) ** 2 + ((b[1] + b[4]) / 2 - eye[1]) ** 2 + ((b[2] + b[5]) / 2 - eye[2]) ** 2 : 0;
        }
      }
      for (let i = 1; i < n; i++) {
        const e = _far[i];
        let j = i - 1;
        while (j >= 0 && _far[j].d < e.d) { _far[j + 1] = _far[j]; j--; }
        _far[j + 1] = e;
      }
      for (let i = 0; i < n; i++) { const p = _far[i].p; _far[i].p = null; r.drawMesh(p.translucent, p.drawn, p.remap, TRANSLUCENT); }
    },
    lights(out = []) {
      const tick = Math.floor(now() / (1000 / FLICKER_HZ));
      for (let k = 0; k < stood.length; k++) {
        const s = stood[k];
        if (s.status !== 'ready' || !s.visible) continue;
        for (let i = 0; i < s.lights.length; i++) {
          const l = s.lights[i], row = s.rows[i];
          const f = l.flicker ? 1 - FLICKER_DEPTH * (((Math.imul(tick + i * 7919, 2654435761) >>> 0) % 1000) / 1000) : 1;
          row.x = l.at[0] + s.t[0]; row.y = l.at[1] + s.t[1]; row.z = l.at[2] + s.t[2]; row.range = l.range * f;
          out.push(row);
        }
      }
      flats.lights(out);
      return out;
    },
    batches: () => flats.batches(),
    drawMounts: (r) => flats.drawMounts(r),
    marks() {
      const out = [];
      for (const e of feed.all?.() ?? []) {
        const m = e.doc.marker;
        if (m?.show) out.push({ px: e.doc.place.px, py: e.doc.place.py, label: m.label || e.doc.name, id: e.id, draft: !!e.draft });
      }
      return out;
    },
    standing() { return [...standing.values()].map((s) => ({ id: s.id, rev: s.rev, status: s.status, visible: !!s.visible, draft: s.draft, parts: s.parts.length })); },
    pick(o, d, max = 6000, skip = null) {
      let best = null;
      for (const s of standing.values()) {
        if (s.status !== 'ready' || !s.visible) continue;
        for (const p of s.parts) {
          if (!p.box || !rayBox(o, d, p.box, best ? best.dist : max)) continue;
          if (skip?.(s.id, p.key)) continue;
          const inv = invert4(p.scene, _inv);
          if (!inv) continue;
          const lo = xformPoint(inv, o), ld = xformDir(inv, d);
          const t = rayTriangles(lo, ld, p.positions, p.indices, best ? best.dist : max);
          if (t !== null) best = { id: s.id, key: p.key, dist: t, draft: s.draft };
        }
      }
      const f = flats.pick(o, d, best ? best.dist : max, skip);
      if (f) best = { ...f, draft: !!standing.get(f.id)?.draft };
      return best;
    },
    partOf(id, key) { const s = standing.get(id); const p = s?.parts.find((x) => x.key === key); return p ? { scene: p.scene, box: p.box, local: p.local, min: p.min, max: p.max } : null; },
    flatBox: (id, key) => flats.boxOf(id, key),
    destroyAll() { for (const s of [...standing.values()]) takeDown(s); },
    standDown() {
      const col = collider();
      flats.hideAll();
      dmRt?.close?.();
      for (const s of stood) {
        if (s.draft) dmTest?.(s.id)?.close?.();
        s.visible = false;
        for (const p of s.parts) if (p.stood) { col?.removeBucket?.(p.bucket); p.stood = false; p.carry = false; }
      }
    },
    _identity: ID,
  };
}
