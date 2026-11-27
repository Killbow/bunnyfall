// @ts-check
// The POI document rules. The editor, the account service, and the game all check a document against it.

import { POI_V2_LIMITS, POI_V2_PART_KEYS, POI_V2_LIGHT_KEYS, POI_V2_NPC_KEYS, POI_V2_DOC_KEYS, poiV2Problems, poiArch3dOk } from './poiLawV2.js';

export const POI_DOC_VERSION = 2;
export const POI_SHELF_VERSION = 1;
export const POI_DOC_VERSIONS = Object.freeze([1, 2]);
export const poiDocBytesOf = (/** @type {number} */ v) => (v === 2 ? POI_V2_LIMITS.docBytes : POI_LIMITS.docBytes);
export const POI_PIXEL_M = 819.2;
export const POI_ID_RE = /^poi-[0-9a-f]{12}$/;
export const POI_SHELF_ID_RE = /^lib-[0-9a-f]{12}$/;
export const POI_SHA_RE = /^[0-9a-f]{64}$/;
export const POI_PART_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export const POI_LIMITS = Object.freeze({
  name: 64,
  about: 2000,
  tags: 8,
  tag: 24,
  parts: 128,
  lights: 32,
  materials: 64,
  label: 48,
  npcs: 32,
  npcLines: 8,
  npcLine: 240,
  docBytes: 96 * 1024,
  note: 500,
});

export const POI_MAP = Object.freeze({ w: 1000, h: 500 });

export const POI_ALPHA = Object.freeze(['opaque', 'cutout', 'blend']);
export const POI_WRAP = Object.freeze(['repeat', 'clamp', 'mirror']);
export const POI_FILTER = Object.freeze(['linear', 'nearest']);
export const POI_COLLIDE = Object.freeze(['mesh', 'none']);
export const POI_GROUND = Object.freeze(['snap', 'absolute']);

