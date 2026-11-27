// @ts-check
// Mints the next room token at a door so partied players stay visible across the transition.
import { isCellRoom } from '../net/wire.js';
import { closestDoorTo } from './enterExit.js';

export const EXIT_NEAR_M = 16;
export const EXIT_ARM_M = 32;
export const DOOR_SOON_MS = 2_000;
export const EXIT_WALK_MS = 8_000;
export const DOOR_PENDING_MS = 30_000;

/**
 * @param {object} io
 * @param {() => any} io.minter
 * @param {() => any} io.session
 * @param {() => any} [io.modes]
 * @param {() => any} [io.player]
 * @param {() => number} [io.now]
 */
export function createDoorToken({ minter, session, modes = () => null, player = () => null, now = () => Date.now() }) {
  let back = /** @type {string|null} */ (null);
  let armed = false;
  let walked = false;
  let pending = /** @type {{ from: string, room: string|null, until: number } | null} */ (null);
  const read = (/** @type {() => any} */ f) => { try { return f() ?? null; } catch { return null; } };
  const live = () => {
    const s = read(session);
    return s && s.url && s.room && !s.terminal && !s.superseded ? s : null;
  };
  const ahead = (/** @type {string|null} */ room, /** @type {number} */ withinMs) => {
    if (!live()) return false;
    const m = read(minter);
    return typeof m?.ahead === 'function' ? !!m.ahead(room, withinMs) : false;
  };
  const change = (/** @type {string|null} */ room) => {
    const s = live();
    pending = s ? { from: s.room, room, until: now() + DOOR_PENDING_MS } : null;
    return ahead(room, DOOR_SOON_MS);
  };
  const exitDistance = () => {
    const md = read(modes), pos = read(player)?.pos;
    if (!md || !pos) return Infinity;
    const doors = md.mode === 'dungeon' ? md.dungeonCtx?.exitDoors : md.mode === 'interior' ? md.interiorCtx?.doors : null;
    if (!doors?.length) return Infinity;
    const near = closestDoorTo(pos, doors);
    return near ? Math.hypot(near.pos[0] - pos[0], near.pos[1] - pos[1], near.pos[2] - pos[2]) : Infinity;
  };
  return {
    entering() {
      const s = live();
      if (!s) return false;
      if (isCellRoom(s.room)) back = s.room;
      armed = false; walked = false;
      return change(null);
    },
    leaving() {
      armed = false;
      return change(back);
    },
    jumping() {
      back = null;
      armed = false; walked = false;
      return change(null);
    },
    frame() {
      if (pending) {
        const s = read(session);
        if (now() > pending.until || (s?.room && s.room !== pending.from)) pending = null;
        else return ahead(pending.room, DOOR_SOON_MS);
      }
      const d = exitDistance();
      if (!(d < Infinity)) { armed = false; return false; }
      if (d > EXIT_ARM_M) { armed = !walked; return false; }
      if (!armed || d > EXIT_NEAR_M) return false;
      armed = false;
      walked = ahead(back, EXIT_WALK_MS);
      return walked;
    },
    get back() { return back; },
  };
}
