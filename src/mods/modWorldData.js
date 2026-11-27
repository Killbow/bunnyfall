// The mod world-data loader: a vendored mod's WorldData/*.json into the world-data door.
// loadModWorldData() reads them all once before the first region loads, so the readers can ask synchronously.

import { registerWorldDataAsset, registerWorldDataPack, installWorldDataReplacement, boundWorldDataBlocks, quietLocationOverrides, latchWorldDataDoor, worldDataDoorOpen } from '../formats/worldDataReplacement.js';
import { rebuildWorldDataPatch, canonicalSha256 } from '../formats/worldDataPatch.js';
import { openWorldDataPack, packFileSha256, readPackText } from '../formats/worldDataPack.js';
import { modSetting, latchModLoaded, modLatchedOn } from './modSettings.js';
import { configureLayoutPins, vendorsPinnedIn } from '../world/layoutPins.js';
import { installTownStandIns } from '../world/townStandIns.js';
import { installArena } from '../world/arenaCity.js';
import { loadEditorModels } from '../world/editorModels.js';
import { installImmersiveTravelGates } from '../world/immersiveTravelGates.js';
import { IMMERSIVE_TRAVEL_VENDOR, immersiveTravelLoaded } from '../travel/immersiveTravel.js';
import { afterFirstFrame } from '../systems/afterFirstFrame.js';

const globFiles = () => import.meta.glob('../../vendor/*/WorldData/*.json', { import: 'default' });
const globPatches = () => import.meta.glob('../../vendor/*/WorldDataPatches/*.json', { import: 'default' });
const globPacks = () => import.meta.glob('../../vendor/*/WorldDataPack/*.pack.json.gz', { eager: true, query: '?url', import: 'default' });
const vendorOf = (path) => /vendor\/([^/]+)\/WorldData(?:Patches|Pack)?\//.exec(path)?.[1] ?? '';
const baseName = (path) => path.split('/').pop();

export const WORLD_DATA_PRIORITY = Object.freeze({ 'beautiful-villages': 10, 'beautiful-cities': 20 });

let _loaded = null;
const _packs = new Map();
export async function loadModWorldData() {
  if (_loaded) return _loaded;
  _loaded = (async () => {
    installWorldDataReplacement();
    await installArena();
    await loadEditorModels();
    const door = latchWorldDataDoor();
    let n = 0;
    await Promise.all(Object.entries(globFiles()).map(async ([path, load]) => {
      const vendor = vendorOf(path);
      const json = await load();
      if (registerWorldDataAsset(baseName(path), json, () => modSetting(vendor, 'Enabled') === true)) n++;
    }));
    const itPatches = [], itOwn = [];
    await Promise.all(Object.entries(globPatches()).map(async ([path, load]) => {
      const vendor = vendorOf(path);
      const patch = await load();
      const onServed = vendor === 'immersive-travel' ? (json) => { itPatches.push(patch); itOwn.push(json); } : null;
      const isOn = vendor === IMMERSIVE_TRAVEL_VENDOR ? immersiveTravelLoaded : () => modSetting(vendor, 'Enabled') === true;
      if (await registerWorldDataPatch(patch, isOn, { onServed })) n++;
    }));
    try { installImmersiveTravelGates(itPatches, itOwn, immersiveTravelLoaded); } catch (e) { console.error(`[worlddata] immersive travel's gate layer: ${e?.message ?? e}`); }
    configureLayoutPins({ vendorOn: (v) => modLatchedOn(v) === true, vendorVersion: (v) => _packs.get(v)?.mod?.version ?? '' });
    const counts = await Promise.all(Object.entries(globPacks()).map(async ([path, url]) => {
      const vendor = vendorOf(path);
      let on = false;
      try { on = modSetting(vendor, 'Enabled') === true; } catch { on = false; }
      const got = on && door ? await loadPackFrom(vendor, url, () => true) : 0;
      latchModLoaded(vendor, got > 0);
      if (on && door && !got) _missing.add(vendor);
      return got;
    }));
    return n + counts.reduce((a, b) => a + b, 0);
  })();
  return _loaded;
}

