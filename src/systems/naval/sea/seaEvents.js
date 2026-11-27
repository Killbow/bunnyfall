// @ts-check
import { BANDS, VEIL_X, LEAGUE_PX, LEAGUE_M, veilhaven, etherHash, etherRng, etherBandAt, ETHER_GOODS } from '../../../world/ethericSea.js';
import { HAUNT_SPREAD, etherShipNames } from '../etherShips.js';
import { classById } from '../navalShips.js';
import { SEA_FLEET_PERIOD_MS, seaFleetSailing } from '../../../net/wire.js';
import { SHIP_STATES } from '../navalDamage.js';

export const PX_M = LEAGUE_M / LEAGUE_PX;
const band = (id) => BANDS.find((b) => b.id === id);
const columns = (from, to) => [VEIL_X - to * LEAGUE_PX, VEIL_X - from * LEAGUE_PX];
const lerp = (a, b, k) => a + (b - a) * k;

export const STORM_PERIOD_MS = 2 * 3_600_000;
export const STORM_LIFE_MS = 50 * 60_000;
export const STORM_R_PX = 40;
export const STORM_DRIFT_PX = 60;
export const STORM_ABYSS_LEAGUES = 60;
export const STORM_SALT = 0x570a;
export const STORM_WRACK_MS = 90_000;
export const STORM_STRIKE_CHANCE = 0.25;
export const STORM_STRIKE = Object.freeze({ hull: 0.04, sail: 0.08, fire: 0.2 });

/** @typedef {{ n: number, start: number, end: number, x0: number, y0: number, x1: number, y1: number, r: number }} SeaStorm */

