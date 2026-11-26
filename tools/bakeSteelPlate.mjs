// Bakes the steel plate set's Morrowind NIFs and DDSs from the committed sources, or imports a new export first.
// Run: node tools/bakeSteelPlate.mjs [--sheets] [--import=<steel_armor.fbx>] [--open-helm=<export>].

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { readFbx, childrenNamed, nodeAt, objectName } from './fbxRead.mjs';
import { bakeMesh } from './fbxMesh.mjs';
import { stripFbx, meshModelNames } from './fbxStrip.mjs';
import { mipChain, writeDds } from './meshTexture.mjs';
import { skinnedMeshesToNif } from './nifWrite.mjs';
import { jointWeights } from './skinWeights.mjs';
import { previewSheet } from './meshSheets.mjs';
import { readPng, writePng } from './pngIO.mjs';
import { isMain } from './lib/isMain.mjs';
import { parseNif } from '../src/formats/mwNifFile.js';
import { affineOfTransform } from '../src/formats/mwAffine.js';

export const SOURCE = Object.freeze({
  set: 'src/assets/mw/source/Steel_Plate.fbx',
  openHelm: 'src/assets/mw/source/Steel_Plate_Open_Helm.fbx',
});

export const TEXTURES = Object.freeze({
  cuirass: 'src/assets/mw/source/Steel_Plate_Cuirass.png',
  pauldron: 'src/assets/mw/source/Steel_Plate_Pauldron.png',
  gauntlet: 'src/assets/mw/source/Steel_Plate_Gauntlet.png',
  greave: 'src/assets/mw/source/Steel_Plate_Greave.png',
  boot: 'src/assets/mw/source/Steel_Plate_Boot.png',
  helm: 'src/assets/mw/source/Steel_Plate_Helm.png',
  visor: 'src/assets/mw/source/Steel_Plate_Visor.png',
  skirt: 'src/assets/mw/source/Steel_Plate_Skirt.png',
});

export const textureName = (tex) => `steel_plate_${tex}.dds`;
export const meshFile = (id) => `src/assets/mw/meshes/steel_plate_${id}.nif`;
export const textureFile = (tex) => `src/assets/mw/textures/steel_plate_${tex}.dds`;

export const SETTINGS = Object.freeze({ placement: 'scene', forward: '+y', up: '+z' });

export const REFERENCE_PARTS = Object.freeze({ head: 'Breton_Male.003', neck: 'Breton_Male.006' });

export const SCENE_BODY = Object.freeze({
  head: Object.freeze({ min: Object.freeze([-4.764463, -5.649226, 113.146219]), max: Object.freeze([4.764463, 9.197224, 129.199977]) }),
  neck: Object.freeze({ min: Object.freeze([-3.895279, -4.097911, 109.962381]), max: Object.freeze([3.895279, 3.687286, 121.834567]) }),
});

export const RETAIL_SKELETON = 'vendor/weapon-sheathing/Data Files/Animations/xbase_anim/xbase_anim_sh.nif';

export const SCENE_FROM_BIND = Object.freeze([0, 2.5, 98.55]);

const rigidInverse = ({ a, t }) => {
  const r = [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
  return { a: r, t: [-(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]), -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]), -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2])] };
};

export function retailBind(skeletonBytes) {
  const nif = parseNif(new Uint8Array(skeletonBytes));
  const shadow = nif.records.find((r) => r?.type === 'NiTriShape' && r.name === 'Tri Shadow' && r.skin >= 0);
  if (!shadow) throw new Error('this skeleton carries no skinned "Tri Shadow" to read the bind from');
  const skin = nif.records[shadow.skin];
  const data = nif.records[skin.data];
  const identity = (tr) => tr.scale === 1 && tr.translation.every((v) => v === 0) && [1, 0, 0, 0, 1, 0, 0, 0, 1].every((v, i) => tr.rotation[i] === v);
  if (!identity(shadow) || !identity(data.transform)) throw new Error('the Tri Shadow is moved or turned - its binds stand in another frame');
  const bind = new Map();
  skin.bones.forEach((ref, i) => {
    const tr = data.bones[i].transform;
    if (Math.abs(tr.scale - 1) > 1e-6) throw new Error(`"${nif.records[ref].name}" is bound at scale ${tr.scale}`);
    bind.set(nif.records[ref].name, rigidInverse(affineOfTransform(tr)));
  });
  return bind;
}

