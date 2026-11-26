// @ts-check
// Staff panel sign-in: the account password, a registered extension key (unless STAFF_BY_ACCOUNT is set), and the
// role lists asked on every request. Staff and game tokens are separate, and neither works on the other's routes.
import { verifyPassword, mintRecoveryCode, canonicalCode } from './password.js';
import { mintId, mintSecret, hashSecret, displayName, overRate, clearRate, overAccountRate } from './accounts.js';
import { isDeveloper, canModerate, handleList, developerHandles, moderatorHandles, staffSuspended, TIER_LISTS, MOD_TIERS } from './titles.js';
import { isBanned, pushLaw, staffCutOrder } from './sanctions.js';
import { staffCases, CASE_ROUTES } from './staffCases.js';
import { staffDesk, DESK_ROUTES } from './staffDesk.js';
import { staffPlayers, PLAYER_ROUTES } from './staffPlayers.js';
import { staffPanelDesk, PANEL_ROUTES } from './staffPanelDesk.js';
import { staffStatus, STATUS_ROUTES } from './staffStatus.js';
import { staffRealm, REALM_ROUTES } from './staffRealm.js';
import { staffCensus, CENSUS_ROUTES } from './staffCensus.js';
import { staffEconomy, ECON_ROUTES } from './staffEconomy.js';
import { staffFollow, FOLLOW_ROUTES } from './staffFollow.js';
import { staffMessage, MESSAGE_ROUTES } from './staffMessage.js';
import { staffEvents, EVENT_ROUTES, EVENT_STATUS } from './staffEvents.js';
import { staffNet, NET_ROUTES } from './staffNet.js';
import { staffMonsters, MONSTER_ROUTES } from './staffMonsters.js';
import { staffReactions, REACTION_ROUTES } from './staffReactions.js';
import { staffHidden, HIDDEN_ROUTES, hiddenEnd, hiddenSubOf } from './staffHidden.js';
import { signingKey } from './signing.js';
import { mintHideOrder, ID_RE } from '../../src/net/identityToken.js';
import { staffData, DATA_ROUTES } from './staffData.js';
import { staffSkins, STAFF_SKIN_ROUTES } from './skins.js';
import { staffFreeze, FREEZE_ROUTES, FREEZE_STATUS } from './staffFreeze.js';

export const STAFF_SESSION_HEADER = 'x-staff-session';
export const STAFF_IDLE_S = 30 * 60;
export const STAFF_MAX_S = 8 * 60 * 60;
export const CUT_HIDDEN_S = 24 * 60 * 60;
const CUT_SUBS_MAX = 50;
export const STAFF_TOUCH_S = 60;
export const STAFF_SIG_S = 5 * 60;
export const STAFF_KEYS_MAX = 5;
export const STAFF_INVITE_S = 24 * 60 * 60;
export const STAFF_IP_MAX = 30;
export const STAFF_TRY_MAX = 5;
export const STAFF_TRY_WINDOW_S = 15 * 60;
export const STAFF_RATE_MAX = 120;
export const STAFF_AUDIT_PAGE = 100;
export const STAFF_AUDIT_KEEP_S = 30 * 24 * 60 * 60;
export const STAFF_READ_ROW_S = 10 * 60;

export const staffWords = (/** @type {'login'|'enroll'} */ what, /** @type {string} */ lc, /** @type {number} */ ts) => `dfo-staff:v1:${what}:${lc}:${ts}`;

