// @ts-check

import { arenaSeasonOf, arenaSeasonDay, arenaSeasonEndsS, arenaWeekOf } from '../../src/net/arenaLaw.js';
import { egBandMastered, EG_FEAT_BANDS } from '../../src/net/eliteGates/egFeats.js';
import { egProclamationOf, EG_DECREE_BY_KEY } from '../../src/net/eliteGates/egLaw.js';
import { topWithMe, ARENA_BOARD_TOP } from './arena.js';
import { boardNamesOf } from './boardNames.js';
import { isSpireFirst } from './titles.js';
import { POST_SENDER } from '../../src/net/postLaw.js';
import { egWagerOf } from '../../src/net/eliteGates/egStartLaw.js';
import { EG_RECEIPT_TTL_S } from '../../src/net/eliteGates/egReceipt.js';

export const EG_HONOUR = Object.freeze({
  spirewalker: 1, beaconlighter: 2, kynbane: 4, unfallen: 8, lonebeacon: 16, battlemage: 32, wellheadwalker: 64,
  mastergallery: 128, mastercairn: 256, mastershade: 512, masterwellhead: 1024,
});
export const EG_HONOUR_TITLES = Object.freeze(Object.keys(EG_HONOUR));
export const EG_HONOUR_AURA = Object.freeze({ kynbane: 'beaconlight', wellheadwalker: 'burningstair' });
export const EG_REDOUBT_HONOURS = Object.freeze([
  Object.freeze([2, 'spirewalker']), Object.freeze([5, 'beaconlighter']), Object.freeze([10, 'kynbane']),
  Object.freeze([15, 'battlemage']), Object.freeze([20, 'wellheadwalker']),
]);
export const EG_UNFALLEN_REDOUBT = 10;
export const EG_BAND_MASTERS = Object.freeze(['mastergallery', 'mastercairn', 'mastershade', 'masterwellhead']);
export const EG_CHAMPION_TITLE = 'spirechampion';
export const EG_FIRST_TITLE = 'spirefirst';
export const EG_FIRST_AURA = 'firstlight';
export const EG_BRACKETS = Object.freeze(['alone', 'few', 'company']);
export const egBracketOf = (n) => (n >= 5 ? 'company' : n >= 2 ? 'few' : 'alone');
export const EG_COMPANY_MAX = 8;
export const EG_CHAMPIONS_TOP = 10;
export const EG_CHAMPION_CACHE_S = 600;

const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);
const wagered = (c) => (Array.isArray(c?.wg) ? c.wg.length > 0 : !!c?.wg);
const wagerText = (c) => (Array.isArray(c?.wg) ? (egWagerOf(c.wg) ?? []).join(',') : '');
const wagerOfText = (s) => egWagerOf(String(s ?? '').split(',').filter(Boolean).map(Number)) ?? [];

/** @param {any} c */
export function egHonourBitsOf(c) {
  if (!c || c.q !== 'w' || c.rh === 1 || !Number.isSafeInteger(c.w)) return 0;
  let bits = 0;
  for (const [r, t] of EG_REDOUBT_HONOURS) if (c.w >= r) bits |= EG_HONOUR[t];
  if (c.w >= EG_UNFALLEN_REDOUBT && c.fl === 0 && c.ew === 0) bits |= EG_HONOUR.unfallen;
  if (c.lb === 1) bits |= EG_HONOUR.lonebeacon;
  return bits;
}
export function egMasterBitsOf(held) {
  let bits = 0;
  EG_FEAT_BANDS.forEach((_, b) => { if (egBandMastered(held, b)) bits |= EG_HONOUR[EG_BAND_MASTERS[b]]; });
  return bits;
}
export const egHonourTitlesOf = (bits) => EG_HONOUR_TITLES.filter((t) => (int(bits) & EG_HONOUR[t]) !== 0);

