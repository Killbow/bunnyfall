// @ts-check
// BUNNYFALL CAMPS (src/net/campLaw.js): A PLAYER'S CAMP IN THE OPEN WORLD, KEPT WHERE EVERY PASSER-BY READS IT.
//
// A camp is pitched with the camping kit (a linked account's character's tent pitched outdoors - the client says its
// record, scenes/homeYards.js), one camp a record, and furnished a piece at a time (the decorator's own writes - one piece each, as a home's yard is), free, up to CAMP_CAP pieces
// within CAMP_RADIUS of the fire. It stands until its owner strikes it. Every read answers the camps of a 3 x 3 square of
// map pixels round the asker's own, with their pieces; every write names the camp's owner in its own WHERE, so a piece
// in somebody else's camp is exactly as absent as none (`no-camp`).
//
//   POST /v1/camps/near   { px, py }                                  -> { camps: [{ id, name, owner, mine, px, py, at, pieces }] }
//   POST /v1/camps/pitch  { character, rec, px, py, at, yaw, name? } -> { camp }   (the record's camp again, if it has one)
//   POST /v1/camps/strike { id }                                      -> { ok: true }
//   POST /v1/camps/rename { id, name }                                -> { ok: true, name }
//   POST /v1/camps/place  { id, character, piece }                    -> { piece }
//   POST /v1/camps/move   { id, character, pieceId, place }           -> { piece }
//   POST /v1/camps/remove { id, character, pieceId }                  -> { ok: true }
import { displayName, overRate } from './accounts.js';
import { CHAR_ID_RE } from './service.js';
import {
  CAMP_CAP, CAMPS_MAX, CAMP_GAP, CAMP_NEAR, CAMPS_READ_MAX, CAMP_ID_RE, CAMP_REC_RE,
  campNameOf, campPixelOk, campAtOf, campPieceOf, campMoveOf, campDistance, campOf,
} from '../../src/net/campLaw.js';
import { DECOR_ID_RE } from '../../src/net/decorLaw.js';

/** One account's writes in a minute, at most - a decorator's quick hands, not a script's. */
export const CAMP_WRITES_MAX = 120;
const CAMP_WRITES_WINDOW_S = 60;

