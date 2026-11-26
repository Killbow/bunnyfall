// @ts-check

import { displayName, overRate } from './accounts.js';
import { canModerate } from './titles.js';
import { findAccount, pushLaw, reasonOf } from './sanctions.js';
import { signingKey } from './signing.js';
import { mintFreezeOrder, mintStaffLineOrder } from '../../src/net/identityToken.js';
import { sanitizeChat } from '../../src/net/wire.js';

export const FREEZE_MINUTES_MAX = 7 * 24 * 60;
export const FREEZES_PAGE = 50;
export const CHAT_PAGE = 50;
export const CHATS_PAGE = 25;
export const STAFF_LINES_KEEP_S = 90 * 24 * 60 * 60;
export const PLAYER_LINES_MAX = 20;
export const PLAYER_LINES_WINDOW_S = 10 * 60;
export const PUSH_RETRY_AFTER_S = 30;
export const PUSH_RETRY_MAX = 20;
const READ_ROW_S = 10 * 60;

export const FREEZE_ROUTES = Object.freeze(['/v1/staff/freeze', '/v1/staff/unfreeze', '/v1/staff/freezes', '/v1/staff/freeze-push',
  '/v1/staff/talk', '/v1/staff/chat', '/v1/staff/chat-send', '/v1/staff/chat-close', '/v1/staff/chats']);
const ADMIN_ROUTES = new Set(['/v1/staff/freeze', '/v1/staff/unfreeze', '/v1/staff/freezes', '/v1/staff/freeze-push']);
export const STAFF_CHAT_ROUTES = Object.freeze(['/v1/staff-chat/read', '/v1/staff-chat/send']);
export const FREEZE_ALLOWED = Object.freeze(['/v1/auth/logout', '/v1/auth/token', '/v1/account', '/v1/realm', '/v1/realm/join', '/v1/realm/leave', ...STAFF_CHAT_ROUTES,
  '/v1/safety/staff-messages', '/v1/safety/staff-message-ok']);
const ALLOWED = new Set(FREEZE_ALLOWED);

const LANDED = 'EXISTS (SELECT 1 FROM players WHERE id = ?1 AND freeze_rev = ?4 AND frozen_by = ?3 AND frozen_at = ?2 AND frozen_until IS ?5)';

export const FREEZE_STATUS = Object.freeze({ frozen: 403, 'bad-reason': 400, 'bad-text': 400, 'not-frozen': 409, 'no-thread': 404, 'freeze-thread': 409, 'freeze-moved': 409 });
export const STAFF_CHAT_STATUS = Object.freeze({ 'bad-text': 400, 'no-thread': 404, rate: 429 });

/** @param {any} row */
export const frozenUntil = (row) => (Number.isSafeInteger(row?.frozen_until) ? row.frozen_until : 0);
/** @param {any} row @param {number} nowS */
export const isFrozen = (row, nowS) => frozenUntil(row) > nowS;
/** @param {any} row */
export const frozenAnswer = (row) => ({ error: 'frozen', until: frozenUntil(row), reason: typeof row?.frozen_reason === 'string' ? row.frozen_reason : null });

/** @param {string} path @param {boolean} readsRecord @param {any} player @param {number} nowS */
export function freezeRefusal(path, readsRecord, player, nowS) {
  if (!isFrozen(player, nowS) || ALLOWED.has(path) || readsRecord) return null;
  return frozenAnswer(player);
}

/** @param {any} env */
export function discordInvite(env) {
  const u = env?.DISCORD_INVITE_URL;
  return typeof u === 'string' && /^https:\/\/[\w.-]+\/[\w/-]+$/.test(u.trim()) ? u.trim() : null;
}

/** @param {{ db: any, nowS: number, subtle: SubtleCrypto }} ctx @param {any} env
 * @param {{ id: string, frozen_until: any, freeze_rev: any }} row @param {number} [tries] */
