// @ts-check

import { seaSweeps } from './seaBounty.js';
import { crewSweep } from './crewSigns.js';
import { closeAuctions, pruneMarketHistory, SETTLE_MAX, reckonPatrons, marketOpenFor, markPatronsShut } from './market.js';
import { closeGuildWrits } from './writs.js';
import { closeContracts } from './contracts.js';
import { settleDueOnce } from './seatTurning.js';
import { keepSeatFacts } from './townSeats.js';
import { motherlodesOf } from './motherlodes.js';
import { sweepBoard } from './board.js';
import { safetyMinute, safetySweep } from './safetyClock.js';
import { sweepGuildNotes } from './guildBoard.js';
import { sweepHarvests } from './professions.js';
import { sweepCraftWrits } from './craftWrits.js';
import { retryFreezePushes, sweepStaffChat } from './staffFreeze.js';
import { SESSION_IDLE_S } from './accounts.js';
import { storeArenaChampion, ARENA_CHAMPION_CLOCK_S } from './arena.js';
import { iliacChampionClock } from './iliac.js';
import { gambitChampionClock } from './gambit.js';
import { countedDb } from './metrics.js';
import { maintaining } from './service.js';
import { WRIT_SETTLE_MAX } from '../../src/net/writLaw.js';
import { seatsSwitchOf, seasonZeroOf } from '../../src/net/townSeatLaw.js';
import { profSwitchOf } from '../../src/net/professionLaw.js';
import { GUILD_INVITE_TTL_S } from '../../src/net/guildLaw.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { arenaSeasonOf } from '../../src/net/arenaLaw.js';
import { POI_TXN_KEEP_S } from './poiTrade.js';
import { REALM_FINDINGS_KEEP_S, REALM_WEALTH_KEEP_S } from './review.js';
import { WILD_FALLS_KEEP_S } from './wild.js';
import { settleHolds, REZ_SETTLE_MAX } from './legacy.js';
import { spendLapsedStakes } from './eg.js';
import { TOWN_ECON_SWEEPS, TOWN_ECON_SEEN_SWEEP, townEconKeptFrom, townEconSeenFrom, keepTownShares, townsOpen } from './townEcon.js';
import { settleStaleYards } from './decor.js';
import { STAFF_AUDIT_KEEP_S } from './staff.js';
import { censusDay, censusBackfill } from './staffCensus.js';
import { STAFF_MESSAGE_KEEP_S } from './staffMessage.js';
import { STAFF_EVENT_KEEP_S } from './staffEvents.js';
import { STAFF_FEED_KEEP_S } from './staffNet.js';
import { REACT_KEEP_S } from './staffReactions.js';

export const CRON_MINUTE = '* * * * *';
export const CRON_HOUR = '41 * * * *';

export const RATE_ROW_KEEP_S = 24 * 3600;
export const SWEEP_ROWS = 1000;
export const ROUNDS_MAX = 25;
export const FIRING_STATEMENTS_MAX = 600;

async function rounds(/** @type {() => Promise<number>} */ step, /** @type {number} */ page, /** @type {() => boolean} */ more = () => true) {
  let n = 0;
  for (let i = 0; i < ROUNDS_MAX; i++) {
    const got = Number(await step()) || 0;
    n += got;
    if (got < page || !more()) break;
  }
  return n;
}

const deleted = async (/** @type {any} */ db, /** @type {string} */ sql, /** @type {number} */ cutoff) => {
  const r = await db.prepare(sql).bind(cutoff, SWEEP_ROWS).run();
  return Number(r?.meta?.changes ?? 0);
};

const STAFF_FEED_SWEEPS = Object.freeze(['staff_net_rows', 'staff_foe_rows', 'staff_net_batches', 'reaction_batches']
  .map((t) => `DELETE FROM ${t} WHERE rowid IN (SELECT rowid FROM ${t} WHERE at < ?1 LIMIT ?2)`));

let lodesPicked = -1;
export const _resetCronForTests = () => { lodesPicked = -1; };

/** @typedef {{ db: any, nowS: number, rand: (b: Uint8Array) => void, budget: () => boolean }} CronCtx */
/** @typedef {[string, (ctx: CronCtx, env: any) => Promise<number>]} CronJob */

