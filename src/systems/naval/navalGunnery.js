// @ts-check
import { GUNS, SIDE_DIR, batteryOf, BARREL } from './navalShips.js';
import { shotGun, naturalShot, shotId, SHOT_SWITCH } from './shotKinds.js';
import { launchVelocity, elevationForRange, landing, maxRange, volleyRandom, scatter, flatUnit, NAVAL_DEG } from './navalBallistics.js';
import { quatRotate } from '../../world/quat.js';

export const BOW_ARC = 35;
export const STERN_ARC = 40;
export const RIPPLE_S = 0.09;
export const RELOAD_UNDERMANNED = 0.8;
export const RELOAD_SINGLEHANDED = 1.4;
export const READY_FLASH_S = 0.7;
export const BARREL_DROP_S = 1.2;
export const AIM_SLOPE = 30;
export const LOAD_GROUPS = Object.freeze(['broadside', 'bow', 'stern']);
export const loadGroupOf = (side) => (side === 'starboard' || side === 'port' ? 'broadside' : side === 'bow' || side === 'stern' ? side : null);
export const loadOf = (gunKind, shot) => (gunKind === 'barrel' ? null : shot == null ? naturalShot(gunKind) : shotId(shot));

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// At a depression of p0 or steeper the range is where the look meets the sea; shallower, it grows AIM_SLOPE meters
// a degree. The two laws meet at p0 in value and rate.
export function lookReach(pitch, h) {
  const slope = AIM_SLOPE / NAVAL_DEG;
  const hh = Math.max(0.5, h);
  const p0 = Math.asin(Math.min(1, Math.sqrt(hh / slope)));
  const dip = -pitch;
  return dip >= p0 ? hh / Math.tan(dip) : hh / Math.tan(p0) + slope * (p0 - dip);
}

export function shipAxes(rotation) {
  const f = flatUnit(quatRotate(rotation, [0, 0, 1])) ?? [0, 0, 1];
  return { forward: f, right: [f[2], 0, -f[0]] };
}

export function bearingOf(lookDir, rotation) {
  const l = flatUnit(lookDir);
  if (!l) return 0;
  const { forward, right } = shipAxes(rotation);
  return Math.atan2(l[0] * right[0] + l[2] * right[2], l[0] * forward[0] + l[2] * forward[2]) / NAVAL_DEG;
}

export function sideForBearing(bearing) {
  const a = Math.abs(bearing);
  if (a <= BOW_ARC) return 'bow';
  if (a >= 180 - STERN_ARC) return 'stern';
  return bearing > 0 ? 'starboard' : 'port';
}

export const toWorld = (ship, p) => {
  const r = quatRotate(ship.rotation, p);
  return [ship.position[0] + r[0], ship.position[1] + r[1], ship.position[2] + r[2]];
};

/**
 * @param {{ position: number[], rotation: number[], velocity?: number[], hull: number }} ship
 * @param {'starboard'|'port'|'bow'|'stern'} side
 * @param {{ origin: number[], dir: number[], at?: number[] | null } | null} look
 * @param {number} seaY
 * @param {{ range?: number, target?: number[], targetY?: number, shot?: string | null }} [opts]
 * @returns {null | { side: string, gun: string, barrel: boolean, shot: string | null, elevation: number, range: number, maxRange: number,
 *   dir: number[], muzzles: number[][], launches: { p0: number[], v0: number[] }[], landings: ({ t: number, point: number[] } | null)[],
 *   width: number, lookPoint: number[] | null }}
 */