export function plateBind(skeletonBytes) {
  return new Map([...retailBind(skeletonBytes)].map(([name, m]) => [name, { a: Array.from(m.a), t: m.t.map((v, k) => v + SCENE_FROM_BIND[k]) }]));
}

const bone = (name, to, joint = null) => Object.freeze({ name, to, ...(joint ? { parent: joint[0], blend: joint[1] } : {}) });
const SPINE = Object.freeze([
  bone('Bip01 Pelvis', 'Bip01 Spine'),
  bone('Bip01 Spine', 'Bip01 Spine1', ['Bip01 Pelvis', 3]),
  bone('Bip01 Spine1', 'Bip01 Spine2', ['Bip01 Spine', 3]),
  bone('Bip01 Spine2', 'Bip01 Neck', ['Bip01 Spine1', 3]),
  bone('Bip01 Neck', 'Bip01 Head', ['Bip01 Spine2', 2]),
]);
const limbs = (S) => {
  const b = (n) => `Bip01 ${S} ${n}`;
  return {
    clavicle: (joint) => bone(b('Clavicle'), b('UpperArm'), joint),
    upperArm: bone(b('UpperArm'), b('Forearm'), [b('Clavicle'), 2.5]),
    forearm: bone(b('Forearm'), b('Hand')),
    hand: [
      bone(b('Hand'), { mid: [b('Finger1'), b('Finger2')] }, [b('Forearm'), 1.5]),
      bone(b('Finger0'), b('Finger01'), [b('Hand'), 1]), bone(b('Finger01'), { local: [2.5, 0, 0] }, [b('Finger0'), 0.75]),
      bone(b('Finger1'), b('Finger11'), [b('Hand'), 1]), bone(b('Finger11'), { local: [2.5, 0, 0] }, [b('Finger1'), 0.75]),
      bone(b('Finger2'), b('Finger21'), [b('Hand'), 1]), bone(b('Finger21'), { local: [2.5, 0, 0] }, [b('Finger2'), 0.75]),
    ],
    thigh: bone(b('Thigh'), b('Calf')),
    calf: bone(b('Calf'), b('Foot'), [b('Thigh'), 3]),
    foot: bone(b('Foot'), { local: [5.5, 9, 0] }, [b('Calf'), 2]),
  };
};
const R = limbs('R');
const L = limbs('L');
const rig = (shape, bones, hang = null) => Object.freeze({ shape, bones: Object.freeze(bones), ...(hang ? { hang: Object.freeze(hang) } : {}) });

export const PLATE_RIG = Object.freeze({
  cuirass: rig('Tri Chest', [...SPINE, R.clavicle(['Bip01 Spine2', 2]), L.clavicle(['Bip01 Spine2', 2])]),
  skirt: rig('Tri Groin', [SPINE[0], L.thigh, R.thigh], { root: 'Bip01 Pelvis', legs: ['Bip01 L Thigh', 'Bip01 R Thigh'], top: 84, bottom: 64.5, share: 0.7, centre: 4 }),
  pauldron_right: rig('Tri Right Clavicle', [R.clavicle(), R.upperArm]),
  pauldron_left: rig('Tri Left Clavicle', [L.clavicle(), L.upperArm]),
  gauntlet_right: rig('Tri Right Hand', [R.forearm, ...R.hand]),
  gauntlet_left: rig('Tri Left Hand', [L.forearm, ...L.hand]),
  greave_right: rig('Tri Right Upper Leg', [R.thigh, R.calf]),
  greave_left: rig('Tri Left Upper Leg', [L.thigh, L.calf]),
  boot_right: rig('Tri Right Foot', [R.thigh, R.calf, R.foot]),
  boot_left: rig('Tri Left Foot', [L.thigh, L.calf, L.foot]),
  helm_open: rig('Tri Hair', [bone('Bip01 Head', { local: [10, 0, 0] })]),
  helm_closed: rig('Tri Hair', [bone('Bip01 Head', { local: [10, 0, 0] })]),
});

