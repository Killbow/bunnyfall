// @ts-check

import { guestName, isHandleShaped, isGuestShaped } from './guestName.js';
import { handleLooksLikeEmail } from '../../src/net/handleShape.js';
import { NAME_MAX } from '../../src/net/wire.js';
import { checkName } from '../../src/net/nameFilter.js';
import { wardrobeOf, equipRefusal, canModerate, isDeveloper, auraRefusal, glyphRefusal, glyphsHidden, iconRefusal } from './titles.js';
import { brokerRidOk, brokerSaleOf, brokerSaleWrite, brokerRidFreeSql } from './brokerSales.js';
import { insigniaById, insigniaHeld } from '../../src/net/insignia.js';
import { ID_RE, nameIsIssuable } from '../../src/net/identityToken.js';
import { PLAY_GRACE_S } from '../../src/net/playClock.js';
import { MUTE_MAX_MIN } from '../../src/net/moderation.js';
import { verifyReceipt } from '../../src/net/gateReceipt.js';
import { verifyDuelReceipt } from '../../src/net/duelReceipt.js';
import { TERMS_VERSION, PRIVACY_VERSION, LEGAL_VERSION_RE, LEGAL_REQUIRED } from '../../src/net/legalLaw.js';
import {
  hashPassword, verifyPassword, needsRehash, passwordRefusal,
  mintRecoveryCode, codeForHashing,
  mintRecoverySet, hashRecoverySet, joinRecoverySet, matchRecoveryCode, recoveryLeft,
} from './password.js';
import { seatRegionOk } from '../../src/net/townSeatLaw.js';
import { DB_ANY, DB_ROOT } from './service.js';

export const SECRET_BYTES = 32;
export const SESSION_IDLE_S = 365 * 24 * 60 * 60;
export const SESSION_TOUCH_S = 60 * 60;

const b64url = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function mintId(rand) {
  const b = new Uint8Array(18);
  rand(b);
  const id = b64url(b);
  if (!ID_RE.test(id)) throw new Error('mintId produced an id outside the shape every end agrees on');
  return id;
}

export function mintSecret(rand) {
  const b = new Uint8Array(SECRET_BYTES);
  rand(b);
  return b64url(b);
}

