// @ts-check
import { realmActFirst, prepareRealmRecord, mustChange, dropObjects, dropIfUnnamed, recordMovedOf, REALM_ID_RE } from './realm.js';
import { giveTradeGoods } from '../../src/net/realmTradeLaw.js';
import { POST_ID_RE, POST_BOX_MAX, postItemHead } from '../../src/net/postLaw.js';
import { isLostBatch } from '../../src/net/lostLaw.js';
import { isReportReader, reportCountsOf } from './reports.js';

export const recordOf = (/** @type {any} */ row) => {
  if (typeof row?.item !== 'string') return null;
  let r = null;
  try { r = JSON.parse(row.item); } catch { return null; }
  return r && typeof r === 'object' && !Array.isArray(r) && postItemHead(r) ? r : null;
};

const headOf = (/** @type {any} */ row) => {
  const item = postItemHead(recordOf(row));
  return {
    id: row.id, from: row.sender, subject: row.subject, sentAt: row.sent_at, read: row.read_at != null,
    item, claimed: item ? row.claimed_at != null : false,
  };
};

/** @param {{ db: any }} ctx @param {any} reader @param {any} [env] */
export async function postBoxOf({ db }, reader, env = null) {
  const { results = [] } = await db.prepare(`SELECT id, sender, subject, item, sent_at, read_at, claimed_at FROM server_post
    WHERE to_id = ? ORDER BY (item IS NOT NULL AND claimed_at IS NULL) DESC, (read_at IS NULL) DESC, sent_at DESC, id DESC LIMIT ?`).bind(reader.id, POST_BOX_MAX).all();
  const post = results.map(headOf);
  return {
    post,
    unread: post.filter((p) => !p.read).length,
    unclaimed: post.filter((p) => p.item && !p.claimed).length,
    max: POST_BOX_MAX,
    ...(isReportReader(reader, env) ? { reports: await reportCountsOf(db) } : {}),
  };
}

/** @param {{ db: any, nowS: number }} ctx @param {any} reader @param {unknown} id */
export async function readPost({ db, nowS }, reader, id) {
  if (typeof id !== 'string' || !POST_ID_RE.test(id)) return { error: 'no-post' };
  const row = await db.prepare('SELECT id, sender, subject, body, item, sent_at, read_at, claimed_at FROM server_post WHERE id = ? AND to_id = ?')
    .bind(id, reader.id).first();
  if (!row) return { error: 'no-post' };
  if (row.read_at == null) await db.prepare('UPDATE server_post SET read_at = ? WHERE id = ? AND to_id = ? AND read_at IS NULL').bind(nowS, id, reader.id).run();
  return { post: { ...headOf(row), body: row.body, read: true, readAt: row.read_at ?? nowS } };
}

/** @param {any} ctx @param {any} reader @param {{ id?: unknown, character?: unknown, realm?: unknown }} body */
export async function claimPost(ctx, reader, { id, character, realm = null } = {}) {
  const { db, bucket, nowS } = ctx;
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, reader.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  if (typeof id !== 'string' || !POST_ID_RE.test(id)) return { error: 'no-post' };
  const row = await db.prepare('SELECT id, batch, item, claimed_at FROM server_post WHERE id = ? AND to_id = ?').bind(id, reader.id).first();
  if (!row) return { error: 'no-post' };
  const rec = recordOf(row);
  if (!rec) return { error: 'post-no-item' };
  if (row.claimed_at != null) return { error: 'post-claimed' };
  const prep = await prepareRealmRecord(ctx, reader.id, side.at, (save) => { giveTradeGoods(save, [rec], 0); return null; }, { witness: !isLostBatch(row.batch) });
  if ('error' in prep) return prep;
  try {
    await db.batch([
      ...prep.steps,
      // With mustChange below, the item enters the record only when this statement stamps the post claimed.
      db.prepare('UPDATE server_post SET claimed_at = ?, claimed_by = ?, read_at = COALESCE(read_at, ?) WHERE id = ? AND to_id = ? AND claimed_at IS NULL')
        .bind(nowS, character, nowS, id, reader.id),
      mustChange(db),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, reader.id, side.at.id, prep.key);
    const moved = await recordMovedOf(db, reader.id, side.at);
    if (moved) return moved;
    const again = await db.prepare('SELECT claimed_at FROM server_post WHERE id = ? AND to_id = ?').bind(id, reader.id).first();
    return { error: !again ? 'no-post' : again.claimed_at != null ? 'post-claimed' : 'server' };
  }
  await dropObjects(bucket, [prep.prev]);
  return { ok: true, id, item: rec, realm: { seq: prep.seq } };
}

/** @param {{ db: any }} ctx @param {any} reader @param {unknown} id */
export async function deletePost({ db }, reader, id) {
  if (typeof id !== 'string' || !POST_ID_RE.test(id)) return { error: 'no-post' };
  const row = await db.prepare('SELECT id, item, claimed_at FROM server_post WHERE id = ? AND to_id = ?').bind(id, reader.id).first();
  if (!row) return { error: 'no-post' };
  if (recordOf(row) && row.claimed_at == null) return { error: 'post-unclaimed' };
  // The delete matches the row as it was read, so a claim that lands in between keeps the post.
  const r = await db.prepare('DELETE FROM server_post WHERE id = ? AND to_id = ? AND claimed_at IS ? AND item IS ?').bind(id, reader.id, row.claimed_at, row.item).run();
  return r?.meta?.changes ? { ok: true, id } : { error: 'no-post' };
}
