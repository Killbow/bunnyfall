// @ts-check
import { mintId } from './accounts.js';
import { canModerate } from './titles.js';
import { titheAt } from './seatHolding.js';
import { listingsCapAt } from './seatForts.js';
import { storeOf, silverClothIn } from './professions.js';
import { readAll } from './service.js';
import { MARKS_MAX, utcDay } from '../../src/net/marksLaw.js';
import { STORES_MAX } from '../../src/net/professionLaw.js';
import { material, regionOk } from '../../src/net/nodeLaw.js';
import { MARKET_SHOWN, MARKET_HISTORY_SHOWN, MARKET_TRADES_SHOWN, MARKET_MEDIAN_DAYS, MARKET_KEEP_DAYS, MARKET_VIEWS, saleTaxOn, saleTithe, UNYIELDED, medianOf, medianLine, marketCatalogue, AUCTION_GRACE_S, auctionNext, currencyOk, goodFamily, MARKET_HELD_MAX, marketPageOf, marketSortOf, marketQualityOf, marketRecipesOf } from '../../src/net/marketLaw.js';
import { PROVENANCE_RE } from '../../src/net/recipeLaw.js';
import { DAY_S, BOUGHT_ORIGIN_SQL, RECENT_S, SETTLE_MAX, asks, shut, hubsOf, hubKeysOf, hubsStatement, hubsFrom, courierOf, courierSlow, pieceOf, GONE_RECIPE_SQL, goodOf, GOODS_FAMILY_SQL, CRAFTED_LISTED, pieceKeys, PIECE_ORDER, AUCTION_ORDER, pageSql, listingView, auctionView, bidView, netSql, leastNetSql, boardOf, rowBoard, titheEnd, openSalesSql, orderView } from './marketShared.js';

export function settleReads(db, me, nowS) {
  return [
    db.prepare(`SELECT EXISTS (SELECT 1 FROM market_listings WHERE seller = ?1 AND state = 'open' AND expires_at <= ?2)
      OR EXISTS (SELECT 1 FROM market_orders WHERE poster = ?1 AND state = 'open' AND expires_at <= ?2) AS due`).bind(me, nowS),
    settleBackRead(db, me),
    db.prepare(`SELECT id FROM market_auctions WHERE seller = ?1 AND state IN ('unsold', 'removed') AND returned = 0
    ORDER BY closed_at LIMIT ${SETTLE_MAX}`).bind(me),
    db.prepare(`SELECT id FROM market_bids WHERE bidder = ?1 AND state IN ('outbid', 'void') AND returned = 0
      AND COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) + amount + courier <= ?2
    ORDER BY at LIMIT ${SETTLE_MAX}`).bind(me, MARKS_MAX),
    settleOrdersRead(db, me),
    db.prepare(`SELECT rid, char_id, material FROM market_sales WHERE buyer = ?1 AND kind = 'material' AND delivered = 0 AND arrives_at <= ?2
      AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = market_sales.char_id AND material = market_sales.material), 0) + units <= ?3
    ORDER BY arrives_at LIMIT ${SETTLE_MAX}`).bind(me, nowS, STORES_MAX),
  ];
}
export const settleBackRead = (db, me) => db.prepare(`SELECT * FROM market_listings WHERE seller = ?1 AND state IN ('expired', 'removed') AND returned = 0
      AND (kind IN ('piece', 'item') OR COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = market_listings.seller AND char_id = market_listings.char_id
        AND material = market_listings.material), 0) + own + bought <= ?2)
    ORDER BY closed_at LIMIT ${SETTLE_MAX}`).bind(me, STORES_MAX);
export const settleOrdersRead = (db, me) => db.prepare(`SELECT id FROM market_orders WHERE poster = ?1 AND state != 'open' AND returned = 0
      AND (escrow = 0 OR COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) + escrow <= ?2)
    ORDER BY closed_at LIMIT ${SETTLE_MAX}`).bind(me, MARKS_MAX);

