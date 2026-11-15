// @ts-check
// RAID5 (2026-10-25, bible/03-World/Raiding-Parties.md RAID5): A RAIDED TOWN'S PLACES AND PEOPLE - the world host's half
// of the raid's kinds (systems/raidKinds.js, run by systems/raidingParties.js): the town's square (where the Standard is
// held and the refugees are bound), the way the refugees walk to it (the town's own walk grid - systems/livingWorld/
// townPaths.js findTownPath, the same cells every client walks), the Standard-Bearer (one of the town's watch, minted
// at the square - scenes/cityGuards.js standBearer) and a refugee (a townsperson of the street's pool, the player's ally,
// walking behind the way's guide - characters/enemy/enemyMotor.js `follow`). A module the host wires (HOST-SPLIT,
// bible/01-Overview/Host-Split.md): the host hands its own doors, as they are, and keeps none of this.
//
// THE FOUR HOSTS (THE FOUR HOSTS RULE, Home.md): scenes/world.js WIRED - the one host with the Bay's towns, their walk
// grids and the town watch.
// scenes/exterior.js - FLAGGED: the fixed-city bench runs no raid; the streaming host is where its towns are raided.
// scenes/worldModes.js and scenes/dungeonContext.js - FLAGGED: a raid is the street's, and stands nothing indoors (RAID1).
import { musterBigTown, MUSTER_CAMP_R } from '../systems/raidMuster.js';   // BUNNYFALL: a big town musters at two camps
import { NAV_CELL } from '../world/city/cityNavigation.js';
import { findTownPath, pathLine } from '../systems/livingWorld/townPaths.js';
import { gatePassage, carveNav, componentsOf, edgePieces } from '../systems/travel/townWalk.js';
import { streetNet } from '../systems/livingWorld/places.js';   // AUDIT WORLD-EVENTS L4-3/L4-8: the town's street net, where its living town has no places
import { MOBILE_TYPES } from '../characters/mobile/mobileTypes.js';
import { RAID_BEARER_HEALTH_X, RAID_BEARER_LEASH_M, RAID_REFUGEE_HEALTH_X } from '../systems/raidKinds.js';

/** The most a way's search opens. */
export const RAID_WAY_EXPANSIONS = 30000;
/** AUDIT WORLD-EVENTS L4-8: the least a walkable component holds to be the town's streets where its living town names
 *  none (cells) - a yard boxed in about the grid's middle is no square (the game's held one, two, sixteen and 237). */
export const RAID_STREETS_MIN = 400;
/** The sides a way comes from, by the raid's draw (0 north - the grid's far rows, +z - then east, south, west), as the
 *  living town's exits name them (systems/livingWorld/places.js). */
const SIDE_NAMES = Object.freeze(['n', 'e', 's', 'w']);
/** The refugee's kind - a temple's healer, a townsperson the street's pool can stand. */
export const RAID_REFUGEE_KIND = MOBILE_TYPES.Healer;
export const RAID_CAMP_MARGIN_M = 3;

/** @param {any} p */
export const pixelGates = (p) => (p?.locOrigin ? (p.cityGates ?? []).map((g) => [g.local[12] - p.locOrigin[0], g.local[14] - p.locOrigin[2]]) : []);
/** @param {any[]} raids */
export const raidGatesHeld = (raids) => new Set((raids ?? []).map((r) => `${r.px},${r.py}`));

/**
 * Returns a camp cell in the fields outside the gate whose passage opens nearest `inner`, with open ground around it.
 * `walled` is false when the streets reach the grid edge or no gate leads out; `camp` is null when no cell fits.
 * @param {{ width: number, height: number, weightAt: (gx: number, gy: number) => number }} nav
 * @param {number[][]} gates @param {number[]} inner
 * @returns {{ walled: boolean, camp: number[]|null, passage: number[][]|null }}
 */
