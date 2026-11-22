// @ts-check
// ═══════════════════════════════════════════════════════════════════
// PROF5 (2026-09-29, Mac: "Continue") - THE MARKET, AS THE SERVICE KEEPS
// IT: listings of Stores materials and crafted pieces, their sales and
// couriers, buy orders and their fills, the prices' history, reports and
// removal (bible/06-Systems/Professions-Arc.md 10.2-10.5 and 26; the
// numbers are src/net/marketLaw.js, which the client reads too).
//
// ═══ OPEN WHERE THE BOARD, THE PROFESSIONS AND THE MARKS ARE ═══════
//
// The market is the board's tab, sells the Stores and moves Marks, so it
// is open to an account only while BOARD_OPEN, PROFESSIONS_OPEN and
// MARKS_OPEN all are (PROF0 26: no switch of its own). Registered accounts
// alone, as the Stores are.
//
// ═══ ONE STATEMENT DECIDES, AND A REQUEST ASKED TWICE IS ONE ════════
//
// PROF1's law, whole: each act is one `db.batch` whose FIRST statement
// writes its row with a fresh nonce `n` only where every condition holds
// against the rows as they stand - the listing still open with the units,
// the buyer's Marks, the seller's room under the cap, the Stores' room -
// and every statement after it moves goods and Marks only where that row
// carries this request's nonce. The row is looked for BEFORE the switch
// (AUDIT 28 M2): a request that was made is answered, `repeat`.
//
// ═══ SETTLED ON READ ════════════════════════════════════════════════
//
// Nothing here runs on a clock. A listing past its 72 hours, an order past
// its seventh day, a courier's load that has arrived - each is settled on
// its owner's next read of the market, one row a batch (so a full Stores
// keeps one load waiting without refusing the rest), each keyed on its
// row's own id, so it happens once.
//
// ═══ THE LEDGER'S LINES (AUDIT 30 S1-S4) ════════════════════════════
//
// Every Marks line an act writes carries its OWN name in the one ledger's `(actor, rid)` namespace - the request id and
// a suffix no client id can hold (`:fee`, `:sale`, `:tax`, `:courier`, `:escrow`, `:fill`, `:filltax`) - and is a plain
// INSERT: a line that cannot be written (a clash, a balance its trigger would break) throws and rolls the whole act
// back, where INSERT OR IGNORE let the act stand with its Marks unmoved (and swallowed the trigger's CHECK). The rows
// that answer a repeat are pruned after 90 days (section 20) but the ledger is forever, so each decision also refuses
// a request whose first line the ledger already holds - a request id is spent once, whatever was pruned since.
//
// ═══ PROF5b: TIMED AUCTIONS (Professions-Arc 27) ════════════════════
//
// A Masterwork posted at an opening bid for 24 hours; each bid escrowed with its courier, 5% over the standing one,
// and a bid in the last two minutes adds two. An auction past its end is closed by the next market read of ANYONE
// (its seller, its winner and its outbid bidders each need it) - at most SETTLE_MAX a read, one batch each, keyed on
// its own nonce `cn`; an outbid bid's escrow comes back on its bidder's own read, under the Marks cap.
//
// EVERY CLOCK IS AN ARGUMENT, as in accounts.js.
// ═══════════════════════════════════════════════════════════════════
import { mintId, overRate } from './accounts.js';
import { balanceOf } from './marks.js';
import { titheAt } from './seatHolding.js';   // SEAT1d: the bailiwick's Tithe
import { listingsCapAt } from './seatForts.js';   // SEAT2b: a Market Hall's listings
import { titheOf } from '../../src/net/townSeatLaw.js';
import { spendStatements, spendOrigins, spendableSql, storeOf, silverClothIn } from './professions.js';   // WOVEN-PAYS: a cloth bought with Drakes, counted
import { REALM_ID_RE, realmActFirst, prepareRealmRecord, mustChange, dropIfUnnamed, recordMovedOf, dropObjects, realmHoldOf } from './realm.js';   // GOLD-MARKET
import { lawfulItem } from '../../src/items/itemLaw.js';   // INT1: no piece the law cannot stand behind is listed; LW15: a patron's judge
import { payFromSave, creditSave } from '../../src/net/realmGoldLaw.js';   // GOLD-MARKET: a gold sale moves a realm record's gold
import { readAll } from './service.js';   // MARKET-SPEED: a read's queries in three round trips
import { MARKS_MAX, MARK_WORTH_GOLD, utcDay } from '../../src/net/marksLaw.js';
import { STORES_MAX, looseOnly } from '../../src/net/professionLaw.js';   // CLOTH-GEMS: the loose door's materials are no market's
import { material, regionOk } from '../../src/net/nodeLaw.js';
import {
  MARKET_LISTING_S, MARKET_ORDER_S, MARKET_ORDERS_MAX, MARKET_POSTS_MAX, MARKET_OPS_MAX, MARKET_WINDOW_S,
    unitsOk, priceOk, wearOk, provenanceOk, listingFee, saleTaxOn,  saleTitheOn,  
  MARKET_WORTH_MAX, UNYIELDED, pieceListable,  
  currencyOk, goldSaleOf, MARKET_GOLD_HELD_MAX,
  goodRefusal,      // MARKET-ANY
  fillTaxOn,   // MARKET-AUDIT S2
  wearOf   // INT19: a crafted piece's wear, its record's
} from '../../src/net/marketLaw.js';
import { takeTradeGoods, giveTradeGoods, recordCount } from '../../src/net/realmTradeLaw.js';   // MARKET-ANY: a piece out of one record and into another, as a trade moves it
import { prepareCraftedPiece, pieceComingBack } from './craftedPiece.js';   // INT19: a crafted piece out of its seller's record, and back as it
import { vendorOf, VENDOR_STATION, VENDOR_LISTING_S, VENDOR_STOCK_MAX } from '../../src/net/vendorLaw.js';   // HOME-VENDOR: a home's trader
import { tradeActStatements } from './townEcon.js';   // TOWN-ECON TE2: a trader's sale and a patron's, counted at their town
import {
       asks, shut, VENDOR_STANDS_SQL, idOk,
  sellerStoppedSql, hubsOf, hubsAt,    courierOf, courierSlow, spent,
  witnessStatements, pieceOf, goodOf, stackedListing,
    listingView,     boardOf, rowBoard, titheEnd,
  stallSalesSql, openSalesSql, orderView
} from './marketShared.js';
import {
  settle, backToStores, orderReturn, pieceEscrowStep, pieceBackSteps, pieceSoldSteps
} from './marketSettle.js';
import { auctionCancel, auctionCancelled, pieceCameBack } from './marketAuctions.js';
export { marketAuction, marketBid, marketReport, marketRemove } from './marketAuctions.js';
export { closeAuctions, pruneMarketHistory, marketRead, marketRoad } from './marketSettle.js';
export {
  marketVendor, marketVendors, vendorBoard, VENDOR_BOARD_READ, VENDOR_BOARD_KEEP, VENDOR_BOARD_KEPT_S, vendorSpan,
  vendorBoardOf, marketMyVendors, PATRON_CRON_TOWNS, PATRON_READ_STATEMENTS, PATRON_TOLD_S, PATRON_COUNTS_SQL,
  PATRON_TOLD_SQL, VENDOR_NEWEST_SQL, VENDOR_HOUSES_SQL, VENDOR_SPAN_SQL, VENDOR_BOARD_SHAPE, patronSalt,
  reckonPatrons, markPatronsShut, patronsTold
} from './marketVendors.js';
export { SETTLE_MAX, marketOpenFor, sellerStoppedSql, TITHE_PCT_MOST } from './marketShared.js';



// ─── A LISTING (10.2) ────────────────────────────────────────────────

/**
 * LIST: `{ character, region, kind, material?, units?, provenance?, wear?, price, hubs?, rid, currency? }` - a Stores
 * material's `units` (bought first out of the Stores, the split kept) at a unit price, or a crafted piece this account
 * owns and has not listed, at its whole price and wear - on the boards of `region` for 72 hours, for the listing fee
 * burnt.
 * GOLD-MARKET: `currency` 'gold' prices it in gold - a realm character's alone (its proceeds are collected into its
 * record); its units its own and those bought with gold (gold's first), never those bought with Drakes; a piece never
 * bought, or bought with gold; its fee taken out of each sale (goldSaleOf), none now. A Drakes listing never takes gold's
 * units, nor a piece bought with gold (the wall).
 * MARKET-ANY: `kind` 'item' - a piece from the pack, with `item`, `pick` and `realm` (listGood).
 */
