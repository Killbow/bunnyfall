// @ts-check
import { accountKind, overRate } from './accounts.js';
import { guildActorOf } from './guilds.js';
import { seatsOpenFor, confirmedSeats } from './townSeats.js';
import { mustChange } from './realm.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { seatWeekOf, seatKeyOk, SEAT_LEVER_RANKS, SEAT_EDICTS_HOUR } from '../../src/net/townSeatLaw.js';
import { FORT_WORKS, fortWork, fortMaxTier, fortMayRaise, fortNeeds, fortStandsAt, fortWanting, marketHallListings, marketHallTitheCap, campSpent } from '../../src/net/fortLaw.js';
import { MARKET_LISTINGS_MAX } from '../../src/net/marketLaw.js';
import { TITHE_CAP } from '../../src/net/townSeatLaw.js';
import { specsAt, trackOf, isBuilder as isBuilderSpec, isFortifier as isFortifierSpec, isSiegewright as isSiegewrightSpec } from '../../src/net/professionLaw.js';

const weekAt = (nowS) => seatWeekOf(nowS * 1000);
const ORDER = new Map(FORT_WORKS.map((w, i) => [w.id, i]));
const byOrder = (a, b) => (ORDER.get(a.work) ?? 99) - (ORDER.get(b.work) ?? 99);
const historyRow = (db, key, nowS, kind, data) => db.prepare('INSERT INTO town_seat_history (key, week, kind, data, at) VALUES (?, ?, ?, ?, ?)')
  .bind(key, weekAt(nowS), kind, JSON.stringify(data), nowS);

async function rowsOf(db, key) {
  const { results = [] } = await db.prepare('SELECT work, tier, building, builder, siegewright, stands_at, guild_id FROM town_seat_forts WHERE key = ?').bind(key).all();
  return results.map((r) => ({ work: r.work, tier: Number(r.tier), building: r.building == null ? null : Number(r.building), builder: Number(r.builder) === 1,
    siegewright: Number(r.siegewright) === 1,
    standsAt: r.stands_at == null ? null : Number(r.stands_at), guild: r.guild_id ?? null })).filter((r) => fortWork(r.work)).sort(byOrder);
}
async function heldOf(db, key) {
  const { results = [] } = await db.prepare('SELECT work, material, qty FROM town_seat_fort_held WHERE key = ?').bind(key).all();
  const out = new Map();
  for (const r of results) { let m = out.get(r.work); if (!m) out.set(r.work, m = new Map()); m.set(r.material, Number(r.qty)); }
  return out;
}

async function riseDue(db, key, nowS) {
  for (const r of await rowsOf(db, key)) {
    if (r.building == null || r.standsAt == null || r.standsAt > nowS) continue;
    try {
      await db.batch([
        db.prepare('UPDATE town_seat_forts SET tier = building, building = NULL, stands_at = NULL, builder = 0, siegewright = 0 WHERE key = ? AND work = ? AND building = ? AND stands_at <= ?')
          .bind(key, r.work, r.building, nowS),
        mustChange(db),
        db.prepare('DELETE FROM town_seat_fort_held WHERE key = ? AND work = ?').bind(key, r.work),
        historyRow(db, key, nowS, 'fort-raised', { work: r.work, tier: r.building }),
      ]);
    } catch { }
  }
}

