// @ts-check
import { SHIP_CLASSES } from './navalShips.js';
import { seededRng } from './seaRaiders.js';
import { chaseYields } from '../../travel/travelBands.js';

export const RAIDER_STAND_M = 1200;
export const RAIDER_DROP_M = 1700;
// A raider steers for where its seeded course is this many seconds on, so the map's sail matches the ship at sea.
export const RAIDER_LEAD_S = 45;
export const RAIDER_SHIPS_MAX = 1;
// A separate salt keeps the class draw off the course's own random stream.
const CLASS_SALT = 0x5ea1c1a5;

export function raiderClassOf(seed, level) {
  const pool = SHIP_CLASSES.filter((c) => c.faction === 'pirate' && !c.flagship && c.minLevel <= Math.max(1, level | 0));
  const list = pool.length ? pool : SHIP_CLASSES.filter((c) => c.faction === 'pirate' && !c.flagship).slice(0, 1);
  const total = list.reduce((s, c) => s + c.weight, 0);
  let x = seededRng((seed ^ CLASS_SALT) >>> 0)() * total;
  for (const c of list) { if ((x -= c.weight) < 0) return c; }
  return list[list.length - 1];
}

const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/**
 * @param {{ raiders: { id: string, seed: number, pos: number[] }[], me: number[], myId: string,
 *   stood: Map<string, { pos: number[], engaged: boolean, boarding?: boolean }>, peers: Map<number, string>, spent: Set<string>,
 *   held?: Map<string, string> }} q
 * @returns {{ stand: string[], drop: string[] }}
 */
export function raiderPlan({ raiders, me, myId, stood, peers, spent, held = new Map() }) {
  const byId = new Map(raiders.map((r) => [r.id, r]));
  const drop = [];
  for (const [id, s] of stood) {
    const owner = held.get(id);
    // A peer's hold on a raider wins under the shared chase rule, except while I am boarding her.
    if (owner !== undefined && !s.boarding && chaseYields(myId, owner)) { drop.push(id); continue; }
    // Otherwise a raider leaves only out of sight, so a ship never vanishes in view.
    if (!s.engaged && flat(s.pos, me) > RAIDER_DROP_M) drop.push(id);
  }
  const keep = [...stood.keys()].filter((id) => !drop.includes(id));
  const candidates = raiders
    // A raider already in my sea as another player's copy is never spawned a second time.
    .filter((r) => !stood.has(r.id) && !spent.has(r.id) && !held.has(r.id) && !peers.has(r.seed) && flat(r.pos, me) <= RAIDER_STAND_M)
    .sort((a, b) => flat(a.pos, me) - flat(b.pos, me));
  const stand = candidates.slice(0, Math.max(0, RAIDER_SHIPS_MAX - keep.length)).map((r) => r.id);
  return { stand, drop };
}
