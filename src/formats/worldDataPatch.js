
import { blockToDfuJson, buildingToDfuJson, patchJson, canonicalJson, jsonAt } from './worldDataJson.js';

export const PATCH_FORMAT = 'dfe-worlddata-patch/1';

/**
 * @param {object} patch
 * @param {{ getBlockName(i:number):string|null, readClassicBlock(i:number):object|null }} blocksFile
 * @returns {object}
 */
export function rebuildWorldDataPatch(patch, blocksFile) {
  if (patch?.format !== PATCH_FORMAT) throw new Error(`world-data patch: ${patch?.rebuilds ?? '?'} is not ${PATCH_FORMAT}`);
  const { base } = patch;
  const docs = new Map();
  const classicJson = (index, name) => {
    if (!docs.has(index)) {
      const got = blocksFile.getBlockName(index);
      if (name && got !== name) throw new Error(`world-data patch: ${patch.rebuilds} wants ${name} at block ${index}, BLOCKS.BSA has ${got}`);
      const b = blocksFile.readClassicBlock(index);
      if (!b) throw new Error(`world-data patch: block ${index} did not read`);
      docs.set(index, b);
    }
    return docs.get(index);
  };
  const dfBlock = classicJson(base.index, base.block);
  const start = base.kind === 'building' ? buildingToDfuJson(dfBlock, base.record) : blockToDfuJson(dfBlock);
  const serialised = new Map();
  const resolve = (ref) => {
    if (!serialised.has(ref.block)) serialised.set(ref.block, blockToDfuJson(classicJson(ref.block, null)));
    return jsonAt(serialised.get(ref.block), ref.path);
  };
  return patchJson(start, patch.ops, resolve);
}

export async function canonicalSha256(json) {
  const bytes = new TextEncoder().encode(canonicalJson(json));
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('sha256 needs WebCrypto (crypto.subtle): a secure context - https, or localhost');
  const d = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
