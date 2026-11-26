// @ts-check

import { TRIGGER_FLAGS } from './rdbLayout.js';
import { TRIGGER_GATE, isActionDoorObject } from './actionSystem.js';
import { NODE_GLOW_MAX } from '../render/nodeGlow.js';
import { PICK_PARDON_M } from '../player/activate.js';

export const SENSE_M = 8;
export const SENSE_HOLD_S = 6;
export const SENSE_FADE_S = 1.5;
export const SENSE_MAX = NODE_GLOW_MAX;
export const SENSE_PREF = 'dungeonSense';
// Under protan and deutan vision `use` and `find` look alike, so each kind also has its own glow form in
// `SENSE_FORM`.
export const SENSE_CSS = Object.freeze({ use: '#ffe9a8', door: '#9cc8ff', find: '#7dff9a', secret: '#c48cff' });
export const SENSE_FORM = Object.freeze({
  use: Object.freeze([1, 1, 0]), door: Object.freeze([1.2, 0, 0]), find: Object.freeze([0.4, 0, 1]), secret: Object.freeze([0.25, 1.6, 0.35]),
});
const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return Object.freeze([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]); };
export const SENSE_RGB = Object.freeze(Object.fromEntries(Object.entries(SENSE_CSS).map(([k, hex]) => [k, hexRgb(hex)])));
export const SENSE_CARD_MIN = 0.5;
export const SENSE_CARD_W_MAX = 2.4;
export const SENSE_CARD_H_MAX = 2.8;

export const senseTier = (v) => (v === 'off' || v === 'secrets' ? v : 'on');

const FIND_PREFIXES = Object.freeze(['loot:', 'corpse:', 'search:', 'droppedLoot:', 'srch:']);
/**
 * @param {string} key
 * @param {string|null|undefined} title
 */
export function senseKind(key, title) {
  if (FIND_PREFIXES.some((p) => key.startsWith(p))) return 'find';
  if (key.startsWith('exit:')) return 'door';
  if ((key.startsWith('act:') || key.startsWith('door:')) && title === 'Door') return 'door';
  return 'use';
}

export function boxDistance(box, p) {
  let s = 0;
  for (let i = 0; i < 3; i++) {
    const v = p[i] < box.min[i] ? box.min[i] - p[i] : p[i] > box.max[i] ? p[i] - box.max[i] : 0;
    s += v * v;
  }
  return Math.sqrt(s);
}

export function senseCard(box) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  return {
    at: [(box.min[0] + box.max[0]) / 2, box.min[1], (box.min[2] + box.max[2]) / 2],
    w: clamp(Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2]), SENSE_CARD_MIN, SENSE_CARD_W_MAX),
    h: clamp(box.max[1] - box.min[1], SENSE_CARD_MIN, SENSE_CARD_H_MAX),
  };
}

/**
 * @param {any} target
 * @param {any} [object]
 */
export function senseFlat(target, object = null) {
  if (target?.noSurface === true || object?.isFlat === true || object?.kind === 'moveFlat') return true;
  const key = target?.key;
  return typeof key === 'string' && FLAT_PREFIXES.some((p) => key.startsWith(p));
}
const FLAT_PREFIXES = Object.freeze(['loot:', 'corpse:', 'droppedLoot:']);

const isVec3 = (v) => v != null && typeof v === 'object' && v.length >= 3 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);

/**
 * @param {{ raycastHit: Function }} collider
 * @param {number[]} eye
 * @param {{ min: number[], max: number[] }} box
 * @param {{ skip?: string|null, noSurface?: boolean }} [o]
 */
export function inPlainSight(collider, eye, box, { skip = null, noSurface = false } = {}) {
  const cx = (box.min[0] + box.max[0]) / 2, cz = (box.min[2] + box.max[2]) / 2;
  for (const y of [(box.min[1] + box.max[1]) / 2, box.max[1] - 0.05]) {
    const dx = cx - eye[0], dy = y - eye[1], dz = cz - eye[2], len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-3)) return true;
    const dir = [dx / len, dy / len, dz / len];
    const hit = collider.raycastHit(eye, dir, len, skip ? { skip: [skip] } : null);
    if (!Number.isFinite(hit?.dist)) return true;
    if (noSurface) continue;
    const at = [eye[0] + dir[0] * hit.dist, eye[1] + dir[1] * hit.dist, eye[2] + dir[2] * hit.dist];
    if (at.every((v, i) => v >= box.min[i] - PICK_PARDON_M && v <= box.max[i] + PICK_PARDON_M)) return true;
  }
  return false;
}

/** @typedef {{ key: string, kind: 'use'|'door'|'find'|'secret', d: number, at: number[], w: number, h: number }} SenseFind */
/**
 * @param {ReadonlyArray<any>|null|undefined} targets
 * @param {number[]|null|undefined} eye
 * @param {{ nameOf: (key: string) => string|null|undefined, sees?: (t: any) => boolean, reach?: number, max?: number }} o
 * @returns {SenseFind[]}
 */
