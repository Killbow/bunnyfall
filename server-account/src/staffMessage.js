// @ts-check
// A staff message row is stored before the relay gets a signed order naming the account and the message id, never
// the words. Audit rows record the message length, never the text.
import { displayName, mintId } from './accounts.js';
import { pushLaw } from './sanctions.js';
import { signingKey } from './signing.js';
import { mintStaffMessageOrder, ID_RE } from '../../src/net/identityToken.js';
import { visibleText } from '../../src/net/wire.js';

export const STAFF_MESSAGE_MAX = 200;
export const STAFF_MESSAGE_GAP_S = 5;
export const STAFF_MESSAGES_PAGE = 50;
export const STAFF_MESSAGE_SHOW_S = 24 * 60 * 60;
export const STAFF_MESSAGE_ASK_MAX = 5;
export const STAFF_MESSAGE_KEEP_S = 30 * 24 * 60 * 60;

export const MESSAGE_ROUTES = Object.freeze(['/v1/staff/message', '/v1/staff/messages']);

export const MESSAGE_STATES = Object.freeze({ sent: 'Sent', delivered: 'Delivered', ok: 'they pressed OK', 'not-confirmed': 'Not confirmed', 'old-game': 'old game, not shown' });

/** @param {any} m @returns {keyof typeof MESSAGE_STATES} */
export function messageState(m) {
  if (m.ok_at) return 'ok';
  if (m.sockets > 0) return 'delivered';
  if (m.old > 0) return 'old-game';
  return m.pushed === 0 || (m.pushed === 1 && m.sockets === 0) ? 'not-confirmed' : 'sent';
}

/** @param {any} m */
const shown = (m) => {
  const state = messageState(m);
  return { id: m.id, at: m.at, staff: { id: m.staff_id, name: m.staff_name }, target: m.target, name: m.target_name ?? null, text: m.text, state, label: MESSAGE_STATES[state], okAt: m.ok_at ?? null };
};

/** @param {unknown} t */
export const messageText = (t) => (typeof t === 'string' ? visibleText(t.slice(0, 8 * STAFF_MESSAGE_MAX).replace(/\s+/g, ' ')).trim() : '');

/**
 * @param {any} ctx @param {any} env @param {string} path @param {any} body
 * @param {{ player: any, role: string }} who
 * @param {(act: string, target?: string|null, detail?: object|null, how?: object) => any} audit
 */
