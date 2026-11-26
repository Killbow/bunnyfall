// @ts-check

import { canModerate, isDeveloper } from './titles.js';
import { displayName, isMuted } from './accounts.js';
import { signingKey } from './signing.js';
import { mintOrder, mintBanOrder, mintStaffCutOrder, ID_RE } from '../../src/net/identityToken.js';
import { STRIKE_WINDOW_S, LADDER_BAN_AT, ladderMinutes, BAN_DAYS_MAX, banUntil } from '../../src/net/safety/safetyLaw.js';
import { MUTE_MAX_MIN } from '../../src/net/moderation.js';
import { SAFE_LAW_PATH } from '../../src/net/wire.js';

export const ACTION_KINDS = Object.freeze(['mute', 'unmute', 'ban', 'unban', 'dismiss']);
export const REASON_MAX = 200;
export const HISTORY_MAX = 20;
export const LAW_PUSH_MS = 2000;
export const AUTO_ACTORS = Object.freeze(['auto:reports', 'auto:review']);

/** @param {any} row */
export const bannedUntil = (row) => (Number.isSafeInteger(row?.banned_until) ? row.banned_until : 0);
/** @param {any} row @param {number} nowS */
export const isBanned = (row, nowS) => bannedUntil(row) > nowS;
/** @param {unknown} r */
export const reasonOf = (r) => (typeof r === 'string' && r.trim() ? r.replace(/\s+/g, ' ').trim().slice(0, REASON_MAX) : null);

/**
 * @param {any} db
 * @param {{ target: string, kind: string, until?: number|null, reason?: string|null, actor: string, actorName?: string|null, caseId?: string|null, click?: string|null, at: number }} act
 */
export const actionStatement = (db, { target, kind, until = null, reason = null, actor, actorName = null, caseId = null, click = null, at }) =>
  db.prepare('INSERT INTO mod_actions (target, kind, until, reason, actor, actor_name, case_id, at, click) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
    .bind(target, kind, until, reason, actor, actorName, caseId, at, click);

export async function strikesOf(db, target, nowS) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM mod_actions WHERE target = ?1 AND kind IN ('mute', 'ban') AND at > ?2 AND void_at IS NULL").bind(target, nowS - STRIKE_WINDOW_S).first();
  return Number(r?.n ?? 0);
}

/** @param {any} db @param {{ target?: unknown, name?: unknown }} who */
export async function findAccount(db, { target, name }) {
  if (typeof target === 'string' && ID_RE.test(target)) {
    return (await db.prepare('SELECT * FROM players WHERE id = ?1').bind(target).first()) ?? { error: 'no-player' };
  }
  if (typeof name !== 'string' || !name.trim() || name.length > 64) return { error: 'no-player' };
  const said = name.trim();
  const byHandle = await db.prepare('SELECT * FROM players WHERE handle_lc = ?1').bind(said.toLowerCase()).first();
  if (byHandle) return byHandle;
  const guests = (await db.prepare('SELECT * FROM players WHERE handle IS NULL AND guest_name = ?1 LIMIT 2').bind(said).all())?.results ?? [];
  if (guests.length > 1) return { error: 'ambiguous' };
  return guests[0] ?? { error: 'no-player' };
}

/**
 * @param {any} db @param {any} row
 * @param {{ minutes: number, actor: string, actorName?: string|null, reason?: string|null, caseId?: string|null, nowS: number }} act
 */
export async function writeMute(db, row, { minutes, actor, actorName = null, reason = null, caseId = null, nowS }) {
  const until = minutes ? nowS + minutes * 60 : null;
  await db.batch([
    db.prepare('UPDATE players SET muted_until = ?1, muted_by = ?2, mute_admin = NULL WHERE id = ?3').bind(until, until ? actor : null, row.id),
    actionStatement(db, { target: row.id, kind: until ? 'mute' : 'unmute', until, reason, actor, actorName, caseId, at: nowS }),
  ]);
  return until ?? 0;
}

/** @param {any} row @param {any} env @param {number} nowS */
export const autoMutable = (row, env, nowS) => !!row && !canModerate(row, env) && !isMuted(row, nowS) && !isBanned(row, nowS);

/**
 * @param {any} db @param {any} env @param {any} row
 * @param {{ actor: 'auto:reports'|'auto:review', reason: string, caseId: string, nowS: number }} act
 */
