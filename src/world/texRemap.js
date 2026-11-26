// The draw-time texture remap, in one place: hosts remap a mesh's textures without touching its UVs.
// Pixels come from the swapped archive and the UVs stay the original, so the swap is a table drawMesh uses.
// The record count check is load-bearing: a swapped archive can be short of the original record.

const remapLaws = new WeakMap();
/**
 * @param {Map<string,string>} texRemap
 * @param {string} law
 * @returns {Map<string,string>}
 */
export function markRemapLaw(texRemap, law) {
  if (texRemap && typeof texRemap === 'object') remapLaws.set(texRemap, String(law));
  return texRemap;
}
/**
 * @param {any} texRemap
 * @returns {string|null}
 */
export function remapLawOf(texRemap) {
  return texRemap && typeof texRemap === 'object' ? remapLaws.get(texRemap) ?? null : null;
}

const recipes = new WeakMap();
export const remapAsked = (texRemap) => (recipes.get(texRemap)?.size ?? 0) > 0;

/**
 * @param {Array<{textureArchive:number, textureRecord:number}>|undefined} subMeshes
 * @param {Map<string,string>} texRemap
 * @param {(archive:number, record:number) => number} remapArchive
 * @param {{getTexture: (a:number)=>Promise<any>, uploadRecord: (a:number,r:number)=>void}} deps
 * @param {any} [lawKey]
 */
export async function remapSubMeshes(subMeshes, texRemap, remapArchive, { getTexture, uploadRecord }, lawKey = null) {
  if (lawKey !== null && subMeshes) {
    let recipe = recipes.get(texRemap);
    if (!recipe) recipes.set(texRemap, (recipe = new Map()));
    let asked = recipe.get(lawKey);
    if (!asked) recipe.set(lawKey, (asked = new Set()));
    asked.add(subMeshes);
  }
  const asked = new Set();
  for (const sm of subMeshes ?? []) {
    const swapped = remapArchive(sm.textureArchive, sm.textureRecord);
    if (swapped === sm.textureArchive || texRemap.has(`${sm.textureArchive}_${sm.textureRecord}`) || asked.has(swapped)) continue;
    asked.add(swapped);
    getTexture(swapped).catch(() => {});
  }
  for (const sm of subMeshes ?? []) {
    const swapped = remapArchive(sm.textureArchive, sm.textureRecord);
    if (swapped === sm.textureArchive) continue;
    const key = `${sm.textureArchive}_${sm.textureRecord}`;
    if (texRemap.has(key)) continue;
    const t = await getTexture(swapped);
    if (sm.textureRecord >= t.recordCount) continue;
    uploadRecord(swapped, sm.textureRecord, { opaque: true });
    texRemap.set(key, `${swapped}_${sm.textureRecord}`);
  }
}

/**
 * @param {Map<string,string>} texRemap
 * @param {string} law
 * @param {(lawKey: any) => (archive: number, record: number) => number} lawOf
 * @param {{getTexture: (a:number)=>Promise<any>, uploadRecord: (a:number,r:number)=>void}} deps
 * @param {Map<string,string>|null} [next]
 * @returns {Promise<Map<string,string>>}
 */
export async function reskinRemap(texRemap, law, lawOf, deps, next = null) {
  const out = next ?? markRemapLaw(new Map(), law);
  for (let owed = true; owed;) {
    owed = false;
    for (const [lawKey, asked] of recipes.get(texRemap) ?? []) {
      const had = recipes.get(out)?.get(lawKey);
      for (const subMeshes of asked) {
        if (had?.has(subMeshes)) continue;
        owed = true;
        await remapSubMeshes(subMeshes, out, lawOf(lawKey), deps, lawKey);
      }
    }
  }
  return out;
}
