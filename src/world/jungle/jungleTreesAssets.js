// @ts-check
import { createLowPolyTrees } from '../../mods/lowPolyTreesAssets.js';
import { decodePng } from '../../render/textureReplacement.js';
import { readJungleSpecies, packJungleTrees, JUNGLE_SPECIES, JUNGLE_ARCHIVE, jungleRecord } from './jungleModels.js';
import { JUNGLE_PAIRS, pairFiles, pairRecord, readPair } from './jungleRoadside.js';
import { JUNGLE } from '../jungleNature.js';

export const JUNGLE_SCALE_MAX = JUNGLE.emergentScale[1];
export const JUNGLE_SUN_LIFT = 0.6;

export const JUNGLE_URLS = Object.freeze({
  'jungle_tree.obj': new URL('../../assets/jungle/source/jungle_tree.obj', import.meta.url).href,
  'jungle_tree.mtl': new URL('../../assets/jungle/source/jungle_tree.mtl', import.meta.url).href,
  'jungle_tree_252w.png': new URL('../../assets/jungle/source/jungle_tree_252w.png', import.meta.url).href,
  'jungle_tree2.obj': new URL('../../assets/jungle/source/jungle_tree2.obj', import.meta.url).href,
  'jungle_tree2.mtl': new URL('../../assets/jungle/source/jungle_tree2.mtl', import.meta.url).href,
  'jungle_tree2_252w.png': new URL('../../assets/jungle/source/jungle_tree2_252w.png', import.meta.url).href,
  'jungle_tree3.obj': new URL('../../assets/jungle/source/jungle_tree3.obj', import.meta.url).href,
  'jungle_tree3.mtl': new URL('../../assets/jungle/source/jungle_tree3.mtl', import.meta.url).href,
  'jungle_tree3_252w.png': new URL('../../assets/jungle/source/jungle_tree3_252w.png', import.meta.url).href,
  'jungle_tree4.obj': new URL('../../assets/jungle/source/jungle_tree4.obj', import.meta.url).href,
  'jungle_tree4.mtl': new URL('../../assets/jungle/source/jungle_tree4.mtl', import.meta.url).href,
  'jungle_tree4_252w.png': new URL('../../assets/jungle/source/jungle_tree4_252w.png', import.meta.url).href,
  'jungle_tree5.obj': new URL('../../assets/jungle/source/jungle_tree5.obj', import.meta.url).href,
  'jungle_tree5.mtl': new URL('../../assets/jungle/source/jungle_tree5.mtl', import.meta.url).href,
  'jungle_tree5_252w.png': new URL('../../assets/jungle/source/jungle_tree5_252w.png', import.meta.url).href,
  'pine.obj': new URL('../../assets/jungle/source/pine.obj', import.meta.url).href,
  'pine.mtl': new URL('../../assets/jungle/source/pine.mtl', import.meta.url).href,
  'pine-1.obj': new URL('../../assets/jungle/source/pine-1.obj', import.meta.url).href,
  'pine-1.mtl': new URL('../../assets/jungle/source/pine-1.mtl', import.meta.url).href,
  'pine2.obj': new URL('../../assets/jungle/source/pine2.obj', import.meta.url).href,
  'pine2.mtl': new URL('../../assets/jungle/source/pine2.mtl', import.meta.url).href,
});

const defaultFetch = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
};

async function cutPicture(bytes, decode) {
  const pic = await decode(bytes);
  const data = new Uint8Array(pic.data);
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 128 ? 255 : 0;
  return { width: pic.width, height: pic.height, data };
}

/** @param {{ renderer: any, breathe?: () => Promise<void>, fetchBytes?: (url: string) => Promise<Uint8Array>, decode?: (bytes: Uint8Array) => Promise<{width:number,height:number,data:Uint8Array}>, warn?: (m: string) => void, now?: () => number }} deps */
export function createJungleTrees({ renderer, breathe, fetchBytes = defaultFetch, decode = decodePng, warn, now }) {
  const pictures = new Map();
  let trees = null;
  const text = (bytes) => new TextDecoder().decode(bytes);
  const fetchFile = (name) => {
    const url = JUNGLE_URLS[name];
    if (!url) throw new Error(`the jungle names a file it does not carry: ${name}`);
    return fetchBytes(url);
  };
  const door = createLowPolyTrees({
    renderer, breathe, warn, now, slot: 1, scaleMax: JUNGLE_SCALE_MAX, label: 'bantha-jungle', sunLift: JUNGLE_SUN_LIFT,
    treeSet: {
      async load() {
        const read = (f) => Promise.all([fetchFile(f.obj), fetchFile(f.mtl)]).then(([obj, mtl]) => ({ obj: text(obj), mtl: text(mtl) }));
        // Each pair is fetched and read on its own, with its own breath, so one failing file cannot fail the whole
        // door.
        const [sources, fetched] = await Promise.all([
          Promise.all(JUNGLE_SPECIES.map((s) => read({ obj: `${s.file}.obj`, mtl: `${s.file}.mtl` }))),
          Promise.allSettled(JUNGLE_PAIRS.map((p) => read(pairFiles(p)))),
        ]);
        const species = readJungleSpecies(sources), low = species.meshes.map((m) => m.min[1]), halves = [];
        for (const [k, p] of JUNGLE_PAIRS.entries()) {
          if (breathe) await breathe();
          const f = fetched[k];
          try {
            if (f.status !== 'fulfilled') throw f.reason;
            readPair(f.value.obj, f.value.mtl, p, species.pictures, low).halves.forEach((mesh, side) => halves.push({ record: pairRecord(p, side), mesh }));
          } catch (e) {
            console.warn(`[trees] bantha-jungle: the roadside pair ${p.file} will not read: ${e?.message ?? e}`);
          }
        }
        if (breathe) await breathe();
        trees = packJungleTrees(species, halves);
        await Promise.all(trees.pictures.map(async (name) => { pictures.set(name, await fetchFile(name)); }));
        return trees;
      },
      async picture(atlas) {
        const name = trees?.atlases[atlas]?.picture;
        const bytes = name ? pictures.get(name) : null;
        return bytes ? cutPicture(bytes, decode) : null;
      },
    },
  });
  const api = Object.create(door);
  api.proto = (species) => door.proto(JUNGLE_ARCHIVE, jungleRecord(JUNGLE_SPECIES[species]));
  api.pairProto = (kind, side) => door.proto(JUNGLE_ARCHIVE, pairRecord(JUNGLE_PAIRS[kind], side));
  return api;
}
