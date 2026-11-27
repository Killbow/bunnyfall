// Bakes the cloak's NIF and DDS for each painting from the committed export and the retail skeleton.
// Run with `node tools/bakeCloak.mjs`.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { readFbx } from './fbxRead.mjs';
import { mipChain, writeDds } from './meshTexture.mjs';
import { skinnedMeshesToNif } from './nifWrite.mjs';
import { loopSubdivide } from './meshSubdivide.mjs';
import { readPng } from './pngIO.mjs';
import { isMain } from './lib/isMain.mjs';
import { RETAIL_SKELETON, plateBind, bakeObject } from './bakeSteelPlate.mjs';
import { CLOAK_PAINTINGS, cloakModel } from '../src/characters/ownClothingModels.js';

export const SOURCE = 'src/assets/mw/source/Cloak.fbx';
export const CLOAK_OBJECT = 'Cube.020 Remeshed.001';
export const CLOAK_BOX = Object.freeze([Object.freeze([-23.64, -21.66, 29.28]), Object.freeze([25.85, -1.35, 117.56])]);
export const CLOAK_SUBDIVISIONS = 2;

export const PAINTING = Object.freeze(Object.fromEntries(CLOAK_PAINTINGS.map((p) => [p, `src/assets/mw/source/Cloak_${p.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('_')}.png`])));

export const textureName = (painting) => `cloak_${painting}.dds`;
export const meshFile = (painting) => `src/assets/mw/meshes/${cloakModel(painting)}`;
export const textureFile = (painting) => `src/assets/mw/textures/${textureName(painting)}`;

// Every vertex is weighted to this one bone. It stays a skinned NIF because the retail bind
// carries this bone's frame and not the Chest node's.
export const CHEST_BONE = 'Bip01 Spine2';
export const CLOAK_RIG = Object.freeze({ shape: 'Tri Cloak', bones: Object.freeze([CHEST_BONE]) });

export function cloakRig(tree, bind) {
  const mesh = loopSubdivide(bakeObject(tree, CLOAK_OBJECT, CLOAK_BOX), CLOAK_SUBDIVISIONS);
  if (!bind.get(CHEST_BONE)) throw new Error(`no ${CHEST_BONE} in the skeleton to hang the cloak from`);
  const weights = Array.from({ length: mesh.positions.length / 3 }, () => [[CHEST_BONE, 1]]);
  return { mesh, weights, bones: CLOAK_RIG.bones.map((name) => ({ name, bind: bind.get(name) })) };
}

export function bakeCloak({ source, pngs, skeleton }) {
  if (!skeleton) throw new Error('no skeleton to skin the cloak in - the bake reads its bind (RETAIL_SKELETON)');
  const { mesh, weights, bones } = cloakRig(readFbx(Buffer.from(source)), plateBind(skeleton));
  const paintings = CLOAK_PAINTINGS.map((painting) => {
    if (!pngs[painting]) throw new Error(`no painting for the ${painting} cloak (${PAINTING[painting]})`);
    const png = readPng(pngs[painting]);
    const nif = skinnedMeshesToNif([{ mesh, texture: textureName(painting), name: `${CLOAK_RIG.shape} 0`, weights }], { node: 'Cloak', bones });
    return { painting, png, dds: writeDds(mipChain({ width: png.width, height: png.height, data: png.data })), nif };
  });
  return { mesh, weights, paintings };
}

const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };

if (isMain(import.meta.url)) {
  const missing = Object.entries(PAINTING).filter(([, p]) => !existsSync(p)).map(([t]) => t);
  if (missing.length) { console.error(`no painting yet for: ${missing.join(', ')}`); process.exit(1); }
  const r = bakeCloak({
    source: readFileSync(SOURCE),
    pngs: Object.fromEntries(Object.entries(PAINTING).map(([t, p]) => [t, readFileSync(p)])),
    skeleton: readFileSync(RETAIL_SKELETON),
  });
  console.log(`${SOURCE}: ${r.mesh.indices.length / 3} triangles, ${r.mesh.positions.length / 3} vertices`);
  for (const p of r.paintings) {
    save(meshFile(p.painting), p.nif);
    save(textureFile(p.painting), p.dds);
    console.log(`  ${p.painting.padEnd(12)} ${p.png.width}x${p.png.height} -> ${meshFile(p.painting)} ${p.nif.length} bytes, ${textureFile(p.painting)} ${p.dds.length} bytes`);
  }
}