export function rigSegments(rigBones, bind) {
  const origin = (name) => {
    const m = bind.get(name);
    if (!m) throw new Error(`the bind has no "${name}"`);
    return m.t;
  };
  const end = (b) => {
    if (typeof b.to === 'string') return origin(b.to);
    if (b.to.mid) { const [p, q] = b.to.mid.map(origin); return [0, 1, 2].map((k) => (p[k] + q[k]) / 2); }
    const m = bind.get(b.name); const l = b.to.local;
    return [0, 1, 2].map((k) => m.a[k * 3] * l[0] + m.a[k * 3 + 1] * l[1] + m.a[k * 3 + 2] * l[2] + m.t[k]);
  };
  return rigBones.map((b) => ({ ...b, from: origin(b.name), to: end(b) }));
}

export const BOX_SLACK = 0.02;

const shape = (object, texture, box) => Object.freeze({ object, texture, box: Object.freeze(box) });
const piece = (id, file, shapes, lift = 0) => Object.freeze({ id, file, shapes: Object.freeze(shapes), ...(lift ? { lift } : {}) });

// The game draws the head higher on its bone than the scene did, so the open helm is raised this far. The closed
// helm hides the head and keeps the scene placement.
export const HELM_LIFT = 4;

export const PIECES = Object.freeze([
  piece('cuirass', 'set', [
    shape('Imperial_Silver_Cuirass_67_Male.013', 'cuirass', [[-16.61, -11.94, 78.8], [16.61, 11.46, 115.42]]),
    shape('Imperial_Silver_Cuirass_67_Male.012', 'cuirass', [[-10.69, -9.98, 85.82], [10.44, 10.28, 89.57]]),
  ]),
  piece('skirt', 'set', [shape('Imperial_Silver_Cuirass_67_Male.011', 'skirt', [[-14.42, -11.98, 64.55], [14.42, 12.17, 86.93]])]),
  piece('pauldron_right', 'set', [shape('Breton_Male.009 Remeshed.003', 'pauldron', [[6.43, -9.1, 106.74], [30.56, 7.55, 118.82]])]),
  piece('pauldron_left', 'set', [shape('Breton_Male.009 Remeshed.001', 'pauldron', [[-30.56, -9.1, 106.74], [-6.43, 7.55, 118.82]])]),
  piece('gauntlet_right', 'set', [shape('Imperial_Steel_Left_Gauntlet_20_Male', 'gauntlet', [[27.03, -5.81, 106.44], [59.04, 4.56, 115.56]])]),
  piece('gauntlet_left', 'set', [shape('Imperial_Steel_Left_Gauntlet_20_Male.001', 'gauntlet', [[-59.04, -5.81, 106.44], [-27.03, 4.56, 115.56]])]),
  piece('greave_right', 'set', [shape('Breton_Male.007', 'greave', [[0.53, -5.13, 39.78], [11.9, 8.05, 79.72]])]),
  piece('greave_left', 'set', [shape('Breton_Male.001', 'greave', [[-11.9, -5.13, 39.78], [-0.53, 8.05, 79.72]])]),
  piece('boot_right', 'set', [shape('Cube.024', 'boot', [[0.32, -6.48, -0.21], [11.33, 14.61, 48.13]])]),
  piece('boot_left', 'set', [shape('Cube.019', 'boot', [[-11.33, -6.48, -0.21], [-0.32, 14.61, 48.13]])]),
  piece('helm_open', 'openHelm', [shape('Sphere.002', 'helm', [[-7.5, -7.93, 112.88], [7.5, 9.22, 131.82]])], HELM_LIFT),
  piece('helm_closed', 'set', [
    shape('Sphere', 'helm', [[-7.5, -7.93, 113.88], [7.5, 8.95, 132.82]]),
    shape('Sphere.001 Remeshed Remeshed', 'visor', [[-5.07, -8.02, 112.58], [6.82, 10.29, 140.61]]),
  ]),
]);