export function gateCamp(nav, gates, inner) {
  const label = componentsOf(nav), { edge } = edgePieces(nav), W = nav.width, H = nav.height;
  const piece = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? label[y * W + x] : 0);
  const none = { walled: false, camp: null, passage: null };
  if (!gates?.length || edge.has(piece(inner[0], inner[1]))) return none;
  let best = null;
  for (const g of gates) {
    const passage = gatePassage(nav, g);
    if (!passage) continue;
    const a = passage[0], z = passage[passage.length - 1];
    for (const [ux, uy] of a[0] !== z[0] ? [[Math.sign(z[0] - a[0]), 0]] : a[1] !== z[1] ? [[0, Math.sign(z[1] - a[1])]] : [[1, 0], [0, 1]]) {
      const lo = [a[0] - ux, a[1] - uy], hi = [z[0] + ux, z[1] + uy];
      const loOut = edge.has(piece(lo[0], lo[1])), hiOut = edge.has(piece(hi[0], hi[1]));
      if (loOut === hiOut || !piece(lo[0], lo[1]) || !piece(hi[0], hi[1])) continue;
      const [out, into, dir] = loOut ? [lo, hi, [-ux, -uy]] : [hi, lo, [ux, uy]];
      const far = (into[0] - inner[0]) ** 2 + (into[1] - inner[1]) ** 2;
      if (!best || far < best.far) best = { far, passage, out, dir };
    }
  }
  if (!best) return none;
  const R = Math.ceil((MUSTER_CAMP_R + RAID_CAMP_MARGIN_M) / NAV_CELL), id = piece(best.out[0], best.out[1]);
  const clear = (x, y) => {
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R && piece(x + dx, y + dy) !== id) return false;
    return true;
  };
  const [ox, oy] = best.out, [ux, uy] = best.dir;
  for (let s = 0; s < Math.max(W, H); s++) for (let l = 0; l <= 2 * R; l++) for (const k of l ? [1, -1] : [1]) {
    const x = ox + ux * s - uy * l * k, y = oy + uy * s + ux * l * k;
    if (clear(x, y)) return { walled: true, camp: [x, y], passage: best.passage };
  }
  return { walled: true, camp: null, passage: best.passage };
}

/**
 * AUDIT WORLD-EVENTS L4-8: THE TOWN'S STREETS off its grid alone (a classic town - its people the TownPopulation's,
 * with no places): the walkable component (four-neighbour, places.js streetNet) of the cell nearest the grid's middle
 * that holds RAID_STREETS_MIN cells or more (or the largest's whole, a town smaller than that), and that cell its square.
 * Null for a grid with no walkable cell. Pure.
 * @param {{ width: number, height: number, weightAt: (gx: number, gy: number) => number }} nav
 * @returns {{ label: Int32Array, id: number, square: number[], exits: null }|null}
 */
export function gridStreets(nav) {
  const { label } = streetNet(nav);
  const size = new Map();
  for (let i = 0; i < label.length; i++) if (label[i]) size.set(label[i], (size.get(label[i]) ?? 0) + 1);
  let biggest = 0;
  for (const n of size.values()) biggest = Math.max(biggest, n);
  const min = Math.min(RAID_STREETS_MIN, biggest), W = nav.width, H = nav.height, mx = Math.floor(W / 2), my = Math.floor(H / 2);
  for (let r = 0; r < Math.max(W, H) && biggest; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = mx + dx, y = my + dy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || x < 0 || y < 0 || x >= W || y >= H) continue;
    const id = label[y * W + x];
    if (id && size.get(id) >= min) return { label, id, square: [x, y], exits: null };
  }
  return null;
}
/**
 * The cell of a town's streets nearest the middle of its side `side` (0 north - the grid's far rows - then east,
 * south, west): the line nearest that edge holding a street cell, and on it the one nearest the side's middle - the
 * living town's exits' own reading (places.js). Pure. @param {{ width: number, height: number }} nav
 * @param {Int32Array} label @param {number} id @param {number} side @returns {number[]|null}
 */