export async function supplyForts(db, key, nowS) {
  const rows = (await rowsOf(db, key)).filter((r) => r.building != null && r.standsAt == null);
  if (!rows.length) return;
  const { results: stock = [] } = await db.prepare('SELECT material, qty FROM town_seat_stockpile WHERE key = ? AND qty > 0').bind(key).all();
  const left = new Map(stock.map((s) => [s.material, Number(s.qty)]));
  const held = await heldOf(db, key);
  const stmts = [];
  for (const r of rows) {
    const needs = fortNeeds(r.work, r.building, { builder: r.builder })?.needs ?? [];
    const has = new Map(held.get(r.work) ?? []);
    for (const [k, want] of fortWanting(needs, has)) {
      const take = Math.min(want, left.get(k) ?? 0);
      if (take <= 0) continue;
      left.set(k, (left.get(k) ?? 0) - take);
      has.set(k, (has.get(k) ?? 0) + take);
      // Each move checks the stockpile in its own statement, so racing readers move a unit only once.
      stmts.push(
        db.prepare('UPDATE town_seat_stockpile SET qty = qty - ? WHERE key = ? AND material = ? AND qty >= ?').bind(take, key, k, take), mustChange(db),
        db.prepare(`INSERT INTO town_seat_fort_held (key, work, material, qty) VALUES (?, ?, ?, ?)
          ON CONFLICT (key, work, material) DO UPDATE SET qty = town_seat_fort_held.qty + excluded.qty`).bind(key, r.work, k, take),
      );
    }
    if (fortWanting(needs, has).every(([, n]) => n === 0)) {
      stmts.push(db.prepare('UPDATE town_seat_forts SET stands_at = ? WHERE key = ? AND work = ? AND building = ? AND stands_at IS NULL')
        .bind(fortStandsAt(nowS, r.building, { siegewright: r.siegewright }), key, r.work, r.building));
    }
  }
  if (!stmts.length) return;
  try { await db.batch(stmts); } catch { }
}

export async function fortsOf(db, key, nowS) {
  await riseDue(db, key, nowS);
  await supplyForts(db, key, nowS);
  await riseDue(db, key, nowS);
  const held = await heldOf(db, key);
  const works = {};
  for (const r of await rowsOf(db, key)) {
    const needs = r.building == null ? null : fortNeeds(r.work, r.building, { builder: r.builder })?.needs ?? null;
    works[r.work] = { tier: r.tier, building: r.building, standsAt: r.standsAt, needs, held: needs ? needs.map(([k]) => [k, held.get(r.work)?.get(k) ?? 0]) : null };
  }
  const { results: stock = [] } = await db.prepare('SELECT material, qty FROM town_seat_stockpile WHERE key = ? AND qty > 0 ORDER BY material').bind(key).all();
  return { works, stockpile: stock.map((s) => [s.material, Number(s.qty)]) };
}
export async function fortTierAt(db, key, work, nowS) {
  const r = await db.prepare('SELECT tier, building, stands_at FROM town_seat_forts WHERE key = ? AND work = ?').bind(key, work).first();
  if (!r) return 0;
  return r.building != null && r.stands_at != null && Number(r.stands_at) <= nowS ? Number(r.building) : Number(r.tier);
}
export async function fortTiersOf(db, key, nowS) {
  await riseDue(db, key, nowS);
  return Object.fromEntries((await rowsOf(db, key)).map((r) => [r.work, r.tier]));
}

async function specsOf(db, player, character, profession, nowS) {
  const row = await db.prepare('SELECT spec50, spec100, respec_rank, respec_to, respec_at FROM prof_tracks WHERE player = ? AND char_id = ? AND profession = ?')
    .bind(player, character, trackOf(profession)).first();
  return specsAt(row ? { ...row, respec_rank: row.respec_rank == null ? null : Number(row.respec_rank), respec_at: row.respec_at == null ? null : Number(row.respec_at) } : null, nowS);
}
const isBuilder = async (db, player, character, nowS) => isBuilderSpec(await specsOf(db, player, character, 'masonry', nowS));
const isSiegewright = async (db, player, character, nowS) => isSiegewrightSpec(await specsOf(db, player, character, 'carpentry', nowS));