// Storms and fleets are pure functions of the shared relay clock, so every client online sees the same ones.
export function stormOf(n) {
  const k = Math.trunc(Number(n)) || 0;
  const r = etherRng(etherHash(STORM_SALT, k));
  const [cx0, cx1] = columns(band('deep').from, band('abyss').from + STORM_ABYSS_LEAGUES);
  const row = veilhaven().py, spread = HAUNT_SPREAD.deep;
  // Born far enough west that its drift and reach never cross into the Reaches.
  const x0 = lerp(cx0, cx1 - STORM_DRIFT_PX - STORM_R_PX, r()), y0 = lerp(row - spread, row + spread, r()), a = r() * Math.PI * 2;
  return { n: k, start: k * STORM_PERIOD_MS, end: k * STORM_PERIOD_MS + STORM_LIFE_MS, x0, y0, x1: x0 + Math.cos(a) * STORM_DRIFT_PX, y1: y0 + Math.sin(a) * STORM_DRIFT_PX, r: STORM_R_PX };
}
export function stormAt(nowMs) {
  if (!Number.isFinite(nowMs)) return null;
  const s = stormOf(Math.floor(nowMs / STORM_PERIOD_MS));
  return nowMs >= s.start && nowMs < s.end ? s : null;
}
export const nextStorm = (nowMs) => stormOf(Math.floor(nowMs / STORM_PERIOD_MS) + 1);
export function stormEye(s, nowMs) {
  const k = Math.max(0, Math.min(1, (nowMs - s.start) / STORM_LIFE_MS));
  return { x: lerp(s.x0, s.x1, k), y: lerp(s.y0, s.y1, k) };
}
export function stormHere(x, y, nowMs) {
  const s = stormAt(nowMs);
  if (!s || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const e = stormEye(s, nowMs);
  return Math.hypot(x - e.x, y - e.y) <= s.r ? s : null;
}
export const stormWrackSlot = (s, nowMs) => Math.max(0, Math.floor((nowMs - s.start) / STORM_WRACK_MS));
export function wrackOf(n, slot, bandId, yields) {
  const r = etherRng(etherHash(STORM_SALT, n, slot, 0x77));
  const good = ETHER_GOODS[Math.floor(r() * ETHER_GOODS.length) % ETHER_GOODS.length];
  const i = Math.max(0, BANDS.findIndex((b) => b.id === bandId));
  return { good, n: yields[i] ?? yields[0], rolls: r };
}
export function stormStrikeOf(r = Math.random) {
  if (!(r() < STORM_STRIKE_CHANCE)) return null;
  return { hull: STORM_STRIKE.hull, sail: STORM_STRIKE.sail, fire: r() < STORM_STRIKE.fire };
}
export const stormHurt = (damage, strike) => ({
  hull: Math.max(1, Math.round(damage.maxHull * strike.hull)), sail: damage.maxSail > 0 ? Math.max(1, Math.round(damage.maxSail * strike.sail)) : 0, crew: 0, fire: !!strike.fire,
});
export function strikeShip(damage, strike, now) {
  if (!damage || !strike || damage.state !== SHIP_STATES.afloat) return false;
  damage.apply(stormHurt(damage, strike), now, { floor: 1 });
  return true;
}

export const FLEET_OFFSET_MS = 60 * 60_000;
export const FLEET_SAIL_MS = 90 * 60_000;
export const FLEET_MPS = 5;
export const FLEET_ABYSS_LEAGUES = 80;
export const FLEET_SALT = 0xf1ee;
export const FLEET_FLAGSHIP = 'merchantCarrack';
export const FLEET_ESCORTS = Object.freeze({ deep: Object.freeze(['pirateBrig', 'pirateGalley']), abyss: Object.freeze(['pirateFlagship', 'pirateGalley', 'pirateBrig']) });
export const FLEET_PURSE = Object.freeze({ deep: 6000, abyss: 12000 });
export const FLEET_STATIONS = Object.freeze([[0, 0], [-260, 180], [260, 180], [0, 420]]);

/** @typedef {{ seed: number, classId: string, flag: boolean, station: readonly number[] }} FleetShip */
/** @typedef {{ n: number, start: number, end: number, band: string, from: { x: number, y: number }, to: { x: number, y: number }, name: string, purse: number, ships: FleetShip[] }} SeaFleet */

export function fleetOf(n) {
  const k = Math.trunc(Number(n)) || 0;
  const r = etherRng(etherHash(FLEET_SALT, k));
  const id = r() < 0.5 ? 'deep' : 'abyss';
  const [x0, x1] = id === 'deep' ? columns(band('deep').from, band('abyss').from) : columns(band('abyss').from, band('abyss').from + FLEET_ABYSS_LEAGUES);
  const row = veilhaven().py, spread = HAUNT_SPREAD.deep;
  const from = { x: lerp(x0, x1, r()), y: lerp(row - spread, row + spread, r()) };
  const a = (r() - 0.5) * 0.6, len = (FLEET_MPS * FLEET_SAIL_MS) / 1000 / PX_M;
  const to = { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
  const seedOf = (i) => etherHash(FLEET_SALT, k, i, 0x5eed) >>> 0;
  const ships = [FLEET_FLAGSHIP, ...FLEET_ESCORTS[id]].map((classId, i) => ({ seed: seedOf(i), classId, flag: i === 0, station: FLEET_STATIONS[i] }));
  const start = k * SEA_FLEET_PERIOD_MS + FLEET_OFFSET_MS;
  return { n: k, start, end: start + FLEET_SAIL_MS, band: id, from, to, name: etherShipNames(classById(FLEET_FLAGSHIP), ships[0].seed).name, purse: FLEET_PURSE[id], ships };
}
export function fleetAt(nowMs) {
  if (!Number.isFinite(nowMs)) return null;
  const f = fleetOf(seaFleetSailing(nowMs));
  return nowMs >= f.start && nowMs < f.end ? f : null;
}
export function nextFleet(nowMs) {
  const f = fleetOf(seaFleetSailing(nowMs));
  return nowMs < f.start ? f : fleetOf(f.n + 1);
}
export function fleetPlace(f, nowMs) {
  const k = Math.max(0, Math.min(1, (nowMs - f.start) / FLEET_SAIL_MS));
  return { x: lerp(f.from.x, f.to.x, k), y: lerp(f.from.y, f.to.y, k), yaw: Math.atan2(f.to.x - f.from.x, -(f.to.y - f.from.y)) };
}
export const fleetBandAt = (f, nowMs) => etherBandAt(fleetPlace(f, nowMs).x).id;