export function objectTree(tree, name) {
  const objects = nodeAt(tree.nodes, 'Objects');
  const model = childrenNamed(objects, 'Model').find((m) => m.props[2] === 'Mesh' && objectName(m.props[1]) === name);
  if (!model) throw new Error(`no Mesh object "${name}" in this export`);
  const id = String(model.props[0]);
  const keep = new Set([id]);
  for (const c of childrenNamed(nodeAt(tree.nodes, 'Connections'), 'C')) {
    if (c.props[0] === 'OO' && String(c.props[2]) === id) keep.add(String(c.props[1]));
  }
  const only = { ...objects, children: objects.children.filter((o) => keep.has(String(o.props[0])) && (o.name === 'Geometry' || o.name === 'Model')) };
  return { ...tree, nodes: tree.nodes.map((n) => (n === objects ? only : n)) };
}

export function bakeObject(tree, name, box = null) {
  const mesh = bakeMesh(objectTree(tree, name), { name, ...SETTINGS });
  if (box) {
    const off = [0, 1, 2].flatMap((k) => [Math.abs(mesh.bounds.min[k] - box[0][k]), Math.abs(mesh.bounds.max[k] - box[1][k])]);
    if (Math.max(...off) > BOX_SLACK) {
      throw new Error(`"${name}" stands at ${JSON.stringify(mesh.bounds)}, not where its piece was read (${JSON.stringify(box)}) - re-read the export before baking it`);
    }
  }
  return mesh;
}

export function liftMesh(mesh, lift) {
  if (!lift) return mesh;
  const up = (v) => +(v + lift).toFixed(6);
  return {
    ...mesh,
    positions: mesh.positions.map((v, i) => (i % 3 === 2 ? up(v) : v)),
    bounds: { min: [mesh.bounds.min[0], mesh.bounds.min[1], up(mesh.bounds.min[2])], max: [mesh.bounds.max[0], mesh.bounds.max[1], up(mesh.bounds.max[2])] },
  };
}

export const pieceMeshes = (trees, p) => p.shapes.map((s) => liftMesh(bakeObject(trees[p.file], s.object, s.box), p.lift ?? 0));

export function pieceRig(id, meshes, bind) {
  const r = PLATE_RIG[id];
  if (!r) throw new Error(`no rig for the ${id}`);
  const segments = rigSegments(r.bones, bind);
  return {
    shape: r.shape,
    weights: meshes.map((m) => jointWeights(m.positions, segments, { hang: r.hang ?? null })),
    bones: r.bones.map((b) => ({ name: b.name, bind: bind.get(b.name) })),
  };
}

export function bakeSteelPlate({ set, openHelm, pngs, skeleton }, { sheets = false } = {}) {
  if (!skeleton) throw new Error('no skeleton to skin the plate in - the bake reads its bind (RETAIL_SKELETON)');
  if (!set || !openHelm) throw new Error('the bake reads two sources - the set (SOURCE.set) and the open helm (SOURCE.openHelm)');
  const trees = { set: readFbx(Buffer.from(set)), openHelm: readFbx(Buffer.from(openHelm)) };
  const bind = plateBind(skeleton);
  const textures = Object.keys(TEXTURES).map((tex) => {
    if (!pngs[tex]) throw new Error(`no painting for the ${tex} texture`);
    const png = readPng(pngs[tex]);
    return { tex, png, dds: writeDds(mipChain({ width: png.width, height: png.height, data: png.data })) };
  });
  const byTex = new Map(textures.map((t) => [t.tex, t]));
  const pieces = PIECES.map((p) => {
    const meshes = pieceMeshes(trees, p);
    const r = pieceRig(p.id, meshes, bind);
    const nif = skinnedMeshesToNif(p.shapes.map((s, i) => ({ mesh: meshes[i], texture: textureName(s.texture), name: `${r.shape} ${i}`, weights: r.weights[i] })),
      { node: `Steel Plate ${p.id}`, bones: r.bones });
    const out = { id: p.id, meshes, weights: r.weights, nif };
    if (sheets) {
      const t = byTex.get(p.shapes[0].texture).png;
      out.sheet = writePng(previewSheet(meshes[0], 360, { width: t.width, height: t.height, data: t.data }));
    }
    return out;
  });
  return { pieces, textures, bind };
}

export function measureReference(tree, parts = REFERENCE_PARTS) {
  return Object.fromEntries(Object.entries(parts).map(([part, name]) => [part, bakeObject(tree, name).bounds]));
}

