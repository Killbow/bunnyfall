// @ts-check
// A post or withdrawal is one batch. Its first statement writes the row with a fresh nonce only where every
// condition holds, and each later statement moves silver only where that row carries the nonce.
import { accountKind, displayName, mintId, overRate } from './accounts.js';
import { guildActorOf } from './guilds.js';
import { marksOpenFor, guildBalanceOf } from './marks.js';
import { CHAR_ID_RE } from './service.js';
import { heraldryOfRow } from './halls.js';
import { MARKS_MAX, utcDay } from '../../src/net/marksLaw.js';
import { regionOk } from '../../src/net/nodeLaw.js';
import { MARKET_TAX_PCT } from '../../src/net/marketLaw.js';
import { GUILD_RANK_MASTER } from '../../src/net/guildLaw.js';
import {
  CONTRACT_S, GUILD_CONTRACTS_MAX, CONTRACTS_PAID_MAX, WRIT_POSTS_MAX, WRIT_OPS_MAX, WRIT_WINDOW_S, WRIT_SETTLE_MAX, WRIT_SHOWN,
  WRIT_RID_RE, WRIT_ID_RE, WRIT_POWERS, contractKindOk, contractPayOk, contractDeedsOk, contractRegionOfRaid, writMay, seatWeek,
} from '../../src/net/writLaw.js';
import { officerSpentSql } from './writs.js';

const INSERT_LINE = 'INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)';
const POSTERS_SQL = WRIT_POWERS.postWrit.join(', ');

export const contractsOpenFor = (player, env) => marksOpenFor(player, env);
const charOk = (c) => typeof c === 'string' && CHAR_ID_RE.test(c);
const idOk = (id) => typeof id === 'string' && WRIT_ID_RE.test(id);
function asks(player, { character, rid }) {
  if (accountKind(player) !== 'linked') return { error: 'marks-need-account' };
  if (!charOk(character)) return { error: 'prof-character' };
  if (typeof rid !== 'string' || !WRIT_RID_RE.test(rid)) return { error: 'prof-rid' };
  return null;
}
const shut = (player, env) => (contractsOpenFor(player, env) ? null : { error: 'marks-closed' });

const CONTRACT_ROW = `SELECT c.*, g.name AS guild_name, g.tag AS guild_tag, g.heraldry AS guild_heraldry
  FROM guild_contracts c JOIN guilds g ON g.id = c.guild_id`;
const contractView = (c, me, may = false) => ({
  id: c.id, kind: c.kind, guild: { id: c.guild_id, name: c.guild_name ?? null, tag: c.guild_tag ?? null, heraldry: heraldryOfRow(c.guild_heraldry) },
  region: Number(c.region), pay: Number(c.pay), deeds: Number(c.deeds), left: Number(c.left_deeds), escrow: Number(c.escrow),
  at: Number(c.at), expiresAt: Number(c.expires_at), state: c.state, mine: c.poster === me, may,
});
async function contractOf(db, id, me, may = false) {
  const c = await db.prepare(`${CONTRACT_ROW} WHERE c.id = ?1`).bind(id).first();
  return c ? contractView(c, me, may) : null;
}
const mayWithdraw = (rank, c, me) => rank === GUILD_RANK_MASTER || (rank != null && writMay(rank, 'postWrit') && c.poster === me);

function contractReturn(db, id, nowS) {
  return [
    db.prepare(`${INSERT_LINE} SELECT 'escrow', id, 'guild', guild_id, 'contract-return', escrow, ?2, ?3, guild_id, 'A contract', 'contract-return:' || id
      FROM guild_contracts WHERE id = ?1 AND state != 'open' AND returned = 0 AND escrow > 0
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = guild_contracts.guild_id AND rid = 'contract-return:' || ?1)
        AND COALESCE((SELECT balance FROM guild_marks WHERE guild_id = guild_contracts.guild_id), 0) + escrow <= ?4`)
      .bind(id, utcDay(nowS), nowS, MARKS_MAX),
    db.prepare(`UPDATE guild_contracts SET returned = 1, escrow = 0 WHERE id = ?1 AND state != 'open' AND returned = 0
      AND (escrow = 0 OR EXISTS (SELECT 1 FROM marks_ledger WHERE actor = guild_contracts.guild_id AND rid = 'contract-return:' || ?1))`).bind(id),
  ];
}
export async function closeContracts(ctx) {
  const { db, nowS } = ctx;
  const { results: due = [] } = await db.prepare(`SELECT id FROM guild_contracts WHERE (state = 'open' AND expires_at <= ?1)
      OR (state != 'open' AND returned = 0 AND (escrow = 0 OR COALESCE((SELECT balance FROM guild_marks WHERE guild_id = guild_contracts.guild_id), 0) + escrow <= ?2))
    ORDER BY expires_at LIMIT ${WRIT_SETTLE_MAX}`).bind(nowS, MARKS_MAX).all();
  let moved = 0;
  for (const c of due) {
    if (ctx.budget && !ctx.budget()) break;
    const out = await db.batch([
      db.prepare(`UPDATE guild_contracts SET state = 'expired', closed_at = ?2 WHERE id = ?1 AND state = 'open' AND expires_at <= ?2`).bind(c.id, nowS),
      ...contractReturn(db, c.id, nowS),
    ]);
    if (out.some((r) => Number(r?.meta?.changes ?? 0) > 0)) moved++;
  }
  return moved;
}