export async function hashSecret(secret, { subtle }) {
  const d = await subtle.digest('SHA-256', new TextEncoder().encode(String(secret ?? '')));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** @param {{handle?: string|null, guest_name?: string|null}} row */
export function displayName(row) {
  const handle = row?.handle;
  if (typeof handle === 'string' && handle.length > 0 && !handleLooksLikeEmail(handle)) return handle;
  return String(row?.guest_name ?? '');
}

export function accountKind(row) {
  return row?.handle ? 'linked' : 'guest';
}

export const NAME_AS = Object.freeze(['account', 'character']);
export const nameAsOf = (/** @type {any} */ row) => (row?.name_as === 'character' ? 'character' : 'account');

/** @param {unknown} name @returns {{ why: 'email'|'long'|'refused'|'letters', word?: string } | null} */
export function wornNameRefusal(name) {
  const s = typeof name === 'string' ? name : '';
  if (handleLooksLikeEmail(s)) return { why: 'email' };
  if (nameIsIssuable(s)) return null;
  if (s.length > NAME_MAX) return { why: 'long' };
  const verdict = checkName(s);
  if (!verdict.ok && verdict.kind !== 'empty') return { why: 'refused', word: verdict.word };
  return { why: 'letters' };
}

/** @param {{db: any}} ctx @param {any} player @param {unknown} character
 *  @returns {Promise<{ name: string, why?: string, word?: string }>} */
export async function wornNameOf({ db }, player, character) {
  const account = displayName(player);
  if (nameAsOf(player) !== 'character' || typeof character !== 'string' || !character) return { name: account };
  const refused = wornNameRefusal(character);
  if (refused) return { name: account, ...refused };
  if (isHandleShaped(character)) {
    const other = await db.prepare('SELECT 1 AS taken FROM players WHERE handle_lc = ? AND id != ?').bind(character.toLowerCase(), player.id).first();
    if (other) return { name: account, why: 'taken' };
  }
  return { name: character };
}

/** @param {{db: any, nowS: number}} ctx @param {any} player @param {unknown} as */
export async function chooseNameAs({ db, nowS }, player, as) {
  if (!NAME_AS.includes(/** @type {any} */ (as))) return { error: 'no-name-as' };
  await db.prepare('UPDATE players SET name_as = ?, last_seen = ? WHERE id = ?').bind(as === 'character' ? 'character' : null, nowS, player.id).run();
  return { ok: true, nameAs: as };
}

/** @param {{db: any, subtle: SubtleCrypto, rand: (b: Uint8Array) => void, nowS: number}} env
 *  @param {{deviceLabel?: string|null, legal?: {terms: string, privacy: string}|null}} [opts] */
export async function createGuest({ db, subtle, rand, nowS }, { deviceLabel = null, legal = null } = {}) {
  if (!Number.isSafeInteger(nowS)) throw new TypeError('createGuest needs an integer epoch-seconds clock');
  const id = mintId(rand);
  const name = guestName(rand);
  if (!nameIsIssuable(name) || !isGuestShaped(name)) throw new Error(`guestName produced an unusable name: ${name}`);
  await db.prepare('INSERT INTO players (id, handle, handle_lc, guest_name, created_at, last_seen, terms_version, privacy_version, legal_accepted_at) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?)')
    .bind(id, name, nowS, nowS, ...legalColumns(legal, nowS)).run();
  const session = await openSession({ db, subtle, rand, nowS }, id, deviceLabel);
  return { id, name, kind: 'guest', ...session };
}

// The INSERT checks `guard`, so no session outlives a concurrent recovery's sign-out.
export async function openSession({ db, subtle, rand, nowS }, playerId, deviceLabel = null, guard = null) {
  const secret = mintSecret(rand);
  const sessionId = mintId(rand);
  const hash = await hashSecret(secret, { subtle });
  const label = typeof deviceLabel === 'string' ? deviceLabel.slice(0, 64) : null;
  const into = 'INSERT INTO sessions (id, player_id, secret_hash, device_label, created_at, last_seen)';
  if (!guard) {
    await db.prepare(`${into} VALUES (?, ?, ?, ?, ?, ?)`).bind(sessionId, playerId, hash, label, nowS, nowS).run();
    return { sessionId, secret };
  }
  const stands = guard.session != null
    ? db.prepare(`${into} SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ? AND player_id = ?)`).bind(sessionId, playerId, hash, label, nowS, nowS, guard.session, playerId)
    : db.prepare(`${into} SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM players WHERE id = ? AND password = ?)`).bind(sessionId, playerId, hash, label, nowS, nowS, playerId, guard.password ?? null);
  const wrote = await stands.run();
  return wrote?.meta?.changes ? { sessionId, secret } : null;
}

export const SESSION_COLUMNS = Object.freeze(['id', 'player_id', 'secret_hash', 'device_label', 'created_at', 'last_seen']);
const WHO_SQL = `SELECT ${SESSION_COLUMNS.map((c) => `s.${c} AS "s.${c}"`).join(', ')}, p.*
  FROM sessions s LEFT JOIN players p ON p.id = s.player_id WHERE s.secret_hash = ?`;

/** @returns {Promise<{player: any, session: any}|null>} */
export async function resolveSession({ db, subtle, nowS }, secret) {
  if (typeof secret !== 'string' || secret.length < 16 || secret.length > 128) return null;
  const hash = await hashSecret(secret, { subtle });
  let row = await db.prepare(WHO_SQL).bind(hash).first();
  // A fresh session may not be on this replica yet, so a miss asks the primary before refusing.
  if (!row && db?.[DB_ANY] === true) row = await (db[DB_ROOT] ?? db).prepare(WHO_SQL).bind(hash).first();
  if (!row) return null;
  /** @type {any} */ const session = {};
  /** @type {any} */ const found = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('s.')) session[k.slice(2)] = v;
    else found[k] = v;
  }

  if (Number.isSafeInteger(nowS) && Number.isSafeInteger(session.last_seen)
      && nowS - session.last_seen > SESSION_IDLE_S) {
    try {
      await db.prepare('DELETE FROM sessions WHERE id = ?').bind(session.id).run();
    } catch {}
    return null;
  }

  const player = found.id == null ? null : found;
  if (!player) return null;

  const stale = !Number.isSafeInteger(session.last_seen) || nowS - session.last_seen >= SESSION_TOUCH_S;
  if (Number.isSafeInteger(nowS) && stale) {
    try {
      await db.batch([
        db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').bind(nowS, session.id),
        db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').bind(nowS, player.id),
      ]);
    } catch {}
  }
  return { player, session };
}

export async function closeSession({ db }, sessionId) {
  const r = await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  return { revoked: r?.meta?.changes ?? 0 };
}

export async function closeAllSessions({ db }, playerId) {
  const r = await db.prepare('DELETE FROM sessions WHERE player_id = ?').bind(playerId).run();
  return { revoked: r?.meta?.changes ?? 0 };
}

export const closeStaffSessions = ({ db }, playerId) => db.prepare('DELETE FROM staff_sessions WHERE player_id = ?').bind(playerId).run();