export async function autoMute(db, env, row, { actor, reason, caseId, nowS }) {
  if (!autoMutable(row, env, nowS)) return 0;
  return writeMute(db, row, { minutes: ladderMinutes(0), actor, actorName: actor, reason, caseId, nowS });
}

/**
 * @param {{ db: any, nowS: number, subtle: SubtleCrypto }} ctx @param {any} env
 * @param {{ caseId: string, row: any, actor: any, actorName: string }} what
 */
export async function voidAutoMutes({ db, nowS, subtle }, env, { caseId, row, actor, actorName }) {
  await db.prepare("UPDATE mod_actions SET void_at = ?2 WHERE case_id = ?1 AND kind = 'mute' AND actor IN ('auto:reports', 'auto:review') AND void_at IS NULL").bind(caseId, nowS).run();
  if (!row || !isMuted(row, nowS) || !AUTO_ACTORS.includes(row.muted_by)) return null;
  await writeMute(db, row, { minutes: 0, actor: actor.id, actorName, reason: `case ${caseId} dismissed`, caseId, nowS });
  return lawOrder(env, subtle, nowS, { s: row.id, mu: 0 });
}

/**
 * @param {{ db: any, nowS: number }} ctx @param {any} actor @param {any} env
 * @param {{ target?: unknown, name?: unknown, days?: unknown, reason?: unknown, caseId?: string|null, click?: string|null, actorName?: string|null, keepLonger?: boolean,
 *   also?: ((answer: { ok: true, target: string, name: string, until: number, reason: string|null }) => any[])|null }} ask
 */
export async function banAccount({ db, nowS }, actor, env, { target, name, days, reason, caseId = null, click = null, actorName = null, keepLonger = false, also = null }) {
  if (!canModerate(actor, env)) return { error: 'not-moderator' };
  if (!Number.isSafeInteger(days) || /** @type {number} */ (days) < 0 || /** @type {number} */ (days) > BAN_DAYS_MAX) return { error: 'bad-days' };
  const row = await findAccount(db, { target, name });
  if ('error' in row) return row;
  if (row.id === actor.id || canModerate(row, env)) return { error: 'protected' };
  const asked = banUntil(/** @type {number} */ (days), nowS);
  const until = keepLonger && isBanned(row, nowS) ? Math.max(asked, bannedUntil(row)) : asked;
  const why = reasonOf(reason) ?? (until !== asked ? (row.ban_reason ?? null) : null);
  const adminHeld = row.ban_admin === 1 && isBanned(row, nowS);
  const admin = isDeveloper(actor, env);
  if (adminHeld && !admin && until < bannedUntil(row)) return { error: 'admin-sanction' };
  const keptOld = until !== asked;
  const done = /** @type {{ ok: true, target: string, name: string, until: number, reason: string|null }} */ ({ ok: true, target: row.id, name: displayName(row), until, reason: why });
  await db.batch([
    db.prepare(`UPDATE players SET banned_until = ?1, ban_reason = ?2, banned_by = CASE WHEN ?5 = 1 THEN banned_by ELSE ?4 END,
      ban_admin = CASE WHEN ?5 = 1 THEN ban_admin ELSE ?6 END WHERE id = ?3`).bind(until, why, row.id, actor.id, keptOld ? 1 : 0, admin || adminHeld ? 1 : 0),
    actionStatement(db, { target: row.id, kind: 'ban', until, reason: why, actor: actor.id, actorName: actorName ?? displayName(actor), caseId, click, at: nowS }),
    // The caller's `also` statements share this batch, so the ban, its record, and the case close land together.
    ...(also ? also(done) : []),
  ]);
  return done;
}

/**
 * @param {{ db: any, nowS: number }} ctx @param {any} actor @param {any} env
 * @param {{ target?: unknown, name?: unknown, actorName?: string|null }} ask
 */
