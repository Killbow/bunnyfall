// @ts-check
// Market settlement: listings and orders past their time settled on read, auctions closed, old
// history pruned, the market read and the road, and a crafted piece's escrow steps.
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

// ─── SETTLED ON READ ─────────────────────────────────────────────────

/**
 * An account's own market, settled: its listings past their hours closed and their goods returned (a material's units
 * to the listing character's Stores where there is room, a piece a delivery to collect), its orders past their days
 * closed and their escrow returned (under the Marks cap), its couriers' loads that have arrived put in the Stores
 * (where there is room). One row a batch; SETTLE_MAX rows a read.
 */
/**
 * MARKET-SPEED (2026-10-11, Mac: "look at ... how the server affects it/slows down, same with the market"): WHAT A SETTLE
 * READS, AS STATEMENTS - whether a listing or an order is past its time (SCALE4b), and each row it would settle: the
 * listings' goods back, the auctions back, the bids' escrow, the orders' escrow, the couriers' loads. They were six round
 * trips in a row on every market read, nearly always all empty; a read sends them in its first batch (marketRead), and a
 * settle with nothing to do writes nothing and asks nothing more.
 */
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
/** the listings' goods back - AUDIT 30 S7: only what can settle now - a return a full Stores cannot take waits without
 *  holding back the rest */
export const settleBackRead = (db, me) => db.prepare(`SELECT * FROM market_listings WHERE seller = ?1 AND state IN ('expired', 'removed') AND returned = 0
      AND (kind IN ('piece', 'item') OR COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = market_listings.seller AND char_id = market_listings.char_id
        AND material = market_listings.material), 0) + own + bought <= ?2)
    ORDER BY closed_at LIMIT ${SETTLE_MAX}`).bind(me, STORES_MAX);
/** the orders' escrow back */
export const settleOrdersRead = (db, me) => db.prepare(`SELECT id FROM market_orders WHERE poster = ?1 AND state != 'open' AND returned = 0
      AND (escrow = 0 OR COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) + escrow <= ?2)
    ORDER BY closed_at LIMIT ${SETTLE_MAX}`).bind(me, MARKS_MAX);