export const STAFF_STATUS = Object.freeze({
  'staff-login': 401, 'staff-session': 401, 'staff-owner': 403, 'staff-admin': 403, 'no-staff': 404, 'no-key': 404, 'no-player': 404,
  'staff-self': 409, 'staff-keys-full': 409, 'staff-already': 409, 'staff-banned': 409, 'staff-config': 409, 'rate': 429, 'body': 400,
  'staff-claimed': 409, 'staff-one-case': 409, 'no-case': 404, 'not-moderator': 403, protected: 403, ambiguous: 409, 'bad-minutes': 400,
  'bad-days': 400, 'not-banned': 409, 'not-found': 404,
  'watch-full': 409, 'not-watched': 404, 'no-note': 404, 'note-text': 400, 'settings-bad': 400, 'bad-act': 400, 'bad-notice-days': 400, 'board-rid': 400,
  'rename-bad': 400, 'rename-same': 409, 'rename-listed': 409, 'rename-taken': 409, 'rename-moved': 409, 'no-handle': 409, 'no-character': 404,
  'not-developer': 403, 'no-realm-character': 404, 'no-clean': 409, 'service-moved': 409, dead: 409, 'repair-no-faction': 409, 'repair-not-set': 409,
  seq: 409, 'mend-not-negative': 409, 'mend-moved': 409, 'repair-ticket': 409, 'no-data': 409, 'no-storage': 503, 'market-gone': 409, 'bad-listing': 400,
  'staff-note': 400, 'staff-reason': 400, 'staff-remove-pending': 409, 'staff-no-piece': 409, 'staff-trail': 409, 'staff-evidence': 404, 'staff-evidence-gone': 409,
  'no-dupes': 409, 'bad-query': 400, 'staff-data': 500, 'skin-bad': 400, 'skin-gone': 404, 'skin-disabled': 403,
  'bank-none': 409, 'bank-moved': 409,
  'letter-member': 409, 'letter-quest': 409, 'letter-pending': 409, 'letter-none': 409,
  'staff-item-template': 400, 'staff-item-enchant': 400, 'staff-item-unlawful': 409,
  'no-piece': 404, 'census-no-tally': 400,
  'case-acted': 409, 'case-closed': 409, 'admin-sanction': 403, 'bad-click': 400, 'staff-suspended': 409,
  'no-signing-key': 503,
  'staff-session-lapsed': 409,
  'staff-message-long': 400, 'staff-message-rate': 429,
  'flag-failed': 500,
  ...EVENT_STATUS,
  ...FREEZE_STATUS,
});

const enc = new TextEncoder();
const unb64 = (/** @type {unknown} */ s) => {
  if (typeof s !== 'string' || !/^[\w-]+$/.test(s)) return null;
  try { return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)); } catch { return null; }
};

/**
 * @param {any} player
 * @param {any} env
 */
export function staffRole(player, env) {
  if (typeof player?.handle !== 'string' || !player.handle) return null;
  if (isDeveloper(player, env)) return 'admin';
  return canModerate(player, env) ? 'moderator' : null;
}
/**
 * @param {any} player
 * @param {any} env
 */
export const isOwner = (player, env) => !!staffRole(player, env) && handleList(env?.OWNER_HANDLES).has(String(player.handle).toLowerCase());

/** @param {any} env */
export function ownerKeys(env) {
  const out = new Map();
  for (const pair of String(env?.OWNER_KEYS ?? '').split(',')) {
    const [h, k] = pair.split(':').map((x) => x.trim());
    if (h && k) out.set(h.toLowerCase(), k);
  }
  return out;
}
/**
 * @param {any} player
 * @param {any} env
 * @param {unknown} pub
 */
export const configKey = (player, env, pub) => typeof pub === 'string' && isOwner(player, env) && ownerKeys(env).get(String(player.handle).toLowerCase()) === pub;

/** @param {any} env */
function staffHandles(env) {
  const all = new Set([...developerHandles(env), ...moderatorHandles(env)]);
  for (const t of MOD_TIERS) for (const h of handleList(env?.[TIER_LISTS[/** @type {keyof typeof TIER_LISTS} */ (t)]])) all.add(h);
  return [...all];
}

/**
 * @param {any} db
 * @param {number} nowS
 * @param {{ actor?: any, role?: string|null, act: string, target?: string|null, detail?: object|null, keyId?: string|null, outcome?: 'ok'|'denied'|'failed', okIf?: { sql: string, args: unknown[] }|null, onceIn?: number }} row
 */
export const auditStatement = (db, nowS, { actor = null, role = null, act, target = null, detail = null, keyId = null, outcome = 'ok', okIf = null, onceIn = 0 }) => {
  const said = detail ? JSON.stringify(detail) : null;
  return db.prepare(`INSERT INTO staff_audit (at, actor, actor_name, role, act, target, detail, key_id, outcome) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ${okIf ? `CASE WHEN ${okIf.sql} THEN 'ok' ELSE 'failed' END` : '?'}${onceIn ? ' WHERE NOT EXISTS (SELECT 1 FROM staff_audit WHERE actor = ? AND act = ? AND target IS ? AND detail IS ? AND at > ?)' : ''}`)
    .bind(nowS, actor?.id ?? null, actor ? displayName(actor) : null, role, act, target, said, keyId,
      ...(okIf ? okIf.args : [outcome]), ...(onceIn ? [actor?.id ?? null, act, target, said, nowS - onceIn] : []));
};

