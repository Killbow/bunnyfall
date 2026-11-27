// @ts-check
// The main billboard pass, the shadow replay, and the air pass all key batch textures through billboardKey.

// The key is re-minted when any field it is made of changes, because mobiles animate by writing record, not frame.
/**
 * @param {{ archive: number, record: number|string, frame?: number|null, _bbKey?: string, _bbKeyId?: number, _bbKeyRecord?: number|string, _bbKeyFrame?: number|null, _bbKeyArchive?: number }} b
 * @returns {string}
 */
export function billboardKey(b) {
  if (b._bbKey == null || b._bbKeyRecord !== b.record || b._bbKeyFrame !== b.frame || b._bbKeyArchive !== b.archive) {
    b._bbKeyRecord = b.record; b._bbKeyFrame = b.frame; b._bbKeyArchive = b.archive;
    b._bbKey = b.frame == null ? `${b.archive}_${b.record}` : `${b.archive}_${b.record}#${b.frame}`;
    b._bbKeyId = keyId(b._bbKey);
  }
  return b._bbKey;
}

const _keyIds = new Map();
/** @type {string[]} */ const _keyStrs = [];
let _slot = new Int32Array(256);
let _count = new Int32Array(64);
/** @type {number[]} */ const _bucketKey = [];
/** @type {number[]} */ const _order = [];
/** @type {any[]} */ const _placed = [];
const byKey = (x, y) => { const a = _keyStrs[_bucketKey[x]], b = _keyStrs[_bucketKey[y]]; return a < b ? -1 : a > b ? 1 : 0; };

export function keyId(key) {
  let id = _keyIds.get(key);
  if (id === undefined) {
    id = _keyStrs.length;
    _keyIds.set(key, id);
    _keyStrs.push(key);
    if (id >= _slot.length) { const grown = new Int32Array(_slot.length * 2); grown.set(_slot); _slot = grown; }
  }
  return id;
}

// The order must match a stable string sort, because at an exact depth tie the first drawn quad keeps the pixel.
/**
 * @param {any[]} list
 * @param {number} [n]
 */
export function sortByKey(list, n = list.length) {
  if (n < 2) return list;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const b = list[i];
    const id = b._bbKeyId ?? (b._bbKeyId = keyId(b._bbKey));
    let s = _slot[id];
    if (s === 0) {
      s = ++k;
      _slot[id] = s;
      _bucketKey[s - 1] = id;
      if (s > _count.length) { const grown = new Int32Array(_count.length * 2); grown.set(_count); _count = grown; }
      _count[s - 1] = 0;
    }
    _count[s - 1]++;
  }
  if (k > 1) {
    _order.length = k;
    for (let s = 0; s < k; s++) _order[s] = s;
    _order.sort(byKey);
    let at = 0;
    for (let j = 0; j < k; j++) { const s = _order[j], c = _count[s]; _count[s] = at; at += c; }
    for (let i = 0; i < n; i++) { const b = list[i]; _placed[_count[_slot[b._bbKeyId] - 1]++] = b; }
    for (let i = 0; i < n; i++) { list[i] = _placed[i]; _placed[i] = null; }
  }
  for (let s = 0; s < k; s++) _slot[_bucketKey[s]] = 0;
  return list;
}