const hexId = (/** @type {(b: Uint8Array) => void} */ rand) => { const b = new Uint8Array(8); rand(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const pieceOfRow = (/** @type {any} */ r) => { try { return campPieceOf(JSON.parse(r.piece)); } catch { return null; } };
const tooFast = (/** @type {any} */ ctx, /** @type {any} */ player) => overRate(ctx, `camp:${player.id}`, CAMP_WRITES_MAX, CAMP_WRITES_WINDOW_S);

/** A camp's row as a read answers it - its record and character said to its owner alone. */
const campRow = (/** @type {any} */ r, /** @type {any} */ player, /** @type {any[] | undefined} */ pieces) => {
  const mine = r.player === player.id;
  return campOf({ id: r.id, name: r.name, owner: r.owner_name, mine, px: r.px, py: r.py, at: [r.x, r.y, r.z], yaw: r.yaw, ...(mine ? { rec: r.rec, char: r.char_id } : {}), pieces: pieces ?? [] });
};

/** THE CAMPS ROUND A PIXEL: every camp of the 3 x 3 square round (`px`, `py`), each with its pieces. */
export async function campsNear({ db }, player, { px, py } = {}) {
  if (!campPixelOk(px, py)) return { error: 'bad-camp' };
  const { results: rows = [] } = await db.prepare(`SELECT * FROM camps WHERE px BETWEEN ?1 AND ?2 AND py BETWEEN ?3 AND ?4
    ORDER BY created_at LIMIT ?5`).bind(px - CAMP_NEAR, px + CAMP_NEAR, py - CAMP_NEAR, py + CAMP_NEAR, CAMPS_READ_MAX).all();
  if (!rows.length) return { camps: [] };
  const ids = rows.map((r) => r.id);
  const { results: pieces = [] } = await db.prepare(`SELECT camp_id, piece FROM camp_pieces WHERE camp_id IN (${ids.map((_, i) => `?${i + 1}`).join(',')})`).bind(...ids).all();
  const byCamp = new Map(ids.map((id) => [id, /** @type {any[]} */ ([])]));
  for (const p of pieces) { const q = pieceOfRow(p); if (q) byCamp.get(p.camp_id)?.push(q); }
  const camps = rows.map((r) => campRow(r, player, byCamp.get(r.id))).filter(Boolean);
  return { camps };
}

/** A CAMP PITCHED with the kit: the record's own camp answered again where it has one; refused past CAMPS_MAX, or
 *  within CAMP_GAP of another camp's fire. */
export async function pitchCamp(ctx, player, { character, rec, px, py, at, yaw = 0, name } = {}) {
  const { db, nowS, rand } = ctx;
  if (typeof character !== 'string' || !CHAR_ID_RE.test(character) || typeof rec !== 'string' || !CAMP_REC_RE.test(rec) || !campPixelOk(px, py) || !Number.isFinite(yaw)) return { error: 'bad-camp' };
  const where = campAtOf(at);
  if (!where) return { error: 'bad-camp' };
  const had = await db.prepare('SELECT * FROM camps WHERE player = ?1 AND rec = ?2').bind(player.id, rec).first();
  if (had) return { camp: campRow(had, player, []), repeat: true };
  if (await tooFast(ctx, player)) return { error: 'rate-limited' };
  const mine = await db.prepare('SELECT COUNT(*) AS n FROM camps WHERE player = ?1').bind(player.id).first();
  if (Number(mine?.n) >= CAMPS_MAX) return { error: 'camps-max' };
  const { results: near = [] } = await db.prepare('SELECT px, py, x, y, z FROM camps WHERE px BETWEEN ?1 AND ?2 AND py BETWEEN ?3 AND ?4')
    .bind(px - 1, px + 1, py - 1, py + 1).all();
  const here = { px, py, at: where };
  if (near.some((r) => campDistance(here, { px: r.px, py: r.py, at: [r.x, r.y, r.z] }) < CAMP_GAP)) return { error: 'camp-too-near' };
  const id = hexId(rand);
  const owner = displayName(player) ?? '';
  const campName = campNameOf(name) ?? `${owner || 'A'}'s camp`.slice(0, 40);
  const heading = Math.round(yaw * 1000) / 1000;
  // the cap read again inside the write: two tabs pitching at once keep CAMPS_MAX; the record's one camp its index's
  await db.prepare(`INSERT OR IGNORE INTO camps (id, player, char_id, rec, yaw, name, owner_name, px, py, x, y, z, created_at, updated_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13 WHERE (SELECT COUNT(*) FROM camps WHERE player = ?2) < ?14`)
    .bind(id, player.id, character, rec, heading, campName, owner, px, py, where[0], where[1], where[2], nowS, CAMPS_MAX).run();
  const made = await db.prepare('SELECT * FROM camps WHERE player = ?1 AND rec = ?2').bind(player.id, rec).first();
  if (!made) return { error: 'camps-max' };
  return { camp: campRow(made, player, []) };
}

/** A CAMP STRUCK: it and every piece of it gone - its owner's alone. */
export async function strikeCamp(ctx, player, { id } = {}) {
  const { db } = ctx;
  if (typeof id !== 'string' || !CAMP_ID_RE.test(id)) return { error: 'bad-camp' };
  const own = await db.prepare('SELECT id FROM camps WHERE id = ?1 AND player = ?2').bind(id, player.id).first();
  if (!own) return { error: 'no-camp' };
  await db.batch([
    db.prepare('DELETE FROM camp_pieces WHERE camp_id = ?1 AND EXISTS (SELECT 1 FROM camps WHERE id = ?1 AND player = ?2)').bind(id, player.id),
    db.prepare('DELETE FROM camps WHERE id = ?1 AND player = ?2').bind(id, player.id),
  ]);
  return { ok: true };
}

/** A CAMP RENAMED by its owner. */
export async function renameCamp(ctx, player, { id, name } = {}) {
  const { db, nowS } = ctx;
  const clean = campNameOf(name);
  if (typeof id !== 'string' || !CAMP_ID_RE.test(id) || !clean) return { error: 'bad-camp' };
  const own = await db.prepare('SELECT id FROM camps WHERE id = ?1 AND player = ?2').bind(id, player.id).first();
  if (!own) return { error: 'no-camp' };
  await db.prepare('UPDATE camps SET name = ?3, updated_at = ?4 WHERE id = ?1 AND player = ?2').bind(id, player.id, clean, nowS).run();
  return { ok: true, name: clean };
}

/** A PIECE PLACED in the owner's camp, while it holds fewer than CAMP_CAP. A piece already standing under its id answers
 *  as placed (a repeat). */
export async function placeCampPiece(ctx, player, { id, piece } = {}) {
  const { db, nowS } = ctx;
  const p = campPieceOf(piece);
  if (typeof id !== 'string' || !CAMP_ID_RE.test(id) || !p) return { error: 'bad-decor' };
  if (await tooFast(ctx, player)) return { error: 'rate-limited' };
  const own = await db.prepare('SELECT (SELECT COUNT(*) FROM camp_pieces WHERE camp_id = ?1) AS n FROM camps WHERE id = ?1 AND player = ?2').bind(id, player.id).first();
  if (!own) return { error: 'no-camp' };
  const had = await db.prepare('SELECT piece FROM camp_pieces WHERE camp_id = ?1 AND id = ?2').bind(id, p.id).first();
  if (had) return { piece: pieceOfRow(had) ?? p, repeat: true };
  if (Number(own.n) >= CAMP_CAP) return { error: 'camp-full' };
  await db.prepare(`INSERT OR IGNORE INTO camp_pieces (camp_id, id, piece, at)
    SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM camps WHERE id = ?1 AND player = ?5)
      AND (SELECT COUNT(*) FROM camp_pieces WHERE camp_id = ?1) < ?6`).bind(id, p.id, JSON.stringify(p), nowS, player.id, CAMP_CAP).run();
  const stood = await db.prepare('SELECT 1 AS ok FROM camp_pieces WHERE camp_id = ?1 AND id = ?2').bind(id, p.id).first();   // the cap read inside the write
  if (!stood) return { error: 'camp-full' };
  await db.prepare('UPDATE camps SET updated_at = ?2 WHERE id = ?1').bind(id, nowS).run();
  return { piece: p };
}

/** A PIECE MOVED, turned or resized in the owner's camp - what it is never changes, only where it stands. */
export async function moveCampPiece(ctx, player, { id, pieceId, place } = {}) {
  const { db, nowS } = ctx;
  const pl = campMoveOf(place);
  if (typeof id !== 'string' || !CAMP_ID_RE.test(id) || typeof pieceId !== 'string' || !DECOR_ID_RE.test(pieceId) || !pl) return { error: 'bad-decor' };
  if (await tooFast(ctx, player)) return { error: 'rate-limited' };
  const row = await db.prepare(`SELECT cp.piece FROM camp_pieces cp JOIN camps c ON c.id = cp.camp_id
    WHERE cp.camp_id = ?1 AND cp.id = ?2 AND c.player = ?3`).bind(id, pieceId, player.id).first();
  const was = row ? pieceOfRow(row) : null;
  if (!was) return { error: 'no-decor' };
  const next = campPieceOf({ ...was, ...pl, id: was.id, model: was.model, flat: was.flat });
  if (!next) return { error: 'bad-decor' };
  await db.prepare('UPDATE camp_pieces SET piece = ?3, at = ?4 WHERE camp_id = ?1 AND id = ?2').bind(id, pieceId, JSON.stringify(next), nowS).run();
  return { piece: next };
}

/** A PIECE TAKEN DOWN in the owner's camp. Gone already answers as gone. */
export async function removeCampPiece(ctx, player, { id, pieceId } = {}) {
  const { db } = ctx;
  if (typeof id !== 'string' || !CAMP_ID_RE.test(id) || typeof pieceId !== 'string' || !DECOR_ID_RE.test(pieceId)) return { error: 'bad-decor' };
  if (await tooFast(ctx, player)) return { error: 'rate-limited' };
  const own = await db.prepare('SELECT id FROM camps WHERE id = ?1 AND player = ?2').bind(id, player.id).first();
  if (!own) return { error: 'no-camp' };
  await db.prepare('DELETE FROM camp_pieces WHERE camp_id = ?1 AND id = ?2').bind(id, pieceId).run();
  return { ok: true, gold: 0 };
}

/** The routes, for index.js: the read is every session's, the writes a linked account's. */
export const CAMP_ROUTES = Object.freeze(['/v1/camps/near', '/v1/camps/pitch', '/v1/camps/strike', '/v1/camps/rename', '/v1/camps/place', '/v1/camps/move', '/v1/camps/remove']);
/** One camp route answered. */
export function campRoute(ctx, player, path, body) {
  switch (path) {
    case '/v1/camps/near': return campsNear(ctx, player, body);
    case '/v1/camps/pitch': return pitchCamp(ctx, player, body);
    case '/v1/camps/strike': return strikeCamp(ctx, player, body);
    case '/v1/camps/rename': return renameCamp(ctx, player, body);
    case '/v1/camps/place': return placeCampPiece(ctx, player, body);
    case '/v1/camps/move': return moveCampPiece(ctx, player, body);
    default: return removeCampPiece(ctx, player, body);
  }
}