export async function contractBoard(ctx, player, env, { character, region } = {}) {
  const { db, nowS } = ctx;
  if (accountKind(player) !== 'linked' || !contractsOpenFor(player, env) || !charOk(character) || !regionOk(region)) return {};
  const me = player.id;
  await closeContracts(ctx);
  const member = await db.prepare('SELECT guild_id, rank FROM guild_members WHERE player = ?1 AND char_id = ?2').bind(me, character).first();
  const rank = member ? Number(member.rank) : null;
  const { results: here = [] } = await db.prepare(`${CONTRACT_ROW} WHERE c.region = ?1 AND c.state = 'open' AND c.expires_at > ?2
    ORDER BY c.pay DESC, c.at LIMIT ${WRIT_SHOWN}`).bind(region, nowS).all();
  const { results: ours = [] } = member ? await db.prepare(`${CONTRACT_ROW} WHERE c.guild_id = ?1 AND c.state = 'open' AND c.expires_at > ?2
    ORDER BY c.expires_at LIMIT ${WRIT_SHOWN}`).bind(member.guild_id, nowS).all() : { results: [] };
  const own = member?.guild_id ?? null;
  return {
    contracts: here.map((c) => contractView(c, me, c.guild_id === own && mayWithdraw(rank, c, me))),
    yoursContracts: ours.map((c) => contractView(c, me, mayWithdraw(rank, c, me))),
    contractPost: member ? writMay(rank, 'postWrit') : false,
  };
}

