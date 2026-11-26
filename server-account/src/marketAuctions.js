// @ts-check
import { mintId, overRate } from './accounts.js';
import { isDeveloper } from './titles.js';
import { balanceOf } from './marks.js';
import { listingsCapAt } from './seatForts.js';
import { realmActFirst, mustChange, dropIfUnnamed, recordMovedOf, dropObjects, realmHoldOf } from './realm.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { regionOk } from '../../src/net/nodeLaw.js';
import { MARKET_POSTS_MAX, MARKET_OPS_MAX, MARKET_WINDOW_S, priceOk, wearOk, provenanceOk, listingFee, pieceListable, AUCTION_S, AUCTION_LATE_S, AUCTION_ADD_S, bidOk, auctionNext, auctionable, wearOf } from '../../src/net/marketLaw.js';
import { MASTERWORK } from '../../src/net/recipeLaw.js';
import { prepareCraftedPiece, pieceComingBack } from './craftedPiece.js';
import { auditStatement } from './staff.js';
import { asks, shut, idOk, sellerStoppedSql, hubsOf, hubsAt, courierOf, courierSlow, spent, witnessStatements, pieceOf, auctionView, bidView, boardOf, openSalesSql } from './marketShared.js';
import { settle, pieceEscrowStep, pieceBackSteps } from './marketSettle.js';

