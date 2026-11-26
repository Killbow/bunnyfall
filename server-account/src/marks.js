import { upgradeArgents } from '../../src/net/gearUpgradeLaw.js';
// @ts-check
// Every movement is one INSERT ... SELECT ... WHERE into the ledger, whose triggers move the balances, so racing
// requests never overdraw a balance or pass a cap. Service line ids hold a `:`, which client ids never can.
import { accountKind, displayName, overRate } from './accounts.js';
import { isDeveloper } from './titles.js';
import { guildActorOf, guildKeepsSql } from './guilds.js';
import {
  MARKS_MAX, MARKS_FAUCETS, MARKS_COMBAT, MARKS_BANK, MARKS_MOVE_MAX, MARKS_REPORT_DAYS, MARKS_OPS_MAX, MARKS_OPS_WINDOW_S, MARKS_RID_RE,
  marksSwitchOf, utcDay, marksAmountOk, exchangeGold, serpentStrikeOf, FIND_KINDS, lootFindOf,
} from '../../src/net/marksLaw.js';
import { dice } from './unitRoll.js';
import { readAll } from './service.js';
import { guildMay } from '../../src/net/guildLaw.js';
import { medianOf, MARKET_REPORT_MEDIANS } from '../../src/net/marketLaw.js';
import { WITNESS } from '../../src/net/nodeLaw.js';

export function marksOpenFor(player, env) {
  const s = marksSwitchOf(env?.MARKS_OPEN);
  return s === 'on' || (s === 'dev' && isDeveloper(player, env));
}

export async function balanceOf(db, account) {
  const r = await db.prepare('SELECT balance FROM marks WHERE account = ?').bind(account).first();
  return r ? Number(r.balance) : 0;
}
export async function guildBalanceOf(db, guildId) {
  const r = await db.prepare('SELECT balance FROM guild_marks WHERE guild_id = ?').bind(guildId).first();
  return r ? Number(r.balance) : 0;
}
const COMBAT_KINDS_SQL = MARKS_COMBAT.kinds.map((k) => `'${k}'`).join(', ');
const combatEarnedSql = (a, d) => `(SELECT COALESCE(SUM(amount), 0) FROM marks_ledger WHERE dst_kind = 'account' AND dst_id = ${a}
  AND kind IN (${COMBAT_KINDS_SQL}) AND day = ${d})`;
const findsEarnedSql = (a, d, kind) => `(SELECT COALESCE(SUM(amount), 0) FROM marks_ledger WHERE dst_kind = 'account' AND dst_id = ${a}
  AND kind = '${kind}' AND day = ${d})`;
async function todayOf(db, account, day) {
  const g = await db.prepare("SELECT COUNT(*) AS n FROM marks_ledger WHERE dst_id = ? AND kind = 'gate' AND day = ?").bind(account, day).first();
  const c = await db.prepare(`SELECT ${combatEarnedSql('?1', '?2')} AS s`).bind(account, day).first();
  const x = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM marks_ledger WHERE src_id = ? AND kind = 'exchange' AND day = ?").bind(account, day).first();
  const f = await db.prepare(`SELECT ${findsEarnedSql('?1', '?2', 'gather')} AS gathered, ${findsEarnedSql('?1', '?2', 'find')} AS found`).bind(account, day).first();
  return { gate: Number(g?.n ?? 0), combat: Number(c?.s ?? 0), exchanged: Number(x?.s ?? 0), gathered: Number(f?.gathered ?? 0), found: Number(f?.found ?? 0) };
}
const lineOf = (db, actor, rid) => db.prepare('SELECT * FROM marks_ledger WHERE actor = ? AND rid = ?').bind(actor, rid).first();
const INSERT_LINE = 'INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)';

