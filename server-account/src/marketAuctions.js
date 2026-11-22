// @ts-check
// Auctions: opening one, bidding, a seller's cancel, and a piece coming back, with a listing's
// report and its removal by a moderator.
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

// ─── PROF5b: TIMED AUCTIONS (10.2, Professions-Arc 27) ───────────────

/**
 * AUCTION: `{ character, region, provenance, wear, opening, hubs?, rid }` - a crafted Masterwork this account owns and
 * has not listed, posted at an opening bid on the boards of `region` for 24 hours, for the listing fee burnt (1% of the
 * opening bid). The piece leaves the save (the book keeps it) and comes back unsold on the seller's read.
 */
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
  // INT19: THE MASTERWORK LEAVES ITS SELLER'S REALM RECORD, as a listed piece does (marketList) - the record asked first
  if (realm == null) { const prior = await priorOf(); if (prior) return answer(prior, { repeat: true }); }
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
  const auctionsMax = await listingsCapAt(db, nowS, boardOf(board));   // SEAT2b (7.5): a Market Hall's town lists a quarter more a tier
  if (!priceOk(opening)) return { error: 'bad-price' };
  const made = await db.prepare('SELECT recipe, quality FROM products WHERE provenance = ?1').bind(provenance).first();
  if (made && !pieceListable(made.recipe)) return { error: 'market-not-listable' };
  if (made && !auctionable(made.recipe, Number(made.quality))) return { error: 'auction-not-masterwork' };
  const held = await realmHoldOf(db, me, character);   // INT3 (AUDIT INT): a held character auctions nothing - INT19: its record proves the piece its own (CRAFT-HOLD's maker's hold retired here)
  if (held) return held;
  if (await overRate(ctx, `market-post:${me}`, MARKET_POSTS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  await settle(ctx, player);   // MARKET-AUDIT: as a listing posted - a listing past its hours, unsettled, stood among the thirty
  if (await db.prepare('SELECT 1 FROM market_deliveries WHERE provenance = ?1 AND collected = 0').bind(provenance).first()) return { error: 'market-uncollected' };
  if (await pieceComingBack(db, me, provenance)) return { error: 'market-uncollected' };   // INT19: back as its record, still to collect
  if (await db.prepare("SELECT 1 FROM home_decor WHERE json_extract(item, '$.pv') = ?1").bind(provenance).first()) return { error: 'market-standing' };
  const pieceNo = await pieceAuctionRefusal(db, me, provenance);   // INT19: a piece another act holds said so, before the record moves
  if (pieceNo) return { error: pieceNo };
  // INT19: THE RECORD'S OWN MASTERWORK, out of it in the auction's own batch (GUARDED), its wear the record's
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
    // THE DECISION: the fee held, a place among the thirty, and the piece - this account's Masterwork, on no sale, on no
    // road, standing in no home - and the id not spent
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
    mustChange(db),   // INT19: no auction, no piece out of the record
    pieceEscrowStep(db, provenance, character, me, prep.moved, nowS, posted, [me, rid, nonce]),
    db.prepare(`UPDATE products SET listed = 1 WHERE provenance = ?4 AND ${posted}`).bind(me, rid, nonce, provenance),
    // SEAT1d: the board it was posted at - its Tithe's seat
    ...(boardOf(board) ? [db.prepare('UPDATE market_auctions SET board_x = ?4, board_y = ?5 WHERE seller = ?1 AND rid = ?2 AND n = ?3')
      .bind(me, rid, nonce, boardOf(board)[0], boardOf(board)[1])] : []),
    // the fee burnt - `:afee`, never a listing's `:fee`, so one id cannot hold both
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', ?1, 'burn', NULL, 'market-fee', fee, ?4, at, ?1, id, rid || ':afee' FROM market_auctions WHERE seller = ?1 AND rid = ?2 AND n = ?3`)
      .bind(me, rid, nonce, utcDay(nowS)),
    ...witnessStatements(db, player, nowS, [region], own, 'EXISTS (SELECT 1 FROM market_auctions WHERE seller = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
  ];
  try {
    await db.batch(batch);
    await dropObjects(bucket, [prep.prev]);
  } catch {
    await dropIfUnnamed(db, bucket, me, at.id, prep.key);   // AUDIT REALM2 S3
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
  if (!p) return { error: 'market-no-record' };   // AUDIT 31 H1: no record at all - never "another owner's"
  if (p.owner !== me) return { error: 'market-not-yours' };
  if (Number(p.quality) !== MASTERWORK) return { error: 'auction-not-masterwork' };
  if (p.bought_with === 'gold') return { error: 'market-gold-goods' };   // GOLD-MARKET: an auction is in Drakes
  return { error: 'market-listed' };
}
/** INT19: why a Masterwork may not go up for auction before the record moves - its record, its owner, its quality, its
 *  currency, another sale of it - or null (the decision asks the fee and the place among the thirty). */
export async function pieceAuctionRefusal(db, me, provenance) {
  const p = await db.prepare('SELECT owner, listed, quality, bought_with FROM products WHERE provenance = ?1').bind(provenance).first();
  if (!p) return 'market-no-record';
  if (p.owner !== me) return 'market-not-yours';
  if (Number(p.quality) !== MASTERWORK) return 'auction-not-masterwork';
  if (p.bought_with === 'gold') return 'market-gold-goods';
  if (Number(p.listed) === 1 || await db.prepare("SELECT 1 FROM market_listings WHERE provenance = ?1 AND state = 'open'").bind(provenance).first()) return 'market-listed';
  return null;
}

/**
 * BID: `{ character, region, auction, amount, hubs?, rid }` - at least the auction's next bid, escrowed with the courier
 * from this board's region to the auction's; the standing bid outbid (its escrow back on its bidder's read), the end
 * moved two minutes on by a bid in its last two. The decision is the auction row's own update, keyed on the standing
 * bid the next was read from - one standing bid an auction is an index, so the new bid's row follows the old one's
 * outbidding.
 */
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
  if (!bidOk(amount)) return { error: 'bad-bid' };   // AUDIT 31 L6: a bid's bound is the Marks cap, never a price's
  if (await overRate(ctx, `market:${me}`, MARKET_OPS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  const a = await db.prepare(`SELECT a.*, (SELECT bidder FROM market_bids WHERE id = a.high_bid) AS high_bidder, ${sellerStoppedSql('a', '?2')} AS seller_stopped,
    (SELECT frozen_until FROM players WHERE id = a.seller) AS seller_frozen FROM market_auctions a WHERE a.id = ?1`).bind(id, nowS).first();
  if (!a || a.state !== 'open' || Number(a.ends_at) <= nowS) return { error: 'market-gone' };
  if (Number(a.seller_frozen) > nowS) return { error: 'market-seller-frozen' };   // STAFF-PANEL5-FREEZE: nor its auctions
  if (a.seller === me) return { error: 'market-own' };
  if (Number(a.seller_stopped)) return { error: 'market-gone' };   // STAFF-PANEL3-REALM: a seller held or banned (sellerStoppedSql)
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
    // THE DECISION: still open and not ended, not the seller's, the standing bid the one the next was read from and not
    // this bidder's, the amount at least the next, the bidder's Marks for it and its courier, the id not spent
    db.prepare(`UPDATE market_auctions SET high = ?4, high_bid = ?5, bids = bids + 1, bn = ?6,
        ends_at = CASE WHEN ends_at - ?7 < ?8 THEN ends_at + ?9 ELSE ends_at END
      WHERE id = ?1 AND state = 'open' AND ends_at > ?7 AND seller != ?2 AND high IS ?3
        AND NOT EXISTS (SELECT 1 FROM market_bids WHERE id = market_auctions.high_bid AND bidder = ?2)
        AND ?4 >= ?10
        AND COALESCE((SELECT balance FROM marks WHERE account = ?2), 0) >= ?11
        AND NOT EXISTS (SELECT 1 FROM market_bids WHERE bidder = ?2 AND rid = ?12)
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?2 AND rid = ?12 || ':bid')`)
      .bind(id, me, high, amount, bidId, nonce, nowS, AUCTION_LATE_S, AUCTION_ADD_S, next, held, rid),
    // the standing bid outbid - its escrow back on its bidder's read
    db.prepare(`UPDATE market_bids SET state = 'outbid' WHERE auction = ?1 AND state = 'high' AND id != ?3 AND ${decided}`).bind(id, nonce, bidId),
    db.prepare(`INSERT INTO market_bids (id, auction, bidder, char_id, region, amount, courier, road, seconds, state, at, rid, n)
      SELECT ?3, ?1, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'high', ?11, ?12, ?2 WHERE ${decided}`)
      .bind(id, nonce, bidId, me, character, region, amount, road.courier, road.road, road.seconds, nowS, rid),
    // the bid and its courier held on the ledger's escrow end, under the bid's own id
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
  if (amount < nowNext) return { error: 'auction-low' };   // another bid landed between: the refusal a word, the next on the re-read
  if ((await balanceOf(db, me)) < held) return { error: 'marks-short' };
  // AUDIT 31 S4: another bid landed between the read and the decision, and this one would still beat it - never "no
  // longer on the market" while it stands; the tab reads it again
  return { error: 'auction-moved' };
}

/** An auction cancelled by its seller while no bid stands - its piece answered back to the pack, the fee kept. */
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
    ...pieceBackSteps(db, id, nowS, 'SELECT provenance, seller, char_id, region FROM market_auctions WHERE id = ?1 AND rn = ?2', [id, nonce]),   // INT19
  ]);
  const made = await db.prepare('SELECT * FROM market_auctions WHERE seller = ?1 AND cancel_rid = ?2').bind(me, rid).first();
  if (made) return auctionCancelled(db, me, made, made.rn === nonce ? {} : { repeat: true });
  const now = await db.prepare('SELECT state, high_bid FROM market_auctions WHERE id = ?1').bind(id).first();
  return { error: now?.state === 'open' && now.high_bid != null ? 'auction-bid-standing' : 'market-gone' };
}
export async function auctionCancelled(db, me, a, extra = {}) {
  // INT19: a Masterwork the market holds the record of comes back by a delivery its seller's record collects
  if (await pieceCameBack(db, a.id)) return { ok: true, ...extra, auction: auctionView(a, me), delivery: { id: a.id }, balance: await balanceOf(db, me) };
  const p = await db.prepare('SELECT * FROM products WHERE provenance = ?1').bind(a.provenance).first();
  return { ok: true, ...extra, auction: auctionView(a, me), piece: pieceOf(p, a.wear), balance: await balanceOf(db, me) };
}
/** INT19: whether a crafted piece came back from listing or auction `id` as its record (pieceBackSteps' delivery). */
export const pieceCameBack = async (db, id) => !!(await db.prepare("SELECT 1 FROM market_deliveries WHERE id = ?1 AND why = 'returned' AND item IS NOT NULL").bind(id).first());

