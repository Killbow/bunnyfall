// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 7 (docs/FARM-EXPANSION.md section 9): MARKET DAY - the account service's half of the
// `/v1/farms/market` route. The day, the contests, the prices and the scoring are the law's (src/net/farm/marketLaw.js);
// this turns them into statements.
//   read     anyone: the farm's market today, its stalls, the entries, the last judging's ribbons; a member also the Company
//            Stores' stallable stock; the account's prize gold. THE FIRST READ AFTER A MARKET'S DAY returns the stalls' unsold
//            stock to the Company that stocked it and judges the contests, each once (a claim nonce, so two reads never pay twice).
//   stock    a member: a lot from the communal Stores onto a stall.
//   buy      anyone with a realm character: gold off the record (prepareRealmRecord, the rent's pattern) into the selling
//            Company's treasury - less the prize pot's tenth - and the goods into the buyer's own Stores, in ONE batch.
//   enter    a contest entry: one an account a contest.
//   collect  the prize gold the pot owes the account, into the record's purse (collectRent's pattern).
import { guildActorOf } from './guilds.js';
import { accountKind, displayName, mintId, overRate } from './accounts.js';
import { mustChange, prepareRealmRecord, realmActFirst, recordMovedOf, dropObjects, dropIfUnnamed, REALM_ID_RE } from './realm.js';
import { payFromSave, creditSave } from '../../src/net/realm/realmGoldLaw.js';
import { GUILD_TREASURY_MAX } from '../../src/net/guild/guildLaw.js';
import { emptyGarden, validGarden, gardenStage } from '../../src/net/farmGardenLaw.js';
import { clampCare } from '../../src/net/farm/careLaw.js';
import { contentAt } from '../../src/net/farm/herdLaw.js';
import { farmWeek } from '../../src/net/farmProgressLaw.js';
import { marketToday, marketTomorrow, marketContests, marketWeekday, MARKET_STALLS, STALL_MAX, STALL_LOT, BUY_MAX, stallOk, stallPrice, saleOf,
  CONTESTS, entryScore, placeEntries, potPrize, RIBBON_WORK, RIBBON_WEEK_MAX } from '../../src/net/farm/marketLaw.js';

const OPS = ['read', 'stock', 'buy', 'enter', 'collect'];
const DAY = 86400;
const MARKET_OPS_MAX = 600, MARKET_OPS_WINDOW_S = 3600;
const parse = (t) => { try { return JSON.parse(t); } catch { return null; } };

/** The unsold stock of every past market goes back to the Company that stocked it - each stall once (its claim). */
async function returnStalls(ctx, mapId, today) {
  const { db, nowS, rand } = ctx;
  const { results } = await db.prepare('SELECT day, slot FROM farm_stalls WHERE map_id = ? AND day < ? AND claim IS NULL LIMIT 16').bind(mapId, today).all();
  for (const r of results ?? []) {
    const n = mintId(rand);
    await db.batch([
      db.prepare('UPDATE farm_stalls SET claim = ?1 WHERE map_id = ?2 AND day = ?3 AND slot = ?4 AND claim IS NULL').bind(n, mapId, r.day, r.slot),
      db.prepare(`INSERT INTO guild_prof_stores (guild_id, material, dep_player, dep_char, qty, moved_by, moved_at)
        SELECT guild_id, material, '', '', qty, 'Market return', ?1 FROM farm_stalls
        WHERE map_id = ?2 AND day = ?3 AND slot = ?4 AND claim = ?5 AND qty > 0 AND EXISTS (SELECT 1 FROM guilds WHERE id = farm_stalls.guild_id)
        ON CONFLICT (guild_id, material, dep_player, dep_char) DO UPDATE SET qty = MIN(50000, qty + excluded.qty), moved_by = excluded.moved_by, moved_at = excluded.moved_at`)
        .bind(nowS, mapId, r.day, r.slot, n),
    ]);
  }
  await db.prepare('DELETE FROM farm_stalls WHERE map_id = ? AND day < ? AND claim IS NOT NULL').bind(mapId, today - 7).run();
}

/** THE JUDGING of every past market with entries, once each: ribbons, their farm work (three a week counted) and the pot's
 *  gold, all behind the one claim. What the pot does not pay goes to the host Company's treasury. */
