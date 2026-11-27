// Bakes the brigandine mesh once and writes a NIF and DDS per metal from the committed FBX and paintings.
// Run with `node tools/bakeBrigandine.mjs [--fbx=<path>] [--sheets]`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readFbx } from './fbxRead.mjs';
import { bakeMesh } from './fbxMesh.mjs';
import { mipChain, writeDds } from './meshTexture.mjs';
import { meshToNif } from './nifWrite.mjs';
import { previewSheet } from './meshSheets.mjs';
import { readPng, writePng } from './pngIO.mjs';
import { isMain } from './lib/isMain.mjs';
import { BRIGANDINE_METALS } from '../src/characters/ownArmorModels.js';

export const SOURCE_FBX = 'src/assets/mw/source/Brigandine_Steel.fbx';

export const PAINTING = Object.freeze(Object.fromEntries(BRIGANDINE_METALS.map((m) => [m, `src/assets/mw/source/Brigandine_${m}.png`])));
export const SOURCE_PNG = PAINTING.Steel;

export const textureNameFor = (metal) => `brigandine_${metal.toLowerCase()}.dds`;
export const outFor = (metal) => Object.freeze({
  mesh: `src/assets/mw/meshes/brigandine_${metal.toLowerCase()}.nif`,
  texture: `src/assets/mw/textures/${textureNameFor(metal)}`,
});
export const OUT = outFor('Steel');
export const TEXTURE_NAME = textureNameFor('Steel');

export const SETTINGS = Object.freeze({
  placement: 'scene',
  // The front details sit on the scene's -Y side and Morrowind actors face +Y,
  // so the bake turns the mesh half round.
  forward: '-y',
  up: '+z',
});

const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };

export const bakeBrigandineMesh = (fbxBytes) => bakeMesh(readFbx(fbxBytes), {
  name: 'Steel Brigandine',
  placement: SETTINGS.placement, forward: SETTINGS.forward, up: SETTINGS.up,
});

function paint(mesh, metal, pngBytes, sheets) {
  const png = readPng(pngBytes);
  const dds = writeDds(mipChain({ width: png.width, height: png.height, data: png.data }));
  const named = mesh.name === `${metal} Brigandine` ? mesh : { ...mesh, name: `${metal} Brigandine` };
  const out = { metal, png, dds, nif: meshToNif(named, { texture: textureNameFor(metal), node: 'Brigandine' }), sheets: null };
  if (sheets) {
    out.sheets = { preview: writePng(previewSheet(mesh, 360, { width: png.width, height: png.height, data: png.data })) };
  }
  return out;
}

export function bakeBrigandine(fbxBytes, pngBytes, { sheets = false, metal = 'Steel' } = {}) {
  const mesh = bakeBrigandineMesh(fbxBytes);
  return { mesh, ...paint(mesh, metal, pngBytes, sheets) };
}

export function bakeBrigandineMetals(fbxBytes, pngs, { sheets = false } = {}) {
  const mesh = bakeBrigandineMesh(fbxBytes);
  return {
    mesh,
    metals: BRIGANDINE_METALS.map((metal) => {
      if (!pngs[metal]) throw new Error(`no painting for the ${metal} brigandine (${PAINTING[metal]})`);
      return paint(mesh, metal, pngs[metal], sheets);
    }),
  };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
  const fbx = opt('fbx', SOURCE_FBX);
  if (opt('png', null)) { console.error('--png is gone (MW-BRIG4): each metal\'s painting is PAINTING\'s, src/assets/mw/source/Brigandine_<Metal>.png'); process.exit(2); }
  const wantSheets = args.includes('--sheets');
  const r = bakeBrigandineMetals(readFileSync(fbx), Object.fromEntries(Object.entries(PAINTING).map(([m, p]) => [m, readFileSync(p)])), { sheets: wantSheets });
  const b = r.mesh.bake;
  console.log(fbx);
  console.log(`  ${b.polygons} polygons (${b.clipped} ear-clipped) -> ${r.mesh.indices.length / 3} triangles, placed at ${b.sceneTranslation.join(', ')}`);
  console.log(`  z ${r.mesh.bounds.min[2].toFixed(2)}..${r.mesh.bounds.max[2].toFixed(2)}`);
  for (const m of r.metals) {
    const out = outFor(m.metal);
    save(out.mesh, m.nif);
    save(out.texture, m.dds);
    console.log(`  ${m.metal.padEnd(11)} ${PAINTING[m.metal]} ${m.png.width}x${m.png.height} -> ${out.mesh}  ${m.nif.length} bytes, ${out.texture}  ${m.dds.length} bytes`);
    if (wantSheets) {
      for (const [k, bytes] of Object.entries(m.sheets)) save(`scratch/brigandine-${m.metal.toLowerCase()}-${k}.png`, bytes);
    }
  }
}