export async function devicesOf({ db }, playerId) {
  const r = await db.prepare('SELECT id, device_label, created_at, last_seen FROM sessions WHERE player_id = ? ORDER BY last_seen DESC LIMIT 50')
    .bind(playerId).all();
  return (r?.results ?? []).map((s) => ({
    sessionId: s.id, label: s.device_label ?? null, createdAt: s.created_at, lastSeen: s.last_seen,
  }));
}

export const mutedUntil = (row) => (Number.isSafeInteger(row?.muted_until) ? row.muted_until : 0);
export const isMuted = (row, nowS) => mutedUntil(row) > nowS;


export async function muteAccount({ db, nowS }, actor, env, { target, minutes, also = null }) {
  if (!canModerate(actor, env)) return { error: 'not-moderator' };
  if (typeof target !== 'string' || !ID_RE.test(target)) return { error: 'no-player' };
  if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > MUTE_MAX_MIN) return { error: 'bad-minutes' };
  if (target === actor.id) return { error: 'protected' };
  const row = await db.prepare('SELECT * FROM players WHERE id = ?').bind(target).first();
  if (!row) return { error: 'no-player' };
  if (canModerate(row, env)) return { error: 'protected' };
  const until = minutes ? nowS + minutes * 60 : null;
  const adminHeld = row.mute_admin === 1 && isMuted(row, nowS);
  const admin = isDeveloper(actor, env);
  if (adminHeld && !admin && (until ?? 0) < Number(row.muted_until)) return { error: 'admin-sanction' };
  const write = db.prepare('UPDATE players SET muted_until = ?, muted_by = ?, mute_admin = ? WHERE id = ?')
    .bind(until, until ? actor.id : null, until ? (admin || adminHeld ? 1 : 0) : null, target);
  const done = { ok: true, target, name: displayName(row), until: until ?? 0 };
  // Statements from `also(answer)` run in this write's batch, so they land with the mute or not at all.
  await (also ? db.batch([write, ...also(done)]) : write.run());
  return done;
}

export function accountView(player, nowS) {
  return {
    id: player.id,
    name: displayName(player),
    kind: accountKind(player),
    handle: player.handle ?? null,
    guestName: player.guest_name,
    createdAt: player.created_at,
    registeredAt: Number.isSafeInteger(player.registered_at) ? player.registered_at : null,
    playedS: Number.isSafeInteger(player.played_s) ? player.played_s : 0,
    muted: isMuted(player, nowS),
    nameAs: nameAsOf(player),
    recoveryLeft: recoveryLeft(player.recovery_hash),
  };
}

// One UPDATE credits the gap so two tabs never double-count, and `MAX` keeps a late beat from rewinding.
export async function creditPlay({ db, nowS }, playerId, sessionId = null) {
  const row = await db.prepare(
    `UPDATE players SET
       played_s = played_s + CASE
         WHEN played_at IS NOT NULL AND ?1 > played_at AND ?1 - played_at <= ?2 THEN ?1 - played_at
         ELSE 0 END,
       played_at = MAX(COALESCE(played_at, ?1), ?1)
     WHERE id = ?3 AND COALESCE(banned_until, 0) <= ?1
       AND COALESCE(frozen_until, 0) <= ?1   -- STAFF-PANEL5-FREEZE: a frozen account's beat credits nothing (a pass minted before the freeze)
       AND (?4 IS NULL OR EXISTS (SELECT 1 FROM sessions s WHERE s.id = ?4 AND s.player_id = ?3))
     RETURNING played_s`,
  ).bind(nowS, PLAY_GRACE_S, playerId, sessionId).first();
  return { playedS: Number.isSafeInteger(row?.played_s) ? row.played_s : 0 };
}

export const accountWardrobe = (player, env, nowS) => wardrobeOf(player, env, nowS);

export async function equipTitle({ db, nowS }, player, env, title) {
  const why = equipRefusal(title, player, env);
  if (why) return { error: why };
  await db.prepare('UPDATE players SET title = ?, last_seen = ? WHERE id = ?')
    .bind(title, nowS, player.id).run();
  return { ok: true, ...wardrobeOf({ ...player, title }, env, nowS) };
}

export async function equipAura({ db, nowS }, player, env, aura) {
  const why = auraRefusal(aura, player, env);
  if (why) return { error: why };
  await db.prepare('UPDATE players SET aura = ?, last_seen = ? WHERE id = ?').bind(aura, nowS, player.id).run();
  return { ok: true, ...wardrobeOf({ ...player, aura }, env, nowS) };
}

