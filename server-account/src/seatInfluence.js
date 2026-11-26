// @ts-check
import { accountKind, displayName, overRate } from './accounts.js';
import { guildActorOf } from './guilds.js';
import { heraldryOfRow } from './halls.js';
import { mustChange } from './realm.js';
import { seatsOpenFor, confirmedSeats } from './townSeats.js';
import { marksOpenFor } from './marks.js';
import { verifyWatchReceipt } from '../../src/net/watchReceipt.js';
import { gateTimes, gameDayAt } from '../../src/net/gateLaw.js';
import { shrineGateInfluence, towersSee } from '../../src/net/fortLaw.js';
import { fortTierAt } from './seatForts.js';
import { MARKS_RID_RE, utcDay } from '../../src/net/marksLaw.js';
import { RENOWN_XP_REPORT_MAX } from '../../src/net/renown.js';
import {
  seatWeekOf, seatWeekStartMs, seatPhaseOf, seatRegionOk, seatKeyOk, seatMay, SEAT_POWERS, SEAT_PLEDGE_REGIONS_MAX, SEAT_MEMBER_WAIT_S,
  SEAT_PLEDGES_HOUR, SEAT_WATCH_CLAIM_MAX, WATCH_DAY_CAP, GATE_INFLUENCE, GATE_REGION_AGREE, HOMES_SEAT_MAX, TRIBUTE_MARKS_PER_INFLUENCE,
  GATE_WEEK_RECEIPTS, RENOWN_WEEK_XP,
  HUNT_INFLUENCE, HUNT_WEEK_CAP,
  SEAT_WEEK_MS, SEAT_RECKONING_MS,
  accountSeatInfluence, guildSeatInfluence, tributeRoom, homeDaysIn, seatDefence, SEAT_CHRONICLE_SHOWN,
  overreachOf, unrestInfluence, crownsHeld, seatReach, withReach, FREE_LAND_WATCH_BONUS, pledgeBarred, fealtyKingdom, seasonOf, seasonZeroOf, bountySitePixel, HALL_OF_RECORDS_ROWS,
} from '../../src/net/townSeatLaw.js';
import { isFreeLand } from '../../src/net/kingdomLaw.js';
import { holdingOf } from './seatHolding.js';
import { fightOf } from './seatBattles.js';
import { royalView } from './seatRoyal.js';
import { bansOf, politicsOf } from './seatPolitics.js';
import { tideAt, TIDE_EFFECTS } from '../../src/net/tideLaw.js';
import { tideNow } from './tides.js';

const weekAt = (nowS) => seatWeekOf(nowS * 1000);
const seasoned = (m, nowS) => Number(m.joined_at) <= nowS - SEAT_MEMBER_WAIT_S;
const ranksSql = (power) => SEAT_POWERS[power].join(', ');

async function boundTo(db, week, account) {
  return (await db.prepare('SELECT guild_id FROM town_seat_binds WHERE week = ? AND account = ?').bind(week, account).first())?.guild_id ?? null;
}
async function pledgeIn(db, week, guildId, region) {
  const held = await db.prepare('SELECT key FROM town_seat_holds WHERE guild_id = ? AND region = ? ORDER BY key LIMIT 1').bind(guildId, region).first();
  if (held) return Number(held.key);
  const r = await db.prepare('SELECT key FROM town_seat_pledges WHERE week = ? AND guild_id = ? AND region = ?').bind(week, guildId, region).first();
  return r ? Number(r.key) : null;
}
const pledgedOrHeldSql = (w, k, g) => `(EXISTS (SELECT 1 FROM town_seat_pledges WHERE week = ${w} AND guild_id = ${g} AND key = ${k})
  OR EXISTS (SELECT 1 FROM town_seat_holds WHERE key = ${k} AND guild_id = ${g}))`;
async function pledgesOf(db, week, guildId) {
  const { results = [] } = await db.prepare('SELECT region, key, set_by, at FROM town_seat_pledges WHERE week = ? AND guild_id = ? ORDER BY region').bind(week, guildId).all();
  const { results: holds = [] } = await db.prepare('SELECT region, key, at FROM town_seat_holds WHERE guild_id = ? ORDER BY region, key').bind(guildId).all();
  const heldIn = new Map();
  for (const h of holds) if (!heldIn.has(Number(h.region))) heldIn.set(Number(h.region), { region: Number(h.region), key: Number(h.key), by: null, at: Number(h.at), held: true });
  const out = results.filter((p) => !heldIn.has(Number(p.region))).map((p) => ({ region: Number(p.region), key: Number(p.key), by: p.set_by, at: Number(p.at) }));
  return [...out, ...heldIn.values()].sort((a, b) => a.region - b.region);
}

async function warOf(db, player, character, nowS, week, { anyCharacter = false } = {}) {
  if (accountKind(player) !== 'linked') return { why: 'guest' };
  const bound = await boundTo(db, week, player.id);
  const me = typeof character === 'string'
    ? await db.prepare('SELECT guild_id, joined_at FROM guild_members WHERE player = ? AND char_id = ?').bind(player.id, character).first() : null;
  if (bound == null) {
    if (!me) return { why: 'no-guild' };
    return seasoned(me, nowS) ? { guild: me.guild_id, char: character } : { why: 'new-member' };
  }
  if (me && me.guild_id === bound) return seasoned(me, nowS) ? { guild: bound, char: character } : { why: 'new-member' };
  if (!anyCharacter) return { why: me ? 'bound-elsewhere' : 'no-guild' };
  const other = await db.prepare('SELECT char_id FROM guild_members WHERE player = ? AND guild_id = ? AND joined_at <= ? ORDER BY joined_at, char_id LIMIT 1')
    .bind(player.id, bound, nowS - SEAT_MEMBER_WAIT_S).first();
  return other ? { guild: bound, char: other.char_id } : { why: me ? 'bound-elsewhere' : 'no-guild' };
}

