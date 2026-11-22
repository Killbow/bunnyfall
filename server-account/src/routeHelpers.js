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

/** Every refusal is one word and the same shape. A client learns that
 *  it failed and not why somebody else's secret is wrong. */
export const no = (why, status, origin) => json({ error: why }, status, origin);
/** POI-1: a POI store refusal's status - a role refused 403, a thing not there 404 (taken off the shelf, 410), a state
 *  moved or a builder's holdings full 409, a full day 429. AUDIT POI: `poi-changed` (S1), `poi-drafts-full` (S10),
 *  `poi-shelf-full` and `poi-shelf-spent` (S10), `poi-gone` (U13). */
export const POI_STATUS = {
  'poi-not-builder': 403, 'poi-not-approver': 403, 'poi-not-author': 403, 'not-found': 404, 'poi-gone': 410, 'poi-state': 409, 'poi-changed': 409, 'poi-pending': 409, 'poi-not-live': 409,
  'poi-drafts-full': 409, 'poi-shelf-full': 409, 'lease': 409, 'no-realm-character': 404, 'txn-spent': 409, 'poi-when': 409, 'poi-items': 409, 'poi-gold': 409, 'poi-limit': 409, 'poi-cooldown': 409, 'poi-stock': 409, 'poi-no-recipe': 404, 'poi-no-event': 404, 'poi-shelf-spent': 409, 'poi-quota': 429, 'no-storage': 503,
};
/** POI-1: what one address may ask of the POI store's open reads in a window - a game streaming a town's models at once. */
export const POI_OPEN_MAX = 600;
/** POI-1: AN ASSET'S BYTES, as stored - a live one cached a day (AUDIT POI S4: its name is its hash, so its bytes never
 *  change, but it can stop being public - "immutable for a year" had made that impossible to take back), a draft's never
 *  cached (a builder's business, and it may never go live). */
export const poiAssetResponse = (/** @type {any} */ r, /** @type {string} */ origin) => new Response(r.object.body, {
  status: 200,
  headers: {
    'content-type': r.type,
    'access-control-allow-origin': origin,
    'cache-control': r.live ? `public, max-age=${POI_LIVE_ASSET_MAX_AGE_S}` : 'private, no-store',
  },
});
/** AUDIT ONLINE A17's law, the service's one answer to a throw: LOGGED, not lost, and a player told nothing about it -
 *  an overloaded D1 a 503 (SCALE4f: counted apart from a bug), any other a 500. HOMES-SHED (2026-10-13, the database
 *  overloaded from 14:11 UTC): the try's catch below, and the one route above it that asks the database (the siege
 *  blackout's question), whose throw had left the Worker as a bare 500 - no body, no log line, no metrics point. */
export const thrown = (path, e, origin) => {
  console.error('[account]', path, e?.stack ?? String(e));
  if (!d1Overloaded(e)) return no('server', 500, origin);
  noteOverload(Date.now());   // BUSY-GATE: and this isolate sheds the reads a moment (service.js)
  return overloaded(origin);
};
/** BUSY-GATE (net/busyLaw.js): THE OVERLOAD'S ANSWER - `server`, 503 (SCALE4f), and how long to stand back. The client's
 *  gate holds its reads that long at least; a client from before the gate asks again on its own schedule. */
export const overloaded = (origin) => {
  const res = no('server', 503, origin);
  res.headers.set('retry-after', String(BUSY_RETRY_AFTER_S));
  return res;
};
/** GUILD1c: A GUILD ACT'S ANSWER WITH ITS ORDERS SIGNED in place of what they say (guilds.js). `badge` - the actor's
 *  character's guild now, `{}` for none - becomes `order`, which the actor's own client carries to the rooms it is in;
 *  `out` - a member removed, or the guild disbanded - becomes `outOrder`, which the client carries to the hub, whose
 *  word reaches that member wherever they stand. A service with no key still acts, answering null for either: the rooms
 *  read the change off the next token. */
export async function guildOrdersOf(r, s, env, subtle, nowS) {
  const { badge, out, ...answer } = r;
  if (badge === undefined && out === undefined) return answer;
  const key = await signingKey(env, subtle);
  if (badge !== undefined) answer.order = key ? await mintGuildOrder({ s, ...badge }, key, { subtle, nowS }) : null;
  if (out !== undefined) answer.outOrder = key ? await mintGuildOutOrder(out, key, { subtle, nowS }) : null;
  return answer;
}

/** FIELD BUGS 2026-10-14 QUEST-HOME (Mac, 2026-10-15: "Close both"): AN ACT'S ANSWER THAT MOVED A HOME, WITH ITS ORDERS
 *  SIGNED in place of what it says (`moved`, src/net/homeLaw.js homeMoved) - `homeOrders`, each one town's
 *  (HOME_ORDER_KEYS_MAX buildings at most), which the acting client carries to the hub, whose fan reaches every page
 *  online: a quest never picks its residence in a house bought after a page's boot read, and one picked there and not yet
 *  reached is chosen again. A service with no key still acts, answering none: the pages read the move at their next
 *  boot (homes.js homeLayouts). */
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

/** A body's bytes, or null past `max` - refused on the length it
 *  ANNOUNCES before a byte is read, and on the bytes that ARRIVE as
 *  they arrive. AUDIT 68 X8-account-body-cap-not-enforced-without-content-length:
 *  a chunked body announces nothing, and `request.text()` buffered all
 *  of it - pre-auth, before any limiter - to refuse it afterwards. */
export async function readCapped(request, max) {
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

/** A JSON object body within `max` bytes - or null (not a JSON object), or undefined (past the bound: AUDIT LEGACY III
 *  O2, which the line's route answers in its own word). Both refuse alike wherever a route asks only `!body`. */
export async function readBody(request, max = MAX_BODY_BYTES) {
  const bytes = await readCapped(request, max);
  if (!bytes) return undefined;
  const text = new TextDecoder().decode(bytes);
  if (!text) return {};
  try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}