/** @param {{db: any, nowS: number}} ctx */
export async function fundFort(ctx, player, env, { character, key, work, port = false, rid } = {}) {
  const { db, nowS } = ctx;
  if (accountKind(player) !== 'linked') return { error: 'seats-need-account' };
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  if (typeof rid !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(rid)) return { error: 'bad-rid' };
  const w = fortWork(work);
  if (!w) return { error: 'bad-work' };
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!SEAT_LEVER_RANKS.includes(Number(a.me.rank))) return { error: 'guild-rank' };
  const hold = await db.prepare('SELECT key, guild_id, tier FROM town_seat_holds WHERE key = ?').bind(key).first();
  if (!hold || hold.guild_id !== a.me.guild_id) return { error: 'seat-not-held' };
  const prior = await db.prepare("SELECT 1 FROM marks_ledger WHERE actor = ? AND rid = ? AND kind = 'fort'").bind(player.id, `${rid}:fort`).first();
  if (prior) return { ok: true, repeat: true, work, forts: await fortsOf(db, key, nowS) };
  const tiers = await fortTiersOf(db, key, nowS);
  const rows = await rowsOf(db, key);
  const cur = rows.find((r) => r.work === work);
  if (!fortMayRaise(work, { tier: hold.tier, coastal: port === true, walls: tiers.walls ?? 0 })) return { error: 'fort-not-here' };
  if (cur?.building != null) return { error: 'fort-building' };
  const t = (cur?.tier ?? 0) + 1;
  if (t > fortMaxTier(work)) return { error: 'fort-max' };
  const builder = await isBuilder(db, player.id, character, nowS);
  const siegewright = await isSiegewright(db, player.id, character, nowS);
  const { marks, needs } = /** @type {{ marks: number, needs: any[] }} */ (fortNeeds(work, t, { builder }));
  if (await overRate(ctx, `seat-fort:${player.id}`, SEAT_EDICTS_HOUR, 3600)) return { error: 'seats-rate' };
  const g = hold.guild_id;
  const guild = await db.prepare('SELECT name, tag FROM guilds WHERE id = ?').bind(g).first();
  try {
    await db.batch([
      db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'guild', ?1, 'burn', NULL, 'fort', ?2, ?3, ?4, ?5, ?6, ?7
        WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) >= ?2
          AND EXISTS (SELECT 1 FROM town_seat_holds WHERE key = ?8 AND guild_id = ?1)
          AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?9 AND guild_id = ?1 AND rank IN (${SEAT_LEVER_RANKS.join(', ')}))`)
        .bind(g, marks, utcDay(nowS), nowS, player.id, w.name, `${rid}:fort`, key, Number(a.me.rid)),
      mustChange(db),
      db.prepare(`INSERT INTO town_seat_forts (key, work, tier, building, guild_id, builder, siegewright, stands_at, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?8, NULL, ?7)
        ON CONFLICT (key, work) DO UPDATE SET building = excluded.building, guild_id = excluded.guild_id, builder = excluded.builder, siegewright = excluded.siegewright, stands_at = NULL, at = excluded.at
        WHERE town_seat_forts.building IS NULL AND town_seat_forts.tier = ?3`).bind(key, work, t - 1, t, g, builder ? 1 : 0, nowS, siegewright ? 1 : 0),
      mustChange(db),
      historyRow(db, key, nowS, 'fort-begun', { guild: { name: guild?.name ?? '', tag: guild?.tag ?? '' }, work, tier: t }),
    ]);
  } catch {
    const has = Number((await db.prepare('SELECT balance FROM guild_marks WHERE guild_id = ?').bind(g).first())?.balance ?? 0);
    if (has < marks) return { error: 'seat-treasury' };
    return { error: 'fort-building' };
  }
  await supplyForts(db, key, nowS);
  return { ok: true, work, tier: t, marks, needs, builder, siegewright, forts: await fortsOf(db, key, nowS) };
}

export async function readForts({ db, nowS }, player, env, { key } = {}) {
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  return { ok: true, key, ...(await fortsOf(db, key, nowS)) };
}

// A capture, lapse, or void batch runs these first, so a project due by now is raised before the drop takes a tier.
export function fortsDueStatements(db, nowS, key = null) {
  const due = 'building IS NOT NULL AND stands_at IS NOT NULL AND stands_at <= ?1 AND (?3 IS NULL OR key = ?3)';
  return [
    db.prepare(`INSERT INTO town_seat_history (key, week, kind, data, at) SELECT key, ?2, 'fort-raised', json_object('work', work, 'tier', building), ?1
      FROM town_seat_forts WHERE ${due} ORDER BY key, work`).bind(nowS, weekAt(nowS), key),
    db.prepare(`DELETE FROM town_seat_fort_held WHERE EXISTS (SELECT 1 FROM town_seat_forts
      WHERE town_seat_forts.key = town_seat_fort_held.key AND town_seat_forts.work = town_seat_fort_held.work AND ${due})`).bind(nowS, null, key),
    db.prepare(`UPDATE town_seat_forts SET tier = building, building = NULL, stands_at = NULL, builder = 0, siegewright = 0 WHERE ${due}`).bind(nowS, null, key),
  ];
}
export function fortsCapturedStatements(db, key, { fortifier = false, nowS = null } = {}) {
  return [
    ...(nowS != null ? fortsDueStatements(db, nowS, key) : []),
    db.prepare(`INSERT INTO town_seat_stockpile (key, material, qty) SELECT key, material, qty FROM town_seat_fort_held WHERE key = ? AND qty > 0
      ON CONFLICT (key, material) DO UPDATE SET qty = town_seat_stockpile.qty + excluded.qty`).bind(key),
    db.prepare('DELETE FROM town_seat_fort_held WHERE key = ?').bind(key),
    db.prepare(`UPDATE town_seat_forts SET tier = CASE WHEN ?2 = 1 AND work = 'walls' THEN tier ELSE MAX(0, tier - 1) END,
      building = NULL, stands_at = NULL, builder = 0, siegewright = 0, guild_id = NULL WHERE key = ?1`).bind(key, fortifier ? 1 : 0),
  ];
}
// Runs after the batch's hold DELETE. Each fall requires the seat to be unheld, so a DELETE that moved nothing
// drops nothing.
export function fortsLapsedStatements(db, key, nowS) {
  const unheld = 'NOT EXISTS (SELECT 1 FROM town_seat_holds WHERE key = ?1)';
  return [
    ...fortsDueStatements(db, nowS, key),
    db.prepare(`INSERT INTO town_seat_stockpile (key, material, qty) SELECT key, material, qty FROM town_seat_fort_held WHERE key = ?1 AND qty > 0 AND ${unheld}
      ON CONFLICT (key, material) DO UPDATE SET qty = town_seat_stockpile.qty + excluded.qty`).bind(key),
    db.prepare(`DELETE FROM town_seat_fort_held WHERE key = ?1 AND ${unheld}`).bind(key),
    db.prepare(`UPDATE town_seat_forts SET building = NULL, stands_at = NULL, builder = 0, siegewright = 0, guild_id = NULL
      WHERE key = ?1 AND building IS NOT NULL AND ${unheld}`).bind(key),
  ];
}
export function fortsGuildFallStatements(db, key, guild) {
  const theirs = 'key = ?1 AND guild_id = ?2 AND building IS NOT NULL';
  return [
    db.prepare(`INSERT INTO town_seat_stockpile (key, material, qty) SELECT key, material, qty FROM town_seat_fort_held
      WHERE key = ?1 AND qty > 0 AND work IN (SELECT work FROM town_seat_forts WHERE ${theirs})
      ON CONFLICT (key, material) DO UPDATE SET qty = town_seat_stockpile.qty + excluded.qty`).bind(key, guild),
    db.prepare(`DELETE FROM town_seat_fort_held WHERE key = ?1 AND work IN (SELECT work FROM town_seat_forts WHERE ${theirs})`).bind(key, guild),
    db.prepare(`UPDATE town_seat_forts SET building = NULL, stands_at = NULL, builder = 0, siegewright = 0, guild_id = NULL WHERE ${theirs}`).bind(key, guild),
  ];
}
export function fortsRestoredStatements(db, key, guild, projects, held) {
  const out = [];
  for (const [work, building, builder, siegewright, standsAt, at] of projects) {
    const back = held.filter((h) => h[0] === work).map(([, m, n]) => [m, n]);
    const again = 'EXISTS (SELECT 1 FROM town_seat_forts WHERE key = ?1 AND work = ?2 AND building = ?3 AND guild_id = ?4 AND stands_at IS NULL)';
    out.push(db.prepare(`UPDATE town_seat_forts SET building = ?3, guild_id = ?4, builder = ?5, siegewright = ?6, stands_at = NULL, at = ?7
      WHERE key = ?1 AND work = ?2 AND building IS NULL AND tier = ?3 - 1`).bind(key, work, building, guild, builder ? 1 : 0, siegewright ? 1 : 0, at));
    for (const [material, n] of back) {
      out.push(
        // The insert runs before the stockpile update, so both read the same MIN of the stockpile.
        db.prepare(`INSERT INTO town_seat_fort_held (key, work, material, qty) SELECT ?1, ?2, ?5, MIN(?6, qty) FROM town_seat_stockpile
          WHERE key = ?1 AND material = ?5 AND qty > 0 AND ${again}
          ON CONFLICT (key, work, material) DO UPDATE SET qty = town_seat_fort_held.qty + excluded.qty`).bind(key, work, building, guild, material, n),
        db.prepare(`UPDATE town_seat_stockpile SET qty = qty - MIN(?6, qty) WHERE key = ?1 AND material = ?5 AND ${again}`).bind(key, work, building, guild, material, n),
      );
    }
    out.push(db.prepare(`UPDATE town_seat_forts SET stands_at = ?5 WHERE key = ?1 AND work = ?2 AND building = ?3 AND guild_id = ?4 AND stands_at IS NULL AND ?5 IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM json_each(?6) j WHERE COALESCE((SELECT h.qty FROM town_seat_fort_held h
        WHERE h.key = ?1 AND h.work = ?2 AND h.material = json_extract(j.value, '$[0]')), 0) < json_extract(j.value, '$[1]'))`)
      .bind(key, work, building, guild, standsAt, JSON.stringify(back)));
  }
  return out;
}
export async function fortifierAt(db, week, key, nowS, seasonWeek) {
  const walls = await fortTierAt(db, key, 'walls', nowS);
  if (walls <= 0) return null;
  if (await db.prepare('SELECT 1 FROM town_seat_fortifier WHERE season = ? AND key = ?').bind(seasonWeek, key).first()) return null;
  const { results = [] } = await db.prepare(`SELECT r.account, t.spec50, t.spec100, t.respec_rank, t.respec_to, t.respec_at FROM town_seat_rosters r
    JOIN prof_tracks t ON t.player = r.account AND t.char_id = r.char_id AND t.profession = '${trackOf('masonry')}'
    WHERE r.week = ? AND r.key = ? AND r.side = 'defend' ORDER BY r.at, r.account`).bind(week, key).all();
  for (const row of results) {
    const specs = specsAt({ ...row, respec_rank: row.respec_rank == null ? null : Number(row.respec_rank), respec_at: row.respec_at == null ? null : Number(row.respec_at) }, nowS);
    if (isFortifierSpec(specs)) return row.account;
  }
  return null;
}
export async function siegewrightAt(db, week, key, nowS) {
  const { results = [] } = await db.prepare(`SELECT r.account, t.spec50, t.spec100, t.respec_rank, t.respec_to, t.respec_at FROM town_seat_rosters r
    JOIN prof_tracks t ON t.player = r.account AND t.char_id = r.char_id AND t.profession = '${trackOf('carpentry')}'
    WHERE r.week = ? AND r.key = ? AND r.side = 'attack' ORDER BY r.at, r.account`).bind(week, key).all();
  for (const row of results) {
    const specs = specsAt({ ...row, respec_rank: row.respec_rank == null ? null : Number(row.respec_rank), respec_at: row.respec_at == null ? null : Number(row.respec_at) }, nowS);
    if (isSiegewrightSpec(specs)) return row.account;
  }
  return null;
}
export function fortsCaptureWithSave(db, key, { nowS, seasonWeek, fortifier = null, history }) {
  return [
    ...fortsCapturedStatements(db, key, { fortifier: !!fortifier, nowS }),
    ...(fortifier ? [
      db.prepare('INSERT OR IGNORE INTO town_seat_fortifier (season, key, account, at) VALUES (?, ?, ?, ?)').bind(seasonWeek, key, fortifier, nowS),
      history('walls-kept', {}),
    ] : []),
  ];
}
export async function campsSpent(db, week, next, rights, tierOf) {
  const { results = [] } = await db.prepare('SELECT key, guild_id, material, qty FROM town_seat_camps WHERE week = ? AND qty > 0').bind(week).all();
  if (!results.length) return [];
  const camps = new Map();
  for (const r of results) {
    const k = `${r.key}\n${r.guild_id}`;
    if (!camps.has(k)) camps.set(k, { key: Number(r.key), guild: r.guild_id, items: [] });
    camps.get(k).items.push([r.material, Number(r.qty)]);
  }
  const out = [];
  for (const c of camps.values()) {
    const won = (rights ?? []).some((r) => r.key === c.key && r.guild === c.guild);
    const gate = Number((await db.prepare("SELECT tier FROM town_seat_forts WHERE key = ? AND work = 'gatehouse'").bind(c.key).first())?.tier ?? 0);
    const { rams } = campSpent(c.items, { won, gated: tierOf(c.key) === 'crown' || gate >= 1 });
    if (rams > 0) out.push(db.prepare('UPDATE town_seat_battles SET rams = rams + ? WHERE week = ? AND key = ? AND attacker = ?').bind(rams, next, c.key, c.guild));
  }
  out.push(db.prepare('DELETE FROM town_seat_camps WHERE week = ?').bind(week));
  return out;
}
export const fortsSeasonStatements = (db) => {
  const lowered = 'EXISTS (SELECT 1 FROM town_seat_forts f WHERE f.key = town_seat_fort_held.key AND f.work = town_seat_fort_held.work AND f.tier > 0 AND f.building IS NOT NULL)';
  const wear = [db.prepare('UPDATE town_seat_forts SET tier = MAX(0, tier - 1) WHERE tier > 0')];
  const capSql = `CASE ${Object.entries(TITHE_CAP).flatMap(([t, c]) => Array.from({ length: fortMaxTier('market') + 1 }, (_, m) =>
    `WHEN town_seat_holds.tier = '${t}' AND COALESCE((SELECT f.tier FROM town_seat_forts f WHERE f.key = town_seat_holds.key AND f.work = 'market'), 0) = ${m} THEN ${marketHallTitheCap(c, m)}`)).join(' ')} END`;
  wear.push(db.prepare(`UPDATE town_seat_holds SET tithe = ${capSql} WHERE tithe > ${capSql}`));
  return [
    db.prepare(`INSERT INTO town_seat_stockpile (key, material, qty) SELECT key, material, qty FROM town_seat_fort_held WHERE qty > 0 AND ${lowered}
      ON CONFLICT (key, material) DO UPDATE SET qty = town_seat_stockpile.qty + excluded.qty`),
    db.prepare(`DELETE FROM town_seat_fort_held WHERE ${lowered}`),
    db.prepare('UPDATE town_seat_forts SET building = building - 1, stands_at = NULL WHERE tier > 0 AND building IS NOT NULL'),
    ...wear,
  ];
};
export const campsWorn = (db, next) => db.prepare(`UPDATE town_seat_battles SET rams = 0 WHERE week = ? AND rams > 0 AND tier <> 'crown'
  AND NOT EXISTS (SELECT 1 FROM town_seat_forts f WHERE f.key = town_seat_battles.key AND f.work = 'gatehouse' AND f.tier >= 1)`).bind(next);

const marketTierOf = async (db, key, nowS) => (await fortTiersOf(db, key, nowS)).market ?? 0;
export async function listingsCapAt(db, nowS, board) {
  if (!Array.isArray(board)) return MARKET_LISTINGS_MAX;
  if (!(await db.prepare("SELECT 1 FROM town_seat_forts WHERE work = 'market' AND tier > 0 LIMIT 1").first())) return MARKET_LISTINGS_MAX;
  const seat = [...(await confirmedSeats(db, nowS)).values()].find((x) => x.pixel?.[0] === board[0] && x.pixel?.[1] === board[1]);
  return seat ? marketHallListings(MARKET_LISTINGS_MAX, await marketTierOf(db, seat.key, nowS)) : MARKET_LISTINGS_MAX;
}
export const titheCapAt = async (db, key, tier, nowS) => marketHallTitheCap(TITHE_CAP[tier] ?? 0, await marketTierOf(db, key, nowS));
