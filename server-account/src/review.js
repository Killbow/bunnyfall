// @ts-check
// Developer-only review acts on realm characters. Every write act moves `judge_rev` or the record's `seq`, so a
// checkpoint that judged the row before the act writes no verdict over it.

import { isDeveloper } from './titles.js';
import { REALM_ID_RE, REALM_PLAYING_S, realmSaveTextOf, dropObjects, seizeRealmRecord, dropIfUnnamed, mustChange } from './realm.js';
import { budgetConfig, budgetConfigOf, forgetBudgetConfig, BUDGET_DEFAULT, FAUCET_KINDS, faucetStatement } from './budget.js';
import { repairOf, applyRepair, purseMendOf, applyPurseMend, bankSetOf, applyBankSet, guildLetterOf, applyGuildLetter, GUILD_LETTERS, GUILD_LETTER_OPS } from '../../src/net/repairLaw.js';
import { lawSigOf } from './verdict.js';
import { isHandleShaped } from '../../src/net/handleShape.js';
import { wealthOf, goldOf } from './judge.js';
import { grantsMeasure } from './grants.js';
import { progressConfig, progressConfigOf, forgetProgressConfig, PROGRESS_LINE, PROGRESS_STREAMS } from './progress.js';
import { REALM_LETTER_TEMPLATE } from '../../src/net/realmGoldLaw.js';

export const REALM_FINDINGS_KEEP_S = 90 * 24 * 3600;
export const REALM_WEALTH_KEEP_S = 30 * 24 * 3600;
export const MEASURE_PLAYED_MIN = 600;
export const HOLDS_LIST_MAX = 200;
export const NOTE_MAX = 300;
export const MEASURE_QUANTILES = Object.freeze([0.5, 0.9, 0.99, 0.999]);
export const GAINS_LIST_MAX = 200;
export const TRADES_LIST_MAX = 200;
const repairAnswer = (/** @type {any} */ r, /** @type {boolean} */ repeat) => ({
  ok: true, repeat, ticket: r.ticket, seq: r.seq, faction: r.faction, flag: r.flag, was: r.was, cleared: (r.was & r.flag) !== 0, gold: r.gold, by: r.by_handle, at: r.at,
});
const mendAnswer = (/** @type {any} */ r, /** @type {boolean} */ repeat) => ({
  ok: true, repeat, ticket: r.ticket, seq: r.seq, was: r.was, gold: r.gold, held: r.held_now ?? null, by: r.by_handle, at: r.at,
});
const bankAnswer = (/** @type {any} */ r, /** @type {boolean} */ repeat) => ({
  ok: true, repeat, ticket: r.ticket, seq: r.seq, was: r.was, gold: r.gold, held: r.held_now ?? null, by: r.by_handle, at: r.at,
});
// realm_repairs encodes the act in `faction`: 0 a mend, BANK_SET_FACTION a bank set, below it a guild letter, and
// 1 or more a faction repair. Older rows keep reading as their kind, so these values never change.
export const BANK_SET_FACTION = -1;
export const letterRowFaction = (/** @type {'db' | 'tg'} */ guild) => -GUILD_LETTERS[guild].faction;
const rowKindOf = (/** @type {any} */ r) => (r.faction === 0 ? 'mend' : r.faction === BANK_SET_FACTION ? 'bank' : r.faction < BANK_SET_FACTION ? 'letter' : 'repair');
export const PURSE_SIG = lawSigOf([{ code: 'gold' }]);

const noteOf = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.slice(0, NOTE_MAX) : null);
const parse = (/** @type {string} */ t) => { try { return JSON.parse(t); } catch { return null; } };

export const staffFinding = (/** @type {any} */ db, /** @type {any} */ row, /** @type {number} */ nowS, /** @type {any} */ detail) => db.prepare(
  "INSERT INTO realm_findings (player, char_id, seq, at, law, kind, detail) VALUES (?, ?, ?, ?, 0, 'staff', ?)",
).bind(row.player, row.id, row.seq, nowS, JSON.stringify(detail));

