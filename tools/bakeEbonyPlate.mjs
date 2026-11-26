// Bakes the ebony plate set's NIFs and DDSs from the committed export, its seven paintings,
// and the retail skeleton.
// Run with `node tools/bakeEbonyPlate.mjs`.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { readFbx } from './fbxRead.mjs';
import { mipChain, writeDds } from './meshTexture.mjs';
import { skinnedMeshesToNif } from './nifWrite.mjs';
import { jointWeights } from './skinWeights.mjs';
import { readPng } from './pngIO.mjs';
import { isMain } from './lib/isMain.mjs';
import { PLATE_RIG, RETAIL_SKELETON, plateBind, rigSegments, bakeObject, liftMesh } from './bakeSteelPlate.mjs';

export const SOURCE = 'src/assets/mw/source/Ebony_Plate.fbx';

export const TEXTURES = Object.freeze({
  cuirass: 'src/assets/mw/source/Ebony_Plate_Cuirass.png',
  skirt: 'src/assets/mw/source/Ebony_Plate_Skirt.png',
  pauldron: 'src/assets/mw/source/Ebony_Plate_Pauldron.png',
  gauntlet: 'src/assets/mw/source/Ebony_Plate_Gauntlet.png',
  greave: 'src/assets/mw/source/Ebony_Plate_Greave.png',
  boot: 'src/assets/mw/source/Ebony_Plate_Boot.png',
  helm: 'src/assets/mw/source/Ebony_Plate_Helm.png',
});

export const textureName = (tex) => `ebony_plate_${tex}.dds`;
export const meshFile = (id) => `src/assets/mw/meshes/ebony_plate_${id}.nif`;
export const textureFile = (tex) => `src/assets/mw/textures/ebony_plate_${tex}.dds`;

const [, LEFT_THIGH, RIGHT_THIGH] = PLATE_RIG.skirt.bones;
const LEGS = Object.freeze([LEFT_THIGH.name, RIGHT_THIGH.name]);

export const EBONY_RIG = Object.freeze({
  cuirass: Object.freeze({ ...PLATE_RIG.cuirass, bones: Object.freeze([...PLATE_RIG.cuirass.bones, LEFT_THIGH, RIGHT_THIGH]),
    hang: Object.freeze({ mode: 'over', root: 'Bip01 Pelvis', legs: LEGS, top: 84, bottom: 62, share: 0.7, centre: 4 }) }),
  skirt: Object.freeze({ ...PLATE_RIG.skirt, hang: Object.freeze({ ...PLATE_RIG.skirt.hang, bottom: 60 }) }),
  pauldron_right: PLATE_RIG.pauldron_right,
  pauldron_left: PLATE_RIG.pauldron_left,
  gauntlet_right: PLATE_RIG.gauntlet_right,
  gauntlet_left: PLATE_RIG.gauntlet_left,
  greave_right: PLATE_RIG.greave_right,
  greave_left: PLATE_RIG.greave_left,
  boot_right: PLATE_RIG.boot_right,
  boot_left: PLATE_RIG.boot_left,
  helm: PLATE_RIG.helm_closed,
});

const shape = (object, texture, box, opts = {}) => Object.freeze({ object, texture, box: Object.freeze(box), ...opts });
const piece = (id, shapes, lift = 0) => Object.freeze({ id, shapes: Object.freeze(shapes), ...(lift ? { lift } : {}) });
export const PIECES = Object.freeze([
  piece('cuirass', [shape('Plane.001', 'cuirass', [[-14.37, -12.69, 62.3], [14.37, 12.59, 117.4]])]),
  piece('skirt', [shape('Imperial_Silver_Cuirass_67_Male.011', 'skirt', [[-12.64, -12.26, 59.96], [12.64, 12.21, 86.93]])]),
  piece('pauldron_right', [shape('Cube.028', 'pauldron', [[5.53, -10.32, 105.52], [30.56, 8.63, 118.88]])]),
  piece('pauldron_left', [shape('Cube.022', 'pauldron', [[-30.56, -10.32, 105.52], [-5.53, 8.63, 118.88]])]),
  piece('gauntlet_right', [shape('Imperial_Steel_Left_Gauntlet_20_Male.004', 'gauntlet', [[28.16, -4.3, 106.35], [59.97, 4.73, 115.35]])]),
  piece('gauntlet_left', [shape('Imperial_Steel_Left_Gauntlet_20_Male.005', 'gauntlet', [[-59.97, -4.3, 106.35], [-28.16, 4.73, 115.35]])]),
  piece('greave_right', [shape('Breton_Male.007', 'greave', [[0.53, -5.32, 42.68], [11.99, 8.2, 83.05]])]),
  piece('greave_left', [shape('Breton_Male.001', 'greave', [[-11.99, -5.32, 42.68], [-0.53, 8.2, 83.05]])]),
  piece('boot_right', [shape('Cube.027', 'boot', [[0.13, -6.48, -0.21], [11.33, 14.61, 48.13]])]),
  // The left boot's object also holds a stray island of the right boot, which `acrossTheMiddle` drops.
  piece('boot_left', [shape('Cube.024', 'boot', [[-11.33, -6.48, -0.21], [1.95, 14.61, 48.13]], { acrossTheMiddle: 'left' })]),
  piece('helm', [shape('Sphere.007', 'helm', [[-6.31, -6.64, 112.1], [6.31, 10.19, 133.37]])]),
]);