async function countsAt(db, player, character, region, nowS, { key = null, anyCharacter = false } = {}) {
  const week = weekAt(nowS);
  const war = await warOf(db, player, character, nowS, week, { anyCharacter });
  if ('why' in war) return { counted: false, why: war.why };
  const pledged = await pledgeIn(db, week, war.guild, region);
  if (pledged == null || (key != null && pledged !== key)) return { counted: false, why: 'no-pledge' };
  return { guild: war.guild, char: war.char, key: pledged, week };
}

const bindStatement = (db, at, account, nowS) => db.prepare(
  'INSERT OR IGNORE INTO town_seat_binds (week, account, guild_id, char_id, at) VALUES (?, ?, ?, ?, ?)',
).bind(at.week, account, at.guild, at.char, nowS);
const STILL_COUNTS = `(SELECT guild_id FROM town_seat_binds WHERE week = ?1 AND account = ?4) = ?3
  AND ${pledgedOrHeldSql('?1', '?2', '?3')}`;

/** @param {{db: any, nowS: number}} ctx */
export async function pledgeSeat({ db, nowS }, player, env, { character, key = null, region = null } = {}) {
  if (accountKind(player) !== 'linked') return { error: 'seats-need-account' };
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!seatMay(Number(a.me.rank), 'pledge')) return { error: 'guild-rank' };
  if (seatPhaseOf(nowS * 1000) !== 'muster') return { error: 'seat-reckoning' };
  if (await overRate({ db, nowS }, `seat-pledge:${player.id}`, SEAT_PLEDGES_HOUR, 3600)) return { error: 'seats-rate' };
  const week = weekAt(nowS);
  const gid = a.me.guild_id;
  // The rank is checked again inside each write, so a demotion between the read and the write pledges nothing.
  const rankHeld = `EXISTS (SELECT 1 FROM guild_members WHERE rowid = ${Number(a.me.rid)} AND guild_id = ?2 AND rank IN (${ranksSql('pledge')}))`;
  if (key == null) {
    if (!seatRegionOk(region)) return { error: 'bad-seat' };
    const r = await db.prepare(`DELETE FROM town_seat_pledges WHERE week = ?1 AND guild_id = ?2 AND region = ?3 AND ${rankHeld}`).bind(week, gid, region).run();
    return r?.meta?.changes ? { ok: true, pledges: await pledgesOf(db, week, gid) } : { error: 'seat-no-pledge' };
  }
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  const seat = (await confirmedSeats(db, nowS)).get(key);
  if (!seat) return { error: 'seat-unconfirmed' };
  if (await db.prepare('SELECT 1 FROM town_seat_holds WHERE guild_id = ? AND region = ?').bind(gid, seat.region).first()) return { error: 'seat-held-here' };
  const heldBy = (await db.prepare('SELECT guild_id FROM town_seat_holds WHERE key = ?').bind(key).first())?.guild_id ?? null;
  const barred = pledgeBarred(gid, heldBy, await bansOf(db, gid, week));
  if (barred) return { error: barred };
  const r = await db.prepare(`INSERT INTO town_seat_pledges (week, guild_id, region, key, set_by, at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE ${rankHeld}
      AND (SELECT COUNT(*) FROM (SELECT region FROM town_seat_pledges WHERE week = ?1 AND guild_id = ?2 AND region <> ?3
        UNION SELECT region FROM town_seat_holds WHERE guild_id = ?2 AND region <> ?3)) < ?7
    ON CONFLICT (week, guild_id, region) DO UPDATE SET key = excluded.key, set_by = excluded.set_by, at = excluded.at`)
    .bind(week, gid, seat.region, key, displayName(player), nowS, SEAT_PLEDGE_REGIONS_MAX).run();
  if (!r?.meta?.changes) {
    const still = await db.prepare(`SELECT ${rankHeld.replace(/\?2/g, '?1')} AS m`).bind(gid).first();
    return { error: still?.m ? 'seat-pledges-full' : 'guild-rank' };
  }
  return { ok: true, pledges: await pledgesOf(db, week, gid) };
}

