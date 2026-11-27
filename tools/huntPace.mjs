#!/usr/bin/env node
// Measures the most bounty clears a hunter can make in a UTC day across the game's boards, at the fastest legal
// ride with no fighting. HUNT_CLEARS_DAY_MAX in src/net/huntLaw.js is set from its best day.
// Run: ARENA2_PATH=/path/to/arena2 node tools/huntPace.mjs [--json].
import { readFileSync } from 'node:fs';
import { isMain } from './lib/isMain.mjs';
import { BOUNTIES_PER_DAY, BOUNTY_ACTIVE_MAX, bountySites, bountyDungeons, boardPostings, MINUTES_PER_DAY } from '../src/guilds/bountyBoard.js';
import { ONLINE_MINUTES_PER_MS, sharedClassicMinutes } from '../src/net/wire.js';
import { PIXEL_M } from '../src/net/gateLaw.js';
import { runSpeed } from '../src/player/motor.js';
import { DF_RIDE_BASE } from '../src/travel/transport.js';
import { steedSpeedScale } from '../src/travel/steedCare.js';

// An upper bound on any hunter's ride speed: top Speed and buffed Running, the fastest horse, and a 10% boost.
export const HUNT_PACE_MPS = runSpeed(100, 185, false, DF_RIDE_BASE) * steedSpeedScale(100, { paceFloor: false }) * 1.1;
export const HUNT_PACE_PACK_M = 60;
const NEAREST = 24;
const GAME_DAY_S = MINUTES_PER_DAY / ONLINE_MINUTES_PER_MS / 1000;

export function toPixel(/** @type {[number, number]} */ at, /** @type {number} */ x, /** @type {number} */ y) {
  const nx = Math.max(x, Math.min(x + 1, at[0])), ny = Math.max(y, Math.min(y + 1, at[1]));
  return { m: Math.hypot(nx - at[0], ny - at[1]) * PIXEL_M, at: /** @type {[number, number]} */ ([nx, ny]) };
}
const PERMS = [0, 1, 2, 3, 4].map((n) => {
  const out = /** @type {number[][]} */ ([]);
  const walk = (/** @type {number[]} */ pre, /** @type {number[]} */ rest) => { if (!rest.length) out.push(pre); for (const r of rest) walk([...pre, r], rest.filter((x) => x !== r)); };
  walk([], [...Array(n).keys()]);
  return out;
});
export function tourOf(/** @type {[number, number]} */ at, /** @type {Array<[number, number]>} */ targets, /** @type {number} */ mps) {
  let best = null;
  for (const p of PERMS[targets.length]) {
    let pos = at, s = 0;
    const legs = [];
    for (const i of p) { const r = toPixel(pos, targets[i][0], targets[i][1]); s += (r.m + HUNT_PACE_PACK_M) / mps; pos = r.at; legs.push(s); }
    if (!best || s < best.s) best = { s, at: pos, legs };
  }
  return best ?? { s: 0, at, legs: [] };
}

function toursOf(/** @type {Parameters<typeof huntDay>[0]} */ cities, /** @type {number} */ mps, /** @type {Map<number, any[]>} */ memo, /** @type {number} */ day) {
  if (!memo.has(day)) {
    memo.set(day, cities.map((c, i) => { const list = c.targets(day).slice(0, BOUNTY_ACTIVE_MAX); return { i, n: list.length, s: tourOf([c.px + 0.5, c.py + 0.5], list, mps).s }; })
      .filter((x) => x.n > 0).sort((a, b) => a.s / a.n - b.s / b.n));
  }
  return /** @type {any[]} */ (memo.get(day));
}

/**
 * @param {Array<{ px: number, py: number, targets: (day: number) => Array<[number, number]> }>} cities
 * @param {{ start: number, mps?: number, dayS?: number, day0?: number, phaseS?: number, carriageS?: number|null, memo?: Map<number, any[]> }} o
 */
