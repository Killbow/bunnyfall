// @ts-check
// Lights enter a frame list only through packLight, which stores the record identity beside its vec4 for the
// shadow pass. A wrong identity costs a shadow redraw, never a wrong picture.

// Non-enumerable, so a record's fields, equality, spread copies, and wire form stay unchanged.
const LIGHT_ID = Symbol('lightId');
const _desc = { value: 0, writable: true, enumerable: false, configurable: false };
const _own = Object.prototype.hasOwnProperty;
/** @type {WeakMap<object, number>} */
const _frozen = new WeakMap();
let _seq = 0;

export const NO_LIGHT_ID = 0;

/** @param {any} l @param {number} id */
function nameLight(l, id) {
  if (_own.call(l, LIGHT_ID)) l[LIGHT_ID] = id;
  else if (Object.isExtensible(l)) { _desc.value = id; Object.defineProperty(l, LIGHT_ID, _desc); }
  else _frozen.set(l, id);
}

/** @param {any} l */
export function lightIdOf(l) {
  let id = l[LIGHT_ID] ?? _frozen.get(l);
  if (id === undefined) { id = ++_seq; nameLight(l, id); }
  return id;
}

/**
 * @template T
 * @param {T} l
 * @returns {T}
 */
export function relight(l) {
  nameLight(l, ++_seq);
  return l;
}

// A record that refills in place keeps its identity; a new record each frame is a new light unless adopted here.
/**
 * @template T
 * @param {T} e
 * @param {any} src
 * @returns {T}
 */
export function adoptLight(e, src) {
  nameLight(e, lightIdOf(src));
  return e;
}

/** @typedef {Float32Array<ArrayBuffer> & { ids?: Float64Array<ArrayBuffer>, carried?: Uint8Array }} LightList */

export function lightList(n) {
  const out = /** @type {LightList} */ (new Float32Array(n * 4));
  Object.defineProperty(out, 'ids', { value: new Float64Array(n), writable: true, enumerable: false, configurable: true });
  return out;
}

export function packLight(out, i, l, range = l.range) {
  out[i * 4] = l.x; out[i * 4 + 1] = l.y; out[i * 4 + 2] = l.z; out[i * 4 + 3] = range;
  if (out.ids) out.ids[i] = lightIdOf(l);
}

export function copyLights(out, at, src, from = 0, count = (src.length >> 2) - from) {
  for (let j = 0, a = at * 4, b = from * 4; j < count * 4; j++) out[a + j] = src[b + j];
  const ids = out.ids, sids = src.ids;
  if (ids) for (let j = 0; j < count; j++) ids[at + j] = sids ? sids[from + j] : NO_LIGHT_ID;
}

export function lightListView(list, n) {
  const out = /** @type {LightList} */ (list.subarray(0, n * 4));
  if (list.ids) Object.defineProperty(out, 'ids', { value: list.ids.subarray(0, n), writable: true, enumerable: false, configurable: true });
  return out;
}

export const lightIdsOf = (data) => /** @type {LightList} */ (data)?.ids ?? null;