export function senseFinds(targets, eye, { nameOf, sees = () => true, reach = SENSE_M, max = SENSE_MAX }) {
  /** @type {SenseFind[]} */
  const out = [];
  if (!Array.isArray(targets) || !isVec3(eye) || typeof nameOf !== 'function') return out;
  const seen = new Set();
  for (const t of targets) {
    const box = t?.aabb;
    if (!box || typeof t.key !== 'string' || seen.has(t.key) || !isVec3(box.min) || !isVec3(box.max)) continue;
    const d = boxDistance(box, eye);
    if (!(d <= reach)) continue;
    const title = nameOf(t.key);
    if (!title) continue;
    if (!sees(t)) continue;
    seen.add(t.key);
    out.push({ key: t.key, kind: /** @type {SenseFind['kind']} */ (senseKind(t.key, title)), d, ...senseCard(box) });
  }
  out.sort((a, b) => a.d - b.d);
  if (out.length > max) out.length = max;
  return out;
}

/** @param {any} o */
export function playerTriggers(o) {
  const gate = TRIGGER_GATE[o?.triggerFlag ?? TRIGGER_FLAGS.None] ?? [];
  return gate.some((t) => t !== 'Door' || isActionDoorObject(o));
}

/**
 * @param {any} o
 * @param {Set<string>} chainTargets
 */
export function isSecretMover(o, chainTargets) {
  if (!o || !chainTargets?.has(o.key)) return false;
  const mover = o.kind === 'action' || o.kind === 'moveFlat' || (o.kind === 'door' && o.special === true);
  return mover && !playerTriggers(o) && o.state === 'start';
}

/**
 * @param {Iterable<any>} objects
 * @param {Set<string>} chainTargets
 * @param {number[]|null|undefined} eye
 * @param {{ boxOf: (o: any) => any, sees?: (o: any, box: any) => boolean, reach?: number, max?: number }} o
 * @returns {SenseFind[]}
 */
export function senseSecrets(objects, chainTargets, eye, { boxOf, sees = () => true, reach = SENSE_M, max = SENSE_MAX }) {
  /** @type {SenseFind[]} */
  const out = [];
  if (!objects || !isVec3(eye) || typeof boxOf !== 'function') return out;
  for (const o of objects) {
    if (!isSecretMover(o, chainTargets)) continue;
    const box = boxOf(o);
    if (!box || !isVec3(box.min) || !isVec3(box.max)) continue;
    const d = boxDistance(box, eye);
    if (!(d <= reach) || !sees(o, box)) continue;
    out.push({ key: o.key, kind: 'secret', d, ...senseCard(box) });
  }
  out.sort((a, b) => a.d - b.d);
  if (out.length > max) out.length = max;
  return out;
}

/**
 * @param {SenseFind[]} finds
 * @param {SenseFind[]} [secrets]
 * @returns {SenseFind[]}
 */
export function senseRound(finds, secrets = [], max = SENSE_MAX) {
  const all = [...(finds ?? []), ...(secrets ?? [])].sort((a, b) => a.d - b.d);
  const seen = new Set(), out = [];
  for (const f of all) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    out.push(f);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Each key is drawn once, echo marks first, because two cards with one key kindle the glow twice a frame at double
 * light.
 * @param {ReadonlyArray<{ key: string }>} echo
 * @param {ReadonlyArray<{ key: string }>} sense
 * @param {any[]} out
 */
export function senseMarks(echo, sense, out, max = SENSE_MAX) {
  out.length = 0;
  const seen = new Set();
  for (const list of [echo, sense]) {
    for (const m of list ?? []) {
      if (out.length >= max) return out;
      if (seen.has(m.key)) continue;
      seen.add(m.key);
      out.push(m);
    }
  }
  return out;
}

// Marks are pooled and reused on every call. Keys carry a `sense:` prefix so they never share glow state with a
// node.
export function createSensePulse({ hold = SENSE_HOLD_S, fade = SENSE_FADE_S } = {}) {
  let at = -Infinity;
  /** @type {SenseFind[]} */
  let finds = [];
  /** @type {Array<{ key: string, at: number[], w: number, h: number, rgb: readonly number[], gain: number, form: readonly number[] }>} */
  const pool = [], out = [];
  return {
    /**
     * @param {number} nowS
     * @param {SenseFind[]} list
     */
    pulse(nowS, list) { at = nowS; finds = Array.isArray(list) ? list.slice() : []; return finds.length; },
    /** @param {number} nowS */
    lit(nowS) { const age = nowS - at; return age >= 0 && age < hold && finds.length > 0; },
    /** @param {number} nowS */
    marks(nowS) {
      out.length = 0;
      const age = nowS - at;
      if (!(age >= 0 && age < hold)) { finds = []; return out; }
      const gain = age > hold - fade ? Math.max(0, (hold - age) / fade) : 1;
      for (const f of finds) {
        const m = pool[out.length] ??= { key: '', at: f.at, w: 0, h: 0, rgb: SENSE_RGB.use, gain: 0, form: SENSE_FORM.use };
        m.key = `sense:${f.key}`; m.at = f.at; m.w = f.w; m.h = f.h; m.rgb = SENSE_RGB[f.kind] ?? SENSE_RGB.use; m.gain = gain;
        m.form = SENSE_FORM[f.kind] ?? SENSE_FORM.use;
        out.push(m);
      }
      return out;
    },
    clear() { at = -Infinity; finds = []; },
  };
}
