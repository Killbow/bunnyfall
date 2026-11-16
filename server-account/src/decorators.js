// @ts-check
// Home decorators: the players an owner lets draft templates in a home, up to DECORATORS_MAX. A template is read, sent
// to the owner with a letter, or declined back to the decorator as an editable draft. Drafts are written in
// decoratorDrafts.js. OWNS is unchanged: a decorator never writes home_decor.
import { accountKind, displayName, isMuted, mintId, overRate } from './accounts.js';
import { REALM_ID_RE } from './realm.js';
import { homeMapIdOk, homeBuildingKeyOk } from '../../src/net/homeLaw.js';
import { decorPieceOf, decorYardPieceOf } from '../../src/net/decorLaw.js';
import { DECORATORS_MAX, DRAFT_TTL_S } from '../../src/net/decoratorLaw.js';
import { LETTERS_INBOX_MAX, LETTERS_PAIR_MAX, LETTERS_SENT_WINDOW_S } from '../../src/net/letterLaw.js';
import { HANDLE_RE } from '../../src/net/handleShape.js';

/** The home's own account, never a hall's or a deed's, acting as one of its realm characters. Binds (map, key, player,
 *  character, player). */
export const HOME_OWNER = `EXISTS (SELECT 1 FROM homes h WHERE h.map_id = ? AND h.building_key = ? AND h.guild_id IS NULL AND h.deed = 0
  AND h.player = ? AND EXISTS (SELECT 1 FROM realm_characters rc WHERE rc.id = ? AND rc.player = ?))`;
/** The player holds a grant on a home that is still no hall and no deed. Binds (map, key, player). */
export const DECORATES = `EXISTS (SELECT 1 FROM home_decorators d JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key
  WHERE d.map_id = ? AND d.building_key = ? AND d.player = ? AND h.guild_id IS NULL AND h.deed = 0)`;

/** A draft row as a piece: the room's or the yard's law. */
export function draftPieceOf(/** @type {any} */ row) {
  let place = null;
  try { place = JSON.parse(row.place); } catch { return null; }
  if (!place || typeof place !== 'object') return null;
  const raw = { ...place, id: row.id, model: row.model ?? null, flat: row.model == null ? [row.flat_archive, row.flat_record] : null, item: null };
  return row.yard === 1 ? decorYardPieceOf(raw) : decorPieceOf(raw);
}

/** The shared door: a registered account, a home named, a realm character of the account. */
function doorOf(player, { mapId, buildingKey, character }) {
  if (accountKind(player) !== 'linked') return 'homes-need-account';
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return 'bad-home';
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return 'realm-only';
  return null;
}

/** A registered account by username, or null. */
async function accountByName(db, name) {
  const handle = typeof name === 'string' ? name.trim() : '';
  if (!HANDLE_RE.test(handle)) return null;
  const row = await db.prepare('SELECT id, handle FROM players WHERE handle_lc = ?').bind(handle.toLowerCase()).first();
  return row?.handle ? row : null;
}

const ownsHome = async (db, mapId, buildingKey, player, character) =>
  !!(await db.prepare(`SELECT ${HOME_OWNER} AS y`).bind(mapId, buildingKey, player.id, character, player.id).first())?.y;

