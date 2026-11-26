// @ts-check
// Each act is one batch. Its deciding statement writes its row with a fresh nonce only where every condition holds,
// and later statements move goods and Marks only where that row carries the nonce. Ledger lines are plain INSERTs
// with their own rid suffix, so a clash or a trigger failure rolls back the whole act. A request's own row is read
// before the switch, so a retry of an act that landed is answered `repeat`.
import { mintId, overRate } from './accounts.js';
import { balanceOf } from './marks.js';
import { titheAt } from './seatHolding.js';
import { listingsCapAt } from './seatForts.js';
import { titheOf } from '../../src/net/townSeatLaw.js';
import { spendStatements, spendOrigins, spendableSql, storeOf, silverClothIn } from './professions.js';
import { REALM_ID_RE, realmActFirst, prepareRealmRecord, mustChange, dropIfUnnamed, recordMovedOf, dropObjects, realmHoldOf } from './realm.js';
import { lawfulItem } from '../../src/items/itemLaw.js';
import { payFromSave, creditSave } from '../../src/net/realmGoldLaw.js';
import { readAll } from './service.js';
import { MARKS_MAX, MARK_WORTH_GOLD, utcDay } from '../../src/net/marksLaw.js';
import { STORES_MAX, looseOnly } from '../../src/net/professionLaw.js';
import { material, regionOk } from '../../src/net/nodeLaw.js';
import {
  MARKET_LISTING_S, MARKET_ORDER_S, MARKET_ORDERS_MAX, MARKET_POSTS_MAX, MARKET_OPS_MAX, MARKET_WINDOW_S,
    unitsOk, priceOk, wearOk, provenanceOk, listingFee, saleTaxOn,  saleTitheOn,  
  MARKET_WORTH_MAX, UNYIELDED, pieceListable,  
  currencyOk, goldSaleOf, MARKET_GOLD_HELD_MAX,
  goodRefusal,
  fillTaxOn,
  wearOf
} from '../../src/net/marketLaw.js';
import { takeTradeGoods, giveTradeGoods, recordCount } from '../../src/net/realmTradeLaw.js';
import { prepareCraftedPiece, pieceComingBack } from './craftedPiece.js';
import { vendorOf, VENDOR_STATION, VENDOR_LISTING_S, VENDOR_STOCK_MAX } from '../../src/net/vendorLaw.js';
import { tradeActStatements } from './townEcon.js';
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

