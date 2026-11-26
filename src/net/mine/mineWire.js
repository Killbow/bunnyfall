// @ts-check
// BUNNYFALL (2026-11-25, caverns): THE `mn` FRAME ON THE WIRE - a word on the shared mine, in the mine's own dungeon room
// (`dungeon:m<mapId>`, its size tag allowed), judged by the relay's part (server/src/world/mine.js) with the mine's brain
// (net/mine/mineBrain.js). Client to relay: `{ t: 'mn', k: 'hi', r }` (I stand in this mine, at reset r), `{ k: 'strike',
// s, c }`, `{ k: 'prop', s, c, w, wood }`. Relay to clients: `{ t: 'mn', k: 'st', st, ev? }` (the mine as it stands, the
// events that moved it) and `{ k: 'no', e }` (an act refused, to its sender). Pure; it imports no law, so the bounds the
// brain and the layout keep are pinned equal here (tools/mineWire.test.mjs checks them).

/** The salt a mine's map id carries in its high 12 bits (net/mine/mineSites.js MINE_SALT - pinned equal by the test). */
export const MINE_WIRE_SALT = 7;
/** The woods a plank can be (net/mine/mineBrain.js MINE_WOOD_STRENGTH's keys). */
export const MINE_WIRE_WOODS = Object.freeze(['pine', 'oak', 'cherry', 'teak', 'mahogany', 'ironwood', 'ghostwood']);
/** The most sections, chambers a section and wall slots a chamber (the layout's 6, 4 and 10, with room). */
export const MINE_WIRE_MAX = Object.freeze({ s: 8, c: 6, w: 12, reset: 99999, props: 400 });
/** The relay version that keeps mines (net/wire.js RELAY_VERSION's number at their landing), and whether a relay's does. */
export const MINE_RELAY_MIN = 278;
export const relaySupportsMine = (/** @type {any} */ v) => { const m = /^world(\d+)$/.exec(typeof v === 'string' ? v : ''); return !!m && Number(m[1]) >= MINE_RELAY_MIN; };
/** How many mine words a socket may say a second, and its burst. */
export const MINE_HZ = 6;

const int = (/** @type {any} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Number.isSafeInteger(v) && v >= lo && v <= hi;
const ROOM_RE = /^dungeon:m([1-9]\d{0,9})(?:\.[ms])?$/;

/**
 * The mine a room key names, or null: its pixel and its pixel id (`py * 1000 + px`), read back from its map id.
 * @param {string} key
 * @returns {{ px: number, py: number, id: number } | null}
 */
export function mineRoomOf(key) {
  const m = ROOM_RE.exec(String(key ?? ''));
  if (!m) return null;
  const mapId = Number(m[1]);
  if (!Number.isSafeInteger(mapId) || mapId > 0xffffffff || (mapId >>> 20) !== MINE_WIRE_SALT) return null;
  const id = mapId & 0xfffff, px = id % 1000, py = Math.floor(id / 1000);
  return { px, py, id };
}

/**
 * A client's `mn` word, projected to its fields, or null for one out of shape.
 * @param {any} m
 */
export function validMineIn(m) {
  if (!m || typeof m !== 'object' || m.t !== 'mn') return null;
  if (m.k === 'hi') return int(m.r, 0, MINE_WIRE_MAX.reset) ? { k: 'hi', r: m.r } : null;
  if (!int(m.s, 0, MINE_WIRE_MAX.s - 1) || !int(m.c, 0, MINE_WIRE_MAX.c - 1)) return null;
  if (m.k === 'strike') return { k: 'strike', s: m.s, c: m.c };
  if (m.k === 'prop') return int(m.w, 0, MINE_WIRE_MAX.w - 1) && MINE_WIRE_WOODS.includes(m.wood) ? { k: 'prop', s: m.s, c: m.c, w: m.w, wood: m.wood } : null;
  return null;
}

const nums = (/** @type {any} */ a, /** @type {number} */ max, /** @type {(v: any) => boolean} */ ok) => Array.isArray(a) && a.length >= 1 && a.length <= max && a.every(ok);

/**
 * A relay's `mn` word, checked, or null.
 * @param {any} m
 */
export function validMineOut(m) {
  if (!m || typeof m !== 'object' || m.t !== 'mn') return null;
  if (m.k === 'no') return typeof m.e === 'string' && m.e.length <= 16 ? m : null;
  if (m.k !== 'st') return null;
  const st = m.st;
  if (!st || typeof st !== 'object' || !int(st.reset, 0, MINE_WIRE_MAX.reset) || !(st.sealedUntil >= 0) || !(st.born >= 0)) return null;
  const n = Array.isArray(st.stab) ? st.stab.length : 0;
  const level = (/** @type {any} */ v) => typeof v === 'number' && v >= 0 && v <= 1000;
  if (!nums(st.stab, MINE_WIRE_MAX.s, level) || !nums(st.cap, MINE_WIRE_MAX.s, level) || st.cap.length !== n) return null;
  if (!Array.isArray(st.props) || st.props.length > MINE_WIRE_MAX.props) return null;
  if (!st.props.every((/** @type {any} */ p) => p && int(p.s, 0, n - 1) && int(p.c, 0, MINE_WIRE_MAX.c - 1) && int(p.w, 0, MINE_WIRE_MAX.w - 1) && MINE_WIRE_WOODS.includes(p.wood))) return null;
  if (m.ev !== undefined && !(Array.isArray(m.ev) && m.ev.length <= 8 && m.ev.every((/** @type {any} */ e) => typeof e === 'string' && e.length <= 16))) return null;
  return m;
}