/** @param {unknown} h */
const handleLc = (h) => (typeof h === 'string' ? h.trim().toLowerCase().slice(0, 64) : '');

/**
 * @param {SubtleCrypto} subtle
 * @param {any} body
 * @param {'login'|'enroll'} what
 * @param {string} lc
 * @param {number} nowS
 */
async function signed(subtle, body, what, lc, nowS) {
  const pub = unb64(body.pub); const sig = unb64(body.sig);
  if (pub?.length !== 32 || sig?.length !== 64 || !Number.isSafeInteger(body.ts) || Math.abs(body.ts - nowS) > STAFF_SIG_S) return false;
  try {
    const key = await subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    return await subtle.verify({ name: 'Ed25519' }, key, sig, enc.encode(staffWords(what, lc, body.ts)));
  } catch { return false; }
}

/**
 * @param {any} ctx
 * @param {any} env
 * @param {any} body
 * @param {string} ip
 */
async function passwordStep(ctx, env, body, ip) {
  const { db, subtle } = ctx;
  const lc = handleLc(body.handle);
  if (await overRate(ctx, `staffip:${ip}`, STAFF_IP_MAX, STAFF_TRY_WINDOW_S)) return { error: 'rate' };
  // Tries are keyed per address and per handle from one address, never per handle alone, which anyone can exhaust.
  if (lc && await overRate(ctx, `stafftry:${lc}:${ip}`, STAFF_TRY_MAX, STAFF_TRY_WINDOW_S)) return { error: 'rate' };
  const player = lc ? await db.prepare('SELECT * FROM players WHERE handle_lc = ?').bind(lc).first() : null;
  const ok = await verifyPassword(body.password, player?.password ?? null, { subtle });
  return { player, role: staffRole(player, env), lc, ok };
}

async function refused(/** @type {any} */ ctx, /** @type {any} */ player, /** @type {string|null} */ role, /** @type {string|null} */ why) {
  if (why) {
    const write = auditStatement(ctx.db, ctx.nowS, { actor: player, role, act: 'login-refused', detail: { why }, outcome: 'denied' }).run();
    // Written after the answer: awaiting it would make a right password slower than a wrong one.
    if (typeof ctx.later === 'function') ctx.later(write.catch(() => {})); else await write;
  }
  return { error: 'staff-login' };
}

export async function staffLogin(ctx, env, /** @type {any} */ body, /** @type {string} */ ip) {
  const p = await passwordStep(ctx, env, body, ip);
  if ('error' in p) return p;
  const { player, role, lc, ok } = p;
  if (!player || !role) return { error: 'staff-login' };
  const { db, rand, nowS } = ctx;
  if (accountSignIn(env) && typeof body.pub !== 'string') {
    if (!ok) return refused(ctx, player, role, null);
    if (isBanned(player, nowS)) return refused(ctx, player, role, 'banned');
    await clearRate(ctx, `stafftry:${lc}:${ip}`);
    return openStaff(ctx, env, player, role, { keyId: ACCOUNT_KEY, act: 'login' });
  }
  const any = typeof body.pub === 'string' ? await db.prepare('SELECT * FROM staff_keys WHERE pub = ?').bind(body.pub).first() : null;
  const inConfig = configKey(player, env, body.pub);
  let row = any && !any.revoked_at && any.player_id === player.id && any.handle_lc === lc && (!any.cfg || inConfig) ? any : null;
  const fromConfig = !any && inConfig;
  const keyOk = (!!row || fromConfig) && await signed(ctx.subtle, body, 'login', lc, nowS);
  if (!ok || !keyOk) return refused(ctx, player, role, ok === keyOk ? null : ok ? 'key' : 'password');
  if (isBanned(player, nowS)) return refused(ctx, player, role, 'banned');
  if (fromConfig) {
    await db.prepare(`INSERT INTO staff_keys (id, player_id, handle_lc, pub, label, created_at, last_ts, cfg) VALUES (?, ?, ?, ?, 'owner key (config)', ?, 0, 1)
      ON CONFLICT(pub) DO NOTHING`).bind(mintId(rand), player.id, lc, body.pub, nowS).run();
    row = await db.prepare('SELECT * FROM staff_keys WHERE pub = ? AND player_id = ? AND handle_lc = ? AND revoked_at IS NULL').bind(body.pub, player.id, lc).first();
    if (!row) return refused(ctx, player, role, 'key');
  }
  // The signature's second is taken in the statement that checks it is newer, so a replay or a race gets in once.
  const took = await db.prepare('UPDATE staff_keys SET last_ts = ?, last_used = ? WHERE id = ? AND last_ts < ?').bind(body.ts, nowS, row.id, body.ts).run();
  if (!took.meta.changes) return refused(ctx, player, role, 'replayed');
  await clearRate(ctx, `stafftry:${lc}:${ip}`);
  return openStaff(ctx, env, player, role, { keyId: row.id, act: 'login' });
}

