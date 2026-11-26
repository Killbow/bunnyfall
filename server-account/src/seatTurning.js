// @ts-check
import { confirmedSeats, seatsOpenFor } from './townSeats.js';
import { gatherStandings, seatGuildsOf, agreedGateRegions, allIn, holdsRead, holdsFrom, battlesRead, battlesFrom } from './seatInfluence.js';
import { activeIn, edictsOf, edictsRead, edictsFrom } from './seatHolding.js';
import { redRead, redFrom } from './seatPolitics.js';
import { windowOf } from './seatBattles.js';
import { royalTurning } from './seatRoyal.js';
import { incursionStatements } from './seatIncursion.js';
import { fortsSeasonStatements, campsSpent, fortTiersOf, fortsLapsedStatements, campsWorn } from './seatForts.js';
import { shrineStanding, marketHallTitheCap } from '../../src/net/fortLaw.js';
import { weekSettled, keepWeekSettled } from './weekKept.js';
import { swordsSettled } from './seatSiege.js';
import { gameDayAt, gateTimes } from '../../src/net/gateLaw.js';
import { guildActorOf } from './guilds.js';
import { mustChange } from './realm.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { GUILD_RANK_MASTER } from '../../src/net/guildLaw.js';
import { seatWeekOf, seatWeekStartMs, seatKeyOk, turningPlan, seatGlyphsOf, seatTitleOf, SEAT_WEEK_MS, STANDING_START, placeBattles, atSiegeWindow, CROWN_SEAT_REGIONS, conscriptionDue,
  fealtyReckoning, fealtyTribute, TITHE_CAP, seasonEndingAt, seasonStanding, seasonTitles, seasonOf, seasonRibbons, keptWholeSeason } from '../../src/net/townSeatLaw.js';
import { tideAt } from '../../src/net/tideLaw.js';
import { MARKS_MAX } from '../../src/net/marksLaw.js';

export const SEASON_ZERO_WIPED = Object.freeze(['town_seat_holds', 'town_seat_legacy', 'town_seat_pledges', 'town_seat_binds', 'town_seat_influence',
  'town_seat_renown', 'town_seat_rights', 'town_seat_aftermath', 'town_seat_windows', 'town_seat_stockpile', 'town_seat_levies', 'town_seat_history',
  'guild_fealty', 'guild_pacts',
  'town_seat_forts', 'town_seat_fort_held', 'town_seat_fortifier', 'town_seat_camps']);
export const SEASON_ZERO_KEPT = Object.freeze({ town_seat_history: "kind = 'strike'" });

export const SETTLE_WEEKS_MAX = 8;
export const INFLUENCE_KEPT_WEEKS = 4;

const weekAt = (nowS) => seatWeekOf(nowS * 1000);
const turningOf = (week) => Math.floor((seatWeekStartMs(week) + SEAT_WEEK_MS) / 1000);

async function namesOf(db, ids) {
  const list = [...new Set(ids)].filter(Boolean);
  if (!list.length) return new Map();
  const results = await allIn(db, list, (qs) => `SELECT id, name, tag FROM guilds WHERE id IN (${qs})`);
  return new Map(results.map((g) => [g.id, { name: g.name, tag: g.tag }]));
}

