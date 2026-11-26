// @ts-check

import { accountKind, displayName, isMuted, overRate, muteAccount } from './accounts.js';
import { SPROUT_S, canModerate, isDeveloper } from './titles.js';
import { gatePublicKey } from './signing.js';
import { autoMute, autoMutable, lawOrder, pushLaw, bannedUntil, findAccount, actionStatement, voidAutoMutes, banAccount, unbanAccount, reasonOf, muteMinutesOk } from './sanctions.js';
import { STAFF_IDLE_S, auditStatement, staffRole } from './staff.js';
import { discordOn } from './discord.js';
import { ID_RE } from '../../src/net/identityToken.js';
import { verifyStamp } from '../../src/net/safety/chatStamp.js';
import { BLOCKS_MAX, reportShape } from '../../src/net/safety/safetyLaw.js';
import { CONDUCT_VERSION } from '../../src/net/safety/conduct.js';

export const REPORT_RATE_MAX = 12;
export const REPORT_WINDOW_S = 3600;
export const BLOCK_RATE_MAX = 60;
export const BLOCK_WINDOW_S = 3600;
export const REPORT_AUTO_MUTE = 3;
export const REPORT_AUTO_WINDOW_S = 3600;
export const REPORT_BODY_MAX = 24 * 1024;
export const CASE_LINES_MAX = 60;
export const UNCOUNTED_CASES_HOUR = 60;
export const CASE_CLAIM_S = 60;

export const CASE_KINDS = Object.freeze(['chat', 'spawn']);