/** @param {{db: any, nowS: number, subtle: SubtleCrypto}} ctx @param {CryptoKey|null} publicKey */
export async function claimWatch({ db, nowS, subtle }, player, env, { character, receipts } = {}, publicKey = null) {
  if (accountKind(player) !== 'linked') return { error: 'seats-need-account' };
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  if (!Array.isArray(receipts) || receipts.length < 1 || receipts.length > SEAT_WATCH_CLAIM_MAX) return { error: 'bad-watch' };
  if (!publicKey) return { error: 'no-gate-key' };
  const seats = await confirmedSeats(db, nowS);
  const byPixel = new Map([...seats.values()].map((s) => [`${s.pixel[0]},${s.pixel[1]}`, s]));
  const week = weekAt(nowS);
  let counted = 0;
  /** @type {Record<string, number>} */
  const why = {};
  const tally = (w) => { why[w] = (why[w] ?? 0) + 1; };
  for (const r of receipts) {
    const v = await verifyWatchReceipt(r, publicKey, { subtle, nowS });
    if (!v.ok) { tally(v.why); continue; }
    const c = v.claims;
    if (c.s !== player.id) { tally('not-yours'); continue; }
    if (weekAt(c.i) !== week) { tally('old-week'); continue; }
    const seat = byPixel.get(`${c.x},${c.y}`);
    if (!seat) { tally('no-seat'); continue; }
    const at = await countsAt(db, player, character, seat.region, nowS, { key: seat.key, anyCharacter: true });
    if ('counted' in at) { tally(at.why); continue; }
    const day = utcDay(c.i);
    const ref = `${c.s}:${c.c}:${c.i}`;
    const [, ins] = await db.batch([
      bindStatement(db, at, player.id, nowS),
      db.prepare(`INSERT OR IGNORE INTO town_seat_influence (week, key, guild_id, account, char_id, source, amount, region, day, ref, at)
        SELECT ?1, ?2, ?3, ?4, ?5, 'watch', 1, ?6, ?7, ?8, ?9
        WHERE ${STILL_COUNTS}
          AND (SELECT COUNT(*) FROM town_seat_influence WHERE account = ?4 AND source = 'watch' AND day = ?7) < ?10`)
        .bind(week, seat.key, at.guild, player.id, at.char, seat.region, day, ref, nowS, WATCH_DAY_CAP),
    ]);
    if (ins?.meta?.changes) counted++;
    else tally((await db.prepare("SELECT 1 FROM town_seat_influence WHERE source = 'watch' AND ref = ?").bind(ref).first()) ? 'claimed' : 'capped');
  }
  return { ok: true, counted, ...(Object.keys(why).length ? { why } : {}) };
}

/** @param {{db: any, nowS: number}} ctx */
export async function creditGate({ db, nowS }, player, env, { character, day, region } = {}) {
  if (!seatsOpenFor(player, env)) return { counted: false, why: 'seats-closed' };
  if (!seatRegionOk(region) || !Number.isSafeInteger(day) || day < 0) return { counted: false, why: 'no-region' };
  if (weekAt(Math.floor(gateTimes(day).riseAt / 1000)) !== weekAt(nowS)) return { counted: false, why: 'old-week' };
  const at = await countsAt(db, player, character, region, nowS, { anyCharacter: true });
  if ('counted' in at) return at;
  const [, ins] = await db.batch([
    bindStatement(db, at, player.id, nowS),
    db.prepare(`INSERT OR IGNORE INTO town_seat_influence (week, key, guild_id, account, char_id, source, amount, region, day, ref, at)
      SELECT ?1, ?2, ?3, ?4, ?5, 'gate', ?6, ?7, ?8, ?9, ?10 WHERE ${STILL_COUNTS}
        AND (SELECT COUNT(*) FROM town_seat_influence WHERE account = ?4 AND source = 'gate' AND week = ?1) < ?11`)
      .bind(at.week, at.key, at.guild, player.id, at.char, GATE_INFLUENCE, region, day, `${day}:${player.id}`, nowS, GATE_WEEK_RECEIPTS),
  ]);
  if (ins?.meta?.changes) return { counted: true, key: at.key };
  const n = await db.prepare("SELECT COUNT(*) AS n FROM town_seat_influence WHERE account = ? AND source = 'gate' AND week = ?").bind(player.id, at.week).first();
  return { counted: false, why: Number(n?.n ?? 0) >= GATE_WEEK_RECEIPTS ? 'capped' : 'bound-elsewhere' };
}

/** @param {{db: any, nowS: number}} ctx */
export async function claimOrcCamp({ db, nowS }, player, env, { character, site, region } = {}) {
  if (accountKind(player) !== 'linked') return { error: 'seats-need-account' };
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  if (!bountySitePixel(site) || !seatRegionOk(region)) return { error: 'bad-orc-camp' };
  if (tideNow(env, nowS, region) !== 'orcs') return { ok: true, counted: false, why: 'no-raid' };
  const at = await countsAt(db, player, character, region, nowS, { anyCharacter: true });
  if ('counted' in at) return { ok: true, counted: false, why: at.why };
  const day = utcDay(nowS);
  const ref = `${day}:${site}:${player.id}`;
  const [, ins] = await db.batch([
    bindStatement(db, at, player.id, nowS),
    db.prepare(`INSERT OR IGNORE INTO town_seat_influence (week, key, guild_id, account, char_id, source, amount, region, day, ref, at)
      SELECT ?1, ?2, ?3, ?4, ?5, 'raid', ?6, ?7, ?8, ?9, ?10 WHERE ${STILL_COUNTS}
        AND (SELECT COUNT(*) FROM town_seat_influence WHERE account = ?4 AND source = 'raid' AND day = ?8) < ?11
        AND COALESCE((SELECT SUM(amount) FROM town_seat_influence WHERE account = ?4 AND source = 'raid' AND week = ?1), 0) + ?6 <= ?12`)
      .bind(at.week, at.key, at.guild, player.id, at.char, TIDE_EFFECTS.orcsCampInfluence, region, day, ref, nowS, TIDE_EFFECTS.orcsCampsDay, TIDE_EFFECTS.orcsInfluenceWeek),
  ]);
  if (ins?.meta?.changes) return { ok: true, counted: true, key: at.key };
  if (await db.prepare("SELECT 1 FROM town_seat_influence WHERE source = 'raid' AND ref = ?").bind(ref).first()) return { ok: true, counted: false, why: 'claimed' };
  return { ok: true, counted: false, why: 'capped' };
}