export async function equipIcon({ db, nowS }, player, env, icon) {
  const why = iconRefusal(icon, player);
  if (why) return { error: why };
  await db.prepare('UPDATE players SET icon = ?, last_seen = ? WHERE id = ?').bind(icon, nowS, player.id).run();
  return { ok: true, ...wardrobeOf({ ...player, icon }, env, nowS) };
}

export async function equipGlyph({ db, nowS }, player, env, glyph, on) {
  const why = glyphRefusal(glyph, player, env, nowS);
  if (why) return { error: why };
  const off = glyphsHidden(player, env, nowS).filter((g) => g !== glyph);
  if (!on) off.push(glyph);
  const glyphs_off = off.join(' ') || null;
  await db.prepare('UPDATE players SET glyphs_off = ?, last_seen = ? WHERE id = ?').bind(glyphs_off, nowS, player.id).run();
  return { ok: true, ...wardrobeOf({ ...player, glyphs_off }, env, nowS) };
}

export const EMBERS_EARNED_SQL = '((SELECT COALESCE(SUM(stones), 0) FROM gate_kills WHERE account = ?1) + (SELECT COALESCE(SUM(stones), 0) FROM serpent_kills WHERE account = ?1) + (SELECT COALESCE(SUM(stones), 0) FROM eg_redoubts WHERE account = ?1))';
export async function insigniaPurse({ db }, player) {
  const r = await db.prepare(`SELECT ${EMBERS_EARNED_SQL} AS n`).bind(player.id).first();
  const spent = Number.isSafeInteger(player?.insignia_spent) ? player.insignia_spent : 0;
  return Math.max(0, Number(r?.n ?? 0) - spent);
}

// One guarded UPDATE appends the id and spends the price, so two sales at once cannot spend the same stones.
/** @param {{ db: any, nowS: number }} ctx */
export async function buyInsignia({ db, nowS }, player, env, id, rid = null) {
  const offer = insigniaById(id);
  if (!offer || offer.currency === 'favor') return { error: 'no-insignia' };
  if (!player?.handle) return { error: 'guest' };
  // The request id is checked before `owned`, because a repeated press must answer with its own sale.
  if (rid !== null && !brokerRidOk(rid)) return { error: 'rid' };
  const had = rid ? await brokerSaleOf(db, player.id, rid) : null;
  if (had?.kind === 'fence') return { error: 'fenced' };
  if (had?.kind === 'insignia' && had.item === offer.id) return { ok: true, bought: offer.id, again: true, ...wardrobeOf(player, env, nowS), purse: await insigniaPurse({ db }, player) };
  if (insigniaHeld(player.insignia).includes(offer.id)) return { error: 'owned' };
  const nyx = offer.currency === 'nyx';
  const [sold] = await db.batch([
    db.prepare(
      `UPDATE players SET insignia = CASE WHEN COALESCE(insignia, '') = '' THEN ?2 ELSE insignia || ' ' || ?2 END,
         ${nyx ? 'nyx_spent = nyx_spent + ?3' : 'insignia_spent = insignia_spent + ?3'}, last_seen = ?4
       WHERE id = ?1
         AND (' ' || COALESCE(insignia, '') || ' ') NOT LIKE ('% ' || ?2 || ' %')
         AND ${nyx ? 'nyx_found - nyx_spent' : `${EMBERS_EARNED_SQL} - insignia_spent`} >= ?3${rid ? `
         AND ${brokerRidFreeSql('?1', '?5')}` : ''}
       RETURNING insignia, insignia_spent`,
    ).bind(player.id, offer.id, offer.price, nowS, ...(rid ? [rid] : [])),
    ...(rid ? [brokerSaleWrite(db, { account: player.id, rid, kind: 'insignia', item: offer.id, nowS })] : []),
  ]);
  const row = sold?.results?.[0] ?? null;
  if (!row) {
    if (rid && (await brokerSaleOf(db, player.id, rid))?.kind === 'fence') return { error: 'fenced' };
    const now = await db.prepare('SELECT * FROM players WHERE id = ?').bind(player.id).first();
    if (insigniaHeld(now?.insignia).includes(offer.id)) return { error: 'owned' };
    return { error: 'short', purse: nyx ? Math.max(0, (Number(now?.nyx_found) || 0) - (Number(now?.nyx_spent) || 0)) : await insigniaPurse({ db }, now ?? player), price: offer.price };
  }
  const after = { ...player, insignia: row.insignia, insignia_spent: row.insignia_spent };
  return { ok: true, bought: offer.id, ...wardrobeOf(after, env, nowS), purse: await insigniaPurse({ db }, after) };
}