/** Why the caller may not manage this home's decorators: a hall, a palace, or a deed refuses `decorator-hall`. */
async function ownerWhy(db, mapId, buildingKey, player, character) {
  if (await ownsHome(db, mapId, buildingKey, player, character)) return null;
  const h = await db.prepare('SELECT player, guild_id, deed FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first();
  if (h && (h.guild_id != null || Number(h.deed) === 1) && (h.player === player.id || h.guild_id != null)) return 'decorator-hall';
  return 'no-home';
}

/** Drafts with no change for DRAFT_TTL_S are discarded; the grant stays. */
async function expireDrafts(db, mapId, buildingKey, nowS) {
  const old = nowS - DRAFT_TTL_S;
  if (!(await db.prepare('SELECT 1 AS y FROM home_decorators WHERE map_id = ? AND building_key = ? AND draft_at IS NOT NULL AND draft_at < ? LIMIT 1')
    .bind(mapId, buildingKey, old).first())) return;
  await db.batch([
    db.prepare(`DELETE FROM home_drafts WHERE map_id = ?1 AND building_key = ?2 AND player IN
      (SELECT player FROM home_decorators WHERE map_id = ?1 AND building_key = ?2 AND draft_at IS NOT NULL AND draft_at < ?3)`).bind(mapId, buildingKey, old),
    db.prepare(`UPDATE home_decorators SET draft_at = NULL, sent_at = NULL, declined_at = NULL, draft_rev = draft_rev + 1
      WHERE map_id = ? AND building_key = ? AND draft_at IS NOT NULL AND draft_at < ?`).bind(mapId, buildingKey, old),
  ]);
}

/**
 * A letter from the decorator to the owner that a template arrived. It is skipped, never refused, when the owner
 * blocked the decorator or the decorator is muted. It is also skipped when the hourly letters or the box are full.
 * @param {{ db: any, rand: any, nowS: number }} ctx @param {any} sender @param {string} ownerId @param {string} body
 */
export async function templateLetter(ctx, sender, ownerId, body) {
  const { db, rand, nowS } = ctx;
  if (isMuted(sender, nowS) || ownerId === sender.id) return false;
  if (await db.prepare('SELECT 1 AS y FROM blocks WHERE player = ?1 AND blocked = ?2').bind(ownerId, sender.id).first()) return false;
  if (await overRate({ db, nowS }, `mail:${sender.id}>${ownerId}`, LETTERS_PAIR_MAX, LETTERS_SENT_WINDOW_S)) return false;
  const r = await db.prepare(`INSERT INTO letters (id, to_id, from_id, from_name, subject, body, sent_at)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM letters WHERE to_id = ?) < ?`)
    .bind(mintId(rand), ownerId, sender.id, displayName(sender), TEMPLATE_LETTER_SUBJECT, body, nowS, ownerId, LETTERS_INBOX_MAX).run();
  return !!r?.meta?.changes;
}
export const TEMPLATE_LETTER_SUBJECT = 'A decorating template for you';
export const homeTemplateLetter = (/** @type {string} */ name) => `${name} sent you a decorating template for your home. Go inside and open Decorators to preview it.`;

/** One decorator's draft as `{ draftRev, sentAt, declined, pieces, yard }`. */
async function draftOf(db, mapId, buildingKey, playerId) {
  const grant = await db.prepare('SELECT draft_rev, draft_at, sent_at, declined_at FROM home_decorators WHERE map_id = ? AND building_key = ? AND player = ?')
    .bind(mapId, buildingKey, playerId).first();
  if (!grant) return null;
  const { results = [] } = await db.prepare('SELECT * FROM home_drafts WHERE map_id = ? AND building_key = ? AND player = ? ORDER BY placed_at, id')
    .bind(mapId, buildingKey, playerId).all();
  const pieces = [], yard = [];
  for (const row of results) {
    const p = draftPieceOf(row);
    if (p) (row.yard === 1 ? yard : pieces).push(p);
  }
  return { draftRev: Number(grant.draft_rev) || 0, draftAt: grant.draft_at ?? null, sentAt: grant.sent_at ?? null, declined: grant.declined_at != null && grant.sent_at == null, pieces, yard };
}

/**
 * `/v1/homes/decorators`, by `op`. The owner sends `list`, `grant { name }`, `revoke { name }`, `decline { name }`, and
 * `draft { name }` (a sent template, to preview). The decorator sends `draft` and `send`.
 * @param {{ db: any, rand: any, nowS: number }} ctx @param {any} player @param {any} body
 */
export async function decoratorsRoute(ctx, player, body = {}) {
  const { db, nowS } = ctx;
  const shut = doorOf(player, body);
  if (shut) return { error: shut };
  const { mapId, buildingKey, character, op } = body;
  if (op === 'draft' && body.name == null) {
    await expireDrafts(db, mapId, buildingKey, nowS);
    if (!(await db.prepare(`SELECT ${DECORATES} AS y`).bind(mapId, buildingKey, player.id).first())?.y) return { error: 'decor-revoked' };
    return { ok: true, ...(await draftOf(db, mapId, buildingKey, player.id)) };
  }
  if (op === 'send') {
    if (await overRate({ db, nowS }, `decor-send:${player.id}`, 30, 3600)) return { error: 'decor-rate' };
    const grant = await db.prepare(`SELECT d.sent_at, h.player AS owner FROM home_decorators d JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key
      WHERE d.map_id = ? AND d.building_key = ? AND d.player = ? AND h.guild_id IS NULL AND h.deed = 0`).bind(mapId, buildingKey, player.id).first();
    if (!grant) return { error: 'decor-revoked' };
    const n = await db.prepare('SELECT COUNT(*) AS n FROM home_drafts WHERE map_id = ? AND building_key = ? AND player = ?').bind(mapId, buildingKey, player.id).first();
    if (!(Number(n?.n) > 0)) return { error: 'draft-empty' };
    if (grant.sent_at != null) return { ok: true, sentAt: grant.sent_at, repeat: true };
    const r = await db.prepare(`UPDATE home_decorators SET sent_at = ?, declined_at = NULL WHERE map_id = ? AND building_key = ? AND player = ? AND sent_at IS NULL AND ${DECORATES}`)
      .bind(nowS, mapId, buildingKey, player.id, mapId, buildingKey, player.id).run();
    if (!r?.meta?.changes) return { error: 'decor-revoked' };
    const mailed = await templateLetter(ctx, player, grant.owner, homeTemplateLetter(displayName(player))).catch(() => false);
    return { ok: true, sentAt: nowS, mailed };
  }
  const why = await ownerWhy(db, mapId, buildingKey, player, character);
  if (why) return { error: why };
  if (op === 'list') {
    await expireDrafts(db, mapId, buildingKey, nowS);
    const { results = [] } = await db.prepare(`SELECT p.handle AS name, d.sent_at, d.draft_at, d.declined_at,
        (SELECT COUNT(*) FROM home_drafts r WHERE r.map_id = d.map_id AND r.building_key = d.building_key AND r.player = d.player AND r.yard = 0) AS pieces,
        (SELECT COUNT(*) FROM home_drafts r WHERE r.map_id = d.map_id AND r.building_key = d.building_key AND r.player = d.player AND r.yard = 1) AS yard_pieces
      FROM home_decorators d LEFT JOIN players p ON p.id = d.player WHERE d.map_id = ? AND d.building_key = ? ORDER BY d.granted_at, d.player`)
      .bind(mapId, buildingKey).all();
    return {
      ok: true, max: DECORATORS_MAX,
      decorators: results.map((r) => ({ name: r.name ?? '', pieces: Number(r.pieces) || 0, yardPieces: Number(r.yard_pieces) || 0, draftAt: r.draft_at ?? null, sentAt: r.sent_at ?? null, declined: r.declined_at != null && r.sent_at == null })),
    };
  }
  const who = await accountByName(db, body.name);
  if (op === 'grant') {
    if (!who) return { error: 'no-reader' };
    if (who.id === player.id) return { error: 'decorator-self' };
    const r = await db.prepare(`INSERT INTO home_decorators (map_id, building_key, player, granted_at) SELECT ?, ?, ?, ?
      WHERE ${HOME_OWNER} AND (SELECT COUNT(*) FROM home_decorators WHERE map_id = ? AND building_key = ?) < ? ON CONFLICT DO NOTHING`)
      .bind(mapId, buildingKey, who.id, nowS, mapId, buildingKey, player.id, character, player.id, mapId, buildingKey, DECORATORS_MAX).run();
    if (r?.meta?.changes) return { ok: true, name: who.handle };
    const had = await db.prepare('SELECT 1 AS y FROM home_decorators WHERE map_id = ? AND building_key = ? AND player = ?').bind(mapId, buildingKey, who.id).first();
    return had ? { ok: true, name: who.handle, repeat: true } : { error: 'decorators-full' };
  }
  if (!who) return { error: 'no-reader' };
  if (op === 'revoke') {
    const [, r] = await db.batch([
      db.prepare('DELETE FROM home_drafts WHERE map_id = ? AND building_key = ? AND player = ?').bind(mapId, buildingKey, who.id),
      db.prepare('DELETE FROM home_decorators WHERE map_id = ? AND building_key = ? AND player = ?').bind(mapId, buildingKey, who.id),
    ]);
    return r?.meta?.changes ? { ok: true, name: who.handle } : { error: 'no-reader' };
  }
  if (op === 'draft') {
    await expireDrafts(db, mapId, buildingKey, nowS);
    const d = await draftOf(db, mapId, buildingKey, who.id);
    if (!d) return { error: 'no-reader' };
    if (d.sentAt == null) return { error: 'draft-unsent' };
    return { ok: true, name: who.handle, ...d };
  }
  if (op === 'decline') {
    const r = await db.prepare(`UPDATE home_decorators SET sent_at = NULL, declined_at = ?, draft_rev = draft_rev + 1
      WHERE map_id = ? AND building_key = ? AND player = ? AND sent_at IS NOT NULL`).bind(nowS, mapId, buildingKey, who.id).run();
    if (r?.meta?.changes) return { ok: true, name: who.handle };
    return (await db.prepare('SELECT 1 AS y FROM home_decorators WHERE map_id = ? AND building_key = ? AND player = ?').bind(mapId, buildingKey, who.id).first())
      ? { error: 'draft-unsent' } : { error: 'no-reader' };
  }
  return { error: 'bad-decor' };
}
