// The Worker's `/v1/eg/live` ask, `/status` ask, and law door, with their caches, held trail,
// body cap, and verifying key.
import { EG_ABSENT_TRIAL_MS } from '../../../src/net/eliteGates/egLaw.js';
import { EG_TRAIL_MS, egTrailPush } from '../../../src/net/eliteGates/egFair.js';
import { json } from '../room/json.js';
import { SOCIAL_ROOM } from '../relay.js';
import { EG_INTERNAL_LIVE } from '../../../src/net/eliteGates/egDurable.js';
import { ROOM_CALL_MS } from '../relayScale.js';
import { STATUS_INTERNAL } from '../room/keys.js';
import { LAW_BODY_MAX, SAFE_INTERNAL_LAW, LAW_SEEN_MAX } from '../room/holds.js';
import { STAFF_ORDER_KINDS } from '../staffFreeze.js';
import { verifyOrder, _b64url, importPublicKeyB64 } from '../../../src/net/identityToken.js';

// Keep below EG_POSE_NEAR_MS in src/net/eliteGates/egFair.js, so every landing finds a held pose
// on either side.
export const EG_HELD_STEP_MS = 200;
export const EG_CAST_SEEN_MAX = 64;
export function egTrailHeld(k, now) {
  const r = k.last, tr = k.tr;
  if (!r || now - r[0] > EG_ABSENT_TRIAL_MS) return tr;
  const end = tr.length ? tr[tr.length - 1][0] : r[0];
  for (let t = Math.max(end + EG_HELD_STEP_MS, now - EG_TRAIL_MS); t <= now; t += EG_HELD_STEP_MS) egTrailPush(tr, [t, r[1], r[2], r[3], r[4], 1]);
  return tr;
}
export async function egLiveAsk(rooms) {
  if (!rooms?.idFromName || !rooms?.get) return json({ error: 'unavailable' }, 503);
  let asking = egLiveAsking.get(rooms);
  if (!asking) {
    asking = egLiveRead(rooms).finally(() => { if (egLiveAsking.get(rooms) === asking) egLiveAsking.delete(rooms); });
    egLiveAsking.set(rooms, asking);
  }
  const body = await asking;
  return body ? json(body) : json({ error: 'unavailable' }, 503);
}
export const STATUS_KEEP_MS = 10_000;
/** @type {WeakMap<object, { at: number, body: any }>} */
export const statusSaid = new WeakMap();
export async function statusAsk(rooms) {
  if (!rooms?.idFromName || !rooms?.get) return json({ error: 'unavailable' }, 503);
  const kept = statusSaid.get(rooms);
  if (kept && Date.now() - kept.at < STATUS_KEEP_MS) return json(kept.body);
  try {
    const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${STATUS_INTERNAL}`, { signal: AbortSignal.timeout(4000) }));
    if (!res.ok) return json({ error: 'unavailable' }, 503);
    const body = await res.json();
    statusSaid.set(rooms, { at: Date.now(), body });
    return json(body);
  } catch { return json({ error: 'unavailable' }, 503); }
}
export const egLiveAsking = new WeakMap();
export async function egLiveRead(rooms) {
  try {
    const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${EG_INTERNAL_LIVE}`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(ROOM_CALL_MS * 4) }));
    return res?.ok ? await res.json() : null;
  } catch (e) { console.warn('[eg] live', e?.message ?? e); return null; }
}
export async function lawDoor(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const rooms = env.ROOMS;
  if (!rooms?.idFromName || !rooms?.get) return json({ error: 'unavailable' }, 503);
  const raw = await bodyCapped(request, LAW_BODY_MAX);
  if (!raw) return json({ error: 'too large' }, 413);
  let body = null;
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { body = null; }
  const order = body?.order;
  if (typeof order !== 'string' || !order || order.length > 1024) return json({ error: 'bad law' }, 400);
  const kind = lawKindOf(order);
  if (kind !== 'ban' && kind !== 'mute' && kind !== 'smsg' && kind !== 'staffcut' && kind !== 'hide' && kind !== 'sevent' && kind !== 'restart' && !STAFF_ORDER_KINDS.includes(kind)) return json({ error: 'bad law' }, 403);
  const key = await lawKeyOf(env);
  if (!key) return json({ error: 'unavailable' }, 503);
  const nowS = Math.floor(Date.now() / 1000);
  const r = await verifyOrder(order, key, { subtle: crypto.subtle, nowS, kind });
  if (!r.ok) return json({ error: 'bad law' }, 403);
  const sig = order.slice(order.lastIndexOf('.') + 1);
  for (const [k, e] of lawSeen) { if (e > nowS) break; lawSeen.delete(k); }
  if (lawSeen.has(sig) && kind !== 'sevent') return json({ ok: true });
  try {
    const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${SAFE_INTERNAL_LAW}`, { method: 'POST', body: JSON.stringify({ order }), signal: AbortSignal.timeout(ROOM_CALL_MS * 4) }));
    if (!res?.ok) return json({ error: 'unavailable' }, 503);
    const said = await res.json().catch(() => null);
    if (said?.ok !== true) return json({ ok: false, error: 'not taken', ...(kind === 'sevent' ? { why: said?.why ?? null, l: said?.l ?? null } : {}) }, 409);
    if (lawSeen.size >= LAW_SEEN_MAX) lawSeen.delete(lawSeen.keys().next().value);
    lawSeen.set(sig, r.claims.e);
    return json({ ok: true, ...(kind === 'smsg' ? { n: said.n, old: said.old } : {}), ...(kind === 'sevent' ? { l: said.l } : {}), ...(kind === 'restart' ? { n: said.n } : {}) });
  } catch (e) { console.warn('[law] the hub', e?.message ?? e); return json({ error: 'unavailable' }, 503); }
}
export const lawSeen = new Map();
export function lawKindOf(order) {
  // Claims are unverified here: read `o` only to pick the one verify, and `verifyOrder` with `kind`
  // refuses an order whose signed `o` differs.
  const parts = typeof order === 'string' ? order.split('.') : [];
  const raw = parts.length === 3 ? _b64url.decode(parts[1]) : null;
  if (!raw) return null;
  try { const o = JSON.parse(new TextDecoder().decode(raw))?.o; return typeof o === 'string' ? o : null; } catch { return null; }
}
export async function bodyCapped(request, max) {
  const said = Number(request.headers.get('content-length'));
  if (Number.isFinite(said) && said > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { try { await reader.cancel(); } catch {  } return null; }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}
export let lawKeyHeld = { raw: '', key: /** @type {CryptoKey|null} */ (null) };
export async function lawKeyOf(env) {
  const raw = env?.IDENTITY_PUBLIC_KEY;
  if (typeof raw !== 'string' || !raw) return null;
  if (lawKeyHeld.raw !== raw) {
    let key = null;
    try { key = await importPublicKeyB64(raw, { subtle: crypto.subtle }); } catch { key = null; }
    lawKeyHeld = { raw, key };
  }
  return lawKeyHeld.key;
}