export async function pushFreeze({ db, nowS, subtle }, env, row, tries = 3) {
  const key = await signingKey(env, subtle);
  if (!key) return false;
  const at = Math.max(nowS, Math.floor(Date.now() / 1000));
  const fz = frozenUntil(row) > at ? frozenUntil(row) : 0;
  const order = await mintFreezeOrder({ s: row.id, fz }, key, { subtle, nowS: at });
  if (!(await pushLaw(env, (u, i) => globalThis.fetch(u, i), order))) return false;
  const set = await db.prepare('UPDATE players SET freeze_live = 1 WHERE id = ?1 AND freeze_rev = ?2 AND freeze_live = 0').bind(row.id, Number(row.freeze_rev)).run();
  if (set.meta.changes || tries < 1) return true;
  // The hub keeps the newest order by mint time, so a push whose revision moved on pushes the current row again.
  const cur = await db.prepare('SELECT id, frozen_until, freeze_rev FROM players WHERE id = ?1').bind(row.id).first();
  if (!cur || Number(cur.freeze_rev) === Number(row.freeze_rev)) return true;
  if (!(await pushFreeze({ db, nowS: at, subtle }, env, cur, tries - 1))) await db.prepare('UPDATE players SET freeze_live = 0 WHERE id = ?1 AND freeze_rev = ?2').bind(cur.id, Number(cur.freeze_rev)).run();
  return true;
}

/** @param {{ nowS: number, subtle: SubtleCrypto }} ctx @param {any} env @param {string} player @param {number} line */
async function pushLine({ nowS, subtle }, env, player, line) {
  const key = await signingKey(env, subtle);
  if (!key) return false;
  return pushLaw(env, (u, i) => globalThis.fetch(u, i), await mintStaffLineOrder({ s: player, sl: line }, key, { subtle, nowS }));
}

/** @param {any} t @param {any} player @param {number} nowS */
const threadOpen = (t, player, nowS) => !!t && t.closed_at == null && (t.why === 'talk' || isFrozen(player, nowS));

/** @param {any} l */
const lineView = (l) => ({ id: l.id, at: l.at, staff: l.staff === 1, text: l.text, ...(l.staff === 1 ? { by: l.author_handle ?? null } : {}) });

/** @param {any} ctx @param {any} env @param {string} path @param {any} body
 * @param {{ player: any, role: string }} who
 * @param {(act: string, target?: string|null, detail?: object|null, how?: object) => any} audit */