export async function marketList(ctx, player, env, { character, region, kind, material: key = null, units = 1, provenance = null, wear = null, price, hubs, rid, currency = 'marks', board = null, item = null, pick = null, realm = null, vendor = null } = {}) {
  // MARKET-ANY: a piece from the pack moves its seller's realm record - its own door, where the record stands asked first
  if (kind === 'item') return listGood(ctx, player, env, { character, region, item, pick, price, hubs, rid, currency, realm, board, vendor });   // AUDIT SEATS-3 D2: and its board
  if (vendor != null) return { error: 'bad-vendor' };   // HOME-VENDOR: a trader sells pieces from the pack alone
  const { db, bucket, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const answer = async (row, extra = {}) => ({
    ok: true, ...extra, listing: listingView(row, me), balance: await balanceOf(db, me),
    ...(row.kind === 'material' ? { store: await storeOf(db, me, row.char_id, row.material) } : {}),
  });
  const priorOf = () => db.prepare('SELECT * FROM market_listings WHERE seller = ?1 AND rid = ?2').bind(me, rid).first();
  // INT19: A CRAFTED PIECE LEAVES ITS SELLER'S REALM RECORD - where the record stands asked before any other word (AUDIT
  // REALM L1-F2), as listGood's; a list asked again with no record (kept by a tab from before) answered as it landed
  let at = null;
  if (kind === 'piece') {
    if (realm == null) { const prior = await priorOf(); if (prior) return answer(prior, { repeat: true }); }
    const side = await realmActFirst(db, me, character, realm);
    if (side.error) return side;
    if (!side.at) return { error: 'realm-needed' };   // a crafted piece lists out of a realm record alone
    at = side.at;
  }
  const prior = await priorOf();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!priceOk(price)) return { error: 'bad-price' };
  if (!currencyOk(currency)) return { error: 'bad-act' };
  if (currency === 'gold' && !REALM_ID_RE.test(character)) return { error: 'market-gold-realm' };   // GOLD-MARKET: gold is a realm record's
  const gold = currency === 'gold';
  const listingsMax = await listingsCapAt(db, nowS, boardOf(board));   // SEAT2b (7.5): a Market Hall's town lists a quarter more a tier
  const other = gold ? 'gold' : 'bought';   // GOLD-MARKET: the listing's second origin - bought in its own currency
  if (kind === 'material') {
    if (!material(key) || looseOnly(key)) return { error: 'bad-material' };   // CLOTH-GEMS: a graded gem lists from the pack, never the Stores
    if (!unitsOk(units)) return { error: 'bad-units' };
    provenance = null; wear = null;   // AUDIT 30 S9: a kind's own fields alone - another's would break the row's CHECK
  } else if (kind === 'piece') {
    if (!provenanceOk(provenance)) return { error: 'bad-provenance' };
    if (!wearOk(wear)) return { error: 'bad-wear' };
    units = 1;
    key = null;
    // AUDIT 30 L2/S8: a piece of a family the market lists - never arrows (the crafter's quiver stays whole) nor a siege
    // work; the recipe is the product row's, fixed at the craft
    const made = await db.prepare('SELECT recipe FROM products WHERE provenance = ?1').bind(provenance).first();
    if (made && !pieceListable(made.recipe)) return { error: 'market-not-listable' };
  } else return { error: 'bad-act' };
  if (units * price > MARKET_WORTH_MAX) return { error: 'bad-price' };   // AUDIT 30 L8: no balance could pay its fee or buy it
  const held = await realmHoldOf(db, me, character);   // INT3 (AUDIT INT): a held character lists nothing - its craft, its Stores
  if (held) return held;
  // INT19: a crafted piece's record proves it the acting record's own (CRAFT-HOLD's maker's hold asked where no record
  // was - retired here, as alchemy.js disenchantPiece retired it for a realm actor)
  if (await overRate(ctx, `market-post:${me}`, MARKET_POSTS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  await settle(ctx, player);
  // INT19: THE RECORD'S OWN PIECE, out of it in the listing's own batch (GUARDED: no listing, no piece out), its wear the
  // record's - never the tab's word for it
  const pieceNo = at ? await pieceListRefusal(db, me, provenance, currency) : null;
  if (pieceNo) return { error: pieceNo };
  const prep = at ? await prepareCraftedPiece(ctx, me, at, provenance, true) : null;
  if (prep?.error) return prep;
  if (prep) wear = wearOf(prep.moved);
  const fee = listingFee(units * price);
  const nonce = mintId(rand);
  const id = mintId(rand);
  const mine = 'EXISTS (SELECT 1 FROM market_listings WHERE seller = ?1 AND rid = ?5 AND n = ?6)';
  const boughtHeld = `COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?6 AND origin = '${other}'), 0)`;
  const own = hubsOf(hubs);
  const listed = 'EXISTS (SELECT 1 FROM market_listings WHERE seller = ?1 AND rid = ?2 AND n = ?3)';
  const batch = [
    ...(prep ? prep.steps : []),
    // THE DECISION: the fee held, a place among the thirty, and the goods - the units in the Stores, or the piece this
    // account's and listed nowhere
    db.prepare(`INSERT OR IGNORE INTO market_listings (id, seller, char_id, region, kind, material, provenance, units, own, bought, price, wear, fee, at, expires_at, rid, n, currency)
      SELECT ?3, ?1, ?2, ?4, ?5, ?6, ?7, ?8,
        CASE WHEN ?5 = 'material' THEN ?8 - MIN(?8, ${boughtHeld}) ELSE 1 END,
        CASE WHEN ?5 = 'material' THEN MIN(?8, ${boughtHeld}) ELSE 0 END,
        ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?17
      WHERE (?17 = 'gold' OR COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?11)   -- GOLD-MARKET: a gold listing's fee comes of its sales
        AND ${openSalesSql('?12')} < ?16   -- PROF5b: an auction is among the thirty
        -- GOLD-MARKET: its own units and those bought in its own currency - never the other's (the wall)
        AND ((?5 = 'material' AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?6 AND origin IN ('own', ?18)), 0) >= ?8)
          OR (?5 = 'piece' AND EXISTS (SELECT 1 FROM products WHERE provenance = ?7 AND owner = ?1 AND listed = 0 AND (bought_with IS NULL OR bought_with = ?17))
            AND NOT EXISTS (SELECT 1 FROM market_listings WHERE provenance = ?7 AND state = 'open')
            -- AUDIT 30 S5: not while a delivery of it waits to be collected (the pack does not hold it yet)
            AND NOT EXISTS (SELECT 1 FROM market_deliveries WHERE provenance = ?7 AND collected = 0)
            -- AUDIT 30 S6: not while it stands in a home
            AND NOT EXISTS (SELECT 1 FROM home_decor WHERE json_extract(item, '$.pv') = ?7)))
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?14 || ':fee')`)
      .bind(me, character, id, region, kind, key, provenance, units, price, wear, fee, nowS, nowS + MARKET_LISTING_S, rid, nonce, listingsMax, currency, other),
    // INT19: no listing, no piece out of the record - the record's step rolls back with it; the record the market holds
    ...(prep ? [mustChange(db), pieceEscrowStep(db, provenance, character, me, prep.moved, nowS, listed, [me, rid, nonce])] : []),
    // a material's units out of the Stores, bought first - GOLD-MARKET: a gold listing's gold's first, then its own
    ...(kind === 'material' ? (gold
      ? spendOrigins(db, { player: me, character, materialSql: '?3', qtySql: '?4', guard: mine, binds: [key, units, rid, nonce], order: ['gold', 'own'] })
      : spendStatements(db, { player: me, character, materialSql: '?3', qtySql: '?4', guard: mine, binds: [key, units, rid, nonce] })) : []),
    // a piece marked listed
    db.prepare(`UPDATE products SET listed = 1 WHERE provenance = ?2 AND EXISTS (SELECT 1 FROM market_listings WHERE seller = ?1 AND rid = ?3 AND n = ?4)`)
      .bind(me, provenance, rid, nonce),
    // SEAT1d: the board it was posted at - its Tithe's seat (SEAT0 7.2's bailiwick)
    ...(boardOf(board) ? [db.prepare('UPDATE market_listings SET board_x = ?4, board_y = ?5 WHERE seller = ?1 AND rid = ?2 AND n = ?3')
      .bind(me, rid, nonce, boardOf(board)[0], boardOf(board)[1])] : []),
    // the fee burnt - GOLD-MARKET: a Drakes listing's; a gold listing's comes of each sale
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', ?1, 'burn', NULL, 'market-fee', fee, ?2, at, ?1, id, rid || ':fee' FROM market_listings WHERE seller = ?1 AND rid = ?3 AND n = ?4 AND currency = 'marks'`)
      .bind(me, utcDay(nowS), rid, nonce),
    ...witnessStatements(db, player, nowS, [region], own, 'EXISTS (SELECT 1 FROM market_listings WHERE seller = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
  ];
  if (!prep) await db.batch(batch);
  else {
    try {
      await db.batch(batch);
      await dropObjects(bucket, [prep.prev]);
    } catch {
      await dropIfUnnamed(db, bucket, me, at.id, prep.key);   // AUDIT REALM2 S3: a batch that landed keeps its save
      const moved = await recordMovedOf(db, me, at);
      if (moved && !(moved.error === 'seq' && moved.seq === prep.seq)) return moved;
    }
  }
  const made = await db.prepare('SELECT * FROM market_listings WHERE seller = ?1 AND rid = ?2').bind(me, rid).first();
  if (made?.n === nonce) return answer(made, prep ? { realm: { seq: prep.seq } } : {});
  if (made) return answer(made, { repeat: true });
  if (await spent(db, me, rid, ':fee')) return { error: 'prof-rid' };
  if (!gold && (await balanceOf(db, me)) < fee) return { error: 'marks-short' };
  const open = await db.prepare(`SELECT ${openSalesSql('?2')} AS n`).bind(me, nowS).first();
  if (Number(open?.n ?? 0) >= listingsMax) return { error: 'market-listings-max' };
  if (kind === 'material') {
    // GOLD-MARKET: short only of units the other currency bought - the wall's own word
    const st = await storeOf(db, me, character, key);
    const mayList = st.own + (gold ? (st.gold ?? 0) : st.bought);
    if (mayList < units && st.own + st.bought + (st.gold ?? 0) >= units) return { error: gold ? 'market-drakes-goods' : 'market-gold-goods' };
    return { error: 'stores-short' };
  }
  return { error: (await pieceListRefusal(db, me, provenance, currency)) ?? 'market-listed' };
}

/** Why a crafted piece may not be listed for `currency` - the listing decision's own guards, each in its word - or null.
 *  INT19: asked before the record moves too, so a piece another act holds is said so, never "your record lacks it". */
async function pieceListRefusal(db, me, provenance, currency) {
  const p = await db.prepare('SELECT owner, listed, bought_with FROM products WHERE provenance = ?1').bind(provenance).first();
  if (!p) return 'market-no-record';   // AUDIT 31 H1: no record at all - never "another owner's"
  if (p.owner !== me) return 'market-not-yours';
  if (p.bought_with && p.bought_with !== currency) return p.bought_with === 'gold' ? 'market-gold-goods' : 'market-drakes-goods';   // GOLD-MARKET
  if (await db.prepare('SELECT 1 FROM market_deliveries WHERE provenance = ?1 AND collected = 0').bind(provenance).first() || await pieceComingBack(db, me, provenance)) return 'market-uncollected';
  if (await db.prepare("SELECT 1 FROM home_decor WHERE json_extract(item, '$.pv') = ?1").bind(provenance).first()) return 'market-standing';
  if (Number(p.listed) === 1 || await db.prepare("SELECT 1 FROM market_listings WHERE provenance = ?1 AND state = 'open'").bind(provenance).first()) return 'market-listed';
  return null;
}

/**
 * MARKET-ANY: LIST A PIECE FROM THE PACK - `{ character, region, item, pick, price, hubs?, rid, currency: 'gold', realm }`.
 * The piece is the RECORD at index `pick` of the realm record the seller's tab last checkpointed (`realm`, where it
 * stands - asked before any other word, AUDIT REALM L1-F2), which must be `item` as the wire projects it (realmTradeLaw
 * recordIsOffered - every field but the volatile ones, both ways) and which the law lets go (marketLaw goodRefusal): it
 * leaves that record in the listing's own batch (prepareRealmRecord's steps, GUARDED - no listing, no piece out of the
 * record) and rides the listing, for gold alone, 72 hours on the boards of `region`, among the thirty. No fee now: each
 * sale pays its 1% and the tax, as every gold listing's. A crafted piece whose maker's record names this account lists
 * as a crafted piece ('market-piece-route' - its record's owner then moves with its sale); one whose record names
 * another lists from the pack like any piece. Answers the listing and the record's new sequence (`realm.seq`).
 */
async function listGood(ctx, player, env, { character, region, item, pick, price, hubs, rid, currency, realm, board = null, vendor = null }) {
  const { db, bucket, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const side = await realmActFirst(db, me, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'market-gold-realm' };   // a piece from the pack is a realm record's
  const answer = (row, extra = {}) => ({ ok: true, ...extra, listing: listingView(row, me) });
  const prior = await db.prepare('SELECT * FROM market_listings WHERE seller = ?1 AND rid = ?2').bind(me, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  // HOME-VENDOR: a piece stocked at the seller's own trader - its home's region the listing's, its stall its only door.
  // ACCOUNT-HOMES (2026-10-06): a trader of a home of the seller's ACCOUNT, any character of it (homes.js; a hall's none)
  const vend = vendor == null ? null : vendorOf(vendor);
  if (vendor != null && !vend) return { error: 'bad-vendor' };
  if (vend) {
    const h = await db.prepare(`SELECT h.region FROM home_decor d JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key
      WHERE ${VENDOR_STANDS_SQL} AND h.player = ?3 AND h.guild_id IS NULL AND (h.deed = 0 OR h.char_id = ?4)`).bind(vend.map, vend.id, me, character).first();
    if (!h) return { error: 'vendor-not-yours' };
    region = Number(h.region);
  }
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!priceOk(price)) return { error: 'bad-price' };
  if (currency !== 'gold') return { error: 'market-goods-gold' };   // law 3: what a save holds never becomes Drakes
  if (!Number.isSafeInteger(pick) || pick < 0) return { error: 'bad-act' };
  if (goodRefusal(item)) return { error: 'market-not-good' };
  const count = vend ? recordCount(item) : 1;
  if (!unitsOk(count) || count * price > MARKET_WORTH_MAX) return { error: 'bad-price' };
  if (typeof item.provenance === 'string') {
    const p = await db.prepare('SELECT owner, bought_with FROM products WHERE provenance = ?1').bind(item.provenance).first();
    if (p?.owner === me) return { error: 'market-piece-route' };
    // AUDIT PROF-541 R2-S2: another's make keeps its wall from the pack too - a piece bought with Drakes (or made of goods
    // they bought, B7) never lists for gold, as the piece route's rule (listPiece's bought_with); this route lists for
    // gold alone, so a gold-bought piece passes
    if (p?.bought_with === 'marks') return { error: 'market-drakes-goods' };
  }
  if (await overRate(ctx, `market-post:${me}`, MARKET_POSTS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  await settle(ctx, player);
  // MARKET-AUDIT: a trader's stock its own count, a board listing the board's - each its own cap
  const salesSql = vend ? stallSalesSql() : openSalesSql('?2');
  const open = await db.prepare(`SELECT ${salesSql} AS n`).bind(...(vend ? [me] : [me, nowS])).first();
  const listingsMax = vend ? VENDOR_STOCK_MAX : await listingsCapAt(db, nowS, boardOf(board));   // AUDIT SEATS-3 D2: a Market Hall's town lists a piece a quarter more a tier too, as every other listing
  if (Number(open?.n ?? 0) >= listingsMax) return { error: vend ? 'vendor-full' : 'market-listings-max' };
  // THE RECORD'S OWN PIECE: the very record at `pick`, as offered, out of it - never what the tab says it holds
  let moved = null;
  const prep = await prepareRealmRecord(ctx, me, side.at, (save) => {
    if (goodRefusal(Array.isArray(save.items) ? save.items[pick] : null)) return 'market-not-good';
    if (!lawfulItem(save.items[pick])) return 'market-not-good';   // INT1: and a piece the item law can stand behind
    const out = takeTradeGoods(save, { items: [item], gold: 0 }, [pick]);
    if (!out) return 'market-good-gone';
    moved = out[0];
    return null;
  }, { outbound: true, escrow: true });   // INT3: a listing hands the piece to the market's buyers; INT4: and the ledger holds it the market's
  if (prep.error) return prep;
  const id = mintId(rand);
  const nonce = mintId(rand);
  try {
    await db.batch([
      ...prep.steps,
      // THE DECISION: a place among the thirty, the id not spent - the record's piece on the listing, for gold
      // HOME-VENDOR: a trader's piece at its stall (`vendor_map`, `vendor_id`), its thirty days, while the stall stands
      db.prepare(`INSERT OR IGNORE INTO market_listings (id, seller, char_id, region, kind, units, own, bought, price, fee, at, expires_at, rid, n, currency, item, vendor_map, vendor_id)
        SELECT ?3, ?1, ?2, ?4, 'item', 1, ?15, 0, ?5, ?6, ?7, ?8, ?9, ?10, 'gold', ?11, ?13, ?14 WHERE ${vend ? stallSalesSql() : openSalesSql('?7')} < ?12
          AND (?14 IS NULL OR EXISTS (SELECT 1 FROM home_decor d JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key
            WHERE d.map_id = ?13 AND d.id = ?14 AND d.yard = 0 AND json_extract(d.place, '$.station') = '${VENDOR_STATION}' AND h.player = ?1 AND h.guild_id IS NULL AND (h.deed = 0 OR h.char_id = ?2)))`)
        .bind(me, character, id, region, price, listingFee(price), nowS, nowS + (vend ? VENDOR_LISTING_S : MARKET_LISTING_S), rid, nonce, JSON.stringify(moved), listingsMax,
          vend?.map ?? null, vend?.id ?? null, count),
      mustChange(db),   // no listing, no piece out of the record: the record's step rolls back with it
      ...witnessStatements(db, player, nowS, [region], hubsOf(hubs), 'EXISTS (SELECT 1 FROM market_listings WHERE seller = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, me, side.at.id, prep.key);   // AUDIT REALM2 S3
    const moved2 = await recordMovedOf(db, me, side.at);
    if (moved2) return moved2;
    return { error: 'market-listings-max' };   // another listing took the last place between
  }
  await dropObjects(bucket, [prep.prev]);
  const made = await db.prepare('SELECT * FROM market_listings WHERE seller = ?1 AND rid = ?2').bind(me, rid).first();
  return answer(made, { realm: { seq: prep.seq } });
}

// ─── BUYING (10.4) ───────────────────────────────────────────────────

/**
 * BUY: `{ character, region, listing, units?, max, hubs?, rid }` - `units` of a material listing (a piece whole) at its
 * price, and the courier when the listing stands in another region than the board's; `max` the most the buyer agreed
 * to pay in all. Here, a material goes into the Stores at once and a piece is answered to the pack; elsewhere the goods
 * go by courier. The seller is paid at the sale; a piece's owner moves to the buyer in the same batch.
 */
export async function marketBuy(ctx, player, env, { character, region, listing: id, units = 1, max, hubs, rid, realm = null, board = null, vendor = null, landed = false } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  // GOLD-MARKET: a gold buy moves its buyer's record - where the record stands answered before any other word (AUDIT
  // REALM L1-F2: a lost answer asked again reads "one on" as its act, landed).
  // VENDOR-LOST (FIELD BUGS 2026-10-25), A DEPARTURE FROM L1-F2: a buy's tab needs the sale's answer (the piece, the
  // delivery), so "one on" ended its session (realmGoldAct's `needsAnswer`) and the piece bought waited uncollected. A
  // record one on from where the tab asked, under its lease, with a sale this id made, is that sale, landed: answered as
  // the repeat with the record's sequence (`oneOn`). Only to a tab that says it reads it so (`landed`) - an older tab
  // reads every repeat as a sale paid before it asked, and would checkpoint its purse unpaid over the record.
  let at = null, oneOn = null;
  if (realm != null) {
    const side = await realmActFirst(db, me, character, realm);
    if (landed === true && side.error === 'seq' && side.seq === Number(realm.seq) + 1) oneOn = side.seq;
    else if (side.error) return side;
    else if (!side.at) return { error: 'market-gold-realm' };
    else at = side.at;
  }
  const answer = async (row, extra = {}) => {
    // MARKET-SPEED: the balance and the Stores (or the delivery) asked together, never one after the other
    const [balance, store, dn] = await Promise.all([
      balanceOf(db, me),
      row.kind === 'material' ? storeOf(db, me, row.char_id, row.material) : null,
      // MARKET-ANY: a piece from a pack always comes as a delivery (here, arrived at once) - its record's collect is the
      // act that puts it into the buyer's record; the sale names it (`dn`)
      row.kind === 'item' && row.dn ? db.prepare('SELECT id, arrives_at FROM market_deliveries WHERE id = ?1 AND player = ?2').bind(row.dn, me).first() : null,
    ]);
    const out = {
      ok: true, ...extra,
      sale: {
        listing: row.listing, kind: row.kind, ...(row.material ? { material: row.material } : {}), units: Number(row.units), price: Number(row.price),
        total: Number(row.total), tax: Number(row.tax), courier: Number(row.courier), arrivesAt: Number(row.arrives_at), here: Number(row.from_region) === Number(row.to_region),
        from: Number(row.from_region),
      },
      balance,
    };
    if (row.kind === 'material') out.store = store;
    if (row.kind === 'item' && dn) out.delivery = { id: dn.id, arrivesAt: Number(dn.arrives_at) };
    if (row.kind === 'piece') {
      const d = await db.prepare(`SELECT id, arrives_at FROM market_deliveries WHERE player = ?1 AND provenance = ?2 AND why = 'bought' AND at = ?3`).bind(me, row.provenance, row.at).first();
      if (d) out.delivery = { id: d.id, arrivesAt: Number(d.arrives_at) };
      else {
        const p = await db.prepare('SELECT * FROM products WHERE provenance = ?1').bind(row.provenance).first();
        const l = await db.prepare('SELECT wear FROM market_listings WHERE id = ?1').bind(row.listing).first();
        out.piece = pieceOf(p, l?.wear ?? 1000);
      }
    }
    return out;
  };
  const prior = await db.prepare('SELECT * FROM market_sales WHERE buyer = ?1 AND rid = ?2').bind(me, rid).first();
  if (prior) return answer(prior, { repeat: true, ...(oneOn ? { realm: { seq: oneOn } } : {}) });
  if (oneOn) return { error: 'seq', seq: oneOn };   // one on, and no sale of this id: a move this tab never made
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!idOk(id)) return { error: 'bad-listing' };
  if (!Number.isSafeInteger(max) || max < 1) return { error: 'bad-price' };
  // MARKET-SPEED: the hour's acts counted and the listing read at once - the hour's refusal still the first word
  const [over, l] = await Promise.all([
    overRate(ctx, `market:${me}`, MARKET_OPS_MAX, MARKET_WINDOW_S),
    db.prepare(`SELECT l.*, ${sellerStoppedSql('l', '?2')} AS seller_stopped,
      (SELECT frozen_until FROM players WHERE id = l.seller) AS seller_frozen FROM market_listings l WHERE l.id = ?1`).bind(id, nowS).first(),
  ]);
  if (over) return { error: 'market-rate' };
  if (!l || l.state !== 'open' || Number(l.expires_at) <= nowS) return { error: 'market-gone' };
  if (Number(l.seller_frozen) > nowS) return { error: 'market-seller-frozen' };   // STAFF-PANEL5-FREEZE: a frozen account's listings sell nothing
  if (l.seller === me) return { error: 'market-own' };
  // STAFF-PANEL3-REALM: a seller held or banned sells nothing - the word every game already reads for a listing it can no
  // longer buy (a word of its own would need its text in every language the game ships)
  if (Number(l.seller_stopped)) return { error: 'market-gone' };
  // HOME-VENDOR: a trader's piece is bought at its trader alone - the buyer's word names the listing's own stall, in its
  // home's region, and the stall still stands; any other listing is no trader's
  const vend = vendor == null ? null : vendorOf(vendor);
  if (vendor != null && !vend) return { error: 'bad-vendor' };
  if (l.vendor_id != null || vend) {
    if (!vend) return { error: 'vendor-only' };
    if (l.vendor_id !== vend.id || Number(l.vendor_map) !== vend.map || Number(l.region) !== region) return { error: 'vendor-not-here' };
    const stands = await db.prepare(`SELECT 1 AS y FROM home_decor d JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key
      WHERE ${VENDOR_STANDS_SQL} AND h.player = ?3`).bind(vend.map, vend.id, l.seller).first();
    if (!stands) return { error: 'vendor-gone' };
  }
  // GOLD-MARKET: a gold listing is bought with a realm record's gold, a Drakes listing with the account's Drakes
  if ((l.currency === 'gold') !== (at != null)) return { error: at ? 'market-currency' : 'market-gold-realm' };
  const stacked = stackedListing(l);
  if (l.kind === 'piece' || (l.kind === 'item' && !stacked)) units = 1;
  else if (!unitsOk(units)) return { error: 'bad-units' };
  // INT1 (AUDIT INT): a piece listed before the item law read listings is read as it is bought - one no honest client
  // mints is sold to nobody (it waits for staff, and its buyer's trade is never held over it)
  if (l.kind === 'item' && !lawfulItem(goodOf(l.item))) return { error: 'market-not-good' };
  if (units > Number(l.own) + Number(l.bought)) return { error: 'market-short' };
  const from = Number(l.region);
  const own = hubsOf(hubs);
  // MARKET-SPEED: the road's hubs and both seats' Tithes asked at once (a gold buy, or a road with no courier, reads a
  // Tithe it does not use) - three round trips in a row before
  // SEAT1d (SEAT0 7.2): the Tithe of the seat the listing's board belongs to, from the seller's proceeds; the share of
  // the courier the buyer's board's seat takes, out of what is burnt
  const [hubsNow, tt, ctAny] = await Promise.all([
    hubsAt(db, [from, region], own),
    at ? null : titheAt(db, nowS, from, rowBoard(l)),
    at || from === region ? null : titheAt(db, nowS, region, boardOf(board)),
  ]);
  const road = courierOf(hubsNow, from, region, l.kind === 'item' ? 1 : units, courierSlow(env, nowS, region));
  if (!road) return { error: 'market-no-road' };
  if (at) return buyWithGold(ctx, player, { character, region, l, units, max, rid, road, own, at, answer, vend, landed: landed === true, stacked });
  const total = units * Number(l.price);
  // AUDIT 30 L6: the tax of the listing's running total - what it has sold before this, units x its price
  const left = Number(l.own) + Number(l.bought);
  const before = (Number(l.units) - left) * Number(l.price);   // AUDIT-SEATS L4: the Tithe of the running total too, as the tax
  const tax = saleTaxOn(before, total), tithe = tt ? saleTitheOn(before, total, tt.pct) : 0;
  const gets = total - tax - tithe;
  const ct = road.courier > 0 ? ctAny : null;
  const courierTithe = ct ? titheOf(road.courier, ct.pct) : 0;
  if (total + road.courier > max) return { error: 'market-price-moved' };
  const here = from === region;
  const delivered = l.kind === 'piece' || here ? 1 : 0;
  const nonce = mintId(rand);
  const day = utcDay(nowS);
  const sold = 'EXISTS (SELECT 1 FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3)';
  // MARKET-SPEED: the sale read back in the decision's own batch, behind its writes - a round trip less
  const decided = await readAll(db, [
    // THE DECISION: the listing open with the units, the buyer's Marks, the seller's room under the cap, and here, the
    // Stores' room for a material
    db.prepare(`INSERT OR IGNORE INTO market_sales (buyer, rid, char_id, listing, seller, kind, material, provenance, units, price, total, tax, tithe,
        courier, road, from_region, to_region, arrives_at, delivered, at, day, n)
      SELECT ?1, ?2, ?3, l.id, l.seller, l.kind, l.material, l.provenance, ?4, l.price, ?5, ?6, ?7, ?8, ?9, l.region, ?10, ?11, ?12, ?13, ?14, ?15
      FROM market_listings l WHERE l.id = ?16 AND l.state = 'open' AND l.expires_at > ?13 AND l.seller != ?1 AND l.own + l.bought >= ?4
        AND l.price * ?4 = ?5
        AND l.own + l.bought = ?20   -- the running total the tax was taken on (AUDIT 30 L6)
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid IN (?2 || ':sale', ?2 || ':tax', ?2 || ':tithe'))   -- AUDIT 30 S3; MARKET-AUDIT S1: a sale paying its seller nothing spends its id by its tax's or Tithe's line
        AND COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?5 + ?8
        AND COALESCE((SELECT balance FROM marks WHERE account = l.seller), 0) + ?17 <= ?18
        AND (?12 = 0 OR l.kind = 'piece'
          OR COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?3 AND material = l.material), 0) + ?4 <= ?19)`)
      .bind(me, rid, character, units, total, tax, tithe, road.courier, road.road, region, nowS + road.seconds, delivered, nowS, day, nonce,
        id, gets, MARKS_MAX, STORES_MAX, left),
    // the units out of the listing, bought first (the seller keeps its own for a cancel), and a listing sold out closed
    db.prepare(`UPDATE market_listings SET own = own - MAX(0, ?4 - bought), bought = MAX(0, bought - ?4),
        state = CASE WHEN own + bought = ?4 THEN 'sold' ELSE state END, closed_at = CASE WHEN own + bought = ?4 THEN ?5 ELSE closed_at END
      WHERE id = ?6 AND ${sold}`).bind(me, rid, nonce, units, nowS, id),
    // the Marks: the proceeds to the seller, the tax and the courier burnt
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', buyer, 'account', seller, 'market-sale', total - tax - tithe, day, at, buyer, listing, rid || ':sale'
      FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND total - tax - tithe > 0`).bind(me, rid, nonce),   // MARKET-AUDIT S1: a one-Mark unit its tax took whole pays its seller nothing - no line of 0 (the ledger's CHECK threw the sale, 500)
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', buyer, 'burn', NULL, 'market-tax', tax, day, at, buyer, listing, rid || ':tax'
      FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND tax > 0`).bind(me, rid, nonce),
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', buyer, 'burn', NULL, 'courier', courier - ?4, day, at, buyer, listing, rid || ':courier'
      FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND courier - ?4 > 0`).bind(me, rid, nonce, courierTithe),
    // SEAT1d: the Tithe to the listing's seat's holder, and the courier's share to the buyer's board's - or burnt
    ...(tithe > 0 ? [db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', buyer, CASE WHEN ${titheEnd('?4', 'tithe')} THEN 'guild' ELSE 'burn' END, CASE WHEN ${titheEnd('?4', 'tithe')} THEN ?4 END,
        'tithe', tithe, day, at, buyer, listing, rid || ':tithe'
      FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND tithe > 0`).bind(me, rid, nonce, tt.guild)] : []),
    ...(courierTithe > 0 ? [db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', buyer, CASE WHEN ${titheEnd('?4', '?5')} THEN 'guild' ELSE 'burn' END, CASE WHEN ${titheEnd('?4', '?5')} THEN ?4 END,
        'tithe', ?5, day, at, buyer, listing, rid || ':ctithe'
      FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3`).bind(me, rid, nonce, ct.guild, courierTithe)] : []),
    // a material here, into the Stores as bought
    db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT buyer, char_id, material, 'bought', units FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'material' AND delivered = 1
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(me, rid, nonce),
    // WOVEN-PAYS: a cloth bought with Drakes, counted bought with silver - here, or as its courier's load lands
    silverClothIn(db, "SELECT buyer AS player, char_id, material, units AS qty FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'material' AND delivered = 1", [me, rid, nonce]),
    // a piece's owner moved, and by courier its delivery written
    db.prepare(`UPDATE products SET owner = ?1, credited = 0, listed = 0, bought_with = 'marks' WHERE provenance = (SELECT provenance FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'piece')`)
      .bind(me, rid, nonce),   // GOLD-MARKET: bought with Drakes - it lists for Drakes alone
    db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, provenance, wear, why, from_region, arrives_at, at)
      SELECT ?4, s.buyer, s.char_id, s.provenance, l.wear, 'bought', s.from_region, s.arrives_at, s.at
      FROM market_sales s JOIN market_listings l ON l.id = s.listing
      WHERE s.buyer = ?1 AND s.rid = ?2 AND s.n = ?3 AND s.kind = 'piece' AND s.from_region != s.to_region`).bind(me, rid, nonce, mintId(rand)),
    ...pieceSoldSteps(db, "SELECT provenance FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'piece'", [me, rid, nonce]),   // INT19
    // the price table (10.2's History) - a material's sale
    db.prepare(`INSERT INTO market_prices (day, material, price, units)
      SELECT day, material, price, units FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'material'
      ON CONFLICT (day, material, price) DO UPDATE SET units = market_prices.units + excluded.units`).bind(me, rid, nonce),
    ...witnessStatements(db, player, nowS, [from, region], own, 'EXISTS (SELECT 1 FROM market_sales WHERE buyer = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
    // TOWN-ECON TE2: a trader's sale counted at its town, the buyer's act - by this sale's row alone
    ...tradeActStatements(db, player, nowS, vend?.map ?? null, 'EXISTS (SELECT 1 FROM market_sales WHERE buyer = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
    db.prepare('SELECT * FROM market_sales WHERE buyer = ?1 AND rid = ?2').bind(me, rid),
  ]);
  const made = decided[decided.length - 1][0] ?? null;
  if (made?.n === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  if (await spent(db, me, rid, ':sale')) return { error: 'prof-rid' };
  const now = await db.prepare('SELECT * FROM market_listings WHERE id = ?1').bind(id).first();
  if (!now || now.state !== 'open') return { error: 'market-gone' };
  if (Number(now.own) + Number(now.bought) < units) return { error: 'market-short' };
  if (Number(now.own) + Number(now.bought) !== left) return { error: 'market-price-moved' };   // another sold between: its tax moved
  if ((await balanceOf(db, me)) < total + road.courier) return { error: 'marks-short' };
  if ((await balanceOf(db, l.seller)) + gets > MARKS_MAX) return { error: 'market-seller-full' };
  return { error: 'stores-full' };
}

/**
 * GOLD-MARKET: A GOLD BUY - `units` of a gold listing paid off the buyer's realm record (purse, letters, then `region`'s
 * account - realmGoldLaw payFromSave), the courier's a Mark's worth of gold a Mark (MARK_WORTH_GOLD); `max` its exact cost
 * (the price and the courier), which the buyer's tab has taken out of its purse as it asks. One batch: the
 * record moved (prepareRealmRecord's steps), the sale decided - the listing open with the units, the seller's held gold
 * with room, here the Stores' room - and GUARDED (mustChange: a sale not written rolls the record back), the listing
 * drawn down, the seller's share held for it (market_gold), the goods the buyer's: a material into the Stores as
 * gold's, a piece's owner moved and marked bought with gold. The tax and the fee, and the courier, are burnt: gold no
 * row holds. Answers the sale and the record's new sequence (`realm.seq`).
 */
async function buyWithGold(ctx, player, { character, region, l, units, max, rid, road, own, at, answer, vend = null, landed = false, stacked = false }) {
  const { db, bucket, nowS, rand } = ctx;
  const me = player.id;
  const courier = road.courier * MARK_WORTH_GOLD;
  const total = units * Number(l.price);
  const left = Number(l.own) + Number(l.bought);
  const soldBefore = l.kind === 'item'
    ? Number((await db.prepare('SELECT COALESCE(SUM(total), 0) AS t FROM market_sales WHERE listing = ?1').bind(l.id).first())?.t ?? 0)
    : (Number(l.units) - left) * Number(l.price);
  const { tax, fee, tithe, gets } = goldSaleOf(soldBefore, total);
  // the exact cost the buyer's tab took out of its purse as it asked - never less, or the purse and the record part
  if (total + courier !== max) return { error: 'market-price-moved' };
  const from = Number(l.region);
  const here = from === region;
  const delivered = l.kind === 'piece' || l.kind === 'item' || here ? 1 : 0;   // MARKET-ANY: a pack's piece's delivery written at once
  const prep = await prepareRealmRecord(ctx, me, at, (save) => (payFromSave(save, total + courier, region) ? null : 'realm-gold'), { outbound: true });   // INT3: a purchase pays the seller
  if (prep.error) return prep;
  const nonce = mintId(rand);
  const day = utcDay(nowS);
  const sold = 'EXISTS (SELECT 1 FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3)';
  try {
    await db.batch([
      ...prep.steps,
      // THE DECISION: the gold listing open with the units at the running total the tax was taken on, the seller's held
      // gold with room, and here the Stores' room
      db.prepare(`INSERT OR IGNORE INTO market_sales (buyer, rid, char_id, listing, seller, kind, material, provenance, units, price, total, tax, tithe,
          courier, road, from_region, to_region, arrives_at, delivered, at, day, n, currency, fee, dn)
        SELECT ?1, ?2, ?3, l.id, l.seller, l.kind, l.material, l.provenance, ?4, l.price, ?5, ?6, ?7, ?8, ?9, l.region, ?10, ?11, ?12, ?13, ?14, ?15, 'gold', ?21,
          CASE WHEN l.kind = 'item' THEN ?22 END   -- MARKET-ANY: the delivery a pack's piece comes by
        FROM market_listings l WHERE l.id = ?16 AND l.state = 'open' AND l.currency = 'gold' AND l.expires_at > ?13 AND l.seller != ?1 AND l.own + l.bought >= ?4
          AND l.price * ?4 = ?5
          AND l.own + l.bought = ?20
          AND COALESCE((SELECT gold FROM market_gold WHERE player = l.seller AND char_id = l.char_id), 0) + ?17 <= ?18
          AND (?12 = 0 OR l.kind IN ('piece', 'item')
            OR COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?3 AND material = l.material), 0) + ?4 <= ?19)`)
        .bind(me, rid, character, units, total, tax, tithe, courier, road.road, region, nowS + road.seconds, delivered, nowS, day, nonce,
          l.id, gets, MARKET_GOLD_HELD_MAX, STORES_MAX, left, fee, mintId(rand)),
      mustChange(db),   // no sale, no gold moved: the record's step rolls back with it
      db.prepare(`UPDATE market_listings SET own = own - MAX(0, ?4 - bought), bought = MAX(0, bought - ?4),
          state = CASE WHEN own + bought = ?4 THEN 'sold' ELSE state END, closed_at = CASE WHEN own + bought = ?4 THEN ?5 ELSE closed_at END
        WHERE id = ?6 AND ${sold}`).bind(me, rid, nonce, units, nowS, l.id),
      // the seller's share, held for its character until its own record collects it
      db.prepare(`INSERT INTO market_gold (player, char_id, gold)
        SELECT seller, (SELECT char_id FROM market_listings WHERE id = listing), MAX(0, total - tax - tithe - fee) FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3
        ON CONFLICT (player, char_id) DO UPDATE SET gold = market_gold.gold + excluded.gold`).bind(me, rid, nonce),   // MARKET-AUDIT S3: goldSaleOf's floor - a 1-gold unit's tax and fee past it broke the CHECK, said `stores-full`
      // a material here, into the Stores as gold's (the wall)
      db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
        SELECT buyer, char_id, material, 'gold', units FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'material' AND delivered = 1
        ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(me, rid, nonce),
      // a piece's owner moved, marked bought with gold (it lists for gold alone), and by courier its delivery written -
      // FB1020h ESSENCE-LOOSE: walled by this purchase now, never by its maker's goods (products.loose): its Essence gold's
      db.prepare(`UPDATE products SET owner = ?1, credited = 0, listed = 0, bought_with = 'gold', loose = 0 WHERE provenance = (SELECT provenance FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'piece')`)
        .bind(me, rid, nonce),
      db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, provenance, wear, why, from_region, arrives_at, at)
        SELECT ?4, s.buyer, s.char_id, s.provenance, l.wear, 'bought', s.from_region, s.arrives_at, s.at
        FROM market_sales s JOIN market_listings l ON l.id = s.listing
        WHERE s.buyer = ?1 AND s.rid = ?2 AND s.n = ?3 AND s.kind = 'piece' AND s.from_region != s.to_region`).bind(me, rid, nonce, mintId(rand)),
      ...pieceSoldSteps(db, "SELECT provenance FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'piece'", [me, rid, nonce]),   // INT19
      // MARKET-ANY: a piece from a pack on its way - here arrived at once, else after the courier's time - its record the
      // listing's, collected into the buyer's realm record by its own act (collectGood)
      db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, item, why, from_region, arrives_at, at)
        SELECT s.dn, s.buyer, s.char_id, CASE WHEN ?4 = 1 THEN json_set(l.item, '$.stackCount', s.units) ELSE l.item END, 'bought', s.from_region, s.arrives_at, s.at
        FROM market_sales s JOIN market_listings l ON l.id = s.listing
        WHERE s.buyer = ?1 AND s.rid = ?2 AND s.n = ?3 AND s.kind = 'item'`).bind(me, rid, nonce, stacked ? 1 : 0),
      db.prepare(`UPDATE market_listings SET item = json_set(item, '$.stackCount', own + bought)
        WHERE id = ?4 AND state = 'open' AND own + bought > 0 AND ?5 = 1 AND EXISTS (SELECT 1 FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3)`).bind(me, rid, nonce, l.id, stacked ? 1 : 0),
      // gold's own price table
      db.prepare(`INSERT INTO market_gold_prices (day, material, price, units)
        SELECT day, material, price, units FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'material'
        ON CONFLICT (day, material, price) DO UPDATE SET units = market_gold_prices.units + excluded.units`).bind(me, rid, nonce),
      ...witnessStatements(db, player, nowS, [from, region], own, 'EXISTS (SELECT 1 FROM market_sales WHERE buyer = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
      ...tradeActStatements(db, player, nowS, vend?.map ?? null, 'EXISTS (SELECT 1 FROM market_sales WHERE buyer = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),   // TOWN-ECON TE2
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, me, at.id, prep.key);   // AUDIT REALM2 S3
    const moved = await recordMovedOf(db, me, at);
    // VENDOR-LOST: the first asking's batch landed while this one ran (its answer given up on, and asked again) - that sale
    const first = landed && moved?.error === 'seq' && moved.seq === at.seq + 1
      ? await db.prepare('SELECT * FROM market_sales WHERE buyer = ?1 AND rid = ?2').bind(me, rid).first() : null;
    if (first) return answer(first, { repeat: true, realm: { seq: moved.seq } });
    if (moved) return moved;
    const now = await db.prepare('SELECT * FROM market_listings WHERE id = ?1').bind(l.id).first();
    if (!now || now.state !== 'open') return { error: 'market-gone' };
    if (Number(now.own) + Number(now.bought) < units) return { error: 'market-short' };
    if (Number(now.own) + Number(now.bought) !== left) return { error: 'market-price-moved' };
    const held = await db.prepare('SELECT gold FROM market_gold WHERE player = ?1 AND char_id = ?2').bind(l.seller, l.char_id).first();
    if (Number(held?.gold ?? 0) + gets > MARKET_GOLD_HELD_MAX) return { error: 'market-gold-full' };
    return { error: 'stores-full' };
  }
  await dropObjects(bucket, [prep.prev]);
  const made = await db.prepare('SELECT * FROM market_sales WHERE buyer = ?1 AND rid = ?2').bind(me, rid).first();
  return answer(made, { realm: { seq: prep.seq } });
}

// ─── CANCEL (10.2: "a cancelled listing returns its goods, the fee kept") ─

/** CANCEL: `{ character, listing, rid }` - this account's open listing closed; a material's units back to the listing
 *  character's Stores (refused while they would not fit), a piece answered back to the pack. */
export async function marketCancel(ctx, player, env, { character, listing: id, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const answer = async (row, extra = {}) => {
    const out = { ok: true, ...extra, listing: listingView(row, me), balance: await balanceOf(db, me) };
    if (row.kind === 'material') out.store = await storeOf(db, me, row.char_id, row.material);
    else if (row.kind === 'item') out.delivery = { id: row.id };   // MARKET-ANY: back by a delivery its record collects
    else if (await pieceCameBack(db, row.id)) out.delivery = { id: row.id };   // INT19: a crafted piece's record, likewise
    else out.piece = pieceOf(await db.prepare('SELECT * FROM products WHERE provenance = ?1').bind(row.provenance).first(), row.wear);
    return out;
  };
  const prior = await db.prepare('SELECT * FROM market_listings WHERE seller = ?1 AND cancel_rid = ?2').bind(me, rid).first();
  if (prior) return answer(prior, { repeat: true });
  // PROF5b: an auction's cancel, answered again the same
  const priorAuction = await db.prepare('SELECT * FROM market_auctions WHERE seller = ?1 AND cancel_rid = ?2').bind(me, rid).first();
  if (priorAuction) return auctionCancelled(db, me, priorAuction, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!idOk(id)) return { error: 'bad-listing' };
  if (await overRate(ctx, `market:${me}`, MARKET_OPS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  const l = await db.prepare('SELECT * FROM market_listings WHERE id = ?1 AND seller = ?2').bind(id, me).first();
  if (!l && (await db.prepare('SELECT 1 FROM market_auctions WHERE id = ?1 AND seller = ?2').bind(id, me).first())) return auctionCancel(ctx, player, id, rid);
  if (!l || l.state !== 'open') return { error: 'market-gone' };
  const nonce = mintId(rand);
  await db.batch([
    db.prepare(`UPDATE market_listings SET state = 'cancelled', closed_at = ?3, returned = 1, cancel_rid = ?4, rn = ?5
      WHERE id = ?1 AND seller = ?2 AND state = 'open' AND (kind IN ('piece', 'item')
        OR COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?2 AND char_id = market_listings.char_id AND material = market_listings.material), 0)
          + own + bought <= ?6)`).bind(id, me, nowS, rid, nonce, STORES_MAX),
    ...backToStores(db, id, nonce),
    db.prepare(`UPDATE products SET listed = 0 WHERE provenance = (SELECT provenance FROM market_listings WHERE id = ?1 AND rn = ?2)`).bind(id, nonce),
    // MARKET-ANY: a piece from a pack back to the character that listed it - a delivery arrived at once, which its record
    // collects (collectGood): the cancel moves no record, so it asks none
    db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, item, why, from_region, arrives_at, at)
      SELECT id, seller, char_id, item, 'returned', region, ?2, ?2 FROM market_listings WHERE id = ?1 AND rn = ?3 AND kind = 'item'`).bind(id, nowS, nonce),
    // INT19: a crafted piece the market holds the record of, back the same way - its record into its seller's
    ...pieceBackSteps(db, id, nowS, "SELECT provenance, seller, char_id, region FROM market_listings WHERE id = ?1 AND rn = ?2 AND kind = 'piece'", [id, nonce]),
  ]);
  const made = await db.prepare('SELECT * FROM market_listings WHERE seller = ?1 AND cancel_rid = ?2').bind(me, rid).first();
  if (made?.rn === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  const now = await db.prepare('SELECT state FROM market_listings WHERE id = ?1').bind(id).first();
  return { error: now?.state === 'open' ? 'stores-full' : 'market-gone' };
}

// ─── BUY ORDERS (10.3) ───────────────────────────────────────────────

/** ORDER: `{ character, region, material, units, price, hubs?, rid }` - a standing order at the board's region for 7
 *  days, its Marks (units x price) escrowed at once - a line to the ledger's `escrow` end, the order's id. */
export async function marketOrder(ctx, player, env, { character, region, material: key, units, price, hubs, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const answer = async (row, extra = {}) => ({ ok: true, ...extra, order: orderView(row, me), balance: await balanceOf(db, me) });
  const prior = await db.prepare('SELECT * FROM market_orders WHERE poster = ?1 AND rid = ?2').bind(me, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!material(key) || looseOnly(key)) return { error: 'bad-material' };   // CLOTH-GEMS: a graded gem is the loose door's, no order's
  if (UNYIELDED.includes(key)) return { error: 'market-unyielded' };   // AUDIT 30 L7: nobody could fill it
  if (!unitsOk(units)) return { error: 'bad-units' };
  if (!priceOk(price) || units * price > MARKET_WORTH_MAX) return { error: 'bad-price' };
  if (await overRate(ctx, `market-post:${me}`, MARKET_POSTS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  await settle(ctx, player);
  const cost = units * price;
  const nonce = mintId(rand);
  const id = mintId(rand);
  const own = hubsOf(hubs);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO market_orders (id, poster, char_id, region, material, units, left_units, price, escrow, at, expires_at, rid, n)
      SELECT ?3, ?1, ?2, ?4, ?5, ?6, ?6, ?7, ?8, ?9, ?10, ?11, ?12
      WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?8
        AND (SELECT COUNT(*) FROM market_orders WHERE poster = ?1 AND state = 'open') < ?13
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?11 || ':escrow')`)
      .bind(me, character, id, region, key, units, price, cost, nowS, nowS + MARKET_ORDER_S, rid, nonce, MARKET_ORDERS_MAX),
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', poster, 'escrow', id, 'order-escrow', escrow, ?4, at, poster, material, rid || ':escrow'
      FROM market_orders WHERE poster = ?1 AND rid = ?2 AND n = ?3`).bind(me, rid, nonce, utcDay(nowS)),
    ...witnessStatements(db, player, nowS, [region], own, 'EXISTS (SELECT 1 FROM market_orders WHERE poster = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
  ]);
  const made = await db.prepare('SELECT * FROM market_orders WHERE poster = ?1 AND rid = ?2').bind(me, rid).first();
  if (made?.n === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  if (await spent(db, me, rid, ':escrow')) return { error: 'prof-rid' };
  return { error: (await balanceOf(db, me)) < cost ? 'marks-short' : 'market-orders-max' };
}

/**
 * FILL: `{ character, region, order, units, hubs?, rid, least?, board? }` - `units` of an open order of any board from
 * this character's Stores (bought first); the pay out of the escrow less the tax and, GLOBAL-MARKET, the courier when the
 * order stands in another region than this board's (by the load, as a buy's - the filler's not going, burnt, its Tithe
 * share to this board's seat); the units to the orderer's Stores at once as bought (refused past their room). `least` the
 * least pay the filler agreed to - a courier or a tax moved past it is `market-price-moved`.
 */
export async function marketFill(ctx, player, env, { character, region, order: id, units, hubs, rid, least = null, board = null } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const answer = async (row, extra = {}) => ({
    ok: true, ...extra, fill: { order: row.order_id, material: row.material, units: Number(row.units), price: Number(row.price), pay: Number(row.pay), tax: Number(row.tax),
      courier: Number(row.units) * Number(row.price) - Number(row.pay) - Number(row.tax) },   // GLOBAL-MARKET: what the road took of it
    store: await storeOf(db, me, row.char_id, row.material), balance: await balanceOf(db, me),
  });
  const prior = await db.prepare('SELECT * FROM market_fills WHERE filler = ?1 AND rid = ?2').bind(me, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!idOk(id)) return { error: 'bad-order' };
  if (!unitsOk(units)) return { error: 'bad-units' };
  const frozen = await realmHoldOf(db, me, character);   // INT3 (AUDIT INT): a held character fills no order from its Stores
  if (frozen) return frozen;
  if (await overRate(ctx, `market:${me}`, MARKET_OPS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  const o = await db.prepare('SELECT * FROM market_orders WHERE id = ?1').bind(id).first();
  if (!o || o.state !== 'open' || Number(o.expires_at) <= nowS) return { error: 'market-gone' };
  if (o.poster === me) return { error: 'market-own' };
  if (units > Number(o.left_units)) return { error: 'market-short' };
  const total = units * Number(o.price);
  const own = hubsOf(hubs);
  // GLOBAL-MARKET: an order of another region filled from here - the courier carries the units to it, out of the pay
  const to = Number(o.region);
  const road = courierOf(await hubsAt(db, [region, to], own), region, to, units);
  if (!road) return { error: 'market-no-road' };
  // AUDIT 30 L6: the tax of the order's running total - what it has bought before this fill; MARKET-AUDIT S2: its last units
  // here pay at least a Mark (marketLaw fillTaxOn), and any other fill the tax or the courier would leave paying nothing
  // is refused, said why
  const tax = fillTaxOn((Number(o.units) - Number(o.left_units)) * Number(o.price), total, road.courier === 0 && units === Number(o.left_units));
  const pay = total - tax - road.courier;
  if (pay < 1) return { error: road.courier > 0 ? 'market-courier-dear' : 'market-taxed-out' };
  if (Number.isSafeInteger(least) && pay < least) return { error: 'market-price-moved' };
  const ct = road.courier > 0 ? await titheAt(db, nowS, region, boardOf(board)) : null;
  const fillTithe = ct ? titheOf(road.courier, ct.pct) : 0;   // the buy's courier share (SEAT1d), the filler's board's
  const nonce = mintId(rand);
  const day = utcDay(nowS);
  const filled = 'EXISTS (SELECT 1 FROM market_fills WHERE filler = ?1 AND rid = ?5 AND n = ?6)';
  await db.batch([
    // THE DECISION: the order open with the units and their escrow, the filler's units, the orderer's room, the filler's
    // room under the Marks cap
    db.prepare(`INSERT OR IGNORE INTO market_fills (filler, rid, char_id, order_id, poster, material, units, price, pay, tax, at, day, n)
      SELECT ?1, ?2, ?3, o.id, o.poster, o.material, ?4, o.price, ?5, ?6, ?7, ?8, ?9 FROM market_orders o
      WHERE o.id = ?10 AND o.state = 'open' AND o.expires_at > ?7 AND o.poster != ?1 AND o.region = ?11 AND o.left_units >= ?4
        AND o.escrow >= o.price * ?4 AND o.price * ?4 = ?5 + ?6 + ?15
        AND o.left_units = ?14   -- the running total the tax was taken on (AUDIT 30 L6)
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?2 || ':fill')   -- AUDIT 30 S3
        AND ${spendableSql('?1', '?3', 'o.material')} >= ?4   -- GOLD-MARKET: a Drakes order is never filled with gold's units
        AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = o.poster AND char_id = o.char_id AND material = o.material), 0) + ?4 <= ?12
        AND COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) + ?5 <= ?13`)
      .bind(me, rid, character, units, pay, tax, nowS, day, nonce, id, to, STORES_MAX, MARKS_MAX, Number(o.left_units), road.courier),
    // the order drawn down, a filled one closed
    db.prepare(`UPDATE market_orders SET left_units = left_units - ?3, escrow = escrow - price * ?3,
        state = CASE WHEN left_units = ?3 THEN 'filled' ELSE state END, closed_at = CASE WHEN left_units = ?3 THEN ?4 ELSE closed_at END
      WHERE id = ?2 AND EXISTS (SELECT 1 FROM market_fills WHERE filler = ?1 AND rid = ?5 AND n = ?6)`).bind(me, id, units, nowS, rid, nonce),
    // the filler's units out, bought first; the orderer's in, bought
    ...spendStatements(db, { player: me, character, materialSql: '?3', qtySql: '?4', guard: filled, binds: [o.material, units, rid, nonce] }),
    db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT poster, ?4, material, 'bought', units FROM market_fills WHERE filler = ?1 AND rid = ?2 AND n = ?3
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(me, rid, nonce, o.char_id),
    // WOVEN-PAYS: the orderer's cloth, bought with Drakes, counted bought with silver
    silverClothIn(db, 'SELECT poster AS player, ?4 AS char_id, material, units AS qty FROM market_fills WHERE filler = ?1 AND rid = ?2 AND n = ?3', [me, rid, nonce, o.char_id]),
    // the Marks: the pay out of the escrow, the tax burnt from it
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'escrow', order_id, 'account', filler, 'order-fill', pay, day, at, filler, material, rid || ':fill'
      FROM market_fills WHERE filler = ?1 AND rid = ?2 AND n = ?3`).bind(me, rid, nonce),
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'escrow', order_id, 'burn', NULL, 'market-tax', tax, day, at, filler, material, rid || ':filltax'
      FROM market_fills WHERE filler = ?1 AND rid = ?2 AND n = ?3 AND tax > 0`).bind(me, rid, nonce),
    // GLOBAL-MARKET: the courier out of the escrow, burnt - its Tithe share to this board's seat's holder, or burnt
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'escrow', order_id, 'burn', NULL, 'courier', ?4, day, at, filler, material, rid || ':fillcourier'
      FROM market_fills WHERE filler = ?1 AND rid = ?2 AND n = ?3 AND ?4 > 0`).bind(me, rid, nonce, road.courier - fillTithe),
    ...(fillTithe > 0 ? [db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'escrow', order_id, CASE WHEN ${titheEnd('?4', '?5')} THEN 'guild' ELSE 'burn' END, CASE WHEN ${titheEnd('?4', '?5')} THEN ?4 END,
        'tithe', ?5, day, at, filler, material, rid || ':fillctithe'
      FROM market_fills WHERE filler = ?1 AND rid = ?2 AND n = ?3`).bind(me, rid, nonce, ct.guild, fillTithe)] : []),
    db.prepare(`INSERT INTO market_prices (day, material, price, units)
      SELECT day, material, price, units FROM market_fills WHERE filler = ?1 AND rid = ?2 AND n = ?3
      ON CONFLICT (day, material, price) DO UPDATE SET units = market_prices.units + excluded.units`).bind(me, rid, nonce),
    ...witnessStatements(db, player, nowS, [region, to], own, 'EXISTS (SELECT 1 FROM market_fills WHERE filler = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
  ]);
  const made = await db.prepare('SELECT * FROM market_fills WHERE filler = ?1 AND rid = ?2').bind(me, rid).first();
  if (made?.n === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  if (await spent(db, me, rid, ':fill')) return { error: 'prof-rid' };
  const now = await db.prepare('SELECT * FROM market_orders WHERE id = ?1').bind(id).first();
  if (!now || now.state !== 'open') return { error: 'market-gone' };
  if (Number(now.left_units) < units) return { error: 'market-short' };
  if (Number(now.left_units) !== Number(o.left_units)) return { error: 'market-price-moved' };   // another filled between
  const held = await storeOf(db, me, character, o.material);
  if (held.own + held.bought < units) return { error: held.own + held.bought + (held.gold ?? 0) >= units ? 'market-gold-goods' : 'stores-short' };   // GOLD-MARKET
  if ((await balanceOf(db, me)) + pay > MARKS_MAX) return { error: 'marks-full' };
  return { error: 'market-order-full' };
}

/** UNORDER: `{ order, rid }` - this account's open order closed, what is left of its escrow back (under the cap; else
 *  on a later read). Asked again, a closed order of this account's answers as done. */
export async function marketUnorder(ctx, player, env, { order: id, rid } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { rid, needChar: false });
  if (refused) return refused;
  const me = player.id;
  if (!idOk(id)) return { error: 'bad-order' };
  const o = await db.prepare('SELECT * FROM market_orders WHERE id = ?1 AND poster = ?2').bind(id, me).first();
  if (!o) return { error: 'market-gone' };
  if (o.state === 'cancelled') return { ok: true, repeat: true, order: orderView(o, me), balance: await balanceOf(db, me) };
  const closed = shut(player, env);
  if (closed) return closed;
  if (o.state !== 'open') return { error: 'market-gone' };
  if (await overRate(ctx, `market:${me}`, MARKET_OPS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  await db.batch([
    db.prepare(`UPDATE market_orders SET state = 'cancelled', closed_at = ?3 WHERE id = ?1 AND poster = ?2 AND state = 'open'`).bind(id, me, nowS),
    ...orderReturn(db, id, nowS),
  ]);
  const now = await db.prepare('SELECT * FROM market_orders WHERE id = ?1').bind(id).first();
  if (now?.state !== 'cancelled') return { error: 'market-gone' };
  return { ok: true, order: orderView(now, me), balance: await balanceOf(db, me) };
}

// ─── COLLECT (a piece arrived, or come back) ─────────────────────────

/** COLLECT: `{ character, delivery, rid }` - a piece whose courier has arrived, or whose listing expired or was
 *  removed, answered to this character's pack once; asked again with the same id, answered again. */
export async function marketCollect(ctx, player, env, { character, delivery: id, rid, realm = null, landed = false } = {}) {
  // MARKET-ANY: a piece from a pack goes into the collecting character's realm record - its own door, the record first
  if (realm != null) return collectGood(ctx, player, env, { character, delivery: id, rid, realm, landed: landed === true });
  const { db, nowS } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const answer = async (d, extra = {}) => ({
    ok: true, ...extra, delivery: { id: d.id, why: d.why },
    piece: pieceOf(await db.prepare('SELECT * FROM products WHERE provenance = ?1').bind(d.provenance).first(), d.wear),
  });
  const prior = await db.prepare('SELECT * FROM market_deliveries WHERE player = ?1 AND rid = ?2').bind(me, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!idOk(id)) return { error: 'bad-delivery' };
  if (await overRate(ctx, `market:${me}`, MARKET_OPS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  const d = await db.prepare('SELECT * FROM market_deliveries WHERE id = ?1 AND player = ?2').bind(id, me).first();
  if (!d || Number(d.collected) === 1) return { error: 'market-gone' };
  if (d.char_id !== character) return { error: 'market-other-character' };
  if (Number(d.arrives_at) > nowS) return { error: 'market-on-road' };
  if (d.item != null) return { error: 'realm-needed' };   // MARKET-ANY: a pack's piece goes into a record, never minted
  // AUDIT 30 S5: only a piece still this account's - never one id handed out twice
  await db.prepare(`UPDATE market_deliveries SET collected = 1, rid = ?3 WHERE id = ?1 AND player = ?2 AND char_id = ?4 AND collected = 0 AND arrives_at <= ?5
      AND EXISTS (SELECT 1 FROM products WHERE provenance = market_deliveries.provenance AND owner = ?2)`)
    .bind(id, me, rid, character, nowS).run();
  const made = await db.prepare('SELECT * FROM market_deliveries WHERE player = ?1 AND rid = ?2').bind(me, rid).first();
  return made ? answer(made) : { error: 'market-gone' };
}

/**
 * MARKET-ANY: COLLECT A PIECE FROM A PACK - `{ character, delivery, rid, realm }`: one bought, or come back to its seller
 * (cancelled, expired, removed), whose courier has arrived - its record put into this character's realm record (`realm`,
 * where it stands, asked before any other word) in the collect's own batch, the delivery marked collected and GUARDED
 * (mustChange: a delivery another collect took first rolls the record back). Answers the piece's record and the record's
 * new sequence (`realm.seq`); asked again with the same id, the delivery again.
 * RPT1026-MARKET COLLECT-LANDED (private reports 2026-10-26: legendaries went missing as they came off the market, their
 * returns collected seven minutes before the report), VENDOR-LOST's departure from AUDIT REALM L1-F2 for a collect too: a
 * collect's tab needs its answer (the piece is the answer), so "one on" ended its session (realmGoldAct's `needsAnswer`)
 * with the piece in the record and none in the pack. A record one on from where the tab asked, under its lease, with a
 * delivery this id collected, is that collect, landed: answered as the repeat with the record's sequence (`oneOn`), and
 * the tab takes the piece into the pack it never reached. Only to a tab that says it reads it so (`landed`) - an older
 * tab abandons its session on any repeat, so the record holds the piece at its join as it always did.
 */
async function collectGood(ctx, player, env, { character, delivery: id, rid, realm, landed = false }) {
  const { db, bucket, nowS } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const side = await realmActFirst(db, me, character, realm);
  const oneOn = landed && side.error === 'seq' && side.seq === Number(realm?.seq) + 1 ? side.seq : null;
  if (side.error && !oneOn) return side;
  if (!oneOn && !side.at) return { error: 'market-gold-realm' };
  const answer = (d, extra = {}) => ({ ok: true, ...extra, delivery: { id: d.id, why: d.why }, item: goodOf(d.item) });
  const prior = await db.prepare('SELECT * FROM market_deliveries WHERE player = ?1 AND rid = ?2').bind(me, rid).first();
  if (prior) return answer(prior, { repeat: true, ...(oneOn ? { realm: { seq: oneOn } } : {}) });
  if (oneOn) return { error: 'seq', seq: oneOn };   // one on, and no collect of this id: a move this tab never made
  const closed = shut(player, env);
  if (closed) return closed;
  if (!idOk(id)) return { error: 'bad-delivery' };
  if (await overRate(ctx, `market:${me}`, MARKET_OPS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  const d = await db.prepare('SELECT * FROM market_deliveries WHERE id = ?1 AND player = ?2').bind(id, me).first();
  if (!d || Number(d.collected) === 1) return { error: 'market-gone' };
  if (d.char_id !== character) return { error: 'market-other-character' };
  if (Number(d.arrives_at) > nowS) return { error: 'market-on-road' };
  const item = goodOf(d.item);
  if (!item) return { error: 'bad-delivery' };   // a crafted piece's delivery is minted at the pack, no record moved
  const prep = await prepareRealmRecord(ctx, me, side.at, (save) => { giveTradeGoods(save, [item], 0); return null; });
  if (prep.error) return prep;
  try {
    await db.batch([
      ...prep.steps,
      db.prepare(`UPDATE market_deliveries SET collected = 1, rid = ?3 WHERE id = ?1 AND player = ?2 AND char_id = ?4 AND collected = 0 AND arrives_at <= ?5
        AND item IS NOT NULL`).bind(id, me, rid, character, nowS),
      mustChange(db),   // no delivery collected, no piece into the record
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, me, side.at.id, prep.key);   // AUDIT REALM2 S3
    const moved = await recordMovedOf(db, me, side.at);
    // RPT1026-MARKET COLLECT-LANDED: the first asking's batch landed while this one ran (its answer given up on, and asked
    // again) - that collect, as VENDOR-LOST answers a buy's
    const first = landed && moved?.error === 'seq' && moved.seq === side.at.seq + 1
      ? await db.prepare('SELECT * FROM market_deliveries WHERE player = ?1 AND rid = ?2').bind(me, rid).first() : null;
    if (first) return answer(first, { repeat: true, realm: { seq: moved.seq } });
    if (moved) return moved;
    return { error: 'market-gone' };   // another collect took it first
  }
  await dropObjects(bucket, [prep.prev]);
  const made = await db.prepare('SELECT * FROM market_deliveries WHERE player = ?1 AND rid = ?2').bind(me, rid).first();
  return answer(made, { realm: { seq: prep.seq } });
}

/**
 * GOLD-MARKET: COLLECT GOLD - `{ character, realm, region }`: every gold this character's sales hold for it, into its
 * realm record's account at `region` (the board's - realmGoldLaw creditSave `bank`; the purse where the record keeps no
 * account there). One batch: the record moved (its steps) and the held gold emptied, GUARDED (mustChange) - both or
 * neither. Answers what it collected and the record's new sequence. Nothing to collect is refused before the record
 * moves.
 */
export async function marketGoldCollect(ctx, player, env, { character, realm = null, region } = {}) {
  const { db, bucket } = ctx;
  const refused = asks(player, { character, needRid: false });
  if (refused) return refused;
  const me = player.id;
  const side = await realmActFirst(db, me, character, realm);   // AUDIT REALM L1-F2: where the record stands, first
  if (side.error) return side;
  if (!side.at) return { error: 'market-gold-realm' };
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  const row = await db.prepare('SELECT gold FROM market_gold WHERE player = ?1 AND char_id = ?2').bind(me, character).first();
  const gold = Number(row?.gold ?? 0);
  if (gold < 1) return { error: 'market-gold-none' };
  const prep = await prepareRealmRecord(ctx, me, side.at, (save) => (creditSave(save, gold, { bank: region }) ? null : 'bad-gold'));
  if (prep.error) return prep;
  try {
    await db.batch([
      ...prep.steps,
      db.prepare('UPDATE market_gold SET gold = gold - ?3 WHERE player = ?1 AND char_id = ?2 AND gold >= ?3').bind(me, character, gold),
      mustChange(db),
      db.prepare('DELETE FROM market_gold WHERE player = ?1 AND char_id = ?2 AND gold = 0').bind(me, character),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, me, side.at.id, prep.key);
    const moved = await recordMovedOf(db, me, side.at);
    if (moved) return moved;
    return { error: 'market-gold-none' };   // another collect emptied it first
  }
  await dropObjects(bucket, [prep.prev]);
  return { ok: true, gold, region, realm: { seq: prep.seq } };
}