export async function settle(ctx, player, read = null) {
  const { db, nowS, rand } = ctx;
  const me = player.id;
  const touched = new Set();
  let [due, back, unsold, outbid, shutOrders, loads] = read ?? await readAll(db, settleReads(db, me, nowS));
  if (Number(due[0]?.due)) {
    [, , back, shutOrders] = await readAll(db, [
      db.prepare(`UPDATE market_listings SET state = 'expired', closed_at = ?2 WHERE seller = ?1 AND state = 'open' AND expires_at <= ?2`).bind(me, nowS),
      db.prepare(`UPDATE market_orders SET state = 'expired', closed_at = ?2 WHERE poster = ?1 AND state = 'open' AND expires_at <= ?2`).bind(me, nowS),
      settleBackRead(db, me),
      settleOrdersRead(db, me),
    ]);
  }
  // Rows run in order, so a return reads the Stores the one before it filled.
  const work = [];
  for (const l of back) {
    const nonce = mintId(rand);
    if (l.kind === 'item') {
      work.push(
        db.prepare(`UPDATE market_listings SET returned = 1, rn = ?2 WHERE id = ?1 AND returned = 0`).bind(l.id, nonce),
        db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, item, why, from_region, arrives_at, at)
          SELECT id, seller, char_id, item, 'returned', region, ?2, ?2 FROM market_listings WHERE id = ?1 AND rn = ?3 AND kind = 'item'`).bind(l.id, nowS, nonce),
      );
      continue;
    }
    if (l.kind === 'piece') {
      work.push(
        db.prepare(`UPDATE market_listings SET returned = 1, rn = ?2 WHERE id = ?1 AND returned = 0`).bind(l.id, nonce),
        db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, provenance, wear, why, from_region, arrives_at, at)
          SELECT id, seller, char_id, provenance, wear, 'returned', region, ?2, ?2 FROM market_listings WHERE id = ?1 AND rn = ?3 AND ${NO_ESCROW('market_listings.provenance')}`).bind(l.id, nowS, nonce),
        ...pieceBackSteps(db, l.id, nowS, 'SELECT provenance, seller, char_id, region FROM market_listings WHERE id = ?1 AND rn = ?2', [l.id, nonce]),
        db.prepare(`UPDATE products SET listed = 0 WHERE provenance = (SELECT provenance FROM market_listings WHERE id = ?1 AND rn = ?2)`).bind(l.id, nonce),
      );
      continue;
    }
    work.push(
      db.prepare(`UPDATE market_listings SET returned = 1, rn = ?2 WHERE id = ?1 AND returned = 0
        AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = market_listings.seller AND char_id = market_listings.char_id AND material = market_listings.material), 0)
          + own + bought <= ?3`).bind(l.id, nonce, STORES_MAX),
      ...backToStores(db, l.id, nonce),
    );
    touched.add(`${l.char_id}|${l.material}`);
  }
  for (const a of unsold) {
    const nonce = mintId(rand);
    work.push(
      db.prepare(`UPDATE market_auctions SET returned = 1, rn = ?2 WHERE id = ?1 AND returned = 0 AND state IN ('unsold', 'removed')`).bind(a.id, nonce),
      db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, provenance, wear, why, from_region, arrives_at, at)
        SELECT id, seller, char_id, provenance, wear, 'returned', region, ?2, ?2 FROM market_auctions WHERE id = ?1 AND rn = ?3 AND ${NO_ESCROW('market_auctions.provenance')}`).bind(a.id, nowS, nonce),
      ...pieceBackSteps(db, a.id, nowS, 'SELECT provenance, seller, char_id, region FROM market_auctions WHERE id = ?1 AND rn = ?2', [a.id, nonce]),
      db.prepare(`UPDATE products SET listed = 0 WHERE provenance = (SELECT provenance FROM market_auctions WHERE id = ?1 AND rn = ?2)`).bind(a.id, nonce),
    );
  }
  for (const b of outbid) {
    work.push(
      db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'escrow', id, 'account', bidder, 'bid-return', amount + courier, ?2, ?3, bidder, auction, 'bid-return:' || id FROM market_bids
        WHERE id = ?1 AND state IN ('outbid', 'void') AND returned = 0
          AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = market_bids.bidder AND rid = 'bid-return:' || ?1)
          AND COALESCE((SELECT balance FROM marks WHERE account = market_bids.bidder), 0) + amount + courier <= ?4`).bind(b.id, utcDay(nowS), nowS, MARKS_MAX),
      db.prepare(`UPDATE market_bids SET returned = 1 WHERE id = ?1 AND returned = 0
        AND EXISTS (SELECT 1 FROM marks_ledger WHERE actor = market_bids.bidder AND rid = 'bid-return:' || ?1)`).bind(b.id),
    );
  }
  for (const o of shutOrders) work.push(...orderReturn(db, o.id, nowS));
  for (const s of loads) {
    const nonce = mintId(rand);
    work.push(
      db.prepare(`UPDATE market_sales SET delivered = 1, dn = ?3 WHERE buyer = ?1 AND rid = ?2 AND delivered = 0
        AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = market_sales.char_id AND material = market_sales.material), 0) + units <= ?4`)
        .bind(me, s.rid, nonce, STORES_MAX),
      db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
        SELECT buyer, char_id, material, ${BOUGHT_ORIGIN_SQL}, units FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND dn = ?3
        ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(me, s.rid, nonce),
      silverClothIn(db, "SELECT buyer AS player, char_id, material, units AS qty FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND dn = ?3 AND currency IS NOT 'gold'", [me, s.rid, nonce]),
    );
    touched.add(`${s.char_id}|${s.material}`);
  }
  if (work.length) await db.batch(work);
  return touched;
}
export const liveBidSql = (a) => `EXISTS (SELECT 1 FROM market_bids WHERE id = ${a}.high_bid AND state = 'high')`;
export const sellerBalanceSql = (a) => `COALESCE((SELECT balance FROM marks WHERE account = ${a}.seller), 0)`;
// Picks any auction that could close under the largest Tithe, surely closable first, so a sale that must wait
// never fills the page.
export const auctionsDueRead = (db, nowS) => db.prepare(`SELECT id, high, region, board_x, board_y, ends_at, ${liveBidSql('a')} AS live, ${sellerBalanceSql('a')} AS balance FROM market_auctions a
      WHERE state = 'open' AND ends_at <= ?1
        AND (NOT ${liveBidSql('a')} OR ${sellerBalanceSql('a')} + ${leastNetSql('high')} <= ?2 OR ends_at + ?3 <= ?1)
    ORDER BY (NOT ${liveBidSql('a')} OR ${sellerBalanceSql('a')} + ${netSql('high')} <= ?2 OR ends_at + ?3 <= ?1) DESC, ends_at LIMIT ${SETTLE_MAX}`).bind(nowS, MARKS_MAX, AUCTION_GRACE_S);