export function streetEdgeCell(nav, label, id, side) {
  const W = nav.width, H = nav.height, k = ((side | 0) % 4 + 4) % 4, rows = k === 0 || k === 2;
  const lines = rows ? H : W, along = rows ? W : H, half = along / 2;
  for (let n = 0; n < lines; n++) {
    const i = k === 0 ? H - 1 - n : k === 1 ? W - 1 - n : k === 2 ? n : n;
    let best = null, bestMid = Infinity;
    for (let j = 0; j < along; j++) {
      const x = rows ? j : i, y = rows ? i : j;
      if (label[y * W + x] !== id) continue;
      if (Math.abs(j - half) < bestMid) { bestMid = Math.abs(j - half); best = [x, y]; }
    }
    if (best) return best;
  }
  return null;
}

/**
 * @param {{
 *   townAt: (x: number, z: number) => ({ town: number, nav: any, places?: any, local: number[], toScene: (u: number, v: number) => number[] }|null|undefined),
 *   townAtPixel?: (px: number, py: number) => ({ town: number, nav: any, places?: any, toScene: (u: number, v: number) => number[] }|null),
 *   feet: () => (number[]|null), groundAt: (x: number, z: number) => number,
 *   gatesAt?: (px: number, py: number) => number[][], standGuard: (pos: number[], yaw: number) => Promise<any>,
 *   spawnFoe: (mobileType: number, pos: number[], o: any) => Promise<any>,
 * }} deps  `townAt` the scene's point in a built town (scenes/wagon/wagonWardenHost.js wardenTownIn); `townAtPixel` the
 *   built town on a map pixel (wardenTownOfPixel - AUDIT WORLD-EVENTS L4-4: the raid's own, wherever about it the player
 *   stands); `feet` the player's; `groundAt` the ground's height; `standGuard` a defender of the watch minted at a point
 *   (cityGuards.standBearer); `spawnFoe` the street's pool's own (exteriorFoes.spawnFoe - a refugee is its `allied`,
 *   loose and transient)
 */
