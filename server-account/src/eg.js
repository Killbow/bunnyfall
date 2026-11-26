// @ts-check
// Weir Keys are a count on the account row, and the client restacks the pack item from every answer with `keys`.
// One conditional UPDATE takes the key and sets the live breach, so two opens at once spend one key.

import { verifyEgReceipt, EG_RECEIPT_TTL_S } from '../../src/net/eliteGates/egReceipt.js';
import { POST_SENDER } from '../../src/net/postLaw.js';
import { mintEgOrder } from '../../src/net/identityToken.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { egHonourStatements, egHonoursAnswer, egRecordStmts, egRecordFrom } from './egHonours.js';
import { egStandingOf, egFirstPost, egBoardsMoved } from './egHonours.js';
import { egRedoubtPay, egReliquariesOf, egSinkStmt, egSinkFrom } from './egEconomy.js';
import { arenaWeekOf } from '../../src/net/arenaLaw.js';
import { egMayStart, egWagerOf } from '../../src/net/eliteGates/egStartLaw.js';
import { egStartsFor } from './egStarts.js';
import { egSpoilsSeed } from '../../src/net/eliteGates/egPay.js';

export const EG_KEY_ODDS = 1 / 6;
export const EG_KEY_ODDS_RITE = 1 / 4;
export const EG_KEY_ODDS_PORTENT = 1 / 4;
export const EG_KEY_ODDS_SD = 1 / 3;
export const EG_KEY_PITY = 5;
// EG_LAST_WORD_S must match EG_LAST_WORD_MS in src/net/eliteGates/egLaw.js, in seconds.
export const EG_LAST_WORD_S = 10_800;
export const EG_OPEN_WINDOW_S = 600;
export const EG_LIVE_SLACK_S = 600;
export const EG_LIVE_S = EG_LAST_WORD_S + EG_OPEN_WINDOW_S + EG_LIVE_SLACK_S;
export const EG_ADMIT_WINDOW_S = EG_OPEN_WINDOW_S + EG_LIVE_SLACK_S;
export const EG_FIND_ODDS = Object.freeze({ super: 1 / 60, elite: 1 / 150, regular: 1 / 400 });
export const EG_FIND_PER_DAY = 6;
export const EG_FIND_KEYS_PER_WEEK = 2;
export const EG_RQ_RE = /^[a-z0-9]{16,32}$/;
// Must equal EG_VOID_MAX_S in src/net/eliteGates/egDurable.js, which is outside this Worker's bundle.
export const EG_VOID_WINDOW_S = 7 * 24 * 3600;
// Past this age no void can be minted for the stake's order and no receipt minted before it is still valid.
export const EG_STAKE_CLOCK_S = EG_VOID_WINDOW_S + EG_RECEIPT_TTL_S;
export const EG_STAKE_POST = Object.freeze({
  batch: 'spire-stake-',
  subject: 'A Weir Key spent',
  body: [
    'The Weir Key you staked on {day} opened a breach that never sent word back: no Redoubt, no end and no void reached the Spire\'s ledger in the time a key waits for one.',
    '',
    'That key is spent. It does not return.',
    '',
    `- ${POST_SENDER}`,
  ].join('\n'),
});
export const EG_STAKE_POST_HELD = Object.freeze({
  body: [
    'The Weir Key you staked on {day} was held for the first breach\'s mercy, which gives a key back when a first breach ends with no Redoubt taken. Your own end reached the Spire\'s ledger, but no word that the breach ended with no Redoubt taken came in the time a key waits for one.',
    '',
    'That key is spent. It does not return.',
    '',
    `- ${POST_SENDER}`,
  ].join('\n'),
});
// Migration 0113 sends this letter, and a test checks that its words match the migration's statement.
export const EG_LAUNCH_POST = Object.freeze({
  batch: 'spire-launch',
  subject: 'From the Battlespire',
  body: [
    'For the Dagon\'s Breach you closed, the Battlespire sends you a Weir Key - one of its portal keys, surrendered to the Kyn in 3E 398. It is already in your pack.',
    '',
    'Use it under open sky, away from any town, to open an Elite Breach: your party is called with you, and the Spire\'s halls go down as deep as you can take them.',
    '',
    `- ${POST_SENDER}`,
  ].join('\n'),
});
export const EG_FIRST_BITS_MAX = 0xffff;
const BREACH_RE = /^[0-9a-f]{16}$/;