/** @param {{db: any, nowS: number}} ctx */
export async function creditHunt({ db, nowS }, player, env, { character, region, ref } = {}) {
  if (!seatsOpenFor(player, env)) return { counted: false, why: 'seats-closed' };
  if (!seatRegionOk(region) || typeof ref !== 'string' || !ref) return { counted: false, why: 'no-region' };
  const at = await countsAt(db, player, character, region, nowS);
  if ('counted' in at) return at;
  const [, ins] = await db.batch([
    bindStatement(db, at, player.id, nowS),
    db.prepare(`INSERT OR IGNORE INTO town_seat_influence (week, key, guild_id, account, char_id, source, amount, region, day, ref, at)
      SELECT ?1, ?2, ?3, ?4, ?5, 'hunt', ?6, ?7, ?8, ?9, ?10 WHERE ${STILL_COUNTS}
        AND COALESCE((SELECT SUM(amount) FROM town_seat_influence WHERE account = ?4 AND source = 'hunt' AND week = ?1), 0) + ?6 <= ?11`)
      .bind(at.week, at.key, at.guild, player.id, at.char, HUNT_INFLUENCE, region, utcDay(nowS), ref, nowS, HUNT_WEEK_CAP),
  ]);
  if (ins?.meta?.changes) return { counted: true, key: at.key };
  if (await db.prepare("SELECT 1 FROM town_seat_influence WHERE source = 'hunt' AND ref = ?").bind(ref).first()) return { counted: false, why: 'claimed' };
  return { counted: false, why: 'capped' };
}

/** @param {{db: any, nowS: number}} ctx */
export async function creditSeatWrit({ db, nowS }, player, env, { character, key, region, guild, own = 0, bought = 0, value = 0, ref } = {}) {
  if (!seatsOpenFor(player, env)) return { counted: false, why: 'seats-closed' };
  const week = weekAt(nowS);
  const war = await warOf(db, player, character, nowS, week);
  if ('why' in war) return { counted: false, why: war.why };
  if (war.guild !== guild) return { counted: false, why: 'not-its-guild' };
  const at = { guild, char: war.char, key, week };
  const rows = [['writ', Math.max(0, own) * value], ['bought', Math.max(0, bought) * value]].filter(([, n]) => n > 0);
  if (!rows.length) return { counted: false, why: 'nothing' };
  const done = await db.batch([
    bindStatement(db, at, player.id, nowS),
    ...rows.map(([source, amount]) => db.prepare(`INSERT OR IGNORE INTO town_seat_influence (week, key, guild_id, account, char_id, source, amount, region, day, ref, at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11 WHERE ${STILL_COUNTS}`)
      .bind(week, key, guild, player.id, war.char, source, amount, region, utcDay(nowS), `${ref}:${source}`, nowS)),
  ]);
  return done.slice(1).some((r) => r?.meta?.changes) ? { counted: true } : { counted: false, why: 'bound-elsewhere' };
}

export async function agreedGateRegions(db, days) {
  const out = new Map();
  if (!days.length) return out;
  const { results = [] } = await db.prepare(`SELECT day, region, COUNT(*) AS n FROM gate_kills
    WHERE region IS NOT NULL AND day IN (${days.map(() => '?').join(', ')}) GROUP BY day, region`).bind(...days).all();
  const best = new Map();
  for (const r of results) {
    const d = Number(r.day), n = Number(r.n);
    const b = best.get(d);
    if (!b || n > b.n) best.set(d, { n, region: Number(r.region), level: false });
    else if (n === b.n) b.level = true;
  }
  for (const [d, b] of best) if (b.n >= GATE_REGION_AGREE && !b.level) out.set(d, b.region);
  return out;
}

/** @param {{db: any, nowS: number}} ctx */
export async function creditRenown({ db, nowS }, player, env, { character, region, xp } = {}) {
  if (!seatsOpenFor(player, env)) return { counted: false, why: 'seats-closed' };
  if (!seatRegionOk(region) || !Number.isSafeInteger(xp) || xp < 1 || xp > RENOWN_XP_REPORT_MAX) return { counted: false, why: 'no-region' };
  const at = await countsAt(db, player, character, region, nowS);
  if ('counted' in at) return at;
  const banked = '(SELECT COALESCE(SUM(xp), 0) FROM town_seat_renown WHERE week = ?1 AND account = ?4)';
  const [, ins] = await db.batch([
    bindStatement(db, at, player.id, nowS),
    db.prepare(`INSERT INTO town_seat_renown (week, account, char_id, region, xp) SELECT ?1, ?4, ?5, ?6, MIN(?7, ?8 - ${banked})
      WHERE (SELECT guild_id FROM town_seat_binds WHERE week = ?1 AND account = ?4) = ?3
        AND ${pledgedOrHeldSql('?1', '?2', '?3')} AND ${banked} < ?8
      ON CONFLICT (week, account, char_id, region) DO UPDATE SET xp = xp + excluded.xp`)
      .bind(at.week, at.key, at.guild, player.id, at.char, region, xp, RENOWN_WEEK_XP),
  ]);
  if (ins?.meta?.changes) return { counted: true, key: at.key };
  const n = await db.prepare('SELECT COALESCE(SUM(xp), 0) AS n FROM town_seat_renown WHERE week = ? AND account = ?').bind(at.week, player.id).first();
  return { counted: false, why: Number(n?.n ?? 0) >= RENOWN_WEEK_XP ? 'capped' : 'bound-elsewhere' };
}

