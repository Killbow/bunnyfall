// @ts-check
import { accountKind, displayName } from './accounts.js';
import { staffOf } from './staffCommands.js';
import {
  PSIJIC_SEAL_EPOCH,
  PSIJIC_SEAL_RID_RE,
  PSIJIC_SEAL_GRANT_MAX,
  epochSealsDue,
} from '../../src/systems/psijicSealsLaw.js';

export const SEALS_STATUS = Object.freeze({
  'seals-need-account': 403,
  'seals-rid': 400,
  'seals-short': 409,
  'seals-amount': 400,
  'seals-no-player': 404,
  'staff-admin': 403,
});

/**
 * @param {any} db
 * @param {unknown} raw
 */
async function resolveTargetAccount(db, raw) {
  const n = String(raw ?? '').trim();
  if (!n || n.length > 64) return null;
  const byId = await db.prepare('SELECT id, handle, guest_name FROM players WHERE id = ?').bind(n).first();
  if (byId) return { id: String(byId.id), name: displayName(byId) };
  const byHandle = await db.prepare('SELECT id, handle FROM players WHERE lower(handle) = lower(?)').bind(n).first();
  if (byHandle) return { id: String(byHandle.id), name: String(byHandle.handle) };
  const byChar = await db.prepare('SELECT player, name FROM realm_characters WHERE lower(name) = lower(?) ORDER BY updated_at DESC LIMIT 1').bind(n).first();
  if (byChar) return { id: String(byChar.player), name: String(byChar.name) };
  return null;
}

/**
 * @param {{ db: any, nowS: number }} ctx
 * @param {string} accountId
 * @param {number} [epoch]
 */
export async function ensureSealsAccountRow({ db, nowS }, accountId, epoch = PSIJIC_SEAL_EPOCH) {
  let row = await db.prepare('SELECT balance, epoch_granted FROM psijic_seals WHERE account_id = ?').bind(accountId).first();
  const due = epochSealsDue(Number(row?.epoch_granted ?? 0), epoch);
  if (due > 0) {
    const epochRid = `epoch:${accountId}:${epoch}`;
    await db.batch([
      db.prepare(`INSERT INTO psijic_seals (account_id, balance, epoch_granted, updated_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(account_id) DO UPDATE SET
          balance = psijic_seals.balance + (CASE WHEN psijic_seals.epoch_granted < ?3 THEN (?3 - psijic_seals.epoch_granted) ELSE 0 END),
          epoch_granted = MAX(psijic_seals.epoch_granted, ?3),
          updated_at = ?4`).bind(accountId, due, epoch, nowS),
      db.prepare(`INSERT OR IGNORE INTO psijic_seal_ledger (account_id, delta, reason, rid, actor_id, note, created_at)
        VALUES (?1, ?2, 'epoch-grant', ?3, NULL, ?4, ?5)`).bind(accountId, due, epochRid, `epoch ${epoch}`, nowS),
    ]);
    row = await db.prepare('SELECT balance, epoch_granted FROM psijic_seals WHERE account_id = ?').bind(accountId).first();
  }
  return {
    ok: true,
    balance: Math.max(0, Number(row?.balance ?? 0)),
    epoch: Number(row?.epoch_granted ?? epoch),
  };
}

/**
 * @param {{ db: any, nowS: number }} ctx
 * @param {{ id?: string, handle?: unknown } | null} player
 */
export async function sealsBalanceOf({ db, nowS }, player) {
  const accountId = typeof player?.id === 'string' && player.id ? player.id : null;
  if (!accountId || accountKind(player) !== 'linked') return { error: 'seals-need-account' };
  return ensureSealsAccountRow({ db, nowS }, accountId);
}

/**
 * @param {{ db: any, nowS: number }} ctx
 * @param {{ id?: string, handle?: unknown } | null} player
 * @param {{ rid?: unknown, character?: unknown }} [body]
 */