export async function staffFreeze(ctx, env, path, body, who, audit) {
  const { db, nowS } = ctx;
  const me = who.player;
  if (ADMIN_ROUTES.has(path) && who.role !== 'admin') {
    await audit('refused', null, { path, need: 'admin' }, { outcome: 'denied' }).run();
    return { error: 'staff-admin' };
  }

  if (path === '/v1/staff/freezes') {
    const from = Number.isSafeInteger(body.from) && body.from > 0 ? body.from : 0;
    const rows = (await db.prepare(`SELECT p.id, p.handle, p.guest_name, p.frozen_until, p.frozen_reason, p.frozen_at, p.freeze_live, b.handle AS by_handle,
        t.closed_at, t.last_at, t.last_staff, t.why
      FROM players p LEFT JOIN players b ON b.id = p.frozen_by LEFT JOIN staff_chat_threads t ON t.player = p.id
      WHERE p.id IN (SELECT id FROM players WHERE frozen_until > ?1 UNION SELECT id FROM players WHERE freeze_live = 0)
      ORDER BY p.freeze_live = 0 DESC, (t.closed_at IS NULL AND t.last_staff = 0) DESC, p.frozen_at DESC LIMIT ?2 OFFSET ?3`).bind(nowS, FREEZES_PAGE + 1, from).all())?.results ?? [];
    await audit('freezes-read', null, null, { onceIn: READ_ROW_S }).run();
    return {
      freezes: rows.slice(0, FREEZES_PAGE).map((r) => ({
        target: r.id, name: displayName(r), frozen: isFrozen(r, nowS), until: isFrozen(r, nowS) ? r.frozen_until : 0, reason: r.frozen_reason ?? null,
        by: r.by_handle ?? null, at: r.frozen_at ?? null, live: r.freeze_live !== 0,
        chat: r.why ? { open: threadOpen(r, r, nowS), lastAt: r.last_at, waiting: r.closed_at == null && r.last_staff === 0 } : null,
      })),
      next: rows.length > FREEZES_PAGE ? from + FREEZES_PAGE : null,
    };
  }

  if (path === '/v1/staff/chats') {
    const from = Number.isSafeInteger(body.from) && body.from > 0 ? body.from : 0;
    const rows = (await db.prepare(`SELECT t.*, p.handle, p.guest_name, p.frozen_until FROM staff_chat_threads t JOIN players p ON p.id = t.player
      WHERE t.closed_at IS NULL AND (t.why = 'talk' OR p.frozen_until > ?3) ORDER BY t.last_staff = 0 DESC, t.last_at DESC LIMIT ?1 OFFSET ?2`).bind(CHATS_PAGE + 1, from, nowS).all())?.results ?? [];
    await audit('chats-read', null, null, { onceIn: READ_ROW_S }).run();
    return {
      chats: rows.slice(0, CHATS_PAGE).map((t) => ({
        target: t.player, name: displayName(t), why: t.why, playerIn: t.player_in === 1, frozen: isFrozen(t, nowS), lastAt: t.last_at, waiting: t.last_staff === 0,
      })),
      next: rows.length > CHATS_PAGE ? from + CHATS_PAGE : null,
    };
  }

  const row = await findAccount(db, { target: body.target, name: body.name });
  if ('error' in row) return row;
  const name = displayName(row);
  const act = path.slice('/v1/staff/'.length);
  const failed = async (/** @type {string} */ error, /** @type {object} */ detail = {}) => {
    await audit(act, row.id, { name, ...detail, error }, { outcome: 'failed' }).run();
    return { error };
  };

  if (path === '/v1/staff/freeze' || path === '/v1/staff/unfreeze') {
    const freeze = path === '/v1/staff/freeze';
    const minutes = body.minutes;
    const reason = reasonOf(body.reason);
    if (freeze && (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > FREEZE_MINUTES_MAX)) return failed('bad-minutes', { minutes });
    if (freeze && !reason) return failed('bad-reason');
    if (freeze && row.id === me.id) return failed('staff-self');
    if (freeze && canModerate(row, env)) return failed('protected');
    if (!freeze && !isFrozen(row, nowS)) return failed('not-frozen');
    const until = freeze ? nowS + /** @type {number} */ (minutes) * 60 : null;
    const rev = Number(row.freeze_rev) || 0;
    const detail = freeze ? { name, minutes, reason } : { name };
    // The act, its thread, and its audit row share one batch keyed on the read revision, so racing Admins land one.
    const [, set] = await db.batch([
      audit(act, row.id, detail, { okIf: { sql: 'EXISTS (SELECT 1 FROM players WHERE id = ? AND freeze_rev = ?)', args: [row.id, rev] } }),
      db.prepare(`UPDATE players SET frozen_until = ?2, frozen_reason = ?3, frozen_by = ?4, frozen_at = ?5, freeze_rev = ?6 + 1, freeze_live = 0
        WHERE id = ?1 AND freeze_rev = ?6`).bind(row.id, until, freeze ? reason : null, me.id, nowS, rev),
      freeze
        ? db.prepare(`INSERT INTO staff_chat_threads (player, why, opened_at, opened_by, player_in, last_at, last_staff) SELECT ?1, 'freeze', ?2, ?3, 1, ?2, 1 WHERE ${LANDED}
            ON CONFLICT(player) DO UPDATE SET why = 'freeze', player_in = 1, opened_at = CASE WHEN closed_at IS NULL THEN opened_at ELSE ?2 END,
            opened_by = CASE WHEN closed_at IS NULL THEN opened_by ELSE ?3 END, closed_at = NULL`).bind(row.id, nowS, me.id, rev + 1, until)
        : db.prepare(`UPDATE staff_chat_threads SET closed_at = ?2, player_in = 0 WHERE player = ?1 AND closed_at IS NULL AND ${LANDED}`).bind(row.id, nowS, me.id, rev + 1, until),
    ]);
    if (!set.meta.changes) return { error: 'freeze-moved' };
    const live = await pushFreeze(ctx, env, { id: row.id, frozen_until: until, freeze_rev: rev + 1 });
    return { ok: true, target: row.id, name, until: until ?? 0, reason: freeze ? reason : null, live };
  }

  if (path === '/v1/staff/freeze-push') {
    if (row.freeze_live !== 0) return { ok: true, target: row.id, name, live: true };
    const live = await pushFreeze(ctx, env, row);
    await audit(act, row.id, { name, rev: Number(row.freeze_rev) }, { outcome: live ? 'ok' : 'failed' }).run();
    return { ok: true, target: row.id, name, live };
  }

  const thread = await db.prepare('SELECT * FROM staff_chat_threads WHERE player = ?1').bind(row.id).first();
  const open = threadOpen(thread, row, nowS);

  if (path === '/v1/staff/talk') {
    if (row.id === me.id) return failed('staff-self');
    if (!open) {
      await db.batch([
        db.prepare(`INSERT INTO staff_chat_threads (player, why, opened_at, opened_by, player_in, last_at, last_staff) VALUES (?1, 'talk', ?2, ?3, ?4, ?2, 1)
          ON CONFLICT(player) DO UPDATE SET why = 'talk', opened_at = ?2, opened_by = ?3, player_in = ?4, closed_at = NULL, last_at = ?2, last_staff = 1`)
          .bind(row.id, nowS, me.id, isFrozen(row, nowS) ? 1 : 0),
        audit('chat-open', row.id, { name }),
      ]);
    }
    return { ok: true, target: row.id, name, why: open ? thread.why : 'talk', playerIn: open ? thread.player_in === 1 : isFrozen(row, nowS) };
  }

  if (path === '/v1/staff/chat') {
    const before = Number.isSafeInteger(body.before) && body.before > 0 ? body.before : Number.MAX_SAFE_INTEGER;
    const lines = (await db.prepare(`SELECT l.id, l.at, l.staff, l.text, a.handle AS author_handle FROM staff_chat_lines l LEFT JOIN players a ON a.id = l.author
      WHERE l.player = ?1 AND l.id < ?2 ORDER BY l.id DESC LIMIT ?3`).bind(row.id, before, CHAT_PAGE).all())?.results ?? [];
    await audit('chat-read', row.id, { name }, { onceIn: READ_ROW_S }).run();
    return {
      target: row.id, name, open, why: thread?.why ?? null, playerIn: open && thread.player_in === 1,
      frozen: isFrozen(row, nowS) ? { until: row.frozen_until, reason: row.frozen_reason ?? null } : null,
      lines: lines.map(lineView), next: lines.length === CHAT_PAGE ? lines[lines.length - 1].id : null,
    };
  }

  if (path === '/v1/staff/chat-send') {
    const text = typeof body.text === 'string' ? sanitizeChat(body.text) : '';
    if (!text) return failed('bad-text');
    if (!open) return failed('no-thread');
    const line = await db.prepare('INSERT INTO staff_chat_lines (player, at, author, staff, text) VALUES (?1, ?2, ?3, 1, ?4) RETURNING id').bind(row.id, nowS, me.id, text).first();
    await db.batch([
      db.prepare('UPDATE staff_chat_threads SET player_in = 1, last_at = ?2, last_staff = 1 WHERE player = ?1').bind(row.id, nowS),
      audit('chat-line', row.id, { name, line: line.id, len: text.length }),
    ]);
    const live = await pushLine(ctx, env, row.id, line.id);
    return { ok: true, target: row.id, line: { id: line.id, at: nowS, staff: true, text, by: me.handle ?? null }, live };
  }

  if (path === '/v1/staff/chat-close') {
    if (!open) return failed('no-thread');
    if (thread.why === 'freeze') return failed('freeze-thread');
    await db.batch([
      audit(act, row.id, { name }),
      db.prepare('UPDATE staff_chat_threads SET closed_at = ?2, player_in = 0 WHERE player = ?1 AND closed_at IS NULL').bind(row.id, nowS),
    ]);
    return { ok: true, target: row.id };
  }
  return { error: 'not-found' };
}