export async function postContract(ctx, player, env, { character, region, kind, pay, deeds, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  const answer = async (row, extra = {}) => ({ ok: true, ...extra, contract: await contractOf(db, row.id, me, true), guildMarks: await guildBalanceOf(db, row.guild_id) });
  const prior = await db.prepare('SELECT * FROM guild_contracts WHERE poster = ?1 AND rid = ?2').bind(me, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  if (!contractKindOk(kind)) return { error: 'contract-kind' };
  if (!contractPayOk(pay)) return { error: 'contract-pay' };
  if (!contractDeedsOk(deeds)) return { error: 'contract-deeds' };
  const a = await guildActorOf(db, player, character);
  if (a.error) return a;
  const rank = Number(a.me.rank);
  if (!writMay(rank, 'postWrit')) return { error: 'guild-rank' };
  const g = a.me.guild_id;
  if (await overRate(ctx, `writ-post:${me}`, WRIT_POSTS_MAX, WRIT_WINDOW_S)) return { error: 'writ-rate' };
  const officer = rank === GUILD_RANK_MASTER ? 0 : 1;
  const escrow = deeds * pay;
  const week = seatWeek(nowS);
  const nonce = mintId(rand);
  const id = mintId(rand);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO guild_contracts (id, guild_id, poster, poster_char, officer, week, region, kind, deeds, left_deeds, pay, escrow,
        at, expires_at, rid, n)
      SELECT ?3, ?4, ?1, ?2, ?5, ?6, ?7, ?8, ?9, ?9, ?10, ?11, ?12, ?13, ?14, ?15
      WHERE EXISTS (SELECT 1 FROM guild_members WHERE player = ?1 AND char_id = ?2 AND guild_id = ?4 AND rank = ?16)
        AND COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?4), 0) >= ?11
        AND (SELECT COUNT(*) FROM guild_contracts WHERE guild_id = ?4 AND state = 'open' AND expires_at > ?12) < ?17
        AND (?5 = 0 OR ${officerSpentSql('?4', '?6')} + ?11 <= COALESCE((SELECT budget FROM guild_writ_budgets WHERE guild_id = ?4), 0))
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?14 || ':cesc')`)
      .bind(me, character, id, g, officer, week, region, kind, deeds, pay, escrow, nowS, nowS + CONTRACT_S, rid, nonce, rank, GUILD_CONTRACTS_MAX),
    db.prepare(`${INSERT_LINE} SELECT 'guild', guild_id, 'escrow', id, 'contract-escrow', escrow, ?4, at, poster, ?5, rid || ':cesc'
      FROM guild_contracts WHERE poster = ?1 AND rid = ?2 AND n = ?3`).bind(me, rid, nonce, utcDay(nowS), displayName(player)),
  ]);
  const made = await db.prepare('SELECT * FROM guild_contracts WHERE poster = ?1 AND rid = ?2').bind(me, rid).first();
  if (made?.n === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  if (await db.prepare('SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?2').bind(me, `${rid}:cesc`).first()) return { error: 'prof-rid' };
  const now = await db.prepare('SELECT rank FROM guild_members WHERE player = ?1 AND char_id = ?2 AND guild_id = ?3').bind(me, character, g).first();
  if (!now || Number(now.rank) !== rank) return { error: 'guild-rank' };
  if ((await guildBalanceOf(db, g)) < escrow) return { error: 'guild-marks-short' };
  const open = await db.prepare(`SELECT COUNT(*) AS n FROM guild_contracts WHERE guild_id = ?1 AND state = 'open' AND expires_at > ?2`).bind(g, nowS).first();
  if (Number(open?.n ?? 0) >= GUILD_CONTRACTS_MAX) return { error: 'guild-contracts-max' };
  return { error: 'writ-budget' };
}

export async function withdrawContract(ctx, player, env, { character, contract: id, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const me = player.id;
  if (!idOk(id)) return { error: 'no-contract' };
  const c = await db.prepare('SELECT * FROM guild_contracts WHERE id = ?1').bind(id).first();
  if (!c) return { error: 'no-contract' };
  const answer = async (extra = {}) => ({ ok: true, ...extra, contract: await contractOf(db, id, me), guildMarks: await guildBalanceOf(db, c.guild_id) });
  if (c.state === 'withdrawn' && c.closed_by === me) return answer({ repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  const a = await guildActorOf(db, player, character);
  if (a.error) return a;
  if (a.me.guild_id !== c.guild_id) return { error: 'guild-rank' };
  const rank = Number(a.me.rank);
  if (!mayWithdraw(rank, c, me)) return { error: 'guild-rank' };
  if (c.state !== 'open') return { error: 'contract-gone' };
  if (await overRate(ctx, `writ:${me}`, WRIT_OPS_MAX, WRIT_WINDOW_S)) return { error: 'writ-rate' };
  const nonce = mintId(rand);
  await db.batch([
    db.prepare(`UPDATE guild_contracts SET state = 'withdrawn', closed_at = ?3, closed_by = ?4, cn = ?5 WHERE id = ?1 AND state = 'open'
      AND EXISTS (SELECT 1 FROM guild_members WHERE player = ?4 AND char_id = ?2 AND guild_id = guild_contracts.guild_id AND rank = ?6)
      AND (?6 = ${GUILD_RANK_MASTER} OR poster = ?4)`).bind(id, character, nowS, me, nonce, rank),
    ...contractReturn(db, id, nowS),
  ]);
  const now = await db.prepare('SELECT state, cn FROM guild_contracts WHERE id = ?1').bind(id).first();
  if (now?.cn === nonce) return answer();
  if (now?.state !== 'open') return { error: 'contract-gone' };
  return { error: 'guild-rank' };
}

const payRid = (id, key) => `cpay:${id}:${key}`;
const taxRid = (id, key) => `ctax:${id}:${key}`;

// The read takes twice what a claim may pay, so a contract filled meanwhile leaves the next-best to pay.
const CONTRACTS_READ_MAX = CONTRACTS_PAID_MAX * 2;
// The tax percent is written into the SQL as an integer literal, never bound: the driver binds numbers as REAL,
// and the division would then not floor.
const TAX_PCT = Math.trunc(MARKET_TAX_PCT);
const deedTaxSql = `(((c.deeds - c.left_deeds + 1) * c.pay * ${TAX_PCT}) / 100 - ((c.deeds - c.left_deeds) * c.pay * ${TAX_PCT}) / 100)`;

// The tax and pay are computed inside the batch from the contract row as the batch finds it, so a party's claims
// that arrive together are each paid.
export async function contractPayStatements({ db, nowS }, player, env, { key, nonce }) {
  if (accountKind(player) !== 'linked' || !contractsOpenFor(player, env)) return null;
  const region = contractRegionOfRaid(key);
  if (region == null) return null;
  const posters = (g) => `EXISTS (SELECT 1 FROM guild_members m WHERE m.player = ?3 AND m.guild_id = ${g} AND m.rank IN (${POSTERS_SQL}))`;
  const { results: open = [] } = await db.prepare(`SELECT id FROM guild_contracts
    WHERE region = ?1 AND kind = 'raid' AND state = 'open' AND expires_at > ?2 AND left_deeds >= 1 AND NOT ${posters('guild_contracts.guild_id')}
    ORDER BY pay DESC, at LIMIT ${CONTRACTS_READ_MAX}`).bind(region, nowS, player.id).all();
  if (!open.length) return null;
  const day = utcDay(nowS);
  const event = `raid:${key}`;
  const statements = [];
  for (const c of open) {
    const paid = 'EXISTS (SELECT 1 FROM guild_contract_pays WHERE contract = ?2 AND event = ?3 AND account = ?1 AND n = ?4)';
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO guild_contract_pays (contract, event, account, char_id, guild_id, pay, tax, at, day, n)
        SELECT c.id, ?3, ?1, rc.char_id, c.guild_id, c.pay - ${deedTaxSql}, ${deedTaxSql}, ?5, ?6, ?4
        FROM guild_contracts c JOIN raid_cleanses rc ON rc.raid = ?7 AND rc.account = ?1 AND rc.nonce = ?4
        WHERE c.id = ?2 AND c.state = 'open' AND c.expires_at > ?5 AND c.left_deeds >= 1 AND c.escrow >= c.pay
          AND NOT EXISTS (SELECT 1 FROM guild_members WHERE player = ?1 AND guild_id = c.guild_id AND rank IN (${POSTERS_SQL}))
          AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?8)
          AND COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) + c.pay - ${deedTaxSql} <= ?9
          AND (SELECT COUNT(*) FROM guild_contract_pays p WHERE p.event = ?3 AND p.account = ?1) < ?10`)
        .bind(player.id, c.id, event, nonce, nowS, day, key, payRid(c.id, key), MARKS_MAX, CONTRACTS_PAID_MAX),
      db.prepare(`UPDATE guild_contracts SET left_deeds = left_deeds - 1, escrow = escrow - pay,
          state = CASE WHEN left_deeds = 1 THEN 'filled' ELSE state END, closed_at = CASE WHEN left_deeds = 1 THEN ?5 ELSE closed_at END
        WHERE id = ?2 AND ${paid}`).bind(player.id, c.id, event, nonce, nowS),
      db.prepare(`${INSERT_LINE} SELECT 'escrow', contract, 'account', account, 'contract-pay', pay, day, at, account, ?5, ?6
        FROM guild_contract_pays WHERE contract = ?2 AND event = ?3 AND account = ?1 AND n = ?4 AND pay > 0`)
        .bind(player.id, c.id, event, nonce, displayName(player), payRid(c.id, key)),
      db.prepare(`${INSERT_LINE} SELECT 'escrow', contract, 'burn', NULL, 'market-tax', tax, day, at, account, ?5, ?6
        FROM guild_contract_pays WHERE contract = ?2 AND event = ?3 AND account = ?1 AND n = ?4 AND tax > 0`)
        .bind(player.id, c.id, event, nonce, displayName(player), taxRid(c.id, key)),
      ...contractReturn(db, c.id, nowS),
    );
  }
  return { statements };
}

export async function contractPaysOf(db, player, key) {
  const { results = [] } = await db.prepare(`SELECT p.contract, p.pay, p.tax, g.name, g.tag FROM guild_contract_pays p JOIN guilds g ON g.id = p.guild_id
    WHERE p.event = ?1 AND p.account = ?2 ORDER BY p.pay DESC`).bind(`raid:${key}`, player.id).all();
  return results.map((r) => ({ contract: r.contract, guild: { name: r.name, tag: r.tag }, pay: Number(r.pay), tax: Number(r.tax) }));
}
