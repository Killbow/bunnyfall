// @ts-check
import { displayName } from './accounts.js';
import { REALM_PLAYING_S } from './realm.js';
import { onlineNow } from './staffPlayers.js';
import { greedGive } from './staffCommands.js';
import { grantPsijicSeals } from './psijicSeals.js';

export const PANEL_ROUTES = Object.freeze(['/v1/staff/chars', '/v1/staff/greed', '/v1/staff/seals/grant']);
export const CHARS_LIST_MAX = 5000;

const num = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (/** @type {unknown} */ v, /** @type {number} */ n) => (typeof v === 'string' && v ? v.slice(0, n) : null);

/**
 * @param {any} ctx @param {any} env @param {string} path @param {any} body
 * @param {{ player: any, role: string }} who
 * @param {(act: string, target?: string|null, detail?: object|null, how?: object) => any} audit
 */
export async function staffPanelDesk(ctx, env, path, body, who, audit) {
  const { db, nowS } = ctx;
  if (path === '/v1/staff/chars') {
    const rows = (await db.prepare(`SELECT c.id, c.name, c.summary, c.level_seen, c.lease, c.lease_at, c.dead_at, c.held, c.updated_at,
        p.id AS pid, p.handle, p.guest_name, p.played_at, p.banned_until, p.muted_until, p.frozen_until
      FROM realm_characters c JOIN players p ON p.id = c.player ORDER BY c.updated_at DESC LIMIT ?1`).bind(CHARS_LIST_MAX).all())?.results ?? [];
    await audit('chars-read', null, null, { onceIn: 10 * 60 }).run();
    return {
      chars: rows.map((/** @type {any} */ c) => {
        let s = null; try { s = JSON.parse(c.summary ?? 'null'); } catch { }
        return {
          id: c.id, name: c.name, level: num(s?.level) ?? c.level_seen ?? null, className: str(s?.className, 40), race: str(s?.race, 24),
          playing: !!c.lease && nowS - c.lease_at < REALM_PLAYING_S, dead: c.dead_at != null, held: c.held ?? null, savedAt: c.updated_at,
          account: { id: c.pid, name: displayName(c), online: onlineNow(c, nowS) },
          banned: Number(c.banned_until) > nowS, muted: Number(c.muted_until) > nowS, frozen: Number(c.frozen_until) > nowS,
        };
      }),
    };
  }
  if (path === '/v1/staff/greed') {
    const r = await greedGive(ctx, who.player, env, { to: body.to, gold: body.gold ?? 0, nyx: body.nyx ?? 0 });
    await audit('greed', null, { to: String(body.to ?? '').slice(0, 64), gold: body.gold ?? 0, nyx: body.nyx ?? 0, ...(r.error ? { error: r.error } : {}) },
      r.error ? { outcome: r.error === 'staff-admin' ? 'denied' : 'failed' } : {}).run();
    return r;
  }
  if (path === '/v1/staff/seals/grant') {
    const r = await grantPsijicSeals(ctx, who.player, env, body);
    await audit('seals-grant', 'target' in r ? r.target : null, {
      to: String(body.target ?? body.to ?? '').slice(0, 64),
      delta: body.delta ?? 0,
      note: typeof body.note === 'string' ? body.note.slice(0, 120) : null,
      ...('error' in r ? { error: r.error } : {}),
    }, 'error' in r ? { outcome: r.error === 'staff-admin' ? 'denied' : 'failed' } : {}).run();
    return r;
  }
  return { error: 'not-found' };
}
