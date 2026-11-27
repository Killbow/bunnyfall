// @ts-check
// Online, the portal is sent as `pg` (`portalWire`) in the opener's cell frame, which the relay does not read.
import { PORTAL_STONE, PORTAL_STONE_TEMPLATE, PORTAL_STONE_SHARDS, portalStones, isPortalStone, isWelkyndShard } from '../worldEvents/gateSpoils.js';
import { shardsHeld, spendShards, shardsText } from '../items/reforge.js';
import { addItem, findExistingStack } from '../items/inventory.js';
import { LOOT_STACK_MAX } from '../items/loot.js';
import { t } from '../ui/textManager.js';
import { eventGroundAt } from '../worldEvents/eventGround.js';
import { registerItemUseHandler } from '../items/itemTemplates.js';
import { POSE_BOUND, POSE_Y_BOUND } from '../net/wire.js';
import { MAX_MAP_PIXEL_X, MAX_MAP_PIXEL_Y } from '../formats/mapsTables.js';

export { PORTAL_STONE, PORTAL_STONE_TEMPLATE, PORTAL_STONE_SHARDS, isPortalStone };

export const PORTAL_OPEN_MS = 30000;
export const PORTAL_AHEAD = 2;
export const PORTAL_WALL_GAP = 0.6;
export const PORTAL_MIN_AHEAD = 1.2;
export const PORTAL_GROUND_PROBE = 3;
export const PORTAL_REACH = 0.9;
export const PORTAL_REACH_Y = 2;
export const PORTAL_SAY_REACH = 32;
export const PORTAL_PEER_REACH = 40;
export const PORTAL_REGROUND = 4;
export const PORTAL_STEP_GAP_MS = 250;
export const PORTAL_STEP_JUMP = 1.5;
const ID_RE = /^[A-Za-z0-9_-]{1,24}$/;

export const PORTAL_TEXT = Object.freeze({
  row: `Portal Stone (${PORTAL_STONE_SHARDS} shards)`,
  ask: (n, held) => t('portal.buy.ask', '{n, plural, one {Buy a Portal Stone} other {Buy # Portal Stones}} for {price, plural, one {# Welkynd Shard} other {# Welkynd Shards}}? You carry {held}.', { n, price: n * PORTAL_STONE_SHARDS, held }),
  bought: (n) => t('portal.buy.bought', '{n, plural, one {You buy a Portal Stone.} other {You buy # Portal Stones.}}', { n }),
  full: (max) => t('portal.buy.full', 'Your stack of Portal Stones holds no more than {max, number}.', { max }),
  shards: (held, kept = 0) => `A ${PORTAL_STONE.name} costs ${shardsText(PORTAL_STONE_SHARDS)}. You carry ${held}${kept > 0 ? ` you may spend (${kept} more are locked or worn)` : ''}.`,
  notHere: 'A portal can only be opened under the open sky.',
  noStreet: 'A portal cannot be opened on this street.',
  water: 'You cannot open a portal in the water.',
  aboard: 'You cannot open a portal aboard a boat.',
  standing: 'Your portal is still open.',
  noMap: 'You cannot see the map to choose a destination.',
  room: 'There is no room here for a portal.',
  ground: 'There is no ground here for a portal to stand on.',
  get event() { return t('portal.refused.event', 'A portal cannot open this close to an event\'s gate.'); },
  gone: `The ${PORTAL_STONE.name} is no longer where you kept it.`,
  opened: (name) => `A portal to ${name} tears open. Step through before it closes.`,
  gift: (n) => `You have been given ${n} ${PORTAL_STONE.name}s. Use one to open a portal to anywhere on the map.`,
});

export const PORTAL_HOLD_TEXT = Object.freeze({
  busy: 'You cannot use a portal right now.',
  duel: 'You cannot leave a duel through a portal.',
  siege: 'The wards of this battle hold every portal shut.',
  enemies: 'You cannot use a portal with enemies nearby.',
  journey: 'You cannot use a portal while you travel.',
});
export function portalHold({ dead = false, busy = false, duel = false, siege = false, enemies = false, journey = false } = {}) {
  if (dead || busy) return 'busy';
  if (duel) return 'duel';
  if (siege) return 'siege';
  if (enemies) return 'enemies';
  if (journey) return 'journey';
  return null;
}

export const portalStoneLines = () => [
  'Opens a portal to any place on the map.',
  `It stays open for ${Math.round(PORTAL_OPEN_MS / 1000)} seconds, and anyone can step through.`,
];