/** @param {any} ctx @param {any} env @param {string} path @param {any} body @param {any} player
 * @param {(db: any, nowS: number, row: any) => any} auditStatement */
export async function playerStaffChat(ctx, env, path, body, player, auditStatement) {
  const { db, nowS } = ctx;
  const thread = await db.prepare('SELECT * FROM staff_chat_threads WHERE player = ?1').bind(player.id).first();
  const open = threadOpen(thread, player, nowS) && thread.player_in === 1;
  if (path === '/v1/staff-chat/read') {
    const after = Number.isSafeInteger(body?.after) && body.after > 0 ? body.after : 0;
    const lines = open ? (await db.prepare(`SELECT id, at, staff, text FROM staff_chat_lines WHERE player = ?1 AND id > ?2
      ORDER BY id DESC LIMIT ?3`).bind(player.id, after, CHAT_PAGE).all())?.results ?? [] : [];
    return {
      open, frozen: isFrozen(player, nowS) ? { until: player.frozen_until, reason: player.frozen_reason ?? null } : null,
      lines: lines.reverse().map((l) => ({ id: l.id, at: l.at, staff: l.staff === 1, text: l.text })), invite: discordInvite(env),
    };
  }
  const text = typeof body?.text === 'string' ? sanitizeChat(body.text) : '';
  if (!text) return { error: 'bad-text' };
  if (!open) return { error: 'no-thread' };
  if (await overRate(ctx, `staffchat:${player.id}`, PLAYER_LINES_MAX, PLAYER_LINES_WINDOW_S)) return { error: 'rate' };
  const [ins] = await db.batch([
    db.prepare('INSERT INTO staff_chat_lines (player, at, author, staff, text) VALUES (?1, ?2, ?1, 0, ?3) RETURNING id').bind(player.id, nowS, text),
    db.prepare('UPDATE staff_chat_threads SET last_at = ?2, last_staff = 0 WHERE player = ?1').bind(player.id, nowS),
  ]);
  const id = ins.results?.[0]?.id ?? null;
  // The audit row keeps the line id and length, never its words, because the audit log stores no chat text.
  await auditStatement(db, nowS, { actor: player, role: 'player', act: 'chat-line', target: player.id, detail: { line: id, len: text.length } }).run();
  return { ok: true, line: { id, at: nowS, staff: false, text } };
}

