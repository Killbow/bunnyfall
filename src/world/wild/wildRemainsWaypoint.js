// @ts-check
import { addWaypoint, removeWaypoint, setWaypointFollowed, waypointById } from '../../maps/mapWaypoints.js';
import { appStorage } from '../../platform/appStorage.js';

export const WILD_WP_KEY = 'dfjs.wild.remainsWp';
export const WILD_WP_NAME = 'My remains';
export const WILD_WP_COLOR = 'red';

let held = null;
/** @returns {{ id: string, until: number, r: string|null } | null} */
function readMark() {
  let raw = null;
  try { raw = appStorage()?.getItem(WILD_WP_KEY) ?? null; } catch { raw = null; }
  if (!raw) return held;
  try {
    const v = JSON.parse(raw);
    return typeof v?.id === 'string' && Number.isFinite(v?.until) ? { id: v.id, until: v.until, r: typeof v.r === 'string' ? v.r : null } : null;
  } catch { return null; }
}
function writeMark(v) {
  held = v ? { ...v } : null;
  try { if (v) appStorage()?.setItem(WILD_WP_KEY, JSON.stringify(v)); else appStorage()?.removeItem(WILD_WP_KEY); } catch { }
}

export function remainsMark() {
  const m = readMark();
  return m && waypointById(m.id) ? m : null;
}

export function clearRemainsMark() {
  const m = readMark();
  writeMark(null);
  return !!m && removeWaypoint(m.id, { quiet: true });
}

/**
 * @param {{ mx: number, my: number, until: number, r?: string|null }} o
 */
export function markRemains({ mx, my, until, r = null }) {
  clearRemainsMark();
  if (!Number.isFinite(until)) return null;
  const got = addWaypoint({ kind: 'personal', mx, my, name: WILD_WP_NAME, color: WILD_WP_COLOR });
  if (!got) return null;
  setWaypointFollowed(got.waypoint.id, true);
  writeMark({ id: got.waypoint.id, until, r });
  return got.waypoint.id;
}

export function remainsMarkTick(now) {
  const m = readMark();
  if (!m) return false;
  if (now >= m.until || !waypointById(m.id)) { clearRemainsMark(); return true; }
  return false;
}

export function remainsGone(r) {
  const m = readMark();
  return !!m && m.r != null && m.r === r ? clearRemainsMark() : false;
}

export const WILD_MINE_KEY = 'dfjs.wild.mine';

/**
 * @param {{ r: string, room: string, p: number[], until: number, dungeon?: string|null } | null} m
 * @param {string|null} [who]
 */
export function keepMine(m, who = null) {
  try {
    if (m && who) appStorage()?.setItem(WILD_MINE_KEY, JSON.stringify({ r: m.r, room: m.room, p: m.p, until: m.until, dungeon: m.dungeon ?? null, who }));
    else appStorage()?.removeItem(WILD_MINE_KEY);
  } catch { }
}

/**
 * @param {number} now
 * @param {string|null} who
 * @returns {{ r: string, room: string, p: number[], until: number, dungeon: string|null } | null}
 */
export function keptMine(now, who) {
  if (!who) return null;
  let v = null;
  try { v = JSON.parse(appStorage()?.getItem(WILD_MINE_KEY) ?? 'null'); } catch { v = null; }
  if (!v || v.who !== who || typeof v.r !== 'string' || typeof v.room !== 'string' || !Number.isFinite(v.until) || !(v.until > now)) return null;
  if (!Array.isArray(v.p) || v.p.length !== 3 || !v.p.every(Number.isFinite)) return null;
  return { r: v.r, room: v.room, p: [...v.p], until: v.until, dungeon: typeof v.dungeon === 'string' ? v.dungeon : null };
}

export function forgetMine(r) {
  let v = null;
  try { v = JSON.parse(appStorage()?.getItem(WILD_MINE_KEY) ?? 'null'); } catch { v = null; }
  if (v?.r === r) keepMine(null);
}
