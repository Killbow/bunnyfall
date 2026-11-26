// @ts-check
import { realmActFirst, prepareRealmRecord, mustChange, dropIfUnnamed, recordMovedOf, dropObjects } from './realm.js';
import { payFromSave, creditSave } from '../../src/net/realmGoldLaw.js';
import { regionOk } from '../../src/net/nodeLaw.js';
import { seaRoomOf } from '../../src/net/wire.js';
import { REALM_CHARACTER_RE } from '../../src/net/identityToken.js';
import { SEA_WANTED_DAYS, SEA_BOARD_MAX, SEA_BOUNTY_RID_RE, seaBountyGoldOk } from '../../src/net/sea/seaBountyLaw.js';

const DAY_S = 86_400;
export const SEA_COLLECT_ROWS = 64;
export const SEA_REFUND_AFTER_S = 2 * 3600;
const GONE_HEAD = 'NOT EXISTS (SELECT 1 FROM realm_characters c WHERE c.id = sea_bounties.target_char AND (c.dead_at IS NULL OR c.dead_at > ?3))';
export const seaRefundSteps = (/** @type {any} */ db, /** @type {string} */ poster, /** @type {string} */ posterChar, /** @type {number} */ nowS) => [
  db.prepare(`INSERT OR IGNORE INTO sea_bounty_owed (r, killer, killer_char, target_char, gold, at) SELECT 'back:' || id, poster, poster_char, target_char, gold, ?4
    FROM sea_bounties WHERE poster = ?1 AND poster_char = ?2 AND claimed_r IS NULL AND ${GONE_HEAD}`).bind(poster, posterChar, nowS - SEA_REFUND_AFTER_S, nowS),
  db.prepare(`UPDATE sea_bounties SET claimed_r = 'back:' || id WHERE poster = ?1 AND poster_char = ?2 AND claimed_r IS NULL AND ${GONE_HEAD}`).bind(poster, posterChar, nowS - SEA_REFUND_AFTER_S),
];
export const SEA_ENDED_KEEP_S = 30 * DAY_S;
export const seaSweeps = (/** @type {number} */ nowS) => /** @type {[string, number][]} */ ([
  ['DELETE FROM sea_kills WHERE r IN (SELECT r FROM sea_kills WHERE at < ?1 LIMIT ?2)', nowS - SEA_WANTED_DAYS * DAY_S],
  ['DELETE FROM sea_wrecks WHERE r IN (SELECT r FROM sea_wrecks WHERE at < ?1 LIMIT ?2)', nowS - 2 * 3600],
  ['DELETE FROM sea_bounties WHERE id IN (SELECT id FROM sea_bounties WHERE claimed_r IS NOT NULL AND at < ?1 LIMIT ?2)', nowS - SEA_ENDED_KEEP_S],
  ['DELETE FROM sea_bounty_owed WHERE r IN (SELECT r FROM sea_bounty_owed WHERE paid_at IS NOT NULL AND paid_at < ?1 LIMIT ?2)', nowS - SEA_ENDED_KEEP_S],
  ["DELETE FROM sea_prizes WHERE rowid IN (SELECT rowid FROM sea_prizes WHERE state != 'held' AND ended_at < ?1 LIMIT ?2)", nowS - SEA_ENDED_KEEP_S],
]);
const postIdOf = (rand) => { const b = new Uint8Array(10); rand(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const standing = async (db, target) => Number((await db.prepare('SELECT COALESCE(SUM(gold), 0) AS n FROM sea_bounties WHERE target_char = ?1 AND claimed_r IS NULL').bind(target).first())?.n ?? 0);

/** @param {any} db @param {any} claims @param {number} nowS */
export function seaKillSteps(db, claims, nowS) {
  const { r, f, c, k, kc, m } = claims ?? {};
  if (!k || !c || typeof kc !== 'string' || !REALM_CHARACTER_RE.test(kc) || !seaRoomOf(m)) return [];
  return [
    db.prepare('UPDATE sea_bounties SET claimed_r = ?1 WHERE target_char = ?2 AND claimed_r IS NULL AND NOT EXISTS (SELECT 1 FROM sea_kills WHERE r = ?1)').bind(r, c),
    db.prepare('INSERT OR IGNORE INTO sea_kills (r, killer, killer_char, victim, victim_char, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(r, k, kc, f, c, nowS),
    db.prepare('INSERT OR IGNORE INTO sea_bounty_owed (r, killer, killer_char, target_char, gold, at) SELECT ?1, ?2, ?3, ?4, SUM(gold), ?5 FROM sea_bounties WHERE claimed_r = ?1 HAVING SUM(gold) > 0')
      .bind(r, k, kc, c, nowS),
  ];
}

/** @param {any} ctx @param {any} player @param {any} body */
export async function seaBountyBoard(ctx, player, body) {
  const { db, nowS } = ctx;
  const since = nowS - SEA_WANTED_DAYS * DAY_S;
  const rows = await db.prepare(`SELECT w.ch AS ch, rc.name AS name, COALESCE(k.n, 0) AS kills, COALESCE(b.gold, 0) AS bounty FROM (
      SELECT killer_char AS ch FROM sea_kills WHERE at >= ?1 UNION SELECT target_char FROM sea_bounties WHERE claimed_r IS NULL
    ) w
    JOIN realm_characters rc ON rc.id = w.ch AND rc.dead_at IS NULL
    LEFT JOIN (SELECT killer_char, COUNT(*) AS n FROM sea_kills WHERE at >= ?1 GROUP BY killer_char) k ON k.killer_char = w.ch
    LEFT JOIN (SELECT target_char, SUM(gold) AS gold FROM sea_bounties WHERE claimed_r IS NULL GROUP BY target_char) b ON b.target_char = w.ch
    ORDER BY bounty DESC, kills DESC, rc.name LIMIT ?2`).bind(since, SEA_BOARD_MAX).all();
  const character = typeof body?.character === 'string' && REALM_CHARACTER_RE.test(body.character) ? body.character : null;
  const owed = character ? Number((await db.prepare('SELECT COALESCE(SUM(gold), 0) AS n FROM sea_bounty_owed WHERE killer = ?1 AND killer_char = ?2 AND paid_at IS NULL').bind(player.id, character).first())?.n ?? 0) : 0;
  const refund = character ? Number((await db.prepare(`SELECT COALESCE(SUM(gold), 0) AS n FROM sea_bounties WHERE poster = ?1 AND poster_char = ?2 AND claimed_r IS NULL AND ${GONE_HEAD}`)
    .bind(player.id, character, nowS - SEA_REFUND_AFTER_S).first())?.n ?? 0) : 0;
  const [pr, bk] = character ? await db.batch([
    db.prepare("SELECT COUNT(*) AS n FROM sea_prizes WHERE killer = ?1 AND killer_char = ?2 AND state = 'held' AND until_s > ?3").bind(player.id, character, nowS),
    db.prepare("SELECT COUNT(*) AS n FROM sea_prizes WHERE victim = ?1 AND victim_char = ?2 AND state = 'held' AND until_s <= ?3").bind(player.id, character, nowS),
  ]) : [null, null];
  return {
    wanted: (rows.results ?? []).map((x) => ({ char: x.ch, name: x.name, kills: Number(x.kills), bounty: Number(x.bounty) })),
    owed, refund, mine: character ? await standing(db, character) : 0,
    prizes: Number(pr?.results?.[0]?.n ?? 0), back: Number(bk?.results?.[0]?.n ?? 0),
  };
}

/** @param {any} ctx @param {any} player @param {any} body */
export async function seaBountyPost(ctx, player, { character, realm = null, region, target, gold, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'sea-bounty-realm' };
  if (typeof rid !== 'string' || !SEA_BOUNTY_RID_RE.test(rid)) return { error: 'bad-rid' };
  const prior = await db.prepare('SELECT id, target_char, gold FROM sea_bounties WHERE poster = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return { ok: true, repeat: true, id: prior.id, gold: Number(prior.gold), bounty: await standing(db, prior.target_char) };
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!seaBountyGoldOk(gold)) return { error: 'sea-bounty-gold' };
  if (typeof target !== 'string' || !REALM_CHARACTER_RE.test(target)) return { error: 'sea-bounty-target' };
  const wanted = await db.prepare(`SELECT player FROM realm_characters WHERE id = ?1 AND dead_at IS NULL AND (
      EXISTS (SELECT 1 FROM sea_kills WHERE killer_char = ?1 AND at >= ?2) OR EXISTS (SELECT 1 FROM sea_bounties WHERE target_char = ?1 AND claimed_r IS NULL))`)
    .bind(target, nowS - SEA_WANTED_DAYS * DAY_S).first();
  if (!wanted) return { error: 'sea-bounty-not-wanted' };
  if (wanted.player === player.id) return { error: 'sea-bounty-self' };
  const id = postIdOf(rand);
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => (payFromSave(save, gold, region) ? null : 'realm-gold'), { outbound: true });
  if (prep.error) return prep;
  try {
    await db.batch([
      ...prep.steps,
      db.prepare('INSERT INTO sea_bounties (id, poster, poster_char, rid, target_char, gold, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)').bind(id, player.id, character, rid, target, gold, nowS),
    ]);
  } catch {
    await dropIfUnnamed(db, ctx.bucket, player.id, side.at.id, prep.key);
    const moved = await recordMovedOf(db, player.id, side.at);
    if (moved) return moved;
    return { error: 'sea-bounty-failed' };
  }
  await dropObjects(ctx.bucket, [prep.prev]);
  return { ok: true, id, gold, bounty: await standing(db, target), realm: { seq: prep.seq } };
}

/** @param {any} ctx @param {any} player @param {any} body */
export async function seaBountyCollect(ctx, player, { character, realm = null, region } = {}) {
  const { db, nowS } = ctx;
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'sea-bounty-realm' };
  if (!regionOk(region)) return { error: 'bad-region' };
  await db.batch(seaRefundSteps(db, player.id, character, nowS));
  const rows = (await db.prepare('SELECT r, gold FROM sea_bounty_owed WHERE killer = ?1 AND killer_char = ?2 AND paid_at IS NULL ORDER BY at, r LIMIT ?3').bind(player.id, character, SEA_COLLECT_ROWS).all()).results ?? [];
  const gold = rows.reduce((n, x) => n + Number(x.gold), 0);
  if (!rows.length || !(gold > 0)) return { ok: true, gold: 0 };
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => (creditSave(save, gold, { bank: region }) ? null : 'bad-gold'));
  if (prep.error) return prep;
  const rs = rows.map((x) => x.r);
  const settle = db.prepare(`UPDATE sea_bounty_owed SET paid_at = ?3 WHERE killer = ?1 AND killer_char = ?2 AND paid_at IS NULL AND r IN (${rs.map((_, i) => `?${i + 4}`).join(', ')})`)
    .bind(player.id, character, nowS, ...rs);
  try {
    // mustChange fails the batch unless every owed row changed, so a collect that landed first pays nothing twice.
    await db.batch([...prep.steps, settle, mustChange(db, rs.length)]);
  } catch {
    await dropIfUnnamed(db, ctx.bucket, player.id, side.at.id, prep.key);
    const moved = await recordMovedOf(db, player.id, side.at);
    if (moved) return moved;
    return { error: 'sea-bounty-failed' };
  }
  await dropObjects(ctx.bucket, [prep.prev]);
  return { ok: true, gold, realm: { seq: prep.seq } };
}