function whoAsks(player, rid, { needRid = true } = {}) {
  if (accountKind(player) !== 'linked') return { error: 'marks-need-account' };
  if (needRid && (typeof rid !== 'string' || !MARKS_RID_RE.test(rid))) return { error: 'marks-rid' };
  return null;
}
// Acts check the switch after the line lookup, so a request whose line exists is answered whatever the switch says
// now.
const shut = (player, env) => (marksOpenFor(player, env) ? null : { error: 'marks-closed' });
const findsOpenFor = (player, nowS) => Number.isSafeInteger(player?.registered_at) && player.registered_at <= nowS - WITNESS.ageS;
async function decide(stmt) {
  try { return Number((await stmt.run())?.meta?.changes ?? 0) > 0; } catch (e) {
    if (/UNIQUE/i.test(String(e?.message ?? e))) return false;
    throw e;
  }
}

export const gateStrikeRid = (gameDay) => `gate:${gameDay}`;
export const raidStrikeRid = (key) => `raid:${key}`;

const CLAIM_GUARDS = Object.freeze({
  gate: (p) => `EXISTS (SELECT 1 FROM gate_kills WHERE day = ?${p} AND account = ?1 AND at = ?4)`,
  raid: (p) => `EXISTS (SELECT 1 FROM raid_cleanses WHERE raid = ?${p} AND account = ?1 AND nonce = ?${p + 1})`,
  serpent: (p) => `EXISTS (SELECT 1 FROM serpent_kills WHERE day = ?${p} AND account = ?1 AND nonce = ?${p + 1})`,
  eg: (p) => `EXISTS (SELECT 1 FROM eg_redoubts WHERE b = ?${p} AND account = ?1 AND w = ?${p + 1} AND nonce = ?${p + 2} AND paid = 1)`,
  star: (p) => `EXISTS (SELECT 1 FROM stars_held WHERE star = ?${p} AND account = ?1 AND nonce = ?${p + 1})`,
});

function combatStrikeStatement({ db, nowS }, player, kind, rid, guard, amount = MARKS_FAUCETS[kind].amount) {
  const day = utcDay(nowS);
  return db.prepare(`${INSERT_LINE}
    SELECT 'mint', NULL, 'account', ?1, '${kind}', ?2, ?3, ?4, ?1, NULL, ?5
    WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) + ?2 <= ?6
      AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?5)
      AND ${CLAIM_GUARDS[kind](7)}`)
    .bind(player.id, amount, day, nowS, rid, MARKS_MAX, ...guard);
}
const strikesFor = (player, env) => accountKind(player) === 'linked' && marksOpenFor(player, env);

