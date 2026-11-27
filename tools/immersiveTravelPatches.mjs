#!/usr/bin/env node
// Builds world-data patches for the four Immersive Travel gate blocks (WALLAA08-11.RMB) from the mod bundle.
// With an ARENA2 it diffs each file against the classic block; without one it reads the appended records alone.
// Run: node tools/immersiveTravelPatches.mjs <immersivetravel.dfmod> [arena2] [out dir].

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/isMain.mjs';
import { readUnityBundle } from '../src/formats/unityBundle.js';
import { BlocksFile } from '../src/formats/blocksFile.js';
import { PATCH_FORMAT, rebuildWorldDataPatch } from '../src/formats/worldDataPatch.js';
import { parseFullSerializerJson } from './worldDataPackBuild.mjs';
import { makePatch, formatPatch, sha256Canonical } from './worldDataPatch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const IT_GATE_BLOCKS = Object.freeze(['WALLAA08.RMB', 'WALLAA09.RMB', 'WALLAA10.RMB', 'WALLAA11.RMB']);
export const IT_APPENDED_ARRAYS = Object.freeze([
  Object.freeze(['Misc3dObjectRecords', 'NumMisc3dObjectRecords']),
  Object.freeze(['MiscFlatObjectRecords', 'NumMiscFlatObjectRecords']),
]);

// The classic reader always gives an RMB BuildingDataList 32 slots; the editor writes NumBlockDataRecords of them.
export const CLASSIC_BUILDING_SLOTS = 32;
const MODEL_SCALES = Object.freeze(['XScale', 'YScale', 'ZScale']);

export function appendedEdit(modJson) {
  const rmb = modJson?.RmbBlock;
  const header = rmb?.FldHeader;
  if (!rmb || !header) throw new Error(`immersive travel: ${modJson?.Name} is not an RMB block`);
  if (rmb.SubRecords.length !== header.NumBlockDataRecords) throw new Error(`immersive travel: ${modJson.Name} changes its subrecords - the header-count edit cannot carry it`);
  const ops = [];
  const slots = header.BuildingDataList;
  if (Array.isArray(slots)) for (let i = CLASSIC_BUILDING_SLOTS - 1; i >= slots.length; i--) ops.push(['r', ['RmbBlock', 'FldHeader', 'BuildingDataList', i]]);
  for (let i = 0; i < Math.min(header.NumMisc3dObjectRecords ?? 0, rmb.Misc3dObjectRecords?.length ?? 0); i++) {
    for (const k of MODEL_SCALES) if (k in rmb.Misc3dObjectRecords[i]) ops.push(['s', ['RmbBlock', 'Misc3dObjectRecords', i, k], rmb.Misc3dObjectRecords[i][k]]);
  }
  for (const [array, count] of IT_APPENDED_ARRAYS) {
    const list = rmb[array];
    const classic = header[count];
    if (!Array.isArray(list) || !Number.isInteger(classic) || list.length < classic) throw new Error(`immersive travel: ${modJson.Name} ${array} is shorter than its header count`);
    for (let i = classic; i < list.length; i++) ops.push(['i', ['RmbBlock', array, i], list[i]]);
  }
  return ops;
}

export function appendedPatch(modJson) {
  return {
    format: PATCH_FORMAT,
    rebuilds: `${modJson.Name}.json`,
    base: { kind: 'block', block: modJson.Name, index: modJson.Index },
    sha256: sha256Canonical(modJson),
    ops: appendedEdit(modJson),
  };
}

export function readGateBlocks(bundleBytes) {
  const bundle = readUnityBundle(bundleBytes);
  const out = new Map();
  for (const name of IT_GATE_BLOCKS) {
    const t = bundle.textAssets.find((a) => a.name === name);
    if (!t) throw new Error(`immersive travel: the bundle carries no ${name}`);
    // FullSerializer escapes NUL as \0 (WALLAA11 has one), which plain JSON.parse rejects.
    out.set(name, parseFullSerializerJson(new TextDecoder().decode(t.bytes)));
  }
  return out;
}

if (isMain(import.meta.url)) {
  const [bundlePath, arena2Arg, outArg] = process.argv.slice(2);
  if (!bundlePath) {
    console.error('usage: node tools/immersiveTravelPatches.mjs <immersivetravel.dfmod> [arena2] [out dir]');
    process.exit(1);
  }
  const arena2 = arena2Arg || process.env.ARENA2_PATH || '';
  const outDir = outArg ?? join(ROOT, 'vendor/immersive-travel/WorldDataPatches');
  mkdirSync(outDir, { recursive: true });
  const files = readGateBlocks(new Uint8Array(readFileSync(bundlePath)));
  let blocks = null;
  if (arena2 && existsSync(join(arena2, 'BLOCKS.BSA'))) {
    blocks = new BlocksFile();
    if (!blocks.load(new Uint8Array(readFileSync(join(arena2, 'BLOCKS.BSA'))))) throw new Error('BLOCKS.BSA did not load');
  }
  for (const [name, modJson] of files) {
    let patch, how;
    if (blocks) {
      patch = makePatch(blocks, name, modJson);
      how = 'diffed against BLOCKS.BSA, rebuilds the author\'s file';
      const appended = appendedPatch(modJson);
      const same = sha256Canonical(rebuildWorldDataPatch(appended, blocks)) === appended.sha256;
      how += same ? ' (the header-count edit rebuilds it too)' : ' (the header-count edit does NOT - the editor changed classic records as well)';
    } else {
      patch = appendedPatch(modJson);
      how = 'the editor\'s round trip and the records past the header counts - NOT checked against a BLOCKS.BSA';
    }
    const out = join(outDir, `${name}.json`);
    const body = formatPatch(patch);
    writeFileSync(out, body);
    console.log(`  ${name}: ${patch.ops.length} ops, ${body.length} bytes - ${how} -> ${out}`);
  }
}