/** @param {{ db: any, nowS: number }} ctx @param {any} env */
export async function retryFreezePushes({ db, nowS }, env) {
  if (typeof env?.RELAY_LAW_URL !== 'string') return 0;
  const rows = (await db.prepare('SELECT id, frozen_until, freeze_rev FROM players WHERE freeze_live = 0 AND frozen_at <= ?1 ORDER BY frozen_at LIMIT ?2')
    .bind(nowS - PUSH_RETRY_AFTER_S, PUSH_RETRY_MAX).all())?.results ?? [];
  let n = 0;
  for (const { id } of rows) {
    const r = await db.prepare('SELECT id, frozen_until, freeze_rev FROM players WHERE id = ?1 AND freeze_live = 0').bind(id).first();
    if (r && await pushFreeze({ db, nowS, subtle: crypto.subtle }, env, r)) n++;
  }
  return n;
}

/** @param {any} db @param {number} nowS @param {number} page */
export async function sweepStaffChat(db, nowS, page) {
  const [closed, gone] = await db.batch([
    db.prepare(`UPDATE staff_chat_threads SET closed_at = ?1, player_in = 0 WHERE player IN (SELECT t.player FROM staff_chat_threads t JOIN players p ON p.id = t.player
      WHERE t.closed_at IS NULL AND t.why = 'freeze' AND COALESCE(p.frozen_until, 0) <= ?1 LIMIT ?2)`).bind(nowS, page),
    db.prepare('DELETE FROM staff_chat_lines WHERE id IN (SELECT id FROM staff_chat_lines WHERE at < ?1 LIMIT ?2)').bind(nowS - STAFF_LINES_KEEP_S, page),
  ]);
  return Number(closed?.meta?.changes ?? 0) + Number(gone?.meta?.changes ?? 0);
}

export const HOME_WATCH = Object.freeze({
  id: 'freeze', label: 'Freeze player', role: 'admin',
  /** @param {any} ctx @param {any} _env @param {any} _who @param {number} n */
  async top(ctx, _env, _who, n) {
    const { db, nowS } = ctx;
    const rows = (await db.prepare(`SELECT p.id, p.handle, p.guest_name, p.frozen_until, p.freeze_live, t.closed_at, t.last_staff, t.why
      FROM players p LEFT JOIN staff_chat_threads t ON t.player = p.id
      WHERE p.id IN (SELECT id FROM players WHERE frozen_until > ?1 UNION SELECT id FROM players WHERE freeze_live = 0) LIMIT 500`).bind(nowS).all())?.results ?? [];
    const items = rows.flatMap((r) => (r.freeze_live === 0 ? [{ level: 'high', why: 'saved, not live yet', sub: r.id, name: displayName(r) }]
      : threadOpen(r, r, nowS) && r.last_staff === 0 ? [{ level: 'medium', why: 'frozen, waiting on a staff answer', sub: r.id, name: displayName(r) }] : []));
    items.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
    return { items: items.slice(0, n), high: items.filter((x) => x.level === 'high').length, total: items.length };
  },
});