async function judgeMarkets(ctx, farm, today) {
  const { db, nowS, rand } = ctx;
  const mapId = Number(farm.map_id);
  const { results } = await db.prepare('SELECT day, pot FROM farm_markets WHERE map_id = ? AND judged = 0 AND day < ? ORDER BY day LIMIT 4').bind(mapId, today).all();
  for (const m of results ?? []) {
    const day = Number(m.day), week = farmWeek(day * DAY), pot = Number(m.pot);
    const { results: rows } = await db.prepare('SELECT contest, account, name, snapshot, score, at FROM farm_market_entries WHERE map_id = ? AND day = ?').bind(mapId, day).all();
    const held = marketContests(mapId, week), n = mintId(rand);
    const claimed = `EXISTS (SELECT 1 FROM farm_markets WHERE map_id = ${mapId} AND day = ${day} AND claim = '${n}')`;   // every statement after the claim waits on it (the nonce is the service's own mintId)
    const statements = [db.prepare('UPDATE farm_markets SET judged = 1, claim = ?1 WHERE map_id = ?2 AND day = ?3 AND judged = 0').bind(n, mapId, day)];
    let paid = 0;
    for (const contest of held) {
      const placed = placeEntries((rows ?? []).filter((e) => e.contest === contest).map((e) => ({ account: e.account, name: e.name, score: Number(e.score), at: Number(e.at) })));
      for (const p of placed) {
        const gold = potPrize(pot, held.length, p.ribbon); paid += gold;
        statements.push(
          db.prepare(`INSERT OR IGNORE INTO farm_market_awards (map_id, day, contest, ribbon, account, name, score, week, counted, work, gold)
            SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CASE WHEN (SELECT COUNT(*) FROM farm_market_awards WHERE account = ?5 AND week = ?8 AND counted = 1) < ${RIBBON_WEEK_MAX} THEN 1 ELSE 0 END, ?9, ?10
            WHERE ${claimed}`).bind(mapId, day, contest, p.ribbon, p.account, String(p.name).slice(0, 64), p.score, week, RIBBON_WORK[p.ribbon], gold),
          // farm work for a counted ribbon only, once: the award row exists only behind this claim
          db.prepare(`UPDATE players SET farm_work = farm_work + ?1 WHERE id = ?2
            AND EXISTS (SELECT 1 FROM farm_market_awards WHERE map_id = ?3 AND day = ?4 AND contest = ?5 AND ribbon = ?6 AND account = ?2 AND counted = 1) AND ${claimed}`)
            .bind(RIBBON_WORK[p.ribbon], p.account, mapId, day, contest, p.ribbon),
          ...(gold > 0 ? [db.prepare(`INSERT INTO farm_market_prizes (account, gold) SELECT ?1, ?2 WHERE ${claimed} AND EXISTS (SELECT 1 FROM players WHERE id = ?1)
            ON CONFLICT (account) DO UPDATE SET gold = gold + excluded.gold`).bind(p.account, gold)] : []),
        );
      }
    }
    const rest = Math.max(0, pot - paid);
    if (rest > 0) statements.push(db.prepare(`UPDATE guilds SET treasury = treasury + ?1, realm_gold = realm_gold + ?1, moved_by = 'Market prize pot', moved_at = ?2, moved_kind = 'farm-market'
      WHERE id = ?3 AND treasury + ?1 <= ?4 AND ${claimed}`).bind(rest, nowS, farm.guild_id, GUILD_TREASURY_MAX));
    try { await db.batch(statements); } catch { /* another read judged it first, or the farm moved on: the claim decides */ }
  }
}