export async function closeAuctions(ctx, read = null) {
  const { db, nowS, rand } = ctx;
  const due = read ?? ((await auctionsDueRead(db, nowS).all()).results ?? []);
  const day = utcDay(nowS);
  let closed = 0;
  for (const a of due) {
    // The clock's firing stops early to stay under D1's statement limit per invocation.
    if (ctx.budget && !ctx.budget()) break;
    const nonce = mintId(rand);
    const high = a.high == null ? null : Number(a.high);
    const tt = high == null ? null : await titheAt(db, nowS, Number(a.region), rowBoard(a));
    const tithe = tt ? saleTithe(high, tt.pct) : 0;
    const tax = high == null ? 0 : saleTaxOn(0, high), gets = high == null ? 0 : high - tax - tithe;
    const room = Number(a.balance) + gets <= MARKS_MAX;
    if (Number(a.live) && !room && Number(a.ends_at) + AUCTION_GRACE_S > nowS) continue;
    const won = `FROM market_auctions a JOIN market_bids b ON b.id = a.high_bid AND b.state = 'won' WHERE a.id = ?1 AND a.cn = ?2`;
    if (!Number(a.live) || !room) {
      const out = await db.batch([
        db.prepare(`UPDATE market_auctions SET state = 'unsold', closed_at = ?3, cn = ?2, returned = 0
          WHERE id = ?1 AND state = 'open' AND ends_at <= ?3 AND high IS ?4
            AND (NOT ${liveBidSql('market_auctions')} OR (ends_at + ?5 <= ?3
              AND COALESCE((SELECT balance FROM marks WHERE account = market_auctions.seller), 0) + ?6 > ?7))`)
          .bind(a.id, nonce, nowS, high, AUCTION_GRACE_S, gets, MARKS_MAX),
        db.prepare(`UPDATE market_bids SET state = 'void' WHERE id = (SELECT high_bid FROM market_auctions WHERE id = ?1 AND cn = ?2) AND state = 'high'`)
          .bind(a.id, nonce),
      ]);
      closed += Number(out?.[0]?.meta?.changes ?? 0);
      continue;
    }
    const sold = await db.batch([
      db.prepare(`UPDATE market_auctions SET state = 'sold', closed_at = ?3, cn = ?2, returned = 1, tithe = ?7
        WHERE id = ?1 AND state = 'open' AND ends_at <= ?3 AND high IS ?4 AND ${liveBidSql('market_auctions')}
          AND COALESCE((SELECT balance FROM marks WHERE account = market_auctions.seller), 0) + ?5 <= ?6`)
        .bind(a.id, nonce, nowS, high, gets, MARKS_MAX, tithe),
      db.prepare(`UPDATE market_bids SET state = 'won' WHERE id = (SELECT high_bid FROM market_auctions WHERE id = ?1 AND cn = ?2) AND state = 'high'`).bind(a.id, nonce),
      db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'escrow', b.id, 'account', a.seller, 'auction-sale', ?3, ?4, ?5, b.bidder, a.id, 'auction:' || a.id || ':sale' ${won}`)
        .bind(a.id, nonce, gets, day, nowS),
      ...(tax > 0 ? [db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'escrow', b.id, 'burn', NULL, 'market-tax', ?3, ?4, ?5, b.bidder, a.id, 'auction:' || a.id || ':tax' ${won}`)
        .bind(a.id, nonce, tax, day, nowS)] : []),
      ...(tithe > 0 ? [db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'escrow', b.id, CASE WHEN ${titheEnd('?6', '?3')} THEN 'guild' ELSE 'burn' END, CASE WHEN ${titheEnd('?6', '?3')} THEN ?6 END,
          'tithe', ?3, ?4, ?5, b.bidder, a.id, 'auction:' || a.id || ':tithe' ${won}`)
        .bind(a.id, nonce, tithe, day, nowS, tt.guild)] : []),
      db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'escrow', b.id, 'burn', NULL, 'courier', b.courier, ?3, ?4, b.bidder, a.id, 'auction:' || a.id || ':courier' ${won} AND b.courier > 0`)
        .bind(a.id, nonce, day, nowS),
      db.prepare(`UPDATE products SET owner = (SELECT b.bidder ${won}), credited = 0, listed = 0, bought_with = 'marks'   -- GOLD-MARKET: won with Drakes
        WHERE provenance = (SELECT provenance FROM market_auctions WHERE id = ?1 AND cn = ?2)
          AND EXISTS (SELECT 1 ${won})`).bind(a.id, nonce),
      db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, provenance, wear, why, from_region, arrives_at, at)
        SELECT ?3, b.bidder, b.char_id, a.provenance, a.wear, 'bought', a.region, ?4 + b.seconds, ?4 ${won}`)
        .bind(a.id, nonce, mintId(rand), nowS),
      ...pieceSoldSteps(db, `SELECT a.provenance ${won}`, [a.id, nonce]),
    ]);
    // Count only auctions the decisions closed, never ones merely picked, so the clock never repeats a page that
    // closed nothing.
    closed += Number(sold?.[0]?.meta?.changes ?? 0);
  }
  return closed;
}
// Each table's delete is bounded, because one unbounded batch can outrun D1's batch time limit and roll back.
/** @param {any} db @param {number} nowS @param {number} rows */
export async function pruneMarketHistory(db, nowS, rows) {
  const keepFrom = utcDay(nowS) - MARKET_KEEP_DAYS;
  const bounded = (/** @type {string} */ table, /** @type {string} */ where, /** @type {number} */ cutoff) =>
    db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ?2)`).bind(cutoff, rows);
  const out = await db.batch([
    bounded('market_prices', 'day < ?1', keepFrom),
    bounded('market_gold_prices', 'day < ?1', keepFrom),
    bounded('market_sales', 'day < ?1 AND delivered = 1', keepFrom),
    bounded('market_fills', 'day < ?1', keepFrom),
    bounded('market_listings', "state != 'open' AND closed_at < ?1 AND (returned = 1 OR state = 'sold')", keepFrom * DAY_S),
    bounded('market_orders', "state != 'open' AND closed_at < ?1 AND returned = 1", keepFrom * DAY_S),
    bounded('market_deliveries', 'collected = 1 AND at < ?1', keepFrom * DAY_S),
    bounded('market_bids', "at < ?1 AND state != 'high' AND (returned = 1 OR state = 'won')", keepFrom * DAY_S),
    bounded('market_auctions', `state != 'open' AND closed_at < ?1 AND returned = 1
      AND NOT EXISTS (SELECT 1 FROM market_bids WHERE auction = market_auctions.id)`, keepFrom * DAY_S),
    bounded('market_patron_sales', 'day < ?1', keepFrom),
  ]);
  const changes = out.map((/** @type {any} */ r) => Number(r?.meta?.changes ?? 0));
  return { changed: changes.reduce((n, c) => n + c, 0), full: changes.some((c) => c >= rows) };
}