/**
 * @param {{ guilds: string[], rows: any[], renown: any[], homes: any[], binds: Map<string, string>,
 *   agreed: Map<number, number>, weekStartS: number, nowS: number, reach?: Map<string, number>, freeLand?: boolean }} o
 */
export function standingsOf({ guilds, rows, renown, homes, binds, agreed, weekStartS, nowS, reach = new Map(), freeLand = false, tide = 'calm', shrine = null }) {
  const out = [];
  for (const g of guilds) {
    /** @type {Map<string, { watch: number, gates: number, renownXp: number, writ: number, homeDays: number, raid: number, hunt: number }>} */
    const acc = new Map();
    const a = (id) => { let v = acc.get(id); if (!v) acc.set(id, v = { watch: 0, gates: 0, renownXp: 0, writ: 0, homeDays: 0, raid: 0, hunt: 0 }); return v; };
    let tributeMarks = 0;
    for (const r of rows) {
      if (r.guild_id !== g) continue;
      if (r.source === 'tribute' || r.source === 'bought') { tributeMarks += Number(r.amount); continue; }
      if (binds.get(r.account) !== g) continue;
      if (r.source === 'watch') a(r.account).watch += Number(r.amount);
      else if (r.source === 'gate') { if (agreed.get(Number(r.day)) === Number(r.region)) a(r.account).gates += Number(r.n ?? 1); }
      else if (r.source === 'writ') a(r.account).writ += Number(r.amount);
      else if (r.source === 'raid') a(r.account).raid += Number(r.amount);
      else if (r.source === 'hunt') a(r.account).hunt += Number(r.amount);
    }
    for (const r of renown) if (binds.get(r.account) === g) a(r.account).renownXp += Number(r.xp);
    const hs = homes.filter((h) => h.guild_id === g && binds.get(h.player) === g)
      .map((h) => ({ player: h.player, days: homeDaysIn(Number(h.bought_at), weekStartS, nowS) }))
      .sort((x, y) => y.days - x.days).slice(0, HOMES_SEAT_MAX);
    for (const h of hs) if (h.days > 0) a(h.player).homeDays += h.days;
    const per = new Map([...acc].map(([id, v]) => [id, accountSeatInfluence(v, freeLand ? FREE_LAND_WATCH_BONUS : 0, tide)]));
    const row = { guild: g, ...withReach(guildSeatInfluence([...per.values()], tributeMarks), reach.get(g) ?? 0), accounts: [...per.values()].filter((v) => v > 0).length, per };
    if (shrine && shrine.guild === g && shrine.influence > 0) { row.total += shrine.influence; row.shrine = shrine.influence; }
    out.push(row);
  }
  return out.sort((x, y) => y.total - x.total || (x.guild < y.guild ? -1 : 1));
}

export async function seatGuildsOf(db, key, week) {
  const { results: pledged = [] } = await db.prepare('SELECT guild_id, at FROM town_seat_pledges WHERE week = ? AND key = ?').bind(week, key).all();
  const out = new Map(pledged.map((p) => [p.guild_id, Number(p.at)]));
  const held = await db.prepare('SELECT guild_id, at FROM town_seat_holds WHERE key = ?').bind(key).first();
  if (held && !out.has(held.guild_id)) out.set(held.guild_id, Number(held.at));
  return out;
}
export async function gatesFelledIn(db, week, region, nowS) {
  const fromS = Math.floor(seatWeekStartMs(week) / 1000), toS = Math.min(nowS, fromS + SEAT_WEEK_MS / 1000);
  const days = [];
  for (let d = gameDayAt(fromS * 1000); d <= gameDayAt(toS * 1000); d++) { const r = gateTimes(d).riseAt / 1000; if (r >= fromS && r < toS) days.push(d); }
  let n = 0;
  for (const rg of (await agreedGateRegions(db, days)).values()) if (rg === Number(region)) n++;
  return n;
}
export async function shrineOf(db, seat, week, nowS) {
  const h = await db.prepare('SELECT guild_id FROM town_seat_holds WHERE key = ?').bind(seat.key).first();
  if (!h) return null;
  const per = shrineGateInfluence(await fortTierAt(db, seat.key, 'shrine', nowS));
  if (per <= 0) return null;
  const gates = await gatesFelledIn(db, week, seat.region, nowS);
  return gates > 0 ? { guild: h.guild_id, influence: per * gates, gates } : null;
}
// D1 refuses a statement with more than 100 bound parameters, so long IN lists are read in chunks.
export const IN_CHUNK = 90;
/** @param {any} db @param {any[]} ids @param {(marks: string) => string} sql @param {any[]} [before] @param {any[]} [after] */
export async function allIn(db, ids, sql, before = [], after = []) {
  const out = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const part = ids.slice(i, i + IN_CHUNK);
    const { results = [] } = await db.prepare(sql(part.map(() => '?').join(', '))).bind(...before, ...part, ...after).all();
    out.push(...results);
  }
  return out;
}
export async function gatherStandings(db, seat, week, nowS, counted = false) {
  const guilds = [...(await seatGuildsOf(db, seat.key, week)).keys()];
  if (!guilds.length) return [];
  const { results: rows = [] } = await db.prepare(`SELECT guild_id, account, source, region, day, SUM(amount) AS amount, COUNT(*) AS n FROM town_seat_influence
    WHERE week = ? AND key = ? AND voided = 0 GROUP BY guild_id, account, source, region, day`).bind(week, seat.key).all();
  const bindRows = await allIn(db, guilds, (qs) => `SELECT account, guild_id FROM town_seat_binds WHERE week = ? AND guild_id IN (${qs})`, [week]);
  const binds = new Map(bindRows.map((b) => [b.account, b.guild_id]));
  const { results: renown = [] } = await db.prepare('SELECT account, xp FROM town_seat_renown WHERE week = ? AND region = ?').bind(week, seat.region).all();
  const homes = await allIn(db, guilds, (qs) => `SELECT h.player, h.bought_at, m.guild_id FROM homes h
    JOIN guild_members m ON m.player = h.player AND m.char_id = h.char_id
    WHERE h.map_id = ? AND h.guild_id IS NULL AND m.guild_id IN (${qs}) AND m.joined_at <= ?`, [seat.key], [nowS - SEAT_MEMBER_WAIT_S]);
  const days = [...new Set(rows.filter((r) => r.source === 'gate').map((r) => Number(r.day)))];
  const agreed = await agreedGateRegions(db, days);
  const crownRows = seat.tier === 'palace' ? await allIn(db, guilds, (qs) => `SELECT guild_id, tier, region FROM town_seat_holds WHERE tier = 'crown' AND guild_id IN (${qs})`) : [];
  const reach = new Map(guilds.map((g) => [g, seatReach(seat, crownsHeld(crownRows.filter((h) => h.guild_id === g).map((h) => ({ tier: h.tier, region: Number(h.region) }))))]));
  return standingsOf({ guilds, rows, renown, homes, binds, agreed, weekStartS: Math.floor(seatWeekStartMs(week) / 1000), nowS, reach, freeLand: isFreeLand(seat.region), tide: tideAt(week, seat.region, counted),
    shrine: await shrineOf(db, seat, week, nowS) });
}