const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const liveOf = (row, nowS) => (row?.eg_live_b && int(row.eg_live_until) > nowS ? { b: row.eg_live_b, until: int(row.eg_live_until) } : null);
const provenStmt = (db, id) => db.prepare("SELECT (EXISTS (SELECT 1 FROM gate_kills WHERE account = ?1 AND earned != 'rite') OR EXISTS (SELECT 1 FROM eg_redoubts WHERE account = ?1)) AS ok").bind(id);
const provenFrom = (r) => int(r?.ok) === 1;
async function proven(db, id) {
  return provenFrom(await provenStmt(db, id).first());
}
const playerRowStmt = (db, id) => db.prepare('SELECT eg_keys, eg_key_miss, eg_live_b, eg_live_until, eg_rh_day, eg_mercy, eg_first FROM players WHERE id = ?1').bind(id);
async function playerRow(db, id) {
  return playerRowStmt(db, id).first();
}

/**
 * @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} [env]
 */
export async function egKeysOf({ db, nowS }, player, env = null) {
  const id = player.id;
  const [row, rd, prv, sink, annals, feats] = await db.batch([
    playerRowStmt(db, id),
    db.prepare('SELECT COUNT(*) AS n FROM eg_redoubts WHERE account = ?1').bind(id),
    provenStmt(db, id),
    egSinkStmt(db, nowS, id),
    ...egRecordStmts(db, id),
  ]);
  const r0 = row.results?.[0];
  await egFirstPost(db, player, env, nowS);
  return {
    keys: int(r0?.eg_keys), live: liveOf(r0, nowS), rehearsal: int(r0?.eg_rh_day) !== utcDay(nowS), proven: provenFrom(prv.results?.[0]),
    redoubts: int(rd.results?.[0]?.n), sink: egSinkFrom(nowS, sink.results?.[0]),
    ...egRecordFrom(annals.results?.[0], feats.results), first: int(r0?.eg_first),
  };
}
/** @param {{ db: any }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body */
export async function egFirstSay({ db }, player, body) {
  if (!player.handle) return { error: 'guest' };
  const bits = body?.bits;
  if (!Number.isSafeInteger(bits) || bits < 0 || bits > EG_FIRST_BITS_MAX) return { error: 'bits' };
  const row = await db.prepare('UPDATE players SET eg_first = eg_first | ?2 WHERE id = ?1 RETURNING eg_first').bind(player.id, bits).first();
  return { first: int(row?.eg_first) };
}

/**
 * @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => Uint8Array }} ctx
 * @param {{ id: string, handle?: string|null }} player @param {any} body @param {CryptoKey|null} key
 */
