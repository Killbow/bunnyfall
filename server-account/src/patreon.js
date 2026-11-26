// @ts-check

import { _b64url } from '../../src/net/identityToken.js';
import { timingSafeEqual } from './password.js';

export const PATREON_TITLES = Object.freeze(['disciple', 'apostle', 'herald', 'hierophant']);
export const PATREON_ACTIVE = 'active_patron';
export const PATREON_STATE_S = 60 * 60;
export const PATREON_TICKET_S = 15 * 60;
export const PATREON_HOOK_MAX_BYTES = 256 * 1024;
export const PATREON_EVENTS = Object.freeze([
  'members:create', 'members:update', 'members:delete',
  'members:pledge:create', 'members:pledge:update', 'members:pledge:delete',
]);
const ENDS = new Set(['members:delete', 'members:pledge:delete']);

export const PATREON_AUTHORIZE = 'https://www.patreon.com/oauth2/authorize';
export const PATREON_TOKEN = 'https://www.patreon.com/api/oauth2/token';
export const PATREON_IDENTITY = 'https://www.patreon.com/api/oauth2/v2/identity'
  + '?include=memberships.currently_entitled_tiers,memberships.campaign'
  + '&fields%5Buser%5D=full_name&fields%5Bmember%5D=patron_status';
export const PATREON_CALLBACK_PATH = '/v1/patreon/callback';
const AGENT = 'daggerfall-accounts (Patreon link)';

const enc = new TextEncoder();
const dec = new TextDecoder();
const PATREON_ID_RE = /^[0-9]{1,24}$/;

export const patreonLinkOn = (/** @type {any} */ env) =>
  typeof env?.PATREON_CLIENT_ID === 'string' && !!env.PATREON_CLIENT_ID
  && typeof env?.PATREON_CLIENT_SECRET === 'string' && !!env.PATREON_CLIENT_SECRET;

export function patreonTierMap(/** @type {any} */ env) {
  const map = new Map();
  const raw = env?.PATREON_TIERS;
  if (typeof raw !== 'string') return map;
  for (const entry of raw.split(',')) {
    const [id, title, extra] = entry.split(':').map((s) => s.trim());
    if (extra === undefined && PATREON_ID_RE.test(id ?? '') && PATREON_TITLES.includes(/** @type {string} */ (title))) map.set(id, title);
  }
  return map;
}

export function tierIdsOf(/** @type {any} */ stored) {
  return typeof stored === 'string' && stored ? stored.split(',').filter((id) => PATREON_ID_RE.test(id)) : [];
}

export function pledgeTitles(/** @type {string[]} */ tierIds, /** @type {any} */ status, /** @type {any} */ env) {
  if (status !== PATREON_ACTIVE) return [];
  const map = patreonTierMap(env);
  const held = new Set(tierIds.map((id) => map.get(id)).filter(Boolean));
  return PATREON_TITLES.filter((t) => held.has(t));
}

/**
 * @param {any} player
 * @param {any} env
 */
export function patreonTitlesOf(player, env) {
  if (typeof player?.handle !== 'string' || !player.handle) return [];
  return pledgeTitles(tierIdsOf(player.patreon_tiers), player.patreon_status, env);
}

const SEAL_IV_BYTES = 12;

async function sealKey(/** @type {SubtleCrypto} */ subtle, /** @type {any} */ env, /** @type {string} */ kind) {
  const base = await subtle.importKey('raw', enc.encode(String(env.PATREON_CLIENT_SECRET)), 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('daggerfall-accounts patreon-link'), info: enc.encode(kind) },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function sealPatreon(/** @type {'state'|'ticket'} */ kind, /** @type {object} */ claims, /** @type {any} */ env, { subtle, rand }) {
  const iv = rand(new Uint8Array(SEAL_IV_BYTES));
  const box = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(subtle, env, kind), enc.encode(JSON.stringify(claims))));
  const out = new Uint8Array(iv.length + box.length);
  out.set(iv);
  out.set(box, iv.length);
  return _b64url.encode(out);
}