export function gateStrikeStatement(ctx, player, env, gameDay) {
  if (!strikesFor(player, env) || !Number.isSafeInteger(gameDay)) return null;
  return combatStrikeStatement(ctx, player, 'gate', gateStrikeRid(gameDay), [gameDay]);
}
export function raidStrikeStatement(ctx, player, env, key, nonce) {
  if (!strikesFor(player, env) || typeof key !== 'string' || typeof nonce !== 'string') return null;
  return combatStrikeStatement(ctx, player, 'raid', raidStrikeRid(key), [key, nonce]);
}
export const starStrikeRid = (key) => `star:${key}`;
export function starStrikeStatement(ctx, player, env, key, nonce) {
  if (!strikesFor(player, env) || typeof key !== 'string' || typeof nonce !== 'string') return null;
  return combatStrikeStatement(ctx, player, 'star', starStrikeRid(key), [key, nonce]);
}
export const eventStrikeRid = (id) => `sevent:${id}`;
export function eventStrikeStatement({ db, nowS }, player, env, id, nonce, amount) {
  if (!strikesFor(player, env) || typeof id !== 'string' || typeof nonce !== 'string' || !Number.isSafeInteger(amount) || amount < 1) return null;
  return db.prepare(`${INSERT_LINE}
    SELECT 'mint', NULL, 'account', ?1, 'sevent', ?2, ?3, ?4, ?1, NULL, ?5
    WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) + ?2 <= ?6
      AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?5)
      AND EXISTS (SELECT 1 FROM event_pay WHERE event = ?7 AND account = ?1 AND nonce = ?8)`)
    .bind(player.id, amount, utcDay(nowS), nowS, eventStrikeRid(id), MARKS_MAX, id, nonce);
}
export const eventStrikeLine = (db, player, id) => lineOf(db, player.id, eventStrikeRid(id));
export const serpentStrikeRid = (day) => `serpent:${day}`;
export function serpentStrikeStatement(ctx, player, env, day, nonce, earned) {
  if (!strikesFor(player, env) || !Number.isSafeInteger(day) || typeof nonce !== 'string') return null;
  return combatStrikeStatement(ctx, player, 'serpent', serpentStrikeRid(day), [day, nonce], serpentStrikeOf(earned));
}
export async function combatStrikeAnswer({ db, nowS }, player, env, struck, rid) {
  if (!strikesFor(player, env)) return null;
  const balance = await balanceOf(db, player.id);
  const today = await todayOf(db, player.id, utcDay(nowS));
  const combat = { earned: today.combat };
  const line = struck ? await lineOf(db, player.id, rid) : null;
  if (line) return { struck: Number(line.amount), balance, combat };
  return { struck: 0, balance, combat, why: 'full' };
}
export const gateStrikeAnswer = (ctx, player, env, struck, gameDay) => combatStrikeAnswer(ctx, player, env, struck, gateStrikeRid(gameDay));
export const serpentStrikeAnswer = (ctx, player, env, struck, day) => combatStrikeAnswer(ctx, player, env, struck, serpentStrikeRid(day));
export const egStrikeRid = (week, w) => `eg:${week}:${w}`;
export function egStrikeStatement(ctx, player, env, week, b, w, nonce) {
  if (!strikesFor(player, env) || !Number.isSafeInteger(week) || !Number.isSafeInteger(w) || typeof b !== 'string' || typeof nonce !== 'string') return null;
  return combatStrikeStatement(ctx, player, 'eg', egStrikeRid(week, w), [b, w, nonce]);
}
export const egStrikeAnswer = (ctx, player, env, struck, week, w) => combatStrikeAnswer(ctx, player, env, struck, egStrikeRid(week, w));
export async function strikeGateMarks(ctx, player, env, gameDay) {
  const stmt = gateStrikeStatement(ctx, player, env, gameDay);
  if (!stmt) return null;
  return gateStrikeAnswer(ctx, player, env, await decide(stmt), gameDay);
}

export const deedEvent = (kind, id) => `${kind}:${id}`;
export const deedRid = (event) => `deed:${event}`;

export function deedStatements({ db, nowS }, player, env, { kind, event, character, guard }) {
  if (!strikesFor(player, env) || typeof character !== 'string' || !character || !CLAIM_GUARDS[kind]) return null;
  const { amount, members, tenureS } = MARKS_FAUCETS.deed;
  return [
    db.prepare(`INSERT OR IGNORE INTO guild_deed_marks (guild_id, event, account, char_id, at)
      SELECT m.guild_id, ?2, ?1, ?3, ?4 FROM guild_members m
      WHERE m.player = ?1 AND m.char_id = ?3 AND m.joined_at <= ?4 - ?5 AND ${CLAIM_GUARDS[kind](6)}`)
      .bind(player.id, event, character, nowS, tenureS, ...guard),
    db.prepare(`${INSERT_LINE}
      SELECT 'mint', NULL, 'guild', d.guild_id, 'guild-deed', ?2, ?3, ?4, d.guild_id, ?5, ?6
      FROM guild_deed_marks d
      WHERE d.event = ?7 AND d.account = ?1
        AND (SELECT COUNT(*) FROM guild_deed_marks x WHERE x.guild_id = d.guild_id AND x.event = ?7) >= ?8
        AND COALESCE((SELECT balance FROM guild_marks WHERE guild_id = d.guild_id), 0) + ?2 <= ?9
        AND NOT EXISTS (SELECT 1 FROM marks_ledger l WHERE l.actor = d.guild_id AND l.rid = ?6)
        AND ${CLAIM_GUARDS[kind](10)}`)
      .bind(player.id, amount, utcDay(nowS), nowS, displayName(player), deedRid(event), event, members, MARKS_MAX, ...guard),
  ];
}
export async function deedAnswer(db, player, event, struck) {
  if (!struck) return null;
  const r = await db.prepare(`SELECT l.amount, g.name, g.tag FROM guild_deed_marks d JOIN marks_ledger l ON l.actor = d.guild_id AND l.rid = ?2
      JOIN guilds g ON g.id = d.guild_id WHERE d.event = ?1 AND d.account = ?3`).bind(event, deedRid(event), player.id).first();
  return r ? { struck: Number(r.amount), guild: { name: r.name, tag: r.tag } } : null;
}
export async function guildDeedsToday(db, guildId, nowS) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM marks_ledger WHERE dst_kind = 'guild' AND dst_id = ?1 AND kind = 'guild-deed' AND day = ?2")
    .bind(guildId, utcDay(nowS)).first();
  return { deeds: Number(r?.n ?? 0) };
}