/** @param {any} db @param {number} week @param {number} nowS @param {number|null} [zero] */
export async function settleWeek(db, week, nowS, zero = null) {
  if (await db.prepare('SELECT 1 FROM town_seat_weeks WHERE week = ?').bind(week).first()) return { settled: false };
  const atS = turningOf(week);
  const registry = await confirmedSeats(db, nowS, { fresh: true });
  const { results: pledgedKeys = [] } = await db.prepare('SELECT DISTINCT key FROM town_seat_pledges WHERE week = ?').bind(week).all();
  const { results: holdRows = [] } = await db.prepare('SELECT key, guild_id, region, tier, standing, truce_week, tithe, owed, since_week FROM town_seat_holds').all();
  const holds = new Map(holdRows.map((h) => [Number(h.key), h]));
  const keys = [...new Set([...pledgedKeys.map((p) => Number(p.key)), ...holds.keys()])].filter((k) => registry.has(k)).sort((a, b) => a - b);
  const unregistered = holdRows.filter((h) => !registry.has(Number(h.key)));
  const { results: legacyRows = [] } = await db.prepare('SELECT key, guild_id, amount FROM town_seat_legacy WHERE week = ?').bind(week).all();
  const legacyOf = new Map(legacyRows.map((l) => [`${l.key}\n${l.guild_id}`, Number(l.amount)]));
  const next = week + 1;
  const fromS = Math.floor(seatWeekStartMs(week) / 1000);
  const days = [];
  for (let d = gameDayAt(fromS * 1000); d <= gameDayAt(atS * 1000); d++) { const r = gateTimes(d).riseAt / 1000; if (r >= fromS && r < atS) days.push(d); }
  const gatesIn = new Map();
  const agreed = await agreedGateRegions(db, days);
  for (const region of agreed.values()) gatesIn.set(region, (gatesIn.get(region) ?? 0) + 1);
  const { results: proclaimed = [] } = await db.prepare("SELECT key, edict, guild_id, set_aside FROM town_seat_edicts WHERE week = ? AND state = 'proclaimed'").bind(next).all();
  const { results: afterRows = [] } = await db.prepare('SELECT key, guild_id, what FROM town_seat_aftermath WHERE week = ?').bind(week).all();
  const aftermath = (key, what) => afterRows.filter((r) => Number(r.key) === key && r.what === what).map((r) => r.guild_id);
  const { results: unfought = [] } = await db.prepare(`SELECT b.key, b.kind, b.attacker, b.defender, b.state, r.total, r.defence, EXISTS (SELECT 1 FROM guilds g WHERE g.id = b.attacker) AS standing
    FROM town_seat_battles b LEFT JOIN town_seat_rights r ON r.week = b.week AND r.key = b.key AND r.kind = b.kind
    WHERE b.week = ? AND b.state IN ('scheduled', 'void') AND NOT EXISTS (SELECT 1 FROM town_seat_results x WHERE x.week = b.week AND x.key = b.key) ORDER BY b.key`).bind(week).all();
  const carriedAt = new Map(unfought.filter((u) => u.state === 'scheduled' && u.kind === 'siege' && Number(u.standing) && holds.get(Number(u.key))?.guild_id === u.defender)
    .map((u) => [Number(u.key), { guild: u.attacker, total: Number(u.total ?? 0), defence: Number(u.defence ?? 0) }]));
  const revolted = new Set(unfought.filter((u) => u.state === 'scheduled' && u.kind === 'revolt' && u.defender === holds.get(Number(u.key))?.guild_id).map((u) => Number(u.key)));
  const charters = holdRows.map((h) => ({ key: Number(h.key), guild: h.guild_id, tier: h.tier, region: Number(h.region) }));
  const chartersOf = (g) => charters.filter((h) => h.guild === g);
  const { results: fealtyRows = [] } = await db.prepare("SELECT vassal, liege, state, broken_by FROM guild_fealty WHERE state IN ('sworn', 'breaking')").all();
  const reckoned = fealtyReckoning(fealtyRows, charters);
  const { fealties, breakers } = reckoned;
  const conscriptions = [];
  const ruling = [...(await edictsOf(db, week))].filter(([key, e]) => e.edict === 'conscription' && holds.get(key)?.guild_id === e.guild && holds.get(key)?.tier === 'crown');
  let tithes = new Map();
  if (ruling.length || fealties.length) {
    // The day bound lets idx_marks_day serve the walk; at alone has no index.
    const { results: titheRows = [] } = await db.prepare(`SELECT dst_id, SUM(amount) AS n FROM marks_ledger
      WHERE day BETWEEN ? AND ? AND dst_kind = 'guild' AND kind = 'tithe' AND at >= ? AND at < ? GROUP BY dst_id`)
      .bind(utcDay(fromS), utcDay(atS), fromS, atS).all();
    tithes = new Map(titheRows.map((t) => [t.dst_id, Number(t.n)]));
  }
  for (const [key, e] of ruling) {
    const vassals = new Set(fealties.filter((f) => f.liege === e.guild).map((f) => f.vassal));
    for (const d of conscriptionDue({ kingdom: CROWN_SEAT_REGIONS[Number(holds.get(key).region)], crownGuild: e.guild, holds: charters, tithes, vassals })) {
      if (d.amount > 0) conscriptions.push({ crownKey: key, crown: e.guild, ...d });
    }
  }
  const conscripted = new Set(conscriptions.flatMap((c) => c.keys));
  const counted = !!seasonOf(week, zero);
  const seats = [];
  for (const key of keys) {
    const seat = registry.get(key);
    const at = await seatGuildsOf(db, key, week);
    const list = await gatherStandings(db, seat, week, atS, counted);
    const h = holds.get(key);
    let holder = null;
    if (h) {
      const watched = await db.prepare("SELECT 1 FROM town_seat_influence WHERE week = ? AND key = ? AND guild_id = ? AND source = 'watch' LIMIT 1").bind(week, key, h.guild_id).first();
      const writs = await db.prepare("SELECT COUNT(*) AS n FROM guild_writs WHERE guild_id = ? AND region = ? AND state = 'filled' AND closed_at >= ? AND closed_at < ?")
        .bind(h.guild_id, Number(h.region), fromS, atS).first();
      const e = proclaimed.find((x) => Number(x.key) === key && x.guild_id === h.guild_id) ?? null;
      holder = {
        guild: h.guild_id, standing: Number(h.standing), truceWeek: h.truce_week == null ? null : Number(h.truce_week),
        tithe: Number(h.tithe), owed: Number(h.owed), watched: !!watched, gates: gatesIn.get(Number(h.region)) ?? 0, writs: Number(writs?.n ?? 0),
        edict: e?.edict ?? null, setAside: Number(e?.set_aside ?? 0), bonus: aftermath(key, 'bonus').includes(h.guild_id),
        conscripted: conscripted.has(key),
        liegeReach: reckoned.liegeReach(h.guild_id, registry.get(key)),
        brokeFealty: breakers.has(h.guild_id),
        tide: tideAt(week, seat.region, counted), tideNext: tideAt(next, seat.region, !!seasonOf(next, zero)),
        ...(await (async () => { const f = await fortTiersOf(db, key, atS); return { shrine: shrineStanding(f.shrine ?? 0), titheCap: marketHallTitheCap(TITHE_CAP[h.tier] ?? 0, f.market ?? 0) }; })()),
        revolted: revolted.has(key),
      };
    }
    seats.push({
      key, tier: seat.tier, holder, barred: aftermath(key, 'barred'), carried: carriedAt.get(key) ?? null,
      guilds: list.map((s) => ({ guild: s.guild, influence: s.total, legacy: legacyOf.get(`${key}\n${s.guild}`) ?? 0, pledgedAt: at.get(s.guild) ?? atS })),
    });
  }
  const guildIds = [...new Set(seats.flatMap((s) => s.guilds.map((g) => g.guild)))];
  const purseIds = [...new Set([...guildIds, ...holdRows.map((h) => h.guild_id)])];
  const purses = await allIn(db, purseIds, (qs) => `SELECT guild_id, balance FROM guild_marks WHERE guild_id IN (${qs})`);
  const reckonedPlan = turningPlan({ week, seats, treasuries: new Map(purses.map((p) => [p.guild_id, Number(p.balance)])), active: await activeIn(db, week) });
  const ending = seasonEndingAt(week, zero);
  const wipe = ending?.n === 0;
  const plan = wipe ? { ...reckonedPlan, claims: [], contested: [], rights: [], edicts: [], standings: [], held: [], legacy: [], revolts: [] }
    : ending ? { ...reckonedPlan, revolts: [] } : reckonedPlan;
  const names = await namesOf(db, [...purseIds, ...fealties.flatMap((f) => [f.vassal, f.liege]), ...unfought.flatMap((u) => [u.attacker, u.defender])]);
  const history = (key, kind, data) => db.prepare('INSERT INTO town_seat_history (key, week, kind, data, at) VALUES (?, ?, ?, ?, ?)')
    .bind(key, week, kind, JSON.stringify(data), nowS);
  const paidHistory = (key, kind, data, rid) => db.prepare(`INSERT INTO town_seat_history (key, week, kind, data, at)
    SELECT ?1, ?2, ?3, json_set(?4, '$.marks', amount), ?5 FROM marks_ledger WHERE actor = 'seats' AND rid = ?6`).bind(key, week, kind, JSON.stringify(data), nowS, rid);
  // A plain INSERT of the week's key goes first, so a second settler fails on the key and its whole
  // batch rolls back.
  const stmts = [db.prepare('INSERT INTO town_seat_weeks (week, settled_at) VALUES (?, ?)').bind(week, nowS)];
  for (const w of plan.standings) stmts.push(history(w.key, 'standing', { guild: w.guild, was: Number(holds.get(Number(w.key))?.standing ?? w.standing), standing: ending ? seasonStanding(w.standing) : w.standing }));
  for (const c of plan.claims) {
    stmts.push(db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'guild', ?1, 'burn', NULL, 'seat-claim', ?2, ?3, ?4, 'seats', 'The Turning', ?5
      WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) >= ?2 AND NOT EXISTS (SELECT 1 FROM town_seat_holds WHERE key = ?6)`)
      .bind(c.guild, c.fee, utcDay(nowS), nowS, `claim-${week}-${c.key}`, c.key), mustChange(db));
    stmts.push(db.prepare('INSERT INTO town_seat_holds (key, guild_id, region, tier, since_week, standing, truce_week, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.key, c.guild, registry.get(c.key).region, registry.get(c.key).tier, next, STANDING_START, next, nowS));
    stmts.push(history(c.key, 'claim', { guild: names.get(c.guild), total: c.total, fee: c.fee }));
  }
  for (const c of plan.contested) {
    stmts.push(db.prepare("INSERT INTO town_seat_rights (week, key, kind, guild_id, against, total, defence, at) VALUES (?, ?, 'tourney', ?, ?, 0, 0, ?)")
      .bind(next, c.key, c.a, c.b, nowS));
    stmts.push(history(c.key, 'contested', { a: names.get(c.a), b: names.get(c.b) }));
  }
  for (const r of plan.rights) {
    const holder = holds.get(r.key).guild_id;
    stmts.push(db.prepare("INSERT INTO town_seat_rights (week, key, kind, guild_id, against, total, defence, at) VALUES (?, ?, 'siege', ?, ?, ?, ?, ?)")
      .bind(next, r.key, r.guild, holder, r.total, r.defence, nowS));
    if (!r.carried) stmts.push(history(r.key, 'right', { guild: names.get(r.guild), holder: names.get(holder), total: r.total, defence: r.defence }));
  }
  const battles = [
    ...plan.contested.map((c) => ({ key: c.key, kind: 'tourney', attacker: c.a, defender: c.b })),
    ...plan.rights.map((r) => ({ key: r.key, kind: 'siege', attacker: r.guild, defender: holds.get(r.key).guild_id })),
    ...plan.revolts.map((r) => ({ key: r.key, kind: 'revolt', attacker: '', defender: r.guild })),
  ];
  for (const b of battles) {
    const seat = registry.get(b.key);
    Object.assign(b, { tier: seat.tier, kingdom: CROWN_SEAT_REGIONS[seat.region] ?? null, window: atSiegeWindow(b) ? await windowOf(db, b.key, b.defender) : null });
  }
  for (const r of plan.revolts) stmts.push(history(r.key, 'revolt', { guild: names.get(r.guild) }));
  const schedule = placeBattles(next, battles);
  for (const p of schedule.placed) {
    stmts.push(db.prepare('INSERT INTO town_seat_battles (week, key, kind, tier, attacker, defender, starts_at, ends_at, moved, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(next, p.key, p.kind, p.tier, p.attacker, p.defender, Math.floor(p.startsAt / 1000), Math.floor(p.endsAt / 1000), p.moved ? 1 : 0, nowS));
    if (p.moved) stmts.push(history(p.key, 'battle-moved', { at: Math.floor(p.startsAt / 1000) }));
  }
  for (const u of schedule.unplaced) stmts.push(history(u.key, 'battle-void', { kind: u.kind }));
  stmts.push(...(await campsSpent(db, week, next, plan.rights, (k) => registry.get(k)?.tier ?? 'palace')));
  const burn = (guild, kind, amount, rid) => db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
    SELECT 'guild', ?1, 'burn', NULL, ?2, ?3, ?4, ?5, 'seats', 'The Turning', ?6 WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) >= ?3`)
    .bind(guild, kind, amount, utcDay(nowS), nowS, rid);
  for (const u of plan.upkeep) {
    if (u.state === 'paid' || u.state === 'late') {
      if (u.paid > 0) stmts.push(burn(u.guild, 'seat-upkeep', u.paid, `upkeep-${week}-${u.key}`), mustChange(db));
      stmts.push(db.prepare('UPDATE town_seat_holds SET owed = 0 WHERE key = ? AND guild_id = ?').bind(u.key, u.guild));
      if (u.state === 'late') stmts.push(history(u.key, 'late', { guild: names.get(u.guild), paid: u.paid }));
    } else if (u.state === 'neglect') {
      stmts.push(db.prepare('UPDATE town_seat_holds SET owed = ? WHERE key = ? AND guild_id = ?').bind(u.owed, u.key, u.guild));
      stmts.push(history(u.key, 'neglect', { guild: names.get(u.guild), owed: u.owed }));
    } else {
      stmts.push(db.prepare('DELETE FROM town_seat_holds WHERE key = ? AND guild_id = ?').bind(u.key, u.guild));
      stmts.push(...fortsLapsedStatements(db, u.key, atS));
      stmts.push(db.prepare("UPDATE town_seat_edicts SET state = 'void' WHERE key = ? AND week = ? AND state = 'proclaimed'").bind(u.key, next));
      stmts.push(history(u.key, u.state === 'revolt' ? 'revolt-stood' : 'lapse', { guild: names.get(u.guild) }));
    }
  }
  const askedAside = (e) => Number(proclaimed.find((x) => Number(x.key) === e.key && x.guild_id === e.guild)?.set_aside ?? 0);
  for (const e of plan.edicts) {
    if (e.state === 'law') {
      if (e.cost > 0) {
        const held = e.edict === 'bounty' ? 'bounty' : e.edict === 'royal-tourney' ? 'royal' : null;
        stmts.push(held
          ? db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
              SELECT 'guild', ?1, 'escrow', ?2, ?6, ?3, ?4, ?5, 'seats', 'The Turning', ?2
              WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) >= ?3`).bind(e.guild, `${held}:${e.key}:${next}`, e.cost, utcDay(nowS), nowS, `${held}-escrow`)
          : burn(e.guild, 'seat-edict', e.cost, `edict-${next}-${e.key}`), mustChange(db));
      }
      // Matching the edict and set-aside as read means a re-proclaim racing the settle rolls it back whole.
      stmts.push(db.prepare("UPDATE town_seat_edicts SET state = 'law', cost = ? WHERE key = ? AND week = ? AND guild_id = ? AND state = 'proclaimed' AND edict = ? AND set_aside = ?")
        .bind(e.cost, e.key, next, e.guild, e.edict, askedAside(e)), mustChange(db));
      stmts.push(history(e.key, 'edict', { guild: names.get(e.guild), edict: e.edict }));
    } else {
      stmts.push(db.prepare("UPDATE town_seat_edicts SET state = 'unpaid' WHERE key = ? AND week = ? AND guild_id = ? AND state = 'proclaimed' AND edict = ? AND set_aside = ?")
        .bind(e.key, next, e.guild, e.edict, askedAside(e)), mustChange(db));
      stmts.push(history(e.key, 'edict-unpaid', { guild: names.get(e.guild), edict: e.edict }));
    }
  }
  for (const [key, b] of await edictsOf(db, week)) {
    if (b.edict !== 'bounty') continue;
    // Burnt where the guild is gone or its treasury is full, so this statement never fails and the
    // Turning is never held back.
    const home = `EXISTS (SELECT 1 FROM guilds WHERE id = e.guild_id) AND COALESCE((SELECT balance FROM guild_marks WHERE guild_id = e.guild_id), 0) + e.set_aside - e.spent <= ${MARKS_MAX}`;
    stmts.push(db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'escrow', ?1, CASE WHEN ${home} THEN 'guild' ELSE 'burn' END, CASE WHEN ${home} THEN e.guild_id END, 'bounty-return', e.set_aside - e.spent, ?2, ?3, 'seats', 'The Turning', ?1 || ':return'
      FROM town_seat_edicts e WHERE e.key = ?4 AND e.week = ?5 AND e.state = 'law' AND e.set_aside > e.spent`)
      .bind(`bounty:${key}:${week}`, utcDay(nowS), nowS, key, week));
    stmts.push(db.prepare("UPDATE town_seat_edicts SET state = 'returned' WHERE key = ? AND week = ? AND state = 'law'").bind(key, week));
  }
  for (const c of conscriptions) {
    const to = `COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?2), 0) + MIN(?3, balance) <= ${MARKS_MAX} AND EXISTS (SELECT 1 FROM guilds WHERE id = ?2)`;
    stmts.push(db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'guild', ?1, CASE WHEN ${to} THEN 'guild' ELSE 'burn' END, CASE WHEN ${to} THEN ?2 END, 'conscription', MIN(?3, balance), ?4, ?5, 'seats', 'The Turning', ?6
      FROM guild_marks WHERE guild_id = ?1 AND balance > 0`)
      .bind(c.guild, c.crown, c.amount, utcDay(nowS), nowS, `conscription-${week}-${c.crownKey}-${c.guild}`));
    const rid = `conscription-${week}-${c.crownKey}-${c.guild}`;
    stmts.push(paidHistory(c.crownKey, 'conscription', { guild: names.get(c.crown), from: names.get(c.guild) }, rid));
    for (const k of c.keys) stmts.push(paidHistory(k, 'conscripted', { guild: names.get(c.guild), crown: names.get(c.crown) }, rid));
  }
  const crownKeyOf = (g) => chartersOf(g).find((h) => h.tier === 'crown')?.key ?? null;
  for (const f of fealties) {
    const both = [crownKeyOf(f.liege), ...chartersOf(f.vassal).map((h) => h.key)].filter((k) => k != null);
    const owed = f.fits ? fealtyTribute(tithes.get(f.vassal) ?? 0) : 0;
    if (owed > 0) {
      const to = `COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?2), 0) + MIN(?3, balance) <= ${MARKS_MAX} AND EXISTS (SELECT 1 FROM guilds WHERE id = ?2)`;
      stmts.push(db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'guild', ?1, CASE WHEN ${to} THEN 'guild' ELSE 'burn' END, CASE WHEN ${to} THEN ?2 END, 'fealty-tribute', MIN(?3, balance), ?4, ?5, 'seats', 'The Turning', ?6
        FROM guild_marks WHERE guild_id = ?1 AND balance > 0`).bind(f.vassal, f.liege, owed, utcDay(nowS), nowS, `fealty-${week}-${f.vassal}`));
      const k = crownKeyOf(f.liege);
      if (k != null) stmts.push(paidHistory(k, 'fealty-tribute', { vassal: names.get(f.vassal), liege: names.get(f.liege) }, `fealty-${week}-${f.vassal}`));
    }
    if (f.broken || !f.fits) {
      stmts.push(db.prepare('DELETE FROM guild_fealty WHERE vassal = ? AND liege = ?').bind(f.vassal, f.liege));
      for (const k of both) stmts.push(history(k, f.broken ? 'fealty-broken' : 'fealty-lapsed', { vassal: names.get(f.vassal), liege: names.get(f.liege), ...(f.broken ? { breaker: names.get(f.broken) } : {}) }));
    }
  }
  stmts.push(...(await royalTurning(db, week, nowS, history, registry)));
  stmts.push(...incursionStatements(db, { week, agreed, counted, nowS }));
  for (const w of plan.standings) {
    stmts.push(db.prepare('UPDATE town_seat_holds SET standing = ? WHERE key = ? AND guild_id = ?').bind(ending ? seasonStanding(w.standing) : w.standing, w.key, w.guild));
  }
  for (const h of plan.held) {
    stmts.push(history(h.key, 'held', { guild: names.get(h.guild), standing: h.standing }));
  }
  for (const l of ending ? [] : plan.legacy) {
    stmts.push(db.prepare('INSERT INTO town_seat_legacy (week, key, guild_id, amount) VALUES (?, ?, ?, ?)').bind(next, l.key, l.guild, l.amount));
  }
  for (const h of unregistered) {
    stmts.push(db.prepare('DELETE FROM town_seat_holds WHERE key = ? AND guild_id = ?').bind(Number(h.key), h.guild_id));
    stmts.push(...fortsLapsedStatements(db, Number(h.key), atS));
    stmts.push(db.prepare("UPDATE town_seat_edicts SET state = 'void' WHERE key = ? AND week = ? AND state = 'proclaimed'").bind(Number(h.key), next));
    stmts.push(history(Number(h.key), 'unregistered', { guild: names.get(h.guild_id) ?? { name: '', tag: '' } }));
  }
  const nameOr = (g) => names.get(g) ?? { name: '', tag: '' };
  // Runs after every payment above, so the escrow it sends home changes none of the treasuries they read.
  for (const u of unfought) {
    const key = Number(u.key);
    if (u.state === 'scheduled') {
      stmts.push(db.prepare(`UPDATE town_seat_battles SET state = 'void' WHERE week = ?1 AND key = ?2 AND state = 'scheduled'
        AND NOT EXISTS (SELECT 1 FROM town_seat_results WHERE week = ?1 AND key = ?2)`).bind(week, key), mustChange(db));
      const carried = plan.rights.some((r) => r.key === key && r.carried);
      if (u.kind !== 'revolt') stmts.push(history(key, 'siege-void', { battle: u.kind, guild: nameOr(u.attacker), holder: nameOr(u.defender), carried }));
    }
    stmts.push(...(await swordsSettled(db, week, key, nowS, { voided: true })));
  }
  // Weeks settle oldest first, so a service catching up keeps every week it has yet to settle.
  stmts.push(db.prepare('DELETE FROM town_seat_influence WHERE week <= ?').bind(week - INFLUENCE_KEPT_WEEKS));
  stmts.push(db.prepare('DELETE FROM town_seat_renown WHERE week <= ?').bind(week - INFLUENCE_KEPT_WEEKS));
  if (ending) {
    const lapsed = new Set([...plan.upkeep.filter((u) => u.state === 'lapse' || u.state === 'revolt').map((u) => u.key), ...unregistered.map((h) => Number(h.key))]);
    const stood = holdRows.filter((h) => !lapsed.has(Number(h.key))).map((h) => ({ key: Number(h.key), guild: h.guild_id, tier: h.tier, since: Number(h.since_week) }));
    const titles = seasonTitles(ending, stood);
    const masters = await guildmastersOf(db, [...new Set(titles.map((t) => t.guild))]);
    for (const t of titles) {
      if (masters.has(t.guild)) stmts.push(db.prepare('INSERT OR IGNORE INTO town_seat_titles (account, title, key, week, at) VALUES (?, ?, ?, ?, ?)').bind(masters.get(t.guild), t.title, t.key, week, nowS));
    }
    for (const g of seasonRibbons(titles)) stmts.push(db.prepare('INSERT OR IGNORE INTO town_seat_ribbons (season, guild_id, at) VALUES (?, ?, ?)').bind(ending.n, g, atS));
    for (const h of stood) stmts.push(history(h.key, 'season-end', { guild: names.get(h.guild), season: ending.n, kept: keptWholeSeason(ending, h.since) }));
    if (!wipe) stmts.push(...fortsSeasonStatements(db));
    if (!wipe) stmts.push(campsWorn(db, next));
  }
  if (wipe) {
    stmts.push(db.prepare("UPDATE town_seat_edicts SET state = 'void' WHERE week = ? AND state = 'proclaimed'").bind(next));
    for (const t of SEASON_ZERO_WIPED) stmts.push(db.prepare(`DELETE FROM ${t}${SEASON_ZERO_KEPT[t] ? ` WHERE NOT (${SEASON_ZERO_KEPT[t]})` : ''}`));
  }
  // failed means the batch rolled back for its own reason, not a racing settler's key, so settleDue
  // stops there.
  try { await db.batch(stmts); } catch { return { settled: false, failed: !(await db.prepare('SELECT 1 FROM town_seat_weeks WHERE week = ?').bind(week).first()) }; }
  return { settled: true, plan, season: ending };
}