export function handleRefusal(handle) {
  if (typeof handle !== 'string') return 'shape';
  const h = handle.trim();
  if (h !== handle) return 'shape';
  if (!isHandleShaped(h)) return 'shape';
  if (isGuestShaped(h)) return 'shape';
  if (handleLooksLikeEmail(h)) return 'email';
  if (!nameIsIssuable(h)) return 'refused';
  return null;
}

export function legalRefusal(body) {
  if (!LEGAL_REQUIRED) return null;
  const terms = body?.terms, privacy = body?.privacy;
  if (terms === TERMS_VERSION && privacy === PRIVACY_VERSION) return null;
  if (terms === undefined && privacy === undefined) return { error: 'not-found' };
  const dated = (v) => typeof v === 'string' && LEGAL_VERSION_RE.test(v);
  if (dated(terms) && dated(privacy)) return { error: 'terms-stale' };
  return { error: 'terms-unaccepted' };
}

const legalColumns = (legal, nowS) =>
  (legal && legal.terms === TERMS_VERSION && legal.privacy === PRIVACY_VERSION ? [legal.terms, legal.privacy, nowS] : [null, null, null]);

export const LOGIN_MAX = 10;
export const LOGIN_WINDOW_S = 15 * 60;

export const ACCOUNT_MAX = 240;
export const ACCOUNT_WINDOW_S = 60;

export async function overRate({ db, nowS }, key, max = LOGIN_MAX, windowS = LOGIN_WINDOW_S) {
  const start = Math.floor(nowS / windowS) * windowS;
  // RETURNING gives this caller its own count, and a past-window request counts in the open window.
  const row = await db.prepare(`INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start >= excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
      window_start = MAX(rate_limits.window_start, excluded.window_start)
    RETURNING count`).bind(key, start).first();
  return (row?.count ?? 0) > max;
}

export const ACCOUNT_RATE_KEYS = 50_000;
const accountWindowsAll = new Map();
const addressWindows = new Map();
const tableOf = (/** @type {unknown} */ id) => (typeof id === 'string' && (id.startsWith('yards:') || id.startsWith('poi:')) ? addressWindows : accountWindowsAll);
export function overAccountRate(id, nowS, max = ACCOUNT_MAX, windowS = ACCOUNT_WINDOW_S) {
  const start = Math.floor(nowS / windowS) * windowS;
  const accountWindows = tableOf(id);
  let w = accountWindows.get(id);
  if (!w || w.start < start) {
    if (!w && accountWindows.size >= ACCOUNT_RATE_KEYS) {
      for (const [k, v] of accountWindows) if (v.start < start) accountWindows.delete(k);
      if (accountWindows.size >= ACCOUNT_RATE_KEYS) accountWindows.clear();
    }
    w = { start, count: 0 };
    accountWindows.set(id, w);
  }
  w.count++;
  return w.count > max;
}
export function accountRateFull(id, nowS, max = ACCOUNT_MAX, windowS = ACCOUNT_WINDOW_S) {
  const w = tableOf(id).get(id);
  return !!w && w.start >= Math.floor(nowS / windowS) * windowS && w.count + 1 > max;
}
export const accountRateKeys = () => accountWindowsAll.size;

export async function rateFull({ db, nowS }, key, max = LOGIN_MAX, windowS = LOGIN_WINDOW_S) {
  const start = Math.floor(nowS / windowS) * windowS;
  const row = await db.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?').bind(key).first();
  return !!row && row.window_start >= start && row.count >= max;
}

export async function clearRate({ db }, key) {
  await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();
}

export async function register({ db, subtle, rand, nowS }, playerId, { handle, password, legal = null, set = false }) {
  const hRefusal = handleRefusal(handle);
  if (hRefusal) return { error: `handle-${hRefusal}` };
  const pRefusal = passwordRefusal(password);
  if (pRefusal) return { error: `password-${pRefusal}` };

  const player = await db.prepare('SELECT * FROM players WHERE id = ?').bind(playerId).first();
  if (!player) return { error: 'no-account' };
  if (player.handle) return { error: 'already-registered' };
  if (await db.prepare('SELECT 1 AS t FROM players WHERE handle_lc = ?').bind(handle.toLowerCase()).first()) return { error: 'handle-taken' };
  if (await overRate({ db, nowS }, `register:${playerId}`, 10)) return { error: 'rate' };

  const codes = set ? mintRecoverySet(rand) : [mintRecoveryCode(rand)];
  const [pw, rc] = await Promise.all([
    hashPassword(password, { subtle, rand }),
    set ? hashRecoverySet(codes, { subtle, rand }) : hashPassword(codeForHashing(codes[0]), { subtle, rand }),
  ]);
  let wrote;
  try {
    // The UPDATE's guard decides guest status, and the unique index decides whether the name is taken.
    wrote = await db.prepare('UPDATE players SET handle = ?, handle_lc = ?, password = ?, recovery_hash = ?, registered_at = ?, '
      + 'terms_version = COALESCE(?, terms_version), privacy_version = COALESCE(?, privacy_version), legal_accepted_at = COALESCE(?, legal_accepted_at) '
      + 'WHERE id = ? AND handle IS NULL')
      .bind(handle, handle.toLowerCase(), pw, rc, nowS, ...legalColumns(legal, nowS), playerId).run();
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e?.message ?? e))) return { error: 'handle-taken' };
    throw e;
  }
  if (!wrote.meta.changes) return { error: 'already-registered' };
  return set ? { recoveryCodes: codes, handle } : { recoveryCode: codes[0], handle };
}