/** @param {(b: Uint8Array) => void} rand */
export const caseIdOf = (rand) => { const b = new Uint8Array(8); rand(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };

export async function blocksOf({ db }, player) {
  const rows = (await db.prepare('SELECT b.blocked, b.at, p.handle, p.guest_name FROM blocks b JOIN players p ON p.id = b.blocked WHERE b.player = ?1 ORDER BY b.at DESC LIMIT ?2').bind(player.id, BLOCKS_MAX).all())?.results ?? [];
  return { ok: true, blocks: rows.map((r) => ({ sub: r.blocked, name: displayName(r), at: r.at })) };
}

export async function blockAccount(ctx, player, { target }) {
  const { db, nowS } = ctx;
  if (typeof target !== 'string' || !ID_RE.test(target)) return { error: 'no-player' };
  if (target === player.id) return { error: 'block-self' };
  if (await overRate(ctx, `safety-block:${player.id}`, BLOCK_RATE_MAX, BLOCK_WINDOW_S)) return { error: 'rate' };
  const row = await db.prepare('SELECT id FROM players WHERE id = ?1').bind(target).first();
  if (!row) return { error: 'no-player' };
  const r = await db.prepare('INSERT OR IGNORE INTO blocks (player, blocked, at) SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM blocks WHERE player = ?1) < ?4')
    .bind(player.id, target, nowS, BLOCKS_MAX).run();
  if (!r?.meta?.changes) {
    const had = await db.prepare('SELECT 1 AS y FROM blocks WHERE player = ?1 AND blocked = ?2').bind(player.id, target).first();
    if (!had) return { error: 'blocks-full' };
  }
  return blocksOf(ctx, player);
}

export async function unblockAccount(ctx, player, { target }) {
  if (typeof target !== 'string' || !ID_RE.test(target)) return { error: 'no-player' };
  if (await overRate(ctx, `safety-block:${player.id}`, BLOCK_RATE_MAX, BLOCK_WINDOW_S)) return { error: 'rate' };
  await ctx.db.prepare('DELETE FROM blocks WHERE player = ?1 AND blocked = ?2').bind(player.id, target).run();
  return blocksOf(ctx, player);
}

/** @param {any} player */
export const conductAgreed = (player) => player?.conduct_v === CONDUCT_VERSION;

export async function agreeConduct({ db }, player, { v }) {
  if (v !== CONDUCT_VERSION) return { error: 'conduct-stale' };
  await db.prepare('UPDATE players SET conduct_v = ?1 WHERE id = ?2').bind(CONDUCT_VERSION, player.id).run();
  return { ok: true, conduct: CONDUCT_VERSION };
}

export const credibleReporter = (player, nowS) => accountKind(player) === 'linked' && !isMuted(player, nowS) && Number(player?.created_at) <= nowS - SPROUT_S;

/** @param {{ db: any, nowS: number, rand: (b: Uint8Array) => void }} ctx @param {any} env @param {string} target
 * @param {'report'|'review'} source @param {'chat'|'spawn'} [kind] */
export async function openCaseFor({ db, nowS, rand }, env, target, source, kind = 'chat') {
  // The mod_cases_open index allows one open case per account and kind, so a racing insert is ignored.
  await db.prepare('INSERT OR IGNORE INTO mod_cases (id, target, source, status, opened_at, updated_at, ai_state, discord_state, kind) VALUES (?1, ?2, ?3, \'open\', ?4, ?4, ?5, ?6, ?7)')
    .bind(caseIdOf(rand), target, source, nowS, 'off', discordOn(env) ? 'due' : 'off', kind).run();
  const open = await db.prepare("SELECT id FROM mod_cases WHERE target = ?1 AND kind = ?2 AND status = 'open'").bind(target, kind).first();
  return String(open.id);
}

/** @param {any} db @param {string} caseId
 * @param {{tab: string, sub: string, name: string, at: number, text: string, sg?: string|null}[]} lines
 * @param {string|null} [target] */
export async function keepCaseLines(db, caseId, lines, target = null) {
  if (!lines.length) return 0;
  const held = (await db.prepare('SELECT at, sub FROM mod_case_lines WHERE case_id = ?1').bind(caseId).all())?.results ?? [];
  const key = (l) => `${l.at}|${l.sub}`;
  const have = new Set(held.map(key));
  const fresh = lines.filter((l) => !have.has(key(l)));
  const own = (target ? fresh.filter((l) => l.sub === target) : fresh).slice(-CASE_LINES_MAX);
  const others = target ? fresh.filter((l) => l.sub !== target) : [];
  let room = CASE_LINES_MAX - held.length;
  const out = [];
  if (own.length > room) {
    out.push(db.prepare('DELETE FROM mod_case_lines WHERE rowid IN (SELECT rowid FROM mod_case_lines WHERE case_id = ?1 ORDER BY (sub = ?2), at LIMIT ?3)')
      .bind(caseId, target ?? '', own.length - room));
    room = own.length;
  }
  const add = [...own, ...(room > own.length ? others.slice(-(room - own.length)) : [])];
  if (!add.length) return 0;
  await db.batch([...out, ...add.map((l) => db.prepare('INSERT OR IGNORE INTO mod_case_lines (case_id, at, sub, name, tab, text, sg) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(caseId, l.at, l.sub, l.name, l.tab, l.text, l.sg ?? null))]);
  return add.length;
}

export const touchCase = (db, env, caseId, nowS) => db.prepare(`UPDATE mod_cases SET updated_at = ?2,
    reports = (SELECT COUNT(*) FROM mod_reports WHERE case_id = ?1),
    credible = (SELECT COUNT(*) FROM mod_reports WHERE case_id = ?1 AND counted = 1 AND at > ?3),
    discord_state = CASE WHEN ?5 = 1 THEN 'due' ELSE discord_state END
  WHERE id = ?1`).bind(caseId, nowS, nowS - REPORT_AUTO_WINDOW_S, 0, discordOn(env) ? 1 : 0).run();

/** @param {any} db
 * @param {{ caseId?: string|null, target?: string|null, status: 'actioned'|'dismissed', by: string, resolution: string, nowS: number }} r
 */
export const resolveCase = (db, { caseId = null, target = null, status, by, resolution, nowS }) => db.prepare(`UPDATE mod_cases SET status = ?3,
    resolved_by = ?4, resolved_at = ?5, resolution = ?6, updated_at = ?5, claimed_at = NULL,
    ai_state = CASE WHEN ai_state IN ('due', 'reading') THEN 'off' ELSE ai_state END,
    discord_state = CASE WHEN discord_msg IS NULL THEN 'off' ELSE 'due' END
  WHERE status = 'open' AND (id = ?1 OR target = ?2)`).bind(caseId, target, status, by, nowS, resolution);

/** @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => void }} ctx
 * @param {any} reporter @param {any} env @param {any} body
 * @param {{ fetchFn?: (url: string, init: any) => Promise<Response> }} [io] */
export async function fileReport(ctx, reporter, env, body, { fetchFn = (u, i) => globalThis.fetch(u, i) } = {}) {
  const { db, nowS, subtle } = ctx;
  const shape = reportShape(body, nowS * 1000);
  if ('error' in shape) return shape;
  if (shape.target === reporter.id) return { error: 'report-self' };
  if (await overRate(ctx, `safety-report:${reporter.id}`, REPORT_RATE_MAX, REPORT_WINDOW_S)) return { error: 'rate' };
  const key = await gatePublicKey(env, subtle);
  if (!key) return { error: 'report-closed' };
  /** @type {typeof shape.lines} */
  const lines = [];
  for (const l of shape.lines) {
    if (await verifyStamp(l, l.sg, key, { subtle })) lines.push(l);
    else if (l.sub === shape.target) return { error: 'report-unwitnessed' };
  }
  const target = await db.prepare('SELECT * FROM players WHERE id = ?1').bind(shape.target).first();
  if (!target) return { error: 'no-player' };
  const counted = credibleReporter(reporter, nowS) ? 1 : 0;
  if (!counted && !(await db.prepare("SELECT 1 AS y FROM mod_cases WHERE target = ?1 AND kind = 'chat' AND status = 'open'").bind(target.id).first())
    && await overRate(ctx, 'safety-uncounted-cases', UNCOUNTED_CASES_HOUR, 3600)) return { error: 'rate' };
  const caseId = await openCaseFor(ctx, env, target.id, 'report');
  const filed = await db.prepare('INSERT OR IGNORE INTO mod_reports (case_id, reporter, reason, note, at, counted) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(caseId, reporter.id, shape.reason, shape.note || null, nowS, counted).run();
  if (!filed?.meta?.changes) return { ok: true, case: caseId, repeat: true };
  await keepCaseLines(db, caseId, lines, target.id);
  await touchCase(db, env, caseId, nowS);
  let order = null, until = 0;
  const row = await db.prepare('SELECT auto_at FROM mod_cases WHERE id = ?1').bind(caseId).first();
  const since = Math.max(nowS - REPORT_AUTO_WINDOW_S, Number(row?.auto_at ?? 0));
  const wave = await db.prepare('SELECT COUNT(*) AS n FROM mod_reports WHERE case_id = ?1 AND counted = 1 AND at > ?2').bind(caseId, since).first();
  if (Number(wave?.n) >= REPORT_AUTO_MUTE && autoMutable(target, env, nowS)) {
    // The statement that marks the case decides who mutes, so two reports at once mute once.
    const claimed = await db.prepare("UPDATE mod_cases SET auto = 'reports', auto_at = ?2 WHERE id = ?1 AND COALESCE(auto_at, 0) = ?3").bind(caseId, nowS, Number(row?.auto_at ?? 0)).run();
    if (claimed?.meta?.changes) {
      until = await autoMute(db, env, target, { actor: 'auto:reports', reason: `${wave.n} reports: ${shape.reason}`, caseId, nowS });
      if (until) {
        order = await lawOrder(env, subtle, nowS, { s: target.id, mu: until });
        await pushLaw(env, fetchFn, order);
      }
    }
  }
  return { ok: true, case: caseId, ...(until ? { muted: until } : {}), ...(order ? { order } : {}) };
}

export const CASES_LIST_MAX = 10;

/** @param {{ db: any }} ctx @param {any} actor @param {any} env */
export async function modCases({ db }, actor, env) {
  if (!canModerate(actor, env)) return { error: 'not-moderator' };
  const rows = (await db.prepare(`SELECT c.*, p.handle, p.guest_name FROM mod_cases c JOIN players p ON p.id = c.target WHERE c.status = 'open'
    AND (c.kind = 'chat' OR ?2 = 1) ORDER BY c.credible DESC, c.reports DESC, c.updated_at DESC LIMIT ?1`).bind(CASES_LIST_MAX, isDeveloper(actor, env) ? 1 : 0).all())?.results ?? [];
  const reasons = rows.length ? (await db.prepare(`SELECT case_id, reason FROM mod_reports WHERE case_id IN (${rows.map((_, i) => `?${i + 1}`).join(', ')})`).bind(...rows.map((r) => r.id)).all())?.results ?? [] : [];
  return {
    ok: true,
    cases: rows.map((c) => ({ id: c.id, target: c.target, kind: c.kind, name: displayName(c), reports: c.reports, credible: c.credible,
      reasons: [...new Set(reasons.filter((r) => r.case_id === c.id).map((r) => String(r.reason)))], auto: c.auto ?? null, openedAt: c.opened_at, updatedAt: c.updated_at })),
  };
}

export async function modCase({ db }, actor, env, { target, name, caseId = null }) {
  if (!canModerate(actor, env)) return { error: 'not-moderator' };
  const row = await findAccount(db, { target, name });
  if ('error' in row) return row;
  const c = await db.prepare(`SELECT * FROM mod_cases WHERE target = ?1 AND status = 'open' AND (?2 IS NULL OR id = ?2) AND (kind = 'chat' OR ?3 = 1)
    ORDER BY kind = 'chat' DESC LIMIT 1`).bind(row.id, typeof caseId === 'string' ? caseId : null, isDeveloper(actor, env) ? 1 : 0).first();
  if (!c) return { error: 'no-case' };
  const [lines, reports] = await Promise.all(caseReads(db, c.id).map(async (st) => (await st.all())?.results ?? []));
  return { ok: true, case: caseView(row, c, lines, reports) };
}

/** @param {any} db @param {string} caseId */
export const caseReads = (db, caseId) => [
  db.prepare('SELECT at, sub, name, tab, text FROM mod_case_lines WHERE case_id = ?1 ORDER BY at, sub').bind(caseId),
  db.prepare('SELECT reason, note FROM mod_reports WHERE case_id = ?1 ORDER BY at').bind(caseId),
];
/** @param {any} row @param {any} c @param {any[]} lines @param {any[]} reports */
export const caseView = (row, c, lines, reports) => ({ id: c.id, target: row.id, kind: c.kind, name: displayName(row), status: c.status, reports: c.reports, credible: c.credible,
  reasons: [...new Set(reports.map((r) => String(r.reason)))], notes: reports.map((r) => r.note).filter(Boolean), auto: c.auto ?? null,
  lines: lines.map((l) => ({ at: l.at, sub: l.sub, name: l.name, tab: l.tab, text: l.text })) });

export const modDismiss = (ctx, actor, env, { target, name, caseId = null }, { fetchFn = (u, i) => globalThis.fetch(u, i) } = {}) =>
  modAct(ctx, actor, env, { act: 'dismiss', target, name, caseId, from: 'in the game' }, { push: (o) => pushLaw(env, fetchFn, o) });

export const CLICK_RE = /^[\w-]{8,64}$/;
export const CASE_ACT_S = 60;
const ACT_DENIED = Object.freeze(['staff-claimed', 'not-developer', 'admin-sanction']);

export const claimHeldSql = (/** @type {string} */ t, /** @type {number} */ n) => `(${t}.claimed_by IS NOT NULL AND ${t}.claim_until > ?${n}
  AND EXISTS (SELECT 1 FROM staff_sessions cs WHERE cs.token_hash = ${t}.claim_session AND cs.expires_at > ?${n} AND cs.last_act + ${STAFF_IDLE_S} > ?${n}))`;

/** @param {number} until */
const utcMinute = (until) => new Date(until * 1000).toISOString().slice(0, 16).replace('T', ' ');

/** @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => void }} ctx @param {any} actor
 * @param {any} env
 * @param {{ act: 'mute'|'ban'|'unban'|'dismiss', target?: unknown, name?: unknown, row?: any, caseId?: unknown, click?: unknown, minutes?: any, days?: any,
 *   reason?: unknown, actorName?: string, from?: string, keepLonger?: boolean, resolution?: (r: any) => string }} ask
 * @param {{ push?: (order: string) => unknown, audit?: (act: string, target?: string|null, detail?: object|null, how?: object) => any }} [io]
 */
export async function modAct(ctx, actor, env, ask, { push, audit } = {}) {
  if (!canModerate(actor, env)) return { error: 'not-moderator' };
  const { db, nowS } = ctx;
  const at = { target: /** @type {string|null} */ (null), name: /** @type {string|null} */ (null), click: /** @type {string|null} */ (null),
    caseId: /** @type {string|null} */ (null), take: /** @type {string|null} */ (null), landed: false };
  const giveBack = () => db.prepare("UPDATE mod_cases SET act_click = NULL, act_at = NULL WHERE id = ?1 AND act_click = ?2 AND status = 'open'").bind(at.caseId, at.take).run();
  const write = audit ?? ((/** @type {string} */ act, /** @type {string|null} */ target, /** @type {object|null} */ detail, /** @type {any} */ how) =>
    auditStatement(db, nowS, { actor, role: staffRole(actor, env), act, target, detail, ...how }));
  const num = (/** @type {unknown} */ v) => (Number.isFinite(v) ? v : null);
  const detail = (/** @type {any} */ r, extra = {}) => ({ name: at.name, door: ask.from ?? null,
    ...(ask.act === 'mute' ? { minutes: num(ask.minutes) } : ask.act === 'ban' ? { days: num(ask.days), reason: typeof ask.reason === 'string' ? ask.reason.slice(0, 200) : null } : {}),
    ...(at.caseId ? { case: at.caseId } : {}), ...(r?.repeat ? { repeat: true } : {}), ...(r?.error ? { error: r.error } : {}), ...extra });
  /** @type {any} */
  let r;
  try { r = await actOnce(ctx, actor, env, ask, push, at); }
  catch (e) {
    // The act, its record, and the case's close share one batch, so a case still open was never struck.
    if (at.take) await giveBack().catch(() => {});
    // The mod_actions_click index refuses a second record for the same press, so it is answered as the first.
    const first = !at.landed && at.click ? await db.prepare('SELECT 1 AS y FROM mod_actions WHERE click = ?1').bind(at.click).first().catch(() => null) : null;
    if (!first) {
      await write(ask.act, at.target, detail(null, { error: String(/** @type {any} */ (e)?.message ?? e).slice(0, 200), ...(at.landed ? { landed: true } : {}) }), { outcome: 'failed' }).run().catch(() => {});
      throw e;
    }
    r = { ok: true, repeat: true, target: at.target, name: at.name };
  }
  if (r.error && at.take) await giveBack();
  await write(ask.act, at.target, detail(r), { outcome: r.error ? (ACT_DENIED.includes(r.error) ? 'denied' : 'failed') : 'ok' }).run();
  return r;
}

/** @param {any} ctx @param {any} actor @param {any} env @param {any} ask
 * @param {((order: string) => unknown)|undefined} push @param {any} at */
async function actOnce(ctx, actor, env, ask, push, at) {
  const { db, nowS, subtle } = ctx;
  const row = ask.row ?? await findAccount(db, { target: ask.target, name: ask.name });
  if ('error' in row) return row;
  const name = displayName(row);
  at.target = row.id; at.name = name;
  const click = ask.click ?? null;
  if (click !== null && !(typeof click === 'string' && CLICK_RE.test(click))) return { error: 'bad-click' };
  at.click = click;
  const lift = ask.act === 'unban' || (ask.act === 'mute' && ask.minutes === 0);
  const [seen, c] = await Promise.all([
    click ? db.prepare('SELECT 1 AS y FROM mod_actions WHERE click = ?1').bind(click).first() : null,
    lift ? null : ask.caseId != null
      ? (typeof ask.caseId === 'string' ? db.prepare('SELECT * FROM mod_cases WHERE id = ?1 AND target = ?2').bind(ask.caseId, row.id).first() : null)
      : db.prepare(`SELECT * FROM mod_cases WHERE target = ?1 AND status = 'open' AND (kind = 'chat' OR ?2 = 1)
      ORDER BY kind = 'chat' DESC LIMIT 1`).bind(row.id, isDeveloper(actor, env) ? 1 : 0).first(),
  ]);
  if (seen) return { ok: true, repeat: true, target: row.id, name };
  if (!lift && ask.caseId != null && !c) return { error: 'no-case' };
  if (ask.act === 'dismiss' && !c) return { error: 'no-case' };
  const take = click ?? caseIdOf(ctx.rand);
  if (c) {
    at.caseId = c.id;
    if (c.status !== 'open') return { error: 'case-closed' };
    if (c.kind !== 'chat' && !isDeveloper(actor, env)) return { error: 'not-developer' };
    // A take older than CASE_ACT_S belongs to an act that died holding it, so any press may take the case again.
    const took = await db.prepare(`UPDATE mod_cases SET act_click = ?2, act_at = ?3 WHERE id = ?1 AND status = 'open' AND (act_click IS NULL OR act_at < ?3 - ${CASE_ACT_S})
      AND (claimed_by IS ?4 OR NOT ${claimHeldSql('mod_cases', 3)})`).bind(c.id, take, nowS, actor.id).run();
    if (!took.meta.changes) {
      const now = await db.prepare(`SELECT status, claimed_by, ${claimHeldSql('mod_cases', 2)} AS held FROM mod_cases WHERE id = ?1`).bind(c.id, nowS).first();
      return { error: now?.held && now.claimed_by !== actor.id ? 'staff-claimed' : now?.status === 'open' ? 'case-acted' : 'case-closed' };
    }
    at.take = take;
  }
  const by = ask.actorName ?? displayName(actor);
  const caseId = c?.id ?? null;
  const closing = (/** @type {any} */ x, /** @type {string} */ said) => (c ? [resolveCase(db, { caseId, status: 'actioned', by: displayName(actor),
    resolution: ask.resolution?.(x) ?? (ask.from ? `${said} (${ask.from})` : said), nowS })] : []);
  const mutedTill = (/** @type {any} */ x) => `muted until ${utcMinute(x.until)} UTC`;
  /** @type {any} */
  let r;
  /** @type {string|null} */
  let order = null;
  if (ask.act === 'mute') {
    const minutes = ask.minutes;
    if (ask.keepLonger && muteMinutesOk(minutes) && minutes && isMuted(row, nowS) && Number(row.muted_until) >= nowS + minutes * 60) {
      r = canModerate(row, env) ? { error: 'protected' } : { ok: true, target: row.id, name, until: Number(row.muted_until), kept: true };
      if (!r.error) {
        await db.batch([actionStatement(db, { target: row.id, kind: 'mute', until: r.until, reason: reasonOf(ask.reason), actor: actor.id, actorName: by, caseId, click, at: nowS }), ...closing(r, mutedTill(r))]);
        at.landed = true;
      }
    } else {
      r = await muteAccount(ctx, actor, env, { target: row.id, minutes, also: (/** @type {any} */ x) => [
        actionStatement(db, { target: row.id, kind: x.until ? 'mute' : 'unmute', until: x.until || null, reason: reasonOf(ask.reason), actor: actor.id, actorName: by, caseId, click, at: nowS }),
        ...closing(x, mutedTill(x))] });
      if (!r.error) {
        at.landed = true;
        order = await lawOrder(env, subtle, nowS, { s: row.id, mu: r.until });
      }
    }
  } else if (ask.act === 'ban' || ask.act === 'unban') {
    r = ask.act === 'ban'
      ? await banAccount(ctx, actor, env, { target: row.id, days: ask.days, reason: ask.reason, caseId, click, actorName: by, keepLonger: !!ask.keepLonger, also: (x) => closing(x, 'banned') })
      : await unbanAccount(ctx, actor, env, { target: row.id, actorName: by });
    at.landed = !r.error;
    if (!r.error) order = await lawOrder(env, subtle, nowS, { s: row.id, bn: r.until });
  } else if (ask.act === 'dismiss') {
    await db.batch([resolveCase(db, { caseId, status: 'dismissed', by: displayName(actor), resolution: 'no action', nowS }),
      actionStatement(db, { target: row.id, kind: 'dismiss', actor: actor.id, actorName: by, caseId, click, at: nowS })]);
    at.landed = true;
    order = await voidAutoMutes(ctx, env, { caseId: /** @type {string} */ (caseId), row, actor, actorName: by });
    r = { ok: true, target: row.id, name };
  } else r = { error: 'not-found' };
  if (r.error) return r;
  if (order) await (push ?? ((/** @type {string} */ o) => pushLaw(env, (u, i) => globalThis.fetch(u, i), o)))(order);
  return { ...r, ...(caseId ? { case: caseId } : {}), order };
}


/** @param {any} player */
export const bannedAnswer = (player) => ({ error: 'banned', until: bannedUntil(player), reason: player?.ban_reason ?? null });