export function huntDay(cities, { start, mps = HUNT_PACE_MPS, dayS = 86_400, day0 = 0, phaseS = 0, carriageS = 0, memo = new Map() }) {
  let t = 0, clears = 0, at = /** @type {[number, number]} */ ([cities[start].px + 0.5, cities[start].py + 0.5]), here = start;
  const taken = new Map();
  const dayAt = (/** @type {number} */ s) => day0 + Math.floor((s + phaseS) / GAME_DAY_S);
  for (let guard = 0; guard < 100_000; guard++) {
    const day = dayAt(t);
    if (taken.get(here) !== day) {
      const list = cities[here].targets(day).slice(0, BOUNTY_ACTIVE_MAX);
      const tour = tourOf(at, list, mps);
      for (const leg of tour.legs) if (t + leg <= dayS) clears++;
      t += tour.s; at = tour.at; taken.set(here, day);
      if (t >= dayS) break;
    }
    let next = -1, cost = Infinity;
    const near = cities.map((c, i) => [Math.hypot(c.px + 0.5 - at[0], c.py + 0.5 - at[1]), i]).sort((a, b) => a[0] - b[0]).slice(0, NEAREST);
    for (const [, i] of near) {
      const ride = toPixel(at, cities[i].px, cities[i].py);
      const arrive = t + ride.m / mps;
      if (taken.get(i) === dayAt(arrive)) continue;
      const list = cities[i].targets(dayAt(arrive)).slice(0, BOUNTY_ACTIVE_MAX);
      if (!list.length) continue;
      const c = (ride.m / mps + tourOf(ride.at, list, mps).s) / list.length;
      if (c < cost) { cost = c; next = i; }
    }
    let via = null;
    if (carriageS != null) {
      const gate = near.length ? toPixel(at, cities[near[0][1]].px, cities[near[0][1]].py) : null;
      const arrive = gate ? t + gate.m / mps + carriageS : Infinity;
      const best = gate ? toursOf(cities, mps, memo, dayAt(arrive)).find((x) => taken.get(x.i) !== dayAt(arrive)) : null;
      if (gate && best) {
        const c = (gate.m / mps + carriageS + best.s) / best.n;
        if (c < cost) { cost = c; next = best.i; via = gate; }
      }
    }
    if (next < 0) break;
    if (via) { t += via.m / mps + carriageS; at = [cities[next].px + 0.5, cities[next].py + 0.5]; here = next; }
    else { const ride = toPixel(at, cities[next].px, cities[next].py); t += ride.m / mps; at = ride.at; here = next; }
    if (t >= dayS) break;
  }
  return clears;
}

export function huntPace(/** @type {Parameters<typeof huntDay>[0]} */ cities, /** @type {Omit<Parameters<typeof huntDay>[1], 'start'> & { starts?: number[] }} */ o = {}) {
  const memo = new Map();
  const days = (o.starts ?? cities.map((_, i) => i)).map((start) => huntDay(cities, { memo, ...o, start })).sort((a, b) => a - b);
  const best = days[days.length - 1] ?? 0;
  return { best, median: days[Math.floor(days.length / 2)] ?? 0, worst: days[0] ?? 0, perHourBest: best / ((o.dayS ?? 86_400) / 3600) };
}