export function aimSolution(ship, side, look, seaY, { range = null, target = null, targetY = null, shot = null } = {}) {
  const battery = batteryOf(ship.hull, side);
  if (!battery) return null;
  const load = loadOf(battery.gun, shot);
  const gun = shotGun(battery.gun, GUNS[battery.gun], load);
  const muzzles = battery.muzzles.map((m) => toWorld(ship, m));
  const local = SIDE_DIR[side];
  const dir = flatUnit(quatRotate(ship.rotation, local)) ?? [0, 0, 1];
  if (battery.gun === 'barrel') {
    const drops = muzzles.map((m) => [m[0] + dir[0] * 1.5, seaY, m[2] + dir[2] * 1.5]);
    return { side, gun: battery.gun, barrel: true, shot: null, elevation: 0, range: 1.5, maxRange: 1.5, dir, muzzles, launches: [], landings: drops.map((point) => ({ t: 0, point })), width: 1, lookPoint: null };
  }
  const c = muzzles.reduce((s, m) => [s[0] + m[0] / muzzles.length, s[1] + m[1] / muzzles.length, s[2] + m[2] / muzzles.length], [0, 0, 0]);
  const dy = c[1] - seaY;
  const hi = gun.maxEl * NAVAL_DEG, lo = gun.minEl * NAVAL_DEG;
  const far = maxRange(gun.speed, dy, hi);
  let want = range, lookPoint = null, layDy = dy;
  if (!look && target) want = (target[0] - c[0]) * dir[0] + (target[2] - c[2]) * dir[2];
  if (!look && Number.isFinite(targetY)) layDy = c[1] - targetY;
  if (look?.at) {
    lookPoint = look.at;
    want = (look.at[0] - c[0]) * dir[0] + (look.at[2] - c[2]) * dir[2];
    layDy = c[1] - look.at[1];
  } else if (look) {
    const l = Math.hypot(look.dir[0], look.dir[1], look.dir[2]) || 1;
    const reach = lookReach(Math.asin(clamp(look.dir[1] / l, -1, 1)), look.origin[1] - seaY);
    const flat = flatUnit(look.dir) ?? dir;
    lookPoint = [look.origin[0] + flat[0] * reach, seaY, look.origin[2] + flat[2] * reach];
    want = (lookPoint[0] - c[0]) * dir[0] + (lookPoint[2] - c[2]) * dir[2];
  }
  const elevation = want == null ? lo : want <= 0 ? lo : elevationForRange(want, gun.speed, layDy, lo, hi);
  const carry = ship.velocity ?? null;
  const launches = muzzles.map((p0) => ({ p0, v0: launchVelocity(dir, elevation, gun.speed, carry) }));
  const landings = launches.map((l) => landing(l.p0, l.v0, seaY));
  const reached = landings.filter(Boolean);
  const meanRange = reached.length ? reached.reduce((s, l) => s + Math.hypot(l.point[0] - c[0], l.point[2] - c[2]), 0) / reached.length : 0;
  return {
    side, gun: battery.gun, barrel: false, shot: load, elevation, range: meanRange, maxRange: far, dir, muzzles, launches, landings,
    width: Math.max(2, 2 * meanRange * Math.tan(gun.yawSpread * NAVAL_DEG)), lookPoint,
  };
}

// One seed per volley scatters it, so every client in a room scatters it the same way.
/**
 * @returns {{ delay: number, p0: number[], v0: number[], gun: string, shot: string, weight: number, index: number }[]}
 */
export function volleyLaunches(solution, seed, { skill = 0.5, carry = null, weight = 1 } = {}) {
  if (!solution || solution.barrel) return [];
  const w = Number.isFinite(weight) && weight > 0 ? weight : 1;
  const shot = loadOf(solution.gun, solution.shot);
  const gun = shotGun(solution.gun, GUNS[solution.gun], shot);
  const rand = volleyRandom(seed);
  const k = clamp(1.5 - skill, 0.4, 1.5);
  const c = carry ?? [0, 0, 0];
  return solution.muzzles.map((p0, index) => {
    const s = scatter(solution.dir, solution.elevation, gun.yawSpread * k, gun.pitchSpread * k, rand);
    const delay = index * RIPPLE_S;
    return { delay, p0: [p0[0] + (c[0] ?? 0) * delay, p0[1] + (c[1] ?? 0) * delay, p0[2] + (c[2] ?? 0) * delay], v0: launchVelocity(s.dir, s.elevation, gun.speed, carry), gun: solution.gun, shot, weight: w, index };
  });
}

export function reloadSeconds(gunKind, crewShare, crewed, shot = null) {
  if (!GUNS[gunKind]) return 0;
  if (gunKind === 'barrel') return BARREL_DROP_S;
  const g = shotGun(gunKind, GUNS[gunKind], loadOf(gunKind, shot));
  if (!crewed) return g.reload * RELOAD_SINGLEHANDED;
  return g.reload * (1 + RELOAD_UNDERMANNED * (1 - clamp(crewShare, 0, 1)));
}