export async function ensureWorldDataPack(vendor) {
  if (!worldDataDoorOpen()) return false;
  if (_packs.has(vendor)) return true;
  const entry = Object.entries(globPacks()).find(([path]) => vendorOf(path) === vendor);
  if (!entry) return false;
  if (!_pending.has(vendor)) _pending.set(vendor, loadPackFrom(vendor, entry[1], () => false).finally(() => _pending.delete(vendor)));
  return (await _pending.get(vendor)) > 0;
}
const _pending = new Map();

const townPacksLive = () => { const pinned = vendorsPinnedIn(); return [..._packs.keys()].some((v) => modLatchedOn(v) === true || pinned.has(v)); };

const _missing = new Set();
export const worldDataPacksMissing = () => [..._missing];

export const loadedWorldDataPacks = () => new Map(_packs);

export const PACK_FETCH_TIMEOUT_MS = 120000;
async function loadPackFrom(vendor, url, isOn) {
  const blocks = boundWorldDataBlocks();
  if (!blocks) { console.warn(`[worlddata] ${vendor}: no BLOCKS.BSA bound - pack not opened`); return 0; }
  try {
    const res = await fetch(url, typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(PACK_FETCH_TIMEOUT_MS) } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await readPackText(new Uint8Array(await res.arrayBuffer()));
    const pack = openWorldDataPack(JSON.parse(text), { blocks, onRebuilt: spotCheck(vendor) });
    _packs.set(vendor, pack);
    quietLocationOverrides(true);
    const n = registerWorldDataPack(pack, isOn, { priority: WORLD_DATA_PRIORITY[vendor] ?? 0 });
    installTownStandIns(townPacksLive);
    console.log(`[worlddata] ${vendor}: ${n} files on the door (${pack.mod?.title ?? vendor} ${pack.mod?.version ?? ''})`);
    return n;
  } catch (e) {
    console.error(`[worlddata] ${vendor}: the pack did not load (${e?.message ?? e}) - its towns stand classic`);
    return 0;
  }
}

function spotCheck(vendor) {
  const queue = [];
  let differ = 0, checked = 0, running = false, locations = 0, blocks = 0;
  const pump = async () => {
    running = true;
    while (queue.length) {
      const [name, json, want] = queue.shift();
      try { if ((await packFileSha256(json)) !== want) differ++; } catch { }
      checked++;
      await new Promise((r) => setTimeout(r, 0));
    }
    running = false;
    if (differ) console.warn(`[worlddata] ${vendor}: ${differ} of ${checked} checked files rebuilt from your game files differ from the author's - served as rebuilt`);
  };
  return (name, json, want) => {
    if (name.startsWith('location-') && (locations++ % 64) !== 0) return;
    if (!name.startsWith('location-') && (blocks++ % 8) !== 0) return;
    queue.push([name, json, want]);
    if (!running) { running = true; afterFirstFrame(pump); }
  };
}

/**
 * @returns {Promise<boolean>}
 */
export async function registerWorldDataPatch(patch, isOn, { onServed = null } = {}) {
  const blocks = boundWorldDataBlocks();
  if (!blocks) { console.warn(`[worlddata] ${patch?.rebuilds}: no BLOCKS.BSA bound - patch not rebuilt`); return false; }
  let json;
  try { json = rebuildWorldDataPatch(patch, blocks); } catch (e) { console.error(`[worlddata] ${patch?.rebuilds}: ${e?.message ?? e}`); return false; }
  const sha = await canonicalSha256(json);
  if (sha !== patch.sha256) console.warn(`[worlddata] ${patch.rebuilds}: rebuilt from this BLOCKS.BSA, but not to the author's file (sha256 ${sha.slice(0, 12)}, the patch records ${String(patch.sha256).slice(0, 12)})`);
  const ok = registerWorldDataAsset(patch.rebuilds, json, isOn);
  if (ok) onServed?.(json);
  return ok;
}
