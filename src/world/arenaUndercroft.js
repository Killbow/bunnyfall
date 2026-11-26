// @ts-check

import { MOBILE_TYPES as M } from '../characters/mobileTypes.js';

export const UNDERCROFT_FACTION = 518;
export const PIT_RING_R = 6;
// Editor marker records in archive 199: 10 is the start, 15 a random enemy, and 16 a fixed one.
const EDITOR = 199, START = 10, RANDOM = 15, FIXED = 16;

export const PIT_MASTER = Object.freeze({ role: 'pitMaster', archive: 357, record: 3 });
export const HALL_KEEPER = Object.freeze({ role: 'hallKeeper', archive: 183, record: 12 });
export const UNDERCROFT_PEOPLE = Object.freeze([
  Object.freeze({ role: 'fighter', archive: 357, record: 10 }),
  Object.freeze({ role: 'armourer', archive: 334, record: 14 }),
  Object.freeze({ role: 'fighter', archive: 357, record: 11 }),
  Object.freeze({ role: 'keeper', archive: 184, record: 16 }),
  Object.freeze({ role: 'fighter', archive: 357, record: 7 }),
  Object.freeze({ role: 'fighter', archive: 334, record: 11 }),
  Object.freeze({ role: 'keeper', archive: 334, record: 7 }),
  Object.freeze({ role: 'keeper', archive: 334, record: 17 }),
  Object.freeze({ role: 'keeper', archive: 334, record: 18, female: true }),
]);
export const UNDERCROFT_BEASTS = Object.freeze([M.GrizzlyBear, M.SabertoothTiger, M.GiantScorpion, M.GrizzlyBear]);
export const PIT_DUMMY = Object.freeze([211, 20]);
export const HALL_TROPHIES = Object.freeze([Object.freeze([200, 1]), Object.freeze([207, 8]), Object.freeze([200, 5]), Object.freeze([207, 12]), Object.freeze([207, 2])]);
export const BEAST_CHAIN = Object.freeze([211, 5]);
export const HALL_BRAZIER = Object.freeze([210, 19]);
export const HALL_LIGHT_M = 7;
export const UNDERCROFT_DEEP_M = 51.2;
// Flat positions start at `SEED` so they never match an RDB object's position, which seeds StaticNPC names and keys
// actions.
const SEED = 0x55430000;

const isEditor = (m) => (m.archive ?? EDITOR) === EDITOR;

export function undercroftPopulation(blocks) {
  /** @type {{ x: number, y: number, z: number, block: number, k: number }[]} */
  const marks = [];
  let start = null;
  blocks.forEach((b, block) => {
    for (const m of b.layout?.markers ?? []) {
      if (!isEditor(m)) continue;
      const at = { x: m.x + b.originX, y: m.y, z: m.z + b.originZ, block, k: marks.length };
      if (m.record === START && !start) start = at;
      else if (m.record === RANDOM || m.record === FIXED) marks.push(at);
    }
  });
  const out = { flats: [], beasts: [], lights: [], pit: null, pitAxis: null, hall: null, quiet: 0, deep: [], near: [] };
  if (!marks.length) return out;
  const s = start ?? marks[0];
  const d = (m) => Math.hypot(m.x - s.x, m.y - s.y, m.z - s.z);
  const order = marks.slice().sort((a, b) => d(a) - d(b) || a.k - b.k);
  let seed = 0;
  const flat = (m, archive, record, { side = 0, along = 0, person = null } = {}) => {
    const hx = s.x - m.x, hz = s.z - m.z, hl = Math.hypot(hx, hz) || 1;
    const ux = hx / hl, uz = hz / hl, px = -uz, pz = ux;
    const b = blocks[m.block];
    const x = m.x + px * side + ux * along - b.originX, z = m.z + pz * side + uz * along - b.originZ;
    const position = SEED + seed++;
    out.flats.push({
      block: m.block, archive, record, x, y: m.y, z, action: null, position, flatPosition: position,
      npc: !!person, role: person?.role ?? null, factionID: person ? UNDERCROFT_FACTION : 0, flags: person?.female ? 32 : 0,
      rawX: Math.round(x / 0.025), rawY: Math.round(-m.y / 0.025), rawZ: Math.round(z / 0.025),
    });
  };
  let i = 0;
  const pit = order[i++];
  flat(pit, PIT_MASTER.archive, PIT_MASTER.record, { person: PIT_MASTER });
  flat(pit, PIT_DUMMY[0], PIT_DUMMY[1], { side: 1.8 });
  flat(pit, HALL_BRAZIER[0], HALL_BRAZIER[1], { side: -2.2 });
  out.pit = [pit.x, pit.y, pit.z];
  { const hx = s.x - pit.x, hz = s.z - pit.z, hl = Math.hypot(hx, hz) || 1; out.pitAxis = [hx / hl, hz / hl]; }
  const lit = (m, range = HALL_LIGHT_M) => out.lights.push({ x: m.x, y: m.y + 1.2, z: m.z, range });
  lit(pit);
  if (i < order.length) {
    const hall = order[i++];
    flat(hall, HALL_KEEPER.archive, HALL_KEEPER.record, { person: HALL_KEEPER });
    HALL_TROPHIES.forEach(([a, r], t) => flat(hall, a, r, { side: (t % 2 ? -1 : 1) * (1.1 + 0.45 * Math.floor(t / 2)), along: -0.3 }));
    flat(hall, HALL_BRAZIER[0], HALL_BRAZIER[1], { along: 1.6 });
    out.hall = [hall.x, hall.y, hall.z];
    lit(hall);
  }
  for (const p of UNDERCROFT_PEOPLE) { if (i >= order.length) break; const m = order[i++]; flat(m, p.archive, p.record, { person: p }); lit(m, HALL_LIGHT_M * 0.7); }
  for (const mobileType of UNDERCROFT_BEASTS) {
    if (i >= order.length) break;
    const m = order[i++];
    out.beasts.push({ x: m.x, y: m.y, z: m.z, mobileType });
    flat(m, BEAST_CHAIN[0], BEAST_CHAIN[1], { side: 1.2 });
    flat(m, BEAST_CHAIN[0], BEAST_CHAIN[1], { side: -1.2 });
  }
  out.near = [[s.x, s.y, s.z], ...order.slice(0, i).map((m) => [m.x, m.y, m.z])];
  for (const m of order.slice(i)) if (!undercroftHallNear(out, [m.x, m.y, m.z])) out.deep.push({ x: m.x, y: m.y, z: m.z });
  out.quiet = order.length - i - out.deep.length;
  return out;
}

export function deepFoesOf(layoutEnemies, deep) {
  const at = new Set((deep ?? []).map((m) => `${m.x}|${m.y}|${m.z}`));
  return (layoutEnemies ?? []).filter((e) => at.has(`${e.x}|${e.y}|${e.z}`));
}

export function undercroftHallNear(hall, feet) {
  if (!hall || !feet) return false;
  for (const p of hall.near ?? []) if (Math.hypot(feet[0] - p[0], feet[1] - p[1], feet[2] - p[2]) < UNDERCROFT_DEEP_M) return true;
  return false;
}

export function chainTag(n, say = null) {
  return { id: `undercroft:chain:${n}`, side: 0, out: false, hold: true, chained: true, hooks: { hurt: () => {}, floor: () => {}, intrude: () => say?.() } };
}