/** @type {readonly CronJob[]} */
export const MINUTE_JOBS = Object.freeze([
  ['auctions', (ctx) => rounds(() => closeAuctions(ctx), SETTLE_MAX, ctx.budget)],
  ['guild-writs', (ctx) => rounds(() => closeGuildWrits(ctx), WRIT_SETTLE_MAX, ctx.budget)],
  ['contracts', (ctx) => rounds(() => closeContracts(ctx), WRIT_SETTLE_MAX, ctx.budget)],
  ['seats', async (ctx, env) => (seatsSwitchOf(env?.SEATS_OPEN) === 'on' ? (await settleDueOnce(ctx.db, ctx.nowS, seasonZeroOf(env.SEASON_ZERO_WEEK))).settled : 0)],
  ['seat-facts', async (ctx, env) => (seatsSwitchOf(env?.SEATS_OPEN) === 'off' ? 0 : keepSeatFacts(ctx.db, ctx.nowS))],
  ['town-shares', async (ctx, env) => (townsOpen(env) ? keepTownShares(ctx.db, ctx.nowS) : 0)],
  ['yard-snap', (ctx) => settleStaleYards(ctx.db)],
  ['arena-champion', async (ctx) => {
    const season = arenaSeasonOf(ctx.nowS);
    const kept = await ctx.db.prepare('SELECT at FROM arena_champions WHERE season = ?1').bind(season).first();
    if (kept && ctx.nowS - Number(kept.at) < ARENA_CHAMPION_CLOCK_S) return 0;
    if (kept) {
      const last = await ctx.db.prepare('SELECT MAX(at) AS at FROM arena_pvp WHERE season = ?1').bind(season).first();
      if (last?.at == null || Number(last.at) < Number(kept.at)) {
        await ctx.db.prepare('UPDATE arena_champions SET at = ?2 WHERE season = ?1').bind(season, ctx.nowS).run();
        return 0;
      }
    }
    await storeArenaChampion(ctx, season, ctx.nowS);
    return 1;
  }],
  ['iliac-champion', async (ctx) => iliacChampionClock(ctx)],
  ['gambit-champion', async (ctx) => gambitChampionClock(ctx)],
  ['rez-holds', (ctx) => rounds(() => settleHolds(ctx), REZ_SETTLE_MAX, ctx.budget)],
  ['safety', async (ctx, env) => (await safetyMinute(ctx, env)) + (await retryFreezePushes(ctx, env))],
  ['motherlodes', async (ctx, env) => {
    const day = utcDay(ctx.nowS);
    if (profSwitchOf(env?.PROFESSIONS_OPEN) !== 'on' || lodesPicked === day) return 0;
    const lodes = await motherlodesOf(ctx, day);
    lodesPicked = day;
    return lodes.length;
  }],
]);

