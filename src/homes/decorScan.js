// @ts-check

import { collectDecor, decorCatalogue, addDecorNature, HALL_BOARD_ENTRY } from './decorCatalogue.js';
import { addDecorMods } from './decorMods.js';
import { customModelFor, customModelNeeds, classicModelIdOf } from '../world/customModels.js';
import { BLOCK_TYPES } from '../formats/blocksFile.js';
import { GLOBAL_SCALE } from '../world/meshReader.js';
import { billboardSize } from '../world/rmbFlats.js';

/** @param {{ blocks: any, arch: any, getTexture: (archive: number) => any }} host */
export function decorScanDeps({ blocks, arch, getTexture }) {
  return {
    blocks,
    isTownBlock: (t) => t === BLOCK_TYPES.Rmb,
    isDungeonBlock: (t) => t === BLOCK_TYPES.Rdb,
    nature: true,
    mods: true,
    // The radius comes from the ARCH3D header, as the bank's house price in worldModes.js reads it.
    modelRadius: (id) => {
      const rec = arch?.getRecordIndex?.(classicModelIdOf(id));
      if (rec != null && rec >= 0) {
        const r = arch.getMesh(rec)?.radius ?? 0;
        return r > 0 ? r * GLOBAL_SCALE : null;
      }
      return standInRadius(id);
    },
    flatRadius: async (a, r) => {
      const t = await getTexture(a);
      if (!t || !(r < t.recordCount)) return null;
      const size = billboardSize(t, r);
      return Math.hypot(size.w, size.h) / 2;
    },
  };
}

export function standInRadius(id) {
  if (customModelNeeds(id).length) return null;
  const p = customModelFor(id)?.positions;
  if (!p?.length) return null;
  let r2 = 0;
  for (let i = 0; i + 2 < p.length; i += 3) r2 = Math.max(r2, p[i] * p[i] + p[i + 1] * p[i + 1] + p[i + 2] * p[i + 2]);
  return r2 > 0 ? Math.sqrt(r2) : null;
}

export const DECOR_SCAN_BLOCKS_A_STEP = 8;
export const DECOR_SCAN_MODELS_A_STEP = 32;

export function createDecorScan({ blocks, isTownBlock, isDungeonBlock = (_type) => false, nature = false, mods = false, modelRadius, flatRadius }) {
  /** @type {'blocks'|'models'|'flats'|'done'} */
  let phase = 'blocks';
  const total = Math.max(0, blocks?.count ?? 0);
  let next = 0;
  /** @type {Map<string, {model: number|null, flat: number[]|null, count: number}>} */
  const collected = new Map();
  /** @type {readonly any[]|null} */
  let entries = null;
  /** @type {any[]} */
  let models = [];
  let measured = 0;
  /** @type {Map<string, number>} */
  const radii = new Map();
  const late = [];
  const measuring = new Set();
  let lateSized = 0;

  // A piece whose size cannot be read gets no radius, so it has no price and is never offered.
  const keep = (key, r) => { if (Number.isFinite(r) && r > 0) { radii.set(key, r); if (phase === 'done') lateSized++; } };
  function measure(e) {
    if (e.model != null) { try { keep(e.key, modelRadius(e.model)); } catch { } return null; }
    measuring.add(e.key);
    return Promise.resolve().then(() => flatRadius(e.flat[0], e.flat[1])).then((r) => keep(e.key, r), () => {}).finally(() => measuring.delete(e.key));
  }

  function readBlocks(n) {
    const end = Math.min(total, next + n);
    for (; next < end; next++) {
      try {
        const type = blocks.getBlockType(next);
        if (!isTownBlock(type) && !isDungeonBlock(type)) continue;
        // Reads the classic blocks, never a world-data mod's, so mod interiors do not renumber the catalog.
        const b = blocks.readClassicBlock ? blocks.readClassicBlock(next) : blocks.getBlock(next);
        if (b) collectDecor([b], collected);
      } catch { }
    }
    if (next >= total) {
      const read = nature ? addDecorNature(collected) : collected;
      entries = Object.freeze([...decorCatalogue(mods ? addDecorMods(read) : read), HALL_BOARD_ENTRY]);
      models = entries.filter((e) => e.model != null);
      phase = 'models';
    }
  }

  function measureModels(n) {
    const end = Math.min(models.length, measured + n);
    for (; measured < end; measured++) measure(models[measured]);
    if (measured >= models.length) {
      phase = 'flats';
      Promise.all((entries ?? []).filter((e) => e.flat).map(measure)).then(() => { phase = 'done'; });
    }
  }
  function measureLate(n) {
    for (let k = 0; k < n && late.length;) {
      const e = late.shift();
      if (radii.has(e.key) || measuring.has(e.key)) continue;
      measure(e);
      if (e.model != null) k++;
    }
  }

  /** @param {{ blocksPerStep?: number, modelsPerStep?: number }} [opts] */
  function step({ blocksPerStep = DECOR_SCAN_BLOCKS_A_STEP, modelsPerStep = DECOR_SCAN_MODELS_A_STEP } = {}) {
    if (phase === 'blocks') readBlocks(blocksPerStep);
    else if (phase === 'models') measureModels(modelsPerStep);
    else if (phase === 'done') measureLate(modelsPerStep);
    return phase === 'done';
  }

  return {
    step,
    phase: () => phase,
    progress() {
      if (phase === 'done') return 1;
      if (phase === 'blocks') return total ? 0.8 * (next / total) : 0;
      if (phase === 'models') return 0.8 + 0.15 * (models.length ? measured / models.length : 1);
      return 0.95;
    },
    entries: () => entries,
    radiusOf: (entry) => (entry ? radii.get(entry.key) ?? null : null),
    lateSized: () => lateSized,
    /** @param {Iterable<string>} keys */
    remeasure(keys) {
      const want = new Set(keys);
      for (const e of entries ?? []) if (want.has(e.key) && !radii.has(e.key)) late.push(e);
    },
  };
}