/** @param {any} db @param {{ id: string }} player @param {any} c @param {number} _nowS */
export function egHonourStatements(db, player, c, _nowS) {
  if (c.q === 'w') {
    if (c.rh === 1 || typeof c.lk !== 'string' || !Number.isSafeInteger(c.ft)) return [];
    return [db.prepare(`INSERT INTO eg_feats (account, lord, bits) SELECT ?1, ?2, ?5
        WHERE EXISTS (SELECT 1 FROM eg_redoubts WHERE b = ?3 AND account = ?1 AND w = ?4)
        ON CONFLICT (account, lord) DO UPDATE SET bits = bits | excluded.bits`).bind(player.id, c.lk, c.b, c.w, c.ft)];
  }
  if (c.q !== 'x') return [];
  const td = Number.isSafeInteger(c.td) && c.td >= 0 ? c.td : null;
  return [
    db.prepare('UPDATE eg_runs SET n = ?3, ew = ?4, wg = ?5, fl = ?6, td = ?7, rh = ?8, season = ?9, wgs = ?10 WHERE b = ?1 AND account = ?2')
      .bind(c.b, player.id, int(c.n), int(c.ew), wagered(c) ? 1 : 0, int(c.fl), td, c.rh === 1 ? 1 : 0, arenaSeasonOf(c.i), wagerText(c)),
    ...(int(c.an) > 0 ? [db.prepare('UPDATE players SET eg_annals = eg_annals | ?2 WHERE id = ?1 AND EXISTS (SELECT 1 FROM eg_runs WHERE b = ?3 AND account = ?1)').bind(player.id, int(c.an), c.b)] : []),
  ];
}

/** @param {any} db @param {{ id: string }} player @param {any} c */
export async function egHonoursAnswer(db, player, c) {
  if (c.q !== 'w') return {};
  const row = await db.prepare('SELECT eg_honours AS h FROM players WHERE id = ?1').bind(player.id).first();
  const feats = (await db.prepare('SELECT lord, bits FROM eg_feats WHERE account = ?1').bind(player.id).all()).results ?? [];
  const bits = egHonourBitsOf(c) | egMasterBitsOf(Object.fromEntries(feats.map((f) => [f.lord, int(f.bits)])));
  const fresh = bits & ~int(row?.h);
  if (!fresh) return {};
  const set = await db.prepare('UPDATE players SET eg_honours = eg_honours | ?2 WHERE id = ?1 AND EXISTS (SELECT 1 FROM eg_redoubts WHERE b = ?3 AND account = ?1 AND w = ?4)')
    .bind(player.id, fresh, c.b, c.w).run();
  return Number(set?.meta?.changes ?? 0) > 0 ? { honours: egHonourTitlesOf(fresh) } : {};
}

/** @param {any} db @param {string} id */
export async function egRecordOf(db, id) {
  const [annals, feats] = egRecordStmts(db, id);
  return egRecordFrom(await annals.first(), (await feats.all()).results);
}
export const egRecordStmts = (/** @type {any} */ db, /** @type {string} */ id) => [
  db.prepare('SELECT eg_annals AS a FROM players WHERE id = ?1').bind(id),
  db.prepare('SELECT lord, bits FROM eg_feats WHERE account = ?1 ORDER BY lord').bind(id),
];
export const egRecordFrom = (/** @type {any} */ row, /** @type {any[]|undefined} */ feats) => ({ annals: int(row?.a), feats: Object.fromEntries((feats ?? []).map((f) => [f.lord, int(f.bits)])) });

const DESCENT_SQL = 'SELECT b, account, h, COALESCE(td, t) AS secs, n, fl, at, co_n, co_h FROM eg_runs WHERE season = ?1 AND rh = 0 AND ew = 0 AND wg = 0 AND h >= 1 ORDER BY at ASC, account ASC';
const DEPTHS_SQL = `SELECT account, h, ew, wg, wgs, at FROM (
    SELECT account, h, ew, wg, wgs, at, ROW_NUMBER() OVER (PARTITION BY account ORDER BY h DESC, at ASC, b ASC) AS rn
      FROM eg_runs WHERE season = ?1 AND rh = 0 AND h >= 1)
  WHERE rn = 1 ORDER BY h DESC, at ASC, account ASC`;
