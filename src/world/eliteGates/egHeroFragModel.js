// @ts-check
import { createMeshKit } from './meshKit.js';
import { EG_BAND_ARCHIVES } from './pseudoArchives.js';
import { EG_HERO_FRAGS } from '../../net/eliteGates/egHeroFrags.js';
const EG_HERO_FRAG_FILES = Object.freeze({
  egRefFrag: new URL('../../assets/egfrags/egRefFrag.mesh.json', import.meta.url),
  egheroOssuary: new URL('../../assets/egfrags/egheroOssuary.mesh.json', import.meta.url),
  egheroMistStair: new URL('../../assets/egfrags/egheroMistStair.mesh.json', import.meta.url),
  egheroGloam: new URL('../../assets/egfrags/egheroGloam.mesh.json', import.meta.url),
  egheroEclipse: new URL('../../assets/egfrags/egheroEclipse.mesh.json', import.meta.url),
  egheroCaverns: new URL('../../assets/egfrags/egheroCaverns.mesh.json', import.meta.url),
  egheroStacks: new URL('../../assets/egfrags/egheroStacks.mesh.json', import.meta.url),
  egheroColonnade: new URL('../../assets/egfrags/egheroColonnade.mesh.json', import.meta.url),
  egheroForgeGut: new URL('../../assets/egfrags/egheroForgeGut.mesh.json', import.meta.url),
  egheroClanPit: new URL('../../assets/egfrags/egheroClanPit.mesh.json', import.meta.url),
  egheroDeepCaverns: new URL('../../assets/egfrags/egheroDeepCaverns.mesh.json', import.meta.url),
});

export function egHeroFragMeshes(meshes, laws = EG_HERO_FRAGS) {
  return Object.freeze(Object.fromEntries(meshes.map((mesh) => {
    const law = laws[mesh.id];
    if (!law || law.band !== mesh.band || law.bake.sha256 !== mesh.bake.sha256) throw new Error(`world/eliteGates/egHeroFragModel.js: ${mesh.id}'s mesh half has no law half of its bake beside it`);
    return [mesh.id, Object.freeze(mesh)];
  })));
}
/** @param {URL} url */
async function readMeshHalf(url) {
  if (url.protocol === 'file:') {
    const fsModule = 'node:fs/promises';
    const fs = await import(/* @vite-ignore */ fsModule);
    return JSON.parse(await fs.readFile(url, 'utf8'));
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url.pathname}: ${r.status}`);
  return r.json();
}
let _meshes = /** @type {Readonly<Record<string, any>>} */ (Object.freeze({}));
const _loading = new Map();
export const egHeroFragRegistry = () => _meshes;
/** @param {any[]} specs */
export const egHeroFragIdsOf = (specs) => [...new Set(specs.flatMap((s) => (s.heroes ?? []).filter((q) => !q.room).map((q) => q.id)))];
/** @param {string[]} [ids] */
export function loadEgHeroFragMeshes(ids = Object.keys(EG_HERO_FRAG_FILES)) {
  return Promise.all(ids.filter((id) => !_meshes[id] && EG_HERO_FRAG_FILES[id]).map((id) => {
    let p = _loading.get(id);
    if (!p) {
      p = readMeshHalf(EG_HERO_FRAG_FILES[id]).then((mesh) => {
        const [[, half]] = Object.entries(egHeroFragMeshes([mesh]));
        if (half.id !== id) throw new Error(`world/eliteGates/egHeroFragModel.js: ${id}'s file holds ${half.id}`);
        _meshes = Object.freeze({ ..._meshes, [id]: half });
      }).finally(() => _loading.delete(id));
      _loading.set(id, p);
    }
    return p;
  })).then(() => _meshes);
}

export function egHeroFragInto(kit, id, at = [0, 0, 0], meshes = egHeroFragRegistry()) {
  const mesh = meshes[id];
  for (const s of mesh.subMeshes) kit.mesh(s.record, mesh, { start: s.startIndex, count: s.primitiveCount, at });
  return kit;
}
export const egHeroFragModel = (id) => egHeroFragInto(createMeshKit(), id).pack(EG_BAND_ARCHIVES[EG_HERO_FRAGS[id].band]);
export function egHeroFragCollider(id, at = [0, 0, 0], meshes = egHeroFragRegistry()) {
  const c = meshes[id].collider, out = new Float32Array(c.length);
  for (let i = 0; i < c.length; i++) out[i] = c[i] + at[i % 3];
  return out;
}