export async function staffMessage(ctx, env, path, body, who, audit) {
  const { db, nowS, subtle, rand } = ctx;
  const me = who.player;

  if (path === '/v1/staff/messages') {
    const own = who.role !== 'admin';
    const target = typeof body.target === 'string' && ID_RE.test(body.target) ? body.target : null;
    const before = Number.isSafeInteger(body.before) && body.before > 0 ? body.before : null;
    const rows = (await db.prepare(`SELECT m.rowid AS n, m.*, p.handle, p.guest_name FROM staff_messages m LEFT JOIN players p ON p.id = m.target
      WHERE (?1 IS NULL OR m.staff_id = ?1) AND (?2 IS NULL OR m.target = ?2) AND (?3 IS NULL OR m.rowid < ?3) ORDER BY m.rowid DESC LIMIT ?4`)
      .bind(own ? me.id : null, target, before, STAFF_MESSAGES_PAGE + 1).all())?.results ?? [];
    const page = rows.slice(0, STAFF_MESSAGES_PAGE);
    await audit('messages-read', target, { own }, { onceIn: 10 * 60 }).run();
    return { messages: page.map((m) => shown({ ...m, target_name: m.handle || m.guest_name ? displayName(m) : null })), next: rows.length > STAFF_MESSAGES_PAGE ? page.at(-1).n : null };
  }
  if (path !== '/v1/staff/message') return { error: 'not-found' };

  if (typeof body.target !== 'string' || !ID_RE.test(body.target)) return { error: 'body' };
  const text = messageText(body.text);
  if (!text) return { error: 'body' };
  const row = await db.prepare('SELECT id, handle, guest_name FROM players WHERE id = ?').bind(body.target).first();
  if (!row) return { error: 'no-player' };
  const detail = { name: displayName(row), chars: [...text].length };
  if (detail.chars > STAFF_MESSAGE_MAX) {
    await audit('message', row.id, { ...detail, error: 'staff-message-long' }, { outcome: 'failed' }).run();
    return { error: 'staff-message-long' };
  }
  const last = await db.prepare('SELECT at FROM staff_messages WHERE staff_id = ? ORDER BY rowid DESC LIMIT 1').bind(me.id).first();
  if (last && last.at > nowS - STAFF_MESSAGE_GAP_S) {
    await audit('message', row.id, { ...detail, error: 'staff-message-rate' }, { outcome: 'failed' }).run();
    return { error: 'staff-message-rate' };
  }
  const id = mintId(rand);
  // The gap is checked again in the INSERT, so two sends at once store only one.
  const [put] = await db.batch([
    db.prepare(`INSERT INTO staff_messages (id, at, staff_id, staff_name, target, text) SELECT ?1, ?2, ?3, ?4, ?5, ?6
      WHERE NOT EXISTS (SELECT 1 FROM (SELECT at FROM staff_messages WHERE staff_id = ?3 ORDER BY rowid DESC LIMIT 1) WHERE at > ?7)`)
      .bind(id, nowS, me.id, displayName(me), row.id, text, nowS - STAFF_MESSAGE_GAP_S),
    audit('message', row.id, { ...detail, id }, { okIf: { sql: 'EXISTS (SELECT 1 FROM staff_messages WHERE id = ?)', args: [id] } }),
  ]);
  if (!put.meta.changes) return { error: 'staff-message-rate' };

  const key = await signingKey(env, subtle);
  const order = key ? await mintStaffMessageOrder({ s: row.id, mi: id }, key, { subtle, nowS }) : null;
  /** @type {any} */
  let said = null;
  const took = await pushLaw(env, (u, i) => globalThis.fetch(u, i), order, (s) => { said = s; });
  const count = (/** @type {unknown} */ n) => (took && Number.isSafeInteger(n) && /** @type {number} */ (n) >= 0 ? n : null);
  const m = { id, at: nowS, staff_id: me.id, staff_name: displayName(me), target: row.id, target_name: detail.name, text, pushed: took ? 1 : 0, sockets: count(said?.n), old: count(said?.old), ok_at: null };
  await db.prepare('UPDATE staff_messages SET pushed = ?2, sockets = ?3, old = ?4 WHERE id = ?1').bind(id, m.pushed, m.sockets, m.old).run();
  return { ok: true, message: shown(m) };
}

/** @param {{ db: any, nowS: number }} ctx @param {any} player */
export async function staffMessagesFor({ db, nowS }, player) {
  const r = await db.prepare('SELECT id, staff_name, text, at FROM staff_messages WHERE target = ?1 AND ok_at IS NULL AND at > ?2 ORDER BY rowid LIMIT ?3')
    .bind(player.id, nowS - STAFF_MESSAGE_SHOW_S, STAFF_MESSAGE_ASK_MAX + 1).all();
  const rows = r.results ?? [];
  return { ok: true, messages: rows.slice(0, STAFF_MESSAGE_ASK_MAX).map((m) => ({ id: m.id, from: m.staff_name, text: m.text, at: m.at })), more: rows.length > STAFF_MESSAGE_ASK_MAX };
}
/** @param {{ db: any, nowS: number }} ctx @param {any} player @param {any} body */
export async function staffMessageOk({ db, nowS }, player, body) {
  if (typeof body?.id !== 'string' || !ID_RE.test(body.id)) return { error: 'body' };
  const r = await db.prepare('UPDATE staff_messages SET ok_at = ?3 WHERE id = ?1 AND target = ?2 AND ok_at IS NULL').bind(body.id, player.id, nowS).run();
  return { ok: true, marked: r.meta.changes > 0 };
}
