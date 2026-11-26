// @ts-check

import { mintId, overRate } from './accounts.js';
import { asks, shut, trackView, trackRow, renownAnswer, focusXpSql } from './professions.js';
import { marksOpenFor, balanceOf } from './marks.js';
import { prepareRealmRecord, realmActFirst, recordMovedOf, mustChange, dropObjects, dropIfUnnamed } from './realm.js';
import { chaptersOpenFor } from './npcRoll.js';
import { renownHeldSql } from './renownTracks.js';
import { utcDay, MARKS_MAX } from '../../src/net/marksLaw.js';
import { RENOWN_XP_MAX, RENOWN_TRACKS_MAX } from '../../src/net/renown.js';
import { PROF_OPS_MAX, PROF_OPS_WINDOW_S, PROF_XP_MAX, rankOfXp } from '../../src/net/professionLaw.js';
import { halfXp } from '../../src/net/craft/craftLaw.js';
import { HALL_WRIT_REP } from '../../src/net/npcChapterLaw.js';
import { MAX_REPUTATION } from '../../src/guilds/guildFactions.js';
import { COOKING_RECIPES, DISHES } from '../../src/net/recipeLaw.js';
import { craftWritsFor, craftWritId, CRAFT_WRIT_ID_RE, CRAFT_WRITS_PER_DAY, CRAFT_WRIT_SLOTS, craftProductOf, takeCraftGoods } from '../../src/net/craftWritLaw.js';

const DAY_S = 86_400;
export const CRAFT_PIECES_SHOWN = 60;

const recipesOf = (/** @type {string} */ product) => {
  const p = craftProductOf(product);
  if (!p || p.kind === 'potion') return [];
  return p.kind === 'dish' ? COOKING_RECIPES.filter((r) => r.product === p.id).map((r) => r.id) : [p.key];
};

// Bind `product`, never name the column. Inside the fill's UPDATE, SQLite resolves `craft_writs.product` to the
// subquery row, which counts every filled writ against the brews.
export const brewedLeftSql = (p, c, potion, product) => `(COALESCE((SELECT SUM(count) FROM prof_brews WHERE player = ${p} AND char_id = ${c} AND potion = ${potion}), 0)
  + COALESCE((SELECT SUM(count) FROM prov_makes WHERE player = ${p} AND char_id = ${c} AND kind = 'cauldron' AND traits = json_array(${potion})), 0)
  - COALESCE((SELECT SUM(qty) FROM craft_writs WHERE player = ${p} AND filled_char = ${c} AND product = ${product} AND filled_at IS NOT NULL), 0))`;

const potDishOf = (/** @type {string} */ product) => {
  const p = craftProductOf(product);
  return p?.kind === 'dish' ? DISHES.find((d) => d.id === p.id)?.templateIndex ?? null : null;
};
export const potLeftSql = (p, c, dish, product) => `(COALESCE((SELECT SUM(count) FROM prov_makes WHERE player = ${p} AND char_id = ${c} AND kind = 'pot' AND dish = ${dish}), 0)
  - COALESCE((SELECT SUM(qty) FROM craft_writs WHERE player = ${p} AND filled_char = ${c} AND product = ${product} AND filled_at IS NOT NULL AND goods IS NULL), 0))`;

const pieceOkSql = (p, c, pv, recipes) => `EXISTS (SELECT 1 FROM products pk WHERE pk.provenance = ${pv} AND pk.owner = ${p} AND pk.char_id = ${c}
    AND pk.listed = 0 AND (pk.bought_with IS NOT 'gold' OR pk.loose = 1) AND pk.recipe IN (SELECT value FROM json_each(${recipes}))
    AND EXISTS (SELECT 1 FROM prof_crafts cr WHERE cr.player = ${p} AND (cr.provenance = pk.provenance OR cr.provenance2 = pk.provenance))
    AND NOT EXISTS (SELECT 1 FROM market_listings WHERE provenance = pk.provenance AND state = 'open')
    AND NOT EXISTS (SELECT 1 FROM market_auctions WHERE provenance = pk.provenance AND state = 'open')
    AND NOT EXISTS (SELECT 1 FROM market_deliveries WHERE provenance = pk.provenance AND collected = 0)
    AND NOT EXISTS (SELECT 1 FROM market_deliveries WHERE player = ${p} AND collected = 0 AND item IS NOT NULL AND json_extract(item, '$.provenance') = pk.provenance)
    AND NOT EXISTS (SELECT 1 FROM home_decor WHERE json_extract(item, '$.pv') = pk.provenance))`;

