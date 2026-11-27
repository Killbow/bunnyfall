// Bakes the Morrowind-body heads and hairs (NIFs and DDSs) from the committed exports and paintings.
// Run: node tools/bakeHeads.mjs.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { readFbx } from './fbxRead.mjs';
import { bakeMesh, objectMaterials, basisMap } from './fbxMesh.mjs';
import { mipChain, writeDds } from './meshTexture.mjs';
import { meshToNif } from './nifWrite.mjs';
import { readPng } from './pngIO.mjs';
import { isMain } from './lib/isMain.mjs';
import { objectTree, BOX_SLACK } from './bakeSteelPlate.mjs';

export const SOURCES = Object.freeze({
  breton: 'src/assets/mw/source/Breton_Heads.fbx',
});

export const PAINTINGS = Object.freeze({
  breton_m_head_h04: 'src/assets/mw/source/Breton_Head_H04.png',
  breton_m_head_h0411: 'src/assets/mw/source/Breton_Head_H0411.png',
  breton_m_head_h0423: 'src/assets/mw/source/Breton_Head_H0423.png',
  breton_m_hair_widow: 'src/assets/mw/source/Breton_Hair_Widow.png',
  breton_m_hair_01: 'src/assets/mw/source/Breton_Hair_01.png',
  breton_m_hair_0111: 'src/assets/mw/source/Breton_Hair_0111.png',
});

export const textureName = (id) => `${id}.dds`;
export const meshFile = (id) => `src/assets/mw/meshes/${id}.nif`;
export const textureFile = (id) => `src/assets/mw/textures/${id}.dds`;

// A retail head's frame faces -Y, so the scene is turned half round about the crown; +Y hangs faces backwards.
export const HEAD_FORWARD = '-y';
export const HEAD_UP = '+z';

const part = (id, batch, slot, object, material, texture, box) => Object.freeze({ id, batch, slot, object, material, texture, box: Object.freeze(box) });

export const HEAD_PARTS = Object.freeze([
  part('breton_m_head_h04', 'breton', 'head', 'b_n_breton_m_hair_widow', 1, 'tx_b_n_breton_m_h04.png', [[-4.78, -8.28, -8.89], [4.78, 6.95, 7.66]]),
  part('breton_m_hair_widow', 'breton', 'hair', 'b_n_breton_m_hair_widow', 0, 'tx_b_n_breton_m_hair_widow.png', [[-7.18, -5.92, -8.71], [7.18, 10.83, 9.27]]),
  part('breton_m_head_h0411', 'breton', 'head', 'b_n_breton_m_head_05.002', 0, 'tx_b_n_breton_m_h0411.png', [[-4.78, -8.38, -8.4], [4.78, 6.95, 7.66]]),
  part('breton_m_hair_01', 'breton', 'hair', 'b_n_breton_m_head_05.002', 1, 'tx_b_n_breton_m_hair01.png', [[-6.05, -6.9, -6.94], [6.05, 8.56, 9.16]]),
  part('breton_m_head_h0423', 'breton', 'head', 'b_n_breton_m_head_05.003', 0, 'tx_b_n_breton_m_h0423.png', [[-4.78, -7.92, -9.84], [4.78, 6.95, 7.66]]),
  part('breton_m_hair_0111', 'breton', 'hair', 'b_n_breton_m_head_05.003', 1, 'tx_b_n_breton_m_hair0111.png', [[-6.96, -7.31, -6.94], [6.96, 8.56, 8.82]]),
]);

export function partFrame(mesh, toBasis = basisMap(HEAD_FORWARD, HEAD_UP)) {
  const t = toBasis(mesh.bake.sceneTranslation);
  const off = (v, k) => +(v - t[k]).toFixed(6);
  return {
    ...mesh,
    positions: mesh.positions.map((v, i) => off(v, i % 3)),
    bounds: { min: mesh.bounds.min.map(off), max: mesh.bounds.max.map(off) },
  };
}

export function partMesh(tree, p) {
  const names = objectMaterials(tree, p.object);
  if (names[p.material] !== p.texture) {
    throw new Error(`"${p.object}" wears ${JSON.stringify(names[p.material] ?? null)} in material ${p.material}, not ${p.texture} - re-read the export before baking it`);
  }
  const mesh = partFrame(bakeMesh(objectTree(tree, p.object), { name: p.id, placement: 'scene', forward: HEAD_FORWARD, up: HEAD_UP, material: p.material }));
  const off = [0, 1, 2].flatMap((k) => [Math.abs(mesh.bounds.min[k] - p.box[0][k]), Math.abs(mesh.bounds.max[k] - p.box[1][k])]);
  if (Math.max(...off) > BOX_SLACK) {
    throw new Error(`"${p.id}" stands at ${JSON.stringify(mesh.bounds)}, not where it was read (${JSON.stringify(p.box)}) - re-read the export before baking it`);
  }
  return mesh;
}

export function bakeHeads({ sources, pngs }) {
  const trees = Object.fromEntries(Object.entries(sources).map(([b, bytes]) => [b, readFbx(Buffer.from(bytes))]));
  const parts = HEAD_PARTS.map((p) => {
    if (!trees[p.batch]) throw new Error(`no export for the ${p.batch} batch (SOURCES.${p.batch})`);
    const mesh = partMesh(trees[p.batch], p);
    return { id: p.id, mesh, nif: meshToNif(mesh, { texture: textureName(p.id), node: p.id }) };
  });
  const textures = HEAD_PARTS.map((p) => {
    if (!pngs[p.id]) throw new Error(`no painting for ${p.id}`);
    const png = readPng(pngs[p.id]);
    return { id: p.id, png, dds: writeDds(mipChain({ width: png.width, height: png.height, data: png.data })) };
  });
  return { parts, textures };
}

const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };

if (isMain(import.meta.url)) {
  const missing = Object.entries(PAINTINGS).filter(([, p]) => !existsSync(p)).map(([id]) => id);
  if (missing.length) { console.error(`no painting yet for: ${missing.join(', ')}`); process.exit(1); }
  const r = bakeHeads({
    sources: Object.fromEntries(Object.entries(SOURCES).map(([b, p]) => [b, readFileSync(p)])),
    pngs: Object.fromEntries(Object.entries(PAINTINGS).map(([id, p]) => [id, readFileSync(p)])),
  });
  for (const p of r.parts) {
    save(meshFile(p.id), p.nif);
    console.log(`  ${p.id.padEnd(22)} ${String(p.mesh.indices.length / 3).padStart(5)} triangles -> ${meshFile(p.id)}  ${p.nif.length} bytes`);
  }
  for (const t of r.textures) {
    save(textureFile(t.id), t.dds);
    console.log(`  ${t.id.padEnd(22)} ${t.png.width}x${t.png.height} -> ${textureFile(t.id)}  ${t.dds.length} bytes`);
  }
}
