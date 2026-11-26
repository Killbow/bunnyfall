// @ts-check
import { mintToken, ID_RE, MAX_TTL_S } from '../../src/net/identityToken.js';
import { privateInteriorOf } from '../../src/net/privateInterior.js';
import { signingKey } from './signing.js';
import { displayName } from './accounts.js';

export const FOLLOW_ROUTES = Object.freeze(['/v1/staff/follow']);
export const FOLLOW_ROLES = Object.freeze(['admin', 'moderator']);
export const FOLLOW_AUDIT_S = 60;
export const SPECTATOR_NAME = 'Spectator';
// A follow subject is 27 characters with its prefix and a player id is 24, so the two never match.
export const FOLLOW_SUBJECT_PREFIX = 'hd-';
const ROOM_RE = /^[\w:.,#@+-]{1,128}$/;

// The token never names the staff member's own account: a hidden socket on it would break the one-seat rules.
/** @param {string} hash @param {SubtleCrypto} subtle */
export async function followSubject(hash, subtle) {
  const d = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(`dfo-follow:${hash}`)));
  return FOLLOW_SUBJECT_PREFIX + [...d.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** @param {string} room */
export const privateRoomOf = (room) => !!privateInteriorOf(room);

/** @param {any} ctx @param {any} env @param {string} path @param {any} body
 * @param {{ player: any, role: string, hash: string }} who
 * @param {(act: string, target?: string|null, detail?: object|null, how?: { outcome?: 'ok'|'denied'|'failed', onceIn?: number }) => any} audit */
export async function staffFollow(ctx, env, path, body, who, audit) {
  const { db, subtle, nowS } = ctx;
  if (path !== '/v1/staff/follow') return { error: 'body' };
  if (!FOLLOW_ROLES.includes(who.role)) { await audit('refused', null, { path, need: 'moderator' }, { outcome: 'denied' }).run(); return { error: 'staff-admin' }; }
  const sub = body?.sub, room = body?.room ?? null;
  if (typeof sub !== 'string' || !ID_RE.test(sub) || (room !== null && (typeof room !== 'string' || !ROOM_RE.test(room)))) return { error: 'body' };
  if (sub === who.player.id) return { error: 'staff-self' };
  const target = await db.prepare('SELECT * FROM players WHERE id = ?').bind(sub).first();
  if (!target) return { error: 'no-player' };
  const home = room !== null && privateRoomOf(room);
  const act = home ? 'follow-home' : 'follow';
  const eye = await followSubject(who.hash, subtle);
  const detail = home ? { room, sub: eye } : { sub: eye };
  const key = await signingKey(env, subtle);
  if (!key) { await audit(act, sub, detail, { outcome: 'failed' }).run(); return { error: 'no-signing-key' }; }
  const token = await mintToken({ s: eye, n: SPECTATOR_NAME, k: 'guest', hd: 1, fo: sub }, key, { subtle, nowS });
  await audit(act, sub, detail, { onceIn: FOLLOW_AUDIT_S }).run();
  return { token, sub, name: displayName(target), expiresAt: nowS + MAX_TTL_S };
}