export async function openEg({ db, nowS, subtle, rand }, player, body, key) {
  if (!key) return { error: 'no-signing-key' };
  if (!player.handle) return { error: 'guest' };
  const rq = body?.rq, rh = body?.rh === 1 ? 1 : 0;
  if (typeof rq !== 'string' || !EG_RQ_RE.test(rq)) return { error: 'rq' };
  const ew = body?.ew ?? 0, wg = egWagerOf(body?.wg);
  if (!Number.isSafeInteger(ew) || ew < 0 || ew > 999 || (rh && ew !== 0)) return { error: 'start', w: Number.isSafeInteger(ew) ? ew : 0 };
  if (!wg || (rh && wg.length)) return { error: 'wager' };
  const had = await db.prepare('SELECT ez, b, rh, at, until, state, ew, wg FROM eg_stakes WHERE account = ?1 AND rq = ?2').bind(player.id, rq).first();
  if (body?.again === 1) {
    if (!had) return { error: 'none' };
    if (had.state !== 'held') return { error: 'spent' };
    const row = await playerRow(db, player.id);
    const order = await mintEgOrder({ o: 'egopen', s: player.id, eb: had.b, ez: had.ez, ew: int(had.ew), rh: int(had.rh) === 1 ? 1 : undefined, ewg: wagerOfRow(had.wg) }, key, { subtle, nowS: int(had.at) });
    return { order, b: had.b, ez: had.ez, keys: int(row?.eg_keys), until: int(had.until), rh: int(had.rh), at: int(had.at) };
  }
  if (had) {
    if (had.state !== 'held' || int(had.until) <= nowS) return { error: 'spent' };
    const row = await playerRow(db, player.id);
    // A repeated request is signed as of the stake's own `at`, so it cannot open a second breach after
    // `eg_live` ends.
    const order = await mintEgOrder({ o: 'egopen', s: player.id, eb: had.b, ez: had.ez, ew: int(had.ew), rh: int(had.rh) === 1 ? 1 : undefined, ewg: wagerOfRow(had.wg) }, key, { subtle, nowS: int(had.at) });
    return { order, b: had.b, ez: had.ez, keys: int(row?.eg_keys), until: int(had.until), rh: int(had.rh) };
  }
  if (!rh && !(await proven(db, player.id))) return { error: 'unproven' };
  if (ew > 0 && !egMayStart(await egStartsFor(db, player.id, nowS), ew)) return { error: 'start', w: ew };
  const b = hex(rand(new Uint8Array(8))), ez = hex(rand(new Uint8Array(12))), until = nowS + EG_LIVE_S, day = utcDay(nowS);
  // The stake INSERT lands only if the UPDATE set this breach on the account row in the same batch.
  const [took] = await db.batch([
    db.prepare(`UPDATE players SET eg_keys = eg_keys - ?3, eg_rh_day = CASE WHEN ?6 = 1 THEN ?5 ELSE eg_rh_day END, eg_live_b = ?2, eg_live_until = ?4
      WHERE id = ?1 AND (eg_live_b IS NULL OR eg_live_until <= ?7) AND (CASE WHEN ?6 = 1 THEN eg_rh_day != ?5 ELSE eg_keys >= 1 END) RETURNING eg_keys`)
      .bind(player.id, b, rh ? 0 : 1, until, day, rh, nowS),
    db.prepare("INSERT INTO eg_stakes (ez, account, b, rq, rh, at, until, state, ew, wg) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'held', ?8, ?9 WHERE EXISTS (SELECT 1 FROM players WHERE id = ?2 AND eg_live_b = ?3)")
      .bind(ez, player.id, b, rq, rh, nowS, until, ew, wg.join(',')),
  ]);
  const left = took?.results?.[0];
  if (!left) {
    const row = await playerRow(db, player.id);
    const live = liveOf(row, nowS);
    if (live) return { error: 'live', b: live.b };
    return rh ? { error: 'rehearsed' } : { error: 'short', keys: int(row?.eg_keys) };
  }
  const order = await mintEgOrder({ o: 'egopen', s: player.id, eb: b, ez, ew, rh: rh ? 1 : undefined, ewg: wg.length ? wg : undefined }, key, { subtle, nowS });
  return { order, b, ez, keys: int(left.eg_keys), until, rh };
}
const wagerOfRow = (s) => { const wg = egWagerOf(String(s ?? '').split(',').filter(Boolean).map(Number)); return wg?.length ? wg : undefined; };

/**
 * @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => Uint8Array }} ctx
 * @param {{ id: string, handle?: string|null }} player @param {any} body @param {CryptoKey|null} key
 */
export async function admitEg({ db, nowS, subtle, rand }, player, body, key) {
  if (!key) return { error: 'no-signing-key' };
  if (!player.handle) return { error: 'guest' };
  const b = body?.b;
  if (typeof b !== 'string' || !BREACH_RE.test(b)) return { error: 'breach' };
  const st = await db.prepare('SELECT ew, at, until, state FROM eg_stakes WHERE b = ?1').bind(b).first();
  if (!st) return { error: 'breach' };
  if (st.state !== 'held' || nowS > int(st.at) + EG_ADMIT_WINDOW_S) return { error: 'spent' };
  const ew = int(st.ew);
  if (ew > 0 && !egMayStart(await egStartsFor(db, player.id, nowS), ew)) return { error: 'start', w: ew };
  const took = await db.prepare(`UPDATE players SET eg_live_b = ?2, eg_live_until = CASE WHEN eg_live_b = ?2 AND eg_live_until > ?3 THEN eg_live_until ELSE ?4 END
    WHERE id = ?1 AND (eg_live_b IS NULL OR eg_live_b = ?2 OR eg_live_until <= ?3) RETURNING eg_live_b`).bind(player.id, b, nowS, int(st.until)).first();
  if (!took) { const live = liveOf(await playerRow(db, player.id), nowS); return { error: 'live', ...(live ? { b: live.b } : {}) }; }
  const order = await mintEgOrder({ o: 'egadmit', s: player.id, eb: b, ez: hex(rand(new Uint8Array(12))), ew }, key, { subtle, nowS });
  return { order, b };
}