/** @param {{ db: any, nowS: number, bucket?: any, rand?: any, env?: any }} ctx */
export async function farmMarket(ctx, player, body = {}) {
  const { db, nowS } = ctx;
  const { character, mapId, op = 'read' } = body;
  if (!Number.isSafeInteger(mapId) || mapId < 0 || mapId > 0xffffffff || !OPS.includes(op)) return { error: 'farm-market-bad' };
  if (op !== 'read' && await overRate({ db, nowS }, `market:${player.id}`, MARKET_OPS_MAX, MARKET_OPS_WINDOW_S)) return { error: 'farm-market-rate' };
  const farm = await db.prepare('SELECT * FROM company_farms WHERE map_id = ?').bind(mapId).first();
  if (!farm) return { error: 'farm-not-ours' };
  const today = Math.floor(nowS / DAY), market = marketToday(mapId, nowS);
  if (op === 'collect') return collectPrize(ctx, player, body);
  // a past market's leftovers and its judging, on the first read after: neither ever breaks the read
  try { await returnStalls(ctx, mapId, today); await judgeMarkets(ctx, farm, today); } catch { /* tried again by the next read */ }
  const actor = typeof character === 'string' && character ? await guildActorOf(db, player, character).catch(() => null) : null;
  const member = !!actor && !('error' in actor) && actor.me.guild_id === farm.guild_id ? actor : null;
  if (op === 'read') return read(ctx, player, farm, market, member);
  if (!market) return { error: 'farm-market-closed' };
  if (op === 'stock') return stock(ctx, player, farm, market, member, body);
  if (op === 'buy') return buy(ctx, player, farm, market, body);
  return enter(ctx, player, farm, market, member, body);
}

async function read(ctx, player, farm, market, member) {
  const { db, nowS } = ctx, mapId = Number(farm.map_id);
  const out = { ok: true, nowS, tomorrow: marketTomorrow(mapId, nowS), weekday: marketWeekday(mapId), market, member: !!member,
    contests: market ? marketContests(mapId, market.week) : [], stalls: [], entries: [], results: [], prize: 0, stores: [] };
  if (market) {
    const { results: stalls } = await db.prepare('SELECT slot, material, qty, price FROM farm_stalls WHERE map_id = ? AND day = ? ORDER BY slot').bind(mapId, market.day).all();
    out.stalls = (stalls ?? []).map((s) => ({ slot: Number(s.slot), material: s.material, qty: Number(s.qty), price: Number(s.price) }));
    const { results: entries } = await db.prepare('SELECT contest, account, name FROM farm_market_entries WHERE map_id = ? AND day = ? ORDER BY at').bind(mapId, market.day).all();
    out.entries = (entries ?? []).map((e) => ({ contest: e.contest, name: e.name, mine: e.account === player.id }));
  }
  const last = await db.prepare('SELECT MAX(day) AS day FROM farm_market_awards WHERE map_id = ?').bind(mapId).first();
  if (last?.day != null) {
    const { results } = await db.prepare('SELECT day, contest, ribbon, name, score FROM farm_market_awards WHERE map_id = ? AND day = ? ORDER BY contest, ribbon').bind(mapId, last.day).all();
    out.results = (results ?? []).map((a) => ({ day: Number(a.day), contest: a.contest, ribbon: a.ribbon, name: a.name, score: Number(a.score), mine: false }));
    const mine = await db.prepare('SELECT contest, ribbon FROM farm_market_awards WHERE map_id = ? AND day = ? AND account = ?').bind(mapId, last.day, player.id).all();
    for (const m of mine.results ?? []) for (const r of out.results) if (r.contest === m.contest && r.ribbon === m.ribbon) r.mine = true;
  }
  const prize = await db.prepare('SELECT gold FROM farm_market_prizes WHERE account = ?').bind(player.id).first();
  out.prize = Number(prize?.gold ?? 0);
  if (member && market) {
    const { results } = await db.prepare("SELECT material, qty FROM guild_prof_stores WHERE guild_id = ? AND dep_player = '' AND dep_char = '' AND qty > 0 AND material LIKE 'food:%' ORDER BY qty DESC").bind(member.me.guild_id).all();
    out.stores = (results ?? []).filter((r) => stallOk(r.material)).map((r) => ({ material: r.material, qty: Number(r.qty) }));
  }
  return out;
}