export function importSteelPlate(bytes, { pieces = PIECES, reference = REFERENCE_PARTS } = {}) {
  const names = meshModelNames(bytes);
  const shapes = pieces.filter((p) => p.file === 'set').flatMap((p) => p.shapes);
  const missing = shapes.filter((x) => !names.includes(x.object)).map((x) => `"${x.object}"`);
  if (missing.length) throw new Error(`this is not the steel-plate export - it carries no ${missing.join(', ')}`);
  const tree = readFbx(Buffer.from(bytes));
  for (const x of shapes) bakeObject(tree, x.object, x.box);
  const carried = Object.fromEntries(Object.entries(reference).filter(([, name]) => names.includes(name)));
  const drop = Object.values(carried);
  const read = new Set([...shapes.map((x) => x.object), ...drop]);
  return {
    set: drop.length ? stripFbx(bytes, { drop }).bytes : Buffer.from(bytes),
    reference: drop.length ? measureReference(tree, carried) : null,
    unread: names.filter((n) => !read.has(n)),
  };
}

export function openHelmSource(bytes, { pieces = PIECES } = {}) {
  const keep = new Set(pieces.filter((p) => p.file === 'openHelm').flatMap((p) => p.shapes.map((x) => x.object)));
  const names = meshModelNames(bytes);
  const absent = [...keep].filter((n) => !names.includes(n));
  if (absent.length) throw new Error(`this export carries no open helm (${absent.map((n) => `"${n}"`).join(', ')})`);
  return stripFbx(bytes, { drop: names.filter((n) => !keep.has(n)) }).bytes;
}

const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d = null) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
  const imp = opt('import');
  const imported = imp ? importSteelPlate(readFileSync(imp)) : null;
  const openFrom = opt('open-helm');
  const openHelm = openFrom ? openHelmSource(readFileSync(openFrom)) : null;
  const missing = Object.entries(TEXTURES).filter(([, p]) => !existsSync(p)).map(([t]) => t);
  if (missing.length) { console.error(`no painting yet for: ${missing.join(', ')} (${missing.map((t) => TEXTURES[t]).join(', ')})`); process.exit(1); }
  const wantSheets = args.includes('--sheets');
  // Nothing is saved until the whole bake succeeds, so a refused import or open helm leaves the tree unchanged.
  const r = bakeSteelPlate({
    set: imported ? imported.set : readFileSync(SOURCE.set), openHelm: openHelm ?? readFileSync(SOURCE.openHelm),
    pngs: Object.fromEntries(Object.entries(TEXTURES).map(([t, p]) => [t, readFileSync(p)])),
    skeleton: readFileSync(RETAIL_SKELETON),
  }, { sheets: wantSheets });
  if (imported) {
    save(SOURCE.set, imported.set);
    console.log(`${SOURCE.set}  ${imported.set.length} bytes: ${meshModelNames(imported.set).join(', ')}`);
    if (imported.unread.length) console.log(`  read by no piece, kept in the source: ${imported.unread.join(', ')}`);
    if (imported.reference) {
      console.log('  the reference body, stripped - its bounds for SCENE_BODY:');
      for (const [part, b] of Object.entries(imported.reference)) console.log(`    ${part}: min ${JSON.stringify(b.min)} max ${JSON.stringify(b.max)}`);
    }
  }
  if (openHelm) {
    save(SOURCE.openHelm, openHelm);
    console.log(`${SOURCE.openHelm}  ${openHelm.length} bytes: ${meshModelNames(openHelm).join(', ')}`);
  }
  for (const p of r.pieces) {
    save(meshFile(p.id), p.nif);
    const tris = p.meshes.reduce((n, m) => n + m.indices.length / 3, 0);
    console.log(`  ${p.id.padEnd(15)} ${String(tris).padStart(4)} triangles -> ${meshFile(p.id)}  ${p.nif.length} bytes`);
    if (wantSheets) save(`scratch/steel-plate-${p.id}.png`, p.sheet);
  }
  for (const t of r.textures) {
    save(textureFile(t.tex), t.dds);
    console.log(`  ${t.tex.padEnd(15)} ${t.png.width}x${t.png.height} -> ${textureFile(t.tex)}  ${t.dds.length} bytes`);
  }
}
