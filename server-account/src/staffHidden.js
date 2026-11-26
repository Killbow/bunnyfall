// @ts-check
// A hidden token's subject is minted per staff session, never the account id, so a hidden socket takes no seat of
// the account. The session and the switch are read on the primary, so a new sign-in or Hide me never mints a
// token that shows them.
import { mintToken, mintHideOrder, MAX_TTL_S, _b64url } from '../../src/net/identityToken.js';
import { openHiddenSeen } from '../../src/net/hiddenSeen.js';
import { displayName, accountKind, isMuted, mutedUntil, nameAsOf } from './accounts.js';
import { conductAgreed } from './safety.js';
import { glyphsOf } from './titles.js';
import { signingKey, gatePublicKey } from './signing.js';
import { pushLaw } from './sanctions.js';
import { staffRole, auditStatement, configKey, STAFF_IDLE_S } from './staff.js';
import { followSubject } from './staffFollow.js';

export const HIDDEN_ROUTES = Object.freeze(['/v1/staff/hide']);
export const HIDDEN_NAME = 'Staff member';
export const HIDDEN_GLYPHS = Object.freeze(['dev', 'mod', 'dm', 'shadowfang']);
const SESSIONS_MAX = 20;

/** @param {string} tokenHash @param {SubtleCrypto} subtle */
export async function hiddenSubOf(tokenHash, subtle) {
  const d = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(`dfo-hidden:v1:${tokenHash}`)));
  return _b64url.encode(d).slice(0, 24);
}

const LIVE_SQL = `SELECT p.staff_hide_on, s.token_hash, s.key_id, k.cfg, k.pub FROM staff_sessions s JOIN players p ON p.id = s.player_id
  JOIN staff_keys k ON k.id = s.key_id AND k.player_id = s.player_id AND k.revoked_at IS NULL AND k.handle_lc = p.handle_lc
  WHERE s.player_id = ?1 AND s.expires_at > ?2 AND s.last_act > ?3 ORDER BY s.created_at DESC, s.token_hash LIMIT ${SESSIONS_MAX}`;
// A lapsed session writes no row, so its hidden game gets no token until the member signs in, signs out, or shows.
const LAPSED_SQL = `SELECT 1 AS held FROM (SELECT id, at, key_id, json_extract(detail, '$.sub') AS sub FROM staff_audit WHERE actor = ?1 AND act = 'hidden-token' ORDER BY at DESC, id DESC LIMIT 1) h
  WHERE (SELECT staff_hide_on FROM players WHERE id = ?1) = 1 AND NOT EXISTS (SELECT 1 FROM staff_audit e WHERE e.actor = ?1 AND e.at >= h.at AND e.id > h.id
    AND ((e.act = 'hide' AND e.detail = '{"on":false}') OR (e.act = 'logout' AND (e.detail = '{"all":true}' OR json_extract(e.detail, '$.sub') = h.sub))
      OR (e.act = 'key-forget' AND json_extract(e.detail, '$.id') = h.key_id)))`;
const HIDDEN_SINCE_SQL = LAPSED_SQL.replace('SELECT 1 AS held FROM', () => `SELECT (SELECT MIN(r.at) FROM staff_audit r WHERE r.actor = ?1 AND r.act = 'hidden-token'
    AND json_extract(r.detail, '$.sub') = h.sub AND r.id > COALESCE((SELECT MAX(o.id) FROM staff_audit o WHERE o.actor = ?1 AND o.act = 'hide'
      AND o.detail = '{"on":false}' AND o.id < h.id), 0)) AS since FROM`);