export async function marketAuction(ctx, player, env, { character, region, provenance = null, wear = null, opening, hubs, rid, board = null, realm = null } = {}) {
  const { db, bucket, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const answer = async (row, extra = {}) => {
    const p = await db.prepare('SELECT * FROM products WHERE provenance = ?1').bind(row.provenance).first();
    return { ok: true, ...extra, auction: auctionView(row, me, { piece: pieceOf(p, row.wear) }), balance: await balanceOf(db, me) };
  };
  const priorOf = () => db.prepare('SELECT * FROM market_auctions WHERE seller = ?1 AND rid = ?2').bind(me, rid).first();
  if (realm == null) { const prior = await priorOf(); if (prior) return answer(prior, { repeat: true }); }
  // The realm record is asked before any refusal, so a retry whose answer was lost sees that its act landed.
  const side = await realmActFirst(db, me, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  const at = side.at;
  const prior = await priorOf();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!provenanceOk(provenance)) return { error: 'bad-provenance' };
  if (!wearOk(wear)) return { error: 'bad-wear' };
  const auctionsMax = await listingsCapAt(db, nowS, boardOf(board));
  if (!priceOk(opening)) return { error: 'bad-price' };
  const made = await db.prepare('SELECT recipe, quality FROM products WHERE provenance = ?1').bind(provenance).first();
  if (made && !pieceListable(made.recipe)) return { error: 'market-not-listable' };
  if (made && !auctionable(made.recipe, Number(made.quality))) return { error: 'auction-not-masterwork' };
  const held = await realmHoldOf(db, me, character);
  if (held) return held;
  if (await overRate(ctx, `market-post:${me}`, MARKET_POSTS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  await settle(ctx, player);
  if (await db.prepare('SELECT 1 FROM market_deliveries WHERE provenance = ?1 AND collected = 0').bind(provenance).first()) return { error: 'market-uncollected' };
  if (await pieceComingBack(db, me, provenance)) return { error: 'market-uncollected' };
  if (await db.prepare("SELECT 1 FROM home_decor WHERE json_extract(item, '$.pv') = ?1").bind(provenance).first()) return { error: 'market-standing' };
  const pieceNo = await pieceAuctionRefusal(db, me, provenance);
  if (pieceNo) return { error: pieceNo };
  const prep = await prepareCraftedPiece(ctx, me, at, provenance, true);
  if (prep.error) return prep;
  wear = wearOf(prep.moved);
  const fee = listingFee(opening);
  const id = mintId(rand);
  const nonce = mintId(rand);
  const own = hubsOf(hubs);
  const posted = 'EXISTS (SELECT 1 FROM market_auctions WHERE seller = ?1 AND rid = ?2 AND n = ?3)';
  const batch = [
    ...prep.steps,
    db.prepare(`INSERT OR IGNORE INTO market_auctions (id, seller, char_id, region, provenance, wear, opening, fee, at, ends_at, rid, n)
      SELECT ?3, ?1, ?2, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12
      WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?8
        AND ${openSalesSql('?9')} < ?13
        AND EXISTS (SELECT 1 FROM products WHERE provenance = ?5 AND owner = ?1 AND listed = 0 AND quality = ?14 AND COALESCE(bought_with, '') != 'gold')   -- GOLD-MARKET
        AND NOT EXISTS (SELECT 1 FROM market_listings WHERE provenance = ?5 AND state = 'open')
        AND NOT EXISTS (SELECT 1 FROM market_deliveries WHERE provenance = ?5 AND collected = 0)
        AND NOT EXISTS (SELECT 1 FROM home_decor WHERE json_extract(item, '$.pv') = ?5)
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?11 || ':afee')`)
      .bind(me, character, id, region, provenance, wear, opening, fee, nowS, nowS + AUCTION_S, rid, nonce, auctionsMax, MASTERWORK),
    // mustChange must follow the auction INSERT directly: it rolls back the batch when that INSERT wrote no row.
    mustChange(db),
    pieceEscrowStep(db, provenance, character, me, prep.moved, nowS, posted, [me, rid, nonce]),
    db.prepare(`UPDATE products SET listed = 1 WHERE provenance = ?4 AND ${posted}`).bind(me, rid, nonce, provenance),
    ...(boardOf(board) ? [db.prepare('UPDATE market_auctions SET board_x = ?4, board_y = ?5 WHERE seller = ?1 AND rid = ?2 AND n = ?3')
      .bind(me, rid, nonce, boardOf(board)[0], boardOf(board)[1])] : []),
    // The fee uses the `:afee` suffix, never the listing `:fee`, so one request id cannot pay both fees.
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', ?1, 'burn', NULL, 'market-fee', fee, ?4, at, ?1, id, rid || ':afee' FROM market_auctions WHERE seller = ?1 AND rid = ?2 AND n = ?3`)
      .bind(me, rid, nonce, utcDay(nowS)),
    ...witnessStatements(db, player, nowS, [region], own, 'EXISTS (SELECT 1 FROM market_auctions WHERE seller = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
  ];
  try {
    await db.batch(batch);
    await dropObjects(bucket, [prep.prev]);
  } catch {
    await dropIfUnnamed(db, bucket, me, at.id, prep.key);
    const moved = await recordMovedOf(db, me, at);
    if (moved && !(moved.error === 'seq' && moved.seq === prep.seq)) return moved;
  }
  const row = await db.prepare('SELECT * FROM market_auctions WHERE seller = ?1 AND rid = ?2').bind(me, rid).first();
  if (row?.n === nonce) return answer(row, { realm: { seq: prep.seq } });
  if (row) return answer(row, { repeat: true });
  if (await spent(db, me, rid, ':afee')) return { error: 'prof-rid' };
  if ((await balanceOf(db, me)) < fee) return { error: 'marks-short' };
  const open = await db.prepare(`SELECT ${openSalesSql('?2')} AS n`).bind(me, nowS).first();
  if (Number(open?.n ?? 0) >= auctionsMax) return { error: 'market-listings-max' };
  const p = await db.prepare('SELECT owner, listed, quality, bought_with FROM products WHERE provenance = ?1').bind(provenance).first();
  if (!p) return { error: 'market-no-record' };
  if (p.owner !== me) return { error: 'market-not-yours' };
  if (Number(p.quality) !== MASTERWORK) return { error: 'auction-not-masterwork' };
  if (p.bought_with === 'gold') return { error: 'market-gold-goods' };
  return { error: 'market-listed' };
}
export async function pieceAuctionRefusal(db, me, provenance) {
  const p = await db.prepare('SELECT owner, listed, quality, bought_with FROM products WHERE provenance = ?1').bind(provenance).first();
  if (!p) return 'market-no-record';
  if (p.owner !== me) return 'market-not-yours';
  if (Number(p.quality) !== MASTERWORK) return 'auction-not-masterwork';
  if (p.bought_with === 'gold') return 'market-gold-goods';
  if (Number(p.listed) === 1 || await db.prepare("SELECT 1 FROM market_listings WHERE provenance = ?1 AND state = 'open'").bind(provenance).first()) return 'market-listed';
  return null;
}

export async function marketBid(ctx, player, env, { character, region, auction: id, amount, hubs, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const answer = async (b, extra = {}) => {
    const a = await db.prepare('SELECT * FROM market_auctions WHERE id = ?1').bind(b.auction).first();
    return { ok: true, ...extra, bid: bidView(b), ...(a ? { auction: auctionView(a, me, { leading: a.high_bid === b.id }) } : {}), balance: await balanceOf(db, me) };
  };
  const prior = await db.prepare('SELECT * FROM market_bids WHERE bidder = ?1 AND rid = ?2').bind(me, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!idOk(id)) return { error: 'bad-listing' };
  if (!bidOk(amount)) return { error: 'bad-bid' };
  if (await overRate(ctx, `market:${me}`, MARKET_OPS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  const a = await db.prepare(`SELECT a.*, (SELECT bidder FROM market_bids WHERE id = a.high_bid) AS high_bidder, ${sellerStoppedSql('a', '?2')} AS seller_stopped,
    (SELECT frozen_until FROM players WHERE id = a.seller) AS seller_frozen FROM market_auctions a WHERE a.id = ?1`).bind(id, nowS).first();
  if (!a || a.state !== 'open' || Number(a.ends_at) <= nowS) return { error: 'market-gone' };
  if (Number(a.seller_frozen) > nowS) return { error: 'market-seller-frozen' };
  if (a.seller === me) return { error: 'market-own' };
  if (Number(a.seller_stopped)) return { error: 'market-gone' };
  if (a.high_bidder === me) return { error: 'auction-leading' };
  const high = a.high == null ? null : Number(a.high);
  const next = auctionNext(high, Number(a.opening));
  if (amount < next) return { error: 'auction-low' };
  const from = Number(a.region);
  const own = hubsOf(hubs);
  const road = courierOf(await hubsAt(db, [from, region], own), from, region, 1, courierSlow(env, nowS, region));
  if (!road) return { error: 'market-no-road' };
  const held = amount + road.courier;
  const bidId = mintId(rand);
  const nonce = mintId(rand);
  const decided = 'EXISTS (SELECT 1 FROM market_auctions WHERE id = ?1 AND bn = ?2 AND high_bid = ?3)';
  await db.batch([
    db.prepare(`UPDATE market_auctions SET high = ?4, high_bid = ?5, bids = bids + 1, bn = ?6,
        ends_at = CASE WHEN ends_at - ?7 < ?8 THEN ends_at + ?9 ELSE ends_at END
      WHERE id = ?1 AND state = 'open' AND ends_at > ?7 AND seller != ?2 AND high IS ?3
        AND NOT EXISTS (SELECT 1 FROM market_bids WHERE id = market_auctions.high_bid AND bidder = ?2)
        AND ?4 >= ?10
        AND COALESCE((SELECT balance FROM marks WHERE account = ?2), 0) >= ?11
        AND NOT EXISTS (SELECT 1 FROM market_bids WHERE bidder = ?2 AND rid = ?12)
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?2 AND rid = ?12 || ':bid')`)
      .bind(id, me, high, amount, bidId, nonce, nowS, AUCTION_LATE_S, AUCTION_ADD_S, next, held, rid),
    // The old bid is marked outbid before the new one is inserted, because a unique index allows one high bid.
    db.prepare(`UPDATE market_bids SET state = 'outbid' WHERE auction = ?1 AND state = 'high' AND id != ?3 AND ${decided}`).bind(id, nonce, bidId),
    db.prepare(`INSERT INTO market_bids (id, auction, bidder, char_id, region, amount, courier, road, seconds, state, at, rid, n)
      SELECT ?3, ?1, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'high', ?11, ?12, ?2 WHERE ${decided}`)
      .bind(id, nonce, bidId, me, character, region, amount, road.courier, road.road, road.seconds, nowS, rid),
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', bidder, 'escrow', id, 'bid-escrow', amount + courier, ?3, at, bidder, auction, rid || ':bid' FROM market_bids WHERE id = ?1 AND n = ?2`)
      .bind(bidId, nonce, utcDay(nowS)),
    ...witnessStatements(db, player, nowS, [from, region], own, 'EXISTS (SELECT 1 FROM market_bids WHERE bidder = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
  ]);
  const made = await db.prepare('SELECT * FROM market_bids WHERE bidder = ?1 AND rid = ?2').bind(me, rid).first();
  if (made?.n === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  if (await spent(db, me, rid, ':bid')) return { error: 'prof-rid' };
  const now = await db.prepare(`SELECT a.*, (SELECT bidder FROM market_bids WHERE id = a.high_bid) AS high_bidder FROM market_auctions a WHERE a.id = ?1`).bind(id).first();
  if (!now || now.state !== 'open' || Number(now.ends_at) <= nowS) return { error: 'market-gone' };
  if (now.high_bidder === me) return { error: 'auction-leading' };
  const nowNext = auctionNext(now.high == null ? null : Number(now.high), Number(now.opening));
  if (amount < nowNext) return { error: 'auction-low' };
  if ((await balanceOf(db, me)) < held) return { error: 'marks-short' };
  return { error: 'auction-moved' };
}

export async function auctionCancel(ctx, player, id, rid) {
  const { db, nowS, rand } = ctx;
  const me = player.id;
  const a = await db.prepare('SELECT * FROM market_auctions WHERE id = ?1 AND seller = ?2').bind(id, me).first();
  if (!a || a.state !== 'open') return { error: 'market-gone' };
  if (a.high_bid != null) return { error: 'auction-bid-standing' };
  const nonce = mintId(rand);
  await db.batch([
    db.prepare(`UPDATE market_auctions SET state = 'cancelled', closed_at = ?3, returned = 1, cancel_rid = ?4, rn = ?5
      WHERE id = ?1 AND seller = ?2 AND state = 'open' AND high_bid IS NULL`).bind(id, me, nowS, rid, nonce),
    db.prepare(`UPDATE products SET listed = 0 WHERE provenance = (SELECT provenance FROM market_auctions WHERE id = ?1 AND rn = ?2)`).bind(id, nonce),
    ...pieceBackSteps(db, id, nowS, 'SELECT provenance, seller, char_id, region FROM market_auctions WHERE id = ?1 AND rn = ?2', [id, nonce]),
  ]);
  const made = await db.prepare('SELECT * FROM market_auctions WHERE seller = ?1 AND cancel_rid = ?2').bind(me, rid).first();
  if (made) return auctionCancelled(db, me, made, made.rn === nonce ? {} : { repeat: true });
  const now = await db.prepare('SELECT state, high_bid FROM market_auctions WHERE id = ?1').bind(id).first();
  return { error: now?.state === 'open' && now.high_bid != null ? 'auction-bid-standing' : 'market-gone' };
}
export async function auctionCancelled(db, me, a, extra = {}) {
  if (await pieceCameBack(db, a.id)) return { ok: true, ...extra, auction: auctionView(a, me), delivery: { id: a.id }, balance: await balanceOf(db, me) };
  const p = await db.prepare('SELECT * FROM products WHERE provenance = ?1').bind(a.provenance).first();
  return { ok: true, ...extra, auction: auctionView(a, me), piece: pieceOf(p, a.wear), balance: await balanceOf(db, me) };
}
export const pieceCameBack = async (db, id) => !!(await db.prepare("SELECT 1 FROM market_deliveries WHERE id = ?1 AND why = 'returned' AND item IS NOT NULL").bind(id).first());

export async function marketReport(ctx, player, env, { listing: id } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { needRid: false, needChar: false });
  if (refused) return refused;
  const closed = shut(player, env);
  if (closed) return closed;
  if (!idOk(id)) return { error: 'bad-listing' };
  if (await overRate(ctx, `market:${player.id}`, MARKET_OPS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  const l = await db.prepare('SELECT seller, state FROM market_listings WHERE id = ?1').bind(id).first();
  const a = l ? null : await db.prepare('SELECT seller, state FROM market_auctions WHERE id = ?1').bind(id).first();
  const row = l ?? a;
  if (!row || row.state !== 'open') return { error: 'market-gone' };
  if (row.seller === player.id) return { error: 'market-own' };
  if (l) await db.prepare('INSERT OR IGNORE INTO market_reports (listing, reporter, at) VALUES (?1, ?2, ?3)').bind(id, player.id, nowS).run();
  else await db.prepare('INSERT OR IGNORE INTO market_auction_reports (auction, reporter, at) VALUES (?1, ?2, ?3)').bind(id, player.id, nowS).run();
  return { ok: true };
}

export async function marketRemove(ctx, player, env, { listing: id } = {}, { keep = false, also = null, audit = null } = {}) {
  const { db, nowS, rand } = ctx;
  if (!isDeveloper(player, env)) return { error: 'not-developer' };
  /** @type {(how: { target: string|null, okIf?: { sql: string, args: unknown[] }, error?: string }) => any} */
  const row = audit ?? ((how) => auditStatement(db, nowS, {
    actor: player, role: 'admin', act: 'market-pull', target: how.target,
    detail: { listing: String(id ?? '').slice(0, 40), door: 'game', ...(how.error ? { error: how.error } : {}) }, ...(how.okIf ? { okIf: how.okIf } : { outcome: 'failed' }),
  }));
  const refuse = async (/** @type {string|null} */ target, /** @type {string} */ error) => { await row({ target, error }).run(); return { error }; };
  if (!idOk(id)) return refuse(null, 'bad-listing');
  const at = await db.prepare("SELECT 'listing' AS t, seller, state FROM market_listings WHERE id = ?1 UNION ALL SELECT 'auction', seller, state FROM market_auctions WHERE id = ?1").bind(id).first();
  if (at?.state !== 'open') return refuse(at?.seller ?? null, 'market-gone');
  const nonce = mintId(rand);
  const kept = keep ? ', returned = 1, rn = ?3' : '';
  const more = (/** @type {'listing'|'auction'} */ table) => (also ? also(nonce, table) : []);
  // Each batch writes the audit row first, so its okIf condition still sees the row open.
  const written = (/** @type {string} */ table) => row({ target: at.seller, okIf: { sql: `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND state = 'open')`, args: [id] } });
  if (at.t === 'listing') {
    const [, r] = await db.batch([
      written('market_listings'),
      db.prepare(`UPDATE market_listings SET state = 'removed', closed_at = ?2${kept} WHERE id = ?1 AND state = 'open'`).bind(id, nowS, ...(keep ? [nonce] : [])),
      ...more('listing'),
    ]);
    return r.meta?.changes ? { ok: true } : { error: 'market-gone' };
  }
  await db.batch([
    written('market_auctions'),
    db.prepare(`UPDATE market_auctions SET state = 'removed', closed_at = ?2, cn = ?3${kept} WHERE id = ?1 AND state = 'open'`).bind(id, nowS, nonce),
    db.prepare(`UPDATE market_bids SET state = 'void' WHERE auction = ?1 AND state = 'high'
      AND EXISTS (SELECT 1 FROM market_auctions WHERE id = ?1 AND cn = ?2 AND state = 'removed')`).bind(id, nonce),
    ...more('auction'),
  ]);
  const a = await db.prepare('SELECT cn FROM market_auctions WHERE id = ?1').bind(id).first();
  return a?.cn === nonce ? { ok: true } : { error: 'market-gone' };
}
