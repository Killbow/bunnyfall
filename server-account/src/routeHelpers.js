// The account service's answer helpers: replies, POI assets, orders, and capped body reads.
import { mintGuildOrder, mintGuildOutOrder, mintHomeOrder } from '../../src/net/identityToken.js';
import { MAX_BODY_BYTES, d1Overloaded, noteOverload } from './service.js';
import { POI_LIVE_ASSET_MAX_AGE_S } from './poi.js';
import { signingKey } from './signing.js';
import { BUSY_RETRY_AFTER_S } from '../../src/net/busyLaw.js';
import { HOME_ORDER_KEYS_MAX } from '../../src/net/homeLaw.js';

export const json = (body, status = 200, origin = '*') => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'cache-control': 'no-store',
  },
});

export const no = (why, status, origin) => json({ error: why }, status, origin);
export const POI_STATUS = {
  'poi-not-builder': 403, 'poi-not-approver': 403, 'poi-not-author': 403, 'not-found': 404, 'poi-gone': 410, 'poi-state': 409, 'poi-changed': 409, 'poi-pending': 409, 'poi-not-live': 409,
  'poi-drafts-full': 409, 'poi-shelf-full': 409, 'lease': 409, 'no-realm-character': 404, 'txn-spent': 409, 'poi-when': 409, 'poi-items': 409, 'poi-gold': 409, 'poi-limit': 409, 'poi-cooldown': 409, 'poi-stock': 409, 'poi-no-recipe': 404, 'poi-no-event': 404, 'poi-shelf-spent': 409, 'poi-quota': 429, 'no-storage': 503,
};
export const POI_OPEN_MAX = 600;
export const poiAssetResponse = (/** @type {any} */ r, /** @type {string} */ origin) => new Response(r.object.body, {
  status: 200,
  headers: {
    'content-type': r.type,
    'access-control-allow-origin': origin,
    // A live asset is named by its hash but can stop being public, so it is cached for a day, never as immutable.
    'cache-control': r.live ? `public, max-age=${POI_LIVE_ASSET_MAX_AGE_S}` : 'private, no-store',
  },
});
export const thrown = (path, e, origin) => {
  console.error('[account]', path, e?.stack ?? String(e));
  if (!d1Overloaded(e)) return no('server', 500, origin);
  noteOverload(Date.now());
  return overloaded(origin);
};
export const overloaded = (origin) => {
  const res = no('server', 503, origin);
  res.headers.set('retry-after', String(BUSY_RETRY_AFTER_S));
  return res;
};
export async function guildOrdersOf(r, s, env, subtle, nowS) {
  const { badge, out, ...answer } = r;
  if (badge === undefined && out === undefined) return answer;
  const key = await signingKey(env, subtle);
  if (badge !== undefined) answer.order = key ? await mintGuildOrder({ s, ...badge }, key, { subtle, nowS }) : null;
  if (out !== undefined) answer.outOrder = key ? await mintGuildOutOrder(out, key, { subtle, nowS }) : null;
  return answer;
}

export async function homeOrdersOf(r, s, env, subtle, nowS) {
  const { moved, ...answer } = r ?? {};
  if (!Array.isArray(moved) || !moved.length) return answer;
  const key = await signingKey(env, subtle);
  if (!key) return answer;
  const homeOrders = [];
  for (const { mapId, on = [], off = [] } of moved) {
    const keys = [...on.map((k) => [k, 1]), ...off.map((k) => [k, 0])];
    for (let at = 0; at < keys.length; at += HOME_ORDER_KEYS_MAX) {
      const part = keys.slice(at, at + HOME_ORDER_KEYS_MAX);
      homeOrders.push(await mintHomeOrder({ s, bm: mapId, bu: part.filter(([, u]) => u).map(([k]) => k), bd: part.filter(([, u]) => !u).map(([k]) => k) }, key, { subtle, nowS }));
    }
  }
  return { ...answer, homeOrders };
}

export async function readCapped(request, max) {
  // A chunked body announces no length, so the bytes are also counted as they arrive.
  const len = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(len) && len > max) return null;
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out.buffer;
}

// Answers null for a body that is not a JSON object, and undefined for one past the size cap.
export async function readBody(request, max = MAX_BODY_BYTES) {
  const bytes = await readCapped(request, max);
  if (!bytes) return undefined;
  const text = new TextDecoder().decode(bytes);
  if (!text) return {};
  try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}
