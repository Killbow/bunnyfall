// @ts-check

import { call } from '../net/accountClient.js';

/** @typedef {{ fetch: (url: string, init?: any) => Promise<any>, base: string, secret: string | null }} PoiIo */

const hex = (/** @type {ArrayBuffer} */ buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
/** @param {Uint8Array} bytes */
export async function poiSha256(bytes, subtle = globalThis.crypto.subtle) {
  return hex(await subtle.digest('SHA-256', /** @type {BufferSource} */ (/** @type {unknown} */ (bytes))));
}

/** @param {PoiIo} io */
async function put(io, path, body, contentType) {
  const headers = { accept: 'application/json', 'content-type': contentType };
  if (io.secret) headers.authorization = `Bearer ${io.secret}`;
  let res;
  try {
    res = await io.fetch(`${io.base}${path}`, { method: 'PUT', headers, body });
  } catch {
    return { ok: false, error: 'offline' };
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    return { ok: false, error: typeof data?.error === 'string' ? data.error : 'server', ...(typeof data?.why === 'string' ? { why: data.why } : {}),
      ...(Array.isArray(data?.problems) ? { problems: data.problems } : {}), status: res.status };
  }
  if (!data) return { ok: false, error: 'offline', unknown: true, status: res.status };
  return { ok: true, data, status: res.status };
}

/** @param {PoiIo} io */
export const poiMe = (io) => call(io, '/v1/poi/me');
/** @param {PoiIo} io */
export const poiList = (io) => call(io, '/v1/poi/list');
/**
 * @param {PoiIo} io
 */
export const poiQueue = (io) => call(io, '/v1/poi/queue');
/**
 * @param {PoiIo} io
 * @param {string} id
 */
export const poiHistory = (io, id) => call(io, `/v1/poi/doc/${id}`);

/**
 * @param {PoiIo} io
 * @param {any} doc
 * @param {number | null} base
 */
export const poiSaveDraft = (io, doc, base = null) => put(io, '/v1/poi/draft', JSON.stringify({ doc, base }), 'application/json');
/** @param {PoiIo} io */
export const poiSubmit = (io, id, rev) => call(io, '/v1/poi/submit', { id, rev });
/** @param {PoiIo} io */
export const poiWithdraw = (io, id, rev) => call(io, '/v1/poi/withdraw', { id, rev });
/** @param {PoiIo} io */
export const poiRetire = (io, id) => call(io, '/v1/poi/retire', { id });
/**
 * @param {PoiIo} io
 */
export const poiReview = (io, id, rev, verdict, note = null, docSha = null) => call(io, '/v1/poi/review', { id, rev, verdict, note, ...(typeof docSha === 'string' ? { docSha } : {}) });
/** @param {PoiIo} io */
export const poiRollback = (io, id, rev) => call(io, '/v1/poi/rollback', { id, rev });

/**
 * @param {PoiIo} io
 */
export const poiShelf = (io) => call(io, '/v1/poi/shelf');
/**
 * @param {PoiIo} io
 * @param {string} id
 */
export const poiShelfEntry = (io, id) => call(io, `/v1/poi/shelf/${id}`);
/**
 * @param {PoiIo} io
 * @param {any} item
 */
export const poiShelve = (io, item) => put(io, '/v1/poi/shelf', JSON.stringify({ item }), 'application/json');
/**
 * @param {PoiIo} io
 * @param {string} id
 */
export const poiUnshelve = (io, id) => call(io, '/v1/poi/unshelve', { id });

/**
 * @param {PoiIo} io
 * @param {Uint8Array} bytes
 * @param {'mesh' | 'texture'} kind
 */
export async function poiPutAsset(io, bytes, kind, subtle = globalThis.crypto.subtle) {
  const sha = await poiSha256(bytes, subtle);
  const r = await put(io, `/v1/poi/asset/${sha}?kind=${kind}`, bytes, 'application/octet-stream');
  return r.ok ? r : { ...r, sha };
}