/** @param {any} ctx @param {any} env @param {any} player @param {CryptoKey} key */
export async function hiddenToken(ctx, env, player, key) {
  const role = staffRole(player, env);
  if (!role) return null;
  const { subtle, nowS } = ctx;
  const db = ctx.primary ?? ctx.db;
  const live = ((await db.prepare(LIVE_SQL).bind(player.id, nowS, nowS - STAFF_IDLE_S).all())?.results ?? [])
    .find((r) => !r.cfg || configKey(player, env, r.pub));
  if (!live && await db.prepare(LAPSED_SQL).bind(player.id).first()) {
    await auditStatement(db, nowS, { actor: player, role, act: 'hidden-lapsed', outcome: 'denied', onceIn: 60 }).run();
    return { error: 'staff-session-lapsed' };
  }
  if (!live || live.staff_hide_on !== 1) return null;
  const sub = await hiddenSubOf(live.token_hash, subtle);
  // The audit row is written before the token, so no token is handed out that the log does not name.
  await auditStatement(db, nowS, { actor: player, role, act: 'hidden-token', detail: { sub }, keyId: live.key_id }).run();
  const g = glyphsOf(player, env, nowS).filter((x) => HIDDEN_GLYPHS.includes(x));
  const mu = isMuted(player, nowS) ? mutedUntil(player) : undefined;
  const token = await mintToken({ s: sub, n: HIDDEN_NAME, k: accountKind(player), ...(g.length ? { g } : {}), ...(mu ? { mu } : {}), hd: 1 }, key, { subtle, nowS });
  return {
    token, name: HIDDEN_NAME, accountName: displayName(player), nameAs: nameAsOf(player), kind: accountKind(player), title: null, glyphs: g,
    mutedUntil: mu ?? 0, conduct: conductAgreed(player), level: null, xp: null, guild: null, aura: null, icon: null, ribbon: null, house: null,
    expiresAt: nowS + MAX_TTL_S, hidden: 1, sub,
  };
}

/** @param {any} db @param {any} env @param {string} playerId */
export async function hiddenSince(db, env, playerId) {
  const player = await db.prepare('SELECT * FROM players WHERE id = ?').bind(playerId).first();
  if (!player || !staffRole(player, env)) return null;
  const r = await db.prepare(HIDDEN_SINCE_SQL).bind(playerId).first();
  return Number.isSafeInteger(r?.since) ? r.since : null;
}

// Callers run this before deleting the sessions, since it reads their subjects.
/** @param {any} ctx @param {any} env @param {string} playerId @param {string[]|null} [only] */
export async function hiddenEnd(ctx, env, playerId, only = null) {
  const { db, subtle, nowS } = ctx;
  const hashes = only ? only.slice(0, SESSIONS_MAX) : ((await db.prepare(`SELECT token_hash FROM staff_sessions WHERE player_id = ?1 LIMIT ${SESSIONS_MAX}`).bind(playerId).all())?.results ?? []).map((r) => r.token_hash);
  const key = hashes.length ? await signingKey(env, subtle) : null;
  if (!key) return 0;
  const orders = await Promise.all(hashes.map(async (h) => mintHideOrder({ s: await hiddenSubOf(h, subtle) }, key, { subtle, nowS })));
  const push = Promise.all(orders.map((o) => pushLaw(env, (u, i) => globalThis.fetch(u, i), o)));
  if (typeof ctx.later === 'function') ctx.later(push); else await push;
  return orders.length;
}

/** @param {any} ctx @param {any} env @param {string} path @param {any} body
 * @param {{ player: any, role: string, hash: string }} who
 * @param {(act: string, target?: string|null, detail?: object|null, how?: object) => any} audit */
export async function staffHidden(ctx, env, path, body, who, audit) {
  const { db } = ctx;
  const me = who.player;
  if (path !== '/v1/staff/hide') return { error: 'body' };
  if (body.on === undefined) return { hidden: me.staff_hide_on === 1 };
  if (typeof body.on !== 'boolean') return { error: 'body' };
  const on = body.on ? 1 : 0;
  await db.batch([
    db.prepare('UPDATE players SET staff_hide_on = ?1 WHERE id = ?2').bind(on, me.id),
    audit('hide', null, { on: body.on }),
  ]);
  if (!on) await hiddenEnd(ctx, env, me.id);
  return { hidden: body.on };
}

/** @param {any} ctx @param {any} env @param {Uint8Array} bytes @param {unknown} sig */
export async function takeHiddenSeen(ctx, env, bytes, sig) {
  const { subtle, nowS } = ctx;
  const db = ctx.primary ?? ctx.db;
  const opened = await openHiddenSeen(bytes, sig, await gatePublicKey(env, subtle), { subtle, nowMs: nowS * 1000 });
  if ('error' in opened) return opened;
  const { s, r } = opened.note;
  const rows = (await db.prepare('SELECT s.token_hash AS s_hash, s.key_id AS s_key, p.* FROM staff_sessions s JOIN players p ON p.id = s.player_id LIMIT 500').all())?.results ?? [];
  let actor = null;
  for (const row of rows) if (await hiddenSubOf(row.s_hash, subtle) === s || await followSubject(row.s_hash, subtle) === s) { actor = row; break; }
  await auditStatement(db, nowS, { actor, role: actor ? staffRole(actor, env) : null, act: 'hidden-home', detail: { sub: s, room: r }, keyId: actor?.s_key ?? null, onceIn: 60 }).run();
  return { ok: true };
}
