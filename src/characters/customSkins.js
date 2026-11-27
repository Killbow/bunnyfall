// @ts-check
/* global atob */
// Client half of custom paperdolls: the worn skin and every skin in view, fetched once by id.
// skinArtOf(id) returns the decoded art, or null while it is still coming.
import { skinsGet, skinsMine, skinsWear } from '../net/accountClient.js';
import { skinIdOk } from '../net/skinLaw.js';

/** @typedef {{ id: string, owner: string, name: string, height: number, w: number, h: number, front: Uint8Array, back: Uint8Array }} SkinArt */
const RETRY_MS = 60_000;
const RECHECK_MS = 10 * 60_000;
/** @type {Map<string, { art?: SkinArt, at?: number, loading?: boolean, failedUntil?: number }>} */
const _skins = new Map();
/** @type {(() => any) | null} */
let _io = null;
/** @type {string | null} */
let _worn = null;
let _listeners = /** @type {Set<() => void>} */ (new Set());

export const wornSkinId = () => _worn;
export const onSkinsChange = (/** @type {() => void} */ f) => { _listeners.add(f); return () => { _listeners.delete(f); }; };
const changed = () => { for (const f of _listeners) { try { f(); } catch { } } };

async function decode(/** @type {string} */ b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = /** @type {OffscreenCanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height);
  return { w: bmp.width, h: bmp.height, rgba: new Uint8Array(d.data.buffer) };
}

async function fetchSkin(/** @type {string} */ id) {
  const e = _skins.get(id) ?? {};
  _skins.set(id, e);
  e.loading = true;
  try {
    const io = _io?.();
    if (!io) throw new Error('no account');
    const r = await skinsGet(io, id);
    if (!r?.ok) { if (r?.error === 'skin-gone') { e.art = undefined; e.failedUntil = Date.now() + RETRY_MS; e.loading = false; changed(); return; } throw new Error(String(r?.error ?? 'refused')); }
    const [front, back] = await Promise.all([decode(r.data.front), decode(r.data.back)]);
    if (front.w !== back.w || front.h !== back.h) throw new Error('sizes differ');
    e.at = Date.now();
    e.art = { id, owner: String(r.data.owner ?? ''), name: r.data.name, height: Number(r.data.height) || 1, w: front.w, h: front.h, front: front.rgba, back: back.rgba };
    e.failedUntil = undefined;
    changed();
  } catch { e.failedUntil = Date.now() + RETRY_MS; }
  e.loading = false;
}

export function skinArtOf(/** @type {unknown} */ id) {
  if (!skinIdOk(id)) return null;
  const e = _skins.get(/** @type {string} */ (id));
  if (e?.art) { if (!e.loading && Date.now() - (e.at ?? 0) > RECHECK_MS) fetchSkin(/** @type {string} */ (id)); return e.art; }
  if (!e || (!e.loading && (e.failedUntil ?? 0) <= Date.now())) fetchSkin(/** @type {string} */ (id));
  return null;
}
export const ownSkinArt = () => (_worn ? skinArtOf(_worn) : null);

export function connectSkins(/** @type {() => any} */ io) {
  _io = io;
  const door = io();
  if (!door) return;
  skinsMine(door).then((r) => { if (r?.ok) { _worn = skinIdOk(r.data?.worn) ? r.data.worn : null; changed(); } }).catch(() => {});
}

export async function wearSkin(/** @type {string|null} */ id) {
  const door = _io?.();
  if (!door) return { ok: false, error: 'auth' };
  const r = await skinsWear(door, id);
  if (r?.ok) { _worn = id; changed(); }
  return r;
}

export function _resetSkinsForTests() { _skins.clear(); _worn = null; _io = null; _listeners = new Set(); }