const rowOf = (/** @type {any} */ db, /** @type {unknown} */ id) => (typeof id === 'string' && REALM_ID_RE.test(id)
  ? db.prepare('SELECT * FROM realm_characters WHERE id = ?').bind(id).first() : Promise.resolve(null));

/**
 * @param {any} ctx
 * @param {any} player
 * @param {any} env
 * @param {string} act
 * @param {any} body
 */
export async function reviewAct(ctx, player, env, act, body = {}) {
  const { db, bucket, nowS } = ctx;
  if (!isDeveloper(player, env)) return { error: 'not-developer' };
  const by = player.handle;
  if (act === 'holds') {
    const { results = [] } = await db.prepare(
      `SELECT c.id, c.name, c.player, p.handle, c.held, c.held_at, c.held_until, c.strikes, c.law_holds, c.review, c.wealth, c.seq, c.clean_seq,
         (SELECT kind || ':' || detail FROM realm_findings f WHERE f.char_id = c.id ORDER BY f.id DESC LIMIT 1) AS last
       FROM realm_characters c LEFT JOIN players p ON p.id = c.player
       WHERE c.held IS NOT NULL OR c.review IS NOT NULL ORDER BY c.held_at DESC LIMIT ?`,
    ).bind(HOLDS_LIST_MAX).all();
    return { characters: results };
  }
  if (act === 'budget') {
    if (body.set !== undefined) {
      const config = budgetConfigOf(body.set);
      if (!config) return { error: 'body' };
      await db.prepare("INSERT INTO realm_config (key, value, at, by) VALUES ('budget', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, at = excluded.at, by = excluded.by")
        .bind(JSON.stringify(config), nowS, by).run();
      forgetBudgetConfig(db);
    }
    return measure(db, nowS, Number.isSafeInteger(body.days) && body.days >= 1 && body.days <= 30 ? body.days : 7);
  }
  if (act === 'progress') {
    if (body.set !== undefined) {
      const config = progressConfigOf(body.set);
      if (!config) return { error: 'body' };
      await db.prepare("INSERT INTO realm_config (key, value, at, by) VALUES ('progress', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, at = excluded.at, by = excluded.by")
        .bind(JSON.stringify(config), nowS, by).run();
      forgetProgressConfig(db);
    }
    return progressMeasure(db, nowS, Number.isSafeInteger(body.days) && body.days >= 1 && body.days <= 30 ? body.days : 7);
  }
  if (act === 'bodies') return bodiesMeasure(db, nowS, Number.isSafeInteger(body.days) && body.days >= 1 && body.days <= 30 ? body.days : 7);
  if (act === 'grants') return grantsMeasure(db, nowS, Number.isSafeInteger(body.days) && body.days >= 1 && body.days <= 30 ? body.days : 7, ranked);
  if (act === 'gains') return gainsMeasure(db, nowS, Number.isSafeInteger(body.days) && body.days >= 1 && body.days <= 30 ? body.days : 7);
  if (act === 'characters') {
    if (!isHandleShaped(body.name)) return { error: 'body' };
    const account = await db.prepare('SELECT id, handle FROM players WHERE handle_lc = ? AND handle IS NOT NULL').bind(body.name.toLowerCase()).first();
    if (!account) return { error: 'no-player' };
    const { results = [] } = await db.prepare('SELECT id, name, seq, lease, lease_at, dead_at, held, created_at, updated_at FROM realm_characters WHERE player = ? ORDER BY created_at')
      .bind(account.id).all();
    return {
      player: { id: account.id, handle: account.handle },
      characters: results.map((/** @type {any} */ c) => ({
        id: c.id, name: c.name, seq: c.seq, playing: !!c.lease && nowS - (c.lease_at ?? 0) < REALM_PLAYING_S, dead: c.dead_at != null, held: c.held, createdAt: c.created_at, updatedAt: c.updated_at,
      })),
    };
  }
  const row = await rowOf(db, body.id);
  if (!row) return typeof body.id === 'string' ? { error: 'no-realm-character' } : { error: 'body' };
  const note = noteOf(body.note);
  if (act === 'trades') return tradesOf(db, row);
  if (act === 'findings') {
    const f = await db.prepare('SELECT seq, at, law, kind, detail FROM realm_findings WHERE char_id = ? ORDER BY id DESC LIMIT 100').bind(row.id).all();
    const h = await db.prepare('SELECT hour, level, gain, loss, played_s, checkpoints FROM realm_wealth_hours WHERE char_id = ? ORDER BY hour DESC LIMIT 336').bind(row.id).all();
    let record = null;
    try { record = bucket && row.obj ? parse(await realmSaveTextOf(await bucket.get(row.obj)) ?? '') : null; } catch { record = null; }
    return {
      character: { id: row.id, name: row.name, held: row.held, heldUntil: row.held_until ?? null, strikes: row.strikes, lawHolds: row.law_holds ?? 0, dupes: row.dupes ?? 0, review: row.review, wealth: row.wealth, allowance: row.allowance, seq: row.seq, clean_seq: row.clean_seq, purse: record?.goldPieces ?? null },
      findings: (f.results ?? []).map((/** @type {any} */ r) => ({ ...r, detail: parse(r.detail) })),
      hours: h.results ?? [],
    };
  }
  if (act === 'clear') {
    await db.batch([
      db.prepare(`UPDATE realm_characters SET held = NULL, held_at = NULL, held_until = NULL, strikes = 0, law_holds = 0, law_at = NULL, review = NULL,
        law_excused = CASE WHEN law_v IS NULL THEN law_sig ELSE law_sig || '|' || law_v END, allowance = NULL, judge_rev = judge_rev + 1 WHERE id = ?`).bind(row.id),
      staffFinding(db, row, nowS, { act: 'clear', by, note, was: row.held, review: row.review, excused: row.law_sig ?? null, ...(row.law_v != null ? { values: row.law_v } : {}) }),
    ]);
    return { ok: true };
  }
  if (act === 'hold') {
    await db.batch([
      db.prepare("UPDATE realm_characters SET held = 'staff', held_at = ?, judge_rev = judge_rev + 1 WHERE id = ?").bind(nowS, row.id),
      staffFinding(db, row, nowS, { act: 'hold', by, note }),
    ]);
    return { ok: true };
  }
  if (act === 'repair') return repairAct(ctx, row, by, note, body);
  if (act === 'mend') return mendAct(ctx, row, by, note, body);
  if (act === 'bank') return bankAct(ctx, row, by, note, body);
  if (act === 'letter') return letterAct(ctx, row, by, note, body);
  if (act === 'rollback') {
    if (row.dead_at != null) return { error: 'dead' };
    if (!row.clean_obj || !bucket) return { error: 'no-clean' };
    // Rolling back past a service move would bring back a piece that now sits in a sale, a vault, or a trade.
    if (row.svc_seq != null && row.svc_seq > (row.clean_seq ?? 0)) return { error: 'service-moved' };
    const object = await bucket.get(row.clean_obj);
    const text = await realmSaveTextOf(object);
    const save = parse(text ?? '');
    if (!save) return { error: 'no-clean' };
    const moved = await db.prepare(
      'UPDATE realm_characters SET seq = seq + 1, obj = clean_obj, prev = obj, bytes = ?, lease = NULL, judged_seq = seq + 1, clean_seq = seq + 1,'
      // A staff hold survives the rollback; only a clear lifts it.
      + " held = CASE WHEN held = 'staff' THEN 'staff' END, held_at = CASE WHEN held = 'staff' THEN held_at END,"
      + ' held_until = NULL, strikes = 0, law_holds = 0, law_at = NULL, law_sig = NULL, wealth = ?, witnessed = 0, judge_rev = judge_rev + 1, updated_at = ? WHERE id = ? AND clean_obj = ? AND seq = ? AND dead_at IS NULL',
    ).bind(new TextEncoder().encode(text ?? '').byteLength, wealthOf(save), nowS, row.id, row.clean_obj, row.seq).run();
    if (!moved.meta.changes) return { error: 'no-clean' };
    await staffFinding(db, row, nowS, { act: 'rollback', by, note, from: row.seq, to: row.clean_seq }).run();
    await dropObjects(bucket, [row.prev === row.clean_obj ? null : row.prev]);
    return { ok: true, seq: row.seq + 1 };
  }
  return { error: 'body' };
}

