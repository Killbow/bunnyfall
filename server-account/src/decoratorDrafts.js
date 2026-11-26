// @ts-check
// Saves a decorator draft for free (never in home_decor) and lets the home owner accept a sent template.
// Accept is all or nothing: the owner pays for every piece from purse and bank, guarded on the draft revision.
import { accountKind } from './accounts.js';
import { homeMapIdOk, homeBuildingKeyOk } from '../../src/net/homeLaw.js';
import {
  DECOR_BATCH_OPS, DECOR_CAP, DECOR_ID_RE, DECOR_TXN_RE, DECOR_YARD_CAP, DECOR_YARDS_TOWN_MAX,
  decorPieceOf, decorScaleOk, decorYardHighOk, decorYardPieceOf,
} from '../../src/net/decorLaw.js';
import { decoratorPieceOk, templatePaidOf } from '../../src/net/decoratorLaw.js';
import { chargeOps } from './decorBatch.js';
import { DECORATES, HOME_OWNER, draftPieceOf } from './decorators.js';
import { dropIfUnnamed, dropObjects, mustChange, prepareRealmRecord, realmActFirst, recordMovedOf, REALM_ID_RE } from './realm.js';
import { payFromSave } from '../../src/net/realmGoldLaw.js';
import { HANDLE_RE } from '../../src/net/handleShape.js';

const placeJson = ({ pos, rot, scale, light, storage, paid }) => JSON.stringify({ pos, rot, scale, light, storage, paid });