const DEEPEST_SQL = `SELECT account, w, at FROM (
    SELECT account, w, at, ROW_NUMBER() OVER (PARTITION BY account ORDER BY w DESC, at ASC) AS rn FROM eg_redoubts)
  WHERE rn = 1 ORDER BY w DESC, at ASC, account ASC`;

const descentOrder = (a, b) => b.h - a.h || a.t - b.t || a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** @param {any[]} rows */
export function egDescentCompanies(rows) {
  const best = new Map();
  for (const c of breachesOf(rows).values()) {
    const key = companyKeyOf(c);
    const row = { key, players: c.players.slice(0, EG_COMPANY_MAX), h: c.h, t: c.t, n: Math.max(c.n, c.players.length), flame: c.fell === 0, at: c.at };
    const had = best.get(key);
    if (!had || descentOrder(row, had) < 0) best.set(key, row);
  }
  return [...best.values()].sort(descentOrder);
}
function breachesOf(rows) {
  const by = new Map();
  for (const r of rows) {
    let c = by.get(r.b);
    if (!c) by.set(r.b, (c = { players: [], h: 0, t: Infinity, n: 0, fell: 0, at: Infinity, co: '' }));
    if (!c.players.includes(r.account)) c.players.push(r.account);
    const h = int(r.h), secs = int(r.secs);
    if (h > c.h) { c.h = h; c.t = secs; } else if (h === c.h) c.t = Math.min(c.t, secs);
    c.n = Math.max(c.n, int(r.n), int(r.co_n));
    c.fell += int(r.fl);
    c.at = Math.min(c.at, int(r.at));
    if (!c.co && typeof r.co_h === 'string' && r.co_h) c.co = `${int(r.co_n)}:${r.co_h}`;
  }
  return by;
}
const companyKeyOf = (c) => (c.co ? `co:${c.co}` : [...c.players].sort().join(','));
export function egDescentBrackets(companies) {
  const out = Object.fromEntries(EG_BRACKETS.map((k) => [k, /** @type {any[]} */ ([])]));
  for (const c of companies) out[egBracketOf(c.n)].push(c);
  return out;
}
async function descentOf(db, season) {
  const companies = egDescentCompanies((await db.prepare(DESCENT_SQL).bind(season).all()).results ?? []);
  return { companies, brackets: egDescentBrackets(companies) };
}

