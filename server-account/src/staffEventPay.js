// @ts-check
import { verifyStaffReceipt } from '../../src/net/staffEvent/staffEventReceipt.js';
import { validStaffEvent, STAFF_EVENT_EARN_KILLS } from '../../src/net/staffEvent/staffEventLaw.js';
import { eventStrikeStatement, eventStrikeLine, balanceOf } from './marks.js';

export const EVENT_PAY_ROUTES = Object.freeze(['/v1/event/claim']);

const hex = (/** @type {Uint8Array} */ b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/**
 * @param {any} ctx
 * @param {any} player
 * @param {any} env
 * @param {{ receipt?: unknown }} body
 * @param {CryptoKey|null} publicKey
 */
export async function claimEventPay(ctx, player, env, body, publicKey) {
  const { db, nowS, subtle, rand } = ctx;
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifyStaffReceipt(body?.receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.s !== player.id) return { error: 'not-yours' };
  if (!player.handle) return { paid: 0, why: 'guest' };
  const row = await db.prepare('SELECT ev FROM staff_events WHERE id = ?').bind(c.v).first();
  let ev = null;
  try { ev = row ? validStaffEvent(JSON.parse(row.ev)) : null; } catch { ev = null; }
  if (!ev) return { paid: 0, why: 'gone' };
  if (!ev.sv) return { paid: 0, why: 'none' };
  if ((c.h ?? 0) < Math.max(STAFF_EVENT_EARN_KILLS, ev.rk)) return { paid: 0, why: 'kills' };
  const nonce = hex(rand(new Uint8Array(8)));
  const mint = eventStrikeStatement(ctx, player, env, c.v, nonce, ev.sv);
  if (!mint) return { paid: 0, why: 'no-marks' };
  // The Marks line requires this claim's nonce on the event_pay row, so a replayed receipt pays nothing.
  const res = await db.batch([
    db.prepare('INSERT OR IGNORE INTO event_pay (event, account, nonce, silver, at) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING nonce').bind(c.v, player.id, nonce, ev.sv, nowS),
    mint,
  ]);
  const wrote = !!res[0]?.results?.length;
  const line = await eventStrikeLine(db, player, c.v);
  return { paid: line ? Number(line.amount) : 0, claimed: !wrote, balance: await balanceOf(db, player.id), ...(wrote && !line ? { why: 'full' } : {}) };
}