async function stock(ctx, player, farm, market, member, { slot, material, qty }) {
  const { db, nowS } = ctx, mapId = Number(farm.map_id);
  if (!member) return { error: 'farm-not-ours' };
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= MARKET_STALLS || !stallOk(material) || !Number.isSafeInteger(qty) || qty < 1 || qty > STALL_LOT) return { error: 'farm-market-bad' };
  const who = String(player.handle || 'Farmer').slice(0, 64), gid = member.me.guild_id;
  try {
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO farm_markets (map_id, day) VALUES (?, ?)').bind(mapId, market.day),
      db.prepare(`UPDATE guild_prof_stores SET qty = qty - ?1, moved_by = ?2, moved_at = ?3
        WHERE guild_id = ?4 AND material = ?5 AND dep_player = '' AND dep_char = '' AND qty >= ?1`).bind(qty, `Market: ${who}`.slice(0, 64), nowS, gid, material),
      mustChange(db),
      // a stall holds one thing at a time (a sold-out one may change); it never passes STALL_MAX
      db.prepare(`INSERT INTO farm_stalls (map_id, day, slot, guild_id, material, qty, price) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT (map_id, day, slot) DO UPDATE SET material = excluded.material, guild_id = excluded.guild_id, price = excluded.price,
          qty = CASE WHEN farm_stalls.material = excluded.material THEN farm_stalls.qty + excluded.qty ELSE excluded.qty END
        WHERE (farm_stalls.material = excluded.material AND farm_stalls.guild_id = excluded.guild_id AND farm_stalls.qty + excluded.qty <= ${STALL_MAX}) OR farm_stalls.qty = 0`)
        .bind(mapId, market.day, slot, gid, material, qty, stallPrice(material)),
      mustChange(db),
    ]);
  } catch {
    const s = await db.prepare('SELECT material, qty FROM farm_stalls WHERE map_id = ? AND day = ? AND slot = ?').bind(mapId, market.day, slot).first();
    return { error: s && s.qty > 0 && (s.material !== material || Number(s.qty) + qty > STALL_MAX) ? 'farm-market-full' : 'farm-market-stores' };
  }
  return { ok: true, stocked: { slot, material, qty } };
}

