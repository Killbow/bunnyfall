// Reads `bunnyfall-dungeon-model/1` files from the external dungeon editor, so the format must stay in sync with
// it. Ids start at 7,000,001 to stay clear of every ARCH3D and built-in model id.

import { registerCustomModel } from './customModels.js';
import { modSetting } from '../mods/modSettings.js';

export const EDITOR_MODEL_FORMAT = 'bunnyfall-dungeon-model/1';
export const FIRST_EDITOR_MODEL_ID = 7000001;

// The seven-digit name pattern skips Models files from other mods.
const globModels = () => import.meta.glob('../../vendor/*/Models/[0-9][0-9][0-9][0-9][0-9][0-9][0-9]*.json', { import: 'default' });
const vendorOf = (path) => /vendor\/([^/]+)\/Models\//.exec(path)?.[1] ?? '';

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