/** @param {any} row @param {number} nowS */
const bannedNow = (row, nowS) => Number.isSafeInteger(row?.banned_until) && row.banned_until > nowS;

// An unknown handle still runs a full derivation, so response time does not reveal which usernames exist.
export async function login({ db, subtle, rand, nowS }, { handle, password, deviceLabel = null }) {
  const lc = String(handle ?? '').toLowerCase();

  if (lc && await rateFull({ db, nowS }, `login:${lc}`)) return { error: 'rate' };
  const player = lc ? await db.prepare('SELECT * FROM players WHERE handle_lc = ?').bind(lc).first() : null;
  const ok = await verifyPassword(password, player?.password ?? null, { subtle });

  if (!player || !ok) {
    const over = await overRate({ db, nowS }, `login:${lc}`);
    return { error: over ? 'rate' : 'bad-login' };
  }

  await clearRate({ db }, `login:${lc}`);
  if (bannedNow(player, nowS)) return { error: 'banned', until: player.banned_until, reason: player.ban_reason ?? null };
  let held = player.password;
  if (needsRehash(held)) {
    const fresh = await hashPassword(password, { subtle, rand });
    const re = await db.prepare('UPDATE players SET password = ? WHERE id = ? AND password = ?').bind(fresh, player.id, held).run();
    if (re.meta.changes) held = fresh;
  }
  let session = await openSession({ db, subtle, rand, nowS }, player.id, deviceLabel, { password: held });
  if (!session) {
    const now = (await db.prepare('SELECT password FROM players WHERE id = ?').bind(player.id).first())?.password ?? null;
    if (now && await verifyPassword(password, now, { subtle })) session = await openSession({ db, subtle, rand, nowS }, player.id, deviceLabel, { password: now });
  }
  if (!session) return { error: 'bad-login' };
  return { id: player.id, name: displayName(player), kind: accountKind(player), ...session };
}

export async function recover({ db, subtle, rand, nowS }, { handle, code, password, set = false }) {
  const lc = String(handle ?? '').toLowerCase();
  const pRefusal = passwordRefusal(password);
  if (pRefusal) return { error: `password-${pRefusal}` };

  if (lc && await rateFull({ db, nowS }, `recover:${lc}`)) return { error: 'rate' };
  const canon = codeForHashing(code);
  const player = lc ? await db.prepare('SELECT * FROM players WHERE handle_lc = ?').bind(lc).first() : null;
  const { ok, rest } = await matchRecoveryCode(canon, player?.recovery_hash ?? null, { subtle });

  if (!player || !canon || !ok) {
    const over = await overRate({ db, nowS }, `recover:${lc}`);
    return { error: over ? 'rate' : 'bad-code' };
  }
  if (bannedNow(player, nowS)) return { error: 'banned', until: player.banned_until, reason: player.ban_reason ?? null };

  const one = set ? null : mintRecoveryCode(rand);
  const fresh = set && !rest?.length ? mintRecoverySet(rand) : null;
  const [pw, rc] = await Promise.all([
    hashPassword(password, { subtle, rand }),
    one ? hashPassword(codeForHashing(one), { subtle, rand }) : fresh ? hashRecoverySet(fresh, { subtle, rand }) : joinRecoverySet(rest),
  ]);
  const spent = await db.prepare('UPDATE players SET password = ?, recovery_hash = ? WHERE id = ? AND recovery_hash = ?').bind(pw, rc, player.id, player.recovery_hash).run();
  if (!spent.meta.changes) return { error: 'codes-moved' };
  await db.prepare('DELETE FROM sessions WHERE player_id = ? AND EXISTS (SELECT 1 FROM players WHERE id = ? AND password = ?)').bind(player.id, player.id, pw).run();
  await closeStaffSessions({ db }, player.id);
  await clearRate({ db }, `recover:${lc}`);
  const session = await openSession({ db, subtle, rand, nowS }, player.id, null, { password: pw });
  if (!session) return { error: 'codes-moved' };
  const left = one ? { recoveryCode: one } : fresh ? { recoveryCodes: fresh, codesLeft: fresh.length, handle: player.handle } : { codesLeft: rest.length, handle: player.handle };
  return { id: player.id, name: displayName(player), ...left, ...session };
}

