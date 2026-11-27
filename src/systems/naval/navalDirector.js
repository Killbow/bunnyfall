// @ts-check
// Spawn seeds are hash32(seedBase, count), so the same waters on the same day send the same ships.

import { hash32 } from '../../world/spawnedDungeons.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { classFor, HULL, SHIP_CLASSES } from './navalShips.js';
import { HULL_VARIANT_COUNTS } from './comeSailAwayBoat.js';
import { classPower, odds, WARY_ODDS } from './navalAI.js';
import { etherFactionWeights, LEGEND_CHANCE, LEGEND_SALT } from './etherShips.js';

export const DENSITY = Object.freeze({ off: 0, few: 1, some: 2, many: 4 });
export const DENSITY_KEYS = Object.freeze(Object.keys(DENSITY));
export const SPAWN_RING = Object.freeze([650, 1000]);
export const SPAWN_CLEAR = 450;
export const DESPAWN_BEYOND = 1900;
export const SPAWN_EVERY = Object.freeze([60, 140]);
export const FIRST_ROLL_S = 30;
export const SHIP_SPAWN_CHANCE = 0.8;
export const FACTION_WEIGHTS = Object.freeze({ pirate: 30, merchant: 45, navy: 25 });
export const PORT_PIXELS = 3;
export const PORT_WEIGHTS = Object.freeze({ merchant: 30, navy: 15 });
export const PORT_PIRATE_K = 0.5;
export const RELIEF_WAIT_S = 20;
export const RELIEF_CHANCE = 0.7;
export const HUNTER_AT = 50;
export const HUNTER_WEIGHT = 45;
export const SPAWN_TRIES = 10;
// A pair draws on its own salted stream, so a roll that launches one ship draws exactly what it would alone.
export const ENCOUNTER_CHANCE = 0.3;
export const ENCOUNTERS = Object.freeze({ plunder: 60, patrol: 40 });
export const ENCOUNTER_GAP = Object.freeze([140, 220]);
export const ENCOUNTER_SALT = 0x3ea7f1a5;
export const encounterRng = (seed) => mulberry32(((seed >>> 0) ^ ENCOUNTER_SALT) >>> 0);
export const RELIEF_SALT = 0x2e11ef;

/** @param {'plunder'|'patrol'} kind @param {number} level @param {() => number} r */
export function encounterClasses(kind, level, r) {
  const lv = Math.max(1, level | 0);
  const pirates = SHIP_CLASSES.filter((c) => c.faction === 'pirate' && !c.flagship && c.minLevel <= lv);
  const pick = (list) => {
    const total = list.reduce((sum, c) => sum + c.weight, 0);
    let x = r() * total;
    for (const c of list) { if ((x -= c.weight) < 0) return c; }
    return list[list.length - 1] ?? null;
  };
  if (kind === 'patrol') {
    const navy = classFor('navy', lv, r());
    const pirate = pirates.length ? pick(pirates) : null;
    return navy && pirate ? { hunter: navy, quarry: pirate } : null;
  }
  const pirate = pirates.length ? pick(pirates) : null;
  if (!pirate) return null;
  const prey = SHIP_CLASSES.filter((c) => c.faction === 'merchant' && c.minLevel <= lv && odds(classPower(pirate), classPower(c)) >= WARY_ODDS);
  const merchant = prey.length ? pick(prey) : null;
  return merchant ? { hunter: pirate, quarry: merchant } : null;
}

export function weightedPick(weights, r) {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0);
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let x = Math.max(0, Math.min(0.999999, r)) * total;
  for (const k of keys) { if ((x -= weights[k]) < 0) return k; }
  return keys[keys.length - 1] ?? null;
}