export async function settle(ctx, player, read = null) {
  const { db, nowS, rand } = ctx;
  const me = player.id;
  /** AUDIT 30 U1: the Stores this settle moved, `char_id|material`, so a read can answer them */
  const touched = new Set();
  // MARKET-SPEED: the reads one batch (settleReads) - or the read's own first batch's, handed in
  let [due, back, unsold, outbid, shutOrders, loads] = read ?? await readAll(db, settleReads(db, me, nowS));
  // SCALE4b (2026-10-08): ASKED BEFORE IT IS WRITTEN. Both updates went on every market read, nearly always changing
  // nothing - two writes on the market's every look, which a read replica can never serve. One read says whether any
  // of the account's listings or orders is past its time; only then do the same two updates go, word for word (a race
  // that closes one meanwhile leaves its update nothing to change, as before). MARKET-SPEED: the rows they close read
  // again behind them, in the same batch
  if (Number(due[0]?.due)) {
    [, , back, shutOrders] = await readAll(db, [
      db.prepare(`UPDATE market_listings SET state = 'expired', closed_at = ?2 WHERE seller = ?1 AND state = 'open' AND expires_at <= ?2`).bind(me, nowS),
      db.prepare(`UPDATE market_orders SET state = 'expired', closed_at = ?2 WHERE poster = ?1 AND state = 'open' AND expires_at <= ?2`).bind(me, nowS),
      settleBackRead(db, me),
      settleOrdersRead(db, me),
    ]);
  }
  // MARKET-SPEED: EVERY ROW'S WORK IN ONE BATCH - each row's statements keyed on its own id and nonce, as they were in a
  // batch of their own; in order, so a return reads the Stores the one before it filled
  const work = [];
  for (const l of back) {
    const nonce = mintId(rand);
    if (l.kind === 'item') {
      // MARKET-ANY: a piece from a pack back to its seller - a delivery its character's record collects (collectGood)
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
        // INT19: a piece the market holds the record of comes back as that record, into its seller's record
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
  // PROF5b: an unsold or removed auction's piece back to its seller, a delivery to collect
  for (const a of unsold) {
    const nonce = mintId(rand);
    work.push(
      db.prepare(`UPDATE market_auctions SET returned = 1, rn = ?2 WHERE id = ?1 AND returned = 0 AND state IN ('unsold', 'removed')`).bind(a.id, nonce),
      db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, provenance, wear, why, from_region, arrives_at, at)
        SELECT id, seller, char_id, provenance, wear, 'returned', region, ?2, ?2 FROM market_auctions WHERE id = ?1 AND rn = ?3 AND ${NO_ESCROW('market_auctions.provenance')}`).bind(a.id, nowS, nonce),
      ...pieceBackSteps(db, a.id, nowS, 'SELECT provenance, seller, char_id, region FROM market_auctions WHERE id = ?1 AND rn = ?2', [a.id, nonce]),   // INT19
      db.prepare(`UPDATE products SET listed = 0 WHERE provenance = (SELECT provenance FROM market_auctions WHERE id = ?1 AND rn = ?2)`).bind(a.id, nonce),
    );
  }
  // PROF5b: an outbid bid's escrow (or a removed auction's) back to its bidder, under the Marks cap - one line keyed on
  // the bid's own id, so it happens once
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
  // the orders' escrow back
  for (const o of shutOrders) work.push(...orderReturn(db, o.id, nowS));
  // the couriers' loads that have arrived
  for (const s of loads) {
    const nonce = mintId(rand);
    work.push(
      db.prepare(`UPDATE market_sales SET delivered = 1, dn = ?3 WHERE buyer = ?1 AND rid = ?2 AND delivered = 0
        AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = market_sales.char_id AND material = market_sales.material), 0) + units <= ?4`)
        .bind(me, s.rid, nonce, STORES_MAX),
      db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
        SELECT buyer, char_id, material, ${BOUGHT_ORIGIN_SQL}, units FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND dn = ?3
        ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(me, s.rid, nonce),
      // WOVEN-PAYS: a cloth bought with Drakes, counted bought with silver (a gold buy's is no silver)
      silverClothIn(db, "SELECT buyer AS player, char_id, material, units AS qty FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND dn = ?3 AND currency IS NOT 'gold'", [me, s.rid, nonce]),
    );
    touched.add(`${s.char_id}|${s.material}`);
  }
  if (work.length) await db.batch(work);
  return touched;
}
export const liveBidSql = (a) => `EXISTS (SELECT 1 FROM market_bids WHERE id = ${a}.high_bid AND state = 'high')`;
export const sellerBalanceSql = (a) => `COALESCE((SELECT balance FROM marks WHERE account = ${a}.seller), 0)`;
/** MARKET-SPEED: closeAuctions' candidates as a statement - a market read asks it in its first batch, beside its settle's
 *  reads, and closes only where it found one (the clock closes the rest each minute, cron.js). */
export const auctionsDueRead = (db, nowS) => db.prepare(`SELECT id, high, region, board_x, board_y, ends_at, ${liveBidSql('a')} AS live, ${sellerBalanceSql('a')} AS balance FROM market_auctions a
      WHERE state = 'open' AND ends_at <= ?1
        AND (NOT ${liveBidSql('a')} OR ${sellerBalanceSql('a')} + ${leastNetSql('high')} <= ?2 OR ends_at + ?3 <= ?1)
    ORDER BY (NOT ${liveBidSql('a')} OR ${sellerBalanceSql('a')} + ${netSql('high')} <= ?2 OR ends_at + ?3 <= ?1) DESC, ends_at LIMIT ${SETTLE_MAX}`).bind(nowS, MARKS_MAX, AUCTION_GRACE_S);
/**
 * PROF5b: THE AUCTIONS PAST THEIR END, closed - anyone's read runs it (the seller, the winner and the outbid bidders
 * each need it). Sold: the winner's escrow pays the seller the bid less its tax, the tax and the courier burnt, the
 * piece's owner moved and the winner's delivery written (at once from the auction's region, else after the courier's
 * time). Unsold: closed, its piece back on its seller's read. A sale the seller's Marks cap cannot take waits -
 * AUDIT 31 S3: AUCTION_GRACE_S at most, then the winning bid is void (its escrow back on its bidder's read) and the
 * auction closes unsold. AUDIT 31 S1: a standing bid whose row is gone (its bidder's account deleted - no route does
 * it, Professions-Arc 18) closes it unsold too, never a sale to no one: the owner written NULL failed every read after.
 */
export async function closeAuctions(ctx, read = null) {
  const { db, nowS, rand } = ctx;
  // MARKET-SPEED: the candidates as a read's first batch found them (auctionsDueRead), or read here - the clock's
  const due = read ?? ((await auctionsDueRead(db, nowS).all()).results ?? []);
  // AUDIT SCALE A1: THE SELLER'S ROOM IS DECIDED HERE, AFTER THE SEAT'S TITHE, BY THE `gets` BOTH DECISIONS GUARD ON. It
  // was decided in this SELECT by the Tithe-free proceeds (netSql's MARKET_TITHE_PCT is 0), while the decisions guard on
  // the proceeds less the seat's real Tithe - so a won auction under a Tithe, its seller within the Tithe of the Marks
  // cap, waited out the whole grace though the sale fitted, and then was picked every time and closed by neither: the
  // unsold close saw the room the SELECT had denied. Twenty of them held the page, and no auction after them closed.
  // The candidates now are every auction that COULD close - unbid, past the grace, or with room at the least any Tithe
  // could leave (TITHE_PCT_MOST) - the surely closable first, so one that turns out to wait never holds the page.
  const day = utcDay(nowS);
  let closed = 0;
  for (const a of due) {
    if (ctx.budget && !ctx.budget()) break;   // SCALE4b / AUDIT SCALE A2: the clock's firing keeps under D1's statements an invocation
    const nonce = mintId(rand);
    const high = a.high == null ? null : Number(a.high);
    // SEAT1d: the Tithe of the seat the auction's board belongs to, from the seller's proceeds
    const tt = high == null ? null : await titheAt(db, nowS, Number(a.region), rowBoard(a));
    const tithe = tt ? saleTithe(high, tt.pct) : 0;
    const tax = high == null ? 0 : saleTaxOn(0, high), gets = high == null ? 0 : high - tax - tithe;
    const room = Number(a.balance) + gets <= MARKS_MAX;
    // a sale the cap cannot take yet, inside its grace: it waits, and nothing is written
    if (Number(a.live) && !room && Number(a.ends_at) + AUCTION_GRACE_S > nowS) continue;
    // the winning bid, once this close marked it won (the second statement) - every line and the owner keyed on it
    const won = `FROM market_auctions a JOIN market_bids b ON b.id = a.high_bid AND b.state = 'won' WHERE a.id = ?1 AND a.cn = ?2`;
    if (!Number(a.live) || !room) {
      const out = await db.batch([
        // THE DECISION: still open, past its end, the standing bid the one read - none, or gone, or one the seller's cap
        // has not taken in the grace
        db.prepare(`UPDATE market_auctions SET state = 'unsold', closed_at = ?3, cn = ?2, returned = 0
          WHERE id = ?1 AND state = 'open' AND ends_at <= ?3 AND high IS ?4
            AND (NOT ${liveBidSql('market_auctions')} OR (ends_at + ?5 <= ?3
              AND COALESCE((SELECT balance FROM marks WHERE account = market_auctions.seller), 0) + ?6 > ?7))`)
          .bind(a.id, nonce, nowS, high, AUCTION_GRACE_S, gets, MARKS_MAX),
        // the winning bid void - its escrow back on its bidder's read (settle's)
        db.prepare(`UPDATE market_bids SET state = 'void' WHERE id = (SELECT high_bid FROM market_auctions WHERE id = ?1 AND cn = ?2) AND state = 'high'`)
          .bind(a.id, nonce),
      ]);
      closed += Number(out?.[0]?.meta?.changes ?? 0);
      continue;
    }
    const sold = await db.batch([
      // THE DECISION: still open, past its end, the standing bid the one read and standing, the seller's room under the cap
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
      // SEAT1d: the Tithe to the auction's seat's holder - or burnt
      ...(tithe > 0 ? [db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'escrow', b.id, CASE WHEN ${titheEnd('?6', '?3')} THEN 'guild' ELSE 'burn' END, CASE WHEN ${titheEnd('?6', '?3')} THEN ?6 END,
          'tithe', ?3, ?4, ?5, b.bidder, a.id, 'auction:' || a.id || ':tithe' ${won}`)
        .bind(a.id, nonce, tithe, day, nowS, tt.guild)] : []),
      db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'escrow', b.id, 'burn', NULL, 'courier', b.courier, ?3, ?4, b.bidder, a.id, 'auction:' || a.id || ':courier' ${won} AND b.courier > 0`)
        .bind(a.id, nonce, day, nowS),
      // the owner moved only to a bid that won - never to no one
      db.prepare(`UPDATE products SET owner = (SELECT b.bidder ${won}), credited = 0, listed = 0, bought_with = 'marks'   -- GOLD-MARKET: won with Drakes
        WHERE provenance = (SELECT provenance FROM market_auctions WHERE id = ?1 AND cn = ?2)
          AND EXISTS (SELECT 1 ${won})`).bind(a.id, nonce),
      db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, provenance, wear, why, from_region, arrives_at, at)
        SELECT ?3, b.bidder, b.char_id, a.provenance, a.wear, 'bought', a.region, ?4 + b.seconds, ?4 ${won}`)
        .bind(a.id, nonce, mintId(rand), nowS),
      ...pieceSoldSteps(db, `SELECT a.provenance ${won}`, [a.id, nonce]),   // INT19: the record the market held, handed on
    ]);
    closed += Number(sold?.[0]?.meta?.changes ?? 0);
  }
  // SCALE4b: the service's clock asks again while a full page closed. AUDIT SCALE A2: the auctions CLOSED - the
  // decisions' own changes - never the ones picked: a page picked and not closed (A1's) was asked again every round,
  // twenty-five rounds a minute
  return closed;
}
/**
 * THE MARKET'S HISTORY KEPT MARKET_KEEP_DAYS (section 20: 90 days) - every price and fill past it, and every listing,
 * order, delivery, bid and auction long closed and settled (and, LW15, every patron's sale). SCALE4b (2026-10-08): the
 * service's clock's (server-account/src/cron.js, each hour); the History view pruned first, nine writes on a read. AUDIT
 * SCALE A5: each table's delete takes `rows` at most, and the clock asks again while one took a full page - one
 * unbounded batch, a backlog's worth, could outrun D1's thirty seconds a batch, roll back, and only grow (the auctions'
 * delete walked every bid for each auction it took, until 0091 indexed market_bids by its auction). Answers
 * `{ changed, full }`.
 * @param {any} db @param {number} nowS @param {number} rows
 */