export async function changePassword({ db, subtle, rand, nowS }, player, session, { oldPassword, password }) {
  const pRefusal = passwordRefusal(password);
  if (pRefusal) return { error: `password-${pRefusal}` };
  if (!player.password) return { error: 'not-registered' };
  if (await rateFull({ db, nowS }, `login:${player.handle_lc}`)) return { error: 'rate' };
  if (!await verifyPassword(oldPassword, player.password, { subtle })) {
    const over = await overRate({ db, nowS }, `login:${player.handle_lc}`);
    return { error: over ? 'rate' : 'bad-login' };
  }
  await clearRate({ db }, `login:${player.handle_lc}`);
  const pw = await hashPassword(password, { subtle, rand });
  const wrote = await db.prepare('UPDATE players SET password = ? WHERE id = ? AND password = ? AND EXISTS (SELECT 1 FROM sessions WHERE id = ? AND player_id = ?)')
    .bind(pw, player.id, player.password, session.id, player.id).run();
  if (!wrote.meta.changes) return { error: 'bad-login' };
  await db.prepare('DELETE FROM sessions WHERE player_id = ? AND id != ? AND EXISTS (SELECT 1 FROM players WHERE id = ? AND password = ?)').bind(player.id, session.id, player.id, pw).run();
  await closeStaffSessions({ db }, player.id);
  return { ok: true };
}

export async function newRecoveryCodes({ db, subtle, rand, nowS }, player, { password, code }) {
  if (!player.password) return { error: 'not-registered' };
  if (await overRate({ db, nowS }, `newcodes:${player.id}`)) return { error: 'rate' };
  if (!await verifyPassword(password, player.password, { subtle })) return { error: 'bad-login' };
  await clearRate({ db }, `newcodes:${player.id}`);
  if (recoveryLeft(player.recovery_hash) !== null) {
    if (await overRate({ db, nowS }, `newcodes-code:${player.id}`)) return { error: 'rate' };
    const canon = codeForHashing(code);
    const { ok } = await matchRecoveryCode(canon, player.recovery_hash, { subtle });
    if (!canon || !ok) return { error: 'bad-code' };
    await clearRate({ db }, `newcodes-code:${player.id}`);
  }
  const codes = mintRecoverySet(rand);
  const rc = await hashRecoverySet(codes, { subtle, rand });
  const wrote = await db.prepare('UPDATE players SET recovery_hash = ? WHERE id = ? AND recovery_hash IS ?').bind(rc, player.id, player.recovery_hash ?? null).run();
  if (!wrote.meta.changes) return { error: 'codes-moved' };
  return { recoveryCodes: codes, codesLeft: codes.length };
}

export async function setEmail({ db }, playerId, email) {
  const e = email === null || email === '' ? null : String(email ?? '').trim();
  if (e !== null && (e.length > 254 || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(e))) return { error: 'email' };
  await db.prepare('UPDATE players SET email = ? WHERE id = ?').bind(e, playerId).run();
  return { email: e };
}

export const DUEL_PAIR_DAY_MAX = 10;
export const DUEL_WINNER_DAY_MAX = 20;
const DAY_S = 24 * 3600;

export async function duelRecordOf({ db }, playerId) {
  const w = await db.prepare('SELECT COUNT(*) AS n FROM duel_results WHERE winner = ?1').bind(playerId).first();
  const l = await db.prepare('SELECT COUNT(*) AS n FROM duel_results WHERE loser = ?1').bind(playerId).first();
  const n = (r) => (Number.isSafeInteger(Number(r?.n)) ? Number(r.n) : 0);
  return { wins: n(w), losses: n(l) };
}

