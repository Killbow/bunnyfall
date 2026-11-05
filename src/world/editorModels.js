// BUNNYFALL: THE DUNGEON EDITOR'S OWN MODELS. The Bunnyfall Dungeon Editor (the C++ project beside this repo) builds
// models ARCH3D never had - a room of the designer's own shape, wearing Daggerfall's textures - and writes each to
// `vendor/<mod>/Models/<id>.json` (format `bunnyfall-dungeon-model/1`). Its blocks place them by that id like any
// classic model. Each file goes onto the custom model registry (world/customModels.js), asked before ARCH3D, behind
// its mod's switch.
//
// A file is the registry's own shape already, as dfMeshToModel makes it (world/meshReader.js): positions in metres in
// Unity's frame, unit normals, UVs over the named classic textures (u / width, -(v / height), wrapping), indices, and
// sub-meshes by texture with a start index and a triangle count. Its textures are Daggerfall's numbers, so a dungeon's
// texture table swaps a custom wall like a classic one. The editor makes no door planes; action doors are the block's
// (a DOR model), as classic ones are.
//
// Ids start at 7,000,001, past every ARCH3D id and every model the port registers itself.
//
// BROWSER-ONLY glob (as scenes/modWorldData.js): node tests hand `registerEditorModel` their JSON.

import { registerCustomModel } from './customModels.js';
import { modSetting } from '../systems/modSettings.js';

export const EDITOR_MODEL_FORMAT = 'bunnyfall-dungeon-model/1';
export const FIRST_EDITOR_MODEL_ID = 7000001;

const globModels = () => import.meta.glob('../../vendor/*/Models/*.json', { import: 'default' });
const vendorOf = (path) => /vendor\/([^/]+)\/Models\//.exec(path)?.[1] ?? '';

/** Why a model file cannot be used, or null when it can. */
export function editorModelProblem(json) {
  if (!json || json.format !== EDITOR_MODEL_FORMAT) return `not a ${EDITOR_MODEL_FORMAT} file`;
  if (!Number.isInteger(json.id) || json.id < FIRST_EDITOR_MODEL_ID) return `id ${json.id} is not an editor model id`;
  const { positions, normals, uvs, indices, subMeshes } = json;
  if (![positions, normals, uvs, indices, subMeshes].every(Array.isArray)) return 'a field is missing';
  const vertices = positions.length / 3;
  if (!Number.isInteger(vertices) || normals.length !== positions.length || uvs.length !== vertices * 2) return 'its vertex arrays disagree';
  if (indices.length % 3 !== 0 || indices.some((i) => !Number.isInteger(i) || i < 0 || i >= vertices)) return 'an index is out of range';
  for (const sm of subMeshes) {
    if (!Number.isInteger(sm?.textureArchive) || !Number.isInteger(sm?.textureRecord)) return 'a sub-mesh names no texture';
    if (!Number.isInteger(sm.startIndex) || !Number.isInteger(sm.primitiveCount) || sm.startIndex < 0 ||
        sm.startIndex + sm.primitiveCount * 3 > indices.length) return 'a sub-mesh runs past the indices';
  }
  return null;
}

/** The registry's model from a file (checked first). */
export function editorModelToModel(json) {
  return {
    positions: Float32Array.from(json.positions),
    normals: Float32Array.from(json.normals),
    uvs: Float32Array.from(json.uvs),
    indices: Uint32Array.from(json.indices),
    subMeshes: json.subMeshes.map(({ textureArchive, textureRecord, startIndex, primitiveCount }) => ({ textureArchive, textureRecord, startIndex, primitiveCount })),
    doors: [],
  };
}

/** One model file onto the registry, answering to `isOn`. False (and said) when the file is unusable. */
export function registerEditorModel(json, isOn = () => true) {
  const problem = editorModelProblem(json);
  if (problem) {
    console.warn(`[editor models] ${json?.id ?? '?'}: ${problem} - not loaded`);
    return false;
  }
  registerCustomModel(json.id, () => editorModelToModel(json), isOn);
  return true;
}

let _loaded = null;
/** Every vendored mod's Models/*.json, each behind its mod's Enabled. Once; resolves to how many registered. */
export function loadEditorModels() {
  _loaded ??= (async () => {
    let n = 0;
    await Promise.all(Object.entries(globModels()).map(async ([path, load]) => {
      const vendor = vendorOf(path);
      if (registerEditorModel(await load(), () => modSetting(vendor, 'Enabled') === true)) n++;
    }));
    return n;
  })();
  return _loaded;
}