/** @param {(b: Uint8Array) => Uint8Array} rand */
export const mintPoiId = (rand) => `poi-${[...rand(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
/** @param {(b: Uint8Array) => Uint8Array} rand */
export const mintShelfId = (rand) => `lib-${mintPoiId(rand).slice(4)}`;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const vec = (v, n) => Array.isArray(v) && v.length === n && v.every(finite);
const UNSAID_RE = /[\p{Cc}\p{Cs}\u{2028}\u{2029}\u{202a}-\u{202e}\u{2066}-\u{2069}]/u;
const PROSE_UNSAID_RE = /[\u{0}-\u{9}\u{b}-\u{1f}\u{7f}-\u{9f}\p{Cs}\u{2028}\u{2029}\u{202a}-\u{202e}\u{2066}-\u{2069}]/u;
const textOk = (s, max, min = 0) => typeof s === 'string' && s.length >= min && s.length <= max && s === s.trim() && !UNSAID_RE.test(s);
const enumOk = (v, list) => typeof v === 'string' && list.includes(v);

export function unitQuat(q) {
  if (!vec(q, 4)) return null;
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!(Math.abs(n - 1) <= 1e-3)) return null;
  return q.map((c) => c / n);
}

export const DEFAULT_MATERIAL = Object.freeze({
  texture: null, color: Object.freeze([1, 1, 1, 1]), emissive: null, emissiveColor: Object.freeze([0, 0, 0]),
  alpha: 'opaque', cutoff: 0.5, twoSided: false, wrap: Object.freeze(['repeat', 'repeat']), filter: 'linear',
  uv: Object.freeze({ offset: Object.freeze([0, 0]), scale: Object.freeze([1, 1]), rotation: 0 }),
});

/**
 * @typedef {{ path: string, code: string, [arg: string]: any }} PoiProblem
 */

/** @param {PoiProblem} p */
export const problemLine = (p) => `${p.path}: ${p.code}`;

/**
 * @param {any} raw
 * @param {{ shelf?: boolean }} [opts]
 * @returns {PoiProblem[]}
 */
export function poiDocProblems(raw, { shelf = false } = {}) {
  /** @type {PoiProblem[]} */
  const out = [];
  const say = (path, code, args = {}) => { if (out.length < 200) out.push({ path, code, ...args }); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [{ path: 'doc', code: 'not-object' }];
  let bytes = 0;
  try { bytes = new TextEncoder().encode(JSON.stringify(raw)).byteLength; } catch { return [{ path: 'doc', code: 'not-json' }]; }
  const v2 = !shelf && raw.v === 2;
  const maxBytes = poiDocBytesOf(v2 ? 2 : 1);
  if (bytes > maxBytes) say('doc', 'too-large', { bytes, max: maxBytes });
  if (!(shelf ? [POI_SHELF_VERSION] : POI_DOC_VERSIONS).includes(raw.v)) say('v', 'version', { want: shelf ? POI_SHELF_VERSION : POI_DOC_VERSIONS[POI_DOC_VERSIONS.length - 1] });
  if (typeof raw.id !== 'string' || !(shelf ? POI_SHELF_ID_RE : POI_ID_RE).test(raw.id)) say('id', 'id');
  if (!textOk(raw.name, POI_LIMITS.name, 1)) say('name', 'name', { max: POI_LIMITS.name });
  if (raw.about !== undefined && !(typeof raw.about === 'string' && raw.about.length <= POI_LIMITS.about && !PROSE_UNSAID_RE.test(raw.about))) say('about', 'about', { max: POI_LIMITS.about });
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags) || raw.tags.length > POI_LIMITS.tags) say('tags', 'tags', { max: POI_LIMITS.tags });
    else raw.tags.forEach((t, i) => { if (!textOk(t, POI_LIMITS.tag, 1)) say(`tags[${i}]`, 'tag', { max: POI_LIMITS.tag }); });
  }

  const p = raw.place;
  if (shelf) { if (raw.thumb !== null && !(typeof raw.thumb === 'string' && POI_SHA_RE.test(raw.thumb))) say('thumb', 'texture-ref'); }
  else if (!p || typeof p !== 'object') say('place', 'missing');
  else {
    if (!Number.isInteger(p.px) || p.px < 0 || p.px >= POI_MAP.w) say('place.px', 'px', { max: POI_MAP.w - 1 });
    if (!Number.isInteger(p.py) || p.py < 0 || p.py >= POI_MAP.h) say('place.py', 'py', { max: POI_MAP.h - 1 });
    if (!finite(p.x) || p.x < 0 || p.x >= POI_PIXEL_M) say('place.x', 'in-pixel', { max: POI_PIXEL_M });
    if (!finite(p.z) || p.z < 0 || p.z >= POI_PIXEL_M) say('place.z', 'in-pixel', { max: POI_PIXEL_M });
    if (!finite(p.y) || Math.abs(p.y) > 4000) say('place.y', 'height', { max: 4000 });
    if (!enumOk(p.ground, POI_GROUND)) say('place.ground', 'ground');
    if (!unitQuat(p.r)) say('place.r', 'quat');
    if (!finite(p.s) || p.s < 0.01 || p.s > 100) say('place.s', 'size', { min: 0.01, max: 100 });
    unknownProblems(p, PLACE_KEYS, 'place', say);
  }

  const stands = (Array.isArray(raw.npcs) && raw.npcs.length) || (v2 && Array.isArray(raw.flats) && raw.flats.length);
  if (!Array.isArray(raw.parts) || (!raw.parts.length && !stands)) say('parts', 'parts-none');
  else if (raw.parts.length > POI_LIMITS.parts) say('parts', 'parts-many', { max: POI_LIMITS.parts });
  else {
    const keys = new Set();
    raw.parts.forEach((part, i) => {
      const at = `parts[${i}]`;
      if (!part || typeof part !== 'object') { say(at, 'not-object'); return; }
      if (typeof part.key !== 'string' || !POI_PART_KEY_RE.test(part.key)) say(`${at}.key`, 'key');
      else if (keys.has(part.key)) say(`${at}.key`, 'key-twice', { key: part.key });
      else keys.add(part.key);
      if (part.name !== undefined && !textOk(part.name, POI_LIMITS.name)) say(`${at}.name`, 'part-name', { max: POI_LIMITS.name });
      const arch = v2 && part.arch3d !== undefined;
      if (arch) { if (!poiArch3dOk(part.arch3d)) say(`${at}.arch3d`, 'model'); if (part.mesh !== undefined) say(`${at}.mesh`, 'unknown'); }
      else if (typeof part.mesh !== 'string' || !POI_SHA_RE.test(part.mesh)) say(`${at}.mesh`, 'mesh-ref');
      if (!vec(part.t, 3) || part.t.some((c) => Math.abs(c) > 2000)) say(`${at}.t`, 'offset', { max: 2000 });
      if (!unitQuat(part.r)) say(`${at}.r`, 'quat');
      if (!vec(part.s, 3) || part.s.some((c) => Math.abs(c) < 0.001 || Math.abs(c) > 1000)) say(`${at}.s`, 'scale', { min: 0.001, max: 1000 });
      if (!enumOk(part.collide, POI_COLLIDE)) say(`${at}.collide`, 'collide');
      if (typeof part.shadow !== 'boolean') say(`${at}.shadow`, 'bool');
      if (arch) { if (part.materials !== undefined) say(`${at}.materials`, 'unknown'); }
      else if (!Array.isArray(part.materials) || !part.materials.length || part.materials.length > POI_LIMITS.materials) say(`${at}.materials`, 'materials', { max: POI_LIMITS.materials });
      else part.materials.forEach((m, k) => materialProblems(m, `${at}.materials[${k}]`, say));
      unknownProblems(part, v2 ? PART_KEYS_V2 : PART_KEYS, at, say);
    });
  }

  if (raw.lights !== undefined) {
    if (!Array.isArray(raw.lights) || raw.lights.length > POI_LIMITS.lights) say('lights', 'lights', { max: POI_LIMITS.lights });
    else raw.lights.forEach((l, i) => {
      const at = `lights[${i}]`;
      if (!l || typeof l !== 'object') { say(at, 'not-object'); return; }
      if (!vec(l.t, 3) || l.t.some((c) => Math.abs(c) > 2000)) say(`${at}.t`, 'offset', { max: 2000 });
      if (!vec(l.color, 3) || l.color.some((c) => c < 0 || c > 1)) say(`${at}.color`, 'color3');
      if (!finite(l.radius) || l.radius < 0.5 || l.radius > 100) say(`${at}.radius`, 'radius', { min: 0.5, max: 100 });
      if (!finite(l.intensity) || l.intensity < 0 || l.intensity > 10) say(`${at}.intensity`, 'intensity', { max: 10 });
      if (typeof l.flicker !== 'boolean') say(`${at}.flicker`, 'bool');
      unknownProblems(l, v2 ? LIGHT_KEYS_V2 : LIGHT_KEYS, at, say);
    });
  }

  if (raw.npcs !== undefined && !shelf) {
    if (!Array.isArray(raw.npcs) || raw.npcs.length > POI_LIMITS.npcs) say('npcs', 'npcs', { max: POI_LIMITS.npcs });
    else {
      const keys = new Set();
      raw.npcs.forEach((n, i) => {
        const at = `npcs[${i}]`;
        if (!n || typeof n !== 'object') { say(at, 'not-object'); return; }
        if (typeof n.key !== 'string' || !POI_PART_KEY_RE.test(n.key)) say(`${at}.key`, 'key');
        else if (keys.has(n.key)) say(`${at}.key`, 'key-twice', { key: n.key });
        else keys.add(n.key);
        if (!textOk(n.name, POI_LIMITS.label, 1)) say(`${at}.name`, 'part-name', { max: POI_LIMITS.label });
        if (!vec(n.t, 3) || n.t.some((c) => Math.abs(c) > 2000)) say(`${at}.t`, 'offset', { max: 2000 });
        if (!finite(n.yaw) || Math.abs(n.yaw) > 720) say(`${at}.yaw`, 'size', { max: 720 });
        if (!finite(n.h) || n.h < 0.3 || n.h > 20) say(`${at}.h`, 'size', { min: 0.3, max: 20 });
        const lk = n.look;
        if (!lk || typeof lk !== 'object') say(`${at}.look`, 'not-object');
        else if (lk.k === 'df') {
          if (!Number.isInteger(lk.a) || lk.a < 0 || lk.a > 999) say(`${at}.look.a`, 'size', { max: 999 });
          if (!Number.isInteger(lk.r) || lk.r < 0 || lk.r > 255) say(`${at}.look.r`, 'size', { max: 255 });
          unknownProblems(lk, NPC_LOOK_DF, `${at}.look`, say);
        } else if (lk.k === 'pic') {
          if (typeof lk.tex !== 'string' || !POI_SHA_RE.test(lk.tex)) say(`${at}.look.tex`, 'texture-ref');
          unknownProblems(lk, NPC_LOOK_PIC, `${at}.look`, say);
        } else say(`${at}.look.k`, 'unknown');
        if (!Array.isArray(n.lines) || n.lines.length > POI_LIMITS.npcLines) say(`${at}.lines`, 'lines', { max: POI_LIMITS.npcLines });
        else n.lines.forEach((l, k) => { if (!textOk(l, POI_LIMITS.npcLine, 1)) say(`${at}.lines[${k}]`, 'about', { max: POI_LIMITS.npcLine }); });
        unknownProblems(n, v2 ? NPC_KEYS_V2 : NPC_KEYS, at, say);
      });
    }
  }

  if (raw.marker !== undefined && !shelf) {
    const m = raw.marker;
    if (!m || typeof m !== 'object') say('marker', 'not-object');
    else {
      if (typeof m.show !== 'boolean') say('marker.show', 'bool');
      if (m.label !== undefined && !textOk(m.label, POI_LIMITS.label)) say('marker.label', 'label', { max: POI_LIMITS.label });
      unknownProblems(m, MARKER_KEYS, 'marker', say);
    }
  }

  if (v2) poiV2Problems(raw, { say, textOk, vec, finite, enumOk, keyRe: POI_PART_KEY_RE, unknown: (o, known, at) => unknownProblems(o, known, at, say) });
  const known = new Set(shelf ? SHELF_KEYS : v2 ? DOC_KEYS_V2 : DOC_KEYS);
  for (const k of Object.keys(raw)) if (!known.has(k)) say(k, 'unknown');
  return out;
}
const DOC_KEYS = ['v', 'id', 'name', 'about', 'tags', 'place', 'parts', 'lights', 'npcs', 'marker'];
const DOC_KEYS_V2 = [...DOC_KEYS, ...POI_V2_DOC_KEYS];
const SHELF_KEYS = ['v', 'id', 'name', 'about', 'tags', 'parts', 'lights', 'thumb'];
const NPC_KEYS = new Set(['key', 'name', 't', 'yaw', 'h', 'look', 'lines']);
const NPC_LOOK_DF = new Set(['k', 'a', 'r']);
const NPC_LOOK_PIC = new Set(['k', 'tex']);
const PLACE_KEYS = new Set(['px', 'py', 'x', 'z', 'y', 'ground', 'r', 's']);
const PART_KEYS = new Set(['key', 'name', 'mesh', 't', 'r', 's', 'collide', 'shadow', 'materials']);
const LIGHT_KEYS = new Set(['t', 'color', 'radius', 'intensity', 'flicker']);
const PART_KEYS_V2 = new Set([...PART_KEYS, ...POI_V2_PART_KEYS]);
const LIGHT_KEYS_V2 = new Set([...LIGHT_KEYS, ...POI_V2_LIGHT_KEYS]);
const NPC_KEYS_V2 = new Set([...NPC_KEYS, ...POI_V2_NPC_KEYS]);
const MARKER_KEYS = new Set(['show', 'label']);
const MATERIAL_KEYS = new Set(['texture', 'color', 'emissive', 'emissiveColor', 'alpha', 'cutoff', 'twoSided', 'wrap', 'filter', 'uv']);
const UV_KEYS = new Set(['offset', 'scale', 'rotation']);
function unknownProblems(o, known, at, say) {
  for (const k of Object.keys(o)) if (!known.has(k)) say(`${at}.${k}`, 'unknown');
}
/** @param {any} raw */
export const poiShelfProblems = (raw) => poiDocProblems(raw, { shelf: true });

function materialProblems(m, at, say) {
  if (!m || typeof m !== 'object') { say(at, 'not-object'); return; }
  if (m.texture !== null && !(typeof m.texture === 'string' && POI_SHA_RE.test(m.texture))) say(`${at}.texture`, 'texture-ref');
  if (m.emissive !== null && !(typeof m.emissive === 'string' && POI_SHA_RE.test(m.emissive))) say(`${at}.emissive`, 'texture-ref');
  if (!vec(m.color, 4) || m.color.some((c) => c < 0 || c > 1)) say(`${at}.color`, 'color4');
  if (!vec(m.emissiveColor, 3) || m.emissiveColor.some((c) => c < 0 || c > 16)) say(`${at}.emissiveColor`, 'emissive-color', { max: 16 });
  if (!enumOk(m.alpha, POI_ALPHA)) say(`${at}.alpha`, 'alpha');
  if (!finite(m.cutoff) || m.cutoff < 0 || m.cutoff > 1) say(`${at}.cutoff`, 'cutoff');
  if (typeof m.twoSided !== 'boolean') say(`${at}.twoSided`, 'bool');
  if (!Array.isArray(m.wrap) || m.wrap.length !== 2 || !m.wrap.every((w) => enumOk(w, POI_WRAP))) say(`${at}.wrap`, 'wrap');
  if (!enumOk(m.filter, POI_FILTER)) say(`${at}.filter`, 'filter');
  const uv = m.uv;
  if (!uv || typeof uv !== 'object' || !vec(uv.offset, 2) || !vec(uv.scale, 2) || !finite(uv.rotation)
    || uv.scale.some((c) => Math.abs(c) < 1e-4 || Math.abs(c) > 1e4) || uv.offset.some((c) => Math.abs(c) > 1e4)) say(`${at}.uv`, 'uv');
  if (uv && typeof uv === 'object') unknownProblems(uv, UV_KEYS, `${at}.uv`, say);
  unknownProblems(m, MATERIAL_KEYS, at, say);
}

/** @param {any} doc */
export function poiAssetsOf(doc) {
  const meshes = new Set(), textures = new Set();
  if (typeof doc?.thumb === 'string') textures.add(doc.thumb);
  for (const part of doc?.parts ?? []) {
    if (typeof part?.mesh === 'string') meshes.add(part.mesh);
    for (const m of part?.materials ?? []) {
      if (typeof m?.texture === 'string') textures.add(m.texture);
      if (typeof m?.emissive === 'string') textures.add(m.emissive);
    }
  }
  for (const n of doc?.npcs ?? []) if (n?.look?.k === 'pic' && typeof n.look.tex === 'string') textures.add(n.look.tex);
  return { meshes, textures };
}

export const POI_BUDGET = Object.freeze({
  triangles: 1_048_576,
  vertices: 1_048_576,
  bytes: 64 * 1024 * 1024,
  pixels: 2 * 4096 * 4096,
  reach: 2048,
});

function turned(q, v) {
  const [x, y, z, w] = q;
  const cx = y * v[2] - z * v[1], cy = z * v[0] - x * v[2], cz = x * v[1] - y * v[0];
  return [v[0] + 2 * (w * cx + y * cz - z * cy), v[1] + 2 * (w * cy + z * cx - x * cz), v[2] + 2 * (w * cz + x * cy - y * cx)];
}

function partReach(part, mesh) {
  const r = unitQuat(part?.r);
  if (!r || !vec(part.t, 3) || !vec(part.s, 3) || !vec(mesh?.min, 3) || !vec(mesh?.max, 3)) return 0;
  let far = 0;
  for (let c = 0; c < 8; c++) {
    const corner = [0, 1, 2].map((k) => ((c >> k) & 1 ? mesh.max[k] : mesh.min[k]) * part.s[k]);
    const p = turned(r, corner);
    far = Math.max(far, Math.hypot(p[0] + part.t[0], p[1] + part.t[1], p[2] + part.t[2]));
  }
  return far;
}

/**
 * @param {any} doc
 * @param {(sha: string) => any} metaOf
 * @returns {PoiProblem[]}
 */
export function poiAssetProblems(doc, metaOf) {
  /** @type {PoiProblem[]} */
  const out = [];
  const distinct = new Map();
  let triangles = 0, vertices = 0, reach = 0;
  if (doc?.thumb != null) {
    const t = metaOf(doc.thumb);
    if (!t) out.push({ path: 'thumb', code: 'not-uploaded' });
    else if (t.kind !== 'texture') out.push({ path: 'thumb', code: 'not-a-texture' });
    else distinct.set(doc.thumb, t);
  }
  (doc?.parts ?? []).forEach((part, i) => {
    if (part?.arch3d !== undefined) return;
    const mesh = metaOf(part?.mesh);
    if (!mesh) out.push({ path: `parts[${i}].mesh`, code: 'not-uploaded' });
    else if (mesh.kind !== 'mesh') out.push({ path: `parts[${i}].mesh`, code: 'not-a-mesh' });
    else {
      if (mesh.submeshes !== part.materials?.length) out.push({ path: `parts[${i}].materials`, code: 'material-count', have: part.materials?.length ?? 0, want: mesh.submeshes });
      distinct.set(part.mesh, mesh);
      triangles += Number(mesh.triangles) || 0;
      vertices += Number(mesh.vertices) || 0;
      reach = Math.max(reach, partReach(part, mesh));
    }
    (part?.materials ?? []).forEach((m, k) => {
      for (const field of ['texture', 'emissive']) {
        if (m?.[field] == null) continue;
        const t = metaOf(m[field]);
        if (!t) out.push({ path: `parts[${i}].materials[${k}].${field}`, code: 'not-uploaded' });
        else if (t.kind !== 'texture') out.push({ path: `parts[${i}].materials[${k}].${field}`, code: 'not-a-texture' });
        else distinct.set(m[field], t);
      }
    });
  });
  (doc?.npcs ?? []).forEach((n, i) => {
    if (n?.look?.k !== 'pic') return;
    const t = metaOf(n.look.tex);
    if (!t) out.push({ path: `npcs[${i}].look.tex`, code: 'not-uploaded' });
    else if (t.kind !== 'texture') out.push({ path: `npcs[${i}].look.tex`, code: 'not-a-texture' });
    else distinct.set(n.look.tex, t);
  });
  let bytes = 0, pixels = 0;
  for (const f of distinct.values()) {
    bytes += Number(f.bytes) || 0;
    if (f.kind === 'texture') pixels += (Number(f.w) || 0) * (Number(f.h) || 0);
  }
  reach *= finite(doc?.place?.s) ? doc.place.s : 1;
  const over = (code, have, max) => { if (have > max) out.push({ path: 'doc', code, have, max }); };
  over('budget-triangles', triangles, POI_BUDGET.triangles);
  over('budget-vertices', vertices, POI_BUDGET.vertices);
  over('budget-bytes', bytes, POI_BUDGET.bytes);
  over('budget-pixels', pixels, POI_BUDGET.pixels);
  over('budget-reach', Math.ceil(reach), POI_BUDGET.reach);
  return out;
}

/** @param {any} doc */
export const poiPixelId = (doc) => doc.place.py * POI_MAP.w + doc.place.px;