export async function staffEnroll(ctx, env, /** @type {any} */ body, /** @type {string} */ ip) {
  const p = await passwordStep(ctx, env, body, ip);
  if ('error' in p) return p;
  const { player, role, lc, ok } = p;
  if (!player || !role) return { error: 'staff-login' };
  const { db, rand, subtle, nowS } = ctx;
  const canon = canonicalCode(body.invite);
  const invite = canon ? await db.prepare('SELECT * FROM staff_invites WHERE code_hash = ? AND player_id = ? AND expires_at > ?')
    .bind(await hashSecret(canon, { subtle }), player.id, nowS).first() : null;
  const keyOk = await signed(subtle, body, 'enroll', lc, nowS);
  if (!ok || !invite || !keyOk) return refused(ctx, player, role, ok && invite ? 'key' : ok ? 'invite' : invite ? 'password' : null);
  if (isBanned(player, nowS)) return refused(ctx, player, role, 'banned');
  const held = await db.prepare('SELECT COUNT(*) AS n FROM staff_keys WHERE player_id = ? AND revoked_at IS NULL').bind(player.id).first();
  if ((held?.n ?? 0) >= STAFF_KEYS_MAX) return { error: 'staff-keys-full' };
  // The invite is spent before the key is registered, so two enrolments on one invite register one key.
  const spent = await db.prepare('DELETE FROM staff_invites WHERE code_hash = ? AND player_id = ? AND expires_at > ?').bind(invite.code_hash, player.id, nowS).run();
  if (!spent.meta.changes) return refused(ctx, player, role, 'invite-spent');
  const keyId = mintId(rand);
  const made = await db.prepare(`INSERT INTO staff_keys (id, player_id, handle_lc, pub, label, created_at, last_ts, last_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pub) DO NOTHING`).bind(keyId, player.id, lc, body.pub, typeof body.label === 'string' ? body.label.slice(0, 64) : null, nowS, body.ts, nowS).run();
  if (!made.meta.changes) return refused(ctx, player, role, 'key-taken');
  await clearRate(ctx, `stafftry:${lc}:${ip}`);
  return openStaff(ctx, env, player, role, { keyId, act: 'enrolled', detail: { by: invite.by_id } });
}