export async function marketList(ctx, player, env, { character, region, kind, material: key = null, units = 1, provenance = null, wear = null, price, hubs, rid, currency = 'marks', board = null, item = null, pick = null, realm = null, vendor = null } = {}) {
  if (kind === 'item') return listGood(ctx, player, env, { character, region, item, pick, price, hubs, rid, currency, realm, board, vendor });
  if (vendor != null) return { error: 'bad-vendor' };
  const { db, bucket, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const answer = async (row, extra = {}) => ({
    ok: true, ...extra, listing: listingView(row, me), balance: await balanceOf(db, me),
    ...(row.kind === 'material' ? { store: await storeOf(db, me, row.char_id, row.material) } : {}),
  });
  const priorOf = () => db.prepare('SELECT * FROM market_listings WHERE seller = ?1 AND rid = ?2').bind(me, rid).first();
  let at = null;
  if (kind === 'piece') {
    if (realm == null) { const prior = await priorOf(); if (prior) return answer(prior, { repeat: true }); }
    const side = await realmActFirst(db, me, character, realm);
    if (side.error) return side;
    if (!side.at) return { error: 'realm-needed' };
    at = side.at;
  }
  const prior = await priorOf();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!priceOk(price)) return { error: 'bad-price' };
  if (!currencyOk(currency)) return { error: 'bad-act' };
  if (currency === 'gold' && !REALM_ID_RE.test(character)) return { error: 'market-gold-realm' };
  const gold = currency === 'gold';
  const listingsMax = await listingsCapAt(db, nowS, boardOf(board));
  const other = gold ? 'gold' : 'bought';
  if (kind === 'material') {
    if (!material(key) || looseOnly(key)) return { error: 'bad-material' };
    if (!unitsOk(units)) return { error: 'bad-units' };
    provenance = null; wear = null;
  } else if (kind === 'piece') {
    if (!provenanceOk(provenance)) return { error: 'bad-provenance' };
    if (!wearOk(wear)) return { error: 'bad-wear' };
    units = 1;
    key = null;
    const made = await db.prepare('SELECT recipe FROM products WHERE provenance = ?1').bind(provenance).first();
    if (made && !pieceListable(made.recipe)) return { error: 'market-not-listable' };
  } else return { error: 'bad-act' };
  if (units * price > MARKET_WORTH_MAX) return { error: 'bad-price' };
  const held = await realmHoldOf(db, me, character);
  if (held) return held;
  if (await overRate(ctx, `market-post:${me}`, MARKET_POSTS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  await settle(ctx, player);
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
    ...(prep ? [mustChange(db), pieceEscrowStep(db, provenance, character, me, prep.moved, nowS, listed, [me, rid, nonce])] : []),
    ...(kind === 'material' ? (gold
      ? spendOrigins(db, { player: me, character, materialSql: '?3', qtySql: '?4', guard: mine, binds: [key, units, rid, nonce], order: ['gold', 'own'] })
      : spendStatements(db, { player: me, character, materialSql: '?3', qtySql: '?4', guard: mine, binds: [key, units, rid, nonce] })) : []),
    db.prepare(`UPDATE products SET listed = 1 WHERE provenance = ?2 AND EXISTS (SELECT 1 FROM market_listings WHERE seller = ?1 AND rid = ?3 AND n = ?4)`)
      .bind(me, provenance, rid, nonce),
    ...(boardOf(board) ? [db.prepare('UPDATE market_listings SET board_x = ?4, board_y = ?5 WHERE seller = ?1 AND rid = ?2 AND n = ?3')
      .bind(me, rid, nonce, boardOf(board)[0], boardOf(board)[1])] : []),
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
      await dropIfUnnamed(db, bucket, me, at.id, prep.key);
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
    const st = await storeOf(db, me, character, key);
    const mayList = st.own + (gold ? (st.gold ?? 0) : st.bought);
    if (mayList < units && st.own + st.bought + (st.gold ?? 0) >= units) return { error: gold ? 'market-drakes-goods' : 'market-gold-goods' };
    return { error: 'stores-short' };
  }
  return { error: (await pieceListRefusal(db, me, provenance, currency)) ?? 'market-listed' };
}

async function pieceListRefusal(db, me, provenance, currency) {
  const p = await db.prepare('SELECT owner, listed, bought_with FROM products WHERE provenance = ?1').bind(provenance).first();
  if (!p) return 'market-no-record';
  if (p.owner !== me) return 'market-not-yours';
  if (p.bought_with && p.bought_with !== currency) return p.bought_with === 'gold' ? 'market-gold-goods' : 'market-drakes-goods';
  if (await db.prepare('SELECT 1 FROM market_deliveries WHERE provenance = ?1 AND collected = 0').bind(provenance).first() || await pieceComingBack(db, me, provenance)) return 'market-uncollected';
  if (await db.prepare("SELECT 1 FROM home_decor WHERE json_extract(item, '$.pv') = ?1").bind(provenance).first()) return 'market-standing';
  if (Number(p.listed) === 1 || await db.prepare("SELECT 1 FROM market_listings WHERE provenance = ?1 AND state = 'open'").bind(provenance).first()) return 'market-listed';
  return null;
}

async function listGood(ctx, player, env, { character, region, item, pick, price, hubs, rid, currency, realm, board = null, vendor = null }) {
  const { db, bucket, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const side = await realmActFirst(db, me, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'market-gold-realm' };
  const answer = (row, extra = {}) => ({ ok: true, ...extra, listing: listingView(row, me) });
  const prior = await db.prepare('SELECT * FROM market_listings WHERE seller = ?1 AND rid = ?2').bind(me, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
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
  if (currency !== 'gold') return { error: 'market-goods-gold' };
  if (!Number.isSafeInteger(pick) || pick < 0) return { error: 'bad-act' };
  if (goodRefusal(item)) return { error: 'market-not-good' };
  const count = vend ? recordCount(item) : 1;
  if (!unitsOk(count) || count * price > MARKET_WORTH_MAX) return { error: 'bad-price' };
  if (typeof item.provenance === 'string') {
    const p = await db.prepare('SELECT owner, bought_with FROM products WHERE provenance = ?1').bind(item.provenance).first();
    if (p?.owner === me) return { error: 'market-piece-route' };
    if (p?.bought_with === 'marks') return { error: 'market-drakes-goods' };
  }
  if (await overRate(ctx, `market-post:${me}`, MARKET_POSTS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  await settle(ctx, player);
  const salesSql = vend ? stallSalesSql() : openSalesSql('?2');
  const open = await db.prepare(`SELECT ${salesSql} AS n`).bind(...(vend ? [me] : [me, nowS])).first();
  const listingsMax = vend ? VENDOR_STOCK_MAX : await listingsCapAt(db, nowS, boardOf(board));
  if (Number(open?.n ?? 0) >= listingsMax) return { error: vend ? 'vendor-full' : 'market-listings-max' };
  let moved = null;
  const prep = await prepareRealmRecord(ctx, me, side.at, (save) => {
    if (goodRefusal(Array.isArray(save.items) ? save.items[pick] : null)) return 'market-not-good';
    if (!lawfulItem(save.items[pick])) return 'market-not-good';
    const out = takeTradeGoods(save, { items: [item], gold: 0 }, [pick]);
    if (!out) return 'market-good-gone';
    moved = out[0];
    return null;
  }, { outbound: true, escrow: true });
  if (prep.error) return prep;
  const id = mintId(rand);
  const nonce = mintId(rand);
  try {
    await db.batch([
      ...prep.steps,
      db.prepare(`INSERT OR IGNORE INTO market_listings (id, seller, char_id, region, kind, units, own, bought, price, fee, at, expires_at, rid, n, currency, item, vendor_map, vendor_id)
        SELECT ?3, ?1, ?2, ?4, 'item', 1, ?15, 0, ?5, ?6, ?7, ?8, ?9, ?10, 'gold', ?11, ?13, ?14 WHERE ${vend ? stallSalesSql() : openSalesSql('?7')} < ?12
          AND (?14 IS NULL OR EXISTS (SELECT 1 FROM home_decor d JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key
            WHERE d.map_id = ?13 AND d.id = ?14 AND d.yard = 0 AND json_extract(d.place, '$.station') = '${VENDOR_STATION}' AND h.player = ?1 AND h.guild_id IS NULL AND (h.deed = 0 OR h.char_id = ?2)))`)
        .bind(me, character, id, region, price, listingFee(price), nowS, nowS + (vend ? VENDOR_LISTING_S : MARKET_LISTING_S), rid, nonce, JSON.stringify(moved), listingsMax,
          vend?.map ?? null, vend?.id ?? null, count),
      mustChange(db),
      ...witnessStatements(db, player, nowS, [region], hubsOf(hubs), 'EXISTS (SELECT 1 FROM market_listings WHERE seller = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, me, side.at.id, prep.key);
    const moved2 = await recordMovedOf(db, me, side.at);
    if (moved2) return moved2;
    return { error: 'market-listings-max' };
  }
  await dropObjects(bucket, [prep.prev]);
  const made = await db.prepare('SELECT * FROM market_listings WHERE seller = ?1 AND rid = ?2').bind(me, rid).first();
  return answer(made, { realm: { seq: prep.seq } });
}

export async function marketBuy(ctx, player, env, { character, region, listing: id, units = 1, max, hubs, rid, realm = null, board = null, vendor = null, landed = false } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  let at = null, oneOn = null;
  if (realm != null) {
    const side = await realmActFirst(db, me, character, realm);
    // Only a tab that sends `landed` gets a landed sale back as a repeat. An older tab reads every repeat as a sale
    // paid before it asked, and would checkpoint its unpaid purse over the record.
    if (landed === true && side.error === 'seq' && side.seq === Number(realm.seq) + 1) oneOn = side.seq;
    else if (side.error) return side;
    else if (!side.at) return { error: 'market-gold-realm' };
    else at = side.at;
  }
  const answer = async (row, extra = {}) => {
    const [balance, store, dn] = await Promise.all([
      balanceOf(db, me),
      row.kind === 'material' ? storeOf(db, me, row.char_id, row.material) : null,
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
  if (oneOn) return { error: 'seq', seq: oneOn };
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!idOk(id)) return { error: 'bad-listing' };
  if (!Number.isSafeInteger(max) || max < 1) return { error: 'bad-price' };
  const [over, l] = await Promise.all([
    overRate(ctx, `market:${me}`, MARKET_OPS_MAX, MARKET_WINDOW_S),
    db.prepare(`SELECT l.*, ${sellerStoppedSql('l', '?2')} AS seller_stopped,
      (SELECT frozen_until FROM players WHERE id = l.seller) AS seller_frozen FROM market_listings l WHERE l.id = ?1`).bind(id, nowS).first(),
  ]);
  if (over) return { error: 'market-rate' };
  if (!l || l.state !== 'open' || Number(l.expires_at) <= nowS) return { error: 'market-gone' };
  if (Number(l.seller_frozen) > nowS) return { error: 'market-seller-frozen' };
  if (l.seller === me) return { error: 'market-own' };
  // A held or banned seller reuses an existing refusal, because a new one would need text in every shipped
  // language.
  if (Number(l.seller_stopped)) return { error: 'market-gone' };
  const vend = vendor == null ? null : vendorOf(vendor);
  if (vendor != null && !vend) return { error: 'bad-vendor' };
  if (l.vendor_id != null || vend) {
    if (!vend) return { error: 'vendor-only' };
    if (l.vendor_id !== vend.id || Number(l.vendor_map) !== vend.map || Number(l.region) !== region) return { error: 'vendor-not-here' };
    const stands = await db.prepare(`SELECT 1 AS y FROM home_decor d JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key
      WHERE ${VENDOR_STANDS_SQL} AND h.player = ?3`).bind(vend.map, vend.id, l.seller).first();
    if (!stands) return { error: 'vendor-gone' };
  }
  if ((l.currency === 'gold') !== (at != null)) return { error: at ? 'market-currency' : 'market-gold-realm' };
  const stacked = stackedListing(l);
  if (l.kind === 'piece' || (l.kind === 'item' && !stacked)) units = 1;
  else if (!unitsOk(units)) return { error: 'bad-units' };
  if (l.kind === 'item' && !lawfulItem(goodOf(l.item))) return { error: 'market-not-good' };
  if (units > Number(l.own) + Number(l.bought)) return { error: 'market-short' };
  const from = Number(l.region);
  const own = hubsOf(hubs);
  const [hubsNow, tt, ctAny] = await Promise.all([
    hubsAt(db, [from, region], own),
    at ? null : titheAt(db, nowS, from, rowBoard(l)),
    at || from === region ? null : titheAt(db, nowS, region, boardOf(board)),
  ]);
  const road = courierOf(hubsNow, from, region, l.kind === 'item' ? 1 : units, courierSlow(env, nowS, region));
  if (!road) return { error: 'market-no-road' };
  if (at) return buyWithGold(ctx, player, { character, region, l, units, max, rid, road, own, at, answer, vend, landed: landed === true, stacked });
  const total = units * Number(l.price);
  const left = Number(l.own) + Number(l.bought);
  const before = (Number(l.units) - left) * Number(l.price);
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
  const decided = await readAll(db, [
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
    db.prepare(`UPDATE market_listings SET own = own - MAX(0, ?4 - bought), bought = MAX(0, bought - ?4),
        state = CASE WHEN own + bought = ?4 THEN 'sold' ELSE state END, closed_at = CASE WHEN own + bought = ?4 THEN ?5 ELSE closed_at END
      WHERE id = ?6 AND ${sold}`).bind(me, rid, nonce, units, nowS, id),
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', buyer, 'account', seller, 'market-sale', total - tax - tithe, day, at, buyer, listing, rid || ':sale'
      FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND total - tax - tithe > 0`).bind(me, rid, nonce),
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', buyer, 'burn', NULL, 'market-tax', tax, day, at, buyer, listing, rid || ':tax'
      FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND tax > 0`).bind(me, rid, nonce),
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', buyer, 'burn', NULL, 'courier', courier - ?4, day, at, buyer, listing, rid || ':courier'
      FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND courier - ?4 > 0`).bind(me, rid, nonce, courierTithe),
    ...(tithe > 0 ? [db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', buyer, CASE WHEN ${titheEnd('?4', 'tithe')} THEN 'guild' ELSE 'burn' END, CASE WHEN ${titheEnd('?4', 'tithe')} THEN ?4 END,
        'tithe', tithe, day, at, buyer, listing, rid || ':tithe'
      FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND tithe > 0`).bind(me, rid, nonce, tt.guild)] : []),
    ...(courierTithe > 0 ? [db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', buyer, CASE WHEN ${titheEnd('?4', '?5')} THEN 'guild' ELSE 'burn' END, CASE WHEN ${titheEnd('?4', '?5')} THEN ?4 END,
        'tithe', ?5, day, at, buyer, listing, rid || ':ctithe'
      FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3`).bind(me, rid, nonce, ct.guild, courierTithe)] : []),
    db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT buyer, char_id, material, 'bought', units FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'material' AND delivered = 1
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(me, rid, nonce),
    silverClothIn(db, "SELECT buyer AS player, char_id, material, units AS qty FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'material' AND delivered = 1", [me, rid, nonce]),
    db.prepare(`UPDATE products SET owner = ?1, credited = 0, listed = 0, bought_with = 'marks' WHERE provenance = (SELECT provenance FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'piece')`)
      .bind(me, rid, nonce),
    db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, provenance, wear, why, from_region, arrives_at, at)
      SELECT ?4, s.buyer, s.char_id, s.provenance, l.wear, 'bought', s.from_region, s.arrives_at, s.at
      FROM market_sales s JOIN market_listings l ON l.id = s.listing
      WHERE s.buyer = ?1 AND s.rid = ?2 AND s.n = ?3 AND s.kind = 'piece' AND s.from_region != s.to_region`).bind(me, rid, nonce, mintId(rand)),
    ...pieceSoldSteps(db, "SELECT provenance FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'piece'", [me, rid, nonce]),
    db.prepare(`INSERT INTO market_prices (day, material, price, units)
      SELECT day, material, price, units FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'material'
      ON CONFLICT (day, material, price) DO UPDATE SET units = market_prices.units + excluded.units`).bind(me, rid, nonce),
    ...witnessStatements(db, player, nowS, [from, region], own, 'EXISTS (SELECT 1 FROM market_sales WHERE buyer = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
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
  if (Number(now.own) + Number(now.bought) !== left) return { error: 'market-price-moved' };
  if ((await balanceOf(db, me)) < total + road.courier) return { error: 'marks-short' };
  if ((await balanceOf(db, l.seller)) + gets > MARKS_MAX) return { error: 'market-seller-full' };
  return { error: 'stores-full' };
}

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
  // The tab has already taken `max` out of its purse, so any other cost would split the purse from the record.
  if (total + courier !== max) return { error: 'market-price-moved' };
  const from = Number(l.region);
  const here = from === region;
  const delivered = l.kind === 'piece' || l.kind === 'item' || here ? 1 : 0;
  const prep = await prepareRealmRecord(ctx, me, at, (save) => (payFromSave(save, total + courier, region) ? null : 'realm-gold'), { outbound: true });
  if (prep.error) return prep;
  const nonce = mintId(rand);
  const day = utcDay(nowS);
  const sold = 'EXISTS (SELECT 1 FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3)';
  try {
    await db.batch([
      ...prep.steps,
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
      mustChange(db),
      db.prepare(`UPDATE market_listings SET own = own - MAX(0, ?4 - bought), bought = MAX(0, bought - ?4),
          state = CASE WHEN own + bought = ?4 THEN 'sold' ELSE state END, closed_at = CASE WHEN own + bought = ?4 THEN ?5 ELSE closed_at END
        WHERE id = ?6 AND ${sold}`).bind(me, rid, nonce, units, nowS, l.id),
      db.prepare(`INSERT INTO market_gold (player, char_id, gold)
        SELECT seller, (SELECT char_id FROM market_listings WHERE id = listing), MAX(0, total - tax - tithe - fee) FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3
        ON CONFLICT (player, char_id) DO UPDATE SET gold = market_gold.gold + excluded.gold`).bind(me, rid, nonce),
      db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
        SELECT buyer, char_id, material, 'gold', units FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'material' AND delivered = 1
        ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(me, rid, nonce),
      db.prepare(`UPDATE products SET owner = ?1, credited = 0, listed = 0, bought_with = 'gold', loose = 0 WHERE provenance = (SELECT provenance FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'piece')`)
        .bind(me, rid, nonce),
      db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, provenance, wear, why, from_region, arrives_at, at)
        SELECT ?4, s.buyer, s.char_id, s.provenance, l.wear, 'bought', s.from_region, s.arrives_at, s.at
        FROM market_sales s JOIN market_listings l ON l.id = s.listing
        WHERE s.buyer = ?1 AND s.rid = ?2 AND s.n = ?3 AND s.kind = 'piece' AND s.from_region != s.to_region`).bind(me, rid, nonce, mintId(rand)),
      ...pieceSoldSteps(db, "SELECT provenance FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'piece'", [me, rid, nonce]),
      db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, item, why, from_region, arrives_at, at)
        SELECT s.dn, s.buyer, s.char_id, CASE WHEN ?4 = 1 THEN json_set(l.item, '$.stackCount', s.units) ELSE l.item END, 'bought', s.from_region, s.arrives_at, s.at
        FROM market_sales s JOIN market_listings l ON l.id = s.listing
        WHERE s.buyer = ?1 AND s.rid = ?2 AND s.n = ?3 AND s.kind = 'item'`).bind(me, rid, nonce, stacked ? 1 : 0),
      db.prepare(`UPDATE market_listings SET item = json_set(item, '$.stackCount', own + bought)
        WHERE id = ?4 AND state = 'open' AND own + bought > 0 AND ?5 = 1 AND EXISTS (SELECT 1 FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3)`).bind(me, rid, nonce, l.id, stacked ? 1 : 0),
      db.prepare(`INSERT INTO market_gold_prices (day, material, price, units)
        SELECT day, material, price, units FROM market_sales WHERE buyer = ?1 AND rid = ?2 AND n = ?3 AND kind = 'material'
        ON CONFLICT (day, material, price) DO UPDATE SET units = market_gold_prices.units + excluded.units`).bind(me, rid, nonce),
      ...witnessStatements(db, player, nowS, [from, region], own, 'EXISTS (SELECT 1 FROM market_sales WHERE buyer = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
      ...tradeActStatements(db, player, nowS, vend?.map ?? null, 'EXISTS (SELECT 1 FROM market_sales WHERE buyer = ?6 AND rid = ?7 AND n = ?8)', [me, rid, nonce]),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, me, at.id, prep.key);
    const moved = await recordMovedOf(db, me, at);
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

export async function marketCancel(ctx, player, env, { character, listing: id, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const answer = async (row, extra = {}) => {
    const out = { ok: true, ...extra, listing: listingView(row, me), balance: await balanceOf(db, me) };
    if (row.kind === 'material') out.store = await storeOf(db, me, row.char_id, row.material);
    else if (row.kind === 'item') out.delivery = { id: row.id };
    else if (await pieceCameBack(db, row.id)) out.delivery = { id: row.id };
    else out.piece = pieceOf(await db.prepare('SELECT * FROM products WHERE provenance = ?1').bind(row.provenance).first(), row.wear);
    return out;
  };
  const prior = await db.prepare('SELECT * FROM market_listings WHERE seller = ?1 AND cancel_rid = ?2').bind(me, rid).first();
  if (prior) return answer(prior, { repeat: true });
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
    db.prepare(`INSERT OR IGNORE INTO market_deliveries (id, player, char_id, item, why, from_region, arrives_at, at)
      SELECT id, seller, char_id, item, 'returned', region, ?2, ?2 FROM market_listings WHERE id = ?1 AND rn = ?3 AND kind = 'item'`).bind(id, nowS, nonce),
    ...pieceBackSteps(db, id, nowS, "SELECT provenance, seller, char_id, region FROM market_listings WHERE id = ?1 AND rn = ?2 AND kind = 'piece'", [id, nonce]),
  ]);
  const made = await db.prepare('SELECT * FROM market_listings WHERE seller = ?1 AND cancel_rid = ?2').bind(me, rid).first();
  if (made?.rn === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  const now = await db.prepare('SELECT state FROM market_listings WHERE id = ?1').bind(id).first();
  return { error: now?.state === 'open' ? 'stores-full' : 'market-gone' };
}

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
  if (!material(key) || looseOnly(key)) return { error: 'bad-material' };
  if (UNYIELDED.includes(key)) return { error: 'market-unyielded' };
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

export async function marketFill(ctx, player, env, { character, region, order: id, units, hubs, rid, least = null, board = null } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const answer = async (row, extra = {}) => ({
    ok: true, ...extra, fill: { order: row.order_id, material: row.material, units: Number(row.units), price: Number(row.price), pay: Number(row.pay), tax: Number(row.tax),
      courier: Number(row.units) * Number(row.price) - Number(row.pay) - Number(row.tax) },
    store: await storeOf(db, me, row.char_id, row.material), balance: await balanceOf(db, me),
  });
  const prior = await db.prepare('SELECT * FROM market_fills WHERE filler = ?1 AND rid = ?2').bind(me, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!idOk(id)) return { error: 'bad-order' };
  if (!unitsOk(units)) return { error: 'bad-units' };
  const frozen = await realmHoldOf(db, me, character);
  if (frozen) return frozen;
  if (await overRate(ctx, `market:${me}`, MARKET_OPS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  const o = await db.prepare('SELECT * FROM market_orders WHERE id = ?1').bind(id).first();
  if (!o || o.state !== 'open' || Number(o.expires_at) <= nowS) return { error: 'market-gone' };
  if (o.poster === me) return { error: 'market-own' };
  if (units > Number(o.left_units)) return { error: 'market-short' };
  const total = units * Number(o.price);
  const own = hubsOf(hubs);
  const to = Number(o.region);
  const road = courierOf(await hubsAt(db, [region, to], own), region, to, units);
  if (!road) return { error: 'market-no-road' };
  const tax = fillTaxOn((Number(o.units) - Number(o.left_units)) * Number(o.price), total, road.courier === 0 && units === Number(o.left_units));
  const pay = total - tax - road.courier;
  if (pay < 1) return { error: road.courier > 0 ? 'market-courier-dear' : 'market-taxed-out' };
  if (Number.isSafeInteger(least) && pay < least) return { error: 'market-price-moved' };
  const ct = road.courier > 0 ? await titheAt(db, nowS, region, boardOf(board)) : null;
  const fillTithe = ct ? titheOf(road.courier, ct.pct) : 0;
  const nonce = mintId(rand);
  const day = utcDay(nowS);
  const filled = 'EXISTS (SELECT 1 FROM market_fills WHERE filler = ?1 AND rid = ?5 AND n = ?6)';
  await db.batch([
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
    db.prepare(`UPDATE market_orders SET left_units = left_units - ?3, escrow = escrow - price * ?3,
        state = CASE WHEN left_units = ?3 THEN 'filled' ELSE state END, closed_at = CASE WHEN left_units = ?3 THEN ?4 ELSE closed_at END
      WHERE id = ?2 AND EXISTS (SELECT 1 FROM market_fills WHERE filler = ?1 AND rid = ?5 AND n = ?6)`).bind(me, id, units, nowS, rid, nonce),
    ...spendStatements(db, { player: me, character, materialSql: '?3', qtySql: '?4', guard: filled, binds: [o.material, units, rid, nonce] }),
    db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT poster, ?4, material, 'bought', units FROM market_fills WHERE filler = ?1 AND rid = ?2 AND n = ?3
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(me, rid, nonce, o.char_id),
    silverClothIn(db, 'SELECT poster AS player, ?4 AS char_id, material, units AS qty FROM market_fills WHERE filler = ?1 AND rid = ?2 AND n = ?3', [me, rid, nonce, o.char_id]),
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'escrow', order_id, 'account', filler, 'order-fill', pay, day, at, filler, material, rid || ':fill'
      FROM market_fills WHERE filler = ?1 AND rid = ?2 AND n = ?3`).bind(me, rid, nonce),
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'escrow', order_id, 'burn', NULL, 'market-tax', tax, day, at, filler, material, rid || ':filltax'
      FROM market_fills WHERE filler = ?1 AND rid = ?2 AND n = ?3 AND tax > 0`).bind(me, rid, nonce),
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
  if (Number(now.left_units) !== Number(o.left_units)) return { error: 'market-price-moved' };
  const held = await storeOf(db, me, character, o.material);
  if (held.own + held.bought < units) return { error: held.own + held.bought + (held.gold ?? 0) >= units ? 'market-gold-goods' : 'stores-short' };
  if ((await balanceOf(db, me)) + pay > MARKS_MAX) return { error: 'marks-full' };
  return { error: 'market-order-full' };
}

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

export async function marketCollect(ctx, player, env, { character, delivery: id, rid, realm = null, landed = false } = {}) {
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
  if (d.item != null) return { error: 'realm-needed' };
  await db.prepare(`UPDATE market_deliveries SET collected = 1, rid = ?3 WHERE id = ?1 AND player = ?2 AND char_id = ?4 AND collected = 0 AND arrives_at <= ?5
      AND EXISTS (SELECT 1 FROM products WHERE provenance = market_deliveries.provenance AND owner = ?2)`)
    .bind(id, me, rid, character, nowS).run();
  const made = await db.prepare('SELECT * FROM market_deliveries WHERE player = ?1 AND rid = ?2').bind(me, rid).first();
  return made ? answer(made) : { error: 'market-gone' };
}

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
  if (oneOn) return { error: 'seq', seq: oneOn };
  const closed = shut(player, env);
  if (closed) return closed;
  if (!idOk(id)) return { error: 'bad-delivery' };
  if (await overRate(ctx, `market:${me}`, MARKET_OPS_MAX, MARKET_WINDOW_S)) return { error: 'market-rate' };
  const d = await db.prepare('SELECT * FROM market_deliveries WHERE id = ?1 AND player = ?2').bind(id, me).first();
  if (!d || Number(d.collected) === 1) return { error: 'market-gone' };
  if (d.char_id !== character) return { error: 'market-other-character' };
  if (Number(d.arrives_at) > nowS) return { error: 'market-on-road' };
  const item = goodOf(d.item);
  if (!item) return { error: 'bad-delivery' };
  const prep = await prepareRealmRecord(ctx, me, side.at, (save) => { giveTradeGoods(save, [item], 0); return null; });
  if (prep.error) return prep;
  try {
    await db.batch([
      ...prep.steps,
      db.prepare(`UPDATE market_deliveries SET collected = 1, rid = ?3 WHERE id = ?1 AND player = ?2 AND char_id = ?4 AND collected = 0 AND arrives_at <= ?5
        AND item IS NOT NULL`).bind(id, me, rid, character, nowS),
      mustChange(db),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, me, side.at.id, prep.key);
    const moved = await recordMovedOf(db, me, side.at);
    const first = landed && moved?.error === 'seq' && moved.seq === side.at.seq + 1
      ? await db.prepare('SELECT * FROM market_deliveries WHERE player = ?1 AND rid = ?2').bind(me, rid).first() : null;
    if (first) return answer(first, { repeat: true, realm: { seq: moved.seq } });
    if (moved) return moved;
    return { error: 'market-gone' };
  }
  await dropObjects(bucket, [prep.prev]);
  const made = await db.prepare('SELECT * FROM market_deliveries WHERE player = ?1 AND rid = ?2').bind(me, rid).first();
  return answer(made, { realm: { seq: prep.seq } });
}

export async function marketGoldCollect(ctx, player, env, { character, realm = null, region } = {}) {
  const { db, bucket } = ctx;
  const refused = asks(player, { character, needRid: false });
  if (refused) return refused;
  const me = player.id;
  const side = await realmActFirst(db, me, character, realm);
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
    return { error: 'market-gold-none' };
  }
  await dropObjects(bucket, [prep.prev]);
  return { ok: true, gold, region, realm: { seq: prep.seq } };
}