async function guildmastersOf(db, guilds) {
  if (!guilds.length) return new Map();
  const results = await allIn(db, guilds, (qs) => `SELECT guild_id, player FROM guild_members WHERE rank = ? AND guild_id IN (${qs})`, [GUILD_RANK_MASTER]);
  return new Map(results.map((r) => [r.guild_id, r.player]));
}

export async function seatsBoard(db, seats, nowS) {
  const week = weekAt(nowS);
  const fortsRead = db.prepare(`SELECT key, work, CASE WHEN building IS NOT NULL AND stands_at IS NOT NULL AND stands_at <= ?1
    THEN building ELSE tier END AS t FROM town_seat_forts WHERE tier > 0 OR (building IS NOT NULL AND stands_at IS NOT NULL AND stands_at <= ?1)`).bind(nowS);
  const [heldRes, rightsRes, revoltsRes, edictsRes, fortsRes, redRes] = await db.batch([holdsRead(db), ...battlesRead(db, week), edictsRead(db, week), fortsRead, redRead(db, nowS)]);
  const holds = holdsFrom(heldRes?.results), battles = battlesFrom(rightsRes?.results, revoltsRes?.results), edicts = edictsFrom(edictsRes?.results);
  const forts = new Map();
  for (const r of fortsRes?.results ?? []) if (Number(r.t) > 0) { const k = Number(r.key); forts.set(k, { ...(forts.get(k) ?? {}), [r.work]: Number(r.t) }); }
  return { red: redFrom(redRes?.results), seats: seats.map((s) => {
    const h = holds.get(s.key) ?? null;
    const e = edicts.get(s.key);
    return { ...s, holder: h ? { ...h, edict: e && e.guild === h.guild.id ? e.edict : null } : null, battle: battles.get(s.key) ?? null, ...(forts.has(s.key) ? { forts: forts.get(s.key) } : {}) };
  }) };
}