/** @param {{db: any, nowS: number}} ctx */
export async function readStandings({ db, nowS }, player, env, { key, character = null } = {}) {
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  const seat = (await confirmedSeats(db, nowS)).get(key);
  if (!seat) return { error: 'seat-unconfirmed' };
  const week = weekAt(nowS);
  const season = seasonOf(week, seasonZeroOf(env?.SEASON_ZERO_WEEK));
  const list = await gatherStandings(db, seat, week, nowS, !!season);
  const { results: legacyRows = [] } = await db.prepare('SELECT guild_id, amount FROM town_seat_legacy WHERE week = ? AND key = ?').bind(week, key).all();
  const legacy = new Map(legacyRows.map((l) => [l.guild_id, Number(l.amount)]));
  const holder = (await holdsOf(db)).get(key) ?? null;
  const own = holder ? list.find((s) => s.guild === holder.guild.id) : null;
  const holding = holder ? await holdingOf(db, key, nowS) : null;
  const was = await standingWas(db, key, week - 1, holder);
  const { results: tiers = [] } = holder ? await db.prepare('SELECT tier, region FROM town_seat_holds WHERE guild_id = ?').bind(holder.guild.id).all() : { results: [] };
  const held = holder ? !!(await db.prepare("SELECT 1 FROM town_seat_aftermath WHERE week = ? AND key = ? AND guild_id = ? AND what = 'bonus'").bind(week, key, holder.guild.id).first()) : false;
  const liege = holder ? (await db.prepare("SELECT liege FROM guild_fealty WHERE vassal = ? AND state = 'sworn'").bind(holder.guild.id).first())?.liege ?? null : null;
  const { results: liegeRows = [] } = liege ? await db.prepare('SELECT tier, region FROM town_seat_holds WHERE guild_id = ?').bind(liege).all() : { results: [] };
  const liegeHolds = liegeRows.map((h) => ({ tier: h.tier, region: Number(h.region) }));
  const fits = liege && fealtyKingdom(tiers.map((h) => ({ tier: h.tier, region: Number(h.region) })), liegeHolds);
  const liegeReach = fits ? seatReach(seat, crownsHeld(liegeHolds)) : 0;
  const defence = holder ? seatDefence({ influence: own?.total ?? 0, legacy: legacy.get(holder.guild.id) ?? 0 }, holder.standing, overreachOf(tiers.map((t) => t.tier)), held, liegeReach) : null;
  const ids = list.map((s) => s.guild);
  const gs = await allIn(db, ids, (qs) => `SELECT id, name, tag, heraldry FROM guilds WHERE id IN (${qs})`);
  const byId = new Map(gs.map((g) => [g.id, g]));
  const start = seatWeekStartMs(week);
  let mine = null;
  if (typeof character === 'string' && accountKind(player) === 'linked') {
    const me = await db.prepare('SELECT guild_id, rank, joined_at FROM guild_members WHERE player = ? AND char_id = ?').bind(player.id, character).first();
    if (me) {
      const s = list.find((x) => x.guild === me.guild_id);
      mine = {
        guild: me.guild_id, rank: Number(me.rank), seasoned: seasoned(me, nowS), bound: await boundTo(db, week, player.id),
        pledges: await pledgesOf(db, week, me.guild_id), influence: s?.per.get(player.id) ?? 0,
        politics: await politicsOf(db, me.guild_id, nowS),
        tributeRoom: s ? tributeRoom(s.others, s.tribute) * TRIBUTE_MARKS_PER_INFLUENCE : 0,
      };
    }
  }
  const standings = list.map((s) => {
    const g = byId.get(s.guild);
    const carried = legacy.get(s.guild) ?? 0;
    const own = s.guild === holder?.guild.id;
    const influence = own || !holder ? s.total : unrestInfluence(s.total, holder.standing);
    return { guild: { id: s.guild, name: g?.name ?? '', tag: g?.tag ?? '', heraldry: heraldryOfRow(g?.heraldry) }, influence: influence + carried, legacy: carried, tribute: s.tribute, accounts: s.accounts, holder: own,
      ...(s.shrine ? { shrine: s.shrine } : {}) };
  }).sort((x, y) => y.influence - x.influence);
  const towerTier = holder && mine?.guild === holder.guild.id ? await fortTierAt(db, key, 'watchtowers', nowS) : 0;
  const towers = towerTier > 0 && defence != null
    ? towersSee(standings.map((s) => ({ guild: s.guild.id, influence: s.influence })), { holder: holder.guild.id, defence, t: towerTier })
      .map((w) => ({ ...w, name: byId.get(w.guild)?.name ?? '', tag: byId.get(w.guild)?.tag ?? '' }))
    : null;
  return {
    seat, week, phase: seatPhaseOf(nowS * 1000), season,
    tides: (() => {
      const nextCounted = !!seasonOf(week + 1, seasonZeroOf(env?.SEASON_ZERO_WEEK));
      return season || nextCounted ? { now: tideAt(week, seat.region, !!season), next: tideAt(week + 1, seat.region, nextCounted) } : null;
    })(),
    reckoningAt: Math.floor((start + SEAT_WEEK_MS - SEAT_RECKONING_MS) / 1000), turningAt: Math.floor((start + SEAT_WEEK_MS) / 1000),
    standings,
    ...(towers ? { towers } : {}),
    holder: holder ? { ...holder, ...(holding ? { edict: holding.edict } : {}), ...(was != null ? { was } : {}) } : holder, defence, battle: (await battlesOf(db, week)).get(key) ?? null, chronicle: await chronicleOf(db, key),
    fight: await fightOf(db, key, player, character, nowS),
    royal: seat.tier === 'crown' ? await royalView(db, key, nowS) : null,
    ...(holding && mine?.guild === holder?.guild.id ? { holding } : {}),
    ...(mine ? { mine } : {}),
  };
}