async function openStaff(/** @type {any} */ ctx, /** @type {any} */ env, /** @type {any} */ player, /** @type {string} */ role,
  /** @type {{ keyId: string, act: string, detail?: object|null }} */ { keyId, act, detail = null }) {
  const { db, subtle, rand, nowS } = ctx;
  const token = mintSecret(rand);
  await db.batch([
    db.prepare('DELETE FROM staff_sessions WHERE player_id = ? AND (expires_at <= ? OR last_act <= ?)').bind(player.id, nowS, nowS - STAFF_IDLE_S),
    db.prepare('INSERT INTO staff_sessions (token_hash, player_id, key_id, created_at, last_act, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await hashSecret(token, { subtle }), player.id, keyId, nowS, nowS, nowS + STAFF_MAX_S),
    auditStatement(db, nowS, { actor: player, role, act, detail, keyId }),
  ]);
  return { session: token, role, handle: player.handle, owner: isOwner(player, env), idleS: STAFF_IDLE_S, expiresAt: nowS + STAFF_MAX_S, keyId };
}

export const ACCOUNT_KEY = 'account';
export const accountSignIn = (/** @type {any} */ env) => env?.STAFF_BY_ACCOUNT === '1';

const STAFF_WHO_SQL = `SELECT s.key_id AS s_key, s.last_act AS s_act, s.expires_at AS s_expires, k.handle_lc AS k_handle, k.cfg AS k_cfg, k.pub AS k_pub, p.*
  FROM staff_sessions s JOIN players p ON p.id = s.player_id LEFT JOIN staff_keys k ON k.id = s.key_id AND k.player_id = s.player_id AND k.revoked_at IS NULL
  WHERE s.token_hash = ?`;

/**
 * @param {any} ctx
 * @param {any} env
 * @param {string} playerId
 * @param {string[]} hashes
 * @param {boolean} [cut]
 */
async function cutPush(ctx, env, playerId, hashes, cut = true) {
  const { db, subtle } = ctx;
  // Orders use the clock read after the batch, so a token minted while the request ran is no newer than them.
  const at = Math.max(ctx.nowS, Math.floor(Date.now() / 1000));
  const minted = (await db.prepare(`SELECT json_extract(detail, '$.sub') AS sub, MAX(at) AS t FROM staff_audit WHERE actor = ?1 AND act IN ('hidden-token', 'follow', 'follow-home') AND at > ?2
    GROUP BY sub ORDER BY t DESC LIMIT ?3`).bind(playerId, at - CUT_HIDDEN_S, CUT_SUBS_MAX).all())?.results ?? [];
  const subs = [...new Set([...(await Promise.all(hashes.map((h) => hiddenSubOf(h, subtle)))), ...minted.map((r) => r.sub)])].filter((x) => typeof x === 'string' && ID_RE.test(x));
  const key = await signingKey(env, subtle);
  const orders = [...(key ? await Promise.all(subs.map((x) => mintHideOrder({ s: x }, key, { subtle, nowS: at }))) : []), ...(cut ? [await staffCutOrder(env, subtle, at, playerId)] : [])];
  const took = await Promise.all(orders.map((o) => pushLaw(env, (u, i) => globalThis.fetch(u, i), o)));
  return { orders: orders.length, took: took.filter(Boolean).length, hidden: subs.length };
}

/**
 * @param {any} db
 * @param {string} playerId
 */
const sessionHashes = async (db, playerId) => ((await db.prepare('SELECT token_hash FROM staff_sessions WHERE player_id = ? LIMIT 20').bind(playerId).all())?.results ?? []).map((r) => r.token_hash);

/**
 * @param {any} ctx
 * @param {any} env
 * @param {unknown} token
 */
export async function staffSession(ctx, env, token, { act = true } = {}) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) return null;
  const { db, subtle, nowS } = ctx;
  const hash = await hashSecret(token, { subtle });
  const [row] = await Promise.all([db.prepare(STAFF_WHO_SQL).bind(hash).first(),
    act && db.prepare('UPDATE staff_sessions SET last_act = ?1 WHERE token_hash = ?2 AND last_act <= ?3 AND last_act > ?4 AND expires_at > ?1')
      .bind(nowS, hash, nowS - STAFF_TOUCH_S, nowS - STAFF_IDLE_S).run()]);
  if (!row) return null;
  const role = staffRole(row, env);
  if (!role || row.s_expires <= nowS || row.s_act + STAFF_IDLE_S <= nowS || !(row.s_key === ACCOUNT_KEY ? accountSignIn(env) : (row.k_handle && row.k_handle === row.handle_lc && !(row.k_cfg && !configKey(row, env, row.k_pub)))) || isBanned(row, nowS)) {
    await db.prepare('DELETE FROM staff_sessions WHERE token_hash = ?').bind(hash).run();
    return null;
  }
  const lastAct = act && nowS - row.s_act >= STAFF_TOUCH_S ? nowS : row.s_act;
  return { player: row, role, owner: isOwner(row, env), hash, keyId: row.s_key, idleAt: lastAct + STAFF_IDLE_S, expiresAt: row.s_expires };
}

/**
 * @param {any} ctx
 * @param {any} env
 * @param {string} path
 * @param {any} body
 * @param {{ ip: string, token: string|null }} req
 */