/** @param {any} db @param {{ id: string }} player @param {any} c */
export function egReceiptRest(db, player, c) {
  if (c.q === 'w' && (c.sh !== undefined || c.m !== undefined)) {
    return [db.prepare('UPDATE eg_redoubts SET sh = ?4, m = ?5 WHERE b = ?1 AND account = ?2 AND w = ?3 AND sh IS NULL AND m IS NULL')
      .bind(c.b, player.id, c.w, Number.isSafeInteger(c.sh) ? c.sh : null, Array.isArray(c.m) ? JSON.stringify(c.m) : null)];
  }
  if (c.q === 'x' && Array.isArray(c.co)) return [db.prepare('UPDATE eg_runs SET co_n = ?3, co_h = ?4 WHERE b = ?1 AND account = ?2').bind(c.b, player.id, int(c.co[0]), String(c.co[1]))];
  return [];
}
const DAY_S = 86_400;
const returnStake = (db, ez, mercy = false) => {
  const from = mercy ? "state = 'held'" : "state IN ('held', 'spent')";
  return [
    db.prepare(`UPDATE players SET eg_keys = eg_keys + 1${mercy ? ', eg_mercy = 1' : ''} WHERE id = (SELECT account FROM eg_stakes WHERE ez = ?1 AND ${from} AND rh = 0)`).bind(ez),
    ...(mercy ? [] : [db.prepare(`UPDATE players SET eg_rh_day = -1 WHERE id = (SELECT account FROM eg_stakes WHERE ez = ?1 AND ${from} AND rh = 1)
      AND eg_rh_day = (SELECT at / ${DAY_S} FROM eg_stakes WHERE ez = ?1)`).bind(ez)]),
    db.prepare(`UPDATE eg_stakes SET state = 'returned' WHERE ez = ?1 AND ${from}`).bind(ez),
  ];
};
const spendStake = (db, ez) => db.prepare("UPDATE eg_stakes SET state = 'spent' WHERE ez = ?1 AND state = 'held'").bind(ez);
/** @param {any} db @param {string} ez @param {{ account: string, rh: number }} stake */
async function mercyMay(db, ez, stake) {
  if (int(stake.rh) !== 0) return false;
  // Rowid order decides which stake came first, so two opens in the same second still have an order.
  const r = await db.prepare(`SELECT (SELECT eg_mercy FROM players WHERE id = ?2) AS m,
      EXISTS (SELECT 1 FROM eg_stakes WHERE account = ?2 AND rh = 0 AND state != 'returned' AND rowid < (SELECT rowid FROM eg_stakes WHERE ez = ?1)) AS before`)
    .bind(ez, stake.account).first();
  return int(r?.m) === 0 && int(r?.before) === 0;
}