/**
 * @param {any} ctx
 * @param {any} row
 * @param {'repair' | 'mend' | 'bank' | 'letter'} kind
 * @param {string} ticket
 * @param {(save: any) => string | null} change
 * @param {(seq: number) => any[]} steps
 * @param {(r: any, repeat: boolean) => any} answer
 */
async function staffMend(ctx, row, kind, ticket, change, steps, answer) {
  const { db, bucket } = ctx;
  if (row.dead_at != null) return { error: 'dead' };
  const done = () => db.prepare('SELECT r.*, c.held AS held_now FROM realm_repairs r JOIN realm_characters c ON c.id = r.char_id WHERE r.char_id = ? AND r.ticket = ?').bind(row.id, ticket).first();
  const said = (/** @type {any} */ r, /** @type {boolean} */ repeat) => (rowKindOf(r) === kind ? answer(r, repeat) : { error: 'repair-ticket' });
  const had = await done();
  if (had) return said(had, true);
  // The seized record moves one sequence on with its lease cleared, so the playing tab can never write over it. The
  // ticket row shares the batch, so of two identical asks one rolls back.
  const prep = await seizeRealmRecord({ ...ctx, bucket }, row.player, row.id, change, { escrow: false });
  if ('error' in prep) return { error: prep.error };
  try {
    await db.batch([...prep.steps, ...steps(prep.seq)]);
  } catch {
    await dropIfUnnamed(db, bucket, row.player, row.id, prep.key);
    const landed = await done();
    return landed ? said(landed, true) : { error: 'seq' };
  }
  await dropObjects(bucket, [prep.prev]);
  const landed = await done();
  return landed ? said(landed, false) : { error: 'seq' };
}

