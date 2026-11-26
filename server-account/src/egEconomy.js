// @ts-check

import { arenaWeekOf, arenaSeasonOf, arenaSeasonEndsS, ARENA_SEASON_S } from '../../src/net/arenaLaw.js';
import { egValkRedoubt, egSpoilsPasses, egPanoplyHit, egEmbersOf, egSpoilsSeed, EG_PANOPLY_PITY, EG_VALK_KEY_ODDS, EG_SINK_EMBERS, EG_PANOPLY_IDS } from '../../src/net/eliteGates/egPay.js';
import { egStrikeStatement, egStrikeAnswer, deedStatements, deedEvent, deedAnswer } from './marks.js';
import { EMBERS_EARNED_SQL } from './accounts.js';
import { brokerRidOk, brokerSaleOf, brokerSaleWrite, brokerRidFreeSql } from './brokerSales.js';

const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const RL_MAX = 64;

export const egSeasonWeek0 = (nowS) => arenaWeekOf(arenaSeasonEndsS(arenaSeasonOf(nowS)) - ARENA_SEASON_S);

async function purseOf(db, id) {
  const r = await db.prepare(`SELECT MAX(0, ${EMBERS_EARNED_SQL} - insignia_spent) AS n FROM players WHERE id = ?1`).bind(id).first();
  return int(r?.n);
}

/** @param {string} count @param {boolean[]} hits */
function pitySql(count, hits) {
  let n = count;
  const forced = [];
  hits.forEach((hit, p) => {
    forced.push(`(CASE WHEN ${n} >= ${EG_PANOPLY_PITY} THEN ${1 << p} ELSE 0 END)`);
    n = hit ? '0' : `(CASE WHEN ${n} >= ${EG_PANOPLY_PITY} THEN 0 ELSE ${n} + 1 END)`;
  });
  return { forced: forced.join(' + '), after: n };
}

/** @param {{ db: any, nowS: number, rand: (b: Uint8Array) => Uint8Array }} ctx
 * @param {{ id: string, handle?: string|null }} player @param {any} c
 * @param {{ env?: any, character?: string|null, draw?: (p: number) => boolean }} [opts] */