/** @param {{ db: any, nowS: number }} ctx @param {any} player @param {any} body */
export async function saveDraft(ctx, player, body = {}) {
  const { db, nowS } = ctx;
  const { mapId, buildingKey, character, draftRev } = body;
  const yard = body.yard === true;
  const out = yard ? 1 : 0;
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return { error: 'bad-home' };
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  if (!Number.isSafeInteger(draftRev) || draftRev < 0) return { error: 'draft-changed' };
  const putIn = Array.isArray(body.put) ? body.put : null;
  const dropIn = Array.isArray(body.drop) ? body.drop : null;
  if (!putIn || !dropIn) return { error: 'bad-decor' };
  if (putIn.length + dropIn.length > DECOR_BATCH_OPS) return { error: 'decor-ops' };
  const seen = new Set();
  const drops = [];
  for (const id of dropIn) {
    if (typeof id !== 'string' || !DECOR_ID_RE.test(id) || seen.has(id)) return { error: 'bad-decor' };
    seen.add(id);
    drops.push(id);
  }
  const puts = [];
  for (const raw of putIn) {
    const p = yard ? decorYardPieceOf(raw) : decorPieceOf(raw);
    if (!p || !decorScaleOk(p) || seen.has(p.id)) return { error: 'bad-decor' };
    if (!decoratorPieceOk(p)) return { error: 'decorator-piece' };
    if (yard && !decorYardHighOk(p)) return { error: 'yard-high' };
    seen.add(p.id);
    puts.push(p);
  }
  const mine = await db.prepare('SELECT 1 AS y FROM realm_characters WHERE id = ? AND player = ?').bind(character, player.id).first();
  if (!mine) return { error: 'realm-only' };
  const grant = await db.prepare(`SELECT d.draft_rev FROM home_decorators d WHERE d.map_id = ? AND d.building_key = ? AND d.player = ? AND ${DECORATES}`)
    .bind(mapId, buildingKey, player.id, mapId, buildingKey, player.id).first();
  if (!grant) return { error: 'decor-revoked' };
  if (Number(grant.draft_rev) !== draftRev) return { error: 'draft-changed' };
  if (!puts.length && !drops.length) return { ok: true, draftRev };
  if (await chargeOps(db, nowS, player.id, puts.length + drops.length)) return { error: 'decor-rate' };

  const ids = puts.map((p) => p.id);
  if (ids.length) {
    const marks = ids.map(() => '?').join(', ');
    const real = await db.prepare(`SELECT id FROM home_decor WHERE map_id = ? AND building_key = ? AND id IN (${marks}) LIMIT 1`).bind(mapId, buildingKey, ...ids).first();
    if (real) return { error: 'decor-taken' };
    const other = await db.prepare(`SELECT id FROM home_drafts WHERE map_id = ? AND building_key = ? AND (player != ? OR yard != ?) AND id IN (${marks}) LIMIT 1`)
      .bind(mapId, buildingKey, player.id, out, ...ids).first();
    if (other) return { error: 'decor-taken' };
  }
  const { results: own = [] } = await db.prepare('SELECT id FROM home_drafts WHERE map_id = ? AND building_key = ? AND player = ? AND yard = ?')
    .bind(mapId, buildingKey, player.id, out).all();
  const next = new Set(own.map((r) => r.id));
  for (const id of drops) {
    if (!next.has(id)) return { error: 'no-decor' };
    next.delete(id);
  }
  for (const p of puts) next.add(p.id);
  const placed = Number((await db.prepare('SELECT COUNT(*) AS n FROM home_decor WHERE map_id = ? AND building_key = ? AND yard = ?').bind(mapId, buildingKey, out).first())?.n) || 0;
  if (placed + next.size > (yard ? DECOR_YARD_CAP : DECOR_CAP)) return { error: yard ? 'yard-cap' : 'decor-cap' };

  const steps = [];
  for (const id of drops) {
    steps.push(db.prepare('DELETE FROM home_drafts WHERE map_id = ? AND building_key = ? AND id = ? AND player = ? AND yard = ?').bind(mapId, buildingKey, id, player.id, out));
    steps.push(mustChange(db));
  }
  for (const p of puts) {
    steps.push(db.prepare(`INSERT INTO home_drafts (map_id, building_key, player, id, model, flat_archive, flat_record, place, yard, placed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (map_id, building_key, id) DO UPDATE SET model = excluded.model, flat_archive = excluded.flat_archive, flat_record = excluded.flat_record, place = excluded.place
      WHERE home_drafts.player = excluded.player AND home_drafts.yard = excluded.yard`)
      .bind(mapId, buildingKey, player.id, p.id, p.model, p.flat?.[0] ?? null, p.flat?.[1] ?? null, placeJson(p), out, nowS));
    steps.push(mustChange(db));
  }
  steps.push(db.prepare(`UPDATE home_decorators SET draft_rev = draft_rev + 1, draft_at = ?, sent_at = NULL, declined_at = NULL
    WHERE map_id = ? AND building_key = ? AND player = ? AND draft_rev = ? AND ${DECORATES}`)
    .bind(nowS, mapId, buildingKey, player.id, draftRev, mapId, buildingKey, player.id));
  steps.push(mustChange(db));
  try {
    await db.batch(steps);
  } catch {
    const now = await db.prepare(`SELECT d.draft_rev FROM home_decorators d WHERE d.map_id = ? AND d.building_key = ? AND d.player = ? AND ${DECORATES}`)
      .bind(mapId, buildingKey, player.id, mapId, buildingKey, player.id).first();
    if (!now) return { error: 'decor-revoked' };
    return { error: Number(now.draft_rev) !== draftRev ? 'draft-changed' : 'decor-taken' };
  }
  return { ok: true, draftRev: draftRev + 1 };
}

