// Builds the road network from the player's own archives: MAPS.BSA for settlements, WOODS.WLD for the ground.

import { cromwarkSettlementRemoved } from './wild/cromwarkSettlements.js';
import { longitudeLatitudeToMapPixel } from '../formats/mapsFile.js';
import { MAP_WIDTH, MAP_HEIGHT } from '../formats/woodsFile.js';
import { BASE_HEIGHT_SCALE, SCALED_BEACH_ELEVATION } from './terrainSampler.js';
import { buildRoadNetwork } from './roadNetwork.js';

export const WATER_BYTE = SCALED_BEACH_ELEVATION / BASE_HEIGHT_SCALE;

export function settlementsOf(maps) {
  const out = [];
  const before = maps._lastRegion ?? -1;
  for (let r = 0; r < maps.regionCount; r++) {
    const region = maps.getRegion(r);
    if (!region || !region.mapTable) continue;
    for (const [index, row] of region.mapTable.entries()) {
      if (!row || cromwarkSettlementRemoved(row.mapId)) continue;
      const p = longitudeLatitudeToMapPixel(row.longitude, row.latitude);
      out.push({ x: p.x, y: p.y, type: row.locationType, region: r, name: region.mapNames?.[index] ?? null });
    }
  }
  if (before >= 0 && maps.loadRegion) maps.loadRegion(before);
  return out;
}

export function buildRoadsFromArchives(maps, woods, dials = {}) {
  try {
    return buildRoadsFromSettlements(settlementsOf(maps), woods, dials);
  } catch (e) {
    console.warn('[roads] no network - the world draws without roads:', e?.message ?? e);
    return null;
  }
}

export function buildRoadsFromSettlements(locations, woods, dials = {}) {
  try {
    const t0 = (globalThis.performance ?? Date).now();
    const heightAt = (x, y) => woods.getHeightMapValue(x, y);
    const isWater = (x, y) => woods.getHeightMapValue(x, y) <= WATER_BYTE;
    const net = buildRoadNetwork({ locations, heightAt, isWater, dials });
    net.stats.ms = Math.round((globalThis.performance ?? Date).now() - t0);
    net.stats.settlements = locations.length;
    return net;
  } catch (e) {
    console.warn('[roads] no network - the world draws without roads:', e?.message ?? e);
    return null;
  }
}

export const MOD_ROADS = Object.freeze({
  roads: new URL('../../vendor/roads-hazelnut/roadData.bytes', import.meta.url).href,
  tracks: new URL('../../vendor/roads-hazelnut/trackData.bytes', import.meta.url).href,
  rivers: new URL('../../vendor/roads-hazelnut/riverData.bytes', import.meta.url).href,
  streams: new URL('../../vendor/roads-hazelnut/streamData.bytes', import.meta.url).href,
});

/**
 * @param {{roads:Uint8Array, tracks:Uint8Array}} net
 * @returns {number}
 */
export function basicRoadsPathsPoint(net, x, y) {
  const i = x + y * MAP_WIDTH;
  return (net.roads[i] | net.tracks[i]) & 0xff;
}

export function waterOffPaths(net) {
  for (let i = 0; i < net.roads.length; i++) {
    const path = net.roads[i] | net.tracks[i];
    if (!path) continue;
    if (net.rivers) net.rivers[i] &= ~path;
    if (net.streams) net.streams[i] &= ~path;
  }
  return net;
}

export const MOD_ROADS_FETCH_TIMEOUT_MS = 30000;

export async function loadModRoads(fetchFn = globalThis.fetch, urls = MOD_ROADS, timeoutMs = MOD_ROADS_FETCH_TIMEOUT_MS) {
  if (!fetchFn) return null;
  try {
    const out = {};
    for (const [k, url] of Object.entries(urls)) {
      const ac = typeof globalThis.AbortController === 'function' ? new globalThis.AbortController() : null;
      let timer = null;
      const late = new Promise((_, no) => { timer = setTimeout(() => { ac?.abort(); no(new Error(`${url}: no answer in ${timeoutMs} ms`)); }, timeoutMs); });
      try {
        const r = await Promise.race([fetchFn(url, ac ? { signal: ac.signal } : undefined), late]);
        if (!r || !r.ok) return null;
        const b = new Uint8Array(await Promise.race([r.arrayBuffer(), late]));
        if (b.length !== MAP_WIDTH * MAP_HEIGHT) return null;
        out[k] = b;
      } finally { clearTimeout(timer); }
    }
    let n = 0; for (const v of out.roads) if (v) n++;
    return waterOffPaths({ ...out, source: 'basic-roads', stats: { source: 'basic-roads', roadPixels: n } });
  } catch { return null; }
}

export const MOD_ROADS_RETRY_MAX = 12;

/**
 * @param {object} [o]
 * @param {(ms: number) => Promise<void>} [o.wait]
 * @param {(tries: number, ms: number) => void} [o.onTry]
 * @returns {Promise<?object>}
 */
export async function retryModRoads({ fetchFn = globalThis.fetch, urls = MOD_ROADS, wait = (ms) => new Promise((r) => setTimeout(r, ms)), max = MOD_ROADS_RETRY_MAX, onTry = null } = {}) {
  for (let tries = 0; tries < max; tries++) {
    const ms = Math.min(60000, 5000 * 2 ** tries);
    onTry?.(tries, ms);
    await wait(ms);
    const his = await loadModRoads(fetchFn, urls);
    if (his) return his;
  }
  return null;
}