/** @param {{ db: any }} ctx @param {number} season */
export async function recordEgChampions({ db }, season) {
  const rows = championsOf((await descentOf(db, season)).brackets);
  if (!rows.length) return 0;
  const out = await db.batch(rows.map(([k, p]) => db.prepare('INSERT OR IGNORE INTO eg_champions (season, bracket, account) VALUES (?1, ?2, ?3)').bind(season, k, p)));
  return out.reduce((s, r) => s + Number(r?.meta?.changes ?? 0), 0);
}
function championsOf(brackets) {
  const rows = [];
  for (const k of EG_BRACKETS) for (const c of brackets[k].slice(0, EG_CHAMPIONS_TOP)) for (const p of c.players) rows.push([k, p]);
  return rows;
}
let _champs = { season: 0, at: -Infinity, ids: /** @type {Set<string>} */ (new Set()) };
export function _resetEgHonoursCache() { _champs = { season: 0, at: -Infinity, ids: new Set() }; egBoardsMoved(); }
async function championsNow(ctx, nowS) {
  const season = arenaSeasonOf(nowS);
  if (_champs.season === season && nowS - _champs.at < EG_CHAMPION_CACHE_S) return _champs.ids;
  const last = season - 1;
  const read = async () => new Set(((await ctx.db.prepare('SELECT account FROM eg_champions WHERE season = ?1').bind(last).all()).results ?? []).map((r) => r.account));
  let ids = new Set();
  // Late end claims can land in a season until a receipt lifetime after it ends, so champions stay live until then.
  if (last >= 1 && nowS < arenaSeasonEndsS(last) + EG_RECEIPT_TTL_S) ids = new Set(championsOf((await descentOf(ctx.db, last)).brackets).map(([, p]) => p));
  else if (last >= 1) {
    ids = await read();
    if (!ids.size && (await recordEgChampions(ctx, last)) > 0) ids = await read();
  }
  _champs = { season, at: nowS, ids };
  return ids;
}
export async function egHonoursOf(ctx, player, nowS) {
  if (!player?.handle) return { champion: false };
  return { champion: (await championsNow(ctx, nowS)).has(player.id) };
}
export async function withEgHonours(ctx, player, nowS) {
  return player ? { ...player, eg: await egHonoursOf(ctx, player, nowS) } : player;
}
export async function withEgHonoursAll(ctx, rows, nowS) {
  if (!rows.some((r) => r?.handle)) return rows;
  const ids = await championsNow(ctx, nowS);
  return rows.map((r) => (r?.handle ? { ...r, eg: { champion: ids.has(r.id) } } : r));
}

/** @param {any} db @param {{ id: string }} player @param {any} c */
export async function egStandingOf(db, player, c) {
  if (c?.q !== 'x' || c.rh === 1 || !(int(c.h) >= 1)) return {};
  const season = arenaSeasonOf(c.i);
  // This reads the season fresh, never the cached rankings, so the standing counts the claim being answered.
  const rows = (await db.prepare(DESCENT_SQL).bind(season).all()).results ?? [];
  const mine = breachesOf(rows).get(c.b), key = mine ? companyKeyOf(mine) : '';
  const brackets = egDescentBrackets(egDescentCompanies(rows));
  for (const br of EG_BRACKETS) {
    const i = brackets[br].findIndex((r) => r.key === key);
    if (i >= 0) return { board: { k: 'descent', br, rank: i + 1 } };
  }
  const i = ((await db.prepare(DEPTHS_SQL).bind(season).all()).results ?? []).findIndex((r) => r.account === player.id);
  return i >= 0 ? { board: { k: 'depths', rank: i + 1 } } : {};
}

export const EG_FIRST_POST = Object.freeze({
  batch: 'spire-first',
  subject: 'First of the Spire',
  body: [
    'You were the first ever to take Redoubt 10 of the Battlespire. The Spire remembers.',
    '',
    'Your title, First of the Spire, and its aura, Firstlight, are yours to wear - choose them on your profile.',
    '',
    `- ${POST_SENDER}`,
  ].join('\n'),
});
/** @param {any} db @param {{ id: string, handle?: string|null }} player @param {any} env @param {number} nowS */
export async function egFirstPost(db, player, env, nowS) {
  if (!isSpireFirst(player, env)) return false;
  const r = await db.prepare(`INSERT OR IGNORE INTO server_post (id, to_id, batch, sender, subject, body, item, sent_at)
    VALUES (lower(hex(randomblob(12))), ?1, ?2, ?3, ?4, ?5, NULL, ?6)`)
    .bind(player.id, EG_FIRST_POST.batch, POST_SENDER, EG_FIRST_POST.subject, EG_FIRST_POST.body, nowS).run();
  return Number(r?.meta?.changes ?? 0) > 0;
}