async function ranksOf(db, player) {
  const { results = [] } = await db.prepare(`SELECT t.profession, MAX(t.xp) AS xp FROM prof_tracks t JOIN realm_characters c ON c.id = t.char_id AND c.player = t.player AND c.dead_at IS NULL
    WHERE t.player = ?1 AND t.profession IN ('provisioning', 'smithing') GROUP BY t.profession`).bind(player).all();
  const xp = Object.fromEntries(results.map((r) => [r.profession, Number(r.xp) || 0]));
  return { provisioning: rankOfXp(xp.provisioning ?? 0), smithing: rankOfXp(xp.smithing ?? 0), smithed: (xp.smithing ?? 0) > 0 };
}

async function postCraftWrits(db, player, character, day) {
  const had = await db.prepare('SELECT COUNT(*) AS n FROM craft_writs WHERE day = ?1 AND player = ?2').bind(day, player).first();
  if (Number(had?.n ?? 0) >= CRAFT_WRIT_SLOTS) return;
  const writs = craftWritsFor(day, player, await ranksOf(db, player));
  if (!writs.length) return;
  await db.batch(writs.map((w) => db.prepare(`INSERT OR IGNORE INTO craft_writs (id, player, owner, day, slot, product, faction, tier, qty, pay, xp, renown, track, expires_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`)
    .bind(craftWritId(day, character, w.slot), player, character, day, w.slot, w.product, w.faction, w.tier, w.qty, w.pay, w.xp, w.renown, w.track, (day + 1) * DAY_S)));
}

const craftWritsToday = async (db, player, day) => Number((await db.prepare('SELECT COUNT(*) AS n FROM craft_writs WHERE player = ?1 AND day = ?2 AND filled_at IS NOT NULL')
  .bind(player, day).first())?.n ?? 0);

async function craftWritView(db, player, row, character) {
  const p = craftProductOf(row.product);
  const view = {
    id: row.id, product: row.product, kind: p?.kind ?? null, tier: Number(row.tier), faction: Number(row.faction), qty: Number(row.qty),
    pay: Number(row.pay), xp: Number(row.xp), renown: Number(row.renown), track: row.track, expiresAt: Number(row.expires_at),
    state: row.filled_at != null ? 'mine' : 'open',
  };
  if (row.filled_at != null || !p) return view;
  if (p.kind === 'potion') {
    const r = await db.prepare(`SELECT ${brewedLeftSql('?1', '?2', '?3', '?4')} AS n`).bind(player, character, p.id, row.product).first();
    return { ...view, brewed: Math.max(0, Number(r?.n ?? 0)) };
  }
  const { results = [] } = await db.prepare(`SELECT pr.provenance FROM products pr WHERE pr.owner = ?1 AND pr.char_id = ?2 AND pr.recipe IN (SELECT value FROM json_each(?3))
    AND ${pieceOkSql('?1', '?2', 'pr.provenance', '?3')} ORDER BY pr.made_at DESC, pr.rowid DESC LIMIT ?4`).bind(player, character, JSON.stringify(recipesOf(row.product)), CRAFT_PIECES_SHOWN).all();
  const dish = potDishOf(row.product);
  const pot = dish == null ? 0 : Number((await db.prepare(`SELECT ${potLeftSql('?1', '?2', '?3', '?4')} AS n`).bind(player, character, dish, row.product).first())?.n ?? 0);
  return { ...view, pieces: results.map((x) => String(x.provenance)), ...(dish == null ? {} : { pot: Math.max(0, pot) }) };
}

export async function craftWritBoard({ db, nowS }, player, env, { character } = {}) {
  const day = utcDay(nowS);
  const none = { crafts: { writs: [], today: { filled: 0, max: CRAFT_WRITS_PER_DAY } } };
  if (asks(player, { character, needRid: false }) || shut(player, env) || !marksOpenFor(player, env)) return none;
  if (!(await db.prepare('SELECT 1 FROM realm_characters WHERE id = ?1 AND player = ?2 AND dead_at IS NULL').bind(character, player.id).first())) return none;
  await postCraftWrits(db, player.id, character, day);
  const { results = [] } = await db.prepare('SELECT * FROM craft_writs WHERE day = ?1 AND player = ?2 ORDER BY slot').bind(day, player.id).all();
  return { crafts: { writs: await Promise.all(results.map((r) => craftWritView(db, player.id, r, character))), today: { filled: await craftWritsToday(db, player.id, day), max: CRAFT_WRITS_PER_DAY } } };
}