// ─── REPORTS AND REMOVAL (section 20) ────────────────────────────────

/** REPORT: `{ listing }` - once a registered reader; counted for the moderators, hiding nothing. */
export async function marketReport(ctx, player, env, { listing: id } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { needRid: false, needChar: false });
  if (refused) return refused;
  const closed = shut(player, env);
  if (closed) return closed;
  if (!idOk(id)) return { error: 'bad-listing' };
  if (await overRate(ctx, `market:${player.id}`, MARKET_OPS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  const l = await db.prepare('SELECT seller, state FROM market_listings WHERE id = ?1').bind(id).first();
  // PROF5b: an auction is reported as a listing is, in its own table
  const a = l ? null : await db.prepare('SELECT seller, state FROM market_auctions WHERE id = ?1').bind(id).first();
  const row = l ?? a;
  if (!row || row.state !== 'open') return { error: 'market-gone' };
  if (row.seller === player.id) return { error: 'market-own' };
  if (l) await db.prepare('INSERT OR IGNORE INTO market_reports (listing, reporter, at) VALUES (?1, ?2, ?3)').bind(id, player.id, nowS).run();
  else await db.prepare('INSERT OR IGNORE INTO market_auction_reports (auction, reporter, at) VALUES (?1, ?2, ?3)').bind(id, player.id, nowS).run();
  return { ok: true };
}

/** REMOVE: `{ listing }` - a developer's: the listing off every board, its goods returned on its seller's next read.
 *  PROF5b: an auction likewise - its standing bid voided (its escrow back on its bidder's read), its piece returned.
 *  STAFF-PANEL2-FIX (design doc "DFO Staff Panel: design", Weak spots: "/v1/mod/ acts are limited to in-game mute and
 *  ban, and Market Pull is Admin only"): a Moderator no longer pulls a listing - an Admin (DEVELOPER_HANDLES) does.
 *  STAFF-PANEL3-REALM (design doc "Remove items": "Remove from market: the listing ends and the item does not go back"):
 *  `keep` - the staff panel's removal: the same end, and the goods marked returned in the statement that ends it (`rn` the
 *  removal's nonce), so its seller's settle never hands them back; `also(nonce, table)` the panel's own statements for the
 *  batch (its 30-day store's row, the ledger's mark), each guarded on the nonce. Put back clears the mark (staffRealm.js),
 *  and the seller's next read settles the goods back as any removal's.
 *  STAFF-PANEL3-REALM (FLAW REVIEW; design doc weak spots: "Audit rows are written inside the shared act code, so in-game
 *  ... acts land in the log too"): ONE staff_audit ROW A REMOVAL, whichever door asked it - the staff panel's (`audit`, its
 *  member, act and words) or the game's (/v1/market/remove: the developer, an Admin) - a refusal 'failed' with its word,
 *  and the removal's own row in the removal's own batch, 'ok' only where it ended an open listing or auction. */
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
