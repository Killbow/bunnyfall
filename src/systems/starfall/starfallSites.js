// @ts-check
import { starRoll, starTimes, starSpotLocal, STAR_PER_NIGHT } from '../../net/starfall/starfallLaw.js';
import { gameDayAt } from '../../net/gateLaw.js';
import { REGION_NAMES } from '../../formats/mapsFile.js';
import { starCovenOf } from './starfallCovens.js';
import { starSiteId } from '../../world/wodShared.js';

const W = 1000;
export const STAR_APART_PX = 5;
export const STAR_DRAWS = 32;

/**
 * @typedef {{ n: number, k: number, region: number, regionName: string, coven: import('./starfallCovens.js').StarCoven,
 *   px: number, py: number, town: {name: string, px: number, py: number, region: number}|null, near: string,
 *   spot: number[], times: ReturnType<typeof starTimes> }} StarSite
 */

const apart = (a, px, py) => Math.max(Math.abs(a.px - px), Math.abs(a.py - py)) >= STAR_APART_PX;

/**
 * @param {number} n
 * @param {import('../../worldEvents/gateSite.js').GateScan} scan
 * @param {{ gateSiteOf?: (day: number) => ({px: number, py: number}|null) }} [o]
 * @returns {StarSite[]}
 */
export function findStarSites(n, scan, { gateSiteOf = () => null } = {}) {
  const coven = starCovenOf(n);
  const pixels = scan?.byRegion?.get(coven.region);
  if (!pixels?.length) return [];
  /** @type {StarSite[]} */ const out = [];
  const towns = new Set();
  for (let k = 0; k < STAR_PER_NIGHT; k++) {
    const times = starTimes(n, k);
    const gate = gateSiteOf(gameDayAt(times.fallAt));
    const fits = (id, strict) => {
      const px = id % W, py = Math.floor(id / W);
      if (gate && !apart(gate, px, py)) return false;
      if (!out.every((s) => apart(s, px, py))) return false;
      return !strict || !towns.has(scan.townAt[id]);
    };
    let pick = -1;
    for (const strict of [true, false]) {
      for (let d = 0; d < STAR_DRAWS && pick < 0; d++) {
        const id = pixels[starRoll(n, k, 100 + d + (strict ? 0 : STAR_DRAWS)) % pixels.length];
        if (fits(id, strict)) pick = id;
      }
      if (pick >= 0) break;
    }
    if (pick < 0) continue;
    const town = scan.towns[scan.townAt[pick]] ?? null;
    towns.add(scan.townAt[pick]);
    const regionName = REGION_NAMES[coven.region] ?? '';
    out.push({ n, k, region: coven.region, regionName, coven, px: pick % W, py: Math.floor(pick / W), town, near: town?.name || regionName, spot: starSpotLocal(n, k), times });
  }
  return out;
}

export const starSiteKey = (s) => starSiteId(s.px, s.py, s.n, s.k);