export async function huntPaceCities(/** @type {string} */ A2) {
  const { BlocksFile } = await import('../src/formats/blocksFile.js');
  const { MapsFile, LOCATION_TYPES, longitudeLatitudeToMapPixel } = await import('../src/formats/mapsFile.js');
  const { WoodsFile } = await import('../src/formats/woodsFile.js');
  const { layoutLocation } = await import('../src/world/locationLayout.js');
  const { boardTally } = await import('./boardCount.mjs');
  const { gateSeaPixel } = await import('../src/worldEvents/gateSite.js');
  const { spawnsDungeon, WORLD_SALT } = await import('../src/world/spawnedDungeons.js');
  const { TV_MOUNTAIN_CLIMATE } = await import('../src/travel/travelRoute.js');
  const bytes = (/** @type {string} */ n) => new Uint8Array(readFileSync(`${A2}/${n}`));
  const blocks = new BlocksFile(); blocks.load(bytes('BLOCKS.BSA'));
  const maps = new MapsFile(); maps.load(bytes('MAPS.BSA'), bytes('CLIMATE.PAK'), bytes('POLITIC.PAK'));
  const woods = new WoodsFile(); woods.load(bytes('WOODS.WLD'));
  const locPixels = new Set(), dungeonPixels = new Map(), towns = [];
  for (let r = 0; r < maps.regionCount; r++) {
    const region = maps.getRegion(r);
    if (!region) continue;
    for (let l = 0; l < Math.min(maps.baseLocationCount(r), region.locationCount); l++) {
      const loc = maps.getLocation(r, l);
      if (!loc?.exterior?.exteriorData) continue;
      const p = longitudeLatitudeToMapPixel(loc.mapTableData.longitude, loc.mapTableData.latitude);
      locPixels.add(`${p.x},${p.y}`);
      const lt = loc.mapTableData.locationType;
      if (loc.hasDungeon && lt !== LOCATION_TYPES.TownCity && lt !== LOCATION_TYPES.TownHamlet && lt !== LOCATION_TYPES.TownVillage) dungeonPixels.set(`${p.x},${p.y}`, String(loc.name ?? ''));
      let tally = { bounty: 0 };
      try { if (lt === LOCATION_TYPES.TownCity) tally = boardTally(layoutLocation(loc, maps, blocks, { enhanced: false, windmills: false }).blocks); } catch { }
      if (tally.bounty > 0) towns.push({ px: p.x, py: p.y });
    }
  }
  const siteOk = (/** @type {number} */ x, /** @type {number} */ y) => x > 0 && y > 0 && x < 999 && y < 499 && !locPixels.has(`${x},${y}`) && !spawnsDungeon(WORLD_SALT, x, y)
    && !gateSeaPixel(maps.getClimateIndex(x, y), woods.getHeightMapValue(x, y)) && maps.getClimateIndex(x, y) !== TV_MOUNTAIN_CLIMATE;
  return towns.map(({ px, py }) => {
    const sites = bountySites(px, py, siteOk);
    const dungeons = bountyDungeons(px, py, (x, y) => dungeonPixels.get(`${x},${y}`) || null);
    const memo = new Map();
    const targets = (/** @type {number} */ day) => {
      if (!memo.has(day)) memo.set(day, boardPostings({ day, px, py, level: 20, sites, dungeons }).map((p) => /** @type {[number, number]} */ ([p.target.px, p.target.py])));
      return memo.get(day);
    };
    return { px, py, targets };
  });
}

if (isMain(import.meta.url)) {
  const A2 = process.env.ARENA2_PATH;
  if (!A2) { console.error('ARENA2_PATH is not set - sh tools/fetch-data.sh, then point it at the arena2 folder.'); process.exit(2); }
  const cities = await huntPaceCities(A2);
  const nowMs = Date.UTC(2026, 9, 27);
  const minutes = sharedClassicMinutes(nowMs);
  const day0 = Math.floor(minutes / MINUTES_PER_DAY), phaseS = ((minutes % MINUTES_PER_DAY) / ONLINE_MINUTES_PER_MS) / 1000;
  const pace = huntPace(cities, { day0, phaseS });
  const out = { cities: cities.length, noticesADay: BOUNTIES_PER_DAY, mps: Number(HUNT_PACE_MPS.toFixed(2)), ...pace, perHourBest: Number(pace.perHourBest.toFixed(2)) };
  if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
  else console.log(`${out.cities} cities with a bounty board; the fastest legal ride ${out.mps} m/s, no time fighting.\nA UTC day's clears from each city's board: best ${out.best} (${out.perHourBest} an hour), median ${out.median}, worst ${out.worst}.`);
}