export const shardsKept = (items) => (Array.isArray(items) ? items : []).reduce((n, it) => n + (isWelkyndShard(it) ? (it.stackCount ?? 1) : 0), 0) - shardsHeld(items);
// `addItem` merges with no cap and itemLaw.js flags a stack past `LOOT_STACK_MAX`, so a sale never fills the stack
// past that limit.
export function portalStoneRoom(items) {
  const onto = Array.isArray(items) ? findExistingStack(items, portalStones(1)) : null;
  return LOOT_STACK_MAX - (onto ? (onto.stackCount ?? 1) : 0);
}
export function portalStoneMax(items) {
  return Math.max(0, Math.min(Math.floor(shardsHeld(items) / PORTAL_STONE_SHARDS), portalStoneRoom(items)));
}
// No carry-weight check applies, because a stone weighs less than the shards it costs, so the sale always lightens
// the pack.
export function portalStoneRefusal(items, n) {
  if (!Number.isInteger(n) || n < 1) return 'count';
  if (shardsHeld(items) < n * PORTAL_STONE_SHARDS) return 'shards';
  if (n > portalStoneRoom(items)) return 'stack';
  return null;
}
export function buyPortalStones(items, n) {
  if (!Array.isArray(items)) return { ok: false, reason: 'shards' };
  const why = portalStoneRefusal(items, n);
  if (why) return { ok: false, reason: why };
  if (!spendShards(items, n * PORTAL_STONE_SHARDS)) return { ok: false, reason: 'shards' };
  const item = portalStones(n);
  addItem(items, item);
  return { ok: true, item, n };
}
export const buyPortalStone = (items) => buyPortalStones(items, 1);
export function portalStoneRefusalText(items, reason) {
  return reason === 'stack' ? PORTAL_TEXT.full(LOOT_STACK_MAX) : PORTAL_TEXT.shards(shardsHeld(items), shardsKept(items));
}

export function spendPortalStone(item, list) {
  if (!isPortalStone(item) || !Array.isArray(list) || !list.includes(item)) return false;
  if ((item.stackCount ?? 1) > 1) item.stackCount -= 1;
  else list.splice(list.indexOf(item), 1);
  return true;
}
registerItemUseHandler(PORTAL_STONE_TEMPLATE, (item) => ({ kind: 'openPortal', item }));

/**
 * @param {number[]} feet
 * @param {number} yaw
 * @param {{ ground?: ((o: number[], d: number[], m: number) => number | null | undefined) | null, wall?: ((o: number[], d: number[], m: number) => number | null | undefined) | null }} [probes]
 */
export function portalPlace(feet, yaw, { ground = null, wall = null } = {}) {
  const dir = [Math.sin(yaw), 0, Math.cos(yaw)];
  const top = feet[1] + 1;
  let ahead = PORTAL_AHEAD;
  const hit = wall ? wall([feet[0], top, feet[2]], dir, PORTAL_AHEAD + PORTAL_WALL_GAP) : null;
  if (Number.isFinite(hit)) ahead = Math.min(ahead, /** @type {number} */ (hit) - PORTAL_WALL_GAP);
  if (ahead < PORTAL_MIN_AHEAD) return { refused: 'room' };
  const x = feet[0] + dir[0] * ahead, z = feet[2] + dir[2] * ahead;
  const d = ground ? ground([x, top, z], [0, -1, 0], PORTAL_GROUND_PROBE) : null;
  if (!Number.isFinite(d) || /** @type {number} */ (d) > PORTAL_GROUND_PROBE) return { refused: 'ground' };
  return { at: [x, top - /** @type {number} */ (d), z] };
}
/**
 * @param {number[]} feet
 * @param {number} yaw
 * @param {Parameters<typeof portalPlace>[2]} [probes]
 */
export function portalStonePlace(feet, yaw, probes = {}) {
  const p = portalPlace(feet, yaw, probes);
  return p.at && eventGroundAt(p.at) ? { refused: 'event' } : p;
}
export function insidePortal(feet, at) {
  if (!feet || !at) return false;
  return Math.hypot(feet[0] - at[0], feet[2] - at[2]) <= PORTAL_REACH && Math.abs(feet[1] - at[1]) <= PORTAL_REACH_Y;
}
export function portalStepIn(was, feet, at) {
  const inside = insidePortal(feet, at);
  return { inside, entered: inside && was === false };
}

const q2 = (v) => Math.round(v * 100) / 100;
// The destination name is never sent. Each receiver looks it up on its own map.
export const portalWire = (gate, nowMs = 0) => {
  const p = gate.native;
  return { i: gate.id, p: [q2(p[0]), q2(p[1]), q2(p[2])], d: [gate.dest.pixel.x, gate.dest.pixel.y], r: Math.max(0, Math.round(gate.until - nowMs)) };
};
export function validPortalRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  if (typeof r.i !== 'string' || !ID_RE.test(r.i)) return null;
  if (!Array.isArray(r.p) || r.p.length !== 3 || !r.p.every(Number.isFinite)) return null;
  if (Math.abs(r.p[0]) > POSE_BOUND || Math.abs(r.p[2]) > POSE_BOUND || Math.abs(r.p[1]) > POSE_Y_BOUND) return null;
  if (!Array.isArray(r.d) || r.d.length !== 2 || !r.d.every(Number.isInteger)) return null;
  if (r.d[0] < 0 || r.d[0] >= MAX_MAP_PIXEL_X || r.d[1] < 0 || r.d[1] >= MAX_MAP_PIXEL_Y) return null;
  if (!Number.isFinite(r.r) || r.r <= 0 || r.r > PORTAL_OPEN_MS) return null;
  return { i: r.i, p: [r.p[0], r.p[1], r.p[2]], d: [r.d[0], r.d[1]], r: r.r };
}