/** @param {any} db @param {number} nowS @param {number|null} [zero] */
export async function settleDue(db, nowS, zero = null) {
  const current = weekAt(nowS);
  const last = (await db.prepare('SELECT MAX(week) AS w FROM town_seat_weeks').first())?.w;
  const from = Math.max(last == null ? current - 1 : Number(last) + 1, current - SETTLE_WEEKS_MAX);
  let n = 0;
  for (let w = from; w < current; w++) {
    const r = await settleWeek(db, w, nowS, zero);
    if (r.settled) n++;
    // A failed week must settle first: the next read starts after the last settled week, so a later
    // one would skip it for good.
    else if (r.failed) break;
  }
  return n;
}

export const SETTLE_LEASE_S = 60;
/** @param {any} db @param {number} nowS @param {number|null} [zero] */
export async function settleDueOnce(db, nowS, zero = null) {
  if (weekSettled(db, 'seats', weekAt(nowS))) return { settled: 0, pending: false };
  const last = (await db.prepare('SELECT MAX(week) AS w FROM town_seat_weeks').first())?.w;
  if (last != null && Number(last) + 1 >= weekAt(nowS)) { keepWeekSettled(db, 'seats', weekAt(nowS)); return { settled: 0, pending: false }; }
  // A held lease is read, never inserted again, so callers waiting on a settle queue no writes.
  const held = await db.prepare('SELECT until FROM town_seat_settling WHERE id = 1').first();
  if (held && Number(held.until) > nowS) return { settled: 0, pending: true };
  const holder = crypto.randomUUID();
  const took = await db.prepare(`INSERT INTO town_seat_settling (id, holder, until) VALUES (1, ?1, ?2)
    ON CONFLICT (id) DO UPDATE SET holder = ?1, until = ?2 WHERE until <= ?3`).bind(holder, nowS + SETTLE_LEASE_S, nowS).run();
  if (!Number(took?.meta?.changes)) return { settled: 0, pending: true };
  try {
    return { settled: await settleDue(db, nowS, zero), pending: false };
  } finally {
    // A failed release frees itself when the lease runs out after SETTLE_LEASE_S.
    try { await db.prepare('DELETE FROM town_seat_settling WHERE id = 1 AND holder = ?').bind(holder).run(); } catch { }
  }
}

