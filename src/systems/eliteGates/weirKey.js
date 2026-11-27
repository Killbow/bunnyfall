// @ts-check
// The pack stack only displays the account balance (`players.eg_keys`): every server answer that carries the count
// restacks the pack, and a load folds away keys found outside the pack.
import { registerCustomTemplates, setItemFields, mintCondition, registerItemUseHandler } from '../../items/itemTemplates.js';
import { EG_TEXT } from '../../net/eliteGates/egLaw.js';
import { WEIR_KEY_ART, registerWeirKeyArt } from '../../world/eliteGates/egKeyArt.js';
import { addVendorTextures } from '../../render/textureReplacement.js';
import { WEIR_KEY_TEMPLATE, WEIR_KEY_LAW_ROW } from './weirKeyRow.js';

export { WEIR_KEY_TEMPLATE };
export const WEIR_KEY_ROW = Object.freeze({
  ...WEIR_KEY_LAW_ROW, name: EG_TEXT.keyName, worldTextureArchive: WEIR_KEY_ART.archive, worldTextureRecord: WEIR_KEY_ART.record,
});
registerCustomTemplates([WEIR_KEY_ROW]);
registerWeirKeyArt(addVendorTextures);
export const isWeirKey = (/** @type {any} */ item) => item?.templateIndex === WEIR_KEY_TEMPLATE && item?.group === 'UselessItems2';
export function weirKeys(n = 1) {
  return Object.assign(mintCondition(setItemFields({ group: 'UselessItems2', templateIndex: WEIR_KEY_TEMPLATE })), { stackCount: Math.max(1, Math.trunc(Number(n) || 1)) });
}
export const weirKeysHeld = (/** @type {any[]} */ items) => (Array.isArray(items) ? items.filter(isWeirKey).reduce((s, it) => s + Math.max(1, it.stackCount ?? 1), 0) : 0);
/**
 * Faces thrown onto bodies with their visit token; a restack sets the pack to the balance minus faces still lying,
 * after folding faces from another visit.
 * @type {{ list: any[], face: any, at: unknown }[]}
 */
const _lying = [];
/** @type {() => unknown} */
let _facesHere = () => true;
export function setWeirKeyFacesHere(/** @type {(() => unknown)|null} */ fn) {
  _facesHere = typeof fn === 'function' ? fn : () => true;
  if (!fn) _lying.length = 0;
}
export function throwWeirKeyFace(/** @type {any[]} */ list) {
  const face = weirKeys(1);
  list.push(face);
  _lying.push({ list, face, at: _facesHere() });
  return face;
}
function foldLyingWeirKeys(gone = (/** @type {{ at: unknown }} */ _e) => true) {
  for (let i = _lying.length - 1; i >= 0; i--) {
    const { list, face } = _lying[i];
    if (!gone(_lying[i])) continue;
    const k = list.indexOf(face);
    if (k >= 0) list.splice(k, 1);
    _lying.splice(i, 1);
  }
}
export function weirKeysLying() {
  if (!_facesHere()) { foldLyingWeirKeys(); return 0; }
  const here = _facesHere();
  foldLyingWeirKeys((e) => e.at !== here);
  for (let i = _lying.length - 1; i >= 0; i--) if (!_lying[i].list.includes(_lying[i].face)) _lying.splice(i, 1);
  return _lying.reduce((s, e) => s + Math.max(1, e.face.stackCount ?? 1), 0);
}
export const _resetWeirKeyFacesForTests = () => { _lying.length = 0; _facesHere = () => true; };
/**
 * @param {any[]} items
 * @param {number} n
 */
export function restackWeirKeys(items, n) {
  if (!Array.isArray(items) || !Number.isSafeInteger(n) || n < 0) return false;
  const want = Math.max(0, n - weirKeysLying());
  const held = items.filter(isWeirKey);
  if (held.length === (want > 0 ? 1 : 0) && (want === 0 || (held[0].stackCount ?? 1) === want)) return false;
  for (const it of held) items.splice(items.indexOf(it), 1);
  if (want > 0) items.push(weirKeys(want));
  return true;
}
/**
 * Never pass the pack in `lists`; the next restack rebuilds the pack stack from the balance.
 * @param {any[][]} lists
 * @param {any[]} [records]
 */
export function foldStrayWeirKeys(lists, records = []) {
  _lying.length = 0;
  const folded = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (let i = list.length - 1; i >= 0; i--) if (isWeirKey(list[i])) folded.add(list.splice(i, 1)[0]);
  }
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    for (const [id, item] of Object.entries(r)) if (isWeirKey(item)) { folded.add(item); delete r[id]; }
  }
  return [...folded].reduce((n, it) => n + Math.max(1, it.stackCount ?? 1), 0);
}
// An empty line from the opener closes the pack window so the start window can take the screen when its preflight
// lands.
let _opener = null;
export function setWeirKeyOpener(/** @type {((item: any) => string)|null} */ fn) { _opener = typeof fn === 'function' ? fn : null; }
registerItemUseHandler(WEIR_KEY_TEMPLATE, (item) => {
  const text = _opener ? _opener(item) : EG_TEXT.cold;
  return { kind: 'text', text, closesWindow: text === '' };
});