/**
 * @param {number} hull
 * @param {{ crewed?: boolean, crewShare?: () => number, barrels?: number, reloadScale?: () => number }} [opts]
 */
export function createGunDeck(hull, { crewed = true, crewShare = () => 1, barrels = BARREL.stock, reloadScale = () => 1 } = {}) {
  /** @type {Record<string, number>} */ const clocks = { starboard: 0, port: 0, bow: 0, stern: 0 };
  /** @type {Record<string, number>} */ const length = { starboard: 1, port: 1, bow: 1, stern: 1 };
  /** @type {number} */ let barrelStock = barrels;
  let braced = false;
  /** @type {Record<string, string | null>} */ const loads = { broadside: null, bow: null, stern: null };
  const scaleNow = () => Math.max(0.5, Math.min(1.5, Number(reloadScale()) || 1));
  const loadAt = (side) => { const b = batteryOf(hull, side); return b ? loadOf(b.gun, loads[loadGroupOf(side)]) : null; };
  const deck = {
    hull,
    left: (side) => clocks[side] ?? 0,
    progress: (side) => (clocks[side] > 0 ? clamp(1 - clocks[side] / (length[side] || 1), 0, 1) : 1),
    ready(side) {
      const b = batteryOf(hull, side);
      if (!b || braced || clocks[side] > 0) return false;
      return b.gun !== 'barrel' || barrelStock > 0;
    },
    fired(side) {
      const b = batteryOf(hull, side);
      if (!b) return;
      const s = reloadSeconds(b.gun, crewShare(), crewed, loadAt(side)) * (b.gun === 'barrel' ? 1 : scaleNow());
      clocks[side] = s; length[side] = s || 1;
      if (b.gun === 'barrel') barrelStock = Math.max(0, barrelStock - 1);
    },
    load: loadAt,
    setLoad(side, shot) {
      const group = loadGroupOf(side);
      const sides = group === 'broadside' ? ['starboard', 'port'] : [group];
      const armed = sides.filter((x) => { const b = batteryOf(hull, x); return b && b.gun !== 'barrel'; });
      if (!armed.length) return false;
      const next = shotId(shot);
      if (armed.every((x) => loadAt(x) === next)) return false;
      for (const x of armed) {
        const b = batteryOf(hull, x);
        const was = reloadSeconds(b.gun, crewShare(), crewed, loadAt(x));
        const now = reloadSeconds(b.gun, crewShare(), crewed, next);
        if (clocks[x] > 0) { const k = now / (was || 1); clocks[x] *= k; length[x] *= k; }
        else { const t = SHOT_SWITCH * now * scaleNow(); clocks[x] = t; length[x] = t || 1; }
      }
      loads[group] = armed.every((x) => naturalShot(batteryOf(hull, x).gun) === next) ? null : next;
      return true;
    },
    step(dt) { if (braced) return; for (const k of Object.keys(clocks)) if (clocks[k] > 0) clocks[k] = Math.max(0, clocks[k] - Math.max(0, dt)); },
    get barrels() { return barrelStock; },
    set barrels(n) { barrelStock = Math.max(0, Math.min(99, n | 0)); },
    get braced() { return braced; },
    set braced(v) { braced = !!v; },
    // A load group at its bores' natural shot is saved as null.
    snapshot: () => ({ clocks: { ...clocks }, barrels: barrelStock, loads: { ...loads } }),
    restore(s) {
      if (!s || typeof s !== 'object') return;
      for (const k of Object.keys(clocks)) { const v = Number(s.clocks?.[k]); clocks[k] = Number.isFinite(v) && v > 0 ? Math.min(v, 60) : 0; }
      if (Number.isFinite(s.barrels)) deck.barrels = s.barrels;
      if (s.loads && typeof s.loads === 'object') deck.restoreLoads(s.loads);
    },
    restoreLoads(l) {
      for (const g of LOAD_GROUPS) {
        const sides = g === 'broadside' ? ['starboard', 'port'] : [g];
        const guns = sides.map((x) => batteryOf(hull, x)?.gun).filter((k) => k && k !== 'barrel');
        const want = typeof l?.[g] === 'string' && guns.length ? shotId(l[g]) : null;
        loads[g] = want && !guns.every((k) => naturalShot(k) === want) ? want : null;
      }
    },
  };
  return deck;
}