/**
 * @param {any} ctx
 * @param {any} row
 * @param {string} by
 * @param {string | null} note
 * @param {any} body
 */
async function repairAct(ctx, row, by, note, body) {
  const { db, nowS } = ctx;
  const repair = repairOf(body);
  if (!repair) return { error: 'body' };
  let was = 0;
  return staffMend(ctx, row, 'repair', repair.ticket, (save) => {
    const r = applyRepair(save, repair);
    if (typeof r === 'string') return r;
    was = r.was;
    return null;
  }, (seq) => [
    db.prepare('INSERT INTO realm_repairs (char_id, ticket, player, by_handle, at, faction, flag, was, gold, seq, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(row.id, repair.ticket, row.player, by, nowS, repair.faction, repair.flag, was, repair.gold, seq, note),
    staffFinding(db, row, nowS, { act: 'repair', by, note, ticket: repair.ticket, faction: repair.faction, flag: repair.flag, was, gold: repair.gold, from: row.seq, to: seq }),
    ...(repair.gold > 0 ? [faucetStatement(db, 'repair', Math.floor(nowS / 3600), repair.gold)] : []),
  ], repairAnswer);
}

/**
 * @param {any} ctx
 * @param {any} row
 * @param {string} by
 * @param {string | null} note
 * @param {any} body
 */
async function mendAct(ctx, row, by, note, body) {
  const { db, nowS } = ctx;
  const mend = purseMendOf(body);
  if (!mend) return { error: 'body' };
  const lift = row.held === 'law' && row.law_sig === PURSE_SIG && !(row.held_until > nowS);
  return staffMend(ctx, row, 'mend', mend.ticket, (save) => {
    const r = applyPurseMend(save, mend);
    return typeof r === 'string' ? r : null;
  }, (seq) => [
    ...(lift ? [
      db.prepare('UPDATE realm_characters SET held = NULL, held_at = NULL, law_sig = NULL, judge_rev = judge_rev + 1 WHERE id = ? AND judge_rev = ? AND judged_seq IS ?')
        .bind(row.id, row.judge_rev, row.judged_seq),
      mustChange(db),
    ] : []),
    db.prepare('INSERT INTO realm_repairs (char_id, ticket, player, by_handle, at, faction, flag, was, gold, seq, note) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)')
      .bind(row.id, mend.ticket, row.player, by, nowS, mend.was, mend.gold, seq, note),
    staffFinding(db, row, nowS, { act: 'mend', by, note, ticket: mend.ticket, was: mend.was, gold: mend.gold, lifted: lift, from: row.seq, to: seq }),
    ...(mend.gold > 0 ? [faucetStatement(db, 'repair', Math.floor(nowS / 3600), mend.gold)] : []),
  ], mendAnswer);
}

/**
 * @param {any} ctx
 * @param {any} row
 * @param {string} by
 * @param {string | null} note
 * @param {any} body
 */
async function bankAct(ctx, row, by, note, body) {
  const { db, nowS } = ctx;
  const set = bankSetOf(body);
  if (!set) return { error: 'body' };
  let up = 0;
  return staffMend(ctx, row, 'bank', set.ticket, (save) => {
    // The faucet is counted from the bank as the judge counts it, not from `was`, so it matches what was witnessed.
    up = set.gold - (Array.isArray(save.bankAccounts) ? save.bankAccounts : []).reduce((/** @type {number} */ g, /** @type {any} */ a) => g + goldOf(a?.accountGold), 0);
    const r = applyBankSet(save, set);
    return typeof r === 'string' ? r : null;
  }, (seq) => [
    db.prepare('INSERT INTO realm_repairs (char_id, ticket, player, by_handle, at, faction, flag, was, gold, seq, note) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)')
      .bind(row.id, set.ticket, row.player, by, nowS, BANK_SET_FACTION, set.was, set.gold, seq, note),
    staffFinding(db, row, nowS, { act: 'bank', by, note, ticket: set.ticket, was: set.was, gold: set.gold, from: row.seq, to: seq }),
    ...(up > 0 ? [faucetStatement(db, 'repair', Math.floor(nowS / 3600), up)] : []),
  ], bankAnswer);
}

const letterAnswer = (/** @type {any} */ r, /** @type {boolean} */ repeat) => ({
  ok: true, repeat, ticket: r.ticket, seq: r.seq, guild: r.faction === letterRowFaction('db') ? 'db' : 'tg',
  op: r.flag === GUILD_LETTER_OPS.cancel ? 'cancel' : 'send', was: r.was, held: r.held_now ?? null, by: r.by_handle, at: r.at,
});

/**
 * @param {any} ctx
 * @param {any} row
 * @param {string} by
 * @param {string | null} note
 * @param {any} body
 */
async function letterAct(ctx, row, by, note, body) {
  const { db, nowS } = ctx;
  const fix = guildLetterOf(body);
  if (!fix) return { error: 'body' };
  let was = 0;
  return staffMend(ctx, row, 'letter', fix.ticket, (save) => {
    const r = applyGuildLetter(save, fix);
    if (typeof r === 'string') return r;
    was = r.was;
    return null;
  }, (seq) => [
    db.prepare('INSERT INTO realm_repairs (char_id, ticket, player, by_handle, at, faction, flag, was, gold, seq, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
      .bind(row.id, fix.ticket, row.player, by, nowS, letterRowFaction(fix.guild), GUILD_LETTER_OPS[fix.op], was, seq, note),
    staffFinding(db, row, nowS, { act: 'letter', by, note, ticket: fix.ticket, guild: fix.guild, op: fix.op, was, from: row.seq, to: seq }),
  ], letterAnswer);
}

/**
 * @param {number} n
 * @param {(rank: number) => Promise<any>} at
 */
async function ranked(n, at) {
  const quantiles = [];
  for (const q of MEASURE_QUANTILES) quantiles.push([q, n ? await at(Math.min(n - 1, Math.ceil(q * n) - 1)) : null]);
  return { quantiles, most: n ? await at(n - 1) : null };
}

/**
 * @param {any} db
 * @param {number} nowS
 * @param {number} days
 */
export async function measure(db, nowS, days) {
  const config = await budgetConfig(db);
  const since = nowS - days * 24 * 3600;
  const rate = 'CAST(ROUND(gain * 3600.0 / played_s) AS INTEGER)';
  const where = 'hour >= ?1 AND played_s >= ?2 AND level > ?3 AND level <= ?4';
  const bands = [];
  let lo = 0;
  for (const b of config.bands) {
    const n = Number((await db.prepare(`SELECT COUNT(*) AS n FROM realm_wealth_hours WHERE ${where}`).bind(since, MEASURE_PLAYED_MIN, lo, b.upTo).first())?.n ?? 0);
    const at = async (/** @type {number} */ rank) => (await db.prepare(`SELECT ${rate} AS r FROM realm_wealth_hours WHERE ${where} ORDER BY r LIMIT 1 OFFSET ?5`)
      .bind(since, MEASURE_PLAYED_MIN, lo, b.upTo, rank).first())?.r ?? null;
    const { quantiles, most } = await ranked(n, at);
    const overs = Number((await db.prepare("SELECT COUNT(*) AS n FROM realm_findings WHERE at >= ?1 AND kind IN ('measure', 'budget') AND json_extract(detail, '$.level') > ?2 AND json_extract(detail, '$.level') <= ?3")
      .bind(since, lo, b.upTo).first())?.n ?? 0);
    bands.push({ from: lo + 1, upTo: b.upTo, rate: b.rate, cap: b.cap, hours: n, quantiles, most, overs });
    lo = b.upTo;
  }
  const { results: paid = [] } = await db.prepare('SELECT kind, SUM(gold) AS gold, SUM(n) AS n FROM realm_faucets WHERE hour >= ?1 GROUP BY kind')
    .bind(Math.floor(since / 3600)).all();
  const faucets = FAUCET_KINDS.map((kind) => {
    const r = paid.find((/** @type {any} */ x) => x.kind === kind);
    return { kind, gold: Number(r?.gold ?? 0), n: Number(r?.n ?? 0) };
  });
  return { days, config, isDefault: config === BUDGET_DEFAULT, bands, faucets };
}

/**
 * @param {any} db
 * @param {number} nowS
 * @param {number} days
 */
export async function progressMeasure(db, nowS, days) {
  const config = await progressConfig(db);
  const since = nowS - days * 24 * 3600;
  const rate = 'CAST(ROUND(amount * 3600.0 / played_s) AS INTEGER)';
  const where = 'stream = ?1 AND hour >= ?2 AND played_s >= ?3';
  const streams = [];
  for (const stream of PROGRESS_STREAMS) {
    const n = Number((await db.prepare(`SELECT COUNT(*) AS n FROM progress_hours WHERE ${where}`).bind(stream, since, MEASURE_PLAYED_MIN).first())?.n ?? 0);
    const at = async (/** @type {number} */ rank) => (await db.prepare(`SELECT ${rate} AS r FROM progress_hours WHERE ${where} ORDER BY r LIMIT 1 OFFSET ?4`)
      .bind(stream, since, MEASURE_PLAYED_MIN, rank).first())?.r ?? null;
    const { quantiles, most } = await ranked(n, at);
    const over = await db.prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT player) AS accounts, COALESCE(SUM(over), 0) AS units FROM progress_hours WHERE stream = ?1 AND hour >= ?2 AND over > 0')
      .bind(stream, since).first();
    streams.push({ stream, ...config.streams[stream], hours: n, quantiles, most, overs: Number(over?.n ?? 0), accounts: Number(over?.accounts ?? 0), past: Number(over?.units ?? 0) });
  }
  return { days, enforce: config.enforce, isDefault: config === PROGRESS_LINE, streams };
}

/**
 * @param {any} db
 * @param {number} nowS
 * @param {number} days
 */
export async function gainsMeasure(db, nowS, days) {
  const since = nowS - days * 24 * 3600;
  const { results = [] } = await db.prepare(
    `SELECT f.char_id AS id, c.name, c.player, p.handle, c.held, c.wealth, COUNT(*) AS n,
       MAX(CAST(json_extract(f.detail, '$.gain') AS INTEGER)) AS gain, MAX(f.at) AS last
     FROM realm_findings f JOIN realm_characters c ON c.id = f.char_id LEFT JOIN players p ON p.id = c.player
     WHERE f.at >= ?1 AND f.kind IN ('measure', 'budget')
     GROUP BY f.char_id ORDER BY gain DESC LIMIT ?2`,
  ).bind(since, GAINS_LIST_MAX).all();
  return { days, characters: results };
}

export const receiptOf = (/** @type {any} */ side) => {
  const items = Array.isArray(side?.items) ? side.items : [];
  const letters = items.filter((/** @type {any} */ it) => it?.templateIndex === REALM_LETTER_TEMPLATE).reduce((/** @type {number} */ n, /** @type {any} */ it) => n + (Number(it.value) || 0), 0);
  return { gold: Number(side?.gold) || 0, letters, pieces: items.length };
};

/**
 * @param {any} db
 * @param {any} row
 */
export async function tradesOf(db, row) {
  const { results = [] } = await db.prepare(
    `SELECT t.sid, t.created_at AS at, t.a_char, t.b_char, t.a_player, t.b_player, t.result,
       ca.name AS a_name, cb.name AS b_name, pa.handle AS a_handle, pb.handle AS b_handle
     FROM realm_trades t
       LEFT JOIN realm_characters ca ON ca.id = t.a_char LEFT JOIN realm_characters cb ON cb.id = t.b_char
       LEFT JOIN players pa ON pa.id = t.a_player LEFT JOIN players pb ON pb.id = t.b_player
     WHERE t.state = 'done' AND (t.a_char = ?1 OR t.b_char = ?1) ORDER BY t.created_at DESC LIMIT ?2`,
  ).bind(row.id, TRADES_LIST_MAX).all();
  const trades = results.map((/** @type {any} */ t) => {
    const r = parse(t.result) ?? {};
    // The row stores what each side received, so what this character gave is what the other side got.
    const mine = t.a_char === row.id ? 'a' : 'b', theirs = mine === 'a' ? 'b' : 'a';
    return {
      sid: t.sid, at: t.at,
      with: { id: t[`${theirs}_char`] ?? null, name: t[`${theirs}_name`] ?? null, player: t[`${theirs}_player`] ?? null, handle: t[`${theirs}_handle`] ?? null },
      gave: receiptOf(r[theirs]), got: receiptOf(r[mine]),
    };
  });
  return { character: { id: row.id, name: row.name }, trades };
}

export const BODY_TABLES = Object.freeze([['gate', 'gate_kills'], ['sd', 'sd_kills'], ['serpent', 'serpent_kills']]);
export const BODY_MEASURE_S_MIN = 60;

/**
 * @param {any} db
 * @param {number} nowS
 * @param {number} days
 */
export async function bodiesMeasure(db, nowS, days) {
  const since = nowS - days * 24 * 3600;
  const rate = `CAST(ROUND((json_extract(body, '$[1]') + json_extract(body, '$[2]')) * 60.0 / MAX(json_extract(body, '$[5]'), ${BODY_MEASURE_S_MIN})) AS INTEGER)`;
  const fights = [];
  for (const [fight, table] of BODY_TABLES) {
    const where = 'at >= ?1 AND body IS NOT NULL';
    const count = async (/** @type {string} */ more) => Number((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}${more}`).bind(since).first())?.n ?? 0);
    const n = await count('');
    const at = async (/** @type {number} */ rank) => (await db.prepare(`SELECT ${rate} AS r FROM ${table} WHERE ${where} ORDER BY r LIMIT 1 OFFSET ?2`).bind(since, rank).first())?.r ?? null;
    const { quantiles, most } = await ranked(n, at);
    fights.push({
      fight, receipts: n, quantiles, most,
      over: await count(" AND json_extract(body, '$[2]') > 0"),
      fell: await count(" AND json_extract(body, '$[3]') > 0"),
      lost: await count(" AND json_extract(body, '$[4]') = 0"),
    });
  }
  return { days, fights };
}