/** @type {readonly CronJob[]} */
export const HOUR_JOBS = Object.freeze([
  ['board', (ctx) => rounds(() => sweepBoard(ctx.db, ctx.nowS, SWEEP_ROWS), SWEEP_ROWS)],
  ['guild-board', (ctx) => rounds(() => sweepGuildNotes(ctx.db, ctx.nowS, SWEEP_ROWS), SWEEP_ROWS)],
  ['harvests', (ctx) => rounds(() => sweepHarvests(ctx.db, ctx.nowS, SWEEP_ROWS), SWEEP_ROWS)],
  ['craft-writs', (ctx) => rounds(() => sweepCraftWrits(ctx.db, ctx.nowS, SWEEP_ROWS), SWEEP_ROWS)],
  ['market-history', async (ctx) => {
    let n = 0;
    for (let i = 0; i < ROUNDS_MAX; i++) {
      const r = await pruneMarketHistory(ctx.db, ctx.nowS, SWEEP_ROWS);
      n += r.changed;
      if (!r.full || !ctx.budget()) break;
    }
    return n;
  }],
  ['town-econ', async (ctx) => {
    let n = 0;
    for (const sql of TOWN_ECON_SWEEPS) n += await rounds(() => deleted(ctx.db, sql, townEconKeptFrom(ctx.nowS)), SWEEP_ROWS, ctx.budget);
    n += await rounds(() => deleted(ctx.db, TOWN_ECON_SEEN_SWEEP, townEconSeenFrom(ctx.nowS)), SWEEP_ROWS, ctx.budget);
    return n;
  }],
  ['rate-limits', (ctx) => rounds(() => deleted(ctx.db,
    'DELETE FROM rate_limits WHERE rowid IN (SELECT rowid FROM rate_limits WHERE window_start < ?1 LIMIT ?2)', ctx.nowS - RATE_ROW_KEEP_S), SWEEP_ROWS)],
  ['sessions', (ctx) => rounds(() => deleted(ctx.db,
    'DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE last_seen < ?1 LIMIT ?2)', ctx.nowS - SESSION_IDLE_S), SWEEP_ROWS)],
  ['guild-invites', (ctx) => rounds(() => deleted(ctx.db,
    'DELETE FROM guild_invites WHERE rowid IN (SELECT rowid FROM guild_invites WHERE at <= ?1 LIMIT ?2)', ctx.nowS - GUILD_INVITE_TTL_S), SWEEP_ROWS)],
  ['realm-findings', (ctx) => rounds(() => deleted(ctx.db,
    'DELETE FROM realm_findings WHERE id IN (SELECT id FROM realm_findings WHERE at < ?1 LIMIT ?2)', ctx.nowS - REALM_FINDINGS_KEEP_S), SWEEP_ROWS)],
  ['poi-txn-log', (ctx) => rounds(() => deleted(ctx.db,
    'DELETE FROM poi_txn_log WHERE rowid IN (SELECT rowid FROM poi_txn_log WHERE created_at < ?1 LIMIT ?2)', ctx.nowS - POI_TXN_KEEP_S), SWEEP_ROWS)],
  ['realm-wealth-hours', (ctx) => rounds(() => deleted(ctx.db,
    'DELETE FROM realm_wealth_hours WHERE rowid IN (SELECT rowid FROM realm_wealth_hours WHERE hour < ?1 LIMIT ?2)', ctx.nowS - REALM_WEALTH_KEEP_S), SWEEP_ROWS)],
  ['progress-hours', (ctx) => rounds(() => deleted(ctx.db,
    'DELETE FROM progress_hours WHERE rowid IN (SELECT rowid FROM progress_hours WHERE hour < ?1 LIMIT ?2)', ctx.nowS - REALM_WEALTH_KEEP_S), SWEEP_ROWS)],
  ['wild-falls', (ctx) => rounds(() => deleted(ctx.db,
    'DELETE FROM wild_falls WHERE r IN (SELECT r FROM wild_falls WHERE at < ?1 LIMIT ?2)', ctx.nowS - WILD_FALLS_KEEP_S), SWEEP_ROWS)],
  ['wild-escrow', (ctx) => rounds(() => deleted(ctx.db,
    "DELETE FROM wild_escrow WHERE r IN (SELECT r FROM wild_escrow WHERE state != 'held' AND ended_at < ?1 LIMIT ?2)", ctx.nowS - WILD_FALLS_KEEP_S), SWEEP_ROWS)],
  ['sea', async (ctx) => {
    let n = 0;
    for (const [sql, cutoff] of seaSweeps(ctx.nowS)) n += await rounds(() => deleted(ctx.db, sql, cutoff), SWEEP_ROWS, ctx.budget);
    return n;
  }],
  ['crew-signs', (ctx) => rounds(() => deleted(ctx.db, ...crewSweep(ctx.nowS)), SWEEP_ROWS)],
  ['patrons', async (ctx, env) => (marketOpenFor(null, env) ? (await reckonPatrons(ctx, {}, env)).sold : markPatronsShut(ctx))],
  ['eg-stakes', (ctx) => rounds(() => spendLapsedStakes(ctx.db, ctx.nowS, SWEEP_ROWS), SWEEP_ROWS, ctx.budget)],
  ['safety-sweep', (ctx) => safetySweep(ctx)],
  // Migration 0144's trigger refuses deleting rows newer than this keep time less an hour; keep both in step.
  ['staff-audit', (ctx) => rounds(() => deleted(ctx.db,
    'DELETE FROM staff_audit WHERE id IN (SELECT id FROM staff_audit WHERE at < ?1 LIMIT ?2)', ctx.nowS - STAFF_AUDIT_KEEP_S), SWEEP_ROWS)],
  ['staff-evidence', (ctx) => rounds(() => deleted(ctx.db,
    'DELETE FROM staff_evidence WHERE id IN (SELECT id FROM staff_evidence WHERE until <= ?1 LIMIT ?2)', ctx.nowS), SWEEP_ROWS)],
  ['census-day', (ctx) => censusDay(ctx)],
  ['census-backfill', (ctx, env) => censusBackfill(ctx, env)],
  ['staff-messages', (ctx) => rounds(() => deleted(ctx.db,
    'DELETE FROM staff_messages WHERE id IN (SELECT id FROM staff_messages WHERE at < ?1 LIMIT ?2)', ctx.nowS - STAFF_MESSAGE_KEEP_S), SWEEP_ROWS)],
  ['staff-events', (ctx) => rounds(() => deleted(ctx.db,
    "DELETE FROM staff_events WHERE id IN (SELECT id FROM staff_events WHERE at < ?1 AND state != 'live' LIMIT ?2)", ctx.nowS - STAFF_EVENT_KEEP_S), SWEEP_ROWS)],
  ['staff-feeds', async (ctx) => {
    let n = 0;
    for (const sql of STAFF_FEED_SWEEPS) n += await rounds(() => deleted(ctx.db, sql, ctx.nowS - STAFF_FEED_KEEP_S), SWEEP_ROWS, ctx.budget);
    return n;
  }],
  ['reactions', (ctx) => rounds(() => deleted(ctx.db,
    `DELETE FROM encounter_reactions WHERE id IN (SELECT id FROM encounter_reactions WHERE at < ?1 AND (keep_until IS NULL OR keep_until < ?1 + ${REACT_KEEP_S}) LIMIT ?2)`, ctx.nowS - REACT_KEEP_S), SWEEP_ROWS, ctx.budget)],
  ['staff-chat', (ctx) => rounds(() => sweepStaffChat(ctx.db, ctx.nowS, SWEEP_ROWS), SWEEP_ROWS, ctx.budget)],
]);