export function factionWeights({ nearPort = false, notoriety = 0, deep = false } = {}) {
  const w = { ...FACTION_WEIGHTS };
  if (nearPort) { w.merchant += PORT_WEIGHTS.merchant; w.navy += PORT_WEIGHTS.navy; w.pirate *= PORT_PIRATE_K; }
  else if (deep) { w.pirate *= DEEP_PIRATE_K; w.merchant *= DEEP_TRADE_K; w.navy *= DEEP_TRADE_K; }
  if (notoriety >= HUNTER_AT) w.navy += HUNTER_WEIGHT;
  return w;
}

/** @param {any[]} ships @param {(id: any) => any} entryOf */
export function directorShips(ships, entryOf) {
  for (const x of ships) { const f = entryOf(x.id); if (f?.ship.cls.fisher) { x.berthed = true; x.engaged ||= !!f.fisher && !x.theirs; } }
  const chased = new Set(ships.filter((y) => y.engaged && !y.theirs && !entryOf(y.id)?.ship.cls.fisher).map((y) => entryOf(y.id)?.ship.target));
  for (const x of ships) if (!x.theirs && chased.has(x.id)) x.engaged = true;
  return ships;
}

// Traffic waits count real seconds when the host hands its clock, so a scaled world clock never speeds up traffic.
/** @param {number} dt @param {number | undefined} real @param {number | null} lastReal */
export function trafficSeconds(dt, real, lastReal) {
  if (!Number.isFinite(real)) return Math.max(0, Number(dt) || 0);
  return Number.isFinite(lastReal) ? Math.max(0, /** @type {number} */ (real) - /** @type {number} */ (lastReal)) : 0;
}

