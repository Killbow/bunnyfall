// @ts-check
// EG6c (2026-10-12; bible/11-Multiplayer/Elite-Gates.md section 11.6 - "Authored hero fragments", "One kit of mesh tools",
// "One registry of pseudo-archives"): THE HERO FRAGMENTS' MESH HALVES - the one place a baked fragment's mesh is registered,
// and the path it is laid by. Each is the JSON tools/fragBake.mjs writes beside its law half (net/eliteGates/egHeroFrags.js, the
// relay's): positions, normals and UVs in the fragment's own frame (metres, the foot of its mouth at the origin, its exits
// along +Z), a sub-mesh a record of its band's dress, and its collider's proxy.
//
// WHERE IT IS REGISTERED, decided with section 11.6:
//   - its PICTURES take no number of their own: every face wears a record of its band's dress (world/eliteGates/egBandArt.js
//     EG_DRESS - the bake refuses any other material), so it draws under its band's archive, which the one registry
//     already holds (world/eliteGates/pseudoArchives.js EG_BAND_ARCHIVES) - an authored fragment can never collide with anything;
//   - its MESH goes through the one mesh kit (world/eliteGates/meshKit.js `mesh`) into the hall's own buckets, moved to where it is
//     laid, so it packs with the hall's code-built shapes in one model (THE SWAP's slices, section 7);
//   - its LAW is net/eliteGates/egHeroFrags.js's, held to net/eliteGates/egFragLaw.js's reader.
// LAID (EG-HERO-LAY, spec law 7): world/eliteGates/egHall.js draws a hall's hero (net/eliteGates/egLaw.js's `heroes`) through egHeroFragInto into
// its circle's one mesh at the hero's origin and lays its proxy in the circle's one collider bucket (egHeroFragCollider) -
// freed with the circle; the reference (`egRefFrag`) is laid by none. Not a DFU member. Ledger A (ELITE-GATES).
import { createMeshKit } from './meshKit.js';
import { EG_BAND_ARCHIVES } from './pseudoArchives.js';
import { EG_HERO_FRAGS } from '../../net/eliteGates/egHeroFrags.js';
// The mesh halves are served files, fetched when the player enters a circle, so the game's code does not carry them.
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

/** A registry of mesh halves, by id: each beside its law half in `laws` (the same id, the same band, the same bake) - or
 *  refused, naming it. */
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
/** Fetches the mesh halves `ids` names (every one by default), each once. A failed fetch is forgotten, so the next call
 *  fetches it again.
 *  @param {string[]} [ids] */
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

/** Fragment `id`'s drawn mesh into kit `kit` (world/eliteGates/meshKit.js, or anything with its `mesh`), its origin laid at `at` (m, the
 *  frame `kit` builds in): a bucket a dress record. EG-HERO-LAY: `meshes` the registry it is read from (a test's seam). */
export function egHeroFragInto(kit, id, at = [0, 0, 0], meshes = egHeroFragRegistry()) {
  const mesh = meshes[id];
  for (const s of mesh.subMeshes) kit.mesh(s.record, mesh, { start: s.startIndex, count: s.primitiveCount, at });
  return kit;
}
/** Fragment `id` alone as renderer.createMesh's model, under its band's archive. */
export const egHeroFragModel = (id) => egHeroFragInto(createMeshKit(), id).pack(EG_BAND_ARCHIVES[EG_HERO_FRAGS[id].band]);
/** Fragment `id`'s collider proxy (section 11.6 - never the drawn mesh) as a triangle soup, its origin laid at `at` (m).
 *  EG-HERO-LAY: `meshes` the registry it is read from (a test's seam). */
export function egHeroFragCollider(id, at = [0, 0, 0], meshes = egHeroFragRegistry()) {
  const c = meshes[id].collider, out = new Float32Array(c.length);
  for (let i = 0; i < c.length; i++) out[i] = c[i] + at[i % 3];
  return out;
}