export async function openPatreon(/** @type {'state'|'ticket'} */ kind, /** @type {any} */ sealed, /** @type {any} */ env, { subtle, nowS }) {
  if (!patreonLinkOn(env) || typeof sealed !== 'string' || sealed.length > 4096) return null;
  const bytes = _b64url.decode(sealed);
  if (!bytes || bytes.length <= SEAL_IV_BYTES + 16) return null;
  let claims;
  try {
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, SEAL_IV_BYTES) }, await sealKey(subtle, env, kind), bytes.subarray(SEAL_IV_BYTES));
    claims = JSON.parse(dec.decode(plain));
  } catch { return null; }
  if (!claims || typeof claims !== 'object' || !Number.isSafeInteger(claims.x) || claims.x < nowS) return null;
  if (typeof claims.p !== 'string' || !claims.p) return null;
  return claims;
}

export function patreonAuthorizeUrl(/** @type {any} */ env, /** @type {string} */ redirectUri, /** @type {string} */ state) {
  const q = new URLSearchParams({ response_type: 'code', client_id: String(env.PATREON_CLIENT_ID), redirect_uri: redirectUri, scope: 'identity', state });
  return `${PATREON_AUTHORIZE}?${q}`;
}

export async function patreonExchange(/** @type {typeof fetch} */ fetch, /** @type {any} */ env, /** @type {string} */ code, /** @type {string} */ redirectUri) {
  try {
    const res = await fetch(PATREON_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': AGENT },
      body: new URLSearchParams({
        code, grant_type: 'authorization_code', redirect_uri: redirectUri,
        client_id: String(env.PATREON_CLIENT_ID), client_secret: String(env.PATREON_CLIENT_SECRET),
      }).toString(),
    });
    const data = res.ok ? await res.json() : null;
    return typeof data?.access_token === 'string' && data.access_token ? { token: data.access_token } : { error: 'patreon-down' };
  } catch {
    return { error: 'patreon-down' };
  }
}

export function memberOfIdentity(/** @type {any} */ doc) {
  const user = doc?.data?.id;
  if (typeof user !== 'string' || !PATREON_ID_RE.test(user)) return null;
  const name = typeof doc.data.attributes?.full_name === 'string' ? doc.data.attributes.full_name.slice(0, 80) : '';
  const refs = Array.isArray(doc.data.relationships?.memberships?.data) ? doc.data.relationships.memberships.data : [];
  const ids = new Set(refs.map((/** @type {any} */ r) => r?.id));
  const member = (Array.isArray(doc.included) ? doc.included : []).find((/** @type {any} */ r) => r?.type === 'member' && ids.has(r.id));
  if (!member) return { user, name, tiers: [], status: null };
  const tiers = Array.isArray(member.relationships?.currently_entitled_tiers?.data)
    ? member.relationships.currently_entitled_tiers.data.map((/** @type {any} */ t) => t?.id).filter((/** @type {any} */ id) => typeof id === 'string' && PATREON_ID_RE.test(id))
    : [];
  const status = typeof member.attributes?.patron_status === 'string' ? member.attributes.patron_status : null;
  return { user, name, tiers, status };
}