export async function staffRoute(ctx, env, path, body, { ip, token }) {
  if (path === '/v1/staff/login') return staffLogin(ctx, env, body, ip);
  if (path === '/v1/staff/enroll') return staffEnroll(ctx, env, body, ip);
  const who = await staffSession(ctx, env, token, { act: body.poll !== true });
  if (!who) return { error: 'staff-session' };
  const { db, rand, subtle, nowS } = ctx;
  const me = who.player;
  if (overAccountRate(`staff:${me.id}`, nowS, STAFF_RATE_MAX, 60)) return { error: 'rate' };
  const audit = (/** @type {string} */ act, /** @type {string|null} */ target = null, /** @type {object|null} */ detail = null, /** @type {{ outcome?: 'ok'|'denied'|'failed', okIf?: { sql: string, args: unknown[] }, onceIn?: number }} */ how = {}) =>
    auditStatement(db, nowS, { actor: me, role: who.role, act, target, detail, keyId: who.keyId, ...how });
  const denied = async (/** @type {string} */ error) => { await audit('refused', null, { path, need: error === 'staff-admin' ? 'admin' : 'owner' }, { outcome: 'denied' }).run(); return { error }; };

  if (path === '/v1/staff/me') {
    return { handle: me.handle, role: who.role, owner: who.owner, idleS: STAFF_IDLE_S, idleAt: who.idleAt, expiresAt: who.expiresAt, keyId: who.keyId };
  }
  if (path === '/v1/staff/logout') {
    const all = body.all === true;
    await hiddenEnd(ctx, env, me.id, all ? null : [who.hash]);
    await db.batch([
      all ? db.prepare('DELETE FROM staff_sessions WHERE player_id = ?').bind(me.id) : db.prepare('DELETE FROM staff_sessions WHERE token_hash = ?').bind(who.hash),
      audit('logout', null, all ? { all } : { all, sub: await hiddenSubOf(who.hash, subtle) }),
    ]);
    return { ok: true, all };
  }
  if (path === '/v1/staff/keys') {
    const r = await db.prepare('SELECT id, label, created_at, last_used FROM staff_keys WHERE player_id = ? AND revoked_at IS NULL ORDER BY last_used DESC').bind(me.id).all();
    return { keys: (r.results ?? []).map((k) => ({ id: k.id, label: k.label, createdAt: k.created_at, lastUsed: k.last_used, current: k.id === who.keyId })) };
  }
  if (path === '/v1/staff/key/forget') {
    if (typeof body.id !== 'string') return { error: 'body' };
    const keyed = (await db.prepare('SELECT token_hash FROM staff_sessions WHERE key_id = ? AND player_id = ?').bind(body.id, me.id).all())?.results ?? [];
    if (keyed.length) await hiddenEnd(ctx, env, me.id, keyed.map((r) => r.token_hash));
    const [, gone] = await db.batch([
      // Keys are revoked, never deleted, so a forgotten key never signs in again and its spent seconds stay spent.
      audit('key-forget', null, { id: body.id.slice(0, 40) }, { okIf: { sql: 'EXISTS (SELECT 1 FROM staff_keys WHERE id = ? AND player_id = ? AND revoked_at IS NULL)', args: [body.id, me.id] } }),
      db.prepare('UPDATE staff_keys SET revoked_at = ? WHERE id = ? AND player_id = ? AND revoked_at IS NULL').bind(nowS, body.id, me.id),
      db.prepare('DELETE FROM staff_sessions WHERE key_id = ? AND player_id = ?').bind(body.id, me.id),
    ]);
    return gone.meta.changes ? { ok: true, id: body.id } : { error: 'no-key' };
  }

  if (CASE_ROUTES.includes(path)) return staffCases(ctx, env, path, body, who, audit);
  if (DESK_ROUTES.includes(path)) return staffDesk(ctx, env, path, body, who, audit);
  if (PLAYER_ROUTES.includes(path)) return staffPlayers(ctx, env, path, body, who, audit);
  if (PANEL_ROUTES.includes(path)) return staffPanelDesk(ctx, env, path, body, who, audit);
  if (STATUS_ROUTES.includes(path)) return staffStatus(ctx, env, path, body, who, audit);
  if (REALM_ROUTES.includes(path)) return staffRealm(ctx, env, path, body, who, audit);
  if (CENSUS_ROUTES.includes(path)) return staffCensus(ctx, env, path, body, who, audit);
  if (ECON_ROUTES.includes(path)) return staffEconomy(ctx, env, path, body, who, audit);
  if (FOLLOW_ROUTES.includes(path)) return staffFollow(ctx, env, path, body, who, audit);
  if (MESSAGE_ROUTES.includes(path)) return staffMessage(ctx, env, path, body, who, audit);
  if (EVENT_ROUTES.includes(path)) return who.role === 'admin' ? staffEvents(ctx, env, path, body, who, audit) : denied('staff-admin');
  if (NET_ROUTES.includes(path)) return staffNet(ctx, env, path, body, who, audit);
  if (MONSTER_ROUTES.includes(path)) return staffMonsters(ctx, env, path, body, who, audit);
  if (REACTION_ROUTES.includes(path)) return staffReactions(ctx, env, path, body, who, audit);
  if (HIDDEN_ROUTES.includes(path)) return staffHidden(ctx, env, path, body, who, audit);
  if (STAFF_SKIN_ROUTES.includes(path)) return staffSkins(ctx, env, path, body, who, audit);
  if (DATA_ROUTES.includes(path)) return staffData(ctx, env, path, body, who, audit);
  if (FREEZE_ROUTES.includes(path)) return staffFreeze(ctx, env, path, body, who, audit);

  if (path === '/v1/staff/mods' || path === '/v1/staff/mod/add' || path === '/v1/staff/mod/remove') {
    if (who.role !== 'admin') return denied('staff-admin');
    if (path === '/v1/staff/mods') {
      const [r] = await db.batch([db.prepare('SELECT id, handle FROM players WHERE staff_mod = 1 ORDER BY handle_lc LIMIT 500'), audit('mods-read', null, null, { onceIn: STAFF_READ_ROW_S })]);
      return { mods: (r.results ?? []).map((p) => ({ id: p.id, handle: p.handle })), config: staffHandles(env).filter((h) => !developerHandles(env).has(h)) };
    }
    const lc = handleLc(body.handle);
    const target = lc ? await db.prepare('SELECT * FROM players WHERE handle_lc = ?').bind(lc).first() : null;
    if (!target?.handle) return { error: 'no-player' };
    if (path === '/v1/staff/mod/add') {
      if (staffRole(target, env)) return { error: 'staff-already' };
      if (staffSuspended(target)) return { error: 'staff-suspended' };
      if (isBanned(target, nowS)) return { error: 'staff-banned' };
      const [, set] = await db.batch([
        audit('mod-add', target.id, { handle: target.handle }, { okIf: { sql: 'EXISTS (SELECT 1 FROM players WHERE id = ? AND staff_mod = 0)', args: [target.id] } }),
        db.prepare('UPDATE players SET staff_mod = 1 WHERE id = ? AND staff_mod = 0').bind(target.id),
      ]);
      return set.meta.changes ? { ok: true, handle: target.handle } : { error: 'staff-already' };
    }
    if (target.staff_mod !== 1) return { error: staffRole(target, env) ? 'staff-config' : 'no-staff' };
    if (staffRole({ ...target, staff_mod: 0 }, env)) return { error: 'staff-config' };
    const hashes = await sessionHashes(db, target.id);
    await db.batch([
      audit('mod-remove', target.id, { handle: target.handle }, { okIf: { sql: 'EXISTS (SELECT 1 FROM players WHERE id = ? AND staff_mod = 1)', args: [target.id] } }),
      db.prepare('UPDATE players SET staff_mod = 0 WHERE id = ?').bind(target.id),
      db.prepare('UPDATE staff_keys SET revoked_at = ? WHERE player_id = ? AND revoked_at IS NULL').bind(nowS, target.id),
      ...['staff_sessions', 'staff_invites'].map((t) => db.prepare(`DELETE FROM ${t} WHERE player_id = ?`).bind(target.id)),
    ]);
    await cutPush(ctx, env, target.id, hashes, false);
    return { ok: true, handle: target.handle };
  }

  if (!who.owner) return denied('staff-owner');
  if (path === '/v1/staff/team') {
    // D1 binds at most 100 parameters per statement.
    const handles = staffHandles(env).slice(0, 90);
    const [r] = await db.batch([db.prepare(`SELECT p.*,
        (SELECT COUNT(*) FROM staff_keys k WHERE k.player_id = p.id AND k.handle_lc = p.handle_lc AND k.revoked_at IS NULL) AS keys,
        (SELECT COUNT(*) FROM staff_sessions s WHERE s.player_id = p.id AND s.expires_at > ?1 AND s.last_act > ?2) AS live,
        (SELECT MAX(expires_at) FROM staff_invites i WHERE i.player_id = p.id AND i.expires_at > ?1) AS invite_until
      FROM players p WHERE p.staff_mod = 1 OR p.handle_lc IN (${['NULL', ...handles.map((_, i) => `?${i + 3}`)].join(', ')})`)
      .bind(nowS, nowS - STAFF_IDLE_S, ...handles), audit('team-read', null, null, { onceIn: STAFF_READ_ROW_S })]);
    return {
      team: (r.results ?? []).map((p) => ({
        id: p.id, handle: p.handle, role: staffRole({ ...p, staff_suspended: 0 }, env), owner: isOwner(p, env), keys: p.keys, sessions: p.live, inviteUntil: p.invite_until ?? null,
        suspended: staffSuspended(p),
      })),
    };
  }
  if (path === '/v1/staff/invite' || path === '/v1/staff/cut') {
    const lc = handleLc(body.handle);
    const target = lc ? await db.prepare('SELECT * FROM players WHERE handle_lc = ?').bind(lc).first() : null;
    const cutOff = staffSuspended(target);
    const restore = path === '/v1/staff/invite' && cutOff;
    const role = staffRole(cutOff ? { ...target, staff_suspended: 0 } : target, env);
    if (!target || !role) return { error: 'no-staff' };
    if (path === '/v1/staff/cut') {
      if (target.id === me.id) return { error: 'staff-self' };
      const hashes = await sessionHashes(db, target.id);
      await db.batch([
        db.prepare('UPDATE staff_keys SET revoked_at = ? WHERE player_id = ? AND revoked_at IS NULL').bind(nowS, target.id),
        ...['staff_sessions', 'staff_invites', 'sessions'].map((t) => db.prepare(`DELETE FROM ${t} WHERE player_id = ?`).bind(target.id)),
        db.prepare('UPDATE players SET staff_suspended = 1 WHERE id = ?').bind(target.id),
        audit('cut', target.id, { handle: target.handle, role, ...(cutOff ? { again: true } : {}) }),
      ]);
      const pushed = await cutPush(ctx, env, target.id, hashes);
      const relay = pushed.took === pushed.orders;
      await audit('cut-relay', target.id, pushed, { outcome: relay ? 'ok' : 'failed' }).run();
      return { ok: true, handle: target.handle, relay };
    }
    const code = mintRecoveryCode(rand);
    const canon = canonicalCode(code);
    if (!canon) throw new Error('a minted invite failed to canonicalise');
    const until = nowS + STAFF_INVITE_S;
    await db.batch([
      db.prepare('DELETE FROM staff_invites WHERE player_id = ?').bind(target.id),
      db.prepare('INSERT INTO staff_invites (code_hash, player_id, by_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .bind(await hashSecret(canon, { subtle }), target.id, me.id, nowS, until),
      db.prepare('UPDATE players SET staff_suspended = 0 WHERE id = ?').bind(target.id),
      audit('invite', target.id, { handle: target.handle, role, ...(restore ? { restored: true } : {}) }),
    ]);
    return { ok: true, handle: target.handle, role, invite: code, expiresAt: until };
  }
  const str = (/** @type {unknown} */ v) => (typeof v === 'string' && v ? v.slice(0, 64) : null);
  const before = Number.isSafeInteger(body.before) && body.before > 0 ? body.before : null;
  const limit = Number.isSafeInteger(body.limit) ? Math.min(Math.max(body.limit, 1), STAFF_AUDIT_PAGE) : STAFF_AUDIT_PAGE;
  const view = { actor: str(body.actor), target: str(body.target), act: str(body.act) };
  // The page is read before its own audit row is written in the same batch, so it never lists that row.
  const [r] = await db.batch([db.prepare(`SELECT * FROM staff_audit WHERE (?1 IS NULL OR actor = ?1) AND (?2 IS NULL OR target = ?2)
    AND (?3 IS NULL OR act = ?3) AND (?4 IS NULL OR id < ?4) ORDER BY id DESC LIMIT ?5`)
    .bind(view.actor, view.target, view.act, before, limit), audit('audit-read', view.target, view, { onceIn: STAFF_READ_ROW_S })]);
  return {
    rows: (r.results ?? []).map((a) => {
      let detail = null;
      try { detail = a.detail ? JSON.parse(a.detail) : null; } catch { detail = null; }
      return { id: a.id, at: a.at, actor: a.actor, actorName: a.actor_name, role: a.role, act: a.act, target: a.target, detail, keyId: a.key_id, outcome: a.outcome };
    }),
  };
}