export function createNavalDirector({ random = Math.random } = {}) {
  let wait = FIRST_ROLL_S;
  let count = 0;
  let lastReal = null;
  function encounterSpawn(seed, ctx, nearest) {
    const r = encounterRng(seed);
    if (!(r() < ENCOUNTER_CHANCE)) return null;
    const drawn = /** @type {'plunder'|'patrol'} */ (weightedPick(ENCOUNTERS, r()));
    const kind = ctx.ether ? 'plunder' : drawn;
    const deep = !ctx.ether && !ctx.nearPort && !!ctx.deep;
    const pair = encounterClasses(kind, (ctx.level ?? 1) + (deep ? DEEP_LEVEL : 0) + (ctx.ether?.band?.level ?? 0), r);
    if (!pair) return null;
    for (let i = 0; i < SPAWN_TRIES; i++) {
      const a = r() * Math.PI * 2;
      const d = SPAWN_RING[0] + r() * (SPAWN_RING[1] - SPAWN_RING[0]);
      const mid = [ctx.player[0] + Math.sin(a) * d, ctx.seaY ?? ctx.player[1], ctx.player[2] + Math.cos(a) * d];
      const toPlayer = Math.atan2(ctx.player[0] - mid[0], ctx.player[2] - mid[2]);
      const yaw = toPlayer + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.9);
      const gap = ENCOUNTER_GAP[0] + r() * (ENCOUNTER_GAP[1] - ENCOUNTER_GAP[0]);
      const along = (k) => [mid[0] + Math.sin(yaw) * gap * k, mid[1], mid[2] + Math.cos(yaw) * gap * k];
      const hunterPos = along(-0.5), quarryPos = along(0.5);
      if (nearest(hunterPos) < SPAWN_CLEAR || nearest(quarryPos) < SPAWN_CLEAR) continue;
      if (!ctx.isOpenWater(hunterPos[0], hunterPos[2], pair.hunter.hull) || !ctx.isOpenWater(quarryPos[0], quarryPos[2], pair.quarry.hull)) continue;
      const variantOf = (cls) => { const n = HULL_VARIANT_COUNTS[cls.hull] ?? 0; return cls.hull === HULL.LargeBoat && n > 0 ? Math.floor(r() * n) : 0; };
      const etherOf = ctx.ether ? { ether: ctx.ether.band.id } : deep ? { deep: true } : {};
      const company = { seed: hash32(ctx.seedBase >>> 0, count++), classId: pair.quarry.id, variant: variantOf(pair.quarry), pos: quarryPos, yaw, hunter: false, ...etherOf };
      return { seed, classId: pair.hunter.id, variant: variantOf(pair.hunter), pos: hunterPos, yaw, hunter: false, encounter: kind, company, ...etherOf };
    }
    return null;
  }
  function reliefSpawn(seed, ctx, nearest, at) {
    const r = mulberry32(((seed >>> 0) ^ RELIEF_SALT) >>> 0);
    const roll = r();
    // The draw is taken even when relief is sure, so the stream stays aligned.
    if (!ctx.reliefSure && !(roll < RELIEF_CHANCE)) return null;
    const cls = classFor('navy', ctx.level ?? 1, r());
    if (!cls) return null;
    for (let i = 0; i < SPAWN_TRIES; i++) {
      const a = r() * Math.PI * 2;
      const d = SPAWN_RING[0] + r() * (SPAWN_RING[1] - SPAWN_RING[0]);
      const pos = [at[0] + Math.sin(a) * d, ctx.seaY ?? at[1], at[2] + Math.cos(a) * d];
      if (nearest(pos) < SPAWN_CLEAR || !ctx.isOpenWater(pos[0], pos[2], cls.hull)) continue;
      const variants = HULL_VARIANT_COUNTS[cls.hull] ?? 0;
      const variant = cls.hull === HULL.LargeBoat && variants > 0 ? Math.floor(r() * variants) : 0;
      return { seed, classId: cls.id, variant, pos, yaw: Math.atan2(at[0] - pos[0], at[2] - pos[2]), hunter: false, relief: true };
    }
    return null;
  }
  // No legend launches while any legend is at sea at any range, so overlapping haunts never launch her twice.
  function legendSpawn(seed, ctx, nearest) {
    const want = ctx.ether?.legend;
    if (!want?.classId || ctx.nearPort || (ctx.legends ?? []).length || (ctx.ships ?? []).some((s) => s.classId === want.classId)) return null;
    const r = mulberry32(((seed >>> 0) ^ LEGEND_SALT) >>> 0);
    if (!(r() < LEGEND_CHANCE)) return null;
    const cls = SHIP_CLASSES.find((c) => c.id === want.classId);
    if (!cls) return null;
    for (let i = 0; i < SPAWN_TRIES; i++) {
      const a = r() * Math.PI * 2;
      const d = SPAWN_RING[0] + r() * (SPAWN_RING[1] - SPAWN_RING[0]);
      const pos = [ctx.player[0] + Math.sin(a) * d, ctx.seaY ?? ctx.player[1], ctx.player[2] + Math.cos(a) * d];
      if (nearest(pos) < SPAWN_CLEAR || !ctx.isOpenWater(pos[0], pos[2], cls.hull)) continue;
      return { seed, classId: cls.id, variant: 0, pos, yaw: Math.atan2(ctx.player[0] - pos[0], ctx.player[2] - pos[2]), hunter: false, ether: ctx.ether.band.id, legend: want.id };
    }
    return null;
  }
  const director = {
    step(dt, ctx) {
      const out = { spawn: null, despawn: [] };
      // Read the real clock on every step, so time spent with no density never counts as a wait later.
      const spent = trafficSeconds(dt, ctx.real, lastReal);
      lastReal = Number.isFinite(ctx.real) ? ctx.real : null;
      const players = ctx.players?.length ? ctx.players : [ctx.player];
      const nearest = (p) => Math.min(...players.map((q) => Math.hypot(p[0] - q[0], p[2] - q[2])));
      for (const s of ctx.ships ?? []) if (!s.engaged && !s.theirs && nearest(s.pos) > DESPAWN_BEYOND) out.despawn.push(s.id);
      if (!((ctx.density ?? 0) > 0)) return out;
      const distress = Array.isArray(ctx.distress) && !ctx.relieving && !ctx.ether ? ctx.distress : null;
      if (distress) wait = Math.min(wait, RELIEF_WAIT_S);
      wait -= spent;
      if (wait > 0) return out;
      wait = SPAWN_EVERY[0] + random() * (SPAWN_EVERY[1] - SPAWN_EVERY[0]);
      // Prizes, hulks, sinking ships, and moored harbor boats fill no berth; the harbor keeps its own count.
      const alive = (ctx.ships ?? []).filter((s) => !out.despawn.includes(s.id) && s.afloat !== false && !s.berthed).length;
      if (alive >= (ctx.density ?? 0) + (distress ? 1 : 0) || random() >= SHIP_SPAWN_CHANCE) return out;
      const seed = hash32(ctx.seedBase >>> 0, count++);
      if (distress) {
        out.spawn = reliefSpawn(seed, ctx, nearest, distress);
        return out;
      }
      const legend = ctx.ether ? legendSpawn(seed, ctx, nearest) : null;
      if (legend) { out.spawn = legend; return out; }
      if (alive + 2 <= (ctx.density ?? 0)) {
        const pair = encounterSpawn(seed, ctx, nearest);
        if (pair) { out.spawn = pair; return out; }
      }
      const rng = mulberry32(seed);
      const ether = ctx.ether ?? null;
      const deep = !ether && !ctx.nearPort && !!ctx.deep;
      const faction = weightedPick(ether ? etherFactionWeights(ether.band, { nearPort: !!ctx.nearPort }) : factionWeights({ nearPort: !!ctx.nearPort, notoriety: ctx.notoriety ?? 0, deep }), rng());
      let cls = classFor(faction, (ctx.level ?? 1) + (deep ? DEEP_LEVEL : 0) + (ether?.band?.level ?? 0), rng());
      if (cls?.flagship && (ctx.ships ?? []).some((s) => s.classId === cls.id)) cls = classFor(faction, 1, rng());
      if (!cls) return out;
      for (let i = 0; i < SPAWN_TRIES; i++) {
        const a = rng() * Math.PI * 2;
        const d = SPAWN_RING[0] + rng() * (SPAWN_RING[1] - SPAWN_RING[0]);
        const pos = [ctx.player[0] + Math.sin(a) * d, ctx.seaY ?? ctx.player[1], ctx.player[2] + Math.cos(a) * d];
        if (nearest(pos) < SPAWN_CLEAR) continue;
        if (!ctx.isOpenWater(pos[0], pos[2], cls.hull)) continue;
        const hunter = !ether && faction === 'navy' && (ctx.notoriety ?? 0) >= HUNTER_AT;
        const toPlayer = Math.atan2(ctx.player[0] - pos[0], ctx.player[2] - pos[2]);
        const yaw = hunter ? toPlayer : toPlayer + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.9);
        const variants = HULL_VARIANT_COUNTS[cls.hull] ?? 0;
        const variant = cls.hull === HULL.LargeBoat && variants > 0 ? Math.floor(rng() * variants) : 0;
        out.spawn = { seed, classId: cls.id, variant, pos, yaw, hunter, ...(deep ? { deep: true } : {}), ...(ether ? { ether: ether.band.id } : {}) };
        break;
      }
      return out;
    },
    reset() { wait = FIRST_ROLL_S; lastReal = null; },
    get count() { return count; },
    set count(n) { count = Math.max(0, n | 0); },
  };
  return director;
}

export const DEEP_PX = 12;
export const DEEP_PIRATE_K = 1.8;
export const DEEP_TRADE_K = 0.5;
export const DEEP_LEVEL = 3;
export const DEEP_BOLD = 0.5;
export const DEEP_TIER = 2;
export const watersOf = ({ nearPort = false, portPx = null } = {}) => (nearPort ? 'coastal' : Number.isFinite(portPx) && portPx >= DEEP_PX ? 'deep' : 'open');

export const SEED_SALT = 0x5ea;
export const seedBaseOf = (px, py, day, salt = SEED_SALT) => hash32(px | 0, py | 0, day | 0, salt);