export async function pruneMarketHistory(db, nowS, rows) {
  const keepFrom = utcDay(nowS) - MARKET_KEEP_DAYS;
  const bounded = (/** @type {string} */ table, /** @type {string} */ where, /** @type {number} */ cutoff) =>
    db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ?2)`).bind(cutoff, rows);
  const out = await db.batch([
    bounded('market_prices', 'day < ?1', keepFrom),
    bounded('market_gold_prices', 'day < ?1', keepFrom),   // GOLD-MARKET
    bounded('market_sales', 'day < ?1 AND delivered = 1', keepFrom),
    bounded('market_fills', 'day < ?1', keepFrom),
    bounded('market_listings', "state != 'open' AND closed_at < ?1 AND (returned = 1 OR state = 'sold')", keepFrom * DAY_S),
    bounded('market_orders', "state != 'open' AND closed_at < ?1 AND returned = 1", keepFrom * DAY_S),
    bounded('market_deliveries', 'collected = 1 AND at < ?1', keepFrom * DAY_S),
    // PROF5b: a closed auction's settled bids, then the auction itself once nothing of it waits (its ids stay spent -
    // AUDIT 30 S3: every decision asks the ledger)
    bounded('market_bids', "at < ?1 AND state != 'high' AND (returned = 1 OR state = 'won')", keepFrom * DAY_S),
    bounded('market_auctions', `state != 'open' AND closed_at < ?1 AND returned = 1
      AND NOT EXISTS (SELECT 1 FROM market_bids WHERE auction = market_auctions.id)`, keepFrom * DAY_S),
    // AUDIT LW-II P6: a patron's sale, kept as its listing is (the Vendor page reads it beside its listing) - kept for
    // ever, and the region's read of its last day walked them all
    bounded('market_patron_sales', 'day < ?1', keepFrom),
  ]);
  const changes = out.map((/** @type {any} */ r) => Number(r?.meta?.changes ?? 0));
  return { changed: changes.reduce((n, c) => n + c, 0), full: changes.some((c) => c >= rows) };
}

/** A closed listing's units back into its character's Stores, each with its origin - where its return carries `nonce`. */
export function backToStores(db, id, nonce) {
  // GOLD-MARKET: a gold listing's `bought` column holds its gold units - they go back as gold's
  return ['own', 'bought'].map((col) => db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT seller, char_id, material, ${col === 'own' ? "'own'" : BOUGHT_ORIGIN_SQL}, ${col} FROM market_listings WHERE id = ?1 AND rn = ?2 AND kind = 'material' AND ${col} > 0
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(id, nonce));
}
/** What is left of a closed order's escrow back to its poster - one line keyed on the order's own id, under the Marks
 *  cap (else it waits) - then the order marked returned. */
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
/** What is on its way to this account: couriers' loads not yet in the Stores and pieces not yet collected. */
/** MARKET-SPEED: what is on its way, as statements - a read sends them in its batch (roadFrom reads the rows). */
export function roadReads(db, me) {
  return [
    db.prepare(`SELECT rid, char_id, material, units, from_region, arrives_at FROM market_sales
    WHERE buyer = ?1 AND kind = 'material' AND delivered = 0 ORDER BY arrives_at LIMIT 50`).bind(me),
    db.prepare(`SELECT d.id, d.char_id, d.wear, d.why, d.from_region, d.arrives_at, p.recipe, p.quality, p.seed, p.maker, p.marked, p.dye, p.hand, p.record,
    p.template, p.material, p.provenance FROM market_deliveries d JOIN products p ON p.provenance = d.provenance
    WHERE d.player = ?1 AND d.collected = 0 ORDER BY d.arrives_at LIMIT 50`).bind(me),
    // MARKET-ANY: and pieces from packs, bought or come back - each its record
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

// ─── THE READ ────────────────────────────────────────────────────────

/**
 * MARKET-ANY: THE CRAFTED PIECES A TAB HOLDS (`pieces`, their provenance ids - at most MARKET_HELD_MAX, the rest unsaid),
 * each as the counting-house sees it, so the List form offers each its own way (AUDIT 30 U13: what must fail is not
 * offered): `yours` - its record names this account and it stands nowhere else: it lists as a crafted piece; `other` -
 * its record names another (a trade, a shelf, a room's container or a looted body moved the piece, never its record):
 * only that owner sells it as a crafted piece, and it lists from the pack, for gold; `elsewhere` - this account's, but on
 * the market, on the road or standing in a home: the save's is a copy and lists neither way; `none` - no record at all.
 */
export const pieceIdsOf = (pieces) => (Array.isArray(pieces) ? [...new Set(pieces.filter((p) => typeof p === 'string' && PROVENANCE_RE.test(p)))].slice(0, MARKET_HELD_MAX) : []);
/** MARKET-SPEED: pieceWays' read as a statement, for the Mine view's batch. */
export const pieceWaysRead = (db, ids) => db.prepare(`SELECT p.provenance, p.owner, p.listed,
      (EXISTS (SELECT 1 FROM market_deliveries d WHERE d.provenance = p.provenance AND d.collected = 0)
        OR EXISTS (SELECT 1 FROM market_deliveries d WHERE d.player = p.owner AND d.collected = 0 AND d.item IS NOT NULL AND json_extract(d.item, '$.provenance') = p.provenance)) AS road,   -- INT19: or back as its record
      EXISTS (SELECT 1 FROM home_decor h WHERE json_extract(h.item, '$.pv') = p.provenance) AS standing
    FROM products p WHERE p.provenance IN (SELECT value FROM json_each(?1))`).bind(JSON.stringify(ids));   // SCALE1: one bound array
export function pieceWays(me, ids, /** @type {any[]} */ rows) {
  if (!ids.length) return {};
  const out = Object.fromEntries(ids.map((p) => [p, 'none']));
  for (const r of rows) out[r.provenance] = r.owner !== me ? 'other' : (Number(r.listed) || Number(r.road) || Number(r.standing)) ? 'elsewhere' : 'yours';
  return out;
}

/** The medians and lines of `keys` over the last MARKET_MEDIAN_DAYS UTC days (10.2): a Map of key to { median, line }. */
export const mediansRead = (db, keys, today, currency = 'marks') => {
  const table = currency === 'gold' ? 'market_gold_prices' : 'market_prices';   // GOLD-MARKET: gold's own history, never the Drakes'
  // SCALE1: the keys as ONE bound JSON array (json_each) - a view's hundred materials bound one each were 101
  // parameters, past the 100 D1 takes in one statement (node:sqlite, the pins' database, takes 32766)
  return db.prepare(`SELECT day, material, price, units FROM ${table} WHERE day > ?1 AND material IN
    (SELECT value FROM json_each(?2))`).bind(today - MARKET_MEDIAN_DAYS, JSON.stringify(keys));
};
/** MARKET-SPEED: the medians off mediansRead's rows - each material's rows gathered once, where every key filtered every row. */
export function mediansFrom(keys, /** @type {any[]} */ results, today) {
  const by = new Map();
  for (const r of results) { const a = by.get(r.material) ?? []; a.push({ day: Number(r.day), price: Number(r.price), units: Number(r.units) }); by.set(r.material, a); }
  return new Map(keys.map((k) => { const rows = by.get(k) ?? []; return [k, { median: medianOf(rows), line: medianLine(rows, today) }]; }));
}

/**
 * THE MARKET TAB: `{ character, region, view, family?, tier?, material?, hubs? }` - the board's region and one of its
 * views (marketLaw MARKET_VIEWS), after the account's own market is settled. Every answer carries what is on its way
 * to the account, its balance and its live counts. BOARD-SIFT: a paged view (MARKET_PAGED_VIEWS) reads its `page`
 * (`page` and `total` in the answer), Crafted, Goods and Auctions their `sort`, Crafted and Auctions a search's `recipes`
 * (AUDIT BOARD-SIFT: the client's reading of its words) and Crafted the least `quality` - each read by marketLaw's own
 * word, anything else its default.
 */
export async function marketRead(ctx, player, env, { character, region, view, family = null, tier = null, material: key = null, materials = null, hubs, currency = 'marks', pieces = null, board = null,
  page: pageAsked = 0, sort: sortAsked = null, recipes: recipesAsked = null, quality: qualityAsked = 0 } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { character, needRid: false });
  if (refused) return refused;
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!MARKET_VIEWS.some(([v]) => v === view)) return { error: 'bad-act' };
  if (!currencyOk(currency)) return { error: 'bad-act' };   // GOLD-MARKET: the Materials and Crafted views show one currency at a time
  const me = player.id;
  // MARKET-SPEED (2026-10-11, Mac: "look at ... how the server affects it/slows down, same with the market"): A READ IS
  // THREE ROUND TRIPS - its settle's reads and the auctions past their end (one batch), the view's rows and the account's
  // own (a second), and what the rows ask after: their couriers' hubs, their medians, a moderator's reports (a third).
  // It was eighteen to twenty-two, one after another, every one the whole way to the database's primary and back.
  // PROF5b: every reader's - the auctions past their end, anyone's - closed where the first batch found one (the clock
  // closes them each minute, so a read nearly always finds none); the settle's reads then asked again, behind the close
  const first = await readAll(db, [...settleReads(db, me, nowS), auctionsDueRead(db, nowS)]);
  const dueAuctions = first[first.length - 1];
  if (dueAuctions.length) await closeAuctions(ctx, dueAuctions);
  const touched = await settle(ctx, player, dueAuctions.length ? null : first.slice(0, -1));
  const today = utcDay(nowS);
  const own = hubsOf(hubs);
  const moderator = canModerate(player, env);
  // BOARD-SIFT: what the paged views read - each by the law's own word
  const page = marketPageOf(pageAsked), sort = marketSortOf(view, sortAsked), recipes = marketRecipesOf(recipesAsked), quality = marketQualityOf(qualityAsked);
  /** BOARD-SIFT: a paged view's answer's page and its whole count (MARKET_PAGED_VIEWS - each reads its COUNT beside its rows). */
  const paged = (/** @type {any[]} */ [counted] = []) => ({ page, total: Number(counted?.n ?? 0) });
  // AUDIT 30 U1: this character's Stores the settle moved, answered so the pages read them
  const stores = await Promise.all([...touched].map((t) => t.split('|')).filter(([c]) => c === character).map(([c, m]) => storeOf(db, me, c, m)));
  /** MARKET-SPEED: THE VIEW'S ROWS AND THE ACCOUNT'S OWN, ONE BATCH - `reads` the view's statements, answered in order
   *  as `rows`; behind them what every answer carries (`base`); and, beside the batch, the listings a board allows
   *  (AUDIT SEATS-3 D2: its own reads, the seats' places off the isolate's kept rows). */
  const read = async (/** @type {any[]} */ reads) => {
    // PROF5b: an open auction is among the thirty; the bids standing, and what every bid not yet back holds
    const own0 = [
      db.prepare(`SELECT ${openSalesSql('?2')} AS listings,
        (SELECT COUNT(*) FROM market_orders WHERE poster = ?1 AND state = 'open') AS orders,
        (SELECT COUNT(*) FROM market_bids WHERE bidder = ?1 AND state = 'high') AS bids,
        (SELECT COALESCE(SUM(amount + courier), 0) FROM market_bids WHERE bidder = ?1 AND (state = 'high' OR (state IN ('outbid', 'void') AND returned = 0))) AS held`)
        .bind(me, nowS),
      // GOLD-MARKET: the gold this character's sales hold for it, to collect
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
        // AUDIT SEATS-3 D2: the open listings this account may hold at the board read from (`board`, its map pixel, as the
        // post's), a Market Hall's quarter a tier in it - the count's measure, so the board never says thirty where it lists more
        listingsMax,
        held: Number(counts?.held ?? 0), stores, goldHeld: Number(gold?.gold ?? 0),
      },
    };
  };
  /** MARKET-SPEED: WHAT THE ROWS ASK AFTER, ONE BATCH - each quoted row's courier to this board (its hub's witnesses and
   *  this one's), the medians of `medianKeys` in `cur`, and a moderator's report counts (`reported` of listings,
   *  `auctions` of auctions). Nothing asked, nothing sent. */
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
    // AUDIT 30 U2: the materials asked for chosen in the query itself - one, a search's matches, or a family's and a
    // tier's - so a rare material is never lost behind the five hundred cheapest of everything else
    const keys = key ? [key]
      : Array.isArray(materials) ? materials.filter((k) => typeof k === 'string' && material(k)).slice(0, 120)
        : (family || tier) ? marketCatalogue().filter((c) => (!family || c.family === family) && (!tier || c.tier === tier)).map((c) => c.key)
          : null;
    if (keys && !keys.length) return { ...(await read([])).base, rows: [], medians: {} };
    // GOLD-MARKET: one currency a view - a gold price and a Drakes price sort nothing together
    // MARKET-AUDIT: the Bay's cheapest listed AND this board's own region's - a hundred cheaper listings elsewhere hid the
    // ones here, which may be the cheapest landed (the tab sorts by the courier's share)
    const listedSql = (local) => `SELECT * FROM market_listings WHERE state = 'open' AND kind = 'material' AND expires_at > ?1 AND currency = '${currency}'
      ${keys ? 'AND material IN (SELECT value FROM json_each(?2))' : ''} ${local ? `AND region = ?${keys ? 3 : 2}` : ''} ORDER BY price, at LIMIT ${local ? MARKET_SHOWN / 2 : MARKET_SHOWN}`;
    const binds = [nowS, ...(keys ? [JSON.stringify(keys)] : [])];   // SCALE1: one bound array - a search's 120 were 121 parameters
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
    // BOARD-SIFT: every filter in the query - the family, the crafted families alone (they were kept after a 500-row
    // cutoff), a search's recipes and the least quality - so a page of it is a page; and its whole count
    const keys = pieceKeys(family, recipes, CRAFTED_LISTED);
    const from = `FROM market_listings l JOIN products p ON p.provenance = l.provenance
      WHERE l.state = 'open' AND l.kind = 'piece' AND l.expires_at > ?1 AND l.currency = '${currency}'
        AND p.recipe IN (SELECT value FROM json_each(?2)) AND (?3 = 0 OR p.quality >= ?3)`;   // GOLD-MARKET
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
    // MARKET-ANY: every piece listed from a pack, in the order asked (the cheapest first, its own), each with its courier
    // to this board - for gold alone
    // Legacy truthy non-string filters match nothing; never pass their objects/arrays to a D1 binding.
    const familyFilter = family ? (typeof family === 'string' ? family : '') : null;
    // BOARD-SIFT: a record goodOf would refuse is left out in the query too (an object's JSON alone), so a page is a page
    const from = `FROM market_listings l WHERE state = 'open' AND kind = 'item' AND expires_at > ?1
      AND (CASE WHEN json_valid(item) THEN json_type(item) = 'object' ELSE 0 END) AND (?2 IS NULL OR (${GOODS_FAMILY_SQL}) = ?2)
      AND vendor_id IS NULL`;   // HOME-VENDOR: a trader's stock stands at it alone
    const { rows: [counted, results], base } = await read([db.prepare(`SELECT COUNT(*) AS n ${from}`).bind(nowS, familyFilter),
      db.prepare(`SELECT * ${from} ORDER BY ${PIECE_ORDER[/** @type {keyof typeof PIECE_ORDER} */ (sort)]} ${pageSql(page)}`).bind(nowS, familyFilter)]);
    const rows = results.filter((l) => { const it = goodOf(l.item); return !!it && (!family || goodFamily(it) === family); });
    const { quotes, reports } = await after({ quoted: rows, reported: rows.map((l) => l.id) });
    return { ...base, ...paged(counted), rows: rows.map((l, i) => listingView(l, me, { road: quotes[i], ...(moderator ? { reports: reports.get(l.id) ?? 0 } : {}) })) };
  }
  if (view === 'auctions') {
    // PROF5b: every open auction, ending soonest first, each with its courier to this board (one piece)
    // BOARD-SIFT: a page of them, the family's and a search's recipes in the query (unfiltered, an unknown piece's too,
    // where neither narrows it), in the order asked
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
      // PROF5b: this account's auctions and its bids (the standing ones, and a week of the rest), each with its piece -
      // AUDIT PROF-541 R2-S4: its row LEFT joined, as the listings' are: a piece disenchanted since (its products row
      // deleted - alchemy.js disenchantPiece) keeps its history, named by its disenchant's recipe
      db.prepare(`SELECT a.*, ${GONE_RECIPE_SQL}, p.quality, p.seed, p.maker, p.marked, p.dye, p.hand, p.record, p.template, p.material AS dfu_material
      FROM market_auctions a LEFT JOIN products p ON p.provenance = a.provenance
      WHERE a.seller = ?1 AND (a.state = 'open' OR a.closed_at > ?2) ORDER BY a.state = 'open' DESC, a.at DESC LIMIT ${MARKET_SHOWN}`).bind(me, nowS - RECENT_S),
      db.prepare(`SELECT b.*, a.state AS auction_state, a.ends_at, a.high, a.opening, a.bids AS count, a.region AS auction_region,
        a.wear, ${GONE_RECIPE_SQL}, p.quality, p.seed, p.maker, p.marked, p.dye, p.hand, p.record, p.template, p.material AS dfu_material, a.provenance
      FROM market_bids b JOIN market_auctions a ON a.id = b.auction LEFT JOIN products p ON p.provenance = a.provenance   -- AUDIT PROF-541 R2-S4
      WHERE b.bidder = ?1 AND (b.state = 'high' OR b.at > ?2 OR a.closed_at > ?2)   -- AUDIT 31 S3: and a week from its auction's close
      ORDER BY b.state = 'high' DESC, b.at DESC LIMIT ${MARKET_SHOWN}`).bind(me, nowS - RECENT_S),
      ...(ids.length ? [pieceWaysRead(db, ids)] : []),   // MARKET-ANY: the List form's crafted pieces, each its own way
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
    // GLOBAL-MARKET: every board's open orders, dearest first, each with its road from this board (a fill from another
    // region pays the courier out of its pay) - MARKET-AUDIT S4: a family's chosen in the query, before the cutoff, as the
    // Materials view's (a hundred dearer orders of any other family hid it)
    const familyKeys = family ? JSON.stringify([...marketCatalogue().map((c) => c.key), ...UNYIELDED].filter((k) => material(k)?.family === family)) : null;
    // BOARD-SIFT: a page of them, and their whole count
    const from = `FROM market_orders WHERE state = 'open' AND expires_at > ?1
      AND (?2 IS NULL OR material IN (SELECT value FROM json_each(?2)))`;
    const { rows: [counted, rows], base } = await read([db.prepare(`SELECT COUNT(*) AS n ${from}`).bind(nowS, familyKeys),
      db.prepare(`SELECT * ${from} ORDER BY price DESC, at, id ${pageSql(page)}`).bind(nowS, familyKeys)]);
    const { quotes, medians } = await after({ quoted: rows, medianKeys: [...new Set(rows.map((o) => o.material))] });
    return { ...base, ...paged(counted), orders: rows.map((o, i) => ({ ...orderView(o, me), road: quotes[i] })), medians: Object.fromEntries(medians) };
  }
  // history - kept 90 days (section 20); SCALE4b: pruned by the service's clock (pruneMarketHistory), never this read
  // GOLD-MARKET: the History in the view's currency - gold's own table, never the Drakes'
  // AUDIT 30 U15: the Marks each side moved - a buyer the price and the courier, a seller the price less the tax and the
  // Tithe, a filler the pay, an orderer the price
  // GOLD-MARKET: each trade in its own currency - a gold seller's the price less the tax and the fee its sale paid
  // MARKET-ANY: a piece from a pack named by its listing's record (`good`)
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

/**
 * RPT1026-MARKET ARRIVE (private reports 2026-10-26: an axe paid for at a trader in a player's home that came nowhere,
 * the gold spent all the same): THE ROAD ALONE - `{ character }`: the account's own market settled (settle: its listings and orders
 * past their time closed and their goods sent back as deliveries, the couriers' loads into the Stores) and what is on its
 * way to the account read, nothing else - no view's rows, no couriers' hubs, no medians. A piece bought or come back is a
 * delivery that only a collect puts into the pack (collectGood, marketCollect), and the one reader of the road was the
 * Market tab's: a trader's buyer, a piece taken back off a trader, a listing that ran out, waited on the service for good
 * unless its player opened that tab - 154 such pieces stood uncollected for 102 players, 123 of them past a day. The game
 * reads this as the character's session stands (net/marketArrivals.js) and collects what has arrived. Two round trips:
 * the settle's reads (one batch, its writes only when there is work) and the road's with the balance (one batch).
 */
export async function marketRoad(ctx, player, env, { character } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { character, needRid: false });
  if (refused) return refused;
  const closed = shut(player, env);
  if (closed) return closed;
  const me = player.id;
  const touched = await settle(ctx, player);
  const [loads, pieces, goods, [bal] = []] = await readAll(db, [...roadReads(db, me), db.prepare('SELECT balance FROM marks WHERE account = ?').bind(me)]);
  // AUDIT 30 U1's law: the Stores the settle moved answered, this character's, so the pages read them
  const stores = await Promise.all([...touched].map((t) => t.split('|')).filter(([c]) => c === character).map(([c, m]) => storeOf(db, me, c, m)));
  return { ok: true, road: roadFrom([loads, pieces, goods], nowS), balance: bal ? Number(bal.balance) : 0, stores };
}

// ─── INT19: A CRAFTED PIECE OUT OF ITS SELLER'S RECORD ───────────────

/** INT19: the record a crafted piece was taken out of, kept while the market holds it (piece_escrow) - one statement,
 *  run only where `decided` (the act's decision as SQL over its own binds, `?1`..`?n`) holds. */
export const pieceEscrowStep = (db, provenance, character, me, moved, nowS, decided, binds) => db.prepare(`INSERT INTO piece_escrow (provenance, player, char_id, item, at)
  SELECT ?${binds.length + 1}, ?${binds.length + 2}, ?${binds.length + 3}, ?${binds.length + 4}, ?${binds.length + 5} WHERE ${decided}`)
  .bind(...binds, provenance, me, character, JSON.stringify(moved), nowS);

/** INT19: A CRAFTED PIECE COME BACK - cancelled, expired, unsold or removed: where the market holds its record
 *  (piece_escrow), an `item` delivery its seller's record collects (collectGood) - never minted at the pack - and the row
 *  gone; `row` the SQL naming the listing or auction row it came back from (provenance, seller, char_id, region),
 *  `binds` its own. A piece listed before INT19 holds no row and comes back as it always did (the caller's provenance
 *  delivery, which asks `NOT EXISTS` the row). */
export function pieceBackSteps(db, id, nowS, row, binds) {
  const n = binds.length;
  return [
    db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, item, why, from_region, arrives_at, at)
      SELECT ?${n + 1}, r.seller, r.char_id, e.item, 'returned', r.region, ?${n + 2}, ?${n + 2} FROM (${row}) r JOIN piece_escrow e ON e.provenance = r.provenance`).bind(...binds, id, nowS),
    db.prepare(`DELETE FROM piece_escrow WHERE provenance = (SELECT provenance FROM (${row}))
      AND EXISTS (SELECT 1 FROM market_deliveries WHERE id = ?${n + 1} AND item IS NOT NULL)`).bind(...binds, id),
  ];
}
/** INT19: where a crafted piece comes back with no record held for it (listed before INT19) - the SQL a provenance
 *  delivery adds, `p` the provenance's SQL. */