export async function patreonIdentity(/** @type {typeof fetch} */ fetch, /** @type {string} */ token) {
  try {
    const res = await fetch(PATREON_IDENTITY, { headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': AGENT } });
    const who = res.ok ? memberOfIdentity(await res.json()) : null;
    return who ?? { error: 'patreon-down' };
  } catch {
    return { error: 'patreon-down' };
  }
}

/**
 * @param {{ db: any, nowS: number }} ctx
 * @param {{ p: string, u: string, t: string, s: string|null }} c
 */
export async function linkPatreon({ db, nowS }, c) {
  if (typeof c?.u !== 'string' || !PATREON_ID_RE.test(c.u)) return { error: 'patreon-needs-account' };
  const tiers = tierIdsOf(c.t).join(',');
  const status = typeof c.s === 'string' ? c.s.slice(0, 32) : null;
  const registered = 'EXISTS (SELECT 1 FROM players WHERE id = ?2 AND handle IS NOT NULL)';
  const [off, on] = await db.batch([
    db.prepare(`UPDATE players SET patreon_user = NULL, patreon_tiers = NULL, patreon_status = NULL, patreon_at = NULL
      WHERE patreon_user = ?1 AND id <> ?2 AND ${registered}`).bind(c.u, c.p),
    db.prepare(`UPDATE players SET patreon_user = ?1, patreon_tiers = ?3, patreon_status = ?4, patreon_at = ?5
      WHERE id = ?2 AND handle IS NOT NULL`).bind(c.u, c.p, tiers, status, nowS),
  ]);
  if (!(on?.meta?.changes > 0)) return { error: 'patreon-needs-account' };
  return { ok: true, moved: off?.meta?.changes > 0 };
}

export async function unlinkPatreon({ db }, /** @type {string} */ playerId) {
  await db.prepare('UPDATE players SET patreon_user = NULL, patreon_tiers = NULL, patreon_status = NULL, patreon_at = NULL WHERE id = ?1')
    .bind(playerId).run();
  return { ok: true };
}

const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
export function md5(/** @type {Uint8Array} */ bytes) {
  const n = bytes.length;
  const len = (((n + 8) >>> 6) + 1) * 16;
  const x = new Uint32Array(len);
  for (let i = 0; i < n; i++) x[i >> 2] |= bytes[i] << ((i % 4) * 8);
  x[n >> 2] |= 0x80 << ((n % 4) * 8);
  x[len - 2] = (n * 8) >>> 0;
  x[len - 1] = Math.floor((n * 8) / 2 ** 32) >>> 0;
  let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476;
  for (let off = 0; off < len; off += 16) {
    let a = a0; let b = b0; let c = c0; let d = d0;
    for (let i = 0; i < 64; i++) {
      let f; let g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const sum = (a + f + MD5_K[i] + x[off + g]) | 0;
      const s = MD5_S[(i >> 4) * 4 + (i % 4)];
      a = d; d = c; c = b;
      b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((w, j) => { for (let k = 0; k < 4; k++) out[j * 4 + k] = (w >>> (8 * k)) & 0xff; });
  return out;
}

export function hmacMd5(/** @type {Uint8Array} */ key, /** @type {Uint8Array} */ msg) {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? md5(key) : key);
  const inner = new Uint8Array(64 + msg.length);
  const outer = new Uint8Array(64 + 16);
  for (let i = 0; i < 64; i++) { inner[i] = block[i] ^ 0x36; outer[i] = block[i] ^ 0x5c; }
  inner.set(msg, 64);
  outer.set(md5(inner), 64);
  return md5(outer);
}

const hex = (/** @type {Uint8Array} */ b) => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');

export function patreonSignatureOk(/** @type {string} */ secret, /** @type {Uint8Array} */ body, /** @type {any} */ signature) {
  const got = typeof signature === 'string' ? signature.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{32}$/.test(got)) return false;
  return timingSafeEqual(enc.encode(got), enc.encode(hex(hmacMd5(enc.encode(secret), body))));
}

export function memberOfHook(/** @type {any} */ doc) {
  const m = doc?.data;
  if (m?.type !== 'member') return null;
  const user = m.relationships?.user?.data?.id;
  if (typeof user !== 'string' || !PATREON_ID_RE.test(user)) return null;
  const rel = m.relationships?.currently_entitled_tiers;
  const tiers = Array.isArray(rel?.data)
    ? rel.data.map((/** @type {any} */ t) => t?.id).filter((/** @type {any} */ id) => typeof id === 'string' && PATREON_ID_RE.test(id))
    : undefined;
  const attrs = m.attributes;
  const status = attrs && typeof attrs === 'object' && 'patron_status' in attrs
    ? (typeof attrs.patron_status === 'string' ? attrs.patron_status.slice(0, 32) : null)
    : undefined;
  return { user, tiers, status };
}

/**
 * @param {{ db: any, nowS: number }} ctx
 * @param {any} env
 * @param {Uint8Array} body
 * @param {any} signature
 * @param {any} event
 */
export async function patreonWebhook({ db, nowS }, env, body, signature, event) {
  const secret = env?.PATREON_WEBHOOK_SECRET;
  if (typeof secret !== 'string' || !secret) return { error: 'patreon-closed' };
  if (!patreonSignatureOk(secret, body, signature)) return { error: 'signature' };
  let doc;
  try { doc = JSON.parse(dec.decode(body)); } catch { return { error: 'body' }; }
  if (!PATREON_EVENTS.includes(event)) return { ok: true, applied: 0 };
  const m = memberOfHook(doc);
  if (!m) return { ok: true, applied: 0 };
  const ended = ENDS.has(event);
  const tiers = ended ? '' : (m.tiers === undefined ? null : m.tiers.join(','));
  const statusStated = ended || m.status !== undefined;
  const status = ended ? 'former_patron' : (m.status ?? null);
  const r = await db.prepare(`UPDATE players SET
      patreon_tiers = COALESCE(?2, patreon_tiers),
      patreon_status = CASE WHEN ?3 = 1 THEN ?4 ELSE patreon_status END,
      patreon_at = ?5
    WHERE patreon_user = ?1`).bind(m.user, tiers, statusStated ? 1 : 0, status, nowS).run();
  return { ok: true, applied: r?.meta?.changes ?? 0 };
}

export async function patreonCardOf(/** @type {any} */ player, /** @type {any} */ env, { subtle, rand, nowS, origin }) {
  if (!patreonLinkOn(env)) return { on: false };
  const registered = typeof player?.handle === 'string' && !!player.handle;
  const state = registered ? await sealPatreon('state', { p: player.id, x: nowS + PATREON_STATE_S }, env, { subtle, rand }) : null;
  return {
    on: true,
    linked: typeof player?.patreon_user === 'string' && !!player.patreon_user,
    titles: patreonTitlesOf(player, env),
    link: state ? patreonAuthorizeUrl(env, `${origin}${PATREON_CALLBACK_PATH}`, state) : null,
  };
}

const esc = (/** @type {any} */ s) => String(s).replace(/[&<>"']/g, (ch) => (/** @type {Record<string,string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }))[ch]);

export const PATREON_TITLE_TEXT = Object.freeze({ disciple: 'Disciple', apostle: 'Apostle', herald: 'Herald', hierophant: 'Hierophant' });
const titlesText = (/** @type {string[]} */ ts) => ts.map((t) => /** @type {any} */ (PATREON_TITLE_TEXT)[t] ?? t).join(', ');

/** @param {{ heading: string, lines?: string[], form?: { ticket: string, label: string } | null }} page */
export function patreonPage({ heading, lines = [], form = null }) {
  const body = [
    `<h1>${esc(heading)}</h1>`,
    ...lines.map((l) => `<p>${esc(l)}</p>`),
    form ? `<form method="post" action="/v1/patreon/confirm"><input type="hidden" name="ticket" value="${esc(form.ticket)}"><button type="submit">${esc(form.label)}</button></form>` : '',
  ].join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
    + `<title>${esc(heading)} - Bunnyfall</title><style>`
    + 'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f0d0b;color:#e8dcc4;'
    + 'font:16px/1.5 Georgia,"Times New Roman",serif}main{max-width:30rem;margin:16px;padding:28px;border:1px solid #4a4036;'
    + 'background:#17130f}h1{margin:0 0 14px;font-size:22px;color:#c9a45c;letter-spacing:.04em}p{margin:0 0 10px;color:#b8ab93}'
    + 'button{margin-top:10px;padding:12px 20px;font:inherit;color:#c9a45c;background:transparent;border:1px solid #c9a45c;cursor:pointer}'
    + 'button:hover{background:#c9a45c;color:#0f0d0b}'
    + `</style></head><body><main>${body}</main></body></html>`;
}

export function patreonHtml(/** @type {string} */ html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
    },
  });
}

export const PATREON_PAGES = Object.freeze({
  off: { heading: 'Patreon linking is off', lines: ['It is not switched on yet. Ask the developers on the Discord.'] },
  expired: { heading: 'This link has expired', lines: ['Open your account card in the game and press Link Patreon again.'] },
  declined: { heading: 'Not linked', lines: ['Patreon was not linked. You can close this page.'] },
  down: { heading: 'Patreon did not answer', lines: ['Nothing was linked. Press Link Patreon on your account card to try again.'] },
  rate: { heading: 'Too many tries', lines: ['Wait a few minutes, then press Link Patreon on your account card again.'] },
  account: { heading: 'This account needs a username', lines: ['Give your game account a username and a password, then link Patreon.'] },
});

export function patreonConfirmPage({ handle, name, titles, ticket, from = null }) {
  return patreonPage({
    heading: 'Link Patreon',
    lines: [
      `Patreon account: ${name || 'yours'}`,
      `Game account: ${handle}`,
      titles.length ? `Your pledge holds: ${titlesText(titles)}.` : 'No pledge holds a title yet - it arrives the moment one does.',
      ...(from ? [`This Patreon is linked to ${from} now. Linking moves it to ${handle}.`] : []),
      'Not your game account? Close this page and nothing is linked.',
    ],
    form: { ticket, label: `Link to ${handle}` },
  });
}

export function patreonLinkedPage({ handle, titles }) {
  return patreonPage({
    heading: 'Patreon linked',
    lines: titles.length
      ? [`${handle} holds ${titlesText(titles)} now.`, 'Go back to the game and wear it from your account card.']
      : [`${handle} is linked. Your title arrives the moment your pledge holds one.`, 'You can close this page.'],
  });
}