export async function egRedoubtPay({ db, nowS, rand }, player, c, { env = null, character = null, draw = () => false } = {}) {
  const ctx = { db, nowS };
  const b = c.b, w = c.w, week = arenaWeekOf(nowS), payable = c.rh === 1 ? 0 : 1;
  const nonce = hex(rand(new Uint8Array(8)));
  const hits = Array.from({ length: egSpoilsPasses(w) }, (_, p) => egPanoplyHit(egSpoilsSeed(c.c, nonce), w, p));
  const row = db.prepare(`INSERT OR IGNORE INTO eg_redoubts (b, account, w, h, t, at, wk, paid, stones, nonce, forced)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, q.paid,
      CASE WHEN q.paid = 0 THEN 0 WHEN NOT EXISTS (SELECT 1 FROM eg_redoubts WHERE account = ?2 AND w = ?3 AND paid = 1 AND wk >= ?10) THEN ?11 ELSE ?12 END,
      ?8, CASE WHEN q.paid = 1 THEN ${pitySql('(SELECT eg_pity FROM players WHERE id = ?2)', hits).forced} ELSE 0 END
    FROM (SELECT CASE WHEN ?9 = 1 AND NOT EXISTS (SELECT 1 FROM eg_redoubts WHERE account = ?2 AND w = ?3 AND wk = ?7 AND paid = 1) THEN 1 ELSE 0 END AS paid) q`)
    .bind(b, player.id, w, c.h, c.t, nowS, week, nonce, payable, egSeasonWeek0(nowS), egEmbersOf(w, true), egEmbersOf(w, false));
  /** @type {any[]} */
  const statements = [];
  /** @type {Record<string, number>} */
  const at = {};
  const add = (k, st) => { if (st) { at[k] = statements.length; statements.push(st); } };
  const event = deedEvent('eg', `${b}:${w}`);
  if (payable) {
    // Every payment runs only while the row this claim stamped with its nonce stands paid, so two racing
    // claims take one week's pay between them.
    const mine = 'EXISTS (SELECT 1 FROM eg_redoubts WHERE b = ?1 AND account = ?2 AND w = ?3 AND nonce = ?4 AND paid = 1)';
    add('marks', egStrikeStatement(ctx, player, env, week, b, w, nonce));
    const deed = deedStatements(ctx, player, env, { kind: 'eg', event, character, guard: [b, w, nonce] });
    if (deed) { add('mark', deed[0]); add('deed', deed[1]); }
    add('pity', db.prepare(`UPDATE players SET eg_pity = ${pitySql('eg_pity', hits).after} WHERE id = ?2 AND ${mine}`).bind(b, player.id, w, nonce));
    if (egValkRedoubt(w) && draw(EG_VALK_KEY_ODDS)) {
      // The key is marked only while the week has given none and counted only by the row so marked, so two
      // Valkynaz claims at once find one key.
      add('wkey', db.prepare(`UPDATE eg_redoubts SET wkey = 1 WHERE b = ?1 AND account = ?2 AND w = ?3 AND nonce = ?4 AND paid = 1
        AND EXISTS (SELECT 1 FROM players WHERE id = ?2 AND eg_valk_wk != ?5)`).bind(b, player.id, w, nonce, week));
      add('key', db.prepare(`UPDATE players SET eg_keys = eg_keys + 1, eg_valk_wk = ?5 WHERE id = ?2
        AND EXISTS (SELECT 1 FROM eg_redoubts WHERE b = ?1 AND account = ?2 AND w = ?3 AND nonce = ?4 AND wkey = 1)`).bind(b, player.id, w, nonce, week));
    }
  }
  /** @param {boolean} recorded @param {any[]} results */
  const answer = async (recorded, results) => {
    const r = await db.prepare('SELECT wk, paid, stones, forced, wkey, nonce FROM eg_redoubts WHERE b = ?1 AND account = ?2 AND w = ?3').bind(b, player.id, w).first();
    const me = await db.prepare(`SELECT eg_keys, MAX(0, ${EMBERS_EARNED_SQL} - insignia_spent) AS purse FROM players WHERE id = ?1`).bind(player.id).first();
    const paid = int(r?.paid) === 1;
    const wrote = (k) => at[k] !== undefined && Number(results?.[at[k]]?.meta?.changes ?? 0) > 0;
    return {
      b, w, paid, ...(recorded ? {} : { again: true }),
      marks: paid ? await egStrikeAnswer(ctx, player, env, recorded ? wrote('marks') : true, int(r?.wk), w) : null,
      deed: recorded && at.deed !== undefined ? await deedAnswer(db, player, event, wrote('deed')) : null,
      embers: int(r?.stones), purse: int(me?.purse),
      seed: egSpoilsSeed(c.c, r?.nonce),
      weir: paid && egValkRedoubt(w) ? { found: int(r?.wkey) === 1, keys: int(me?.eg_keys) } : null,
      pity: hits.map((_, p) => p).filter((p) => (int(r?.forced) & (1 << p)) !== 0),
    };
  };
  return { row, statements, answer };
}

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string }} player @param {any} c */
export async function egReliquariesOf({ db, nowS }, player, c) {
  if (!Array.isArray(c?.rl)) return {};
  if (c.rh === 1) return { rl: [] };
  const named = c.rl.slice(0, RL_MAX).filter((w) => Number.isSafeInteger(w) && w >= 1 && w <= 19_999);
  if (!named.length) return { rl: [] };
  const opened = async () => new Set(((await db.prepare('SELECT w FROM eg_reliqs WHERE account = ?1 AND b = ?2').bind(player.id, c.b).all())?.results ?? []).map((r) => int(r.w)));
  let mineOpen = await opened();
  if (!mineOpen.size) {
    const here = await db.prepare('SELECT w, paid FROM eg_redoubts WHERE b = ?1 AND account = ?2').bind(c.b, player.id).all();
    const wk = arenaWeekOf(nowS);
    const week = await db.prepare('SELECT DISTINCT w FROM eg_redoubts WHERE account = ?1 AND wk = ?2 AND paid = 1').bind(player.id, wk).all();
    const mine = new Map((here?.results ?? []).map((r) => [int(r.w), int(r.paid) === 1]));
    const paidWeek = new Set((week?.results ?? []).map((r) => int(r.w)));
    const pays = [...new Set(named.filter((w) => (mine.has(w) ? mine.get(w) : !paidWeek.has(w))))];
    if (pays.length) await db.batch(pays.map((w) => db.prepare('INSERT OR IGNORE INTO eg_reliqs (account, wk, w, b) VALUES (?1, ?2, ?3, ?4)').bind(player.id, wk, w, c.b)));
    mineOpen = await opened();
  }
  return { rl: named.filter((w) => mineOpen.has(w)) };
}

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string }} player */
export async function egSinkOf({ db, nowS }, player) {
  return egSinkFrom(nowS, await egSinkStmt(db, nowS, player.id).first());
}
export const egSinkStmt = (/** @type {any} */ db, /** @type {number} */ nowS, /** @type {string} */ id) => db.prepare('SELECT piece FROM eg_sink WHERE account = ?1 AND wk = ?2').bind(id, arenaWeekOf(nowS));
export const egSinkFrom = (/** @type {number} */ nowS, /** @type {any} */ r) => ({ week: arenaWeekOf(nowS), piece: typeof r?.piece === 'string' ? r.piece : null });

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body */
export async function egSink({ db, nowS }, player, body) {
  if (!player?.handle) return { error: 'guest' };
  const piece = body?.piece;
  if (typeof piece !== 'string' || !EG_PANOPLY_IDS.includes(piece)) return { error: 'piece' };
  const week = arenaWeekOf(nowS);
  const rid = body?.rid ?? null;
  if (rid !== null && !brokerRidOk(rid)) return { error: 'rid' };
  const [took] = await db.batch([
    // This UPDATE decides the sale; the eg_sink row below is written only when it changed a row.
    db.prepare(`UPDATE players SET insignia_spent = insignia_spent + ?3, last_seen = ?4
      WHERE id = ?1
        AND NOT EXISTS (SELECT 1 FROM eg_sink WHERE account = ?1 AND wk = ?2)
        AND ${EMBERS_EARNED_SQL} - insignia_spent >= ?3${rid ? `
        AND ${brokerRidFreeSql('?1', '?5')}` : ''}
      RETURNING insignia_spent`).bind(player.id, week, EG_SINK_EMBERS, nowS, ...(rid ? [rid] : [])),
    db.prepare('INSERT INTO eg_sink (account, wk, piece, at) SELECT ?1, ?2, ?3, ?4 WHERE changes() > 0').bind(player.id, week, piece, nowS),
    ...(rid ? [brokerSaleWrite(db, { account: player.id, rid, kind: 'panoply', item: piece, nowS })] : []),
  ]);
  if (!took?.results?.[0]) {
    const sold = rid ? await brokerSaleOf(db, player.id, rid) : null;
    if (sold?.kind === 'fence') return { error: 'fenced' };
    if (sold?.kind === 'panoply') return { ok: true, piece: sold.item, week: arenaWeekOf(sold.at), purse: await purseOf(db, player.id), again: true };
    const had = await egSinkOf({ db, nowS }, player);
    if (had.piece) return { error: 'bought', piece: had.piece };
    return { error: 'short', purse: await purseOf(db, player.id), price: EG_SINK_EMBERS };
  }
  return { ok: true, piece, week, purse: await purseOf(db, player.id) };
}