const guildView = (id, name, tag, heraldry) => ({ id, name: name ?? '', tag: tag ?? '', heraldry: heraldryOfRow(heraldry) });
export async function holdsOf(db) {
  return holdsFrom((await holdsRead(db).all()).results);
}
export const holdsRead = (/** @type {any} */ db) => db.prepare(`SELECT h.key, h.guild_id, h.since_week, h.standing, h.tithe, g.name, g.tag, g.heraldry FROM town_seat_holds h
    JOIN guilds g ON g.id = h.guild_id`);
export const holdsFrom = (/** @type {any[]} */ results = []) => new Map(results.map((h) => [Number(h.key), {
  guild: guildView(h.guild_id, h.name, h.tag, h.heraldry), since: Number(h.since_week), standing: Number(h.standing), tithe: Number(h.tithe ?? 0),
}]));
export async function battlesOf(db, week) {
  const [rights, revolts] = battlesRead(db, week);
  return battlesFrom((await rights.all()).results, (await revolts.all()).results);
}
export const battlesRead = (/** @type {any} */ db, /** @type {number} */ week) => [
  db.prepare(`SELECT r.key, r.kind, r.guild_id, r.against, a.name AS an, a.tag AS at, a.heraldry AS ah,
      b.name AS bn, b.tag AS bt, b.heraldry AS bh, x.starts_at, x.ends_at, x.moved, x.state FROM town_seat_rights r JOIN guilds a ON a.id = r.guild_id
      LEFT JOIN guilds b ON b.id = r.against LEFT JOIN town_seat_battles x ON x.week = r.week AND x.key = r.key
    WHERE r.week = ?`).bind(week),
  db.prepare(`SELECT x.key, x.defender, b.name AS bn, b.tag AS bt, b.heraldry AS bh, x.starts_at, x.ends_at, x.moved, x.state
    FROM town_seat_battles x LEFT JOIN guilds b ON b.id = x.defender WHERE x.week = ? AND x.kind = 'revolt'`).bind(week),
];
export function battlesFrom(/** @type {any[]} */ results = [], /** @type {any[]} */ revolts = []) {
  const out = new Map(results.map((r) => [Number(r.key), {
    kind: r.kind, guild: guildView(r.guild_id, r.an, r.at, r.ah), against: r.against ? guildView(r.against, r.bn, r.bt, r.bh) : null,
    startsAt: r.starts_at == null ? null : Number(r.starts_at), endsAt: r.ends_at == null ? null : Number(r.ends_at),
    moved: Number(r.moved ?? 0) === 1, state: r.state ?? null,
  }]));
  for (const r of revolts) {
    out.set(Number(r.key), { kind: 'revolt', guild: null, against: guildView(r.defender, r.bn, r.bt, r.bh), startsAt: Number(r.starts_at), endsAt: Number(r.ends_at),
      moved: Number(r.moved ?? 0) === 1, state: r.state ?? null });
  }
  return out;
}
async function chronicleOf(db, key, max = SEAT_CHRONICLE_SHOWN) {
  const { results = [] } = await db.prepare("SELECT kind, week, data, at FROM town_seat_history WHERE key = ? AND kind <> 'standing' ORDER BY seq DESC LIMIT ?").bind(key, max).all();
  const rows = results.map((r) => { let data = {}; try { data = JSON.parse(r.data); } catch { } return { kind: r.kind, week: Number(r.week), data, at: Number(r.at) }; });
  await renamedSince(db, rows);
  return rows.map(({ kind, week, data }) => ({ kind, week, data }));
}