export async function unbanAccount({ db, nowS }, actor, env, { target, name, actorName = null }) {
  if (!canModerate(actor, env)) return { error: 'not-moderator' };
  const row = await findAccount(db, { target, name });
  if ('error' in row) return row;
  if (!isBanned(row, nowS)) return { error: 'not-banned' };
  if (row.ban_admin === 1 && !isDeveloper(actor, env)) return { error: 'admin-sanction' };
  await db.batch([
    db.prepare('UPDATE players SET banned_until = NULL, ban_reason = NULL, banned_by = NULL, ban_admin = NULL WHERE id = ?1').bind(row.id),
    actionStatement(db, { target: row.id, kind: 'unban', actor: actor.id, actorName: actorName ?? displayName(actor), at: nowS }),
  ]);
  return { ok: true, target: row.id, name: displayName(row), until: 0 };
}

/**
 * @param {{ db: any, nowS: number }} ctx @param {any} actor @param {any} env
 * @param {{ target?: unknown, name?: unknown, row?: any }} who
 */
export async function strikesLook({ db, nowS }, actor, env, { target, name, row: found = null }) {
  if (!canModerate(actor, env)) return { error: 'not-moderator' };
  const row = found ?? await findAccount(db, { target, name });
  if ('error' in row) return row;
  const [strikes, acts] = await Promise.all([strikesOf(db, row.id, nowS),
    db.prepare('SELECT kind, until, reason, actor_name, case_id, at, void_at FROM mod_actions WHERE target = ?1 ORDER BY at DESC, id DESC LIMIT ?2').bind(row.id, HISTORY_MAX).all().then((/** @type {any} */ r) => r?.results ?? [])]);
  return {
    ok: true, target: row.id, name: displayName(row), strikes,
    next: strikes >= LADDER_BAN_AT ? 'ban' : ladderMinutes(strikes),
    mutedUntil: isMuted(row, nowS) ? row.muted_until : 0,
    bannedUntil: isBanned(row, nowS) ? row.banned_until : 0,
    banReason: isBanned(row, nowS) ? (row.ban_reason ?? null) : null,
    history: acts.map((a) => ({ kind: a.kind, until: a.until ?? 0, reason: a.reason ?? null, by: a.actor_name ?? null, case: a.case_id ?? null, at: a.at, ...(a.void_at ? { voided: true } : {}) })),
  };
}

/** @param {unknown} m */
export const muteMinutesOk = (m) => Number.isSafeInteger(m) && /** @type {number} */ (m) >= 0 && /** @type {number} */ (m) <= MUTE_MAX_MIN;

/**
 * @param {any} env @param {SubtleCrypto} subtle @param {number} nowS
 * @param {{ s: string, mu?: number, bn?: number }} what
 */
export async function lawOrder(env, subtle, nowS, { s, mu, bn }) {
  const key = await signingKey(env, subtle);
  if (!key) return null;
  return bn !== undefined ? mintBanOrder({ s, bn }, key, { subtle, nowS }) : mintOrder({ s, mu: mu ?? 0 }, key, { subtle, nowS });
}

/**
 * @param {any} env @param {(url: string, init: any) => Promise<Response>} fetchFn @param {string|null} order
 * @param {((said: any) => void)|null} [hear] @param {((said: any) => void)|null} [refused]
 */
export async function pushLaw(env, fetchFn, order, hear = null, refused = null) {
  const url = env?.RELAY_LAW_URL;
  if (!order || typeof url !== 'string' || !url.startsWith('https://') || !url.endsWith(SAFE_LAW_PATH)) return false;
  // A push never retries: the stored row is the truth, and the order reaches the target on its next connection.
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order }), signal: AbortSignal.timeout(LAW_PUSH_MS) };
  try {
    // The RELAY binding is preferred, because a Worker that fetches another workers.dev address on the same account
    // can be refused with error 1042.
    const res = typeof env.RELAY?.fetch === 'function' ? await env.RELAY.fetch(new Request(url, init)) : await fetchFn(url, init);
    const said = await res.json().catch(() => null);
    if (!res.ok || said?.ok === false) { console.warn('[safety] the relay\'s door said', res.status, said?.error ?? ''); if (said) refused?.(said); }
    else hear?.(said);
    return res.ok && said?.ok !== false;
  } catch (e) { console.warn('[safety] the relay\'s door', /** @type {any} */ (e)?.message ?? e); return false; }
}

/** @param {any} env @param {SubtleCrypto} subtle @param {number} nowS @param {string} s */
export async function staffCutOrder(env, subtle, nowS, s) {
  const key = await signingKey(env, subtle);
  return key ? mintStaffCutOrder({ s }, key, { subtle, nowS }) : null;
}