/** @param {{ db: any, bucket?: any, rand?: any, nowS: number }} ctx @param {any} player @param {any} body */
export async function acceptDraft(ctx, player, body = {}) {
  const { db, nowS } = ctx;
  const { mapId, buildingKey, character, draftRev, txn, name } = body;
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return { error: 'bad-home' };
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  if (typeof txn !== 'string' || !DECOR_TXN_RE.test(txn)) return { error: 'bad-decor' };
  if (!Number.isSafeInteger(draftRev) || draftRev < 0) return { error: 'draft-changed' };
  const prior = await db.prepare('SELECT player, map_id, building_key, result FROM decor_batch_receipt WHERE txn = ?').bind(txn).first();
  if (prior) {
    if (prior.player !== player.id || prior.map_id !== mapId || prior.building_key !== buildingKey) return { error: 'decor-txn' };
    try { return { ...JSON.parse(prior.result), repeat: true }; } catch { return { error: 'decor-txn' }; }
  }
  const side = await realmActFirst(db, player.id, character, body.realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  const at = side.at;
  const home = await db.prepare(`SELECT region FROM homes h WHERE h.map_id = ? AND h.building_key = ? AND ${HOME_OWNER}`)
    .bind(mapId, buildingKey, mapId, buildingKey, player.id, character, player.id).first();
  if (!home) return { error: 'no-home' };
  const handle = typeof name === 'string' ? name.trim() : '';
  const who = HANDLE_RE.test(handle) ? await db.prepare('SELECT id, handle FROM players WHERE handle_lc = ?').bind(handle.toLowerCase()).first() : null;
  const grant = who ? await db.prepare('SELECT draft_rev, sent_at FROM home_decorators WHERE map_id = ? AND building_key = ? AND player = ?').bind(mapId, buildingKey, who.id).first() : null;
  if (!grant) return { error: 'no-reader' };
  if (grant.sent_at == null) return { error: 'draft-unsent' };
  if (Number(grant.draft_rev) !== draftRev) return { error: 'draft-changed' };
  const { results: rows = [] } = await db.prepare('SELECT * FROM home_drafts WHERE map_id = ? AND building_key = ? AND player = ? ORDER BY placed_at, id')
    .bind(mapId, buildingKey, who.id).all();
  if (!rows.length) return { error: 'draft-empty' };
  const paid = templatePaidOf(body.paid);
  if (!paid || paid.size !== rows.length || rows.some((r) => !paid.has(r.id))) return { error: 'bad-decor' };
  const pieces = [];
  for (const row of rows) {
    const p = draftPieceOf(row);
    if (!p) return { error: 'bad-decor' };
    pieces.push({ row, piece: { ...p, paid: /** @type {number} */ (paid.get(row.id)) } });
  }
  const want = [pieces.filter((x) => x.row.yard !== 1).length, pieces.filter((x) => x.row.yard === 1).length];
  const counts = await db.batch([
    db.prepare('SELECT COUNT(*) AS n FROM home_decor WHERE map_id = ? AND building_key = ? AND yard = 0').bind(mapId, buildingKey),
    db.prepare('SELECT COUNT(*) AS n FROM home_decor WHERE map_id = ? AND building_key = ? AND yard = 1').bind(mapId, buildingKey),
    db.prepare('SELECT COUNT(*) AS n FROM home_decor WHERE map_id = ? AND yard = 1').bind(mapId),
    db.prepare(`SELECT COUNT(*) AS n FROM home_decor WHERE map_id = ? AND building_key = ? AND id IN (SELECT id FROM home_drafts WHERE map_id = ? AND building_key = ? AND player = ?)`)
      .bind(mapId, buildingKey, mapId, buildingKey, who.id),
    db.prepare('SELECT rev FROM decor_rev WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey),
  ]);
  const n = (i) => Number(counts[i]?.results?.[0]?.n) || 0;
  if (n(0) + want[0] > DECOR_CAP) return { error: 'decor-cap' };
  if (n(1) + want[1] > DECOR_YARD_CAP) return { error: 'yard-cap' };
  if (n(2) + want[1] > DECOR_YARDS_TOWN_MAX) return { error: 'yard-town-full' };
  if (n(3) > 0) return { error: 'decor-taken' };
  const curRev = Number(counts[4]?.results?.[0]?.rev) || 0;
  const total = pieces.reduce((s, x) => s + x.piece.paid, 0);

  const prep = await prepareRealmRecord(ctx, player.id, at, (save) => (payFromSave(save, total, home.region) ? null : 'realm-gold'));
  if ('error' in prep) return prep.error === 'realm-gold' ? { error: 'realm-gold', gold: total } : prep;
  const answer = {
    ok: true, rev: curRev + 1, gold: -total, realm: { seq: prep.seq }, name: who.handle,
    pieces: pieces.filter((x) => x.row.yard !== 1).map((x) => x.piece), yard: pieces.filter((x) => x.row.yard === 1).map((x) => x.piece),
  };
  const steps = [...prep.steps];
  const owner = [mapId, buildingKey, player.id, character, player.id];
  for (const { row, piece } of pieces) {
    const out = row.yard === 1 ? 1 : 0;
    steps.push(db.prepare(`INSERT INTO home_decor (map_id, building_key, id, model, flat_archive, flat_record, place, placed_at, item, paid, yard)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ? WHERE ${HOME_OWNER} AND NOT EXISTS (SELECT 1 FROM home_decor WHERE map_id = ? AND building_key = ? AND id = ?)
        AND (SELECT COUNT(*) FROM home_decor WHERE map_id = ? AND building_key = ? AND yard = ?) < ?
        AND (? = 0 OR (SELECT COUNT(*) FROM home_decor WHERE map_id = ? AND yard = 1) < ?)`)
      .bind(mapId, buildingKey, piece.id, piece.model, piece.flat?.[0] ?? null, piece.flat?.[1] ?? null, placeJson(piece), nowS, piece.paid, out,
        ...owner, mapId, buildingKey, piece.id, mapId, buildingKey, out, out ? DECOR_YARD_CAP : DECOR_CAP, out, mapId, DECOR_YARDS_TOWN_MAX));
    steps.push(mustChange(db));
  }
  steps.push(db.prepare('DELETE FROM home_drafts WHERE map_id = ? AND building_key = ? AND player = ?').bind(mapId, buildingKey, who.id));
  steps.push(db.prepare(`UPDATE home_decorators SET sent_at = NULL, declined_at = NULL, draft_at = NULL, draft_rev = draft_rev + 1
    WHERE map_id = ? AND building_key = ? AND player = ? AND draft_rev = ? AND sent_at IS NOT NULL`).bind(mapId, buildingKey, who.id, draftRev));
  steps.push(mustChange(db));
  steps.push(db.prepare('INSERT INTO decor_rev (map_id, building_key, rev) VALUES (?, ?, 0) ON CONFLICT(map_id, building_key) DO NOTHING').bind(mapId, buildingKey));
  steps.push(db.prepare('UPDATE decor_rev SET rev = rev + 1 WHERE map_id = ? AND building_key = ? AND rev = ?').bind(mapId, buildingKey, curRev));
  steps.push(mustChange(db));
  steps.push(db.prepare('INSERT INTO decor_batch_receipt (txn, player, map_id, building_key, rev, result, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(txn, player.id, mapId, buildingKey, curRev + 1, JSON.stringify(answer), nowS));
  try {
    await db.batch(steps);
  } catch {
    await dropIfUnnamed(db, ctx.bucket, player.id, at.id, prep.key);
    const again = await db.prepare('SELECT result FROM decor_batch_receipt WHERE txn = ?').bind(txn).first();
    if (again?.result) { try { return JSON.parse(again.result); } catch { } }
    const moved = await recordMovedOf(db, player.id, at);
    if (moved) return moved;
    const g = await db.prepare('SELECT draft_rev, sent_at FROM home_decorators WHERE map_id = ? AND building_key = ? AND player = ?').bind(mapId, buildingKey, who.id).first();
    if (!g || g.sent_at == null) return { error: 'draft-unsent' };
    if (Number(g.draft_rev) !== draftRev) return { error: 'draft-changed' };
    const rev = Number((await db.prepare('SELECT rev FROM decor_rev WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first())?.rev) || 0;
    return { error: rev !== curRev ? 'decor-rev' : 'decor-cap' };
  }
  await dropObjects(ctx.bucket, [prep.prev]);
  return answer;
}