export async function claimDuel({ db, nowS, subtle }, player, receipt, publicKey) {
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifyDuelReceipt(receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (!c.f.includes(player.id)) return { error: 'not-yours' };
  const winner = c.f[c.w], loser = c.f[1 - c.w];
  // The daily bounds are measured inside the one INSERT, so two claims at once cannot both pass them.
  const r = await db.prepare(
    `INSERT INTO duel_results (loser, winner, at, rk)
     SELECT ?1, ?2, ?3, ?4
     WHERE EXISTS (SELECT 1 FROM players WHERE id = ?1 AND handle IS NOT NULL)
       AND EXISTS (SELECT 1 FROM players WHERE id = ?2 AND handle IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM duel_results WHERE rk = ?4)
       AND (SELECT COUNT(*) FROM duel_results WHERE loser = ?1 AND winner = ?2 AND at > ?3 - ?5) < ?6
       AND (SELECT COUNT(*) FROM duel_results WHERE winner = ?2 AND at > ?3 - ?5) < ?7`,
  ).bind(loser, winner, c.i, c.n, DAY_S, DUEL_PAIR_DAY_MAX, DUEL_WINNER_DAY_MAX).run();
  const mine = () => duelRecordOf({ db }, player.id);
  if (Number(r?.meta?.changes ?? 0) > 0) return { recorded: true, ...(await mine()) };
  if (await db.prepare('SELECT 1 AS x FROM duel_results WHERE rk = ?1').bind(c.n).first()) return { recorded: true, ...(await mine()) };
  const handles = await db.prepare('SELECT COUNT(*) AS n FROM players WHERE id IN (?1, ?2) AND handle IS NOT NULL').bind(loser, winner).first();
  const n = (row) => Number(row?.n ?? 0);
  const pair = n(await db.prepare('SELECT COUNT(*) AS n FROM duel_results WHERE loser = ?1 AND winner = ?2 AND at > ?3 - ?4').bind(loser, winner, c.i, DAY_S).first());
  const why = n(handles) < 2 ? 'guest' : pair >= DUEL_PAIR_DAY_MAX ? 'pair' : 'winner';
  return { recorded: false, why, ...(await mine()) };
}

export async function gateRecordOf({ db }, playerId) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM gate_kills WHERE account = ?1 AND earned != 'rite'").bind(playerId).first();
  return { closed: Number(r?.n ?? 0) };
}

/** @param {{ db: any, nowS: number, subtle: SubtleCrypto }} ctx
 *  @param {{ id: string, handle?: string|null }} player @param {unknown} receipt
 *  @param {CryptoKey|null} publicKey */
export async function claimGate({ db, nowS, subtle }, player, receipt, publicKey, { strike = null, region = null, deeds = null, weir = null } = {}) {
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifyReceipt(receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.s !== player.id) return { error: 'not-yours' };
  if (!player.handle) return { recorded: false, why: 'guest', ...(await gateRecordOf({ db }, player.id)) };
  const embers = c.r === 1 ? 2 : 1;
  const kill = db.prepare('INSERT OR IGNORE INTO gate_kills (day, account, boss, earned, at, region, stones, body) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
    .bind(c.d, player.id, c.b, c.x, nowS, c.x !== 'rite' && seatRegionOk(region) ? region : null, embers, c.m ? JSON.stringify(c.m) : null);
  // The Marks strike shares the row's batch, so a failed strike rolls back the row and the retry claims again.
  const stmt = c.x === 'rite' ? null : strike?.(c.d) ?? null;
  const deed = c.x === 'rite' ? null : deeds?.(c.d) ?? null;
  // The Weir Key roll must directly follow the row's INSERT because it reads `changes()`.
  const roll = c.x === 'rite' ? null : weir?.(c) ?? null;
  const [r, ...rest] = stmt || deed || roll ? await db.batch([kill, ...(roll ? [roll] : []), ...(stmt ? [stmt] : [db.prepare('SELECT 0')]), ...(deed ?? [])]) : [await kill.run(), null];
  const w = roll ? rest.shift() : null, [m, ...d] = rest;
  const recorded = Number(r?.meta?.changes ?? 0) > 0;
  const struck = !!stmt && Number(m?.meta?.changes ?? 0) > 0;
  const deedStruck = !!deed && Number(d[1]?.meta?.changes ?? 0) > 0;
  if (recorded) return { recorded, day: c.d, stones: embers, ...(c.p > 0 ? { portent: c.p } : {}), ...(c.x === 'rite' ? { rite: true } : {}), ...(stmt ? { struck } : {}), ...(deed ? { deedStruck } : {}), ...(roll ? { weirRow: w?.results?.[0] ?? null } : {}), ...(await gateRecordOf({ db }, player.id)) };
  // Rows from before the ember change stored an r receipt at 1 ember; a repeat claim repairs them to 2.
  if (c.r === 1) await db.prepare("UPDATE gate_kills SET stones = 2 WHERE day = ?1 AND account = ?2 AND stones = 1 AND earned != 'rite'").bind(c.d, player.id).run();
  const row = await db.prepare('SELECT stones FROM gate_kills WHERE day = ?1 AND account = ?2').bind(c.d, player.id).first();
  return { recorded, why: 'claimed', ...(Number.isSafeInteger(row?.stones) ? { stones: row.stones } : {}), ...(await gateRecordOf({ db }, player.id)) };
}