export function backToStores(db, id, nonce) {
  return ['own', 'bought'].map((col) => db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT seller, char_id, material, ${col === 'own' ? "'own'" : BOUGHT_ORIGIN_SQL}, ${col} FROM market_listings WHERE id = ?1 AND rn = ?2 AND kind = 'material' AND ${col} > 0
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(id, nonce));
}
export function orderReturn(db, id, nowS) {
  return [
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'escrow', id, 'account', poster, 'order-return', escrow, ?2, ?3, poster, material, 'order-close:' || id FROM market_orders
      WHERE id = ?1 AND state != 'open' AND returned = 0 AND escrow > 0
        AND COALESCE((SELECT balance FROM marks WHERE account = market_orders.poster), 0) + escrow <= ?4`).bind(id, utcDay(nowS), nowS, MARKS_MAX),
    db.prepare(`UPDATE market_orders SET escrow = 0, returned = 1 WHERE id = ?1 AND state != 'open' AND returned = 0
      AND (escrow = 0 OR EXISTS (SELECT 1 FROM marks_ledger WHERE actor = market_orders.poster AND rid = 'order-close:' || ?1))`).bind(id),
  ];
}
export function roadReads(db, me) {
  return [
    db.prepare(`SELECT rid, char_id, material, units, from_region, arrives_at FROM market_sales
    WHERE buyer = ?1 AND kind = 'material' AND delivered = 0 ORDER BY arrives_at LIMIT 50`).bind(me),
    db.prepare(`SELECT d.id, d.char_id, d.wear, d.why, d.from_region, d.arrives_at, p.recipe, p.quality, p.seed, p.maker, p.marked, p.dye, p.hand, p.record,
    p.template, p.material, p.provenance FROM market_deliveries d JOIN products p ON p.provenance = d.provenance
    WHERE d.player = ?1 AND d.collected = 0 ORDER BY d.arrives_at LIMIT 50`).bind(me),
    db.prepare(`SELECT id, char_id, why, from_region, arrives_at, item FROM market_deliveries
    WHERE player = ?1 AND collected = 0 AND item IS NOT NULL ORDER BY arrives_at LIMIT 50`).bind(me),
  ];
}
export function roadFrom(/** @type {any[][]} */ [loads = [], pieces = [], goods = []], nowS) {
  return [
    ...loads.map((s) => ({ kind: 'material', id: s.rid, character: s.char_id, material: s.material, units: Number(s.units), from: Number(s.from_region),
      arrivesAt: Number(s.arrives_at), waiting: Number(s.arrives_at) <= nowS })),
    ...pieces.map((d) => ({ kind: 'piece', id: d.id, character: d.char_id, why: d.why, from: d.from_region == null ? null : Number(d.from_region),
      arrivesAt: Number(d.arrives_at), ready: Number(d.arrives_at) <= nowS, piece: pieceOf(d, d.wear) })),
    ...goods.map((d) => ({ kind: 'item', id: d.id, character: d.char_id, why: d.why, from: d.from_region == null ? null : Number(d.from_region),
      arrivesAt: Number(d.arrives_at), ready: Number(d.arrives_at) <= nowS, item: goodOf(d.item) })),
  ];
}

export const pieceIdsOf = (pieces) => (Array.isArray(pieces) ? [...new Set(pieces.filter((p) => typeof p === 'string' && PROVENANCE_RE.test(p)))].slice(0, MARKET_HELD_MAX) : []);
export const pieceWaysRead = (db, ids) => db.prepare(`SELECT p.provenance, p.owner, p.listed,
      (EXISTS (SELECT 1 FROM market_deliveries d WHERE d.provenance = p.provenance AND d.collected = 0)
        OR EXISTS (SELECT 1 FROM market_deliveries d WHERE d.player = p.owner AND d.collected = 0 AND d.item IS NOT NULL AND json_extract(d.item, '$.provenance') = p.provenance)) AS road,   -- INT19: or back as its record
      EXISTS (SELECT 1 FROM home_decor h WHERE json_extract(h.item, '$.pv') = p.provenance) AS standing
    FROM products p WHERE p.provenance IN (SELECT value FROM json_each(?1))`).bind(JSON.stringify(ids));
export function pieceWays(me, ids, /** @type {any[]} */ rows) {
  if (!ids.length) return {};
  const out = Object.fromEntries(ids.map((p) => [p, 'none']));
  for (const r of rows) out[r.provenance] = r.owner !== me ? 'other' : (Number(r.listed) || Number(r.road) || Number(r.standing)) ? 'elsewhere' : 'yours';
  return out;
}

export const mediansRead = (db, keys, today, currency = 'marks') => {
  const table = currency === 'gold' ? 'market_gold_prices' : 'market_prices';
  // One bound JSON array, because D1 takes at most 100 parameters per statement.
  return db.prepare(`SELECT day, material, price, units FROM ${table} WHERE day > ?1 AND material IN
    (SELECT value FROM json_each(?2))`).bind(today - MARKET_MEDIAN_DAYS, JSON.stringify(keys));
};
export function mediansFrom(keys, /** @type {any[]} */ results, today) {
  const by = new Map();
  for (const r of results) { const a = by.get(r.material) ?? []; a.push({ day: Number(r.day), price: Number(r.price), units: Number(r.units) }); by.set(r.material, a); }
  return new Map(keys.map((k) => { const rows = by.get(k) ?? []; return [k, { median: medianOf(rows), line: medianLine(rows, today) }]; }));
}

export async function marketRead(ctx, player, env, { character, region, view, family = null, tier = null, material: key = null, materials = null, hubs, currency = 'marks', pieces = null, board = null,
  page: pageAsked = 0, sort: sortAsked = null, recipes: recipesAsked = null, quality: qualityAsked = 0 } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { character, needRid: false });
  if (refused) return refused;
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!MARKET_VIEWS.some(([v]) => v === view)) return { error: 'bad-act' };
  if (!currencyOk(currency)) return { error: 'bad-act' };
  const me = player.id;
  const first = await readAll(db, [...settleReads(db, me, nowS), auctionsDueRead(db, nowS)]);
  const dueAuctions = first[first.length - 1];
  if (dueAuctions.length) await closeAuctions(ctx, dueAuctions);
  const touched = await settle(ctx, player, dueAuctions.length ? null : first.slice(0, -1));
  const today = utcDay(nowS);
  const own = hubsOf(hubs);
  const moderator = canModerate(player, env);
  const page = marketPageOf(pageAsked), sort = marketSortOf(view, sortAsked), recipes = marketRecipesOf(recipesAsked), quality = marketQualityOf(qualityAsked);
  const paged = (/** @type {any[]} */ [counted] = []) => ({ page, total: Number(counted?.n ?? 0) });
  const stores = await Promise.all([...touched].map((t) => t.split('|')).filter(([c]) => c === character).map(([c, m]) => storeOf(db, me, c, m)));
  const read = async (/** @type {any[]} */ reads) => {
    const own0 = [
      db.prepare(`SELECT ${openSalesSql('?2')} AS listings,
        (SELECT COUNT(*) FROM market_orders WHERE poster = ?1 AND state = 'open') AS orders,
        (SELECT COUNT(*) FROM market_bids WHERE bidder = ?1 AND state = 'high') AS bids,
        (SELECT COALESCE(SUM(amount + courier), 0) FROM market_bids WHERE bidder = ?1 AND (state = 'high' OR (state IN ('outbid', 'void') AND returned = 0))) AS held`)
        .bind(me, nowS),
      db.prepare('SELECT gold FROM market_gold WHERE player = ?1 AND char_id = ?2').bind(me, character),
      db.prepare('SELECT balance FROM marks WHERE account = ?').bind(me),
      ...roadReads(db, me),
    ];
    const [all, listingsMax] = await Promise.all([readAll(db, [...reads, ...own0]), listingsCapAt(db, nowS, boardOf(board))]);
    const [[counts] = [], [gold] = [], [bal] = [], ...road] = all.slice(reads.length);
    return {
      rows: all.slice(0, reads.length),
      base: {
        ok: true, view, region, currency, road: roadFrom(road, nowS), balance: bal ? Number(bal.balance) : 0,
        counts: { listings: Number(counts?.listings ?? 0), orders: Number(counts?.orders ?? 0), bids: Number(counts?.bids ?? 0) },
        listingsMax,
        held: Number(counts?.held ?? 0), stores, goldHeld: Number(gold?.gold ?? 0),
      },
    };
  };
  const after = async ({ quoted = /** @type {any[]} */ ([]), unitsOf = (/** @type {any} */ _l) => 1, medianKeys = /** @type {string[]|null} */ (null), cur = 'marks', reported = /** @type {string[]} */ ([]), auctions = /** @type {string[]} */ ([]) }) => {
    const hubKeys = quoted.length ? hubKeysOf([region, ...quoted.map((l) => Number(l.region))]) : [];
    /** @type {Array<[string, any]>} */
    const q = [];
    if (hubKeys.length) q.push(['hubs', hubsStatement(db, hubKeys)]);
    if (medianKeys?.length) q.push(['medians', mediansRead(db, medianKeys, today, cur)]);
    if (moderator && reported.length) {
      q.push(['reports', db.prepare(`SELECT listing, COUNT(*) AS n FROM market_reports WHERE listing IN (${reported.map((_, i) => `?${i + 1}`).join(', ')}) GROUP BY listing`)
        .bind(...reported)]);
    }
    if (moderator && auctions.length) {
      q.push(['auctions', db.prepare(`SELECT auction, COUNT(*) AS n FROM market_auction_reports WHERE auction IN (${auctions.map((_, i) => `?${i + 1}`).join(', ')})
        GROUP BY auction`).bind(...auctions)]);
    }
    const got = await readAll(db, q.map(([, st]) => st));
    const by = new Map(q.map(([name], i) => [name, got[i]]));
    const at = hubKeys.length ? hubsFrom(hubKeys, by.get('hubs') ?? [], own) : new Map();
    return {
      quotes: quoted.map((l) => courierOf(at, Number(l.region), region, unitsOf(l), courierSlow(env, nowS, region))),
      medians: medianKeys?.length ? mediansFrom(medianKeys, by.get('medians') ?? [], today) : new Map(),
      reports: new Map((by.get('reports') ?? []).map((r) => [r.listing, Number(r.n)])),
      auctionReports: new Map((by.get('auctions') ?? []).map((r) => [r.auction, Number(r.n)])),
    };
  };

  if (view === 'materials') {
    const keys = key ? [key]
      : Array.isArray(materials) ? materials.filter((k) => typeof k === 'string' && material(k)).slice(0, 120)
        : (family || tier) ? marketCatalogue().filter((c) => (!family || c.family === family) && (!tier || c.tier === tier)).map((c) => c.key)
          : null;
    if (keys && !keys.length) return { ...(await read([])).base, rows: [], medians: {} };
    const listedSql = (local) => `SELECT * FROM market_listings WHERE state = 'open' AND kind = 'material' AND expires_at > ?1 AND currency = '${currency}'
      ${keys ? 'AND material IN (SELECT value FROM json_each(?2))' : ''} ${local ? `AND region = ?${keys ? 3 : 2}` : ''} ORDER BY price, at LIMIT ${local ? MARKET_SHOWN / 2 : MARKET_SHOWN}`;
    const binds = [nowS, ...(keys ? [JSON.stringify(keys)] : [])];
    const { rows: [bay, home], base } = await read([db.prepare(listedSql(false)).bind(...binds), db.prepare(listedSql(true)).bind(...binds, region)]);
    const results = [...new Map([...bay, ...home].map((l) => [l.id, l])).values()];
    const rows = results.filter((l) => material(l.material));
    const { quotes, medians, reports } = await after({ quoted: rows, unitsOf: (l) => Number(l.own) + Number(l.bought), medianKeys: [...new Set(rows.map((l) => l.material))], cur: currency, reported: rows.map((l) => l.id) });
    return {
      ...base,
      rows: rows.map((l, i) => listingView(l, me, { road: quotes[i], ...(moderator ? { reports: reports.get(l.id) ?? 0 } : {}) })),
      medians: Object.fromEntries([...medians].map(([k, v]) => [k, v])),
    };
  }
  if (view === 'crafted') {
    const keys = pieceKeys(family, recipes, CRAFTED_LISTED);
    const from = `FROM market_listings l JOIN products p ON p.provenance = l.provenance
      WHERE l.state = 'open' AND l.kind = 'piece' AND l.expires_at > ?1 AND l.currency = '${currency}'
        AND p.recipe IN (SELECT value FROM json_each(?2)) AND (?3 = 0 OR p.quality >= ?3)`;
    const { rows: [counted, rows], base } = await read([db.prepare(`SELECT COUNT(*) AS n ${from}`).bind(nowS, keys, quality),
      db.prepare(`SELECT l.*, p.recipe, p.quality, p.seed, p.maker, p.marked, p.dye, p.hand, p.record, p.template, p.material AS dfu_material
      ${from} ORDER BY ${PIECE_ORDER[/** @type {keyof typeof PIECE_ORDER} */ (sort)]} ${pageSql(page)}`).bind(nowS, keys, quality)]);
    const { quotes, reports } = await after({ quoted: rows, reported: rows.map((l) => l.id) });
    return {
      ...base, ...paged(counted),
      rows: rows.map((l, i) => listingView(l, me, {
        road: quotes[i], piece: pieceOf({ ...l, material: l.dfu_material }, l.wear), ...(moderator ? { reports: reports.get(l.id) ?? 0 } : {}),
      })),
    };
  }
  if (view === 'goods') {
    // Legacy truthy non-string filters match nothing, and their objects or arrays never reach a D1 binding.
    const familyFilter = family ? (typeof family === 'string' ? family : '') : null;
    const from = `FROM market_listings l WHERE state = 'open' AND kind = 'item' AND expires_at > ?1
      AND (CASE WHEN json_valid(item) THEN json_type(item) = 'object' ELSE 0 END) AND (?2 IS NULL OR (${GOODS_FAMILY_SQL}) = ?2)
      AND vendor_id IS NULL`;
    const { rows: [counted, results], base } = await read([db.prepare(`SELECT COUNT(*) AS n ${from}`).bind(nowS, familyFilter),
      db.prepare(`SELECT * ${from} ORDER BY ${PIECE_ORDER[/** @type {keyof typeof PIECE_ORDER} */ (sort)]} ${pageSql(page)}`).bind(nowS, familyFilter)]);
    const rows = results.filter((l) => { const it = goodOf(l.item); return !!it && (!family || goodFamily(it) === family); });
    const { quotes, reports } = await after({ quoted: rows, reported: rows.map((l) => l.id) });
    return { ...base, ...paged(counted), rows: rows.map((l, i) => listingView(l, me, { road: quotes[i], ...(moderator ? { reports: reports.get(l.id) ?? 0 } : {}) })) };
  }
  if (view === 'auctions') {
    const keys = pieceKeys(family, recipes);
    const from = `FROM market_auctions a JOIN products p ON p.provenance = a.provenance
      WHERE a.state = 'open' AND a.ends_at > ?1
        AND (?2 IS NULL OR p.recipe IN (SELECT value FROM json_each(?2)))`;
    const { rows: [counted, rows], base } = await read([db.prepare(`SELECT COUNT(*) AS n ${from}`).bind(nowS, keys),
      db.prepare(`SELECT a.*, p.recipe, p.quality, p.seed, p.maker, p.marked, p.dye, p.hand, p.record, p.template, p.material AS dfu_material,
        (SELECT bidder FROM market_bids WHERE id = a.high_bid) AS high_bidder
      ${from} ORDER BY ${AUCTION_ORDER[/** @type {keyof typeof AUCTION_ORDER} */ (sort)]} ${pageSql(page)}`).bind(nowS, keys)]);
    const { quotes, auctionReports: reported } = await after({ quoted: rows, auctions: rows.map((a) => a.id) });
    return {
      ...base, ...paged(counted),
      rows: rows.map((a, i) => auctionView(a, me, {
        road: quotes[i], piece: pieceOf({ ...a, material: a.dfu_material }, a.wear), leading: a.high_bidder === me,
        ...(moderator ? { reports: reported.get(a.id) ?? 0 } : {}),
      })),
    };
  }
  if (view === 'mine') {
    const ids = pieceIdsOf(pieces);
    const { rows: [listings, orders, auctions, bids, ways = []], base } = await read([
      db.prepare(`SELECT l.*, p.recipe, p.quality, p.seed, p.maker, p.marked, p.dye, p.hand, p.record, p.template, p.material AS dfu_material
      FROM market_listings l LEFT JOIN products p ON p.provenance = l.provenance
      WHERE l.seller = ?1 AND (l.state = 'open' OR l.closed_at > ?2) ORDER BY l.state = 'open' DESC, l.at DESC LIMIT ${MARKET_SHOWN}`)
        .bind(me, nowS - RECENT_S),
      db.prepare(`SELECT * FROM market_orders WHERE poster = ?1 AND (state = 'open' OR closed_at > ?2)
      ORDER BY state = 'open' DESC, at DESC LIMIT ${MARKET_SHOWN}`).bind(me, nowS - RECENT_S),
      db.prepare(`SELECT a.*, ${GONE_RECIPE_SQL}, p.quality, p.seed, p.maker, p.marked, p.dye, p.hand, p.record, p.template, p.material AS dfu_material
      FROM market_auctions a LEFT JOIN products p ON p.provenance = a.provenance
      WHERE a.seller = ?1 AND (a.state = 'open' OR a.closed_at > ?2) ORDER BY a.state = 'open' DESC, a.at DESC LIMIT ${MARKET_SHOWN}`).bind(me, nowS - RECENT_S),
      db.prepare(`SELECT b.*, a.state AS auction_state, a.ends_at, a.high, a.opening, a.bids AS count, a.region AS auction_region,
        a.wear, ${GONE_RECIPE_SQL}, p.quality, p.seed, p.maker, p.marked, p.dye, p.hand, p.record, p.template, p.material AS dfu_material, a.provenance
      FROM market_bids b JOIN market_auctions a ON a.id = b.auction LEFT JOIN products p ON p.provenance = a.provenance   -- AUDIT PROF-541 R2-S4
      WHERE b.bidder = ?1 AND (b.state = 'high' OR b.at > ?2 OR a.closed_at > ?2)   -- AUDIT 31 S3: and a week from its auction's close
      ORDER BY b.state = 'high' DESC, b.at DESC LIMIT ${MARKET_SHOWN}`).bind(me, nowS - RECENT_S),
      ...(ids.length ? [pieceWaysRead(db, ids)] : []),
    ]);
    return {
      ...base,
      rows: listings.map((l) => listingView(l, me, l.kind === 'piece' ? { piece: pieceOf({ ...l, material: l.dfu_material }, l.wear) } : {})),
      ways: pieceWays(me, ids, ways),
      orders: orders.map((o) => orderView(o, me)),
      auctions: auctions.map((a) => auctionView(a, me, { piece: pieceOf({ ...a, material: a.dfu_material }, a.wear) })),
      bids: bids.map((b) => ({
        ...bidView(b), auctionState: b.auction_state, endsAt: Number(b.ends_at), high: b.high == null ? null : Number(b.high),
        next: auctionNext(b.high == null ? null : Number(b.high), Number(b.opening)), auctionRegion: Number(b.auction_region),
        piece: pieceOf({ ...b, material: b.dfu_material }, b.wear),
      })),
    };
  }
  if (view === 'orders') {
    const familyKeys = family ? JSON.stringify([...marketCatalogue().map((c) => c.key), ...UNYIELDED].filter((k) => material(k)?.family === family)) : null;
    const from = `FROM market_orders WHERE state = 'open' AND expires_at > ?1
      AND (?2 IS NULL OR material IN (SELECT value FROM json_each(?2)))`;
    const { rows: [counted, rows], base } = await read([db.prepare(`SELECT COUNT(*) AS n ${from}`).bind(nowS, familyKeys),
      db.prepare(`SELECT * ${from} ORDER BY price DESC, at, id ${pageSql(page)}`).bind(nowS, familyKeys)]);
    const { quotes, medians } = await after({ quoted: rows, medianKeys: [...new Set(rows.map((o) => o.material))] });
    return { ...base, ...paged(counted), orders: rows.map((o, i) => ({ ...orderView(o, me), road: quotes[i] })), medians: Object.fromEntries(medians) };
  }
  const goodSql = "CASE WHEN kind = 'item' THEN (SELECT item FROM market_listings l WHERE l.id = market_sales.listing) END";
  const { rows: [top, sales], base } = await read([
    db.prepare(`SELECT material, SUM(units) AS units FROM ${currency === 'gold' ? 'market_gold_prices' : 'market_prices'} WHERE day > ?1 GROUP BY material
    ORDER BY units DESC, material LIMIT ${MARKET_HISTORY_SHOWN}`).bind(today - MARKET_MEDIAN_DAYS),
    db.prepare(`SELECT 'bought' AS side, kind, material, provenance, units, price, total + courier AS total, at, currency, ${goodSql} AS good FROM market_sales WHERE buyer = ?1 AND at > ?2
    UNION ALL SELECT 'sold', kind, material, provenance, units, price, MAX(0, total - tax - tithe - fee), at, currency, ${goodSql} FROM market_sales WHERE seller = ?1 AND at > ?2
    UNION ALL SELECT 'filled', 'material', material, NULL, units, price, pay, at, 'marks', NULL FROM market_fills WHERE filler = ?1 AND at > ?2
    UNION ALL SELECT 'ordered', 'material', material, NULL, units, price, units * price, at, 'marks', NULL FROM market_fills WHERE poster = ?1 AND at > ?2
    UNION ALL SELECT 'won', 'piece', NULL, a.provenance, 1, a.high, a.high + b.courier, a.closed_at, 'marks', NULL FROM market_auctions a JOIN market_bids b ON b.id = a.high_bid
      WHERE a.state = 'sold' AND b.bidder = ?1 AND a.closed_at > ?2
    UNION ALL SELECT 'auctioned', 'piece', NULL, provenance, 1, high, ${netSql('high')} - tithe, closed_at, 'marks', NULL FROM market_auctions
      WHERE state = 'sold' AND seller = ?1 AND closed_at > ?2
    ORDER BY at DESC LIMIT ${MARKET_TRADES_SHOWN}`).bind(me, nowS - MARKET_KEEP_DAYS * DAY_S),
  ]);
  const { medians } = await after({ medianKeys: top.map((t) => t.material), cur: currency });
  return {
    ...base,
    history: top.map((t) => ({ material: t.material, units: Number(t.units), ...(medians.get(t.material) ?? { median: null, line: [] }) })),
    trades: sales.map((s) => ({ side: s.side, kind: s.kind, material: s.material ?? null, provenance: s.provenance ?? null, units: Number(s.units),
      price: Number(s.price), total: Number(s.total), at: Number(s.at), currency: s.currency === 'gold' ? 'gold' : 'marks',
      ...(s.kind === 'item' ? { item: goodOf(s.good) } : {}) })),
  };
}

export async function marketRoad(ctx, player, env, { character } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { character, needRid: false });
  if (refused) return refused;
  const closed = shut(player, env);
  if (closed) return closed;
  const me = player.id;
  const touched = await settle(ctx, player);
  const [loads, pieces, goods, [bal] = []] = await readAll(db, [...roadReads(db, me), db.prepare('SELECT balance FROM marks WHERE account = ?').bind(me)]);
  const stores = await Promise.all([...touched].map((t) => t.split('|')).filter(([c]) => c === character).map(([c, m]) => storeOf(db, me, c, m)));
  return { ok: true, road: roadFrom([loads, pieces, goods], nowS), balance: bal ? Number(bal.balance) : 0, stores };
}

export const pieceEscrowStep = (db, provenance, character, me, moved, nowS, decided, binds) => db.prepare(`INSERT INTO piece_escrow (provenance, player, char_id, item, at)
  SELECT ?${binds.length + 1}, ?${binds.length + 2}, ?${binds.length + 3}, ?${binds.length + 4}, ?${binds.length + 5} WHERE ${decided}`)
  .bind(...binds, provenance, me, character, JSON.stringify(moved), nowS);

export function pieceBackSteps(db, id, nowS, row, binds) {
  const n = binds.length;
  return [
    db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, item, why, from_region, arrives_at, at)
      SELECT ?${n + 1}, r.seller, r.char_id, e.item, 'returned', r.region, ?${n + 2}, ?${n + 2} FROM (${row}) r JOIN piece_escrow e ON e.provenance = r.provenance`).bind(...binds, id, nowS),
    db.prepare(`DELETE FROM piece_escrow WHERE provenance = (SELECT provenance FROM (${row}))
      AND EXISTS (SELECT 1 FROM market_deliveries WHERE id = ?${n + 1} AND item IS NOT NULL)`).bind(...binds, id),
  ];
}
export const NO_ESCROW = (p) => `NOT EXISTS (SELECT 1 FROM piece_escrow WHERE provenance = ${p})`;

export const pieceSoldSteps = (db, p, binds) => [
  db.prepare(`DELETE FROM item_uids WHERE uid = (${p}) AND state = 'escrow' AND EXISTS (SELECT 1 FROM piece_escrow WHERE provenance = item_uids.uid)`).bind(...binds),
  db.prepare(`DELETE FROM piece_escrow WHERE provenance = (${p})`).bind(...binds),
  db.prepare(`UPDATE products SET handed_to = NULL WHERE provenance = (${p}) AND handed_to IS NOT NULL`).bind(...binds),
];
