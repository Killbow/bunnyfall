// @ts-check
import { displayName, overRate } from './accounts.js';
import { CHAR_ID_RE } from './service.js';
import {
  CAMP_CAP, CAMPS_MAX, CAMP_GAP, CAMP_NEAR, CAMPS_READ_MAX, CAMP_ID_RE, CAMP_REC_RE,
  campNameOf, campPixelOk, campAtOf, campPieceOf, campMoveOf, campDistance, campOf,
} from '../../src/net/campLaw.js';
import { DECOR_ID_RE } from '../../src/net/decorLaw.js';

export const CAMP_WRITES_MAX = 120;
const CAMP_WRITES_WINDOW_S = 60;

const hexId = (/** @type {(b: Uint8Array) => void} */ rand) => { const b = new Uint8Array(8); rand(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const pieceOfRow = (/** @type {any} */ r) => { try { return campPieceOf(JSON.parse(r.piece)); } catch { return null; } };
const tooFast = (/** @type {any} */ ctx, /** @type {any} */ player) => overRate(ctx, `camp:${player.id}`, CAMP_WRITES_MAX, CAMP_WRITES_WINDOW_S);

const campRow = (/** @type {any} */ r, /** @type {any} */ player, /** @type {any[] | undefined} */ pieces) => {
  const mine = r.player === player.id;
  return campOf({ id: r.id, name: r.name, owner: r.owner_name, mine, px: r.px, py: r.py, at: [r.x, r.y, r.z], yaw: r.yaw, ...(mine ? { rec: r.rec, char: r.char_id } : {}), pieces: pieces ?? [] });
};

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

export async function campsMine({ db }, player) {
  const { results: rows = [] } = await db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM camp_pieces p WHERE p.camp_id = c.id) AS n
    FROM camps c WHERE c.player = ?1 ORDER BY c.created_at LIMIT ?2`).bind(player.id, CAMPS_MAX + 5).all();
  const camps = rows.map((r) => { const c = campRow(r, player, []); return c ? { ...c, pieceCount: Math.max(0, Number(r.n) | 0), placedAt: Number(r.created_at) || 0 } : null; }).filter(Boolean);
  return { camps };
}

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
  // The cap is checked again inside the insert so two tabs pitching at once stay within CAMPS_MAX, and the unique
  // (player, rec) index keeps one camp per record.
  await db.prepare(`INSERT OR IGNORE INTO camps (id, player, char_id, rec, yaw, name, owner_name, px, py, x, y, z, created_at, updated_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13 WHERE (SELECT COUNT(*) FROM camps WHERE player = ?2) < ?14`)
    .bind(id, player.id, character, rec, heading, campName, owner, px, py, where[0], where[1], where[2], nowS, CAMPS_MAX).run();
  const made = await db.prepare('SELECT * FROM camps WHERE player = ?1 AND rec = ?2').bind(player.id, rec).first();
  if (!made) return { error: 'camps-max' };
  return { camp: campRow(made, player, []) };
}

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

export async function renameCamp(ctx, player, { id, name } = {}) {
  const { db, nowS } = ctx;
  const clean = campNameOf(name);
  if (typeof id !== 'string' || !CAMP_ID_RE.test(id) || !clean) return { error: 'bad-camp' };
  const own = await db.prepare('SELECT id FROM camps WHERE id = ?1 AND player = ?2').bind(id, player.id).first();
  if (!own) return { error: 'no-camp' };
  await db.prepare('UPDATE camps SET name = ?3, updated_at = ?4 WHERE id = ?1 AND player = ?2').bind(id, player.id, clean, nowS).run();
  return { ok: true, name: clean };
}

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
  // The cap is checked again inside the insert, so concurrent placements stay within CAMP_CAP.
  await db.prepare(`INSERT OR IGNORE INTO camp_pieces (camp_id, id, piece, at)
    SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM camps WHERE id = ?1 AND player = ?5)
      AND (SELECT COUNT(*) FROM camp_pieces WHERE camp_id = ?1) < ?6`).bind(id, p.id, JSON.stringify(p), nowS, player.id, CAMP_CAP).run();
  const stood = await db.prepare('SELECT 1 AS ok FROM camp_pieces WHERE camp_id = ?1 AND id = ?2').bind(id, p.id).first();
  if (!stood) return { error: 'camp-full' };
  await db.prepare('UPDATE camps SET updated_at = ?2 WHERE id = ?1').bind(id, nowS).run();
  return { piece: p };
}

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

export async function removeCampPiece(ctx, player, { id, pieceId } = {}) {
  const { db } = ctx;
  if (typeof id !== 'string' || !CAMP_ID_RE.test(id) || typeof pieceId !== 'string' || !DECOR_ID_RE.test(pieceId)) return { error: 'bad-decor' };
  if (await tooFast(ctx, player)) return { error: 'rate-limited' };
  const own = await db.prepare('SELECT id FROM camps WHERE id = ?1 AND player = ?2').bind(id, player.id).first();
  if (!own) return { error: 'no-camp' };
  await db.prepare('DELETE FROM camp_pieces WHERE camp_id = ?1 AND id = ?2').bind(id, pieceId).run();
  return { ok: true, gold: 0 };
}

export const CAMP_ROUTES = Object.freeze(['/v1/camps/near', '/v1/camps/mine', '/v1/camps/pitch', '/v1/camps/strike', '/v1/camps/rename', '/v1/camps/place', '/v1/camps/move', '/v1/camps/remove']);
export function campRoute(ctx, player, path, body) {
  switch (path) {
    case '/v1/camps/near': return campsNear(ctx, player, body);
    case '/v1/camps/mine': return campsMine(ctx, player);
    case '/v1/camps/pitch': return pitchCamp(ctx, player, body);
    case '/v1/camps/strike': return strikeCamp(ctx, player, body);
    case '/v1/camps/rename': return renameCamp(ctx, player, body);
    case '/v1/camps/place': return placeCampPiece(ctx, player, body);
    case '/v1/camps/move': return moveCampPiece(ctx, player, body);
    default: return removeCampPiece(ctx, player, body);
  }
}