export const jobsFor = (/** @type {string} */ cron) => {
  if (cron === CRON_MINUTE) return MINUTE_JOBS;
  if (cron === CRON_HOUR) return HOUR_JOBS;
  console.warn(`[cron] no jobs for the schedule ${JSON.stringify(cron)}`);
  return [];
};

/**
 * @param {any} env @param {{ cron: string, nowS: number, rand?: (b: Uint8Array) => void, jobs?: readonly CronJob[] }} at
 * @returns {Promise<Array<{ name: string, ok: boolean, changed: number, statements: number, ms: number }>>}
 */
export async function runCron(env, { cron, nowS, rand = (b) => { crypto.getRandomValues(b); }, jobs = jobsFor(cron) }) {
  if (!env?.DB || maintaining(env) || !Number.isSafeInteger(nowS)) return [];
  const out = [];
  const share = Math.floor(FIRING_STATEMENTS_MAX / Math.max(1, jobs.length));
  for (const [name, job] of jobs) {
    const tally = { n: 0 };
    const started = Date.now();
    let ok = true, changed = 0;
    try {
      changed = Number(await job({ db: countedDb(env.DB, tally), nowS, rand, budget: () => tally.n < share }, env)) || 0;
    } catch (e) {
      ok = false;
      console.warn(`[cron] ${name} failed`, e?.message ?? e);
    }
    const ms = Date.now() - started;
    out.push({ name, ok, changed, statements: tally.n, ms });
    try {
      env.METRICS?.writeDataPoint?.({ indexes: [`cron:${name}`], blobs: [`cron:${name}`, 'CRON', ok ? '200' : '500', ok ? '' : 'failed'], doubles: [ms, ok ? 200 : 500, tally.n, changed] });
    } catch { }
  }
  return out;
}
