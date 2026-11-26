import { WoodsFile } from '../formats/woodsFile.js';
import { buildGlobal, DeepWatersBake, PLANE_KEEP_RADIUS } from './deepWatersBake.js';
import { cachedBake, bakeCacheKey, fnv1a, rectsFingerprint, rectsLookup } from './deepWatersBakeCache.js';
import { buildDeepWatersPixel, deepWatersPixelTransfers } from './deepWatersPixel.js';
import { worldBakes } from './etherWatersBake.js';
import { etherWoods } from './ethericSea.js';


let bake = null;
let failed = null;
const waiting = [];
let etherRects = null;

globalThis.onmessage = (ev) => { handle(ev.data ?? {}); };

async function handle(m) {
  if (m.t === 'build') return build(m);
  if (m.t === 'ether') { etherRects = m.rects ?? null; return; }
  if (m.t === 'pixel') {
    if (bake) return pixel(m);
    if (failed) return globalThis.postMessage({ t: 'pixel', id: m.id, error: failed });
    waiting.push(m);
  }
}

async function build(m) {
  try {
    const woods = new WoodsFile();
    if (!woods.load(m.woodsBytes)) throw new Error('WOODS.WLD failed to load in the deep waters worker');
    const rows = m.rects ?? [];
    const key = bakeCacheKey({ woodsHash: fnv1a(m.woodsBytes), rectsHash: rectsFingerprint(rows) });
    const locationRectAt = rectsLookup(rows);
    const g = await cachedBake({ key, build: () => buildGlobal(woods, { locationRectAt }) });
    if (!g) throw new Error('deep waters bake produced nothing');
    bake = worldBakes(new DeepWatersBake({ woods, global: g, locationRectAt }), { woods: m.ether ? etherWoods(woods) : woods, ether: m.ether ? () => etherRects : null });
    // Send copies, since this worker keeps its own arrays to answer pixel jobs.
    const record = { state: g.state.slice(), classes: g.classes.slice(), partialIndex: g.partialIndex.slice(), partialBits: g.partialBits.slice(), stats: { ...g.stats, cached: !!g.cached } };
    globalThis.postMessage({ t: 'built', record }, [record.state.buffer, record.classes.buffer, record.partialIndex.buffer, record.partialBits.buffer]);
  } catch (e) {
    failed = e?.message ?? String(e);
    globalThis.postMessage({ t: 'error', message: failed });
  }
  for (const w of waiting.splice(0)) await handle(w);
}

let sinceEvict = 0;
function pixel(m) {
  try {
    if (Array.isArray(m.centre) && ++sinceEvict >= 16) { sinceEvict = 0; bake.evictOutside(m.centre[0], m.centre[1], PLANE_KEEP_RADIUS); }
    const result = buildDeepWatersPixel(m.job, bake);
    globalThis.postMessage({ t: 'pixel', id: m.id, result }, deepWatersPixelTransfers(result));
  } catch (e) {
    globalThis.postMessage({ t: 'pixel', id: m.id, error: e?.message ?? String(e) });
  }
}