export const EG_BOARD_CACHE_S = 60;
let _ranks = { season: -1, at: -Infinity, v: /** @type {any} */ (null) };
let _ranksAsking = /** @type {{ season: number, gen: number, p: Promise<any> } | null} */ (null);
let _ranksGen = 0;
export function egBoardsMoved() { _ranks = { season: -1, at: -Infinity, v: null }; _ranksAsking = null; _ranksGen++; }
async function ranksOf(db, season, nowS) {
  if (_ranks.v && _ranks.season === season && nowS >= _ranks.at && nowS - _ranks.at < EG_BOARD_CACHE_S) return _ranks.v;
  if (_ranksAsking?.season === season && _ranksAsking.gen === _ranksGen) return _ranksAsking.p;
  // A recorded claim bumps _ranksGen, so a read that a claim overtook does not cache its result.
  const gen = _ranksGen;
  const p = (async () => {
    const { companies, brackets } = await descentOf(db, season);
    const depths = ((await db.prepare(DEPTHS_SQL).bind(season).all()).results ?? []).map((r) => ({ player: r.account, h: int(r.h), ew: int(r.ew), wagered: int(r.wg) === 1, wg: wagerOfText(r.wgs) }));
    const deepest = ((await db.prepare(DEEPEST_SQL).all()).results ?? []).map((r) => ({ player: r.account, w: int(r.w), at: int(r.at) }));
    const v = { companies, brackets, depths, deepest };
    if (gen === _ranksGen) _ranks = { season, at: nowS, v };
    return v;
  })().finally(() => { if (_ranksAsking?.p === p) _ranksAsking = null; });
  _ranksAsking = { season, gen, p };
  return p;
}

export function egProclamationNow(nowS) {
  const week = arenaWeekOf(nowS), key = egProclamationOf(week), d = EG_DECREE_BY_KEY[key];
  return { week, key, name: d?.name ?? key, line: d?.line ?? '' };
}

/** @param {{ db: any, nowS: number }} ctx @param {any} player @param {any} env */
export async function egBoardOf(ctx, player, env) {
  const { db, nowS } = ctx;
  const season = arenaSeasonOf(nowS);
  const me = player?.id ?? null;
  await championsNow(ctx, nowS);
  const R = await ranksOf(db, season, nowS), { companies } = R, copy = (rows) => rows.map((r) => ({ ...r }));
  const mine = (r) => !!me && r.players.includes(me);
  const descent = Object.fromEntries(EG_BRACKETS.map((k) => [k, topWithMe(copy(R.brackets[k]), mine, ARENA_BOARD_TOP)]));
  const depths = topWithMe(copy(R.depths), me, ARENA_BOARD_TOP);
  const deepest = topWithMe(copy(R.deepest), me, ARENA_BOARD_TOP);
  const shownOf = (b) => [...b.rows, ...(b.pinned ? [b.pinned] : [])];
  const ids = [
    ...EG_BRACKETS.flatMap((k) => shownOf(descent[k]).flatMap((r) => r.players)),
    ...shownOf(depths).map((r) => r.player), ...shownOf(deepest).map((r) => r.player),
  ];
  const names = await boardNamesOf(ctx, ids, env, nowS, {});
  const company = (r) => (r ? { players: r.players, names: r.players.map((p) => names.get(p)?.name ?? '?'), h: r.h, t: r.t, n: r.n, flame: r.flame, pr: egProclamationNow(r.at).name, rank: r.rank, you: r.you } : null);
  const named = (r) => (r ? { ...r, ...(names.get(r.player) ?? { name: '?', title: null, glyphs: [] }) } : null);
  const board = (b, f) => ({ rows: b.rows.map(f), pinned: f(b.pinned), total: b.total });
  const best = companies.find(mine) ?? null;
  return {
    ok: true,
    season: { n: season, day: arenaSeasonDay(nowS), ends: arenaSeasonEndsS(season) },
    descent: Object.fromEntries(EG_BRACKETS.map((k) => [k, board(descent[k], company)])),
    depths: board(depths, named),
    deepest: board(deepest, named),
    proclamation: egProclamationNow(nowS),
    best: best ? { h: best.h, t: best.t } : null,
  };
}
