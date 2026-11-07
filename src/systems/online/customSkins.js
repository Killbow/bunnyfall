// @ts-check
/* global atob */
// BUNNYFALL (2026-11-07): CUSTOM PAPERDOLLS, THE CLIENT'S HALF (src/net/skinLaw.js is the law; server-account/src/skins.js
// keeps them; ui/skinsWindow.js is where a player picks one). This module holds
//   - the skin THIS player wears online (`wornId`), told by the account on connect and by the window's pick,
//   - every skin anyone in view wears, fetched once by its id (an approved skin is the same picture for everyone) and
//     decoded into two same-size RGBA pictures, `art`: { id, name, height, w, h, front, back },
// and answers `skinArtOf(id)` - the art, or null while it is still coming (the caller draws what it drew before; the id
// is asked for on the first look). The doll compositor (ui/paperDoll.js) and the peers' billboards (net/remotePlayers.js)
// read it; neither knows how it is fetched.
import { skinsGet, skinsMine, skinsWear } from '../../net/accountClient.js';
import { skinIdOk } from '../../net/skinLaw.js';

/** @typedef {{ id: string, name: string, height: number, w: number, h: number, front: Uint8Array, back: Uint8Array }} SkinArt */
const RETRY_MS = 60_000;
/** @type {Map<string, { art?: SkinArt, loading?: boolean, failedUntil?: number }>} */
const _skins = new Map();
/** @type {(() => any) | null} */
let _io = null;
/** @type {string | null} */
let _worn = null;
let _listeners = /** @type {Set<() => void>} */ (new Set());

/** The id this player wears online, or null. */
export const wornSkinId = () => _worn;
/** Something changed (a skin landed, the pick changed): the doll and the peers redraw. */
export const onSkinsChange = (/** @type {() => void} */ f) => { _listeners.add(f); return () => { _listeners.delete(f); }; };
const changed = () => { for (const f of _listeners) { try { f(); } catch { /* an ear's trouble is its own */ } } };

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
    if (!r?.ok) throw new Error(String(r?.error ?? 'refused'));
    const [front, back] = await Promise.all([decode(r.data.front), decode(r.data.back)]);
    if (front.w !== back.w || front.h !== back.h) throw new Error('sizes differ');
    e.art = { id, name: r.data.name, height: Number(r.data.height) || 1, w: front.w, h: front.h, front: front.rgba, back: back.rgba };
    e.failedUntil = undefined;
    changed();
  } catch { e.failedUntil = Date.now() + RETRY_MS; }
  e.loading = false;
}

/** The art of a skin by id when it is here; else null, and the fetch is started (once; a failure waits RETRY_MS). */
export function skinArtOf(/** @type {unknown} */ id) {
  if (!skinIdOk(id)) return null;
  const e = _skins.get(id);
  if (e?.art) return e.art;
  if (!e || (!e.loading && (e.failedUntil ?? 0) <= Date.now())) fetchSkin(/** @type {string} */ (id));
  return null;
}
/** The art of the skin this player wears, when it is here. */
export const ownSkinArt = () => (_worn ? skinArtOf(_worn) : null);

/** The world hands the account door once; the worn skin is read from the account. */
export function connectSkins(/** @type {() => any} */ io) {
  _io = io;
  const door = io();
  if (!door) return;
  skinsMine(door).then((r) => { if (r?.ok) { _worn = skinIdOk(r.data?.worn) ? r.data.worn : null; changed(); } }).catch(() => {});
}

/** Wear one of the account's approved skins (or `null` for none): the service's word, then the doll redraws. */
export async function wearSkin(/** @type {string|null} */ id) {
  const door = _io?.();
  if (!door) return { ok: false, error: 'auth' };
  const r = await skinsWear(door, id);
  if (r?.ok) { _worn = id; changed(); }
  return r;
}

/** Test seam. */
export function _resetSkinsForTests() { _skins.clear(); _worn = null; _io = null; _listeners = new Set(); }