async function craftAnswer(db, player, row, nowS, extra = {}) {
  return {
    ok: true, ...extra, writ: await craftWritView(db, player.id, row, row.filled_char), pay: Number(row.pay), xp: Number(row.xp_given ?? 0),
    balance: await balanceOf(db, player.id),
    track: trackView(await trackRow(db, player.id, row.filled_char, row.track), row.track, nowS),
    today: { filled: await craftWritsToday(db, player.id, Number(row.day)), max: CRAFT_WRITS_PER_DAY },
  };
}

export async function deliverCraftWrit(ctx, player, env, { character, id, rid, realm = null, pieces = null } = {}) {
  const { db, nowS, rand, bucket } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  const prior = await db.prepare('SELECT * FROM craft_writs WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return craftAnswer(db, player, prior, nowS, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!marksOpenFor(player, env)) return { error: 'marks-closed' };
  const w = typeof id === 'string' && CRAFT_WRIT_ID_RE.test(id) ? await db.prepare('SELECT * FROM craft_writs WHERE id = ?1').bind(id).first() : null;
  if (!w || w.player !== player.id) return { error: 'no-writ' };
  // A writ filled under another request is refused, not answered `repeat`. A realm act's `ok` tells the client
  // that goods left the record, and here nothing moved.
  if (w.filled_at != null) return { error: 'craft-writ-filled' };
  const day = utcDay(nowS);
  if (Number(w.day) !== day || Number(w.expires_at) <= nowS) return { error: 'writ-expired' };
  const p = craftProductOf(w.product);
  if (!p) return { error: 'no-writ' };
  const qty = Number(w.qty);
  const potDish = p.kind === 'dish' && pieces == null ? potDishOf(w.product) : null;
  const goods = p.kind === 'potion' || potDish != null ? null : pieces;
  if (goods !== null && (!Array.isArray(goods) || goods.length !== qty || new Set(goods).size !== qty)) return { error: 'craft-pieces' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => (takeCraftGoods(save, { product: w.product, qty }, goods) ? null : 'craft-goods-gone'), { outbound: true });
  if (prep.error) return prep;
  const nonce = mintId(rand);
  const cap = PROF_XP_MAX;
  const filled = 'EXISTS (SELECT 1 FROM craft_writs WHERE id = ?5 AND n = ?6)';
  const goodsOk = p.kind === 'potion'
    ? `${brewedLeftSql('?1', '?2', '?10', '?11')} >= craft_writs.qty`
    : potDish != null ? `${potLeftSql('?1', '?2', '?10', '?11')} >= craft_writs.qty`
    : `(SELECT COUNT(*) FROM json_each(?10) g WHERE ${pieceOkSql('?1', '?2', 'g.value', '?11')}) = craft_writs.qty`;
  const batch = [
    ...prep.steps,
    db.prepare(`UPDATE craft_writs SET filled_at = ?3, filled_char = ?2, rid = ?4, n = ?6, goods = ?12,
        xp_given = MAX(0, MIN(${focusXpSql('?1', '?2', w.track, 'xp', halfXp(Number(w.xp) || 0))}, ${cap} - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = craft_writs.track), 0)))
      WHERE id = ?5 AND player = ?1 AND filled_at IS NULL AND day = ?7 AND expires_at > ?3
        AND NOT EXISTS (SELECT 1 FROM craft_writs WHERE player = ?1 AND rid = ?4)
        AND (SELECT COUNT(*) FROM craft_writs WHERE player = ?1 AND day = ?7 AND filled_at IS NOT NULL) < ?8
        AND COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) + craft_writs.pay <= ?9
        AND ${goodsOk}`)
      .bind(player.id, character, nowS, rid, id, nonce, day, CRAFT_WRITS_PER_DAY, MARKS_MAX, p.kind === 'potion' ? p.id : potDish != null ? potDish : JSON.stringify(goods),
        p.kind === 'potion' || potDish != null ? w.product : JSON.stringify(recipesOf(w.product)), goods ? JSON.stringify(goods) : null),
    mustChange(db),
    db.prepare(`DELETE FROM products WHERE provenance IN (SELECT value FROM json_each((SELECT goods FROM craft_writs WHERE id = ?1 AND n = ?2)))`).bind(id, nonce),
    db.prepare(`INSERT OR IGNORE INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'mint', NULL, 'account', ?1, 'craft-writ', pay, day, ?2, ?1, product, 'craft:' || id FROM craft_writs WHERE id = ?3 AND n = ?4`)
      .bind(player.id, nowS, id, nonce),
    db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
      SELECT ?1, ?2, track, MIN(${cap}, xp_given), ?3 FROM craft_writs WHERE id = ?4 AND n = ?5 AND xp_given > 0
      ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MAX(prof_tracks.xp, MIN(${cap}, prof_tracks.xp + excluded.xp)), updated_at = excluded.updated_at`)
      .bind(player.id, character, nowS, id, nonce),
    db.prepare(`UPDATE renown_tracks SET xp = MIN(?7, xp + (SELECT renown FROM craft_writs WHERE id = ?5 AND n = ?6)), updated_at = ?3
      WHERE player = ?1 AND char_id = ?2 AND ${filled}`).bind(player.id, character, nowS, rid, id, nonce, RENOWN_XP_MAX),
    db.prepare(`INSERT INTO renown_tracks (player, char_id, name, xp, last_rid, created_at, updated_at)
      SELECT ?1, ?2, NULL, MIN(?7, renown), NULL, ?3, ?3 FROM craft_writs WHERE id = ?5 AND n = ?6 AND renown > 0
        AND NOT EXISTS (SELECT 1 FROM renown_tracks WHERE player = ?1 AND char_id = ?2)
        AND ${renownHeldSql('?1')} < ?8`).bind(player.id, character, nowS, rid, id, nonce, RENOWN_XP_MAX, RENOWN_TRACKS_MAX),
    ...(chaptersOpenFor(player, env) ? [
      db.prepare(`UPDATE npc_roll_heads SET seq = seq + 1, tag = ?3, updated_at = ?4 WHERE char_id = ?2 AND player = ?1 AND EXISTS (SELECT 1 FROM craft_writs WHERE id = ?5 AND n = ?3)
        AND EXISTS (SELECT 1 FROM realm_characters WHERE id = ?2 AND player = ?1 AND dead_at IS NULL)`)
        .bind(player.id, character, nonce, nowS, id),
      db.prepare(`UPDATE npc_roll SET rep = MIN(?4, rep + ?3), owed = MAX(0, MIN(owed, ?4 - MIN(?4, rep + ?3)))
        WHERE char_id = ?2 AND player = ?1 AND faction_id = (SELECT faction FROM craft_writs WHERE id = ?5 AND n = ?6)
          AND EXISTS (SELECT 1 FROM npc_roll_heads WHERE char_id = ?2 AND tag = ?6)`)
        .bind(player.id, character, HALL_WRIT_REP, MAX_REPUTATION, id, nonce),
    ] : []),
  ];
  const before = Number((await db.prepare('SELECT xp FROM renown_tracks WHERE player = ?1 AND char_id = ?2').bind(player.id, character).first())?.xp ?? 0);
  try {
    await db.batch(batch);
    await dropObjects(bucket, [prep.prev]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, side.at.id, prep.key);
    const moved = await recordMovedOf(db, player.id, side.at);
    if (moved && !(moved.error === 'seq' && moved.seq === prep.seq)) return moved;
  }
  const now = await db.prepare('SELECT * FROM craft_writs WHERE id = ?1').bind(id).first();
  if (now?.n === nonce) {
    const after = Number((await db.prepare('SELECT xp FROM renown_tracks WHERE player = ?1 AND char_id = ?2').bind(player.id, character).first())?.xp ?? before);
    return craftAnswer(db, player, now, nowS, { realm: { seq: prep.seq }, renown: renownAnswer(character, before, after) });
  }
  const byRid = await db.prepare('SELECT * FROM craft_writs WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (byRid) return craftAnswer(db, player, byRid, nowS, { repeat: true });
  if (now?.filled_at != null) return { error: 'craft-writ-filled' };
  if (Number(now?.expires_at ?? 0) <= nowS) return { error: 'writ-expired' };
  if ((await craftWritsToday(db, player.id, day)) >= CRAFT_WRITS_PER_DAY) return { error: 'craft-writ-cap' };
  if ((await balanceOf(db, player.id)) + Number(w.pay) > MARKS_MAX) return { error: 'marks-full' };
  return { error: p.kind === 'potion' || potDish != null ? 'craft-unbrewed' : 'craft-pieces' };
}

export async function sweepCraftWrits(db, nowS, limit = 500) {
  const r = await db.prepare('DELETE FROM craft_writs WHERE id IN (SELECT id FROM craft_writs WHERE filled_at IS NULL AND expires_at < ?1 LIMIT ?2)')
    .bind(nowS - DAY_S, limit).run();
  return Number(r?.meta?.changes ?? 0);
}
