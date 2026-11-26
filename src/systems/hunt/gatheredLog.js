// @ts-check
import { registerModSaveData } from '../../saves/modSaveData.js';

export const GATHERED_VENDOR = 'gatheredLog';
export const GATHERED_KINDS = Object.freeze(['fish', 'trophies']);
const fresh = () => ({ fish: {}, trophies: {} });
let log = /** @type {Record<string, Record<string, { n: number, day: number }>>} */ (fresh());

export function readGathered(/** @type {any} */ rec) {
  const out = fresh();
  for (const kind of GATHERED_KINDS) {
    const src = rec?.[kind];
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    for (const [k, v] of Object.entries(src)) {
      if (!/^\d{1,5}$/.test(k) || !Number.isSafeInteger(v?.n) || v.n < 1 || !Number.isSafeInteger(v?.day) || v.day < 0) continue;
      out[/** @type {'fish'|'trophies'} */ (kind)][k] = { n: v.n, day: v.day };
    }
  }
  return out;
}
export function noteGathered(/** @type {'fish'|'trophies'} */ kind, /** @type {number} */ key, /** @type {number} */ day) {
  if (!GATHERED_KINDS.includes(kind) || !Number.isSafeInteger(key) || key < 0) return false;
  const row = log[kind][String(key)];
  const d = Number.isSafeInteger(day) && day >= 0 ? day : 0;
  log[kind][String(key)] = row ? { n: row.n + 1, day: row.day } : { n: 1, day: d };
  return true;
}
export const gatheredOf = (/** @type {'fish'|'trophies'} */ kind) => ({ ...(log[kind] ?? {}) });
export const _resetGatheredForTests = (/** @type {any} */ rec = null) => { log = readGathered(rec); };

registerModSaveData(GATHERED_VENDOR, {
  newSaveData: () => fresh(),
  getSaveData: () => readGathered(log),
  restoreSaveData: (rec) => { log = readGathered(rec); },
});