/** @param {any} db @param {number} nowS @param {number} limit */
export async function spendLapsedStakes(db, nowS, limit) {
  const due = (await db.prepare("SELECT ez FROM eg_stakes WHERE state = 'held' AND until <= ?1 ORDER BY until, ez LIMIT ?2").bind(nowS - EG_STAKE_CLOCK_S, limit).all()).results ?? [];
  if (!due.length) return 0;
  const ez = JSON.stringify(due.map((r) => r.ez));
  const [, spent] = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO server_post (id, to_id, batch, sender, subject, body, item, sent_at)
      SELECT lower(hex(randomblob(12))), account, ?2 || ez, ?3, ?4, replace(CASE WHEN EXISTS (SELECT 1 FROM eg_runs r WHERE r.b = eg_stakes.b AND r.account = eg_stakes.account) THEN ?7 ELSE ?5 END, '{day}', strftime('%Y-%m-%d', at, 'unixepoch')), NULL, ?6
      FROM eg_stakes WHERE state = 'held' AND rh = 0 AND ez IN (SELECT value FROM json_each(?1))`).bind(ez, EG_STAKE_POST.batch, POST_SENDER, EG_STAKE_POST.subject, EG_STAKE_POST.body, nowS, EG_STAKE_POST_HELD.body),
    db.prepare("UPDATE eg_stakes SET state = 'spent' WHERE state = 'held' AND ez IN (SELECT value FROM json_each(?1))").bind(ez),
  ]);
  return Number(spent?.meta?.changes ?? 0);
}

/**
 * @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => Uint8Array }} ctx
 * @param {{ id: string, handle?: string|null }} player @param {unknown} receipt @param {CryptoKey|null} publicKey
 * @param {{ env?: any, character?: string|null }} [pay]
 */
export async function claimEg({ db, nowS, subtle, rand }, player, receipt, publicKey, { env = null, character = null } = {}) {
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifyEgReceipt(receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.s !== player.id) return { error: 'not-yours' };
  if (!player.handle) return { recorded: false, why: 'guest', q: c.q };
  let recorded = false, said = {}, honours = {};
  if (c.q === 'w') {
    const pay = await egRedoubtPay({ db, nowS, rand }, player, c, { env, character, draw: (p) => drawUnder(rand, p) });
    const [row, , ...paid] = await db.batch([
      pay.row,
      spendStake(db, c.z),
      ...pay.statements,
      ...egHonourStatements(db, player, c, nowS),
      ...egReceiptRest(db, player, c),
    ]);
    recorded = Number(row?.meta?.changes ?? 0) > 0;
    said = await pay.answer(recorded, paid.slice(0, pay.statements.length));
    honours = await egHonoursAnswer(db, player, c);
  } else if (c.q === 'x') {
    // Only the relay's `nr` flag lets the first-breach mercy return the stake. The opener's end without it
    // holds the stake while the mercy may still apply.
    const stake = await db.prepare('SELECT account, state, rh FROM eg_stakes WHERE ez = ?1').bind(c.z).first();
    let settle = [];
    if (c.why === 'void') { if (stake?.state === 'held' || stake?.state === 'spent') settle = returnStake(db, c.z); }
    else if (stake?.state === 'held' && (c.nr === 1 || stake.account === player.id)) {
      const may = await mercyMay(db, c.z, stake);
      settle = may && c.nr === 1 ? returnStake(db, c.z, true) : may ? [] : [spendStake(db, c.z)];
    }
    const [row] = await db.batch([
      db.prepare('INSERT OR IGNORE INTO eg_runs (b, account, h, why, t, at, nonce) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)').bind(c.b, player.id, c.h, c.why, c.t, nowS, hex(rand(new Uint8Array(8)))),
      db.prepare('UPDATE players SET eg_live_b = NULL, eg_live_until = 0 WHERE id = ?1 AND eg_live_b = ?2').bind(player.id, c.b),
      ...settle,
      ...egHonourStatements(db, player, c, nowS),
      ...egReceiptRest(db, player, c),
    ]);
    recorded = Number(row?.meta?.changes ?? 0) > 0;
    said = { ...(await egReliquariesOf({ db, nowS }, player, c)), ...(await egStandingOf(db, player, c)), ...(await egEndSeedOf(db, player, c)) };
  } else {
    await db.batch([...returnStake(db, c.z), db.prepare('UPDATE players SET eg_live_b = NULL, eg_live_until = 0 WHERE id = ?1 AND eg_live_b = ?2').bind(player.id, c.b)]);
    recorded = true;
  }
  if (recorded && c.q !== 'v') egBoardsMoved();
  const keys = int((await playerRow(db, player.id))?.eg_keys);
  return recorded ? { recorded: true, q: c.q, b: c.b, ...(c.q === 'w' ? { w: c.w } : {}), keys, ...said, ...honours } : { recorded: false, why: 'claimed', q: c.q, keys, ...said, ...honours };
}

async function egEndSeedOf(db, player, c) {
  const r = await db.prepare('SELECT nonce FROM eg_runs WHERE b = ?1 AND account = ?2').bind(c.b, player.id).first();
  return r ? { seed: egSpoilsSeed(c.c, r.nonce) } : {};
}

/**
 * @param {{ db: any, rand?: (b: Uint8Array) => Uint8Array }} ctx @param {{ id: string }} player
 * @param {{ kind: 'sd' }} what
 */
export async function rollWeirKey({ db, rand }, player, { kind }) {
  const found = kind === 'sd' && drawUnder(rand, EG_KEY_ODDS_SD);
  const after = await db.prepare('UPDATE players SET eg_keys = eg_keys + ?2 WHERE id = ?1 RETURNING eg_keys').bind(player.id, found ? 1 : 0).first();
  return { found, keys: int(after?.eg_keys) };
}
/** @param {{ db: any, rand?: (b: Uint8Array) => Uint8Array }} ctx @param {{ id: string }} player */
export function egGateWeir({ db, rand }, player) {
  const found = `(?3 = 1 OR eg_key_miss >= ?4 OR NOT EXISTS (SELECT 1 FROM gate_kills g WHERE g.account = ?1 AND g.earned != 'rite' AND g.rowid < (SELECT k.rowid FROM gate_kills k WHERE k.day = ?2 AND k.account = ?1)))`;
  return (/** @type {any} */ c) => db.prepare(`UPDATE players SET eg_keys = eg_keys + (CASE WHEN ${found} THEN 1 ELSE 0 END), eg_key_miss = CASE WHEN ${found} THEN 0 ELSE eg_key_miss + 1 END
    WHERE id = ?1 AND changes() > 0 RETURNING eg_keys, eg_key_miss`).bind(player.id, c.d, drawUnder(rand, c.r === 1 ? EG_KEY_ODDS_RITE : c.p > 0 ? EG_KEY_ODDS_PORTENT : EG_KEY_ODDS) ? 1 : 0, EG_KEY_PITY);
}
export const egGateWeirAnswer = (/** @type {any} */ row) => (row && Number.isSafeInteger(Number(row.eg_keys)) ? { found: int(row.eg_key_miss) === 0, keys: int(row.eg_keys) } : null);
/**
 * @param {{ db: any, nowS: number, rand?: (b: Uint8Array) => Uint8Array }} ctx
 * @param {{ id: string, handle?: string|null }} player @param {any} body
 */
export async function findEg({ db, nowS, rand }, player, body) {
  if (!player.handle) return { error: 'guest' };
  const tier = body?.tier;
  if (typeof tier !== 'string' || !Object.hasOwn(EG_FIND_ODDS, tier)) return { error: 'tier' };
  if (!(await proven(db, player.id))) return { error: 'unproven' };
  const day = utcDay(nowS), wk = arenaWeekOf(nowS);
  const ask = await db.prepare(`INSERT INTO eg_finds (account, day, tier, wk, asks, found) VALUES (?1, ?2, ?3, ?4, 1, 0)
    ON CONFLICT (account, day, tier) DO UPDATE SET asks = asks + 1 WHERE asks < ?5 RETURNING asks`).bind(player.id, day, tier, wk, EG_FIND_PER_DAY).first();
  if (!ask) return { error: 'capped', keys: int((await playerRow(db, player.id))?.eg_keys) };
  let found = false;
  if (drawUnder(rand, EG_FIND_ODDS[tier])) {
    const [took] = await db.batch([
      db.prepare('UPDATE players SET eg_keys = eg_keys + 1 WHERE id = ?1 AND (SELECT COALESCE(SUM(found), 0) FROM eg_finds WHERE account = ?1 AND wk = ?2) < ?3 RETURNING eg_keys')
        .bind(player.id, wk, EG_FIND_KEYS_PER_WEEK),
      db.prepare('UPDATE eg_finds SET found = found + 1 WHERE account = ?1 AND day = ?2 AND tier = ?3 AND (SELECT COALESCE(SUM(found), 0) FROM eg_finds WHERE account = ?1 AND wk = ?4) < ?5')
        .bind(player.id, day, tier, wk, EG_FIND_KEYS_PER_WEEK),
    ]);
    found = !!took?.results?.[0];
  }
  return { found, keys: int((await playerRow(db, player.id))?.eg_keys), asks: EG_FIND_PER_DAY - int(ask.asks) };
}
function drawUnder(rand, p) {
  if (typeof rand !== 'function') return false;
  const d = rand(new Uint8Array(4));
  return (((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0) / 4294967296 < p;
}
