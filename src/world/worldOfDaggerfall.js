// World of Daggerfall as the streaming host runs it.

import { modSetting } from '../mods/modSettings.js';
import { loadLocationPrefab, validateValue } from './wodLocationData.js';
import { decodeRegionPack } from './wodLocationPack.js';
import {
  LocationSession, pickLocations, placeObjects, WOD_AWAKE_REGION, WOD_REFUSED_REGION,
} from './wodLocationLoader.js';
import { classifyObject, objectMatrix, objectNormalMatrix } from './wodLocationObjects.js';

export const WOD_VENDOR = 'world-of-daggerfall';
export const wodOn = () => !!modSetting(WOD_VENDOR, 'Enabled');
export const wodMountainsOn = () => !!modSetting(WOD_VENDOR, 'Mountains');

const IN_BROWSER = typeof window !== 'undefined';
const PACK_URLS = IN_BROWSER
  ? import.meta.glob('../../vendor/world-of-daggerfall/Locations/*.bin', { eager: true, query: '?url', import: 'default' })
  : {};
const PREFAB_TEXT = IN_BROWSER
  ? import.meta.glob('../../vendor/world-of-daggerfall/LocationPrefab/*.txt', { query: '?raw', import: 'default' })
  : {};

const baseName = (p) => p.split('/').pop();

export const WOD_PACK_STALL_MS = 15000;
export const WOD_PACK_ATTEMPTS = 3;