export function createRaidSites({ townAt, townAtPixel = () => null, feet, groundAt, gatesAt = () => [], standGuard, spawnFoe }) {
  /** AUDIT WORLD-EVENTS L4-4: the raid's own town - its map pixel's, built - else the one about the player's feet (the
   *  feet alone read null across the block the town's rect is widened by, and the raid kept the null). */
  const townOf = (raid) => (raid && Number.isInteger(raid.px) && Number.isInteger(raid.py) ? townAtPixel(raid.px, raid.py) : null) ?? (() => { const f = feet(); return f ? townAt(f[0], f[2]) ?? null : null; })();
  /** @type {WeakMap<object, any>} each classic grid's streets, read once */
  const gridNets = new WeakMap();
  /** AUDIT WORLD-EVENTS L4-3/L4-8: the town's streets and square - its living town's places' (the net its doors open
   *  onto, the square on it, the exits on it), else its grid's (gridStreets). */
  function streetsOf(t) {
    const pl = t.places;
    if (pl?.net && pl.square?.cell) return { label: pl.net, id: pl.netId, square: pl.square.cell, exits: pl.exits ?? null };
    if (!gridNets.has(t.nav)) gridNets.set(t.nav, gridStreets(t.nav));
    return gridNets.get(t.nav);
  }
  const sceneOf = (t, cell) => { const s = t.toScene((cell[0] + 0.5) * NAV_CELL, (cell[1] + 0.5) * NAV_CELL); return [s[0], groundAt(s[0], s[1]), s[1]]; };
  return {
    /** BUNNYFALL: whether the raid's town is big enough to muster at two camps (systems/raidMuster.js). @param {any} [raid] */
    bigTown(raid = null) { const t = townOf(raid); return t ? musterBigTown(t.nav, NAV_CELL) : false; },
    /** BUNNYFALL: the raid's town as it stands (its walk grid, its places, its frame), or null - the muster's smoke reads it. @param {any} [raid] */
    townOf(raid = null) { return townOf(raid) ?? null; },
    /** BUNNYFALL: the raid's own town on its own pixel, built - or null (never the player's town in its place). @param {any} raid */
    townAtPixel(raid) { return raid && Number.isInteger(raid.px) && Number.isInteger(raid.py) ? townAtPixel(raid.px, raid.py) ?? null : null; },
    /** The town's square in the scene ([x, y, z]), or null (its town not built, or no streets). @param {any} [raid] */
    square(raid = null) {
      const t = townOf(raid);
      const s = t ? streetsOf(t) : null;
      return s ? sceneOf(t, s.square) : null;
    },
    /**
     * Returns [x, y, z] points from the camp for `side` (0 north, 1 east, 2 south, 3 west) to the square, or null.
     * In a walled town the camp sits outside a city gate, and the way passes through that gate.
     * @param {number} side @param {any} [raid]
     */
    way(side, raid = null) {
      const t = townOf(raid);
      const s = t ? streetsOf(t) : null;
      if (!s) return null;
      const k = ((side | 0) % 4 + 4) % 4;
      const start = s.exits?.find((e) => e.side === SIDE_NAMES[k])?.cell ?? streetEdgeCell(t.nav, s.label, s.id, k);
      if (!start) return null;
      const gates = Number.isInteger(raid?.px) && Number.isInteger(raid?.py) ? gatesAt(raid.px, raid.py) ?? [] : [];
      const gc = gateCamp(t.nav, gates.map((g) => t.nav.worldToNav(g[0], g[1])), start);
      if (gc.walled && !gc.camp) return null;
      // Two searches: one search from the camp to the square would expand through the fields around the wall first.
      const gate = gc.camp ? findTownPath(carveNav(t.nav, [gc.passage]), gc.camp, start, { maxExpansions: RAID_WAY_EXPANSIONS }) : [start];
      const town = gate ? findTownPath(t.nav, start, s.square, { maxExpansions: RAID_WAY_EXPANSIONS }) : null;
      const cells = town ? [...gate.slice(0, -1), ...town] : null;
      if (!cells || cells.length < 2) return null;
      return pathLine(cells).pts.map((p) => { const s = t.toScene(p[0], p[1]); return [s[0], groundAt(s[0], s[1]), s[1]]; });
    },
    /** The Standard-Bearer at `post`: the watch's own, RAID_BEARER_HEALTH_X as hardy, kept within RAID_BEARER_LEASH_M of it. */
    async standBearer(post) {
      const g = await standGuard(post, 0);
      if (!g?.entity) return g ?? null;
      g.entity.maxHealth = Math.max(1, Math.round((g.entity.maxHealth || 1) * RAID_BEARER_HEALTH_X));
      g.entity.health = g.entity.maxHealth;
      g.raidBearer = true;
      if (g.ai) g.ai.follow = { feet: () => post, stop: 0.6, leash: RAID_BEARER_LEASH_M };
      return g;
    },
    /** AUDIT WORLD-EVENTS L4-9: a bearer this machine no longer runs the raid of - he stands down, the watch's walk off
     *  (cityGuards.js WATCH-LEAVES), and the next runner raises its own. @param {any} g */
    releaseBearer(g) {
      if (!g) return;
      g.raidBearer = false; g.leaving = true;
      if (g.ai) { g.ai.follow = null; g.ai.target = null; }
    },
    /** A refugee at `at`, walking behind `follow` (the way's guide - characters/enemy/enemyMotor.js `follow`). */
    async standRefugee(at, follow) {
      const f = await spawnFoe(RAID_REFUGEE_KIND, at, { allied: true, loose: true, transient: true, feetGiven: true });
      if (!f?.entity) return f ?? null;
      f.entity.maxHealth = Math.max(1, Math.round((f.entity.maxHealth || 1) * RAID_REFUGEE_HEALTH_X));
      f.entity.health = f.entity.maxHealth;
      f.refugee = true;
      if (f.ai) f.ai.follow = follow;
      return f;
    },
  };
}