export const gatherStrikeRid = (rid) => `gather:${rid}`;
function findStrikeStatement({ db, nowS }, player, kind, rid, amount, guard = '1', guardArgs = []) {
  const day = utcDay(nowS);
  return db.prepare(`${INSERT_LINE}
    SELECT 'mint', NULL, 'account', ?1, '${kind}', ?2, ?3, ?4, ?1, NULL, ?5
    WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) + ?2 <= ?6
      AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?5)
      AND ${guard}`)
    .bind(player.id, amount, day, nowS, rid, MARKS_MAX, ...guardArgs);
}
export function gatherStrikeStatement(ctx, player, env, { rid, nonce, amount }) {
  if (!strikesFor(player, env) || !findsOpenFor(player, ctx.nowS) || !(amount > 0) || typeof rid !== 'string' || typeof nonce !== 'string') return null;
  return findStrikeStatement(ctx, player, 'gather', gatherStrikeRid(rid), amount,
    'EXISTS (SELECT 1 FROM node_harvests WHERE player = ?1 AND rid = ?7 AND n = ?8)', [rid, nonce]);
}
export async function findLineAnswer({ db, nowS }, player, env, lineRid) {
  const asked = findLineStatements(db, player, env, lineRid, nowS);
  return asked.length ? findLineFrom(await readAll(db, asked)) : null;
}
export function findLineStatements(db, player, env, lineRid, nowS) {
  if (accountKind(player) !== 'linked') return [];
  return [
    db.prepare('SELECT * FROM marks_ledger WHERE actor = ? AND rid = ?').bind(player.id, lineRid),
    db.prepare(`SELECT ${findsEarnedSql('?1', '?2', 'gather')} AS gathered, ${findsEarnedSql('?1', '?2', 'find')} AS found`).bind(player.id, utcDay(nowS)),
    db.prepare('SELECT balance FROM marks WHERE account = ?').bind(player.id),
  ];
}
export function findLineFrom(/** @type {any[][]} */ [lines = [], finds = [], balances = []]) {
  const line = lines[0];
  if (!line || (line.kind !== 'gather' && line.kind !== 'find')) return null;
  const f = finds[0];
  return { struck: Number(line.amount), balance: balances[0] ? Number(balances[0].balance) : 0,
    today: { found: Number((line.kind === 'gather' ? f?.gathered : f?.found) ?? 0) } };
}