export const pieceMeshes = (tree, p) => p.shapes.map((s) => liftMesh(s.acrossTheMiddle ? dropAcross(bakeObject(tree, s.object, s.box), s.acrossTheMiddle) : bakeObject(tree, s.object, s.box), p.lift ?? 0));

export const MIDDLE_SLACK = 0.5;
export function dropAcross(mesh, side) {
  const P = mesh.positions; const I = mesh.indices; const n = P.length / 3;
  const across = (v) => (side === 'left' ? P[v * 3] > -MIDDLE_SLACK : P[v * 3] < MIDDLE_SLACK);
  const key = (v) => `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`;
  const first = new Map(); const id = new Int32Array(n);
  for (let v = 0; v < n; v++) { const k = key(v); if (!first.has(k)) first.set(k, v); id[v] = first.get(k); }
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  for (let t = 0; t < I.length; t += 3) { const a = find(id[I[t]]); parent[find(id[I[t + 1]])] = a; parent[find(id[I[t + 2]])] = a; }
  const wholly = new Map();
  for (let v = 0; v < n; v++) { const r = find(id[v]); wholly.set(r, (wholly.get(r) ?? true) && across(v)); }
  const kept = [];
  for (let t = 0; t < I.length; t += 3) if (!wholly.get(find(id[I[t]]))) kept.push(I[t], I[t + 1], I[t + 2]);
  const dropped = (I.length - kept.length) / 3;
  if (!dropped) return mesh;
  const remap = new Int32Array(n).fill(-1); const order = [];
  for (const v of kept) if (remap[v] < 0) { remap[v] = order.length; order.push(v); }
  const pick = (arr, k) => (arr ? Array.from({ length: order.length * k }, (_, i) => arr[order[Math.floor(i / k)] * k + (i % k)]) : arr);
  const positions = pick(P, 3);
  const min = [0, 1, 2].map((c) => +Math.min(...positions.filter((_, i) => i % 3 === c)).toFixed(6));
  const max = [0, 1, 2].map((c) => +Math.max(...positions.filter((_, i) => i % 3 === c)).toFixed(6));
  return {
    ...mesh, positions, indices: kept.map((v) => remap[v]), uvs: pick(mesh.uvs, 2), normals: pick(mesh.normals, 3),
    bounds: { min, max }, bake: { ...mesh.bake, dropped },
  };
}

export function pieceRig(id, meshes, bind) {
  const r = EBONY_RIG[id];
  if (!r) throw new Error(`no rig for the ebony ${id}`);
  const segments = rigSegments(r.bones, bind);
  return {
    shape: r.shape,
    weights: meshes.map((m) => jointWeights(m.positions, segments, { hang: r.hang ?? null })),
    bones: r.bones.map((b) => ({ name: b.name, bind: bind.get(b.name) })),
  };
}

export function bakeEbonyPlate({ source, pngs, skeleton }) {
  if (!skeleton) throw new Error('no skeleton to skin the plate in - the bake reads its bind (RETAIL_SKELETON)');
  const tree = readFbx(Buffer.from(source));
  const bind = plateBind(skeleton);
  const textures = Object.keys(TEXTURES).map((tex) => {
    if (!pngs[tex]) throw new Error(`no painting for the ebony ${tex}`);
    const png = readPng(pngs[tex]);
    return { tex, png, dds: writeDds(mipChain({ width: png.width, height: png.height, data: png.data })) };
  });
  const pieces = PIECES.map((p) => {
    const meshes = pieceMeshes(tree, p);
    const r = pieceRig(p.id, meshes, bind);
    const nif = skinnedMeshesToNif(p.shapes.map((s, i) => ({ mesh: meshes[i], texture: textureName(s.texture), name: `${r.shape} ${i}`, weights: r.weights[i] })),
      { node: `Ebony Plate ${p.id}`, bones: r.bones });
    return { id: p.id, meshes, weights: r.weights, nif };
  });
  return { pieces, textures, bind };
}

const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };

if (isMain(import.meta.url)) {
  const missing = Object.entries(TEXTURES).filter(([, p]) => !existsSync(p)).map(([t]) => t);
  if (missing.length) { console.error(`no painting yet for: ${missing.join(', ')}`); process.exit(1); }
  const r = bakeEbonyPlate({
    source: readFileSync(SOURCE),
    pngs: Object.fromEntries(Object.entries(TEXTURES).map(([t, p]) => [t, readFileSync(p)])),
    skeleton: readFileSync(RETAIL_SKELETON),
  });
  for (const p of r.pieces) {
    save(meshFile(p.id), p.nif);
    const tris = p.meshes.reduce((n, m) => n + m.indices.length / 3, 0);
    console.log(`  ${p.id.padEnd(15)} ${String(tris).padStart(4)} triangles -> ${meshFile(p.id)}  ${p.nif.length} bytes`);
  }
  for (const t of r.textures) {
    save(textureFile(t.tex), t.dds);
    console.log(`  ${t.tex.padEnd(15)} ${t.png.width}x${t.png.height} -> ${textureFile(t.tex)}  ${t.dds.length} bytes`);
  }
}
