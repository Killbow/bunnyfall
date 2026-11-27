// @ts-check
import {
  textureEntry, textureKey, addVendorTextures, hasTextureReplacement, decodedTexture, decodedTextureTopDown, preloadTextureRecord, decodePng,
  holdTextureTiers, PRELOAD_CONCURRENCY,
} from '../../render/textureReplacement.js';
import { LAST_CLASSIC_TEXTURE_ARCHIVE } from '../../formats/textureFile.js';
import { DYE_COLORS, dyeToken } from '../../characters/dyes.js';
import { APP_ROOT } from '../../platform/appRoot.js';

export const STUDIO_DIR = 'art/studio';
export const STUDIO_INDEX = 'index.json';
// A classic texture name never holds this: its record and frame sit on either side of one dash.
export const STUDIO_LABEL = '--';
const STUDIO_FILE = new RegExp(`^(.+?)(?:${STUDIO_LABEL}(.+))?\\.png$`, 'i');
export const STUDIO_HOLD_MS = 3000;

// Item names print every dye but Unchanged, so `_Iron` is asked and `_Silver`, `_iron`, and `_Unchanged` never are.
export const askedDye = (token) => Object.hasOwn(DYE_COLORS, token) && dyeToken(DYE_COLORS[token]) === token;

/** @param {string} path */
export function studioFile(path) {
  const parts = String(path ?? '').split('/');
  if (parts.length < 2 || parts.some((p) => !p || p === '.' || p === '..')) return null;
  const m = STUDIO_FILE.exec(parts[parts.length - 1]);
  const e = m && textureEntry(`${m[1]}.png`);
  if (!e || (e.dye != null && !askedDye(e.dye))) return null;
  return {
    path, artist: parts[0], label: m[2] ?? null,
    archive: e.archive, record: e.record, frame: e.frame, map: e.map, dye: e.dye,
    key: textureKey(e.archive, e.record, e.frame, e.map, e.dye),
  };
}

export function studioEntries(files) {
  const byKey = new Map();
  for (const path of [...(Array.isArray(files) ? files : [])].filter((f) => typeof f === 'string').sort()) {
    const e = studioFile(path);
    if (e && !byKey.has(e.key)) byKey.set(e.key, e);
  }
  return [...byKey.values()];
}

export const studioUrl = (path, root = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/') =>
  new URL(`${STUDIO_DIR}/${String(path).split('/').map(encodeURIComponent).join('/')}`, root).href;

/** @type {Promise<number> | null} */
let _install = null;
/** @type {Promise<void>} */
let _decoded = Promise.resolve();
/** @type {(bytes: Uint8Array) => Promise<any>} */
let _decode = decodePng;
let _generation = 0;
/** @type {ReturnType<typeof studioEntries>} */
let _worn = [];

// A listing that would not read installs nothing and is asked again at the next call.
/**
 * @param {{ fetch?: (url: string) => Promise<any>, root?: string, decode?: (bytes: Uint8Array) => Promise<any> }} [io]
 */
export function installStudioArt(io = {}) {
  if (_install) return _install;
  const asked = register(io).then((n) => {
    if (n !== null) return n;
    if (_install === asked) _install = null;
    return 0;
  });
  _install = asked;
  holdTextureTiers(asked, STUDIO_HOLD_MS);
  return asked;
}
async function register({ fetch = (u) => globalThis.fetch(u), root = undefined, decode = decodePng }) {
  let files;
  try {
    const r = await fetch(studioUrl(STUDIO_INDEX, root));
    if (!r?.ok) return 0;
    files = (await r.json())?.files;
  } catch { return null; }
  _worn = studioEntries(files);
  _decode = decode;
  const bytes = async (path) => { const r = await fetch(studioUrl(path, root)); return r?.ok ? new Uint8Array(await r.arrayBuffer()) : null; };
  const n = addVendorTextures(_worn.map((e) => ({
    archive: e.archive, record: e.record, frame: e.frame, map: e.map, dye: e.dye,
    studio: true, fileName: `studio:${e.path}`, load: () => bytes(e.path),
  })));
  if (n) _generation++;
  const own = _worn.filter((e) => e.archive > LAST_CLASSIC_TEXTURE_ARCHIVE);
  let next = 0;
  const lane = async () => { while (next < own.length) { const e = own[next++]; await preloadTextureRecord(e.archive, e.record, e.frame, e.map, e.dye, { decode }); } };
  _decoded = Promise.all(Array.from({ length: Math.min(PRELOAD_CONCURRENCY, own.length) }, lane)).then(() => {});
  return n;
}
export async function studioLanded() {
  const n = await installStudioArt();
  await _decoded;
  return n;
}
export const studioWorn = () => _worn;
// Changes each time the studio registers pictures; caches of pictures drawn before it key on this.
export const studioGeneration = () => _generation;
export function _resetStudioArt() { _install = null; _decoded = Promise.resolve(); _decode = decodePng; _worn = []; _slots.clear(); }

// `topDown` is for hosts that upload row 0 as the top; others use the color32 order, row 0 at the bottom.
/**
 * @param {number} archive
 * @param {number} record
 * @param {{ topDown?: boolean }} [how]
 * @returns {{ width: number, height: number, colors: Uint8ClampedArray } | null}
 */
export function paintedReplacement(archive, record, { topDown = false } = {}) {
  if (!hasTextureReplacement(archive, record)) return null;
  if (!topDown) return decodedTexture(archive, record);
  const d = decodedTextureTopDown(archive, record);
  return d ? { width: d.width, height: d.height, colors: d.rgba } : null;
}

const _slots = new Map();

// The renderer keeps the first picture a key is given, so a host lets the painted one go before a late one goes up.
// Only the newest wear of a slot takes a late picture.
/**
 * @template P
 * @param {number} archive
 * @param {number} record
 * @param {() => P} paint
 * @param {(picture: P | NonNullable<ReturnType<typeof paintedReplacement>>, how: { replaced: boolean, late: boolean }) => void} put
 * @param {{ topDown?: boolean, slot?: string }} [how]
 */
export function wearPainted(archive, record, paint, put, how = {}) {
  const slot = how.slot ?? `${archive}_${record}`;
  const wear = {};
  _slots.set(slot, wear);
  const own = paintedReplacement(archive, record, how);
  if (own) { _slots.delete(slot); put(own, { replaced: true, late: false }); return; }
  put(paint(), { replaced: false, late: false });
  Promise.resolve(_install)
    .then(() => (hasTextureReplacement(archive, record) ? preloadTextureRecord(archive, record, 0, 'Albedo', null, { decode: _decode }) : null))
    .then((got) => {
      if (!got || _slots.get(slot) !== wear) return;
      const late = paintedReplacement(archive, record, how);
      if (late) put(late, { replaced: true, late: true });
    })
    .catch((e) => console.warn(`[studio] ${archive}_${record}: the picture that landed would not go up`, e?.message ?? e))
    .finally(() => { if (_slots.get(slot) === wear) _slots.delete(slot); });
}