export async function spendPsijicSeal({ db, nowS }, player, body = {}) {
  const accountId = typeof player?.id === 'string' && player.id ? player.id : null;
  if (!accountId || accountKind(player) !== 'linked') return { error: 'seals-need-account' };
  const rid = typeof body?.rid === 'string' ? body.rid : '';
  if (!PSIJIC_SEAL_RID_RE.test(rid)) return { error: 'seals-rid' };
  const ledgerRid = `spend:${accountId}:${rid}`;
  const prior = await db.prepare('SELECT id FROM psijic_seal_ledger WHERE rid = ?').bind(ledgerRid).first();
  const ensured = await ensureSealsAccountRow({ db, nowS }, accountId);
  if (prior) return { ok: true, repeat: true, balance: ensured.balance, epoch: ensured.epoch };

  const note = typeof body?.character === 'string' && body.character ? body.character.slice(0, 64) : null;
  let spent = false;
  try {
    const [ins, upd] = await db.batch([
      db.prepare(`INSERT INTO psijic_seal_ledger (account_id, delta, reason, rid, actor_id, note, created_at)
        SELECT ?1, -1, 'character-respec', ?2, ?1, ?3, ?4
        WHERE EXISTS (SELECT 1 FROM psijic_seals WHERE account_id = ?1 AND balance >= 1)`).bind(accountId, ledgerRid, note, nowS),
      db.prepare(`UPDATE psijic_seals
        SET balance = balance - 1, updated_at = ?3
        WHERE account_id = ?1 AND balance >= 1
          AND EXISTS (SELECT 1 FROM psijic_seal_ledger WHERE rid = ?2 AND created_at = ?3)`).bind(accountId, ledgerRid, nowS),
    ]);
    spent = Number(ins?.meta?.changes ?? 0) > 0 && Number(upd?.meta?.changes ?? 0) > 0;
  } catch (e) {
    if (!/UNIQUE/i.test(String(/** @type {any} */ (e)?.message ?? e))) throw e;
    const after = await ensureSealsAccountRow({ db, nowS }, accountId);
    return { ok: true, repeat: true, balance: after.balance, epoch: after.epoch };
  }
  const after = await db.prepare('SELECT balance FROM psijic_seals WHERE account_id = ?').bind(accountId).first();
  const balance = Math.max(0, Number(after?.balance ?? 0));
  if (!spent) return { error: 'seals-short', balance };
  return { ok: true, balance, epoch: PSIJIC_SEAL_EPOCH };
}

/**
 * @param {{ db: any, nowS: number }} ctx
 * @param {any} staffPlayer
 * @param {any} env
 * @param {{ target?: unknown, to?: unknown, delta?: unknown, note?: unknown, click?: unknown }} [body]
 */
export async function grantPsijicSeals({ db, nowS }, staffPlayer, env, body = {}) {
  if (!staffOf(staffPlayer, env).admin) return { error: 'staff-admin' };
  const delta = Number.isSafeInteger(body?.delta) ? /** @type {number} */ (body.delta) : 0;
  if (delta === 0 || Math.abs(delta) > PSIJIC_SEAL_GRANT_MAX) return { error: 'seals-amount' };
  if (body?.click != null && body.click !== '' && (typeof body.click !== 'string' || !PSIJIC_SEAL_RID_RE.test(body.click))) {
    return { error: 'seals-rid' };
  }
  const rawWho = body?.target ?? body?.to;
  const who = String(rawWho ?? '').trim().toLowerCase() === 'me'
    ? { id: String(staffPlayer.id), name: displayName(staffPlayer) }
    : await resolveTargetAccount(db, rawWho);
  if (!who) return { error: 'seals-no-player' };

  await ensureSealsAccountRow({ db, nowS }, who.id);
  const click = typeof body?.click === 'string' && body.click ? `staff:${body.click}` : null;
  if (click) {
    const seen = await db.prepare('SELECT id FROM psijic_seal_ledger WHERE rid = ?').bind(click).first();
    if (seen) {
      const cur = await db.prepare('SELECT balance FROM psijic_seals WHERE account_id = ?').bind(who.id).first();
      return { ok: true, repeat: true, to: who.name, target: who.id, delta, balance: Math.max(0, Number(cur?.balance ?? 0)) };
    }
  }
  const cleanNote = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 160) : null;
  try {
    await db.batch([
      db.prepare(`INSERT INTO psijic_seals (account_id, balance, epoch_granted, updated_at)
        VALUES (?1, MAX(0, ?2), 0, ?3)
        ON CONFLICT(account_id) DO UPDATE SET balance = MAX(0, psijic_seals.balance + ?2), updated_at = ?3`).bind(who.id, delta, nowS),
      db.prepare(`INSERT INTO psijic_seal_ledger (account_id, delta, reason, rid, actor_id, note, created_at)
        VALUES (?1, ?2, 'staff-grant', ?3, ?4, ?5, ?6)`).bind(who.id, delta, click, String(staffPlayer.id), cleanNote, nowS),
    ]);
  } catch (e) {
    if (!/UNIQUE/i.test(String(/** @type {any} */ (e)?.message ?? e))) throw e;
    const cur = await db.prepare('SELECT balance FROM psijic_seals WHERE account_id = ?').bind(who.id).first();
    return { ok: true, repeat: true, to: who.name, target: who.id, delta, balance: Math.max(0, Number(cur?.balance ?? 0)) };
  }
  const row = await db.prepare('SELECT balance FROM psijic_seals WHERE account_id = ?').bind(who.id).first();
  return {
    ok: true,
    to: who.name,
    target: who.id,
    delta,
    balance: Math.max(0, Number(row?.balance ?? 0)),
    epoch: PSIJIC_SEAL_EPOCH,
  };
}