export async function findMarks(ctx, player, env, { kind, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = whoAsks(player, rid);
  if (refused) return refused;
  const answer = async (extra = {}) => {
    const a = await findLineAnswer(ctx, player, env, rid);
    if (a) return { ok: true, ...extra, ...a };
    const today = await todayOf(db, player.id, utcDay(nowS));
    return { ok: true, ...extra, struck: 0, balance: await balanceOf(db, player.id), today: { found: today.found }, why: 'full' };
  };
  const prior = await lineOf(db, player.id, rid);
  if (prior) return prior.kind === 'find' ? answer({ repeat: true }) : { error: 'marks-rid' };
  const closed = shut(player, env);
  if (closed) return closed;
  if (!FIND_KINDS.includes(kind)) return { error: 'bad-find' };
  if (!findsOpenFor(player, nowS)) return { error: 'marks-young' };
  if (await overRate(ctx, `marks:${player.id}`, MARKS_OPS_MAX, MARKS_OPS_WINDOW_S)) return { error: 'marks-rate' };
  await decide(findStrikeStatement(ctx, player, 'find', rid, lootFindOf(dice(rand))));
  return answer();
}

export async function marksOf({ db, nowS }, player, env) {
  const refused = whoAsks(player, null, { needRid: false }) ?? shut(player, env);
  if (refused) return refused;
  const today = await todayOf(db, player.id, utcDay(nowS));
  return {
    balance: await balanceOf(db, player.id),
    today: {
      gate: today.gate, combat: today.combat, exchanged: today.exchanged,
      gathered: today.gathered, found: today.found,
    },
    bank: { goldPerMark: MARKS_BANK.goldPerMark },
  };
}
export async function marksCardOf(ctx, player, env) {
  if (accountKind(player) !== 'linked' || !marksOpenFor(player, env)) return null;
  return balanceOf(ctx.db, player.id);
}

export async function exchangeMarks(ctx, player, env, { marks, rid } = {}) {
  const { db, nowS } = ctx;
  const refused = whoAsks(player, rid);
  if (refused) return refused;
  const day = utcDay(nowS);
  const sold = async () => (await todayOf(db, player.id, day)).exchanged;
  const repeat = async (line) => (line.kind !== 'exchange' ? { error: 'marks-rid' }
    : { repeat: true, marks: line.amount, gold: exchangeGold(line.amount), balance: await balanceOf(db, player.id), exchangedToday: await sold() });
  const prior = await lineOf(db, player.id, rid);
  if (prior) return repeat(prior);
  const closed = shut(player, env);
  if (closed) return closed;
  if (!marksAmountOk(marks, MARKS_MAX)) return { error: 'bad-marks' };
  if (await overRate(ctx, `marks:${player.id}`, MARKS_OPS_MAX, MARKS_OPS_WINDOW_S)) return { error: 'marks-rate' };
  const made = await decide(db.prepare(`${INSERT_LINE}
    SELECT 'account', ?1, 'burn', NULL, 'exchange', ?2, ?3, ?4, ?1, NULL, ?5
    WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?2`)
    .bind(player.id, marks, day, nowS, rid));
  if (!made) {
    const again = await lineOf(db, player.id, rid);
    if (again) return repeat(again);
    return { error: 'marks-short' };
  }
  return { ok: true, marks, gold: exchangeGold(marks), balance: await balanceOf(db, player.id), exchangedToday: await sold() };
}

export async function depositGuildMarks(ctx, player, env, { character, marks, rid } = {}) {
  return moveGuildMarks(ctx, player, env, { character, marks, rid }, 'guild-deposit');
}
export async function withdrawGuildMarks(ctx, player, env, { character, marks, rid } = {}) {
  return moveGuildMarks(ctx, player, env, { character, marks, rid }, 'guild-withdraw');
}
async function moveGuildMarks(ctx, player, env, { character, marks, rid }, kind) {
  const { db, nowS } = ctx;
  const refused = whoAsks(player, rid);
  if (refused) return refused;
  const a = await guildActorOf(db, player, character);
  if (a.error) return a;
  const deposit = kind === 'guild-deposit';
  const answer = async (extra) => ({ ...extra, balance: await balanceOf(db, player.id), guildMarks: await guildBalanceOf(db, a.me.guild_id) });
  const prior = await lineOf(db, player.id, rid);
  if (prior) return prior.kind === kind ? answer({ repeat: true, marks: prior.amount }) : { error: 'marks-rid' };
  const closed = shut(player, env);
  if (closed) return closed;
  if (!guildMay(a.me.rank, deposit ? 'deposit' : 'withdraw')) return { error: 'guild-rank' };
  if (!marksAmountOk(marks, MARKS_MOVE_MAX)) return { error: 'bad-marks' };
  if (await overRate(ctx, `marks:${player.id}`, MARKS_OPS_MAX, MARKS_OPS_WINDOW_S)) return { error: 'marks-rate' };
  const day = utcDay(nowS);
  const who = displayName(player);
  const made = await decide(deposit
    ? db.prepare(`${INSERT_LINE}
      SELECT 'account', ?1, 'guild', ?2, 'guild-deposit', ?3, ?4, ?5, ?1, ?6, ?7
      WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?3
        AND COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?2), 0) + ?3 <= ?8
        AND EXISTS (SELECT 1 FROM guild_members WHERE player = ?1 AND char_id = ?9 AND guild_id = ?2)`)
      .bind(player.id, a.me.guild_id, marks, day, nowS, who, rid, MARKS_MAX, character)
    : db.prepare(`${INSERT_LINE}
      SELECT 'guild', ?2, 'account', ?1, 'guild-withdraw', ?3, ?4, ?5, ?1, ?6, ?7
      WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?2), 0) >= ?3
        AND COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) + ?3 <= ?8
        AND EXISTS (SELECT 1 FROM guild_members WHERE player = ?1 AND char_id = ?9 AND guild_id = ?2 AND rank = ?10)`)
      .bind(player.id, a.me.guild_id, marks, day, nowS, who, rid, MARKS_MAX, character, a.me.rank));
  if (!made) {
    const again = await lineOf(db, player.id, rid);
    if (again) return again.kind === kind ? answer({ repeat: true, marks: again.amount }) : { error: 'marks-rid' };
    const [mine, theirs] = [await balanceOf(db, player.id), await guildBalanceOf(db, a.me.guild_id)];
    if (deposit) return { error: mine < marks ? 'marks-short' : theirs + marks > MARKS_MAX ? 'guild-marks-full' : 'no-guild' };
    return { error: theirs < marks ? 'guild-marks-short' : mine + marks > MARKS_MAX ? 'marks-full' : 'guild-rank' };
  }
  return answer({ ok: true, marks });
}

// Asks no switch: with Marks shut, a guild holding Marks could neither withdraw them nor disband.
export function guildMarksSweep(db, guildId, player, nowS, { alone = false } = {}) {
  return db.prepare(`${INSERT_LINE}
    SELECT 'guild', ?1, 'account', ?2, 'guild-withdraw', gm.balance, ?3, ?4, ?2, ?5, ?6
    FROM guild_marks gm
    WHERE gm.guild_id = ?1 AND gm.balance > 0
      AND COALESCE((SELECT balance FROM marks WHERE account = ?2), 0) + gm.balance <= ?7
      AND EXISTS (SELECT 1 FROM guilds WHERE id = ?1 AND treasury = 0)
      AND NOT ${guildKeepsSql('?1')}   -- PROF6: a guild that keeps its Stores or a writ does not go, so its Marks stay
      AND (?8 = 0 OR (SELECT COUNT(*) FROM guild_members WHERE guild_id = ?1) = 1)`)
    .bind(guildId, player.id, utcDay(nowS), nowS, displayName(player), `disband:${guildId}`, MARKS_MAX, alone ? 1 : 0);
}

export async function marksReport({ db, nowS }, player, env) {
  if (!isDeveloper(player, env)) return { error: 'not-developer' };
  const today = utcDay(nowS);
  const from = today - MARKS_REPORT_DAYS + 1;
  const byKind = async (where) => Object.fromEntries(((await db.prepare(`SELECT kind, SUM(amount) AS s FROM marks_ledger WHERE day >= ? AND ${where} GROUP BY kind`)
    .bind(from).all())?.results ?? []).map((r) => [r.kind, Number(r.s)]));
  const minted = await byKind("src_kind = 'mint'");
  const burnt = await byKind("dst_kind = 'burn'");
  const moved = await byKind("src_kind <> 'mint' AND dst_kind <> 'burn'");
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const acc = await db.prepare('SELECT COALESCE(SUM(balance), 0) AS s, COUNT(*) AS n FROM marks WHERE balance > 0').first();
  const gld = await db.prepare('SELECT COALESCE(SUM(balance), 0) AS s FROM guild_marks').first();
  const esc = await db.prepare(`SELECT COALESCE(SUM(CASE WHEN dst_kind = 'escrow' THEN amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN src_kind = 'escrow' THEN amount ELSE 0 END), 0) AS s FROM marks_ledger WHERE dst_kind = 'escrow' OR src_kind = 'escrow'`).first();
  const { results: traded = [] } = await db.prepare(`SELECT material, SUM(units) AS u FROM market_prices WHERE day >= ?1 GROUP BY material
    ORDER BY u DESC, material LIMIT ?2`).bind(from, MARKET_REPORT_MEDIANS).all();
  const { results: priced = [] } = traded.length ? await db.prepare(`SELECT material, price, units FROM market_prices WHERE day >= ?1 AND material IN
    (${traded.map((_, i) => `?${i + 2}`).join(', ')})`).bind(from, ...traded.map((t) => t.material)).all() : { results: [] };
  const medians = traded.map((t) => ({
    material: t.material, units: Number(t.u),
    median: medianOf(priced.filter((r) => r.material === t.material).map((r) => ({ price: Number(r.price), units: Number(r.units) }))),
  }));
  const days = ((await db.prepare(`SELECT day,
      SUM(CASE WHEN src_kind = 'mint' THEN amount ELSE 0 END) AS minted,
      SUM(CASE WHEN dst_kind = 'burn' THEN amount ELSE 0 END) AS burnt
    FROM marks_ledger WHERE day >= ? GROUP BY day ORDER BY day`).bind(from).all())?.results ?? [])
    .map((r) => ({ day: Number(r.day), minted: Number(r.minted), burnt: Number(r.burnt) }));
  const m = sum(minted), b = sum(burnt);
  return {
    from, to: today, minted, burnt, moved, mintedTotal: m, burntTotal: b, ratio: b > 0 ? Math.round((m / b) * 100) / 100 : null,
    circulation: { accounts: Number(acc?.s ?? 0), guilds: Number(gld?.s ?? 0), escrow: Number(esc?.s ?? 0), holders: Number(acc?.n ?? 0) },
    days,
    medians,
  };
}

export async function payGearUpgrade(ctx, player, env, { service, tier, rid } = {}) {
  const { db, nowS } = ctx;
  const refused = whoAsks(player, rid);
  if (refused) return refused;
  const amount = upgradeArgents(service, tier);
  if (!amount) return { error: 'bad-piece' };
  const kind = `gear-${service}`;
  const answer = async (line, repeat = false) =>
    line.kind === kind && line.who === tier
      ? { ok: true, repeat, balance: await balanceOf(db, player.id) }
      : { error: 'marks-rid' };
  const prior = await lineOf(db, player.id, rid);
  if (prior) return answer(prior, true);
  const closed = shut(player, env);
  if (closed) return closed;
  if (await overRate(ctx, `marks:${player.id}`, MARKS_OPS_MAX, MARKS_OPS_WINDOW_S)) return { error: 'marks-rate' };
  const made = await decide(db.prepare(`${INSERT_LINE}
    SELECT 'account', ?1, 'burn', NULL, ?2, ?3, ?4, ?5, ?1, ?6, ?7
    WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?3`)
    .bind(player.id, kind, amount, utcDay(nowS), nowS, tier, rid));
  const line = await lineOf(db, player.id, rid);
  return line ? answer(line, !made) : { error: 'marks-short' };
}