async function renamedSince(db, rows) {
  const named = [];
  for (const r of rows) {
    for (const g of Object.values(r.data ?? {})) {
      if (g && typeof g === 'object' && typeof g.tag === 'string' && g.tag && typeof g.name === 'string') named.push([r, g]);
    }
  }
  const tags = [...new Set(named.map(([, g]) => g.tag))];
  const renames = await allIn(db, tags, (qs) => `SELECT guild_id, at, old_name, old_tag FROM guild_renames WHERE old_tag IN (${qs}) ORDER BY at, seq`);
  if (!renames.length) return;
  const whose = new Map();
  for (const [r, g] of named) {
    const hit = renames.find((x) => x.old_tag === g.tag && x.old_name === g.name && Number(x.at) >= r.at);
    if (hit) whose.set(g, hit.guild_id);
  }
  const ids = [...new Set(whose.values())];
  const byId = new Map((await allIn(db, ids, (qs) => `SELECT id, name, tag FROM guilds WHERE id IN (${qs})`)).map((x) => [x.id, x]));
  for (const [g, id] of whose) {
    const n = byId.get(id);
    if (n && (n.name !== g.name || n.tag !== g.tag)) g.now = { name: n.name, tag: n.tag };
  }
}

export async function standingWas(db, key, week, holder) {
  if (!holder) return null;
  const row = await db.prepare("SELECT data FROM town_seat_history WHERE key = ? AND week = ? AND kind = 'standing' ORDER BY seq DESC LIMIT 1").bind(key, week).first();
  let d = null;
  try { d = row ? JSON.parse(row.data) : null; } catch { }
  return d && d.guild === holder.guild.id && Number.isFinite(d.was) ? d.was : null;
}

/** @param {{db: any}} ctx */
export async function readRecords({ db }, player, env, { key } = {}) {
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  const rows = (await chronicleOf(db, key, HALL_OF_RECORDS_ROWS)).reverse();
  return { ok: true, key, rows, zero: seasonZeroOf(env?.SEASON_ZERO_WEEK) };
}

/** @param {{db: any, nowS: number}} ctx */
export async function payTribute({ db, nowS }, player, env, { character, key, marks, rid } = {}) {
  if (accountKind(player) !== 'linked') return { error: 'seats-need-account' };
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  if (typeof rid !== 'string' || !MARKS_RID_RE.test(rid)) return { error: 'marks-rid' };
  const prior = await db.prepare('SELECT kind FROM marks_ledger WHERE actor = ? AND rid = ?').bind(player.id, rid).first();
  if (prior) return prior.kind === 'tribute' ? { ok: true, repeat: true } : { error: 'marks-rid' };
  if (!marksOpenFor(player, env)) return { error: 'marks-closed' };
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!seatMay(Number(a.me.rank), 'tribute')) return { error: 'guild-rank' };
  if (!Number.isSafeInteger(marks) || marks < TRIBUTE_MARKS_PER_INFLUENCE || marks % TRIBUTE_MARKS_PER_INFLUENCE !== 0) return { error: 'bad-tribute' };
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  const week = weekAt(nowS);
  const seat = (await confirmedSeats(db, nowS)).get(key);
  if (!seat) return { error: 'seat-unconfirmed' };
  const gid = a.me.guild_id;
  if ((await pledgeIn(db, week, gid, seat.region)) !== key) return { error: 'seat-no-pledge' };
  const s = (await gatherStandings(db, seat, week, nowS, !!seasonOf(week, seasonZeroOf(env?.SEASON_ZERO_WEEK)))).find((x) => x.guild === gid);
  const room = s ? tributeRoom(s.others, s.tribute) : 0;
  if (marks / TRIBUTE_MARKS_PER_INFLUENCE > room) return { error: 'seat-tribute-cap' };
  try {
    await db.batch([
      db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'guild', ?1, 'burn', NULL, 'tribute', ?2, ?3, ?4, ?5, ?6, ?7
        WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) >= ?2
          AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?5 AND rid = ?7)
          AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?8 AND guild_id = ?1 AND rank IN (${ranksSql('tribute')}))
          AND ${pledgedOrHeldSql('?9', '?10', '?1')}`)
        .bind(gid, marks, utcDay(nowS), nowS, player.id, displayName(player), rid, Number(a.me.rid), week, key),
      mustChange(db),
      db.prepare(`INSERT INTO town_seat_influence (week, key, guild_id, account, char_id, source, amount, region, ref, at)
        VALUES (?, ?, ?, ?, ?, 'tribute', ?, ?, ?, ?)`)
        .bind(week, key, gid, player.id, character, marks, seat.region, `${player.id}:${rid}`, nowS),
    ]);
  } catch {
    const landed = await db.prepare('SELECT kind FROM marks_ledger WHERE actor = ? AND rid = ?').bind(player.id, rid).first();
    if (landed) return landed.kind === 'tribute' ? { ok: true, repeat: true } : { error: 'marks-rid' };
    const bal = await db.prepare('SELECT balance FROM guild_marks WHERE guild_id = ?').bind(gid).first();
    if (Number(bal?.balance ?? 0) < marks) return { error: 'guild-marks-short' };
    return { error: (await pledgeIn(db, week, gid, seat.region)) !== key ? 'seat-no-pledge' : 'guild-rank' };
  }
  return { ok: true, influence: marks / TRIBUTE_MARKS_PER_INFLUENCE, marks };
}