export const NO_ESCROW = (p) => `NOT EXISTS (SELECT 1 FROM piece_escrow WHERE provenance = ${p})`;

/** INT19: A CRAFTED PIECE HANDED ON - sold, won: its record no longer the market's to give back (piece_escrow), and the
 *  ledger's escrow row let go (ledger.js: a piece the service hands out is no row) - the buyer's piece is the craft's
 *  record's, minted at the pack as ever, and the first record to show it writes it down again; a copy claiming it is
 *  settled by the craft's record, as every crafted piece's claim is (ledgerStep) - its owner's again (RPT1026-LEDGERLAW:
 *  `handed_to` cleared). `p` the provenance's SQL - null unless the sale was decided - over `binds`. */
export const pieceSoldSteps = (db, p, binds) => [
  db.prepare(`DELETE FROM item_uids WHERE uid = (${p}) AND state = 'escrow' AND EXISTS (SELECT 1 FROM piece_escrow WHERE provenance = item_uids.uid)`).bind(...binds),
  db.prepare(`DELETE FROM piece_escrow WHERE provenance = (${p})`).bind(...binds),
  // RPT1026-LEDGERLAW: the sale moved its owner, so the craft's record is the owner's again - whoever the service last
  // handed it to (ledger.js CRAFT_RECORD_SQL) sold it, and a seller that kept it is the copier
  db.prepare(`UPDATE products SET handed_to = NULL WHERE provenance = (${p}) AND handed_to IS NOT NULL`).bind(...binds),
];