/** @param {{db: any, nowS: number}} ctx */
export async function relinquishSeat({ db, nowS }, player, env, { character, key } = {}) {
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (Number(a.me.rank) !== GUILD_RANK_MASTER) return { error: 'guild-rank' };
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  const names = await namesOf(db, [a.me.guild_id]);
  const [gone] = await db.batch([
    db.prepare(`DELETE FROM town_seat_holds WHERE key = ?1 AND guild_id = ?2
      AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?3 AND guild_id = ?2 AND rank = ?4)`).bind(key, a.me.guild_id, Number(a.me.rid), GUILD_RANK_MASTER),
    db.prepare(`INSERT INTO town_seat_history (key, week, kind, data, at) SELECT ?1, ?2, 'relinquish', ?3, ?4 WHERE changes() > 0`)
      .bind(key, weekAt(nowS), JSON.stringify({ guild: names.get(a.me.guild_id) }), nowS),
    ...fortsLapsedStatements(db, key, nowS),
  ]);
  return gone?.meta?.changes ? { ok: true } : { error: 'seat-not-held' };
}

export async function seatBadgeOf(db, playerId, character, season = 0, member = undefined) {
  const m = member !== undefined ? member : typeof character === 'string'
    ? await db.prepare('SELECT guild_id, rank FROM guild_members WHERE player = ? AND char_id = ?').bind(playerId, character).first() : null;
  if (!m) return { glyphs: [], title: null, ts: null };
  const { results = [] } = await db.prepare('SELECT key, tier, region FROM town_seat_holds WHERE guild_id = ? ORDER BY key').bind(m.guild_id).all();
  const holds = results.map((h) => ({ key: Number(h.key), tier: h.tier, region: Number(h.region) }));
  const t = Number(m.rank) === GUILD_RANK_MASTER ? seatTitleOf(holds, season) : null;
  return { glyphs: seatGlyphsOf(holds), title: t?.title ?? null, ts: t?.ts ?? null };
}
export async function seatTitlesOf(db, playerId) {
  const { results = [] } = await db.prepare(`SELECT h.key, h.tier, h.region FROM town_seat_holds h
    JOIN guild_members m ON m.guild_id = h.guild_id WHERE m.player = ? AND m.rank = ?`).bind(playerId, GUILD_RANK_MASTER).all();
  const out = new Set(results.map((h) => (h.tier === 'crown' ? 'protector' : 'warden')));
  const { results: kept = [] } = await db.prepare('SELECT DISTINCT title FROM town_seat_titles WHERE account = ?').bind(playerId).all();
  for (const k of kept) out.add(k.title);
  return ['warden', 'protector', 'crowned', 'keeper', 'champion'].filter((t) => out.has(t));
}