async function buy(ctx, player, farm, market, { character, slot, material, qty, realm = null }) {
  const { db, nowS, bucket } = ctx, mapId = Number(farm.map_id);
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= MARKET_STALLS || !stallOk(material) || !Number.isSafeInteger(qty) || qty < 1 || qty > BUY_MAX) return { error: 'farm-market-bad' };
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, player.id, character, realm);   // where the record stands, before any other word
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  const stall = await db.prepare('SELECT guild_id, material, qty, price FROM farm_stalls WHERE map_id = ? AND day = ? AND slot = ? AND claim IS NULL').bind(mapId, market.day, slot).first();
  if (!stall || stall.material !== material || Number(stall.qty) < qty) return { error: 'farm-market-sold' };
  const sale = saleOf(material, qty);
  if (Number(stall.price) !== stallPrice(material)) return { error: 'farm-market-bad' };
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => (payFromSave(save, sale.cost, farm.region) ? null : 'realm-gold'), { outbound: true });
  if (prep.error) return prep;
  try {
    await db.batch([
      ...prep.steps,
      // the stall as it was read: the goods still there
      db.prepare('UPDATE farm_stalls SET qty = qty - ?1 WHERE map_id = ?2 AND day = ?3 AND slot = ?4 AND material = ?5 AND qty >= ?1 AND claim IS NULL').bind(qty, mapId, market.day, slot, material),
      mustChange(db),
      // the gold: the selling Company's treasury, less the pot's tenth, as a deposit from a record is
      db.prepare(`UPDATE guilds SET treasury = treasury + ?1, realm_gold = realm_gold + ?1, moved_by = ?2, moved_at = ?3, moved_kind = 'farm-market'
        WHERE id = ?4 AND treasury + ?1 <= ?5`).bind(sale.company, displayName(player), nowS, stall.guild_id, GUILD_TREASURY_MAX),
      mustChange(db),
      db.prepare('INSERT OR IGNORE INTO farm_markets (map_id, day) VALUES (?, ?)').bind(mapId, market.day),
      db.prepare('UPDATE farm_markets SET takings = takings + ?1, pot = pot + ?2 WHERE map_id = ?3 AND day = ?4').bind(sale.cost, sale.pot, mapId, market.day),
      // the goods into the buyer's own Stores (5,000 a material: the table's CHECK refuses more, and the batch with it)
      db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES (?1, ?2, ?3, 'bought', ?4)
        ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = qty + excluded.qty`).bind(player.id, character, material, qty),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, side.at.id, prep.key);
    const moved = await recordMovedOf(db, player.id, side.at);
    if (moved) return moved;
    const s = await db.prepare('SELECT material, qty FROM farm_stalls WHERE map_id = ? AND day = ? AND slot = ?').bind(mapId, market.day, slot).first();
    return { error: !s || s.material !== material || Number(s.qty) < qty ? 'farm-market-sold' : 'farm-market-stores-full' };
  }
  await dropObjects(bucket, [prep.prev]);
  return { ok: true, bought: { slot, material, qty, cost: sale.cost }, realm: { seq: prep.seq } };
}

async function enter(ctx, player, farm, market, member, { character, contest, animal }) {
  const { db, nowS } = ctx, mapId = Number(farm.map_id);
  if (!CONTESTS.includes(contest) || !marketContests(mapId, market.week).includes(contest)) return { error: 'farm-market-contest' };
  if (nowS >= market.closesAt - 600) return { error: 'farm-market-late' };   // the judge is already walking the tables
  let snapshot, name;
  if (member) {
    const row = await db.prepare('SELECT garden FROM company_farm_gardens WHERE map_id = ?').bind(mapId).first();
    const garden = parse(row?.garden ?? 'null') ?? emptyGarden();
    if (!validGarden(garden)) return { error: 'farm-bed-bad' };
    name = String(member.me.name || displayName(player) || 'Farmer').slice(0, 64);
    if (contest === 'show') {
      const a = (garden.herd ?? []).find((x) => x.id === animal);
      if (!a) return { error: 'farm-market-entry' };
      snapshot = { animal: a.id, name: a.name, kind: a.kind, content: Math.round(contentAt(a, nowS)) };
    } else {
      // the best ripe bed on the farm: its care and, if its strain is showy, the bonus
      let best = null;
      for (const bed of Object.values(garden.beds)) {
        if (!bed?.crop || gardenStage(bed, nowS) !== 'ripe') continue;
        const care = clampCare(bed.care ?? 0), showy = !!bed.traits?.includes('showy');
        if (!best || care + (showy ? 1 : 0) > best.care + (best.showy ? 1 : 0)) best = { care, showy, crop: bed.crop };
      }
      if (!best) return { error: 'farm-market-entry' };
      snapshot = best;
    }
  } else {
    // a visitor: only the sheaf, and a crop in their own Stores to show (a plain one: grade of the market's own judging)
    if (contest !== 'sheaf') return { error: 'farm-market-members' };
    if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
    const held = await db.prepare("SELECT material FROM prof_stores WHERE player = ? AND char_id = ? AND material LIKE 'food:%' AND qty > 0 LIMIT 1").bind(player.id, character).first();
    if (!held) return { error: 'farm-market-entry' };
    name = String(displayName(player) || 'A visitor').slice(0, 64);
    snapshot = { care: 0, showy: false, crop: held.material };
  }
  if (contest === 'show') {
    const { results } = await db.prepare("SELECT snapshot FROM farm_market_entries WHERE map_id = ? AND day = ? AND contest = 'show'").bind(mapId, market.day).all();
    if ((results ?? []).some((e) => parse(e.snapshot)?.animal === snapshot.animal)) return { error: 'farm-market-entered' };
  }
  const score = entryScore(contest, snapshot, mapId, market.day, player.id);
  try {
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO farm_markets (map_id, day) VALUES (?, ?)').bind(mapId, market.day),
      db.prepare('INSERT INTO farm_market_entries (map_id, day, contest, account, char_id, name, snapshot, score, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(mapId, market.day, contest, player.id, String(character ?? '').slice(0, 64), name, JSON.stringify(snapshot), score, nowS),
    ]);
  } catch { return { error: 'farm-market-entered' }; }
  return { ok: true, entered: { contest, snapshot } };
}

/** The prize gold the pot owes this account, into the record's purse - the rent collection's batch. */
async function collectPrize(ctx, player, { character, realm = null }) {
  const { db, bucket } = ctx;
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  const row = await db.prepare('SELECT gold FROM farm_market_prizes WHERE account = ?').bind(player.id).first();
  const due = Math.max(0, Number(row?.gold) || 0);
  if (!due) return { error: 'farm-market-nothing' };
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => (creditSave(save, due) ? null : 'no-data'));
  if (prep.error) return prep;
  try {
    await db.batch([
      ...prep.steps,
      db.prepare('UPDATE farm_market_prizes SET gold = gold - ?1 WHERE account = ?2 AND gold >= ?1').bind(due, player.id),
      mustChange(db),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, side.at.id, prep.key);
    return (await recordMovedOf(db, player.id, side.at)) || { error: 'farm-market-nothing' };
  }
  await dropObjects(bucket, [prep.prev]);
  return { ok: true, gold: due, realm: { seq: prep.seq } };
}