/**
 * @param {string} url
 * @param {{fetchFn?:typeof fetch, stallMs?:number, attempts?:number, sleep?:(ms:number) => Promise<void>}} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function fetchPackBytes(url, { fetchFn = globalThis.fetch, stallMs = WOD_PACK_STALL_MS, attempts = WOD_PACK_ATTEMPTS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last = null;
  for (let a = 0; a < attempts; a++) {
    if (a) await sleep(1000 * a);
    const ctl = new globalThis.AbortController();
    let timer = null;
    const poke = () => { clearTimeout(timer); timer = setTimeout(() => ctl.abort(new Error(`no byte in ${stallMs} ms`)), stallMs); };
    try {
      poke();
      const r = await fetchFn(url, { signal: ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const reader = r.body?.getReader?.();
      if (!reader) return new Uint8Array(await r.arrayBuffer());
      const parts = [];
      let n = 0;
      for (;;) {
        poke();
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        n += value.length;
      }
      const out = new Uint8Array(n);
      let o = 0;
      for (const part of parts) { out.set(part, o); o += part.length; }
      return out;
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last ?? new Error('no attempt made');
}

export const browserWodSources = Object.freeze({
  regions: () => Object.keys(PACK_URLS).map((p) => Number(baseName(p).replace(/\.bin$/, ''))).sort((a, b) => a - b),
  pack: async (region) => {
    const url = Object.entries(PACK_URLS).find(([p]) => baseName(p) === `${region}.bin`)?.[1];
    if (!url) return null;
    try { return await fetchPackBytes(url); } catch (e) {
      throw new Error(`World of Daggerfall: region ${region} pack: ${e?.message ?? e}`);
    }
  },
  prefabs: async () => {
    const out = new Map();
    await Promise.all(Object.entries(PREFAB_TEXT).map(async ([p, load]) => {
      out.set(baseName(p).replace(/\.txt$/, ''), await load().catch(() => null));
    }));
    return out;
  },
});

export const WOD_RETRY_MAX = 12;
const FAILED = Symbol('failed');

const WOD_MAP_W = 1000, WOD_MAP_H = 500;
export const WOD_MOUNTAIN_PREFAB = /^WOD_Mountain_/;

export class WodWorld {
  /**
   * @param {{regions:() => number[], pack:(r:number) => Promise<?Uint8Array>,
   *   prefabs:() => Promise<Map<string,?string>>}} sources
   * @param {{online?:boolean, warn?:(m:string) => void, schedule?:(fn:() => void, ms:number) => void}} [opts]
   */
  constructor(sources, { online = false, mountains = false, warn = (m) => console.warn(m), schedule = (fn, ms) => { setTimeout(fn, ms); } } = {}) {
    this.sources = sources;
    this.online = online;
    this.mountains = !!mountains;
    this.warn = warn;
    this.session = new LocationSession();
    this.prefabs = new Map();
    this._chain = Promise.resolve();
    this._announced = new Set();
    this._lastRegion = WOD_AWAKE_REGION;
    this._opened = null;
    this._awake = false;
    this._early = [];
    this._order = [];
    this._bytes = new Map();
    this._schedule = schedule;
    /** @type {?(region:number, pixelKeys:Set<string>) => void} */
    this.onLate = null;
  }

  open() {
    this._opened ??= (async () => {
      const texts = await this.sources.prefabs();
      for (const [name, text] of texts) {
        if (text == null) { this.warn(`[wod] prefab ${name} did not load`); this.prefabs.set(name, null); continue; }
        try { this.prefabs.set(name, loadLocationPrefab(text)); } catch (e) {
          this.warn(`[wod] prefab ${name} failed to read: ${e?.message ?? e}`);
          this.prefabs.set(name, null);
        }
      }
      if (this.online) {
        const order = [WOD_AWAKE_REGION, ...this.sources.regions().filter((r) => r !== WOD_AWAKE_REGION)];
        for (const r of order) this._announce(r);
      } else {
        this._announce(WOD_AWAKE_REGION);
      }
      this._awake = true;
      for (const r of this._early.splice(0)) this._announce(r);
      await this._chain;
    })();
    return this._opened;
  }

  _announce(region) {
    if (this._announced.has(region)) return;
    this._announced.add(region);
    this._order.push(region);
    // Fetch now, append in order: a later region's bytes may land first.
    const bytes = this.sources.pack(region).catch((e) => {
      this.warn(`[wod] region ${region} did not load: ${e?.message ?? e}`);
      return FAILED;
    });
    this._chain = this._chain.then(async () => {
      const b = await bytes;
      if (b === FAILED) { this._retryLater(region, 0); return; }
      if (!b) return;
      await new Promise((r) => setTimeout(r, 0));
      try { this.session.appendRegion(region, decodeRegionPack(b)); this._bytes.set(region, b); } catch (e) {
        this.warn(`[wod] region ${region} did not read: ${e?.message ?? e}`);
        this._retryLater(region, 0);
      }
    });
  }

  _retryLater(region, tries) {
    if (tries >= WOD_RETRY_MAX) {
      this.warn(`[wod] region ${region} gave up after ${tries} more tries - its sites stay unstood for this page`);
      return;
    }
    this._schedule(() => {
      this.sources.pack(region).then(
        (b) => { if (b) this._chain = this._chain.then(() => this._landLate(region, b, tries + 1)); },
        () => this._retryLater(region, tries + 1));
    }, Math.min(60000, 5000 * 2 ** tries));
  }

  async _landLate(region, b, tries) {
    let pack;
    try { pack = decodeRegionPack(b); } catch (e) {
      this.warn(`[wod] region ${region} did not read: ${e?.message ?? e}`);
      this._retryLater(region, tries);
      return;
    }
    this._bytes.set(region, b);
    const session = new LocationSession();
    for (const r of this._order) {
      const rb = this._bytes.get(r);
      if (!rb) continue;
      await new Promise((res) => setTimeout(res, 0));
      session.appendRegion(r, r === region ? pack : decodeRegionPack(rb));
    }
    this.session = session;
    const keys = new Set();
    for (let i = 0; i < pack.count; i++) keys.add(`${pack.worldX[i]},${pack.worldY[i]}`);
    this.warn(`[wod] region ${region} landed late - the list is in its order again (${keys.size} pixel(s) named)`);
    this.onLate?.(region, keys);
  }

  noteRegion(region) {
    if (region === this._lastRegion) return;
    this._lastRegion = region;
    if (region === WOD_REFUSED_REGION) return;
    if (this.online) return;
    if (!this._awake) { this._early.push(region); return; }
    this._announce(region);
  }

  settle() { return this._chain; }

  /**
   * @param {{mapPixelX:number, mapPixelY:number, hasLocation:boolean,
   *   worldHeight:number, regionIndex?:number}} tile
   * @param {?(x:number, y:number) => number} pathsPoint
   * @param {?(prefabName:string, prefab:object, rect:object) => boolean} siteClear
   */
  picksFor(tile, pathsPoint = null, siteClear = null) {
    const session = this.session;
    const prefabOf = this.mountains ? (name) => this.prefabs.get(name) ?? null : (name) => (WOD_MOUNTAIN_PREFAB.test(name ?? '') ? null : this.prefabs.get(name) ?? null);
    return pickLocations(tile, session, prefabOf, pathsPoint, siteClear)
      .map((pick) => ({ ...pick, locationID: session.locationID[pick.index], name: session.name[pick.index], prefabName: session.prefab[pick.index] }));
  }

  /**
   * @param {Array<object>} picks
   * @param {number[]} averages
   */
  mountainPixels() {
    const s = this.session;
    if (this._mountains && this._mountains.session === s && this._mountains.count === s.count) return this._mountains.table;
    const table = new Uint8Array(WOD_MAP_W * WOD_MAP_H);
    for (let i = 0; i < s.count; i++) {
      if (!this.mountains) break;
      if (!WOD_MOUNTAIN_PREFAB.test(s.prefab[i] ?? '')) continue;
      const x = s.worldX[i], y = s.worldY[i];
      if (x >= 0 && y >= 0 && x < WOD_MAP_W && y < WOD_MAP_H) table[x + y * WOD_MAP_W] = 1;
    }
    this._mountains = { session: s, count: s.count, table };
    return table;
  }

  placements(picks, averages) {
    const out = { models: [], flats: [], lights: [], animals: [], spawners: [], stopped: false };
    picks.forEach((pick, i) => {
      if (out.stopped) return;
      for (const { obj, pos } of placeObjects(pick, averages[i], validateValue)) {
        const c = classifyObject(obj);
        if (c.kind === 'model') {
          if (c.modelId == null) { out.stopped = true; return; }
          out.models.push({
            modelId: c.modelId, matrix: objectMatrix(pos, obj.rot, obj.scale),
            normalMatrix: objectNormalMatrix(obj.rot, obj.scale), objectID: obj.objectID, pick: i,
          });
          continue;
        }
        const flat = { archive: c.archive, record: c.record, base: pos, scale: obj.scale };
        if (c.visible) out.flats.push(flat);
        if (c.light) out.lights.push(flat);
        if (c.animal) out.animals.push(flat);
        for (const s of c.spawners) {
          out.spawners.push({
            ...s, archive: c.archive, record: c.record, base: pos, scaleY: obj.scale.y, treasure: c.treasure,
            locationID: pick.locationID, objectID: obj.objectID,
          });
        }
      }
    });
    return out;
  }
}

/**
 * @param {number} count
 * @param {number} nPlayer
 * @param {Float32Array} selColors
 * @param {ArrayLike<number>} shared
 * @returns {Float32Array}
 */
export function wodLightColors(count, nPlayer, selColors, shared) {
  const out = new Float32Array(count * 3);
  const lead = Math.min(nPlayer, count);
  for (let i = 0; i < lead; i++) { out[i * 3] = shared[0]; out[i * 3 + 1] = shared[1]; out[i * 3 + 2] = shared[2]; }
  out.set(selColors.subarray(0, (count - lead) * 3), lead * 3);
  return out;
}

let _world = null;
export function openWodWorld({ online = false, sources = browserWodSources, mountains = wodMountainsOn() } = {}) {
  if (!_world || _world.online !== online || _world.mountains !== !!mountains) _world = new WodWorld(sources, { online, mountains });
  return _world;
}
